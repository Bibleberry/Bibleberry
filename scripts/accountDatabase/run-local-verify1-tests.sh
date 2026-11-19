#!/usr/bin/env bash
set -euo pipefail

# Local-only PostgreSQL integration runner for R13-VERIFY1 (Issue #208).
# Applies bootstrap + R13-3 + R13-TX1 + R13-VERIFY1 to a FRESH disposable local database, re-runs
# every earlier account suite against the combined schema (regression), then the R13-VERIFY1
# issuance SQL suite, its multi-session concurrency suite, and the TypeScript end-to-end proof
# (trusted month -> eligibility -> private admission). Never run against live/staging/production.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEST_DIR="${ROOT_DIR}/tests/accountDatabase"
MIGRATIONS=(
  "${ROOT_DIR}/supabase/migrations/20261116000001_r13_3_account_schema_and_rls.sql"
  "${ROOT_DIR}/supabase/migrations/20261118000000_r13_sb1_supabase_owner_role_prerequisite.sql"
  "${ROOT_DIR}/supabase/migrations/20261118000001_r13_tx1_account_reconciliation_transaction.sql"
  "${ROOT_DIR}/supabase/migrations/20261118000002_r13_verify1_trusted_card_admission.sql"
  "${ROOT_DIR}/supabase/migrations/20261118000003_r13_sb1_supabase_owner_role_cleanup.sql"
)

# shellcheck source=lib/local-target-guard.sh
source "${ROOT_DIR}/scripts/accountDatabase/lib/local-target-guard.sh"

if [[ -z "${LOCAL_TEST_DATABASE_URL:-}" ]]; then
  echo "ERROR: LOCAL_TEST_DATABASE_URL is not set." >&2
  echo "Example: LOCAL_TEST_DATABASE_URL='postgresql:///bibleberry_verify1_test?host=/tmp/pg&port=55432' $0" >&2
  exit 2
fi

validate_local_database_url "$LOCAL_TEST_DATABASE_URL"

for tool in psql node; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "ERROR: '$tool' is not installed or not on PATH." >&2
    exit 2
  fi
done

run_sql() {
  psql "${LOCAL_TEST_DATABASE_URL}" -X -q -v ON_ERROR_STOP=1 "$@"
}

filter_assertions() {
  sed -E 's/^psql:[^ ]+: //; s/^NOTICE:  //' | grep -E '^(ok - |R13)|ERROR|FAILED'
}

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

echo "== R13-3 regression suite (combined schema)"
run_sql -f "${TEST_DIR}/01_r13_3_rls_and_schema_integration.sql"

echo "== R13-TX1 regression: auth / grant / isolation"
(cd "$TEST_DIR" && run_sql -f 02_r13_tx1_auth_grants_and_isolation.sql) 2>&1 | filter_assertions

echo "== R13-TX1 regression: transaction invariants"
(cd "$TEST_DIR" && run_sql -f 03_r13_tx1_transaction_invariants.sql) 2>&1 | filter_assertions

echo "== R13-TX1 regression: multi-session concurrency"
LOCAL_TEST_DATABASE_URL="$LOCAL_TEST_DATABASE_URL" "${TEST_DIR}/04_r13_tx1_concurrency.sh"

echo "== R13-VERIFY1 issuance security & lifecycle"
(cd "$TEST_DIR" && run_sql -f 05_r13_verify1_issuance_security_and_lifecycle.sql) 2>&1 | filter_assertions

echo "== R13-VERIFY1 multi-session concurrency"
LOCAL_TEST_DATABASE_URL="$LOCAL_TEST_DATABASE_URL" "${TEST_DIR}/06_r13_verify1_concurrency.sh"

echo "== R13-VERIFY1 end-to-end: trusted month -> eligibility -> private admission"
E2E_OUTPUT="$(cd "$ROOT_DIR" && LOCAL_TEST_DATABASE_URL="$LOCAL_TEST_DATABASE_URL" \
  node --experimental-strip-types --test tests/accountVerification/verifierPostgres.integration.ts 2>&1)"
echo "$E2E_OUTPUT" | grep -E '^(ok|not ok) |^# (pass|fail|skipped)'
# A skipped end-to-end proof is a failure, not a pass.
grep -qx '# pass 1' <<<"$E2E_OUTPUT" && grep -qx '# fail 0' <<<"$E2E_OUTPUT" && grep -qx '# skipped 0' <<<"$E2E_OUTPUT" \
  || { echo "ERROR: end-to-end proof did not run and pass" >&2; exit 1; }

echo "R13-VERIFY1 local PostgreSQL integration suite passed."
