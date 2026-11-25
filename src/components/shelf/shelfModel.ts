import type {
  LocalCalendarDate,
  PublicationYearMonth,
} from '../../participation/types.ts'
import {
  MAX_SHELF_CAPACITY,
  type ShelfAdmissionKind,
  type ShelfState,
} from '../../shelf/types.ts'
import {
  isHistoricalPublicationYearMonth,
  isShelfEntryProtected,
  parseValidPublicationYearMonth,
} from '../../shelf/validation.ts'

/**
 * Pure presentation and validation model for the standalone Shelf reader surface.
 *
 * Product authority:
 * - November 8, 2026 Approved Reader Experience (§6, §10)
 * - GitHub Issue #159: Phase 05 / R08-4 Standalone Shelf reader surface
 *
 * Boundary rules:
 * - Zero browser globals (`window`, `localStorage`, `document`) or network calls.
 * - Composes the accepted pure Shelf policy engine (`src/shelf/*`).
 * - Never fabricates teaching titles, cover art, awards, or unearned achievements.
 */

export interface ShelfMonthMetadata {
  readonly yearMonth: PublicationYearMonth | string
  readonly title?: string
  readonly subtitle?: string
  readonly completionProgress?: ShelfCompletionProgress
  readonly progressStatus?: 'loading' | 'unavailable'
}

export interface ShelfCompletionProgress {
  readonly completedChallengeCount: number
  readonly totalChallengeCount: number
}

export type ShelfPresentation = 'legacy' | 'r06'

export interface ShelfEntryViewModel {
  readonly yearMonth: PublicationYearMonth
  readonly monthHeading: string
  readonly title: string | null
  readonly subtitle: string | null
  readonly admissionKind: ShelfAdmissionKind
  readonly isProtected: boolean
  readonly admittedOn?: LocalCalendarDate
  readonly isActiveFocus: boolean
  readonly statusLabel: string
  readonly protectionExplanation: string
  readonly completionProgress: ShelfCompletionProgress | null
  readonly progressStatus?: 'loading' | 'unavailable'
}

export interface ShelfViewModel {
  readonly referenceCurrentYearMonth: PublicationYearMonth | null
  readonly entries: readonly ShelfEntryViewModel[]
  readonly slotCount: number
  readonly maxCapacity: number
  readonly isFull: boolean
  readonly activeFocusMonth: PublicationYearMonth | null
  readonly activeFocusOutsideShelf: boolean
  readonly activeFocusHeading: string | null
}

export interface ShelfCandidateMonthViewModel {
  readonly yearMonth: PublicationYearMonth
  readonly monthHeading: string
  readonly title: string | null
  readonly subtitle: string | null
  readonly alreadyOnShelf: boolean
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

/**
 * Formats a YYYY-MM publication identifier into a human-readable heading
 * (e.g. "2026-10" -> "October 2026").
 */
export function formatPublicationMonthHeading(yearMonth: string): string {
  const parsed = parseValidPublicationYearMonth(yearMonth)
  if (!parsed) {
    return yearMonth
  }

  const [yearPart, monthPart] = parsed.split('-')
  const monthIndex = Number(monthPart) - 1
  const monthName = MONTH_NAMES[monthIndex]

  if (!monthName || !yearPart) {
    return yearMonth
  }

  return `${monthName} ${yearPart}`
}

function lookupMetadata(
  yearMonth: PublicationYearMonth,
  metadataByMonth?:
    | ReadonlyMap<string, ShelfMonthMetadata>
    | Readonly<Record<string, ShelfMonthMetadata>>,
): ShelfMonthMetadata | undefined {
  if (!metadataByMonth) {
    return undefined
  }
  if (metadataByMonth instanceof Map) {
    return metadataByMonth.get(yearMonth)
  }
  return (metadataByMonth as Readonly<Record<string, ShelfMonthMetadata>>)[yearMonth]
}

function getStatusCopy(
  admissionKind: ShelfAdmissionKind,
  isProtected: boolean,
  presentation: ShelfPresentation,
): { readonly statusLabel: string; readonly protectionExplanation: string } {
  if (presentation === 'legacy') {
    if (admissionKind === 'readerSelected') {
      return isProtected
        ? {
            statusLabel: 'Saved to Shelf · Protected',
            protectionExplanation:
              'Chosen by you and protected from automatic rollover replacement.',
          }
        : {
            statusLabel: 'Saved to Shelf',
            protectionExplanation: 'Chosen by you. Rollover protection is currently off.',
          }
    }

    return isProtected
      ? {
          statusLabel: 'Added at rollover · Protected',
          protectionExplanation:
            'Automatically added at month rollover and protected by your choice.',
        }
      : {
          statusLabel: 'Added at rollover',
          protectionExplanation:
            'Automatically added at month rollover. Protect it to keep it from being replaced when the Shelf is full.',
        }
  }

  if (isProtected) {
    return {
      statusLabel: 'Kept on Shelf',
      protectionExplanation: 'Protected from automatic rollover replacement.',
    }
  }

  if (admissionKind === 'readerSelected') {
    return {
      statusLabel: 'On Shelf',
      protectionExplanation:
        'Not kept yet. Keep it on Shelf to protect it from automatic rollover replacement.',
    }
  }

  return {
    statusLabel: 'Added at rollover',
    protectionExplanation:
      'Automatically added at month rollover. Protect it to keep it from being replaced when the Shelf is full.',
  }
}

/**
 * Projects pure `ShelfState` into a display-ready `ShelfViewModel`.
 *
 * Enforces the 0–3 historical-only invariant:
 * - Invalid, current, or future months never appear as Shelf entries.
 * - Never pads empty slots to three.
 */
export function projectShelfViewModel(
  state: ShelfState,
  referenceCurrentYearMonth: string,
  metadataByMonth?:
    | ReadonlyMap<string, ShelfMonthMetadata>
    | Readonly<Record<string, ShelfMonthMetadata>>,
  presentation: ShelfPresentation = 'legacy',
): ShelfViewModel {
  const validCurrent = parseValidPublicationYearMonth(referenceCurrentYearMonth)
  const validFocus = state.activeFocusMonth
    ? parseValidPublicationYearMonth(state.activeFocusMonth)
    : null

  const seen = new Set<PublicationYearMonth>()
  const entries: ShelfEntryViewModel[] = []

  if (validCurrent) {
    for (const rawEntry of state.months) {
      if (entries.length >= MAX_SHELF_CAPACITY) {
        break
      }
      const ym = parseValidPublicationYearMonth(rawEntry.yearMonth)
      if (!ym || seen.has(ym)) {
        continue
      }
      if (!isHistoricalPublicationYearMonth(ym, validCurrent)) {
        continue
      }
      seen.add(ym)

      const isProtected = isShelfEntryProtected(rawEntry)
      const meta = lookupMetadata(ym, metadataByMonth)
      const { statusLabel, protectionExplanation } = getStatusCopy(
        rawEntry.admissionKind,
        isProtected,
        presentation,
      )
      const completionProgress = meta?.completionProgress
      const hasValidCompletionProgress =
        completionProgress !== undefined
        && Number.isSafeInteger(completionProgress.completedChallengeCount)
        && Number.isSafeInteger(completionProgress.totalChallengeCount)
        && completionProgress.completedChallengeCount >= 0
        && completionProgress.totalChallengeCount >= completionProgress.completedChallengeCount

      entries.push({
        yearMonth: ym,
        monthHeading: formatPublicationMonthHeading(ym),
        title: meta?.title?.trim() ? meta.title.trim() : null,
        subtitle: meta?.subtitle?.trim() ? meta.subtitle.trim() : null,
        admissionKind: rawEntry.admissionKind,
        isProtected,
        admittedOn: rawEntry.admittedOn,
        isActiveFocus: validFocus === ym,
        statusLabel,
        protectionExplanation,
        completionProgress: hasValidCompletionProgress ? completionProgress : null,
        progressStatus: meta?.progressStatus,
      })
    }
  }

  if (presentation === 'r06') {
    entries.sort((left, right) => {
      if (left.isActiveFocus !== right.isActiveFocus) {
        return left.isActiveFocus ? -1 : 1
      }
      if (left.yearMonth === right.yearMonth) return 0
      return left.yearMonth > right.yearMonth ? -1 : 1
    })
  }

  const activeFocusOutsideShelf =
    validFocus !== null && !entries.some(entry => entry.yearMonth === validFocus)

  return {
    referenceCurrentYearMonth: validCurrent,
    entries,
    slotCount: entries.length,
    maxCapacity: MAX_SHELF_CAPACITY,
    isFull: entries.length >= MAX_SHELF_CAPACITY,
    activeFocusMonth: validFocus,
    activeFocusOutsideShelf,
    activeFocusHeading: validFocus ? formatPublicationMonthHeading(validFocus) : null,
  }
}

/**
 * Validates that a month-open request targets a strictly historical month
 * currently present on the Shelf. Prevents arbitrary/guessed/current/future navigation.
 */
export function validateOpenShelfMonthTarget(
  yearMonth: string,
  state: ShelfState,
  referenceCurrentYearMonth: string,
): { readonly ok: true; readonly yearMonth: PublicationYearMonth } | { readonly ok: false; readonly reason: string } {
  const ym = parseValidPublicationYearMonth(yearMonth)
  if (!ym) {
    return { ok: false, reason: `Invalid publication month identifier: "${String(yearMonth)}".` }
  }

  const currentYm = parseValidPublicationYearMonth(referenceCurrentYearMonth)
  if (!currentYm) {
    return {
      ok: false,
      reason: `Invalid current publication month reference: "${String(referenceCurrentYearMonth)}".`,
    }
  }

  if (!isHistoricalPublicationYearMonth(ym, currentYm)) {
    return {
      ok: false,
      reason: `Month ${ym} is not historical relative to ${currentYm}.`,
    }
  }

  if (!state.months.some(entry => entry.yearMonth === ym)) {
    return {
      ok: false,
      reason: `Month ${ym} is not currently on the Shelf.`,
    }
  }

  return { ok: true, yearMonth: ym }
}

/**
 * Filters an externally supplied list of candidate months to strictly historical,
 * deduplicated entries, marking which ones are already on the Shelf.
 */
export function filterHistoricalCandidateMonths(
  candidates: readonly ShelfMonthMetadata[],
  state: ShelfState,
  referenceCurrentYearMonth: string,
): readonly ShelfCandidateMonthViewModel[] {
  const currentYm = parseValidPublicationYearMonth(referenceCurrentYearMonth)
  if (!currentYm) {
    return []
  }

  const onShelf = new Set(state.months.map(m => m.yearMonth))
  const seen = new Set<PublicationYearMonth>()
  const result: ShelfCandidateMonthViewModel[] = []

  for (const candidate of candidates) {
    const ym = parseValidPublicationYearMonth(candidate.yearMonth)
    if (!ym || seen.has(ym)) {
      continue
    }
    if (!isHistoricalPublicationYearMonth(ym, currentYm)) {
      continue
    }
    seen.add(ym)
    result.push({
      yearMonth: ym,
      monthHeading: formatPublicationMonthHeading(ym),
      title: candidate.title?.trim() ? candidate.title.trim() : null,
      subtitle: candidate.subtitle?.trim() ? candidate.subtitle.trim() : null,
      alreadyOnShelf: onShelf.has(ym),
    })
  }

  return result
}
