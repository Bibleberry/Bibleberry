#!/usr/bin/env bash
# Verifies the R13-VERIFY1 runner refuses remote/ambiguous targets BEFORE invoking psql.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEST_DIR="$(mktemp -d)"
trap 'rm -rf "$TEST_DIR"' EXIT

mkdir "$TEST_DIR/bin"
cat > "$TEST_DIR/bin/psql" <<'MOCK'
#!/usr/bin/env bash
echo invoked >> "${PSQL_INVOCATION_LOG:?}"
MOCK
chmod +x "$TEST_DIR/bin/psql"

assert_rejected() {
  : > "$TEST_DIR/psql.log"
  if env -u PGHOST -u PGHOSTADDR -u PGSERVICE -u PGSERVICEFILE \
    PATH="$TEST_DIR/bin:$PATH" PSQL_INVOCATION_LOG="$TEST_DIR/psql.log" \
    LOCAL_TEST_DATABASE_URL="$1" \
    "$ROOT_DIR/scripts/accountDatabase/run-local-verify1-tests.sh" >/dev/null 2>&1; then
    echo "Expected target rejection: $1" >&2
    exit 1
  fi
  [[ ! -s "$TEST_DIR/psql.log" ]] || { echo "Rejected target invoked psql: $1" >&2; exit 1; }
}

assert_rejected 'postgresql://postgres@example.com/bibleberry_verify1_test'
assert_rejected 'postgres://postgres:postgres@db.abcdefgh.supabase.co:5432/postgres'
assert_rejected 'postgresql:///bibleberry_verify1_test?host=/tmp/pg&hostaddr=203.0.113.10'
assert_rejected 'postgresql:///bibleberry_verify1_test'
assert_rejected 'service=production'

: > "$TEST_DIR/psql.log"
if env PGHOST=db.example.com PATH="$TEST_DIR/bin:$PATH" PSQL_INVOCATION_LOG="$TEST_DIR/psql.log" \
  LOCAL_TEST_DATABASE_URL='postgresql:///bibleberry_verify1_test?host=/tmp/pg' \
  "$ROOT_DIR/scripts/accountDatabase/run-local-verify1-tests.sh" >/dev/null 2>&1; then
  echo 'Expected PGHOST override rejection' >&2
  exit 1
fi
[[ ! -s "$TEST_DIR/psql.log" ]] || { echo 'PGHOST rejection invoked psql' >&2; exit 1; }

echo 'R13-VERIFY1 local PostgreSQL target guard tests passed.'
