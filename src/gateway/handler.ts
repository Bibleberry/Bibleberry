import {
  CATALOG_GROQ_QUERY,
  CHALLENGE_BY_SLUG_GROQ_QUERY,
  buildSanityQueryUrl,
} from './query.ts'
import {
  validateAndProjectCatalogSummary,
  validateAndProjectChallenge,
} from './projection.ts'
import { resolveAuthorizedReaderDate } from './localRelease.ts'
import type {
  GatewayCatalogResponse,
  GatewayCatalogSummary,
  GatewayChallengeResponse,
  GatewayEnv,
  GatewayErrorKind,
  GatewayErrorResponse,
  GatewayFetch,
  GatewayOptions,
  GatewayServerContext,
} from './types.ts'

const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000']
const SLUG_REGEX = /^[a-zA-Z0-9_-]+$/

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

function jsonResponse(
  body: GatewayCatalogResponse | GatewayChallengeResponse | GatewayErrorResponse,
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

/**
 * Core Cloudflare Worker request handler for the Bibleberry Release Gateway.
 */
export async function handleGatewayRequest(
  request: Request,
  env: GatewayEnv,
  options: GatewayOptions = {},
): Promise<Response> {
  const corsHeaders = resolveCorsHeaders(request, env)

  // 1. Handle CORS preflight
  if (request.method === 'OPTIONS') {
    const preflightHeaders = new Headers(corsHeaders)
    preflightHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
    preflightHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Accept, X-Bibleberry-Timezone')
    preflightHeaders.set('Access-Control-Max-Age', '86400')
    preflightHeaders.set('Cache-Control', 'no-store')
    return new Response(null, { status: 204, headers: preflightHeaders })
  }

  // 2. Enforce allowed HTTP methods
  if (request.method !== 'GET') {
    return errorResponse('methodNotAllowed', 'Method not allowed', 405, corsHeaders, {
      Allow: 'GET, OPTIONS',
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
