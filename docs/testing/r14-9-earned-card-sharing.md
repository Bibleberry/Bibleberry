# R14-9: Earned Scripture Card Sharing and Export

## Scope and ownership

- `src/cardSharing/**`: Earned-card share eligibility validation, complete share payload construction, export-only Bibleberry attribution canvas renderer, and injectable browser/native sharing service.
- `src/components/cardSharing/**`: Accessible standalone `EarnedCardShareControl` component and styles for future integration into the Field Notebook and Month Screen.
- `tests/cardSharing/**`: Node unit tests and Chromium Playwright browser tests with an isolated harness.
- Existing card viewer, Field Notebook, Month Screen, participation store, and CI workflow files remain untouched.

## Verified behavior

1. **Earned & rights validation (`evaluateCardShareEligibility`)**:
   - Requires `participationData` and verifies canonical monthly award IDs, valid `earnedOn` local calendar dates, matching `participationData.earnedAwards` membership (including `cardDocumentId` and `earnedCard` metadata), failing closed with `not-earned` when absent or mismatched.
   - Enforces `validateEarnedCardSnapshot` allowlist (`https://cdn.sanity.io/images/...` without query/hash/credentials).
   - Rejects `shareEligible: false` (`not-share-eligible`) and fails closed on `rightsStatus` using an explicit allowlist of approved rights-clearance values (`approved-ministry-use`, `ministry-owned-original-illustration`, `ministry-owned`, `cleared-for-export`, `approved-for-export`, `rights-cleared`, `public-domain`), rejecting `pending`, `pending editorial clearance`, `unknown`, `not cleared`, unverified, restricted, synthetic, or arbitrary statuses (`rights-restricted`).
2. **Export-only composition & Bibleberry attribution (`createCanvasCardImageExporter`)**:
   - Fetches the original approved Scripture Card image URL and draws the artwork intact onto an offscreen canvas with an export-only footer containing the card title, Scripture reference, complete untruncated `accessibleTranscription` explanation, attribution, and subtle `"Bibleberry"` identifier.
   - Leaves the original `imageUrl`, artwork pixels, and stored award record untouched and revokes temporary object URLs immediately.
3. **Content integrity (`buildCardSharePayload`)**:
   - Preserves the complete, untruncated `accessibleTranscription` theological explanation, `scripture` reference/translation/book, and `attribution`.
   - Refuses to export incomplete content or empty image blobs (`incomplete-content` / `export-failed`).
4. **Transport, fallback, cancellation, and failure handling (`createCardSharingService`)**:
   - Supports an optional `nativeShare` hook, browser Web Share (`navigator.canShare` + `navigator.share`) with file attachment, and `<a download>` file fallback when Web Share file sharing is unavailable.
   - Maps `AbortError` to `status: 'cancelled'`, `NotAllowedError` / `SecurityError` to `permission-denied`, and failed/empty image fetches to `unavailable-asset`.
   - Repeated sharing succeeds identically without mutating `earnedAwards`, `cardViewed`, `hubAnnouncementAcked`, `earnedOn`, or `completedChallenges`.
5. **Accessible standalone UI (`EarnedCardShareControl`)**:
   - Provides a 44px-minimum-height keyboard-focusable Share button, `aria-busy` state while exporting, live-region `role="status"` / `role="alert"` announcements, disabled explanation via `aria-describedby` for ineligible cards, and a `"Copy card text"` helper after download fallback when Clipboard API is available.

## Verification results

| Check | Result |
| --- | --- |
| `node --experimental-strip-types --test tests/cardSharing/cardSharingService.test.ts` | Passed: 8 tests covering required earned-membership validation, fail-closed `rightsStatus` allowlist & `shareEligible` rejection, unauthorized asset rejection, composed canvas export with untruncated explanation/reference/attribution, download fallback, native share hook, cancellation, permission denial, unavailable assets, and repeated sharing without award/progress mutation |
| `npx playwright test -c tests/cardSharing/playwright.config.ts` | Passed: 3 Chromium tests covering real `<canvas>` export composition with export-only Bibleberry attribution, Web Share, download fallback (including verifying the delivered PNG file on disk), cancellation, 404 unavailable asset, rights-rejected (`Unverified` and `pending editorial clearance`) disabled states, keyboard activation, and unchanged award flags |
| `npm run lint` | Passed |
| `npm run build` | Passed (`tsc -b && vite build`) |

## Limits and deferred decisions

- Browser tests exercise headless Chromium with mocked `cdn.sanity.io` PNG responses and stubbed `navigator.share` / `navigator.canShare` APIs; real iOS/Android native share sheets and Capacitor Share plugin wiring remain deferred to host integration.
- Final Bibleberry watermark/logo typography and exact placement remain deferred per the November 8 approved reader experience §7.
