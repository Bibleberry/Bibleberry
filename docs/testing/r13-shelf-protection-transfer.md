# R13 Shelf protection transfer evidence

The account contract now carries an optional `isProtected` flag. Reconciliation preserves explicit `true` and `false`; an absent flag remains absent for the SQL defaults. A present non-boolean Shelf value is rejected as an invalid entry, which makes the guest-clearance guard retain the local guest snapshot.

The coordinator regression covers both booleans for both admission kinds, absent flags, the three-month limit, malformed guest input and account-first conflict resolution. `shelfProtectionSql.integration.test.ts` runs the real coordinator against the local transaction RPC and reads the resulting Shelf back through `get_account_participation()`.

## Local PostgreSQL run

Use a fresh disposable local PostgreSQL database with the existing R13-TX1 harness. The harness requires an explicit local socket or loopback URL and refuses databases that already contain account tables:

```bash
LOCAL_TEST_DATABASE_URL='postgresql:///bibleberry_shelf_test?host=/tmp/bb-pg&port=55432&user=postgres' \
  ./scripts/accountDatabase/run-local-transaction-tests.sh

LOCAL_TEST_DATABASE_URL='postgresql:///bibleberry_shelf_test?host=/tmp/bb-pg&port=55432&user=postgres' \
  node --experimental-strip-types --test tests/accountSync/shelfProtectionSql.integration.test.ts
```

The integration test applies the existing local-target guard, uses the simulated `authenticated` role and JWT subject from the SQL harness, and inserts one randomly identified test account. Destroy the disposable database after verification. This exercises the TypeScript coordinator → transaction RPC → account readback contract; it does not prove a running Supabase/PostgREST stack or a production transport.

## Execution evidence

Verified locally on PostgreSQL 16.15 in the disposable database `bibleberry_shelf_test`:

- `LOCAL_TEST_DATABASE_URL='postgresql:///bibleberry_shelf_test?host=/var/run/postgresql&port=5432&user=runner' ./scripts/accountDatabase/run-local-transaction-tests.sh` — passed; R13-3, all R13-TX1 security/invariant assertions (including Shelf explicit/default, invalid-boolean and precedence cases), and multi-session concurrency suites passed.
- `LOCAL_TEST_DATABASE_URL='postgresql:///bibleberry_shelf_test?host=/var/run/postgresql&port=5432&user=runner' node --experimental-strip-types --test tests/accountSync/shelfProtectionSql.integration.test.ts` — passed; both non-default values round-tripped, and an absent `readerSelected` flag received the server default.

This local role/JWT simulation is not a running Supabase/PostgREST stack and does not verify a production transport or activate live transfer.
