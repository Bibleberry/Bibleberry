#!/usr/bin/env bash
set -euo pipefail

# R13-SB1 (Issue #210): real disposable LOCAL Supabase security acceptance runner.
#
# What it does, in order:
#   1. Hard preflight: refuses linked/remote projects, remote-looking env, missing tools.
#   2. Starts a FRESH disposable stack from supabase/config.toml on a Docker network whose
#      published ports bind to 127.0.0.1 only, then verifies every published port is loopback.
#   3. Applies the versioned migrations with the Supabase CLI's own runner
#      (`supabase migration up --local`, identity `postgres`), WITHOUT the synthetic
#      tests/accountDatabase/00_local_supabase_auth_bootstrap.sql.
#   4. Asserts the two reproduced Supabase incompatibilities of accepted migrations
#      (D3: VERIFY1 placeholder GUC; D4: TX1 silent `auth` grant no-op) are still present.
#   5. Applies the LOCAL-ONLY test unblocks for D3/D4 as the container's bootstrap superuser
#      (never in a migration; impossible on hosted Supabase), finishes the migrations, and
#      fails on any unexpected migration WARNING in the database log.
#   6. Runs the A (GoTrue + PostgREST) and B (verifier login + issuance) suites.
#   7. Tears the stack down (set SB1_KEEP_STACK=1 to keep it for inspection).
#
# Never: supabase login/link, db push, --linked, --remote, --db-url, hosted projects, real users.
# Output is redacted; no key, JWT or password is printed or written to disk by this script.
#
# Usage:  SUPABASE_CLI=/path/to/supabase ./scripts/accountSupabase/run-local-supabase-acceptance.sh
#         (defaults to `supabase` on PATH; tested with Supabase CLI 3.2.0)
# Env:    SB1_IMAGE_REGISTRY   optional image registry override (e.g. ghcr.io)
#         SB1_STOP_AFTER_DEFECTS=1  stop after step 4 (no unblocks, no suites)
#         SB1_KEEP_STACK=1     leave the stack running afterwards

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SUPABASE_CLI="${SUPABASE_CLI:-supabase}"
NETWORK="bibleberry_sb1_loopback"
PROJECT_ID="$(sed -nE 's/^project_id = "([^"]+)"/\1/p' "${ROOT_DIR}/supabase/config.toml")"
DB_CONTAINER="supabase_db_${PROJECT_ID}"
EXPECTED_WARNINGS=(
  'no privileges were granted for "auth"'   # D4: TX1 GRANT USAGE ON SCHEMA auth (silent no-op)
  'no privileges were granted for "uid"'    # D4: TX1 GRANT EXECUTE ON auth.uid() (harmless: PUBLIC has it)
)

redact() {
  sed -E \
    -e 's/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/<jwt:redacted>/g' \
    -e 's/sb_(publishable|secret)_[A-Za-z0-9_-]+/sb_\1_<redacted>/g' \
    -e 's#postgres(ql)?://[^@ ]*@#postgresql://<redacted>@#g' \
    -e 's/("[A-Z_]*(SECRET|KEY|PASSWORD|TOKEN)[A-Z_]*" *: *")[^"]*"/\1<redacted>"/g' \
    -e 's/(password|secret|key)([=:] *)[^ ,"]+/\1\2<redacted>/gI'
}

die() { echo "ERROR: $*" >&2; exit 2; }
step() { echo; echo "== $*"; }
sb() { (cd "$ROOT_DIR" && "$SUPABASE_CLI" "$@"); }

# ---------------------------------------------------------------------------
# 1. Hard preflight
# ---------------------------------------------------------------------------
step "Preflight"
[[ "$PROJECT_ID" == "bibleberry-sb1-local" ]] || die "unexpected project_id '$PROJECT_ID' in supabase/config.toml"
# A linked project leaves a ref under supabase/.temp; never run anywhere near one.
[[ ! -s "${ROOT_DIR}/supabase/.temp/project-ref" ]] || die "supabase/.temp/project-ref exists: this checkout is linked to a hosted project"
for var in SUPABASE_ACCESS_TOKEN SUPABASE_DB_URL SUPABASE_DB_PASSWORD SUPABASE_PROJECT_ID DATABASE_URL \
           PGHOST PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSWORD; do
  [[ -z "${!var:-}" ]] || die "$var is set; unset it so nothing can redirect this local-only run"
done
grep -qE '^\s*schemas = \["public", "graphql_public"\]' "${ROOT_DIR}/supabase/config.toml" \
  || die "config.toml must expose only public/graphql_public through the Data API"
for tool in docker psql node "$SUPABASE_CLI"; do
  command -v "$tool" >/dev/null 2>&1 || die "'$tool' is not installed or not on PATH"
done
docker info >/dev/null 2>&1 || die "Docker daemon is not reachable"
echo "Supabase CLI $("$SUPABASE_CLI" --version 2>/dev/null) | $(docker version --format 'Docker {{.Server.Version}} ({{.Server.Os}}/{{.Server.Arch}})') | node $(node --version) | $(psql --version)"

if [[ -n "${SB1_IMAGE_REGISTRY:-}" ]]; then
  export SUPABASE_INTERNAL_IMAGE_REGISTRY="$SB1_IMAGE_REGISTRY"
fi

# ---------------------------------------------------------------------------
# 2. Fresh disposable stack, loopback-only
# ---------------------------------------------------------------------------
step "Starting a fresh disposable local stack (${PROJECT_ID})"
sb stop --no-backup >/dev/null 2>&1 || true
if ! docker network inspect "$NETWORK" >/dev/null 2>&1; then
  docker network create --label bibleberry.sb1=local \
    -o com.docker.network.bridge.host_binding_ipv4=127.0.0.1 "$NETWORK" >/dev/null
fi
binding="$(docker network inspect "$NETWORK" --format '{{index .Options "com.docker.network.bridge.host_binding_ipv4"}}')"
[[ "$binding" == "127.0.0.1" ]] || die "network $NETWORK does not force loopback port binding"

cleanup() {
  if [[ "${SB1_KEEP_STACK:-0}" != "1" ]]; then
    step "Teardown"
    sb stop --no-backup 2>&1 | redact | tail -1 || true
    docker network rm "$NETWORK" >/dev/null 2>&1 || true
  else
    echo "SB1_KEEP_STACK=1: stack left running (stop with: supabase stop --no-backup)"
  fi
}
trap cleanup EXIT

# `supabase start` ends with a status JSON holding local keys: never echo it, even redacted.
sb start --network-id "$NETWORK" 2>&1 | grep -vE '^\{|Pulling|Pull complete|Download|Digest|Status:|Waiting|Extracting|Verifying' | redact || true

# Every published port of this project must be bound to loopback.
published="$(docker ps --filter "label=com.supabase.cli.project=${PROJECT_ID}" --format '{{.Ports}}' | tr ',' '\n' | grep -- '->' || true)"
[[ -n "$published" ]] || die "no published ports found; did the stack start?"
if grep -vqE '^\s*127\.0\.0\.1:' <<<"$published"; then
  echo "$published" >&2
  die "a service port is published on a non-loopback interface"
fi
echo "Published ports (loopback only):"; sed 's/^ */  /' <<<"$published"

status_env="$(sb status -o env 2>/dev/null)"
get() { sed -nE "s/^$1=\"?([^\"]*)\"?$/\1/p" <<<"$status_env"; }
export SB1_API_URL="$(get API_URL)" SB1_ADMIN_DB_URL="$(get DB_URL)" SB1_PUBLISHABLE_KEY="$(get PUBLISHABLE_KEY)" \
       SB1_ANON_KEY="$(get ANON_KEY)" SB1_SERVICE_ROLE_KEY="$(get SERVICE_ROLE_KEY)" SB1_SECRET_KEY="$(get SECRET_KEY)" \
       SB1_JWT_SECRET="$(get JWT_SECRET)"
[[ "$SB1_API_URL" =~ ^http://127\.0\.0\.1:[0-9]+$ ]] || die "API URL is not loopback"
[[ "$SB1_ADMIN_DB_URL" =~ ^postgresql://[^@]+@127\.0\.0\.1:[0-9]+/postgres$ ]] || die "DB URL is not loopback"
for v in SB1_PUBLISHABLE_KEY SB1_ANON_KEY SB1_SERVICE_ROLE_KEY SB1_SECRET_KEY SB1_JWT_SECRET; do
  [[ -n "${!v}" ]] || die "could not read $v from 'supabase status'"
done

admin_sql() { psql "$SB1_ADMIN_DB_URL" -XAtq -v ON_ERROR_STOP=1 "$@"; }
superuser_sql() { docker exec -i "$DB_CONTAINER" psql -U supabase_admin -d postgres -XAtq -v ON_ERROR_STOP=1 "$@"; }

[[ "$(admin_sql -c "select current_user || '/' || (select rolsuper from pg_roles where rolname = current_user)")" == "postgres/false" ]] \
  || die "expected the Supabase runner identity postgres (non-superuser)"
[[ "$(admin_sql -c "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname like 'account\_%'")" == "0" ]] \
  || die "fresh stack already contains account tables"
echo "Runner identity: postgres (NOT superuser) | $(admin_sql -c 'select version()' | cut -d, -f1)"

# ---------------------------------------------------------------------------
# 3-4. Real migration runner + reproduced defects
# ---------------------------------------------------------------------------
step "Applying versioned migrations with the Supabase CLI runner (no synthetic auth bootstrap)"
set +e
first_up="$(sb migration up --local 2>&1)"
first_status=$?
set -e
echo "$first_up" | redact | grep -E '^Applying|MigrationApplyError' | sed -E 's/("message":"[^\\]*).*/\1 …"}}/'

step "D3 reproduction: accepted R13-VERIFY1 cannot be applied by the non-superuser runner"
[[ $first_status -ne 0 ]] || die "D3 no longer reproduces (VERIFY1 applied): re-evaluate the unblock and docs"
grep -q 'permission denied to set parameter \\"bibleberry.award_issuance_account\\"' <<<"$first_up" \
  || die "migration failed for an unexpected reason"
applied="$(admin_sql -c "select string_agg(version, ' ' order by version) from supabase_migrations.schema_migrations")"
[[ "$applied" == "20261116000001 20261118000000 20261118000001" ]] || die "unexpected applied set: $applied"
[[ -z "$(admin_sql -c "select to_regnamespace('account_issuance')")" ]] || die "VERIFY1 left partial state"
echo "ok - D3 reproduced: CREATE FUNCTION ... SET bibleberry.award_issuance_account denied (42501); VERIFY1 rolled back cleanly"

step "D4 reproduction: accepted R13-TX1 'GRANT USAGE ON SCHEMA auth' was a silent no-op"
[[ "$(admin_sql -c "select has_schema_privilege('account_reconciler', 'auth', 'USAGE')")" == "f" ]] \
  || die "D4 no longer reproduces: account_reconciler has auth USAGE"
# Capture first: `grep -q` closing the pipe early would SIGPIPE `docker logs` under pipefail.
db_log="$(docker logs "$DB_CONTAINER" 2>&1)"
grep -qF 'postgres@postgres WARNING:  no privileges were granted for "auth"' <<<"$db_log" \
  || die "expected the D4 WARNING in the database log"
echo "ok - D4 reproduced: account_reconciler lacks USAGE on schema auth; runner logged only a WARNING"

if [[ "${SB1_STOP_AFTER_DEFECTS:-0}" == "1" ]]; then
  echo "SB1_STOP_AFTER_DEFECTS=1: stopping before local unblocks. Real-stack acceptance NOT run."
  exit 0
fi

# ---------------------------------------------------------------------------
# 5. LOCAL-ONLY unblocks (test harness, never a migration, impossible on hosted Supabase)
# ---------------------------------------------------------------------------
step "Applying LOCAL-ONLY test unblocks as the container bootstrap superuser"
superuser_sql -c 'GRANT SET ON PARAMETER bibleberry.award_issuance_account TO postgres'
echo "  [unblock D3] GRANT SET ON PARAMETER bibleberry.award_issuance_account TO postgres"
superuser_sql -c 'GRANT USAGE ON SCHEMA auth TO account_reconciler'
echo "  [unblock D4] GRANT USAGE ON SCHEMA auth TO account_reconciler   (exactly the privilege R13-TX1 intended)"

sb migration up --local 2>&1 | redact | grep -E '^Applying|Error' || true
applied="$(admin_sql -c "select string_agg(version, ' ' order by version) from supabase_migrations.schema_migrations")"
[[ "$applied" == "20261116000001 20261118000000 20261118000001 20261118000002 20261118000003" ]] \
  || die "not all migrations applied: $applied"
echo "ok - all 5 migrations applied by the CLI runner: $applied"

step "Migration WARNING scan (database log, runner session only)"
db_log="$(docker logs "$DB_CONTAINER" 2>&1)"
warnings="$(grep -E 'postgres@postgres WARNING:' <<<"$db_log" | sed -E 's/.*WARNING:  //' | sort -u || true)"
unexpected="$warnings"
for w in "${EXPECTED_WARNINGS[@]}"; do unexpected="$(grep -vF "$w" <<<"$unexpected" || true)"; done
echo "$warnings" | sed 's/^/  WARNING: /'
[[ -z "$unexpected" ]] || die "unexpected migration warnings: $unexpected"
echo "ok - only the two known D4 warnings"

# ---------------------------------------------------------------------------
# 6. Acceptance suites
# ---------------------------------------------------------------------------
step "Running R13-SB1 suites A (GoTrue + PostgREST) and B (verifier login + issuance)"
set +e
out="$(cd "$ROOT_DIR" && node --experimental-strip-types --test --test-concurrency=1 \
  tests/accountSupabase/authPostgrestBoundary.supabase.test.ts \
  tests/accountSupabase/verifierRoleIssuance.supabase.test.ts 2>&1)"
suite_status=$?
set -e
echo "$out" | redact | grep -E '^\s*(not )?ok [0-9]+ - |^# (pass|fail|skipped)'
# A skipped suite reports "# pass 0", so require the exact number of executed passes as well.
if [[ $suite_status -ne 0 ]] || ! grep -qx '# pass 21' <<<"$out" \
   || ! grep -qx '# fail 0' <<<"$out" || ! grep -qx '# skipped 0' <<<"$out"; then
  echo "$out" | redact | grep -E 'error:|^\s{8}' | head -60 >&2
  die "R13-SB1 suites failed or were skipped"
fi

echo
echo "R13-SB1 local Supabase acceptance passed (with the documented LOCAL-ONLY unblocks for D3/D4)."
