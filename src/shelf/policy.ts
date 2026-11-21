import { parseLocalCalendarDate } from '../participation/identity.ts'
import type {
  LocalCalendarDate,
  PublicationYearMonth,
} from '../participation/types.ts'
import type { ProposedAccountShelfState } from '../accountSync/types.ts'
import {
  MAX_SHELF_CAPACITY,
  type DisplacedGuestShelfMonthNotice,
  type FirstPostRolloverResumeExtension,
  type FirstPostRolloverResumeSeam,
  type MonthlyRolloverParams,
  type PutAwayShelfMonthParams,
  type RolloverResult,
  type SelectShelfMonthParams,
  type SetActiveFocusMonthParams,
  type SetShelfMonthProtectionParams,
  type ShelfActionResult,
  type ShelfEntry,
  type ShelfPrecedenceResolution,
  type ShelfState,
} from './types.ts'
import {
  comparePublicationYearMonths,
  getPreviousPublicationYearMonth,
  isHistoricalPublicationYearMonth,
  isShelfEntryProtected,
  parseValidPublicationYearMonth,
} from './validation.ts'

/**
 * Pure Shelf policy and state reducer engine.
 *
 * All operations are purely functional, deterministic, and return frozen immutable states.
 * No global state, persistent storage, or side effects.
 */

// ---------------------------------------------------------------------------
// Factory Helpers
// ---------------------------------------------------------------------------

/**
 * Creates an empty, valid ShelfState (0 historical months).
 */
export function createEmptyShelfState(updatedOn?: LocalCalendarDate): ShelfState {
  return Object.freeze({
    months: Object.freeze([]),
    activeFocusMonth: null,
    ...(updatedOn ? { updatedOn } : {}),
  })
}

// ---------------------------------------------------------------------------
// Oldest Auto-Admitted Selector
// ---------------------------------------------------------------------------

/**
 * Locates the oldest unprotected, automatically admitted month entry on the Shelf.
 *
 * Deterministic eviction ordering:
 * 1. Prioritize earlier `admittedOn` calendar date (older admission date).
 * 2. If dates tie or are absent, prioritize earlier `yearMonth` (older publication month).
 * 3. If still tied, prioritize earlier array slot index (stable FIFO tie-break).
 *
 * Returns null when no unprotected, non-focused automatically admitted month is eligible.
 */
export function findOldestAutoAdmittedMonth(
  months: readonly ShelfEntry[],
  activeFocusMonth: PublicationYearMonth | null = null,
): ShelfEntry | null {
  const eligible = months
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) =>
      entry.admissionKind === 'autoAdmitted' &&
      !isShelfEntryProtected(entry) &&
      entry.yearMonth !== activeFocusMonth,
    )

  if (eligible.length === 0) return null

  eligible.sort((a, b) => {
    // 1. Compare admittedOn date if both have it
    if (a.entry.admittedOn && b.entry.admittedOn) {
      if (a.entry.admittedOn < b.entry.admittedOn) return -1
      if (a.entry.admittedOn > b.entry.admittedOn) return 1
    } else if (a.entry.admittedOn && !b.entry.admittedOn) {
      // An entry with known explicit admittedOn is prioritized for deterministic ordering
      return -1
    } else if (!a.entry.admittedOn && b.entry.admittedOn) {
      return 1
    }

    // 2. Compare publication year-month chronologically (e.g., '2026-07' < '2026-08')
    const ymComparison = comparePublicationYearMonths(a.entry.yearMonth, b.entry.yearMonth)
    if (ymComparison !== 0) return ymComparison

    // 3. Array slot index
    return a.index - b.index
  })

  return eligible[0]?.entry ?? null
}

// ---------------------------------------------------------------------------
// Reader Selection Reducer
// ---------------------------------------------------------------------------

/**
 * Reader explicitly selects a historical month from the Library to add to the Shelf.
 *
 * Policy:
 * - Selected month MUST be strictly historical (< referenceCurrentYearMonth).
 * - Reader-selected entries are protected by default against automatic rollover eviction.
 * - If the month is already on the Shelf, promotes/retains it as `readerSelected` and protected.
 * - If the Shelf has open slots (< 3), adds the month.
 * - If the Shelf is full (3 slots), silent auto-eviction is FORBIDDEN. Reader must
 *   explicitly specify `replaceMonth` (a month currently on the Shelf to replace),
 *   otherwise the operation fails with `shelfCapacityExceeded`.
 */
export function selectShelfMonth(
  state: ShelfState,
  params: SelectShelfMonthParams,
): ShelfActionResult<'added' | 'replaced' | 'promotedToProtected'> {
  const ym = parseValidPublicationYearMonth(params.yearMonth)
  const currentYm = parseValidPublicationYearMonth(params.referenceCurrentYearMonth)

  if (!ym) {
    return {
      ok: false,
      state,
      error: 'invalidMonthIdentifier',
      message: `Invalid publication year-month: "${String(params.yearMonth)}"`,
    }
  }

  if (!currentYm) {
    return {
      ok: false,
      state,
      error: 'invalidMonthIdentifier',
      message: `Invalid reference current month: "${String(params.referenceCurrentYearMonth)}"`,
    }
  }

  if (!isHistoricalPublicationYearMonth(ym, currentYm)) {
    return {
      ok: false,
      state,
      error: 'monthNotHistorical',
      message: `Month ${ym} is not historical relative to current month ${currentYm}. Current and future months cannot be placed on Shelf.`,
    }
  }

  const admittedOn = params.admittedOn ? parseLocalCalendarDate(params.admittedOn) ?? undefined : undefined
  const updatedOn = params.updatedOn ? parseLocalCalendarDate(params.updatedOn) ?? undefined : undefined

  // 1. Month already on Shelf?
  const existingIndex = state.months.findIndex(entry => entry.yearMonth === ym)
  if (existingIndex >= 0) {
    const existing = state.months[existingIndex]!
    const updatedEntry: ShelfEntry = Object.freeze({
      yearMonth: ym,
      admissionKind: 'readerSelected',
      isProtected: true,
      admittedOn: admittedOn ?? existing.admittedOn,
    })

    const newMonths = [...state.months]
    newMonths[existingIndex] = updatedEntry

    return {
      ok: true,
      state: Object.freeze({
        ...state,
        months: Object.freeze(newMonths),
        ...(updatedOn ? { updatedOn } : {}),
      }),
      action: 'promotedToProtected',
    }
  }

  // 2. Shelf has capacity?
  if (state.months.length < MAX_SHELF_CAPACITY) {
    const newEntry: ShelfEntry = Object.freeze({
      yearMonth: ym,
      admissionKind: 'readerSelected',
      isProtected: true,
      ...(admittedOn ? { admittedOn } : {}),
    })

    return {
      ok: true,
      state: Object.freeze({
        ...state,
        months: Object.freeze([...state.months, newEntry]),
        ...(updatedOn ? { updatedOn } : {}),
      }),
      action: 'added',
    }
  }

  // 3. Shelf is full (3 slots): requires explicit replaceMonth
  if (!params.replaceMonth) {
    return {
      ok: false,
      state,
      error: 'shelfCapacityExceeded',
      message: `Shelf is full (${MAX_SHELF_CAPACITY} historical months). Reader must specify replaceMonth to swap an existing month.`,
    }
  }

  const replaceYm = parseValidPublicationYearMonth(params.replaceMonth)
  if (!replaceYm) {
    return {
      ok: false,
      state,
      error: 'replaceMonthNotFound',
      message: `Invalid replaceMonth identifier: "${String(params.replaceMonth)}"`,
    }
  }

  const replaceIndex = state.months.findIndex(entry => entry.yearMonth === replaceYm)
  if (replaceIndex < 0) {
    return {
      ok: false,
      state,
      error: 'replaceMonthNotFound',
      message: `Specified replaceMonth ${replaceYm} was not found on the Shelf.`,
    }
  }

  const newEntry: ShelfEntry = Object.freeze({
    yearMonth: ym,
    admissionKind: 'readerSelected',
    isProtected: true,
    ...(admittedOn ? { admittedOn } : {}),
  })

  const newMonths = [...state.months]
  newMonths[replaceIndex] = newEntry

  return {
    ok: true,
    state: Object.freeze({
      ...state,
      months: Object.freeze(newMonths),
      ...(updatedOn ? { updatedOn } : {}),
    }),
    action: 'replaced',
  }
}

// ---------------------------------------------------------------------------
// Put Away Reducer
// ---------------------------------------------------------------------------

/**
 * Reader puts away a month from the Shelf.
 *
 * Pure invariant:
 * "Reader Put Away only removes membership. It must not mutate Challenge completions,
 * earned cards, saved Scripture, resume, or earned dates."
 *
 * Active focus is also modeled independently and preserved unless explicitly cleared.
 */
export function putAwayShelfMonth(
  state: ShelfState,
  params: PutAwayShelfMonthParams | PublicationYearMonth | string,
): ShelfActionResult<'removed' | 'noop'> {
  const ymRaw = typeof params === 'string' ? params : params.yearMonth
  const ym = parseValidPublicationYearMonth(ymRaw)

  if (!ym) {
    return {
      ok: false,
      state,
      error: 'invalidMonthIdentifier',
      message: `Invalid publication year-month for Put Away: "${String(ymRaw)}"`,
    }
  }

  const existingIndex = state.months.findIndex(entry => entry.yearMonth === ym)
  if (existingIndex < 0) {
    // Idempotent: putting away a month not on the shelf is a safe no-op
    return {
      ok: true,
      state,
      action: 'noop',
    }
  }

  const updatedOnRaw = typeof params === 'object' && params !== null ? params.updatedOn : undefined
  const updatedOn = updatedOnRaw ? parseLocalCalendarDate(updatedOnRaw) ?? undefined : undefined

  const newMonths = state.months.filter(entry => entry.yearMonth !== ym)

  return {
    ok: true,
    state: Object.freeze({
      ...state,
      months: Object.freeze(newMonths),
      ...(updatedOn ? { updatedOn } : {}),
    }),
    action: 'removed',
  }
}

// ---------------------------------------------------------------------------
// Protection Toggle Reducer
// ---------------------------------------------------------------------------

/**
 * Sets explicit protection on an existing Shelf month entry.
 * Protecting an automatically admitted month prevents it from being evicted on future rollovers.
 */
export function setShelfMonthProtection(
  state: ShelfState,
  params: SetShelfMonthProtectionParams,
): ShelfActionResult<'protectionUpdated'> {
  const ym = parseValidPublicationYearMonth(params.yearMonth)

  if (!ym) {
    return {
      ok: false,
      state,
      error: 'invalidMonthIdentifier',
      message: `Invalid publication year-month for protection: "${String(params.yearMonth)}"`,
    }
  }

  const existingIndex = state.months.findIndex(entry => entry.yearMonth === ym)
  if (existingIndex < 0) {
    return {
      ok: false,
      state,
      error: 'monthNotOnShelf',
      message: `Month ${ym} is not on the Shelf. Protection can only be set on active Shelf entries.`,
    }
  }

  const existing = state.months[existingIndex]!
  const updatedOn = params.updatedOn ? parseLocalCalendarDate(params.updatedOn) ?? undefined : undefined

  const updatedEntry: ShelfEntry = Object.freeze({
    ...existing,
    isProtected: params.isProtected,
  })

  const newMonths = [...state.months]
  newMonths[existingIndex] = updatedEntry

  return {
    ok: true,
    state: Object.freeze({
      ...state,
      months: Object.freeze(newMonths),
      ...(updatedOn ? { updatedOn } : {}),
    }),
    action: 'protectionUpdated',
  }
}

// ---------------------------------------------------------------------------
// Deliberate Active Focus Reducers
// ---------------------------------------------------------------------------

/**
 * Sets deliberate active study focus.
 *
 * Invariant:
 * Active study focus is completely independent from Shelf membership and Library browsing.
 * A reader can focus on a month that is on the Shelf, a month studied directly in the Library
 * without Shelf membership, or clear focus (null).
 */
export function setActiveFocusMonth(
  state: ShelfState,
  params: SetActiveFocusMonthParams | PublicationYearMonth | string | null,
): ShelfActionResult<'focusUpdated'> {
  let ym: PublicationYearMonth | null = null
  let updatedOn: LocalCalendarDate | undefined

  if (params === null) {
    ym = null
  } else if (typeof params === 'string') {
    ym = parseValidPublicationYearMonth(params)
    if (!ym) {
      return {
        ok: false,
        state,
        error: 'invalidMonthIdentifier',
        message: `Invalid publication year-month for active focus: "${params}"`,
      }
    }
  } else if (typeof params === 'object' && params !== null) {
    if (params.yearMonth === null) {
      ym = null
    } else {
      ym = parseValidPublicationYearMonth(params.yearMonth)
      if (!ym) {
        return {
          ok: false,
          state,
          error: 'invalidMonthIdentifier',
          message: `Invalid publication year-month for active focus: "${String(params.yearMonth)}"`,
        }
      }
    }
    if (params.updatedOn) {
      updatedOn = parseLocalCalendarDate(params.updatedOn) ?? undefined
    }
  }

  return {
    ok: true,
    state: Object.freeze({
      ...state,
      activeFocusMonth: ym,
      ...(updatedOn ? { updatedOn } : {}),
    }),
    action: 'focusUpdated',
  }
}

/**
 * Pure convenience helper to clear deliberate active focus.
 */
export function clearActiveFocusMonth(
  state: ShelfState,
  updatedOn?: LocalCalendarDate,
): ShelfState {
  return Object.freeze({
    ...state,
    activeFocusMonth: null,
    ...(updatedOn ? { updatedOn } : {}),
  })
}

// ---------------------------------------------------------------------------
// Monthly Rollover Engine
// ---------------------------------------------------------------------------

/**
 * Creates the extension boundary seam for the deferred first-after-rollover resume behavior.
 */
export function createFirstPostRolloverResumeSeam(params: {
  readonly endingYearMonth: PublicationYearMonth | null
  readonly candidateInterruptedChallengeId?: string | null
  readonly isFirstVisitAfterRollover?: boolean
  readonly extension?: FirstPostRolloverResumeExtension
}): FirstPostRolloverResumeSeam {
  const extensionResult = params.extension?.evaluateFirstVisitResume?.({
    endingYearMonth: params.endingYearMonth ?? ('' as PublicationYearMonth),
    candidateInterruptedChallengeId: params.candidateInterruptedChallengeId,
    isFirstVisitAfterRollover: params.isFirstVisitAfterRollover,
  })

  return Object.freeze({
    status: 'deferredExtensionPoint',
    endingYearMonth: params.endingYearMonth,
    candidateInterruptedChallengeId:
      extensionResult?.suggestedChallengeId ?? params.candidateInterruptedChallengeId ?? null,
    isFirstVisitAfterRollover: params.isFirstVisitAfterRollover,
    temporaryResumeAllowed: extensionResult?.shouldSurfaceResumeSuggestion ?? false,
    policyNotes:
      'Per November 8 approved reader experience §6 and §10: first-after-rollover temporary resume ' +
      'is deferred for technical visitor/session specification. This extension seam provides the pure ' +
      'policy boundary without guessing or coupling to ephemeral client heuristics.',
  })
}

/**
 * Applies monthly rollover to the Shelf.
 *
 * Rules:
 * 1. Identify just-ended month (endingYearMonth defaults to previous calendar month of newCurrentYearMonth).
 * 2. Idempotence: If endingYearMonth is already on the Shelf, no state mutation occurs.
 * 3. Qualifying participation: Reader must have completed at least one distinct Challenge in the ending month.
 *    If 0 completions, ending month is NOT admitted and remains in the Library.
 * 4. Admission with open slot: If Shelf has < 3 slots, admitted as `autoAdmitted` and unprotected.
 * 5. Replacement on full Shelf (3 slots):
 *    - Replaces the oldest unprotected `autoAdmitted` month outside Active Focus.
 *    - If every slot is protected by Keep or Active Focus, the just-ended month remains in the Library.
 * 6. Active focus is NEVER silently rewritten by rollover.
 */
export function applyMonthlyRollover(
  state: ShelfState,
  params: MonthlyRolloverParams,
): RolloverResult {
  const newCurrentYm = parseValidPublicationYearMonth(params.newCurrentYearMonth)
  if (!newCurrentYm) {
    return {
      ok: false,
      state,
      disposition: 'rejectedInvalidMonth',
      endingYearMonth: null,
      admittedEntry: null,
      evictedEntry: null,
      resumeSuggestionSeam: createFirstPostRolloverResumeSeam({
        endingYearMonth: null,
        extension: params.resumeExtension,
      }),
      message: `Invalid newCurrentYearMonth: "${String(params.newCurrentYearMonth)}"`,
    }
  }

  const endingYm = params.endingYearMonth
    ? parseValidPublicationYearMonth(params.endingYearMonth)
    : getPreviousPublicationYearMonth(newCurrentYm)

  if (!endingYm) {
    return {
      ok: false,
      state,
      disposition: 'rejectedInvalidMonth',
      endingYearMonth: null,
      admittedEntry: null,
      evictedEntry: null,
      resumeSuggestionSeam: createFirstPostRolloverResumeSeam({
        endingYearMonth: null,
        extension: params.resumeExtension,
      }),
      message: `Invalid endingYearMonth: "${String(params.endingYearMonth)}"`,
    }
  }

  // Ending month must be strictly historical relative to new current month
  if (!isHistoricalPublicationYearMonth(endingYm, newCurrentYm)) {
    return {
      ok: false,
      state,
      disposition: 'rejectedNotHistorical',
      endingYearMonth: endingYm,
      admittedEntry: null,
      evictedEntry: null,
      resumeSuggestionSeam: createFirstPostRolloverResumeSeam({
        endingYearMonth: endingYm,
        extension: params.resumeExtension,
      }),
      message: `Ending month ${endingYm} is not historical relative to new current month ${newCurrentYm}.`,
    }
  }

  const rolloverDate = params.rolloverDate
    ? parseLocalCalendarDate(params.rolloverDate) ?? undefined
    : undefined

  const resumeSeam = createFirstPostRolloverResumeSeam({
    endingYearMonth: endingYm,
    extension: params.resumeExtension,
  })

  // 1. Idempotence: If ending month is already on the Shelf, do nothing
  if (state.months.some(m => m.yearMonth === endingYm)) {
    return {
      ok: true,
      state,
      disposition: 'alreadyOnShelf',
      endingYearMonth: endingYm,
      admittedEntry: null,
      evictedEntry: null,
      resumeSuggestionSeam: resumeSeam,
      message: `Ending month ${endingYm} is already present on the Shelf. Rollover is idempotent.`,
    }
  }

  // 2. Qualifying participation: At least one completed Challenge in ending month
  const completionsCount =
    params.completedChallengeIdsInEndingMonth instanceof Set
      ? params.completedChallengeIdsInEndingMonth.size
      : new Set(params.completedChallengeIdsInEndingMonth).size

  if (completionsCount === 0) {
    return {
      ok: true,
      state,
      disposition: 'retainedInLibraryNoCompletions',
      endingYearMonth: endingYm,
      admittedEntry: null,
      evictedEntry: null,
      resumeSuggestionSeam: resumeSeam,
      message: `Ending month ${endingYm} had zero completed Challenges. Retained in Library without Shelf admission.`,
    }
  }

  const newEntry: ShelfEntry = Object.freeze({
    yearMonth: endingYm,
    admissionKind: 'autoAdmitted',
    isProtected: false,
    ...(rolloverDate ? { admittedOn: rolloverDate } : {}),
  })

  // 3. Open slot (< 3): Admit directly
  if (state.months.length < MAX_SHELF_CAPACITY) {
    const nextState: ShelfState = Object.freeze({
      ...state,
      months: Object.freeze([...state.months, newEntry]),
      ...(rolloverDate ? { updatedOn: rolloverDate } : {}),
    })

    return {
      ok: true,
      state: nextState,
      disposition: 'admittedToOpenSlot',
      endingYearMonth: endingYm,
      admittedEntry: newEntry,
      evictedEntry: null,
      resumeSuggestionSeam: resumeSeam,
      message: `Ending month ${endingYm} automatically admitted to open Shelf slot (${nextState.months.length}/${MAX_SHELF_CAPACITY}).`,
    }
  }

  // 4. Shelf is full: find the oldest unprotected auto-admitted month outside Active Focus.
  const oldestAuto = findOldestAutoAdmittedMonth(state.months, state.activeFocusMonth)

  if (!oldestAuto) {
    return {
      ok: true,
      state,
      disposition: 'retainedInLibraryAllProtected',
      endingYearMonth: endingYm,
      admittedEntry: null,
      evictedEntry: null,
      resumeSuggestionSeam: resumeSeam,
      message: `All ${MAX_SHELF_CAPACITY} Shelf slots are protected by Keep or Active Focus. Month ${endingYm} retained in Library without auto-eviction.`,
    }
  }

  // Replace oldest unprotected auto-admitted month
  const evictedYm = oldestAuto.yearMonth
  const nextMonths = state.months.map(m => (m.yearMonth === evictedYm ? newEntry : m))

  const nextState: ShelfState = Object.freeze({
    ...state,
    months: Object.freeze(nextMonths),
    ...(rolloverDate ? { updatedOn: rolloverDate } : {}),
  })

  return {
    ok: true,
    state: nextState,
    disposition: 'replacedOldestAutoAdmitted',
    endingYearMonth: endingYm,
    admittedEntry: newEntry,
    evictedEntry: oldestAuto,
    resumeSuggestionSeam: resumeSeam,
    message: `Ending month ${endingYm} replaced oldest auto-admitted month ${evictedYm} on the Shelf.`,
  }
}

// ---------------------------------------------------------------------------
// Account Precedence Reconciliation Selector
// ---------------------------------------------------------------------------

/**
 * Reconciles Shelf states per November 8 spec / R13-0 precedence:
 * - If the authenticated account has an explicit Shelf state (even empty),
 *   it takes full precedence over guest selections.
 * - Any guest Shelf months displaced by the account Shelf are recorded as
 *   'preservedInLibraryNotOnShelf'.
 * - When account Shelf is absent (newAccountTransfer), guest Shelf is accepted
 *   up to MAX_SHELF_CAPACITY slots.
 */
export function reconcileShelfWithAccountPrecedence(params: {
  readonly accountShelf?: ShelfState | ProposedAccountShelfState
  readonly guestShelf?: ShelfState | ProposedAccountShelfState
}): ShelfPrecedenceResolution {
  const displaced: DisplacedGuestShelfMonthNotice[] = []

  if (params.accountShelf !== undefined) {
    // Account Shelf takes full precedence
    const accountYmSet = new Set(params.accountShelf.months.map(m => m.yearMonth))

    if (params.guestShelf?.months) {
      for (const guestEntry of params.guestShelf.months) {
        if (!accountYmSet.has(guestEntry.yearMonth)) {
          displaced.push(
            Object.freeze({
              yearMonth: guestEntry.yearMonth,
              disposition: 'preservedInLibraryNotOnShelf',
            }),
          )
        }
      }
    }

    const convertedMonths: ShelfEntry[] = params.accountShelf.months.map(m =>
      Object.freeze({
        yearMonth: m.yearMonth,
        admissionKind: m.admissionKind,
        isProtected: isShelfEntryProtected(m),
        ...(m.admittedOn ? { admittedOn: m.admittedOn } : {}),
      }),
    )

    const normalizedAccountShelf: ShelfState = Object.freeze({
      months: Object.freeze(convertedMonths),
      activeFocusMonth: params.accountShelf.activeFocusMonth ?? null,
      ...(params.accountShelf.updatedOn ? { updatedOn: params.accountShelf.updatedOn } : {}),
    })

    return Object.freeze({
      shelf: normalizedAccountShelf,
      source: 'account',
      displacedGuestMonths: Object.freeze(displaced),
    })
  }

  if (params.guestShelf !== undefined) {
    const cappedMonths = params.guestShelf.months.slice(0, MAX_SHELF_CAPACITY)
    const convertedMonths: ShelfEntry[] = cappedMonths.map(m =>
      Object.freeze({
        yearMonth: m.yearMonth,
        admissionKind: m.admissionKind,
        isProtected: isShelfEntryProtected(m),
        ...(m.admittedOn ? { admittedOn: m.admittedOn } : {}),
      }),
    )

    const normalizedGuestShelf: ShelfState = Object.freeze({
      months: Object.freeze(convertedMonths),
      activeFocusMonth: params.guestShelf.activeFocusMonth ?? null,
      ...(params.guestShelf.updatedOn ? { updatedOn: params.guestShelf.updatedOn } : {}),
    })

    return Object.freeze({
      shelf: normalizedGuestShelf,
      source: 'guest',
      displacedGuestMonths: Object.freeze([]),
    })
  }

  return Object.freeze({
    shelf: createEmptyShelfState(),
    source: 'empty',
    displacedGuestMonths: Object.freeze([]),
  })
}
