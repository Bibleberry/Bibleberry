import { Newspaper } from 'lucide-react'
import { NEWS_ROUTE_HASH } from './appRoutes.ts'
import './provisionalCollections.css'

export interface ProvisionalNewsEntryBarProps {
  readonly onOpenNews: () => void
}

/**
 * Temporary, feature-gated entry point from ordinary app views to the Ministry News reader (Issue #175 / R11-2).
 *
 * Explicitly provisional: does not alter global navigation or pre-empt final IA decisions.
 */
export function ProvisionalNewsEntryBar({
  onOpenNews,
}: ProvisionalNewsEntryBarProps) {
  return (
    <aside
      className="provisional-collections-bar"
      aria-label="Ministry News entry"
    >
      <div className="provisional-collections-bar__header">
        <p className="eyebrow">MINISTRY NEWS</p>
        <p className="provisional-collections-bar__description">
          Read ongoing teaching updates, ministry announcements, and monthly previews.
        </p>
      </div>
      <div className="provisional-collections-bar__actions">
        <a
          href={NEWS_ROUTE_HASH}
          className="button button--secondary button--small provisional-collections-btn"
          onClick={event => {
            event.preventDefault()
            onOpenNews()
          }}
        >
          <Newspaper size={16} aria-hidden="true" />
          <span>Ministry News</span>
        </a>
      </div>
    </aside>
  )
}
