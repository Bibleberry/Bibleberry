# Bibleberry R13-TX1 — Authenticated Atomic Account Reconciliation Transaction (Backend Handoff)

> **Issue:** [#206](https://github.com/Bibleberry/Bibleberry/issues/206) (Phase 05 / R13-TX1)
> **Baseline `main`:** `ffc76fa8` (R13-3 schema/RLS from PR #164 and the R13-2a auth session layer from PR #182 already merged)
> **Scope:** forward-only SQL migration, local-only PostgreSQL test suites/runner, and this note.
> **Not included:** live Supabase provisioning, remote SQL, credentials, OAuth/OTP, account UI, the real `AuthorizedAccountTransport` adapter, deployment, or any `src/**` change.

---

## 1. What was built

| Artifact | Purpose |
| --- | --- |
| `supabase/migrations/20261118000001_r13_tx1_account_reconciliation_transaction.sql` | `public.reconcile_guest_participation(jsonb)` (atomic compare-and-commit), `public.get_account_participation()` (RLS read), `account_reconciler` owner role, `account_private` validation helpers, 2 narrow columns, 1 unresolved-evidence table and 1 award-claim quarantine table (`account_provisional_award_claims`). |
| `tests/accountDatabase/02_r13_tx1_auth_grants_and_isolation.sql` | Security boundary only: definer/owner/search_path, grants, RLS, anon/PUBLIC/service_role denial, forged IDs, owner isolation, RLS confinement of the elevated role, isolation-level fail-closed. |
| `tests/accountDatabase/03_r13_tx1_transaction_invariants.sql` | Data invariants: transfer/merge, idempotency, lost ACK, stale revision, provenance, awards, positions, saves, Shelf, validation, date bounds, injected rollback. |
| `tests/accountDatabase/04_r13_tx1_concurrency.sh` | Real concurrent backends: first-profile race, double-tap, blocked writer, retrying writers. |
| `scripts/accountDatabase/run-local-transaction-tests.sh` (+ `lib/local-target-guard.sh`) | Fresh-local-DB runner reusing the R13-3 loopback/socket guard (now shared, behaviour unchanged). |

## 2. Hard trust boundaries (restated)

1. **Identity = `auth.uid()` only.** `accountId` in the payload or envelope is never authority; if present and different from `auth.uid()` the call returns `unauthorized/accountMismatch` and writes nothing. No `account_id` parameter exists.
2. **Clients never write tables.** R13-3's `SELECT`-only grants and owner `SELECT` policies are untouched; the new evidence table follows the same model.
3. **Submitted envelope = untrusted candidate records.** The R13-1 coordinator sends a client-*premerged* envelope. The server does not adopt it: every record is re-validated and re-merged under server rules against the locked server rows (union only, never delete, never regress, existing dates immutable).
4. **Server never mints `serverVerified`.** All client dates are stored `clientReported` (claimed date kept in `client_claimed_on`); a client `serverVerified` claim is downgraded. Existing `serverVerified` rows are never lowered.
5. **Client claims never establish award eligibility.** There is no trusted CMS discovery/roster projection server-side, and R08A-0 §6.2 requires the account service to derive/verify `earned_awards` against one. So a new award claim is **quarantined** in `account_provisional_award_claims` and never written to `account_earned_awards`; the transaction role has no `INSERT` on that table at all. It never appears in `earnedAwards`, and the commit requires guest retention (§6). (Added after review of PR #207.)
6. **Fail closed.** Any malformed, forbidden, cross-namespace or out-of-bounds record rejects the whole commit (`rejected`, `guestRetentionRequired: true`) with zero writes, so guest data stays retriable.

## 3. SQL contract

### 3.1 `public.reconcile_guest_participation(p_payload jsonb) RETURNS jsonb`

Input mirrors `AccountTransportCommitPayload` (camelCase):
`{ accountId?, expectedRevision, envelope: {schemaVersion: 1, namespace: 'cms', accountId?, revision?, data}, idempotencyKey, guestPayloadFingerprint, mode, unresolvedItems? }`.

Order of evaluation (all inside one READ COMMITTED transaction):

1. `auth.uid()` null → `unauthorized/unauthenticated`. Non-READ COMMITTED → `rejected/unsupportedTransactionIsolation`.
2. Header validation: object, ≤ 1 MiB, known keys only, account claims, key `^[A-Za-z0-9._:-]{1,128}$`, fingerprint `^[0-9a-f]{64}$` (R13-0 SHA-256), mode, **explicit** integral `expectedRevision ≥ 0`.
3. `pg_advisory_xact_lock(hashtextextended('bibleberry:account_reconcile:' || uid, 0))` — serializes all callers for one account, including first-profile creation where no row exists to lock. Hash collisions only serialize unrelated accounts; they never share data.
4. **Receipt replay before revision check**: `(auth.uid(), idempotencyKey)` found → same digest ⇒ `alreadyCommittedDuplicate` with the *original* receipt; different digest ⇒ `conflict/idempotencyPayloadMismatch`. (Necessary because the coordinator re-fetches after a lost ACK and retries the same key at the newer revision.)
5. `SELECT … FOR UPDATE` profile; `expectedRevision ≠ current` ⇒ `conflict/revisionMismatch` with `currentRevision` + `currentEnvelope`.
6. Envelope: `schemaVersion ≠ 1` ⇒ `rejected/schemaVersionMismatch`; `namespace ≠ 'cms'` ⇒ `rejected/unsupportedNamespace`; unknown `data` keys rejected; `newAccountTransfer` into a non-empty account ⇒ `rejected/invalidPayload (nonEmptyAccountForNewTransfer)`.
7. Apply (PL/pgSQL sub-transaction): profile insert if absent → completions → in-progress exclusion → positions → saved Challenges → Saved Scripture → awards → last-opened → Shelf → client unresolved evidence → `revision + 1` (guarded by `WHERE revision = current`) → receipt → evidence rows. Any validation error or constraint violation rolls back **every** write of the call.

Output statuses: `committed`, `alreadyCommittedDuplicate` (both with `receipt`, `committedEnvelope`, `committedEnvelopeRevision`, `outcomeStatus`), `conflict`, `unauthorized`, `rejected` (with `detail` code). `committed` also returns `shelfConflicts` and `serverDetectedUnresolvedCount`. `receipt` has exactly the `CommitAckReceipt` field set.

On replay, `committedEnvelope` is the *current* account snapshot (it may be newer than `receipt.durableRevision` if other commits followed); clearance decisions must use the receipt, as `canSafelyClearGuestStorage` already does.

### 3.2 `public.get_account_participation() RETURNS jsonb`

`SECURITY INVOKER`; returns `{status:'found', revision, envelope}` / `{status:'notFound'}` / `unauthorized`. The envelope includes `shelf` only when the account has Shelf state (rows, `shelf_state_recorded`, focus or updatedOn), so R13-1 `isAccountEmpty` / `auto` mode keep their semantics, including the explicit empty Shelf. Shelf entries additionally carry `isProtected` and `slotOrder`; in-progress records carry `unresolvedConflict: true` when set.

## 4. Merge rules as implemented (server-side)

| Section | Rule |
| --- | --- |
| Completions | Union. New rows `clientReported`. Existing date is immutable; disagreement is recorded as unresolved (`completionDateProvenanceConflict` if server row is `serverVerified` and the client date is earlier, else `undecidableCompletionDateProvenance`). Completion deletes any in-progress row (server-wide, every commit). |
| In-progress | Skipped if completed. Same `screenId` → `updated_on = max`. Different `screenId` → **no trusted screen order exists server-side**, so the account position is kept, `unresolved_conflict = true`, and both positions are persisted (`undecidableReadingPosition`). Never lexical or timestamp tie-breaks. |
| Saved Challenges | Union, earliest `saved_on`; cannot be removed by a merge (tombstones deferred per R13-0 §4.3). |
| Saved Scripture | Key recomputed server-side from `reference`/`translation` (mirror of `createSavedScriptureKey`); non-canonical key or non-normalized display fields rejected; duplicates in one payload rejected; earliest `saved_on` wins display metadata; non-null `source_challenge_id` preserved. No passage text column exists. |
| Awards | Canonical `card:monthly:YYYY-MM:<slug>`; `kind`/`discoveryId`/month derived server-side and must match any client values. `earnedOn` ≥ `YYYY-MM-01` and ≤ UTC+14 ceiling. Snapshot rebuilt from an allowlist (mirror of `validateEarnedCardSnapshot`). **Already-earned (verified) award:** `earned_on` immutable (unresolved evidence on disagreement); `hub_announcement_acked` and `card_viewed` OR independently; snapshot backfilled only when absent and identities agree. **Any other claim:** quarantined in `account_provisional_award_claims` (`verification_status = 'pendingTrustedVerification'`). The first claimed date is kept, flags OR, and the snapshot is only backfilled. It is listed by ID in `get_account_participation().pendingAwardVerification`, outside the envelope, and is never part of `earnedAwards`. |
| Completions (authority) | Completions are recorded as `clientReported` and never promoted. This follows R08A-0 §6.2.1: completion submission is a confidentiality boundary, not anti-cheat, and release confidentiality is enforced by the Gateway's released-slot intersection. Any future "verified" consumer must filter on `date_provenance = 'serverVerified'`, which only a future trusted path can set. |
| Last opened | R13-0 §4.6 (later `openedOn` wins; same pointer keeps max `resumeDismissedOn`). |
| Shelf | If the account has Shelf state, the account Shelf (rows, focus, protection) is kept **entirely** and displaced guest months are returned as `shelfConflicts` (`preservedInLibraryNotOnShelf`); their completions/cards/saves are still merged. Otherwise the submitted Shelf is inserted: ≤ 3 distinct months, each `< month(UTC+14 date)` (never current/future anywhere on Earth), `slot_order` = submitted order, `is_protected` = explicit boolean or default (`readerSelected` ⇒ true, `autoAdmitted` ⇒ false, mirroring `isShelfEntryProtected`). |
| Dates | Every client date ≤ `((now() AT TIME ZONE 'UTC') + 14h)::date`, strict real `YYYY-MM-DD`. |
| IDs | Challenge IDs mirror `parseStoredChallengeId(…, 'cms')`: `^cms:[A-Za-z0-9][A-Za-z0-9_-]{0,127}$` minus `drafts.`/fixture/pilot/lab tokens (stricter than the R13-3 CHECK, which also admits `.`/`:`). Discovery slugs exclude fixture/pilot/lab/prototype prefixes. |

## 5. Least-privilege model and future Supabase call path

- `account_reconciler`: `NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT`, owns only the commit function. It has **column-scoped** DML: completions and receipts/evidence are insert-only; awards can be **neither inserted nor deleted** (only presentation flags/snapshot of an already-earned award can be updated); quarantined claims cannot be deleted, re-dated or marked verified; Shelf rows are insert-only; no `TRUNCATE`; no access to `auth.users`.
- It is **itself confined by RLS** (`FOR ALL TO account_reconciler USING/WITH CHECK (account_id = auth.uid())`) on all 10 tables, so even a logic bug in the definer body cannot touch another account (tested in S8).
- `EXECUTE`: commit → `authenticated` only (revoked from `PUBLIC`, `anon`, `service_role`; Supabase's default function grants to `anon`/`service_role` are explicitly revoked after creation). Read → `authenticated` (+ owner). `account_private` has no client `USAGE` and is not a PostgREST-exposed schema.
- `SET search_path = ''` on every function; all objects schema-qualified.
- **Future call path:** the client calls `POST /rest/v1/rpc/reconcile_guest_participation` with body `{"p_payload": …}` using only the **anon key + the reader's own user JWT**. PostgREST switches to role `authenticated` and sets `request.jwt.claims`; `auth.uid()` resolves inside the function. No service-role key, Edge Function or elevated credential is needed or should be used.

## 6. Mapping SQL outcomes to the R13-1 `AuthorizedAccountTransport` (for the follow-on adapter)

| SQL result | `AccountTransportCommitResult` | Coordinator effect |
| --- | --- | --- |
| `committed` | `committed` (receipt + `committedEnvelope`) | clearance check |
| `alreadyCommittedDuplicate` | `alreadyCommittedDuplicate` | clearance check |
| `conflict/revisionMismatch` | `conflict/revisionMismatch` (+ `currentRevision`, `currentEnvelope`) | re-fetch, re-merge, same key |
| `conflict/idempotencyPayloadMismatch` | `conflict/idempotencyPayloadMismatch` | retries are futile with that key; guest retained |
| `unauthorized/{unauthenticated,accountMismatch,forbidden}` | `unauthorized` (same reason) | stop, retain guest |
| `rejected/{invalidPayload,schemaVersionMismatch,unsupportedNamespace}` | `rejected` (same reason; `detail` for diagnostics) | stop, retain guest |
| SQL/transport error (lock timeout `55P03`, serialization, connection loss, injected `XX…`) | `networkError { retryable: true }` | retry with the same key; idempotency makes a commit-then-lost-ACK safe |
| HTTP 401/403 from PostgREST/GoTrue | `unauthorized` (`expiredToken`/`unauthenticated`/`forbidden`) | per R13-2a session layer |

The SQL function itself never produces an HTTP status. "409" in older notes is only an adapter choice; the adapter must map from the JSON `status`, not from exceptions. `getAccount` maps `get_account_participation()` `found`/`notFound`/`unauthorized` directly.

**Guest clearance:** `receipt.unresolvedCount` = persisted unresolved evidence rows + quarantined award claims of that commit. `unresolvedPersistedOnServer` is `true` only when every unresolved item was written to `account_reconciliation_unresolved_items` in the same transaction **and** no award claim was quarantined. A quarantined claim is not account state the reader can see, so the flag is `false`. The unchanged `canSafelyClearGuestStorage` then returns `unresolvedNotPersistedOnServer` and the guest's local cards are kept; the result also carries `guestRetentionRequired: true` and `provisionalAwardClaims`. The receipt replays the stored value. Note that the R13-0 pure engine already sets `guestClearanceEligible = false` whenever unresolved items exist, so clearance is still withheld in that case. The server flag is a truthful precondition, not an override.

## 7. Contradictions found and how they were resolved (approved behaviour preserved)

1. **Premerged envelope vs "never trust premerged client JSON".** R13-1 sends the merged envelope, not raw guest data. Resolution: keep the R13-1 payload shape unchanged and treat its contents as candidates re-merged server-side (§2.3). Consequence: for `existingAccountMerge` the guest side of an undecidable conflict reaches the server only through the client's `unresolvedItems`. Those items are validated, rebuilt from an allowlist and persisted as **`clientReported` evidence only** (never applied).
2. **No trusted CMS metadata in the database.** There is no server-side source for Challenge release floors, award eligibility, screen order or editorial aliases. Resolution, per the issue's fail-closed rule:
   - **Awards (revised after review of PR #207):** the first revision stored client award claims as `clientReported` earned awards. The review correctly pointed out that downgrading *date provenance* does not verify *eligibility*: R08A-0 §6.2 requires the account service to derive/verify `earned_awards` against authoritative CMS discovery/roster rules, and a valid-looking ID (e.g. an October full-month Card with no October completions) must not become an earned award. Claims are now quarantined (§4) and force guest retention (§6). **Product consequence, for Aaron:** until the trusted projection exists, a guest who has earned Cards keeps them on the device, and their guest storage is not cleared. Completions, saves, positions and the Shelf still sync. No Card is lost or shown as un-earned locally, but Cards do not yet appear on a second device.
   - Completions are stored as `clientReported` and never promoted (§4). The only floors enforced are those derivable from identity itself (`YYYY-MM-01` for awards) plus the server UTC+14 ceiling. **No editorial facts were invented.**
   - Screen order is unavailable, so distinct positions are always unresolved (never "furthest").
   - Aliases (`previousDocumentIds`) are not applied server-side; IDs are stored as submitted (canonical form only).
   - **Required follow-on interface:** a trusted, server-readable CMS projection (release date per Challenge, published screen `_key[]`, alias map, discovery/award eligibility, canonical card snapshot) owned by the Gateway/CMS track. Until it exists, consumers must not treat account awards as verified, for example for public claims. They should refresh card artwork and `shareEligible` from the Gateway, not from stored client snapshots.
3. **`isProtected` absent from the R13-0 envelope type.** `ProposedAccountShelfEntry` (read-only `src/accountSync/types.ts`) lacks `isProtected`, and `normalizeShelfState` strips it. The server accepts an optional `isProtected` boolean and otherwise applies the accepted `src/shelf` default. Existing account Shelf rows can never be overwritten (insert-only grant), so client stripping cannot erase protection. However, an ordinary guest-to-new-account transfer through the coordinator **changes a deliberate non-default selection**: `autoAdmitted + isProtected:true` becomes unprotected and `readerSelected + isProtected:false` becomes protected. The SQL-only tests T4b/T4d bypass the coordinator and do not cover this. **Blocking prerequisite for live transfer:** an Aaron-authorized `src/accountSync/**` change that carries `isProtected` through `normalizeShelfState` and the envelope type, plus a coordinator → SQL → readback test covering both non-default combinations. No issue was opened and no source file was edited here, as #206 requires approval for both.
4. **`expectedRevision` optionality.** The R13-1 type comment allows `null`/`undefined` for new accounts. Per the issue, the server requires an explicit number. The coordinator always sends one.

## 8. Known limits

- **Normalization parity:** Scripture key recomputation uses PostgreSQL `normalize(NFC)`, `\s` and `lower()`. For non-ASCII references, these can differ from JS (`toLowerCase`, Unicode `\s`) depending on database collation. A mismatch fails closed (`nonCanonicalScriptureKey`, guest retained), which is safe but would stall that reader's transfer. Verify on the real Supabase collation in the adapter milestone.
- Bounds: 1 MiB payload, 5 000 records per section, 500 client unresolved items, `lock_timeout = 5s`.
- Callers must use READ COMMITTED (PostgREST default); other levels are rejected.
- **Blocking before any real transport or deployment:** Supabase specifics not verifiable locally: `GRANT USAGE ON SCHEMA auth` / `EXECUTE ON auth.uid()` to a custom role, migration-runner membership in `account_reconciler` (handled in the migration for non-superusers), and pg_graphql exposure of `public` functions (same `EXECUTE` gate). They must be proven on a disposable local `supabase start` stack (role ownership, `auth.uid()` under PostgREST, function grants, authorization) before any real transport uses this function. Never production.
- Unresolved evidence has no resolver yet; `unresolved_conflict` stays set until a future resolver with trusted screen order.

## 9. Migration and rollback

Forward-only: no R13-3 table/policy/grant is dropped or recreated. Local/non-production rollback, only before any live data exists:

```sql
BEGIN;
DROP FUNCTION IF EXISTS public.reconcile_guest_participation(jsonb);
DROP FUNCTION IF EXISTS public.get_account_participation();
DROP SCHEMA IF EXISTS account_private CASCADE;
DROP POLICY IF EXISTS "account_participation_profiles_reconciler_own" ON public.account_participation_profiles;
DROP POLICY IF EXISTS "account_completed_challenges_reconciler_own" ON public.account_completed_challenges;
DROP POLICY IF EXISTS "account_in_progress_challenges_reconciler_own" ON public.account_in_progress_challenges;
DROP POLICY IF EXISTS "account_saved_challenges_reconciler_own" ON public.account_saved_challenges;
DROP POLICY IF EXISTS "account_saved_scriptures_reconciler_own" ON public.account_saved_scriptures;
DROP POLICY IF EXISTS "account_earned_awards_reconciler_own" ON public.account_earned_awards;
DROP POLICY IF EXISTS "account_shelf_months_reconciler_own" ON public.account_shelf_months;
DROP POLICY IF EXISTS "account_reconciliation_receipts_reconciler_own" ON public.account_reconciliation_receipts;
DROP TABLE IF EXISTS public.account_reconciliation_unresolved_items;
DROP TABLE IF EXISTS public.account_provisional_award_claims;
ALTER TABLE public.account_reconciliation_receipts DROP COLUMN IF EXISTS unresolved_persisted_on_server;
ALTER TABLE public.account_participation_profiles DROP COLUMN IF EXISTS shelf_state_recorded;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM account_reconciler;
REVOKE EXECUTE ON FUNCTION auth.uid() FROM account_reconciler;
REVOKE USAGE ON SCHEMA auth FROM account_reconciler;
REVOKE USAGE ON SCHEMA public FROM account_reconciler;
COMMIT;
```

Roles are cluster-wide, so the script deliberately does not drop `account_reconciler`. Once no database in the cluster still uses it, `DROP ROLE account_reconciler;` can be run separately. Re-applying the migration after this rollback works because role creation is conditional. With live data, use forward-fix migrations only.

## 10. How to run (local, disposable database only)

```bash
LOCAL_TEST_DATABASE_URL='postgresql:///bibleberry_tx1_test?host=/tmp/bb-pg&port=55432&user=postgres' \
  ./scripts/accountDatabase/run-local-transaction-tests.sh
```

The runner refuses non-loopback/non-socket targets (shared R13-3 guard) and any database that already contains `public.account_*` objects. It applies bootstrap + both migrations, re-runs the R13-3 suite against the full schema, then suites 02, 03 and 04.

### Verification results (2026-11-18, PostgreSQL 16.15, fresh local cluster on a Unix socket, TCP disabled)

- `run-local-transaction-tests.sh` → **passed**: R13-3 regression suite, plus **245** R13-TX1 assertions (84 security S1–S11, 156 invariants T1–T9, 5 concurrency C1–C4).
- `run-local-rls-tests.sh` (original R13-3 runner, fresh DB) → **passed**.
- `node --experimental-strip-types --test tests/accountDatabase/*.test.ts` → **12 passed**; `runLocalRlsGuard.test.sh`, `runLocalTransactionGuard.test.sh` → **passed**.
- §9 rollback script executed on a scratch local DB: functions/evidence removed, R13-3 suite still passes, R13-TX1 migration re-applies and suite 03 passes again.
- Mutation checks: removing the flag OR, minting client provenance, skipping digest comparison, dropping completion/resume exclusion, inverting Shelf precedence or the historical-month bound each fail the suites. Removing the advisory lock passes the single-session suites but fails concurrency scenario C2, which is why C2 exists. One survivor (flag regression masked by the "no-change" shortcut) was found and closed with T3x. After the award-quarantine revision: always reporting `unresolvedPersistedOnServer: true`, granting `INSERT` on `earned_awards`, regressing quarantined flags (closed with T9e2), and changing the pending-claim readback each fail the suites.

## 11. Follow-on work (not started)

1. Real `AuthorizedAccountTransport` adapter (PostgREST RPC + result mapping in §6) wired with the R13-2a session layer; run against local `supabase start`, then two-device E2E.
2. Trusted CMS metadata interface (§7.2) and a server attestation path that admits quarantined award claims into `account_earned_awards`, and enables any `serverVerified` promotion or furthest-position resolution.
3. **Blocking for live transfer:** the `isProtected` source-contract change with a coordinator → SQL → readback test (§7.3).
4. **Blocking for any real transport:** disposable local Supabase stack verification (§8).
5. Unresolved-item resolver and cross-device unsave tombstones (R13-0 §4.3).
