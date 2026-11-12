# R15-1: Shelf Selection, Protection, and Rollover Policy Engine

## Overview & Mission

This evidence report documents the pure domain policy engine for the Bibleberry historical **Shelf** (0 to 3 historical months), implemented under GitHub Issue #129 per the November 8, 2026 approved reader experience specification (§6, §8, §10) and R13-0 account reconciliation contract (§4.7).

### Boundary Isolation & Scope

- **Pure policy and reducer engine:** All logic is implemented as deterministic, pure TypeScript functions in `src/shelf/` with zero localStorage writes, zero Sanity API mutations, zero app-shell router coupling, and zero backend changes.
- **Capacity constraint:** Shelf strictly holds between 0 and 3 historical publication months (`MAX_SHELF_CAPACITY = 3`). Empty slots are never auto-filled.
- **Strictly historical:** The active publication month belongs exclusively to the Hub / current teaching and cannot be added to the Shelf. Future months are similarly forbidden.
- **Complete separation of concerns:** Shelf membership is entirely decoupled from:
  1. Challenge completions
  2. Earned Scripture Cards
  3. Personal Saved Scripture
  4. Reading position / resume state
  5. Deliberate active study focus

---

## Implemented Behavior & Policy Rules

### 1. Reader Selection & Protection (`selectShelfMonth`)
- A reader can deliberately select an older month from the Past Teaching Library to add to their Shelf.
- Reader-selected months are marked with `admissionKind: 'readerSelected'` and `isProtected: true`.
- If the Shelf has open slots (< 3), the month is added.
- If the Shelf is already full (3 slots), silent auto-eviction is **forbidden**. The reader must explicitly provide a `replaceMonth` on the Shelf to swap out, otherwise the operation safely rejects with `shelfCapacityExceeded`.
- Re-selecting an existing month promotes an auto-admitted month to `readerSelected` and protected.

### 2. Reader Put Away (`putAwayShelfMonth`)
- Putting away a month removes its Shelf membership only.
- Invariant: Put Away never mutates Challenge completions, earned cards, saved Scripture, or resume records.
- Deliberate active study focus is modeled independently and preserved when a month is put away.
- Putting away an unmounted month is a safe, idempotent no-op.

### 3. Monthly Rollover Engine (`applyMonthlyRollover`)
- Evaluates the transition from `endingYearMonth` to `newCurrentYearMonth`.
- **Qualifying participation:** Requires at least one distinct completed Challenge in the ending month. If zero Challenges were completed, the ending month is not admitted and remains in the Library (`retainedInLibraryNoCompletions`).
- **Open slot (< 3):** Admitted directly with `admissionKind: 'autoAdmitted'` and `isProtected: false`.
- **Full Shelf (3 slots) & Oldest Auto-Admitted Replacement:**
  - Identifies the oldest unprotected auto-admitted month using deterministic sorting:
    1. Earliest `admittedOn` date
    2. Earlier publication `yearMonth`
    3. Slot insertion index (FIFO)
  - Evicts that oldest month and admits the just-ended month (`replacedOldestAutoAdmitted`).
- **"All-Protected No-Eviction" Rule:**
  - If all 3 Shelf slots are protected (whether reader-selected or explicitly protected by the reader), no month is evicted. The just-ended month remains in the Library (`retainedInLibraryAllProtected`).
- **"Protect then Rollover":**
  - Readers can explicitly protect any auto-admitted month (`setShelfMonthProtection`). Protected entries survive subsequent rollovers.
- **December/January Rollover:**
  - Supports year transitions (e.g., rolling over from `2026-12` to `2027-01`) with chronological continuity.
- **Idempotence:**
  - Repeated rollover calls with identical arguments leave Shelf state untouched (`alreadyOnShelf`).

### 4. Active Study Focus (`setActiveFocusMonth`)
- Readers can choose an active study focus independently from Shelf membership.
- Active focus can be set to a month on the Shelf, a month studied directly in the Library without Shelf membership, or cleared (`null`).
- Rollover never silently alters the reader's active focus.

### 5. Deferred First-After-Rollover Resume Extension Seam
Per November 8 approved reader experience §6 and §10:
> *"If a reader was interrupted in a just-ended Challenge, preserve its progress even if that month did not enter Shelf. A temporary resume suggestion may surface on the first visit after rollover, then normal focus resumes. The exact 'first visit' technical definition is deferred."*

The policy engine implements an explicit extension boundary:
- `createFirstPostRolloverResumeSeam(...)`
- Exposes typed status `deferredExtensionPoint` and extension hook `FirstPostRolloverResumeExtension`.
- Pure Shelf engine avoids guessing unapproved session tracking, cookie/localStorage flags, or client-side visit counts.

### 6. Account Precedence Reconciliation (`reconcileShelfWithAccountPrecedence`)
- Fully aligns with November 8 spec and R13-0 §4.7.
- Existing account Shelf state (`accountShelf !== undefined`) takes complete precedence over guest Shelf.
- Any guest Shelf months displaced by account selections are recorded as `preservedInLibraryNotOnShelf`.
- On new account transfer, guest Shelf transfers cleanly up to `MAX_SHELF_CAPACITY` (3 slots).

---

## Test Inventory & Verification

The deterministic test suite consists of 5 files and 40 automated tests:

1. **`tests/shelf/shelfValidation.test.ts` (10 tests)**
   - Strict `PublicationYearMonth` parsing and rejection of malformed tokens, spaces, negative years, and path traversal / SQL injection strings.
   - Chronological comparison and historical-only invariant.
   - Calendar navigation across year boundaries (Dec/Jan).
   - Capacity validation (0, 1, 2, 3 slots pass; 4 slots reject; duplicate months reject).

2. **`tests/shelf/shelfSelectionAndPutAway.test.ts` (10 tests)**
   - Selection into 0, 1, and 2 occupied slots.
   - Rejection on full Shelf without `replaceMonth`.
   - Swap replacement with explicit `replaceMonth`.
   - Promotion of auto-admitted month to `readerSelected` and protected.
   - Rejection of current and future publication months.
   - Put Away membership removal and idempotence.
   - Invariant: non-regression on durable participation data.

3. **`tests/shelf/shelfProtectionAndRollover.test.ts` (9 tests)**
   - Retention in Library when 0 Challenges completed in ending month.
   - Auto-admission into open slots on qualifying participation.
   - Oldest auto-admitted identification and replacement on full Shelf.
   - "Protect then rollover" workflow.
   - "All-protected no-eviction" rule.
   - December to January rollover across calendar boundary.
   - Repeated rollover idempotence.
   - Safe rejection of non-historical or invalid rollover parameters.

4. **`tests/shelf/shelfActiveFocusAndSeparation.test.ts` (7 tests)**
   - Deliberate focus on Shelf month vs direct Library study.
   - Explicit clearing of active focus.
   - Preservation of active focus across Put Away.
   - Rollover leaves deliberate active focus untouched.
   - Extension seam for first-after-rollover resume behavior.
   - Custom resume extension hook integration.

5. **`tests/shelf/shelfAccountPrecedence.test.ts` (4 tests)**
   - Account Shelf precedence over conflicting guest Shelf.
   - Preservation notice `preservedInLibraryNotOnShelf` for displaced guest months.
   - Explicit empty account Shelf precedence.
   - New account transfer with 3-slot capping.
