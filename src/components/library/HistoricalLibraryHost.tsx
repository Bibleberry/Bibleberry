import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import {
  DEFAULT_LIBRARY_PAGE_SIZE,
  defaultGatewayLibraryMonthIndexProvider,
  MAX_LIBRARY_PAGE_SIZE,
  type LibraryMonthIndexProvider,
} from '../../cms/reader/libraryMonthIndexProvider.ts'
import type { ShelfEntry } from '../../shelf/types.ts'
import {
  historicalLibraryReducer,
  initialHistoricalLibraryState,
  isValidYearMonth,
  type HistoricalLibraryState,
} from './historicalLibraryModel.ts'
import { HistoricalLibraryView } from './HistoricalLibraryView.tsx'

export interface HistoricalLibraryHostProps {
  /**
   * Typed gateway provider for reading historical months.
   * Defaults to `defaultGatewayLibraryMonthIndexProvider`.
   */
  readonly provider?: LibraryMonthIndexProvider

  /**
   * Callback invoked when the reader selects an approved historical month to open.
   * Strictly passes the validated YYYY-MM identifier.
   */
  readonly onOpenMonth: (yearMonth: string) => void

  /**
   * Number of month summaries to request per page.
   * Bounded between 1 and MAX_LIBRARY_PAGE_SIZE (24). Default is 12.
   */
  readonly pageSize?: number

  /**
   * Optional IANA reader timezone override.
   */
  readonly timeZone?: string

  /**
   * Optional back / exit navigation callback.
   */
  readonly onExit?: () => void

  /**
   * Accessible label for exit action. Defaults to 'Return'.
   */
  readonly exitLabel?: string

  /**
   * Optional current Shelf entries for displaying Shelf membership and protection badges.
   */
  readonly shelfEntries?: readonly ShelfEntry[]

  /**
   * Optional highlighted month context when returning between Shelf and Library.
   */
  readonly selectedMonthYearMonth?: string | null

  /**
   * Optional callback invoked when the reader selects an approved historical month for Shelf.
   */
  readonly onSelectForShelf?: (yearMonth: string) => void

  /**
   * Optional callback to navigate directly to the Shelf view.
   */
  readonly onViewShelf?: () => void

  /**
   * Optional maximum Shelf capacity for display in navigation controls. Defaults to 3.
   */
  readonly shelfMaxCapacity?: number

  /**
   * Optional live-region announcement from Shelf selection/replacement actions.
   */
  readonly shelfAnnouncement?: string

  /**
   * Optional preserved Library state so returning between Shelf and Library
   * does not discard loaded pages or server context.
   */
  readonly preservedState?: HistoricalLibraryState

  /**
   * Optional callback invoked whenever the Library state updates.
   */
  readonly onStateChange?: (state: HistoricalLibraryState) => void
}

/**
 * State container for the reader-facing Historical Library catalogue (R08-2 / Issue #128).
 *
 * Responsibilities:
 * - Coordinates pagination with the typed `LibraryMonthIndexProvider`.
 * - Employs `AbortController` to cancel in-flight stale requests on unmount or retry.
 * - Enforces monotonic newest-first loading and deduplication on `yearMonth`.
 * - Accurately differentiates sparse valid continuation pages from library exhaustion.
 * - Protects month-opening action against unreviewed/guessed IDs.
 */
export function HistoricalLibraryHost({
  provider = defaultGatewayLibraryMonthIndexProvider,
  onOpenMonth,
  pageSize = DEFAULT_LIBRARY_PAGE_SIZE,
  timeZone,
  onExit,
  exitLabel = 'Return',
  shelfEntries,
  selectedMonthYearMonth,
  onSelectForShelf,
  onViewShelf,
  shelfMaxCapacity,
  shelfAnnouncement,
  preservedState,
  onStateChange,
}: HistoricalLibraryHostProps) {
  const [state, dispatch] = useReducer(
    historicalLibraryReducer,
    preservedState ?? initialHistoricalLibraryState,
  )

  const activeAbortControllerRef = useRef<AbortController | null>(null)
  const isMountedRef = useRef(true)
  const hasHydratedInitialRef = useRef(
    Boolean(preservedState && preservedState.status !== 'idle'),
  )

  const resolvedPageSize = useMemo(() => {
    if (typeof pageSize !== 'number' || Number.isNaN(pageSize) || pageSize < 1) {
      return DEFAULT_LIBRARY_PAGE_SIZE
    }
    return Math.min(Math.floor(pageSize), MAX_LIBRARY_PAGE_SIZE)
  }, [pageSize])

  const fetchMonths = useCallback(
    async (mode: 'initial' | 'more', cursor?: string) => {
      // Cancel any existing in-flight request
      if (activeAbortControllerRef.current) {
        activeAbortControllerRef.current.abort()
      }

      const controller = new AbortController()
      activeAbortControllerRef.current = controller

      if (mode === 'initial') {
        dispatch({ type: 'START_INITIAL_LOAD' })
      } else {
        dispatch({ type: 'START_LOAD_MORE' })
      }

      try {
        const result = await provider.loadHistoricalMonths({
          limit: resolvedPageSize,
          cursor,
          timeZone,
          signal: controller.signal,
        })

        if (!isMountedRef.current || controller.signal.aborted) {
          return
        }

        switch (result.status) {
          case 'ready':
            if (mode === 'initial') {
              dispatch({
                type: 'INITIAL_LOAD_SUCCESS',
                items: result.items,
                page: result.page,
                serverContext: result.serverContext,
              })
            } else {
              dispatch({
                type: 'LOAD_MORE_SUCCESS',
                items: result.items,
                page: result.page,
                serverContext: result.serverContext,
              })
            }
            break

          case 'empty':
            if (mode === 'initial') {
              dispatch({
                type: 'INITIAL_LOAD_SUCCESS',
                items: [],
                page: result.page,
                serverContext: result.serverContext,
              })
            } else {
              dispatch({
                type: 'LOAD_MORE_SUCCESS',
                items: [],
                page: result.page,
                serverContext: result.serverContext,
              })
            }
            break

          case 'requestError':
            dispatch({
              type: 'LOAD_FAILURE',
              errorKind: 'request',
              message: result.message,
              failedAction: mode,
            })
            break

          case 'validationError':
            dispatch({
              type: 'LOAD_FAILURE',
              errorKind: 'validation',
              message: result.message,
              issues: result.issues,
              failedAction: mode,
            })
            break
        }
      } catch (err: unknown) {
        if (!isMountedRef.current || controller.signal.aborted) {
          return
        }
        if (err instanceof Error && err.name === 'AbortError') {
          return
        }
        const message = err instanceof Error ? err.message : 'An unexpected network error occurred'
        dispatch({
          type: 'LOAD_FAILURE',
          errorKind: 'request',
          message,
          failedAction: mode,
        })
      } finally {
        if (activeAbortControllerRef.current === controller) {
          activeAbortControllerRef.current = null
        }
      }
    },
    [provider, resolvedPageSize, timeZone],
  )

  // Notify parent when Library state changes so navigation can preserve loaded pages
  useEffect(() => {
    onStateChange?.(state)
  }, [onStateChange, state])

  // Trigger initial fetch on mount or when provider/timeZone changes (unless hydrated from preservedState)
  useEffect(() => {
    isMountedRef.current = true
    if (hasHydratedInitialRef.current) {
      hasHydratedInitialRef.current = false
    } else {
      void fetchMonths('initial')
    }

    return () => {
      isMountedRef.current = false
      if (activeAbortControllerRef.current) {
        activeAbortControllerRef.current.abort()
        activeAbortControllerRef.current = null
      }
    }
  }, [fetchMonths])

  const handleLoadMore = useCallback(() => {
    if (!state.hasMore || state.status === 'loading-more') {
      return
    }
    const cursor = state.nextCursor ?? undefined
    void fetchMonths('more', cursor)
  }, [fetchMonths, state.hasMore, state.nextCursor, state.status])

  const handleRetry = useCallback(() => {
    if (state.failedAction === 'more' && state.nextCursor) {
      void fetchMonths('more', state.nextCursor)
    } else {
      void fetchMonths('initial')
    }
  }, [fetchMonths, state.failedAction, state.nextCursor])

  const handleOpenMonth = useCallback(
    (yearMonth: string) => {
      if (!isValidYearMonth(yearMonth)) {
        return
      }

      // Security & privacy check: ensure the requested month is actually an approved
      // historical month returned by the provider, preventing arbitrary/guessed month targets
      const isApprovedInCatalogue = state.items.some(item => item.yearMonth === yearMonth)
      if (!isApprovedInCatalogue) {
        return
      }

      onOpenMonth(yearMonth)
    },
    [onOpenMonth, state.items],
  )

  const handleSelectForShelf = useCallback(
    (yearMonth: string) => {
      if (!onSelectForShelf || !isValidYearMonth(yearMonth)) {
        return
      }

      const isApprovedInCatalogue = state.items.some(item => item.yearMonth === yearMonth)
      if (!isApprovedInCatalogue) {
        return
      }

      onSelectForShelf(yearMonth)
    },
    [onSelectForShelf, state.items],
  )

  return (
    <HistoricalLibraryView
      state={state}
      onOpenMonth={handleOpenMonth}
      onLoadMore={handleLoadMore}
      onRetry={handleRetry}
      onExit={onExit}
      exitLabel={exitLabel}
      shelfEntries={shelfEntries}
      selectedMonthYearMonth={selectedMonthYearMonth}
      onSelectForShelf={onSelectForShelf ? handleSelectForShelf : undefined}
      onViewShelf={onViewShelf}
      shelfMaxCapacity={shelfMaxCapacity}
      shelfAnnouncement={shelfAnnouncement}
    />
  )
}
