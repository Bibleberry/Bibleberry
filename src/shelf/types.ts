import type {
  CanonicalChallengeId,
  LocalCalendarDate,
  PublicationYearMonth,
} from '../participation/types.ts'
import type { ProposedAccountShelfAdmissionKind } from '../accountSync/types.ts'

/**
 * Pure domain types and constants for the Bibleberry Shelf policy engine.
 *
 * Product authority:
 * - November 8, 2026 Approved Reader Experience (§6, §8, §10)
 * - R13-0 Account Reconciliation Contract (§4.7)
 * - GitHub Issue #129: Shelf Selection, Protection, and Rollover Policy
 *
 * Boundary rules:
 * - Pure reducer and policy selectors only: no localStorage, Sanity API calls,
 *   backend changes, or app-shell wiring.
 * - Shelf holds zero, one, two, or three historical months.
 * - Current and future publication months are strictly excluded from Shelf.
 * - Shelf membership is completely separated from Challenge completions,
 *   earned Scripture cards, Saved Scripture, and deliberate active focus.
 */

// ---------------------------------------------------------------------------
// Capacity Constants
// ---------------------------------------------------------------------------

/** Maximum historical months allowed on the Shelf simultaneously. */
export const MAX_SHELF_CAPACITY = 3 as const

/** Minimum historical months allowed on the Shelf (Shelf can be empty). */
export const MIN_SHELF_CAPACITY = 0 as const

// ---------------------------------------------------------------------------
// Shelf Entry & State Contracts
// ---------------------------------------------------------------------------

/**
 * How a historical month entered the Shelf:
 * - 'readerSelected': Deliberately chosen by the reader from the Library (protected by default).
 * - 'autoAdmitted': Automatically admitted upon monthly rollover after qualifying participation.
 */
export type ShelfAdmissionKind = ProposedAccountShelfAdmissionKind

/**
 * A historical publication month occupying a Shelf slot.
 * Fully compatible with R13-0 ProposedAccountShelfEntry.
 */
export interface ShelfEntry {
  /** The publication month in YYYY-MM format. */
  readonly yearMonth: PublicationYearMonth
  /** Whether the month was reader-selected or auto-admitted at rollover. */
  readonly admissionKind: ShelfAdmissionKind
  /**
   * Explicit protection flag.
   * If true, this month is protected against automatic eviction on rollover.
   * By rule, reader-selected entries are protected by default.
   * Automatically admitted entries are unprotected by default but can be
   * explicitly protected by the reader.
   */
  readonly isProtected: boolean
  /** Local calendar date when this entry was admitted or selected. */
  readonly admittedOn?: LocalCalendarDate
}

/**
 * Pure Shelf state container.
 * Fully compatible with R13-0 ProposedAccountShelfState.
 */
export interface ShelfState {
  /** Ordered list of historical month entries on the Shelf (0 to 3 items). */
  readonly months: readonly ShelfEntry[]
  /**
   * Deliberate active study focus month, if any.
   * Completely separated from Shelf membership: can be null, on the Shelf,
   * or a month studied directly in the Library without Shelf membership.
   */
  readonly activeFocusMonth?: PublicationYearMonth | null
  /** Last updated calendar date of the Shelf state. */
  readonly updatedOn?: LocalCalendarDate
}

// ---------------------------------------------------------------------------
// Action & Parameter Contracts
// ---------------------------------------------------------------------------

/** Parameters for reader-initiated selection of a historical month. */
export interface SelectShelfMonthParams {
  /** The historical month to put on the Shelf. */
  readonly yearMonth: PublicationYearMonth | string
  /** Reference current publication month (used to enforce historical-only invariant). */
  readonly referenceCurrentYearMonth: PublicationYearMonth | string
  /** Calendar date when selected (defaults to current date if omitted). */
  readonly admittedOn?: LocalCalendarDate | string
  /**
   * If the Shelf is already full (3 slots), the reader must specify which
   * existing month on the Shelf to replace. Silent auto-eviction is forbidden for
   * reader selection.
   */
  readonly replaceMonth?: PublicationYearMonth | string
  /** Existing Shelf month to focus, or null to clear, when replacing Active Focus. */
  readonly nextFocus?: PublicationYearMonth | string | null
  /** Calendar date for state update stamping. */
  readonly updatedOn?: LocalCalendarDate | string
}

/** Parameters for putting away a month from the Shelf. */
export interface PutAwayShelfMonthParams {
  /** The month to remove from the Shelf. */
  readonly yearMonth: PublicationYearMonth | string
  /** Remaining Shelf month to focus, or null to clear, when putting away Active Focus. */
  readonly nextFocus?: PublicationYearMonth | string | null
  /** Calendar date for state update stamping. */
  readonly updatedOn?: LocalCalendarDate | string
}

/** Parameters for setting explicit protection on a Shelf month. */
export interface SetShelfMonthProtectionParams {
  /** The month on the Shelf whose protection flag is being modified. */
  readonly yearMonth: PublicationYearMonth | string
  /** Desired protection status. */
  readonly isProtected: boolean
  /** Calendar date for state update stamping. */
  readonly updatedOn?: LocalCalendarDate | string
}

/** Parameters for setting or clearing deliberate active focus. */
export interface SetActiveFocusMonthParams {
  /** The month to focus on, or null to clear deliberate focus. */
  readonly yearMonth: PublicationYearMonth | string | null
  /** Calendar date for state update stamping. */
  readonly updatedOn?: LocalCalendarDate | string
}

/** Parameters for evaluating monthly rollover admission. */
export interface MonthlyRolloverParams {
  /** The newly activated publication month (e.g., '2026-11' or '2027-01'). */
  readonly newCurrentYearMonth: PublicationYearMonth | string
  /**
   * The month that just concluded (e.g., '2026-10' or '2026-12').
   * If omitted, defaults to the immediate prior calendar month of newCurrentYearMonth.
   */
  readonly endingYearMonth?: PublicationYearMonth | string
  /**
   * List or set of distinct Challenge IDs completed by the reader in the ending month.
   * Admission requires at least one distinct completed Challenge.
   */
  readonly completedChallengeIdsInEndingMonth:
    | readonly (CanonicalChallengeId | string)[]
    | ReadonlySet<string>
  /** Calendar date on which rollover takes place. */
  readonly rolloverDate?: LocalCalendarDate | string
  /** Optional extension hook for first-after-rollover resume evaluation. */
  readonly resumeExtension?: FirstPostRolloverResumeExtension
}

// ---------------------------------------------------------------------------
// Result & Disposition Contracts
// ---------------------------------------------------------------------------

export type ShelfActionError =
  | 'invalidMonthIdentifier'
  | 'monthNotHistorical'
  | 'shelfCapacityExceeded'
  | 'replaceMonthNotFound'
  | 'monthNotOnShelf'
  | 'requiresFocusDecision'
  | 'invalidFocusDecision'
  | 'staleShelfConfirmation'
  | 'invalidStateShape'

export type ShelfActionResult<TAction extends string = string> =
  | {
      readonly ok: true
      readonly state: ShelfState
      readonly action: TAction
    }
  | {
      readonly ok: false
      readonly state: ShelfState
      readonly error: ShelfActionError
      readonly message: string
    }

/** Outcome of monthly rollover admission evaluation. */
export type RolloverDisposition =
  | 'admittedToOpenSlot'
  | 'replacedOldestAutoAdmitted'
  | 'retainedInLibraryAllProtected'
  | 'retainedInLibraryNoCompletions'
  | 'alreadyOnShelf'
  | 'rejectedNotHistorical'
  | 'rejectedInvalidMonth'

export interface RolloverResult {
  readonly ok: boolean
  readonly state: ShelfState
  readonly disposition: RolloverDisposition
  readonly endingYearMonth: PublicationYearMonth | null
  readonly admittedEntry: ShelfEntry | null
  readonly evictedEntry: ShelfEntry | null
  readonly resumeSuggestionSeam: FirstPostRolloverResumeSeam
  readonly message: string
}

// ---------------------------------------------------------------------------
// First-After-Rollover Resume Extension Seam
// ---------------------------------------------------------------------------

/**
 * Extension boundary for the deferred first-after-rollover temporary resume behavior.
 *
 * Per November 8, 2026 approved reader experience §6 and §10:
 * "If a reader was interrupted in a just-ended Challenge, preserve its progress even if
 * that month did not enter Shelf. A temporary resume suggestion may surface on the first
 * visit after rollover, then normal focus resumes. The exact 'first visit' technical
 * definition is deferred."
 *
 * Architectural Boundary:
 * This seam documents and exposes the hook point where the future shell/navigation
 * integration can evaluate temporary resume, without prematurely coupling the pure
 * Shelf policy engine to session tracking or unapproved heuristics.
 */
export interface FirstPostRolloverResumeSeam {
  readonly status: 'deferredExtensionPoint'
  readonly endingYearMonth: PublicationYearMonth | null
  readonly candidateInterruptedChallengeId?: string | null
  readonly isFirstVisitAfterRollover?: boolean
  readonly temporaryResumeAllowed: boolean
  readonly policyNotes: string
}

export interface FirstPostRolloverResumeExtension {
  readonly evaluateFirstVisitResume?: (context: {
    readonly endingYearMonth: PublicationYearMonth
    readonly candidateInterruptedChallengeId?: string | null
    readonly isFirstVisitAfterRollover?: boolean
  }) => {
    readonly shouldSurfaceResumeSuggestion: boolean
    readonly suggestedChallengeId?: string | null
    readonly reason?: string
  }
}

// ---------------------------------------------------------------------------
// Account Precedence Reconciliation Contracts
// ---------------------------------------------------------------------------

export interface DisplacedGuestShelfMonthNotice {
  readonly yearMonth: PublicationYearMonth
  readonly disposition: 'preservedInLibraryNotOnShelf'
}

export interface ShelfPrecedenceResolution {
  readonly shelf: ShelfState
  readonly source: 'account' | 'guest' | 'empty'
  readonly displacedGuestMonths: readonly DisplacedGuestShelfMonthNotice[]
}
