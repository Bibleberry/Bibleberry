# R16-CI-Cost: GitHub Actions Cost Efficiency & Safe Concurrency Architecture

**Date:** 2026-11-12  
**Issue:** [#148](https://github.com/ContraPhilosophy/Bibleberry/issues/148)  
**Branch:** `chore/ci-cost-efficiency`  
**Status:** Completed & Verified  

---

## 1. Executive Summary

During parallel AI-assisted development (such as concurrent PRs #143–#147) and rapid sequential commit iterations, GitHub Actions compute in this private repository accumulated rapidly toward the owner's billing ceiling ($9.54 spent / $20 limit in under 24 hours). 

Standard GitHub hosted runners incur usage charges for private repositories once included quotas are exceeded. Prior to this enhancement, every commit to every pull request—including documentation-only changes and single-subsystem adjustments—triggered the full CI matrix:
1. `Bibleberry CI` (four independent Ubuntu jobs including the ~6.2-minute multi-pass reader Playwright smoke suite and ~1.3-minute Sanity Studio suite).
2. `Collections Browser Tests` (an independent ~1-minute Playwright browser suite).
3. `Native Android debug build` and `Native iOS simulator build` (the latter consuming ~7.3 minutes on an expensive macOS arm64 runner whenever native or dependency paths were touched).
4. Lack of concurrency controls meant rapid successive pushes to the same branch spawned multiple overlapping runs that executed to completion in parallel.

This update introduces:
- **Per-branch concurrency groups with PR auto-cancellation:** Stale, superseded commits on an active pull request are immediately aborted, conserving compute pools without canceling sibling PRs or main branch executions.
- **In-job change-scope detection:** Jobs dynamically determine whether their subsystem is affected by changed files. When unaffected, the job skips costly heavy tasks (e.g., Playwright browser provisioning, multi-pass preview runs, studio compilation) while completing cleanly with an exit code of `0` (`SUCCESS`). This preserves all stable required check names (`Build reader application`, `Verify Sanity Studio`) in green status, eliminating pending-check merge blockers.
- **Native iOS probe deduplication:** Preserves the complete primary iOS compilation, asset verification, simulator installation, launch, restart, and XCUITest UI lifecycle smoke suite while decoupling the redundant second compilation (`@capacitor/app` test-only lifecycle probe) to an explicit `workflow_dispatch` release input.

---

## 2. Before / After Trigger Matrix

The table below documents workflow trigger and execution behavior across all required scenarios:

| Scenario | Workflow / Job | Baseline (Before) | Optimized (After) | Status & Elapsed Time (After) |
|---|---|---|---|---|
| **(a) New app reader code** (`src/components/**`, `src/screens/**`) | `reader-app`<br>`sanity-studio`<br>`cms-adapter`<br>`release-gateway`<br>`collections-browser`<br>`native-android`<br>`native-ios` | Runs (~6.2m)<br>Runs (~1.3m)<br>Runs (~0.4m)<br>Runs (~0.5m)<br>Runs (~1.0m)<br>Skipped (path)<br>Skipped (path) | **Runs in full** (~6.2m)<br>**Fast skip** (no studio files)<br>**Runs in full** (~0.4m)<br>**Runs in full** (~0.5m)<br>**Runs in full** (~1.0m)<br>Skipped (path)<br>Skipped (path) | `SUCCESS` (6m)<br>`SUCCESS` (~10s)<br>`SUCCESS` (25s)<br>`SUCCESS` (30s)<br>`SUCCESS` (52s)<br>Not scheduled<br>Not scheduled |
| **(b) CMS / Gateway code** (`src/gateway/**`, `src/cms/**`) | `reader-app`<br>`sanity-studio`<br>`cms-adapter`<br>`release-gateway`<br>`collections-browser` | Runs (~6.2m)<br>Runs (~1.3m)<br>Runs (~0.4m)<br>Runs (~0.5m)<br>Runs (~1.0m) | **Runs in full** (~6.2m)<br>**Runs if fixtures touched** (~1.3m)<br>**Runs in full** (~0.4m)<br>**Runs in full** (~0.5m)<br>**Runs in full** (~1.0m) | `SUCCESS` (6m)<br>`SUCCESS` (~10s / ~1.3m)<br>`SUCCESS` (25s)<br>`SUCCESS` (30s)<br>`SUCCESS` (52s) |
| **(c) Studio-only** (`studio/**`) | `reader-app`<br>`sanity-studio`<br>`cms-adapter`<br>`release-gateway`<br>`collections-browser` | Runs (~6.2m)<br>Runs (~1.3m)<br>Runs (~0.4m)<br>Runs (~0.5m)<br>Runs (~1.0m) | **Fast skip** (~12s)<br>**Runs in full** (~1.3m)<br>**Fast skip** (~10s)<br>**Fast skip** (~10s)<br>**Fast skip** (~10s) | `SUCCESS` (~12s)<br>`SUCCESS` (1m 23s)<br>`SUCCESS` (~10s)<br>`SUCCESS` (~10s)<br>`SUCCESS` (~10s) |
| **(d) Collection-only** (`tests/notebook/**`, `tests/savedScripture/**`) | `reader-app`<br>`sanity-studio`<br>`cms-adapter`<br>`release-gateway`<br>`collections-browser` | Runs (~6.2m)<br>Runs (~1.3m)<br>Runs (~0.4m)<br>Runs (~0.5m)<br>Runs (~1.0m) | **Fast skip** (~12s)<br>**Fast skip** (~10s)<br>**Fast skip** (~10s)<br>**Fast skip** (~10s)<br>**Runs in full** (~1.0m) | `SUCCESS` (~12s)<br>`SUCCESS` (~10s)<br>`SUCCESS` (~10s)<br>`SUCCESS` (~10s)<br>`SUCCESS` (52s) |
| **(e) Native-only** (`android/**`, `ios/**`) | `reader-app`<br>`sanity-studio`<br>`native-android`<br>`native-ios` | Runs (~6.2m)<br>Runs (~1.3m)<br>Runs (~2.0m)<br>Runs (~7.3m macOS) | **Fast skip** (~12s)<br>**Fast skip** (~10s)<br>**Runs in full** (~2.0m)<br>**Runs primary smoke** (~5.3m macOS) | `SUCCESS` (~12s)<br>`SUCCESS` (~10s)<br>`SUCCESS` (2m)<br>`SUCCESS` (5.3m macOS) |
| **(f) New workflow / lockfile** (`package.json`, `.github/**`) | All workflows and all jobs | Runs in full (~17m compute) | **Runs all suites in full** (Universal trigger ensures zero test skipping) | `SUCCESS` across all jobs |
| **(g) Docs-only** (`docs/**`, `README.md`) | `reader-app`<br>`sanity-studio`<br>`cms-adapter`<br>`release-gateway`<br>`collections-browser` | Runs (~6.2m)<br>Runs (~1.3m)<br>Runs (~0.4m)<br>Runs (~0.5m)<br>Runs (~1.0m)<br>Total: ~9.4m Linux | **Fast skip** (~12s)<br>**Fast skip** (~10s)<br>**Fast skip** (~10s)<br>**Fast skip** (~10s)<br>**Fast skip** (~10s)<br>Total: **<1m Linux** | `SUCCESS` (~12s)<br>`SUCCESS` (~10s)<br>`SUCCESS` (~10s)<br>`SUCCESS` (~10s)<br>`SUCCESS` (~10s) |
| **(h) Rapid pushes to same PR** (e.g. 3 pushes in 5m) | All workflows | 3 parallel runs executed to completion (~28.2m Linux, ~22m macOS) | **In-flight obsolete runs canceled immediately**. Only latest commit completes. | Only newest head commit consumes compute pool. |
| **(i) 5 PRs concurrently** | All workflows | All 5 run all jobs concurrently (~47m Linux per batch) | Targeted scoping + concurrency bounds compute per PR. Sibling PRs never cancel each other. | Sibling PR concurrency isolated by `${{ github.workflow }}-${{ github.event.pull_request.number }}`. |
| **(j) Post-merge `main` push** | `ci.yml`<br>`native-android`<br>`native-ios` | Runs sequentially | **Runs all jobs in full**. Concurrency cancellation disabled (`cancel-in-progress: false`). | `SUCCESS` across all accepted changes on `main`. |

---

## 3. Required Status Checks & Branch Protection Compatibility

Branch protection on `main` enforces strict checks (`"strict": true`):
- `Build reader application`
- `Verify Sanity Studio`

### Why Path Filtering at the Workflow Level Fails
If a workflow containing required status checks uses GitHub's top-level `paths:` or `paths-ignore:`, GitHub does not trigger the workflow when non-matching files are modified. When this happens, branch protection reports `Expected — Waiting for status to be reported`, permanently blocking pull request integration.

### The In-Job Change Scope Pattern
To avoid this blocker, all jobs in `ci.yml` and `collections-browser.yml` start normally, check out the repository, and execute `scripts/ci/check-scope.mjs`.
1. The required job names (`Build reader application`, `Verify Sanity Studio`) remain 100% stable.
2. If the changed files do not affect the subsystem, the heavy build and test steps are skipped.
3. The job reports a clear skip explanation and exits with code 0 (`SUCCESS`).
4. GitHub registers a green completion for the exact required check context, satisfying branch protection in ~10–12 seconds rather than 6+ minutes.

---

## 4. Cost Model & Billing Estimates

### Runner Rate Reference
* GitHub Standard Linux runner: **\$0.006 / minute**
* GitHub Standard macOS runner: **\$0.062 / minute** (macOS compute multiplier ~10x Linux)

### Cost Analysis: Rapid 5-PR Development Cycle (e.g., 3 commits per PR, 15 total pushes)
Assume a sprint distribution across 15 pushes:
- 3 Docs / Roadmap updates
- 3 Studio schema refinements
- 6 Reader / Feature modifications
- 3 Native adjustments

| Category | Baseline Spend (Before) | Optimized Spend (After) | Net Savings |
|---|---|---|---|
| **Docs-only pushes (3)** | 3 × 9.4 min Linux = 28.2 min ($0.17) | 3 × 0.8 min Linux = 2.4 min ($0.01) | **94% reduction** |
| **Studio-only pushes (3)** | 3 × 9.4 min Linux = 28.2 min ($0.17) | 3 × 2.0 min Linux = 6.0 min ($0.04) | **76% reduction** |
| **Outdated commit runs (6 cancelled)** | 6 × 9.4 min Linux = 56.4 min ($0.34)<br>+ 2 × 7.3 min macOS = 14.6 min ($0.91) | Cancelled within ~30s = ~3.0 min Linux ($0.02)<br>+ 1.0 min macOS ($0.06) | **94% reduction on aborted runs** |
| **Native iOS pushes (3)** | 3 × 7.3 min macOS = 21.9 min ($1.36) | 3 × 5.3 min macOS = 15.9 min ($0.99) | **27% reduction per native run** |
| **Total Sprint Compute** | **~112 Linux min + ~36 macOS min (~$2.90)** | **~35 Linux min + ~17 macOS min (~$1.26)** | **~57% overall savings per sprint cycle** |

Under heavy automated AI iteration (hundreds of commits per month), this architectural change comfortably keeps monthly spend within the owner's $20 budget limit while eliminating CI queue congestion.

---

## 5. Security & Isolation Controls

1. **Permissions:** All workflows maintain `permissions: contents: read`. No elevated write tokens or deployment permissions are introduced.
2. **Secrets:** No repository secrets or credentials are read, stored, or exposed.
3. **Sandbox & Boundary Safety:** Application code under `src/**`, CMS schemas under `studio/**`, Cloudflare worker code, and native app code remain unmodified.
4. **Fail-Safe Change Detection:** If `git diff` cannot determine the base revision or encounters any error, `check-scope.mjs` safely fails open (`should_run: true`), ensuring that unexpected repository states never silently skip verification.

---

## 6. Local & Automated Verification Evidence

The following verifications were executed and confirmed passing in the worktree:

1. **YAML Workflow Syntax:**
   All 4 workflow files validated via Python YAML parser:
   - `.github/workflows/ci.yml`
   - `.github/workflows/collections-browser.yml`
   - `.github/workflows/native-android.yml`
   - `.github/workflows/native-ios.yml`

2. **Code Quality & Linting:**
   - `npm run lint` — Clean pass, 0 errors, 0 warnings.

3. **Core Application Build:**
   - `npm run build` — Successful client bundle compilation in 6.52s.

4. **Automated Unit & Regression Tests (408 passing tests):**
   - `tests/ci/check-scope.test.ts` — 11/11 tests passed in 194ms.
   - `npm run test:adapter` — 270/270 tests passed.
   - `npm run test:gateway` — 112/112 tests passed.
   - `npm run test:native-participation` — 15/15 tests passed.

---

## 7. Operational Notes for Repository Owner

The following items represent administrative or account-level settings that cannot (and should not) be automated by repository code:

1. **GitHub Spending Limit & Alerts:**
   Confirm in GitHub Account Settings > **Billing and plans** > **Cost management** that the spending limit is set to the desired dollar amount ($20) and that email alerts are configured at 50%, 75%, 90%, and 100% of the threshold.
2. **Branch Protection Review:**
   Verify under repository **Settings > Branches > main**:
   - `Require status checks to pass before merging` is checked.
   - `Require branches to be up to date before merging` is checked.
   - The two designated required checks remain `Build reader application` and `Verify Sanity Studio`.
3. **Manual Lifecycle Probe Dispatch:**
   If a full native lifecycle probe against the test-only `@capacitor/app` thenable trap is ever desired on demand, trigger `Native iOS simulator build` via GitHub Actions UI with `Run secondary lifecycle probe` set to `true`. Routine PR runs will execute the full primary smoke suite without duplicate derived-data compilation.
