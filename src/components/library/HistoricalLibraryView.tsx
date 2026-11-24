import { useState } from 'react'
import { MAX_LIBRARY_QUERY_LENGTH } from '../../lib/libraryMonthSearch.ts'
import { ArrowLeft, BookOpen, AlertCircle, Bookmark, RefreshCw } from 'lucide-react'
import type { ShelfEntry } from '../../shelf/types.ts'
import { HistoricalLibraryCard } from './HistoricalLibraryCard.tsx'
import {
  getLibraryMonthShelfStatus,
  groupMonthsByYear,
  type HistoricalLibraryState,
} from './historicalLibraryModel.ts'

export interface HistoricalLibraryViewProps {
  readonly searchText: string
  readonly onSearchChange: (text: string) => void
  readonly state: HistoricalLibraryState
  readonly onOpenMonth: (yearMonth: string) => void
  readonly onLoadMore: () => void
  readonly onRetry: () => void
  readonly onExit?: () => void
  readonly exitLabel?: string
  readonly shelfEntries?: readonly ShelfEntry[]
  readonly selectedMonthYearMonth?: string | null
  readonly onSelectForShelf?: (yearMonth: string) => void
  readonly onViewShelf?: () => void
  readonly shelfMaxCapacity?: number
  readonly shelfAnnouncement?: string
}

/**
 * Presentation component for the reader-facing Historical Library catalogue.
 *
 * Requirements:
 * - Clean theological reading aesthetic; zero gamification/achievement streaks.
 * - Semantic landmarks (`<main>`, `<header>`, `<section>`, `<ul>`, `<li>`).
 * - Accessible live status announcer for screen readers (`role="status"`, `aria-live="polite"`).
 * - Full responsive reflow for phone screens and large text.
 * - Explicit 'Load more' pagination, with correct continuation support for sparse pages.
 */
export function HistoricalLibraryView({
  state,
  searchText,
  onSearchChange,
  onOpenMonth,
  onLoadMore,
  onRetry,
  onExit,
  exitLabel = 'Return',
  shelfEntries,
  selectedMonthYearMonth = null,
  onSelectForShelf,
  onViewShelf,
  shelfMaxCapacity = 3,
  shelfAnnouncement = '',
}: HistoricalLibraryViewProps) {
  const {
    status,
    items,
    hasMore,
    isSparseContinuation,
    errorMessage,
    errorKind,
  } = state

  const [expandedYears, setExpandedYears] = useState<Record<number, boolean>>({})
  const searching = Boolean(searchText.trim())
  const years = groupMonthsByYear(items)
  const hasItems = items.length > 0
  const isLoadingInitial = status === 'loading-initial' || status === 'idle'
  const isLoadingMore = status === 'loading-more'
  const isInitialError = !hasItems && (status === 'request-error' || status === 'validation-error')
  const isLoadMoreError = hasItems && (status === 'request-error' || status === 'validation-error')

  // Screen reader announcement message
  let liveAnnouncement = ''
  if (shelfAnnouncement) {
    liveAnnouncement = shelfAnnouncement
  } else if (isLoadingInitial) {
    liveAnnouncement = 'Loading historical Library catalogue…'
  } else if (isLoadingMore) {
    liveAnnouncement = 'Loading more historical months…'
  } else if (isInitialError || isLoadMoreError) {
    liveAnnouncement = `Error: ${errorMessage ?? 'Failed to load Library catalogue'}`
  } else if (status === 'empty') {
    liveAnnouncement = searching ? 'No matching months.' : 'Historical Library catalogue is empty.'
  } else if (hasItems) {
    liveAnnouncement = `${items.length} historical ${items.length === 1 ? 'month' : 'months'} available.`
  }

  const shelfCount = shelfEntries?.length ?? 0

  function renderRows(months: typeof items) {
    return (
      <ul className="library-list" aria-label="Historical Months">
        {months.map(item => (
          <li key={item.yearMonth} className="library-list__item">
            <HistoricalLibraryCard
              item={item}
              onOpenMonth={onOpenMonth}
              shelfStatus={
                shelfEntries
                  ? getLibraryMonthShelfStatus(item.yearMonth, shelfEntries)
                  : undefined
              }
              isSelectedContext={selectedMonthYearMonth === item.yearMonth}
              onSelectForShelf={onSelectForShelf}
            />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <main className="standard-page library-page" role="main" aria-label="Historical Library">
      {/* Hidden live region for screen reader notifications */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </div>

      {(onExit || onViewShelf) && (
        <div className="library-topbar">
          {onExit ? (
            <button type="button" className="back-link library-back-btn" onClick={onExit}>
              <ArrowLeft size={17} aria-hidden="true" />
              <span>{exitLabel}</span>
            </button>
          ) : (
            <span />
          )}

          {onViewShelf && (
            <button
              type="button"
              className="library-shelf-nav-btn"
              onClick={onViewShelf}
              aria-label={`View Shelf (${shelfCount} of ${shelfMaxCapacity} months)`}
            >
              <Bookmark size={16} aria-hidden="true" />
              <span>
                View Shelf ({shelfCount}/{shelfMaxCapacity})
              </span>
            </button>
          )}
        </div>
      )}

      <header className="library-header">
        <span className="library-header__eyebrow">Past Studies</span>
        <h1 className="library-header__title">Historical Library</h1>
        <p className="library-header__subtitle">
          Browse and study past monthly teachings at your own pace.
        </p>
      </header>

      <label className="library-search">
        Search months and themes
        <input type="search" maxLength={MAX_LIBRARY_QUERY_LENGTH}
          value={searchText} onChange={event => onSearchChange(event.target.value)} />
      </label>

      {/* Initial Loading View */}
      {isLoadingInitial && (
        <section
          className="library-state-panel library-loading-panel"
          aria-label="Loading Historical Library"
          role="status"
        >
          <div className="library-spinner" aria-hidden="true" />
          <p className="library-loading-text">Loading historical catalogue…</p>
        </section>
      )}

      {/* Initial Error View */}
      {isInitialError && (
        <section
          className={`library-state-panel library-error-panel library-error-panel--${errorKind}`}
          role="alert"
          aria-labelledby="library-error-title"
        >
          <AlertCircle size={36} className="library-error-icon" aria-hidden="true" />
          <h2 id="library-error-title" className="library-error-title">
            {errorKind === 'validation'
              ? 'Library Catalogue Unavailable'
              : 'Unable to Load Library'}
          </h2>
          <p className="library-error-message">
            {errorKind === 'validation'
              ? 'The Library catalogue could not be displayed due to an unexpected format issue.'
              : errorMessage ?? 'A network or service issue prevented loading historical months.'}
          </p>
          {errorKind !== 'validation' && (
            <button
              type="button"
              className="library-retry-btn"
              onClick={onRetry}
            >
              <RefreshCw size={16} aria-hidden="true" />
              <span>Try Again</span>
            </button>
          )}
        </section>
      )}

      {/* Truly Empty View */}
      {status === 'empty' && (
        <section
          className="library-state-panel library-empty-panel"
          role="region"
          aria-labelledby="library-empty-title"
        >
          <BookOpen size={44} className="library-empty-icon" aria-hidden="true" />
          <h2 id="library-empty-title" className="library-empty-title">
            {searching ? 'No matching months' : 'No Historical Months Yet'}
          </h2>
          <p className="library-empty-message">
            {searching ? 'Try another month or theme.' : 'As each monthly study concludes, it will be preserved here in the Library for ongoing study and reflection.'}
          </p>
        </section>
      )}

      {/* Sparse Continuation Notice (Initial window had items=[] but hasMore=true) */}
      {!hasItems && isSparseContinuation && !isLoadingInitial && !isInitialError && (
        <section
          className="library-state-panel library-sparse-panel"
          role="region"
          aria-labelledby="library-sparse-title"
        >
          <BookOpen size={36} className="library-sparse-icon" aria-hidden="true" />
          <h2 id="library-sparse-title" className="library-sparse-title">
            {searching ? 'No matches in this interval' : 'Past Studies Available'}
          </h2>
          <p className="library-sparse-message">
            Continue to check earlier months.
          </p>
          <button
            type="button"
            className="library-load-more-btn"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            aria-busy={isLoadingMore}
          >
            <span>{isLoadingMore ? 'Loading past months…' : 'Load Historical Months'}</span>
          </button>
        </section>
      )}

      {/* Catalogue List & Pagination Area */}
      {hasItems && (
        <section className="library-catalogue" aria-label="Historical Month Summaries">
          {isLoadMoreError && (
            <div
              className={`library-inline-error library-inline-error--${errorKind}`}
              role="alert"
            >
              <AlertCircle size={18} aria-hidden="true" />
              <div className="library-inline-error__content">
                <span>
                  {errorKind === 'validation'
                    ? 'Failed to load older months due to a formatting error.'
                    : `Unable to load older months: ${errorMessage ?? 'Network error'}.`}
                </span>
                {errorKind !== 'validation' && (
                  <button
                    type="button"
                    className="library-inline-retry-btn"
                    onClick={onRetry}
                  >
                    Retry
                  </button>
                )}
              </div>
            </div>
          )}

          {searching ? renderRows(items) : Array.from(years, ([year, months]) => {
            const expanded = expandedYears[year] ?? year === items[0]?.year
            return (
              <section key={year} className="library-year">
                <h2>
                  <button type="button" aria-expanded={expanded}
                    onClick={() => setExpandedYears(previous => ({ ...previous, [year]: !expanded }))}>
                    {year} <span aria-hidden="true">{expanded ? '−' : '+'}</span>
                  </button>
                </h2>
                {expanded && renderRows(months)}
              </section>
            )
          })}

          {/* Sparse continuation note for intermediate sparse pages */}
          {isSparseContinuation && (
            <p className="library-sparse-intermediate-note" role="note">
              No additional months found in this interval. Earlier historical months may still be available.
            </p>
          )}

          {/* Pagination controls */}
          <div className="library-pagination">
            {hasMore ? (
              <button
                type="button"
                className="library-load-more-btn"
                onClick={onLoadMore}
                disabled={isLoadingMore}
                aria-busy={isLoadingMore}
              >
                {isLoadingMore && <div className="library-mini-spinner" aria-hidden="true" />}
                <span>{isLoadingMore ? 'Loading more months…' : 'Load more past months'}</span>
              </button>
            ) : (
              <p className="library-exhausted-note" role="note">
                You have reached the beginning of the Library catalogue.
              </p>
            )}
          </div>
        </section>
      )}
    </main>
  )
}
