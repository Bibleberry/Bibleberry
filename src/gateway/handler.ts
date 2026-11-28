import { matchesLibraryMonth, MAX_LIBRARY_QUERY_LENGTH } from '../lib/libraryMonthSearch.ts'
import {
  CATALOG_GROQ_QUERY,
  CHALLENGE_BY_SLUG_GROQ_QUERY,
  LIBRARY_MONTHS_GROQ_QUERY,
  MONTHLY_DETAIL_BY_ID_GROQ_QUERY,
  MONTHLY_PREVIEW_BY_ID_GROQ_QUERY,
  NEWS_ARTICLES_GROQ_QUERY,
  buildSanityQueryUrl,
} from './query.ts'
import {
  isPlainObject,
  validateAndProjectCatalogSummary,
  validateAndProjectChallenge,
} from './projection.ts'
import {
  evaluateMonthProgress,
  validateAndProjectLibraryMonthSummary,
  validateAndProjectMonthDetail,
  validateAndProjectMonthPreview,
  validateAndProjectNewsArticle,
} from './monthlyProjection.ts'
import {
  computeAdvancePreviewStartDate,
  parseYearMonth,
  resolveAuthorizedReaderDate,
} from './localRelease.ts'
import {
  RejectionTally,
  classifyUpstreamStatus,
  createRouteDiagnostics,
} from './diagnostics.ts'
import type {
  ContentUnavailableReason,
  ContentUnavailableStage,
  GatewayLogLevel,
  GatewayRouteId,
  RouteDiagnostics,
  UpstreamFailureKind,
} from './diagnostics.ts'
import type {
  GatewayCatalogResponse,
  GatewayCatalogSummary,
  GatewayChallengeResponse,
  GatewayEnv,
  GatewayErrorKind,
  GatewayErrorResponse,
  GatewayFetch,
  GatewayLibraryMonthSummary,
  GatewayLibraryMonthsResponse,
  GatewayMonthDetailResponse,
  GatewayMonthPreviewResponse,
  GatewayMonthProgressResponse,
  GatewayNewsArticle,
  GatewayNewsCategory,
  GatewayNewsResponse,
  GatewayOptions,
  GatewayServerContext,
} from './types.ts'

const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000']
const SLUG_REGEX = /^[a-zA-Z0-9_-]+$/
const PROGRESS_ROUTE_REGEX = /^\/api\/months\/([^/]+)\/progress$/
const MAX_PROGRESS_BODY_BYTES = 8192
const MAX_PROGRESS_CHALLENGE_IDS = 500
const MAX_CHALLENGE_ID_LENGTH = 160
const DEFAULT_LIBRARY_PAGE_SIZE = 12
const MAX_LIBRARY_PAGE_SIZE = 24
const MAX_LIBRARY_SCAN_BATCH_SIZE = 25
const MAX_LIBRARY_SCAN_ROUNDS = 4
const SANITY_PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/
const SANITY_DATASET_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/
const DISALLOWED_DATASETS = new Set(['berrymark-development'])
/** Bound for one complete upstream Sanity exchange (response headers and JSON body). */
export const DEFAULT_UPSTREAM_TIMEOUT_MS = 8000
const ALLOWED_NEWS_CATEGORIES = new Set<GatewayNewsCategory>([
  'monthlyPreview',
  'ministryUpdate',
  'announcement',
])

function parseAllowedOrigins(allowedOriginsConfig?: string): string[] {
  if (!allowedOriginsConfig || allowedOriginsConfig.trim().length === 0) {
    return DEFAULT_ALLOWED_ORIGINS
  }
  return allowedOriginsConfig
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

function resolveCorsHeaders(request: Request, env: GatewayEnv): Headers {
  const headers = new Headers()
  headers.set('Vary', 'Origin, X-Bibleberry-Timezone')
  const origin = request.headers.get('Origin')
  if (!origin) return headers

  const allowed = parseAllowedOrigins(env.ALLOWED_ORIGINS)
  if (allowed.includes('*') || allowed.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin)
  }

  return headers
}

type GatewayResponseBody =
  | GatewayCatalogResponse
  | GatewayChallengeResponse
  | GatewayMonthPreviewResponse
  | GatewayMonthDetailResponse
  | GatewayMonthProgressResponse
  | GatewayNewsResponse
  | GatewayLibraryMonthsResponse
  | GatewayErrorResponse

function jsonResponse(
  body: GatewayResponseBody,
  status: number,
  corsHeaders: Headers,
  additionalHeaders: Record<string, string> = {},
): Response {
  const headers = new Headers(corsHeaders)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  headers.set('Cache-Control', 'no-store')

  for (const [key, value] of Object.entries(additionalHeaders)) {
    headers.set(key, value)
  }

  return new Response(JSON.stringify(body), {
    status,
    headers,
  })
}

function errorResponse(
  kind: GatewayErrorKind,
  message: string,
  status: number,
  corsHeaders: Headers,
  additionalHeaders: Record<string, string> = {},
): Response {
  return jsonResponse(
    {
      ok: false,
      error: { kind, message },
    },
    status,
    corsHeaders,
    additionalHeaders,
  )
}

function resolveRouteId(pathname: string | null): GatewayRouteId {
  if (pathname === null) return 'unknown'
  if (pathname === '/api/challenges') return 'catalog'
  if (/^\/api\/challenges\/[^/]+$/.test(pathname)) return 'challenge'
  if (/^\/api\/months\/[^/]+\/preview$/.test(pathname)) return 'monthPreview'
  if (PROGRESS_ROUTE_REGEX.test(pathname)) return 'monthProgress'
  if (/^\/api\/months\/[^/]+$/.test(pathname)) return 'monthDetail'
  if (pathname === '/api/library/months') return 'libraryMonths'
  if (pathname === '/api/news') return 'news'
  return 'unknown'
}

function safeNormalizePathname(requestUrl: string): string | null {
  try {
    const parsed = new URL(requestUrl)
    return parsed.pathname.replace(/\/+$/, '') || '/'
  } catch {
    return null
  }
}

/**
 * Core Cloudflare Worker request handler for the Bibleberry Release Gateway.
 */
export async function handleGatewayRequest(
  request: Request,
  env: GatewayEnv,
  options: GatewayOptions = {},
): Promise<Response> {
  const corsHeaders = resolveCorsHeaders(request, env)
  const rawPathname = safeNormalizePathname(request.url)
  const isProgressRoute = rawPathname !== null && PROGRESS_ROUTE_REGEX.test(rawPathname)
  const expectedMethod = isProgressRoute ? 'POST' : 'GET'
  const allowedMethods = isProgressRoute ? 'POST, OPTIONS' : 'GET, OPTIONS'

  // 1. Handle CORS preflight
  if (request.method === 'OPTIONS') {
    const preflightHeaders = new Headers(corsHeaders)
    preflightHeaders.set('Access-Control-Allow-Methods', allowedMethods)
    preflightHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Accept, X-Bibleberry-Timezone')
    preflightHeaders.set('Access-Control-Max-Age', '86400')
    preflightHeaders.set('Cache-Control', 'no-store')
    return new Response(null, { status: 204, headers: preflightHeaders })
  }

  // 2. Enforce allowed HTTP methods per route
  if (request.method !== expectedMethod) {
    return errorResponse('methodNotAllowed', 'Method not allowed', 405, corsHeaders, {
      Allow: allowedMethods,
    })
  }

  // 3. Validate environment configuration
  if (!env.SANITY_PROJECT_ID || !env.SANITY_DATASET || !env.SANITY_READ_TOKEN) {
    const missing = (['SANITY_PROJECT_ID', 'SANITY_DATASET', 'SANITY_READ_TOKEN'] as const).filter(
      name => !env[name],
    )
    createRouteDiagnostics(resolveRouteId(rawPathname), options.logger).configurationError({
      event: 'configurationError',
      level: 'error',
      responseStatus: 500,
      bindings: missing,
    })
    return errorResponse(
      'serverConfigurationError',
      'Gateway configuration error',
      500,
      corsHeaders,
    )
  }

  // 4. Parse request route
  let url: URL
  try {
    url = new URL(request.url)
  } catch {
    return errorResponse('badRequest', 'Invalid request URL', 400, corsHeaders)
  }

  const pathname = url.pathname.replace(/\/+$/, '') || '/'

  // Route: GET /api/challenges
  if (pathname === '/api/challenges') {
    return handleCatalogRequest(request, env, options, corsHeaders)
  }

  // Route: GET /api/challenges/:slug
  const slugMatch = pathname.match(/^\/api\/challenges\/([^/]+)$/)
  if (slugMatch) {
    const slug = slugMatch[1]
    return handleSingleChallengeRequest(request, slug, env, options, corsHeaders)
  }

  // Route: GET /api/months/:yearMonth/preview
  const monthPreviewMatch = pathname.match(/^\/api\/months\/([^/]+)\/preview$/)
  if (monthPreviewMatch) {
    return handleMonthPreviewRequest(request, monthPreviewMatch[1], env, options, corsHeaders)
  }

  // Route: POST /api/months/:yearMonth/progress
  const monthProgressMatch = pathname.match(PROGRESS_ROUTE_REGEX)
  if (monthProgressMatch) {
    return handleMonthProgressRequest(request, monthProgressMatch[1], env, options, corsHeaders)
  }

  // Route: GET /api/months/:yearMonth
  const monthDetailMatch = pathname.match(/^\/api\/months\/([^/]+)$/)
  if (monthDetailMatch) {
    return handleMonthDetailRequest(request, monthDetailMatch[1], env, options, corsHeaders)
  }

  // Route: GET /api/library/months
  if (pathname === '/api/library/months') {
    return handleLibraryMonthsRequest(request, url, env, options, corsHeaders)
  }

  // Route: GET /api/news
  if (pathname === '/api/news') {
    return handleNewsRequest(request, url, env, options, corsHeaders)
  }

  // Unrecognized route
  return errorResponse('notFound', 'Not found', 404, corsHeaders)
}

function upstreamErrorResponse(corsHeaders: Headers): Response {
  return errorResponse('upstreamError', 'Upstream content service unavailable', 502, corsHeaders)
}

function resolveUpstreamTimeoutMs(configured: number | undefined): number {
  return typeof configured === 'number' && Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_UPSTREAM_TIMEOUT_MS
}

const UPSTREAM_FAILURE_LEVELS: Record<UpstreamFailureKind, GatewayLogLevel> = {
  network: 'warn',
  timeout: 'warn',
  httpStatus: 'error',
  invalidJson: 'error',
  missingResult: 'error',
  unexpectedResultShape: 'error',
  libraryScanIncomplete: 'error',
}

/**
 * Logs a gateway-detected upstream failure and returns the unchanged public 502.
 */
function failUpstream(
  diagnostics: RouteDiagnostics,
  corsHeaders: Headers,
  failure: UpstreamFailureKind,
  details: { upstreamStatus?: number; elapsedMs?: number; timeoutMs?: number } = {},
): Response {
  let level = UPSTREAM_FAILURE_LEVELS[failure]
  const statusFields: { upstreamStatus?: number; upstreamStatusHint?: ReturnType<typeof classifyUpstreamStatus> } = {}
  if (details.upstreamStatus !== undefined) {
    const hint = classifyUpstreamStatus(details.upstreamStatus)
    statusFields.upstreamStatus = details.upstreamStatus
    statusFields.upstreamStatusHint = hint
    // Transient upstream conditions are warnings; credential, routing and request errors are not.
    if (hint === 'rateLimited' || hint === 'serverError') level = 'warn'
  }
  diagnostics.upstreamFailure({
    event: 'upstreamFailure',
    level,
    responseStatus: 502,
    failure,
    ...statusFields,
    ...(details.elapsedMs !== undefined ? { elapsedMs: details.elapsedMs } : {}),
    ...(details.timeoutMs !== undefined ? { timeoutMs: details.timeoutMs } : {}),
  })
  return upstreamErrorResponse(corsHeaders)
}

type UpstreamExchangeOutcome =
  | { readonly kind: 'ok'; readonly result: unknown }
  | { readonly kind: 'network' }
  | { readonly kind: 'timeout' }
  | { readonly kind: 'httpStatus'; readonly status: number }
  | { readonly kind: 'invalidJson' }
  | { readonly kind: 'missingResult' }

async function performSanityExchange(
  upstreamUrl: URL,
  env: GatewayEnv,
  fetchImpl: GatewayFetch,
  signal: AbortSignal,
): Promise<UpstreamExchangeOutcome> {
  let upstreamResponse: Response
  try {
    upstreamResponse = await fetchImpl(upstreamUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${env.SANITY_READ_TOKEN}`,
      },
      cache: 'no-store',
      signal,
    })
  } catch {
    return { kind: 'network' }
  }

  if (!upstreamResponse.ok) {
    // The error body is never read or logged; release it.
    upstreamResponse.body?.cancel().catch(() => undefined)
    return { kind: 'httpStatus', status: upstreamResponse.status }
  }

  let payload: unknown
  try {
    payload = await upstreamResponse.json()
  } catch {
    return { kind: 'invalidJson' }
  }

  if (!payload || typeof payload !== 'object' || !('result' in payload)) {
    return { kind: 'missingResult' }
  }

  return { kind: 'ok', result: (payload as { result?: unknown }).result }
}

async function fetchSanityQueryResult(
  upstreamUrl: URL,
  env: GatewayEnv,
  options: GatewayOptions,
  corsHeaders: Headers,
  diagnostics: RouteDiagnostics,
): Promise<{ ok: true; result: unknown } | { ok: false; response: Response }> {
  const fetchImpl: GatewayFetch = options.fetchImpl ?? fetch
  const timeoutMs = resolveUpstreamTimeoutMs(options.upstreamTimeoutMs)
  const controller = new AbortController()
  const startedAt = Date.now()
  let timer: ReturnType<typeof setTimeout> | undefined
  // The deadline covers the whole exchange, including a body that stalls after headers arrive.
  const deadline = new Promise<UpstreamExchangeOutcome>(resolve => {
    timer = setTimeout(() => {
      resolve({ kind: 'timeout' })
      controller.abort()
    }, timeoutMs)
  })

  let outcome: UpstreamExchangeOutcome
  try {
    outcome = await Promise.race([
      performSanityExchange(upstreamUrl, env, fetchImpl, controller.signal),
      deadline,
    ])
  } finally {
    clearTimeout(timer)
  }

  if (outcome.kind === 'ok') {
    return { ok: true, result: outcome.result }
  }

  const elapsedMs = Date.now() - startedAt
  return {
    ok: false,
    response: failUpstream(diagnostics, corsHeaders, outcome.kind, {
      elapsedMs,
      ...(outcome.kind === 'httpStatus' ? { upstreamStatus: outcome.status } : {}),
      ...(outcome.kind === 'timeout' ? { timeoutMs } : {}),
    }),
  }
}

function buildRequestReleaseContext(
  request: Request,
  options: GatewayOptions,
): { nowUtc: string; nowTime: number; serverContext: GatewayServerContext } {
  const now = options.getNow ? options.getNow() : new Date()
  const resolution = resolveAuthorizedReaderDate(now, request.headers.get('X-Bibleberry-Timezone'))
  return {
    nowUtc: now.toISOString(),
    nowTime: now.getTime(),
    serverContext: {
      authorizedLocalDate: resolution.authorizedLocalDate,
      effectiveTimeZone: resolution.effectiveTimeZone,
    },
  }
}

async function handleCatalogRequest(
  request: Request,
  env: GatewayEnv,
  options: GatewayOptions,
  corsHeaders: Headers,
): Promise<Response> {
  const diagnostics = createRouteDiagnostics('catalog', options.logger)
  const { nowUtc, nowTime, serverContext } = buildRequestReleaseContext(request, options)

  const upstreamUrl = buildSanityQueryUrl(
    env.SANITY_PROJECT_ID,
    env.SANITY_DATASET,
    env.SANITY_API_VERSION,
    CATALOG_GROQ_QUERY,
    {
      $nowUtc: nowUtc,
      $authorizedLocalDate: serverContext.authorizedLocalDate,
    },
  )

  const upstream = await fetchSanityQueryResult(upstreamUrl, env, options, corsHeaders, diagnostics)
  if (!upstream.ok) {
    return upstream.response
  }

  if (!Array.isArray(upstream.result)) {
    return failUpstream(diagnostics, corsHeaders, 'unexpectedResultShape')
  }

  const validatedSummaries: GatewayCatalogSummary[] = []
  const rejections = new RejectionTally()
  for (const item of upstream.result) {
    const projected = validateAndProjectCatalogSummary(
      item,
      nowTime,
      serverContext.authorizedLocalDate,
    )
    rejections.record(projected)
    if (projected.ok) {
      validatedSummaries.push(projected.document)
    }
  }
  rejections.report(diagnostics, 200)

  return jsonResponse(
    {
      ok: true,
      serverContext,
      challenges: validatedSummaries,
    },
    200,
    corsHeaders,
  )
}

async function handleSingleChallengeRequest(
  request: Request,
  slug: string,
  env: GatewayEnv,
  options: GatewayOptions,
  corsHeaders: Headers,
): Promise<Response> {
  if (!SLUG_REGEX.test(slug) || slug.length > 128) {
    return errorResponse('notFound', 'Challenge not found', 404, corsHeaders)
  }

  const diagnostics = createRouteDiagnostics('challenge', options.logger)
  const { nowUtc, nowTime, serverContext } = buildRequestReleaseContext(request, options)

  const upstreamUrl = buildSanityQueryUrl(
    env.SANITY_PROJECT_ID,
    env.SANITY_DATASET,
    env.SANITY_API_VERSION,
    CHALLENGE_BY_SLUG_GROQ_QUERY,
    {
      $nowUtc: nowUtc,
      $authorizedLocalDate: serverContext.authorizedLocalDate,
      $slug: slug,
    },
  )

  const upstream = await fetchSanityQueryResult(upstreamUrl, env, options, corsHeaders, diagnostics)
  if (!upstream.ok) {
    return upstream.response
  }

  const rawDoc = upstream.result
  if (!rawDoc || typeof rawDoc !== 'object') {
    // Challenge does not exist, or was filtered out by GROQ (unreviewed or future release)
    diagnostics.contentUnavailable({
      event: 'contentUnavailable',
      level: 'info',
      responseStatus: 404,
      stage: 'upstream',
      reason: 'noEligibleDocument',
      requestedSlug: slug,
    })
    return errorResponse('notFound', 'Challenge not found', 404, corsHeaders)
  }

  const projected = validateAndProjectChallenge(
    rawDoc,
    nowTime,
    serverContext.authorizedLocalDate,
  )
  if (!projected.ok) {
    // Server-side validation failed closed (e.g. unapproved blocks, embargoed, draft, withdrawn)
    diagnostics.contentUnavailable({
      event: 'contentUnavailable',
      level: projected.reason === 'embargoed' ? 'info' : 'warn',
      responseStatus: 404,
      stage: 'projection',
      reason: projected.reason,
      requestedSlug: slug,
    })
    return errorResponse('notFound', 'Challenge not found', 404, corsHeaders)
  }

  return jsonResponse(
    {
      ok: true,
      serverContext,
      challenge: projected.document,
    },
    200,
    corsHeaders,
  )
}

function monthNotFoundResponse(corsHeaders: Headers): Response {
  return errorResponse('notFound', 'Month not found', 404, corsHeaders)
}

/**
 * Records why a validated month answered 404, then returns the same neutral 404 as every
 * other month failure. Not-yet-released and embargoed outcomes are expected (`info`); a
 * month that reached projection and was rejected for any other reason is an editorial or
 * data problem an operator should see (`warn`).
 */
function monthUnavailableResponse(
  diagnostics: RouteDiagnostics,
  corsHeaders: Headers,
  yearMonth: string,
  stage: ContentUnavailableStage,
  reason: ContentUnavailableReason,
): Response {
  const expected = reason === 'notYetReleased' || reason === 'embargoed' || reason === 'noEligibleDocument'
  diagnostics.contentUnavailable({
    event: 'contentUnavailable',
    level: expected ? 'info' : 'warn',
    responseStatus: 404,
    stage,
    reason,
    yearMonth,
  })
  return monthNotFoundResponse(corsHeaders)
}

async function fetchMonthDocument(
  yearMonth: string,
  query: string,
  env: GatewayEnv,
  options: GatewayOptions,
  corsHeaders: Headers,
  diagnostics: RouteDiagnostics,
): Promise<{ ok: true; rawDoc: unknown } | { ok: false; response: Response }> {
  const upstreamUrl = buildSanityQueryUrl(
    env.SANITY_PROJECT_ID,
    env.SANITY_DATASET,
    env.SANITY_API_VERSION,
    query,
    {
      $monthDocId: `month-${yearMonth}`,
      $yearMonth: yearMonth,
    },
  )

  const upstream = await fetchSanityQueryResult(upstreamUrl, env, options, corsHeaders, diagnostics)
  if (!upstream.ok) {
    return upstream
  }

  if (!isPlainObject(upstream.result)) {
    return {
      ok: false,
      response: monthUnavailableResponse(diagnostics, corsHeaders, yearMonth, 'upstream', 'noEligibleDocument'),
    }
  }

  return { ok: true, rawDoc: upstream.result }
}

async function handleMonthPreviewRequest(
  request: Request,
  rawYearMonth: string,
  env: GatewayEnv,
  options: GatewayOptions,
  corsHeaders: Headers,
): Promise<Response> {
  const parsedYM = parseYearMonth(rawYearMonth)
  if (!parsedYM) {
    return monthNotFoundResponse(corsHeaders)
  }

  const diagnostics = createRouteDiagnostics('monthPreview', options.logger)
  const { serverContext } = buildRequestReleaseContext(request, options)
  const previewStartDate = computeAdvancePreviewStartDate(parsedYM.year, parsedYM.month)
  if (serverContext.authorizedLocalDate < previewStartDate) {
    return monthUnavailableResponse(diagnostics, corsHeaders, rawYearMonth, 'releaseGate', 'notYetReleased')
  }

  const fetched = await fetchMonthDocument(
    rawYearMonth,
    MONTHLY_PREVIEW_BY_ID_GROQ_QUERY,
    env,
    options,
    corsHeaders,
    diagnostics,
  )
  if (!fetched.ok) {
    return fetched.response
  }

  const projected = validateAndProjectMonthPreview(fetched.rawDoc, rawYearMonth, serverContext)
  if (!projected.ok) {
    return monthUnavailableResponse(diagnostics, corsHeaders, rawYearMonth, 'projection', projected.reason)
  }

  return jsonResponse(projected.document, 200, corsHeaders)
}

async function handleMonthDetailRequest(
  request: Request,
  rawYearMonth: string,
  env: GatewayEnv,
  options: GatewayOptions,
  corsHeaders: Headers,
): Promise<Response> {
  const parsedYM = parseYearMonth(rawYearMonth)
  if (!parsedYM) {
    return monthNotFoundResponse(corsHeaders)
  }

  const diagnostics = createRouteDiagnostics('monthDetail', options.logger)
  const { serverContext } = buildRequestReleaseContext(request, options)
  if (serverContext.authorizedLocalDate < `${rawYearMonth}-01`) {
    return monthUnavailableResponse(diagnostics, corsHeaders, rawYearMonth, 'releaseGate', 'notYetReleased')
  }

  const fetched = await fetchMonthDocument(
    rawYearMonth,
    MONTHLY_DETAIL_BY_ID_GROQ_QUERY,
    env,
    options,
    corsHeaders,
    diagnostics,
  )
  if (!fetched.ok) {
    return fetched.response
  }

  const projected = validateAndProjectMonthDetail(fetched.rawDoc, rawYearMonth, serverContext, {
    sanityProjectId: env.SANITY_PROJECT_ID,
    sanityDataset: env.SANITY_DATASET,
  })
  if (!projected.ok) {
    return monthUnavailableResponse(diagnostics, corsHeaders, rawYearMonth, 'projection', projected.reason)
  }

  return jsonResponse(projected.document, 200, corsHeaders)
}

function hasAsciiControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) {
      return true
    }
  }
  return false
}

async function parseProgressRequestBody(
  request: Request,
  corsHeaders: Headers,
): Promise<{ ok: true; completedChallengeIds: string[] } | { ok: false; response: Response }> {
  const rawContentType = request.headers.get('Content-Type')
  const mediaType = rawContentType ? rawContentType.split(';')[0].trim().toLowerCase() : ''
  if (mediaType !== 'application/json') {
    return {
      ok: false,
      response: errorResponse(
        'badRequest',
        'Content-Type must be application/json',
        400,
        corsHeaders,
      ),
    }
  }

  const contentLengthHeader = request.headers.get('Content-Length')
  if (contentLengthHeader !== null) {
    const trimmedLength = contentLengthHeader.trim()
    if (!/^\d+$/.test(trimmedLength) || Number(trimmedLength) > MAX_PROGRESS_BODY_BYTES) {
      return {
        ok: false,
        response: errorResponse(
          'badRequest',
          'Progress request body exceeds 8 KiB limit',
          400,
          corsHeaders,
        ),
      }
    }
  }

  if (!request.body) {
    return {
      ok: false,
      response: errorResponse('badRequest', 'Invalid progress request body', 400, corsHeaders),
    }
  }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        totalBytes += value.byteLength
        if (totalBytes > MAX_PROGRESS_BODY_BYTES) {
          await reader.cancel().catch(() => undefined)
          return {
            ok: false,
            response: errorResponse(
              'badRequest',
              'Progress request body exceeds 8 KiB limit',
              400,
              corsHeaders,
            ),
          }
        }
        chunks.push(value)
      }
    }
  } catch {
    return {
      ok: false,
      response: errorResponse('badRequest', 'Invalid progress request body', 400, corsHeaders),
    }
  }

  if (totalBytes === 0) {
    return {
      ok: false,
      response: errorResponse('badRequest', 'Invalid progress request body', 400, corsHeaders),
    }
  }

  const combined = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.byteLength
  }

  let bodyText: string
  try {
    bodyText = new TextDecoder('utf-8', { fatal: true }).decode(combined)
  } catch {
    return {
      ok: false,
      response: errorResponse('badRequest', 'Invalid UTF-8 request body', 400, corsHeaders),
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(bodyText)
  } catch {
    return {
      ok: false,
      response: errorResponse('badRequest', 'Invalid JSON request body', 400, corsHeaders),
    }
  }

  if (!isPlainObject(parsed)) {
    return {
      ok: false,
      response: errorResponse('badRequest', 'Invalid progress payload', 400, corsHeaders),
    }
  }

  const keys = Object.keys(parsed)
  if (keys.length !== 1 || keys[0] !== 'completedChallengeIds') {
    return {
      ok: false,
      response: errorResponse('badRequest', 'Invalid progress payload', 400, corsHeaders),
    }
  }

  const rawIds = parsed.completedChallengeIds
  if (!Array.isArray(rawIds) || rawIds.length > MAX_PROGRESS_CHALLENGE_IDS) {
    return {
      ok: false,
      response: errorResponse('badRequest', 'Invalid completedChallengeIds list', 400, corsHeaders),
    }
  }

  const completedChallengeIds: string[] = []
  for (const entry of rawIds) {
    if (typeof entry !== 'string') {
      return {
        ok: false,
        response: errorResponse('badRequest', 'Invalid completedChallengeIds entry', 400, corsHeaders),
      }
    }
    const trimmed = entry.trim()
    if (
      trimmed.length === 0 ||
      trimmed.length > MAX_CHALLENGE_ID_LENGTH ||
      hasAsciiControlChars(trimmed)
    ) {
      return {
        ok: false,
        response: errorResponse('badRequest', 'Invalid completedChallengeIds entry', 400, corsHeaders),
      }
    }
    completedChallengeIds.push(trimmed)
  }

  return { ok: true, completedChallengeIds }
}

async function handleMonthProgressRequest(
  request: Request,
  rawYearMonth: string,
  env: GatewayEnv,
  options: GatewayOptions,
  corsHeaders: Headers,
): Promise<Response> {
  const parsedYM = parseYearMonth(rawYearMonth)
  if (!parsedYM) {
    return monthNotFoundResponse(corsHeaders)
  }

  const parsedBody = await parseProgressRequestBody(request, corsHeaders)
  if (!parsedBody.ok) {
    return parsedBody.response
  }

  const diagnostics = createRouteDiagnostics('monthProgress', options.logger)
  const { serverContext } = buildRequestReleaseContext(request, options)
  if (serverContext.authorizedLocalDate < `${rawYearMonth}-01`) {
    return monthUnavailableResponse(diagnostics, corsHeaders, rawYearMonth, 'releaseGate', 'notYetReleased')
  }

  const fetched = await fetchMonthDocument(
    rawYearMonth,
    MONTHLY_DETAIL_BY_ID_GROQ_QUERY,
    env,
    options,
    corsHeaders,
    diagnostics,
  )
  if (!fetched.ok) {
    return fetched.response
  }

  const evaluated = evaluateMonthProgress(
    fetched.rawDoc,
    rawYearMonth,
    serverContext,
    parsedBody.completedChallengeIds,
    {
      sanityProjectId: env.SANITY_PROJECT_ID,
      sanityDataset: env.SANITY_DATASET,
    },
  )
  if (!evaluated.ok) {
    return monthUnavailableResponse(diagnostics, corsHeaders, rawYearMonth, 'projection', evaluated.reason)
  }

  return jsonResponse(evaluated.document, 200, corsHeaders)
}

async function handleNewsRequest(
  request: Request,
  url: URL,
  env: GatewayEnv,
  options: GatewayOptions,
  corsHeaders: Headers,
): Promise<Response> {
  const categoryValues = url.searchParams.getAll('category')
  let categoryFilter: GatewayNewsCategory | undefined
  if (categoryValues.length > 1) {
    return errorResponse('badRequest', 'Invalid news category filter', 400, corsHeaders)
  }
  if (categoryValues.length === 1) {
    const candidate = categoryValues[0]
    if (!ALLOWED_NEWS_CATEGORIES.has(candidate as GatewayNewsCategory)) {
      return errorResponse('badRequest', 'Invalid news category filter', 400, corsHeaders)
    }
    categoryFilter = candidate as GatewayNewsCategory
  }

  const diagnostics = createRouteDiagnostics('news', options.logger)
  const { serverContext } = buildRequestReleaseContext(request, options)

  const upstreamUrl = buildSanityQueryUrl(
    env.SANITY_PROJECT_ID,
    env.SANITY_DATASET,
    env.SANITY_API_VERSION,
    NEWS_ARTICLES_GROQ_QUERY,
    {
      $authorizedLocalDate: serverContext.authorizedLocalDate,
      $category: categoryFilter ?? '',
    },
  )

  const upstream = await fetchSanityQueryResult(upstreamUrl, env, options, corsHeaders, diagnostics)
  if (!upstream.ok) {
    return upstream.response
  }

  if (!Array.isArray(upstream.result)) {
    return failUpstream(diagnostics, corsHeaders, 'unexpectedResultShape')
  }

  const articles: GatewayNewsArticle[] = []
  const rejections = new RejectionTally()
  for (const item of upstream.result) {
    const projected = validateAndProjectNewsArticle(
      item,
      serverContext.authorizedLocalDate,
      categoryFilter,
    )
    rejections.record(projected)
    if (projected.ok) {
      articles.push(projected.document)
    }
  }
  rejections.report(diagnostics, 200)

  articles.sort((a, b) => {
    if (a.publishedOn !== b.publishedOn) return a.publishedOn < b.publishedOn ? 1 : -1
    if (a.documentId === b.documentId) return 0
    return a.documentId < b.documentId ? -1 : 1
  })

  return jsonResponse(
    {
      ok: true,
      serverContext,
      articles,
    },
    200,
    corsHeaders,
  )
}

function validateSanityTargetEnv(env: GatewayEnv): boolean {
  const projectId = env.SANITY_PROJECT_ID.trim()
  const dataset = env.SANITY_DATASET.trim()
  const token = env.SANITY_READ_TOKEN.trim()
  if (!projectId || !dataset || !token) {
    return false
  }
  if (!SANITY_PROJECT_ID_PATTERN.test(projectId)) {
    return false
  }
  if (!SANITY_DATASET_PATTERN.test(dataset) || DISALLOWED_DATASETS.has(dataset)) {
    return false
  }
  return true
}

function parseLibraryMonthsQueryParams(
  url: URL,
  corsHeaders: Headers,
): { ok: true; limit: number; cursor?: string; query: string } | { ok: false; response: Response } {
  for (const key of url.searchParams.keys()) {
    if (key !== 'limit' && key !== 'cursor' && key !== 'q') {
      return {
        ok: false,
        response: errorResponse('badRequest', 'Unsupported query parameter', 400, corsHeaders),
      }
    }
  }

  const limitValues = url.searchParams.getAll('limit')
  let limit = DEFAULT_LIBRARY_PAGE_SIZE
  if (limitValues.length > 1) {
    return {
      ok: false,
      response: errorResponse('badRequest', 'Duplicate limit query parameter', 400, corsHeaders),
    }
  }
  if (limitValues.length === 1) {
    const rawLimit = limitValues[0]
    if (!/^\d+$/.test(rawLimit)) {
      return {
        ok: false,
        response: errorResponse('badRequest', 'Invalid limit query parameter', 400, corsHeaders),
      }
    }
    const parsedLimit = Number(rawLimit)
    if (!Number.isSafeInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > MAX_LIBRARY_PAGE_SIZE) {
      return {
        ok: false,
        response: errorResponse('badRequest', 'Invalid limit query parameter', 400, corsHeaders),
      }
    }
    limit = parsedLimit
  }

  const cursorValues = url.searchParams.getAll('cursor')
  let cursor: string | undefined
  if (cursorValues.length > 1) {
    return {
      ok: false,
      response: errorResponse('badRequest', 'Duplicate cursor query parameter', 400, corsHeaders),
    }
  }
  if (cursorValues.length === 1) {
    const rawCursor = cursorValues[0]
    if (!parseYearMonth(rawCursor)) {
      return {
        ok: false,
        response: errorResponse('badRequest', 'Invalid cursor query parameter', 400, corsHeaders),
      }
    }
    cursor = rawCursor
  }

  const terms = url.searchParams.getAll('q')
  if (terms.length > 1 || (terms[0]?.length ?? 0) > MAX_LIBRARY_QUERY_LENGTH) {
    return { ok: false, response: errorResponse('badRequest', 'Invalid Library search', 400, corsHeaders) }
  }
  return { ok: true, limit, cursor, query: terms[0]?.trim() ?? '' }
}

// A bounded scan can end on a rejected document. Its private publication key
// must not become the public cursor. Step through the inspected calendar range
// using a boundary derived from the request, even when the catalogue has gaps.
function calendarMonthsBefore(upperBound: string, months: number): string {
  const ordinal = Math.max(0, Number(upperBound.slice(0, 4)) * 12 + Number(upperBound.slice(5)) - 1 - months)
  const year = String(Math.floor(ordinal / 12)).padStart(4, '0')
  const month = String(ordinal % 12 + 1).padStart(2, '0')
  return `${year}-${month}`
}

async function handleLibraryMonthsRequest(
  request: Request,
  url: URL,
  env: GatewayEnv,
  options: GatewayOptions,
  corsHeaders: Headers,
): Promise<Response> {
  const diagnostics = createRouteDiagnostics('libraryMonths', options.logger)
  if (!validateSanityTargetEnv(env)) {
    diagnostics.configurationError({
      event: 'configurationError',
      level: 'error',
      responseStatus: 500,
      bindings: ['SANITY_PROJECT_ID', 'SANITY_DATASET', 'SANITY_READ_TOKEN'],
    })
    return errorResponse(
      'serverConfigurationError',
      'Gateway configuration error',
      500,
      corsHeaders,
    )
  }

  const queryParams = parseLibraryMonthsQueryParams(url, corsHeaders)
  if (!queryParams.ok) {
    return queryParams.response
  }

  const { limit, cursor } = queryParams
  const { serverContext } = buildRequestReleaseContext(request, options)
  const currentYearMonth = serverContext.authorizedLocalDate.slice(0, 7)
  const upperBoundYearMonth =
    cursor && cursor < currentYearMonth ? cursor : currentYearMonth
  const batchSize = Math.min(Math.max(limit * 2 + 1, 5), MAX_LIBRARY_SCAN_BATCH_SIZE)

  const byYearMonth = new Map<string, GatewayLibraryMonthSummary>()
  const projectionOptions = {
    sanityProjectId: env.SANITY_PROJECT_ID.trim(),
    sanityDataset: env.SANITY_DATASET.trim(),
  }

  let scanUpperBound = upperBoundYearMonth
  let upstreamExhausted = false
  let round = 0
  const rejections = new RejectionTally()

  while (round < MAX_LIBRARY_SCAN_ROUNDS) {
    round += 1
    const upstreamUrl = buildSanityQueryUrl(
      env.SANITY_PROJECT_ID.trim(),
      env.SANITY_DATASET.trim(),
      env.SANITY_API_VERSION,
      LIBRARY_MONTHS_GROQ_QUERY,
      {
        $upperBoundYearMonth: scanUpperBound,
        $fetchLimit: batchSize,
      },
    )

    const upstream = await fetchSanityQueryResult(upstreamUrl, env, options, corsHeaders, diagnostics)
    if (!upstream.ok) {
      return upstream.response
    }

    if (!Array.isArray(upstream.result)) {
      return failUpstream(diagnostics, corsHeaders, 'unexpectedResultShape')
    }

    const batch = upstream.result
    let minBatchYearMonth: string | null = null

    for (const rawItem of batch) {
      if (
        isPlainObject(rawItem) &&
        typeof rawItem.yearMonth === 'string' &&
        rawItem.yearMonth.length > 0 &&
        rawItem.yearMonth < scanUpperBound
      ) {
        if (minBatchYearMonth === null || rawItem.yearMonth < minBatchYearMonth) {
          minBatchYearMonth = rawItem.yearMonth
        }
      }

      const projected = validateAndProjectLibraryMonthSummary(
        rawItem,
        serverContext,
        projectionOptions,
      )
      rejections.record(projected)
      if (!projected.ok) {
        continue
      }
      const summary = projected.document
      if (summary.yearMonth >= upperBoundYearMonth) {
        continue
      }
      if (!byYearMonth.has(summary.yearMonth)) {
        byYearMonth.set(summary.yearMonth, summary)
      }
    }

    if (byYearMonth.size > limit) {
      break
    }

    if (batch.length < batchSize) {
      upstreamExhausted = true
      break
    }

    if (minBatchYearMonth === null) {
      return failUpstream(diagnostics, corsHeaders, 'libraryScanIncomplete')
    }

    scanUpperBound = minBatchYearMonth
  }

  const sortedItems = Array.from(byYearMonth.values()).sort((a, b) =>
    a.yearMonth > b.yearMonth ? -1 : a.yearMonth < b.yearMonth ? 1 : 0,
  )

  const hasMoreValidFound = sortedItems.length > limit
  const items = sortedItems.slice(0, limit)

  let hasMore: boolean
  let nextCursor: string | null

  if (hasMoreValidFound) {
    hasMore = true
    nextCursor = items[items.length - 1].yearMonth
  } else if (upstreamExhausted) {
    hasMore = false
    nextCursor = null
  } else {
    // Bounded scan limit reached before exhausting upstream.
    // Only expose canonical YYYY-MM continuation cursors; fail closed with 502 otherwise.
    if (!parseYearMonth(scanUpperBound) || scanUpperBound >= upperBoundYearMonth) {
      return failUpstream(diagnostics, corsHeaders, 'libraryScanIncomplete')
    }
    hasMore = true
    const boundary = calendarMonthsBefore(upperBoundYearMonth, batchSize * MAX_LIBRARY_SCAN_ROUNDS)
    // Malformed candidates can consume scan slots within a single month.
    // The preceding civil month is always safe once a canonical older key was scanned.
    const inspectedBoundary = boundary >= scanUpperBound ? boundary : calendarMonthsBefore(upperBoundYearMonth, 1)
    nextCursor = items.at(-1)?.yearMonth ?? inspectedBoundary
  }

  rejections.report(diagnostics, 200)

  return jsonResponse(
    {
      ok: true,
      serverContext,
      // The cursor describes the authorized browse window. Matching never
      // affects upstream scans, continuation metadata or the release decision.
      items: queryParams.query ? items.filter(item => matchesLibraryMonth(item, queryParams.query)) : items,
      page: {
        limit,
        hasMore,
        nextCursor,
      },
    },
    200,
    corsHeaders,
  )
}
