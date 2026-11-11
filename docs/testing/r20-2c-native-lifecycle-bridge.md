# R20-2C Native Lifecycle Bridge

## Scope and event semantics

The production service in `src/native/lifecycleService.ts` reuses the
`createLifecycleEventAdapter` contract and lazily loads `@capacitor/app` 8.1.2
only when a native subscriber is present. The injected source is independently
testable with a fake plugin. Browser subscriptions are no-ops and do not load
the App plugin.

The bridge uses the Capacitor v8 [`App` API](https://capacitorjs.com/docs/apis/app):
`addListener('appStateChange', ...)` resolves asynchronously to a listener
handle, and `getState()` returns the current `{ isActive: boolean }` state.
`isActive: true` maps to `foreground`; `false` maps to `background`. The state
query seeds duplicate suppression but does not emit an initial event. Repeated
states are ignored. If registration is torn down before its promise resolves,
the eventual listener handle is removed. Cleanup is scoped to that handle;
`removeAllListeners` is never called.

On iOS, Capacitor reports `willResignActive` and `didBecomeActive`; on Android,
it reports Activity `onStop` and `onResume`. Thus `background` means the
plugin's `isActive: false` state, not proof that the OS terminated the process.

`coldStart` is intentionally deferred. `getState()` reports only whether the
app is active; it cannot establish that the native process has just started,
so inferring a cold start would be unreliable.

The singleton is imported from `src/main.tsx` to make the service available at
bootstrap, but **there is currently no runtime consumer**. No listener is
attached until a caller subscribes to `nativeLifecycleEvents`; therefore this
change provides a production-usable event source, not active lifecycle
handling. It does not rehydrate participation, write storage, change navigation,
refresh data, or perform background work.

The App plugin's Android Back handler is disabled in `capacitor.config.ts`.
Inspection of the v8.1.2 Android implementation showed that its enabled default
can send Back to WebView history when there is no plugin Back listener. The
bridge does not register a Back listener or otherwise change Back, exit, or
history behavior.

No URL-opening APIs, schemes, intent filters, domain associations, or deep-link
callbacks are used.

## Verification

Executed locally for this change:

| Check | Result |
|---|---|
| `npm run test:adapter` | Passed, 212 tests, including six lifecycle-source tests and the existing R20-2B tests. |
| `npm run test:native-participation` | Passed, 5 tests. |
| `npm run test:gateway` | Passed, 101 tests. |
| `npm run lint` | Passed. |
| `npm run build` | Passed; Vite reported existing Zod annotation warnings. |
| `npm run test:smoke` | Passed all seven build variants, 47 Playwright tests. The runner's missing Chromium binary was installed using the existing Playwright command before rerunning. |
| `npm run check:staging` | Passed Wrangler dry-run; packaged 13 assets, no deploy. |
| `npx cap sync android` | Passed; registered `@capacitor/app@8.1.2` and existing `@capacitor/preferences@8.0.1`. |
| `git diff --check` | Passed. |

The Native Android debug workflow
[43036205650](https://github.com/ContraPhilosophy/Bibleberry/actions/runs/43036205650)
completed successfully on attempt 2 at PR head
`71a72eb2ea1bc8533de203166a0364c25ac79579`; the runner checked out synthetic
PR-merge SHA `3ea6815709c532d948c62a0ee1fc95de381c1b0b`. Dependencies, web build,
Capacitor sync, Gradle debug build and Android unit tests all passed. APK
verification found package ID `com.example.bibleberry.r20poc` and
`assets/public/index.html`. The APK was **4,387,011 bytes** with SHA-256
`44519cac1fdde43847b3f66e8d239eca692302f08ea3f36b3a8d2f543fc0b045`.
Artifact `bibleberry-r20-2a-debug-apk` (ID `13862029969`) was uploaded; it
expires **2026-11-18 14:13 UTC**. The uploaded ZIP digest is
`81566802a5bb0d5a3622b896315e0b12e4acc657a76e76aca5aa38b89882b88a`.

The regular CI run
[43036205512](https://github.com/ContraPhilosophy/Bibleberry/actions/runs/43036205512)
at the same PR head had its other three jobs pass; the reader-build job was
still installing Playwright Chromium when this note was updated. The Android
run covered the final code and generated native configuration. The existing
path filters include changed package files and `android/**`; no workflow
change was needed.

## Android debug APK

The PR's **Native Android debug APK** workflow runs `npm ci`, the production web
build, `npx cap sync android`, and
`./gradlew :app:assembleDebug :app:testDebugUnitTest`. To reproduce locally,
use Node.js 22, JDK 21, Android SDK Platform 36 and Build Tools 36.0.0:

```sh
npm ci
npm run build
npx cap sync android
cd android
./gradlew :app:assembleDebug :app:testDebugUnitTest --no-daemon
```

Open the successful
[Native Android debug build run](https://github.com/ContraPhilosophy/Bibleberry/actions/runs/43036205650)
and download `bibleberry-r20-2a-debug-apk` (artifact ID `13862029969`) from its
Artifacts section before it expires. It is a short-lived debug artifact, not a
signed release build. A browser build does not establish Android or iOS
physical-device acceptance.

## Physical-device acceptance — not run

Run each checklist on an actual iPhone and a budget Android device. Record the
model, OS version, app/build SHA, outcome, and evidence. Every item below is
**Not run**; no physical-device result is claimed.

| Check | iPhone | Budget Android |
|---|---|---|
| Install and initial launch; verify the bundled reader opens | Not run | Not run |
| Background and foreground the app; verify it remains usable | Not run | Not run |
| Force quit and relaunch | Not run | Not run |
| Verify native Preferences persistence for Challenge completion, saved Scripture verse/reference, and resume position | Not run | Not run |
| Verify VoiceOver/TalkBack and accessible navigation | Not run | Not run |
