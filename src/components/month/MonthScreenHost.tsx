import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, RotateCcw } from 'lucide-react'
import {
  defaultGatewayMonthProvider,
  type MonthDetailData,
  type MonthGatewayProvider,
  type MonthPreviewData,
  type MonthProgressData,
} from '../../cms/reader/monthProvider.ts'
import { persistGatewayMonthProgressAwards } from '../../cms/reader/monthAwardReconciliation.ts'
import { defaultGuestParticipationStore } from '../../participation/defaultGuestStore.ts'
import type { ReaderParticipationStore } from '../../participation/store.ts'
import type { CanonicalAwardId } from '../../participation/types.ts'
import { useReaderParticipation } from '../../participation/useReaderParticipation.ts'
import { isHistoricalPublicationYearMonth, parseValidPublicationYearMonth } from '../../shelf/validation.ts'
import { MonthIntroductionView } from './MonthIntroductionView.tsx'
import { MonthShelfAction } from './MonthShelfAction.tsx'
import { MonthScreenView } from './MonthScreenView.tsx'
import {
  defaultMonthIntroStore,
  emptyMonthIntroEnvelope,
  resolveMonthIntroDecision,
  type MonthIntroLoadResult,
  type MonthIntroStore,
} from './monthIntroStorage.ts'
import {
  deriveMonthCompletionSummary,
  deriveMonthSlotPresentations,
  extractCompletedCmsChallengeIdsForMonth,
  formatYearMonthHeading,
  getAdjacentYearMonths,
  groupMonthSlotsByWeek,
  isValidYearMonth,
  resolveDurableDiscoveryAward,
  resolveMonthDiscoveryPresentations,
  type MonthDiscoveryPresentation,
} from './monthScreenModel.ts'
import './monthScreen.css'

export type MonthScreenHostProps = {
  yearMonth: string
  inReaderShell?: boolean
  captureReplayReturn?: () => (() => void) | undefined
  monthProvider?: MonthGatewayProvider
  store?: ReaderParticipationStore
  introStore?: MonthIntroStore
  onOpenChallenge: (slug: string, yearMonth: string, expectedDocumentId: string) => void
  onSelectYearMonth: (yearMonth: string) => void
  onExit?: () => void
  exitLabel?: string
}

type LoadedMonthState =
  | { readonly status: 'loading' }
  | { readonly status: 'notFound'; readonly yearMonth: string }
  | { readonly status: 'requestError'; readonly message: string }
  | { readonly status: 'validationError'; readonly message: string }
  | { readonly status: 'readyPreview'; readonly month: MonthPreviewData }
  | { readonly status: 'readyDetail'; readonly month: MonthDetailData; readonly authorizedLocalDate: string }

/**
 * Connected container for the feature-gated Month Screen (R08A-6 / Phase 03C).
 *
 * Coordinates `GET /api/months/:yearMonth`, fallback `GET /api/months/:yearMonth/preview`,
 * stateless `POST /api/months/:yearMonth/progress` calculation from `ReaderParticipationStore`,
 * and UI-only `bibleberry-month-intro-v1` introduction/Welcome presentation state.
 */
export function MonthScreenHost(props: MonthScreenHostProps) {
  return <MonthScreen key={props.yearMonth.trim()} {...props} />
}

function MonthScreen({
  yearMonth,
  inReaderShell = false,
  captureReplayReturn,
  monthProvider = defaultGatewayMonthProvider,
  store = defaultGuestParticipationStore,
  introStore = defaultMonthIntroStore,
  onOpenChallenge,
  onSelectYearMonth,
  onExit,
  exitLabel = 'Return to Today',
}: MonthScreenHostProps) {
  const cleanYearMonth = yearMonth.trim()
  const participationSnapshot = useReaderParticipation(store)

  const [monthState, setMonthState] = useState<LoadedMonthState>({ status: 'loading' })
  const [loadAttempt, setLoadAttempt] = useState(0)

  const [introState, setIntroState] = useState<MonthIntroLoadResult | null>(null)
  const [introAttempt, setIntroAttempt] = useState(0)
  const [introPresentation, setIntroPresentation] = useState<'automatic' | 'replay' | 'dismissed'>('automatic')
  const [introSaving, setIntroSaving] = useState(false)
  const [introSaveFailed, setIntroSaveFailed] = useState(false)
  const returnFromIntro = useRef<(() => void) | undefined>(undefined)

  const [progressData, setProgressData] = useState<MonthProgressData | null>(null)
  const [progressLoading, setProgressLoading] = useState(false)
  const [progressError, setProgressError] = useState<string | null>(null)
  const [progressAttempt, setProgressAttempt] = useState(0)
  const [viewerState, setViewerState] = useState<{
    yearMonth: string
    awardId: CanonicalAwardId
  } | null>(null)

  const [jumpInput, setJumpInput] = useState(cleanYearMonth)

  const retryLoad = useCallback(() => {
    setMonthState({ status: 'loading' })
    setLoadAttempt(prev => prev + 1)
  }, [])

  const retryProgress = useCallback(() => {
    setProgressError(null)
    setProgressAttempt(prev => prev + 1)
  }, [])

  // Load month detail -> fallback to advance preview only when detail returns 404.
  useEffect(() => {
    if (!isValidYearMonth(cleanYearMonth)) {
      setMonthState({ status: 'notFound', yearMonth: cleanYearMonth })
      return
    }

    const controller = new AbortController()
    let ignore = false

    setMonthState({ status: 'loading' })
    setProgressData(null)
    setProgressError(null)
    async function load() {
      const detailResult = await monthProvider.loadMonth(cleanYearMonth, {
        signal: controller.signal,
      })
      if (ignore) return

      if (detailResult.status === 'ready') {
        setMonthState({
          status: 'readyDetail',
          month: detailResult.month,
          authorizedLocalDate: detailResult.serverContext.authorizedLocalDate,
        })
        return
      }

      if (detailResult.status === 'requestError') {
        setMonthState({ status: 'requestError', message: detailResult.message })
        return
      }

      if (detailResult.status === 'validationError') {
        setMonthState({ status: 'validationError', message: detailResult.message })
        return
      }

      // detailResult.status === 'notFound': check whether advance preview is open
      const previewResult = await monthProvider.loadMonthPreview(cleanYearMonth, {
        signal: controller.signal,
      })
      if (ignore) return

      if (previewResult.status === 'ready') {
        setMonthState({ status: 'readyPreview', month: previewResult.month })
      } else if (previewResult.status === 'requestError') {
        setMonthState({ status: 'requestError', message: previewResult.message })
      } else if (previewResult.status === 'validationError') {
        setMonthState({ status: 'validationError', message: previewResult.message })
      } else {
        setMonthState({ status: 'notFound', yearMonth: cleanYearMonth })
      }
    }

    load().catch((err: unknown) => {
      if (ignore) return
      if (err instanceof DOMException && err.name === 'AbortError') return
      if (err instanceof Error && err.name === 'AbortError') return
      setMonthState({
        status: 'requestError',
        message: err instanceof Error ? err.message : 'Unable to load monthly publication',
      })
    })

    return () => {
      ignore = true
      controller.abort()
    }
  }, [cleanYearMonth, monthProvider, loadAttempt])

  useEffect(() => {
    let ignore = false
    void Promise.resolve()
      .then(() => introStore.load())
      .catch(() => ({ envelope: emptyMonthIntroEnvelope(), health: 'storageUnavailable' } as const))
      .then(result => {
        if (!ignore) setIntroState(result)
      })
    return () => { ignore = true }
  }, [introStore, introAttempt])

  const monthReady = monthState.status === 'readyPreview' || monthState.status === 'readyDetail'
  const introRecord = introState?.envelope.months[cleanYearMonth]
  const introDecision = monthReady && introState
    ? resolveMonthIntroDecision(monthState.month.phase, monthState.month.introduction.version, introRecord)
    : undefined
  const introLoadFailed = introState?.health === 'storageUnavailable' || introState?.health === 'unsupportedNewerSchema'
  const showAutomatically = introDecision?.showAutomatically
    && !(inReaderShell && monthState.status === 'readyDetail' && introRecord?.welcomeSeen)
  const showIntro = introPresentation === 'replay' || (introPresentation === 'automatic' && showAutomatically)

  useLayoutEffect(() => {
    if (!showIntro && monthReady) {
      returnFromIntro.current?.()
      returnFromIntro.current = undefined
    }
  }, [monthReady, showIntro])

  const activeSlots = useMemo(
    () => (monthState.status === 'readyDetail' ? monthState.month.slots : undefined),
    [monthState],
  )

  const completedChallengeIds = useMemo(() => {
    if (monthState.status !== 'readyDetail' || participationSnapshot.status !== 'ready') {
      return []
    }
    return extractCompletedCmsChallengeIdsForMonth(participationSnapshot.data, activeSlots)
  }, [monthState.status, participationSnapshot.status, participationSnapshot.data, activeSlots])

  const completedKey = completedChallengeIds.join('|')

  // Statelessly compute discovery progress via gateway POST /api/months/:yearMonth/progress
  useEffect(() => {
    if (monthState.status !== 'readyDetail' || participationSnapshot.status !== 'ready') {
      return
    }

    const controller = new AbortController()
    let ignore = false
    setProgressLoading(true)
    setProgressError(null)

    const idsToSend = completedKey ? completedKey.split('|') : []
    monthProvider
      .loadMonthProgress(cleanYearMonth, idsToSend, { signal: controller.signal })
      .then(res => {
        if (ignore) return
        setProgressLoading(false)
        if (res.status === 'ready') {
          setProgressData(res.progress)
          setProgressError(null)
          void persistGatewayMonthProgressAwards(store, res, cleanYearMonth).catch(() => {
            if (!ignore) setProgressError('Unable to save earned discovery progress.')
          })
        } else if (res.status === 'requestError') {
          setProgressError(res.message || 'Unable to refresh discovery progress.')
        } else if (res.status === 'validationError') {
          setProgressError('Discovery progress response could not be verified.')
        }
      })
      .catch((err: unknown) => {
        if (ignore) return
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (err instanceof Error && err.name === 'AbortError') return
        setProgressLoading(false)
        setProgressError(err instanceof Error ? err.message : 'Unable to refresh discovery progress.')
      })

    return () => {
      ignore = true
      controller.abort()
    }
  }, [cleanYearMonth, monthProvider, monthState.status, participationSnapshot.status, completedKey, progressAttempt, store])

  const returnToCalendar = () => {
    returnFromIntro.current ??= () => {
      document.getElementById(`month-screen-heading-${cleanYearMonth}`)?.focus({ preventScroll: true })
    }
    setIntroSaveFailed(false)
    setIntroPresentation('dismissed')
  }

  const handleIntroComplete = async () => {
    if (!monthReady || introSaving) return
    if (introPresentation === 'replay' && !showAutomatically) {
      returnToCalendar()
      return
    }
    setIntroSaving(true)
    setIntroSaveFailed(false)
    const version = monthState.month.introduction.version
    try {
      const result = monthState.status === 'readyPreview'
        ? await introStore.markPreviewSeen(cleanYearMonth, version)
        : await introStore.markWelcomeSeen(cleanYearMonth, version)
      if (result.health !== 'ok') {
        setIntroSaveFailed(true)
        return
      }
      setIntroState(result)
      returnToCalendar()
    } catch {
      setIntroSaveFailed(true)
    } finally {
      setIntroSaving(false)
    }
  }

  const handleOpenIntroManually = () => {
    setViewerState(null)
    returnFromIntro.current = captureReplayReturn?.()
    setIntroPresentation('replay')
  }

  const handleOpenEarnedCard = useCallback(
    (discovery: MonthDiscoveryPresentation) => {
      if (monthState.status !== 'readyDetail') return
      if (
        !discovery.isEarned
        || !discovery.hasStoredAward
        || !discovery.hasCardDisplay
        || !discovery.awardId
        || !discovery.earnedCard
      ) {
        return
      }

      const currentData =
        participationSnapshot.status === 'ready' ? participationSnapshot.data : undefined
      const durable = resolveDurableDiscoveryAward(
        currentData,
        discovery.discoveryId,
        discovery.kind,
        monthState.month.monthId,
      )
      if (
        !durable
        || !durable.validatedCard
        || durable.awardRecord.awardId !== discovery.awardId
      ) {
        return
      }

      setViewerState({
        yearMonth: monthState.month.monthId,
        awardId: durable.awardRecord.awardId,
      })

      if (!durable.awardRecord.cardViewed) {
        void store
          .dispatch({
            type: 'markEarnedCardViewed',
            awardId: durable.awardRecord.awardId,
          })
          .catch(() => {
            // Store queues pending commands safely; viewer remains open.
          })
      }
    },
    [monthState, participationSnapshot, store],
  )

  const handleCloseEarnedCard = useCallback(() => {
    setViewerState(null)
  }, [])

  const renderFallbackSwitcher = () => {
    const valid = isValidYearMonth(cleanYearMonth)
    const adjacent = valid ? getAdjacentYearMonths(cleanYearMonth) : null
    return (
      <nav className="month-switcher" aria-label="Switch publication month">
        {adjacent && (
          <button
            type="button"
            className="button button--secondary button--small"
            onClick={() => onSelectYearMonth(adjacent.previous)}
          >
            <ArrowLeft size={15} aria-hidden="true" /> {adjacent.previous}
          </button>
        )}
        <form
          className="month-switcher__jump"
          onSubmit={event => {
            event.preventDefault()
            if (isValidYearMonth(jumpInput)) {
              onSelectYearMonth(jumpInput.trim())
            }
          }}
        >
          <label htmlFor="month-fallback-jump" className="sr-only">
            Select month (YYYY-MM)
          </label>
          <input
            id="month-fallback-jump"
            type="month"
            value={isValidYearMonth(jumpInput) ? jumpInput : ''}
            onChange={event => setJumpInput(event.target.value)}
            aria-label="Jump to month"
          />
          <button type="submit" className="button button--secondary button--small">
            Go
          </button>
        </form>
        {adjacent && (
          <button
            type="button"
            className="button button--secondary button--small"
            onClick={() => onSelectYearMonth(adjacent.next)}
          >
            {adjacent.next} <ArrowRight size={15} aria-hidden="true" />
          </button>
        )}
      </nav>
    )
  }

  if (monthState.status === 'loading') {
    return (
      <div className="standard-page month-screen" role="status" aria-live="polite">
        <div className="month-screen__topbar">
          {onExit && (
            <button type="button" className="back-link" onClick={onExit}>
              <ArrowLeft size={17} aria-hidden="true" /> {exitLabel}
            </button>
          )}
        </div>
        <p>Loading {formatYearMonthHeading(cleanYearMonth)}…</p>
      </div>
    )
  }

  if (monthState.status === 'requestError') {
    return (
      <div className="standard-page month-screen">
        <div className="month-screen__topbar">
          {onExit && (
            <button type="button" className="back-link" onClick={onExit}>
              <ArrowLeft size={17} aria-hidden="true" /> {exitLabel}
            </button>
          )}
          {renderFallbackSwitcher()}
        </div>
        <div className="error-panel" role="alert">
          <h2>Unable to load Month</h2>
          <p>{monthState.message || 'A network error occurred while loading this month.'}</p>
          <button type="button" className="button button--secondary" onClick={retryLoad}>
            <RotateCcw size={16} aria-hidden="true" /> Retry
          </button>
        </div>
      </div>
    )
  }

  if (monthState.status === 'validationError') {
    return (
      <div className="standard-page month-screen">
        <div className="month-screen__topbar">
          {onExit && (
            <button type="button" className="back-link" onClick={onExit}>
              <ArrowLeft size={17} aria-hidden="true" /> {exitLabel}
            </button>
          )}
          {renderFallbackSwitcher()}
        </div>
        <div className="error-panel" role="alert">
          <h2>Month content unavailable</h2>
          <p>This monthly publication response could not be verified safely.</p>
          <button type="button" className="button button--secondary" onClick={retryLoad}>
            <RotateCcw size={16} aria-hidden="true" /> Retry
          </button>
        </div>
      </div>
    )
  }

  if (monthState.status === 'notFound') {
    return (
      <div className="standard-page month-screen">
        <div className="month-screen__topbar">
          {onExit && (
            <button type="button" className="back-link" onClick={onExit}>
              <ArrowLeft size={17} aria-hidden="true" /> {exitLabel}
            </button>
          )}
          {renderFallbackSwitcher()}
        </div>
        <div className="empty-state" role="status">
          <h2>Month unavailable</h2>
          <p>
            {isValidYearMonth(cleanYearMonth)
              ? `${formatYearMonthHeading(cleanYearMonth)} is not currently available.`
              : 'The requested publication month is not valid or not available.'}
          </p>
          <button type="button" className="button button--secondary" onClick={retryLoad}>
            <RotateCcw size={16} aria-hidden="true" /> Try Again
          </button>
        </div>
      </div>
    )
  }

  if (!introState || introLoadFailed) {
    return (
      <div className="standard-page month-screen">
        {onExit && (
          <button type="button" className="back-link" onClick={onExit}>
            <ArrowLeft size={17} aria-hidden="true" /> {exitLabel}
          </button>
        )}
        {introLoadFailed ? (
          <div className="error-panel" role="alert">
            <h2>Unable to load Monthly Introduction status</h2>
            <button type="button" className="button button--secondary" onClick={() => {
              setIntroState(null)
              setIntroAttempt(attempt => attempt + 1)
            }}>
              <RotateCcw size={16} aria-hidden="true" /> Retry
            </button>
          </div>
        ) : <p role="status">Loading Monthly Introduction status…</p>}
      </div>
    )
  }

  if (showIntro) {
    const preview = monthState.status === 'readyPreview'
    const mandatory = inReaderShell && !preview && introPresentation === 'automatic'
    return (
      <MonthIntroductionView
        yearMonth={monthState.month.monthId}
        monthTitle={monthState.month.title}
        mode={preview ? 'preview' : 'active'}
        previewScreens={monthState.month.introduction.previewScreens}
        welcomeScreen={preview ? undefined : monthState.month.introduction.welcomeScreen}
        canSkipToWelcome={introDecision?.canSkipToWelcome}
        onComplete={handleIntroComplete}
        onClose={mandatory ? onExit : returnToCalendar}
        closeLabel={mandatory ? 'Return to previous screen' : undefined}
        saving={introSaving}
        saveFailed={introSaveFailed}
      />
    )
  }

  const participationData =
    participationSnapshot.status === 'ready' ? participationSnapshot.data : undefined

  if (monthState.status === 'readyPreview') {
    const slotPresentations = deriveMonthSlotPresentations(
      monthState.month.year,
      monthState.month.month,
      monthState.month.slots,
      participationData,
    )
    const weeks = groupMonthSlotsByWeek(monthState.month.monthId, slotPresentations)
    return (
      <MonthScreenView
        mode="preview"
        showProvisionalNotice={!inReaderShell}
        month={monthState.month}
        weeks={weeks}
        completionSummary={null}
        discoveries={[]}
        onOpenChallenge={(slug, documentId) => onOpenChallenge(slug, monthState.month.monthId, documentId)}
        onOpenIntro={handleOpenIntroManually}
        onSelectYearMonth={onSelectYearMonth}
        onExit={onExit}
        exitLabel={exitLabel}
      />
    )
  }

  const slotPresentations = deriveMonthSlotPresentations(
    monthState.month.year,
    monthState.month.month,
    monthState.month.slots,
    participationData,
  )
  const weeks = groupMonthSlotsByWeek(monthState.month.monthId, slotPresentations)
  const completionSummary = deriveMonthCompletionSummary(
    monthState.month.totalChallenges,
    slotPresentations,
    progressData,
    monthState.month.monthId,
  )
  const discoveries = resolveMonthDiscoveryPresentations(
    monthState.month.discoveries,
    progressData,
    monthState.month.monthId,
    participationData,
  )
  const openAwardId =
    viewerState?.yearMonth === monthState.month.monthId ? viewerState.awardId : null
  const activeEarnedCardDiscovery = openAwardId
    ? (discoveries.find(
        d =>
          d.isEarned
          && d.hasStoredAward
          && d.hasCardDisplay
          && d.awardId === openAwardId
          && d.earnedCard !== undefined,
      ) ?? null)
    : null

  const historicalMonth = parseValidPublicationYearMonth(monthState.month.monthId)
  const referenceMonth = parseValidPublicationYearMonth(monthState.authorizedLocalDate.slice(0, 7))
  const shelfAction = inReaderShell && monthState.month.phase === 'historical'
    && historicalMonth && referenceMonth && isHistoricalPublicationYearMonth(historicalMonth, referenceMonth)
    ? <MonthShelfAction
        yearMonth={historicalMonth}
        title={monthState.month.title}
        referenceMonth={referenceMonth}
        authorizedLocalDate={monthState.authorizedLocalDate}
      />
    : undefined

  return (
    <MonthScreenView
      mode="detail"
      shelfAction={shelfAction}
      showProvisionalNotice={!inReaderShell}
      currentDate={inReaderShell && monthState.month.phase === 'active' ? monthState.authorizedLocalDate : undefined}
      month={monthState.month}
      weeks={weeks}
      completionSummary={completionSummary}
      discoveries={discoveries}
      progressLoading={progressLoading}
      progressError={progressError}
      onRetryProgress={retryProgress}
      onOpenChallenge={(slug, documentId) => onOpenChallenge(slug, monthState.month.monthId, documentId)}
      onOpenIntro={handleOpenIntroManually}
      onSelectYearMonth={onSelectYearMonth}
      onExit={onExit}
      exitLabel={exitLabel}
      activeEarnedCardDiscovery={activeEarnedCardDiscovery}
      onOpenEarnedCard={handleOpenEarnedCard}
      onCloseEarnedCard={handleCloseEarnedCard}
    />
  )
}
