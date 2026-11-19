-- Bibleberry R13-SB3 (Granite Sparrow): remove the service_role bypass of trusted award admission
-- Issue: #236 (Phase 05 / R13-SB3). Finding F1 (docs/testing/r13-verify2-private-verifier-runtime.md §7).
-- Builds on: 20261116000001 (R13-3), 20261118000001 (R13-TX1), 20261118000002 (R13-VERIFY1).
-- Evidence: docs/testing/r13-sb3-service-role-award-grant-remediation.md
--
-- Forward-only. Does NOT edit, drop or recreate any accepted table, row, policy, function or role,
-- and does NOT touch any grant held by anon, authenticated, account_reconciler,
-- account_award_issuer or account_award_verifier. It only narrows what `service_role` holds.
--
-- Why: R13-3 (and R13-TX1 for its two new tables) granted `service_role` ALL on the
-- client-visible account tables. On Supabase `service_role` is BYPASSRLS and is what PostgREST
-- switches to for the service-role / secret API key, so that key could POST an earned award
-- (HTTP 201) with no eligible Challenge, quarantined claim, private verifier or attestation, and
-- could equally forge the evidence the verifier relies on. RLS cannot fix this (BYPASSRLS); only
-- SQL privileges can. No repository code, script or workflow uses service_role for direct DML on
-- these tables (the client transport and the verifier runtime both refuse service keys/logins).
--
-- Privilege classes after this migration (service_role):
--   A. Trusted award + admission evidence: SELECT only.
--        account_earned_awards                  (the earned Card itself; identity/date/art/rights)
--        account_completed_challenges           (basis the issuer checks the attestation against)
--        account_provisional_award_claims       (the ONLY nomination admission accepts; claimed date)
--        account_reconciliation_receipts        (replayed acks; unresolved_persisted_on_server
--                                                drives the guest-clearance decision)
--        account_reconciliation_unresolved_items (the durable evidence that flag asserts)
--   B. Private issuance audit (already nothing since R13-VERIFY1; asserted, unchanged):
--        account_award_admission_attestations, account_award_verification_attempts
--   C. Reader-owned state with no award/evidence authority: SELECT, INSERT, UPDATE, DELETE kept.
--        account_participation_profiles, account_in_progress_challenges, account_saved_challenges,
--        account_saved_scriptures, account_shelf_months
--   All classes: no TRUNCATE (bypasses row semantics, destroys history), no REFERENCES, and no
--   TRIGGER. A trigger on any account table fires inside the SECURITY DEFINER reconciler/issuer
--   bodies and would run with THEIR privileges (e.g. issuer INSERT on earned awards), so TRIGGER
--   on any of these tables is an indirect admission bypass.
--
-- Not changed (documented residuals, see the evidence doc): service_role's BYPASSRLS attribute
-- (Supabase platform role), its SELECT rights above, Supabase's platform default privileges for
-- future public tables, and account deletion via auth.users ON DELETE CASCADE.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    -- A. Award + evidence tables: read-only for service_role.
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE
      public.account_earned_awards,
      public.account_completed_challenges,
      public.account_provisional_award_claims,
      public.account_reconciliation_receipts,
      public.account_reconciliation_unresolved_items
    FROM service_role;

    -- B. Private issuance audit tables: nothing at all (re-asserted; already revoked by VERIFY1).
    REVOKE ALL ON TABLE
      public.account_award_admission_attestations,
      public.account_award_verification_attempts
    FROM service_role;

    -- C. Reader-owned state: no TRUNCATE / REFERENCES / TRIGGER; ordinary row DML is unchanged.
    REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE
      public.account_participation_profiles,
      public.account_in_progress_challenges,
      public.account_saved_challenges,
      public.account_saved_scriptures,
      public.account_shelf_months
    FROM service_role;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Effective-privilege assertions (fail the migration, and roll it back, if any is violated).
-- has_table_privilege / has_any_column_privilege resolve PUBLIC, role inheritance and column
-- grants, so these assert what each role can actually do, not just that a REVOKE was written.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v text;
  c_evidence constant text[] := ARRAY[
    'account_earned_awards', 'account_completed_challenges', 'account_provisional_award_claims',
    'account_reconciliation_receipts', 'account_reconciliation_unresolved_items',
    'account_award_admission_attestations', 'account_award_verification_attempts'];
  c_private constant text[] := ARRAY['account_award_admission_attestations', 'account_award_verification_attempts'];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    RETURN;
  END IF;

  -- 1. No write path (table- or column-level, direct or inherited) into award/evidence tables.
  SELECT string_agg(t || ':' || p, ', ') INTO v
    FROM unnest(c_evidence) t, unnest(ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
   WHERE has_table_privilege('service_role', ('public.' || t)::regclass, p)
      OR (p IN ('INSERT', 'UPDATE', 'REFERENCES')
          AND has_any_column_privilege('service_role', ('public.' || t)::regclass, p));
  IF v IS NOT NULL THEN
    RAISE EXCEPTION 'R13-SB3: service_role still holds award/evidence write privileges: %', v;
  END IF;

  -- 2. No TRUNCATE / REFERENCES / TRIGGER on ANY public account table (covers every class).
  SELECT string_agg(c.relname || ':' || p, ', ') INTO v
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace,
         unnest(ARRAY['TRUNCATE', 'REFERENCES', 'TRIGGER']) p
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relname LIKE 'account\_%'
     AND (has_table_privilege('service_role', c.oid, p)
          OR (p = 'REFERENCES' AND has_any_column_privilege('service_role', c.oid, p)));
  IF v IS NOT NULL THEN
    RAISE EXCEPTION 'R13-SB3: service_role still holds TRUNCATE/REFERENCES/TRIGGER: %', v;
  END IF;

  -- 3. Private issuance audit stays fully closed to service_role (not even SELECT).
  SELECT string_agg(t, ', ') INTO v FROM unnest(c_private) t
   WHERE has_table_privilege('service_role', ('public.' || t)::regclass, 'SELECT')
      OR has_any_column_privilege('service_role', ('public.' || t)::regclass, 'SELECT');
  IF v IS NOT NULL THEN
    RAISE EXCEPTION 'R13-SB3: service_role can read private issuance audit tables: %', v;
  END IF;

  -- 4. No inherited route around the revokes: service_role reaches no account role and no
  --    predefined data-writing role.
  SELECT string_agg(r, ', ') INTO v
    FROM unnest(ARRAY['account_reconciler', 'account_award_issuer', 'account_award_verifier',
                      'pg_write_all_data']) r
   WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) AND pg_has_role('service_role', r, 'MEMBER');
  IF v IS NOT NULL THEN
    RAISE EXCEPTION 'R13-SB3: service_role is a member of %', v;
  END IF;

  -- 5. The dedicated roles keep exactly their accepted authority (this migration must not touch it).
  IF NOT (has_table_privilege('account_award_issuer', 'public.account_earned_awards', 'INSERT')
          AND has_table_privilege('account_award_issuer', 'public.account_award_admission_attestations', 'INSERT')
          AND has_table_privilege('account_award_issuer', 'public.account_provisional_award_claims', 'DELETE')
          AND has_column_privilege('account_award_issuer', 'public.account_earned_awards', 'card_viewed', 'UPDATE')
          AND NOT has_column_privilege('account_award_issuer', 'public.account_earned_awards', 'earned_on', 'UPDATE')
          AND has_table_privilege('account_reconciler', 'public.account_provisional_award_claims', 'INSERT')
          AND has_table_privilege('account_reconciler', 'public.account_completed_challenges', 'INSERT')
          AND has_table_privilege('account_reconciler', 'public.account_reconciliation_receipts', 'INSERT')
          AND NOT has_table_privilege('account_reconciler', 'public.account_earned_awards', 'INSERT')
          AND has_column_privilege('account_reconciler', 'public.account_earned_awards', 'hub_announcement_acked', 'UPDATE')
          AND NOT has_column_privilege('account_reconciler', 'public.account_earned_awards', 'earned_card_snapshot', 'UPDATE')) THEN
    RAISE EXCEPTION 'R13-SB3: accepted reconciler/issuer authority changed unexpectedly';
  END IF;

  -- 6. Client roles unchanged: PUBLIC/anon nothing, authenticated SELECT-only (RLS owner-scoped).
  SELECT string_agg(r || ' ' || c.relname || ':' || p, ', ') INTO v
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace,
         unnest(ARRAY['public', 'anon', 'authenticated']) r,
         unnest(ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relname LIKE 'account\_%'
     AND (has_table_privilege(r, c.oid, p)
          OR (p IN ('INSERT', 'UPDATE', 'REFERENCES') AND has_any_column_privilege(r, c.oid, p)));
  IF v IS NOT NULL THEN
    RAISE EXCEPTION 'R13-SB3: a client role can write an account table: %', v;
  END IF;
END
$$;

COMMIT;
