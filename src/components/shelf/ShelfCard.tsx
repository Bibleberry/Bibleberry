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

  const focusAriaLabel = entry.isActiveFocus
    ? `Clear study focus from ${entry.monthHeading}`
    : `Set ${entry.monthHeading} as active study focus`

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
              <span>Active Study Focus</span>
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
          <button
            type="button"
            className="shelf-btn shelf-btn--secondary"
            onClick={handleKeepOnShelf}
            aria-label={`Keep ${entry.monthHeading} on Shelf`}
            aria-pressed={entry.isProtected}
            disabled={entry.isProtected}
          >
            <Shield size={15} aria-hidden="true" />
            <span>{entry.isProtected ? 'Kept on Shelf' : 'Keep on Shelf'}</span>
          </button>

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
