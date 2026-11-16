# Bibleberry R13-3 — Supabase Account Schema, Isolation & RLS Foundation

> **Issue:** [#163](https://github.com/ContraPhilosophy/Bibleberry/issues/163) (`Phase 05 / R13-3`)  
> **Baseline `main`:** `425fcbb56e7d8a474c6cc732342860ef215199eb`  
> **Scope Boundary:** Offline database migration ([`supabase/migrations/20261116000001_r13_3_account_schema_and_rls.sql`](../../supabase/migrations/20261116000001_r13_3_account_schema_and_rls.sql)), repeatable local PostgreSQL RLS/constraint test fixtures ([`tests/accountDatabase/`](../../tests/accountDatabase/)), and this architecture/evidence note. Zero live Supabase provisioning, remote SQL execution, auth UI, or compare-and-commit RPC implementation is included.

---

## 1. Schema-to-R13-0 Mapping

The migration provisions the 8 owner-scoped tables specified in [R13-0 §3](r13-0-account-reconciliation-contract.md#3-proposed-account-bound-relational-data-model-supabase-postgresql), each referencing `auth.users(id) ON DELETE CASCADE`:

| Table | Primary Key / Unique Keys | R13-0 / R13-1 Mapping & Key Invariants |
| --- | --- | --- |
| `public.account_participation_profiles` | `account_id` (PK) | Maps to `ProposedAccountParticipationEnvelope` header (`namespace = 'cms'`, `schema_version = 1`, `revision >= 0`), `LastOpenedChallengePointer` (`last_opened_challenge_id`, `last_opened_on`, `resume_dismissed_on` paired via `chk_profiles_last_opened_pair`), and Shelf metadata (`active_focus_month`, `shelf_updated_on`). |
| `public.account_completed_challenges` | `(account_id, challenge_id)` (PK) | Maps to `ProposedAccountCompletedChallengeRecord` (`completed_on`, `date_provenance IN ('serverVerified', 'clientReported')`, `client_claimed_on`, `first_recorded_at`). Enforces `cms:<id>` format and rejects `cms:drafts.*`. |
| `public.account_in_progress_challenges` | `(account_id, challenge_id)` (PK) | Maps to `ChallengeResumeRecord` (`screen_id`, `updated_on`, `unresolved_conflict`). Mutual exclusion with `account_completed_challenges` is enforced transactionally by the future merge RPC. |
| `public.account_saved_challenges` | `(account_id, challenge_id)` (PK) | Maps to `SavedChallengeRecord` (`saved_on`). Cross-device unsave tombstones remain deferred per R13-0 §4.3. |
| `public.account_saved_scriptures` | `(account_id, scripture_key)` (PK) | Maps to `SavedScriptureRecord` (`scripture_key` as `<normalizedRef>\|<normalizedTranslationOrEmpty>`, `reference`, `translation`, `saved_on`, `source_challenge_id`). Indexed by `(account_id, saved_on ASC, scripture_key ASC)` for R13-0 §4.4 ordering. Stores zero passage manuscript text. |
| `public.account_earned_awards` | `(account_id, award_id)` (PK) | Maps to `ProposedAccountEarnedAwardRecord`. Enforces `card:monthly:YYYY-MM:<slug>` format, `kind` (`thematic` / `fullMonth`) consistency, `discovery_id` consistency, independent `hub_announcement_acked` / `card_viewed` booleans, and rejects `passageText` / `manuscriptText` keys inside `earned_card_snapshot`. |
| `public.account_shelf_months` | `(account_id, year_month)` (PK), `UNIQUE (account_id, slot_order)` | Maps to `ProposedAccountShelfEntry` (`admission_kind IN ('readerSelected', 'autoAdmitted')`, `admitted_on`, `slot_order BETWEEN 1 AND 3`). `UNIQUE (account_id, slot_order)` + `slot_order BETWEEN 1 AND 3` caps rows at `0–3` per account. Existing account Shelf precedence on guest merge is enforced by the R13-0 engine / future merge RPC. |
| `public.account_reconciliation_receipts` | `(account_id, idempotency_key)` (PK) | Maps to `CommitAckReceipt` idempotency storage (`mode`, `guest_payload_digest`, `committed_revision >= 1`, `outcome_status`, `unresolved_count`). Enables exact-once retry detection and `409 Conflict` on digest mismatch. |

---

## 2. Role Grants, Least Privilege & RLS Design

All 8 tables enable Row-Level Security (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`) and enforce strict role separation:

| Role | Table Privileges | RLS Policy | Rationale |
| --- | --- | --- | --- |
| `PUBLIC` | None (`REVOKE ALL`) | Default deny | Prevents accidental public schema exposure. |
| `anon` | None (`REVOKE ALL`) | Default deny | Unauthenticated clients have zero access to private account records. |
| `authenticated` | `SELECT` only | `USING (account_id = auth.uid())` | Readers may inspect only their own rows. Direct `INSERT`/`UPDATE`/`DELETE` is **denied** at both the SQL privilege layer and RLS policy layer so untrusted clients cannot forge `account_id`, bump `revision`, fabricate `serverVerified` dates, forge receipts, or bypass the 3-month Shelf policy. |
| `service_role` | `ALL` | `BYPASSRLS` | Reserved for future server-side compare-and-commit RPCs / Edge Functions. |

### Required Future Server Authorization (Deferred to Follow-On Issues)

This PR **does not** implement the compare-and-commit RPC or Supabase Auth client. Future R13 issues must implement:

1. **Transactional `reconcile_guest_participation` RPC (`SECURITY DEFINER` or `service_role`):**
   - Derive `account_id` exclusively from `auth.uid()` (never trust client-supplied `account_id`).
   - Lock the account's `account_participation_profiles` row (`SELECT ... FOR UPDATE`), verify `expected_revision`, and check `account_reconciliation_receipts` for `(account_id, idempotency_key)` (returning the cached receipt if `guest_payload_digest` matches, or raising `409 Conflict` if it differs).
   - Enforce server-verified date bounds (`Option 1C` / `UTC+14` ceiling), Challenge/Award release-date floors, `completed` vs. `in_progress` mutual exclusion, monotonic award flags (`OR`), and existing-account Shelf precedence (`0–3` months).
   - Atomically insert/update the 8 tables, increment `revision`, and record the receipt.
2. **Auth Session & Cache Isolation:**
   - Sign-out / account-switch must clear cached account state so Account A never leaks into Account B.

---

## 3. Migration & Rollback Strategy

- **Forward Migration:** Versioned SQL file `supabase/migrations/20261116000001_r13_3_account_schema_and_rls.sql`, wrapped in `BEGIN; ... COMMIT;`.
- **Rollback Strategy (Manual / Local Dev Only):** Because this migration introduces only new `public.account_*` tables with no mutations to existing tables or data, rollback in a non-production environment is a clean reverse-dependency drop:
  ```sql
  BEGIN;
  DROP TABLE IF EXISTS
    public.account_reconciliation_receipts,
    public.account_shelf_months,
    public.account_earned_awards,
    public.account_saved_scriptures,
    public.account_saved_challenges,
    public.account_in_progress_challenges,
    public.account_completed_challenges,
    public.account_participation_profiles;
  COMMIT;
  ```
  In production (once live data exists), forward-fix migrations must be used instead of `DROP TABLE`.

---

## 4. Local Integration Test Instructions & Verification Results

### How to Run the Local PostgreSQL RLS & Constraint Integration Suite

**Prerequisites:** Local PostgreSQL server and `psql` CLI (or local `supabase start` stack) with an isolated test database. Never run against live/staging/production Supabase.

```bash
LOCAL_TEST_DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5432/bibleberry_r13_test" \
  ./scripts/accountDatabase/run-local-rls-tests.sh
```

The runner executes:
1. `tests/accountDatabase/00_local_supabase_auth_bootstrap.sql` (creates `anon`, `authenticated`, `service_role`, `auth.users`, and `auth.uid()`).
2. `supabase/migrations/20261116000001_r13_3_account_schema_and_rls.sql`.
3. `tests/accountDatabase/01_r13_3_rls_and_schema_integration.sql` (wrapped in `BEGIN; ... ROLLBACK;`, covering table RLS flags, privilege checks, `CHECK`/`UNIQUE` constraints, independent award flags, `anon` denial, `authenticated` owner isolation & write denial, and `ON DELETE CASCADE`).

### Verification Results & Limitations

- **Verified in this environment:**
  - `node --experimental-strip-types --test tests/accountDatabase/accountSchemaStatic.test.ts` — **4 passed, 0 failed** (static structural validation of the migration SQL and test fixture).
- **Not executed in this environment (runtime limitation):**
  - `scripts/accountDatabase/run-local-rls-tests.sh` (`00_local_supabase_auth_bootstrap.sql`, migration DDL execution, and `01_r13_3_rls_and_schema_integration.sql`) **could not be executed** because `psql`, `postgres`, `supabase`, and `docker` are not installed on the local machine. Live PostgreSQL execution of constraints, RLS policies, and `ON DELETE CASCADE` remains unverified until run against a local PostgreSQL or Supabase CLI instance.
