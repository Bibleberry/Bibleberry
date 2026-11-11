# R14-2: Gateway Earned-Only Scripture Card Projection

**Issue:** `#97` (`R14-2` / Phase 04B1)  
**Baseline `main`:** `c44b6bd4d0facc0657e42d3005088fff7c5c6cd4`  
**Scope:** Gateway query, types, projection validation, and offline gateway regression tests (`src/gateway/**`, `tests/gateway/**`, and this note).

---

## 1. Server-Side Card Resolution & Fail-Closed Validation

- **Internal GROQ query ([`src/gateway/query.ts`](../../src/gateway/query.ts)):**
  - `MONTHLY_DETAIL_BY_ID_GROQ_QUERY` projects `rawCardRef: card._ref` and `card->{...}` inside `discoveries[]` and `fullMonthCard` using `perspective=published` and authenticated `SANITY_READ_TOKEN`.
  - `MONTHLY_PREVIEW_BY_ID_GROQ_QUERY` intentionally omits `discoveries`, `fullMonthCard`, and `card` completely.
  - No standalone/public `scriptureCard` lookup endpoint exists.
- **Validation contract ([`src/gateway/monthlyProjection.ts`](../../src/gateway/monthlyProjection.ts)):**
  - Linked `card` metadata is accepted **only** when:
    - `card._id` is a published base ID `card-<slug>` (no `drafts.` prefix), matching `rawCardRef`, `slug`, and (if present) `reservedCardId`.
    - `card._type === 'scriptureCard'`, `editorialStatus === 'approved'`, `withdrawn !== true`, and `editorialReview` passes `isValidEditorialReview`.
    - `cardCategory` matches context (`'monthlyThematic'` for `monthlyDiscovery`, `'monthlyFull'` for `fullMonthCard`).
    - Optional `plannedYearMonth`, if present, matches the month's `yearMonth`.
    - `artwork.url` is an HTTPS `cdn.sanity.io/images/<projectId>/<dataset>/...` URL (pinned to `env.SANITY_PROJECT_ID` and `env.SANITY_DATASET` in `handleGatewayRequest`, with no credentials, query string, or fragment).
    - `illustrationAlt` and `accessibleTranscription` are both non-empty and distinct.
    - `rightsAndAttribution.usageRightsConfirmed === true`, and `scriptureCitation.usageRightsConfirmed === true` whenever `translation` is not `"Not configured"`.
    - No intra-month duplicate `card._id` exists across `discoveries[]` and `fullMonthCard`.
  - **Fail-closed isolation:** If an optional linked Card fails any check above (or is draft-only/dangling `card: null`), **only `earnedCard` disclosure fails closed** (`earnedCard` is omitted). Unrelated released month/Challenge routes and valid sibling discoveries remain `200 OK`.
  - **Legacy fixtures:** Entries with `reservedCardId` only (and no `card`/`rawCardRef`) retain exact R08A `awardId` + `reservedCardId` behavior without requiring `scriptureCard` documents.

---

## 2. API Disclosure & `earnedCard` JSON Contract

| Endpoint | Card / Discovery Disclosure |
| --- | --- |
| `GET /api/months/:yearMonth/preview` | No `discoveries`, no `fullMonthCard`, no `card` IDs, URLs, alt text, or transcriptions. |
| `GET /api/months/:yearMonth` | Discovery summaries `{ discoveryId, kind, title, targetCount }` only; zero `cardDocumentId`, URLs, `illustrationAlt`, `accessibleTranscription`, `reservedCardId`, `qualifyingChallengeIds`, or `editorialReview`. |
| `POST /api/months/:yearMonth/progress` (`isEarned: false`) | `{ discoveryId, kind, title, achievedCount, targetCount, isEarned: false }` only (no `awardId`, `reservedCardId`, `earnedCard`, or Card metadata). |
| `POST /api/months/:yearMonth/progress` (`isEarned: true`) | Adds `awardId`, optional legacy `reservedCardId`, and (when an eligible linked `scriptureCard` passes validation) `earnedCard`: `{ cardDocumentId, title, publicationYearMonth, imageUrl, assetRevision, illustrationAlt, accessibleTranscription, scripture: { book, reference, translation }, attribution, rightsStatus, shareEligible, theologicalThemes?, keywords? }`. |

---

## 3. Trust Model & Explicit R14-2 Boundaries

- **Stateless guest display calculation:** `POST /api/months/:yearMonth/progress` evaluates caller-supplied `completedChallengeIds` intersected strictly with released, active, non-withdrawn slots (`slot.date <= authorizedLocalDate`). Repeated IDs do not amplify progress; future/guessed/cross-month IDs cannot unlock Cards.
- **Not an authoritative award ledger:** The gateway stores zero user records, issues no signed claims, and performs no durable persistence. Once R14-3 / R13 are implemented, durable award history and earned dates belong in `ParticipationEnvelopeV2` (local guest) and the separate Account Participation Service (signed-in).
- **Non-scope:** No `src/participation/**`, `src/cms/**`, `src/App.tsx`, Card viewer UI, Field Notebook, Hub announcements, sharing/watermark, or live Sanity writes.

---

## 4. Next Slice Boundary (R14-3: Durable Guest Earned Awards)

- Upgrade `src/participation/` from `GuestParticipationEnvelopeV1` to `ParticipationEnvelopeV2` with backward-compatible migration.
- Persist `earnedAwards[awardId]` keyed by canonical `card:monthly:YYYY-MM:<slug>` / `card:monthly:YYYY-MM:full-month` with `earnedOn` (`authorizedLocalDate`), monotonic `earnedCard` display snapshot, `hubAnnouncementAcked`, and `cardViewed`.
- Combine stateless gateway progress with durable `earnedAwards` (`effectiveEarned = gatewayDiscovery.isEarned || Boolean(earnedAwards[awardId])`) so post-approval edits or withdrawals never revoke earned accomplishments.
