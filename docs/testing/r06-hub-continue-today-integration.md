# R06 Phase 05 — Hub Continue Ordinary Today Integration (`[Olive Otter]`, Issue #233)

## Scope

Connects Bibleberry's already-accepted Hub Continue recommendation engine (`deriveHubContinueSuggestion`), presentation boundary (`HubContinueBoundary`), and fail-closed input adapter (`createHubContinueAppInput`) to the ordinary `Today` screen under the `VITE_ENABLE_HUB_CONTINUE` feature gate (requiring an authorized released Challenge route via `VITE_ENABLE_RELEASED_CHALLENGE_ROUTE` or `VITE_ENABLE_MONTH_SCREEN`).

No new top-level navigation tab, gateway endpoint, recommendation engine policy, account login/sync wiring, or editorial copy changes were introduced.

## Key Changes

- **`src/appIntegration/AppHubContinueHost.tsx`**:
  - `AppHubContinueHost` subscribes to `defaultGuestShelfStore` via `useGuestShelfStore` and receives hydrated `defaultGuestParticipationStore` state from `src/App.tsx`.
  - Fails closed with zero network requests whenever either store is hydrating or unhealthy (`health !== 'ok'`), `activeFocusMonth` is absent/invalid, any Shelf entry is invalid, or required months exceed `MAX_SHELF_CAPACITY + 1` (4).
  - Loads the released catalog via `defaultGatewayCatalogProvider.loadReleasedCatalog` and each required active-focus/Shelf month via `defaultGatewayMonthProvider.loadMonth` using one consistent `detectReaderTimeZone()` per fetch batch and `AbortController` cancellation on Shelf change or unmount.
  - Clears previously fetched gateway data whenever `requiredMonthsKey` changes (preventing stale response reuse across focus changes) and avoids refetch loops or background polling.
  - Passes store snapshots and gateway responses through `createHubContinueAppInput` and `deriveHubContinueSuggestion`, mounting `HubContinueBoundary` only when an accepted suggestion is derived.
  - Renders `legacyFallback` (`ResumeCard` when applicable, or `null`) whenever canonical Hub Continue is absent/unready, ensuring `Today` never renders two competing Continue/Resume prompts.
  - `HubContinueChallengeHost` wraps `ReleasedChallengeHost` with a memoized `ChallengeDetailProvider` delegating to `loadChallengeDetailForSummary(..., defaultGatewayChallengeProvider)` so opening a Hub Continue recommendation always loads from the release gateway and verifies the canonical Sanity document ID.
- **`src/App.tsx`**:
  - Feature-gates `AppHubContinueHost` and `HubContinueChallengeHost` via `hubContinueEnabled = import.meta.env.VITE_ENABLE_HUB_CONTINUE === 'true' && (releasedChallengeRouteEnabled || monthScreenEnabled)` with lazy imports so the default public production bundle remains isolated and unchanged when the gate is off.
  - Opens recommended Challenges on the existing released Challenge route (`#/challenge/:slug?origin=hub`) with explicit Hub origin and history-preserved `hubContinueDocumentId` across reload and browser Back/Forward.
  - Passes `onOpenMonth={openMonthScreen}` only when `VITE_ENABLE_MONTH_SCREEN === 'true'` so no unauthorized route is offered.
  - Reconciles legacy `ResumeCard` on `Today` while keeping Developer Studio date simulations and feature-off builds untouched.
  - Extends `resetPrototype()` to clear `defaultGuestShelfStore` when `hubContinueEnabled` is active.
- **`src/App.css`**:
  - Adds minimal `.today-hub-continue` container sizing matching `.resume-card` across desktop, mobile (`<= 700px`), and narrow mobile (`<= 380px`), plus safe button text wrapping for 200% text scaling.
- **`tests/hubContinue/app-hub-continue-today.spec.ts`**, **`tests/hubContinue/hubContinueAppInput.test.ts`**, **`tests/smoke/build-isolation.spec.ts`**:
  - Browser tests exercise `App.tsx`, `AppHubContinueHost`, `HubContinueBoundary`, guest Shelf/participation stores, and `ReleasedChallengeHost` against **intercepted, schema-shaped gateway responses** (clearly distinct from live cloud/staging Worker acceptance).

## Verification Boundary

- **Intercepted gateway browser tests vs. live cloud acceptance:** Playwright tests in `tests/hubContinue/app-hub-continue-today.spec.ts` intercept `/api/months/*`, `/api/challenges`, `/api/challenges/*`, `/api/months/*/progress`, and `/api/news` with schema-validated payloads. Live Cloudflare Access / Staging Worker / Sanity production checks were not run in this assignment.
- **Native device builds:** iOS/Android Capacitor native builds were not run in this Linux environment; native async persistence contracts are covered by existing `tests/shelfPersistence/*` and `tests/participation/*` unit suites.

## Verification Results

Executed on branch `feat/issue-233-olive-otter` (2026-11-19):

- `npm run build` (`tsc -b && vite build`): **passed**
- `npm run lint` (`eslint .`): **passed**
- `node --experimental-strip-types --test tests/hubContinue/*.test.ts`: **18/18 passed**
- `npx playwright test --config=tests/hubContinue/playwright.config.ts`: **20/20 passed** (`chromium` + `mobile-chrome`: standalone harness + ordinary-shell Today lifecycle, cross-month Shelf fallback preserving `activeFocusMonth`, legacy `ResumeCard` reconciliation & feature-off isolation, fail-closed checks, Back/Forward/reload/View Month, stale-fetch cancellation, keyboard navigation, 320px/375px reflow, `>= 44px` touch targets, and 200% text scaling)
- `npm run test:shelf-persistence`: **22/22 passed**
- `npm run test:native-participation`: **20/20 passed**
- `npm run test:adapter`: **276/276 passed**
- `npm run test:gateway`: **112/112 passed**
- `npm run test:performance`: **8/8 passed**
- `npx playwright test --config tests/appIntegration/playwright.config.ts tests/appIntegration/library-shell-integration.spec.ts`: **5/5 passed**
- `npm run test:smoke`: **passed** (all 7 regression passes — 49/49 Playwright tests across Public Production 15/15, Developer-Enabled 4/4, Challenge-Pilot 2/2, Participation-Pilot 5/5, Released-Challenge 7/7, Gateway-Backed Released-Challenge 8/8, Month-Screen 8/8 — plus clean public `dist/` restore)
- `git diff --check`: **passed**
