#!/usr/bin/env bash
set -euo pipefail

# R13-SB1 (Issue #210): real disposable LOCAL Supabase security acceptance runner.
#
# What it does, in order:
#   1. Hard preflight: refuses linked/remote projects, redirecting env, missing tools.
#   2. Resource ownership: FAILS CLOSED if any container, volume or network of this project
#      already exists. It only stops/removes resources it created in this run (run-unique owner
#      label), or, with the documented opt-in SB1_DISPOSE_PREVIOUS_RUNNER_STACK=1, a previous
#      run's stack whose ownership is positively proven (see dispose_previous_runner_stack).
#   3. Starts a fresh stack on a Docker network that forces 127.0.0.1 port binding and verifies
#      every published port is loopback.
#   4. Applies ONLY the accepted, unchanged migrations with the Supabase CLI's own runner
#      (`supabase migration up --local`, identity `postgres`), WITHOUT the synthetic
#      tests/accountDatabase/00_local_supabase_auth_bootstrap.sql, and reproduces D1 → D4 one
#      at a time. After every expected failure it proves the failed migration stranded NO role,
#      membership, schema ACL or default privilege (privilege snapshot comparison).
#   5. Uses LOCAL-ONLY unblocks run as the container's bootstrap superuser (never a migration;
#      impossible on hosted Supabase). Temporary D2 schema CREATE grants are revoked again and
#      verified gone before any test runs.
#   6. Fails on any unexpected migration WARNING; runs suites A and B (exactly 21 passes).
#   7. Tears down only what this run created (SB1_KEEP_STACK=1 keeps it for inspection).
#
# Never: supabase login/link, db push, --linked, --remote, --db-url, hosted projects, real users.
# Output is redacted; no key, JWT or password is printed or written to disk by this script.
#
# Usage:  SUPABASE_CLI=/path/to/supabase ./scripts/accountSupabase/run-local-supabase-acceptance.sh
#         (defaults to `supabase` on PATH; tested with Supabase CLI 3.2.0)
# Env:    SB1_IMAGE_REGISTRY   optional image registry override (e.g. ghcr.io)
#         SB1_STOP_AFTER_DEFECTS=1  stop after reproducing D1-D4 (no D3/D4 unblock, no suites)
#         SB1_KEEP_STACK=1     leave the stack running afterwards
#         SB1_DISPOSE_PREVIOUS_RUNNER_STACK=1  dispose a stack left by an earlier run of THIS
#                              runner from THIS checkout (e.g. after SB1_KEEP_STACK=1), only if
#                              ownership is proven; anything else still fails closed.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SUPABASE_CLI="${SUPABASE_CLI:-supabase}"
NETWORK="bibleberry_sb1_loopback"
OWNER_LABEL="bibleberry.sb1.owner"
RUN_ID="run-$(date -u +%Y%m%dT%H%M%SZ)-$$-${RANDOM}"
PROJECT_ID="$(sed -nE 's/^project_id = "([^"]+)"/\1/p' "${ROOT_DIR}/supabase/config.toml")"
PROJECT_LABEL="com.supabase.cli.project=${PROJECT_ID}"
DB_CONTAINER="supabase_db_${PROJECT_ID}"
EXPECTED_WARNINGS=(
  'no privileges were granted for "auth"'   # D4: TX1 GRANT USAGE ON SCHEMA auth (silent no-op)
  'no privileges were granted for "uid"'    # D4: TX1 GRANT EXECUTE ON auth.uid() (harmless: PUBLIC has it)
)
TX1="20261118000001"
VERIFY1="20261118000002"
R13_3="20261116000001"

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
# 1. Hard preflight (no Docker or database access before these pass)
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
# 2. Resource ownership: never stop or remove anything this runner cannot prove it owns
# ---------------------------------------------------------------------------
step "Checking for pre-existing resources of project ${PROJECT_ID}"
existing_containers() { docker ps -a --filter "label=${PROJECT_LABEL}" --format '{{.Names}}'; }
existing_volumes() { docker volume ls --filter "label=${PROJECT_LABEL}" --format '{{.Name}}'; }
network_exists() { docker network inspect "$NETWORK" >/dev/null 2>&1; }
network_label() { docker network inspect "$NETWORK" --format "{{index .Labels \"$1\"}}"; }

# A stack is only disposable here if it is positively the product of an earlier run of THIS
# runner from THIS checkout: the network carries the runner's labels and loopback binding, and
# every container of the project was started by the CLI from this working directory and is
# attached to that network. Volumes are only removed together with such a proven stack.
dispose_previous_runner_stack() {
  network_exists || die "cannot prove ownership: no runner network $NETWORK"
  [[ "$(network_label bibleberry.sb1)" == "local" && -n "$(network_label "$OWNER_LABEL")" ]] \
    || die "cannot prove ownership: network $NETWORK lacks this runner's labels"
  [[ "$(docker network inspect "$NETWORK" --format '{{index .Options "com.docker.network.bridge.host_binding_ipv4"}}')" == "127.0.0.1" ]] \
    || die "cannot prove ownership: network $NETWORK does not force loopback binding"
  local containers name workdir networks
  containers="$(existing_containers)"
  [[ -n "$containers" ]] || die "cannot prove ownership: volumes/network exist without the runner's containers"
  while IFS= read -r name; do
    workdir="$(docker inspect "$name" --format '{{index .Config.Labels "com.supabase.cli.workdir"}}')"
    networks="$(docker inspect "$name" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}')"
    [[ "$workdir" == "$ROOT_DIR" ]] || die "cannot prove ownership: container $name belongs to workdir '$workdir'"
    [[ " $networks " == *" $NETWORK "* ]] || die "cannot prove ownership: container $name is not on $NETWORK"
  done <<<"$containers"
  echo "Ownership proven (runner network $(network_label "$OWNER_LABEL"), workdir $ROOT_DIR): disposing previous runner stack"
  sb stop --no-backup 2>&1 | redact | tail -1
  docker network rm "$NETWORK" >/dev/null
}

pre_containers="$(existing_containers)"; pre_volumes="$(existing_volumes)"
if [[ -n "$pre_containers" || -n "$pre_volumes" ]] || network_exists; then
  echo "Found existing resources:" >&2
  [[ -z "$pre_containers" ]] || sed 's/^/  container: /' <<<"$pre_containers" >&2
  [[ -z "$pre_volumes" ]] || sed 's/^/  volume:    /' <<<"$pre_volumes" >&2
  ! network_exists || echo "  network:   $NETWORK" >&2
  if [[ "${SB1_DISPOSE_PREVIOUS_RUNNER_STACK:-0}" == "1" ]]; then
    dispose_previous_runner_stack
    [[ -z "$(existing_containers)$(existing_volumes)" ]] && ! network_exists \
      || die "previous runner stack was not fully removed"
  else
    die "refusing to touch pre-existing resources of project ${PROJECT_ID}. If they are a stack left by this runner (SB1_KEEP_STACK=1), re-run with SB1_DISPOSE_PREVIOUS_RUNNER_STACK=1; otherwise remove them yourself after checking what they are"
  fi
fi
echo "No pre-existing resources; this run owns everything it creates (owner label ${RUN_ID})"

# ---------------------------------------------------------------------------
# 3. Fresh disposable stack, loopback-only
# ---------------------------------------------------------------------------
step "Starting a fresh disposable local stack (${PROJECT_ID})"
docker network create --label bibleberry.sb1=local --label "${OWNER_LABEL}=${RUN_ID}" \
  -o com.docker.network.bridge.host_binding_ipv4=127.0.0.1 "$NETWORK" >/dev/null
CREATED_NETWORK=1

cleanup() {
  if [[ "${SB1_KEEP_STACK:-0}" == "1" ]]; then
    echo "SB1_KEEP_STACK=1: stack left running. Dispose later with SB1_DISPOSE_PREVIOUS_RUNNER_STACK=1 or 'supabase stop --no-backup' + 'docker network rm ${NETWORK}'"
    return
  fi
  step "Teardown (only resources created by ${RUN_ID})"
  # Safe: step 2 proved no resource of this project existed before this run.
  sb stop --no-backup 2>&1 | redact | tail -1 || true
  if [[ "${CREATED_NETWORK:-0}" == "1" ]] && network_exists && [[ "$(network_label "$OWNER_LABEL")" == "$RUN_ID" ]]; then
    docker network rm "$NETWORK" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

# `supabase start` ends with a status JSON holding local keys: never echo it, even redacted.
sb start --network-id "$NETWORK" 2>&1 | grep -vE '^\{|Pulling|Pull complete|Download|Digest|Status:|Waiting|Extracting|Verifying' | redact || true

# Every published port of this project must be bound to loopback.
published="$(docker ps --filter "label=${PROJECT_LABEL}" --format '{{.Ports}}' | tr ',' '\n' | grep -- '->' || true)"
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
# 4. Accepted migrations through the real CLI runner; staged D1 → D4 reproduction
# ---------------------------------------------------------------------------
applied_set() { admin_sql -c "select coalesce(string_agg(version, ' ' order by version), '') from supabase_migrations.schema_migrations"; }

# Everything a failed migration could strand: account roles and memberships, every schema ACL,
# every default privilege. Compared before/after each expected failure.
privilege_snapshot() {
  admin_sql -c "
    SELECT concat_ws(E'\n',
      'roles: '   || coalesce((SELECT string_agg(rolname || ':' || rolcanlogin || rolsuper || rolinherit || rolbypassrls, ',' ORDER BY rolname)
                                 FROM pg_roles WHERE rolname LIKE 'account\_%'), ''),
      'members: ' || coalesce((SELECT string_agg(r.rolname || '>' || m.rolname || ':' || a.inherit_option || a.set_option || a.admin_option, ',' ORDER BY 1)
                                 FROM pg_auth_members a JOIN pg_roles r ON r.oid = a.roleid JOIN pg_roles m ON m.oid = a.member
                                WHERE r.rolname LIKE 'account\_%' OR m.rolname LIKE 'account\_%'), ''),
      -- supabase_migrations is the CLI's own history schema (created on its first run, empty ACL).
      'schemas: ' || coalesce((SELECT string_agg(nspname || '=' || coalesce(nspacl::text, ''), ';' ORDER BY nspname)
                                 FROM pg_namespace WHERE nspname <> 'supabase_migrations'), ''),
      'defacl: '  || coalesce((SELECT string_agg(defaclrole::regrole::text || '/' || defaclnamespace::text || '/' || defaclobjtype::text || '/' || defaclacl::text, ';' ORDER BY 1)
                                 FROM pg_default_acl), ''))"
}

# No account role may hold CREATE on any schema, and no default privilege may name one.
assert_no_owner_create() {
  local leaks
  leaks="$(admin_sql -c "
    SELECT concat_ws(' ',
      (SELECT string_agg(r.rolname || ' CREATE on ' || n.nspname, ', ') FROM pg_namespace n CROSS JOIN pg_roles r
        WHERE r.rolname LIKE 'account\_%' AND has_schema_privilege(r.oid, n.oid, 'CREATE')),
      (SELECT string_agg('default privilege ' || d.defaclobjtype::text || ' for ' || a.grantee::regrole::text, ', ')
         FROM pg_default_acl d, aclexplode(d.defaclacl) a
        WHERE a.grantee IN (SELECT oid FROM pg_roles WHERE rolname LIKE 'account\_%')))")"
  [[ -z "${leaks// /}" ]] || die "$1: owner-role privilege leak: $leaks"
}

# Runs the CLI migration runner, which must fail with the given error, leave exactly the given
# applied set, and add nothing to the privilege snapshot taken just before. Scope "full" compares
# the whole snapshot; "roles" compares only roles + memberships (used when an earlier migration
# legitimately succeeds in the same CLI invocation; the caller then checks residue explicitly).
expect_migration_failure() {
  local label="$1" pattern="$2" expected_applied="$3" scope="${4:-full}" before after out status
  before="$(privilege_snapshot)"
  set +e
  out="$(sb migration up --local 2>&1)"
  status=$?
  set -e
  echo "$out" | redact | grep -E '^Applying|MigrationApplyError' | sed -E 's/("message":"[^\\]*).*/\1 …"}}/'
  [[ $status -ne 0 ]] || die "$label no longer reproduces (migration succeeded): re-evaluate the unblocks and docs"
  grep -qF "$pattern" <<<"$out" || die "$label: migration failed for an unexpected reason"
  [[ "$(applied_set)" == "$expected_applied" ]] || die "$label: unexpected applied set '$(applied_set)'"
  after="$(privilege_snapshot)"
  if [[ "$scope" == "roles" ]]; then
    before="$(head -2 <<<"$before")"; after="$(head -2 <<<"$after")"
  fi
  if [[ "$before" != "$after" ]]; then
    diff <(echo "$before") <(echo "$after") >&2 || true
    die "$label: the failed migration stranded role/membership/ACL/default-privilege changes"
  fi
  local scope_text="roles/memberships"
  [[ "$scope" == "full" ]] && scope_text="roles/memberships, schema ACLs or default privileges"
  echo "ok - $label reproduced; failed migration rolled back with NO stranded ${scope_text} (snapshot identical)"
}

step "Baseline (fresh stack, before any account migration)"
assert_no_owner_create "baseline"
[[ -z "$(admin_sql -c "select string_agg(rolname, ',') from pg_roles where rolname like 'account\_%'")" ]] \
  || die "account roles already exist on a fresh stack"
echo "ok - no account roles, no owner-role CREATE or default privilege"

step "D1: accepted R13-TX1 cannot assign function ownership (CREATEROLE ADMIN-only membership)"
expect_migration_failure "D1" 'must be able to SET ROLE \"account_reconciler\"' "$R13_3"
echo "  [unblock D1] superuser pre-creates the 2 owner roles (identical attributes) and grants them to postgres WITH INHERIT TRUE, SET TRUE"
superuser_sql <<'SQL'
CREATE ROLE account_reconciler NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
CREATE ROLE account_award_issuer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
GRANT account_reconciler TO postgres WITH INHERIT TRUE, SET TRUE;
GRANT account_award_issuer TO postgres WITH INHERIT TRUE, SET TRUE;
SQL

step "D2: the new owner lacks CREATE on the function's schema"
expect_migration_failure "D2" 'permission denied for schema public' "$R13_3"
echo "  [unblock D2, TEMPORARY] superuser grants CREATE on public to account_reconciler and a default CREATE-on-schemas for account_award_issuer (revoked and verified before any test)"
superuser_sql <<'SQL'
GRANT CREATE ON SCHEMA public TO account_reconciler;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT CREATE ON SCHEMAS TO account_award_issuer;
SQL

step "D3: accepted R13-VERIFY1 placeholder GUC cannot be attached by the non-superuser runner"
expect_migration_failure "D3" 'permission denied to set parameter \"bibleberry.award_issuance_account\"' "$R13_3 $TX1" roles
# R13-TX1 applied in the same CLI run, so check every R13-VERIFY1 effect explicitly instead.
residue="$(admin_sql -c "
  SELECT concat_ws(' ',
    CASE WHEN to_regnamespace('account_issuance') IS NOT NULL THEN 'schema account_issuance' END,
    CASE WHEN to_regclass('public.account_award_admission_attestations') IS NOT NULL THEN 'attestations table' END,
    CASE WHEN to_regclass('public.account_award_verification_attempts') IS NOT NULL THEN 'attempts table' END,
    CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'account_award_verifier') THEN 'role account_award_verifier' END,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.role_table_grants WHERE grantee = 'account_award_issuer') THEN 'issuer table grants' END,
    CASE WHEN EXISTS (SELECT 1 FROM pg_policies WHERE policyname LIKE '%issuer%') THEN 'issuer policies' END,
    CASE WHEN EXISTS (SELECT 1 FROM pg_namespace n, aclexplode(n.nspacl) a
                       WHERE a.grantee = 'account_award_issuer'::regrole AND a.privilege_type = 'USAGE') THEN 'issuer schema USAGE' END,
    CASE WHEN EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                       WHERE a.grantee = 'account_award_issuer'::regrole) THEN 'issuer EXECUTE grants' END)")"
[[ -z "${residue// /}" ]] || die "D3: failed R13-VERIFY1 left residue: $residue"
echo "ok - D3: no R13-VERIFY1 schema, table, role, policy or grant survived the failure"

step "D4: accepted R13-TX1 'GRANT USAGE ON SCHEMA auth' was a silent no-op"
[[ "$(admin_sql -c "select has_schema_privilege('account_reconciler', 'auth', 'USAGE')")" == "f" ]] \
  || die "D4 no longer reproduces: account_reconciler has auth USAGE"
# Capture first: `grep -q` closing the pipe early would SIGPIPE `docker logs` under pipefail.
db_log="$(docker logs "$DB_CONTAINER" 2>&1)"
grep -qF 'postgres@postgres WARNING:  no privileges were granted for "auth"' <<<"$db_log" \
  || die "expected the D4 WARNING in the database log"
echo "ok - D4 reproduced: account_reconciler lacks USAGE on schema auth; runner logged only a WARNING"

if [[ "${SB1_STOP_AFTER_DEFECTS:-0}" == "1" ]]; then
  echo "SB1_STOP_AFTER_DEFECTS=1: stopping after D1-D4 reproduction. Real-stack acceptance NOT run."
  exit 0
fi

# ---------------------------------------------------------------------------
# 5. Remaining LOCAL-ONLY unblocks, then remove every temporary privilege
# ---------------------------------------------------------------------------
step "Applying LOCAL-ONLY D3/D4 unblocks as the container bootstrap superuser"
superuser_sql -c 'GRANT SET ON PARAMETER bibleberry.award_issuance_account TO postgres'
echo "  [unblock D3] GRANT SET ON PARAMETER bibleberry.award_issuance_account TO postgres"
superuser_sql -c 'GRANT USAGE ON SCHEMA auth TO account_reconciler'
echo "  [unblock D4] GRANT USAGE ON SCHEMA auth TO account_reconciler   (exactly the privilege R13-TX1 intended)"

sb migration up --local 2>&1 | redact | grep -E '^Applying|Error' || true
[[ "$(applied_set)" == "$R13_3 $TX1 $VERIFY1" ]] || die "not all accepted migrations applied: $(applied_set)"
echo "ok - the 3 accepted, unchanged migrations applied by the CLI runner: $(applied_set)"

step "Revoking the temporary D2 unblock and verifying no owner-role CREATE remains"
superuser_sql <<'SQL'
REVOKE CREATE ON SCHEMA public, account_private, account_issuance FROM account_reconciler, account_award_issuer;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE CREATE ON SCHEMAS FROM account_award_issuer;
SQL
assert_no_owner_create "after D2 revoke"
echo "ok - no account role holds CREATE on any schema; no default privilege names one"

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
echo "R13-SB1 local Supabase acceptance passed with the documented LOCAL-ONLY unblocks for D1-D4 (NOT deployability proof)."
