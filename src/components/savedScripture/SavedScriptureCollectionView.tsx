import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ArrowLeft, BookOpen, Calendar, Info, RotateCcw, Search, Trash2, X } from 'lucide-react'
import { RemoveSavedScriptureConfirmDialog } from './RemoveSavedScriptureConfirmDialog.tsx'
import { SavedScriptureDetailsDialog } from './SavedScriptureDetailsDialog.tsx'
import {
  buildSavedScriptureCountLabel,
  filterSavedScriptures,
  normalizeScriptureSearchQuery,
  type SavedScriptureCollectionItem,
} from './savedScriptureCollectionModel.ts'
import './savedScripture.css'

export type SavedScriptureViewStatus = 'loading' | 'ready' | 'readError'

export interface SavedScriptureCollectionViewProps {
  readonly items: readonly SavedScriptureCollectionItem[]
  readonly status?: SavedScriptureViewStatus
  readonly statusMessage?: string | null
  readonly writeErrorMessage?: string | null
  readonly isRetryingWrite?: boolean
  readonly onRetryWrite?: () => void
  readonly onRemoveItem?: (item: SavedScriptureCollectionItem) => Promise<void> | void
  readonly onExit?: () => void
  readonly exitLabel?: string
  readonly headingText?: string
}

interface PendingRemovalState {
  readonly item: SavedScriptureCollectionItem
  readonly origin: 'list' | 'details'
  readonly listTriggerEl: HTMLElement | null
  readonly detailsTriggerEl: HTMLElement | null
}

interface FocusRecoveryRequest {
  readonly removedKey: string
  readonly nextKey: string | null
  readonly prevKey: string | null
}

/**
 * Pure, accessible Saved Scripture reader surface (R09-1 / Issue #120).
 *
 * Accepts projected citation items (including synthetic fixtures in tests), manages search/filter,
 * citation-only detail inspection, explicit removal confirmation, polite live announcements, and
 * post-removal focus recovery without performing storage or network calls directly.
 */
export function SavedScriptureCollectionView({
  items,
  status = 'ready',
  statusMessage = null,
  writeErrorMessage = null,
  isRetryingWrite = false,
  onRetryWrite,
  onRemoveItem,
  onExit,
  exitLabel = 'Return',
  headingText = 'Saved Scripture',
}: SavedScriptureCollectionViewProps) {
  const headingId = useId()
  const searchInputId = useId()
  const searchHintId = useId()

  const [query, setQuery] = useState('')
  const [detailsState, setDetailsState] = useState<{
    readonly item: SavedScriptureCollectionItem
    readonly triggerEl: HTMLElement | null
  } | null>(null)
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemovalState | null>(null)
  const [isRemoving, setIsRemoving] = useState(false)
  const [liveAnnouncement, setLiveAnnouncement] = useState('')
  const [focusRecoveryRequest, setFocusRecoveryRequest] = useState<FocusRecoveryRequest | null>(null)

  const mainHeadingRef = useRef<HTMLHeadingElement>(null)
  const emptyHeadingRef = useRef<HTMLHeadingElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const clearSearchButtonRef = useRef<HTMLButtonElement>(null)
  const detailsButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

  const normalizedQuery = normalizeScriptureSearchQuery(query)
  const hasActiveQuery = normalizedQuery.length > 0

  const filteredItems = useMemo(
    () => filterSavedScriptures(items, query),
    [items, query],
  )

  const activeDetailsItem = useMemo(() => {
    if (!detailsState) return null
    return items.find(entry => entry.key === detailsState.item.key) ?? null
  }, [detailsState, items])

  const activeRemovalItem = useMemo(() => {
    if (!pendingRemoval) return null
    return items.find(entry => entry.key === pendingRemoval.item.key) ?? null
  }, [pendingRemoval, items])

  useEffect(() => {
    if (!focusRecoveryRequest) return
    if (items.some(entry => entry.key === focusRecoveryRequest.removedKey)) {
      return
    }

    const { nextKey, prevKey } = focusRecoveryRequest
    const nextButton = nextKey ? detailsButtonRefs.current.get(nextKey) : undefined
    const prevButton = prevKey ? detailsButtonRefs.current.get(prevKey) : undefined
    const firstVisibleKey = filteredItems[0]?.key
    const firstVisibleButton = firstVisibleKey
      ? detailsButtonRefs.current.get(firstVisibleKey)
      : undefined

    const fallbackTarget =
      nextButton
      ?? prevButton
      ?? firstVisibleButton
      ?? (hasActiveQuery && filteredItems.length === 0 ? clearSearchButtonRef.current : null)
      ?? (items.length === 0 ? emptyHeadingRef.current : null)
      ?? mainHeadingRef.current

    if (fallbackTarget && fallbackTarget.isConnected) {
      fallbackTarget.focus({ preventScroll: true })
    }
    setFocusRecoveryRequest(null)
  }, [focusRecoveryRequest, items, filteredItems, hasActiveQuery])

  const countLabel = buildSavedScriptureCountLabel(
    items.length,
    filteredItems.length,
    hasActiveQuery,
  )

  const handleOpenDetails = (item: SavedScriptureCollectionItem, triggerEl: HTMLElement | null) => {
    setDetailsState({ item, triggerEl })
  }

  const handleRequestRemoveFromList = (
    item: SavedScriptureCollectionItem,
    triggerEl: HTMLElement | null,
  ) => {
    setPendingRemoval({
      item,
      origin: 'list',
      listTriggerEl: triggerEl,
      detailsTriggerEl: null,
    })
  }

  const handleRequestRemoveFromDetails = (item: SavedScriptureCollectionItem) => {
    const detailsTriggerEl = detailsState?.triggerEl ?? null
    setDetailsState(null)
    setPendingRemoval({
      item,
      origin: 'details',
      listTriggerEl: null,
      detailsTriggerEl,
    })
  }

  const handleCancelRemoval = () => {
    if (isRemoving) return
    const current = pendingRemoval
    if (!current) return
    if (current.origin === 'details') {
      setPendingRemoval(null)
      setDetailsState({
        item: current.item,
        triggerEl: current.detailsTriggerEl,
      })
      return
    }
    setPendingRemoval(null)
  }

  const handleConfirmRemoval = async (item: SavedScriptureCollectionItem) => {
    if (isRemoving) return
    const visibleKeys = filteredItems.map(entry => entry.key)
    const removedIndex = visibleKeys.indexOf(item.key)
    const nextKey = removedIndex >= 0 && removedIndex + 1 < visibleKeys.length
      ? visibleKeys[removedIndex + 1]
      : null
    const prevKey = removedIndex > 0 ? visibleKeys[removedIndex - 1] : null

    setIsRemoving(true)
    try {
      await onRemoveItem?.(item)
      setPendingRemoval(null)
      setDetailsState(null)
      setLiveAnnouncement(`Removed ${item.reference} from Saved Scripture.`)
      setFocusRecoveryRequest({
        removedKey: item.key,
        nextKey,
        prevKey,
      })
    } finally {
      setIsRemoving(false)
    }
  }

  const handleClearSearch = () => {
    setQuery('')
    setLiveAnnouncement('Cleared search filter.')
    searchInputRef.current?.focus({ preventScroll: true })
  }

  return (
    <section className="standard-page saved-scripture-page" aria-labelledby={headingId}>
      {onExit && (
        <button
          type="button"
          className="back-link saved-scripture-page__back"
          onClick={onExit}
        >
          <ArrowLeft size={17} aria-hidden="true" /> {exitLabel}
        </button>
      )}

      <header className="page-intro saved-scripture-header">
        <p className="eyebrow">PERSONAL SCRIPTURE COLLECTION</p>
        <h1 id={headingId} ref={mainHeadingRef} tabIndex={-1}>
          {headingText}
        </h1>
        <p>
          Scripture citations and recorded translations you chose to keep while reading Bibleberry.
          Saved Scripture is separate from Saved Challenges, earned cards in your Field Notebook,
          personal notes, and any memorization plan.
        </p>
      </header>

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </div>

      {writeErrorMessage && (
        <div className="saved-scripture-alert" role="alert">
          <div className="saved-scripture-alert__body">
            <Info size={18} aria-hidden="true" />
            <div>
              <strong>Device storage could not save your latest change</strong>
              <p>{writeErrorMessage}</p>
            </div>
          </div>
          {onRetryWrite && (
            <button
              type="button"
              className="button button--secondary button--small"
              onClick={onRetryWrite}
              disabled={isRetryingWrite}
            >
              <RotateCcw size={15} aria-hidden="true" />
              {isRetryingWrite ? 'Retrying…' : 'Retry saving'}
            </button>
          )}
        </div>
      )}

      {status === 'loading' ? (
        <div className="saved-scripture-state" role="status" aria-live="polite">
          <BookOpen size={28} aria-hidden="true" />
          <h2>Loading Saved Scripture…</h2>
          <p>{statusMessage ?? 'Reading your saved Scripture references from device storage.'}</p>
        </div>
      ) : status === 'readError' ? (
        <div className="saved-scripture-state saved-scripture-state--error" role="alert">
          <Info size={28} aria-hidden="true" />
          <h2>Saved Scripture could not be loaded safely</h2>
          <p>
            {statusMessage
              ?? 'Stored participation records on this device appear unreadable or from a newer version. Existing data was left untouched.'}
          </p>
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state saved-scripture-empty">
          <BookOpen aria-hidden="true" />
          <h2 ref={emptyHeadingRef} tabIndex={-1}>
            No Saved Scripture yet
          </h2>
          <p>
            When you tap “Add to My Scripture” beside a passage or deeper study in a Challenge, the
            citation and recorded translation will appear here—without storing passage text or
            requiring an account.
          </p>
        </div>
      ) : (
        <>
          <div className="saved-scripture-toolbar">
            <div className="saved-scripture-search">
              <label htmlFor={searchInputId} className="saved-scripture-search__label">
                Search Saved Scripture
              </label>
              <div className="saved-scripture-search__field">
                <Search size={17} className="saved-scripture-search__icon" aria-hidden="true" />
                <input
                  ref={searchInputRef}
                  id={searchInputId}
                  type="search"
                  className="saved-scripture-search__input"
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="Reference, Bible book, or translation (e.g. Psalm 23, WEBP)"
                  aria-describedby={searchHintId}
                  autoComplete="off"
                  spellCheck={false}
                />
                {query.length > 0 && (
                  <button
                    type="button"
                    className="saved-scripture-search__clear"
                    onClick={handleClearSearch}
                    aria-label="Clear search text"
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                )}
              </div>
              <p id={searchHintId} className="saved-scripture-search__hint">
                Filter by citation, Bible book spelling, or recorded translation.
              </p>
            </div>

            <p className="saved-scripture-count" aria-live="polite">
              {countLabel}
            </p>
          </div>

          {filteredItems.length === 0 ? (
            <div className="empty-state saved-scripture-no-matches" role="status">
              <Search aria-hidden="true" />
              <h2>No matching Saved Scripture</h2>
              <p>
                No saved citations or translations matched “{normalizedQuery}”. Check the book
                spelling, chapter/verse, or translation, or clear the search to view all{' '}
                {items.length} saved {items.length === 1 ? 'reference' : 'references'}.
              </p>
              <button
                ref={clearSearchButtonRef}
                type="button"
                className="button button--secondary"
                onClick={handleClearSearch}
              >
                Clear search
              </button>
            </div>
          ) : (
            <ul className="saved-scripture-grid" aria-label="Saved Scripture references">
              {filteredItems.map(item => (
                <li key={item.key} className="saved-scripture-card">
                  <div className="saved-scripture-card__header">
                    <h2 className="saved-scripture-card__reference">{item.reference}</h2>
                    <span
                      className={
                        item.hasExplicitTranslation
                          ? 'saved-scripture-card__translation'
                          : 'saved-scripture-card__translation saved-scripture-card__translation--unspecified'
                      }
                    >
                      {item.translationLabel}
                    </span>
                  </div>

                  <p className="saved-scripture-card__meta">
                    <Calendar size={14} aria-hidden="true" />
                    <span>
                      Saved <time dateTime={item.savedOn}>{item.savedDateLabel}</time>
                    </span>
                  </p>

                  {item.hasSourceChallenge && (
                    <p className="saved-scripture-card__provenance">
                      {item.provenanceSummary}
                    </p>
                  )}

                  <div className="saved-scripture-card__actions">
                    <button
                      ref={el => {
                        if (el) {
                          detailsButtonRefs.current.set(item.key, el)
                        } else {
                          detailsButtonRefs.current.delete(item.key)
                        }
                      }}
                      type="button"
                      className="button button--secondary button--small"
                      onClick={event => handleOpenDetails(item, event.currentTarget)}
                      aria-label={`View details for ${item.reference}${item.translation ? ` (${item.translation})` : ''}`}
                    >
                      <BookOpen size={15} aria-hidden="true" /> Details
                    </button>
                    {onRemoveItem && (
                      <button
                        type="button"
                        className="button button--text danger-link saved-scripture-card__remove"
                        onClick={event => handleRequestRemoveFromList(item, event.currentTarget)}
                        aria-label={`Remove ${item.reference}${item.translation ? ` (${item.translation})` : ''} from Saved Scripture`}
                      >
                        <Trash2 size={15} aria-hidden="true" /> Remove
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <p className="local-note saved-scripture-footnote">
        <BookOpen size={17} aria-hidden="true" />
        <span>
          Citation and translation metadata only. Bible passage manuscripts are never downloaded or
          stored in Saved Scripture, and no account is required.
        </span>
      </p>

      <SavedScriptureDetailsDialog
        item={activeDetailsItem}
        returnFocusEl={detailsState?.triggerEl ?? null}
        onClose={() => {
          setDetailsState(null)
        }}
        onRequestRemove={handleRequestRemoveFromDetails}
      />

      <RemoveSavedScriptureConfirmDialog
        item={activeRemovalItem}
        isRemoving={isRemoving}
        returnFocusEl={pendingRemoval?.listTriggerEl ?? null}
        onCancel={handleCancelRemoval}
        onConfirm={item => {
          void handleConfirmRemoval(item)
        }}
      />
    </section>
  )
}
