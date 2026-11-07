import assert from 'node:assert/strict'
import test from 'node:test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { handleGatewayRequest } from '../../src/gateway/handler.ts'
import type { GatewayEnv, GatewayFetch } from '../../src/gateway/types.ts'

const TEST_ENV: GatewayEnv = {
  SANITY_PROJECT_ID: 'test-project',
  SANITY_DATASET: 'test-dataset',
  SANITY_READ_TOKEN: 'test-reader-token-secret-12345',
  ALLOWED_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
}

const makeValidChallengeDoc = (overrides: Record<string, unknown> = {}) => ({
  _id: 'b46839a6-d0f3-48fc-ae37-7d821a77f045',
  _type: 'challenge',
  title: 'Test Published Challenge',
  slug: 'test-published-challenge',
  challengeType: 'teaching',
  series: {
    _id: 'series-123',
    title: 'Test Series',
    slug: 'test-series',
  },
  sequence: 1,
  releaseAt: '2026-11-06T18:00:00.000Z',
  summary: 'A short archive summary',
  primaryScripture: {
    reference: 'Psalm 23:1',
    translation: 'WEB',
    textStatus: 'referenceOnly',
    usageRightsConfirmed: false,
    practiceStatus: 'notConfigured',
  },
  screens: [
    {
      _key: 'screen-key-1',
      _type: 'challengeScreen',
      screenLabel: 'Step 1',
      heading: 'First Step Heading',
      blocks: [
        {
          _key: 'block-1',
          _type: 'statementBlock',
          text: 'This is statement text',
          label: 'Teacher note',
        },
      ],
    },
  ],
  companionLinks: [
    {
      _key: 'link-1',
      _type: 'companionLink',
      provider: 'youtube',
      label: 'Watch devotional',
      url: 'https://youtube.com/example',
    },
  ],
  editorialEligibility: {
    adaptationReviewed: true,
    reviewedAt: '2026-11-01T12:00:00.000Z',
  },
  // Internal metadata that must NEVER leak to client
  editorialReview: {
    adaptationReviewed: true,
    reviewedBy: 'Alexis Waid',
    reviewedAt: '2026-11-01T12:00:00.000Z',
    reviewNotes: 'Confidential internal editor notes: do not leak',
    sourceRevision: 'v2.1 draft manuscript',
  },
  importProvenance: {
    canonicalId: 'berrymark-challenge-test-published-challenge',
    importedAt: '2026-11-01T11:00:00.000Z',
  },
  _rev: 'rev-internal-secret',
  _system: { base: { id: 'sys-id' } },
  ...overrides,
})

function createMockFetch(handler: (url: URL, init?: RequestInit) => Response | Promise<Response>): GatewayFetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? new URL(input) : input instanceof URL ? input : new URL(input.url)
    return handler(url, init)
  }
}

// ---------------------------------------------------------------------------
// 1. Exact Release Boundaries (Minus 1 ms, Exact, Plus 1 ms)
// ---------------------------------------------------------------------------

test('evaluates exact release boundary: minus 1ms (404), exact (200), plus 1ms (200)', async () => {
  const boundaryIso = '2026-11-06T18:00:00.000Z'
  const boundaryMs = Date.parse(boundaryIso)
  const challenge = makeValidChallengeDoc({ releaseAt: boundaryIso })

  const mockFetch = createMockFetch((url) => {
    // Upstream GROQ query parameter evaluation
    const nowUtcParam = url.searchParams.get('$nowUtc')
    assert.ok(nowUtcParam)
    const serverNowMs = Date.parse(JSON.parse(nowUtcParam))

    if (serverNowMs >= boundaryMs) {
      return new Response(JSON.stringify({ result: challenge }), { status: 200 })
    }
    // Future release is filtered out upstream by GROQ
    return new Response(JSON.stringify({ result: null }), { status: 200 })
  })

  // 1ms before boundary -> 404 Not Found (embargoed)
  {
    const req = new Request('http://localhost/api/challenges/test-published-challenge')
    const res = await handleGatewayRequest(req, TEST_ENV, {
      getNow: () => new Date(boundaryMs - 1),
      fetchImpl: mockFetch,
    })
    assert.equal(res.status, 404)
    assert.equal(res.headers.get('Cache-Control'), 'no-store')
    const body = await res.json() as { ok: boolean; error: { kind: string } }
    assert.equal(body.ok, false)
    assert.equal(body.error.kind, 'notFound')
    assert.equal('challenge' in body, false)
  }

  // Exact boundary -> 200 OK
  {
    const req = new Request('http://localhost/api/challenges/test-published-challenge')
    const res = await handleGatewayRequest(req, TEST_ENV, {
      getNow: () => new Date(boundaryMs),
      fetchImpl: mockFetch,
    })
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('Cache-Control'), 'no-store')
    const body = await res.json() as { ok: boolean; challenge: { title: string } }
    assert.equal(body.ok, true)
    assert.equal(body.challenge.title, 'Test Published Challenge')
  }

  // 1ms past boundary -> 200 OK
  {
    const req = new Request('http://localhost/api/challenges/test-published-challenge')
    const res = await handleGatewayRequest(req, TEST_ENV, {
      getNow: () => new Date(boundaryMs + 1),
      fetchImpl: mockFetch,
    })
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('Cache-Control'), 'no-store')
    const body = await res.json() as { ok: boolean; challenge: { title: string } }
    assert.equal(body.ok, true)
    assert.equal(body.challenge.title, 'Test Published Challenge')
  }
})

// ---------------------------------------------------------------------------
// 2. Equivalent Instants Across Timezone Offsets
// ---------------------------------------------------------------------------

test('normalizes timestamps with different timezone offsets to identical UTC release instants', async () => {
  // 18:00 UTC == 13:00 EST (-05:00) == 03:00 next day JST (+09:00)
  const instantEst = '2026-11-06T13:00:00-05:00'
  const instantJst = '2026-11-07T03:00:00+09:00'
  const targetMs = Date.parse('2026-11-06T18:00:00.000Z')

  for (const offsetTimestamp of [instantEst, instantJst]) {
    const challenge = makeValidChallengeDoc({ releaseAt: offsetTimestamp })
    const mockFetch = createMockFetch((url) => {
      const nowUtcParam = url.searchParams.get('$nowUtc')
      assert.ok(nowUtcParam)
      const serverNowMs = Date.parse(JSON.parse(nowUtcParam))
      if (serverNowMs >= targetMs) {
        return new Response(JSON.stringify({ result: challenge }), { status: 200 })
      }
      return new Response(JSON.stringify({ result: null }), { status: 200 })
    })

    // Before instant
    {
      const req = new Request('http://localhost/api/challenges/test-published-challenge')
      const res = await handleGatewayRequest(req, TEST_ENV, {
        getNow: () => new Date(targetMs - 1),
        fetchImpl: mockFetch,
      })
      assert.equal(res.status, 404)
    }

    // At exact instant
    {
      const req = new Request('http://localhost/api/challenges/test-published-challenge')
      const res = await handleGatewayRequest(req, TEST_ENV, {
        getNow: () => new Date(targetMs),
        fetchImpl: mockFetch,
      })
      assert.equal(res.status, 200)
      const body = await res.json() as { ok: boolean; challenge: { releaseAt: string } }
      assert.equal(body.ok, true)
      assert.equal(body.challenge.releaseAt, offsetTimestamp)
    }
  }
})

// ---------------------------------------------------------------------------
// 3. Missing or Malformed Release Timestamps
// ---------------------------------------------------------------------------

test('fails closed (404) for missing, blank, or unparseable release timestamps', async () => {
  const invalidTimestamps = ['', 'not-a-valid-date', 'null', 'undefined']

  for (const badTime of invalidTimestamps) {
    const challenge = makeValidChallengeDoc({ releaseAt: badTime })
    const mockFetch = createMockFetch(() => {
      // Even if upstream returned it, post-validation must reject it
      return new Response(JSON.stringify({ result: challenge }), { status: 200 })
    })

    const req = new Request('http://localhost/api/challenges/test-published-challenge')
    const res = await handleGatewayRequest(req, TEST_ENV, {
      getNow: () => new Date('2026-11-07T12:00:00Z'),
      fetchImpl: mockFetch,
    })
    assert.equal(res.status, 404)
  }
})

// ---------------------------------------------------------------------------
// 4. Unreviewed Challenges and Unapproved Structured Blocks
// ---------------------------------------------------------------------------

test('fails closed (404) for unreviewed Challenges (adaptationReviewed !== true)', async () => {
  const unreviewed = makeValidChallengeDoc({
    editorialEligibility: {
      adaptationReviewed: false,
    },
  })
  const mockFetch = createMockFetch(() => new Response(JSON.stringify({ result: unreviewed }), { status: 200 }))

  const req = new Request('http://localhost/api/challenges/test-published-challenge')
  const res = await handleGatewayRequest(req, TEST_ENV, {
    getNow: () => new Date('2026-11-07T12:00:00Z'),
    fetchImpl: mockFetch,
  })
  assert.equal(res.status, 404)
})

test('fails closed (404) if any structured block is proposed or unapproved', async () => {
  const reviewedBlockTypes = [
    'comparisonBlock',
    'visualCardsBlock',
    'connectedSequenceBlock',
    'reflectionBlock',
    'optionalStudyBlock',
  ]

  for (const blockType of reviewedBlockTypes) {
    const challengeWithUnapprovedBlock = makeValidChallengeDoc({
      screens: [
        {
          _key: 'screen-1',
          _type: 'challengeScreen',
          screenLabel: 'Step 1',
          heading: 'Step Heading',
          blocks: [
            {
              _key: 'block-sub',
              _type: blockType,
              reviewStatus: 'proposed', // Not approved!
            },
          ],
        },
      ],
    })

    const mockFetch = createMockFetch(() => new Response(JSON.stringify({ result: challengeWithUnapprovedBlock }), { status: 200 }))

    const req = new Request('http://localhost/api/challenges/test-published-challenge')
    const res = await handleGatewayRequest(req, TEST_ENV, {
      getNow: () => new Date('2026-11-07T12:00:00Z'),
      fetchImpl: mockFetch,
    })
    assert.equal(res.status, 404, `Block type ${blockType} with proposed status must fail closed with 404`)
  }
})

// ---------------------------------------------------------------------------
// 5. Draft vs Published Document Admission
// ---------------------------------------------------------------------------

test('fails closed (404) if upstream inadvertently returns a draft document ID', async () => {
  const draftDoc = makeValidChallengeDoc({
    _id: 'drafts.b46839a6-d0f3-48fc-ae37-7d821a77f045',
  })
  const mockFetch = createMockFetch(() => new Response(JSON.stringify({ result: draftDoc }), { status: 200 }))

  const req = new Request('http://localhost/api/challenges/test-published-challenge')
  const res = await handleGatewayRequest(req, TEST_ENV, {
    getNow: () => new Date('2026-11-07T12:00:00Z'),
    fetchImpl: mockFetch,
  })
  assert.equal(res.status, 404)
})

// ---------------------------------------------------------------------------
// 6. Nonexistent and Future Slugs Return Zero Manuscript Data
// ---------------------------------------------------------------------------

test('returns identical 404 without leaking manuscript data for nonexistent and future slugs', async () => {
  const mockFetch = createMockFetch(() => new Response(JSON.stringify({ result: null }), { status: 200 }))

  for (const slug of ['nonexistent-slug', 'future-embargoed-slug', 'invalid!slug']) {
    const req = new Request(`http://localhost/api/challenges/${slug}`)
    const res = await handleGatewayRequest(req, TEST_ENV, {
      getNow: () => new Date('2026-11-07T12:00:00Z'),
      fetchImpl: mockFetch,
    })
    assert.equal(res.status, 404)
    assert.equal(res.headers.get('Cache-Control'), 'no-store')
    const body = await res.json() as { ok: boolean; error: { kind: string; message: string } }
    assert.deepEqual(body, {
      ok: false,
      error: {
        kind: 'notFound',
        message: 'Challenge not found',
      },
    })
  }
})

// ---------------------------------------------------------------------------
// 7. Public Catalog Exclusion of Unreleased Challenges
// ---------------------------------------------------------------------------

test('GET /api/challenges excludes unreleased and unreviewed Challenges', async () => {
  const released = makeValidChallengeDoc({
    _id: 'doc-released-1',
    slug: 'released-1',
    title: 'Released 1',
    releaseAt: '2026-11-01T12:00:00Z',
  })
  const future = makeValidChallengeDoc({
    _id: 'doc-future-1',
    slug: 'future-1',
    title: 'Future 1',
    releaseAt: '2026-11-10T12:00:00Z',
  })
  const unreviewed = makeValidChallengeDoc({
    _id: 'doc-unreviewed-1',
    slug: 'unreviewed-1',
    title: 'Unreviewed 1',
    editorialEligibility: { adaptationReviewed: false },
  })

  const mockFetch = createMockFetch((url) => {
    // Assert query parameters
    assert.ok(url.searchParams.get('query')?.includes('_type == "challenge"'))
    assert.ok(url.searchParams.get('$nowUtc'))
    // Simulate upstream returning items (e.g. if GROQ returned mixed or post-filter checks)
    return new Response(JSON.stringify({ result: [released, future, unreviewed] }), { status: 200 })
  })

  const req = new Request('http://localhost/api/challenges')
  const res = await handleGatewayRequest(req, TEST_ENV, {
    getNow: () => new Date('2026-11-06T12:00:00Z'),
    fetchImpl: mockFetch,
  })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('Cache-Control'), 'no-store')
  const body = await res.json() as { ok: boolean; challenges: { slug: string; title: string }[] }
  assert.equal(body.ok, true)
  assert.equal(body.challenges.length, 1)
  assert.equal(body.challenges[0].slug, 'released-1')
  assert.equal(body.challenges[0].title, 'Released 1')
})

// ---------------------------------------------------------------------------
// 8. Safe Response Projection (No Leaked Review Notes or Lineage)
// ---------------------------------------------------------------------------

test('projects reader-safe fields only, stripping internal notes, author identity, and provenance', async () => {
  const rawChallenge = makeValidChallengeDoc({
    editorialReview: {
      adaptationReviewed: true,
      reviewedBy: 'Confidential Reviewer',
      reviewNotes: 'Private theological and technical notes',
      sourceRevision: 'Git commit hash ABC123',
    },
    importProvenance: {
      canonicalId: 'berrymark-challenge-test',
    },
    _rev: 'rev-internal',
    _system: { internal: true },
  })

  const mockFetch = createMockFetch(() => new Response(JSON.stringify({ result: rawChallenge }), { status: 200 }))

  const req = new Request('http://localhost/api/challenges/test-published-challenge')
  const res = await handleGatewayRequest(req, TEST_ENV, {
    getNow: () => new Date('2026-11-07T12:00:00Z'),
    fetchImpl: mockFetch,
  })
  assert.equal(res.status, 200)
  const body = await res.json() as { ok: boolean; challenge: Record<string, unknown> }
  assert.equal(body.ok, true)
  const challenge = body.challenge

  // Verify reader fields are present
  assert.equal(challenge._id, 'b46839a6-d0f3-48fc-ae37-7d821a77f045')
  assert.equal(challenge.title, 'Test Published Challenge')
  assert.equal(challenge.slug, 'test-published-challenge')
  assert.ok(Array.isArray(challenge.screens))

  // Verify internal metadata is COMPLETELY STRIPPED
  assert.equal('editorialReview' in challenge, false)
  assert.equal('importProvenance' in challenge, false)
  assert.equal('_rev' in challenge, false)
  assert.equal('_system' in challenge, false)

  // Verify serialized JSON contains no secret strings
  const serialized = JSON.stringify(body)
  assert.equal(serialized.includes('Private theological and technical notes'), false)
  assert.equal(serialized.includes('Confidential Reviewer'), false)
  assert.equal(serialized.includes('berrymark-challenge-test'), false)
  assert.equal(serialized.includes('rev-internal'), false)
})

// ---------------------------------------------------------------------------
// 9. Upstream Failures (Auth Failure, Network Failure, Malformed Responses)
// ---------------------------------------------------------------------------

test('handles upstream 401/403 authorization failures by returning 502 Bad Gateway', async () => {
  for (const status of [401, 403]) {
    const mockFetch = createMockFetch(() => new Response('Unauthorized token', { status }))
    const req = new Request('http://localhost/api/challenges/test-published-challenge')
    const res = await handleGatewayRequest(req, TEST_ENV, {
      fetchImpl: mockFetch,
    })
    assert.equal(res.status, 502)
    assert.equal(res.headers.get('Cache-Control'), 'no-store')
    const body = await res.json() as { ok: boolean; error: { kind: string } }
    assert.equal(body.ok, false)
    assert.equal(body.error.kind, 'upstreamError')
  }
})

test('handles upstream network exception by returning 502 Bad Gateway', async () => {
  const mockFetch: GatewayFetch = async () => {
    throw new Error('Connection refused / DNS failure')
  }
  const req = new Request('http://localhost/api/challenges/test-published-challenge')
  const res = await handleGatewayRequest(req, TEST_ENV, {
    fetchImpl: mockFetch,
  })
  assert.equal(res.status, 502)
  const body = await res.json() as { ok: boolean; error: { kind: string } }
  assert.equal(body.ok, false)
  assert.equal(body.error.kind, 'upstreamError')
})

test('handles upstream malformed JSON payload by returning 502 Bad Gateway', async () => {
  const mockFetch = createMockFetch(() => new Response('<html>Error</html>', { status: 200, headers: { 'Content-Type': 'text/html' } }))
  const req = new Request('http://localhost/api/challenges/test-published-challenge')
  const res = await handleGatewayRequest(req, TEST_ENV, {
    fetchImpl: mockFetch,
  })
  assert.equal(res.status, 502)
  const body = await res.json() as { ok: boolean; error: { kind: string } }
  assert.equal(body.ok, false)
  assert.equal(body.error.kind, 'upstreamError')
})

test('handles missing gateway environment configuration by returning 500', async () => {
  const incompleteEnv: GatewayEnv = {
    SANITY_PROJECT_ID: '',
    SANITY_DATASET: '',
    SANITY_READ_TOKEN: '',
  }
  const req = new Request('http://localhost/api/challenges/test-published-challenge')
  const res = await handleGatewayRequest(req, incompleteEnv)
  assert.equal(res.status, 500)
  const body = await res.json() as { ok: boolean; error: { kind: string } }
  assert.equal(body.ok, false)
  assert.equal(body.error.kind, 'serverConfigurationError')
})

// ---------------------------------------------------------------------------
// 10. Unsupported HTTP Methods and CORS Behavior
// ---------------------------------------------------------------------------

test('rejects unsupported HTTP methods (POST, PUT, DELETE, PATCH) with 405', async () => {
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
    const req = new Request('http://localhost/api/challenges/test-published-challenge', { method })
    const res = await handleGatewayRequest(req, TEST_ENV)
    assert.equal(res.status, 405)
    assert.equal(res.headers.get('Allow'), 'GET, OPTIONS')
    assert.equal(res.headers.get('Cache-Control'), 'no-store')
    const body = await res.json() as { ok: boolean; error: { kind: string } }
    assert.equal(body.ok, false)
    assert.equal(body.error.kind, 'methodNotAllowed')
  }
})

test('handles OPTIONS preflight with CORS headers', async () => {
  const req = new Request('http://localhost/api/challenges', {
    method: 'OPTIONS',
    headers: { Origin: 'http://localhost:3000' },
  })
  const res = await handleGatewayRequest(req, TEST_ENV)
  assert.equal(res.status, 204)
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'http://localhost:3000')
  assert.equal(res.headers.get('Access-Control-Allow-Methods'), 'GET, OPTIONS')
  assert.equal(res.headers.get('Access-Control-Allow-Headers'), 'Content-Type, Accept')
  assert.equal(res.headers.get('Cache-Control'), 'no-store')
})

test('reflects authorized origin and omits unauthorized origin in CORS headers', async () => {
  const challenge = makeValidChallengeDoc()
  const mockFetch = createMockFetch(() => new Response(JSON.stringify({ result: challenge }), { status: 200 }))

  // Authorized origin
  {
    const req = new Request('http://localhost/api/challenges/test-published-challenge', {
      headers: { Origin: 'http://localhost:3000' },
    })
    const res = await handleGatewayRequest(req, TEST_ENV, {
      getNow: () => new Date('2026-11-07T12:00:00Z'),
      fetchImpl: mockFetch,
    })
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'http://localhost:3000')
    assert.equal(res.headers.get('Vary'), 'Origin')
  }

  // Unauthorized origin
  {
    const req = new Request('http://localhost/api/challenges/test-published-challenge', {
      headers: { Origin: 'http://malicious-site.example' },
    })
    const res = await handleGatewayRequest(req, TEST_ENV, {
      getNow: () => new Date('2026-11-07T12:00:00Z'),
      fetchImpl: mockFetch,
    })
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), null)
  }
})

// ---------------------------------------------------------------------------
// 11. Client Cannot Override Server Release Clock
// ---------------------------------------------------------------------------

test('client cannot override release authorization using headers or query parameters', async () => {
  const boundaryIso = '2026-11-06T18:00:00.000Z'
  const boundaryMs = Date.parse(boundaryIso)
  const challenge = makeValidChallengeDoc({ releaseAt: boundaryIso })

  let capturedNowUtc: string | null = null
  const mockFetch = createMockFetch((url) => {
    capturedNowUtc = url.searchParams.get('$nowUtc')
    return new Response(JSON.stringify({ result: challenge }), { status: 200 })
  })

  // Client attempts to spoof future time in query parameter and headers
  const req = new Request('http://localhost/api/challenges/test-published-challenge?now=2026-12-01T00:00:00Z&$nowUtc=2026-12-01T00:00:00Z', {
    headers: {
      'Date': 'Tue, 01 Dec 2026 00:00:00 GMT',
      'X-Now': '2026-12-01T00:00:00Z',
    },
  })

  // Server clock is 1 hour BEFORE boundary
  const serverNow = new Date(boundaryMs - 3600_000)
  const res = await handleGatewayRequest(req, TEST_ENV, {
    getNow: () => serverNow,
    fetchImpl: mockFetch,
  })

  // Must fail closed with 404 because server clock controls release
  assert.equal(res.status, 404)
  assert.equal(capturedNowUtc, JSON.stringify(serverNow.toISOString()))
})

// ---------------------------------------------------------------------------
// 12. Document and Screen Identity Preservation
// ---------------------------------------------------------------------------

test('preserves exact Sanity base document ID and screen _key identity for reader compatibility', async () => {
  const challenge = makeValidChallengeDoc({
    _id: 'b46839a6-d0f3-48fc-ae37-7d821a77f045',
    screens: [
      {
        _key: 'custom-screen-key-xyz',
        _type: 'challengeScreen',
        screenLabel: 'Step 1',
        heading: 'Identity Test',
        blocks: [],
      },
    ],
  })

  const mockFetch = createMockFetch(() => new Response(JSON.stringify({ result: challenge }), { status: 200 }))

  const req = new Request('http://localhost/api/challenges/test-published-challenge')
  const res = await handleGatewayRequest(req, TEST_ENV, {
    getNow: () => new Date('2026-11-07T12:00:00Z'),
    fetchImpl: mockFetch,
  })
  assert.equal(res.status, 200)
  const body = await res.json() as { ok: boolean; challenge: { _id: string; screens: { _key: string }[] } }
  assert.equal(body.ok, true)
  assert.equal(body.challenge._id, 'b46839a6-d0f3-48fc-ae37-7d821a77f045')
  assert.equal(body.challenge.screens[0]._key, 'custom-screen-key-xyz')
})

// ---------------------------------------------------------------------------
// 13. Bundle Isolation Verification
// ---------------------------------------------------------------------------

test('verifies zero imports of src/gateway/ in browser application entrypoint and tree', () => {
  const rootSrcDir = path.resolve(process.cwd(), 'src')

  function checkDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        // Skip gateway itself
        if (fullPath === path.join(rootSrcDir, 'gateway')) continue
        checkDir(fullPath)
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
        const content = fs.readFileSync(fullPath, 'utf8')
        assert.equal(
          content.includes('from \'../gateway') ||
          content.includes('from "./gateway') ||
          content.includes('from \'./gateway') ||
          content.includes('from "@/gateway') ||
          content.includes('SANITY_READ_TOKEN'),
          false,
          `Browser file ${entry.name} must not import gateway or reference SANITY_READ_TOKEN`,
        )
      }
    }
  }

  checkDir(rootSrcDir)
})
