# Screen & Flow Inventory — R06 Connected Experience Prototype (Glass Atlas)

Maps all screens, overlays, modals, and navigation transitions implemented in `docs/prototypes/r06-connected-experience/` to the governing [Consolidated Approved Reader Experience Specification](../../product/2026-11-08-approved-reader-experience-and-month-screen.md).

## 1. Global Navigation & Shell (§2.1, §2.3, §1.2)

| Prototype Component / Flow | Code Location | Governing Spec Section | Behavior Summary |
|---|---|---|---|
| Persistent 4-tab global navigation (`Today \| Library \| Collections \| More`) | `js/app.js` (`renderGlobalNav`), `css/styles.css` | §2.1, §10.3 | Bottom bar `< 840px`; left persistent navigation rail `>= 840px` paired with centered vertical main column (`max-width: 41rem`); no `Archive` or `My Journey` tab. |
| Per-tab nested route & scroll restoration | `js/state.js` (`selectTab`, `saveCurrentTabScroll`) | §2.3 | Switching primary tabs saves/restores each tab's active nested screen and scroll offset without altering Shelf, Active Focus, or participation state. |
| Re-selecting active primary tab | `js/state.js` (`selectTab`) | §2.3 | Tapping the already-active tab resets that destination to its main landing view at top scroll (`0`). |
| Focused reading hides global navigation | `js/app.js` (`hideNav = !!state.activeOverlay`) | §2.1, §5.1 | Global nav hidden during Challenge/Foundation Reader, App Introduction, Monthly Introduction, and External Unavailable fallback. |

## 2. Today (Hub) Destination (§3.1–§3.4, G01, G02, G08)

| Screen / Element | Code Location | Governing Spec Section | Behavior Summary |
|---|---|---|---|
| Today landing — Primary Current Teaching | `js/views-today.js` (`renderTodayLanding`) | §3.1, G05 | Direct open to today's released Challenge (no Monthly Intro detour); `Resume Today's Reading` when partially read; `Completed` + `Read Again` after `Finish`; neutral unavailability notice + `Explore This Month` fallback when today is unavailable. |
| Single secondary `Continue Your Study` strip | `js/state.js` (`getTodayContinuation`), `js/views-today.js` | §3.2, G01, G02 | Immediately beneath primary teaching. Strict precedence: (1) Explicit Active Focus (completed → `Review This Month`; unfinished saved Challenge → direct resume; no resumable Challenge → Active Focus Month Screen); (2) One-time post-rollover prior-month interrupted reading (only when no Active Focus); (3) None. Never two continuation cards. |
| Separate Compact Current Month Link | `js/views-today.js` | §3.1 | Always discoverable link to current Month Screen; never embeds a calendar grid on `Today`. |
| Advance Preview Card (28th / Feb 27) | `js/views-today.js`, `js/state.js` (`getAdvancePreviewYearMonth`) | §4.3 | Surfaces upcoming month preview on the 28th of the preceding month or February 27. |
| Hub-only Combined Inline Earned-Card Announcement | `js/views-today.js`, `js/state.js` (`dismissHubAnnouncement`, `openViewDiscoveries`) | §3.3 | Shown only on `Today` for unannounced earned Cards; subordinate to today's teaching; `Dismiss` acks batch only without clearing `New Discoveries` or per-Card `New`. |
| Focused `View Discoveries` Gallery | `js/views-today.js` (`renderViewDiscoveries`) | §3.3 | Shows only the specific newly earned Cards referenced by the Today announcement, with `Browse Full Field Notebook` and `Back to Today`. Clears `New Discoveries` indicator while preserving per-Card `New` until full Card open. |
| Optional Dismissible Guest Account Invitation | `js/views-today.js`, `js/state.js` (`isGuestInviteEligible`) | §3.4 | Appears only after 3 distinct finished Challenges, never simultaneously with pending earned-Card announcements, permanently suppressed on explicit `Continue as Guest`. |
| G08 Post-Verified Account Merge Confirmation | `js/views-today.js` | §9.3, G08 | Single brief inline confirmation shown once only after verified simulated merge; includes existing-account Shelf precedence sentence only when a real Shelf conflict occurred. |
| Restrained Editorial Ministry News Shortcut | `js/views-today.js` | §3.4, §8.2 | Shares the same editorial feed as `More`; opens article detail with return to `Today`; zero fabricated unread badges. |

## 3. Month Screen, Monthly Introduction & Challenge Reader (§4.1–§4.3, §5.1–§5.3, G04, G05)

| Screen / Element | Code Location | Governing Spec Section | Behavior Summary |
|---|---|---|---|
| Month Screen (Current, Historical & Preview) | `js/views-month.js` (`renderMonthScreen`) | §4.1, §4.2, §4.3, §6.2 | Header with theme, completed/total ticker, persistent `Read Monthly Introduction` (or `Preview Introduction`), historical `Add to Shelf` action, continuously vertically scrollable Mon–Sun weekly agenda panels (all weeks on one scroll), accessible status badges + text, future titles visible but untappable, and compact progress-first Monthly Discoveries below the agenda (withheld during preview; unearned title + progress only; earned opens full Card directly; full-month Card last). |
| Monthly Introduction / Welcome Overlay | `js/views-overlays.js` (`renderMonthlyIntro`) | §4.3, G05 | Triggers on first intentional Month Screen visit (not before direct `Today` or external Challenge). Ends with *"Welcome to [MONTH'S THEME]"*. Advance preview withholds Welcome screen; previously previewed readers receive `Skip to Welcome` when month begins. |
| Focused Challenge & Foundation Reader | `js/views-overlays.js` (`renderChallengeReader`) | §5.1, §5.2 | Hides global nav; header with explicit seamless `Exit`, `Screen X of Y`, and subtle progress bar; readable long-form text; `Save Scripture` toggle; optional `<details>` study/prayer blocks; `Previous`/`Next` + optional horizontal swipe; `Start from Beginning` (resets position only); prominent explicit `Finish` on final screen (idempotent, completion boundary only). |
| Authorized External Challenge Ingress & Unavailable Fallback | `js/state.js` (`launchExternalDeepLink`), `js/views-overlays.js` (`renderExternalUnavailable`) | §5.3, §9.1, G04-A, G04-B | Released external link opens directly before App Intro/Tutorial/Monthly Intro while keeping onboarding `pending`; `Exit`/`Finish` always returns to `Today` (even for historical Challenges). Embargoed/withdrawn/invalid links fail closed neutrally with `Return to Today` and zero leaked metadata. |

## 4. Library, Shelf, Historical Catalogue & Foundations (§6.1–§6.5, G03)

| Screen / Element | Code Location | Governing Spec Section | Behavior Summary |
|---|---|---|---|
| Library Landing (Shelf-Centered) | `js/views-library.js` (`renderLibraryLanding`) | §6.1, §6.3, G03 | Welcoming 0-month empty state or 1–3 editorial Shelf cards ordered Active Focus first then newest-to-oldest. Distinct `Active Focus` (`Set as Active Focus`/`Clear Focus`) and `Kept on Shelf` (`Keep on Shelf` → `Kept on Shelf`) badges/actions; `Open Month`, `Put Away`; persistent `Browse All Months` and `Foundations` entrances. |
| Full-Shelf 4th-Month Replacement Chooser Modal | `js/views-overlays.js` (`renderModal`: `shelf-replace`) | §6.2 | Two-step in-place chooser + explicit confirmation when adding a 4th month from Library or historical Month Screen; prompts Active Focus reassign if replacing Active Focus; `Cancel` changes nothing. |
| Put Away Active Focus Modal | `js/views-overlays.js` (`renderModal`: `put-away-focus`) | §6.2 | Prompts explicit selection of another Shelf month or no focus for now when putting away the Active Focus month; preserves all reading/Card data. |
| `Browse All Months` Historical Catalogue | `js/views-library.js` (`renderBrowseAllMonths`) | §6.4 | Expandable chronological years (most recent expanded by default), compact editorial month/theme rows, month/theme search producing unified newest-first flat list across all years, `Load More` pagination, plus loading/empty/error/retry and no-results states. |
| `Foundations` Overview | `js/views-library.js` (`renderFoundationsOverview`) | §6.5 | Opens to overview first (never auto-launches); conditional primary `Resume Reading` when a valid resumable reading exists vs `Begin with the First Reading`; safe unavailable-reading modal fallback. |

## 5. Collections, Field Notebook & Saved Scripture (§7.1–§7.4, G07)

| Screen / Element | Code Location | Governing Spec Section | Behavior Summary |
|---|---|---|---|
| `Collections` Landing | `js/views-collections.js` (`renderCollectionsLanding`) | §7.1 | Small preview of up to 3 genuinely earned Cards (or calm empty state, no gray silhouettes; never clears `New`) + entrances to `Field Notebook` (with `New Discoveries` badge when set) and `Saved Scripture`. |
| `Field Notebook` Overview | `js/views-collections.js` (`renderFieldNotebook`) | §7.2, G07 | Approved top-to-bottom hierarchy: (1) Top lifetime participation status; (2) `Search Your Cards` over earned Cards only (compact illustrated rows); (3) Publication year → 12 months browse (unpublished future months neutral Coming Soon); (4) `All Earned Cards`; (5) Conditional `Foundations & Learning` (visible only when >= 1 earned); (6) Conditional `Special Experiences` (visible only when >= 1 earned, no `Special Collections` parent). |
| Earned Galleries (Monthly, All Earned, Foundations & Learning, Special Experiences) | `js/views-collections.js` | §7.2, G07 | Illustrated thumbnail grids; `All Earned Cards` sorted newest actual earned date first across all sources; `Special Experiences` grouped by originating event with zero missed-event slots. |
| Full Single-Scroll Earned Scripture Card View & Share Modal | `js/views-collections.js` (`renderFullCard`), `js/views-overlays.js` (`share-card`) | §7.3 | Illustration (or honest unavailable-art fallback) + Scripture text + explanation + earned date on one uninterrupted scroll. Clears that Card's `New` marker. `Share Scripture Card` offered only here, rendering export-time Bibleberry attribution without altering the in-app Card. |
| `Saved Scripture` Collection | `js/views-collections.js` (`renderSavedScripture`) | §7.4 | Independent collection defaulting to recently saved first, with `Browse by Bible Book`, search over reference/book/text, remove control, and calm empty/no-results states. |

## 6. More, Ministry News, Preferences, Onboarding & Account Simulation (§8.1–§8.4, §9.3, G06, G08)

| Screen / Element | Code Location | Governing Spec Section | Behavior Summary |
|---|---|---|---|
| `More` Landing | `js/views-more.js` (`renderMoreLanding`) | §8.1 | Ministry-first overview with featured latest update (direct open → `Back`) above `View All News`, `Podcasts & Resources`, `About Bibleberry`, `Appearance & Settings`, `Account & Progress`, `Review Introduction`, and `App Tutorial`. |
| `View All News` & News Detail | `js/views-more.js` (`renderNewsList`, `renderNewsDetail`) | §8.2 | Unified newest-first editorial feed with CMS categories (`All News`, `Ministry Updates`, `Announcements`, `Monthly Previews`), loading/empty/error/retry states, authorized `#/month/YYYY-MM` link check, and origin-aware `Back`. |
| `Appearance & Settings` | `js/views-more.js` (`renderAppearanceSettings`) | §8.3, §3.3 | `Follow Bibleberry Seasons` (default) vs `Choose My Colors` (persists across seasonal date transitions), separate `Light`/`Dark`/`System` contrast mode, text size scaling, reduced motion, and earned-Card announcement opt-out (with combined catch-up on re-enable). |
| `Account & Progress` & Simulated Merge Modal | `js/views-more.js` (`renderAccountProgress`), `js/views-overlays.js` (`account-merge`) | §9.3, G08 | Honest device-local guest disclosure, persistent entry even after dismissing `Today` invite, and simulated Authenticating → Reconciling → Verified Success (with/without real Shelf conflict) or Partial Failure + Safe Retry. |
| App Introduction (3-screen) & Guided App Tutorial (4-step) | `js/views-overlays.js` (`renderAppIntro`, `renderTutorialOverlay`) | §8.4, G06, G07 | Coordinated at ordinary first use; independent completed/skipped/pending/replay states; `More` replay returns to `More` without losing progress; skippable spotlight tied to visible nav controls with accessible nonvisual card; awards zero Scripture Cards. |
