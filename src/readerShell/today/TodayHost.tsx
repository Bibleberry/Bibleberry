import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, CheckCircle2, RotateCcw } from 'lucide-react'
import {
  createHubContinueAppInput,
  resolveHubContinueFocusMonth,
} from '../../appIntegration/hubContinueInput.ts'
import {
  defaultGatewayMonthProvider,
  detectReaderTimeZone,
  resolveReaderTimeZone,
  type MonthDetailResult,
  type MonthGatewayProvider,
} from '../../cms/reader/monthProvider.ts'
import {
  defaultGatewayCatalogProvider,
  type ReleasedCatalogProvider,
  type ReleasedCatalogResult,
} from '../../cms/reader/releasedCatalogProvider.ts'
import { HubContinueCard } from '../../components/hubContinue/HubContinueCard.tsx'
import { formatYearMonthHeading } from '../../components/month/monthScreenModel.ts'
import { deriveHubContinueSuggestion } from '../../hubContinue/engine.ts'
import { defaultGuestParticipationStore } from '../../participation/defaultGuestStore.ts'
import type { ReaderParticipationStore } from '../../participation/store.ts'
import type { PublicationYearMonth } from '../../participation/types.ts'
import { useReaderParticipation } from '../../participation/useReaderParticipation.ts'
import { defaultGuestShelfStore } from '../../shelfPersistence/defaultGuestShelfStore.ts'
import type { GuestShelfStore } from '../../shelfPersistence/store.ts'
import { useGuestShelfStore } from '../../shelfPersistence/useGuestShelfStore.ts'
import {
  deriveTodayPrimaryAction,
  type OpenChallengeIntent,
  type OpenMonthIntent,
  type TodayChallengeEntry,
  type TodayExploreReason,
  type TodayMonthSource,
} from './primaryActionModel.ts'
import { loadAuthorizedTodayMonth } from './todayMonthLoader.ts'
import type { TodayRolloverContext } from './todayShelfRollover.ts'
import { usePriorMonthContinue } from './usePriorMonthContinue.ts'
import { useTodayShelfRollover } from './useTodayShelfRollover.ts'

export interface TodayHostProps {
  readonly onOpenChallenge: (intent: OpenChallengeIntent) => void
  readonly onOpenMonth: (intent: OpenMonthIntent) => void
  readonly onOpenNews?: () => void
  readonly monthProvider?: MonthGatewayProvider
  readonly catalogProvider?: ReleasedCatalogProvider
  readonly participationStore?: ReaderParticipationStore
  readonly shelfStore?: GuestShelfStore
  readonly timeZone?: string
  readonly bootstrapYearMonth?: string
  readonly getNow?: () => Date
}

const LOADING_TODAY_MONTH: TodayMonthSource = { status: 'loading' }

interface FetchedTodayMonthData {
  readonly key: string
  readonly result: MonthDetailResult
  readonly unpublishedMonthDate?: TodayRolloverContext
}

interface FetchedHubContinueGatewayData {
  readonly key: string
  readonly focusMonth: PublicationYearMonth
  readonly timeZone: string
  readonly monthDetailsByYearMonth: ReadonlyMap<string, MonthDetailResult>
  readonly releasedCatalog: ReleasedCatalogResult
}

function primaryChallengeCtaLabel(entry: TodayChallengeEntry): string {
  switch (entry) {
    case 'readAgain':
      return 'Read Again'
    case 'resume':
      return 'Resume Today’s Reading'
    case 'start':
      return 'Open Today’s Reading'
  }
}

function primaryChallengeStatusLabel(entry: TodayChallengeEntry, isCompleted: boolean): string {
  if (isCompleted || entry === 'readAgain') return 'Completed'
  if (entry === 'resume') return 'In Progress'
  return 'Available Today'
}

function exploreReasonCopy(reason: TodayExploreReason): string {
  switch (reason) {
    case 'notYetReleased':
      return 'Today’s reading has not yet been released. You can explore this month’s available teachings whenever you are ready.'
    case 'withdrawn':
    case 'noChallengeScheduled':
    case 'invalidSlot':
    case 'ambiguousSlot':
      return 'No reading is currently available for today. You can explore this month’s available teachings whenever you are ready.'
  }
}

/**
 * Opal Lantern (Issue #307): Gateway-authorized Today host and presentation for R06 (WP-04).
 *
 * - Loads the current Month via `loadAuthorizedTodayMonth` (bounded device-month bootstrap
 *   plus at most one corrected month request on gateway date mismatch or 404 → News context).
 * - Subscribes to durable guest participation (`defaultGuestParticipationStore`) and Shelf
 *   state (`defaultGuestShelfStore`).
 * - Derives primary teaching, compact Current Month link, and single secondary continuation
 *   exclusively through `deriveTodayPrimaryAction` and `deriveHubContinueSuggestion`.
 * - Never fabricates progress, calendar grids, or Monthly Introductions.
 */
export function TodayHost({
  onOpenChallenge,
  onOpenMonth,
  onOpenNews,
  monthProvider = defaultGatewayMonthProvider,
  catalogProvider = defaultGatewayCatalogProvider,
  participationStore = defaultGuestParticipationStore,
  shelfStore = defaultGuestShelfStore,
  timeZone,
  bootstrapYearMonth,
  getNow,
}: TodayHostProps) {
  const participationSnapshot = useReaderParticipation(participationStore)
  const shelfSnapshot = useGuestShelfStore(shelfStore)

  const effectiveTimeZone = useMemo(
    () => resolveReaderTimeZone(timeZone ?? detectReaderTimeZone()),
    [timeZone],
  )

  const [reloadNonce, setReloadNonce] = useState(0)
  const monthLoadKey = `${effectiveTimeZone}:${bootstrapYearMonth ?? ''}:${reloadNonce}`
  const [fetchedMonth, setFetchedMonth] = useState<FetchedTodayMonthData | null>(null)
  const requestIdRef = useRef(0)

  const retryCurrentMonth = useCallback(() => {
    setFetchedMonth(null)
    setReloadNonce(prev => prev + 1)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const requestId = ++requestIdRef.current
    let unpublishedMonthDate: TodayRolloverContext | undefined

    void loadAuthorizedTodayMonth({
      monthProvider,
      signal: controller.signal,
      timeZone: effectiveTimeZone,
      bootstrapYearMonth,
      getNow,
      onUnpublishedMonthDate: date => { unpublishedMonthDate = date },
    })
      .then(result => {
        if (controller.signal.aborted || requestId !== requestIdRef.current) return
        setFetchedMonth({ key: monthLoadKey, result, unpublishedMonthDate })
      })
      .catch((err: unknown) => {
        if (
          controller.signal.aborted ||
          requestId !== requestIdRef.current ||
          (err instanceof DOMException && err.name === 'AbortError') ||
          (err instanceof Error && err.name === 'AbortError')
        ) {
          return
        }
        setFetchedMonth({
          key: monthLoadKey,
          result: {
            status: 'requestError',
            message: err instanceof Error ? err.message : 'Unable to load current month',
            source: 'gateway',
          },
        })
      })

    return () => {
      controller.abort()
    }
  }, [monthProvider, effectiveTimeZone, bootstrapYearMonth, getNow, monthLoadKey])

  const authorizedLoad = fetchedMonth?.key === monthLoadKey ? fetchedMonth : null
  const currentMonth = authorizedLoad?.result ?? LOADING_TODAY_MONTH

  const focusMonth = resolveHubContinueFocusMonth(participationSnapshot, shelfSnapshot)
  const continueLoadKey = focusMonth ? `${focusMonth}:${effectiveTimeZone}:${reloadNonce}` : ''
  const [continueGatewayData, setContinueGatewayData] = useState<FetchedHubContinueGatewayData | null>(null)
  const continueRequestIdRef = useRef(0)

  useEffect(() => {
    if (!focusMonth) {
      return
    }

    const controller = new AbortController()
    const { signal } = controller
    const requestId = ++continueRequestIdRef.current

    const loadFocus = async () => {
      const [releasedCatalog, monthDetail] = await Promise.all([
        catalogProvider.loadReleasedCatalog({ signal }),
        monthProvider.loadMonth(focusMonth, { signal, timeZone: effectiveTimeZone }),
      ])

      if (signal.aborted || requestId !== continueRequestIdRef.current) return

      setContinueGatewayData({
        key: continueLoadKey,
        focusMonth,
        timeZone: effectiveTimeZone,
        monthDetailsByYearMonth: new Map([[focusMonth, monthDetail]]),
        releasedCatalog,
      })
    }

    void loadFocus().catch(() => {
      if (!signal.aborted && requestId === continueRequestIdRef.current) {
        setContinueGatewayData(null)
      }
    })

    return () => {
      controller.abort()
    }
  }, [focusMonth, continueLoadKey, effectiveTimeZone, monthProvider, catalogProvider])

  const hubContinueResult = useMemo(() => {
    if (
      !focusMonth ||
      !continueGatewayData ||
      continueGatewayData.key !== continueLoadKey ||
      continueGatewayData.focusMonth !== focusMonth ||
      continueGatewayData.timeZone !== effectiveTimeZone
    ) {
      return null
    }
    const input = createHubContinueAppInput({
      participation: participationSnapshot,
      shelf: shelfSnapshot,
      monthDetailsByYearMonth: continueGatewayData.monthDetailsByYearMonth,
      releasedCatalog: continueGatewayData.releasedCatalog,
    })
    return input ? deriveHubContinueSuggestion(input) : null
  }, [focusMonth, continueLoadKey, continueGatewayData, effectiveTimeZone, participationSnapshot, shelfSnapshot])

  const participationData =
    participationSnapshot.status === 'ready' && participationSnapshot.health === 'ok'
      ? participationSnapshot.data
      : null

  const authorizedContext = deriveTodayPrimaryAction({ currentMonth }).context
    ?? authorizedLoad?.unpublishedMonthDate ?? null
  const priorMonthSuggestion = usePriorMonthContinue(
    authorizedContext,
    participationSnapshot,
    shelfSnapshot,
    participationStore,
    shelfStore,
    monthProvider,
  )
  const continuation = hubContinueResult?.status === 'suggestion' ? hubContinueResult : priorMonthSuggestion
    ? { status: 'suggestion', reason: 'inProgressAfterRollover', suggestion: priorMonthSuggestion } as const
    : null

  const model = useMemo(
    () =>
      deriveTodayPrimaryAction({
        currentMonth,
        participationData,
        hubContinue: continuation,
      }),
    [currentMonth, participationData, continuation],
  )

  const { context, primary, currentMonthLink, secondary } = model
  useTodayShelfRollover(
    context ?? authorizedLoad?.unpublishedMonthDate ?? null,
    participationSnapshot,
    shelfSnapshot,
    participationStore,
    shelfStore,
    monthProvider,
  )

  const monthHeading = context ? formatYearMonthHeading(context.yearMonth) : null
  const participationUnavailable =
    primary.status === 'loading' &&
    participationSnapshot.status === 'ready' &&
    participationSnapshot.health !== 'ok'

  // Reconcile the raw HubContinue suggestion with `model.secondary` so `HubContinueCard`
  // renders only when `deriveTodayPrimaryAction` authorizes the secondary continuation.
  const authorizedHubSuggestion =
    secondary && continuation?.status === 'suggestion' ? continuation.suggestion : null

  return (
    <div className="r06-landing r06-today" data-testid="r06-today-landing">
      <header className="r06-today__header">
        {context ? (
          <p className="eyebrow" data-testid="r06-today-authorized-date">
            {context.authorizedLocalDate}
          </p>
        ) : null}
        <h1>Today</h1>
      </header>

      <section
        className="r06-today__primary"
        aria-labelledby="r06-today-primary-heading"
        data-testid="today-primary-teaching"
        data-primary-status={participationUnavailable ? 'persistenceUnavailable' : primary.status}
      >
        {participationUnavailable && (
          <div className="r06-today__state" role="alert">
            <p className="eyebrow">Current Teaching</p>
            <h2 id="r06-today-primary-heading" className="r06-today__title">
              Your reading progress is unavailable
            </h2>
            <p className="r06-today__meta">
              We cannot safely read or save your progress on this device. Your existing reading data has not been changed. You can explore the current month below.
            </p>
          </div>
        )}

        {primary.status === 'loading' && !participationUnavailable && (
          <div className="r06-today__state" role="status" aria-live="polite">
            <h2 id="r06-today-primary-heading" className="r06-today__title">
              Loading today’s teaching…
            </h2>
            <p className="r06-today__meta">
              Verifying today’s authorized publication schedule.
            </p>
          </div>
        )}

        {primary.status === 'challenge' && (
          <>
            <div className="r06-today__eyebrow-row">
              <p className="eyebrow">
                Today’s Teaching{monthHeading ? ` · ${monthHeading}` : ''}
              </p>
              <span
                className={`r06-today__status-pill r06-today__status-pill--${primary.challenge.participation}`}
                data-testid="today-primary-status"
              >
                {primary.isCompleted && <CheckCircle2 size={14} aria-hidden="true" />}
                <span>{primaryChallengeStatusLabel(primary.action.entry, primary.isCompleted)}</span>
              </span>
            </div>
            <h2 id="r06-today-primary-heading" className="r06-today__title">
              {primary.challenge.title}
            </h2>
            <p className="r06-today__meta">
              {context ? `${context.monthTitle} · ` : ''}Day {primary.challenge.dayOfMonth}
            </p>
            <div className="r06-actions">
              <button
                type="button"
                className="button button--primary"
                data-testid="today-primary-cta"
                data-entry={primary.action.entry}
                onClick={() => onOpenChallenge(primary.action)}
              >
                <span>{primaryChallengeCtaLabel(primary.action.entry)}</span>
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
          </>
        )}

        {primary.status === 'exploreMonth' && (
          <>
            <p className="eyebrow">
              Current Teaching{monthHeading ? ` · ${monthHeading}` : ''}
            </p>
            <h2 id="r06-today-primary-heading" className="r06-today__title">
              Today’s teaching is not currently available
            </h2>
            <p className="r06-today__meta">{exploreReasonCopy(primary.reason)}</p>
            <div className="r06-actions">
              <button
                type="button"
                className="button button--primary"
                data-testid="today-primary-cta"
                onClick={() => onOpenMonth(primary.action)}
              >
                <span>Explore This Month</span>
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
          </>
        )}

        {primary.status === 'unavailable' && (
          <div className="r06-today__state" role="status" aria-live="polite">
            <p className="eyebrow">Current Teaching</p>
            <h2 id="r06-today-primary-heading" className="r06-today__title">
              Today’s teaching is unavailable
            </h2>
            <p className="r06-today__meta">
              No authorized monthly publication is currently available for today.
            </p>
          </div>
        )}

        {primary.status === 'error' && (
          <div className="r06-today__state" role="alert">
            <p className="eyebrow">Current Teaching</p>
            <h2 id="r06-today-primary-heading" className="r06-today__title">
              Unable to load today’s teaching
            </h2>
            <p className="r06-today__meta">
              {primary.reason === 'validationError'
                ? 'Today’s publication response could not be verified safely.'
                : 'A network error occurred while checking today’s teaching.'}
            </p>
            <div className="r06-actions">
              <button
                type="button"
                className="button button--secondary"
                data-testid="today-retry-cta"
                onClick={retryCurrentMonth}
              >
                <RotateCcw size={16} aria-hidden="true" />
                <span>Try Again</span>
              </button>
            </div>
          </div>
        )}
      </section>

      {secondary && authorizedHubSuggestion && (
        <div className="r06-today__continue" data-testid="today-continue-study">
          <HubContinueCard
            suggestion={authorizedHubSuggestion}
            onContinueChallenge={() => {
              if (secondary.kind === 'continueChallenge') {
                onOpenChallenge(secondary.action)
              }
            }}
            onOpenMonth={priorMonthSuggestion ? undefined : yearMonth => {
              onOpenMonth({ type: 'openMonth', yearMonth })
            }}
          />
        </div>
      )}

      {onOpenNews && (
        <div className="r06-actions">
          <button type="button" className="button button--secondary" onClick={onOpenNews}>Ministry News</button>
        </div>
      )}

      {currentMonthLink && context && (
        <section
          className="r06-today__current-month"
          aria-label="Current publication month"
        >
          <button
            type="button"
            className="r06-today__month-link"
            data-testid="today-current-month-link"
            data-year-month={currentMonthLink.yearMonth}
            onClick={() => onOpenMonth(currentMonthLink)}
          >
            <span className="r06-today__month-link-body">
              <span className="eyebrow">Current Month</span>
              <span className="r06-today__month-link-title">
                {monthHeading} — {context.monthTitle}
              </span>
            </span>
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </section>
      )}
    </div>
  )
}
