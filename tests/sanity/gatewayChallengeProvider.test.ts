import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createGatewayChallengeProvider,
  adaptCatalogProviderToDetailProvider,
  type ChallengeCatalogProvider,
} from '../../src/cms/reader/challengeDetailProvider.ts'

const makeValidGatewayChallengeDoc = (overrides = {}) => ({
  _id: 'challenge-doc-uuid-1234',
  _type: 'challenge',
  title: 'Walking in the Light',
  slug: 'walking-in-the-light',
  challengeType: 'teaching',
  series: {
    _id: 'series-doc-uuid-5678',
    title: 'Epistle of 1 John',
    slug: '1-john',
  },
  sequence: 1,
  releaseAt: '2026-11-01T08:00:00Z',
  primaryScripture: {
    reference: '1 John 1:7',
    translation: 'ESV',
    textStatus: 'provided',
    passage: 'If we walk in the light, as he is in the light, we have fellowship with one another.',
    usageRightsConfirmed: true,
    practiceStatus: 'configured',
  },
  screens: [
    {
      _key: 'screen-key-1',
      _type: 'challengeScreen',
      screenLabel: 'Step 1',
      heading: 'Introduction',
      blocks: [
        {
          _key: 'block-key-1',
          _type: 'statementBlock',
          text: 'Welcome to this teaching challenge.',
        },
      ],
    },
  ],
  companionLinks: [
    {
      _key: 'link-key-1',
      _type: 'companionLink',
      provider: 'youtube',
      label: 'Watch Devotional',
      url: 'https://youtube.com/example',
    },
  ],
  editorialEligibility: {
    adaptationReviewed: true,
    reviewedAt: '2026-11-01T07:00:00Z',
  },
  ...overrides,
})

// ---------------------------------------------------------------------------
// 1. URL Construction and Configuration
// ---------------------------------------------------------------------------

test('requests same-origin relative path /api/challenges/:slug when no baseUrl is configured', async () => {
  let capturedUrl = ''
  const mockFetch: typeof fetch = async (input) => {
    capturedUrl = String(input)
    return new Response(JSON.stringify({ ok: true, challenge: makeValidGatewayChallengeDoc() }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const provider = createGatewayChallengeProvider({ fetchImpl: mockFetch, baseUrl: '' })
  const result = await provider.loadChallenge('walking-in-the-light')

  assert.equal(capturedUrl, '/api/challenges/walking-in-the-light')
  assert.equal(result.status, 'ready')
  if (result.status === 'ready') {
    assert.equal(result.challenge.id, 'walking-in-the-light')
    assert.equal(result.challenge.documentId, 'challenge-doc-uuid-1234')
  }
})

test('requests configured gateway origin and strips trailing slashes', async () => {
  let capturedUrl = ''
  const mockFetch: typeof fetch = async (input) => {
    capturedUrl = String(input)
    return new Response(JSON.stringify({ ok: true, challenge: makeValidGatewayChallengeDoc() }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const provider = createGatewayChallengeProvider({
    baseUrl: 'https://gateway.bibleberry.org/',
    fetchImpl: mockFetch,
  })
  const result = await provider.loadChallenge('walking-in-the-light')

  assert.equal(capturedUrl, 'https://gateway.bibleberry.org/api/challenges/walking-in-the-light')
  assert.equal(result.status, 'ready')
})

test('supports per-request baseUrl override', async () => {
  let capturedUrl = ''
  const mockFetch: typeof fetch = async (input) => {
    capturedUrl = String(input)
    return new Response(JSON.stringify({ ok: true, challenge: makeValidGatewayChallengeDoc() }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const provider = createGatewayChallengeProvider({
    baseUrl: 'https://default-origin.example.com',
    fetchImpl: mockFetch,
  })
  const result = await provider.loadChallenge('walking-in-the-light', {
    baseUrl: 'https://override-origin.example.com/',
  })

  assert.equal(capturedUrl, 'https://override-origin.example.com/api/challenges/walking-in-the-light')
  assert.equal(result.status, 'ready')
})

test('returns notFound for blank, empty, or whitespace-only slug without initiating network requests', async () => {
  let fetchCalled = false
  const mockFetch: typeof fetch = async () => {
    fetchCalled = true
    return new Response(null, { status: 500 })
  }

  const provider = createGatewayChallengeProvider({ fetchImpl: mockFetch })
  const result1 = await provider.loadChallenge('')
  const result2 = await provider.loadChallenge('   ')

  assert.equal(result1.status, 'notFound')
  assert.equal(result2.status, 'notFound')
  assert.equal(fetchCalled, false)
})

// ---------------------------------------------------------------------------
// 2. HTTP Status and Envelope Handling
// ---------------------------------------------------------------------------

test('maps 200 OK challenge document preserving document ID, slug, and screen keys', async () => {
  const challengeDoc = makeValidGatewayChallengeDoc({
    _id: 'custom-doc-id-999',
    slug: 'custom-slug-999',
    screens: [
      {
        _key: 'custom-screen-key-abc',
        _type: 'challengeScreen',
        screenLabel: 'Step 1',
        heading: 'Heading 1',
        blocks: [
          {
            _key: 'custom-block-key-def',
            _type: 'statementBlock',
            text: 'Statement content',
          },
        ],
      },
    ],
  })

  const mockFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ ok: true, challenge: challengeDoc }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  const provider = createGatewayChallengeProvider({ fetchImpl: mockFetch })
  const result = await provider.loadChallenge('custom-slug-999')

  assert.equal(result.status, 'ready')
  if (result.status === 'ready') {
    assert.equal(result.challenge.id, 'custom-slug-999')
    assert.equal(result.challenge.documentId, 'custom-doc-id-999')
    assert.equal(result.challenge.screens[0].id, 'custom-screen-key-abc')
    assert.equal(result.challenge.screens[0].blocks[0].id, 'custom-block-key-def')
    assert.equal(result.challenge.primaryScripture?.reference, '1 John 1:7')
  }
})

test('returns notFound on HTTP 404 (neutral unavailable state for embargoed or nonexistent content)', async () => {
  const mockFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ ok: false, error: { kind: 'notFound', message: 'Challenge not found' } }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })

  const provider = createGatewayChallengeProvider({ fetchImpl: mockFetch })
  const result = await provider.loadChallenge('embargoed-challenge')

  assert.equal(result.status, 'notFound')
})

test('returns requestError on HTTP 500 / 502 upstream errors', async () => {
  for (const status of [500, 502, 503]) {
    const mockFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ ok: false, error: { kind: 'upstreamError', message: 'Upstream error' } }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })

    const provider = createGatewayChallengeProvider({ fetchImpl: mockFetch })
    const result = await provider.loadChallenge('failing-slug')

    assert.equal(result.status, 'requestError')
    if (result.status === 'requestError') {
      assert.ok(result.message.length > 0)
    }
  }
})

test('returns requestError on network failure (fetch rejected)', async () => {
  const mockFetch: typeof fetch = async () => {
    throw new Error('Failed to fetch')
  }

  const provider = createGatewayChallengeProvider({ fetchImpl: mockFetch })
  const result = await provider.loadChallenge('network-down-slug')

  assert.equal(result.status, 'requestError')
  if (result.status === 'requestError') {
    assert.equal(result.message, 'Failed to fetch')
  }
})

test('propagates AbortError on request cancellation', async () => {
  const controller = new AbortController()
  controller.abort()

  const mockFetch: typeof fetch = async (_input, init) => {
    if (init?.signal?.aborted) {
      throw new DOMException('The user aborted a request.', 'AbortError')
    }
    return new Response(JSON.stringify({ ok: true, challenge: makeValidGatewayChallengeDoc() }))
  }

  const provider = createGatewayChallengeProvider({ fetchImpl: mockFetch })
  await assert.rejects(
    async () => {
      await provider.loadChallenge('cancelled-slug', { signal: controller.signal })
    },
    (err: unknown) => err instanceof DOMException && err.name === 'AbortError',
  )
})

// ---------------------------------------------------------------------------
// 3. Payload and Schema Validation Fail-Closed
// ---------------------------------------------------------------------------

test('returns validationError when response body is not valid JSON', async () => {
  const mockFetch: typeof fetch = async () =>
    new Response('<html><body>Cloudflare 502 Bad Gateway</body></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    })

  const provider = createGatewayChallengeProvider({ fetchImpl: mockFetch })
  const result = await provider.loadChallenge('bad-json-slug')

  assert.equal(result.status, 'validationError')
  if (result.status === 'validationError') {
    assert.ok(result.failures.length > 0)
  }
})

test('returns validationError when response envelope is malformed or ok !== true', async () => {
  const malformedEnvelopes = [
    {},
    null,
    { ok: false },
    { ok: true }, // missing challenge
    { ok: true, challenge: null },
    { ok: true, challenge: 'not-an-object' },
  ]

  for (const env of malformedEnvelopes) {
    const mockFetch: typeof fetch = async () =>
      new Response(JSON.stringify(env), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })

    const provider = createGatewayChallengeProvider({ fetchImpl: mockFetch })
    const result = await provider.loadChallenge('malformed-envelope-slug')

    assert.equal(result.status, 'validationError')
  }
})

test('returns validationError when challenge document fails Zod schema validation in mapPublishedChallenge', async () => {
  // Missing required primaryScripture
  const invalidDoc = makeValidGatewayChallengeDoc({
    primaryScripture: undefined,
  })

  const mockFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ ok: true, challenge: invalidDoc }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  const provider = createGatewayChallengeProvider({ fetchImpl: mockFetch })
  const result = await provider.loadChallenge('invalid-schema-slug')

  assert.equal(result.status, 'validationError')
  if (result.status === 'validationError') {
    assert.ok(result.failures.length > 0)
    assert.ok(result.failures[0].issues.some(i => i.path.includes('primaryScripture')))
  }
})

// ---------------------------------------------------------------------------
// 4. Catalog Adapter Compatibility
// ---------------------------------------------------------------------------

test('adaptCatalogProviderToDetailProvider translates catalog results accurately', async () => {
  // Case A: Catalog ready with matching slug
  const readyCatalog: ChallengeCatalogProvider = {
    loadCatalog: async () => ({
      status: 'ready',
      challenges: [
        {
          id: 'catalog-challenge-1',
          documentId: 'doc-1',
          title: 'Catalog 1',
          challengeType: 'teaching',
          series: { id: 's1', documentId: 'sd1', title: 'Series 1' },
          sequence: 1,
          releaseAt: '2026-11-01T08:00:00Z',
          releaseAtUtc: '2026-11-01T08:00:00.000Z',
          screens: [],
          companionLinks: [],
          editorial: { adaptationReviewed: true, reviewedAt: '2026-11-01T07:00:00Z' },
        },
      ],
    }),
  }
  const adaptedReady = adaptCatalogProviderToDetailProvider(readyCatalog)
  const readyResult = await adaptedReady.loadChallenge('catalog-challenge-1')
  assert.equal(readyResult.status, 'ready')

  // Case B: Catalog ready but slug is missing
  const missingResult = await adaptedReady.loadChallenge('missing-slug')
  assert.equal(missingResult.status, 'notFound')

  // Case C: Catalog empty
  const emptyCatalog: ChallengeCatalogProvider = {
    loadCatalog: async () => ({ status: 'empty' }),
  }
  const adaptedEmpty = adaptCatalogProviderToDetailProvider(emptyCatalog)
  const emptyResult = await adaptedEmpty.loadChallenge('any-slug')
  assert.equal(emptyResult.status, 'notFound')

  // Case D: Catalog requestError
  const errorCatalog: ChallengeCatalogProvider = {
    loadCatalog: async () => ({ status: 'requestError', message: 'Sanity network error' }),
  }
  const adaptedError = adaptCatalogProviderToDetailProvider(errorCatalog)
  const errorResult = await adaptedError.loadChallenge('any-slug')
  assert.equal(errorResult.status, 'requestError')
  if (errorResult.status === 'requestError') {
    assert.equal(errorResult.message, 'Sanity network error')
  }

  // Case E: Catalog validationError
  const validationCatalog: ChallengeCatalogProvider = {
    loadCatalog: async () => ({
      status: 'validationError',
      failures: [{ issues: [{ path: 'document', message: 'Schema issue' }] }],
    }),
  }
  const adaptedValidation = adaptCatalogProviderToDetailProvider(validationCatalog)
  const validationResult = await adaptedValidation.loadChallenge('any-slug')
  assert.equal(validationResult.status, 'validationError')
})
