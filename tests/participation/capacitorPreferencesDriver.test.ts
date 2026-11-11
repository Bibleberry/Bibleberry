import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
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
import { useReaderParticipation } from '../../src/participation/useReaderParticipation.ts'

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

function createCapacitorRegisterPluginProxy(
  backing: Map<string, string>,
  options: { readonly suppressThenUnhandledForControl?: boolean } = {},
) {
  let thenAccessCount = 0
  const unimplementedErrors: string[] = []
  const methodCalls: string[] = []
  const impl = createPreferences(backing)

  const proxy = new Proxy({} as CapacitorPreferencesBridge, {
    get(_target, prop) {
      if (prop === '$$typeof') return undefined
      if (prop === 'toJSON') return () => ({})
      if (prop === 'get' || prop === 'set' || prop === 'remove') {
        return (...args: unknown[]) => {
          methodCalls.push(String(prop))
          return (impl[prop] as (...a: unknown[]) => unknown)(...args)
        }
      }
      if (prop === 'then') {
        thenAccessCount += 1
      }
      const methodName = String(prop)
      return () => {
        const message = `"Preferences.${methodName}()" is not implemented on ios`
        unimplementedErrors.push(message)
        const rejected = Promise.reject(new Error(message))
        if (options.suppressThenUnhandledForControl) {
          rejected.catch(() => {})
        }
        return rejected
      }
    },
  })

  return {
    proxy,
    get thenAccessCount() {
      return thenAccessCount
    },
    get unimplementedErrors() {
      return unimplementedErrors
    },
    get methodCalls() {
      return methodCalls
    },
  }
}

test('Capacitor registerPlugin-style Proxy triggers thenable trap when returned directly, and driver avoids Proxy.then across module load and operations', async () => {
  const controlBacking = new Map<string, string>()
  const control = createCapacitorRegisterPluginProxy(controlBacking, {
    suppressThenUnhandledForControl: true,
  })

  // Reproduce original failure: returning the Capacitor Proxy directly from `.then(...)`
  // accesses `Proxy.then`, triggers `"Preferences.then()" is not implemented on ios`,
  // and leaves the outer promise permanently pending because Capacitor's wrapper ignores
  // the Promise `(resolve, reject)` callbacks.
  const settledOrTimedOut = await Promise.race([
    Promise.resolve({ Preferences: control.proxy })
      .then(module => module.Preferences)
      .then(() => 'settled', () => 'rejected'),
    new Promise<string>(resolve => setTimeout(() => resolve('hung-pending'), 20)),
  ])
  assert.equal(settledOrTimedOut, 'hung-pending')
  assert.equal(control.thenAccessCount, 1)
  assert.deepEqual(control.unimplementedErrors, [
    '"Preferences.then()" is not implemented on ios',
  ])

  // Fixed driver via dynamic-module seam never accesses `Proxy.then` during load, get, set, or remove.
  const backing = new Map<string, string>()
  const strict = createCapacitorRegisterPluginProxy(backing)
  let moduleLoads = 0
  const driver = createCapacitorPreferencesDriver({
    loadPreferencesModule: async () => {
      moduleLoads += 1
      return { Preferences: strict.proxy }
    },
  })

  assert.equal(await driver.getItem(STORAGE_KEY), null)
  await driver.setItem(STORAGE_KEY, 'payload-1')
  assert.equal(await driver.getItem(STORAGE_KEY), 'payload-1')
  await driver.removeItem(STORAGE_KEY)
  assert.equal(await driver.getItem(STORAGE_KEY), null)
  assert.equal(moduleLoads, 1)
  assert.equal(strict.thenAccessCount, 0)
  assert.deepEqual(strict.unimplementedErrors, [])
  assert.deepEqual(strict.methodCalls, ['get', 'set', 'get', 'remove', 'get'])

  // Full store lifecycle (hydration, write, clear/reset, reload) works cleanly through the Proxy seam.
  const store = createStore(driver)
  await store.whenReady()
  await store.dispatch({
    type: 'completeChallenge',
    challengeId: completionChallenge,
    completedOn: day,
  })
  assert.equal(backing.has(STORAGE_KEY), true)

  const reloaded = createStore(
    createCapacitorPreferencesDriver({
      loadPreferencesModule: async () => ({ Preferences: strict.proxy }),
    }),
  )
  await reloaded.whenReady()
  assert.equal(reloaded.getSnapshot().distinctCompletedCount, 1)

  await store.clearLocalData()
  assert.equal(store.getSnapshot().health, 'ok')
  assert.equal(store.getSnapshot().distinctCompletedCount, 0)
  assert.equal(backing.has(STORAGE_KEY), false)
  assert.equal(strict.thenAccessCount, 0)

  store.dispose()
  reloaded.dispose()
})

test('default @capacitor/preferences dynamic loader works with zero options without assimilating the plugin Proxy', async () => {
  const storageMap = new Map<string, string>()
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: {
      localStorage: {
        getItem: (k: string) => storageMap.get(k) ?? null,
        setItem: (k: string, v: string) => {
          storageMap.set(k, v)
        },
        removeItem: (k: string) => {
          storageMap.delete(k)
        },
      },
    },
  })

  try {
    const driver = createCapacitorPreferencesDriver()
    await driver.setItem(STORAGE_KEY, 'real-capacitor-value')
    assert.equal(await driver.getItem(STORAGE_KEY), 'real-capacitor-value')
    assert.equal(storageMap.get(`CapacitorStorage.${STORAGE_KEY}`), 'real-capacitor-value')
    await driver.removeItem(STORAGE_KEY)
    assert.equal(await driver.getItem(STORAGE_KEY), null)
  } finally {
    if (originalWindowDescriptor) {
      Object.defineProperty(globalThis, 'window', originalWindowDescriptor)
    } else {
      Reflect.deleteProperty(globalThis, 'window')
    }
  }
})

test('injected Capacitor Proxy via options.preferences and createPlatformGuestParticipationStore avoids Proxy.then', async () => {
  const backing = new Map<string, string>()
  const strict = createCapacitorRegisterPluginProxy(backing)

  const store = createPlatformGuestParticipationStore({
    isNativePlatform: () => true,
    nativePreferences: strict.proxy,
  })
  await store.whenReady()
  await store.dispatch({
    type: 'completeChallenge',
    challengeId: completionChallenge,
    completedOn: day,
  })
  assert.equal(backing.has('bibleberry-reader-participation-v1'), true)

  await store.clearLocalData()
  assert.equal(store.getSnapshot().health, 'ok')
  assert.equal(backing.has('bibleberry-reader-participation-v1'), false)
  assert.equal(strict.thenAccessCount, 0)
  store.dispose()
})

test('thrown or rejected native load error surfaces storageUnavailable without permanent pending promises or data loss and recovers on retry', async () => {
  const backing = new Map<string, string>()
  const strict = createCapacitorRegisterPluginProxy(backing)
  let loadAttempts = 0
  let failureMode: 'async-reject' | 'sync-throw' | 'ok' = 'async-reject'

  const driver = createCapacitorPreferencesDriver({
    loadPreferencesModule: () => {
      loadAttempts += 1
      if (failureMode === 'sync-throw') {
        throw new Error('Synchronous native module load failure')
      }
      if (failureMode === 'async-reject') {
        return Promise.reject(new Error('Async native module load failure'))
      }
      return Promise.resolve({ Preferences: strict.proxy })
    },
  })

  // Concurrent raw driver calls reject cleanly without hanging and reset the cached promise.
  await Promise.all([
    assert.rejects(() => driver.getItem(STORAGE_KEY), /Async native module load failure/),
    assert.rejects(() => driver.setItem(STORAGE_KEY, 'v'), /Async native module load failure/),
  ])
  assert.equal(loadAttempts, 1)

  // Sync throw on next attempt is also turned into a clean rejection and resets the cache.
  failureMode = 'sync-throw'
  await assert.rejects(() => driver.removeItem(STORAGE_KEY), /Synchronous native module load failure/)
  assert.equal(loadAttempts, 2)

  // Store hydration under native load failure settles promptly with storageUnavailable,
  // retains pending writes in memory without data loss, and recovers once loading succeeds.
  failureMode = 'async-reject'
  let storeLoadAttempts = 0
  let storeShouldFail = true
  const store = createStore(
    createCapacitorPreferencesDriver({
      loadPreferencesModule: async () => {
        storeLoadAttempts += 1
        if (storeShouldFail) {
          throw new Error('Transient native bridge load error')
        }
        return { Preferences: strict.proxy }
      },
    }),
  )

  await store.whenReady()
  assert.equal(store.getSnapshot().status, 'ready')
  assert.equal(store.getSnapshot().health, 'storageUnavailable')
  assert.equal(storeLoadAttempts, 1)

  await store.dispatch({
    type: 'completeChallenge',
    challengeId: completionChallenge,
    completedOn: day,
  })
  assert.equal(store.getSnapshot().health, 'storageUnavailable')
  assert.equal(store.getSnapshot().hasPendingWrites, true)
  assert.equal(store.getSnapshot().distinctCompletedCount, 1)
  assert.equal(backing.has(STORAGE_KEY), false)

  storeShouldFail = false
  await store.flushPending()
  assert.equal(storeLoadAttempts > 1, true)
  assert.equal(store.getSnapshot().health, 'ok')
  assert.equal(store.getSnapshot().hasPendingWrites, false)
  assert.equal(backing.has(STORAGE_KEY), true)

  // Clear failure surfaces storageUnavailable cleanly and succeeds once load recovers.
  storeShouldFail = true
  const clearFailingDriver = createStore(
    createCapacitorPreferencesDriver({
      loadPreferencesModule: async () => {
        if (storeShouldFail) {
          throw new Error('Bridge unavailable during clear')
        }
        return { Preferences: strict.proxy }
      },
    }),
  )
  await clearFailingDriver.whenReady()
  await clearFailingDriver.clearLocalData()
  assert.equal(clearFailingDriver.getSnapshot().health, 'storageUnavailable')

  storeShouldFail = false
  await clearFailingDriver.clearLocalData()
  assert.equal(clearFailingDriver.getSnapshot().health, 'ok')
  assert.equal(backing.has(STORAGE_KEY), false)

  store.dispose()
  clearFailingDriver.dispose()
})

test('React useReaderParticipation hook and store subscription behave identically across web localStorage and Capacitor Proxy drivers', async () => {
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
  const nativeBacking = new Map<string, string>()
  const strict = createCapacitorRegisterPluginProxy(nativeBacking)

  const stores = [
    {
      label: 'web',
      store: createPlatformGuestParticipationStore({
        isNativePlatform: () => false,
        webStorage,
      }),
    },
    {
      label: 'native',
      store: createPlatformGuestParticipationStore({
        isNativePlatform: () => true,
        nativeDriver: createCapacitorPreferencesDriver({
          loadPreferencesModule: async () => ({ Preferences: strict.proxy }),
        }),
      }),
    },
  ]

  function ParticipationProbe({ store }: { store: ReturnType<typeof createStore> }) {
    const snapshot = useReaderParticipation(store)
    return createElement(
      'span',
      null,
      `${snapshot.status}:${snapshot.health}:${snapshot.distinctCompletedCount}`,
    )
  }

  for (const { label, store } of stores) {
    let notifications = 0
    const unsubscribe = store.subscribe(() => {
      notifications += 1
    })

    await store.whenReady()
    const readySnapshot = store.getSnapshot()
    assert.equal(Object.is(readySnapshot, store.getSnapshot()), true, `${label} Object.is stability`)
    assert.equal(
      renderToStaticMarkup(createElement(ParticipationProbe, { store })),
      '<span>ready:ok:0</span>',
      `${label} initial render`,
    )

    const beforeNotifications = notifications
    await store.dispatch({
      type: 'completeChallenge',
      challengeId: completionChallenge,
      completedOn: day,
    })
    assert.equal(notifications > beforeNotifications, true, `${label} notifies subscribers on write`)
    assert.equal(
      renderToStaticMarkup(createElement(ParticipationProbe, { store })),
      '<span>ready:ok:1</span>',
      `${label} updated render`,
    )

    await store.clearLocalData()
    assert.equal(
      renderToStaticMarkup(createElement(ParticipationProbe, { store })),
      '<span>ready:ok:0</span>',
      `${label} reset render`,
    )

    unsubscribe()
    store.dispose()
  }
  assert.equal(strict.thenAccessCount, 0)
})
