# R08-4: Standalone Shelf Reader Surface (Phase 05 / Issue #159)

## Overview

Implemented the standalone, interactive **Shelf** reader surface under `src/components/shelf/` by composing the accepted pure Shelf policy engine (`src/shelf/policy.ts`, `src/shelf/validation.ts`, `src/shelf/types.ts`).

Strictly honors write ownership boundaries and non-overlap with #158:
- Created `src/components/shelf/**`
- Created `tests/shelfUI/**` (unit tests and isolated Playwright browser harness)
- Created `docs/testing/r08-4-shelf-reader-surface.md`
- Zero edits to `src/shelf/**`, `src/App.tsx`, `src/appIntegration/**`, `src/components/library/**`, `src/components/month/**`, `src/participation/**`, `src/accountSync/**`, `src/gateway/**`, or `.github/workflows/**`.

## Files & Entry Points

- **Pure presentation & validation model:** `src/components/shelf/shelfModel.ts`
  - Zero browser (`window`, `localStorage`, `document`) or network dependencies.
  - Projects `ShelfState` into 0–3 strictly historical `ShelfEntryViewModel` items (`projectShelfViewModel`), never padding empty slots to three and never rendering current or future months.
  - Formats deterministic month headings (`formatPublicationMonthHeading`) and displays optional externally supplied metadata without fabricating teaching titles, cover art, awards, or streaks.
  - Validates month-opening targets (`validateOpenShelfMonthTarget`) so only valid historical `YYYY-MM` months currently on the Shelf can invoke `onOpenMonth`.
  - Filters externally supplied candidate months (`filterHistoricalCandidateMonths`) to strictly historical, deduplicated entries.
- **Presentation card component:** `src/components/shelf/ShelfCard.tsx`
  - Displays plain, respectful wording distinguishing `readerSelected` / protected months from `autoAdmitted` months.
  - Exposes policy-driven actions: **Open Month**, **Keep on Shelf** / **Remove Protection**, **Set as Focus** / **Clear Focus**, and **Put Away**.
  - Minimum 44px touch targets and visible keyboard focus outlines.
- **Explicit replacement dialog:** `src/components/shelf/ShelfReplaceDialog.tsx`
  - Accessible modal dialog (keyboard focus trap, `Escape` to cancel, focus restoration via `useModalDialogFocus`) shown when `selectShelfMonth` returns `shelfCapacityExceeded` (3 of 3 slots full).
  - Requires explicit reader selection of which existing Shelf month to replace; never silently evicts a protected month.
- **Presentation view:** `src/components/shelf/ShelfView.tsx`
  - Semantic landmarks (`<main>`, `<header>`, `<section>`, `<ul>`, `<li>`) and polite live region (`role="status"`, `aria-live="polite"`).
  - Dignified empty state for 0 months, independent active focus banner when `activeFocusMonth` is outside the Shelf (e.g. studied in Library), and typed `onRequestLibraryPicker` callback boundary.
- **State-injected host container:** `src/components/shelf/ShelfHost.tsx`
  - Supports controlled mode (`state` + `onStateChange`) and standalone ephemeral in-memory mode (`initialState`).
  - Ephemeral in-memory state is explicitly **not** durable storage (no `localStorage`, native store, or live account sync).
  - Routes all mutations through `selectShelfMonth`, `putAwayShelfMonth`, `setShelfMonthProtection`, `setActiveFocusMonth`, and `clearActiveFocusMonth` in `src/shelf/policy.ts`.
- **Responsive styling & exports:** `src/components/shelf/shelf.css`, `src/components/shelf/index.ts`

## Test Coverage

- **Unit & model tests:** `tests/shelfUI/shelfModel.test.ts` (6 tests via `node --experimental-strip-types --test tests/shelfUI/*.test.ts`)
  - 0-, 1-, 2-, and 3-month projections without empty-slot padding.
  - Exclusion of current/future months and detection of outside-Shelf deliberate focus.
  - `validateOpenShelfMonthTarget` and `filterHistoricalCandidateMonths` boundary enforcement.
  - Policy engine integration: invalid/current month rejection, protection toggling, capacity overflow rejection, explicit replacement, and focus preservation on Put Away.
- **Pure Shelf policy engine tests (unchanged baseline):** `tests/shelf/*.test.ts` (40 tests)
- **Isolated Playwright browser suite:** `tests/shelfUI/shelf-surface.spec.ts` (10 tests across Desktop Chrome and Pixel 5 mobile Chrome)
  - Empty state (0 slots), 1-, 2-, and 3-month states without fabricated content or 3 mandatory placeholders.
  - Current and future months excluded from candidate list and Shelf.
  - Protecting an auto-admitted month updates status and `aria-pressed`.
  - Capacity overflow opens the explicit replacement dialog; `Escape` cancels cleanly; explicit selection replaces only the chosen month.
  - Put Away removes Shelf membership while preserving independent active focus; `Open Month` invokes validated `onOpenMonth(yearMonth)`.
  - Typed `onRequestLibraryPicker` and `onExit` callbacks verified.
  - Mobile reflow (no horizontal overflow) and >= 44px touch targets verified.
  - Zero uncaught `pageerror`s and zero direct `api.sanity.io` requests.

## Verification Commands

- `npm run lint` — passed (0 errors, 0 warnings)
- `npm run build` — passed (`tsc -b && vite build`)
- `node --experimental-strip-types --test tests/shelf/*.test.ts` — 40 passed, 0 failed
- `node --experimental-strip-types --test tests/shelfUI/*.test.ts` — 6 passed, 0 failed
- `npx playwright test --config tests/shelfUI/playwright.config.ts` — 10 passed, 0 failed

## Known Limitations & Deferred Scope

- **Not wired into `src/App.tsx` or `src/appIntegration/**`:** Integration into the ordinary app shell, Library navigation, and Month Screen routing is intentionally deferred to the separate integration step (#158 / follow-up).
- **No durable persistence or account sync:** Standalone `ShelfHost` uses ephemeral in-memory state when uncontrolled; durable storage and guest/account Shelf merge remain separate follow-ups.
- **Deferred product UX:** Final Shelf protection wording, global navigation placement, first-post-rollover resume heuristics, and Hub Continue behavior remain deferred per November 8 §10.
