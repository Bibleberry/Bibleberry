import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createCapacitorPreferencesDriver,
  type CapacitorPreferencesBridge,
} from '../../src/participation/drivers/capacitorPreferencesDriver.ts'
import { parseLocalCalendarDate, parseStoredChallengeId } from '../../src/participation/identity.ts'
import {
  createEnvelopePersistenceAdapter,
  type KeyValueStorageDriver,
} from '../../src/participation/persistence.ts'
import {
  createPlatformGuestParticipationStore,
} from '../../src/participation/defaultGuestStore.ts'
import { createReaderParticipationStore } from '../../src/participation/store.ts'

const STORAGE_KEY = 'bibleberry-native-test-participation-v1'
const completionChallenge = parseStoredChallengeId('cms:native-poc-completion')!
const resumeChallenge = parseStoredChallengeId('cms:native-poc-resume')!
const day = parseLocalCalendarDate('2026-11-10')!

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

function createStore(driver: KeyValueStorageDriver) {
  return createReaderParticipationStore(
    createEnvelopePersistenceAdapter({ storageKey: STORAGE_KEY, driver }),
  )
}

test('native Preferences driver persists async guest participation through reload', async () => {
  const backing = new Map<string, string>()
  const hydrationGate = createDeferred<{ readonly value: string | null }>()
  let delayFirstRead = true
  const preferences = createPreferences(backing, {
    get: async ({ key }) => {
      if (delayFirstRead) {
        delayFirstRead = false
        return hydrationGate.promise
      }
      return { value: backing.get(key) ?? null }
    },
  })
  const driver = createCapacitorPreferencesDriver({ preferences })
  const store = createStore(driver)

  assert.equal(store.getSnapshot().status, 'hydrating')
  const earlyCompletion = store.dispatch({
    type: 'completeChallenge',
    challengeId: completionChallenge,
    completedOn: day,
  })
  const earlyScripture = store.dispatch({
    type: 'setScriptureSaved',
    scripture: { reference: 'Psalm 23:1', translation: 'WEBP' },
    saved: true,
    savedOn: day,
  })
  hydrationGate.resolve({ value: null })
  await store.whenReady()
  await Promise.all([earlyCompletion, earlyScripture])

  const repeatedProgressWrites = Promise.all([
    store.dispatch({
      type: 'saveChallengeProgress',
      challengeId: resumeChallenge,
      screenId: 'screen-1',
      updatedOn: day,
    }),
    store.dispatch({
      type: 'saveChallengeProgress',
      challengeId: resumeChallenge,
      screenId: 'screen-2',
      updatedOn: day,
    }),
    store.dispatch({
      type: 'saveChallengeProgress',
      challengeId: resumeChallenge,
      screenId: 'screen-3',
      updatedOn: day,
    }),
  ])
  await repeatedProgressWrites

  assert.equal(store.getSnapshot().data.completedChallenges[completionChallenge].completedOn, day)
  assert.equal(store.getSnapshot().data.inProgressChallenges[resumeChallenge].screenId, 'screen-3')
  assert.equal(store.getSnapshot().data.savedScriptures[0].reference, 'Psalm 23:1')

  const reloadedStore = createStore(createCapacitorPreferencesDriver({ preferences }))
  await reloadedStore.whenReady()
  assert.equal(reloadedStore.getSnapshot().distinctCompletedCount, 1)
  assert.equal(
    reloadedStore.getSnapshot().data.inProgressChallenges[resumeChallenge].screenId,
    'screen-3',
  )
  assert.equal(reloadedStore.getSnapshot().data.savedScriptures[0].reference, 'Psalm 23:1')

  store.dispose()
  reloadedStore.dispose()
})

test('native Preferences write failures retain pending commands for retry', async () => {
  const backing = new Map<string, string>()
  let failNextWrite = true
  const preferences = createPreferences(backing, {
    set: async ({ key, value }) => {
      if (failNextWrite) {
        failNextWrite = false
        throw new Error('Temporary native storage failure')
      }
      backing.set(key, value)
    },
  })
  const store = createStore(createCapacitorPreferencesDriver({ preferences }))
  await store.whenReady()

  await store.dispatch({
    type: 'completeChallenge',
    challengeId: completionChallenge,
    completedOn: day,
  })
  assert.equal(store.getSnapshot().health, 'writeFailed')
  assert.equal(store.getSnapshot().hasPendingWrites, true)
  assert.equal(backing.has(STORAGE_KEY), false)

  await store.flushPending()
  assert.equal(store.getSnapshot().health, 'ok')
  assert.equal(store.getSnapshot().hasPendingWrites, false)
  assert.equal(backing.has(STORAGE_KEY), true)
  store.dispose()
})

test('clearing during a pending native write cannot restore cleared participation', async () => {
  const backing = new Map<string, string>()
  const writeStarted = createDeferred<void>()
  const writeGate = createDeferred<void>()
  const preferences = createPreferences(backing, {
    set: async ({ key, value }) => {
      writeStarted.resolve()
      await writeGate.promise
      backing.set(key, value)
    },
  })
  const store = createStore(createCapacitorPreferencesDriver({ preferences }))
  await store.whenReady()

  const write = store.dispatch({
    type: 'completeChallenge',
    challengeId: completionChallenge,
    completedOn: day,
  })
  await writeStarted.promise
  const clear = store.clearLocalData()
  writeGate.resolve()
  await Promise.all([write, clear])

  assert.equal(backing.has(STORAGE_KEY), false)
  assert.equal(store.getSnapshot().distinctCompletedCount, 0)
  assert.equal(store.getSnapshot().health, 'ok')
  store.dispose()
})

test('native storage never overwrites malformed or newer-schema participation envelopes', async () => {
  const protectedPayloads = [
    { value: '{not-json', health: 'corruptStoredData' },
    {
      value: JSON.stringify({ schemaVersion: 3, data: {} }),
      health: 'unsupportedNewerSchema',
    },
  ] as const

  for (const { value, health } of protectedPayloads) {
    const backing = new Map([[STORAGE_KEY, value]])
    const store = createStore(
      createCapacitorPreferencesDriver({ preferences: createPreferences(backing) }),
    )
    await store.whenReady()
    assert.equal(store.getSnapshot().health, health)
    await store.dispatch({
      type: 'completeChallenge',
      challengeId: completionChallenge,
      completedOn: day,
    })
    assert.equal(backing.get(STORAGE_KEY), value)
    assert.equal(store.getSnapshot().health, health)
    store.dispose()
  }
})

test('platform selection keeps hosted web on localStorage and chooses native driver in a shell', async () => {
  const nativeBacking = new Map<string, string>()
  const nativePreferences = createPreferences(nativeBacking)
  const webBacking = new Map<string, string>()
  const webStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = {
    getItem: key => webBacking.get(key) ?? null,
    setItem: (key, value) => {
      webBacking.set(key, value)
    },
    removeItem: key => {
      webBacking.delete(key)
    },
  }
  let nativeDriverCalls = 0
  const nativeDriver: KeyValueStorageDriver = {
    getItem: key => {
      nativeDriverCalls += 1
      return createCapacitorPreferencesDriver({ preferences: nativePreferences }).getItem(key)
    },
    setItem: (key, value) => {
      nativeDriverCalls += 1
      return createCapacitorPreferencesDriver({ preferences: nativePreferences }).setItem(key, value)
    },
    removeItem: key => {
      nativeDriverCalls += 1
      return createCapacitorPreferencesDriver({ preferences: nativePreferences }).removeItem(key)
    },
  }

  const webStore = createPlatformGuestParticipationStore({
    isNativePlatform: () => false,
    nativeDriver,
    webStorage,
  })
  await webStore.whenReady()
  await webStore.dispatch({
    type: 'completeChallenge',
    challengeId: completionChallenge,
    completedOn: day,
  })
  assert.equal(webBacking.has('bibleberry-reader-participation-v1'), true)
  assert.equal(nativeBacking.size, 0)
  assert.equal(nativeDriverCalls, 0)
  webStore.dispose()

  const nativeStore = createPlatformGuestParticipationStore({
    isNativePlatform: () => true,
    nativeDriver,
    webStorage,
  })
  await nativeStore.whenReady()
  await nativeStore.dispatch({
    type: 'completeChallenge',
    challengeId: completionChallenge,
    completedOn: day,
  })
  assert.equal(nativeBacking.has('bibleberry-reader-participation-v1'), true)
  assert.equal(nativeDriverCalls > 0, true)
  nativeStore.dispose()
})
