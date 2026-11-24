import { useId, useMemo, useRef, useState } from 'react'
import { EarnedScriptureCardViewer } from '../../components/cards/EarnedScriptureCardViewer.tsx'
import { EarnedCardThumbnail } from '../../components/notebook/EarnedCardThumbnail.tsx'
import { projectValidatedEarnedAwards, type NotebookEarnedCardItem } from '../../components/notebook/fieldNotebookModel.ts'
import { defaultGuestParticipationStore } from '../../participation/defaultGuestStore.ts'
import { selectNewDiscoveryAwardIds } from '../../participation/model.ts'
import { useReaderParticipation } from '../../participation/useReaderParticipation.ts'
import type { CanonicalAwardId } from '../../participation/types.ts'
import './collectionsLanding.css'

const previewLimit = 3

export function CollectionsLanding({
  onOpenNotebook,
  onOpenSavedScripture,
}: {
  readonly onOpenNotebook: () => void
  readonly onOpenSavedScripture: () => void
}) {
  const store = defaultGuestParticipationStore
  const { status, committedData, health } = useReaderParticipation(store)
  const newDiscoveriesId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [activeAwardId, setActiveAwardId] = useState<CanonicalAwardId | null>(null)

  const preview = useMemo(
    () => projectValidatedEarnedAwards(committedData).slice(0, previewLimit),
    [committedData],
  )
  const activeCard = preview.find(item => item.awardId === activeAwardId)
  const hasNewDiscoveries = status === 'ready' && selectNewDiscoveryAwardIds(committedData).length > 0

  function openCard(item: NotebookEarnedCardItem, trigger: HTMLButtonElement) {
    triggerRef.current = trigger
    setActiveAwardId(item.awardId)
    if (!item.cardViewed) {
      void store.dispatch({ type: 'markEarnedCardViewed', awardId: item.awardId }).catch(() => {
        // The Card remains readable if saving its viewed state fails.
      })
    }
  }

  return (
    <div className="r06-landing r06-collections">
      <h1>Collections</h1>
      <section aria-label="Earned Scripture Cards">
        <h2>Earned Scripture Cards</h2>
        {status === 'hydrating' ? (
          <p role="status">Loading earned Scripture Cards…</p>
        ) : preview.length > 0 ? (
          <ul className="notebook-cards-grid r06-collections__preview">
            {preview.map(item => (
              <EarnedCardThumbnail key={item.awardId} item={item} onOpen={openCard} />
            ))}
          </ul>
        ) : (
          <p role="status">
            {health === 'ok'
              ? 'You haven’t earned any Scripture Cards yet. Cards you earn through monthly discoveries will appear here.'
              : 'Earned Scripture Cards are unavailable right now.'}
          </p>
        )}
      </section>
      <div className="r06-actions">
        <button
          type="button"
          className="button button--secondary"
          onClick={onOpenNotebook}
          aria-describedby={hasNewDiscoveries ? newDiscoveriesId : undefined}
        >
          Field Notebook
        </button>
        <button type="button" className="button button--secondary" onClick={onOpenSavedScripture}>
          Saved Scripture
        </button>
        {hasNewDiscoveries && (
          <span className="r06-collections__discoveries" id={newDiscoveriesId}>New Discoveries</span>
        )}
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
