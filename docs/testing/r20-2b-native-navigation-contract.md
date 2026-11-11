# R20-2B Native Navigation and Lifecycle Contract

## Scope and implementation

This is an internal adapter foundation, not a public deep-link or native callback implementation. The reader remains a React/Vite application wrapped by `BrowserRouter`; its primary/detail navigation is still state-driven and uses hash routes, `window.history`, and `popstate`/`hashchange`.

`src/native/internalDestination.ts` is the shared pure parser for the existing Month and released-Challenge hashes:

- `#/month/YYYY-MM` is supported only when `VITE_ENABLE_MONTH_SCREEN=true`.
- The existing `#/month` and `#/month/` aliases resolve to the current civil month, under the same gate.
- `#/challenge/<slug>` with optional canonical `origin` and `yearMonth` query parameters is supported when either `VITE_ENABLE_RELEASED_CHALLENGE_ROUTE=true` or `VITE_ENABLE_MONTH_SCREEN=true`.
- Challenge origin precedence remains `history.state.challengeOrigin`, hash query, document search query, then the canonical Hub default. `parseChallengeOrigin` remains the single validator for returned origin state.
- The parser returns the same typed Month / released-Challenge detail shapes consumed by `App.tsx`. Finish and exit behavior is unchanged; a Month-origin Challenge still returns to its Month Screen.

The app also retains its existing `#/teaching/<id>` and `#/entry/<id>` routes and feature-gated `#/pilot/challenge` and `#/pilot/participation` routes. Those routes are not new native destinations and remain handled by their existing `App.tsx` paths. Developer Studio and other state-driven detail screens are not URL routes added by this work.

Month and Challenge routes are rejected by the new parser if the date or slug is malformed, the slug contains path or encoded separators/traversal, the destination is unknown, the route feature gate is off, a Month route has unsupported query state, or a Challenge query contains unknown/duplicate keys. Absolute/cross-origin URLs, custom schemes, and control characters are not internal destinations. Parsing a Challenge route does not authorize content: the existing provider/gateway still controls release and embargo access.

## Cold launch, open-app navigation, and lifecycle boundary

For an already-onboarded reader, `parseInitialRoute()` reads the initial hash during React state initialization. Finishing onboarding also resolves an existing hash. While the reader is onboarded and one of the applicable route features is enabled, `App.tsx` listens for browser `popstate` and `hashchange` to synchronize Month and Challenge details. `history.state` retains view/origin context for browser navigation and Challenge return.

The Android manifest still has only its launcher intent filter. No Universal Link/App Link/custom-scheme intent filters or URL-opening permissions were added. There is no `@capacitor/app` dependency or native URL listener. The Capacitor shell continues to choose native Preferences for guest participation; it has no foreground/background reconciliation or process-recreation callback.

`src/native/lifecycleAdapter.ts` provides a platform-neutral, dependency-injected event fan-out for `coldStart`, `foreground`, and `background` notifications. It attaches one source listener while subscribers exist, reference-counts duplicate subscriptions, and releases the source when the final subscriber leaves. It does not own app state, refresh content, hydrate participation, write to the network, or accept URLs. No native source is wired pending owner approval of platform event behavior and device validation.

## Verification record

| Area | Implemented and tested here | Still unverified / deferred |
|---|---|---|
| Internal navigation | Pure parsing tests cover valid/invalid Month routes, valid/invalid Challenge slugs, canonical origin handoff, feature gates, unknown destinations, traversal/encoded separators, unsupported/duplicate query parameters, external URLs/schemes, and control characters. Existing smoke tests cover Month-origin Finish return and gateway release behavior. | Public incoming Universal Links, Android App Links, custom schemes, host allowlisting, and actual native cold/warm URL callbacks are intentionally not implemented. |
| Lifecycle seam | Injected-source tests cover event fan-out, one active source listener, cleanup, repeated subscriptions, and a synthetic StrictMode-style setup/cleanup/setup cycle with no duplicate or lost events. This is not a React renderer or native callback test. | Native foreground/background/cold-start delivery, force-quit/process recreation, participation rehydration, and iOS/Android device behavior require separate acceptance. |
| Existing behavior | `npm run test:adapter` — 206 passed; `npm run test:native-participation` — 5 passed; `npm run test:smoke` — all 7 bundle variants and 47 Playwright tests passed; `npm run lint`, `npm run build`, and `git diff --check` passed. | No physical iPhone, budget Android device, or native APK build was run for this change; no native files or dependencies changed. |

The first local lint/build/smoke attempts were made before installing the lockfile dependencies and Playwright's Chromium binary. After `npm ci` and `npx playwright install chromium`, the listed checks passed. `npm ci` reported 7 moderate audit findings; dependencies and the lockfile were not changed.

## Deferred acceptance and security boundary

Before any public/native URL registration or callback handling, Aaron must approve the production app identity, owned HTTPS domain/association, supported destination and security contract. Do not treat this parser as a Universal Link/App Link resolver, auth callback handler, or redirect allowlist. Do not add domain-association files or intent filters as part of this foundation.

Real-device acceptance remains outstanding on an iPhone and a budget Android device, including install/launch, lifecycle delivery, force-quit/process recreation, guest Preferences persistence, accessibility, and any later owner-approved verified-link flow. Android Back behavior and native gateway/WebView origin behavior are also outside this change.
