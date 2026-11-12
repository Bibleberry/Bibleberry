# R05-UI-1: Controlled App-Shell Integration

## Scope and Architectural Boundaries

- **Issue:** Bibleberry GitHub Issue #132 (`R05-UI-1: Controlled App-Shell Integration`).
- **Core Objective:** Connect the accepted standalone Field Notebook (PR #127, Issue #118), Saved Scripture collection (PR #125, Issue #115), and Hub-only combined earned-card announcement system (PR #117, Issue #116) to the ordinary Bibleberry application shell using controlled, feature-gated routes and existing V2 guest participation storage.
- **Write Ownership:**
  - `src/App.tsx`: App shell route dispatcher, lazy module hosts, arrival/return boundary management, Hub "New Discoveries" indicator state, and appearance preferences.
  - `src/appIntegration/**`:
    - `appRoutes.ts`: Feature-gate environment checkers, canonical hash constants, and bidirectional route parser/builders.
    - `ProvisionalCollectionsEntryBar.tsx`: Accessible, provisional collection entry bar rendered on primary views (Hub / Foundations / Archive / More).
    - `provisionalCollections.css`: Scoped styling for provisional entry buttons and the "New" indicator.
    - `index.ts`: Clean barrel exports.
  - `tests/sanity/appIntegrationRoutes.test.ts`: Node-based route parsing and feature-gate sanity suite.
  - `tests/appIntegration/**`: Dedicated Vite + Playwright integration harness (`playwright.config.ts`, `app-shell-integration.spec.ts`).
  - `docs/testing/r05-ui-1-controlled-app-shell-integration.md`: Scoped verification and architecture documentation.
- **Read-Only Invariants Preserved:**
  - `src/components/notebook/**`, `src/components/savedScripture/**`, `src/components/announcements/**`, `src/components/month/**`, `src/participation/**`, `src/accountSync/**`, `src/components/library/**`, `src/gateway/**`, and `studio/**` were left completely untouched.
  - Zero modifications to shared `main` branch or other agents' active worktrees.
  - Global navigation tabs (`Today | Foundations | Archive | More`) preserved without unauthorized redesign or pre-empting the Phase 05 Information Architecture decision.

---

## Route Architecture and Provisional Entry Bar

### 1. Controlled Hash Routes and Aliases
- **Field Notebook:** Canonical route `#/notebook` (with backward-compatible alias `#/field-notebook`).
- **Saved Scripture:** Canonical route `#/saved-scripture` (with backward-compatible alias `#/savedScripture`).
- **Existing Routes Preserved:**
  - Month Screen: `#/month`
  - Challenge Player: `#/challenge/:slug` (and legacy pilot `#/interactive-lab`)
  - Dev Studio: `#/studio`
  - Daily Reading: `#/read`
  - Foundations, Archive, More, Appearance, About, Help.

### 2. Feature Gates
The integration operates under strict compile-time/runtime feature gates:
- `VITE_ENABLE_FIELD_NOTEBOOK`: Controls Field Notebook route and provisional entry affordance.
- `VITE_ENABLE_SAVED_SCRIPTURE`: Controls Saved Scripture route and provisional entry affordance.
- `VITE_ENABLE_HUB_CARD_ANNOUNCEMENTS`: Controls the Hub-only earned-card announcement boundary. Defaults to enabled (`true`) when Field Notebook is enabled, unless explicitly set to `'false'`.
- **Fails Closed:** When a gate is disabled, navigating directly to the hash route redirects immediately to the home view (`Today`) without rendering the unreleased view or leaking internal state.

### 3. Provisional Entry Bar (`ProvisionalCollectionsEntryBar`)
- To avoid prematurely freezing global navigation or redesigning the bottom tab bar before Aaron's formal IA review, collections are exposed via an accessible, secondary top bar (`nav[aria-label="Collections and notes"]`).
- Each entry button clearly identifies its destination:
  - **Saved Scripture:** "Saved Scripture" button with icon and accessible label.
  - **Field Notebook:** "Field Notebook" button displaying the "New Discoveries" indicator badge whenever eligible unviewed/unopened awards exist.
- **Documentation for Future Information Architecture:** This entry bar is explicitly provisional. During Phase 05 design review, it can be migrated to Shelf/Library, bottom tabs, or profile destinations without modifying the underlying route adapters or collection host components.

---

## Earned-Card Announcements and Hub Boundary Guarantees

### 1. Hub Arrival/Return-Only Boundary
- The combined earned-card announcement system (`HubCardAnnouncementBoundary`) mounts **strictly on Hub arrival/return** (`view === 'today' && !detail`).
- **Never mounted:**
  - During reading or inside challenge players.
  - Immediately upon finishing a challenge (the finish screen preserves its normal flow).
  - When returning from a challenge or detail view to non-Hub views (e.g., Foundations, Month Screen, or More).

### 2. Opt-Out Honor and Persistence
- Users can disable earned-card announcement dialogs via the toggle in `AppearanceView` (`CardAnnouncementPreferenceControl`).
- The opt-out preference is read directly from `ReaderParticipationData.preferences.cardAnnouncementsEnabled` in the local guest participation store.

### 3. Three-Way Award Flag Isolation
The implementation strictly preserves the three distinct award interaction states defined in the November 8 approved reader experience:
1. `hubAnnouncementAcked`: Set to `true` when the user acknowledges the Hub announcement dialog (clicking "Continue" or "Open in Notebook").
2. `cardViewed`: Remains `false` until the user individually inspects the card in `EarnedScriptureCardViewer`. Acknowledging the announcement dialog or opening the Field Notebook never mass-marks cards as viewed.
3. **Hub "New Discoveries" Indicator:** Cleared when the Field Notebook is opened via the `onNotebookOpened` callback (tracked in app shell state via `clearedAwardIds`), removing the badge on the Hub while leaving individual `cardViewed` and `hubAnnouncementAcked` flags completely untouched.

---

## Direct Reload, Browser History, and Return Navigation

- **Direct Route Reloading:** Refreshing `#/notebook` or `#/saved-scripture` directly restores the user to the requested collection view with full data projection from `bibleberry-reader-participation-v1`.
- **Browser History (`popstate`):** Browser Back and Forward buttons correctly transition between collections, Hub, Month Screen, and Challenge routes without desynchronizing internal view state.
- **Return Navigation:**
  - Closing Field Notebook or Saved Scripture returns the user to their origin view (defaulting to `today`).
  - Closing Challenge player respects `returnedChallengeOrigin` (e.g., returning to `month` if opened from Month Screen, or `today` if opened from Hub).

---

## Verification Results

### All Test Suites Executed

| Test Suite | Command | Outcome | Scope |
| --- | --- | --- | --- |
| ESLint | `npm run lint` | **Passed** (0 errors, 0 warnings) | Repository-wide linting and React hook validation |
| TypeScript & Production Build | `npm run build` | **Passed** | `tsc -b && vite build` (verified clean code-split chunks for collections and announcements) |
| Route Unit & Gate Sanity | `node --test tests/sanity/appIntegrationRoutes.test.ts` | **Passed** (5 tests) | Route parsing, aliases, gate failure-closed, malformed hash rejection |
| Native Participation Store | `npm run test:native-participation` | **Passed** (15 tests) | Local guest store V2 award persistence, migration, and preferences |
| Gateway Released & Projection | `npm run test:gateway` | **Passed** (112 tests) | Content gateway, challenge validation, and earned-card projection |
| Adapter & Unit Suites | `npm run test:adapter` | **Passed** (275 tests) | Adapter, participation, Card viewer, Hub announcements, and notebook models |
| Standalone Collections Harness | `npm run test:collections` | **Passed** (5 tests) | Saved Scripture and Notebook standalone Playwright tests |
| **App-Shell Integration Browser Suite** | `npx playwright test -c tests/appIntegration/playwright.config.ts` | **Passed** (6 tests in 12.7s) | Comprehensive browser integration across feature flags, routes, Hub announcements, and navigation |
| Ordinary Reader Regression Smoke Suite | `npm run test:smoke` | **Passed** (49 tests across 7 passes) | Full multi-pass production bundle smoke matrix (Public, Dev Studio, Challenge Pilot, Participation Pilot, Released Challenge, Gateway Released, Month Screen + Card Viewer) |

### App-Shell Integration Browser Test Details (`tests/appIntegration/app-shell-integration.spec.ts`)
1. **Field Notebook integration:** Navigates via provisional entry bar and `#/notebook`, clears Hub "New Discoveries" badge on open, views individual card, restores focus, and returns to origin view.
2. **Saved Scripture integration:** Navigates via provisional entry bar and `#/saved-scripture`, removes saved citation via confirmation dialog, verifies persistent storage, and returns.
3. **Hub earned-card announcement boundary:** Confirms announcement modal appears *only* upon Hub arrival, honors "Open in Notebook" navigation, marks announcement acked, and respects appearance opt-out preference.
4. **Feature-gate safety:** Verifies that when `VITE_ENABLE_FIELD_NOTEBOOK=false` and `VITE_ENABLE_SAVED_SCRIPTURE=false`, direct hash navigation fails closed to Today and the provisional bar is omitted.
5. **Direct reload and history navigation:** Direct URL reload on `#/notebook` maintains state; browser Back/Forward transitions correctly between shell and collections.
6. **Accessibility & Responsive Layout:** 375px mobile viewport layout renders with accessible touch targets, correct heading levels, and complete keyboard focus flow.
