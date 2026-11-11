/**
 * Pure, platform-neutral admission and selector helpers for durable guest Scripture Card
 * awards (R14-3).
 *
 * Aligns structurally 1:1 with `src/gateway/types.ts` (`GatewayMonthProgressResponse`,
 * `GatewayMonthProgressDiscovery`, `GatewayEarnedScriptureCard`) without importing server-only
 * `src/gateway/` modules into the browser source tree.
 *
 * Trust boundary:
 * - Evaluates gateway progress responses from R14-2 (`POST /api/months/:yearMonth/progress`)
 *   against canonical monthly award identities and `serverContext.authorizedLocalDate`.
 * - Never uses browser `Date.now()` or client clocks as award eligibility or `earnedOn` date.
 * - Never makes client-invented card metadata authoritative or stores Bible passage text.
 */

export interface GatewayEarnedScriptureCardInput {
  readonly cardDocumentId: string
  readonly title: string
  readonly publicationYearMonth: string
  readonly imageUrl: string
  readonly assetRevision: string
  readonly illustrationAlt: string
  readonly accessibleTranscription: string
  readonly scripture: {
    readonly book: string
    readonly reference: string
    readonly translation: string
  }
  readonly attribution: string
  readonly rightsStatus: string
  readonly shareEligible: boolean
  readonly theologicalThemes?: readonly string[]
  readonly keywords?: readonly string[]
}

export interface GatewayMonthProgressDiscoveryInput {
  readonly discoveryId: string
  readonly kind: 'thematic' | 'fullMonth'
  readonly title: string
  readonly achievedCount: number
  readonly targetCount: number
  readonly isEarned: boolean
  readonly awardId?: string
  readonly reservedCardId?: string
  readonly earnedCard?: GatewayEarnedScriptureCardInput
}

export interface GatewayMonthProgressResponseInput {
  readonly ok: true
  readonly serverContext: {
    readonly authorizedLocalDate: string
    readonly effectiveTimeZone: string
  }
  readonly monthId: string
  readonly rosterVersion: number
  readonly completedInMonthCount: number
  readonly totalChallenges: number
  readonly thematicEarnedCount: number
  readonly thematicTotalCount: number
  readonly discoveries: readonly GatewayMonthProgressDiscoveryInput[]
}
import {
  parseCanonicalMonthlyAwardId,
  parseCanonicalMonthlyDiscoveryId,
  parseCardDocumentId,
  parseLocalCalendarDate,
  parseMonthlyAwardIdParts,
  parsePublicationYearMonth,
} from './identity.ts'
import type {
  CanonicalAwardId,
  EarnedAwardInput,
  EarnedAwardRecord,
  EarnedScriptureCardSnapshot,
  LocalCalendarDate,
  MonthlyAwardKind,
  ParticipationCommand,
  ReaderParticipationData,
} from './types.ts'

const ASSET_REVISION_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,31}$/
const SANITY_IMAGE_PATH_PATTERN = /^\/images\/([a-z0-9]+)\/([a-z0-9_-]+)\/[a-zA-Z0-9._-]+$/

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function sanitizeCardImageUrl(rawUrl: unknown): string | null {
  if (typeof rawUrl !== 'string') return null
  const trimmed = rawUrl.trim()
  if (!trimmed) return null

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }

  if (
    parsed.protocol !== 'https:'
    || parsed.username !== ''
    || parsed.password !== ''
    || parsed.search !== ''
    || parsed.hash !== ''
    || parsed.hostname !== 'cdn.sanity.io'
  ) {
    return null
  }

  if (!SANITY_IMAGE_PATH_PATTERN.test(parsed.pathname)) {
    return null
  }

  return trimmed
}

function sanitizeOptionalStringArray(
  raw: unknown,
): { readonly ok: true; readonly values?: readonly string[] } | { readonly ok: false } {
  if (raw === undefined || raw === null) {
    return { ok: true }
  }
  if (!Array.isArray(raw)) {
    return { ok: false }
  }
  const values: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    const trimmed = normalizeNonEmptyString(item)
    if (!trimmed) {
      return { ok: false }
    }
    const dedupKey = trimmed.toLowerCase()
    if (!seen.has(dedupKey)) {
      seen.add(dedupKey)
      values.push(trimmed)
    }
  }
  return { ok: true, values: values.length > 0 ? Object.freeze(values) : undefined }
}

/**
 * Validates and sanitizes an optional R14-2 `GatewayEarnedScriptureCard` payload into an
 * allowlisted, frozen `EarnedScriptureCardSnapshot` (stripping any unapproved or manuscript
 * fields such as `passage` or raw Sanity internals).
 */
export function validateEarnedCardSnapshot(
  rawCard: unknown,
  expectedYearMonth?: string,
): EarnedScriptureCardSnapshot | null {
  if (!isPlainObject(rawCard)) return null

  const cardDocumentId = parseCardDocumentId(rawCard.cardDocumentId)
  const title = normalizeNonEmptyString(rawCard.title)
  const publicationYearMonth = parsePublicationYearMonth(rawCard.publicationYearMonth)
  if (!cardDocumentId || !title || !publicationYearMonth) return null
  if (expectedYearMonth !== undefined && publicationYearMonth !== expectedYearMonth) {
    return null
  }

  const imageUrl = sanitizeCardImageUrl(rawCard.imageUrl)
  const assetRevision = normalizeNonEmptyString(rawCard.assetRevision)
  if (!imageUrl || !assetRevision || !ASSET_REVISION_PATTERN.test(assetRevision)) {
    return null
  }

  const illustrationAlt = normalizeNonEmptyString(rawCard.illustrationAlt)
  const accessibleTranscription = normalizeNonEmptyString(rawCard.accessibleTranscription)
  if (
    !illustrationAlt
    || !accessibleTranscription
    || illustrationAlt.toLowerCase() === accessibleTranscription.toLowerCase()
  ) {
    return null
  }

  if (!isPlainObject(rawCard.scripture)) return null
  const book = normalizeNonEmptyString(rawCard.scripture.book)
  const reference = normalizeNonEmptyString(rawCard.scripture.reference)
  const translation = normalizeNonEmptyString(rawCard.scripture.translation)
  if (!book || !reference || !translation) return null

  const attribution = normalizeNonEmptyString(rawCard.attribution)
  const rightsStatus = normalizeNonEmptyString(rawCard.rightsStatus)
  if (!attribution || !rightsStatus) return null

  if (typeof rawCard.shareEligible !== 'boolean') return null

  const themes = sanitizeOptionalStringArray(rawCard.theologicalThemes)
  const keywords = sanitizeOptionalStringArray(rawCard.keywords)
  if (!themes.ok || !keywords.ok) return null

  return Object.freeze({
    cardDocumentId,
    title,
    publicationYearMonth,
    imageUrl,
    assetRevision,
    illustrationAlt,
    accessibleTranscription,
    scripture: Object.freeze({
      book,
      reference,
      translation,
    }),
    attribution,
    rightsStatus,
    shareEligible: rawCard.shareEligible,
    ...(themes.values ? { theologicalThemes: themes.values } : {}),
    ...(keywords.values ? { keywords: keywords.values } : {}),
  })
}

/**
 * Pure, explicit admission helper for an R14-2 `POST /api/months/:yearMonth/progress` response.
 *
 * Accepts only `isEarned === true` entries whose `discoveryId` and `awardId` are canonically
 * valid and consistent with `response.monthId`, using `serverContext.authorizedLocalDate` as
 * `earnedOn`. Absent or invalid `earnedCard` payloads are omitted without discarding the earned
 * award itself.
 */
export function admitGatewayMonthProgressAwards(
  response: GatewayMonthProgressResponseInput | unknown,
): readonly EarnedAwardInput[] {
  if (!isPlainObject(response) || response.ok !== true) {
    return Object.freeze([])
  }

  const monthId = parsePublicationYearMonth(response.monthId)
  if (!monthId) {
    return Object.freeze([])
  }

  if (!isPlainObject(response.serverContext)) {
    return Object.freeze([])
  }
  const authorizedLocalDate = parseLocalCalendarDate(response.serverContext.authorizedLocalDate)
  if (!authorizedLocalDate) {
    return Object.freeze([])
  }

  if (!Array.isArray(response.discoveries)) {
    return Object.freeze([])
  }

  const admitted: EarnedAwardInput[] = []
  const seenAwardIds = new Set<string>()
  const seenDiscoveryIds = new Set<string>()

  for (const entry of response.discoveries) {
    if (!isPlainObject(entry) || entry.isEarned !== true) {
      continue
    }
    if (entry.kind !== 'thematic' && entry.kind !== 'fullMonth') {
      continue
    }

    const parsedDiscovery = parseCanonicalMonthlyDiscoveryId(entry.discoveryId)
    if (
      !parsedDiscovery
      || parsedDiscovery.publicationYearMonth !== monthId
      || parsedDiscovery.kind !== entry.kind
    ) {
      continue
    }

    const parsedAward = parseMonthlyAwardIdParts(entry.awardId)
    if (
      !parsedAward
      || parsedAward.publicationYearMonth !== monthId
      || parsedAward.kind !== entry.kind
      || parsedAward.slug !== parsedDiscovery.slug
      || parsedAward.discoveryId !== parsedDiscovery.discoveryId
    ) {
      continue
    }

    if (seenAwardIds.has(parsedAward.awardId) || seenDiscoveryIds.has(parsedDiscovery.discoveryId)) {
      continue
    }
    seenAwardIds.add(parsedAward.awardId)
    seenDiscoveryIds.add(parsedDiscovery.discoveryId)

    const validatedCard = validateEarnedCardSnapshot(entry.earnedCard, monthId)
    const cardDocumentId =
      validatedCard?.cardDocumentId
      ?? parseCardDocumentId(entry.reservedCardId)
      ?? undefined

    admitted.push(
      Object.freeze({
        awardId: parsedAward.awardId,
        discoveryId: parsedAward.discoveryId,
        earnedOn: authorizedLocalDate,
        ...(cardDocumentId ? { cardDocumentId } : {}),
        ...(validatedCard ? { earnedCard: validatedCard } : {}),
      }),
    )
  }

  return Object.freeze(admitted)
}

export function createRecordEarnedAwardsCommand(
  awards: readonly EarnedAwardInput[],
): ParticipationCommand {
  return {
    type: 'recordEarnedAwards',
    awards,
  }
}

export function selectEarnedAward(
  data: ReaderParticipationData,
  awardId: string,
): EarnedAwardRecord | undefined {
  const canonical = parseCanonicalMonthlyAwardId(awardId)
  if (!canonical) return undefined
  return Object.hasOwn(data.earnedAwards, canonical)
    ? data.earnedAwards[canonical]
    : undefined
}

export function hasStoredAward(
  data: ReaderParticipationData,
  awardId: string,
): boolean {
  return selectEarnedAward(data, awardId) !== undefined
}

export function selectEarnedAwardsForMonth(
  data: ReaderParticipationData,
  yearMonth: string,
): readonly EarnedAwardRecord[] {
  const normalizedMonth = parsePublicationYearMonth(yearMonth)
  if (!normalizedMonth) return Object.freeze([])

  const matching = Object.values(data.earnedAwards).filter(
    record => record.publicationYearMonth === normalizedMonth,
  )
  matching.sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === 'thematic' ? -1 : 1
    }
    if (left.earnedOn !== right.earnedOn) {
      return left.earnedOn.localeCompare(right.earnedOn)
    }
    return left.awardId.localeCompare(right.awardId)
  })
  return Object.freeze(matching)
}

export function selectPendingHubAnnouncementAwards(
  data: ReaderParticipationData,
): readonly EarnedAwardRecord[] {
  const pending = Object.values(data.earnedAwards).filter(
    record => !record.hubAnnouncementAcked,
  )
  pending.sort((left, right) => {
    if (left.earnedOn !== right.earnedOn) {
      return left.earnedOn.localeCompare(right.earnedOn)
    }
    return left.awardId.localeCompare(right.awardId)
  })
  return Object.freeze(pending)
}

export function selectUnviewedEarnedAwards(
  data: ReaderParticipationData,
): readonly EarnedAwardRecord[] {
  const unviewed = Object.values(data.earnedAwards).filter(
    record => !record.cardViewed,
  )
  unviewed.sort((left, right) => {
    if (left.earnedOn !== right.earnedOn) {
      return left.earnedOn.localeCompare(right.earnedOn)
    }
    return left.awardId.localeCompare(right.awardId)
  })
  return Object.freeze(unviewed)
}

export type CombinedDiscoveryProgress =
  | {
      readonly discoveryId: string
      readonly kind: MonthlyAwardKind
      readonly title: string
      readonly achievedCount: number
      readonly targetCount: number
      readonly effectiveEarned: false
      readonly hasStoredAward: false
      readonly hasCardDisplay: false
    }
  | {
      readonly discoveryId: string
      readonly kind: MonthlyAwardKind
      readonly title: string
      readonly achievedCount: number
      readonly targetCount: number
      readonly effectiveEarned: true
      readonly hasStoredAward: boolean
      readonly awardId: CanonicalAwardId
      readonly earnedOn?: LocalCalendarDate
      readonly hubAnnouncementAcked: boolean
      readonly cardViewed: boolean
      readonly cardDocumentId?: string
      readonly earnedCard?: EarnedScriptureCardSnapshot
      readonly hasCardDisplay: boolean
    }

/**
 * Combines stateless gateway discovery progress with durable local `earnedAwards`
 * without leaking unearned Card details.
 *
 * `effectiveEarned = gatewayDiscovery.isEarned || hasStoredAward(awardId)`.
 * When a discovery is effectively earned but its Card display snapshot is absent,
 * returns `effectiveEarned: true` and `hasCardDisplay: false` without fabricating art.
 */
export function combineGatewayProgressWithStoredAwards(
  progress: {
    readonly monthId: string
    readonly discoveries: readonly GatewayMonthProgressDiscoveryInput[]
  },
  data: ReaderParticipationData,
): readonly CombinedDiscoveryProgress[] {
  const monthId = parsePublicationYearMonth(progress.monthId)
  const results: CombinedDiscoveryProgress[] = []

  for (const discovery of progress.discoveries) {
    const parsedDiscovery = monthId
      ? parseCanonicalMonthlyDiscoveryId(discovery.discoveryId)
      : null

    if (
      !monthId
      || !parsedDiscovery
      || parsedDiscovery.publicationYearMonth !== monthId
      || parsedDiscovery.kind !== discovery.kind
    ) {
      results.push(
        Object.freeze({
          discoveryId: discovery.discoveryId,
          kind: discovery.kind,
          title: discovery.title,
          achievedCount: discovery.achievedCount,
          targetCount: discovery.targetCount,
          effectiveEarned: false,
          hasStoredAward: false,
          hasCardDisplay: false,
        }),
      )
      continue
    }

    const awardId = parsedDiscovery.awardId
    const storedAward = selectEarnedAward(data, awardId)
    const gatewayIsEarned = discovery.isEarned === true && discovery.awardId === awardId
    const effectiveEarned = gatewayIsEarned || storedAward !== undefined

    if (!effectiveEarned) {
      results.push(
        Object.freeze({
          discoveryId: parsedDiscovery.discoveryId,
          kind: parsedDiscovery.kind,
          title: discovery.title,
          achievedCount: discovery.achievedCount,
          targetCount: discovery.targetCount,
          effectiveEarned: false,
          hasStoredAward: false,
          hasCardDisplay: false,
        }),
      )
      continue
    }

    const gatewayCard = gatewayIsEarned
      ? validateEarnedCardSnapshot(discovery.earnedCard, monthId)
      : null
    const earnedCard = storedAward?.earnedCard ?? gatewayCard ?? undefined
    const cardDocumentId =
      storedAward?.cardDocumentId
      ?? earnedCard?.cardDocumentId
      ?? (gatewayIsEarned ? parseCardDocumentId(discovery.reservedCardId) ?? undefined : undefined)

    results.push(
      Object.freeze({
        discoveryId: parsedDiscovery.discoveryId,
        kind: parsedDiscovery.kind,
        title: discovery.title,
        achievedCount: discovery.achievedCount,
        targetCount: discovery.targetCount,
        effectiveEarned: true,
        hasStoredAward: storedAward !== undefined,
        awardId,
        ...(storedAward ? { earnedOn: storedAward.earnedOn } : {}),
        hubAnnouncementAcked: storedAward?.hubAnnouncementAcked ?? false,
        cardViewed: storedAward?.cardViewed ?? false,
        ...(cardDocumentId ? { cardDocumentId } : {}),
        ...(earnedCard ? { earnedCard } : {}),
        hasCardDisplay: earnedCard !== undefined,
      }),
    )
  }

  return Object.freeze(results)
}
