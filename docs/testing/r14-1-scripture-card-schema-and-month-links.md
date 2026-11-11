# R14-1: Scripture Card CMS Schema and Monthly Discovery Links

**Issue:** `#94` (`R14-1` / Phase 04A)  
**Baseline `main`:** `22f2ae64b84f7b29b73efbf155023eb07acd6685`  
**Scope:** Sanity Studio schemas, Studio Structure navigation/opener helpers, deterministic schema/validation tests, and this contract note.

---

## 1. Scripture Card Identity & Editorial Schema

- **Document type:** [`scriptureCard`](../../studio/schemaTypes/documents/scriptureCard.ts), registered in [`studio/schemaTypes/index.ts`](../../studio/schemaTypes/index.ts).
- **Deterministic immutable identity:** Every `scriptureCard` uses `card-<slug>` (draft `drafts.card-<slug>`) matching `CARD_ID_PATTERN` (`/^[a-z0-9]+(?:-[a-z0-9]+)*$/` after `card-`), enforced against `slug.current` in document validation.
- **Single finished graphic artifact:** `artwork` (`image`, `hotspot: false`) plus `assetRevision` (`v1`, etc.) models the finished illustrated card as the primary artifact without creating a second visual composition.
- **Separate required accessibility metadata:**
  - `illustrationAlt` describes only the visual illustration concisely.
  - `accessibleTranscription` provides the screen-reader equivalent of the biblical text, references, and explanation baked into the graphic.
  - Validation rejects missing `artwork.asset._ref`, empty `illustrationAlt`, empty `accessibleTranscription`, or identical alt/transcription strings.
- **Scripture, themes & rights:**
  - `scriptureCitation` (`book`, `reference`, `translation`, `usageRightsConfirmed`) requires explicit quotation rights confirmation whenever `translation` is anything other than `"Not configured"` (used for reference-only synthetic tests).
  - `rightsAndAttribution` (`attribution`, `rightsStatus`, `usageRightsConfirmed`) requires explicit rights confirmation before publishing or linking.
  - `theologicalThemes` and `keywords` remain free-form unique string arrays (no premature rigid taxonomy).
- **Organizational placement (non-authoritative):** `cardCategory` (`monthlyThematic`, `monthlyFull`, `foundation`, `tutorial`, `specialExperience`), optional `plannedYearMonth` (`YYYY-MM`), optional `plannedCollection`, optional `sortOrder`, and optional `shareEligible` (`true` by default) provide organizational metadata without duplicating or displacing parent earning rules.
- **Truthful review & status gate:** `editorialStatus` (`draft` | `inReview` | `approved`), `withdrawn` (`boolean`), and `editorialReview` (`monthlyEditorialReview`, requiring `theological_editorial` or `technical_synthetic`) enforce truthful attribution when marking a Card `approved` while allowing unreviewed drafts during editing.

---

## 2. Studio Editor Flow & Safe Monthly Links

- **Studio navigation:** [`studio/structure.ts`](../../studio/structure.ts), [`studio/structureHelpers.ts`](../../studio/structureHelpers.ts), [`studio/components/DeterministicCardOpener.tsx`](../../studio/components/DeterministicCardOpener.tsx), and [`studio/initialValues/templates.ts`](../../studio/initialValues/templates.ts) add a **Scripture Cards** workspace with:
  - **All Scripture Cards** and filtered category lists (`Monthly thematic Cards`, `Monthly full-month Cards`, `Foundation, tutorial & event Cards`).
  - **Open or create Scripture Card (`card-<slug>`)**, which deterministically opens or creates `card-<slug>` with `SCRIPTURE_CARD_TEMPLATE_ID`.
  - [`filterDeterministicNewDocumentOptions`](../../studio/sanity.config.ts) hides generic `+` creation for `scriptureCard` so random-UUID Card documents are not created accidentally.
- **Monthly references without breaking R08A:**
  - [`monthlyDiscovery`](../../studio/schemaTypes/objects/monthlyDiscovery.ts) and `monthlyPublication.fullMonthCard` in [`monthlyPublication.ts`](../../studio/schemaTypes/documents/monthlyPublication.ts) each add an optional weak reference `card` targeting `scriptureCard`.
  - Existing `reservedCardId` fields remain optional so all accepted R08A synthetic monthly fixtures and tests pass unchanged without migration.
  - Month validation protects against:
    - Intra-month duplicate `card._ref` across `discoveries[]` and `fullMonthCard`.
    - Malformed card IDs or conflicts between `card._ref` and legacy `reservedCardId`.
    - `drafts.` references, unpublished/draft-only Cards, `editorialStatus !== 'approved'`, `withdrawn === true`, missing artwork/accessibility/rights, wrong `cardCategory` (`monthlyThematic` vs `monthlyFull`), or mismatched `plannedYearMonth` at the `approved`/`scheduled`/`isFinalized` gate under `perspective: 'published'`.
    - Existing `V-DISC-SUBSET`, `rosterVersion` v1/v2 `Option 4A` withdrawal, and qualifying-Challenge privacy remain unchanged.

---

## 3. Explicit Non-Integration Boundary (R14-1)

This PR is strictly a CMS schema and Studio validation foundation:

- **No gateway payload changes:** `src/gateway/**` is untouched; no `scriptureCard` fields, `earnedCard` URLs, `illustrationAlt`, or `accessibleTranscription` are projected or returned to clients.
- **No reader/participation changes:** `src/participation/**`, `src/cms/**`, and reader UI components are untouched; linking a `scriptureCard` in a month never records a reader award or grants access.
- **No Field Notebook, Card viewer, Hub announcements, or sharing/watermark:** Deferred to subsequent Phase 04 slices.
- **No live Sanity mutations or deployments:** No datasets were created or written; only `production` and `staging` workspaces exist.

---

## 4. Follow-Up Recommendation: Secure Gateway Earned-Only Projection & Award Recording

For the next Phase 04 implementation slice(s) (separate authorized Issues/PRs):

1. **Gateway earned-only projection (`src/gateway/`):**
   - Extend `MONTHLY_DETAIL_BY_ID_GROQ_QUERY` internally to resolve `discoveries[].card->` and `fullMonthCard.card->` **only inside server-side projection**, verifying `editorialStatus == "approved"`, `!withdrawn`, confirmed artwork/rights, and required accessibility fields (`illustrationAlt`, `accessibleTranscription`).
   - Keep `GET /api/months/:yearMonth/preview` and `GET /api/months/:yearMonth` strictly free of `card` URLs, alt text, transcriptions, and `qualifyingChallenges`.
   - In `POST /api/months/:yearMonth/progress`, evaluate `completedChallengeIds` intersected strictly with released non-withdrawn slots (`slot.date <= authorizedLocalDate`), and include `awardId` (`card:monthly:YYYY-MM:<slug>` / `card:monthly:YYYY-MM:full-month`) plus `earnedCard` metadata **only** when `isEarned === true` (withholding everything when `isEarned === false`).
   - Add negative gateway tests confirming unearned cards, draft/unapproved/withdrawn cards, guessed future Challenge IDs, and preview endpoints never leak card URLs or accessible transcriptions.
2. **Authoritative award recording (`src/participation/` & later R13 sync):**
   - Upgrade `GuestParticipationEnvelope` (`v2`) monotonically to store `earnedAwards[awardId]` with `earnedOn` (`authorizedLocalDate`), cached earned card display metadata, `hubAnnouncementAcked`, and `cardViewed`, ensuring `effectiveEarned = gatewayDiscovery.isEarned || Boolean(earnedAwards[awardId])` so earned cards are never lost on post-finalization edits or withdrawals.
   - Keep `Finish`-triggered awarding silent on Month Screen/Library/Shelf and surface one combined pending announcement exclusively on Hub arrival.
