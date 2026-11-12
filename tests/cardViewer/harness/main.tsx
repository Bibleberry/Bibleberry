import { StrictMode, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../../../src/index.css'
import '../../../src/App.css'
import { EarnedScriptureCardViewer } from '../../../src/components/cards/EarnedScriptureCardViewer.tsx'
import { createRecordEarnedAwardsCommand } from '../../../src/participation/awards.ts'
import { defaultGuestParticipationStore } from '../../../src/participation/defaultGuestStore.ts'
import {
  parseCanonicalMonthlyAwardId,
  parseLocalCalendarDate,
  parsePublicationYearMonth,
} from '../../../src/participation/identity.ts'
import { useReaderParticipation } from '../../../src/participation/useReaderParticipation.ts'

const awardId = parseCanonicalMonthlyAwardId('card:monthly:2026-11:long-explanation')!
const cardTitle = `Long Earning Card Title ${'T'.repeat(90)}`
const testParagraphs = Array.from(
  { length: 14 },
  (_, index) =>
    `Test-only explanatory paragraph ${index + 1}. This repeated fixture text is not publication content.`,
).join('\n\n')

const earnedCard = {
  cardDocumentId: 'card-2026-11-long-explanation',
  title: cardTitle,
  publicationYearMonth: parsePublicationYearMonth('2026-11')!,
  imageUrl: 'https://cdn.sanity.io/images/80016lrq/staging/card-long-explanation.png',
  assetRevision: 'v1',
  illustrationAlt: 'Test fixture illustration of a book beside a lamp',
  accessibleTranscription: testParagraphs,
  scripture: {
    book: 'Long Test Book Title',
    reference: `Extended test reference ${'R'.repeat(90)}`,
    translation: 'TEST',
  },
  attribution: 'Bibleberry browser test fixture',
  rightsStatus: 'test-only',
  shareEligible: false,
  theologicalThemes: [`Long test theme ${'M'.repeat(90)}`],
}

export function CardViewerTestHarness() {
  const participation = useReaderParticipation(defaultGuestParticipationStore)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const award = participation.data.earnedAwards[awardId]

  const seedEarnedCard = async () => {
    await defaultGuestParticipationStore.clearLocalData()
    await defaultGuestParticipationStore.dispatch(
      createRecordEarnedAwardsCommand([
        {
          awardId,
          discoveryId: 'discovery:2026-11:long-explanation',
          earnedOn: parseLocalCalendarDate('2026-11-09')!,
          cardDocumentId: earnedCard.cardDocumentId,
          earnedCard,
        },
      ]),
    )
  }

  return (
    <main className="standard-page">
      <h1>Earned Card Viewer Test Harness</h1>
      <button type="button" onClick={() => void seedEarnedCard()}>
        Seed durable earned test card
      </button>
      {award && (
        <>
          <p
            data-testid="stored-award-flags"
            data-card-viewed={String(award.cardViewed)}
            data-hub-announcement-acked={String(award.hubAnnouncementAcked)}
          >
            Durable test award
          </p>
          {award.earnedCard && (
            <button
              ref={triggerRef}
              type="button"
              aria-label={`Open Scripture Card: ${award.earnedCard.title}`}
              onClick={() => setIsOpen(true)}
            >
              Open earned card
            </button>
          )}
        </>
      )}
      {isOpen && award?.earnedCard && (
        <EarnedScriptureCardViewer
          card={award.earnedCard}
          earnedOn={award.earnedOn}
          kind={award.kind}
          discoveryTitle="Long test discovery"
          returnFocusRef={triggerRef}
          onClose={() => setIsOpen(false)}
        />
      )}
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CardViewerTestHarness />
  </StrictMode>,
)
