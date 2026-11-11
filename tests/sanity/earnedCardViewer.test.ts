import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import type { MonthDiscoverySummary, MonthProgressData } from '../../src/cms/reader/monthProvider.ts'
import {
  formatEarnedCardDate,
  formatEarnedCardMonthHeading,
  getEarnedCardKindLabel,
  resolveValidatedCardSnapshot,
} from '../../src/components/cards/earnedCardViewerModel.ts'
import {
  resolveDurableDiscoveryAward,
  resolveMonthDiscoveryPresentations,
} from '../../src/components/month/monthScreenModel.ts'
import {
  parseCanonicalMonthlyAwardId,
  parseLocalCalendarDate,
  parsePublicationYearMonth,
} from '../../src/participation/identity.ts'
import { emptyReaderParticipationData, reduceParticipationCommand } from '../../src/participation/model.ts'
import type {
  EarnedAwardRecord,
  EarnedScriptureCardSnapshot,
  ReaderParticipationData,
} from '../../src/participation/types.ts'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

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
    accessibleTranscription: 'Psalm 119:105 (WEBP) — Your word is a lamp to my feet, and a light for my path.',
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

test('only durably stored, month-matched, canonical award snapshots become viewable', () => {
  const summaries: MonthDiscoverySummary[] = [
    {
      discoveryId: 'discovery:2026-11:full-month',
      kind: 'fullMonth',
      title: 'Walk Through November',
      targetCount: 30,
    },
    {
      discoveryId: 'discovery:2026-11:light-path',
      kind: 'thematic',
      title: 'Lamp and Light',
      targetCount: 2,
    },
  ]

  const provisionalProgress: MonthProgressData = {
    monthId: '2026-11',
    rosterVersion: 1,
    completedInMonthCount: 2,
    totalChallenges: 30,
    thematicEarnedCount: 1,
    thematicTotalCount: 1,
    discoveries: [
      {
        discoveryId: 'discovery:2026-11:full-month',
        kind: 'fullMonth',
        title: 'Walk Through November',
        achievedCount: 2,
        targetCount: 30,
        isEarned: false,
      },
      {
        discoveryId: 'discovery:2026-11:light-path',
        kind: 'thematic',
        title: 'Lamp and Light',
        achievedCount: 2,
        targetCount: 2,
        isEarned: true,
        awardId: 'card:monthly:2026-11:light-path',
        reservedCardId: 'card-2026-11-light-path',
        earnedCard: makeCardSnapshot(),
      },
    ],
  }

  // 1. Provisional gateway progress WITHOUT durable store admission must NOT expose viewable Card art
  const provisionalOnly = resolveMonthDiscoveryPresentations(
    summaries,
    provisionalProgress,
    '2026-11',
    emptyReaderParticipationData(),
  )
  assert.equal(provisionalOnly[0].discoveryId, 'discovery:2026-11:light-path')
  assert.equal(provisionalOnly[0].hasStoredAward, false)
  assert.equal(provisionalOnly[0].hasCardDisplay, false)
  assert.equal(provisionalOnly[0].earnedCard, undefined)
  assert.equal(provisionalOnly[0].awardId, undefined)

  // 2. Durable stored award unlocks viewable Card and preserves full-month last
  const storedRecord = makeAwardRecord()
  const storedData: ReaderParticipationData = {
    ...emptyReaderParticipationData(),
    earnedAwards: {
      [storedRecord.awardId]: storedRecord,
    },
  }
  const admitted = resolveMonthDiscoveryPresentations(
    summaries,
    provisionalProgress,
    '2026-11',
    storedData,
  )
  assert.equal(admitted[0].discoveryId, 'discovery:2026-11:light-path')
  assert.equal(admitted[0].isEarned, true)
  assert.equal(admitted[0].hasStoredAward, true)
  assert.equal(admitted[0].hasCardDisplay, true)
  assert.equal(admitted[0].awardId, storedRecord.awardId)
  assert.equal(admitted[0].earnedOn, '2026-11-09')
  assert.equal(admitted[0].cardViewed, false)
  assert.equal(admitted[0].earnedCard?.imageUrl, storedRecord.earnedCard?.imageUrl)

  assert.equal(admitted[1].kind, 'fullMonth')
  assert.equal(admitted[1].isEarned, false)
  assert.equal(admitted[1].hasStoredAward, false)
  assert.equal(admitted[1].hasCardDisplay, false)
  assert.equal(admitted[1].earnedCard, undefined)
})

test('rejects mismatched months, mismatched discovery/document IDs, and invalid artwork URLs', () => {
  const summaries: MonthDiscoverySummary[] = [
    {
      discoveryId: 'discovery:2026-11:light-path',
      kind: 'thematic',
      title: 'Lamp and Light',
      targetCount: 2,
    },
  ]

  // Cross-month snapshot inside 2026-11 award record
  const crossMonthAward = makeAwardRecord({
    earnedCard: makeCardSnapshot({ publicationYearMonth: parsePublicationYearMonth('2026-10')! }),
  })
  const crossMonthResult = resolveMonthDiscoveryPresentations(
    summaries,
    null,
    '2026-11',
    {
      ...emptyReaderParticipationData(),
      earnedAwards: { [crossMonthAward.awardId]: crossMonthAward },
    },
  )
  assert.equal(crossMonthResult[0].isEarned, true)
  assert.equal(crossMonthResult[0].hasStoredAward, true)
  assert.equal(crossMonthResult[0].hasCardDisplay, false)
  assert.equal(crossMonthResult[0].earnedCard, undefined)

  // Query-string / untrusted host image URL fails closed
  const untrustedUrlAward = makeAwardRecord({
    earnedCard: makeCardSnapshot({
      imageUrl: 'https://cdn.sanity.io/images/80016lrq/staging/card.png?w=200',
    }),
  })
  assert.equal(
    resolveDurableDiscoveryAward(
      {
        ...emptyReaderParticipationData(),
        earnedAwards: { [untrustedUrlAward.awardId]: untrustedUrlAward },
      },
      'discovery:2026-11:light-path',
      'thematic',
      '2026-11',
    )?.validatedCard,
    null,
  )

  // Mismatched cardDocumentId fails closed
  const mismatchedDocAward = makeAwardRecord({
    cardDocumentId: 'card-2026-11-different-card',
    earnedCard: makeCardSnapshot({ cardDocumentId: 'card-2026-11-light-path' }),
  })
  assert.equal(
    resolveDurableDiscoveryAward(
      {
        ...emptyReaderParticipationData(),
        earnedAwards: { [mismatchedDocAward.awardId]: mismatchedDocAward },
      },
      'discovery:2026-11:light-path',
      'thematic',
      '2026-11',
    )?.validatedCard,
    null,
  )

  // Mismatched discoveryId on stored award rejects the entire record for this discovery
  const mismatchedDiscoveryAward = makeAwardRecord({
    discoveryId: 'discovery:2026-11:other-theme',
  })
  assert.equal(
    resolveDurableDiscoveryAward(
      {
        ...emptyReaderParticipationData(),
        earnedAwards: { [mismatchedDiscoveryAward.awardId]: mismatchedDiscoveryAward },
      },
      'discovery:2026-11:light-path',
      'thematic',
      '2026-11',
    ),
    null,
  )
})

test('preserves stored earned artwork across network failure, stale gateway progress, and multiple distinct cards', () => {
  const summaries: MonthDiscoverySummary[] = [
    {
      discoveryId: 'discovery:2026-11:full-month',
      kind: 'fullMonth',
      title: 'Walk Through November',
      targetCount: 30,
    },
    {
      discoveryId: 'discovery:2026-11:light-path',
      kind: 'thematic',
      title: 'Lamp and Light',
      targetCount: 2,
    },
    {
      discoveryId: 'discovery:2026-11:bread-of-life',
      kind: 'thematic',
      title: 'Daily Bread',
      targetCount: 3,
    },
  ]

  const lightAward = makeAwardRecord()
  const breadAwardId = parseCanonicalMonthlyAwardId('card:monthly:2026-11:bread-of-life')!
  const breadAward = makeAwardRecord({
    awardId: breadAwardId,
    discoveryId: 'discovery:2026-11:bread-of-life',
    cardDocumentId: 'card-2026-11-bread-of-life',
    earnedCard: makeCardSnapshot({
      cardDocumentId: 'card-2026-11-bread-of-life',
      title: 'The Bread of Life',
      imageUrl: 'https://cdn.sanity.io/images/80016lrq/staging/card-bread-of-life.png',
      illustrationAlt: 'Hand-drawn basket of barley loaves',
      accessibleTranscription: 'John 6:35 (WEBP) — I am the bread of life.',
      scripture: {
        book: 'John',
        reference: 'John 6:35',
        translation: 'WEBP',
      },
    }),
  })

  const participationData: ReaderParticipationData = {
    ...emptyReaderParticipationData(),
    earnedAwards: {
      [lightAward.awardId]: lightAward,
      [breadAward.awardId]: breadAward,
    },
  }

  // Network failure (progress = null): both stored cards remain viewable with zero cross-ID confusion
  const offlinePresentations = resolveMonthDiscoveryPresentations(
    summaries,
    null,
    '2026-11',
    participationData,
  )
  assert.equal(offlinePresentations.length, 3)
  assert.equal(offlinePresentations[0].discoveryId, 'discovery:2026-11:light-path')
  assert.equal(offlinePresentations[0].earnedCard?.title, 'Lamp to My Feet')
  assert.equal(offlinePresentations[0].earnedCard?.imageUrl, lightAward.earnedCard?.imageUrl)
  assert.equal(offlinePresentations[1].discoveryId, 'discovery:2026-11:bread-of-life')
  assert.equal(offlinePresentations[1].earnedCard?.title, 'The Bread of Life')
  assert.equal(offlinePresentations[1].earnedCard?.imageUrl, breadAward.earnedCard?.imageUrl)
  assert.equal(offlinePresentations[2].kind, 'fullMonth')
  assert.equal(offlinePresentations[2].hasCardDisplay, false)

  // Marking only lightAward viewed leaves breadAward unviewed, preserves earnedOn and hubAnnouncementAcked=false
  const afterView = reduceParticipationCommand(participationData, {
    type: 'markEarnedCardViewed',
    awardId: lightAward.awardId,
  })
  assert.equal(afterView.earnedAwards[lightAward.awardId].cardViewed, true)
  assert.equal(afterView.earnedAwards[lightAward.awardId].hubAnnouncementAcked, false)
  assert.equal(afterView.earnedAwards[lightAward.awardId].earnedOn, '2026-11-09')
  assert.equal(afterView.earnedAwards[breadAward.awardId].cardViewed, false)
  assert.equal(afterView.earnedAwards[breadAward.awardId].hubAnnouncementAcked, false)
})

test('earnedCardViewerModel validates snapshots and formats dates in UTC without timezone shift', () => {
  const valid = makeCardSnapshot()
  assert.equal(resolveValidatedCardSnapshot(valid)?.cardDocumentId, valid.cardDocumentId)

  const invalidAltEqualsTranscription = makeCardSnapshot({
    illustrationAlt: 'Same text',
    accessibleTranscription: 'Same text',
  })
  assert.equal(resolveValidatedCardSnapshot(invalidAltEqualsTranscription), null)

  const invalidScheme = makeCardSnapshot({
    imageUrl: 'http://cdn.sanity.io/images/80016lrq/staging/card.png',
  })
  assert.equal(resolveValidatedCardSnapshot(invalidScheme), null)

  assert.equal(formatEarnedCardMonthHeading('2026-11'), 'November 2026')
  assert.equal(formatEarnedCardDate(parseLocalCalendarDate('2026-11-01')!), 'November 1, 2026')
  assert.equal(formatEarnedCardDate(undefined), null)
  assert.equal(getEarnedCardKindLabel('thematic'), 'Thematic Scripture Card')
  assert.equal(getEarnedCardKindLabel('fullMonth'), 'Full-Month Scripture Card')
})

test('EarnedScriptureCardViewer and Month Screen viewer bridge enforce network/storage/announcement boundaries', () => {
  const viewerFile = resolve(repositoryRoot, 'src/components/cards/EarnedScriptureCardViewer.tsx')
  const viewerSource = readFileSync(viewerFile, 'utf8')
  const viewerAst = ts.createSourceFile(viewerFile, viewerSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const viewerExecutable = ts.createPrinter({ removeComments: true }).printFile(viewerAst)

  assert.doesNotMatch(viewerExecutable, /\bfetch\s*\(/)
  assert.doesNotMatch(viewerExecutable, /\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/)
  assert.doesNotMatch(viewerExecutable, /acknowledgeAwardAnnouncements|markEarnedCardViewed/)
  assert.doesNotMatch(viewerExecutable, /import\.meta\.env/)

  for (const monthFile of [
    'src/components/month/MonthScreenHost.tsx',
    'src/components/month/MonthScreenView.tsx',
    'src/components/month/monthScreenModel.ts',
  ]) {
    const source = readFileSync(resolve(repositoryRoot, monthFile), 'utf8')
    const ast = ts.createSourceFile(monthFile, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const executable = ts.createPrinter({ removeComments: true }).printFile(ast)
    assert.doesNotMatch(
      executable,
      /acknowledgeAwardAnnouncements/,
      `${monthFile} must never dispatch or reference acknowledgeAwardAnnouncements`,
    )
  }
})
