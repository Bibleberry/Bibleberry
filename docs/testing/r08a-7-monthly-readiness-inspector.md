# R08A-7: Read-Only Monthly Editorial Readiness Inspector in Sanity Studio

**Issue:** `#116` (`R08A-7` / Phase 02 editorial workflow)  
**Baseline `main`:** `8e3abfc`  
**Scope:** Read-only monthly editorial readiness projection (`studio/readiness/**`), Sanity Studio pane component ([`MonthlyReadinessInspector.tsx`](../../studio/components/MonthlyReadinessInspector.tsx)), minimal Structure wiring ([`structure.ts`](../../studio/structure.ts), [`structureHelpers.ts`](../../studio/structureHelpers.ts)), and Studio tests ([`monthlyReadiness.test.ts`](../../studio/tests/monthlyReadiness.test.ts)).

---

## 1. Architecture & Safety Boundaries

- **Strictly read-only:** [`fetchReadinessData.ts`](../../studio/readiness/fetchReadinessData.ts) and [`MonthlyReadinessInspector.tsx`](../../studio/components/MonthlyReadinessInspector.tsx) expose only `fetch` and `withConfig` via `ReadOnlySanityClient`. Zero Sanity mutations (`create`, `patch`, `delete`, `transaction`, `mutate`) are invoked.
- **Metadata-only GROQ projections:** Queries project only structural/editorial metadata (`_id`, `_rev`, `_updatedAt`, `editorialStatus`, `withdrawn`, review attribution, slot dates/refs, counts of screens/blocks/unapproved blocks, Scripture citation/rights flags, Card artwork/accessibility booleans). Full Challenge teaching bodies, Scripture `passage` text, `accessibleTranscription` text, and `cdn.sanity.io` asset URLs are never queried or rendered.
- **Authorized dataset & perspective separation:** Only `production` and `staging` datasets are accepted (`isAuthorizedDataset`). Queries run explicitly in both `published` and `raw` perspectives so draft-only documents and unpublished draft overlays are distinguished from `published`-perspective readiness.
- **Fail-closed error handling:** Invalid `YYYY-MM` input, unauthorized/ambiguous datasets, missing Sanity client/config, permission errors (`401`/`403`), network failures, aborted queries, malformed responses, and `published` queries returning `drafts.` IDs all produce an `unknown` status with a retryable diagnostic instead of a false ready state.
- **Explicit non-authorization boundary:** Passing operational readiness checks (`checksPass`) is explicitly labeled as not granting Sanity publish approval or Cloudflare Release Gateway release authorization.

---

## 2. Inspected Readiness Contracts

[`evaluateReadiness.ts`](../../studio/readiness/evaluateReadiness.ts) reuses [`monthlyHelpers.ts`](../../studio/schemaTypes/monthlyHelpers.ts) and mirrors the contract rules of `monthlyPublication`, `challenge`, `scriptureCard`, and `newsArticle`:

1. Deterministic `month-YYYY-MM` identity (including detection of non-conforming IDs claiming `yearMonth`), `year`/`month` alignment, title, cover image `alt`, whole-month `withdrawn`, and draft vs published sync state.
2. Calendar slot completeness (`28`/`29` leap Feb/`30`/`31` days), sequential `_key` (`day-01`..`day-N`), `dayOfMonth`, civil `date`, `scheduled` vs `withdrawn` slot status, unassigned slots, intra-month duplicates, and published/draft cross-month collisions.
3. Distinct linked Challenge readiness across `published` and `draft` perspectives (`withdrawn`, `adaptationReviewed`, `reviewedBy`/`reviewedAt`, `unapprovedBlockCount`, screen count, and `primaryScripture` rights consistency).
4. Introduction `previewScreens` and month-start `welcomeScreen` completeness, plus deterministic advance-preview start date (`computeAdvancePreviewStartDate`, e.g., `2098-02-27` for `2098-03`) without generating any public preview.
5. Monthly discoveries (`V-DISC-SUBSET` invariant against active finalized slots), `scriptureCard` links (`monthlyThematic` / `monthlyFull`, `plannedYearMonth`, `editorialStatus === 'approved'`, `withdrawn`, artwork, distinct `illustrationAlt`/`accessibleTranscription`, artwork & Scripture rights, review attribution), and legacy `reservedCardId` compatibility.
6. `editorialReview` role truthfulness (`theological_editorial` vs `technical_synthetic`), `rosterFinalization` (`isFinalized`, `rosterVersion` v1 vs v2+ `priorRosters`, active slot set equality), and optional `news-preview-YYYY-MM` readiness.
7. Actionable findings with `ChildLink` editor targets opening `month-YYYY-MM`, `news-preview-YYYY-MM`, `card-<slug>`, or `challenge:<id>` in an adjacent Studio pane.

---

## 3. Verified Checks & Untested Environments

- **Studio TypeScript, Schema/Readiness Tests & Build:**
  - `cd studio && npm run typecheck` — passed (`tsc --noEmit`).
  - `cd studio && npm run test:schema` — passed:
    - `tests/importProvenance.test.ts` (13 passed)
    - `tests/monthlyPublication.test.ts` (16 passed)
    - `tests/r08aMonthlyFixtures.test.ts` (4 passed)
    - `tests/scriptureCard.test.ts` (9 passed)
    - `tests/monthlyReadiness.test.ts` (8 passed, including side-by-side `@sanity/validation` consistency checks, zero-mutation spy verification, `renderToStaticMarkup` safety assertions, and `structure.ts` wiring).
  - `cd studio && npm run build` — passed (`sanity build`).
- **Root CI Checks:**
  - `npm run lint` — passed (`eslint .`).
  - `npm run build` — passed (`tsc -b && vite build`).
  - `npm run test:adapter` — passed (252 passed).
  - `npm run test:gateway` — passed (101 passed).
  - `npm run test:native-participation` — passed (15 passed).
- **Not Exercised Here:** Interactive Sanity Studio browser login session against live `staging` or `production` Sanity APIs (intentionally not exercised in this offline/non-mutating implementation PR).
