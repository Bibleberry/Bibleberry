import type { GatewayCatalogSummary } from './types.ts'

export const REVIEWED_BLOCK_TYPES = new Set([
  'comparisonBlock',
  'visualCardsBlock',
  'connectedSequenceBlock',
  'reflectionBlock',
  'optionalStudyBlock',
])

export type ValidationFailureReason =
  | 'draftDocument'
  | 'unreviewed'
  | 'unapprovedBlocks'
  | 'embargoed'
  | 'invalidTimestamp'
  | 'malformedDocument'
  | 'missingScreens'

export type ProjectionValidationResult<T> =
  | { readonly ok: true; readonly document: T }
  | { readonly ok: false; readonly reason: ValidationFailureReason }

/**
 * Validates that all structured editorial blocks requiring approval have been approved.
 */
function validateScreenBlocks(screens: unknown): boolean {
  if (!Array.isArray(screens) || screens.length === 0) {
    return false
  }

  const seenKeys = new Set<string>()

  for (const screen of screens) {
    if (!screen || typeof screen !== 'object') return false
    const key = (screen as { _key?: unknown })._key
    if (typeof key !== 'string' || key.trim().length === 0) return false
    if (seenKeys.has(key)) return false
    seenKeys.add(key)

    const blocks = (screen as { blocks?: unknown }).blocks
    if (!Array.isArray(blocks)) return false

    for (const block of blocks) {
      if (!block || typeof block !== 'object') return false
      const blockType = (block as { _type?: unknown })._type
      if (typeof blockType === 'string' && REVIEWED_BLOCK_TYPES.has(blockType)) {
        const reviewStatus = (block as { reviewStatus?: unknown }).reviewStatus
        if (reviewStatus !== 'approved') {
          return false
        }
      }
    }
  }

  return true
}

/**
 * Server-side validation and sanitization for single Challenge responses.
 */
export function validateAndProjectChallenge(
  rawDoc: unknown,
  nowTime: number,
): ProjectionValidationResult<Record<string, unknown>> {
  if (!rawDoc || typeof rawDoc !== 'object') {
    return { ok: false, reason: 'malformedDocument' }
  }

  const doc = rawDoc as Record<string, unknown>

  // 1. Must not be a draft document
  const id = doc._id
  if (typeof id !== 'string' || id.startsWith('drafts.')) {
    return { ok: false, reason: 'draftDocument' }
  }

  // 2. Editorial adaptation must be approved
  const eligibility = doc.editorialEligibility as Record<string, unknown> | undefined
  if (eligibility?.adaptationReviewed !== true) {
    return { ok: false, reason: 'unreviewed' }
  }

  // 3. Release time must be defined and on/before now
  const releaseAt = doc.releaseAt
  if (typeof releaseAt !== 'string' || releaseAt.trim().length === 0) {
    return { ok: false, reason: 'invalidTimestamp' }
  }
  const releaseTime = Date.parse(releaseAt)
  if (!Number.isFinite(releaseTime)) {
    return { ok: false, reason: 'invalidTimestamp' }
  }
  if (releaseTime > nowTime) {
    return { ok: false, reason: 'embargoed' }
  }

  // 4. Screens must exist and contain zero unapproved structured blocks
  if (!validateScreenBlocks(doc.screens)) {
    return { ok: false, reason: 'unapprovedBlocks' }
  }

  // 5. Strict projection: allowlist only reader-safe fields
  const projected: Record<string, unknown> = {
    _id: doc._id,
    _type: 'challenge',
    title: doc.title,
    slug: doc.slug,
    challengeType: doc.challengeType,
    sequence: doc.sequence,
    releaseAt: doc.releaseAt,
    primaryScripture: doc.primaryScripture,
    screens: doc.screens,
    editorialEligibility: {
      adaptationReviewed: true,
      reviewedAt: eligibility.reviewedAt,
    },
  }

  if (doc.series) projected.series = doc.series
  if (typeof doc.summary === 'string') projected.summary = doc.summary
  if (Array.isArray(doc.companionLinks)) projected.companionLinks = doc.companionLinks

  return { ok: true, document: projected }
}

/**
 * Server-side validation and sanitization for catalog summary records.
 */
export function validateAndProjectCatalogSummary(
  rawDoc: unknown,
  nowTime: number,
): ProjectionValidationResult<GatewayCatalogSummary> {
  if (!rawDoc || typeof rawDoc !== 'object') {
    return { ok: false, reason: 'malformedDocument' }
  }

  const doc = rawDoc as Record<string, unknown>

  // 1. Must not be a draft document
  const id = doc._id
  if (typeof id !== 'string' || id.startsWith('drafts.')) {
    return { ok: false, reason: 'draftDocument' }
  }

  // 2. Editorial adaptation must be approved
  const eligibility = doc.editorialEligibility as Record<string, unknown> | undefined
  if (eligibility?.adaptationReviewed !== true) {
    return { ok: false, reason: 'unreviewed' }
  }

  // 3. Release time must be defined and on/before now
  const releaseAt = doc.releaseAt
  if (typeof releaseAt !== 'string' || releaseAt.trim().length === 0) {
    return { ok: false, reason: 'invalidTimestamp' }
  }
  const releaseTime = Date.parse(releaseAt)
  if (!Number.isFinite(releaseTime)) {
    return { ok: false, reason: 'invalidTimestamp' }
  }
  if (releaseTime > nowTime) {
    return { ok: false, reason: 'embargoed' }
  }

  // 4. Strict projection
  const summary: GatewayCatalogSummary = {
    _id: String(doc._id),
    _type: 'challenge',
    title: String(doc.title ?? ''),
    slug: String(doc.slug ?? ''),
    challengeType: String(doc.challengeType ?? 'teaching'),
    sequence: Number(doc.sequence ?? 1),
    releaseAt: String(doc.releaseAt),
    primaryScripture: doc.primaryScripture,
    editorialEligibility: {
      adaptationReviewed: true,
      reviewedAt: String(eligibility.reviewedAt ?? ''),
    },
    ...(doc.series ? { series: doc.series as GatewayCatalogSummary['series'] } : {}),
    ...(typeof doc.summary === 'string' ? { summary: doc.summary } : {}),
  }

  return { ok: true, document: summary }
}
