#!/usr/bin/env bash
set -euo pipefail

# R13-SB1: the local Supabase acceptance runner must refuse, BEFORE touching Docker or any
# database, every configuration that could redirect it away from a disposable local stack.
# Runs against a throwaway copy of the runner + config, so the real checkout is never modified.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/scripts/accountSupabase" "$WORK/supabase"
cp "$ROOT_DIR/scripts/accountSupabase/run-local-supabase-acceptance.sh" "$WORK/scripts/accountSupabase/"
cp "$ROOT_DIR/supabase/config.toml" "$WORK/supabase/"
RUNNER="$WORK/scripts/accountSupabase/run-local-supabase-acceptance.sh"

clean_env=(env -u SUPABASE_ACCESS_TOKEN -u SUPABASE_DB_URL -u SUPABASE_DB_PASSWORD -u SUPABASE_PROJECT_ID
  -u DATABASE_URL -u PGHOST -u PGHOSTADDR -u PGSERVICE -u PGSERVICEFILE -u PGPASSWORD)

expect_refusal() {
  local label="$1" pattern="$2"
  shift 2
  set +e
  output="$("${clean_env[@]}" "$@" SUPABASE_CLI=/nonexistent/supabase "$RUNNER" 2>&1)"
  status=$?
  set -e
  if [[ $status -ne 2 ]] || ! grep -q "$pattern" <<<"$output"; then
    echo "not ok - $label (exit $status): $output" >&2
    exit 1
  fi
  echo "ok - $label"
}

for var in SUPABASE_ACCESS_TOKEN SUPABASE_DB_URL SUPABASE_DB_PASSWORD SUPABASE_PROJECT_ID DATABASE_URL \
           PGHOST PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSWORD; do
  expect_refusal "refuses when $var is set" "$var is set" "$var=db.example.supabase.co"
done

mkdir -p "$WORK/supabase/.temp"
echo "abcdefghijklmnopqrst" > "$WORK/supabase/.temp/project-ref"
expect_refusal "refuses a checkout linked to a hosted project" "linked to a hosted project"
rm -f "$WORK/supabase/.temp/project-ref"

sed -i 's/^project_id = .*/project_id = "someone-elses-project"/' "$WORK/supabase/config.toml"
expect_refusal "refuses an unexpected project_id" "unexpected project_id"
cp "$ROOT_DIR/supabase/config.toml" "$WORK/supabase/"

sed -i 's/^schemas = .*/schemas = ["public", "graphql_public", "account_issuance"]/' "$WORK/supabase/config.toml"
expect_refusal "refuses a config exposing a private schema through the Data API" "only public/graphql_public"
cp "$ROOT_DIR/supabase/config.toml" "$WORK/supabase/"

expect_refusal "refuses when the Supabase CLI is missing" "not installed or not on PATH"

# ---------------------------------------------------------------------------
# Existing-resource collisions (review of PR #224, finding 2). Stub `docker` and `supabase`
# report pre-existing resources and log every call; the runner must refuse with exit 2 and
# must never issue a destructive or creating command (stop, start, network create/rm).
# ---------------------------------------------------------------------------
STUBS="$WORK/stubs"
mkdir -p "$STUBS"
cat > "$STUBS/docker" <<'STUB'
#!/usr/bin/env bash
echo "docker $*" >> "$STUB_LOG"
last="${*: -1}"
case "$1" in
  info) exit 0 ;;
  version) echo "Docker stub"; exit 0 ;;
  ps)
    IFS=';' read -ra entries <<<"${STUB_CONTAINERS:-}"
    for e in "${entries[@]}"; do [[ -n "$e" ]] && echo "${e%%|*}"; done
    exit 0 ;;
  volume) [[ -z "${STUB_VOLUMES:-}" ]] || echo "$STUB_VOLUMES"; exit 0 ;;
  network)
    if [[ "$2" == "inspect" ]]; then
      [[ "${STUB_NET_EXISTS:-0}" == "1" ]] || exit 1
      case "$last" in
        *bibleberry.sb1.owner*) echo "${STUB_NET_OWNER:-}" ;;
        *'"bibleberry.sb1"'*) echo "${STUB_NET_LOCAL:-}" ;;
        *host_binding_ipv4*) echo "${STUB_NET_BINDING:-}" ;;
      esac
    fi
    exit 0 ;;
  inspect)
    IFS=';' read -ra entries <<<"${STUB_CONTAINERS:-}"
    for e in "${entries[@]}"; do
      IFS='|' read -r name workdir networks <<<"$e"
      [[ "$name" == "$2" ]] || continue
      if [[ "$last" == *workdir* ]]; then echo "$workdir"; else echo "$networks "; fi
    done
    exit 0 ;;
esac
exit 0
STUB
cat > "$STUBS/supabase" <<'STUB'
#!/usr/bin/env bash
echo "supabase $*" >> "$STUB_LOG"
[[ "$1" == "--version" ]] && echo "stub"
exit 0
STUB
chmod +x "$STUBS/docker" "$STUBS/supabase"

NET=bibleberry_sb1_loopback
CONTAINER=supabase_db_bibleberry-sb1-local

expect_collision_refusal() {
  local label="$1" pattern="$2"
  shift 2
  local log="$WORK/stub-calls.log"
  : > "$log"
  set +e
  output="$("${clean_env[@]}" PATH="$STUBS:$PATH" STUB_LOG="$log" SUPABASE_CLI="$STUBS/supabase" "$@" "$RUNNER" 2>&1)"
  status=$?
  set -e
  if [[ $status -ne 2 ]] || ! grep -q "$pattern" <<<"$output"; then
    echo "not ok - $label (exit $status): $output" >&2
    exit 1
  fi
  if grep -qE '^supabase (stop|start|migration)|^docker network (rm|create)|^docker (rm|volume rm|exec)' "$log"; then
    echo "not ok - $label: destructive/creating command issued:" >&2
    grep -E '^supabase (stop|start|migration)|^docker network (rm|create)|^docker (rm|volume rm|exec)' "$log" >&2
    exit 1
  fi
  echo "ok - $label (no stop/start/create/remove issued)"
}

RUNNER_NET=(STUB_NET_EXISTS=1 STUB_NET_LOCAL=local STUB_NET_OWNER=run-earlier STUB_NET_BINDING=127.0.0.1)

expect_collision_refusal "refuses an existing project container by default" "refusing to touch pre-existing" \
  STUB_CONTAINERS="$CONTAINER|$WORK|$NET" "${RUNNER_NET[@]}"
expect_collision_refusal "refuses an existing project volume by default" "refusing to touch pre-existing" \
  STUB_VOLUMES="$CONTAINER"
expect_collision_refusal "refuses an existing same-named network by default" "refusing to touch pre-existing" \
  STUB_NET_EXISTS=1
expect_collision_refusal "opt-in: refuses a same-named network without the runner's labels" "lacks this runner's labels" \
  SB1_DISPOSE_PREVIOUS_RUNNER_STACK=1 STUB_NET_EXISTS=1 STUB_CONTAINERS="$CONTAINER|$WORK|$NET"
expect_collision_refusal "opt-in: refuses a runner-labelled network that does not force loopback" "does not force loopback" \
  SB1_DISPOSE_PREVIOUS_RUNNER_STACK=1 STUB_NET_EXISTS=1 STUB_NET_LOCAL=local STUB_NET_OWNER=run-earlier \
  STUB_NET_BINDING=0.0.0.0 STUB_CONTAINERS="$CONTAINER|$WORK|$NET"
expect_collision_refusal "opt-in: refuses a same-project container from another checkout" "belongs to workdir" \
  SB1_DISPOSE_PREVIOUS_RUNNER_STACK=1 "${RUNNER_NET[@]}" STUB_CONTAINERS="$CONTAINER|/elsewhere/other-checkout|$NET"
expect_collision_refusal "opt-in: refuses a container not attached to the runner network" "is not on" \
  SB1_DISPOSE_PREVIOUS_RUNNER_STACK=1 "${RUNNER_NET[@]}" STUB_CONTAINERS="$CONTAINER|$WORK|some_other_net"
expect_collision_refusal "opt-in: refuses orphaned volumes without the runner's containers" "without the runner's containers" \
  SB1_DISPOSE_PREVIOUS_RUNNER_STACK=1 "${RUNNER_NET[@]}" STUB_VOLUMES="$CONTAINER"
expect_collision_refusal "opt-in: refuses project resources with no runner network" "no runner network" \
  SB1_DISPOSE_PREVIOUS_RUNNER_STACK=1 STUB_CONTAINERS="$CONTAINER|$WORK|$NET"

# R13-SB2 (Issue #225): mutation demonstrations run through the same fail-closed ownership gate.
expect_collision_refusal "SB2 mutation mode still refuses an existing project container" "refusing to touch pre-existing" \
  SB2_MUTATION_DEMOS=1 STUB_CONTAINERS="$CONTAINER|$WORK|$NET" "${RUNNER_NET[@]}"

# R13-SB2: the runner must have NO superuser / pre-unblock path at all.
RUNNER_SRC="$ROOT_DIR/scripts/accountSupabase/run-local-supabase-acceptance.sh"
if grep -nE 'docker exec|supabase_admin|-U postgres\b|GRANT SET ON PARAMETER|ON SCHEMA auth' "$RUNNER_SRC" \
     | grep -vE '^\s*[0-9]+:\s*#'; then
  echo "not ok - runner contains a superuser/pre-unblock path" >&2
  exit 1
fi
echo "ok - runner has no superuser or pre-unblock path (no docker exec, supabase_admin, parameter or auth grant)"
# Mutation copies are built under a fresh mktemp directory, never inside the checkout.
grep -qE 'MUT_ROOT="\$\(mktemp -d ' "$RUNNER_SRC" || { echo "not ok - mutation workdir is not a mktemp directory" >&2; exit 1; }
if grep -nE 'perl -0pi[^\n]*ROOT_DIR' "$RUNNER_SRC"; then echo "not ok - a mutation edits the checkout" >&2; exit 1; fi
echo "ok - mutation demonstrations only edit throw-away copies"

echo "R13-SB1/SB2 runner guard tests passed."
