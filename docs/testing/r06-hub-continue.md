# R06: Standalone Hub Continue Recommendation Engine & Presentation Boundary

## Overview & Scope

This document records the design, scope boundaries, and verification for the standalone **Hub Continue** recommendation engine (`src/hubContinue/`) and lightweight accessible presentation boundary (`src/components/hubContinue/`), implemented under GitHub Issue #177 per the November 8, 2026 Approved Reader Experience (§2, §6, §10) and Canonical Roadmap Phase 05.

### Write Ownership & Boundaries

- **Owned directories:** `src/hubContinue/**`, `src/components/hubContinue/**`, `tests/hubContinue/**`, and `docs/testing/r06-hub-continue.md`.
- **Untouched surfaces:** `src/App.tsx` (owned by another agent), existing Shelf/participation storage, app integration, gateway, authentication, CI, and the deferred first-post-rollover resume heuristic (`FirstPostRolloverResumeSeam` in `src/shelf/policy.ts`).

---

## Recommendation Engine Rules (`deriveHubContinueSuggestion`)

1. **At most one unobtrusive suggestion:** Returns a single `HubContinueSuggestion` or `null` (`status: 'none'`).
2. **Strict priority order:**
   - **Priority 1 (`inProgressInActiveFocus`):** Unfinished, in-progress Challenge in the reader's explicitly active historical focus (`shelfState.activeFocusMonth`), ordered by most recent `updatedOn` then earliest `dayOfMonth`.
   - **Priority 2 (`nextUnfinishedInActiveFocus`):** Next unfinished available Challenge in that same active historical focus (earliest `dayOfMonth`).
   - **Priority 3 (`nextEligibleMonthAfterCompletedFocus`):** If the active focus month is complete (at least one eligible available Challenge and zero unfinished Challenges), selects the next eligible unfinished historical month on the Shelf **without silently changing formal `activeFocusMonth`** (`preservesFormalFocus: true`, `formalFocusMonth` retained).
   - **Priority 4 (`none`):** Otherwise returns no suggestion (`noActiveFocus`, `activeFocusNotHistorical`, `activeFocusUnavailable`, `allEligibleMonthsComplete`, `invalidReferenceMonth`, or `malformedInput`).
3. **Released & authorized content only:**
   - Requires an authoritative `referenceCurrentYearMonth` or `serverContext.authorizedLocalDate` (never reads device clock).
   - Requires `monthDetail.phase === 'historical'` and strictly historical `yearMonth < referenceCurrentYearMonth`.
   - Requires `slot.availability === 'available'` with valid canonical `cms:<id>` and non-empty `slug`.
   - When `releasedCatalog` is supplied, cross-checks `documentId`, `slug`, and `calendarSlot.monthId`.
4. **Separation & non-punitive design:**
   - Ignores `lastOpenedChallenge` so incidental Library browsing never redirects formal focus.
   - Emits no missed-day backlogs, streaks, attendance scoreboards, or achievement prompts.

---

## Automated Verification

### 1. Engine Unit Tests (`node --experimental-strip-types --test tests/hubContinue/hubContinueEngine.test.ts`)
Covers:
- Empty Shelf and null `activeFocusMonth`
- In-progress Challenge prioritization in active historical focus
- Next unfinished available Challenge selection (skipping `unavailable` and `comingSoon` slots)
- Cross-month Shelf fallback when active focus is complete, preserving formal `activeFocusMonth`
- All eligible Shelf months complete
- Separation from incidental Library browsing (`lastOpenedChallenge`)
- Rejection of current/future months, non-historical `phase`, drafts, and catalog mismatches
- Fail-closed handling of missing/invalid `referenceCurrentYearMonth` and `serverContext.authorizedLocalDate`
- Safe tolerance of malformed inputs without throwing

### 2. Browser, Accessibility & Mobile Reflow Tests (`npx playwright test --config=tests/hubContinue/playwright.config.ts`)
Runs across both `chromium` (Desktop Chrome) and `mobile-chrome` (Pixel 5) projects against the isolated harness at `tests/hubContinue/harness/index.html`:
- Empty and unavailable states render zero DOM nodes
- Incomplete active-focus state renders `Continue Historical Study`, `Resume` / `View Month` buttons (`>= 44x44px` touch targets), and fires typed callbacks
- Keyboard navigation (`Tab`, `Enter`, `Space`) activates both callbacks
- Cross-month fallback renders `Continue From Your Shelf` with `data-preserves-formal-focus="true"` and reflows at `320px` viewport width with zero horizontal overflow (`scrollWidth <= clientWidth`) and stacked non-overlapping buttons

### 3. Build & Lint
- `npm run lint`
- `npm run build`
