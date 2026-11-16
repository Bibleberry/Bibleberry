import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PublicationYearMonth } from '../../src/participation/types.ts'
import {
  createEmptyShelfState,
  putAwayShelfMonth,
  selectShelfMonth,
  setActiveFocusMonth,
  setShelfMonthProtection,
} from '../../src/shelf/policy.ts'
import type { ShelfState } from '../../src/shelf/types.ts'
import {
  filterHistoricalCandidateMonths,
  formatPublicationMonthHeading,
  projectShelfViewModel,
  validateOpenShelfMonthTarget,
  type ShelfMonthMetadata,
} from '../../src/components/shelf/shelfModel.ts'

const CURRENT_MONTH = '2026-11' as PublicationYearMonth

test('formatPublicationMonthHeading formats valid YYYY-MM strings and falls back safely', () => {
  assert.equal(formatPublicationMonthHeading('2026-10'), 'October 2026')
  assert.equal(formatPublicationMonthHeading('2026-01'), 'January 2026')
  assert.equal(formatPublicationMonthHeading('2025-12'), 'December 2025')
  assert.equal(formatPublicationMonthHeading('invalid'), 'invalid')
})

test('projectShelfViewModel renders 0, 1, 2, and 3 historical months without padding empty slots', () => {
  const empty = projectShelfViewModel(createEmptyShelfState(), CURRENT_MONTH)
  assert.equal(empty.entries.length, 0)
  assert.equal(empty.slotCount, 0)
  assert.equal(empty.maxCapacity, 3)
  assert.equal(empty.isFull, false)

  const oneMonth: ShelfState = {
    months: [
      {
        yearMonth: '2026-10' as PublicationYearMonth,
        admissionKind: 'readerSelected',
        isProtected: true,
      },
    ],
    activeFocusMonth: null,
  }
  const vm1 = projectShelfViewModel(oneMonth, CURRENT_MONTH)
  assert.equal(vm1.entries.length, 1)
  assert.equal(vm1.isFull, false)
  assert.equal(vm1.entries[0]?.monthHeading, 'October 2026')
  assert.equal(vm1.entries[0]?.title, null)
  assert.equal(vm1.entries[0]?.statusLabel, 'Saved to Shelf · Protected')

  const threeMonths: ShelfState = {
    months: [
      {
        yearMonth: '2026-10' as PublicationYearMonth,
        admissionKind: 'readerSelected',
        isProtected: true,
      },
      {
        yearMonth: '2026-09' as PublicationYearMonth,
        admissionKind: 'autoAdmitted',
        isProtected: false,
      },
      {
        yearMonth: '2026-08' as PublicationYearMonth,
        admissionKind: 'autoAdmitted',
        isProtected: true,
      },
    ],
    activeFocusMonth: '2026-09' as PublicationYearMonth,
  }
  const metadata: Record<string, ShelfMonthMetadata> = {
    '2026-10': { yearMonth: '2026-10', title: 'Walk in Gratitude' },
    '2026-09': { yearMonth: '2026-09', title: 'Steadfast Hope' },
  }

  const vm3 = projectShelfViewModel(threeMonths, CURRENT_MONTH, metadata)
  assert.equal(vm3.entries.length, 3)
  assert.equal(vm3.isFull, true)
  assert.equal(vm3.entries[0]?.title, 'Walk in Gratitude')
  assert.equal(vm3.entries[1]?.statusLabel, 'Added at rollover')
  assert.equal(vm3.entries[1]?.isProtected, false)
  assert.equal(vm3.entries[1]?.isActiveFocus, true)
  assert.equal(vm3.entries[2]?.statusLabel, 'Added at rollover · Protected')
  assert.equal(vm3.entries[2]?.title, null)
  assert.equal(vm3.activeFocusOutsideShelf, false)
})

test('projectShelfViewModel strictly excludes current and future months and detects outside focus', () => {
  const taintedState: ShelfState = {
    months: [
      {
        yearMonth: '2026-11' as PublicationYearMonth,
        admissionKind: 'readerSelected',
        isProtected: true,
      },
      {
        yearMonth: '2026-12' as PublicationYearMonth,
        admissionKind: 'autoAdmitted',
        isProtected: false,
      },
      {
        yearMonth: '2026-10' as PublicationYearMonth,
        admissionKind: 'readerSelected',
        isProtected: true,
      },
    ],
    activeFocusMonth: '2026-06' as PublicationYearMonth,
  }

  const vm = projectShelfViewModel(taintedState, CURRENT_MONTH)
  assert.deepEqual(
    vm.entries.map(e => e.yearMonth),
    ['2026-10'],
  )
  assert.equal(vm.activeFocusOutsideShelf, true)
  assert.equal(vm.activeFocusHeading, 'June 2026')
})

test('validateOpenShelfMonthTarget accepts only historical months currently on the Shelf', () => {
  const state: ShelfState = {
    months: [
      {
        yearMonth: '2026-10' as PublicationYearMonth,
        admissionKind: 'readerSelected',
        isProtected: true,
      },
    ],
    activeFocusMonth: null,
  }

  const valid = validateOpenShelfMonthTarget('2026-10', state, CURRENT_MONTH)
  assert.equal(valid.ok, true)

  const notOnShelf = validateOpenShelfMonthTarget('2026-09', state, CURRENT_MONTH)
  assert.equal(notOnShelf.ok, false)

  const currentMonth = validateOpenShelfMonthTarget('2026-11', state, CURRENT_MONTH)
  assert.equal(currentMonth.ok, false)

  const futureMonth = validateOpenShelfMonthTarget('2026-12', state, CURRENT_MONTH)
  assert.equal(futureMonth.ok, false)

  const malformed = validateOpenShelfMonthTarget('../2026-10', state, CURRENT_MONTH)
  assert.equal(malformed.ok, false)
})

test('filterHistoricalCandidateMonths excludes current, future, invalid, and duplicate months', () => {
  const state: ShelfState = {
    months: [
      {
        yearMonth: '2026-10' as PublicationYearMonth,
        admissionKind: 'readerSelected',
        isProtected: true,
      },
    ],
    activeFocusMonth: null,
  }

  const candidates: ShelfMonthMetadata[] = [
    { yearMonth: '2026-12', title: 'Future' },
    { yearMonth: '2026-11', title: 'Current' },
    { yearMonth: '2026-10', title: 'Walk in Gratitude' },
    { yearMonth: '2026-10', title: 'Duplicate' },
    { yearMonth: '2026-09', title: 'Steadfast Hope' },
    { yearMonth: 'bad-month', title: 'Invalid' },
  ]

  const filtered = filterHistoricalCandidateMonths(candidates, state, CURRENT_MONTH)
  assert.deepEqual(
    filtered.map(c => ({ ym: c.yearMonth, onShelf: c.alreadyOnShelf })),
    [
      { ym: '2026-10', onShelf: true },
      { ym: '2026-09', onShelf: false },
    ],
  )
})

test('policy engine integration: select, protect, put away, and focus work together without silent eviction', () => {
  let state = createEmptyShelfState()

  // Reject current month selection
  const currentRes = selectShelfMonth(state, {
    yearMonth: '2026-11',
    referenceCurrentYearMonth: CURRENT_MONTH,
  })
  assert.equal(currentRes.ok, false)
  if (!currentRes.ok) {
    assert.equal(currentRes.error, 'monthNotHistorical')
  }

  // Fill 3 slots (2 readerSelected + 1 autoAdmitted simulated)
  state = {
    months: [
      {
        yearMonth: '2026-10' as PublicationYearMonth,
        admissionKind: 'readerSelected',
        isProtected: true,
      },
      {
        yearMonth: '2026-09' as PublicationYearMonth,
        admissionKind: 'autoAdmitted',
        isProtected: false,
      },
      {
        yearMonth: '2026-08' as PublicationYearMonth,
        admissionKind: 'readerSelected',
        isProtected: true,
      },
    ],
    activeFocusMonth: '2026-09' as PublicationYearMonth,
  }

  // Protect the auto-admitted month
  const protectRes = setShelfMonthProtection(state, {
    yearMonth: '2026-09',
    isProtected: true,
  })
  assert.equal(protectRes.ok, true)
  state = protectRes.state

  // Adding a 4th month without replaceMonth fails with shelfCapacityExceeded
  const overflowRes = selectShelfMonth(state, {
    yearMonth: '2026-07',
    referenceCurrentYearMonth: CURRENT_MONTH,
  })
  assert.equal(overflowRes.ok, false)
  if (!overflowRes.ok) {
    assert.equal(overflowRes.error, 'shelfCapacityExceeded')
  }

  // Explicit replacement succeeds
  const replaceRes = selectShelfMonth(state, {
    yearMonth: '2026-07',
    referenceCurrentYearMonth: CURRENT_MONTH,
    replaceMonth: '2026-08',
  })
  assert.equal(replaceRes.ok, true)
  state = replaceRes.state
  assert.deepEqual(
    state.months.map(m => m.yearMonth),
    ['2026-10', '2026-09', '2026-07'],
  )

  // Put away preserves activeFocusMonth independently
  const putAwayRes = putAwayShelfMonth(state, { yearMonth: '2026-09' })
  assert.equal(putAwayRes.ok, true)
  state = putAwayRes.state
  assert.equal(state.months.length, 2)
  assert.equal(state.activeFocusMonth, '2026-09')

  // Focus can be updated explicitly
  const focusRes = setActiveFocusMonth(state, { yearMonth: '2026-10' })
  assert.equal(focusRes.ok, true)
  assert.equal(focusRes.state.activeFocusMonth, '2026-10')
})
