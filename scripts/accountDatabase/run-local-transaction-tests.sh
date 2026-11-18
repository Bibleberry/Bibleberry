#!/usr/bin/env bash
set -euo pipefail

# Local-only PostgreSQL integration runner for R13-TX1 (Issue #206).
# Applies bootstrap + every account migration to a FRESH disposable local database, re-runs
# the R13-3 suite against the full schema, then runs the R13-TX1 security, invariant and
# concurrency suites. Never run this against a live/staging/production Supabase database.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEST_DIR="${ROOT_DIR}/tests/accountDatabase"
MIGRATIONS=(
  "${ROOT_DIR}/supabase/migrations/20261116000001_r13_3_account_schema_and_rls.sql"
  "${ROOT_DIR}/supabase/migrations/20261118000001_r13_tx1_account_reconciliation_transaction.sql"
)

# shellcheck source=lib/local-target-guard.sh
source "${ROOT_DIR}/scripts/accountDatabase/lib/local-target-guard.sh"

if [[ -z "${LOCAL_TEST_DATABASE_URL:-}" ]]; then
  echo "ERROR: LOCAL_TEST_DATABASE_URL is not set." >&2
  echo "Example: LOCAL_TEST_DATABASE_URL='postgresql:///bibleberry_tx1_test?host=/tmp/pg&port=55432' $0" >&2
  exit 2
fi

validate_local_database_url "$LOCAL_TEST_DATABASE_URL"

if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: 'psql' is not installed or not on PATH." >&2
  exit 2
fi

run_sql() {
  psql "${LOCAL_TEST_DATABASE_URL}" -X -q -v ON_ERROR_STOP=1 "$@"
}

# Refuse to touch a database that already holds account schema: the suite needs a fresh,
# disposable target and must never mutate an existing environment.
existing="$(psql "${LOCAL_TEST_DATABASE_URL}" -XAtq -v ON_ERROR_STOP=1 \
  -c "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname LIKE 'account\_%'")"
if [[ "$existing" != "0" ]]; then
  echo "ERROR: target database already contains public.account_* objects; use a fresh disposable database." >&2
  exit 2
fi

echo "== Local auth bootstrap"
run_sql -f "${TEST_DIR}/00_local_supabase_auth_bootstrap.sql"

for migration in "${MIGRATIONS[@]}"; do
  echo "== Applying $(basename "$migration")"
  run_sql -f "$migration"
done

echo "== R13-3 regression suite against the full migrated schema"
run_sql -f "${TEST_DIR}/01_r13_3_rls_and_schema_integration.sql"

echo "== R13-TX1 auth / grant / isolation suite"
(cd "$TEST_DIR" && run_sql -f 02_r13_tx1_auth_grants_and_isolation.sql) 2>&1 | sed -E 's/^psql:[^ ]+: //; s/^NOTICE:  //' | grep -E '^(ok - |R13-TX1)|ERROR|FAILED'

echo "== R13-TX1 transaction invariant suite"
(cd "$TEST_DIR" && run_sql -f 03_r13_tx1_transaction_invariants.sql) 2>&1 | sed -E 's/^psql:[^ ]+: //; s/^NOTICE:  //' | grep -E '^(ok - |R13-TX1)|ERROR|FAILED'

echo "== R13-TX1 multi-session concurrency suite"
LOCAL_TEST_DATABASE_URL="$LOCAL_TEST_DATABASE_URL" "${TEST_DIR}/04_r13_tx1_concurrency.sh"

echo "R13-TX1 local PostgreSQL integration suite passed."
