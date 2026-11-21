import { useId } from 'react'
import { ArrowRight } from 'lucide-react'
import type { HubContinueMonthSuggestion, HubContinueSuggestion } from '../../hubContinue/types.ts'
import type { PublicationYearMonth } from '../../participation/types.ts'
import './hubContinue.css'

export interface HubContinueCardProps {
  /**
   * Derived Continue suggestion, or `null` when no suggestion applies.
   * Renders nothing (`null`) when absent so the Hub stays calm and uncluttered.
   */
  readonly suggestion: HubContinueSuggestion | HubContinueMonthSuggestion | null
  /** Called when the reader activates the Continue Challenge action. */
  readonly onContinueChallenge: (suggestion: HubContinueSuggestion) => void
  /** Optional callback to open the suggested month's Month Screen. */
  readonly onOpenMonth?: (yearMonth: PublicationYearMonth) => void
  /** Optional class name for layout composition in a host container. */
  readonly className?: string
}

/**
 * Unobtrusive, accessible Hub Continue presentation card.
 *
 * - Renders at most one low-key historical study suggestion, or `null` when none exists.
 * - Never displays missed-day backlogs, streaks, attendance counters, or achievement prompts.
 */
export function HubContinueCard({
  suggestion,
  onContinueChallenge,
  onOpenMonth,
  className,
}: HubContinueCardProps) {
  const headingId = useId()

  if (!suggestion || (suggestion.kind !== 'resumeInProgress' && !onOpenMonth)) {
    return null
  }

  const resume = suggestion.kind === 'resumeInProgress'
  const primaryButtonLabel =
    suggestion.kind === 'reviewFocusMonth' ? 'Review This Month' : 'Continue Your Study'
  const primaryButtonContext = resume
    ? `${suggestion.challengeTitle} (${suggestion.monthHeading}, Day ${suggestion.dayOfMonth})`
    : suggestion.monthHeading
  const title = resume ? suggestion.challengeTitle : suggestion.monthTitle
  const detail = resume
    ? `${suggestion.monthHeading} · ${suggestion.monthTitle} · Day ${suggestion.dayOfMonth}`
    : suggestion.monthHeading
  const rootClassName = className ? `hub-continue ${className}` : 'hub-continue'

  return (
    <section
      className={rootClassName}
      aria-labelledby={headingId}
      data-continue-kind={suggestion.kind}
      data-year-month={suggestion.yearMonth}
      data-challenge-id={resume ? suggestion.challengeId : undefined}
      data-preserves-formal-focus={String(suggestion.preservesFormalFocus)}
    >
      <div className="hub-continue__body">
        <p className="hub-continue__eyebrow">Active Focus</p>
        <h2 id={headingId} className="hub-continue__title">
          {title}
        </h2>
        <p className="hub-continue__meta">
          {detail}
        </p>
      </div>

      <div className="hub-continue__actions">
        <button
          type="button"
          className="hub-continue__btn hub-continue__btn--primary"
          aria-label={`${primaryButtonLabel}: ${primaryButtonContext}`}
          onClick={() => {
            if (resume) {
              onContinueChallenge(suggestion)
            } else {
              onOpenMonth?.(suggestion.yearMonth)
            }
          }}
        >
          <span>{primaryButtonLabel}</span>
          <ArrowRight size={16} aria-hidden="true" />
        </button>

        {resume && onOpenMonth && (
          <button
            type="button"
            className="hub-continue__btn hub-continue__btn--secondary"
            aria-label={`View ${suggestion.monthHeading}`}
            onClick={() => onOpenMonth(suggestion.yearMonth)}
          >
            View Month
          </button>
        )}
      </div>
    </section>
  )
}
