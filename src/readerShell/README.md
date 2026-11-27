# R06 reader shell

Set `VITE_ENABLE_R06_SHELL=true` when starting Vite or building the reader. `src/main.tsx` selects the R06 composition inside the existing BrowserRouter. The default entry still mounts the legacy App. R06 enables the host routes below as a group. Providers use the existing release gateway configuration.

| Destination | Route | Mounted behavior |
| --- | --- | --- |
| Today | `#/` | `TodayHost` loads the gateway-authorized current Month (`loadAuthorizedTodayMonth`, bounded month-boundary recovery), subscribes to durable guest participation and Shelf state, and projects primary teaching, a compact Current Month link, and at most one secondary historical continuation via `deriveTodayPrimaryAction` and `deriveHubContinueSuggestion`. |
| Today announcements | `#/` (session-only `viewDiscoveries` entry) | Coastal Osprey (#322): `TodayCardAnnouncement` reuses the R14-6 batch controller to show one dismissible inline notice per Today visit for every pending earned Card, below today's teaching. No other screen renders it. Dismissing or opening `View Discoveries` acknowledges only that batch (`hubAnnouncementAcked`). `ViewDiscoveriesGallery` shows only the batch's award IDs, clears New Discoveries via `acknowledgeNotebookEntry`, and marks a Card viewed only when its full view opens. `Browse Full Field Notebook` opens Collections → Field Notebook. More holds the announcement opt-out; switching it back on gives one catch-up notice on the next Today visit. |
| Library | `#/shelf`, `#/library` | The existing durable Shelf and historical catalogue via `AppLibraryShelfHost` → `LibraryShelfHost`. Foundations opens an unavailable screen while its reader and the WP-05b Library landing are pending. |
| Month | `#/month/:yearMonth` | `MonthScreenHost` opens from an in-session Today, Shelf, catalogue, or News action. It owns calendar, introduction, progress and earned Cards. A cold Month hash without a matching session receipt follows Maple Meridian’s unavailable path. |
| Collections | `#/collections`, `#/notebook`, `#/saved-scripture` | `FieldNotebookHost` and `SavedScriptureHost` use the accepted guest participation store. Cross-tab visits retain their host views. |
| More | `#/more`, `#/news` | `NewsReaderHost` uses the existing gateway feed and provides the featured article and the same filtered index reached from Today. In-session article return preserves the originating view. More also offers About and Introduction replay. Resources, Appearance, Account, and the App Tutorial show availability states pending their integrations. |
| Challenge | `#/challenge/:slug`, `/challenge/:slug` | Focused `ReleasedChallengeHost` requires gateway detail and hides the global navigation. Month selections bind the selected document ID. Reload and browser traversal reauthorize before displaying teaching. Cold and warm external Challenge links authorize before first-use onboarding, leave `introStatus` and `tutorialStatus` pending, and return to Today on Exit or Finish. |
| First-use guidance | `#/` (session-replaced `intro` / `tutorial` frames) | Ordinary fresh launches evaluate `bibleberry-reader-profile-v1` (`src/readerShell/entry/`), showing the 3-screen `ReplayableOnboarding` Introduction (`first-use` mode) followed by the optional Guided Tutorial seam (#324 Radiant Eclipse) before Today, and re-offering deferred onboarding on the next ordinary fresh launch after external Challenge ingress. |

The Maple Meridian adapter owns all R06 history effects, including browser traversal and restoration. Its tab session uses `bibleberry-r06-navigation-v1` in sessionStorage. Hosts own their persistence and nested interactions. The shell hides primary navigation while the Month host shows its Introduction or an active host shows a modal.

An in-session host, including the Today host, opens authorized selections with `send({ type: 'openChallenge', slug, expectedDocumentId })`. Supply the base document ID from the gateway projection. The reducer derives the origin from the active screen. Exit preserves unfinished progress. An explicit first Finish returns after the completion write succeeds. A completed reread uses the existing credit. Browser receipts restore the Month, scroll, and focus when available. External Challenge URLs validate through `src/deepLinkIngress/` and capability admission; platform-native OS ingress/Back bindings remain deferred to installed beta.

The Shell Integrator owns `tests/readerShell/playwright.config.ts` for scoped WP-02b browser checks. It exercises the actual Vite entry with the R06 flag enabled and disabled, and intercepts gateway calls with synthetic test fixtures. Live gateway, M1a, and G09 acceptance are pending.

```sh
node --experimental-strip-types --test tests/readerShell/*.test.ts
npx playwright test --config tests/readerShell/playwright.config.ts
```
