# Bibleberry Month Screen — interactive reference (November 8, 2026)

**Status:** Owner-reviewed **visual/interaction reference**, not production Month Screen code. Initial version proposed for review in a dedicated PR. This prototype does not alter the reader app, CMS, release gateway, account state, routing, or deployment.

## Open it

Open [index.html](index.html) in a browser (download the raw file or open it from a local checkout). It is one standalone HTML file with embedded CSS and vanilla JavaScript; no build, dependencies, server, credentials, or external network requests.

The example uses fictional November 2026 Challenge titles and sample data. The simulated date starts at **November 8, 2026**; use **Prototype controls** below the screen to examine November 15 and a fully published historical month.

## Reference behaviors represented

- A **monthly theme** and actual **Monday–Sunday weekly calendar** selector, including the one-day first and last partial weeks of November 2026.
- A compact, vertically readable row for each day's actual title; weekday/weekend teaching may differ internally but use the same Month Screen presentation.
- All 30 future *titles* visible from the start; only published *content* selectable. Unreleased days are pale gray and labeled **Coming Soon**.
- Visually distinct **Completed** (green/checkmark), **Available** (soft blue), **Continue** (amber with bold border), **In progress** (light tan), and **Up Next** (soft blue with additional border/label). These colors are **temporary semantic examples**, not the final brand palette.
- A recent unfinished Challenge overrides earlier missed dates for **Continue**. When several are unfinished, the **most recently opened** unfinished Challenge takes priority. If none is in progress, **Up Next** means the chronologically earliest published, unfinished Challenge.
- A return to a month selects the week of that recommended Challenge but does **not** automatically launch it. Readers can freely select another week or Challenge.
- Three placeholder reader screens simulate a saved reading position; leaving without **Finish** does not complete the Challenge. Finishing records it once, returns to the same Month Screen, updates counts silently, and leaves older completed Challenges openable.
- The header shows **X of 30 Challenges Completed** plus **Discoveries Found (%)** based on **fully earned thematic cards**, not individual segments.
- Monthly Discoveries below the selected week have individually filled segments, with title and numeric progress only until earned. No qualifying-day answer key is visible. Only earned cards show a tappable illustration **placeholder** and an expandable full-card placeholder.
- The **Complete November** full-month goal is last and uses a continuous progress bar rather than segments; its card is hidden until all 30 are completed.
- The **Read Monthly Introduction** affordance is represented by a simple placeholder panel. The fully designed introduction/advance preview/welcome sequence is not part of this prototype.

Try: open and finish Nov 6, then open and finish Nov 8, to earn the first thematic card and see **Discoveries Found** change from 0% to 33%. To test resume ordering, open Nov 3 without Finish, then reopen Nov 6 without Finish; only the most recently opened incomplete one receives the Continue border. Select historical mode to explore future-date titles as available.

## Boundaries for engineering

1. **Authoritative product rules remain in** [Approved Reader Experience & Month Screen](../../product/2026-11-08-approved-reader-experience-and-month-screen.md), supplemented by [Issue #61](https://github.com/Bibleberry/Bibleberry/issues/61). This prototype is a design aid, not a replacement product contract.
2. Dates, progress, discovery qualification and access state in the prototype are fake client-side data, held only in memory. Real publication access requires the existing **server-authoritative release gateway** and the reader-local publication-date contract.
3. The example's discovery-to-day mappings are fictitious internal test fixtures. They must **never** become user-facing source-Challenge lists, and real reward rules are derived from Alexis's published teaching.
4. Production must use persistent user/account records, idempotent Finish/completion semantics, retained reader positions, origin-aware navigation, and Hub-only combined earned-card announcements. The sample intentionally does **not** implement any Hub, Shelf, Library, account, CMS or Field Notebook integration.
5. The sample introduction is **not** the approved full Introduction/Preview/Welcome journey. No global navigation or final art direction has been selected.
6. No achievements, notifications or Scripture card contents have been invented for production. The ✦ earned-card image is strictly a placeholder that appears **only after earning**.
7. Check mobile accessibility, keyboard/screen-reader semantics, low-end Android performance, long titles, right-to-left/localization considerations if needed, and 28/29/30/31-day month calculations in implementation. This single sample month is deliberately fixed to November 2026.

**Product framing:** Bibleberry is a continuously publishing Christian teaching ministry. This calendar helps readers find and continue teaching; discovery progress supports that experience without taking it over.
