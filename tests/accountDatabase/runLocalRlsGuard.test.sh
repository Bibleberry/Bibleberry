#!/usr/bin/env bash
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

run_guard() {
  env -u PGHOST -u PGHOSTADDR -u PGSERVICE -u PGSERVICEFILE \
    PATH="$TEST_DIR/bin:$PATH" \
    PSQL_INVOCATION_LOG="$TEST_DIR/psql.log" \
    LOCAL_TEST_DATABASE_URL="$1" \
    "$ROOT_DIR/scripts/accountDatabase/run-local-rls-tests.sh" >/dev/null 2>&1
}

assert_accepted() {
  : > "$TEST_DIR/psql.log"
  run_guard "$1"
  [[ "$(wc -l < "$TEST_DIR/psql.log")" -eq 3 ]] || {
    echo "Expected accepted target to invoke three SQL scripts: $1" >&2
    exit 1
  }
}

assert_rejected() {
  : > "$TEST_DIR/psql.log"
  if run_guard "$1"; then
    echo "Expected target rejection: $1" >&2
    exit 1
  fi
  [[ ! -s "$TEST_DIR/psql.log" ]] || {
    echo "Rejected target invoked psql before validation: $1" >&2
    exit 1
  }
}

assert_accepted 'postgres://postgres:postgres@127.0.0.1:5432/bibleberry_r13_test'
assert_accepted 'postgresql://postgres@localhost/bibleberry_r13_test'
assert_accepted 'postgresql://postgres@[::1]:5432/bibleberry_r13_test'
assert_accepted 'postgresql:///bibleberry_r13_test?host=/tmp/bibleberry-postgres&port=55432'
assert_accepted 'postgresql:///bibleberry_r13_test?host=%2Ftmp%2Fbibleberry-postgres'
assert_accepted 'host=/tmp/bibleberry-postgres port=55432 dbname=bibleberry_r13_test'

assert_rejected 'postgresql://postgres@example.com/bibleberry_r13_test'
assert_rejected 'postgresql://example.com/bibleberry_r13_test?host=/tmp/bibleberry-postgres'
assert_rejected 'postgresql:///bibleberry_r13_test?host=/tmp/bibleberry-postgres&hostaddr=203.0.113.10'
assert_rejected 'postgresql:///bibleberry_r13_test'
assert_rejected 'host=db.example.com dbname=bibleberry_r13_test'
assert_rejected 'service=production'

: > "$TEST_DIR/psql.log"
if env PGHOST=db.example.com \
  PATH="$TEST_DIR/bin:$PATH" \
  PSQL_INVOCATION_LOG="$TEST_DIR/psql.log" \
  LOCAL_TEST_DATABASE_URL='postgresql:///bibleberry_r13_test?host=/tmp/bibleberry-postgres' \
  "$ROOT_DIR/scripts/accountDatabase/run-local-rls-tests.sh" >/dev/null 2>&1; then
  echo 'Expected PGHOST override rejection' >&2
  exit 1
fi
[[ ! -s "$TEST_DIR/psql.log" ]] || {
  echo 'PGHOST rejection invoked psql before validation' >&2
  exit 1
}

echo 'Local PostgreSQL target guard tests passed.'
