# R20-4 iOS Simulator Runtime Acceptance

## Scope and Environment

This document records reproducible, signing-free iOS Simulator installation, launch, terminate/relaunch, `WKWebView` rendering, lifecycle, and runtime probe evidence on GitHub-hosted `macos-26` CI for `com.example.bibleberry.r20poc` (`Bibleberry R20-1 POC`). It extends the R20-3 Xcode simulator compile baseline ([`r20-3-ios-simulator-poc.md`](./r20-3-ios-simulator-poc.md)) without altering app identity, signing configuration, artwork, dependencies, Android CI, or protected application modules (`src/cms/**`, `src/participation/**`, `src/App.tsx`, `src/gateway/**`, `studio/**`).

Because the development workstation runs Linux (`no xcodebuild`, Apple SDK, or CoreSimulator), all Xcode compilation and Simulator execution run on GitHub Actions' pinned `macos-26` runner (`macos-26-arm64`).

### Verified CI Environment (`904d187be0e43914f4b11e2f63bf1c14919d047e`)

| Field | Observed Value |
|---|---|
| Workflow / Run / Job | `Native iOS simulator build` — [Run 43103006600](https://github.com/Bibleberry/Bibleberry/actions/runs/43103006600) / Job [`130799014358`](https://github.com/Bibleberry/Bibleberry/actions/runs/43103006600/job/130799014358) |
| Regular PR CI | `Bibleberry CI` — [Run 43103006673](https://github.com/Bibleberry/Bibleberry/actions/runs/43103006673) (all 4 jobs succeeded: `130799014555`, `130799014813`, `130799014840`, `130799014847`) |
| Runner Image | `macos-26-arm64`, Image Version `20261102.0473.1` (`Provisioner 20261028.624`), `Built with macOS 26.7.2` |
| Source PR Head SHA | `904d187be0e43914f4b11e2f63bf1c14919d047e` (rebased onto `main` `5f88542f413bef1f6cf871010c6125acdacf8b03`) |
| Synthetic Merge SHA (`GITHUB_SHA`) | `fb854dd19c09e198f914f14d20aa00c2f2033127` |
| Xcode / SDK | `Xcode 26.4.1` (`Build version 17E202`), `iphonesimulator26.4` |
| Simulator Device / OS / Arch | Ephemeral `Bibleberry-R20-4-Smoke-1794432424` (`iPhone 17`, `com.apple.CoreSimulator.SimDeviceType.iPhone-17`), `iOS 26.4` (`26.4.1`, build `23E254a`), `arm64` (`hostArch: arm64`) |
| Built App Binary | `App.app` (`6.1M`), Bundle ID `com.example.bibleberry.r20poc`, Mach-O architectures `x86_64 arm64` |
| Smoke Evidence Artifact | `bibleberry-r20-4-ios-simulator-evidence` (Artifact ID `13892463721`, `3,197,704` bytes, `sha256:8f034e21cf9ab30eb343ab24967d29ab7cb20d81e523447eaa825a113e748231`, expires `2026-11-18T21:30:10Z`) |
| Built App Artifact | `bibleberry-r20-3-ios-simulator-app` (Artifact ID `13891993550`, `1,751,958` bytes, `sha256:e7ce0e76d11b8383eb5ab454ca419e08dd524f21f3dc38adc45582de8aaa2633`, expires `2026-11-18T21:30:11Z`) |

> Note on workflow step ordering: Run `43095083262` (on earlier head `fbd1581`) failed at `Upload development simulator app` during a GitHub artifact storage incident, causing `Run iOS Simulator runtime smoke` to be skipped. `.github/workflows/native-ios.yml` now executes `Run iOS Simulator runtime smoke` and `Upload iOS Simulator runtime smoke evidence` (`if: always()`) **before** `Upload development simulator app` (`if: ${{ !cancelled() && steps.verify-app.outcome == 'success' }}`) so an artifact upload hiccup cannot prevent runtime test execution.

---

## Automated Reproduction Commands

On macOS with Xcode `26.4.1` and the `iOS 26.4` Simulator runtime installed (matching `.github/workflows/native-ios.yml`):

```sh
sudo xcode-select --switch /Applications/Xcode_26.4.1.app/Contents/Developer
npm ci
npm run build
npx cap sync ios

xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath "$RUNNER_TEMP/BibleberryDerivedData" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY='' \
  build

python3 scripts/ios-simulator-smoke.py \
  --app-path "$RUNNER_TEMP/BibleberryDerivedData/Build/Products/Debug-iphonesimulator/App.app" \
  --derived-data "$RUNNER_TEMP/BibleberryDerivedData" \
  --evidence-dir "$RUNNER_TEMP/ios-simulator-evidence"
```

### What [`scripts/ios-simulator-smoke.py`](../../scripts/ios-simulator-smoke.py) Executes

1. Enumerates available iOS `26.4` runtimes and iPhone device types dynamically via `xcrun simctl list runtimes -j` and `xcrun simctl list devicetypes -j` (prefers standard modern non-Pro/Max/Plus/SE models; selected `iPhone 17`).
2. Creates a dedicated ephemeral simulator (`xcrun simctl create`), boots it (`xcrun simctl boot`), and waits for readiness (`xcrun simctl bootstatus <udid> -b`).
3. **Phase 1 (`simctl` install, launch, terminate, relaunch):**
   - `xcrun simctl install` + `get_app_container` (`app`).
   - `xcrun simctl launch` (`com.example.bibleberry.r20poc`) → observed initial `PID 4673`, waited `8s`, verified alive via `ps` + `xcrun simctl spawn <udid> launchctl list` (`01-launch-process.txt`), captured `01-simctl-launch.png` (`222,719` bytes — rendered Onboarding Step 1 UI), captured scoped unified logs (`01-simctl-launch-logs.txt`).
   - `xcrun simctl terminate` without uninstalling → verified `PID 4673` exited and `get_app_container` remained present.
   - `xcrun simctl launch` without reinstalling → observed fresh `PID 5317` (`!= 4673`), waited `5s`, verified alive (`02-relaunch-process.txt`), captured `02-simctl-relaunch.png` (`222,708` bytes — rendered Onboarding Step 1 UI), captured scoped logs (`02-simctl-relaunch-logs.txt`).
   - Brief PTY launch (`xcrun simctl launch --console-pty`) into `02b-simctl-console-pty.log`, observing Capacitor stdout `⚡️  Loading app at capacitor://localhost...` and `⚡️  WebView loaded`.
   - `xcrun simctl terminate` + `xcrun simctl uninstall` so UI tests begin from a clean installation.
4. **Phase 2 (`AppUITests` via `xcodebuild test`):**
   - Runs [`AppUITests.testBundledReaderLaunchLifecycleAndRestart`](../../ios/App/AppUITests/AppUITests.swift) (`1 test, 0 failures`, `38.085s`).
   - Captures XCUITest screenshots (`01-onboarding-step1`, `02-today-screen`, `03-after-foreground`, `04-after-terminate-relaunch`, `05-privacy-local-data`), `03-xcuitest-summary.json`, `03-xcuitest-sim-logs.txt`, and checks `~/Library/Logs/DiagnosticReports` (`newAppCrashReports: []`).
5. Terminates, shuts down, and deletes the ephemeral simulator in `finally`.

---

## Runtime Verification Matrix (Deliverables A & B)

| Check | Status | Observed Evidence & Notes |
|---|---|---|
| Unsigned Xcode Simulator compile & `.app` identity/asset assertions | **Verified** | Run `43103006600`: built `App.app` (`6.1M`, `x86_64 arm64`), verified `CFBundleIdentifier == com.example.bibleberry.r20poc`, `public/index.html`, and bundled JS chunks. |
| Ephemeral Simulator create, boot, install, cold launch & survival | **Verified** | `iPhone 17` (`iOS 26.4` `26.4.1`/`23E254a`) booted; `simctl install` + `simctl launch` returned `PID 4673`; remained active after `8s` in `ps` and `launchctl`. |
| Bundled `WKWebView` entrypoint rendering (not blank/error/crash) | **Verified** | `01-simctl-launch.png` and `01-onboarding-step1` rendered `"Bibleberry"`, `"A quiet place to meet with Scripture."`, `"Continue"`; `02-today-screen` rendered `Today`, `Foundations`, `Archive`, `More`, and `Rest Requires Trust` (`Exodus 16:27–28 (NIV)`). **Visual note:** status bar clock overlaps top-left `"Bibleberry"` wordmark (`src/App.css` / `index.html` lacks top safe-area inset / `viewport-fit=cover`; out of scope to modify in R20-4). |
| Normal terminate without uninstall & fresh relaunch | **Verified** | `simctl terminate` stopped `PID 4673` while app remained installed; `simctl launch` started `PID 5317` which survived `5s` and rendered `02-simctl-relaunch.png`. |
| `AppUITests` process terminate & relaunch + onboarding persistence | **Verified** | After completing Onboarding, `app.terminate()` + `app.launch()` reopened onto the `Today` screen (`"Continue to Today"` absent; `04-after-terminate-relaunch` rendered `Rest Requires Trust`), proving `WKWebView` `localStorage` persisted `bibleberry-prototype-v1`. |
| Background / foreground app lifecycle | **Verified** | `XCUIDevice.shared.press(.home)` → `2s` → `app.activate()` resumed foreground cleanly (`03-after-foreground`); `Foundations` (`"A Place to Begin"`) remained interactive. No unimplemented resume-reconciliation consumer is claimed (`nativeLifecycleEvents` in [`src/native/lifecycleService.ts`](../../src/native/lifecycleService.ts) currently attaches no runtime subscriber). |
| Ordinary shell tab navigation | **Verified** | `Today` → `Foundations` (`"A Place to Begin"`) → `Archive` (`"Explore Past Scripture Challenges"`) → `Today` → `More` → `Privacy & local data` (`05-privacy-local-data`). |
| Native guest `CapacitorPreferences` persistence & `Reset local app data` | **Failed / Blocked (out-of-scope driver bug) + Not Run (write/read-back seam)** | **Observed failure:** Probing `More -> Privacy & local data -> Reset local app data -> Erase & reset` in prior runs (`43091869039`, `43093774077`, `43101432573`) left the confirmation dialog hung even after two confirmed WebKit synthetic clicks (`05-reset-failure`). **Root cause proved via `02b-simctl-console-pty.log` (zero `⚡️ To Native ->` calls) and Playwright + Capacitor `native-bridge.js` reproduction:** [`createCapacitorPreferencesDriver`](../../src/participation/drivers/capacitorPreferencesDriver.ts#L21-L26) runs `import('@capacitor/preferences').then(module => module.Preferences)`. Returning the Capacitor `Proxy` directly from `.then(...)` triggers ECMAScript's `Promise` `.then` lookup on the `Proxy`, invoking `Proxy.then` which rejects `"Preferences.then()" is not implemented on ios` and never settles `resolvePreferences()`, permanently wedging `defaultGuestParticipationStore.load()` and `clearLocalData()` on native builds. Additionally, the public bundle exposes no guest Challenge-completion UI flow to write into `defaultGuestParticipationStore`. |
| Month / Challenge navigation & Finish return | **Not Run** | Public reader bundle builds with Month/Challenge feature gates off and no release gateway authorization; kept unbypassed per security rules. |
| Accessibility hierarchy vs interactive VoiceOver navigation | **Verified (AX hierarchy) / Not Run (VoiceOver)** | XCUITest resolved accessible roles/labels for buttons, headings, static texts, and tabs inside `WKWebView`. Interactive VoiceOver swipe/rotor navigation was **Not Run** (see recipe below). |
| Slow / offline gateway network behavior | **Not Run** | Bundled offline teaching/Foundations data rendered without network requests; gateway timeout/offline handling was **Not Run** (see recipe below). |
| Physical iPhone device acceptance | **Not Run** | Not tested on physical iPhone hardware; Simulator results do not substitute for device acceptance. |

---

## Blocker & Proposed Minimal Follow-Up Seams

1. **Fix Capacitor `Preferences` `Proxy.then` trap (`src/participation/drivers/capacitorPreferencesDriver.ts`):**
   - Wrap the dynamic import result so the Capacitor `Proxy` is never the direct return value of an `async` function / `.then(...)` handler (for example: `const { Preferences } = await import('@capacitor/preferences'); return { bridge: Preferences }` or an explicit facade `{ get: o => Preferences.get(o), set: o => Preferences.set(o), remove: o => Preferences.remove(o) }`), and add a regression test exercising an ES `Proxy` matching `@capacitor/core`'s `registerPlugin` behavior.
   - Once fixed (in a separate PR within `src/participation/**`), re-enable the `Reset local app data` → `Erase & reset` → Onboarding restoration assertion in [`AppUITests.swift`](../../ios/App/AppUITests/AppUITests.swift).
2. **Minimal Future Guest Persistence Automation Seam:**
   - Expose a dev/test-only or feature-gated Challenge completion + read-back verification path (or XCTest-accessible UI test harness under a non-public build flag) so an XCUITest can dispatch one synthetic participation command (`cms:...`), verify persistence in `UserDefaults` (`CapacitorStorage.bibleberry-reader-participation-v1`) across `app.terminate()` → `app.launch()`, and clear it cleanly.

---

## Manual Follow-Up Acceptance Recipes

### 1. Interactive VoiceOver (iOS Simulator or Physical iPhone)

1. Open `App.app` in Simulator (Xcode → Open Developer Tool → Simulator) or on a paired test iPhone.
2. Enable VoiceOver (`Settings` → `Accessibility` → `VoiceOver`, or Accessibility Inspector on macOS for Simulator).
3. Swipe right sequentially across Onboarding Step 1, Step 2, `Continue to Today`, `Today`, `Foundations`, `Archive`, `More`, and `Privacy & local data`.
4. Verify focus order, reading order of Scripture blocks, tab `aria-current="page"` announcement, and absence of trapped focus or unannounced icon-only buttons.

### 2. Offline / Slow Gateway Network Conditions (Feature-Gated Staging Build)

1. Build with the staging gateway enabled on a test host/device, launch while online, and open the Month / Challenge catalog.
2. Enable Network Link Conditioner (`100% Loss` for offline, `Very Bad Network` for high latency) or Airplane Mode on a test iPhone.
3. Reload Month / Challenge views, attempt Finish/read-back, restore network connectivity, and verify fail-closed errors without crash or corrupt local participation data.

### 3. Physical iPhone Acceptance Record (Not Run)

| Field | Record |
|---|---|
| iPhone model | Not run |
| iOS version | Not run |
| App build / source SHA | Not run |
| Install & cold launch | Not run |
| Guest `Preferences` persistence (`terminate` / `relaunch`) | Not run |
| Background / foreground & force-quit / relaunch | Not run |
| Month / Challenge navigation & Finish return | Not run |
| VoiceOver & safe-area layout inspection | Not run |
| Offline / slow network behavior | Not run |
| Evidence link / notes | Not run |
