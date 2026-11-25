import assert from 'node:assert/strict'
import test from 'node:test'
import type { ChallengeDetailResult } from '../../src/cms/reader/challengeDetailProvider.ts'
import type { MonthDetailResult } from '../../src/cms/reader/monthProvider.ts'
import { emptyReaderParticipationData, replayParticipationCommands } from '../../src/participation/model.ts'
import { parseParticipationEnvelope, serializeParticipationEnvelope } from '../../src/participation/persistence.ts'
import type { CanonicalChallengeId, LocalCalendarDate, PublicationYearMonth } from '../../src/participation/types.ts'
import { confirmsPriorMonthPosition, selectPriorMonthCandidates } from '../../src/readerShell/today/priorMonthContinue.ts'
import { createPriorMonthVisitStore } from '../../src/readerShell/today/priorMonthVisitStore.ts'

const january = '2027-01' as PublicationYearMonth
const context = {
  yearMonth: january,
  authorizedLocalDate: '2027-01-01' as LocalCalendarDate,
  effectiveTimeZone: 'America/New_York',
}
const position = (id: string, screenId?: string) => ({
  type: 'saveChallengeProgress' as const,
  challengeId: `cms:${id}` as CanonicalChallengeId,
  updatedOn: '2026-12-22' as LocalCalendarDate,
  screenId,
  trackInterruption: true,
})
const slot = (dayOfMonth: number, id: string, availability = 'available') => ({
  dayOfMonth, date: `2026-12-${dayOfMonth}`, availability,
  challengeId: id, title: id, slug: id, challengeType: 'teaching',
})
const roster = {
  status: 'ready', source: 'gateway', serverContext: context,
  month: {
    monthId: '2026-12', phase: 'historical', title: 'December',
    slots: [slot(20, 'recent'), slot(21, 'older'), slot(22, 'missing-screen'), slot(23, 'withdrawn', 'unavailable')],
  },
} as unknown as Extract<MonthDetailResult, { status: 'ready' }>

test('uses the adjacent gateway month and durable interruption order after migration and replay', () => {
  const legacy = parseParticipationEnvelope(JSON.stringify({
    schemaVersion: 1,
    data: { inProgressChallenges: { 'cms:older': { updatedOn: '2026-12-22', screenId: 'two' } } },
  })).data
  const commands = [position('older', 'two'), position('recent', 'three'),
    position('missing-screen'), position('withdrawn', 'two')]
  const durable = parseParticipationEnvelope(serializeParticipationEnvelope(
    replayParticipationCommands(legacy, commands),
  )).data

  const select = (result: MonthDetailResult) => selectPriorMonthCandidates(context, result, durable)
  assert.deepEqual(select(roster).map(item => item.challengeId), ['cms:recent', 'cms:older'])
  assert.equal(select(roster)[0].formalFocusMonth, null)
  assert.deepEqual(select({ ...roster, month: { ...roster.month, monthId: '2026-11' } }), [])
  assert.deepEqual(select({ ...roster, serverContext: { ...context, authorizedLocalDate: '2026-12-31' } }), [])
  assert.deepEqual(select({ ...roster, serverContext: { ...context, effectiveTimeZone: 'UTC' } }), [])
  assert.deepEqual(selectPriorMonthCandidates(context, roster, emptyReaderParticipationData()), [])
})

test('requires gateway detail for the exact identity, publication slot and saved screen', () => {
  const data = replayParticipationCommands(emptyReaderParticipationData(), [position('recent', 'two')])
  const [candidate] = selectPriorMonthCandidates(context, roster, data)
  const detail = {
    status: 'ready', source: 'gateway',
    challenge: {
      documentId: 'recent', id: 'recent',
      calendarSlot: { monthId: '2026-12', publicationDate: '2026-12-20' },
      screens: [{ id: 'one' }, { id: 'two' }],
    },
  } as unknown as Extract<ChallengeDetailResult, { status: 'ready' }>

  assert.equal(confirmsPriorMonthPosition(candidate, detail), true)
  assert.equal(confirmsPriorMonthPosition(candidate, { ...detail, source: 'catalog' }), false)
  assert.equal(confirmsPriorMonthPosition(candidate, { status: 'notFound', source: 'gateway' }), false)
  assert.equal(confirmsPriorMonthPosition(candidate, { ...detail, challenge: { ...detail.challenge, documentId: 'older' } }), false)
  assert.equal(confirmsPriorMonthPosition({ ...candidate, resumeScreenId: 'removed' }, detail), false)
})

test('settles one authorized visit across duplicate attempts, reload and month advance', async () => {
  let state: string | null = null
  const driver = {
    getItem: async () => state,
    setItem: async (_key: string, value: string) => { state = value },
    removeItem: async () => { state = null },
  }
  const store = createPriorMonthVisitStore(driver)
  assert.equal(await store.isOpen(january), true)
  assert.equal(await store.settle(january, 'presented', () => false), false)
  assert.deepEqual(await Promise.all([
    store.settle(january, 'presented', () => true),
    store.settle(january, 'presented', () => true),
    store.settle(january, 'closed', () => true),
  ]), [true, false, false])
  assert.equal(JSON.parse(state!).disposition, 'presented')
  const reloaded = createPriorMonthVisitStore(driver)
  assert.equal(await reloaded.isOpen(january), false)
  assert.equal(await reloaded.isOpen('2026-12' as PublicationYearMonth), false)
  assert.equal(await reloaded.isOpen('2027-02' as PublicationYearMonth), true)
  state = '{"version":2}'
  await assert.rejects(reloaded.settle(january, 'closed', () => true))
  assert.equal(state, '{"version":2}')
})

test('an abandoned visit restores its previous marker when a native write resolves late', async () => {
  let state: string | null = null
  let onWriteStarted!: () => void
  let finishWrite!: () => void
  const started = new Promise<void>(resolve => { onWriteStarted = resolve })
  const pending = new Promise<void>(resolve => { finishWrite = resolve })
  let onToday = true

  const store = createPriorMonthVisitStore({
    getItem: async () => state,
    setItem: async (_key, value) => {
      onWriteStarted()
      await pending
      state = value
    },
    removeItem: async () => { state = null },
  })
  const attempt = store.settle(january, 'presented', () => onToday)
  await started
  onToday = false
  finishWrite()
  assert.equal(await attempt, false)
  assert.equal(await store.isOpen(january), true)
})
