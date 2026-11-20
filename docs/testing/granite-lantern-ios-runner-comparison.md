# Granite Lantern (Issue #257) — Phase 1 ARM vs Intel iOS Simulator Runner Comparison

**Issue:** [Bibleberry/Bibleberry#257](https://github.com/Bibleberry/Bibleberry/issues/257) (Owner dispatch: [`#issuecomment-7027285310`](https://github.com/Bibleberry/Bibleberry/issues/257#issuecomment-7027285310))  
**PR:** [Bibleberry/Bibleberry#259](https://github.com/Bibleberry/Bibleberry/pull/259) (`ci/issue-257-granite-lantern`)  
**Scope:** Phase 1 ONLY — controlled ARM (`macos-26`) vs Intel (`macos-26-intel`) comparison preserving full signing-free iOS Simulator acceptance. No permanent runner switch, no branch-protection change, and no Phase 2 `scripts/ios-simulator-smoke.py` harness changes.

---

## Executive Summary & Recommendation

**Recommendation: Keep ARM (`macos-26`) for `.github/workflows/native-ios.yml`. Do NOT switch to `macos-26-intel`.**

In controlled, bit-for-bit app-parity trials executing the complete unmodified acceptance suite (Xcode 26.4.1 unsigned build, bundle/asset checks, Python smoke unit tests, `simctl` install/launch/terminate/relaunch, native Capacitor `Preferences.get` PTY check, and `AppUITests` XCUITest):

- **`macos-26` (ARM64) passed 3 / 3 full native runtime acceptance trials** (100% pass rate; job wall times `13m27s`–`22m22s`, mean `17m42s`), though CoreSimulator control-plane friction still appeared (1 device reset in Trial 1 and 1 retried `simctl terminate` timeout in Trial 3).
- **`macos-26-intel` (x86_64) passed 0 / 3 controlled Stage B trials** (0% pass rate; job wall times `18m19s`–`22m02s`) — and **0 / 4 overall** including the Stage A compatibility probe (`49m02s`, runner communication loss during `xcodebuild`).
- **Intel failed for three distinct infrastructure/performance reasons:**
  1. **Runner stability loss (Stage A):** Hosted `macos-26-intel` VM lost communication with GitHub 45 minutes into `Build unsigned iOS Simulator app`, dropping job logs and artifacts.
  2. **CoreSimulator control-plane stalls still occur on Intel (Stage B Trial 2):** Two consecutive `wait_for_simulator_ready` timeouts (`135.3s` on Attempt 1, `154.7s` after device reset on Attempt 2; `simctl list devices timed out or unavailable`), disproving the hypothesis that the 4-vCPU / 14-GiB Intel VM eliminates CoreSimulator hangs.
  3. **Systematic CPU/throughput deficit breaks the 420s XCUITest budget (Stage B Trials 1 & 3):** Both trials passed unsigned compilation, `simctl` install/launch/relaunch, and `Preferences.get` PTY cleanly, then timed out inside `xcodebuild test` (`422.8s` and `420.7s`) because compiling `AppUITests` and bootstrapping XCTest on the older `Intel Core i7-8700B` consumed ~260–297s before `testBundledReaderLaunchLifecycleAndRestart` even began (vs `259s`–`337s` total on Apple M1 ARM).
- **Zero application defects or crashes** (`newAppCrashReports: []`) were observed on either architecture.

*Small-sample caveat:* Three controlled trials per architecture plus one Stage A Intel probe (`n = 3 ARM, 4 Intel`) is an exploratory diagnostic sample, not a statistical guarantee of long-term flake rates. Even so, the observed failure modes on `macos-26-intel` (0/4 passes, slower older hardware/OS image, reproduced CoreSimulator stalls, and systematic 420s XCUITest exhaustion) rule out migrating the workflow to Intel.

If Aaron wishes to further reduce intermittent CoreSimulator retries/resets on `macos-26`, the next justified step is **separately authorized Phase 2 harness hardening on ARM** (as outlined in Issue #257), rather than changing runner architecture.

---

## Historical Context Reconciled from Issue #257

- **Prior #198 / PR #199 hardening on `macos-26`:** Implemented service-readiness polling (`wait_for_simulator_ready`), bounded classified `simctl` retries, one controlled simulator recreation, exception-safe cleanup, diagnostic capture, and 13 Python unit tests (`tests/ci/test_ios_simulator_smoke.py`).
- **Historical same-SHA ARM passes:** Runs [`43999063169`](https://github.com/Bibleberry/Bibleberry/actions/runs/43999063169), [`44001147552`](https://github.com/Bibleberry/Bibleberry/actions/runs/44001147552), and [`44003478095`](https://github.com/Bibleberry/Bibleberry/actions/runs/44003478095) passed on `macos-26`.
- **Synthetic UIKit experiment (PR #200, unmerged):** Run [`43999149666`](https://github.com/Bibleberry/Bibleberry/actions/runs/43999149666) reproduced `simctl spawn ... launchctl list` timeouts without Bibleberry app code, supporting (without conclusively proving) simulator-infrastructure attribution.
- **Distinct PTY-marker failure:** Run [`44230195240`](https://github.com/Bibleberry/Bibleberry/actions/runs/44230195240) failed when `To Native -> Preferences get` was absent from `02b-simctl-console-pty.log` (notably preceded by a `32.6s` `simctl_terminate_before_pty` timeout).
- **Copper Orchard PR #250 (merged — not reopened):** Run [`44584912543`](https://github.com/Bibleberry/Bibleberry/actions/runs/44584912543) Attempt 1 failed on `macos-26` after two `simctl terminate` timeouts (`30.9s`, `31.8s`) triggered a reset and the recreated device hit two `simctl spawn ... launchctl list` timeouts (`44.4s`, `30.5s`); unchanged-SHA Attempt 2 passed (with one best-effort `simctl_terminate_before_uninstall` timeout of `54.2s`), and PR #250 merged.
- **Recent `main` push baseline:** Run [`44640806860`](https://github.com/Bibleberry/Bibleberry/actions/runs/44640806860) (`be4c15a`) passed on `macos-26`, requiring Attempt 2 after two `simctl_screenshot_1` timeouts (`30.4s`, `33.9s`) triggered a device reset.

---

## Environment Equivalence, Availability & Pricing Verification

| Dimension | `macos-26` (ARM64 baseline) | `macos-26-intel` (x86_64 candidate) | Equivalent? |
| --- | --- | --- | --- |
| Runner tier / billing | Standard GitHub-hosted (`GitHub Actions`, label `macos-26`) — free/unmetered on public repo | Standard GitHub-hosted (`GitHub Actions`, label `macos-26-intel`) — free/unmetered on public repo | Yes (no larger/premium runners used) |
| Allocation availability | Immediate (<10s) across all 3 trials | Immediate (<10s) across all 4 runs | Yes |
| Host architecture (`uname -m`) | `arm64` | `x86_64` | Varied by design |
| CPU (`machdep.cpu.brand_string`) | `Apple M1 (Virtual)` | `Intel(R) Core(TM) i7-8700B CPU @ 3.20GHz` | Different generation/perf |
| vCPU / RAM (`hw.ncpu` / `hw.memsize`) | `3` vCPU / `7.0 GiB` (`7,516,192,768` B) | `4` vCPU / `14.0 GiB` (`15,032,385,536` B) | Intel has more RAM/vCPU, slower cores |
| Host macOS (`sw_vers`) | `26.7.2 (25G332)` | `26.6.1 (25G76)` | Older point release on Intel |
| Runner image (`ImageOS` / `ImageVersion`) | `macos26` / `20261102.0473.1` | `macos26` / `20260824.0517.1` | Intel image ~10 weeks older |
| Xcode version | `Xcode 26.4.1` (`Build version 17E202`) | `Xcode 26.4.1` (`Build version 17E202`) | Exact match |
| Simulator SDK | `iphonesimulator26.4` | `iphonesimulator26.4` | Exact match |
| Simulator runtime | `iOS 26.4 (26.4.1 - 23E254a)`, pre-installed (`IOS_RUNTIME_PROVISIONED=false`) | `iOS 26.4 (26.4.1 - 23E254a)`, pre-installed (`IOS_RUNTIME_PROVISIONED=false`) | Exact match |
| Target Simulator device | `iPhone 17` (`com.apple.CoreSimulator.SimDeviceType.iPhone-17`) | `iPhone 17` (`com.apple.CoreSimulator.SimDeviceType.iPhone-17`) | Exact match |
| Built `App.app/App` slices (`lipo -info`) | Fat binary: `x86_64 arm64` | Fat binary: `x86_64 arm64` | Exact match |

*Pricing/eligibility confirmation:* `Bibleberry/Bibleberry` is a public repository (`visibility: public`). Every job in this study ran strictly on standard GitHub-hosted runners (`macos-26` or `macos-26-intel`, runner group `GitHub Actions`). No larger or paid runners (`macos-26-large`, `macos-26-xlarge`, `macos-latest-large`, or self-hosted infrastructure) were invoked.

---

## Source SHA Provenance & App-Build Parity

- **Branch base at creation:** `origin/main` `262647829f9b8d4aa63f59e38cd1fd15c4222f0f` (`[Willow Lantern] #254`).
- **Production workflow preserved:** `.github/workflows/native-ios.yml` was not modified.
- **No app/harness edits:** Zero changes to `src/**`, `ios/**`, `public/**`, `index.html`, `package.json`, `package-lock.json`, `capacitor.config.ts`, `vite.config.ts`, `scripts/ios-simulator-smoke.py`, `scripts/ios-simulator-snapshot.py`, or `tests/ci/test_ios_simulator_smoke.py`.
- **Stage A Intel probe (Run [`44653872231`](https://github.com/Bibleberry/Bibleberry/actions/runs/44653872231)):** PR head SHA `ee5cfa3988a4a0574352e719caf442429a41c64c`.
- **Stage B 3×3 controlled run (Run [`44660120600`](https://github.com/Bibleberry/Bibleberry/actions/runs/44660120600)):** PR head SHA `a2556d24343aad0afcbdb01ca0eff78d7413ca55`. During the PR window, `main` advanced to `21ea10d` (after #255 `c6869bc` and #258 `21ea10d` merged). GitHub Actions checked out the exact same PR merge commit `HEAD=d6bea9e456d945a74a6994e2c1e446d79725fe4e` across all 6 trials. Every trial logged `app-parity.txt` confirming bit-for-bit identical Git object hashes across all 3 ARM and all 3 Intel trials (matching `origin/main` `21ea10d`):
  - `src` = `a10b7df68ec70a6ffb6b7ae7e797cf791b2c3656`
  - `ios` = `4d05fd05b90953f2c920b29bcc188b0fb6ee2a99`
  - `public` = `0502243309848722062a0402be3efdbb8e8afef5`
  - `index.html` = `bd520f06ee1f46134339da450a117c8a68ca7f58`
  - `package.json` = `c959fb216b81167dc18372e163b9379839c2be54`
  - `package-lock.json` = `68b9d8a1841a7b0fb97102bd276e38a6982b39f5`
  - `capacitor.config.ts` = `354c5051ec25390997d10867a1b4206a2d3b5e03`
  - `vite.config.ts` = `d55fe455c9ef0b2ae91fb5817f203e15de3e90e8`
  - `scripts/ios-simulator-smoke.py` = `db5e73fd3fe1df8a1052d8f66afba4fc8b2503c6`
  - `scripts/ios-simulator-snapshot.py` = `bf1b1231df29d0f549989563f89a04a924c80e76`
  - `tests/ci/test_ios_simulator_smoke.py` = `3907495076245bbad8c44fe777b605665ed2c9eb`

---

## Sequencing Accounting: Stage A Probe → Stage B 3×3 Controlled Matrix

Owner dispatch required first executing one Intel diagnostic run to verify runner availability/compatibility before proceeding to 3 controlled trials per architecture.

- **Stage A Probe ([Run `44653872231`](https://github.com/Bibleberry/Bibleberry/actions/runs/44653872231) / [Job `136015217304`](https://github.com/Bibleberry/Bibleberry/actions/runs/44653872231/job/136015217304), SHA `ee5cfa39`):**
  - **What succeeded:** Standard `macos-26-intel` runner allocated immediately (`GitHub Actions 1000000928`); `Select documented Xcode 26.4.1` passed (`19s`, proving Xcode 26.4.1 / Build `17E202` / `iphonesimulator26.4` exist); `Provision iOS 26.4 Simulator runtime when missing` passed (`2s`, proving iOS 26.4 runtime is pre-installed); `npm ci` (`102s`), `npm run build` (`34s`), `npx cap sync ios` (`2s`), and `Inspect iOS Simulator destinations` (`53s`) all passed.
  - **What failed:** `Build unsigned iOS Simulator app` ran for ~45 minutes until GitHub terminated the job (`49m02s` total) with `"The hosted runner lost communication with the server"`. Because the runner lost communication before job finalization, GitHub returned HTTP 404 (`BlobNotFound`) for the job log and 0 artifacts were uploaded.
  - **Why proceeding to Stage B was justified (while preserving Stage A as a failed Intel attempt):** Stage A proved `macos-26-intel` is available on the free standard tier and has the exact required Xcode 26.4.1 + iOS 26.4 runtime, so it was not an SDK/runtime incompatibility blocker — yet the runner communication loss erased all hardware/image and `xcodebuild` diagnostic evidence. Checkpoint 2 (`a2556d24`) added pre-build environment artifact upload (before `xcodebuild`), `set -o pipefail` + `tee` build log capture, and strict `timeout-minutes: 20` on the build step (`45m` job cap) without weakening any assertion, then ran 3 sequential fresh-VM trials per architecture (`fail-fast: false`, `max-parallel: 1` per architecture) in [Run `44660120600`](https://github.com/Bibleberry/Bibleberry/actions/runs/44660120600).
  - **Independent-attempt accounting:** Zero failed GitHub Actions jobs were rerun/retried. All 7 jobs below (1 Stage A Intel probe + 3 Stage B ARM trials + 3 Stage B Intel trials) are independently allocated fresh VMs. In-script `simctl` command retries and simulator device resets are reported separately.

---

## Complete Execution Ledger (Compile/Package vs Full Runtime Acceptance)

A build-only pass is **not** a native simulator acceptance pass; all stages including `simctl` relaunch, native `Preferences.get` PTY verification, and `AppUITests` XCUITest must succeed.

| Stage & Trial | Runner (VM ID) | Run / Job Link | Compile & Package | Full Runtime Acceptance | Wall Time | In-Script Timeouts | Device Resets | Crashes | Failure Classification & Root Evidence | Retained Artifacts |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Stage A Probe | `macos-26-intel` (`1000000928`) | [44653872231 / 136015217304](https://github.com/Bibleberry/Bibleberry/actions/runs/44653872231/job/136015217304) | **FAIL** | **FAIL** | `49m02s` (`2942s`) | N/A (runner lost) | N/A | Unknown | **Infrastructure:** Hosted runner lost communication ~45m into `xcodebuild` build; job log blob lost. | None (runner dropped before upload) |
| Stage B ARM 1 | `macos-26` (`1000000935`) | [44660120600 / 136036005236](https://github.com/Bibleberry/Bibleberry/actions/runs/44660120600/job/136036005236) | **PASS** | **PASS** (Attempt 2) | `22m22s` (`1342s`) | `2` (`simctl_verify_pid_launchctl` `36.3s`, `31.3s`) | `1` | `0` | Recovered from Attempt 1 CoreSimulator `launchctl list` stall via single device reset; `AppUITests` 1/1 passed (`101.4s`). | Env `14596110089`, Evidence `14595139777` |
| Stage B ARM 2 | `macos-26` (`1000000947`) | [44660120600 / 136036005374](https://github.com/Bibleberry/Bibleberry/actions/runs/44660120600/job/136036005374) | **PASS** | **PASS** (Attempt 1) | `13m27s` (`807s`) | `0` | `0` | `0` | Clean first-attempt pass; `AppUITests` 1/1 passed (`130.9s`). | Env `14595829201`, Evidence `14596293499` |
| Stage B ARM 3 | `macos-26` (`1000000953`) | [44660120600 / 136036005218](https://github.com/Bibleberry/Bibleberry/actions/runs/44660120600/job/136036005218) | **PASS** | **PASS** (Attempt 1) | `17m17s` (`1037s`) | `1` (`simctl_terminate_1` `41.5s`) | `0` | `0` | Recovered on immediate `simctl terminate` retry (`12.6s`); `AppUITests` 1/1 passed (`127.8s`). | Env `14597017323`, Evidence `14596714684` |
| Stage B Intel 1 | `macos-26-intel` (`1000000940`) | [44660120600 / 136036005434](https://github.com/Bibleberry/Bibleberry/actions/runs/44660120600/job/136036005434) | **PASS** | **FAIL** | `21m49s` (`1309s`) | `1` (`xcodebuild_xcuitest` `422.8s`) | `0` | `0` | **Infrastructure / host perf:** `simctl` + `Preferences.get` PTY passed; `xcodebuild test` hit 420s cap mid-test (`t=114.5s`, after `60.3s` XCTest `Set Up`). | Env `14595232449`, Evidence `14595219413` |
| Stage B Intel 2 | `macos-26-intel` (`1000000941`) | [44660120600 / 136036005015](https://github.com/Bibleberry/Bibleberry/actions/runs/44660120600/job/136036005015) | **PASS** | **FAIL** | `18m19s` (`1099s`) | `2` (`wait_for_simulator_ready` `135.3s`, `154.7s`) | `1` | `0` | **Infrastructure / CoreSimulator stall:** Both Attempt 1 and Attempt 2 timed out in readiness polling (`simctl list devices timed out or unavailable` × 3 polls). | Env `14595669513`, Evidence `14597062534` |
| Stage B Intel 3 | `macos-26-intel` (`1000000954`) | [44660120600 / 136036005324](https://github.com/Bibleberry/Bibleberry/actions/runs/44660120600/job/136036005324) | **PASS** | **FAIL** | `22m02s` (`1322s`) | `1` (`xcodebuild_xcuitest` `420.7s`) | `0` | `0` | **Infrastructure / host perf:** `simctl` + `Preferences.get` PTY passed; `xcodebuild test` spent ~297s compiling/bootstrapping, then timed out at 420s right at `t=119.75s Tear Down`. | Env `14597707013`, Evidence `14598147010` |

---

## Per-Stage Timing Comparison (Stage B Controlled Run `44660120600`)

All durations in seconds (`s`). For trials with a device reset (ARM 1, Intel 2), Attempt 1 and Attempt 2 simulator timings are shown as `A1 / A2`.

| Stage | ARM Trial 1 | ARM Trial 2 | ARM Trial 3 | Intel Trial 1 | Intel Trial 2 | Intel Trial 3 |
| --- | --- | --- | --- | --- | --- | --- |
| Select Xcode 26.4.1 | `13.0` | `11.0` | `11.0` | `55.0` | `16.0` | `52.0` |
| Runtime check (`IOS_RUNTIME_PROVISIONED=false`) | `2.0` | `2.0` | `3.0` | `2.0` | `1.0` | `3.0` |
| `npm ci` | `73.0` | `63.0` | `56.0` | `80.0` | `90.0` | `80.0` |
| `npm run build` | `24.0` | `15.0` | `15.0` | `24.0` | `25.0` | `24.0` |
| `npx cap sync ios` | `2.0` | `1.0` | `1.0` | `2.0` | `4.0` | `2.0` |
| `xcodebuild -showdestinations` | `25.0` | `16.0` | `17.0` | `41.0` | `45.0` | `44.0` |
| `Build unsigned iOS Simulator app` | `69.0` | `49.0` | `52.0` | `86.0` | `110.0` | `101.0` |
| Python smoke unit tests (13 tests) | `1.0` | `<1.0` | `1.0` | `1.0` | `1.0` | `1.0` |
| `simctl create` | `0.7 / 0.8` | `0.4` | `0.4` | `0.7` | `0.8 / 1.0` | `0.7` |
| `simctl boot` | `20.1 / 5.6` | `11.6` | `11.4` | `2.8` | `3.9 / 2.1` | `3.3` |
| `simctl bootstatus -b` | `127.1 / 141.9` | `144.9` | `190.6` | `155.7` | `194.0 / 190.9` | `160.8` |
| `wait_for_simulator_ready` | `30.3 / 146.5` (4 polls) | `11.4` (1 poll) | `10.4` (1 poll) | `79.4` (2 polls) | **TIMEOUT** `135.3 / 154.7` | `120.9` (4 polls) |
| `simctl install` | `20.6 / 27.3` | `15.2` | `23.4` | `52.3` | *(not reached)* | `48.6` |
| `simctl launch` (initial) | `17.6 / 1.4` | `1.5` | `1.3` | `2.3` | *(not reached)* | `8.1` |
| `verify_pid_alive` (`launchctl list`) | **TIMEOUT** `36.3+31.3` / `18.7` | `5.4` | `4.5` | `5.2` | *(not reached)* | `25.5` |
| `simctl io screenshot` (initial) | `— / 14.7` | `11.6` | `16.4` | `15.9` | *(not reached)* | `27.2` |
| `simctl terminate` | `— / 2.2` | `0.6` | **TIMEOUT** `41.5` + retry `12.6` | `19.0` | *(not reached)* | `6.0` |
| `simctl launch` (relaunch) | `— / 1.1` | `5.7` | `4.7` | `8.9` | *(not reached)* | `3.9` |
| `verify_pid_alive` (relaunch) | `— / 2.8` | `9.6` | `7.4` | `15.7` | *(not reached)* | `10.9` |
| `simctl io screenshot` (relaunch) | `— / 12.9` | `5.9` | `13.3` | `11.1` | *(not reached)* | `5.4` |
| Native `Preferences.get` PTY check | **PASS** | **PASS** | **PASS** | **PASS** | *(not reached)* | **PASS** |
| `simctl uninstall` | `16.9` | `3.2` | `3.4` | `14.1` | *(not reached)* | `3.7` |
| `xcodebuild test` (`AppUITests`, 420s cap) | **`259.3`** (`101.4s` test) | **`310.9`** (`130.9s` test) | **`337.4`** (`127.8s` test) | **TIMEOUT `422.8`** | *(not reached)* | **TIMEOUT `420.7`** |
| Cleanup (`terminate`+`shutdown`+`delete`) | `20.9 / 7.9` | `6.6` | `12.2` | `34.7` | `11.0 / 13.8` | `28.6` |
| **Total runtime smoke step** | `1101.0` | `620.0` | `845.0` | `982.0` (fail) | `786.0` (fail) | `991.0` (fail) |
| **Total job wall time** | **`1342.0` (`22m22s`)** | **`807.0` (`13m27s`)** | **`1037.0` (`17m17s`)** | **`1309.0` (`21m49s`)** | **`1099.0` (`18m19s`)** | **`1322.0` (`22m02s`)** |

---

## Diagnostic Quality & Failure Analysis

1. **Diagnostic artifact quality:** On all 6 Stage B trials, `summary.json`, `env/runner-hardware.txt`, `env/app-parity.txt`, `env/xcodebuild-build.log`, `simctl-devices-before.json`, `simctl-devices-after-failure.json`, and CoreSimulator logs uploaded cleanly. On Intel Trials 1 and 3, partial `AppUITests.xcresult/Staging/1_Test/Diagnostics/` logs were also preserved, proving the exact failure mechanism:
   - **Intel Trial 1:** `AppUITests` bootstrapped at `02:39:40Z`, spent `60.26s` in `Set Up` and `44s` reaching foreground, and was actively polling for the `Continue` button (`t = 114.47s`) when the 420s `xcodebuild` cap fired.
   - **Intel Trial 3:** `xcodebuild test` spent ~`297s` compiling/bootstrapping (`Test Suite 'All tests' started at 03:20:20Z`), then ran all assertions through `07-after-reset-relaunch` and reached `t = 119.75s Tear Down` right as the 420s timeout killed `xcodebuild`.
   - **Intel Trial 2:** `CoreSimulator.log` and `summary.json` confirmed `simctl list devices` timed out repeatedly across two separate simulator devices (`123AD124-...` and `FF33382E-...`).
2. **Stage A evidence gap:** Because the hosted Intel runner lost communication in Run `44653872231`, no VM-side logs or artifacts exist for that failure; this gap is mitigated (not erased) by the full artifact sets from Stage B Trials 1–3.
3. **ARM residual risk:** ARM passed 3/3 Stage B trials, yet still experienced transient CoreSimulator timeouts (`simctl_verify_pid_launchctl` in Trial 1 and `simctl_terminate_1` in Trial 3), consistent with Copper Orchard (`44584912543`) and `main` push (`44640806860`). Keeping iOS outside mandatory `merge_group` gates remains prudent until any future Phase 2 harness work is separately approved and proven.

---

## Decision Options for Aaron

1. **Recommended — Keep ARM (`macos-26`) as the production runner in `.github/workflows/native-ios.yml`:**
   - Zero permanent runner change required; `.github/workflows/native-ios.yml` remains unchanged.
   - Keep `.github/workflows/native-ios-runner-comparison.yml` strictly `workflow_dispatch`-only as an opt-in diagnostic tool (never triggered on PRs, `main` pushes, or `merge_group`).
   - If further ARM CoreSimulator reliability improvement is desired, separately authorize **Phase 2** (postcondition-verified `simctl terminate`, safer PID verification when `launchctl list` hangs, and deterministic native `Preferences` bridge verification on `macos-26`).
2. **Not recommended — Move to `macos-26-intel`:**
   - 0/4 pass rate in this investigation, ~1.4×–2.5× slower build/install/readiness stages, older macOS 26.6.1 image on `i7-8700B`, still suffers CoreSimulator stalls (Trial 2), and fails the unmodified 420s XCUITest budget (Trials 1 & 3).
3. **Not authorized / out of scope here — Larger/paid macOS runners (`macos-26-xlarge` / `macos-26-large`):**
   - Billed per minute even on public repositories; not tested or authorized in Phase 1.
