import assert from 'node:assert/strict'
import { test } from 'node:test'
import { admitTrustedCatalogChallenge } from '../../src/participation/admission.ts'
import { createPlatformGuestParticipationStore } from '../../src/participation/defaultGuestStore.ts'
import {
  createCapacitorPreferencesDriver,
  type CapacitorPreferencesBridge,
} from '../../src/participation/drivers/capacitorPreferencesDriver.ts'
import { parseLocalCalendarDate, parseStoredChallengeId } from '../../src/participation/identity.ts'
import {
  createEnvelopePersistenceAdapter,
  type KeyValueStorageDriver,
} from '../../src/participation/persistence.ts'
import { createReaderParticipationStore } from '../../src/participation/store.ts'
import type { CanonicalChallengeId } from '../../src/participation/types.ts'
import {
  createScriptureCaptureController,
  validateScriptureCaptureInput,
  validateScriptureReference,
  type ScriptureCaptureInput,
} from '../../src/scriptureCapture/index.ts'

const STORAGE_KEY = 'bibleberry-r09-2-test-v2'
const DAY_1 = parseLocalCalendarDate('2026-11-15')!
const DAY_2 = parseLocalCalendarDate('2026-11-16')!

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(res => {
    resolve = res
  })
  return { promise, resolve }
}

function createMemoryWebDriver(backing = new Map<string, string>()): KeyValueStorageDriver {
  return {
    getItem: key => backing.get(key) ?? null,
    setItem: (key, value) => {
      backing.set(key, value)
    },
    removeItem: key => {
      backing.delete(key)
    },
  }
}

function createMemoryStore(backing = new Map<string, string>()) {
  const driver = createMemoryWebDriver(backing)
  return createReaderParticipationStore(
    createEnvelopePersistenceAdapter({ storageKey: STORAGE_KEY, driver }),
  )
}

function createAdmittedSampleChallenge() {
  const admitted = admitTrustedCatalogChallenge({
    documentId: 'nov-16-gratitude',
    screens: [{ id: 'screen-1' }],
    editorial: { adaptationReviewed: true },
  })
  assert.ok(admitted, 'expected sample challenge to be admitted')
  return admitted
}

test('validateScriptureReference accepts valid citations and rejects malformed or manuscript-like inputs', () => {
  const validCases = [
    'John 3:16',
    '1 Thessalonians 5:16–18',
    '  1 thessalonians 5 : 16 - 18 ',
    'Song of Solomon 2:1',
    'Éxodo 14:14',
    '1 Chronicles 16:8–36; Psalm 105:1–15',
    'Psalm 23',
    'John 3:16, 18',
    'Philemon 1:4-7',
  ]

  for (const ref of validCases) {
    const result = validateScriptureReference(ref)
    assert.equal(result.ok, true, `Expected valid reference for: ${ref}`)
  }

  const invalidCases: unknown[] = [
    '',
    '   ',
    null,
    undefined,
    123,
    'Genesis',
    '3:16',
    '12345',
    'John 3:',
    'John 3:16-',
    'John 0:1',
    '<script>John 3:16</script>',
    'John 3:16 "For God so loved the world"',
    'John 3:16\nFor God so loved the world',
    'https://example.com/John 3:16',
    `Psalm 119:${'1-'.repeat(85)}2`,
  ]

  for (const ref of invalidCases) {
    const result = validateScriptureReference(ref)
    assert.equal(result.ok, false, `Expected invalid reference for: ${String(ref)}`)
  }
})

test('repeated saves prevent duplicates and preserve original savedOn and provenance', async () => {
  const backing = new Map<string, string>()
  const store = createMemoryStore(backing)
  await store.whenReady()

  let currentDay = DAY_1
  const controller = createScriptureCaptureController(store, {
    getToday: () => currentDay,
  })
  const admitted = createAdmittedSampleChallenge()

  const first = await controller.save({
    reference: '1 Thessalonians 5:16–18',
    translation: 'WEBP',
    sourceChallenge: admitted,
  })
  assert.equal(first.ok, true)
  if (first.ok) assert.equal(first.action, 'saved')

  currentDay = DAY_2
  const duplicate = await controller.save({
    reference: '  1 thessalonians 5 : 16 - 18 ',
    translation: 'webp',
  })
  assert.equal(duplicate.ok, true)
  if (duplicate.ok) assert.equal(duplicate.action, 'unchanged')

  const saved = store.getSnapshot().data.savedScriptures
  assert.equal(saved.length, 1)
  assert.equal(saved[0].savedOn, DAY_1)
  assert.equal(saved[0].sourceChallengeId, admitted.challengeId)
})

test('translation differences are tracked independently and Not configured normalizes to null', async () => {
  const store = createMemoryStore()
  await store.whenReady()

  const controller = createScriptureCaptureController(store, {
    getToday: () => DAY_1,
  })

  await controller.save({ reference: 'John 3:16', translation: 'WEBP' })
  await controller.save({ reference: 'John 3:16', translation: 'NIV' })
  await controller.save({ reference: 'John 3:16', translation: 'Not configured' })
  await controller.save({ reference: 'John 3:16', translation: null })

  const saved = store.getSnapshot().data.savedScriptures
  assert.equal(saved.length, 3)
  assert.deepEqual(
    saved.map(item => item.translation),
    ['WEBP', 'NIV', null],
  )

  assert.equal(controller.getState({ reference: 'John 3:16', translation: 'ESV' }).isSaved, false)
  assert.equal(controller.getState({ reference: 'John 3:16', translation: 'WEBP' }).isSaved, true)
})

test('user-controlled removal removes only the targeted reference/translation and preserves unrelated state', async () => {
  const store = createMemoryStore()
  await store.whenReady()

  const challengeId = parseStoredChallengeId('cms:nov-16-gratitude')!
  await store.dispatch({
    type: 'completeChallenge',
    challengeId,
    completedOn: DAY_1,
  })

  const controller = createScriptureCaptureController(store, {
    getToday: () => DAY_1,
  })

  await controller.save({ reference: 'Psalm 23:1', translation: 'WEBP' })
  await controller.save({ reference: 'Psalm 23:1', translation: 'NIV' })

  const removeResult = await controller.remove({ reference: 'Psalm 23:1', translation: 'WEBP' })
  assert.equal(removeResult.ok, true)
  if (removeResult.ok) assert.equal(removeResult.action, 'removed')

  const noopRemove = await controller.remove({ reference: 'Psalm 23:1', translation: 'WEBP' })
  assert.equal(noopRemove.ok, true)
  if (noopRemove.ok) assert.equal(noopRemove.action, 'unchanged')

  const data = store.getSnapshot().data
  assert.equal(data.savedScriptures.length, 1)
  assert.equal(data.savedScriptures[0].translation, 'NIV')
  assert.equal(data.completedChallenges[challengeId]?.completedOn, DAY_1)
})

test('forged or unauthorized Challenge provenance is stripped and manuscript passage text is never stored', async () => {
  const backing = new Map<string, string>()
  const store = createMemoryStore(backing)
  await store.whenReady()

  const controller = createScriptureCaptureController(store, {
    getToday: () => DAY_1,
  })

  const inputWithPassage = {
    reference: 'Psalm 23:1',
    translation: 'NIV',
    sourceChallengeId: 'drafts.secret-challenge' as CanonicalChallengeId,
    passage: 'The LORD is my shepherd; I shall not want.',
  } as ScriptureCaptureInput

  const validated = validateScriptureCaptureInput(inputWithPassage)
  assert.equal(validated.ok, true)
  if (validated.ok) {
    assert.equal(validated.value.sourceChallengeId, undefined)
    assert.equal('passage' in validated.value, false)
  }

  await controller.save(inputWithPassage)
  const rawStored = backing.get(STORAGE_KEY) ?? ''
  assert.equal(rawStored.includes('shepherd'), false)
  assert.equal(rawStored.includes('drafts.secret-challenge'), false)
  assert.equal(store.getSnapshot().data.savedScriptures[0].sourceChallengeId, undefined)
})

test('async Capacitor Preferences store blocks mutations during hydration and persists once ready', async () => {
  const backing = new Map<string, string>()
  const hydrationGate = createDeferred<{ readonly value: string | null }>()
  let firstRead = true

  const preferences: CapacitorPreferencesBridge = {
    get: async ({ key }) => {
      if (firstRead) {
        firstRead = false
        return hydrationGate.promise
      }
      return { value: backing.get(key) ?? null }
    },
    set: async ({ key, value }) => {
      backing.set(key, value)
    },
    remove: async ({ key }) => {
      backing.delete(key)
    },
  }

  const nativeStore = createPlatformGuestParticipationStore({
    isNativePlatform: () => true,
    nativePreferences: preferences,
    storageKey: STORAGE_KEY,
  })

  const controller = createScriptureCaptureController(nativeStore, {
    getToday: () => DAY_1,
  })

  const hydratingState = controller.getState({ reference: 'Romans 8:28', translation: 'WEBP' })
  assert.equal(hydratingState.status, 'hydrating')
  assert.equal(hydratingState.canMutate, false)

  const blockedSave = await controller.save({ reference: 'Romans 8:28', translation: 'WEBP' })
  assert.deepEqual(blockedSave, { ok: false, reason: 'hydrating' })

  hydrationGate.resolve({ value: null })
  await nativeStore.whenReady()

  const readyState = controller.getState({ reference: 'Romans 8:28', translation: 'WEBP' })
  assert.equal(readyState.status, 'ready')
  assert.equal(readyState.canMutate, true)

  const saved = await controller.toggle({ reference: 'Romans 8:28', translation: 'WEBP' })
  assert.equal(saved.ok, true)
  if (saved.ok) assert.equal(saved.action, 'saved')

  // Reload in a fresh native store instance using the same Capacitor driver
  const reloadedStore = createReaderParticipationStore(
    createEnvelopePersistenceAdapter({
      storageKey: STORAGE_KEY,
      driver: createCapacitorPreferencesDriver({ preferences }),
    }),
  )
  await reloadedStore.whenReady()
  assert.equal(reloadedStore.getSnapshot().data.savedScriptures.length, 1)
  assert.equal(reloadedStore.getSnapshot().data.savedScriptures[0].reference, 'Romans 8:28')
})

test('write failures surface retryable state and flushPending recovers cleanly', async () => {
  const backing = new Map<string, string>()
  let shouldFailWrite = true

  const driver: KeyValueStorageDriver = {
    getItem: key => backing.get(key) ?? null,
    setItem: (key, value) => {
      if (shouldFailWrite) {
        throw new Error('QuotaExceededError')
      }
      backing.set(key, value)
    },
    removeItem: key => {
      backing.delete(key)
    },
  }

  const store = createReaderParticipationStore(
    createEnvelopePersistenceAdapter({ storageKey: STORAGE_KEY, driver }),
  )
  await store.whenReady()

  const controller = createScriptureCaptureController(store, {
    getToday: () => DAY_1,
  })

  await controller.save({ reference: 'John 11:35', translation: 'WEBP' })

  const failedState = controller.getState({ reference: 'John 11:35', translation: 'WEBP' })
  assert.equal(failedState.isSaved, true)
  assert.equal(failedState.health, 'writeFailed')
  assert.equal(failedState.hasPendingWrites, true)
  assert.equal(failedState.canRetry, true)
  assert.ok(failedState.writeErrorMessage)

  shouldFailWrite = false
  await controller.retry()

  const recoveredState = controller.getState({ reference: 'John 11:35', translation: 'WEBP' })
  assert.equal(recoveredState.health, 'ok')
  assert.equal(recoveredState.hasPendingWrites, false)
  assert.equal(recoveredState.writeErrorMessage, null)
})

test('corrupt stored data and unsupported newer schema block mutations without overwriting disk', async () => {
  const corruptRaw = '{not-valid-json'
  const corruptBacking = new Map([[STORAGE_KEY, corruptRaw]])
  const corruptStore = createMemoryStore(corruptBacking)
  await corruptStore.whenReady()

  const corruptController = createScriptureCaptureController(corruptStore, {
    getToday: () => DAY_1,
  })
  const corruptState = corruptController.getState({ reference: 'John 3:16' })
  assert.equal(corruptState.status, 'corruptStoredData')
  assert.equal(corruptState.canMutate, false)
  assert.deepEqual(await corruptController.save({ reference: 'John 3:16' }), {
    ok: false,
    reason: 'corruptStoredData',
  })
  assert.equal(corruptBacking.get(STORAGE_KEY), corruptRaw)

  const newerRaw = JSON.stringify({ schemaVersion: 99, data: {} })
  const newerBacking = new Map([[STORAGE_KEY, newerRaw]])
  const newerStore = createMemoryStore(newerBacking)
  await newerStore.whenReady()

  const newerController = createScriptureCaptureController(newerStore, {
    getToday: () => DAY_1,
  })
  const newerState = newerController.getState({ reference: 'John 3:16' })
  assert.equal(newerState.status, 'unsupportedNewerSchema')
  assert.equal(newerState.canMutate, false)
  assert.deepEqual(await newerController.save({ reference: 'John 3:16' }), {
    ok: false,
    reason: 'unsupportedNewerSchema',
  })
  assert.equal(newerBacking.get(STORAGE_KEY), newerRaw)
})
