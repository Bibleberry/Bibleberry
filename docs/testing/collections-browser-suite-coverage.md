# Collections Browser Suite Coverage (Willow Lantern)

**Related Issue:** [#252](https://github.com/Bibleberry/Bibleberry/issues/252) (`Willow Lantern`)  
**Pull Request:** [#254](https://github.com/Bibleberry/Bibleberry/pull/254) (`issue252_collections_coverage`)  
**Runner:** [`scripts/testing/run-collections-browser-tests.mjs`](../../scripts/testing/run-collections-browser-tests.mjs) (`npm run test:collections`)  
**Workflow (read-only):** [`.github/workflows/collections-browser.yml`](../../.github/workflows/collections-browser.yml)  
**Scope detector (read-only):** [`scripts/ci/check-scope.mjs`](../../scripts/ci/check-scope.mjs) (`TARGET_PATTERNS['collections-browser']`)  
**Contract guard:** [`tests/ci/collections-browser-coverage.test.ts`](../../tests/ci/collections-browser-coverage.test.ts)

## 1. False-Green Coverage Gap Closed

Amber Compass ([#240](https://github.com/Bibleberry/Bibleberry/issues/240) / [PR #244](https://github.com/Bibleberry/Bibleberry/pull/244)) identified a scope-to-execution mismatch in the Collections Browser CI gate:

- `scripts/ci/check-scope.mjs` (`collections-browser`) watched four test directories: `tests/savedScripture/`, `tests/notebook/`, `tests/cardViewer/`, and `tests/announcements/`.
- `scripts/testing/run-collections-browser-tests.mjs` invoked only Saved Scripture and Field Notebook.
- As a result, PRs modifying `tests/cardViewer/**` or `tests/announcements/**` triggered the Collections Browser workflow and displayed a green check without executing either changed browser suite.

Willow Lantern closes this gap by executing all four watched browser suites deterministically in `scripts/testing/run-collections-browser-tests.mjs` with fail-closed validation and a bidirectional parity guard in `tests/ci/collections-browser-coverage.test.ts`.

## 2. Hermetic Audit of Newly Wired Suites

Both previously unwired suites were audited before selection and verified to execute hermetically on standard hosted Chromium (`ubuntu-24.04`) with zero external services, credentials, or production content:

| Watched Directory | Playwright Config | Spec File | Tests | Hermetic Audit Result |
|---|---|---|---|---|
| `tests/savedScripture/` | `tests/savedScripture/playwright.config.ts` | `tests/savedScripture/saved-scripture-collection.spec.ts` | 3 | Existing suite preserved; ephemeral Vite server on `127.0.0.1:0`, synthetic V2 guest fixtures, asserts zero external requests and zero `pageerror`s. |
| `tests/notebook/` | `tests/notebook/playwright.config.ts` | `tests/notebook/field-notebook.spec.ts` | 2 | Existing suite preserved; ephemeral Vite server on `127.0.0.1:0`, aborts `**/api/**`, intercepts `https://cdn.sanity.io/images/**` with inline PNG, asserts zero `pageerror`s. |
| `tests/cardViewer/` | `tests/cardViewer/playwright.config.ts` | `tests/cardViewer/earned-scripture-card-viewer.spec.ts` | 2 | Audited hermetic: ephemeral Vite server on `127.0.0.1:0`, synthetic card fixture, intercepts `https://cdn.sanity.io/images/**` (404 fallback + inline PNG), `headless: true`, `workers: 1`, `forbidOnly: !!process.env.CI`, asserts zero `pageerror`s. |
| `tests/announcements/` | `tests/announcements/playwright.config.ts` | `tests/announcements/hub-card-announcements.spec.ts` | 3 | Audited hermetic: ephemeral Vite server on `127.0.0.1:0`, synthetic announcement fixtures, intercepts `https://cdn.sanity.io/images/**` (inline PNG + 404 fallback), `headless: true`, `workers: 1`, `forbidOnly: !!process.env.CI`, asserts zero `pageerror`s. |

All four test families' local `playwright.config.ts`, `*.spec.ts`, and `harness/**` files were preserved without modification.

## 3. Fail-Closed Execution & Parity Contract

`scripts/testing/run-collections-browser-tests.mjs` runs every suite in `COLLECTIONS_BROWSER_SUITES` using its own `--config` and attaches `--reporter=list,json` with an ephemeral per-suite `PLAYWRIGHT_JSON_OUTPUT_FILE` (cleaned up on exit) so local `list` output is preserved while structured stats are verified fail-closed:

- **Pre-flight config validation (`invalid-config`):** Rejects empty suite lists, missing required fields, duplicate suite IDs/specs, spec paths outside `watchedDirectory`, and missing config or spec files on disk.
- **Process execution guards (`spawn-error`, `signal-error`, `failed`):** Fails closed on `spawnSync` errors, signal terminations, and any nonzero exit code while running all configured suites to report full status.
- **Anti-false-green report guards (`missing-report`, `invalid-report`, `playwright-errors`, `no-tests`, `skip-only`, `unexpected-skips`):** Even if Playwright exits `0`, refuses to pass when no JSON report was written, the report is invalid, top-level Playwright errors exist, `0` tests were discovered, all tests were skipped (`0` passed/flaky), or unexpected skips occurred.
- **Explicit execution summary:** Prints per-suite `PASS` / `FAIL (<status>)` status with `passed`, `failed`, `skipped`, `flaky`, and `duration` counts so skipped or unexecuted suites are never confused with passing suites.

`tests/ci/collections-browser-coverage.test.ts` runs automatically inside `Bibleberry CI` (`reader-app` job: `node --experimental-strip-types --test tests/ci/*.test.ts`) and enforces:
1. Exact bidirectional parity between `TARGET_PATTERNS['collections-browser']` (`tests/<dir>/`), every `*.spec.ts` file on disk in those directories, and `COLLECTIONS_BROWSER_SUITES`.
2. Detection of removing any suite, omitting a newly added `.spec.ts`, or invoking an unwatched suite.
3. Detection of nonzero subprocess exits (mocked and real child process), spawn errors, signal termination, invalid config, missing tests, skip-only runs, and missing/corrupt reports.

## 4. Boundaries and Coordination Preserved

- **Read-only boundaries respected:** `src/**`, `studio/**`, `package.json`, `package-lock.json`, `scripts/ci/check-scope.mjs`, `.github/workflows/**`, native projects/tests, and `docs/testing/ci-coverage-matrix.md` were not modified.
- **Coordination with Jasper Turtle ([#241](https://github.com/Bibleberry/Bibleberry/issues/241) / [PR #253](https://github.com/Bibleberry/Bibleberry/pull/253)):** Jasper owns `.github/workflows/ci.yml`, `tests/ci/hermetic-regressions.test.ts`, and `docs/testing/ci-coverage-matrix.md`. Updating Amber Compass's matrix to reflect the newly wired Card Viewer and Announcements browser suites is left for Jasper/follow-up synchronization.
- **Workflow job name preserved:** `.github/workflows/collections-browser.yml` retains its existing job display name (`Saved Scripture and Field Notebook (Chromium)`) and triggers (`pull_request`, `merge_group`; no `push: main`) to stay within Issue #252's read-only workflow boundary and preserve `tests/ci/draft-pr-ci-policy.test.ts` and required-check compatibility.

## 5. Suites Intentionally Not Included in `test:collections`

- **Hermetic Node unit tests in watched directories:** `tests/savedScripture/savedScriptureCollectionModel.test.ts` is a `node:test` model suite rather than a Playwright browser spec; it is wired into `reader-app` in `.github/workflows/ci.yml` by Jasper Turtle ([#241](https://github.com/Bibleberry/Bibleberry/issues/241) / [PR #253](https://github.com/Bibleberry/Bibleberry/pull/253)).
- **Browser suites already covered by `Bibleberry CI` (`reader-app`):**
  - `tests/smoke/*.spec.ts` (`npm run test:smoke`)
  - `tests/libraryShelf/*.spec.ts` (`npm run test:library-shelf`)
- **Additional Playwright suites outside `collections-browser` scope (deliberately excluded pending separate owner-scoped browser gate decisions):**
  - `tests/cardSharing/earned-card-share-control.spec.ts`
  - `tests/scriptureCapture/save-scripture-control.spec.ts`, `tests/scriptureCapture/teaching-integration.spec.ts`
  - `tests/appIntegration/app-shell-integration.spec.ts`, `tests/appIntegration/library-shell-integration.spec.ts`, `tests/appIntegration/news-shell-integration.spec.ts`
  - `tests/hubContinue/hub-continue.spec.ts`, `tests/hubContinue/app-hub-continue-today.spec.ts`
  - `tests/library/historical-library.spec.ts`
  - `tests/shelfUI/shelf-surface.spec.ts`
  - `tests/monthAccessibility/month-screen-accessibility.spec.ts`
  - `tests/news/news-reader.spec.ts`
  - `tests/onboardingReplay/onboarding-replay.spec.ts`

## 6. Verified Execution Evidence and Duration/Cost Impact

### Local Verification

- `npm run test:collections`: **4/4 suites passed — 10 passed, 0 failed, 0 skipped, 0 flaky** (`wall=40.7s`):
  - Saved Scripture Collection (`tests/savedScripture/saved-scripture-collection.spec.ts`): 3 passed, 0 failed, 0 skipped (`10.9s`)
  - Field Notebook (`tests/notebook/field-notebook.spec.ts`): 2 passed, 0 failed, 0 skipped (`8.8s`)
  - Earned Scripture Card Viewer (`tests/cardViewer/earned-scripture-card-viewer.spec.ts`): 2 passed, 0 failed, 0 skipped (`6.9s`)
  - Hub Card Announcements (`tests/announcements/hub-card-announcements.spec.ts`): 3 passed, 0 failed, 0 skipped (`10.9s`)
- `node --experimental-strip-types --test tests/ci/*.test.ts`: **62 passed, 0 failed, 0 skipped** (includes 6 new contract tests in `tests/ci/collections-browser-coverage.test.ts`).

### Hosted GitHub Actions Evidence

Verified on standard GitHub-hosted `ubuntu-24.04` (Node 22) at commit `e666c67d138569fff9ebcd5cff0a72bfbaf2d7b5` ([PR #254](https://github.com/Bibleberry/Bibleberry/pull/254)):

- **Collections Browser Tests ([Run 44649512567](https://github.com/Bibleberry/Bibleberry/actions/runs/44649512567) / [Job 136000569019](https://github.com/Bibleberry/Bibleberry/actions/runs/44649512567/job/136000569019)):**
  - Change-scope decision: `should_run=true` (`pull_request`, 3 changed files evaluated).
  - **`Run collection browser suites` step:** **4/4 suites passed — 10 passed, 0 failed, 0 skipped, 0 flaky** (`wall=32128ms`, step duration **32s**, total job **1m 42s**):
    - Saved Scripture Collection (`tests/savedScripture/saved-scripture-collection.spec.ts`): **3 passed, 0 failed, 0 skipped** (`9.0s`)
    - Field Notebook (`tests/notebook/field-notebook.spec.ts`): **2 passed, 0 failed, 0 skipped** (`7.4s`)
    - Earned Scripture Card Viewer (`tests/cardViewer/earned-scripture-card-viewer.spec.ts`): **2 passed, 0 failed, 0 skipped** (`5.1s`)
    - Hub Card Announcements (`tests/announcements/hub-card-announcements.spec.ts`): **3 passed, 0 failed, 0 skipped** (`7.9s`)
- **Bibleberry CI ([Run 44649512465](https://github.com/Bibleberry/Bibleberry/actions/runs/44649512465)):**
  - [`Build reader application`](https://github.com/Bibleberry/Bibleberry/actions/runs/44649512465/job/136000568514) (`6m 41s`): **PASS** — `Run CI workflow and scope tests` passed **64/64** (`0 failed, 0 skipped`, including all 6 new contract tests in `tests/ci/collections-browser-coverage.test.ts`), along with Shelf persistence, Library-to-Shelf, ESLint, Vite build, staging Worker dry-run, and 7-pass reader smoke suite.
  - [`Verify CMS adapters and BerryMark preview`](https://github.com/Bibleberry/Bibleberry/actions/runs/44649512465/job/136000568919) (`1m 15s`): **PASS**
  - [`Verify Release Gateway core`](https://github.com/Bibleberry/Bibleberry/actions/runs/44649512465/job/136000568945) (`54s`): **PASS**
  - [`Verify Sanity Studio`](https://github.com/Bibleberry/Bibleberry/actions/runs/44649512465/job/136000568967) (`57s`): **PASS**
- **Native workflows:** Neither `Native Android debug build` nor `Native iOS simulator build` triggered (no shipped web-bundle or native files changed).
- **Duration and cost impact:**
  - **Baseline before Willow Lantern (2 suites, 5 tests):** [Run 44643275531](https://github.com/Bibleberry/Bibleberry/actions/runs/44643275531/job/135979429962) (`ubuntu-24.04`) — `Run collection browser suites` step took **15s** (`79s` total job).
  - **After Willow Lantern (4 suites, 10 tests):** `Run collection browser suites` step took **32s** (`+17s` test execution time: `5.1s` Card Viewer + `7.9s` Hub Card Announcements + subprocess startup; total job `1m 42s`, with `npm ci` accounting for normal runner variance).
  - **Direct Actions cost:** **$0** on standard GitHub-hosted `ubuntu-24.04` runners while Bibleberry remains a public repository (1x Linux billing multiplier if ever made private; `+17s` step delta adds `<0.3` runner-minutes per triggered PR or `merge_group`).
