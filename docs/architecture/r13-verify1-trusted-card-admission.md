# Bibleberry R13-VERIFY1 — Trusted CMS-Backed Scripture Card Verification & Admission (Backend Handoff)

> **Issue:** [#208](https://github.com/Bibleberry/Bibleberry/issues/208) (Phase 05 / R13-VERIFY1)
> **Baseline `main`:** `7dc1ff6` (R13-TX1, PR #207, merged and accepted)
> **Scope:** server-only verification core (`src/accountVerification/**`), internal-only Gateway reuse (`src/gateway/monthlyProjection.ts`, `src/gateway/query.ts`), one forward migration, local tests/runner, and this note.
> **Not included:** a deployed verifier service, its database login, Edge Function / Worker route, `AuthorizedAccountTransport` wiring, UI, live Sanity/Supabase access, or any public API change.

---

## 1. What was built

| Artifact | Purpose |
| --- | --- |
| `src/gateway/monthlyProjection.ts` → `evaluateTrustedMonthAwardEligibility` | **Internal-only** evaluator reusing exactly `validateMonthlyBase` + `validateDiscoveriesAndFullMonth` (the rules behind `evaluateMonthProgress`). Not exported from `src/gateway/index.ts`, not used by any route. Public outputs unchanged (gateway suite 112/112 before and after). |
| `src/gateway/query.ts` → `TRUSTED_AWARD_VERIFICATION_MONTH_GROQ_QUERY` | Internal query: the same validated detail projection plus `_rev` and `rosterFinalization.priorRosters`. Public queries untouched. |
| `src/accountVerification/**` | Server-only orchestration: privileged provider (`createSanityTrustedMonthProvider`), pure decision (`evaluateClaimEligibility`), passes (`runAwardVerificationPass` / `verifyPendingAwardClaim`), server civil dates. |
| `supabase/migrations/20261118000002_r13_verify1_trusted_card_admission.sql` | Issuer/verifier roles, `account_issuance` port (4 functions), 2 private audit tables, column-scoped grants and per-account RLS confinement. |
| `tests/accountVerification/**` | Pure eligibility, provider, orchestration and server-only-boundary tests, plus the end-to-end proof on local PostgreSQL through a **test-only** `psql` port. |
| `tests/accountDatabase/05_*.sql`, `06_*.sh`, `accountVerify1Static.test.ts`, `runLocalVerify1Guard.test.sh`; `scripts/accountDatabase/run-local-verify1-tests.sh` | SQL security/lifecycle suite, multi-session concurrency, static guards, and the combined local runner. |
| `tests/gateway/gatewayHandler.test.ts` (one guard) | See §11.1: the bundle-isolation guard now also treats `src/accountVerification` as server-only, and **forbids** any browser file from importing it. |

## 2. Trust boundary and threat model

1. **A claim is a nomination, never an entitlement.** `account_provisional_award_claims` rows are written only by the TX1 reconciler under `auth.uid()`. They tell the verifier *which (account, award) pair to check*. Their client flags and date are evidence. Their client snapshot, `cardDocumentId`, image URL, `shareEligible`, `isEarned` and any mapping are never inputs to eligibility or admission.
2. **Account identity is established by database row ownership, not by a caller.** The verifier processes only pairs that already exist as claims, and reads *that* account's completions from `account_completed_challenges`. No reader-supplied account ID is ever involved.
3. **Eligibility uses the accepted Gateway rules over privately fetched published content.** Inputs are the published, finalized month (roster, active non-withdrawn slots, release dates, thematic qualifying IDs, full-month criterion, editorial approvals, and the linked approved `scriptureCard` with rights). The public month/progress API response, browser payloads and unauthenticated content are never used.
4. **Issuance is a distinct private authority.** It is the `account_award_issuer`-owned `account_issuance.*` port, executable only by the `account_award_verifier` group. It is unreachable by `anon`, `authenticated`, `service_role`, `PUBLIC` or the TX1 `account_reconciler`. The `account_issuance` schema is not a PostgREST-exposed schema, so there is no public RPC.
5. **The TX1 guarantees are unchanged.** The client-callable reconciler still cannot `INSERT` earned awards or update Card metadata (V1i).
6. **Nothing confidential leaks.** No unearned Card art, title↔art mapping, alt/transcription, CDN URL, reserved Card ID or hidden qualifying list appears in any public endpoint, error, unverified readback, pending-claim response or log. Deferral reasons and attestations are in private tables with no client grants. Pass summaries contain counts only, and `src/accountVerification/**` contains no logging statements.

## 3. Private editorial data provider API

```ts
interface TrustedMonthlyEditorialProvider {
  fetchPublishedMonth(yearMonth): Promise<
    | { status: 'found'; document; revision /* Sanity _rev */; dataset: 'production' | 'staging' }
    | { status: 'notFound' } | { status: 'unavailable' }>
  sanityProjectId; dataset
}
```

`createSanityTrustedMonthProvider({ projectId, dataset, readToken, fetchImpl })`:
- builds the URL with the accepted `buildSanityQueryUrl`, which forces `perspective=published`;
- uses only the internal verification query;
- accepts only the `production` and `staging` datasets (no third dataset);
- sends a server-held bearer token only in the `Authorization` header, never in the URL, an error or a result;
- collapses every failure to `unavailable` or `notFound` without echoing upstream content.

Tests inject `fetchImpl`; nothing in this PR performs a live fetch.

## 4. Eligibility rules

- **Release cut-off:** `authorizedLocalDate` is the server's **UTC−12 universal floor** (`universalReleasedThroughDate(now)`), not a reader time zone. A slot dated on or before it is released everywhere on Earth (R08A-0 §4.2), so a claim can never unlock a Challenge or Card still embargoed anywhere. A claim depending on a slot released only in eastern zones is deferred and verifies on a later pass (≤ ~26 h).
- **Earned rule:** an award is earned only when the account's DB completions, intersected with **active, non-withdrawn, released** slots of **this** month, cover the active qualifying set (thematic) or every active Challenge (full month). Completions from other months, padded/`pilot:`/unprefixed IDs and unreleased slots never count. Repeats do not amplify.
- **Card:** admission requires a linked Card that passes `validateAndProjectLinkedCard`. That means published `card-<slug>`, `approved`, reviewed, not withdrawn, correct category and month, art pinned to the project/dataset CDN, distinct alt/transcription, confirmed art and citation rights, and no intra-month duplicate. A legacy `reservedCardId` alone, or a draft, dangling, unapproved, unlicensed or mis-linked Card, **defers**.
- **Attestation** (strict allowlist): award/discovery/kind/month, roster version, target size, this account's **basis** (its own qualifying completions, never the full hidden list), latest basis release date, verified-through date, trusted Card snapshot, and source `{documentId, revision, dataset, perspective:'published'}` plus run key and verifier version.
- **Deferral reasons** (private): `trustedSourceUnavailable`, `monthNotFound`, `monthNotPublishable`, `monthNotYetReleased`, `discoveryNotFound`, `notEligibleUnderCurrentRoster`, `historicalRosterEligibilityUnprovable`, `cardNotLinked`, `cardLegacyReservedOnly`, `cardNotApproved`, `basisNotInAccountCompletions`, `admissionRejected`.

## 5. Historical roster, version and date behaviour

- **Current roster is authoritative.** Under Option 4A a withdrawn qualifying slot leaves the active requirement, so the remaining active set still earns the award (tested with `rosterVersion: 2`).
- **`priorRosters[]` is evidence, not entitlement.** If a claim is not provable under the current roster and prior rosters exist, it stays pending with `historicalRosterEligibilityUnprovable`. That names the missing fact without rewarding a stale claim.
- **Previously earned awards are never revoked, re-dated or re-skinned.** An already-earned award is never re-issued; a re-appearing claim only ORs the two presentation flags and is resolved (V6). Trusted dates, provenance and snapshots stay as they were.
- **Earned date (deliberate, documented tension).** `earned_on = clamp(claimed_earned_on, lower = max(monthStart, latestBasisRelease), upper = DB UTC+14 ceiling)`. The provenance stays **`clientReported`**, with `client_claimed_on` keeping the raw claim; `serverVerified` is never minted. The server proves the award *was earned*, not *on which reader-local day*. A claim earlier than the last qualifying release is impossible, so it is raised to the earliest credible date. Recording the verification instant as the earned date would push awards into later months, so it is kept only as `verified_at` and `verified_through_date` in the attestation. A future trusted per-completion attestation could tighten this (owner decision §13).
- **Version stamps.** `roster_version`, `source_revision` (Sanity `_rev`), `source_dataset`, `verifier_version` and `verification_key` are recorded per admission.

## 6. SQL contract and privileges

| Object | Owner / executable by | Notes |
| --- | --- | --- |
| `account_issuance.list_pending_award_claims(limit)` | issuer / verifier | IDs and dates only, oldest-attempted first; limit 1–500. |
| `account_issuance.get_claim_verification_context(account, award)` | issuer / verifier | Returns that account's completion IDs **only if** that exact claim exists; otherwise `noPendingClaim`. |
| `account_issuance.record_verification_deferral(account, award, reason, roster)` | issuer / verifier | Upserts the private attempt row; never touches the claim or awards. |
| `account_issuance.admit_verified_award(attestation jsonb)` | issuer / verifier | Atomic admission (below). |

All four are `SECURITY DEFINER` with `search_path=''`, owned by `account_award_issuer` (`NOLOGIN NOBYPASSRLS NOINHERIT`). The issuer has column-scoped privileges:
- **earned awards:** `INSERT`, plus `UPDATE` of the two flags only; no `DELETE`, no date/provenance/metadata updates;
- **claims:** `SELECT` and `DELETE`;
- **completions:** `SELECT (account_id, challenge_id)`;
- **profile:** `UPDATE (revision, updated_at)`;
- **attestations:** insert-only.

It is **RLS-confined** to the single account the running function is processing. The function's own `SET bibleberry.award_issuance_account` clause scopes that setting to the call, so even a logic bug cannot touch another account (V7). Listing claims is the only cross-account read.

**Commit-boundary checks in `admit_verified_award`** (all before any write, inside one transaction):
- READ COMMITTED only;
- strict key allowlist (a self-asserted `verified`, `earnedOn` or any extra field is rejected);
- canonical award identity consistent with kind, discovery and month;
- integral roster/target, target 1–31;
- basis distinct, canonical, and exactly the target size;
- the latest release date falls within the month, and verified-through is on or after it and on or before the DB UTC+14 ceiling;
- the Card passes the TX1 snapshot allowlist for that month;
- the source is `month-YYYY-MM`, `published`, from an approved dataset, with a bounded revision.

Then, under the **same per-account advisory lock as TX1 reconciliation**:
- a pending claim must exist for that exact pair (otherwise `noPendingClaim`; the issuer can never mint an unclaimed award, V4y);
- the basis must be the account's own stored completions (`basisNotInAccountCompletions`);
- insert the earned award, insert the attestation, delete the claim (its attempt row cascades), and bump the revision.

## 7. Quarantine lifecycle

| State | Reader readback | Guest retention |
| --- | --- | --- |
| Pending (TX1) | `pendingAwardVerification: [awardId]` only | Required (`unresolvedPersistedOnServer:false`) |
| Deferred | Unchanged (reason is private) | Required |
| Admitted | Permanent `earnedAwards[awardId]` with **trusted** `earnedCard`; claim gone | Only a **fresh** reconcile can clear (§9) |

The audit decision is **move, not mark**: the quarantine row is deleted, and the minimal evidence (claimed date, run key, roster version, `_rev`, basis digest/size, Card document and asset revision) moves into a private attestation. No basis IDs, client snapshot or deferral history are retained for admitted awards (minimal data).

## 8. Replay, concurrency and failure semantics

- **Replay or a second worker:** the same award returns `alreadyEarned`, with no new row and no revision bump (V2m, K1: six gate-released simultaneous admissions → 1 admitted + 5 alreadyEarned).
- **Interleaving with a reader's reconcile:** serialized by the shared advisory lock, with no lost update and both revisions applied (K2). A reader re-syncing the same award after admission merges flags into the earned award via TX1 and never re-quarantines it (K3).
- **Failures:**
  - validation, constraint or basis failure → typed `rejected` with zero writes;
  - `unique_violation` → `retry`;
  - any other database error propagates (retryable) after full rollback (V8);
  - a trusted-source outage or missing metadata → private deferral, with the claim still pending and guest data retained.

  Each of these is non-destructive and retriable.
- **Cross-account isolation:** V2d, V4, V7 and K4.

## 9. Receipt and guest-clearance seam

- Earlier receipts are immutable. Replaying the old TX1 key returns the **original** `unresolvedPersistedOnServer:false` receipt (V3a). Verification never retroactively turns an old receipt into success.
- No special acknowledgement path is needed. After admission the next ordinary TX1 reconcile:
  - sees the award in `account_earned_awards` (flags-only path);
  - binds its receipt to the **current** guest fingerprint;
  - returns `unresolvedPersistedOnServer:true` only if no other claim is still unverified (V3b vs V3e).
- The unchanged coordinator then applies its existing checks (`localGuestMutatedInFlight`, fingerprint and receipt matching), so newer local mutations are still retained.
- If the guest's claimed date differs from the admitted `earned_on` (because it was clamped), TX1 records an unresolved date item and the pure engine keeps the guest retained. That is safe, and documented.

## 10. Runtime bridge left to the adapter milestone (material-blocker statement)

What this PR proves is the verification core and the secure local SQL contract, exercised together end to end on real local PostgreSQL. The `psql`-based port in `tests/accountVerification/psqlIssuancePort.ts` is **test-only**; no trustworthy deployed caller is simulated.

What a client cannot forge: it cannot reach `account_issuance` at all, cannot nominate a pair for another account (claims are written under `auth.uid()`), cannot supply completions (read from the database), and cannot supply Card data (read from published Sanity by the server).

What PostgreSQL **cannot** authenticate: the CMS facts themselves (which Challenges qualify, which Card is approved), because Sanity documents are not signed. Inside the database they are trusted only because they arrive through the private verifier port. Making that trust real needs work outside this issue's file scope:
1. A server-side verifier runtime (scheduled Worker / Edge Function / job) holding (a) the Sanity read token and (b) a dedicated database **login** role granted `account_award_verifier`, never `service_role` and never in a web/native bundle.
2. Secret custody, rotation and network placement for both credentials.
3. Scheduling cadence and alerting on deferral counts.
4. Verification on a disposable **local Supabase** stack: whether a custom login role can connect, that `account_issuance` stays outside PostgREST `db-schemas`, and the default-privilege behaviour of migrations run as `postgres`. **Not run in this PR**; only plain local PostgreSQL 16.15 was available.

These need Aaron's approval for the relevant Worker/infra/auth file scope.

## 11. Deviations and contradictions resolved

1. **Bundle-isolation guard (`tests/gateway/gatewayHandler.test.ts`).** The guard treated every `src/` file outside `src/gateway` as browser code that must not import the Gateway. The issue requires the server-only verifier in `src/accountVerification/**` to reuse the Gateway's validators. The guard now exempts that one server-only tree and additionally fails if **any** browser file mentions `accountVerification`, so it is stricter than before. `providerAndBoundary.test.ts` enforces the same thing independently.
2. **Internal Gateway extension.** Two internal-only fields (`cardLinked` / `fullMonthLinkedCardId` / `fullMonthCardLinked`) were added so a draft or dangling Card link is classified `cardNotApproved` rather than `cardNotLinked`. Nothing public changes.
3. **Earned date provenance** stays `clientReported` (§5), rather than minting `serverVerified`.

## 12. Verification results

Environment: PostgreSQL 16.15, a freshly initialised local cluster on a Unix socket with TCP disabled, and disposable databases.

| Command | Result |
| --- | --- |
| `LOCAL_TEST_DATABASE_URL=… ./scripts/accountDatabase/run-local-verify1-tests.sh` | **passed**. All three migrations applied to a fresh DB. R13-3 suite passed. **TX1 regression: 250/250** (85 S + 160 T + 5 C) on the combined schema. **VERIFY1: 78 SQL assertions** (V1–V9), **4 concurrency scenarios** (K1–K4) and the **end-to-end proof** (1/1, skips counted as failures). |
| Mutation checks (VERIFY1 migration) | The suites catch each of: skipping the basis-ownership check, minting an unclaimed award, trusting the client date, admitting the client snapshot, dropping the future-date bound, keeping the quarantine row, granting issuance to `authenticated`, unconfined issuer RLS, and removing the advisory lock (K1, once gate-released). |
| §13 rollback script on a scratch DB | Removes VERIFY1 objects; R13-3 and TX1 suites still pass; VERIFY1 re-applies and V-suite passes. |

Other relevant checks (`npm run test:gateway`, `tests/accountVerification/*.test.ts`, `tests/accountDatabase/*.test.ts`, guard scripts, lint, build, TX1 runner alone) are listed with exact results in the PR.

## 13. Migration and rollback

Forward-only. Local / non-production rollback, only before live data exists (admitted awards are reader data and remain):

```sql
BEGIN;
DROP SCHEMA IF EXISTS account_issuance CASCADE;
DROP POLICY IF EXISTS "account_provisional_award_claims_issuer_list" ON public.account_provisional_award_claims;
DROP POLICY IF EXISTS "account_provisional_award_claims_issuer_resolve" ON public.account_provisional_award_claims;
DROP POLICY IF EXISTS "account_completed_challenges_issuer_own" ON public.account_completed_challenges;
DROP POLICY IF EXISTS "account_earned_awards_issuer_own" ON public.account_earned_awards;
DROP POLICY IF EXISTS "account_participation_profiles_issuer_own" ON public.account_participation_profiles;
DROP TABLE IF EXISTS public.account_award_verification_attempts;
DROP TABLE IF EXISTS public.account_award_admission_attestations;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM account_award_issuer;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA account_private FROM account_award_issuer;
REVOKE USAGE ON SCHEMA account_private FROM account_award_issuer;
REVOKE USAGE ON SCHEMA public FROM account_award_issuer;
COMMIT;
```

The roles are cluster-wide and deliberately not dropped.

## 14. Owner decisions for Aaron

1. **Runtime bridge (§10):** approve the file/infra scope for a verifier runtime with its own database login and Sanity token custody.
2. **Earned-date policy (§5):** accept clamped `clientReported` dates, or require a future trusted per-completion attestation.
3. **Cadence:** how often to verify, and whether a reader's sync should trigger a verification pass.
4. **Guard change (§11.1):** accept the stricter bundle-isolation rule.
5. **Shelf `isProtected`:** remains a separate tracked prerequisite for live transfer (unchanged by this PR).
