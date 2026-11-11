import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { BookOpen, X } from 'lucide-react'
import type {
  EarnedScriptureCardSnapshot,
  LocalCalendarDate,
  MonthlyAwardKind,
} from '../../participation/types.ts'
import {
  formatEarnedCardDate,
  formatEarnedCardMonthHeading,
  getEarnedCardKindLabel,
  resolveValidatedCardSnapshot,
} from './earnedCardViewerModel.ts'
import './earnedCardViewer.css'

export interface EarnedScriptureCardViewerProps {
  readonly card: EarnedScriptureCardSnapshot
  readonly earnedOn?: LocalCalendarDate
  readonly kind?: MonthlyAwardKind
  readonly discoveryTitle?: string
  readonly returnFocusRef?: { readonly current: HTMLElement | null }
  readonly onClose: () => void
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
 * Standalone, accessible full-card viewer for a validated stored earned Scripture Card (R14-5).
 *
 * Accepts only a pre-validated `EarnedScriptureCardSnapshot` and performs zero network
 * Card fetches, zero storage access, and zero award mutations.
 */
export function EarnedScriptureCardViewer({
  card,
  earnedOn,
  kind,
  discoveryTitle,
  returnFocusRef,
  onClose,
}: EarnedScriptureCardViewerProps) {
  const validatedCard = useMemo(() => resolveValidatedCardSnapshot(card), [card])
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null)

  const titleId = useId()
  const descId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!validatedCard) return

    const previousActive =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const restoreTarget = returnFocusRef?.current ?? previousActive
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    closeButtonRef.current?.focus({ preventScroll: true })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onCloseRef.current()
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
        if (active === first || active === dialogRef.current || !dialogRef.current.contains(active)) {
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
      if (restoreTarget && restoreTarget.isConnected) {
        restoreTarget.focus({ preventScroll: true })
      }
    }
  }, [validatedCard, returnFocusRef])

  if (!validatedCard) {
    return null
  }

  const imageLoadFailed = failedImageUrl === validatedCard.imageUrl
  const monthHeading = formatEarnedCardMonthHeading(validatedCard.publicationYearMonth)
  const kindLabel = getEarnedCardKindLabel(kind)
  const formattedEarnedDate = formatEarnedCardDate(earnedOn)

  return (
    <div
      className="earned-card-viewer__backdrop"
      onClick={event => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        ref={dialogRef}
        className="earned-card-viewer__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
      >
        <div className="earned-card-viewer__topbar">
          <p className="eyebrow earned-card-viewer__eyebrow">
            {monthHeading} · {kindLabel}
          </p>
          <button
            ref={closeButtonRef}
            type="button"
            className="button button--secondary button--small earned-card-viewer__close"
            onClick={onClose}
            aria-label="Close Scripture card"
          >
            <X size={16} aria-hidden="true" /> Close
          </button>
        </div>

        <header className="earned-card-viewer__header">
          <h2 id={titleId} className="earned-card-viewer__title">
            {validatedCard.title}
          </h2>
          {(discoveryTitle || formattedEarnedDate) && (
            <p className="earned-card-viewer__context">
              {discoveryTitle && <span>Discovery: {discoveryTitle}</span>}
              {discoveryTitle && formattedEarnedDate && <span aria-hidden="true"> · </span>}
              {formattedEarnedDate && <span>Earned {formattedEarnedDate}</span>}
            </p>
          )}
        </header>

        <figure className="earned-card-viewer__figure">
          {!imageLoadFailed ? (
            <img
              className="earned-card-viewer__image"
              src={validatedCard.imageUrl}
              alt={validatedCard.illustrationAlt}
              onError={() => setFailedImageUrl(validatedCard.imageUrl)}
            />
          ) : (
            <div className="earned-card-viewer__image-fallback" role="status">
              <p>
                Card illustration could not be loaded right now. The full transcription and
                Scripture reference remain available below.
              </p>
              <p className="earned-card-viewer__image-alt">
                Illustration description: {validatedCard.illustrationAlt}
              </p>
            </div>
          )}
        </figure>

        <section id={descId} className="earned-card-viewer__body" aria-label="Scripture and transcription">
          <p className="earned-card-viewer__reference">
            <BookOpen size={16} aria-hidden="true" />
            <strong>{validatedCard.scripture.reference}</strong>
            <span>
              ({validatedCard.scripture.translation} · {validatedCard.scripture.book})
            </span>
          </p>

          <div className="earned-card-viewer__transcription-group">
            <h3 className="earned-card-viewer__section-label">Accessible Transcription</h3>
            <p className="earned-card-viewer__transcription">
              {validatedCard.accessibleTranscription}
            </p>
          </div>

          {validatedCard.theologicalThemes && validatedCard.theologicalThemes.length > 0 && (
            <div className="earned-card-viewer__themes-group">
              <h3 className="earned-card-viewer__section-label">Themes</h3>
              <ul className="earned-card-viewer__themes">
                {validatedCard.theologicalThemes.map(theme => (
                  <li key={theme}>{theme}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <footer className="earned-card-viewer__footer">
          <p className="earned-card-viewer__rights">
            <span>Attribution: {validatedCard.attribution}</span>
            <span>Rights: {validatedCard.rightsStatus}</span>
          </p>
          <p className="earned-card-viewer__provisional">
            Provisional card viewer — final notebook typography and illustration framing remain
            pending design review.
          </p>
        </footer>
      </div>
    </div>
  )
}
