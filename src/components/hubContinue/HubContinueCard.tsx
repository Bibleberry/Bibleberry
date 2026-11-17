import { useId } from 'react'
import { ArrowRight } from 'lucide-react'
import type { HubContinueSuggestion } from '../../hubContinue/types.ts'
import type { PublicationYearMonth } from '../../participation/types.ts'
import './hubContinue.css'

export interface HubContinueCardProps {
  /**
   * Derived Continue suggestion, or `null` when no suggestion applies.
   * Renders nothing (`null`) when absent so the Hub stays calm and uncluttered.
   */
  readonly suggestion: HubContinueSuggestion | null
  /** Called when the reader activates the Continue Challenge action. */
  readonly onContinueChallenge: (suggestion: HubContinueSuggestion) => void
  /** Optional callback to open the suggested month's Month Screen. */
  readonly onOpenMonth?: (yearMonth: PublicationYearMonth) => void
  /** Optional class name for layout composition in a host container. */
  readonly className?: string
}

function getEyebrowCopy(suggestion: HubContinueSuggestion): string {
  switch (suggestion.kind) {
    case 'resumeInProgress':
      return 'Continue Historical Study'
    case 'continueNextInFocus':
      return 'Next in Your Study Focus'
    case 'continueOtherHistoricalMonth':
      return 'Continue From Your Shelf'
  }
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

  if (!suggestion) {
    return null
  }

  const eyebrow = getEyebrowCopy(suggestion)
  const primaryButtonLabel = suggestion.isInProgress ? 'Resume' : 'Continue'
  const rootClassName = className ? `hub-continue ${className}` : 'hub-continue'

  return (
    <section
      className={rootClassName}
      aria-labelledby={headingId}
      data-continue-kind={suggestion.kind}
      data-year-month={suggestion.yearMonth}
      data-challenge-id={suggestion.challengeId}
      data-preserves-formal-focus={String(suggestion.preservesFormalFocus)}
    >
      <div className="hub-continue__body">
        <p className="hub-continue__eyebrow">{eyebrow}</p>
        <h2 id={headingId} className="hub-continue__title">
          {suggestion.challengeTitle}
        </h2>
        <p className="hub-continue__meta">
          {suggestion.monthHeading} · {suggestion.monthTitle} · Day {suggestion.dayOfMonth}
        </p>
      </div>

      <div className="hub-continue__actions">
        <button
          type="button"
          className="hub-continue__btn hub-continue__btn--primary"
          aria-label={`${primaryButtonLabel} ${suggestion.challengeTitle} (${suggestion.monthHeading}, Day ${suggestion.dayOfMonth})`}
          onClick={() => onContinueChallenge(suggestion)}
        >
          <span>{primaryButtonLabel}</span>
          <ArrowRight size={16} aria-hidden="true" />
        </button>

        {onOpenMonth && (
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
