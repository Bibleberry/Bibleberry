import {
  YEAR_MONTH_PATTERN,
  computeAdvancePreviewStartDate,
  daysInMonth,
  formatCivilDate,
  isValidCivilDate,
  parseYearMonth,
} from './localRelease.ts'
import {
  isPlainObject,
  sanitizeBlock,
  sanitizePortableText,
  sanitizeScripture,
  validateScreenBlocks,
  type ProjectionValidationResult,
} from './projection.ts'
import type {
  GatewayCoverImage,
  GatewayEarnedScriptureCard,
  GatewayIntroductionScreen,
  GatewayLibraryMonthSummary,
  GatewayMonthDetailResponse,
  GatewayMonthDiscoverySummary,
  GatewayMonthPreviewResponse,
  GatewayMonthProgressDiscovery,
  GatewayMonthProgressResponse,
  GatewayMonthSlot,
  GatewayMonthSlotPreview,
  GatewayNewsArticle,
  GatewayNewsCategory,
  GatewayServerContext,
} from './types.ts'

export interface MonthlyProjectionOptions {
  readonly sanityProjectId?: string
  readonly sanityDataset?: string
}

const ALLOWED_REVIEWER_ROLES = new Set(['theological_editorial', 'technical_synthetic'])
const ALLOWED_INTRO_BLOCK_TYPES = new Set(['statementBlock', 'richTextBlock', 'scriptureBlock'])
const ALLOWED_CHALLENGE_TYPES = new Set(['teaching', 'discipline', 'reflection', 'memorization'])
const ALLOWED_NEWS_CATEGORIES = new Set<GatewayNewsCategory>([
  'monthlyPreview',
  'ministryUpdate',
  'announcement',
])
const SLUG_TOKEN_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const CARD_PLACEHOLDER_PATTERN = /^card-[a-z0-9]+(?:-[a-z0-9]+)*$/
const ASSET_REVISION_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,31}$/
const SANITY_IMAGE_PATH_PATTERN = /^\/images\/([a-z0-9]+)\/([a-z0-9_-]+)\/[a-zA-Z0-9._-]+$/
const NEWS_PREVIEW_ID_PATTERN = /^news-preview-(\d{4}-(?:0[1-9]|1[0-2]))$/

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

function isNotWithdrawnFlag(value: unknown): boolean {
  return value === undefined || value === null || value === false
}

function isValidEditorialReview(review: unknown): boolean {
  if (!isPlainObject(review)) return false
  if (typeof review.reviewedBy !== 'string' || review.reviewedBy.trim().length === 0) return false
  if (typeof review.reviewerRole !== 'string' || !ALLOWED_REVIEWER_ROLES.has(review.reviewerRole)) {
    return false
  }
  if (typeof review.reviewedAt !== 'string' || !Number.isFinite(Date.parse(review.reviewedAt))) {
    return false
  }
  return true
}

function sanitizeCoverImage(
  rawCoverImage: unknown,
): { ok: true; coverImage?: GatewayCoverImage } | { ok: false } {
  if (rawCoverImage === undefined || rawCoverImage === null) {
    return { ok: true }
  }
  if (!isPlainObject(rawCoverImage)) {
    return { ok: false }
  }
  if (rawCoverImage.url === undefined || rawCoverImage.url === null) {
    return { ok: true }
  }
  if (typeof rawCoverImage.url !== 'string' || rawCoverImage.url.trim().length === 0) {
    return { ok: false }
  }
  let parsedUrl: URL
  try {
    parsedUrl = new URL(rawCoverImage.url)
  } catch {
    return { ok: false }
  }
  if (parsedUrl.protocol !== 'https:') {
    return { ok: false }
  }
  if (typeof rawCoverImage.alt !== 'string' || rawCoverImage.alt.trim().length === 0) {
    return { ok: false }
  }
  return {
    ok: true,
    coverImage: {
      url: rawCoverImage.url,
      alt: rawCoverImage.alt.trim(),
    },
  }
}

function sanitizeIntroScreen(
  rawScreen: unknown,
  fallbackId: string,
): GatewayIntroductionScreen | null {
  if (!isPlainObject(rawScreen)) return null
  if (!Array.isArray(rawScreen.blocks) || rawScreen.blocks.length === 0) return null

  const cleanBlocks: Record<string, unknown>[] = []
  for (const rawBlock of rawScreen.blocks) {
    if (!isPlainObject(rawBlock)) return null
    const blockType = rawBlock._type
    if (typeof blockType !== 'string' || !ALLOWED_INTRO_BLOCK_TYPES.has(blockType)) {
      return null
    }
    const sanitized = sanitizeBlock(rawBlock)
    if (!sanitized) return null
    cleanBlocks.push(sanitized)
  }

  const id =
    typeof rawScreen._key === 'string' && rawScreen._key.trim().length > 0
      ? rawScreen._key.trim()
      : fallbackId
  const stepLabel =
    typeof rawScreen.screenLabel === 'string' && rawScreen.screenLabel.trim().length > 0
      ? rawScreen.screenLabel.trim()
      : undefined
  const title =
    typeof rawScreen.heading === 'string' && rawScreen.heading.trim().length > 0
      ? rawScreen.heading.trim()
      : undefined
  const ctaLabel =
    typeof rawScreen.ctaLabel === 'string' && rawScreen.ctaLabel.trim().length > 0
      ? rawScreen.ctaLabel.trim()
      : undefined

  return {
    id,
    ...(stepLabel ? { stepLabel } : {}),
    ...(title ? { title } : {}),
    ...(ctaLabel ? { ctaLabel } : {}),
    blocks: cleanBlocks,
  }
}

function computeIntroVersion(rosterVersion: number, seed: unknown): string {
  const serialized = JSON.stringify(seed)
  let hash = 0x811c9dc5
  for (let i = 0; i < serialized.length; i++) {
    hash ^= serialized.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return `v${rosterVersion}-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

interface NormalizedSlot {
  readonly dayOfMonth: number
  readonly date: string
  readonly status: 'active' | 'withdrawn'
  readonly baseChallengeId?: string
  readonly title?: string
  readonly slug?: string
  readonly challengeType?: string
}

interface ValidatedMonthBase {
  readonly yearMonth: string
  readonly documentId: string
  readonly year: number
  readonly month: number
  readonly daysInMonthCount: number
  readonly title: string
  readonly subtitle?: string
  readonly coverImage?: GatewayCoverImage
  readonly rosterVersion: number
  readonly finalizedChallengeIds: ReadonlySet<string>
  readonly previewScreens: readonly GatewayIntroductionScreen[]
  readonly welcomeScreen?: GatewayIntroductionScreen
  readonly slots: readonly NormalizedSlot[]
  readonly activeChallengeIds: ReadonlySet<string>
  readonly withdrawnChallengeIds: ReadonlySet<string>
}

function validateMonthlyBase(
  rawDoc: unknown,
  requestedYearMonth: string,
  authorizedLocalDate: string,
  options: { readonly requireWelcomeAndChallengeRoutes: boolean },
): ProjectionValidationResult<ValidatedMonthBase> {
  const parsedYM = parseYearMonth(requestedYearMonth)
  if (!parsedYM || !isValidCivilDate(authorizedLocalDate)) {
    return { ok: false, reason: 'invalidCalendarAssignment' }
  }

  if (!isPlainObject(rawDoc)) {
    return { ok: false, reason: 'malformedDocument' }
  }

  const doc = rawDoc
  const expectedDocId = `month-${requestedYearMonth}`

  if (typeof doc._id !== 'string' || doc._id.startsWith('drafts.') || doc._id !== expectedDocId) {
    return { ok: false, reason: 'invalidCalendarAssignment' }
  }
  if (doc.yearMonth !== requestedYearMonth) {
    return { ok: false, reason: 'invalidCalendarAssignment' }
  }
  if (doc.year !== parsedYM.year || doc.month !== parsedYM.month) {
    return { ok: false, reason: 'invalidCalendarAssignment' }
  }

  const title = typeof doc.title === 'string' ? doc.title.trim() : ''
  if (!title) {
    return { ok: false, reason: 'malformedDocument' }
  }
  const subtitle =
    typeof doc.subtitle === 'string' && doc.subtitle.trim().length > 0
      ? doc.subtitle.trim()
      : undefined

  if (doc.editorialStatus !== 'scheduled') {
    return { ok: false, reason: 'embargoed' }
  }
  if (!isNotWithdrawnFlag(doc.withdrawn)) {
    return { ok: false, reason: 'withdrawn' }
  }
  if (!isValidEditorialReview(doc.editorialReview)) {
    return { ok: false, reason: 'unreviewed' }
  }

  const coverCheck = sanitizeCoverImage(doc.coverImage)
  if (!coverCheck.ok) {
    return { ok: false, reason: 'malformedDocument' }
  }

  // Validate rosterFinalization
  if (!isPlainObject(doc.rosterFinalization)) {
    return { ok: false, reason: 'invalidCalendarAssignment' }
  }
  const rf = doc.rosterFinalization
  if (rf.isFinalized !== true) {
    return { ok: false, reason: 'invalidCalendarAssignment' }
  }
  if (
    typeof rf.rosterVersion !== 'number' ||
    !Number.isInteger(rf.rosterVersion) ||
    rf.rosterVersion < 1
  ) {
    return { ok: false, reason: 'invalidCalendarAssignment' }
  }
  const rosterVersion = rf.rosterVersion

  if (!Array.isArray(rf.finalizedChallengeIds)) {
    return { ok: false, reason: 'invalidCalendarAssignment' }
  }
  const finalizedChallengeIds = new Set<string>()
  for (const id of rf.finalizedChallengeIds) {
    if (
      typeof id !== 'string' ||
      id.trim().length === 0 ||
      id.startsWith('drafts.') ||
      finalizedChallengeIds.has(id)
    ) {
      return { ok: false, reason: 'invalidCalendarAssignment' }
    }
    finalizedChallengeIds.add(id)
  }

  // Validate slots: exact calendar length, deterministic order, no duplicates, verified Challenges
  const expectedDays = daysInMonth(parsedYM.year, parsedYM.month)
  if (!Array.isArray(doc.slots) || doc.slots.length !== expectedDays) {
    return { ok: false, reason: 'invalidCalendarAssignment' }
  }

  const seenChallengeIds = new Set<string>()
  const activeChallengeIds = new Set<string>()
  const withdrawnChallengeIds = new Set<string>()
  const normalizedSlots: NormalizedSlot[] = []

  for (let i = 0; i < expectedDays; i++) {
    const rawSlot = doc.slots[i]
    if (!isPlainObject(rawSlot)) {
      return { ok: false, reason: 'invalidCalendarAssignment' }
    }

    const expectedDay = i + 1
    const expectedKey = `day-${String(expectedDay).padStart(2, '0')}`
    const expectedDate = formatCivilDate(parsedYM.year, parsedYM.month, expectedDay)

    if (rawSlot._key !== undefined && rawSlot._key !== expectedKey) {
      return { ok: false, reason: 'invalidCalendarAssignment' }
    }
    if (rawSlot.dayOfMonth !== expectedDay || rawSlot.date !== expectedDate) {
      return { ok: false, reason: 'invalidCalendarAssignment' }
    }
    if (rawSlot.slotStatus !== 'scheduled' && rawSlot.slotStatus !== 'withdrawn') {
      return { ok: false, reason: 'invalidCalendarAssignment' }
    }

    const rawChallengeRef =
      typeof rawSlot.rawChallengeRef === 'string'
        ? rawSlot.rawChallengeRef.trim()
        : isPlainObject(rawSlot.challenge) && typeof rawSlot.challenge._ref === 'string'
          ? rawSlot.challenge._ref.trim()
          : undefined

    if (rawChallengeRef && rawChallengeRef.startsWith('drafts.')) {
      return { ok: false, reason: 'draftDocument' }
    }

    if (rawSlot.slotStatus === 'withdrawn') {
      if (rosterVersion === 1) {
        return { ok: false, reason: 'invalidCalendarAssignment' }
      }
      let withdrawnId = rawChallengeRef
      if (isPlainObject(rawSlot.challenge) && typeof rawSlot.challenge._id === 'string') {
        if (rawSlot.challenge._id.startsWith('drafts.')) {
          return { ok: false, reason: 'draftDocument' }
        }
        withdrawnId = rawSlot.challenge._id
      }
      if (withdrawnId) {
        if (seenChallengeIds.has(withdrawnId)) {
          return { ok: false, reason: 'duplicateSlotAssignment' }
        }
        seenChallengeIds.add(withdrawnId)
        withdrawnChallengeIds.add(withdrawnId)
      }
      normalizedSlots.push({
        dayOfMonth: expectedDay,
        date: expectedDate,
        status: 'withdrawn',
        ...(withdrawnId ? { baseChallengeId: withdrawnId } : {}),
      })
      continue
    }

    // Scheduled slot requires valid, published, reviewed, block-approved, licensed Challenge
    if (!isPlainObject(rawSlot.challenge)) {
      return { ok: false, reason: 'invalidCalendarAssignment' }
    }
    const ch = rawSlot.challenge
    if (typeof ch._id !== 'string' || ch._id.trim().length === 0 || ch._id.startsWith('drafts.')) {
      return { ok: false, reason: 'draftDocument' }
    }
    if (rawChallengeRef && rawChallengeRef !== ch._id) {
      return { ok: false, reason: 'invalidCalendarAssignment' }
    }
    if (seenChallengeIds.has(ch._id)) {
      return { ok: false, reason: 'duplicateSlotAssignment' }
    }
    seenChallengeIds.add(ch._id)

    if (ch.assignedMonthIds !== undefined) {
      if (
        !Array.isArray(ch.assignedMonthIds) ||
        ch.assignedMonthIds.length !== 1 ||
        ch.assignedMonthIds[0] !== expectedDocId
      ) {
        return { ok: false, reason: 'duplicateSlotAssignment' }
      }
    }

    // Emergency individual Challenge withdrawal suppresses immediately even before rosterVersion >= 2.
    // Check explicit withdrawal before content/review fields that may have been retracted alongside withdrawal.
    if (ch.withdrawn === true) {
      withdrawnChallengeIds.add(ch._id)
      normalizedSlots.push({
        dayOfMonth: expectedDay,
        date: expectedDate,
        status: 'withdrawn',
        baseChallengeId: ch._id,
      })
      continue
    }
    if (!isNotWithdrawnFlag(ch.withdrawn)) {
      return { ok: false, reason: 'malformedDocument' }
    }

    const eligibility = isPlainObject(ch.editorialEligibility) ? ch.editorialEligibility : undefined
    if (eligibility?.adaptationReviewed !== true) {
      return { ok: false, reason: 'unreviewed' }
    }
    if (
      typeof ch.unapprovedBlockCount !== 'number' ||
      !Number.isFinite(ch.unapprovedBlockCount) ||
      ch.unapprovedBlockCount !== 0
    ) {
      return { ok: false, reason: 'unapprovedBlocks' }
    }
    if (ch.screens !== undefined && !validateScreenBlocks(ch.screens)) {
      return { ok: false, reason: 'unapprovedBlocks' }
    }
    if (!sanitizeScripture(ch.primaryScripture)) {
      return { ok: false, reason: 'unlicensedScripture' }
    }

    const challengeTitle = typeof ch.title === 'string' ? ch.title.trim() : ''
    if (!challengeTitle) {
      return { ok: false, reason: 'malformedDocument' }
    }

    let challengeSlug: string | undefined
    let challengeType: string | undefined
    if (options.requireWelcomeAndChallengeRoutes) {
      challengeSlug = typeof ch.slug === 'string' ? ch.slug.trim() : ''
      if (!challengeSlug) {
        return { ok: false, reason: 'malformedDocument' }
      }
      if (typeof ch.challengeType !== 'string' || !ALLOWED_CHALLENGE_TYPES.has(ch.challengeType)) {
        return { ok: false, reason: 'malformedDocument' }
      }
      challengeType = ch.challengeType
    }

    activeChallengeIds.add(ch._id)
    normalizedSlots.push({
      dayOfMonth: expectedDay,
      date: expectedDate,
      status: 'active',
      baseChallengeId: ch._id,
      title: challengeTitle,
      ...(challengeSlug ? { slug: challengeSlug } : {}),
      ...(challengeType ? { challengeType } : {}),
    })
  }

  if (activeChallengeIds.size === 0) {
    return { ok: false, reason: 'invalidCalendarAssignment' }
  }

  // Verify rosterFinalization matches slots (active slots must all be finalized; finalized IDs must belong to this month's slots)
  for (const activeId of activeChallengeIds) {
    if (!finalizedChallengeIds.has(activeId)) {
      return { ok: false, reason: 'invalidCalendarAssignment' }
    }
  }
  for (const finalizedId of finalizedChallengeIds) {
    if (!activeChallengeIds.has(finalizedId) && !withdrawnChallengeIds.has(finalizedId)) {
      return { ok: false, reason: 'invalidCalendarAssignment' }
    }
  }

  // Validate introduction
  if (!isPlainObject(doc.introduction) || !Array.isArray(doc.introduction.previewScreens)) {
    return { ok: false, reason: 'malformedDocument' }
  }
  if (doc.introduction.previewScreens.length === 0) {
    return { ok: false, reason: 'malformedDocument' }
  }

  const previewScreens: GatewayIntroductionScreen[] = []
  for (let i = 0; i < doc.introduction.previewScreens.length; i++) {
    const clean = sanitizeIntroScreen(doc.introduction.previewScreens[i], `intro-${i + 1}`)
    if (!clean) {
      return { ok: false, reason: 'malformedDocument' }
    }
    previewScreens.push(clean)
  }

  let welcomeScreen: GatewayIntroductionScreen | undefined
  if (options.requireWelcomeAndChallengeRoutes) {
    const cleanWelcome = sanitizeIntroScreen(doc.introduction.welcomeScreen, 'welcome')
    if (!cleanWelcome) {
      return { ok: false, reason: 'malformedDocument' }
    }
    welcomeScreen = cleanWelcome
  }

  return {
    ok: true,
    document: {
      yearMonth: requestedYearMonth,
      documentId: expectedDocId,
      year: parsedYM.year,
      month: parsedYM.month,
      daysInMonthCount: expectedDays,
      title,
      ...(subtitle ? { subtitle } : {}),
      ...(coverCheck.coverImage ? { coverImage: coverCheck.coverImage } : {}),
      rosterVersion,
      finalizedChallengeIds,
      previewScreens,
      ...(welcomeScreen ? { welcomeScreen } : {}),
      slots: normalizedSlots,
      activeChallengeIds,
      withdrawnChallengeIds,
    },
  }
}

function sanitizeCardArtworkUrl(
  rawArtwork: unknown,
  options?: MonthlyProjectionOptions,
): { ok: true; url: string } | { ok: false } {
  if (!isPlainObject(rawArtwork) || typeof rawArtwork.url !== 'string') {
    return { ok: false }
  }
  const urlStr = rawArtwork.url.trim()
  if (!urlStr) {
    return { ok: false }
  }
  let parsed: URL
  try {
    parsed = new URL(urlStr)
  } catch {
    return { ok: false }
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.search !== '' ||
    parsed.hash !== '' ||
    parsed.hostname !== 'cdn.sanity.io'
  ) {
    return { ok: false }
  }
  const pathMatch = SANITY_IMAGE_PATH_PATTERN.exec(parsed.pathname)
  if (!pathMatch) {
    return { ok: false }
  }
  if (options?.sanityProjectId && pathMatch[1] !== options.sanityProjectId) {
    return { ok: false }
  }
  if (options?.sanityDataset && pathMatch[2] !== options.sanityDataset) {
    return { ok: false }
  }
  return { ok: true, url: urlStr }
}

function sanitizeOptionalStringArray(
  raw: unknown,
): { ok: true; values?: readonly string[] } | { ok: false } {
  if (raw === undefined || raw === null) {
    return { ok: true }
  }
  if (!Array.isArray(raw)) {
    return { ok: false }
  }
  const values: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'string' || item.trim().length === 0) {
      return { ok: false }
    }
    const trimmed = item.trim()
    const key = trimmed.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      values.push(trimmed)
    }
  }
  return { ok: true, values: values.length > 0 ? values : undefined }
}

type LinkedCardValidationResult =
  | { readonly linked: false }
  | { readonly linked: true; readonly cardId?: string; readonly card?: GatewayEarnedScriptureCard }

/**
 * Validates and projects an optional linked `scriptureCard` reference.
 * Fails closed (`card: undefined`) on any invalid/draft/unapproved/withdrawn/mislinked
 * card so invalid card art/text never leaks while unrelated month access stays intact.
 */
function validateAndProjectLinkedCard(
  container: Record<string, unknown>,
  expectedCategory: 'monthlyThematic' | 'monthlyFull',
  monthYearMonth: string,
  legacyReservedCardId: string | undefined,
  options?: MonthlyProjectionOptions,
): LinkedCardValidationResult {
  const rawCardRef =
    typeof container.rawCardRef === 'string'
      ? container.rawCardRef.trim()
      : isPlainObject(container.card) && typeof container.card._ref === 'string'
        ? container.card._ref.trim()
        : undefined

  const hasRawRef = rawCardRef !== undefined && rawCardRef.length > 0
  const hasCardField = container.card !== undefined && container.card !== null

  if (!hasRawRef && !hasCardField) {
    return { linked: false }
  }

  if (hasRawRef && (rawCardRef.startsWith('drafts.') || !CARD_PLACEHOLDER_PATTERN.test(rawCardRef))) {
    return { linked: true }
  }

  if (!isPlainObject(container.card)) {
    return { linked: true, ...(hasRawRef ? { cardId: rawCardRef } : {}) }
  }

  const card = container.card
  const cardId = typeof card._id === 'string' ? card._id.trim() : ''
  if (!cardId || cardId.startsWith('drafts.') || !CARD_PLACEHOLDER_PATTERN.test(cardId)) {
    return { linked: true, ...(hasRawRef ? { cardId: rawCardRef } : {}) }
  }

  if (hasRawRef && rawCardRef !== cardId) {
    return { linked: true, cardId }
  }
  if (legacyReservedCardId && legacyReservedCardId !== cardId) {
    return { linked: true, cardId }
  }
  if (card._type !== 'scriptureCard') {
    return { linked: true, cardId }
  }

  const slug =
    typeof card.slug === 'string'
      ? card.slug.trim()
      : isPlainObject(card.slug) && typeof card.slug.current === 'string'
        ? card.slug.current.trim()
        : ''
  if (!SLUG_TOKEN_PATTERN.test(slug) || cardId !== `card-${slug}`) {
    return { linked: true, cardId }
  }

  if (card.editorialStatus !== 'approved' || !isNotWithdrawnFlag(card.withdrawn)) {
    return { linked: true, cardId }
  }
  if (!isValidEditorialReview(card.editorialReview)) {
    return { linked: true, cardId }
  }
  if (card.cardCategory !== expectedCategory) {
    return { linked: true, cardId }
  }

  if (
    card.plannedYearMonth !== undefined &&
    card.plannedYearMonth !== null &&
    card.plannedYearMonth !== ''
  ) {
    if (
      typeof card.plannedYearMonth !== 'string' ||
      !YEAR_MONTH_PATTERN.test(card.plannedYearMonth.trim()) ||
      card.plannedYearMonth.trim() !== monthYearMonth
    ) {
      return { linked: true, cardId }
    }
  }

  const title = typeof card.title === 'string' ? card.title.trim() : ''
  const assetRevision = typeof card.assetRevision === 'string' ? card.assetRevision.trim() : ''
  if (!title || !ASSET_REVISION_PATTERN.test(assetRevision)) {
    return { linked: true, cardId }
  }

  const artworkCheck = sanitizeCardArtworkUrl(card.artwork, options)
  if (!artworkCheck.ok) {
    return { linked: true, cardId }
  }

  const illustrationAlt =
    typeof card.illustrationAlt === 'string' ? card.illustrationAlt.trim() : ''
  const accessibleTranscription =
    typeof card.accessibleTranscription === 'string' ? card.accessibleTranscription.trim() : ''
  if (
    !illustrationAlt ||
    !accessibleTranscription ||
    illustrationAlt.toLowerCase() === accessibleTranscription.toLowerCase()
  ) {
    return { linked: true, cardId }
  }

  if (!isPlainObject(card.scriptureCitation)) {
    return { linked: true, cardId }
  }
  const citation = card.scriptureCitation
  const book = typeof citation.book === 'string' ? citation.book.trim() : ''
  const reference = typeof citation.reference === 'string' ? citation.reference.trim() : ''
  const translation = typeof citation.translation === 'string' ? citation.translation.trim() : ''
  if (!book || !reference || !translation) {
    return { linked: true, cardId }
  }
  if (
    citation.usageRightsConfirmed !== undefined &&
    citation.usageRightsConfirmed !== null &&
    typeof citation.usageRightsConfirmed !== 'boolean'
  ) {
    return { linked: true, cardId }
  }
  if (translation.toLowerCase() !== 'not configured' && citation.usageRightsConfirmed !== true) {
    return { linked: true, cardId }
  }

  if (!isPlainObject(card.rightsAndAttribution)) {
    return { linked: true, cardId }
  }
  const rights = card.rightsAndAttribution
  const attribution = typeof rights.attribution === 'string' ? rights.attribution.trim() : ''
  const rightsStatus = typeof rights.rightsStatus === 'string' ? rights.rightsStatus.trim() : ''
  if (!attribution || !rightsStatus || rights.usageRightsConfirmed !== true) {
    return { linked: true, cardId }
  }

  let shareEligible = true
  if (card.shareEligible !== undefined && card.shareEligible !== null) {
    if (typeof card.shareEligible !== 'boolean') {
      return { linked: true, cardId }
    }
    shareEligible = card.shareEligible
  }

  const themesCheck = sanitizeOptionalStringArray(card.theologicalThemes)
  const keywordsCheck = sanitizeOptionalStringArray(card.keywords)
  if (!themesCheck.ok || !keywordsCheck.ok) {
    return { linked: true, cardId }
  }

  return {
    linked: true,
    cardId,
    card: {
      cardDocumentId: cardId,
      title,
      publicationYearMonth: monthYearMonth,
      imageUrl: artworkCheck.url,
      assetRevision,
      illustrationAlt,
      accessibleTranscription,
      scripture: {
        book,
        reference,
        translation,
      },
      attribution,
      rightsStatus,
      shareEligible,
      ...(themesCheck.values ? { theologicalThemes: themesCheck.values } : {}),
      ...(keywordsCheck.values ? { keywords: keywordsCheck.values } : {}),
    },
  }
}

interface NormalizedDiscovery {
  readonly discoveryId: string
  readonly discoverySlug: string
  readonly title: string
  readonly activeQualifyingIds: readonly string[]
  readonly reservedCardId?: string
  readonly linkedCardId?: string
  /** Internal only (R13-VERIFY1): a Card reference/field is present, even if it failed closed. */
  readonly cardLinked?: boolean
  readonly earnedCard?: GatewayEarnedScriptureCard
}

interface ValidatedDiscoveries {
  readonly thematic: readonly NormalizedDiscovery[]
  readonly fullMonthTitle: string
  readonly fullMonthReservedCardId?: string
  /** Internal only (R13-VERIFY1): linked Card reference even when its projection failed closed. */
  readonly fullMonthLinkedCardId?: string
  readonly fullMonthCardLinked?: boolean
  readonly fullMonthEarnedCard?: GatewayEarnedScriptureCard
}

function validateDiscoveriesAndFullMonth(
  doc: Record<string, unknown>,
  base: ValidatedMonthBase,
  options?: MonthlyProjectionOptions,
): ProjectionValidationResult<ValidatedDiscoveries> {
  const rawDiscoveries = doc.discoveries === undefined || doc.discoveries === null ? [] : doc.discoveries
  if (!Array.isArray(rawDiscoveries)) {
    return { ok: false, reason: 'malformedDocument' }
  }

  const seenSlugs = new Set<string>()
  const cardIdCounts = new Map<string, number>()
  const rawThematic: NormalizedDiscovery[] = []

  for (const rawDisc of rawDiscoveries) {
    if (!isPlainObject(rawDisc)) {
      return { ok: false, reason: 'malformedDocument' }
    }
    const discoverySlug = typeof rawDisc.discoverySlug === 'string' ? rawDisc.discoverySlug.trim() : ''
    if (!SLUG_TOKEN_PATTERN.test(discoverySlug) || seenSlugs.has(discoverySlug)) {
      return { ok: false, reason: 'malformedDocument' }
    }
    seenSlugs.add(discoverySlug)

    const discTitle = typeof rawDisc.title === 'string' ? rawDisc.title.trim() : ''
    if (!discTitle) {
      return { ok: false, reason: 'malformedDocument' }
    }

    const rawQualifying = Array.isArray(rawDisc.qualifyingChallengeIds)
      ? rawDisc.qualifyingChallengeIds
      : Array.isArray(rawDisc.qualifyingChallenges)
        ? rawDisc.qualifyingChallenges
        : null

    if (!rawQualifying || rawQualifying.length === 0) {
      return { ok: false, reason: 'malformedDocument' }
    }

    const seenRefs = new Set<string>()
    const activeQualifyingIds: string[] = []
    for (const entry of rawQualifying) {
      const ref =
        typeof entry === 'string'
          ? entry.trim()
          : isPlainObject(entry) && typeof entry._ref === 'string'
            ? entry._ref.trim()
            : ''
      if (!ref || ref.startsWith('drafts.') || seenRefs.has(ref)) {
        return { ok: false, reason: 'invalidCalendarAssignment' }
      }
      seenRefs.add(ref)

      // V-DISC-SUBSET: qualifying refs must be in the finalized month roster
      if (!base.finalizedChallengeIds.has(ref)) {
        return { ok: false, reason: 'invalidCalendarAssignment' }
      }
      if (base.activeChallengeIds.has(ref)) {
        activeQualifyingIds.push(ref)
      }
    }

    let reservedCardId: string | undefined
    if (
      rawDisc.reservedCardId !== undefined &&
      rawDisc.reservedCardId !== null &&
      rawDisc.reservedCardId !== ''
    ) {
      if (
        typeof rawDisc.reservedCardId !== 'string' ||
        !CARD_PLACEHOLDER_PATTERN.test(rawDisc.reservedCardId)
      ) {
        return { ok: false, reason: 'malformedDocument' }
      }
      reservedCardId = rawDisc.reservedCardId
    }

    const cardCheck = validateAndProjectLinkedCard(
      rawDisc,
      'monthlyThematic',
      base.yearMonth,
      reservedCardId,
      options,
    )
    const linkedCardId = cardCheck.linked ? cardCheck.cardId : undefined
    if (linkedCardId) {
      cardIdCounts.set(linkedCardId, (cardIdCounts.get(linkedCardId) ?? 0) + 1)
    }

    rawThematic.push({
      discoveryId: `discovery:${base.yearMonth}:${discoverySlug}`,
      discoverySlug,
      title: discTitle,
      activeQualifyingIds,
      ...(reservedCardId ? { reservedCardId } : {}),
      ...(linkedCardId ? { linkedCardId } : {}),
      ...(cardCheck.linked ? { cardLinked: true } : {}),
      ...(cardCheck.linked && cardCheck.card ? { earnedCard: cardCheck.card } : {}),
    })
  }

  let fullMonthTitle = `Complete ${MONTH_NAMES[base.month - 1]}`
  let fullMonthReservedCardId: string | undefined
  let fullMonthLinkedCardId: string | undefined
  let fullMonthCardLinked = false
  let fullMonthEarnedCard: GatewayEarnedScriptureCard | undefined

  if (doc.fullMonthCard !== undefined && doc.fullMonthCard !== null) {
    if (!isPlainObject(doc.fullMonthCard)) {
      return { ok: false, reason: 'malformedDocument' }
    }
    if (typeof doc.fullMonthCard.title === 'string' && doc.fullMonthCard.title.trim().length > 0) {
      fullMonthTitle = doc.fullMonthCard.title.trim()
    }
    if (
      doc.fullMonthCard.reservedCardId !== undefined &&
      doc.fullMonthCard.reservedCardId !== null &&
      doc.fullMonthCard.reservedCardId !== ''
    ) {
      if (
        typeof doc.fullMonthCard.reservedCardId !== 'string' ||
        !CARD_PLACEHOLDER_PATTERN.test(doc.fullMonthCard.reservedCardId)
      ) {
        return { ok: false, reason: 'malformedDocument' }
      }
      fullMonthReservedCardId = doc.fullMonthCard.reservedCardId
    }

    const fullCardCheck = validateAndProjectLinkedCard(
      doc.fullMonthCard,
      'monthlyFull',
      base.yearMonth,
      fullMonthReservedCardId,
      options,
    )
    if (fullCardCheck.linked) {
      fullMonthCardLinked = true
      fullMonthLinkedCardId = fullCardCheck.cardId
      if (fullMonthLinkedCardId) {
        cardIdCounts.set(fullMonthLinkedCardId, (cardIdCounts.get(fullMonthLinkedCardId) ?? 0) + 1)
      }
      fullMonthEarnedCard = fullCardCheck.card
    }
  }

  // Fail closed on intra-month duplicate card references across discoveries & fullMonthCard
  const thematic: NormalizedDiscovery[] = rawThematic.map(item => {
    if (item.linkedCardId && (cardIdCounts.get(item.linkedCardId) ?? 0) > 1) {
      const { earnedCard: _omitted, ...rest } = item
      void _omitted
      return rest
    }
    return item
  })

  if (fullMonthLinkedCardId && (cardIdCounts.get(fullMonthLinkedCardId) ?? 0) > 1) {
    fullMonthEarnedCard = undefined
  }

  return {
    ok: true,
    document: {
      thematic,
      fullMonthTitle,
      ...(fullMonthReservedCardId ? { fullMonthReservedCardId } : {}),
      ...(fullMonthLinkedCardId ? { fullMonthLinkedCardId } : {}),
      ...(fullMonthCardLinked ? { fullMonthCardLinked } : {}),
      ...(fullMonthEarnedCard ? { fullMonthEarnedCard } : {}),
    },
  }
}

/**
 * Validates and projects `GET /api/months/:yearMonth/preview`.
 * Fails closed (`embargoed` / 404) before `computeAdvancePreviewStartDate(year, month)`.
 */
export function validateAndProjectMonthPreview(
  rawDoc: unknown,
  requestedYearMonth: string,
  serverContext: GatewayServerContext,
): ProjectionValidationResult<GatewayMonthPreviewResponse> {
  const baseResult = validateMonthlyBase(
    rawDoc,
    requestedYearMonth,
    serverContext.authorizedLocalDate,
    { requireWelcomeAndChallengeRoutes: false },
  )
  if (!baseResult.ok) {
    return baseResult
  }

  const base = baseResult.document
  const previewStartDate = computeAdvancePreviewStartDate(base.year, base.month)
  if (serverContext.authorizedLocalDate < previewStartDate) {
    return { ok: false, reason: 'embargoed' }
  }

  const slots: GatewayMonthSlotPreview[] = base.slots.map(slot => {
    if (slot.status === 'withdrawn' || !slot.title) {
      return {
        dayOfMonth: slot.dayOfMonth,
        date: slot.date,
        availability: 'unavailable',
      }
    }
    return {
      dayOfMonth: slot.dayOfMonth,
      date: slot.date,
      title: slot.title,
      availability: 'comingSoon',
    }
  })

  return {
    ok: true,
    document: {
      ok: true,
      serverContext,
      month: {
        monthId: base.yearMonth,
        documentId: base.documentId,
        year: base.year,
        month: base.month,
        daysInMonth: base.daysInMonthCount,
        phase: 'advancePreview',
        monthStartsOn: `${base.yearMonth}-01`,
        title: base.title,
        ...(base.subtitle ? { subtitle: base.subtitle } : {}),
        ...(base.coverImage ? { coverImage: base.coverImage } : {}),
        introduction: {
          version: computeIntroVersion(base.rosterVersion, base.previewScreens),
          previewScreens: base.previewScreens,
        },
        slots,
      },
    },
  }
}

/**
 * Validates and projects `GET /api/months/:yearMonth`.
 * Fails closed (`embargoed` / 404) before `${yearMonth}-01`.
 */
export function validateAndProjectMonthDetail(
  rawDoc: unknown,
  requestedYearMonth: string,
  serverContext: GatewayServerContext,
  options?: MonthlyProjectionOptions,
): ProjectionValidationResult<GatewayMonthDetailResponse> {
  const baseResult = validateMonthlyBase(
    rawDoc,
    requestedYearMonth,
    serverContext.authorizedLocalDate,
    { requireWelcomeAndChallengeRoutes: true },
  )
  if (!baseResult.ok) {
    return baseResult
  }

  const base = baseResult.document
  const monthStartDate = `${base.yearMonth}-01`
  if (serverContext.authorizedLocalDate < monthStartDate) {
    return { ok: false, reason: 'embargoed' }
  }

  const discResult = validateDiscoveriesAndFullMonth(rawDoc as Record<string, unknown>, base, options)
  if (!discResult.ok) {
    return discResult
  }

  const phase: 'active' | 'historical' =
    serverContext.authorizedLocalDate.slice(0, 7) > base.yearMonth ? 'historical' : 'active'

  const slots: GatewayMonthSlot[] = base.slots.map(slot => {
    if (slot.status === 'withdrawn') {
      const canShowFormerId =
        slot.date <= serverContext.authorizedLocalDate && Boolean(slot.baseChallengeId)
      return {
        dayOfMonth: slot.dayOfMonth,
        date: slot.date,
        availability: 'unavailable',
        ...(canShowFormerId ? { formerChallengeId: `cms:${slot.baseChallengeId}` } : {}),
      }
    }

    if (slot.date <= serverContext.authorizedLocalDate) {
      return {
        dayOfMonth: slot.dayOfMonth,
        date: slot.date,
        availability: 'available',
        title: slot.title!,
        slug: slot.slug!,
        challengeId: `cms:${slot.baseChallengeId!}`,
        challengeType: slot.challengeType!,
      }
    }

    return {
      dayOfMonth: slot.dayOfMonth,
      date: slot.date,
      availability: 'comingSoon',
      title: slot.title!,
    }
  })

  const discoveries: GatewayMonthDiscoverySummary[] = [
    ...discResult.document.thematic.map(d => ({
      discoveryId: d.discoveryId,
      kind: 'thematic' as const,
      title: d.title,
      targetCount: d.activeQualifyingIds.length,
    })),
    {
      discoveryId: `discovery:${base.yearMonth}:full-month`,
      kind: 'fullMonth',
      title: discResult.document.fullMonthTitle,
      targetCount: base.activeChallengeIds.size,
    },
  ]

  return {
    ok: true,
    document: {
      ok: true,
      serverContext,
      month: {
        monthId: base.yearMonth,
        documentId: base.documentId,
        year: base.year,
        month: base.month,
        daysInMonth: base.daysInMonthCount,
        phase,
        rosterVersion: base.rosterVersion,
        totalChallenges: base.activeChallengeIds.size,
        title: base.title,
        ...(base.subtitle ? { subtitle: base.subtitle } : {}),
        ...(base.coverImage ? { coverImage: base.coverImage } : {}),
        introduction: {
          version: computeIntroVersion(base.rosterVersion, {
            previewScreens: base.previewScreens,
            welcomeScreen: base.welcomeScreen,
          }),
          previewScreens: base.previewScreens,
          welcomeScreen: base.welcomeScreen!,
        },
        slots,
        discoveries,
      },
    },
  }
}

/**
 * Statelessly calculates monthly completion and discovery progress for
 * `POST /api/months/:yearMonth/progress` by intersecting submitted IDs strictly
 * with active, non-withdrawn, already-released slots (`slot.date <= authorizedLocalDate`).
 */
export function evaluateMonthProgress(
  rawDoc: unknown,
  requestedYearMonth: string,
  serverContext: GatewayServerContext,
  completedChallengeIds: readonly string[],
  options?: MonthlyProjectionOptions,
): ProjectionValidationResult<GatewayMonthProgressResponse> {
  const baseResult = validateMonthlyBase(
    rawDoc,
    requestedYearMonth,
    serverContext.authorizedLocalDate,
    { requireWelcomeAndChallengeRoutes: true },
  )
  if (!baseResult.ok) {
    return baseResult
  }

  const base = baseResult.document
  if (serverContext.authorizedLocalDate < `${base.yearMonth}-01`) {
    return { ok: false, reason: 'embargoed' }
  }

  const discResult = validateDiscoveriesAndFullMonth(rawDoc as Record<string, unknown>, base, options)
  if (!discResult.ok) {
    return discResult
  }

  // Only active, non-withdrawn slots whose civil date <= authorizedLocalDate can count.
  const releasedCanonicalToBase = new Map<string, string>()
  for (const slot of base.slots) {
    if (
      slot.status === 'active' &&
      slot.baseChallengeId &&
      slot.date <= serverContext.authorizedLocalDate
    ) {
      releasedCanonicalToBase.set(`cms:${slot.baseChallengeId}`, slot.baseChallengeId)
    }
  }

  const completedReleasedBaseIds = new Set<string>()
  for (const submittedId of completedChallengeIds) {
    const baseId = releasedCanonicalToBase.get(submittedId.trim())
    if (baseId) {
      completedReleasedBaseIds.add(baseId)
    }
  }

  const completedInMonthCount = completedReleasedBaseIds.size
  const totalChallenges = base.activeChallengeIds.size

  let thematicEarnedCount = 0
  const thematicResults: GatewayMonthProgressDiscovery[] = discResult.document.thematic.map(d => {
    const targetCount = d.activeQualifyingIds.length
    const achievedCount = d.activeQualifyingIds.filter(id => completedReleasedBaseIds.has(id)).length
    const isEarned = targetCount > 0 && achievedCount >= targetCount
    if (isEarned) {
      thematicEarnedCount += 1
    }
    return {
      discoveryId: d.discoveryId,
      kind: 'thematic',
      title: d.title,
      achievedCount,
      targetCount,
      isEarned,
      ...(isEarned
        ? {
            awardId: `card:monthly:${base.yearMonth}:${d.discoverySlug}`,
            ...(d.reservedCardId ? { reservedCardId: d.reservedCardId } : {}),
            ...(d.earnedCard ? { earnedCard: d.earnedCard } : {}),
          }
        : {}),
    }
  })

  const fullMonthEarned = totalChallenges > 0 && completedInMonthCount >= totalChallenges
  const fullMonthResult: GatewayMonthProgressDiscovery = {
    discoveryId: `discovery:${base.yearMonth}:full-month`,
    kind: 'fullMonth',
    title: discResult.document.fullMonthTitle,
    achievedCount: completedInMonthCount,
    targetCount: totalChallenges,
    isEarned: fullMonthEarned,
    ...(fullMonthEarned
      ? {
          awardId: `card:monthly:${base.yearMonth}:full-month`,
          ...(discResult.document.fullMonthReservedCardId
            ? { reservedCardId: discResult.document.fullMonthReservedCardId }
            : {}),
          ...(discResult.document.fullMonthEarnedCard
            ? { earnedCard: discResult.document.fullMonthEarnedCard }
            : {}),
        }
      : {}),
  }

  return {
    ok: true,
    document: {
      ok: true,
      serverContext,
      monthId: base.yearMonth,
      rosterVersion: base.rosterVersion,
      completedInMonthCount,
      totalChallenges,
      thematicEarnedCount,
      thematicTotalCount: thematicResults.length,
      discoveries: [...thematicResults, fullMonthResult],
    },
  }
}

/**
 * Validates and projects a single `newsArticle` for `GET /api/news`.
 * Enforces editorial review, publishOnDate <= authorizedLocalDate, withdrawal,
 * and advance-preview eligibility on `monthlyPreview` articles.
 */
export function validateAndProjectNewsArticle(
  rawDoc: unknown,
  authorizedLocalDate: string,
  categoryFilter?: GatewayNewsCategory,
): ProjectionValidationResult<GatewayNewsArticle> {
  if (!isValidCivilDate(authorizedLocalDate) || !isPlainObject(rawDoc)) {
    return { ok: false, reason: 'malformedDocument' }
  }

  const doc = rawDoc
  const id = doc._id
  if (typeof id !== 'string' || id.trim().length === 0 || id.startsWith('drafts.')) {
    return { ok: false, reason: 'draftDocument' }
  }

  if (!isNotWithdrawnFlag(doc.withdrawn)) {
    return { ok: false, reason: 'withdrawn' }
  }

  if (!isValidEditorialReview(doc.editorialReview)) {
    return { ok: false, reason: 'unreviewed' }
  }

  const category = doc.category
  if (typeof category !== 'string' || !ALLOWED_NEWS_CATEGORIES.has(category as GatewayNewsCategory)) {
    return { ok: false, reason: 'malformedDocument' }
  }
  const typedCategory = category as GatewayNewsCategory
  if (categoryFilter && typedCategory !== categoryFilter) {
    return { ok: false, reason: 'malformedDocument' }
  }

  const title = typeof doc.title === 'string' ? doc.title.trim() : ''
  const slug = typeof doc.slug === 'string' ? doc.slug.trim() : ''
  const summary = typeof doc.summary === 'string' ? doc.summary.trim() : ''
  if (!title || !slug || !summary) {
    return { ok: false, reason: 'malformedDocument' }
  }

  if (!isValidCivilDate(doc.publishOnDate)) {
    return { ok: false, reason: 'invalidTimestamp' }
  }
  if (doc.publishOnDate > authorizedLocalDate) {
    return { ok: false, reason: 'embargoed' }
  }

  if (typedCategory === 'monthlyPreview') {
    const idMatch = NEWS_PREVIEW_ID_PATTERN.exec(id)
    if (!idMatch) {
      return { ok: false, reason: 'invalidCalendarAssignment' }
    }
    const expectedYearMonth = idMatch[1]
    const parsedYM = parseYearMonth(expectedYearMonth)
    if (!parsedYM) {
      return { ok: false, reason: 'invalidCalendarAssignment' }
    }

    if (!isPlainObject(doc.relatedMonth)) {
      return { ok: false, reason: 'invalidCalendarAssignment' }
    }
    const rm = doc.relatedMonth
    if (
      typeof rm._id !== 'string' ||
      rm._id.startsWith('drafts.') ||
      rm._id !== `month-${expectedYearMonth}`
    ) {
      return { ok: false, reason: 'invalidCalendarAssignment' }
    }
    if (
      typeof rm.yearMonth !== 'string' ||
      !YEAR_MONTH_PATTERN.test(rm.yearMonth) ||
      rm.yearMonth !== expectedYearMonth
    ) {
      return { ok: false, reason: 'invalidCalendarAssignment' }
    }
    if (rm.year !== undefined && rm.year !== null && rm.year !== parsedYM.year) {
      return { ok: false, reason: 'invalidCalendarAssignment' }
    }
    if (rm.month !== undefined && rm.month !== null && rm.month !== parsedYM.month) {
      return { ok: false, reason: 'invalidCalendarAssignment' }
    }
    if (rm.editorialStatus !== 'scheduled') {
      return { ok: false, reason: 'embargoed' }
    }
    if (!isNotWithdrawnFlag(rm.withdrawn)) {
      return { ok: false, reason: 'withdrawn' }
    }

    const previewStartDate = computeAdvancePreviewStartDate(parsedYM.year, parsedYM.month)
    if (authorizedLocalDate < previewStartDate || doc.publishOnDate < previewStartDate) {
      return { ok: false, reason: 'embargoed' }
    }

    return {
      ok: true,
      document: {
        id: slug,
        documentId: id,
        category: 'monthlyPreview',
        publishedOn: doc.publishOnDate,
        title,
        summary,
        destination: {
          kind: 'month',
          monthId: expectedYearMonth,
        },
      },
    }
  }

  if (id.startsWith('news-preview-')) {
    return { ok: false, reason: 'malformedDocument' }
  }

  const coverCheck = sanitizeCoverImage(doc.coverImage)
  if (!coverCheck.ok) {
    return { ok: false, reason: 'malformedDocument' }
  }

  const body = sanitizePortableText(doc.body)

  return {
    ok: true,
    document: {
      id: slug,
      documentId: id,
      category: typedCategory,
      publishedOn: doc.publishOnDate,
      title,
      summary,
      ...(body.length > 0 ? { body } : {}),
      ...(coverCheck.coverImage ? { coverImage: coverCheck.coverImage } : {}),
    },
  }
}

function hasNamespaceDelimiter(value: unknown): boolean {
  return typeof value === 'string' && value.includes('.')
}

/**
 * Validates and projects a single `monthlyPublication` into a minimal, reader-safe
 * historical Library summary for `GET /api/library/months`.
 *
 * Reuses `validateAndProjectMonthDetail` so only fully qualified, finalized,
 * editorially reviewed, scheduled, non-withdrawn historical months strictly earlier
 * than `serverContext.authorizedLocalDate.slice(0, 7)` are admitted. Omits all
 * Sanity document IDs, slots, Challenge titles/bodies, discovery rules, Card data,
 * editorial metadata, and non-Sanity-CDN URLs.
 */
export function validateAndProjectLibraryMonthSummary(
  rawDoc: unknown,
  serverContext: GatewayServerContext,
  options?: MonthlyProjectionOptions,
): ProjectionValidationResult<GatewayLibraryMonthSummary> {
  if (!isPlainObject(rawDoc)) {
    return { ok: false, reason: 'malformedDocument' }
  }
  if (!isValidCivilDate(serverContext.authorizedLocalDate)) {
    return { ok: false, reason: 'invalidCalendarAssignment' }
  }
  if (rawDoc._type !== undefined && rawDoc._type !== 'monthlyPublication') {
    return { ok: false, reason: 'malformedDocument' }
  }

  const rawYearMonth = rawDoc.yearMonth
  if (typeof rawYearMonth !== 'string' || !parseYearMonth(rawYearMonth)) {
    return { ok: false, reason: 'invalidCalendarAssignment' }
  }

  const currentYearMonth = serverContext.authorizedLocalDate.slice(0, 7)
  if (rawYearMonth >= currentYearMonth) {
    return { ok: false, reason: 'embargoed' }
  }

  // Reject cross-namespace IDs (e.g. drafts.*, versions.*) on roster or slot references.
  if (isPlainObject(rawDoc.rosterFinalization) && Array.isArray(rawDoc.rosterFinalization.finalizedChallengeIds)) {
    for (const id of rawDoc.rosterFinalization.finalizedChallengeIds) {
      if (hasNamespaceDelimiter(id)) {
        return { ok: false, reason: 'draftDocument' }
      }
    }
  }
  if (Array.isArray(rawDoc.slots)) {
    for (const slot of rawDoc.slots) {
      if (!isPlainObject(slot)) continue
      if (hasNamespaceDelimiter(slot.rawChallengeRef)) {
        return { ok: false, reason: 'draftDocument' }
      }
      if (isPlainObject(slot.challenge)) {
        if (hasNamespaceDelimiter(slot.challenge._id) || hasNamespaceDelimiter(slot.challenge._ref)) {
          return { ok: false, reason: 'draftDocument' }
        }
      }
    }
  }

  const detailResult = validateAndProjectMonthDetail(rawDoc, rawYearMonth, serverContext, options)
  if (!detailResult.ok) {
    return detailResult
  }

  const m = detailResult.document.month
  if (m.phase !== 'historical') {
    return { ok: false, reason: 'embargoed' }
  }

  // Library index cover URLs must strictly match the Sanity asset CDN for this project/dataset.
  if (m.coverImage) {
    const cdnCheck = sanitizeCardArtworkUrl({ url: m.coverImage.url }, options)
    if (!cdnCheck.ok) {
      return { ok: false, reason: 'malformedDocument' }
    }
  }

  return {
    ok: true,
    document: {
      yearMonth: m.monthId,
      year: m.year,
      month: m.month,
      title: m.title,
      ...(m.subtitle ? { subtitle: m.subtitle } : {}),
      ...(m.coverImage ? { coverImage: m.coverImage } : {}),
    },
  }
}

// ---------------------------------------------------------------------------
// R13-VERIFY1: INTERNAL, SERVER-ONLY trusted award eligibility evaluation.
//
// Never serialize this result to a client: it contains the hidden qualifying basis and
// unearned Card metadata. It is intentionally NOT exported from `src/gateway/index.ts` and is
// not used by any public Gateway route. It reuses exactly the same `validateMonthlyBase` +
// `validateDiscoveriesAndFullMonth` rules as `evaluateMonthProgress`, so the accepted
// release / withdrawal / roster / Card-approval semantics cannot drift between the stateless
// display calculation and durable account award issuance.
// ---------------------------------------------------------------------------

export type TrustedAwardCardStatus =
  | { readonly status: 'approved'; readonly card: GatewayEarnedScriptureCard }
  | { readonly status: 'legacyReservedOnly' }
  | { readonly status: 'invalidOrUnapproved' }
  | { readonly status: 'notLinked' }

export interface TrustedAwardEligibilityEntry {
  readonly awardId: string
  readonly discoveryId: string
  readonly kind: 'thematic' | 'fullMonth'
  readonly isEarned: boolean
  /** Active (non-withdrawn) requirement size under the CURRENT finalized roster. */
  readonly targetCount: number
  /** Base Challenge IDs (no `cms:` prefix) that satisfied the rule; sorted; empty if unearned. */
  readonly basisBaseIds: readonly string[]
  /** Latest civil release date among the basis slots (earliest credible earning date). */
  readonly latestBasisReleaseDate?: string
  readonly card: TrustedAwardCardStatus
}

export interface TrustedMonthAwardEligibility {
  readonly yearMonth: string
  readonly documentId: string
  readonly rosterVersion: number
  /** Count of validated `rosterFinalization.priorRosters[]` entries (historical evidence only). */
  readonly priorRosterCount: number
  readonly entries: readonly TrustedAwardEligibilityEntry[]
}

function countPriorRosters(rawDoc: Record<string, unknown>): number | null {
  const rf = rawDoc.rosterFinalization
  if (!isPlainObject(rf) || rf.priorRosters === undefined || rf.priorRosters === null) {
    return 0
  }
  if (!Array.isArray(rf.priorRosters)) {
    return null
  }
  for (const prior of rf.priorRosters) {
    if (
      !isPlainObject(prior) ||
      typeof prior.rosterVersion !== 'number' ||
      !Number.isInteger(prior.rosterVersion) ||
      prior.rosterVersion < 1 ||
      !Array.isArray(prior.finalizedChallengeIds)
    ) {
      return null
    }
  }
  return rf.priorRosters.length
}

function classifyCard(
  earnedCard: GatewayEarnedScriptureCard | undefined,
  cardLinked: boolean,
  reservedCardId: string | undefined,
): TrustedAwardCardStatus {
  if (earnedCard) return { status: 'approved', card: earnedCard }
  if (cardLinked) return { status: 'invalidOrUnapproved' }
  if (reservedCardId) return { status: 'legacyReservedOnly' }
  return { status: 'notLinked' }
}

/**
 * INTERNAL server-only evaluation of which monthly awards the given DATABASE-OWNED canonical
 * completed Challenge IDs earn under the published, finalized month definition, with the
 * trusted linked Card projection for each award. `authorizedLocalDate` must be a
 * server-controlled civil date (the R13-VERIFY1 verifier uses the UTC-12 universal floor).
 */
export function evaluateTrustedMonthAwardEligibility(
  rawDoc: unknown,
  requestedYearMonth: string,
  authorizedLocalDate: string,
  completedCanonicalChallengeIds: readonly string[],
  options?: MonthlyProjectionOptions,
): ProjectionValidationResult<TrustedMonthAwardEligibility> {
  const baseResult = validateMonthlyBase(rawDoc, requestedYearMonth, authorizedLocalDate, {
    requireWelcomeAndChallengeRoutes: true,
  })
  if (!baseResult.ok) {
    return baseResult
  }
  const base = baseResult.document
  if (authorizedLocalDate < `${base.yearMonth}-01`) {
    return { ok: false, reason: 'embargoed' }
  }

  const priorRosterCount = countPriorRosters(rawDoc as Record<string, unknown>)
  if (priorRosterCount === null) {
    return { ok: false, reason: 'malformedDocument' }
  }

  const discResult = validateDiscoveriesAndFullMonth(rawDoc as Record<string, unknown>, base, options)
  if (!discResult.ok) {
    return discResult
  }

  const releasedCanonicalToSlot = new Map<string, { baseId: string; date: string }>()
  for (const slot of base.slots) {
    if (slot.status === 'active' && slot.baseChallengeId && slot.date <= authorizedLocalDate) {
      releasedCanonicalToSlot.set(`cms:${slot.baseChallengeId}`, {
        baseId: slot.baseChallengeId,
        date: slot.date,
      })
    }
  }
  const completedReleased = new Map<string, string>()
  for (const id of completedCanonicalChallengeIds) {
    if (typeof id !== 'string') continue
    const slot = releasedCanonicalToSlot.get(id)
    if (slot) completedReleased.set(slot.baseId, slot.date)
  }

  const buildBasis = (required: readonly string[]) => {
    const basis = required.filter(id => completedReleased.has(id)).sort()
    const latest = basis.reduce<string | undefined>(
      (acc, id) => {
        const d = completedReleased.get(id)!
        return acc === undefined || d > acc ? d : acc
      },
      undefined,
    )
    return { basis, latest }
  }

  const entries: TrustedAwardEligibilityEntry[] = discResult.document.thematic.map(d => {
    const targetCount = d.activeQualifyingIds.length
    const { basis, latest } = buildBasis(d.activeQualifyingIds)
    const isEarned = targetCount > 0 && basis.length >= targetCount
    return {
      awardId: `card:monthly:${base.yearMonth}:${d.discoverySlug}`,
      discoveryId: d.discoveryId,
      kind: 'thematic',
      isEarned,
      targetCount,
      basisBaseIds: isEarned ? basis : [],
      ...(isEarned && latest ? { latestBasisReleaseDate: latest } : {}),
      card: classifyCard(d.earnedCard, d.cardLinked === true, d.reservedCardId),
    }
  })

  const allActive = [...base.activeChallengeIds]
  const full = buildBasis(allActive)
  const fullEarned = allActive.length > 0 && full.basis.length >= allActive.length
  entries.push({
    awardId: `card:monthly:${base.yearMonth}:full-month`,
    discoveryId: `discovery:${base.yearMonth}:full-month`,
    kind: 'fullMonth',
    isEarned: fullEarned,
    targetCount: allActive.length,
    basisBaseIds: fullEarned ? full.basis : [],
    ...(fullEarned && full.latest ? { latestBasisReleaseDate: full.latest } : {}),
    card: classifyCard(
      discResult.document.fullMonthEarnedCard,
      discResult.document.fullMonthCardLinked === true,
      discResult.document.fullMonthReservedCardId,
    ),
  })

  return {
    ok: true,
    document: {
      yearMonth: base.yearMonth,
      documentId: base.documentId,
      rosterVersion: base.rosterVersion,
      priorRosterCount,
      entries,
    },
  }
}
