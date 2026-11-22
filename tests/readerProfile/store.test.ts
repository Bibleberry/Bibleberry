import assert from 'node:assert/strict'
import test from 'node:test'
import {
  LEGACY_PROTOTYPE_STORAGE_KEY,
  READER_PROFILE_STORAGE_KEY,
  createDefaultReaderProfile,
  createPlatformReaderProfileStore,
  createReaderProfileStore,
  serializeReaderProfileEnvelope,
} from '../../src/readerProfile/index.ts'
import { GUEST_PARTICIPATION_STORAGE_KEY } from '../../src/participation/defaultGuestStore.ts'
import { GUEST_SHELF_STORAGE_KEY } from '../../src/shelfPersistence/types.ts'
import { MONTH_INTRO_STORAGE_KEY } from '../../src/components/month/monthIntroStorage.ts'
import { LEGACY_FULL, UNRELATED_RECORDS, createMemoryDriver } from './helpers.ts'

function storedProfile(driver: { store: Map<string, string> }) {
  const raw = driver.store.get(READER_PROFILE_STORAGE_KEY)
  return raw === undefined ? undefined : JSON.parse(raw)
}

test('profile key is isolated from every other owned storage key', () => {
  assert.equal(READER_PROFILE_STORAGE_KEY, 'bibleberry-reader-profile-v1')
  assert.equal(LEGACY_PROTOTYPE_STORAGE_KEY, 'bibleberry-prototype-v1')
  for (const other of [
    LEGACY_PROTOTYPE_STORAGE_KEY,
    GUEST_PARTICIPATION_STORAGE_KEY,
    GUEST_SHELF_STORAGE_KEY,
    MONTH_INTRO_STORAGE_KEY,
    ...Object.keys(UNRELATED_RECORDS),
  ]) {
    assert.notEqual(READER_PROFILE_STORAGE_KEY, other)
  }
  const driver = createMemoryDriver()
  assert.throws(() => createReaderProfileStore({
    driver,
    legacyDriver: driver,
    storageKey: LEGACY_PROTOTYPE_STORAGE_KEY,
  }))
})

test('fresh reader receives valid defaults, persisted once', async () => {
  const driver = createMemoryDriver()
  const store = createReaderProfileStore({ driver, legacyDriver: driver })
  const first = await store.load()
  assert.deepEqual(first.profile, createDefaultReaderProfile())
  assert.equal(first.health, 'ok')
  assert.equal(first.source, 'defaults')
  assert.equal(first.persisted, true)
  assert.equal(storedProfile(driver).origin, 'defaults')

  const second = await store.load()
  assert.equal(second.source, 'stored')
  assert.deepEqual(second.profile, first.profile)
  assert.equal(driver.writes.length, 1)
})

test('legacy settings migrate once; repeat loads are idempotent; legacy is never mutated', async () => {
  const driver = createMemoryDriver({ [LEGACY_PROTOTYPE_STORAGE_KEY]: LEGACY_FULL })
  const store = createReaderProfileStore({ driver, legacyDriver: driver })

  const first = await store.load()
  assert.equal(first.source, 'migratedLegacy')
  assert.equal(first.health, 'ok')
  assert.equal(first.profile.introStatus, 'completed')
  assert.equal(first.profile.tutorialStatus, 'pending', 'onboarded must not fabricate tutorial completion')
  assert.equal(first.profile.contrastMode, 'dark')
  assert.equal(first.profile.textScale, 'large')
  assert.deepEqual(first.profile.reminder, { enabled: true, time: '06:45' })
  assert.equal(storedProfile(driver).origin, 'legacyPrototypeMigration')

  // Legacy App.tsx keeps writing its own key; the profile must not follow it after migration.
  driver.store.set(LEGACY_PROTOTYPE_STORAGE_KEY, JSON.stringify({ onboarded: false, textSize: 'compact' }))
  for (let i = 0; i < 3; i += 1) {
    const again = await createReaderProfileStore({ driver, legacyDriver: driver }).load()
    assert.equal(again.source, 'stored')
    assert.deepEqual(again.profile, first.profile)
  }
  assert.deepEqual(driver.writes, [{ op: 'set', key: READER_PROFILE_STORAGE_KEY }])
  assert.equal(
    driver.store.get(LEGACY_PROTOTYPE_STORAGE_KEY),
    JSON.stringify({ onboarded: false, textSize: 'compact' }),
  )
})

test('migration precedence: an existing valid profile always wins over legacy', async () => {
  const existing = { ...createDefaultReaderProfile(), introStatus: 'skipped' as const, textScale: 'compact' as const }
  const driver = createMemoryDriver({
    [LEGACY_PROTOTYPE_STORAGE_KEY]: LEGACY_FULL,
    [READER_PROFILE_STORAGE_KEY]: serializeReaderProfileEnvelope(existing, 'defaults'),
  })
  const result = await createReaderProfileStore({ driver, legacyDriver: driver }).load()
  assert.equal(result.source, 'stored')
  assert.deepEqual(result.profile, existing)
  assert.equal(driver.writes.length, 0)
})

test('migration write failure keeps legacy intact and retries on next load', async () => {
  const driver = createMemoryDriver({ [LEGACY_PROTOTYPE_STORAGE_KEY]: LEGACY_FULL })
  driver.failSet = true
  const failed = await createReaderProfileStore({ driver, legacyDriver: driver }).load()
  assert.equal(failed.health, 'writeFailed')
  assert.equal(failed.persisted, false)
  assert.equal(failed.source, 'migratedLegacy')
  assert.equal(failed.profile.introStatus, 'completed')
  assert.equal(driver.store.get(LEGACY_PROTOTYPE_STORAGE_KEY), LEGACY_FULL)
  assert.equal(driver.store.has(READER_PROFILE_STORAGE_KEY), false)

  driver.failSet = false
  const retried = await createReaderProfileStore({ driver, legacyDriver: driver }).load()
  assert.equal(retried.health, 'ok')
  assert.equal(retried.source, 'migratedLegacy')
  assert.deepEqual(retried.profile, failed.profile)
})

test('an update after a failed migration write still carries migrated legacy values', async () => {
  const driver = createMemoryDriver({ [LEGACY_PROTOTYPE_STORAGE_KEY]: LEGACY_FULL })
  const store = createReaderProfileStore({ driver, legacyDriver: driver })
  driver.failSet = true
  await store.load()
  driver.failSet = false
  const result = await store.setTutorialStatus('skipped')
  assert.equal(result.ok, true)
  const saved = storedProfile(driver)
  assert.equal(saved.origin, 'legacyPrototypeMigration')
  assert.equal(saved.profile.introStatus, 'completed')
  assert.equal(saved.profile.tutorialStatus, 'skipped')
  assert.equal(saved.profile.textScale, 'large')
})

test('unreadable legacy JSON yields defaults without touching the legacy record', async () => {
  const driver = createMemoryDriver({ [LEGACY_PROTOTYPE_STORAGE_KEY]: '{broken' })
  const result = await createReaderProfileStore({ driver, legacyDriver: driver }).load()
  assert.equal(result.source, 'defaults')
  assert.equal(result.health, 'ok')
  assert.deepEqual(result.profile, createDefaultReaderProfile())
  assert.equal(result.diagnostics[0]?.field, LEGACY_PROTOTYPE_STORAGE_KEY)
  assert.equal(driver.store.get(LEGACY_PROTOTYPE_STORAGE_KEY), '{broken')
})

test('legacy source read failure writes nothing so migration can happen later', async () => {
  const driver = createMemoryDriver()
  const legacy = createMemoryDriver({ [LEGACY_PROTOTYPE_STORAGE_KEY]: LEGACY_FULL })
  legacy.failGet = true
  const store = createReaderProfileStore({ driver, legacyDriver: legacy })
  const result = await store.load()
  assert.equal(result.health, 'storageUnavailable')
  assert.equal(result.persisted, false)
  assert.deepEqual(result.profile, createDefaultReaderProfile())
  assert.equal(driver.writes.length, 0)
  const update = await store.setIntroStatus('completed')
  assert.equal(update.ok, false)
  assert.equal(!update.ok && update.error, 'storageUnavailable')
  assert.equal(driver.writes.length, 0)

  legacy.failGet = false
  const later = await store.load()
  assert.equal(later.source, 'migratedLegacy')
  assert.equal(later.profile.introStatus, 'completed')
})

test('legacy migration can be disabled', async () => {
  const driver = createMemoryDriver({ [LEGACY_PROTOTYPE_STORAGE_KEY]: LEGACY_FULL })
  const result = await createReaderProfileStore({ driver, legacyDriver: null }).load()
  assert.equal(result.source, 'defaults')
  assert.deepEqual(result.profile, createDefaultReaderProfile())
})

test('Introduction and Tutorial persist and replay independently', async () => {
  const driver = createMemoryDriver()
  const store = createReaderProfileStore({ driver, legacyDriver: driver })
  await store.load()

  await store.setIntroStatus('completed')
  let reloaded = await createReaderProfileStore({ driver, legacyDriver: driver }).load()
  assert.equal(reloaded.profile.introStatus, 'completed')
  assert.equal(reloaded.profile.tutorialStatus, 'pending')

  await store.setTutorialStatus('skipped')
  reloaded = await createReaderProfileStore({ driver, legacyDriver: driver }).load()
  assert.equal(reloaded.profile.introStatus, 'completed')
  assert.equal(reloaded.profile.tutorialStatus, 'skipped')

  await store.setIntroStatus('skipped')
  await store.setTutorialStatus('completed')
  reloaded = await createReaderProfileStore({ driver, legacyDriver: driver }).load()
  assert.equal(reloaded.profile.introStatus, 'skipped')
  assert.equal(reloaded.profile.tutorialStatus, 'completed')

  // Pending is preserved untouched for deferred onboarding (no re-offer timing decided here).
  const deferred = createMemoryDriver()
  const deferredStore = createReaderProfileStore({ driver: deferred, legacyDriver: deferred })
  await deferredStore.load()
  await deferredStore.setTextScale('large')
  const kept = await deferredStore.load()
  assert.equal(kept.profile.introStatus, 'pending')
  assert.equal(kept.profile.tutorialStatus, 'pending')
})

test('guest invite dismissal persists permanently', async () => {
  const driver = createMemoryDriver()
  const store = createReaderProfileStore({ driver, legacyDriver: driver })
  await store.load()
  const dismissed = await store.dismissGuestInvite()
  assert.equal(dismissed.ok && dismissed.profile.guestInviteDismissed, true)
  const reloaded = await createReaderProfileStore({ driver, legacyDriver: driver }).load()
  assert.equal(reloaded.profile.guestInviteDismissed, true)

  const undo = await store.update({ guestInviteDismissed: false } as never)
  assert.equal(undo.ok, false)
  assert.equal(!undo.ok && undo.error, 'invalidValue')
  assert.equal(storedProfile(driver).profile.guestInviteDismissed, true)
})

test('appearance: manual palette survives; follow seasons remembers prior choice', async () => {
  const driver = createMemoryDriver()
  const store = createReaderProfileStore({ driver, legacyDriver: driver })
  await store.load()
  await store.chooseColors('evening-blue')
  await store.setContrastMode('dark')
  let profile = (await store.load()).profile
  assert.deepEqual(profile.appearance, { mode: 'chooseColors', chosenPaletteId: 'evening-blue' })
  assert.equal(profile.contrastMode, 'dark')

  await store.followSeasons()
  profile = (await store.load()).profile
  assert.deepEqual(profile.appearance, { mode: 'followSeasons', chosenPaletteId: 'evening-blue' })
  assert.equal(profile.contrastMode, 'dark', 'contrast is independent of palette mode')

  const invalid = await store.chooseColors('Not A Slug')
  assert.equal(invalid.ok, false)
})

test('text scale and reminder persist; invalid values are rejected without writing', async () => {
  const driver = createMemoryDriver()
  const store = createReaderProfileStore({ driver, legacyDriver: driver })
  await store.load()
  await store.setTextScale('compact')
  await store.setReminder({ enabled: true, time: '21:30' })
  const writesBefore = driver.writes.length
  const bad = await store.setReminder({ enabled: true, time: '24:00' })
  assert.equal(bad.ok, false)
  assert.equal(driver.writes.length, writesBefore)
  const profile = (await store.load()).profile
  assert.equal(profile.textScale, 'compact')
  assert.deepEqual(profile.reminder, { enabled: true, time: '21:30' })
})

test('unchanged update does not write', async () => {
  const driver = createMemoryDriver()
  const store = createReaderProfileStore({ driver, legacyDriver: driver })
  await store.load()
  const writes = driver.writes.length
  const result = await store.setIntroStatus('pending')
  assert.deepEqual(result.ok && result.changed, false)
  assert.equal(driver.writes.length, writes)
})

test('corrupt profile: safe fallback, never overwritten by updates, explicit recovery', async () => {
  const driver = createMemoryDriver({
    [READER_PROFILE_STORAGE_KEY]: '{not json',
    [LEGACY_PROTOTYPE_STORAGE_KEY]: LEGACY_FULL,
  })
  const store = createReaderProfileStore({ driver, legacyDriver: driver })
  const loaded = await store.load()
  assert.equal(loaded.health, 'corruptStoredData')
  assert.equal(loaded.persisted, false)
  assert.equal(loaded.profile.introStatus, 'completed', 'falls back to legacy-derived values in memory')

  const update = await store.setTextScale('compact')
  assert.equal(update.ok, false)
  assert.equal(!update.ok && update.error, 'corruptStoredData')
  assert.equal(driver.store.get(READER_PROFILE_STORAGE_KEY), '{not json')
  assert.equal(driver.writes.length, 0)

  const recovered = await store.recoverCorruptProfile()
  assert.equal(recovered.ok, true)
  assert.equal(driver.store.get(LEGACY_PROTOTYPE_STORAGE_KEY), LEGACY_FULL)
  const after = await store.load()
  assert.equal(after.health, 'ok')
  assert.equal(after.source, 'stored')
  assert.equal(after.profile.introStatus, 'completed')
  assert.equal(after.profile.tutorialStatus, 'pending')

  const again = await store.recoverCorruptProfile()
  assert.equal(!again.ok && again.error, 'notCorrupt')
})

test('unknown older/garbage schema is corrupt; newer schema is never overwritten', async () => {
  const older = createMemoryDriver({ [READER_PROFILE_STORAGE_KEY]: '{"schemaVersion":0,"profile":{}}' })
  assert.equal((await createReaderProfileStore({ driver: older }).load()).health, 'corruptStoredData')

  const newerRaw = JSON.stringify({ schemaVersion: 7, profile: { futureField: true } })
  const driver = createMemoryDriver({ [READER_PROFILE_STORAGE_KEY]: newerRaw })
  const store = createReaderProfileStore({ driver, legacyDriver: driver })
  const loaded = await store.load()
  assert.equal(loaded.health, 'unsupportedNewerSchema')
  assert.deepEqual(loaded.profile, createDefaultReaderProfile())
  const update = await store.dismissGuestInvite()
  assert.equal(!update.ok && update.error, 'unsupportedNewerSchema')
  const recovery = await store.recoverCorruptProfile()
  assert.equal(!recovery.ok && recovery.error, 'unsupportedNewerSchema')
  assert.equal(driver.store.get(READER_PROFILE_STORAGE_KEY), newerRaw)
  assert.equal(driver.writes.length, 0)
})

test('valid v1 profile with invalid fields normalizes on load and is repaired on next write', async () => {
  const raw = JSON.stringify({
    schemaVersion: 1,
    origin: 'defaults',
    profile: { introStatus: 'completed', tutorialStatus: 'bogus', textScale: 'large' },
  })
  const driver = createMemoryDriver({ [READER_PROFILE_STORAGE_KEY]: raw })
  const store = createReaderProfileStore({ driver })
  const loaded = await store.load()
  assert.equal(loaded.health, 'ok')
  assert.equal(loaded.profile.introStatus, 'completed')
  assert.equal(loaded.profile.tutorialStatus, 'pending')
  assert.equal(loaded.profile.textScale, 'large')
  assert.ok(loaded.diagnostics.some(d => d.field === 'tutorialStatus'))
  assert.equal(driver.writes.length, 0, 'load never rewrites a stored record')

  await store.setContrastMode('light')
  const saved = storedProfile(driver).profile
  assert.equal(saved.tutorialStatus, 'pending')
  assert.equal(saved.contrastMode, 'light')
  assert.equal(saved.introStatus, 'completed')
})

test('profile read failure returns defaults and writes nothing', async () => {
  const driver = createMemoryDriver({ [LEGACY_PROTOTYPE_STORAGE_KEY]: LEGACY_FULL })
  driver.failGet = true
  const store = createReaderProfileStore({ driver, legacyDriver: driver })
  const loaded = await store.load()
  assert.equal(loaded.health, 'storageUnavailable')
  assert.deepEqual(loaded.profile, createDefaultReaderProfile())
  const update = await store.setIntroStatus('completed')
  assert.equal(!update.ok && update.error, 'storageUnavailable')
  assert.equal(driver.writes.length, 0)
})

test('write failure on update leaves the previous stored record unchanged', async () => {
  const driver = createMemoryDriver()
  driver.async = true
  const store = createReaderProfileStore({ driver, legacyDriver: driver })
  await store.load()
  await store.setIntroStatus('completed')
  const before = driver.store.get(READER_PROFILE_STORAGE_KEY)
  driver.failSet = true
  const failed = await store.setTutorialStatus('completed')
  assert.equal(!failed.ok && failed.error, 'writeFailed')
  assert.equal(!failed.ok && failed.profile.introStatus, 'completed')
  assert.equal(driver.store.get(READER_PROFILE_STORAGE_KEY), before)
})

test('unrelated records (participation, Cards, Scripture, Shelf, sync) are never touched', async () => {
  const driver = createMemoryDriver({ ...UNRELATED_RECORDS, [LEGACY_PROTOTYPE_STORAGE_KEY]: LEGACY_FULL })
  const store = createReaderProfileStore({ driver, legacyDriver: driver })
  await store.load()
  await store.setIntroStatus('skipped')
  await store.setTutorialStatus('completed')
  await store.dismissGuestInvite()
  await store.chooseColors('moss')
  await store.followSeasons()
  await store.setContrastMode('light')
  await store.setTextScale('compact')
  await store.setReminder({ enabled: false, time: '10:00' })
  driver.store.set(READER_PROFILE_STORAGE_KEY, '{corrupt')
  await store.load()
  await store.recoverCorruptProfile()

  for (const [key, value] of Object.entries(UNRELATED_RECORDS)) {
    assert.equal(driver.store.get(key), value, key)
  }
  assert.equal(driver.store.get(LEGACY_PROTOTYPE_STORAGE_KEY), LEGACY_FULL)
  assert.ok(driver.writes.every(w => w.op === 'set' && w.key === READER_PROFILE_STORAGE_KEY))
})

test('concurrent updates are serialized and none is lost (async driver)', async () => {
  const driver = createMemoryDriver()
  driver.async = true
  const store = createReaderProfileStore({ driver, legacyDriver: driver })
  const results = await Promise.all([
    store.setIntroStatus('completed'),
    store.setTutorialStatus('skipped'),
    store.dismissGuestInvite(),
    store.setTextScale('large'),
    store.chooseColors('dawn'),
  ])
  assert.ok(results.every(r => r.ok))
  const profile = (await store.load()).profile
  assert.equal(profile.introStatus, 'completed')
  assert.equal(profile.tutorialStatus, 'skipped')
  assert.equal(profile.guestInviteDismissed, true)
  assert.equal(profile.textScale, 'large')
  assert.deepEqual(profile.appearance, { mode: 'chooseColors', chosenPaletteId: 'dawn' })
})

test('subscribers are notified only after successful durable writes', async () => {
  const driver = createMemoryDriver()
  const store = createReaderProfileStore({ driver, legacyDriver: driver })
  const seen: string[] = []
  const unsubscribe = store.subscribe(p => seen.push(p.introStatus))
  await store.load()
  await store.setIntroStatus('completed')
  await store.setIntroStatus('completed')
  driver.failSet = true
  await store.setIntroStatus('skipped')
  unsubscribe()
  driver.failSet = false
  await store.setIntroStatus('pending')
  assert.deepEqual(seen, ['pending', 'completed'])
})

test('platform factory: native uses Preferences for profile but reads legacy from web storage', async () => {
  const prefs = new Map<string, string>()
  const web = new Map<string, string>([[LEGACY_PROTOTYPE_STORAGE_KEY, LEGACY_FULL]])
  const webStorage = {
    getItem: (k: string) => web.get(k) ?? null,
    setItem: (k: string, v: string) => void web.set(k, v),
    removeItem: (k: string) => void web.delete(k),
  }
  const store = createPlatformReaderProfileStore({
    isNativePlatform: () => true,
    webStorage,
    nativePreferences: {
      get: async ({ key }) => ({ value: prefs.get(key) ?? null }),
      set: async ({ key, value }) => void prefs.set(key, value),
      remove: async ({ key }) => void prefs.delete(key),
    },
  })
  const loaded = await store.load()
  assert.equal(loaded.source, 'migratedLegacy')
  assert.ok(prefs.has(READER_PROFILE_STORAGE_KEY))
  assert.equal(web.has(READER_PROFILE_STORAGE_KEY), false)
  assert.equal(web.get(LEGACY_PROTOTYPE_STORAGE_KEY), LEGACY_FULL)

  const webStore = createPlatformReaderProfileStore({ isNativePlatform: () => false, webStorage })
  const webLoaded = await webStore.load()
  assert.equal(webLoaded.source, 'migratedLegacy')
  assert.ok(web.has(READER_PROFILE_STORAGE_KEY))
})

test('corrupt profile + legacy read failure: recovery writes nothing, then migrates on retry', async () => {
  const driver = createMemoryDriver({ [READER_PROFILE_STORAGE_KEY]: '{corrupt' })
  const legacy = createMemoryDriver({ [LEGACY_PROTOTYPE_STORAGE_KEY]: LEGACY_FULL })
  const store = createReaderProfileStore({ driver, legacyDriver: legacy })

  legacy.failGet = true
  const loaded = await store.load()
  assert.equal(loaded.health, 'corruptStoredData')
  assert.equal(loaded.persisted, false)
  assert.ok(loaded.diagnostics.some(d => d.field === LEGACY_PROTOTYPE_STORAGE_KEY))

  const blocked = await store.recoverCorruptProfile()
  assert.equal(blocked.ok, false)
  assert.equal(!blocked.ok && blocked.error, 'storageUnavailable')
  assert.equal(driver.writes.length, 0)
  assert.equal(driver.store.get(READER_PROFILE_STORAGE_KEY), '{corrupt')

  legacy.failGet = false
  const recovered = await store.recoverCorruptProfile()
  assert.equal(recovered.ok, true)
  assert.deepEqual(driver.writes, [{ op: 'set', key: READER_PROFILE_STORAGE_KEY }])
  assert.equal(storedProfile(driver).origin, 'legacyPrototypeMigration')

  const after = await createReaderProfileStore({ driver, legacyDriver: legacy }).load()
  assert.equal(after.source, 'stored')
  assert.equal(after.profile.introStatus, 'completed')
  assert.equal(after.profile.tutorialStatus, 'pending')
  assert.equal(after.profile.contrastMode, 'dark')
  assert.equal(after.profile.textScale, 'large')
  assert.deepEqual(after.profile.reminder, { enabled: true, time: '06:45' })
  assert.equal(legacy.store.get(LEGACY_PROTOTYPE_STORAGE_KEY), LEGACY_FULL)
  assert.equal(legacy.writes.length, 0)
})

test('corrupt profile recovers to defaults when legacy is disabled or read as absent', async () => {
  const disabled = createMemoryDriver({ [READER_PROFILE_STORAGE_KEY]: '{corrupt' })
  const r1 = await createReaderProfileStore({ driver: disabled, legacyDriver: null }).recoverCorruptProfile()
  assert.equal(r1.ok, true)
  assert.equal(storedProfile(disabled).origin, 'defaults')

  const absent = createMemoryDriver({ [READER_PROFILE_STORAGE_KEY]: '{corrupt' })
  const r2 = await createReaderProfileStore({ driver: absent, legacyDriver: absent }).recoverCorruptProfile()
  assert.equal(r2.ok, true)
  assert.deepEqual(storedProfile(absent).profile, createDefaultReaderProfile())
})
