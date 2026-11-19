# R09 Save Scripture in ordinary teaching

## Scope

The existing Save Scripture control is shown beside Today’s Passage only for the explicitly supported authored teaching, `november-5-gods-will`. The integration parses the trailing translation label separately from the citation, validates the reference with the accepted Scripture-capture validator, and fails closed for other teachings, draft fixtures, unsupported translations, or malformed citations.

The control uses its default `defaultGuestParticipationStore`. No Challenge provenance is supplied because this static teaching has no canonical admitted Challenge identity. The existing control stores only the validated reference and translation, not passage text.

## Verification

- `node --experimental-strip-types --test tests/appIntegration/teachingScripture.test.ts` — citation extraction and fail-closed eligibility.
- `npx playwright test -c tests/scriptureCapture/playwright.config.ts tests/scriptureCapture/teaching-integration.spec.ts` — keyboard save, reload persistence, saved state, keyboard unsave, draft-fixture exclusion, and passage-text exclusion.
- `npm run lint`
- `npm run build`

The browser test uses the real app in Vite development mode with isolated browser storage. It does not exercise native Capacitor persistence or production gateway-backed teaching.
