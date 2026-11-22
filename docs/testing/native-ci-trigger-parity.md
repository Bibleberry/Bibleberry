# Native Android and iOS CI coverage

Copper Orchard established shared web-bundle coverage for Android and iOS. Pine Relay retains that coverage and routes iOS Simulator runtime acceptance by PR scope. [Copper Orchard #242](https://github.com/Bibleberry/Bibleberry/issues/242) · [Pine Relay #284](https://github.com/Bibleberry/Bibleberry/issues/284)

## Inputs and events

Both native checks build the Vite bundle from `src/**`, `public/**`, `index.html`, root dependency manifests and lockfiles, and Vite, TypeScript, Tailwind, and PostCSS configuration. Capacitor sync packages that bundle and updates each platform's plugin manifests. Android retains its matching PR and main-push path filters, its unfiltered `merge_group` trigger, and its manual dispatch.

| iOS event or scope | Signing-free iOS Simulator build | iOS Simulator runtime acceptance |
|---|---|---|
| PR with ordinary web source or static assets | Runs | Not run / Not required for this PR |
| PR with native, shared packaging, workflow, or unclassified changes | Runs | Runs |
| Mixed web and native PR | Runs | Runs |
| Empty, unavailable, or ambiguous PR comparison | Runs | Runs or the workflow blocks on failure |
| PR with only recognized unrelated files, such as documentation or Android project files | Not required | Not run / Not required for this PR |
| Every push to `main` | Build proof comes from the runtime job | Runs |
| Manual dispatch | Build proof comes from the runtime job | Runs, with the optional `run_lifecycle_probe` defaulting to false |
| `merge_group` | No iOS workflow | No iOS workflow |

Draft and Ready PRs use the same scope rules on open, reopen, and synchronize. Ready promotion alone reuses results for the same head and integration SHA. A new PR run cancels a superseded run for that PR. Each main push and manual dispatch has its own concurrency group.

## PR scope

An unfiltered Linux job checks out the event's synthetic merge commit with full history and verifies its parents against the event base and PR head. It compares the unique merge base to the PR head and the event base to the checked-out merge commit. Both comparisons use complete, NUL-delimited Git output. A rename is classified as a deletion plus an addition, so both paths contribute. A missing scope result, nonregular file change, invalid path, or Git error requires full runtime acceptance. This also avoids GitHub's workflow path-filter file limit.

Runtime-sensitive inputs include `ios/**`, the app entrypoints, all of `src/readerShell/**`, native and deep-link source, app integration, participation and Preferences persistence, native bridge references in either version of changed web source, native tests and scripts, root packaging inputs, CI workflows, and the classifier and its tests. Familiar web sources and static assets can select the build alone. Unrecognized paths default to runtime. Add known native integration paths to the detector when moving or adding platform wiring. [Scope detector](../../scripts/ci/ios-scope.mjs) · [Scope tests](../../tests/ci/ios-scope.test.ts) · [Workflow tests](../../tests/ci/native-trigger-parity.test.ts)

## Build and runtime evidence

Both macOS jobs use Xcode 26.4.1 (17E202) and the iOS 26.4 Simulator SDK on `macos-26`. Their shared commands install dependencies, build Vite, sync Capacitor, check the native App and Preferences packages, compile without signing, verify the bundle ID `com.example.bibleberry.r20poc`, check the packaged HTML and nonempty JS assets, and run the Python smoke unit tests.

The runtime job provisions the iOS 26.4 Simulator runtime if needed and builds its own app at the event SHA. It runs the existing strict Simulator harness against that app. Fresh boot, install, launch and relaunch, Capacitor bridge and Preferences proof, WKWebView and lifecycle assertions, and XCUITest all remain required. The fast job performs no CoreSimulator setup or testing. [iOS workflow](../../.github/workflows/native-ios.yml) · [Runtime harness and historical evidence](r20-4-ios-simulator-runtime.md)

Use the `iOS verification summary` to read **iOS Build Passed** and **iOS Runtime Verified** separately. The summary lists the PR head and tested integration SHA, or the run SHA on main and dispatch. Runtime proof requires both successful smoke execution and a successful runtime job. An expected skip reads **Not run / Not required for this PR**. Missing or failed expected proof makes the summary check fail. Runtime and lifecycle artifacts use run-attempt suffixes. The runtime evidence includes `ci-provenance.txt` even on build or smoke failure when the runner can still upload artifacts. A Simulator result does not qualify physical hardware or a signed distribution build.

## Checks & Merge handoff

The live branch protection preflight for #284 returned **Build reader application** and **Verify Sanity Studio**, both GitHub Actions checks. Pine Relay keeps those contexts and the existing **Signing-free iOS Simulator build** name. It adds **Determine iOS PR scope**, **iOS Simulator runtime acceptance**, and **iOS verification summary** as ordinary workflow checks.

A native-sensitive PR is eligible for Aaron's merge or queue authorization only after Review and Checks & Merge confirm **iOS Runtime Verified** for the exact reviewed head and tested integration SHA. A red, missing, queued, cancelled, or skipped runtime result is a hold. This is an owner-controlled readiness gate. GitHub's current required checks do not automatically block a native-sensitive PR with failed or missing iOS evidence.

If Aaron approves automated enforcement, Checks & Merge should first choose how to enforce the aggregate result on the PR head before queue entry, or design and validate a corresponding queue integration check. Adding the current path-dependent runtime job as a required check would allow irrelevant skip statuses on PRs and leave an absent status on merge-group commits. Adding the summary directly to the current required checks would also leave it absent on merge-group commits. Exercise web-only, native, missing proof, and queue cases before making a protection change. [Merge queue runbook](merge-queue-integration.md)
