# R13-SB1 — Real Local Supabase Security Acceptance (Evidence)

> **Issue:** [#210](https://github.com/Bibleberry/Bibleberry/issues/210) (Phase 05 / R13-SB1)
> **Baseline `main`:** `8f95b9a` (R13-VERIFY1, PR #209, merged; R13-TX1 PR #207 merged)
> **Environment:** disposable local stack on loopback only. No hosted Supabase project, Sanity dataset, real user, `supabase login`/`link`/`db push`, or `--remote`/`--linked`/`--db-url` path was used.

---

## 1. Verdict

| Question | Result |
| --- | --- |
| Do the **accepted** migrations apply unchanged under the real Supabase migration runner? | **No.** Four Supabase-specific defects (§3). D1/D2 are fixed by two new migrations in this PR. **D3 and D4 cannot be fixed by any migration the Supabase runner can execute.** |
| Is the account security model sound on a real Supabase runtime **once D3/D4 are unblocked locally**? | **Yes.** All 21 real-stack tests pass (GoTrue sessions, PostgREST, RLS, grants, private issuance, dedicated verifier login) in two complete runner executions on fresh stacks, plus earlier manual suite runs. |
| Can the current migrations be deployed to a hosted Supabase project? | **BLOCKED** until Aaron decides the D3/D4 remedies (§3.3, §9). The local unblocks need the bootstrap superuser, which hosted projects do not provide. |

The real-stack acceptance therefore proves the **design** under real Supabase Auth/PostgREST/roles. It does **not** prove that the accepted migration files are deployable. That is the main finding of this work order.

## 2. Environment and exact versions

| Component | Version |
| --- | --- |
| Host | Claude Code cloud container, Ubuntu 24.04.5 LTS, Linux 6.18 x86_64, 4 vCPU, 15 GiB |
| Container runtime | Docker Engine 29.10.0 (linux/amd64), started inside the container |
| Supabase CLI | 3.2.0 (npm `supabase@3.2.0`, not added to `package.json`) |
| Database | `ghcr.io/supabase/postgres:17.12.0.000` → PostgreSQL 17.12, `supautils` 4.0.0 |
| Auth | `ghcr.io/supabase/gotrue:v2.198.0` (ES256 asymmetric session tokens) |
| Data API | `ghcr.io/supabase/postgrest:v16.5` behind `ghcr.io/supabase/kong:2.8.1` |
| Test tooling | Node v22.23.5 (`node:test`, built-in `fetch`), psql 16.15; plain-PG regression on PostgreSQL 16.15 |

Images were pulled from GHCR (`SB1_IMAGE_REGISTRY=ghcr.io`) because this container's network policy blocks the default ECR blob CDN. Only `db`, `auth`, `rest` and `kong` run. Studio, realtime, storage, edge runtime, analytics, SMTP and pooler are disabled in `supabase/config.toml`.

## 3. Supabase-specific defects in the accepted migrations

The Supabase migration runner connects as **`postgres`**, which is `CREATEROLE` but **not superuser**. The plain-PostgreSQL harness of R13-3/TX1/VERIFY1 ran migrations as a superuser, so none of these surfaced there.

### D1 — owner role cannot be assigned (TX1, VERIFY1) — **fixed in this PR**

Repro: `supabase migration up --local` → `ERROR: must be able to SET ROLE "account_reconciler" (42501)` at `ALTER FUNCTION public.reconcile_guest_participation(jsonb) OWNER TO account_reconciler`.

Root cause: since PostgreSQL 16, a `CREATEROLE` creator gets an automatic membership with `ADMIN` but `INHERIT FALSE, SET FALSE`. The migrations guard their self-grant with `pg_has_role(current_user, role, 'MEMBER')`, which is already true, so the grant is skipped. Verified directly:

```sql
CREATE ROLE sb1_probe NOLOGIN NOINHERIT;           -- as postgres
SELECT pg_has_role(current_user,'sb1_probe','MEMBER'), pg_has_role(current_user,'sb1_probe','SET');  -- t | f
```

Without INHERIT, the runner also loses owner rights right after `OWNER TO`. TX1's following `REVOKE ALL ... FROM PUBLIC, anon, authenticated` then only raises a WARNING and **silently revokes nothing** (reproduced).

### D2 — new owner lacks schema `CREATE` (TX1, VERIFY1) — **fixed in this PR**

Repro (after D1): `ERROR: permission denied for schema public` at the same `ALTER ... OWNER TO`. A non-superuser can only transfer ownership to a role that has `CREATE` on the object's schema.

### Fix for D1/D2: `20261118000000_…_prerequisite.sql` + `20261118000003_…_cleanup.sql`

- **Prerequisite (ordered before TX1):** pre-creates `account_reconciler` and `account_award_issuer` with byte-identical attributes. TX1/VERIFY1 use `IF NOT EXISTS`, so their own creation is skipped. For a non-superuser runner it grants `WITH INHERIT TRUE, SET TRUE`, which is what the migrations' own `GRANT <role> TO current_user` would have produced. It also temporarily grants `CREATE ON SCHEMA public` to the reconciler, plus a default privilege so `account_award_issuer` gets `CREATE` on the schema VERIFY1 creates.
- **Cleanup (ordered after VERIFY1):** revokes every temporary `CREATE` and the default privilege, then **raises an exception** if any owner role still holds schema `CREATE` or a default schema privilege.
- **Deviation, for Aaron:** the issue asks for forward-only corrections *after* accepted migrations. That is impossible here because TX1 itself aborts. The prerequisite is ordered **before** TX1 and changes no table, policy, grant or function; only roles and temporary schema privileges. No accepted migration file was edited. On superuser databases both files are no-ops apart from role creation, which TX1/VERIFY1 would have done anyway (plain-PG suites still pass, §7).
- Final catalog state on the real stack: functions owned by the intended roles, function ACLs exactly as designed (`reconcile_guest_participation`: `account_reconciler`, `authenticated`; issuance functions: issuer, `account_award_verifier`), no owner role holds `CREATE` anywhere.

### D3 — VERIFY1 cannot be applied on Supabase — **BLOCKING, not fixed**

Repro: `supabase migration up --local` → `ERROR: permission denied to set parameter "bibleberry.award_issuance_account" (42501)` at `CREATE FUNCTION account_issuance.get_claim_verification_context ... SET bibleberry.award_issuance_account TO ''`. The CLI rolls VERIFY1 back cleanly (no `account_issuance` schema remains). Minimal repro as `postgres`:

```sql
SET bibleberry.repro = 'x';                                                    -- allowed (session level)
CREATE FUNCTION public.sb1_repro() RETURNS int LANGUAGE sql
  SET bibleberry.repro TO '' AS 'select 1';                                    -- ERROR 42501
GRANT SET ON PARAMETER bibleberry.award_issuance_account TO postgres;          -- ERROR: permission denied
```

Root cause: since PostgreSQL 15, attaching an unregistered **placeholder** GUC to `CREATE FUNCTION ... SET` requires superuser or `SET` privilege on that parameter, and only a superuser can grant it. Supabase's `supautils.privileged_role_allowed_configs` allow-lists namespaces such as `pgrst.*` and `pg_net.*`, not `bibleberry.*`. **No migration run by `postgres` can make the accepted VERIFY1 file apply.**

### D4 — TX1's `auth` grant is a silent no-op — **BLOCKING, not fixed**

Repro: the migration "succeeds", but every authenticated commit returns HTTP 403 `{"code":"42501","message":"permission denied for schema auth"}`. The database log of the migration session shows:

```
postgres@postgres WARNING:  no privileges were granted for "auth"
postgres@postgres WARNING:  no privileges were granted for "uid"
```

Root cause: schema `auth` is owned by `supabase_admin`, and `postgres` holds `USAGE` on it **without** grant option (`postgres=U/supabase_admin`). TX1's `GRANT USAGE ON SCHEMA auth TO account_reconciler` therefore grants nothing. The SECURITY DEFINER body and the reconciler's RLS policies both call `auth.uid()`, so **the client transaction cannot work on Supabase**. The `uid` warning is harmless because `auth.uid()` is already executable by `PUBLIC`. These are the only two warnings the runner produces across all five migrations; the runner fails on any other.

### 3.3 Remedy options for D3/D4 (owner decision; none applied)

Nothing is deployed, so changing the accepted files before first deployment is possible, but it needs Aaron's authorization.

- **D3:** (a) amend VERIFY1 to scope the per-call account without a placeholder `SET` clause, e.g. `set_config(..., true)` in the body with an explicit reset/exception path. This changes V7's call-scoped confinement to transaction-scoped and must be re-reviewed. (b) Ask the platform (Supabase support) for `GRANT SET ON PARAMETER` to `postgres`. Not self-serve; availability unverified.
- **D4:** (a) amend TX1 so the definer body and reconciler policies resolve identity through a `postgres`-owned helper. `postgres` has `auth` USAGE. Needs review of the trust boundary. (b) Make the reconciler a member of a Supabase role that has `auth` USAGE, e.g. `authenticated`. That **broadens** the least-privilege owner role, including Supabase's default grants on future `public` objects. Not recommended without review. (c) A platform-side grant, as for D3.
- None of these were tested; they are listed only to frame the decision.

## 4. Local-only unblocks used for the real-stack tests

To test everything else on the real runtime, the runner executes exactly these two statements **as the container's bootstrap superuser** (`docker exec … psql -U supabase_admin`). This happens after reproducing D3/D4 and before finishing the migrations. They live in the test harness only, never in a migration, and are impossible on hosted Supabase:

```sql
GRANT SET ON PARAMETER bibleberry.award_issuance_account TO postgres;  -- unblocks D3
GRANT USAGE ON SCHEMA auth TO account_reconciler;                      -- unblocks D4: exactly TX1's intended grant
```

Neither grants any client role, issuer or verifier anything beyond the accepted design. `SB1_STOP_AFTER_DEFECTS=1` runs the reproductions only.

## 5. How to run (local, disposable, repeatable)

```bash
SUPABASE_CLI=/path/to/supabase ./scripts/accountSupabase/run-local-supabase-acceptance.sh
```

Optional: `SB1_IMAGE_REGISTRY=ghcr.io`, `SB1_KEEP_STACK=1` (inspect afterwards; stop with `supabase stop --no-backup`), `SB1_STOP_AFTER_DEFECTS=1`.

The runner:

1. **Preflight.** Refuses before touching Docker if `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_URL`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`, `DATABASE_URL` or any libpq redirect variable is set, if `supabase/.temp/project-ref` exists (linked checkout), if `project_id` is not `bibleberry-sb1-local`, or if the Data API exposes anything beyond `public`/`graphql_public` (`tests/accountSupabase/runLocalSupabaseGuard.test.sh`, 14 cases).
2. **Stack.** Stops any previous stack of this project and starts fresh on a Docker network created with `com.docker.network.bridge.host_binding_ipv4=127.0.0.1`. The CLI otherwise publishes ports on `0.0.0.0`, even with daemon `ip` set. It then asserts that every published port is `127.0.0.1` and that both the API and DB URLs are loopback. Ports are 55421 (API) and 55422 (DB), not the CLI defaults, so they never collide with another local project.
3. **Migrations.** Checks the runner identity is `postgres`, non-superuser, on a database with no `account_*` tables. Applies migrations with **`supabase migration up --local`** and **without** `00_local_supabase_auth_bootstrap.sql`: no fake `auth.users`, no `auth.uid()` override. Asserts D3 and D4, applies §4, finishes the migrations, and scans the DB log for unexpected migration warnings.
4. **Suites.** Runs suites A and B and requires exactly `# pass 21`, `# fail 0`, `# skipped 0`. Tears down the stack and network on exit.

## 6. Results matrix (real stack; 2 complete fresh runner executions, both passed)

**A — GoTrue + PostgREST (`tests/accountSupabase/authPostgrestBoundary.supabase.test.ts`).** Users sign up and sign in through real GoTrue with random passwords held in memory only, and every request carries the local **publishable** key.

| # | Proven over real HTTP | Result |
| --- | --- | --- |
| A1 | Sessions are ES256 JWTs, `role=authenticated`, `sub` = real `auth.users.id`; `/auth/v1/user` works; schema has the 12 `account_*` tables | pass |
| A2 | Fresh account → `{"status":"notFound"}`. Anon → **HTTP 401** `42501` (PostgREST/SQL privilege denial, not function JSON) for both RPCs | pass |
| A3 | A's `newAccountTransfer` via `/rest/v1/rpc/reconcile_guest_participation` commits rev 1. **Every written row has `account_id = A`** (DB-side check), nothing for B, so `auth.uid()` = A inside the SECURITY DEFINER body. Explicit Shelf `isProtected` false/true stored exactly | pass |
| A4 | Same key + different guest fingerprint → `conflict/idempotencyPayloadMismatch`. Award claim quarantined (not in `earnedAwards`; in `pendingAwardVerification`). Receipt `unresolved_persisted_on_server = false` | pass |
| A5 | B reads only B. On all 10 client-readable tables B gets `[]` even when filtering `account_id=eq.A`. The 2 VERIFY1 audit tables → 401/403 `42501` | pass |
| A6 | POST, upsert (`resolution=merge-duplicates`), PATCH and DELETE on **all 12** tables as anon and as A → 401/403 `42501`; A's row count unchanged | pass |
| A7 | B sends `accountId = A` in body and envelope plus forged `Role: service_role`, `X-Jwt-Claim-Sub`, `Request.Jwt.Claim.Sub` headers → HTTP 200 `unauthorized/accountMismatch`, zero writes. The same headers on B's own payload commit **to B** | pass |
| A8 | Malformed, tampered (sub swapped), `alg:none`, wrong-key HS256 and expired (validly signed) tokens → **HTTP 401 `PGRST30x`** before SQL, both RPCs | pass |
| A9 | Legacy `service_role` JWT and `sb_secret_` key → `42501` on both client RPCs | pass |
| A10 | B `existingAccountMerge` → rev 2. Stale `expectedRevision` → `conflict/revisionMismatch` (`currentRevision` 2). Exact replay → `alreadyCommittedDuplicate` with the original receipt. Readback merged | pass |
| A11 | 6 concurrent HTTP writers at the same revision → exactly 1 `committed`, 5 `revisionMismatch`. Receipts `[1,2,3]`, no duplicates | pass |
| A12 | `Content-Profile`/`Accept-Profile` `account_issuance`, `account_private` and `auth` → **406 `PGRST106`** for anon, A and service_role. Issuance/helper names on `/rpc/` → **404 `PGRST202`** | pass |
| A13 | GraphQL: `pg_graphql` is **not installed** on this image. `/graphql/v1` returns no schema or account data (see §8) | pass (limited) |

**B — dedicated verifier login + private issuance (`tests/accountSupabase/verifierRoleIssuance.supabase.test.ts`).** An ephemeral `LOGIN` role `sb1_verifier_login_<run>` is created **by `postgres`** with a random password, granted `account_award_verifier`, connected directly over loopback TCP, and dropped afterwards.

| # | Proven | Result |
| --- | --- | --- |
| B1 | Reconciler, issuer and verifier are `NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT`, and login attempts as them fail. The login has `session_user = current_user = login`, non-superuser, no BYPASSRLS | pass |
| B2 | `SET ROLE account_award_verifier` works. `SET ROLE` to issuer, reconciler, postgres, service_role, authenticated, anon, supabase_admin and authenticator → denied | pass |
| B3 | SELECT/DELETE on all 12 account tables → denied; `auth.users` → denied. A hand-set `request.jwt.claims` for C cannot open `get_account_participation` (no EXECUTE). `reconcile_guest_participation`, `account_private.*` and issuer-internal `current_account()` → denied | pass |
| B4 | `list_pending_award_claims` lists C's two real claims, identifiers/dates only. `get_claim_verification_context` returns completions only for an existing claim; `noPendingClaim` for D or for an unclaimed award | pass |
| B5 | `record_verification_deferral` → `deferred`; reader readback byte-identical and the reason never reaches the reader | pass |
| B6 | Extra `verified:true` → rejected. C's basis replayed onto D → `noPendingClaim`. Unclaimed award → `noPendingClaim`. Foreign basis → `basisNotInAccountCompletions`. Valid → `admitted`, replay → `alreadyEarned`. Owner sees the trusted card via PostgREST; counts C 1 award / 1 attestation / 1 pending claim, D 0 | pass |
| B7 | C reconciles a re-skinned card (other image, `shareEligible:false`) → snapshot and date unchanged, flags OR. With FAITH still claimed, the fresh receipt is `false` and lists FAITH. After admitting FAITH, the original receipt replays `false` (immutable) and only a fresh reconcile returns `true` | pass |
| B8 | Catalog under Supabase's default privileges (which auto-grant ALL in `public` to anon/authenticated/service_role): anon executes nothing; **service_role executes no account function**; authenticated executes only the two client RPCs; the verifier group only the 4 issuance functions. Anon has no table privilege, authenticated no write privilege. RLS is on for all 12 tables. service_role cannot touch the 2 private audit tables. No owner role touches `auth.users`. No API role has USAGE on `account_private`/`account_issuance` | pass |

`auth.uid()` under a role change: Supabase's real `auth.uid()` reads `request.jwt.claim.sub`, falling back to `request.jwt.claims->>'sub'`. PostgREST 16.5 sets only the latter from the verified JWT. A3/A7 prove it resolves to the JWT subject inside the `account_reconciler`-owned SECURITY DEFINER body, and that no HTTP header can set it. The issuance functions do not use `auth.uid()`; they are confined by `bibleberry.award_issuance_account`, which is exercised in B6/B7.

## 7. Regression and parity

| Command (plain PostgreSQL 16.15, fresh cluster on a Unix socket, TCP disabled, fresh DB each) | Result |
| --- | --- |
| `run-local-rls-tests.sh` | **passed** |
| `run-local-transaction-tests.sh` (now also applies `20261118000000`) | **passed**: 250 assertions (S, T, C), matching the TX1 handoff |
| `run-local-verify1-tests.sh` (now also applies `20261118000000` and `20261118000003`) | **passed**: 334 assertions plus end-to-end proof 1/1, 0 skipped |
| `node --experimental-strip-types --test tests/accountDatabase/*.test.ts` | 17 passed |
| `runLocal{Rls,Transaction,Verify1}Guard.test.sh`, `tests/accountSupabase/runLocalSupabaseGuard.test.sh` | passed |
| `npm run lint`, `npm run build`, `git diff --check` | passed |

**Parity:** the plain-PG harness simulates Supabase with a superuser runner and a fake `auth` schema, which **masked D1–D4**. Its results remain valid for SQL logic, but not for Supabase role and grant behaviour. Future account migrations must also pass this runner.

## 8. Observations, unresolved assumptions and limits

1. **GraphQL not proven.** The local `supabase/postgres:17.12.0.000` image has no `pg_graphql` installed, so A13 proves only that no data is served here. Hosted projects commonly enable it. Because `authenticated` can SELECT the account tables and EXECUTE the two RPCs, pg_graphql would expose them (RLS-bound) once enabled. Re-test there before relying on it.
2. **Supabase defaults are hostile by design.** Default privileges in `public` grant ALL on every new table/function to anon/authenticated/service_role. The accepted migrations' explicit REVOKEs hold (B8). **Every future account migration must revoke explicitly**, and the runner's warning scan helps catch silent no-op grants.
3. **service_role table access (by R13-3 design).** R13-3/TX1 grant service_role ALL on the 10 client-visible account tables (BYPASSRLS). This was confirmed from the migrations, not exercised over HTTP. service_role cannot execute any account function or touch the private audit tables (B8).
4. **Per-commit `unresolvedPersistedOnServer`.** A payload that *omits* a still-pending server claim receives `true`. That is consistent with TX1 §6 and V3b, since the coordinator always sends the full guest envelope, but an adapter must never send partial envelopes.
5. **Legacy HS256 secret.** PostgREST still accepts HS256 tokens signed with the project JWT secret (A8 used the *local default* secret only to mint an **expired** token). Whoever holds that secret can mint any identity, so it must stay server-only.
6. **Port binding.** The CLI publishes on `0.0.0.0` by default; the runner forces loopback through the Docker network option. This is verified on Docker Engine/Linux. **Docker Desktop (macOS) was not tested.**
7. **Not run here:** Docker Desktop on Aaron's machine, the default ECR image path, PostgreSQL 15 images, hosted Supabase (forbidden), and a real verifier runtime or adapter (out of scope).

## 9. Remaining work (not started)

1. **Owner decision D3/D4 (§3.3):** pick remedies; then a scoped Issue to amend or supersede the affected migrations before any deployment. Re-run this runner, which will fail its "D3/D4 reproduced" assertions and must then be updated to drop the unblocks.
2. Real `AuthorizedAccountTransport` adapter over `/rest/v1/rpc` (TX1 §6 mapping), using A8/A2's 401/`PGRST30x`/`42501` distinctions.
3. Verifier runtime with a dedicated login like B's, secret custody and network placement (VERIFY1 §10).
4. Re-run on Docker Desktop and with `pg_graphql` enabled.

## 10. Cleanup

The runner tears down on exit (`supabase stop --no-backup`, `docker network rm bibleberry_sb1_loopback`); no volumes are kept. Manual cleanup: `supabase stop --no-backup --workdir <repo>` and `docker network rm bibleberry_sb1_loopback`. Test users and the ephemeral verifier login exist only inside the disposable stack, and the login is also dropped by suite B.

## 11. Secrets and redaction

Keys, JWTs and passwords are read from `supabase status` into environment variables in memory and are never printed. The `supabase start` status JSON is dropped. All CLI/test output goes through redaction (JWTs, `sb_publishable_`/`sb_secret_` keys, `"…KEY|SECRET|PASSWORD|TOKEN…":"value"`, DB URL credentials). A grep of both complete passing run logs for JWT, key, secret and DB-credential patterns found **0** matches. (An earlier runner draft echoed the CLI's status JSON including the CLI's public default local JWT secret into a scratch log; that path was removed and the log was never committed.) No user JWT, admin key, service-role token, OTP or password is committed or logged.
