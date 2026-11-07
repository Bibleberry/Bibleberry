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

function sanitizeSeries(series: unknown): GatewayCatalogSummary['series'] | undefined {
  if (!series || typeof series !== 'object') return undefined
  const s = series as Record<string, unknown>
  if (typeof s._id !== 'string' || typeof s.title !== 'string' || typeof s.slug !== 'string') {
    return undefined
  }
  return {
    _id: s._id,
    title: s.title,
    slug: s.slug,
  }
}

function sanitizeScripture(scripture: unknown): Record<string, unknown> | null {
  if (!scripture || typeof scripture !== 'object') return null
  const s = scripture as Record<string, unknown>
  const result: Record<string, unknown> = {
    reference: String(s.reference ?? ''),
    translation: String(s.translation ?? ''),
    textStatus: String(s.textStatus ?? 'referenceOnly'),
    usageRightsConfirmed: Boolean(s.usageRightsConfirmed),
    practiceStatus: String(s.practiceStatus ?? 'notConfigured'),
  }
  if (typeof s.passage === 'string') {
    result.passage = s.passage
  }
  return result
}

function sanitizeCompanionLinks(links: unknown): Record<string, unknown>[] {
  if (!Array.isArray(links)) return []
  return links
    .filter(link => link && typeof link === 'object')
    .map(link => {
      const l = link as Record<string, unknown>
      const clean: Record<string, unknown> = {
        _key: String(l._key ?? ''),
        _type: 'companionLink',
        provider: String(l.provider ?? 'other'),
        label: String(l.label ?? ''),
      }
      if (typeof l.description === 'string') clean.description = l.description
      if (typeof l.url === 'string') clean.url = l.url
      if (typeof l.availability === 'string') clean.availability = l.availability
      return clean
    })
}

function sanitizePortableText(blocks: unknown): Record<string, unknown>[] {
  if (!Array.isArray(blocks)) return []
  return blocks
    .filter(b => b && typeof b === 'object' && (b as Record<string, unknown>)._type === 'block')
    .map(b => {
      const blk = b as Record<string, unknown>
      const clean: Record<string, unknown> = {
        _key: String(blk._key ?? ''),
        _type: 'block',
        style: String(blk.style ?? 'normal'),
        children: Array.isArray(blk.children)
          ? blk.children
              .filter(c => c && typeof c === 'object')
              .map(c => {
                const span = c as Record<string, unknown>
                return {
                  _key: String(span._key ?? ''),
                  _type: 'span',
                  text: String(span.text ?? ''),
                  marks: Array.isArray(span.marks) ? span.marks.map(String) : [],
                }
              })
          : [],
        markDefs: Array.isArray(blk.markDefs)
          ? blk.markDefs
              .filter(m => m && typeof m === 'object')
              .map(m => {
                const def = m as Record<string, unknown>
                return {
                  _key: String(def._key ?? ''),
                  _type: 'link',
                  href: String(def.href ?? ''),
                }
              })
          : [],
      }
      if (typeof blk.listItem === 'string') clean.listItem = blk.listItem
      if (typeof blk.level === 'number') clean.level = blk.level
      return clean
    })
}

function sanitizeBlock(rawBlock: Record<string, unknown>): Record<string, unknown> | null {
  const blockType = String(rawBlock._type ?? '')
  const key = String(rawBlock._key ?? '')
  if (!key || !blockType) return null

  const base: Record<string, unknown> = {
    _key: key,
    _type: blockType,
  }

  switch (blockType) {
    case 'statementBlock':
      base.text = String(rawBlock.text ?? '')
      if (typeof rawBlock.label === 'string') base.label = rawBlock.label
      return base

    case 'richTextBlock':
    case 'teachingText':
      base.body = sanitizePortableText(rawBlock.body)
      return base

    case 'scriptureBlock': {
      const s = sanitizeScripture(rawBlock.scripture)
      if (!s) return null
      base.scripture = s
      return base
    }

    case 'comparisonBlock':
    case 'contrast': {
      const left = rawBlock.left as Record<string, unknown> | undefined
      const right = rawBlock.right as Record<string, unknown> | undefined
      base.left = {
        title: String(left?.title ?? ''),
        body: sanitizePortableText(left?.body),
      }
      base.right = {
        title: String(right?.title ?? ''),
        body: sanitizePortableText(right?.body),
      }
      if (typeof rawBlock.footer === 'string') base.footer = rawBlock.footer
      if (typeof rawBlock.reviewStatus === 'string') base.reviewStatus = rawBlock.reviewStatus
      return base
    }

    case 'visualCardsBlock': {
      const cards = Array.isArray(rawBlock.cards) ? rawBlock.cards : []
      base.cards = cards
        .filter(c => c && typeof c === 'object')
        .map(c => {
          const card = c as Record<string, unknown>
          const cleanCard: Record<string, unknown> = {
            _key: String(card._key ?? ''),
            _type: 'visualCard',
            title: String(card.title ?? ''),
          }
          if (typeof card.body === 'string') cleanCard.body = card.body
          return cleanCard
        })
      if (typeof rawBlock.reviewStatus === 'string') base.reviewStatus = rawBlock.reviewStatus
      return base
    }

    case 'connectedSequenceBlock': {
      const steps = Array.isArray(rawBlock.steps) ? rawBlock.steps : []
      base.steps = steps
        .filter(s => s && typeof s === 'object')
        .map(s => {
          const step = s as Record<string, unknown>
          return {
            _key: String(step._key ?? ''),
            _type: 'sequenceStep',
            title: String(step.title ?? ''),
            body: String(step.body ?? ''),
          }
        })
      base.cycle = Boolean(rawBlock.cycle)
      if (typeof rawBlock.returnCaption === 'string') base.returnCaption = rawBlock.returnCaption
      if (typeof rawBlock.conclusion === 'string') base.conclusion = rawBlock.conclusion
      if (typeof rawBlock.reviewStatus === 'string') base.reviewStatus = rawBlock.reviewStatus
      return base
    }

    case 'reflectionBlock': {
      base.question = String(rawBlock.question ?? '')
      const choices = Array.isArray(rawBlock.choices) ? rawBlock.choices : []
      base.choices = choices
        .filter(c => c && typeof c === 'object')
        .map(c => {
          const choice = c as Record<string, unknown>
          return {
            _key: String(choice._key ?? ''),
            _type: 'reflectionChoice',
            label: String(choice.label ?? ''),
            prompt: String(choice.prompt ?? ''),
          }
        })
      if (typeof rawBlock.closing === 'string') base.closing = rawBlock.closing
      if (typeof rawBlock.reviewStatus === 'string') base.reviewStatus = rawBlock.reviewStatus
      return base
    }

    case 'optionalStudyBlock': {
      base.title = String(rawBlock.title ?? '')
      base.body = sanitizePortableText(rawBlock.body)
      const scriptures = Array.isArray(rawBlock.scriptures) ? rawBlock.scriptures : []
      base.scriptures = scriptures
        .map(s => sanitizeScripture(s))
        .filter((s): s is Record<string, unknown> => s !== null)
      if (typeof rawBlock.reviewStatus === 'string') base.reviewStatus = rawBlock.reviewStatus
      return base
    }

    case 'prayerBlock': {
      const paragraphs = Array.isArray(rawBlock.paragraphs) ? rawBlock.paragraphs : []
      base.paragraphs = paragraphs.map(String)
      return base
    }

    default:
      // Unknown block types are omitted
      return null
  }
}

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

function sanitizeScreens(screens: unknown): Record<string, unknown>[] {
  if (!Array.isArray(screens)) return []
  return screens
    .filter(s => s && typeof s === 'object')
    .map(s => {
      const screen = s as Record<string, unknown>
      const cleanBlocks: Record<string, unknown>[] = []
      if (Array.isArray(screen.blocks)) {
        for (const b of screen.blocks) {
          if (b && typeof b === 'object') {
            const clean = sanitizeBlock(b as Record<string, unknown>)
            if (clean) cleanBlocks.push(clean)
          }
        }
      }
      return {
        _key: String(screen._key ?? ''),
        _type: 'challengeScreen',
        screenLabel: String(screen.screenLabel ?? ''),
        heading: String(screen.heading ?? ''),
        blocks: cleanBlocks,
      }
    })
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

  // 4. If unapprovedBlockCount is supplied by GROQ, enforce it directly
  if (typeof doc.unapprovedBlockCount === 'number' && doc.unapprovedBlockCount > 0) {
    return { ok: false, reason: 'unapprovedBlocks' }
  }

  // 5. Screens must exist and contain zero unapproved structured blocks
  if (!validateScreenBlocks(doc.screens)) {
    return { ok: false, reason: 'unapprovedBlocks' }
  }

  const primaryScripture = sanitizeScripture(doc.primaryScripture)
  if (!primaryScripture) {
    return { ok: false, reason: 'malformedDocument' }
  }

  // 6. Deep allowlist projection: strictly copies allowed fields only
  const projected: Record<string, unknown> = {
    _id: String(doc._id),
    _type: 'challenge',
    title: String(doc.title ?? ''),
    slug: String(doc.slug ?? ''),
    challengeType: String(doc.challengeType ?? 'teaching'),
    sequence: Number(doc.sequence ?? 1),
    releaseAt: String(doc.releaseAt),
    primaryScripture,
    screens: sanitizeScreens(doc.screens),
    editorialEligibility: {
      adaptationReviewed: true,
      reviewedAt: String(eligibility.reviewedAt ?? ''),
    },
  }

  const series = sanitizeSeries(doc.series)
  if (series) projected.series = series

  if (typeof doc.summary === 'string') projected.summary = doc.summary

  if (Array.isArray(doc.companionLinks)) {
    projected.companionLinks = sanitizeCompanionLinks(doc.companionLinks)
  }

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

  // 4. If unapprovedBlockCount is present, any unapproved structured block fails closed
  if (typeof doc.unapprovedBlockCount === 'number' && doc.unapprovedBlockCount > 0) {
    return { ok: false, reason: 'unapprovedBlocks' }
  }

  // Also if screens array is directly present, validate them
  if (doc.screens !== undefined && !validateScreenBlocks(doc.screens)) {
    return { ok: false, reason: 'unapprovedBlocks' }
  }

  const primaryScripture = sanitizeScripture(doc.primaryScripture)
  if (!primaryScripture) {
    return { ok: false, reason: 'malformedDocument' }
  }

  const series = sanitizeSeries(doc.series)

  // 5. Deep allowlist projection
  const summary: GatewayCatalogSummary = {
    _id: String(doc._id),
    _type: 'challenge',
    title: String(doc.title ?? ''),
    slug: String(doc.slug ?? ''),
    challengeType: String(doc.challengeType ?? 'teaching'),
    sequence: Number(doc.sequence ?? 1),
    releaseAt: String(doc.releaseAt),
    primaryScripture,
    editorialEligibility: {
      adaptationReviewed: true,
      reviewedAt: String(eligibility.reviewedAt ?? ''),
    },
    ...(series ? { series } : {}),
    ...(typeof doc.summary === 'string' ? { summary: doc.summary } : {}),
  }

  return { ok: true, document: summary }
}
