import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

export interface UseModalDialogFocusOptions {
  readonly isOpen: boolean
  readonly dialogRef: RefObject<HTMLDivElement | null>
  readonly initialFocusRef: RefObject<HTMLElement | null>
  readonly onClose: () => void
  readonly disableEscape?: boolean
  readonly restoreFocusOnUnmount?: boolean
  readonly returnFocusEl?: HTMLElement | null
}

/**
 * Shared accessible modal keyboard trap, Escape handler, scroll lock, and optional
 * unmount focus-restoration hook for Saved Scripture dialogs.
 */
export function useModalDialogFocus({
  isOpen,
  dialogRef,
  initialFocusRef,
  onClose,
  disableEscape = false,
  restoreFocusOnUnmount = true,
  returnFocusEl = null,
}: UseModalDialogFocusOptions): void {
  const onCloseRef = useRef(onClose)
  const disableEscapeRef = useRef(disableEscape)
  const restoreFocusRef = useRef(restoreFocusOnUnmount)
  const explicitReturnElRef = useRef<HTMLElement | null>(returnFocusEl)

  useEffect(() => {
    onCloseRef.current = onClose
    disableEscapeRef.current = disableEscape
    restoreFocusRef.current = restoreFocusOnUnmount
    explicitReturnElRef.current = returnFocusEl
  }, [onClose, disableEscape, restoreFocusOnUnmount, returnFocusEl])

  useEffect(() => {
    if (!isOpen) return

    const previousActive =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    if (initialFocusRef.current) {
      initialFocusRef.current.focus({ preventScroll: true })
    } else {
      dialogRef.current?.focus({ preventScroll: true })
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        if (!disableEscapeRef.current) {
          onCloseRef.current()
        }
        return
      }

      if (event.key !== 'Tab' || !dialogRef.current) return

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter(el => el.offsetParent !== null || el === document.activeElement)

      if (focusable.length === 0) {
        event.preventDefault()
        dialogRef.current.focus({ preventScroll: true })
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (event.shiftKey) {
        if (
          active === first
          || active === dialogRef.current
          || !dialogRef.current.contains(active)
        ) {
          event.preventDefault()
          last.focus()
        }
      } else if (active === last || !dialogRef.current.contains(active)) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      if (!restoreFocusRef.current) return
      const target = explicitReturnElRef.current ?? previousActive
      if (target && target.isConnected) {
        target.focus({ preventScroll: true })
      }
    }
  }, [isOpen, dialogRef, initialFocusRef])
}
