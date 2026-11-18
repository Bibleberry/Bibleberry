#!/usr/bin/env bash
set -euo pipefail

# Local-only PostgreSQL RLS & schema integration test runner for R13-3.
# Never run this script against a live/staging/production Supabase database.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

fail_unsafe_target() {
  echo "ERROR: Refusing LOCAL_TEST_DATABASE_URL because its database destination is remote or ambiguous." >&2
  echo "Use an explicit local Unix socket (host=/path) or loopback host (localhost, 127.0.0.1, or ::1)." >&2
  echo "Unset PGHOST, PGHOSTADDR, PGSERVICE, and PGSERVICEFILE before running this local-only suite." >&2
  exit 2
}

is_local_host() {
  local host="${1,,}"

  host="${host//%2f//}"
  host="${host//%3a/:}"
  host="${host//%5b/[}"
  host="${host//%5d/]}"

  [[ "$host" == "localhost" \
    || "$host" == "127.0.0.1" \
    || "$host" == "::1" \
    || "$host" == "[::1]" \
    || "$host" == /* ]]
}

validate_local_database_url() {
  local connection="$1"
  local remainder authority query destination value
  local -a destinations=() parameters=()

  # libpq environment variables can silently provide or redirect a destination.
  if [[ -n "${PGHOST:-}" || -n "${PGHOSTADDR:-}" \
    || -n "${PGSERVICE:-}" || -n "${PGSERVICEFILE:-}" ]]; then
    fail_unsafe_target
  fi

  if [[ "$connection" =~ ^postgres(ql)?:// ]]; then
    remainder="${connection#*://}"
    authority="${remainder%%[/?]*}"
    query=""
    [[ "$remainder" == *\?* ]] && query="${remainder#*\?}"

    if [[ -n "$authority" ]]; then
      destination="${authority##*@}"
      if [[ "$destination" == \[*\]* ]]; then
        destination="${destination%%]*}]"
      else
        destination="${destination%%:*}"
      fi
      destinations+=("$destination")
    fi

    IFS='&' read -r -a parameters <<< "$query"
    for parameter in "${parameters[@]}"; do
      case "$parameter" in
        host=*|hostaddr=*)
          value="${parameter#*=}"
          destinations+=("$value")
          ;;
        service=*) fail_unsafe_target ;;
      esac
    done
  else
    # Conservative support for unquoted libpq keyword/value connection strings.
    # Quoted/escaped destinations are rejected as ambiguous instead of reimplementing
    # libpq's full parser in a safety boundary.
    read -r -a parameters <<< "$connection"
    for parameter in "${parameters[@]}"; do
      case "$parameter" in
        host=*|hostaddr=*)
          value="${parameter#*=}"
          [[ "$value" == *\"* || "$value" == *\'* || "$value" == *\\* ]] && fail_unsafe_target
          destinations+=("$value")
          ;;
        service=*) fail_unsafe_target ;;
      esac
    done
  fi

  [[ "${#destinations[@]}" -gt 0 ]] || fail_unsafe_target
  for destination in "${destinations[@]}"; do
    [[ "$destination" != *,* ]] || fail_unsafe_target
    is_local_host "$destination" || fail_unsafe_target
  done
}

if [[ -z "${LOCAL_TEST_DATABASE_URL:-}" ]]; then
  echo "ERROR: LOCAL_TEST_DATABASE_URL is not set." >&2
  echo "Example: LOCAL_TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/bibleberry_r13_test $0" >&2
  exit 2
fi

validate_local_database_url "$LOCAL_TEST_DATABASE_URL"

if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: 'psql' is not installed or not on PATH." >&2
  echo "Install PostgreSQL client tools (and a local PostgreSQL server) to run live RLS tests." >&2
  exit 2
fi

echo "Running R13-3 local auth bootstrap..."
psql "${LOCAL_TEST_DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${ROOT_DIR}/tests/accountDatabase/00_local_supabase_auth_bootstrap.sql"

echo "Applying R13-3 migration..."
psql "${LOCAL_TEST_DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${ROOT_DIR}/supabase/migrations/20261116000001_r13_3_account_schema_and_rls.sql"

echo "Running R13-3 RLS & constraint integration suite..."
psql "${LOCAL_TEST_DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${ROOT_DIR}/tests/accountDatabase/01_r13_3_rls_and_schema_integration.sql"

echo "R13-3 local PostgreSQL integration suite passed."
