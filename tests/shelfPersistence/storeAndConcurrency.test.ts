import assert from 'node:assert/strict'
import test from 'node:test'
import {
  GUEST_PARTICIPATION_STORAGE_KEY,
  createPlatformGuestParticipationStore,
} from '../../src/participation/defaultGuestStore.ts'
import type { CapacitorPreferencesBridge } from '../../src/participation/drivers/capacitorPreferencesDriver.ts'
import type { KeyValueStorageDriver } from '../../src/participation/persistence.ts'
import {
  GUEST_SHELF_STORAGE_KEY,
  createGuestShelfStore,
  createGuestShelfStoreForDriver,
  createPlatformGuestShelfStore,
  createShelfEnvelopePersistenceAdapter,
  createWebGuestShelfStore,
} from '../../src/shelfPersistence/index.ts'

function createWebStorageDouble(initial: Record<string, string> = {}) {
  const backing = new Map<string, string>(Object.entries(initial))
  return {
    backing,
    getItem(key: string) {
      return backing.get(key) ?? null
    },
    setItem(key: string, value: string) {
      backing.set(key, value)
    },
    removeItem(key: string) {
      backing.delete(key)
    },
  }
}

function createCapacitorPreferencesProxyDouble(
  backing: Map<string, string> = new Map(),
  options: {
    readonly delayMs?: number
    readonly failNextSet?: boolean
  } = {},
) {
  let failNextSet = options.failNextSet ?? false
  const delay = () =>
    options.delayMs
      ? new Promise<void>(resolve => {
          setTimeout(resolve, options.delayMs)
        })
      : Promise.resolve()

  const target: CapacitorPreferencesBridge = {
    async get({ key }) {
      await delay()
      return { value: backing.get(key) ?? null }
    },
    async set({ key, value }) {
      await delay()
      if (failNextSet) {
        failNextSet = false
        throw new Error('Transient native write failure')
      }
      backing.set(key, value)
    },
    async remove({ key }) {
      await delay()
      backing.delete(key)
    },
  }

  // Mirror Capacitor registerPlugin Proxy trap where `.then` throws if assimilated.
  const proxy = new Proxy(target, {
    get(obj, prop, receiver) {
      if (prop === 'then') {
        throw new Error('Preferences.then() is not implemented on native Capacitor plugin Proxy')
      }
      return Reflect.get(obj, prop, receiver)
    },
  })

  return {
    proxy,
    backing,
    setFailNextSet(value: boolean) {
      failNextSet = value
    },
  }
}

test('web localStorage driver persists selections, protection, and active focus across reload', async () => {
  const webStorage = createWebStorageDouble()
  const store1 = createWebGuestShelfStore({
    storage: webStorage,
    referenceCurrentMonth: '2026-11',
  })
  await store1.whenReady()
  assert.equal(store1.getSnapshot().status, 'ready')
  assert.deepEqual(store1.getSnapshot().state.months, [])

  const sel1 = await store1.select({
    yearMonth: '2026-09',
    referenceCurrentYearMonth: '2026-11',
    admittedOn: '2026-11-01',
    updatedOn: '2026-11-01',
  })
  assert.equal(sel1.ok, true)

  const focusRes = await store1.setFocus({
    yearMonth: '2026-05',
    updatedOn: '2026-11-01',
  })
  assert.equal(focusRes.ok, true)
  store1.dispose()

  const store2 = createWebGuestShelfStore({
    storage: webStorage,
    referenceCurrentMonth: '2026-11',
  })
  await store2.whenReady()
  const snap2 = store2.getSnapshot()
  assert.equal(snap2.health, 'ok')
  assert.equal(snap2.state.months.length, 1)
  assert.equal(snap2.state.months[0]?.yearMonth, '2026-09')
  assert.equal(snap2.state.months[0]?.admissionKind, 'readerSelected')
  assert.equal(snap2.state.months[0]?.isProtected, true)
  assert.equal(snap2.state.activeFocusMonth, '2026-05')
  store2.dispose()
})

test('native Capacitor Preferences Proxy driver persists async guest Shelf through reload without Proxy.then trap', async () => {
  const { proxy, backing } = createCapacitorPreferencesProxyDouble(new Map(), { delayMs: 5 })

  const store1 = createPlatformGuestShelfStore({
    isNativePlatform: () => true,
    nativePreferences: proxy,
    referenceCurrentMonth: '2026-11',
  })
  assert.equal(store1.getSnapshot().status, 'hydrating')
  await store1.whenReady()
  assert.equal(store1.getSnapshot().status, 'ready')

  await store1.select({
    yearMonth: '2026-08',
    referenceCurrentYearMonth: '2026-11',
  })
  await store1.unprotect({ yearMonth: '2026-08' })
  store1.dispose()

  const store2 = createPlatformGuestShelfStore({
    isNativePlatform: () => true,
    nativePreferences: proxy,
    referenceCurrentMonth: '2026-11',
  })
  await store2.whenReady()
  const snap = store2.getSnapshot()
  assert.equal(snap.health, 'ok')
  assert.equal(snap.state.months.length, 1)
  assert.equal(snap.state.months[0]?.yearMonth, '2026-08')
  assert.equal(snap.state.months[0]?.isProtected, false)
  assert.ok(backing.has(GUEST_SHELF_STORAGE_KEY))
  store2.dispose()
})

test('Shelf clearLocalData never shares or resets GUEST_PARTICIPATION_STORAGE_KEY', async () => {
  const webStorage = createWebStorageDouble()
  const participationStore = createPlatformGuestParticipationStore({
    isNativePlatform: () => false,
    webStorage,
  })
  await participationStore.whenReady()
  await participationStore.dispatch({
    type: 'completeChallenge',
    challengeId: 'cms:challenge-oct-1',
    completedOn: '2026-10-15',
  })

  const shelfStore = createPlatformGuestShelfStore({
    isNativePlatform: () => false,
    webStorage,
    referenceCurrentMonth: '2026-11',
  })
  await shelfStore.whenReady()
  await shelfStore.select({
    yearMonth: '2026-10',
    referenceCurrentYearMonth: '2026-11',
  })

  assert.ok(webStorage.backing.has(GUEST_PARTICIPATION_STORAGE_KEY))
  assert.ok(webStorage.backing.has(GUEST_SHELF_STORAGE_KEY))

  await shelfStore.clearLocalData()
  assert.equal(webStorage.backing.has(GUEST_SHELF_STORAGE_KEY), false)
  assert.equal(webStorage.backing.has(GUEST_PARTICIPATION_STORAGE_KEY), true)
  assert.equal(participationStore.getSnapshot().distinctCompletedCount, 1)

  shelfStore.dispose()
  participationStore.dispose()
})

test('early user actions during async hydration queue behind load and replay cleanly without losing choices', async () => {
  const backing = new Map<string, string>()
  const seedStore = createPlatformGuestShelfStore({
    isNativePlatform: () => true,
    nativePreferences: createCapacitorPreferencesProxyDouble(backing).proxy,
  })
  await seedStore.whenReady()
  await seedStore.select({
    yearMonth: '2026-08',
    referenceCurrentYearMonth: '2026-11',
  })
  seedStore.dispose()

  const { proxy } = createCapacitorPreferencesProxyDouble(backing, { delayMs: 10 })
  const store = createPlatformGuestShelfStore({
    isNativePlatform: () => true,
    nativePreferences: proxy,
    referenceCurrentMonth: '2026-11',
  })
  assert.equal(store.getSnapshot().status, 'hydrating')

  // Dispatch early action before hydration completes
  const selectPromise = store.select({
    yearMonth: '2026-09',
    referenceCurrentYearMonth: '2026-11',
  })
  await selectPromise

  const snap = store.getSnapshot()
  assert.equal(snap.status, 'ready')
  assert.equal(snap.health, 'ok')
  assert.deepEqual(
    snap.state.months.map(m => m.yearMonth),
    ['2026-08', '2026-09'],
  )
  store.dispose()
})

test('transient write failure retains pending commands and persists on retry', async () => {
  const { proxy, backing, setFailNextSet } = createCapacitorPreferencesProxyDouble(new Map(), {
    delayMs: 5,
  })
  const store = createPlatformGuestShelfStore({
    isNativePlatform: () => true,
    nativePreferences: proxy,
    referenceCurrentMonth: '2026-11',
  })
  await store.whenReady()

  setFailNextSet(true)
  const pendingResult = await store.select({
    yearMonth: '2026-09',
    referenceCurrentYearMonth: '2026-11',
  })
  // `ok: true` reflects policy acceptance against the Shelf state; durability is pending retry.
  assert.equal(pendingResult.ok, true)

  const failedSnap = store.getSnapshot()
  assert.equal(failedSnap.health, 'writeFailed')
  assert.equal(failedSnap.hasPendingWrites, true)
  assert.equal(backing.has(GUEST_SHELF_STORAGE_KEY), false)
  assert.deepEqual(
    failedSnap.state.months.map(m => m.yearMonth),
    ['2026-09'],
  )

  await store.flushPending()
  const recoveredSnap = store.getSnapshot()
  assert.equal(recoveredSnap.health, 'ok')
  assert.equal(recoveredSnap.hasPendingWrites, false)
  assert.equal(backing.has(GUEST_SHELF_STORAGE_KEY), true)
  assert.deepEqual(
    recoveredSnap.state.months.map(m => m.yearMonth),
    ['2026-09'],
  )
  store.dispose()
})

test('clearLocalData during pending async write prevents resurrection in memory or storage', async () => {
  let resolveWrite!: () => void
  let markWriteStarted!: () => void
  const writeStarted = new Promise<void>(resolve => {
    markWriteStarted = resolve
  })
  const backing = new Map<string, string>()

  const slowWriteDriver: KeyValueStorageDriver = {
    async getItem(key) {
      return backing.get(key) ?? null
    },
    setItem(key, value) {
      return new Promise<void>(resolve => {
        resolveWrite = () => {
          backing.set(key, value)
          resolve()
        }
        markWriteStarted()
      })
    },
    async removeItem(key) {
      backing.delete(key)
    },
  }

  const store = createGuestShelfStoreForDriver(slowWriteDriver)
  await store.whenReady()

  const writePromise = store.select({
    yearMonth: '2026-09',
    referenceCurrentYearMonth: '2026-11',
  })
  await writeStarted

  // Clear while the write is still in flight
  const clearPromise = store.clearLocalData()
  assert.deepEqual(store.getSnapshot().state.months, [])

  // Now let the stale write promise resolve
  resolveWrite()
  const [canceledResult] = await Promise.all([writePromise, clearPromise])

  assert.equal(canceledResult.ok, false)
  if (!canceledResult.ok) {
    assert.match(canceledResult.message, /canceled/i)
  }
  assert.deepEqual(canceledResult.state.months, [])
  assert.deepEqual(store.getSnapshot().state.months, [])
  assert.equal(backing.has(GUEST_SHELF_STORAGE_KEY), false)
  store.dispose()
})

test('full Shelf rejects select without replaceMonth and preserves activeFocusMonth across Put Away', async () => {
  const webStorage = createWebStorageDouble()
  const store = createWebGuestShelfStore({
    storage: webStorage,
    referenceCurrentMonth: '2026-11',
  })
  await store.whenReady()

  await store.select({ yearMonth: '2026-07', referenceCurrentYearMonth: '2026-11' })
  await store.select({ yearMonth: '2026-08', referenceCurrentYearMonth: '2026-11' })
  await store.select({ yearMonth: '2026-09', referenceCurrentYearMonth: '2026-11' })

  const rejected = await store.select({
    yearMonth: '2026-10',
    referenceCurrentYearMonth: '2026-11',
  })
  assert.equal(rejected.ok, false)
  if (!rejected.ok) {
    assert.equal(rejected.error, 'shelfCapacityExceeded')
  }

  const replaced = await store.select({
    yearMonth: '2026-10',
    referenceCurrentYearMonth: '2026-11',
    replaceMonth: '2026-07',
  })
  assert.equal(replaced.ok, true)
  assert.deepEqual(
    store.getSnapshot().state.months.map(m => m.yearMonth),
    ['2026-10', '2026-08', '2026-09'],
  )

  // Active focus independent of Shelf membership
  await store.setFocus('2026-08')
  await store.putAway('2026-08')
  assert.equal(store.getSnapshot().state.activeFocusMonth, '2026-08')
  assert.deepEqual(
    store.getSnapshot().state.months.map(m => m.yearMonth),
    ['2026-10', '2026-09'],
  )

  await store.clearFocus()
  assert.equal(store.getSnapshot().state.activeFocusMonth, null)

  // Verify snapshot stability and subscribe/dispose
  let notifications = 0
  const unsub = store.subscribe(() => {
    notifications += 1
  })
  const snapBefore = store.getSnapshot()
  await store.putAway('2026-01') // noop
  assert.equal(store.getSnapshot(), snapBefore)
  assert.equal(notifications, 0)
  unsub()
  store.dispose()
})

test('external change listener refreshes committed state when storage updates externally', async () => {
  let externalListener: (() => void) | undefined
  const backing = new Map<string, string>()

  const driver: KeyValueStorageDriver = {
    getItem: key => backing.get(key) ?? null,
    setItem: (key, value) => {
      backing.set(key, value)
    },
    removeItem: key => {
      backing.delete(key)
    },
    onExternalChange: (_key, listener) => {
      externalListener = listener
      return () => {
        externalListener = undefined
      }
    },
  }

  const adapter = createShelfEnvelopePersistenceAdapter({ driver })
  const store = createGuestShelfStore(adapter)
  await store.whenReady()
  assert.deepEqual(store.getSnapshot().state.months, [])

  backing.set(
    GUEST_SHELF_STORAGE_KEY,
    JSON.stringify({
      schemaVersion: 1,
      state: {
        months: [{ yearMonth: '2026-06', admissionKind: 'readerSelected', isProtected: true }],
        activeFocusMonth: null,
      },
    }),
  )
  externalListener?.()

  assert.deepEqual(
    store.getSnapshot().state.months.map(m => m.yearMonth),
    ['2026-06'],
  )
  store.dispose()
})

test('delayed native hydration with full Shelf rejects early select without replaceMonth and returns shelfCapacityExceeded', async () => {
  const backing = new Map<string, string>()
  const seedStore = createPlatformGuestShelfStore({
    isNativePlatform: () => true,
    nativePreferences: createCapacitorPreferencesProxyDouble(backing).proxy,
    referenceCurrentMonth: '2026-11',
  })
  await seedStore.whenReady()
  await seedStore.select({ yearMonth: '2026-07', referenceCurrentYearMonth: '2026-11' })
  await seedStore.select({ yearMonth: '2026-08', referenceCurrentYearMonth: '2026-11' })
  await seedStore.select({ yearMonth: '2026-09', referenceCurrentYearMonth: '2026-11' })
  seedStore.dispose()

  const { proxy } = createCapacitorPreferencesProxyDouble(backing, { delayMs: 15 })
  const store = createPlatformGuestShelfStore({
    isNativePlatform: () => true,
    nativePreferences: proxy,
    referenceCurrentMonth: '2026-11',
  })
  assert.equal(store.getSnapshot().status, 'hydrating')

  const selectPromise = store.select({
    yearMonth: '2026-10',
    referenceCurrentYearMonth: '2026-11',
  })

  // Optimistic snapshot still reflects the pending choice while hydrating.
  assert.deepEqual(
    store.getSnapshot().state.months.map(m => m.yearMonth),
    ['2026-10'],
  )
  assert.equal(store.getSnapshot().hasPendingWrites, true)

  const result = await selectPromise
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.error, 'shelfCapacityExceeded')
  }
  assert.deepEqual(
    result.state.months.map(m => m.yearMonth),
    ['2026-07', '2026-08', '2026-09'],
  )

  const snap = store.getSnapshot()
  assert.equal(snap.status, 'ready')
  assert.equal(snap.health, 'ok')
  assert.equal(snap.hasPendingWrites, false)
  assert.deepEqual(
    snap.state.months.map(m => m.yearMonth),
    ['2026-07', '2026-08', '2026-09'],
  )
  store.dispose()
})

test('delayed native hydration resolves reverse discrepancies (preview rejection or noop becomes committed success)', async () => {
  const backing = new Map<string, string>()
  const seedStore = createPlatformGuestShelfStore({
    isNativePlatform: () => true,
    nativePreferences: createCapacitorPreferencesProxyDouble(backing).proxy,
    referenceCurrentMonth: '2026-11',
  })
  await seedStore.whenReady()
  await seedStore.select({ yearMonth: '2026-07', referenceCurrentYearMonth: '2026-11' })
  await seedStore.select({ yearMonth: '2026-08', referenceCurrentYearMonth: '2026-11' })
  seedStore.dispose()

  const { proxy } = createCapacitorPreferencesProxyDouble(backing, { delayMs: 15 })
  const store = createPlatformGuestShelfStore({
    isNativePlatform: () => true,
    nativePreferences: proxy,
    referenceCurrentMonth: '2026-11',
  })
  assert.equal(store.getSnapshot().status, 'hydrating')

  // Preview against initial empty Shelf rejects unprotect as monthNotOnShelf and treats putAway as noop.
  const unprotectPromise = store.unprotect({ yearMonth: '2026-07' })
  const putAwayPromise = store.putAway('2026-08')

  const [unprotectResult, putAwayResult] = await Promise.all([unprotectPromise, putAwayPromise])

  assert.equal(unprotectResult.ok, true)
  if (unprotectResult.ok) {
    assert.equal(unprotectResult.action, 'protectionUpdated')
  }

  assert.equal(putAwayResult.ok, true)
  if (putAwayResult.ok) {
    assert.equal(putAwayResult.action, 'removed')
  }

  const snap = store.getSnapshot()
  assert.equal(snap.status, 'ready')
  assert.equal(snap.health, 'ok')
  assert.deepEqual(
    snap.state.months.map(m => ({ yearMonth: m.yearMonth, isProtected: m.isProtected })),
    [{ yearMonth: '2026-07', isProtected: false }],
  )
  store.dispose()
})

test('commands rebased onto external storage changes return the committed policy outcome', async () => {
  const backing = new Map<string, string>()
  let externalListener: (() => void) | undefined

  const driver: KeyValueStorageDriver = {
    async getItem(key) {
      await new Promise(resolve => setTimeout(resolve, 10))
      return backing.get(key) ?? null
    },
    async setItem(key, value) {
      await new Promise(resolve => setTimeout(resolve, 10))
      backing.set(key, value)
    },
    async removeItem(key) {
      await new Promise(resolve => setTimeout(resolve, 10))
      backing.delete(key)
    },
    onExternalChange: (_key, listener) => {
      externalListener = listener
      return () => {
        externalListener = undefined
      }
    },
  }

  const store = createGuestShelfStore(
    createShelfEnvelopePersistenceAdapter({ driver, referenceCurrentMonth: '2026-11' }),
  )
  await store.whenReady()
  await store.select({ yearMonth: '2026-07', referenceCurrentYearMonth: '2026-11' })
  await store.select({ yearMonth: '2026-08', referenceCurrentYearMonth: '2026-11' })

  // External writer adds a third month directly in storage without notifying yet.
  backing.set(
    GUEST_SHELF_STORAGE_KEY,
    JSON.stringify({
      schemaVersion: 1,
      state: {
        months: [
          { yearMonth: '2026-07', admissionKind: 'readerSelected', isProtected: true },
          { yearMonth: '2026-08', admissionKind: 'readerSelected', isProtected: true },
          { yearMonth: '2026-09', admissionKind: 'readerSelected', isProtected: true },
        ],
        activeFocusMonth: null,
      },
    }),
  )

  // Preview against 2-month in-memory state would succeed, but flush rebases onto 3-month storage and rejects.
  const rejectedSelect = await store.select({
    yearMonth: '2026-10',
    referenceCurrentYearMonth: '2026-11',
  })
  assert.equal(rejectedSelect.ok, false)
  if (!rejectedSelect.ok) {
    assert.equal(rejectedSelect.error, 'shelfCapacityExceeded')
  }
  assert.deepEqual(
    store.getSnapshot().state.months.map(m => m.yearMonth),
    ['2026-07', '2026-08', '2026-09'],
  )

  // Now simulate external change removing 2026-09 and adding 2026-06, with listener firing before async load completes.
  backing.set(
    GUEST_SHELF_STORAGE_KEY,
    JSON.stringify({
      schemaVersion: 1,
      state: {
        months: [
          { yearMonth: '2026-07', admissionKind: 'readerSelected', isProtected: true },
          { yearMonth: '2026-08', admissionKind: 'readerSelected', isProtected: true },
          { yearMonth: '2026-06', admissionKind: 'readerSelected', isProtected: true },
        ],
        activeFocusMonth: null,
      },
    }),
  )
  externalListener?.()

  // Preview against stale in-memory state would reject 2026-06 as monthNotOnShelf, but queues behind async refresh.
  const unprotectResult = await store.unprotect({ yearMonth: '2026-06' })
  assert.equal(unprotectResult.ok, true)
  if (unprotectResult.ok) {
    assert.equal(unprotectResult.action, 'protectionUpdated')
  }
  const month06 = store.getSnapshot().state.months.find(m => m.yearMonth === '2026-06')
  assert.equal(month06?.isProtected, false)

  store.dispose()
})
