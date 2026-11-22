import { useCallback, useMemo, useRef, useState } from 'react'
import type {
  LocalCalendarDate,
  PublicationYearMonth,
} from '../../participation/types.ts'
import {
  clearActiveFocusMonth,
  createEmptyShelfState,
  putAwayShelfMonth,
  selectShelfMonth,
  SHELF_CONFIRMATION_STALE_MESSAGE,
  setActiveFocusMonth,
  setShelfMonthProtection,
} from '../../shelf/policy.ts'
import type { ShelfState } from '../../shelf/types.ts'
import { areShelfStatesEqual } from '../../shelf/validation.ts'
import {
  filterHistoricalCandidateMonths,
  formatPublicationMonthHeading,
  projectShelfViewModel,
  validateOpenShelfMonthTarget,
  type ShelfEntryViewModel,
  type ShelfMonthMetadata,
} from './shelfModel.ts'
import { ShelfReplaceDialog } from './ShelfReplaceDialog.tsx'
import { ShelfPutAwayDialog } from './ShelfPutAwayDialog.tsx'
import { ShelfView } from './ShelfView.tsx'

export interface ShelfHostProps {
  /**
   * Externally supplied current publication month (YYYY-MM).
   * Used to enforce the strictly-historical Shelf invariant.
   */
  readonly referenceCurrentYearMonth: PublicationYearMonth | string

  /**
   * Controlled Shelf state. When provided alongside `onStateChange`,
   * the parent owns state persistence/synchronization.
   */
  readonly state?: ShelfState

  /**
   * Initial Shelf state for standalone/ephemeral in-memory usage.
   * Note: Ephemeral in-memory state is NOT durable storage.
   */
  readonly initialState?: ShelfState

  /**
   * Callback invoked whenever a policy-driven action produces a new ShelfState.
   * Confirmed changes supply the state the reader saw for conditional persistence.
   */
  readonly onStateChange?: (
    nextState: ShelfState,
    expectedState?: ShelfState,
  ) => void | Promise<void | string>

  /**
   * Callback invoked when the reader opens a validated historical month on the Shelf.
   */
  readonly onOpenMonth: (yearMonth: PublicationYearMonth) =>
    | void
    | string
    | Promise<void | string>

  /**
   * Optional typed callback boundary to open the full Library picker.
   */
  readonly onRequestLibraryPicker?: () => void

  /**
   * Optional externally supplied list of historical months available to add.
   */
  readonly availableHistoricalMonths?: readonly ShelfMonthMetadata[]

  /**
   * Optional metadata map/record for displaying supplied titles/subtitles
   * without fabricating teaching content.
   */
  readonly monthMetadata?:
    | ReadonlyMap<string, ShelfMonthMetadata>
    | Readonly<Record<string, ShelfMonthMetadata>>

  /**
   * Optional local calendar date used for admittedOn / updatedOn stamps.
   */
  readonly currentLocalDate?: LocalCalendarDate

  /**
   * Optional back / exit navigation callback.
   */
  readonly onExit?: () => void

  /**
   * Accessible label for exit action. Defaults to 'Return'.
   */
  readonly exitLabel?: string
}

interface PendingShelfConfirmation {
  readonly yearMonth: PublicationYearMonth
  readonly state: ShelfState
  readonly referenceCurrentYearMonth: string
  readonly entries: readonly ShelfEntryViewModel[]
}

/**
 * State-injected host container for the standalone Shelf reader surface (Phase 05 / R08-4).
 *
 * State ownership:
 * - Supports controlled mode (`state` + `onStateChange`) or standalone ephemeral
 *   in-memory state (`initialState`). Standalone mode does NOT persist to
 *   localStorage, native storage, or account sync.
 * - All mutations route through the accepted pure policy engine in `src/shelf/policy.ts`.
 */
export function ShelfHost({
  referenceCurrentYearMonth,
  state: controlledState,
  initialState,
  onStateChange,
  onOpenMonth,
  onRequestLibraryPicker,
  availableHistoricalMonths = [],
  monthMetadata,
  currentLocalDate,
  onExit,
  exitLabel = 'Return',
}: ShelfHostProps) {
  const [internalState, setInternalState] = useState<ShelfState>(
    () => initialState ?? createEmptyShelfState(),
  )
  const [liveAnnouncement, setLiveAnnouncement] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [pendingReplace, setPendingReplace] = useState<PendingShelfConfirmation | null>(null)
  const [pendingPutAway, setPendingPutAway] = useState<PendingShelfConfirmation | null>(null)
  const shelfHeadingRef = useRef<HTMLHeadingElement>(null)

  const currentState = controlledState ?? internalState

  const reportError = useCallback((message: string) => {
    setErrorMessage(message)
    setLiveAnnouncement(message)
  }, [])

  const commitState = useCallback(
    (nextState: ShelfState, expectedState?: ShelfState) => {
      if (controlledState === undefined) {
        setInternalState(nextState)
      }
      return onStateChange?.(nextState, expectedState)
    },
    [controlledState, onStateChange],
  )

  const viewModel = useMemo(
    () => projectShelfViewModel(currentState, referenceCurrentYearMonth, monthMetadata),
    [currentState, monthMetadata, referenceCurrentYearMonth],
  )

  const candidateMonths = useMemo(
    () =>
      filterHistoricalCandidateMonths(
        availableHistoricalMonths,
        currentState,
        referenceCurrentYearMonth,
      ),
    [availableHistoricalMonths, currentState, referenceCurrentYearMonth],
  )

  const handleOpenMonth = useCallback(
    async (yearMonth: PublicationYearMonth) => {
      const check = validateOpenShelfMonthTarget(
        yearMonth,
        currentState,
        referenceCurrentYearMonth,
      )
      if (!check.ok) {
        setErrorMessage(check.reason)
        setLiveAnnouncement(check.reason)
        return
      }
      setErrorMessage(null)
      try {
        const rejection = await onOpenMonth(check.yearMonth)
        if (typeof rejection === 'string') {
          setErrorMessage(rejection)
          setLiveAnnouncement(rejection)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to open this month.'
        setErrorMessage(message)
        setLiveAnnouncement(message)
      }
    },
    [currentState, onOpenMonth, referenceCurrentYearMonth],
  )

  const handleSelectMonth = useCallback(
    async (yearMonth: string, replaceMonth?: PublicationYearMonth, nextFocus?: PublicationYearMonth | null) => {
      const result = selectShelfMonth(currentState, {
        yearMonth,
        referenceCurrentYearMonth,
        admittedOn: currentLocalDate,
        updatedOn: currentLocalDate,
        replaceMonth,
        nextFocus,
      })

      if (!result.ok) {
        if (!replaceMonth && result.error === 'shelfCapacityExceeded') {
          setErrorMessage(null)
          setPendingReplace({
            yearMonth: yearMonth as PublicationYearMonth,
            state: currentState,
            referenceCurrentYearMonth,
            entries: viewModel.entries,
          })
          setLiveAnnouncement(
            'Shelf is full. Choose an existing month to replace or cancel.',
          )
          return
        }
        reportError(result.message)
        return
      }

      setErrorMessage(null)
      const rejection = await commitState(result.state, replaceMonth ? currentState : undefined)
      if (rejection) {
        reportError(rejection)
        return
      }

      const heading = formatPublicationMonthHeading(yearMonth)
      if (result.action === 'replaced' && replaceMonth) {
        const replacedHeading = formatPublicationMonthHeading(replaceMonth)
        setLiveAnnouncement(`Replaced ${replacedHeading} with ${heading} on Shelf.`)
      } else if (result.action === 'promotedToProtected') {
        setLiveAnnouncement(`${heading} is saved and protected on your Shelf.`)
      } else {
        setLiveAnnouncement(`Added ${heading} to your Shelf.`)
      }
    },
    [commitState, currentLocalDate, currentState, referenceCurrentYearMonth, reportError, viewModel.entries],
  )

  const handleConfirmReplace = useCallback(
    (replaceYearMonth: PublicationYearMonth, nextFocus?: PublicationYearMonth | null) => {
      if (!pendingReplace) return
      setPendingReplace(null)
      if (
        !areShelfStatesEqual(pendingReplace.state, currentState)
        || pendingReplace.referenceCurrentYearMonth !== referenceCurrentYearMonth
      ) {
        reportError(SHELF_CONFIRMATION_STALE_MESSAGE)
        return
      }
      void handleSelectMonth(pendingReplace.yearMonth, replaceYearMonth, nextFocus)
    },
    [currentState, handleSelectMonth, pendingReplace, referenceCurrentYearMonth, reportError],
  )

  const handleCancelReplace = useCallback(() => {
    setPendingReplace(null)
    setLiveAnnouncement('Replacement cancelled. Shelf unchanged.')
  }, [])

  const handleSetProtection = useCallback(
    (yearMonth: PublicationYearMonth, isProtected: boolean) => {
      const result = setShelfMonthProtection(currentState, {
        yearMonth,
        isProtected,
        updatedOn: currentLocalDate,
      })

      if (!result.ok) {
        setErrorMessage(result.message)
        setLiveAnnouncement(result.message)
        return
      }

      setErrorMessage(null)
      commitState(result.state)
      const heading = formatPublicationMonthHeading(yearMonth)
      setLiveAnnouncement(
        isProtected
          ? `${heading} is now protected from rollover replacement.`
          : `Removed rollover protection from ${heading}.`,
      )
    },
    [commitState, currentLocalDate, currentState],
  )

  const handlePutAway = useCallback(
    async (yearMonth: PublicationYearMonth, nextFocus?: PublicationYearMonth | null) => {
      const result = putAwayShelfMonth(currentState, {
        yearMonth,
        updatedOn: currentLocalDate,
        nextFocus,
      })

      if (!result.ok) {
        if (result.error === 'requiresFocusDecision' && nextFocus === undefined) {
          setErrorMessage(null)
          setPendingPutAway({
            yearMonth,
            state: currentState,
            referenceCurrentYearMonth,
            entries: viewModel.entries,
          })
          return
        }
        reportError(result.message)
        return
      }

      if (result.action === 'noop') return
      setErrorMessage(null)
      const rejection = await commitState(result.state, nextFocus !== undefined ? currentState : undefined)
      if (rejection) {
        reportError(rejection)
        return
      }
      const heading = formatPublicationMonthHeading(yearMonth)
      setLiveAnnouncement(
        `${heading} put away from Shelf. Your completed Challenges and saved Scripture are preserved.`,
      )
    },
    [commitState, currentLocalDate, currentState, referenceCurrentYearMonth, reportError, viewModel.entries],
  )

  const handleConfirmPutAway = (nextFocus: PublicationYearMonth | null) => {
    if (!pendingPutAway) return
    setPendingPutAway(null)
    if (
      !areShelfStatesEqual(pendingPutAway.state, currentState)
      || pendingPutAway.referenceCurrentYearMonth !== referenceCurrentYearMonth
    ) {
      reportError(SHELF_CONFIRMATION_STALE_MESSAGE)
      return
    }
    void handlePutAway(pendingPutAway.yearMonth, nextFocus)
  }

  const handleSetFocus = useCallback(
    (yearMonth: PublicationYearMonth) => {
      const result = setActiveFocusMonth(currentState, {
        yearMonth,
        updatedOn: currentLocalDate,
      })

      if (!result.ok) {
        setErrorMessage(result.message)
        setLiveAnnouncement(result.message)
        return
      }

      setErrorMessage(null)
      commitState(result.state)
      const heading = formatPublicationMonthHeading(yearMonth)
      setLiveAnnouncement(`${heading} set as active study focus.`)
    },
    [commitState, currentLocalDate, currentState],
  )

  const handleClearFocus = useCallback(() => {
    const nextState = clearActiveFocusMonth(currentState, currentLocalDate)
    setErrorMessage(null)
    commitState(nextState)
    setLiveAnnouncement('Active study focus cleared.')
  }, [commitState, currentLocalDate, currentState])

  const pendingTitle = useMemo(() => {
    return candidateMonths.find(c => c.yearMonth === pendingReplace?.yearMonth)?.title ?? null
  }, [candidateMonths, pendingReplace])

  return (
    <>
      <ShelfView
        headingRef={shelfHeadingRef}
        viewModel={viewModel}
        candidateMonths={candidateMonths}
        liveAnnouncement={liveAnnouncement}
        errorMessage={errorMessage}
        onDismissError={() => setErrorMessage(null)}
        onOpenMonth={handleOpenMonth}
        onSelectMonth={handleSelectMonth}
        onSetProtection={handleSetProtection}
        onPutAway={handlePutAway}
        onSetFocus={handleSetFocus}
        onClearFocus={handleClearFocus}
        onRequestLibraryPicker={onRequestLibraryPicker}
        onExit={onExit}
        exitLabel={exitLabel}
      />

      <ShelfReplaceDialog
        isOpen={pendingReplace !== null}
        incomingYearMonth={pendingReplace?.yearMonth ?? null}
        incomingTitle={pendingTitle}
        currentEntries={pendingReplace?.entries ?? []}
        onConfirmReplace={handleConfirmReplace}
        onCancel={handleCancelReplace}
        fallbackFocusRef={shelfHeadingRef}
      />
      {pendingPutAway && (
        <ShelfPutAwayDialog
          yearMonth={pendingPutAway.yearMonth}
          remainingEntries={pendingPutAway.entries.filter(entry => entry.yearMonth !== pendingPutAway.yearMonth)}
          onConfirm={handleConfirmPutAway}
          onCancel={() => {
            setPendingPutAway(null)
            setLiveAnnouncement('Put Away cancelled. Shelf unchanged.')
          }}
          fallbackFocusRef={shelfHeadingRef}
        />
      )}
    </>
  )
}
