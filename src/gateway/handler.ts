import {
  CATALOG_GROQ_QUERY,
  CHALLENGE_BY_SLUG_GROQ_QUERY,
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
  validateAndProjectMonthDetail,
  validateAndProjectMonthPreview,
  validateAndProjectNewsArticle,
} from './monthlyProjection.ts'
import {
  computeAdvancePreviewStartDate,
  parseYearMonth,
  resolveAuthorizedReaderDate,
} from './localRelease.ts'
import type {
  GatewayCatalogResponse,
  GatewayCatalogSummary,
  GatewayChallengeResponse,
  GatewayEnv,
  GatewayErrorKind,
  GatewayErrorResponse,
  GatewayFetch,
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

  // Route: GET /api/news
  if (pathname === '/api/news') {
    return handleNewsRequest(request, url, env, options, corsHeaders)
  }

  // Unrecognized route
  return errorResponse('notFound', 'Not found', 404, corsHeaders)
}

async function fetchSanityQueryResult(
  upstreamUrl: URL,
  env: GatewayEnv,
  fetchImpl: GatewayFetch,
  corsHeaders: Headers,
): Promise<{ ok: true; result: unknown } | { ok: false; response: Response }> {
  let upstreamResponse: Response
  try {
    upstreamResponse = await fetchImpl(upstreamUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${env.SANITY_READ_TOKEN}`,
      },
      cache: 'no-store',
    })
  } catch {
    return {
      ok: false,
      response: errorResponse(
        'upstreamError',
        'Upstream content service unavailable',
        502,
        corsHeaders,
      ),
    }
  }

  if (!upstreamResponse.ok) {
    return {
      ok: false,
      response: errorResponse(
        'upstreamError',
        'Upstream content service unavailable',
        502,
        corsHeaders,
      ),
    }
  }

  let payload: unknown
  try {
    payload = await upstreamResponse.json()
  } catch {
    return {
      ok: false,
      response: errorResponse(
        'upstreamError',
        'Upstream content service unavailable',
        502,
        corsHeaders,
      ),
    }
  }

  if (!payload || typeof payload !== 'object' || !('result' in payload)) {
    return {
      ok: false,
      response: errorResponse(
        'upstreamError',
        'Upstream content service unavailable',
        502,
        corsHeaders,
      ),
    }
  }

  return { ok: true, result: (payload as { result?: unknown }).result }
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
  const { nowUtc, nowTime, serverContext } = buildRequestReleaseContext(request, options)
  const fetchImpl = options.fetchImpl ?? fetch

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

  const upstream = await fetchSanityQueryResult(upstreamUrl, env, fetchImpl, corsHeaders)
  if (!upstream.ok) {
    return upstream.response
  }

  if (!Array.isArray(upstream.result)) {
    return errorResponse(
      'upstreamError',
      'Upstream content service unavailable',
      502,
      corsHeaders,
    )
  }

  const validatedSummaries: GatewayCatalogSummary[] = []
  for (const item of upstream.result) {
    const projected = validateAndProjectCatalogSummary(
      item,
      nowTime,
      serverContext.authorizedLocalDate,
    )
    if (projected.ok) {
      validatedSummaries.push(projected.document)
    }
  }

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

  const { nowUtc, nowTime, serverContext } = buildRequestReleaseContext(request, options)
  const fetchImpl = options.fetchImpl ?? fetch

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

  const upstream = await fetchSanityQueryResult(upstreamUrl, env, fetchImpl, corsHeaders)
  if (!upstream.ok) {
    return upstream.response
  }

  const rawDoc = upstream.result
  if (!rawDoc || typeof rawDoc !== 'object') {
    // Challenge does not exist, or was filtered out by GROQ (unreviewed or future release)
    return errorResponse('notFound', 'Challenge not found', 404, corsHeaders)
  }

  const projected = validateAndProjectChallenge(
    rawDoc,
    nowTime,
    serverContext.authorizedLocalDate,
  )
  if (!projected.ok) {
    // Server-side validation failed closed (e.g. unapproved blocks, embargoed, draft, withdrawn)
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

async function fetchMonthDocument(
  yearMonth: string,
  query: string,
  env: GatewayEnv,
  options: GatewayOptions,
  corsHeaders: Headers,
): Promise<{ ok: true; rawDoc: unknown } | { ok: false; response: Response }> {
  const fetchImpl = options.fetchImpl ?? fetch
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

  const upstream = await fetchSanityQueryResult(upstreamUrl, env, fetchImpl, corsHeaders)
  if (!upstream.ok) {
    return upstream
  }

  if (!isPlainObject(upstream.result)) {
    return { ok: false, response: monthNotFoundResponse(corsHeaders) }
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

  const { serverContext } = buildRequestReleaseContext(request, options)
  const previewStartDate = computeAdvancePreviewStartDate(parsedYM.year, parsedYM.month)
  if (serverContext.authorizedLocalDate < previewStartDate) {
    return monthNotFoundResponse(corsHeaders)
  }

  const fetched = await fetchMonthDocument(
    rawYearMonth,
    MONTHLY_PREVIEW_BY_ID_GROQ_QUERY,
    env,
    options,
    corsHeaders,
  )
  if (!fetched.ok) {
    return fetched.response
  }

  const projected = validateAndProjectMonthPreview(fetched.rawDoc, rawYearMonth, serverContext)
  if (!projected.ok) {
    return monthNotFoundResponse(corsHeaders)
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

  const { serverContext } = buildRequestReleaseContext(request, options)
  if (serverContext.authorizedLocalDate < `${rawYearMonth}-01`) {
    return monthNotFoundResponse(corsHeaders)
  }

  const fetched = await fetchMonthDocument(
    rawYearMonth,
    MONTHLY_DETAIL_BY_ID_GROQ_QUERY,
    env,
    options,
    corsHeaders,
  )
  if (!fetched.ok) {
    return fetched.response
  }

  const projected = validateAndProjectMonthDetail(fetched.rawDoc, rawYearMonth, serverContext)
  if (!projected.ok) {
    return monthNotFoundResponse(corsHeaders)
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

  const { serverContext } = buildRequestReleaseContext(request, options)
  if (serverContext.authorizedLocalDate < `${rawYearMonth}-01`) {
    return monthNotFoundResponse(corsHeaders)
  }

  const fetched = await fetchMonthDocument(
    rawYearMonth,
    MONTHLY_DETAIL_BY_ID_GROQ_QUERY,
    env,
    options,
    corsHeaders,
  )
  if (!fetched.ok) {
    return fetched.response
  }

  const evaluated = evaluateMonthProgress(
    fetched.rawDoc,
    rawYearMonth,
    serverContext,
    parsedBody.completedChallengeIds,
  )
  if (!evaluated.ok) {
    return monthNotFoundResponse(corsHeaders)
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

  const { serverContext } = buildRequestReleaseContext(request, options)
  const fetchImpl = options.fetchImpl ?? fetch

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

  const upstream = await fetchSanityQueryResult(upstreamUrl, env, fetchImpl, corsHeaders)
  if (!upstream.ok) {
    return upstream.response
  }

  if (!Array.isArray(upstream.result)) {
    return errorResponse(
      'upstreamError',
      'Upstream content service unavailable',
      502,
      corsHeaders,
    )
  }

  const articles: GatewayNewsArticle[] = []
  for (const item of upstream.result) {
    const projected = validateAndProjectNewsArticle(
      item,
      serverContext.authorizedLocalDate,
      categoryFilter,
    )
    if (projected.ok) {
      articles.push(projected.document)
    }
  }

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
