# shellcheck shell=bash
# Shared local-only PostgreSQL target guard for Bibleberry account database test runners.
# Source this file; it defines validate_local_database_url, which exits non-zero unless the
# connection string targets an explicit local Unix socket or loopback host.
# Never weaken this guard: these suites must never run against live/staging/production Supabase.

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
