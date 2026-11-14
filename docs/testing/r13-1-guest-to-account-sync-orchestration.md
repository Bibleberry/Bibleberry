# Bibleberry R13-1 — Guest-to-Account Sync Orchestration & Mock Authorized Transport

**Issue:** [#131](https://github.com/ContraPhilosophy/Bibleberry/issues/131) (`R13-1` / Phase 05)  
**Verified Baseline `origin/main`:** `c1c31e76336c0ce195db5202949058e6e6a3c082`  
**Scope Boundary:** Narrow asynchronous `AuthorizedAccountTransport` contract, deterministic `GuestToAccountSyncCoordinator` orchestration engine, safe guest storage clearance guard integration, deterministic mock transport implementation, and rigorous automated test suite. Zero live network clients, real credentials, Supabase provisioning, schema migrations, or app-wide UI changes are introduced.

---

## 1. Purpose and Architectural Boundary

Bibleberry Issue [#131](https://github.com/ContraPhilosophy/Bibleberry/issues/131) provides the asynchronous, provider-neutral orchestration layer wrapping the accepted **R13-0 pure reconciliation engine** ([PR #118](https://github.com/ContraPhilosophy/Bibleberry/pull/118), [`src/accountSync/reconcile.ts`](../../src/accountSync/reconcile.ts)).

This layer establishes safe sequencing and verifiable idempotency for future authenticated reader sign-in without premature backend lock-in or live service writes.

### Core Non-Negotiables Enforced

1. **Strict guest data retention:** Local guest participation records remain intact on the device until an authorized remote commit is verified by a matching `CommitAckReceipt` and validated through `canSafelyClearGuestStorage`.
2. **Never silently drop or duplicate accomplishments:** Challenge completions, Saved Scripture, earned Scripture Cards, and reading positions are reconciled deterministically per R13-0 rules:
   - Account Shelf precedence is preserved (`0–3` months; existing account Shelf wins).
   - Duplicate completions union by canonical ID; dates preserve credible server provenance.
   - Earned Scripture Cards preserve monotonic presentation flags (`cardViewed`, `hubAnnouncementAcked`) independently.
3. **No secrets or account IDs in logs:** Account IDs (UUIDs) and authorization tokens are strictly redacted and masked across all diagnostic and logging outputs.
4. **Optimistic concurrency & revision-aware compare-and-commit:** Commits require `expectedRevision`. Remote revision conflicts (`409 Conflict`) trigger automatic re-fetch and re-merge up to configured retry limits.
5. **No live network or credential dependencies:** All code in `src/accountSync/**` is completely isolated from browser DOM globals (`window`, `document`, `localStorage`), React runtime, Capacitor plugins, Supabase client SDKs, or Node runtime APIs.

---

## 2. Technical Design & Interfaces

### 2.1 Authorized Account Transport (`src/accountSync/transport.ts`)

Defines the asynchronous boundary between the reader application and remote account authority:

```typescript
export interface AuthorizedAccountSession {
  readonly accountId: AccountId
  readonly token?: string
  readonly expiresAt?: number
}

export interface AuthorizedAccountTransport {
  getAccount(
    session: AuthorizedAccountSession,
    options?: AccountFetchOptions,
  ): Promise<AccountTransportFetchResult>

  commitAccount(
    session: AuthorizedAccountSession,
    payload: AccountTransportCommitPayload,
    options?: AccountCommitOptions,
  ): Promise<AccountTransportCommitResult>
}
```

- **`AccountTransportFetchResult`:** Statuses include `found` (with envelope and revision), `notFound` (brand-new account), `unauthorized` (auth failure), `networkError` (recoverable), or `aborted`.
- **`AccountTransportCommitResult`:** Statuses include `committed`, `alreadyCommittedDuplicate` (idempotent replay), `conflict` (revision mismatch), `unauthorized`, `rejected`, `networkError`, or `aborted`.
- **`MockAuthorizedAccountTransport`:** In-memory deterministic mock supporting initial seeding, optimistic concurrency enforcement, receipt cache indexing, and failure injection hooks (`conflictOnCommit`, `commitNetworkError`, `fetchNetworkError`, `authError`, `unresolvedPersistedOnServer`).

### 2.2 Synchronization Coordinator (`src/accountSync/coordinator.ts`)

Orchestrates the end-to-end guest-to-account synchronization workflow:

```typescript
export async function coordinateGuestSync(
  transport: AuthorizedAccountTransport,
  input: CoordinateGuestSyncInput,
  options?: CoordinateGuestSyncOptions,
): Promise<CoordinateGuestSyncOutcome>
```

#### Orchestration Steps

```
[Guest Storage Snapshot]
         │
         ▼
[Session Validation] ──(invalid account ID)──► Fail Closed ('invalidSession')
         │
         ▼
[Fetch Remote Account] ──(network/auth error)──► Fail Recoverable / Retain Guest Data
         │
         ▼
[Mode Resolution (auto / new / existing)]
         │
         ▼
[Pure Reconciliation (reconcileGuestIntoAccount)] ──(rejected)──► Fail Closed ('reconciliationRejected')
         │
         ▼
[Compare-and-Commit to Transport]
    ├── (409 Revision Conflict) ──► Re-fetch latest account and re-reconcile (up to maxRetries)
    ├── (Network Drop) ───────────► Retry commit with identical idempotencyKey
    └── (Committed / Duplicate) ──► Proceed to Safe Clearance Guard
                                             │
                                             ▼
                          [canSafelyClearGuestStorage]
                                 ├── (Mismatch / Mutated / Unpersisted) ──► Retain Guest Data
                                 └── (Verified Durable Commit) ──────────► Safely Clear Guest Storage
```

1. **Session validation:** Validates `session.accountId` against UUID format; rejects invalid IDs before any transport call.
2. **Initial guest snapshot:** Captures guest participation state and derives canonical fingerprint via `computeGuestPayloadFingerprint`.
3. **Idempotency key generation:** Allocates stable idempotency key for the sync attempt.
4. **Remote account retrieval:** Queries transport for remote account state at revision $R$.
5. **Mode adjudication:**
   - `newAccountTransfer`: verifies remote account is empty (zero participation records and absent Shelf) or non-existent; initializes fresh envelope at revision 0. Rejects existing accounts with prior records or explicit Shelf state.
   - `existingAccountMerge`: verifies remote account exists.
   - `auto`: dynamically distinguishes genuinely new accounts (not found in remote storage, or present with absent Shelf and zero records) from existing accounts. When an existing account holds an explicit Shelf state (including an explicitly empty Shelf `shelf: { months: [] }`), `auto` selects `existingAccountMerge` to guarantee account-first Shelf precedence per November 8 / R13-0 rules.
6. **Pure reconciliation:** Executes `reconcileGuestIntoAccount` without side effects. If reconciliation fails closed (schema mismatch, cross-namespace claim), coordinator aborts and retains guest data.
7. **Revision-aware commit:** Sends reconciled envelope with `expectedRevision: R`.
   - On revision conflict: re-fetches latest remote state, re-runs reconciliation, and re-submits up to `maxRetries` (default: 3).
   - On network drop: retries with identical idempotency key; server returns cached receipt if previous commit succeeded.
8. **Durable acknowledgment & safe clearance:**
   - Re-checks guest storage snapshot to detect in-flight local modifications.
   - Evaluates `canSafelyClearGuestStorage`.
   - Guest data is erased **only** if all 7 safety invariants pass:
     1. Valid account ID verified.
     2. Reconciliation was clean/eligible.
     3. Receipt status is `committed` or `alreadyCommittedDuplicate`.
     4. Account ID matches authenticated session.
     5. Idempotency key matches request.
     6. Guest fingerprint matches committed payload.
     7. No in-flight local mutations occurred (`localGuestMutatedInFlight` blocks clearance).
     8. Durable revision is $\ge 1$.
     9. Server persisted all unresolved items (`unresolvedPersistedOnServer: true`).

---

## 3. Privacy, Security & Dependency Boundary

- **Log Sanitization:** [`src/accountSync/transport.ts`](../../src/accountSync/transport.ts) defines `sanitizeLogMessage` and `maskAccountId`. Regex filters replace raw UUIDs with `[REDACTED_ACCOUNT_ID]` and authorization tokens with `[REDACTED_TOKEN]`.
- **Zero Forbidden Globals:** Validated by automated tests across all files in `src/accountSync/**`:
  - Zero imports from `@supabase/`, `@capacitor/`, `react`, or `node:`.
  - Zero accesses to `localStorage`, `sessionStorage`, `indexedDB`, `window`, or `document`.

---

## 4. Test Evidence & Verification

### 4.1 Automated Test Execution

Tests were executed using Node's native test runner with experimental TypeScript stripping:

```bash
node --experimental-strip-types --test tests/accountSync/*.test.ts
```

Output:

```
▶ R13-1 Guest-to-Account Sync Orchestration
  ✔ first-account creation (newAccountTransfer) moves accomplishments and safely clears guest storage (11.454295ms)
  ✔ existing-account merge combines accomplishments, preserves existing account shelf, and advances revision (1.884763ms)
  ✔ auto mode selects existingAccountMerge when existing account has explicitly empty shelf ({ months: [] }), preserving account shelf precedence over guest shelf (1.606773ms)
  ✔ auto mode selects newAccountTransfer when existing account has absent shelf and zero records, transferring guest shelf (1.730766ms)
  ✔ explicit newAccountTransfer rejects existing account with explicitly empty shelf ({ months: [] }) (0.525938ms)
  ✔ isAccountEmpty correctly distinguishes explicit empty shelf from absent shelf and other preferences (0.234691ms)
  ✔ duplicate submission with same idempotency key returns cached receipt without bumping revision or corrupting data (2.464455ms)
  ✔ idempotency key reuse with differing payload rejects with conflict without mutating account (3.633472ms)
  ✔ concurrent revision conflict automatically re-merges and succeeds on retry (1.642957ms)
  ✔ persistent conflict exceeding maxRetries stops and preserves guest records intact (1.446142ms)
  ✔ network failure during commit retries and recovers when retry succeeds (1.679421ms)
  ✔ permanent network failure returns recoverable networkError and leaves guest data intact (0.42666ms)
  ✔ authorization failure halts immediately without retries and preserves guest records (0.769974ms)
  ✔ invalid session account ID fails closed with zero transport calls (0.196593ms)
  ✔ target account with prior data rejects explicit newAccountTransfer and preserves guest data (0.472175ms)
  ✔ local in-flight mutation blocks guest clearance even after successful remote commit (1.165228ms)
  ✔ unresolved reconciliation items unpersisted on server blocks guest clearance (1.085783ms)
  ✔ abort signal immediately cancels sync and preserves guest records (0.89782ms)
  ✔ privacy & security: no account IDs, UUIDs, or tokens leak into logged messages (1.272824ms)
  ✔ strict dependency isolation: src/accountSync/** contains zero browser, react, capacitor, or node dependencies (1.235761ms)
✔ R13-1 Guest-to-Account Sync Orchestration (38.237014ms)
ℹ tests 20
ℹ suites 1
ℹ pass 20
ℹ fail 0
```

### 4.2 Full Regression Suite & Build

1. **Adapter Test Suite:**
   ```bash
   npm run test:adapter
   # 270 passed, 0 failed (4084ms)
   ```
2. **ESLint Static Analysis:**
   ```bash
   npm run lint
   # 0 errors, 0 warnings
   ```
3. **Production TypeScript & Vite Build:**
   ```bash
   npm run build
   # tsc -b && vite build: built in 4.13s (dist/ produced cleanly)
   ```

---

## 5. Follow-On Gates & Backend Decisions Register

The following architecture and implementation decisions remain deferred as follow-on gates before live production sync:

1. **Authentication Provider & Token Lifecycle (R13-2):**
   - Specification of real session provider (Supabase GoTrue JWTs vs custom token exchange).
   - Refresh token rotation and automatic transport re-authentication policy.
2. **Database Migration & RLS Schema (R13-3):**
   - Execution of PostgreSQL DDL for tables specified in R13-0 §3:
     - `account_participation_profiles`
     - `account_completed_challenges`
     - `account_in_progress_challenges`
     - `account_saved_challenges`
     - `account_saved_scriptures`
     - `account_earned_awards`
     - `account_shelf_months`
     - `account_reconciliation_receipts`
   - Row-Level Security (`auth.uid() = account_id`) rules.
3. **Cross-Device Unsave & Tombstones (R13-4):**
   - Designing explicit tombstone mechanisms for removing saved Scripture or challenges across multiple client devices without regression on sync.
4. **Client UI State & Sign-In Prompts (R13-5):**
   - Designing the non-compulsory reader account creation / login sheet and sync indicator UI.
   - Jittered exponential backoff configuration for mobile network transitions.
