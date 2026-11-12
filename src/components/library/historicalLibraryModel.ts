import type {
  GatewayServerContext,
  LibraryMonthIndexPage,
  LibraryMonthSummary,
} from '../../cms/reader/libraryMonthIndexProvider.ts'

/**
 * Pure domain and presentation model for the Historical Library Catalogue (R08-2 / Issue #128).
 *
 * Invariants & architectural guarantees:
 * - Zero browser (`window`, `localStorage`, `document`) or network dependencies.
 * - Only handles approved, historical month summaries from the typed gateway provider.
 * - Deduplicates items by stable `yearMonth` (YYYY-MM).
 * - Sorts newest-first (descending civil `yearMonth`).
 * - Accurately differentiates truly empty catalogue from sparse valid continuation windows.
 * - Retains existing loaded months on subsequent page failure to prevent UI loss.
 * - Validates month-opening target strictly against YYYY-MM format and loaded catalogue.
 */

export const YEAR_MONTH_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/

const MONTH_HEADING_FORMATTER = new Intl.DateTimeFormat('en', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

export type HistoricalLibraryStatus =
  | 'idle'
  | 'loading-initial'
  | 'ready'
  | 'loading-more'
  | 'empty'
  | 'request-error'
  | 'validation-error'

export interface HistoricalLibraryState {
  readonly status: HistoricalLibraryStatus
  readonly items: readonly LibraryMonthSummary[]
  readonly nextCursor: string | null
  readonly hasMore: boolean
  readonly errorMessage: string | null
  readonly errorIssues: readonly string[] | null
  readonly errorKind: 'request' | 'validation' | null
  readonly failedAction: 'initial' | 'more' | null
  readonly serverContext: GatewayServerContext | null
  readonly isSparseContinuation: boolean
}

export const initialHistoricalLibraryState: HistoricalLibraryState = Object.freeze({
  status: 'idle',
  items: Object.freeze([]),
  nextCursor: null,
  hasMore: false,
  errorMessage: null,
  errorIssues: null,
  errorKind: null,
  failedAction: null,
  serverContext: null,
  isSparseContinuation: false,
})

export type HistoricalLibraryAction =
  | { readonly type: 'START_INITIAL_LOAD' }
  | {
      readonly type: 'INITIAL_LOAD_SUCCESS'
      readonly items: readonly LibraryMonthSummary[]
      readonly page: LibraryMonthIndexPage
      readonly serverContext: GatewayServerContext
    }
  | { readonly type: 'START_LOAD_MORE' }
  | {
      readonly type: 'LOAD_MORE_SUCCESS'
      readonly items: readonly LibraryMonthSummary[]
      readonly page: LibraryMonthIndexPage
      readonly serverContext: GatewayServerContext
    }
  | {
      readonly type: 'LOAD_FAILURE'
      readonly errorKind: 'request' | 'validation'
      readonly message: string
      readonly issues?: readonly string[]
      readonly failedAction: 'initial' | 'more'
    }
  | { readonly type: 'RESET' }

export function isValidYearMonth(candidate: unknown): candidate is string {
  return typeof candidate === 'string' && YEAR_MONTH_PATTERN.test(candidate)
}

/**
 * Deterministically formats civil year and month into an accessible heading (e.g. "October 2026").
 */
export function formatPublicationMonthHeading(
  yearMonth: string,
  year?: number,
  month?: number,
): string {
  if (
    typeof year === 'number' &&
    Number.isInteger(year) &&
    year >= 1 &&
    year <= 9999 &&
    typeof month === 'number' &&
    Number.isInteger(month) &&
    month >= 1 &&
    month <= 12
  ) {
    return MONTH_HEADING_FORMATTER.format(new Date(Date.UTC(year, month - 1, 15)))
  }

  if (isValidYearMonth(yearMonth)) {
    const y = Number(yearMonth.slice(0, 4))
    const m = Number(yearMonth.slice(5, 7))
    return MONTH_HEADING_FORMATTER.format(new Date(Date.UTC(y, m - 1, 15)))
  }

  return yearMonth
}

/**
 * Deduplicates and sorts historical month summaries newest-first (descending `yearMonth`).
 * In case of duplicates, retains the earlier encountered item.
 */
export function deduplicateAndSortMonths(
  existing: readonly LibraryMonthSummary[],
  incoming: readonly LibraryMonthSummary[],
): readonly LibraryMonthSummary[] {
  const seenYearMonths = new Set<string>()
  const merged: LibraryMonthSummary[] = []

  for (const item of existing) {
    if (isValidYearMonth(item.yearMonth) && !seenYearMonths.has(item.yearMonth)) {
      seenYearMonths.add(item.yearMonth)
      merged.push(item)
    }
  }

  for (const item of incoming) {
    if (isValidYearMonth(item.yearMonth) && !seenYearMonths.has(item.yearMonth)) {
      seenYearMonths.add(item.yearMonth)
      merged.push(item)
    }
  }

  // Sort newest first: descending civil YYYY-MM
  merged.sort((a, b) => (a.yearMonth > b.yearMonth ? -1 : a.yearMonth < b.yearMonth ? 1 : 0))

  return Object.freeze(merged)
}

/**
 * Safe presentation-level reducer for the historical Library catalogue.
 */
export function historicalLibraryReducer(
  state: HistoricalLibraryState,
  action: HistoricalLibraryAction,
): HistoricalLibraryState {
  switch (action.type) {
    case 'START_INITIAL_LOAD':
      return {
        ...state,
        status: 'loading-initial',
        errorMessage: null,
        errorIssues: null,
        errorKind: null,
        failedAction: null,
        isSparseContinuation: false,
      }

    case 'INITIAL_LOAD_SUCCESS': {
      const mergedItems = deduplicateAndSortMonths([], action.items)
      const hasMore = Boolean(action.page.hasMore)
      const nextCursor = hasMore ? action.page.nextCursor : null

      if (mergedItems.length === 0) {
        if (hasMore) {
          // Sparse page: empty item set in the scanned window, but continuation cursor exists!
          return {
            status: 'ready',
            items: Object.freeze([]),
            nextCursor,
            hasMore: true,
            errorMessage: null,
            errorIssues: null,
            errorKind: null,
            failedAction: null,
            serverContext: action.serverContext,
            isSparseContinuation: true,
          }
        }
        // Truly empty catalogue: no historical months exist
        return {
          status: 'empty',
          items: Object.freeze([]),
          nextCursor: null,
          hasMore: false,
          errorMessage: null,
          errorIssues: null,
          errorKind: null,
          failedAction: null,
          serverContext: action.serverContext,
          isSparseContinuation: false,
        }
      }

      return {
        status: 'ready',
        items: mergedItems,
        nextCursor,
        hasMore,
        errorMessage: null,
        errorIssues: null,
        errorKind: null,
        failedAction: null,
        serverContext: action.serverContext,
        isSparseContinuation: false,
      }
    }

    case 'START_LOAD_MORE': {
      if (!state.hasMore || state.status === 'loading-more') {
        return state
      }
      return {
        ...state,
        status: 'loading-more',
        errorMessage: null,
        errorIssues: null,
        errorKind: null,
        failedAction: null,
      }
    }

    case 'LOAD_MORE_SUCCESS': {
      const mergedItems = deduplicateAndSortMonths(state.items, action.items)
      const hasMore = Boolean(action.page.hasMore)
      const nextCursor = hasMore ? action.page.nextCursor : null
      const isSparse = action.items.length === 0 && hasMore

      if (mergedItems.length === 0 && !hasMore) {
        return {
          status: 'empty',
          items: Object.freeze([]),
          nextCursor: null,
          hasMore: false,
          errorMessage: null,
          errorIssues: null,
          errorKind: null,
          failedAction: null,
          serverContext: action.serverContext,
          isSparseContinuation: false,
        }
      }

      return {
        status: 'ready',
        items: mergedItems,
        nextCursor,
        hasMore,
        errorMessage: null,
        errorIssues: null,
        errorKind: null,
        failedAction: null,
        serverContext: action.serverContext,
        isSparseContinuation: isSparse,
      }
    }

    case 'LOAD_FAILURE': {
      return {
        ...state,
        status: action.errorKind === 'validation' ? 'validation-error' : 'request-error',
        errorMessage: action.message,
        errorIssues: action.issues ? Object.freeze([...action.issues]) : null,
        errorKind: action.errorKind,
        failedAction: action.failedAction,
        // Existing items are preserved so reader does not lose loaded content!
      }
    }

    case 'RESET':
      return initialHistoricalLibraryState

    default:
      return state
  }
}
