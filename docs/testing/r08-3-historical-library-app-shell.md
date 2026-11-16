# R08-3: Historical Library App-Shell Integration

## Scope and Architectural Boundaries

- **Issue:** Bibleberry GitHub Issue #158 (`Phase 05 / R08-3: Connect Historical Library to ordinary app shell and Month Screen`).
- **Write Ownership:**
  - `src/appIntegration/appRoutes.ts`: Feature-gate check (`isHistoricalLibraryRouteEnabled` / `VITE_ENABLE_HISTORICAL_LIBRARY`), canonical `#/library` route constant, parser support (`'library'`), and `buildLibraryRoute()`.
  - `src/appIntegration/ProvisionalLibraryEntryBar.tsx`: Temporary, accessible entry bar rendered in the Archive view when `VITE_ENABLE_HISTORICAL_LIBRARY === 'true'`, preserving `Today / Foundations / Archive / More` without modifying global navigation.
  - `src/appIntegration/index.ts`: Barrel exports for Library route helpers and `ProvisionalLibraryEntryBar`.
  - `src/App.tsx`: Feature-gated `#/library` route dispatch, lazy-loaded `HistoricalLibraryHost` and `ProvisionalLibraryEntryBar`, `parseInitialRoute()` / `popstate` / `hashchange` / onboarding synchronization, and origin-preserving Library ↔ Month Screen ↔ Challenge return navigation.
  - `tests/sanity/appIntegrationRoutes.test.ts`: Unit tests for `#/library` route parsing, normalization, and fail-closed feature-gate behavior.
  - `tests/appIntegration/library-shell-integration.spec.ts`: Playwright integration suite covering Archive → Library → Month Screen → Challenge → Finish → Month Screen → Library → Archive, direct `#/library`, hard refresh, browser Back/Forward, error/retry and empty states, disabled-gate fail-closed behavior, invalid/unapproved month handling, and 375px mobile keyboard navigation.
  - `docs/testing/r08-3-historical-library-app-shell.md`: This verification note.
- **Read-Only Invariants Preserved:**
  - `src/components/library/**`, `src/components/month/**`, `src/cms/reader/**`, `src/gateway/**`, `src/participation/**`, `src/accountSync/**`, `src/shelf/**`, `studio/**`, and `.github/workflows/**` were left untouched.

---

## Route, Gate, and Origin Behavior

1. **Feature Gating & Build Isolation:**
   - `VITE_ENABLE_HISTORICAL_LIBRARY=true` enables `#/library` and `ProvisionalLibraryEntryBar` on Archive.
   - When `VITE_ENABLE_HISTORICAL_LIBRARY` is omitted or `'false'`, `#/library` fails closed to the ordinary Today view, the Archive entry bar is omitted, and `HistoricalLibraryHost` / `ProvisionalLibraryEntryBar` chunks are excluded from `dist/assets/`.
   - Month Screen remains independently gated behind `VITE_ENABLE_MONTH_SCREEN=true`. When Library is enabled and Month Screen is disabled, selecting a month or visiting `#/month/YYYY-MM` fails closed.

2. **Origin Preservation (`Library → Month Screen → Challenge → Finish → Month Screen → Library`):**
   - Opening a validated `yearMonth` from `HistoricalLibraryHost` navigates to `#/month/YYYY-MM` with `returnTo: 'library'` (persisted in `history.state.monthReturnTo`), so `MonthScreenHost` displays `Return to Library` and returns to `#/library` on exit.
   - Opening an eligible Challenge from that historical Month Screen preserves `ChallengeOrigin = { kind: 'month', yearMonth }` and carries `monthReturnTo: 'library'` across `Finish` and browser `popstate`, returning first to the historical Month Screen (`#/month/YYYY-MM`) and then back to `#/library` without losing origin.
   - Earned-card announcements remain Hub-only (`view === 'today' && !detail`).

---

## Verification Results

All checks below were executed after the final source and test edits:

| Check | Command | Outcome | Notes |
| --- | --- | --- | --- |
| ESLint | `npm run lint` | **Passed** | 0 errors, 0 warnings |
| Default public build | `npm run build` | **Passed** | `tsc -b && vite build`; `HistoricalLibraryHost` and `ProvisionalLibraryEntryBar` excluded from `dist/assets/` |
| Feature-enabled build | `VITE_ENABLE_HISTORICAL_LIBRARY=true VITE_ENABLE_MONTH_SCREEN=true npm run build` | **Passed** | `tsc -b && vite build` |
| Adapter & route sanity | `npm run test:adapter` | **Passed** (275 tests) | Includes `#/library` route parsing and fail-closed checks in `tests/sanity/appIntegrationRoutes.test.ts` |
| App-shell integration (Playwright) | `npx playwright test -c tests/appIntegration/playwright.config.ts` | **Passed** (11 tests in 25.1s) | 6 existing `app-shell-integration.spec.ts` + 5 new `library-shell-integration.spec.ts` tests |
| Regression smoke suite | `npm run test:smoke` | **Passed** | All 7 smoke passes passed and restored clean public `dist/` |

## Remaining Limitations

- Browser integration tests use Vite dev/preview servers with synthetic mocked gateway responses (`/api/library/months`, `/api/months/:yearMonth`, `/api/months/:yearMonth/progress`, `/api/challenges/:slug`) rather than a live deployed Cloudflare Worker or Sanity dataset.
- The `ProvisionalLibraryEntryBar` in Archive is a temporary entry affordance pending final Phase 05 global navigation / Shelf IA decisions.
- `npm run test:adapter` was modified in `tests/sanity/appIntegrationRoutes.test.ts` alongside `tests/appIntegration/library-shell-integration.spec.ts` to keep route unit tests alongside existing `appRoutes.ts` tests.
