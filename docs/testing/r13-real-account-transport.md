# R13 — Authenticated Supabase account transport

**Issue:** [#232 — Cinnamon Bear](https://github.com/Bibleberry/Bibleberry/issues/232)  
**Scope:** `SupabasePostgrestTransport` connects the accepted provider-neutral coordinator to the existing `get_account_participation()` and `reconcile_guest_participation(jsonb)` RPCs. It does not perform direct table DML or provide authentication/session refresh.

## Deterministic HTTP coverage

`tests/accountSync/supabasePostgrestTransport.test.ts` uses injected HTTP fixtures, not a Supabase server. It checks authenticated RPC requests, accepted payload casing, response validation, conflict and rejection mapping, durable replay receipts, protected Shelf readback, expiry, abort, timeout, lost acknowledgement, and secret-safe logs.

Run it with:

```sh
node --experimental-strip-types --test tests/accountSync/supabasePostgrestTransport.test.ts
```

## Optional real local GoTrue/PostgREST demonstration

`tests/accountSync/supabasePostgrestTransport.local.test.ts` is explicitly opt-in and names its real-stack boundary in the test title. It creates two random GoTrue users on loopback, uses their real access tokens through the adapter, commits and replays A's idempotent transfer, verifies Shelf protection readback, and confirms B sees no A account. This is a disposable local test; the random users and records remain only in that local stack until it is discarded.

Use the existing guarded local acceptance runner described in [R13-SB1](r13-sb1-real-local-supabase-security-acceptance.md) to start the accepted migrations and leave its disposable stack running with `SB1_KEEP_STACK=1`. The runner first checks that no project-owned resources already exist and refuses remote/linked targets. Then set only the loopback URL and local publishable key printed by Supabase CLI and run:

```sh
BIBLEBERRY_RUN_LOCAL_SUPABASE_TRANSPORT=1 \
BIBLEBERRY_LOCAL_SUPABASE_URL=http://127.0.0.1:55421 \
BIBLEBERRY_LOCAL_SUPABASE_PUBLISHABLE_KEY='<local publishable key>' \
node --experimental-strip-types --test tests/accountSync/supabasePostgrestTransport.local.test.ts
```

The test independently refuses non-loopback URLs, HTTPS/remote endpoints, configured hosted Supabase credentials, and secret/service-role keys. It is skipped by default. This repository run did **not** execute that opt-in test; no real-stack adapter acceptance is claimed here. The pre-existing SB1 security acceptance is separate evidence and is not a result for the new adapter.

## Ownership and boundaries

- Account identity comes from the supplied server-verified session JWT; the body account ID is only checked for mismatch. The SQL `auth.uid()` remains authoritative.
- Only the public RPC endpoints are called. The publishable/anon key identifies the project; a reader access token is the Bearer credential.
- Network and HTTP errors never synthesize a commit receipt. The existing coordinator clears guest storage only after its durable receipt checks succeed.
- The SQL quarantines unverified award claims. Their receipt reports `unresolvedPersistedOnServer: false`, preventing guest clearance.
- The adapter does not refresh tokens. The caller must provide the current verified session for every new operation.
