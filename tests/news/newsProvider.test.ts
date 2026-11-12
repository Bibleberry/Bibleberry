import assert from 'node:assert/strict'
import test from 'node:test'
import { handleGatewayRequest } from '../../src/gateway/handler.ts'
import type { GatewayEnv } from '../../src/gateway/types.ts'
import {
  createNewsGatewayProvider,
  detectReaderTimeZone,
  isValidCivilDate,
  isValidIanaTimeZone,
  isValidSanityCdnCoverUrl,
  parseNewsFeedResponse,
  resolveReaderTimeZone,
  type NewsArticle,
} from '../../src/cms/reader/newsProvider.ts'

const TEST_GATEWAY_ENV: GatewayEnv = {
  SANITY_PROJECT_ID: '80016lrq',
  SANITY_DATASET: 'staging',
  SANITY_READ_TOKEN: 'test-token-12345',
  ALLOWED_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
}

function makeValidFeedResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    serverContext: {
      authorizedLocalDate: '2026-11-12',
      effectiveTimeZone: 'America/New_York',
    },
    articles: [
      {
        id: 'ministry-update-1',
        documentId: 'news-ministry-update-1',
        category: 'ministryUpdate',
        publishedOn: '2026-11-10',
        title: 'Ministry Growth Update',
        summary: 'Recent updates on Bibleberry teaching and translations.',
        body: [
          {
            _key: 'b1',
            _type: 'block',
            style: 'normal',
            children: [{ _key: 's1', _type: 'span', text: 'Paragraph content.' }],
          },
        ],
        coverImage: {
          url: 'https://cdn.sanity.io/images/80016lrq/production/test-cover.png',
          alt: 'Open Bible on a wooden table',
        },
      },
      {
        id: 'general-announcement-1',
        documentId: 'news-announcement-1',
        category: 'announcement',
        publishedOn: '2026-11-11',
        title: 'Winter Publication Schedule',
        summary: 'Details on upcoming reading schedules.',
      },
      {
        id: 'preview-2026-12',
        documentId: 'news-preview-2026-12',
        category: 'monthlyPreview',
        publishedOn: '2026-11-12',
        title: 'Coming in December 2026',
        summary: 'Advance preview of the December 2026 monthly publication.',
        destination: {
          kind: 'month',
          monthId: '2026-12',
        },
      },
    ],
    ...overrides,
  }
}

test('parseNewsFeedResponse accepts valid feed and returns typed ready result', () => {
  const payload = makeValidFeedResponse()
  const result = parseNewsFeedResponse(payload)
  assert.equal(result.ok, true)
  if (!result.ok) return

  assert.equal(result.serverContext.authorizedLocalDate, '2026-11-12')
  assert.equal(result.serverContext.effectiveTimeZone, 'America/New_York')
  assert.equal(result.articles.length, 3)

  const [update, announcement, preview] = result.articles
  assert.equal(update.category, 'ministryUpdate')
  assert.equal(update.title, 'Ministry Growth Update')
  assert.equal(update.coverImage?.url, 'https://cdn.sanity.io/images/80016lrq/production/test-cover.png')
  assert.equal(update.coverImage?.alt, 'Open Bible on a wooden table')
  assert.ok(update.body && update.body.length > 0)

  assert.equal(announcement.category, 'announcement')
  assert.equal(announcement.destination, undefined)

  assert.equal(preview.category, 'monthlyPreview')
  assert.deepEqual(preview.destination, { kind: 'month', monthId: '2026-12' })
  assert.equal('body' in preview, false)
  assert.equal('coverImage' in preview, false)
})

test('parseNewsFeedResponse rejects leaked editorial and internal metadata fields fail-closed', () => {
  const forbiddenCases = [
    { editorialReview: { reviewedBy: 'Editor', reviewedAt: '2026-11-10T12:00:00Z' } },
    { reviewNotes: 'INTERNAL_NOTE_DO_NOT_LEAK' },
    { withdrawn: false },
    { sourceSnapshot: { monthTitle: 'Secret' } },
    { sourceDigestSha256: 'abc' },
    { editorialStatus: 'approved' },
    { editorialEligibility: 'eligible' },
    { slots: ['slot-1'] },
    { qualifyingChallenges: ['ch-1'] },
    { earnedCard: { cardDocumentId: 'card-1' } },
  ]

  for (const extra of forbiddenCases) {
    const payload = makeValidFeedResponse({
      articles: [
        {
          id: 'test-1',
          documentId: 'news-test-1',
          category: 'ministryUpdate',
          publishedOn: '2026-11-10',
          title: 'Title',
          summary: 'Summary',
          ...extra,
        },
      ],
    })
    const result = parseNewsFeedResponse(payload)
    assert.equal(result.ok, false, `Expected rejection for forbidden key: ${Object.keys(extra)[0]}`)
  }
})

test('parseNewsFeedResponse rejects draft document IDs', () => {
  const payload = makeValidFeedResponse({
    articles: [
      {
        id: 'draft-article',
        documentId: 'drafts.news-draft-1',
        category: 'announcement',
        publishedOn: '2026-11-10',
        title: 'Draft Title',
        summary: 'Draft Summary',
      },
    ],
  })
  const result = parseNewsFeedResponse(payload)
  assert.equal(result.ok, false)
})

test('parseNewsFeedResponse rejects monthlyPreview with body or coverImage', () => {
  const withBody = makeValidFeedResponse({
    articles: [
      {
        id: 'preview-with-body',
        documentId: 'news-preview-2026-12',
        category: 'monthlyPreview',
        publishedOn: '2026-11-12',
        title: 'December Preview',
        summary: 'Summary',
        destination: { kind: 'month', monthId: '2026-12' },
        body: [{ _key: 'b1', _type: 'block', children: [{ _key: 's1', _type: 'span', text: 'Leaked' }] }],
      },
    ],
  })
  assert.equal(parseNewsFeedResponse(withBody).ok, false)

  const withCover = makeValidFeedResponse({
    articles: [
      {
        id: 'preview-with-cover',
        documentId: 'news-preview-2026-12',
        category: 'monthlyPreview',
        publishedOn: '2026-11-12',
        title: 'December Preview',
        summary: 'Summary',
        destination: { kind: 'month', monthId: '2026-12' },
        coverImage: {
          url: 'https://cdn.sanity.io/images/80016lrq/production/cover.png',
          alt: 'Cover',
        },
      },
    ],
  })
  assert.equal(parseNewsFeedResponse(withCover).ok, false)
})

test('parseNewsFeedResponse rejects monthlyPreview missing month destination', () => {
  const noDestination = makeValidFeedResponse({
    articles: [
      {
        id: 'preview-no-dest',
        documentId: 'news-preview-2026-12',
        category: 'monthlyPreview',
        publishedOn: '2026-11-12',
        title: 'December Preview',
        summary: 'Summary',
      },
    ],
  })
  assert.equal(parseNewsFeedResponse(noDestination).ok, false)
})

test('parseNewsFeedResponse rejects non-Sanity cover image URLs', () => {
  const externalImage = makeValidFeedResponse({
    articles: [
      {
        id: 'ext-image',
        documentId: 'news-ext-image',
        category: 'ministryUpdate',
        publishedOn: '2026-11-10',
        title: 'Update',
        summary: 'Summary',
        coverImage: {
          url: 'https://untrusted-host.example.com/image.png',
          alt: 'Example alt',
        },
      },
    ],
  })
  assert.equal(parseNewsFeedResponse(externalImage).ok, false)
})

test('createNewsGatewayProvider loadNews fetches from same-origin /api/news with timezone header', async () => {
  let capturedUrl: string | null = null
  let capturedHeaders: Record<string, string> = {}

  const mockFetch: typeof fetch = async (input, init) => {
    capturedUrl = String(input)
    const headers = new Headers(init?.headers)
    capturedHeaders = {
      Accept: headers.get('Accept') ?? '',
      'X-Bibleberry-Timezone': headers.get('X-Bibleberry-Timezone') ?? '',
    }
    return new Response(JSON.stringify(makeValidFeedResponse()), { status: 200 })
  }

  const provider = createNewsGatewayProvider({
    fetchImpl: mockFetch,
    resolveTimeZone: () => 'America/Chicago',
  })

  const result = await provider.loadNews()
  assert.equal(result.status, 'ready')
  assert.equal(capturedUrl, '/api/news')
  assert.equal(capturedHeaders['Accept'], 'application/json')
  assert.equal(capturedHeaders['X-Bibleberry-Timezone'], 'America/Chicago')
  if (result.status === 'ready') {
    assert.equal(result.articles.length, 3)
  }
})

test('createNewsGatewayProvider loadNews applies category query parameter and validates response match', async () => {
  let capturedUrl: string | null = null

  const mockFetch: typeof fetch = async input => {
    capturedUrl = String(input)
    return new Response(
      JSON.stringify(
        makeValidFeedResponse({
          articles: [
            {
              id: 'announcement-1',
              documentId: 'news-announcement-1',
              category: 'announcement',
              publishedOn: '2026-11-11',
              title: 'Announcement',
              summary: 'Summary text',
            },
          ],
        }),
      ),
      { status: 200 },
    )
  }

  const provider = createNewsGatewayProvider({ fetchImpl: mockFetch })
  const result = await provider.loadNews({ category: 'announcement' })

  assert.equal(result.status, 'ready')
  assert.equal(capturedUrl, '/api/news?category=announcement')
})

test('createNewsGatewayProvider rejects invalid category before making network request', async () => {
  let fetchCalled = false
  const mockFetch: typeof fetch = async () => {
    fetchCalled = true
    return new Response('{}', { status: 200 })
  }

  const provider = createNewsGatewayProvider({ fetchImpl: mockFetch })
  // @ts-expect-error testing invalid category runtime handling
  const result = await provider.loadNews({ category: 'invalidCategory' })

  assert.equal(fetchCalled, false)
  assert.equal(result.status, 'validationError')
  assert.ok(result.message.includes('Invalid news category filter'))
})

test('createNewsGatewayProvider rejects direct Sanity API URLs', async () => {
  let fetchCalled = false
  const mockFetch: typeof fetch = async () => {
    fetchCalled = true
    return new Response('{}', { status: 200 })
  }

  for (const sanityBase of ['https://80016lrq.api.sanity.io', 'https://sanity.io']) {
    const provider = createNewsGatewayProvider({ baseUrl: sanityBase, fetchImpl: mockFetch })
    const result = await provider.loadNews()
    assert.equal(fetchCalled, false)
    assert.equal(result.status, 'validationError')
    assert.ok(result.message.includes('Direct Sanity API URLs are prohibited'))
  }
})

test('createNewsGatewayProvider returns empty status when articles array is empty', async () => {
  const mockFetch: typeof fetch = async () => {
    return new Response(JSON.stringify(makeValidFeedResponse({ articles: [] })), { status: 200 })
  }

  const provider = createNewsGatewayProvider({ fetchImpl: mockFetch })
  const result = await provider.loadNews()

  assert.equal(result.status, 'empty')
  if (result.status === 'empty') {
    assert.deepEqual(result.articles, [])
    assert.equal(result.serverContext.authorizedLocalDate, '2026-11-12')
  }
})

test('createNewsGatewayProvider handles non-transient 400 Bad Request immediately without retrying', async () => {
  let callCount = 0
  const mockFetch: typeof fetch = async () => {
    callCount++
    return new Response(JSON.stringify({ ok: false, message: 'Invalid news category filter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const provider = createNewsGatewayProvider({ fetchImpl: mockFetch, maxRetries: 3 })
  const result = await provider.loadNews()

  assert.equal(callCount, 1)
  assert.equal(result.status, 'requestError')
  if (result.status === 'requestError') {
    assert.equal(result.httpStatus, 400)
    assert.equal(result.message, 'Invalid news category filter')
  }
})

test('createNewsGatewayProvider retries transient 502 Bad Gateway and succeeds if subsequent attempt succeeds', async () => {
  let callCount = 0
  const mockFetch: typeof fetch = async () => {
    callCount++
    if (callCount === 1) {
      return new Response(JSON.stringify({ ok: false, message: 'Upstream content service unavailable' }), {
        status: 502,
      })
    }
    return new Response(JSON.stringify(makeValidFeedResponse()), { status: 200 })
  }

  const provider = createNewsGatewayProvider({
    fetchImpl: mockFetch,
    maxRetries: 2,
    retryDelayMs: 10,
  })

  const result = await provider.loadNews()
  assert.equal(callCount, 2)
  assert.equal(result.status, 'ready')
})

test('createNewsGatewayProvider handles abort signal cleanly', async () => {
  const controller = new AbortController()
  controller.abort()

  const mockFetch: typeof fetch = async () => {
    return new Response(JSON.stringify(makeValidFeedResponse()), { status: 200 })
  }

  const provider = createNewsGatewayProvider({ fetchImpl: mockFetch })
  const result = await provider.loadNews({ signal: controller.signal })

  assert.equal(result.status, 'requestError')
  assert.ok(result.message.includes('aborted'))
})

test('time zone and civil date validation utilities', () => {
  assert.equal(isValidIanaTimeZone('America/New_York'), true)
  assert.equal(isValidIanaTimeZone('UTC'), true)
  assert.equal(isValidIanaTimeZone('GMT'), true)
  assert.equal(isValidIanaTimeZone('invalid/zone'), false)
  assert.equal(isValidIanaTimeZone('GMT+5'), false)
  assert.equal(resolveReaderTimeZone(undefined), 'America/New_York')
  assert.equal(resolveReaderTimeZone('Asia/Tokyo'), 'Asia/Tokyo')

  assert.equal(isValidCivilDate('2026-11-12'), true)
  assert.equal(isValidCivilDate('2026-02-29'), false)
  assert.equal(isValidCivilDate('2024-02-29'), true)
  assert.equal(isValidCivilDate('invalid-date'), false)

  assert.equal(
    isValidSanityCdnCoverUrl('https://cdn.sanity.io/images/80016lrq/production/cover.png'),
    true,
  )
  assert.equal(isValidSanityCdnCoverUrl('http://cdn.sanity.io/images/proj/dataset/cover.png'), false)
  assert.equal(isValidSanityCdnCoverUrl('https://evil.com/images/proj/dataset/cover.png'), false)
})

test('createNewsGatewayProvider end-to-end integration with handleGatewayRequest', async () => {
  const upstreamDocs = [
    {
      _id: 'news-general-1',
      _type: 'newsArticle',
      title: 'General Update',
      slug: 'general-update-1',
      category: 'ministryUpdate',
      summary: 'Summary of the update.',
      body: [
        {
          _key: 'b1',
          _type: 'block',
          style: 'normal',
          children: [{ _key: 's1', _type: 'span', text: 'Body text.' }],
        },
      ],
      publishOnDate: '2026-11-10',
      withdrawn: false,
      editorialReview: {
        reviewedBy: 'Aaron Waid',
        reviewerRole: 'technical_synthetic',
        reviewedAt: '2026-11-09T12:00:00Z',
        reviewNotes: 'LEAK_CHECK_SECRET_NOTE',
      },
      sourceSnapshot: {
        monthTitle: 'LEAK_CHECK_SNAPSHOT',
      },
    },
    {
      _id: 'news-withdrawn-item',
      _type: 'newsArticle',
      title: 'SECRET_WITHDRAWN_TITLE',
      slug: 'withdrawn-item',
      category: 'announcement',
      summary: 'Withdrawn summary',
      publishOnDate: '2026-11-10',
      withdrawn: true,
      editorialReview: {
        reviewedBy: 'Aaron Waid',
        reviewerRole: 'technical_synthetic',
        reviewedAt: '2026-11-09T12:00:00Z',
      },
    },
  ]

  const mockUpstreamFetch: typeof fetch = async () => {
    return new Response(JSON.stringify({ result: upstreamDocs }), { status: 200 })
  }

  // Gateway handler fetch adapter
  const gatewayFetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input), 'http://localhost:3000')
    const req = new Request(url, {
      method: init?.method ?? 'GET',
      headers: init?.headers,
    })
    return handleGatewayRequest(req, TEST_GATEWAY_ENV, {
      fetchImpl: mockUpstreamFetch,
      getNow: () => new Date('2026-11-12T12:00:00Z'),
    })
  }

  const provider = createNewsGatewayProvider({
    fetchImpl: gatewayFetchImpl,
    resolveTimeZone: () => 'America/New_York',
  })

  const result = await provider.loadNews()
  assert.equal(result.status, 'ready')
  if (result.status === 'ready') {
    assert.equal(result.articles.length, 1)
    const article = result.articles[0]
    assert.equal(article.id, 'general-update-1')
    assert.equal(article.title, 'General Update')
    assert.equal(article.category, 'ministryUpdate')

    const serialized = JSON.stringify(result)
    assert.equal(serialized.includes('LEAK_CHECK_SECRET_NOTE'), false)
    assert.equal(serialized.includes('LEAK_CHECK_SNAPSHOT'), false)
    assert.equal(serialized.includes('SECRET_WITHDRAWN_TITLE'), false)
    assert.equal(serialized.includes('withdrawn'), false)
    assert.equal(serialized.includes('editorialReview'), false)
  }
})

