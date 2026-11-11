# R08A-6 Calendar Month Screen Verification Report

Date: 2026-11-10  
Branch: `feature/91-r08a-6-month-screen`  
Issue: #91 (R08A-6)

## 1. Feature Gating & Navigation Contract

- **Build-time flag:** `VITE_ENABLE_MONTH_SCREEN=true`
- **Public-build isolation:** When `VITE_ENABLE_MONTH_SCREEN` is omitted or `false`, all Month Screen components, CSS, intro storage (`bibleberry-month-intro-v1`), and Preview News hooks are excluded from `dist/assets/` via Vite lazy splitting and `build-isolation.spec.ts` assertions. Direct visits to `/#/month` or `/#/month/YYYY-MM` in the default public build remain inert on the default Today view.
- **Deep links & History:**
  - `#/month` resolves to the reader's civil `YYYY-MM` month.
  - `#/month/YYYY-MM` loads directly on cold start, reload, and onboarding completion.
  - Launching a Challenge from the Month Screen navigates to `#/challenge/:slug?origin=month&yearMonth=YYYY-MM` via `defaultGatewayChallengeProvider` (never direct `*.api.sanity.io` reads).
  - Completing (`Finish`) or returning exits directly back to `#/month/YYYY-MM` without toast banners, completion modals, or Hub announcements.
  - Note: Month Screen layout is explicitly marked provisional pending design review.

## 2. Automated Test Coverage

### Unit Tests (`tests/sanity/monthScreenModel.test.ts` + `npm run test:adapter`)
- Verified Mon–Sun week grouping and cell counts for 28-, 29- (leap year), 30-, and 31-day months.
- Verified slot states (`Completed`, `Continue`, `In progress`, `Available`, non-interactive `Coming Soon` with title only, non-interactive `Unavailable`).
- Verified `Continue` priority picks the most recently opened incomplete Challenge (`lastOpenedChallenge` or newest `updatedOn` tie-break).
- Verified `extractCompletedCmsChallengeIdsForMonth` intersects month slots, preserves canonical `cms:` IDs, and enforces the 500-ID gateway limit.
- Verified `resolveMonthDiscoveryPresentations` orders `fullMonth` strictly last with no card artwork or qualifyingChallenge leakage.
- Verified `bibleberry-month-intro-v1` preview/Welcome decision logic, schema > 1 protection, and `clear()`.

### Playwright Smoke Tests (`tests/smoke/month-screen.spec.ts` + `tests/smoke/build-isolation.spec.ts`)
- Mocked gateway HTTP envelopes (`GET /api/months/:yearMonth`, `GET /api/months/:yearMonth/preview`, `POST /api/months/:yearMonth/progress`, `GET /api/challenges/:slug`, `GET /api/news?category=monthlyPreview`) while blocking `https://*.api.sanity.io/**` (`0` direct Sanity requests).
- Verified pre-preview 404 -> advance preview -> month rollover (`Skip to Welcome`) -> reload skipping -> `Read Monthly Introduction` / `Read Monthly Preview` replay.
- Verified multi-screen mid-way pause (`Continue` / `In progress`), last-screen exit without `Finish`, `Finish` silent return & ticker/discovery refresh, duplicate `Finish` idempotency, and withdrawn `Unavailable` slot handling (`29/29` active denominator).
- Verified Preview News banner links to `#/month/:yearMonth` while respecting gateway 404 authorization boundaries, and verified Privacy -> `Reset local app data` clears both `bibleberry-reader-participation-v1` and `bibleberry-month-intro-v1`.

## 3. Accessibility & Basic Responsive Performance Summary

- Keyboard Left/Right navigation and touch swipe gestures work across Introduction/Preview slides with heading focus restoration and `role="progressbar"` announcements.
- Monthly Discoveries expose numeric `aria-valuenow` / `aria-valuemax` / `aria-valuetext` and render strictly below the calendar grid.
- `@media (prefers-reduced-motion: reduce)` disables hover transforms and progress bar transitions.
- Playwright viewport checks at mobile (`375x812`) and tablet (`768x1024`) confirmed zero horizontal overflow (`scrollWidth <= innerWidth + 1`) on both the Introduction and Month Screen views, with deferred JS chunks (`MonthScreenHost`, `MonthPreviewNewsBanner`, `ReleasedChallengeHost`) loaded only when `VITE_ENABLE_MONTH_SCREEN=true`.

## 4. Remaining Out-of-Scope / Follow-Up Items

- End-to-end verification against live deployed Cloudflare Worker + real private Sanity staging dataset (using `VITE_ENABLE_MONTH_SCREEN=true` with staging gateway origin) remains gated until staging environment verification.
- Scripture Card unlock artwork, durable earned award storage, Library/Shelf surfaces, and final calendar visual polish belong to Phase 04+.
