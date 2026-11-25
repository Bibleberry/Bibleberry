import { useId, useState } from 'react'
import type { NotebookEarnedCardItem } from './fieldNotebookModel.ts'
import './fieldNotebook.css'

export function EarnedCardThumbnail({
  item,
  showDates = false,
  onOpen,
}: {
  readonly item: NotebookEarnedCardItem
  readonly showDates?: boolean
  readonly onOpen: (item: NotebookEarnedCardItem, trigger: HTMLButtonElement) => void
}) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null)
  const fallbackId = useId()
  const card = item.earnedCard
  const dates = (
    <p className="notebook-card__dates">
      <span>Published {item.publicationMonthHeading}</span>
      <span>Earned <time dateTime={item.earnedOn}>{item.earnedDateLabel}</time></span>
    </p>
  )

  if (!card) {
    return (
      <li className="notebook-card notebook-card--unavailable">
        <h3 className="notebook-card__title">{item.title}</h3>
        {!item.cardViewed && <span className="notebook-card__new-badge">New</span>}
        {dates}
        <p className="notebook-card__unavailable-note">
          Card snapshot unavailable — your earned award record is preserved.
        </p>
      </li>
    )
  }

  const imageFailed = failedImageUrl === card.imageUrl
  const isNew = !item.cardViewed
  const label = `Open Scripture Card: ${card.title}, ${card.scripture.reference}${isNew ? ', New' : ''}`
  return (
    <li className="notebook-card">
      <button
        type="button"
        className="notebook-card__button"
        onClick={event => onOpen(item, event.currentTarget)}
        aria-label={label}
        aria-describedby={imageFailed ? fallbackId : undefined}
      >
        <span className="notebook-card__media">
          {imageFailed ? (
            <span className="notebook-card__media-fallback" id={fallbackId}>Illustration unavailable right now.</span>
          ) : (
            <img
              src={card.imageUrl}
              alt={card.illustrationAlt}
              loading="lazy"
              decoding="async"
              onError={() => setFailedImageUrl(card.imageUrl)}
            />
          )}
        </span>
        <span className="notebook-card__body">
          <span className="notebook-card__title">{card.title}</span>
          <span className="notebook-card__scripture">{card.scripture.reference}</span>
          {isNew && <span className="notebook-card__new-badge">New</span>}
        </span>
      </button>
      {showDates && dates}
    </li>
  )
}
