# R08A-4A Evidence: Deterministic Monthly Staging Fixtures & Read-Only GROQ Verification

**Issue:** `#87` (`R08A-4A`)  
**Baseline `main`:** `3cbe260f5cfcc8988dd2e3dd0db94150c1392730`  
**Target Dataset Policy:** Strictly `80016lrq` / `staging` (read-only / dry-run only; zero live writes, zero `production` access, zero Cloudflare deployments).

## 1. Zero-Write Attestation & R05 Isolation

- **No write path exists in R08A-4A:** [`scripts/r08a-monthly-fixtures.ts`](../../scripts/r08a-monthly-fixtures.ts) executes offline by default with zero network calls and explicitly rejects `--apply`, `--teardown`, `--delete`, `--write`, `--mutate`, `--create`, `--update`, `--patch`, `--deploy`, unknown flags, and token-bearing CLI arguments.
- **R05 baseline preserved:** All 6 accepted R05 fixtures (`r05-3b-*`) in [`stagingAcceptanceFixtures.ts`](../../src/gateway/fixtures/stagingAcceptanceFixtures.ts) and [`scripts/staging-fixtures.ts`](../../scripts/staging-fixtures.ts) remain untouched.
- **Synthetic-only & attribution-truthful:** All generated documents use `textStatus: 'referenceOnly'` (zero copyrighted or unlicensed passages), `technical_synthetic` attribution (`Aaron Waid (technical synthetic approval)`), and distinct `r08a-stg-` / `card-r08a-stg-` IDs/slugs.

## 2. Deterministic Monthly Fixture Manifest

Implemented in [`src/gateway/fixtures/r08aMonthlyFixtures.ts`](../../src/gateway/fixtures/r08aMonthlyFixtures.ts):

| Month Document `_id` | Days / Challenges | Preview Start Gate | Preview News `_id` | Challenge `_id` Range |
| --- | ---: | --- | --- | --- |
| `month-2096-02` | 29 (leap Feb) | `2096-01-28` | `news-preview-2096-02` | `r08a-stg-2096-02-day-01` .. `day-29` |
| `month-2098-02` | 28 (non-leap Feb) | `2098-01-28` | `news-preview-2098-02` | `r08a-stg-2098-02-day-01` .. `day-28` |
| `month-2098-03` | 31 (March) | `2098-02-27` | `news-preview-2098-03` | `r08a-stg-2098-03-day-01` .. `day-31` |
| `month-2098-04` | 30 (April) | `2098-03-28` | `news-preview-2098-04` | `r08a-stg-2098-04-day-01` .. `day-30` |

- **Totals:** `4` `monthlyPublication` + `118` `challenge` + `5` `newsArticle` (`4` `monthlyPreview` + `1` general `ministryUpdate` `r08a-stg-news-ministry-update-1`) = **`127` canonical documents**.
- **Manifest Version / Checksum (`sha256`):** `r08a-4a-v1` / `3622899c2eae45ada31d0de81a43113b128afff6fafee452e6823a16683e76a8` (verified identical across repeated runs).
- **Non-synthesized monthly Challenges:** Monthly Challenges omit `releaseAt`, `series`, and `sequence`.
- **In-memory negative & emergency withdrawal variants:** [`buildR08aNegativeVariants`](../../src/gateway/fixtures/r08aMonthlyFixtures.ts) exercises duplicate slot refs, foreign month slot refs, draft refs, unreviewed Challenges, unlicensed Scripture passages, invalid slot dates, non-conforming month IDs (`month-2098-04-synthetic`), immediate `challenge.withdrawn = true` suppression (including retracted title/Scripture/review), and formal `rosterVersion: 2` `slotStatus: 'withdrawn'` (`29/29` achievability).

## 3. Offline Schema & Gateway Validation Results

- **Sanity Studio real schema validation ([`studio/tests/r08aMonthlyFixtures.test.ts`](../../studio/tests/r08aMonthlyFixtures.test.ts)):**
  - Exercises `@sanity/validation` `validateDocument` across all `4` `monthlyPublication` docs (with cross-document `perspective: 'published'` mock client), all `118` `challenge` docs, all `5` `newsArticle` docs, and negative/v2-withdrawal variants (`4/4` test cases passing, zero unexpected markers).
  - *Note:* Running real `@sanity/validation` caught that `newsArticle.body` is required in Studio schema (even for `monthlyPreview` documents, while the gateway strips `body` on `monthlyPreview` projection) and that `scriptureBlock` does not accept a `caption` field. Both were corrected in the fixture builder.
- **Gateway projection & HTTP handler validation ([`tests/gateway/r08aMonthlyFixtures.test.ts`](../../tests/gateway/r08aMonthlyFixtures.test.ts) & [`scripts/r08a-monthly-fixtures.ts`](../../scripts/r08a-monthly-fixtures.ts)):**
  - Verified `110` offline contract checks via production exports (`validateAndProjectMonthPreview`, `validateAndProjectMonthDetail`, `evaluateMonthProgress`, `validateAndProjectNewsArticle`, `validateAndProjectCatalogSummary`, `validateAndProjectChallenge`), plus HTTP `handleGatewayRequest` tests across Feb 27/28th preview gates, leap/non-leap lengths, neutral `404`s, minimal `monthlyPreview` News stripping, and Option 4A `29/29` withdrawal progress.

## 4. Real Sanity GROQ Probe Status (`--check-live-groq` & `--preflight`)

- **Live Content Lake execution in this workspace:** **`NOT RUN`** (`SANITY_READ_TOKEN` is not configured in the agent environment; no secrets were requested or echoed).
- **Injected HTTP test coverage:** Both `--check-live-groq` (`GET`, `perspective=published`, `80016lrq/staging`) and `--preflight` (`GET`, `perspective=raw`, batched exact IDs + `drafts.` + slugs) are verified in [`tests/gateway/r08aMonthlyFixtures.test.ts`](../../tests/gateway/r08aMonthlyFixtures.test.ts) across `NOT_RUN`, `CLEAR`, `BLOCKED`, `INCONCLUSIVE`, populated `PASS`, and broken-dereference `FAIL` paths.
- **Queries currently `INCONCLUSIVE / NOT YET EXERCISED` against live Sanity Content Lake:**
  1. `slots[].challenge->` dereference and nested `"assignedMonthIds": *[_type == "monthlyPublication" && !(_id in path("drafts.**")) && ^._id in slots[].challenge._ref]._id` in [`MONTHLY_PREVIEW_BY_ID_GROQ_QUERY`](../../src/gateway/query.ts#L223-L280) and [`MONTHLY_DETAIL_BY_ID_GROQ_QUERY`](../../src/gateway/query.ts#L285-L360) — live Content Lake execution is required to confirm Sanity's GROQ evaluator binds `^._id` inside `challenge->{...}` to the dereferenced `challenge` document rather than an enclosing scope.
  2. `^.^._id` ancestor references in `DUAL_PATH_RELEASE_FILTER_GROQ` and `MONTHLY_ASSIGNMENTS_PROJECTION_GROQ` inside [`CATALOG_GROQ_QUERY`](../../src/gateway/query.ts#L50-L84) and [`CHALLENGE_BY_SLUG_GROQ_QUERY`](../../src/gateway/query.ts#L90-L179).
  3. `relatedMonth->` dereference in [`NEWS_ARTICLES_GROQ_QUERY`](../../src/gateway/query.ts#L365-L395).

## 5. Remaining Requirements for Separately Authorized Staging Experiment (R08A-4B / 4C)

Before any live `staging` dataset insertion or staged Worker deployment occurs:

1. **Separate owner-approved scope:** Authorize a dedicated `R08A-4B/4C` Issue permitting create-only (`createIfNotExists`) staging fixture insertion in `80016lrq/staging` (and keep BerryMark's companion two-dataset docs/tests PR separate in the BerryMark repository).
2. **Operator-supplied read/write credentials in local shell only:**
   - `SANITY_READ_TOKEN` to run `node --experimental-strip-types scripts/r08a-monthly-fixtures.ts --preflight` (`perspective=raw`) and require `status === "CLEAR"` before any insert.
   - `SANITY_WRITE_TOKEN` (separate staged write token, `staging` only) for create-only insertion + `perspective=raw` readback verification.
3. **Live GROQ semantics proof:** Run `node --experimental-strip-types scripts/r08a-monthly-fixtures.ts --check-live-groq` after staging insertion so all 5 production GROQ queries in [`src/gateway/query.ts`](../../src/gateway/query.ts) execute against real Sanity documents (`slots[].challenge->`, `assignedMonthIds`, `^.^._id`, `relatedMonth->`). If Sanity's GROQ engine reveals any parent-scope mismatch, open a narrow corrective gateway Issue before `R08A-6` staging acceptance.
