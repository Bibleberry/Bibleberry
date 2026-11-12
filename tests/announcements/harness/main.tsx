import { StrictMode, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../../../src/index.css'
import '../../../src/App.css'
import { CardAnnouncementPreferenceControl } from '../../../src/components/announcements/HubCardAnnouncementBoundary.tsx'
import { HubCardAnnouncementDialog } from '../../../src/components/announcements/HubCardAnnouncementDialog.tsx'
import type { HubSurface } from '../../../src/components/announcements/hubCardAnnouncementModel.ts'
import { useHubCardAnnouncements } from '../../../src/components/announcements/useHubCardAnnouncements.ts'
import { createRecordEarnedAwardsCommand } from '../../../src/participation/awards.ts'
import { defaultGuestParticipationStore } from '../../../src/participation/defaultGuestStore.ts'
import {
  parseCanonicalMonthlyAwardId,
  parseLocalCalendarDate,
  parsePublicationYearMonth,
} from '../../../src/participation/identity.ts'
import type { EarnedAwardInput } from '../../../src/participation/types.ts'
import { useReaderParticipation } from '../../../src/participation/useReaderParticipation.ts'

function readInitialSurface(): HubSurface {
  const param = new URLSearchParams(window.location.search).get('surface')
  if (
    param === 'hub'
    || param === 'month'
    || param === 'shelf'
    || param === 'library'
    || param === 'challenge'
    || param === 'other'
  ) {
    return param
  }
  return 'month'
}

function readLargeText(): boolean {
  return new URLSearchParams(window.location.search).get('large') === '1'
}

function readNotebookEnabled(): boolean {
  return new URLSearchParams(window.location.search).get('notebook') === '1'
}

function makeAwardInput(which: 'one' | 'two' | 'three'): EarnedAwardInput {
  const yearMonth = parsePublicationYearMonth('2026-11')!
  if (which === 'one') {
    return {
      awardId: parseCanonicalMonthlyAwardId('card:monthly:2026-11:light-path')!,
      discoveryId: 'discovery:2026-11:light-path',
      earnedOn: parseLocalCalendarDate('2026-11-08')!,
      cardDocumentId: 'card-2026-11-light-path',
      earnedCard: {
        cardDocumentId: 'card-2026-11-light-path',
        title: 'A Light for the Path',
        publicationYearMonth: yearMonth,
        imageUrl: 'https://cdn.sanity.io/images/80016lrq/staging/card-light-path.png',
        assetRevision: 'v1',
        illustrationAlt: 'Hand-drawn oil lamp beside an open scroll',
        accessibleTranscription:
          'Psalm 119:105 (WEBP) — Your word is a lamp to my feet, and a light for my path.',
        scripture: {
          book: 'Psalms',
          reference: 'Psalm 119:105',
          translation: 'WEBP',
        },
        attribution: 'Alexis Waid / Bibleberry',
        rightsStatus: 'approved-ministry-use',
        shareEligible: true,
      },
    }
  }
  if (which === 'two') {
    return {
      awardId: parseCanonicalMonthlyAwardId('card:monthly:2026-11:bread-of-life')!,
      discoveryId: 'discovery:2026-11:bread-of-life',
      earnedOn: parseLocalCalendarDate('2026-11-09')!,
      cardDocumentId: 'card-2026-11-bread-of-life',
      earnedCard: {
        cardDocumentId: 'card-2026-11-bread-of-life',
        title: 'The Bread of Life',
        publicationYearMonth: yearMonth,
        imageUrl: 'https://cdn.sanity.io/images/80016lrq/staging/card-bread-of-life.png',
        assetRevision: 'v1',
        illustrationAlt: 'Hand-drawn basket of loaves',
        accessibleTranscription: 'John 6:35 (WEBP) — I am the bread of life.',
        scripture: {
          book: 'John',
          reference: 'John 6:35',
          translation: 'WEBP',
        },
        attribution: 'Alexis Waid / Bibleberry',
        rightsStatus: 'approved-ministry-use',
        shareEligible: true,
      },
    }
  }
  return {
    awardId: parseCanonicalMonthlyAwardId('card:monthly:2026-11:full-month')!,
    discoveryId: 'discovery:2026-11:full-month',
    earnedOn: parseLocalCalendarDate('2026-11-30')!,
  }
}

export function HubAnnouncementTestHarness() {
  const [surface, setSurfaceState] = useState<HubSurface>(readInitialSurface)
  const [largeText] = useState<boolean>(readLargeText)
  const [notebookEnabled] = useState<boolean>(readNotebookEnabled)
  const [notebookOpened, setNotebookOpened] = useState(false)
  const [newsDismissed, setNewsDismissed] = useState(false)
  const hubReturnButtonRef = useRef<HTMLButtonElement | null>(null)
  const participationSnapshot = useReaderParticipation(defaultGuestParticipationStore)
  const controller = useHubCardAnnouncements({ surface })

  const earnAward = (which: 'one' | 'two' | 'three') => {
    void defaultGuestParticipationStore.dispatch(
      createRecordEarnedAwardsCommand([makeAwardInput(which)]),
    )
  }

  const markAwardOneViewed = () => {
    void defaultGuestParticipationStore.dispatch({
      type: 'markEarnedCardViewed',
      awardId: parseCanonicalMonthlyAwardId('card:monthly:2026-11:light-path')!,
    })
  }

  const pendingCount = Object.values(participationSnapshot.data.earnedAwards).filter(
    award => !award.hubAnnouncementAcked,
  ).length

  return (
    <main className={`standard-page ${largeText ? 'reading-large' : ''}`}>
      <h1>Hub Card Announcement Harness</h1>
      <p data-testid="active-surface">Active surface: {surface}</p>
      <p data-testid="pending-count">Pending Hub announcements: {pendingCount}</p>
      {notebookOpened && <p data-testid="notebook-destination">Field Notebook Opened</p>}

      {surface === 'hub' && !newsDismissed && (
        <aside className="announcement-bar" aria-label="Ministry announcement">
          <div>
            <strong>MINISTRY NEWS</strong>
            <p>December preview teaching is available for advance reading.</p>
          </div>
          <div className="announcement-bar__links">
            <button
              type="button"
              className="button button--small"
              onClick={() => setNewsDismissed(true)}
            >
              Hide ministry news
            </button>
          </div>
        </aside>
      )}

      <nav aria-label="Harness surfaces" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBlock: '16px' }}>
        <button
          ref={hubReturnButtonRef}
          type="button"
          className="button button--secondary"
          onClick={() => setSurfaceState('hub')}
        >
          Arrive at Hub
        </button>
        <button type="button" className="button button--secondary" onClick={() => setSurfaceState('month')}>
          Go to Month Screen
        </button>
        <button type="button" className="button button--secondary" onClick={() => setSurfaceState('shelf')}>
          Go to Shelf
        </button>
        <button type="button" className="button button--secondary" onClick={() => setSurfaceState('library')}>
          Go to Library
        </button>
        <button type="button" className="button button--secondary" onClick={() => setSurfaceState('challenge')}>
          Go to Challenge
        </button>
      </nav>

      <section aria-label="Harness actions" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBlock: '16px' }}>
        <button type="button" className="button button--secondary" onClick={() => earnAward('one')}>
          Earn Award 1
        </button>
        <button type="button" className="button button--secondary" onClick={() => earnAward('two')}>
          Earn Award 2
        </button>
        <button type="button" className="button button--secondary" onClick={() => earnAward('three')}>
          Earn Award 3 (No Art)
        </button>
        <button type="button" className="button button--secondary" onClick={markAwardOneViewed}>
          Mark Award 1 Viewed
        </button>
      </section>

      <section className="settings-group" aria-label="Announcement preferences">
        <CardAnnouncementPreferenceControl
          enabled={controller.announcementsEnabled}
          disabled={!controller.preferencesReady}
          onToggle={next => {
            void controller.setAnnouncementsEnabled(next)
          }}
        />
      </section>

      <HubCardAnnouncementDialog
        isOpen={controller.isOpen}
        items={controller.items}
        ackStatus={controller.ackStatus}
        ackErrorMessage={controller.ackErrorMessage}
        onDismiss={() => {
          void controller.dismissAnnouncement()
        }}
        onRetryAcknowledge={() => {
          void controller.retryAcknowledge()
        }}
        onCloseAfterFailure={controller.closeAfterAckFailure}
        onOpenFieldNotebook={
          notebookEnabled
            ? () => {
                void controller.openFieldNotebook(() => {
                  setNotebookOpened(true)
                })
              }
            : undefined
        }
        returnFocusRef={hubReturnButtonRef}
      />
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HubAnnouncementTestHarness />
  </StrictMode>,
)
