import assert from 'node:assert/strict'
import test from 'node:test'
import { handleGatewayRequest } from '../../src/gateway/handler.ts'
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

function makeNewsDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'news-ministry-update-1',
    _type: 'newsArticle',
    title: 'Ministry Update',
    slug: 'ministry-update-1',
    category: 'ministryUpdate',
    summary: 'An update on upcoming Bible studies.',
    body: [
      {
        _key: 'b1',
        _type: 'block',
        style: 'normal',
        markDefs: [],
        children: [{ _key: 's1', _type: 'span', text: 'Full body paragraph.', marks: [] }],
      },
    ],
    publishOnDate: '2098-02-20',
    withdrawn: false,
    editorialReview: {
      reviewedBy: 'Aaron Waid (technical synthetic approval)',
      reviewerRole: 'technical_synthetic',
      reviewedAt: '2098-02-19T12:00:00.000Z',
      reviewNotes: 'INTERNAL_NEWS_NOTE_DO_NOT_LEAK',
    },
    sourceSnapshot: {
      monthTitle: 'INTERNAL_SNAPSHOT_DO_NOT_LEAK',
      sourceDigestSha256: 'a'.repeat(64),
    },
    ...overrides,
  }
}

function makePreviewNewsDoc(yearMonth: string, overrides: Record<string, unknown> = {}) {
  return makeNewsDoc({
    _id: `news-preview-${yearMonth}`,
    title: `Coming in ${yearMonth}`,
    slug: `preview-${yearMonth}`,
    category: 'monthlyPreview',
    summary: `Advance preview for ${yearMonth}.`,
    publishOnDate: yearMonth === '2098-03' ? '2098-02-27' : '2097-12-28',
    relatedMonth: {
      _id: `month-${yearMonth}`,
      yearMonth,
      year: Number(yearMonth.slice(0, 4)),
      month: Number(yearMonth.slice(5, 7)),
      editorialStatus: 'scheduled',
      withdrawn: false,
    },
    ...overrides,
  })
}

test('GET /api/news serves reviewed general articles and monthlyPreview strictly at preview start while excluding broken/unreviewed/withdrawn/future articles', async () => {
  const generalUpdate = makeNewsDoc()
  const announcement = makeNewsDoc({
    _id: 'news-announcement-1',
    title: 'General Announcement',
    slug: 'general-announcement-1',
    category: 'announcement',
    publishOnDate: '2098-02-25',
  })
  const marchPreview = makePreviewNewsDoc('2098-03')
  const futureArticle = makeNewsDoc({
    _id: 'news-future-1',
    title: 'SECRET_FUTURE_NEWS',
    slug: 'future-1',
    publishOnDate: '2098-03-05',
  })
  const unreviewedArticle = makeNewsDoc({
    _id: 'news-unreviewed-1',
    title: 'SECRET_UNREVIEWED_NEWS',
    slug: 'unreviewed-1',
    editorialReview: { reviewerRole: 'technical_synthetic' },
  })
  const withdrawnArticle = makeNewsDoc({
    _id: 'news-withdrawn-1',
    title: 'SECRET_WITHDRAWN_NEWS',
    slug: 'withdrawn-1',
    withdrawn: true,
  })
  const draftArticle = makeNewsDoc({
    _id: 'drafts.news-draft-1',
    title: 'SECRET_DRAFT_NEWS',
    slug: 'draft-1',
  })
  const brokenPreviewMonth = makePreviewNewsDoc('2098-04', {
    publishOnDate: '2098-02-27',
    relatedMonth: null,
  })
  const withdrawnPreviewMonth = makePreviewNewsDoc('2098-05', {
    publishOnDate: '2098-02-27',
    relatedMonth: {
      _id: 'month-2098-05',
      yearMonth: '2098-05',
      year: 2098,
      month: 5,
      editorialStatus: 'scheduled',
      withdrawn: true,
    },
  })
  const unscheduledPreviewMonth = makePreviewNewsDoc('2098-06', {
    publishOnDate: '2098-02-27',
    relatedMonth: {
      _id: 'month-2098-06',
      yearMonth: '2098-06',
      year: 2098,
      month: 6,
      editorialStatus: 'approved',
      withdrawn: false,
    },
  })

  const allDocs = [
    generalUpdate,
    announcement,
    marchPreview,
    futureArticle,
    unreviewedArticle,
    withdrawnArticle,
    draftArticle,
    brokenPreviewMonth,
    withdrawnPreviewMonth,
    unscheduledPreviewMonth,
  ]

  let capturedUrl: URL | null = null
  const mockFetch = createMockFetch(url => {
    capturedUrl = url
    return new Response(JSON.stringify({ result: allDocs }), { status: 200 })
  })

  // Before Feb 27 (2098-02-26) -> generalUpdate + announcement only (marchPreview excluded)
  {
    const res = await handleGatewayRequest(
      new Request('http://localhost/api/news?now=2098-03-10', {
        headers: {
          'X-Bibleberry-Timezone': 'America/New_York',
          Date: 'Thu, 01 Jan 2099 00:00:00 GMT',
        },
      }),
      TEST_ENV,
      { getNow: () => new Date('2098-02-26T18:00:00Z'), fetchImpl: mockFetch },
    )
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('Cache-Control'), 'no-store')
    assert.equal(res.headers.get('ETag'), null)
    assert.equal(res.headers.get('Last-Modified'), null)
    const text = await res.text()
    assert.doesNotMatch(text, /SECRET_|news-preview-2098-03|INTERNAL_NEWS_NOTE_DO_NOT_LEAK/)
    const body = JSON.parse(text) as { articles: Array<{ documentId: string }> }
    assert.deepEqual(
      body.articles.map(a => a.documentId),
      ['news-announcement-1', 'news-ministry-update-1'],
    )
  }

  // On Feb 27 in Asia/Tokyo vs NY at 2098-02-27T02:00:00Z
  {
    const tokyoRes = await handleGatewayRequest(
      new Request('http://localhost/api/news?category=monthlyPreview', {
        headers: { 'X-Bibleberry-Timezone': 'Asia/Tokyo' },
      }),
      TEST_ENV,
      { getNow: () => new Date('2098-02-27T02:00:00Z'), fetchImpl: mockFetch },
    )
    assert.equal(tokyoRes.status, 200)
    assert.equal(capturedUrl?.searchParams.get('perspective'), 'published')
    assert.equal(capturedUrl?.searchParams.get('$category'), JSON.stringify('monthlyPreview'))
    assert.equal(capturedUrl?.searchParams.get('$authorizedLocalDate'), JSON.stringify('2098-02-27'))

    const text = await tokyoRes.text()
    assert.equal(text.includes('INTERNAL_NEWS_NOTE_DO_NOT_LEAK'), false)
    assert.equal(text.includes('INTERNAL_SNAPSHOT_DO_NOT_LEAK'), false)
    assert.equal(text.includes('sourceSnapshot'), false)
    assert.equal(text.includes('editorialReview'), false)
    assert.equal(text.includes('SECRET_'), false)

    const body = JSON.parse(text) as {
      ok: boolean
      serverContext: { authorizedLocalDate: string; effectiveTimeZone: string }
      articles: Array<{
        id: string
        documentId: string
        category: string
        publishedOn: string
        destination?: { kind: string; monthId: string }
      }>
    }
    assert.equal(body.ok, true)
    assert.deepEqual(body.serverContext, {
      authorizedLocalDate: '2098-02-27',
      effectiveTimeZone: 'Asia/Tokyo',
    })
    assert.equal(body.articles.length, 1)
    assert.deepEqual(body.articles[0].destination, { kind: 'month', monthId: '2098-03' })

    const nyRes = await handleGatewayRequest(
      new Request('http://localhost/api/news?category=monthlyPreview', {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      TEST_ENV,
      { getNow: () => new Date('2098-02-27T02:00:00Z'), fetchImpl: mockFetch },
    )
    assert.equal(nyRes.status, 200)
    const nyBody = (await nyRes.json()) as { articles: unknown[] }
    assert.equal(nyBody.articles.length, 0)
  }

  // Invalid or duplicate ?category query param -> 400 badRequest
  for (const badQuery of [
    '?category=invalidCategory',
    '?category=',
    '?category=monthlyPreview&category=announcement',
  ]) {
    const res = await handleGatewayRequest(
      new Request(`http://localhost/api/news${badQuery}`),
      TEST_ENV,
      { getNow: () => new Date('2098-02-27T12:00:00Z'), fetchImpl: mockFetch },
    )
    assert.equal(res.status, 400)
    assert.equal(res.headers.get('Cache-Control'), 'no-store')
    assert.equal(res.headers.get('Vary'), 'Origin, X-Bibleberry-Timezone')
  }
})

test('GET /api/news enforces coverImage alt requirement and handles valid coverImage cleanly', async () => {
  const validCover = makeNewsDoc({
    _id: 'news-cover-valid',
    slug: 'cover-valid',
    coverImage: {
      url: 'https://cdn.sanity.io/images/80016lrq/staging/news-cover.png',
      alt: 'Open Bible notebook illustration',
    },
  })
  const missingAlt = makeNewsDoc({
    _id: 'news-cover-missing-alt',
    slug: 'cover-missing-alt',
    title: 'SECRET_MISSING_ALT_NEWS',
    coverImage: {
      url: 'https://cdn.sanity.io/images/80016lrq/staging/no-alt.png',
      alt: '',
    },
  })

  const mockFetch = createMockFetch(() =>
    new Response(JSON.stringify({ result: [validCover, missingAlt] }), { status: 200 }),
  )
  const res = await handleGatewayRequest(
    new Request('http://localhost/api/news'),
    TEST_ENV,
    { getNow: () => new Date('2098-02-27T12:00:00Z'), fetchImpl: mockFetch },
  )
  assert.equal(res.status, 200)
  const text = await res.text()
  assert.equal(text.includes('SECRET_MISSING_ALT_NEWS'), false)
  const body = JSON.parse(text) as {
    articles: Array<{ documentId: string; coverImage?: { url: string; alt: string } }>
  }
  assert.equal(body.articles.length, 1)
  assert.deepEqual(body.articles[0].coverImage, {
    url: 'https://cdn.sanity.io/images/80016lrq/staging/news-cover.png',
    alt: 'Open Bible notebook illustration',
  })
})

test('GET /api/news enforces minimal monthlyPreview allowlist (strips sentinel body and coverImage on both filtered and unfiltered requests)', async () => {
  const generalUpdate = makeNewsDoc({
    coverImage: {
      url: 'https://cdn.sanity.io/images/80016lrq/staging/general-cover.png',
      alt: 'General ministry update cover',
    },
  })
  const previewWithSentinels = makePreviewNewsDoc('2098-03', {
    body: [
      {
        _key: 'b-sentinel',
        _type: 'block',
        style: 'normal',
        markDefs: [],
        children: [
          { _key: 's-sentinel', _type: 'span', text: 'SENTINEL_PREVIEW_BODY_DO_NOT_LEAK', marks: [] },
        ],
      },
    ],
    coverImage: {
      url: 'https://cdn.sanity.io/images/80016lrq/staging/sentinel-preview-cover.png',
      alt: 'SENTINEL_PREVIEW_COVER_ALT_DO_NOT_LEAK',
    },
  })

  const mockFetch = createMockFetch(() =>
    new Response(JSON.stringify({ result: [previewWithSentinels, generalUpdate] }), { status: 200 }),
  )

  // Filtered ?category=monthlyPreview
  {
    const res = await handleGatewayRequest(
      new Request('http://localhost/api/news?category=monthlyPreview', {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      TEST_ENV,
      { getNow: () => new Date('2098-02-27T12:00:00Z'), fetchImpl: mockFetch },
    )
    assert.equal(res.status, 200)
    const text = await res.text()
    assert.equal(text.includes('SENTINEL_PREVIEW_BODY_DO_NOT_LEAK'), false)
    assert.equal(text.includes('sentinel-preview-cover.png'), false)
    assert.equal(text.includes('SENTINEL_PREVIEW_COVER_ALT_DO_NOT_LEAK'), false)
    const body = JSON.parse(text) as { articles: Array<Record<string, unknown>> }
    assert.equal(body.articles.length, 1)
    assert.deepEqual(Object.keys(body.articles[0]).sort(), [
      'category',
      'destination',
      'documentId',
      'id',
      'publishedOn',
      'summary',
      'title',
    ])
    assert.equal('body' in body.articles[0], false)
    assert.equal('coverImage' in body.articles[0], false)
  }

  // Unfiltered /api/news: monthlyPreview remains minimal while ministryUpdate retains body and coverImage
  {
    const res = await handleGatewayRequest(
      new Request('http://localhost/api/news', {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      TEST_ENV,
      { getNow: () => new Date('2098-02-27T12:00:00Z'), fetchImpl: mockFetch },
    )
    assert.equal(res.status, 200)
    const text = await res.text()
    assert.equal(text.includes('SENTINEL_PREVIEW_BODY_DO_NOT_LEAK'), false)
    assert.equal(text.includes('sentinel-preview-cover.png'), false)
    assert.equal(text.includes('SENTINEL_PREVIEW_COVER_ALT_DO_NOT_LEAK'), false)
    const body = JSON.parse(text) as { articles: Array<Record<string, unknown>> }
    assert.equal(body.articles.length, 2)
    const previewArticle = body.articles.find(a => a.category === 'monthlyPreview')
    const updateArticle = body.articles.find(a => a.category === 'ministryUpdate')
    assert.ok(previewArticle)
    assert.ok(updateArticle)
    assert.equal('body' in previewArticle, false)
    assert.equal('coverImage' in previewArticle, false)
    assert.deepEqual(Object.keys(previewArticle).sort(), [
      'category',
      'destination',
      'documentId',
      'id',
      'publishedOn',
      'summary',
      'title',
    ])
    assert.equal(Array.isArray(updateArticle.body), true)
    assert.deepEqual(updateArticle.coverImage, {
      url: 'https://cdn.sanity.io/images/80016lrq/staging/general-cover.png',
      alt: 'General ministry update cover',
    })
  }
})
