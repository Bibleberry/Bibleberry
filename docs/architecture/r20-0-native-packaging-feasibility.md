# R20-0 — Native packaging feasibility

## Status addendum — November 10–11, 2026 (subsequent implementation, not part of the original assessment)

This feasibility memorandum is preserved as a **dated decision-support assessment** of the November 10 repository baseline, not as a description of the current implemented `main`. The historical source citations and original conditional recommendation below are intentionally unchanged.

Subsequent, separately reviewed and merged work adopted **Capacitor for a limited development proof of concept**:

- [PR #82](https://github.com/Bibleberry/Bibleberry/pull/82) added the Capacitor 8 native development shell, checked-in Android project, and an asynchronous native Preferences driver for local guest participation, retaining hosted-web `localStorage` behavior and the same participation envelope. This is a proof of concept, not production platform approval.
- [PR #86](https://github.com/Bibleberry/Bibleberry/pull/86) added a reproducible optional GitHub Actions Android **debug** APK workflow, with artifact/package verification. It does **not** represent a signed release, an approved production app ID, or physical-device acceptance.
- [R20-2B Issue #93 / PR #95](https://github.com/Bibleberry/Bibleberry/pull/95) is a separately scoped native internal-navigation/lifecycle-adapter proposal **under review as of this addendum**. Do not treat its code as accepted until that PR is independently reviewed and merged.

**Still open:** Physical iPhone and inexpensive Android device acceptance (including force-quit/resume, accessibility, lifecycle and native storage), production app identifier and signing, verified Universal/App Links and OAuth callbacks, app-store qualification, and account synchronization. The original decision memo's proposal to *begin* a Capacitor POC is therefore historical; its security and device-acceptance questions remain relevant. No live Sanity writes or native release actions are authorized by this update.

---

**Assessment date:** November 10, 2026  
**Repository baseline:** `main` at `2a178e8d6f0b4a70312c14df788964b1dda465ae`  
**Status:** Decision support only. No native technology is selected and no implementation is authorized by this memo.

## Executive decision memo

**Recommendation for Aaron to consider:** approve a small, time-boxed Capacitor proof of concept (POC), while retaining the hosted web app. Capacitor is the least disruptive credible route to installed iOS and Android apps because it can package the existing Vite build and add native integrations through plugins without first replacing the React DOM interface. This is a recommendation, not a decision: native app-store delivery still requires native project maintenance, platform-specific integration, store compliance and physical-device acceptance.

Do not treat “web app inside a WebView” as automatically store-ready. The POC must demonstrate an app-quality reader, secure platform handoffs, stable content links, accessibility and offline/error behavior. Keep the PWA as the hosted-web and low-friction installation path, not as a substitute for the approved installed-app priority. Choose Expo/React Native instead only if Aaron prefers a native-rendered UI enough to fund a screen-by-screen UI migration; an Expo WebView alone offers little benefit over Capacitor for this existing app.

**No device validation has been performed for this assessment.** The option recommendation comes from source inspection and platform documentation; the acceptance matrix below remains future work.

### At-a-glance decision

| Question | Assessment |
|---|---|
| Current product direction | Installed iOS and Android are primary; hosted web is supplementary. |
| Recommended POC candidate | Capacitor, conditionally, preserving the existing React/Vite reader and its normal web build. |
| What not to decide here | Final shell, supported OS/device range, app identifiers, URL/domain, auth/storage plugin, release date, launch feature scope, signing accounts or notification permissions. Aaron must approve these before implementation/configuration. |
| Largest technical risks | Existing URL/navigation behavior is partly browser/history-specific; the default guest participation store and prototype state use `localStorage`; WebView origins differ from hosted-web origins; OAuth callbacks, token persistence and app lifecycle are untested. |
| Minimum proof | Development builds on one physical iPhone and one budget Android device; preserve synthetic guest progress across force-quit/relaunch; safely handle a deep link and app resume; verify accessibility and network/error behavior. |
| Not in that proof | Production accounts, real-reader data, OAuth credentials, push delivery, store submission, production domains/services, or offline-first synchronization. |

## Evidence and current baseline

This memo distinguishes:

- **Verified repository behavior:** checked in the source at the baseline SHA above. Inline references link to that exact commit.
- **External platform documentation:** vendor/platform documentation linked in [References](#references); policy details and SDK requirements must be rechecked when a release is planned.
- **Engineering inference:** implications deduced from the source and documented platform model, not proven on a device.
- **Untested:** behavior that requires a native build, device, service configuration or owner decision.

### Product and project authority

- The November 8 approved product document and the canonical roadmap place installed iOS/Android first, with hosted web supplementary; the roadmap explicitly identifies native packaging and operations as an R20 production gate. It is not approval to build or omit features. See [roadmap §1, §4](https://github.com/Bibleberry/Bibleberry/blob/2a178e8d6f0b4a70312c14df788964b1dda465ae/docs/product/application-development-roadmap.md#L27-L38), [§4 R20](https://github.com/Bibleberry/Bibleberry/blob/2a178e8d6f0b4a70312c14df788964b1dda465ae/docs/product/application-development-roadmap.md#L121-L131), and [§5 R20 index](https://github.com/Bibleberry/Bibleberry/blob/2a178e8d6f0b4a70312c14df788964b1dda465ae/docs/product/application-development-roadmap.md#L145-L160).
- `docs/project/current-status.md` labels its November 5 inventory as dated and directs readers to verify live state. Its November 9 section records accepted browser staging evidence, but explicitly says native persistence/account sync and other capabilities remain incomplete; do not treat that browser evidence as native validation. See [current status §§0, 3](https://github.com/Bibleberry/Bibleberry/blob/2a178e8d6f0b4a70312c14df788964b1dda465ae/docs/project/current-status.md#L1-L12), [§3](https://github.com/Bibleberry/Bibleberry/blob/2a178e8d6f0b4a70312c14df788964b1dda465ae/docs/project/current-status.md#L26-L42).
- The account/sync record says Capacitor Preferences, SQLite and other choices remain unselected; no native dependency or packaging work is authorized there. It also says local guest records are not guaranteed through uninstall/device loss, while Supabase, Google, Apple and email-code login are working directions rather than implemented integration. See [account/sync §§2, 4](https://github.com/Bibleberry/Bibleberry/blob/2a178e8d6f0b4a70312c14df788964b1dda465ae/docs/architecture/user-accounts-and-sync.md#L17-L23), [merge rules](https://github.com/Bibleberry/Bibleberry/blob/2a178e8d6f0b4a70312c14df788964b1dda465ae/docs/architecture/user-accounts-and-sync.md#L38-L48), [working decisions](https://github.com/Bibleberry/Bibleberry/blob/2a178e8d6f0b4a70312c14df788964b1dda465ae/docs/architecture/user-accounts-and-sync.md#L50-L64).
- The approved reader experience settles product behavior, including automatic guest merges and the importance of preserving earned records; it does not claim that account, Month Screen, Shelf/Library or notification features are implemented. The release plan requires channel, signing, supported-device, account and beta decisions before a release claim. See [approved experience §§8, 11](https://github.com/Bibleberry/Bibleberry/blob/2a178e8d6f0b4a70312c14df788964b1dda465ae/docs/product/2026-11-08-approved-reader-experience-and-month-screen.md#L133-L160) and [release readiness §§3, 6](https://github.com/Bibleberry/Bibleberry/blob/2a178e8d6f0b4a70312c14df788964b1dda465ae/docs/release/release-readiness-and-rollback.md#L42-L56), [§6](https://github.com/Bibleberry/Bibleberry/blob/2a178e8d6f0b4a70312c14df788964b1dda465ae/docs/release/release-readiness-and-rollback.md#L91-L114).
- On the assessment date, GitHub showed PRs #74 and #76 merged and PR #73 (R08A-2) open. R20-0 is independent of #73; this memo does not propose changes to CMS/gateway work. The baseline was fetched from current `main` rather than inferred from the dated status file.

### Verified source behavior and packaging seams

| Area | Verified source evidence | Implication |
|---|---|---|
| Build and dependencies | `package.json` uses React 19, TypeScript and Vite; `build` runs `tsc -b && vite build`. No Capacitor/native packaging dependency is present. `vite.config.ts` uses relative `base: './'`. See [`package.json`](https://github.com/Bibleberry/Bibleberry/blob/2a178e8d6f0b4a70312c14df788964b1dda465ae/package.json#L1-L22), [dependencies](https://github.com/Bibleberry/Bibleberry/blob/2a178e8d6f0b4a70312c14df788964b1dda465ae/package.json#L58-L93), [`vite.config.ts`](https://github.com/Bibleberry/Bibleberry/blob/2a178e8d6f0b4a70312c14df788964b1dda465ae/vite.config.ts#L6-L18). | Existing output is a plausible packaged web bundle. Native projects, plugin configuration, signing and store automation would all be new. |
| Initialization and navigation | [`src/main.tsx`](https://github.com/Bibleberry/Bibleberry/blob/2a178e8d6f0b4a70312c14df788964b1dda465ae/src/main.tsx#L1-L13) mounts `BrowserRouter` and `App`. [`src/App.tsx`](https://github.com/Bibleberry/Bibleberry/blob/2a178e8d6f0b4a70312c14df788964b1dda465ae/src/App.tsx#L601-L628) parses hash routes; navigation also uses `window.location`, `history.pushState/replaceState`, `popstate` and `hashchange` ([lines 715–798](https://github.com/Bibleberry/Bibleberry/blob/2a178e8d6f0b4a70312c14df788964b1dda465ae/src/App.tsx#L715-L798)); teaching sharing currently emits `#/teaching/{id}` ([lines 822–831](https://github.com/Bibleberry/Bibleberry/blob/2a178e8d6f0b4a70312c14df788964b1dda465ae/src/App.tsx#L822-L831)). | This is not yet a complete URL/deep-link contract. Native URL callbacks must be translated into a stable internal destination, including cold-start and already-running-app paths. Do not invent Month/Shelf/Library URLs here; their navigation and some destinations remain planned/deferred. |
| Prototype state | `src/App.tsx` reads `bibleberry-prototype-v1` from `localStorage` ([lines 91–102](https://github.com/Bibleberry/Bibleberry/blob/2a178e8d6f0b4a70312c14df788964b1dda465ae/src/App.tsx#L91-L102)) and writes state there ([line 691](https://github.com/Bibleberry/Bibleberry/blob/2a178e8d6f0b4a70312c14df788964b1dda465ae/src/App.tsx#L691)). Developer tools use separate state. | A native pilot must inventory every persisted state category and keep testing-only storage isolated. Do not assume the participation adapter covers all current browser-local state. |
| Participation domain and adapter | Participation types are platform-neutral ([`types.ts` lines 1–10](https://github.com/Bibleberry/Bibleberry/blob/2a178e8d6f0b4a70312c14df788964b1dda465ae/src/participation/types.ts#L1-L10)). `KeyValueStorageDriver` accepts synchronous or asynchronous operations and optional external-change notification ([`persistence.ts` lines 22–50](https://github.com/Bibleberry/Bibleberry/blob/2a178e8d6f0b4a70312c14df788964b1dda465ae/src/participation/persistence.ts#L22-L50)); the store supports hydration, queued writes and serialized I/O ([`store.ts` lines 22–35](https://github.com/Bibleberry/Bibleberry/blob/2a178e8d6f0b4a70312c14df788964b1dda465ae/src/participation/store.ts#L22-L35)). The current default guest store is explicitly wired to web `localStorage` ([`defaultGuestStore.ts`](https://github.com/Bibleberry/Bibleberry/blob/2a178e8d6f0b4a70312c14df788964b1dda465ae/src/participation/defaultGuestStore.ts#L1-L37)). | There is a credible seam for a future native driver, not a native adapter already in use. A POC should substitute the persistence driver while leaving participation commands/models intact and must test asynchronous hydration and recovery. |
| Gateway/origins | The Worker gateway returns exact-origin CORS headers only for configured allowlist entries ([`handler.ts` lines 20–45](https://github.com/Bibleberry/Bibleberry/blob/2a178e8d6f0b4a70312c14df788964b1dda465ae/src/gateway/handler.ts#L20-L45)). The checked staging config lists its staging web origin and local development origins ([`wrangler.staging.jsonc` lines 12–20](https://github.com/Bibleberry/Bibleberry/blob/2a178e8d6f0b4a70312c14df788964b1dda465ae/wrangler.staging.jsonc#L12-L20)). | A native WebView origin is not automatically the hosted site origin. Determine actual iOS and Android request origins from device builds and explicitly review server CORS and CSP. CORS is not user authentication or authorization. |
| Browser verification | `test:smoke` launches Vite preview and Playwright's configured project is Chromium ([`package.json` lines 12–21](https://github.com/Bibleberry/Bibleberry/blob/2a178e8d6f0b4a70312c14df788964b1dda465ae/package.json#L12-L21), [`playwright.config.ts`](https://github.com/Bibleberry/Bibleberry/blob/2a178e8d6f0b4a70312c14df788964b1dda465ae/playwright.config.ts#L1-L25)). | Existing smoke/build checks remain useful for web regressions but cannot prove native installation, app lifecycle, OS callbacks, signing or accessibility on devices. |

## Options matrix

| Option | Preserve existing reader? | Native capability and distribution | Operations, security and testing | Cost/risk for this repository |
|---|---|---|---|---|
| **Capacitor (recommended POC)** | High: packages the Vite build in platform WebViews; existing React/DOM UI remains. Native plugins and platform projects add seams, not a required UI rewrite. [Capacitor workflow](https://capacitorjs.com/docs/basics/workflow) | iOS/Android shell, OS link/lifecycle callbacks, native APIs via plugins, app-store distribution. A store wrapper still must satisfy store quality/review requirements ([Apple guideline 4.2](https://developer.apple.com/app-store/review/guidelines/)). | Adds Xcode/macOS, Android SDK/Gradle, signing, native build/release tracks and plugin upkeep. Local bundle changes ordinarily ship through a native app release; do not assume store-policy-safe OTA updates. Test web in CI plus native builds/devices separately. | Lowest rewrite, moderate-to-high new release operations. Closest fit to current Vite app and existing async storage contract. Plugin quality, WebView security, app-store acceptance and API origin behavior must be proven. |
| **Expo / React Native** | Low for a native UI: React Native renders native components, not this app's DOM/CSS, so UI must be migrated screen-by-screen. An [Expo WebView](https://docs.expo.dev/versions/latest/sdk/webview/) can display existing web content but keeps a web UI and adds a different shell/runtime; it is not an efficient first step here. | Strong native UI/integration path and app-store distribution. Expo WebView is technically possible, but native routing/auth/storage still needs adapters. | Expo provides a managed build/update ecosystem, but native module changes still require compatible native builds. It does not remove distribution, OAuth, lifecycle or device testing requirements. | High rewrite and regression risk for a primarily packaging goal; credible if Aaron chooses native-rendered UI as a longer-term product strategy. A WebView-only variant is not the preferred packaging shortcut. |
| **PWA / web-only baseline** | Highest: continues hosting the existing Vite app. Home-screen installation is browser-mediated ([Apple's Add to Home Screen guide](https://support.apple.com/en-gb/guide/iphone/iphea86e5236/27/ios/27)). | Useful hosted-web channel; some platform capabilities exist, but an installed web app is not automatically an iOS/Android store-distributed app. iOS web push is available for qualifying Home Screen web apps on supported OS versions ([Apple Web Push](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)), not a replacement for choosing native distribution. | Lowest build/signing burden. Browser storage, permission and update behavior vary by platform; no native shell callbacks. Continue browser/device verification and secure hosted origins. | Lowest incremental effort, but misses the explicit installed-app priority and native integration intent if adopted alone. Keep it as a supplementary channel. |

**Assessment:** Capacitor best balances preservation and native distribution for the current app. This is an engineering recommendation, not a validated performance, UX, review-approval or long-term maintenance result. Revisit only if the POC exposes unacceptable WebView/accessibility limitations or Aaron explicitly chooses a native UI migration.

## Integration implications and required seams

### Guest data and durability

- **Verified:** `src/participation` already models async-capable persistence, hydration, queued actions and reset semantics. The shipped/default guest adapter is nevertheless web `localStorage`; `src/App.tsx` has additional prototype state. The account/sync requirements explicitly say local guest state is not guaranteed after device loss or reinstall.
- Web `localStorage` and native app storage are separate containers; no automatic browser-to-native guest-data migration exists. Any future migration must be a separately scoped, explicit and tested reader-facing operation, not an assumption that installing the native app imports browser state.
- **Inference / required seam:** isolate storage selection behind the current participation persistence interface. A native driver can use a native key/value API for small records or a database if scale/query/transaction requirements justify it. Preferences is not a secure credential vault; do not store Supabase refresh/access tokens in ordinary Preferences or `localStorage`. Select a maintained secure-storage integration for credentials only after separate review.
- POC records must be synthetic. Test persisted data after force-quit/relaunch, failed writes, async startup actions, clear/reset and malformed/unsupported schema handling. Do not claim uninstall recovery: account-backed sync is the intended route for recoverable progress, and the platform may have backup/restore behavior that is not a product guarantee.
- The signed-in account should become the durable authority only after R13 defines token/session storage, schema/RLS, retries, deletion/recovery and atomic/idempotent guest merge. Implement the already-approved product merge rules rather than re-opening them: preserve both sides' completions and Scripture, existing account Shelf choice wins, earliest credible card-earned date wins, and partial Challenge resume defaults to furthest position. Do not use device timestamps as unreviewed authority.

### Authentication, sessions and app lifecycle

- **Working direction, not implemented:** Supabase, optional account creation, Google, Apple and passwordless six-digit email code. Never require sign-in for ordinary teaching.
- Google OAuth must use an external/system user-agent rather than the app's general embedded WebView ([Google native-app guidance](https://developers.google.com/identity/protocols/oauth2/native-app)). Use authorization-code + PKCE, strict state/nonce and exact redirect allowlisting; return through a verified HTTPS Universal Link/App Link where feasible, with a controlled custom scheme only as a reviewed fallback. Do not place access/refresh tokens in deep-link parameters, logs or clipboard.
- Apple sign-in on iOS needs a platform policy review if third-party sign-in is offered; [Apple review guideline 4.8](https://developer.apple.com/app-store/review/guidelines/) may require the equivalent privacy-preserving Apple sign-in option, subject to its stated exceptions. Keep Apple sign-in available on Android as required by the product's cross-platform provider decision, with its approved web/native flow.
- Email code entry can remain in-app. If a link-based email callback is later chosen, it needs the same verified callback, replay/state and session handling as OAuth. Configure Supabase redirect URLs only under a separately authorized R13 task.
- Use a token-storage adapter backed by platform secure storage, and confirm the selected plugin's iOS Keychain/Android Keystore behavior, backup/restore implications, deletion and revocation semantics. Preferences and WebView storage are not substitutes.
- Handle app active/background and URL-open events through a platform adapter. On foreground, restore/refresh session as appropriate, reconcile pending writes and handle token expiry or revocation; keep failed refresh recoverable and never discard queued guest state. Test force-quit, background timeout, expired/revoked token, cancellation, duplicate callback and network loss.
- Account creation implies privacy, deletion, recovery and store-policy work. Apple review guidelines and [Google Play account-deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en) must be verified for the actual release scope before auth launch. R13-0 is parked; this memo neither configures auth nor claims its integration is approved.

### Links and current navigation

- Current routes are a mix of React `BrowserRouter`, state-driven views and hash/history paths; the existing shared teaching link is `#/teaching/{id}`. The approved Month Screen and complete navigation are still planned, and roadmap R12 explicitly calls for deep links before push destinations.
- Define a versioned route-to-destination contract in a separate R12/R20 issue before using links in notifications, emails or external content. Include malformed/unknown/withdrawn/unreleased content behavior, origin context on return, and backward compatibility.
- The native link adapter should route both cold-start launch URLs and warm `appUrlOpen` callbacks into the same validated resolver used by web URLs. Prefer verified HTTPS Universal Links/App Links with `apple-app-site-association` and Android `assetlinks.json` association once Aaron approves domain ownership/configuration. Keep unknown links on a safe Hub/reader fallback; never accept arbitrary callback URLs as trusted auth state.
- Do not add a competing `bibleberry://` route scheme in this assessment. Custom schemes can be claimed by other apps; if a fallback is needed, specify it with verified-link ownership and OAuth threat modeling.

### Permissions and notifications

- No permission, local notification, push provider, app identifier or production service is authorized here. Roadmap R15 puts real reminders later, after platform/permissions and safe destination contracts; full push delivery also requires an explicit launch decision.
- If separately approved, request notification permission only in context after explaining its value; design notification preferences, opt-out, stale/cancelled messages and deep-link destinations. Distinguish device-local scheduling from remote push/APNs/FCM, which adds tokens, privacy, server operations and platform configuration.
- Keep all notification APIs and prompts out of this POC.

### Gateway, web origin, updates and failure states

- The current Reader/Gateway direction is online-first, not full offline-first. Do not promise completion/sync while offline. Preserve readable local application shell and saved local data where possible; distinguish offline/network failure from not-found/unreleased responses and provide a retry path in a separately authorized UI scope.
- Capacitor's local WebView scheme/hostname can yield a distinct request origin from the hosted site. Capture `Origin` on both physical platforms before adjusting exact gateway CORS allowlists. The checked staging allowlist includes the staging web URL and local web development, not a validated Capacitor origin. Never use `*` as a production workaround. CORS is not access control; continue server-side release authorization and never bundle Sanity write/read credentials or Supabase service-role secrets in Vite assets.
- Inspect and explicitly configure CSP for local assets and approved HTTPS API endpoints; this inspection did not establish the production host's response headers. Prefer standard `fetch` plus reviewed CORS. A native HTTP plugin that bypasses browser CORS changes the security model and should not be introduced without a scoped security review.
- Capacitor's ordinary workflow builds web assets and syncs them into native projects. Coordinate bundle version, API/content compatibility, minimum supported app version, store rollout, cache behavior and any forced update before production. Native code, plugin, permissions or entitlements changes require a native build/release. Do not rely on an over-the-air web-bundle update service in the POC; separately evaluate security and store policy before any production OTA plan.
- No production domain or release environment is selected. Use only a separately authorized synthetic/staging endpoint in future network tests. The R05 browser staging result does not prove a native WebView's CORS, authentication or content behavior.

### Build, release and validation operations

- **iOS:** Xcode/macOS build environment, app identifier, signing/provisioning and Apple developer/App Store Connect access are required for distribution/testing beyond a local simulator. Physical iPhone validation and TestFlight/App Review are separate. A macOS CI runner and protected signing secrets will be needed if iOS builds are automated.
- **Android:** [Android Studio](https://developer.android.com/studio)/SDK, JDK/Gradle, application ID, signing key and Google Play Console access are required for a store release. Keep signing material out of Git and ordinary client build variables. Use Play internal testing before public rollout.
- Exact OS minimums, account availability/cost, target API level, store privacy forms, review timing, staged rollout and rollback mechanics remain owner decisions and must be checked against current store requirements at implementation time.
- Expand the verification plan beyond Chromium smoke tests: native debug/release builds, link callbacks, permission denial, app resume, offline/reconnect, safe updates, accessibility (VoiceOver/TalkBack, dynamic text/zoom, keyboard where applicable), budget Android performance, and an authorized beta. Current Playwright CI is not evidence for any of these.

## Minimum separately authorized POC

The smallest useful next step is a Capacitor packaging/storage spike—not account sync or a release candidate. It should use only synthetic data and a development signing identity, with no production account, domain, credentials, permissions or service mutation.

### Proposed sequential issues / PRs

1. **R20-1 — Native shell and participation-adapter spike (Capacitor only, if approved).** Add native projects and build commands; load the existing local Vite bundle; replace the participation driver only in the native build; preserve web build behavior and testing-tool isolation. Do not implement auth, gateway/domain configuration, push or live updates.
2. **R12/R20-2 — Route and link/lifecycle contract, then device proof.** Agree on stable ordinary content destinations first; implement one validated incoming-link path and app resume handling using synthetic/local content. Test cold and warm starts on both platforms. Associate a real HTTPS domain only after its owner approves it.
3. **R13-0/R13 follow-up — Auth/session and merge design/implementation, separately authorized.** Specify Supabase session lifecycle, native secure storage, OAuth callbacks, email code, recovery/deletion and idempotent guest merge before credentials or provider flows are configured.
4. **R20 release qualification / R15 — Release and notifications.** Separately approve account/budget, build/signing CI, privacy forms, store test tracks and release/rollback; consider notifications only after permission and destination decisions. No issue here authorizes these operations.

Each issue needs its own Aaron-approved scope and PR. Do not implement this sequence merely because it appears in the memo.

### Device acceptance matrix (future pass/fail evidence)

Use the actual supported OS range and hardware budget approved by Aaron; do not infer them from this table. Record device model, OS version, app/build SHA, test steps, result and evidence for each cell.

| Check | Physical iPhone | Budget Android device |
|---|---|---|
| Install and launch | Development-signed build installs and opens directly to the local reader bundle without a blank screen or browser chrome. | Development-signed build installs and opens directly to the local reader bundle without a blank screen or browser chrome. |
| Guest persistence | With synthetic Challenge completion, saved Scripture reference and resume position, force-quit and relaunch; all three hydrate correctly. An action dispatched during delayed hydration is not lost. Reset clears them. | Same checks; additionally confirm no duplicate records after background/foreground or process recreation. |
| Data integrity | Corrupt/unsupported stored data is not silently overwritten; write failure is surfaced/retryable; no production/user data is used. | Same checks, including storage unavailable and process death during a pending write. |
| App lifecycle and links | Background/resume does not lose state. A valid approved test HTTPS link opens the intended reader destination on both cold and warm starts; malformed/unknown link falls back safely. | Same checks, including verified App Link behavior and app-resume after process recreation. |
| Network/error behavior | POC shows a useful, recoverable offline/error state for any network-dependent path it includes; it never confuses an API failure with content release authorization. | Same checks on Wi-Fi/mobile data and airplane-mode/reconnect. |
| Accessibility | VoiceOver reads controls/content in logical order; large/dynamic text remains usable; focus is visible and not trapped. | TalkBack and Android font/display scaling pass equivalent checks; no essential action is gesture-only. |

**Pass only if** both devices satisfy every applicable cell, the regular hosted-web build/regression checks still pass, there are no lost/duplicated synthetic records, and route/network/security failures are safe and diagnosable. A simulator-only build, emulator-only result, browser test, vendor claim or successful compilation does not pass the device gate. Store approval, production auth, reinstall recovery and notifications are explicitly outside this minimum POC.

## Open decisions and high-impact risks for Aaron

Before any code or account setup, Aaron should decide:

1. Is Capacitor approved for a bounded POC, or should the team accept the larger React Native UI migration instead?
2. Which minimum iOS/Android versions and representative budget Android device are supported, and what time/budget is available for two-device testing?
3. Is App Store/Google Play availability required for the initial installed release? What hosted-web scope and release/update cadence must remain?
4. Which route/domain ownership and test origin may be used for link and native gateway proofs? Do not create a domain or change gateway allowlists under this assessment.
5. Is authenticated cross-device progress required at first release? This is a product/launch-scope question; do not silently drop it. The account record specifies the product merge rules but leaves atomicity, identity and recovery engineering unresolved.
6. Who owns Apple/Google developer accounts, signing, CI secrets, privacy disclosures, app review, support, costs and rollback? No accounts, identifiers or credentials were created here.
7. Does the team want native capability or update behavior beyond what Capacitor's base shell supplies? Choose maintained plugins individually after ecosystem/security review; do not select a vendor update service by default.

**High-impact risks:** an unreviewed native storage plugin can lose progress or expose auth tokens; custom-scheme OAuth interception can leak accounts; WebView CORS/CSP assumptions can block or weaken gateway calls; WebView accessibility/performance can differ materially from desktop Chromium; store review is not guaranteed for a thin wrapper; background execution and push behavior vary by OS; guest data cannot be promised through uninstall; and automated signing creates high-value secrets requiring least privilege, rotation and recovery.

## References

### Repository evidence

All source citations above refer to commit [`2a178e8d6f0b4a70312c14df788964b1dda465ae`](https://github.com/Bibleberry/Bibleberry/commit/2a178e8d6f0b4a70312c14df788964b1dda465ae). Other required project sources, also at that baseline:

- [`docs/ai-development-protocol.md`](https://github.com/Bibleberry/Bibleberry/blob/2a178e8d6f0b4a70312c14df788964b1dda465ae/docs/ai-development-protocol.md) — current-main verification, scope authorization, branch, security and reporting procedure.
- [`docs/project/current-status.md`](https://github.com/Bibleberry/Bibleberry/blob/2a178e8d6f0b4a70312c14df788964b1dda465ae/docs/project/current-status.md) — dated status and accepted browser/staging evidence, not live native proof.
- [`docs/product/application-development-roadmap.md`](https://github.com/Bibleberry/Bibleberry/blob/2a178e8d6f0b4a70312c14df788964b1dda465ae/docs/product/application-development-roadmap.md) — single sequencing roadmap and R12/R13/R15/R19/R20 dependencies.
- [`docs/architecture/user-accounts-and-sync.md`](https://github.com/Bibleberry/Bibleberry/blob/2a178e8d6f0b4a70312c14df788964b1dda465ae/docs/architecture/user-accounts-and-sync.md) — working account/storage direction and open engineering decisions.
- [`docs/product/2026-11-08-approved-reader-experience-and-month-screen.md`](https://github.com/Bibleberry/Bibleberry/blob/2a178e8d6f0b4a70312c14df788964b1dda465ae/docs/product/2026-11-08-approved-reader-experience-and-month-screen.md) — current product authority, including merge behavior and deferred UX.
- [`docs/release/release-readiness-and-rollback.md`](https://github.com/Bibleberry/Bibleberry/blob/2a178e8d6f0b4a70312c14df788964b1dda465ae/docs/release/release-readiness-and-rollback.md) — release gates, signing, device testing, privacy and operational readiness.

### Platform documentation

These are vendor/platform descriptions and policies, not Bibleberry device-test results. Recheck versions and policies before implementation or submission.

- Capacitor [Getting Started](https://capacitorjs.com/docs/getting-started), [Workflow](https://capacitorjs.com/docs/basics/workflow), [Configuration](https://capacitorjs.com/docs/config), [App API](https://capacitorjs.com/docs/apis/app), [Storage guidance](https://capacitorjs.com/docs/guides/storage), and [Security guidance](https://capacitorjs.com/docs/guides/security).
- Expo [WebView API](https://docs.expo.dev/versions/latest/sdk/webview/) and [EAS Update](https://docs.expo.dev/eas-update/introduction/); React Native [Getting Started](https://reactnative.dev/docs/getting-started).
- Apple [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), [Xcode](https://developer.apple.com/xcode/), [Associated Domains](https://developer.apple.com/documentation/xcode/supporting-associated-domains), [Sign in with Apple configuration](https://developer.apple.com/documentation/signinwithapple/configuring-your-environment-for-sign-in-with-apple), [Keychain Services](https://developer.apple.com/documentation/security/keychain-services), and [Web Push for web apps](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers).
- Google [OAuth for native apps](https://developers.google.com/identity/protocols/oauth2/native-app), Android [App Links](https://developer.android.com/training/app-links/about) and [Keystore](https://developer.android.com/privacy-and-security/keystore), plus [Google Play account deletion](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en).
- MDN [CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS) and [Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy).
