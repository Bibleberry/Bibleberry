import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import {
  buildNotebookCollectionProjection,
  buildNotebookYearEntries,
  collectAvailableCuratedThemes,
  daysInCivilMonth,
  filterNotebookCards,
  getAdjacentPublicationYearMonth,
  projectValidatedEarnedAwards,
  selectNotebookCardsForMonth,
} from '../../src/components/notebook/fieldNotebookModel.ts'
import { createRecordEarnedAwardsCommand } from '../../src/participation/awards.ts'
import {
  parseCanonicalMonthlyAwardId,
  parseLocalCalendarDate,
  parsePublicationYearMonth,
  parseStoredChallengeId,
} from '../../src/participation/identity.ts'
import {
  emptyReaderParticipationData,
  reduceParticipationCommand,
} from '../../src/participation/model.ts'
import {
  createEnvelopePersistenceAdapter,
  type KeyValueStorageDriver,
} from '../../src/participation/persistence.ts'
import { createReaderParticipationStore } from '../../src/participation/store.ts'
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
    ...overrides,
  }
}

function makeAwardRecord(
  yearMonth: string,
  slug: string,
  earnedOn: string,
  overrides: Partial<EarnedAwardRecord> = {},
): EarnedAwardRecord {
  const awardId = parseCanonicalMonthlyAwardId(`card:monthly:${yearMonth}:${slug}`)!
  const ym = parsePublicationYearMonth(yearMonth)!
  return {
    awardId,
    kind: slug === 'full-month' ? 'fullMonth' : 'thematic',
    publicationYearMonth: ym,
    discoveryId: `discovery:${yearMonth}:${slug}`,
    earnedOn: parseLocalCalendarDate(earnedOn)!,
    hubAnnouncementAcked: false,
    cardViewed: false,
    cardDocumentId: `card-${yearMonth}-${slug}`,
    earnedCard: makeCardSnapshot({
      cardDocumentId: `card-${yearMonth}-${slug}`,
      publicationYearMonth: ym,
    }),
    ...overrides,
  }
}

function makeMemoryDriver(): KeyValueStorageDriver {
  const backing = new Map<string, string>()
  return {
    getItem: key => backing.get(key) ?? null,
    setItem: (key, value) => {
      backing.set(key, value)
    },
    removeItem: key => {
      backing.delete(key)
    },
  }
}

test('zero awards yields an empty earned-only collection and relevant reference year', () => {
  const data = emptyReaderParticipationData()
  const projection = buildNotebookCollectionProjection(data, {
    referenceYearMonth: '2026-11',
  })

  assert.equal(projection.allEarnedCards.length, 0)
  assert.deepEqual(projection.availableThemes, [])
  assert.deepEqual(projection.relevantYears, [2026])
  assert.equal(projection.lifetime.distinctCompletedChallenges, 0)
  assert.equal(projection.lifetime.earnedCardCount, 0)
  assert.equal(projection.lifetime.unviewedCardCount, 0)
  assert.equal(projection.lifetime.headline, '0 Distinct Challenges Completed')

  const entries = buildNotebookYearEntries(projection.allEarnedCards, 2026, {
    referenceYearMonth: '2026-11',
  })
  assert.equal(entries.length, 12)
  assert.equal(entries[10].yearMonth, '2026-11')
  assert.equal(entries[10].status, 'empty')
  assert.equal(entries[10].isFutureOrUnpublished, false)
  assert.equal(entries[11].yearMonth, '2026-12')
  assert.equal(entries[11].status, 'comingSoon')
  assert.equal(entries[11].isFutureOrUnpublished, true)
  assert.deepEqual(entries[11].cards, [])
})

test('preserves publication-month identity distinct from late-earned dates and orders All Earned Cards newest-first', () => {
  const feb2024Award = makeAwardRecord('2024-02', 'living-water', '2026-11-12', {
    earnedCard: makeCardSnapshot({
      cardDocumentId: 'card-2024-02-living-water',
      title: 'Spring of Living Water',
      publicationYearMonth: parsePublicationYearMonth('2024-02')!,
      imageUrl: 'https://cdn.sanity.io/images/80016lrq/staging/card-living-water.png',
      scripture: { book: 'John', reference: 'John 4:14', translation: 'WEBP' },
      theologicalThemes: ['Renewal', 'Grace'],
    }),
  })
  const nov2026Early = makeAwardRecord('2026-11', 'bread-of-life', '2026-11-08', {
    earnedCard: makeCardSnapshot({
      cardDocumentId: 'card-2026-11-bread-of-life',
      title: 'The Bread of Life',
      publicationYearMonth: parsePublicationYearMonth('2026-11')!,
      imageUrl: 'https://cdn.sanity.io/images/80016lrq/staging/card-bread-of-life.png',
      scripture: { book: 'John', reference: 'John 6:35', translation: 'WEBP' },
      theologicalThemes: ['Provision'],
    }),
  })
  // Same earnedOn date as feb2024Award to verify canonical awardId ascending tie-breaker
  const nov2026Alpha = makeAwardRecord('2026-11', 'alpha-anchor', '2026-11-12', {
    earnedCard: makeCardSnapshot({
      cardDocumentId: 'card-2026-11-alpha-anchor',
      title: 'Anchor for the Soul',
      publicationYearMonth: parsePublicationYearMonth('2026-11')!,
      imageUrl: 'https://cdn.sanity.io/images/80016lrq/staging/card-alpha-anchor.png',
      scripture: { book: 'Hebrews', reference: 'Hebrews 6:19', translation: 'WEBP' },
      theologicalThemes: ['Hope'],
    }),
  })
  const nov2026Full = makeAwardRecord('2026-11', 'full-month', '2026-11-12', {
    earnedCard: makeCardSnapshot({
      cardDocumentId: 'card-2026-11-full-month',
      title: 'Steadfast Witness',
      publicationYearMonth: parsePublicationYearMonth('2026-11')!,
      imageUrl: 'https://cdn.sanity.io/images/80016lrq/staging/card-full-month.png',
      scripture: { book: 'Romans', reference: 'Romans 12:12', translation: 'WEBP' },
      theologicalThemes: ['Perseverance'],
    }),
  })

  const data: ReaderParticipationData = {
    ...emptyReaderParticipationData(),
    earnedAwards: {
      [nov2026Early.awardId]: nov2026Early,
      [nov2026Full.awardId]: nov2026Full,
      [feb2024Award.awardId]: feb2024Award,
      [nov2026Alpha.awardId]: nov2026Alpha,
    },
  }

  const projection = buildNotebookCollectionProjection(data, {
    referenceYearMonth: '2026-11',
  })

  assert.deepEqual(projection.relevantYears, [2026, 2024])
  assert.deepEqual(
    projection.allEarnedCards.map(item => item.awardId),
    [
      'card:monthly:2024-02:living-water',
      'card:monthly:2026-11:alpha-anchor',
      'card:monthly:2026-11:full-month',
      'card:monthly:2026-11:bread-of-life',
    ],
  )

  // Late-earned 2024-02 award appears under February 2024, NOT November 2026
  const feb2024Cards = selectNotebookCardsForMonth(data, '2024-02')
  assert.equal(feb2024Cards.length, 1)
  assert.equal(feb2024Cards[0].awardId, 'card:monthly:2024-02:living-water')
  assert.equal(feb2024Cards[0].publicationYearMonth, '2024-02')
  assert.equal(feb2024Cards[0].publicationMonthHeading, 'February 2024')
  assert.equal(feb2024Cards[0].earnedOn, '2026-11-12')
  assert.equal(feb2024Cards[0].earnedDateLabel, 'November 12, 2026')

  // Month projection places thematic cards before full-month card
  const nov2026Cards = selectNotebookCardsForMonth(data, '2026-11')
  assert.deepEqual(
    nov2026Cards.map(item => item.awardId),
    [
      'card:monthly:2026-11:bread-of-life',
      'card:monthly:2026-11:alpha-anchor',
      'card:monthly:2026-11:full-month',
    ],
  )
})

test('handles January/December transitions, February leap-year calendars, and zero future metadata leakage', () => {
  assert.equal(daysInCivilMonth(2024, 2), 29)
  assert.equal(daysInCivilMonth(2026, 2), 28)
  assert.equal(daysInCivilMonth(2000, 2), 29)
  assert.equal(daysInCivilMonth(2100, 2), 28)
  assert.equal(daysInCivilMonth(2025, 12), 31)
  assert.equal(daysInCivilMonth(2026, 1), 31)

  assert.deepEqual(getAdjacentPublicationYearMonth('2026-01'), {
    previous: '2025-12',
    next: '2026-02',
  })
  assert.deepEqual(getAdjacentPublicationYearMonth('2025-12'), {
    previous: '2025-11',
    next: '2026-01',
  })

  const dec2025 = makeAwardRecord('2025-12', 'advent-peace', '2025-12-20')
  const jan2026 = makeAwardRecord('2026-01', 'new-mercies', '2026-01-15')
  const feb2024 = makeAwardRecord('2024-02', 'leap-grace', '2026-03-01')

  const data: ReaderParticipationData = {
    ...emptyReaderParticipationData(),
    earnedAwards: {
      [dec2025.awardId]: dec2025,
      [jan2026.awardId]: jan2026,
      [feb2024.awardId]: feb2024,
    },
  }
  const items = projectValidatedEarnedAwards(data)

  const year2024 = buildNotebookYearEntries(items, 2024, { referenceYearMonth: '2026-02' })
  assert.equal(year2024[1].yearMonth, '2024-02')
  assert.equal(year2024[1].daysInMonth, 29)
  assert.equal(year2024[1].status, 'hasCards')
  assert.equal(year2024[1].earnedCount, 1)

  const year2025 = buildNotebookYearEntries(items, 2025, { referenceYearMonth: '2026-02' })
  assert.equal(year2025[11].yearMonth, '2025-12')
  assert.equal(year2025[11].daysInMonth, 31)
  assert.equal(year2025[11].status, 'hasCards')

  const year2026 = buildNotebookYearEntries(items, 2026, { referenceYearMonth: '2026-02' })
  assert.equal(year2026[0].yearMonth, '2026-01')
  assert.equal(year2026[0].status, 'hasCards')
  assert.equal(year2026[1].yearMonth, '2026-02')
  assert.equal(year2026[1].daysInMonth, 28)
  assert.equal(year2026[1].status, 'empty')
  assert.equal(year2026[1].isFutureOrUnpublished, false)

  // Future months 2026-03..2026-12 remain strictly neutral comingSoon with zero leaked cards
  for (let idx = 2; idx < 12; idx += 1) {
    assert.equal(year2026[idx].status, 'comingSoon')
    assert.equal(year2026[idx].isFutureOrUnpublished, true)
    assert.deepEqual(year2026[idx].cards, [])
  }
})

test('rejects invalid/duplicated IDs and degrades gracefully for missing or malformed Card snapshots', () => {
  const validMissingSnapshot = makeAwardRecord('2026-11', 'full-month', '2026-11-30', {
    cardDocumentId: undefined,
    earnedCard: undefined,
  })
  const validBadUrlSnapshot = makeAwardRecord('2026-11', 'light-path', '2026-11-10', {
    earnedCard: makeCardSnapshot({
      imageUrl: 'http://cdn.sanity.io/images/80016lrq/staging/insecure.png',
    }),
  })
  const validMismatchedDocId = makeAwardRecord('2026-11', 'bread-of-life', '2026-11-09', {
    cardDocumentId: 'card-2026-11-different',
    earnedCard: makeCardSnapshot({
      cardDocumentId: 'card-2026-11-bread-of-life',
    }),
  })

  // Inject malformed records directly as if loaded from tampered/corrupt storage
  const rawEarnedAwards: Record<string, EarnedAwardRecord> = {
    [validMissingSnapshot.awardId]: validMissingSnapshot,
    [validBadUrlSnapshot.awardId]: validBadUrlSnapshot,
    [validMismatchedDocId.awardId]: validMismatchedDocId,
    // Invalid key namespace / format
    'card:foundation:2026-11:intro': makeAwardRecord('2026-11', 'intro', '2026-11-01'),
    // Duplicated/mismatched key vs inner awardId
    'card:monthly:2026-11:duplicate-key': makeAwardRecord('2026-11', 'other-id', '2026-11-01'),
    // Invalid non-leap-year date 2026-02-29
    'card:monthly:2026-11:bad-date': {
      ...makeAwardRecord('2026-11', 'bad-date', '2026-11-01'),
      earnedOn: '2026-02-29' as EarnedAwardRecord['earnedOn'],
    },
  }

  const data: ReaderParticipationData = {
    ...emptyReaderParticipationData(),
    earnedAwards: rawEarnedAwards,
  }

  const projected = projectValidatedEarnedAwards(data)
  assert.equal(projected.length, 3)

  // Missing or invalid snapshots retain the earned award record without exposing bad image URLs
  for (const item of projected) {
    assert.equal(item.hasCardSnapshot, false)
    assert.equal(item.earnedCard, undefined)
  }
  assert.equal(projected[0].title, 'Full-Month Scripture Card')
  assert.equal(projected[1].title, 'Thematic Scripture Card')
})

test('searches by title, Bible book, reference, and curated themes while keeping deterministic order and earned dates', () => {
  const lamp = makeAwardRecord('2026-11', 'light-path', '2026-11-11', {
    earnedCard: makeCardSnapshot({
      cardDocumentId: 'card-2026-11-light-path',
      title: 'Lamp to My Feet',
      publicationYearMonth: parsePublicationYearMonth('2026-11')!,
      scripture: { book: 'Psalms', reference: 'Psalm 119:105', translation: 'WEBP' },
      theologicalThemes: ['Guidance', 'Light'],
    }),
  })
  const water = makeAwardRecord('2024-02', 'living-water', '2026-11-12', {
    earnedCard: makeCardSnapshot({
      cardDocumentId: 'card-2024-02-living-water',
      title: 'Spring of Living Water',
      publicationYearMonth: parsePublicationYearMonth('2024-02')!,
      scripture: { book: 'John', reference: 'John 4:14', translation: 'WEBP' },
      theologicalThemes: ['Renewal', 'guidance'],
    }),
  })
  const missingSnap = makeAwardRecord('2026-11', 'full-month', '2026-11-13', {
    earnedCard: undefined,
  })

  const data: ReaderParticipationData = {
    ...emptyReaderParticipationData(),
    earnedAwards: {
      [lamp.awardId]: lamp,
      [water.awardId]: water,
      [missingSnap.awardId]: missingSnap,
    },
  }

  const items = projectValidatedEarnedAwards(data)
  const themes = collectAvailableCuratedThemes(items)
  assert.deepEqual(themes, ['Guidance', 'Light', 'Renewal'])

  // Search by title
  assert.deepEqual(
    filterNotebookCards(items, { query: 'living water' }).map(c => c.awardId),
    ['card:monthly:2024-02:living-water'],
  )
  // Search by Bible book
  assert.deepEqual(
    filterNotebookCards(items, { query: 'psalms' }).map(c => c.awardId),
    ['card:monthly:2026-11:light-path'],
  )
  // Search by Scripture reference
  assert.deepEqual(
    filterNotebookCards(items, { query: '4:14' }).map(c => c.awardId),
    ['card:monthly:2024-02:living-water'],
  )
  // Search by curated theme preserves newest-earned-first order and earnedOn
  const guidanceMatches = filterNotebookCards(items, { query: 'guidance' })
  assert.deepEqual(
    guidanceMatches.map(c => ({ id: c.awardId, earnedOn: c.earnedOn, ym: c.publicationYearMonth })),
    [
      { id: 'card:monthly:2024-02:living-water', earnedOn: '2026-11-12', ym: '2024-02' },
      { id: 'card:monthly:2026-11:light-path', earnedOn: '2026-11-11', ym: '2026-11' },
    ],
  )
  // Combined theme + query filter
  assert.deepEqual(
    filterNotebookCards(items, { theme: 'Guidance', query: 'john' }).map(c => c.awardId),
    ['card:monthly:2024-02:living-water'],
  )
  // Internal IDs must not match search
  assert.deepEqual(filterNotebookCards(items, { query: 'card:monthly:' }), [])
  // Zero results
  assert.deepEqual(filterNotebookCards(items, { query: 'nonexistent-motif' }), [])
})

test('lifetime count tracks distinct completed Challenges and markEarnedCardViewed isolates hubAnnouncementAcked', async () => {
  const challengeA = parseStoredChallengeId('cms:challenge-2026-11-01', 'cms')!
  const challengeB = parseStoredChallengeId('cms:challenge-2026-11-02', 'cms')!
  const day1 = parseLocalCalendarDate('2026-11-01')!
  const day2 = parseLocalCalendarDate('2026-11-02')!

  let state = emptyReaderParticipationData()
  state = reduceParticipationCommand(state, {
    type: 'completeChallenge',
    challengeId: challengeA,
    completedOn: day1,
  })
  // Rereading / re-completing Challenge A must NOT inflate distinct count
  state = reduceParticipationCommand(state, {
    type: 'completeChallenge',
    challengeId: challengeA,
    completedOn: day2,
  })
  state = reduceParticipationCommand(state, {
    type: 'completeChallenge',
    challengeId: challengeB,
    completedOn: day2,
  })
  assert.equal(
    buildNotebookCollectionProjection(state, { referenceYearMonth: '2026-11' }).lifetime
      .distinctCompletedChallenges,
    2,
  )

  const adapter = createEnvelopePersistenceAdapter({
    storageKey: 'test-notebook-store',
    driver: makeMemoryDriver(),
  })
  const store = createReaderParticipationStore(adapter)
  await store.whenReady()
  await store.dispatch({ type: 'completeChallenge', challengeId: challengeA, completedOn: day1 })
  await store.dispatch({ type: 'completeChallenge', challengeId: challengeA, completedOn: day2 })
  await store.dispatch({ type: 'completeChallenge', challengeId: challengeB, completedOn: day2 })

  const award1 = parseCanonicalMonthlyAwardId('card:monthly:2026-11:light-path')!
  const award2 = parseCanonicalMonthlyAwardId('card:monthly:2026-11:bread-of-life')!
  await store.dispatch(
    createRecordEarnedAwardsCommand([
      {
        awardId: award1,
        discoveryId: 'discovery:2026-11:light-path',
        earnedOn: day2,
        cardDocumentId: 'card-2026-11-light-path',
        earnedCard: makeCardSnapshot(),
      },
      {
        awardId: award2,
        discoveryId: 'discovery:2026-11:bread-of-life',
        earnedOn: day2,
        cardDocumentId: 'card-2026-11-bread-of-life',
        earnedCard: makeCardSnapshot({
          cardDocumentId: 'card-2026-11-bread-of-life',
          title: 'The Bread of Life',
        }),
      },
    ]),
  )

  const before = buildNotebookCollectionProjection(store.getSnapshot().data, {
    referenceYearMonth: '2026-11',
  })
  assert.equal(before.lifetime.distinctCompletedChallenges, 2)
  assert.equal(before.lifetime.headline, '2 Distinct Challenges Completed')
  assert.equal(before.lifetime.unviewedCardCount, 2)

  // Opening award1 dispatches markEarnedCardViewed for award1 ONLY
  await store.dispatch({ type: 'markEarnedCardViewed', awardId: award1 })

  const afterSnapshot = store.getSnapshot()
  assert.equal(afterSnapshot.data.earnedAwards[award1].cardViewed, true)
  assert.equal(afterSnapshot.data.earnedAwards[award1].hubAnnouncementAcked, false)
  assert.equal(afterSnapshot.data.earnedAwards[award1].earnedOn, day2)
  assert.equal(afterSnapshot.data.earnedAwards[award2].cardViewed, false)
  assert.equal(afterSnapshot.data.earnedAwards[award2].hubAnnouncementAcked, false)
  store.dispose()
})

test('Field Notebook module enforces network, storage, viewer-reuse, and announcement boundaries', () => {
  const notebookDir = resolve(repositoryRoot, 'src/components/notebook')
  const files = readdirSync(notebookDir)
    .filter(name => name.endsWith('.ts') || name.endsWith('.tsx'))
    .map(name => resolve(notebookDir, name))

  assert.ok(files.length >= 3)

  let reusesSharedViewer = false

  for (const filePath of files) {
    const source = readFileSync(filePath, 'utf8')
    const rel = relative(repositoryRoot, filePath)
    const ast = ts.createSourceFile(
      filePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )
    const executable = ts.createPrinter({ removeComments: true }).printFile(ast)

    assert.doesNotMatch(executable, /\bfetch\s*\(/, `${rel} must not call fetch()`)
    assert.doesNotMatch(executable, /\bXMLHttpRequest\b/, `${rel} must not use XMLHttpRequest`)
    assert.doesNotMatch(
      executable,
      /\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/,
      `${rel} must not touch browser storage directly`,
    )
    assert.doesNotMatch(
      executable,
      /acknowledgeAwardAnnouncements|recordEarnedAwards/,
      `${rel} must never acknowledge Hub announcements or mutate award issuance`,
    )
    assert.doesNotMatch(executable, /import\.meta\.env/, `${rel} must not depend on env gates`)

    if (source.includes('EarnedScriptureCardViewer')) {
      reusesSharedViewer = true
    }
  }

  assert.equal(reusesSharedViewer, true, 'FieldNotebookView must reuse EarnedScriptureCardViewer')
})
