import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ALL_SYNTHETIC_STAGING_DOCUMENTS,
  ALL_SYNTHETIC_DOCUMENT_IDS,
  SYNTHETIC_SERIES_DOCUMENT,
  FIXTURE_A_DOCUMENT,
  FIXTURE_A_ID,
  FIXTURE_A_SLUG,
  FIXTURE_B_DOCUMENT,
  FIXTURE_B_ID,
  FIXTURE_B_SLUG,
  FIXTURE_C_DOCUMENT,
  FIXTURE_C_ID,
  FIXTURE_C_SLUG,
  FIXTURE_D_DOCUMENT,
  FIXTURE_D_ID,
  FIXTURE_D_SLUG,
  FIXTURE_F_DOCUMENT,
  FIXTURE_F_ID,
  FIXTURE_F_SLUG,
  NONEXISTENT_SLUG,
  ACCEPTANCE_EXPECTATIONS,
  toDereferencedCatalogItem,
  toDereferencedDetailDoc,
} from '../../src/gateway/fixtures/stagingAcceptanceFixtures.ts'
import { handleGatewayRequest } from '../../src/gateway/handler.ts'
import type { GatewayEnv, GatewayFetch } from '../../src/gateway/types.ts'
import {
  validateStagingTarget,
  checkCliArguments,
  executeStagingFixtures,
  EXPECTED_PROJECT_ID,
  EXPECTED_DATASET,
} from '../../scripts/staging-fixtures.ts'
import { runStagingVerification } from '../../scripts/verify-staging-acceptance.ts'

const TEST_GATEWAY_ENV: GatewayEnv = {
  SANITY_PROJECT_ID: '80016lrq',
  SANITY_DATASET: 'staging',
  SANITY_READ_TOKEN: 'viewer-token-for-test-mock',
  ALLOWED_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
}

// ---------------------------------------------------------------------------
// 1. Synthetic Fixture Pack Integrity & Invariants
// ---------------------------------------------------------------------------

test('fixture pack adheres strictly to synthetic-only, reference-only invariants', () => {
  assert.equal(ALL_SYNTHETIC_STAGING_DOCUMENTS.length, 6)
  assert.equal(ALL_SYNTHETIC_DOCUMENT_IDS.length, 6)
  assert.equal(SYNTHETIC_SERIES_DOCUMENT._id, 'r05-3b-series-acceptance')
  assert.equal(FIXTURE_A_DOCUMENT._id, FIXTURE_A_ID)
  assert.equal(FIXTURE_B_DOCUMENT._id, FIXTURE_B_ID)
  assert.equal(FIXTURE_C_DOCUMENT._id, FIXTURE_C_ID)
  assert.equal(FIXTURE_D_DOCUMENT._id, FIXTURE_D_ID)
  assert.equal(FIXTURE_F_DOCUMENT._id, FIXTURE_F_ID)

  // Verify ID namespaces
  for (const doc of ALL_SYNTHETIC_STAGING_DOCUMENTS) {
    const isSyntheticNamespace =
      doc._id.startsWith('r05-3b-') || doc._id.startsWith('drafts.r05-3b-')
    assert.equal(
      isSyntheticNamespace,
      true,
      `Document ID ${doc._id} must start with r05-3b- or drafts.r05-3b-`,
    )
    assert.equal(
      doc.slug.current.startsWith('r05-3b-'),
      true,
      `Slug ${doc.slug.current} must start with r05-3b-`,
    )
  }

  // Verify Challenge documents
  const challenges = ALL_SYNTHETIC_STAGING_DOCUMENTS.filter(d => d._type === 'challenge')
  assert.equal(challenges.length, 5)

  for (const rawChallenge of challenges) {
    const c = rawChallenge as typeof FIXTURE_A_DOCUMENT

    // 1. Reference-only Scripture without passage text
    assert.equal(c.primaryScripture.textStatus, 'referenceOnly')
    assert.equal(c.primaryScripture.practiceStatus, 'notConfigured')
    assert.equal(c.primaryScripture.passage, undefined)
    assert.ok(c.primaryScripture.reference.length > 0)
    assert.ok(c.primaryScripture.translation.length > 0)

    // 2. Stable keys on all screens and blocks
    assert.ok(c.screens.length > 0)
    for (const screen of c.screens) {
      assert.ok(screen._key.startsWith('screen-r05-3b-'))
      assert.equal(screen._type, 'challengeScreen')
      assert.ok(screen.blocks.length > 0)
      for (const block of screen.blocks) {
        assert.ok(block._key.startsWith('block-r05-3b-'))
        assert.ok(typeof block._type === 'string' && block._type.length > 0)
      }
    }

    // 3. Timezone-aware ISO 8601 release timestamp
    assert.ok(Number.isFinite(Date.parse(c.releaseAt)))
    assert.ok(c.releaseAt.endsWith('Z') || c.releaseAt.includes('+') || c.releaseAt.includes('-'))

    // 4. Truthful attribution (never claims Alexis approved synthetic content)
    if (c.editorialReview.adaptationReviewed) {
      assert.equal(c.editorialReview.reviewedBy, 'Aaron Waid (technical synthetic approval)')
      assert.ok(c.editorialReview.reviewedAt)
    }
  }

  // Verify internal review note on Fixture A
  assert.ok(
    FIXTURE_A_DOCUMENT.editorialReview.reviewNotes?.includes('SIMULATED SYNTHETIC ELIGIBILITY'),
  )

  // Verify unapproved block on Fixture F
  const unapprovedBlock = FIXTURE_F_DOCUMENT.screens[0].blocks.find(
    b => b._type === 'comparisonBlock',
  )
  assert.equal(unapprovedBlock?.reviewStatus, 'proposed')
})

test('fixture expectations map matches test inventory A through F', () => {
  const cases = ACCEPTANCE_EXPECTATIONS.map(e => e.caseId)
  assert.deepEqual(cases, ['A', 'B', 'C', 'D', 'E', 'F'])

  const aExp = ACCEPTANCE_EXPECTATIONS.find(e => e.caseId === 'A')
  assert.equal(aExp?.expectedInCatalog, true)
  assert.equal(aExp?.expectedDetailStatus, 200)

  for (const c of ['B', 'C', 'D', 'E', 'F']) {
    const exp = ACCEPTANCE_EXPECTATIONS.find(e => e.caseId === c)
    assert.equal(exp?.expectedInCatalog, false)
    assert.equal(exp?.expectedDetailStatus, 404)
  }
})

// ---------------------------------------------------------------------------
// 2. Deterministic Release Boundary Testing with Injected Clock
// ---------------------------------------------------------------------------

test('evaluates exact release boundary deterministically offline for Fixture B', async () => {
  // Fixture B has releaseAt: '2026-11-15T05:00:00.000Z'
  const targetReleaseAt = Date.parse(FIXTURE_B_DOCUMENT.releaseAt)
  const dereferencedDocB = toDereferencedDetailDoc(FIXTURE_B_DOCUMENT)

  const mockFetch: GatewayFetch = async (url) => {
    const urlObj = url instanceof URL ? url : new URL(String(url))
    const rawNowUtc = urlObj.searchParams.get('$nowUtc')
    const nowUtc = rawNowUtc ? JSON.parse(rawNowUtc) : ''
    const nowTime = Date.parse(nowUtc)

    if (nowTime >= targetReleaseAt) {
      return new Response(JSON.stringify({ result: dereferencedDocB }), { status: 200 })
    } else {
      return new Response(JSON.stringify({ result: null }), { status: 200 })
    }
  }

  // 1. Boundary minus 1ms: must return 404 neutral
  const resMinus1 = await handleGatewayRequest(
    new Request(`http://localhost/api/challenges/${FIXTURE_B_SLUG}`),
    TEST_GATEWAY_ENV,
    {
      getNow: () => new Date(targetReleaseAt - 1),
      fetchImpl: mockFetch,
    },
  )
  assert.equal(resMinus1.status, 404)
  assert.equal(resMinus1.headers.get('Cache-Control'), 'no-store')
  const jsonMinus1 = (await resMinus1.json()) as { ok: boolean; error: { kind: string } }
  assert.equal(jsonMinus1.ok, false)
  assert.equal(jsonMinus1.error.kind, 'notFound')

  // 2. Exact release instant: must return 200 OK
  const resExact = await handleGatewayRequest(
    new Request(`http://localhost/api/challenges/${FIXTURE_B_SLUG}`),
    TEST_GATEWAY_ENV,
    {
      getNow: () => new Date(targetReleaseAt),
      fetchImpl: mockFetch,
    },
  )
  assert.equal(resExact.status, 200)
  assert.equal(resExact.headers.get('Cache-Control'), 'no-store')
  const jsonExact = (await resExact.json()) as { ok: boolean; challenge: { slug: string } }
  assert.equal(jsonExact.ok, true)
  assert.equal(jsonExact.challenge.slug, FIXTURE_B_SLUG)

  // 3. Boundary plus 1ms: must return 200 OK
  const resPlus1 = await handleGatewayRequest(
    new Request(`http://localhost/api/challenges/${FIXTURE_B_SLUG}`),
    TEST_GATEWAY_ENV,
    {
      getNow: () => new Date(targetReleaseAt + 1),
      fetchImpl: mockFetch,
    },
  )
  assert.equal(resPlus1.status, 200)
  assert.equal(resPlus1.headers.get('Cache-Control'), 'no-store')
})

// ---------------------------------------------------------------------------
// 3. Full Gateway Response Verification for Cases A Through F
// ---------------------------------------------------------------------------

test('gateway correctly serves catalog and details for synthetic fixtures A through F', async () => {
  // Reference evaluation instant: 2026-11-08T12:00:00.000Z
  const evaluationTime = new Date('2026-11-08T12:00:00.000Z')

  // Build simulated Sanity responses
  const catalogItemA = toDereferencedCatalogItem(FIXTURE_A_DOCUMENT)
  const detailDocA = toDereferencedDetailDoc(FIXTURE_A_DOCUMENT)

  const mockFetch: GatewayFetch = async (url) => {
    const urlObj = url instanceof URL ? url : new URL(String(url))
    const query = urlObj.searchParams.get('query') ?? ''
    const rawSlug = urlObj.searchParams.get('$slug')
    const reqSlug = rawSlug ? JSON.parse(rawSlug) : ''

    // Catalog query
    if (query.includes('*[_type == "challenge"') && !query.includes('slug.current == $slug')) {
      // Only Fixture A satisfies all GROQ predicates at 2026-11-08T12:00:00Z
      return new Response(JSON.stringify({ result: [catalogItemA] }), { status: 200 })
    }

    // Single challenge query
    if (reqSlug === FIXTURE_A_SLUG) {
      return new Response(JSON.stringify({ result: detailDocA }), { status: 200 })
    }

    // Negative cases (B, C, D, F, Nonexistent) return null from GROQ
    return new Response(JSON.stringify({ result: null }), { status: 200 })
  }

  const options = {
    getNow: () => evaluationTime,
    fetchImpl: mockFetch,
  }

  // 1. Verify Catalog
  const catalogRes = await handleGatewayRequest(
    new Request('http://localhost/api/challenges'),
    TEST_GATEWAY_ENV,
    options,
  )
  assert.equal(catalogRes.status, 200)
  assert.equal(catalogRes.headers.get('Cache-Control'), 'no-store')

  const catalogJson = (await catalogRes.json()) as {
    ok: boolean
    challenges: Array<{ slug: string; _id: string; [key: string]: unknown }>
  }
  assert.equal(catalogJson.ok, true)
  assert.equal(catalogJson.challenges.length, 1)
  assert.equal(catalogJson.challenges[0].slug, FIXTURE_A_SLUG)

  // Verify catalog allowlist: internal fields stripped
  assert.equal(catalogJson.challenges[0].unapprovedBlockCount, undefined)
  assert.equal(catalogJson.challenges[0].reviewNotes, undefined)

  // Verify exclusion of B, C, D, F from catalog
  const catalogSlugs = catalogJson.challenges.map(c => c.slug)
  assert.equal(catalogSlugs.includes(FIXTURE_B_SLUG), false)
  assert.equal(catalogSlugs.includes(FIXTURE_C_SLUG), false)
  assert.equal(catalogSlugs.includes(FIXTURE_D_SLUG), false)
  assert.equal(catalogSlugs.includes(FIXTURE_F_SLUG), false)

  // 2. Verify Detail for Case A (200 OK)
  const detailResA = await handleGatewayRequest(
    new Request(`http://localhost/api/challenges/${FIXTURE_A_SLUG}`),
    TEST_GATEWAY_ENV,
    options,
  )
  assert.equal(detailResA.status, 200)
  assert.equal(detailResA.headers.get('Cache-Control'), 'no-store')
  const detailJsonA = (await detailResA.json()) as {
    ok: boolean
    challenge: {
      slug: string
      editorialEligibility: { adaptationReviewed: boolean; [key: string]: unknown }
      [key: string]: unknown
    }
  }
  assert.equal(detailJsonA.ok, true)
  assert.equal(detailJsonA.challenge.slug, FIXTURE_A_SLUG)
  assert.equal(detailJsonA.challenge.editorialEligibility.adaptationReviewed, true)

  // CRITICAL SECURITY INVARIANT: internal reviewNotes must NEVER leak to reader
  assert.equal(detailJsonA.challenge.reviewNotes, undefined)
  assert.equal(detailJsonA.challenge.editorialEligibility.reviewNotes, undefined)
  assert.equal(detailJsonA.challenge.editorialEligibility.reviewedBy, undefined)

  // 3. Verify Details for Cases B, C, D, F, and Nonexistent (All return identical neutral 404)
  const negativeCases = [
    { slug: FIXTURE_B_SLUG, label: 'Case B (Future)' },
    { slug: FIXTURE_C_SLUG, label: 'Case C (Unreviewed)' },
    { slug: FIXTURE_D_SLUG, label: 'Case D (Draft)' },
    { slug: FIXTURE_F_SLUG, label: 'Case F (Unapproved block)' },
    { slug: NONEXISTENT_SLUG, label: 'Case E (Nonexistent slug)' },
  ]

  for (const item of negativeCases) {
    const res = await handleGatewayRequest(
      new Request(`http://localhost/api/challenges/${item.slug}`),
      TEST_GATEWAY_ENV,
      options,
    )
    assert.equal(res.status, 404, `${item.label} must return HTTP 404`)
    assert.equal(res.headers.get('Cache-Control'), 'no-store')
    const json = (await res.json()) as { ok: boolean; error: { kind: string; message: string }; challenge?: unknown }
    assert.equal(json.ok, false)
    assert.equal(json.error.kind, 'notFound')
    assert.equal(json.error.message, 'Challenge not found')
    assert.equal(json.challenge, undefined, `${item.label} must leak zero manuscript content`)
  }
})

// ---------------------------------------------------------------------------
// 4. Guarded Setup Mechanism Unit Tests
// ---------------------------------------------------------------------------

test('validateStagingTarget strictly pins project 80016lrq and dataset staging', () => {
  assert.equal(EXPECTED_PROJECT_ID, '80016lrq')
  assert.equal(EXPECTED_DATASET, 'staging')

  // Valid defaults
  assert.deepEqual(validateStagingTarget({}), { valid: true })
  assert.deepEqual(
    validateStagingTarget({ SANITY_PROJECT_ID: '80016lrq', SANITY_DATASET: 'staging' }),
    { valid: true },
  )

  // Rejects production dataset with fatal error
  const prodCheck = validateStagingTarget({ SANITY_DATASET: 'production' })
  assert.equal(prodCheck.valid, false)
  assert.ok(prodCheck.error?.includes('Never write to production'))

  // Rejects wrong project ID
  const projCheck = validateStagingTarget({ SANITY_PROJECT_ID: 'wrong-project' })
  assert.equal(projCheck.valid, false)
  assert.ok(projCheck.error?.includes('Prohibited project ID'))
})

test('checkCliArguments enforces security constraints, blocks tokens, and disarms teardown', () => {
  // Clean flags
  assert.deepEqual(checkCliArguments([]), { apply: false, help: false })
  assert.deepEqual(checkCliArguments(['--apply']), { apply: true, help: false })

  // Rejects --teardown with security violation
  const teardownArg = checkCliArguments(['--teardown'])
  assert.ok(teardownArg.securityViolation?.includes('Executable teardown is disabled'))

  // Blocks token passed via CLI argument
  const tokenArg = checkCliArguments(['--token=sk12345'])
  assert.ok(tokenArg.securityViolation?.includes('Do not supply tokens via CLI arguments'))

  const authArg = checkCliArguments(['--auth=xyz'])
  assert.ok(authArg.securityViolation?.includes('Do not supply tokens via CLI arguments'))
})

test('executeStagingFixtures defaults to dry-run with zero network mutations', async () => {
  let networkCalls = 0
  const mockFetch: typeof fetch = async () => {
    networkCalls += 1
    return new Response(JSON.stringify({ result: [] }), { status: 200 })
  }

  const result = await executeStagingFixtures({
    args: [], // dry run
    env: {},
    fetchImpl: mockFetch,
  })

  assert.equal(result.success, true)
  assert.equal(result.dryRun, true)
  assert.equal(networkCalls, 0, 'Dry run must make zero network requests')
  assert.equal(result.actionCount, 6)
  assert.ok(result.message.includes('DRY RUN'))
})

test('executeStagingFixtures rejects --apply when SANITY_WRITE_TOKEN is missing', async () => {
  const result = await executeStagingFixtures({
    args: ['--apply'],
    env: { SANITY_WRITE_TOKEN: '' }, // missing token
  })

  assert.equal(result.success, false)
  assert.equal(result.dryRun, false)
  assert.ok(result.message.includes('SANITY_WRITE_TOKEN is not set'))
})

test('executeStagingFixtures rejects --apply when targeted at production', async () => {
  const result = await executeStagingFixtures({
    args: ['--apply'],
    env: { SANITY_WRITE_TOKEN: 'write-token', SANITY_DATASET: 'production' },
  })

  assert.equal(result.success, false)
  assert.ok(result.message.includes('Never write to production'))
})

test('executeStagingFixtures preflight detects conflicting published documents', async () => {
  const mockFetch: typeof fetch = async (url) => {
    const urlStr = url.toString()
    if (urlStr.includes('/data/query/staging')) {
      return new Response(
        JSON.stringify({
          result: [{ _id: FIXTURE_A_ID, _type: 'challenge' }],
        }),
        { status: 200 },
      )
    }
    return new Response(JSON.stringify({}), { status: 200 })
  }

  const result = await executeStagingFixtures({
    args: ['--apply'],
    env: { SANITY_WRITE_TOKEN: 'write-token' },
    fetchImpl: mockFetch,
  })

  assert.equal(result.success, false)
  assert.ok(result.message.includes('ABORT: Staging dataset already contains'))
  assert.ok(result.message.includes(FIXTURE_A_ID))
})

test('executeStagingFixtures preflight detects conflicting draft documents', async () => {
  const mockFetch: typeof fetch = async (url) => {
    const urlStr = url.toString()
    if (urlStr.includes('/data/query/staging')) {
      return new Response(
        JSON.stringify({
          result: [{ _id: 'drafts.r05-3b-challenge-d-draft', _type: 'challenge' }],
        }),
        { status: 200 },
      )
    }
    return new Response(JSON.stringify({}), { status: 200 })
  }

  const result = await executeStagingFixtures({
    args: ['--apply'],
    env: { SANITY_WRITE_TOKEN: 'write-token' },
    fetchImpl: mockFetch,
  })

  assert.equal(result.success, false)
  assert.ok(result.message.includes('ABORT: Staging dataset already contains'))
  assert.ok(result.message.includes('drafts.r05-3b-challenge-d-draft'))
})

test('executeStagingFixtures preflight fails closed on malformed query response', async () => {
  const mockFetch: typeof fetch = async () => {
    return new Response(JSON.stringify({ result: 'not-an-array' }), { status: 200 })
  }

  const result = await executeStagingFixtures({
    args: ['--apply'],
    env: { SANITY_WRITE_TOKEN: 'write-token' },
    fetchImpl: mockFetch,
  })

  assert.equal(result.success, false)
  assert.ok(result.message.includes('missing a valid result array'))
})

test('executeStagingFixtures rejects --teardown with safety error', async () => {
  const result = await executeStagingFixtures({
    args: ['--teardown', '--apply'],
    env: { SANITY_WRITE_TOKEN: 'write-token' },
  })

  assert.equal(result.success, false)
  assert.ok(result.message.includes('Executable teardown is disabled'))
})

test('executeStagingFixtures setup issues createIfNotExists and validates readback', async () => {
  let mutationsSent: Array<{ createIfNotExists?: { _id: string } }> = []
  let queryCount = 0

  const mockFetch: typeof fetch = async (url, init) => {
    const urlStr = url.toString()
    if (urlStr.includes('/data/query/staging')) {
      queryCount += 1
      if (queryCount === 1) {
        // Pre-flight: no existing documents
        return new Response(JSON.stringify({ result: [] }), { status: 200 })
      }
      // Post-mutation readback: return all synthetic documents
      return new Response(JSON.stringify({ result: ALL_SYNTHETIC_STAGING_DOCUMENTS }), {
        status: 200,
      })
    }
    if (urlStr.includes('/data/mutate/staging')) {
      const body = JSON.parse(String(init?.body)) as {
        mutations: Array<{ createIfNotExists?: { _id: string } }>
      }
      mutationsSent = body.mutations
      return new Response(JSON.stringify({ results: [] }), { status: 200 })
    }
    return new Response(JSON.stringify({}), { status: 200 })
  }

  const result = await executeStagingFixtures({
    args: ['--apply'],
    env: { SANITY_WRITE_TOKEN: 'write-token' },
    fetchImpl: mockFetch,
  })

  assert.equal(result.success, true)
  assert.equal(result.actionCount, 6)
  assert.equal(mutationsSent.length, 6)

  // Verify all mutations use createIfNotExists (strictly create-only)
  for (const m of mutationsSent) {
    assert.ok(m.createIfNotExists)
    assert.ok(m.createIfNotExists._id)
  }
})

test('executeStagingFixtures fails closed when post-mutation readback fails', async () => {
  let queryCount = 0

  const mockFetch: typeof fetch = async (url) => {
    const urlStr = url.toString()
    if (urlStr.includes('/data/query/staging')) {
      queryCount += 1
      if (queryCount === 1) {
        return new Response(JSON.stringify({ result: [] }), { status: 200 })
      }
      // Readback returns incomplete list (missing documents)
      return new Response(
        JSON.stringify({ result: [ALL_SYNTHETIC_STAGING_DOCUMENTS[0]] }),
        { status: 200 },
      )
    }
    if (urlStr.includes('/data/mutate/staging')) {
      return new Response(JSON.stringify({ results: [] }), { status: 200 })
    }
    return new Response(JSON.stringify({}), { status: 200 })
  }

  const result = await executeStagingFixtures({
    args: ['--apply'],
    env: { SANITY_WRITE_TOKEN: 'write-token' },
    fetchImpl: mockFetch,
  })

  assert.equal(result.success, false)
  assert.ok(result.message.includes('Post-mutation readback verification FAILED'))
})

// ---------------------------------------------------------------------------
// 5. Verification Harness Unit Tests
// ---------------------------------------------------------------------------

test('runStagingVerification executes authenticated checks and validates A through F', async () => {
  const mockFetch: typeof fetch = async (url, init) => {
    const urlObj = url instanceof URL ? url : new URL(String(url))
    const urlStr = urlObj.toString()
    const headers = new Headers(init?.headers)
    const isAccessAuthenticated = headers.has('CF-Access-Client-Id')

    // 1. Direct Sanity unauthenticated check (returns 401: private dataset proven)
    if (urlStr.includes('api.sanity.io')) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
    }

    // 2. Anonymous perimeter check on Worker root & API
    if (!isAccessAuthenticated) {
      return new Response(null, {
        status: 302,
        headers: { Location: 'https://test-team.cloudflareaccess.com/cdn-cgi/access/login' },
      })
    }

    // 3. Authenticated Catalog
    if (urlObj.pathname === '/api/challenges') {
      return new Response(
        JSON.stringify({
          ok: true,
          challenges: [{ _id: FIXTURE_A_ID, slug: FIXTURE_A_SLUG }],
        }),
        { status: 200, headers: { 'Cache-Control': 'no-store' } },
      )
    }

    // 4. Authenticated Detail for Fixture A
    if (urlObj.pathname === `/api/challenges/${FIXTURE_A_SLUG}`) {
      return new Response(
        JSON.stringify({
          ok: true,
          challenge: {
            slug: FIXTURE_A_SLUG,
            editorialEligibility: { adaptationReviewed: true },
          },
        }),
        { status: 200, headers: { 'Cache-Control': 'no-store' } },
      )
    }

    // 5. Authenticated Detail for Negative cases (B, C, D, F, Nonexistent)
    return new Response(
      JSON.stringify({
        ok: false,
        error: { kind: 'notFound', message: 'Challenge not found' },
      }),
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const report = await runStagingVerification({
    stagingUrl: 'https://bibleberry-staging.aw-e44.workers.dev',
    accessClientId: 'test-client-id',
    accessClientSecret: 'test-client-secret',
    fetchImpl: mockFetch,
  })

  assert.equal(report.passed, true)
  assert.equal(report.counts.failed, 0)
  assert.equal(report.counts.skipped, 0)
  assert.ok(report.summary.includes('SUCCEEDED'))
})

test('runStagingVerification marks authenticated checks SKIP and fails closed without credentials', async () => {
  const mockFetch: typeof fetch = async (url) => {
    const urlStr = url.toString()
    if (urlStr.includes('api.sanity.io')) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
    }
    return new Response(null, {
      status: 302,
      headers: { Location: 'https://test-team.cloudflareaccess.com/cdn-cgi/access/login' },
    })
  }

  const report = await runStagingVerification({
    stagingUrl: 'https://bibleberry-staging.aw-e44.workers.dev',
    fetchImpl: mockFetch,
  })

  assert.equal(report.passed, false, 'Default mode must fail closed without credentials')
  assert.ok(report.counts.skipped > 0)
  assert.equal(report.counts.failed, 0)
  const catalogCheck = report.results.find(r => r.id === 'gateway-catalog-outcomes')
  assert.equal(catalogCheck?.status, 'SKIP')
})

test('runStagingVerification succeeds in --perimeter-only mode without service credentials', async () => {
  const mockFetch: typeof fetch = async (url) => {
    const urlStr = url.toString()
    if (urlStr.includes('api.sanity.io')) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
    }
    return new Response(null, {
      status: 302,
      headers: { Location: 'https://test-team.cloudflareaccess.com/cdn-cgi/access/login' },
    })
  }

  const report = await runStagingVerification({
    stagingUrl: 'https://bibleberry-staging.aw-e44.workers.dev',
    perimeterOnly: true,
    fetchImpl: mockFetch,
  })

  assert.equal(report.passed, true, 'Perimeter-only mode must pass when perimeter is active')
  assert.ok(report.counts.passed > 0)
  assert.equal(report.counts.failed, 0)
  assert.ok(report.counts.skipped > 0)
  assert.ok(report.summary.includes('SUCCEEDED'))
})

test('runStagingVerification fails when 302 Location does not point to Cloudflare Access', async () => {
  const mockFetch: typeof fetch = async (url) => {
    const urlStr = url.toString()
    if (urlStr.includes('api.sanity.io')) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
    }
    return new Response(null, {
      status: 302,
      headers: { Location: 'https://unexpected-target.com/open' },
    })
  }

  const report = await runStagingVerification({
    stagingUrl: 'https://bibleberry-staging.aw-e44.workers.dev',
    perimeterOnly: true,
    fetchImpl: mockFetch,
  })

  assert.equal(report.passed, false)
  assert.ok(report.counts.failed > 0)
  const rootCheck = report.results.find(r => r.id === 'perimeter-anonymous-root')
  assert.equal(rootCheck?.status, 'FAIL')
  assert.ok(rootCheck?.message.includes('unexpected location'))
})

test('runStagingVerification handles positive control logic for direct Sanity query', async () => {
  // Case 1: 200 with 0 records without positive control -> INCONCLUSIVE
  const reportInconclusive = await runStagingVerification({
    stagingUrl: 'https://bibleberry-staging.aw-e44.workers.dev',
    perimeterOnly: true,
    fixtureAPresentInStaging: false,
    fetchImpl: async (url) => {
      const urlStr = url.toString()
      if (urlStr.includes('api.sanity.io')) {
        return new Response(JSON.stringify({ result: [] }), { status: 200 })
      }
      return new Response(null, {
        status: 302,
        headers: { Location: 'https://test-team.cloudflareaccess.com/cdn-cgi/access/login' },
      })
    },
  })
  const sanityCheckInc = reportInconclusive.results.find(r => r.id === 'sanity-direct-denial')
  assert.equal(sanityCheckInc?.status, 'INCONCLUSIVE')
  assert.equal(reportInconclusive.passed, false)

  // Case 2: 200 with 0 records WITH positive control -> PASS
  const reportPass = await runStagingVerification({
    stagingUrl: 'https://bibleberry-staging.aw-e44.workers.dev',
    perimeterOnly: true,
    fixtureAPresentInStaging: true,
    fetchImpl: async (url) => {
      const urlStr = url.toString()
      if (urlStr.includes('api.sanity.io')) {
        return new Response(JSON.stringify({ result: [] }), { status: 200 })
      }
      return new Response(null, {
        status: 302,
        headers: { Location: 'https://test-team.cloudflareaccess.com/cdn-cgi/access/login' },
      })
    },
  })
  const sanityCheckPass = reportPass.results.find(r => r.id === 'sanity-direct-denial')
  assert.equal(sanityCheckPass?.status, 'PASS')
  assert.equal(reportPass.passed, true)

  // Case 3: 200 with records exposed -> FAIL
  const reportFail = await runStagingVerification({
    stagingUrl: 'https://bibleberry-staging.aw-e44.workers.dev',
    perimeterOnly: true,
    fetchImpl: async (url) => {
      const urlStr = url.toString()
      if (urlStr.includes('api.sanity.io')) {
        return new Response(
          JSON.stringify({ result: [{ _id: 'leaked-record', _type: 'challenge' }] }),
          { status: 200 },
        )
      }
      return new Response(null, {
        status: 302,
        headers: { Location: 'https://test-team.cloudflareaccess.com/cdn-cgi/access/login' },
      })
    },
  })
  const sanityCheckFail = reportFail.results.find(r => r.id === 'sanity-direct-denial')
  assert.equal(sanityCheckFail?.status, 'FAIL')
  assert.equal(reportFail.passed, false)
})

test('runStagingVerification fails closed on network errors', async () => {
  const report = await runStagingVerification({
    stagingUrl: 'https://bibleberry-staging.aw-e44.workers.dev',
    perimeterOnly: true,
    fetchImpl: async () => {
      throw new Error('Connection refused')
    },
  })

  assert.equal(report.passed, false)
  for (const res of report.results.filter(r => r.status !== 'SKIP')) {
    assert.equal(res.status, 'FAIL')
    assert.equal(res.passed, false)
    assert.ok(res.message.includes('Network error'))
  }
})
