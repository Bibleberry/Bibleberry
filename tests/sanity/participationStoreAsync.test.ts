import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { admitTrustedCatalogChallenge } from '../../src/participation/admission.ts'
import { createWebLocalStorageDriver } from '../../src/participation/drivers/webLocalStorageDriver.ts'
import { parseLocalCalendarDate, parseStoredChallengeId } from '../../src/participation/identity.ts'
import { derivePersistedHostRenderState } from '../../src/participation/persistedChallengeHostModel.ts'
import {
  createEnvelopePersistenceAdapter,
  serializeParticipationEnvelope,
  type KeyValueStorageDriver,
} from '../../src/participation/persistence.ts'
import { createReaderParticipationStore } from '../../src/participation/store.ts'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const TEST_STORAGE_KEY = 'bibleberry-test-participation-v1'

interface Deferred<T> {
  readonly promise: Promise<T>
  resolve(value: T | PromiseLike<T>): void
  reject(reason?: unknown): void
}

function createDeferred<T>(): Deferred<T> {
  let resolveFn!: (value: T | PromiseLike<T>) => void
  let rejectFn!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolveFn = res
    rejectFn = rej
  })
  return { promise, resolve: resolveFn, reject: rejectFn }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolvePromise => {
    setTimeout(resolvePromise, ms)
  })
}

const c1 = parseStoredChallengeId('cms:berrymark-challenge-2026-11-02-rejoice-always')!
const c2 = parseStoredChallengeId('cms:berrymark-challenge-2026-11-03-pray-continually')!
const day1 = parseLocalCalendarDate('2026-11-06')!
const day2 = parseLocalCalendarDate('2026-11-07')!

test('hydrates synchronously with web storage driver, preserves Object.is snapshot stability, and reconciles external changes', async () => {
  const backing = new Map<string, string>()
  const externalListeners = new Set<() => void>()

  const createSyncDriver = (): KeyValueStorageDriver => ({
    getItem: key => backing.get(key) ?? null,
    setItem: (key, value) => {
      backing.set(key, value)
    },
    removeItem: key => {
      backing.delete(key)
    },
    onExternalChange: (_key, listener) => {
      externalListeners.add(listener)
      return () => externalListeners.delete(listener)
    },
  })

  const storeA = createReaderParticipationStore(
    createEnvelopePersistenceAdapter({
      storageKey: TEST_STORAGE_KEY,
      driver: createSyncDriver(),
    }),
  )
  const storeB = createReaderParticipationStore(
    createEnvelopePersistenceAdapter({
      storageKey: TEST_STORAGE_KEY,
      driver: createSyncDriver(),
    }),
  )

  // Immediate synchronous hydration (`status === 'ready'`)
  const snap1 = storeA.getSnapshot()
  const snap2 = storeA.getSnapshot()
  assert.equal(snap1.status, 'ready')
  assert.equal(Object.is(snap1, snap2), true)

  // Unchanged external refresh preserves exact snapshot reference and emits zero notifications
  let notificationsA = 0
  storeA.subscribe(() => {
    notificationsA += 1
  })
  for (const notify of externalListeners) notify()
  assert.equal(notificationsA, 0)
  assert.equal(Object.is(storeA.getSnapshot(), snap1), true)

  // Store A saves c1; Store B completes c2 without notifying Store B beforehand -> fresh-read replay preserves both
  await storeA.dispatch({
    type: 'setChallengeSaved',
    challengeId: c1,
    saved: true,
    savedOn: day1,
  })
  await storeB.dispatch({
    type: 'completeChallenge',
    challengeId: c2,
    completedOn: day1,
  })

  // Notify external listeners (simulating cross-tab `storage` / `visibilitychange`)
  for (const notify of externalListeners) notify()

  assert.equal(storeA.getSnapshot().distinctCompletedCount, 1)
  assert.equal(c1 in storeA.getSnapshot().data.savedChallenges, true)
  assert.equal(c2 in storeA.getSnapshot().data.completedChallenges, true)

  // Repeat identical command is a strict no-op with Object.is snapshot preservation
  const beforeNoop = storeA.getSnapshot()
  await storeA.dispatch({
    type: 'completeChallenge',
    challengeId: c2,
    completedOn: day2,
  })
  assert.equal(Object.is(storeA.getSnapshot(), beforeNoop), true)

  // Web localStorage driver wrapper also works cleanly against a Storage-compatible object
  const webBacking = new Map<string, string>()
  const webDriver = createWebLocalStorageDriver({
    storage: {
      getItem: k => webBacking.get(k) ?? null,
      setItem: (k, v) => {
        webBacking.set(k, v)
      },
      removeItem: k => {
        webBacking.delete(k)
      },
    },
  })
  webDriver.setItem(TEST_STORAGE_KEY, backing.get(TEST_STORAGE_KEY)!)
  const reloadedStore = createReaderParticipationStore(
    createEnvelopePersistenceAdapter({
      storageKey: TEST_STORAGE_KEY,
      driver: webDriver,
    }),
  )
  assert.equal(reloadedStore.getSnapshot().distinctCompletedCount, 1)
  assert.equal(c1 in reloadedStore.getSnapshot().data.savedChallenges, true)

  storeA.dispose()
  storeB.dispose()
  reloadedStore.dispose()
})

test('buffers commands dispatched during async hydration without overwriting unhydrated storage, then merges and flushes', async () => {
  const preExistingJson = JSON.stringify({
    schemaVersion: 1,
    data: {
      completedChallenges: { [c1]: { completedOn: day1 } },
      inProgressChallenges: {},
      savedChallenges: { [c1]: { savedOn: day1 } },
      savedScriptures: [],
      lastOpenedChallenge: null,
    },
  })

  let storedRaw: string | null = preExistingJson
  const initialReadGate = createDeferred<string | null>()
  let initialReadUsed = false
  const setCalls: string[] = []

  const asyncDriver: KeyValueStorageDriver = {
    getItem: async () => {
      if (!initialReadUsed) {
        initialReadUsed = true
        return initialReadGate.promise
      }
      return storedRaw
    },
    setItem: async (_key, value) => {
      await delay(5)
      storedRaw = value
      setCalls.push(value)
    },
    removeItem: async () => {
      storedRaw = null
    },
  }

  const store = createReaderParticipationStore(
    createEnvelopePersistenceAdapter({
      storageKey: TEST_STORAGE_KEY,
      driver: asyncDriver,
    }),
  )

  assert.equal(store.getSnapshot().status, 'hydrating')
  assert.equal(store.getSnapshot().distinctCompletedCount, 0)

  // Dispatch two commands BEFORE hydration finishes:
  // 1) unsave `c1` (which exists on disk, though memory hasn't seen it yet!)
  // 2) complete `c2`
  const p1 = store.dispatch({
    type: 'setChallengeSaved',
    challengeId: c1,
    saved: false,
    savedOn: day2,
  })
  const p2 = store.dispatch({
    type: 'completeChallenge',
    challengeId: c2,
    completedOn: day2,
  })

  // Optimistic snapshot reflects `c2` immediately, and zero disk writes happen before hydration completes
  assert.equal(store.getSnapshot().status, 'hydrating')
  assert.equal(store.getSnapshot().hasPendingWrites, true)
  assert.equal(c2 in store.getSnapshot().data.completedChallenges, true)
  assert.equal(setCalls.length, 0)

  // Finish initial hydration
  initialReadGate.resolve(preExistingJson)
  await store.whenReady()
  await Promise.all([p1, p2])

  const finalSnap = store.getSnapshot()
  assert.equal(finalSnap.status, 'ready')
  assert.equal(finalSnap.hasPendingWrites, false)
  assert.equal(finalSnap.health, 'ok')
  // Pre-existing c1 completion + pre-hydration c2 completion are BOTH preserved; c1 unsave also applied!
  assert.equal(finalSnap.distinctCompletedCount, 2)
  assert.equal(finalSnap.data.completedChallenges[c1].completedOn, day1)
  assert.equal(finalSnap.data.completedChallenges[c2].completedOn, day2)
  assert.equal(c1 in finalSnap.data.savedChallenges, false)
  assert.equal(setCalls.length, 1)

  store.dispose()
})

test('retains pending commands across write failures and external refreshes, then recovers cleanly on retry', async () => {
  let storedRaw: string | null = null
  let shouldFailWrites = true
  let externalNotify: (() => void) | undefined

  const flakyDriver: KeyValueStorageDriver = {
    getItem: async () => storedRaw,
    setItem: async (_key, value) => {
      await delay(5)
      if (shouldFailWrites) {
        const quotaErr = new Error('QuotaExceededError')
        quotaErr.name = 'QuotaExceededError'
        throw quotaErr
      }
      storedRaw = value
    },
    removeItem: async () => {
      storedRaw = null
    },
    onExternalChange: (_key, listener) => {
      externalNotify = listener
      return () => {
        externalNotify = undefined
      }
    },
  }

  const store = createReaderParticipationStore(
    createEnvelopePersistenceAdapter({
      storageKey: TEST_STORAGE_KEY,
      driver: flakyDriver,
    }),
  )
  await store.whenReady()

  // Reader completes c1 while storage quota is full -> write fails, but optimistic completion is NOT lost
  await store.dispatch({
    type: 'completeChallenge',
    challengeId: c1,
    completedOn: day1,
  })
  assert.equal(store.getSnapshot().health, 'writeFailed')
  assert.equal(store.getSnapshot().hasPendingWrites, true)
  assert.equal(store.getSnapshot().distinctCompletedCount, 1)
  assert.equal(storedRaw, null)

  // External tab writes savedChallenge c2 and triggers external refresh while c1 is still pending
  storedRaw = JSON.stringify({
    schemaVersion: 1,
    data: {
      completedChallenges: {},
      inProgressChallenges: {},
      savedChallenges: { [c2]: { savedOn: day1 } },
      savedScriptures: [],
      lastOpenedChallenge: null,
    },
  })
  externalNotify?.()
  await delay(15)

  // External refresh merges saved c2 WITHOUT wiping pending completion c1!
  const midSnap = store.getSnapshot()
  assert.equal(midSnap.health, 'writeFailed')
  assert.equal(midSnap.hasPendingWrites, true)
  assert.equal(midSnap.distinctCompletedCount, 1)
  assert.equal(c1 in midSnap.data.completedChallenges, true)
  assert.equal(c2 in midSnap.data.savedChallenges, true)

  // Storage recovers; `flushPending()` commits pending completion c1 on top of c2 and restores health: 'ok'
  shouldFailWrites = false
  await store.flushPending()

  const recoveredSnap = store.getSnapshot()
  assert.equal(recoveredSnap.health, 'ok')
  assert.equal(recoveredSnap.hasPendingWrites, false)
  assert.equal(recoveredSnap.distinctCompletedCount, 1)
  assert.equal(c1 in recoveredSnap.data.completedChallenges, true)
  assert.equal(c2 in recoveredSnap.data.savedChallenges, true)

  // Verify durable payload via fresh store
  const verifyStore = createReaderParticipationStore(
    createEnvelopePersistenceAdapter({
      storageKey: TEST_STORAGE_KEY,
      driver: flakyDriver,
    }),
  )
  await verifyStore.whenReady()
  assert.equal(verifyStore.getSnapshot().distinctCompletedCount, 1)
  assert.equal(c2 in verifyStore.getSnapshot().data.savedChallenges, true)

  store.dispose()
  verifyStore.dispose()
})

test('never overwrites corrupt JSON or unsupportedNewerSchema envelopes automatically, and sanitizes injected fields', async () => {
  // 1. Corrupt JSON is preserved until explicit `clearLocalData()`
  let corruptBacking: string | null = '{broken-json'
  const corruptDriver: KeyValueStorageDriver = {
    getItem: () => corruptBacking,
    setItem: (_k, v) => {
      corruptBacking = v
    },
    removeItem: () => {
      corruptBacking = null
    },
  }
  const corruptStore = createReaderParticipationStore(
    createEnvelopePersistenceAdapter({
      storageKey: TEST_STORAGE_KEY,
      driver: corruptDriver,
    }),
  )
  assert.equal(corruptStore.getSnapshot().health, 'corruptStoredData')
  await corruptStore.dispatch({
    type: 'completeChallenge',
    challengeId: c1,
    completedOn: day1,
  })
  // In-session memory tracks completion, while raw corrupt payload on disk is untouched
  assert.equal(corruptStore.getSnapshot().distinctCompletedCount, 1)
  assert.equal(corruptStore.getSnapshot().health, 'corruptStoredData')
  assert.equal(corruptBacking, '{broken-json')

  await corruptStore.clearLocalData()
  assert.equal(corruptBacking, null)
  assert.equal(corruptStore.getSnapshot().health, 'ok')
  assert.equal(corruptStore.getSnapshot().distinctCompletedCount, 0)
  corruptStore.dispose()

  // 2. Newer schema (`schemaVersion: 2`) is preserved until explicit `clearLocalData()`
  const futurePayload = JSON.stringify({
    schemaVersion: 2,
    futureField: 'keep-intact',
    data: { completedChallenges: { [c1]: { completedOn: day1 } } },
  })
  let futureBacking: string | null = futurePayload
  const futureDriver: KeyValueStorageDriver = {
    getItem: () => futureBacking,
    setItem: (_k, v) => {
      futureBacking = v
    },
    removeItem: () => {
      futureBacking = null
    },
  }
  const futureStore = createReaderParticipationStore(
    createEnvelopePersistenceAdapter({
      storageKey: TEST_STORAGE_KEY,
      driver: futureDriver,
    }),
  )
  assert.equal(futureStore.getSnapshot().health, 'unsupportedNewerSchema')
  await futureStore.dispatch({
    type: 'setChallengeSaved',
    challengeId: c2,
    saved: true,
    savedOn: day1,
  })
  assert.equal(c2 in futureStore.getSnapshot().data.savedChallenges, true)
  assert.equal(futureBacking, futurePayload)
  futureStore.dispose()

  // 3. Valid v1 envelope with injected passage text, pilot/draft IDs, or completed+inProgress overlap is sanitized
  const dirtyV1 = JSON.stringify({
    schemaVersion: 1,
    data: {
      completedChallenges: {
        [c1]: { completedOn: day1 },
        'pilot:a3-persistence-sample': { completedOn: day1 },
        'cms:drafts.2026-11-02-rejoice-always': { completedOn: day1 },
      },
      inProgressChallenges: {
        [c1]: { screenId: 's2', updatedOn: day2 },
        [c2]: { screenId: 's1', updatedOn: day1 },
      },
      savedChallenges: {},
      savedScriptures: [
        {
          key: 'untrusted',
          reference: ' 1 Thessalonians 5:16–18 ',
          translation: 'Not configured',
          savedOn: day1,
          passage: 'MUST BE STRIPPED ON LOAD',
          sourceChallengeId: 'pilot:a3-persistence-sample',
        },
      ],
      lastOpenedChallenge: {
        challengeId: 'pilot:a3-persistence-sample',
        openedOn: day1,
      },
    },
  })
  const sanitizedAdapter = createEnvelopePersistenceAdapter({
    storageKey: TEST_STORAGE_KEY,
    driver: {
      getItem: () => dirtyV1,
      setItem: () => {},
      removeItem: () => {},
    },
  })
  const sanitizedStore = createReaderParticipationStore(sanitizedAdapter)
  const sanitized = sanitizedStore.getSnapshot().data
  assert.deepEqual(Object.keys(sanitized.completedChallenges), [c1])
  assert.deepEqual(Object.keys(sanitized.inProgressChallenges), [c2])
  assert.equal(sanitized.lastOpenedChallenge, null)
  assert.equal(sanitized.savedScriptures.length, 1)
  assert.equal(sanitized.savedScriptures[0].translation, null)
  assert.equal('passage' in sanitized.savedScriptures[0], false)
  assert.equal('sourceChallengeId' in sanitized.savedScriptures[0], false)
  const reserialized = serializeParticipationEnvelope(sanitized)
  assert.equal(reserialized.includes('MUST BE STRIPPED'), false)
  sanitizedStore.dispose()
})

test('local data reset CANNOT be undone by an earlier delayed async load, getItem, or in-flight setItem completing afterward', async () => {
  // ---------------------------------------------------------------------------
  // Case A: Reset invoked while delayed initial `load()` is still in flight
  // ---------------------------------------------------------------------------
  {
    const seededJson = JSON.stringify({
      schemaVersion: 1,
      data: {
        completedChallenges: { [c1]: { completedOn: day1 } },
        inProgressChallenges: {},
        savedChallenges: {},
        savedScriptures: [],
        lastOpenedChallenge: null,
      },
    })
    let backing: string | null = seededJson
    const slowInitialLoad = createDeferred<string | null>()
    let firstLoad = true

    const driver: KeyValueStorageDriver = {
      getItem: () => {
        if (firstLoad) {
          firstLoad = false
          return slowInitialLoad.promise
        }
        return Promise.resolve(backing)
      },
      setItem: async (_k, v) => {
        backing = v
      },
      removeItem: async () => {
        await delay(5)
        backing = null
      },
    }

    const store = createReaderParticipationStore(
      createEnvelopePersistenceAdapter({ storageKey: TEST_STORAGE_KEY, driver }),
    )
    assert.equal(store.getSnapshot().status, 'hydrating')

    // User initiates reset BEFORE initial load finishes
    const clearPromise = store.clearLocalData()
    assert.equal(store.getSnapshot().status, 'ready')
    assert.equal(store.getSnapshot().distinctCompletedCount, 0)

    // Now the earlier slow load resolves with pre-reset accomplishments
    slowInitialLoad.resolve(seededJson)
    await clearPromise
    await store.whenReady()

    assert.equal(store.getSnapshot().distinctCompletedCount, 0)
    assert.equal(backing, null)
    store.dispose()
  }

  // ---------------------------------------------------------------------------
  // Case B: Reset invoked while delayed `getItem()` inside `flushCommands` is in flight
  // ---------------------------------------------------------------------------
  {
    let backing: string | null = null
    let interceptFlushRead = false
    const slowFlushRead = createDeferred<string | null>()
    let setItemCallCount = 0

    const driver: KeyValueStorageDriver = {
      getItem: () => {
        if (interceptFlushRead) {
          interceptFlushRead = false
          return slowFlushRead.promise
        }
        return Promise.resolve(backing)
      },
      setItem: async (_k, v) => {
        setItemCallCount += 1
        backing = v
      },
      removeItem: async () => {
        backing = null
      },
    }

    const store = createReaderParticipationStore(
      createEnvelopePersistenceAdapter({ storageKey: TEST_STORAGE_KEY, driver }),
    )
    await store.whenReady()

    interceptFlushRead = true
    const writePromise = store.dispatch({
      type: 'completeChallenge',
      challengeId: c1,
      completedOn: day1,
    })
    assert.equal(store.getSnapshot().distinctCompletedCount, 1)

    // User resets while `flushCommands` is awaiting `getItem`
    const clearPromise = store.clearLocalData()
    assert.equal(store.getSnapshot().distinctCompletedCount, 0)

    // Resolve slow `getItem` — AbortSignal must prevent `setItem` from ever executing
    slowFlushRead.resolve(null)
    await Promise.all([writePromise, clearPromise])

    assert.equal(setItemCallCount, 0, 'aborted pre-reset flush must not invoke setItem')
    assert.equal(backing, null)
    assert.equal(store.getSnapshot().distinctCompletedCount, 0)
    store.dispose()
  }

  // ---------------------------------------------------------------------------
  // Case C: Reset invoked AFTER delayed `setItem()` has ALREADY started in storage
  //         (slow 60ms `setItem` vs fast 2ms `removeItem` — critical race test!)
  // ---------------------------------------------------------------------------
  {
    let backing: string | null = null
    const operations: string[] = []
    const setItemStarted = createDeferred<void>()
    const allowSetItemToFinish = createDeferred<void>()

    const driver: KeyValueStorageDriver = {
      getItem: async () => {
        operations.push('getItem')
        return backing
      },
      setItem: async (_k, value) => {
        operations.push('setItem:start')
        setItemStarted.resolve()
        // Simulate a slow asynchronous storage write finishing well after user clicked reset
        await allowSetItemToFinish.promise
        await delay(30)
        backing = value
        operations.push('setItem:commit')
      },
      removeItem: async () => {
        operations.push('removeItem:start')
        // Intentionally much faster than `setItem` so an unserialized clear would finish TOO EARLY!
        await delay(2)
        backing = null
        operations.push('removeItem:commit')
      },
    }

    const store = createReaderParticipationStore(
      createEnvelopePersistenceAdapter({ storageKey: TEST_STORAGE_KEY, driver }),
    )
    await store.whenReady()
    operations.length = 0

    // 1. Start a write and wait until `driver.setItem` is actively in flight
    const staleWritePromise = store.dispatch({
      type: 'completeChallenge',
      challengeId: c1,
      completedOn: day1,
    })
    await setItemStarted.promise
    assert.equal(store.getSnapshot().distinctCompletedCount, 1)
    assert.equal(store.getSnapshot().hasPendingWrites, true)

    // 2. User initiates local data reset WHILE `driver.setItem` is in flight
    const clearPromise = store.clearLocalData()

    // UI snapshot must immediately reflect empty cleared state without waiting on slow write
    assert.equal(store.getSnapshot().distinctCompletedCount, 0)
    assert.equal(store.getSnapshot().hasPendingWrites, false)
    assert.deepEqual(store.getSnapshot().data.completedChallenges, {})

    // 3. Release the earlier slow `setItem` write so it commits to `backing` AFTER reset was requested
    allowSetItemToFinish.resolve()
    await Promise.all([staleWritePromise, clearPromise])

    // 4. Verify strict serialization: `removeItem` MUST execute AFTER `setItem:commit`
    assert.deepEqual(operations, [
      'getItem',
      'setItem:start',
      'setItem:commit',
      'removeItem:start',
      'removeItem:commit',
    ])
    assert.equal(backing, null, 'backing storage must remain empty after delayed pre-reset write settles')
    assert.equal(store.getSnapshot().distinctCompletedCount, 0)
    assert.equal(store.getSnapshot().hasPendingWrites, false)

    // 5. Instantiate a brand-new store on the same driver to prove reload sees empty cleared storage
    const postReloadStore = createReaderParticipationStore(
      createEnvelopePersistenceAdapter({ storageKey: TEST_STORAGE_KEY, driver }),
    )
    await postReloadStore.whenReady()
    assert.equal(postReloadStore.getSnapshot().distinctCompletedCount, 0)
    assert.deepEqual(postReloadStore.getSnapshot().data.completedChallenges, {})

    store.dispose()
    postReloadStore.dispose()
  }

  // ---------------------------------------------------------------------------
  // Case D: New post-reset action dispatched while pre-reset `setItem` + `clear` are still draining
  // ---------------------------------------------------------------------------
  {
    let backing: string | null = null
    let firstWrite = true
    const firstWriteStarted = createDeferred<void>()
    const releaseFirstWrite = createDeferred<void>()

    const driver: KeyValueStorageDriver = {
      getItem: async () => backing,
      setItem: async (_k, value) => {
        if (firstWrite) {
          firstWrite = false
          firstWriteStarted.resolve()
          await releaseFirstWrite.promise
          await delay(20)
        } else {
          await delay(5)
        }
        backing = value
      },
      removeItem: async () => {
        await delay(2)
        backing = null
      },
    }

    const store = createReaderParticipationStore(
      createEnvelopePersistenceAdapter({ storageKey: TEST_STORAGE_KEY, driver }),
    )
    await store.whenReady()

    // Pre-reset completion of c1 (slow in-flight write)
    const preResetWrite = store.dispatch({
      type: 'completeChallenge',
      challengeId: c1,
      completedOn: day1,
    })
    await firstWriteStarted.promise

    // User resets, then immediately bookmarks c2 in the fresh post-reset session
    const resetOp = store.clearLocalData()
    const postResetSave = store.dispatch({
      type: 'setChallengeSaved',
      challengeId: c2,
      saved: true,
      savedOn: day2,
    })

    // Optimistic snapshot has c2 saved and ZERO trace of pre-reset c1
    assert.equal(store.getSnapshot().distinctCompletedCount, 0)
    assert.equal(c1 in store.getSnapshot().data.completedChallenges, false)
    assert.equal(c2 in store.getSnapshot().data.savedChallenges, true)

    releaseFirstWrite.resolve()
    await Promise.all([preResetWrite, resetOp, postResetSave])

    // Both active store and newly reloaded store contain ONLY post-reset c2
    assert.equal(store.getSnapshot().distinctCompletedCount, 0)
    assert.equal(c2 in store.getSnapshot().data.savedChallenges, true)

    const reloaded = createReaderParticipationStore(
      createEnvelopePersistenceAdapter({ storageKey: TEST_STORAGE_KEY, driver }),
    )
    await reloaded.whenReady()
    assert.equal(reloaded.getSnapshot().distinctCompletedCount, 0)
    assert.equal(c1 in reloaded.getSnapshot().data.completedChallenges, false)
    assert.equal(c2 in reloaded.getSnapshot().data.savedChallenges, true)

    store.dispose()
    reloaded.dispose()
  }
})

test('serializes and coalesces rapid concurrent dispatches over slow async storage writes without lost updates', async () => {
  let backing: string | null = null
  let writeCount = 0

  const slowDriver: KeyValueStorageDriver = {
    getItem: async () => {
      await delay(3)
      return backing
    },
    setItem: async (_key, value) => {
      writeCount += 1
      await delay(15)
      backing = value
    },
    removeItem: async () => {
      backing = null
    },
  }

  const store = createReaderParticipationStore(
    createEnvelopePersistenceAdapter({ storageKey: TEST_STORAGE_KEY, driver: slowDriver }),
  )
  await store.whenReady()

  // Fire 4 dispatches concurrently without awaiting each one individually
  await Promise.all([
    store.dispatch({ type: 'recordChallengeOpened', challengeId: c1, openedOn: day1 }),
    store.dispatch({ type: 'saveChallengeProgress', challengeId: c1, screenId: 's2', updatedOn: day1 }),
    store.dispatch({ type: 'setChallengeSaved', challengeId: c2, saved: true, savedOn: day1 }),
    store.dispatch({
      type: 'setScriptureSaved',
      scripture: { reference: 'Psalm 23:1', translation: 'WEBP', sourceChallengeId: c1 },
      saved: true,
      savedOn: day1,
    }),
  ])

  const snap = store.getSnapshot()
  assert.equal(snap.hasPendingWrites, false)
  assert.equal(snap.health, 'ok')
  assert.equal(snap.data.lastOpenedChallenge?.challengeId, c1)
  assert.equal(snap.data.inProgressChallenges[c1].screenId, 's2')
  assert.equal(c2 in snap.data.savedChallenges, true)
  assert.equal(snap.data.savedScriptures.length, 1)
  // Subsequent queued commands coalesce behind the first active write (<= 2 writes instead of 4)
  assert.ok(writeCount >= 1 && writeCount <= 2)

  store.dispose()
})

test('PersistedChallengeHost renders accessible hydrating state during async storage load and mounts at resumed screen once ready', async () => {
  const sampleChallenge = {
    title: 'Async Hydration Host Sample',
    summary: 'Verifies hydrating -> ready transition.',
    primaryScripture: {
      id: 's-primary',
      reference: 'Psalm 23:1',
      translation: 'WEBP',
      textStatus: 'referenceOnly' as const,
      practiceStatus: 'notConfigured' as const,
      usageRightsConfirmed: false,
    },
    screens: [
      { id: 'screen-one', stepLabel: 'Screen 1', title: 'First Host Screen', blocks: [] },
      { id: 'screen-two', stepLabel: 'Screen 2', title: 'Second Resumed Screen', blocks: [] },
    ],
    companionLinks: [],
  }
  const admitted = admitTrustedCatalogChallenge({
    documentId: 'berrymark-challenge-2026-11-02-rejoice-always',
    screens: sampleChallenge.screens,
    editorial: { adaptationReviewed: true, reviewedAt: '2026-11-02T12:00:00Z' },
  })!

  const seededJson = JSON.stringify({
    schemaVersion: 1,
    data: {
      completedChallenges: {},
      inProgressChallenges: {
        [admitted.challengeId]: { screenId: 'screen-two', updatedOn: day1 },
      },
      savedChallenges: {
        [admitted.challengeId]: { savedOn: day1 },
      },
      savedScriptures: [],
      lastOpenedChallenge: null,
    },
  })

  const loadGate = createDeferred<string | null>()
  const asyncDriver: KeyValueStorageDriver = {
    getItem: () => loadGate.promise,
    setItem: async () => {},
    removeItem: async () => {},
  }
  const store = createReaderParticipationStore(
    createEnvelopePersistenceAdapter({ storageKey: TEST_STORAGE_KEY, driver: asyncDriver }),
  )

  // While hydrating, host render state withholds ChallengePlayer and exposes accessible status copy
  const hydratingState = derivePersistedHostRenderState(
    store.getSnapshot(),
    admitted.challengeId,
    undefined,
  )
  assert.deepEqual(hydratingState, {
    mode: 'hydrating',
    statusMessage: 'Loading reading progress…',
  })

  // Resolve async hydration -> transitions directly to resumed Screen 2 with saved Challenge active
  loadGate.resolve(seededJson)
  await store.whenReady()

  const readyState = derivePersistedHostRenderState(
    store.getSnapshot(),
    admitted.challengeId,
    undefined,
  )
  assert.equal(readyState.mode, 'ready')
  assert.equal(readyState.effectiveScreenId, 'screen-two')
  assert.equal(readyState.view.isSaved, true)
  assert.equal(readyState.view.status, 'inProgress')

  store.dispose()
})

test('platform-neutral participation domain and store modules have zero browser storage or window globals', () => {
  const platformNeutralFiles = [
    'src/participation/types.ts',
    'src/participation/identity.ts',
    'src/participation/admission.ts',
    'src/participation/model.ts',
    'src/participation/persistence.ts',
    'src/participation/store.ts',
    'src/participation/useReaderParticipation.ts',
  ]
  const forbiddenGlobals = new Set([
    'localStorage',
    'sessionStorage',
    'indexedDB',
    'window',
    'document',
  ])

  for (const relPath of platformNeutralFiles) {
    const absPath = resolve(repositoryRoot, relPath)
    const raw = readFileSync(absPath, 'utf8')
    const sf = ts.createSourceFile(
      absPath,
      raw,
      ts.ScriptTarget.Latest,
      true,
      relPath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )

    function inspect(node: ts.Node) {
      if (ts.isIdentifier(node) && forbiddenGlobals.has(node.text)) {
        assert.fail(`${relPath} must not reference browser global "${node.text}"`)
      }
      if (ts.isStringLiteral(node) && /bibleberry-[a-z-]+-v1/.test(node.text)) {
        assert.fail(`${relPath} must not hardcode storage key "${node.text}"`)
      }
      ts.forEachChild(node, inspect)
    }
    inspect(sf)
  }
})
