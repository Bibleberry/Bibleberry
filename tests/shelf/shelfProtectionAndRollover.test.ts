import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyMonthlyRollover,
  createEmptyShelfState,
  findOldestAutoAdmittedMonth,
  setShelfMonthProtection,
} from '../../src/shelf/policy.ts'
import {
  MAX_SHELF_CAPACITY,
  type ShelfState,
} from '../../src/shelf/types.ts'
import {
  parseLocalCalendarDate,
  parsePublicationYearMonth,
} from '../../src/participation/identity.ts'

describe('Shelf Protection and Monthly Rollover Policy', () => {
  const ym07 = parsePublicationYearMonth('2026-07')!
  const ym08 = parsePublicationYearMonth('2026-08')!
  const ym09 = parsePublicationYearMonth('2026-09')!
  const ym10 = parsePublicationYearMonth('2026-10')!
  const ym11 = parsePublicationYearMonth('2026-11')!
  const ym12 = parsePublicationYearMonth('2026-12')!
  const ymJan27 = parsePublicationYearMonth('2027-01')!

  const dAug01 = parseLocalCalendarDate('2026-08-01')!
  const dSep01 = parseLocalCalendarDate('2026-09-01')!
  const dOct01 = parseLocalCalendarDate('2026-10-01')!
  const dNov01 = parseLocalCalendarDate('2026-11-01')!
  const dJan01 = parseLocalCalendarDate('2027-01-01')!

  it('retains month in Library if reader had zero completed Challenges in the ending month', () => {
    const emptyState = createEmptyShelfState()

    const result = applyMonthlyRollover(emptyState, {
      newCurrentYearMonth: ym11,
      endingYearMonth: ym10,
      completedChallengeIdsInEndingMonth: [], // zero completions
      rolloverDate: dNov01,
    })

    assert.equal(result.ok, true)
    assert.equal(result.disposition, 'retainedInLibraryNoCompletions')
    assert.equal(result.state.months.length, 0)
    assert.equal(result.admittedEntry, null)
    assert.equal(result.evictedEntry, null)
  })

  it('automatically admits just-ended month with >= 1 completion into an open slot', () => {
    const emptyState = createEmptyShelfState()

    const result = applyMonthlyRollover(emptyState, {
      newCurrentYearMonth: ym11,
      endingYearMonth: ym10,
      completedChallengeIdsInEndingMonth: ['cms:challenge-2026-10-01'],
      rolloverDate: dNov01,
    })

    assert.equal(result.ok, true)
    assert.equal(result.disposition, 'admittedToOpenSlot')
    assert.equal(result.state.months.length, 1)
    assert.equal(result.state.months[0]?.yearMonth, ym10)
    assert.equal(result.state.months[0]?.admissionKind, 'autoAdmitted')
    assert.equal(result.state.months[0]?.isProtected, false)
    assert.equal(result.state.months[0]?.admittedOn, dNov01)
  })

  it('determines the oldest auto-admitted month accurately', () => {
    const months = [
      { yearMonth: ym08, admissionKind: 'autoAdmitted' as const, isProtected: false, admittedOn: dSep01 },
      { yearMonth: ym07, admissionKind: 'autoAdmitted' as const, isProtected: false, admittedOn: dAug01 },
      { yearMonth: ym09, admissionKind: 'readerSelected' as const, isProtected: true, admittedOn: dOct01 },
    ]

    const oldest = findOldestAutoAdmittedMonth(months)
    // 2026-07 admitted on 2026-08-01 is older than 2026-08 admitted on 2026-09-01
    assert.equal(oldest?.yearMonth, ym07)
  })

  it('replaces the oldest automatically admitted month when Shelf is full', () => {
    const fullState: ShelfState = {
      months: [
        { yearMonth: ym07, admissionKind: 'autoAdmitted', isProtected: false, admittedOn: dAug01 },
        { yearMonth: ym08, admissionKind: 'autoAdmitted', isProtected: false, admittedOn: dSep01 },
        { yearMonth: ym09, admissionKind: 'autoAdmitted', isProtected: false, admittedOn: dOct01 },
      ],
      activeFocusMonth: null,
    }

    const result = applyMonthlyRollover(fullState, {
      newCurrentYearMonth: ym11,
      endingYearMonth: ym10,
      completedChallengeIdsInEndingMonth: ['cms:challenge-2026-10-15'],
      rolloverDate: dNov01,
    })

    assert.equal(result.ok, true)
    assert.equal(result.disposition, 'replacedOldestAutoAdmitted')
    assert.equal(result.evictedEntry?.yearMonth, ym07)
    assert.equal(result.admittedEntry?.yearMonth, ym10)
    assert.equal(result.state.months.length, MAX_SHELF_CAPACITY)
    assert.deepEqual(
      result.state.months.map(m => m.yearMonth),
      [ym10, ym08, ym09],
    )
  })

  it('supports "protect then rollover": protected auto-admitted month survives rollover', () => {
    let state: ShelfState = {
      months: [
        { yearMonth: ym07, admissionKind: 'autoAdmitted', isProtected: false, admittedOn: dAug01 },
        { yearMonth: ym08, admissionKind: 'autoAdmitted', isProtected: false, admittedOn: dSep01 },
        { yearMonth: ym09, admissionKind: 'readerSelected', isProtected: true, admittedOn: dOct01 },
      ],
      activeFocusMonth: null,
    }

    // Reader explicitly protects the oldest month (ym07)
    const protectRes = setShelfMonthProtection(state, {
      yearMonth: ym07,
      isProtected: true,
    })
    assert.equal(protectRes.ok, true)
    if (protectRes.ok) state = protectRes.state

    assert.equal(state.months.find(m => m.yearMonth === ym07)?.isProtected, true)

    // Rollover occurs: 2026-07 is protected, so 2026-08 (unprotected auto) must be evicted instead!
    const rolloverRes = applyMonthlyRollover(state, {
      newCurrentYearMonth: ym11,
      endingYearMonth: ym10,
      completedChallengeIdsInEndingMonth: ['cms:challenge-2026-10-20'],
      rolloverDate: dNov01,
    })

    assert.equal(rolloverRes.ok, true)
    assert.equal(rolloverRes.disposition, 'replacedOldestAutoAdmitted')
    assert.equal(rolloverRes.evictedEntry?.yearMonth, ym08)
    assert.equal(rolloverRes.admittedEntry?.yearMonth, ym10)
    assert.deepEqual(
      rolloverRes.state.months.map(m => m.yearMonth),
      [ym07, ym10, ym09],
    )
    // 2026-07 remained completely protected on the shelf
    assert.equal(rolloverRes.state.months.find(m => m.yearMonth === ym07)?.isProtected, true)
  })

  it('enforces "all-protected no-eviction": leaves month in Library when all 3 slots are protected', () => {
    const allProtectedState: ShelfState = {
      months: [
        { yearMonth: ym07, admissionKind: 'readerSelected', isProtected: true },
        { yearMonth: ym08, admissionKind: 'readerSelected', isProtected: true },
        { yearMonth: ym09, admissionKind: 'readerSelected', isProtected: true },
      ],
      activeFocusMonth: ym08,
    }

    const result = applyMonthlyRollover(allProtectedState, {
      newCurrentYearMonth: ym11,
      endingYearMonth: ym10,
      completedChallengeIdsInEndingMonth: ['cms:challenge-2026-10-01', 'cms:challenge-2026-10-02'],
      rolloverDate: dNov01,
    })

    assert.equal(result.ok, true)
    assert.equal(result.disposition, 'retainedInLibraryAllProtected')
    assert.equal(result.admittedEntry, null)
    assert.equal(result.evictedEntry, null)
    // Shelf slots remain 100% untouched
    assert.deepEqual(
      result.state.months.map(m => m.yearMonth),
      [ym07, ym08, ym09],
    )
  })

  it('handles December to January rollover seamlessly across calendar year boundary', () => {
    // Current is Jan 2027, ending month is Dec 2026
    const state: ShelfState = {
      months: [
        { yearMonth: ym09, admissionKind: 'autoAdmitted', isProtected: false, admittedOn: dOct01 },
        { yearMonth: ym10, admissionKind: 'autoAdmitted', isProtected: false, admittedOn: dNov01 },
      ],
      activeFocusMonth: null,
    }

    const result = applyMonthlyRollover(state, {
      newCurrentYearMonth: ymJan27,
      // endingYearMonth omitted: should default to previous month of 2027-01, which is 2026-12!
      completedChallengeIdsInEndingMonth: ['cms:challenge-2026-12-25-christmas'],
      rolloverDate: dJan01,
    })

    assert.equal(result.ok, true)
    assert.equal(result.endingYearMonth, ym12)
    assert.equal(result.disposition, 'admittedToOpenSlot')
    assert.equal(result.admittedEntry?.yearMonth, ym12)
    assert.equal(result.admittedEntry?.admittedOn, dJan01)
    assert.equal(result.state.months.length, 3)
    assert.deepEqual(
      result.state.months.map(m => m.yearMonth),
      [ym09, ym10, ym12],
    )
  })

  it('ensures repeated rollover is idempotent', () => {
    const initialState = createEmptyShelfState()

    const firstRun = applyMonthlyRollover(initialState, {
      newCurrentYearMonth: ym11,
      endingYearMonth: ym10,
      completedChallengeIdsInEndingMonth: ['cms:challenge-2026-10-01'],
      rolloverDate: dNov01,
    })
    assert.equal(firstRun.disposition, 'admittedToOpenSlot')
    assert.equal(firstRun.state.months.length, 1)

    // Second run with identical parameters
    const secondRun = applyMonthlyRollover(firstRun.state, {
      newCurrentYearMonth: ym11,
      endingYearMonth: ym10,
      completedChallengeIdsInEndingMonth: ['cms:challenge-2026-10-01'],
      rolloverDate: dNov01,
    })

    assert.equal(secondRun.ok, true)
    assert.equal(secondRun.disposition, 'alreadyOnShelf')
    assert.deepEqual(secondRun.state, firstRun.state)
  })

  it('rejects invalid or non-historical rollover parameters safely', () => {
    const state = createEmptyShelfState()

    // Invalid newCurrentYearMonth
    const invalidMonthRes = applyMonthlyRollover(state, {
      newCurrentYearMonth: 'invalid-month',
      completedChallengeIdsInEndingMonth: ['c1'],
    })
    assert.equal(invalidMonthRes.ok, false)
    assert.equal(invalidMonthRes.disposition, 'rejectedInvalidMonth')

    // Ending month is not historical relative to new current (e.g. same month or future)
    const notHistoricalRes = applyMonthlyRollover(state, {
      newCurrentYearMonth: ym11,
      endingYearMonth: ym11, // cannot end into itself
      completedChallengeIdsInEndingMonth: ['c1'],
    })
    assert.equal(notHistoricalRes.ok, false)
    assert.equal(notHistoricalRes.disposition, 'rejectedNotHistorical')
  })
})
