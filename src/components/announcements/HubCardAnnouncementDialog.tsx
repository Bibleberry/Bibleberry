import { useEffect, useId, useRef, useState } from 'react'
import { Award, BookOpen, RotateCcw, X } from 'lucide-react'
import {
  buildCombinedAnnouncementCopy,
  type AnnouncementAckStatus,
  type PresentedEarnedAwardItem,
} from './hubCardAnnouncementModel.ts'
import './hubCardAnnouncement.css'

export interface HubCardAnnouncementDialogProps {
  readonly isOpen: boolean
  readonly items: readonly PresentedEarnedAwardItem[]
  readonly ackStatus?: AnnouncementAckStatus
  readonly ackErrorMessage?: string | null
  readonly onDismiss: () => void
  readonly onRetryAcknowledge?: () => void
  readonly onCloseAfterFailure?: () => void
  /**
   * Optional real Field Notebook navigation callback. Omit when Field Notebook is not
   * yet implemented so no dead or misleading control is rendered.
   */
  readonly onOpenFieldNotebook?: () => void
  readonly fieldNotebookLabel?: string
  readonly returnFocusRef?: { readonly current: HTMLElement | null }
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/**
 * Provisional, accessible Hub-only combined earned Scripture Card announcement dialog (R14-6).
 *
 * Presents all pending earned Cards in one combined announcement, keeps artwork and wording
 * modest, degrades safely when Card snapshots are absent or fail to load, and never mutates
 * `cardViewed` or fetches unearned Card art.
 */
export function HubCardAnnouncementDialog({
  isOpen,
  items,
  ackStatus = 'idle',
  ackErrorMessage = null,
  onDismiss,
  onRetryAcknowledge,
  onCloseAfterFailure,
  onOpenFieldNotebook,
  fieldNotebookLabel = 'Open Field Notebook',
  returnFocusRef,
}: HubCardAnnouncementDialogProps) {
  const [failedImageUrls, setFailedImageUrls] = useState<Readonly<Record<string, true>>>({})
  const titleId = useId()
  const descId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const dismissButtonRef = useRef<HTMLButtonElement>(null)

  const ackStatusRef = useRef(ackStatus)
  const onDismissRef = useRef(onDismiss)
  const onCloseAfterFailureRef = useRef(onCloseAfterFailure)

  useEffect(() => {
    ackStatusRef.current = ackStatus
    onDismissRef.current = onDismiss
    onCloseAfterFailureRef.current = onCloseAfterFailure
  }, [ackStatus, onDismiss, onCloseAfterFailure])

  const active = isOpen && items.length > 0

  useEffect(() => {
    if (!active) return

    const previousActive =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const restoreTarget = returnFocusRef?.current ?? previousActive
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    dismissButtonRef.current?.focus({ preventScroll: true })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        if (ackStatusRef.current === 'saving') return
        if (ackStatusRef.current === 'failed' && onCloseAfterFailureRef.current) {
          onCloseAfterFailureRef.current()
        } else {
          onDismissRef.current()
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
      const currentActive = document.activeElement

      if (event.shiftKey) {
        if (
          currentActive === first
          || currentActive === dialogRef.current
          || !dialogRef.current.contains(currentActive)
        ) {
          event.preventDefault()
          last.focus()
        }
      } else if (currentActive === last || !dialogRef.current.contains(currentActive)) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      if (restoreTarget && restoreTarget.isConnected) {
        restoreTarget.focus({ preventScroll: true })
      }
    }
  }, [active, returnFocusRef])

  if (!active) {
    return null
  }

  const copy = buildCombinedAnnouncementCopy(items)
  const isSaving = ackStatus === 'saving'
  const isFailed = ackStatus === 'failed'
  const handleCloseAction = isFailed && onCloseAfterFailure ? onCloseAfterFailure : onDismiss

  return (
    <div
      className="hub-card-announcement__backdrop"
      onClick={event => {
        if (event.target === event.currentTarget && !isSaving) {
          handleCloseAction()
        }
      }}
    >
      <div
        ref={dialogRef}
        className="hub-card-announcement__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
      >
        <div className="hub-card-announcement__topbar">
          <p className="eyebrow hub-card-announcement__eyebrow">
            <Award size={14} aria-hidden="true" />
            {items.length === 1 ? 'Earned Scripture Card' : 'Earned Scripture Cards'}
          </p>
          <button
            type="button"
            className="button button--secondary button--small hub-card-announcement__close"
            onClick={handleCloseAction}
            disabled={isSaving}
            aria-label="Close earned Scripture Card announcement"
          >
            <X size={16} aria-hidden="true" /> Close
          </button>
        </div>

        <header className="hub-card-announcement__header">
          <h2 id={titleId} className="hub-card-announcement__title">
            {copy.heading}
          </h2>
          <p id={descId} className="hub-card-announcement__summary">
            {copy.summary}
          </p>
        </header>

        <ul className="hub-card-announcement__list">
          {items.map(item => {
            const hasImage =
              item.hasCompleteCardSnapshot
              && Boolean(item.imageUrl)
              && !failedImageUrls[item.imageUrl!]
            return (
              <li key={item.awardId} className="hub-card-announcement__item">
                {hasImage && item.imageUrl && (
                  <div className="hub-card-announcement__thumb">
                    <img
                      src={item.imageUrl}
                      alt={item.illustrationAlt ?? item.title}
                      onError={() => {
                        const failedUrl = item.imageUrl!
                        setFailedImageUrls(prev =>
                          prev[failedUrl] ? prev : { ...prev, [failedUrl]: true },
                        )
                      }}
                    />
                  </div>
                )}
                <div className="hub-card-announcement__item-body">
                  <p className="hub-card-announcement__item-meta">
                    <span>{item.kindLabel}</span>
                    <span aria-hidden="true"> · </span>
                    <span>{item.monthHeading}</span>
                  </p>
                  <h3 className="hub-card-announcement__item-title">{item.title}</h3>
                  {item.scriptureReference && (
                    <p className="hub-card-announcement__item-scripture">
                      <BookOpen size={14} aria-hidden="true" />
                      <span>
                        {item.scriptureReference}
                        {item.scriptureTranslation ? ` (${item.scriptureTranslation})` : ''}
                      </span>
                    </p>
                  )}
                  {!item.hasCompleteCardSnapshot && (
                    <p className="hub-card-announcement__item-fallback">
                      Card record saved; illustration is not cached on this device yet.
                    </p>
                  )}
                  {item.earnedDateLabel && (
                    <p className="hub-card-announcement__item-date">
                      Earned {item.earnedDateLabel}
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>

        {isFailed && ackErrorMessage && (
          <div className="hub-card-announcement__error" role="alert">
            <p>{ackErrorMessage}</p>
          </div>
        )}

        <div className="hub-card-announcement__actions">
          {isFailed && onRetryAcknowledge ? (
            <>
              <button
                ref={dismissButtonRef}
                type="button"
                className="button button--primary"
                onClick={onRetryAcknowledge}
                disabled={isSaving}
              >
                <RotateCcw size={16} aria-hidden="true" /> Retry saving
              </button>
              {onCloseAfterFailure && (
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={onCloseAfterFailure}
                >
                  Close for now
                </button>
              )}
            </>
          ) : (
            <button
              ref={dismissButtonRef}
              type="button"
              className="button button--primary"
              onClick={onDismiss}
              disabled={isSaving}
            >
              {isSaving ? 'Saving…' : copy.dismissLabel}
            </button>
          )}

          {onOpenFieldNotebook && !isFailed && (
            <button
              type="button"
              className="button button--secondary"
              onClick={onOpenFieldNotebook}
              disabled={isSaving}
            >
              {fieldNotebookLabel}
            </button>
          )}
        </div>

        <footer className="hub-card-announcement__footer">
          <p className="hub-card-announcement__provisional">
            Provisional card announcement — final Hub presentation and Field Notebook artwork
            remain pending design review.
          </p>
        </footer>
      </div>
    </div>
  )
}
