# R13-SB1 — Real Local Supabase Security Acceptance (Evidence)

> **Issue:** [#210](https://github.com/Bibleberry/Bibleberry/issues/210) (Phase 05 / R13-SB1)
> **Baseline `main`:** `8f95b9a` (R13-VERIFY1, PR #209, merged; R13-TX1 PR #207 merged)
> **Environment:** disposable local stack on loopback only. No hosted Supabase project, Sanity dataset, real user, `supabase login`/`link`/`db push`, or `--remote`/`--linked`/`--db-url` path was used.
> **Status:** **partial evidence.** Completing I-210 depends on Aaron's decision on the D1–D4 migration remediation (§10). This PR contains **no migration**.

---

## 1. Verdict

| Question | Result |
| --- | --- |
| Do the **accepted** migrations apply unchanged under the real Supabase migration runner? | **No.** Four Supabase-specific defects (D1–D4, §3). None can be corrected by a migration ordered *after* the accepted files, because D1 aborts R13-TX1 itself and D3 aborts R13-VERIFY1. |
| Is the account security model sound on a real Supabase runtime once D1–D4 are unblocked **locally**? | **Yes.** All 21 real-stack tests pass: GoTrue sessions, PostgREST, RLS, grants, private issuance and a dedicated verifier login (§6). |
| Can the migrations be deployed to a hosted Supabase project? | **BLOCKED** until Aaron authorizes a remediation (§10, recommended design, **not implemented**). The local unblocks need the container's bootstrap superuser, which hosted projects do not provide. |

The real-stack run proves the **design** under real Supabase Auth, PostgREST and roles. It does **not** prove the accepted migration files are deployable, and the local test-only grants are not a hosted solution.

## 2. Environment and exact versions

| Component | Version |
| --- | --- |
| Host | Claude Code cloud container, Ubuntu 24.04.5 LTS, Linux 6.18 x86_64 |
| Container runtime | Docker Engine 29.10.0 (linux/amd64), started inside the container |
| Supabase CLI | 3.2.0 (npm `supabase@3.2.0`, not added to `package.json`) |
| Database | `ghcr.io/supabase/postgres:17.12.0.000` → PostgreSQL 17.12, `supautils` 4.0.0 |
| Auth | `ghcr.io/supabase/gotrue:v2.198.0` (ES256 asymmetric session tokens) |
| Data API | `ghcr.io/supabase/postgrest:v16.5` behind `ghcr.io/supabase/kong:2.8.1` |
| Test tooling | Node v22.23.5 (`node:test`, built-in `fetch`), psql 16.15; plain-PG regression on PostgreSQL 16.15 |

Images were pulled from GHCR (`SB1_IMAGE_REGISTRY=ghcr.io`) because this container's network policy blocks the default ECR blob CDN. Only `db`, `auth`, `rest` and `kong` run. Studio, realtime, storage, edge runtime, analytics, SMTP and pooler are disabled in `supabase/config.toml`.

## 3. Supabase-specific defects in the accepted migrations

The Supabase migration runner connects as **`postgres`**, which is `CREATEROLE` but **not superuser**. The plain-PostgreSQL harness of R13-3/TX1/VERIFY1 ran migrations as a superuser and simulated `auth`, so none of these surfaced there. The runner reproduces each defect **in order on every run**, and after each expected failure it proves the failed migration stranded nothing (§5, step 4).

### D1 — owner role cannot be assigned (R13-TX1; same pattern in R13-VERIFY1)

**Repro.** `supabase migration up --local` fails with `ERROR: must be able to SET ROLE "account_reconciler" (42501)` at `ALTER FUNCTION public.reconcile_guest_participation(jsonb) OWNER TO account_reconciler`.

**Root cause.** Since PostgreSQL 16, a `CREATEROLE` creator receives an automatic membership with `ADMIN` but `INHERIT FALSE, SET FALSE`. The migrations guard their self-grant with `pg_has_role(current_user, role, 'MEMBER')`, which is already true, so the grant is skipped:

```sql
CREATE ROLE sb1_probe NOLOGIN NOINHERIT;           -- as postgres
SELECT pg_has_role(current_user,'sb1_probe','MEMBER'), pg_has_role(current_user,'sb1_probe','SET');  -- t | f
```

Without INHERIT the runner also loses owner rights right after `OWNER TO`. The following `REVOKE ALL ... FROM PUBLIC, anon, authenticated` then only raises a WARNING and **silently revokes nothing** (reproduced earlier on this branch).

### D2 — new owner lacks schema `CREATE` (R13-TX1, R13-VERIFY1)

**Repro** (with D1 unblocked). The run fails with `ERROR: permission denied for schema public (42501)` at the same `ALTER ... OWNER TO`.

**Root cause.** For a non-superuser, the **new owner** must hold `CREATE` on the object's schema.

### D3 — R13-VERIFY1 placeholder GUC (blocking)

**Repro** (with D1/D2 unblocked). R13-TX1 applies, then R13-VERIFY1 fails with `ERROR: permission denied to set parameter "bibleberry.award_issuance_account" (42501)` at `CREATE FUNCTION account_issuance.get_claim_verification_context ... SET bibleberry.award_issuance_account TO ''`. Minimal repro as `postgres`:

```sql
SET bibleberry.repro = 'x';                                                    -- allowed (session level)
CREATE FUNCTION public.sb1_repro() RETURNS int LANGUAGE sql
  SET bibleberry.repro TO '' AS 'select 1';                                    -- ERROR 42501
GRANT SET ON PARAMETER bibleberry.award_issuance_account TO postgres;          -- ERROR: permission denied
```

**Root cause.** Since PostgreSQL 15, attaching an unregistered placeholder GUC to a `CREATE FUNCTION ... SET` clause requires superuser or `SET` privilege on that parameter, and only a superuser can grant that. Supabase's `supautils.privileged_role_allowed_configs` allow-lists `pgrst.*`, `pg_net.*` and similar namespaces, but not `bibleberry.*`.

### D4 — R13-TX1 `auth` grant is a silent no-op (blocking)

**Repro.** The migration "succeeds", but every authenticated commit returns HTTP 403 `{"code":"42501","message":"permission denied for schema auth"}`. The migration session logs:

```
postgres@postgres WARNING:  no privileges were granted for "auth"
postgres@postgres WARNING:  no privileges were granted for "uid"
```

**Root cause.** Schema `auth` is owned by `supabase_admin`, and `postgres` holds `USAGE` on it **without** grant option (`postgres=U/supabase_admin`). The SECURITY DEFINER body and the reconciler RLS policies call `auth.uid()`, so **the client transaction cannot work on Supabase**. The `uid` warning is harmless, because `PUBLIC` already has EXECUTE on `auth.uid()`. These are the only two migration warnings; the runner fails on any other.

## 4. Local-only unblocks used for the real-stack tests

These are run only by the test runner, as the container's bootstrap superuser (`docker exec … psql -U supabase_admin`). They never appear in a migration and are impossible on hosted Supabase. Each is applied only **after** its defect has been reproduced and the failure proven clean.

| Defect | Unblock | Lifetime |
| --- | --- | --- |
| D1 | Pre-create `account_reconciler` and `account_award_issuer` with attributes identical to the migrations; `GRANT … TO postgres WITH INHERIT TRUE, SET TRUE` (what the migrations' own self-grant intended) | stack lifetime |
| D2 | `GRANT CREATE ON SCHEMA public TO account_reconciler`; `ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT CREATE ON SCHEMAS TO account_award_issuer` | **temporary**: revoked after the migrations apply, and verified absent (no account role holds `CREATE` on any schema; no default privilege names one) **before any test runs** |
| D3 | `GRANT SET ON PARAMETER bibleberry.award_issuance_account TO postgres` | stack lifetime |
| D4 | `GRANT USAGE ON SCHEMA auth TO account_reconciler` (exactly the privilege R13-TX1 intended) | stack lifetime |

None of these grants a client role, the issuer or the verifier anything beyond the accepted design. `SB1_STOP_AFTER_DEFECTS=1` stops after reproducing D1–D4, before the D3/D4 unblocks.

## 5. How to run (local, disposable, repeatable)

```bash
SUPABASE_CLI=/path/to/supabase ./scripts/accountSupabase/run-local-supabase-acceptance.sh
```

Optional settings: `SB1_IMAGE_REGISTRY=ghcr.io`, `SB1_STOP_AFTER_DEFECTS=1`, `SB1_KEEP_STACK=1` (keep the stack for inspection), and `SB1_DISPOSE_PREVIOUS_RUNNER_STACK=1` (see step 2).

The runner works through these steps:

1. **Preflight**, before any Docker or database access. It refuses if `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_URL`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`, `DATABASE_URL` or any libpq redirect variable is set. It also refuses if `supabase/.temp/project-ref` exists (a linked checkout), if `project_id` is not `bibleberry-sb1-local`, or if the Data API exposes anything beyond `public`/`graphql_public`.
2. **Resource ownership (fails closed).** If any container, volume or network of this project already exists, the runner exits **without stopping or removing anything**. The only disposal path is the documented opt-in `SB1_DISPOSE_PREVIOUS_RUNNER_STACK=1`, which acts only after it **proves** the stack came from an earlier run of this runner in this checkout:
   - the network carries `bibleberry.sb1=local` and a `bibleberry.sb1.owner` label, and forces `127.0.0.1` binding;
   - every project container was started from this working directory and is attached to that network;
   - volumes are removed only together with such a proven stack.

   Each run labels its network with a run-unique owner ID. Teardown removes only the network carrying that ID. It stops the project stack only because this step proved nothing pre-existed.
3. **Stack.** A fresh stack starts on a network created with `com.docker.network.bridge.host_binding_ipv4=127.0.0.1`. The CLI otherwise publishes ports on `0.0.0.0`. The runner asserts every published port is `127.0.0.1` and that the API and DB URLs are loopback. Ports are 55421 and 55422, not the CLI defaults.
4. **Migrations.** The runner checks the runner identity is `postgres`, non-superuser, and that the database has no `account_*` tables. It then applies **only the 3 accepted, unchanged migrations** with **`supabase migration up --local`**, **without** `00_local_supabase_auth_bootstrap.sql` (no fake `auth.users`, no `auth.uid()` override), and reproduces D1 → D4:
   - After each expected failure it asserts the exact error and the applied migration set.
   - For D1 and D2 it asserts that a full snapshot of account roles, memberships, **every schema ACL and every default privilege** is byte-identical to the snapshot taken just before the failing run. The CLI's own `supabase_migrations` history schema is excluded.
   - For D3, R13-TX1 legitimately applies in the same CLI run. The runner compares roles and memberships, then checks explicitly that no R13-VERIFY1 schema, table, role, policy, schema `USAGE` or `EXECUTE` grant survived.
5. **Unblocks and warning scan.** It applies the §4 unblocks, revokes the temporary D2 grants and verifies them gone, then scans the DB log for unexpected migration warnings.
6. **Suites.** It runs suites A and B and requires exactly `# pass 21`, `# fail 0`, `# skipped 0`.

## 6. Results matrix (real stack)

Latest complete run at this PR's head: exit 0. D1–D4 were reproduced, and every failure was proven clean. All 3 accepted migrations applied, the temporary D2 grants were verified revoked, only the 2 known warnings appeared, and the suites reported **21 pass, 0 fail, 0 skipped**.

**A — GoTrue + PostgREST (`tests/accountSupabase/authPostgrestBoundary.supabase.test.ts`).** Users sign up and sign in through real GoTrue with random in-memory passwords. Every request carries the local **publishable** key.

| # | Proven over real HTTP | Result |
| --- | --- | --- |
| A1 | Sessions are ES256 JWTs with `role=authenticated` and `sub` = real `auth.users.id`; `/auth/v1/user` works; schema has the 12 `account_*` tables | pass |
| A2 | Fresh account returns `{"status":"notFound"}`. Anon gets **HTTP 401** `42501` (privilege denial, not function JSON) on both RPCs | pass |
| A3 | A's `newAccountTransfer` via `/rest/v1/rpc/reconcile_guest_participation` commits rev 1. **Every written row has `account_id = A`** (checked database-side), nothing for B, so `auth.uid()` = A inside the SECURITY DEFINER body. Explicit Shelf `isProtected` false/true is stored exactly | pass |
| A4 | Same key with a different guest fingerprint returns `conflict/idempotencyPayloadMismatch`. The award claim is quarantined (in `pendingAwardVerification`, not in `earnedAwards`), and the receipt has `unresolved_persisted_on_server = false` | pass |
| A5 | B reads only B. On all 10 client-readable tables B gets `[]`, even when filtering `account_id=eq.A`. The 2 VERIFY1 audit tables return 401/403 `42501` | pass |
| A6 | POST, upsert, PATCH and DELETE on **all 12** tables, as anon and as A, return 401/403 `42501`; A's row count is unchanged | pass |
| A7 | B sends `accountId = A` in body and envelope plus forged `Role`, `X-Jwt-Claim-Sub` and `Request.Jwt.Claim.Sub` headers: HTTP 200 `unauthorized/accountMismatch`, zero writes. The same headers on B's own payload commit **to B** | pass |
| A8 | Malformed, tampered (sub swapped), `alg:none`, wrong-key HS256 and expired (validly signed) tokens return **HTTP 401 `PGRST30x`** before any SQL runs, on both RPCs | pass |
| A9 | The legacy `service_role` JWT and the `sb_secret_` key get `42501` on both client RPCs | pass |
| A10 | B `existingAccountMerge` commits rev 2. A stale `expectedRevision` returns `conflict/revisionMismatch`; an exact replay returns `alreadyCommittedDuplicate` with the original receipt | pass |
| A11 | 6 concurrent HTTP writers at the same revision: exactly 1 `committed`, 5 `revisionMismatch`; receipts `[1,2,3]` | pass |
| A12 | `Content-Profile`/`Accept-Profile` set to `account_issuance`, `account_private` or `auth` returns **406 `PGRST106`** for anon, A and service_role. Issuance and helper names on `/rpc/` return **404 `PGRST202`** | pass |
| A13 | `pg_graphql` is **not installed** on this image; `/graphql/v1` serves no schema or account data (§8) | pass (limited) |

**B — dedicated verifier login + private issuance (`tests/accountSupabase/verifierRoleIssuance.supabase.test.ts`).** `postgres` creates an ephemeral `LOGIN` role with a random password and grants it `account_award_verifier`. The role connects directly over loopback and is dropped afterwards.

| # | Proven | Result |
| --- | --- | --- |
| B1 | Owner and group roles are `NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT`, and logging in as them fails. For the login, `session_user = current_user = login`; it is not a superuser and has no BYPASSRLS | pass |
| B2 | `SET ROLE account_award_verifier` works. `SET ROLE` to issuer, reconciler, postgres, service_role, authenticated, anon, supabase_admin or authenticator is denied | pass |
| B3 | No table, `auth.users`, client RPC, `account_private` or issuer-internal access, even with a hand-set `request.jwt.claims` | pass |
| B4 | Pending-claim listing returns identifiers and dates only. Verification context returns data only for an existing claim; otherwise `noPendingClaim` | pass |
| B5 | Deferral is private; the reader's readback is byte-identical | pass |
| B6 | Self-asserted field: rejected. Cross-account or unclaimed award: `noPendingClaim`. Foreign basis: `basisNotInAccountCompletions`. Valid claim: `admitted`; replay: `alreadyEarned`. The owner sees the trusted card | pass |
| B7 | A client re-skin cannot change the earned snapshot or date; flags still OR. Old receipts are immutable; only a fresh reconcile clears | pass |
| B8 | Catalog checked under Supabase default privileges: anon executes nothing; service_role executes no account function; authenticated executes only the 2 client RPCs; the verifier group only the 4 issuance functions. No anon table privilege, no authenticated write privilege, RLS enabled on all 12 tables, private audit tables closed, no owner role touches `auth.users` | pass |

**`auth.uid()`.** Supabase's real `auth.uid()` reads `request.jwt.claim.sub`, falling back to `request.jwt.claims->>'sub'`. PostgREST 16.5 sets only the latter, from the verified JWT. A3 and A7 prove it resolves to the JWT subject inside the definer body, and that no HTTP header can set it.

## 7. Regression and parity (at this PR's head)

| Command (plain PostgreSQL 16.15, fresh socket-only cluster, TCP disabled, fresh DB each) | Result |
| --- | --- |
| `run-local-rls-tests.sh` | passed |
| `run-local-transaction-tests.sh` (unchanged from `main`) | passed, 250 assertions |
| `run-local-verify1-tests.sh` (unchanged from `main`) | passed, 334 assertions plus end-to-end proof 1/1, 0 skipped |
| `node --experimental-strip-types --test tests/accountDatabase/*.test.ts` | 17 passed |
| `runLocal{Rls,Transaction,Verify1}Guard.test.sh` | passed |
| `tests/accountSupabase/runLocalSupabaseGuard.test.sh` | passed (§11) |
| `npm run lint`, `npm run build`, `git diff --check` | passed |

The plain-PG harness's superuser runner and simulated `auth` **masked D1–D4**. It remains valid for SQL logic, but not for Supabase role and grant behaviour.

## 8. Observations, unresolved assumptions and limits

1. **GraphQL not proven.** The local image has no `pg_graphql`. Hosted projects commonly enable it, and it would expose the account tables and RPCs that `authenticated` can reach, still RLS-bound. Re-test there.
2. **Supabase default privileges in `public` grant ALL** on new tables and functions to anon, authenticated and service_role. The accepted explicit REVOKEs hold (B8). Every future migration must revoke explicitly; the runner's warning scan catches silent no-op grants.
3. **service_role table access** to the 10 client-visible account tables is by R13-3 design. It was confirmed from the migrations but not exercised over HTTP.
4. **Per-commit `unresolvedPersistedOnServer`.** A payload that omits a still-pending server claim receives `true`. This is consistent with TX1 §6 and V3b, but the adapter must never send partial envelopes.
5. **Legacy HS256 secret.** Its holder can mint any identity, so it must stay server-only. A8 used only the local default secret, and only to mint an expired token.
6. **Not tested here:** Docker Desktop (macOS), the default ECR image path, hosted Supabase (forbidden), and the verifier runtime and adapter (out of scope).

## 9. Review response (PR #224, review of `91a01c8`)

| Finding | Resolution |
| --- | --- |
| **1. Privileges left elevated on the known failure path.** The prerequisite migration committed temporary `CREATE` grants that only the cleanup migration revoked, after R13-VERIFY1, which fails (D3). | **Both migrations removed from this PR.** A grant and its revoke are only safe in **one transaction**, which is impossible across separate migration files. The corrections belong inside the owner-authorized remediation (§10), where an aborted migration rolls everything back. The runner now applies only the accepted migrations and **tests the post-failure catalog after every expected failure, before any unblock** (§5 step 4). The temporary harness D2 grants are verified revoked before tests. |
| **2. Destructive stack ownership not checked.** The runner ran an unconditional `supabase stop`, and reused or removed a same-named network. | **Fails closed** on any pre-existing project container, volume or network; disposes only a stack whose ownership is proven, and only with the documented opt-in (§5 step 2). Teardown touches only resources carrying this run's owner ID. Guard regressions cover 9 collision cases (§11). The old unconditional stop was re-inserted to confirm the test fails, then removed. Real-Docker checks: a kept stack is refused by default and disposed with the opt-in; a foreign same-named network is refused and left intact even with the opt-in. |

**Recovery if someone applied the `91a01c8` migration sequence.** That sequence was never merged or deployed. Running it with `supabase migration up --local` stops at D3 and leaves `CREATE ON SCHEMA public` for `account_reconciler`, `CREATE ON SCHEMA account_private` for `account_award_issuer`, and a default `CREATE`-on-schemas privilege for `account_award_issuer`. For a disposable stack, run `supabase stop --no-backup`. To repair in place instead, run this as `postgres`:

```sql
REVOKE CREATE ON SCHEMA public FROM account_reconciler, account_award_issuer;
REVOKE CREATE ON SCHEMA account_private FROM account_reconciler, account_award_issuer;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE CREATE ON SCHEMAS FROM account_award_issuer;
-- verify: both must return 0 rows
SELECT r.rolname, n.nspname FROM pg_namespace n CROSS JOIN pg_roles r
 WHERE r.rolname LIKE 'account\_%' AND has_schema_privilege(r.oid, n.oid, 'CREATE');
SELECT * FROM pg_default_acl d, aclexplode(d.defaclacl) a
 WHERE a.grantee IN (SELECT oid FROM pg_roles WHERE rolname LIKE 'account\_%');
```

Then delete that stack's `supabase_migrations.schema_migrations` rows for `20261118000000` and `20261118000003`, or simply recreate the stack.

## 10. Recommended D1–D4 remediation (**NOT implemented, awaiting Aaron's decision**)

**Recommendation: amend R13-TX1 and R13-VERIFY1 in place, before first deployment, under a separately scoped issue.** Nothing has been deployed, so no hosted migration history needs preserving. Every correction then lives inside the migration it corrects, in the same transaction, so any failure rolls back completely and nothing can be stranded. The alternatives are worse:

- **Corrective migrations after the accepted files** cannot run, because D1 and D3 abort those files first.
- **Prerequisite and cleanup pairs** strand privileges (review finding 1).
- **Platform superuser grants** are not self-serve and are unverifiable.
- **Making the reconciler a member of `authenticated`** broadens the least-privilege owner role, including Supabase's default grants on future `public` objects.

The three design premises below were **prototype-checked on a disposable real stack** (scratch objects only, then discarded). Nothing is committed.

| Defect | Proposed change (in the accepted file, same transaction) | Prototype result on real Supabase |
| --- | --- | --- |
| D1 | Replace the `pg_has_role(..., 'MEMBER')` guard with: if not superuser and not (`SET` and `USAGE`), then `GRANT <role> TO current_user WITH INHERIT TRUE, SET TRUE`. This is exactly what the original self-grant intended. | `postgres` creates the role, has `SET=false USAGE=false`, self-grants, then `OWNER TO` succeeds |
| D2 | Wrap each `OWNER TO` block: `GRANT CREATE ON SCHEMA <s> TO <owner>` … `ALTER … OWNER TO` … `REVOKE CREATE ON SCHEMA <s> FROM <owner>`, then an in-migration assertion that no owner role keeps `CREATE`. For R13-VERIFY1, grant `CREATE` on `account_issuance` (created in the same file), so no default privilege is needed. | Owner assigned, ACL `{owner=X/owner}`, `CREATE` false after the revoke. **On a forced error after the grant, the whole transaction rolls back: role gone, ACL clean** |
| D3 | Remove the function-level `SET bibleberry.award_issuance_account TO ''` clause from the 3 issuance functions. At **entry** each function resets the setting with `set_config(..., '', true)` before setting its own account, and the confining policies are unchanged. Scope becomes transaction-local instead of call-local, so every issuer function must reset it on entry. | Created by `postgres`, owned by the issuer, no superuser needed. **A value preset by the caller is ignored**; the function's own account is used |
| D4 | Add `account_private.request_account_id()`: `SECURITY DEFINER`, owned by `postgres` (which has `auth` USAGE), `SET search_path = ''`, body `SELECT auth.uid()`. EXECUTE goes to `account_reconciler` only and is revoked from PUBLIC, anon, authenticated and service_role. Use it in place of `auth.uid()` in the reconcile body and the 10 reconciler RLS policies, and drop the 2 no-op `auth` grants. The R13-3 `authenticated` policies keep `auth.uid()`. | As `account_reconciler` with claims for a test sub, the helper returns that sub while direct `auth.uid()` is denied. Anon, authenticated and service_role cannot execute it |

**Review points for D3/D4 before implementation:**

- The D3 confinement change from call scope to transaction scope needs mutation tests: a caller preset, a second account in the same transaction, and an exception path.
- D4 adds one tiny `postgres`-owned definer function. `postgres` has BYPASSRLS, so its body must stay a single `auth.uid()` call with an empty `search_path`.

**Acceptance for the remediation PR:**

- This runner, with the D1–D4 reproductions **inverted** (the accepted files must apply with **zero** unblocks and **zero** migration warnings), passes 21/21.
- The plain-PG runners still pass (250 / 334 + E2E).
- New SQL assertions cover the helper's grants and owner, the absence of owner-role `CREATE`, and preset-GUC resistance.
- Mutation checks: restoring the `MEMBER` guard, removing the revoke, or removing the entry reset must each fail a suite.

## 11. Runner guard tests

`tests/accountSupabase/runLocalSupabaseGuard.test.sh` runs anywhere without Docker. Every case must exit 2, and the collision cases are also checked to issue **no** `supabase stop/start/migration` and no `docker network create/rm`, `rm` or `exec`.

- **Preflight (14 cases).** Each redirecting environment variable is refused. A linked checkout, a foreign `project_id`, an exposed private schema and a missing CLI are each refused.
- **Collisions (9 cases, stubbed `docker`/`supabase`).**
  - By default: an existing container, an existing volume, or a same-named network is refused.
  - With the opt-in, the following are still refused:
    - an unlabelled network;
    - a non-loopback runner network;
    - a container from another checkout;
    - a container off the runner network;
    - orphaned volumes;
    - project resources without a runner network.

## 12. Cleanup

The runner tears down on exit only what it created. Use `SB1_DISPOSE_PREVIOUS_RUNNER_STACK=1` for a stack kept with `SB1_KEEP_STACK=1`, or after checking what it is, `supabase stop --no-backup` and `docker network rm bibleberry_sb1_loopback`. Test users and the ephemeral verifier login exist only inside the disposable stack, and suite B drops the login.

## 13. Secrets and redaction

Keys, JWTs and passwords are read from `supabase status` into in-memory environment variables and never printed. The `supabase start` status JSON is dropped. All CLI and test output is redacted: JWTs, `sb_publishable_`/`sb_secret_` keys, `"…KEY|SECRET|PASSWORD|TOKEN…":"value"` fields, and DB URL credentials. A grep of the complete passing run logs for JWT, key, secret and DB-credential patterns found **0** matches. No user JWT, admin key, service-role token, OTP or password is committed or logged.
