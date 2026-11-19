# R13-SB2 — Real-Supabase Migration Compatibility Remediation (D1–D4)

> **Issue:** [#225](https://github.com/Bibleberry/Bibleberry/issues/225), Cobalt Finch (Phase 05 / R13-SB2). Follows [#210](https://github.com/Bibleberry/Bibleberry/issues/210) and PR [#224](https://github.com/Bibleberry/Bibleberry/pull/224) (R13-SB1).
> **Baseline `main`:** `8289322`
> **Environment:** disposable local stack on loopback only. No hosted Supabase project, Sanity dataset or real user was used, and no `supabase login`/`link`/`db push` or `--remote`/`--linked`/`--db-url` path was run.
> **Status:** all D1–D4 corrections are implemented and proven on a **local** real Supabase stack. This is **not** hosted deployability proof, and nothing was deployed.

---

## 1. Verdict

| Question | Result |
| --- | --- |
| Do R13-3, R13-TX1 and R13-VERIFY1 apply, in order, under the real Supabase CLI runner (`postgres`, non-superuser)? | **Yes.** Zero pre-unblocks, no superuser access path, no synthetic `auth` bootstrap, **zero WARNINGs** (§5). |
| Is the security model preserved on real GoTrue/PostgREST? | **Yes.** 21/21 existing real-stack tests pass, plus 8 new D1–D4 tests (29/29). |
| Is every correction protected against regression? | **Yes.** 13 mutation demonstrations on a real stack: every restored defect is caught, and every failed migration strands nothing (§6). |
| Plain PostgreSQL regression? | Pass: TX1 263 assertions (was 250), VERIFY1 364 (was 334) plus E2E 1/1, R13-3 RLS (§7). |

## 2. One-time in-place amendment (migration policy exception)

The two files were corrected **in place**, as the issue authorized. This is a **one-time exception** to forward-only practice and must not become general policy.

**Hosted-history check (repository evidence, before editing):**
- No `supabase/.temp/project-ref` exists, so the checkout has never been linked.
- `supabase/config.toml` is the local-only `bibleberry-sb1-local` project.
- No CI workflow (`.github/workflows/*`) references Supabase.
- Every `db push`/`link`/`supabase.co` occurrence in the repo is a refusal guard or documentation.
- SB1 already proved that D1 aborts R13-TX1 and D3 aborts R13-VERIFY1 on Supabase, so neither file could ever have been applied to a hosted project.

No hosted migration history was found. Each file carries a `Revision R13-SB2` header that lists its changes. R13-3 is unchanged.

## 3. Corrections

| Defect | Change (inside the affected migration's own transaction) |
| --- | --- |
| **D1** SET ROLE ownership | The runner self-grant is guarded by `pg_has_role(…,'SET') AND pg_has_role(…,'USAGE')`, not `'MEMBER'`, and grants `WITH INHERIT TRUE, SET TRUE`. A post-grant assertion fails the migration if the runner still cannot SET or inherit. This applies to `account_reconciler` (TX1) and `account_award_issuer` (VERIFY1). Superusers skip it as before, so the plain-PG runner is unaffected. |
| **D2** schema CREATE | `GRANT CREATE ON SCHEMA public TO account_reconciler` → `OWNER TO` → `REVOKE`. VERIFY1 does the same on `account_issuance` (created in the same file) around the 5 `OWNER TO`. Each migration then asserts that no `account_*` role holds CREATE on any schema and that owners are correct. No default-privilege or global grant is used. |
| **D3** issuance GUC | The function-level `SET bibleberry.award_issuance_account TO ''` is removed from the 3 issuance functions. Each function's **first statement** is `set_config(…, '', true)`; it then confines itself to its own account as before. VERIFY1 asserts that no issuance function carries a `bibleberry.*` clause. |
| **D4** `auth.uid()` under the definer | The two no-op grants (`USAGE ON SCHEMA auth`, `EXECUTE ON auth.uid()`) are dropped. `account_private.request_account_id()` is SQL, `STABLE`, `SECURITY DEFINER`, owned by the runner (`postgres` on Supabase), `SET search_path = ''`, zero arguments, body exactly `SELECT auth.uid();`, and EXECUTE is granted to `account_reconciler` only. It is used by the reconcile body and the 10 reconciler RLS policies. VERIFY1 explicitly revokes it from `account_award_issuer`, because VERIFY1's `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA account_private` would otherwise include it. The R13-3 `authenticated` policies keep `auth.uid()`. |

### Deviations from the SB1 §10 sketch (found by testing)

1. **A third `auth.uid()` call site.** The reconcile body calls `public.get_account_participation()` (SECURITY INVOKER) three times, so its `auth.uid()` also ran as `account_reconciler`. It now uses `auth.uid()` when the caller has `auth` USAGE (`authenticated` via PostgREST) and the bridge otherwise. Any other caller fails closed with a permission error. Both sources return the same verified JWT subject. PL/pgSQL plans each branch only when it is reached.
2. **The account_private `ALL FUNCTIONS` grant to the issuer** would have handed it the bridge. It is now revoked, and mutation M-D4d proves the check catches this.
3. **D3 scope.** Confinement is now transaction-local instead of call-local. Only `account_award_issuer`'s policies read the setting, that role runs only inside these definer functions, and each one resets on entry. No function touches a confined table before it confines itself, so the entry reset is defence in depth. Tests cover what remains observable: caller presets, early returns, two accounts in one transaction, handled and propagated exceptions, and replay.
4. **Temp-schema false positive.** `has_schema_privilege(role, pg_temp_N, 'CREATE')` is true for any role with TEMP on the database, inside the session that owns that temp schema. All "no CREATE" checks exclude `pg_temp_*`/`pg_toast_temp_*` (only the current session's own temp schema; no grant is involved).

`docs/architecture/r13-verify1-trusted-card-admission.md` line 83 still describes the old call-scoped `SET` clause. That file is outside this issue's write scope, so this section supersedes it; correcting it should be a follow-up.

### Residual risks (documented, accepted by design)

- **The bridge owner `postgres` has BYPASSRLS.** The body is one `auth.uid()` call with an empty search_path, no arguments, no table and no dynamic SQL. Its ACL is guarded by static, plain-PG, real-stack catalog and mutation checks (M-D4c, M-D4e).
- **The runner keeps `SET` + `INHERIT` membership in both owner roles.** This is the original intent: it lets later migrations manage the owned functions. No other role is a member, and no account role is a member of anything (C1, check D1).

## 4. Environment and exact versions

| Component | Version |
| --- | --- |
| Host | Claude Code cloud container, Linux 6.18 x86_64; Docker Engine 29.10.0 started in the container |
| Supabase CLI | **3.2.0** (npm `supabase@3.2.0`, installed outside the repo; not added to `package.json`) |
| Database | `ghcr.io/supabase/postgres:17.12.0.000` (PostgreSQL 17.12) |
| Auth / Data API | `gotrue:v2.198.0`, `postgrest:v16.5`, `kong:2.8.1` (pulled via `SB1_IMAGE_REGISTRY=ghcr.io`) |
| Plain-PG regression | PostgreSQL 16.15, fresh socket-only cluster (`listen_addresses=''`), fresh database per runner |
| Node / psql | Node v22.23.5, psql 16.15 |

## 5. Acceptance run (default mode)

```bash
SUPABASE_CLI=/path/to/supabase SB1_IMAGE_REGISTRY=ghcr.io ./scripts/accountSupabase/run-local-supabase-acceptance.sh
```

The runner reuses the unchanged SB1 preflight, fail-closed resource ownership, loopback-only stack and redaction. It then:

1. Applies all 3 migrations with `supabase migration up --local` as `postgres` (non-superuser). **The runner has no superuser path:** `superuser_sql`/`docker exec` were removed, and a guard test fails if one returns.
2. Fails on **any** WARNING or ERROR the migration session logs. The single allowed line is the CLI's own first-run probe of its history table (`SELECT version FROM supabase_migrations.schema_migrations`, followed by its `CREATE SCHEMA IF NOT EXISTS supabase_migrations`).
3. Runs `tests/accountSupabase/sb2RemediationChecks.sql` as `postgres` inside a rolled-back transaction. It covers the D1–D4 catalog, D4 runtime (bridge returns the session subject, follows a changed subject, the reconciler cannot call `auth.uid()`, the `authenticated` reconcile/read work, `authenticated` cannot use the bridge) and D3 runtime (caller presets discarded).
4. Runs suites A, B and C, and requires exactly `# pass 29`, `# fail 0`, `# skipped 0`.

**Result:** exit 0. All 3 migrations applied, the warning scan found nothing, all 7 check groups passed, and the suites reported 29 pass, 0 fail, 0 skipped.

| Suite C (`tests/accountSupabase/migrationRemediation.supabase.test.ts`) | Result |
| --- | --- |
| C1 D1: runner `postgres` (non-superuser) is the only member of the owner roles, with SET+INHERIT; owners transferred; no account-role memberships | pass |
| C2 D2/D3: no owner CREATE, default privilege, `bibleberry.*` parameter ACL or function GUC clause | pass |
| C3 D4: bridge definition and ACL exact (EXECUTE: `account_reconciler` only of anon, authenticated, service_role, authenticator, issuer, verifier); reconciler has no `auth` USAGE | pass |
| C4 D4: `/rpc/request_account_id` returns 404 `PGRST202`; `Content-Profile: account_private` returns 406 `PGRST106` (anon, user, service_role) | pass |
| C5 D4: two real GoTrue users each commit through the definer body. The committed snapshot (reconciler branch) and the reader (authenticated branch) return only the caller's data, and DB-side rows belong only to the writing subject | pass |
| C6 D4: F sends `accountId = E` plus a forged `X-Jwt-Claim-Sub`: `unauthorized/accountMismatch`, zero writes | pass |
| C7 D3: a real verifier login with session-level and local presets of the other account: early return leaves `''`; context returns only E's completions and confines to E; rejection leaves `''`; a preset alone grants no table access | pass |
| C8: no account role appears in the `auth` schema or `auth.uid()` ACLs; anon table access denied | pass |

Suites A (13) and B (8) are unchanged from SB1 and still pass on the corrected migrations.

## 6. Mutation / regression demonstrations (`SB2_MUTATION_DEMOS=1`)

```bash
SUPABASE_CLI=/path/to/supabase SB1_IMAGE_REGISTRY=ghcr.io SB2_MUTATION_DEMOS=1 ./scripts/accountSupabase/run-local-supabase-acceptance.sh
```

This runs on its own fresh stack, after the same preflight and ownership gate. Each mutation is applied with `perl` to a copy of `supabase/` under `mktemp -d`, **never the checkout**. Runner-level failures use the real CLI (`supabase --workdir <copy> migration up --local`). After each one, the full privilege snapshot (account roles, memberships, every schema ACL, every default privilege, every parameter ACL) must be byte-identical and no owner CREATE may remain. Mutations that apply cleanly run with the check file inside one transaction, as `postgres`, which is then rolled back.

| # | Mutation | Caught by | Result |
| --- | --- | --- | --- |
| M-D1 | restore the `'MEMBER'` guard (TX1) | CLI: `must be able to SET ROLE` | pass, nothing stranded |
| M-D2a | drop the CREATE grant (TX1) | CLI: `permission denied for schema public` | pass, nothing stranded |
| M-D2b | drop the CREATE revoke (TX1) | CLI: in-migration D2 assertion | pass, nothing stranded |
| M-RB | forced error right after the CREATE grant (TX1) | CLI: forced error; **grant rolled back with the object** | pass, nothing stranded |
| M-CTRL | positive control (unmutated) | all checks pass | pass |
| M-D4a | reconcile body uses `auth.uid()` directly | `permission denied for schema auth` | pass |
| M-D4b | one reconciler policy uses `auth.uid()` directly | check D4e | pass |
| M-D4c | bridge EXECUTE granted to `service_role` after every revoke | check D4b | pass |
| M-D4d | issuer keeps the bridge (VERIFY1 revoke removed) | check D4b | pass |
| M-D4e | bridge body widened to read `auth.users` | check D4a | pass |
| M-D3a | entry resets removed (VERIFY1) | check D3c (caller preset survived) | pass |
| M-D3b | function-level GUC clause restored (VERIFY1) | CLI: `permission denied to set parameter` | pass, nothing stranded |
| M-D2c | drop the `account_issuance` CREATE revoke (VERIFY1) | CLI: in-migration D2 assertion | pass, nothing stranded |

Before the VERIFY1 demos, the unmutated TX1 is applied on its own (from a copy without VERIFY1), so each VERIFY1 failure is compared against the full snapshot. Finally the unmutated VERIFY1 applies from the checkout and all checks pass. **Result:** exit 0.

The first M-D4c attempt (adding `authenticated` to the bridge GRANT) was correctly **not** detected: TX1's later blanket `REVOKE ALL ON ALL FUNCTIONS IN SCHEMA account_private FROM PUBLIC, anon, authenticated` neutralizes it. The mutation was moved after every revoke so that it really survives.

## 7. Regression and parity

| Command | Result |
| --- | --- |
| `run-local-rls-tests.sh` (PG 16.15, fresh DB) | passed |
| `run-local-transaction-tests.sh` | passed, **263** assertions (250 + 13 new: S1g updated, S1h1–S1h10, S1i1–S1i3) |
| `run-local-verify1-tests.sh` | passed, **364** assertions (334 + 13 + 17 new V10a–V10q) plus end-to-end proof 1/1, 0 skipped |
| `node --experimental-strip-types --test tests/accountDatabase/*.test.ts` | 24 passed (17 + 7 new SB2 static guards) |
| `runLocal{Rls,Transaction,Verify1}Guard.test.sh` | passed |
| `tests/accountSupabase/runLocalSupabaseGuard.test.sh` | passed (SB1 cases plus: mutation mode still fails closed on collisions; no superuser/pre-unblock path; mutations edit only throw-away copies) |
| `npm run lint`, `npm run build`, `git diff --check` | passed |

## 8. Not done / limits

- **No hosted validation.** Hosted Supabase may differ: GraphQL (SB1 §8.1), platform role grants, a different `supautils` allow-list. Re-run the acceptance on a staging project before any deployment, under its own authorization.
- The runner was exercised only on Linux Docker Engine with GHCR images (as in SB1).
- The verifier runtime and account transport remain out of scope (separate issues).

## 9. Secrets

The SB1 redaction applies unchanged to every new output path. Suite C's verifier login uses a random in-memory password and is dropped afterwards. No key, JWT or password is committed or printed.
