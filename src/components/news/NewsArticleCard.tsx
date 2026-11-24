import { useId, useState } from 'react'
import { ArrowRight, ImageOff } from 'lucide-react'
import type { NewsArticle } from '../../cms/reader/newsProvider.ts'
import {
  formatMonthPreviewHeading,
  formatNewsCategory,
  formatNewsDate,
  isAuthorizedInternalDestination,
} from './newsModel.ts'
import { NewsPortableTextView } from './NewsPortableText.tsx'

export interface NewsArticleCardProps {
  readonly article: NewsArticle
  readonly detail?: boolean
  readonly onOpen?: () => void
  readonly onNavigate?: (destination: { kind: 'month'; monthId: string }) => void
}

/**
 * Accessible card view for a single ministry News article.
 *
 * Presents verified headline, date, summary, media, body, and safe internal
 * navigation targets without leaking editorial fields or displaying unearned badges.
 */
export function NewsArticleCard({ article, detail, onNavigate, onOpen }: NewsArticleCardProps) {
  const [imageError, setImageError] = useState(false)
  const titleId = useId()

  const hasSafeDestination = isAuthorizedInternalDestination(article.destination)
  const Heading = detail ? 'h1' : 'h2'
  const categoryLabel = formatNewsCategory(article.category)
  const formattedDate = formatNewsDate(article.publishedOn)

  const handleDestinationClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (hasSafeDestination) {
      event.preventDefault()
      onNavigate?.(article.destination)
    }
  }

  return (
    <article className="news-card" aria-labelledby={titleId}>
      <header className="news-card__header">
        <div className="news-card__meta">
          <span
            className={`news-card__category-badge news-card__category-badge--${article.category}`}
          >
            {categoryLabel}
          </span>
          <time dateTime={article.publishedOn} className="news-card__date">
            {formattedDate}
          </time>
        </div>
        <Heading id={titleId} className="news-card__title">
          {onOpen
            ? <button type="button" className="news-card__open" onClick={onOpen}>{article.title}</button>
            : article.title}
        </Heading>
      </header>

      {article.coverImage && !imageError && (
        <figure className="news-card__cover">
          <img
            src={article.coverImage.url}
            alt={article.coverImage.alt}
            loading="lazy"
            className="news-card__image"
            onError={() => setImageError(true)}
          />
        </figure>
      )}

      {article.coverImage && imageError && (
        <div className="news-card__image-fallback" role="note" aria-label="Cover image unavailable">
          <ImageOff size={20} aria-hidden="true" />
          <span>{article.coverImage.alt}</span>
        </div>
      )}

      <p className="news-card__summary">{article.summary}</p>

      {!onOpen && article.body && article.body.length > 0 && (
        <div className="news-card__body-container">
          <NewsPortableTextView value={article.body} onNavigate={onNavigate} />
        </div>
      )}

      {hasSafeDestination && (
        <footer className="news-card__footer">
          <a
            href={`#/month/${article.destination.monthId}`}
            className="news-card__destination-button"
            onClick={handleDestinationClick}
            aria-label={`Preview ${formatMonthPreviewHeading(article.destination.monthId)} publication`}
          >
            <span>Preview {formatMonthPreviewHeading(article.destination.monthId)}</span>
            <ArrowRight size={16} aria-hidden="true" />
          </a>
        </footer>
      )}
    </article>
  )
}
