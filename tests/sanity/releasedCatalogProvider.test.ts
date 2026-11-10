import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  createGatewayCatalogProvider,
  loadChallengeDetailForSummary,
} from '../../src/cms/reader/releasedCatalogProvider.ts'
import {
  createGatewayChallengeProvider,
  type ChallengeDetailProvider,
} from '../../src/cms/reader/challengeDetailProvider.ts'
import { deriveReleasedChallengeDetailState } from '../../src/cms/reader/releasedChallengeHostModel.ts'
import { admitTrustedCatalogChallenge } from '../../src/participation/admission.ts'

const makeValidGatewayCatalogItem = (overrides: Record<string, unknown> = {}) => ({
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
  summary: 'A short reflection on walking in truth and light.',
  primaryScripture: {
    reference: '1 John 1:7',
    translation: 'ESV',
    textStatus: 'provided',
    passage: 'If we walk in the light, as he is in the light, we have fellowship with one another.',
    usageRightsConfirmed: true,
    practiceStatus: 'configured',
  },
  editorialEligibility: {
    adaptationReviewed: true,
    reviewedAt: '2026-11-01T07:00:00Z',
  },
  ...overrides,
})

const makeValidGatewayDetailDoc = (overrides: Record<string, unknown> = {}) => ({
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
  editorialEligibility: {
    adaptationReviewed: true,
    reviewedAt: '2026-11-01T07:00:00Z',
  },
  ...overrides,
})

// ---------------------------------------------------------------------------
// 1. Empty and Populated Catalogs
// ---------------------------------------------------------------------------

test('returns empty status when gateway returns empty challenges array', async () => {
  const mockFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ ok: true, challenges: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  const provider = createGatewayCatalogProvider({ fetchImpl: mockFetch })
  const result = await provider.loadReleasedCatalog()

  assert.equal(result.status, 'empty')
  assert.equal(result.source, 'gateway')
})

test('returns ready status with populated, typed catalog summaries', async () => {
  const item1 = makeValidGatewayCatalogItem({
    _id: 'challenge-doc-1',
    slug: 'walking-in-the-light',
    sequence: 1,
  })
  const item2 = makeValidGatewayCatalogItem({
    _id: 'challenge-doc-2',
    slug: 'living-in-truth',
    title: 'Living in Truth',
    sequence: 2,
    summary: undefined,
  })

  const mockFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ ok: true, challenges: [item1, item2] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  const provider = createGatewayCatalogProvider({ fetchImpl: mockFetch })
  const result = await provider.loadReleasedCatalog()

  assert.equal(result.status, 'ready')
  assert.equal(result.source, 'gateway')
  if (result.status === 'ready') {
    assert.equal(result.challenges.length, 2)

    const c1 = result.challenges[0]
    assert.equal(c1.id, 'walking-in-the-light')
    assert.equal(c1.slug, 'walking-in-the-light')
    assert.equal(c1.documentId, 'challenge-doc-1')
    assert.equal(c1.title, 'Walking in the Light')
    assert.equal(c1.challengeType, 'teaching')
    assert.equal(c1.sequence, 1)
    assert.equal(c1.releaseAt, '2026-11-01T08:00:00Z')
    assert.equal(c1.releaseAtUtc, '2026-11-01T08:00:00.000Z')
    assert.equal(c1.summary, 'A short reflection on walking in truth and light.')
    assert.deepEqual(c1.series, {
      documentId: 'series-doc-uuid-5678',
      id: '1-john',
      title: 'Epistle of 1 John',
    })
    assert.equal(c1.primaryScripture.reference, '1 John 1:7')
    assert.equal(c1.primaryScripture.translation, 'ESV')
    assert.equal(c1.primaryScripture.textStatus, 'provided')
    assert.equal(c1.primaryScripture.usageRightsConfirmed, true)

    const c2 = result.challenges[1]
    assert.equal(c2.id, 'living-in-truth')
    assert.equal(c2.documentId, 'challenge-doc-2')
    assert.deepEqual(c2.series, {
      documentId: 'series-doc-uuid-5678',
      id: '1-john',
      title: 'Epistle of 1 John',
    })
    assert.equal(c2.summary, undefined)
  }
})

// ---------------------------------------------------------------------------
// 2. Same-Origin and Configured-Origin Requests
// ---------------------------------------------------------------------------

test('requests same-origin relative path /api/challenges when no baseUrl is configured', async () => {
  let capturedUrl = ''
  const mockFetch: typeof fetch = async (input) => {
    capturedUrl = String(input)
    return new Response(JSON.stringify({ ok: true, challenges: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const provider = createGatewayCatalogProvider({ fetchImpl: mockFetch, baseUrl: '' })
  await provider.loadReleasedCatalog()

  assert.equal(capturedUrl, '/api/challenges')
})

test('requests configured gateway origin and strips trailing slashes', async () => {
  let capturedUrl = ''
  const mockFetch: typeof fetch = async (input) => {
    capturedUrl = String(input)
    return new Response(JSON.stringify({ ok: true, challenges: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const provider = createGatewayCatalogProvider({
    baseUrl: 'https://gateway.bibleberry.org/',
    fetchImpl: mockFetch,
  })
  await provider.loadReleasedCatalog()

  assert.equal(capturedUrl, 'https://gateway.bibleberry.org/api/challenges')
})

test('supports per-request baseUrl override', async () => {
  let capturedUrl = ''
  const mockFetch: typeof fetch = async (input) => {
    capturedUrl = String(input)
    return new Response(JSON.stringify({ ok: true, challenges: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const provider = createGatewayCatalogProvider({
    baseUrl: 'https://default.gateway.org',
    fetchImpl: mockFetch,
  })
  await provider.loadReleasedCatalog({ baseUrl: 'https://override.gateway.org/' })

  assert.equal(capturedUrl, 'https://override.gateway.org/api/challenges')
})

// ---------------------------------------------------------------------------
// 3. Malformed JSON and Invalid Envelopes
// ---------------------------------------------------------------------------

test('returns validationError when response body is not valid JSON', async () => {
  const mockFetch: typeof fetch = async () =>
    new Response('<!DOCTYPE html><html><body>Error</body></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    })

  const provider = createGatewayCatalogProvider({ fetchImpl: mockFetch })
  const result = await provider.loadReleasedCatalog()

  assert.equal(result.status, 'validationError')
  assert.equal(result.source, 'gateway')
  if (result.status === 'validationError') {
    assert.match(result.message, /Invalid JSON response/)
  }
})

test('returns validationError when response envelope has ok !== true or missing challenges', async () => {
  const testCases = [
    { ok: false, error: { kind: 'upstreamError', message: 'Something went wrong' } },
    { ok: true },
    { ok: true, challenges: 'not-an-array' },
    { ok: true, challenges: null },
    null,
    'not-an-object',
  ]

  for (const body of testCases) {
    const mockFetch: typeof fetch = async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })

    const provider = createGatewayCatalogProvider({ fetchImpl: mockFetch })
    const result = await provider.loadReleasedCatalog()

    assert.equal(result.status, 'validationError')
    assert.equal(result.source, 'gateway')
    if (result.status === 'validationError') {
      assert.match(result.message, /Malformed gateway catalog envelope/)
    }
  }
})

// ---------------------------------------------------------------------------
// 4. Missing, Malformed, or Duplicate Challenge Identities and Schemas
// ---------------------------------------------------------------------------

test('returns validationError for missing or blank _id', async () => {
  const invalidItem = makeValidGatewayCatalogItem({ _id: '   ' })
  const mockFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ ok: true, challenges: [invalidItem] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  const provider = createGatewayCatalogProvider({ fetchImpl: mockFetch })
  const result = await provider.loadReleasedCatalog()

  assert.equal(result.status, 'validationError')
  assert.equal(result.source, 'gateway')
})

test('returns validationError for draft _id (drafts.*)', async () => {
  const invalidItem = makeValidGatewayCatalogItem({ _id: 'drafts.challenge-123' })
  const mockFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ ok: true, challenges: [invalidItem] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  const provider = createGatewayCatalogProvider({ fetchImpl: mockFetch })
  const result = await provider.loadReleasedCatalog()

  assert.equal(result.status, 'validationError')
  assert.equal(result.source, 'gateway')
})

test('returns validationError for missing or blank slug', async () => {
  const invalidItem = makeValidGatewayCatalogItem({ slug: '' })
  const mockFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ ok: true, challenges: [invalidItem] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  const provider = createGatewayCatalogProvider({ fetchImpl: mockFetch })
  const result = await provider.loadReleasedCatalog()

  assert.equal(result.status, 'validationError')
  assert.equal(result.source, 'gateway')
})

test('returns validationError when duplicate document IDs exist across the catalog', async () => {
  const item1 = makeValidGatewayCatalogItem({
    _id: 'duplicate-doc-id',
    slug: 'slug-one',
  })
  const item2 = makeValidGatewayCatalogItem({
    _id: 'duplicate-doc-id',
    slug: 'slug-two',
  })

  const mockFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ ok: true, challenges: [item1, item2] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  const provider = createGatewayCatalogProvider({ fetchImpl: mockFetch })
  const result = await provider.loadReleasedCatalog()

  assert.equal(result.status, 'validationError')
  assert.equal(result.source, 'gateway')
  if (result.status === 'validationError') {
    assert.ok(result.issues?.some(issue => issue.includes('Duplicate document ID "duplicate-doc-id"')))
  }
})

test('returns validationError when duplicate slugs exist across the catalog', async () => {
  const item1 = makeValidGatewayCatalogItem({
    _id: 'doc-one',
    slug: 'same-slug',
  })
  const item2 = makeValidGatewayCatalogItem({
    _id: 'doc-two',
    slug: 'same-slug',
  })

  const mockFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ ok: true, challenges: [item1, item2] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  const provider = createGatewayCatalogProvider({ fetchImpl: mockFetch })
  const result = await provider.loadReleasedCatalog()

  assert.equal(result.status, 'validationError')
  assert.equal(result.source, 'gateway')
  if (result.status === 'validationError') {
    assert.ok(result.issues?.some(issue => issue.includes('Duplicate slug "same-slug"')))
  }
})

test('fails closed without returning partial valid catalog when one item is invalid', async () => {
  const validItem = makeValidGatewayCatalogItem({ _id: 'doc-valid', slug: 'valid-slug' })
  const invalidItem = makeValidGatewayCatalogItem({ _id: 'doc-invalid', slug: '', releaseAt: 'invalid-date' })

  const mockFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ ok: true, challenges: [validItem, invalidItem] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  const provider = createGatewayCatalogProvider({ fetchImpl: mockFetch })
  const result = await provider.loadReleasedCatalog()

  // Must not return { status: 'ready', challenges: [validItem] }
  assert.equal(result.status, 'validationError')
  assert.equal(result.source, 'gateway')
})

// ---------------------------------------------------------------------------
// 4B. Schema Alignment with Detail Reader Mapper (Finding 2 Regression Tests)
// ---------------------------------------------------------------------------

test('fails closed for unsupported challengeType strings', async () => {
  const unsupportedTypes = ['quiz', 'interactive', 'video', '']
  for (const challengeType of unsupportedTypes) {
    const invalidItem = makeValidGatewayCatalogItem({ challengeType })
    const mockFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ ok: true, challenges: [invalidItem] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })

    const provider = createGatewayCatalogProvider({ fetchImpl: mockFetch })
    const result = await provider.loadReleasedCatalog()

    assert.equal(result.status, 'validationError', `Should fail for challengeType: ${challengeType}`)
    assert.equal(result.source, 'gateway')
  }
})

test('accepts all four reader-supported challenge types', async () => {
  const supportedTypes = ['teaching', 'discipline', 'reflection', 'memorization'] as const
  for (const challengeType of supportedTypes) {
    const validItem = makeValidGatewayCatalogItem({ challengeType, slug: `slug-${challengeType}` })
    const mockFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ ok: true, challenges: [validItem] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })

    const provider = createGatewayCatalogProvider({ fetchImpl: mockFetch })
    const result = await provider.loadReleasedCatalog()

    assert.equal(result.status, 'ready')
    if (result.status === 'ready') {
      assert.equal(result.challenges[0].challengeType, challengeType)
    }
  }
})

test('fails closed for invalid sequence numbers (0, negative, fractional, or non-numeric)', async () => {
  const invalidSequences = [0, -1, -100, 1.5, 0.25, 'one', true, {}]
  for (const sequence of invalidSequences) {
    const invalidItem = makeValidGatewayCatalogItem({ sequence })
    const mockFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ ok: true, challenges: [invalidItem] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })

    const provider = createGatewayCatalogProvider({ fetchImpl: mockFetch })
    const result = await provider.loadReleasedCatalog()

    assert.equal(result.status, 'validationError', `Should fail for sequence: ${sequence}`)
    assert.equal(result.source, 'gateway')
  }
})

test('accepts missing or null series and sequence for monthly/series-less catalog items', async () => {
  const seriesLessCases = [
    // undefined series & sequence
    { series: undefined, sequence: undefined },
    // null series & sequence
    { series: null, sequence: null },
  ]

  for (const overrides of seriesLessCases) {
    const seriesLessItem = makeValidGatewayCatalogItem({
      ...overrides,
      calendarSlot: {
        monthId: '2026-11',
        documentId: 'month-2026-11',
        monthTitle: 'Gratitude in Ordinary Life',
        publicationDate: '2026-11-09',
        dayOfMonth: 9,
      },
    })
    delete (seriesLessItem as Record<string, unknown>).releaseAt

    const mockFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ ok: true, challenges: [seriesLessItem] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })

    const provider = createGatewayCatalogProvider({ fetchImpl: mockFetch })
    const result = await provider.loadReleasedCatalog()

    assert.equal(result.status, 'ready')
    if (result.status === 'ready') {
      assert.equal(result.challenges.length, 1)
      const summary = result.challenges[0]
      assert.equal(summary.series, undefined)
      assert.equal(summary.sequence, undefined)
      assert.equal(summary.releaseAt, undefined)
      assert.equal(summary.releaseAtUtc, undefined)
      assert.deepEqual(summary.calendarSlot, {
        monthId: '2026-11',
        documentId: 'month-2026-11',
        monthTitle: 'Gratitude in Ordinary Life',
        publicationDate: '2026-11-09',
        dayOfMonth: 9,
      })
    }
  }
})

test('fails closed when calendarSlot monthId or documentId disagrees with publicationDate in catalog', async () => {
  const invalidMonthCases = [
    // monthId mismatch
    {
      monthId: '2027-04',
      publicationDate: '2027-03-09',
      dayOfMonth: 9,
    },
    // monthId non-YYYY-MM
    {
      monthId: 'march-2027',
      publicationDate: '2027-03-09',
      dayOfMonth: 9,
    },
    // documentId mismatch
    {
      monthId: '2027-03',
      documentId: 'month-2027-04',
      publicationDate: '2027-03-09',
      dayOfMonth: 9,
    },
    // non-deterministic documentId pattern
    {
      monthId: '2027-03',
      documentId: 'custom-month-doc',
      publicationDate: '2027-03-09',
      dayOfMonth: 9,
    },
  ]

  for (const calendarSlot of invalidMonthCases) {
    const item = makeValidGatewayCatalogItem({
      calendarSlot,
    })
    delete (item as Record<string, unknown>).releaseAt

    const mockFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ ok: true, challenges: [item] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })

    const provider = createGatewayCatalogProvider({ fetchImpl: mockFetch })
    const result = await provider.loadReleasedCatalog()

    assert.equal(result.status, 'validationError', `Expected validationError for: ${JSON.stringify(calendarSlot)}`)
    assert.equal(result.source, 'gateway')
  }
})

test('fails closed for malformed series objects when present', async () => {
  const malformedSeriesCases = [
    {},
    { _id: '', title: 'Valid Title', slug: 'valid-slug' },
    { _id: 'series-1', title: '', slug: 'valid-slug' },
    { _id: 'series-1', title: 'Valid Title', slug: '' },
  ]

  for (const series of malformedSeriesCases) {
    const item = makeValidGatewayCatalogItem({ series })
    const mockFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ ok: true, challenges: [item] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })

    const provider = createGatewayCatalogProvider({ fetchImpl: mockFetch })
    const result = await provider.loadReleasedCatalog()

    assert.equal(result.status, 'validationError')
    assert.equal(result.source, 'gateway')
  }
})

test('fails closed for missing, null, or invalid primaryScripture', async () => {
  const invalidScriptureCases = [
    undefined,
    null,
    {},
    // Missing reference
    { translation: 'ESV', textStatus: 'referenceOnly', practiceStatus: 'notConfigured', usageRightsConfirmed: false },
    // Missing translation
    { reference: 'John 1:1', textStatus: 'referenceOnly', practiceStatus: 'notConfigured', usageRightsConfirmed: false },
    // Provided without passage text
    { reference: 'John 1:1', translation: 'ESV', textStatus: 'provided', passage: '', usageRightsConfirmed: true, practiceStatus: 'notConfigured' },
    // Reference-only with passage text
    { reference: 'John 1:1', translation: 'ESV', textStatus: 'referenceOnly', passage: 'In the beginning', usageRightsConfirmed: true, practiceStatus: 'notConfigured' },
    // Provided passage without confirmed rights
    { reference: 'John 1:1', translation: 'ESV', textStatus: 'provided', passage: 'In the beginning', usageRightsConfirmed: false, practiceStatus: 'notConfigured' },
    // Memorization practice configured without provided text
    { reference: 'John 1:1', translation: 'ESV', textStatus: 'referenceOnly', practiceStatus: 'configured', usageRightsConfirmed: false },
  ]

  for (const primaryScripture of invalidScriptureCases) {
    const item = makeValidGatewayCatalogItem({ primaryScripture })
    const mockFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ ok: true, challenges: [item] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })

    const provider = createGatewayCatalogProvider({ fetchImpl: mockFetch })
    const result = await provider.loadReleasedCatalog()

    assert.equal(result.status, 'validationError')
    assert.equal(result.source, 'gateway')
  }
})

test('fails closed for missing or unreviewed editorialEligibility or malformed reviewedAt', async () => {
  const invalidEligibilityCases = [
    undefined,
    null,
    { adaptationReviewed: false, reviewedAt: '2026-11-01T07:00:00Z' },
    { adaptationReviewed: true, reviewedAt: 'invalid-date' },
    { adaptationReviewed: true, reviewedAt: '2026-11-01' }, // Missing time / explicit offset
    { adaptationReviewed: true, reviewedAt: '' },
  ]

  for (const editorialEligibility of invalidEligibilityCases) {
    const item = makeValidGatewayCatalogItem({ editorialEligibility })
    const mockFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ ok: true, challenges: [item] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })

    const provider = createGatewayCatalogProvider({ fetchImpl: mockFetch })
    const result = await provider.loadReleasedCatalog()

    assert.equal(result.status, 'validationError')
    assert.equal(result.source, 'gateway')
  }
})

// ---------------------------------------------------------------------------
// 5. HTTP 500/502 and Network Failures
// ---------------------------------------------------------------------------

test('returns requestError on HTTP 500 / 502 gateway errors', async () => {
  for (const status of [500, 502, 503]) {
    const mockFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ ok: false, error: { kind: 'upstreamError', message: 'Fail' } }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })

    const provider = createGatewayCatalogProvider({ fetchImpl: mockFetch })
    const result = await provider.loadReleasedCatalog()

    assert.equal(result.status, 'requestError')
    assert.equal(result.source, 'gateway')
    if (result.status === 'requestError') {
      assert.match(result.message, /Content gateway unavailable/)
    }
  }
})

test('returns requestError on HTTP 4xx error response', async () => {
  const mockFetch: typeof fetch = async () =>
    new Response('Bad Request', { status: 400 })

  const provider = createGatewayCatalogProvider({ fetchImpl: mockFetch })
  const result = await provider.loadReleasedCatalog()

  assert.equal(result.status, 'requestError')
  assert.equal(result.source, 'gateway')
  if (result.status === 'requestError') {
    assert.match(result.message, /Gateway returned HTTP 400/)
  }
})

test('returns requestError on fetch rejection (network failure)', async () => {
  const mockFetch: typeof fetch = async () => {
    throw new TypeError('Failed to fetch (DNS lookup failed)')
  }

  const provider = createGatewayCatalogProvider({ fetchImpl: mockFetch })
  const result = await provider.loadReleasedCatalog()

  assert.equal(result.status, 'requestError')
  assert.equal(result.source, 'gateway')
  if (result.status === 'requestError') {
    assert.match(result.message, /Failed to fetch/)
  }
})

// ---------------------------------------------------------------------------
// 6. AbortSignal Cancellation
// ---------------------------------------------------------------------------

test('propagates AbortError on request cancellation', async () => {
  const controller = new AbortController()
  controller.abort()

  const mockFetch: typeof fetch = async (_input, init) => {
    if (init?.signal?.aborted) {
      const error = new Error('This operation was aborted')
      error.name = 'AbortError'
      throw error
    }
    return new Response(JSON.stringify({ ok: true, challenges: [] }))
  }

  const provider = createGatewayCatalogProvider({ fetchImpl: mockFetch })

  await assert.rejects(
    async () => {
      await provider.loadReleasedCatalog({ signal: controller.signal })
    },
    (err: unknown) => {
      return err instanceof Error && err.name === 'AbortError'
    },
  )
})

// ---------------------------------------------------------------------------
// 7. Additional Unexpected/Private Fields Being Excluded from Mapped Output
// ---------------------------------------------------------------------------

test('strictly excludes unexpected and private fields from mapped catalog summaries', async () => {
  const upstreamWithPrivateData = makeValidGatewayCatalogItem({
    _type: 'challenge',
    unapprovedBlockCount: 0,
    internalReviewNotes: 'CONFIDENTIAL: Alexis to review before next Sunday',
    importProvenance: { importedAt: '2026-11-01', source: 'berrymark-cli' },
    screens: [{ _key: 'screen-1', heading: 'Screen 1', blocks: [] }],
    _rev: 'rev-39281982',
    author: { name: 'Staff Writer' },
    accountingCode: 'MIN-001',
    editorialEligibility: {
      adaptationReviewed: true,
      reviewedAt: '2026-11-01T07:00:00Z',
    },
  })

  const mockFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ ok: true, challenges: [upstreamWithPrivateData] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  const provider = createGatewayCatalogProvider({ fetchImpl: mockFetch })
  const result = await provider.loadReleasedCatalog()

  assert.equal(result.status, 'ready')
  if (result.status === 'ready') {
    const summary = result.challenges[0]

    // Verify allowed fields exist
    assert.equal(summary.id, 'walking-in-the-light')
    assert.equal(summary.slug, 'walking-in-the-light')
    assert.equal(summary.documentId, 'challenge-doc-uuid-1234')
    assert.equal(summary.title, 'Walking in the Light')
    assert.equal(summary.challengeType, 'teaching')
    assert.equal(summary.sequence, 1)
    assert.equal(summary.releaseAt, '2026-11-01T08:00:00Z')
    assert.equal(summary.releaseAtUtc, '2026-11-01T08:00:00.000Z')

    // Verify private and unexpected properties are NOT present on the summary object
    const rawSummary = summary as unknown as Record<string, unknown>
    assert.equal('internalReviewNotes' in rawSummary, false)
    assert.equal('importProvenance' in rawSummary, false)
    assert.equal('screens' in rawSummary, false)
    assert.equal('editorialEligibility' in rawSummary, false)
    assert.equal('reviewedAt' in rawSummary, false)
    assert.equal('unapprovedBlockCount' in rawSummary, false)
    assert.equal('_rev' in rawSummary, false)
    assert.equal('_type' in rawSummary, false)
    assert.equal('author' in rawSummary, false)
    assert.equal('accountingCode' in rawSummary, false)

    // Allowed summary keys: id, slug, documentId, title, summary, challengeType, sequence, releaseAt, releaseAtUtc, series, primaryScripture
    const allowedKeys = new Set([
      'id',
      'slug',
      'documentId',
      'title',
      'summary',
      'challengeType',
      'sequence',
      'releaseAt',
      'releaseAtUtc',
      'series',
      'primaryScripture',
    ])
    for (const key of Object.keys(summary)) {
      assert.ok(allowedKeys.has(key), `Key "${key}" should not be exposed in reader summary`)
    }
  }
})

// ---------------------------------------------------------------------------
// 8. Catalog Summaries Not Requiring Complete Challenge Screens
// ---------------------------------------------------------------------------

test('catalog summaries do not require complete Challenge screens or blocks', async () => {
  const itemWithoutScreens = makeValidGatewayCatalogItem()
  assert.equal('screens' in itemWithoutScreens, false)

  const mockFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ ok: true, challenges: [itemWithoutScreens] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  const provider = createGatewayCatalogProvider({ fetchImpl: mockFetch })
  const result = await provider.loadReleasedCatalog()

  assert.equal(result.status, 'ready')
  if (result.status === 'ready') {
    assert.equal(result.challenges.length, 1)
    assert.equal(result.challenges[0].slug, 'walking-in-the-light')
  }
})

// ---------------------------------------------------------------------------
// 9. Selected Summary Slug & Document Identity Integration (Finding 1 Regression Tests)
// ---------------------------------------------------------------------------

test('selected summary slug resolves through ChallengeDetailProvider when documentId matches, preserving participation identity', async () => {
  const catalogItem = makeValidGatewayCatalogItem({
    _id: 'canonical-doc-999',
    slug: 'walking-in-the-light',
  })
  const detailDoc = makeValidGatewayDetailDoc({
    _id: 'canonical-doc-999',
    slug: 'walking-in-the-light',
  })

  const mockCatalogFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ ok: true, challenges: [catalogItem] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  const mockDetailFetch: typeof fetch = async (input) => {
    const url = String(input)
    assert.match(url, /\/api\/challenges\/walking-in-the-light$/)
    return new Response(JSON.stringify({ ok: true, challenge: detailDoc }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const catalogProvider = createGatewayCatalogProvider({ fetchImpl: mockCatalogFetch })
  const detailProvider: ChallengeDetailProvider = createGatewayChallengeProvider({ fetchImpl: mockDetailFetch })

  // 1. Fetch catalog summaries
  const catalogResult = await catalogProvider.loadReleasedCatalog()
  assert.equal(catalogResult.status, 'ready')
  if (catalogResult.status !== 'ready') return

  const selectedSummary = catalogResult.challenges[0]
  assert.equal(selectedSummary.slug, 'walking-in-the-light')
  assert.equal(selectedSummary.documentId, 'canonical-doc-999')

  // 2. Resolve detail using helper function loadChallengeDetailForSummary
  const detailResult = await loadChallengeDetailForSummary(selectedSummary, detailProvider)
  assert.equal(detailResult.status, 'ready')
  assert.equal(detailResult.source, 'gateway')

  if (detailResult.status === 'ready') {
    assert.equal(detailResult.challenge.id, selectedSummary.slug)
    assert.equal(detailResult.challenge.documentId, selectedSummary.documentId)

    // 3. Verify participation capability token identity derivation
    const admitted = admitTrustedCatalogChallenge(detailResult.challenge)
    assert.ok(admitted, 'AdmittedChallenge capability token should be minted')
    assert.equal(admitted?.namespace, 'cms')
    assert.equal(admitted?.challengeId, 'cms:canonical-doc-999')
  }
})

test('fails closed with validationError when resolved detail documentId does not match selected summary documentId', async () => {
  // Selected catalog summary expects doc-original-A
  const selectedSummary = {
    slug: 'walking-in-the-light',
    documentId: 'doc-original-A',
  }

  // But detail endpoint resolves to doc-replaced-B (e.g. document recreation or stale cache)
  const detailDoc = makeValidGatewayDetailDoc({
    _id: 'doc-replaced-B',
    slug: 'walking-in-the-light',
  })

  const mockDetailFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ ok: true, challenge: detailDoc }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  const detailProvider = createGatewayChallengeProvider({ fetchImpl: mockDetailFetch })

  const result = await loadChallengeDetailForSummary(selectedSummary, detailProvider)

  assert.equal(result.status, 'validationError')
  assert.equal(result.source, 'gateway')
  if (result.status === 'validationError') {
    assert.ok(result.failures.length > 0)
    assert.match(result.failures[0].issues[0].message, /does not match selected catalog document ID/)
  }
})

test('fails closed with validationError when selected summary has missing or blank documentId', async () => {
  const detailProvider = createGatewayChallengeProvider()

  for (const docId of ['', '   ', undefined as unknown as string]) {
    const result = await loadChallengeDetailForSummary(
      { slug: 'walking-in-the-light', documentId: docId },
      detailProvider,
    )

    assert.equal(result.status, 'validationError')
    assert.equal(result.source, 'gateway')
  }
})

test('passes through non-ready detail provider results (notFound, requestError)', async () => {
  // 404 Not Found
  const mock404Fetch: typeof fetch = async () => new Response(null, { status: 404 })
  const detailProvider404 = createGatewayChallengeProvider({ fetchImpl: mock404Fetch })
  const result404 = await loadChallengeDetailForSummary(
    { slug: 'walking-in-the-light', documentId: 'doc-123' },
    detailProvider404,
  )
  assert.equal(result404.status, 'notFound')

  // 502 Upstream Error
  const mock502Fetch: typeof fetch = async () => new Response(null, { status: 502 })
  const detailProvider502 = createGatewayChallengeProvider({ fetchImpl: mock502Fetch })
  const result502 = await loadChallengeDetailForSummary(
    { slug: 'walking-in-the-light', documentId: 'doc-123' },
    detailProvider502,
  )
  assert.equal(result502.status, 'requestError')
})

// ---------------------------------------------------------------------------
// 10. Incorrect Device Clock Not Filtering Server-Authorized Catalog Entries
// ---------------------------------------------------------------------------

test('incorrect device clock (set in the past) does not filter server-authorized catalog entries', async () => {
  // Release date is Nov 1, 2026
  const catalogItem = makeValidGatewayCatalogItem({
    releaseAt: '2026-11-01T08:00:00Z',
  })
  const detailDoc = makeValidGatewayDetailDoc({
    releaseAt: '2026-11-01T08:00:00Z',
  })

  const mockCatalogFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ ok: true, challenges: [catalogItem] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  const mockDetailFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ ok: true, challenge: detailDoc }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  const catalogProvider = createGatewayCatalogProvider({ fetchImpl: mockCatalogFetch })
  const detailProvider = createGatewayChallengeProvider({ fetchImpl: mockDetailFetch })

  // Device clock set to year 2020 (far in the past, before release date)
  const deviceClockInPast = new Date('2020-01-01T00:00:00Z')

  // Catalog provider does not filter out the Challenge
  const catalogResult = await catalogProvider.loadReleasedCatalog()
  assert.equal(catalogResult.status, 'ready')
  if (catalogResult.status !== 'ready') return

  assert.equal(catalogResult.challenges.length, 1)
  const summary = catalogResult.challenges[0]

  // Reader detail resolution does not veto server-authorized Challenge despite device clock in the past
  const detailResult = await detailProvider.loadChallenge(summary.slug)
  assert.equal(detailResult.status, 'ready')

  const hostState = deriveReleasedChallengeDetailState(
    detailResult,
    summary.slug,
    deviceClockInPast,
  )

  assert.equal(hostState.status, 'ready')
  if (hostState.status === 'ready') {
    assert.equal(hostState.challenge.documentId, 'challenge-doc-uuid-1234')
  }
})

// ---------------------------------------------------------------------------
// 11. No Direct Sanity Fallback When Gateway Fails
// ---------------------------------------------------------------------------

test('does not fall back to direct Sanity reads when gateway fails', async () => {
  let sanityQueried = false
  const mockFetch: typeof fetch = async (input) => {
    const url = String(input)
    if (url.includes('sanity.io') || url.includes('/v2025-02-19/data/query')) {
      sanityQueried = true
      return new Response(JSON.stringify({ result: [] }), { status: 200 })
    }
    return new Response(
      JSON.stringify({ ok: false, error: { kind: 'upstreamError', message: 'Down' } }),
      { status: 502 },
    )
  }

  const provider = createGatewayCatalogProvider({ fetchImpl: mockFetch })
  const result = await provider.loadReleasedCatalog()

  assert.equal(result.status, 'requestError')
  assert.equal(result.source, 'gateway')
  assert.equal(sanityQueried, false, 'Must never fall back to direct Sanity queries')
})

// ---------------------------------------------------------------------------
// 12. Bundle Isolation and Token Protection
// ---------------------------------------------------------------------------

test('verifies zero imports of src/gateway/ and no SANITY_READ_TOKEN in releasedCatalogProvider', () => {
  const filePath = path.resolve(process.cwd(), 'src/cms/reader/releasedCatalogProvider.ts')
  const content = fs.readFileSync(filePath, 'utf8')

  assert.equal(
    content.includes("from '../gateway") ||
      content.includes('from "../gateway') ||
      content.includes("from '@/gateway") ||
      content.includes('SANITY_READ_TOKEN'),
    false,
    'releasedCatalogProvider.ts must not import src/gateway or reference SANITY_READ_TOKEN',
  )
})
