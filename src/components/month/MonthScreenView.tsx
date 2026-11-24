import { useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Calendar,
  Check,
  ChevronRight,
  Clock3,
  Lock,
  Play,
  RotateCcw,
} from 'lucide-react'
import type { MonthDetailData, MonthPreviewData } from '../../cms/reader/monthProvider.ts'
import { EarnedScriptureCardViewer } from '../cards/EarnedScriptureCardViewer.tsx'
import {
  formatShortMonthName,
  formatYearMonthHeading,
  getAdjacentYearMonths,
  isValidYearMonth,
  type MonthCalendarWeek,
  type MonthCompletionSummary,
  type MonthDiscoveryPresentation,
  type MonthSlotPresentation,
} from './monthScreenModel.ts'

export type MonthScreenViewProps = {
  mode: 'preview' | 'detail'
  month: MonthPreviewData | MonthDetailData
  weeks: readonly MonthCalendarWeek[]
  currentDate?: string
  showProvisionalNotice?: boolean
  completionSummary: MonthCompletionSummary | null
  discoveries: readonly MonthDiscoveryPresentation[]
  progressLoading?: boolean
  progressError?: string | null
  onRetryProgress?: () => void
  onOpenChallenge: (slug: string, expectedDocumentId: string) => void
  onOpenIntro: () => void
  onSelectYearMonth: (yearMonth: string) => void
  onExit?: () => void
  exitLabel?: string
  activeEarnedCardDiscovery?: MonthDiscoveryPresentation | null
  onOpenEarnedCard?: (discovery: MonthDiscoveryPresentation) => void
  onCloseEarnedCard?: () => void
}

function SlotStatusIcon({ status }: { status: MonthSlotPresentation['status'] }) {
  switch (status) {
    case 'completed':
      return <Check size={14} aria-hidden="true" />
    case 'continue':
      return <Play size={14} aria-hidden="true" />
    case 'inProgress':
      return <Clock3 size={14} aria-hidden="true" />
    case 'available':
      return <BookOpen size={14} aria-hidden="true" />
    case 'comingSoon':
    case 'unavailable':
      return <Lock size={13} aria-hidden="true" />
  }
}

/**
 * Functional R06 Month Screen weekly agenda presentation.
 *
 * Renders all 28–31 civil-day slots as uninterrupted Monday–Sunday weekly agenda
 * sections from `monthScreenModel.ts` (`week.slots`), enforces non-interactive
 * Coming Soon / Unavailable states without leaking future slugs or IDs, and places
 * Monthly Discoveries below the agenda with the full-month goal last.
 */
export function MonthScreenView({
  mode,
  month,
  weeks,
  currentDate,
  showProvisionalNotice = true,
  completionSummary,
  discoveries,
  progressLoading = false,
  progressError = null,
  onRetryProgress,
  onOpenChallenge,
  onOpenIntro,
  onSelectYearMonth,
  onExit,
  exitLabel = 'Return to Today',
  activeEarnedCardDiscovery = null,
  onOpenEarnedCard,
  onCloseEarnedCard,
}: MonthScreenViewProps) {
  const lastCardTriggerRef = useRef<HTMLButtonElement | null>(null)
  const [jumpDraft, setJumpDraft] = useState<{ monthId: string; value: string }>({
    monthId: month.monthId,
    value: month.monthId,
  })
  const jumpValue = jumpDraft.monthId === month.monthId ? jumpDraft.value : month.monthId
  const adjacent = getAdjacentYearMonths(month.monthId)
  const monthHeading = formatYearMonthHeading(month.monthId)
  const shortMonth = formatShortMonthName(month.monthId)
  const phaseLabel =
    mode === 'preview'
      ? 'Advance Preview'
      : month.phase === 'historical'
        ? 'Historical Month'
        : 'Current Month'

  const handleJumpSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const clean = jumpValue.trim()
    if (isValidYearMonth(clean)) {
      onSelectYearMonth(clean)
    }
  }

  return (
    <div className="standard-page month-screen">
      <div className="month-screen__topbar">
        {onExit && (
          <button type="button" className="back-link" onClick={onExit}>
            <ArrowLeft size={17} aria-hidden="true" /> {exitLabel}
          </button>
        )}

        <nav className="month-switcher" aria-label="Switch publication month">
          <button
            type="button"
            className="button button--secondary button--small"
            onClick={() => onSelectYearMonth(adjacent.previous)}
          >
            <ArrowLeft size={15} aria-hidden="true" /> {adjacent.previous}
          </button>
          <form className="month-switcher__jump" onSubmit={handleJumpSubmit}>
            <label htmlFor="month-jump-input" className="sr-only">
              Select month (YYYY-MM)
            </label>
            <input
              id="month-jump-input"
              type="month"
              value={jumpValue}
              onChange={event => setJumpDraft({ monthId: month.monthId, value: event.target.value })}
              aria-label="Jump to month"
            />
            <button type="submit" className="button button--secondary button--small">
              Go
            </button>
          </form>
          <button
            type="button"
            className="button button--secondary button--small"
            onClick={() => onSelectYearMonth(adjacent.next)}
          >
            {adjacent.next} <ArrowRight size={15} aria-hidden="true" />
          </button>
        </nav>
      </div>

      <header className="month-header">
        <div className="month-header__copy">
          <p className="eyebrow">
            {monthHeading} · {phaseLabel}
          </p>
          <h1 id={`month-screen-heading-${month.monthId}`} tabIndex={-1}>
            {month.title}
          </h1>
          {month.subtitle && <p className="month-header__subtitle">{month.subtitle}</p>}
          <div className="month-header__actions">
            <button type="button" className="button button--secondary" onClick={onOpenIntro}>
              <BookOpen size={16} aria-hidden="true" />{' '}
              {mode === 'preview' ? 'Read Monthly Preview' : 'Read Monthly Introduction'}
            </button>
            {completionSummary && (
              <div className="month-ticker" aria-label="Monthly completion progress">
                <strong>{completionSummary.label}</strong>
                <span>completed</span>
              </div>
            )}
          </div>
          {showProvisionalNotice && (
            <p className="month-provisional-note">
              <Calendar size={14} aria-hidden="true" /> Provisional calendar layout — pending final design review.
            </p>
          )}
        </div>
        {month.coverImage && (
          <figure className="month-header__cover">
            <img src={month.coverImage.url} alt={month.coverImage.alt} />
          </figure>
        )}
      </header>

      <section data-month-agenda={mode} className="month-calendar" aria-labelledby="month-calendar-heading">
        <div className="month-calendar__header">
          <h2 id="month-calendar-heading">Daily Challenges</h2>
          <span>
            {month.daysInMonth} days · {weeks.length} {weeks.length === 1 ? 'week' : 'weeks'}
          </span>
        </div>

        {weeks.length === 0 ? (
          <p className="month-calendar__empty">No daily Challenges are scheduled for this month.</p>
        ) : (
          <div className="month-weeks">
            {weeks.map(week => {
              const currentWeek = week.slots.some(slot => slot.date === currentDate)
              const weekHeadingId = `month-week-${month.monthId}-${week.weekNumber}`
              return (
                <section
                  key={week.weekNumber}
                  className="month-week"
                  data-current-week={currentWeek || undefined}
                  aria-labelledby={weekHeadingId}
                >
                  <h3 id={weekHeadingId} className="month-week__title" tabIndex={currentWeek ? -1 : undefined}>
                    Week {week.weekNumber} · {week.label}
                  </h3>

                  <ol className="month-week__agenda">
                    {week.slots.map(slot => {
                      const displayTitle =
                        slot.status === 'unavailable'
                          ? 'Challenge unavailable'
                          : (slot.title ?? 'Daily Challenge')
                      const fullDateLabel = `${slot.weekdayLabel}, ${shortMonth} ${slot.dayOfMonth}, ${month.year}`

                      const rowContent = (
                        <div className="month-day__content">
                          <div className="month-day__meta">
                            <time className="month-day__date" dateTime={slot.date}>
                              <span className="month-day__weekday">{slot.weekdayLabel},</span>{' '}
                              <strong className="month-day__calendar-day">
                                {shortMonth} {slot.dayOfMonth}, {month.year}
                              </strong>
                            </time>
                            <span className={`month-day__badge month-day__badge--${slot.status}`}>
                              <SlotStatusIcon status={slot.status} />
                              {slot.statusLabel}
                            </span>
                          </div>
                          <div className="month-day__body">
                            <span className="month-day__title">{displayTitle}</span>
                            {slot.previouslyCompleted && (
                              <small className="month-day__note">Previously completed</small>
                            )}
                          </div>
                        </div>
                      )

                      if (slot.interactive && slot.slug && slot.challengeId?.startsWith('cms:')) {
                        const slug = slot.slug
                        const documentId = slot.challengeId.slice('cms:'.length)
                        return (
                          <li key={slot.date} className="month-week__item">
                            <button
                              type="button"
                              className={`month-day month-day--${slot.status}`}
                              aria-label={`${fullDateLabel}: ${displayTitle}, ${slot.statusLabel}`}
                              onClick={() => onOpenChallenge(slug, documentId)}
                            >
                              {rowContent}
                              <ChevronRight
                                className="month-day__chevron"
                                size={16}
                                aria-hidden="true"
                              />
                            </button>
                          </li>
                        )
                      }

                      return (
                        <li key={slot.date} className="month-week__item">
                          <div
                            className={`month-day month-day--${slot.status} month-day--locked`}
                            role="group"
                            aria-label={`${monthHeading}, ${slot.weekdayLabel} ${slot.dayOfMonth}: ${displayTitle}, ${slot.statusLabel}.${slot.previouslyCompleted ? ' Previously completed.' : ''} Not available to open.`}
                            aria-disabled="true"
                          >
                            {rowContent}
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                </section>
              )
            })}
          </div>
        )}
      </section>

      {mode === 'detail' && (
        <section className="month-discoveries" aria-labelledby="month-discoveries-heading">
          <div className="month-discoveries__header">
            <div>
              <p className="eyebrow">MONTHLY DISCOVERIES</p>
              <h2 id="month-discoveries-heading">Thematic &amp; Full-Month Goals</h2>
            </div>
            {progressLoading && (
              <span className="month-discoveries__syncing" role="status" aria-live="polite">
                Updating progress…
              </span>
            )}
          </div>

          <p className="month-discoveries__intro">
            Goals update silently as you finish Challenges. Unearned card artwork and qualifying
            Challenge locations stay hidden.
          </p>

          {progressError && (
            <div className="month-discoveries__error" role="status">
              <span>{progressError}</span>
              {onRetryProgress && (
                <button type="button" className="button button--secondary button--small" onClick={onRetryProgress}>
                  <RotateCcw size={14} aria-hidden="true" /> Retry
                </button>
              )}
            </div>
          )}

          {discoveries.length === 0 ? (
            <p className="month-discoveries__empty">No monthly discoveries configured for this month.</p>
          ) : (
            <div className="month-discoveries__list">
              {discoveries.map(discovery => {
                const percent =
                  discovery.targetCount > 0
                    ? Math.min(100, Math.round((discovery.achievedCount / discovery.targetCount) * 100))
                    : 0
                return (
                  <article
                    key={discovery.discoveryId}
                    className={`month-discovery ${discovery.kind === 'fullMonth' ? 'month-discovery--full' : ''} ${discovery.isEarned ? 'is-earned' : ''}`}
                  >
                    <div className="month-discovery__top">
                      <div>
                        <span className="month-discovery__kind">
                          {discovery.kind === 'fullMonth' ? 'Full-Month Goal' : 'Thematic Discovery'}
                        </span>
                        <h3>{discovery.title}</h3>
                      </div>
                      <span className="month-discovery__count">
                        {discovery.achievedCount} of {discovery.targetCount}
                      </span>
                    </div>
                    <div
                      className="month-discovery__bar"
                      role="progressbar"
                      aria-label={`${discovery.title} progress`}
                      aria-valuemin={0}
                      aria-valuemax={discovery.targetCount}
                      aria-valuenow={discovery.achievedCount}
                      aria-valuetext={`${discovery.achievedCount} of ${discovery.targetCount}`}
                    >
                      <span style={{ width: `${percent}%` }} />
                    </div>
                    {discovery.isEarned && !(
                      discovery.hasStoredAward
                      && discovery.hasCardDisplay
                      && discovery.earnedCard
                      && discovery.awardId
                      && onOpenEarnedCard
                    ) && (
                      <p className="month-discovery__earned-note">
                        Scripture card earned · Card artwork is unavailable
                      </p>
                    )}
                    {discovery.isEarned
                      && discovery.hasStoredAward
                      && discovery.hasCardDisplay
                      && discovery.earnedCard
                      && discovery.awardId
                      && onOpenEarnedCard && (
                        <div className="month-discovery__earned-card">
                          <div className="month-discovery__earned-status">
                            <p className="month-discovery__earned-note">Scripture card earned</p>
                            {discovery.cardViewed === false && (
                              <span className="month-discovery__new-badge">New</span>
                            )}
                          </div>
                          <button
                            type="button"
                            className="month-discovery__card-button"
                            onClick={event => {
                              lastCardTriggerRef.current = event.currentTarget
                              onOpenEarnedCard(discovery)
                            }}
                            aria-label={`Open earned Scripture card: ${discovery.earnedCard.title}, ${discovery.earnedCard.scripture.reference}${discovery.cardViewed === false ? ', New' : ''}`}
                          >
                            <span className="month-discovery__thumb">
                              <img
                                src={discovery.earnedCard.imageUrl}
                                alt={discovery.earnedCard.illustrationAlt}
                              />
                            </span>
                            <span className="month-discovery__card-copy">
                              <strong className="month-discovery__card-title">
                                {discovery.earnedCard.title}
                              </strong>
                              <span className="month-discovery__card-ref">
                                {discovery.earnedCard.scripture.reference} ·{' '}
                                {discovery.earnedCard.scripture.translation}
                              </span>
                              <span className="month-discovery__card-cta">
                                View Scripture Card
                              </span>
                            </span>
                          </button>
                        </div>
                      )}
                  </article>
                )
              })}
            </div>
          )}
        </section>
      )}

      {mode === 'detail'
        && activeEarnedCardDiscovery?.isEarned
        && activeEarnedCardDiscovery.hasStoredAward
        && activeEarnedCardDiscovery.hasCardDisplay
        && activeEarnedCardDiscovery.earnedCard
        && onCloseEarnedCard && (
          <EarnedScriptureCardViewer
            card={activeEarnedCardDiscovery.earnedCard}
            earnedOn={activeEarnedCardDiscovery.earnedOn}
            kind={activeEarnedCardDiscovery.kind}
            discoveryTitle={activeEarnedCardDiscovery.title}
            returnFocusRef={lastCardTriggerRef}
            onClose={onCloseEarnedCard}
          />
        )}
    </div>
  )
}
