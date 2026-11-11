import { useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Calendar,
  Check,
  Clock3,
  Lock,
  Play,
  RotateCcw,
} from 'lucide-react'
import type { MonthDetailData, MonthPreviewData } from '../../cms/reader/monthProvider.ts'
import {
  formatYearMonthHeading,
  getAdjacentYearMonths,
  isValidYearMonth,
  WEEKDAY_SHORT_LABELS,
  type MonthCalendarWeek,
  type MonthCompletionSummary,
  type MonthDiscoveryPresentation,
  type MonthSlotPresentation,
} from './monthScreenModel.ts'

export type MonthScreenViewProps = {
  mode: 'preview' | 'detail'
  month: MonthPreviewData | MonthDetailData
  weeks: readonly MonthCalendarWeek[]
  completionSummary: MonthCompletionSummary | null
  discoveries: readonly MonthDiscoveryPresentation[]
  progressLoading?: boolean
  progressError?: string | null
  onRetryProgress?: () => void
  onOpenChallenge: (slug: string) => void
  onOpenIntro: () => void
  onSelectYearMonth: (yearMonth: string) => void
  onExit?: () => void
  exitLabel?: string
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
 * Provisional calendar Month Screen presentation (R08A-6 / Phase 03C).
 *
 * Groups all 28–31 civil-day slots into Monday–Sunday calendar weeks, enforces
 * non-interactive Coming Soon / Unavailable states without leaking future slugs or IDs,
 * and places Monthly Discoveries below the calendar with the full-month goal last.
 */
export function MonthScreenView({
  mode,
  month,
  weeks,
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
}: MonthScreenViewProps) {
  const [jumpDraft, setJumpDraft] = useState<{ monthId: string; value: string }>({
    monthId: month.monthId,
    value: month.monthId,
  })
  const jumpValue = jumpDraft.monthId === month.monthId ? jumpDraft.value : month.monthId
  const adjacent = getAdjacentYearMonths(month.monthId)
  const monthHeading = formatYearMonthHeading(month.monthId)
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
          <h1>{month.title}</h1>
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
          <p className="month-provisional-note">
            <Calendar size={14} aria-hidden="true" /> Provisional calendar layout — pending final design review.
          </p>
        </div>
        {month.coverImage && (
          <figure className="month-header__cover">
            <img src={month.coverImage.url} alt={month.coverImage.alt} />
          </figure>
        )}
      </header>

      <section className="month-calendar" aria-labelledby="month-calendar-heading">
        <div className="month-calendar__header">
          <h2 id="month-calendar-heading">Daily Challenges</h2>
          <span>{month.daysInMonth} days</span>
        </div>

        <div className="month-calendar__weekdays" aria-hidden="true">
          {WEEKDAY_SHORT_LABELS.map(label => (
            <span key={label}>{label}</span>
          ))}
        </div>

        <div className="month-weeks">
          {weeks.map(week => (
            <section
              key={week.weekNumber}
              className="month-week"
              aria-labelledby={`month-week-${month.monthId}-${week.weekNumber}`}
            >
              <h3 id={`month-week-${month.monthId}-${week.weekNumber}`} className="month-week__title">
                Week {week.weekNumber} · {week.label}
              </h3>

              <div className="month-week__grid">
                {week.cells.map(cell => {
                  if (!cell.slot) {
                    return (
                      <div
                        key={`pad-${week.weekNumber}-${cell.weekdayIndex}`}
                        className="month-day-pad"
                        aria-hidden="true"
                      />
                    )
                  }

                  const slot = cell.slot
                  const cardHeader = (
                    <div className="month-day__meta">
                      <span className="month-day__date">
                        <span>{slot.weekdayLabel}</span>
                        <strong>{slot.dayOfMonth}</strong>
                      </span>
                      <span className={`month-day__badge month-day__badge--${slot.status}`}>
                        <SlotStatusIcon status={slot.status} />
                        {slot.statusLabel}
                      </span>
                    </div>
                  )

                  if (slot.interactive && slot.slug) {
                    return (
                      <button
                        key={slot.date}
                        type="button"
                        className={`month-day month-day--${slot.status}`}
                        onClick={() => onOpenChallenge(slot.slug!)}
                      >
                        {cardHeader}
                        <span className="month-day__title">{slot.title}</span>
                      </button>
                    )
                  }

                  return (
                    <div
                      key={slot.date}
                      className={`month-day month-day--${slot.status} month-day--locked`}
                      aria-disabled="true"
                    >
                      {cardHeader}
                      <span className="month-day__title">
                        {slot.status === 'unavailable'
                          ? 'Challenge unavailable'
                          : slot.title}
                      </span>
                      {slot.previouslyCompleted && (
                        <small className="month-day__note">Previously completed</small>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
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
                    {discovery.isEarned && (
                      <p className="month-discovery__earned-note">
                        Scripture card earned
                        {!discovery.hasCardDisplay && ' · Card artwork is unavailable'}
                      </p>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
