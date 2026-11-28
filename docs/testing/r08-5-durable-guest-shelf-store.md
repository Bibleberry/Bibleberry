# R08-5: Durable Guest Shelf Store & Native/Web Storage Boundary

**Issue:** `Bibleberry/Bibleberry#162`  
**Phase:** Phase 05 / R08-5  
**Base:** `main` (`425fcbb56e7d8a474c6cc732342860ef215199eb`)

## 1. Scope & Write Ownership

All changes are strictly confined to:
- `src/shelfPersistence/**` (`types.ts`, `persistence.ts`, `store.ts`, `defaultGuestShelfStore.ts`, `useGuestShelfStore.ts`, `shelfHostAdapter.ts`, `index.ts`)
- `tests/shelfPersistence/**` (`envelopeAndValidation.test.ts`, `storeAndConcurrency.test.ts`, `rolloverAndAdapter.test.ts`)
- `docs/testing/r08-5-durable-guest-shelf-store.md`

No files in `src/App.tsx`, `src/appIntegration/**`, `src/components/shelf/**`, `src/components/library/**`, `src/shelf/**`, `src/accountSync/**`, `src/participation/**`, `src/native/**`, `studio/**`, `src/gateway/**`, or `.github/workflows/**` were modified.

## 2. Implemented Capabilities

1. **Versioned, Strict-Parse Persistence Envelope (`src/shelfPersistence/types.ts`, `src/shelfPersistence/persistence.ts`)**
   - Isolated storage key: `GUEST_SHELF_STORAGE_KEY = 'bibleberry-guest-shelf-v1'`, strictly separate from `GUEST_PARTICIPATION_STORAGE_KEY` (`bibleberry-reader-participation-v1`).
   - `GuestShelfEnvelopeV1` (`schemaVersion: 1`) encodes `ShelfState` (0–3 historical months, `admissionKind`, `isProtected`, `activeFocusMonth`, optional `admittedOn` / `updatedOn` `LocalCalendarDate`s) and optional `rolloverWatermark`.
   - Validates loaded state with `validateShelfState` (including optional `referenceCurrentMonth` historical-only enforcement).
   - Fail-closed health reporting (`ok`, `corruptStoredData`, `unsupportedNewerSchema`, `storageUnavailable`, `writeFailed`): corrupt JSON, invalid shapes, non-historical months, and `schemaVersion > 1` are never silently overwritten on subsequent flushes.

2. **Reactive Platform-Neutral Store & Race Protection (`src/shelfPersistence/store.ts`)**
   - Exposes `getSnapshot()` (`Object.is`-cached for React 19 `useSyncExternalStore`), `subscribe()`, `whenReady()`, `flushPending()`, `clearLocalData()`, and `dispose()`.
   - Serializes all adapter I/O on a strict FIFO queue with a monotonic `epoch` and `AbortController`:
     - Early actions dispatched while `status === 'hydrating'` queue behind initial `load()` and replay onto loaded state.
     - Transient write failures retain `pendingCommands` (`hasPendingWrites: true`, `health: 'writeFailed'`) and retry cleanly on `flushPending()` or subsequent actions.
     - `clearLocalData()` increments `epoch`, aborts in-flight writes, and prevents stale async hydration or writes from resurrecting cleared data.

3. **Platform Driver Reuse (`src/shelfPersistence/defaultGuestShelfStore.ts`)**
   - Reuses `KeyValueStorageDriver`, `createWebLocalStorageDriver`, and `createCapacitorPreferencesDriver` from `src/participation/`.
   - Web uses injectable `localStorage`; installed iOS/Android uses injectable Capacitor `Preferences` (avoiding `Proxy.then` assimilation).

4. **Policy-Driven Actions & Idempotent Monthly Rollover**
   - Typed actions `select`, `protect`, `unprotect`, `setProtection`, `putAway`, `setFocus`, and `clearFocus` compose `src/shelf/policy.ts` directly.
   - `activeFocusMonth` remains independent from Shelf membership; full-Shelf selection rejects without explicit `replaceMonth`.
   - `evaluateMonthlyRollover` composes `applyMonthlyRollover` using caller-supplied `newCurrentYearMonth` and `completedChallengeIdsInEndingMonth` without inferring server time, inventing a scheduler, or mutating participation records.

5. **State-to-`ShelfHost` Adapter (`src/shelfPersistence/shelfHostAdapter.ts`, `src/shelfPersistence/useGuestShelfStore.ts`)**
   - `buildShelfHostPropsFromGuestStore` maps `GuestShelfStore` + `GuestShelfSnapshot` to `ShelfHostProps` (`state` + `onStateChange` -> `store.applyState`) without modifying `ShelfHost.tsx`.

## 3. Policy Seam & Deferred Integration Notes

- **Rollover watermark seam:** `ShelfState` in `src/shelf/types.ts` does not carry a rollover watermark field. If a reader puts away an auto-admitted month during the same current month, or if a rollover produced `retainedInLibraryNoCompletions` / `retainedInLibraryAllProtected`, calling `applyMonthlyRollover` again without a persisted watermark would re-evaluate (and potentially re-admit) that month. To avoid amending `src/shelf/types.ts` without authorization, `GuestShelfEnvelopeV1` persists `rolloverWatermark` (`lastNewCurrentYearMonth`, `lastEndingYearMonth`, `lastDisposition`) alongside `state`.
- **Deferred integration:** App-shell wiring, global navigation, Supabase/account sync merge (`reconcileShelfWithAccountPrecedence`), and deferred first-post-rollover resume heuristics remain out of scope for #162.

## 4. Verification Results

- `node --experimental-strip-types --test tests/shelfPersistence/*.test.ts`: 19/19 passed (Node unit + injected web `localStorage` + injected Capacitor `Preferences` Proxy contract tests).
- `npm run build` (`tsc -b && vite build`): passed (`✓ built in 11.64s`).
- `npm run lint` (`eslint .`): passed (0 errors, 0 warnings).
- **Native runtime limitation:** Tests exercise an injected Capacitor `Preferences` Proxy double in Node (including the `Proxy.then` trap); live iOS Simulator / Android Emulator execution was not run in this Linux worktree.
