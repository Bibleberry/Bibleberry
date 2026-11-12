import { useRef } from 'react'
import { AlertCircle, ArrowLeft, Loader2 } from 'lucide-react'
import type { NewsArticle } from '../../cms/reader/newsProvider.ts'
import {
  NEWS_FILTER_OPTIONS,
  type NewsFilterCategory,
} from './newsModel.ts'
import { NewsArticleCard } from './NewsArticleCard.tsx'

export interface NewsReaderViewProps {
  readonly articles: readonly NewsArticle[]
  readonly status: 'loading' | 'ready' | 'empty' | 'error' | 'offline'
  readonly activeCategory: NewsFilterCategory
  readonly errorMessage?: string
  readonly onSelectCategory: (category: NewsFilterCategory) => void
  readonly onRetry: () => void
  readonly onNavigate?: (destination: { kind: 'month'; monthId: string }) => void
  readonly onBack?: () => void
}

/**
 * Standalone accessible reader view for Bibleberry ministry News.
 *
 * Provides category filtering, accessible state announcements (loading, empty,
 * offline, error with retry), and fully responsive, keyboard-navigable article cards.
 */
export function NewsReaderView({
  articles,
  status,
  activeCategory,
  errorMessage,
  onSelectCategory,
  onRetry,
  onNavigate,
  onBack,
}: NewsReaderViewProps) {
  const tabListRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    const total = NEWS_FILTER_OPTIONS.length
    let nextIndex = currentIndex

    if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % total
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + total) % total
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = total - 1
    } else {
      return
    }

    event.preventDefault()
    const nextOption = NEWS_FILTER_OPTIONS[nextIndex]
    if (nextOption) {
      onSelectCategory(nextOption.id)
      const buttons = tabListRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      buttons?.[nextIndex]?.focus()
    }
  }

  return (
    <main className="news-reader" aria-labelledby="news-main-title">
      <header className="news-reader__header">
        {onBack && (
          <button
            type="button"
            className="news-reader__back-btn"
            onClick={onBack}
            aria-label="Return to previous screen"
          >
            <ArrowLeft size={18} aria-hidden="true" />
            <span>Back</span>
          </button>
        )}
        <div className="news-reader__titles">
          <h1 id="news-main-title" className="news-reader__heading">
            Ministry News
          </h1>
          <p className="news-reader__subheading">
            Ongoing teaching updates, announcements, and publishing previews
          </p>
        </div>

        <div
          ref={tabListRef}
          className="news-reader__filters"
          role="tablist"
          aria-label="Filter news articles by category"
        >
          {NEWS_FILTER_OPTIONS.map((option, index) => {
            const isSelected = activeCategory === option.id
            return (
              <button
                key={option.id}
                type="button"
                role="tab"
                id={`news-tab-${option.id}`}
                aria-selected={isSelected}
                aria-controls={`news-panel-${option.id}`}
                tabIndex={isSelected ? 0 : -1}
                className={`news-reader__tab ${isSelected ? 'news-reader__tab--active' : ''}`}
                onClick={() => onSelectCategory(option.id)}
                onKeyDown={e => handleKeyDown(e, index)}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </header>

      <div
        id={`news-panel-${activeCategory}`}
        role="tabpanel"
        aria-labelledby={`news-tab-${activeCategory}`}
        className="news-reader__content"
      >
        {status === 'loading' && (
          <div
            role="status"
            aria-live="polite"
            className="news-state news-state--loading"
          >
            <Loader2 className="news-spinner animate-spin" size={32} aria-hidden="true" />
            <p className="news-state__label">Loading ministry news...</p>
          </div>
        )}

        {status === 'empty' && (
          <div
            role="status"
            aria-live="polite"
            className="news-state news-state--empty"
          >
            <p className="news-state__title">No articles available</p>
            <p className="news-state__message">
              There are currently no ministry announcements published in this category.
            </p>
          </div>
        )}

        {(status === 'error' || status === 'offline') && (
          <div
            role="alert"
            aria-live="assertive"
            className="news-state news-state--error"
          >
            <AlertCircle className="news-state__icon" size={32} aria-hidden="true" />
            <h2 className="news-state__title">
              {status === 'offline' ? 'Network Connection Unavailable' : 'Unable to Load Ministry News'}
            </h2>
            <p className="news-state__message">
              {errorMessage || 'A problem occurred while retrieving updates. Please check your connection and retry.'}
            </p>
            <button
              type="button"
              className="news-state__retry-btn"
              onClick={onRetry}
            >
              Retry
            </button>
          </div>
        )}

        {status === 'ready' && (
          <div
            className="news-feed"
            role="feed"
            aria-label="Ministry news feed"
            aria-busy={false}
          >
            {articles.map(article => (
              <NewsArticleCard
                key={article.id}
                article={article}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
