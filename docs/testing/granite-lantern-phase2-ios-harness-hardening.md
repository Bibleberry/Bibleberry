# Granite Lantern (Issue #257) — Phase 2 ARM iOS Simulator Harness Hardening

**Issue:** [Bibleberry/Bibleberry#257](https://github.com/Bibleberry/Bibleberry/issues/257) (Owner Phase 2 authorization: [`#issuecomment-7029709103`](https://github.com/Bibleberry/Bibleberry/issues/257#issuecomment-7029709103))  
**Phase 1 Baseline:** [PR #259](https://github.com/Bibleberry/Bibleberry/pull/259) (merged into `main` at `0d1e584`; report at `docs/testing/granite-lantern-ios-runner-comparison.md`)  
**Phase 2 PR:** [Bibleberry/Bibleberry#262](https://github.com/Bibleberry/Bibleberry/pull/262) (`fix/issue-257-granite-lantern-phase2`)  
**Scope:** Phase 2 ONLY — harden `scripts/ios-simulator-smoke.py` on the standard GitHub-hosted ARM (`macos-26`) runner using affirmative postcondition verification, independent multi-signal `launchctl`-stall fallback, fresh-PID PTY launch coordination, and deterministic negative-path regression tests (`tests/ci/test_ios_simulator_smoke.py`). Zero changes to `.github/workflows/native-ios.yml`, Phase 1 files, `src/**`, `ios/**`, `android/**`, runner architecture, required checks, or branch protection.

---

## Executive Summary

- **Runner preserved:** Standard GitHub-hosted ARM (`macos-26`) with Xcode 26.4.1 (`17E202`), `iphonesimulator26.4`, iOS `26.4 (26.4.1 - 23E254a)`, and full unsigned build + `simctl` install/launch/terminate/relaunch + mandatory native Capacitor `Preferences.get` PTY verification + full `AppUITests` XCUITest.
- **Root cause of Run `44230195240` (`Preferences.get` PTY marker missing) proven and fixed in harness:** Forensic inspection of retained `44230195240` artifacts (artifact `14393939594`) proved `simctl_terminate_before_pty` used `run_cmd_best_effort`, timed out at `32.626s` while leaving `relaunchPid` `9462` running, and caused `simctl launch --console-pty` to attach to the already-running PID (`02b-simctl-console-pty.log` was 36 bytes: `com.example.bibleberry.r20poc: 9462`) instead of launching a fresh process with a fresh PTY. Replacing `run_cmd_best_effort` with postcondition-verified termination plus explicit fresh-PID detection in `capture_console_pty_launch` resolves this mechanism without touching app source (`src/**` or `ios/**`).
- **Deterministic regression coverage:** Expanded `tests/ci/test_ios_simulator_smoke.py` from 13 to **29 passing unit tests** covering all authorized positive and negative scenarios `(a)`–`(k)`.
- **Hosted ARM (`macos-26`) verification on unchanged code SHA `42f4d08c0df5d77a03797e07f19ef366081bb896` (3 independent fresh-VM attempts, 0 hidden/rerun failures):**
  - **`simctl` lifecycle + mandatory fresh-PID native `Preferences.get` PTY verification:** **3 / 3 PASS**, **0 device resets**, **0 crashes**.
  - **Live proof of Phase 2 `launchctl`-stall fallback (Attempt 1, [`44676668482`](https://github.com/Bibleberry/Bibleberry/actions/runs/44676668482)):** `simctl spawn ... launchctl list` timed out twice (`32.5s`, `34.5s`) — the exact failure mode that forced a ~3-minute device reset in Phase 1 ARM Trial 1 (`44660120600`) and failed Copper Orchard (`44584912543`). Phase 2 resolved it via `independent_fallback_verified` (host PID/PPID continuity + container binary path + `Info.plist` `CFBundleIdentifier` + `Booted` state + fresh `1206x2622` PNG + post-screenshot recheck + 0 crashes) and passed full acceptance including `AppUITests` in **`14m23s`** with **0 device resets**.
  - **Clean first-attempt pass (Attempt 2, [`44676685643`](https://github.com/Bibleberry/Bibleberry/actions/runs/44676685643)):** **PASS** in **`16m43s`**, 0 timeouts, 0 device resets.
  - **Honest XCUITest failure preserved (Attempt 3, [`44676712580`](https://github.com/Bibleberry/Bibleberry/actions/runs/44676712580)):** **FAIL** (`17m25s`). The entire `simctl` + fresh-PID PTY `Preferences.get` phase passed cleanly (`0` timeouts, `0` resets); `xcodebuild test` (`AppUITests`) failed with exit code 65 at `AppUITests.swift:60` (`Onboarding Continue button not rendered in WKWebView`) after WebKit logged `ProcessThrottlerTimedActivity::activityTimedOut: Client navigation (timeout: 30 sec)` on a heavily loaded VM. In accordance with strict failure semantics, the harness **did not retry, reset, or hide** this XCUITest failure.
  - **Overall full acceptance across the 3 Phase 2 hosted ARM attempts:** **2 / 3 PASS, 1 / 3 FAIL** (`n = 3` is a small exploratory sample and cannot establish statistical reliability; see Phase 1 comparison and residual risks below).

---

## 1. Original Failure Mechanisms Audited from Retained Artifacts

Four retained GitHub Actions evidence sets were downloaded and audited directly before implementing Phase 2:

1. **Ambiguous `simctl terminate` timeouts & retry `ESRCH` trap** ([Copper Orchard `44584912543` Attempt 1](https://github.com/Bibleberry/Bibleberry/actions/runs/44584912543), artifact `14561289598`; [Phase 1 ARM Trial 3 `44660120600`](https://github.com/Bibleberry/Bibleberry/actions/runs/44660120600), artifact `14596714684`):
   - In `44584912543` Attempt 1, `simctl_terminate_1` timed out twice (`30.9s`, `31.8s`). Retained `retry-launchctl-list.txt` proved PID `9066` (`UIKitApplication:com.example.bibleberry.r20poc`) was **still alive** after both timeouts — proving that presuming termination succeeded on timeout would create a dangerous false positive.
   - Conversely, when `simctl terminate` kills the app right before a 30s XPC transport timeout, an immediate retry returns POSIX `ESRCH` (exit code `3`, `"No such process"`). Previously, `"no such process"` was not in `TRANSIENT_SIMCTL_ERROR_MARKERS`, so a late-completing kill could fail the entire run on retry as a non-transient `CalledProcessError`.
2. **`simctl spawn ... launchctl list` hangs while app is healthy** ([Copper Orchard `44584912543` Attempt 1 Device 2](https://github.com/Bibleberry/Bibleberry/actions/runs/44584912543), artifact `14561289598`; [Phase 1 ARM Trial 1 `44660120600`](https://github.com/Bibleberry/Bibleberry/actions/runs/44660120600), artifact `14595139777`):
   - In both runs, host `ps` confirmed the exact app binary (`.../Devices/<UDID>/data/Containers/Bundle/Application/<UUID>/App.app/App`) was alive, `01-simctl-launch-stderr.log` confirmed `App[<pid>]` initialized `DiskCookieStorage` in its Data container, and diagnostic `launchctl-list.txt` collected seconds later showed `UIKitApplication:com.example.bibleberry.r20poc` running under that exact PID. Only the `simctl spawn ... launchctl list` query hung past 30s twice, forcing a full ~3–6 minute simulator device reset (or run failure when resets were exhausted).
3. **Missing `To Native -> Preferences get` PTY marker** ([Run `44230195240`](https://github.com/Bibleberry/Bibleberry/actions/runs/44230195240), artifact `14393939594`):
   - `summary.json` recorded `relaunchPid: 9462`, followed by `simctl_terminate_before_pty` (called via `run_cmd_best_effort`) timing out at `32.626s` (`timedOut: true, returncode: null`).
   - Because `run_cmd_best_effort` swallowed the timeout without checking whether PID `9462` stopped, `capture_console_pty_launch` immediately invoked `xcrun simctl launch --console-pty` while PID `9462` was still running.
   - Retained `attempt-1/02b-simctl-console-pty.log` (36 bytes total) contained literally:
     ```
     com.example.bibleberry.r20poc: 9462
     ```
   - `simctl launch --console-pty` attached to the already-running PID `9462` rather than spawning a fresh process; PID `9462`'s stdout remained bound to `02-simctl-relaunch-stdout.log` and its startup `Preferences.get` bridge calls had already fired ~35s earlier.

---

## 2. Changed Control Logic (`scripts/ios-simulator-smoke.py`)

All changes are confined to `scripts/ios-simulator-smoke.py` (Python stdlib only; added `hashlib`, `plistlib`, `struct`; zero external dependencies).

### A. Postcondition-Verified `simctl terminate` (`verify_termination_postconditions`, `terminate_app_with_postconditions`)
- Used for both `simctl_terminate_1` (between initial launch and relaunch) and `simctl_terminate_before_pty` (between relaunch and `--console-pty` launch). Best-effort teardown in `cleanup_simulator` remains exception-safe and is never used as acceptance evidence.
- On an ambiguous outcome (`TimeoutExpired`, transient CoreSimulator transport error, or retry-only `ESRCH` exit code `3` *strictly after* a prior ambiguous attempt — first-attempt `ESRCH` fails immediately because it signals premature app exit), `verify_termination_postconditions` requires **all four** affirmative postconditions to classify `conclusively_stopped`:
  1. **Zero new matching app crash reports** (`find_new_app_crashes(run_start_epoch) == []`). Any crash report raises an immediate `RuntimeError` (never retried or reset).
  2. **Expected PID conclusively absent** (`ps -p <pid> -o pid=,ppid=,stat=,etime=,comm=` cleanly returns exit `1` with empty stdout). Explicitly distinguishes `absent` from `app_still_running`, `zombie`, `pid_reused_or_wrong_identity` (PID now belongs to another executable or parent PID), and `identity_unavailable` (`ps` timeout, nonzero error, or malformed output).
  3. **Zero remaining matching simulator app processes** (`ps -axo pid=,ppid=,stat=,etime=,comm=` succeeds and finds 0 processes executing this simulator's `<installedContainer>/App` binary).
  4. **Confirmed simulator device state** (`get_simulator_state(udid) == "Booted"`).
- If all four hold, the resolution is recorded in `summary["postconditionResolutions"]` (`verdict: "conclusively_stopped"`) and execution proceeds without a wasted retry/reset. If inconclusive, bounded retry (`retries=1`) and single device reset (`--max-device-resets 1`) apply; if exhausted, `SimulatorInfrastructureError` preserves the original timeout/error plus postcondition verdict. Even when `simctl terminate` returns exit `0`, postconditions still verify the app stopped and did not crash.

### B. Independent Multi-Signal Fallback for `launchctl list` Stalls (`verify_pid_alive`, `classify_process_identity`, `capture_fresh_screenshot`, `validate_screenshot_file`)
- `xcrun simctl spawn <udid> launchctl list` remains the **primary** process-verification path (`verification_mode=launchctl_primary`).
- Host `ps` is now identity-checked upfront against `<installedContainer>/App` and `<installedContainer>/Info.plist` (`CFBundleIdentifier == bundle_id`), immediately failing on wrong bundle ID, wrong executable, zombie state, or unreadable identity before `launchctl` even runs.
- Only when `launchctl list` exhausts its bounded retry with `SimulatorInfrastructureError`, `verify_pid_alive` may resolve via `launchctl_stall_independent_fallback` **if and only if every signal below succeeds**:
  1. Zero new app crash reports before, during, and after fallback verification.
  2. Post-stall host `ps` confirms exact `pid`, unchanged `ppid`, non-zombie state, exact `<installedContainer>/App` path for `<udid>`, and `Info.plist` `CFBundleIdentifier == bundle_id`.
  3. Simulator device state confirmed `"Booted"`.
  4. Fresh current-launch screenshot captured via `capture_fresh_screenshot` (unlinks any pre-existing file prior to capture, records `capture_started_epoch`, enforces `mtime >= capture_started_epoch - 1.0`, valid PNG signature `\x89PNG\r\n\x1a\n` + `IHDR` positive dimensions, and `size >= 1024` bytes). Any screenshot stall raises `SimulatorInfrastructureError`; any stale/corrupt/small screenshot raises `RuntimeError`.
  5. Post-screenshot bracket recheck confirms the exact same `pid`, `ppid`, `<installedContainer>/App`, `Info.plist`, and zero crashes *after* the screenshot completed.
- Full fallback evidence is written to `01-launch-process.txt` / `02-relaunch-process.txt` and `summary["postconditionResolutions"]`, and all subsequent stages (terminate, fresh relaunch with `pid2 != pid1`, mandatory fresh-PID PTY `Preferences.get`, and full `AppUITests`) remain mandatory.

### C. Fresh-PID PTY Coordination & `Preferences.get` Disposition (`capture_console_pty_launch`)
- **Disposition of the `Preferences.get` PTY-marker issue:** **Resolved within Phase 2 harness** for the root-caused `44230195240` failure mechanism (unverified terminate timeout causing `--console-pty` to reuse an already-running PID). No `src/**`, `ios/**`, Capacitor plugin, or bundled-app probe edits were made.
- `simctl_terminate_before_pty` now uses `terminate_app_with_postconditions` against `pid2`, preventing `--console-pty` from launching while `pid2` is still running.
- `capture_console_pty_launch` parses `launchedPid` from the PTY stream, compares it against `previous_pid`, records `ptyCapture` metadata (`previousPid`, `launchedPid`, `freshProcessLaunched`, `reusedRunningProcess`, `captureDurationSeconds`, `readinessAfterSeconds`, `nativePreferencesToJsObserved`, `webViewLoadedObserved`), exits early instead of waiting 60s if a reused PID is ever observed, and fails explicitly with scoped simulator logs captured (`02b-simctl-console-pty-logs.txt`).
- **Mandatory native bridge check preserved:** Absent `To Native -> Preferences get` (or presence of `Preferences.then` Proxy trap) always raises `RuntimeError` without retry or device reset. If Aaron ever wants an additional persistence write/read-back bridge probe inside app/XCUITest source, that remains a **separately deferred** follow-up requiring explicit source-change authorization.

---

## 3. Verification That Bona Fide Faults Still Fail (29 Deterministic Tests)

Local verification command results (all executed on `fix/issue-257-granite-lantern-phase2`):
- `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest -v tests/ci/test_ios_simulator_smoke.py`: **29 / 29 PASS** (`0.256s` — 13 existing + 16 new Phase 2 tests).
- `node --experimental-strip-types --test tests/ci/native-trigger-parity.test.ts tests/ci/ios-runner-comparison-policy.test.ts tests/ci/draft-pr-ci-policy.test.ts tests/ci/check-scope.test.ts tests/ci/merge-queue-config.test.ts`: **32 / 32 PASS**.
- `npm run lint`: **PASS**.
- `npm run build`: **PASS** (`tsc -b && vite build`).
- `git diff --check`: **CLEAN**.

| Authorized Scenario | Regression Test(s) in `tests/ci/test_ios_simulator_smoke.py` | Verified Behavior |
| --- | --- | --- |
| `(a)` Terminate timeout, conclusively stopped & not crashed | `test_terminate_timeout_recovers_when_postconditions_confirm_stopped`, `test_terminate_retry_esrch_recovers_only_after_ambiguous_attempt` | Proceeds with `conclusively_stopped` (0 resets); first-attempt `ESRCH` still fails immediately |
| `(b)` Terminate timeout, app still alive | `test_terminate_timeout_with_app_still_alive_fails_and_blocks_relaunch`, `test_terminate_before_pty_timeout_still_alive_blocks_stale_pty_launch`, `test_terminate_exit_zero_still_fails_if_app_remains_alive` | Never classified as success; blocks relaunch and blocks stale PTY launch (`44230195240` guard) |
| `(c)` PID reused or wrong identity | `test_pid_reused_or_wrong_identity_is_never_classified_as_success`, `test_launchctl_fallback_rejects_ppid_change_non_png_and_shutdown_device` | Rejects unrelated executable on terminate or liveness, and rejects `ppid` change during `launchctl` stall |
| `(d)` Identity evidence unavailable/ambiguous | `test_unavailable_or_ambiguous_identity_evidence_fails_closed` | Fails closed on `ps -p` timeout/malformed output, `ps -axo` failure, or non-Booted simulator |
| `(e)` `launchctl` hangs, independent app + fresh render succeeds | `test_launchctl_hang_recovers_via_independent_app_and_fresh_render_evidence` | Resolves via `independent_fallback_verified` with 0 resets and still executes relaunch, PTY `Preferences.get`, and XCUITest |
| `(f)` App exited or wrong bundle ID | `test_app_exited_or_wrong_bundle_id_fails_strictly`, `test_verify_pid_alive_checks_ps_first_and_routes_launchctl_timeout` | Fails immediately on wrong `CFBundleIdentifier` in `Info.plist` or app exit before/during/after screenshot (0 resets) |
| `(g)` Screenshot capture stalls or is stale | `test_launchctl_hang_with_stalled_or_stale_screenshot_fails`, `test_launchctl_fallback_rejects_ppid_change_non_png_and_shutdown_device` | Never passes on stalled `simctl io screenshot`, stale `mtime`, or invalid non-PNG bytes |
| `(h)` Missing native `Preferences` marker | `test_missing_native_preferences_marker_and_reused_pty_pid_fail_strictly`, `test_console_pty_capture_detects_reused_previous_pid_early` | Strict failure (0 resets) with scoped logs captured; explicit failure if PTY reuses `previous_pid` |
| `(i)` Crash evidence | `test_crash_evidence_blocks_terminate_and_launchctl_recovery` | Immediate `RuntimeError` (0 retries, 0 resets) even if PID is absent on terminate or alive on `launchctl` stall |
| `(j)` True XCUITest failure | `test_true_xcuitest_failure_fails_immediately_without_device_reset` *(plus live hosted Attempt 3 `44676712580`)* | Immediate `rc = 1` on Attempt 1 (0 resets) with `03-xcuitest-stdout.log`/`stderr.log` preserved |
| `(k)` Retry/device-reset exhaustion & original error preserved | `test_exhausted_terminate_retries_and_device_reset_preserves_original_error`, `test_cleanup_timeouts_do_not_mask_original_error` | Exhausts retries + 1 reset, preserves original timeout + `app_still_running` despite cleanup timeouts |

---

## 4. Hosted `macos-26` ARM Verification Evidence

### Source SHA Provenance & Object Parity
- **Base `main` SHA:** `0d1e584` (includes merged Phase 1 PR #259).
- **Evaluated Phase 2 code SHA (all 3 hosted ARM runs + PR Linux CI):** `42f4d08c0df5d77a03797e07f19ef366081bb896`.
- **Exact Git object hashes evaluated (unchanged in final docs-only report commit):**
  - `scripts/ios-simulator-smoke.py`: `1bb2c0744e0aa56ec37ec0cfb5ec3a53292ef9b2`
  - `tests/ci/test_ios_simulator_smoke.py`: `aabf50044aff22630c446366ce496a3b18ea0b8e`
  - `.github/workflows/native-ios.yml`: `401e3fb5ac830facc728ae51ffcf42b599157100` (unchanged from `main`)
  - `src`: `a10b7df68ec70a6ffb6b7ae7e797cf791b2c3656` (unchanged from `main` & Phase 1)
  - `ios`: `4d05fd05b90953f2c920b29bcc188b0fb6ee2a99` (unchanged from `main` & Phase 1)
- **PR Linux checks on `42f4d08c`:** `Bibleberry CI` ([`44676668703`](https://github.com/Bibleberry/Bibleberry/actions/runs/44676668703)) **PASS**, `Collections Browser Tests` ([`44676668558`](https://github.com/Bibleberry/Bibleberry/actions/runs/44676668558)) **PASS**.

### Complete Hosted ARM Execution Ledger (3 Independent Fresh-VM Runs, Unchanged SHA `42f4d08c`)

No failed run was rerun or hidden. All three runs executed unmodified `.github/workflows/native-ios.yml` on standard GitHub-hosted `macos-26` (Apple M1, macOS `26.7.2`, Xcode `26.4.1 / 17E202`, iOS `26.4.1 / 23E254a`, `iPhone 17`).

| Attempt | Trigger | Run / Job Link | Runner Image | Compile & Package | `simctl` + PTY `Preferences.get` | Full Acceptance (incl. `AppUITests`) | Wall Time | Postcondition Resolutions | Device Resets | Crashes | Retained Evidence Artifact |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Phase 2 ARM 1** | `pull_request` | [44676668482 / 136090017818](https://github.com/Bibleberry/Bibleberry/actions/runs/44676668482/job/136090017818) | `20261117.0516.1` | **PASS** | **PASS** (PID `14995` != `13330`, `5.76s`) | **PASS** (`AppUITests` `202.9s`) | `14m23s` (`863s`) | **`1` (`independent_fallback_verified` after 2× `launchctl list` timeouts `32.5s`, `34.5s`)** | `0` | `0` | `14603610895` (`4.1 MB`) |
| **Phase 2 ARM 2** | `workflow_dispatch` | [44676685643 / 136090079094](https://github.com/Bibleberry/Bibleberry/actions/runs/44676685643/job/136090079094) | `20261102.0473.1` | **PASS** | **PASS** (PID `17683` != `16226`, `15.54s`) | **PASS** (`AppUITests` `259.5s`) | `16m43s` (`1003s`) | `0` (clean `launchctl_primary`) | `0` | `0` | `14602553964` (`4.1 MB`) |
| **Phase 2 ARM 3** | `workflow_dispatch` | [44676712580 / 136095964096](https://github.com/Bibleberry/Bibleberry/actions/runs/44676712580/job/136095964096) | `20261102.0473.1` | **PASS** | **PASS** (PID `16518` != `14994`, `26.58s`) | **FAIL** (`AppUITests` exit `65` at `AppUITests.swift:60`) | `17m25s` (`1045s`) | `0` (clean `launchctl_primary`; strict fail on XCUITest) | `0` | `0` | `14603359856` (`56.8 MB`) |

### Per-Stage Timing Comparison vs Phase 1 ARM Baseline (`44660120600`)

All durations in seconds (`s`). Phase 1 ARM Trial 1 required a full device reset (`A1 / A2`).

| Stage | Phase 1 ARM 1 (`44660120600`) | Phase 1 ARM 2 (`44660120600`) | Phase 1 ARM 3 (`44660120600`) | Phase 2 ARM 1 (`44676668482`) | Phase 2 ARM 2 (`44676685643`) | Phase 2 ARM 3 (`44676712580`) |
| --- | --- | --- | --- | --- | --- | --- |
| Build unsigned iOS Simulator app | `69.0` | `49.0` | `52.0` | `49.0` | `60.0` | `65.0` |
| Python smoke unit tests | `1.0` (13 tests) | `<1.0` (13 tests) | `1.0` (13 tests) | `1.0` (29 tests) | `2.0` (29 tests) | `1.0` (29 tests) |
| `simctl create` + `boot` + `bootstatus` | `147.9 / 148.3` | `156.9` | `202.4` | `166.0` | `140.7` | `133.2` |
| `wait_for_simulator_ready` | `30.3 / 146.5` | `11.4` | `10.4` | `11.1` | `150.8` | `63.8` |
| `simctl install` + `get_app_container_1` | `36.5 / 37.7` | `15.2+` | `29.2` | `34.2` | `19.9` | `53.8` |
| `simctl launch` (initial) | `17.6 / 1.4` | `1.5` | `1.3` | `1.6` | `2.7` | `5.2` |
| `verify_pid_alive` (`launchctl list`) | **TIMEOUT** `36.3+31.3` → **RESET** / `18.7` | `5.4` | `4.5` | **TIMEOUT** `32.5+34.5` → **FALLBACK OK** | `4.5` | `7.8` |
| `simctl io screenshot` (initial) | `— / 14.7` | `11.6` | `16.4` | `11.3` (`221KB`, `1206x2622`) | `14.3` (`222KB`) | `12.4` (`221KB`) |
| `simctl terminate` (1) | `— / 2.2` | `0.6` | **TIMEOUT** `41.5` + retry `12.6` | `1.1` | `1.1` | `0.9` |
| `simctl launch` (relaunch) + `verify` + `shot` | `— / 16.8` | `21.2` | `25.4` | `8.5` | `12.2` | `17.8` |
| `simctl_terminate_before_pty` | `1.1` | `~1.0` | `1.3` | `4.4` (verified) | `0.9` (verified) | `2.2` (verified) |
| Native `Preferences.get` PTY check | **PASS** | **PASS** | **PASS** | **PASS** (`5.76s`, PID `14995`) | **PASS** (`15.54s`, PID `17683`) | **PASS** (`26.58s`, PID `16518`) |
| `xcodebuild test` (`AppUITests`, 420s cap) | `259.3` (PASS) | `310.9` (PASS) | `337.4` (PASS) | `260.2` (PASS) | `287.5` (PASS) | `355.3` (**FAIL** rc `65`) |
| Device resets | `1` | `0` | `0` | **`0`** | **`0`** | **`0`** |
| **Total runtime smoke step** | `1101.0` | `620.0` | `845.0` | `674.0` | `729.0` | `799.0` (fail) |
| **Total job wall time** | `22m22s` (`1342s`) | `13m27s` (`807s`) | `17m17s` (`1037s`) | **`14m23s`** (`863s`) | **`16m43s`** (`1003s`) | `17m25s` (`1045s`, fail) |

### Forensic Analysis of Attempt 3 (`44676712580`) Failure
- **What succeeded:** Unsigned build, 29/29 unit tests, simulator boot/readiness, install, launch (`14485`), `launchctl_primary`, screenshot (`221KB`), terminate (`0.9s`), relaunch (`14994`), `launchctl_primary`, screenshot (`221KB`), verified `simctl_terminate_before_pty` (`2.2s`), fresh-PID PTY launch (`16518`, `Preferences.get` + `TO JS` + `WebView loaded`), and clean uninstall — with 0 `simctl` timeouts and 0 crashes.
- **What failed:** Inside `xcodebuild test` (`AppUITests`), `app.launch()` reached `WKWebView` existence at `t = 42.40s`, then polled for the onboarding `Continue` button for 25s (`AppUITests.swift:60`). Retained `03-xcuitest-sim-logs.txt` shows `App[27487]` spawned `WebKit.WebContent` (`PID 29173`) at `05:18:53.7` and logged `ProcessThrottlerTimedActivity::activityTimedOut: Client navigation (timeout: 30 sec)` at `05:19:24.369`; the failure-time accessibility tree (`3B903C75-...txt`) showed `WKWebView` with no rendered DOM children yet. Note that the same VM had already exhibited elevated WebView/CoreSimulator latency earlier in the run (`simctl_get_app_container_1` took `22.95s` vs `4.8s`–`7.8s`, and PTY `Preferences.get` took `26.58s` vs `5.76s`–`15.54s`).
- **Why this is valuable Phase 2 verification evidence:** It confirms in live hosted CI that Phase 2's hardening **does not swallow, retry, or mask** an unrendered `WKWebView` or `AppUITests` failure, while also identifying a distinct, out-of-scope hosted `macos-26` WebView cold-load latency tail (`AppUITests.swift` is explicitly read-only in Phase 2).

---

## 5. Remaining False-Negative and False-Positive Risks

### Remaining False-Negative (Hosted Flake) Risks
1. **Out-of-scope `WKWebView` cold-load latency in `AppUITests` (observed in Attempt 3 `44676712580`):** On heavily loaded `macos-26` M1 VMs, WebKit initial client navigation can exceed `AppUITests.swift:60`'s 25s `Continue` button timeout (and WebKit's 30s client-navigation throttle). Because `ios/**` is strictly excluded from Phase 2, this remains an open hosted-VM variance risk and justifies keeping `Native iOS simulator build` outside mandatory `merge_group` gates.
2. **CoreSimulator stalls outside `terminate`/`launchctl`:** Consecutive timeouts in `wait_for_simulator_ready`, `simctl install`, `simctl launch`, or `simctl io screenshot` still consume the single controlled device reset (`--max-device-resets 1`) and fail closed if both devices stall.
3. **Hostile `simctl terminate` timeouts where the app truly remains running:** As seen in `44584912543` Attempt 1, if CoreSimulator drops the kill request and the app stays alive across both attempts, postcondition verification intentionally refuses to pass and falls back to the single device reset.
4. **Small sample caveat:** Three hosted runs (`2/3` full acceptance, `3/3` `simctl` + `Preferences.get`, `0/3` device resets) demonstrate the Phase 2 fallback working live on `macos-26` and strict failure on XCUITest, but cannot statistically prove a long-term flake rate.

### Remaining False-Positive Risks (Mitigated & Bounded)
1. **Screenshot visual content during `launchctl`-stall fallback:** `validate_screenshot_file` proves fresh file creation (`mtime >= capture_started_epoch - 1.0`), valid PNG signature + positive `IHDR` dimensions, and `>= 1024` bytes, which rejects stale/missing/corrupt captures, though it does not OCR the screenshot text itself. **Mitigation:** In full acceptance mode, the exact same run must still pass terminate + fresh relaunch + mandatory fresh-PID PTY `Preferences.get` + full `AppUITests` DOM/UI/persistence assertions, so a blank or broken WebView still fails strictly (as live Attempt 3 proved).
2. **`simctl terminate` timeout when the app exited cleanly for an unexpected non-crash reason during the timeout window:** If the app exited with status 0 without producing a `.ips`/`.crash` report right as `simctl terminate` timed out, `verify_termination_postconditions` observes the same postcondition state as a completed kill. **Mitigation:** Preceded immediately by verified alive PID + fresh screenshot, followed immediately by `get_app_container` + fresh relaunch + PTY `Preferences.get` + full `AppUITests`.
3. **DiagnosticReports filename matching:** `find_new_app_crashes` checks `App-*`, `App_*`, or `*bibleberry*` `.ips`/`.crash` files in `~/Library/Logs/DiagnosticReports` — matching Xcode's standard simulator crash naming for the `App` binary; a crash report under a different process name (e.g., `com.apple.WebKit.WebContent`) would instead manifest via WebView/PTY/XCUITest failure.
