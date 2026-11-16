import { Library } from 'lucide-react'
import { LIBRARY_ROUTE_HASH } from './appRoutes.ts'
import './provisionalCollections.css'

export interface ProvisionalLibraryEntryBarProps {
  readonly onOpenLibrary: () => void
}

/**
 * Temporary, feature-gated entry point from Archive to the Historical Library (Issue #158 / R08-3).
 *
 * Explicitly provisional: does not alter global navigation or pre-empt final IA decisions.
 */
export function ProvisionalLibraryEntryBar({
  onOpenLibrary,
}: ProvisionalLibraryEntryBarProps) {
  return (
    <aside
      className="provisional-collections-bar"
      aria-label="Historical Library entry"
    >
      <div className="provisional-collections-bar__header">
        <p className="eyebrow">HISTORICAL LIBRARY</p>
        <p className="provisional-collections-bar__description">
          Browse past monthly studies by publication month and open their Month Screens.
        </p>
      </div>
      <div className="provisional-collections-bar__actions">
        <a
          href={LIBRARY_ROUTE_HASH}
          className="button button--secondary button--small provisional-collections-btn"
          onClick={event => {
            event.preventDefault()
            onOpenLibrary()
          }}
        >
          <Library size={16} aria-hidden="true" />
          <span>Open Historical Library</span>
        </a>
      </div>
    </aside>
  )
}
