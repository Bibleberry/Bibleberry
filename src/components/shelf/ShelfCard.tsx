import { useCallback } from 'react'
import { BookmarkCheck, ChevronRight, Compass, Shield, X } from 'lucide-react'
import type { PublicationYearMonth } from '../../participation/types.ts'
import type { ShelfEntryViewModel } from './shelfModel.ts'

export interface ShelfCardProps {
  readonly entry: ShelfEntryViewModel
  readonly onOpenMonth: (yearMonth: PublicationYearMonth) => void
  readonly onSetProtection: (yearMonth: PublicationYearMonth, isProtected: boolean) => void
  readonly onPutAway: (yearMonth: PublicationYearMonth) => void
  readonly onSetFocus: (yearMonth: PublicationYearMonth) => void
  readonly onClearFocus: () => void
}

/**
 * Presentation card for an individual historical month on the Shelf.
 *
 * Product boundaries:
 * - Renders plain, respectful status for reader-selected/protected vs auto-admitted months.
 * - Never fabricates teaching titles, cover art, awards, or streak counters.
 * - Minimum 44px touch targets and visible keyboard focus outlines.
 */
export function ShelfCard({
  entry,
  onOpenMonth,
  onSetProtection,
  onPutAway,
  onSetFocus,
  onClearFocus,
}: ShelfCardProps) {
  const handleOpen = useCallback(() => {
    onOpenMonth(entry.yearMonth)
  }, [entry.yearMonth, onOpenMonth])

  const handleKeepOnShelf = useCallback(() => {
    onSetProtection(entry.yearMonth, true)
  }, [entry.yearMonth, onSetProtection])

  const handlePutAway = useCallback(() => {
    onPutAway(entry.yearMonth)
  }, [entry.yearMonth, onPutAway])

  const handleToggleFocus = useCallback(() => {
    if (entry.isActiveFocus) {
      onClearFocus()
    } else {
      onSetFocus(entry.yearMonth)
    }
  }, [entry.isActiveFocus, entry.yearMonth, onClearFocus, onSetFocus])

  const openAriaLabel = entry.title
    ? `Open ${entry.monthHeading}: ${entry.title}`
    : `Open ${entry.monthHeading}`

  const keepAriaLabel = `Keep ${entry.monthHeading} on Shelf`

  const focusAriaLabel = entry.isActiveFocus
    ? `Clear Active Focus from ${entry.monthHeading}`
    : `Set ${entry.monthHeading} as Active Focus`

  return (
    <article
      className={`shelf-card${entry.isActiveFocus ? ' shelf-card--focused' : ''}`}
      aria-labelledby={`shelf-card-title-${entry.yearMonth}`}
      data-year-month={entry.yearMonth}
      data-admission-kind={entry.admissionKind}
      data-protected={String(entry.isProtected)}
    >
      <div className="shelf-card__top">
        <div className="shelf-card__badges">
          <span
            className={`shelf-badge ${
              entry.isProtected ? 'shelf-badge--protected' : 'shelf-badge--auto'
            }`}
          >
            {entry.isProtected ? (
              <Shield size={13} aria-hidden="true" />
            ) : (
              <BookmarkCheck size={13} aria-hidden="true" />
            )}
            <span>{entry.statusLabel}</span>
          </span>

          {entry.isActiveFocus && (
            <span className="shelf-badge shelf-badge--focus">
              <Compass size={13} aria-hidden="true" />
              <span>Active Focus</span>
            </span>
          )}
        </div>

        <header className="shelf-card__header">
          <span className="shelf-card__month-eyebrow">{entry.yearMonth}</span>
          <h2 id={`shelf-card-title-${entry.yearMonth}`} className="shelf-card__heading">
            {entry.monthHeading}
          </h2>
          {entry.title && <p className="shelf-card__title">{entry.title}</p>}
        </header>

        {entry.subtitle && <p className="shelf-card__subtitle">{entry.subtitle}</p>}

        <p className="shelf-card__explanation">{entry.protectionExplanation}</p>
        {entry.completionProgress && (
          <div className="shelf-card__progress">
            <span>
              {entry.completionProgress.completedChallengeCount} of{' '}
              {entry.completionProgress.totalChallengeCount} Challenges
            </span>
            {entry.completionProgress.totalChallengeCount > 0 && (
              <progress
                aria-label={`Completion progress for ${entry.monthHeading}`}
                value={entry.completionProgress.completedChallengeCount}
                max={entry.completionProgress.totalChallengeCount}
              />
            )}
          </div>
        )}
        {!entry.completionProgress && entry.progressStatus === 'loading' && (
          <p className="shelf-card__progress-status" role="status">Loading completion progress…</p>
        )}
        {!entry.completionProgress && entry.progressStatus === 'unavailable' && (
          <p className="shelf-card__progress-status">Completion progress unavailable</p>
        )}
      </div>

      <div className="shelf-card__actions">
        <button
          type="button"
          className="shelf-btn shelf-btn--primary"
          onClick={handleOpen}
          aria-label={openAriaLabel}
        >
          <span>Open Month</span>
          <ChevronRight size={16} aria-hidden="true" />
        </button>

        <div className="shelf-card__secondary-actions">
          {!entry.isProtected && (
            <button
              type="button"
              className="shelf-btn shelf-btn--secondary"
              onClick={handleKeepOnShelf}
              aria-label={keepAriaLabel}
            >
              <Shield size={15} aria-hidden="true" />
              <span>Keep on Shelf</span>
            </button>
          )}

          <button
            type="button"
            className="shelf-btn shelf-btn--secondary"
            onClick={handleToggleFocus}
            aria-label={focusAriaLabel}
            aria-pressed={entry.isActiveFocus}
          >
            <Compass size={15} aria-hidden="true" />
            <span>{entry.isActiveFocus ? 'Clear Active Focus' : 'Set as Active Focus'}</span>
          </button>

          <button
            type="button"
            className="shelf-btn shelf-btn--quiet"
            onClick={handlePutAway}
            aria-label={`Put away ${entry.monthHeading} from Shelf`}
          >
            <X size={15} aria-hidden="true" />
            <span>Put Away</span>
          </button>
        </div>
      </div>
    </article>
  )
}
