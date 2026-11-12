import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../../../src/index.css'
import '../../../src/App.css'
import { SavedScriptureCollectionView } from '../../../src/components/savedScripture/SavedScriptureCollectionView.tsx'
import { SavedScriptureHost } from '../../../src/components/savedScripture/SavedScriptureHost.tsx'
import {
  projectSavedScripturesFromCandidates,
  type SavedScriptureCollectionItem,
} from '../../../src/components/savedScripture/savedScriptureCollectionModel.ts'
import { createRecordEarnedAwardsCommand } from '../../../src/participation/awards.ts'
import { defaultGuestParticipationStore } from '../../../src/participation/defaultGuestStore.ts'
import {
  parseCanonicalMonthlyAwardId,
  parseLocalCalendarDate,
  parsePublicationYearMonth,
  parseStoredChallengeId,
} from '../../../src/participation/identity.ts'
import { useReaderParticipation } from '../../../src/participation/useReaderParticipation.ts'

function readParams() {
  const params = new URLSearchParams(window.location.search)
  return {
    mode: params.get('mode') === 'pure' ? 'pure' : 'host',
    large: params.get('large') === '1',
    status:
      params.get('status') === 'loading'
        ? ('loading' as const)
        : params.get('status') === 'readError'
          ? ('readError' as const)
          : ('ready' as const),
    empty: params.get('empty') === '1',
  }
}

const SYNTHETIC_ITEMS = projectSavedScripturesFromCandidates([
  {
    reference: '1 Chronicles 16:8–36; Psalm 105:1–15',
    translation: 'New Revised Standard Version Updated Edition (NRSVue)',
    savedOn: '2026-11-10',
    sourceChallengeId: 'cms:challenge-nov-10',
  },
  {
    reference: '1 Thessalonians 5:16–18',
    translation: 'WEBP',
    savedOn: '2026-11-08',
    sourceChallengeId: 'cms:challenge-nov-08',
  },
  {
    reference: 'Psalm 23:1',
    translation: 'Not configured',
    savedOn: '2026-11-08',
  },
])

function PureFixtureHarness({
  large,
  status,
  empty,
}: {
  large: boolean
  status: 'loading' | 'ready' | 'readError'
  empty: boolean
}) {
  const [items, setItems] = useState<readonly SavedScriptureCollectionItem[]>(() =>
    empty ? [] : SYNTHETIC_ITEMS,
  )

  return (
    <main className={large ? 'reading-large' : ''}>
      <SavedScriptureCollectionView
        items={items}
        status={status}
        onRemoveItem={item => {
          setItems(prev => prev.filter(entry => entry.key !== item.key))
        }}
      />
    </main>
  )
}

function HostHarness({ large }: { large: boolean }) {
  const snapshot = useReaderParticipation(defaultGuestParticipationStore)
  const [exited, setExited] = useState(false)

  const seedSampleCollection = async () => {
    const c1 = parseStoredChallengeId('cms:challenge-nov-02')!
    const nov05 = parseLocalCalendarDate('2026-11-05')!
    const nov08 = parseLocalCalendarDate('2026-11-08')!
    const nov10 = parseLocalCalendarDate('2026-11-10')!

    await defaultGuestParticipationStore.dispatch({
      type: 'completeChallenge',
      challengeId: c1,
      completedOn: nov05,
    })
    await defaultGuestParticipationStore.dispatch(
      createRecordEarnedAwardsCommand([
        {
          awardId: parseCanonicalMonthlyAwardId('card:monthly:2026-11:light-path')!,
          discoveryId: 'discovery:2026-11:light-path',
          earnedOn: nov05,
          earnedCard: {
            cardDocumentId: 'card-light-path',
            title: 'A Light for the Path',
            publicationYearMonth: parsePublicationYearMonth('2026-11')!,
            imageUrl: 'https://cdn.sanity.io/images/80016lrq/staging/card.png',
            assetRevision: 'v1',
            illustrationAlt: 'Hand-drawn oil lamp',
            accessibleTranscription: 'Psalm 119:105',
            scripture: { book: 'Psalms', reference: 'Psalm 119:105', translation: 'WEBP' },
            attribution: 'Alexis Waid / Bibleberry',
            rightsStatus: 'approved-ministry-use',
            shareEligible: true,
          },
        },
      ]),
    )

    await defaultGuestParticipationStore.dispatch({
      type: 'setScriptureSaved',
      scripture: {
        reference: 'Psalm 23:1',
        translation: 'Not configured',
      },
      saved: true,
      savedOn: nov08,
    })
    await defaultGuestParticipationStore.dispatch({
      type: 'setScriptureSaved',
      scripture: {
        reference: '1 Thessalonians 5:16–18',
        translation: 'WEBP',
        sourceChallengeId: c1,
      },
      saved: true,
      savedOn: nov08,
    })
    await defaultGuestParticipationStore.dispatch({
      type: 'setScriptureSaved',
      scripture: {
        reference: 'Song of Solomon 2:1',
        translation: 'NIV',
        sourceChallengeId: c1,
      },
      saved: true,
      savedOn: nov05,
    })
    await defaultGuestParticipationStore.dispatch({
      type: 'setScriptureSaved',
      scripture: {
        reference: 'Éxodo 14:14',
        translation: 'RVR1960',
      },
      saved: true,
      savedOn: nov10,
    })
  }

  return (
    <main className={large ? 'reading-large' : ''}>
      <div
        className="standard-page"
        style={{ paddingBottom: 0, display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}
      >
        <button
          type="button"
          className="button button--secondary button--small"
          onClick={() => {
            void seedSampleCollection()
          }}
        >
          Seed V2 Guest Data
        </button>
        <span data-testid="completed-count">
          Completed: {Object.keys(snapshot.data.completedChallenges).length}
        </span>
        <span data-testid="awards-count">
          Awards: {Object.keys(snapshot.data.earnedAwards).length}
        </span>
        {exited && <span data-testid="exit-triggered">Exited</span>}
      </div>

      <SavedScriptureHost
        getToday={() => parseLocalCalendarDate('2026-11-12')!}
        onExit={() => setExited(true)}
        exitLabel="Back to Hub"
      />
    </main>
  )
}

export function SavedScriptureHarnessApp() {
  const params = readParams()
  if (params.mode === 'pure') {
    return <PureFixtureHarness large={params.large} status={params.status} empty={params.empty} />
  }
  return <HostHarness large={params.large} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SavedScriptureHarnessApp />
  </StrictMode>,
)
