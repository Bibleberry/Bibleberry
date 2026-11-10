import assert from 'node:assert/strict'
import test from 'node:test'
import { handleGatewayRequest } from '../../src/gateway/handler.ts'
import { daysInMonth, formatCivilDate } from '../../src/gateway/localRelease.ts'
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
    title: `Day ${dayOfMonth} Title (${yearMonth})`,
    slug: `day-${padded}-${yearMonth}`,
    challengeType: 'teaching',
    withdrawn: false,
    editorialEligibility: {
      adaptationReviewed: true,
      reviewedAt: '2096-01-15T12:00:00.000Z',
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
    subtitle: `Monthly subtitle for ${yearMonth}`,
    coverImage: {
      url: `https://cdn.sanity.io/images/80016lrq/staging/cover-${yearMonth}.png`,
      alt: `Cover illustration for ${yearMonth}`,
    },
    editorialStatus: 'scheduled',
    withdrawn: false,
    editorialReview: {
      reviewedBy: 'Aaron Waid (technical synthetic approval)',
      reviewerRole: 'technical_synthetic',
      reviewedAt: '2096-01-15T14:00:00.000Z',
      reviewNotes: 'INTERNAL_MONTHLY_REVIEW_NOTE_DO_NOT_LEAK',
    },
    introduction: {
      previewScreens: [
        {
          _key: 'intro-1',
          _type: 'introductionScreen',
          screenLabel: 'Preview',
          heading: `Coming in ${yearMonth}`,
          blocks: [
            {
              _key: 'intro-1-b1',
              _type: 'statementBlock',
              text: 'Preview teaching introduction.',
            },
          ],
        },
      ],
      welcomeScreen: {
        _key: 'welcome',
        _type: 'introductionScreen',
        screenLabel: 'Welcome',
        heading: `Welcome to ${yearMonth}`,
        ctaLabel: 'Open Calendar',
        blocks: [
          {
            _key: 'welcome-b1',
            _type: 'statementBlock',
            text: 'Welcome statement visible only at month start.',
          },
        ],
      },
    },
    slots,
    rosterFinalization: {
      isFinalized: true,
      rosterVersion: 1,
      finalizedAt: '2096-01-16T10:00:00.000Z',
      finalizedBy: 'Aaron Waid',
      finalizedChallengeIds,
    },
    discoveries: [
      {
        _key: 'shepherd-theme',
        discoverySlug: 'shepherd-theme',
        title: 'Shepherd Theme',
        qualifyingChallengeIds: [finalizedChallengeIds[0], finalizedChallengeIds[2]],
        reservedCardId: `card-${yearMonth}-shepherd-theme`,
      },
      {
        _key: 'wisdom-path',
        discoverySlug: 'wisdom-path',
        title: 'Wisdom Path',
        qualifyingChallengeIds: [finalizedChallengeIds[1]],
        reservedCardId: `card-${yearMonth}-wisdom-path`,
      },
    ],
    fullMonthCard: {
      title: `Complete ${yearMonth}`,
      reservedCardId: `card-${yearMonth}-full-month`,
    },
    ...overrides,
  }
}

test('GET /api/months/:yearMonth/preview enforces exact Dec 28 and Feb 27 preview boundaries across leap/non-leap years and timezones', async () => {
  const jan2098 = makeMonthlyPublicationDoc('2098-01')
  const mar2098 = makeMonthlyPublicationDoc('2098-03') // Preceding Feb has 28 days
  const mar2096 = makeMonthlyPublicationDoc('2096-03') // Preceding Feb has 29 days (leap)

  const byMonth: Record<string, unknown> = {
    '2098-01': jan2098,
    '2098-03': mar2098,
    '2096-03': mar2096,
  }

  let capturedUrl: URL | null = null
  const mockFetch = createMockFetch(url => {
    capturedUrl = url
    const ym = JSON.parse(url.searchParams.get('$yearMonth') ?? '""') as string
    return new Response(JSON.stringify({ result: byMonth[ym] ?? null }), { status: 200 })
  })

  // 2098-01: Dec 27 -> 404, Dec 28 -> 200
  {
    const before = await handleGatewayRequest(
      new Request('http://localhost/api/months/2098-01/preview', {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      TEST_ENV,
      { getNow: () => new Date('2097-12-27T18:00:00.000Z'), fetchImpl: mockFetch },
    )
    assert.equal(before.status, 404)

    const onDay = await handleGatewayRequest(
      new Request('http://localhost/api/months/2098-01/preview', {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      TEST_ENV,
      { getNow: () => new Date('2097-12-28T18:00:00.000Z'), fetchImpl: mockFetch },
    )
    assert.equal(onDay.status, 200)
  }

  // 2098-03 (28-day Feb) & 2096-03 (29-day leap Feb): Feb 26 -> 404, Feb 27 -> 200
  for (const [ym, feb26Utc, feb27Utc] of [
    ['2098-03', '2098-02-26T18:00:00.000Z', '2098-02-27T18:00:00.000Z'],
    ['2096-03', '2096-02-26T18:00:00.000Z', '2096-02-27T18:00:00.000Z'],
  ] as const) {
    const res26 = await handleGatewayRequest(
      new Request(`http://localhost/api/months/${ym}/preview`, {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      TEST_ENV,
      { getNow: () => new Date(feb26Utc), fetchImpl: mockFetch },
    )
    assert.equal(res26.status, 404, `${ym} preview must be 404 on Feb 26`)

    const res27 = await handleGatewayRequest(
      new Request(`http://localhost/api/months/${ym}/preview`, {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      TEST_ENV,
      { getNow: () => new Date(feb27Utc), fetchImpl: mockFetch },
    )
    assert.equal(res27.status, 200, `${ym} preview must be 200 on Feb 27`)
  }

  // Timezone edge near UTC midnight + spoofed client Date header/query param ignored
  // At 2098-02-27T02:00:00Z: Tokyo is 2098-02-27 (200), NY & missing fallback are 2098-02-26 (404)
  {
    const midnightUtc = () => new Date('2098-02-27T02:00:00.000Z')
    const tokyoRes = await handleGatewayRequest(
      new Request('http://localhost/api/months/2098-03/preview?now=2098-02-20', {
        headers: {
          'X-Bibleberry-Timezone': 'Asia/Tokyo',
          Date: 'Tue, 01 Jan 2099 00:00:00 GMT',
        },
      }),
      TEST_ENV,
      { getNow: midnightUtc, fetchImpl: mockFetch },
    )
    assert.equal(tokyoRes.status, 200)
    assert.equal(capturedUrl?.searchParams.get('perspective'), 'published')
    assert.equal(capturedUrl?.searchParams.get('$monthDocId'), JSON.stringify('month-2098-03'))
    assert.equal(capturedUrl?.searchParams.get('$yearMonth'), JSON.stringify('2098-03'))
    const queryText = capturedUrl?.searchParams.get('query') ?? ''
    assert.equal(queryText.includes('!(_id in path("drafts.**"))'), true)
    assert.equal(queryText.includes('editorialStatus == "scheduled"'), true)
    assert.equal(queryText.includes('withdrawn != true'), true)

    const nyRes = await handleGatewayRequest(
      new Request('http://localhost/api/months/2098-03/preview?now=2099-01-01', {
        headers: {
          'X-Bibleberry-Timezone': 'America/New_York',
          Date: 'Thu, 01 Jan 2099 00:00:00 GMT',
        },
      }),
      TEST_ENV,
      { getNow: midnightUtc, fetchImpl: mockFetch },
    )
    assert.equal(nyRes.status, 404)

    const fallbackRes = await handleGatewayRequest(
      new Request('http://localhost/api/months/2098-03/preview'),
      TEST_ENV,
      { getNow: midnightUtc, fetchImpl: mockFetch },
    )
    assert.equal(fallbackRes.status, 404)
  }
})

test('GET /api/months/:yearMonth/preview supports 28/29/30/31 day counts and omits welcomeScreen, slugs, IDs, Scripture, discoveries, and review notes', async () => {
  const months = [
    { ym: '2098-02', days: 28, previewDate: '2098-01-28T12:00:00Z' },
    { ym: '2096-02', days: 29, previewDate: '2096-01-28T12:00:00Z' },
    { ym: '2098-04', days: 30, previewDate: '2098-03-28T12:00:00Z' },
    { ym: '2098-03', days: 31, previewDate: '2098-02-27T12:00:00Z' },
  ] as const

  for (const { ym, days, previewDate } of months) {
    const doc = makeMonthlyPublicationDoc(ym, {
      secretEditorialDump: 'SECRET_UNALLOWED_SPREAD_FIELD',
    })
    const mockFetch = createMockFetch(() =>
      new Response(JSON.stringify({ result: doc }), { status: 200 }),
    )

    const res = await handleGatewayRequest(
      new Request(`http://localhost/api/months/${ym}/preview`, {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      TEST_ENV,
      { getNow: () => new Date(previewDate), fetchImpl: mockFetch },
    )
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('Cache-Control'), 'no-store')
    assert.equal(res.headers.get('Vary'), 'Origin, X-Bibleberry-Timezone')

    const text = await res.text()
    assert.equal(text.includes('Welcome statement visible only at month start'), false)
    assert.equal(text.includes('welcomeScreen'), false)
    assert.equal(text.includes('discoveries'), false)
    assert.equal(text.includes('shepherd-theme'), false)
    assert.equal(text.includes('fullMonthCard'), false)
    assert.equal(text.includes('INTERNAL_MONTHLY_REVIEW_NOTE_DO_NOT_LEAK'), false)
    assert.equal(text.includes('SECRET_UNALLOWED_SPREAD_FIELD'), false)
    assert.equal(text.includes(`day-01-${ym}`), false) // no slug
    assert.equal(text.includes(`r08a-stg-${ym}-day-01`), false) // no raw challengeId
    assert.equal(text.includes('Psalm 23'), false) // no Scripture

    const body = JSON.parse(text) as {
      ok: boolean
      month: {
        daysInMonth: number
        phase: string
        coverImage?: { url: string; alt: string }
        introduction: { version: string; previewScreens: unknown[]; welcomeScreen?: unknown }
        slots: Array<{ dayOfMonth: number; date: string; title: string; availability: string }>
      }
    }
    assert.equal(body.ok, true)
    assert.equal(body.month.daysInMonth, days)
    assert.equal(body.month.phase, 'advancePreview')
    assert.equal(body.month.coverImage?.alt, `Cover illustration for ${ym}`)
    assert.equal(body.month.introduction.welcomeScreen, undefined)
    assert.equal(body.month.slots.length, days)
    assert.equal(body.month.slots[0].dayOfMonth, 1)
    assert.equal(body.month.slots[0].availability, 'comingSoon')
    assert.equal(body.month.slots[days - 1].dayOfMonth, days)
  }
})

test('GET /api/months/:yearMonth serves active vs historical phases and keeps future slots title-only', async () => {
  const apr2098 = makeMonthlyPublicationDoc('2098-04')
  const mockFetch = createMockFetch(() =>
    new Response(JSON.stringify({ result: apr2098 }), { status: 200 }),
  )

  // Before month start (2098-03-31) -> 404 even though preview is active
  {
    const res = await handleGatewayRequest(
      new Request('http://localhost/api/months/2098-04', {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      TEST_ENV,
      { getNow: () => new Date('2098-03-31T12:00:00Z'), fetchImpl: mockFetch },
    )
    assert.equal(res.status, 404)
  }

  // Active month mid-month (2098-04-10)
  {
    const res = await handleGatewayRequest(
      new Request('http://localhost/api/months/2098-04', {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      TEST_ENV,
      { getNow: () => new Date('2098-04-10T12:00:00Z'), fetchImpl: mockFetch },
    )
    assert.equal(res.status, 200)
    const text = await res.text()
    // Must never leak qualifying IDs or reserved card IDs
    assert.equal(text.includes('qualifyingChallengeIds'), false)
    assert.equal(text.includes('card-2098-04-shepherd-theme'), false)
    assert.equal(text.includes('card-2098-04-full-month'), false)

    const body = JSON.parse(text) as {
      ok: boolean
      month: {
        phase: string
        rosterVersion: number
        totalChallenges: number
        introduction: { previewScreens: unknown[]; welcomeScreen: { title: string } }
        slots: Array<Record<string, unknown>>
        discoveries: Array<{ discoveryId: string; kind: string; title: string; targetCount: number }>
      }
    }
    assert.equal(body.month.phase, 'active')
    assert.equal(body.month.rosterVersion, 1)
    assert.equal(body.month.totalChallenges, 30)
    assert.equal(body.month.introduction.welcomeScreen.title, 'Welcome to 2098-04')
    assert.equal(body.month.slots[9].availability, 'available')
    assert.equal(body.month.slots[9].slug, 'day-10-2098-04')
    assert.equal(body.month.slots[9].challengeId, 'cms:r08a-stg-2098-04-day-10')
    assert.equal(body.month.slots[10].availability, 'comingSoon')
    assert.equal(body.month.slots[10].title, 'Day 11 Title (2098-04)')
    assert.equal('slug' in body.month.slots[10], false)
    assert.equal('challengeId' in body.month.slots[10], false)
    assert.equal('challengeType' in body.month.slots[10], false)
    // Full-month goal placed last
    const lastDisc = body.month.discoveries[body.month.discoveries.length - 1]
    assert.equal(lastDisc.kind, 'fullMonth')
    assert.equal(lastDisc.targetCount, 30)
  }

  // Historical month (2098-05-05)
  {
    const res = await handleGatewayRequest(
      new Request('http://localhost/api/months/2098-04', {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      TEST_ENV,
      { getNow: () => new Date('2098-05-05T12:00:00Z'), fetchImpl: mockFetch },
    )
    assert.equal(res.status, 200)
    const body = (await res.json()) as {
      month: { phase: string; slots: Array<{ availability: string }> }
    }
    assert.equal(body.month.phase, 'historical')
    assert.equal(body.month.slots.every(s => s.availability === 'available'), true)
  }
})

test('month endpoints return byte-identical neutral 404 across nonexistent, malformed, draft, unscheduled, withdrawn, and invalid-slot cases', async () => {
  const baseDoc = makeMonthlyPublicationDoc('2098-04')
  const duplicateCrossMonthDoc = makeMonthlyPublicationDoc('2098-04')
  ;(duplicateCrossMonthDoc.slots[4].challenge as Record<string, unknown>).assignedMonthIds = [
    'month-2098-04',
    'month-2098-05',
  ]

  const unreviewedSlotDoc = makeMonthlyPublicationDoc('2098-04')
  ;(unreviewedSlotDoc.slots[3].challenge as Record<string, unknown>).title = 'SECRET_UNREVIEWED_TITLE'
  ;(unreviewedSlotDoc.slots[3].challenge as Record<string, unknown>).editorialEligibility = {
    adaptationReviewed: false,
  }

  const unapprovedBlockSlotDoc = makeMonthlyPublicationDoc('2098-04')
  ;(unapprovedBlockSlotDoc.slots[3].challenge as Record<string, unknown>).unapprovedBlockCount = 1

  const unlicensedScriptureSlotDoc = makeMonthlyPublicationDoc('2098-04')
  ;(unlicensedScriptureSlotDoc.slots[3].challenge as Record<string, unknown>).primaryScripture = {
    reference: 'John 3:16',
    translation: 'ESV',
    textStatus: 'provided',
    passage: 'RESTRICTED_TEXT',
    usageRightsConfirmed: false,
    practiceStatus: 'notConfigured',
  }

  const missingAltCoverDoc = makeMonthlyPublicationDoc('2098-04', {
    coverImage: { url: 'https://cdn.sanity.io/images/80016lrq/staging/cover.png', alt: '   ' },
  })

  const duplicateIntraMonthDoc = makeMonthlyPublicationDoc('2098-04')
  duplicateIntraMonthDoc.slots[2].challenge = duplicateIntraMonthDoc.slots[1].challenge
  duplicateIntraMonthDoc.slots[2].rawChallengeRef = duplicateIntraMonthDoc.slots[1].rawChallengeRef

  const badLengthDoc = makeMonthlyPublicationDoc('2098-04')
  badLengthDoc.slots.pop()

  const negativeCases: Array<{ label: string; path: string; doc: unknown }> = [
    { label: 'nonexistent', path: '/api/months/2098-04', doc: null },
    { label: 'malformed yearMonth', path: '/api/months/2098-13', doc: baseDoc },
    { label: 'draft month', path: '/api/months/2098-04', doc: { ...baseDoc, _id: 'drafts.month-2098-04' } },
    { label: 'approved not scheduled', path: '/api/months/2098-04', doc: { ...baseDoc, editorialStatus: 'approved' } },
    { label: 'withdrawn month', path: '/api/months/2098-04', doc: { ...baseDoc, withdrawn: true } },
    { label: 'unreviewed month', path: '/api/months/2098-04', doc: { ...baseDoc, editorialReview: {} } },
    { label: 'bad slot count', path: '/api/months/2098-04', doc: badLengthDoc },
    { label: 'duplicate slot within month', path: '/api/months/2098-04', doc: duplicateIntraMonthDoc },
    { label: 'duplicate assignment across months', path: '/api/months/2098-04', doc: duplicateCrossMonthDoc },
    { label: 'unreviewed slot Challenge', path: '/api/months/2098-04', doc: unreviewedSlotDoc },
    { label: 'unapproved block slot Challenge', path: '/api/months/2098-04', doc: unapprovedBlockSlotDoc },
    { label: 'unlicensed Scripture slot Challenge', path: '/api/months/2098-04', doc: unlicensedScriptureSlotDoc },
    { label: 'coverImage missing alt', path: '/api/months/2098-04', doc: missingAltCoverDoc },
  ]

  let baseline404: string | null = null
  const getNow = () => new Date('2098-04-15T12:00:00Z')

  for (const { label, path, doc } of negativeCases) {
    const mockFetch = createMockFetch(() =>
      new Response(JSON.stringify({ result: doc }), { status: 200 }),
    )
    const res = await handleGatewayRequest(
      new Request(`http://localhost${path}`, {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      TEST_ENV,
      { getNow, fetchImpl: mockFetch },
    )
    assert.equal(res.status, 404, `Expected 404 for ${label}`)
    assert.equal(res.headers.get('Cache-Control'), 'no-store')
    assert.equal(res.headers.get('Vary'), 'Origin, X-Bibleberry-Timezone')
    const text = await res.text()
    assert.equal(text.includes('SECRET_UNREVIEWED_TITLE'), false)
    assert.equal(text.includes('RESTRICTED_TEXT'), false)
    if (baseline404 === null) {
      baseline404 = text
    } else {
      assert.equal(text, baseline404, `404 response for ${label} must be byte-identical`)
    }
  }
})

test('Option 4A emergency withdrawal preserves 30-day calendar, adjusts active total to 29/29, and gates formerChallengeId to past dates', async () => {
  // Case A: Immediate Challenge withdrawal (challenge.withdrawn = true on Day 10 and Day 20) while rosterVersion is still 1
  const docLiveWithdrawn = makeMonthlyPublicationDoc('2098-04')
  ;(docLiveWithdrawn.slots[9].challenge as Record<string, unknown>).withdrawn = true // 2098-04-10 (past/today)
  ;(docLiveWithdrawn.slots[19].challenge as Record<string, unknown>).withdrawn = true // 2098-04-20 (future)
  ;(docLiveWithdrawn.slots[9].challenge as Record<string, unknown>).title = 'WITHDRAWN_DAY_10_SECRET'

  // Case B: Formal rosterVersion 2 amendment where Day 18 slotStatus is 'withdrawn'
  const docAmendedV2 = makeMonthlyPublicationDoc('2098-04')
  docAmendedV2.slots[17] = {
    ...docAmendedV2.slots[17],
    slotStatus: 'withdrawn',
    challenge: null as unknown as ReturnType<typeof makeChallengeForSlot>,
  }
  docAmendedV2.rosterFinalization = {
    isFinalized: true,
    rosterVersion: 2,
    finalizedAt: '2098-04-18T12:00:00.000Z',
    finalizedBy: 'Aaron Waid',
    finalizedChallengeIds: docAmendedV2.slots
      .filter(s => s.slotStatus === 'scheduled')
      .map(s => s.challenge._id),
  }

  // Verify live withdrawal on 2098-04-15
  {
    const mockFetch = createMockFetch(() =>
      new Response(JSON.stringify({ result: docLiveWithdrawn }), { status: 200 }),
    )
    const monthRes = await handleGatewayRequest(
      new Request('http://localhost/api/months/2098-04', {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      TEST_ENV,
      { getNow: () => new Date('2098-04-15T12:00:00Z'), fetchImpl: mockFetch },
    )
    assert.equal(monthRes.status, 200)
    const text = await monthRes.text()
    assert.equal(text.includes('WITHDRAWN_DAY_10_SECRET'), false)
    const body = JSON.parse(text) as {
      month: {
        totalChallenges: number
        slots: Array<{
          dayOfMonth: number
          availability: string
          formerChallengeId?: string
          title?: string
          slug?: string
        }>
        discoveries: Array<{ kind: string; targetCount: number }>
      }
    }
    assert.equal(body.month.slots.length, 30)
    assert.equal(body.month.totalChallenges, 28)
    assert.equal(body.month.slots[9].availability, 'unavailable')
    assert.equal(body.month.slots[9].title, undefined)
    assert.equal(body.month.slots[9].slug, undefined)
    assert.equal(body.month.slots[9].formerChallengeId, 'cms:r08a-stg-2098-04-day-10')
    // Future withdrawn slot must NOT reveal formerChallengeId before its date
    assert.equal(body.month.slots[19].availability, 'unavailable')
    assert.equal(body.month.slots[19].formerChallengeId, undefined)
  }

  // Verify formal rosterVersion 2 amended 29/29 full-month completion on historical check (2098-05-02)
  {
    const mockFetch = createMockFetch(() =>
      new Response(JSON.stringify({ result: docAmendedV2 }), { status: 200 }),
    )
    const activeIds = docAmendedV2.rosterFinalization.finalizedChallengeIds.map(id => `cms:${id}`)
    const progressRes = await handleGatewayRequest(
      new Request('http://localhost/api/months/2098-04/progress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bibleberry-Timezone': 'America/New_York',
        },
        body: JSON.stringify({
          completedChallengeIds: [...activeIds, 'cms:r08a-stg-2098-04-day-18'],
        }),
      }),
      TEST_ENV,
      { getNow: () => new Date('2098-05-02T12:00:00Z'), fetchImpl: mockFetch },
    )
    assert.equal(progressRes.status, 200)
    const progressBody = (await progressRes.json()) as {
      rosterVersion: number
      completedInMonthCount: number
      totalChallenges: number
      discoveries: Array<{ kind: string; achievedCount: number; targetCount: number; isEarned: boolean }>
    }
    assert.equal(progressBody.rosterVersion, 2)
    assert.equal(progressBody.completedInMonthCount, 29)
    assert.equal(progressBody.totalChallenges, 29)
    const fullMonth = progressBody.discoveries[progressBody.discoveries.length - 1]
    assert.equal(fullMonth.kind, 'fullMonth')
    assert.equal(fullMonth.achievedCount, 29)
    assert.equal(fullMonth.targetCount, 29)
    assert.equal(fullMonth.isEarned, true)
  }
})

test('POST /api/months/:yearMonth/progress computes stateless discovery progress securely and rejects malformed/oversized inputs', async () => {
  const apr2098 = makeMonthlyPublicationDoc('2098-04')
  const mockFetch = createMockFetch(() =>
    new Response(JSON.stringify({ result: apr2098 }), { status: 200 }),
  )
  const getNow = () => new Date('2098-04-05T12:00:00Z') // Days 1..5 released

  // 1. Partial + duplicate + cross-month + future + guessed IDs
  {
    const res = await handleGatewayRequest(
      new Request('http://localhost/api/months/2098-04/progress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bibleberry-Timezone': 'America/New_York',
        },
        body: JSON.stringify({
          completedChallengeIds: [
            'cms:r08a-stg-2098-04-day-01', // counts for shepherd-theme (1/2)
            'cms:r08a-stg-2098-04-day-01', // harmless duplicate -> ignored
            'cms:r08a-stg-2098-04-day-02', // completes wisdom-path (1/1)
            'cms:r08a-stg-2098-04-day-20', // future slot -> ignored!
            'cms:r08a-stg-2098-03-day-01', // cross-month -> ignored!
            'cms:nonexistent-guessed-id', // guessed -> ignored!
          ],
        }),
      }),
      TEST_ENV,
      { getNow, fetchImpl: mockFetch },
    )
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('Cache-Control'), 'no-store')
    assert.equal(res.headers.get('Vary'), 'Origin, X-Bibleberry-Timezone')

    const text = await res.text()
    assert.equal(text.includes('qualifyingChallengeIds'), false)
    assert.equal(text.includes('nonexistent-guessed-id'), false)
    assert.equal(text.includes('r08a-stg-2098-04-day-20'), false)
    assert.equal(text.includes('card-2098-04-shepherd-theme'), false) // unearned card ID withheld!
    assert.equal(text.includes('card-2098-04-full-month'), false) // unearned full-month ID withheld!
    assert.equal(text.includes('cdn.sanity.io'), false) // no invented/unearned card URLs!

    const body = JSON.parse(text) as {
      ok: boolean
      monthId: string
      completedInMonthCount: number
      totalChallenges: number
      thematicEarnedCount: number
      thematicTotalCount: number
      discoveries: Array<{
        discoveryId: string
        kind: string
        achievedCount: number
        targetCount: number
        isEarned: boolean
        awardId?: string
        reservedCardId?: string
      }>
    }
    assert.equal(body.ok, true)
    assert.equal(body.monthId, '2098-04')
    assert.equal(body.completedInMonthCount, 2)
    assert.equal(body.totalChallenges, 30)
    assert.equal(body.thematicEarnedCount, 1)
    assert.equal(body.thematicTotalCount, 2)

    const shepherd = body.discoveries[0]
    assert.equal(shepherd.achievedCount, 1)
    assert.equal(shepherd.targetCount, 2)
    assert.equal(shepherd.isEarned, false)
    assert.equal(shepherd.awardId, undefined)
    assert.equal(shepherd.reservedCardId, undefined)

    const wisdom = body.discoveries[1]
    assert.equal(wisdom.achievedCount, 1)
    assert.equal(wisdom.targetCount, 1)
    assert.equal(wisdom.isEarned, true)
    assert.equal(wisdom.awardId, 'card:monthly:2098-04:wisdom-path')
    assert.equal(wisdom.reservedCardId, 'card-2098-04-wisdom-path')
  }

  // 2. Empty array
  {
    const res = await handleGatewayRequest(
      new Request('http://localhost/api/months/2098-04/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completedChallengeIds: [] }),
      }),
      TEST_ENV,
      { getNow, fetchImpl: mockFetch },
    )
    assert.equal(res.status, 200)
    const body = (await res.json()) as { completedInMonthCount: number; thematicEarnedCount: number }
    assert.equal(body.completedInMonthCount, 0)
    assert.equal(body.thematicEarnedCount, 0)
  }

  // 3. Reject malformed/oversized/pathological POST requests with 400
  const badRequests: Array<{ label: string; req: Request }> = [
    {
      label: 'invalid Content-Type',
      req: new Request('http://localhost/api/months/2098-04/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ completedChallengeIds: [] }),
      }),
    },
    {
      label: 'invalid JSON',
      req: new Request('http://localhost/api/months/2098-04/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{bad json',
      }),
    },
    {
      label: 'alreadyEarned disallowed field',
      req: new Request('http://localhost/api/months/2098-04/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completedChallengeIds: [], alreadyEarned: ['card:foo'] }),
      }),
    },
    {
      label: 'non-array completedChallengeIds',
      req: new Request('http://localhost/api/months/2098-04/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completedChallengeIds: 'cms:a' }),
      }),
    },
    {
      label: 'non-string item in completedChallengeIds',
      req: new Request('http://localhost/api/months/2098-04/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completedChallengeIds: [123] }),
      }),
    },
    {
      label: '> 500 IDs',
      req: new Request('http://localhost/api/months/2098-04/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          completedChallengeIds: Array.from({ length: 501 }, (_, i) => `c:${i}`),
        }),
      }),
    },
    {
      label: '> 8 KiB payload',
      req: new Request('http://localhost/api/months/2098-04/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          completedChallengeIds: Array.from({ length: 100 }, (_, i) => `cms:${'x'.repeat(85)}-${i}`),
        }),
      }),
    },
  ]

  for (const { label, req } of badRequests) {
    const res = await handleGatewayRequest(req, TEST_ENV, { getNow, fetchImpl: mockFetch })
    assert.equal(res.status, 400, `Expected 400 for ${label}`)
    assert.equal(res.headers.get('Cache-Control'), 'no-store')
    assert.equal(res.headers.get('Vary'), 'Origin, X-Bibleberry-Timezone')
  }

  // 4. V-DISC-SUBSET violation in upstream month fails closed (404)
  {
    const badDiscDoc = makeMonthlyPublicationDoc('2098-04', {
      discoveries: [
        {
          _key: 'bad-disc',
          discoverySlug: 'bad-disc',
          title: 'Out of Roster',
          qualifyingChallengeIds: ['outside-month-challenge-id'],
        },
      ],
    })
    const badFetch = createMockFetch(() =>
      new Response(JSON.stringify({ result: badDiscDoc }), { status: 200 }),
    )
    const res = await handleGatewayRequest(
      new Request('http://localhost/api/months/2098-04/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completedChallengeIds: [] }),
      }),
      TEST_ENV,
      { getNow, fetchImpl: badFetch },
    )
    assert.equal(res.status, 404)
  }

  // 5. Before month start returns neutral 404
  {
    const res = await handleGatewayRequest(
      new Request('http://localhost/api/months/2098-04/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completedChallengeIds: [] }),
      }),
      TEST_ENV,
      { getNow: () => new Date('2098-03-31T12:00:00Z'), fetchImpl: mockFetch },
    )
    assert.equal(res.status, 404)
  }
})

test('enforces route-specific CORS preflight, 405 method guards, and 502 upstream errors', async () => {
  // OPTIONS on progress allows POST, OPTIONS
  {
    const res = await handleGatewayRequest(
      new Request('http://localhost/api/months/2098-04/progress', {
        method: 'OPTIONS',
        headers: { Origin: 'http://localhost:3000' },
      }),
      TEST_ENV,
    )
    assert.equal(res.status, 204)
    assert.equal(res.headers.get('Access-Control-Allow-Methods'), 'POST, OPTIONS')
    assert.equal(
      res.headers.get('Access-Control-Allow-Headers'),
      'Content-Type, Accept, X-Bibleberry-Timezone',
    )
    assert.equal(res.headers.get('Vary'), 'Origin, X-Bibleberry-Timezone')
  }

  // OPTIONS on GET-only routes keeps GET, OPTIONS (never POST)
  for (const path of ['/api/months/2098-04/preview', '/api/months/2098-04', '/api/news']) {
    const res = await handleGatewayRequest(
      new Request(`http://localhost${path}`, {
        method: 'OPTIONS',
        headers: { Origin: 'http://localhost:3000' },
      }),
      TEST_ENV,
    )
    assert.equal(res.status, 204)
    assert.equal(res.headers.get('Access-Control-Allow-Methods'), 'GET, OPTIONS')

    const postRes = await handleGatewayRequest(
      new Request(`http://localhost${path}`, { method: 'POST' }),
      TEST_ENV,
    )
    assert.equal(postRes.status, 405)
    assert.equal(postRes.headers.get('Allow'), 'GET, OPTIONS')
  }

  // GET on progress -> 405 with Allow: POST, OPTIONS
  {
    const res = await handleGatewayRequest(
      new Request('http://localhost/api/months/2098-04/progress', { method: 'GET' }),
      TEST_ENV,
    )
    assert.equal(res.status, 405)
    assert.equal(res.headers.get('Allow'), 'POST, OPTIONS')
  }

  // Upstream failure yields controlled 502
  {
    const failFetch = createMockFetch(() => new Response('Forbidden', { status: 403 }))
    const res = await handleGatewayRequest(
      new Request('http://localhost/api/months/2098-04'),
      TEST_ENV,
      { getNow: () => new Date('2098-04-10T12:00:00Z'), fetchImpl: failFetch },
    )
    assert.equal(res.status, 502)
    assert.equal(res.headers.get('Cache-Control'), 'no-store')
    assert.equal(res.headers.get('Vary'), 'Origin, X-Bibleberry-Timezone')
  }
})

test('fails closed on unconfirmed Scripture rights in introduction and rejects streaming > 8 KiB POST bodies without Content-Length', async () => {
  const docWithUnlicensedIntro = makeMonthlyPublicationDoc('2098-04')
  docWithUnlicensedIntro.introduction.previewScreens = [
    {
      _key: 'intro-1',
      _type: 'introductionScreen',
      screenLabel: 'Preview',
      heading: 'Unlicensed Scripture Intro',
      blocks: [
        {
          _key: 'b1',
          _type: 'scriptureBlock',
          scripture: {
            reference: 'John 15:1',
            translation: 'ESV',
            textStatus: 'provided',
            passage: 'SECRET_UNLICENSED_INTRO_TEXT',
            usageRightsConfirmed: false,
            practiceStatus: 'notConfigured',
          },
        } as unknown as { _key: string; _type: string; text: string },
      ],
    },
  ]

  const mockFetch = createMockFetch(() =>
    new Response(JSON.stringify({ result: docWithUnlicensedIntro }), { status: 200 }),
  )
  const previewRes = await handleGatewayRequest(
    new Request('http://localhost/api/months/2098-04/preview'),
    TEST_ENV,
    { getNow: () => new Date('2098-03-29T12:00:00Z'), fetchImpl: mockFetch },
  )
  assert.equal(previewRes.status, 404)
  assert.equal((await previewRes.text()).includes('SECRET_UNLICENSED_INTRO_TEXT'), false)

  // Streaming > 8 KiB body without Content-Length header
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('{"completedChallengeIds":["'))
      controller.enqueue(encoder.encode('a'.repeat(9000)))
      controller.enqueue(encoder.encode('"]}'))
      controller.close()
    },
  })
  const streamReq = new Request('http://localhost/api/months/2098-04/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: stream,
    duplex: 'half',
  } as RequestInit)
  const streamRes = await handleGatewayRequest(streamReq, TEST_ENV, {
    getNow: () => new Date('2098-04-10T12:00:00Z'),
    fetchImpl: mockFetch,
  })
  assert.equal(streamRes.status, 400)
})
