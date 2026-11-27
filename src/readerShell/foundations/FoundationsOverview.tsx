import { useId } from 'react'
import {
  buildFoundationsOverviewModel,
  type FoundationsOverviewAvailability,
} from './foundationsOverviewModel.ts'
import './foundationsOverview.css'

export interface FoundationsOverviewProps {
  readonly onBack: () => void
  readonly backLabel?: string
  readonly availability?: FoundationsOverviewAvailability
}

/**
 * Bronze Galleon (Issue #319): bounded R06 Foundations overview.
 * Always opens as an optional, non-punitive overview from Library and presents
 * truthful empty or unavailable states until owner/editorial-approved resources exist.
 */
export function FoundationsOverview({
  onBack,
  backLabel = 'Back to Library',
  availability = 'empty',
}: FoundationsOverviewProps) {
  const statusHeadingId = useId()
  const model = buildFoundationsOverviewModel(availability)

  return (
    <div
      className="r06-landing r06-foundations"
      data-testid="foundations-overview"
      data-availability={model.availability}
    >
      <div className="r06-foundations__back">
        <button
          type="button"
          className="button button--secondary"
          data-testid="foundations-back"
          onClick={onBack}
        >
          {backLabel}
        </button>
      </div>

      <header className="r06-foundations__header">
        <p className="eyebrow">{model.eyebrow}</p>
        <h1>{model.title}</h1>
        <p className="r06-foundations__intro">{model.intro}</p>
      </header>

      <section
        className="r06-foundations__card"
        aria-labelledby={statusHeadingId}
        data-testid="foundations-status-card"
      >
        <div className="r06-foundations__badge-row">
          <span className="r06-foundations__status-pill" data-testid="foundations-status-pill">
            {model.statusBadge}
          </span>
        </div>
        <h2 id={statusHeadingId} className="r06-foundations__title">
          {model.statusHeading}
        </h2>
        <div role={model.statusRole} className="r06-foundations__status-body">
          {model.paragraphs.map(paragraph => (
            <p key={paragraph} className="r06-foundations__body">
              {paragraph}
            </p>
          ))}
        </div>
      </section>
    </div>
  )
}
