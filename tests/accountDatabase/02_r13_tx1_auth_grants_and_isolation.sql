-- Bibleberry R13-TX1: SQL authorization, grant, RLS and owner-isolation suite.
-- LOCAL DISPOSABLE DATABASE ONLY. Requires bootstrap + R13-3 + R13-TX1 migrations.
-- Run via scripts/accountDatabase/run-local-transaction-tests.sh.
--
-- This file covers the SECURITY BOUNDARY only. Data/merge invariants live in
-- 03_r13_tx1_transaction_invariants.sql; true multi-session concurrency in
-- 04_r13_tx1_concurrency.sh.

\set ON_ERROR_STOP 1

BEGIN;

\ir _r13_tx1_test_helpers.sql

INSERT INTO auth.users (id) VALUES
  ('a0000000-0000-4000-8000-00000000000a'),
  ('b0000000-0000-4000-8000-00000000000b');

-- ---------------------------------------------------------------------------
-- S1. Function definition: SECURITY DEFINER, fixed empty search_path, dedicated owner
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_def boolean; v_owner text; v_cfg text[];
BEGIN
  SELECT p.prosecdef, pg_get_userbyid(p.proowner), p.proconfig
    INTO v_def, v_owner, v_cfg
    FROM pg_proc p WHERE p.oid = 'public.reconcile_guest_participation(jsonb)'::regprocedure;
  PERFORM pg_temp.check(v_def, 'S1a reconcile_guest_participation is SECURITY DEFINER');
  PERFORM pg_temp.check(v_owner = 'account_reconciler', 'S1b owned by account_reconciler (not a superuser/table owner)');
  PERFORM pg_temp.check('search_path=""' = ANY (v_cfg), 'S1c fixed empty search_path');

  SELECT p.prosecdef, p.proconfig INTO v_def, v_cfg
    FROM pg_proc p WHERE p.oid = 'public.get_account_participation()'::regprocedure;
  PERFORM pg_temp.check(NOT v_def, 'S1d get_account_participation is SECURITY INVOKER (RLS applies)');
  PERFORM pg_temp.check('search_path=""' = ANY (v_cfg), 'S1e read function has fixed search_path');

  PERFORM pg_temp.check(NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'account_private'
       AND (p.proconfig IS NULL OR NOT ('search_path=""' = ANY (p.proconfig)))
  ), 'S1f every account_private helper pins search_path');
  -- R13-SB2 D4: exactly ONE definer helper is allowed in account_private: the auth.uid() bridge.
  PERFORM pg_temp.check(NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'account_private' AND p.prosecdef
       AND p.oid <> 'account_private.request_account_id()'::regprocedure
  ), 'S1g no account_private helper other than request_account_id() is SECURITY DEFINER');
END $$;

-- ---------------------------------------------------------------------------
-- S1h. R13-SB2 D4: account_private.request_account_id() is a minimal, reconciler-only bridge
-- ---------------------------------------------------------------------------
DO $$
DECLARE p record;
BEGIN
  SELECT pr.prosecdef, pr.provolatile, pr.pronargs, pr.prorettype::regtype::text AS rettype,
         pr.proconfig, l.lanname, btrim(pr.prosrc, E' \n\t') AS body, pg_get_userbyid(pr.proowner) AS owner
    INTO p
    FROM pg_proc pr JOIN pg_language l ON l.oid = pr.prolang
   WHERE pr.oid = 'account_private.request_account_id()'::regprocedure;
  PERFORM pg_temp.check(p.prosecdef AND p.lanname = 'sql' AND p.provolatile = 's'
                    AND p.pronargs = 0 AND p.rettype = 'uuid',
    'S1h1 request_account_id() is a zero-argument STABLE SQL SECURITY DEFINER returning uuid');
  PERFORM pg_temp.check(p.proconfig = ARRAY['search_path=""'],
    'S1h2 request_account_id() pins an empty search_path and nothing else');
  PERFORM pg_temp.check(p.body = 'SELECT auth.uid();',
    'S1h3 request_account_id() body is exactly one auth.uid() call (no table, no other SQL)');
  PERFORM pg_temp.check(p.owner NOT LIKE 'account\_%' AND p.owner NOT IN ('anon', 'authenticated', 'service_role'),
    'S1h4 request_account_id() is owned by the migration runner, not an account/client role');
  PERFORM pg_temp.check(has_function_privilege('account_reconciler', 'account_private.request_account_id()', 'EXECUTE'),
    'S1h5 account_reconciler may execute request_account_id()');
  PERFORM pg_temp.check(NOT has_function_privilege('public', 'account_private.request_account_id()', 'EXECUTE')
                    AND NOT has_function_privilege('anon', 'account_private.request_account_id()', 'EXECUTE')
                    AND NOT has_function_privilege('authenticated', 'account_private.request_account_id()', 'EXECUTE')
                    AND NOT has_function_privilege('service_role', 'account_private.request_account_id()', 'EXECUTE'),
    'S1h6 PUBLIC/anon/authenticated/service_role cannot execute request_account_id()');
  PERFORM pg_temp.check(NOT EXISTS (
    SELECT 1 FROM pg_proc pr, aclexplode(pr.proacl) a
     WHERE pr.oid = 'account_private.request_account_id()'::regprocedure
       AND a.privilege_type = 'EXECUTE'
       AND a.grantee NOT IN (pr.proowner, 'account_reconciler'::regrole)
  ), 'S1h7 request_account_id() ACL names only its owner and account_reconciler');
  PERFORM pg_temp.check(NOT has_schema_privilege('account_reconciler', 'auth', 'USAGE'),
    'S1h8 account_reconciler holds NO USAGE on schema auth (no silent no-op grant relied upon)');
  -- R13-SB2 D2: the temporary ownership-transfer CREATE was revoked in the migration itself.
  PERFORM pg_temp.check(NOT EXISTS (
    SELECT 1 FROM pg_namespace n CROSS JOIN pg_roles r
     WHERE r.rolname LIKE 'account\_%' AND has_schema_privilege(r.oid, n.oid, 'CREATE')
       -- (a session's own temp schema reports CREATE for any role; not a real grant)
       AND n.nspname !~ '^pg_(toast_)?temp_'
  ), 'S1h9 no account_* role holds CREATE on any schema');
  PERFORM pg_temp.check(NOT EXISTS (
    SELECT 1 FROM pg_default_acl d, aclexplode(d.defaclacl) a
     WHERE a.grantee IN (SELECT oid FROM pg_roles WHERE rolname LIKE 'account\_%')
  ), 'S1h10 no default privilege names an account_* role');
END $$;

-- S1i. The helper returns exactly the CALLER's verified subject; direct auth.uid() is denied to
--      the reconciler (it lacks auth USAGE), so the bridge is the only path.
SAVEPOINT s1i;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-00000000000a', true);
SET LOCAL ROLE account_reconciler;
DO $$
DECLARE v_denied boolean := false;
BEGIN
  PERFORM pg_temp.check(account_private.request_account_id() = 'a0000000-0000-4000-8000-00000000000a',
    'S1i1 as account_reconciler, request_account_id() = the session subject (A)');
  PERFORM set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-00000000000b', true);
  PERFORM pg_temp.check(account_private.request_account_id() = 'b0000000-0000-4000-8000-00000000000b',
    'S1i2 a different session subject (B) is returned as B (no caching across claims)');
  BEGIN
    PERFORM auth.uid();
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  PERFORM pg_temp.check(v_denied, 'S1i3 account_reconciler cannot call auth.uid() directly');
END $$;
ROLLBACK TO SAVEPOINT s1i;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- S2. Elevated owner role attributes
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM pg_roles WHERE rolname = 'account_reconciler';
  PERFORM pg_temp.check(NOT r.rolcanlogin, 'S2a account_reconciler cannot log in');
  PERFORM pg_temp.check(NOT r.rolsuper AND NOT r.rolbypassrls, 'S2b account_reconciler is not superuser and cannot bypass RLS');
  PERFORM pg_temp.check(NOT r.rolcreaterole AND NOT r.rolcreatedb, 'S2c account_reconciler cannot create roles/databases');
  PERFORM pg_temp.check(NOT pg_has_role('authenticated', 'account_reconciler', 'MEMBER')
                    AND NOT pg_has_role('anon', 'account_reconciler', 'MEMBER')
                    AND NOT pg_has_role('service_role', 'account_reconciler', 'MEMBER'),
    'S2d no client role is a member of account_reconciler');

  -- Permanence enforced at the privilege layer, not just in function logic.
  PERFORM pg_temp.check(NOT has_table_privilege('account_reconciler', 'public.account_completed_challenges', 'UPDATE,DELETE,TRUNCATE'),
    'S2e completions are insert-only for the transaction');
  PERFORM pg_temp.check(NOT has_table_privilege('account_reconciler', 'public.account_earned_awards', 'INSERT,DELETE,TRUNCATE'),
    'S2f the transaction can neither CREATE nor delete earned awards (no trusted verification path)');
  PERFORM pg_temp.check(NOT has_table_privilege('account_reconciler', 'public.account_provisional_award_claims', 'DELETE,TRUNCATE')
                    AND NOT has_column_privilege('account_reconciler', 'public.account_provisional_award_claims', 'claimed_earned_on', 'UPDATE')
                    AND NOT has_column_privilege('account_reconciler', 'public.account_provisional_award_claims', 'verification_status', 'UPDATE'),
    'S2f2 quarantined claims cannot be deleted, re-dated, or self-verified by the transaction');
  PERFORM pg_temp.check(NOT has_column_privilege('account_reconciler', 'public.account_earned_awards', 'earned_on', 'UPDATE')
                    AND NOT has_column_privilege('account_reconciler', 'public.account_earned_awards', 'date_provenance', 'UPDATE')
                    AND NOT has_column_privilege('account_reconciler', 'public.account_earned_awards', 'award_id', 'UPDATE'),
    'S2g award identity / earned_on / provenance are not UPDATE-able');
  PERFORM pg_temp.check(NOT has_column_privilege('account_reconciler', 'public.account_earned_awards', 'earned_card_snapshot', 'UPDATE')
                    AND NOT has_column_privilege('account_reconciler', 'public.account_earned_awards', 'card_document_id', 'UPDATE')
                    AND has_column_privilege('account_reconciler', 'public.account_earned_awards', 'card_viewed', 'UPDATE')
                    AND has_column_privilege('account_reconciler', 'public.account_earned_awards', 'hub_announcement_acked', 'UPDATE'),
    'S2g2 on earned awards the transaction may update ONLY the two presentation flags (no card metadata)');
  PERFORM pg_temp.check(NOT has_table_privilege('account_reconciler', 'public.account_reconciliation_receipts', 'UPDATE,DELETE,TRUNCATE'),
    'S2h receipts are immutable');
  PERFORM pg_temp.check(NOT has_table_privilege('account_reconciler', 'public.account_shelf_months', 'UPDATE,DELETE,TRUNCATE'),
    'S2i existing Shelf rows can never be overwritten or deleted by the merge');
  PERFORM pg_temp.check(NOT has_column_privilege('account_reconciler', 'public.account_participation_profiles', 'account_id', 'UPDATE'),
    'S2j profile owner column is not UPDATE-able');
  PERFORM pg_temp.check(NOT has_table_privilege('account_reconciler', 'auth.users', 'SELECT,INSERT,UPDATE,DELETE'),
    'S2k account_reconciler has no access to auth.users');
END $$;

-- ---------------------------------------------------------------------------
-- S3. EXECUTE grants: anon / PUBLIC / service_role denied; authenticated allowed
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM pg_temp.check(has_function_privilege('authenticated', 'public.reconcile_guest_participation(jsonb)', 'EXECUTE'),
    'S3a authenticated may EXECUTE the transaction');
  PERFORM pg_temp.check(NOT has_function_privilege('anon', 'public.reconcile_guest_participation(jsonb)', 'EXECUTE'),
    'S3b anon may NOT execute the transaction');
  PERFORM pg_temp.check(NOT has_function_privilege('public', 'public.reconcile_guest_participation(jsonb)', 'EXECUTE'),
    'S3c PUBLIC may NOT execute the transaction');
  PERFORM pg_temp.check(NOT has_function_privilege('service_role', 'public.reconcile_guest_participation(jsonb)', 'EXECUTE'),
    'S3d service_role (no end-user identity) may NOT execute the transaction');
  PERFORM pg_temp.check(NOT has_function_privilege('anon', 'public.get_account_participation()', 'EXECUTE')
                    AND NOT has_function_privilege('public', 'public.get_account_participation()', 'EXECUTE'),
    'S3e anon/PUBLIC may NOT execute the account read');
  PERFORM pg_temp.check(NOT has_schema_privilege('authenticated', 'account_private', 'USAGE')
                    AND NOT has_schema_privilege('anon', 'account_private', 'USAGE')
                    AND NOT has_schema_privilege('public', 'account_private', 'USAGE'),
    'S3f account_private schema is not reachable by clients');
  PERFORM pg_temp.check(NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'account_private'
       AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
            OR has_function_privilege('anon', p.oid, 'EXECUTE')
            OR has_function_privilege('public', p.oid, 'EXECUTE'))
  ), 'S3g no account_private helper is executable by clients');
END $$;

-- ---------------------------------------------------------------------------
-- S4. Direct client table writes remain denied on all 10 tables (R13-3 + evidence + quarantine)
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'account_participation_profiles', 'account_completed_challenges', 'account_in_progress_challenges',
    'account_saved_challenges', 'account_saved_scriptures', 'account_earned_awards',
    'account_shelf_months', 'account_reconciliation_receipts', 'account_reconciliation_unresolved_items',
    'account_provisional_award_claims'
  ] LOOP
    PERFORM pg_temp.check(NOT has_table_privilege('authenticated', 'public.' || v_table, 'INSERT,UPDATE,DELETE,TRUNCATE'),
      'S4 authenticated has no direct write on ' || v_table);
    PERFORM pg_temp.check(NOT has_table_privilege('anon', 'public.' || v_table, 'SELECT,INSERT,UPDATE,DELETE'),
      'S4 anon has no access to ' || v_table);
    PERFORM pg_temp.check((SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || v_table)::regclass),
      'S4 RLS enabled on ' || v_table);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- S5. anon cannot execute; unauthenticated `authenticated` gets typed unauthorized
-- ---------------------------------------------------------------------------
DO $$
DECLARE r jsonb;
BEGIN
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.reconcile_guest_participation('{}'::jsonb);
    RAISE EXCEPTION 'S5a expected anon EXECUTE denial';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    PERFORM pg_temp.check(true, 'S5a anon EXECUTE raises insufficient_privilege');
  END;

  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.get_account_participation();
    RAISE EXCEPTION 'S5b expected anon read denial';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    PERFORM pg_temp.check(true, 'S5b anon read raises insufficient_privilege');
  END;

  r := pg_temp.call_as(NULL, pg_temp.payload('k-anon', 0, 'newAccountTransfer', '{}'::jsonb));
  PERFORM pg_temp.check(r ->> 'status' = 'unauthorized' AND r ->> 'reason' = 'unauthenticated',
    'S5c authenticated role without auth.uid() -> unauthorized/unauthenticated');
  PERFORM pg_temp.check(pg_temp.get_as(NULL) ->> 'status' = 'unauthorized', 'S5d read without auth.uid() -> unauthorized');
END $$;

-- ---------------------------------------------------------------------------
-- S6. Forged account IDs never become authority; A cannot write into B
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  a constant text := 'a0000000-0000-4000-8000-00000000000a';
  b constant text := 'b0000000-0000-4000-8000-00000000000b';
  r jsonb;
  v_data jsonb := jsonb_build_object('completedChallenges',
                    jsonb_build_object('cms:forged-1', jsonb_build_object('completedOn', '2026-11-01')));
BEGIN
  r := pg_temp.call_as(a, pg_temp.payload('k-forge-1', 0, 'newAccountTransfer', v_data) || jsonb_build_object('accountId', b));
  PERFORM pg_temp.check(r ->> 'status' = 'unauthorized' AND r ->> 'reason' = 'accountMismatch',
    'S6a payload.accountId = B under session A -> unauthorized/accountMismatch');

  r := pg_temp.call_as(a, jsonb_set(pg_temp.payload('k-forge-2', 0, 'newAccountTransfer', v_data),
                                    '{envelope,accountId}', to_jsonb(b)));
  PERFORM pg_temp.check(r ->> 'status' = 'unauthorized' AND r ->> 'reason' = 'accountMismatch',
    'S6b envelope.accountId = B under session A -> unauthorized/accountMismatch');

  r := pg_temp.call_as(a, pg_temp.payload('k-forge-3', 0, 'newAccountTransfer', v_data) || jsonb_build_object('accountId', 42));
  PERFORM pg_temp.check(r ->> 'status' = 'unauthorized', 'S6c non-string accountId claim -> unauthorized');

  PERFORM pg_temp.check(pg_temp.row_total(b::uuid) = 0 AND pg_temp.row_total(a::uuid) = 0,
    'S6d forged attempts wrote nothing to A or B');

  -- Matching (redundant) claim is tolerated, but the account is still auth.uid().
  r := pg_temp.call_as(a, pg_temp.payload('k-a-1', 0, 'newAccountTransfer', v_data) || jsonb_build_object('accountId', upper(a)));
  PERFORM pg_temp.check(r ->> 'status' = 'committed', 'S6e matching accountId claim (any case) commits for A');
  PERFORM pg_temp.check(r -> 'receipt' ->> 'accountId' = a, 'S6f receipt accountId is the authenticated account');
  PERFORM pg_temp.check(pg_temp.row_total(b::uuid) = 0, 'S6g B untouched by A commit');

  -- B commits its own data, using the SAME idempotency key string as A used.
  r := pg_temp.call_as(b, pg_temp.payload('k-a-1', 0, 'newAccountTransfer',
         jsonb_build_object('savedChallenges', jsonb_build_object('cms:b-only', jsonb_build_object('savedOn', '2026-11-02')))));
  PERFORM pg_temp.check(r ->> 'status' = 'committed',
    'S6h receipts are scoped per account: B reusing A''s key commits B''s own data (no cross-account replay)');
  PERFORM pg_temp.check(r -> 'committedEnvelope' -> 'data' -> 'completedChallenges' = '{}'::jsonb,
    'S6i B''s committed envelope reveals none of A''s data');
END $$;

-- ---------------------------------------------------------------------------
-- S7. Owner-only reads (RLS) through table access and the read function
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  a constant text := 'a0000000-0000-4000-8000-00000000000a';
  b constant text := 'b0000000-0000-4000-8000-00000000000b';
  v_count bigint;
  r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', a, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.account_saved_challenges;  -- only B has saved challenges
  RESET ROLE;
  PERFORM pg_temp.check(v_count = 0, 'S7a A cannot SELECT B''s rows');

  PERFORM set_config('request.jwt.claim.sub', a, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.account_reconciliation_receipts;
  RESET ROLE;
  PERFORM pg_temp.check(v_count = 1, 'S7b A sees exactly its own receipt');

  PERFORM set_config('request.jwt.claim.sub', a, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.account_reconciliation_unresolved_items WHERE account_id = b::uuid;
  RESET ROLE;
  PERFORM pg_temp.check(v_count = 0, 'S7c A cannot SELECT B''s unresolved evidence');

  r := pg_temp.get_as(a);
  PERFORM pg_temp.check(r ->> 'status' = 'found' AND r -> 'envelope' ->> 'accountId' = a
                    AND r -> 'envelope' -> 'data' -> 'savedChallenges' = '{}'::jsonb,
    'S7d A''s read returns only A''s envelope');

  -- A cannot mutate B directly even when targeting B's account_id.
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', a, true);
    SET LOCAL ROLE authenticated;
    UPDATE public.account_participation_profiles SET revision = 99 WHERE account_id = b::uuid;
    RAISE EXCEPTION 'S7e expected direct UPDATE denial';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    PERFORM pg_temp.check(true, 'S7e direct UPDATE of B''s revision denied to A');
  END;

  BEGIN
    PERFORM set_config('request.jwt.claim.sub', a, true);
    SET LOCAL ROLE authenticated;
    PERFORM account_private.is_canonical_challenge_id('cms:x');
    RAISE EXCEPTION 'S7f expected private helper denial';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    PERFORM pg_temp.check(true, 'S7f authenticated cannot call account_private helpers');
  END;
END $$;

-- ---------------------------------------------------------------------------
-- S8. Defense in depth: the elevated owner role itself is confined to auth.uid() by RLS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  a constant text := 'a0000000-0000-4000-8000-00000000000a';
  b constant text := 'b0000000-0000-4000-8000-00000000000b';
  v_count bigint;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', a, true);
  SET LOCAL ROLE account_reconciler;
  SELECT count(*) INTO v_count FROM public.account_saved_challenges WHERE account_id = b::uuid;
  RESET ROLE;
  PERFORM pg_temp.check(v_count = 0, 'S8a account_reconciler under session A sees zero rows of B');

  BEGIN
    PERFORM set_config('request.jwt.claim.sub', a, true);
    SET LOCAL ROLE account_reconciler;
    INSERT INTO public.account_completed_challenges (account_id, challenge_id, completed_on, date_provenance)
    VALUES (b::uuid, 'cms:injected', DATE '2026-11-01', 'clientReported');
    RAISE EXCEPTION 'S8b expected RLS WITH CHECK violation';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    PERFORM pg_temp.check(true, 'S8b account_reconciler under session A cannot INSERT a row for B');
  END;

  BEGIN
    PERFORM set_config('request.jwt.claim.sub', a, true);
    SET LOCAL ROLE account_reconciler;
    UPDATE public.account_participation_profiles SET revision = revision + 100 WHERE account_id = b::uuid;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RESET ROLE;
    PERFORM pg_temp.check(v_count = 0, 'S8c account_reconciler under session A updates zero rows of B');
  END;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  SET LOCAL ROLE account_reconciler;
  SELECT count(*) INTO v_count FROM public.account_participation_profiles;
  RESET ROLE;
  PERFORM pg_temp.check(v_count = 0, 'S8d account_reconciler with no session identity sees nothing');
END $$;

-- ---------------------------------------------------------------------------
-- S9. A JWT subject with no auth.users row is not provisioned: nothing is persisted
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  ghost constant text := 'c0000000-0000-4000-8000-00000000000c';
  r jsonb;
BEGIN
  r := pg_temp.call_as(ghost, pg_temp.payload('k-ghost', 0, 'newAccountTransfer',
         jsonb_build_object('completedChallenges', jsonb_build_object('cms:ghost-1', jsonb_build_object('completedOn', '2026-11-01')))));
  PERFORM pg_temp.check(r ->> 'status' = 'unauthorized' AND r ->> 'reason' = 'forbidden',
    'S9a unknown auth subject -> unauthorized/forbidden');
  PERFORM pg_temp.check(pg_temp.row_total(ghost::uuid) = 0, 'S9b unknown subject persisted zero rows');
END $$;

-- ---------------------------------------------------------------------------
-- S10. Error messages never echo account identifiers
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  a constant text := 'a0000000-0000-4000-8000-00000000000a';
  b constant text := 'b0000000-0000-4000-8000-00000000000b';
  r jsonb;
BEGIN
  r := pg_temp.call_as(a, pg_temp.payload('k-msg', 5, 'existingAccountMerge', '{}'::jsonb) || jsonb_build_object('accountId', b));
  PERFORM pg_temp.check(position(b IN (r ->> 'message')) = 0 AND position(a IN (r ->> 'message')) = 0,
    'S10a unauthorized message contains no account UUID');
  r := pg_temp.call_as(a, pg_temp.payload('k-msg-2', 5, 'existingAccountMerge', '{}'::jsonb));
  PERFORM pg_temp.check(r ->> 'status' = 'conflict' AND position(a IN (r ->> 'message')) = 0,
    'S10b conflict message contains no account UUID');
END $$;

ROLLBACK;

-- ---------------------------------------------------------------------------
-- S11. Non-READ COMMITTED callers fail closed (advisory lock + fresh-snapshot reads
--      require READ COMMITTED; PostgREST uses READ COMMITTED by default).
-- ---------------------------------------------------------------------------
BEGIN ISOLATION LEVEL REPEATABLE READ;
INSERT INTO auth.users (id) VALUES ('d0000000-0000-4000-8000-00000000000d');
DO $$
DECLARE r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-00000000000d', true);
  SET LOCAL ROLE authenticated;
  r := public.reconcile_guest_participation(jsonb_build_object(
    'expectedRevision', 0, 'idempotencyKey', 'k-rr',
    'guestPayloadFingerprint', repeat('d', 64), 'mode', 'newAccountTransfer',
    'envelope', jsonb_build_object('schemaVersion', 1, 'namespace', 'cms', 'data', '{}'::jsonb)));
  RESET ROLE;
  IF r ->> 'status' <> 'rejected' OR r ->> 'detail' <> 'unsupportedTransactionIsolation' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: S11 REPEATABLE READ must be rejected, got %', r;
  END IF;
  IF EXISTS (SELECT 1 FROM public.account_participation_profiles
              WHERE account_id = 'd0000000-0000-4000-8000-00000000000d') THEN
    RAISE EXCEPTION 'ASSERTION FAILED: S11 rejected call must not persist';
  END IF;
  RAISE NOTICE 'ok - S11 REPEATABLE READ caller rejected without writes';
END $$;
ROLLBACK;

\echo 'R13-TX1 auth/grant/isolation suite: all assertions passed.'
