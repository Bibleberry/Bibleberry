# Bibleberry — Connected R06 Reader Experience Prototype (Glass Atlas)

> **Status:** Isolated interactive UX acceptance prototype (Issue [#265](https://github.com/Bibleberry/Bibleberry/issues/265)).  
> **Governing specification:** [Consolidated Approved Reader Experience, Navigation & Acceptance Specification](../../product/2026-11-08-approved-reader-experience-and-month-screen.md) (updated by Paper Compass [PR #264](https://github.com/Bibleberry/Bibleberry/pull/264)).  
> **Scope boundary:** This deliverable provides **prototype UX acceptance evidence only**. It does **not** alter the production reader application (`src/`), Sanity schemas/Studio, Cloudflare release gateway, Supabase auth/sync, CI workflows, or native projects, and it is **not** integrated internal-alpha acceptance.

---

## 1. Launch Instructions

No backend services, credentials, environment variables, package installations, or build steps are required.

### Option A — Open directly in a browser (`file://`)
1. Open [`index.html`](./index.html) directly in Chrome, Safari, Edge, or Firefox from a local checkout.
2. All CSS and classic JavaScript files load locally with zero network dependencies.

### Option B — Serve locally over HTTP (recommended for bookmarks & automated testing)
From the repository root:

```bash
python3 -m http.server 4173 --directory docs/prototypes/r06-connected-experience
```

Then visit `http://127.0.0.1:4173/` (or jump directly to any scenario via `?scenario=<id>`, e.g., `http://127.0.0.1:4173/?scenario=g09-1-normal-first-use`; add `&workbench=hidden` for a reviewer-free consumer view).

---

## 2. Navigating the Prototype & Reviewer Workbench

- **Consumer Application Shell:** Uses the exact approved four-destination persistent navigation in order: **`Today | Library | Collections | More`** (bottom bar on phones `< 840px`; left persistent navigation rail with centered vertical composition on tablet landscape/desktop `>= 840px`; hidden during focused Challenge reading, App Introduction, and Monthly Introduction).
- **Reviewer Workbench (top dark bar, clearly outside consumer UI):**
  - **Scenario dropdown:** Instantaneously switches between all **8 G09 Acceptance Journeys** and **6 Edge / Negative State Presets**.
  - **Reset button:** Resets the active scenario cleanly to its deterministic initial fixture state without editing browser storage manually. (Prototype state persists only under isolated `localStorage` key `bibleberry-r06-prototype-v1`, separate from production `bibleberry-prototype-v1`.)
  - **Controls drawer:** Provides reviewer triggers for:
    - Simulated Date / Preview / Rollover (`Nov 18`, `Nov 28 Dec Preview`, `Feb 27 Mar Preview`, `Simulate Dec 1 Rollover (G02/G03)`, `Today Unavailable` toggle)
    - External Deep-Link Ingress (`Authorized Today`, `Authorized Historical Oct 14`, `Embargoed Nov 25`, `Withdrawn`, `Invalid`)
    - Feed & Catalogue States (`News: ready/loading/empty/error`, `Library: ready/loading/empty/error`)
    - Accessibility & Account Merge Triggers (`Text 100%/120%/150%/200%`, `Reduced Motion`, `Simulate Account Merge (G08)`)

---

## 3. G09 Scenario Presets

| Scenario ID | Label | Demonstrated G09 Journey / Behaviors |
|---|---|---|
| `g09-1-normal-first-use` | **1. Normal First Use** | 3-screen App Introduction → independent skippable 4-destination Guided App Tutorial (0 Cards awarded) → `Today` → Challenge `Exit` / auto-resume / `Start from Beginning` / explicit `Finish` → `Read Again`. |
| `g09-2-external-first-use` | **2. External First Use** | Authorized historical external Challenge (`Oct 14`) opens directly *before* App Intro, Tutorial, or Monthly Intro (`G04-B`); `Exit`/`Finish` returns to `Today` without exit onboarding wall (`G04-A`) while keeping onboarding flags `pending`. Use Workbench external-link controls to test fail-closed embargoed/withdrawn/invalid fallbacks. |
| `g09-3-current-month` | **3. Current Month & Preview** | Direct `Today` Challenge entry does not trigger Monthly Intro (`G05`); first intentional November Month Screen visit opens full Monthly Introduction + *"Welcome to Paths of Quiet Faith (Synthetic)"*; continuous Mon–Sun weekly agenda panels; unearned discoveries show title + numeric progress only; Full-Month Card listed last; switch date to `Nov 28` or `Feb 27` for advance preview withholding Welcome, manuscripts, and Monthly Discoveries (`Skip to Welcome` after month start). |
| `g09-4-historical-continuity` | **4. Historical Continuity** | Explicit Active Focus (`October 2026`) shows single secondary `Continue Your Study` resuming unfinished saved Challenge directly; switch focus to completed `September 2026` to see **`Review This Month`** (`G01`); use `edge-rollover-g02` for one-time prior-month rollover interruption (`G02`); use `edge-rollover-g03` + `Simulate Dec 1 Rollover` for Active Focus & Kept protection (`G03`). |
| `g09-5-library-shelf` | **5. Library & Shelf** | Full 3-slot Shelf ordered Active Focus first; visible `Keep on Shelf` → `Kept on Shelf` distinct from `Active Focus`; `Put Away` Active Focus reassign-or-no-focus prompt; `Browse All Months` expandable years, month/theme unified newest-first search, Load-more pagination, and 4th-month manual replacement chooser + confirmation; `Foundations` overview with conditional `Resume Reading`. |
| `g09-6-earned-collections` | **6. Earned Collections** | Finish today (`Nov 18`) → earns `Everyday Hospitality` → silent Month Screen update + Hub-only combined inline announcement → `View Discoveries` focused gallery + `Browse Full Field Notebook`; Field Notebook top lifetime status, `Search Your Cards` illustrated rows, publication year/month galleries, newest-earned-first `All Earned Cards`, conditional `Foundations & Learning` & event-grouped `Special Experiences` (`G07`), full single-scroll Card view with full-view-only `Share Scripture Card` export attribution, broken-art honest fallback, and independent `Saved Scripture`. |
| `g09-7-news-preferences` | **7. More, News & Preferences** | `More` ministry-first overview with featured update direct open → `Back`; `View All News` unified newest-first feed + category filters + loading/empty/error/retry; `Follow Bibleberry Seasons` default vs `Choose My Colors` persistence across date rollover; independent `Review Introduction` & `App Tutorial` replay returning to `More` with zero data loss. |
| `g09-8-accounts-merge` | **8. Accounts & Merge (G08)** | Guest with 3 distinct completions → dismissible `Today` account invitation with permanent dismissal (`More → Account & Progress` always reachable); simulated merge flows for Clean Transfer, Real Shelf Conflict (`G08` single brief post-verified confirmation mentioning existing-account Shelf precedence), Pending, and Partial Failure + Safe Retry without duplicate awards. |

**Additional Edge Presets:** `edge-empty-guest` (0 Cards, empty Shelf, empty Saved Scripture), `edge-today-unavailable` (`Explore This Month` primary fallback), `edge-preview-nov28`, `edge-preview-feb27`, `edge-rollover-g02`, and `edge-rollover-g03`.

---

## 4. Automated Prototype Smoke Suite & Screenshots

Run the standalone prototype-scoped Playwright verification suite (12 end-to-end checks covering all 8 G09 journeys, existing-account Shelf precedence matrix, keyboard-only focus restoration & modal containment, and 200% text/zoom operability & non-clipping) from the repository root. Note: this standalone suite is intentionally not added to production GitHub CI to preserve the prototype-only scope boundary.

```bash
node docs/prototypes/r06-connected-experience/tests/smoke.mjs
```

To regenerate the clean reviewer-free representative screenshots in [`screenshots/`](./screenshots/):

```bash
CAPTURE_SCREENSHOTS=1 node docs/prototypes/r06-connected-experience/tests/smoke.mjs
```

---

## 5. Review Documentation

- [`SCREEN_FLOW_INVENTORY.md`](./SCREEN_FLOW_INVENTORY.md) — Maps every prototype screen and transition to the consolidated R06 specification.
- [`EVIDENCE_MATRIX.md`](./EVIDENCE_MATRIX.md) — Separates demonstrated prototype UX behaviors from non-represented production/infrastructure behaviors.
- [`MANUAL_REVIEW_CHECKLIST.md`](./MANUAL_REVIEW_CHECKLIST.md) — Hands-on acceptance walkthrough for product and independent code review.
- [`RESIDUAL_ISSUES_REGISTER.md`](./RESIDUAL_ISSUES_REGISTER.md) — Separates non-blocking visual refinements, observed `main` implementation gaps (not patched here), and §12 unresolved product contracts for Aaron.
- [`screenshots/`](./screenshots/) — Phone (`320px`, `375px`), tablet portrait (`768×1024`), tablet landscape (`1024×768`), and large-text (`150%`) review captures.

---

## 6. Synthetic Data & Visual Direction Disclaimer

- All teaching manuscripts, Challenge titles, Scripture Card illustrations/explanations, Ministry News articles, and account records are **clearly marked synthetic placeholders**.
- The visual palette, typography, spacing, and SVG artwork establish a **candidate directional aesthetic** (contemporary, restrained, abstract, editorial) and do **not** represent final brand colors, production artwork, or published theological copy.
