import {
  parseLocalCalendarDate,
  parsePublicationYearMonth,
} from '../participation/identity.ts'
import type {
  LocalCalendarDate,
  PublicationYearMonth,
} from '../participation/types.ts'
import type { ProposedAccountShelfEntry } from '../accountSync/types.ts'
import {
  MAX_SHELF_CAPACITY,
  type ShelfAdmissionKind,
  type ShelfEntry,
  type ShelfState,
} from './types.ts'

/**
 * Deterministic validation and chronological comparison helpers for Shelf policy.
 */

const YEAR_MONTH_STRICT_REGEX = /^\d{4}-(?:0[1-9]|1[0-2])$/

export function areShelfEntriesEqual(
  left: readonly ShelfEntry[],
  right: readonly ShelfEntry[],
): boolean {
  return left === right || (left.length === right.length && left.every((entry, index) => {
    const other = right[index]!
    return entry.yearMonth === other.yearMonth
      && entry.admissionKind === other.admissionKind
      && entry.isProtected === other.isProtected
      && entry.admittedOn === other.admittedOn
  }))
}

export function areShelfStatesEqual(left: ShelfState, right: ShelfState): boolean {
  return left === right || (
    (left.activeFocusMonth ?? null) === (right.activeFocusMonth ?? null)
    && left.updatedOn === right.updatedOn
    && areShelfEntriesEqual(left.months, right.months)
  )
}

/**
 * Strictly parses and validates a publication year-month string.
 * Rejects leading/trailing whitespace, malformed tokens, traversal, and invalid months.
 */
export function parseValidPublicationYearMonth(raw: unknown): PublicationYearMonth | null {
  if (typeof raw !== 'string') return null
  if (raw !== raw.trim()) return null
  if (!YEAR_MONTH_STRICT_REGEX.test(raw)) return null
  return parsePublicationYearMonth(raw)
}

/**
 * Compares two publication year-month strings chronologically.
 * Returns negative if a < b, positive if a > b, and 0 if equal.
 */
export function comparePublicationYearMonths(
  a: PublicationYearMonth,
  b: PublicationYearMonth,
): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

/**
 * Checks whether a candidate publication year-month is strictly historical
 * relative to a reference current publication month.
 *
 * Current month is NOT historical (it belongs on Hub / current teaching).
 * Future months are NOT historical (they belong in prepublished editorial schedule).
 */
export function isHistoricalPublicationYearMonth(
  candidate: PublicationYearMonth,
  referenceCurrentMonth: PublicationYearMonth,
): boolean {
  return comparePublicationYearMonths(candidate, referenceCurrentMonth) < 0
}

/**
 * Calculates the immediately preceding calendar publication month.
 * Correctly rolls back December to November, and January to December of the previous year.
 */
export function getPreviousPublicationYearMonth(
  month: PublicationYearMonth,
): PublicationYearMonth | null {
  const parsed = parseValidPublicationYearMonth(month)
  if (!parsed) return null

  const [yearStr, monthStr] = parsed.split('-')
  const year = Number(yearStr)
  const m = Number(monthStr)

  if (m === 1) {
    const prevYear = year - 1
    return `${prevYear}-12` as PublicationYearMonth
  }
  const prevMonth = String(m - 1).padStart(2, '0')
  return `${year}-${prevMonth}` as PublicationYearMonth
}

/**
 * Calculates the immediately succeeding calendar publication month.
 * Correctly rolls forward November to December, and December to January of the next year.
 */
export function getNextPublicationYearMonth(
  month: PublicationYearMonth,
): PublicationYearMonth | null {
  const parsed = parseValidPublicationYearMonth(month)
  if (!parsed) return null

  const [yearStr, monthStr] = parsed.split('-')
  const year = Number(yearStr)
  const m = Number(monthStr)

  if (m === 12) {
    const nextYear = year + 1
    return `${nextYear}-01` as PublicationYearMonth
  }
  const nextMonth = String(m + 1).padStart(2, '0')
  return `${year}-${nextMonth}` as PublicationYearMonth
}

/**
 * Determines whether a Shelf entry is protected from automatic rollover eviction.
 *
 * Policy:
 * 1. An explicit boolean `isProtected` flag takes precedence.
 * 2. If `isProtected` is undefined, `admissionKind === 'readerSelected'` is protected by default,
 *    and `admissionKind === 'autoAdmitted'` is unprotected by default.
 */
export function isShelfEntryProtected(
  entry: ShelfEntry | ProposedAccountShelfEntry,
): boolean {
  if ('isProtected' in entry && typeof entry.isProtected === 'boolean') {
    return entry.isProtected
  }
  return entry.admissionKind === 'readerSelected'
}

export interface ShelfValidationDiagnostic {
  readonly path: string
  readonly reason: string
  readonly rawValue?: unknown
}

export interface ShelfValidationResult {
  readonly valid: boolean
  readonly diagnostics: readonly ShelfValidationDiagnostic[]
  readonly normalizedState: ShelfState | null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Validates and normalizes raw Shelf state against pure capacity and historical invariants.
 */
export function validateShelfState(
  rawState: unknown,
  options: {
    readonly referenceCurrentMonth?: PublicationYearMonth | string
  } = {},
): ShelfValidationResult {
  const diagnostics: ShelfValidationDiagnostic[] = []

  if (!isPlainObject(rawState)) {
    diagnostics.push({
      path: 'state',
      reason: 'State must be a non-null plain object',
      rawValue: rawState,
    })
    return { valid: false, diagnostics: Object.freeze(diagnostics), normalizedState: null }
  }

  const referenceCurrent = options.referenceCurrentMonth
    ? parseValidPublicationYearMonth(options.referenceCurrentMonth)
    : null

  if (options.referenceCurrentMonth && !referenceCurrent) {
    diagnostics.push({
      path: 'referenceCurrentMonth',
      reason: 'Invalid referenceCurrentMonth identifier provided to validator',
      rawValue: options.referenceCurrentMonth,
    })
  }

  if (!Array.isArray(rawState.months)) {
    diagnostics.push({
      path: 'months',
      reason: 'months must be an array',
      rawValue: rawState.months,
    })
    return { valid: false, diagnostics: Object.freeze(diagnostics), normalizedState: null }
  }

  if (rawState.months.length > MAX_SHELF_CAPACITY) {
    diagnostics.push({
      path: 'months',
      reason: `Shelf capacity exceeded: maximum allowed is ${MAX_SHELF_CAPACITY}, found ${rawState.months.length}`,
      rawValue: rawState.months.length,
    })
  }

  const seenMonths = new Set<string>()
  const validatedEntries: ShelfEntry[] = []

  rawState.months.forEach((entry, idx) => {
    const entryPath = `months[${idx}]`
    if (!isPlainObject(entry)) {
      diagnostics.push({
        path: entryPath,
        reason: 'Shelf entry must be a non-null plain object',
        rawValue: entry,
      })
      return
    }

    const ym = parseValidPublicationYearMonth(entry.yearMonth)
    if (!ym) {
      diagnostics.push({
        path: `${entryPath}.yearMonth`,
        reason: 'Invalid publication year-month identifier',
        rawValue: entry.yearMonth,
      })
      return
    }

    if (seenMonths.has(ym)) {
      diagnostics.push({
        path: `${entryPath}.yearMonth`,
        reason: `Duplicate month on Shelf: ${ym}`,
        rawValue: ym,
      })
      return
    }
    seenMonths.add(ym)

    if (referenceCurrent && !isHistoricalPublicationYearMonth(ym, referenceCurrent)) {
      diagnostics.push({
        path: `${entryPath}.yearMonth`,
        reason: `Month ${ym} is not historical relative to current month ${referenceCurrent}`,
        rawValue: ym,
      })
      return
    }

    const rawKind = entry.admissionKind
    if (rawKind !== 'readerSelected' && rawKind !== 'autoAdmitted') {
      diagnostics.push({
        path: `${entryPath}.admissionKind`,
        reason: `admissionKind must be 'readerSelected' or 'autoAdmitted', found ${String(rawKind)}`,
        rawValue: rawKind,
      })
      return
    }

    const admissionKind = rawKind as ShelfAdmissionKind

    let isProtected: boolean
    if (typeof entry.isProtected === 'boolean') {
      isProtected = entry.isProtected
    } else if (entry.isProtected === undefined) {
      isProtected = admissionKind === 'readerSelected'
    } else {
      diagnostics.push({
        path: `${entryPath}.isProtected`,
        reason: 'isProtected must be a boolean when present',
        rawValue: entry.isProtected,
      })
      return
    }

    let admittedOn: LocalCalendarDate | undefined
    if (entry.admittedOn !== undefined) {
      const parsedDate = parseLocalCalendarDate(entry.admittedOn)
      if (!parsedDate) {
        diagnostics.push({
          path: `${entryPath}.admittedOn`,
          reason: 'Invalid LocalCalendarDate string for admittedOn',
          rawValue: entry.admittedOn,
        })
        return
      }
      admittedOn = parsedDate
    }

    validatedEntries.push(
      Object.freeze({
        yearMonth: ym,
        admissionKind,
        isProtected,
        ...(admittedOn ? { admittedOn } : {}),
      }),
    )
  })

  let activeFocusMonth: PublicationYearMonth | null | undefined
  if (rawState.activeFocusMonth === null) {
    activeFocusMonth = null
  } else if (rawState.activeFocusMonth !== undefined) {
    const parsedFocus = parseValidPublicationYearMonth(rawState.activeFocusMonth)
    if (!parsedFocus) {
      diagnostics.push({
        path: 'activeFocusMonth',
        reason: 'Invalid publication year-month for activeFocusMonth',
        rawValue: rawState.activeFocusMonth,
      })
    } else {
      activeFocusMonth = parsedFocus
    }
  }

  let updatedOn: LocalCalendarDate | undefined
  if (rawState.updatedOn !== undefined) {
    const parsedUpdated = parseLocalCalendarDate(rawState.updatedOn)
    if (!parsedUpdated) {
      diagnostics.push({
        path: 'updatedOn',
        reason: 'Invalid LocalCalendarDate for updatedOn',
        rawValue: rawState.updatedOn,
      })
    } else {
      updatedOn = parsedUpdated
    }
  }

  const isValid = diagnostics.length === 0
  const normalizedState: ShelfState | null = isValid
    ? Object.freeze({
        months: Object.freeze(validatedEntries),
        ...(activeFocusMonth !== undefined ? { activeFocusMonth } : {}),
        ...(updatedOn ? { updatedOn } : {}),
      })
    : null

  return Object.freeze({
    valid: isValid,
    diagnostics: Object.freeze(diagnostics),
    normalizedState,
  })
}
