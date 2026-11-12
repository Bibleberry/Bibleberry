import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  createGatewayLibraryMonthIndexProvider,
  DEFAULT_READER_TIME_ZONE,
  MAX_LIBRARY_PAGE_SIZE,
} from '../../src/cms/reader/libraryMonthIndexProvider.ts'
import { createGatewayMonthProvider } from '../../src/cms/reader/monthProvider.ts'
import { handleGatewayRequest } from '../../src/gateway/handler.ts'
import { daysInMonth, formatCivilDate } from '../../src/gateway/localRelease.ts'
import type { GatewayEnv } from '../../src/gateway/types.ts'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function makeIndexResponsePayload(
  overrides: {
    authorizedLocalDate?: string
    effectiveTimeZone?: string
    items?: Array<Record<string, unknown>>
    limit?: number
    hasMore?: boolean
    nextCursor?: string | null
  } = {},
) {
  const items = overrides.items ?? [
    {
      yearMonth: '2026-10',
      year: 2026,
      month: 10,
      title: 'Walk in Gratitude',
      subtitle: 'Thirty-one studies on thankfulness.',
      coverImage: {
        url: 'https://cdn.sanity.io/images/80016lrq/staging/cover-2026-10.png',
        alt: 'Autumn leaves and open Bible',
      },
    },
    {
      yearMonth: '2026-09',
      year: 2026,
      month: 9,
      title: 'Steadfast Hope',
    },
  ]
  const limit = overrides.limit ?? 12
  const hasMore = overrides.hasMore ?? false
  const nextCursor =
    overrides.nextCursor !== undefined
      ? overrides.nextCursor
      : hasMore && items.length > 0
        ? String(items[items.length - 1].yearMonth)
        : null

  return {
    ok: true,
    serverContext: {
      authorizedLocalDate: overrides.authorizedLocalDate ?? '2026-11-15',
      effectiveTimeZone: overrides.effectiveTimeZone ?? 'America/New_York',
    },
    items,
    page: {
      limit,
      hasMore,
      nextCursor,
    },
  }
}

test('requests same-origin /api/library/months with credentials: same-origin and X-Bibleberry-Timezone fallback', async () => {
  const captured: Array<{
    url: string
    method: string | undefined
    credentials: RequestCredentials | undefined
    timeZone: string | null
  }> = []

  const provider = createGatewayLibraryMonthIndexProvider({
    resolveTimeZone: () => 'Asia/Tokyo',
    fetchImpl: async (input, init) => {
      const headers = new Headers(init?.headers)
      const url = String(input)
      captured.push({
        url,
        method: init?.method,
        credentials: init?.credentials,
        timeZone: headers.get('X-Bibleberry-Timezone'),
      })
      const payload = url.includes('cursor=2026-10')
        ? makeIndexResponsePayload({
            effectiveTimeZone: DEFAULT_READER_TIME_ZONE,
            limit: 5,
            items: [{ yearMonth: '2026-09', year: 2026, month: 9, title: 'Steadfast Hope' }],
          })
        : makeIndexResponsePayload({ effectiveTimeZone: 'Asia/Tokyo' })
      return new Response(JSON.stringify(payload), {
        status: 200,
      })
    },
  })

  const res1 = await provider.loadHistoricalMonths()
  assert.equal(res1.status, 'ready')

  const res2 = await provider.loadHistoricalMonths({
    limit: 5,
    cursor: '2026-10',
    timeZone: '+14:00', // invalid raw offset -> falls back to America/New_York
  })
  assert.equal(res2.status, 'ready')

  assert.deepEqual(captured, [
    {
      url: '/api/library/months',
      method: 'GET',
      credentials: 'same-origin',
      timeZone: 'Asia/Tokyo',
    },
    {
      url: '/api/library/months?limit=5&cursor=2026-10',
      method: 'GET',
      credentials: 'same-origin',
      timeZone: DEFAULT_READER_TIME_ZONE,
    },
  ])
})

test('returns typed empty outcome when no historical months exist', async () => {
  const provider = createGatewayLibraryMonthIndexProvider({
    fetchImpl: async () =>
      new Response(JSON.stringify(makeIndexResponsePayload({ items: [], hasMore: false, nextCursor: null })), {
        status: 200,
      }),
  })

  const res = await provider.loadHistoricalMonths()
  assert.equal(res.status, 'empty')
  if (res.status === 'empty') {
    assert.deepEqual(res.items, [])
    assert.deepEqual(res.page, { limit: 12, hasMore: false, nextCursor: null })
    assert.equal(res.source, 'gateway')
  }

  // Honest continuation when bounded gateway scan hits limit with 0 valid items in first window
  const continuationProvider = createGatewayLibraryMonthIndexProvider({
    fetchImpl: async () =>
      new Response(
        JSON.stringify(
          makeIndexResponsePayload({
            authorizedLocalDate: '2026-12-10',
            items: [],
            limit: 2,
            hasMore: true,
            nextCursor: '2025-04',
          }),
        ),
        { status: 200 },
      ),
  })
  const contRes = await continuationProvider.loadHistoricalMonths({ limit: 2 })
  assert.equal(contRes.status, 'empty')
  if (contRes.status === 'empty') {
    assert.deepEqual(contRes.items, [])
    assert.deepEqual(contRes.page, { limit: 2, hasMore: true, nextCursor: '2025-04' })
  }
})

test('rejects invalid pagination params, Sanity API URLs, and cross-origin browser URLs with zero network calls', async () => {
  let fetchCalled = false
  const provider = createGatewayLibraryMonthIndexProvider({
    fetchImpl: async () => {
      fetchCalled = true
      return new Response(null, { status: 500 })
    },
  })

  for (const badLimit of [0, -1, 1.5, NaN, MAX_LIBRARY_PAGE_SIZE + 1]) {
    const res = await provider.loadHistoricalMonths({ limit: badLimit })
    assert.equal(res.status, 'validationError')
  }

  for (const badCursor of ['', '2026-00', '2026-13', '2026-3', '2026-10-01', '../2026-10']) {
    const res = await provider.loadHistoricalMonths({ cursor: badCursor })
    assert.equal(res.status, 'validationError')
  }

  for (const badBase of [
    '//evil.example.com',
    'https://80016lrq.api.sanity.io',
    'https://80016lrq.apicdn.sanity.io',
    'https://gateway.example.com?token=secret',
    'https://user:pass@gateway.example.com',
    'javascript:alert(1)',
  ]) {
    const res = await provider.loadHistoricalMonths({ baseUrl: badBase })
    assert.equal(res.status, 'validationError')
  }

  assert.equal(fetchCalled, false)

  // Simulate browser window.location.origin enforcement for same-origin policy
  const globalAny = globalThis as { window?: unknown }
  const previousWindow = globalAny.window
  globalAny.window = { location: { origin: 'https://reader.bibleberry.org' } }
  try {
    const crossOriginRes = await provider.loadHistoricalMonths({
      baseUrl: 'https://other.example.com',
    })
    assert.equal(crossOriginRes.status, 'validationError')
    assert.equal(fetchCalled, false)

    const sameOriginRes = await createGatewayLibraryMonthIndexProvider({
      fetchImpl: async () =>
        new Response(JSON.stringify(makeIndexResponsePayload({ items: [], hasMore: false, nextCursor: null })), {
          status: 200,
        }),
    }).loadHistoricalMonths({ baseUrl: 'https://reader.bibleberry.org' })
    assert.equal(sameOriginRes.status, 'empty')
  } finally {
    if (previousWindow === undefined) {
      delete globalAny.window
    } else {
      globalAny.window = previousWindow
    }
  }
})

test('rejects untrusted JSON, embedded hidden fields, current/future months, arbitrary URLs, and bad ordering fail-closed', async () => {
  const rejectPayloads: Array<{ label: string; payload: unknown; cursor?: string; limit?: number }> = [
    {
      label: 'embedded Sanity _id',
      payload: makeIndexResponsePayload({
        items: [{ _id: 'month-2026-10', yearMonth: '2026-10', year: 2026, month: 10, title: 'Ok' }],
      }),
    },
    {
      label: 'embedded editorialStatus',
      payload: makeIndexResponsePayload({
        items: [{ editorialStatus: 'scheduled', yearMonth: '2026-10', year: 2026, month: 10, title: 'Ok' }],
      }),
    },
    {
      label: 'embedded qualifyingChallenges / card data',
      payload: {
        ...makeIndexResponsePayload(),
        hiddenCard: { earnedCard: { imageUrl: 'https://cdn.sanity.io/images/80016lrq/staging/c.png' } },
      },
    },
    {
      label: 'extra unknown field on item (strict schema)',
      payload: makeIndexResponsePayload({
        items: [{ yearMonth: '2026-10', year: 2026, month: 10, title: 'Ok', extraSecret: 'hidden' }],
      }),
    },
    {
      label: 'current month smuggled into items',
      payload: makeIndexResponsePayload({
        authorizedLocalDate: '2026-11-15',
        items: [{ yearMonth: '2026-11', year: 2026, month: 11, title: 'Current Month' }],
      }),
    },
    {
      label: 'future month smuggled into items',
      payload: makeIndexResponsePayload({
        authorizedLocalDate: '2026-11-15',
        items: [{ yearMonth: '2026-12', year: 2026, month: 12, title: 'Future Month' }],
      }),
    },
    {
      label: 'arbitrary non-Sanity-CDN cover image URL',
      payload: makeIndexResponsePayload({
        items: [
          {
            yearMonth: '2026-10',
            year: 2026,
            month: 10,
            title: 'Ok',
            coverImage: { url: 'https://evil.example.com/pixel.png', alt: 'Alt' },
          },
        ],
      }),
    },
    {
      label: 'Sanity CDN cover image URL with query params',
      payload: makeIndexResponsePayload({
        items: [
          {
            yearMonth: '2026-10',
            year: 2026,
            month: 10,
            title: 'Ok',
            coverImage: { url: 'https://cdn.sanity.io/images/80016lrq/staging/c.png?w=100', alt: 'Alt' },
          },
        ],
      }),
    },
    {
      label: 'ascending instead of newest-first ordering',
      payload: makeIndexResponsePayload({
        items: [
          { yearMonth: '2026-09', year: 2026, month: 9, title: 'Older' },
          { yearMonth: '2026-10', year: 2026, month: 10, title: 'Newer' },
        ],
      }),
    },
    {
      label: 'duplicate yearMonth',
      payload: makeIndexResponsePayload({
        items: [
          { yearMonth: '2026-10', year: 2026, month: 10, title: 'A' },
          { yearMonth: '2026-10', year: 2026, month: 10, title: 'B' },
        ],
      }),
    },
    {
      label: 'cursor bound violated',
      cursor: '2026-10',
      payload: makeIndexResponsePayload({
        items: [{ yearMonth: '2026-10', year: 2026, month: 10, title: 'Same as cursor' }],
      }),
    },
    {
      label: 'mismatched nextCursor (newer than last returned item)',
      payload: makeIndexResponsePayload({
        hasMore: true,
        nextCursor: '2026-10',
      }),
    },
    {
      label: 'hasMore=true with nextCursor=null',
      payload: makeIndexResponsePayload({
        hasMore: true,
        nextCursor: null,
      }),
    },
    {
      label: 'empty page with hasMore=true and nextCursor=null',
      payload: makeIndexResponsePayload({
        items: [],
        hasMore: true,
        nextCursor: null,
      }),
    },
    {
      label: 'empty page with hasMore=true and non-historical nextCursor',
      payload: makeIndexResponsePayload({
        authorizedLocalDate: '2026-11-15',
        items: [],
        hasMore: true,
        nextCursor: '2026-11',
      }),
    },
    {
      label: 'empty page with hasMore=true and nextCursor not advancing past requested cursor',
      cursor: '2026-05',
      payload: makeIndexResponsePayload({
        items: [],
        hasMore: true,
        nextCursor: '2026-05',
      }),
    },
  ]

  for (const testCase of rejectPayloads) {
    const provider = createGatewayLibraryMonthIndexProvider({
      fetchImpl: async () => new Response(JSON.stringify(testCase.payload), { status: 200 }),
    })
    const res = await provider.loadHistoricalMonths({
      cursor: testCase.cursor,
      limit: testCase.limit,
    })
    assert.equal(res.status, 'validationError', `Expected validationError for: ${testCase.label}`)
  }

  // Non-JSON response -> validationError
  const htmlProvider = createGatewayLibraryMonthIndexProvider({
    fetchImpl: async () => new Response('<html>502 Bad Gateway</html>', { status: 200 }),
  })
  assert.equal((await htmlProvider.loadHistoricalMonths()).status, 'validationError')
})

test('supports bounded retries on transient errors, skips retry on 4xx/validation, and honors AbortSignal', async () => {
  // 1. Recovers on transient 503 + network error
  let attempt = 0
  const retryProvider = createGatewayLibraryMonthIndexProvider({
    maxRetries: 2,
    retryDelayMs: 0,
    fetchImpl: async () => {
      attempt += 1
      if (attempt === 1) {
        throw new Error('Temporary socket hang up')
      }
      if (attempt === 2) {
        return new Response('Upstream unavailable', { status: 503 })
      }
      return new Response(JSON.stringify(makeIndexResponsePayload()), { status: 200 })
    },
  })
  const recovered = await retryProvider.loadHistoricalMonths()
  assert.equal(attempt, 3)
  assert.equal(recovered.status, 'ready')

  // 2. Exhausts retries on persistent 502
  let attempts502 = 0
  const exhaustedProvider = createGatewayLibraryMonthIndexProvider({
    maxRetries: 2,
    retryDelayMs: 0,
    fetchImpl: async () => {
      attempts502 += 1
      return new Response('Bad Gateway', { status: 502 })
    },
  })
  const failed502 = await exhaustedProvider.loadHistoricalMonths()
  assert.equal(attempts502, 3)
  assert.equal(failed502.status, 'requestError')

  // 3. Does NOT retry 400 or 404
  let attempts400 = 0
  const clientErrProvider = createGatewayLibraryMonthIndexProvider({
    maxRetries: 2,
    retryDelayMs: 0,
    fetchImpl: async () => {
      attempts400 += 1
      return new Response('Bad Request', { status: 400 })
    },
  })
  const failed400 = await clientErrProvider.loadHistoricalMonths()
  assert.equal(attempts400, 1)
  assert.equal(failed400.status, 'requestError')

  // 4. AbortSignal cancels immediately without retry
  const controller = new AbortController()
  let abortAttempts = 0
  const abortProvider = createGatewayLibraryMonthIndexProvider({
    maxRetries: 2,
    retryDelayMs: 50,
    fetchImpl: async () => {
      abortAttempts += 1
      controller.abort()
      return new Response('Service Unavailable', { status: 503 })
    },
  })
  await assert.rejects(
    async () => abortProvider.loadHistoricalMonths({ signal: controller.signal }),
    (err: unknown) => err instanceof DOMException && err.name === 'AbortError',
  )
  assert.equal(abortAttempts, 1)
})

test('end-to-end discovery through real gateway handler feeds existing monthProvider without direct Sanity calls', async () => {
  const makeMockMonthDoc = (yearMonth: string, overrides: Record<string, unknown> = {}) => {
    const year = Number(yearMonth.slice(0, 4))
    const month = Number(yearMonth.slice(5, 7))
    const count = daysInMonth(year, month)
    const slots = Array.from({ length: count }, (_, idx) => {
      const day = idx + 1
      const padded = String(day).padStart(2, '0')
      const id = `r08a-stg-${yearMonth}-day-${padded}`
      return {
        _key: `day-${padded}`,
        dayOfMonth: day,
        date: formatCivilDate(year, month, day),
        slotStatus: 'scheduled',
        rawChallengeRef: id,
        challenge: {
          _id: id,
          _type: 'challenge',
          title: `Day ${day} (${yearMonth})`,
          slug: `day-${padded}-${yearMonth}`,
          challengeType: 'teaching',
          withdrawn: false,
          editorialEligibility: { adaptationReviewed: true, reviewedAt: '2026-01-10T00:00:00.000Z' },
          unapprovedBlockCount: 0,
          primaryScripture: {
            reference: 'Psalm 23:1',
            translation: 'WEBP',
            textStatus: 'referenceOnly',
            usageRightsConfirmed: false,
            practiceStatus: 'notConfigured',
          },
          assignedMonthIds: [`month-${yearMonth}`],
        },
      }
    })
    return {
      _id: `month-${yearMonth}`,
      _type: 'monthlyPublication',
      yearMonth,
      year,
      month,
      title: `Month ${yearMonth}`,
      editorialStatus: 'scheduled',
      withdrawn: false,
      editorialReview: {
        reviewedBy: 'Aaron Waid',
        reviewerRole: 'technical_synthetic',
        reviewedAt: '2026-01-10T00:00:00.000Z',
      },
      introduction: {
        previewScreens: [
          {
            _key: 'intro-1',
            _type: 'introductionScreen',
            blocks: [{ _key: 'b1', _type: 'statementBlock', text: 'Intro' }],
          },
        ],
        welcomeScreen: {
          _key: 'welcome',
          _type: 'introductionScreen',
          blocks: [{ _key: 'w1', _type: 'statementBlock', text: 'Welcome' }],
        },
      },
      slots,
      rosterFinalization: {
        isFinalized: true,
        rosterVersion: 1,
        finalizedChallengeIds: slots.map(s => s.challenge._id),
      },
      ...overrides,
    }
  }

  const docs = [
    makeMockMonthDoc('2026-09'),
    makeMockMonthDoc('2026-10'),
    makeMockMonthDoc('2026-11'), // current month -> excluded
    makeMockMonthDoc('2026-12'), // future month -> excluded
    makeMockMonthDoc('2026-08', { withdrawn: true }), // withdrawn -> excluded
  ]

  const env: GatewayEnv = {
    SANITY_PROJECT_ID: '80016lrq',
    SANITY_DATASET: 'staging',
    SANITY_READ_TOKEN: 'secret-token',
    ALLOWED_ORIGINS: 'http://localhost:3000',
  }

  const gatewayFetch: typeof fetch = async (input, init) => {
    const req = new Request(
      String(input).startsWith('/') ? `http://localhost:3000${String(input)}` : String(input),
      init,
    )
    return handleGatewayRequest(req, env, {
      getNow: () => new Date('2026-11-15T12:00:00.000Z'),
      fetchImpl: async sanityUrl => {
        const parsedSanityUrl = new URL(String(sanityUrl))
        const query = parsedSanityUrl.searchParams.get('query') ?? ''
        if (query.includes('yearMonth < $upperBoundYearMonth')) {
          const upperBound = JSON.parse(parsedSanityUrl.searchParams.get('$upperBoundYearMonth') ?? '""') as string
          const fetchLimit = JSON.parse(parsedSanityUrl.searchParams.get('$fetchLimit') ?? '12') as number
          const filtered = docs
            .filter(d => d.yearMonth < upperBound)
            .sort((a, b) => (a.yearMonth > b.yearMonth ? -1 : a.yearMonth < b.yearMonth ? 1 : 0))
            .slice(0, fetchLimit)
          return new Response(JSON.stringify({ result: filtered }), { status: 200 })
        }
        const ym = JSON.parse(new URL(String(sanityUrl)).searchParams.get('$yearMonth') ?? '""') as string
        return new Response(
          JSON.stringify({ result: docs.find(d => d.yearMonth === ym) ?? null }),
          { status: 200 },
        )
      },
    })
  }

  const indexProvider = createGatewayLibraryMonthIndexProvider({
    fetchImpl: gatewayFetch,
    resolveTimeZone: () => 'America/New_York',
  })
  const monthProvider = createGatewayMonthProvider({
    fetchImpl: gatewayFetch,
    resolveTimeZone: () => 'America/New_York',
  })

  const page1 = await indexProvider.loadHistoricalMonths({ limit: 1 })
  assert.equal(page1.status, 'ready')
  if (page1.status !== 'ready') return
  assert.deepEqual(
    page1.items.map(i => i.yearMonth),
    ['2026-10'],
  )
  assert.equal(page1.page.hasMore, true)
  assert.equal(page1.page.nextCursor, '2026-10')

  const page2 = await indexProvider.loadHistoricalMonths({
    limit: 1,
    cursor: page1.page.nextCursor!,
  })
  assert.equal(page2.status, 'ready')
  if (page2.status !== 'ready') return
  assert.deepEqual(
    page2.items.map(i => i.yearMonth),
    ['2026-09'],
  )
  assert.equal(page2.page.hasMore, false)
  assert.equal(page2.page.nextCursor, null)

  // Open discovered historical month using existing monthProvider
  const detail = await monthProvider.loadMonth(page1.items[0].yearMonth)
  assert.equal(detail.status, 'ready')
  if (detail.status === 'ready') {
    assert.equal(detail.month.phase, 'historical')
    assert.equal(detail.month.slots[0].availability, 'available')
  }
})

test('libraryMonthIndexProvider has zero gateway/Sanity imports and is independent from App.tsx navigation', () => {
  const providerSource = readFileSync(
    resolve(repositoryRoot, 'src/cms/reader/libraryMonthIndexProvider.ts'),
    'utf8',
  )
  assert.doesNotMatch(providerSource, /from\s+['"][^'"]*gateway/)
  assert.doesNotMatch(providerSource, /SANITY_READ_TOKEN/)
  assert.doesNotMatch(providerSource, /api\.sanity\.io/)

  const appSource = readFileSync(resolve(repositoryRoot, 'src/App.tsx'), 'utf8')
  assert.doesNotMatch(appSource, /libraryMonthIndexProvider/)
})
