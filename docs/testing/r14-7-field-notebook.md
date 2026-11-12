# R14-7: Field Notebook Earned-Only Collection & Browsing Foundation

## Scope and Integration Status

- **Delivered module:** `src/components/notebook/**` (`fieldNotebookModel.ts`, `FieldNotebookView.tsx`, `FieldNotebookHost.tsx`, `fieldNotebook.css`, `index.ts`).
- **Normal-app entry status:** Intentionally **not** wired into `src/App.tsx` global navigation yet. Like R14-6 (`#117`), `src/App.tsx` still uses the prototype `Today | Foundations | Archive | More` navigation and does not yet expose an approved Hub/Shelf/Library IA or route boundary in `src/native/internalDestination.ts`. Instead, `FieldNotebookHost` is store-injected and verified against the real local guest store (`defaultGuestParticipationStore`) and synthetic fixtures via a dedicated Vite + Playwright harness (`tests/notebook/**`).
- **Read-only boundaries preserved:** `src/App.tsx`, `src/native/**`, `src/accountSync/**`, `src/participation/**`, `src/components/announcements/**`, `src/components/month/**`, `src/components/cards/**`, `src/gateway/**`, `studio/**`, `docs/project/current-status.md`, and `docs/product/application-development-roadmap.md` were left untouched.

## Earned-Only, Calendar, Search, and Viewer Guarantees

- **Earned-only projection:** `projectValidatedEarnedAwards` and `selectNotebookCardsForMonth` validate every `earnedAwards` entry against canonical `card:monthly:YYYY-MM:<slug>` identities, valid `LocalCalendarDate` (`earnedOn`), `cardDocumentId` consistency, and `validateEarnedCardSnapshot`. Malformed/duplicated keys or invalid snapshots never leak unvalidated URLs or crash the collection; genuinely earned records lacking valid snapshots remain visible with an honest unavailable-snapshot notice.
- **Publication-month vs earned-date fidelity:** Late-earned historical awards stay grouped under their original `publicationYearMonth` (e.g., `2024-02` even when `earnedOn` is `2026-11-12`), with both publication month and actual earned date displayed distinctly.
- **Year / 12-month browsing & future protection:** `buildNotebookYearEntries` renders all 12 UTC civil months (`January`–`December`) for a selected year, supports January↔December year transitions and leap-year February (`29` days in 2024 vs `28` in 2026), and renders future/unpublished months as neutral `Coming soon` entries with zero unpublished titles, discovery goals, artwork, or IDs.
- **All Earned Cards ordering:** Sorted newest-earned-first (`earnedOn` descending) with a deterministic canonical `awardId` ascending tie-breaker. No gray unearned slots or missing-event placeholders are created.
- **Metadata-only search & curated themes:** `filterNotebookCards` searches strictly across validated Card `title`, `scripture.book`, `scripture.reference`, and `theologicalThemes`, preserving deterministic ordering and earned dates without matching internal IDs or inventing tags.
- **Restrained lifetime participation display:** Uses `distinctCompletedChallengeCount(data)` so rereads do not inflate the count, without streaks, spiritual rankings, accumulating milestone badges, or unapproved fixed status titles.
- **Shared viewer & flag isolation:** Reuses `EarnedScriptureCardViewer` with `returnFocusRef` focus restoration and dispatches `markEarnedCardViewed` exclusively for the opened valid Card. Never dispatches `acknowledgeAwardAnnouncements` or mutates `hubAnnouncementAcked` or `earnedOn`.

## Deferred Dependencies & Minimal Future State Contract

1. **Hub "New Discoveries" clearing on Notebook open (`FIELD_NOTEBOOK_FUTURE_CONTRACT`):**
   - The approved November 8 behavior clears the Hub "New Discoveries" indicator when the Field Notebook opens, independently of individual `cardViewed` and `hubAnnouncementAcked` flags.
   - Because `ReaderParticipationData` (V2) currently has no Notebook-open acknowledgment field, `FieldNotebookHost` exposes an optional `onNotebookOpened?: () => void` hook and does **not** fake clearing by mass-marking `cardViewed` or calling `acknowledgeAwardAnnouncements`.
   - **Minimal future state contract (separate schema issue):** Add a monotonic `notebookOpenedMarker` (or per-award `notebookIndicatorAcked` / server-credible watermark) to `ReaderParticipationData` in a future schema PR, updated when `FieldNotebookHost` opens while keeping `cardViewed`, `hubAnnouncementAcked`, and `earnedOn` independent.
2. **Special Experiences & Tutorial/Foundation Card categories:**
   - Current V2 `earnedAwards` only supports `MonthlyAwardKind` (`'thematic' | 'fullMonth'`). No Special Experiences or Foundation Card categories are fabricated or shown as empty placeholders until a future issue introduces their persisted award schema.
3. **Final visual design & app-wide navigation integration:**
   - Final notebook artwork, lifetime status naming, and Hub/Notebook route wiring belong to Phase 05 IA and design-review assignments.

## Verification Results

All browser tests use the real local guest `ReaderParticipationStore` (`bibleberry-reader-participation-v1`), synthetic earned awards, mocked `cdn.sanity.io` image fulfillments (including `404` fallback), and `**/api/**` route interception confirming zero network API fetches.

| Check | Outcome | Scope |
| --- | --- | --- |
| `npm run lint` | Passed | ESLint across repository (`0` errors, `0` warnings) |
| `npm run build` | Passed | TypeScript `tsc -b` + Vite production build |
| `npm run check:staging` | Passed | Wrangler `--dry-run` staging bundle verification |
| `npm run test:adapter` | Passed (259 tests) | Adapter, participation, Card viewer, Hub announcements, and `fieldNotebook.test.ts` (7 tests) |
| `npm run test:native-participation` | Passed (15 tests) | Native Preferences / web storage V2 award persistence & migration |
| `npm run test:gateway` | Passed (101 tests) | Gateway handler, release eligibility, and earned-card projection |
| `npx playwright test -c tests/notebook/playwright.config.ts` | Passed (2 tests) | Real Chromium Field Notebook empty state, Year/Month + Jan/Dec + leap-year Feb 2024 browsing, All Earned Cards ordering, search/theme filter, `EarnedScriptureCardViewer` focus restoration & `markEarnedCardViewed` isolation, reload persistence, broken-image fallback, and 375px large-text reduced-motion layout |
| `npm run test:smoke` | Passed (49 tests across 7 passes) | Public (15), Dev Studio (4), Challenge Pilot (2), Participation Pilot (5), Released Challenge (7), Gateway Released (8), Month Screen + Card Viewer (8) |

Known test limitations:
- Field Notebook runs via `tests/notebook/**` standalone Vite + Playwright harness because `src/App.tsx` does not yet contain Hub/Shelf/Library/Notebook global navigation.
- Live Sanity CMS cards and real account-synced Hub "New Discoveries" indicator persistence remain outside R14-7 scope.
