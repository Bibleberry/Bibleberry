import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  createGatewayMonthProvider,
  DEFAULT_READER_TIME_ZONE,
  isValidIanaTimeZone,
  MAX_PROGRESS_CHALLENGE_IDS,
  resolveReaderTimeZone,
} from '../../src/cms/reader/monthProvider.ts'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function makeSlots(yearMonth: string, days: number, availableThroughDay = 0) {
  return Array.from({ length: days }, (_, idx) => {
    const dayOfMonth = idx + 1
    const date = `${yearMonth}-${String(dayOfMonth).padStart(2, '0')}`
    if (availableThroughDay > 0 && dayOfMonth <= availableThroughDay) {
      return {
        dayOfMonth,
        date,
        availability: 'available' as const,
        title: `Day ${dayOfMonth} Title`,
        slug: `day-${dayOfMonth}-slug`,
        challengeId: `cms:doc-${yearMonth}-${dayOfMonth}`,
        challengeType: 'teaching' as const,
      }
    }
    return {
      dayOfMonth,
      date,
      availability: 'comingSoon' as const,
      title: `Day ${dayOfMonth} Title`,
    }
  })
}

function makePreviewPayload(yearMonth = '2027-03', days = 31) {
  const year = Number(yearMonth.slice(0, 4))
  const month = Number(yearMonth.slice(5, 7))
  return {
    ok: true,
    serverContext: {
      authorizedLocalDate: '2027-02-27',
      effectiveTimeZone: 'America/New_York',
    },
    month: {
      monthId: yearMonth,
      documentId: `month-${yearMonth}`,
      year,
      month,
      daysInMonth: days,
      phase: 'advancePreview',
      monthStartsOn: `${yearMonth}-01`,
      title: 'Abiding in the Vine',
      subtitle: 'Thirty-one daily studies.',
      introduction: {
        version: 'v1-abc123',
        previewScreens: [
          {
            id: 'intro-1',
            stepLabel: 'Coming in March',
            title: 'Why Jesus speaks of a vineyard',
            blocks: [{ _key: 'b1', _type: 'statementBlock', text: 'Preview text.' }],
          },
        ],
      },
      slots: makeSlots(yearMonth, days, 0),
    },
  }
}

function makeMonthDetailPayload(yearMonth = '2026-11', days = 30, availableThroughDay = 9) {
  const year = Number(yearMonth.slice(0, 4))
  const month = Number(yearMonth.slice(5, 7))
  return {
    ok: true,
    serverContext: {
      authorizedLocalDate: `${yearMonth}-09`,
      effectiveTimeZone: 'America/New_York',
    },
    month: {
      monthId: yearMonth,
      documentId: `month-${yearMonth}`,
      year,
      month,
      daysInMonth: days,
      phase: 'active',
      rosterVersion: 1,
      totalChallenges: days,
      title: 'Gratitude in Ordinary Life',
      introduction: {
        version: 'v1-91d0e4',
        previewScreens: [
          {
            id: 'intro-1',
            stepLabel: 'November Theme',
            title: 'More than a seasonal feeling',
            blocks: [{ _key: 'i1', _type: 'statementBlock', text: 'Intro text.' }],
          },
        ],
        welcomeScreen: {
          id: 'welcome',
          stepLabel: 'Welcome',
          title: 'Welcome to Gratitude in Ordinary Life',
          ctaLabel: 'Explore November',
          blocks: [{ _key: 'w1', _type: 'statementBlock', text: 'Welcome text.' }],
        },
      },
      slots: makeSlots(yearMonth, days, availableThroughDay),
      discoveries: [
        {
          discoveryId: `discovery:${yearMonth}:psalms`,
          kind: 'thematic',
          title: 'Psalms of Thanksgiving',
          targetCount: 3,
        },
        {
          discoveryId: `discovery:${yearMonth}:full-month`,
          kind: 'fullMonth',
          title: 'Complete November',
          targetCount: days,
        },
      ],
    },
  }
}

function makeProgressPayload(yearMonth = '2026-11', total = 30) {
  return {
    ok: true,
    serverContext: {
      authorizedLocalDate: `${yearMonth}-09`,
      effectiveTimeZone: 'America/New_York',
    },
    monthId: yearMonth,
    rosterVersion: 1,
    completedInMonthCount: 3,
    totalChallenges: total,
    thematicEarnedCount: 1,
    thematicTotalCount: 1,
    discoveries: [
      {
        discoveryId: `discovery:${yearMonth}:table-fellowship`,
        kind: 'thematic',
        title: 'Table Fellowship in Luke',
        achievedCount: 2,
        targetCount: 2,
        isEarned: true,
        awardId: `card:monthly:${yearMonth}:table-fellowship`,
        reservedCardId: 'card-table-fellowship',
      },
      {
        discoveryId: `discovery:${yearMonth}:full-month`,
        kind: 'fullMonth',
        title: 'Complete November',
        achievedCount: 3,
        targetCount: total,
        isEarned: false,
      },
    ],
  }
}

function makeNewsPayload() {
  return {
    ok: true,
    serverContext: {
      authorizedLocalDate: '2027-02-27',
      effectiveTimeZone: 'America/New_York',
    },
    articles: [
      {
        id: 'march-2027-preview',
        documentId: 'news-preview-2027-03',
        category: 'monthlyPreview',
        publishedOn: '2027-02-27',
        title: 'Coming in March: Abiding in the Vine',
        summary: 'Preview the upcoming month theme and daily titles.',
        destination: {
          kind: 'month',
          monthId: '2027-03',
        },
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// 1. Timezone header resolution (valid IANA + fallback)
// ---------------------------------------------------------------------------

test('validates IANA timezones and falls back safely to America/New_York', () => {
  assert.equal(isValidIanaTimeZone('America/New_York'), true)
  assert.equal(isValidIanaTimeZone('Asia/Tokyo'), true)
  assert.equal(isValidIanaTimeZone('Pacific/Kiritimati'), true)
  assert.equal(isValidIanaTimeZone('Etc/GMT+12'), true)
  assert.equal(isValidIanaTimeZone('UTC'), true)

  for (const invalid of [
    undefined,
    null,
    '',
    '   ',
    '+05:00',
    '-04:00',
    'UTC+14',
    'GMT-5',
    'Mars/Olympus',
    'America/' + 'x'.repeat(60),
  ]) {
    assert.equal(isValidIanaTimeZone(invalid), false)
    assert.equal(resolveReaderTimeZone(invalid), DEFAULT_READER_TIME_ZONE)
  }

  assert.equal(resolveReaderTimeZone('  Asia/Tokyo  '), 'Asia/Tokyo')
})

test('attaches X-Bibleberry-Timezone header on every request with fallback for invalid zones', async () => {
  const capturedHeaders: Array<{ url: string; timeZone: string | null }> = []
  const mockFetch: typeof fetch = async (input, init) => {
    const url = String(input)
    const headers = new Headers(init?.headers)
    capturedHeaders.push({ url, timeZone: headers.get('X-Bibleberry-Timezone') })

    if (url.endsWith('/preview')) {
      return new Response(JSON.stringify(makePreviewPayload()), { status: 200 })
    }
    if (url.endsWith('/progress')) {
      return new Response(JSON.stringify(makeProgressPayload()), { status: 200 })
    }
    if (url.includes('/api/news')) {
      return new Response(JSON.stringify(makeNewsPayload()), { status: 200 })
    }
    return new Response(JSON.stringify(makeMonthDetailPayload()), { status: 200 })
  }

  const provider = createGatewayMonthProvider({
    fetchImpl: mockFetch,
    resolveTimeZone: () => 'Asia/Tokyo',
  })

  await provider.loadMonthPreview('2027-03')
  await provider.loadMonth('2026-11', { timeZone: 'Pacific/Honolulu' })
  await provider.loadMonthProgress('2026-11', ['cms:doc-1'], { timeZone: '+14:00' })
  await provider.loadNews({ category: 'monthlyPreview', timeZone: 'Mars/Olympus' })

  const undefinedTzProvider = createGatewayMonthProvider({
    fetchImpl: mockFetch,
    resolveTimeZone: () => undefined,
  })
  await undefinedTzProvider.loadMonthPreview('2027-03')

  assert.deepEqual(capturedHeaders, [
    { url: '/api/months/2027-03/preview', timeZone: 'Asia/Tokyo' },
    { url: '/api/months/2026-11', timeZone: 'Pacific/Honolulu' },
    { url: '/api/months/2026-11/progress', timeZone: DEFAULT_READER_TIME_ZONE },
    { url: '/api/news?category=monthlyPreview', timeZone: DEFAULT_READER_TIME_ZONE },
    { url: '/api/months/2027-03/preview', timeZone: DEFAULT_READER_TIME_ZONE },
  ])
})

// ---------------------------------------------------------------------------
// 2. All 4 endpoints happy paths & baseUrl handling
// ---------------------------------------------------------------------------

test('loads month preview, active/historical month, progress, and news using relative or injected baseUrl', async () => {
  const requests: Array<{ url: string; method: string; body?: string }> = []
  const mockFetch: typeof fetch = async (input, init) => {
    const url = String(input)
    requests.push({
      url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? init.body : undefined,
    })

    if (url.endsWith('/preview')) {
      return new Response(JSON.stringify(makePreviewPayload('2027-03', 31)), { status: 200 })
    }
    if (url.endsWith('/progress')) {
      return new Response(JSON.stringify(makeProgressPayload('2026-11', 30)), { status: 200 })
    }
    if (url.endsWith('/api/news')) {
      return new Response(JSON.stringify(makeNewsPayload()), { status: 200 })
    }
    return new Response(JSON.stringify(makeMonthDetailPayload('2026-11', 30, 9)), { status: 200 })
  }

  const provider = createGatewayMonthProvider({
    baseUrl: 'https://gateway.bibleberry.org///',
    fetchImpl: mockFetch,
    resolveTimeZone: () => 'America/New_York',
  })

  const preview = await provider.loadMonthPreview('2027-03')
  assert.equal(preview.status, 'ready')
  if (preview.status === 'ready') {
    assert.equal(preview.month.monthId, '2027-03')
    assert.equal(preview.month.phase, 'advancePreview')
    assert.equal(preview.month.slots.length, 31)
    assert.equal(preview.month.slots[0].availability, 'comingSoon')
  }

  const month = await provider.loadMonth('2026-11', {
    baseUrl: 'https://override.example.com/',
  })
  assert.equal(month.status, 'ready')
  if (month.status === 'ready') {
    assert.equal(month.month.monthId, '2026-11')
    assert.equal(month.month.phase, 'active')
    assert.equal(month.month.slots[8].availability, 'available')
    assert.equal(month.month.slots[9].availability, 'comingSoon')
    assert.equal(month.month.discoveries.length, 2)
  }

  const progress = await provider.loadMonthProgress('2026-11', ['cms:doc-1', 'cms:doc-2'])
  assert.equal(progress.status, 'ready')
  if (progress.status === 'ready') {
    assert.equal(progress.progress.completedInMonthCount, 3)
    assert.equal(progress.progress.discoveries[0].isEarned, true)
    assert.equal(progress.progress.discoveries[1].isEarned, false)
  }

  const news = await provider.loadNews()
  assert.equal(news.status, 'ready')
  if (news.status === 'ready') {
    assert.equal(news.articles.length, 1)
    assert.equal(news.articles[0].destination?.monthId, '2027-03')
  }

  assert.deepEqual(requests, [
    { url: 'https://gateway.bibleberry.org/api/months/2027-03/preview', method: 'GET', body: undefined },
    { url: 'https://override.example.com/api/months/2026-11', method: 'GET', body: undefined },
    {
      url: 'https://gateway.bibleberry.org/api/months/2026-11/progress',
      method: 'POST',
      body: JSON.stringify({ completedChallengeIds: ['cms:doc-1', 'cms:doc-2'] }),
    },
    { url: 'https://gateway.bibleberry.org/api/news', method: 'GET', body: undefined },
  ])
})

// ---------------------------------------------------------------------------
// 3. Invalid yearMonth, HTTP 404, non-2xx, network failure, invalid JSON, AbortSignal
// ---------------------------------------------------------------------------

test('rejects invalid yearMonth locally with validationError and zero network requests', async () => {
  let fetchCalled = false
  const provider = createGatewayMonthProvider({
    fetchImpl: async () => {
      fetchCalled = true
      return new Response(null, { status: 500 })
    },
  })

  for (const badYm of ['', '2026-00', '2026-13', '2026-3', '2026-11-01', '../2026-11']) {
    assert.equal((await provider.loadMonthPreview(badYm)).status, 'validationError')
    assert.equal((await provider.loadMonth(badYm)).status, 'validationError')
    assert.equal((await provider.loadMonthProgress(badYm, ['cms:doc-1'])).status, 'validationError')
  }
  assert.equal(fetchCalled, false)
})

test('maps HTTP 404 to neutral notFound and non-2xx / network errors to requestError without Sanity fallback', async () => {
  const provider404 = createGatewayMonthProvider({
    fetchImpl: async () =>
      new Response(JSON.stringify({ ok: false, error: { kind: 'notFound', message: 'Month not found' } }), {
        status: 404,
      }),
  })
  assert.equal((await provider404.loadMonthPreview('2099-01')).status, 'notFound')
  assert.equal((await provider404.loadMonth('2099-01')).status, 'notFound')
  assert.equal((await provider404.loadMonthProgress('2099-01', ['cms:doc-1'])).status, 'notFound')

  for (const status of [400, 403, 500, 502, 503]) {
    const providerErr = createGatewayMonthProvider({
      fetchImpl: async () => new Response('error', { status }),
    })
    assert.equal((await providerErr.loadMonth('2026-11')).status, 'requestError')
    assert.equal((await providerErr.loadNews()).status, 'requestError')
  }

  const providerNetErr = createGatewayMonthProvider({
    fetchImpl: async () => {
      throw new Error('Network unreachable')
    },
  })
  const netResult = await providerNetErr.loadMonthPreview('2027-03')
  assert.equal(netResult.status, 'requestError')
  if (netResult.status === 'requestError') {
    assert.equal(netResult.message, 'Network unreachable')
  }
})

test('returns validationError for invalid JSON or malformed gateway envelopes and propagates AbortError', async () => {
  const badJsonProvider = createGatewayMonthProvider({
    fetchImpl: async () => new Response('<html>Bad Gateway</html>', { status: 200 }),
  })
  assert.equal((await badJsonProvider.loadMonth('2026-11')).status, 'validationError')
  assert.equal((await badJsonProvider.loadNews()).status, 'validationError')

  for (const envelope of [null, {}, { ok: false }, { ok: true, month: null }, { ok: true, articles: 'bad' }]) {
    const badEnvelopeProvider = createGatewayMonthProvider({
      fetchImpl: async () => new Response(JSON.stringify(envelope), { status: 200 }),
    })
    assert.equal((await badEnvelopeProvider.loadMonthPreview('2027-03')).status, 'validationError')
    assert.equal((await badEnvelopeProvider.loadMonth('2026-11')).status, 'validationError')
    assert.equal((await badEnvelopeProvider.loadMonthProgress('2026-11', [])).status, 'validationError')
    assert.equal((await badEnvelopeProvider.loadNews()).status, 'validationError')
  }

  const controller = new AbortController()
  controller.abort()
  const abortProvider = createGatewayMonthProvider({
    fetchImpl: async (_input, init) => {
      if (init?.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }
      return new Response(JSON.stringify(makeMonthDetailPayload()), { status: 200 })
    },
  })
  await assert.rejects(
    async () => providerLoadWithAbort(abortProvider, controller.signal),
    (err: unknown) => err instanceof DOMException && err.name === 'AbortError',
  )
})

async function providerLoadWithAbort(
  provider: ReturnType<typeof createGatewayMonthProvider>,
  signal: AbortSignal,
) {
  return provider.loadMonth('2026-11', { signal })
}

// ---------------------------------------------------------------------------
// 4. Privacy / embargo guardrails & POST payload filtering + 500-ID ceiling
// ---------------------------------------------------------------------------

test('fails closed on leaked embargoed or private fields across preview, month, progress, and news', async () => {
  // Preview leaking welcomeScreen
  const leakedWelcome = makePreviewPayload('2027-03', 31)
  ;(leakedWelcome.month.introduction as Record<string, unknown>).welcomeScreen = {
    id: 'welcome',
    blocks: [{ _key: 'w1', _type: 'statementBlock', text: 'Leaked' }],
  }
  const p1 = createGatewayMonthProvider({
    fetchImpl: async () => new Response(JSON.stringify(leakedWelcome), { status: 200 }),
  })
  assert.equal((await p1.loadMonthPreview('2027-03')).status, 'validationError')

  // Preview slot leaking slug
  const leakedPreviewSlot = makePreviewPayload('2027-03', 31)
  ;(leakedPreviewSlot.month.slots[0] as Record<string, unknown>).slug = 'secret-slug'
  const p2 = createGatewayMonthProvider({
    fetchImpl: async () => new Response(JSON.stringify(leakedPreviewSlot), { status: 200 }),
  })
  assert.equal((await p2.loadMonthPreview('2027-03')).status, 'validationError')

  // Month detail comingSoon slot leaking challengeId
  const leakedDetailSlot = makeMonthDetailPayload('2026-11', 30, 9)
  ;(leakedDetailSlot.month.slots[9] as Record<string, unknown>).challengeId = 'cms:future-secret'
  const p3 = createGatewayMonthProvider({
    fetchImpl: async () => new Response(JSON.stringify(leakedDetailSlot), { status: 200 }),
  })
  assert.equal((await p3.loadMonth('2026-11')).status, 'validationError')

  // Month detail discovery leaking qualifyingChallenges
  const leakedDiscovery = makeMonthDetailPayload('2026-11', 30, 9)
  ;(leakedDiscovery.month.discoveries[0] as Record<string, unknown>).qualifyingChallenges = ['cms:doc-1']
  const p4 = createGatewayMonthProvider({
    fetchImpl: async () => new Response(JSON.stringify(leakedDiscovery), { status: 200 }),
  })
  assert.equal((await p4.loadMonth('2026-11')).status, 'validationError')

  // Progress discovery leaking reservedCardId / earnedCard while isEarned is false
  const leakedProgress = makeProgressPayload('2026-11', 30)
  ;(leakedProgress.discoveries[1] as Record<string, unknown>).earnedCard = {
    fullImageUrl: 'https://cdn.sanity.io/images/secret.png',
  }
  const p5 = createGatewayMonthProvider({
    fetchImpl: async () => new Response(JSON.stringify(leakedProgress), { status: 200 }),
  })
  assert.equal((await p5.loadMonthProgress('2026-11', ['cms:doc-1'])).status, 'validationError')

  // monthlyPreview News leaking body
  const leakedNews = makeNewsPayload()
  ;(leakedNews.articles[0] as Record<string, unknown>).body = [{ _key: 'b1', _type: 'block' }]
  const p6 = createGatewayMonthProvider({
    fetchImpl: async () => new Response(JSON.stringify(leakedNews), { status: 200 }),
  })
  assert.equal((await p6.loadNews({ category: 'monthlyPreview' })).status, 'validationError')
})

test('POST progress sends exact canonical cms: payload, filters non-cms values, and enforces 500-ID ceiling', async () => {
  let capturedBody: unknown = null
  let fetchCount = 0
  const provider = createGatewayMonthProvider({
    fetchImpl: async (_input, init) => {
      fetchCount += 1
      capturedBody = JSON.parse(String(init?.body))
      return new Response(JSON.stringify(makeProgressPayload('2026-11', 30)), { status: 200 })
    },
  })

  // Filters non-cms IDs, blanks, control chars, and deduplicates
  const dirtyInputs = [
    '  cms:doc-a  ',
    'cms:doc-a',
    'pilot:should-not-send',
    'raw-doc-without-prefix',
    'cms:',
    'cms:bad\nid',
    'cms:doc-b',
  ]
  const cleanRes = await provider.loadMonthProgress('2026-11', dirtyInputs)
  assert.equal(cleanRes.status, 'ready')
  assert.deepEqual(capturedBody, {
    completedChallengeIds: ['cms:doc-a', 'cms:doc-b'],
  })
  assert.equal(fetchCount, 1)

  // Exactly 500 unique cms: IDs succeeds
  const exactly500 = Array.from({ length: MAX_PROGRESS_CHALLENGE_IDS }, (_, i) => `cms:doc-${i}`)
  const res500 = await provider.loadMonthProgress('2026-11', exactly500)
  assert.equal(res500.status, 'ready')
  assert.equal(fetchCount, 2)

  // 501 unique cms: IDs fails closed locally without making a network request
  const over500 = Array.from({ length: MAX_PROGRESS_CHALLENGE_IDS + 1 }, (_, i) => `cms:doc-${i}`)
  const res501 = await provider.loadMonthProgress('2026-11', over500)
  assert.equal(res501.status, 'validationError')
  assert.equal(fetchCount, 2)
})

test('monthProvider contains zero imports of src/gateway/, zero SANITY_READ_TOKEN, and no direct Sanity fallback', () => {
  const source = readFileSync(resolve(repositoryRoot, 'src/cms/reader/monthProvider.ts'), 'utf8')
  assert.doesNotMatch(source, /from\s+['"][^'"]*gateway/)
  assert.doesNotMatch(source, /SANITY_READ_TOKEN/)
  assert.doesNotMatch(source, /api\.sanity\.io/)
})
