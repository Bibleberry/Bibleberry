import { BookOpen, Bookmark } from 'lucide-react'
import './provisionalCollections.css'

export interface ProvisionalCollectionsEntryBarProps {
  readonly fieldNotebookEnabled: boolean
  readonly savedScriptureEnabled: boolean
  readonly hasNewDiscoveries?: boolean
  readonly onOpenNotebook: () => void
  readonly onOpenSavedScripture: () => void
}

/**
 * Temporary, feature-gated entry bar connecting standalone collections to the app shell.
 *
 * Explicitly provisional: does not represent an approved final information architecture.
 */
export function ProvisionalCollectionsEntryBar({
  fieldNotebookEnabled,
  savedScriptureEnabled,
  hasNewDiscoveries = false,
  onOpenNotebook,
  onOpenSavedScripture,
}: ProvisionalCollectionsEntryBarProps) {
  if (!fieldNotebookEnabled && !savedScriptureEnabled) {
    return null
  }

  return (
    <aside
      className="provisional-collections-bar"
      aria-label="Provisional collections integration"
    >
      <div className="provisional-collections-bar__header">
        <p className="eyebrow">APPROVED COLLECTIONS · PROVISIONAL APP-SHELL INTEGRATION</p>
        <p className="provisional-collections-bar__description">
          Field Notebook and Saved Scripture are accessible here under feature gating pending
          final global navigation decisions.
        </p>
      </div>
      <div className="provisional-collections-bar__actions">
        {fieldNotebookEnabled && (
          <a
            href="#/notebook"
            className="button button--secondary button--small provisional-collections-btn"
            onClick={event => {
              event.preventDefault()
              onOpenNotebook()
            }}
          >
            <BookOpen size={16} aria-hidden="true" />
            <span>Field Notebook</span>
            {hasNewDiscoveries && (
              <span className="provisional-new-pill" aria-label="New Discoveries">
                New
              </span>
            )}
          </a>
        )}
        {savedScriptureEnabled && (
          <a
            href="#/saved-scripture"
            className="button button--secondary button--small provisional-collections-btn"
            onClick={event => {
              event.preventDefault()
              onOpenSavedScripture()
            }}
          >
            <Bookmark size={16} aria-hidden="true" />
            <span>Saved Scripture</span>
          </a>
        )}
      </div>
    </aside>
  )
}
