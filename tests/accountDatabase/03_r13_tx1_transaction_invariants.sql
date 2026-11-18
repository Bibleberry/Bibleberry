-- Bibleberry R13-TX1: transactional data-invariant, idempotency and rollback suite.
-- LOCAL DISPOSABLE DATABASE ONLY. Requires bootstrap + R13-3 + R13-TX1 migrations.
-- Run via scripts/accountDatabase/run-local-transaction-tests.sh.
--
-- Every call goes through the real public.reconcile_guest_participation() under the
-- simulated PostgREST `authenticated` role with a JWT subject (pg_temp.call_as).

\set ON_ERROR_STOP 1

BEGIN;

\ir _r13_tx1_test_helpers.sql

INSERT INTO auth.users (id) VALUES
  ('10000000-0000-4000-8000-000000000001'),  -- u1 first transfer / idempotency
  ('20000000-0000-4000-8000-000000000002'),  -- u2 existing-account merge
  ('30000000-0000-4000-8000-000000000003'),  -- u3 rollback
  ('40000000-0000-4000-8000-000000000004'),  -- u4 Shelf
  ('4b000000-0000-4000-8000-00000000004b'),  -- u4b explicit empty Shelf
  ('4c000000-0000-4000-8000-00000000004c'),  -- u4c account without Shelf state
  ('50000000-0000-4000-8000-000000000005'),  -- u5 validation
  ('60000000-0000-4000-8000-000000000006'),  -- u6 date bounds
  ('90000000-0000-4000-8000-000000000009');  -- u9 award verification quarantine

-- ===========================================================================
-- T1. First-time transfer (newAccountTransfer) — atomic, exact receipt
-- ===========================================================================
DO $$
DECLARE
  u constant text := '10000000-0000-4000-8000-000000000001';
  r jsonb;
  v_fp constant text := repeat('1', 64);
  v_rcpt public.account_reconciliation_receipts%ROWTYPE;
BEGIN
  r := pg_temp.call_as(u, pg_temp.payload('t1-first', 0, 'newAccountTransfer', jsonb_build_object(
    'completedChallenges', jsonb_build_object(
      'cms:c1', jsonb_build_object('completedOn', '2026-11-02', 'dateProvenance', 'serverVerified'),
      'cms:c2', jsonb_build_object('completedOn', '2026-11-03', 'dateProvenance', 'clientReported')),
    'inProgressChallenges', jsonb_build_object(
      'cms:c1', jsonb_build_object('screenId', 's-9', 'updatedOn', '2026-11-01'),
      'cms:p1', jsonb_build_object('screenId', 's-3', 'updatedOn', '2026-11-03')),
    'savedChallenges', jsonb_build_object('cms:sv1', jsonb_build_object('savedOn', '2026-11-04')),
    'savedScriptures', jsonb_build_array(
      jsonb_build_object('key', 'romans 8:1|web', 'reference', 'Romans 8:1', 'translation', 'WEB',
                         'savedOn', '2026-11-04', 'sourceChallengeId', 'cms:c1'),
      jsonb_build_object('key', 'psalm 23:1-3|', 'reference', 'Psalm 23:1–3', 'translation', null,
                         'savedOn', '2026-11-05')),
    'earnedAwards', jsonb_build_object(
      'card:monthly:2026-10:hope', jsonb_build_object('awardId', 'card:monthly:2026-10:hope', 'kind', 'thematic',
         'publicationYearMonth', '2026-10', 'discoveryId', 'discovery:2026-10:hope', 'earnedOn', '2026-10-05',
         'hubAnnouncementAcked', false, 'cardViewed', true, 'dateProvenance', 'serverVerified',
         'earnedCard', pg_temp.card('2026-10', 'hope')),
      'card:monthly:2026-10:full-month', jsonb_build_object('earnedOn', '2026-10-31',
         'hubAnnouncementAcked', true, 'cardViewed', false)),
    'lastOpenedChallenge', jsonb_build_object('challengeId', 'cms:p1', 'openedOn', '2026-11-03')
  ), v_fp));

  PERFORM pg_temp.check(r ->> 'status' = 'committed', 'T1a first transfer commits');
  PERFORM pg_temp.check(r ->> 'outcomeStatus' = 'reconciledWithUnresolved',
    'T1b outcome is reconciledWithUnresolved because award claims cannot be verified');
  PERFORM pg_temp.check(
    (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(r -> 'receipt') k)
      = ARRAY['accountId', 'committedGuestFingerprint', 'durableRevision', 'idempotencyKey', 'ok',
              'status', 'unresolvedCount', 'unresolvedPersistedOnServer'],
    'T1c receipt has exactly the CommitAckReceipt field set');
  PERFORM pg_temp.check(
    r -> 'receipt' = jsonb_build_object('ok', true, 'status', 'committed', 'accountId', u,
      'idempotencyKey', 't1-first', 'committedGuestFingerprint', v_fp, 'durableRevision', 1,
      'unresolvedCount', 2, 'unresolvedPersistedOnServer', false),
    'T1d receipt values are exact: 2 quarantined award claims, unresolvedPersistedOnServer=false');
  PERFORM pg_temp.check((r -> 'guestRetentionRequired') = 'true'::jsonb
                    AND r -> 'provisionalAwardClaims' = '["card:monthly:2026-10:hope", "card:monthly:2026-10:full-month"]'::jsonb,
    'T1d2 result names the quarantined claims and requires guest retention');
  -- Same predicate canSafelyClearGuestStorage applies: unresolvedCount > 0 && !persisted => retain.
  PERFORM pg_temp.check((r -> 'receipt' ->> 'unresolvedCount')::int > 0
                    AND (r -> 'receipt' -> 'unresolvedPersistedOnServer') = 'false'::jsonb,
    'T1d3 receipt blocks guest clearance (unresolvedNotPersistedOnServer) so local cards are kept');
  PERFORM pg_temp.check((r -> 'committedEnvelope' ->> 'revision')::int = 1, 'T1e committed envelope at revision 1');

  PERFORM pg_temp.check((SELECT revision FROM public.account_participation_profiles WHERE account_id = u::uuid) = 1,
    'T1f profile created at revision 1');
  PERFORM pg_temp.check((SELECT count(*) FROM public.account_completed_challenges WHERE account_id = u::uuid) = 2,
    'T1g both completions persisted');
  PERFORM pg_temp.check(NOT EXISTS (SELECT 1 FROM public.account_completed_challenges
                                     WHERE account_id = u::uuid AND date_provenance = 'serverVerified')
                    AND NOT EXISTS (SELECT 1 FROM public.account_earned_awards
                                     WHERE account_id = u::uuid AND date_provenance = 'serverVerified'),
    'T1h client "serverVerified" claims are never minted: all client dates stay clientReported');
  PERFORM pg_temp.check((SELECT client_claimed_on FROM public.account_completed_challenges
                          WHERE account_id = u::uuid AND challenge_id = 'cms:c1') = DATE '2026-11-02',
    'T1i client claim recorded in client_claimed_on');
  PERFORM pg_temp.check(NOT EXISTS (SELECT 1 FROM public.account_in_progress_challenges
                                     WHERE account_id = u::uuid AND challenge_id = 'cms:c1'),
    'T1j completed Challenge never retains an in-progress row');
  PERFORM pg_temp.check(EXISTS (SELECT 1 FROM public.account_in_progress_challenges
                                 WHERE account_id = u::uuid AND challenge_id = 'cms:p1' AND screen_id = 's-3'),
    'T1k uncompleted in-progress position transferred');
  -- Reviewer case (PR #207): an October full-month Card claimed with ZERO October completions
  -- must not become an earned award without trusted CMS verification (R08A-0 §6.2).
  PERFORM pg_temp.check(NOT EXISTS (SELECT 1 FROM public.account_earned_awards WHERE account_id = u::uuid),
    'T1l unverifiable award claims are NOT inserted as earned awards');
  PERFORM pg_temp.check(r -> 'committedEnvelope' -> 'data' -> 'earnedAwards' = '{}'::jsonb
                    AND pg_temp.get_as(u) -> 'envelope' -> 'data' -> 'earnedAwards' = '{}'::jsonb,
    'T1l2 quarantined claims never appear in earnedAwards on commit or readback');
  PERFORM pg_temp.check(pg_temp.get_as(u) -> 'pendingAwardVerification'
                          = '["card:monthly:2026-10:full-month", "card:monthly:2026-10:hope"]'::jsonb,
    'T1l3 readback lists pending claims by ID only, outside the envelope');
  PERFORM pg_temp.check(
    (SELECT hub_announcement_acked = false AND card_viewed = true AND earned_card_snapshot IS NOT NULL
            AND card_document_id = 'card-hope' AND claimed_earned_on = DATE '2026-10-05'
            AND verification_status = 'pendingTrustedVerification'
       FROM public.account_provisional_award_claims WHERE account_id = u::uuid AND award_id = 'card:monthly:2026-10:hope'),
    'T1m claim evidence (flags, snapshot, document, claimed date) quarantined independently');
  PERFORM pg_temp.check(
    (SELECT hub_announcement_acked = true AND card_viewed = false AND kind = 'fullMonth'
       FROM public.account_provisional_award_claims WHERE account_id = u::uuid AND award_id = 'card:monthly:2026-10:full-month'),
    'T1m2 server derives kind/discovery from canonical award ID');
  PERFORM pg_temp.check(
    (SELECT reference = 'Psalm 23:1–3' AND translation IS NULL
       FROM public.account_saved_scriptures WHERE account_id = u::uuid AND scripture_key = 'psalm 23:1-3|'),
    'T1n Saved Scripture: canonical key, display reference preserved, no passage text');

  SELECT * INTO v_rcpt FROM public.account_reconciliation_receipts
   WHERE account_id = u::uuid AND idempotency_key = 't1-first';
  PERFORM pg_temp.check(v_rcpt.committed_revision = 1 AND v_rcpt.guest_payload_digest = v_fp
                    AND v_rcpt.mode = 'newAccountTransfer' AND v_rcpt.outcome_status = 'reconciledWithUnresolved'
                    AND v_rcpt.unresolved_count = 2 AND NOT v_rcpt.unresolved_persisted_on_server,
    'T1o durable receipt row matches the acknowledgement');
END $$;

-- ===========================================================================
-- T2. Idempotency: duplicate key + same digest replays; different digest is rejected;
--     stale revision is a distinguishable conflict; lost ACK replays the original receipt.
-- ===========================================================================
DO $$
DECLARE
  u constant text := '10000000-0000-4000-8000-000000000001';
  r jsonb;
  v_rows bigint := pg_temp.row_total(u::uuid);
  v_extra jsonb := jsonb_build_object('completedChallenges',
                     jsonb_build_object('cms:replay-extra', jsonb_build_object('completedOn', '2026-11-06')));
BEGIN
  -- Double-tap / retry with the original expectedRevision.
  r := pg_temp.call_as(u, pg_temp.payload('t1-first', 0, 'newAccountTransfer', v_extra, repeat('1', 64)));
  PERFORM pg_temp.check(r ->> 'status' = 'alreadyCommittedDuplicate', 'T2a same key + same digest -> alreadyCommittedDuplicate');
  PERFORM pg_temp.check((r -> 'receipt' ->> 'durableRevision')::int = 1
                    AND r -> 'receipt' ->> 'status' = 'alreadyCommittedDuplicate'
                    AND r -> 'receipt' ->> 'committedGuestFingerprint' = repeat('1', 64),
    'T2b replay returns the ORIGINAL durable revision and fingerprint');
  PERFORM pg_temp.check((r -> 'receipt' -> 'unresolvedPersistedOnServer') = 'false'::jsonb
                    AND (r -> 'guestRetentionRequired') = 'true'::jsonb,
    'T2b2 replay still blocks guest clearance for the quarantined claims');
  PERFORM pg_temp.check(pg_temp.row_total(u::uuid) = v_rows
                    AND (SELECT revision FROM public.account_participation_profiles WHERE account_id = u::uuid) = 1,
    'T2c replay performs no write and no revision bump (replayed payload content ignored)');

  -- Coordinator-style retry after re-fetch: newer expectedRevision + existingAccountMerge.
  r := pg_temp.call_as(u, pg_temp.payload('t1-first', 1, 'existingAccountMerge', v_extra, repeat('1', 64)));
  PERFORM pg_temp.check(r ->> 'status' = 'alreadyCommittedDuplicate' AND (r -> 'receipt' ->> 'durableRevision')::int = 1,
    'T2d replay is decided before the revision check (re-fetched retry still replays)');

  -- Same key, different digest.
  r := pg_temp.call_as(u, pg_temp.payload('t1-first', 1, 'existingAccountMerge', v_extra, repeat('2', 64)));
  PERFORM pg_temp.check(r ->> 'status' = 'conflict' AND r ->> 'reason' = 'idempotencyPayloadMismatch',
    'T2e same key + different digest -> conflict/idempotencyPayloadMismatch');
  PERFORM pg_temp.check(pg_temp.row_total(u::uuid) = v_rows, 'T2f digest mismatch wrote nothing');

  -- Stale expected revision.
  r := pg_temp.call_as(u, pg_temp.payload('t2-stale', 0, 'existingAccountMerge', v_extra));
  PERFORM pg_temp.check(r ->> 'status' = 'conflict' AND r ->> 'reason' = 'revisionMismatch'
                    AND (r ->> 'currentRevision')::int = 1
                    AND (r -> 'currentEnvelope' ->> 'revision')::int = 1,
    'T2g stale expectedRevision -> conflict/revisionMismatch with current revision + envelope');
  r := pg_temp.call_as(u, pg_temp.payload('t2-ahead', 7, 'existingAccountMerge', v_extra));
  PERFORM pg_temp.check(r ->> 'status' = 'conflict' AND r ->> 'reason' = 'revisionMismatch',
    'T2h future expectedRevision -> conflict/revisionMismatch');
  PERFORM pg_temp.check(pg_temp.row_total(u::uuid) = v_rows
                    AND NOT EXISTS (SELECT 1 FROM public.account_reconciliation_receipts
                                     WHERE account_id = u::uuid AND idempotency_key IN ('t2-stale', 't2-ahead')),
    'T2i conflicts write nothing and record no receipt (key remains usable)');

  -- Lost ACK: commit succeeds, client never sees it, retries after re-fetch.
  r := pg_temp.call_as(u, pg_temp.payload('t2-lost-ack', 1, 'existingAccountMerge', v_extra, repeat('3', 64)));
  PERFORM pg_temp.check(r ->> 'status' = 'committed' AND (r -> 'receipt' ->> 'durableRevision')::int = 2,
    'T2j second commit advances to revision 2 (ACK "lost")');
  v_rows := pg_temp.row_total(u::uuid);
  r := pg_temp.call_as(u, pg_temp.payload('t2-lost-ack', 2, 'existingAccountMerge', v_extra, repeat('3', 64)));
  PERFORM pg_temp.check(r ->> 'status' = 'alreadyCommittedDuplicate' AND (r -> 'receipt' ->> 'durableRevision')::int = 2
                    AND r -> 'receipt' ->> 'idempotencyKey' = 't2-lost-ack',
    'T2k lost-ACK retry returns the original committed receipt');
  PERFORM pg_temp.check(pg_temp.row_total(u::uuid) = v_rows
                    AND (SELECT revision FROM public.account_participation_profiles WHERE account_id = u::uuid) = 2
                    AND (SELECT count(*) FROM public.account_completed_challenges
                          WHERE account_id = u::uuid AND challenge_id = 'cms:replay-extra') = 1,
    'T2l lost-ACK retry: no duplicate rows and no revision bump');

  -- newAccountTransfer against a non-empty account (even at the matching revision).
  PERFORM pg_temp.expect_rejected(u, pg_temp.payload('t2-new-on-full', 2, 'newAccountTransfer', '{}'::jsonb),
    'invalidPayload', 'nonEmptyAccountForNewTransfer', 'T2m newAccountTransfer into non-empty account rejected');

  -- Absent records are never deleted by a later commit.
  r := pg_temp.call_as(u, pg_temp.payload('t2-empty', 2, 'existingAccountMerge', '{}'::jsonb));
  PERFORM pg_temp.check(r ->> 'status' = 'committed' AND (r -> 'receipt' ->> 'durableRevision')::int = 3
                    AND pg_temp.row_total(u::uuid) = v_rows + 1,
    'T2n empty merge deletes nothing; only its receipt is added and revision increments once');
END $$;

-- ===========================================================================
-- T3. Existing-account merge: union, monotonic independent flags, credible dates,
--     unresolved reading positions, and durable unresolved evidence.
-- ===========================================================================
DO $$
DECLARE
  u constant text := '20000000-0000-4000-8000-000000000002';
  r jsonb;
BEGIN
  r := pg_temp.call_as(u, pg_temp.payload('t3-seed', 0, 'newAccountTransfer', jsonb_build_object(
    'completedChallenges', jsonb_build_object('cms:m1', jsonb_build_object('completedOn', '2026-11-05')),
    'inProgressChallenges', jsonb_build_object(
      'cms:r1', jsonb_build_object('screenId', 'a', 'updatedOn', '2026-11-01'),
      'cms:r2', jsonb_build_object('screenId', 'x', 'updatedOn', '2026-11-01'),
      'cms:r4', jsonb_build_object('screenId', 'q', 'updatedOn', '2026-11-01')),
    'savedScriptures', jsonb_build_array(
      jsonb_build_object('key', 'john 3:16|kjv', 'reference', 'John 3:16', 'translation', 'KJV', 'savedOn', '2026-11-08')))));
  PERFORM pg_temp.check(r ->> 'status' = 'committed', 'T3a seed account');

  -- Already-verified earned awards (simulating a future trusted admission path).
  PERFORM pg_temp.seed_verified_award(u, 'card:monthly:2026-11:grace', DATE '2026-11-06', false, true);
  PERFORM pg_temp.seed_verified_award(u, 'card:monthly:2026-11:peace', DATE '2026-11-07', false, false);
  PERFORM pg_temp.seed_verified_award(u, 'card:monthly:2026-11:joy', DATE '2026-11-07', true, false);

  -- Simulate a FUTURE trusted attestation (not something this transaction can do).
  UPDATE public.account_completed_challenges SET date_provenance = 'serverVerified'
   WHERE account_id = u::uuid AND challenge_id = 'cms:m1';

  r := pg_temp.call_as(u, pg_temp.payload('t3-merge', 1, 'existingAccountMerge', jsonb_build_object(
    'completedChallenges', jsonb_build_object(
      'cms:m1', jsonb_build_object('completedOn', '2026-11-01', 'dateProvenance', 'clientReported'),
      'cms:m2', jsonb_build_object('completedOn', '2026-11-09')),
    'inProgressChallenges', jsonb_build_object(
      'cms:r1', jsonb_build_object('screenId', 'a', 'updatedOn', '2026-11-04'),
      'cms:r2', jsonb_build_object('screenId', 'y', 'updatedOn', '2026-11-09')),
    'savedScriptures', jsonb_build_array(
      jsonb_build_object('key', 'john 3:16|kjv', 'reference', 'John 3:16', 'translation', 'KJV',
                         'savedOn', '2026-11-02', 'sourceChallengeId', 'cms:m2'),
      jsonb_build_object('key', 'romans 12:2|', 'reference', 'Romans 12:2', 'translation', null, 'savedOn', '2026-11-03')),
    'earnedAwards', jsonb_build_object(
      'card:monthly:2026-11:grace', jsonb_build_object('earnedOn', '2026-11-06', 'hubAnnouncementAcked', true, 'cardViewed', false),
      'card:monthly:2026-11:peace', jsonb_build_object('earnedOn', '2026-11-02', 'hubAnnouncementAcked', false, 'cardViewed', true)))
  ) || jsonb_build_object('unresolvedItems', jsonb_build_array(jsonb_build_object(
      'kind', 'undecidableReadingPosition', 'challengeId', 'cms:r4', 'reason', 'missingAuthoritativeScreenOrder',
      'accountPosition', jsonb_build_object('screenId', 'q', 'updatedOn', '2026-11-01'),
      'guestPosition', jsonb_build_object('screenId', 'z', 'updatedOn', '2026-11-02'),
      'retainedPosition', jsonb_build_object('screenId', 'q', 'updatedOn', '2026-11-01'),
      'note', 'arbitrary client field must not be persisted'))));

  PERFORM pg_temp.check(r ->> 'status' = 'committed' AND r ->> 'outcomeStatus' = 'reconciledWithUnresolved',
    'T3b merge commits as reconciledWithUnresolved');
  PERFORM pg_temp.check((r -> 'receipt' ->> 'unresolvedCount')::int = 4
                    AND (r -> 'receipt' -> 'unresolvedPersistedOnServer') = 'true'::jsonb
                    AND (r ->> 'serverDetectedUnresolvedCount')::int = 3,
    'T3c receipt counts 3 server-detected + 1 client-reported unresolved items, all persisted');
  PERFORM pg_temp.check(
    (SELECT count(*) FROM public.account_reconciliation_unresolved_items
      WHERE account_id = u::uuid AND idempotency_key = 't3-merge') = 4,
    'T3d unresolvedPersistedOnServer is truthful: 4 durable evidence rows');
  PERFORM pg_temp.check(
    (SELECT unresolved_count FROM public.account_reconciliation_receipts
      WHERE account_id = u::uuid AND idempotency_key = 't3-merge') = 4,
    'T3e receipt row unresolved_count matches evidence');

  -- Completions: union; serverVerified date never lowered by a client claim.
  PERFORM pg_temp.check(
    (SELECT completed_on = DATE '2026-11-05' AND date_provenance = 'serverVerified'
       FROM public.account_completed_challenges WHERE account_id = u::uuid AND challenge_id = 'cms:m1'),
    'T3f earlier client clock cannot backdate a serverVerified completion');
  PERFORM pg_temp.check(EXISTS (SELECT 1 FROM public.account_reconciliation_unresolved_items
     WHERE account_id = u::uuid AND kind = 'completionDateProvenanceConflict' AND subject_id = 'cms:m1'
       AND origin = 'serverDetected' AND detail ->> 'clientClaimedDate' = '2026-11-01'
       AND detail ->> 'retainedDate' = '2026-11-05'),
    'T3g completion provenance conflict persisted with both dates');
  PERFORM pg_temp.check((SELECT count(*) FROM public.account_completed_challenges WHERE account_id = u::uuid) = 2,
    'T3h distinct completions union (m1 + m2)');

  -- Awards: OR flags independently; earliest credible date (not the convenient client one).
  PERFORM pg_temp.check(
    (SELECT hub_announcement_acked AND card_viewed FROM public.account_earned_awards
      WHERE account_id = u::uuid AND award_id = 'card:monthly:2026-11:grace'),
    'T3i R13-0 timeline 3/4: hubAnnouncementAcked OR cardViewed merged to both true');
  PERFORM pg_temp.check(
    (SELECT card_viewed AND NOT hub_announcement_acked FROM public.account_earned_awards
      WHERE account_id = u::uuid AND award_id = 'card:monthly:2026-11:peace'),
    'T3j cardViewed does NOT imply hubAnnouncementAcked');
  PERFORM pg_temp.check(
    (SELECT earned_on = DATE '2026-11-07' FROM public.account_earned_awards
      WHERE account_id = u::uuid AND award_id = 'card:monthly:2026-11:peace'),
    'T3k disagreeing unverified award dates keep the account date (no convenient earlier client clock)');
  PERFORM pg_temp.check(EXISTS (SELECT 1 FROM public.account_reconciliation_unresolved_items
     WHERE account_id = u::uuid AND kind = 'undecidableAwardDateProvenance'
       AND subject_id = 'card:monthly:2026-11:peace'
       AND detail -> 'candidateDates' = '["2026-11-02", "2026-11-07"]'::jsonb),
    'T3l undecidable award date persisted with candidate dates');

  -- Reading positions.
  PERFORM pg_temp.check(
    (SELECT screen_id = 'a' AND updated_on = DATE '2026-11-04' AND NOT unresolved_conflict
       FROM public.account_in_progress_challenges WHERE account_id = u::uuid AND challenge_id = 'cms:r1'),
    'T3m same screen: updatedOn advances to the later date');
  PERFORM pg_temp.check(
    (SELECT screen_id = 'x' AND updated_on = DATE '2026-11-01' AND unresolved_conflict
       FROM public.account_in_progress_challenges WHERE account_id = u::uuid AND challenge_id = 'cms:r2'),
    'T3n distinct screens without trusted order: account position retained, marked unresolved (no lexical/timestamp tiebreak)');
  PERFORM pg_temp.check(EXISTS (SELECT 1 FROM public.account_reconciliation_unresolved_items
     WHERE account_id = u::uuid AND kind = 'undecidableReadingPosition' AND subject_id = 'cms:r2'
       AND origin = 'serverDetected'
       AND detail -> 'guestPosition' = '{"screenId": "y", "updatedOn": "2026-11-09"}'::jsonb
       AND detail -> 'retainedPosition' = '{"screenId": "x", "updatedOn": "2026-11-01"}'::jsonb),
    'T3o guest reading position durably persisted for future safe reconciliation');
  PERFORM pg_temp.check(
    (SELECT unresolved_conflict FROM public.account_in_progress_challenges
      WHERE account_id = u::uuid AND challenge_id = 'cms:r4'),
    'T3p client-reported undecidable position marks the account row unresolved');
  PERFORM pg_temp.check(EXISTS (SELECT 1 FROM public.account_reconciliation_unresolved_items
     WHERE account_id = u::uuid AND subject_id = 'cms:r4' AND origin = 'clientReported'
       AND NOT (detail ? 'note')),
    'T3q client unresolved item rebuilt from allowlist (arbitrary fields dropped)');

  -- Saved Scripture union / earliest date / source preservation.
  PERFORM pg_temp.check(
    (SELECT saved_on = DATE '2026-11-02' AND source_challenge_id = 'cms:m2'
       FROM public.account_saved_scriptures WHERE account_id = u::uuid AND scripture_key = 'john 3:16|kjv'),
    'T3r duplicate Saved Scripture keeps earliest savedOn and gains source');
  PERFORM pg_temp.check((SELECT count(*) FROM public.account_saved_scriptures WHERE account_id = u::uuid) = 2,
    'T3s distinct Saved Scripture union');

  -- Later merge: completion removes resume row; flags can never regress.
  r := pg_temp.call_as(u, pg_temp.payload('t3-complete-r1', 2, 'existingAccountMerge', jsonb_build_object(
    'completedChallenges', jsonb_build_object('cms:r1', jsonb_build_object('completedOn', '2026-11-10')),
    'inProgressChallenges', jsonb_build_object('cms:r1', jsonb_build_object('screenId', 'b', 'updatedOn', '2026-11-10')),
    'earnedAwards', jsonb_build_object(
      'card:monthly:2026-11:grace', jsonb_build_object('earnedOn', '2026-11-06', 'hubAnnouncementAcked', false, 'cardViewed', false),
      'card:monthly:2026-11:joy', jsonb_build_object('earnedOn', '2026-11-07', 'hubAnnouncementAcked', false, 'cardViewed', true,
         'earnedCard', pg_temp.card('2026-11', 'joy'))))));
  PERFORM pg_temp.check(r ->> 'status' = 'committed', 'T3t follow-up merge commits');
  PERFORM pg_temp.check(NOT EXISTS (SELECT 1 FROM public.account_in_progress_challenges
                                     WHERE account_id = u::uuid AND challenge_id = 'cms:r1'),
    'T3u completion removes the in-progress row even when the same payload carries a resume position');
  PERFORM pg_temp.check(
    (SELECT hub_announcement_acked AND card_viewed FROM public.account_earned_awards
      WHERE account_id = u::uuid AND award_id = 'card:monthly:2026-11:grace'),
    'T3v false flags never regress true flags');
  PERFORM pg_temp.check(
    (SELECT hub_announcement_acked AND card_viewed AND card_document_id = 'card-joy'
            AND earned_card_snapshot ->> 'cardDocumentId' = 'card-joy'
       FROM public.account_earned_awards WHERE account_id = u::uuid AND award_id = 'card:monthly:2026-11:joy'),
    'T3x incoming false hub flag cannot regress true while cardViewed / snapshot backfill updates the row');
  PERFORM pg_temp.check((SELECT count(*) FROM public.account_earned_awards WHERE account_id = u::uuid) = 3,
    'T3w awards are unique (no duplicate rows)');
END $$;

-- ===========================================================================
-- T4. Shelf: 0-3 months, independent protection, account-first precedence,
--     displaced guest months keep their accomplishments.
-- ===========================================================================
DO $$
DECLARE
  u constant text := '40000000-0000-4000-8000-000000000004';
  ub constant text := '4b000000-0000-4000-8000-00000000004b';
  uc constant text := '4c000000-0000-4000-8000-00000000004c';
  r jsonb;
BEGIN
  r := pg_temp.call_as(u, pg_temp.payload('t4-seed', 0, 'newAccountTransfer', jsonb_build_object(
    'shelf', jsonb_build_object(
      'months', jsonb_build_array(
        jsonb_build_object('yearMonth', '2026-07', 'admissionKind', 'readerSelected', 'isProtected', false, 'admittedOn', '2026-08-01'),
        jsonb_build_object('yearMonth', '2026-08', 'admissionKind', 'autoAdmitted', 'isProtected', true),
        jsonb_build_object('yearMonth', '2026-09', 'admissionKind', 'readerSelected')),
      'activeFocusMonth', '2026-09',
      'updatedOn', '2026-11-01'))));
  PERFORM pg_temp.check(r ->> 'status' = 'committed', 'T4a 3-month Shelf transfer commits');
  PERFORM pg_temp.check(
    (SELECT array_agg(year_month || ':' || admission_kind || ':' || is_protected || ':' || slot_order ORDER BY slot_order)
       FROM public.account_shelf_months WHERE account_id = u::uuid)
      = ARRAY['2026-07:readerSelected:false:1', '2026-08:autoAdmitted:true:2', '2026-09:readerSelected:true:3'],
    'T4b admission_kind, is_protected (explicit and defaulted) and slot_order round-trip independently');
  PERFORM pg_temp.check(
    (SELECT active_focus_month = '2026-09' AND shelf_updated_on = DATE '2026-11-01' AND shelf_state_recorded
       FROM public.account_participation_profiles WHERE account_id = u::uuid),
    'T4c active focus + Shelf metadata persisted');
  PERFORM pg_temp.check(
    pg_temp.get_as(u) -> 'envelope' -> 'data' -> 'shelf' -> 'months' -> 0
      = '{"yearMonth": "2026-07", "admissionKind": "readerSelected", "isProtected": false, "admittedOn": "2026-08-01", "slotOrder": 1}'::jsonb,
    'T4d read envelope round-trips Shelf entry fields');

  -- Guest Shelf conflicts with account Shelf; guest accomplishments for displaced month kept.
  r := pg_temp.call_as(u, pg_temp.payload('t4-merge', 1, 'existingAccountMerge', jsonb_build_object(
    'completedChallenges', jsonb_build_object('cms:jun-1', jsonb_build_object('completedOn', '2026-06-20')),
    'earnedAwards', jsonb_build_object('card:monthly:2026-06:faith', jsonb_build_object('earnedOn', '2026-06-21')),
    'shelf', jsonb_build_object('months', jsonb_build_array(
      jsonb_build_object('yearMonth', '2026-06', 'admissionKind', 'autoAdmitted'),
      jsonb_build_object('yearMonth', '2026-07', 'admissionKind', 'autoAdmitted', 'isProtected', true)),
      'activeFocusMonth', '2026-06'))));
  PERFORM pg_temp.check(r ->> 'status' = 'committed', 'T4e merge with conflicting guest Shelf commits');
  PERFORM pg_temp.check(r -> 'shelfConflicts' = '[{"yearMonth": "2026-06", "guestAdmissionKind": "autoAdmitted", "disposition": "preservedInLibraryNotOnShelf"}]'::jsonb,
    'T4f displaced guest month reported as preservedInLibraryNotOnShelf');
  PERFORM pg_temp.check(
    (SELECT array_agg(year_month || ':' || admission_kind || ':' || is_protected ORDER BY slot_order)
       FROM public.account_shelf_months WHERE account_id = u::uuid)
      = ARRAY['2026-07:readerSelected:false', '2026-08:autoAdmitted:true', '2026-09:readerSelected:true'],
    'T4g account Shelf wins entirely (no admission/protection overwrite)');
  PERFORM pg_temp.check(
    (SELECT active_focus_month FROM public.account_participation_profiles WHERE account_id = u::uuid) = '2026-09',
    'T4h account active focus wins');
  PERFORM pg_temp.check(
    EXISTS (SELECT 1 FROM public.account_completed_challenges WHERE account_id = u::uuid AND challenge_id = 'cms:jun-1')
    AND EXISTS (SELECT 1 FROM public.account_provisional_award_claims WHERE account_id = u::uuid AND award_id = 'card:monthly:2026-06:faith')
    AND (r -> 'guestRetentionRequired') = 'true'::jsonb,
    'T4i R13-0 timeline 9: displaced month''s completion kept; its unverified Card quarantined and guest copy retained');

  -- Capacity / historical / shape rules (fail closed, nothing written).
  PERFORM pg_temp.expect_rejected(uc, pg_temp.payload('t4-four', 0, 'newAccountTransfer', jsonb_build_object(
    'shelf', jsonb_build_object('months', jsonb_build_array(
      jsonb_build_object('yearMonth', '2026-05', 'admissionKind', 'readerSelected'),
      jsonb_build_object('yearMonth', '2026-06', 'admissionKind', 'readerSelected'),
      jsonb_build_object('yearMonth', '2026-07', 'admissionKind', 'readerSelected'),
      jsonb_build_object('yearMonth', '2026-08', 'admissionKind', 'readerSelected'))))),
    'invalidPayload', 'shelfCapacityExceeded', 'T4j 4th Shelf month rejected');
  PERFORM pg_temp.expect_rejected(uc, pg_temp.payload('t4-current', 0, 'newAccountTransfer', jsonb_build_object(
    'shelf', jsonb_build_object('months', jsonb_build_array(
      jsonb_build_object('yearMonth', to_char(pg_temp.ceiling(), 'YYYY-MM'), 'admissionKind', 'readerSelected'))))),
    'invalidPayload', 'shelfMonthNotHistorical', 'T4k current/future (server UTC+14) month cannot be on the Shelf');
  PERFORM pg_temp.expect_rejected(uc, pg_temp.payload('t4-dup', 0, 'newAccountTransfer', jsonb_build_object(
    'shelf', jsonb_build_object('months', jsonb_build_array(
      jsonb_build_object('yearMonth', '2026-05', 'admissionKind', 'readerSelected'),
      jsonb_build_object('yearMonth', '2026-05', 'admissionKind', 'autoAdmitted'))))),
    'invalidPayload', 'duplicateShelfMonth', 'T4l duplicate Shelf months rejected');
  PERFORM pg_temp.expect_rejected(uc, pg_temp.payload('t4-kind', 0, 'newAccountTransfer', jsonb_build_object(
    'shelf', jsonb_build_object('months', jsonb_build_array(
      jsonb_build_object('yearMonth', '2026-05', 'admissionKind', 'pinned'))))),
    'invalidPayload', 'invalidShelfEntry', 'T4m unknown admissionKind rejected');
  PERFORM pg_temp.expect_rejected(uc, pg_temp.payload('t4-prot', 0, 'newAccountTransfer', jsonb_build_object(
    'shelf', jsonb_build_object('months', jsonb_build_array(
      jsonb_build_object('yearMonth', '2026-05', 'admissionKind', 'autoAdmitted', 'isProtected', 'yes'))))),
    'invalidPayload', 'invalidShelfEntry', 'T4n non-boolean isProtected rejected');

  -- Explicit EMPTY account Shelf is authoritative state (R13-1 isAccountEmpty semantics).
  r := pg_temp.call_as(ub, pg_temp.payload('t4b-seed', 0, 'newAccountTransfer',
         jsonb_build_object('shelf', jsonb_build_object('months', '[]'::jsonb))));
  PERFORM pg_temp.check(r ->> 'status' = 'committed'
                    AND r -> 'committedEnvelope' -> 'data' -> 'shelf' -> 'months' = '[]'::jsonb,
    'T4o explicit empty Shelf recorded and returned');
  r := pg_temp.call_as(ub, pg_temp.payload('t4b-merge', 1, 'existingAccountMerge', jsonb_build_object(
         'shelf', jsonb_build_object('months', jsonb_build_array(
           jsonb_build_object('yearMonth', '2026-05', 'admissionKind', 'readerSelected'))))));
  PERFORM pg_temp.check(r ->> 'status' = 'committed' AND jsonb_array_length(r -> 'shelfConflicts') = 1
                    AND NOT EXISTS (SELECT 1 FROM public.account_shelf_months WHERE account_id = ub::uuid),
    'T4p explicit empty account Shelf takes precedence over guest Shelf');

  -- Account WITHOUT Shelf state accepts the guest Shelf on merge.
  r := pg_temp.call_as(uc, pg_temp.payload('t4c-seed', 0, 'newAccountTransfer', jsonb_build_object(
         'savedChallenges', jsonb_build_object('cms:c-x', jsonb_build_object('savedOn', '2026-11-01')))));
  PERFORM pg_temp.check(r ->> 'status' = 'committed' AND NOT (r -> 'committedEnvelope' -> 'data' ? 'shelf'),
    'T4q account without Shelf state returns no shelf key');
  r := pg_temp.call_as(uc, pg_temp.payload('t4c-merge', 1, 'existingAccountMerge', jsonb_build_object(
         'shelf', jsonb_build_object('months', jsonb_build_array(
           jsonb_build_object('yearMonth', '2026-05', 'admissionKind', 'autoAdmitted'))))));
  PERFORM pg_temp.check(r ->> 'status' = 'committed' AND jsonb_array_length(r -> 'shelfConflicts') = 0
                    AND (SELECT NOT is_protected FROM public.account_shelf_months
                          WHERE account_id = uc::uuid AND year_month = '2026-05'),
    'T4r guest Shelf accepted when account has none (autoAdmitted defaults unprotected)');
END $$;

-- ===========================================================================
-- T5. Authoritative validation: malformed, draft, pilot, fixture, lab and untrusted
--     claims fail closed with typed rejection and zero writes.
-- ===========================================================================
DO $$
DECLARE
  u constant text := '50000000-0000-4000-8000-000000000005';
  c record;
BEGIN
  FOR c IN SELECT * FROM (VALUES
    ('pilot namespace id', jsonb_build_object('completedChallenges', jsonb_build_object('pilot:sample-1', jsonb_build_object('completedOn', '2026-11-01'))), 'invalidChallengeId'),
    ('drafts id', jsonb_build_object('completedChallenges', jsonb_build_object('cms:drafts.challenge-x', jsonb_build_object('completedOn', '2026-11-01'))), 'invalidChallengeId'),
    ('fixture id', jsonb_build_object('savedChallenges', jsonb_build_object('cms:fixture-challenge-document', jsonb_build_object('savedOn', '2026-11-01'))), 'invalidChallengeId'),
    ('lab token id', jsonb_build_object('inProgressChallenges', jsonb_build_object('cms:interactive-challenge-lab', jsonb_build_object('updatedOn', '2026-11-01'))), 'invalidChallengeId'),
    ('nov-1 lab id', jsonb_build_object('completedChallenges', jsonb_build_object('cms:NOV-1', jsonb_build_object('completedOn', '2026-11-01'))), 'invalidChallengeId'),
    ('weekly pilot id', jsonb_build_object('completedChallenges', jsonb_build_object('cms:weekly-pilot-3', jsonb_build_object('completedOn', '2026-11-01'))), 'invalidChallengeId'),
    ('padded id', jsonb_build_object('completedChallenges', jsonb_build_object('cms: c1', jsonb_build_object('completedOn', '2026-11-01'))), 'invalidChallengeId'),
    ('dotted id', jsonb_build_object('completedChallenges', jsonb_build_object('cms:a.b', jsonb_build_object('completedOn', '2026-11-01'))), 'invalidChallengeId'),
    ('pilot source id', jsonb_build_object('savedScriptures', jsonb_build_array(jsonb_build_object('key', 'romans 8:1|', 'reference', 'Romans 8:1', 'translation', null, 'savedOn', '2026-11-01', 'sourceChallengeId', 'pilot:x'))), 'invalidChallengeId'),
    ('pilot last opened', jsonb_build_object('lastOpenedChallenge', jsonb_build_object('challengeId', 'pilot:x', 'openedOn', '2026-11-01')), 'invalidChallengeId'),
    ('lab award slug', jsonb_build_object('earnedAwards', jsonb_build_object('card:monthly:2026-10:lab-test', jsonb_build_object('earnedOn', '2026-10-02'))), 'invalidAwardIdentity'),
    ('fixture award slug', jsonb_build_object('earnedAwards', jsonb_build_object('card:monthly:2026-10:fixture-a', jsonb_build_object('earnedOn', '2026-10-02'))), 'invalidAwardIdentity'),
    ('bad award month', jsonb_build_object('earnedAwards', jsonb_build_object('card:monthly:2026-13:hope', jsonb_build_object('earnedOn', '2026-10-02'))), 'invalidAwardIdentity'),
    ('award kind mismatch', jsonb_build_object('earnedAwards', jsonb_build_object('card:monthly:2026-10:hope', jsonb_build_object('earnedOn', '2026-10-02', 'kind', 'fullMonth'))), 'invalidAwardIdentity'),
    ('award discovery mismatch', jsonb_build_object('earnedAwards', jsonb_build_object('card:monthly:2026-10:hope', jsonb_build_object('earnedOn', '2026-10-02', 'discoveryId', 'discovery:2026-10:joy'))), 'invalidAwardIdentity'),
    ('award id body mismatch', jsonb_build_object('earnedAwards', jsonb_build_object('card:monthly:2026-10:hope', jsonb_build_object('earnedOn', '2026-10-02', 'awardId', 'card:monthly:2026-10:joy'))), 'invalidAwardIdentity'),
    ('string flag', jsonb_build_object('earnedAwards', jsonb_build_object('card:monthly:2026-10:hope', jsonb_build_object('earnedOn', '2026-10-02', 'cardViewed', 'true'))), 'invalidPresentationFlag'),
    ('drafts card doc', jsonb_build_object('earnedAwards', jsonb_build_object('card:monthly:2026-10:hope', jsonb_build_object('earnedOn', '2026-10-02', 'cardDocumentId', 'drafts.card-hope'))), 'invalidCardDocumentId'),
    ('http card image', jsonb_build_object('earnedAwards', jsonb_build_object('card:monthly:2026-10:hope', jsonb_build_object('earnedOn', '2026-10-02', 'earnedCard', pg_temp.card('2026-10', 'hope') || jsonb_build_object('imageUrl', 'http://cdn.sanity.io/images/p/d/a.png')))), 'invalidCardSnapshot'),
    ('foreign card host', jsonb_build_object('earnedAwards', jsonb_build_object('card:monthly:2026-10:hope', jsonb_build_object('earnedOn', '2026-10-02', 'earnedCard', pg_temp.card('2026-10', 'hope') || jsonb_build_object('imageUrl', 'https://evil.example/images/p/d/a.png')))), 'invalidCardSnapshot'),
    ('card url query', jsonb_build_object('earnedAwards', jsonb_build_object('card:monthly:2026-10:hope', jsonb_build_object('earnedOn', '2026-10-02', 'earnedCard', pg_temp.card('2026-10', 'hope') || jsonb_build_object('imageUrl', 'https://cdn.sanity.io/images/p/d/a.png?w=1')))), 'invalidCardSnapshot'),
    ('card month mismatch', jsonb_build_object('earnedAwards', jsonb_build_object('card:monthly:2026-10:hope', jsonb_build_object('earnedOn', '2026-10-02', 'earnedCard', pg_temp.card('2026-09', 'hope')))), 'invalidCardSnapshot'),
    ('card doc mismatch', jsonb_build_object('earnedAwards', jsonb_build_object('card:monthly:2026-10:hope', jsonb_build_object('earnedOn', '2026-10-02', 'cardDocumentId', 'card-joy', 'earnedCard', pg_temp.card('2026-10', 'hope')))), 'invalidCardSnapshot'),
    ('non-canonical scripture key', jsonb_build_object('savedScriptures', jsonb_build_array(jsonb_build_object('key', 'Romans 8:1|', 'reference', 'Romans 8:1', 'translation', null, 'savedOn', '2026-11-01'))), 'nonCanonicalScriptureKey'),
    ('forged scripture key', jsonb_build_object('savedScriptures', jsonb_build_array(jsonb_build_object('key', 'john 3:16|', 'reference', 'Romans 8:1', 'translation', null, 'savedOn', '2026-11-01'))), 'nonCanonicalScriptureKey'),
    ('not-normalized reference', jsonb_build_object('savedScriptures', jsonb_build_array(jsonb_build_object('key', 'romans 8:1|', 'reference', ' Romans  8:1', 'translation', null, 'savedOn', '2026-11-01'))), 'nonCanonicalScriptureRecord'),
    ('not configured translation', jsonb_build_object('savedScriptures', jsonb_build_array(jsonb_build_object('key', 'romans 8:1|', 'reference', 'Romans 8:1', 'translation', 'Not configured', 'savedOn', '2026-11-01'))), 'nonCanonicalScriptureRecord'),
    ('duplicate scripture key', jsonb_build_object('savedScriptures', jsonb_build_array(
        jsonb_build_object('key', 'romans 8:1|', 'reference', 'Romans 8:1', 'translation', null, 'savedOn', '2026-11-01'),
        jsonb_build_object('key', 'romans 8:1|', 'reference', 'Romans 8:1', 'translation', null, 'savedOn', '2026-11-02'))), 'duplicateScriptureKey'),
    ('scripture as string', jsonb_build_object('savedScriptures', jsonb_build_array('Romans 8:1')), 'invalidScriptureRecord'),
    ('padded screen id', jsonb_build_object('inProgressChallenges', jsonb_build_object('cms:p9', jsonb_build_object('screenId', ' s1', 'updatedOn', '2026-11-01'))), 'invalidScreenId'),
    ('impossible date', jsonb_build_object('completedChallenges', jsonb_build_object('cms:c9', jsonb_build_object('completedOn', '2026-02-30'))), 'invalidCalendarDate'),
    ('timestamp date', jsonb_build_object('completedChallenges', jsonb_build_object('cms:c9', jsonb_build_object('completedOn', '2026-11-01T00:00:00Z'))), 'invalidCalendarDate'),
    ('numeric date', jsonb_build_object('completedChallenges', jsonb_build_object('cms:c9', jsonb_build_object('completedOn', 20261101))), 'invalidCalendarDate'),
    ('bad provenance', jsonb_build_object('completedChallenges', jsonb_build_object('cms:c9', jsonb_build_object('completedOn', '2026-11-01', 'dateProvenance', 'trustMe'))), 'invalidDateProvenance'),
    ('record not object', jsonb_build_object('completedChallenges', jsonb_build_object('cms:c9', true)), 'invalidRecordShape'),
    ('map not object', jsonb_build_object('completedChallenges', jsonb_build_array('cms:c9')), 'invalidRecordShape'),
    ('unknown data field', jsonb_build_object('streakCount', 12), 'unknownEnvelopeDataField'),
    ('future focus month', jsonb_build_object('shelf', jsonb_build_object('months', '[]'::jsonb, 'activeFocusMonth', '2999-01')), 'invalidActiveFocusMonth')
  ) AS t(label, data, detail) LOOP
    PERFORM pg_temp.expect_rejected(u, pg_temp.payload('t5-' || md5(c.label), 0, 'newAccountTransfer', c.data),
      'invalidPayload', c.detail, 'T5 rejects ' || c.label);
  END LOOP;

  -- Header / envelope-level rejections.
  PERFORM pg_temp.expect_rejected(u, jsonb_set(pg_temp.payload('t5-sv', 0, 'newAccountTransfer', '{}'::jsonb), '{envelope,schemaVersion}', '2'),
    'schemaVersionMismatch', 'unsupportedAccountSchemaVersion', 'T5 rejects unsupported account schemaVersion 2');
  PERFORM pg_temp.expect_rejected(u, jsonb_set(pg_temp.payload('t5-ns', 0, 'newAccountTransfer', '{}'::jsonb), '{envelope,namespace}', '"pilot"'),
    'unsupportedNamespace', 'crossNamespaceConflict', 'T5 rejects pilot envelope namespace');
  PERFORM pg_temp.expect_rejected(u, pg_temp.payload('t5-norev', 0, 'newAccountTransfer', '{}'::jsonb) - 'expectedRevision',
    'invalidPayload', 'missingExpectedRevision', 'T5 requires an explicit expectedRevision');
  PERFORM pg_temp.expect_rejected(u, pg_temp.payload('t5-nullrev', 0, 'newAccountTransfer', '{}'::jsonb) || '{"expectedRevision": null}',
    'invalidPayload', 'missingExpectedRevision', 'T5 rejects null expectedRevision');
  PERFORM pg_temp.expect_rejected(u, pg_temp.payload('t5-negrev', 0, 'newAccountTransfer', '{}'::jsonb) || '{"expectedRevision": -1}',
    'invalidPayload', 'invalidExpectedRevision', 'T5 rejects negative expectedRevision');
  PERFORM pg_temp.expect_rejected(u, pg_temp.payload('t5-fracrev', 0, 'newAccountTransfer', '{}'::jsonb) || '{"expectedRevision": 0.5}',
    'invalidPayload', 'invalidExpectedRevision', 'T5 rejects fractional expectedRevision');
  PERFORM pg_temp.expect_rejected(u, pg_temp.payload('t5-fp', 0, 'newAccountTransfer', '{}'::jsonb, 'not-a-digest'),
    'invalidPayload', 'invalidGuestPayloadFingerprint', 'T5 rejects non-SHA-256 guest fingerprint');
  PERFORM pg_temp.expect_rejected(u, pg_temp.payload('bad key with spaces', 0, 'newAccountTransfer', '{}'::jsonb),
    'invalidPayload', 'invalidIdempotencyKey', 'T5 rejects malformed idempotency key');
  PERFORM pg_temp.expect_rejected(u, pg_temp.payload('t5-mode', 0, 'overwrite', '{}'::jsonb),
    'invalidPayload', 'invalidMode', 'T5 rejects unknown mode');
  PERFORM pg_temp.expect_rejected(u, pg_temp.payload('t5-extra', 0, 'newAccountTransfer', '{}'::jsonb) || '{"serviceRole": true}',
    'invalidPayload', 'unknownPayloadField', 'T5 rejects client-supplied authorization context fields');
  PERFORM pg_temp.expect_rejected(u, pg_temp.payload('t5-nodata', 0, 'newAccountTransfer', '{}'::jsonb) #- '{envelope,data}',
    'invalidPayload', 'invalidEnvelopeData', 'T5 rejects envelope without data');
  PERFORM pg_temp.expect_rejected(u, '[]'::jsonb,
    'invalidPayload', 'invalidPayloadShape', 'T5 rejects non-object payload');
  PERFORM pg_temp.expect_rejected(u, pg_temp.payload('t5-big', 0, 'newAccountTransfer',
      jsonb_build_object('lastOpenedChallenge', jsonb_build_object('challengeId', 'cms:x', 'openedOn', '2026-11-01', 'pad', repeat('x', 1100000)))),
    'invalidPayload', 'payloadTooLarge', 'T5 rejects oversized payload');

  -- Untrusted client unresolved items.
  PERFORM pg_temp.expect_rejected(u, pg_temp.payload('t5-unres-kind', 0, 'newAccountTransfer', '{}'::jsonb)
      || jsonb_build_object('unresolvedItems', jsonb_build_array(jsonb_build_object('kind', 'grantAward', 'awardId', 'card:monthly:2026-10:hope'))),
    'invalidPayload', 'invalidUnresolvedItem', 'T5 rejects unknown unresolved item kind');
  PERFORM pg_temp.expect_rejected(u, pg_temp.payload('t5-unres-id', 0, 'newAccountTransfer', '{}'::jsonb)
      || jsonb_build_object('unresolvedItems', jsonb_build_array(jsonb_build_object('kind', 'undecidableCompletionDateProvenance',
           'challengeId', 'pilot:x', 'candidateDates', '["2026-11-01"]'::jsonb, 'retainedDate', '2026-11-01',
           'reason', 'disagreeingUnverifiedClientDates'))),
    'invalidPayload', 'invalidUnresolvedItem', 'T5 rejects unresolved item referencing a pilot id');

  PERFORM pg_temp.check(pg_temp.row_total(u::uuid) = 0, 'T5z every rejected payload left the account with zero rows');
END $$;

-- ===========================================================================
-- T6. Server-derived date bounds: UTC+14 ceiling, award month floor, snapshot stripping
-- ===========================================================================
DO $$
DECLARE
  u constant text := '60000000-0000-4000-8000-000000000006';
  r jsonb;
  v_ceiling date := pg_temp.ceiling();
BEGIN
  PERFORM pg_temp.expect_rejected(u, pg_temp.payload('t6-future', 0, 'newAccountTransfer', jsonb_build_object(
      'completedChallenges', jsonb_build_object('cms:c1', jsonb_build_object('completedOn', to_char(v_ceiling + 1, 'YYYY-MM-DD'))))),
    'invalidPayload', 'dateAfterServerUtcPlus14Ceiling', 'T6a completion one day past the server UTC+14 ceiling rejected');
  PERFORM pg_temp.expect_rejected(u, pg_temp.payload('t6-saved-future', 0, 'newAccountTransfer', jsonb_build_object(
      'savedChallenges', jsonb_build_object('cms:c1', jsonb_build_object('savedOn', '2999-01-01')))),
    'invalidPayload', 'dateAfterServerUtcPlus14Ceiling', 'T6b far-future savedOn rejected');
  PERFORM pg_temp.expect_rejected(u, pg_temp.payload('t6-floor', 0, 'newAccountTransfer', jsonb_build_object(
      'earnedAwards', jsonb_build_object('card:monthly:2026-10:hope', jsonb_build_object('earnedOn', '2026-09-30')))),
    'invalidPayload', 'dateBeforeAvailabilityFloor', 'T6c award earned before its publication month rejected');
  PERFORM pg_temp.expect_rejected(u, pg_temp.payload('t6-1999', 0, 'newAccountTransfer', jsonb_build_object(
      'earnedAwards', jsonb_build_object('card:monthly:2026-11:hope', jsonb_build_object('earnedOn', '1999-01-01')))),
    'invalidPayload', 'dateBeforeAvailabilityFloor', 'T6d R13-0 timeline 8: backdated 1999 award date rejected');

  r := pg_temp.call_as(u, pg_temp.payload('t6-ok', 0, 'newAccountTransfer', jsonb_build_object(
    'completedChallenges', jsonb_build_object('cms:edge', jsonb_build_object('completedOn', to_char(v_ceiling, 'YYYY-MM-DD'))),
    'earnedAwards', jsonb_build_object('card:monthly:2026-10:hope', jsonb_build_object('earnedOn', '2026-10-01',
      'earnedCard', pg_temp.card('2026-10', 'hope')
        || '{"passageText": "manuscript", "manuscriptText": "x", "passage": "y", "_rev": "sanity-internal", "eligibilityRule": "secret"}'::jsonb
        || jsonb_build_object('keywords', '["Hope", "hope", " grace "]'::jsonb))))));
  PERFORM pg_temp.check(r ->> 'status' = 'committed', 'T6e ceiling-day completion and month-floor award accepted');
  PERFORM pg_temp.check(
    (SELECT NOT (earned_card_snapshot ?| ARRAY['passageText', 'manuscriptText', 'passage', '_rev', 'eligibilityRule'])
            AND earned_card_snapshot -> 'keywords' = '["Hope", "grace"]'::jsonb
       FROM public.account_provisional_award_claims WHERE account_id = u::uuid),
    'T6f card snapshot rebuilt from allowlist: manuscript / Sanity-internal / eligibility fields stripped');
END $$;

-- ===========================================================================
-- T7. Atomicity: injected constraint failure and injected hard failure roll back
--     every write of the call (no half-committed completion / Shelf / award state).
-- ===========================================================================
CREATE FUNCTION pg_temp.inject_award_failure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.award_id LIKE '%:boom' THEN
    RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = 'injected constraint failure';
  END IF;
  IF NEW.award_id LIKE '%:crash' THEN
    RAISE EXCEPTION USING ERRCODE = 'XX001', MESSAGE = 'injected hard failure';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tx1_test_inject_award_failure
  BEFORE INSERT ON public.account_provisional_award_claims
  FOR EACH ROW EXECUTE FUNCTION pg_temp.inject_award_failure();

DO $$
DECLARE
  u constant text := '30000000-0000-4000-8000-000000000003';
  r jsonb;
  v_data jsonb;
  v_raised boolean := false;
BEGIN
  v_data := jsonb_build_object(
    'completedChallenges', jsonb_build_object('cms:rb1', jsonb_build_object('completedOn', '2026-11-01')),
    'savedScriptures', jsonb_build_array(jsonb_build_object('key', 'romans 8:1|', 'reference', 'Romans 8:1', 'translation', null, 'savedOn', '2026-11-01')),
    'shelf', jsonb_build_object('months', jsonb_build_array(jsonb_build_object('yearMonth', '2026-05', 'admissionKind', 'readerSelected'))),
    'earnedAwards', jsonb_build_object('card:monthly:2026-10:boom', jsonb_build_object('earnedOn', '2026-10-02')));

  r := pg_temp.call_as(u, pg_temp.payload('t7-boom', 0, 'newAccountTransfer', v_data));
  PERFORM pg_temp.check(r ->> 'status' = 'rejected' AND r ->> 'detail' = 'constraintViolation',
    'T7a injected constraint failure -> typed rejected');
  PERFORM pg_temp.check(pg_temp.row_total(u::uuid) = 0,
    'T7b constraint failure rolled back profile, completion, Saved Scripture, Shelf and receipt');

  BEGIN
    r := pg_temp.call_as(u, pg_temp.payload('t7-crash', 0, 'newAccountTransfer',
           jsonb_set(v_data, '{earnedAwards}', jsonb_build_object('card:monthly:2026-10:crash', jsonb_build_object('earnedOn', '2026-10-02')))));
  EXCEPTION WHEN SQLSTATE 'XX001' THEN
    v_raised := true;
  END;
  PERFORM pg_temp.check(v_raised, 'T7c injected hard failure propagates as an SQL error (adapter: retryable, no ACK)');
  PERFORM pg_temp.check(pg_temp.row_total(u::uuid) = 0, 'T7d hard failure persisted nothing');

  -- Successful commit, then a failing second commit must leave revision 1 state intact.
  r := pg_temp.call_as(u, pg_temp.payload('t7-ok', 0, 'newAccountTransfer',
         jsonb_build_object('completedChallenges', jsonb_build_object('cms:rb0', jsonb_build_object('completedOn', '2026-11-01')))));
  PERFORM pg_temp.check(r ->> 'status' = 'committed', 'T7e baseline commit');
  r := pg_temp.call_as(u, pg_temp.payload('t7-boom-2', 1, 'existingAccountMerge', v_data));
  PERFORM pg_temp.check(r ->> 'status' = 'rejected'
                    AND (SELECT revision FROM public.account_participation_profiles WHERE account_id = u::uuid) = 1
                    AND NOT EXISTS (SELECT 1 FROM public.account_completed_challenges WHERE account_id = u::uuid AND challenge_id = 'cms:rb1')
                    AND NOT EXISTS (SELECT 1 FROM public.account_shelf_months WHERE account_id = u::uuid)
                    AND NOT EXISTS (SELECT 1 FROM public.account_reconciliation_receipts WHERE account_id = u::uuid AND idempotency_key = 't7-boom-2'),
    'T7f failed merge left prior revision, rows and receipts untouched (no partial merge)');

  -- The failed key left no receipt, so the identical retry can succeed once the fault clears.
  r := pg_temp.call_as(u, pg_temp.payload('t7-boom-2', 1, 'existingAccountMerge',
         jsonb_set(v_data, '{earnedAwards}', jsonb_build_object('card:monthly:2026-10:hope', jsonb_build_object('earnedOn', '2026-10-02')))));
  PERFORM pg_temp.check(r ->> 'status' = 'committed' AND (r -> 'receipt' ->> 'durableRevision')::int = 2,
    'T7g retry after rollback commits exactly once');

  -- Unresolved evidence row failure must also roll back the receipt (receipt never claims persistence it lacks).
  PERFORM pg_temp.check(NOT EXISTS (
    SELECT 1 FROM public.account_reconciliation_receipts rc
     WHERE rc.unresolved_count <> (SELECT count(*) FROM public.account_reconciliation_unresolved_items ui
                                    WHERE ui.account_id = rc.account_id AND ui.idempotency_key = rc.idempotency_key)
       AND rc.unresolved_persisted_on_server
  ), 'T7h no receipt anywhere claims unresolvedPersistedOnServer without matching evidence rows');
END $$;

DROP TRIGGER tx1_test_inject_award_failure ON public.account_provisional_award_claims;

-- ===========================================================================
-- T8. Last-opened pointer and saved-Challenge merge rules (R13-0 §§4.3, 4.6)
-- ===========================================================================
DO $$
DECLARE
  u constant text := '10000000-0000-4000-8000-000000000001';
  v_rev bigint := (SELECT revision FROM public.account_participation_profiles WHERE account_id = u::uuid);
  r jsonb;
BEGIN
  r := pg_temp.call_as(u, pg_temp.payload('t8-older', v_rev::int, 'existingAccountMerge', jsonb_build_object(
    'lastOpenedChallenge', jsonb_build_object('challengeId', 'cms:c2', 'openedOn', '2026-11-01'),
    'savedChallenges', jsonb_build_object('cms:sv1', jsonb_build_object('savedOn', '2026-11-09')))));
  PERFORM pg_temp.check(r ->> 'status' = 'committed'
    AND (SELECT last_opened_challenge_id = 'cms:p1' FROM public.account_participation_profiles WHERE account_id = u::uuid)
    AND (SELECT saved_on = DATE '2026-11-04' FROM public.account_saved_challenges WHERE account_id = u::uuid AND challenge_id = 'cms:sv1'),
    'T8a older pointer ignored; later savedOn never replaces earlier');

  r := pg_temp.call_as(u, pg_temp.payload('t8-same', (v_rev + 1)::int, 'existingAccountMerge', jsonb_build_object(
    'lastOpenedChallenge', jsonb_build_object('challengeId', 'cms:p1', 'openedOn', '2026-11-03', 'resumeDismissedOn', '2026-11-04'),
    'savedChallenges', jsonb_build_object('cms:sv1', jsonb_build_object('savedOn', '2026-11-02')))));
  PERFORM pg_temp.check(r ->> 'status' = 'committed'
    AND (SELECT resume_dismissed_on = DATE '2026-11-04' FROM public.account_participation_profiles WHERE account_id = u::uuid)
    AND (SELECT saved_on = DATE '2026-11-02' FROM public.account_saved_challenges WHERE account_id = u::uuid AND challenge_id = 'cms:sv1'),
    'T8b same pointer gains resumeDismissedOn; earlier savedOn wins');

  r := pg_temp.call_as(u, pg_temp.payload('t8-newer', (v_rev + 2)::int, 'existingAccountMerge', jsonb_build_object(
    'lastOpenedChallenge', jsonb_build_object('challengeId', 'cms:c2', 'openedOn', '2026-11-10'))));
  PERFORM pg_temp.check(r ->> 'status' = 'committed'
    AND (SELECT last_opened_challenge_id = 'cms:c2' AND last_opened_on = DATE '2026-11-10' AND resume_dismissed_on IS NULL
           FROM public.account_participation_profiles WHERE account_id = u::uuid),
    'T8c newer pointer replaces pointer and clears stale dismissal');
END $$;

-- ===========================================================================
-- T9. Award eligibility is never established by a client claim (R08A-0 §6.2, review of
--     PR #207). Claims are quarantined, merged monotonically, never read as earned, and
--     keep guest retention required; only an already-verified award accepts client flags.
-- ===========================================================================
DO $$
DECLARE
  u constant text := '90000000-0000-4000-8000-000000000009';
  r jsonb;
BEGIN
  r := pg_temp.call_as(u, pg_temp.payload('t9-claim-1', 0, 'newAccountTransfer', jsonb_build_object(
    'completedChallenges', jsonb_build_object('cms:t9-c1', jsonb_build_object('completedOn', '2026-11-01')),
    'earnedAwards', jsonb_build_object('card:monthly:2026-10:hope',
      jsonb_build_object('earnedOn', '2026-10-05', 'hubAnnouncementAcked', false, 'cardViewed', false)))));
  PERFORM pg_temp.check(r ->> 'status' = 'committed'
                    AND EXISTS (SELECT 1 FROM public.account_completed_challenges WHERE account_id = u::uuid),
    'T9a decidable records commit even while an award claim is unverifiable');
  PERFORM pg_temp.check((r -> 'receipt' -> 'unresolvedPersistedOnServer') = 'false'::jsonb,
    'T9b receipt requires guest retention');

  -- Re-sync of the same claim (as the coordinator would on every later sync).
  r := pg_temp.call_as(u, pg_temp.payload('t9-claim-2', 1, 'existingAccountMerge', jsonb_build_object(
    'earnedAwards', jsonb_build_object('card:monthly:2026-10:hope',
      jsonb_build_object('earnedOn', '2026-10-02', 'hubAnnouncementAcked', false, 'cardViewed', true,
                         'earnedCard', pg_temp.card('2026-10', 'hope'))))));
  PERFORM pg_temp.check(r ->> 'status' = 'committed', 'T9c repeated claim commits');
  PERFORM pg_temp.check(
    (SELECT count(*) FROM public.account_provisional_award_claims WHERE account_id = u::uuid) = 1
    AND (SELECT claimed_earned_on = DATE '2026-10-05' AND card_viewed AND NOT hub_announcement_acked
                AND earned_card_snapshot IS NOT NULL AND last_idempotency_key = 't9-claim-2'
           FROM public.account_provisional_award_claims WHERE account_id = u::uuid),
    'T9d quarantined claim: one row, first claimed date kept (no earlier client clock), flags OR, snapshot backfilled');
  PERFORM pg_temp.check(NOT EXISTS (SELECT 1 FROM public.account_earned_awards WHERE account_id = u::uuid)
                    AND (r -> 'receipt' -> 'unresolvedPersistedOnServer') = 'false'::jsonb,
    'T9e still not earned and still guest-retention-required after re-sync');

  -- A later stale device re-sends the claim with false flags: quarantined flags never regress.
  r := pg_temp.call_as(u, pg_temp.payload('t9-claim-3', 2, 'existingAccountMerge', jsonb_build_object(
    'earnedAwards', jsonb_build_object('card:monthly:2026-10:hope',
      jsonb_build_object('earnedOn', '2026-10-05', 'hubAnnouncementAcked', true, 'cardViewed', false)))));
  PERFORM pg_temp.check(r ->> 'status' = 'committed'
    AND (SELECT card_viewed AND hub_announcement_acked FROM public.account_provisional_award_claims WHERE account_id = u::uuid),
    'T9e2 quarantined flags OR monotonically (false never regresses true)');

  -- Simulated future trusted admission of the award: client flags may now merge into it.
  PERFORM pg_temp.seed_verified_award(u, 'card:monthly:2026-10:faith', DATE '2026-10-07', false, false);
  r := pg_temp.call_as(u, pg_temp.payload('t9-verified', 3, 'existingAccountMerge', jsonb_build_object(
    'earnedAwards', jsonb_build_object('card:monthly:2026-10:faith',
      jsonb_build_object('earnedOn', '2026-10-07', 'hubAnnouncementAcked', true, 'cardViewed', false)))));
  PERFORM pg_temp.check(r ->> 'status' = 'committed' AND r ->> 'outcomeStatus' = 'committed'
                    AND (r -> 'receipt' -> 'unresolvedPersistedOnServer') = 'true'::jsonb
                    AND (r -> 'guestRetentionRequired') = 'false'::jsonb,
    'T9f commit touching only an already-verified award does not require retention');
  PERFORM pg_temp.check(
    (SELECT hub_announcement_acked AND NOT card_viewed FROM public.account_earned_awards
      WHERE account_id = u::uuid AND award_id = 'card:monthly:2026-10:faith')
    AND NOT EXISTS (SELECT 1 FROM public.account_provisional_award_claims
                     WHERE account_id = u::uuid AND award_id = 'card:monthly:2026-10:faith')
    AND r -> 'committedEnvelope' -> 'data' -> 'earnedAwards' ? 'card:monthly:2026-10:faith'
    AND NOT (r -> 'committedEnvelope' -> 'data' -> 'earnedAwards' ? 'card:monthly:2026-10:hope'),
    'T9g verified award gets the reader''s flag; only verified awards appear in earnedAwards');
END $$;

ROLLBACK;

\echo 'R13-TX1 transaction invariant suite: all assertions passed.'
