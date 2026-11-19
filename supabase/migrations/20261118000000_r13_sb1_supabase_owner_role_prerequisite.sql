-- Bibleberry R13-SB1: Supabase owner-role membership prerequisite
-- Issue: #210 (Phase 05 / R13-SB1)
-- Evidence: docs/testing/r13-sb1-real-local-supabase-security-acceptance.md §3
--
-- Why this exists (reproduced on a real local `supabase start` stack, PostgreSQL 17):
--   The Supabase migration runner is `postgres`, which is NOT a superuser (it has CREATEROLE).
--   Since PostgreSQL 16, when a CREATEROLE non-superuser runs CREATE ROLE it receives an
--   automatic membership in the new role with ADMIN OPTION but INHERIT FALSE and SET FALSE
--   (createrole_self_grant is empty). The accepted R13-TX1 and R13-VERIFY1 migrations guard
--   their self-grant with `pg_has_role(current_user, <role>, 'MEMBER')`, which is already TRUE
--   for that ADMIN-only membership, so the grant is skipped. `ALTER FUNCTION ... OWNER TO`
--   then fails with "must be able to SET ROLE" (SQLSTATE 42501) and the migration aborts.
--
-- Why it is ordered BEFORE R13-TX1 (deliberate deviation from "forward-only after"):
--   Accepted migrations must not be edited, and the defect aborts R13-TX1 itself, so no
--   migration ordered after it could ever run. This file only prepares the two owner roles
--   that R13-TX1/R13-VERIFY1 create conditionally (`IF NOT EXISTS`), with byte-identical
--   attributes, and gives a non-superuser runner the SET capability those migrations already
--   intended it to have. No account table, policy, grant or function is created or changed.
--
-- Scope / least privilege:
--   - Membership is INHERIT TRUE, SET TRUE: exactly what R13-TX1/R13-VERIFY1's own
--     `GRANT <role> TO current_user` would have produced for the (INHERIT) runner. INHERIT is
--     required, not optional: after `OWNER TO`, the same migrations COMMENT on, REVOKE from
--     and GRANT on the transferred functions. Without owner privileges a non-owner REVOKE only
--     raises a WARNING and silently revokes nothing (reproduced), which would leave Supabase's
--     default function grants in place.
--   - `account_award_verifier` is NOT created or granted here; it owns nothing and remains
--     created by R13-VERIFY1 with no members.
--   - Superuser runners (plain PostgreSQL test harness) are unaffected: role creation is the
--     only effect, exactly as R13-TX1/R13-VERIFY1 would have done.
--   - Idempotent: safe on databases where the roles or memberships already exist.

BEGIN;

DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['account_reconciler', 'account_award_issuer'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format(
        'CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',
        v_role
      );
    END IF;

    IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user)
       AND NOT (pg_has_role(current_user, v_role, 'SET')
                AND pg_has_role(current_user, v_role, 'USAGE')) THEN
      EXECUTE format('GRANT %I TO %I WITH INHERIT TRUE, SET TRUE', v_role, current_user);
    END IF;
  END LOOP;

  -- Defect 2: for a non-superuser, ALTER ... OWNER TO also requires the NEW owner to hold
  -- CREATE on the object's schema. R13-TX1 assigns a `public` function to account_reconciler;
  -- R13-VERIFY1 assigns functions in its own new `account_issuance` schema to
  -- account_award_issuer. Grant exactly that, TEMPORARILY. Migration
  -- 20261118000003_r13_sb1_supabase_owner_role_cleanup.sql revokes all of it again, so the
  -- final privilege state is the accepted design (ownership persists after the revoke).
  IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) THEN
    GRANT CREATE ON SCHEMA public TO account_reconciler;
    -- account_issuance does not exist yet; only a default privilege for schemas this runner
    -- creates next can reach it.
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I GRANT CREATE ON SCHEMAS TO account_award_issuer',
      current_user
    );
  END IF;
END
$$;

COMMIT;
