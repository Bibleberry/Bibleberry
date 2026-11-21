# Residual-Issues Register — R06 Connected Experience Prototype (Glass Atlas)

Recorded against consolidated `main` SHA `8504a90` (Paper Compass [PR #264](https://github.com/Bibleberry/Bibleberry/pull/264)). Strictly separates: **(A)** non-blocking candidate visual/editorial refinements, **(B)** discovered implementation gaps on current `main` (recorded for future scoped engineering, **not** patched in this prototype PR), and **(C)** genuine §12 product contradictions/open contracts requiring Aaron Waid's disposition.

---

## A. Candidate Visual & Editorial Refinements (Non-Blocking Prototype Direction)

| ID | Area | Observation / Candidate Status |
|---|---|---|
| `VIS-01` | Color palettes & seasonal schedule | Prototype uses candidate semantic palettes (`Autumn Sage`, `Winter Stillness`, `Spring Renewal`, `Warm Linen`, `Quiet Slate`, `Cedar & Clay`) with separate Light/Dark/System contrast. Final brand colors, seasonal calendar dates, and contrast pairings remain deferred (§12.2). |
| `VIS-02` | Typography & iconography | Prototype uses zero-dependency system serif/sans font stacks and minimal inline SVG line icons. Final typography, wordmark, and tab iconography remain deferred (§12.2). |
| `VIS-03` | Scripture Card artwork & share watermark | Prototype uses clearly marked `SYNTHETIC ILLUSTRATION PLACEHOLDER` SVGs and a provisional bottom export-time ribbon. Production requires Alexis Waid's authentic illustrated notebook assets and approved watermark placement/wording (§12.2). |
| `VIS-04` | Lifetime participation status copy | Prototype displays provisional calm labels (`Beginning the Journey`, `Steady Reader`, `Rooted in Scripture`, `Seasoned Companion`, `Faithful Pilgrim`). Final tier names, thresholds, and copy remain editorial decisions (§12.2). |
| `VIS-05` | Monthly Introduction screen count & copy | Prototype uses 3 illustrative screens (2 preview + 1 Welcome). Final editorial copy, illustration cadence, and screen count are author-driven per publication month (§4.3, §12.2). |

---

## B. Discovered Implementation Gaps on Current `main` (`8504a90`) — Recorded Only, Not Modified

Per Glass Atlas exclusion boundaries, **no production files under `src/`, `studio/`, or `tests/` were altered**. Future production integration PRs (bounded per Assignment §12 handoff) will need to reconcile these verified gaps against the consolidated R06 specification:

| ID | Existing `main` File(s) | Gap vs Approved R06 Specification |
|---|---|---|
| `GAP-01` | `src/App.tsx` (`PrimaryView = 'today' \| 'foundations' \| 'archive' \| 'more'`) | Legacy four-tab shell still renders `Today \| Foundations \| Archive \| More` with feature-flagged provisional entry bars (`ProvisionalCollectionsEntryBar`, `ProvisionalLibraryEntryBar`, `ProvisionalNewsEntryBar`) rather than the approved `Today \| Library \| Collections \| More` persistent navigation, bottom-bar/rail adaptation, per-tab nested route + scroll restoration, and active-tab reset (§2.1, §2.3). |
| `GAP-02` | `src/shelf/policy.ts` (`findOldestAutoAdmittedMonth`) | Current Shelf rollover eviction filter checks `admissionKind === 'autoAdmitted' && !isShelfEntryProtected(entry)` only; it does **not** yet exempt the currently selected `activeFocusMonth` from automatic rollover eviction (`G03`, §6.3). |
| `GAP-03` | `src/hubContinue/engine.ts` | Hub Continue needs reconciliation with `G01` (Month Screen fallback when Active Focus has no valid unfinished Challenge; `Review This Month` when completed without falling back to another Shelf month) and `G02` (one-time post-rollover interrupted prior-month continuation subordinate to Active Focus, §3.2). |
| `GAP-04` | `src/components/notebook/fieldNotebookModel.ts`, `src/components/notebook/FieldNotebookView.tsx` | Current Field Notebook model handles monthly awards only (`MonthlyAwardKind`, `NotebookBrowseMode = 'yearMonth' \| 'allCards'`); it does not yet project conditional earned-only `Foundations & Learning` and event-grouped `Special Experiences` entries (`G07`, §7.2), nor full top-to-bottom Field Notebook hierarchy reconciliation. |
| `GAP-05` | `src/components/onboardingReplay/ReplayableOnboarding.tsx` | Implements the 3-screen App Introduction only; the separate, independent, skippable 4-destination Guided App Tutorial (`More → App Tutorial`, `G06`, §8.4) does not yet exist in production `src/`. |
| `GAP-06` | `src/cms/reader/challengeOrigin.ts`, `src/App.tsx` (R12-2 ingress) | Existing ingress parses caller-supplied URL `origin` parameters; production routing must enforce `G04-A` (external Challenge `Exit`/`Finish` always returns to `Today`, ignoring URL `origin`) and `G04-B` (first-use external Challenge bypasses App Intro/Tutorial/Monthly Intro while keeping onboarding flags pending, §5.3). |
| `GAP-07` | `src/components/month/` | Existing Month Screen uses provisional layout/flags; production integration must align with continuous vertically scrollable Mon–Sun weekly agenda panels, `G05` first-intentional-visit Monthly Introduction/Welcome gating, and preceding-28th / Feb 27 preview withholding (§4.1–§4.3). |
| `GAP-08` | Foundations persistence & `G08` account merge confirmation | Foundations resumable reading position storage (§6.5) and `G08` single brief post-verified merge confirmation with conditional real-Shelf-conflict sentence (§9.3) require scoped production implementation once accounts enter scope. |

---

## C. Genuine §12 Product Contradictions & Unresolved Contracts (Not Invented by Prototype)

Consistent with [§12.1–§12.2 of the Consolidated R06 Specification](../../product/2026-11-08-approved-reader-experience-and-month-screen.md#12-residual-contradictions-open-boundaries--deferred-decisions), the following open contracts require explicit owner disposition from Aaron Waid before production implementation:

| ID | Spec Ref | Open Product Contract / Prototype Handling |
|---|---|---|
| `OPEN-01` | §12.1 #1 | **Future CMS-authored award-eligible `readerGuidance` exit contract:** CMS Architecture (§7.4) mentions "no exit path bypassing Finish" for CMS ministry tutorials, whereas `G06`/`G07` forbid trapping readers in the UI `App Tutorial` or `App Introduction`. Prototype treats optional Foundations readings with the Nov 20 seamless `Exit` + `Finish`-only award contract and flags the `readerGuidance` exit rule for Aaron's decision. |
| `OPEN-02` | §12.1 #2 | **Deferred first-use onboarding re-offer trigger after `G04-B` external Challenge:** Prototype accurately leaves `introStatus = pending` and `tutorialStatus = pending` upon returning to `Today` without an exit wall. **When/how** pending onboarding is subsequently offered (next ordinary fresh launch vs gentle Today prompt vs `More`-only) remains open for Aaron's review. |
| `OPEN-03` | §12.1 #4 | **Non-Challenge direct external deep links & OS Back at external entry boundary:** Prototype enforces `G04-A` on external Challenge links (`Exit`/`Finish` → `Today`). Return behavior for a direct external link to a **Month Screen** and OS/browser Back exiting to a referring app remain open for platform verification. |
| `OPEN-04` | §12.1 #5 | **Multi-device partial reading position merge (`furthest valid position` vs server screen order):** Prototype simulates verified merge at the UX level (`G08`); production hosted sync requires an authoritative server-side screen-order lookup to resolve `undecidableReadingPosition` before multi-device sync acceptance. |
| `OPEN-05` | §12.1 #6 | **Sanity `scriptureCard.cardCategory` `"tutorial"` metadata & Studio grouping:** Existing `studio/structure.ts` groups `foundation`, `tutorial`, and `specialExperience` together. Reconcile Studio/gateway projection mapping so eligible teaching Cards map to `Foundations & Learning` and event Cards map strictly to `Special Experiences` (`G07`). |
| `OPEN-06` | §12.2 | **Minor interaction edge-cases:** (a) Whether readers can unprotect a `Kept on Shelf` month without `Put Away`; (b) exact technical consumption window and multi-unfinished tie-breaking for `G02`; (c) completed-Challenge entry position when reopened from `Month Screen` vs `Today` `Read Again`; (d) ordering within `Foundations & Learning` and `Special Experiences`. |
