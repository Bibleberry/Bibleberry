import assert from 'node:assert/strict'
import test from 'node:test'
import {
  GUEST_PARTICIPATION_STORAGE_KEY,
  createPlatformGuestParticipationStore,
} from '../../src/participation/defaultGuestStore.ts'
import {
  buildShelfHostPropsFromGuestStore,
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

test('explicit monthly rollover: 0 completions, >=1 completion, protection, year boundary, auto-eviction, and all-protected', async () => {
  const webStorage = createWebStorageDouble()
  const store = createWebGuestShelfStore({ storage: webStorage })
  await store.whenReady()

  // 1. Zero completions -> retained in Library, not admitted
  const noComp = await store.evaluateMonthlyRollover({
    newCurrentYearMonth: '2026-09',
    completedChallengeIdsInEndingMonth: [],
    rolloverDate: '2026-09-01',
  })
  assert.equal(noComp.ok, true)
  assert.equal(noComp.disposition, 'retainedInLibraryNoCompletions')
  assert.deepEqual(store.getSnapshot().state.months, [])

  // 2. >=1 completion -> admitted to open slot (unprotected autoAdmitted)
  const octRoll = await store.evaluateMonthlyRollover({
    newCurrentYearMonth: '2026-10',
    completedChallengeIdsInEndingMonth: ['cms:c-sep-1'],
    rolloverDate: '2026-10-01',
  })
  assert.equal(octRoll.ok, true)
  assert.equal(octRoll.disposition, 'admittedToOpenSlot')
  assert.equal(store.getSnapshot().state.months[0]?.yearMonth, '2026-09')
  assert.equal(store.getSnapshot().state.months[0]?.isProtected, false)

  // 3. Admit two more months to fill Shelf (3 slots)
  await store.evaluateMonthlyRollover({
    newCurrentYearMonth: '2026-11',
    completedChallengeIdsInEndingMonth: ['cms:c-oct-1'],
    rolloverDate: '2026-11-01',
  })
  await store.evaluateMonthlyRollover({
    newCurrentYearMonth: '2026-12',
    completedChallengeIdsInEndingMonth: ['cms:c-nov-1'],
    rolloverDate: '2026-12-01',
  })
  assert.deepEqual(
    store.getSnapshot().state.months.map(m => m.yearMonth),
    ['2026-09', '2026-10', '2026-11'],
  )

  // Protect the oldest ('2026-09') so '2026-10' becomes oldest unprotected autoAdmitted
  await store.protect({ yearMonth: '2026-09' })

  // 4. Year boundary rollover ('2027-01', ending '2026-12') -> replaces '2026-10'
  const janRoll = await store.evaluateMonthlyRollover({
    newCurrentYearMonth: '2027-01',
    completedChallengeIdsInEndingMonth: ['cms:c-dec-1'],
    rolloverDate: '2027-01-01',
  })
  assert.equal(janRoll.ok, true)
  assert.equal(janRoll.disposition, 'replacedOldestAutoAdmitted')
  assert.equal(janRoll.evictedEntry?.yearMonth, '2026-10')
  assert.deepEqual(
    store.getSnapshot().state.months.map(m => m.yearMonth),
    ['2026-09', '2026-12', '2026-11'],
  )

  // 5. Protect remaining two months -> all-protected no-eviction
  await store.protect({ yearMonth: '2026-11' })
  await store.protect({ yearMonth: '2026-12' })

  const febRoll = await store.evaluateMonthlyRollover({
    newCurrentYearMonth: '2027-02',
    completedChallengeIdsInEndingMonth: ['cms:c-jan-1'],
    rolloverDate: '2027-02-01',
  })
  assert.equal(febRoll.ok, true)
  assert.equal(febRoll.disposition, 'retainedInLibraryAllProtected')
  assert.deepEqual(
    store.getSnapshot().state.months.map(m => m.yearMonth),
    ['2026-09', '2026-12', '2026-11'],
  )

  store.dispose()
})

test('rollover watermark ensures idempotence across reload and even after Put Away without mutating participation', async () => {
  const webStorage = createWebStorageDouble()
  const participationStore = createPlatformGuestParticipationStore({
    isNativePlatform: () => false,
    webStorage,
  })
  await participationStore.whenReady()
  await participationStore.dispatch({
    type: 'completeChallenge',
    challengeId: 'cms:c-oct-1',
    completedOn: '2026-10-15',
  })
  const participationBefore = webStorage.backing.get(GUEST_PARTICIPATION_STORAGE_KEY)

  const store1 = createWebGuestShelfStore({ storage: webStorage })
  await store1.whenReady()
  const firstRoll = await store1.evaluateMonthlyRollover({
    newCurrentYearMonth: '2026-11',
    completedChallengeIdsInEndingMonth: ['cms:c-oct-1'],
    rolloverDate: '2026-11-01',
  })
  assert.equal(firstRoll.disposition, 'admittedToOpenSlot')

  // Reader explicitly puts away the auto-admitted month
  await store1.putAway('2026-10')
  assert.deepEqual(store1.getSnapshot().state.months, [])
  store1.dispose()

  // Reload and re-run the same rollover -> watermark prevents re-admitting 2026-10
  const store2 = createWebGuestShelfStore({ storage: webStorage })
  await store2.whenReady()
  const repeatRoll = await store2.evaluateMonthlyRollover({
    newCurrentYearMonth: '2026-11',
    completedChallengeIdsInEndingMonth: ['cms:c-oct-1'],
    rolloverDate: '2026-11-01',
  })
  assert.equal(repeatRoll.ok, true)
  assert.deepEqual(store2.getSnapshot().state.months, [])
  assert.equal(webStorage.backing.get(GUEST_PARTICIPATION_STORAGE_KEY), participationBefore)
  store2.dispose()
  participationStore.dispose()
})

test('rejects invalid or non-historical rollover parameters safely', async () => {
  const webStorage = createWebStorageDouble()
  const store = createWebGuestShelfStore({ storage: webStorage })
  await store.whenReady()

  const invalid = await store.evaluateMonthlyRollover({
    newCurrentYearMonth: '2026-13',
    completedChallengeIdsInEndingMonth: ['cms:c1'],
  })
  assert.equal(invalid.ok, false)
  assert.equal(invalid.disposition, 'rejectedInvalidMonth')

  const nonHistorical = await store.evaluateMonthlyRollover({
    newCurrentYearMonth: '2026-11',
    endingYearMonth: '2026-11',
    completedChallengeIdsInEndingMonth: ['cms:c1'],
  })
  assert.equal(nonHistorical.ok, false)
  assert.equal(nonHistorical.disposition, 'rejectedNotHistorical')
  store.dispose()
})

test('buildShelfHostPropsFromGuestStore bridges GuestShelfStore to ShelfHostProps and persists onStateChange', async () => {
  const webStorage = createWebStorageDouble()
  const store = createWebGuestShelfStore({
    storage: webStorage,
    referenceCurrentMonth: '2026-11',
  })
  await store.whenReady()

  const openedMonths: string[] = []
  const props = buildShelfHostPropsFromGuestStore({
    store,
    snapshot: store.getSnapshot(),
    referenceCurrentYearMonth: '2026-11',
    onOpenMonth: ym => {
      openedMonths.push(ym)
    },
    currentLocalDate: '2026-11-02',
  })

  assert.equal(props.referenceCurrentYearMonth, '2026-11')
  assert.deepEqual(props.state?.months, [])

  props.onOpenMonth('2026-09')
  assert.deepEqual(openedMonths, ['2026-09'])

  // Simulate ShelfHost invoking onStateChange with a policy-produced state
  props.onStateChange?.({
    months: [
      {
        yearMonth: '2026-09',
        admissionKind: 'readerSelected',
        isProtected: true,
        admittedOn: '2026-11-02',
      },
    ],
    activeFocusMonth: '2026-09',
    updatedOn: '2026-11-02',
  })
  await store.flushPending()

  const storeReloaded = createWebGuestShelfStore({
    storage: webStorage,
    referenceCurrentMonth: '2026-11',
  })
  await storeReloaded.whenReady()
  assert.equal(storeReloaded.getSnapshot().state.months[0]?.yearMonth, '2026-09')
  assert.equal(storeReloaded.getSnapshot().state.activeFocusMonth, '2026-09')

  store.dispose()
  storeReloaded.dispose()
})

test('duplicate store bootstraps and a stale month cannot overwrite the newest transition', async () => {
  const storage = createWebStorageDouble()
  const stores = [createWebGuestShelfStore({ storage }), createWebGuestShelfStore({ storage })]
  await Promise.all(stores.map(store => store.whenReady()))
  const december = {
    newCurrentYearMonth: '2027-01',
    completedChallengeIdsInEndingMonth: ['cms:december-completion'],
    rolloverDate: '2027-01-01',
  }
  await Promise.all(stores.map(store => store.evaluateMonthlyRollover(december)))
  await stores[0].putAway('2026-12')
  const stale = await stores[1].evaluateMonthlyRollover({
    newCurrentYearMonth: '2026-12',
    completedChallengeIdsInEndingMonth: ['cms:november-completion'],
  })
  assert.equal(stale.disposition, 'ignoredOlderTransition')

  const reloaded = createWebGuestShelfStore({ storage })
  await reloaded.whenReady()
  await reloaded.evaluateMonthlyRollover(december)
  assert.deepEqual(reloaded.getSnapshot().state.months, [])
  assert.equal(reloaded.getSnapshot().rolloverWatermark?.lastNewCurrentYearMonth, '2027-01')
  for (const store of [...stores, reloaded]) store.dispose()
})
