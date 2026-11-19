-- R13-SB2 (Issue #225): D1–D4 catalog and runtime checks on a REAL local Supabase stack.
--
-- Run ONLY by scripts/accountSupabase/run-local-supabase-acceptance.sh, as the Supabase
-- migration identity `postgres` (CREATEROLE, NOT superuser), INSIDE a transaction the caller
-- opens and then ROLLS BACK. This file never contains BEGIN/COMMIT itself, so it can follow the
-- migrations inside the same rolled-back transaction in the mutation demonstrations.
--
-- Every failure raises 'SB2-CHECK <id> ...' (or the real permission error being guarded).

\set ON_ERROR_STOP 1

DO $$
BEGIN
  IF current_user <> 'postgres' OR (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) THEN
    RAISE EXCEPTION 'SB2-CHECK setup: must run as the non-superuser Supabase migration identity postgres';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- D1: owner-role memberships are exactly what the migrations intend
-- ---------------------------------------------------------------------------
DO $$
DECLARE v text;
BEGIN
  -- The only member of each owner role is the migration runner, with SET + INHERIT.
  SELECT string_agg(r.rolname || '>' || m.rolname, ', ') INTO v
    FROM pg_auth_members a JOIN pg_roles r ON r.oid = a.roleid JOIN pg_roles m ON m.oid = a.member
   WHERE r.rolname IN ('account_reconciler', 'account_award_issuer') AND m.rolname <> 'postgres';
  IF v IS NOT NULL THEN RAISE EXCEPTION 'SB2-CHECK D1a unexpected owner-role members: %', v; END IF;
  IF NOT (pg_has_role('postgres', 'account_reconciler', 'SET') AND pg_has_role('postgres', 'account_reconciler', 'USAGE')
          AND pg_has_role('postgres', 'account_award_issuer', 'SET') AND pg_has_role('postgres', 'account_award_issuer', 'USAGE')) THEN
    RAISE EXCEPTION 'SB2-CHECK D1b runner lacks SET/INHERIT on an owner role';
  END IF;
  -- Nothing but the runner's automatic ADMIN membership exists on the verifier group.
  SELECT string_agg(m.rolname || ':' || a.inherit_option || a.set_option || a.admin_option, ', ') INTO v
    FROM pg_auth_members a JOIN pg_roles m ON m.oid = a.member
   WHERE a.roleid = 'account_award_verifier'::regrole
     AND NOT (m.rolname = 'postgres' AND a.admin_option AND NOT a.set_option AND NOT a.inherit_option);
  IF v IS NOT NULL THEN RAISE EXCEPTION 'SB2-CHECK D1c unexpected verifier members: %', v; END IF;
  -- No account role is itself a member of anything (no inherited authority).
  SELECT string_agg(m.rolname || ' in ' || r.rolname, ', ') INTO v
    FROM pg_auth_members a JOIN pg_roles r ON r.oid = a.roleid JOIN pg_roles m ON m.oid = a.member
   WHERE m.rolname LIKE 'account\_%';
  IF v IS NOT NULL THEN RAISE EXCEPTION 'SB2-CHECK D1d account role holds a membership: %', v; END IF;
  -- No API role can reach an account role.
  SELECT string_agg(api || '->' || acct, ', ') INTO v
    FROM unnest(ARRAY['anon', 'authenticated', 'service_role', 'authenticator']) api,
         unnest(ARRAY['account_reconciler', 'account_award_issuer', 'account_award_verifier']) acct
   WHERE pg_has_role(api, acct, 'MEMBER');
  IF v IS NOT NULL THEN RAISE EXCEPTION 'SB2-CHECK D1e API role is a member of: %', v; END IF;
  RAISE NOTICE 'ok - SB2 D1 owner memberships: runner only (SET+INHERIT), no API/account-role memberships';
END $$;

-- ---------------------------------------------------------------------------
-- D2: no lingering owner CREATE, no default privilege for an account role
-- ---------------------------------------------------------------------------
DO $$
DECLARE v text;
BEGIN
  SELECT string_agg(r.rolname || ' CREATE on ' || n.nspname, ', ') INTO v
    FROM pg_namespace n CROSS JOIN pg_roles r
   WHERE r.rolname LIKE 'account\_%' AND has_schema_privilege(r.oid, n.oid, 'CREATE')
     AND n.nspname !~ '^pg_(toast_)?temp_';
  IF v IS NOT NULL THEN RAISE EXCEPTION 'SB2-CHECK D2a owner role retains schema CREATE: %', v; END IF;
  SELECT string_agg(a.grantee::regrole::text, ', ') INTO v
    FROM pg_default_acl d, aclexplode(d.defaclacl) a
   WHERE a.grantee IN (SELECT oid FROM pg_roles WHERE rolname LIKE 'account\_%');
  IF v IS NOT NULL THEN RAISE EXCEPTION 'SB2-CHECK D2b default privilege names: %', v; END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.reconcile_guest_participation(jsonb)'::regprocedure
                AND pg_get_userbyid(proowner) <> 'account_reconciler')
     OR EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'account_issuance'::regnamespace
                   AND pg_get_userbyid(proowner) <> 'account_award_issuer') THEN
    RAISE EXCEPTION 'SB2-CHECK D2c ownership transfer did not happen';
  END IF;
  RAISE NOTICE 'ok - SB2 D2 owners assigned; no account role holds CREATE anywhere or a default privilege';
END $$;

-- ---------------------------------------------------------------------------
-- D3: no function-level placeholder GUC and no parameter privilege was needed
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p, unnest(p.proconfig) c WHERE c LIKE 'bibleberry.%') THEN
    RAISE EXCEPTION 'SB2-CHECK D3a a function still SETs a bibleberry.* GUC';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_parameter_acl WHERE parname LIKE 'bibleberry.%') THEN
    RAISE EXCEPTION 'SB2-CHECK D3b a bibleberry.* parameter privilege exists';
  END IF;
  RAISE NOTICE 'ok - SB2 D3 no bibleberry.* function SET clause and no parameter ACL';
END $$;

-- ---------------------------------------------------------------------------
-- D4: the auth.uid() bridge is minimal, postgres-owned and reconciler-only
-- ---------------------------------------------------------------------------
DO $$
DECLARE p record; v text;
BEGIN
  SELECT pr.prosecdef, pr.provolatile, pr.pronargs, pr.proconfig, l.lanname,
         btrim(pr.prosrc, E' \n\t') AS body, pg_get_userbyid(pr.proowner) AS owner
    INTO p FROM pg_proc pr JOIN pg_language l ON l.oid = pr.prolang
   WHERE pr.oid = 'account_private.request_account_id()'::regprocedure;
  IF NOT (p.prosecdef AND p.lanname = 'sql' AND p.provolatile = 's' AND p.pronargs = 0
          AND p.proconfig = ARRAY['search_path=""'] AND p.body = 'SELECT auth.uid();' AND p.owner = 'postgres') THEN
    RAISE EXCEPTION 'SB2-CHECK D4a request_account_id() definition widened: %', row_to_json(p);
  END IF;
  SELECT string_agg(a.grantee::regrole::text, ', ') INTO v
    FROM pg_proc pr, aclexplode(pr.proacl) a
   WHERE pr.oid = 'account_private.request_account_id()'::regprocedure
     AND a.grantee NOT IN ('postgres'::regrole, 'account_reconciler'::regrole);
  IF v IS NOT NULL OR (SELECT proacl IS NULL FROM pg_proc WHERE oid = 'account_private.request_account_id()'::regprocedure) THEN
    RAISE EXCEPTION 'SB2-CHECK D4b request_account_id() ACL names: % (NULL ACL = PUBLIC default)', coalesce(v, 'PUBLIC');
  END IF;
  SELECT string_agg(r, ', ') INTO v
    FROM unnest(ARRAY['anon', 'authenticated', 'service_role', 'authenticator',
                      'account_award_issuer', 'account_award_verifier']) r
   WHERE has_function_privilege(r, 'account_private.request_account_id()', 'EXECUTE');
  IF v IS NOT NULL THEN RAISE EXCEPTION 'SB2-CHECK D4c can execute request_account_id(): %', v; END IF;
  IF has_schema_privilege('account_reconciler', 'auth', 'USAGE') THEN
    RAISE EXCEPTION 'SB2-CHECK D4d account_reconciler unexpectedly holds auth USAGE';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE 'account_reconciler' = ANY (roles)
                AND (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%auth.uid()%') THEN
    RAISE EXCEPTION 'SB2-CHECK D4e a reconciler policy still calls auth.uid() directly';
  END IF;
  RAISE NOTICE 'ok - SB2 D4 bridge: postgres-owned SQL definer, empty search_path, body = auth.uid() only, reconciler-only EXECUTE';
END $$;

-- D4 runtime: with a JWT claim set exactly as PostgREST sets it, the reconciler gets the CALLER's
-- subject through the bridge and cannot call auth.uid() itself.
SELECT set_config('request.jwt.claims',
  '{"sub":"5b2a0000-0000-4000-8000-00000000d4a1","role":"authenticated"}', true) \g /dev/null
SET LOCAL ROLE account_reconciler;
DO $$
DECLARE v_denied boolean := false;
BEGIN
  IF account_private.request_account_id() IS DISTINCT FROM '5b2a0000-0000-4000-8000-00000000d4a1'::uuid THEN
    RAISE EXCEPTION 'SB2-CHECK D4f bridge did not return the session subject';
  END IF;
  PERFORM set_config('request.jwt.claims', '{"sub":"5b2a0000-0000-4000-8000-00000000d4b2","role":"authenticated"}', true);
  IF account_private.request_account_id() IS DISTINCT FROM '5b2a0000-0000-4000-8000-00000000d4b2'::uuid THEN
    RAISE EXCEPTION 'SB2-CHECK D4g bridge did not follow a changed session subject';
  END IF;
  BEGIN
    PERFORM auth.uid();
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'SB2-CHECK D4h account_reconciler can call auth.uid() directly'; END IF;
  RAISE NOTICE 'ok - SB2 D4 runtime: reconciler gets the caller''s subject only via the bridge';
END $$;
RESET ROLE;

-- The real client path: the definer transaction and the reader must work under `authenticated`
-- with no auth grant to the reconciler (a restored direct auth.uid() fails here with
-- "permission denied for schema auth").
SET LOCAL ROLE authenticated;
DO $$
DECLARE r jsonb; v_denied boolean := false;
BEGIN
  r := public.reconcile_guest_participation('{}'::jsonb);
  IF r ->> 'status' IS DISTINCT FROM 'rejected' THEN
    RAISE EXCEPTION 'SB2-CHECK D4i reconcile under authenticated returned %', r;
  END IF;
  r := public.get_account_participation();
  IF r ->> 'status' IS DISTINCT FROM 'notFound' THEN
    RAISE EXCEPTION 'SB2-CHECK D4j get_account_participation under authenticated returned %', r;
  END IF;
  BEGIN
    PERFORM account_private.request_account_id();
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'SB2-CHECK D4k authenticated can execute the bridge'; END IF;
  RAISE NOTICE 'ok - SB2 D4 runtime: authenticated reconcile/read work; authenticated cannot use the bridge';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- D3 runtime: a caller preset never survives an issuer call that confines nothing
-- ---------------------------------------------------------------------------
-- Rolled back by the caller: lets this non-superuser session act as the verifier group.
GRANT account_award_verifier TO postgres WITH INHERIT FALSE, SET TRUE;
SELECT set_config('bibleberry.award_issuance_account', '5b2a0000-0000-4000-8000-00000000d3f6', true) \g /dev/null
SET LOCAL ROLE account_award_verifier;
SELECT account_issuance.get_claim_verification_context('5b2a0000-0000-4000-8000-00000000d3e5', 'card:monthly:2026-10:none') \g /dev/null
RESET ROLE;
DO $$
BEGIN
  IF current_setting('bibleberry.award_issuance_account', true) IS DISTINCT FROM '' THEN
    RAISE EXCEPTION 'SB2-CHECK D3c caller preset survived get_claim_verification_context: %',
      current_setting('bibleberry.award_issuance_account', true);
  END IF;
END $$;
SELECT set_config('bibleberry.award_issuance_account', '5b2a0000-0000-4000-8000-00000000d3f6', true) \g /dev/null
SET LOCAL ROLE account_award_verifier;
SELECT account_issuance.admit_verified_award('{"unexpected": true}'::jsonb) \g /dev/null
SELECT account_issuance.record_verification_deferral('5b2a0000-0000-4000-8000-00000000d3e5', 'card:monthly:2026-10:none', 'x', 1) \g /dev/null
RESET ROLE;
DO $$
BEGIN
  IF current_setting('bibleberry.award_issuance_account', true) IS DISTINCT FROM '' THEN
    RAISE EXCEPTION 'SB2-CHECK D3d caller preset survived admission/deferral early returns: %',
      current_setting('bibleberry.award_issuance_account', true);
  END IF;
  RAISE NOTICE 'ok - SB2 D3 runtime: caller presets are discarded on entry by every confining issuer function';
END $$;

\echo 'SB2 remediation checks: all passed.'
