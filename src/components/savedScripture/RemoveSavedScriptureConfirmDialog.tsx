import { useId, useRef } from 'react'
import { Trash2, X } from 'lucide-react'
import type { SavedScriptureCollectionItem } from './savedScriptureCollectionModel.ts'
import { useModalDialogFocus } from './useModalDialogFocus.ts'

export interface RemoveSavedScriptureConfirmDialogProps {
  readonly item: SavedScriptureCollectionItem | null
  readonly isRemoving?: boolean
  readonly restoreFocusOnClose?: boolean
  readonly returnFocusEl?: HTMLElement | null
  readonly onCancel: () => void
  readonly onConfirm: (item: SavedScriptureCollectionItem) => void
}

/**
 * Accessible confirmation alertdialog for removing a single Saved Scripture citation.
 * Defaults initial focus to Cancel so keyboard users never accidentally confirm removal.
 */
export function RemoveSavedScriptureConfirmDialog({
  item,
  isRemoving = false,
  restoreFocusOnClose = true,
  returnFocusEl = null,
  onCancel,
  onConfirm,
}: RemoveSavedScriptureConfirmDialogProps) {
  const titleId = useId()
  const descId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  useModalDialogFocus({
    isOpen: item !== null,
    dialogRef,
    initialFocusRef: cancelButtonRef,
    onClose: onCancel,
    disableEscape: isRemoving,
    restoreFocusOnUnmount: restoreFocusOnClose,
    returnFocusEl,
  })

  if (!item) return null

  return (
    <div
      className="saved-scripture-dialog__backdrop"
      onClick={event => {
        if (event.target === event.currentTarget && !isRemoving) {
          onCancel()
        }
      }}
    >
      <div
        ref={dialogRef}
        className="saved-scripture-dialog__panel saved-scripture-dialog__panel--confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
      >
        <div className="saved-scripture-dialog__topbar">
          <p className="eyebrow saved-scripture-dialog__eyebrow">Confirm removal</p>
          <button
            type="button"
            className="button button--secondary button--small saved-scripture-dialog__close"
            onClick={onCancel}
            disabled={isRemoving}
            aria-label={`Cancel removing ${item.reference}`}
          >
            <X size={16} aria-hidden="true" /> Cancel
          </button>
        </div>

        <h2 id={titleId} className="saved-scripture-dialog__title">
          Remove {item.reference}?
        </h2>

        <p id={descId} className="saved-scripture-dialog__confirm-copy">
          This removes <strong>{item.reference}</strong>
          {item.hasExplicitTranslation ? ` (${item.translation})` : ' (translation unspecified)'} from
          your Saved Scripture collection on this device. Your other saved Scripture citations,
          Saved Challenges, and Field Notebook cards will remain untouched.
        </p>

        <div className="saved-scripture-dialog__actions">
          <button
            ref={cancelButtonRef}
            type="button"
            className="button button--secondary"
            onClick={onCancel}
            disabled={isRemoving}
          >
            Keep reference
          </button>
          <button
            type="button"
            className="button button--danger"
            onClick={() => onConfirm(item)}
            disabled={isRemoving}
          >
            <Trash2 size={16} aria-hidden="true" />
            {isRemoving ? 'Removing…' : 'Remove reference'}
          </button>
        </div>
      </div>
    </div>
  )
}
