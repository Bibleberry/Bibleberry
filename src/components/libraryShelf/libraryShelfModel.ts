import {
  MAX_LIBRARY_PAGE_SIZE,
  type GatewayServerContext,
  type LibraryMonthIndexProvider,
  type LibraryMonthSummary,
} from '../../cms/reader/libraryMonthIndexProvider.ts'
import type {
  LocalCalendarDate,
  PublicationYearMonth,
} from '../../participation/types.ts'
import { selectShelfMonth } from '../../shelf/policy.ts'
import type { ShelfState } from '../../shelf/types.ts'
import {
  isHistoricalPublicationYearMonth,
  parseValidPublicationYearMonth,
} from '../../shelf/validation.ts'
import { isValidYearMonth } from '../library/historicalLibraryModel.ts'
import {
  formatPublicationMonthHeading,
  validateOpenShelfMonthTarget,
  type ShelfMonthMetadata,
} from '../shelf/shelfModel.ts'

export type LibraryShelfSurface = 'shelf' | 'library'

export type MonthOpenOrigin = 'shelf' | 'library'

export interface OpenMonthContext {
  readonly origin: MonthOpenOrigin
}

/**
 * Resolves the authoritative current publication month (YYYY-MM) from an explicit
 * prop or from the gateway-supplied `serverContext.authorizedLocalDate`.
 */
export function resolveReferenceCurrentYearMonth(
  explicitCurrentYearMonth?: string,
  libraryServerContext?: GatewayServerContext | null,
): PublicationYearMonth | null {
  const explicit = explicitCurrentYearMonth
    ? parseValidPublicationYearMonth(explicitCurrentYearMonth)
    : null
  if (explicit) {
    return explicit
  }

  const authorizedDate = libraryServerContext?.authorizedLocalDate
  if (typeof authorizedDate === 'string' && authorizedDate.length >= 7) {
    return parseValidPublicationYearMonth(authorizedDate.slice(0, 7))
  }

  return null
}

/**
 * Combines caller-supplied month metadata with loaded, gateway-authorized Library
 * month summaries so Shelf cards display real titles/subtitles without duplicating data.
 */
export function buildShelfMonthMetadataMap(
  libraryItems: readonly LibraryMonthSummary[],
  externalMetadata?:
    | ReadonlyMap<string, ShelfMonthMetadata>
    | Readonly<Record<string, ShelfMonthMetadata>>,
): ReadonlyMap<string, ShelfMonthMetadata> {
  const merged = new Map<string, ShelfMonthMetadata>()

  if (externalMetadata) {
    if (externalMetadata instanceof Map) {
      for (const [key, value] of externalMetadata.entries()) {
        merged.set(key, value)
      }
    } else {
      for (const [key, value] of Object.entries(
        externalMetadata as Readonly<Record<string, ShelfMonthMetadata>>,
      )) {
        merged.set(key, value)
      }
    }
  }

  for (const item of libraryItems) {
    if (!isValidYearMonth(item.yearMonth)) {
      continue
    }
    const existing = merged.get(item.yearMonth)
    merged.set(item.yearMonth, {
      yearMonth: item.yearMonth,
      title: existing?.title ?? item.title,
      subtitle: existing?.subtitle ?? item.subtitle,
    })
  }

  return merged
}

export type LibraryToShelfSelectionResult =
  | {
      readonly ok: true
      readonly state: ShelfState
      readonly action: 'added' | 'replaced' | 'promotedToProtected'
      readonly selectedYearMonth: PublicationYearMonth
      readonly announcement: string
    }
  | {
      readonly ok: false
      readonly reason: 'capacityExceeded'
      readonly pendingReplaceTarget: PublicationYearMonth
      readonly announcement: string
    }
  | {
      readonly ok: false
      readonly reason: 'rejected'
      readonly message: string
    }

/**
 * Pure, policy-enforcing handoff for selecting an approved historical Library month
 * onto the reader's Shelf.
 *
 * Security & policy invariants:
 * - Target month must be a valid YYYY-MM present in the gateway-approved Library catalogue.
 * - Target month must be strictly historical relative to `referenceCurrentYearMonth`.
 * - Enforces 0–3 capacity and explicit replacement (never silent auto-eviction).
 */
export function attemptSelectLibraryMonthForShelf(params: {
  readonly state: ShelfState
  readonly yearMonth: string
  readonly referenceCurrentYearMonth: string | null
  readonly approvedLibraryItems: readonly LibraryMonthSummary[]
  readonly admittedOn?: LocalCalendarDate
  readonly replaceMonth?: PublicationYearMonth
  readonly nextFocus?: PublicationYearMonth | null
}): LibraryToShelfSelectionResult {
  const ym = parseValidPublicationYearMonth(params.yearMonth)
  if (!ym) {
    return {
      ok: false,
      reason: 'rejected',
      message: `Invalid publication month identifier: "${String(params.yearMonth)}".`,
    }
  }

  const isApprovedInLibrary = params.approvedLibraryItems.some(item => item.yearMonth === ym)
  if (!isApprovedInLibrary) {
    return {
      ok: false,
      reason: 'rejected',
      message: `Month ${ym} is not in the authorized historical Library catalogue.`,
    }
  }

  if (!params.referenceCurrentYearMonth) {
    return {
      ok: false,
      reason: 'rejected',
      message: 'Current publication month reference is unavailable.',
    }
  }

  const result = selectShelfMonth(params.state, {
    yearMonth: ym,
    referenceCurrentYearMonth: params.referenceCurrentYearMonth,
    admittedOn: params.admittedOn,
    updatedOn: params.admittedOn,
    replaceMonth: params.replaceMonth,
    nextFocus: params.nextFocus,
  })

  if (!result.ok) {
    if (result.error === 'shelfCapacityExceeded') {
      return {
        ok: false,
        reason: 'capacityExceeded',
        pendingReplaceTarget: ym,
        announcement: 'Shelf is full. Choose an existing month to replace or cancel.',
      }
    }

    return {
      ok: false,
      reason: 'rejected',
      message: result.message,
    }
  }

  const heading = formatPublicationMonthHeading(ym)
  let announcement: string
  if (result.action === 'replaced' && params.replaceMonth) {
    const replacedHeading = formatPublicationMonthHeading(params.replaceMonth)
    announcement = `Replaced ${replacedHeading} with ${heading} on Shelf.`
  } else if (result.action === 'promotedToProtected') {
    announcement = `${heading} is saved and protected on your Shelf.`
  } else {
    announcement = `Added ${heading} to your Shelf.`
  }

  return {
    ok: true,
    state: result.state,
    action: result.action,
    selectedYearMonth: ym,
    announcement,
  }
}

/**
 * Validates a month-open destination from either Shelf or Library before invoking
 * the typed `onOpenMonth` callback.
 */
export function validateAuthorizedMonthOpen(params: {
  readonly yearMonth: string
  readonly origin: MonthOpenOrigin
  readonly shelfState: ShelfState
  readonly approvedLibraryItems: readonly LibraryMonthSummary[]
  readonly referenceCurrentYearMonth: string | null
}):
  | { readonly ok: true; readonly yearMonth: PublicationYearMonth }
  | { readonly ok: false; readonly reason: string } {
  if (params.origin === 'shelf') {
    if (!params.referenceCurrentYearMonth) {
      return {
        ok: false,
        reason: 'Current publication month reference is unavailable.',
      }
    }
    return validateOpenShelfMonthTarget(
      params.yearMonth,
      params.shelfState,
      params.referenceCurrentYearMonth,
    )
  }

  const ym = parseValidPublicationYearMonth(params.yearMonth)
  if (!ym) {
    return {
      ok: false,
      reason: `Invalid publication month identifier: "${String(params.yearMonth)}".`,
    }
  }

  if (!params.approvedLibraryItems.some(item => item.yearMonth === ym)) {
    return {
      ok: false,
      reason: `Month ${ym} is not an authorized historical Library month.`,
    }
  }

  if (params.referenceCurrentYearMonth) {
    const currentYm = parseValidPublicationYearMonth(params.referenceCurrentYearMonth)
    if (!currentYm || !isHistoricalPublicationYearMonth(ym, currentYm)) {
      return {
        ok: false,
        reason: `Month ${ym} is not historical relative to ${params.referenceCurrentYearMonth}.`,
      }
    }
  }

  return { ok: true, yearMonth: ym }
}

/**
 * Re-checks a Shelf destination against the live gateway catalogue. Shelf state can
 * outlive a catalogue publication, and the target may be older than the pages the
 * reader has browsed, so checking only `approvedLibraryItems` is insufficient.
 */
export async function isGatewayAuthorizedHistoricalMonth(params: {
  readonly provider: LibraryMonthIndexProvider
  readonly yearMonth: string
  readonly timeZone?: string
  readonly pageSize?: number
}): Promise<boolean> {
  const target = parseValidPublicationYearMonth(params.yearMonth)
  if (!target) return false

  const seenCursors = new Set<string>()
  let cursor: string | undefined

  const pageSize =
    typeof params.pageSize === 'number' && Number.isInteger(params.pageSize) && params.pageSize > 0
      ? Math.min(params.pageSize, MAX_LIBRARY_PAGE_SIZE)
      : MAX_LIBRARY_PAGE_SIZE

  for (let pages = 0; pages < 512; pages += 1) {
    const result = await params.provider.loadHistoricalMonths({
      limit: pageSize,
      cursor,
      timeZone: params.timeZone,
    })
    if (result.status !== 'ready' && result.status !== 'empty') return false

    const current = parseValidPublicationYearMonth(
      result.serverContext.authorizedLocalDate.slice(0, 7),
    )
    if (!current || !isHistoricalPublicationYearMonth(target, current)) return false
    if (result.items.some(item => item.yearMonth === target)) return true
    if (!result.page.hasMore || !result.page.nextCursor) return false

    const nextCursor = result.page.nextCursor
    if (nextCursor <= target || seenCursors.has(nextCursor)) return false
    seenCursors.add(nextCursor)
    cursor = nextCursor
  }

  return false
}
