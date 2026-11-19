-- R13-SB3 (Granite Sparrow, Issue #236): effective service_role privilege checks.
--
-- Run ONLY by scripts/accountSupabase/run-local-supabase-acceptance.sh, as the Supabase
-- migration identity `postgres` (NOT superuser), INSIDE a transaction the caller opens and then
-- ROLLS BACK. No BEGIN/COMMIT here, so a mutation demo can restore a dangerous GRANT earlier in
-- the same rolled-back transaction and prove these checks catch it.
--
-- Every check uses has_table_privilege / has_any_column_privilege, which resolve PUBLIC grants,
-- role inheritance and column grants: it asserts what service_role can DO, not which REVOKE ran.
-- Every failure raises 'SB3-CHECK <id> ...'.

\set ON_ERROR_STOP 1

DO $$
BEGIN
  IF current_user <> 'postgres' OR (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) THEN
    RAISE EXCEPTION 'SB3-CHECK setup: must run as the non-superuser Supabase migration identity postgres';
  END IF;
END $$;

-- S1: the exact service_role table-privilege matrix. Any account table that is not classified
-- here (e.g. one added by a later migration that inherits Supabase's default ALL) fails.
DO $$
DECLARE v text;
BEGIN
  WITH expected(tbl, privs) AS (VALUES
    ('account_earned_awards',                   'SELECT'),
    ('account_completed_challenges',            'SELECT'),
    ('account_provisional_award_claims',        'SELECT'),
    ('account_reconciliation_receipts',         'SELECT'),
    ('account_reconciliation_unresolved_items', 'SELECT'),
    ('account_award_admission_attestations',    ''),
    ('account_award_verification_attempts',     ''),
    ('account_participation_profiles',          'DELETE,INSERT,SELECT,UPDATE'),
    ('account_in_progress_challenges',          'DELETE,INSERT,SELECT,UPDATE'),
    ('account_saved_challenges',                'DELETE,INSERT,SELECT,UPDATE'),
    ('account_saved_scriptures',                'DELETE,INSERT,SELECT,UPDATE'),
    ('account_shelf_months',                    'DELETE,INSERT,SELECT,UPDATE')
  ), actual AS (
    SELECT c.relname AS tbl,
           coalesce(string_agg(p, ',' ORDER BY p) FILTER (
             WHERE has_table_privilege('service_role', c.oid, p)
                OR (p IN ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES')
                    AND has_any_column_privilege('service_role', c.oid, p))), '') AS privs
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace,
           unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f') AND c.relname LIKE 'account\_%'
     GROUP BY c.relname
  )
  SELECT string_agg(coalesce(a.tbl, e.tbl) || ' expected [' || coalesce(e.privs, '<unclassified>')
                    || '] actual [' || coalesce(a.privs, '<missing>') || ']', '; ') INTO v
    FROM actual a FULL JOIN expected e ON e.tbl = a.tbl
   WHERE a.privs IS DISTINCT FROM e.privs;
  IF v IS NOT NULL THEN RAISE EXCEPTION 'SB3-CHECK S1 service_role privilege matrix: %', v; END IF;
  RAISE NOTICE 'ok - SB3 S1 service_role: SELECT-only on award/evidence, nothing on private audit, no TRUNCATE/REFERENCES/TRIGGER anywhere';
END $$;

-- S2: no inherited route: service_role reaches no account role, no predefined write role, and
-- holds no usage on the private schemas or EXECUTE on any account function.
DO $$
DECLARE v text;
BEGIN
  SELECT string_agg(r, ', ') INTO v
    FROM unnest(ARRAY['account_reconciler', 'account_award_issuer', 'account_award_verifier',
                      'pg_write_all_data', 'postgres', 'supabase_admin']) r
   WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) AND pg_has_role('service_role', r, 'MEMBER');
  IF v IS NOT NULL THEN RAISE EXCEPTION 'SB3-CHECK S2a service_role is a member of: %', v; END IF;
  SELECT string_agg(s || ':' || p, ', ') INTO v
    FROM unnest(ARRAY['account_private', 'account_issuance']) s, unnest(ARRAY['USAGE', 'CREATE']) p
   WHERE has_schema_privilege('service_role', s, p);
  IF v IS NOT NULL THEN RAISE EXCEPTION 'SB3-CHECK S2b service_role private schema access: %', v; END IF;
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE (n.nspname IN ('account_private', 'account_issuance')
          OR p.oid IN ('public.reconcile_guest_participation(jsonb)'::regprocedure,
                       'public.get_account_participation()'::regprocedure))
     AND has_function_privilege('service_role', p.oid, 'EXECUTE');
  IF v IS NOT NULL THEN RAISE EXCEPTION 'SB3-CHECK S2c service_role can execute: %', v; END IF;
  RAISE NOTICE 'ok - SB3 S2 service_role: no inherited account/write role, no private schema, no account function';
END $$;

-- S3: the real thing, as service_role itself (SET ROLE from postgres, which is a member): every
-- write path into award/evidence tables and every TRUNCATE/TRIGGER path fails with a privilege
-- error. Each attempt runs in its own subtransaction. (SET ROLE escalation is not probed here:
-- PostgreSQL authorises SET ROLE against the SESSION user, which is postgres in this harness; the
-- real service_role session user is `authenticator`, covered by S2a and SB2 check D1e.)
DO $$
DECLARE
  v_attempt text;
  v_leaks text := '';
  v_uid uuid := gen_random_uuid();
BEGIN
  FOREACH v_attempt IN ARRAY ARRAY[
    $q$INSERT INTO public.account_earned_awards (account_id, award_id, kind, publication_year_month, discovery_id, earned_on, date_provenance)
       VALUES ('$q$ || v_uid || $q$', 'card:monthly:2026-03:sb3-check', 'thematic', '2026-03', 'discovery:2026-03:sb3-check', '2026-03-05', 'serverVerified')$q$,
    'UPDATE public.account_earned_awards SET earned_on = earned_on',
    'UPDATE public.account_earned_awards SET card_viewed = card_viewed',
    'DELETE FROM public.account_earned_awards',
    $q$INSERT INTO public.account_completed_challenges (account_id, challenge_id, completed_on, date_provenance)
       VALUES ('$q$ || v_uid || $q$', 'cms:sb3-check', '2026-03-01', 'serverVerified')$q$,
    'UPDATE public.account_completed_challenges SET completed_on = completed_on',
    'DELETE FROM public.account_completed_challenges',
    $q$INSERT INTO public.account_provisional_award_claims (account_id, award_id, kind, publication_year_month, discovery_id, claimed_earned_on, last_idempotency_key)
       VALUES ('$q$ || v_uid || $q$', 'card:monthly:2026-03:sb3-check', 'thematic', '2026-03', 'discovery:2026-03:sb3-check', '2026-03-05', 'sb3')$q$,
    'UPDATE public.account_provisional_award_claims SET claimed_earned_on = claimed_earned_on',
    'DELETE FROM public.account_provisional_award_claims',
    $q$INSERT INTO public.account_reconciliation_receipts (account_id, idempotency_key, mode, guest_payload_digest, committed_revision, outcome_status, unresolved_persisted_on_server)
       VALUES ('$q$ || v_uid || $q$', 'sb3', 'newAccountTransfer', 'x', 1, 'committed', true)$q$,
    'UPDATE public.account_reconciliation_receipts SET unresolved_persisted_on_server = true',
    'DELETE FROM public.account_reconciliation_unresolved_items',
    'UPDATE public.account_reconciliation_unresolved_items SET detail = detail',
    'SELECT 1 FROM public.account_award_admission_attestations',
    'DELETE FROM public.account_award_verification_attempts',
    'TRUNCATE public.account_completed_challenges',
    'TRUNCATE public.account_saved_challenges',
    'CREATE TRIGGER sb3_check BEFORE UPDATE ON public.account_participation_profiles FOR EACH ROW EXECUTE FUNCTION suppress_redundant_updates_trigger()',
    'CREATE TRIGGER sb3_check BEFORE INSERT ON public.account_saved_challenges FOR EACH ROW EXECUTE FUNCTION suppress_redundant_updates_trigger()'
  ] LOOP
    BEGIN
      SET LOCAL ROLE service_role;
      EXECUTE v_attempt;
      v_leaks := v_leaks || ' | ' || left(regexp_replace(v_attempt, '\s+', ' ', 'g'), 90);
      RESET ROLE;
    EXCEPTION WHEN insufficient_privilege THEN
      RESET ROLE;
    END;
  END LOOP;
  RESET ROLE;
  IF v_leaks <> '' THEN RAISE EXCEPTION 'SB3-CHECK S3 service_role succeeded at:%', v_leaks; END IF;
  RAISE NOTICE 'ok - SB3 S3 service_role SQL: 20 award/evidence/TRUNCATE/TRIGGER attempts all denied (insufficient_privilege)';
END $$;

DO $$ BEGIN RAISE NOTICE 'SB3 service_role checks: all passed.'; END $$;
