import { z } from 'zod'

/**
 * Typed front-end gateway providers for monthly publications, stateless progress
 * calculation, and preview News (R08A-5).
 *
 * Aligns 1:1 with `src/gateway/types.ts` without importing server-only `src/gateway/`
 * modules. Sends `X-Bibleberry-Timezone` on every request so the Cloudflare Worker
 * evaluates civil calendar dates using authoritative server UTC time, fails closed
 * on untrusted/malformed JSON, and never falls back to direct Sanity reads.
 */

export const DEFAULT_READER_TIME_ZONE = 'America/New_York'
export const MAX_PROGRESS_CHALLENGE_IDS = 500
const MAX_CHALLENGE_ID_LENGTH = 160
const MAX_TIMEZONE_LENGTH = 64

const YEAR_MONTH_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/
const ISO_CIVIL_DATE_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/
const RAW_OFFSET_PATTERN = /^(?:[+-]\d+(?::?\d+)?|(?:GMT|UTC)[+-].*)$/i

export type MonthGatewayChallengeType = 'teaching' | 'discipline' | 'reflection' | 'memorization'
export type NewsCategory = 'monthlyPreview' | 'ministryUpdate' | 'announcement'

export interface GatewayServerContext {
  readonly authorizedLocalDate: string
  readonly effectiveTimeZone: string
}

export interface MonthCoverImage {
  readonly url: string
  readonly alt: string
}

export interface MonthIntroductionScreen {
  readonly id: string
  readonly stepLabel?: string
  readonly title?: string
  readonly ctaLabel?: string
  readonly blocks: readonly Record<string, unknown>[]
}

export type MonthSlotPreview =
  | {
      readonly dayOfMonth: number
      readonly date: string
      readonly title: string
      readonly availability: 'comingSoon'
    }
  | {
      readonly dayOfMonth: number
      readonly date: string
      readonly availability: 'unavailable'
    }

export interface MonthPreviewData {
  readonly monthId: string
  readonly documentId: string
  readonly year: number
  readonly month: number
  readonly daysInMonth: number
  readonly phase: 'advancePreview'
  readonly monthStartsOn: string
  readonly title: string
  readonly subtitle?: string
  readonly coverImage?: MonthCoverImage
  readonly introduction: {
    readonly version: string
    readonly previewScreens: readonly MonthIntroductionScreen[]
  }
  readonly slots: readonly MonthSlotPreview[]
}

export type MonthSlot =
  | {
      readonly dayOfMonth: number
      readonly date: string
      readonly availability: 'available'
      readonly title: string
      readonly slug: string
      readonly challengeId: string
      readonly challengeType: MonthGatewayChallengeType
    }
  | {
      readonly dayOfMonth: number
      readonly date: string
      readonly availability: 'comingSoon'
      readonly title: string
    }
  | {
      readonly dayOfMonth: number
      readonly date: string
      readonly availability: 'unavailable'
      readonly formerChallengeId?: string
    }

export interface MonthDiscoverySummary {
  readonly discoveryId: string
  readonly kind: 'thematic' | 'fullMonth'
  readonly title: string
  readonly targetCount: number
}

export interface MonthDetailData {
  readonly monthId: string
  readonly documentId: string
  readonly year: number
  readonly month: number
  readonly daysInMonth: number
  readonly phase: 'active' | 'historical'
  readonly rosterVersion: number
  readonly totalChallenges: number
  readonly title: string
  readonly subtitle?: string
  readonly coverImage?: MonthCoverImage
  readonly introduction: {
    readonly version: string
    readonly previewScreens: readonly MonthIntroductionScreen[]
    readonly welcomeScreen: MonthIntroductionScreen
  }
  readonly slots: readonly MonthSlot[]
  readonly discoveries: readonly MonthDiscoverySummary[]
}

export interface MonthProgressDiscovery {
  readonly discoveryId: string
  readonly kind: 'thematic' | 'fullMonth'
  readonly title: string
  readonly achievedCount: number
  readonly targetCount: number
  readonly isEarned: boolean
  readonly awardId?: string
  readonly reservedCardId?: string
}

export interface MonthProgressData {
  readonly monthId: string
  readonly rosterVersion: number
  readonly completedInMonthCount: number
  readonly totalChallenges: number
  readonly thematicEarnedCount: number
  readonly thematicTotalCount: number
  readonly discoveries: readonly MonthProgressDiscovery[]
}

export interface NewsArticle {
  readonly id: string
  readonly documentId: string
  readonly category: NewsCategory
  readonly publishedOn: string
  readonly title: string
  readonly summary: string
  readonly body?: readonly Record<string, unknown>[]
  readonly coverImage?: MonthCoverImage
  readonly destination?: {
    readonly kind: 'month'
    readonly monthId: string
  }
}

export type MonthPreviewResult =
  | {
      readonly status: 'ready'
      readonly month: MonthPreviewData
      readonly serverContext: GatewayServerContext
      readonly source: 'gateway'
    }
  | { readonly status: 'notFound'; readonly source: 'gateway' }
  | { readonly status: 'requestError'; readonly message: string; readonly source: 'gateway' }
  | {
      readonly status: 'validationError'
      readonly message: string
      readonly issues?: readonly string[]
      readonly source: 'gateway'
    }

export type MonthDetailResult =
  | {
      readonly status: 'ready'
      readonly month: MonthDetailData
      readonly serverContext: GatewayServerContext
      readonly source: 'gateway'
    }
  | { readonly status: 'notFound'; readonly source: 'gateway' }
  | { readonly status: 'requestError'; readonly message: string; readonly source: 'gateway' }
  | {
      readonly status: 'validationError'
      readonly message: string
      readonly issues?: readonly string[]
      readonly source: 'gateway'
    }

export type MonthProgressResult =
  | {
      readonly status: 'ready'
      readonly progress: MonthProgressData
      readonly serverContext: GatewayServerContext
      readonly source: 'gateway'
    }
  | { readonly status: 'notFound'; readonly source: 'gateway' }
  | { readonly status: 'requestError'; readonly message: string; readonly source: 'gateway' }
  | {
      readonly status: 'validationError'
      readonly message: string
      readonly issues?: readonly string[]
      readonly source: 'gateway'
    }

export type NewsResult =
  | {
      readonly status: 'ready'
      readonly articles: readonly NewsArticle[]
      readonly serverContext: GatewayServerContext
      readonly source: 'gateway'
    }
  | { readonly status: 'notFound'; readonly source: 'gateway' }
  | { readonly status: 'requestError'; readonly message: string; readonly source: 'gateway' }
  | {
      readonly status: 'validationError'
      readonly message: string
      readonly issues?: readonly string[]
      readonly source: 'gateway'
    }

export interface MonthGatewayProviderConfig {
  readonly baseUrl?: string
  readonly fetchImpl?: typeof fetch
  readonly resolveTimeZone?: () => string | undefined
}

export interface MonthGatewayRequestOptions {
  readonly signal?: AbortSignal
  readonly fetchImpl?: typeof fetch
  readonly baseUrl?: string
  readonly timeZone?: string
}

export interface NewsRequestOptions extends MonthGatewayRequestOptions {
  readonly category?: NewsCategory
}

export interface MonthGatewayProvider {
  loadMonthPreview(yearMonth: string, options?: MonthGatewayRequestOptions): Promise<MonthPreviewResult>
  loadMonth(yearMonth: string, options?: MonthGatewayRequestOptions): Promise<MonthDetailResult>
  loadMonthProgress(
    yearMonth: string,
    completedChallengeIds: readonly string[],
    options?: MonthGatewayRequestOptions,
  ): Promise<MonthProgressResult>
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

function formatCivilDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function isValidCivilDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_CIVIL_DATE_PATTERN.test(value)) return false
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  return day >= 1 && day <= daysInCivilMonth(year, month)
}

function parseYearMonth(yearMonth: string): { yearMonth: string; year: number; month: number } | null {
  if (typeof yearMonth !== 'string') return null
  const trimmed = yearMonth.trim()
  if (!YEAR_MONTH_PATTERN.test(trimmed)) return null
  const year = Number(trimmed.slice(0, 4))
  const month = Number(trimmed.slice(5, 7))
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null
  return { yearMonth: trimmed, year, month }
}

function hasAsciiControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return true
  }
  return false
}

function sanitizeCompletedChallengeIds(
  input: readonly string[],
): { ok: true; ids: string[] } | { ok: false; message: string } {
  if (!Array.isArray(input)) {
    return { ok: false, message: 'completedChallengeIds must be an array' }
  }

  const seen = new Set<string>()
  const ids: string[] = []
  for (const rawEntry of input) {
    if (typeof rawEntry !== 'string') continue
    const trimmed = rawEntry.trim()
    if (
      !trimmed.startsWith('cms:') ||
      trimmed.length <= 4 ||
      trimmed.length > MAX_CHALLENGE_ID_LENGTH ||
      hasAsciiControlChars(trimmed)
    ) {
      continue
    }
    if (!seen.has(trimmed)) {
      seen.add(trimmed)
      ids.push(trimmed)
    }
  }

  if (ids.length > MAX_PROGRESS_CHALLENGE_IDS) {
    return {
      ok: false,
      message: `completedChallengeIds exceeds maximum of ${MAX_PROGRESS_CHALLENGE_IDS} IDs`,
    }
  }

  return { ok: true, ids }
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError')
  )
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function findPreviewPrivacyViolations(payload: unknown): string[] {
  const issues: string[] = []
  if (!isPlainRecord(payload) || !isPlainRecord(payload.month)) return issues
  const m = payload.month
  if ('discoveries' in m || 'fullMonthCard' in m || 'earnedCard' in m) {
    issues.push('month: Advance preview must not expose discoveries or card metadata.')
  }
  if (isPlainRecord(m.introduction) && 'welcomeScreen' in m.introduction) {
    issues.push('month.introduction: Advance preview must not expose welcomeScreen.')
  }
  if (Array.isArray(m.slots)) {
    m.slots.forEach((slot, index) => {
      if (!isPlainRecord(slot)) return
      if ('slug' in slot || 'challengeId' in slot || 'formerChallengeId' in slot || 'challengeType' in slot) {
        issues.push(`month.slots[${index}]: Advance preview slot must not expose slug or challengeId.`)
      }
      if (slot.availability === 'unavailable' && 'title' in slot) {
        issues.push(`month.slots[${index}]: Unavailable slot must not expose title.`)
      }
    })
  }
  return issues
}

function findMonthDetailPrivacyViolations(payload: unknown): string[] {
  const issues: string[] = []
  if (!isPlainRecord(payload) || !isPlainRecord(payload.month)) return issues
  const m = payload.month
  if (Array.isArray(m.slots)) {
    m.slots.forEach((slot, index) => {
      if (!isPlainRecord(slot)) return
      if (slot.availability === 'comingSoon' && ('slug' in slot || 'challengeId' in slot || 'challengeType' in slot)) {
        issues.push(`month.slots[${index}]: Coming soon slot must not expose slug, challengeId, or challengeType.`)
      }
      if (slot.availability === 'unavailable' && ('slug' in slot || 'title' in slot || 'challengeType' in slot)) {
        issues.push(`month.slots[${index}]: Unavailable slot must not expose slug, title, or challengeType.`)
      }
    })
  }
  if (Array.isArray(m.discoveries)) {
    m.discoveries.forEach((disc, index) => {
      if (!isPlainRecord(disc)) return
      if (
        'qualifyingChallenges' in disc ||
        'qualifyingChallengeIds' in disc ||
        'earnedCard' in disc ||
        'thumbnailUrl' in disc ||
        'fullImageUrl' in disc
      ) {
        issues.push(`month.discoveries[${index}]: Discovery summary must not expose hidden qualifying Challenges or card art.`)
      }
    })
  }
  return issues
}

function findMonthProgressPrivacyViolations(payload: unknown): string[] {
  const issues: string[] = []
  if (!isPlainRecord(payload) || !Array.isArray(payload.discoveries)) return issues
  payload.discoveries.forEach((disc, index) => {
    if (!isPlainRecord(disc)) return
    if ('qualifyingChallenges' in disc || 'qualifyingChallengeIds' in disc) {
      issues.push(`discoveries[${index}]: Progress discovery must not expose qualifying Challenge mappings.`)
    }
    if (disc.isEarned === false && ('awardId' in disc || 'reservedCardId' in disc || 'earnedCard' in disc || 'thumbnailUrl' in disc || 'fullImageUrl' in disc)) {
      issues.push(`discoveries[${index}]: Unearned discovery must not expose awardId or card metadata.`)
    }
  })
  return issues
}

function validateBaseUrl(rawBase: string): string | null {
  const trimmed = rawBase.trim().replace(/\/+$/, '')
  if (trimmed === '') return ''
  if (trimmed.startsWith('/')) return trimmed
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return trimmed
    }
  } catch {
    return null
  }
  return null
}

const requiredText = z
  .string()
  .refine(value => value.trim().length > 0, 'A non-empty string is required.')
const optionalText = z.string().nullish()
const isoCivilDateSchema = z.string().refine(isValidCivilDate, 'A valid YYYY-MM-DD date is required.')
const yearMonthSchema = z.string().regex(YEAR_MONTH_PATTERN, 'Expected YYYY-MM format.')
const canonicalCmsIdSchema = requiredText.refine(
  value => value.trim().startsWith('cms:') && value.trim().length > 4,
  'A canonical cms:<id> identifier is required.',
)

const serverContextSchema = z.object({
  authorizedLocalDate: isoCivilDateSchema,
  effectiveTimeZone: requiredText,
})

const coverImageSchema = z.object({
  url: z.string().refine(value => {
    try {
      return new URL(value).protocol === 'https:'
    } catch {
      return false
    }
  }, 'Cover image URL must be HTTPS.'),
  alt: requiredText,
})

const introScreenSchema = z.object({
  id: requiredText,
  stepLabel: optionalText,
  title: optionalText,
  ctaLabel: optionalText,
  blocks: z.array(z.record(z.string(), z.unknown())).min(1),
})

const previewSlotComingSoonSchema = z.object({
  dayOfMonth: z.number().int().min(1).max(31),
  date: isoCivilDateSchema,
  title: requiredText,
  availability: z.literal('comingSoon'),
}).superRefine((slot, ctx) => {
  const raw = slot as Record<string, unknown>
  if ('slug' in raw || 'challengeId' in raw || 'formerChallengeId' in raw) {
    ctx.addIssue({
      code: 'custom',
      message: 'Preview comingSoon slot must not expose slug or challengeId.',
    })
  }
})

const previewSlotUnavailableSchema = z.object({
  dayOfMonth: z.number().int().min(1).max(31),
  date: isoCivilDateSchema,
  availability: z.literal('unavailable'),
}).superRefine((slot, ctx) => {
  const raw = slot as Record<string, unknown>
  if ('slug' in raw || 'challengeId' in raw || 'title' in raw || 'formerChallengeId' in raw) {
    ctx.addIssue({
      code: 'custom',
      message: 'Preview unavailable slot must not expose private Challenge fields.',
    })
  }
})

const detailSlotAvailableSchema = z.object({
  dayOfMonth: z.number().int().min(1).max(31),
  date: isoCivilDateSchema,
  availability: z.literal('available'),
  title: requiredText,
  slug: requiredText,
  challengeId: canonicalCmsIdSchema,
  challengeType: z.enum(['teaching', 'discipline', 'reflection', 'memorization']),
})

const detailSlotComingSoonSchema = z.object({
  dayOfMonth: z.number().int().min(1).max(31),
  date: isoCivilDateSchema,
  availability: z.literal('comingSoon'),
  title: requiredText,
}).superRefine((slot, ctx) => {
  const raw = slot as Record<string, unknown>
  if ('slug' in raw || 'challengeId' in raw || 'challengeType' in raw) {
    ctx.addIssue({
      code: 'custom',
      message: 'Future comingSoon slot must not expose slug, challengeId, or challengeType.',
    })
  }
})

const detailSlotUnavailableSchema = z.object({
  dayOfMonth: z.number().int().min(1).max(31),
  date: isoCivilDateSchema,
  availability: z.literal('unavailable'),
  formerChallengeId: canonicalCmsIdSchema.nullish(),
}).superRefine((slot, ctx) => {
  const raw = slot as Record<string, unknown>
  if ('slug' in raw || 'title' in raw || 'challengeType' in raw) {
    ctx.addIssue({
      code: 'custom',
      message: 'Unavailable slot must not expose slug, title, or challengeType.',
    })
  }
})

const discoverySummarySchema = z.object({
  discoveryId: requiredText,
  kind: z.enum(['thematic', 'fullMonth']),
  title: requiredText,
  targetCount: z.number().int().min(0),
}).superRefine((disc, ctx) => {
  const raw = disc as Record<string, unknown>
  if (
    'qualifyingChallenges' in raw ||
    'qualifyingChallengeIds' in raw ||
    'earnedCard' in raw ||
    'thumbnailUrl' in raw ||
    'fullImageUrl' in raw
  ) {
    ctx.addIssue({
      code: 'custom',
      message: 'Discovery summary must not expose hidden qualifying Challenges or card art.',
    })
  }
})

const progressDiscoverySchema = z.object({
  discoveryId: requiredText,
  kind: z.enum(['thematic', 'fullMonth']),
  title: requiredText,
  achievedCount: z.number().int().min(0),
  targetCount: z.number().int().min(0),
  isEarned: z.boolean(),
  awardId: requiredText.nullish(),
  reservedCardId: requiredText.nullish(),
}).superRefine((disc, ctx) => {
  const raw = disc as Record<string, unknown>
  if ('qualifyingChallenges' in raw || 'qualifyingChallengeIds' in raw) {
    ctx.addIssue({
      code: 'custom',
      message: 'Progress discovery must not expose qualifying Challenge mappings.',
    })
  }
  if (!disc.isEarned && (disc.awardId || disc.reservedCardId || 'earnedCard' in raw)) {
    ctx.addIssue({
      code: 'custom',
      message: 'Unearned discovery must not include awardId or card metadata.',
    })
  }
})

const newsCategorySchema = z.enum(['monthlyPreview', 'ministryUpdate', 'announcement'])

const newsArticleSchema = z.object({
  id: requiredText,
  documentId: requiredText,
  category: newsCategorySchema,
  publishedOn: isoCivilDateSchema,
  title: requiredText,
  summary: requiredText,
  body: z.array(z.record(z.string(), z.unknown())).nullish(),
  coverImage: coverImageSchema.nullish(),
  destination: z.object({
    kind: z.literal('month'),
    monthId: yearMonthSchema,
  }).nullish(),
}).superRefine((article, ctx) => {
  if (article.category === 'monthlyPreview') {
    if (!article.destination || article.destination.kind !== 'month') {
      ctx.addIssue({
        code: 'custom',
        path: ['destination'],
        message: 'monthlyPreview article requires a valid month destination.',
      })
    }
    if (article.body || article.coverImage) {
      ctx.addIssue({
        code: 'custom',
        message: 'monthlyPreview article must remain minimal without body or coverImage.',
      })
    }
  }
})

function projectIntroScreen(screen: z.infer<typeof introScreenSchema>): MonthIntroductionScreen {
  return {
    id: screen.id.trim(),
    ...(screen.stepLabel?.trim() ? { stepLabel: screen.stepLabel.trim() } : {}),
    ...(screen.title?.trim() ? { title: screen.title.trim() } : {}),
    ...(screen.ctaLabel?.trim() ? { ctaLabel: screen.ctaLabel.trim() } : {}),
    blocks: screen.blocks,
  }
}

function projectCoverImage(image: z.infer<typeof coverImageSchema>): MonthCoverImage {
  return {
    url: image.url,
    alt: image.alt.trim(),
  }
}

function validateSequentialMonthSlots(
  slots: readonly { dayOfMonth: number; date: string }[],
  year: number,
  month: number,
): string | null {
  const expectedDays = daysInCivilMonth(year, month)
  if (slots.length !== expectedDays) {
    return `Expected ${expectedDays} calendar slots, received ${slots.length}`
  }
  for (let i = 0; i < expectedDays; i++) {
    const expectedDay = i + 1
    const expectedDate = formatCivilDate(year, month, expectedDay)
    if (slots[i].dayOfMonth !== expectedDay || slots[i].date !== expectedDate) {
      return `Slot ${i} does not match expected calendar date ${expectedDate}`
    }
  }
  return null
}

/**
 * Creates an injectable gateway-backed client for monthly preview, month detail,
 * stateless progress calculation, and preview News endpoints.
 */
export function createGatewayMonthProvider(
  config?: MonthGatewayProviderConfig,
): MonthGatewayProvider {
  const configuredBaseUrl =
    config?.baseUrl ??
    (typeof import.meta !== 'undefined' &&
    (import.meta.env?.VITE_RELEASE_GATEWAY_ORIGIN || import.meta.env?.VITE_GATEWAY_ORIGIN)
      ? String(
          import.meta.env.VITE_RELEASE_GATEWAY_ORIGIN ||
            import.meta.env.VITE_GATEWAY_ORIGIN,
        )
      : '')

  async function executeGatewayFetch(
    path: string,
    init: RequestInit,
    options?: MonthGatewayRequestOptions,
  ): Promise<
    | { ok: true; payload: unknown }
    | { ok: false; failure: { readonly status: 'notFound' | 'requestError' | 'validationError'; readonly message?: string; readonly issues?: readonly string[]; readonly source: 'gateway' } }
  > {
    const rawBase = options?.baseUrl ?? configuredBaseUrl
    const base = validateBaseUrl(rawBase)
    if (base === null) {
      return {
        ok: false,
        failure: {
          status: 'requestError',
          message: 'Invalid gateway base URL configuration',
          source: 'gateway',
        },
      }
    }

    const rawTimeZone =
      options?.timeZone !== undefined
        ? options.timeZone
        : config?.resolveTimeZone
          ? config.resolveTimeZone()
          : detectReaderTimeZone()
    const timeZone = resolveReaderTimeZone(rawTimeZone)
    const fetchFn = options?.fetchImpl ?? config?.fetchImpl ?? fetch
    const url = `${base}${path}`
    const headers = new Headers(init.headers)
    headers.set('Accept', 'application/json')
    headers.set('X-Bibleberry-Timezone', timeZone)

    let response: Response
    try {
      response = await fetchFn(url, {
        ...init,
        headers,
        signal: options?.signal,
      })
    } catch (err: unknown) {
      if (isAbortError(err)) {
        throw err
      }
      return {
        ok: false,
        failure: {
          status: 'requestError',
          message: err instanceof Error ? err.message : 'Network error communicating with gateway',
          source: 'gateway',
        },
      }
    }

    if (response.status === 404) {
      return { ok: false, failure: { status: 'notFound', source: 'gateway' } }
    }

    if (response.status >= 500) {
      return {
        ok: false,
        failure: {
          status: 'requestError',
          message: `Content gateway unavailable (HTTP ${response.status})`,
          source: 'gateway',
        },
      }
    }

    if (!response.ok) {
      return {
        ok: false,
        failure: {
          status: 'requestError',
          message: `Gateway returned HTTP ${response.status}`,
          source: 'gateway',
        },
      }
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      return {
        ok: false,
        failure: {
          status: 'validationError',
          message: 'Invalid JSON response from content gateway',
          issues: ['document: Invalid JSON response from content gateway'],
          source: 'gateway',
        },
      }
    }

    if (
      !payload ||
      typeof payload !== 'object' ||
      !('ok' in payload) ||
      (payload as { ok?: unknown }).ok !== true
    ) {
      return {
        ok: false,
        failure: {
          status: 'validationError',
          message: 'Malformed gateway response envelope',
          issues: ['ok: Expected ok: true envelope'],
          source: 'gateway',
        },
      }
    }

    return { ok: true, payload }
  }

  async function loadMonthPreview(
    yearMonth: string,
    options?: MonthGatewayRequestOptions,
  ): Promise<MonthPreviewResult> {
    const parsedYM = parseYearMonth(yearMonth)
    if (!parsedYM) {
      return {
        status: 'validationError',
        message: 'Invalid yearMonth; expected YYYY-MM',
        source: 'gateway',
      }
    }

    const res = await executeGatewayFetch(
      `/api/months/${encodeURIComponent(parsedYM.yearMonth)}/preview`,
      { method: 'GET' },
      options,
    )
    if (!res.ok) {
      return res.failure as MonthPreviewResult
    }

    const privacyIssues = findPreviewPrivacyViolations(res.payload)
    if (privacyIssues.length > 0) {
      return {
        status: 'validationError',
        message: 'Month preview response violated privacy/embargo guardrails',
        issues: privacyIssues,
        source: 'gateway',
      }
    }

    const expectedDays = daysInCivilMonth(parsedYM.year, parsedYM.month)
    const schema = z.object({
      ok: z.literal(true),
      serverContext: serverContextSchema,
      month: z.object({
        monthId: z.literal(parsedYM.yearMonth),
        documentId: z.literal(`month-${parsedYM.yearMonth}`),
        year: z.literal(parsedYM.year),
        month: z.literal(parsedYM.month),
        daysInMonth: z.literal(expectedDays),
        phase: z.literal('advancePreview'),
        monthStartsOn: z.literal(`${parsedYM.yearMonth}-01`),
        title: requiredText,
        subtitle: optionalText,
        coverImage: coverImageSchema.nullish(),
        introduction: z.object({
          version: requiredText,
          previewScreens: z.array(introScreenSchema).min(1),
        }).superRefine((intro, ctx) => {
          if ('welcomeScreen' in (intro as Record<string, unknown>)) {
            ctx.addIssue({
              code: 'custom',
              message: 'Advance preview must not expose welcomeScreen.',
            })
          }
        }),
        slots: z.array(z.union([previewSlotComingSoonSchema, previewSlotUnavailableSchema])),
      }).superRefine((m, ctx) => {
        const raw = m as Record<string, unknown>
        if ('discoveries' in raw || 'fullMonthCard' in raw || 'earnedCard' in raw) {
          ctx.addIssue({
            code: 'custom',
            message: 'Advance preview must not expose discoveries or card metadata.',
          })
        }
        const slotIssue = validateSequentialMonthSlots(m.slots, parsedYM.year, parsedYM.month)
        if (slotIssue) {
          ctx.addIssue({ code: 'custom', path: ['slots'], message: slotIssue })
        }
      }),
    })

    const parsed = schema.safeParse(res.payload)
    if (!parsed.success) {
      return {
        status: 'validationError',
        message: 'Malformed gateway month preview response',
        issues: parsed.error.issues.map(i => `${i.path.join('.') || 'document'}: ${i.message}`),
        source: 'gateway',
      }
    }

    const { serverContext, month: m } = parsed.data
    return {
      status: 'ready',
      serverContext: {
        authorizedLocalDate: serverContext.authorizedLocalDate,
        effectiveTimeZone: serverContext.effectiveTimeZone.trim(),
      },
      month: {
        monthId: m.monthId,
        documentId: m.documentId,
        year: m.year,
        month: m.month,
        daysInMonth: m.daysInMonth,
        phase: 'advancePreview',
        monthStartsOn: m.monthStartsOn,
        title: m.title.trim(),
        ...(m.subtitle?.trim() ? { subtitle: m.subtitle.trim() } : {}),
        ...(m.coverImage ? { coverImage: projectCoverImage(m.coverImage) } : {}),
        introduction: {
          version: m.introduction.version.trim(),
          previewScreens: m.introduction.previewScreens.map(projectIntroScreen),
        },
        slots: m.slots.map(slot =>
          slot.availability === 'comingSoon'
            ? {
                dayOfMonth: slot.dayOfMonth,
                date: slot.date,
                title: slot.title.trim(),
                availability: 'comingSoon' as const,
              }
            : {
                dayOfMonth: slot.dayOfMonth,
                date: slot.date,
                availability: 'unavailable' as const,
              },
        ),
      },
      source: 'gateway',
    }
  }

  async function loadMonth(
    yearMonth: string,
    options?: MonthGatewayRequestOptions,
  ): Promise<MonthDetailResult> {
    const parsedYM = parseYearMonth(yearMonth)
    if (!parsedYM) {
      return {
        status: 'validationError',
        message: 'Invalid yearMonth; expected YYYY-MM',
        source: 'gateway',
      }
    }

    const res = await executeGatewayFetch(
      `/api/months/${encodeURIComponent(parsedYM.yearMonth)}`,
      { method: 'GET' },
      options,
    )
    if (!res.ok) {
      return res.failure as MonthDetailResult
    }

    const privacyIssues = findMonthDetailPrivacyViolations(res.payload)
    if (privacyIssues.length > 0) {
      return {
        status: 'validationError',
        message: 'Month detail response violated privacy/embargo guardrails',
        issues: privacyIssues,
        source: 'gateway',
      }
    }

    const expectedDays = daysInCivilMonth(parsedYM.year, parsedYM.month)
    const schema = z.object({
      ok: z.literal(true),
      serverContext: serverContextSchema,
      month: z.object({
        monthId: z.literal(parsedYM.yearMonth),
        documentId: z.literal(`month-${parsedYM.yearMonth}`),
        year: z.literal(parsedYM.year),
        month: z.literal(parsedYM.month),
        daysInMonth: z.literal(expectedDays),
        phase: z.enum(['active', 'historical']),
        rosterVersion: z.number().int().min(1),
        totalChallenges: z.number().int().min(0),
        title: requiredText,
        subtitle: optionalText,
        coverImage: coverImageSchema.nullish(),
        introduction: z.object({
          version: requiredText,
          previewScreens: z.array(introScreenSchema).min(1),
          welcomeScreen: introScreenSchema,
        }),
        slots: z.array(
          z.union([detailSlotAvailableSchema, detailSlotComingSoonSchema, detailSlotUnavailableSchema]),
        ),
        discoveries: z.array(discoverySummarySchema),
      }).superRefine((m, ctx) => {
        const slotIssue = validateSequentialMonthSlots(m.slots, parsedYM.year, parsedYM.month)
        if (slotIssue) {
          ctx.addIssue({ code: 'custom', path: ['slots'], message: slotIssue })
        }
        const activeCount = m.slots.filter(s => s.availability !== 'unavailable').length
        if (m.totalChallenges !== activeCount) {
          ctx.addIssue({
            code: 'custom',
            path: ['totalChallenges'],
            message: `totalChallenges (${m.totalChallenges}) must equal active slot count (${activeCount}).`,
          })
        }
      }),
    })

    const parsed = schema.safeParse(res.payload)
    if (!parsed.success) {
      return {
        status: 'validationError',
        message: 'Malformed gateway month detail response',
        issues: parsed.error.issues.map(i => `${i.path.join('.') || 'document'}: ${i.message}`),
        source: 'gateway',
      }
    }

    const { serverContext, month: m } = parsed.data
    return {
      status: 'ready',
      serverContext: {
        authorizedLocalDate: serverContext.authorizedLocalDate,
        effectiveTimeZone: serverContext.effectiveTimeZone.trim(),
      },
      month: {
        monthId: m.monthId,
        documentId: m.documentId,
        year: m.year,
        month: m.month,
        daysInMonth: m.daysInMonth,
        phase: m.phase,
        rosterVersion: m.rosterVersion,
        totalChallenges: m.totalChallenges,
        title: m.title.trim(),
        ...(m.subtitle?.trim() ? { subtitle: m.subtitle.trim() } : {}),
        ...(m.coverImage ? { coverImage: projectCoverImage(m.coverImage) } : {}),
        introduction: {
          version: m.introduction.version.trim(),
          previewScreens: m.introduction.previewScreens.map(projectIntroScreen),
          welcomeScreen: projectIntroScreen(m.introduction.welcomeScreen),
        },
        slots: m.slots.map(slot => {
          if (slot.availability === 'available') {
            return {
              dayOfMonth: slot.dayOfMonth,
              date: slot.date,
              availability: 'available' as const,
              title: slot.title.trim(),
              slug: slot.slug.trim(),
              challengeId: slot.challengeId.trim(),
              challengeType: slot.challengeType,
            }
          }
          if (slot.availability === 'comingSoon') {
            return {
              dayOfMonth: slot.dayOfMonth,
              date: slot.date,
              availability: 'comingSoon' as const,
              title: slot.title.trim(),
            }
          }
          return {
            dayOfMonth: slot.dayOfMonth,
            date: slot.date,
            availability: 'unavailable' as const,
            ...(slot.formerChallengeId?.trim()
              ? { formerChallengeId: slot.formerChallengeId.trim() }
              : {}),
          }
        }),
        discoveries: m.discoveries.map(disc => ({
          discoveryId: disc.discoveryId.trim(),
          kind: disc.kind,
          title: disc.title.trim(),
          targetCount: disc.targetCount,
        })),
      },
      source: 'gateway',
    }
  }

  async function loadMonthProgress(
    yearMonth: string,
    completedChallengeIds: readonly string[],
    options?: MonthGatewayRequestOptions,
  ): Promise<MonthProgressResult> {
    const parsedYM = parseYearMonth(yearMonth)
    if (!parsedYM) {
      return {
        status: 'validationError',
        message: 'Invalid yearMonth; expected YYYY-MM',
        source: 'gateway',
      }
    }

    const sanitized = sanitizeCompletedChallengeIds(completedChallengeIds)
    if (!sanitized.ok) {
      return {
        status: 'validationError',
        message: sanitized.message,
        source: 'gateway',
      }
    }

    const res = await executeGatewayFetch(
      `/api/months/${encodeURIComponent(parsedYM.yearMonth)}/progress`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ completedChallengeIds: sanitized.ids }),
      },
      options,
    )
    if (!res.ok) {
      return res.failure as MonthProgressResult
    }

    const privacyIssues = findMonthProgressPrivacyViolations(res.payload)
    if (privacyIssues.length > 0) {
      return {
        status: 'validationError',
        message: 'Month progress response violated privacy/embargo guardrails',
        issues: privacyIssues,
        source: 'gateway',
      }
    }

    const schema = z.object({
      ok: z.literal(true),
      serverContext: serverContextSchema,
      monthId: z.literal(parsedYM.yearMonth),
      rosterVersion: z.number().int().min(1),
      completedInMonthCount: z.number().int().min(0),
      totalChallenges: z.number().int().min(0),
      thematicEarnedCount: z.number().int().min(0),
      thematicTotalCount: z.number().int().min(0),
      discoveries: z.array(progressDiscoverySchema),
    })

    const parsed = schema.safeParse(res.payload)
    if (!parsed.success) {
      return {
        status: 'validationError',
        message: 'Malformed gateway month progress response',
        issues: parsed.error.issues.map(i => `${i.path.join('.') || 'document'}: ${i.message}`),
        source: 'gateway',
      }
    }

    const data = parsed.data
    return {
      status: 'ready',
      serverContext: {
        authorizedLocalDate: data.serverContext.authorizedLocalDate,
        effectiveTimeZone: data.serverContext.effectiveTimeZone.trim(),
      },
      progress: {
        monthId: data.monthId,
        rosterVersion: data.rosterVersion,
        completedInMonthCount: data.completedInMonthCount,
        totalChallenges: data.totalChallenges,
        thematicEarnedCount: data.thematicEarnedCount,
        thematicTotalCount: data.thematicTotalCount,
        discoveries: data.discoveries.map(disc => ({
          discoveryId: disc.discoveryId.trim(),
          kind: disc.kind,
          title: disc.title.trim(),
          achievedCount: disc.achievedCount,
          targetCount: disc.targetCount,
          isEarned: disc.isEarned,
          ...(disc.isEarned && disc.awardId?.trim() ? { awardId: disc.awardId.trim() } : {}),
          ...(disc.isEarned && disc.reservedCardId?.trim()
            ? { reservedCardId: disc.reservedCardId.trim() }
            : {}),
        })),
      },
      source: 'gateway',
    }
  }

  async function loadNews(options?: NewsRequestOptions): Promise<NewsResult> {
    let categoryFilter: NewsCategory | undefined
    if (options?.category !== undefined) {
      const catCheck = newsCategorySchema.safeParse(options.category)
      if (!catCheck.success) {
        return {
          status: 'validationError',
          message: 'Invalid news category filter',
          source: 'gateway',
        }
      }
      categoryFilter = catCheck.data
    }

    const path = categoryFilter
      ? `/api/news?category=${encodeURIComponent(categoryFilter)}`
      : '/api/news'

    const res = await executeGatewayFetch(path, { method: 'GET' }, options)
    if (!res.ok) {
      return res.failure as NewsResult
    }

    const schema = z.object({
      ok: z.literal(true),
      serverContext: serverContextSchema,
      articles: z.array(newsArticleSchema),
    })

    const parsed = schema.safeParse(res.payload)
    if (!parsed.success) {
      return {
        status: 'validationError',
        message: 'Malformed gateway news response',
        issues: parsed.error.issues.map(i => `${i.path.join('.') || 'document'}: ${i.message}`),
        source: 'gateway',
      }
    }

    if (
      categoryFilter &&
      parsed.data.articles.some(article => article.category !== categoryFilter)
    ) {
      return {
        status: 'validationError',
        message: `Gateway news response included unexpected category outside "${categoryFilter}"`,
        source: 'gateway',
      }
    }

    return {
      status: 'ready',
      serverContext: {
        authorizedLocalDate: parsed.data.serverContext.authorizedLocalDate,
        effectiveTimeZone: parsed.data.serverContext.effectiveTimeZone.trim(),
      },
      articles: parsed.data.articles.map(article => ({
        id: article.id.trim(),
        documentId: article.documentId.trim(),
        category: article.category,
        publishedOn: article.publishedOn,
        title: article.title.trim(),
        summary: article.summary.trim(),
        ...(article.category !== 'monthlyPreview' && article.body && article.body.length > 0
          ? { body: article.body }
          : {}),
        ...(article.category !== 'monthlyPreview' && article.coverImage
          ? { coverImage: projectCoverImage(article.coverImage) }
          : {}),
        ...(article.destination
          ? {
              destination: {
                kind: 'month' as const,
                monthId: article.destination.monthId,
              },
            }
          : {}),
      })),
      source: 'gateway',
    }
  }

  return {
    loadMonthPreview,
    loadMonth,
    loadMonthProgress,
    loadNews,
  }
}

export const defaultGatewayMonthProvider = createGatewayMonthProvider()
