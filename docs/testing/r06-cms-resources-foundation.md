# R06 / Phase 06: CMS-Managed Ministry Resources Foundation

**Issue:** `#178` (`Phase 06 / R06` — CMS-managed ministry Resources foundation)  
**Baseline `main`:** `6d6c580`  
**Branch:** `feat/r06-cms-resources`  
**Scope:** Sanity Studio schemas, validation helpers, Studio Structure registration, deterministic schema tests, and this contract/testing note.

---

## 1. Content Models

### `ministryResource` ([ministryResource.ts](../../studio/schemaTypes/documents/ministryResource.ts))

Models an editorially curated downloadable or external ministry resource:

- **Core identity & copy:** `title`, `slug` (`SLUG_TOKEN_PATTERN`), `description`, and optional `keywords` (unique non-empty string array).
- **Destination & presentation (§4.6):**
  - `resourceKind`: `'externalLink'` or `'downloadableFile'`.
  - `externalUrl`: required for `externalLink`, validated via [`validateSafeResourceUrl`](../../studio/schemaTypes/resourceHelpers.ts) to permit only explicit `https://` or `http://` URLs with a non-empty hostname (rejecting `javascript:`, `data:`, `file:`, `ftp:`, `mailto:`, and relative paths).
  - `downloadFile`: required `file` asset reference for `downloadableFile`.
  - `presentationMode`: `'inApp'`, `'external'`, or `'download'`, constrained to match `resourceKind` (`externalLink` cannot use `'download'`; `downloadableFile` cannot use `'external'`).
  - `destinationApproved` (`boolean`): must be `true` before `editorialStatus === 'approved'`.
  - `lastCheckedAt` (`datetime`): optional broken-link / file verification timestamp.
- **Accessibility & media:**
  - `accessibility.summary`: required before `editorialStatus === 'approved'`.
  - `accessibility.coverImage`: optional thumbnail image whose `alt` text is blocking-required whenever an image asset is present.
- **Source rights & attribution:**
  - `rightsAndAttribution` (`attribution`, `rightsStatus`, `usageRightsConfirmed`): attribution and rights/permission statement are required; `usageRightsConfirmed === true` is required before `editorialStatus === 'approved'`.
- **Editorial lifecycle, withdrawal & review:**
  - `editorialStatus`: `'draft' | 'inReview' | 'approved'` (initialValue `'draft'`).
  - `withdrawn`: `boolean` (initialValue `false`) for immediate reader suppression without deleting historical editorial records.
  - `editorialReview`: `monthlyEditorialReview` (`reviewedBy`, `reviewerRole` in `theological_editorial` | `technical_synthetic`, `reviewedAt`, `reviewNotes`), enforced at `editorialStatus === 'approved'` via [`validateEditorialReviewGate`](../../studio/schemaTypes/resourceHelpers.ts).

### `resourceSection` ([resourceSection.ts](../../studio/schemaTypes/documents/resourceSection.ts))

Models an editorially managed section/collection for organizing ministry resources:

- **Editable section metadata & manual ordering:** `title`, `slug` (`SLUG_TOKEN_PATTERN`), `description`, and `sortOrder` (required positive integer `>= 1`).
- **Ordered resource curation:** `resources` is a manually ordered array of weak references (`weak: true`) to `ministryResource` documents, preventing circular publish locks.
- **Validation & fail-closed draft protection:**
  - Rejects empty/malformed reference entries and duplicate `ministryResource` references (comparing base IDs with `drafts.` stripped).
  - Rejects `drafts.` references and empty `resources` when `editorialStatus === 'approved'` (and `!withdrawn`).
  - When `editorialStatus === 'approved'` and `!withdrawn`, queries Sanity with `perspective: 'published'` (failing closed if the client is missing or unreachable) and rejects any referenced `ministryResource` that is unpublished, not `approved`, or `withdrawn === true`.
  - Enforces `editorialStatus`, `withdrawn`, and truthful `editorialReview` attribution via [`validateEditorialReviewGate`](../../studio/schemaTypes/resourceHelpers.ts).

---

## 2. Studio Registration & Navigation

- Registered `resourceSection` and `ministryResource` in [`studio/schemaTypes/index.ts`](../../studio/schemaTypes/index.ts).
- Added a **Resources** workspace in [`studio/structure.ts`](../../studio/structure.ts) with:
  - **Resource sections**
  - **Ministry resources**
  - **Approved & active sections** (`editorialStatus == "approved" && withdrawn != true`, ordered by `sortOrder asc`)
  - **Approved & active resources** (`editorialStatus == "approved" && withdrawn != true`, ordered by `title asc`)

---

## 3. Schema Verification ([resources.test.ts](../../studio/tests/resources.test.ts))

Automated `@sanity/validation` and Structure tests cover:

- Valid `ministryResource` (`externalLink` and `downloadableFile`) in `approved`, `draft`, and `withdrawn` states.
- Rejection of unsafe/invalid link schemes (`javascript:`, `data:`, `file:`, `ftp:`, `mailto:`, relative paths, malformed URLs).
- Rejection of missing/invalid fields, `resourceKind` vs `presentationMode` mismatches, duplicate keywords, and invalid `lastCheckedAt`.
- Enforcement of `accessibility.coverImage.alt`, `accessibility.summary`, `destinationApproved`, `rightsAndAttribution.usageRightsConfirmed`, `editorialStatus`, and truthful `editorialReview` attribution.
- Valid `resourceSection` with `perspective: 'published'` verification, and rejection of invalid `sortOrder`, duplicate resource relationships (including `drafts.` + published pairs), `drafts.` references, empty `resources` on approved sections, unpublished/unapproved/withdrawn referenced resources, and client/network failures.
- Studio Structure registration of the `Resources` workspace.

---

## 4. Explicit Non-Integration Boundary

This assignment delivers a tested Sanity Studio authoring and schema foundation only:

- **Untouched:** reader React components (`src/**`), release gateway endpoints, BerryMark importer, live Sanity documents, `production` / `staging` datasets, and `.github/workflows/**`.
- **Deferred:** a separate future assignment will connect reader-facing Resources and gateway projections.
