/**
 * Anthropic Addresses #369 — operator diagnostics and the upstream timeout.
 *
 * Every test here checks two things together: the reader-facing response is exactly what the
 * gateway returned before diagnostics existed, and the operator-facing log event says why.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_UPSTREAM_TIMEOUT_MS, handleGatewayRequest } from '../../src/gateway/handler.ts'
import {
  classifyUpstreamStatus,
  consoleGatewayLogger,
  createRouteDiagnostics,
} from '../../src/gateway/diagnostics.ts'
import type { GatewayDiagnosticEvent } from '../../src/gateway/diagnostics.ts'
import type { GatewayEnv, GatewayFetch, GatewayOptions } from '../../src/gateway/types.ts'
import {
  buildR08aNegativeVariants,
  toDereferencedMonthlyDetailDoc,
  toDereferencedMonthlyPreviewDoc,
} from '../../src/gateway/fixtures/r08aMonthlyFixtures.ts'

const SECRET_TOKEN = 'sk-diagnostics-test-token-must-never-be-logged-8f3a'

const TEST_ENV: GatewayEnv = {
  SANITY_PROJECT_ID: '80016lrq',
  SANITY_DATASET: 'staging',
  SANITY_READ_TOKEN: SECRET_TOKEN,
  ALLOWED_ORIGINS: 'http://localhost:3000',
}

const ACTIVE_APRIL = () => new Date('2098-04-20T12:00:00Z')
const NEUTRAL_MONTH_404 = JSON.stringify({ ok: false, error: { kind: 'notFound', message: 'Month not found' } })
const NEUTRAL_502 = JSON.stringify({
  ok: false,
  error: { kind: 'upstreamError', message: 'Upstream content service unavailable' },
})

/** Strings that must never appear in any diagnostic event. */
const FORBIDDEN_IN_LOGS = [
  SECRET_TOKEN,
  'Bearer',
  'api.sanity.io',
  'monthlyPublication', // GROQ query text
  'SECRET_',
  'UPSTREAM_ERROR_BODY',
  'Psalm', // Scripture references from the fixtures
]

function createCapture(): { events: GatewayDiagnosticEvent[]; logger: (e: GatewayDiagnosticEvent) => void } {
  const events: GatewayDiagnosticEvent[] = []
  return { events, logger: event => events.push(event) }
}

function respondWith(handler: (url: URL, init?: RequestInit) => Response | Promise<Response>): GatewayFetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? new URL(input) : input instanceof URL ? input : new URL(input.url)
    return handler(url, init)
  }
}

function jsonResult(result: unknown): Response {
  return new Response(JSON.stringify({ result }), { status: 200 })
}

async function request(
  path: string,
  options: GatewayOptions,
  init: RequestInit = {},
  env: GatewayEnv = TEST_ENV,
): Promise<{ status: number; body: string; headers: Headers }> {
  const res = await handleGatewayRequest(
    new Request(`http://localhost${path}`, {
      ...init,
      headers: { 'X-Bibleberry-Timezone': 'America/New_York', ...(init.headers ?? {}) },
    }),
    env,
    options,
  )
  return { status: res.status, body: await res.text(), headers: res.headers }
}

function assertNoLeakage(events: readonly GatewayDiagnosticEvent[]): void {
  const serialized = JSON.stringify(events)
  for (const forbidden of FORBIDDEN_IN_LOGS) {
    assert.equal(serialized.includes(forbidden), false, `diagnostic events leaked "${forbidden}": ${serialized}`)
  }
}

// ---------------------------------------------------------------------------
// Acceptance: rejected token, malformed month and unreleased month are distinguishable
// from logs alone, while the reader responses are the unchanged neutral 502 / 404.
// ---------------------------------------------------------------------------

test('operator can tell a rejected token, a malformed month and an unreleased month apart; readers cannot', async () => {
  const variants = buildR08aNegativeVariants()

  const rejectedToken = createCapture()
  const tokenRes = await request('/api/months/2098-04', {
    getNow: ACTIVE_APRIL,
    logger: rejectedToken.logger,
    fetchImpl: respondWith(() => new Response('UPSTREAM_ERROR_BODY: token revoked', { status: 401 })),
  })

  const malformed = createCapture()
  const malformedRes = await request('/api/months/2098-04', {
    getNow: ACTIVE_APRIL,
    logger: malformed.logger,
    fetchImpl: respondWith(() => jsonResult(variants.invalidSlotDateGateway)),
  })

  const unreleased = createCapture()
  let unreleasedUpstreamCalls = 0
  const unreleasedRes = await request('/api/months/2098-04', {
    getNow: () => new Date('2098-03-20T12:00:00Z'),
    logger: unreleased.logger,
    fetchImpl: respondWith(() => {
      unreleasedUpstreamCalls += 1
      return jsonResult(toDereferencedMonthlyDetailDoc('2098-04'))
    }),
  })

  // Reader responses: unchanged and indistinguishable within their class.
  assert.equal(tokenRes.status, 502)
  assert.equal(tokenRes.body, NEUTRAL_502)
  assert.equal(malformedRes.status, 404)
  assert.equal(unreleasedRes.status, 404)
  assert.equal(malformedRes.body, NEUTRAL_MONTH_404)
  assert.equal(unreleasedRes.body, NEUTRAL_MONTH_404)
  assert.equal(unreleasedUpstreamCalls, 0, 'release gate must still answer without contacting Sanity')

  // Operator logs: one event each, clearly different.
  assert.equal(rejectedToken.events.length, 1)
  assert.deepEqual(
    { ...rejectedToken.events[0], elapsedMs: undefined },
    {
      source: 'bibleberry-gateway',
      route: 'monthDetail',
      event: 'upstreamFailure',
      level: 'error',
      responseStatus: 502,
      failure: 'httpStatus',
      upstreamStatus: 401,
      upstreamStatusHint: 'authorization',
      elapsedMs: undefined,
    },
  )

  assert.deepEqual(malformed.events, [
    {
      source: 'bibleberry-gateway',
      route: 'monthDetail',
      event: 'contentUnavailable',
      level: 'warn',
      responseStatus: 404,
      stage: 'projection',
      reason: 'invalidCalendarAssignment',
      yearMonth: '2098-04',
    },
  ])

  assert.deepEqual(unreleased.events, [
    {
      source: 'bibleberry-gateway',
      route: 'monthDetail',
      event: 'contentUnavailable',
      level: 'info',
      responseStatus: 404,
      stage: 'releaseGate',
      reason: 'notYetReleased',
      yearMonth: '2098-04',
    },
  ])

  assertNoLeakage([...rejectedToken.events, ...malformed.events, ...unreleased.events])
})

test('a released, valid month produces no diagnostic event', async () => {
  const capture = createCapture()
  const res = await request('/api/months/2098-04', {
    getNow: ACTIVE_APRIL,
    logger: capture.logger,
    fetchImpl: respondWith(() => jsonResult(toDereferencedMonthlyDetailDoc('2098-04'))),
  })
  assert.equal(res.status, 200)
  assert.deepEqual(capture.events, [])
})

// ---------------------------------------------------------------------------
// Month routes: each 404 path names its stage and reason
// ---------------------------------------------------------------------------

test('month 404 paths record stage and reason on preview, detail and progress routes', async () => {
  const variants = buildR08aNegativeVariants()
  const progressInit: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ completedChallengeIds: [] }),
  }

  const cases: Array<{
    label: string
    path: string
    init?: RequestInit
    now: string
    result: unknown
    expected: Pick<Extract<GatewayDiagnosticEvent, { event: 'contentUnavailable' }>, 'route' | 'stage' | 'reason' | 'level'>
  }> = [
    {
      label: 'preview before advance preview window',
      path: '/api/months/2098-04/preview',
      now: '2098-03-01T12:00:00Z',
      result: null,
      expected: { route: 'monthPreview', stage: 'releaseGate', reason: 'notYetReleased', level: 'info' },
    },
    {
      label: 'preview with no scheduled document',
      path: '/api/months/2098-04/preview',
      now: '2098-03-29T12:00:00Z',
      result: null,
      expected: { route: 'monthPreview', stage: 'upstream', reason: 'noEligibleDocument', level: 'info' },
    },
    {
      label: 'detail with no scheduled document',
      path: '/api/months/2098-04',
      now: '2098-04-20T12:00:00Z',
      result: null,
      expected: { route: 'monthDetail', stage: 'upstream', reason: 'noEligibleDocument', level: 'info' },
    },
    {
      label: 'detail with unlicensed Scripture',
      path: '/api/months/2098-04',
      now: '2098-04-20T12:00:00Z',
      result: variants.unlicensedScriptureChallengeGateway,
      expected: { route: 'monthDetail', stage: 'projection', reason: 'unlicensedScripture', level: 'warn' },
    },
    {
      label: 'detail with unreviewed Challenge',
      path: '/api/months/2098-04',
      now: '2098-04-20T12:00:00Z',
      result: variants.unreviewedChallengeGateway,
      expected: { route: 'monthDetail', stage: 'projection', reason: 'unreviewed', level: 'warn' },
    },
    {
      label: 'detail with draft Challenge reference',
      path: '/api/months/2098-04',
      now: '2098-04-20T12:00:00Z',
      result: variants.draftChallengeRefGateway,
      expected: { route: 'monthDetail', stage: 'projection', reason: 'draftDocument', level: 'warn' },
    },
    {
      label: 'detail with duplicate slot',
      path: '/api/months/2098-04',
      now: '2098-04-20T12:00:00Z',
      result: variants.duplicateIntraMonthSlotGateway,
      expected: { route: 'monthDetail', stage: 'projection', reason: 'duplicateSlotAssignment', level: 'warn' },
    },
    {
      label: 'progress before month start',
      path: '/api/months/2098-04/progress',
      init: progressInit,
      now: '2098-03-20T12:00:00Z',
      result: null,
      expected: { route: 'monthProgress', stage: 'releaseGate', reason: 'notYetReleased', level: 'info' },
    },
    {
      label: 'progress on malformed month',
      path: '/api/months/2098-04/progress',
      init: progressInit,
      now: '2098-04-20T12:00:00Z',
      result: variants.invalidSlotDateGateway,
      expected: { route: 'monthProgress', stage: 'projection', reason: 'invalidCalendarAssignment', level: 'warn' },
    },
  ]

  for (const c of cases) {
    const capture = createCapture()
    const res = await request(
      c.path,
      { getNow: () => new Date(c.now), logger: capture.logger, fetchImpl: respondWith(() => jsonResult(c.result)) },
      c.init,
    )
    assert.equal(res.status, 404, c.label)
    assert.equal(res.body, NEUTRAL_MONTH_404, `${c.label}: reader body must be the neutral 404`)
    assert.equal(capture.events.length, 1, `${c.label}: exactly one event`)
    const event = capture.events[0]
    assert.equal(event.event, 'contentUnavailable', c.label)
    assert.deepEqual(
      { route: event.route, stage: (event as { stage: unknown }).stage, reason: (event as { reason: unknown }).reason, level: event.level },
      c.expected,
      c.label,
    )
    assert.equal((event as { yearMonth?: string }).yearMonth, '2098-04', c.label)
    assertNoLeakage(capture.events)
  }
})

test('an unparseable month in the URL is not logged (no request-controlled text reaches logs)', async () => {
  const capture = createCapture()
  const res = await request('/api/months/SECRET_%3Cscript%3E', {
    getNow: ACTIVE_APRIL,
    logger: capture.logger,
    fetchImpl: respondWith(() => jsonResult(null)),
  })
  assert.equal(res.status, 404)
  assert.equal(res.body, NEUTRAL_MONTH_404)
  assert.deepEqual(capture.events, [])
})

test('a valid preview logs nothing', async () => {
  const capture = createCapture()
  const res = await request('/api/months/2098-04/preview', {
    getNow: () => new Date('2098-03-29T12:00:00Z'),
    logger: capture.logger,
    fetchImpl: respondWith(() => jsonResult(toDereferencedMonthlyPreviewDoc('2098-04'))),
  })
  assert.equal(res.status, 200)
  assert.deepEqual(capture.events, [])
})

// ---------------------------------------------------------------------------
// Upstream failure classes
// ---------------------------------------------------------------------------

test('each upstream failure class has its own log event and the same public 502', async () => {
  const cases: Array<{
    label: string
    fetchImpl: GatewayFetch
    expected: Record<string, unknown>
  }> = [
    {
      label: 'network error',
      fetchImpl: async () => {
        throw new TypeError(`connect ECONNREFUSED ${SECRET_TOKEN}`)
      },
      expected: { failure: 'network', level: 'warn' },
    },
    {
      label: '403 permission',
      fetchImpl: respondWith(() => new Response('UPSTREAM_ERROR_BODY', { status: 403 })),
      expected: { failure: 'httpStatus', upstreamStatus: 403, upstreamStatusHint: 'authorization', level: 'error' },
    },
    {
      label: '404 project or dataset',
      fetchImpl: respondWith(() => new Response('UPSTREAM_ERROR_BODY', { status: 404 })),
      expected: { failure: 'httpStatus', upstreamStatus: 404, upstreamStatusHint: 'notFound', level: 'error' },
    },
    {
      label: '429 rate limited',
      fetchImpl: respondWith(() => new Response('UPSTREAM_ERROR_BODY', { status: 429 })),
      expected: { failure: 'httpStatus', upstreamStatus: 429, upstreamStatusHint: 'rateLimited', level: 'warn' },
    },
    {
      label: '503 upstream outage',
      fetchImpl: respondWith(() => new Response('UPSTREAM_ERROR_BODY', { status: 503 })),
      expected: { failure: 'httpStatus', upstreamStatus: 503, upstreamStatusHint: 'serverError', level: 'warn' },
    },
    {
      label: 'invalid JSON',
      fetchImpl: respondWith(() => new Response('<html>SECRET_PROXY_PAGE</html>', { status: 200 })),
      expected: { failure: 'invalidJson', level: 'error' },
    },
    {
      label: 'missing result',
      fetchImpl: respondWith(() => new Response(JSON.stringify({ ms: 3, query: 'SECRET_QUERY' }), { status: 200 })),
      expected: { failure: 'missingResult', level: 'error' },
    },
  ]

  for (const c of cases) {
    const capture = createCapture()
    const res = await request('/api/months/2098-04', { getNow: ACTIVE_APRIL, logger: capture.logger, fetchImpl: c.fetchImpl })
    assert.equal(res.status, 502, c.label)
    assert.equal(res.body, NEUTRAL_502, `${c.label}: reader body unchanged`)
    assert.equal(res.headers.get('Cache-Control'), 'no-store', c.label)
    assert.equal(capture.events.length, 1, `${c.label}: exactly one event`)
    const event = capture.events[0] as Record<string, unknown>
    assert.equal(event.event, 'upstreamFailure', c.label)
    assert.equal(event.route, 'monthDetail', c.label)
    assert.equal(event.responseStatus, 502, c.label)
    for (const [key, value] of Object.entries(c.expected)) {
      assert.equal(event[key], value, `${c.label}: ${key}`)
    }
    assert.equal(typeof event.elapsedMs, 'number', c.label)
    assertNoLeakage(capture.events)
  }
})

test('list routes log a non-array result as unexpectedResultShape', async () => {
  for (const [path, route] of [
    ['/api/challenges', 'catalog'],
    ['/api/news', 'news'],
    ['/api/library/months', 'libraryMonths'],
  ] as const) {
    const capture = createCapture()
    const res = await request(path, {
      getNow: ACTIVE_APRIL,
      logger: capture.logger,
      fetchImpl: respondWith(() => jsonResult({ title: 'SECRET_NOT_AN_ARRAY' })),
    })
    assert.equal(res.status, 502, path)
    assert.equal(res.body, NEUTRAL_502, path)
    assert.equal(capture.events.length, 1, path)
    assert.equal(capture.events[0].route, route)
    assert.equal((capture.events[0] as { failure?: string }).failure, 'unexpectedResultShape', path)
    assertNoLeakage(capture.events)
  }
})

test('list routes summarise projection rejections by reason without document content', async () => {
  const capture = createCapture()
  const res = await request('/api/challenges', {
    getNow: ACTIVE_APRIL,
    logger: capture.logger,
    fetchImpl: respondWith(() =>
      jsonResult([
        { title: 'SECRET_CATALOG_TITLE', slug: 'secret-slug' },
        'SECRET_STRING_ITEM',
      ]),
    ),
  })
  assert.equal(res.status, 200)
  assert.equal(JSON.parse(res.body).challenges.length, 0)
  assert.equal(capture.events.length, 1)
  const event = capture.events[0]
  assert.equal(event.event, 'itemsRejected')
  assert.equal(event.route, 'catalog')
  assert.equal(event.level, 'info')
  assert.equal((event as { inspected: number }).inspected, 2)
  assert.equal((event as { rejected: number }).rejected, 2)
  const reasons = (event as { reasons: Record<string, number> }).reasons
  assert.equal(Object.values(reasons).reduce((a, b) => a + b, 0), 2)
  assertNoLeakage(capture.events)
  assert.equal(JSON.stringify(capture.events).includes('secret-slug'), false)
})

test('single Challenge 404s record whether Sanity returned nothing or projection rejected it', async () => {
  const missing = createCapture()
  const missingRes = await request('/api/challenges/some-slug', {
    getNow: ACTIVE_APRIL,
    logger: missing.logger,
    fetchImpl: respondWith(() => jsonResult(null)),
  })
  assert.equal(missingRes.status, 404)
  assert.deepEqual(missing.events.map(e => [e.event, (e as { stage?: string }).stage, (e as { reason?: string }).reason, (e as { slug?: string }).slug]), [
    ['contentUnavailable', 'upstream', 'noEligibleDocument', 'some-slug'],
  ])

  const rejected = createCapture()
  const rejectedRes = await request('/api/challenges/some-slug', {
    getNow: ACTIVE_APRIL,
    logger: rejected.logger,
    fetchImpl: respondWith(() => jsonResult({ _id: 'x', title: 'SECRET_CHALLENGE_TITLE', editorialEligibility: { adaptationReviewed: false } })),
  })
  assert.equal(rejectedRes.status, 404)
  assert.equal(rejectedRes.body, missingRes.body, 'reader cannot distinguish the two')
  assert.equal(rejected.events.length, 1)
  assert.equal((rejected.events[0] as { stage?: string }).stage, 'projection')
  assert.equal((rejected.events[0] as { reason?: string }).reason, 'unreviewed')
  assert.equal(rejected.events[0].level, 'warn')
  assertNoLeakage([...missing.events, ...rejected.events])
})

test('configuration errors name the missing bindings, never their values', async () => {
  const capture = createCapture()
  const res = await request(
    '/api/months/2098-04',
    { getNow: ACTIVE_APRIL, logger: capture.logger, fetchImpl: respondWith(() => jsonResult(null)) },
    {},
    { ...TEST_ENV, SANITY_DATASET: '' },
  )
  assert.equal(res.status, 500)
  assert.deepEqual(capture.events, [
    {
      source: 'bibleberry-gateway',
      route: 'monthDetail',
      event: 'configurationError',
      level: 'error',
      responseStatus: 500,
      bindings: ['SANITY_DATASET'],
    },
  ])
  assertNoLeakage(capture.events)
})

// ---------------------------------------------------------------------------
// Upstream timeout
// ---------------------------------------------------------------------------

test('upstream timeout default is bounded and finite', () => {
  assert.equal(typeof DEFAULT_UPSTREAM_TIMEOUT_MS, 'number')
  assert.ok(DEFAULT_UPSTREAM_TIMEOUT_MS > 0 && DEFAULT_UPSTREAM_TIMEOUT_MS <= 15_000)
})

test('a stalled upstream response is cut off at the timeout with the same 502 and an aborted signal', async () => {
  const capture = createCapture()
  let observedSignal: AbortSignal | undefined
  const started = Date.now()
  const res = await request('/api/months/2098-04', {
    getNow: ACTIVE_APRIL,
    logger: capture.logger,
    upstreamTimeoutMs: 40,
    // Never resolves on its own; rejects only if the gateway aborts it.
    fetchImpl: (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        observedSignal = init?.signal ?? undefined
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      }),
  })
  const elapsed = Date.now() - started

  assert.equal(res.status, 502)
  assert.equal(res.body, NEUTRAL_502)
  assert.ok(elapsed < 2_000, `timeout must bound the request (took ${elapsed} ms)`)
  assert.ok(observedSignal, 'gateway must pass an AbortSignal upstream')
  assert.equal(observedSignal.aborted, true, 'gateway must abort the upstream request')
  assert.equal(capture.events.length, 1, 'the later abort rejection must not log a second event')
  const event = capture.events[0] as Record<string, unknown>
  assert.equal(event.failure, 'timeout')
  assert.equal(event.timeoutMs, 40)
  assert.equal(event.level, 'warn')
  assertNoLeakage(capture.events)
})

test('the timeout also covers a response body that stalls after headers arrive', async () => {
  const capture = createCapture()
  const res = await request('/api/months/2098-04', {
    getNow: ACTIVE_APRIL,
    logger: capture.logger,
    upstreamTimeoutMs: 40,
    fetchImpl: async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"result":'))
            // Never closes.
          },
        }),
        { status: 200 },
      ),
  })
  assert.equal(res.status, 502)
  assert.equal(res.body, NEUTRAL_502)
  assert.equal((capture.events[0] as { failure?: string }).failure, 'timeout')
})

test('a fast upstream is unaffected by the timeout and clears its timer', async () => {
  const capture = createCapture()
  const res = await request('/api/months/2098-04', {
    getNow: ACTIVE_APRIL,
    logger: capture.logger,
    upstreamTimeoutMs: 5_000,
    fetchImpl: respondWith(() => jsonResult(toDereferencedMonthlyDetailDoc('2098-04'))),
  })
  assert.equal(res.status, 200)
  assert.deepEqual(capture.events, [])
  // If the 5 s timer leaked, node:test would keep the process alive past this file.
})

test('invalid upstreamTimeoutMs values fall back to the default instead of disabling the bound', async () => {
  for (const upstreamTimeoutMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const res = await request('/api/months/2098-04', {
      getNow: ACTIVE_APRIL,
      logger: () => undefined,
      upstreamTimeoutMs,
      fetchImpl: respondWith(() => jsonResult(toDereferencedMonthlyDetailDoc('2098-04'))),
    })
    assert.equal(res.status, 200, String(upstreamTimeoutMs))
  }
})

// ---------------------------------------------------------------------------
// Logger robustness and default sink
// ---------------------------------------------------------------------------

test('a throwing logger never changes the reader response', async () => {
  const res = await request('/api/months/2098-04', {
    getNow: ACTIVE_APRIL,
    logger: () => {
      throw new Error('log sink down')
    },
    fetchImpl: respondWith(() => new Response('UPSTREAM_ERROR_BODY', { status: 401 })),
  })
  assert.equal(res.status, 502)
  assert.equal(res.body, NEUTRAL_502)
})

test('default console logger writes one parseable JSON line at the event level', () => {
  const original = { info: console.info, warn: console.warn, error: console.error }
  const lines: Array<[string, string]> = []
  console.info = (line: string) => lines.push(['info', line])
  console.warn = (line: string) => lines.push(['warn', line])
  console.error = (line: string) => lines.push(['error', line])
  try {
    const diagnostics = createRouteDiagnostics('monthDetail', consoleGatewayLogger)
    diagnostics.contentUnavailable({
      event: 'contentUnavailable',
      level: 'info',
      responseStatus: 404,
      stage: 'releaseGate',
      reason: 'notYetReleased',
      yearMonth: '2098-04',
    })
    diagnostics.upstreamFailure({
      event: 'upstreamFailure',
      level: 'error',
      responseStatus: 502,
      failure: 'httpStatus',
      upstreamStatus: 401,
      upstreamStatusHint: 'authorization',
    })
  } finally {
    Object.assign(console, original)
  }
  assert.equal(lines.length, 2)
  assert.equal(lines[0][0], 'info')
  assert.equal(lines[1][0], 'error')
  assert.equal(JSON.parse(lines[0][1]).reason, 'notYetReleased')
  assert.equal(JSON.parse(lines[1][1]).upstreamStatusHint, 'authorization')
})

test('classifyUpstreamStatus maps status codes to operator hints', () => {
  assert.equal(classifyUpstreamStatus(401), 'authorization')
  assert.equal(classifyUpstreamStatus(403), 'authorization')
  assert.equal(classifyUpstreamStatus(404), 'notFound')
  assert.equal(classifyUpstreamStatus(429), 'rateLimited')
  assert.equal(classifyUpstreamStatus(400), 'clientError')
  assert.equal(classifyUpstreamStatus(500), 'serverError')
  assert.equal(classifyUpstreamStatus(599), 'serverError')
  assert.equal(classifyUpstreamStatus(302), 'unexpected')
})
