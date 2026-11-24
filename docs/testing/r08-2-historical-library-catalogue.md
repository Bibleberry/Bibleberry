# R08-2: Historical Library Catalogue (Standalone Surface & Month-Opening Boundary)

## Overview

Implemented the standalone, reader-facing **Historical Library** catalogue under `src/components/library/` based on the secure `GET /api/library/months` provider foundation accepted in PR #123 (Issue #121).

The original R08-2 delivery used these write ownership boundaries:
- Created `src/components/library/**`
- Created `tests/library/**`
- No edits to `src/cms/reader/libraryMonthIndexProvider.ts`, `src/components/month/**`, `src/participation/**`, `src/App.tsx`, `src/gateway/**`, `src/shelf/**`, or other parallel workstreams.

## Files & Entry Points

- **Domain, pagination, and projection model:** `src/components/library/historicalLibraryModel.ts`
  - Zero browser (`window`, `localStorage`, `document`) or network dependencies.
  - Strictly deduplicates historical month summaries by stable `yearMonth` (`YYYY-MM`).
  - Sorts newest-first (descending civil `yearMonth`).
  - Handles sparse pages accurately: when `items: []` and `hasMore: true`, preserves continuation cursor and action without erroneously claiming the Library is exhausted.
  - Safe presentation reducer with robust transition handling (`loading-initial`, `ready`, `loading-more`, `empty`, `request-error`, `validation-error`).
  - Preserves already-loaded items on subsequent page load failures so the reader doesn't lose visible content.
  - Provides deterministic month heading formatting (`formatPublicationMonthHeading`), e.g., "October 2026".
- **Presentation card component:** `src/components/library/HistoricalLibraryCard.tsx`
  - Renders a compact month/theme row with an accessible open-month action and the existing Shelf membership controls.
  - Theological study focus only: zero unearned cards, streak counters, or achievement promotion badges.
  - Accessible button with descriptive aria-label (`Open October 2026: Walk in Gratitude`) and minimum 44px touch targets.
- **Presentation collection view:** `src/components/library/HistoricalLibraryView.tsx`
  - Semantic HTML landmarks (`<main>`, `<header>`, `<section>`, `<ul>`, `<li>`).
  - Live region (`role="status"`, `aria-live="polite"`, `sr-only`) for screen reader status updates.
  - Clear loading spinner, dignified empty state, request-error panel with retry, and safe validation-error panel.
  - Explicit "Load more past months" pagination button with loading indicator (`aria-busy`).
  - Intermediate and initial sparse continuation notices.
- **State-injected host container:** `src/components/library/HistoricalLibraryHost.tsx`
  - Defaults `provider` to `defaultGatewayLibraryMonthIndexProvider`.
  - Coordinates initial fetch on mount and subsequent page fetching via "Load more".
  - Employs `AbortController` to cancel in-flight stale requests on unmount or retry.
  - Guards `onOpenMonth(yearMonth)`: validates format (`^\d{4}-(?:0[1-9]|1[0-2])$`) and verifies `yearMonth` is present in the loaded catalogue, preventing arbitrary links or guessed unpublished month IDs.
- **Responsive styling:** `src/components/library/library.css`
  - Conforms to Bibleberry CSS token palette (`--page`, `--surface`, `--ink`, `--muted`, `--accent`, `--rule`, `--focus`).
  - Single-column rows with wrapping controls on phone viewports (`@media (max-width: 600px)`).
  - High contrast focus rings (`:focus-visible`) and large-text scaling support.
- **Public exports:** `src/components/library/index.ts`

## Test Coverage

- **Unit & model tests:** `tests/library/historicalLibraryModel.test.ts` and `tests/library/historicalLibraryHost.test.ts` (12 tests via `node --experimental-strip-types --test tests/library/*.test.ts`)
  - Format validation (`isValidYearMonth`) and deterministic heading formatting.
  - Sorting and deduplication across multiple pages.
  - Distinction between truly empty catalogue vs. sparse continuation page.
  - Load failure handling (preserving items on load-more failure, safe validation errors).
  - Host security boundary: month-opening target must be valid `YYYY-MM` and present in the catalogue.
  - AbortController cancellation of in-flight requests.
- **Interactive browser Playwright regression suite:** `tests/library/historical-library.spec.ts` (16 tests across Desktop Chrome and Pixel 5 mobile)
  - Multi-page catalogue loading, newest-first order, "Load more" pagination, and `onOpenMonth` callback execution.
  - Dignified empty state view when no historical months exist.
  - Sparse page handling: initial sparse page retains continuation action without claiming catalogue is empty; intermediate sparse page maintains catalogue list and enables continuing to earlier months.
  - Deduplication across overlapping pages with zero duplicate key errors.
  - Request error display with functioning "Try Again" retry.
  - Safe validation error display without leaking raw internal stack traces.
  - Keyboard navigation (Tab, Enter) and screen reader landmarks.
  - Zero direct browser calls to `api.sanity.io`.

## Verification Commands

- Unit tests: `node --experimental-strip-types --test tests/library/*.test.ts`
- Playwright E2E tests: `npx playwright test --config tests/library/playwright.config.ts`
- Linter: `npm run lint`
- Production Build: `npm run build`

### Willow Quay search and pagination investigation (#316)

At base 7d39092 the provider requests 12 months by default (maximum 24).
Neither the publication schema nor the gateway establishes a total catalogue
size. A terminal cursor proves exhaustion for one traversal. A short or empty
page alone does not. No live dataset count was required or used.

Search uses the existing gateway route with an optional literal, case-insensitive
`q` (up to 80 UTF-16 code units). The gateway scans up to four batches of 25
candidates using the existing exclusive descending civil-month cursor. Published
perspective, historical date, review, finalized roster and withdrawal checks
precede matching. Only the projected English month/year and published Month title
(the ministry-authored theme) participate. Search filters each authorized browse
window, so cursor boundaries and upstream work are independent of the text typed.
A sparse result can continue even when it contains zero matches. Only a terminal
page ends the search. Changing the query restarts at the newest window.

The reader keeps query, year expansion and requested depth in memory. Returning
from a Month replays that depth from the newest window using fresh cursors.
A cleared search similarly rebuilds the previous browse depth. Reader requests
and gateway responses use no-store. Connected J5 coverage lives in
`tests/readerShell/historical-catalogue/shell.spec.ts`.
