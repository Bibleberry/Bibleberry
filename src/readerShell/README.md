# R06 reader shell

Set `VITE_ENABLE_R06_SHELL=true` when starting Vite or building the reader. `src/main.tsx` selects the R06 composition inside the existing BrowserRouter. The default entry still mounts the legacy App. R06 enables the host routes below as a group. Providers use the existing release gateway configuration.

| Destination | Route | Mounted behavior |
| --- | --- | --- |
| Today | `#/` | Minimal landing. Open this month sends the browser’s civil year and month as a lookup key to Month Screen. The gateway still determines availability. The WP-04 Today projection is pending. |
| Library | `#/shelf`, `#/library` | The existing durable Shelf and historical catalogue via `AppLibraryShelfHost` → `LibraryShelfHost`. Foundations opens an unavailable screen while its reader and the WP-05b Library landing are pending. |
| Month | `#/month/:yearMonth` | `MonthScreenHost` opens from an in-session Today, Shelf, catalogue, or News action. It owns calendar, introduction, progress and earned Cards. A cold Month hash without a matching session receipt follows Maple Meridian’s unavailable path. |
| Collections | `#/collections`, `#/notebook`, `#/saved-scripture` | `FieldNotebookHost` and `SavedScriptureHost` use the accepted guest participation store. Cross-tab visits retain their host views. |
| More | `#/more`, `#/news` | `NewsReaderHost` uses the existing gateway feed and supports category hashes and authorized Month destinations. The remaining More features are pending. |
| Challenge | `#/challenge/:slug` | Neutral unavailable state for browser ingress, with Return to Today. Month actions open a session-only unavailable screen with Back to Month. Focused Challenge, gateway authorization for Challenge ingress, and native ingress integration are pending. |

The Maple Meridian adapter owns all R06 history effects, including browser traversal and restoration. Its tab session uses `bibleberry-r06-navigation-v1` in sessionStorage. Hosts own their persistence and nested interactions. The shell hides primary navigation while the Month host shows its Introduction or an active host shows a modal.

The Shell Integrator owns `tests/readerShell/playwright.config.ts` for scoped WP-02b browser checks. It exercises the actual Vite entry with the R06 flag enabled and disabled, and intercepts gateway calls with synthetic test fixtures. Live gateway, M1a, and G09 acceptance are pending.

```sh
node --experimental-strip-types --test tests/readerShell/*.test.ts
npx playwright test --config tests/readerShell/playwright.config.ts
```
