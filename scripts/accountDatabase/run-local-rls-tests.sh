#!/usr/bin/env bash
set -euo pipefail

# Local-only PostgreSQL RLS & schema integration test runner for R13-3.
# Never run this script against a live/staging/production Supabase database.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: 'psql' is not installed or not on PATH." >&2
  echo "Install PostgreSQL client tools (and a local PostgreSQL server) to run live RLS tests." >&2
  exit 2
fi

if [[ -z "${LOCAL_TEST_DATABASE_URL:-}" ]]; then
  echo "ERROR: LOCAL_TEST_DATABASE_URL is not set." >&2
  echo "Example: LOCAL_TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/bibleberry_r13_test $0" >&2
  exit 2
fi

echo "Running R13-3 local auth bootstrap..."
psql "${LOCAL_TEST_DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${ROOT_DIR}/tests/accountDatabase/00_local_supabase_auth_bootstrap.sql"

echo "Applying R13-3 migration..."
psql "${LOCAL_TEST_DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${ROOT_DIR}/supabase/migrations/20261116000001_r13_3_account_schema_and_rls.sql"

echo "Running R13-3 RLS & constraint integration suite..."
psql "${LOCAL_TEST_DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${ROOT_DIR}/tests/accountDatabase/01_r13_3_rls_and_schema_integration.sql"

echo "R13-3 local PostgreSQL integration suite passed."
