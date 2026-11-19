# R13-VERIFY2 — Private Scripture Card Verifier Runtime (Copper Heron)

> **Codename:** Copper Heron · **Issue:** [#230](https://github.com/Bibleberry/Bibleberry/issues/230) (Phase 05 / R13-VERIFY2)
> **Gate:** [Cobalt Finch #225 / PR #228](https://github.com/Bibleberry/Bibleberry/pull/228) merged on `main` as `52d2dba` before any code change (verified live on GitHub at intake).
> **Baseline `main`:** `52d2dba`. **Branch:** `claude/upbeat-goodall-bt8nzj` (the cloud environment's assigned branch; the proposed `feat/issue-230-copper-heron` name could not be used).
> **Status:** a **locally executable**, bounded, private run-once verifier. Proven on a disposable **local** Supabase stack with a **synthetic** published-Sanity fixture. **Not** hosted-deployment evidence, **not** live editorial evidence, and **no scheduler is activated**.

---

## 1. What was built

| Artifact | Layer | Purpose |
| --- | --- | --- |
| `src/accountVerification/databaseIssuancePort.ts` | runtime-neutral core | The real `AwardIssuancePort`. It calls exactly the four accepted `account_issuance.*` functions with constant, schema-qualified SQL and bound parameters (`$1…$4`), and validates every result strictly against the accepted contract. |
| `src/accountVerification/runOnce.ts` | runtime-neutral core | One bounded run: it composes the **accepted** `runAwardVerificationPass` with the port and the **accepted** `createSanityTrustedMonthProvider`, plus caps, retries/backoff, deadline, abort and a counts-only report. Also contains the pinned, size-capped Sanity fetch wrapper. |
| `src/accountVerification/runtimeConfig.ts` | runtime-neutral core | Configuration parser (`AWARD_VERIFIER_*`): credential custody, the explicit TLS trust policy, privileged-login refusal and hard caps. Errors name the variable, never its value. |
| `src/accountVerification/runtimeErrors.ts` | runtime-neutral core | Failure taxonomy (`configuration`, `authorization`, `contract`, `transient`, `aborted`, `internal`), classified by SQLSTATE or network code only. |
| `scripts/accountVerification/pgSqlExecutor.ts` | **Node-only** | The `pg` executor: discrete connection settings, `SET ROLE account_award_verifier`, session hardening, least-privilege preflight, TLS, reconnect after transport loss. |
| `scripts/accountVerification/run-award-verifier-once.ts` | **Node-only** | The CLI entrypoint: signals, a hard-exit grace period, exactly one JSON line on stdout, and a final redaction gate. |
| `tests/accountVerification/{databaseIssuancePort,runtimeConfig,runOnce,runtimeBoundary,pgExecutorTls}.test.ts` | tests | Unit, boundary/bundle and TLS-handshake tests. |
| `tests/accountSupabase/verifierRuntime.supabase.test.ts` (+ `lib/denyExternalFetch.mjs`) | tests | **Suite D** on a real local Supabase stack. |
| `scripts/accountSupabase/run-local-supabase-acceptance.sh` | runner | Runs suite D after A/B/C; expects `# pass 42`; requires `node_modules/pg`. |
| `package.json` / `package-lock.json` | dependency | Adds `pg@8.23.1` and `@types/pg@8.23.1` (dev), both pinned exactly (see §11). |

**Unchanged:** every accepted VERIFY1 core file (`types`, `verifier`, `eligibility`, `trustedMonthProvider`, `serverCivilDates`), all SQL migrations, `src/gateway/**`, every grant, `supabase/config.toml` and CI. `index.ts` only gained exports.

## 2. Trust boundary

```
external scheduler (not configured) ──► node run-award-verifier-once.ts   (server-only process)
                                          │  AWARD_VERIFIER_* config, secrets from files
         ┌────────────────────────────────┴─────────────────────────────┐
         ▼                                                              ▼
 createSanityTrustedMonthProvider (accepted)                createDatabaseAwardIssuancePort
   perspective=published, production|staging only             └─ pg executor: LOGIN ∈ account_award_verifier
   bearer token in a header, pinned origin, size cap               SET ROLE account_award_verifier, search_path=''
         │                                                              │  4 × account_issuance.* (SECURITY DEFINER,
         └──────────► runAwardVerificationPass (accepted rules) ◄───────┘    re-checks claim + basis + bounds)
```

- **No caller-supplied account ID is issuance authority.** Account and award IDs come only from `list_pending_award_claims` rows. The database re-checks the pending claim and the basis ownership at admission (`noPendingClaim`, `basisNotInAccountCompletions`).
- **The database identity** is a dedicated LOGIN that is a member of `account_award_verifier` only. After connecting, the session runs `SET ROLE account_award_verifier`, so only the group's EXECUTE on the four functions is active. The preflight then refuses the run (exit 6) if any of the following holds:
  - the login is a superuser or BYPASSRLS;
  - the login is a member of any owner or API role (`postgres`, `service_role`, `authenticated`, `anon`, `authenticator`, `supabase_*`, `account_award_issuer`, `account_reconciler`, …);
  - the active role is not the verifier group;
  - the four port functions are not all executable;
  - session hardening did not apply.

  Configuration independently refuses those role names before any connection.
- **Nothing public changes.** There is no new route, RPC, PostgREST schema, grant or Worker binding. `account_issuance` stays outside the Data API (D12: `406 PGRST106` / `404 PGRST202`).
- **Bundle isolation.** The `pg` driver and the CLI live under `scripts/`. The core is runtime-neutral and never imported by browser code. A real `vite build` (which is also the Capacitor `webDir`) contains none of the verifier, SQL names, env names or driver markers (`runtimeBoundary.test.ts`). The mutation check (importing the verifier from `src/main.tsx`) is caught by 3 independent guards.

## 3. Configuration and credential custody

All settings are environment variables. **There is no connection-URL setting**, so secrets can never travel in a URL.

| Variable | Default | Bounds / rule |
| --- | --- | --- |
| `AWARD_VERIFIER_DB_HOST` | (required) | Hostname or IP literal; no scheme, path or query |
| `AWARD_VERIFIER_DB_PORT` | `5432` | 1–65535 |
| `AWARD_VERIFIER_DB_NAME` | `postgres` | identifier |
| `AWARD_VERIFIER_DB_USER` | (required) | Dedicated LOGIN, optionally `login.<pooler-tenant>`. Owner, API and platform roles are refused |
| `AWARD_VERIFIER_DB_PASSWORD_FILE` / `AWARD_VERIFIER_DB_PASSWORD` | (one required) | File (preferred; one trailing newline dropped) **or** variable, never both |
| `AWARD_VERIFIER_DB_TLS` | `verify-full` | `verify-full` or `disable`; `disable` only for `127.0.0.1` / `::1` / `localhost` |
| `AWARD_VERIFIER_DB_TLS_CA_FILE` | platform trust store | PEM bundle; refused when TLS is disabled |
| `AWARD_VERIFIER_SANITY_PROJECT_ID` | (required) | `[a-z0-9]{4,32}` |
| `AWARD_VERIFIER_SANITY_DATASET` | (required) | `production` or `staging` only |
| `AWARD_VERIFIER_SANITY_READ_TOKEN_FILE` / `…_READ_TOKEN` | (one required) | as for the password |
| `AWARD_VERIFIER_MAX_CLAIMS_PER_BATCH` | `100` | 1–500 |
| `AWARD_VERIFIER_MAX_BATCHES` | `5` | 1–20 |
| `AWARD_VERIFIER_DEADLINE_MS` | `120000` | 1 000–900 000 (wall clock for the whole run) |
| `AWARD_VERIFIER_MAX_ATTEMPTS` | `3` | 1–5 per operation |
| `AWARD_VERIFIER_RETRY_BASE_DELAY_MS` | `500` | 10–30 000. Backoff is exponential with jitter: `base·2^(n−1)` halved plus 0–50 % jitter, capped at 30 s |
| `AWARD_VERIFIER_DB_CONNECT_TIMEOUT_MS` | `10000` | 500–60 000 |
| `AWARD_VERIFIER_DB_STATEMENT_TIMEOUT_MS` | `15000` | 500–60 000. The functions keep their own `lock_timeout = 5s` |
| `AWARD_VERIFIER_SANITY_TIMEOUT_MS` | `10000` | 200–60 000 per request |
| `AWARD_VERIFIER_RUN_ID` | derived | `[A-Za-z0-9._-]{1,48}`. Scheduler slot ID; otherwise `r13v2-<UTC start second>` |

The process **refuses to start** if `DATABASE_URL`, any `PG*` libpq variable (`PGHOST`, `PGPASSWORD`, `PGSSLMODE`, …), `SUPABASE_DB_URL` or `SUPABASE_SERVICE_ROLE_KEY` is set. These could otherwise redirect or authenticate the driver implicitly.

Secrets are wrapped in `RuntimeSecret`, which serializes, stringifies and `inspect`s as `<redacted>`.

**TLS.** `verify-full` sets `rejectUnauthorized: true`, TLS ≥ 1.2, hostname pinning (`servername`) and an optional CA bundle. There is **no** "encrypt without verification" mode anywhere. A repository-wide test fails on `rejectUnauthorized: false`, `NODE_TLS_REJECT_UNAUTHORIZED` or a relaxed `sslmode`.

## 4. Run semantics

- **Bounded.** At most `MAX_BATCHES × MAX_CLAIMS_PER_BATCH` claims, strictly sequential, on **one** connection, inside one deadline. There are no parallel claim writes and no loops beyond the caps.
- **Batches.** Each batch is one accepted `runAwardVerificationPass`, with verification key `<runId>.b<n>`. A claim already handled in this run is never re-processed by a later batch of the same run. The run stops when a batch has fewer fresh claims than a full page. The queue is ordered oldest-attempted first (accepted SQL), so deferred claims rotate to the back and nothing starves (D10).
- **Retries.** Only transient failures are retried, up to `MAX_ATTEMPTS`:
  - SQLSTATE class 08, `40001`, `40P01`, `55P03`, `57014`, `57P0x`, `533xx`, `58xxx`;
  - network codes such as `ECONNREFUSED` and `ETIMEDOUT`;
  - the admission result `retry` (`concurrentAdmission`);
  - Sanity `unavailable`.

  A transport failure discards the connection, and the next call reconnects and re-runs the preflight. **Authorization failures** (`28xxx`, `42501`, TLS trust, preflight) and **contract failures** (missing function, malformed result) are never retried.
- **Transient is never a decision.** A trusted-source outage becomes a private `trustedSourceUnavailable` deferral, using the accepted engine behaviour. The claim stays pending, guest retention stays required, and the run reports `degraded`. `notFound` and unpublishable months are editorial answers and are not retried.
- **Idempotency.** Each issuance call is one atomic statement. A retried admission whose first commit's reply was lost returns `alreadyEarned`. A retried deferral only bumps a private attempt counter. Replays create no duplicate award, no date or snapshot change and no reader revision bump (D4, D6).
- **Deadline / shutdown.** On the deadline or SIGTERM/SIGINT:
  - no new database call or fetch starts;
  - in-flight calls are abandoned and counted as `unprocessed`;
  - the CLI drops the connection, so the server rolls back an unfinished statement;
  - the process exits `4`, with a hard exit after 10 s if graceful shutdown stalls.

  A write that may still have committed is idempotent on the next run.

### Exit codes and output

| Exit | `status` | Meaning / scheduler action |
| --- | --- | --- |
| 0 | `completed` | Normal. |
| 3 | `degraded` | Completed, but the trusted source was unavailable for ≥ 1 claim, or concurrent admissions stayed unresolved. Retry at the next slot; alert if it persists. |
| 4 | `aborted` | Deadline or shutdown. Safe to re-run (same `RUN_ID` allowed). |
| 5 | `transientFailure` | Database unreachable or timing out after retries. Back off (see §5). |
| 6 | `authorizationFailure` | Bad credential, wrong or privileged login, missing privilege, TLS trust failure. **Page an operator; do not hot-retry.** |
| 7 | `contractFailure` | Schema drift or malformed result. **Page; do not retry.** |
| 2 | `configurationError` | Invalid configuration; nothing was contacted. `failure.code` names the variable. |
| 1 | `internalError` | Unexpected. Page. |

stdout carries exactly one JSON line with these keys: `component`, `runtimeVersion`, `verifierVersion`, `runId`, `status`, `exitCode`, `batches`, `examined`, `admitted`, `alreadyEarned`, `deferred`, `skipped`, `unprocessed`, `deferredByReason{…}`, `retryLater`, `moreMayRemain`, `retries{database,sanity}`, `failure{category,code}|null` and `durationMs`. It contains **counts and generic codes only**: no account or claim IDs, no award IDs, no Card or Sanity data, no deferral detail per claim, no host, user, token or password. The CLI re-checks the line before printing; a UUID, award ID or configured secret turns it into `internalError/REPORT_REDACTION_GUARD`.

## 5. Recommended invocation (recommendation only, not activated)

- **Cadence:** every **15 minutes**, `MAX_BATCHES=5`, `MAX_CLAIMS_PER_BATCH=100`, `DEADLINE_MS=120000`. Pass the scheduler's slot ID as `RUN_ID`, e.g. `slot-20261119T0415`. The UTC−12 release floor means a newly released slot can take up to ~26 h to verify anyway. 15 min keeps the reader-visible delay well below that floor's granularity and costs at most 500 claims and 1 run per slot. If `moreMayRemain` is true on 3 consecutive runs, raise the batch count or cadence.
- **No overlap:** use one scheduler instance with "skip if still running". Overlap is **safe** (per-account advisory locks; D6), just wasteful.
- **Backoff on failure:** after `5` (transient), skip 1, then 2, then 4 slots (cap 1 h) and alert after 1 h. After `3` (degraded), keep the normal cadence and alert if it persists for 6 h. After `6`, `7` or `1`, disable and page. After `4`, re-run at the next slot.
- **Monitoring:** alert on the exit codes above and on `deferredByReason.trustedSourceUnavailable` > 0 for 6 h. A rising `deferredByReason.cardNotApproved` or `cardNotLinked` count is an editorial signal, not an incident. Per-claim detail stays in `account_award_verification_attempts`, which is private and has no client access.
- **Replay:** re-running the same slot is safe, and the slot's verification key is reused. Manual replay is the same command.

**Operator controls:** caps, deadline, attempts, timeouts and run ID are set through the environment. Stopping is by SIGTERM. Disabling is "do not schedule". Rotating either credential needs no code change: replace the mounted file.

## 6. Evidence — what was actually run

### 6.1 Real local Supabase (suite D, `verifierRuntime.supabase.test.ts`)

Stack: Supabase CLI 3.2.0, `supabase/postgres:17.12.0.000`, GoTrue v2.198.0, PostgREST v16.5, on Docker 29.10 on loopback only. The full guarded runner (`run-local-supabase-acceptance.sh`) applies the accepted migrations with zero unblocks and zero warnings, and then runs A + B + C + D.

Real here: GoTrue A/B/… identities, PostgREST reconciliation (claims are nominated by real user sessions), dedicated LOGIN roles created by `postgres`, and the production executor, port, orchestration and CLI. **Synthetic:** the published Sanity month. The accepted provider runs unchanged, but its fetch is answered in-process from `tests/accountVerification/fixtures.ts`. CLI child processes preload a fetch denier, so **no real Sanity request** is possible.

| # | Proven | Result |
| --- | --- | --- |
| D1 | The executor connects as the dedicated LOGIN. The session is `account_award_verifier`, `search_path=''`, `statement_timeout`, READ COMMITTED, `application_name`. From the runtime's own session it is denied (`42501`): table reads, a direct award INSERT, private audit tables, client RPCs, `account_private`, issuer-internal functions, `auth.users`, `SET ROLE` issuer or service_role, and (after `RESET ROLE`) the bare login itself | pass |
| D2 | Preflight refuses a login without the group (`42501`), a login also in `authenticated`, and a BYPASSRLS login (`LOGIN_PREFLIGHT`). A wrong password gives `28P01`. All exit 6 with 0 retries. `postgres`/`service_role`/`authenticator`/`supabase_admin`/issuer are refused by config (exit 2) | pass |
| D3 | A complete claim → published month → admission cycle. The eligible thematic and full-month awards are admitted with the **trusted** snapshot. Forged (missing completion), legacy-only and ineligible claims are privately deferred with exact reasons. The scheduler `RUN_ID` is the attestation key (`<id>.b1`). The reader readback contains no unearned art, review note, internal label, reason or `_rev`. Owner isolation: B sees nothing of A | pass |
| D4 | Two replays: 0 admitted, rows byte-identical, attestation count unchanged, reader revision unchanged. The reader re-syncs with an earlier date and a forged card: date not regressed, snapshot not re-skinned, never re-quarantined | pass |
| D5 | **Unreleased** (server clock before the UTC−12 release of the qualifying slots), **unapproved** (draft), **withdrawn** Card, **unlinked** Card, **legacy-only**, **withdrawn month** and **missing month** are never earned. The exact private reasons are recorded and no Card content is disclosed. After approval exactly the approved Cards are admitted with trusted `shareEligible`. A later Card withdrawal never revokes or re-skins | pass |
| D6 | 3 concurrent runs (3 connections) over the same claims: no double admission. Award and attestation counts are exact | pass |
| D7 | A reader-side holder of the same per-account advisory lock causes the statement timeout (`57014`); bounded retry with backoff; admitted once after release | pass |
| D8 | Sanity **hang** (per-request timeout), **socket error**, **HTTP 401** and **malformed 200**: each is retried, then deferred as `trustedSourceUnavailable` for every pending claim, with nothing granted, `degraded`/exit 3, bounded time and the claim retained. After recovery the claim is admitted | pass |
| D9 | DB port **refused**: `transientFailure` with exactly 2 retries. DB **black hole**: connect timeout, bounded. **Deadline** during a hung fetch: `aborted`/exit 4 within the bound, and **zero** writes (attempt table byte-identical). Deterministic restart with the same `RUN_ID` completes | pass |
| D10 | Hard cap: 2 × 2 claims per run. Paging over all pending claims (including other suites' leftovers) reaches every claim (no starvation). Deferred claims are never discarded | pass |
| D11 | **Real CLI process**, with secrets from 0600 files and a minimal environment. Config refusal (exit 2, names `AWARD_VERIFIER_DB_USER` or `PGHOST`). A real run with denied network: private deferral, nothing granted, exit 3, **one** stdout line, **empty** stderr. Wrong password: exit 6. **SIGTERM** while blocked on a database lock: exit 4 within 5 s, and no verifier session survives | pass |
| D12 | Issuance functions are `404` on `/rest/v1/rpc` for a user. `Content-Profile: account_issuance` is `406` even for service_role. Reader and anon direct INSERT into `account_earned_awards` is denied. **Finding F1** (§7) | pass (F1 recorded) |
| D13 | Every runtime output of the suite (in-process lines plus child stdout/stderr, ≥ 30 outputs) is scanned: no account ID, credential, award ID, Card URL, `trusted-` asset, internal label, DB URL, loopback host or login name | pass |

**Full guarded runner result** (fresh stack, code at `7566f4a`): exit 0. 3 migrations applied with zero warnings, SB2 checks passed, `# pass 42`, `# fail 0`, `# skipped 0` (A 13 + B 8 + C 8 + D 13). `SB2_MUTATION_DEMOS=1` on its own fresh stack: exit 0, all 13 mutation demonstrations caught. A grep of both complete logs for JWT, API-key and DB-URL credential patterns found 0 matches.

### 6.2 Plain unit / boundary tests (no database)

`node --experimental-strip-types --test tests/accountVerification/*.test.ts` gives **57 pass**: 24 pre-existing VERIFY1 plus 33 new.

- **Port contract (fake executor):** constant SQL, bound parameters only; every malformed, oversized, cross-account, extra-field or unknown-status result is a `contract` error without echoing values.
- **Config:** TLS policy, ambient-variable refusal, privileged logins, secret custody, caps, `RuntimeSecret` redaction.
- **Orchestration (in-memory port modelling the SQL semantics):** retries, backoff, no-retry classes, outage, deadline, signal, caps, no duplicate processing, `retry` admission, partial counts.
- **Boundary:** static import scan, the browser import graph from `index.html`, a **real production `vite build`** scanned for 15 markers, no public route or Data API exposure, and only `scripts/accountVerification` imports `pg`.
- **TLS (`pgExecutorTls`):** **real TLS handshakes** against a fake PG SSL endpoint with an openssl-generated self-signed certificate. Untrusted cert → refused; hostname mismatch → refused even with a trusted CA; trusted CA + matching name → handshake completes; a server refusing TLS → refused, with no plaintext fallback.

### 6.3 Regression (unchanged accepted suites)

| Command | Result |
| --- | --- |
| `run-local-rls-tests.sh`, `run-local-transaction-tests.sh`, `run-local-verify1-tests.sh` (PostgreSQL 16.15, fresh socket-only cluster, fresh DB each) | all passed; VERIFY1 E2E 1/1, 0 skipped |
| `tests/accountDatabase/*.test.ts` | 24 pass |
| `npm run test:gateway` | 112 pass |
| `runLocal{Rls,Transaction,Verify1}Guard.test.sh`, `tests/accountSupabase/runLocalSupabaseGuard.test.sh` | passed (26 cases for the Supabase runner guard) |
| Suites A/B/C in the guarded runner | unchanged and passing (part of the 42) |
| `npm run lint`, `npm run build`, `git diff --check` | passed |

### 6.4 Not tested (never claimed)

- Hosted Supabase: direct-connection or pooler (Supavisor) behaviour for a custom LOGIN, the `login.<tenant>` user format, hosted TLS chain and CA, hosted `supautils`, hosted GraphQL.
- Real Sanity (`production`/`staging`) responses, real editorial content, CDN behaviour, real token scopes.
- Any scheduler, hosting provider, secret manager, container image or alerting system.
- Node versions other than v22.23.5 (the CLI uses `--experimental-strip-types`; it needs Node ≥ 22.6). Windows and macOS.
- TLS against a real PostgreSQL server; it was tested only against the fake SSL endpoint above.

## 7. Finding F1 — `service_role` can mint earned awards directly (pre-existing; owner decision)

**Observed on the real local stack (D12, reproducible).** `POST /rest/v1/account_earned_awards` with the service-role secret key returns **HTTP 201** and creates an earned award with no claim, attestation or eligibility check. The cause is the accepted R13-3 grants: `service_role` keeps INSERT/UPDATE on the 10 client-visible account tables (SB1 §8.3 noted the grant but did not exercise it), and Supabase gives `service_role` BYPASSRLS.

**Impact.** Any holder of the project's service-role key can bypass R13-VERIFY1/2 issuance entirely. That key is a separate, platform-level credential; the verifier never holds, accepts or needs it (config and preflight refuse it).

**Not changed here.** The issue forbids migrations and grant changes, and requires a new decision when SQL grants are needed. The issue's "no direct award grant through … service_role" acceptance point is therefore **not met as written**. It is met only for the verifier runtime, not for the platform key. **Recommended decision:** a scoped follow-up migration that revokes `INSERT, UPDATE, DELETE` (at least) on `account_earned_awards`, `account_provisional_award_claims` and `account_completed_challenges` from `service_role`. Its blast radius on other server tooling needs checking first. D12 asserts the current `201`, so it acts as a tripwire and must be updated together with that fix.

## 8. Cross-agent conflict check

Verified against the live GitHub file lists on 2026-11-19:
- **Maple Lantern [#226](https://github.com/Bibleberry/Bibleberry/issues/226)**, [PR #229](https://github.com/Bibleberry/Bibleberry/pull/229) (merged to `main` as `fd81415`), changed `docs/testing/r04-r10-finish-resume-matrix.md` and `tests/participation/challengeLifecycle.test.ts`.
- **Velvet Badger [#227](https://github.com/Bibleberry/Bibleberry/issues/227)**, Draft [PR #231](https://github.com/Bibleberry/Bibleberry/pull/231), changes `src/App.tsx`, `src/appIntegration/**`, `tests/appIntegration/**`, `tests/libraryShelf/**`, `tests/sanity/appIntegrationRoutes.test.ts` and its own doc. Its issue lists `src/accountVerification/**` and `supabase/**` as read-only.

This branch shares **no file** with either PR. Neither assignment may change dependencies, so `package.json`/`package-lock.json` (changed only here) cannot conflict. The new boundary test scans all of `src/`, so any future browser file that imports the verifier fails it; that includes PR #231's new `src/appIntegration/**`, which does not import it. Only the pre-existing guard in `tests/gateway/gatewayHandler.test.ts` runs in CI today (see §9.7).

## 9. Owner decisions for Aaron

1. **F1** (§7): approve a scoped `service_role` revoke migration, or accept and document the platform-key bypass.
2. **Hosting:** choose where the run-once process runs, e.g. a container job or VM cron with Node ≥ 22.6. It needs outbound access only to Postgres (direct connection or pooler) and `<project>.api.sanity.io`. A browser, edge-public or Worker route is **not** suitable.
3. **Credentials:**
   - Provision the dedicated LOGIN (`CREATE ROLE … LOGIN NOSUPERUSER NOBYPASSRLS …; GRANT account_award_verifier TO …`) on the hosted project.
   - Choose the secret manager and the mount paths for `*_FILE`.
   - Choose a **read-only, published-perspective-capable** Sanity token, per dataset.
   - Set a rotation policy.
   - Decide pooler versus direct connection, and obtain the hosted CA bundle.
4. **Cadence and alerting:** accept or adjust §5. Decide whether a reader sync should ever trigger a run (not implemented; it would need a new private trigger).
5. **Hosted acceptance:** authorize a staging-project run of suite-D-equivalent checks (custom LOGIN over the hosted connection path, TLS verify-full) before any production use.
6. **Dependency:** accept `pg@8.23.1` (§11).
7. **CI wiring:** CI (`.github/workflows/ci.yml`) runs `tests/ci/*` and `npm run test:gateway` only. CI configuration was excluded from this issue, so `tests/accountVerification/*.test.ts` (including the new bundle-isolation and TLS tests, ~10 s, no services needed) is **not yet run in CI**. Recommended: add `node --experimental-strip-types --test tests/accountVerification/*.test.ts` to the existing CI job. The real-Supabase runner needs Docker and stays a manual/local gate.

## 10. Deviations and notes

- **Branch name:** the environment-assigned branch is used (see header). Copper Heron is kept in the PR title and body.
- **The accepted core is unchanged.** `runOnce.ts` decorates the accepted `runAwardVerificationPass` rather than re-implementing it. No bug in the accepted core was found that required a change.
- **Report status** is derived from observable outcomes. For an aborted batch the counts are what the database acknowledged; everything else is `unprocessed`.
- **SB2 doc note** (carried forward): `docs/architecture/r13-verify1-trusted-card-admission.md` §6 still describes the pre-SB2 call-scoped GUC clause. That file is outside this issue's scope.

## 11. Dependency justification: `pg@8.23.1`

The adapter needs real extended-protocol parameter binding, explicit TLS options (CA, servername, `rejectUnauthorized`) and connect/query timeouts. A `psql` subprocess (the existing **test-only** port) offers only psql-variable quoting, puts credentials in a child environment, and adds a binary dependency to the runtime.

`pg` is the de-facto Node driver and pure JS (the optional `pg-native` is not installed). It is pinned exactly; the published version is older than two weeks. It is imported **only** by `scripts/accountVerification/pgSqlExecutor.ts` and, in tests, by the TLS and suite-D tests. The boundary tests prove it never reaches the browser or Capacitor bundle. No other dependency changed.
