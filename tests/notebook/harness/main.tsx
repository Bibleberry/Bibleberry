import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../../../src/index.css'
import '../../../src/App.css'
import { FieldNotebookHost } from '../../../src/components/notebook/FieldNotebookHost.tsx'
import { createRecordEarnedAwardsCommand } from '../../../src/participation/awards.ts'
import { defaultGuestParticipationStore } from '../../../src/participation/defaultGuestStore.ts'
import {
  parseCanonicalMonthlyAwardId,
  parseLocalCalendarDate,
  parsePublicationYearMonth,
  parseStoredChallengeId,
} from '../../../src/participation/identity.ts'
import type { EarnedAwardInput } from '../../../src/participation/types.ts'
import { useReaderParticipation } from '../../../src/participation/useReaderParticipation.ts'

function readQueryFlag(name: string): boolean {
  return new URLSearchParams(window.location.search).get(name) === '1'
}

function readReferenceYearMonth(): string {
  return new URLSearchParams(window.location.search).get('refMonth') ?? '2026-11'
}

function makeFixtureAwards(): readonly EarnedAwardInput[] {
  const ym2026 = parsePublicationYearMonth('2026-11')!
  const ym2024Feb = parsePublicationYearMonth('2024-02')!
  const ym2025Dec = parsePublicationYearMonth('2025-12')!
  const ym2026Jan = parsePublicationYearMonth('2026-01')!

  return [
    {
      awardId: parseCanonicalMonthlyAwardId('card:monthly:2026-11:light-path')!,
      discoveryId: 'discovery:2026-11:light-path',
      earnedOn: parseLocalCalendarDate('2026-11-08')!,
      cardDocumentId: 'card-2026-11-light-path',
      earnedCard: {
        cardDocumentId: 'card-2026-11-light-path',
        title: 'A Light for the Path',
        publicationYearMonth: ym2026,
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
        theologicalThemes: ['Guidance', 'Light'],
      },
    },
    {
      awardId: parseCanonicalMonthlyAwardId('card:monthly:2024-02:living-water')!,
      discoveryId: 'discovery:2024-02:living-water',
      earnedOn: parseLocalCalendarDate('2026-11-12')!,
      cardDocumentId: 'card-2024-02-living-water',
      earnedCard: {
        cardDocumentId: 'card-2024-02-living-water',
        title: 'Spring of Living Water',
        publicationYearMonth: ym2024Feb,
        imageUrl: 'https://cdn.sanity.io/images/80016lrq/staging/card-living-water.png',
        assetRevision: 'v1',
        illustrationAlt: 'Hand-drawn stone well with rippling water',
        accessibleTranscription:
          'John 4:14 (WEBP) — Whoever drinks of the water that I will give him will never thirst again.',
        scripture: {
          book: 'John',
          reference: 'John 4:14',
          translation: 'WEBP',
        },
        attribution: 'Alexis Waid / Bibleberry',
        rightsStatus: 'approved-ministry-use',
        shareEligible: true,
        theologicalThemes: ['Renewal', 'Guidance'],
      },
    },
    {
      awardId: parseCanonicalMonthlyAwardId('card:monthly:2025-12:advent-peace')!,
      discoveryId: 'discovery:2025-12:advent-peace',
      earnedOn: parseLocalCalendarDate('2025-12-24')!,
      cardDocumentId: 'card-2025-12-advent-peace',
      earnedCard: {
        cardDocumentId: 'card-2025-12-advent-peace',
        title: 'Prince of Peace',
        publicationYearMonth: ym2025Dec,
        imageUrl: 'https://cdn.sanity.io/images/80016lrq/staging/card-advent-peace.png',
        assetRevision: 'v1',
        illustrationAlt: 'Hand-drawn olive branch over Bethlehem hills',
        accessibleTranscription:
          'Isaiah 9:6 (WEBP) — His name will be called Wonderful Counselor, Mighty God, Everlasting Father, Prince of Peace.',
        scripture: {
          book: 'Isaiah',
          reference: 'Isaiah 9:6',
          translation: 'WEBP',
        },
        attribution: 'Alexis Waid / Bibleberry',
        rightsStatus: 'approved-ministry-use',
        shareEligible: true,
        theologicalThemes: ['Peace'],
      },
    },
    {
      awardId: parseCanonicalMonthlyAwardId('card:monthly:2026-01:new-mercies')!,
      discoveryId: 'discovery:2026-01:new-mercies',
      earnedOn: parseLocalCalendarDate('2026-01-19')!,
      cardDocumentId: 'card-2026-01-new-mercies',
      earnedCard: {
        cardDocumentId: 'card-2026-01-new-mercies',
        title: 'New Every Morning',
        publicationYearMonth: ym2026Jan,
        imageUrl: 'https://cdn.sanity.io/images/80016lrq/staging/card-new-mercies.png',
        assetRevision: 'v1',
        illustrationAlt: 'Hand-drawn sunrise above quiet hills',
        accessibleTranscription:
          'Lamentations 3:22-23 (WEBP) — They are new every morning. Great is your faithfulness.',
        scripture: {
          book: 'Lamentations',
          reference: 'Lamentations 3:22-23',
          translation: 'WEBP',
        },
        attribution: 'Alexis Waid / Bibleberry',
        rightsStatus: 'approved-ministry-use',
        shareEligible: true,
        theologicalThemes: ['Faithfulness'],
      },
    },
    {
      awardId: parseCanonicalMonthlyAwardId('card:monthly:2026-11:full-month')!,
      discoveryId: 'discovery:2026-11:full-month',
      earnedOn: parseLocalCalendarDate('2026-11-11')!,
    },
  ]
}

export function FieldNotebookTestHarness() {
  const [largeText] = useState(() => readQueryFlag('large'))
  const [referenceYearMonth] = useState(() => readReferenceYearMonth())
  const [openedSignalCount, setOpenedSignalCount] = useState(0)
  const snapshot = useReaderParticipation(defaultGuestParticipationStore)

  const seedFixtures = async () => {
    const ch1 = parseStoredChallengeId('cms:2026-11-day-01-doc', 'cms')!
    const ch2 = parseStoredChallengeId('cms:2024-02-day-14-doc', 'cms')!
    await defaultGuestParticipationStore.dispatch({
      type: 'completeChallenge',
      challengeId: ch1,
      completedOn: parseLocalCalendarDate('2026-11-08')!,
    })
    // Reread completion on same Challenge must not increment distinct count
    await defaultGuestParticipationStore.dispatch({
      type: 'completeChallenge',
      challengeId: ch1,
      completedOn: parseLocalCalendarDate('2026-11-09')!,
    })
    await defaultGuestParticipationStore.dispatch({
      type: 'completeChallenge',
      challengeId: ch2,
      completedOn: parseLocalCalendarDate('2026-11-12')!,
    })
    await defaultGuestParticipationStore.dispatch(
      createRecordEarnedAwardsCommand(makeFixtureAwards()),
    )
  }

  const clearStore = async () => {
    await defaultGuestParticipationStore.clearLocalData()
  }

  return (
    <main className={`standard-page ${largeText ? 'reading-large' : ''}`}>
      <header style={{ marginBottom: '20px', borderBottom: '1px solid var(--rule)', paddingBottom: '14px' }}>
        <h1>Field Notebook Integration Harness</h1>
        <p data-testid="opened-signal-count">Notebook opened signal count: {openedSignalCount}</p>
        <p data-testid="store-distinct-count">
          Store distinct completed count: {snapshot.distinctCompletedCount}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
          <button
            type="button"
            className="button button--secondary button--small"
            onClick={() => {
              void seedFixtures()
            }}
          >
            Seed Earned Awards &amp; Completions
          </button>
          <button
            type="button"
            className="button button--secondary button--small"
            onClick={() => {
              void clearStore()
            }}
          >
            Clear Guest Store
          </button>
        </div>
      </header>

      <FieldNotebookHost
        store={defaultGuestParticipationStore}
        referenceYearMonth={referenceYearMonth}
        onNotebookOpened={() => {
          setOpenedSignalCount(c => c + 1)
        }}
      />
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FieldNotebookTestHarness />
  </StrictMode>,
)
