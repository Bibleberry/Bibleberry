import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { CmsChallenge } from '../../src/cms/sanity/types.ts'
import type {
  MonthDetailData,
  MonthGatewayProvider,
  MonthProgressData,
  MonthProgressResult,
} from '../../src/cms/reader/monthProvider.ts'
import {
  persistGatewayMonthProgressAwards,
  reconcileFinishedChallengeMonthAwards,
} from '../../src/cms/reader/monthAwardReconciliation.ts'
import { admitTrustedCatalogChallenge } from '../../src/participation/admission.ts'
import { formatCanonicalChallengeId, parseLocalCalendarDate } from '../../src/participation/identity.ts'
import {
  createEnvelopePersistenceAdapter,
  type KeyValueStorageDriver,
} from '../../src/participation/persistence.ts'
import { createReaderParticipationStore } from '../../src/participation/store.ts'
import type { ReaderParticipationStore } from '../../src/participation/store.ts'

interface Deferred<T> {
  readonly promise: Promise<T>
  resolve(value: T | PromiseLike<T>): void
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(res => {
    resolve = res
  })
  return { promise, resolve }
}

function createStore(setItem?: KeyValueStorageDriver['setItem']): ReaderParticipationStore {
  const values = new Map<string, string>()
  const driver: KeyValueStorageDriver = {
    getItem: key => values.get(key) ?? null,
    setItem: setItem ?? ((key, value) => {
      values.set(key, value)
    }),
    removeItem: key => {
      values.delete(key)
    },
  }
  return createReaderParticipationStore(
    createEnvelopePersistenceAdapter({
      storageKey: 'bibleberry-test-month-awards',
      driver,
    }),
  )
}

function makeChallenge(overrides: Partial<CmsChallenge> = {}): CmsChallenge {
  return {
    id: 'editorial-slug',
    documentId: 'published-month-challenge',
    title: 'A released Challenge',
    challengeType: 'teaching',
    calendarSlot: {
      monthId: '2026-11',
      documentId: 'month-2026-11',
      publicationDate: '2026-11-02',
      dayOfMonth: 2,
    },
    primaryScripture: {
      id: 'scripture',
      reference: 'Psalm 23',
      translation: 'WEBP',
      textStatus: 'referenceOnly',
      practiceStatus: 'notConfigured',
      usageRightsConfirmed: true,
    },
    screens: [{ id: 'screen-1', stepLabel: '1', title: 'Teaching', blocks: [] }],
    companionLinks: [],
    editorial: { adaptationReviewed: true, reviewedAt: '2026-11-01T00:00:00.000Z' },
    ...overrides,
  }
}

function makeMonthDetail(challengeId: string): MonthDetailData {
  return {
    monthId: '2026-11',
    documentId: 'month-2026-11',
    year: 2026,
    month: 11,
    daysInMonth: 30,
    phase: 'historical',
    rosterVersion: 1,
    totalChallenges: 2,
    title: 'November',
    introduction: {
      version: 'v1',
      previewScreens: [],
      welcomeScreen: { id: 'welcome', blocks: [] },
    },
    slots: [
      {
        dayOfMonth: 2,
        date: '2026-11-02',
        availability: 'available',
        title: 'A released Challenge',
        slug: 'editorial-slug',
        challengeId,
        challengeType: 'teaching',
      },
      {
        dayOfMonth: 3,
        date: '2026-11-03',
        availability: 'available',
        title: 'Another released Challenge',
        slug: 'another-challenge',
        challengeId: 'cms:another-released-challenge',
        challengeType: 'teaching',
      },
      {
        dayOfMonth: 4,
        date: '2026-11-04',
        availability: 'comingSoon',
        title: 'Not yet released',
      },
    ],
    discoveries: [],
  }
}

function makeProgress(overrides: Partial<MonthProgressData> = {}): MonthProgressResult {
  return {
    status: 'ready',
    source: 'gateway',
    serverContext: {
      authorizedLocalDate: '2027-01-03',
      effectiveTimeZone: 'America/New_York',
    },
    progress: {
      monthId: '2026-11',
      rosterVersion: 1,
      completedInMonthCount: 2,
      totalChallenges: 2,
      thematicEarnedCount: 1,
      thematicTotalCount: 1,
      discoveries: [
        {
          discoveryId: 'discovery:2026-11:theme',
          kind: 'thematic',
          title: 'A monthly discovery',
          achievedCount: 1,
          targetCount: 1,
          isEarned: true,
          awardId: 'card:monthly:2026-11:theme',
          earnedCard: {
            cardDocumentId: 'card-2026-11-theme',
            title: 'A monthly card',
            publicationYearMonth: '2026-11',
            imageUrl: 'https://example.org/not-an-approved-card.png',
            assetRevision: 'v1',
            illustrationAlt: 'A hand-drawn lamp',
            accessibleTranscription: 'Psalm 119:105 — A lamp to my feet.',
            scripture: { book: 'Psalms', reference: 'Psalm 119:105', translation: 'WEBP' },
            attribution: 'Bibleberry',
            rightsStatus: 'approved-ministry-use',
            shareEligible: true,
          },
        },
        {
          discoveryId: 'discovery:2026-11:full-month',
          kind: 'fullMonth',
          title: 'Complete November',
          achievedCount: 2,
          targetCount: 2,
          isEarned: true,
          awardId: 'card:monthly:2026-11:full-month',
        },
      ],
      ...overrides,
    },
  }
}

function makeProvider(
  month: MonthDetailData,
  progress: MonthProgressResult,
  calls: { months: string[]; completedIds: string[][] },
): MonthGatewayProvider {
  return {
    async loadMonth(yearMonth) {
      calls.months.push(yearMonth)
      return {
        status: 'ready',
        source: 'gateway',
        month,
        serverContext: {
          authorizedLocalDate: '2027-01-03',
          effectiveTimeZone: 'America/New_York',
        },
      }
    },
    async loadMonthProgress(yearMonth, completedChallengeIds) {
      calls.months.push(`${yearMonth}/progress`)
      calls.completedIds.push([...completedChallengeIds])
      return progress
    },
    async loadMonthPreview() {
      return { status: 'notFound', source: 'gateway' }
    },
    async loadNews() {
      return { status: 'notFound', source: 'gateway' }
    },
  }
}

test('Finish reconciliation binds the editorial month to a released slot and records multiple awards with server date', async () => {
  const challenge = makeChallenge()
  const challengeId = formatCanonicalChallengeId('cms', challenge.documentId)!
  const admittedChallenge = admitTrustedCatalogChallenge({
    documentId: challenge.documentId,
    screens: challenge.screens,
    editorial: challenge.editorial,
  })!
  const store = createStore()
  await store.dispatch({
    type: 'completeChallenge',
    challengeId,
    completedOn: parseLocalCalendarDate('2026-11-02')!,
  })
  await store.dispatch({
    type: 'completeChallenge',
    challengeId: formatCanonicalChallengeId('cms', 'another-released-challenge')!,
    completedOn: parseLocalCalendarDate('2026-11-03')!,
  })
  await store.dispatch({
    type: 'completeChallenge',
    challengeId: formatCanonicalChallengeId('cms', 'different-month')!,
    completedOn: parseLocalCalendarDate('2026-10-10')!,
  })

  const calls = { months: [] as string[], completedIds: [] as string[][] }
  const status = await reconcileFinishedChallengeMonthAwards({
    store,
    monthProvider: makeProvider(makeMonthDetail(challengeId), makeProgress(), calls),
    challenge,
    admittedChallenge,
    completionWrite: Promise.resolve(),
  })

  assert.equal(status, 'recorded')
  assert.deepEqual(calls.months, ['2026-11', '2026-11/progress'])
  assert.deepEqual(calls.completedIds, [[challengeId, 'cms:another-released-challenge']])
  assert.equal(
    store.getSnapshot().data.earnedAwards['card:monthly:2026-11:theme']?.earnedOn,
    '2027-01-03',
  )
  assert.equal(
    store.getSnapshot().data.earnedAwards['card:monthly:2026-11:full-month']?.earnedOn,
    '2027-01-03',
  )
  assert.equal(
    store.getSnapshot().data.earnedAwards['card:monthly:2026-11:theme']?.earnedCard,
    undefined,
  )
  store.dispose()
})

test('waits for the asynchronous completion write before reconciling and retains completion on progress failure', async () => {
  const writeStarted = createDeferred<void>()
  const allowWrite = createDeferred<void>()
  const store = createStore(async (key, value) => {
    writeStarted.resolve()
    await allowWrite.promise
    backing.set(key, value)
  })
  const backing = new Map<string, string>()
  const challenge = makeChallenge()
  const challengeId = formatCanonicalChallengeId('cms', challenge.documentId)!
  const admittedChallenge = admitTrustedCatalogChallenge({
    documentId: challenge.documentId,
    screens: challenge.screens,
    editorial: challenge.editorial,
  })!
  const completionWrite = store.dispatch({
    type: 'completeChallenge',
    challengeId,
    completedOn: parseLocalCalendarDate('2026-11-02')!,
  })
  await writeStarted.promise

  const calls = { months: [] as string[], completedIds: [] as string[][] }
  const provider = makeProvider(
    makeMonthDetail(challengeId),
    { status: 'requestError', message: 'offline', source: 'gateway' },
    calls,
  )
  const reconciliation = reconcileFinishedChallengeMonthAwards({
    store,
    monthProvider: provider,
    challenge,
    admittedChallenge,
    completionWrite,
  })
  await Promise.resolve()
  assert.deepEqual(calls.months, [])

  allowWrite.resolve()
  await completionWrite
  assert.equal(await reconciliation, 'progressUnavailable')
  assert.equal(calls.months[0], '2026-11')
  assert.equal(Object.hasOwn(store.getSnapshot().data.completedChallenges, challengeId), true)
  assert.deepEqual(store.getSnapshot().data.earnedAwards, {})
  store.dispose()
})

test('fails closed without a gateway month binding and admits a later successful progress refresh', async () => {
  const challenge = makeChallenge()
  const challengeId = formatCanonicalChallengeId('cms', challenge.documentId)!
  const admittedChallenge = admitTrustedCatalogChallenge({
    documentId: challenge.documentId,
    screens: challenge.screens,
    editorial: challenge.editorial,
  })!
  const store = createStore()
  await store.dispatch({
    type: 'completeChallenge',
    challengeId,
    completedOn: parseLocalCalendarDate('2026-11-02')!,
  })
  const calls = { months: [] as string[], completedIds: [] as string[][] }
  const wrongRoster = makeMonthDetail('cms:another-challenge')
  assert.equal(
    await reconcileFinishedChallengeMonthAwards({
      store,
      monthProvider: makeProvider(wrongRoster, makeProgress(), calls),
      challenge,
      admittedChallenge,
      completionWrite: Promise.resolve(),
    }),
    'unverifiedMonth',
  )
  assert.deepEqual(calls.months, ['2026-11'])
  assert.deepEqual(store.getSnapshot().data.earnedAwards, {})

  const laterProgress = makeProgress()
  assert.equal(await persistGatewayMonthProgressAwards(store, laterProgress, '2026-10'), 0)
  assert.deepEqual(store.getSnapshot().data.earnedAwards, {})
  assert.equal(await persistGatewayMonthProgressAwards(store, laterProgress), 2)
  assert.equal(
    store.getSnapshot().data.earnedAwards['card:monthly:2026-11:theme']?.earnedOn,
    '2027-01-03',
  )
  assert.equal(
    store.getSnapshot().data.earnedAwards['card:monthly:2026-11:theme']?.earnedCard,
    undefined,
  )
  assert.equal(await persistGatewayMonthProgressAwards(store, laterProgress), 2)
  assert.equal(
    store.getSnapshot().data.earnedAwards['card:monthly:2026-11:theme']?.earnedOn,
    '2027-01-03',
  )
  store.dispose()
})
