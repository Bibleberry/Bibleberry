-- Bibleberry R13-3: Repeatable Local PostgreSQL Schema, Constraint & RLS Integration Suite
-- Prerequisites:
--   1. Isolated local PostgreSQL database with `00_local_supabase_auth_bootstrap.sql` applied
--      (or local Supabase stack).
--   2. Migration `supabase/migrations/20261116000001_r13_3_account_schema_and_rls.sql` applied.
--   3. Executed via `psql -v ON_ERROR_STOP=1 -f tests/accountDatabase/01_r13_3_rls_and_schema_integration.sql`.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Verify all 8 tables exist and have RLS enabled
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_table text;
  v_rls boolean;
  v_tables text[] := ARRAY[
    'account_participation_profiles',
    'account_completed_challenges',
    'account_in_progress_challenges',
    'account_saved_challenges',
    'account_saved_scriptures',
    'account_earned_awards',
    'account_shelf_months',
    'account_reconciliation_receipts'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    SELECT c.relrowsecurity
      INTO v_rls
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = v_table
       AND c.relkind = 'r';

    IF v_rls IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Expected RLS enabled on public.%, got %', v_table, v_rls;
    END IF;
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. Verify absence of accidental PUBLIC / anon / authenticated write privileges
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'account_participation_profiles',
    'account_completed_challenges',
    'account_in_progress_challenges',
    'account_saved_challenges',
    'account_saved_scriptures',
    'account_earned_awards',
    'account_shelf_months',
    'account_reconciliation_receipts'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF has_table_privilege('public', 'public.' || v_table, 'SELECT,INSERT,UPDATE,DELETE') THEN
      RAISE EXCEPTION 'PUBLIC must have zero privileges on public.%', v_table;
    END IF;

    IF has_table_privilege('anon', 'public.' || v_table, 'SELECT,INSERT,UPDATE,DELETE') THEN
      RAISE EXCEPTION 'anon must have zero privileges on public.%', v_table;
    END IF;

    IF NOT has_table_privilege('authenticated', 'public.' || v_table, 'SELECT') THEN
      RAISE EXCEPTION 'authenticated must have SELECT on public.%', v_table;
    END IF;

    IF has_table_privilege('authenticated', 'public.' || v_table, 'INSERT,UPDATE,DELETE') THEN
      RAISE EXCEPTION 'authenticated must NOT have direct write privileges on public.%', v_table;
    END IF;
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- 3. Seed fake test identities & valid records across all 8 tables
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id) VALUES
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222')
ON CONFLICT (id) DO NOTHING;

-- User A seed
INSERT INTO public.account_participation_profiles (
  account_id, namespace, schema_version, revision,
  last_opened_challenge_id, last_opened_on, active_focus_month, shelf_updated_on
) VALUES (
  '11111111-1111-4111-8111-111111111111', 'cms', 1, 3,
  'cms:challenge-nov-01', DATE '2026-11-10', '2026-10', DATE '2026-11-10'
);

INSERT INTO public.account_completed_challenges (
  account_id, challenge_id, completed_on, date_provenance, client_claimed_on
) VALUES (
  '11111111-1111-4111-8111-111111111111', 'cms:challenge-nov-01', DATE '2026-11-10', 'serverVerified', DATE '2026-11-10'
);

INSERT INTO public.account_in_progress_challenges (
  account_id, challenge_id, screen_id, updated_on, unresolved_conflict
) VALUES (
  '11111111-1111-4111-8111-111111111111', 'cms:challenge-nov-02', 'screen_2', DATE '2026-11-11', false
);

INSERT INTO public.account_saved_challenges (
  account_id, challenge_id, saved_on
) VALUES (
  '11111111-1111-4111-8111-111111111111', 'cms:challenge-nov-03', DATE '2026-11-11'
);

INSERT INTO public.account_saved_scriptures (
  account_id, scripture_key, reference, translation, saved_on, source_challenge_id
) VALUES (
  '11111111-1111-4111-8111-111111111111', 'romans 8:1|webp', 'Romans 8:1', 'WEBP', DATE '2026-11-10', 'cms:challenge-nov-01'
);

-- Independent presentation flags: card_viewed = true, hub_announcement_acked = false
INSERT INTO public.account_earned_awards (
  account_id, award_id, kind, publication_year_month, discovery_id,
  earned_on, date_provenance, hub_announcement_acked, card_viewed,
  card_document_id, earned_card_snapshot
) VALUES (
  '11111111-1111-4111-8111-111111111111',
  'card:monthly:2026-11:gratitude',
  'thematic',
  '2026-11',
  'discovery:2026-11:gratitude',
  DATE '2026-11-10',
  'serverVerified',
  false,
  true,
  'card-doc-1',
  '{"cardDocumentId":"card-doc-1","title":"Gratitude"}'::jsonb
);

-- Protection is independent of admission kind: preserve all combinations losslessly.
INSERT INTO public.account_shelf_months (
  account_id, year_month, admission_kind, is_protected, admitted_on, slot_order
) VALUES
  ('11111111-1111-4111-8111-111111111111', '2026-08', 'readerSelected', false, DATE '2026-09-01', 1),
  ('11111111-1111-4111-8111-111111111111', '2026-09', 'autoAdmitted', true, DATE '2026-10-01', 2),
  ('11111111-1111-4111-8111-111111111111', '2026-10', 'readerSelected', true, DATE '2026-11-01', 3);

INSERT INTO public.account_reconciliation_receipts (
  account_id, idempotency_key, mode, guest_payload_digest,
  committed_revision, outcome_status, unresolved_count
) VALUES (
  '11111111-1111-4111-8111-111111111111', 'idem-user-a-001', 'newAccountTransfer',
  'sha256:aaaa1111', 1, 'committed', 0
);

-- User B seed
INSERT INTO public.account_participation_profiles (account_id, revision)
VALUES ('22222222-2222-4222-8222-222222222222', 1);

INSERT INTO public.account_completed_challenges (
  account_id, challenge_id, completed_on, date_provenance
) VALUES (
  '22222222-2222-4222-8222-222222222222', 'cms:challenge-oct-05', DATE '2026-10-05', 'clientReported'
);

INSERT INTO public.account_earned_awards (
  account_id, award_id, kind, publication_year_month, discovery_id,
  earned_on, date_provenance, hub_announcement_acked, card_viewed
) VALUES (
  '22222222-2222-4222-8222-222222222222',
  'card:monthly:2026-10:full-month',
  'fullMonth',
  '2026-10',
  'discovery:2026-10:full-month',
  DATE '2026-10-31',
  'serverVerified',
  true,
  false
);

-- ---------------------------------------------------------------------------
-- 4. Verify CHECK & UNIQUE constraint rejections
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  -- 4a. Reject pilot namespace
  BEGIN
    INSERT INTO public.account_participation_profiles (account_id, namespace)
    VALUES ('22222222-2222-4222-8222-222222222222', 'pilot');
    RAISE EXCEPTION 'Expected namespace check constraint failure';
  EXCEPTION WHEN check_violation OR unique_violation THEN NULL;
  END;

  -- 4b. Reject drafts.* challenge_id
  BEGIN
    INSERT INTO public.account_completed_challenges (account_id, challenge_id, completed_on, date_provenance)
    VALUES ('22222222-2222-4222-8222-222222222222', 'cms:drafts.abc', DATE '2026-11-10', 'clientReported');
    RAISE EXCEPTION 'Expected drafts.* challenge_id rejection';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 4c. Reject 4th Shelf month (slot_order = 4)
  BEGIN
    INSERT INTO public.account_shelf_months (account_id, year_month, admission_kind, is_protected, slot_order)
    VALUES ('11111111-1111-4111-8111-111111111111', '2026-07', 'readerSelected', false, 4);
    RAISE EXCEPTION 'Expected 4th shelf slot rejection';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 4d. Reject duplicate Shelf slot_order
  BEGIN
    INSERT INTO public.account_shelf_months (account_id, year_month, admission_kind, is_protected, slot_order)
    VALUES ('11111111-1111-4111-8111-111111111111', '2026-07', 'readerSelected', false, 3);
    RAISE EXCEPTION 'Expected duplicate shelf slot_order rejection';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- 4e. Reject duplicate receipt (account_id, idempotency_key)
  BEGIN
    INSERT INTO public.account_reconciliation_receipts (
      account_id, idempotency_key, mode, guest_payload_digest, committed_revision, outcome_status
    ) VALUES (
      '11111111-1111-4111-8111-111111111111', 'idem-user-a-001', 'newAccountTransfer', 'sha256:bbbb2222', 2, 'committed'
    );
    RAISE EXCEPTION 'Expected duplicate idempotency_key rejection';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- 4f. Reject passageText in earned_card_snapshot
  BEGIN
    INSERT INTO public.account_earned_awards (
      account_id, award_id, kind, publication_year_month, discovery_id,
      earned_on, date_provenance, earned_card_snapshot
    ) VALUES (
      '22222222-2222-4222-8222-222222222222',
      'card:monthly:2026-11:hope',
      'thematic',
      '2026-11',
      'discovery:2026-11:hope',
      DATE '2026-11-10',
      'serverVerified',
      '{"passageText":"forbidden"}'::jsonb
    );
    RAISE EXCEPTION 'Expected passageText snapshot rejection';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END
$$;

-- ---------------------------------------------------------------------------
-- 5. Verify anonymous denial (anon role)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_count bigint;
BEGIN
  SET LOCAL ROLE anon;
  BEGIN
    SELECT count(*) INTO v_count FROM public.account_participation_profiles;
    RAISE EXCEPTION 'Expected anon SELECT denial, got count=%', v_count;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO public.account_completed_challenges (account_id, challenge_id, completed_on, date_provenance)
    VALUES ('11111111-1111-4111-8111-111111111111', 'cms:x', DATE '2026-11-10', 'clientReported');
    RAISE EXCEPTION 'Expected anon INSERT denial';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
END
$$;

-- ---------------------------------------------------------------------------
-- 6. Verify authenticated owner isolation & denial of direct client writes
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_count bigint;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

  -- Same-owner SELECT returns only User A's rows
  SELECT count(*) INTO v_count FROM public.account_participation_profiles;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected 1 profile row for User A, got %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.account_completed_challenges
   WHERE account_id = '22222222-2222-4222-8222-222222222222';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Expected 0 User B rows visible to User A, got %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.account_shelf_months;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'Expected 3 shelf rows for User A, got %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.account_shelf_months
   WHERE admission_kind = 'autoAdmitted' AND is_protected = true;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected 1 auto-admitted protected shelf row, got %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.account_shelf_months
   WHERE admission_kind = 'readerSelected' AND is_protected = false;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected 1 reader-selected unprotected shelf row, got %', v_count;
  END IF;

  -- Direct client writes must be denied even for own account_id
  BEGIN
    UPDATE public.account_participation_profiles SET revision = 999
     WHERE account_id = '11111111-1111-4111-8111-111111111111';
    RAISE EXCEPTION 'Expected authenticated UPDATE denial on profiles';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO public.account_reconciliation_receipts (
      account_id, idempotency_key, mode, guest_payload_digest, committed_revision, outcome_status
    ) VALUES (
      '11111111-1111-4111-8111-111111111111', 'idem-forged', 'newAccountTransfer', 'sha256:0000', 1, 'committed'
    );
    RAISE EXCEPTION 'Expected authenticated INSERT denial on receipts';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO public.account_shelf_months (account_id, year_month, admission_kind, is_protected, slot_order)
    VALUES ('22222222-2222-4222-8222-222222222222', '2026-11', 'readerSelected', false, 1);
    RAISE EXCEPTION 'Expected authenticated cross-account INSERT denial on shelf';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  RESET ROLE;
END
$$;

-- ---------------------------------------------------------------------------
-- 7. Verify ON DELETE CASCADE from auth.users
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_user_a_remaining bigint;
  v_user_b_remaining bigint;
BEGIN
  DELETE FROM auth.users WHERE id = '11111111-1111-4111-8111-111111111111';

  SELECT
    (SELECT count(*) FROM public.account_participation_profiles WHERE account_id = '11111111-1111-4111-8111-111111111111')
    + (SELECT count(*) FROM public.account_completed_challenges WHERE account_id = '11111111-1111-4111-8111-111111111111')
    + (SELECT count(*) FROM public.account_in_progress_challenges WHERE account_id = '11111111-1111-4111-8111-111111111111')
    + (SELECT count(*) FROM public.account_saved_challenges WHERE account_id = '11111111-1111-4111-8111-111111111111')
    + (SELECT count(*) FROM public.account_saved_scriptures WHERE account_id = '11111111-1111-4111-8111-111111111111')
    + (SELECT count(*) FROM public.account_earned_awards WHERE account_id = '11111111-1111-4111-8111-111111111111')
    + (SELECT count(*) FROM public.account_shelf_months WHERE account_id = '11111111-1111-4111-8111-111111111111')
    + (SELECT count(*) FROM public.account_reconciliation_receipts WHERE account_id = '11111111-1111-4111-8111-111111111111')
  INTO v_user_a_remaining;

  IF v_user_a_remaining <> 0 THEN
    RAISE EXCEPTION 'Expected 0 remaining rows for deleted User A, got %', v_user_a_remaining;
  END IF;

  SELECT count(*) INTO v_user_b_remaining
    FROM public.account_participation_profiles
   WHERE account_id = '22222222-2222-4222-8222-222222222222';

  IF v_user_b_remaining <> 1 THEN
    RAISE EXCEPTION 'Expected User B profile intact after User A cascade delete, got %', v_user_b_remaining;
  END IF;
END
$$;

ROLLBACK;
