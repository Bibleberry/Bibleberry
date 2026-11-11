import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, RotateCcw } from 'lucide-react'
import {
  defaultGatewayMonthProvider,
  type MonthDetailData,
  type MonthGatewayProvider,
  type MonthPreviewData,
  type MonthProgressData,
} from '../../cms/reader/monthProvider.ts'
import { defaultGuestParticipationStore } from '../../participation/defaultGuestStore.ts'
import type { ReaderParticipationStore } from '../../participation/store.ts'
import { useReaderParticipation } from '../../participation/useReaderParticipation.ts'
import { MonthIntroductionView } from './MonthIntroductionView.tsx'
import { MonthScreenView } from './MonthScreenView.tsx'
import {
  defaultMonthIntroStore,
  resolveMonthIntroDecision,
  type MonthIntroEnvelopeV1,
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
  resolveMonthDiscoveryPresentations,
} from './monthScreenModel.ts'
import './monthScreen.css'

export type MonthScreenHostProps = {
  yearMonth: string
  monthProvider?: MonthGatewayProvider
  store?: ReaderParticipationStore
  introStore?: MonthIntroStore
  onOpenChallenge: (slug: string, yearMonth: string) => void
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
  | { readonly status: 'readyDetail'; readonly month: MonthDetailData }

/**
 * Connected container for the feature-gated Month Screen (R08A-6 / Phase 03C).
 *
 * Coordinates `GET /api/months/:yearMonth`, fallback `GET /api/months/:yearMonth/preview`,
 * stateless `POST /api/months/:yearMonth/progress` calculation from `ReaderParticipationStore`,
 * and UI-only `bibleberry-month-intro-v1` introduction/Welcome presentation state.
 */
export function MonthScreenHost({
  yearMonth,
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

  const [introEnvelope, setIntroEnvelope] = useState<MonthIntroEnvelopeV1 | null>(null)
  const [showIntro, setShowIntro] = useState(false)
  const [introCanSkip, setIntroCanSkip] = useState(false)
  const autoIntroHandledRef = useRef<string>('')

  const [progressData, setProgressData] = useState<MonthProgressData | null>(null)
  const [progressLoading, setProgressLoading] = useState(false)
  const [progressError, setProgressError] = useState<string | null>(null)
  const [progressAttempt, setProgressAttempt] = useState(0)

  const [jumpInput, setJumpInput] = useState(cleanYearMonth)
  useEffect(() => {
    setJumpInput(cleanYearMonth)
  }, [cleanYearMonth])

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
    setShowIntro(false)

    async function load() {
      const detailResult = await monthProvider.loadMonth(cleanYearMonth, {
        signal: controller.signal,
      })
      if (ignore) return

      if (detailResult.status === 'ready') {
        setMonthState({ status: 'readyDetail', month: detailResult.month })
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

  // Load local UI intro state (`bibleberry-month-intro-v1`)
  useEffect(() => {
    let ignore = false
    introStore
      .load()
      .then(result => {
        if (!ignore) {
          setIntroEnvelope(result.envelope)
        }
      })
      .catch(() => {
        // Ignore unavailable intro storage gracefully
      })
    return () => {
      ignore = true
    }
  }, [introStore, cleanYearMonth])

  // Decide whether to automatically show Introduction / Welcome on first arrival or rollover
  useEffect(() => {
    if (!introEnvelope) return
    if (monthState.status !== 'readyPreview' && monthState.status !== 'readyDetail') return

    const phase = monthState.status === 'readyPreview' ? 'advancePreview' : monthState.month.phase
    const version = monthState.month.introduction.version
    const handleKey = `${cleanYearMonth}:${phase}:${version}`
    if (autoIntroHandledRef.current === handleKey) return
    autoIntroHandledRef.current = handleKey

    const record = introEnvelope.months[cleanYearMonth]
    const decision = resolveMonthIntroDecision(phase, version, record)
    setIntroCanSkip(decision.canSkipToWelcome)
    if (decision.showAutomatically) {
      setShowIntro(true)
    }
  }, [cleanYearMonth, introEnvelope, monthState])

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
  }, [cleanYearMonth, monthProvider, monthState.status, participationSnapshot.status, completedKey, progressAttempt])

  const handleIntroComplete = () => {
    if (monthState.status === 'readyPreview') {
      const version = monthState.month.introduction.version
      setShowIntro(false)
      void introStore.markPreviewSeen(cleanYearMonth, version).then(res => {
        setIntroEnvelope(res.envelope)
      })
      return
    }
    if (monthState.status === 'readyDetail') {
      const version = monthState.month.introduction.version
      setShowIntro(false)
      void introStore.markWelcomeSeen(cleanYearMonth, version).then(res => {
        setIntroEnvelope(res.envelope)
      })
    }
  }

  const handleOpenIntroManually = () => {
    if (monthState.status === 'readyDetail') {
      const record = introEnvelope?.months[cleanYearMonth]
      setIntroCanSkip(Boolean(record?.previewSeen))
    } else {
      setIntroCanSkip(false)
    }
    setShowIntro(true)
  }

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
        <div className="empty-state">
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

  if (showIntro) {
    if (monthState.status === 'readyPreview') {
      return (
        <MonthIntroductionView
          yearMonth={monthState.month.monthId}
          monthTitle={monthState.month.title}
          mode="preview"
          previewScreens={monthState.month.introduction.previewScreens}
          onComplete={handleIntroComplete}
          onClose={handleIntroComplete}
        />
      )
    }
    return (
      <MonthIntroductionView
        yearMonth={monthState.month.monthId}
        monthTitle={monthState.month.title}
        mode="active"
        previewScreens={monthState.month.introduction.previewScreens}
        welcomeScreen={monthState.month.introduction.welcomeScreen}
        canSkipToWelcome={introCanSkip}
        onComplete={handleIntroComplete}
        onClose={handleIntroComplete}
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
        month={monthState.month}
        weeks={weeks}
        completionSummary={null}
        discoveries={[]}
        onOpenChallenge={slug => onOpenChallenge(slug, monthState.month.monthId)}
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
  )

  return (
    <MonthScreenView
      mode="detail"
      month={monthState.month}
      weeks={weeks}
      completionSummary={completionSummary}
      discoveries={discoveries}
      progressLoading={progressLoading}
      progressError={progressError}
      onRetryProgress={retryProgress}
      onOpenChallenge={slug => onOpenChallenge(slug, monthState.month.monthId)}
      onOpenIntro={handleOpenIntroManually}
      onSelectYearMonth={onSelectYearMonth}
      onExit={onExit}
      exitLabel={exitLabel}
    />
  )
}
