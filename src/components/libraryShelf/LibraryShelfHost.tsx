import { useCallback, useMemo, useState } from 'react'
import {
  DEFAULT_LIBRARY_PAGE_SIZE,
  defaultGatewayLibraryMonthIndexProvider,
  type LibraryMonthIndexProvider,
} from '../../cms/reader/libraryMonthIndexProvider.ts'
import type {
  LocalCalendarDate,
  PublicationYearMonth,
} from '../../participation/types.ts'
import { createEmptyShelfState } from '../../shelf/policy.ts'
import { MAX_SHELF_CAPACITY, type ShelfState } from '../../shelf/types.ts'
import { HistoricalLibraryHost } from '../library/HistoricalLibraryHost.tsx'
import {
  initialHistoricalLibraryState,
  type HistoricalLibraryState,
} from '../library/historicalLibraryModel.ts'
import { ShelfHost } from '../shelf/ShelfHost.tsx'
import { ShelfReplaceDialog } from '../shelf/ShelfReplaceDialog.tsx'
import {
  projectShelfViewModel,
  type ShelfMonthMetadata,
} from '../shelf/shelfModel.ts'
import {
  attemptSelectLibraryMonthForShelf,
  buildShelfMonthMetadataMap,
  isGatewayAuthorizedHistoricalMonth,
  resolveReferenceCurrentYearMonth,
  validateAuthorizedMonthOpen,
  type LibraryShelfSurface,
  type OpenMonthContext,
} from './libraryShelfModel.ts'

export interface LibraryShelfHostProps {
  /**
   * Current publication month (YYYY-MM). When omitted, derived from the
   * gateway-authorized `serverContext.authorizedLocalDate` once Library loads.
   */
  readonly referenceCurrentYearMonth?: PublicationYearMonth | string

  /**
   * Controlled Shelf state. Provide alongside `onShelfStateChange` to attach
   * durable persistence (e.g. `src/shelfPersistence/**` or account sync).
   */
  readonly shelfState?: ShelfState

  /**
   * Initial Shelf state for standalone/ephemeral in-memory usage.
   */
  readonly initialShelfState?: ShelfState

  /**
   * Injected callback invoked whenever a policy-driven action produces a new ShelfState.
   */
  readonly onShelfStateChange?: (nextState: ShelfState) => void

  /**
   * Optional local calendar date used for admittedOn / updatedOn stamps.
   */
  readonly currentLocalDate?: LocalCalendarDate

  /**
   * Typed gateway provider for reading historical months in Library.
   */
  readonly libraryProvider?: LibraryMonthIndexProvider

  /**
   * Number of month summaries to request per Library page.
   */
  readonly libraryPageSize?: number

  /**
   * Optional IANA reader timezone override.
   */
  readonly timeZone?: string

  /**
   * Optional externally supplied month metadata (titles/subtitles).
   */
  readonly monthMetadata?:
    | ReadonlyMap<string, ShelfMonthMetadata>
    | Readonly<Record<string, ShelfMonthMetadata>>

  /**
   * Controlled active surface ('shelf' | 'library').
   */
  readonly surface?: LibraryShelfSurface

  /**
   * Initial active surface for uncontrolled usage. Defaults to 'shelf'.
   */
  readonly initialSurface?: LibraryShelfSurface

  /**
   * Callback invoked when the active surface changes.
   */
  readonly onSurfaceChange?: (surface: LibraryShelfSurface) => void

  /**
   * Typed callback invoked when the reader opens an authorized historical month
   * from either Shelf or Library, preserving origin context.
   */
  readonly onOpenMonth: (yearMonth: PublicationYearMonth, context: OpenMonthContext) => void

  /**
   * Optional outer exit callback (e.g. returning to Hub) from the root surface.
   */
  readonly onExit?: () => void

  /**
   * Accessible label for the outer exit action. Defaults to 'Return'.
   */
  readonly exitLabel?: string
}

/**
 * Standalone Library-to-Shelf reader handoff workspace (Phase 05 / R08).
 *
 * Composes the accepted `ShelfHost` and `HistoricalLibraryHost` without modifying
 * `src/App.tsx`, global tab navigation, `src/shelfPersistence/**`, or `src/shelf/policy.ts`.
 */
export function LibraryShelfHost({
  referenceCurrentYearMonth,
  shelfState: controlledShelfState,
  initialShelfState,
  onShelfStateChange,
  currentLocalDate,
  libraryProvider = defaultGatewayLibraryMonthIndexProvider,
  libraryPageSize = DEFAULT_LIBRARY_PAGE_SIZE,
  timeZone,
  monthMetadata,
  surface: controlledSurface,
  initialSurface = 'shelf',
  onSurfaceChange,
  onOpenMonth,
  onExit,
  exitLabel = 'Return',
}: LibraryShelfHostProps) {
  const [internalShelfState, setInternalShelfState] = useState<ShelfState>(
    () => initialShelfState ?? createEmptyShelfState(),
  )
  const [internalSurface, setInternalSurface] = useState<LibraryShelfSurface>(initialSurface)
  const [returnSurface, setReturnSurface] = useState<LibraryShelfSurface | null>(null)
  const [libraryState, setLibraryState] = useState<HistoricalLibraryState>(
    initialHistoricalLibraryState,
  )
  const [selectedMonthYearMonth, setSelectedMonthYearMonth] = useState<PublicationYearMonth | null>(
    null,
  )
  const [libraryAnnouncement, setLibraryAnnouncement] = useState('')
  const [pendingReplaceTarget, setPendingReplaceTarget] = useState<PublicationYearMonth | null>(
    null,
  )

  const activeShelfState = controlledShelfState ?? internalShelfState
  const activeSurface = controlledSurface ?? internalSurface

  const resolvedCurrentYearMonth = useMemo(
    () =>
      resolveReferenceCurrentYearMonth(
        referenceCurrentYearMonth,
        libraryState.serverContext,
      ),
    [libraryState.serverContext, referenceCurrentYearMonth],
  )

  const mergedMonthMetadata = useMemo(
    () => buildShelfMonthMetadataMap(libraryState.items, monthMetadata),
    [libraryState.items, monthMetadata],
  )

  const shelfViewModel = useMemo(
    () =>
      projectShelfViewModel(
        activeShelfState,
        resolvedCurrentYearMonth ?? '',
        mergedMonthMetadata,
      ),
    [activeShelfState, mergedMonthMetadata, resolvedCurrentYearMonth],
  )

  const commitShelfState = useCallback(
    (nextState: ShelfState) => {
      if (controlledShelfState === undefined) {
        setInternalShelfState(nextState)
      }
      onShelfStateChange?.(nextState)
    },
    [controlledShelfState, onShelfStateChange],
  )

  const navigateToSurface = useCallback(
    (nextSurface: LibraryShelfSurface, recordReturn = true) => {
      if (nextSurface === activeSurface) {
        return
      }
      setReturnSurface(recordReturn ? activeSurface : null)
      if (controlledSurface === undefined) {
        setInternalSurface(nextSurface)
      }
      onSurfaceChange?.(nextSurface)
    },
    [activeSurface, controlledSurface, onSurfaceChange],
  )

  const handleRequestLibraryFromShelf = useCallback(() => {
    navigateToSurface('library', true)
  }, [navigateToSurface])

  const handleViewShelfFromLibrary = useCallback(() => {
    navigateToSurface('shelf', true)
  }, [navigateToSurface])

  const handleShelfBack = useCallback(() => {
    if (returnSurface === 'library') {
      navigateToSurface('library', false)
      return
    }
    onExit?.()
  }, [navigateToSurface, onExit, returnSurface])

  const handleLibraryBack = useCallback(() => {
    if (returnSurface === 'shelf' || initialSurface === 'shelf') {
      navigateToSurface('shelf', false)
      return
    }
    onExit?.()
  }, [initialSurface, navigateToSurface, onExit, returnSurface])

  const handleSelectForShelfFromLibrary = useCallback(
    (yearMonth: string, replaceMonth?: PublicationYearMonth) => {
      const outcome = attemptSelectLibraryMonthForShelf({
        state: activeShelfState,
        yearMonth,
        referenceCurrentYearMonth: resolvedCurrentYearMonth,
        approvedLibraryItems: libraryState.items,
        admittedOn: currentLocalDate,
        replaceMonth,
      })

      if (!outcome.ok) {
        if (outcome.reason === 'capacityExceeded') {
          setPendingReplaceTarget(outcome.pendingReplaceTarget)
          setLibraryAnnouncement(outcome.announcement)
          return
        }
        setLibraryAnnouncement(outcome.message)
        return
      }

      setPendingReplaceTarget(null)
      setSelectedMonthYearMonth(outcome.selectedYearMonth)
      commitShelfState(outcome.state)
      setLibraryAnnouncement(outcome.announcement)
    },
    [
      activeShelfState,
      commitShelfState,
      currentLocalDate,
      libraryState.items,
      resolvedCurrentYearMonth,
    ],
  )

  const handleConfirmReplace = useCallback(
    (replaceYearMonth: PublicationYearMonth) => {
      if (!pendingReplaceTarget) {
        return
      }
      handleSelectForShelfFromLibrary(pendingReplaceTarget, replaceYearMonth)
    },
    [handleSelectForShelfFromLibrary, pendingReplaceTarget],
  )

  const handleCancelReplace = useCallback(() => {
    setPendingReplaceTarget(null)
    setLibraryAnnouncement('Replacement cancelled. Shelf unchanged.')
  }, [])

  const handleOpenFromShelf = useCallback(
    async (yearMonth: PublicationYearMonth) => {
      const check = validateAuthorizedMonthOpen({
        yearMonth,
        origin: 'shelf',
        shelfState: activeShelfState,
        approvedLibraryItems: libraryState.items,
        referenceCurrentYearMonth: resolvedCurrentYearMonth,
      })
      if (!check.ok) {
        return check.reason
      }
      let authorized = false
      try {
        authorized = await isGatewayAuthorizedHistoricalMonth({
          provider: libraryProvider,
          yearMonth: check.yearMonth,
          timeZone,
          pageSize: libraryPageSize,
        })
      } catch {
        authorized = false
      }
      if (!authorized) {
        return `Month ${check.yearMonth} is no longer available in the authorized historical Library catalogue.`
      }
      setSelectedMonthYearMonth(check.yearMonth)
      onOpenMonth(check.yearMonth, { origin: 'shelf' })
    },
    [
      activeShelfState,
      libraryPageSize,
      libraryProvider,
      libraryState.items,
      onOpenMonth,
      resolvedCurrentYearMonth,
      timeZone,
    ],
  )

  const handleOpenFromLibrary = useCallback(
    (yearMonth: string) => {
      const check = validateAuthorizedMonthOpen({
        yearMonth,
        origin: 'library',
        shelfState: activeShelfState,
        approvedLibraryItems: libraryState.items,
        referenceCurrentYearMonth: resolvedCurrentYearMonth,
      })
      if (!check.ok) {
        setLibraryAnnouncement(check.reason)
        return
      }
      setSelectedMonthYearMonth(check.yearMonth)
      onOpenMonth(check.yearMonth, { origin: 'library' })
    },
    [activeShelfState, libraryState.items, onOpenMonth, resolvedCurrentYearMonth],
  )

  const pendingReplaceTitle = useMemo(() => {
    if (!pendingReplaceTarget) {
      return null
    }
    return mergedMonthMetadata.get(pendingReplaceTarget)?.title ?? null
  }, [mergedMonthMetadata, pendingReplaceTarget])

  const shelfOnExit =
    returnSurface === 'library'
      ? handleShelfBack
      : onExit
        ? handleShelfBack
        : undefined

  const shelfExitLabel = returnSurface === 'library' ? 'Back to Library' : exitLabel

  const libraryHasBackToShelf = returnSurface === 'shelf' || initialSurface === 'shelf'
  const libraryOnExit = libraryHasBackToShelf || onExit ? handleLibraryBack : undefined
  const libraryExitLabel = libraryHasBackToShelf ? 'Back to Shelf' : exitLabel
  const needsGatewayCalendarContext =
    activeSurface === 'shelf' && !resolvedCurrentYearMonth
  const calendarContextFailed =
    libraryState.status === 'request-error' || libraryState.status === 'validation-error'
  const showLibrary =
    activeSurface === 'library' || (needsGatewayCalendarContext && calendarContextFailed)
  const showShelf = activeSurface === 'shelf' && Boolean(resolvedCurrentYearMonth)

  return (
    <>
      {showShelf ? (
        <ShelfHost
          referenceCurrentYearMonth={resolvedCurrentYearMonth ?? ''}
          state={activeShelfState}
          onStateChange={commitShelfState}
          onOpenMonth={handleOpenFromShelf}
          onRequestLibraryPicker={handleRequestLibraryFromShelf}
          monthMetadata={mergedMonthMetadata}
          currentLocalDate={currentLocalDate}
          onExit={shelfOnExit}
          exitLabel={shelfExitLabel}
        />
      ) : null}
      {needsGatewayCalendarContext && !calendarContextFailed && (
        <main className="standard-page shelf-page" role="main" aria-label="Shelf loading">
          <section className="library-state-panel library-loading-panel" role="status">
            <div className="library-spinner" aria-hidden="true" />
            <p className="library-loading-text">Preparing your Shelf…</p>
          </section>
        </main>
      )}
      <div hidden={!showLibrary} aria-hidden={!showLibrary}>
        <HistoricalLibraryHost
          provider={libraryProvider}
          pageSize={libraryPageSize}
          timeZone={timeZone}
          onOpenMonth={handleOpenFromLibrary}
          onExit={libraryOnExit}
          exitLabel={libraryExitLabel}
          shelfEntries={activeShelfState.months}
          selectedMonthYearMonth={selectedMonthYearMonth}
          onSelectForShelf={handleSelectForShelfFromLibrary}
          onViewShelf={handleViewShelfFromLibrary}
          shelfMaxCapacity={MAX_SHELF_CAPACITY}
          shelfAnnouncement={libraryAnnouncement}
          preservedState={libraryState}
          onStateChange={setLibraryState}
        />
      </div>

      <ShelfReplaceDialog
        isOpen={pendingReplaceTarget !== null}
        incomingYearMonth={pendingReplaceTarget}
        incomingTitle={pendingReplaceTitle}
        currentEntries={shelfViewModel.entries}
        onConfirmReplace={handleConfirmReplace}
        onCancel={handleCancelReplace}
      />
    </>
  )
}
