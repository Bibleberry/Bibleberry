import { BookmarkCheck, Plus, Shield } from 'lucide-react'
import type { LibraryMonthSummary } from '../../cms/reader/libraryMonthIndexProvider.ts'
import {
  formatPublicationMonthHeading,
  type LibraryMonthShelfStatus,
} from './historicalLibraryModel.ts'

export interface HistoricalLibraryCardProps {
  readonly item: LibraryMonthSummary
  readonly onOpenMonth: (yearMonth: string) => void
  readonly shelfStatus?: LibraryMonthShelfStatus
  readonly isSelectedContext?: boolean
  readonly onSelectForShelf?: (yearMonth: string) => void
}

export function HistoricalLibraryCard({
  item,
  onOpenMonth,
  shelfStatus,
  isSelectedContext = false,
  onSelectForShelf,
}: HistoricalLibraryCardProps) {
  const monthHeading = formatPublicationMonthHeading(item.yearMonth, item.year, item.month)
  const isOnShelf = Boolean(shelfStatus?.isOnShelf)
  const isProtected = Boolean(shelfStatus?.isProtected)

  return (
    <article
      className={`library-card${isSelectedContext ? ' library-card--selected' : ''}`}
      aria-labelledby={`library-card-title-${item.yearMonth}`}
      data-year-month={item.yearMonth}
      data-selected={isSelectedContext ? 'true' : undefined}
      data-on-shelf={isOnShelf ? 'true' : undefined}
      data-shelf-protected={isOnShelf ? String(isProtected) : undefined}
    >
      <div className="library-card__content">
        <h3 className="library-card__heading" aria-labelledby={`library-card-title-${item.yearMonth}`}>
          <button
            type="button"
            className="library-card__action-btn"
            onClick={() => onOpenMonth(item.yearMonth)}
            aria-label={`Open ${monthHeading}: ${item.title}`}
          >
            <span className="library-card__month-eyebrow">{monthHeading}</span>
            <span id={`library-card-title-${item.yearMonth}`} className="library-card__title">{item.title}</span>
          </button>
        </h3>
        <div className="library-card__actions">
          {isOnShelf && (
            <div className="library-card__badges">
              <span
                className={`library-shelf-badge ${
                  isProtected ? 'library-shelf-badge--protected' : 'library-shelf-badge--auto'
                }`}
              >
                {isProtected ? (
                  <Shield size={13} aria-hidden="true" />
                ) : (
                  <BookmarkCheck size={13} aria-hidden="true" />
                )}
                <span>{isProtected ? 'On Shelf · Protected' : 'On Shelf · Rollover'}</span>
              </span>
            </div>
          )}

          {onSelectForShelf && !isOnShelf && (
            <button
              type="button"
              className="library-card__shelf-btn"
              onClick={() => onSelectForShelf(item.yearMonth)}
              aria-label={`Add ${monthHeading} to Shelf`}
            >
              <Plus size={15} aria-hidden="true" />
              <span>Add to Shelf</span>
            </button>
          )}

          {onSelectForShelf && isOnShelf && !isProtected && (
            <button
              type="button"
              className="library-card__shelf-btn"
              onClick={() => onSelectForShelf(item.yearMonth)}
              aria-label={`Keep ${monthHeading} on Shelf (protect from rollover)`}
            >
              <Shield size={15} aria-hidden="true" />
              <span>Keep on Shelf</span>
            </button>
          )}

          {onSelectForShelf && isOnShelf && isProtected && (
            <button
              type="button"
              className="library-card__shelf-btn library-card__shelf-btn--on-shelf"
              disabled
              aria-label={`${monthHeading} is already protected on Shelf`}
            >
              <Shield size={15} aria-hidden="true" />
              <span>On Shelf</span>
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
