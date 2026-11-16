# R11-2: Ministry News App-Shell Integration

## Scope and Architectural Boundaries

- **Issue:** Bibleberry GitHub Issue #175 (`R11-2: Connect standalone ministry News reader to ordinary app shell`).
- **Write Ownership:**
  - `src/appIntegration/appRoutes.ts`: Feature-gate check (`isNewsReaderRouteEnabled` / `VITE_ENABLE_NEWS_READER`), canonical `#/news` route constant (`NEWS_ROUTE_HASH`), aliases (`NEWS_ROUTE_ALIASES`), parser support (`'news'`), `parseNewsCategoryQuery()`, and `buildNewsRoute()`.
  - `src/appIntegration/ProvisionalNewsEntryBar.tsx`: Temporary, accessible entry bar rendered in `Today` and `More` views when `VITE_ENABLE_NEWS_READER === 'true'`, preserving `Today / Foundations / Archive / More` without modifying global navigation.
  - `src/appIntegration/index.ts`: Barrel exports for News route helpers and `ProvisionalNewsEntryBar`.
  - `src/App.tsx`: Feature-gated `#/news` route dispatch, lazy-loaded `NewsReaderHost` and `ProvisionalNewsEntryBar`, `parseInitialRoute()` / `popstate` / `hashchange` / onboarding synchronization, origin-preserving `Back` return, and safe Month-preview destination (`#/month/YYYY-MM` when `VITE_ENABLE_MONTH_SCREEN === 'true'`, failing closed when disabled).
  - `tests/sanity/appIntegrationRoutes.test.ts`: Unit tests for `#/news` route parsing, `?category=` query parsing, normalization, and fail-closed feature-gate behavior.
  - `tests/appIntegration/news-shell-integration.spec.ts`: Playwright integration suite covering Today/More entry & return to previous context, category filtering, error/retry recovery, direct `#/news?category=monthlyPreview`, hard refresh, browser Back/Forward, Month-preview destination & return to Ministry News, disabled-gate fail-closed behavior (both `VITE_ENABLE_NEWS_READER=false` and `VITE_ENABLE_MONTH_SCREEN=false`), and 375px mobile keyboard navigation.
  - `docs/testing/r11-2-news-app-shell.md`: This verification note.
- **Read-Only Invariants Preserved:**
  - `src/components/news/**`, `src/cms/reader/**`, `src/components/shelf/**`, `src/components/library/**`, `src/accountSync/**`, `studio/**`, `src/gateway/**`, and `.github/workflows/**` were left untouched.

---

## Route, Gate, and Origin Behavior

1. **Feature Gating & Public Bundle Isolation:**
   - `VITE_ENABLE_NEWS_READER=true` enables `#/news` and `ProvisionalNewsEntryBar` on `Today` and `More`.
   - When `VITE_ENABLE_NEWS_READER` is omitted or `'false'`, `#/news` fails closed to the ordinary `Today` view, the entry bar is omitted, and `NewsReaderHost` / `ProvisionalNewsEntryBar` JS and CSS chunks are excluded from `dist/assets/`.
   - Month Screen remains independently gated behind `VITE_ENABLE_MONTH_SCREEN=true`. When News is enabled and Month Screen is disabled, clicking a Month-preview destination stays safely on `#/news` (fail-closed).

2. **Origin Preservation & Safe Month-Preview Destinations:**
   - Opening `#/news` from `Today` or `More` records `originView` in history state and returns to that exact primary view on `Back`.
   - Opening a Month-preview destination (`{ kind: 'month', monthId }`) from `NewsReaderHost` navigates to `#/month/YYYY-MM` with `returnTo: 'news'` (persisted in `history.state.monthReturnTo`), so `MonthScreenHost` displays `Return to Ministry News` and returns to `#/news` on exit.
   - `NewsReaderHost` reuses `defaultNewsGatewayProvider` (same-origin `/api/news` with `X-Bibleberry-Timezone`), preserves Hub-only earned-card announcements (`view === 'today' && !detail`), and introduces no notifications or global IA changes.

---

## Verification Results

All checks below were executed after the final source and test edits:

| Check | Command | Outcome | Notes |
| --- | --- | --- | --- |
| ESLint | `npm run lint` | **Passed** | 0 errors, 0 warnings |
| Default public build | `npm run build` | **Passed** | `tsc -b && vite build`; `NewsReaderHost` and `ProvisionalNewsEntryBar` excluded from `dist/assets/` |
| Feature-enabled build | `VITE_ENABLE_NEWS_READER=true VITE_ENABLE_MONTH_SCREEN=true npm run build` | **Passed** | `tsc -b && vite build` |
| Adapter & route sanity | `npm run test:adapter` | **Passed** (276 tests) | Includes `#/news` route & category query tests in `tests/sanity/appIntegrationRoutes.test.ts` |
| App-shell integration (Playwright) | `npx playwright test -c tests/appIntegration/playwright.config.ts` | **Passed** (16 tests in 36.1s) | 6 `app-shell-integration.spec.ts` + 5 `library-shell-integration.spec.ts` + 5 `news-shell-integration.spec.ts` |
| Standalone News (Playwright) | `npx playwright test -c tests/news/playwright.config.ts` | **Passed** (8 browser tests in 10.0s + 24 unit tests) | Verified standalone News reader remains unaffected |

## Remaining Limitations

- Browser integration tests use Vite dev servers with synthetic mocked gateway responses (`/api/news`, `/api/months/:yearMonth`, `/api/months/:yearMonth/preview`) rather than a live deployed Cloudflare Worker or Sanity dataset.
- The `ProvisionalNewsEntryBar` in `Today` and `More` is a temporary entry affordance pending final global navigation decisions.
