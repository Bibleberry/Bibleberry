import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canCompleteChallenge, challengePlayerPosition, resolveChallengePlayerCopy, resolveScreenIndex } from '../../src/components/challenge/challengePlayerModel.ts'
import { parseChallengeOrigin, parseChallengeOriginFromSearchParams, serializeChallengeOriginToSearchParams } from '../../src/cms/reader/challengeOrigin.ts'
import { createPersistedChallengeFinishController } from '../../src/participation/persistedChallengeHostModel.ts'
import { createEnvelopePersistenceAdapter } from '../../src/participation/persistence.ts'
import { createReaderParticipationStore } from '../../src/participation/store.ts'
import { parseLocalCalendarDate, parseStoredChallengeId } from '../../src/participation/identity.ts'

const first = parseStoredChallengeId('cms:challenge-lifecycle-first')!
const second = parseStoredChallengeId('cms:challenge-lifecycle-second')!
const date = parseLocalCalendarDate('2026-11-18')!

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

test('Finish is available only on the final required screen; optional material is not a prerequisite', () => {
  const screens = [{ id: 'opening' }, { id: 'closing' }]
  const opening = challengePlayerPosition(screens, 'opening')
  const closing = challengePlayerPosition(screens, 'closing')

  assert.equal(canCompleteChallenge(opening, false), false)
  assert.equal(canCompleteChallenge(closing, false), true)
  assert.equal(canCompleteChallenge(closing, true), false)
  assert.equal(resolveChallengePlayerCopy().finishButton, 'Finish')
  assert.equal(resolveScreenIndex(screens, 'deleted-screen'), 0)
  assert.equal(resolveScreenIndex(screens, 'closing'), 1)
})

test('rapid Finish taps dispatch one completion and one return; re-entry cannot return twice', () => {
  const controller = createPersistedChallengeFinishController()
  let completionWrites = 0
  let returns = 0
  const input = {
    screens: [{ id: 'one' }, { id: 'two' }],
    activeScreenId: 'two',
    isCompleted: false,
    returnOnFinish: true,
    dispatchComplete: () => { completionWrites += 1 },
    onExit: () => { returns += 1 },
  }

  assert.deepEqual(controller.triggerFinish(input), { completedDispatched: true, returnInvoked: true })
  assert.deepEqual(controller.triggerFinish(input), { completedDispatched: false, returnInvoked: false })
  assert.equal(controller.triggerExit(input.onExit), false)
  assert.equal(completionWrites, 1)
  assert.equal(returns, 1)
})

test('a missing/reordered screen identity clamps safely, and distinct canonical IDs remain isolated', async () => {
  const backing = new Map<string, string>()
  const driver = {
    getItem: async (key: string) => backing.get(key) ?? null,
    setItem: async (key: string, value: string) => { backing.set(key, value) },
    removeItem: async (key: string) => { backing.delete(key) },
  }
  const store = createReaderParticipationStore(createEnvelopePersistenceAdapter({ storageKey: 'lifecycle', driver }))
  await store.whenReady()

  await store.dispatch({ type: 'saveChallengeProgress', challengeId: first, screenId: 'screen-b', updatedOn: date })
  assert.equal(resolveScreenIndex([{ id: 'screen-a' }, { id: 'screen-b' }], 'screen-b'), 1)
  assert.equal(resolveScreenIndex([{ id: 'screen-a' }, { id: 'screen-c' }], 'screen-b'), 0)

  await store.dispatch({ type: 'completeChallenge', challengeId: first, completedOn: date })
  await store.dispatch({ type: 'completeChallenge', challengeId: first, completedOn: date })
  await store.dispatch({ type: 'completeChallenge', challengeId: second, completedOn: date })
  assert.deepEqual(Object.keys(store.getSnapshot().data.completedChallenges).sort(), [first, second].sort())
  assert.equal(store.getSnapshot().distinctCompletedCount, 2)
  assert.equal(store.getSnapshot().data.inProgressChallenges[first], undefined)
  store.dispose()
})

test('completion during slow hydration is retained, a failed write stays pending, then retry survives reload', async () => {
  const backing = new Map<string, string>()
  const loadGate = deferred<string | null>()
  let failNextWrite = true
  const driver = {
    getItem: () => loadGate.promise,
    setItem: async (key: string, value: string) => {
      if (failNextWrite) {
        failNextWrite = false
        throw new Error('simulated interrupted write')
      }
      backing.set(key, value)
    },
    removeItem: async (key: string) => { backing.delete(key) },
  }
  const store = createReaderParticipationStore(createEnvelopePersistenceAdapter({ storageKey: 'lifecycle', driver }))
  const completion = store.dispatch({ type: 'completeChallenge', challengeId: first, completedOn: date })

  assert.equal(store.getSnapshot().status, 'hydrating')
  loadGate.resolve(null)
  await completion
  assert.equal(store.getSnapshot().data.completedChallenges[first]?.completedOn, date)
  assert.equal(store.getSnapshot().health, 'writeFailed')
  assert.equal(store.getSnapshot().hasPendingWrites, true)

  await store.flushPending()
  assert.equal(store.getSnapshot().health, 'ok')
  assert.equal(store.getSnapshot().hasPendingWrites, false)
  store.dispose()

  const reloaded = createReaderParticipationStore(createEnvelopePersistenceAdapter({
    storageKey: 'lifecycle',
    driver: { ...driver, getItem: async key => backing.get(key) ?? null },
  }))
  await reloaded.whenReady()
  assert.equal(reloaded.getSnapshot().data.completedChallenges[first]?.completedOn, date)
  reloaded.dispose()
})

test('Hub, Month, Shelf, and Library origins remain distinct and round-trip', () => {
  const origins = [
    { kind: 'hub' },
    { kind: 'month', yearMonth: '2026-11' },
    { kind: 'shelf', yearMonth: '2025-12' },
    { kind: 'library', yearMonth: '2024-06' },
  ] as const

  for (const origin of origins) {
    const query = serializeChallengeOriginToSearchParams(origin)
    assert.deepEqual(parseChallengeOriginFromSearchParams(new URLSearchParams(query)), origin)
  }
  assert.deepEqual(parseChallengeOrigin({ kind: 'month', yearMonth: 'drafts.2026' }), { kind: 'hub' })
})
