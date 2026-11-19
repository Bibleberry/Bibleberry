-- Bibleberry R13-SB1: revoke the temporary owner-role schema privileges
-- Issue: #210 (Phase 05 / R13-SB1)
-- Pair of: 20261118000000_r13_sb1_supabase_owner_role_prerequisite.sql
--
-- The prerequisite migration temporarily gave the two owner roles CREATE on the schemas whose
-- functions they must own, because a non-superuser migration runner (Supabase `postgres`) can
-- only run `ALTER FUNCTION ... OWNER TO` when the new owner holds CREATE there. Ownership is
-- now assigned, so CREATE is no longer needed and is removed. The resulting privileges are
-- exactly those of the accepted R13-TX1/R13-VERIFY1 design:
--   - neither owner role may create objects in any schema;
--   - no default privilege remains that would hand CREATE on future schemas to anyone.
--
-- Unconditional and idempotent: on a superuser-run database (plain PostgreSQL harness) these
-- privileges were never granted and every statement is a no-op.

BEGIN;

REVOKE CREATE ON SCHEMA public FROM account_reconciler;
REVOKE CREATE ON SCHEMA public FROM account_award_issuer;
REVOKE CREATE ON SCHEMA account_private FROM account_reconciler, account_award_issuer;
REVOKE CREATE ON SCHEMA account_issuance FROM account_reconciler, account_award_issuer;

DO $$
BEGIN
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE CREATE ON SCHEMAS FROM account_award_issuer',
    current_user
  );
END
$$;

-- Fail the migration loudly if any CREATE privilege for an owner role survived.
DO $$
DECLARE
  v_leak text;
BEGIN
  SELECT string_agg(format('%s on %s', r.rolname, n.nspname), ', ')
    INTO v_leak
    FROM pg_namespace n
    CROSS JOIN pg_roles r
   WHERE r.rolname IN ('account_reconciler', 'account_award_issuer', 'account_award_verifier')
     AND has_schema_privilege(r.oid, n.oid, 'CREATE');
  IF v_leak IS NOT NULL THEN
    RAISE EXCEPTION 'R13-SB1: owner role still holds schema CREATE: %', v_leak;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_default_acl d, aclexplode(d.defaclacl) a
     WHERE d.defaclobjtype = 'n'
       AND a.grantee IN (
         SELECT oid FROM pg_roles
          WHERE rolname IN ('account_reconciler', 'account_award_issuer', 'account_award_verifier')
       )
  ) THEN
    RAISE EXCEPTION 'R13-SB1: a default schema privilege for an owner role survived';
  END IF;
END
$$;

COMMIT;
