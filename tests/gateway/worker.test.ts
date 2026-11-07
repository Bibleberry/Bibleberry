import assert from 'node:assert/strict'
import test from 'node:test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as child_process from 'node:child_process'
import worker, { handleWorkerRequest } from '../../src/gateway/worker.ts'
import type { WorkerEnv, GatewayFetch, GatewayCatalogResponse, GatewayChallengeResponse, GatewayErrorResponse } from '../../src/gateway/types.ts'

const TEST_ENV: WorkerEnv = {
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
  companionLinks: [],
  unapprovedBlockCount: 0,
  editorialEligibility: {
    adaptationReviewed: true,
    reviewedAt: '2026-11-06T12:00:00.000Z',
  },
  ...overrides,
})

const makeMockFetch = (result: unknown, status = 200): GatewayFetch => {
  return async () => {
    return new Response(JSON.stringify({ result }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// ---------------------------------------------------------------------------
// 1. API Requests Reach Gateway Handler
// ---------------------------------------------------------------------------

test('Worker routes GET /api/challenges to gateway handler', async () => {
  const doc = makeValidChallengeDoc()
  const fetchImpl = makeMockFetch([doc])
  const getNow = () => new Date('2026-11-07T12:00:00.000Z')

  const req = new Request('http://localhost:3000/api/challenges', {
    method: 'GET',
    headers: { Origin: 'http://localhost:3000' },
  })

  const res = await handleWorkerRequest(req, TEST_ENV, { fetchImpl, getNow })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('Content-Type'), 'application/json; charset=utf-8')
  assert.equal(res.headers.get('Cache-Control'), 'no-store')
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'http://localhost:3000')

  const body = (await res.json()) as GatewayCatalogResponse
  assert.equal(body.ok, true)
  assert.equal(body.challenges.length, 1)
  assert.equal(body.challenges[0].slug, 'test-published-challenge')
})

test('Worker routes GET /api/challenges/:slug to gateway handler', async () => {
  const doc = makeValidChallengeDoc()
  const fetchImpl = makeMockFetch(doc)
  const getNow = () => new Date('2026-11-07T12:00:00.000Z')

  const req = new Request('http://localhost:3000/api/challenges/test-published-challenge', {
    method: 'GET',
    headers: { Origin: 'http://localhost:3000' },
  })

  const res = await handleWorkerRequest(req, TEST_ENV, { fetchImpl, getNow })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('Content-Type'), 'application/json; charset=utf-8')
  assert.equal(res.headers.get('Cache-Control'), 'no-store')

  const body = (await res.json()) as GatewayChallengeResponse
  assert.equal(body.ok, true)
  assert.equal(body.challenge.slug, 'test-published-challenge')
  assert.equal(body.challenge._id, 'b46839a6-d0f3-48fc-ae37-7d821a77f045')
})

test('Worker handles OPTIONS preflight for /api/* with CORS headers', async () => {
  const req = new Request('http://localhost:3000/api/challenges', {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:3000',
      'Access-Control-Request-Method': 'GET',
    },
  })

  const res = await handleWorkerRequest(req, TEST_ENV)
  assert.equal(res.status, 204)
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'http://localhost:3000')
  assert.equal(res.headers.get('Access-Control-Allow-Methods'), 'GET, OPTIONS')
  assert.equal(res.headers.get('Cache-Control'), 'no-store')
})

test('Worker rejects unsupported HTTP methods on /api/* with 405 Method Not Allowed', async () => {
  const req = new Request('http://localhost:3000/api/challenges', {
    method: 'POST',
    headers: { Origin: 'http://localhost:3000' },
  })

  const res = await handleWorkerRequest(req, TEST_ENV)
  assert.equal(res.status, 405)
  assert.equal(res.headers.get('Allow'), 'GET, OPTIONS')

  const body = (await res.json()) as GatewayErrorResponse
  assert.equal(body.ok, false)
  assert.equal(body.error.kind, 'methodNotAllowed')
})

test('Worker returns 404 for unrecognized /api/* paths', async () => {
  const req = new Request('http://localhost:3000/api/unknown-endpoint', {
    method: 'GET',
    headers: { Origin: 'http://localhost:3000' },
  })

  const res = await handleWorkerRequest(req, TEST_ENV)
  assert.equal(res.status, 404)

  const body = (await res.json()) as GatewayErrorResponse
  assert.equal(body.ok, false)
  assert.equal(body.error.kind, 'notFound')
})

test('Worker default export fetch() invokes handleWorkerRequest cleanly', async () => {
  const req = new Request('http://localhost:3000/api/challenges', {
    method: 'OPTIONS',
    headers: { Origin: 'http://localhost:3000' },
  })

  const res = await worker.fetch(req, TEST_ENV)
  assert.equal(res.status, 204)
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'http://localhost:3000')
})

// ---------------------------------------------------------------------------
// 2. Static Asset Delivery and Ordinary Application Routes
// ---------------------------------------------------------------------------

test('Worker delegates non-API routes to env.ASSETS binding when present', async () => {
  let assetsCalledWith: string | null = null

  const mockAssets = {
    fetch: async (request: Request | string) => {
      assetsCalledWith = typeof request === 'string' ? request : request.url
      return new Response('<!DOCTYPE html><html><body>Bibleberry Reader</body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    },
  }

  const envWithAssets: WorkerEnv = {
    ...TEST_ENV,
    ASSETS: mockAssets,
  }

  // 1. Root route
  const rootReq = new Request('http://localhost:3000/', { method: 'GET' })
  const rootRes = await handleWorkerRequest(rootReq, envWithAssets)
  assert.equal(rootRes.status, 200)
  assert.equal(await rootRes.text(), '<!DOCTYPE html><html><body>Bibleberry Reader</body></html>')
  assert.equal(assetsCalledWith, 'http://localhost:3000/')

  // 2. Static JS asset
  const assetReq = new Request('http://localhost:3000/assets/index-D5zrOOHG.js', { method: 'GET' })
  const assetRes = await handleWorkerRequest(assetReq, envWithAssets)
  assert.equal(assetRes.status, 200)
  assert.equal(assetsCalledWith, 'http://localhost:3000/assets/index-D5zrOOHG.js')

  // 3. Client-side SPA navigation route (e.g. #/challenge/:slug or /challenge/:slug)
  const spaReq = new Request('http://localhost:3000/challenge/walking-in-the-light', { method: 'GET' })
  const spaRes = await handleWorkerRequest(spaReq, envWithAssets)
  assert.equal(spaRes.status, 200)
  assert.equal(assetsCalledWith, 'http://localhost:3000/challenge/walking-in-the-light')
})

test('Worker NEVER delegates /api/* routes to env.ASSETS', async () => {
  let assetsCalled = false

  const mockAssets = {
    fetch: async () => {
      assetsCalled = true
      return new Response('Assets Fallback', { status: 200 })
    },
  }

  const envWithAssets: WorkerEnv = {
    ...TEST_ENV,
    ASSETS: mockAssets,
  }

  const req = new Request('http://localhost:3000/api/challenges', {
    method: 'OPTIONS',
    headers: { Origin: 'http://localhost:3000' },
  })

  const res = await handleWorkerRequest(req, envWithAssets)
  assert.equal(res.status, 204)
  assert.equal(assetsCalled, false, '/api/* must be intercepted by gateway, never delegated to ASSETS')
})

test('Worker fails closed (404) for non-API routes when env.ASSETS is absent', async () => {
  const req = new Request('http://localhost:3000/non-existent-route', { method: 'GET' })
  const res = await handleWorkerRequest(req, TEST_ENV)
  assert.equal(res.status, 404)

  const body = (await res.json()) as GatewayErrorResponse
  assert.equal(body.ok, false)
  assert.equal(body.error.kind, 'notFound')
})

// ---------------------------------------------------------------------------
// 3. Missing Configuration Fails Safely
// ---------------------------------------------------------------------------

test('Worker fails safely with 500 when SANITY_READ_TOKEN is missing', async () => {
  const brokenEnv: WorkerEnv = {
    ...TEST_ENV,
    SANITY_READ_TOKEN: '',
  }

  const req = new Request('http://localhost:3000/api/challenges', { method: 'GET' })
  const res = await handleWorkerRequest(req, brokenEnv)
  assert.equal(res.status, 500)

  const body = (await res.json()) as GatewayErrorResponse
  assert.equal(body.ok, false)
  assert.equal(body.error.kind, 'serverConfigurationError')
  assert.equal(body.error.message, 'Gateway configuration error')
})

test('Worker fails safely with 500 when SANITY_PROJECT_ID or SANITY_DATASET is missing', async () => {
  const brokenEnv1: WorkerEnv = { ...TEST_ENV, SANITY_PROJECT_ID: '' }
  const brokenEnv2: WorkerEnv = { ...TEST_ENV, SANITY_DATASET: '' }

  const req = new Request('http://localhost:3000/api/challenges', { method: 'GET' })

  const res1 = await handleWorkerRequest(req, brokenEnv1)
  assert.equal(res1.status, 500)

  const res2 = await handleWorkerRequest(req, brokenEnv2)
  assert.equal(res2.status, 500)
})

// ---------------------------------------------------------------------------
// 4. Unauthorized and Future-Dated Content Inaccessibility
// ---------------------------------------------------------------------------

test('Worker returns neutral 404 for future-dated Challenge and nonexistent Challenge identically', async () => {
  // Future challenge
  const futureDoc = makeValidChallengeDoc({
    releaseAt: '2026-11-08T00:00:00.000Z',
  })
  const fetchImplFuture = makeMockFetch(futureDoc)
  const getNow = () => new Date('2026-11-07T12:00:00.000Z')

  const reqFuture = new Request('http://localhost:3000/api/challenges/test-published-challenge', {
    method: 'GET',
    headers: { Origin: 'http://localhost:3000' },
  })
  const resFuture = await handleWorkerRequest(reqFuture, TEST_ENV, {
    fetchImpl: fetchImplFuture,
    getNow,
  })
  assert.equal(resFuture.status, 404)
  const bodyFuture = await resFuture.json()

  // Nonexistent challenge (null from upstream)
  const fetchImplNonexistent = makeMockFetch(null)
  const reqNonexistent = new Request('http://localhost:3000/api/challenges/nonexistent-challenge', {
    method: 'GET',
    headers: { Origin: 'http://localhost:3000' },
  })
  const resNonexistent = await handleWorkerRequest(reqNonexistent, TEST_ENV, {
    fetchImpl: fetchImplNonexistent,
    getNow,
  })
  assert.equal(resNonexistent.status, 404)
  const bodyNonexistent = await resNonexistent.json()

  assert.deepEqual(bodyFuture, bodyNonexistent, '404 bodies must be identical to avoid manuscript leakage')
})

test('Worker returns 404 for unreviewed Challenge', async () => {
  const unreviewedDoc = makeValidChallengeDoc({
    editorialEligibility: { adaptationReviewed: false },
  })
  const fetchImpl = makeMockFetch(unreviewedDoc)
  const getNow = () => new Date('2026-11-07T12:00:00.000Z')

  const req = new Request('http://localhost:3000/api/challenges/test-published-challenge', {
    method: 'GET',
  })
  const res = await handleWorkerRequest(req, TEST_ENV, { fetchImpl, getNow })
  assert.equal(res.status, 404)
})

// ---------------------------------------------------------------------------
// 5. Secrets Isolation and Leak Prevention
// ---------------------------------------------------------------------------

test('Worker API responses never leak SANITY_READ_TOKEN or private secret strings', async () => {
  const doc = makeValidChallengeDoc()
  const fetchImpl = makeMockFetch(doc)
  const getNow = () => new Date('2026-11-07T12:00:00.000Z')

  const req = new Request('http://localhost:3000/api/challenges/test-published-challenge', {
    method: 'GET',
    headers: { Origin: 'http://localhost:3000' },
  })

  const res = await handleWorkerRequest(req, TEST_ENV, { fetchImpl, getNow })
  const responseText = await res.text()

  assert.equal(
    responseText.includes('test-reader-token-secret-12345'),
    false,
    'Response payload must not contain SANITY_READ_TOKEN secret',
  )
  assert.equal(
    responseText.includes('SANITY_READ_TOKEN'),
    false,
    'Response payload must not contain SANITY_READ_TOKEN variable name',
  )
})

test('wrangler.staging.jsonc does not contain SANITY_READ_TOKEN or secret values', () => {
  const configPath = path.resolve(process.cwd(), 'wrangler.staging.jsonc')
  assert.equal(fs.existsSync(configPath), true, 'wrangler.staging.jsonc must exist')

  const content = fs.readFileSync(configPath, 'utf8')
  assert.equal(
    content.includes('SANITY_READ_TOKEN'),
    false,
    'wrangler.staging.jsonc must not contain SANITY_READ_TOKEN in vars (must be secret put)',
  )
  assert.equal(
    content.includes('secret-'),
    false,
    'wrangler.staging.jsonc must not contain secret values',
  )
})

test('wrangler.jsonc (production) is preserved without modification', () => {
  const prodPath = path.resolve(process.cwd(), 'wrangler.jsonc')
  assert.equal(fs.existsSync(prodPath), true, 'wrangler.jsonc must exist')

  const content = fs.readFileSync(prodPath, 'utf8')
  const parsed = JSON.parse(content)
  assert.equal(parsed.name, 'bibleberry-lab')
  assert.equal(parsed.compatibility_date, '2026-11-01')
  assert.equal(parsed.assets.directory, './dist')
  assert.equal(parsed.assets.not_found_handling, 'single-page-application')
  assert.equal(parsed.main, undefined, 'production wrangler.jsonc must not be prematurely modified')
})

// ---------------------------------------------------------------------------
// 6. Staging Wrangler Configuration Schema and Compatibility
// ---------------------------------------------------------------------------

test('wrangler.staging.jsonc is valid configuration for Cloudflare Workers Static Assets', () => {
  const configPath = path.resolve(process.cwd(), 'wrangler.staging.jsonc')
  const content = fs.readFileSync(configPath, 'utf8')

  // Parse JSON/JSONC (handling standard JSON directly, or stripping single/multiline comments outside quotes)
  const stripJsonComments = (str: string) => {
    return str.replace(/("(?:[^"\\]|\\.)*")|(\/\*[\s\S]*?\*\/|\/\/[^\n\r]*)/g, (match, stringLiteral) => {
      return stringLiteral || ''
    })
  }
  const config = JSON.parse(stripJsonComments(content))

  assert.equal(config.name, 'bibleberry-staging')
  assert.equal(config.main, 'src/gateway/worker.ts')
  assert.equal(config.compatibility_date, '2026-11-01')

  // Verify Worker entrypoint exists
  const entryPath = path.resolve(process.cwd(), config.main)
  assert.equal(fs.existsSync(entryPath), true, 'Worker entrypoint file must exist')

  // Verify Static Assets configuration
  assert.ok(config.assets, 'assets configuration must be present')
  assert.equal(config.assets.directory, './dist')
  assert.equal(config.assets.binding, 'ASSETS')
  assert.equal(config.assets.not_found_handling, 'single-page-application')
  assert.deepEqual(config.assets.run_worker_first, ['/api/*'])

  // Verify vars
  assert.ok(config.vars, 'vars must be present')
  assert.equal(config.vars.SANITY_PROJECT_ID, '80016lrq')
  assert.equal(typeof config.vars.SANITY_DATASET, 'string')
  assert.equal(config.vars.SANITY_API_VERSION, '2026-11-01')
  assert.equal(typeof config.vars.ALLOWED_ORIGINS, 'string')
  assert.ok(config.vars.ALLOWED_ORIGINS.includes('aw-e44.workers.dev'), 'ALLOWED_ORIGINS must include aw-e44 subdomain')
})

test('wrangler deploy --dry-run compiles Worker and binds assets without deployment', () => {
  // Ensure dist directory exists with index.html for assets validation
  const distDir = path.resolve(process.cwd(), 'dist')
  const createdDist = !fs.existsSync(distDir)
  if (createdDist) {
    fs.mkdirSync(distDir, { recursive: true })
    fs.writeFileSync(path.join(distDir, 'index.html'), '<!DOCTYPE html><html></html>')
  }

  try {
    const result = child_process.execSync(
      'npx --yes wrangler@4.158.0 deploy --dry-run --config wrangler.staging.jsonc',
      { encoding: 'utf8', stdio: 'pipe' },
    )
    assert.ok(result.includes('--dry-run: exiting now.'))
    assert.ok(result.includes('env.ASSETS'))
    assert.ok(result.includes('env.SANITY_PROJECT_ID'))
    assert.ok(result.includes('2026-11-01'))
  } finally {
    if (createdDist) {
      fs.rmSync(distDir, { recursive: true, force: true })
    }
  }
})
