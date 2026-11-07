import {
  CATALOG_GROQ_QUERY,
  CHALLENGE_BY_SLUG_GROQ_QUERY,
  buildSanityQueryUrl,
} from './query.ts'
import {
  validateAndProjectCatalogSummary,
  validateAndProjectChallenge,
} from './projection.ts'
import type {
  GatewayCatalogResponse,
  GatewayCatalogSummary,
  GatewayChallengeResponse,
  GatewayEnv,
  GatewayErrorKind,
  GatewayErrorResponse,
  GatewayOptions,
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
  const origin = request.headers.get('Origin')
  if (!origin) return headers

  const allowed = parseAllowedOrigins(env.ALLOWED_ORIGINS)
  if (allowed.includes('*') || allowed.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Vary', 'Origin')
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
    preflightHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Accept')
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
    return handleCatalogRequest(env, options, corsHeaders)
  }

  // Route: GET /api/challenges/:slug
  const slugMatch = pathname.match(/^\/api\/challenges\/([^/]+)$/)
  if (slugMatch) {
    const slug = slugMatch[1]
    return handleSingleChallengeRequest(slug, env, options, corsHeaders)
  }

  // Unrecognized route
  return errorResponse('notFound', 'Not found', 404, corsHeaders)
}

async function handleCatalogRequest(
  env: GatewayEnv,
  options: GatewayOptions,
  corsHeaders: Headers,
): Promise<Response> {
  const now = options.getNow ? options.getNow() : new Date()
  const nowUtc = now.toISOString()
  const nowTime = now.getTime()
  const fetchImpl = options.fetchImpl ?? fetch

  const upstreamUrl = buildSanityQueryUrl(
    env.SANITY_PROJECT_ID,
    env.SANITY_DATASET,
    env.SANITY_API_VERSION,
    CATALOG_GROQ_QUERY,
    { $nowUtc: nowUtc },
  )

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
    return errorResponse(
      'upstreamError',
      'Upstream content service unavailable',
      502,
      corsHeaders,
    )
  }

  if (!upstreamResponse.ok) {
    return errorResponse(
      'upstreamError',
      'Upstream content service unavailable',
      502,
      corsHeaders,
    )
  }

  let payload: unknown
  try {
    payload = await upstreamResponse.json()
  } catch {
    return errorResponse(
      'upstreamError',
      'Upstream content service unavailable',
      502,
      corsHeaders,
    )
  }

  if (
    !payload ||
    typeof payload !== 'object' ||
    !('result' in payload) ||
    !Array.isArray(payload.result)
  ) {
    return errorResponse(
      'upstreamError',
      'Upstream content service unavailable',
      502,
      corsHeaders,
    )
  }

  const validatedSummaries: GatewayCatalogSummary[] = []
  for (const item of payload.result) {
    const projected = validateAndProjectCatalogSummary(item, nowTime)
    if (projected.ok) {
      validatedSummaries.push(projected.document)
    }
  }

  return jsonResponse(
    {
      ok: true,
      challenges: validatedSummaries,
    },
    200,
    corsHeaders,
  )
}

async function handleSingleChallengeRequest(
  slug: string,
  env: GatewayEnv,
  options: GatewayOptions,
  corsHeaders: Headers,
): Promise<Response> {
  if (!SLUG_REGEX.test(slug) || slug.length > 128) {
    return errorResponse('notFound', 'Challenge not found', 404, corsHeaders)
  }

  const now = options.getNow ? options.getNow() : new Date()
  const nowUtc = now.toISOString()
  const nowTime = now.getTime()
  const fetchImpl = options.fetchImpl ?? fetch

  const upstreamUrl = buildSanityQueryUrl(
    env.SANITY_PROJECT_ID,
    env.SANITY_DATASET,
    env.SANITY_API_VERSION,
    CHALLENGE_BY_SLUG_GROQ_QUERY,
    { $nowUtc: nowUtc, $slug: slug },
  )

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
    return errorResponse(
      'upstreamError',
      'Upstream content service unavailable',
      502,
      corsHeaders,
    )
  }

  if (!upstreamResponse.ok) {
    return errorResponse(
      'upstreamError',
      'Upstream content service unavailable',
      502,
      corsHeaders,
    )
  }

  let payload: unknown
  try {
    payload = await upstreamResponse.json()
  } catch {
    return errorResponse(
      'upstreamError',
      'Upstream content service unavailable',
      502,
      corsHeaders,
    )
  }

  if (!payload || typeof payload !== 'object' || !('result' in payload)) {
    return errorResponse(
      'upstreamError',
      'Upstream content service unavailable',
      502,
      corsHeaders,
    )
  }

  const rawDoc = (payload as { result?: unknown }).result
  if (!rawDoc || typeof rawDoc !== 'object') {
    // Challenge does not exist, or was filtered out by GROQ (unreviewed or future release)
    return errorResponse('notFound', 'Challenge not found', 404, corsHeaders)
  }

  const projected = validateAndProjectChallenge(rawDoc, nowTime)
  if (!projected.ok) {
    // Server-side validation failed closed (e.g. unapproved blocks, embargoed, draft)
    return errorResponse('notFound', 'Challenge not found', 404, corsHeaders)
  }

  return jsonResponse(
    {
      ok: true,
      challenge: projected.document,
    },
    200,
    corsHeaders,
  )
}
