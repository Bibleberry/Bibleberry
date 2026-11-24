import { z } from 'zod'

/**
 * Typed front-end gateway consumer for Bibleberry's ministry News feed (`GET /api/news`).
 *
 * Strictly separated from server-only `src/gateway/` modules, enforces same-origin
 * defaults with zero direct Sanity fallback, sends `X-Bibleberry-Timezone`, supports
 * abortable bounded retries for transient transport failures, and rejects untrusted
 * payloads, draft IDs, or leaked editorial fields via strict Zod schemas.
 */

export const DEFAULT_READER_TIME_ZONE = 'America/New_York'
export const MAX_NEWS_RETRIES = 3
export const DEFAULT_NEWS_RETRY_DELAY_MS = 150
export const MAX_NEWS_RETRY_DELAY_MS = 2000

const MAX_TIMEZONE_LENGTH = 64
const YEAR_MONTH_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/
const ISO_CIVIL_DATE_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/
const RAW_OFFSET_PATTERN = /^(?:[+-]\d+(?::?\d+)?|(?:GMT|UTC)[+-].*)$/i
const SANITY_IMAGE_PATH_PATTERN = /^\/images\/[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9_-]*\/[a-zA-Z0-9._-]+$/

export const ALLOWED_NEWS_CATEGORIES = ['monthlyPreview', 'ministryUpdate', 'announcement'] as const
export type NewsCategory = (typeof ALLOWED_NEWS_CATEGORIES)[number]

const FORBIDDEN_NEWS_KEYS = new Set([
  '_id',
  '_type',
  '_rev',
  '_system',
  'editorialStatus',
  'editorialReview',
  'editorialEligibility',
  'reviewedBy',
  'reviewerRole',
  'reviewedAt',
  'reviewNotes',
  'withdrawn',
  'sourceSnapshot',
  'sourceDigestSha256',
  'importProvenance',
  'slots',
  'introduction',
  'welcomeScreen',
  'rosterFinalization',
  'finalizedChallengeIds',
  'priorRosters',
  'discoveries',
  'qualifyingChallenges',
  'qualifyingChallengeIds',
  'fullMonthCard',
  'earnedCard',
  'card',
  'cardId',
  'reservedCardId',
  'cardDocumentId',
  'thumbnailUrl',
  'fullImageUrl',
  'releaseAt',
  'defaultSeries',
])

export interface NewsGatewayServerContext {
  readonly authorizedLocalDate: string
  readonly effectiveTimeZone: string
}

export interface NewsCoverImage {
  readonly url: string
  readonly alt: string
}

export interface NewsDestinationMonth {
  readonly kind: 'month'
  readonly monthId: string
}

export type NewsDestination = NewsDestinationMonth

export interface NewsArticle {
  readonly id: string
  readonly documentId: string
  readonly category: NewsCategory
  readonly publishedOn: string
  readonly title: string
  readonly summary: string
  readonly body?: readonly Record<string, unknown>[]
  readonly coverImage?: NewsCoverImage
  readonly destination?: NewsDestination
}

export type NewsResult =
  | {
      readonly status: 'ready'
      readonly articles: readonly NewsArticle[]
      readonly serverContext: NewsGatewayServerContext
      readonly source: 'gateway'
    }
  | {
      readonly status: 'empty'
      readonly articles: readonly []
      readonly serverContext: NewsGatewayServerContext
      readonly source: 'gateway'
    }
  | {
      readonly status: 'requestError'
      readonly message: string
      readonly httpStatus?: number
      readonly source: 'gateway'
    }
  | {
      readonly status: 'validationError'
      readonly message: string
      readonly issues?: readonly string[]
      readonly source: 'gateway'
    }

export interface NewsProviderConfig {
  readonly baseUrl?: string
  readonly fetchImpl?: typeof fetch
  readonly resolveTimeZone?: () => string | undefined
  readonly maxRetries?: number
  readonly retryDelayMs?: number
  readonly allowCrossOrigin?: boolean
}

export interface NewsRequestOptions {
  readonly category?: NewsCategory
  readonly signal?: AbortSignal
  readonly fetchImpl?: typeof fetch
  readonly baseUrl?: string
  readonly timeZone?: string
  readonly maxRetries?: number
  readonly retryDelayMs?: number
  readonly allowCrossOrigin?: boolean
}

export interface NewsGatewayProvider {
  loadNews(options?: NewsRequestOptions): Promise<NewsResult>
}

export function isValidIanaTimeZone(candidate: unknown): candidate is string {
  if (typeof candidate !== 'string') return false
  const trimmed = candidate.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_TIMEZONE_LENGTH) return false
  if (RAW_OFFSET_PATTERN.test(trimmed)) return false

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: trimmed })
    return true
  } catch {
    return false
  }
}

export function resolveReaderTimeZone(candidate: string | null | undefined): string {
  return isValidIanaTimeZone(candidate) ? candidate.trim() : DEFAULT_READER_TIME_ZONE
}

export function detectReaderTimeZone(): string {
  try {
    return resolveReaderTimeZone(new Intl.DateTimeFormat().resolvedOptions().timeZone)
  } catch {
    return DEFAULT_READER_TIME_ZONE
  }
}

function daysInCivilMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function isValidCivilDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_CIVIL_DATE_PATTERN.test(value)) return false
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  return day >= 1 && day <= daysInCivilMonth(year, month)
}

function isSanityApiHost(hostname: string): boolean {
  const lower = hostname.toLowerCase()
  return lower === 'sanity.io' || lower.endsWith('.sanity.io')
}

export function validateBaseUrl(
  rawBase: string,
  allowCrossOrigin: boolean,
): { ok: true; baseUrl: string } | { ok: false; message: string } {
  if (typeof rawBase !== 'string') {
    return { ok: false, message: 'Gateway base URL must be a string' }
  }

  // Reject any backslashes - prevents normalization into cross-origin authorities in WHATWG URL (e.g. /\evil.com)
  if (rawBase.includes('\\')) {
    return { ok: false, message: 'Gateway base URL must not contain backslashes' }
  }

  const trimmed = rawBase.trim().replace(/\/+$/, '')
  if (trimmed === '') {
    return { ok: true, baseUrl: '' }
  }
  if (trimmed.startsWith('//')) {
    return { ok: false, message: 'Protocol-relative gateway base URL is not allowed' }
  }
  if (trimmed.includes('?') || trimmed.includes('#')) {
    return { ok: false, message: 'Gateway base path must not include query or hash fragments' }
  }

  const currentOrigin =
    typeof window !== 'undefined' &&
    typeof window.location?.origin === 'string' &&
    window.location.origin !== 'null' &&
    window.location.origin !== ''
      ? window.location.origin
      : undefined

  let parsed: URL
  try {
    if (trimmed.startsWith('/')) {
      // Validate normalized URL origin against currentOrigin rather than blindly trusting startsWith('/')
      parsed = new URL(trimmed, currentOrigin ?? 'http://127.0.0.1')
    } else {
      parsed = new URL(trimmed)
    }
  } catch {
    return { ok: false, message: 'Invalid gateway base URL configuration' }
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, message: 'Gateway base URL must use HTTP or HTTPS' }
  }
  if (parsed.username !== '' || parsed.password !== '' || parsed.search !== '' || parsed.hash !== '') {
    return { ok: false, message: 'Gateway base URL must not contain credentials, query, or hash' }
  }
  if (isSanityApiHost(parsed.hostname)) {
    return { ok: false, message: 'Direct Sanity API URLs are prohibited; use the release gateway' }
  }

  if (
    !allowCrossOrigin &&
    currentOrigin &&
    parsed.origin !== currentOrigin
  ) {
    return {
      ok: false,
      message: 'Cross-origin gateway base URL blocked by same-origin policy',
    }
  }

  if (trimmed.startsWith('/')) {
    return { ok: true, baseUrl: parsed.pathname.replace(/\/+$/, '') }
  }

  return { ok: true, baseUrl: trimmed }
}

export function isValidSanityCdnCoverUrl(value: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return false
  }
  return (
    parsed.protocol === 'https:' &&
    parsed.hostname === 'cdn.sanity.io' &&
    parsed.username === '' &&
    parsed.password === '' &&
    parsed.search === '' &&
    parsed.hash === '' &&
    SANITY_IMAGE_PATH_PATTERN.test(parsed.pathname)
  )
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function collectForbiddenNewsKeys(
  value: unknown,
  pathPrefix: string,
  issues: string[],
  depth = 0,
): void {
  if (depth > 8 || value === null || value === undefined) return
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      collectForbiddenNewsKeys(value[i], `${pathPrefix}[${i}]`, issues, depth + 1)
    }
    return
  }
  if (!isPlainRecord(value)) return

  for (const [key, nested] of Object.entries(value)) {
    const nextPath = pathPrefix ? `${pathPrefix}.${key}` : key
    // In PortableText, _type is standard ('block', 'span', 'link'). At any other level, _type is forbidden.
    const isAllowedPortableTextType =
      key === '_type' &&
      typeof nested === 'string' &&
      (nested === 'block' || nested === 'span' || nested === 'link') &&
      pathPrefix.includes('.body')

    if (FORBIDDEN_NEWS_KEYS.has(key) && !isAllowedPortableTextType) {
      issues.push(`${nextPath}: Forbidden private or editorial field "${key}" in News feed response.`)
    }
    collectForbiddenNewsKeys(nested, nextPath, issues, depth + 1)
  }
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError')
  )
}

function isTransientHttpStatus(status: number): boolean {
  return status === 429 || status >= 500
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException('Aborted', 'AbortError'))
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      cleanup()
      reject(new DOMException('Aborted', 'AbortError'))
    }
    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

// Zod validation schemas
const requiredStringSchema = z
  .string()
  .transform(val => val.trim())
  .refine(val => val.length > 0, { message: 'Must not be empty' })

const civilDateSchema = z.string().refine(isValidCivilDate, {
  message: 'Must be a valid ISO civil calendar date (YYYY-MM-DD)',
})

const yearMonthSchema = z.string().refine(val => YEAR_MONTH_PATTERN.test(val), {
  message: 'Must be a valid YYYY-MM format',
})

const newsCategorySchema = z.enum(ALLOWED_NEWS_CATEGORIES)

const newsCoverImageSchema = z.object({
  url: z.string().refine(isValidSanityCdnCoverUrl, {
    message: 'Cover image URL must be a valid https://cdn.sanity.io image URL',
  }),
  alt: requiredStringSchema,
})

const newsDestinationMonthSchema = z.object({
  kind: z.literal('month'),
  monthId: yearMonthSchema,
})

const serverContextSchema = z.object({
  authorizedLocalDate: civilDateSchema,
  effectiveTimeZone: requiredStringSchema,
})

export const rawNewsArticleSchema = z
  .object({
    id: requiredStringSchema,
    documentId: requiredStringSchema.refine(id => !id.startsWith('drafts.'), {
      message: 'Draft documents must not appear in published news',
    }),
    category: newsCategorySchema,
    publishedOn: civilDateSchema,
    title: requiredStringSchema,
    summary: requiredStringSchema,
    body: z.array(z.record(z.string(), z.unknown())).nullish(),
    coverImage: newsCoverImageSchema.nullish(),
    destination: newsDestinationMonthSchema.nullish(),
  })
  .superRefine((article, ctx) => {
    if (article.category === 'monthlyPreview') {
      if (!article.destination || article.destination.kind !== 'month') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['destination'],
          message: 'monthlyPreview article requires a valid month destination.',
        })
      }
      if (article.body || article.coverImage) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'monthlyPreview article must remain minimal without body or coverImage.',
        })
      }
    } else {
      if (article.destination) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['destination'],
          message: 'Non-monthlyPreview articles must not declare a monthly preview destination.',
        })
      }
    }
  })

export const rawNewsFeedSchema = z.object({
  ok: z.literal(true),
  serverContext: serverContextSchema,
  articles: z.array(rawNewsArticleSchema),
})

export function parseNewsFeedResponse(
  payload: unknown,
  expectedCategory?: NewsCategory,
): { ok: true; articles: NewsArticle[]; serverContext: NewsGatewayServerContext } | { ok: false; issues: string[] } {
  const forbiddenIssues: string[] = []
  collectForbiddenNewsKeys(payload, '', forbiddenIssues)
  if (forbiddenIssues.length > 0) {
    return { ok: false, issues: forbiddenIssues }
  }

  const parsed = rawNewsFeedSchema.safeParse(payload)
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map(i => `${i.path.join('.') || 'feed'}: ${i.message}`),
    }
  }

  if (expectedCategory && parsed.data.articles.some(a => a.category !== expectedCategory)) {
    return {
      ok: false,
      issues: [`Gateway response contained articles outside requested category "${expectedCategory}"`],
    }
  }

  const articles: NewsArticle[] = parsed.data.articles.map(article => ({
    id: article.id,
    documentId: article.documentId,
    category: article.category,
    publishedOn: article.publishedOn,
    title: article.title,
    summary: article.summary,
    ...(article.category !== 'monthlyPreview' && article.body && article.body.length > 0
      ? { body: article.body }
      : {}),
    ...(article.category !== 'monthlyPreview' && article.coverImage
      ? { coverImage: { url: article.coverImage.url, alt: article.coverImage.alt } }
      : {}),
    ...(article.destination
      ? { destination: { kind: 'month', monthId: article.destination.monthId } }
      : {}),
  }))

  return {
    ok: true,
    serverContext: {
      authorizedLocalDate: parsed.data.serverContext.authorizedLocalDate,
      effectiveTimeZone: parsed.data.serverContext.effectiveTimeZone,
    },
    articles,
  }
}

export function createNewsGatewayProvider(config: NewsProviderConfig = {}): NewsGatewayProvider {
  return {
    async loadNews(options: NewsRequestOptions = {}): Promise<NewsResult> {
      const allowCrossOrigin = options.allowCrossOrigin ?? config.allowCrossOrigin ?? false
      const rawBaseUrl = options.baseUrl ?? config.baseUrl ?? ''
      const baseCheck = validateBaseUrl(rawBaseUrl, allowCrossOrigin)
      if (!baseCheck.ok) {
        return {
          status: 'validationError',
          message: baseCheck.message,
          source: 'gateway',
        }
      }

      let categoryFilter: NewsCategory | undefined
      if (options.category !== undefined) {
        const catCheck = newsCategorySchema.safeParse(options.category)
        if (!catCheck.success) {
          return {
            status: 'validationError',
            message: `Invalid news category filter: "${String(options.category)}"`,
            issues: catCheck.error.issues.map(i => i.message),
            source: 'gateway',
          }
        }
        categoryFilter = catCheck.data
      }

      const timeZoneCandidate =
        options.timeZone ??
        (config.resolveTimeZone ? config.resolveTimeZone() : undefined) ??
        detectReaderTimeZone()
      const effectiveTimeZone = resolveReaderTimeZone(timeZoneCandidate)

      const searchParams = new URLSearchParams()
      if (categoryFilter) {
        searchParams.set('category', categoryFilter)
      }
      const queryString = searchParams.toString()
      const pathAndQuery = `${baseCheck.baseUrl}/api/news${queryString ? `?${queryString}` : ''}`

      const fetchImpl = options.fetchImpl ?? config.fetchImpl ?? (typeof fetch === 'function' ? fetch : undefined)
      if (!fetchImpl) {
        return {
          status: 'requestError',
          message: 'No fetch implementation available in current runtime environment',
          source: 'gateway',
        }
      }

      const maxRetries = Math.max(0, options.maxRetries ?? config.maxRetries ?? MAX_NEWS_RETRIES)
      const baseRetryDelay = Math.max(
        0,
        Math.min(
          options.retryDelayMs ?? config.retryDelayMs ?? DEFAULT_NEWS_RETRY_DELAY_MS,
          MAX_NEWS_RETRY_DELAY_MS,
        ),
      )

      let lastErrorResponse: { status: number; message: string } | null = null
      let lastTransportError: Error | null = null

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (options.signal?.aborted) {
          return {
            status: 'requestError',
            message: 'Request was aborted before completion',
            source: 'gateway',
          }
        }

        if (attempt > 0) {
          const backoff = Math.min(baseRetryDelay * 2 ** (attempt - 1), MAX_NEWS_RETRY_DELAY_MS)
          const jitter = Math.floor(Math.random() * (backoff * 0.25))
          try {
            await delay(backoff + jitter, options.signal)
          } catch (err) {
            if (isAbortError(err)) {
              return {
                status: 'requestError',
                message: 'Request was aborted during retry backoff',
                source: 'gateway',
              }
            }
            throw err
          }
        }

        let response: Response
        try {
          response = await fetchImpl(pathAndQuery, {
            method: 'GET',
            cache: 'no-store',
            headers: {
              Accept: 'application/json',
              'X-Bibleberry-Timezone': effectiveTimeZone,
            },
            signal: options.signal,
          })
        } catch (err) {
          if (isAbortError(err)) {
            return {
              status: 'requestError',
              message: 'Request was aborted',
              source: 'gateway',
            }
          }
          lastTransportError = err instanceof Error ? err : new Error(String(err))
          continue
        }

        if (!response.ok) {
          let errorDetail = `HTTP ${response.status} ${response.statusText}`.trim()
          try {
            const errJson = await response.json()
            if (isPlainRecord(errJson) && typeof errJson.message === 'string') {
              errorDetail = errJson.message
            }
          } catch {
            // Keep status text fallback
          }

          if (isTransientHttpStatus(response.status)) {
            lastErrorResponse = { status: response.status, message: errorDetail }
            continue
          }

          return {
            status: 'requestError',
            message: errorDetail,
            httpStatus: response.status,
            source: 'gateway',
          }
        }

        let payload: unknown
        try {
          payload = await response.json()
        } catch {
          return {
            status: 'validationError',
            message: 'Malformed gateway news response: response body is not valid JSON',
            source: 'gateway',
          }
        }

        const parseResult = parseNewsFeedResponse(payload, categoryFilter)
        if (!parseResult.ok) {
          return {
            status: 'validationError',
            message: 'Malformed gateway news response',
            issues: parseResult.issues,
            source: 'gateway',
          }
        }

        if (parseResult.articles.length === 0) {
          return {
            status: 'empty',
            articles: [],
            serverContext: parseResult.serverContext,
            source: 'gateway',
          }
        }

        return {
          status: 'ready',
          articles: parseResult.articles,
          serverContext: parseResult.serverContext,
          source: 'gateway',
        }
      }

      if (lastErrorResponse) {
        return {
          status: 'requestError',
          message: `Transient gateway failure after ${maxRetries + 1} attempts: ${lastErrorResponse.message}`,
          httpStatus: lastErrorResponse.status,
          source: 'gateway',
        }
      }

      return {
        status: 'requestError',
        message: `Network transport failure after ${maxRetries + 1} attempts: ${lastTransportError?.message ?? 'unknown network error'}`,
        source: 'gateway',
      }
    },
  }
}

export const defaultNewsGatewayProvider = createNewsGatewayProvider()
