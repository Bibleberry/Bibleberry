import { StrictMode, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../../../src/index.css'
import '../../../src/App.css'
import { createCardSharingService, type CardShareOutcome } from '../../../src/cardSharing/index.ts'
import { EarnedCardShareControl } from '../../../src/components/cardSharing/index.ts'
import { createRecordEarnedAwardsCommand } from '../../../src/participation/awards.ts'
import { defaultGuestParticipationStore } from '../../../src/participation/defaultGuestStore.ts'
import {
  parseCanonicalMonthlyAwardId,
  parseLocalCalendarDate,
  parsePublicationYearMonth,
} from '../../../src/participation/identity.ts'
import { useReaderParticipation } from '../../../src/participation/useReaderParticipation.ts'

const awardId = parseCanonicalMonthlyAwardId('card:monthly:2026-11:light-path')!

function makeTestCard(overrides: {
  readonly shareEligible?: boolean
  readonly rightsStatus?: string
} = {}) {
  return {
    cardDocumentId: 'card-2026-11-light-path',
    title: 'Lamp to My Feet',
    publicationYearMonth: parsePublicationYearMonth('2026-11')!,
    imageUrl: 'https://cdn.sanity.io/images/80016lrq/staging/card-light-path.png',
    assetRevision: 'v1',
    illustrationAlt: 'Hand-drawn oil lamp beside an open scroll',
    accessibleTranscription:
      'Your word is a lamp to my feet, and a light for my path.\n\nComplete theological explanation preserved in full.',
    scripture: {
      book: 'Psalms',
      reference: 'Psalm 119:105',
      translation: 'WEBP',
    },
    attribution: 'Alexis Waid / Bibleberry',
    rightsStatus: overrides.rightsStatus ?? 'approved-ministry-use',
    shareEligible: overrides.shareEligible ?? true,
    theologicalThemes: ['Guidance', 'Light'],
  }
}

export function CardSharingTestHarness() {
  const participation = useReaderParticipation(defaultGuestParticipationStore)
  const [lastOutcome, setLastOutcome] = useState<CardShareOutcome | null>(null)
  const shareService = useMemo(() => createCardSharingService(), [])

  const award = participation.data.earnedAwards[awardId]

  const seedCard = async (overrides: {
    readonly shareEligible?: boolean
    readonly rightsStatus?: string
  } = {}) => {
    await defaultGuestParticipationStore.clearLocalData()
    await defaultGuestParticipationStore.dispatch(
      createRecordEarnedAwardsCommand([
        {
          awardId,
          discoveryId: 'discovery:2026-11:light-path',
          earnedOn: parseLocalCalendarDate('2026-11-09')!,
          cardDocumentId: 'card-2026-11-light-path',
          earnedCard: makeTestCard(overrides),
        },
      ]),
    )
    setLastOutcome(null)
  }

  return (
    <main className="standard-page">
      <h1>Earned Scripture Card Sharing Test Harness</h1>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
        <button type="button" onClick={() => void seedCard()}>
          Seed shareable earned card
        </button>
        <button type="button" onClick={() => void seedCard({ shareEligible: false })}>
          Seed non-shareable card
        </button>
        <button type="button" onClick={() => void seedCard({ rightsStatus: 'Unverified' })}>
          Seed unverified-rights card
        </button>
      </div>

      {award && (
        <section aria-label="Earned card share control">
          <EarnedCardShareControl
            award={award}
            participationData={participation.data}
            shareService={shareService}
            onShareComplete={setLastOutcome}
          />
          <pre data-testid="award-flags">
            {JSON.stringify({
              earnedCount: Object.keys(participation.data.earnedAwards).length,
              cardViewed: award.cardViewed,
              hubAnnouncementAcked: award.hubAnnouncementAcked,
              earnedOn: award.earnedOn,
              imageUrl: award.earnedCard?.imageUrl,
            })}
          </pre>
          <pre data-testid="share-outcome">{JSON.stringify(lastOutcome)}</pre>
        </section>
      )}
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CardSharingTestHarness />
  </StrictMode>,
)
