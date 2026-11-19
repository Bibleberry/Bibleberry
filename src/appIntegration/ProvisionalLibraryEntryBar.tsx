import { Bookmark, Library } from 'lucide-react'
import { LIBRARY_ROUTE_HASH, SHELF_ROUTE_HASH } from './appRoutes.ts'
import './provisionalCollections.css'

export interface ProvisionalLibraryEntryBarProps {
  readonly onOpenLibrary: () => void
  readonly onOpenShelf?: () => void
}

/**
 * Feature-gated entry point from Archive to the Historical Library and Shelf (Phase 05 / R08).
 *
 * Uses approved reader-experience terminology (Shelf and Library) without altering global tabs.
 */
export function ProvisionalLibraryEntryBar({
  onOpenLibrary,
  onOpenShelf,
}: ProvisionalLibraryEntryBarProps) {
  return (
    <aside
      className="provisional-collections-bar"
      aria-label="Historical Library entry"
    >
      <div className="provisional-collections-bar__header">
        <p className="eyebrow">SHELF &amp; LIBRARY</p>
        <p className="provisional-collections-bar__description">
          Keep up to three past months on your Shelf or browse the full Historical Library.
        </p>
      </div>
      <div className="provisional-collections-bar__actions">
        {onOpenShelf ? (
          <a
            href={SHELF_ROUTE_HASH}
            className="button button--secondary button--small provisional-collections-btn"
            onClick={event => {
              event.preventDefault()
              onOpenShelf()
            }}
          >
            <Bookmark size={16} aria-hidden="true" />
            <span>Open Shelf</span>
          </a>
        ) : null}
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
