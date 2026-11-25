import { useRef } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Layers,
  Search,
  X,
} from 'lucide-react'
import { EarnedCardThumbnail } from './EarnedCardThumbnail.tsx'
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

function NotebookGallerySection({
  heading,
  cards,
  emptyTitle,
  emptyBody,
  onClearFilter,
  onOpenCard,
}: {
  readonly heading: string
  readonly cards: readonly NotebookEarnedCardItem[]
  readonly emptyTitle: string
  readonly emptyBody: string
  readonly onClearFilter?: () => void
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
          <h3>{emptyTitle}</h3>
          <p>{emptyBody}</p>
          {onClearFilter && (
            <button type="button" className="button button--secondary" onClick={onClearFilter}>
              Clear search and filters
            </button>
          )}
        </div>
      ) : (
        <ul className={onClearFilter ? 'notebook-cards-grid notebook-cards-grid--search' : 'notebook-cards-grid'}>
          {cards.map(item => (
            <EarnedCardThumbnail
              key={item.awardId}
              item={item}
              showDates={!onClearFilter}
              onOpen={onOpenCard}
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

  const handleTriggerCard = (item: NotebookEarnedCardItem, triggerElement: HTMLButtonElement) => {
    lastCardTriggerRef.current = triggerElement
    onOpenCard(item, triggerElement)
  }

  const hasActiveFilter = searchQuery.trim().length > 0 || selectedTheme !== null
  const clearFilters = () => {
    onSearchQueryChange('')
    onSelectTheme(null)
  }

  const selectBrowseMode = (mode: NotebookBrowseMode) => {
    clearFilters()
    onChangeBrowseMode(mode)
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
        <h1>Field Notebook</h1>
      </header>

      <section className="notebook-lifetime" aria-labelledby="notebook-lifetime-heading">
        <p className="eyebrow notebook-lifetime__eyebrow">LIFETIME PARTICIPATION</p>
        <h2 id="notebook-lifetime-heading" className="notebook-lifetime__headline">
          {projection.lifetime.headline}
        </h2>
        <p className="notebook-lifetime__copy">{projection.lifetime.supportingCopy}</p>
      </section>

      <section className="notebook-controls" aria-label="Browse and filter earned Scripture Cards">
        <div className="notebook-search">
          <label htmlFor="notebook-search-input" className="notebook-search__label">
            Search Your Cards
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
                placeholder="Title, Bible book, reference, or theme"
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
        <div className="notebook-mode-tabs" role="group" aria-label="Field Notebook views">
          <button
            type="button"
            className="notebook-mode-tab"
            aria-pressed={!hasActiveFilter && browseMode === 'yearMonth'}
            onClick={() => selectBrowseMode('yearMonth')}
          >
            <Calendar size={16} aria-hidden="true" /> By Year &amp; Month
          </button>
          <button
            type="button"
            className="notebook-mode-tab"
            aria-pressed={!hasActiveFilter && browseMode === 'allCards'}
            onClick={() => selectBrowseMode('allCards')}
          >
            <Layers size={16} aria-hidden="true" /> All Earned Cards
          </button>
        </div>
      </section>

      {hasActiveFilter ? (
        <NotebookGallerySection
          heading="Matching Earned Cards"
          cards={filterNotebookCards(projection.allEarnedCards, { query: searchQuery, theme: selectedTheme })}
          emptyTitle="No Matching Earned Scripture Cards"
          emptyBody="Try another card title, Bible book, Scripture reference, or curated theme."
          onClearFilter={clearFilters}
          onOpenCard={handleTriggerCard}
        />
      ) : browseMode === 'allCards' ? (
        <NotebookGallerySection
          heading="All Earned Cards"
          cards={projection.allEarnedCards}
          emptyTitle="No Earned Scripture Cards Yet"
          emptyBody="Scripture Cards you earn from monthly discoveries appear here."
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
              cards={selectedMonthEntry?.cards ?? []}
              emptyTitle={`No Earned Cards for ${formatPublicationMonthHeading(selectedYearMonth)}`}
              emptyBody="No Scripture Cards have been earned for this publication month yet. Cards earned later from Shelf or Library still appear here under their original publication month."
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
