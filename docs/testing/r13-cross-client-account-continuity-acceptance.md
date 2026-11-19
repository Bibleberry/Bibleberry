# R13 — Cross-Client Account Continuity: Real Local Acceptance (Quartz Meadow)

> **Issue:** [#246](https://github.com/Bibleberry/Bibleberry/issues/246) · **Codename:** Quartz Meadow · **Builder:** Claude Opus (Claude Code)
> **Baseline `main`:** `1eacda5` (includes Cinnamon Bear #235, Copper Heron #234 and Granite Sparrow #238, all confirmed merged before work started)
> **Status:** acceptance engineering only. **Test-only** additions plus one runner extension. No `src/**`, migration, `supabase/config.toml`, workflow, CI-matrix, hosted service or credential change.

**What this proves:** on a disposable, loopback-only local Supabase stack, the **production** client account layer works end to end against real GoTrue and real PostgREST. That layer is `SupabasePostgrestTransport` → `coordinateGuestSync` → the post-SB3 SQL RPCs → the private Card verifier. One reader's progress moves between two simulated devices signed into the same account. Unverified Cards stay quarantined, and guest data is never cleared without a qualifying durable receipt.

**What this does not prove:** installed Android/iOS behaviour, native persistence, two physical devices, hosted Supabase, real Google/Apple/OTP sign-in, production credentials or the real Sanity project. See §5.

---

## 1. What was added

| File | Change |
| --- | --- |
| `tests/accountSupabase/crossClientContinuity.supabase.test.ts` | **New suite F** (12 tests). Opt-in like A–E: it skips without the runner's stack. |
| `scripts/accountSupabase/run-local-supabase-acceptance.sh` | Suite F joins the A–E run, so the exact expected pass count goes from **50 to 62**. A new step then runs the existing Cinnamon Bear test (`tests/accountSync/supabasePostgrestTransport.local.test.ts`) with its documented flags against the same stack. It must report exactly `pass 1 / fail 0 / skipped 0`. Suite F observations (test diagnostics) are echoed through `redact`. No other runner behaviour changed: preflight, ownership, loopback checks, migration stages, warning scan, teardown and redaction are untouched. |
| this document | Handoff. |

The suite reuses the existing guard helpers (`tests/accountSupabase/lib/localStack.ts`: loopback assertions, `redact`, `http`/`rpc`, `psql`), the trusted synthetic month (`tests/accountVerification/fixtures.ts`) and the accepted verifier CLI entry (`runVerifierCli`). It adds no new auth or sync architecture. A–E were not duplicated: they drive the SQL through raw `/rest/v1/rpc` calls, while F drives it through the production client modules.

### Simulated devices

A *device* in suite F is:

- its own in-memory guest store (a V2 guest envelope plus the isolated Shelf state), exposed through a `GuestStorageAccessor`;
- its own `SupabasePostgrestTransport` instance (publishable key only), whose `fetch` is a tap that logs requests and can wrap a single call;
- its own GoTrue **password-grant session**. Device B signs in separately, gets a different JWT and a different `session_id`, and has the same `sub`.

All devices run in one Node process. They are independent in state, transport and session, but they are **not** separate processes, apps or phones.

## 2. Deliverable A — Cinnamon Bear's opt-in transport test, actually executed

`tests/accountSync/supabasePostgrestTransport.local.test.ts` was not run in PR #235. It has now been run **unchanged**:

1. Standalone, against a guarded stack kept with `SB1_KEEP_STACK=1` from the unmodified-`main` baseline run:
   `BIBLEBERRY_RUN_LOCAL_SUPABASE_TRANSPORT=1 BIBLEBERRY_LOCAL_SUPABASE_URL=<SB1_API_URL> BIBLEBERRY_LOCAL_SUPABASE_PUBLISHABLE_KEY=<publishable key> node --experimental-strip-types --test tests/accountSync/supabasePostgrestTransport.local.test.ts`
   → **1 pass / 0 fail / 0 skip**.
2. Inside the extended runner, on both migration paths (§4) → **1 pass / 0 fail / 0 skip**.

It works against the merged post-SB3 migrations. **No breakage was found, and no production transport or schema change was needed.**

## 3. Deliverable B — scenario / evidence matrix

Legend: **Real** = a real GoTrue/PostgREST/Postgres round trip whose server effect is asserted. **Injected** = the failure or clock is simulated around the real fetch, and the case says whether the server actually committed.

| # | Scenario | Path | What is asserted | Result |
| --- | --- | --- | --- | --- |
| F1 | Device A guest → **new account** | Real (coordinator → transport → `reconcile_guest_participation`) | `committed`, `newAccountTransfer`, receipt revision 1. The exact event order is guest read → `get_account_participation` → commit request → commit **response** → guest re-read → clear (`verifiedDurableCommit`), so nothing is removed before the receipt arrives. The JWT appears only in the header. Readback has completions (`clientReported`), positions, saved Challenge, saved Scripture, last-opened, and Shelf `2026-08 readerSelected/protected` plus **`2026-09 autoAdmitted/isProtected:true`** (a non-default protection that survived) | pass |
| F2 | Device B, **same account, own session and store**: recovery, then merge | Real | B's first read equals A's committed envelope byte for byte. B's merge (`existingAccountMerge`, revision 2): duplicate completion and saves deduplicated (4 completion rows, 2 Scripture rows); the earliest saved dates kept; same-screen position gets `max(updatedOn)`; completing day 7 removes its in-progress row; later last-opened wins. **Account Shelf precedence:** B's `2026-10` is returned as `preservedInLibraryNotOnShelf` and A's Shelf, including `isProtected`, is unchanged. B's guest is cleared on a clean receipt. **A then reads the identical union** | pass |
| F2b | Conflicting credible date and undecidable reading position | Real | The completion date is immutable on the server (stays `2026-09-04`). The distinct `screenId` keeps the account position, flagged `unresolvedConflict`. Both items are persisted as server evidence. Receipt `unresolvedPersistedOnServer: true`, but the decision is `reconciliationRequiresRetention`, so **B's guest is kept** | pass |
| F3 | Different user C: isolation | Real (plus one client-side refusal) | C reads `notFound` for A. (1) The transport refuses a payload naming A before sending anything. (2) **Exchanged token** (C's JWT as an "A" session): the read fails closed (C's own envelope is rejected, and A's data is never returned); the commit gets **server** `unauthorized/accountMismatch`; the coordinator stops without clearing. (3) A's JWT presented as a "C" session gets server `accountMismatch`. (4) A forged `accountId` in the body only, then in the envelope only, gets server `accountMismatch`. **A's rows and every account table are byte-identical** before and after (admin digest) | pass |
| F4 | Monthly Card: pending → earned | Real (verifier runs as a dedicated `account_award_verifier` LOGIN, against the synthetic published month) | A nominates `card:monthly:2026-09:shepherd-theme` (days 1 and 3 complete) with a **forged client snapshot**. C nominates a forged `full-month` claim. Both commits succeed with `unresolvedPersistedOnServer: false` and decision `unresolvedNotPersistedOnServer`, so **both guests keep their Cards**. The claim is in quarantine, not in `account_earned_awards`, absent from both devices' `earnedAwards`, and listed by ID only in `pendingAwardVerification` (forged art never exposed). After the verifier: A's claim is admitted with attestation key `<RUN_ID>.b1`; **both devices read the earned Card with the trusted CMS snapshot**, never the forged one. C's claim stays quarantined with `notEligibleUnderCurrentRoster`, and C has 0 earned rows. **Verifier replay:** earned rows byte-identical, attestation count and account revision unchanged. A re-syncs its retained guest: the receipt now qualifies (`verifiedDurableCommit`), so the guest is cleared and `cardViewed` is ORed in without re-skinning. C's re-sync still blocks clearance | pass |
| F5a | **Lost ACK** | **Real commit + simulated response loss** (the server committed and answered; the client never saw it) | The coordinator retries with the **same idempotency key** and gets `alreadyCommittedDuplicate` with the **original** receipt (revision 1). Exactly one receipt row, revision 1 (no double application). Clearance happens only after the replayed receipt | pass |
| F5b | Network down | **Purely injected** (the commit request never leaves) | `networkError` after 2 attempts. No profile row, no receipt, guest kept | pass |
| F5c | Concurrent commits from two devices | **Real** revision conflict (K1 really commits between K2's read and K2's commit) | K2 gets a real `revisionMismatch`, then re-fetches and re-merges: committed at revision 3 with the union of both devices. With `maxRetries: 1`, the conflict surfaces, K2' wrote nothing and its guest is kept. **Idempotency-key reuse** with a different guest payload is a terminal conflict that writes nothing and keeps the guest | pass |
| F5d | Session expiry mid-sync | **Injected clock** (the real token's `exp` is made to pass between read and commit) | `authFailure`. The commit RPC is never sent, there is no account row, and the guest is kept | pass |
| F5e | Sign-out mid-sync through the accepted **`AccountSessionController`** | Real read, then controller sign-out. The provider is the in-repo `MockAuthProvider` **carrying the real GoTrue JWT** (no Supabase Auth provider adapter exists) | Commit blocked, state `guest`, no account row, guest kept. A real GoTrue logout then gives 204 and `/auth/v1/user` refuses the token. **Observation (reported, not asserted):** PostgREST still answers the revoked session's access JWT with **HTTP 200** until `exp` (§6.1) | pass |
| F5f | Guest store changes while the commit is in flight | Real commit | `committed` but `localGuestMutatedInFlight`: not cleared, the new local record stays, and the server has only the snapshot that was sent | pass |
| F0 | Secret hygiene | — | No JWT, verifier password or key-shaped string in any request body from any device | pass |

**Mutation checks** (temporary edits to `src/**`, each reverted with `git checkout`; nothing committed):

| Mutation | Caught by |
| --- | --- |
| `canSafelyClearGuestStorage` ignores `unresolvedPersistedOnServer` | F4 |
| Coordinator clears guest storage without a positive decision | F2b, F4, F5f |
| Transport accepts an envelope whose `accountId` is another account | F3 |

## 4. Deliverable C — commands and results (2026-11-19)

Environment: Node v22.23.5, Docker 29.10.0, Supabase CLI 3.2.0 (npm `supabase@3.2.0`, installed outside the repo), psql 16.15. Images come from GHCR (`SB1_IMAGE_REGISTRY=ghcr.io`), and the stack is loopback only. The runner identity is `postgres` (not superuser), with zero pre-unblocks.

| Command | Result |
| --- | --- |
| Baseline: `SUPABASE_CLI=… SB1_IMAGE_REGISTRY=ghcr.io SB1_KEEP_STACK=1 ./scripts/accountSupabase/run-local-supabase-acceptance.sh` on **unmodified `main` 1eacda5** | A–E **50 pass / 0 fail / 0 skip** (upgrade path) |
| Cinnamon Bear test, standalone, on that stack (§2) | **1 / 0 / 0** |
| Extended runner, **upgrade path** (default; ownership-proven disposal of the kept stack) | Migrations: zero WARNING/ERROR; D1–D4 and SB3 checks pass; U pre/post pass. **A–F 62 pass / 0 fail / 0 skip.** Cinnamon Bear **1 / 0 / 0**. Clean teardown; no JWT, key or DB URL in the log |
| Extended runner, **fresh path** `SB3_FRESH_APPLY=1` | All 4 migrations in one CLI run; zero WARNING/ERROR. **A–F 62 / 0 / 0.** Cinnamon Bear **1 / 0 / 0**. Clean teardown; no secret in the log |
| `node --experimental-strip-types --test tests/accountSync/accountSyncCoordinator.test.ts tests/accountSync/supabasePostgrestTransport.test.ts tests/accountSync/supabasePostgrestTransport.local.test.ts tests/accountAuth/accountAuthSession.test.ts` | 49 pass / 0 fail / **1 skip** (the opt-in local transport test without its flag, as designed) |
| `node --experimental-strip-types --test tests/accountVerification/*.test.ts` | 57 / 0 / 0 |
| `node --experimental-strip-types --test tests/accountSupabase/*.supabase.test.ts` **without** a stack | all 7 suites (A–F, U) skip with the runner hint, so the suites are opt-in |
| `bash tests/accountSupabase/runLocalSupabaseGuard.test.sh` | passed |
| `npm run lint` · `npm run build` · `git diff --check` | clean · built · clean |
| Strict ad-hoc `tsc --noEmit --strict` of the new test file (tests are outside every tsconfig) | clean |

**Not run here:** `SB2_MUTATION_DEMOS=1` (not affected: suite F runs only in the acceptance branch of the runner), the R13-TX1 plain-PostgreSQL harness and `shelfProtectionSql.integration.test.ts` (no SQL or `src` change), Playwright suites and the hosted CI (owned by Silver Badger #239 and Amber Compass #240).

**How to run:**

```bash
SUPABASE_CLI=/path/to/supabase SB1_IMAGE_REGISTRY=ghcr.io ./scripts/accountSupabase/run-local-supabase-acceptance.sh
```

Keep it opt-in. It needs Docker, the Supabase CLI, `psql` and `npm ci` (for `pg`). It is not ordinary CI.

## 5. Real vs synthetic vs not tested

| Real (local) | Synthetic / simulated | **Not tested; must not be claimed** |
| --- | --- | --- |
| GoTrue sign-up, password-grant sessions and asymmetric JWTs (two sessions per account) | Two "devices" in one Node process with in-memory guest stores | Installed Android/iOS apps, Capacitor `Preferences` persistence, app kill/restart, offline queues |
| PostgREST role switching and `auth.uid()` in the post-SB3 RPCs | Password grant stands in for Google/Apple/email OTP | Real Google/Apple/OTP sign-in and redirect flows; a Supabase Auth **provider adapter** (none exists in `src/`) |
| Production `SupabasePostgrestTransport`, `coordinateGuestSync`, `canSafelyClearGuestStorage`, `AccountSessionController` | `MockAuthProvider` as the controller's provider (carrying a real JWT) | Hosted Supabase (TLS, pooler, rate limits, hosted GoTrue config, real collation) |
| Private verifier: production pg executor, port, run-once orchestration and CLI entry, on a dedicated least-privileged LOGIN | Published Sanity month (`fixtures.ts`), answered in-process | The real Sanity project and editorial content; scheduler activation |
| Real commit then lost response (F5a); real revision race (F5c) | Response loss, network failure (F5b) and clock expiry (F5d) are injected | Real radio loss, background suspension, OS-level clock changes, two physical devices racing over real networks |

**Physical two-device qualification still needs:** a real Supabase Auth provider adapter in `src/accountAuth`, native guest persistence wired to the coordinator's accessor, a hosted or staging project with real auth providers, and an owner-authorized device test phase. None of that is in scope here.

## 6. Findings and follow-on decisions (for Aaron)

1. **Sign-out does not stop the access JWT at the Data API.** After `POST /auth/v1/logout`, GoTrue refuses refresh (400) and `/auth/v1/user` (403), but PostgREST still accepts the same access token for the account RPCs until `exp` (local `jwt_expiry = 3600`). This is standard stateless-JWT behaviour, not a regression. Sign-out-during-sync safety today comes from the client (`AccountSessionController` blocks the commit; F5e). **Decision:** accept this, shorten `jwt_expiry`, or add a session-validity check in SQL (`auth.sessions`). The last two are schema/config changes that need separate authorization.
2. **Cards never sync until verified, so guests keep them locally.** This is the accepted TX1/VERIFY1 design, now proven end to end. A guest whose claim is ineligible (C in F4) keeps its local guest store indefinitely. **Decision:** a product rule for long-pending or never-eligible claims (expiry, reader messaging, or an explicit discard flow).
3. **Displaced Shelf months on merge.** In F2 the guest's `2026-10` month is reported `preservedInLibraryNotOnShelf`, and the guest store is then cleared. Only the account Shelf persists, and the reader-selected month survives only through its completions and Cards. This matches the accepted contract; there is no UI for this notice yet.
4. **A swapped-token read returns `networkError`, not `unauthorized`** (F3). This is safe, because no foreign data is returned and nothing is written, but the result category is misleading for a future UI. Optional `src` follow-up, not done here.
5. **No production defect found.** Every scenario passed against unchanged `src/**` and migrations.

## 7. Cross-agent scope check

At dispatch, Silver Badger (#239, PR #245) owned `.github/workflows/**` and Amber Compass (#240, PR #244) owned `docs/testing/ci-coverage-matrix.md`. Neither area was touched. No `scripts/ci/**`, Antigravity UI, `src/App.tsx`, native, CMS/Studio/Gateway/Cloudflare or live-service file changed. Branch: the platform-required `claude/eager-bardeen-j4w3wd`, not the suggested `test/issue-246-quartz-meadow`.
