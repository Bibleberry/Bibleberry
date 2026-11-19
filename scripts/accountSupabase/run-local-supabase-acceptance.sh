#!/usr/bin/env bash
set -euo pipefail

# R13-SB1 (Issue #210) / R13-SB2 (Issue #225): real disposable LOCAL Supabase acceptance runner.
#
# What it does, in order:
#   1. Hard preflight: refuses linked/remote projects, redirecting env, missing tools.
#   2. Resource ownership: FAILS CLOSED if any container, volume or network of this project
#      already exists. It only stops/removes resources it created in this run (run-unique owner
#      label), or, with the documented opt-in SB1_DISPOSE_PREVIOUS_RUNNER_STACK=1, a previous
#      run's stack whose ownership is positively proven (see dispose_previous_runner_stack).
#   3. Starts a fresh stack on a Docker network that forces 127.0.0.1 port binding and verifies
#      every published port is loopback.
#   4. Applies R13-3, R13-TX1 and R13-VERIFY1 (with the R13-SB2 D1-D4 corrections) with the
#      Supabase CLI's own runner (`supabase migration up --local`, identity `postgres`, NOT
#      superuser), WITHOUT tests/accountDatabase/00_local_supabase_auth_bootstrap.sql, with ZERO
#      pre-unblocks: this script has no superuser access path at all (no `docker exec`).
#   5. Fails on ANY WARNING/ERROR from the migration session, then runs the D1-D4 catalog and
#      runtime checks (tests/accountSupabase/sb2RemediationChecks.sql) as postgres, rolled back.
#   6. Runs suites A, B and C over real GoTrue/PostgREST and a dedicated verifier login.
#   7. Tears down only what this run created (SB1_KEEP_STACK=1 keeps it for inspection).
#
#   SB2_MUTATION_DEMOS=1 replaces steps 4-6 with mutation/regression demonstrations on the fresh
#   stack: each restores one D1-D4 defect in a throw-away copy of supabase/ (never the checkout)
#   and must be caught by the CLI runner (with the failed migration proven to strand nothing) or by
#   the D1-D4 checks inside a rolled-back transaction.
#
# Never: supabase login/link, db push, --linked, --remote, --db-url, hosted projects, real users.
# Output is redacted; no key, JWT or password is printed or written to disk by this script.
#
# Usage:  SUPABASE_CLI=/path/to/supabase ./scripts/accountSupabase/run-local-supabase-acceptance.sh
#         (defaults to `supabase` on PATH; tested with Supabase CLI 3.2.0)
# Env:    SB1_IMAGE_REGISTRY   optional image registry override (e.g. ghcr.io)
#         SB2_MUTATION_DEMOS=1 run the mutation demonstrations instead of the acceptance suites
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

[[ "$(admin_sql -c "select current_user || '/' || (select rolsuper from pg_roles where rolname = current_user)")" == "postgres/false" ]] \
  || die "expected the Supabase runner identity postgres (non-superuser)"
[[ "$(admin_sql -c "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname like 'account\_%'")" == "0" ]] \
  || die "fresh stack already contains account tables"
echo "Runner identity: postgres (NOT superuser) | $(admin_sql -c 'select version()' | cut -d, -f1)"
# ---------------------------------------------------------------------------
# 4. Shared helpers: applied set, privilege snapshot, owner-CREATE scan, expected failure
# ---------------------------------------------------------------------------
# Probes for the CLI's history table first, so no query ever errors (and pollutes the DB log).
applied_set() {
  if [[ "$(admin_sql -c "select to_regclass('supabase_migrations.schema_migrations') is not null")" == "t" ]]; then
    admin_sql -c "select coalesce(string_agg(version, ' ' order by version), '') from supabase_migrations.schema_migrations"
  fi
}

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
                                 FROM pg_default_acl), ''),
      'paramacl: ' || coalesce((SELECT string_agg(parname || '=' || coalesce(paracl::text, ''), ';' ORDER BY parname)
                                 FROM pg_parameter_acl), ''))"
}

# No account role may hold CREATE on any schema, and no default privilege may name one.
assert_no_owner_create() {
  local leaks
  leaks="$(admin_sql -c "
    SELECT concat_ws(' ',
      (SELECT string_agg(r.rolname || ' CREATE on ' || n.nspname, ', ') FROM pg_namespace n CROSS JOIN pg_roles r
        WHERE r.rolname LIKE 'account\_%' AND has_schema_privilege(r.oid, n.oid, 'CREATE')
          AND n.nspname !~ '^pg_(toast_)?temp_'),
      (SELECT string_agg('default privilege ' || d.defaclobjtype::text || ' for ' || a.grantee::regrole::text, ', ')
         FROM pg_default_acl d, aclexplode(d.defaclacl) a
        WHERE a.grantee IN (SELECT oid FROM pg_roles WHERE rolname LIKE 'account\_%')))")"
  [[ -z "${leaks// /}" ]] || die "$1: owner-role privilege leak: $leaks"
}

# Every R13-VERIFY1 effect a failed VERIFY1 could strand (used when TX1 applied in the same run).
verify1_residue() {
  admin_sql -c "
    SELECT concat_ws(' ',
      CASE WHEN to_regnamespace('account_issuance') IS NOT NULL THEN 'schema account_issuance' END,
      CASE WHEN to_regclass('public.account_award_admission_attestations') IS NOT NULL THEN 'attestations table' END,
      CASE WHEN to_regclass('public.account_award_verification_attempts') IS NOT NULL THEN 'attempts table' END,
      CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('account_award_verifier', 'account_award_issuer')) THEN 'issuer/verifier role' END,
      CASE WHEN EXISTS (SELECT 1 FROM pg_policies WHERE policyname LIKE '%issuer%') THEN 'issuer policies' END,
      CASE WHEN EXISTS (SELECT 1 FROM pg_parameter_acl WHERE parname LIKE 'bibleberry.%') THEN 'parameter ACL' END)"
}

# Runs the CLI migration runner from WORKDIR (the checkout, or a throw-away mutated copy of
# supabase/), which must fail with the given error, leave exactly the given applied set, and add
# nothing to the privilege snapshot taken just before. Scope "full" compares the whole snapshot;
# "roles" compares roles + memberships only (an earlier migration legitimately succeeded in the
# same CLI run); the caller then checks the residue explicitly.
expect_migration_failure() {
  local label="$1" workdir="$2" pattern="$3" expected_applied="$4" scope="${5:-full}" before after out status
  [[ -n "$workdir" && -d "$workdir/supabase/migrations" ]] || die "$label: no migration workdir (mutation failed to build?)"
  before="$(privilege_snapshot)"
  set +e
  out="$("$SUPABASE_CLI" --workdir "$workdir" migration up --local 2>&1)"
  status=$?
  set -e
  echo "$out" | redact | grep -E '^Applying|MigrationApplyError' | sed -E 's/("message":"[^\\]*).*/\1 …"}}/;s/^/    /'
  [[ $status -ne 0 ]] || die "$label: the migration unexpectedly succeeded"
  grep -qF "$pattern" <<<"$out" || die "$label: migration failed for an unexpected reason (wanted: $pattern)"
  [[ "$(applied_set)" == "$expected_applied" ]] || die "$label: unexpected applied set '$(applied_set)'"
  after="$(privilege_snapshot)"
  if [[ "$scope" == "roles" ]]; then
    before="$(head -2 <<<"$before")"; after="$(head -2 <<<"$after")"
  fi
  if [[ "$before" != "$after" ]]; then
    diff <(echo "$before") <(echo "$after") >&2 || true
    die "$label: the failed migration stranded role/membership/ACL/default-privilege changes"
  fi
  assert_no_owner_create "$label"
  echo "ok - $label: failed as expected and rolled back with nothing stranded"
}

CHECKS_SQL="${ROOT_DIR}/tests/accountSupabase/sb2RemediationChecks.sql"
[[ -f "$CHECKS_SQL" ]] || die "missing $CHECKS_SQL"

# The D1-D4 checks always run inside a transaction that is rolled back.
run_checks() {
  { echo 'BEGIN;'; cat "$CHECKS_SQL"; echo 'ROLLBACK;'; } | admin_sql 2>&1 | sed -E 's/^psql:[^ ]+ //; s/^NOTICE:  //'
  return "${PIPESTATUS[1]}"
}

step "Baseline (fresh stack, before any account migration)"
assert_no_owner_create "baseline"
[[ -z "$(admin_sql -c "select string_agg(rolname, ',') from pg_roles where rolname like 'account\_%'")" ]] \
  || die "account roles already exist on a fresh stack"
[[ -z "$(applied_set)" ]] || die "fresh stack already has migration history"
echo "ok - no account roles, no migration history, no owner-role CREATE or default privilege"

if [[ "${SB2_MUTATION_DEMOS:-0}" == "1" ]]; then
  # -------------------------------------------------------------------------
  # 5M. Mutation / regression demonstrations (separate run; no suites)
  # -------------------------------------------------------------------------
  # Each demo restores one insecure/buggy behaviour in a THROW-AWAY copy of supabase/ (never the
  # checkout) and proves the CLI runner or the D1-D4 checks catch it, as the real non-superuser
  # identity `postgres`, with no superuser access and nothing stranded.
  MUT_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/bibleberry-sb2-mutations.XXXXXX")"
  trap 'rm -rf "$MUT_ROOT"; cleanup' EXIT
  mutant() { # name file perl-substitution -> echoes a workdir holding the mutated migration set
    local dir="$MUT_ROOT/$1" target
    mkdir -p "$dir/supabase"
    cp "${ROOT_DIR}/supabase/config.toml" "$dir/supabase/"
    cp -R "${ROOT_DIR}/supabase/migrations" "$dir/supabase/"
    case "$2" in
      TX1) target="$dir/supabase/migrations/${TX1}_r13_tx1_account_reconciliation_transaction.sql" ;;
      VERIFY1) target="$dir/supabase/migrations/${VERIFY1}_r13_verify1_trusted_card_admission.sql" ;;
      *) die "unknown mutation target $2" ;;
    esac
    cp "$target" "$target.orig"
    perl -0pi -e "$3" "$target"
    ! cmp -s "$target" "$target.orig" || die "mutation $1 did not change $2"
    rm -f "$target.orig"
    echo "$dir"
  }
  # Mutated TX1+VERIFY1 bodies + the checks, in ONE transaction that always rolls back.
  expect_check_failure() { # label workdir pattern
    local label="$1" dir="$2" pattern="$3" before after out status
  [[ -n "$dir" && -d "$dir/supabase/migrations" ]] || die "$label: no migration workdir (mutation failed to build?)"
    before="$(privilege_snapshot)"
    set +e
    out="$({ echo 'BEGIN;'
             for v in "$TX1" "$VERIFY1"; do grep -vxE 'BEGIN;|COMMIT;' "$dir"/supabase/migrations/"$v"_*.sql; done
             cat "$CHECKS_SQL"; echo 'ROLLBACK;'; } | admin_sql 2>&1)"
    status=$?
    set -e
    after="$(privilege_snapshot)"
    [[ "$before" == "$after" ]] || die "$label: rolled-back demo changed the catalog"
    if [[ -z "$pattern" ]]; then
      [[ $status -eq 0 ]] || { echo "$out" | redact | tail -5 >&2; die "$label: positive control failed"; }
      echo "ok - $label: unmutated migrations pass every D1-D4 check (rolled back)"
      return
    fi
    [[ $status -ne 0 ]] || die "$label: the mutation was NOT detected"
    grep -qF "$pattern" <<<"$out" || { echo "$out" | redact | grep -E 'ERROR' >&2; die "$label: failed for an unexpected reason (wanted: $pattern)"; }
    echo "ok - $label: detected ($(grep -m1 -oE 'ERROR: .{0,110}' <<<"$out" | redact))"
  }

  step "Mutations caught by the CLI migration runner (R13-3 commits on the first run; TX1 must roll back)"
  expect_migration_failure "M-D1 restore the 'MEMBER' self-grant guard (TX1)" \
    "$(mutant d1 TX1 "s/NOT \(pg_has_role\(current_user, 'account_reconciler', 'SET'\)\s+AND pg_has_role\(current_user, 'account_reconciler', 'USAGE'\)\)/NOT pg_has_role(current_user, 'account_reconciler', 'MEMBER')/g")" \
    'must be able to SET ROLE' "$R13_3"
  expect_migration_failure "M-D2a drop the owner-transfer CREATE grant (TX1)" \
    "$(mutant d2a TX1 's/^GRANT CREATE ON SCHEMA public TO account_reconciler;\n//m')" \
    'permission denied for schema public' "$R13_3"
  expect_migration_failure "M-D2b drop the CREATE revoke (TX1)" \
    "$(mutant d2b TX1 's/^REVOKE CREATE ON SCHEMA public FROM account_reconciler;\n//m')" \
    'R13-SB2 D2: owner role retains schema CREATE' "$R13_3"
  expect_migration_failure "M-RB forced failure right after the temporary CREATE grant (TX1)" \
    "$(mutant rb TX1 's/^(GRANT CREATE ON SCHEMA public TO account_reconciler;\n)/$1DO \$\$ BEGIN RAISE EXCEPTION \x27SB2 forced failure after D2 grant\x27; END \$\$;\n/m')" \
    'SB2 forced failure after D2 grant' "$R13_3"

  step "Mutations that apply but are caught by the D1-D4 checks (single rolled-back transaction)"
  expect_check_failure "M-CTRL positive control (unmutated)" "$(mutant ctrl TX1 's/^(-- Bibleberry R13-TX1)/$1 [sb2 control copy]/m')" ""
  expect_check_failure "M-D4a reconcile body calls auth.uid() directly again (TX1)" \
    "$(mutant d4a TX1 's/v_uid uuid := account_private\.request_account_id\(\);/v_uid uuid := auth.uid();/')" \
    'permission denied for schema auth'
  expect_check_failure "M-D4b a reconciler policy calls auth.uid() directly again (TX1)" \
    "$(mutant d4b TX1 's/(ON public\.account_shelf_months FOR ALL TO account_reconciler\n  USING \(account_id = )account_private\.request_account_id\(\)/$1auth.uid()/')" \
    'SB2-CHECK D4e'
  # (A widening placed before TX1's blanket account_private REVOKEs is neutralised by them; this
  #  one is placed after every revoke so it really survives.)
  expect_check_failure "M-D4c bridge EXECUTE widened to service_role after every revoke (TX1)" \
    "$(mutant d4c TX1 's/^(COMMENT ON FUNCTION public\.reconcile_guest_participation)/GRANT EXECUTE ON FUNCTION account_private.request_account_id() TO service_role;\n$1/m')" \
    'SB2-CHECK D4b'
  expect_check_failure "M-D4d issuer keeps the bridge via the account_private grant (VERIFY1)" \
    "$(mutant d4d VERIFY1 's/^REVOKE EXECUTE ON FUNCTION account_private\.request_account_id\(\) FROM account_award_issuer;\n//m')" \
    'SB2-CHECK D4b'
  expect_check_failure "M-D4e bridge body widened beyond auth.uid() (TX1)" \
    "$(mutant d4e TX1 's/  SELECT auth\.uid\(\);\n\$\$;/  SELECT coalesce(auth.uid(), (SELECT id FROM auth.users LIMIT 1));\n\$\$;/')" \
    'SB2-CHECK D4a'
  expect_check_failure "M-D3a remove the fail-closed entry resets (VERIFY1)" \
    "$(mutant d3a VERIFY1 's/^  PERFORM set_config\(\x27bibleberry\.award_issuance_account\x27, \x27\x27, true\);\n//mg')" \
    'SB2-CHECK D3c'

  step "Mutations caught by the CLI runner on R13-VERIFY1 (unmutated R13-TX1 applied alone first)"
  tx1_only="$MUT_ROOT/tx1-only"
  mkdir -p "$tx1_only/supabase/migrations"
  cp "${ROOT_DIR}/supabase/config.toml" "$tx1_only/supabase/"
  cp "${ROOT_DIR}"/supabase/migrations/{"$R13_3","$TX1"}_*.sql "$tx1_only/supabase/migrations/"
  "$SUPABASE_CLI" --workdir "$tx1_only" migration up --local 2>&1 | redact | grep -E '^Applying|Error' | sed 's/^/    /' || true
  [[ "$(applied_set)" == "$R13_3 $TX1" ]] || die "unmutated R13-TX1 did not apply on its own: $(applied_set)"
  assert_no_owner_create "after R13-TX1 alone"
  echo "ok - unmutated R13-TX1 applied on its own with no owner-role CREATE left"
  expect_migration_failure "M-D3b restore the function-level placeholder GUC clause (VERIFY1)" \
    "$(mutant d3b VERIFY1 's/^(SECURITY DEFINER\nSET search_path = \x27\x27\nSET lock_timeout = \x275s\x27\n)(AS \$\$\nDECLARE\n  v_ceiling)/$1SET bibleberry.award_issuance_account TO \x27\x27\n$2/m')" \
    'permission denied to set parameter' "$R13_3 $TX1"
  [[ -z "$(verify1_residue | tr -d ' ')" ]] || die "M-D3b: failed R13-VERIFY1 left residue: $(verify1_residue)"
  expect_migration_failure "M-D2c drop the account_issuance CREATE revoke (VERIFY1)" \
    "$(mutant d2c VERIFY1 's/^REVOKE CREATE ON SCHEMA account_issuance FROM account_award_issuer;\n//m')" \
    'R13-SB2 D2: owner role retains schema CREATE' "$R13_3 $TX1"
  [[ -z "$(verify1_residue | tr -d ' ')" ]] || die "M-D2c: failed R13-VERIFY1 left residue: $(verify1_residue)"

  step "Unmutated R13-VERIFY1 still applies after the failed attempts"
  sb migration up --local 2>&1 | redact | grep -E '^Applying|Error' | sed 's/^/    /' || true
  [[ "$(applied_set)" == "$R13_3 $TX1 $VERIFY1" ]] || die "remaining migration did not apply: $(applied_set)"
  assert_no_owner_create "after mutation demos"
  run_checks | grep -E '^ok - |SB2 remediation|ERROR' | sed 's/^/    /' || die "D1-D4 checks failed after the demos"
  echo
  echo "R13-SB2 mutation demonstrations passed: every restored defect was caught; nothing was stranded."
  exit 0
fi

# ---------------------------------------------------------------------------
# 5. The accepted migrations through the real CLI runner: zero unblocks, zero warnings
# ---------------------------------------------------------------------------
step "Applying R13-3, R13-TX1, R13-VERIFY1 with 'supabase migration up --local' (identity postgres, no pre-unblock)"
apply_started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
set +e
out="$(sb migration up --local 2>&1)"
status=$?
set -e
echo "$out" | redact | grep -E '^Applying|Error' | sed 's/^/    /' || true
[[ $status -eq 0 ]] || { echo "$out" | redact | tail -5 >&2; die "the migrations did not apply under the real Supabase runner"; }
[[ "$(applied_set)" == "$R13_3 $TX1 $VERIFY1" ]] || die "unexpected applied set: $(applied_set)"
echo "ok - all 3 migrations applied, in order, by the CLI runner: $(applied_set)"

step "Migration WARNING scan (database log, runner session, this apply only)"
# Capture first: `grep -q` closing the pipe early would SIGPIPE `docker logs` under pipefail.
db_log="$(docker logs --since "$apply_started" "$DB_CONTAINER" 2>&1)"
# Zero WARNINGs, zero ERRORs. The single allowed line is the CLI's OWN first-run probe of its
# history table on a fresh database (`SELECT version FROM supabase_migrations.schema_migrations`,
# immediately followed by its `CREATE SCHEMA IF NOT EXISTS supabase_migrations`).
CLI_HISTORY_PROBE='ERROR: relation "supabase_migrations.schema_migrations" does not exist at character 21'
warnings="$(grep -E 'postgres@postgres (WARNING|ERROR):' <<<"$db_log" | sed -E 's/.*(WARNING|ERROR):  /\1: /' \
            | grep -vxF "$CLI_HISTORY_PROBE" | sort -u || true)"
[[ -z "$warnings" ]] || { echo "$warnings" | sed 's/^/  /' >&2; grep -E -A2 'postgres@postgres (WARNING|ERROR):' <<<"$db_log" | redact | head -20 >&2; die "the migration session logged warnings/errors"; }
echo "ok - zero WARNING and zero ERROR lines from the migration session (besides the CLI's own history-table probe)"

step "Post-apply catalog: no owner-role CREATE; D1-D4 checks as postgres (rolled back)"
assert_no_owner_create "after apply"
run_checks | grep -E '^ok - |SB2 remediation|ERROR' | sed 's/^/    /' || die "D1-D4 checks failed"

# ---------------------------------------------------------------------------
# 6. Acceptance suites
# ---------------------------------------------------------------------------
SUITE_PASS_EXPECTED=29
step "Running suites A (GoTrue + PostgREST), B (verifier login + issuance), C (R13-SB2 D1-D4)"
set +e
out="$(cd "$ROOT_DIR" && node --experimental-strip-types --test --test-concurrency=1 \
  tests/accountSupabase/authPostgrestBoundary.supabase.test.ts \
  tests/accountSupabase/verifierRoleIssuance.supabase.test.ts \
  tests/accountSupabase/migrationRemediation.supabase.test.ts 2>&1)"
suite_status=$?
set -e
echo "$out" | redact | grep -E '^\s*(not )?ok [0-9]+ - |^# (pass|fail|skipped)'
# A skipped suite reports "# pass 0", so require the exact number of executed passes as well.
if [[ $suite_status -ne 0 ]] || ! grep -qx "# pass ${SUITE_PASS_EXPECTED}" <<<"$out" \
   || ! grep -qx '# fail 0' <<<"$out" || ! grep -qx '# skipped 0' <<<"$out"; then
  echo "$out" | redact | grep -E 'error:|^\s{8}' | head -60 >&2
  die "suites failed or were skipped"
fi

echo
echo "R13-SB2 local Supabase acceptance passed: corrected migrations apply with ZERO unblocks and ZERO warnings (local stack only; NOT hosted deployability proof)."
