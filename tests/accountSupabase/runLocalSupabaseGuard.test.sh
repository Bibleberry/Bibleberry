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

echo "R13-SB1 runner guard tests passed."
