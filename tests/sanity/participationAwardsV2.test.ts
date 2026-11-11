import assert from 'node:assert/strict'
import { test } from 'node:test'
import type {
  GatewayEarnedScriptureCard,
  GatewayMonthProgressResponse,
} from '../../src/gateway/types.ts'
import {
  admitGatewayMonthProgressAwards,
  combineGatewayProgressWithStoredAwards,
  createRecordEarnedAwardsCommand,
  hasStoredAward,
  selectEarnedAward,
  selectEarnedAwardsForMonth,
  selectPendingHubAnnouncementAwards,
  selectUnviewedEarnedAwards,
  validateEarnedCardSnapshot,
} from '../../src/participation/awards.ts'
import {
  deriveMonthlyAwardIdFromDiscoveryId,
  parseCanonicalMonthlyAwardId,
  parseCanonicalMonthlyDiscoveryId,
  parseCardDocumentId,
  parseLocalCalendarDate,
  parsePublicationYearMonth,
  parseStoredChallengeId,
} from '../../src/participation/identity.ts'
import {
  emptyReaderParticipationData,
  reconcileChallengeAliases,
  reduceParticipationCommand,
} from '../../src/participation/model.ts'
import {
  createEnvelopePersistenceAdapter,
  type KeyValueStorageDriver,
} from '../../src/participation/persistence.ts'
import { createReaderParticipationStore } from '../../src/participation/store.ts'

function makeGatewayCard(overrides: Partial<GatewayEarnedScriptureCard> = {}): GatewayEarnedScriptureCard {
  return {
    cardDocumentId: 'card-2026-11-table-fellowship',
    title: 'At Table with the Lord',
    publicationYearMonth: '2026-11',
    imageUrl: 'https://cdn.sanity.io/images/80016lrq/staging/card-table-fellowship.png',
    assetRevision: 'v1',
    illustrationAlt: 'Hand-drawn loaves and olive oil vessel',
    accessibleTranscription: 'Luke 24:30-31 (WEBP) — He took the bread and gave thanks.',
    scripture: {
      book: 'Luke',
      reference: 'Luke 24:30-31',
      translation: 'WEBP',
    },
    attribution: 'Alexis Waid / Bibleberry',
    rightsStatus: 'approved-ministry-use',
    shareEligible: true,
    theologicalThemes: ['Hospitality', 'hospitality', 'Presence'],
    keywords: ['luke', 'bread'],
    ...overrides,
  }
}

test('enforces canonical monthly award IDs and rejects malformed IDs, unexpected namespaces, and prototype/lab aliases', () => {
  assert.equal(
    parseCanonicalMonthlyAwardId('card:monthly:2026-11:table-fellowship'),
    'card:monthly:2026-11:table-fellowship',
  )
  assert.equal(
    parseCanonicalMonthlyAwardId('card:monthly:2026-11:full-month'),
    'card:monthly:2026-11:full-month',
  )
  assert.equal(
    deriveMonthlyAwardIdFromDiscoveryId('discovery:2026-11:full-month', 'fullMonth'),
    'card:monthly:2026-11:full-month',
  )
  assert.equal(
    deriveMonthlyAwardIdFromDiscoveryId('discovery:2026-11:full-month', 'thematic'),
    null,
  )
  assert.equal(parseCanonicalMonthlyDiscoveryId('discovery:2026-11:psalms')?.kind, 'thematic')
  assert.equal(parsePublicationYearMonth('2026-11'), '2026-11')
  assert.equal(parsePublicationYearMonth('2026-13'), null)
  assert.equal(parseCardDocumentId('card-2026-11-table-fellowship'), 'card-2026-11-table-fellowship')

  const rejectedAwardIds = [
    '',
    'card:monthly:2026-11:',
    'card:monthly:2026-00:table-fellowship',
    'card:monthly:2026-13:table-fellowship',
    'card:monthly:2026-11:Table-Fellowship',
    'card:monthly:2026-11:table_fellowship',
    'card:monthly:2026-11:table--fellowship',
    'card:monthly:2026-11:drafts.table-fellowship',
    'card:monthly:2026-11:pilot-sample',
    'card:monthly:2026-11:lab-sample',
    'card:monthly:2026-11:prototype-card',
    'card:monthly:2026-11:fixture-card',
    'card:monthly:2026-11:sanity-lab-card',
    'card:monthly:2026-11:interactive-challenge-lab',
    'card:monthly:2026-11:nov-1',
    'card:foundation:2026-11:table-fellowship',
    'card:special:2026-11:holy-week',
    'discovery:2026-11:table-fellowship',
    'cms:card-2026-11-table-fellowship',
    'pilot:card-2026-11-table-fellowship',
    ' card:monthly:2026-11:table-fellowship',
    'card:monthly:2026-11:table-fellowship ',
  ]

  for (const invalid of rejectedAwardIds) {
    assert.equal(
      parseCanonicalMonthlyAwardId(invalid),
      null,
      `Expected award ID "${invalid}" to be rejected`,
    )
  }

  assert.equal(parseCardDocumentId('drafts.card-2026-11-table'), null)
  assert.equal(parseCardDocumentId('card-pilot-sample'), null)
})

test('validates earnedCard snapshots strictly and strips unapproved fields without fabricating missing cards', () => {
  const valid = validateEarnedCardSnapshot(
    {
      ...makeGatewayCard(),
      passage: 'Forbidden passage text',
      _id: 'raw-sanity-id',
      editorialReview: { reviewedBy: 'Internal' },
    },
    '2026-11',
  )
  assert.ok(valid)
  assert.equal('passage' in valid, false)
  assert.equal('_id' in valid, false)
  assert.equal('editorialReview' in valid, false)
  assert.deepEqual(valid.theologicalThemes, ['Hospitality', 'Presence'])

  // Wrong publication month
  assert.equal(validateEarnedCardSnapshot(makeGatewayCard({ publicationYearMonth: '2026-12' }), '2026-11'), null)
  // Non-HTTPS or non-Sanity CDN URL or query string
  assert.equal(validateEarnedCardSnapshot(makeGatewayCard({ imageUrl: 'http://cdn.sanity.io/images/a/b/c.png' })), null)
  assert.equal(validateEarnedCardSnapshot(makeGatewayCard({ imageUrl: 'https://example.com/images/a/b/c.png' })), null)
  assert.equal(validateEarnedCardSnapshot(makeGatewayCard({ imageUrl: 'https://cdn.sanity.io/images/a/b/c.png?w=200' })), null)
  // Duplicate alt and transcription
  assert.equal(
    validateEarnedCardSnapshot(
      makeGatewayCard({
        illustrationAlt: 'Same text',
        accessibleTranscription: 'same text',
      }),
    ),
    null,
  )
  // Missing transcription or scripture fields or invalid assetRevision
  assert.equal(validateEarnedCardSnapshot(makeGatewayCard({ accessibleTranscription: '   ' })), null)
  assert.equal(validateEarnedCardSnapshot(makeGatewayCard({ assetRevision: 'bad rev!' })), null)
  assert.equal(
    validateEarnedCardSnapshot(
      makeGatewayCard({ scripture: { book: 'Luke', reference: '', translation: 'WEBP' } }),
    ),
    null,
  )
})

test('admits gateway progress awards strictly, handles mismatches, invalid dates, duplicates, absent cards, and publish vs earned month', () => {
  const response: GatewayMonthProgressResponse = {
    ok: true,
    serverContext: {
      authorizedLocalDate: '2027-02-14', // Earned months after 2026-11 publication month
      effectiveTimeZone: 'America/New_York',
    },
    monthId: '2026-11',
    rosterVersion: 1,
    completedInMonthCount: 30,
    totalChallenges: 30,
    thematicEarnedCount: 2,
    thematicTotalCount: 3,
    discoveries: [
      // 1. Unearned -> ignored
      {
        discoveryId: 'discovery:2026-11:psalms-of-thanksgiving',
        kind: 'thematic',
        title: 'Psalms of Thanksgiving',
        achievedCount: 1,
        targetCount: 3,
        isEarned: false,
      },
      // 2. Earned thematic #1 with valid card
      {
        discoveryId: 'discovery:2026-11:table-fellowship',
        kind: 'thematic',
        title: 'Table Fellowship in Luke',
        achievedCount: 2,
        targetCount: 2,
        isEarned: true,
        awardId: 'card:monthly:2026-11:table-fellowship',
        earnedCard: makeGatewayCard(),
      },
      // 3. Duplicate entry of thematic #1 -> ignored
      {
        discoveryId: 'discovery:2026-11:table-fellowship',
        kind: 'thematic',
        title: 'Table Fellowship in Luke (Duplicate)',
        achievedCount: 2,
        targetCount: 2,
        isEarned: true,
        awardId: 'card:monthly:2026-11:table-fellowship',
      },
      // 4. Earned thematic #2 with INVALID earnedCard -> award still admitted WITHOUT fabricated card!
      {
        discoveryId: 'discovery:2026-11:vineyard-imagery',
        kind: 'thematic',
        title: 'Vineyard Imagery',
        achievedCount: 3,
        targetCount: 3,
        isEarned: true,
        awardId: 'card:monthly:2026-11:vineyard-imagery',
        reservedCardId: 'card-2026-11-vineyard-imagery',
        earnedCard: makeGatewayCard({
          cardDocumentId: 'card-2026-11-vineyard-imagery',
          imageUrl: 'https://evil.example.org/spoof.png',
        }),
      },
      // 5. Mismatched awardId / monthId -> rejected
      {
        discoveryId: 'discovery:2026-11:bad-mismatch',
        kind: 'thematic',
        title: 'Mismatch',
        achievedCount: 1,
        targetCount: 1,
        isEarned: true,
        awardId: 'card:monthly:2026-12:bad-mismatch',
      },
      // 6. Earned full-month without earnedCard payload -> admitted without card snapshot
      {
        discoveryId: 'discovery:2026-11:full-month',
        kind: 'fullMonth',
        title: 'Complete November',
        achievedCount: 30,
        targetCount: 30,
        isEarned: true,
        awardId: 'card:monthly:2026-11:full-month',
      },
    ],
  }

  const admitted = admitGatewayMonthProgressAwards(response)
  assert.equal(admitted.length, 3)

  assert.equal(admitted[0].awardId, 'card:monthly:2026-11:table-fellowship')
  assert.equal(admitted[0].earnedOn, '2027-02-14')
  assert.equal(admitted[0].earnedCard?.publicationYearMonth, '2026-11')
  assert.equal(admitted[0].cardDocumentId, 'card-2026-11-table-fellowship')

  assert.equal(admitted[1].awardId, 'card:monthly:2026-11:vineyard-imagery')
  assert.equal(admitted[1].earnedOn, '2027-02-14')
  assert.equal(admitted[1].cardDocumentId, 'card-2026-11-vineyard-imagery')
  assert.equal(admitted[1].earnedCard, undefined)

  assert.equal(admitted[2].awardId, 'card:monthly:2026-11:full-month')
  assert.equal(admitted[2].earnedOn, '2027-02-14')
  assert.equal(admitted[2].earnedCard, undefined)

  // Invalid authorizedLocalDate rejects the entire response
  assert.deepEqual(
    admitGatewayMonthProgressAwards({
      ...response,
      serverContext: {
        authorizedLocalDate: '2027-02-29',
        effectiveTimeZone: 'America/New_York',
      },
    }),
    [],
  )

  // Invalid monthId rejects the entire response
  assert.deepEqual(
    admitGatewayMonthProgressAwards({
      ...response,
      monthId: '2026-13',
    }),
    [],
  )
})

test('preserves original earnedOn, independent monotonic flags, non-lossy snapshot policy, and snapshot identity', async () => {
  const backing = new Map<string, string>()
  const driver: KeyValueStorageDriver = {
    getItem: key => backing.get(key) ?? null,
    setItem: (key, value) => {
      backing.set(key, value)
    },
    removeItem: key => {
      backing.delete(key)
    },
  }
  const store = createReaderParticipationStore(
    createEnvelopePersistenceAdapter({ storageKey: 'awards-test-key', driver }),
  )
  await store.whenReady()

  const award1 = parseCanonicalMonthlyAwardId('card:monthly:2026-11:table-fellowship')!
  const award2 = parseCanonicalMonthlyAwardId('card:monthly:2026-11:vineyard-imagery')!
  const dayEarned = parseLocalCalendarDate('2026-11-10')!
  const dayLater = parseLocalCalendarDate('2026-12-01')!

  // Record award1 WITH snapshot and award2 WITHOUT snapshot
  await store.dispatch(
    createRecordEarnedAwardsCommand([
      {
        awardId: award1,
        discoveryId: 'discovery:2026-11:table-fellowship',
        earnedOn: dayEarned,
        earnedCard: validateEarnedCardSnapshot(makeGatewayCard(), '2026-11')!,
      },
      {
        awardId: award2,
        discoveryId: 'discovery:2026-11:vineyard-imagery',
        earnedOn: dayEarned,
      },
    ]),
  )

  const snapAfterFirst = store.getSnapshot()
  assert.equal(hasStoredAward(snapAfterFirst.data, award1), true)
  assert.equal(selectEarnedAward(snapAfterFirst.data, award1)?.earnedOn, dayEarned)
  assert.equal(selectPendingHubAnnouncementAwards(snapAfterFirst.data).length, 2)
  assert.equal(selectUnviewedEarnedAwards(snapAfterFirst.data).length, 2)

  // Re-earning award1 on a later date WITHOUT earnedCard (and with revised v2):
  // - does NOT change earnedOn
  // - does NOT drop original earnedCard
  // - defers overwriting already-captured valid snapshot
  // - IS a strict Object.is snapshot no-op!
  await store.dispatch(
    createRecordEarnedAwardsCommand([
      {
        awardId: award1,
        discoveryId: 'discovery:2026-11:table-fellowship',
        earnedOn: dayLater,
      },
      {
        awardId: award1,
        discoveryId: 'discovery:2026-11:table-fellowship',
        earnedOn: dayLater,
        earnedCard: validateEarnedCardSnapshot(
          makeGatewayCard({ assetRevision: 'v2', title: 'Revised Title' }),
          '2026-11',
        )!,
      },
    ]),
  )
  assert.equal(Object.is(store.getSnapshot(), snapAfterFirst), true)
  assert.equal(store.getSnapshot().data.earnedAwards[award1].earnedOn, dayEarned)
  assert.equal(store.getSnapshot().data.earnedAwards[award1].earnedCard?.title, 'At Table with the Lord')

  // Backfilling award2 when valid snapshot later becomes available preserves original earnedOn
  const award2Snapshot = validateEarnedCardSnapshot(
    makeGatewayCard({
      cardDocumentId: 'card-2026-11-vineyard-imagery',
      title: 'The True Vine',
    }),
    '2026-11',
  )!
  await store.dispatch(
    createRecordEarnedAwardsCommand([
      {
        awardId: award2,
        discoveryId: 'discovery:2026-11:vineyard-imagery',
        earnedOn: dayLater,
        earnedCard: award2Snapshot,
      },
    ]),
  )
  assert.equal(store.getSnapshot().data.earnedAwards[award2].earnedOn, dayEarned)
  assert.equal(store.getSnapshot().data.earnedAwards[award2].earnedCard?.title, 'The True Vine')

  // Independent flags: acknowledging Hub announcement does NOT mark Card viewed
  await store.dispatch({
    type: 'acknowledgeAwardAnnouncements',
    awardIds: [award1],
  })
  const afterAck = store.getSnapshot()
  assert.equal(afterAck.data.earnedAwards[award1].hubAnnouncementAcked, true)
  assert.equal(afterAck.data.earnedAwards[award1].cardViewed, false)
  assert.equal(afterAck.data.earnedAwards[award2].hubAnnouncementAcked, false)
  assert.equal(selectPendingHubAnnouncementAwards(afterAck.data).map(a => a.awardId).join(','), award2)

  // Repeat acknowledgment is strict Object.is no-op
  await store.dispatch({
    type: 'acknowledgeAwardAnnouncements',
    awardIds: [award1],
  })
  assert.equal(Object.is(store.getSnapshot(), afterAck), true)

  // Marking award2 viewed does NOT acknowledge Hub announcement
  await store.dispatch({
    type: 'markEarnedCardViewed',
    awardId: award2,
  })
  const afterView = store.getSnapshot()
  assert.equal(afterView.data.earnedAwards[award2].cardViewed, true)
  assert.equal(afterView.data.earnedAwards[award2].hubAnnouncementAcked, false)

  // Repeat view & unknown awardId are strict Object.is no-ops
  await store.dispatch({ type: 'markEarnedCardViewed', awardId: award2 })
  await store.dispatch({
    type: 'markEarnedCardViewed',
    awardId: parseCanonicalMonthlyAwardId('card:monthly:2026-11:unknown-slug')!,
  })
  assert.equal(Object.is(store.getSnapshot(), afterView), true)

  // Orthogonal Challenge completion preserves exact `earnedAwards` object reference
  const prevAwardsRef = afterView.data.earnedAwards
  const c1 = parseStoredChallengeId('cms:berrymark-challenge-2026-11-02-rejoice-always')!
  await store.dispatch({
    type: 'completeChallenge',
    challengeId: c1,
    completedOn: dayLater,
  })
  assert.equal(Object.is(store.getSnapshot().data.earnedAwards, prevAwardsRef), true)

  // Alias reconciliation preserves earnedAwards untouched
  const cNew = parseStoredChallengeId('cms:berrymark-challenge-2026-11-02-rejoice-always-v2')!
  const aliased = reconcileChallengeAliases(store.getSnapshot().data, { [c1]: cNew })
  assert.equal(Object.is(aliased.earnedAwards, prevAwardsRef), true)

  // Grouping by publication month puts thematic first and fullMonth last
  const monthAwards = selectEarnedAwardsForMonth(store.getSnapshot().data, '2026-11')
  assert.equal(monthAwards.length, 2)

  store.dispose()
})

test('combines stateless gateway progress with stored awards monotonically without leaking unearned cards', () => {
  const awardStoredWithArt = parseCanonicalMonthlyAwardId('card:monthly:2026-11:table-fellowship')!
  const awardStoredWithoutArt = parseCanonicalMonthlyAwardId('card:monthly:2026-11:full-month')!
  const dayEarned = parseLocalCalendarDate('2026-11-10')!

  let state = emptyReaderParticipationData()
  state = reduceParticipationCommand(
    state,
    createRecordEarnedAwardsCommand([
      {
        awardId: awardStoredWithArt,
        discoveryId: 'discovery:2026-11:table-fellowship',
        earnedOn: dayEarned,
        earnedCard: validateEarnedCardSnapshot(makeGatewayCard(), '2026-11')!,
      },
      {
        awardId: awardStoredWithoutArt,
        discoveryId: 'discovery:2026-11:full-month',
        earnedOn: dayEarned,
      },
    ]),
  )

  // Gateway recomputation says `isEarned: false` across all entries (e.g., emergency withdrawal or incomplete history)
  const combined = combineGatewayProgressWithStoredAwards(
    {
      monthId: '2026-11',
      discoveries: [
        {
          discoveryId: 'discovery:2026-11:psalms-of-thanksgiving',
          kind: 'thematic',
          title: 'Psalms of Thanksgiving',
          achievedCount: 1,
          targetCount: 3,
          isEarned: false,
        },
        {
          discoveryId: 'discovery:2026-11:table-fellowship',
          kind: 'thematic',
          title: 'Table Fellowship in Luke',
          achievedCount: 1,
          targetCount: 2,
          isEarned: false,
        },
        {
          discoveryId: 'discovery:2026-11:full-month',
          kind: 'fullMonth',
          title: 'Complete November',
          achievedCount: 28,
          targetCount: 29,
          isEarned: false,
        },
      ],
    },
    state,
  )

  // 1. Unearned discovery leaks zero award/card metadata
  assert.equal(combined[0].effectiveEarned, false)
  assert.equal(combined[0].hasStoredAward, false)
  assert.equal(combined[0].hasCardDisplay, false)
  assert.equal('awardId' in combined[0], false)
  assert.equal('earnedCard' in combined[0], false)

  // 2. Stored award with art remains effectiveEarned=true even when gateway reports isEarned=false
  assert.equal(combined[1].effectiveEarned, true)
  if (combined[1].effectiveEarned) {
    assert.equal(combined[1].hasStoredAward, true)
    assert.equal(combined[1].awardId, awardStoredWithArt)
    assert.equal(combined[1].earnedOn, dayEarned)
    assert.equal(combined[1].hasCardDisplay, true)
    assert.equal(combined[1].earnedCard?.title, 'At Table with the Lord')
  }

  // 3. Stored award without art remains effectiveEarned=true and reports hasCardDisplay=false without fabricating art
  assert.equal(combined[2].effectiveEarned, true)
  if (combined[2].effectiveEarned) {
    assert.equal(combined[2].hasStoredAward, true)
    assert.equal(combined[2].awardId, awardStoredWithoutArt)
    assert.equal(combined[2].hasCardDisplay, false)
    assert.equal(combined[2].earnedCard, undefined)
  }
})
