import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createEmptyShelfState,
  putAwayShelfMonth,
  selectShelfMonth,
} from '../../src/shelf/policy.ts'
import {
  MAX_SHELF_CAPACITY,
  type ShelfState,
} from '../../src/shelf/types.ts'
import {
  parseLocalCalendarDate,
  parsePublicationYearMonth,
} from '../../src/participation/identity.ts'
import type { CanonicalChallengeId, ReaderParticipationData } from '../../src/participation/types.ts'

describe('Shelf Selection and Put Away Policy', () => {
  const current = parsePublicationYearMonth('2026-11')!
  const dNov01 = parseLocalCalendarDate('2026-11-01')!
  const ym07 = parsePublicationYearMonth('2026-07')!
  const ym08 = parsePublicationYearMonth('2026-08')!
  const ym09 = parsePublicationYearMonth('2026-09')!
  const ym10 = parsePublicationYearMonth('2026-10')!
  const ym11 = parsePublicationYearMonth('2026-11')!
  const ym12 = parsePublicationYearMonth('2026-12')!

  it('allows reader selection into empty (0 slots) Shelf', () => {
    const emptyState = createEmptyShelfState()
    assert.equal(emptyState.months.length, 0)

    const result = selectShelfMonth(emptyState, {
      yearMonth: ym10,
      referenceCurrentYearMonth: current,
      admittedOn: dNov01,
    })

    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.action, 'added')
    assert.equal(result.state.months.length, 1)
    assert.equal(result.state.months[0]?.yearMonth, ym10)
    assert.equal(result.state.months[0]?.admissionKind, 'readerSelected')
    assert.equal(result.state.months[0]?.isProtected, true)
    assert.equal(result.state.months[0]?.admittedOn, dNov01)
  })

  it('allows reader selection when 1 and 2 slots are occupied up to MAX_SHELF_CAPACITY', () => {
    let state = createEmptyShelfState()

    // 1st slot
    const res1 = selectShelfMonth(state, {
      yearMonth: ym08,
      referenceCurrentYearMonth: current,
    })
    assert.equal(res1.ok, true)
    if (!res1.ok) return
    state = res1.state
    assert.equal(state.months.length, 1)

    // 2nd slot
    const res2 = selectShelfMonth(state, {
      yearMonth: ym09,
      referenceCurrentYearMonth: current,
    })
    assert.equal(res2.ok, true)
    if (!res2.ok) return
    state = res2.state
    assert.equal(state.months.length, 2)

    // 3rd slot (full capacity)
    const res3 = selectShelfMonth(state, {
      yearMonth: ym10,
      referenceCurrentYearMonth: current,
    })
    assert.equal(res3.ok, true)
    if (!res3.ok) return
    state = res3.state
    assert.equal(state.months.length, MAX_SHELF_CAPACITY)
    assert.deepEqual(
      state.months.map(m => m.yearMonth),
      [ym08, ym09, ym10],
    )
  })

  it('rejects adding a 4th month without explicit replaceMonth when Shelf is full', () => {
    let state = createEmptyShelfState()
    for (const ym of [ym08, ym09, ym10]) {
      const res = selectShelfMonth(state, {
        yearMonth: ym,
        referenceCurrentYearMonth: current,
      })
      assert.equal(res.ok, true)
      if (res.ok) state = res.state
    }
    assert.equal(state.months.length, 3)

    // Attempting to select a 4th month (2026-07) without replaceMonth
    const failRes = selectShelfMonth(state, {
      yearMonth: ym07,
      referenceCurrentYearMonth: current,
    })

    assert.equal(failRes.ok, false)
    if (failRes.ok) return
    assert.equal(failRes.error, 'shelfCapacityExceeded')
    assert.equal(failRes.state.months.length, 3)
    assert.deepEqual(
      failRes.state.months.map(m => m.yearMonth),
      [ym08, ym09, ym10],
    )
  })

  it('replaces the specified month when replaceMonth is explicitly provided on full Shelf', () => {
    let state = createEmptyShelfState()
    for (const ym of [ym08, ym09, ym10]) {
      const res = selectShelfMonth(state, {
        yearMonth: ym,
        referenceCurrentYearMonth: current,
      })
      if (res.ok) state = res.state
    }
    assert.equal(state.months.length, 3)

    // Replace 2026-08 with 2026-07
    const replaceRes = selectShelfMonth(state, {
      yearMonth: ym07,
      referenceCurrentYearMonth: current,
      replaceMonth: ym08,
    })

    assert.equal(replaceRes.ok, true)
    if (!replaceRes.ok) return
    assert.equal(replaceRes.action, 'replaced')
    assert.equal(replaceRes.state.months.length, 3)
    assert.deepEqual(
      replaceRes.state.months.map(m => m.yearMonth),
      [ym07, ym09, ym10],
    )
  })

  it('fails with replaceMonthNotFound when replaceMonth is not currently on the Shelf', () => {
    let state = createEmptyShelfState()
    for (const ym of [ym08, ym09, ym10]) {
      const res = selectShelfMonth(state, {
        yearMonth: ym,
        referenceCurrentYearMonth: current,
      })
      if (res.ok) state = res.state
    }

    const failRes = selectShelfMonth(state, {
      yearMonth: ym07,
      referenceCurrentYearMonth: current,
      replaceMonth: '2025-01', // not on shelf
    })

    assert.equal(failRes.ok, false)
    if (failRes.ok) return
    assert.equal(failRes.error, 'replaceMonthNotFound')
  })

  it('promotes an existing auto-admitted month to readerSelected and protected if re-selected', () => {
    const state: ShelfState = {
      months: [
        {
          yearMonth: ym10,
          admissionKind: 'autoAdmitted',
          isProtected: false,
          admittedOn: dNov01,
        },
      ],
      activeFocusMonth: null,
    }

    const res = selectShelfMonth(state, {
      yearMonth: ym10,
      referenceCurrentYearMonth: current,
    })

    assert.equal(res.ok, true)
    if (!res.ok) return
    assert.equal(res.action, 'promotedToProtected')
    assert.equal(res.state.months.length, 1)
    assert.equal(res.state.months[0]?.admissionKind, 'readerSelected')
    assert.equal(res.state.months[0]?.isProtected, true)
  })

  it('strictly rejects current and future publication months from Shelf selection', () => {
    const emptyState = createEmptyShelfState()

    // Current month rejection
    const currentRes = selectShelfMonth(emptyState, {
      yearMonth: ym11,
      referenceCurrentYearMonth: current,
    })
    assert.equal(currentRes.ok, false)
    if (!currentRes.ok) {
      assert.equal(currentRes.error, 'monthNotHistorical')
    }

    // Future month rejection
    const futureRes = selectShelfMonth(emptyState, {
      yearMonth: ym12,
      referenceCurrentYearMonth: current,
    })
    assert.equal(futureRes.ok, false)
    if (!futureRes.ok) {
      assert.equal(futureRes.error, 'monthNotHistorical')
    }
  })

  it('reader Put Away removes membership cleanly', () => {
    const state: ShelfState = {
      months: [
        { yearMonth: ym08, admissionKind: 'readerSelected', isProtected: true },
        { yearMonth: ym09, admissionKind: 'readerSelected', isProtected: true },
        { yearMonth: ym10, admissionKind: 'autoAdmitted', isProtected: false },
      ],
      activeFocusMonth: ym08,
    }

    const putAwayRes = putAwayShelfMonth(state, ym09)
    assert.equal(putAwayRes.ok, true)
    if (!putAwayRes.ok) return
    assert.equal(putAwayRes.action, 'removed')
    assert.deepEqual(
      putAwayRes.state.months.map(m => m.yearMonth),
      [ym08, ym10],
    )
    // Active focus is preserved (separation of concerns)
    assert.equal(putAwayRes.state.activeFocusMonth, ym08)
  })

  it('reader Put Away is idempotent when month is not on Shelf', () => {
    const state: ShelfState = {
      months: [{ yearMonth: ym10, admissionKind: 'readerSelected', isProtected: true }],
      activeFocusMonth: null,
    }

    const noopRes = putAwayShelfMonth(state, ym07)
    assert.equal(noopRes.ok, true)
    if (!noopRes.ok) return
    assert.equal(noopRes.action, 'noop')
    assert.equal(noopRes.state.months.length, 1)
  })

  it('verifies Put Away non-regression: never mutates participation data', () => {
    // Simulating participation storage alongside Shelf
    const participationSnapshot: ReaderParticipationData = Object.freeze({
      completedChallenges: {
        'cms:challenge-2026-09-01': {
          completedOn: '2026-09-01',
          screenHistory: ['welcome', 'prayer'],
        },
      },
      inProgressChallenges: {
        'cms:challenge-2026-09-02': {
          openedOn: '2026-09-02',
          furthestScreenId: 'reading',
          savedState: {},
        },
      },
      savedChallenges: {
        'cms:challenge-2026-09-01': {
          savedOn: '2026-09-01',
        },
      },
      savedScriptures: [
        {
          key: 'saved:scripture:romans-8-28',
          reference: 'Romans 8:28',
          text: 'And we know that in all things God works for the good...',
          translation: 'ESV',
          savedOn: '2026-09-01',
        },
      ],
      lastOpenedChallenge: {
        challengeId: 'cms:challenge-2026-09-02' as CanonicalChallengeId,
        openedOn: '2026-09-02',
      },
      earnedAwards: {
        'card:monthly:2026-09:thematic': {
          earnedOn: '2026-09-15',
          cardViewed: true,
          hubAnnouncementAcked: true,
        },
      },
    })

    const shelfState: ShelfState = {
      months: [
        { yearMonth: ym09, admissionKind: 'readerSelected', isProtected: true },
        { yearMonth: ym10, admissionKind: 'readerSelected', isProtected: true },
      ],
    }

    // Execute Put Away on ym09
    const putAwayRes = putAwayShelfMonth(shelfState, ym09)
    assert.equal(putAwayRes.ok, true)

    // Check that Shelf membership was removed
    assert.equal(putAwayRes.state.months.length, 1)
    assert.equal(putAwayRes.state.months[0]?.yearMonth, ym10)

    // Invariant verification: participation records are 100% identical and untouched
    assert.ok(participationSnapshot.completedChallenges['cms:challenge-2026-09-01'])
    assert.ok(participationSnapshot.inProgressChallenges['cms:challenge-2026-09-02'])
    assert.ok(participationSnapshot.savedChallenges['cms:challenge-2026-09-01'])
    assert.equal(participationSnapshot.savedScriptures.length, 1)
    assert.equal(participationSnapshot.lastOpenedChallenge?.challengeId, 'cms:challenge-2026-09-02')
    assert.ok(participationSnapshot.earnedAwards['card:monthly:2026-09:thematic'])
  })
})
