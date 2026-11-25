import assert from 'node:assert/strict'
import { test } from 'node:test'
import type {
  LibraryMonthIndexProvider,
  LibraryMonthSummary,
} from '../../src/cms/reader/libraryMonthIndexProvider.ts'
import type { MonthGatewayProvider } from '../../src/cms/reader/monthProvider.ts'
import { getLibraryMonthShelfStatus } from '../../src/components/library/historicalLibraryModel.ts'
import {
  attemptSelectLibraryMonthForShelf,
  buildShelfMonthMetadataMap,
  isGatewayAuthorizedHistoricalMonth,
  loadAuthorizedShelfMonthMetadata,
  resolveReferenceCurrentYearMonth,
  validateAuthorizedMonthOpen,
} from '../../src/components/libraryShelf/libraryShelfModel.ts'
import { emptyReaderParticipationData } from '../../src/participation/model.ts'
import type {
  LocalCalendarDate,
  PublicationYearMonth,
  ReaderParticipationData,
} from '../../src/participation/types.ts'
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

test('loadAuthorizedShelfMonthMetadata uses an older month detail, its roster and authoritative gateway counts', async () => {
  const participationData: ReaderParticipationData = {
    ...emptyReaderParticipationData(),
    completedChallenges: {
      'cms:october-challenge': { completedOn: LOCAL_DATE },
      'cms:another-month-challenge': { completedOn: LOCAL_DATE },
    },
  }
  let requestedCompletionIds: readonly string[] = []
  const provider = {
    async loadMonth(yearMonth: string) {
      return {
        status: 'ready',
        source: 'gateway',
        month: {
          monthId: yearMonth,
          title: 'An older authorized theme',
          subtitle: 'A real month subtitle',
          totalChallenges: 2,
          rosterVersion: 1,
          slots: [
            { availability: 'available', challengeId: 'cms:october-challenge' },
            { availability: 'available', challengeId: 'cms:unfinished-challenge' },
          ],
        },
      }
    },
    async loadMonthProgress(yearMonth: string, completedChallengeIds: readonly string[]) {
      requestedCompletionIds = completedChallengeIds
      return {
        status: 'ready',
        source: 'gateway',
        progress: {
          monthId: yearMonth,
          rosterVersion: 1,
          completedInMonthCount: 1,
          totalChallenges: 2,
        },
      }
    },
  } as unknown as MonthGatewayProvider

  const metadata = await loadAuthorizedShelfMonthMetadata({
    yearMonths: ['2024-01', '2024-01'],
    participationData,
    monthProvider: provider,
  })

  assert.deepEqual(requestedCompletionIds, ['cms:october-challenge'])
  assert.deepEqual(metadata.get('2024-01'), {
    yearMonth: '2024-01',
    title: 'An older authorized theme',
    subtitle: 'A real month subtitle',
    completionProgress: {
      completedChallengeCount: 1,
      totalChallengeCount: 2,
    },
  })
})

test('loadAuthorizedShelfMonthMetadata withholds unavailable months and mismatched or invalid progress', async () => {
  const provider = {
    async loadMonth(yearMonth: string) {
      return {
        status: 'ready',
        source: 'gateway',
        month: {
          monthId: yearMonth,
          title: 'Authorized month title',
          totalChallenges: 1,
          rosterVersion: 3,
          slots: [{ availability: 'available', challengeId: 'cms:october-challenge' }],
        },
      }
    },
    async loadMonthProgress(yearMonth: string) {
      return {
        status: 'ready',
        source: 'gateway',
        progress: {
          monthId: yearMonth,
          rosterVersion: 2,
          completedInMonthCount: 3,
          totalChallenges: 1,
        },
      }
    },
  } as unknown as MonthGatewayProvider

  const metadata = await loadAuthorizedShelfMonthMetadata({
    yearMonths: ['2026-10'],
    participationData: emptyReaderParticipationData(),
    monthProvider: provider,
  })

  assert.deepEqual(metadata.get('2026-10'), {
    yearMonth: '2026-10',
    title: 'Authorized month title',
    progressStatus: 'unavailable',
  })

  const withdrawnProvider = {
    async loadMonth() {
      return { status: 'notFound', source: 'gateway' }
    },
  } as unknown as MonthGatewayProvider
  const withdrawn = await loadAuthorizedShelfMonthMetadata({
    yearMonths: ['2026-10'],
    participationData: emptyReaderParticipationData(),
    monthProvider: withdrawnProvider,
  })
  assert.deepEqual(withdrawn.get('2026-10'), {
    yearMonth: '2026-10',
    progressStatus: 'unavailable',
  })
})

test('gateway authorization scans older pages beyond the currently loaded Library window', async () => {
  const requestedCursors: (string | undefined)[] = []
  const provider: LibraryMonthIndexProvider = {
    async loadHistoricalMonths(options = {}) {
      requestedCursors.push(options.cursor)
      const base = {
        page: {
          limit: options.limit ?? 24,
          hasMore: options.cursor === undefined,
          nextCursor: options.cursor === undefined ? '2026-08' : null,
        },
        serverContext: {
          authorizedLocalDate: '2026-11-16',
          effectiveTimeZone: 'America/New_York',
        },
        source: 'gateway' as const,
      }
      return options.cursor === undefined
        ? { status: 'ready' as const, items: APPROVED_LIBRARY_ITEMS.slice(0, 3), ...base }
        : { status: 'ready' as const, items: [APPROVED_LIBRARY_ITEMS[3]], ...base }
    },
  }

  assert.equal(
    await isGatewayAuthorizedHistoricalMonth({ provider, yearMonth: '2026-07' }),
    true,
  )
  assert.deepEqual(requestedCursors, [undefined, '2026-08'])
})

test('gateway authorization rejects a stale Shelf month omitted from the authorized catalogue', async () => {
  const provider: LibraryMonthIndexProvider = {
    async loadHistoricalMonths() {
      return {
        status: 'ready',
        items: APPROVED_LIBRARY_ITEMS.filter(item => item.yearMonth !== '2026-10'),
        page: { limit: 24, hasMore: false, nextCursor: null },
        serverContext: {
          authorizedLocalDate: '2026-11-16',
          effectiveTimeZone: 'America/New_York',
        },
        source: 'gateway',
      }
    },
  }

  assert.equal(
    await isGatewayAuthorizedHistoricalMonth({ provider, yearMonth: '2026-10' }),
    false,
  )
})

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
