import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CardShareError,
  createCardSharingService,
  evaluateCardShareEligibility,
  type CardImageExporter,
  type CardSharePlatformAdapter,
} from '../../src/cardSharing/index.ts'
import {
  parseCanonicalMonthlyAwardId,
  parseLocalCalendarDate,
  parsePublicationYearMonth,
} from '../../src/participation/identity.ts'
import { emptyReaderParticipationData } from '../../src/participation/model.ts'
import type {
  EarnedAwardRecord,
  EarnedScriptureCardSnapshot,
  ReaderParticipationData,
} from '../../src/participation/types.ts'

function makeCardSnapshot(
  overrides: Partial<EarnedScriptureCardSnapshot> = {},
): EarnedScriptureCardSnapshot {
  return {
    cardDocumentId: 'card-2026-11-light-path',
    title: 'Lamp to My Feet',
    publicationYearMonth: parsePublicationYearMonth('2026-11')!,
    imageUrl: 'https://cdn.sanity.io/images/80016lrq/staging/card-light-path.png',
    assetRevision: 'v1',
    illustrationAlt: 'Hand-drawn oil lamp beside an open scroll',
    accessibleTranscription:
      'Paragraph 1: Your word is a lamp to my feet, and a light for my path.\n\nParagraph 2: Complete theological explanation preserved in full without truncation.',
    scripture: {
      book: 'Psalms',
      reference: 'Psalm 119:105',
      translation: 'WEBP',
    },
    attribution: 'Alexis Waid / Bibleberry',
    rightsStatus: 'approved-ministry-use',
    shareEligible: true,
    theologicalThemes: ['Guidance', 'Light'],
    ...overrides,
  }
}

function makeAwardRecord(overrides: Partial<EarnedAwardRecord> = {}): EarnedAwardRecord {
  const awardId = parseCanonicalMonthlyAwardId('card:monthly:2026-11:light-path')!
  return {
    awardId,
    kind: 'thematic',
    publicationYearMonth: parsePublicationYearMonth('2026-11')!,
    discoveryId: 'discovery:2026-11:light-path',
    earnedOn: parseLocalCalendarDate('2026-11-09')!,
    hubAnnouncementAcked: false,
    cardViewed: false,
    cardDocumentId: 'card-2026-11-light-path',
    earnedCard: makeCardSnapshot(),
    ...overrides,
  }
}

function makeParticipationWithAward(award: EarnedAwardRecord): ReaderParticipationData {
  const base = emptyReaderParticipationData()
  return {
    ...base,
    earnedAwards: {
      [award.awardId]: award,
    },
  }
}

function makeStubExporter(): CardImageExporter {
  return {
    async exportCardImage(card) {
      return {
        blob: new Blob(['exported-png-bytes'], { type: 'image/png' }),
        mimeType: 'image/png',
        fileName: `${card.cardDocumentId}-bibleberry.png`,
        width: 800,
        height: 1050,
        attributionApplied: 'export-only',
        sourceImageUrl: card.imageUrl,
      }
    },
  }
}

function makeStubPlatform(
  overrides: Partial<CardSharePlatformAdapter> = {},
): CardSharePlatformAdapter {
  return {
    canShareFiles: () => true,
    async webShare() {},
    async downloadFile() {},
    ...overrides,
  }
}

test('rejects unearned awards when participationData does not contain the award', async () => {
  const award = makeAwardRecord()
  const emptyParticipation = emptyReaderParticipationData()
  const service = createCardSharingService({
    exporter: makeStubExporter(),
    platform: makeStubPlatform(),
  })

  const eligibility = evaluateCardShareEligibility({
    award,
    participationData: emptyParticipation,
  })
  assert.equal(eligibility.eligible, false)
  if (!eligibility.eligible) {
    assert.equal(eligibility.code, 'not-earned')
  }

  const outcome = await service.shareEarnedCard({
    award,
    participationData: emptyParticipation,
  })
  assert.equal(outcome.status, 'failed')
  if (outcome.status === 'failed') {
    assert.equal(outcome.code, 'not-earned')
  }
})

test('rejects cards marked shareEligible: false and restricted rightsStatus values', async () => {
  const service = createCardSharingService({
    exporter: makeStubExporter(),
    platform: makeStubPlatform(),
  })

  const nonShareableAward = makeAwardRecord({
    earnedCard: makeCardSnapshot({ shareEligible: false }),
  })
  const nonShareableResult = await service.shareEarnedCard({
    award: nonShareableAward,
    participationData: makeParticipationWithAward(nonShareableAward),
  })
  assert.equal(nonShareableResult.status, 'failed')
  if (nonShareableResult.status === 'failed') {
    assert.equal(nonShareableResult.code, 'not-share-eligible')
  }

  for (const restrictedRights of [
    'Unverified',
    'Restricted — do not share',
    'Synthetic test asset only',
    'test-only',
  ]) {
    const restrictedAward = makeAwardRecord({
      earnedCard: makeCardSnapshot({ rightsStatus: restrictedRights }),
    })
    const result = await service.shareEarnedCard({
      award: restrictedAward,
      participationData: makeParticipationWithAward(restrictedAward),
    })
    assert.equal(result.status, 'failed', `Expected rejection for rightsStatus="${restrictedRights}"`)
    if (result.status === 'failed') {
      assert.equal(result.code, 'rights-restricted')
    }
  }
})

test('rejects unauthorized asset URLs and mismatched cardDocumentId', async () => {
  const service = createCardSharingService({
    exporter: makeStubExporter(),
    platform: makeStubPlatform(),
  })

  const unauthorizedUrlAward = makeAwardRecord({
    earnedCard: makeCardSnapshot({
      imageUrl: 'https://evil.example.com/images/80016lrq/staging/card.png',
    }),
  })
  const urlResult = await service.shareEarnedCard({
    award: unauthorizedUrlAward,
    participationData: makeParticipationWithAward(unauthorizedUrlAward),
  })
  assert.equal(urlResult.status, 'failed')
  if (urlResult.status === 'failed') {
    assert.equal(urlResult.code, 'invalid-card-snapshot')
  }

  const mismatchedIdAward = makeAwardRecord({
    cardDocumentId: 'card-2026-11-other',
    earnedCard: makeCardSnapshot({
      cardDocumentId: 'card-2026-11-light-path',
    }),
  })
  const idResult = await service.shareEarnedCard({
    award: mismatchedIdAward,
    participationData: makeParticipationWithAward(mismatchedIdAward),
  })
  assert.equal(idResult.status, 'failed')
  if (idResult.status === 'failed') {
    assert.equal(idResult.code, 'not-earned')
  }
})

test('preserves complete theological explanation, Scripture reference, and attribution without mutating original card', async () => {
  const award = makeAwardRecord()
  const participation = makeParticipationWithAward(award)
  const originalSnapshot = structuredClone(participation)
  let sharedInput: { title: string; text: string; files: readonly File[] } | null = null

  const service = createCardSharingService({
    exporter: makeStubExporter(),
    platform: makeStubPlatform({
      canShareFiles: () => true,
      async webShare(input) {
        sharedInput = input
      },
    }),
  })

  const outcome = await service.shareEarnedCard({
    award,
    participationData: participation,
  })

  assert.equal(outcome.status, 'shared')
  if (outcome.status === 'shared') {
    assert.equal(outcome.method, 'web-share')
    assert.ok(outcome.payload.shareText.includes(award.earnedCard!.accessibleTranscription))
    assert.ok(outcome.payload.shareText.includes('Psalm 119:105 (WEBP · Psalms)'))
    assert.ok(outcome.payload.shareText.includes('Attribution: Alexis Waid / Bibleberry'))
    assert.ok(outcome.payload.shareText.includes('Shared from Bibleberry'))
  }

  assert.ok(sharedInput !== null)
  assert.equal((sharedInput as { files: readonly File[] }).files.length, 1)
  assert.deepEqual(participation, originalSnapshot)
})

test('never silently exports incomplete or empty image payloads', async () => {
  const award = makeAwardRecord()
  const emptyBlobExporter: CardImageExporter = {
    async exportCardImage(card) {
      return {
        blob: new Blob([], { type: 'image/png' }),
        mimeType: 'image/png',
        fileName: 'empty.png',
        width: 800,
        height: 1000,
        attributionApplied: 'export-only',
        sourceImageUrl: card.imageUrl,
      }
    },
  }

  const service = createCardSharingService({
    exporter: emptyBlobExporter,
    platform: makeStubPlatform(),
  })

  const outcome = await service.shareEarnedCard({ award })
  assert.equal(outcome.status, 'failed')
  if (outcome.status === 'failed') {
    assert.equal(outcome.code, 'incomplete-content')
  }
})

test('supports download fallback, native share hook, cancellation, unavailable asset, and permission failures', async () => {
  const award = makeAwardRecord()

  // 1. Download fallback when Web Share file sharing is unavailable
  let downloadedFileName = ''
  const downloadService = createCardSharingService({
    exporter: makeStubExporter(),
    platform: makeStubPlatform({
      canShareFiles: () => false,
      async downloadFile(fileName) {
        downloadedFileName = fileName
      },
    }),
  })
  const downloadOutcome = await downloadService.shareEarnedCard({ award })
  assert.equal(downloadOutcome.status, 'downloaded')
  assert.equal(downloadedFileName, 'card-2026-11-light-path-bibleberry.png')

  // 2. Native share hook precedence
  const nativeService = createCardSharingService({
    exporter: makeStubExporter(),
    platform: makeStubPlatform({
      async nativeShare() {
        return 'shared'
      },
    }),
  })
  const nativeOutcome = await nativeService.shareEarnedCard({ award })
  assert.equal(nativeOutcome.status, 'shared')
  if (nativeOutcome.status === 'shared') {
    assert.equal(nativeOutcome.method, 'native-share')
  }

  // 3. Cancellation via AbortError
  const cancelService = createCardSharingService({
    exporter: makeStubExporter(),
    platform: makeStubPlatform({
      async webShare() {
        throw new DOMException('Share cancelled', 'AbortError')
      },
    }),
  })
  const cancelOutcome = await cancelService.shareEarnedCard({ award })
  assert.equal(cancelOutcome.status, 'cancelled')

  // 4. Permission denied via NotAllowedError
  const permissionService = createCardSharingService({
    exporter: makeStubExporter(),
    platform: makeStubPlatform({
      async webShare() {
        throw new DOMException('Permission denied', 'NotAllowedError')
      },
    }),
  })
  const permissionOutcome = await permissionService.shareEarnedCard({ award })
  assert.equal(permissionOutcome.status, 'failed')
  if (permissionOutcome.status === 'failed') {
    assert.equal(permissionOutcome.code, 'permission-denied')
  }

  // 5. Unavailable asset
  const unavailableService = createCardSharingService({
    exporter: {
      async exportCardImage() {
        throw new CardShareError('unavailable-asset', 'Asset 404')
      },
    },
    platform: makeStubPlatform(),
  })
  const unavailableOutcome = await unavailableService.shareEarnedCard({ award })
  assert.equal(unavailableOutcome.status, 'failed')
  if (unavailableOutcome.status === 'failed') {
    assert.equal(unavailableOutcome.code, 'unavailable-asset')
  }
})

test('repeated sharing succeeds identically without changing awards or progress', async () => {
  const award = makeAwardRecord()
  const participation = makeParticipationWithAward(award)
  const snapshotBefore = structuredClone(participation)
  let shareCalls = 0

  const service = createCardSharingService({
    exporter: makeStubExporter(),
    platform: makeStubPlatform({
      async webShare() {
        shareCalls += 1
      },
    }),
  })

  const first = await service.shareEarnedCard({ award, participationData: participation })
  const second = await service.shareEarnedCard({ award, participationData: participation })
  const third = await service.shareEarnedCard({ award, participationData: participation })

  assert.equal(first.status, 'shared')
  assert.equal(second.status, 'shared')
  assert.equal(third.status, 'shared')
  assert.equal(shareCalls, 3)
  assert.deepEqual(participation, snapshotBefore)
})
