# R08 Phase 05 — App-Shell Library & Shelf Integration (`[Velvet Badger]`, Issue #227)

## Scope

Connects the accepted `LibraryShelfHost` workspace and durable `defaultGuestShelfStore` to ordinary reader navigation (`Archive` -> `Shelf` & `Historical Library` -> `MonthScreenHost` -> `ReleasedChallengeHost`) under the `VITE_ENABLE_HISTORICAL_LIBRARY` and `VITE_ENABLE_MONTH_SCREEN` feature gates without altering the top-level navigation tabs or cloud account transport.

## Key Changes

- **`src/appIntegration/appRoutes.ts` & `src/appIntegration/index.ts`**: Added feature-gated `#/shelf` (`SHELF_ROUTE_HASH`, `SHELF_ROUTE_ALIASES`, `buildShelfRoute`) alongside `#/library`.
- **`src/appIntegration/ProvisionalLibraryEntryBar.tsx` & `src/appIntegration/provisionalCollections.css`**: Updated the `Archive` entry bar to surface both **Open Shelf** (`#/shelf`) and **Open Historical Library** (`#/library`) using approved `Shelf` and `Library` terminology, with `>= 44px` touch targets and zero horizontal overflow on 320px/375px viewports.
- **`src/appIntegration/AppLibraryShelfHost.tsx`**: Added a small ordinary-reader adapter composing `LibraryShelfHost` with `defaultGuestShelfStore` via `useGuestShelfStore`, failing closed during async hydration and on `corruptStoredData` / `unsupportedNewerSchema` without overwriting existing storage.
- **`src/App.tsx`**: Wired `AppLibraryShelfHost` for `#/shelf` and `#/library` routes, preserved origin-aware `returnTo` (`'shelf' | 'library' | 'news'`) across `MonthScreenHost` and `ReleasedChallengeHost`, synced browser Back/Forward history across `#/shelf`, `#/library`, and `#/month/:yearMonth`, and included `defaultGuestShelfStore.clearLocalData()` in `resetPrototype()`.

## Verification Results

All checks executed on branch `feat/issue-227-velvet-badger` (2026-11-18):

- `npm run build` (`tsc -b && vite build`): **passed**
- `npm run lint` (`eslint .`): **passed**
- `npm run test:shelf-persistence` (`tests/shelfPersistence/*.test.ts`): **22/22 passed**
- `node --experimental-strip-types --test tests/sanity/appIntegrationRoutes.test.ts`: **6/6 passed**
- `npm run test:library-shelf`:
  - `tests/libraryShelf/libraryShelfModel.test.ts`: **7/7 passed**
  - Playwright (`chromium` + `mobile-chrome`, `tests/libraryShelf/*.spec.ts`): **32/32 passed** (including `app-library-shelf-integration.spec.ts` covering Archive -> Library -> Shelf -> Month Screen -> Challenge -> Finish -> Return to Shelf -> reload, 0–3 capacity replacement, Put Away without progress loss, fail-closed unsupported Shelf schema without storage overwrite, disabled feature gate, 320px/375px viewports, large text, `>= 44px` touch targets, keyboard navigation, and Back/Forward)
- `npx playwright test --config tests/appIntegration/playwright.config.ts tests/appIntegration/library-shell-integration.spec.ts`: **5/5 passed**
- `npm run test:smoke` (all 7 build/Playwright regression passes): **passed**
