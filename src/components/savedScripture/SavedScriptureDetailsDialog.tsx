import { useId, useRef } from 'react'
import { BookOpen, Trash2, X } from 'lucide-react'
import type { SavedScriptureCollectionItem } from './savedScriptureCollectionModel.ts'
import { useModalDialogFocus } from './useModalDialogFocus.ts'

export interface SavedScriptureDetailsDialogProps {
  readonly item: SavedScriptureCollectionItem | null
  readonly restoreFocusOnClose?: boolean
  readonly returnFocusEl?: HTMLElement | null
  readonly onClose: () => void
  readonly onRequestRemove: (item: SavedScriptureCollectionItem) => void
}

/**
 * Accessible citation-metadata details dialog for a single Saved Scripture entry.
 *
 * Displays only the preserved reference, explicit or neutral unspecified translation, save date,
 * and optional non-linked Challenge provenance. Never synthesizes Bible passage text or emits
 * guessed Challenge deep links.
 */
export function SavedScriptureDetailsDialog({
  item,
  restoreFocusOnClose = true,
  returnFocusEl = null,
  onClose,
  onRequestRemove,
}: SavedScriptureDetailsDialogProps) {
  const titleId = useId()
  const descId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useModalDialogFocus({
    isOpen: item !== null,
    dialogRef,
    initialFocusRef: closeButtonRef,
    onClose,
    restoreFocusOnUnmount: restoreFocusOnClose,
    returnFocusEl,
  })

  if (!item) return null

  return (
    <div
      className="saved-scripture-dialog__backdrop"
      onClick={event => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        ref={dialogRef}
        className="saved-scripture-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
      >
        <div className="saved-scripture-dialog__topbar">
          <p className="eyebrow saved-scripture-dialog__eyebrow">
            <BookOpen size={14} aria-hidden="true" />
            Saved Scripture citation
          </p>
          <button
            ref={closeButtonRef}
            type="button"
            className="button button--secondary button--small saved-scripture-dialog__close"
            onClick={onClose}
            aria-label={`Close details for ${item.reference}`}
          >
            <X size={16} aria-hidden="true" /> Close
          </button>
        </div>

        <h2 id={titleId} className="saved-scripture-dialog__title">
          {item.reference}
        </h2>

        <dl id={descId} className="saved-scripture-dialog__meta">
          <div className="saved-scripture-dialog__meta-row">
            <dt>Translation</dt>
            <dd>
              {item.hasExplicitTranslation ? (
                <span>{item.translation}</span>
              ) : (
                <span className="saved-scripture-dialog__unspecified">
                  Unspecified (reference only)
                </span>
              )}
            </dd>
          </div>
          <div className="saved-scripture-dialog__meta-row">
            <dt>Saved on</dt>
            <dd>
              <time dateTime={item.savedOn}>{item.savedDateLabel}</time>
            </dd>
          </div>
          <div className="saved-scripture-dialog__meta-row">
            <dt>Source context</dt>
            <dd>
              <span>{item.provenanceSummary}</span>
              {item.hasSourceChallenge && (
                <p className="saved-scripture-dialog__provenance-note">
                  Optional citation provenance only. This record does not link to or guarantee
                  availability of the source Challenge.
                </p>
              )}
            </dd>
          </div>
        </dl>

        <p className="saved-scripture-dialog__boundary">
          Saved Scripture records your citation and translation metadata only. Bible passage
          manuscript text, personal notes, and memorization plans are not stored or fetched here.
        </p>

        <div className="saved-scripture-dialog__actions">
          <button
            type="button"
            className="button button--text danger-link"
            onClick={() => onRequestRemove(item)}
          >
            <Trash2 size={16} aria-hidden="true" /> Remove from Saved Scripture
          </button>
          <button
            type="button"
            className="button button--primary"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
