import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { X } from 'lucide-react'
import { useModalDialogFocus } from '../savedScripture/useModalDialogFocus.ts'

interface ShelfConfirmationDialogProps {
  readonly title: string
  readonly description: ReactNode
  readonly children: ReactNode
  readonly confirmLabel: string
  readonly canConfirm: boolean
  readonly onConfirm: () => void
  readonly onCancel: () => void
  readonly fallbackFocusRef: RefObject<HTMLElement | null>
}

export function ShelfConfirmationDialog({
  title,
  description,
  children,
  confirmLabel,
  canConfirm,
  onConfirm,
  onCancel,
  fallbackFocusRef,
}: ShelfConfirmationDialogProps) {
  const id = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const submitted = useRef(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const trigger = document.activeElement
    const fallback = fallbackFocusRef.current
    dialog.showModal()
    return () => {
      dialog.close()
      if (trigger instanceof HTMLElement && trigger !== document.body && trigger.isConnected) {
        trigger.focus({ preventScroll: true })
      }
      if (document.activeElement === document.body && fallback?.isConnected) {
        fallback.focus({ preventScroll: true })
      }
    }
  }, [fallbackFocusRef])

  useModalDialogFocus({
    isOpen: true,
    dialogRef: bodyRef,
    initialFocusRef: closeRef,
    onClose: onCancel,
    restoreFocusOnUnmount: false,
  })

  return (
    <dialog
      ref={dialogRef}
      className="shelf-dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      onCancel={event => {
        event.preventDefault()
        onCancel()
      }}
      onClick={event => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div ref={bodyRef} className="shelf-dialog__body">
        <div className="shelf-dialog__header">
          <h2 id={`${id}-title`} className="shelf-dialog__title">{title}</h2>
          <button
            ref={closeRef}
            type="button"
            className="shelf-dialog__close"
            onClick={onCancel}
            aria-label="Close dialog"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <p id={`${id}-description`} className="shelf-dialog__desc">{description}</p>
        {children}
        <div className="shelf-dialog__actions">
          <button type="button" className="shelf-btn shelf-btn--secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="shelf-btn shelf-btn--primary"
            disabled={!canConfirm}
            onClick={() => {
              if (!canConfirm || submitted.current) return
              submitted.current = true
              onConfirm()
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  )
}
