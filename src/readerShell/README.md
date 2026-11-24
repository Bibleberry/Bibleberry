# R06 reader shell

Set `VITE_ENABLE_R06_SHELL=true` when starting Vite or building the reader. `src/main.tsx` selects the R06 composition inside the existing BrowserRouter. The default entry still mounts the legacy App. R06 enables the host routes below as a group. Providers use the existing release gateway configuration.

| Destination | Route | Mounted behavior |
| --- | --- | --- |
| Today | `#/` | `TodayHost` loads the gateway-authorized current Month (`loadAuthorizedTodayMonth`, bounded month-boundary recovery), subscribes to durable guest participation and Shelf state, and projects primary teaching, a compact Current Month link, and at most one secondary historical continuation via `deriveTodayPrimaryAction` and `deriveHubContinueSuggestion`. |
| Library | `#/shelf`, `#/library` | The existing durable Shelf and historical catalogue via `AppLibraryShelfHost` → `LibraryShelfHost`. Foundations opens an unavailable screen while its reader and the WP-05b Library landing are pending. |
| Month | `#/month/:yearMonth` | `MonthScreenHost` opens from an in-session Today, Shelf, catalogue, or News action. It owns calendar, introduction, progress and earned Cards. A cold Month hash without a matching session receipt follows Maple Meridian’s unavailable path. |
| Collections | `#/collections`, `#/notebook`, `#/saved-scripture` | `FieldNotebookHost` and `SavedScriptureHost` use the accepted guest participation store. Cross-tab visits retain their host views. |
| More | `#/more`, `#/news` | `NewsReaderHost` uses the existing gateway feed and provides the featured article and the same filtered index reached from Today. In-session article return preserves the originating view. More also offers About and Introduction replay. Resources, Appearance, Account, and the App Tutorial show availability states pending their integrations. |
| Challenge | `#/challenge/:slug` | Focused `ReleasedChallengeHost` requires gateway detail and hides the global navigation. Month selections bind the selected document ID. Reload and browser traversal reauthorize before displaying teaching. A verified external Challenge returns to Today on Exit or Finish. |

The Maple Meridian adapter owns all R06 history effects, including browser traversal and restoration. Its tab session uses `bibleberry-r06-navigation-v1` in sessionStorage. Hosts own their persistence and nested interactions. The shell hides primary navigation while the Month host shows its Introduction or an active host shows a modal.

An in-session host, including the planned Today host, opens authorized selections with `send({ type: 'openChallenge', slug, expectedDocumentId })`. Supply the base document ID from the gateway projection. The reducer derives the origin from the active screen. Exit preserves unfinished progress. An explicit first Finish returns after the completion write succeeds. A completed reread uses the existing credit. Browser receipts restore the Month, scroll, and focus when available. Native ingress integration is pending.

The Shell Integrator owns `tests/readerShell/playwright.config.ts` for scoped WP-02b browser checks. It exercises the actual Vite entry with the R06 flag enabled and disabled, and intercepts gateway calls with synthetic test fixtures. Live gateway, M1a, and G09 acceptance are pending.

```sh
node --experimental-strip-types --test tests/readerShell/*.test.ts
npx playwright test --config tests/readerShell/playwright.config.ts
```
