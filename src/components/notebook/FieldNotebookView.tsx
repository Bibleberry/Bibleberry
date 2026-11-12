import { useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Calendar,
  Layers,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import { EarnedScriptureCardViewer } from '../cards/EarnedScriptureCardViewer.tsx'
import {
  filterNotebookCards,
  formatPublicationMonthHeading,
  getAdjacentPublicationYearMonth,
  type NotebookBrowseMode,
  type NotebookCollectionProjection,
  type NotebookEarnedCardItem,
  type NotebookMonthEntry,
} from './fieldNotebookModel.ts'
import './fieldNotebook.css'

export interface FieldNotebookViewProps {
  readonly projection: NotebookCollectionProjection
  readonly browseMode: NotebookBrowseMode
  readonly selectedYear: number
  readonly monthEntries: readonly NotebookMonthEntry[]
  readonly selectedYearMonth: string | null
  readonly searchQuery: string
  readonly selectedTheme: string | null
  readonly activeCard: NotebookEarnedCardItem | null
  readonly onChangeBrowseMode: (mode: NotebookBrowseMode) => void
  readonly onSelectYear: (year: number) => void
  readonly onSelectMonth: (yearMonth: string | null) => void
  readonly onSearchQueryChange: (query: string) => void
  readonly onSelectTheme: (theme: string | null) => void
  readonly onOpenCard: (item: NotebookEarnedCardItem, triggerElement: HTMLButtonElement) => void
  readonly onCloseCard: () => void
  readonly onExit?: () => void
  readonly exitLabel?: string
}

interface NotebookCardTileProps {
  readonly item: NotebookEarnedCardItem
  readonly failedImageUrls: Readonly<Record<string, true>>
  readonly onImageError: (imageUrl: string) => void
  readonly onOpenCard: (item: NotebookEarnedCardItem, triggerElement: HTMLButtonElement) => void
}

function NotebookCardTile({
  item,
  failedImageUrls,
  onImageError,
  onOpenCard,
}: NotebookCardTileProps) {
  if (!item.hasCardSnapshot || !item.earnedCard) {
    return (
      <li className="notebook-card notebook-card--unavailable">
        <div className="notebook-card__kind">
          <span>{item.kindLabel}</span>
          {!item.cardViewed && <span className="notebook-card__new-badge">New</span>}
        </div>
        <h3 className="notebook-card__title">{item.title}</h3>
        <p className="notebook-card__dates">
          <span>Published {item.publicationMonthHeading}</span>
          <span>Earned {item.earnedDateLabel}</span>
        </p>
        <p className="notebook-card__unavailable-note">
          Card snapshot unavailable — your earned award record is preserved.
        </p>
      </li>
    )
  }

  const card = item.earnedCard
  const imageFailed = failedImageUrls[card.imageUrl] === true
  const ariaLabel = [
    `Open Scripture Card: ${card.title}`,
    card.scripture.reference,
    `Published ${item.publicationMonthHeading}`,
    `Earned ${item.earnedDateLabel}`,
    !item.cardViewed ? 'New' : null,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <li className="notebook-card">
      <button
        type="button"
        className="notebook-card__button"
        onClick={event => onOpenCard(item, event.currentTarget)}
        aria-label={ariaLabel}
      >
        <div className="notebook-card__media">
          {!imageFailed ? (
            <img
              src={card.imageUrl}
              alt={card.illustrationAlt}
              loading="lazy"
              decoding="async"
              onError={() => onImageError(card.imageUrl)}
            />
          ) : (
            <div className="notebook-card__media-fallback" role="status">
              <span>Illustration unavailable right now. {card.illustrationAlt}</span>
            </div>
          )}
          {!item.cardViewed && <span className="notebook-card__new-badge">New</span>}
        </div>

        <div className="notebook-card__body">
          <div className="notebook-card__kind">
            <span>{item.kindLabel}</span>
          </div>
          <h3 className="notebook-card__title">{card.title}</h3>
          <p className="notebook-card__scripture">
            <BookOpen size={14} aria-hidden="true" />
            <span>
              {card.scripture.reference} · {card.scripture.translation} ({card.scripture.book})
            </span>
          </p>
          <p className="notebook-card__dates">
            <span>Published {item.publicationMonthHeading}</span>
            <span>Earned {item.earnedDateLabel}</span>
          </p>
          {item.theologicalThemes.length > 0 && (
            <ul className="notebook-card__themes" aria-label="Curated themes">
              {item.theologicalThemes.map(theme => (
                <li key={theme}>{theme}</li>
              ))}
            </ul>
          )}
          <span className="notebook-card__cta">Open Scripture Card</span>
        </div>
      </button>
    </li>
  )
}

function NotebookGallerySection({
  heading,
  cards,
  emptyTitle,
  emptyBody,
  isFiltered,
  onClearFilter,
  failedImageUrls,
  onImageError,
  onOpenCard,
}: {
  readonly heading: string
  readonly cards: readonly NotebookEarnedCardItem[]
  readonly emptyTitle: string
  readonly emptyBody: string
  readonly isFiltered: boolean
  readonly onClearFilter: () => void
  readonly failedImageUrls: Readonly<Record<string, true>>
  readonly onImageError: (imageUrl: string) => void
  readonly onOpenCard: (item: NotebookEarnedCardItem, triggerElement: HTMLButtonElement) => void
}) {
  return (
    <section aria-label={heading}>
      <div className="notebook-cards-header">
        <h2>{heading}</h2>
        <span className="notebook-cards-count">
          {cards.length} {cards.length === 1 ? 'card' : 'cards'}
        </span>
      </div>

      {cards.length === 0 ? (
        <div className="notebook-empty" role="status">
          <h3>{isFiltered ? 'No Matching Earned Scripture Cards' : emptyTitle}</h3>
          <p>
            {isFiltered
              ? 'Try another card title, Bible book, Scripture reference, or curated theme.'
              : emptyBody}
          </p>
          {isFiltered && (
            <button type="button" className="button button--secondary" onClick={onClearFilter}>
              Clear search and filters
            </button>
          )}
        </div>
      ) : (
        <ul className="notebook-cards-grid">
          {cards.map(item => (
            <NotebookCardTile
              key={item.awardId}
              item={item}
              failedImageUrls={failedImageUrls}
              onImageError={onImageError}
              onOpenCard={onOpenCard}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * Accessible, responsive Field Notebook earned-only collection view (R14-7).
 *
 * Displays:
 * - Restrained single evolving lifetime participation count (distinct completed Challenges).
 * - Publication Year -> 12 Publication Months navigation with neutral Coming Soon states.
 * - Monthly earned-only Card gallery (preserving original publication month even when earned later).
 * - Distinct All Earned Cards gallery (newest earned first, deterministic canonical ID tie-breaker).
 * - Search/filter strictly across validated Card title, Bible book, reference, and curated themes.
 * - Reused `EarnedScriptureCardViewer` with focus restoration to originating card trigger.
 */
export function FieldNotebookView({
  projection,
  browseMode,
  selectedYear,
  monthEntries,
  selectedYearMonth,
  searchQuery,
  selectedTheme,
  activeCard,
  onChangeBrowseMode,
  onSelectYear,
  onSelectMonth,
  onSearchQueryChange,
  onSelectTheme,
  onOpenCard,
  onCloseCard,
  onExit,
  exitLabel = 'Return',
}: FieldNotebookViewProps) {
  const lastCardTriggerRef = useRef<HTMLButtonElement | null>(null)
  const [failedImageUrls, setFailedImageUrls] = useState<Readonly<Record<string, true>>>({})

  const handleImageError = (imageUrl: string) => {
    setFailedImageUrls(previous =>
      previous[imageUrl] ? previous : { ...previous, [imageUrl]: true },
    )
  }

  const handleTriggerCard = (item: NotebookEarnedCardItem, triggerElement: HTMLButtonElement) => {
    lastCardTriggerRef.current = triggerElement
    onOpenCard(item, triggerElement)
  }

  const hasActiveFilter = searchQuery.trim().length > 0 || selectedTheme !== null
  const clearFilters = () => {
    onSearchQueryChange('')
    onSelectTheme(null)
  }

  const yearOptions = Array.from(new Set([...projection.relevantYears, selectedYear])).sort(
    (a, b) => b - a,
  )

  const selectedMonthEntry =
    selectedYearMonth !== null
      ? monthEntries.find(entry => entry.yearMonth === selectedYearMonth) ?? null
      : null

  const adjacentMonths =
    selectedYearMonth !== null
      ? getAdjacentPublicationYearMonth(selectedYearMonth)
      : { previous: null, next: null }

  const canStepNextMonth =
    adjacentMonths.next !== null
    && (adjacentMonths.next <= projection.referenceYearMonth
      || projection.allEarnedCards.some(card => card.publicationYearMonth === adjacentMonths.next))

  const filteredAllCards = filterNotebookCards(projection.allEarnedCards, {
    query: searchQuery,
    theme: selectedTheme,
  })

  const filteredMonthCards = selectedMonthEntry
    ? filterNotebookCards(selectedMonthEntry.cards, {
        query: searchQuery,
        theme: selectedTheme,
      })
    : []

  return (
    <div className="standard-page notebook-page">
      {onExit && (
        <div className="notebook-topbar">
          <button type="button" className="back-link" onClick={onExit}>
            <ArrowLeft size={17} aria-hidden="true" /> {exitLabel}
          </button>
        </div>
      )}

      <header className="notebook-header">
        <p className="eyebrow">FIELD NOTEBOOK</p>
        <h1>Earned Scripture Cards</h1>
        <p className="notebook-header__subtitle">
          A lasting, earned-only archive of Scripture Cards from your completed studies across
          current teaching, Shelf, and Library.
        </p>
        <p className="notebook-provisional-note">
          <Sparkles size={14} aria-hidden="true" /> Provisional Field Notebook layout — final
          illustrated notebook artwork and status naming remain pending design review.
        </p>
      </header>

      <section className="notebook-lifetime" aria-labelledby="notebook-lifetime-heading">
        <p className="eyebrow notebook-lifetime__eyebrow">LIFETIME PARTICIPATION</p>
        <h2 id="notebook-lifetime-heading" className="notebook-lifetime__headline">
          {projection.lifetime.headline}
        </h2>
        <p className="notebook-lifetime__copy">{projection.lifetime.supportingCopy}</p>
        <div className="notebook-lifetime__stats">
          <span className="notebook-lifetime__stat-pill">
            {projection.lifetime.earnedCardCount}{' '}
            {projection.lifetime.earnedCardCount === 1
              ? 'Earned Scripture Card'
              : 'Earned Scripture Cards'}
          </span>
          {projection.lifetime.unviewedCardCount > 0 && (
            <span className="notebook-lifetime__stat-pill notebook-lifetime__stat-pill--new">
              {projection.lifetime.unviewedCardCount} Unopened
            </span>
          )}
        </div>
        <p className="notebook-lifetime__note">{projection.lifetime.provisionalNote}</p>
      </section>

      <section className="notebook-controls" aria-label="Browse and filter earned Scripture Cards">
        <div className="notebook-mode-tabs" role="group" aria-label="Field Notebook views">
          <button
            type="button"
            className="notebook-mode-tab"
            aria-pressed={browseMode === 'yearMonth'}
            onClick={() => onChangeBrowseMode('yearMonth')}
          >
            <Calendar size={16} aria-hidden="true" /> By Year &amp; Month
          </button>
          <button
            type="button"
            className="notebook-mode-tab"
            aria-pressed={browseMode === 'allCards'}
            onClick={() => onChangeBrowseMode('allCards')}
          >
            <Layers size={16} aria-hidden="true" /> All Earned Cards
          </button>
        </div>

        <div className="notebook-search">
          <label htmlFor="notebook-search-input" className="notebook-search__label">
            Search earned cards by title, Bible book, reference, or theme
          </label>
          <div className="notebook-search__row">
            <div className="notebook-search__input-wrap">
              <Search size={16} className="notebook-search__icon" aria-hidden="true" />
              <input
                id="notebook-search-input"
                type="search"
                className="notebook-search__input"
                value={searchQuery}
                onChange={event => onSearchQueryChange(event.target.value)}
                placeholder="Search title, book, reference, or theme…"
              />
            </div>
            {hasActiveFilter && (
              <button
                type="button"
                className="button button--secondary button--small"
                onClick={clearFilters}
              >
                <X size={14} aria-hidden="true" /> Clear
              </button>
            )}
          </div>
        </div>

        {projection.availableThemes.length > 0 && (
          <div className="notebook-themes" role="group" aria-label="Filter by curated theme">
            <span className="notebook-themes__label">Themes</span>
            <button
              type="button"
              className="notebook-theme-chip"
              aria-pressed={selectedTheme === null}
              onClick={() => onSelectTheme(null)}
            >
              All themes
            </button>
            {projection.availableThemes.map(theme => (
              <button
                key={theme}
                type="button"
                className="notebook-theme-chip"
                aria-pressed={selectedTheme === theme}
                onClick={() => onSelectTheme(selectedTheme === theme ? null : theme)}
              >
                {theme}
              </button>
            ))}
          </div>
        )}
      </section>

      {browseMode === 'allCards' ? (
        <NotebookGallerySection
          heading="All Earned Cards"
          cards={filteredAllCards}
          emptyTitle="No Earned Scripture Cards Yet"
          emptyBody="As you complete thematic discoveries and finalized months—from current teaching, Shelf, or Library—your earned Scripture Cards will gather here permanently."
          isFiltered={hasActiveFilter}
          onClearFilter={clearFilters}
          failedImageUrls={failedImageUrls}
          onImageError={handleImageError}
          onOpenCard={handleTriggerCard}
        />
      ) : hasActiveFilter && selectedYearMonth === null ? (
        <NotebookGallerySection
          heading="Matching Earned Cards"
          cards={filteredAllCards}
          emptyTitle="No Earned Scripture Cards Yet"
          emptyBody="Earned Scripture Cards appear here as you finish monthly discoveries."
          isFiltered={hasActiveFilter}
          onClearFilter={clearFilters}
          failedImageUrls={failedImageUrls}
          onImageError={handleImageError}
          onOpenCard={handleTriggerCard}
        />
      ) : selectedYearMonth !== null ? (
        <section aria-label={formatPublicationMonthHeading(selectedYearMonth)}>
          <div className="notebook-month-detail__bar">
            <button
              type="button"
              className="back-link"
              onClick={() => onSelectMonth(null)}
            >
              <ArrowLeft size={16} aria-hidden="true" /> All 12 months in {selectedYear}
            </button>

            <nav className="notebook-year-nav__controls" aria-label="Switch publication month">
              {adjacentMonths.previous && (
                <button
                  type="button"
                  className="button button--secondary button--small"
                  onClick={() => onSelectMonth(adjacentMonths.previous)}
                >
                  <ArrowLeft size={14} aria-hidden="true" />{' '}
                  {formatPublicationMonthHeading(adjacentMonths.previous)}
                </button>
              )}
              {adjacentMonths.next && (
                <button
                  type="button"
                  className="button button--secondary button--small"
                  disabled={!canStepNextMonth}
                  onClick={() => onSelectMonth(adjacentMonths.next)}
                >
                  {formatPublicationMonthHeading(adjacentMonths.next)}{' '}
                  <ArrowRight size={14} aria-hidden="true" />
                </button>
              )}
            </nav>
          </div>

          <header className="notebook-month-detail__header">
            <h2>{formatPublicationMonthHeading(selectedYearMonth)}</h2>
            {selectedMonthEntry && (
              <p className="notebook-month-detail__summary">
                {selectedMonthEntry.isFutureOrUnpublished
                  ? 'Coming soon — this publication month is not yet available.'
                  : `${selectedMonthEntry.earnedCount} earned ${selectedMonthEntry.earnedCount === 1 ? 'card' : 'cards'} · ${selectedMonthEntry.daysInMonth} days in month`}
              </p>
            )}
          </header>

          {selectedMonthEntry?.isFutureOrUnpublished ? (
            <div className="notebook-empty" role="status">
              <h3>Coming Soon</h3>
              <p>
                This publication month is not yet available. Future teaching titles, discovery
                goals, and card artwork stay hidden until published.
              </p>
            </div>
          ) : (
            <NotebookGallerySection
              heading={`Cards Earned for ${formatPublicationMonthHeading(selectedYearMonth)}`}
              cards={filteredMonthCards}
              emptyTitle={`No Earned Cards for ${formatPublicationMonthHeading(selectedYearMonth)}`}
              emptyBody="No Scripture Cards have been earned for this publication month yet. Cards earned later from Shelf or Library still appear here under their original publication month."
              isFiltered={hasActiveFilter}
              onClearFilter={clearFilters}
              failedImageUrls={failedImageUrls}
              onImageError={handleImageError}
              onOpenCard={handleTriggerCard}
            />
          )}
        </section>
      ) : (
        <section aria-labelledby="notebook-year-heading">
          {projection.allEarnedCards.length === 0 && (
            <div className="notebook-empty" role="status" style={{ marginBottom: '20px' }}>
              <h2>No Earned Scripture Cards Yet</h2>
              <p>
                Your Field Notebook is ready. Complete thematic discoveries or full months—from
                current teaching, Shelf, or Library—to gather permanent Scripture Cards here.
              </p>
            </div>
          )}

          <div className="notebook-year-nav">
            <h2 id="notebook-year-heading" className="notebook-year-nav__heading">
              {selectedYear} Publication Months
            </h2>

            <div className="notebook-year-nav__controls">
              <button
                type="button"
                className="button button--secondary button--small"
                disabled={selectedYear <= 1900}
                onClick={() => onSelectYear(selectedYear - 1)}
              >
                <ArrowLeft size={14} aria-hidden="true" /> {selectedYear - 1}
              </button>

              <div className="notebook-year-pills" role="group" aria-label="Relevant years">
                {yearOptions.map(year => (
                  <button
                    key={year}
                    type="button"
                    className="notebook-year-pill"
                    aria-pressed={year === selectedYear}
                    onClick={() => onSelectYear(year)}
                  >
                    {year}
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="button button--secondary button--small"
                disabled={selectedYear >= 2100}
                onClick={() => onSelectYear(selectedYear + 1)}
              >
                {selectedYear + 1} <ArrowRight size={14} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="notebook-months-grid">
            {monthEntries.map(entry => {
              if (entry.isFutureOrUnpublished) {
                return (
                  <div
                    key={entry.yearMonth}
                    className="notebook-month-card notebook-month-card--coming-soon"
                    aria-disabled="true"
                  >
                    <div className="notebook-month-card__top">
                      <span className="notebook-month-card__name">{entry.monthName}</span>
                    </div>
                    <span className="notebook-month-card__meta">Coming soon</span>
                  </div>
                )
              }

              return (
                <button
                  key={entry.yearMonth}
                  type="button"
                  className={`notebook-month-card ${entry.earnedCount > 0 ? 'notebook-month-card--has-cards' : ''}`}
                  onClick={() => onSelectMonth(entry.yearMonth)}
                  aria-label={`${entry.monthHeading}: ${entry.earnedCount} earned ${entry.earnedCount === 1 ? 'card' : 'cards'}${entry.unviewedCount > 0 ? `, ${entry.unviewedCount} new` : ''}`}
                >
                  <div className="notebook-month-card__top">
                    <span className="notebook-month-card__name">{entry.monthName}</span>
                    {entry.unviewedCount > 0 && (
                      <span className="notebook-month-card__badge">
                        {entry.unviewedCount} New
                      </span>
                    )}
                  </div>
                  <span className="notebook-month-card__meta">
                    {entry.earnedCount === 0
                      ? 'No earned cards yet'
                      : `${entry.earnedCount} earned ${entry.earnedCount === 1 ? 'card' : 'cards'}`}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {activeCard?.hasCardSnapshot && activeCard.earnedCard && (
        <EarnedScriptureCardViewer
          card={activeCard.earnedCard}
          earnedOn={activeCard.earnedOn}
          kind={activeCard.kind}
          returnFocusRef={lastCardTriggerRef}
          onClose={onCloseCard}
        />
      )}
    </div>
  )
}
