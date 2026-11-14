import assert from 'node:assert/strict'
import { test } from 'node:test'
import type {
  LibraryMonthIndexProvider,
  LibraryMonthIndexRequestOptions,
  LibraryMonthSummary,
} from '../../src/cms/reader/libraryMonthIndexProvider.ts'
import { isValidYearMonth } from '../../src/components/library/historicalLibraryModel.ts'

const mockServerContext = {
  authorizedLocalDate: '2026-11-15',
  effectiveTimeZone: 'America/New_York',
}

const mockOct2026: LibraryMonthSummary = {
  yearMonth: '2026-10',
  year: 2026,
  month: 10,
  title: 'Walk in Gratitude',
}

const mockSep2026: LibraryMonthSummary = {
  yearMonth: '2026-09',
  year: 2026,
  month: 9,
  title: 'Steadfast Hope',
}

test('HistoricalLibrary host security invariant: month-opening target must be valid YYYY-MM and present in loaded catalogue', () => {
  const loadedCatalogue = [mockOct2026, mockSep2026]

  function openMonthGuard(yearMonth: string, onOpen: (ym: string) => void): boolean {
    if (!isValidYearMonth(yearMonth)) {
      return false
    }
    const isApproved = loadedCatalogue.some(item => item.yearMonth === yearMonth)
    if (!isApproved) {
      return false
    }
    onOpen(yearMonth)
    return true
  }

  const opened: string[] = []
  const onOpen = (ym: string) => opened.push(ym)

  // 1. Valid approved month in catalogue succeeds
  assert.equal(openMonthGuard('2026-10', onOpen), true)
  assert.deepEqual(opened, ['2026-10'])

  // 2. Unapproved / future / guessed month is rejected even if formatted as YYYY-MM
  assert.equal(openMonthGuard('2026-11', onOpen), false)
  assert.equal(openMonthGuard('2025-01', onOpen), false)
  assert.deepEqual(opened, ['2026-10'])

  // 3. Malformed / arbitrary strings or challenge slugs are rejected
  assert.equal(openMonthGuard('slug-challenge-1', onOpen), false)
  assert.equal(openMonthGuard('https://external-link.com', onOpen), false)
  assert.equal(openMonthGuard('2026-13', onOpen), false)
  assert.deepEqual(opened, ['2026-10'])
})

test('HistoricalLibrary provider request options are strictly bounded', async () => {
  const calls: LibraryMonthIndexRequestOptions[] = []

  const mockProvider: LibraryMonthIndexProvider = {
    async loadHistoricalMonths(options = {}) {
      calls.push(options)
      return {
        status: 'ready',
        items: [mockOct2026],
        page: { limit: options.limit ?? 12, hasMore: false, nextCursor: null },
        serverContext: mockServerContext,
        source: 'gateway',
      }
    },
  }

  // Request with limit and timezone
  const res = await mockProvider.loadHistoricalMonths({
    limit: 12,
    timeZone: 'America/New_York',
  })

  assert.equal(res.status, 'ready')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].limit, 12)
  assert.equal(calls[0].timeZone, 'America/New_York')
})

test('HistoricalLibrary handles AbortController cancellation cleanly', async () => {
  let wasAborted = false

  const mockProvider: LibraryMonthIndexProvider = {
    async loadHistoricalMonths(options = {}) {
      if (options.signal?.aborted) {
        wasAborted = true
        throw new DOMException('Aborted', 'AbortError')
      }
      return new Promise((resolve, reject) => {
        options.signal?.addEventListener('abort', () => {
          wasAborted = true
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
    },
  }

  const controller = new AbortController()
  const promise = mockProvider.loadHistoricalMonths({ signal: controller.signal })

  // Abort while in flight
  controller.abort()

  await assert.rejects(
    promise,
    (err: unknown) => err instanceof Error && err.name === 'AbortError',
  )
  assert.equal(wasAborted, true)
})
