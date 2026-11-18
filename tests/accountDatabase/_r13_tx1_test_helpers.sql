-- Bibleberry R13-TX1 shared session-temporary test helpers (pg_temp only).
-- Included via \ir from the R13-TX1 SQL suites inside their BEGIN ... ROLLBACK.
-- Never part of any migration.

CREATE FUNCTION pg_temp.check(p_ok boolean, p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ASSERTION FAILED: %', p_label;
  END IF;
  RAISE NOTICE 'ok - %', p_label;
END $$;

-- Calls the transaction exactly as PostgREST would: role `authenticated` with a JWT `sub`.
CREATE FUNCTION pg_temp.call_as(p_sub text, p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  SET LOCAL ROLE authenticated;
  r := public.reconcile_guest_participation(p_payload);
  RESET ROLE;
  RETURN r;
END $$;

CREATE FUNCTION pg_temp.get_as(p_sub text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  SET LOCAL ROLE authenticated;
  r := public.get_account_participation();
  RESET ROLE;
  RETURN r;
END $$;

CREATE FUNCTION pg_temp.payload(
  p_key text, p_expected integer, p_mode text, p_data jsonb, p_fp text DEFAULT NULL
) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'expectedRevision', p_expected,
    'idempotencyKey', p_key,
    'guestPayloadFingerprint', coalesce(p_fp, encode(sha256(convert_to(p_key, 'UTF8')), 'hex')),
    'mode', p_mode,
    'envelope', jsonb_build_object('schemaVersion', 1, 'namespace', 'cms', 'revision', p_expected, 'data', p_data)
  );
$$;

CREATE FUNCTION pg_temp.row_total(p_uid uuid) RETURNS bigint LANGUAGE sql AS $$
  SELECT (SELECT count(*) FROM public.account_participation_profiles WHERE account_id = p_uid)
       + (SELECT count(*) FROM public.account_completed_challenges WHERE account_id = p_uid)
       + (SELECT count(*) FROM public.account_in_progress_challenges WHERE account_id = p_uid)
       + (SELECT count(*) FROM public.account_saved_challenges WHERE account_id = p_uid)
       + (SELECT count(*) FROM public.account_saved_scriptures WHERE account_id = p_uid)
       + (SELECT count(*) FROM public.account_earned_awards WHERE account_id = p_uid)
       + (SELECT count(*) FROM public.account_shelf_months WHERE account_id = p_uid)
       + (SELECT count(*) FROM public.account_reconciliation_receipts WHERE account_id = p_uid)
       + (SELECT count(*) FROM public.account_reconciliation_unresolved_items WHERE account_id = p_uid)
       + (SELECT count(*) FROM public.account_provisional_award_claims WHERE account_id = p_uid);
$$;

-- Server UTC+14 ceiling as the transaction computes it.
CREATE FUNCTION pg_temp.ceiling() RETURNS date LANGUAGE sql AS $$
  SELECT ((clock_timestamp() AT TIME ZONE 'UTC') + interval '14 hours')::date;
$$;

-- Asserts a typed rejection AND that the caller's persisted footprint did not change.
CREATE FUNCTION pg_temp.expect_rejected(
  p_sub text, p_payload jsonb, p_reason text, p_detail text, p_label text
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_before bigint := pg_temp.row_total(p_sub::uuid);
  v_rev_before bigint := (SELECT revision FROM public.account_participation_profiles WHERE account_id = p_sub::uuid);
  r jsonb := pg_temp.call_as(p_sub, p_payload);
BEGIN
  PERFORM pg_temp.check(
    r ->> 'status' = 'rejected' AND r ->> 'reason' = p_reason
      AND (p_detail IS NULL OR r ->> 'detail' = p_detail)
      AND (r -> 'guestRetentionRequired') = 'true'::jsonb
      AND pg_temp.row_total(p_sub::uuid) = v_before
      AND (SELECT revision FROM public.account_participation_profiles WHERE account_id = p_sub::uuid)
          IS NOT DISTINCT FROM v_rev_before,
    p_label || ' [got ' || coalesce(r ->> 'status', '?') || '/' || coalesce(r ->> 'reason', '?')
            || '/' || coalesce(r ->> 'detail', '?') || ']');
END $$;

-- A complete, valid earned Scripture Card snapshot for a month (artwork URL is a test fixture).
CREATE FUNCTION pg_temp.card(p_ym text, p_slug text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'cardDocumentId', 'card-' || p_slug,
    'title', 'Test Card ' || p_slug,
    'publicationYearMonth', p_ym,
    'imageUrl', 'https://cdn.sanity.io/images/testproj/production/abc123-1200x1600.png',
    'assetRevision', 'rev1',
    'illustrationAlt', 'An illustration',
    'accessibleTranscription', 'A transcription of the card',
    'scripture', jsonb_build_object('book', 'Romans', 'reference', 'Romans 8:1', 'translation', 'WEB'),
    'attribution', 'Test attribution',
    'rightsStatus', 'licensed',
    'shareEligible', true
  );
$$;

-- Simulates a FUTURE trusted admission of an earned award (the transaction itself cannot
-- create earned awards). Superuser-only test seeding; never part of the migration.
CREATE FUNCTION pg_temp.seed_verified_award(
  p_uid text, p_award_id text, p_earned_on date, p_hub boolean, p_viewed boolean,
  p_provenance text DEFAULT 'clientReported'
) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.account_earned_awards (
    account_id, award_id, kind, publication_year_month, discovery_id, earned_on,
    date_provenance, hub_announcement_acked, card_viewed
  )
  SELECT p_uid::uuid, p_award_id,
         CASE WHEN p_award_id LIKE '%:full-month' THEN 'fullMonth' ELSE 'thematic' END,
         substring(p_award_id FROM 14 FOR 7), 'discovery:' || substring(p_award_id FROM 14),
         p_earned_on, p_provenance, p_hub, p_viewed;
$$;
