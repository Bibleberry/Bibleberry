# R09-1: Saved Scripture Collection (Standalone Surface & Handoff)

## Overview

Implemented a standalone, durable V2-store-backed **Saved Scripture** collection under `src/components/savedScripture/` without modifying `src/App.tsx`, central navigation, `src/participation/**`, `src/gateway/**`, or `studio/**`.

## Files & Entry Points

- **Domain & search model:** `src/components/savedScripture/savedScriptureCollectionModel.ts`
  - `projectSavedScriptureCollection(data, { allowedNamespace })` and `projectSavedScripturesFromCandidates(candidates, { allowedNamespace })`: validates, deduplicates, and sorts `SavedScriptureRecord` entries by `savedOn` descending with canonical `key` ascending tie-break, dropping malformed entries and any smuggled passage text fields.
  - `filterSavedScriptures(items, query)`: filters by Scripture reference, Bible book/citation spelling (abbreviations, `Psalm`/`Psalms`, Roman/ordinal prefixes, `Song of Songs`/`Song of Solomon`, dash/colon/whitespace/case normalization, Unicode NFC/NFD), and recorded translation (never fabricating a translation when `translation === null`).
- **Pure collection view:** `src/components/savedScripture/SavedScriptureCollectionView.tsx`
  - Accepts projected `SavedScriptureCollectionItem[]` (directly testable with synthetic fixtures), renders responsive phone-width cards, search/clear controls, loading/read-error/empty/no-match states, citation-only `SavedScriptureDetailsDialog`, `RemoveSavedScriptureConfirmDialog`, polite `aria-live` status feedback, and post-removal focus recovery.
- **Store-injected host:** `src/components/savedScripture/SavedScriptureHost.tsx`
  - Defaults `store` to `defaultGuestParticipationStore`, subscribes via `useReaderParticipation(store)`, dispatches `{ type: 'setScriptureSaved', scripture: { reference, translation }, saved: false, savedOn }` for individual removals without touching `earnedAwards` or `completedChallenges`, and exposes `flushPending()` retry on storage write failures.

## Privacy, Provenance, and Product Boundaries

- Stores and displays **citation and translation metadata only** (`reference`, explicit `translation` or `Translation unspecified`, `savedOn`, and optional non-linked `sourceChallengeId` provenance).
- Never synthesizes or fetches Bible passage manuscripts or third-party translations.
- Never constructs guessed Challenge slugs or deep links from `sourceChallengeId`.
- Distinct from Saved Challenges, Field Notebook earned Scripture Cards, personal notes, and Scripture memorization plans.

## Minimal Future Navigation Integration Handoff

When whole-app navigation placement is approved, mount `SavedScriptureHost` lazily in `src/App.tsx` (or a future router view) behind a feature flag if desired:

```tsx
import { SavedScriptureHost } from './components/savedScripture/SavedScriptureHost'

// Inside the target reader surface:
<SavedScriptureHost
  onExit={() => navigateBack()}
  exitLabel="Back to Hub"
/>
```

No `src/App.tsx` changes were made in this branch (`feat/120-saved-scripture-collection`) to keep concurrent Issue integration conflict-free.

## Verification Scope

- Unit & boundary tests: `node --experimental-strip-types --test tests/savedScripture/*.test.ts`
- Browser E2E / accessibility / persistence / mobile viewport tests: `npx playwright test -c tests/savedScripture/playwright.config.ts` (uses isolated Vite harness at `tests/savedScripture/harness/index.html`)
- Repository checks: `npm run lint`, `npm run build`, `npm run test:adapter`, `npm run test:native-participation`, `npm run test:smoke`
