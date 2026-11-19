# Native iOS and Android CI Trigger Parity (Copper Orchard)

**Related Issue:** [#242](https://github.com/Bibleberry/Bibleberry/issues/242) (`Copper Orchard`)  
**Workflows:** [`.github/workflows/native-ios.yml`](../../.github/workflows/native-ios.yml), [`.github/workflows/native-android.yml`](../../.github/workflows/native-android.yml)  
**Static guard tests:** [`tests/ci/native-trigger-parity.test.ts`](../../tests/ci/native-trigger-parity.test.ts), [`tests/ci/draft-pr-ci-policy.test.ts`](../../tests/ci/draft-pr-ci-policy.test.ts), [`tests/ci/merge-queue-config.test.ts`](../../tests/ci/merge-queue-config.test.ts)

## 1. Exact Source Inputs That Change the Shipped Android and iOS Web Bundle

Both native workflows package the same Vite web bundle into their respective native app container via the same four-stage pipeline:

1. `npm ci` — installs dependencies from `package.json` and `package-lock.json` (including Vite, React, Tailwind/PostCSS, TypeScript, and Capacitor plugins `@capacitor/app`, `@capacitor/core`, `@capacitor/preferences`, `@capacitor/android`, `@capacitor/ios`).
2. `npm run build` (`tsc -b && vite build` in `package.json`):
   - `tsc -b` compiles project references declared in `tsconfig.json` → `tsconfig.app.json` (`include: ["src"]`) and `tsconfig.node.json` (`include: ["vite.config.ts"]`).
   - `vite build` bundles `index.html` and `src/**` using `vite.config.ts` (`base: './'`, `@` alias → `./src`, React plugin), runs PostCSS (`postcss.config.js`) and Tailwind CSS (`tailwind.config.js`, scanning `./index.html` and `./src/**/*.{js,ts,jsx,tsx}`) to emit `dist/assets/*.css`, and copies static files in `public/**` verbatim into `dist/`.
3. `npx cap sync android` / `npx cap sync ios` — reads `capacitor.config.ts` (`appId`, `appName`, `webDir: 'dist'`, plugin settings) and copies `dist/**` into `android/app/src/main/assets/public/` (APK) and `ios/App/App/public/` (`App.app`), while syncing Capacitor native plugin manifests (`android/app/capacitor.build.gradle`, `ios/App/CapApp-SPM/Package.swift`).
4. Platform native build and verification:
   - **Android (`native-android.yml`):** `./gradlew :app:assembleDebug :app:testDebugUnitTest --no-daemon`, `aapt` package ID check, `assets/public/index.html` check, debug APK upload.
   - **iOS (`native-ios.yml`):** `xcodebuild` unsigned iOS Simulator build (`Xcode 26.4.1`, `iphonesimulator26.4`), `App.app` bundle ID & `public/index.html` / JS asset checks, `tests/ci/test_ios_simulator_smoke.py`, and `scripts/ios-simulator-smoke.py` (ephemeral Simulator boot, install, launch, terminate/relaunch, `AppUITests`, and evidence artifact upload).

## 2. PR and `main`-Push Path Filter Comparison

Both workflows keep identical `pull_request.paths` and `push.paths` lists so PR verification and post-merge `main` builds never drift.

| Input Category | Path / Glob | Affects Shipped Bundle or Native Build? | Android (Before → After) | iOS (Before → After) |
|---|---|---|---|---|
| Capacitor config | `capacitor.config.ts` | Yes (`cap sync`) | Present → **Present** | Present → **Present** |
| Dependency manifests | `package.json`, `package-lock.json` | Yes (`npm ci`, build scripts, Capacitor deps) | Present → **Present** | Present → **Present** |
| Reader application source | `src/**` | Yes (`tsc -b`, `vite build` JS/TS/CSS) | Present (with redundant `src/participation/...` entries) → **Present (redundant child entries removed)** | Missing (only `src/native/**` + 2 participation files) → **Added (`src/**`)** |
| Static public assets | `public/**` | Yes (copied verbatim into `dist/`) | Present → **Present** | Missing → **Added** |
| HTML entrypoint | `index.html` | Yes (Vite HTML entry → `dist/index.html`) | Present → **Present** | Missing → **Added** |
| Vite build config | `vite.config.*` | Yes (`base`, plugins, path aliases) | Present → **Present** | Missing → **Added** |
| TypeScript build configs | `tsconfig*.json` | Yes (`tsc -b` inside `npm run build`) | Missing → **Added (parity)** | Missing → **Added** |
| Tailwind & PostCSS configs | `tailwind.config.js`, `postcss.config.js` | Yes (emits `dist/assets/*.css` in `vite build`) | Missing → **Added (parity)** | Missing → **Added** |
| Android native project & workflow | `android/**`, `.github/workflows/native-android.yml` | Yes (Android only) | Present → **Present** | Excluded → **Excluded** |
| iOS native project, smoke tooling & workflow | `ios/**`, `scripts/ios-simulator-snapshot.py`, `scripts/ios-simulator-smoke.py`, `tests/ci/test_ios_simulator_smoke.py`, `.github/workflows/native-ios.yml` | Yes (iOS only; `native-ios.yml` runs `test_ios_simulator_smoke.py` and `ios-simulator-smoke.py`) | Excluded → **Excluded** | Present → **Present** |

### Explicitly Excluded Non-Bundle Inputs (Technical Justification)

Neither native workflow adds a blanket test or repository-wide trigger. The following paths do not affect `dist/`, Capacitor sync, Gradle, or Xcode output and remain excluded:

- **`docs/**`, `README.md`, `info.md`, `INTERACTIVE_CHALLENGE_LAB_HANDOFF.md`:** Documentation only; never read by `npm run build` or Capacitor.
- **`tests/**` (except `tests/ci/test_ios_simulator_smoke.py` on iOS):** Reader unit, CMS adapter, gateway, Playwright, and CI Node tests are verified by `Bibleberry CI` (`ci.yml`) and `Collections Browser Tests` (`collections-browser.yml`). They do not alter the shipped web bundle or native binaries. Only `tests/ci/test_ios_simulator_smoke.py` is watched by `native-ios.yml` because `native-ios.yml` executes it directly.
- **`scripts/**` (except `scripts/ios-simulator-snapshot.py` and `scripts/ios-simulator-smoke.py` on iOS):** Staging, performance, smoke, and CI helper scripts are not invoked by `npm run build`, `cap sync`, Gradle, or `xcodebuild`.
- **`studio/**` and `supabase/**`:** Separate Sanity Studio workspace and Supabase database/function sources; never imported by `src/` or bundled into `dist/`.
- **`eslint.config.js`, `playwright.config.ts`, `wrangler.jsonc`, `wrangler.staging.jsonc`, `components.json`:** Linting, Playwright, Cloudflare Worker, and shadcn CLI metadata configs; none are read by `tsc -b && vite build`, `npx cap sync`, Gradle, or `xcodebuild`.
- **Cross-platform native directories:** `android/**` is excluded from `native-ios.yml`; `ios/**` and iOS simulator scripts/tests are excluded from `native-android.yml`.

## 3. Event-Trigger, Queue, and Diagnostic Boundaries Preserved

- **iOS stays outside `merge_group` and required branch-protection checks:** `native-ios.yml` does not subscribe to `merge_group`. Making iOS a required merge-group gate requires a separate explicit owner decision from Aaron.
- **Android preserves Silver Badger (#239 / PR #245) policy:** `native-android.yml` keeps `pull_request.types: [opened, reopened, synchronize, ready_for_review]`, zero Draft-PR job suppression, unfiltered `merge_group` (`types: [checks_requested]`, `branches: [main]`), and the full debug APK build/unit-test/verification/upload pipeline.
- **iOS `pull_request` activity types:** `native-ios.yml` has no Draft-PR suppression guard and retains GitHub's default `pull_request` activity types (`opened`, `reopened`, `synchronize`). Under River Finch (#247 / PR #248), PRs open as Ready for review by default so iOS runs immediately on open and push. Omitting `ready_for_review` on iOS avoids spawning a redundant 14–26 minute `macos-26` run on an already-verified SHA if an exceptional Draft PR is later marked Ready.
- **iOS reliability diagnostics & lifecycle probe preserved:** `native-ios.yml` keeps `runs-on: macos-26`, `Xcode 26.4.1`, strict failure semantics (no hidden/swallowed failures), `Collect fallback CI diagnostics on failure` (`if: failure()`), `Upload iOS Simulator runtime smoke evidence` (`if: always()`), `Upload development simulator app`, and `workflow_dispatch` opt-in `run_lifecycle_probe` (`default: false`).

## 4. Runtime, Cost, and Flaky-Runner Implications for Owner Review

Observed wall-clock runtimes and outcomes from GitHub Actions history since PR #199 stabilized iOS simulator smoke (`b22e3a1`, November 17–19, 2026):

| Workflow | Runner | Observed Wall-Clock Range | Typical Duration | Recent Observed Outcomes |
|---|---|---|---|---|
| `Native Android debug build` | `ubuntu-24.04` | `1.7m` – `2.2m` | `~2.0m` | Consistently green across recent PR, `merge_group`, and `main` push runs |
| `Native iOS simulator build` | `macos-26` (`macos-26-arm64`) | `9.1m` – `26.0m` | `~14m` – `19m` | **13/15 passed** since PR #199 (`b22e3a1`): 3/3 same-SHA acceptance runs (`43999063169`, `44001147552`, `44003478095`: `14.3m`, `17.0m`, `18.8m`); latest 3 runs green (`13.6m`, `15.3m`, `14.6m`); 1 cancelled (`44134996604`); 1 failure (`44230195240`, `10.2m`, missing `Preferences.get` line in `02b-simctl-console-pty.log`) |

### Cost and Capacity Implications

- **Direct Actions billing on public repo:** Both `ubuntu-24.04` and `macos-26` are standard GitHub-hosted runners and incur **$0 direct minute charges** while Bibleberry remains a public repository. If the repository were ever made private, macOS runners carry a **10x Actions minute multiplier** compared to Linux (`~15m` wall-clock = `~150` billable minutes per run).
- **Concurrency and trigger frequency:** Widening `native-ios.yml` to cover `src/**`, `public/**`, `index.html`, `vite.config.*`, `tsconfig*.json`, `tailwind.config.js`, and `postcss.config.js` means ordinary reader PRs and `main` pushes will now schedule a `14m`–`19m` `macos-26` job. GitHub's public-repository standard macOS runner pool has a tighter concurrent-job cap than Linux (5 concurrent macOS jobs vs. 20 total jobs on standard Free tier), so rapid bursts of concurrent reader PRs may queue for a `macos-26` runner.
- **Mitigations already active:** Per-PR concurrency cancellation (`group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}`, `cancel-in-progress: ${{ github.event_name == 'pull_request' }}`) cancels superseded PR pushes immediately without cancelling `push: main` runs. Keeping `native-ios.yml` out of `merge_group` ensures macOS runner wait time or an intermittent simulator flake cannot stall the merge queue.

### Flaky-Runner Policy and Real-Device Qualification Boundary

- **Do not hide simulator failures:** As seen in run `44230195240` (where `02b-simctl-console-pty.log` missed the expected native `Preferences.get` log line), hosted macOS CoreSimulator/PTY timing failures can still occur even after PR #199's bounded recovery. When they occur, the job must remain failed and upload `bibleberry-r20-4-ios-simulator-evidence` (`if: always()`) for inspection rather than retrying blindly or downgrading errors to warnings.
- **Simulator ≠ physical device qualification:** A green `macos-26` iOS Simulator run proves unsigned Xcode compilation, Capacitor web-asset bundling, ephemeral Simulator launch/relaunch, and `WKWebView` smoke assertions in `AppUITests`. It does **not** qualify real iPhone hardware behavior (ARM device memory/thermal performance, hardware safe-area cutouts, interactive VoiceOver, cellular/offline latency, or signed App Store/TestFlight distribution). Physical device acceptance remains a separate manual gate (see [`r20-4-ios-simulator-runtime.md`](./r20-4-ios-simulator-runtime.md)).
