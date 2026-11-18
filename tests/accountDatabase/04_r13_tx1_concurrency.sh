#!/usr/bin/env bash
# Bibleberry R13-TX1: true multi-session concurrency suite for reconcile_guest_participation.
# LOCAL DISPOSABLE DATABASE ONLY. Invoked by scripts/accountDatabase/run-local-transaction-tests.sh,
# which validates LOCAL_TEST_DATABASE_URL before this script runs.
#
# Each call is a separate psql backend acting as PostgREST would (role `authenticated` with a
# JWT `sub`), so these scenarios exercise real lock contention, not simulated interleavings.
set -euo pipefail

URL="${LOCAL_TEST_DATABASE_URL:?LOCAL_TEST_DATABASE_URL is required}"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

C1='e1000000-0000-4000-8000-0000000000e1'  # first-profile initialization race
C2='e2000000-0000-4000-8000-0000000000e2'  # double-tap same key (existing account)
C2B='e2b00000-0000-4000-8000-000000000e2b' # double-tap same key (first profile)
C3='e3000000-0000-4000-8000-0000000000e3'  # deterministic lock hold
C4='e4000000-0000-4000-8000-0000000000e4'  # retrying writers, no lost update

admin() { psql "$URL" -XAtq -v ON_ERROR_STOP=1 -c "$1"; }

fail() { echo "ASSERTION FAILED: $1" >&2; exit 1; }
ok() { echo "ok - $1"; }

# payload KEY EXPECTED_REVISION MODE FINGERPRINT_SEED CHALLENGE_TOKEN
payload() {
  local fp
  fp="$(printf '%064x' "$4")"
  printf '{"expectedRevision":%s,"idempotencyKey":"%s","guestPayloadFingerprint":"%s","mode":"%s","envelope":{"schemaVersion":1,"namespace":"cms","revision":%s,"data":{"completedChallenges":{"cms:%s":{"completedOn":"2026-11-01"}}}}}' \
    "$2" "$1" "$fp" "$3" "$2" "$5"
}

# call SUB PAYLOAD -> prints "<status>|<reason>|<durableRevision>|<currentRevision>"
call() {
  psql "$URL" -XAtq -v ON_ERROR_STOP=1 \
    -c "SET ROLE authenticated" \
    -c "SELECT set_config('request.jwt.claim.sub', '$1', false)" \
    -c "SELECT concat_ws('|', r->>'status', coalesce(r->>'reason', ''), coalesce(r->'receipt'->>'durableRevision', ''), coalesce(r->>'currentRevision', '')) FROM (SELECT public.reconcile_guest_participation('$2'::jsonb) AS r) s" \
    | tail -n 1
}

current_revision() {
  admin "SELECT coalesce((SELECT revision FROM public.account_participation_profiles WHERE account_id = '$1'), 0)"
}

count_status() { grep -c "^$1|" "$2" || true; }

admin "INSERT INTO auth.users (id) VALUES ('$C1'), ('$C2'), ('$C2B'), ('$C3'), ('$C4') ON CONFLICT DO NOTHING"

# ---------------------------------------------------------------------------
# C1. First-profile initialization race: 8 simultaneous newAccountTransfer callers at
#     expectedRevision 0 with distinct keys. Exactly one commits; the rest get a
#     distinguishable revision conflict; no lost or duplicated rows.
# ---------------------------------------------------------------------------
: > "$WORK_DIR/c1"
for i in $(seq 1 8); do
  ( call "$C1" "$(payload "c1-k$i" 0 newAccountTransfer "$i" "race-$i")" >> "$WORK_DIR/c1" ) &
done
wait
[[ "$(wc -l < "$WORK_DIR/c1")" -eq 8 ]] || fail "C1 expected 8 results, got: $(cat "$WORK_DIR/c1")"
[[ "$(count_status committed "$WORK_DIR/c1")" -eq 1 ]] || fail "C1 expected exactly 1 committed: $(cat "$WORK_DIR/c1")"
[[ "$(grep -c '^conflict|revisionMismatch|' "$WORK_DIR/c1" || true)" -eq 7 ]] || fail "C1 expected 7 revisionMismatch: $(cat "$WORK_DIR/c1")"
[[ "$(current_revision "$C1")" -eq 1 ]] || fail "C1 expected revision 1"
[[ "$(admin "SELECT count(*) FROM public.account_completed_challenges WHERE account_id = '$C1'")" -eq 1 ]] || fail "C1 expected 1 completion"
[[ "$(admin "SELECT count(*) FROM public.account_reconciliation_receipts WHERE account_id = '$C1'")" -eq 1 ]] || fail "C1 expected 1 receipt"
ok "C1 first-profile race: 1 committed, 7 revisionMismatch, revision 1, no extra rows"

# ---------------------------------------------------------------------------
# C2. Double-tap: 6 simultaneous calls with the SAME key and digest against an existing
#     account. Exactly one commits; all others replay the identical receipt.
# ---------------------------------------------------------------------------
[[ "$(call "$C2" "$(payload c2-seed 0 newAccountTransfer 100 seed)")" == committed* ]] || fail "C2 seed"
: > "$WORK_DIR/c2"
for i in $(seq 1 6); do
  ( call "$C2" "$(payload c2-tap 1 existingAccountMerge 200 tapped)" >> "$WORK_DIR/c2" ) &
done
wait
[[ "$(count_status committed "$WORK_DIR/c2")" -eq 1 ]] || fail "C2 expected exactly 1 committed: $(cat "$WORK_DIR/c2")"
[[ "$(count_status alreadyCommittedDuplicate "$WORK_DIR/c2")" -eq 5 ]] || fail "C2 expected 5 duplicates: $(cat "$WORK_DIR/c2")"
[[ "$(grep -c '|2|' "$WORK_DIR/c2" || true)" -eq 6 ]] || fail "C2 every ACK must carry durableRevision 2: $(cat "$WORK_DIR/c2")"
[[ "$(current_revision "$C2")" -eq 2 ]] || fail "C2 expected revision 2"
ok "C2 double-tap on existing account: 1 committed + 5 alreadyCommittedDuplicate, all durableRevision 2"

: > "$WORK_DIR/c2b"
for i in $(seq 1 6); do
  ( call "$C2B" "$(payload c2b-tap 0 newAccountTransfer 300 first)" >> "$WORK_DIR/c2b" ) &
done
wait
[[ "$(count_status committed "$WORK_DIR/c2b")" -eq 1 ]] || fail "C2b expected exactly 1 committed: $(cat "$WORK_DIR/c2b")"
[[ "$(count_status alreadyCommittedDuplicate "$WORK_DIR/c2b")" -eq 5 ]] || fail "C2b expected 5 duplicates: $(cat "$WORK_DIR/c2b")"
[[ "$(current_revision "$C2B")" -eq 1 ]] || fail "C2b expected revision 1"
ok "C2b double-tap during first-profile creation: 1 committed + 5 alreadyCommittedDuplicate"

# ---------------------------------------------------------------------------
# C3. Deterministic interleaving: session 1 commits inside an open transaction and holds
#     it for 2s; session 2 (same expected revision) must BLOCK, then see a conflict, never
#     overwrite session 1's work; its retry at the new revision merges both.
# ---------------------------------------------------------------------------
[[ "$(call "$C3" "$(payload c3-seed 0 newAccountTransfer 400 base)")" == committed* ]] || fail "C3 seed"
(
  psql "$URL" -XAtq -v ON_ERROR_STOP=1 <<SQL > "$WORK_DIR/c3-s1"
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '$C3', true);
SELECT public.reconcile_guest_participation('$(payload c3-s1 1 existingAccountMerge 401 from-s1)'::jsonb)->>'status';
SELECT pg_sleep(2);
COMMIT;
SQL
) &
S1_PID=$!
sleep 0.5
START_NS=$(date +%s%N)
S2_RESULT="$(call "$C3" "$(payload c3-s2 1 existingAccountMerge 402 from-s2)")"
ELAPSED_MS=$(( ($(date +%s%N) - START_NS) / 1000000 ))
wait "$S1_PID"
grep -qx committed "$WORK_DIR/c3-s1" || fail "C3 session 1 should commit: $(cat "$WORK_DIR/c3-s1")"
[[ "$S2_RESULT" == "conflict|revisionMismatch||2" ]] || fail "C3 session 2 expected revisionMismatch at 2, got $S2_RESULT"
(( ELAPSED_MS >= 1200 )) || fail "C3 session 2 returned after ${ELAPSED_MS}ms; it must block on the per-account lock"
[[ "$(call "$C3" "$(payload c3-s2 2 existingAccountMerge 402 from-s2)")" == committed\|\|3\|* ]] || fail "C3 session 2 retry should commit at revision 3"
[[ "$(admin "SELECT string_agg(challenge_id, ',' ORDER BY challenge_id) FROM public.account_completed_challenges WHERE account_id = '$C3'")" == "cms:base,cms:from-s1,cms:from-s2" ]] \
  || fail "C3 expected base + both sessions' completions"
ok "C3 concurrent writer blocked ${ELAPSED_MS}ms, got revisionMismatch (no overwrite), retry merged both (revision 3)"

# ---------------------------------------------------------------------------
# C4. Six retrying writers (coordinator-style: re-fetch revision, re-submit SAME key on
#     conflict) against one brand-new account. No lost update, exactly-once effects.
# ---------------------------------------------------------------------------
worker() {
  local i="$1" attempt rev mode res
  for attempt in $(seq 1 40); do
    rev="$(current_revision "$C4")"
    if [[ "$rev" -eq 0 ]]; then mode=newAccountTransfer; else mode=existingAccountMerge; fi
    res="$(call "$C4" "$(payload "c4-w$i" "$rev" "$mode" "$((500 + i))" "worker-$i")")"
    case "$res" in
      committed*|alreadyCommittedDuplicate*) echo "$i|$attempt|$res"; return 0 ;;
      conflict\|revisionMismatch*) continue ;;
      *) echo "$i|$attempt|UNEXPECTED|$res"; return 0 ;;
    esac
  done
  echo "$i|exhausted"
}
: > "$WORK_DIR/c4"
for i in $(seq 1 6); do
  ( worker "$i" >> "$WORK_DIR/c4" ) &
done
wait
! grep -q 'UNEXPECTED\|exhausted' "$WORK_DIR/c4" || fail "C4 unexpected outcome: $(cat "$WORK_DIR/c4")"
[[ "$(wc -l < "$WORK_DIR/c4")" -eq 6 ]] || fail "C4 expected 6 worker results"
[[ "$(current_revision "$C4")" -eq 6 ]] || fail "C4 expected revision 6, got $(current_revision "$C4")"
[[ "$(admin "SELECT count(*) FROM public.account_completed_challenges WHERE account_id = '$C4'")" -eq 6 ]] || fail "C4 lost update: expected 6 completions"
[[ "$(admin "SELECT count(*) FROM public.account_reconciliation_receipts WHERE account_id = '$C4'")" -eq 6 ]] || fail "C4 expected 6 receipts"
[[ "$(admin "SELECT string_agg(committed_revision::text, ',' ORDER BY committed_revision) FROM public.account_reconciliation_receipts WHERE account_id = '$C4'")" == "1,2,3,4,5,6" ]] \
  || fail "C4 receipts must hold each revision exactly once"
ok "C4 six retrying writers: all 6 completions kept, revisions 1..6 each committed exactly once"

admin "DELETE FROM auth.users WHERE id IN ('$C1', '$C2', '$C2B', '$C3', '$C4')"
[[ "$(admin "SELECT count(*) FROM public.account_participation_profiles WHERE account_id IN ('$C1', '$C2', '$C2B', '$C3', '$C4')")" -eq 0 ]] \
  || fail "cleanup cascade"

echo "R13-TX1 concurrency suite: all assertions passed."
