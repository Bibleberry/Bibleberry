# R20-1 Capacitor POC

## Scope and status

This is a local-development spike, not a production app or a final Capacitor selection. It packages the existing Vite `dist/` output and changes only the guest participation storage driver. The temporary identifier is `com.example.bibleberry.r20poc`; the displayed app name is `Bibleberry R20-1 POC`. Do not register this identifier or use it for release builds.

The checked-in Android project was generated and synchronized. This Linux runner has no Xcode or CocoaPods, so an iOS project/build was not generated or verified. The Android Gradle build was attempted but could not download Google Maven artifacts because `dl.google.com` did not resolve in the runner. No Android emulator or physical device was connected. The result is **code-ready, native-build/device-unverified**.

## Prerequisites and dependency versions

- Node.js 22 or later and npm. The runner used Node.js 22.23.4 and npm 10.9.9.
- Android Studio 2025.2.1 or later, Android SDK Platform 36 and Build Tools, and JDK 21. The generated Capacitor project compiles with `sourceCompatibility` and `targetCompatibility` set to Java 21; JDK 17 is insufficient. In Android Studio, set **Settings → Build, Execution, Deployment → Build Tools → Gradle → Gradle JDK** to JDK 21. For command-line builds, set `JAVA_HOME` to a JDK 21 installation and ensure `$JAVA_HOME/bin` is on `PATH` before running Gradle. This runner had JDK 17 and Android SDK/build tools installed, so it did not meet the JDK requirement.
- macOS and Xcode for iOS Simulator/device builds and signing. Capacitor CLI project generation and synchronization can run on Linux when using the SPM template; see the later [R20-3 iOS Simulator POC](r20-3-ios-simulator-poc.md). CocoaPods is not needed for this SPM-based iOS project.
- Dependencies selected for this POC: `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, and `@capacitor/ios` 8.6.0; `@capacitor/preferences` 8.0.1. The native Preferences plugin is used only for non-credential guest participation data. It is not a secure session/token store.

The generated Android project includes its Gradle wrapper (Gradle 8.14.3), app activity/manifest/resources, and platform build configuration. Its local SDK paths, Gradle caches/build outputs, copied Vite assets, copied Capacitor config/plugin files, and keystores are ignored. At the time of R20-1, no iOS project was checked in; R20-3 adds the source-controlled iOS project.

## Android development

From the repository root:

```sh
npm ci
npm run build
npx cap sync android
npx cap open android
```

In Android Studio, select a local emulator or attached development device and run the `app` configuration. To build a debug APK from the command line:

```sh
cd android
./gradlew assembleDebug
```

The checked-in `android/` project was generated with `npx cap add android`. `npx cap sync android` copies the current `dist/` output and registers the Preferences plugin; run it after every web build. Generated web assets, Capacitor plugin/config copies, Gradle caches/build outputs, local SDK paths, and keystores are excluded by the platform `.gitignore` files.

## iOS development (R20-1 status)

At the time of R20-1, no iOS project had been generated or checked in. R20-3 supersedes this setup note with a source-controlled SPM project and a signing-free simulator CI workflow; see [R20-3 iOS Simulator POC](r20-3-ios-simulator-poc.md) for the current commands and verification status.

The current iOS project is generated from a clean checkout with:

```sh
npm ci
npm run build
npx cap add ios
npx cap sync ios
```

Project generation uses Capacitor's SPM template and does not require CocoaPods. A simulator build requires macOS and Xcode; physical-device installation and distribution are outside this POC.

## Storage selection and limits

`defaultGuestParticipationStore` checks `Capacitor.isNativePlatform()` during reader bootstrap. Native shells use the async `@capacitor/preferences` driver; hosted browsers continue to use the existing `localStorage` driver and the same `bibleberry-reader-participation-v1` key/envelope. The Preferences module is loaded only when the native driver is used. Platform selection is injectable for tests.

Hydration, early queued actions, explicit completion, saved Scripture references, resume position, repeated writes, failed-write retry, clear during pending I/O, corrupt JSON, unsupported future schema, and re-initialization against shared storage are covered with a fake Preferences bridge. Corrupt and newer-schema records remain untouched until explicit reset.

This driver is for guest progress only. It does not store authentication/session tokens, migrate browser data, or guarantee recovery after uninstall/device loss. The existing store serializes its operations, but this POC adds no native background execution or app-resume reconciliation hook. A force quit while a write is pending, OS process termination, background/foreground behavior, and device-level persistence still require native acceptance. No offline-first sync, gateway/CORS changes, auth, links, or notifications are included.

## Verification record

Executed in the Linux agent environment:

| Check | Result |
|---|---|
| `npm ci` | Passed after merging current `main`; npm reported 7 moderate audit findings. |
| GitHub advisory check for the five added packages | No known advisories returned. |
| `npm run build` | Passed (`tsc -b` and Vite production build). Vite emitted existing dependency annotation warnings from Zod. |
| `npm run lint` | Passed. |
| `npm run test:native-participation` | Passed, 5 focused tests. |
| `npm run test:adapter` | Passed, 176 tests. |
| `npm run test:gateway` | Passed, 78 tests, including the accepted R08A-3A gateway changes from current `main`. |
| `npm run test:smoke` | Passed all six builds: public (15), Developer Studio (4), Challenge pilot (2), participation pilot (5), released Challenge (7), gateway Challenge (7), 40 total. Public build isolation passed. |
| `npm run check:staging` | Passed Wrangler dry-run; packaged 13 `dist/` assets and did not deploy. |
| `npx cap add android` / `npx cap sync android` | Passed; sync found `@capacitor/preferences@8.0.1`. |
| `cd android && ./gradlew assembleDebug` | Attempted on the updated branch; blocked before compilation while resolving Android Gradle Plugin / Google Services from `https://dl.google.com/dl/android/maven2/` (`dl.google.com` DNS unavailable). The runner also has JDK 17, not the required JDK 21. No APK was produced. |
| GitHub Actions for PR #82 | The prior pre-merge-head run [42877635539](https://github.com/ContraPhilosophy/Bibleberry/actions/runs/42877635539) reported `action_required` with zero jobs; no CI result is available and no failed-job logs exist. Check the latest pushed head separately; do not treat this prior run as its result. |
| iOS generation/build | Not run: this runner is Linux and has no Xcode or CocoaPods. |
| Physical-device checks | Not run: no Android device/emulator, iPhone, or signing identity was available. |

GitHub Actions status is checked separately on the PR; a browser/Worker build is not evidence of an Android or iOS build or physical-device acceptance.

## R20-2A Android CI evidence

The independent [Native Android debug build workflow](https://github.com/ContraPhilosophy/Bibleberry/actions/workflows/native-android.yml) runs on relevant Android/Capacitor packaging changes to PRs targeting `main` and pushes to `main`, or by manual dispatch. It uses GitHub-hosted Ubuntu, Temurin JDK 21, Node.js 22, Android SDK Platform 36 and Build Tools 36.0.0. It keeps Gradle 8.14.3 and Android Gradle Plugin 8.13.0 from the checked-in project, runs the app's debug unit tests, checks the APK package ID and bundled `assets/public/index.html`, and uploads only the generated debug APK for seven days. An authorized successful run reports the source SHA, APK size and SHA-256 in its log.

To reproduce the CI build locally, install JDK 21, Node.js 22, Android SDK Platform 36 and Build Tools 36.0.0, and set `JAVA_HOME` to JDK 21 and `ANDROID_HOME` to the SDK root. From the repository root:

```sh
java -version
npm ci
npm run build
npx cap sync android
cd android
./gradlew :app:assembleDebug :app:testDebugUnitTest --no-daemon
APK=app/build/outputs/apk/debug/app-debug.apk
test -s "$APK"
"$ANDROID_HOME/build-tools/36.0.0/aapt" dump badging "$APK" \
  | grep -F "package: name='com.example.bibleberry.r20poc'"
unzip -Z1 "$APK" | grep -Fx 'assets/public/index.html'
stat -c '%s bytes' "$APK"
sha256sum "$APK"
```

The first authorized native run, [42915847331](https://github.com/ContraPhilosophy/Bibleberry/actions/runs/42915847331) at head `d464f52abc6a38fe648f0ec091c141c917459f2a`, failed before Gradle: `android-actions/setup-android@v3` tried to install the obsolete `tools` package, which `sdkmanager` could not find. The workflow now uses the hosted runner's preinstalled SDK command-line tools, accepts their licenses, and installs only Platform 36 and Build Tools 36.0.0. The next run at head `3f185ed027924c5fd43bc5422e259bbb1657bf3c` ([42917144629](https://github.com/ContraPhilosophy/Bibleberry/actions/runs/42917144629)) was `action_required` with zero jobs, so that attempt did not execute.

The authorized retry [Native Android run 42917313499](https://github.com/ContraPhilosophy/Bibleberry/actions/runs/42917313499) succeeded at feature-branch head `6b9b6cc830d1d58670ccc4aac8ae1bae1c3349b7`. GitHub checked out the synthetic PR merge SHA `51d1ba549ff972ef9aede05300440e28aaf5d08f`, which is the `GITHUB_SHA` reported in the build log; it is not the feature-branch head. JDK 21, Node.js 22, SDK Platform 36 / Build Tools 36.0.0, `npm ci`, the web build, and Capacitor sync all succeeded. Gradle completed `:app:assembleDebug` and `:app:testDebugUnitTest` with `BUILD SUCCESSFUL`; the APK was nonempty, `aapt` reported package `com.example.bibleberry.r20poc`, and the archive contained `assets/public/index.html`.

The generated debug APK is **4,382,109 bytes**, SHA-256 `09b69099d5fdc361eba6c900c9c07c39fb25dd02e0a3e0f8749ef9670c55c3b8`. GitHub Actions artifact [bibleberry-r20-2a-debug-apk](https://github.com/ContraPhilosophy/Bibleberry/actions/runs/42917313499) (artifact ID `13811725807`) contains the debug APK and expires **2026-11-17** (seven-day retention). The regular [Bibleberry CI run 42917313477](https://github.com/ContraPhilosophy/Bibleberry/actions/runs/42917313477) also passed all four jobs at the same feature head. This verifies a CI JVM build, unit tests and APK packaging only; no emulator or physical-device launch, lifecycle, or persistence acceptance is claimed. Browser `localStorage` and native Preferences remain separate guest stores; Preferences is not used for authentication or session credentials. The app ID and displayed app name remain nonproduction POC values.

## Device acceptance checklist — follow-up, not yet run

Run each checklist independently on an actual iPhone and a budget Android device. Record model, OS version, app/build SHA, result, and evidence. A simulator/emulator or browser run does not substitute for physical-device acceptance.

| Check | iPhone | Budget Android |
|---|---|---|
| Install and launch the bundled app without requiring the hosted website | Not run | Not run |
| First launch starts cleanly; reader remains usable with local bundled assets | Not run | Not run |
| Use synthetic data to complete a Challenge, save a Scripture reference, and leave an in-progress Challenge at a known resume position | Not run | Not run |
| Force quit/restart and verify completion, saved Scripture, and resume position all hydrate without duplicates | Not run | Not run |
| Background/foreground and process recreation do not lose or duplicate records | Not run | Not run |
| Clear/reset removes persisted participation, including around pending writes | Not run | Not run |
| Corrupt/newer-schema data is not silently overwritten; transient storage failure is recoverable | Not run | Not run |
| VoiceOver/TalkBack, large text, and basic accessible navigation work | Not run | Not run |
| Confirm the public production artifact does not expose Developer Studio or testing tools | Not run | Not run |

Do not use real-reader data. Device signoff, platform signing, and any production-capable identifier or release decision require separate owner authorization.
