import assert from 'node:assert/strict'
import test from 'node:test'
import type { MonthDetailResult } from '../../src/cms/reader/monthProvider.ts'
import { parseLocalCalendarDate, parsePublicationYearMonth } from '../../src/participation/identity.ts'
import { emptyReaderParticipationData } from '../../src/participation/model.ts'
import { loadTodayShelfRollover } from '../../src/readerShell/today/todayShelfRollover.ts'
import { buildMonthPayload, serverContext } from './fixtures/m1aGatewayFixtures.ts'

function context(date: string) {
  return {
    authorizedLocalDate: parseLocalCalendarDate(date)!,
    yearMonth: parsePublicationYearMonth(date.slice(0, 7))!,
    effectiveTimeZone: serverContext.effectiveTimeZone,
  }
}

function historicalMonth(endingMonth: string, daysInMonth: number, date: string): MonthDetailResult {
  const payload = buildMonthPayload({
    yearMonth: endingMonth,
    year: Number(endingMonth.slice(0, 4)),
    month: Number(endingMonth.slice(5)),
    daysInMonth,
    phase: 'historical',
    title: 'Ended month',
    context: { ...serverContext, authorizedLocalDate: date },
  })
  return { ...payload, status: 'ready', source: 'gateway' } as MonthDetailResult
}

for (const { authorizedDate, endingMonth, daysInMonth } of [
  { authorizedDate: '2027-03-01', endingMonth: '2027-02', daysInMonth: 28 },
  { authorizedDate: '2028-03-01', endingMonth: '2028-02', daysInMonth: 29 },
  { authorizedDate: '2028-05-01', endingMonth: '2028-04', daysInMonth: 30 },
  { authorizedDate: '2028-06-01', endingMonth: '2028-05', daysInMonth: 31 },
  { authorizedDate: '2029-01-01', endingMonth: '2028-12', daysInMonth: 31 },
]) {
  test(`gateway ${authorizedDate} evaluates only ${endingMonth} (${daysInMonth} days)`, async () => {
    const id = `cms:${endingMonth}-challenge-${daysInMonth}`
    const completedOn = parseLocalCalendarDate(authorizedDate)!
    const signal = new AbortController().signal
    const params = await loadTodayShelfRollover(context(authorizedDate), {
      ...emptyReaderParticipationData(),
      completedChallenges: {
        [id]: { completedOn },
        'cms:unrelated-challenge': { completedOn },
      },
    }, {
      async loadMonth(requested, options) {
        assert.equal(requested, endingMonth)
        assert.equal(options?.timeZone, serverContext.effectiveTimeZone)
        assert.equal(options?.signal, signal)
        return historicalMonth(endingMonth, daysInMonth, authorizedDate)
      },
    }, signal)
    assert.deepEqual(params, {
      newCurrentYearMonth: authorizedDate.slice(0, 7),
      endingYearMonth: endingMonth,
      rolloverDate: authorizedDate,
      completedChallengeIdsInEndingMonth: new Set([id]),
    })
  })
}

test('empty completion records need no roster lookup, including interrupted Challenges', async () => {
  const authorizedDate = '2027-01-01'
  const params = await loadTodayShelfRollover(context(authorizedDate), {
    ...emptyReaderParticipationData(),
    inProgressChallenges: {
      'cms:interrupted-december': { updatedOn: parseLocalCalendarDate('2026-12-31')!, screenId: 's2' },
    },
  }, {
    async loadMonth() {
      assert.fail('No roster lookup is needed without a durable completion')
    },
  }, new AbortController().signal)
  assert.deepEqual(params?.completedChallengeIdsInEndingMonth, new Set())
})

test('missing, mismatched, and stale roster responses leave the transition eligible for retry', async () => {
  const authorizedDate = '2027-01-01'
  const completedOn = parseLocalCalendarDate('2026-12-31')!
  const participation = {
    ...emptyReaderParticipationData(),
    completedChallenges: { 'cms:2026-12-challenge-31': { completedOn } },
  }
  const responses: MonthDetailResult[] = [
    { source: 'gateway', status: 'notFound' },
    historicalMonth('2026-11', 30, authorizedDate),
    historicalMonth('2026-12', 31, '2026-12-31'),
  ]
  for (const response of responses) {
    assert.equal(
      await loadTodayShelfRollover(context(authorizedDate), participation, {
        async loadMonth() { return response },
      }, new AbortController().signal),
      null,
    )
  }
})
