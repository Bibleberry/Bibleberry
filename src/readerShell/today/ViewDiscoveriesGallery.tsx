import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { EarnedScriptureCardViewer } from '../../components/cards/EarnedScriptureCardViewer.tsx'
import { EarnedCardThumbnail } from '../../components/notebook/EarnedCardThumbnail.tsx'
import type { NotebookEarnedCardItem } from '../../components/notebook/fieldNotebookModel.ts'
import { defaultGuestParticipationStore } from '../../participation/defaultGuestStore.ts'
import { acknowledgeNotebookEntry, type ReaderParticipationStore } from '../../participation/store.ts'
import type { CanonicalAwardId } from '../../participation/types.ts'
import { useReaderParticipation } from '../../participation/useReaderParticipation.ts'
import { parseDiscoveriesBatch, projectDiscoveriesBatch } from './discoveriesBatch.ts'

export interface ViewDiscoveriesGalleryProps {
  /** The encoded batch carried by the session-only Today route. */
  readonly batch: string
  readonly store?: ReaderParticipationStore
  readonly onReturnToToday: () => void
  readonly onBrowseFieldNotebook: () => void
}

/**
 * Coastal Osprey (Issue #322): focused gallery for exactly one Today announcement batch.
 *
 * - Shows only the referenced, durably earned Cards (authentic thumbnails, no unearned art).
 * - Entering counts as Field Notebook entry and clears New Discoveries through the
 *   separate `acknowledgeNotebookEntry` contract. It never marks Cards viewed.
 * - Opening a full Card marks only that Card viewed, so its `New` marker clears.
 */
export function ViewDiscoveriesGallery({
  batch,
  store = defaultGuestParticipationStore,
  onReturnToToday,
  onBrowseFieldNotebook,
}: ViewDiscoveriesGalleryProps) {
  const headingId = useId()
  const { status, committedData, health } = useReaderParticipation(store)
  const awardIds = useMemo(() => parseDiscoveriesBatch(batch), [batch])
  const items = useMemo(
    () => (awardIds ? projectDiscoveriesBatch(committedData, awardIds) : []),
    [awardIds, committedData],
  )
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [activeAwardId, setActiveAwardId] = useState<CanonicalAwardId | null>(null)
  const activeCard = items.find(item => item.awardId === activeAwardId)

  useEffect(() => {
    if (status === 'ready') void acknowledgeNotebookEntry(store).catch(() => {})
  }, [store, status])

  function openCard(item: NotebookEarnedCardItem, trigger: HTMLButtonElement) {
    if (!item.earnedCard) return
    triggerRef.current = trigger
    setActiveAwardId(item.awardId)
    if (!item.cardViewed) {
      void store.dispatch({ type: 'markEarnedCardViewed', awardId: item.awardId }).catch(() => {
        // The Card remains readable if saving its viewed state fails.
      })
    }
  }

  const title = items.length === 1 ? 'Your New Discovery' : 'Your New Discoveries'

  return (
    <div className="r06-landing r06-discoveries" data-testid="view-discoveries-gallery">
      <div className="r06-actions">
        <button type="button" className="button button--secondary" onClick={onReturnToToday}>
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Return to Today</span>
        </button>
      </div>
      <h1 id={headingId}>{title}</h1>
      <section aria-labelledby={headingId}>
        {status === 'hydrating' ? (
          <p role="status">Loading your discoveries…</p>
        ) : items.length > 0 ? (
          <>
            <p className="r06-discoveries__summary">
              {items.length === 1
                ? 'The Scripture Card from this announcement.'
                : `The ${items.length} Scripture Cards from this announcement.`}
            </p>
            <ul className="notebook-cards-grid r06-discoveries__grid">
              {items.map(item => (
                <EarnedCardThumbnail key={item.awardId} item={item} showDates onOpen={openCard} />
              ))}
            </ul>
          </>
        ) : (
          <p role="status">
            {health === 'ok'
              ? 'These discoveries are no longer available here. Your earned Cards remain in your Field Notebook.'
              : 'Your discoveries are unavailable right now.'}
          </p>
        )}
      </section>
      <div className="r06-actions">
        <button type="button" className="button button--primary" onClick={onBrowseFieldNotebook}>
          <span>Browse Full Field Notebook</span>
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
      {activeCard?.earnedCard && (
        <EarnedScriptureCardViewer
          card={activeCard.earnedCard}
          earnedOn={activeCard.earnedOn}
          kind={activeCard.kind}
          returnFocusRef={triggerRef}
          onClose={() => setActiveAwardId(null)}
        />
      )}
    </div>
  )
}
