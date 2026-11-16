import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { LibraryMonthSummary } from '../../src/cms/reader/libraryMonthIndexProvider.ts'
import { getLibraryMonthShelfStatus } from '../../src/components/library/historicalLibraryModel.ts'
import {
  attemptSelectLibraryMonthForShelf,
  buildShelfMonthMetadataMap,
  resolveReferenceCurrentYearMonth,
  validateAuthorizedMonthOpen,
} from '../../src/components/libraryShelf/libraryShelfModel.ts'
import type { LocalCalendarDate, PublicationYearMonth } from '../../src/participation/types.ts'
import { createEmptyShelfState } from '../../src/shelf/policy.ts'
import type { ShelfState } from '../../src/shelf/types.ts'

const CURRENT_MONTH = '2026-11' as PublicationYearMonth
const LOCAL_DATE = '2026-11-16' as LocalCalendarDate

const APPROVED_LIBRARY_ITEMS: readonly LibraryMonthSummary[] = [
  { yearMonth: '2026-10', year: 2026, month: 10, title: 'Walk in Gratitude' },
  { yearMonth: '2026-09', year: 2026, month: 9, title: 'Steadfast Hope' },
  { yearMonth: '2026-08', year: 2026, month: 8, title: 'Abiding Peace' },
  { yearMonth: '2026-07', year: 2026, month: 7, title: 'Living Word' },
]

test('resolveReferenceCurrentYearMonth prefers valid explicit month and falls back to serverContext', () => {
  assert.equal(
    resolveReferenceCurrentYearMonth('2026-11', {
      authorizedLocalDate: '2026-12-01',
      effectiveTimeZone: 'America/New_York',
    }),
    '2026-11',
  )
  assert.equal(
    resolveReferenceCurrentYearMonth(undefined, {
      authorizedLocalDate: '2026-11-16',
      effectiveTimeZone: 'America/New_York',
    }),
    '2026-11',
  )
  assert.equal(resolveReferenceCurrentYearMonth('invalid', null), null)
})

test('buildShelfMonthMetadataMap merges external metadata with loaded library items', () => {
  const map = buildShelfMonthMetadataMap(APPROVED_LIBRARY_ITEMS, {
    '2026-10': {
      yearMonth: '2026-10',
      title: 'Walk in Gratitude',
      subtitle: 'Custom subtitle',
    },
  })

  assert.equal(map.get('2026-10')?.subtitle, 'Custom subtitle')
  assert.equal(map.get('2026-09')?.title, 'Steadfast Hope')
  assert.equal(map.size, 4)
})

test('getLibraryMonthShelfStatus distinguishes not-on-shelf, auto-admitted, and protected months', () => {
  const state: ShelfState = {
    months: [
      {
        yearMonth: '2026-10' as PublicationYearMonth,
        admissionKind: 'autoAdmitted',
        isProtected: false,
      },
      {
        yearMonth: '2026-09' as PublicationYearMonth,
        admissionKind: 'readerSelected',
        isProtected: true,
      },
    ],
    activeFocusMonth: null,
  }

  assert.deepEqual(getLibraryMonthShelfStatus('2026-08', state.months), {
    isOnShelf: false,
    admissionKind: null,
    isProtected: false,
  })
  assert.deepEqual(getLibraryMonthShelfStatus('2026-10', state.months), {
    isOnShelf: true,
    admissionKind: 'autoAdmitted',
    isProtected: false,
  })
  assert.deepEqual(getLibraryMonthShelfStatus('2026-09', state.months), {
    isOnShelf: true,
    admissionKind: 'readerSelected',
    isProtected: true,
  })
})

test('attemptSelectLibraryMonthForShelf enforces 0-3 capacity, explicit replacement, and promotes auto-admitted', () => {
  let state = createEmptyShelfState()

  // 0 -> 1 -> 2 -> 3
  for (const ym of ['2026-10', '2026-09', '2026-08']) {
    const res = attemptSelectLibraryMonthForShelf({
      state,
      yearMonth: ym,
      referenceCurrentYearMonth: CURRENT_MONTH,
      approvedLibraryItems: APPROVED_LIBRARY_ITEMS,
      admittedOn: LOCAL_DATE,
    })
    assert.equal(res.ok, true)
    if (res.ok) {
      state = res.state
    }
  }
  assert.equal(state.months.length, 3)

  // Selecting 4th month without replaceMonth triggers capacityExceeded
  const fullRes = attemptSelectLibraryMonthForShelf({
    state,
    yearMonth: '2026-07',
    referenceCurrentYearMonth: CURRENT_MONTH,
    approvedLibraryItems: APPROVED_LIBRARY_ITEMS,
    admittedOn: LOCAL_DATE,
  })
  assert.equal(fullRes.ok, false)
  if (!fullRes.ok) {
    assert.equal(fullRes.reason, 'capacityExceeded')
    assert.equal(fullRes.pendingReplaceTarget, '2026-07')
  }

  // Explicit replacement succeeds
  const replaceRes = attemptSelectLibraryMonthForShelf({
    state,
    yearMonth: '2026-07',
    referenceCurrentYearMonth: CURRENT_MONTH,
    approvedLibraryItems: APPROVED_LIBRARY_ITEMS,
    admittedOn: LOCAL_DATE,
    replaceMonth: '2026-08' as PublicationYearMonth,
  })
  assert.equal(replaceRes.ok, true)
  if (replaceRes.ok) {
    assert.deepEqual(
      replaceRes.state.months.map(m => m.yearMonth),
      ['2026-10', '2026-09', '2026-07'],
    )
  }

  // Promoting an auto-admitted unprotected month
  const autoState: ShelfState = {
    months: [
      {
        yearMonth: '2026-10' as PublicationYearMonth,
        admissionKind: 'autoAdmitted',
        isProtected: false,
      },
    ],
    activeFocusMonth: null,
  }
  const promoteRes = attemptSelectLibraryMonthForShelf({
    state: autoState,
    yearMonth: '2026-10',
    referenceCurrentYearMonth: CURRENT_MONTH,
    approvedLibraryItems: APPROVED_LIBRARY_ITEMS,
    admittedOn: LOCAL_DATE,
  })
  assert.equal(promoteRes.ok, true)
  if (promoteRes.ok) {
    assert.equal(promoteRes.action, 'promotedToProtected')
    assert.equal(promoteRes.state.months[0]?.admissionKind, 'readerSelected')
    assert.equal(promoteRes.state.months[0]?.isProtected, true)
  }
})

test('attemptSelectLibraryMonthForShelf and validateAuthorizedMonthOpen reject unauthorized, current, and future months', () => {
  const taintedItems: readonly LibraryMonthSummary[] = [
    ...APPROVED_LIBRARY_ITEMS,
    { yearMonth: '2026-11', year: 2026, month: 11, title: 'Current Month' },
    { yearMonth: '2026-12', year: 2026, month: 12, title: 'Future Month' },
  ]

  const emptyState = createEmptyShelfState()

  // Unapproved month not in catalogue
  const unapproved = attemptSelectLibraryMonthForShelf({
    state: emptyState,
    yearMonth: '2025-01',
    referenceCurrentYearMonth: CURRENT_MONTH,
    approvedLibraryItems: taintedItems,
  })
  assert.equal(unapproved.ok, false)
  if (!unapproved.ok) assert.equal(unapproved.reason, 'rejected')

  // Current and future months rejected even if present in raw items
  for (const forbidden of ['2026-11', '2026-12', 'invalid-month']) {
    const sel = attemptSelectLibraryMonthForShelf({
      state: emptyState,
      yearMonth: forbidden,
      referenceCurrentYearMonth: CURRENT_MONTH,
      approvedLibraryItems: taintedItems,
    })
    assert.equal(sel.ok, false)

    const openLib = validateAuthorizedMonthOpen({
      yearMonth: forbidden,
      origin: 'library',
      shelfState: emptyState,
      approvedLibraryItems: taintedItems,
      referenceCurrentYearMonth: CURRENT_MONTH,
    })
    assert.equal(openLib.ok, false)
  }

  // Valid historical month opens from Library even when not on Shelf
  const validLibOpen = validateAuthorizedMonthOpen({
    yearMonth: '2026-10',
    origin: 'library',
    shelfState: emptyState,
    approvedLibraryItems: taintedItems,
    referenceCurrentYearMonth: CURRENT_MONTH,
  })
  assert.equal(validLibOpen.ok, true)

  // Shelf origin rejects month not currently on Shelf
  const notOnShelfOpen = validateAuthorizedMonthOpen({
    yearMonth: '2026-10',
    origin: 'shelf',
    shelfState: emptyState,
    approvedLibraryItems: taintedItems,
    referenceCurrentYearMonth: CURRENT_MONTH,
  })
  assert.equal(notOnShelfOpen.ok, false)
})
