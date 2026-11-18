#!/usr/bin/env bash
# Bibleberry R13-VERIFY1: real multi-session concurrency for trusted award admission.
# LOCAL DISPOSABLE DATABASE ONLY. Invoked by scripts/accountDatabase/run-local-verify1-tests.sh,
# which validates LOCAL_TEST_DATABASE_URL first.
set -euo pipefail

URL="${LOCAL_TEST_DATABASE_URL:?LOCAL_TEST_DATABASE_URL is required}"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

K1='f1000000-0000-4000-8000-0000000000f1'
K2='f2000000-0000-4000-8000-0000000000f2'
K3='f3000000-0000-4000-8000-0000000000f3'
K4A='f4a00000-0000-4000-8000-000000000f4a'
K4B='f4b00000-0000-4000-8000-000000000f4b'
K4C='f4c00000-0000-4000-8000-000000000f4c'

admin() { psql "$URL" -XAtq -v ON_ERROR_STOP=1 -c "$1"; }
fail() { echo "ASSERTION FAILED: $1" >&2; exit 1; }
ok() { echo "ok - $1"; }

# claim SUB KEY EXPECTED AWARD_SLUG: TX1 reconcile as the reader, quarantining one claim.
claim() {
  psql "$URL" -XAtq -v ON_ERROR_STOP=1 \
    -c "SET ROLE authenticated" \
    -c "SELECT set_config('request.jwt.claim.sub', '$1', false)" \
    -c "SELECT public.reconcile_guest_participation(jsonb_build_object(
          'expectedRevision', $3, 'idempotencyKey', '$2',
          'guestPayloadFingerprint', encode(sha256(convert_to('$2', 'UTF8')), 'hex'),
          'mode', CASE WHEN $3 = 0 THEN 'newAccountTransfer' ELSE 'existingAccountMerge' END,
          'envelope', jsonb_build_object('schemaVersion', 1, 'namespace', 'cms', 'data', jsonb_build_object(
            'completedChallenges', jsonb_build_object('cms:vrf-k1', jsonb_build_object('completedOn', '2026-10-03')),
            'earnedAwards', jsonb_build_object('card:monthly:2026-10:$4', jsonb_build_object('earnedOn', '2026-10-05', 'cardViewed', true))))))->>'status'" \
    | tail -n 1
}

attestation() {
  printf '{"verificationKey":"run-k","verifierVersion":"r13-verify1.1","accountId":"%s","awardId":"card:monthly:2026-10:%s","discoveryId":"discovery:2026-10:%s","kind":"thematic","publicationYearMonth":"2026-10","rosterVersion":1,"targetCount":1,"basisChallengeIds":["cms:vrf-k1"],"latestBasisReleaseDate":"2026-10-03","verifiedThroughDate":"2026-11-01","card":{"cardDocumentId":"card-%s","title":"T","publicationYearMonth":"2026-10","imageUrl":"https://cdn.sanity.io/images/testproj/production/k-1x1.png","assetRevision":"v1","illustrationAlt":"alt","accessibleTranscription":"transcription","scripture":{"book":"John","reference":"John 1:1","translation":"WEB"},"attribution":"A","rightsStatus":"licensed","shareEligible":true},"source":{"documentId":"month-2026-10","revision":"rev1","dataset":"staging","perspective":"published"}}' \
    "$1" "$2" "$2" "$2"
}

admit() {
  psql "$URL" -XAtq -v ON_ERROR_STOP=1 \
    -c "SET ROLE account_award_verifier" \
    -c "SELECT account_issuance.admit_verified_award('$(attestation "$1" "$2")'::jsonb)->>'status'" \
    | tail -n 1
}

# gated_admit: block on a start gate (shared advisory lock held by a gate session) so all
# workers are released into admit_verified_award within microseconds of each other.
gated_admit() {
  psql "$URL" -XAtq -v ON_ERROR_STOP=1 \
    -c "SELECT pg_advisory_lock_shared(990208)" \
    -c "SELECT pg_advisory_unlock_shared(990208)" \
    -c "SET ROLE account_award_verifier" \
    -c "SELECT account_issuance.admit_verified_award('$(attestation "$1" "$2")'::jsonb)->>'status'" \
    | tail -n 1
}

rev() { admin "SELECT revision FROM public.account_participation_profiles WHERE account_id = '$1'"; }

admin "INSERT INTO auth.users (id) VALUES ('$K1'), ('$K2'), ('$K3'), ('$K4A'), ('$K4B'), ('$K4C') ON CONFLICT DO NOTHING"

# K1. Six verifier workers admit the same claim at once: exactly one admission.
[[ "$(claim "$K1" k1-claim 0 hope)" == committed ]] || fail "K1 claim"
R0="$(rev "$K1")"
: > "$WORK_DIR/k1"
( psql "$URL" -XAtq -c "SELECT pg_advisory_lock(990208), pg_sleep(1.5)" >/dev/null ) &
GATE=$!
sleep 0.3
for _ in $(seq 1 6); do ( gated_admit "$K1" hope >> "$WORK_DIR/k1" ) & done
wait
[[ "$(grep -cx admitted "$WORK_DIR/k1" || true)" -eq 1 ]] || fail "K1 expected 1 admitted: $(cat "$WORK_DIR/k1")"
[[ "$(grep -cx alreadyEarned "$WORK_DIR/k1" || true)" -eq 5 ]] || fail "K1 expected 5 alreadyEarned: $(cat "$WORK_DIR/k1")"
[[ "$(admin "SELECT count(*) FROM public.account_earned_awards WHERE account_id = '$K1'")" -eq 1 ]] || fail "K1 earned rows"
[[ "$(admin "SELECT count(*) FROM public.account_award_admission_attestations WHERE account_id = '$K1'")" -eq 1 ]] || fail "K1 attestations"
[[ "$(rev "$K1")" -eq $((R0 + 1)) ]] || fail "K1 revision must advance exactly once"
ok "K1 six gate-released simultaneous admissions: 1 admitted + 5 alreadyEarned, one record, revision +1"

# K2. A reader's TX1 reconcile holds the account lock; admission must wait, then both persist.
[[ "$(claim "$K2" k2-claim 0 hope)" == committed ]] || fail "K2 claim"
R0="$(rev "$K2")"
(
  psql "$URL" -XAtq -v ON_ERROR_STOP=1 <<SQL > "$WORK_DIR/k2-s1"
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '$K2', true);
SELECT public.reconcile_guest_participation(jsonb_build_object(
  'expectedRevision', $R0, 'idempotencyKey', 'k2-second',
  'guestPayloadFingerprint', encode(sha256(convert_to('k2-second', 'UTF8')), 'hex'),
  'mode', 'existingAccountMerge',
  'envelope', jsonb_build_object('schemaVersion', 1, 'namespace', 'cms', 'data', jsonb_build_object(
    'savedChallenges', jsonb_build_object('cms:vrf-k2-saved', jsonb_build_object('savedOn', '2026-10-06'))))))->>'status';
SELECT pg_sleep(2);
COMMIT;
SQL
) &
S1=$!
sleep 0.5
START=$(date +%s%N)
K2_RESULT="$(admit "$K2" hope)"
ELAPSED=$(( ($(date +%s%N) - START) / 1000000 ))
wait "$S1"
grep -qx committed "$WORK_DIR/k2-s1" || fail "K2 reconcile should commit"
[[ "$K2_RESULT" == admitted ]] || fail "K2 admission should succeed after waiting, got $K2_RESULT"
(( ELAPSED >= 1200 )) || fail "K2 admission returned after ${ELAPSED}ms; it must serialize with TX1 reconciliation"
[[ "$(rev "$K2")" -eq $((R0 + 2)) ]] || fail "K2 both writers must each advance the revision once"
[[ "$(admin "SELECT count(*) FROM public.account_saved_challenges WHERE account_id = '$K2'")" -eq 1 ]] || fail "K2 lost the reconcile write"
ok "K2 admission blocked ${ELAPSED}ms behind a reader reconcile, then both persisted (revision +2, no lost update)"

# K3. Reader re-syncs the same award while verifiers admit it: never two records, never a stale claim.
[[ "$(claim "$K3" k3-claim 0 hope)" == committed ]] || fail "K3 claim"
: > "$WORK_DIR/k3"
for i in $(seq 1 4); do
  ( admit "$K3" hope >> "$WORK_DIR/k3" ) &
  (
    for attempt in $(seq 1 20); do
      R="$(rev "$K3")"
      res="$(claim "$K3" "k3-resync-$i" "$R" hope)"
      [[ "$res" == committed || "$res" == alreadyCommittedDuplicate ]] && break
    done
  ) &
done
wait
[[ "$(admin "SELECT count(*) FROM public.account_earned_awards WHERE account_id = '$K3'")" -eq 1 ]] || fail "K3 earned rows"
[[ "$(admin "SELECT count(*) FROM public.account_provisional_award_claims WHERE account_id = '$K3'")" -eq 0 ]] \
  || fail "K3 a re-sync after admission must merge into the earned award, not re-quarantine it"
[[ "$(admin "SELECT card_viewed FROM public.account_earned_awards WHERE account_id = '$K3'")" == t ]] || fail "K3 flag lost"
ok "K3 concurrent re-syncs and admissions converge to one earned award and no stale quarantine"

# K4. Different accounts admit in parallel without interference.
for u in "$K4A" "$K4B" "$K4C"; do [[ "$(claim "$u" "k4-$u" 0 hope)" == committed ]] || fail "K4 claim"; done
: > "$WORK_DIR/k4"
for u in "$K4A" "$K4B" "$K4C"; do ( admit "$u" hope >> "$WORK_DIR/k4" ) & done
wait
[[ "$(grep -cx admitted "$WORK_DIR/k4" || true)" -eq 3 ]] || fail "K4 expected 3 admitted: $(cat "$WORK_DIR/k4")"
[[ "$(admin "SELECT count(DISTINCT account_id) FROM public.account_earned_awards WHERE account_id IN ('$K4A','$K4B','$K4C')")" -eq 3 ]] || fail "K4 isolation"
ok "K4 parallel admissions for three accounts are isolated and all succeed"

admin "DELETE FROM auth.users WHERE id IN ('$K1','$K2','$K3','$K4A','$K4B','$K4C')"
echo "R13-VERIFY1 concurrency suite: all assertions passed."
