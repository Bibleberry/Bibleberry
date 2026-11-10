# R20-1 Capacitor POC

## Scope and status

This is a local-development spike, not a production app or a final Capacitor selection. It packages the existing Vite `dist/` output and changes only the guest participation storage driver. The temporary identifier is `com.example.bibleberry.r20poc`; the displayed app name is `Bibleberry R20-1 POC`. Do not register this identifier or use it for release builds.

The checked-in Android project was generated and synchronized. This Linux runner has no Xcode or CocoaPods, so an iOS project/build was not generated or verified. The Android Gradle build was attempted but could not download Google Maven artifacts because `dl.google.com` did not resolve in the runner. No Android emulator or physical device was connected. The result is **code-ready, native-build/device-unverified**.

## Prerequisites and dependency versions

- Node.js 22 or later and npm. The runner used Node.js 22.23.4 and npm 10.9.9.
- Android Studio, Android SDK (the generated project targets API 36; minimum SDK 24), and a compatible JDK. The runner had JDK 17 and Android SDK/build tools installed.
- macOS and Xcode for iOS project generation, simulator/device builds, and signing. CocoaPods is required by the iOS plugin workflow.
- Dependencies selected for this POC: `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, and `@capacitor/ios` 8.6.0; `@capacitor/preferences` 8.0.1. The native Preferences plugin is used only for non-credential guest participation data. It is not a secure session/token store.

The generated Android project includes its Gradle wrapper (Gradle 8.14.3), app activity/manifest/resources, and platform build configuration. Its local SDK paths, Gradle caches/build outputs, copied Vite assets, copied Capacitor config/plugin files, and keystores are ignored. No iOS project is checked in.

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

## iOS development (macOS only)

The iOS project is intentionally not checked in from this Linux environment. On a Mac, with Xcode and CocoaPods installed, start from a clean checkout and run:

```sh
npm ci
npm run build
npx cap add ios
npx cap sync ios
npx cap open ios
```

In Xcode, use a local simulator for a development build. Physical-device installation requires an authorized development signing identity; no signing credentials or developer accounts are part of this POC. Subsequent web builds use `npm run build && npx cap sync ios`.

## Storage selection and limits

`defaultGuestParticipationStore` checks `Capacitor.isNativePlatform()` during reader bootstrap. Native shells use the async `@capacitor/preferences` driver; hosted browsers continue to use the existing `localStorage` driver and the same `bibleberry-reader-participation-v1` key/envelope. The Preferences module is loaded only when the native driver is used. Platform selection is injectable for tests.

Hydration, early queued actions, explicit completion, saved Scripture references, resume position, repeated writes, failed-write retry, clear during pending I/O, corrupt JSON, unsupported future schema, and re-initialization against shared storage are covered with a fake Preferences bridge. Corrupt and newer-schema records remain untouched until explicit reset.

This driver is for guest progress only. It does not store authentication/session tokens, migrate browser data, or guarantee recovery after uninstall/device loss. The existing store serializes its operations, but this POC adds no native background execution or app-resume reconciliation hook. A force quit while a write is pending, OS process termination, background/foreground behavior, and device-level persistence still require native acceptance. No offline-first sync, gateway/CORS changes, auth, links, or notifications are included.

## Verification record

Executed in the Linux agent environment:

| Check | Result |
|---|---|
| `npm ci` | Passed; existing lockfile dependencies installed. npm reported 7 moderate audit findings, also present before adding Capacitor dependencies. |
| GitHub advisory check for the five added packages | No known advisories returned. |
| `npm run build` | Passed (`tsc -b` and Vite production build). Vite emitted existing dependency annotation warnings from Zod. |
| `npm run lint` | Passed. |
| `npm run test:native-participation` | Passed, 5 focused tests. |
| `npm run test:adapter` | Passed, 176 tests. |
| `npm run test:gateway` | Passed, 67 tests. |
| `npm run test:smoke` | Passed all six builds: public (15), Developer Studio (4), Challenge pilot (2), participation pilot (5), released Challenge (7), gateway Challenge (7). Public build isolation passed. |
| `npm run check:staging` | Passed Wrangler dry-run; packaged 13 `dist/` assets and did not deploy. |
| `npx cap add android` / `npx cap sync android` | Passed; sync found `@capacitor/preferences@8.0.1`. |
| `cd android && ./gradlew assembleDebug` | Attempted; blocked while resolving Android Gradle Plugin / Google Services from `https://dl.google.com/dl/android/maven2/` (`dl.google.com` DNS unavailable). No APK was produced. |
| GitHub Actions for PR #82 | Run [42876563159](https://github.com/ContraPhilosophy/Bibleberry/actions/runs/42876563159) reported `action_required` with zero jobs; no CI result is available and no failed-job logs exist. |
| iOS generation/build | Not run: this runner is Linux and has no Xcode or CocoaPods. |
| Physical-device checks | Not run: no Android device/emulator, iPhone, or signing identity was available. |

GitHub Actions status is checked separately on the PR; a browser/Worker build is not evidence of an Android or iOS build or physical-device acceptance.

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
