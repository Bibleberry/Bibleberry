import { matchesLibraryMonth, MAX_LIBRARY_QUERY_LENGTH } from '../../lib/libraryMonthSearch.ts'
import { z } from 'zod'

/**
 * Typed front-end gateway consumer for the read-only historical Library month index
 * (`GET /api/library/months`).
 *
 * Strictly separated from server-only `src/gateway/` modules, enforces same-origin
 * defaults with zero direct Sanity fallback, sends `X-Bibleberry-Timezone`, supports
 * abortable bounded retries for transient transport failures, and rejects untrusted
 * JSON or embedded hidden content via strict Zod schemas and privacy invariants.
 */

export const DEFAULT_READER_TIME_ZONE = 'America/New_York'
export const DEFAULT_LIBRARY_PAGE_SIZE = 12
export const MAX_LIBRARY_PAGE_SIZE = 24
export const MAX_LIBRARY_RETRIES = 3
export const DEFAULT_LIBRARY_RETRY_DELAY_MS = 150
export const MAX_LIBRARY_RETRY_DELAY_MS = 2000

const MAX_TIMEZONE_LENGTH = 64
const YEAR_MONTH_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/
const ISO_CIVIL_DATE_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/
const RAW_OFFSET_PATTERN = /^(?:[+-]\d+(?::?\d+)?|(?:GMT|UTC)[+-].*)$/i
const SANITY_IMAGE_PATH_PATTERN = /^\/images\/[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9_-]*\/[a-zA-Z0-9._-]+$/

const FORBIDDEN_LIBRARY_KEYS = new Set([
  '_id',
  '_type',
  '_rev',
  '_system',
  'documentId',
  'editorialStatus',
  'editorialReview',
  'editorialEligibility',
  'reviewedBy',
  'reviewedAt',
  'reviewNotes',
  'withdrawn',
  'slots',
  'introduction',
  'previewScreens',
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
  'imageUrl',
  'illustrationAlt',
  'accessibleTranscription',
  'screens',
  'blocks',
  'slug',
  'challengeId',
  'releaseAt',
  'sourceSnapshot',
  'importProvenance',
  'previewNews',
  'defaultSeries',
])

export interface GatewayServerContext {
  readonly authorizedLocalDate: string
  readonly effectiveTimeZone: string
}

export interface LibraryMonthCoverImage {
  readonly url: string
  readonly alt: string
}

export interface LibraryMonthSummary {
  readonly yearMonth: string
  readonly year: number
  readonly month: number
  readonly title: string
  readonly subtitle?: string
  readonly coverImage?: LibraryMonthCoverImage
}

export interface LibraryMonthIndexPage {
  readonly limit: number
  readonly hasMore: boolean
  readonly nextCursor: string | null
}

export type LibraryMonthIndexResult =
  | {
      readonly status: 'ready'
      readonly items: readonly LibraryMonthSummary[]
      readonly page: LibraryMonthIndexPage
      readonly serverContext: GatewayServerContext
      readonly source: 'gateway'
    }
  | {
      readonly status: 'empty'
      readonly items: readonly []
      readonly page: LibraryMonthIndexPage
      readonly serverContext: GatewayServerContext
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

export interface LibraryMonthIndexProviderConfig {
  readonly baseUrl?: string
  readonly fetchImpl?: typeof fetch
  readonly resolveTimeZone?: () => string | undefined
  readonly maxRetries?: number
  readonly retryDelayMs?: number
  readonly allowCrossOrigin?: boolean
}

export interface LibraryMonthIndexRequestOptions {
  readonly query?: string
  readonly limit?: number
  readonly cursor?: string
  readonly signal?: AbortSignal
  readonly fetchImpl?: typeof fetch
  readonly baseUrl?: string
  readonly timeZone?: string
  readonly maxRetries?: number
  readonly retryDelayMs?: number
  readonly allowCrossOrigin?: boolean
}

export interface LibraryMonthIndexProvider {
  loadHistoricalMonths(
    options?: LibraryMonthIndexRequestOptions,
  ): Promise<LibraryMonthIndexResult>
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

function isValidCivilDate(value: unknown): value is string {
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

function validateBaseUrl(
  rawBase: string,
  allowCrossOrigin: boolean,
): { ok: true; baseUrl: string } | { ok: false; message: string } {
  const trimmed = rawBase.trim().replace(/\/+$/, '')
  if (trimmed === '') {
    return { ok: true, baseUrl: '' }
  }
  if (trimmed.startsWith('//')) {
    return { ok: false, message: 'Protocol-relative gateway base URL is not allowed' }
  }
  if (trimmed.startsWith('/')) {
    if (trimmed.includes('?') || trimmed.includes('#')) {
      return { ok: false, message: 'Gateway base path must not include query or hash fragments' }
    }
    return { ok: true, baseUrl: trimmed }
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
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
    typeof window !== 'undefined' &&
    typeof window.location?.origin === 'string' &&
    window.location.origin !== 'null' &&
    parsed.origin !== window.location.origin
  ) {
    return {
      ok: false,
      message: 'Cross-origin gateway base URL blocked by same-origin policy',
    }
  }

  return { ok: true, baseUrl: trimmed }
}

function isValidSanityCdnCoverUrl(value: string): boolean {
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

function collectForbiddenKeys(
  value: unknown,
  pathPrefix: string,
  issues: string[],
  depth = 0,
): void {
  if (depth > 8 || value === null || value === undefined) return
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      collectForbiddenKeys(value[i], `${pathPrefix}[${i}]`, issues, depth + 1)
    }
    return
  }
  if (!isPlainRecord(value)) return

  for (const [key, nested] of Object.entries(value)) {
    const nextPath = pathPrefix ? `${pathPrefix}.${key}` : key
    if (FORBIDDEN_LIBRARY_KEYS.has(key)) {
      issues.push(`${nextPath}: Forbidden private or embargoed field "${key}" in Library index response.`)
    }
    collectForbiddenKeys(nested, nextPath, issues, depth + 1)
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

function waitWithAbort(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'))
  }
  if (delayMs <= 0) {
    return Promise.resolve()
  }

  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('The operation was aborted.', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, delayMs)

    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

const requiredText = z
  .string()
  .refine(value => value.trim().length > 0, 'A non-empty string is required.')
const yearMonthSchema = z.string().regex(YEAR_MONTH_PATTERN, 'Expected YYYY-MM format.')
const isoCivilDateSchema = z
  .string()
  .refine(isValidCivilDate, 'A valid YYYY-MM-DD date is required.')

const serverContextSchema = z.strictObject({
  authorizedLocalDate: isoCivilDateSchema,
  effectiveTimeZone: requiredText,
})

const coverImageSchema = z.strictObject({
  url: z.string().refine(isValidSanityCdnCoverUrl, 'Cover image URL must be an HTTPS Sanity CDN image URL.'),
  alt: requiredText,
})

const libraryMonthSummarySchema = z
  .strictObject({
    yearMonth: yearMonthSchema,
    year: z.number().int().min(1000).max(9999),
    month: z.number().int().min(1).max(12),
    title: requiredText,
    subtitle: requiredText.optional(),
    coverImage: coverImageSchema.optional(),
  })
  .superRefine((item, ctx) => {
    const expectedYear = Number(item.yearMonth.slice(0, 4))
    const expectedMonth = Number(item.yearMonth.slice(5, 7))
    if (item.year !== expectedYear) {
      ctx.addIssue({
        code: 'custom',
        path: ['year'],
        message: `year (${item.year}) must match yearMonth (${item.yearMonth}).`,
      })
    }
    if (item.month !== expectedMonth) {
      ctx.addIssue({
        code: 'custom',
        path: ['month'],
        message: `month (${item.month}) must match yearMonth (${item.yearMonth}).`,
      })
    }
  })

const pageSchema = z.strictObject({
  limit: z.number().int().min(1).max(MAX_LIBRARY_PAGE_SIZE),
  hasMore: z.boolean(),
  nextCursor: yearMonthSchema.nullable(),
})

const libraryMonthsResponseSchema = z.strictObject({
  ok: z.literal(true),
  serverContext: serverContextSchema,
  items: z.array(libraryMonthSummarySchema),
  page: pageSchema,
})

/**
 * Creates a validated, same-origin-first gateway client for the historical Library
 * month index (`GET /api/library/months`).
 */
export function createGatewayLibraryMonthIndexProvider(
  config?: LibraryMonthIndexProviderConfig,
): LibraryMonthIndexProvider {
  const configuredBaseUrl =
    config?.baseUrl ??
    (typeof import.meta !== 'undefined' &&
    (import.meta.env?.VITE_RELEASE_GATEWAY_ORIGIN || import.meta.env?.VITE_GATEWAY_ORIGIN)
      ? String(
          import.meta.env.VITE_RELEASE_GATEWAY_ORIGIN ||
            import.meta.env.VITE_GATEWAY_ORIGIN,
        )
      : '')

  async function loadHistoricalMonths(
    options?: LibraryMonthIndexRequestOptions,
  ): Promise<LibraryMonthIndexResult> {
    if (options?.signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError')
    }

    // 1. Validate pagination & retry inputs fail-closed before any network activity.
    let requestedLimit: number | undefined
    if (options?.limit !== undefined) {
      if (
        typeof options.limit !== 'number' ||
        !Number.isInteger(options.limit) ||
        options.limit < 1 ||
        options.limit > MAX_LIBRARY_PAGE_SIZE
      ) {
        return {
          status: 'validationError',
          message: `Invalid limit; expected an integer between 1 and ${MAX_LIBRARY_PAGE_SIZE}.`,
          source: 'gateway',
        }
      }
      requestedLimit = options.limit
    }

    const query = options?.query ?? ''
    if (typeof query !== 'string' || query.length > MAX_LIBRARY_QUERY_LENGTH) {
      return { status: 'validationError', message: 'Invalid Library search', source: 'gateway' }
    }
    let requestedCursor: string | undefined
    if (options?.cursor !== undefined) {
      if (typeof options.cursor !== 'string' || !YEAR_MONTH_PATTERN.test(options.cursor)) {
        return {
          status: 'validationError',
          message: 'Invalid cursor; expected YYYY-MM format.',
          source: 'gateway',
        }
      }
      requestedCursor = options.cursor
    }

    const rawMaxRetries = options?.maxRetries ?? config?.maxRetries ?? 0
    if (
      typeof rawMaxRetries !== 'number' ||
      !Number.isInteger(rawMaxRetries) ||
      rawMaxRetries < 0 ||
      rawMaxRetries > MAX_LIBRARY_RETRIES
    ) {
      return {
        status: 'validationError',
        message: `Invalid maxRetries; expected an integer between 0 and ${MAX_LIBRARY_RETRIES}.`,
        source: 'gateway',
      }
    }

    const rawRetryDelayMs =
      options?.retryDelayMs ?? config?.retryDelayMs ?? DEFAULT_LIBRARY_RETRY_DELAY_MS
    if (
      typeof rawRetryDelayMs !== 'number' ||
      !Number.isFinite(rawRetryDelayMs) ||
      rawRetryDelayMs < 0 ||
      rawRetryDelayMs > MAX_LIBRARY_RETRY_DELAY_MS
    ) {
      return {
        status: 'validationError',
        message: `Invalid retryDelayMs; expected a number between 0 and ${MAX_LIBRARY_RETRY_DELAY_MS}.`,
        source: 'gateway',
      }
    }

    const allowCrossOrigin = options?.allowCrossOrigin ?? config?.allowCrossOrigin ?? false
    const rawBase = options?.baseUrl ?? configuredBaseUrl
    const baseCheck = validateBaseUrl(rawBase, allowCrossOrigin)
    if (!baseCheck.ok) {
      return {
        status: 'validationError',
        message: baseCheck.message,
        source: 'gateway',
      }
    }

    const searchParams = new URLSearchParams()
    if (requestedLimit !== undefined) {
      searchParams.set('limit', String(requestedLimit))
    }
    if (requestedCursor !== undefined) {
      searchParams.set('cursor', requestedCursor)
    }
    if (query.trim()) searchParams.set('q', query.trim())
    const queryString = searchParams.toString()
    const url = `${baseCheck.baseUrl}/api/library/months${queryString ? `?${queryString}` : ''}`

    const rawTimeZone =
      options?.timeZone !== undefined
        ? options.timeZone
        : config?.resolveTimeZone
          ? config.resolveTimeZone()
          : detectReaderTimeZone()
    const timeZone = resolveReaderTimeZone(rawTimeZone)
    const fetchFn = options?.fetchImpl ?? config?.fetchImpl ?? fetch

    // 2. Execute GET with bounded transient retries and AbortSignal support.
    let response: Response | undefined
    for (let attempt = 0; attempt <= rawMaxRetries; attempt++) {
      if (attempt > 0) {
        await waitWithAbort(rawRetryDelayMs, options?.signal)
      }

      try {
        response = await fetchFn(url, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'X-Bibleberry-Timezone': timeZone,
          },
          credentials: 'same-origin',
          cache: 'no-store',
          signal: options?.signal,
        })
      } catch (err: unknown) {
        if (isAbortError(err)) {
          throw err
        }
        if (attempt < rawMaxRetries) {
          continue
        }
        return {
          status: 'requestError',
          message: err instanceof Error ? err.message : 'Network error communicating with gateway',
          source: 'gateway',
        }
      }

      if (response.ok) {
        break
      }

      if (isTransientHttpStatus(response.status) && attempt < rawMaxRetries) {
        continue
      }

      return {
        status: 'requestError',
        message:
          response.status >= 500
            ? `Content gateway unavailable (HTTP ${response.status})`
            : `Gateway returned HTTP ${response.status}`,
        httpStatus: response.status,
        source: 'gateway',
      }
    }

    if (!response || !response.ok) {
      return {
        status: 'requestError',
        message: 'Content gateway unavailable',
        source: 'gateway',
      }
    }

    // 3. Parse JSON and reject untrusted / embedded hidden content fail-closed.
    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      return {
        status: 'validationError',
        message: 'Invalid JSON response from content gateway',
        issues: ['document: Invalid JSON response from content gateway'],
        source: 'gateway',
      }
    }

    const privacyIssues: string[] = []
    collectForbiddenKeys(payload, '', privacyIssues)
    if (privacyIssues.length > 0) {
      return {
        status: 'validationError',
        message: 'Library month index response contained forbidden or hidden fields',
        issues: privacyIssues,
        source: 'gateway',
      }
    }

    const parsed = libraryMonthsResponseSchema.safeParse(payload)
    if (!parsed.success) {
      return {
        status: 'validationError',
        message: 'Malformed gateway library month index response',
        issues: parsed.error.issues.map(i => `${i.path.join('.') || 'document'}: ${i.message}`),
        source: 'gateway',
      }
    }

    const { serverContext, items, page } = parsed.data
    const currentYearMonth = serverContext.authorizedLocalDate.slice(0, 7)

    // 4. Enforce strict historical-only, cursor-bound, limit, ordering, and page invariants.
    if (requestedLimit !== undefined && page.limit !== requestedLimit) {
      return {
        status: 'validationError',
        message: 'Gateway response page limit did not match requested limit',
        issues: [`page.limit: Expected ${requestedLimit}, received ${page.limit}`],
        source: 'gateway',
      }
    }

    if (items.length > page.limit) {
      return {
        status: 'validationError',
        message: 'Gateway response exceeded page limit',
        issues: [`items: Received ${items.length} items for page limit ${page.limit}`],
        source: 'gateway',
      }
    }

    const seenYearMonths = new Set<string>()
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (query && !matchesLibraryMonth(item, query)) {
        return { status: 'validationError', message: 'Unexpected Library search result', source: 'gateway' }
      }
      if (item.yearMonth >= currentYearMonth) {
        return {
          status: 'validationError',
          message: 'Library month index included current or future month',
          issues: [
            `items[${i}].yearMonth: "${item.yearMonth}" must be strictly earlier than "${currentYearMonth}".`,
          ],
          source: 'gateway',
        }
      }
      if (requestedCursor !== undefined && item.yearMonth >= requestedCursor) {
        return {
          status: 'validationError',
          message: 'Library month index violated requested cursor bound',
          issues: [
            `items[${i}].yearMonth: "${item.yearMonth}" must be strictly earlier than cursor "${requestedCursor}".`,
          ],
          source: 'gateway',
        }
      }
      if (seenYearMonths.has(item.yearMonth)) {
        return {
          status: 'validationError',
          message: 'Library month index contained duplicate yearMonth entries',
          issues: [`items[${i}].yearMonth: Duplicate month "${item.yearMonth}".`],
          source: 'gateway',
        }
      }
      seenYearMonths.add(item.yearMonth)

      if (i > 0 && items[i - 1].yearMonth <= item.yearMonth) {
        return {
          status: 'validationError',
          message: 'Library month index is not ordered newest-historical-first',
          issues: [
            `items[${i}].yearMonth: "${item.yearMonth}" must be strictly older than "${items[i - 1].yearMonth}".`,
          ],
          source: 'gateway',
        }
      }
    }

    if (page.hasMore) {
      if (page.nextCursor === null) {
        return {
          status: 'validationError',
          message: 'Gateway pagination hasMore=true requires a non-null nextCursor',
          issues: ['page.nextCursor: Expected YYYY-MM cursor when hasMore=true.'],
          source: 'gateway',
        }
      }
      if (page.nextCursor >= currentYearMonth) {
        return {
          status: 'validationError',
          message: 'Gateway pagination nextCursor must remain strictly historical',
          issues: [
            `page.nextCursor: "${page.nextCursor}" must be strictly earlier than "${currentYearMonth}".`,
          ],
          source: 'gateway',
        }
      }
      if (requestedCursor !== undefined && page.nextCursor >= requestedCursor) {
        return {
          status: 'validationError',
          message: 'Gateway pagination nextCursor did not advance past requested cursor',
          issues: [
            `page.nextCursor: "${page.nextCursor}" must be strictly earlier than requested cursor "${requestedCursor}".`,
          ],
          source: 'gateway',
        }
      }
      if (items.length > 0) {
        const lastYearMonth = items[items.length - 1].yearMonth
        if (page.nextCursor > lastYearMonth) {
          return {
            status: 'validationError',
            message: 'Gateway pagination nextCursor cannot follow a month newer than last returned item',
            issues: [
              `page.nextCursor: "${page.nextCursor}" must be <= last item "${lastYearMonth}".`,
            ],
            source: 'gateway',
          }
        }
      }
    } else if (page.nextCursor !== null) {
      return {
        status: 'validationError',
        message: 'Final Library index page must have nextCursor=null',
        issues: [`page.nextCursor: Expected null when hasMore=false, received "${page.nextCursor}".`],
        source: 'gateway',
      }
    }

    const normalizedContext: GatewayServerContext = {
      authorizedLocalDate: serverContext.authorizedLocalDate,
      effectiveTimeZone: serverContext.effectiveTimeZone.trim(),
    }
    const normalizedPage: LibraryMonthIndexPage = {
      limit: page.limit,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    }

    if (items.length === 0) {
      return {
        status: 'empty',
        items: [],
        page: normalizedPage,
        serverContext: normalizedContext,
        source: 'gateway',
      }
    }

    return {
      status: 'ready',
      items: items.map(item => ({
        yearMonth: item.yearMonth,
        year: item.year,
        month: item.month,
        title: item.title.trim(),
        ...(item.subtitle ? { subtitle: item.subtitle.trim() } : {}),
        ...(item.coverImage
          ? {
              coverImage: {
                url: item.coverImage.url,
                alt: item.coverImage.alt.trim(),
              },
            }
          : {}),
      })),
      page: normalizedPage,
      serverContext: normalizedContext,
      source: 'gateway',
    }
  }

  return {
    loadHistoricalMonths,
  }
}

export const defaultGatewayLibraryMonthIndexProvider =
  createGatewayLibraryMonthIndexProvider()
