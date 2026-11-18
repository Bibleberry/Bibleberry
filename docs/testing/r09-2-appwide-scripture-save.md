# R09-2: Reusable App-Wide Save Scripture Control

## Overview

Implemented a standalone, reusable **Save Scripture** interface and embeddable UI control under `src/scriptureCapture/` and `src/components/scriptureCapture/` without modifying `src/App.tsx`, existing CMS Challenge controls, `SavedScriptureHost`, account sync, or authentication.

## Files & Entry Points

- **Pure domain & controller (`src/scriptureCapture/`):**
  - `types.ts`: Typed capture input (`ScriptureCaptureInput`), validated citation payload (`ValidatedScriptureCapture`), state (`ScriptureCaptureState`), and controller (`ScriptureCaptureController`).
  - `validation.ts`:
    - `validateScriptureReference(rawReference)`: Validates Bible citation structure (supports numbered books, multi-word books, Unicode/accented names, multi-passage `;` citations, chapter-only citations, and verse ranges) while rejecting empty strings, control characters, markup/URLs, excessive length, and pasted manuscript text.
    - `validateScriptureCaptureInput(input, allowedNamespace)`: Normalizes `reference` and `translation` (`'Not configured'` or blank -> `null`), computes `SavedScriptureKey`, validates optional legitimate Challenge provenance (`AdmittedChallenge` or validated `CanonicalChallengeId`), and strips any extra properties (such as `passage`) so copyrighted manuscript text is never persisted.
  - `model.ts`:
    - `selectScriptureCaptureState(snapshot, input, allowedNamespace)`: Pure selector deriving saved/unsaved state, hydration state, storage health (`corruptStoredData`, `unsupportedNewerSchema`, `writeFailed`, `storageUnavailable`), retry availability, and validation status.
    - `buildSetScriptureSavedCommand(validated, saved, savedOn)`: Produces canonical `setScriptureSaved` commands for `ReaderParticipationStore`.
  - `controller.ts`: `createScriptureCaptureController(store, options)` for imperative/non-React integrations with duplicate prevention (`save` / `remove` / `toggle` / `retry`).
- **Embeddable React UI (`src/components/scriptureCapture/`):**
  - `useSaveScripture.ts`: React hook subscribing to any `ReaderParticipationStore` (defaulting to `defaultGuestParticipationStore`).
  - `SaveScriptureButton.tsx`: Accessible toggle button (`aria-pressed`, `aria-label` with citation + explicit translation, `aria-busy`, 44px minimum touch target, compact variant).
  - `SaveScriptureControl.tsx`: Store-connected embeddable control handling validation, async hydration, pending writes, write-failure `Retry save` (`store.flushPending()`), and non-destructive corrupt/newer-schema safety.
  - `scriptureCapture.css`: Scoped styles with `:focus-visible` outlines and theme variable fallbacks.

## Integration Handoff

Any reader surface (Month Screen, Library, News, Earned Card Viewer, etc.) can embed `SaveScriptureControl`:

```tsx
import { SaveScriptureControl } from '../components/scriptureCapture'

<SaveScriptureControl
  reference="John 3:16"
  translation="WEBP"
  compact
/>
```

When embedded inside an admitted Challenge surface, pass `sourceChallenge={admittedChallenge}` so legitimate Challenge provenance is recorded without allowing forged or draft Challenge IDs.

## Verification Scope

- **Unit & store integration tests:**
  - `node --experimental-strip-types --test tests/scriptureCapture/*.test.ts`
  - Covers citation validation, malformed/manuscript rejection, translation differences, duplicate prevention, user-controlled removal, legitimate vs. forged Challenge provenance, web `localStorage` & async Capacitor Preferences injected stores, hydration gating, write-failure retry, and corrupt/newer-schema safety.
- **Browser E2E & accessibility tests:**
  - `npx playwright test -c tests/scriptureCapture/playwright.config.ts`
  - Uses isolated Vite harness at `tests/scriptureCapture/harness/index.html` to verify keyboard activation (`Enter`/`Space`), `aria-pressed`, `aria-label`, touch-target sizing, reload persistence, async hydration, write-failure retry, and corrupt storage safety.
- **Repository checks:**
  - `npm run lint`
  - `npm run build`
  - `npm run test:adapter`
  - `npm run test:native-participation`
