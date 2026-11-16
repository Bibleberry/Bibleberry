# R14-9: Earned Scripture Card Sharing and Export

## Scope and ownership

- `src/cardSharing/**`: Earned-card share eligibility validation, complete share payload construction, export-only Bibleberry attribution canvas renderer, and injectable browser/native sharing service.
- `src/components/cardSharing/**`: Accessible standalone `EarnedCardShareControl` component and styles for future integration into the Field Notebook and Month Screen.
- `tests/cardSharing/**`: Node unit tests and Chromium Playwright browser tests with an isolated harness.
- Existing card viewer, Field Notebook, Month Screen, participation store, and CI workflow files remain untouched.

## Verified behavior

1. **Earned & rights validation (`evaluateCardShareEligibility`)**:
   - Verifies canonical monthly award IDs, valid `earnedOn` local calendar dates, matching `participationData.earnedAwards` membership (when supplied), and matching `cardDocumentId`.
   - Enforces `validateEarnedCardSnapshot` allowlist (`https://cdn.sanity.io/images/...` without query/hash/credentials).
   - Rejects `shareEligible: false` (`not-share-eligible`) and unverified, restricted, synthetic, or test-only `rightsStatus` values (`rights-restricted`).
2. **Export-only Bibleberry attribution (`createCanvasCardImageExporter`)**:
   - Fetches the original approved Scripture Card image URL and draws the artwork intact onto an offscreen canvas with a subtle neutral `"Bibleberry"` attribution strip appended only to the exported PNG.
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
| `node --experimental-strip-types --test tests/cardSharing/cardSharingService.test.ts` | Passed: 7 tests covering earned validation, rights/`shareEligible` rejection, unauthorized asset rejection, export integrity, download fallback, native share hook, cancellation, permission denial, unavailable assets, and repeated sharing without award/progress mutation |
| `npx playwright test -c tests/cardSharing/playwright.config.ts` | Passed: 3 Chromium tests covering real `<canvas>` export with export-only Bibleberry attribution strip, Web Share, download fallback, cancellation, 404 unavailable asset, rights-rejected disabled state, keyboard activation, and unchanged award flags |
| `npm run lint` | Passed |
| `npm run build` | Passed (`tsc -b && vite build`) |

## Limits and deferred decisions

- Browser tests exercise headless Chromium with mocked `cdn.sanity.io` PNG responses and stubbed `navigator.share` / `navigator.canShare` APIs; real iOS/Android native share sheets and Capacitor Share plugin wiring remain deferred to host integration.
- Final Bibleberry watermark/logo typography and exact placement remain deferred per the November 8 approved reader experience §7.
