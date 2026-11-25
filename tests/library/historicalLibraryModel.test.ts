import assert from 'node:assert/strict'
import { test } from 'node:test'
import type {
  GatewayServerContext,
  LibraryMonthIndexPage,
  LibraryMonthSummary,
} from '../../src/cms/reader/libraryMonthIndexProvider.ts'
import {
  deduplicateAndSortMonths,
  formatPublicationMonthHeading,
  groupMonthsByYear,
  historicalLibraryReducer,
  initialHistoricalLibraryState,
  isValidYearMonth,
  type HistoricalLibraryState,
} from '../../src/components/library/historicalLibraryModel.ts'

const mockServerContext: GatewayServerContext = {
  authorizedLocalDate: '2026-11-15',
  effectiveTimeZone: 'America/New_York',
}

const mockOct2026: LibraryMonthSummary = {
  yearMonth: '2026-10',
  year: 2026,
  month: 10,
  title: 'Walk in Gratitude',
  subtitle: 'Thirty-one studies on thankfulness.',
  coverImage: {
    url: 'https://cdn.sanity.io/images/80016lrq/production/cover-2026-10.png',
    alt: 'Autumn leaves and Bible',
  },
}

const mockSep2026: LibraryMonthSummary = {
  yearMonth: '2026-09',
  year: 2026,
  month: 9,
  title: 'Steadfast Hope',
}

const mockAug2026: LibraryMonthSummary = {
  yearMonth: '2026-08',
  year: 2026,
  month: 8,
  title: 'Abiding Peace',
}

test('isValidYearMonth validates YYYY-MM strictly', () => {
  assert.equal(isValidYearMonth('2026-10'), true)
  assert.equal(isValidYearMonth('2026-01'), true)
  assert.equal(isValidYearMonth('2026-12'), true)
  assert.equal(isValidYearMonth('1999-05'), true)

  // Invalid values
  assert.equal(isValidYearMonth('2026-00'), false)
  assert.equal(isValidYearMonth('2026-13'), false)
  assert.equal(isValidYearMonth('2026-1'), false)
  assert.equal(isValidYearMonth('2026-10-01'), false)
  assert.equal(isValidYearMonth('October 2026'), false)
  assert.equal(isValidYearMonth(''), false)
  assert.equal(isValidYearMonth(null), false)
  assert.equal(isValidYearMonth(undefined), false)
  assert.equal(isValidYearMonth(123), false)
})

test('formatPublicationMonthHeading formats deterministic month and year headings', () => {
  assert.equal(formatPublicationMonthHeading('2026-10', 2026, 10), 'October 2026')
  assert.equal(formatPublicationMonthHeading('2026-09', 2026, 9), 'September 2026')
  assert.equal(formatPublicationMonthHeading('2026-01', 2026, 1), 'January 2026')
  assert.equal(formatPublicationMonthHeading('2026-12'), 'December 2026')
  assert.equal(formatPublicationMonthHeading('invalid-string'), 'invalid-string')
})

test('deduplicateAndSortMonths sorts newest-first and deduplicates on yearMonth', () => {
  const existing = [mockSep2026]
  const incoming = [mockOct2026, mockSep2026, mockAug2026]

  const result = deduplicateAndSortMonths(existing, incoming)

  // Must be sorted newest-first: Oct (2026-10) -> Sep (2026-09) -> Aug (2026-08)
  assert.deepEqual(
    result.map(m => m.yearMonth),
    ['2026-10', '2026-09', '2026-08'],
  )
  assert.equal(result.length, 3)

  // Retains original item for duplicates
  assert.equal(result[1], mockSep2026)
})

test('historicalLibraryReducer handles initial load lifecycle: ready state', () => {
  const s0 = initialHistoricalLibraryState
  assert.equal(s0.status, 'idle')

  const s1 = historicalLibraryReducer(s0, { type: 'START_INITIAL_LOAD' })
  assert.equal(s1.status, 'loading-initial')

  const page: LibraryMonthIndexPage = { limit: 12, hasMore: true, nextCursor: '2026-09' }
  const s2 = historicalLibraryReducer(s1, {
    type: 'INITIAL_LOAD_SUCCESS',
    items: [mockOct2026, mockSep2026],
    page,
    serverContext: mockServerContext,
  })

  assert.equal(s2.status, 'ready')
  assert.equal(s2.items.length, 2)
  assert.equal(s2.hasMore, true)
  assert.equal(s2.nextCursor, '2026-09')
  assert.equal(s2.isSparseContinuation, false)
  assert.equal(s2.serverContext?.effectiveTimeZone, 'America/New_York')
})

test('historicalLibraryReducer differentiates truly empty catalogue from sparse continuation page', () => {
  // Case A: Truly empty catalogue (items=[] and hasMore=false)
  const emptyPage: LibraryMonthIndexPage = { limit: 12, hasMore: false, nextCursor: null }
  const emptyState = historicalLibraryReducer(
    { ...initialHistoricalLibraryState, status: 'loading-initial' },
    {
      type: 'INITIAL_LOAD_SUCCESS',
      items: [],
      page: emptyPage,
      serverContext: mockServerContext,
    },
  )

  assert.equal(emptyState.status, 'empty')
  assert.equal(emptyState.items.length, 0)
  assert.equal(emptyState.hasMore, false)
  assert.equal(emptyState.nextCursor, null)
  assert.equal(emptyState.isSparseContinuation, false)

  // Case B: Sparse valid continuation page (items=[] but hasMore=true and nextCursor is set)
  const sparsePage: LibraryMonthIndexPage = { limit: 12, hasMore: true, nextCursor: '2026-06' }
  const sparseState = historicalLibraryReducer(
    { ...initialHistoricalLibraryState, status: 'loading-initial' },
    {
      type: 'INITIAL_LOAD_SUCCESS',
      items: [],
      page: sparsePage,
      serverContext: mockServerContext,
    },
  )

  // Must NOT claim library is empty! Must be ready with isSparseContinuation=true
  assert.equal(sparseState.status, 'ready')
  assert.equal(sparseState.items.length, 0)
  assert.equal(sparseState.hasMore, true)
  assert.equal(sparseState.nextCursor, '2026-06')
  assert.equal(sparseState.isSparseContinuation, true)
})

test('historicalLibraryReducer handles multi-page pagination with deduplication and continuation', () => {
  const readyState: HistoricalLibraryState = {
    ...initialHistoricalLibraryState,
    status: 'ready',
    items: [mockOct2026],
    hasMore: true,
    nextCursor: '2026-10',
    serverContext: mockServerContext,
  }

  // User clicks Load more
  const loadingMoreState = historicalLibraryReducer(readyState, { type: 'START_LOAD_MORE' })
  assert.equal(loadingMoreState.status, 'loading-more')
  assert.equal(loadingMoreState.items.length, 1)

  // Page 2 arrives with mockSep2026 and an accidental duplicate mockOct2026
  const page2: LibraryMonthIndexPage = { limit: 12, hasMore: true, nextCursor: '2026-09' }
  const page2State = historicalLibraryReducer(loadingMoreState, {
    type: 'LOAD_MORE_SUCCESS',
    items: [mockOct2026, mockSep2026],
    page: page2,
    serverContext: mockServerContext,
  })

  assert.equal(page2State.status, 'ready')
  assert.equal(page2State.items.length, 2)
  assert.deepEqual(
    page2State.items.map(i => i.yearMonth),
    ['2026-10', '2026-09'],
  )
  assert.equal(page2State.nextCursor, '2026-09')
  assert.equal(page2State.hasMore, true)
  assert.equal(page2State.isSparseContinuation, false)

  // Page 3 is sparse: items=[] but hasMore=true, nextCursor='2026-07'
  const sparsePage3: LibraryMonthIndexPage = { limit: 12, hasMore: true, nextCursor: '2026-07' }
  const page3State = historicalLibraryReducer(page2State, {
    type: 'LOAD_MORE_SUCCESS',
    items: [],
    page: sparsePage3,
    serverContext: mockServerContext,
  })

  assert.equal(page3State.status, 'ready')
  assert.equal(page3State.items.length, 2) // prior items preserved!
  assert.equal(page3State.hasMore, true) // continuation action preserved!
  assert.equal(page3State.nextCursor, '2026-07')
  assert.equal(page3State.isSparseContinuation, true)

  // Page 4 completes catalogue: items=[mockAug2026], hasMore=false, nextCursor=null
  const page4: LibraryMonthIndexPage = { limit: 12, hasMore: false, nextCursor: null }
  const finalState = historicalLibraryReducer(page3State, {
    type: 'LOAD_MORE_SUCCESS',
    items: [mockAug2026],
    page: page4,
    serverContext: mockServerContext,
  })

  assert.equal(finalState.status, 'ready')
  assert.equal(finalState.items.length, 3)
  assert.deepEqual(
    finalState.items.map(i => i.yearMonth),
    ['2026-10', '2026-09', '2026-08'],
  )
  assert.equal(finalState.hasMore, false)
  assert.equal(finalState.nextCursor, null)
  assert.equal(finalState.isSparseContinuation, false)
})

test('historicalLibraryReducer preserves existing items on load-more error', () => {
  const readyState: HistoricalLibraryState = {
    ...initialHistoricalLibraryState,
    status: 'ready',
    items: [mockOct2026],
    hasMore: true,
    nextCursor: '2026-10',
    serverContext: mockServerContext,
  }

  const failedState = historicalLibraryReducer(readyState, {
    type: 'LOAD_FAILURE',
    errorKind: 'request',
    message: 'Gateway network timeout',
    failedAction: 'more',
  })

  assert.equal(failedState.status, 'request-error')
  assert.equal(failedState.items.length, 1)
  assert.equal(failedState.items[0].yearMonth, '2026-10')
  assert.equal(failedState.errorMessage, 'Gateway network timeout')
  assert.equal(failedState.failedAction, 'more')
})

test('historicalLibraryReducer safely handles validation errors', () => {
  const s0 = initialHistoricalLibraryState
  const failedState = historicalLibraryReducer(s0, {
    type: 'LOAD_FAILURE',
    errorKind: 'validation',
    message: 'Library month index included current or future month',
    issues: ['items[0].yearMonth: "2026-11" must be strictly earlier than "2026-11".'],
    failedAction: 'initial',
  })

  assert.equal(failedState.status, 'validation-error')
  assert.equal(failedState.errorKind, 'validation')
  assert.equal(failedState.failedAction, 'initial')
  assert.equal(failedState.errorIssues?.length, 1)
})

test('historicalLibraryReducer ignores START_LOAD_MORE if hasMore is false or already loading', () => {
  const exhaustedState: HistoricalLibraryState = {
    ...initialHistoricalLibraryState,
    status: 'ready',
    items: [mockOct2026],
    hasMore: false,
    nextCursor: null,
  }

  const result1 = historicalLibraryReducer(exhaustedState, { type: 'START_LOAD_MORE' })
  assert.equal(result1, exhaustedState)

  const loadingState: HistoricalLibraryState = {
    ...initialHistoricalLibraryState,
    status: 'loading-more',
    items: [mockOct2026],
    hasMore: true,
    nextCursor: '2026-10',
  }

  const result2 = historicalLibraryReducer(loadingState, { type: 'START_LOAD_MORE' })
  assert.equal(result2, loadingState)
})

test('groups a continued December window under the preceding year', () => {
  const december = { ...mockOct2026, yearMonth: '2025-12', year: 2025, month: 12 }
  const months = deduplicateAndSortMonths([mockOct2026], [december, mockSep2026])
  assert.deepEqual([...groupMonthsByYear(months)], [
    [2026, [mockOct2026, mockSep2026]], [2025, [december]],
  ])
})
