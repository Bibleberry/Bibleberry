import { useCallback, useContext, useEffect, useMemo, useLayoutEffect, useReducer, useRef, useState } from 'react'
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
import { LibraryRouteVisible } from './libraryRouteVisibility.ts'
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

  /** The retained host also supplies unfiltered metadata to Shelf. */
  readonly browsing?: boolean

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
  browsing = true,
  onStateChange,
}: HistoricalLibraryHostProps) {
  const [state, dispatch] = useReducer(historicalLibraryReducer, initialHistoricalLibraryState)
  const routeVisible = useContext(LibraryRouteVisible)
  const loadCatalogue = routeVisible || !browsing
  const [searchText, setSearchText] = useState('')
  const query = browsing ? searchText.trim() : ''
  const controllerRef = useRef<AbortController | null>(null)
  // Retain navigation depth only. Rebuild previous windows through the gateway
  // on return so a withdrawal cannot be restored from an old result list.
  const browseDepth = useRef(1)
  const searchDepth = useRef(1)
  const loadedDepth = useRef(0)

  const [lastBrowsing, setLastBrowsing] = useState(browsing)
  const [entry, setEntry] = useState(0)
  if (lastBrowsing !== browsing) {
    setLastBrowsing(browsing)
    // A pending first window is already fresh. Keep that request alive when
    // entering from Shelf, but reauthorize any previously displayed pages.
    if (browsing && state.status !== 'idle' && state.status !== 'loading-initial') setEntry(entry + 1)
  }

  const resolvedPageSize = useMemo(() => {
    if (typeof pageSize !== 'number' || Number.isNaN(pageSize) || pageSize < 1) {
      return DEFAULT_LIBRARY_PAGE_SIZE
    }
    return Math.min(Math.floor(pageSize), MAX_LIBRARY_PAGE_SIZE)
  }, [pageSize])

  const fetchMonths = useCallback(
    async (mode: 'initial' | 'more', cursor?: string) => {
      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller
      let action = mode
      let next = cursor
      const depth = query ? searchDepth : browseDepth
      if (mode === 'initial') loadedDepth.current = 0
      // An explicit Load more reads one window. A return replays only as far
      // as the user previously browsed, following freshly authorized cursors.
      const target = Math.max(depth.current, loadedDepth.current + 1)
      depth.current = target
      try {
        do {
          dispatch({ type: action === 'initial' ? 'START_INITIAL_LOAD' : 'START_LOAD_MORE' })
          const result = await provider.loadHistoricalMonths({
            limit: resolvedPageSize, cursor: next, query, timeZone, signal: controller.signal,
          })
          if (controller.signal.aborted) return
          if (result.status === 'requestError' || result.status === 'validationError') {
            dispatch({
              type: 'LOAD_FAILURE',
              errorKind: result.status === 'requestError' ? 'request' : 'validation',
              issues: result.status === 'validationError' ? result.issues : undefined,
              message: result.message,
              failedAction: action,
            })
            return
          }
          dispatch({
            type: action === 'initial' ? 'INITIAL_LOAD_SUCCESS' : 'LOAD_MORE_SUCCESS',
            items: result.items,
            page: result.page,
            serverContext: result.serverContext,
          })
          loadedDepth.current += 1
          depth.current = result.page.hasMore ? Math.max(depth.current, loadedDepth.current) : loadedDepth.current
          next = result.page.nextCursor ?? undefined
          action = 'more'
        } while (next && loadedDepth.current < target)
      } catch (error) {
        if (!controller.signal.aborted) {
          dispatch({
            type: 'LOAD_FAILURE', errorKind: 'request', failedAction: action,
            message: error instanceof Error ? error.message : 'Unable to load historical months',
          })
        }
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null
      }
    },
    [provider, query, resolvedPageSize, timeZone],
  )

  useEffect(() => { onStateChange?.(state) }, [onStateChange, state])

  useEffect(() => {
    function restorePage(event: PageTransitionEvent) {
      if (event.persisted) setEntry(previous => previous + 1)
    }
    window.addEventListener('pageshow', restorePage)
    return () => window.removeEventListener('pageshow', restorePage)
  }, [])

  useLayoutEffect(() => {
    dispatch({ type: 'RESET' })
    if (!loadCatalogue) return
    // Coalesce keystrokes before requesting a new search window.
    const timer = window.setTimeout(() => { void fetchMonths('initial') }, query ? 180 : 0)
    return () => {
      window.clearTimeout(timer)
      controllerRef.current?.abort()
    }
  }, [fetchMonths, query, entry, loadCatalogue])

  function changeSearch(text: string) {
    if (text.trim() !== query) searchDepth.current = 1
    setSearchText(text)
  }

  function handleLoadMore() {
    if (!controllerRef.current && state.hasMore && state.nextCursor) {
      void fetchMonths('more', state.nextCursor)
    }
  }

  function handleRetry() {
    if (state.failedAction === 'more' && state.nextCursor) void fetchMonths('more', state.nextCursor)
    else void fetchMonths('initial')
  }

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
      searchText={searchText}
      onSearchChange={changeSearch}
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
