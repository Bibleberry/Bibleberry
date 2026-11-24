import { AlertCircle, ArrowLeft, BookOpen, Compass, Library, Plus, X } from 'lucide-react'
import type { RefObject } from 'react'
import type { PublicationYearMonth } from '../../participation/types.ts'
import { ShelfCard } from './ShelfCard.tsx'
import type {
  ShelfCandidateMonthViewModel,
  ShelfViewModel,
} from './shelfModel.ts'

export interface ShelfViewProps {
  readonly viewModel: ShelfViewModel
  readonly headingRef?: RefObject<HTMLHeadingElement | null>
  readonly candidateMonths?: readonly ShelfCandidateMonthViewModel[]
  readonly liveAnnouncement?: string
  readonly errorMessage?: string | null
  readonly onDismissError?: () => void
  readonly onOpenMonth: (yearMonth: PublicationYearMonth) => void
  readonly onSelectMonth?: (yearMonth: string) => void
  readonly onSetProtection: (yearMonth: PublicationYearMonth, isProtected: boolean) => void
  readonly onPutAway: (yearMonth: PublicationYearMonth) => void
  readonly onSetFocus: (yearMonth: PublicationYearMonth) => void
  readonly onClearFocus: () => void
  readonly onRequestLibraryPicker?: () => void
  readonly onExit?: () => void
  readonly exitLabel?: string
}

/**
 * Presentation component for the standalone Shelf reader surface.
 *
 * Requirements:
 * - Renders 0–3 historical months (never pads empty slots to three).
 * - Current and future months never appear as Shelf entries.
 * - Exposes policy-driven actions: Open Month, Keep/Protect, Put Away, Set/Clear Focus,
 *   and Library picker boundary or supplied historical month selection.
 * - Semantic landmarks, live region, minimum 44px touch targets, narrow-screen reflow.
 */
export function ShelfView({
  viewModel,
  headingRef,
  candidateMonths = [],
  liveAnnouncement = '',
  errorMessage = null,
  onDismissError,
  onOpenMonth,
  onSelectMonth,
  onSetProtection,
  onPutAway,
  onSetFocus,
  onClearFocus,
  onRequestLibraryPicker,
  onExit,
  exitLabel = 'Return',
}: ShelfViewProps) {
  const {
    entries,
    slotCount,
    maxCapacity,
    isFull,
    activeFocusOutsideShelf,
    activeFocusHeading,
  } = viewModel

  const capacityText =
    slotCount === 0
      ? `0 of ${maxCapacity} months on Shelf`
      : isFull
        ? `Shelf full · ${slotCount} of ${maxCapacity} months`
        : `${slotCount} of ${maxCapacity} ${slotCount === 1 ? 'month' : 'months'} on Shelf`

  return (
    <main className="standard-page shelf-page" role="main" aria-label="Shelf">
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </div>

      {onExit && (
        <div className="shelf-topbar">
          <button type="button" className="back-link shelf-back-btn" onClick={onExit}>
            <ArrowLeft size={17} aria-hidden="true" />
            <span>{exitLabel}</span>
          </button>
        </div>
      )}

      <header className="shelf-header">
        <div className="shelf-header__row">
          <div>
            <span className="shelf-header__eyebrow">Focused Historical Study</span>
            <h1 ref={headingRef} tabIndex={-1} className="shelf-header__title">Shelf</h1>
          </div>
          <span className="shelf-capacity-pill" aria-label={capacityText}>
            {capacityText}
          </span>
        </div>
        <p className="shelf-header__subtitle">
          Keep up to three past months close at hand. Putting a month away removes it from your
          Shelf only—your completed studies, earned cards, and saved Scripture remain preserved in
          the Library.
        </p>
      </header>

      {activeFocusOutsideShelf && activeFocusHeading && (
        <section
          className="shelf-focus-banner"
          role="region"
          aria-label="Active Focus outside Shelf"
        >
          <div className="shelf-focus-banner__content">
            <Compass size={18} aria-hidden="true" />
            <p className="shelf-focus-banner__text">
              <strong>Active Focus:</strong> {activeFocusHeading} (studying in Library, not on
              Shelf)
            </p>
          </div>
          <button
            type="button"
            className="shelf-btn shelf-btn--secondary"
            onClick={onClearFocus}
          >
            Clear Active Focus
          </button>
        </section>
      )}

      {errorMessage && (
        <div className="shelf-alert" role="alert">
          <div className="shelf-alert__content">
            <AlertCircle size={18} aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
          {onDismissError && (
            <button
              type="button"
              className="shelf-alert__dismiss"
              onClick={onDismissError}
              aria-label="Dismiss notice"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {entries.length === 0 ? (
        <section
          className="shelf-empty-panel"
          role="region"
          aria-labelledby="shelf-empty-title"
        >
          <BookOpen size={40} className="shelf-empty-icon" aria-hidden="true" />
          <h2 id="shelf-empty-title" className="shelf-empty-title">
            Your Shelf is Empty
          </h2>
          <p className="shelf-empty-message">
            You can place up to three past months here for focused study, or read any past month
            directly in the Library.
          </p>
          {onRequestLibraryPicker && (
            <button
              type="button"
              className="shelf-btn shelf-btn--primary"
              onClick={onRequestLibraryPicker}
            >
              <Library size={16} aria-hidden="true" />
              <span>Browse Library to Add a Month</span>
            </button>
          )}
        </section>
      ) : (
        <section aria-label="Historical months on Shelf">
          <ul className="shelf-list">
            {entries.map(entry => (
              <li key={entry.yearMonth} className="shelf-list__item">
                <ShelfCard
                  entry={entry}
                  onOpenMonth={onOpenMonth}
                  onSetProtection={onSetProtection}
                  onPutAway={onPutAway}
                  onSetFocus={onSetFocus}
                  onClearFocus={onClearFocus}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {(onRequestLibraryPicker || candidateMonths.length > 0) && (
        <section
          className="shelf-add-section"
          role="region"
          aria-labelledby="shelf-add-heading"
        >
          <div className="shelf-add-section__header">
            <div>
              <h2 id="shelf-add-heading" className="shelf-add-section__title">
                Add a Past Month
              </h2>
              <p className="shelf-add-section__desc">
                Reader-selected months are protected from automatic rollover replacement.
                {isFull
                  ? ' Your Shelf is currently full; selecting another month will ask which month to replace.'
                  : ''}
              </p>
            </div>

            {entries.length > 0 && onRequestLibraryPicker && (
              <button
                type="button"
                className="shelf-btn shelf-btn--secondary"
                onClick={onRequestLibraryPicker}
              >
                <Library size={16} aria-hidden="true" />
                <span>Browse Library</span>
              </button>
            )}
          </div>

          {candidateMonths.length > 0 && onSelectMonth && (
            <ul className="shelf-candidate-list" aria-label="Available historical months">
              {candidateMonths.map(candidate => (
                <li key={candidate.yearMonth} className="shelf-candidate-item">
                  <div className="shelf-candidate-item__info">
                    <span className="shelf-candidate-item__heading">
                      {candidate.monthHeading}
                    </span>
                    {candidate.title && (
                      <span className="shelf-candidate-item__title">{candidate.title}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="shelf-btn shelf-btn--secondary"
                    disabled={candidate.alreadyOnShelf}
                    onClick={() => onSelectMonth(candidate.yearMonth)}
                    aria-label={
                      candidate.alreadyOnShelf
                        ? `${candidate.monthHeading} is already on Shelf`
                        : `Add ${candidate.monthHeading} to Shelf`
                    }
                  >
                    <Plus size={15} aria-hidden="true" />
                    <span>{candidate.alreadyOnShelf ? 'On Shelf' : 'Add to Shelf'}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  )
}
