import assert from 'node:assert/strict'
import test from 'node:test'
import { handleGatewayRequest } from '../../src/gateway/handler.ts'
import type { GatewayEnv, GatewayFetch } from '../../src/gateway/types.ts'
import { mapPublishedChallenge } from '../../src/cms/sanity/mapChallenge.ts'
import { createGatewayCatalogProvider } from '../../src/cms/reader/releasedCatalogProvider.ts'
import { createGatewayChallengeProvider } from '../../src/cms/reader/challengeDetailProvider.ts'

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

function makeSlottedChallengeDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'berrymark-challenge-the-true-vine',
    _type: 'challenge',
    title: 'The True Vine',
    slug: 'the-true-vine',
    challengeType: 'teaching',
    withdrawn: false,
    primaryScripture: {
      reference: 'John 15:1-5',
      translation: 'WEBP',
      textStatus: 'provided',
      passage: 'I am the true vine, and my Father is the farmer.',
      usageRightsConfirmed: true,
      practiceStatus: 'notConfigured',
    },
    screens: [
      {
        _key: 's1',
        _type: 'challengeScreen',
        screenLabel: 'Daily Provision',
        heading: 'Abiding in the Vine',
        blocks: [
          {
            _key: 'b1',
            _type: 'statementBlock',
            text: 'Branches bear fruit only as they abide in the vine.',
          },
        ],
      },
    ],
    editorialEligibility: {
      adaptationReviewed: true,
      reviewedAt: '2027-02-14T16:30:00.000Z',
    },
    unapprovedBlockCount: 0,
    monthlyAssignments: [
      {
        _id: 'month-2027-03',
        yearMonth: '2027-03',
        year: 2027,
        month: 3,
        title: 'Abiding in the Vine',
        editorialStatus: 'scheduled',
        withdrawn: false,
        slots: [
          {
            _key: 'day-01',
            dayOfMonth: 1,
            date: '2027-03-01',
            slotStatus: 'scheduled',
            challengeRef: 'berrymark-challenge-the-true-vine',
          },
        ],
      },
    ],
    ...overrides,
  }
}

function makeLegacyChallengeDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'r05-3b-challenge-a-released',
    _type: 'challenge',
    title: 'Legacy Released Challenge',
    slug: 'legacy-released-challenge',
    challengeType: 'teaching',
    series: {
      _id: 'series-legacy',
      title: 'Legacy Series',
      slug: 'legacy-series',
    },
    sequence: 1,
    releaseAt: '2026-11-01T12:00:00.000Z',
    withdrawn: false,
    primaryScripture: {
      reference: 'Psalm 23:1',
      translation: 'Reference Only',
      textStatus: 'referenceOnly',
      usageRightsConfirmed: false,
      practiceStatus: 'notConfigured',
    },
    screens: [
      {
        _key: 'screen-legacy-1',
        _type: 'challengeScreen',
        screenLabel: 'Step 1',
        heading: 'Legacy Heading',
        blocks: [
          {
            _key: 'block-legacy-1',
            _type: 'statementBlock',
            text: 'Legacy statement block.',
          },
        ],
      },
    ],
    editorialEligibility: {
      adaptationReviewed: true,
      reviewedAt: '2026-10-30T12:00:00.000Z',
    },
    unapprovedBlockCount: 0,
    monthlyAssignments: [],
    ...overrides,
  }
}

test('serves published slotted 2027-03-01 Challenge without series, sequence, or releaseAt and passes reader mappers', async () => {
  const slottedDoc = makeSlottedChallengeDoc()
  let capturedUrl: URL | null = null
  let capturedAuthHeader: string | null = null

  const mockFetch = createMockFetch((url, init) => {
    capturedUrl = url
    const headers = new Headers(init?.headers)
    capturedAuthHeader = headers.get('Authorization')
    const query = url.searchParams.get('query') ?? ''
    if (query.includes('slug.current == $slug')) {
      return new Response(JSON.stringify({ result: slottedDoc }), { status: 200 })
    }
    return new Response(JSON.stringify({ result: [slottedDoc] }), { status: 200 })
  })

  const getNow = () => new Date('2027-03-01T06:00:00.000Z')

  // 1. Detail route
  const detailReq = new Request('http://localhost:3000/api/challenges/the-true-vine', {
    headers: {
      Origin: 'http://localhost:3000',
      'X-Bibleberry-Timezone': 'America/New_York',
    },
  })
  const detailRes = await handleGatewayRequest(detailReq, TEST_ENV, { getNow, fetchImpl: mockFetch })
  assert.equal(detailRes.status, 200)
  assert.equal(detailRes.headers.get('Cache-Control'), 'no-store')
  assert.equal(detailRes.headers.get('Vary'), 'Origin, X-Bibleberry-Timezone')
  assert.equal(capturedUrl?.searchParams.get('perspective'), 'published')
  assert.equal(capturedUrl?.searchParams.get('$authorizedLocalDate'), JSON.stringify('2027-03-01'))
  assert.equal(capturedAuthHeader, `Bearer ${TEST_ENV.SANITY_READ_TOKEN}`)

  const detailBody = (await detailRes.json()) as {
    ok: boolean
    serverContext: { authorizedLocalDate: string; effectiveTimeZone: string }
    challenge: Record<string, unknown>
  }
  assert.equal(detailBody.ok, true)
  assert.deepEqual(detailBody.serverContext, {
    authorizedLocalDate: '2027-03-01',
    effectiveTimeZone: 'America/New_York',
  })
  assert.equal('series' in detailBody.challenge, false)
  assert.equal('sequence' in detailBody.challenge, false)
  assert.equal('releaseAt' in detailBody.challenge, false)
  assert.deepEqual(detailBody.challenge.calendarSlot, {
    monthId: '2027-03',
    documentId: 'month-2027-03',
    monthTitle: 'Abiding in the Vine',
    publicationDate: '2027-03-01',
    dayOfMonth: 1,
  })

  // Verify consumer compatibility via mapPublishedChallenge and createGatewayChallengeProvider
  const mapped = mapPublishedChallenge(detailBody.challenge)
  assert.equal(mapped.ok, true)
  if (mapped.ok) {
    assert.equal(mapped.challenge.series, undefined)
    assert.equal(mapped.challenge.sequence, undefined)
    assert.equal(mapped.challenge.releaseAt, undefined)
    assert.equal(mapped.challenge.calendarSlot?.publicationDate, '2027-03-01')
  }

  const detailProvider = createGatewayChallengeProvider({
    baseUrl: 'http://localhost:3000',
    fetchImpl: async input =>
      handleGatewayRequest(
        new Request(typeof input === 'string' ? input : input.toString()),
        TEST_ENV,
        { getNow, fetchImpl: mockFetch },
      ),
  })
  const detailResult = await detailProvider.loadChallenge('the-true-vine')
  assert.equal(detailResult.status, 'ready')

  // 2. Catalog route + releasedCatalogProvider
  const catalogReq = new Request('http://localhost:3000/api/challenges', {
    headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
  })
  const catalogRes = await handleGatewayRequest(catalogReq, TEST_ENV, { getNow, fetchImpl: mockFetch })
  assert.equal(catalogRes.status, 200)
  const catalogBody = (await catalogRes.json()) as {
    ok: boolean
    serverContext: { authorizedLocalDate: string; effectiveTimeZone: string }
    challenges: Record<string, unknown>[]
  }
  assert.equal(catalogBody.ok, true)
  assert.deepEqual(catalogBody.serverContext, {
    authorizedLocalDate: '2027-03-01',
    effectiveTimeZone: 'America/New_York',
  })
  assert.equal(catalogBody.challenges.length, 1)
  assert.equal('series' in catalogBody.challenges[0], false)
  assert.equal('sequence' in catalogBody.challenges[0], false)
  assert.equal('releaseAt' in catalogBody.challenges[0], false)
  assert.deepEqual(catalogBody.challenges[0].calendarSlot, {
    monthId: '2027-03',
    documentId: 'month-2027-03',
    monthTitle: 'Abiding in the Vine',
    publicationDate: '2027-03-01',
    dayOfMonth: 1,
  })

  const catalogProvider = createGatewayCatalogProvider({
    baseUrl: 'http://localhost:3000',
    fetchImpl: async input =>
      handleGatewayRequest(
        new Request(typeof input === 'string' ? input : input.toString()),
        TEST_ENV,
        { getNow, fetchImpl: mockFetch },
      ),
  })
  const catalogResult = await catalogProvider.loadReleasedCatalog()
  assert.equal(catalogResult.status, 'ready')
  if (catalogResult.status === 'ready') {
    assert.equal(catalogResult.challenges[0].calendarSlot?.publicationDate, '2027-03-01')
    assert.equal(catalogResult.challenges[0].releaseAt, undefined)
  }
})

test('slotted Challenge omits stale releaseAt when released and never falls back to stale releaseAt when embargoed', async () => {
  const slottedWithStaleReleaseAt = makeSlottedChallengeDoc({
    releaseAt: '2020-01-01T00:00:00.000Z',
  })
  const mockFetch = createMockFetch(url => {
    const query = url.searchParams.get('query') ?? ''
    if (query.includes('slug.current == $slug')) {
      return new Response(JSON.stringify({ result: slottedWithStaleReleaseAt }), { status: 200 })
    }
    return new Response(JSON.stringify({ result: [slottedWithStaleReleaseAt] }), { status: 200 })
  })

  // Before 2027-03-01 in America/New_York -> must fail closed even though stale releaseAt is in 2020
  {
    const getNow = () => new Date('2027-03-01T04:00:00.000Z') // 2027-02-28 23:00 EST
    const detailRes = await handleGatewayRequest(
      new Request('http://localhost/api/challenges/the-true-vine', {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      TEST_ENV,
      { getNow, fetchImpl: mockFetch },
    )
    assert.equal(detailRes.status, 404)

    const catalogRes = await handleGatewayRequest(
      new Request('http://localhost/api/challenges', {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      TEST_ENV,
      { getNow, fetchImpl: mockFetch },
    )
    assert.equal(catalogRes.status, 200)
    const catalogBody = (await catalogRes.json()) as { challenges: unknown[] }
    assert.equal(catalogBody.challenges.length, 0)
  }

  // On 2027-03-01 in Asia/Tokyo -> released, stale releaseAt MUST be omitted
  {
    const getNow = () => new Date('2027-03-01T04:00:00.000Z') // 2027-03-01 13:00 JST
    const detailRes = await handleGatewayRequest(
      new Request('http://localhost/api/challenges/the-true-vine', {
        headers: { 'X-Bibleberry-Timezone': 'Asia/Tokyo' },
      }),
      TEST_ENV,
      { getNow, fetchImpl: mockFetch },
    )
    assert.equal(detailRes.status, 200)
    const detailBody = (await detailRes.json()) as { challenge: Record<string, unknown> }
    assert.equal('releaseAt' in detailBody.challenge, false)
    assert.ok(detailBody.challenge.calendarSlot)
  }
})

test('dual-path catalog mixes slotted and legacy Challenges while excluding unreleased items of both kinds', async () => {
  const slottedReleased = makeSlottedChallengeDoc()
  const slottedFuture = makeSlottedChallengeDoc({
    _id: 'berrymark-challenge-future-day',
    title: 'SECRET_FUTURE_SLOTTED_TITLE',
    slug: 'future-day',
    primaryScripture: {
      reference: 'John 15:9',
      translation: 'WEBP',
      textStatus: 'provided',
      passage: 'SECRET_FUTURE_SCRIPTURE_BODY',
      usageRightsConfirmed: true,
      practiceStatus: 'notConfigured',
    },
    monthlyAssignments: [
      {
        _id: 'month-2027-03',
        yearMonth: '2027-03',
        year: 2027,
        month: 3,
        title: 'Abiding in the Vine',
        editorialStatus: 'scheduled',
        withdrawn: false,
        slots: [
          {
            _key: 'day-02',
            dayOfMonth: 2,
            date: '2027-03-02',
            slotStatus: 'scheduled',
            challengeRef: 'berrymark-challenge-future-day',
          },
        ],
      },
    ],
  })
  const legacyReleased = makeLegacyChallengeDoc()
  const legacyFuture = makeLegacyChallengeDoc({
    _id: 'r05-3b-challenge-b-future',
    title: 'SECRET_FUTURE_LEGACY_TITLE',
    slug: 'legacy-future',
    releaseAt: '2099-01-01T00:00:00.000Z',
  })

  const mockFetch = createMockFetch(() =>
    new Response(
      JSON.stringify({
        result: [slottedReleased, slottedFuture, legacyReleased, legacyFuture],
      }),
      { status: 200 },
    ),
  )

  // At 2027-03-01T09:00:00Z: even Pacific/Kiritimati (UTC+14) is only 2027-03-01 23:00 -> 2027-03-02 is embargoed!
  // Include spoofed client Date header and query param to verify server clock governs.
  const req = new Request('http://localhost/api/challenges?now=2099-01-01T00:00:00Z', {
    headers: {
      Date: 'Thu, 01 Jan 2099 00:00:00 GMT',
      'X-Bibleberry-Timezone': 'Pacific/Kiritimati',
    },
  })
  const res = await handleGatewayRequest(req, TEST_ENV, {
    getNow: () => new Date('2027-03-01T09:00:00.000Z'),
    fetchImpl: mockFetch,
  })
  assert.equal(res.status, 200)

  const bodyText = await res.text()
  assert.equal(bodyText.includes('SECRET_FUTURE_SLOTTED_TITLE'), false)
  assert.equal(bodyText.includes('SECRET_FUTURE_SCRIPTURE_BODY'), false)
  assert.equal(bodyText.includes('SECRET_FUTURE_LEGACY_TITLE'), false)
  assert.equal(bodyText.includes('berrymark-challenge-future-day'), false)
  assert.equal(bodyText.includes('r05-3b-challenge-b-future'), false)

  const body = JSON.parse(bodyText) as {
    ok: boolean
    serverContext: { authorizedLocalDate: string; effectiveTimeZone: string }
    challenges: Array<Record<string, unknown>>
  }
  assert.equal(body.ok, true)
  assert.deepEqual(body.serverContext, {
    authorizedLocalDate: '2027-03-01',
    effectiveTimeZone: 'Pacific/Kiritimati',
  })
  assert.equal(body.challenges.length, 2)

  const slottedSummary = body.challenges.find(c => c._id === 'berrymark-challenge-the-true-vine')!
  assert.ok(slottedSummary.calendarSlot)
  assert.equal('releaseAt' in slottedSummary, false)

  const legacySummary = body.challenges.find(c => c._id === 'r05-3b-challenge-a-released')!
  assert.equal(legacySummary.releaseAt, '2026-11-01T12:00:00.000Z')
  assert.equal('calendarSlot' in legacySummary, false)
})

test('fails closed with byte-identical neutral 404 across all invalid, embargoed, withdrawn, duplicate, and guessed-slug cases', async () => {
  const negativeDocs: Array<{ label: string; doc: Record<string, unknown> | null }> = [
    { label: 'nonexistent guessed slug', doc: null },
    {
      label: 'unscheduled Challenge with missing monthly document and no releaseAt',
      doc: makeSlottedChallengeDoc({ monthlyAssignments: [] }),
    },
    {
      label: 'unscheduled month (editorialStatus: approved) with stale releaseAt',
      doc: makeSlottedChallengeDoc({
        releaseAt: '2020-01-01T00:00:00.000Z',
        monthlyAssignments: [
          {
            _id: 'month-2027-03',
            yearMonth: '2027-03',
            year: 2027,
            month: 3,
            title: 'Abiding in the Vine',
            editorialStatus: 'approved',
            withdrawn: false,
            slots: [
              {
                _key: 'day-01',
                dayOfMonth: 1,
                date: '2027-03-01',
                slotStatus: 'scheduled',
                challengeRef: 'berrymark-challenge-the-true-vine',
              },
            ],
          },
        ],
      }),
    },
    {
      label: 'withdrawn month with stale releaseAt',
      doc: makeSlottedChallengeDoc({
        releaseAt: '2020-01-01T00:00:00.000Z',
        monthlyAssignments: [
          {
            _id: 'month-2027-03',
            yearMonth: '2027-03',
            year: 2027,
            month: 3,
            title: 'Abiding in the Vine',
            editorialStatus: 'scheduled',
            withdrawn: true,
            slots: [
              {
                _key: 'day-01',
                dayOfMonth: 1,
                date: '2027-03-01',
                slotStatus: 'scheduled',
                challengeRef: 'berrymark-challenge-the-true-vine',
              },
            ],
          },
        ],
      }),
    },
    {
      label: 'withdrawn slot with stale releaseAt',
      doc: makeSlottedChallengeDoc({
        releaseAt: '2020-01-01T00:00:00.000Z',
        monthlyAssignments: [
          {
            _id: 'month-2027-03',
            yearMonth: '2027-03',
            year: 2027,
            month: 3,
            title: 'Abiding in the Vine',
            editorialStatus: 'scheduled',
            withdrawn: false,
            slots: [
              {
                _key: 'day-01',
                dayOfMonth: 1,
                date: '2027-03-01',
                slotStatus: 'withdrawn',
                challengeRef: 'berrymark-challenge-the-true-vine',
              },
            ],
          },
        ],
      }),
    },
    {
      label: 'withdrawn slotted Challenge with stale releaseAt',
      doc: makeSlottedChallengeDoc({
        withdrawn: true,
        releaseAt: '2020-01-01T00:00:00.000Z',
      }),
    },
    {
      label: 'withdrawn legacy Challenge',
      doc: makeLegacyChallengeDoc({ withdrawn: true }),
    },
    {
      label: 'assigned across two monthlyPublication documents',
      doc: makeSlottedChallengeDoc({
        monthlyAssignments: [
          {
            _id: 'month-2027-03',
            yearMonth: '2027-03',
            year: 2027,
            month: 3,
            title: 'Abiding in the Vine',
            editorialStatus: 'scheduled',
            withdrawn: false,
            slots: [
              {
                _key: 'day-01',
                dayOfMonth: 1,
                date: '2027-03-01',
                slotStatus: 'scheduled',
                challengeRef: 'berrymark-challenge-the-true-vine',
              },
            ],
          },
          {
            _id: 'month-2027-04',
            yearMonth: '2027-04',
            year: 2027,
            month: 4,
            title: 'April',
            editorialStatus: 'scheduled',
            withdrawn: false,
            slots: [
              {
                _key: 'day-01',
                dayOfMonth: 1,
                date: '2027-04-01',
                slotStatus: 'scheduled',
                challengeRef: 'berrymark-challenge-the-true-vine',
              },
            ],
          },
        ],
      }),
    },
    {
      label: 'assigned to two slots inside the same monthlyPublication',
      doc: makeSlottedChallengeDoc({
        monthlyAssignments: [
          {
            _id: 'month-2027-03',
            yearMonth: '2027-03',
            year: 2027,
            month: 3,
            title: 'Abiding in the Vine',
            editorialStatus: 'scheduled',
            withdrawn: false,
            slots: [
              {
                _key: 'day-01',
                dayOfMonth: 1,
                date: '2027-03-01',
                slotStatus: 'scheduled',
                challengeRef: 'berrymark-challenge-the-true-vine',
              },
              {
                _key: 'day-02',
                dayOfMonth: 2,
                date: '2027-03-02',
                slotStatus: 'scheduled',
                challengeRef: 'berrymark-challenge-the-true-vine',
              },
            ],
          },
        ],
      }),
    },
    {
      label: 'malformed monthly document ID (non-deterministic month-2027-03-synthetic)',
      doc: makeSlottedChallengeDoc({
        monthlyAssignments: [
          {
            _id: 'month-2027-03-synthetic',
            yearMonth: '2027-03',
            year: 2027,
            month: 3,
            title: 'Abiding in the Vine',
            editorialStatus: 'scheduled',
            withdrawn: false,
            slots: [
              {
                _key: 'day-01',
                dayOfMonth: 1,
                date: '2027-03-01',
                slotStatus: 'scheduled',
                challengeRef: 'berrymark-challenge-the-true-vine',
              },
            ],
          },
        ],
      }),
    },
    {
      label: 'draft monthlyPublication ID',
      doc: makeSlottedChallengeDoc({
        monthlyAssignments: [
          {
            _id: 'drafts.month-2027-03',
            yearMonth: '2027-03',
            year: 2027,
            month: 3,
            title: 'Abiding in the Vine',
            editorialStatus: 'scheduled',
            withdrawn: false,
            slots: [
              {
                _key: 'day-01',
                dayOfMonth: 1,
                date: '2027-03-01',
                slotStatus: 'scheduled',
                challengeRef: 'berrymark-challenge-the-true-vine',
              },
            ],
          },
        ],
      }),
    },
    {
      label: 'draft Challenge ID',
      doc: makeSlottedChallengeDoc({
        _id: 'drafts.berrymark-challenge-the-true-vine',
      }),
    },
    {
      label: 'unreviewed slotted Challenge',
      doc: makeSlottedChallengeDoc({
        editorialEligibility: {
          adaptationReviewed: false,
          reviewedAt: '2027-02-14T16:30:00.000Z',
        },
      }),
    },
    {
      label: 'unapproved block on slotted Challenge',
      doc: makeSlottedChallengeDoc({
        unapprovedBlockCount: 1,
        screens: [
          {
            _key: 's1',
            _type: 'challengeScreen',
            screenLabel: 'Step 1',
            heading: 'Draft',
            blocks: [{ _key: 'b1', _type: 'comparisonBlock', reviewStatus: 'proposed' }],
          },
        ],
      }),
    },
    {
      label: 'unconfirmed Scripture rights on slotted Challenge',
      doc: makeSlottedChallengeDoc({
        primaryScripture: {
          reference: 'John 15:1',
          translation: 'ESV',
          textStatus: 'provided',
          passage: 'RESTRICTED_SECRET_PASSAGE',
          usageRightsConfirmed: false,
          practiceStatus: 'notConfigured',
        },
      }),
    },
  ]

  let baseline404Body: string | null = null
  const getNow = () => new Date('2027-03-10T12:00:00.000Z')

  for (const { label, doc } of negativeDocs) {
    const detailMock = createMockFetch(() =>
      new Response(JSON.stringify({ result: doc }), { status: 200 }),
    )
    const detailRes = await handleGatewayRequest(
      new Request('http://localhost/api/challenges/the-true-vine', {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      TEST_ENV,
      { getNow, fetchImpl: detailMock },
    )
    assert.equal(detailRes.status, 404, `Expected 404 for ${label}`)
    assert.equal(detailRes.headers.get('Cache-Control'), 'no-store')
    assert.equal(detailRes.headers.get('Vary'), 'Origin, X-Bibleberry-Timezone')
    const detailText = await detailRes.text()
    if (baseline404Body === null) {
      baseline404Body = detailText
    } else {
      assert.equal(detailText, baseline404Body, `404 body for ${label} must be byte-identical`)
    }

    if (doc !== null) {
      const catalogMock = createMockFetch(() =>
        new Response(JSON.stringify({ result: [doc] }), { status: 200 }),
      )
      const catalogRes = await handleGatewayRequest(
        new Request('http://localhost/api/challenges', {
          headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
        }),
        TEST_ENV,
        { getNow, fetchImpl: catalogMock },
      )
      assert.equal(catalogRes.status, 200)
      const catalogBody = (await catalogRes.json()) as { challenges: unknown[] }
      assert.equal(
        catalogBody.challenges.length,
        0,
        `Catalog must exclude negative case: ${label}`,
      )
    }
  }
})

test('fails closed on invalid civil calendar slot metadata and enforces published perspective in upstream Sanity queries', async () => {
  const invalidSlotDocs: Array<{ label: string; doc: Record<string, unknown> }> = [
    {
      label: 'non-leap Feb 29 date in 2027-02',
      doc: makeSlottedChallengeDoc({
        monthlyAssignments: [
          {
            _id: 'month-2027-02',
            yearMonth: '2027-02',
            year: 2027,
            month: 2,
            title: 'February 2027',
            editorialStatus: 'scheduled',
            withdrawn: false,
            slots: [
              {
                _key: 'day-29',
                dayOfMonth: 29,
                date: '2027-02-29',
                slotStatus: 'scheduled',
                challengeRef: 'berrymark-challenge-the-true-vine',
              },
            ],
          },
        ],
      }),
    },
    {
      label: 'mismatched dayOfMonth vs slot.date',
      doc: makeSlottedChallengeDoc({
        monthlyAssignments: [
          {
            _id: 'month-2027-03',
            yearMonth: '2027-03',
            year: 2027,
            month: 3,
            title: 'Abiding in the Vine',
            editorialStatus: 'scheduled',
            withdrawn: false,
            slots: [
              {
                _key: 'day-01',
                dayOfMonth: 2,
                date: '2027-03-01',
                slotStatus: 'scheduled',
                challengeRef: 'berrymark-challenge-the-true-vine',
              },
            ],
          },
        ],
      }),
    },
    {
      label: 'slot.date outside assignment yearMonth',
      doc: makeSlottedChallengeDoc({
        monthlyAssignments: [
          {
            _id: 'month-2027-03',
            yearMonth: '2027-03',
            year: 2027,
            month: 3,
            title: 'Abiding in the Vine',
            editorialStatus: 'scheduled',
            withdrawn: false,
            slots: [
              {
                _key: 'day-01',
                dayOfMonth: 1,
                date: '2027-02-01',
                slotStatus: 'scheduled',
                challengeRef: 'berrymark-challenge-the-true-vine',
              },
            ],
          },
        ],
      }),
    },
    {
      label: 'mismatched year/month metadata on monthlyPublication',
      doc: makeSlottedChallengeDoc({
        monthlyAssignments: [
          {
            _id: 'month-2027-03',
            yearMonth: '2027-03',
            year: 2027,
            month: 4,
            title: 'Abiding in the Vine',
            editorialStatus: 'scheduled',
            withdrawn: false,
            slots: [
              {
                _key: 'day-01',
                dayOfMonth: 1,
                date: '2027-03-01',
                slotStatus: 'scheduled',
                challengeRef: 'berrymark-challenge-the-true-vine',
              },
            ],
          },
        ],
      }),
    },
  ]

  const capturedUrls: URL[] = []
  const getNow = () => new Date('2027-04-01T12:00:00.000Z')

  for (const { label, doc } of invalidSlotDocs) {
    const mockFetch = createMockFetch(url => {
      capturedUrls.push(url)
      return new Response(JSON.stringify({ result: doc }), { status: 200 })
    })
    const res = await handleGatewayRequest(
      new Request('http://localhost/api/challenges/the-true-vine'),
      TEST_ENV,
      { getNow, fetchImpl: mockFetch },
    )
    assert.equal(res.status, 404, `Expected 404 for ${label}`)
  }

  assert.equal(capturedUrls.length, invalidSlotDocs.length)
  for (const url of capturedUrls) {
    assert.equal(url.searchParams.get('perspective'), 'published')
    const query = url.searchParams.get('query') ?? ''
    assert.equal(query.includes('withdrawn != true'), true)
    assert.equal(query.includes('!(_id in path("drafts.**"))'), true)
    assert.equal(query.includes('$authorizedLocalDate'), true)
    assert.equal(query.includes('$nowUtc'), true)
  }
})

