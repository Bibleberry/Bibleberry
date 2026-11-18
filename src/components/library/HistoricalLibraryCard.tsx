import { useState, useCallback } from 'react'
import { BookmarkCheck, Calendar, ChevronRight, Plus, Shield } from 'lucide-react'
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

/**
 * Accessible presentation card for an individual historical publication month.
 *
 * Requirements:
 * - Displays month/theme, safe optional cover/subtitle, accessible open-month action.
 * - Strictly historical study focus: no unearned cards, streaks, or gamification widgets.
 * - Minimum 44px touch targets and full keyboard focus visibility.
 */
export function HistoricalLibraryCard({
  item,
  onOpenMonth,
  shelfStatus,
  isSelectedContext = false,
  onSelectForShelf,
}: HistoricalLibraryCardProps) {
  const [imageFailed, setImageFailed] = useState(false)

  const monthHeading = formatPublicationMonthHeading(item.yearMonth, item.year, item.month)
  const accessibleActionLabel = `Open ${monthHeading}: ${item.title}`

  const handleImageError = useCallback(() => {
    setImageFailed(true)
  }, [])

  const handleOpen = useCallback(() => {
    onOpenMonth(item.yearMonth)
  }, [item.yearMonth, onOpenMonth])

  const handleSelectForShelf = useCallback(() => {
    onSelectForShelf?.(item.yearMonth)
  }, [item.yearMonth, onSelectForShelf])

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
      <div className="library-card__inner">
        {item.coverImage && !imageFailed ? (
          <div className="library-card__cover-wrapper">
            <img
              src={item.coverImage.url}
              alt={item.coverImage.alt}
              className="library-card__cover-image"
              loading="lazy"
              onError={handleImageError}
            />
          </div>
        ) : (
          <div className="library-card__placeholder-cover" aria-hidden="true">
            <Calendar size={28} className="library-card__placeholder-icon" />
          </div>
        )}

        <div className="library-card__content">
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

          <header className="library-card__header">
            <span className="library-card__month-eyebrow">{monthHeading}</span>
            <h2 id={`library-card-title-${item.yearMonth}`} className="library-card__title">
              {item.title}
            </h2>
          </header>

          {item.subtitle && (
            <p className="library-card__subtitle">{item.subtitle}</p>
          )}

          <div className="library-card__actions">
            <button
              type="button"
              className="library-card__action-btn"
              onClick={handleOpen}
              aria-label={accessibleActionLabel}
            >
              <span>Open Month</span>
              <ChevronRight size={16} aria-hidden="true" />
            </button>

            {onSelectForShelf && !isOnShelf && (
              <button
                type="button"
                className="library-card__shelf-btn"
                onClick={handleSelectForShelf}
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
                onClick={handleSelectForShelf}
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
      </div>
    </article>
  )
}
