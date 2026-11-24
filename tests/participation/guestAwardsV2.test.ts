import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  GUEST_PARTICIPATION_STORAGE_KEY,
  createPlatformGuestParticipationStore,
} from '../../src/participation/defaultGuestStore.ts'
import {
  createCapacitorPreferencesDriver,
  type CapacitorPreferencesBridge,
} from '../../src/participation/drivers/capacitorPreferencesDriver.ts'
import { createWebLocalStorageDriver } from '../../src/participation/drivers/webLocalStorageDriver.ts'
import {
  parseCanonicalMonthlyAwardId,
  parseLocalCalendarDate,
  parsePublicationYearMonth,
  parseStoredChallengeId,
} from '../../src/participation/identity.ts'
import { selectNewDiscoveryAwardIds } from '../../src/participation/model.ts'
import {
  createEnvelopePersistenceAdapter,
  parseParticipationEnvelope,
  serializeParticipationEnvelope,
  type KeyValueStorageDriver,
} from '../../src/participation/persistence.ts'
import { acknowledgeNotebookEntry, createReaderParticipationStore } from '../../src/participation/store.ts'
import type { EarnedScriptureCardSnapshot, ParticipationCommand } from '../../src/participation/types.ts'

const STORAGE_KEY = GUEST_PARTICIPATION_STORAGE_KEY
const c1 = parseStoredChallengeId('cms:berrymark-challenge-2026-11-02-rejoice-always')!
const c2 = parseStoredChallengeId('cms:berrymark-challenge-2026-11-03-pray-continually')!
const day1 = parseLocalCalendarDate('2026-11-06')!
const day2 = parseLocalCalendarDate('2026-11-10')!
const day3 = parseLocalCalendarDate('2027-01-15')!

const thematicAwardId = parseCanonicalMonthlyAwardId('card:monthly:2026-11:table-fellowship')!
const fullMonthAwardId = parseCanonicalMonthlyAwardId('card:monthly:2026-11:full-month')!

function makeValidCardSnapshot(overrides: Partial<EarnedScriptureCardSnapshot> = {}): EarnedScriptureCardSnapshot {
  return {
    cardDocumentId: 'card-2026-11-table-fellowship',
    title: 'At Table with the Lord',
    publicationYearMonth: parsePublicationYearMonth('2026-11')!,
    imageUrl: 'https://cdn.sanity.io/images/80016lrq/staging/table-fellowship-1200x1600.png',
    assetRevision: 'v1',
    illustrationAlt: 'Hand-illustrated loaves and olive bowl from notebook',
    accessibleTranscription: 'Luke 24:30-31 (WEBP) — When he had sat down at the table with them, he took the bread and gave thanks.',
    scripture: {
      book: 'Luke',
      reference: 'Luke 24:30-31',
      translation: 'WEBP',
    },
    attribution: 'Alexis Waid / Bibleberry',
    rightsStatus: 'approved-ministry-use',
    shareEligible: true,
    theologicalThemes: ['Hospitality', 'Presence'],
    keywords: ['luke', 'table'],
    ...overrides,
  }
}

function makeLegacyV1EnvelopeJson(): string {
  return JSON.stringify({
    schemaVersion: 1,
    data: {
      completedChallenges: {
        [c1]: { completedOn: day1 },
      },
      inProgressChallenges: {
        [c2]: { screenId: 'screen-2', updatedOn: day1 },
      },
      savedChallenges: {
        [c1]: { savedOn: day1 },
      },
      savedScriptures: [
        {
          key: '1 thessalonians 5:16-18|webp',
          reference: '1 Thessalonians 5:16–18',
          translation: 'WEBP',
          savedOn: day1,
          sourceChallengeId: c1,
        },
      ],
      lastOpenedChallenge: {
        challengeId: c2,
        openedOn: day1,
        resumeDismissedOn: day1,
      },
    },
  })
}

function createPreferences(
  backing: Map<string, string>,
  overrides: Partial<CapacitorPreferencesBridge> = {},
): CapacitorPreferencesBridge {
  return {
    get: async ({ key }) => ({ value: backing.get(key) ?? null }),
    set: async ({ key, value }) => {
      backing.set(key, value)
    },
    remove: async ({ key }) => {
      backing.delete(key)
    },
    ...overrides,
  }
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(res => {
    resolve = res
  })
  return { promise, resolve }
}

test('migrates V1 to V3 on first write across sync web storage and async Capacitor Preferences, preserving all legacy fields', async () => {
  const legacyV1 = makeLegacyV1EnvelopeJson()

  // 1. Sync Web Storage V1 -> read (V1 stays intact on disk) -> write -> V3 -> restart
  const webBacking = new Map<string, string>([[STORAGE_KEY, legacyV1]])
  const webStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = {
    getItem: k => webBacking.get(k) ?? null,
    setItem: (k, v) => {
      webBacking.set(k, v)
    },
    removeItem: k => {
      webBacking.delete(k)
    },
  }

  const webStore1 = createPlatformGuestParticipationStore({
    isNativePlatform: () => false,
    webStorage,
  })
  await webStore1.whenReady()
  assert.equal(webStore1.getSnapshot().health, 'ok')
  assert.deepEqual(webStore1.getSnapshot().data.earnedAwards, {})
  assert.equal(webStore1.getSnapshot().distinctCompletedCount, 1)
  assert.equal(webStore1.getSnapshot().data.inProgressChallenges[c2]?.screenId, 'screen-2')
  assert.equal(webStore1.getSnapshot().data.savedChallenges[c1]?.savedOn, day1)
  assert.equal(webStore1.getSnapshot().data.savedScriptures.length, 1)
  assert.equal(webStore1.getSnapshot().data.lastOpenedChallenge?.resumeDismissedOn, day1)

  // Read alone must NOT rewrite V1 on disk
  assert.equal(webBacking.get(STORAGE_KEY), legacyV1)

  const commands: ParticipationCommand[] = [
    {
      type: 'recordEarnedAwards',
      awards: [
        {
          awardId: thematicAwardId,
          discoveryId: 'discovery:2026-11:table-fellowship',
          earnedOn: day2,
          cardDocumentId: 'card-2026-11-table-fellowship',
          earnedCard: makeValidCardSnapshot(),
        },
      ],
    },
    {
      type: 'acknowledgeAwardAnnouncements',
      awardIds: [thematicAwardId],
    },
  ]

  for (const command of commands) {
    await webStore1.dispatch(command)
  }
  webStore1.dispose()

  const persistedWebParsed = JSON.parse(webBacking.get(STORAGE_KEY)!) as {
    schemaVersion: number
    data: Record<string, unknown>
  }
  assert.equal(persistedWebParsed.schemaVersion, 3)

  // Reload web store from V3 payload
  const webStore2 = createPlatformGuestParticipationStore({
    isNativePlatform: () => false,
    webStorage,
  })
  await webStore2.whenReady()
  const webReloaded = webStore2.getSnapshot().data

  // 2. Async Capacitor Preferences V1 -> read -> write -> V3 -> restart
  const nativeBacking = new Map<string, string>([[STORAGE_KEY, legacyV1]])
  const nativePrefs = createPreferences(nativeBacking)
  const nativeStore1 = createPlatformGuestParticipationStore({
    isNativePlatform: () => true,
    nativePreferences: nativePrefs,
  })
  await nativeStore1.whenReady()
  assert.equal(nativeBacking.get(STORAGE_KEY), legacyV1)

  for (const command of commands) {
    await nativeStore1.dispatch(command)
  }
  nativeStore1.dispose()

  const persistedNativeParsed = JSON.parse(nativeBacking.get(STORAGE_KEY)!) as {
    schemaVersion: number
  }
  assert.equal(persistedNativeParsed.schemaVersion, 3)

  const nativeStore2 = createPlatformGuestParticipationStore({
    isNativePlatform: () => true,
    nativePreferences: nativePrefs,
  })
  await nativeStore2.whenReady()
  const nativeReloaded = nativeStore2.getSnapshot().data

  // Web and Native reload equivalence
  assert.deepEqual(nativeReloaded, webReloaded)
  assert.equal(nativeReloaded.completedChallenges[c1]?.completedOn, day1)
  assert.equal(nativeReloaded.inProgressChallenges[c2]?.screenId, 'screen-2')
  assert.equal(nativeReloaded.savedChallenges[c1]?.savedOn, day1)
  assert.equal(nativeReloaded.savedScriptures[0]?.reference, '1 Thessalonians 5:16–18')
  assert.equal(nativeReloaded.lastOpenedChallenge?.resumeDismissedOn, day1)
  assert.equal(nativeReloaded.earnedAwards[thematicAwardId]?.earnedOn, day2)
  assert.equal(nativeReloaded.earnedAwards[thematicAwardId]?.hubAnnouncementAcked, true)
  assert.equal(nativeReloaded.earnedAwards[thematicAwardId]?.cardViewed, false)
  assert.equal(nativeReloaded.earnedAwards[thematicAwardId]?.earnedCard?.title, 'At Table with the Lord')

  webStore2.dispose()
  nativeStore2.dispose()
})

test('V1->V3 migration write failure preserves V1 on disk across restart and completes migration on retry', async () => {
  const legacyV1 = makeLegacyV1EnvelopeJson()
  const backing = new Map<string, string>([[STORAGE_KEY, legacyV1]])
  let failWrite = true

  const preferences = createPreferences(backing, {
    set: async ({ key, value }) => {
      if (failWrite) {
        throw new Error('Disk full during V1->V3 migration')
      }
      backing.set(key, value)
    },
  })

  const store1 = createReaderParticipationStore(
    createEnvelopePersistenceAdapter({
      storageKey: STORAGE_KEY,
      driver: createCapacitorPreferencesDriver({ preferences }),
    }),
  )
  await store1.whenReady()

  await store1.dispatch({
    type: 'recordEarnedAwards',
    awards: [
      {
        awardId: thematicAwardId,
        discoveryId: 'discovery:2026-11:table-fellowship',
        earnedOn: day2,
        earnedCard: makeValidCardSnapshot(),
      },
    ],
  })

  // Write failed: health is writeFailed, pending write retained, V1 on disk untouched (no partial V3!)
  assert.equal(store1.getSnapshot().health, 'writeFailed')
  assert.equal(store1.getSnapshot().hasPendingWrites, true)
  assert.equal(backing.get(STORAGE_KEY), legacyV1)
  assert.ok(store1.getSnapshot().data.earnedAwards[thematicAwardId])

  // Recover via retry (`flushPending()`) -> upgrades to V3 cleanly
  failWrite = false
  await store1.flushPending()
  assert.equal(store1.getSnapshot().health, 'ok')
  assert.equal(store1.getSnapshot().hasPendingWrites, false)
  assert.equal(JSON.parse(backing.get(STORAGE_KEY)!).schemaVersion, 3)
  store1.dispose()

  // Also verify cold restart after an unretried migration write failure preserves V1 intact
  const backing2 = new Map<string, string>([[STORAGE_KEY, legacyV1]])
  let failWrite2 = true
  const prefs2 = createPreferences(backing2, {
    set: async ({ key, value }) => {
      if (failWrite2) throw new Error('Simulated failure')
      backing2.set(key, value)
    },
  })
  const failedSession = createReaderParticipationStore(
    createEnvelopePersistenceAdapter({
      storageKey: STORAGE_KEY,
      driver: createCapacitorPreferencesDriver({ preferences: prefs2 }),
    }),
  )
  await failedSession.whenReady()
  await failedSession.dispatch({
    type: 'recordEarnedAwards',
    awards: [
      {
        awardId: fullMonthAwardId,
        discoveryId: 'discovery:2026-11:full-month',
        earnedOn: day3,
      },
    ],
  })
  assert.equal(backing2.get(STORAGE_KEY), legacyV1)
  failedSession.dispose()

  failWrite2 = false
  const restartedSession = createReaderParticipationStore(
    createEnvelopePersistenceAdapter({
      storageKey: STORAGE_KEY,
      driver: createCapacitorPreferencesDriver({ preferences: prefs2 }),
    }),
  )
  await restartedSession.whenReady()
  assert.equal(restartedSession.getSnapshot().health, 'ok')
  assert.equal(restartedSession.getSnapshot().distinctCompletedCount, 1)
  assert.deepEqual(restartedSession.getSnapshot().data.earnedAwards, {})
  await restartedSession.dispatch({
    type: 'recordEarnedAwards',
    awards: [
      {
        awardId: fullMonthAwardId,
        discoveryId: 'discovery:2026-11:full-month',
        earnedOn: day3,
      },
    ],
  })
  assert.equal(JSON.parse(backing2.get(STORAGE_KEY)!).schemaVersion, 3)
  assert.equal(restartedSession.getSnapshot().data.earnedAwards[fullMonthAwardId]?.earnedOn, day3)
  restartedSession.dispose()
})

test('V2 parser rejects invalid award IDs, dates, mismatched fields, and invalid snapshots while retaining valid awards', () => {
  const validCard = makeValidCardSnapshot()
  const rawV2 = JSON.stringify({
    schemaVersion: 2,
    data: {
      completedChallenges: {},
      inProgressChallenges: {},
      savedChallenges: {},
      savedScriptures: [],
      lastOpenedChallenge: null,
      earnedAwards: {
        // 1. Valid award + valid snapshot (with smuggled passage stripped)
        [thematicAwardId]: {
          awardId: thematicAwardId,
          kind: 'thematic',
          publicationYearMonth: '2026-11',
          discoveryId: 'discovery:2026-11:table-fellowship',
          earnedOn: day2,
          hubAnnouncementAcked: true,
          cardViewed: false,
          cardDocumentId: 'card-2026-11-table-fellowship',
          earnedCard: {
            ...validCard,
            passage: 'MUST BE STRIPPED',
          },
        },
        // 2. Valid award + INVALID snapshot (http URL) -> award retained, fabricated/bad card omitted
        [fullMonthAwardId]: {
          awardId: fullMonthAwardId,
          kind: 'fullMonth',
          publicationYearMonth: '2026-11',
          discoveryId: 'discovery:2026-11:full-month',
          earnedOn: day3,
          hubAnnouncementAcked: false,
          cardViewed: true,
          earnedCard: {
            ...validCard,
            cardDocumentId: 'card-2026-11-full-month',
            imageUrl: 'http://cdn.sanity.io/images/80016lrq/staging/insecure.png',
          },
        },
        // 3. Invalid award IDs / namespaces / prototype-lab aliases
        'card:foundation:2026-11:welcome': { earnedOn: day2 },
        'card:monthly:2026-13:bad-month': { earnedOn: day2 },
        'card:monthly:2026-11:pilot-sample': { earnedOn: day2 },
        'card:monthly:2026-11:lab-test': { earnedOn: day2 },
        'card:monthly:2026-11:prototype-card': { earnedOn: day2 },
        'card:monthly:2026-11:Bad_Slug': { earnedOn: day2 },
        // 4. Invalid earnedOn date
        'card:monthly:2026-11:bad-date': { earnedOn: '2026-02-29' },
        // 5. Mismatched inner publicationYearMonth
        'card:monthly:2026-11:wrong-month-meta': {
          publicationYearMonth: '2026-12',
          earnedOn: day2,
        },
      },
    },
  })

  const parsed = parseParticipationEnvelope(rawV2)
  assert.equal(parsed.health, 'ok')
  assert.deepEqual(Object.keys(parsed.data.earnedAwards).sort(), [
    fullMonthAwardId,
    thematicAwardId,
  ])

  const thematic = parsed.data.earnedAwards[thematicAwardId]
  assert.equal(thematic.earnedOn, day2)
  assert.equal(thematic.hubAnnouncementAcked, true)
  assert.equal(thematic.cardViewed, false)
  assert.ok(thematic.earnedCard)
  assert.equal('passage' in thematic.earnedCard, false)

  const fullMonth = parsed.data.earnedAwards[fullMonthAwardId]
  assert.equal(fullMonth.earnedOn, day3)
  assert.equal(fullMonth.cardViewed, true)
  assert.equal(fullMonth.earnedCard, undefined)

  const reserialized = serializeParticipationEnvelope(parsed.data)
  assert.equal(reserialized.includes('MUST BE STRIPPED'), false)
  assert.equal(reserialized.includes('insecure.png'), false)
})

test('V2 Notebook entry migrates to V3 and replays only the awards known at entry', async () => {
  const legacy = JSON.parse(makeLegacyV1EnvelopeJson())
  const v2 = JSON.stringify({
    schemaVersion: 2,
    data: {
      ...legacy.data,
      earnedAwards: {
        [thematicAwardId]: {
          earnedOn: day2,
          cardViewed: true,
          hubAnnouncementAcked: true,
          earnedCard: makeValidCardSnapshot(),
        },
      },
    },
  })
  const backing = new Map([[STORAGE_KEY, v2]])
  let failWrites = true
  let successfulWrites = 0
  const createStore = (driver: KeyValueStorageDriver) => createReaderParticipationStore(
    createEnvelopePersistenceAdapter({ storageKey: STORAGE_KEY, driver }),
  )
  const store = createStore(createCapacitorPreferencesDriver({
    preferences: createPreferences(backing, {
      set: async ({ key, value }) => {
        if (failWrites) throw new Error('Storage write failed')
        successfulWrites += 1
        backing.set(key, value)
      },
    }),
  }))
  await store.whenReady()
  const initialData = store.getSnapshot().data
  assert.deepEqual(selectNewDiscoveryAwardIds(initialData), [thematicAwardId])
  assert.equal(backing.get(STORAGE_KEY), v2)

  await Promise.all([acknowledgeNotebookEntry(store), acknowledgeNotebookEntry(store)])
  assert.equal(store.getSnapshot().health, 'writeFailed')
  assert.equal(store.getSnapshot().hasPendingWrites, true)
  assert.equal(backing.get(STORAGE_KEY), v2)
  assert.deepEqual(selectNewDiscoveryAwardIds(store.getSnapshot().data), [thematicAwardId])

  const other = createStore(createCapacitorPreferencesDriver({ preferences: createPreferences(backing) }))
  await other.whenReady()
  await other.dispatch({
    type: 'recordEarnedAwards',
    awards: [{ awardId: fullMonthAwardId, discoveryId: 'discovery:2026-11:full-month', earnedOn: day2 }],
  })
  other.dispose()
  const beforeRetry = parseParticipationEnvelope(backing.get(STORAGE_KEY)!).data
  assert.deepEqual([...selectNewDiscoveryAwardIds(beforeRetry)].sort(), [fullMonthAwardId, thematicAwardId].sort())

  failWrites = false
  await Promise.all([store.flushPending(), store.flushPending()])
  assert.equal(store.getSnapshot().health, 'ok')
  assert.equal(store.getSnapshot().hasPendingWrites, false)
  assert.equal(successfulWrites, 1)
  const restored = createStore(createCapacitorPreferencesDriver({ preferences: createPreferences(backing) }))
  await restored.whenReady()
  assert.deepEqual(restored.getSnapshot().data, {
    ...beforeRetry,
    notebookAcknowledgedAwardIds: [thematicAwardId],
  })
  assert.deepEqual(selectNewDiscoveryAwardIds(restored.getSnapshot().data), [fullMonthAwardId])
  assert.equal(JSON.parse(backing.get(STORAGE_KEY)!).schemaVersion, 3)
  assert.deepEqual(beforeRetry.earnedAwards[thematicAwardId], initialData.earnedAwards[thematicAwardId])

  await restored.dispatch({ type: 'reconcileChallengeAliases', aliases: { [c1]: c2 } })
  assert.deepEqual(restored.getSnapshot().data.notebookAcknowledgedAwardIds, [thematicAwardId])
  await acknowledgeNotebookEntry(restored)
  const acknowledged = restored.getSnapshot()
  await acknowledgeNotebookEntry(restored)
  assert.equal(restored.getSnapshot(), acknowledged)
  assert.deepEqual(selectNewDiscoveryAwardIds(acknowledged.data), [])
  assert.deepEqual(acknowledged.data.earnedAwards, beforeRetry.earnedAwards)
  store.dispose()
  restored.dispose()
})

test('V3 restore deduplicates Notebook acknowledgements and ignores IDs without earned awards', () => {
  const raw = JSON.stringify({
    schemaVersion: 3,
    data: {
      earnedAwards: { [thematicAwardId]: { earnedOn: day2 } },
      notebookAcknowledgedAwardIds: [fullMonthAwardId, thematicAwardId, thematicAwardId, 9, '__proto__'],
    },
  })
  const restored = parseParticipationEnvelope(raw)
  assert.equal(restored.health, 'ok')
  assert.deepEqual(restored.data.notebookAcknowledgedAwardIds, [thematicAwardId])
  assert.deepEqual(selectNewDiscoveryAwardIds(restored.data), [])
  assert.deepEqual(parseParticipationEnvelope(serializeParticipationEnvelope(restored.data)), restored)
})

test('never overwrites newer versions, structurally invalid envelopes, corrupt JSON, or storage read failures', async () => {
  const cases = [
    {
      label: 'V4 future schema',
      raw: JSON.stringify({ schemaVersion: 4, data: { earnedAwards: {} } }),
      expectedHealth: 'unsupportedNewerSchema' as const,
    },
    {
      label: 'Invalid V3 Notebook acknowledgements',
      raw: JSON.stringify({ schemaVersion: 3, data: { notebookAcknowledgedAwardIds: {} } }),
      expectedHealth: 'corruptStoredData' as const,
    },
    {
      label: 'Invalid V2 earnedAwards array',
      raw: JSON.stringify({ schemaVersion: 2, data: { earnedAwards: [] } }),
      expectedHealth: 'corruptStoredData' as const,
    },
    {
      label: 'Invalid V2 earnedAwards null',
      raw: JSON.stringify({ schemaVersion: 2, data: { earnedAwards: null } }),
      expectedHealth: 'corruptStoredData' as const,
    },
    {
      label: 'Corrupt JSON',
      raw: '{not-valid-v2-json',
      expectedHealth: 'corruptStoredData' as const,
    },
  ]

  for (const testCase of cases) {
    const backing = new Map<string, string>([[STORAGE_KEY, testCase.raw]])
    const driver = createCapacitorPreferencesDriver({
      preferences: createPreferences(backing),
    })
    const store = createReaderParticipationStore(
      createEnvelopePersistenceAdapter({ storageKey: STORAGE_KEY, driver }),
    )
    await store.whenReady()
    assert.equal(store.getSnapshot().health, testCase.expectedHealth, testCase.label)

    await acknowledgeNotebookEntry(store)
    assert.equal(store.getSnapshot().hasPendingWrites, false)
    assert.equal(backing.get(STORAGE_KEY), testCase.raw)

    await store.dispatch({
      type: 'recordEarnedAwards',
      awards: [
        {
          awardId: thematicAwardId,
          discoveryId: 'discovery:2026-11:table-fellowship',
          earnedOn: day2,
        },
      ],
    })
    assert.equal(backing.get(STORAGE_KEY), testCase.raw, `${testCase.label} must not be overwritten`)
    assert.equal(store.getSnapshot().health, testCase.expectedHealth)
    store.dispose()
  }

  // Driver read failure must not overwrite existing payload either
  const unreadBacking = new Map<string, string>([[STORAGE_KEY, makeLegacyV1EnvelopeJson()]])
  let writeCalled = false
  const failingReadDriver: KeyValueStorageDriver = {
    getItem: async () => {
      throw new Error('Native keychain/preferences read failure')
    },
    setItem: async () => {
      writeCalled = true
    },
    removeItem: async () => {
      unreadBacking.delete(STORAGE_KEY)
    },
  }
  const failReadStore = createReaderParticipationStore(
    createEnvelopePersistenceAdapter({ storageKey: STORAGE_KEY, driver: failingReadDriver }),
  )
  await failReadStore.whenReady()
  assert.equal(failReadStore.getSnapshot().health, 'storageUnavailable')
  await failReadStore.dispatch({
    type: 'recordEarnedAwards',
    awards: [
      {
        awardId: thematicAwardId,
        discoveryId: 'discovery:2026-11:table-fellowship',
        earnedOn: day2,
      },
    ],
  })
  assert.equal(writeCalled, false)
  assert.equal(failReadStore.getSnapshot().hasPendingWrites, true)
  failReadStore.dispose()
})

test('clearing local data during pending award write prevents award resurrection on sync web and async native drivers', async () => {
  // Async Capacitor Preferences race test
  const backing = new Map<string, string>()
  const setStarted = createDeferred<void>()
  const setGate = createDeferred<void>()
  const preferences = createPreferences(backing, {
    set: async ({ key, value }) => {
      setStarted.resolve()
      await setGate.promise
      backing.set(key, value)
    },
  })

  const store = createReaderParticipationStore(
    createEnvelopePersistenceAdapter({
      storageKey: STORAGE_KEY,
      driver: createCapacitorPreferencesDriver({ preferences }),
    }),
  )
  await store.whenReady()

  const pendingAwardWrite = store.dispatch({
    type: 'recordEarnedAwards',
    awards: [
      {
        awardId: thematicAwardId,
        discoveryId: 'discovery:2026-11:table-fellowship',
        earnedOn: day2,
        earnedCard: makeValidCardSnapshot(),
      },
    ],
  })
  await setStarted.promise
  const clearPromise = store.clearLocalData()
  setGate.resolve()
  await Promise.all([pendingAwardWrite, clearPromise])

  assert.equal(backing.has(STORAGE_KEY), false)
  assert.deepEqual(store.getSnapshot().data.earnedAwards, {})
  assert.equal(store.getSnapshot().hasPendingWrites, false)
  assert.equal(store.getSnapshot().health, 'ok')

  const reloaded = createReaderParticipationStore(
    createEnvelopePersistenceAdapter({
      storageKey: STORAGE_KEY,
      driver: createCapacitorPreferencesDriver({ preferences: createPreferences(backing) }),
    }),
  )
  await reloaded.whenReady()
  assert.deepEqual(reloaded.getSnapshot().data.earnedAwards, {})
  store.dispose()
  reloaded.dispose()

  // Sync web driver clear after write failure
  const webMap = new Map<string, string>()
  let failWebWrite = true
  const webDriver = createWebLocalStorageDriver({
    storage: {
      getItem: k => webMap.get(k) ?? null,
      setItem: (k, v) => {
        if (failWebWrite) throw new Error('QuotaExceededError')
        webMap.set(k, v)
      },
      removeItem: k => {
        webMap.delete(k)
      },
    },
  })
  const webStore = createReaderParticipationStore(
    createEnvelopePersistenceAdapter({ storageKey: STORAGE_KEY, driver: webDriver }),
  )
  await webStore.dispatch({
    type: 'recordEarnedAwards',
    awards: [
      {
        awardId: fullMonthAwardId,
        discoveryId: 'discovery:2026-11:full-month',
        earnedOn: day3,
      },
    ],
  })
  assert.equal(webStore.getSnapshot().hasPendingWrites, true)
  failWebWrite = false
  await webStore.clearLocalData()
  await webStore.flushPending()
  assert.equal(webMap.has(STORAGE_KEY), false)
  assert.deepEqual(webStore.getSnapshot().data.earnedAwards, {})
  webStore.dispose()
})
