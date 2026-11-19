# R13-SB3 — Remove the `service_role` bypass of trusted award admission

**Codename:** Granite Sparrow · **Issue:** [#236](https://github.com/Bibleberry/Bibleberry/issues/236) · **Phase:** 05 / R13-SB3
**Finding fixed:** F1 ([R13-VERIFY2 §7](r13-verify2-private-verifier-runtime.md), [Copper Heron PR #234](https://github.com/Bibleberry/Bibleberry/pull/234))
**Migration:** `supabase/migrations/20261119000001_r13_sb3_service_role_award_grant_remediation.sql` (forward-only)
**Scope:** local, disposable Supabase stacks only. Nothing hosted was migrated, provisioned, or deployed. This does **not** authorize production activation.

## 1. The finding

R13-3 granted `service_role` `ALL` on the 8 account tables. R13-TX1 did the same for its 2 new tables. On Supabase, `service_role` has `BYPASSRLS`, and PostgREST switches to it for both the legacy service-role JWT and the `sb_secret_` key. So that key could create an earned Card with no eligible Challenge, no quarantined claim, no verifier and no attestation. It could also forge the evidence the verifier and the database re-check rely on.

**RLS cannot fix this**, because the role bypasses RLS. Only SQL privileges can (suite E, test E2, asserts `rolbypassrls = true`).

### Pre-fix reproduction (real local stack, accepted R13-3 + TX1 + VERIFY1 only)

Suite U phase `pre` (`tests/accountSupabase/sb3UpgradePath.supabase.test.ts`, U1) ran these steps with the real service-role credential against a synthetic user. The test **asserts** each result, so a non-vulnerable baseline would fail it.

| Vector | Pre-fix | Post-fix (U5, E5, E6) |
|---|---|---|
| P1 `POST /rest/v1/account_earned_awards` (no claim, no attestation, `serverVerified`, forged Card) | **201** | 403 `42501` |
| P2 `PATCH` earned award `earned_on` | **204** | 403 `42501` |
| P3 `DELETE` earned award history | **204** | 403 `42501` |
| P4 `POST` forged `account_completed_challenges` (the basis the issuer re-checks) | **201** | 403 `42501` |
| P5 `POST` forged `account_provisional_award_claims` (the only nomination admission accepts) | **201** | 403 `42501` |
| P6 `PATCH` claim `claimed_earned_on` (feeds the earned date) | **204** | 403 `42501` |
| P7 `POST` forged receipt with `unresolved_persisted_on_server = true` | **201** | 403 `42501` |
| P8 SQL `CREATE TRIGGER` on an account table, as `service_role` | **succeeds** | `42501` |
| P9 SQL `TRUNCATE account_completed_challenges`, as `service_role` | **succeeds** | `42501` |

U1 also confirms the forged rows actually persisted (3 rows), then removes them. Post-fix, U5/E5/E6 confirm that **no** row changed. They compare md5 digests of every row in every account table before and after.

## 2. Attack-surface classification

| Path | Exploitable? | Why |
|---|---|---|
| Earned award INSERT / UPDATE / DELETE / TRUNCATE | **Yes** | Mints a Card directly, or rewrites its trusted identity, earned date, provenance, art and rights, or destroys history. |
| Completion INSERT / UPDATE / DELETE | **Yes** | `admit_verified_award` checks the attested basis against the stored completions. Forged completions defeat that database-owned check. |
| Provisional claim INSERT / UPDATE / DELETE | **Yes** | A claim is the only thing that nominates an `(account, award)` pair. `claimed_earned_on` sets the admitted earned date. |
| Receipt / unresolved-item INSERT / UPDATE / DELETE | **Yes** | The replay path returns the stored receipt, so `guestRetentionRequired = NOT unresolved_persisted_on_server AND unresolved_count > 0`. A forged or edited receipt tells the client to clear unverified local Cards. That bypasses the R13-1 guest-retention invariant. |
| `TRIGGER` on **any** account table | **Yes (indirect)** | `CREATE TRIGGER` needs only the `TRIGGER` table privilege plus `EXECUTE` on a trigger function. `service_role` can execute 18 on the local stack, for example `supabase_functions.http_request()`. A trigger fires inside the `SECURITY DEFINER` reconcile/admit bodies and runs with **their** privileges, for example issuer `INSERT` on earned awards. |
| `TRUNCATE` / `REFERENCES` on any account table | Harmful / unneeded | TRUNCATE ignores row semantics and destroys history. No caller needs either privilege. |
| Attestation / attempt tables | Already closed | R13-VERIFY1 revoked them. Re-asserted here, including SELECT. |
| Profile, in-progress, saved Challenges/Scriptures, Shelf row DML | **No award authority** | Reader-owned state. None of these feeds admission, eligibility, earned dates or Card metadata. Deleting a profile only makes admission fail closed (`accountProfileMissing`). Kept, per the Issue's "do not blanket-revoke unrelated privileges". |
| `SELECT` on award/evidence tables | Harmless read | Exposes only already-earned Cards, the reader's own claimed data and receipts. No hidden eligibility, unreleased art or manuscript text is stored. Private audit tables stay unreadable. |
| `service_role` → account roles / `pg_write_all_data` | None | No membership, direct or transitive (E2, S2). `authenticator` is not a member of any account role (SB2 check D1e). |
| Public / private RPCs | None | `service_role` executes no account function (TX1/VERIFY1 revokes, re-checked in S2). |

**Legitimate direct `service_role` callers: none.** A repository-wide search covered `src/`, `scripts/`, `.github/workflows/`, Wrangler configs and the SQL functions. It found no use of `service_role` for direct DML on these tables. `src/accountSync/supabasePostgrestTransport.ts` refuses service keys. `src/accountVerification/runtimeConfig.ts` refuses `service_role` as a verifier login. No supported operation needed the revoked privileges, so nothing had to be escalated as a conflict.

## 3. The remediation (one forward-only migration)

No accepted migration was edited. The migration contains no `GRANT`, defines no object and changes no row. Its 3 `REVOKE`s all target `service_role`.

| Class | Tables | `service_role` after |
|---|---|---|
| A. Award and admission evidence | `account_earned_awards`, `account_completed_challenges`, `account_provisional_award_claims`, `account_reconciliation_receipts`, `account_reconciliation_unresolved_items` | `SELECT` only |
| B. Private issuance audit | `account_award_admission_attestations`, `account_award_verification_attempts` | nothing (unchanged) |
| C. Reader-owned state | `account_participation_profiles`, `account_in_progress_challenges`, `account_saved_challenges`, `account_saved_scriptures`, `account_shelf_months` | `SELECT, INSERT, UPDATE, DELETE` (unchanged); no `TRUNCATE` / `REFERENCES` / `TRIGGER` |

The migration then asserts **effective** privilege with `has_table_privilege` and `has_any_column_privilege`. These resolve PUBLIC, inheritance and column grants. If any check fails, the migration raises and rolls back:

1. No write into class A or B.
2. No TRUNCATE, REFERENCES or TRIGGER anywhere.
3. No read of the class B tables.
4. No membership in an account role or `pg_write_all_data`.
5. The accepted reconciler and issuer authority is unchanged.
6. PUBLIC, anon and authenticated still cannot write anything.

## 4. Effective privilege matrix after R13-SB3

Suite E, test E1, asserts this exact matrix on the real stack, for every `public.account_%` table. An unclassified new table fails E1 and check S1. `(cols)` means column-scoped. `PUBLIC`, `anon` and `account_award_verifier` hold nothing on any table.

| Table | authenticated | service_role | account_reconciler | account_award_issuer |
|---|---|---|---|---|
| earned_awards | SELECT (own) | SELECT | SELECT, UPDATE(cols) | INSERT, SELECT, UPDATE(cols) |
| completed_challenges | SELECT (own) | SELECT | INSERT, SELECT | SELECT(cols) |
| provisional_award_claims | SELECT (own) | SELECT | INSERT, SELECT, UPDATE(cols) | DELETE, SELECT |
| reconciliation_receipts | SELECT (own) | SELECT | INSERT, SELECT | — |
| reconciliation_unresolved_items | SELECT (own) | SELECT | INSERT, SELECT | — |
| award_admission_attestations | — | — | — | INSERT, SELECT |
| award_verification_attempts | — | — | — | INSERT, SELECT, UPDATE(cols) |
| participation_profiles | SELECT (own) | DELETE, INSERT, SELECT, UPDATE | INSERT, SELECT, UPDATE(cols) | SELECT, UPDATE(cols) |
| in_progress_challenges | SELECT (own) | DELETE, INSERT, SELECT, UPDATE | DELETE, INSERT, SELECT, UPDATE(cols) | — |
| saved_challenges | SELECT (own) | DELETE, INSERT, SELECT, UPDATE | INSERT, SELECT, UPDATE(cols) | — |
| saved_scriptures | SELECT (own) | DELETE, INSERT, SELECT, UPDATE | INSERT, SELECT, UPDATE(cols) | — |
| shelf_months | SELECT (own) | DELETE, INSERT, SELECT, UPDATE | INSERT, SELECT | — |

E1 also asserts the `UPDATE`-able columns of `account_earned_awards` for every role. Only `account_reconciler` and `account_award_issuer` can update anything there, and only `card_viewed`, `hub_announcement_acked` and `updated_at`. No role can rewrite identity, earned date, provenance, Card document, snapshot or rights.

## 5. Tests and results

All runs used Supabase CLI 3.2.0, Docker 29.10.0, Supabase Postgres 17.12, Node 22, on a fresh disposable loopback-only stack. The runner's identity was `postgres` (not a superuser). There were zero pre-unblocks and zero migration WARNING/ERROR lines.

| Command | Result |
|---|---|
| `SUPABASE_CLI=… ./scripts/accountSupabase/run-local-supabase-acceptance.sh` on **unmodified `main` 9c4b52f** (baseline) | 43 pass / 0 fail / 0 skip. D12 observed F1 (201). |
| Same runner, default **upgrade path**: accepted 3 → U `pre` → SB3 on top → U `post` | U pre 3/3, U post 4/4. Suites A–E **50 pass / 0 fail / 0 skip**. SB2 D1–D4 + SB3 S1–S3 checks pass. |
| `SB3_FRESH_APPLY=1` (**fresh path**: all 4 migrations in one CLI run) | **50 pass / 0 fail / 0 skip**. SB2 + SB3 checks pass. |
| `SB2_MUTATION_DEMOS=1` | All SB2 demos still pass. **M-SB3a** (award/evidence REVOKE removed) and **M-SB3b** (TRIGGER kept) fail at the CLI with nothing stranded and table ACLs unchanged. **6/6 restored grants detected** after a clean apply: table `ALL`, table `INSERT`, column `INSERT`, `UPDATE TO PUBLIC`, `TRIGGER`, attestation `SELECT`. |
| Restored the dangerous grants on a kept stack (manual, then reverted) | Suite E: E1, E5 and E6 **fail**. A forged award was actually created and then removed. This shows the suite detects the regression. |
| Accepted migrations + SB3 on the kept stack with the **old** D12 | D12 tripwire fails as designed. The test is now updated to assert `403 42501` for both service credentials and no row. |
| `node --experimental-strip-types --test tests/accountDatabase/*.test.ts` | 30 / 0 / 0 (includes the new `accountSb3Static.test.ts`) |
| `node --experimental-strip-types --test tests/accountVerification/*.test.ts` | 57 / 0 / 0 |
| `bash tests/accountSupabase/runLocalSupabaseGuard.test.sh` | pass |
| `npm run lint`, `npm run build`, `git diff --check` | pass |
| Ad-hoc strict `tsc --noEmit` over the new and changed test files (tests are outside the project `tsc -b`) | pass |

**Positive controls on the real stack:**

- **E3:** authenticated reconcile still writes a receipt and quarantined claims. The claim is not read back as earned, and `guestRetentionRequired` stays `true` on replay. User B sees none of user A's rows.
- **E4:** the dedicated verifier LOGIN admits exactly once with one attestation, and replay returns `alreadyEarned`. A later reconcile sets `card_viewed`, but identity, date, provenance and Card snapshot stay byte-identical.
- **E7:** service_role keeps SELECT and its reader-state DML. This was not a blanket revoke.
- **U4/U6:** pre-existing earned history, attestation, pending claim and receipts are byte-identical after the upgrade. The preserved claim is admitted once, and the old award keeps its earned date and flags.

**Confidentiality:** fixtures are synthetic: `example.test` users and a synthetic Card with a fixture URL. The upgrade state file holds only synthetic UUIDs and md5 digests, lives in a runner-owned temp dir and is deleted on exit. A grep of every run log for JWT, `sb_secret_`/`sb_publishable_` and DB-credential patterns found **0** matches.

## 6. Not tested / limitations / residual exceptions

- **Hosted Supabase:** not tested and not touched. Hosted projects may differ, for example in `service_role`'s schema CREATE, extra extensions, or dashboard tooling. The migration's in-transaction assertions fail closed if effective privileges differ.
- **GraphQL:** `pg_graphql` is not installed on the local stack (`/graphql/v1` returns "not enabled"), so mutations there were not exercised. pg_graphql enforces the same table privileges.
- **Plain-Postgres suites** (`scripts/accountDatabase/run-local-*.sh`) list migrations explicitly and were not changed or run. They are outside this Issue's write area, and the real Supabase runner supersedes them for this change.
- **Residual: `BYPASSRLS` + SELECT.** `service_role` can still read every reader's account rows, as a platform administrator can. This is not a minting or evidence path.
- **Residual: reader-state DML.** `service_role` can still change profiles, in-progress rows, saved items and Shelf. None of these carries award authority. Revoking it is a possible owner decision; no evidence supported doing so here.
- **Residual: account deletion.** Deleting an `auth.users` row (GoTrue admin API with the service key) cascades to all account rows, including earned awards. This is account deletion, not forgery, and is left as designed.
- **Residual: Supabase default privileges.** `postgres` and `supabase_admin` default ACLs still grant `ALL` on future `public` tables to anon, authenticated and service_role. That is a platform setting, intentionally not changed. Any future account table must revoke explicitly. Suite E1 and check S1 fail on any unclassified `account_%` table.
- **Issuer trust:** the verifier still has residual trust in CMS facts. That is unchanged and documented in R13-VERIFY1.
