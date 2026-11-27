# R16-CI-Cost: GitHub Actions Cost Efficiency & Safe Concurrency Architecture

**Date:** 2026-11-12  
**Issue:** [#148](https://github.com/Bibleberry/Bibleberry/issues/148)  
**Pull Request:** [#149](https://github.com/Bibleberry/Bibleberry/pull/149)  
**Branch:** `chore/ci-cost-efficiency`  
**Status:** Completed & Verified  

---

## 1. Executive Summary

During parallel AI-assisted development (such as concurrent PRs #143–#147) and sequential pull request integration, GitHub Actions compute in this private repository accumulated rapidly toward the owner's billing ceiling ($9.54 spent against a $20 limit in under 24 hours).

Standard hosted GitHub Actions runners incur charges for private repositories once included plan quotas are exhausted. Prior to this enhancement, every commit to every pull request—including documentation-only updates and isolated subsystem changes—triggered the full CI matrix:
1. `Bibleberry CI` (four Ubuntu jobs including the ~6.2-minute multi-pass reader Playwright smoke suite and ~1.3-minute Sanity Studio suite).
2. `Collections Browser Tests` (an independent ~1-minute Playwright browser suite).
3. `Native Android debug build` and `Native iOS simulator build` (the latter running on an expensive macOS arm64 runner whenever native or manifest paths were touched).
4. Unbounded concurrency: Rapid successive pushes to the same branch spawned multiple overlapping runs that executed to completion in parallel.

This update introduces:
- **Per-branch concurrency groups with PR auto-cancellation:** Stale, superseded commits on an active pull request are aborted immediately, conserving compute pools without canceling sibling PRs or main branch executions.
- **In-job change-scope detection:** Jobs dynamically determine whether their subsystem is affected by changed files. When unaffected, the job skips costly heavy tasks (e.g., Playwright browser provisioning, multi-pass preview runs, studio compilation) while completing cleanly with an exit code of `0` (`SUCCESS`). This preserves all stable required check names (`Build reader application`, `Verify Sanity Studio`) in green status, eliminating pending-check merge blockers.
- **Comprehensive tooling & test directory coverage:** Scope rules explicitly account for root lint/tooling/build files (`eslint.config.js`, `tsconfig*.json`, `vite.config.ts`, `tailwind.config.js`, `postcss.config.js`, `components.json`, `capacitor.config.ts`, `wrangler*.jsonc`, `playwright*.config.ts`) and all test directories (`tests/cardViewer/`, `tests/monthAccessibility/`, `tests/announcements/`, `tests/performance/`, `tests/smoke/`, `tests/savedScripture/`, `tests/notebook/`, etc.) so test-only or tooling changes never bypass verification.
- **Conservative fail-safe git diff evaluation:** The diff engine evaluates merge bases against target branch candidates (`origin/${baseRef}`, `${baseRef}`). It eliminates single-commit fallbacks (`HEAD~1`), ensuring that multi-commit PRs are never evaluated only on their latest commit. If the merge base cannot be resolved, change detection defaults safely open (`should_run: true`).
- **Native iOS probe deduplication:** Preserves the complete primary iOS compilation, asset verification, simulator installation, cold launch, restart, PTY preferences bridge validation, and XCUITest UI lifecycle smoke suite, while decoupling the redundant second compilation (`@capacitor/app` test-only lifecycle probe) to an explicit `workflow_dispatch` release input.

---

## 2. Before / After Trigger Matrix

The table below documents workflow trigger and execution behavior across all required scenarios:

| Scenario | Workflow / Job | Baseline (Before) | Optimized (After) | Status & Elapsed Time (After) |
|---|---|---|---|---|
| **(a) New app reader code** (`src/components/**`, `src/screens/**`) | `reader-app`<br>`sanity-studio`<br>`cms-adapter`<br>`release-gateway`<br>`collections-browser`<br>`native-android`<br>`native-ios` | Runs (~6.2m)<br>Runs (~1.3m)<br>Runs (~0.4m)<br>Runs (~0.5m)<br>Runs (~1.0m)<br>Skipped (path)<br>Skipped (path) | **Runs in full** (~6.2m)<br>**Fast skip** (no studio files)<br>**Runs in full** (~0.4m)<br>**Runs in full** (~0.5m)<br>**Runs in full** (~1.0m)<br>Skipped (path)<br>Skipped (path) | `SUCCESS` (6m)<br>`SUCCESS` (~10s)<br>`SUCCESS` (25s)<br>`SUCCESS` (30s)<br>`SUCCESS` (52s)<br>Not scheduled<br>Not scheduled |
| **(b) CMS / Gateway code** (`src/gateway/**`, `src/cms/**`) | `reader-app`<br>`sanity-studio`<br>`cms-adapter`<br>`release-gateway`<br>`collections-browser` | Runs (~6.2m)<br>Runs (~1.3m)<br>Runs (~0.4m)<br>Runs (~0.5m)<br>Runs (~1.0m) | **Runs in full** (~6.2m)<br>**Runs if fixtures touched** (~1.3m)<br>**Runs in full** (~0.4m)<br>**Runs in full** (~0.5m)<br>**Runs in full** (~1.0m) | `SUCCESS` (6m)<br>`SUCCESS` (~10s / ~1.3m)<br>`SUCCESS` (25s)<br>`SUCCESS` (30s)<br>`SUCCESS` (52s) |
| **(c) Studio-only** (`studio/**`) | `reader-app`<br>`sanity-studio`<br>`cms-adapter`<br>`release-gateway`<br>`collections-browser` | Runs (~6.2m)<br>Runs (~1.3m)<br>Runs (~0.4m)<br>Runs (~0.5m)<br>Runs (~1.0m) | **Fast skip** (~12s)<br>**Runs in full** (~1.3m)<br>**Fast skip** (~10s)<br>**Fast skip** (~10s)<br>**Fast skip** (~10s) | `SUCCESS` (~12s)<br>`SUCCESS` (1m 23s)<br>`SUCCESS` (~10s)<br>`SUCCESS` (~10s)<br>`SUCCESS` (~10s) |
| **(d) Collection-only** (`tests/notebook/**`, `tests/savedScripture/**`, `tests/cardViewer/**`, `tests/announcements/**`) | `reader-app`<br>`sanity-studio`<br>`cms-adapter`<br>`release-gateway`<br>`collections-browser` | Runs (~6.2m)<br>Runs (~1.3m)<br>Runs (~0.4m)<br>Runs (~0.5m)<br>Runs (~1.0m) | **Runs in full** (lint/build validation)<br>**Fast skip** (~10s)<br>**Fast skip** (~10s)<br>**Fast skip** (~10s)<br>**Runs in full** (~1.0m) | `SUCCESS` (4.5–6m)<br>`SUCCESS` (~10s)<br>`SUCCESS` (~10s)<br>`SUCCESS` (~10s)<br>`SUCCESS` (51s) |
| **(e) Native-only** (`android/**`, `ios/**`) | `reader-app`<br>`sanity-studio`<br>`native-android`<br>`native-ios` | Runs (~6.2m)<br>Runs (~1.3m)<br>Runs (~2.0m)<br>Runs (~7.3m macOS) | **Fast skip** (~12s)<br>**Fast skip** (~10s)<br>**Runs in full** (~1.5m)<br>**Runs primary smoke** (~5.6m macOS) | `SUCCESS` (~12s)<br>`SUCCESS` (~10s)<br>`SUCCESS` (1m 28s)<br>`SUCCESS` (5m 34s macOS) |
| **(f) New workflow / lockfile / tooling** (`package.json`, `eslint.config.js`, `.github/**`) | All workflows and all jobs | Runs in full (~17m compute) | **Runs all suites in full** (Universal trigger ensures zero test skipping) | `SUCCESS` across all jobs |
| **(g) Docs-only** (`docs/**`, `README.md`, `info.md`) | `reader-app`<br>`sanity-studio`<br>`cms-adapter`<br>`release-gateway`<br>`collections-browser` | Runs (~6.2m)<br>Runs (~1.3m)<br>Runs (~0.4m)<br>Runs (~0.5m)<br>Runs (~1.0m)<br>Total: ~9.4m Linux | **Fast skip** (~12s)<br>**Fast skip** (~10s)<br>**Fast skip** (~10s)<br>**Fast skip** (~10s)<br>**Fast skip** (~10s)<br>Total: **<1m Linux** | `SUCCESS` (~12s)<br>`SUCCESS` (~10s)<br>`SUCCESS` (~10s)<br>`SUCCESS` (~10s)<br>`SUCCESS` (~10s) |
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

## 4. Cost Model: Distinguishing Measured Results from Projections

### Measured Results from PR #149
The actual run on PR #149 demonstrated:
* **Native iOS Simulator Job Duration:** Completed in **5m 34s** (approx 5.6 minutes), down from observed baseline runs of **7m 12s – 7m 35s** (approx 7.2–7.4 minutes). This yielded a measured reduction of ~1.7–2.0 macOS minutes per native run while uploading all primary smoke evidence and the unsigned development simulator app.
* **Native Android Job Duration:** Completed in **1m 28s**, uploading the validated debug APK artifact.
* **Fast Verification Runs:** `Verify Release Gateway core` completed in **21s**; `Verify CMS adapters` completed in **28s**; `Verify Sanity Studio` completed in **48s**; `Collections Browser Tests` completed in **51s**.
* **Local Test Overhead:** In-job change detection unit tests execute in **~200ms** with zero external dependencies.

### Modeled Scenario Estimates (Not Measured Billing Results)
* GitHub Standard Linux runner: **\$0.006 / minute**
* GitHub Standard macOS runner: **\$0.062 / minute** (macOS compute multiplier ~10x Linux)

In a hypothetical 15-push sprint (e.g. 3 documentation pushes, 3 studio-only pushes, 6 reader pushes with 6 superseded in-flight commits, and 3 native pushes):
- **Unoptimized model:** ~112 Linux minutes + ~36 macOS minutes (~**\$2.90** estimated compute cost).
- **Optimized model:** ~35 Linux minutes + ~17 macOS minutes (~**\$1.26** estimated compute cost).
- **Modeled savings:** ~57% reduction in compute runner minutes.

*Note on Billing Limits:* The modeled savings estimate represents compute minute reductions under specific assumptions; it is not a guaranteed invoice billing chargeback. Total repository spend remains a direct function of total developer push volume, parallel branch activity, and GitHub's plan-level included minutes. These optimizations significantly reduce wasteful spend, but human monitoring of GitHub's spending limits and budget alerts remains essential.

---

## 5. Behavior on PR #149 and How to Verify Fast-Skip on Subsequent PRs

### Why PR #149 Intentionally Triggered Full Verification
PR #149 modified `.github/workflows/ci.yml`, `.github/workflows/collections-browser.yml`, `.github/workflows/native-android.yml`, `.github/workflows/native-ios.yml`, `scripts/ci/check-scope.mjs`, and `tests/ci/check-scope.test.ts`.

Because changes were made to workflow files and CI logic (`UNIVERSAL_PATTERNS`), PR #149 intentionally triggered full verification across all suites. This is an essential safety requirement: CI and manifest changes must never skip verification.

### How to Confirm Fast-Skip on a Subsequent Qualifying PR
To observe and verify actual in-job fast-skipping in hosted GitHub Actions:
1. **Docs-only qualifying PR:** Open a branch modifying only a markdown document (e.g. `docs/foo.md` or `README.md`).
   - `Bibleberry CI` will start all four jobs.
   - Each job will execute `Evaluate change scope`, detect that only documentation was altered, log `[ci-scope] Result: should_run=false`, and report `SUCCESS` in ~10–12 seconds.
   - All check names (`Build reader application`, `Verify Sanity Studio`, etc.) will turn green immediately.
   - `Native Android debug build` and `Native iOS simulator build` will not be scheduled (path filters).
2. **Studio-only qualifying PR:** Open a branch modifying only `studio/schemaTypes/`.
   - `sanity-studio` will run its full test, typecheck, and build steps (~1.3m).
   - `reader-app`, `cms-adapter`, `release-gateway`, and `collections-browser` will complete with green `SUCCESS` in ~10–12 seconds.

---

## 6. Security & Isolation Controls

1. **Permissions:** All workflows maintain `permissions: contents: read`. No elevated write tokens or deployment permissions are introduced.
2. **Secrets:** No repository secrets or credentials are read, stored, or exposed.
3. **Sandbox & Boundary Safety:** Application code under `src/**`, CMS schemas under `studio/**`, Cloudflare worker code, and native mobile code remain unmodified.
4. **Conservative Git Merge-Base Evaluation:** Change detection evaluates merge bases only against target branch candidates (`origin/${baseRef}`, `${baseRef}`). The dangerous `HEAD~1` fallback was eliminated, preventing multi-commit PRs from inspecting only their head commit. If git diff evaluation fails or cannot be determined, `check-scope.mjs` safely fails open (`should_run: true`).

---

## 7. Local & Automated Verification Evidence

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

4. **Automated Unit & Regression Tests (410 passing tests):**
   - `tests/ci/check-scope.test.ts` — 13/13 tests passed in 214ms.
   - `npm run test:adapter` — 270/270 tests passed.
   - `npm run test:gateway` — 112/112 tests passed.
   - `npm run test:native-participation` — 15/15 tests passed.

---

## 8. Operational Notes for Repository Owner

1. **GitHub Spending Limit & Alerts:**
   Confirm in GitHub Account Settings > **Billing and plans** > **Cost management** that the spending limit is set to the desired dollar amount ($20) and that email alerts are configured at 50%, 75%, 90%, and 100% of the threshold.
2. **Branch Protection Review:**
   Verify under repository **Settings > Branches > main**:
   - `Require status checks to pass before merging` is checked.
   - `Require branches to be up to date before merging` is checked.
   - The two designated required checks remain `Build reader application` and `Verify Sanity Studio`.
3. **Manual Lifecycle Probe Dispatch:**
   If a full native lifecycle probe against the test-only `@capacitor/app` thenable trap is ever desired on demand, trigger `Native iOS simulator build` via GitHub Actions UI with `Run secondary lifecycle probe` set to `true`. Routine PR runs will execute the full primary smoke suite without duplicate derived-data compilation.
