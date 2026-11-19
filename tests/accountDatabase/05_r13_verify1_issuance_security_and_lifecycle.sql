-- Bibleberry R13-VERIFY1: server-only award issuance — privileges, isolation, lifecycle,
-- replay, rollback and guest-clearance seam. LOCAL DISPOSABLE DATABASE ONLY.
-- Requires bootstrap + R13-3 + R13-TX1 + R13-VERIFY1 migrations.
-- Run via scripts/accountDatabase/run-local-verify1-tests.sh.

\set ON_ERROR_STOP 1

BEGIN;

\ir _r13_tx1_test_helpers.sql

-- Admission exactly as the future verifier service would call it (role account_award_verifier).
CREATE FUNCTION pg_temp.admit(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SET LOCAL ROLE account_award_verifier;
  r := account_issuance.admit_verified_award(p);
  RESET ROLE;
  RETURN r;
END $$;

CREATE FUNCTION pg_temp.context(p_account text, p_award text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  SET LOCAL ROLE account_award_verifier;
  r := account_issuance.get_claim_verification_context(p_account::uuid, p_award);
  RESET ROLE;
  RETURN r;
END $$;

CREATE FUNCTION pg_temp.defer(p_account text, p_award text, p_reason text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  SET LOCAL ROLE account_award_verifier;
  r := account_issuance.record_verification_deferral(p_account::uuid, p_award, p_reason, 1);
  RESET ROLE;
  RETURN r;
END $$;

CREATE FUNCTION pg_temp.pending_count() RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  SET LOCAL ROLE account_award_verifier;
  SELECT count(*) INTO n FROM account_issuance.list_pending_award_claims(500);
  RESET ROLE;
  RETURN n;
END $$;

-- Trusted attestation builder (what the verifier emits); p_extra overrides any field.
CREATE FUNCTION pg_temp.att(
  p_account text, p_award text, p_basis text[], p_latest text, p_extra jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'verificationKey', 'run-2026-11-01-a',
    'verifierVersion', 'r13-verify1.1',
    'accountId', p_account,
    'awardId', p_award,
    'discoveryId', 'discovery:' || substring(p_award FROM 14),
    'kind', CASE WHEN substring(p_award FROM 22) = 'full-month' THEN 'fullMonth' ELSE 'thematic' END,
    'publicationYearMonth', substring(p_award FROM 14 FOR 7),
    'rosterVersion', 1,
    'targetCount', cardinality(p_basis),
    'basisChallengeIds', to_jsonb(p_basis),
    'latestBasisReleaseDate', p_latest,
    'verifiedThroughDate', '2026-11-01',
    'card', pg_temp.card(substring(p_award FROM 14 FOR 7), substring(p_award FROM 22)),
    'source', jsonb_build_object('documentId', 'month-' || substring(p_award FROM 14 FOR 7),
                                 'revision', 'rev1', 'dataset', 'staging', 'perspective', 'published')
  ) || p_extra;
$$;

INSERT INTO auth.users (id) VALUES
  ('a1000000-0000-4000-8000-0000000000a1'),
  ('b2000000-0000-4000-8000-0000000000b2'),
  ('c3000000-0000-4000-8000-0000000000c3'),
  ('d4000000-0000-4000-8000-0000000000d4');

-- ===========================================================================
-- V1. Privilege separation: issuance is unreachable by every client-facing role
-- ===========================================================================
DO $$
DECLARE r record; f text;
BEGIN
  FOR r IN SELECT rolname, rolcanlogin, rolsuper, rolbypassrls FROM pg_roles
            WHERE rolname IN ('account_award_issuer', 'account_award_verifier') LOOP
    PERFORM pg_temp.check(NOT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls,
      'V1a ' || r.rolname || ' is NOLOGIN, not superuser, cannot bypass RLS');
  END LOOP;
  PERFORM pg_temp.check(NOT pg_has_role('authenticated', 'account_award_verifier', 'MEMBER')
                    AND NOT pg_has_role('anon', 'account_award_verifier', 'MEMBER')
                    AND NOT pg_has_role('service_role', 'account_award_verifier', 'MEMBER')
                    AND NOT pg_has_role('account_reconciler', 'account_award_verifier', 'MEMBER')
                    AND NOT pg_has_role('authenticated', 'account_award_issuer', 'MEMBER')
                    AND NOT pg_has_role('account_award_verifier', 'account_award_issuer', 'MEMBER'),
    'V1b no client role (nor the verifier group) is a member of the issuer/verifier roles');

  FOREACH f IN ARRAY ARRAY[
    'account_issuance.admit_verified_award(jsonb)',
    'account_issuance.get_claim_verification_context(uuid,text)',
    'account_issuance.record_verification_deferral(uuid,text,text,integer)',
    'account_issuance.list_pending_award_claims(integer)'
  ] LOOP
    PERFORM pg_temp.check(has_function_privilege('account_award_verifier', f, 'EXECUTE'), 'V1c verifier may execute ' || f);
    PERFORM pg_temp.check(NOT has_function_privilege('authenticated', f, 'EXECUTE')
                      AND NOT has_function_privilege('anon', f, 'EXECUTE')
                      AND NOT has_function_privilege('public', f, 'EXECUTE')
                      AND NOT has_function_privilege('service_role', f, 'EXECUTE')
                      AND NOT has_function_privilege('account_reconciler', f, 'EXECUTE'),
      'V1d anon/authenticated/PUBLIC/service_role/reconciler cannot execute ' || f);
    PERFORM pg_temp.check((SELECT prosecdef AND pg_get_userbyid(proowner) = 'account_award_issuer'
                                  AND 'search_path=""' = ANY (proconfig)
                             FROM pg_proc WHERE oid = f::regprocedure),
      'V1e ' || f || ' is SECURITY DEFINER, owned by account_award_issuer, fixed search_path');
  END LOOP;
  PERFORM pg_temp.check(NOT has_schema_privilege('authenticated', 'account_issuance', 'USAGE')
                    AND NOT has_schema_privilege('anon', 'account_issuance', 'USAGE')
                    AND NOT has_schema_privilege('public', 'account_issuance', 'USAGE')
                    AND NOT has_schema_privilege('account_reconciler', 'account_issuance', 'USAGE'),
    'V1f account_issuance schema is unreachable by clients and by the TX1 reconciler');

  FOREACH f IN ARRAY ARRAY['account_award_admission_attestations', 'account_award_verification_attempts'] LOOP
    PERFORM pg_temp.check(NOT has_table_privilege('authenticated', 'public.' || f, 'SELECT,INSERT,UPDATE,DELETE')
                      AND NOT has_table_privilege('anon', 'public.' || f, 'SELECT,INSERT,UPDATE,DELETE')
                      AND NOT has_table_privilege('service_role', 'public.' || f, 'SELECT,INSERT,UPDATE,DELETE')
                      AND NOT has_table_privilege('account_reconciler', 'public.' || f, 'SELECT,INSERT,UPDATE,DELETE')
                      AND (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || f)::regclass),
      'V1g private table ' || f || ' has no client/reconciler access and RLS enabled');
  END LOOP;

  PERFORM pg_temp.check(NOT has_column_privilege('account_award_issuer', 'public.account_earned_awards', 'earned_on', 'UPDATE')
                    AND NOT has_column_privilege('account_award_issuer', 'public.account_earned_awards', 'date_provenance', 'UPDATE')
                    AND NOT has_column_privilege('account_award_issuer', 'public.account_earned_awards', 'card_document_id', 'UPDATE')
                    AND NOT has_column_privilege('account_award_issuer', 'public.account_earned_awards', 'earned_card_snapshot', 'UPDATE')
                    AND NOT has_table_privilege('account_award_issuer', 'public.account_earned_awards', 'DELETE,TRUNCATE')
                    AND NOT has_table_privilege('account_award_issuer', 'public.account_award_admission_attestations', 'UPDATE,DELETE,TRUNCATE')
                    AND NOT has_table_privilege('account_award_issuer', 'auth.users', 'SELECT,INSERT,UPDATE,DELETE'),
    'V1h issuer cannot revoke awards, rewrite trusted date/metadata, edit attestations or touch auth.users');
  PERFORM pg_temp.check(NOT has_table_privilege('account_reconciler', 'public.account_earned_awards', 'INSERT')
                    AND NOT has_column_privilege('account_reconciler', 'public.account_earned_awards', 'earned_card_snapshot', 'UPDATE'),
    'V1i TX1 guarantee preserved: the client-callable reconciler still cannot mint awards or set Card metadata');
END $$;

DO $$
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-0000000000a1', true);
    SET LOCAL ROLE authenticated;
    PERFORM account_issuance.admit_verified_award('{}'::jsonb);
    RAISE EXCEPTION 'ASSERTION FAILED: V1j authenticated reached issuance';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    PERFORM pg_temp.check(true, 'V1j authenticated reader cannot call the issuance port (insufficient_privilege)');
  END;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM account_issuance.list_pending_award_claims(10);
    RAISE EXCEPTION 'ASSERTION FAILED: V1k anon reached issuance';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    PERFORM pg_temp.check(true, 'V1k anon cannot list pending claims');
  END;
  BEGIN
    SET LOCAL ROLE account_reconciler;
    PERFORM account_issuance.admit_verified_award('{}'::jsonb);
    RAISE EXCEPTION 'ASSERTION FAILED: V1l reconciler reached issuance';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    PERFORM pg_temp.check(true, 'V1l the TX1 reconciler role cannot call the issuance port');
  END;
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-0000000000a1', true);
    SET LOCAL ROLE authenticated;
    PERFORM count(*) FROM public.account_award_admission_attestations;
    RAISE EXCEPTION 'ASSERTION FAILED: V1m attestation read';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    PERFORM pg_temp.check(true, 'V1m readers cannot read private attestations (no hidden basis exposure)');
  END;
END $$;

-- ===========================================================================
-- V2. Lifecycle: quarantined claim → trusted admission → permanent earned award
-- ===========================================================================
DO $$
DECLARE
  u constant text := 'a1000000-0000-4000-8000-0000000000a1';
  r jsonb;
  v_receipt_before jsonb;
  v_rev bigint;
BEGIN
  r := pg_temp.call_as(u, pg_temp.payload('v2-claim', 0, 'newAccountTransfer', jsonb_build_object(
    'completedChallenges', jsonb_build_object(
      'cms:vrf-c1', jsonb_build_object('completedOn', '2026-10-03'),
      'cms:vrf-c3', jsonb_build_object('completedOn', '2026-10-05'),
      'cms:vrf-c9', jsonb_build_object('completedOn', '2026-10-09')),
    'savedChallenges', jsonb_build_object('cms:vrf-s1', jsonb_build_object('savedOn', '2026-10-04')),
    'earnedAwards', jsonb_build_object(
      'card:monthly:2026-10:hope', jsonb_build_object('earnedOn', '2026-10-02', 'cardViewed', true,
        'earnedCard', pg_temp.card('2026-10', 'hope') || jsonb_build_object(
          'imageUrl', 'https://cdn.sanity.io/images/testproj/production/CLIENT-CHOSEN-ART-1x1.png',
          'shareEligible', true)),
      'card:monthly:2026-10:faith', jsonb_build_object('earnedOn', '2026-10-06')))));
  PERFORM pg_temp.check(r ->> 'status' = 'committed' AND (r -> 'receipt' -> 'unresolvedPersistedOnServer') = 'false'::jsonb,
    'V2a TX1 quarantines both claims and requires guest retention');
  SELECT to_jsonb(rc) INTO v_receipt_before FROM public.account_reconciliation_receipts rc
   WHERE account_id = u::uuid AND idempotency_key = 'v2-claim';
  v_rev := (SELECT revision FROM public.account_participation_profiles WHERE account_id = u::uuid);

  PERFORM pg_temp.check(pg_temp.pending_count() = 2, 'V2b verifier sees two pending claims');
  r := pg_temp.context(u, 'card:monthly:2026-10:hope');
  PERFORM pg_temp.check(r ->> 'status' = 'pending'
                    AND r -> 'completedChallengeIds' = '["cms:vrf-c1", "cms:vrf-c3", "cms:vrf-c9"]'::jsonb
                    AND NOT (r ? 'earnedCard') AND position('CLIENT-CHOSEN' IN r::text) = 0,
    'V2c context returns the account''s DB-owned completion IDs only (no client snapshot)');
  PERFORM pg_temp.check(pg_temp.context(u, 'card:monthly:2026-10:never-claimed') ->> 'status' = 'noPendingClaim'
                    AND pg_temp.context('b2000000-0000-4000-8000-0000000000b2', 'card:monthly:2026-10:hope') ->> 'status' = 'noPendingClaim',
    'V2d context reveals nothing for an unclaimed award or an account without that claim');

  r := pg_temp.admit(pg_temp.att(u, 'card:monthly:2026-10:hope', ARRAY['cms:vrf-c1', 'cms:vrf-c3'], '2026-10-03'));
  PERFORM pg_temp.check(r ->> 'status' = 'admitted' AND r ->> 'earnedOn' = '2026-10-03'
                    AND (r ->> 'revision')::bigint = v_rev + 1,
    'V2e verified claim admitted; earned date raised to earliest credible date; revision +1');
  PERFORM pg_temp.check(
    (SELECT earned_on = DATE '2026-10-03' AND date_provenance = 'clientReported'
            AND client_claimed_on = DATE '2026-10-02' AND card_viewed AND NOT hub_announcement_acked
            AND card_document_id = 'card-hope'
            AND earned_card_snapshot ->> 'imageUrl' = 'https://cdn.sanity.io/images/testproj/production/abc123-1200x1600.png'
       FROM public.account_earned_awards WHERE account_id = u::uuid AND award_id = 'card:monthly:2026-10:hope'),
    'V2f permanent earned record: TRUSTED Card art (client art discarded), claim kept as client_claimed_on, flags carried, never serverVerified');
  PERFORM pg_temp.check(NOT EXISTS (SELECT 1 FROM public.account_provisional_award_claims
                                     WHERE account_id = u::uuid AND award_id = 'card:monthly:2026-10:hope')
                    AND EXISTS (SELECT 1 FROM public.account_provisional_award_claims
                                 WHERE account_id = u::uuid AND award_id = 'card:monthly:2026-10:faith'),
    'V2g quarantine resolved for the verified claim only; unverified claim stays pending');
  r := pg_temp.get_as(u);
  PERFORM pg_temp.check(r -> 'pendingAwardVerification' = '["card:monthly:2026-10:faith"]'::jsonb
                    AND r -> 'envelope' -> 'data' -> 'earnedAwards' ? 'card:monthly:2026-10:hope'
                    AND NOT (r -> 'envelope' -> 'data' -> 'earnedAwards' ? 'card:monthly:2026-10:faith')
                    AND position('CLIENT-CHOSEN' IN r::text) = 0,
    'V2h reader readback: verified award earned with trusted art; unverified claim pending by ID only');
  PERFORM pg_temp.check(
    (SELECT basis_digest ~ '^[0-9a-f]{64}$' AND target_count = 2 AND roster_version = 1
            AND source_document_id = 'month-2026-10' AND verification_key = 'run-2026-11-01-a'
            AND claimed_earned_on = DATE '2026-10-02'
       FROM public.account_award_admission_attestations WHERE account_id = u::uuid),
    'V2i private attestation records a basis DIGEST and bounded version info');
  PERFORM pg_temp.check(NOT EXISTS (SELECT 1 FROM information_schema.columns
                                     WHERE table_name = 'account_award_admission_attestations'
                                       AND column_name ~ 'qualifying|basis_challenge'),
    'V2j the hidden qualifying list is never stored');
  PERFORM pg_temp.check(
    (SELECT to_jsonb(rc) FROM public.account_reconciliation_receipts rc
      WHERE account_id = u::uuid AND idempotency_key = 'v2-claim') = v_receipt_before,
    'V2k the earlier unresolvedPersistedOnServer=false receipt is immutable');
  PERFORM pg_temp.check((SELECT count(*) FROM public.account_completed_challenges WHERE account_id = u::uuid) = 3
                    AND EXISTS (SELECT 1 FROM public.account_saved_challenges WHERE account_id = u::uuid),
    'V2l unrelated completions and saves survive');

  -- Replay of the same attestation: no second award, no revision bump.
  v_rev := (SELECT revision FROM public.account_participation_profiles WHERE account_id = u::uuid);
  r := pg_temp.admit(pg_temp.att(u, 'card:monthly:2026-10:hope', ARRAY['cms:vrf-c1', 'cms:vrf-c3'], '2026-10-03'));
  PERFORM pg_temp.check(r ->> 'status' = 'alreadyEarned'
                    AND (SELECT revision FROM public.account_participation_profiles WHERE account_id = u::uuid) = v_rev
                    AND (SELECT count(*) FROM public.account_earned_awards WHERE account_id = u::uuid) = 1
                    AND (SELECT count(*) FROM public.account_award_admission_attestations WHERE account_id = u::uuid) = 1,
    'V2m same-key replay: alreadyEarned, no duplicate record, no revision bump');
  -- Replay with a DIFFERENT Card snapshot never rewrites trusted metadata.
  r := pg_temp.admit(pg_temp.att(u, 'card:monthly:2026-10:hope', ARRAY['cms:vrf-c1', 'cms:vrf-c3'], '2026-10-03',
         jsonb_build_object('card', pg_temp.card('2026-10', 'hope') || '{"imageUrl": "https://cdn.sanity.io/images/testproj/production/other-1x1.png"}'::jsonb)));
  PERFORM pg_temp.check(r ->> 'status' = 'alreadyEarned'
    AND (SELECT earned_card_snapshot ->> 'imageUrl' FROM public.account_earned_awards WHERE account_id = u::uuid)
        = 'https://cdn.sanity.io/images/testproj/production/abc123-1200x1600.png',
    'V2n an already-earned award keeps its original trusted snapshot');
END $$;

-- ===========================================================================
-- V3. Guest-clearance seam: only a FRESH reconcile can produce a clearing receipt
-- ===========================================================================
DO $$
DECLARE
  u constant text := 'a1000000-0000-4000-8000-0000000000a1';
  r jsonb;
  v_rev integer := (SELECT revision FROM public.account_participation_profiles WHERE account_id = 'a1000000-0000-4000-8000-0000000000a1');
BEGIN
  -- Replaying the OLD sync key returns the ORIGINAL (non-clearing) receipt, never a retroactive success.
  r := pg_temp.call_as(u, pg_temp.payload('v2-claim', v_rev, 'existingAccountMerge', '{}'::jsonb));
  PERFORM pg_temp.check(r ->> 'status' = 'alreadyCommittedDuplicate'
                    AND (r -> 'receipt' -> 'unresolvedPersistedOnServer') = 'false'::jsonb
                    AND (r -> 'guestRetentionRequired') = 'true'::jsonb,
    'V3a old idempotency key replays the original non-clearing receipt (no false guest clearance)');

  -- Fresh reconcile still holding the OTHER unverified Card: guest must still be retained.
  r := pg_temp.call_as(u, pg_temp.payload('v3-fresh-1', v_rev, 'existingAccountMerge', jsonb_build_object(
    'earnedAwards', jsonb_build_object(
      'card:monthly:2026-10:hope', jsonb_build_object('earnedOn', '2026-10-03', 'hubAnnouncementAcked', true),
      'card:monthly:2026-10:faith', jsonb_build_object('earnedOn', '2026-10-06')))));
  PERFORM pg_temp.check(r ->> 'status' = 'committed'
                    AND (r -> 'receipt' -> 'unresolvedPersistedOnServer') = 'false'::jsonb
                    AND r -> 'provisionalAwardClaims' = '["card:monthly:2026-10:faith"]'::jsonb,
    'V3b fresh reconcile with a still-unverified Card keeps guest retention required');
  PERFORM pg_temp.check(
    (SELECT hub_announcement_acked AND card_viewed FROM public.account_earned_awards
      WHERE account_id = u::uuid AND award_id = 'card:monthly:2026-10:hope'),
    'V3c reader flags merge monotonically onto the verified award via the normal TX1 path');

  -- Faith becomes verified; a fresh reconcile of the same guest data can now clear.
  r := pg_temp.admit(pg_temp.att(u, 'card:monthly:2026-10:faith', ARRAY['cms:vrf-c9'], '2026-10-09'));
  PERFORM pg_temp.check(r ->> 'status' = 'admitted' AND r ->> 'earnedOn' = '2026-10-09',
    'V3d second claim admitted (claim 10-06 precedes its basis release, so raised to 10-09)');
  v_rev := (SELECT revision FROM public.account_participation_profiles WHERE account_id = u::uuid);
  r := pg_temp.call_as(u, pg_temp.payload('v3-fresh-2', v_rev, 'existingAccountMerge', jsonb_build_object(
    'earnedAwards', jsonb_build_object(
      'card:monthly:2026-10:hope', jsonb_build_object('earnedOn', '2026-10-03'),
      'card:monthly:2026-10:faith', jsonb_build_object('earnedOn', '2026-10-09')))));
  PERFORM pg_temp.check(r ->> 'status' = 'committed' AND r ->> 'outcomeStatus' = 'committed'
                    AND (r -> 'receipt' -> 'unresolvedPersistedOnServer') = 'true'::jsonb
                    AND (r -> 'guestRetentionRequired') = 'false'::jsonb
                    AND r -> 'receipt' ->> 'committedGuestFingerprint' = encode(sha256(convert_to('v3-fresh-2', 'UTF8')), 'hex'),
    'V3e only a NEW reconcile, bound to the CURRENT guest fingerprint, yields a clearable receipt');
  PERFORM pg_temp.check(NOT EXISTS (SELECT 1 FROM public.account_provisional_award_claims WHERE account_id = u::uuid),
    'V3f no residual quarantine for this account');
END $$;

-- ===========================================================================
-- V4. Forged / malformed attestations and cross-account attempts fail with zero writes
-- ===========================================================================
DO $$
DECLARE
  a constant text := 'b2000000-0000-4000-8000-0000000000b2';
  other constant text := 'c3000000-0000-4000-8000-0000000000c3';
  r jsonb;
  c record;
  v_before bigint;
BEGIN
  r := pg_temp.call_as(a, pg_temp.payload('v4-claim', 0, 'newAccountTransfer', jsonb_build_object(
    'completedChallenges', jsonb_build_object('cms:vrf-c1', jsonb_build_object('completedOn', '2026-10-03')),
    'earnedAwards', jsonb_build_object('card:monthly:2026-10:hope', jsonb_build_object('earnedOn', '2026-10-05')))));
  r := pg_temp.call_as(other, pg_temp.payload('v4-other', 0, 'newAccountTransfer', jsonb_build_object(
    'completedChallenges', jsonb_build_object('cms:vrf-c1', jsonb_build_object('completedOn', '2026-10-03'),
                                              'cms:vrf-c3', jsonb_build_object('completedOn', '2026-10-05')))));
  v_before := pg_temp.row_total(a::uuid) + pg_temp.row_total(other::uuid);

  FOR c IN SELECT * FROM (VALUES
    ('basis the account never completed (c3 belongs to another account)',
      pg_temp.att(a, 'card:monthly:2026-10:hope', ARRAY['cms:vrf-c1', 'cms:vrf-c3'], '2026-10-03'), 'basisNotInAccountCompletions'),
    ('basis shorter than target', pg_temp.att(a, 'card:monthly:2026-10:hope', ARRAY['cms:vrf-c1'], '2026-10-03', '{"targetCount": 2}'), 'invalidBasis'),
    ('duplicate basis entries', pg_temp.att(a, 'card:monthly:2026-10:hope', ARRAY['cms:vrf-c1', 'cms:vrf-c1'], '2026-10-03'), 'invalidBasis'),
    ('pilot basis id', pg_temp.att(a, 'card:monthly:2026-10:hope', ARRAY['pilot:vrf-c1'], '2026-10-03'), 'invalidBasis'),
    ('zero target', pg_temp.att(a, 'card:monthly:2026-10:hope', ARRAY[]::text[], '2026-10-03'), 'invalidBasis'),
    ('future verification date', pg_temp.att(a, 'card:monthly:2026-10:hope', ARRAY['cms:vrf-c1'], '2026-10-03', '{"verifiedThroughDate": "2999-01-01"}'), 'invalidVerificationDates'),
    ('release date outside month', pg_temp.att(a, 'card:monthly:2026-10:hope', ARRAY['cms:vrf-c1'], '2026-09-30'), 'invalidVerificationDates'),
    ('verified before last release', pg_temp.att(a, 'card:monthly:2026-10:hope', ARRAY['cms:vrf-c1'], '2026-10-20', '{"verifiedThroughDate": "2026-10-10"}'), 'invalidVerificationDates'),
    ('non-CDN artwork', pg_temp.att(a, 'card:monthly:2026-10:hope', ARRAY['cms:vrf-c1'], '2026-10-03',
       jsonb_build_object('card', pg_temp.card('2026-10', 'hope') || '{"imageUrl": "http://evil.example/x.png"}'::jsonb)), 'invalidTrustedCard'),
    ('Card for another month', pg_temp.att(a, 'card:monthly:2026-10:hope', ARRAY['cms:vrf-c1'], '2026-10-03',
       jsonb_build_object('card', pg_temp.card('2026-09', 'hope'))), 'invalidTrustedCard'),
    ('kind mismatch', pg_temp.att(a, 'card:monthly:2026-10:hope', ARRAY['cms:vrf-c1'], '2026-10-03', '{"kind": "fullMonth"}'), 'invalidAwardIdentity'),
    ('lab discovery', pg_temp.att(a, 'card:monthly:2026-10:lab-x', ARRAY['cms:vrf-c1'], '2026-10-03'), 'invalidAwardIdentity'),
    ('draft source document', pg_temp.att(a, 'card:monthly:2026-10:hope', ARRAY['cms:vrf-c1'], '2026-10-03',
       '{"source": {"documentId": "drafts.month-2026-10", "revision": "r", "dataset": "staging", "perspective": "published"}}'), 'invalidSource'),
    ('drafts perspective', pg_temp.att(a, 'card:monthly:2026-10:hope', ARRAY['cms:vrf-c1'], '2026-10-03',
       '{"source": {"documentId": "month-2026-10", "revision": "r", "dataset": "staging", "perspective": "drafts"}}'), 'invalidSource'),
    ('third dataset', pg_temp.att(a, 'card:monthly:2026-10:hope', ARRAY['cms:vrf-c1'], '2026-10-03',
       '{"source": {"documentId": "month-2026-10", "revision": "r", "dataset": "berrymark-development", "perspective": "published"}}'), 'invalidSource'),
    ('self-asserted verified flag', pg_temp.att(a, 'card:monthly:2026-10:hope', ARRAY['cms:vrf-c1'], '2026-10-03', '{"verified": true}'), 'invalidAttestationShape'),
    ('client earnedOn override', pg_temp.att(a, 'card:monthly:2026-10:hope', ARRAY['cms:vrf-c1'], '2026-10-03', '{"earnedOn": "2026-10-01"}'), 'invalidAttestationShape'),
    ('uppercase/forged account id', pg_temp.att(upper(a), 'card:monthly:2026-10:hope', ARRAY['cms:vrf-c1'], '2026-10-03'), 'invalidAccountId')
  ) AS t(label, att, detail) LOOP
    r := pg_temp.admit(c.att);
    PERFORM pg_temp.check(r ->> 'status' = 'rejected' AND r ->> 'detail' = c.detail,
      'V4 rejects ' || c.label || ' [got ' || coalesce(r ->> 'detail', r ->> 'status') || ']');
  END LOOP;
  PERFORM pg_temp.check(pg_temp.row_total(a::uuid) + pg_temp.row_total(other::uuid) = v_before
                    AND NOT EXISTS (SELECT 1 FROM public.account_earned_awards WHERE account_id IN (a::uuid, other::uuid)),
    'V4z every rejected attestation wrote nothing');

  -- An award nobody claimed cannot be minted, even for an account with qualifying completions.
  r := pg_temp.admit(pg_temp.att(other, 'card:monthly:2026-10:hope', ARRAY['cms:vrf-c1', 'cms:vrf-c3'], '2026-10-03'));
  PERFORM pg_temp.check(r ->> 'status' = 'noPendingClaim'
                    AND NOT EXISTS (SELECT 1 FROM public.account_earned_awards WHERE account_id = other::uuid),
    'V4y the issuer can never mint an unclaimed award');
END $$;

-- ===========================================================================
-- V5. Deferral (missing trusted metadata) keeps the claim pending; later admission resolves it
-- ===========================================================================
DO $$
DECLARE
  u constant text := 'd4000000-0000-4000-8000-0000000000d4';
  r jsonb;
BEGIN
  r := pg_temp.call_as(u, pg_temp.payload('v5-claim', 0, 'newAccountTransfer', jsonb_build_object(
    'completedChallenges', jsonb_build_object('cms:vrf-c2', jsonb_build_object('completedOn', '2026-10-02')),
    'savedScriptures', jsonb_build_array(jsonb_build_object('key', 'romans 8:1|', 'reference', 'Romans 8:1', 'translation', null, 'savedOn', '2026-10-02')),
    'earnedAwards', jsonb_build_object('card:monthly:2026-10:wisdom', jsonb_build_object('earnedOn', '2026-10-04')))));
  r := pg_temp.defer(u, 'card:monthly:2026-10:wisdom', 'cardNotApproved');
  PERFORM pg_temp.check(r ->> 'status' = 'deferred', 'V5a deferral recorded');
  r := pg_temp.defer(u, 'card:monthly:2026-10:wisdom', 'cardNotApproved');
  PERFORM pg_temp.check((SELECT attempt_count = 2 AND last_reason = 'cardNotApproved'
                           FROM public.account_award_verification_attempts WHERE account_id = u::uuid),
    'V5b repeated deferral increments the private attempt counter');
  PERFORM pg_temp.check(pg_temp.defer(u, 'card:monthly:2026-10:wisdom', 'trustMe') ->> 'status' = 'rejected'
                    AND pg_temp.defer(u, 'card:monthly:2026-10:nope', 'cardNotApproved') ->> 'status' = 'noPendingClaim',
    'V5c unknown reasons and non-claims are refused');
  PERFORM pg_temp.check(EXISTS (SELECT 1 FROM public.account_provisional_award_claims WHERE account_id = u::uuid)
                    AND pg_temp.get_as(u) -> 'envelope' -> 'data' -> 'earnedAwards' = '{}'::jsonb
                    AND EXISTS (SELECT 1 FROM public.account_saved_scriptures WHERE account_id = u::uuid),
    'V5d deferred claim stays quarantined (not earned, no art); unrelated saves survive');
  r := pg_temp.admit(pg_temp.att(u, 'card:monthly:2026-10:wisdom', ARRAY['cms:vrf-c2'], '2026-10-02'));
  PERFORM pg_temp.check(r ->> 'status' = 'admitted' AND r ->> 'earnedOn' = '2026-10-04'
                    AND NOT EXISTS (SELECT 1 FROM public.account_award_verification_attempts WHERE account_id = u::uuid),
    'V5e once metadata appears the claim resolves (later claim date kept) and its attempt record is cleared');
END $$;

-- ===========================================================================
-- V6. Previously verified awards are preserved; re-appearing claims only OR flags
-- ===========================================================================
DO $$
DECLARE
  u constant text := 'c3000000-0000-4000-8000-0000000000c3';
  r jsonb;
BEGIN
  INSERT INTO public.account_earned_awards (account_id, award_id, kind, publication_year_month, discovery_id,
    earned_on, date_provenance, hub_announcement_acked, card_viewed, card_document_id, earned_card_snapshot)
  VALUES (u::uuid, 'card:monthly:2026-10:grace', 'thematic', '2026-10', 'discovery:2026-10:grace',
    DATE '2026-10-08', 'serverVerified', false, false, 'card-grace', pg_temp.card('2026-10', 'grace'));
  INSERT INTO public.account_provisional_award_claims (account_id, award_id, kind, publication_year_month,
    discovery_id, claimed_earned_on, hub_announcement_acked, card_viewed, last_idempotency_key)
  VALUES (u::uuid, 'card:monthly:2026-10:grace', 'thematic', '2026-10', 'discovery:2026-10:grace',
    DATE '2026-10-02', true, false, 'legacy-device');
  r := pg_temp.admit(pg_temp.att(u, 'card:monthly:2026-10:grace', ARRAY['cms:vrf-c1'], '2026-10-03',
         jsonb_build_object('card', pg_temp.card('2026-10', 'grace') || '{"imageUrl": "https://cdn.sanity.io/images/testproj/production/new-1x1.png"}'::jsonb)));
  PERFORM pg_temp.check(r ->> 'status' = 'alreadyEarned', 'V6a existing verified award is not re-issued');
  PERFORM pg_temp.check(
    (SELECT earned_on = DATE '2026-10-08' AND date_provenance = 'serverVerified' AND hub_announcement_acked
            AND earned_card_snapshot ->> 'imageUrl' = 'https://cdn.sanity.io/images/testproj/production/abc123-1200x1600.png'
       FROM public.account_earned_awards WHERE account_id = u::uuid AND award_id = 'card:monthly:2026-10:grace')
    AND NOT EXISTS (SELECT 1 FROM public.account_provisional_award_claims WHERE account_id = u::uuid AND award_id = 'card:monthly:2026-10:grace'),
    'V6b trusted date/provenance/snapshot preserved (no earlier client date), flag ORed, stale claim resolved');
END $$;

-- ===========================================================================
-- V7. Issuer RLS confinement: the elevated role sees only the account being processed
-- ===========================================================================
DO $$
DECLARE n bigint;
BEGIN
  PERFORM set_config('bibleberry.award_issuance_account', 'a1000000-0000-4000-8000-0000000000a1', true);
  SET LOCAL ROLE account_award_issuer;
  SELECT count(*) INTO n FROM public.account_earned_awards WHERE account_id <> 'a1000000-0000-4000-8000-0000000000a1';
  RESET ROLE;
  PERFORM pg_temp.check(n = 0, 'V7a issuer confined to the processed account sees no other account''s awards');
  PERFORM set_config('bibleberry.award_issuance_account', '', true);
  SET LOCAL ROLE account_award_issuer;
  SELECT count(*) INTO n FROM public.account_earned_awards;
  RESET ROLE;
  PERFORM pg_temp.check(n = 0, 'V7b outside an admission call the issuer sees no awards at all');
  BEGIN
    PERFORM set_config('bibleberry.award_issuance_account', 'a1000000-0000-4000-8000-0000000000a1', true);
    SET LOCAL ROLE account_award_issuer;
    INSERT INTO public.account_earned_awards (account_id, award_id, kind, publication_year_month, discovery_id, earned_on, date_provenance)
    VALUES ('b2000000-0000-4000-8000-0000000000b2', 'card:monthly:2026-10:peace', 'thematic', '2026-10', 'discovery:2026-10:peace', DATE '2026-10-05', 'clientReported');
    RAISE EXCEPTION 'ASSERTION FAILED: V7c cross-account insert';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    PERFORM pg_temp.check(true, 'V7c issuer cannot write an award for any account other than the one being processed');
  END;
END $$;

-- ===========================================================================
-- V8. Atomicity under injected failure: nothing half-admitted
-- ===========================================================================
CREATE FUNCTION pg_temp.inject_attestation_failure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.verification_key = 'run-boom' THEN
    RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = 'injected';
  END IF;
  IF NEW.verification_key = 'run-crash' THEN
    RAISE EXCEPTION USING ERRCODE = 'XX001', MESSAGE = 'injected hard failure';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER v1_test_inject_attestation_failure
  BEFORE INSERT ON public.account_award_admission_attestations
  FOR EACH ROW EXECUTE FUNCTION pg_temp.inject_attestation_failure();

DO $$
DECLARE
  u constant text := 'b2000000-0000-4000-8000-0000000000b2';
  r jsonb;
  v_rev bigint := (SELECT revision FROM public.account_participation_profiles WHERE account_id = 'b2000000-0000-4000-8000-0000000000b2');
  v_raised boolean := false;
BEGIN
  r := pg_temp.admit(pg_temp.att(u, 'card:monthly:2026-10:hope', ARRAY['cms:vrf-c1'], '2026-10-03', '{"verificationKey": "run-boom"}'));
  PERFORM pg_temp.check(r ->> 'status' = 'rejected' AND r ->> 'detail' = 'constraintViolation'
                    AND NOT EXISTS (SELECT 1 FROM public.account_earned_awards WHERE account_id = u::uuid)
                    AND EXISTS (SELECT 1 FROM public.account_provisional_award_claims WHERE account_id = u::uuid)
                    AND (SELECT revision FROM public.account_participation_profiles WHERE account_id = u::uuid) = v_rev,
    'V8a injected constraint failure rolls back award insert; claim and revision untouched');
  BEGIN
    r := pg_temp.admit(pg_temp.att(u, 'card:monthly:2026-10:hope', ARRAY['cms:vrf-c1'], '2026-10-03', '{"verificationKey": "run-crash"}'));
  EXCEPTION WHEN SQLSTATE 'XX001' THEN
    v_raised := true;
  END;
  PERFORM pg_temp.check(v_raised
                    AND NOT EXISTS (SELECT 1 FROM public.account_earned_awards WHERE account_id = u::uuid)
                    AND EXISTS (SELECT 1 FROM public.account_provisional_award_claims WHERE account_id = u::uuid),
    'V8b injected hard failure propagates (retryable) and persists nothing');
  r := pg_temp.admit(pg_temp.att(u, 'card:monthly:2026-10:hope', ARRAY['cms:vrf-c1'], '2026-10-03', '{"verificationKey": "run-retry"}'));
  PERFORM pg_temp.check(r ->> 'status' = 'admitted', 'V8c retry after the fault clears admits exactly once');
END $$;

-- ===========================================================================
-- V10. R13-SB2 D3: transaction-local confinement with fail-closed entry resets
--      (no function-level `SET bibleberry.award_issuance_account` clause any more)
-- ===========================================================================
INSERT INTO auth.users (id) VALUES
  ('e5000000-0000-4000-8000-0000000000e5'),
  ('f6000000-0000-4000-8000-0000000000f6');

-- Reads the confinement setting exactly as the verifier's own session sees it after a call.
CREATE FUNCTION pg_temp.confinement() RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(current_setting('bibleberry.award_issuance_account', true), '');
$$;

-- Verifier-side preset of the confinement GUC (any role may set an unregistered placeholder).
CREATE FUNCTION pg_temp.verifier_preset(p_value text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  SET LOCAL ROLE account_award_verifier;
  PERFORM set_config('bibleberry.award_issuance_account', p_value, true);
  RESET ROLE;
END $$;

DO $$
DECLARE
  e constant text := 'e5000000-0000-4000-8000-0000000000e5';
  f constant text := 'f6000000-0000-4000-8000-0000000000f6';
  r jsonb;
  n bigint;
  v_raised boolean := false;
BEGIN
  PERFORM pg_temp.check(NOT EXISTS (
    SELECT 1 FROM pg_proc p, unnest(p.proconfig) c
     WHERE p.pronamespace = 'account_issuance'::regnamespace AND c LIKE 'bibleberry.%'),
    'V10a no account_issuance function carries a function-level bibleberry.* SET clause');
  PERFORM pg_temp.check(NOT has_function_privilege('account_award_issuer', 'account_private.request_account_id()', 'EXECUTE')
                    AND NOT has_function_privilege('account_award_verifier', 'account_private.request_account_id()', 'EXECUTE'),
    'V10b the issuer and verifier cannot execute the reconciler-only auth.uid() bridge');

  r := pg_temp.call_as(e, pg_temp.payload('v10-e', 0, 'newAccountTransfer', jsonb_build_object(
    'completedChallenges', jsonb_build_object('cms:vrf-e1', jsonb_build_object('completedOn', '2026-10-03')),
    'earnedAwards', jsonb_build_object('card:monthly:2026-10:hope', jsonb_build_object('earnedOn', '2026-10-04')))));
  PERFORM pg_temp.check(r ->> 'status' = 'committed', 'V10c account E nominated a claim through TX1');
  r := pg_temp.call_as(f, pg_temp.payload('v10-f', 0, 'newAccountTransfer', jsonb_build_object(
    'completedChallenges', jsonb_build_object('cms:vrf-f1', jsonb_build_object('completedOn', '2026-10-03')),
    'earnedAwards', jsonb_build_object('card:monthly:2026-10:hope', jsonb_build_object('earnedOn', '2026-10-04')))));
  PERFORM pg_temp.check(r ->> 'status' = 'committed', 'V10d account F nominated a claim through TX1');

  -- Caller preset F; context for E must use E's data and leave E (never F) behind.
  PERFORM pg_temp.verifier_preset(f);
  r := pg_temp.context(e, 'card:monthly:2026-10:hope');
  PERFORM pg_temp.check(r ->> 'status' = 'pending' AND r -> 'completedChallengeIds' = '["cms:vrf-e1"]'::jsonb
                    AND pg_temp.confinement() = e,
    'V10e caller-preset F is ignored: context for E returns only E''s completions and confines to E');

  -- Early-return paths (before any account is confined) must leave NO confinement at all.
  PERFORM pg_temp.verifier_preset(f);
  r := pg_temp.context(e, 'card:monthly:2026-10:never-claimed');
  PERFORM pg_temp.check(r ->> 'status' = 'noPendingClaim' AND pg_temp.confinement() = '',
    'V10f context early return discards a caller preset (fail-closed entry reset)');
  PERFORM pg_temp.verifier_preset(f);
  r := pg_temp.defer(e, 'card:monthly:2026-10:never-claimed', 'missingTrustedMetadata');
  PERFORM pg_temp.check(r ->> 'status' = 'noPendingClaim' AND pg_temp.confinement() = '',
    'V10g deferral early return discards a caller preset');
  PERFORM pg_temp.verifier_preset(f);
  r := pg_temp.admit('{"unexpected": true}'::jsonb);
  PERFORM pg_temp.check(r ->> 'detail' = 'invalidAttestationShape' AND pg_temp.confinement() = '',
    'V10h admission shape rejection discards a caller preset');
  PERFORM pg_temp.verifier_preset(f);
  r := pg_temp.admit(pg_temp.att(e, 'card:monthly:2026-10:hope', ARRAY['cms:vrf-e1'], '2026-10-03',
         '{"verificationKey": "run-v10-bad", "targetCount": 2}'));
  PERFORM pg_temp.check(r ->> 'status' = 'rejected' AND pg_temp.confinement() = '',
    'V10i admission validation rejection discards a caller preset');

  -- Two accounts in ONE transaction, caller presetting the OTHER account each time.
  PERFORM pg_temp.verifier_preset(f);
  r := pg_temp.admit(pg_temp.att(e, 'card:monthly:2026-10:hope', ARRAY['cms:vrf-e1'], '2026-10-03',
         '{"verificationKey": "run-v10-e"}'));
  PERFORM pg_temp.check(r ->> 'status' = 'admitted' AND pg_temp.confinement() = e,
    'V10j admission for E (caller preset F) admitted and confined to E');
  PERFORM pg_temp.verifier_preset(e);
  r := pg_temp.admit(pg_temp.att(f, 'card:monthly:2026-10:hope', ARRAY['cms:vrf-f1'], '2026-10-03',
         '{"verificationKey": "run-v10-f"}'));
  PERFORM pg_temp.check(r ->> 'status' = 'admitted' AND pg_temp.confinement() = f,
    'V10k admission for F in the same transaction (caller preset E) admitted and confined to F');
  PERFORM pg_temp.check(
    (SELECT count(*) FROM public.account_earned_awards WHERE account_id = e::uuid) = 1
    AND (SELECT count(*) FROM public.account_earned_awards WHERE account_id = f::uuid) = 1
    AND (SELECT count(*) FROM public.account_award_admission_attestations
          WHERE account_id = e::uuid AND verification_key = 'run-v10-e') = 1
    AND (SELECT count(*) FROM public.account_award_admission_attestations
          WHERE account_id = f::uuid AND verification_key = 'run-v10-f') = 1
    AND NOT EXISTS (SELECT 1 FROM public.account_award_admission_attestations
                     WHERE (account_id = e::uuid AND verification_key = 'run-v10-f')
                        OR (account_id = f::uuid AND verification_key = 'run-v10-e')),
    'V10l each admission wrote exactly its own account (no cross-account row)');
  -- While confined to F, the issuer sees nothing of E.
  SET LOCAL ROLE account_award_issuer;
  SELECT count(*) INTO n FROM public.account_earned_awards WHERE account_id = e::uuid;
  RESET ROLE;
  PERFORM pg_temp.check(n = 0, 'V10m after F''s admission the issuer is not confined to E');

  -- Idempotent replay in the same transaction after switching accounts.
  r := pg_temp.admit(pg_temp.att(e, 'card:monthly:2026-10:hope', ARRAY['cms:vrf-e1'], '2026-10-03',
         '{"verificationKey": "run-v10-e"}'));
  PERFORM pg_temp.check(r ->> 'status' IN ('alreadyEarned', 'noPendingClaim') AND pg_temp.confinement() IN (e, ''),
    'V10n replay for E after F returns a non-admitting status and never stays confined to F');
END $$;

-- Exception paths: an injected constraint failure (handled) and a hard failure (propagated).
DO $$
DECLARE
  e constant text := 'e5000000-0000-4000-8000-0000000000e5';
  f constant text := 'f6000000-0000-4000-8000-0000000000f6';
  r jsonb;
  v_raised boolean := false;
BEGIN
  r := pg_temp.call_as(e, pg_temp.payload('v10-e2',
    (SELECT revision::integer FROM public.account_participation_profiles WHERE account_id = e::uuid), 'existingAccountMerge', jsonb_build_object(
    'earnedAwards', jsonb_build_object('card:monthly:2026-10:faith', jsonb_build_object('earnedOn', '2026-10-04')))));
  PERFORM pg_temp.check(r ->> 'status' = 'committed', 'V10o account E nominated a second claim');

  PERFORM pg_temp.verifier_preset(f);
  r := pg_temp.admit(pg_temp.att(e, 'card:monthly:2026-10:faith', ARRAY['cms:vrf-e1'], '2026-10-03',
         '{"verificationKey": "run-boom"}'));
  PERFORM pg_temp.check(r ->> 'status' = 'rejected' AND r ->> 'detail' = 'constraintViolation'
                    AND pg_temp.confinement() IN (e, ''),
    'V10p handled exception path: rejected, and never left confined to the caller preset F');

  PERFORM pg_temp.verifier_preset(f);
  BEGIN
    r := pg_temp.admit(pg_temp.att(e, 'card:monthly:2026-10:faith', ARRAY['cms:vrf-e1'], '2026-10-03',
           '{"verificationKey": "run-crash"}'));
  EXCEPTION WHEN SQLSTATE 'XX001' THEN
    v_raised := true;
  END;
  -- The aborted subtransaction restores the CALLER's own value; the next issuer call resets it.
  r := pg_temp.context(e, 'card:monthly:2026-10:faith');
  PERFORM pg_temp.check(v_raised AND r ->> 'status' = 'pending'
                    AND r -> 'completedChallengeIds' = '["cms:vrf-e1"]'::jsonb
                    AND pg_temp.confinement() = e
                    AND NOT EXISTS (SELECT 1 FROM public.account_earned_awards
                                     WHERE account_id = e::uuid AND award_id = 'card:monthly:2026-10:faith'),
    'V10q hard failure persisted nothing; the next call ignores the restored preset and confines to E');
END $$;

DROP TRIGGER v1_test_inject_attestation_failure ON public.account_award_admission_attestations;

ROLLBACK;

-- ===========================================================================
-- V9. Non-READ COMMITTED callers fail closed
-- ===========================================================================
BEGIN ISOLATION LEVEL REPEATABLE READ;
DO $$
DECLARE r jsonb;
BEGIN
  SET LOCAL ROLE account_award_verifier;
  r := account_issuance.admit_verified_award('{}'::jsonb);
  RESET ROLE;
  IF r ->> 'detail' IS DISTINCT FROM 'unsupportedTransactionIsolation' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: V9 expected isolation rejection, got %', r;
  END IF;
  RAISE NOTICE 'ok - V9 REPEATABLE READ admission rejected';
END $$;
ROLLBACK;

\echo 'R13-VERIFY1 issuance security & lifecycle suite: all assertions passed.'
