import assert from 'node:assert/strict'
import test from 'node:test'
import { handleGatewayRequest } from '../../src/gateway/handler.ts'
import { daysInMonth, formatCivilDate } from '../../src/gateway/localRelease.ts'
import { handleWorkerRequest } from '../../src/gateway/worker.ts'
import type { GatewayEnv, GatewayFetch } from '../../src/gateway/types.ts'

const TEST_ENV: GatewayEnv = {
  SANITY_PROJECT_ID: '80016lrq',
  SANITY_DATASET: 'staging',
  SANITY_READ_TOKEN: 'test-reader-token-secret-12345',
  ALLOWED_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
}

function createMockFetch(
  handler: (url: URL, init?: RequestInit) => Response | Promise<Response>,
): GatewayFetch {
  return async (input, init) => {
    const url =
      typeof input === 'string'
        ? new URL(input)
        : input instanceof URL
          ? input
          : new URL(input.url)
    return handler(url, init)
  }
}

function makeChallengeForSlot(
  yearMonth: string,
  dayOfMonth: number,
  overrides: Record<string, unknown> = {},
) {
  const padded = String(dayOfMonth).padStart(2, '0')
  const id = `r08a-stg-${yearMonth}-day-${padded}`
  return {
    _id: id,
    _type: 'challenge',
    title: `SECRET_DAY_TITLE_${yearMonth}_${padded}`,
    slug: `day-${padded}-${yearMonth}`,
    challengeType: 'teaching',
    withdrawn: false,
    editorialEligibility: {
      adaptationReviewed: true,
      reviewedAt: '2026-01-15T12:00:00.000Z',
    },
    unapprovedBlockCount: 0,
    primaryScripture: {
      reference: `Psalm 23:${(dayOfMonth % 6) + 1}`,
      translation: 'WEBP',
      textStatus: 'referenceOnly',
      usageRightsConfirmed: false,
      practiceStatus: 'notConfigured',
    },
    assignedMonthIds: [`month-${yearMonth}`],
    ...overrides,
  }
}

function makeMonthlyPublicationDoc(
  yearMonth: string,
  overrides: Record<string, unknown> = {},
) {
  const year = Number(yearMonth.slice(0, 4))
  const month = Number(yearMonth.slice(5, 7))
  const count = daysInMonth(year, month)

  const slots = Array.from({ length: count }, (_, index) => {
    const day = index + 1
    const padded = String(day).padStart(2, '0')
    const challenge = makeChallengeForSlot(yearMonth, day)
    return {
      _key: `day-${padded}`,
      dayOfMonth: day,
      date: formatCivilDate(year, month, day),
      slotStatus: 'scheduled',
      rawChallengeRef: challenge._id,
      challenge,
    }
  })

  const finalizedChallengeIds = slots.map(s => s.challenge._id)

  return {
    _id: `month-${yearMonth}`,
    _type: 'monthlyPublication',
    yearMonth,
    year,
    month,
    title: `Theme for ${yearMonth}`,
    subtitle: `Approved subtitle for ${yearMonth}`,
    coverImage: {
      url: `https://cdn.sanity.io/images/80016lrq/staging/cover-${yearMonth}.png`,
      alt: `Cover illustration for ${yearMonth}`,
    },
    editorialStatus: 'scheduled',
    withdrawn: false,
    editorialReview: {
      reviewedBy: 'Aaron Waid (technical synthetic approval)',
      reviewerRole: 'technical_synthetic',
      reviewedAt: '2026-01-15T14:00:00.000Z',
      reviewNotes: 'PRIVATE_EDITORIAL_NOTE_DO_NOT_LEAK',
    },
    introduction: {
      previewScreens: [
        {
          _key: 'intro-1',
          _type: 'introductionScreen',
          screenLabel: 'Preview',
          heading: `PRIVATE_INTRO_HEADING_${yearMonth}`,
          blocks: [
            {
              _key: 'intro-1-b1',
              _type: 'statementBlock',
              text: 'PRIVATE_INTRO_BODY_DO_NOT_LEAK',
            },
          ],
        },
      ],
      welcomeScreen: {
        _key: 'welcome',
        _type: 'introductionScreen',
        screenLabel: 'Welcome',
        heading: `PRIVATE_WELCOME_HEADING_${yearMonth}`,
        ctaLabel: 'Open Calendar',
        blocks: [
          {
            _key: 'welcome-b1',
            _type: 'statementBlock',
            text: 'PRIVATE_WELCOME_BODY_DO_NOT_LEAK',
          },
        ],
      },
    },
    slots,
    rosterFinalization: {
      isFinalized: true,
      rosterVersion: 1,
      finalizedAt: '2026-01-16T10:00:00.000Z',
      finalizedBy: 'Aaron Waid',
      finalizedChallengeIds,
    },
    discoveries: [
      {
        _key: 'shepherd-theme',
        discoverySlug: 'shepherd-theme',
        title: 'PRIVATE_DISCOVERY_TITLE',
        qualifyingChallengeIds: [finalizedChallengeIds[0], finalizedChallengeIds[2]],
        reservedCardId: `card-${yearMonth}-shepherd-theme`,
        rawCardRef: `card-${yearMonth}-shepherd-theme`,
        card: {
          _id: `card-${yearMonth}-shepherd-theme`,
          _type: 'scriptureCard',
          title: 'UNEARNED_CARD_TITLE_DO_NOT_LEAK',
          slug: `${yearMonth}-shepherd-theme`,
          cardCategory: 'monthlyThematic',
          plannedYearMonth: yearMonth,
          assetRevision: 'v1',
          artwork: {
            url: `https://cdn.sanity.io/images/80016lrq/staging/unearned-card-${yearMonth}.png`,
          },
          illustrationAlt: 'UNEARNED_CARD_ALT_DO_NOT_LEAK',
          accessibleTranscription: 'UNEARNED_CARD_TRANSCRIPTION_DO_NOT_LEAK',
          scriptureCitation: {
            book: 'Psalms',
            reference: 'Psalm 23:1',
            translation: 'WEBP',
            usageRightsConfirmed: true,
          },
          rightsAndAttribution: {
            attribution: 'Bibleberry',
            rightsStatus: 'approved-ministry-use',
            usageRightsConfirmed: true,
          },
          editorialStatus: 'approved',
          withdrawn: false,
          editorialReview: {
            reviewedBy: 'Aaron Waid',
            reviewerRole: 'technical_synthetic',
            reviewedAt: '2026-01-15T14:00:00.000Z',
          },
        },
      },
    ],
    fullMonthCard: {
      title: `Complete ${yearMonth}`,
      reservedCardId: `card-${yearMonth}-full-month`,
    },
    ...overrides,
  }
}

test('GET /api/library/months returns authorized historical month A while excluding current B, future/unpublished C, and withdrawn D', async () => {
  const historicalA = makeMonthlyPublicationDoc('2026-10')
  const currentB = makeMonthlyPublicationDoc('2026-11', {
    title: 'CURRENT_MONTH_B_EXCLUDED',
  })
  const futureC = makeMonthlyPublicationDoc('2026-12', {
    title: 'FUTURE_MONTH_C_EXCLUDED',
  })
  const draftStatusC = makeMonthlyPublicationDoc('2026-09', {
    editorialStatus: 'approved',
    title: 'UNSCHEDULED_MONTH_EXCLUDED',
  })
  const unreviewedC = makeMonthlyPublicationDoc('2026-08', {
    editorialReview: { reviewerRole: 'technical_synthetic' },
    title: 'UNREVIEWED_MONTH_EXCLUDED',
  })
  const unfinalizedC = makeMonthlyPublicationDoc('2026-07', {
    rosterFinalization: {
      isFinalized: false,
      rosterVersion: 1,
      finalizedChallengeIds: [],
    },
    title: 'UNFINALIZED_MONTH_EXCLUDED',
  })
  const withdrawnD = makeMonthlyPublicationDoc('2026-06', {
    withdrawn: true,
    title: 'WITHDRAWN_MONTH_D_EXCLUDED',
  })

  const allDocs = [
    futureC,
    currentB,
    historicalA,
    draftStatusC,
    unreviewedC,
    unfinalizedC,
    withdrawnD,
  ]

  let capturedUrl: URL | null = null
  const mockFetch = createMockFetch(url => {
    capturedUrl = url
    return new Response(JSON.stringify({ result: allDocs }), { status: 200 })
  })

  // Reader date is 2026-11-29 (when 2026-12 is already in advance preview, 2026-11 is active, and 2026-10 is historical)
  const res = await handleWorkerRequest(
    new Request('http://localhost:3000/api/library/months', {
      method: 'GET',
      headers: {
        Origin: 'http://localhost:3000',
        'X-Bibleberry-Timezone': 'America/New_York',
      },
    }),
    TEST_ENV,
    { getNow: () => new Date('2026-11-29T18:00:00.000Z'), fetchImpl: mockFetch },
  )

  assert.equal(res.status, 200)
  assert.equal(res.headers.get('Cache-Control'), 'no-store')
  assert.equal(res.headers.get('Vary'), 'Origin, X-Bibleberry-Timezone')
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'http://localhost:3000')

  // Verify Sanity query enforcement
  assert.equal(capturedUrl?.searchParams.get('perspective'), 'published')
  assert.equal(capturedUrl?.searchParams.get('$upperBoundYearMonth'), JSON.stringify('2026-11'))
  const queryText = capturedUrl?.searchParams.get('query') ?? ''
  assert.equal(queryText.includes('!(_id in path("drafts.**"))'), true)
  assert.equal(queryText.includes('!(_id in path("versions.**"))'), true)

  const rawText = await res.text()
  // Negative confidentiality checks: zero leaked titles, bodies, card art, Sanity IDs, or editorial fields
  for (const forbidden of [
    'CURRENT_MONTH_B_EXCLUDED',
    'FUTURE_MONTH_C_EXCLUDED',
    'UNSCHEDULED_MONTH_EXCLUDED',
    'UNREVIEWED_MONTH_EXCLUDED',
    'UNFINALIZED_MONTH_EXCLUDED',
    'WITHDRAWN_MONTH_D_EXCLUDED',
    'SECRET_DAY_TITLE_',
    'PRIVATE_EDITORIAL_NOTE_DO_NOT_LEAK',
    'PRIVATE_INTRO_',
    'PRIVATE_WELCOME_',
    'PRIVATE_DISCOVERY_TITLE',
    'UNEARNED_CARD_',
    'unearned-card-',
    'month-2026-10',
    'r08a-stg-',
    'card-2026-10',
    'editorialStatus',
    'editorialReview',
    'qualifyingChallenge',
    'rosterFinalization',
    'test-reader-token-secret-12345',
  ]) {
    assert.equal(rawText.includes(forbidden), false, `Response leaked forbidden token: ${forbidden}`)
  }

  const body = JSON.parse(rawText) as {
    ok: boolean
    serverContext: { authorizedLocalDate: string; effectiveTimeZone: string }
    items: Array<Record<string, unknown>>
    page: { limit: number; hasMore: boolean; nextCursor: string | null }
  }
  assert.equal(body.ok, true)
  assert.deepEqual(body.serverContext, {
    authorizedLocalDate: '2026-11-29',
    effectiveTimeZone: 'America/New_York',
  })
  assert.equal(body.items.length, 1)
  assert.deepEqual(body.items[0], {
    yearMonth: '2026-10',
    year: 2026,
    month: 10,
    title: 'Theme for 2026-10',
    subtitle: 'Approved subtitle for 2026-10',
    coverImage: {
      url: 'https://cdn.sanity.io/images/80016lrq/staging/cover-2026-10.png',
      alt: 'Cover illustration for 2026-10',
    },
  })
  assert.deepEqual(Object.keys(body.items[0]).sort(), [
    'coverImage',
    'month',
    'subtitle',
    'title',
    'year',
    'yearMonth',
  ])
  assert.deepEqual(body.page, {
    limit: 12,
    hasMore: false,
    nextCursor: null,
  })
})

test('respects accepted distinction between advance preview and historical Library, and keeps historical month detail + challenge reading intact', async () => {
  const oct2026 = makeMonthlyPublicationDoc('2026-10')
  const nov2026 = makeMonthlyPublicationDoc('2026-11')
  const dec2026 = makeMonthlyPublicationDoc('2026-12')
  const octSlot1 = oct2026.slots[0].challenge

  const mockFetch = createMockFetch(url => {
    const query = url.searchParams.get('query') ?? ''
    if (query.includes('yearMonth < $upperBoundYearMonth')) {
      return new Response(JSON.stringify({ result: [dec2026, nov2026, oct2026] }), { status: 200 })
    }
    if (query.includes('_id == $monthDocId')) {
      const ym = JSON.parse(url.searchParams.get('$yearMonth') ?? '""') as string
      const map: Record<string, unknown> = { '2026-10': oct2026, '2026-11': nov2026, '2026-12': dec2026 }
      return new Response(JSON.stringify({ result: map[ym] ?? null }), { status: 200 })
    }
    if (query.includes('slug.current == $slug')) {
      return new Response(
        JSON.stringify({
          result: {
            ...octSlot1,
            screens: [
              {
                _key: 's1',
                _type: 'challengeScreen',
                screenLabel: 'Step 1',
                heading: 'Historical Teaching',
                blocks: [{ _key: 'b1', _type: 'statementBlock', text: 'Historical body.' }],
              },
            ],
            monthlyAssignments: [
              {
                _id: 'month-2026-10',
                yearMonth: '2026-10',
                year: 2026,
                month: 10,
                title: 'Theme for 2026-10',
                editorialStatus: 'scheduled',
                withdrawn: false,
                slots: [
                  {
                    _key: 'day-01',
                    dayOfMonth: 1,
                    date: '2026-10-01',
                    slotStatus: 'scheduled',
                    challengeRef: octSlot1._id,
                  },
                ],
              },
            ],
          },
        }),
        { status: 200 },
      )
    }
    return new Response(JSON.stringify({ result: null }), { status: 200 })
  })

  const now = () => new Date('2026-11-29T18:00:00.000Z')

  // 1. Advance preview of 2026-12 is 200 on Nov 29
  const previewRes = await handleGatewayRequest(
    new Request('http://localhost/api/months/2026-12/preview', {
      headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
    }),
    TEST_ENV,
    { getNow: now, fetchImpl: mockFetch },
  )
  assert.equal(previewRes.status, 200)

  // 2. Historical Library on Nov 29 returns ONLY 2026-10 (excludes active 2026-11 and preview 2026-12)
  const libRes = await handleGatewayRequest(
    new Request('http://localhost/api/library/months', {
      headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
    }),
    TEST_ENV,
    { getNow: now, fetchImpl: mockFetch },
  )
  assert.equal(libRes.status, 200)
  const libBody = (await libRes.json()) as { items: Array<{ yearMonth: string }> }
  assert.deepEqual(
    libBody.items.map(i => i.yearMonth),
    ['2026-10'],
  )

  // 3. Discovered historical month opens normally via GET /api/months/:yearMonth and GET /api/challenges/:slug
  const monthDetailRes = await handleGatewayRequest(
    new Request(`http://localhost/api/months/${libBody.items[0].yearMonth}`, {
      headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
    }),
    TEST_ENV,
    { getNow: now, fetchImpl: mockFetch },
  )
  assert.equal(monthDetailRes.status, 200)
  const detailBody = (await monthDetailRes.json()) as {
    month: { phase: string; slots: Array<{ availability: string; slug?: string }> }
  }
  assert.equal(detailBody.month.phase, 'historical')
  assert.equal(detailBody.month.slots[0].availability, 'available')

  const chRes = await handleGatewayRequest(
    new Request(`http://localhost/api/challenges/${detailBody.month.slots[0].slug}`, {
      headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
    }),
    TEST_ENV,
    { getNow: now, fetchImpl: mockFetch },
  )
  assert.equal(chRes.status, 200)
})

test('enforces New Year boundary, DST transitions, timezone fallback, and ignores spoofed Date header', async () => {
  const nov2026 = makeMonthlyPublicationDoc('2026-11')
  const dec2026 = makeMonthlyPublicationDoc('2026-12')
  const jan2027 = makeMonthlyPublicationDoc('2027-01')
  const oct2026 = makeMonthlyPublicationDoc('2026-10')
  const mar2027 = makeMonthlyPublicationDoc('2027-03')

  const mockFetch = createMockFetch(() =>
    new Response(JSON.stringify({ result: [mar2027, jan2027, dec2026, nov2026, oct2026] }), {
      status: 200,
    }),
  )

  // New Year boundary across timezones at 2027-01-01T02:00:00Z:
  // - Tokyo is 2027-01-01 -> 2026-12 IS historical
  // - New York (and invalid header fallback) is 2026-12-31 -> 2026-12 is current (excluded), 2026-11 IS historical
  {
    const nyRes = await handleGatewayRequest(
      new Request('http://localhost/api/library/months', {
        headers: {
          'X-Bibleberry-Timezone': 'America/New_York',
          Date: 'Thu, 01 Jan 2099 00:00:00 GMT',
        },
      }),
      TEST_ENV,
      { getNow: () => new Date('2027-01-01T02:00:00.000Z'), fetchImpl: mockFetch },
    )
    assert.equal(nyRes.status, 200)
    const nyBody = (await nyRes.json()) as {
      serverContext: { authorizedLocalDate: string; effectiveTimeZone: string }
      items: Array<{ yearMonth: string }>
    }
    assert.deepEqual(nyBody.serverContext, {
      authorizedLocalDate: '2026-12-31',
      effectiveTimeZone: 'America/New_York',
    })
    assert.deepEqual(
      nyBody.items.map(i => i.yearMonth),
      ['2026-11', '2026-10'],
    )

    const tokyoRes = await handleGatewayRequest(
      new Request('http://localhost/api/library/months', {
        headers: { 'X-Bibleberry-Timezone': 'Asia/Tokyo' },
      }),
      TEST_ENV,
      { getNow: () => new Date('2027-01-01T02:00:00.000Z'), fetchImpl: mockFetch },
    )
    assert.equal(tokyoRes.status, 200)
    const tokyoBody = (await tokyoRes.json()) as {
      serverContext: { authorizedLocalDate: string; effectiveTimeZone: string }
      items: Array<{ yearMonth: string }>
    }
    assert.deepEqual(tokyoBody.serverContext, {
      authorizedLocalDate: '2027-01-01',
      effectiveTimeZone: 'Asia/Tokyo',
    })
    assert.deepEqual(
      tokyoBody.items.map(i => i.yearMonth),
      ['2026-12', '2026-11', '2026-10'],
    )
  }

  // Exact NY New Year midnight: 04:59:59.999Z vs 05:00:00.000Z
  {
    const beforeMidnight = await handleGatewayRequest(
      new Request('http://localhost/api/library/months', {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      TEST_ENV,
      { getNow: () => new Date('2027-01-01T04:59:59.999Z'), fetchImpl: mockFetch },
    )
    const beforeItems = ((await beforeMidnight.json()) as { items: Array<{ yearMonth: string }> }).items
    assert.equal(beforeItems.some(i => i.yearMonth === '2026-12'), false)

    const atMidnight = await handleGatewayRequest(
      new Request('http://localhost/api/library/months', {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      TEST_ENV,
      { getNow: () => new Date('2027-01-01T05:00:00.000Z'), fetchImpl: mockFetch },
    )
    const atItems = ((await atMidnight.json()) as { items: Array<{ yearMonth: string }> }).items
    assert.equal(atItems[0].yearMonth, '2026-12')
  }

  // Invalid timezone headers fall back deterministically to America/New_York
  for (const badTz of ['', '   ', 'Mars/Olympus', '+14:00', 'UTC+9', `America/${'x'.repeat(60)}`]) {
    const res = await handleGatewayRequest(
      new Request('http://localhost/api/library/months', {
        headers: { 'X-Bibleberry-Timezone': badTz },
      }),
      TEST_ENV,
      { getNow: () => new Date('2027-01-01T02:00:00.000Z'), fetchImpl: mockFetch },
    )
    assert.equal(res.status, 200)
    const body = (await res.json()) as {
      serverContext: { authorizedLocalDate: string; effectiveTimeZone: string }
      items: Array<{ yearMonth: string }>
    }
    assert.deepEqual(body.serverContext, {
      authorizedLocalDate: '2026-12-31',
      effectiveTimeZone: 'America/New_York',
    })
    assert.equal(body.items.some(i => i.yearMonth === '2026-12'), false)
  }

  // Fall DST boundary (EDT UTC-4 on 2026-11-01 00:00 local == 04:00Z, not 05:00Z)
  {
    const beforeDstBoundary = await handleGatewayRequest(
      new Request('http://localhost/api/library/months', {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      TEST_ENV,
      { getNow: () => new Date('2026-11-01T03:59:59.999Z'), fetchImpl: mockFetch },
    )
    const beforeBody = (await beforeDstBoundary.json()) as { items: Array<{ yearMonth: string }> }
    assert.deepEqual(beforeBody.items, [])

    const atDstBoundary = await handleGatewayRequest(
      new Request('http://localhost/api/library/months', {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      TEST_ENV,
      { getNow: () => new Date('2026-11-01T04:00:00.000Z'), fetchImpl: mockFetch },
    )
    const atBody = (await atDstBoundary.json()) as { items: Array<{ yearMonth: string }> }
    assert.deepEqual(
      atBody.items.map(i => i.yearMonth),
      ['2026-10'],
    )
  }

  // Post-Spring DST boundary (EDT UTC-4 on 2027-04-01 00:00 local == 04:00Z)
  {
    const beforeApr = await handleGatewayRequest(
      new Request('http://localhost/api/library/months', {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      TEST_ENV,
      { getNow: () => new Date('2027-04-01T03:59:59.999Z'), fetchImpl: mockFetch },
    )
    const beforeAprItems = ((await beforeApr.json()) as { items: Array<{ yearMonth: string }> }).items
    assert.equal(beforeAprItems.some(i => i.yearMonth === '2027-03'), false)

    const atApr = await handleGatewayRequest(
      new Request('http://localhost/api/library/months', {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      TEST_ENV,
      { getNow: () => new Date('2027-04-01T04:00:00.000Z'), fetchImpl: mockFetch },
    )
    const atAprItems = ((await atApr.json()) as { items: Array<{ yearMonth: string }> }).items
    assert.equal(atAprItems[0].yearMonth, '2027-03')
  }
})

test('paginates deterministically newest-historical-first across cursors, even when upstream is unsorted or omits invalid months', async () => {
  const m1 = makeMonthlyPublicationDoc('2026-06')
  const m2 = makeMonthlyPublicationDoc('2026-07')
  const invalidMiddle = makeMonthlyPublicationDoc('2026-08', {
    withdrawn: true, // excluded in middle of sequence
  })
  const m3 = makeMonthlyPublicationDoc('2026-09')
  const m4 = makeMonthlyPublicationDoc('2026-10')
  const m5 = makeMonthlyPublicationDoc('2026-11')

  // Return unsorted + include invalid middle month; simulate GROQ filtering by $upperBoundYearMonth
  const allDocs = [m2, m4, invalidMiddle, m1, m5, m3]
  const mockFetch = createMockFetch(url => {
    const upperBound = JSON.parse(url.searchParams.get('$upperBoundYearMonth') ?? '""') as string
    const fetchLimit = JSON.parse(url.searchParams.get('$fetchLimit') ?? '50') as number
    assert.equal(fetchLimit <= 50, true)

    // Intentionally return unsorted on page 1 to verify gateway deterministic sorting,
    // while still respecting upperBound slice like Sanity GROQ would.
    const filtered = allDocs
      .filter(d => d.yearMonth < upperBound)
      .sort((a, b) => (a.yearMonth > b.yearMonth ? -1 : 1))
      .slice(0, fetchLimit)
    // Shuffle order slightly to verify gateway sorts deterministically
    const reversed = [...filtered].reverse()
    return new Response(JSON.stringify({ result: reversed }), { status: 200 })
  })

  const now = () => new Date('2026-12-10T12:00:00.000Z')

  // Page 1: limit=2 -> [2026-11, 2026-10], hasMore=true, nextCursor='2026-10'
  const page1Res = await handleGatewayRequest(
    new Request('http://localhost/api/library/months?limit=2'),
    TEST_ENV,
    { getNow: now, fetchImpl: mockFetch },
  )
  assert.equal(page1Res.status, 200)
  const page1 = (await page1Res.json()) as {
    items: Array<{ yearMonth: string }>
    page: { limit: number; hasMore: boolean; nextCursor: string | null }
  }
  assert.deepEqual(
    page1.items.map(i => i.yearMonth),
    ['2026-11', '2026-10'],
  )
  assert.deepEqual(page1.page, { limit: 2, hasMore: true, nextCursor: '2026-10' })

  // Page 2: limit=2&cursor=2026-10 -> omits withdrawn 2026-08, returns [2026-09, 2026-07], hasMore=true, nextCursor='2026-07'
  const page2Res = await handleGatewayRequest(
    new Request(`http://localhost/api/library/months?limit=2&cursor=${page1.page.nextCursor}`),
    TEST_ENV,
    { getNow: now, fetchImpl: mockFetch },
  )
  assert.equal(page2Res.status, 200)
  const page2 = (await page2Res.json()) as typeof page1
  assert.deepEqual(
    page2.items.map(i => i.yearMonth),
    ['2026-09', '2026-07'],
  )
  assert.deepEqual(page2.page, { limit: 2, hasMore: true, nextCursor: '2026-07' })

  // Page 3: limit=2&cursor=2026-07 -> [2026-06], hasMore=false, nextCursor=null
  const page3Res = await handleGatewayRequest(
    new Request(`http://localhost/api/library/months?limit=2&cursor=${page2.page.nextCursor}`),
    TEST_ENV,
    { getNow: now, fetchImpl: mockFetch },
  )
  assert.equal(page3Res.status, 200)
  const page3 = (await page3Res.json()) as typeof page1
  assert.deepEqual(
    page3.items.map(i => i.yearMonth),
    ['2026-06'],
  )
  assert.deepEqual(page3.page, { limit: 2, hasMore: false, nextCursor: null })

  // Page past oldest -> empty 200 with hasMore=false, nextCursor=null
  const emptyRes = await handleGatewayRequest(
    new Request('http://localhost/api/library/months?limit=2&cursor=2026-06'),
    TEST_ENV,
    { getNow: now, fetchImpl: mockFetch },
  )
  assert.equal(emptyRes.status, 200)
  const emptyPage = (await emptyRes.json()) as typeof page1
  assert.deepEqual(emptyPage.items, [])
  assert.deepEqual(emptyPage.page, { limit: 2, hasMore: false, nextCursor: null })

  // Future cursor (?cursor=2099-12) still clamps strictly to < currentYearMonth (2026-12)
  const futureCursorRes = await handleGatewayRequest(
    new Request('http://localhost/api/library/months?limit=2&cursor=2099-12'),
    TEST_ENV,
    { getNow: now, fetchImpl: mockFetch },
  )
  assert.equal(futureCursorRes.status, 200)
  const futureCursorPage = (await futureCursorRes.json()) as typeof page1
  assert.deepEqual(
    futureCursorPage.items.map(i => i.yearMonth),
    ['2026-11', '2026-10'],
  )
})

test('rejects malformed query parameters and cursors with 400 badRequest and safe headers', async () => {
  let fetchCalled = false
  const mockFetch = createMockFetch(() => {
    fetchCalled = true
    return new Response(JSON.stringify({ result: [] }), { status: 200 })
  })

  const invalidQueries = [
    '?limit=0',
    '?limit=-1',
    '?limit=25',
    '?limit=100',
    '?limit=abc',
    '?limit=1.5',
    '?limit=+5',
    '?limit=',
    '?limit=5&limit=10',
    '?cursor=',
    '?cursor=invalid',
    '?cursor=2026-00',
    '?cursor=2026-13',
    '?cursor=2026-10-01',
    '?cursor=2026-1',
    '?cursor=2026-10&cursor=2026-09',
    '?offset=10',
    '?page=1',
    '?drafts=true',
    '?now=2099-01-01',
  ]

  for (const query of invalidQueries) {
    const res = await handleGatewayRequest(
      new Request(`http://localhost/api/library/months${query}`),
      TEST_ENV,
      { getNow: () => new Date('2026-12-10T12:00:00.000Z'), fetchImpl: mockFetch },
    )
    assert.equal(res.status, 400, `Expected 400 for query ${query}`)
    assert.equal(res.headers.get('Cache-Control'), 'no-store')
    assert.equal(res.headers.get('Vary'), 'Origin, X-Bibleberry-Timezone')
    const body = (await res.json()) as { ok: boolean; error: { kind: string } }
    assert.equal(body.ok, false)
    assert.equal(body.error.kind, 'badRequest')
  }
  assert.equal(fetchCalled, false)
})

test('omits cross-namespace draft/version IDs, bad references, Option 4A all-withdrawn, and arbitrary cover URLs fail-closed', async () => {
  const validOct = makeMonthlyPublicationDoc('2026-10')
  const draftNamespace = makeMonthlyPublicationDoc('2026-09', {
    _id: 'drafts.month-2026-09',
  })
  const versionsNamespace = makeMonthlyPublicationDoc('2026-08', {
    _id: 'versions.release1.month-2026-08',
  })
  const badChallengeNamespace = makeMonthlyPublicationDoc('2026-07')
  badChallengeNamespace.slots[0].challenge = {
    ...badChallengeNamespace.slots[0].challenge,
    _id: 'versions.r2.r08a-stg-2026-07-day-01',
  }
  badChallengeNamespace.slots[0].rawChallengeRef = 'versions.r2.r08a-stg-2026-07-day-01'

  const missingChallengeRef = makeMonthlyPublicationDoc('2026-06')
  ;(missingChallengeRef.slots[3] as Record<string, unknown>).challenge = null

  const crossMonthCollision = makeMonthlyPublicationDoc('2026-05')
  crossMonthCollision.slots[0].challenge.assignedMonthIds = ['month-2026-05', 'month-2026-10']

  const arbitraryCoverUrl = makeMonthlyPublicationDoc('2026-04', {
    coverImage: {
      url: 'https://evil.example.com/tracker.png',
      alt: 'Cover',
    },
  })

  const crossDatasetCoverUrl = makeMonthlyPublicationDoc('2026-03', {
    coverImage: {
      url: 'https://cdn.sanity.io/images/80016lrq/production/cover-2026-03.png',
      alt: 'Cover',
    },
  })

  const unapprovedBlock = makeMonthlyPublicationDoc('2026-02')
  unapprovedBlock.slots[0].challenge.unapprovedBlockCount = 1

  const badDiscoverySubset = makeMonthlyPublicationDoc('2026-01')
  badDiscoverySubset.discoveries[0].qualifyingChallengeIds = ['foreign-challenge-id']

  // Valid Option 4A historical month (rosterVersion: 2 with 1 withdrawn slot and remaining active slots) MUST still appear
  const validOption4aNov = makeMonthlyPublicationDoc('2026-11')
  const withdrawnSlotId = validOption4aNov.slots[17].challenge._id
  ;(validOption4aNov.slots[17] as Record<string, unknown>) = {
    _key: 'day-18',
    dayOfMonth: 18,
    date: '2026-11-18',
    slotStatus: 'withdrawn',
    rawChallengeRef: withdrawnSlotId,
  }
  validOption4aNov.rosterFinalization = {
    isFinalized: true,
    rosterVersion: 2,
    finalizedAt: '2026-11-19T10:00:00.000Z',
    finalizedBy: 'Aaron Waid',
    finalizedChallengeIds: validOption4aNov.rosterFinalization.finalizedChallengeIds.filter(
      id => id !== withdrawnSlotId,
    ),
  }

  const mockFetch = createMockFetch(() =>
    new Response(
      JSON.stringify({
        result: [
          validOption4aNov,
          validOct,
          draftNamespace,
          versionsNamespace,
          badChallengeNamespace,
          missingChallengeRef,
          crossMonthCollision,
          arbitraryCoverUrl,
          crossDatasetCoverUrl,
          unapprovedBlock,
          badDiscoverySubset,
        ],
      }),
      { status: 200 },
    ),
  )

  const res = await handleGatewayRequest(
    new Request('http://localhost/api/library/months'),
    TEST_ENV,
    { getNow: () => new Date('2026-12-10T12:00:00.000Z'), fetchImpl: mockFetch },
  )
  assert.equal(res.status, 200)
  const body = (await res.json()) as { items: Array<{ yearMonth: string }> }
  assert.deepEqual(
    body.items.map(i => i.yearMonth),
    ['2026-11', '2026-10'],
  )
})

test('fails closed on Sanity upstream errors, disallowed datasets, and unsupported HTTP methods', async () => {
  // Upstream 503
  {
    const res = await handleGatewayRequest(
      new Request('http://localhost/api/library/months'),
      TEST_ENV,
      {
        fetchImpl: createMockFetch(() => new Response('Service Unavailable', { status: 503 })),
      },
    )
    assert.equal(res.status, 502)
    assert.equal(res.headers.get('Cache-Control'), 'no-store')
    const text = await res.text()
    assert.equal(text.includes(TEST_ENV.SANITY_READ_TOKEN), false)
    const body = JSON.parse(text) as { ok: boolean; error: { kind: string } }
    assert.equal(body.ok, false)
    assert.equal(body.error.kind, 'upstreamError')
  }

  // Network throw
  {
    const res = await handleGatewayRequest(
      new Request('http://localhost/api/library/months'),
      TEST_ENV,
      {
        fetchImpl: async () => {
          throw new Error('Upstream TCP reset')
        },
      },
    )
    assert.equal(res.status, 502)
  }

  // Non-array upstream result
  {
    const res = await handleGatewayRequest(
      new Request('http://localhost/api/library/months'),
      TEST_ENV,
      {
        fetchImpl: createMockFetch(() =>
          new Response(JSON.stringify({ result: { unexpected: true } }), { status: 200 }),
        ),
      },
    )
    assert.equal(res.status, 502)
  }

  // Disallowed / deleted dataset -> 500 serverConfigurationError
  {
    let fetchCalled = false
    const res = await handleGatewayRequest(
      new Request('http://localhost/api/library/months'),
      { ...TEST_ENV, SANITY_DATASET: 'berrymark-development' },
      {
        fetchImpl: createMockFetch(() => {
          fetchCalled = true
          return new Response(JSON.stringify({ result: [] }), { status: 200 })
        }),
      },
    )
    assert.equal(res.status, 500)
    assert.equal(fetchCalled, false)
  }

  // Method enforcement & OPTIONS preflight
  {
    const optionsRes = await handleGatewayRequest(
      new Request('http://localhost/api/library/months', {
        method: 'OPTIONS',
        headers: { Origin: 'http://localhost:3000' },
      }),
      TEST_ENV,
    )
    assert.equal(optionsRes.status, 204)
    assert.equal(optionsRes.headers.get('Access-Control-Allow-Methods'), 'GET, OPTIONS')
    assert.equal(optionsRes.headers.get('Cache-Control'), 'no-store')

    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const res = await handleGatewayRequest(
        new Request('http://localhost/api/library/months', { method }),
        TEST_ENV,
      )
      assert.equal(res.status, 405)
      assert.equal(res.headers.get('Allow'), 'GET, OPTIONS')
    }
  }
})

test('sparse-valid-month pagination discovers older valid months past >2*limit+1 consecutive invalid candidates without duplicates or skips', async () => {
  // 6 consecutive invalid months (2026-11..2026-06) followed by 3 valid older months (2026-05..2026-03)
  const invalidMonths = ['2026-11', '2026-10', '2026-09', '2026-08', '2026-07', '2026-06'].map(
    ym =>
      makeMonthlyPublicationDoc(ym, {
        rosterFinalization: {
          isFinalized: false,
          rosterVersion: 1,
          finalizedChallengeIds: [],
        },
        title: `INVALID_SPARSE_${ym}`,
      }),
  )
  const validMonths = ['2026-05', '2026-04', '2026-03'].map(ym => makeMonthlyPublicationDoc(ym))
  const allDocs = [...invalidMonths, ...validMonths]

  const mockFetch = createMockFetch(url => {
    const upperBound = JSON.parse(url.searchParams.get('$upperBoundYearMonth') ?? '""') as string
    const fetchLimit = JSON.parse(url.searchParams.get('$fetchLimit') ?? '12') as number
    const sliced = allDocs
      .filter(d => d.yearMonth < upperBound)
      .sort((a, b) => (a.yearMonth > b.yearMonth ? -1 : a.yearMonth < b.yearMonth ? 1 : 0))
      .slice(0, fetchLimit)
    return new Response(JSON.stringify({ result: sliced }), { status: 200 })
  })

  const now = () => new Date('2026-12-10T12:00:00.000Z')

  // limit=2: 6 consecutive invalid months exceed 2*limit+1 (5); must still discover 2026-05 & 2026-04
  const page1Res = await handleGatewayRequest(
    new Request('http://localhost/api/library/months?limit=2'),
    TEST_ENV,
    { getNow: now, fetchImpl: mockFetch },
  )
  assert.equal(page1Res.status, 200)
  const page1Text = await page1Res.text()
  assert.equal(page1Text.includes('INVALID_SPARSE_'), false)
  const page1 = JSON.parse(page1Text) as {
    items: Array<{ yearMonth: string }>
    page: { limit: number; hasMore: boolean; nextCursor: string | null }
  }
  assert.deepEqual(
    page1.items.map(i => i.yearMonth),
    ['2026-05', '2026-04'],
  )
  assert.equal(page1.page.hasMore, true)
  assert.equal(page1.page.nextCursor, '2026-04')

  const page2Res = await handleGatewayRequest(
    new Request(`http://localhost/api/library/months?limit=2&cursor=${page1.page.nextCursor}`),
    TEST_ENV,
    { getNow: now, fetchImpl: mockFetch },
  )
  assert.equal(page2Res.status, 200)
  const page2 = (await page2Res.json()) as typeof page1
  assert.deepEqual(
    page2.items.map(i => i.yearMonth),
    ['2026-03'],
  )
  assert.equal(page2.page.hasMore, false)
  assert.equal(page2.page.nextCursor, null)
})

test('bounded scan limit returns honest continuation cursor without claiming end-of-catalogue and terminates on entirely invalid catalogues', async () => {
  // Build 22 consecutive invalid months (2026-11 down to 2025-02) followed by 2 valid older months (2025-01, 2024-12)
  const invalidMonths: ReturnType<typeof makeMonthlyPublicationDoc>[] = []
  let y = 2026
  let m = 11
  for (let i = 0; i < 22; i++) {
    const ym = `${y}-${String(m).padStart(2, '0')}`
    invalidMonths.push(
      makeMonthlyPublicationDoc(ym, {
        withdrawn: false,
        editorialReview: { reviewerRole: 'technical_synthetic' }, // unreviewed
        title: `INVALID_SCAN_LIMIT_${ym}`,
      }),
    )
    m -= 1
    if (m === 0) {
      y -= 1
      m = 12
    }
  }
  const validOlder = [makeMonthlyPublicationDoc('2025-01'), makeMonthlyPublicationDoc('2024-12')]
  const docsWithOlder = [...invalidMonths, ...validOlder]

  let upstreamCalls = 0
  const mockWithOlder = createMockFetch(url => {
    upstreamCalls += 1
    const upperBound = JSON.parse(url.searchParams.get('$upperBoundYearMonth') ?? '""') as string
    const fetchLimit = JSON.parse(url.searchParams.get('$fetchLimit') ?? '12') as number
    const sliced = docsWithOlder
      .filter(d => d.yearMonth < upperBound)
      .sort((a, b) => (a.yearMonth > b.yearMonth ? -1 : a.yearMonth < b.yearMonth ? 1 : 0))
      .slice(0, fetchLimit)
    return new Response(JSON.stringify({ result: sliced }), { status: 200 })
  })

  const now = () => new Date('2026-12-10T12:00:00.000Z')

  // Request 1: hits bounded scan limit (4 rounds * 5 = 20 scanned), must return hasMore=true and honest nextCursor
  const res1 = await handleGatewayRequest(
    new Request('http://localhost/api/library/months?limit=2'),
    TEST_ENV,
    { getNow: now, fetchImpl: mockWithOlder },
  )
  assert.equal(res1.status, 200)
  assert.equal(upstreamCalls, 4)
  const text1 = await res1.text()
  assert.equal(text1.includes('INVALID_SCAN_LIMIT_'), false)
  const body1 = JSON.parse(text1) as {
    items: Array<{ yearMonth: string }>
    page: { limit: number; hasMore: boolean; nextCursor: string | null }
  }
  assert.deepEqual(body1.items, [])
  assert.equal(body1.page.hasMore, true)
  assert.equal(body1.page.nextCursor, '2025-04')

  // Request 2 with continuation cursor discovers 2025-01 & 2024-12 and establishes true end-of-catalogue
  upstreamCalls = 0
  const res2 = await handleGatewayRequest(
    new Request(`http://localhost/api/library/months?limit=2&cursor=${body1.page.nextCursor}`),
    TEST_ENV,
    { getNow: now, fetchImpl: mockWithOlder },
  )
  assert.equal(res2.status, 200)
  assert.equal(upstreamCalls, 1)
  const body2 = (await res2.json()) as typeof body1
  assert.deepEqual(
    body2.items.map(i => i.yearMonth),
    ['2025-01', '2024-12'],
  )
  assert.equal(body2.page.hasMore, false)
  assert.equal(body2.page.nextCursor, null)

  // Entirely invalid catalogue terminates cleanly with bounded work and eventual exhaustion
  const mockAllInvalid = createMockFetch(url => {
    const upperBound = JSON.parse(url.searchParams.get('$upperBoundYearMonth') ?? '""') as string
    const fetchLimit = JSON.parse(url.searchParams.get('$fetchLimit') ?? '12') as number
    const sliced = invalidMonths
      .filter(d => d.yearMonth < upperBound)
      .sort((a, b) => (a.yearMonth > b.yearMonth ? -1 : a.yearMonth < b.yearMonth ? 1 : 0))
      .slice(0, fetchLimit)
    return new Response(JSON.stringify({ result: sliced }), { status: 200 })
  })

  let cursor: string | null = null
  let iterations = 0
  while (iterations < 5) {
    iterations += 1
    const url = cursor
      ? `http://localhost/api/library/months?limit=2&cursor=${cursor}`
      : 'http://localhost/api/library/months?limit=2'
    const res = await handleGatewayRequest(new Request(url), TEST_ENV, {
      getNow: now,
      fetchImpl: mockAllInvalid,
    })
    assert.equal(res.status, 200)
    const body = (await res.json()) as typeof body1
    assert.deepEqual(body.items, [])
    if (!body.page.hasMore) {
      assert.equal(body.page.nextCursor, null)
      break
    }
    assert.ok(body.page.nextCursor)
    cursor = body.page.nextCursor
  }
  assert.equal(iterations, 2)
})

test('deduplicates colliding/duplicate month documents without duplicating valid months or skipping', async () => {
  const validOct = makeMonthlyPublicationDoc('2026-10')
  const draftOct = makeMonthlyPublicationDoc('2026-10', {
    _id: 'drafts.month-2026-10',
    title: 'DRAFT_COLLISION_2026_10',
  })
  const duplicateValidOct = makeMonthlyPublicationDoc('2026-10')
  const validSep = makeMonthlyPublicationDoc('2026-09')

  const mockFetch = createMockFetch(() =>
    new Response(JSON.stringify({ result: [draftOct, validOct, duplicateValidOct, validSep] }), {
      status: 200,
    }),
  )

  const res = await handleGatewayRequest(
    new Request('http://localhost/api/library/months?limit=2'),
    TEST_ENV,
    { getNow: () => new Date('2026-11-15T12:00:00.000Z'), fetchImpl: mockFetch },
  )
  assert.equal(res.status, 200)
  const text = await res.text()
  assert.equal(text.includes('DRAFT_COLLISION_2026_10'), false)
  const body = JSON.parse(text) as {
    items: Array<{ yearMonth: string }>
    page: { hasMore: boolean; nextCursor: string | null }
  }
  assert.deepEqual(
    body.items.map(i => i.yearMonth),
    ['2026-10', '2026-09'],
  )
  assert.equal(body.page.hasMore, false)
  assert.equal(body.page.nextCursor, null)
})

test('malformed non-canonical yearMonth records ahead of valid historical months never cause false terminal exhaustion', async () => {
  // 5 malformed candidates (2026-11E..2026-11A) sort lexicographically ahead of valid 2026-10
  const malformedBatch = ['2026-11E', '2026-11D', '2026-11C', '2026-11B', '2026-11A'].map(badYm => ({
    _id: `month-${badYm}`,
    _type: 'monthlyPublication',
    yearMonth: badYm,
    year: 2026,
    month: 11,
    title: `MALFORMED_TITLE_${badYm}`,
    editorialStatus: 'scheduled',
    withdrawn: false,
  }))
  const validOct = makeMonthlyPublicationDoc('2026-10')
  const allDocs = [...malformedBatch, validOct]

  const mockFetch = createMockFetch(url => {
    const upperBound = JSON.parse(url.searchParams.get('$upperBoundYearMonth') ?? '""') as string
    const fetchLimit = JSON.parse(url.searchParams.get('$fetchLimit') ?? '12') as number
    const sliced = allDocs
      .filter(d => d.yearMonth < upperBound)
      .sort((a, b) => (a.yearMonth > b.yearMonth ? -1 : a.yearMonth < b.yearMonth ? 1 : 0))
      .slice(0, fetchLimit)
    return new Response(JSON.stringify({ result: sliced }), { status: 200 })
  })

  const res = await handleGatewayRequest(
    new Request('http://localhost/api/library/months?limit=2'),
    TEST_ENV,
    { getNow: () => new Date('2026-12-10T12:00:00.000Z'), fetchImpl: mockFetch },
  )
  assert.equal(res.status, 200)
  const text = await res.text()
  assert.equal(text.includes('MALFORMED_TITLE_'), false)
  const body = JSON.parse(text) as {
    items: Array<{ yearMonth: string }>
    page: { limit: number; hasMore: boolean; nextCursor: string | null }
  }
  assert.deepEqual(
    body.items.map(i => i.yearMonth),
    ['2026-10'],
  )
  assert.equal(body.page.hasMore, false)
  assert.equal(body.page.nextCursor, null)

  // Mixture of canonical and non-canonical rows at a batch boundary (limit=2, batchSize=5)
  const mixedDocs = [
    makeMonthlyPublicationDoc('2026-11'),
    ...['2026-10E', '2026-10D', '2026-10C', '2026-10B', '2026-10A'].map(badYm => ({
      _id: `month-${badYm}`,
      _type: 'monthlyPublication',
      yearMonth: badYm,
      year: 2026,
      month: 10,
      title: `MALFORMED_MIXED_${badYm}`,
      editorialStatus: 'scheduled',
      withdrawn: false,
    })),
    makeMonthlyPublicationDoc('2026-10'),
    makeMonthlyPublicationDoc('2026-09'),
  ]

  const mockMixed = createMockFetch(url => {
    const upperBound = JSON.parse(url.searchParams.get('$upperBoundYearMonth') ?? '""') as string
    const fetchLimit = JSON.parse(url.searchParams.get('$fetchLimit') ?? '12') as number
    const sliced = mixedDocs
      .filter(d => d.yearMonth < upperBound)
      .sort((a, b) => (a.yearMonth > b.yearMonth ? -1 : a.yearMonth < b.yearMonth ? 1 : 0))
      .slice(0, fetchLimit)
    return new Response(JSON.stringify({ result: sliced }), { status: 200 })
  })

  const mixedP1Res = await handleGatewayRequest(
    new Request('http://localhost/api/library/months?limit=2'),
    TEST_ENV,
    { getNow: () => new Date('2026-12-10T12:00:00.000Z'), fetchImpl: mockMixed },
  )
  assert.equal(mixedP1Res.status, 200)
  const mixedP1Text = await mixedP1Res.text()
  assert.equal(mixedP1Text.includes('MALFORMED_MIXED_'), false)
  const mixedP1 = JSON.parse(mixedP1Text) as typeof body
  assert.deepEqual(
    mixedP1.items.map(i => i.yearMonth),
    ['2026-11', '2026-10'],
  )
  assert.equal(mixedP1.page.hasMore, true)
  assert.equal(mixedP1.page.nextCursor, '2026-10')

  const mixedP2Res = await handleGatewayRequest(
    new Request(`http://localhost/api/library/months?limit=2&cursor=${mixedP1.page.nextCursor}`),
    TEST_ENV,
    { getNow: () => new Date('2026-12-10T12:00:00.000Z'), fetchImpl: mockMixed },
  )
  assert.equal(mixedP2Res.status, 200)
  const mixedP2 = (await mixedP2Res.json()) as typeof body
  assert.deepEqual(
    mixedP2.items.map(i => i.yearMonth),
    ['2026-09'],
  )
  assert.equal(mixedP2.page.hasMore, false)
  assert.equal(mixedP2.page.nextCursor, null)

  // >20 consecutive malformed rows hitting scan limit with non-canonical scanUpperBound -> 502 upstreamError (fail closed, no invalid cursor)
  const twentyOneMalformed = Array.from({ length: 21 }, (_, idx) => {
    const suffix = String.fromCharCode(85 - idx) // 'U' down to 'A'
    const badYm = `2026-11${suffix}`
    return {
      _id: `month-${badYm}`,
      _type: 'monthlyPublication',
      yearMonth: badYm,
      year: 2026,
      month: 11,
      title: `MALFORMED_SCAN_LIMIT_${badYm}`,
      editorialStatus: 'scheduled',
      withdrawn: false,
    }
  })
  const mockScanLimitMalformed = createMockFetch(url => {
    const upperBound = JSON.parse(url.searchParams.get('$upperBoundYearMonth') ?? '""') as string
    const fetchLimit = JSON.parse(url.searchParams.get('$fetchLimit') ?? '12') as number
    const sliced = [...twentyOneMalformed, validOct]
      .filter(d => d.yearMonth < upperBound)
      .sort((a, b) => (a.yearMonth > b.yearMonth ? -1 : a.yearMonth < b.yearMonth ? 1 : 0))
      .slice(0, fetchLimit)
    return new Response(JSON.stringify({ result: sliced }), { status: 200 })
  })
  const scanLimitErrRes = await handleGatewayRequest(
    new Request('http://localhost/api/library/months?limit=2'),
    TEST_ENV,
    { getNow: () => new Date('2026-12-10T12:00:00.000Z'), fetchImpl: mockScanLimitMalformed },
  )
  assert.equal(scanLimitErrRes.status, 502)
  const scanLimitErrText = await scanLimitErrRes.text()
  assert.equal(scanLimitErrText.includes('MALFORMED_SCAN_LIMIT_'), false)

  // Full batch with missing/non-string yearMonth -> safe 502 upstreamError (never loops or claims false exhaustion)
  let nonStringCalls = 0
  const mockNonString = createMockFetch(() => {
    nonStringCalls += 1
    return new Response(
      JSON.stringify({
        result: Array.from({ length: 5 }, (_, i) => ({
          _id: `month-bad-${i}`,
          yearMonth: null,
          title: 'MALFORMED_NULL_YM',
        })),
      }),
      { status: 200 },
    )
  })
  const nonStringRes = await handleGatewayRequest(
    new Request('http://localhost/api/library/months?limit=2'),
    TEST_ENV,
    { getNow: () => new Date('2026-12-10T12:00:00.000Z'), fetchImpl: mockNonString },
  )
  assert.equal(nonStringRes.status, 502)
  assert.equal(nonStringCalls, 1)
})
