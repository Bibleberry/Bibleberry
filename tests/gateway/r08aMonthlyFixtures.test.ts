import assert from 'node:assert/strict'
import test from 'node:test'
import { handleGatewayRequest } from '../../src/gateway/handler.ts'
import { computeAdvancePreviewStartDate, daysInMonth } from '../../src/gateway/localRelease.ts'
import type { GatewayEnv, GatewayFetch } from '../../src/gateway/types.ts'
import {
  ALL_R08A_INTENDED_DOCUMENT_IDS,
  ALL_R08A_INTENDED_SLUGS,
  ALL_R08A_MONTHLY_DOCUMENTS,
  R08A_MONTH_SPECS,
  R08A_MONTHLY_CHALLENGE_DOCUMENTS,
  R08A_MONTHLY_NEWS_DOCUMENTS,
  R08A_MONTHLY_PUBLICATION_DOCUMENTS,
  buildChallengeId,
  buildR08aNegativeVariants,
  toDereferencedMonthlyDetailDoc,
  toDereferencedMonthlyPreviewDoc,
  toDereferencedNewsArticleDoc,
  toDereferencedSlottedChallengeDoc,
} from '../../src/gateway/fixtures/r08aMonthlyFixtures.ts'
import { ALL_SYNTHETIC_DOCUMENT_IDS } from '../../src/gateway/fixtures/stagingAcceptanceFixtures.ts'
import {
  EXPECTED_DATASET,
  EXPECTED_PROJECT_ID,
  computeR08aManifestChecksum,
  executeR08aMonthlyFixtures,
  parseR08aCliArgs,
  runLiveGroqProbe,
  runPreflightCollisionReport,
  validateR08aStagingTarget,
} from '../../scripts/r08a-monthly-fixtures.ts'

const TEST_ENV: GatewayEnv = {
  SANITY_PROJECT_ID: '80016lrq',
  SANITY_DATASET: 'staging',
  SANITY_READ_TOKEN: 'test-reader-token-secret-12345',
  ALLOWED_ORIGINS: 'http://localhost:3000',
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

// ---------------------------------------------------------------------------
// 1. Canonical Fixture Invariants, Determinism, and R05 Isolation
// ---------------------------------------------------------------------------

test('R08A monthly fixtures are deterministic, synthetic-only, and completely isolated from R05 fixtures', () => {
  assert.equal(R08A_MONTHLY_PUBLICATION_DOCUMENTS.length, 4)
  assert.equal(R08A_MONTHLY_CHALLENGE_DOCUMENTS.length, 118) // 29 + 28 + 31 + 30
  assert.equal(R08A_MONTHLY_NEWS_DOCUMENTS.length, 5)
  assert.equal(ALL_R08A_MONTHLY_DOCUMENTS.length, 127)
  assert.equal(new Set(ALL_R08A_INTENDED_DOCUMENT_IDS).size, 127)
  assert.equal(new Set(ALL_R08A_INTENDED_SLUGS).size, 123)

  // Verify exact month IDs and day lengths
  const expected = [
    ['month-2096-02', 29],
    ['month-2098-02', 28],
    ['month-2098-03', 31],
    ['month-2098-04', 30],
  ] as const
  for (const [id, days] of expected) {
    const doc = R08A_MONTHLY_PUBLICATION_DOCUMENTS.find(m => m._id === id)
    assert.ok(doc, `Missing ${id}`)
    const spec = R08A_MONTH_SPECS.find(s => `month-${s.yearMonth}` === id)!
    assert.equal(spec.expectedDays, daysInMonth(spec.year, spec.month))
    assert.equal(spec.previewStartDate, computeAdvancePreviewStartDate(spec.year, spec.month))
    assert.equal(doc.slots.length, days)
    assert.equal(doc.rosterFinalization.finalizedChallengeIds.length, days)
    assert.equal(doc.editorialReview.reviewerRole, 'technical_synthetic')
  }

  // Zero overlap with R05 r05-3b-* fixtures
  const r05Set = new Set(ALL_SYNTHETIC_DOCUMENT_IDS)
  for (const id of ALL_R08A_INTENDED_DOCUMENT_IDS) {
    assert.equal(r05Set.has(id), false, `Collision with R05 ID ${id}`)
  }

  // Monthly Challenges omit releaseAt, series, and sequence and stay referenceOnly
  for (const ch of R08A_MONTHLY_CHALLENGE_DOCUMENTS) {
    assert.equal(ch._id.startsWith('r08a-stg-'), true)
    assert.equal('releaseAt' in ch, false)
    assert.equal('series' in ch, false)
    assert.equal('sequence' in ch, false)
    assert.equal(ch.primaryScripture.textStatus, 'referenceOnly')
    assert.equal('passage' in ch.primaryScripture, false)
    assert.equal(ch.editorialReview.reviewedBy, 'Aaron Waid (technical synthetic approval)')
  }

  // Deterministic checksum
  const c1 = computeR08aManifestChecksum()
  const c2 = computeR08aManifestChecksum()
  assert.equal(c1, c2)
  assert.match(c1, /^[a-f0-9]{64}$/)
})

// ---------------------------------------------------------------------------
// 2. Gateway Handler End-to-End Verification Against Generated Fixtures
// ---------------------------------------------------------------------------

test('gateway handler serves generated R08A fixtures accurately across preview, month detail, progress, News, and Challenge routes', async () => {
  // 2a. March 2098 Feb-27 advance preview boundary (404 on Feb 26, 200 on Feb 27)
  {
    const previewDoc = toDereferencedMonthlyPreviewDoc('2098-03')!
    const mockFetch = createMockFetch(() =>
      new Response(JSON.stringify({ result: previewDoc }), { status: 200 }),
    )
    const before = await handleGatewayRequest(
      new Request('http://localhost/api/months/2098-03/preview', {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      TEST_ENV,
      { getNow: () => new Date('2098-02-26T20:00:00Z'), fetchImpl: mockFetch },
    )
    assert.equal(before.status, 404)

    const atStart = await handleGatewayRequest(
      new Request('http://localhost/api/months/2098-03/preview', {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      TEST_ENV,
      { getNow: () => new Date('2098-02-27T12:00:00Z'), fetchImpl: mockFetch },
    )
    assert.equal(atStart.status, 200)
    const body = (await atStart.json()) as {
      month: { daysInMonth: number; slots: Array<{ availability: string; slug?: string }> }
    }
    assert.equal(body.month.daysInMonth, 31)
    assert.equal(body.month.slots.length, 31)
    assert.equal(body.month.slots.every(s => s.availability === 'comingSoon' && !s.slug), true)
  }

  // 2b. Leap Feb 2096 (29 days) & non-leap Feb 2098 (28 days) active detail & historical progress
  for (const spec of R08A_MONTH_SPECS) {
    const detailDoc = toDereferencedMonthlyDetailDoc(spec.yearMonth)!
    const mockFetch = createMockFetch(() =>
      new Response(JSON.stringify({ result: detailDoc }), { status: 200 }),
    )
    const startRes = await handleGatewayRequest(
      new Request(`http://localhost/api/months/${spec.yearMonth}`, {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      TEST_ENV,
      { getNow: () => new Date(`${spec.yearMonth}-01T12:00:00Z`), fetchImpl: mockFetch },
    )
    assert.equal(startRes.status, 200)
    const text = await startRes.text()
    assert.equal(text.includes('qualifyingChallenge'), false)
    assert.equal(text.includes('SIMULATED SYNTHETIC ELIGIBILITY'), false)
    const detailBody = JSON.parse(text) as {
      month: { daysInMonth: number; totalChallenges: number; slots: Array<{ availability: string }> }
    }
    assert.equal(detailBody.month.daysInMonth, spec.expectedDays)
    assert.equal(detailBody.month.totalChallenges, spec.expectedDays)
    assert.equal(detailBody.month.slots[0].availability, 'available')
    assert.equal(detailBody.month.slots[spec.expectedDays - 1].availability, 'comingSoon')
  }

  // 2c. Preview News strips body and keeps minimal contract
  {
    const newsDocs = R08A_MONTHLY_NEWS_DOCUMENTS.map(d => toDereferencedNewsArticleDoc(d))
    const mockFetch = createMockFetch(() =>
      new Response(JSON.stringify({ result: newsDocs }), { status: 200 }),
    )
    const res = await handleGatewayRequest(
      new Request('http://localhost/api/news?category=monthlyPreview', {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      TEST_ENV,
      { getNow: () => new Date('2098-02-27T12:00:00Z'), fetchImpl: mockFetch },
    )
    assert.equal(res.status, 200)
    const body = (await res.json()) as { articles: Array<Record<string, unknown>> }
    const marPreview = body.articles.find(a => a.documentId === 'news-preview-2098-03')
    assert.ok(marPreview)
    assert.equal('body' in marPreview, false)
    assert.equal('coverImage' in marPreview, false)
    assert.deepEqual(marPreview.destination, { kind: 'month', monthId: '2098-03' })
  }

  // 2d. Slotted Challenge route omits releaseAt and projects calendarSlot
  {
    const day1Id = buildChallengeId('2098-04', 1)
    const slotted = toDereferencedSlottedChallengeDoc(day1Id)!
    const mockFetch = createMockFetch(() =>
      new Response(JSON.stringify({ result: slotted }), { status: 200 }),
    )
    const tooEarly = await handleGatewayRequest(
      new Request(`http://localhost/api/challenges/${day1Id}`, {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      TEST_ENV,
      { getNow: () => new Date('2098-03-31T20:00:00Z'), fetchImpl: mockFetch },
    )
    assert.equal(tooEarly.status, 404)

    const onDay = await handleGatewayRequest(
      new Request(`http://localhost/api/challenges/${day1Id}`, {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      TEST_ENV,
      { getNow: () => new Date('2098-04-01T12:00:00Z'), fetchImpl: mockFetch },
    )
    assert.equal(onDay.status, 200)
    const chBody = (await onDay.json()) as {
      challenge: { releaseAt?: string; calendarSlot?: { publicationDate: string } }
    }
    assert.equal(chBody.challenge.releaseAt, undefined)
    assert.equal(chBody.challenge.calendarSlot?.publicationDate, '2098-04-01')
  }
})

test('negative and emergency withdrawal variants enforce fail-closed 404s and Option 4A 29/29 progress math', async () => {
  const variants = buildR08aNegativeVariants()
  const negativeGatewayDocs = [
    variants.duplicateIntraMonthSlotGateway,
    variants.foreignMonthSlotRefGateway,
    variants.draftChallengeRefGateway,
    variants.unreviewedChallengeGateway,
    variants.unlicensedScriptureChallengeGateway,
    variants.invalidSlotDateGateway,
  ]

  let baseline404: string | null = null
  for (const doc of negativeGatewayDocs) {
    const mockFetch = createMockFetch(() =>
      new Response(JSON.stringify({ result: doc }), { status: 200 }),
    )
    const res = await handleGatewayRequest(
      new Request('http://localhost/api/months/2098-04', {
        headers: { 'X-Bibleberry-Timezone': 'America/New_York' },
      }),
      TEST_ENV,
      { getNow: () => new Date('2098-04-20T12:00:00Z'), fetchImpl: mockFetch },
    )
    assert.equal(res.status, 404)
    const text = await res.text()
    assert.equal(text.includes('SECRET_'), false)
    if (baseline404 === null) {
      baseline404 = text
    } else {
      assert.equal(text, baseline404)
    }
  }

  // Immediate live withdrawal, retracted withdrawal, and formal v2 withdrawal all preserve 29/29 achievability
  for (const doc of [
    variants.immediateWithdrawalLiveGateway,
    variants.retractedWithdrawnChallengeGateway,
    variants.formalAmendedV2WithdrawalGateway,
  ]) {
    const mockFetch = createMockFetch(() =>
      new Response(JSON.stringify({ result: doc }), { status: 200 }),
    )
    const activeIds = Array.from({ length: 30 }, (_, i) => i + 1)
      .filter(d => d !== 18)
      .map(d => `cms:${buildChallengeId('2098-04', d)}`)

    const progressRes = await handleGatewayRequest(
      new Request('http://localhost/api/months/2098-04/progress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bibleberry-Timezone': 'America/New_York',
        },
        body: JSON.stringify({
          completedChallengeIds: [...activeIds, `cms:${buildChallengeId('2098-04', 18)}`],
        }),
      }),
      TEST_ENV,
      { getNow: () => new Date('2098-05-02T12:00:00Z'), fetchImpl: mockFetch },
    )
    assert.equal(progressRes.status, 200)
    const text = await progressRes.text()
    assert.equal(text.includes('SECRET_'), false)
    assert.equal(text.includes('qualifyingChallenge'), false)
    const body = JSON.parse(text) as {
      completedInMonthCount: number
      totalChallenges: number
      discoveries: Array<{ kind: string; isEarned: boolean; achievedCount: number; targetCount: number }>
    }
    assert.equal(body.completedInMonthCount, 29)
    assert.equal(body.totalChallenges, 29)
    const fullMonth = body.discoveries[body.discoveries.length - 1]
    assert.equal(fullMonth.kind, 'fullMonth')
    assert.equal(fullMonth.achievedCount, 29)
    assert.equal(fullMonth.targetCount, 29)
    assert.equal(fullMonth.isEarned, true)
  }
})

// ---------------------------------------------------------------------------
// 3. CLI Security Guards & Zero-Network Default Behavior
// ---------------------------------------------------------------------------

test('CLI runner is dry-run/zero-write by default with zero network calls and rejects mutation/token/production inputs', async () => {
  const result = await executeR08aMonthlyFixtures({
    args: [],
    env: { SANITY_PROJECT_ID: EXPECTED_PROJECT_ID, SANITY_DATASET: EXPECTED_DATASET },
    fetchImpl: (async () => {
      throw new Error('Default invocation must never make network calls')
    }) as typeof fetch,
  })
  assert.equal(result.success, true)
  assert.equal(result.dryRun, true)
  assert.equal(result.writePathPresent, false)
  assert.equal(result.counts.totalDocuments, 127)
  assert.equal(result.offlineGatewayValidation.passed, true)
  assert.equal(result.liveGroqProbe.status, 'NOT_RUN')
  assert.equal(result.preflight.status, 'NOT_RUN')

  // Reject forbidden mutation flags and CLI tokens
  for (const badArgs of [
    ['--apply'],
    ['--teardown'],
    ['--delete'],
    ['--write'],
    ['--unknown-flag'],
    ['--token=sk_secret'],
    ['sk_live_secret_token'],
  ]) {
    const parsed = parseR08aCliArgs(badArgs)
    assert.ok(parsed.securityViolation, `Expected rejection for ${badArgs.join(' ')}`)
    const failed = await executeR08aMonthlyFixtures({ args: badArgs })
    assert.equal(failed.success, false)
  }

  // Reject non-staging targets
  assert.equal(validateR08aStagingTarget({ SANITY_DATASET: 'production' }).valid, false)
  assert.equal(validateR08aStagingTarget({ SANITY_PROJECT_ID: 'otherproj' }).valid, false)
  const prodRun = await executeR08aMonthlyFixtures({
    env: { SANITY_PROJECT_ID: '80016lrq', SANITY_DATASET: 'production' },
  })
  assert.equal(prodRun.success, false)
})

// ---------------------------------------------------------------------------
// 4. Read-Only Live GROQ Probe & Preflight Collision Report (Injected HTTP)
// ---------------------------------------------------------------------------

test('runLiveGroqProbe handles NOT_RUN, INCONCLUSIVE null/empty results, populated PASS/FAIL, and never leaks tokens', async () => {
  // Missing token -> NOT_RUN, zero network
  {
    const res = await runLiveGroqProbe({
      env: {},
      fetchImpl: (async () => {
        throw new Error('Must not call fetch without SANITY_READ_TOKEN')
      }) as typeof fetch,
    })
    assert.equal(res.status, 'NOT_RUN')
  }

  const secretToken = 'sk_test_read_token_never_leak_999'

  // Empty/null Sanity response -> syntax PASS, semantics INCONCLUSIVE/NOT YET EXERCISED
  {
    const seenUrls: URL[] = []
    const seenMethods: string[] = []
    const res = await runLiveGroqProbe({
      env: { SANITY_READ_TOKEN: secretToken },
      fetchImpl: (async (input, init) => {
        const url = new URL(typeof input === 'string' ? input : input.toString())
        seenUrls.push(url)
        seenMethods.push(init?.method ?? 'GET')
        const query = url.searchParams.get('query') ?? ''
        const isArrayQuery = query.includes(']_type') || query.includes('order(')
        return new Response(JSON.stringify({ result: isArrayQuery ? [] : null }), { status: 200 })
      }) as typeof fetch,
    })
    assert.equal(res.status, 'INCONCLUSIVE')
    assert.equal(res.queries.length, 5)
    assert.equal(seenMethods.every(m => m === 'GET'), true)
    assert.equal(seenUrls.every(u => u.hostname === '80016lrq.api.sanity.io'), true)
    assert.equal(seenUrls.every(u => u.pathname.endsWith('/data/query/staging')), true)
    assert.equal(seenUrls.every(u => u.searchParams.get('perspective') === 'published'), true)
    assert.equal(seenUrls.every(u => !u.toString().includes(secretToken)), true)
    assert.equal(JSON.stringify(res).includes(secretToken), false)
    for (const q of res.queries) {
      assert.equal(q.syntaxAndConnectivity, 'PASS')
      assert.equal(q.semanticsStatus, 'INCONCLUSIVE/NOT YET EXERCISED')
    }
  }

  // Populated Sanity response -> exercises slots[].challenge->, assignedMonthIds, relatedMonth->, ^.^._id
  {
    const previewDoc = toDereferencedMonthlyPreviewDoc('2098-03')!
    const detailDoc = toDereferencedMonthlyDetailDoc('2098-04')!
    const newsDoc = toDereferencedNewsArticleDoc(
      R08A_MONTHLY_NEWS_DOCUMENTS.find(n => n._id === 'news-preview-2098-03')!,
    )
    const day1Doc = toDereferencedSlottedChallengeDoc(buildChallengeId('2098-04', 1))!

    const res = await runLiveGroqProbe({
      env: { SANITY_READ_TOKEN: secretToken },
      fetchImpl: (async input => {
        const url = new URL(typeof input === 'string' ? input : input.toString())
        const query = (url.searchParams.get('query') ?? '').trimStart()
        if (query.startsWith('*[_type == "newsArticle"')) {
          return new Response(JSON.stringify({ result: [newsDoc] }), { status: 200 })
        }
        if (query.startsWith('*[_type == "monthlyPublication"') && query.includes('discoveries')) {
          return new Response(JSON.stringify({ result: detailDoc }), { status: 200 })
        }
        if (query.startsWith('*[_type == "monthlyPublication"')) {
          return new Response(JSON.stringify({ result: previewDoc }), { status: 200 })
        }
        if (query.includes('slug.current == $slug')) {
          return new Response(JSON.stringify({ result: day1Doc }), { status: 200 })
        }
        return new Response(JSON.stringify({ result: [day1Doc] }), { status: 200 })
      }) as typeof fetch,
    })
    assert.equal(res.status, 'PASS')
    assert.equal(res.queries.every(q => q.semanticsStatus === 'PASS'), true)
  }

  // Populated response missing assignedMonthIds -> semantics FAIL
  {
    const brokenDetail = toDereferencedMonthlyDetailDoc('2098-04')! as Record<string, unknown>
    const slots = brokenDetail.slots as Array<{ challenge: Record<string, unknown> }>
    slots[0].challenge.assignedMonthIds = []
    const res = await runLiveGroqProbe({
      env: { SANITY_READ_TOKEN: secretToken },
      fetchImpl: (async input => {
        const url = new URL(typeof input === 'string' ? input : input.toString())
        const query = (url.searchParams.get('query') ?? '').trimStart()
        if (query.startsWith('*[_type == "monthlyPublication"') && query.includes('discoveries')) {
          return new Response(JSON.stringify({ result: brokenDetail }), { status: 200 })
        }
        return new Response(JSON.stringify({ result: null }), { status: 200 })
      }) as typeof fetch,
    })
    assert.equal(res.status, 'FAIL')
    const detailQuery = res.queries.find(q => q.queryName === 'MONTHLY_DETAIL_BY_ID_GROQ_QUERY')
    assert.equal(detailQuery?.semanticsStatus, 'FAIL')
  }
})

test('runPreflightCollisionReport enforces perspective=raw, batched GET URLs, and CLEAR / BLOCKED / INCONCLUSIVE states', async () => {
  // Missing token -> NOT_RUN, applyAllowed=false
  {
    const res = await runPreflightCollisionReport({ env: {} })
    assert.equal(res.status, 'NOT_RUN')
    assert.equal(res.applyAllowed, false)
    assert.equal(res.wouldAllowFutureApply, false)
  }

  // CLEAR when zero conflicts returned
  {
    const seenPerspectives: string[] = []
    const seenMethods: string[] = []
    const res = await runPreflightCollisionReport({
      env: { SANITY_READ_TOKEN: 'read-token-123' },
      fetchImpl: (async (input, init) => {
        const url = new URL(typeof input === 'string' ? input : input.toString())
        seenPerspectives.push(url.searchParams.get('perspective') ?? '')
        seenMethods.push(init?.method ?? 'GET')
        assert.ok(url.toString().length < 4096, `URL too long (${url.toString().length})`)
        return new Response(JSON.stringify({ result: [] }), { status: 200 })
      }) as typeof fetch,
    })
    assert.equal(res.status, 'CLEAR')
    assert.equal(res.applyAllowed, false)
    assert.equal(res.wouldAllowFutureApply, true)
    assert.equal(seenPerspectives.every(p => p === 'raw'), true)
    assert.equal(seenMethods.every(m => m === 'GET'), true)
  }

  // BLOCKED when draft or published ID / slug collision is detected
  {
    let batch = 0
    const res = await runPreflightCollisionReport({
      env: { SANITY_READ_TOKEN: 'read-token-123' },
      fetchImpl: (async () => {
        batch += 1
        if (batch === 1) {
          return new Response(
            JSON.stringify({
              result: [
                {
                  _id: 'drafts.month-2098-03',
                  _type: 'monthlyPublication',
                  slug: null,
                },
                {
                  _id: 'other-doc',
                  _type: 'challenge',
                  slug: 'r08a-stg-2098-04-day-01',
                },
              ],
            }),
            { status: 200 },
          )
        }
        return new Response(JSON.stringify({ result: [] }), { status: 200 })
      }) as typeof fetch,
    })
    assert.equal(res.status, 'BLOCKED')
    assert.equal(res.applyAllowed, false)
    assert.equal(res.wouldAllowFutureApply, false)
    assert.deepEqual(res.conflictingDocumentIds, ['drafts.month-2098-03', 'other-doc'])
    assert.deepEqual(res.conflictingSlugs, ['r08a-stg-2098-04-day-01'])
  }

  // INCONCLUSIVE when upstream returns 500 or malformed JSON
  {
    const res = await runPreflightCollisionReport({
      env: { SANITY_READ_TOKEN: 'read-token-123' },
      fetchImpl: (async () => new Response('upstream error', { status: 500 })) as typeof fetch,
    })
    assert.equal(res.status, 'INCONCLUSIVE')
    assert.equal(res.applyAllowed, false)
    assert.equal(res.wouldAllowFutureApply, false)
  }
})
