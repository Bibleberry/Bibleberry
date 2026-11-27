import assert from 'node:assert/strict'
import test from 'node:test'
import {
  READER_PROFILE_STORAGE_KEY,
  createDefaultReaderProfile,
  createReaderProfileStore,
  serializeReaderProfileEnvelope,
} from '../../src/readerProfile/index.ts'
import {
  APPLIED_PALETTE_LABEL,
  CHOOSE_COLORS_UNAVAILABLE_REASON,
  INVALID_APPEARANCE_NOTICE,
  applyAppearanceModeChoice,
  buildAppearanceSettingsViewModel,
} from '../../src/readerShell/appearance/appearanceSettingsModel.ts'
import { UNRELATED_RECORDS, createMemoryDriver } from '../readerProfile/helpers.ts'

test('fresh reader defaults to Follow Bibleberry Seasons and keeps Choose My Colors truthfully unavailable', async () => {
  const driver = createMemoryDriver({ ...UNRELATED_RECORDS })
  const store = createReaderProfileStore({ driver })

  const loaded = await store.load()
  const view = buildAppearanceSettingsViewModel({ status: 'ready', result: loaded })

  assert.equal(view.savedMode, 'followSeasons')
  assert.equal(view.savedModeLabel, 'Follow Bibleberry Seasons')
  assert.equal(view.rememberedPaletteId, null)
  assert.equal(view.isSavedOnDevice, true)
  assert.equal(view.canSelectFollowSeasons, true)
  assert.equal(view.canSelectChooseColors, false)
  assert.equal(view.chooseColorsUnavailableReason, CHOOSE_COLORS_UNAVAILABLE_REASON)
  assert.equal(view.appliedPaletteLabel, APPLIED_PALETTE_LABEL)
  assert.equal(view.invalidAppearanceNotice, null)
  assert.equal(view.storageAlert, null)

  // Attempting to select Choose My Colors without a valid existing palette fails truthfully
  // without inventing an identifier or mutating storage.
  const writesBefore = driver.writes.length
  const attempt = await applyAppearanceModeChoice(store, loaded.profile, 'chooseColors')
  assert.equal(attempt.ok, false)
  if (!attempt.ok) {
    assert.equal(attempt.error, 'invalidValue')
    assert.equal(attempt.profile.appearance.mode, 'followSeasons')
    assert.equal(attempt.profile.appearance.chosenPaletteId, null)
  }
  assert.equal(driver.writes.length, writesBefore)

  // Unrelated participation, Shelf, and legacy keys remain untouched.
  for (const [key, value] of Object.entries(UNRELATED_RECORDS)) {
    assert.equal(driver.store.get(key), value)
  }
})

test('existing valid manual preference is preserved when switching to Follow Bibleberry Seasons and back', async () => {
  const initial = {
    ...createDefaultReaderProfile(),
    appearance: { mode: 'chooseColors' as const, chosenPaletteId: 'olive-linen' },
    contrastMode: 'dark' as const,
  }
  const driver = createMemoryDriver({
    [READER_PROFILE_STORAGE_KEY]: serializeReaderProfileEnvelope(initial, 'defaults'),
    ...UNRELATED_RECORDS,
  })
  const store = createReaderProfileStore({ driver })

  const loaded = await store.load()
  const initialView = buildAppearanceSettingsViewModel({ status: 'ready', result: loaded })
  assert.equal(initialView.savedMode, 'chooseColors')
  assert.equal(initialView.rememberedPaletteId, 'olive-linen')
  assert.equal(initialView.canSelectChooseColors, true)
  assert.equal(initialView.chooseColorsUnavailableReason, null)
  assert.equal(initialView.appliedPaletteLabel, APPLIED_PALETTE_LABEL)
  assert.equal(initialView.contrastModeLabel, 'Dark')

  // Switch to Follow Bibleberry Seasons: preserves remembered manual palette.
  const toSeasons = await applyAppearanceModeChoice(store, loaded.profile, 'followSeasons')
  assert.equal(toSeasons.ok, true)
  if (toSeasons.ok) {
    assert.deepEqual(toSeasons.profile.appearance, {
      mode: 'followSeasons',
      chosenPaletteId: 'olive-linen',
    })
    assert.equal(toSeasons.profile.contrastMode, 'dark')
  }

  // Relaunch with a new store instance: still Follow Bibleberry Seasons with remembered palette.
  const relaunchedAfterSeasons = await createReaderProfileStore({ driver }).load()
  assert.deepEqual(relaunchedAfterSeasons.profile.appearance, {
    mode: 'followSeasons',
    chosenPaletteId: 'olive-linen',
  })

  // Switch back to Choose My Colors: restores remembered manual palette without inventing one.
  const backToManual = await applyAppearanceModeChoice(
    store,
    relaunchedAfterSeasons.profile,
    'chooseColors',
  )
  assert.equal(backToManual.ok, true)
  if (backToManual.ok) {
    assert.deepEqual(backToManual.profile.appearance, {
      mode: 'chooseColors',
      chosenPaletteId: 'olive-linen',
    })
  }

  // Relaunch again: manual selection persists durably.
  const relaunchedAfterManual = await createReaderProfileStore({ driver }).load()
  assert.deepEqual(relaunchedAfterManual.profile.appearance, {
    mode: 'chooseColors',
    chosenPaletteId: 'olive-linen',
  })
  assert.equal(relaunchedAfterManual.profile.contrastMode, 'dark')
})

test('invalid stored appearance preference safely falls back to Follow Bibleberry Seasons with honest notice', async () => {
  const invalidEnvelope = JSON.stringify({
    schemaVersion: 1,
    origin: 'defaults',
    profile: {
      ...createDefaultReaderProfile(),
      appearance: { mode: 'chooseColors', chosenPaletteId: null },
    },
  })
  const driver = createMemoryDriver({
    [READER_PROFILE_STORAGE_KEY]: invalidEnvelope,
  })
  const store = createReaderProfileStore({ driver })

  const loaded = await store.load()
  const view = buildAppearanceSettingsViewModel({ status: 'ready', result: loaded })

  assert.equal(loaded.health, 'ok')
  assert.equal(view.savedMode, 'followSeasons')
  assert.equal(view.rememberedPaletteId, null)
  assert.equal(view.canSelectChooseColors, false)
  assert.equal(view.invalidAppearanceNotice, INVALID_APPEARANCE_NOTICE)
})

test('storage write failure leaves prior stored preference intact and reports writeFailed truthfully', async () => {
  const initial = {
    ...createDefaultReaderProfile(),
    appearance: { mode: 'chooseColors' as const, chosenPaletteId: 'olive-linen' },
  }
  const driver = createMemoryDriver({
    [READER_PROFILE_STORAGE_KEY]: serializeReaderProfileEnvelope(initial, 'defaults'),
  })
  const store = createReaderProfileStore({ driver })
  const loaded = await store.load()

  driver.failSet = true
  const failed = await applyAppearanceModeChoice(store, loaded.profile, 'followSeasons')
  assert.equal(failed.ok, false)
  if (!failed.ok) {
    assert.equal(failed.error, 'writeFailed')
    assert.deepEqual(failed.profile.appearance, {
      mode: 'chooseColors',
      chosenPaletteId: 'olive-linen',
    })
  }

  driver.failSet = false
  const verified = await createReaderProfileStore({ driver }).load()
  assert.deepEqual(verified.profile.appearance, {
    mode: 'chooseColors',
    chosenPaletteId: 'olive-linen',
  })
})

test('corrupt, newer-schema, unavailable, and initial writeFailed states surface truthful alerts and disable unsafe writes', async () => {
  // Corrupt stored profile
  const corruptDriver = createMemoryDriver({ [READER_PROFILE_STORAGE_KEY]: '{not-json' })
  const corruptLoaded = await createReaderProfileStore({ driver: corruptDriver }).load()
  const corruptView = buildAppearanceSettingsViewModel({ status: 'ready', result: corruptLoaded })
  assert.equal(corruptView.canSavePreferences, false)
  assert.equal(corruptView.isSavedOnDevice, false)
  assert.ok(corruptView.storageAlert)

  // Unsupported newer schema
  const newerDriver = createMemoryDriver({
    [READER_PROFILE_STORAGE_KEY]: JSON.stringify({ schemaVersion: 99, profile: {} }),
  })
  const newerLoaded = await createReaderProfileStore({ driver: newerDriver }).load()
  const newerView = buildAppearanceSettingsViewModel({ status: 'ready', result: newerLoaded })
  assert.equal(newerView.canSavePreferences, false)
  assert.equal(newerView.isSavedOnDevice, false)
  assert.ok(newerView.storageAlert)

  // Storage unavailable
  const unavailableDriver = createMemoryDriver()
  unavailableDriver.failGet = true
  const unavailableLoaded = await createReaderProfileStore({ driver: unavailableDriver }).load()
  const unavailableView = buildAppearanceSettingsViewModel({
    status: 'ready',
    result: unavailableLoaded,
  })
  assert.equal(unavailableView.canSavePreferences, false)
  assert.equal(unavailableView.isSavedOnDevice, false)
  assert.ok(unavailableView.storageAlert)

  // Initial write failure on fresh profile
  const writeFailedDriver = createMemoryDriver()
  writeFailedDriver.failSet = true
  const writeFailedLoaded = await createReaderProfileStore({ driver: writeFailedDriver }).load()
  const writeFailedView = buildAppearanceSettingsViewModel({
    status: 'ready',
    result: writeFailedLoaded,
  })
  assert.equal(writeFailedView.isSavedOnDevice, false)
  assert.equal(writeFailedView.canRetryInitialSave, true)
  assert.ok(writeFailedView.storageAlert)
})
