import { useCallback, useMemo, useState } from 'react'
import type {
  LocalCalendarDate,
  PublicationYearMonth,
} from '../../participation/types.ts'
import {
  clearActiveFocusMonth,
  createEmptyShelfState,
  putAwayShelfMonth,
  selectShelfMonth,
  setActiveFocusMonth,
  setShelfMonthProtection,
} from '../../shelf/policy.ts'
import type { ShelfState } from '../../shelf/types.ts'
import {
  filterHistoricalCandidateMonths,
  formatPublicationMonthHeading,
  projectShelfViewModel,
  validateOpenShelfMonthTarget,
  type ShelfMonthMetadata,
} from './shelfModel.ts'
import { ShelfReplaceDialog } from './ShelfReplaceDialog.tsx'
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
   */
  readonly onStateChange?: (nextState: ShelfState) => void

  /**
   * Callback invoked when the reader opens a validated historical month on the Shelf.
   */
  readonly onOpenMonth: (yearMonth: PublicationYearMonth) => void

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
  const [pendingReplaceTarget, setPendingReplaceTarget] = useState<PublicationYearMonth | null>(
    null,
  )

  const currentState = controlledState ?? internalState

  const commitState = useCallback(
    (nextState: ShelfState) => {
      if (controlledState === undefined) {
        setInternalState(nextState)
      }
      onStateChange?.(nextState)
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
    (yearMonth: PublicationYearMonth) => {
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
      onOpenMonth(check.yearMonth)
    },
    [currentState, onOpenMonth, referenceCurrentYearMonth],
  )

  const handleSelectMonth = useCallback(
    (yearMonth: string, replaceMonth?: PublicationYearMonth) => {
      const result = selectShelfMonth(currentState, {
        yearMonth,
        referenceCurrentYearMonth,
        admittedOn: currentLocalDate,
        updatedOn: currentLocalDate,
        replaceMonth,
      })

      if (!result.ok) {
        if (result.error === 'shelfCapacityExceeded') {
          setErrorMessage(null)
          setPendingReplaceTarget(yearMonth as PublicationYearMonth)
          setLiveAnnouncement(
            'Shelf is full. Choose an existing month to replace or cancel.',
          )
          return
        }
        setErrorMessage(result.message)
        setLiveAnnouncement(result.message)
        return
      }

      setErrorMessage(null)
      setPendingReplaceTarget(null)
      commitState(result.state)

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
    [commitState, currentLocalDate, currentState, referenceCurrentYearMonth],
  )

  const handleConfirmReplace = useCallback(
    (replaceYearMonth: PublicationYearMonth) => {
      if (!pendingReplaceTarget) {
        return
      }
      handleSelectMonth(pendingReplaceTarget, replaceYearMonth)
    },
    [handleSelectMonth, pendingReplaceTarget],
  )

  const handleCancelReplace = useCallback(() => {
    setPendingReplaceTarget(null)
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
    (yearMonth: PublicationYearMonth) => {
      const result = putAwayShelfMonth(currentState, {
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
      setLiveAnnouncement(
        `${heading} put away from Shelf. Your completed Challenges and saved Scripture are preserved.`,
      )
    },
    [commitState, currentLocalDate, currentState],
  )

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
    if (!pendingReplaceTarget) return null
    const match = candidateMonths.find(c => c.yearMonth === pendingReplaceTarget)
    return match?.title ?? null
  }, [candidateMonths, pendingReplaceTarget])

  return (
    <>
      <ShelfView
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
        isOpen={pendingReplaceTarget !== null}
        incomingYearMonth={pendingReplaceTarget}
        incomingTitle={pendingTitle}
        currentEntries={viewModel.entries}
        onConfirmReplace={handleConfirmReplace}
        onCancel={handleCancelReplace}
      />
    </>
  )
}
