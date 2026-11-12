import { useState, useCallback } from 'react'
import { Calendar, ChevronRight } from 'lucide-react'
import type { LibraryMonthSummary } from '../../cms/reader/libraryMonthIndexProvider.ts'
import { formatPublicationMonthHeading } from './historicalLibraryModel.ts'

export interface HistoricalLibraryCardProps {
  readonly item: LibraryMonthSummary
  readonly onOpenMonth: (yearMonth: string) => void
}

/**
 * Accessible presentation card for an individual historical publication month.
 *
 * Requirements:
 * - Displays month/theme, safe optional cover/subtitle, accessible open-month action.
 * - Strictly historical study focus: no unearned cards, streaks, or gamification widgets.
 * - Minimum 44px touch targets and full keyboard focus visibility.
 */
export function HistoricalLibraryCard({ item, onOpenMonth }: HistoricalLibraryCardProps) {
  const [imageFailed, setImageFailed] = useState(false)

  const monthHeading = formatPublicationMonthHeading(item.yearMonth, item.year, item.month)
  const accessibleActionLabel = `Open ${monthHeading}: ${item.title}`

  const handleImageError = useCallback(() => {
    setImageFailed(true)
  }, [])

  const handleOpen = useCallback(() => {
    onOpenMonth(item.yearMonth)
  }, [item.yearMonth, onOpenMonth])

  return (
    <article
      className="library-card"
      aria-labelledby={`library-card-title-${item.yearMonth}`}
      data-year-month={item.yearMonth}
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
          </div>
        </div>
      </div>
    </article>
  )
}
