import type { LibraryShelfSurface } from '../libraryShelf/libraryShelfModel.ts'
import { MAX_SHELF_CAPACITY, type ShelfState } from '../../shelf/types.ts'
import {
  isHistoricalPublicationYearMonth,
  parseValidPublicationYearMonth,
} from '../../shelf/validation.ts'

/**
 * Pure presentation and navigation-boundary helpers for the R06 Library landing
 * (Juniper Signal / Issue #289).
 *
 * Product authority:
 * - Approved Reader Experience (§6.1–§6.3, §6.5)
 *
 * Boundary rules:
 * - Zero browser globals, React state, storage access, or network/Sanity calls.
 * - Composes existing Shelf/Library types without reimplementing Shelf policy,
 *   catalogue loading, or inventing teaching content.
 */

export type R06LibrarySurface = LibraryShelfSurface

export type R06LibraryEntranceId =
  | 'browse-all-months'
  | 'shelf-overview'
  | 'foundations'

export type R06LibraryEntranceAction =
  | 'openLibrary'
  | 'openShelf'
  | 'openFoundations'

export interface R06LibraryEntranceDescriptor {
  readonly id: R06LibraryEntranceId
  readonly label: string
  readonly description: string
  readonly action: R06LibraryEntranceAction
}

export interface R06LibraryLandingViewModel {
  readonly activeSurface: R06LibrarySurface
  readonly shelfCount: number
  readonly maxCapacity: number
  readonly isShelfEmpty: boolean
  readonly isShelfFull: boolean
  readonly entrances: readonly R06LibraryEntranceDescriptor[]
}

export interface R06LibraryHostBackAction {
  readonly mode: 'returnToSurface' | 'outerExit' | 'none'
  readonly targetSurface: R06LibrarySurface | null
  readonly label: string
}

/**
 * Type guard for valid R06 Library surface identifiers.
 */
export function isValidR06LibrarySurface(value: unknown): value is R06LibrarySurface {
  return value === 'shelf' || value === 'library'
}

/**
 * Resolves the initial uncontrolled surface for the R06 Library landing,
 * defaulting safely to the Shelf-centered overview ('shelf').
 */
export function resolveInitialR06LibrarySurface(
  initialSurface?: R06LibrarySurface,
): R06LibrarySurface {
  return isValidR06LibrarySurface(initialSurface) ? initialSurface : 'shelf'
}

/**
 * Resolves the single authoritative active surface across controlled and
 * uncontrolled modes. Controlled props always take precedence when valid.
 */
export function resolveActiveR06LibrarySurface(params: {
  readonly controlledSurface?: R06LibrarySurface
  readonly uncontrolledSurface: R06LibrarySurface
}): R06LibrarySurface {
  if (isValidR06LibrarySurface(params.controlledSurface)) {
    return params.controlledSurface
  }
  return isValidR06LibrarySurface(params.uncontrolledSurface)
    ? params.uncontrolledSurface
    : 'shelf'
}

/**
 * Determines whether a surface transition should execute.
 */
export function canTransitionR06LibrarySurface(
  currentSurface: R06LibrarySurface,
  nextSurface: unknown,
): nextSurface is R06LibrarySurface {
  return isValidR06LibrarySurface(nextSurface) && nextSurface !== currentSurface
}

/**
 * Computes the prior-surface return target across `'shelf'` <-> `'library'`
 * transitions.
 *
 * - Returning to the already-recorded `currentReturnSurface` clears it.
 * - Navigating forward to the alternate surface records `currentSurface` so
 *   Back restores the immediately prior surface rather than firing outer `onExit`.
 */
export function resolveNextR06LibraryReturnSurface(params: {
  readonly currentSurface: R06LibrarySurface
  readonly nextSurface: R06LibrarySurface
  readonly currentReturnSurface: R06LibrarySurface | null
}): R06LibrarySurface | null {
  if (params.currentSurface === params.nextSurface) {
    return params.currentReturnSurface
  }
  if (params.currentReturnSurface === params.nextSurface) {
    return null
  }
  return params.currentSurface
}

/**
 * Resolves the Back / Exit action and label passed into `LibraryShelfHost` so
 * both Shelf -> Browse All Months -> Back and Browse All Months -> Your Shelf -> Back
 * preserve the prior surface in controlled and uncontrolled usage.
 */
export function resolveR06LibraryHostBackAction(params: {
  readonly activeSurface: R06LibrarySurface
  readonly returnSurface: R06LibrarySurface | null
  readonly hasOuterExit: boolean
  readonly exitLabel?: string
}): R06LibraryHostBackAction {
  if (params.returnSurface && params.returnSurface !== params.activeSurface) {
    return {
      mode: 'returnToSurface',
      targetSurface: params.returnSurface,
      label: params.returnSurface === 'library' ? 'Back to Library' : 'Back to Shelf',
    }
  }

  const fallbackLabel = params.exitLabel ?? 'Return'
  if (params.hasOuterExit) {
    return {
      mode: 'outerExit',
      targetSurface: null,
      label: fallbackLabel,
    }
  }

  return {
    mode: 'none',
    targetSurface: null,
    label: fallbackLabel,
  }
}

/**
 * Counts strictly valid, deduplicated historical Shelf months (0..3).
 *
 * When `referenceCurrentYearMonth` is provided, current and future months are
 * strictly excluded so the current publication month never counts as a Shelf slot.
 */
export function countValidHistoricalShelfMonths(
  shelfState?: ShelfState,
  referenceCurrentYearMonth?: string | null,
): number {
  if (!shelfState || !Array.isArray(shelfState.months) || shelfState.months.length === 0) {
    return 0
  }

  const validCurrent = referenceCurrentYearMonth
    ? parseValidPublicationYearMonth(referenceCurrentYearMonth)
    : null
  const seen = new Set<string>()

  for (const entry of shelfState.months) {
    if (seen.size >= MAX_SHELF_CAPACITY) {
      break
    }
    const ym = parseValidPublicationYearMonth(entry?.yearMonth)
    if (!ym || seen.has(ym)) {
      continue
    }
    if (validCurrent && !isHistoricalPublicationYearMonth(ym, validCurrent)) {
      continue
    }
    seen.add(ym)
  }

  return seen.size
}

/**
 * Builds the persistent, always-actionable R06 Library entrances regardless of
 * Shelf occupancy (0, 1, 2, or 3 months). Never returns disabled or placeholder CTAs.
 */
export function buildR06LibraryEntrances(params: {
  readonly activeSurface: R06LibrarySurface
  readonly shelfCount: number
  readonly maxCapacity?: number
}): readonly R06LibraryEntranceDescriptor[] {
  const maxCapacity = params.maxCapacity ?? MAX_SHELF_CAPACITY
  const clampedCount = Math.max(0, Math.min(maxCapacity, Math.floor(params.shelfCount)))

  const foundationsEntrance: R06LibraryEntranceDescriptor = {
    id: 'foundations',
    label: 'Foundations',
    description: 'Optional foundational readings and study companions at your own pace.',
    action: 'openFoundations',
  }

  if (params.activeSurface === 'shelf') {
    return [
      {
        id: 'browse-all-months',
        label: 'Browse All Months',
        description:
          'Explore every past publication month at your own pace with full participation credit.',
        action: 'openLibrary',
      },
      foundationsEntrance,
    ]
  }

  const shelfDescription =
    clampedCount === 0
      ? `Keep up to ${maxCapacity} past publication months close at hand (0 of ${maxCapacity} on Shelf).`
      : `Return to your focused historical Shelf (${clampedCount} of ${maxCapacity} ${
          clampedCount === 1 ? 'month' : 'months'
        }).`

  return [
    {
      id: 'shelf-overview',
      label: 'Your Shelf',
      description: shelfDescription,
      action: 'openShelf',
    },
    foundationsEntrance,
  ]
}

/**
 * Builds the pure view model for `R06LibraryLanding`.
 */
export function buildR06LibraryLandingViewModel(params: {
  readonly activeSurface: R06LibrarySurface
  readonly shelfState?: ShelfState
  readonly referenceCurrentYearMonth?: string | null
}): R06LibraryLandingViewModel {
  const shelfCount = countValidHistoricalShelfMonths(
    params.shelfState,
    params.referenceCurrentYearMonth,
  )

  return {
    activeSurface: params.activeSurface,
    shelfCount,
    maxCapacity: MAX_SHELF_CAPACITY,
    isShelfEmpty: shelfCount === 0,
    isShelfFull: shelfCount >= MAX_SHELF_CAPACITY,
    entrances: buildR06LibraryEntrances({
      activeSurface: params.activeSurface,
      shelfCount,
      maxCapacity: MAX_SHELF_CAPACITY,
    }),
  }
}

/**
 * Formats a concise screen-reader live announcement when switching between
 * the Shelf overview and Browse All Months surfaces.
 */
export function formatR06LibrarySurfaceAnnouncement(
  nextSurface: R06LibrarySurface,
): string {
  return nextSurface === 'library'
    ? 'Showing Browse All Months historical catalogue.'
    : 'Showing Library Shelf overview.'
}
