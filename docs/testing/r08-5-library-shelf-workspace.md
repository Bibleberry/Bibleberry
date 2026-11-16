# Phase 05 / R08: Standalone Library-to-Shelf Reader Handoff Verification

**Issue:** [#176](https://github.com/Bibleberry/Bibleberry/issues/176)  
**Branch:** `feat/r08-library-shelf-workspace`  
**Product Authority:** [November 8 Approved Reader Experience (§6)](../product/2026-11-08-approved-reader-experience-and-month-screen.md)  
**Canonical Roadmap:** [Application Development Roadmap](../product/application-development-roadmap.md) (Phase 05)  
**Protocol:** [AI Development Protocol](../ai-development-protocol.md)

## Scope & Ownership Boundaries

Implemented a standalone Library-to-Shelf reader handoff workspace composing the accepted `HistoricalLibraryHost` and `ShelfHost`:

- **Modified (`src/components/library/**`):**
  - `src/components/library/historicalLibraryModel.ts` — added `LibraryMonthShelfStatus` and `getLibraryMonthShelfStatus` pure helper.
  - `src/components/library/HistoricalLibraryCard.tsx` — added optional Shelf status badges (`On Shelf · Protected` / `On Shelf · Rollover`), `Add to Shelf` / `Keep on Shelf` / `On Shelf` actions, and `isSelectedContext` highlight.
  - `src/components/library/HistoricalLibraryView.tsx` — added optional topbar `View Shelf (N/3)` navigation, live-region Shelf announcement support, and per-card Shelf status/selection props.
  - `src/components/library/HistoricalLibraryHost.tsx` — added optional `preservedState` / `onStateChange` (to preserve loaded pages across Shelf <-> Library navigation), validated `onSelectForShelf` against `isValidYearMonth` and loaded `state.items`, and forwarded optional Shelf handoff props.
  - `src/components/library/library.css` — added styles for Shelf badges, `Add to Shelf` / `Keep on Shelf` buttons (>= 44px touch targets), selected-card highlight, and topbar Shelf navigation.
  - `src/components/library/index.ts` — exported `getLibraryMonthShelfStatus` and `LibraryMonthShelfStatus`.
- **New (`src/components/libraryShelf/**`):**
  - `src/components/libraryShelf/libraryShelfModel.ts` — pure composition model (`resolveReferenceCurrentYearMonth`, `buildShelfMonthMetadataMap`, `attemptSelectLibraryMonthForShelf`, `validateAuthorizedMonthOpen`).
  - `src/components/libraryShelf/LibraryShelfHost.tsx` — standalone workspace composing `ShelfHost`, `HistoricalLibraryHost`, and `ShelfReplaceDialog` with controlled/uncontrolled `shelfState` + `onShelfStateChange` boundary so durable persistence (`src/shelfPersistence/**`, Draft PR #166) can be attached later.
  - `src/components/libraryShelf/index.ts` — public barrel exports.
- **New (`tests/libraryShelf/**`):**
  - `tests/libraryShelf/libraryShelfModel.test.ts` — unit tests for model, 0–3 capacity, explicit replacement, auto-admitted promotion, and unauthorized/current/future month rejection.
  - `tests/libraryShelf/playwright.config.ts`, `tests/libraryShelf/harness/index.html`, `tests/libraryShelf/harness/main.tsx` — standalone composition and test harness.
  - `tests/libraryShelf/library-shelf-workspace.spec.ts` — Playwright browser tests (Desktop Chrome + Mobile Chrome).

**Out of scope / untouched:** `src/App.tsx`, global tab navigation, `src/shelf/**`, `src/accountSync/**`, and `src/shelfPersistence/**` (Draft PR #166).

## Verification Results

### 1. Lint & Production Build
- `npm run lint` (`eslint .`): **PASSED**
- `npm run build` (`tsc -b && vite build`): **PASSED**

### 2. Unit Tests (`node --experimental-strip-types --test`)
- `tests/libraryShelf/libraryShelfModel.test.ts`: **5 passed, 0 failed**
- `tests/library/*.test.ts` & `tests/shelfUI/*.test.ts`: **18 passed, 0 failed**

### 3. Browser Tests (`playwright`)
- `npx playwright test --config tests/libraryShelf/playwright.config.ts`: **16 passed, 0 failed** (8 scenarios × Desktop Chrome + Mobile Chrome):
  - 0–3 months handoff from Shelf -> Library -> Add to Shelf -> Back to Shelf without losing selected context or paginated Library items (verified 0 extra provider fetches on return).
  - Explicit replacement policy via `ShelfReplaceDialog` when 3 months are occupied (Cancel preserves Shelf; confirming replaces chosen month).
  - Distinguishes protected vs automatically admitted months in both Shelf and Library, and promotes an auto-admitted month from Library via `Keep on Shelf`.
  - Putting away a Shelf month removes it from Shelf, restores `Add to Shelf` in Library, and preserves underlying progress/accomplishments.
  - Opens authorized historical months with origin context (`origin: 'shelf'` and `origin: 'library'`) while blocking unauthorized, current (`2026-11`), and future (`2026-12`) candidates.
  - Back navigation when starting in Library and outer `onExit` callback.
  - Keyboard navigation (`Enter` to open replacement dialog, `Escape` to dismiss).
  - Mobile viewport (375px / Pixel 5): zero horizontal overflow and `>= 44px` touch targets on all interactive buttons.
- `npx playwright test --config tests/library/playwright.config.ts`: **16 passed, 0 failed** (regression check)
- `npx playwright test --config tests/shelfUI/playwright.config.ts`: **10 passed, 0 failed** (regression check)

## Limitations & Follow-Up

- Uses a mock `LibraryMonthIndexProvider` and in-memory `ShelfState` in the standalone test harness; live gateway HTTP endpoints and durable persistence (`src/shelfPersistence/**`, Draft PR #166) are attached externally via the `libraryProvider`, `shelfState`, and `onShelfStateChange` props.
- Global app-shell integration (`src/App.tsx`) remains intentionally deferred.
