import { DEFAULT_CHALLENGE_ORIGIN } from '../cms/reader/challengeOrigin.ts'
import type {
  MonthDetailData,
  MonthGatewayChallengeType,
} from '../cms/reader/monthProvider.ts'
import type { ReleasedCatalogSummary } from '../cms/reader/releasedCatalogProvider.ts'
import {
  formatCanonicalChallengeId,
  parseLocalCalendarDate,
  parseStoredChallengeId,
} from '../participation/identity.ts'
import type {
  CanonicalChallengeId,
  PublicationYearMonth,
} from '../participation/types.ts'
import {
  isHistoricalPublicationYearMonth,
  parseValidPublicationYearMonth,
} from '../shelf/validation.ts'
import type {
  HubContinueInput,
  HubContinueResult,
  HubContinueSuggestion,
} from './types.ts'

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

const VALID_CHALLENGE_TYPES = new Set<MonthGatewayChallengeType>([
  'teaching',
  'discipline',
  'reflection',
  'memorization',
])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function formatYearMonthHeading(yearMonth: PublicationYearMonth): string {
  const year = yearMonth.slice(0, 4)
  const monthNum = Number(yearMonth.slice(5, 7))
  const monthName = MONTH_NAMES[monthNum - 1]
  return monthName ? `${monthName} ${year}` : yearMonth
}

function toCanonicalCmsChallengeId(raw: unknown): CanonicalChallengeId | null {
  if (typeof raw !== 'string') return null
  return parseStoredChallengeId(raw, 'cms') ?? formatCanonicalChallengeId('cms', raw)
}

function extractDocumentIdFromCanonical(id: CanonicalChallengeId): string {
  const colonIdx = id.indexOf(':')
  return colonIdx >= 0 ? id.slice(colonIdx + 1) : id
}

function resolveReferenceCurrentYearMonth(input: HubContinueInput): PublicationYearMonth | null {
  if (input.referenceCurrentYearMonth !== undefined) {
    return parseValidPublicationYearMonth(input.referenceCurrentYearMonth)
  }

  const authorizedDate = parseLocalCalendarDate(input.serverContext?.authorizedLocalDate)
  if (!authorizedDate) return null
  return parseValidPublicationYearMonth(authorizedDate.slice(0, 7))
}

interface SavedPosition {
  readonly updatedOn: string
  readonly screenId: string
}

interface NormalizedSlot {
  readonly dayOfMonth: number
  readonly publicationDate: string
  readonly challengeId: CanonicalChallengeId
  readonly challengeDocumentId: string
  readonly slug: string
  readonly title: string
  readonly challengeType: MonthGatewayChallengeType
  readonly isCompleted: boolean
  readonly savedPosition?: SavedPosition
}

interface ParsedParticipation {
  readonly completedIds: ReadonlySet<CanonicalChallengeId>
  readonly inProgressById: ReadonlyMap<CanonicalChallengeId, SavedPosition>
}

function parseParticipation(raw: unknown): ParsedParticipation {
  const completedIds = new Set<CanonicalChallengeId>()
  const inProgressById = new Map<CanonicalChallengeId, SavedPosition>()

  if (!isPlainObject(raw)) {
    return { completedIds, inProgressById }
  }

  if (isPlainObject(raw.completedChallenges)) {
    for (const [rawKey, record] of Object.entries(raw.completedChallenges)) {
      const canonicalId = parseStoredChallengeId(rawKey, 'cms')
      if (!canonicalId || !isPlainObject(record)) continue
      if (parseLocalCalendarDate(record.completedOn)) {
        completedIds.add(canonicalId)
      }
    }
  }

  if (isPlainObject(raw.inProgressChallenges)) {
    for (const [rawKey, record] of Object.entries(raw.inProgressChallenges)) {
      const canonicalId = parseStoredChallengeId(rawKey, 'cms')
      if (!canonicalId || completedIds.has(canonicalId) || !isPlainObject(record)) continue
      const updatedOn = parseLocalCalendarDate(record.updatedOn)
      const screenId = typeof record.screenId === 'string' ? record.screenId.trim() : ''
      if (!updatedOn || !screenId) continue
      inProgressById.set(canonicalId, { updatedOn, screenId })
    }
  }

  return { completedIds, inProgressById }
}

function buildCatalogLookup(
  rawCatalog: HubContinueInput['releasedCatalog'],
): ReadonlyMap<string, ReleasedCatalogSummary> | null {
  if (rawCatalog === undefined) return null

  const lookup = new Map<string, ReleasedCatalogSummary>()
  const items: unknown[] =
    rawCatalog instanceof Map
      ? Array.from(rawCatalog.values())
      : Array.isArray(rawCatalog)
        ? rawCatalog
        : []

  for (const item of items) {
    if (!isPlainObject(item)) continue
    const documentId = typeof item.documentId === 'string' ? item.documentId.trim() : ''
    const slug = typeof item.slug === 'string' ? item.slug.trim() : ''
    if (!documentId || documentId.startsWith('drafts.') || !slug) continue
    lookup.set(documentId, item as unknown as ReleasedCatalogSummary)
  }

  return lookup
}

function lookupMonthDetail(
  source: HubContinueInput['monthDetailsByYearMonth'],
  yearMonth: PublicationYearMonth,
): MonthDetailData | null {
  if (!source) return null
  if (source instanceof Map) {
    return source.get(yearMonth) ?? null
  }
  if (isPlainObject(source) && Object.hasOwn(source, yearMonth)) {
    return (source as Record<string, MonthDetailData>)[yearMonth] ?? null
  }
  return null
}

function isCatalogAuthorized(
  catalogLookup: ReadonlyMap<string, ReleasedCatalogSummary> | null,
  documentId: string,
  slug: string,
  yearMonth: PublicationYearMonth,
): boolean {
  if (catalogLookup === null) return true
  const entry = catalogLookup.get(documentId)
  if (!entry) return false
  if (entry.slug !== slug) return false
  if (entry.calendarSlot && entry.calendarSlot.monthId !== yearMonth) return false
  return true
}

function extractNormalizedSlots(
  yearMonth: PublicationYearMonth,
  monthDetail: unknown,
  participation: ParsedParticipation,
): {
  readonly monthTitle: string
  readonly slots: readonly NormalizedSlot[]
  readonly totalChallenges: unknown
} | null {
  if (!isPlainObject(monthDetail)) return null
  if (monthDetail.monthId !== yearMonth) return null
  if (monthDetail.phase !== 'historical') return null

  const monthTitle =
    typeof monthDetail.title === 'string' && monthDetail.title.trim().length > 0
      ? monthDetail.title.trim()
      : null
  if (!monthTitle || !Array.isArray(monthDetail.slots)) return null

  const seenDays = new Set<number>()
  const seenChallenges = new Set<CanonicalChallengeId>()
  const normalized: NormalizedSlot[] = []

  for (const rawSlot of monthDetail.slots) {
    if (!isPlainObject(rawSlot)) continue
    if (rawSlot.availability !== 'available') continue

    const dayOfMonth = rawSlot.dayOfMonth
    if (typeof dayOfMonth !== 'number' || !Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
      continue
    }
    if (seenDays.has(dayOfMonth)) continue

    const publicationDate = parseLocalCalendarDate(rawSlot.date)
    if (!publicationDate || !publicationDate.startsWith(`${yearMonth}-`)) continue

    const challengeId = toCanonicalCmsChallengeId(rawSlot.challengeId)
    if (!challengeId || seenChallenges.has(challengeId)) continue
    const challengeDocumentId = extractDocumentIdFromCanonical(challengeId)

    const slug = typeof rawSlot.slug === 'string' ? rawSlot.slug.trim() : ''
    const title = typeof rawSlot.title === 'string' ? rawSlot.title.trim() : ''
    const challengeType = rawSlot.challengeType as MonthGatewayChallengeType
    if (!slug || !title || !VALID_CHALLENGE_TYPES.has(challengeType)) continue

    seenDays.add(dayOfMonth)
    seenChallenges.add(challengeId)
    const isCompleted = participation.completedIds.has(challengeId)

    normalized.push({
      dayOfMonth,
      publicationDate,
      challengeId,
      challengeDocumentId,
      slug,
      title,
      challengeType,
      isCompleted,
      savedPosition: participation.inProgressById.get(challengeId),
    })
  }

  return { monthTitle, slots: normalized, totalChallenges: monthDetail.totalChallenges }
}

function selectSavedChallenge(
  slots: readonly NormalizedSlot[],
  catalogLookup: ReadonlyMap<string, ReleasedCatalogSummary> | null,
  yearMonth: PublicationYearMonth,
) {
  return slots
    .filter((slot): slot is NormalizedSlot & { savedPosition: SavedPosition } =>
      !slot.isCompleted &&
      slot.savedPosition !== undefined &&
      isCatalogAuthorized(catalogLookup, slot.challengeDocumentId, slot.slug, yearMonth),
    )
    .sort((a, b) =>
      b.savedPosition.updatedOn.localeCompare(a.savedPosition.updatedOn) || a.dayOfMonth - b.dayOfMonth,
    )[0]
}

/**
 * Derives at most one unobtrusive Hub Continue suggestion from approved reader data.
 * Active Focus is the only destination, through a saved Challenge or its Month Screen.
 */
export function deriveHubContinueSuggestion(input: HubContinueInput): HubContinueResult {
  if (!isPlainObject(input)) {
    return Object.freeze({ status: 'none', suggestion: null, reason: 'malformedInput' })
  }

  const referenceCurrent = resolveReferenceCurrentYearMonth(input)
  if (!referenceCurrent) {
    return Object.freeze({ status: 'none', suggestion: null, reason: 'invalidReferenceMonth' })
  }

  if (!isPlainObject(input.shelfState)) {
    return Object.freeze({ status: 'none', suggestion: null, reason: 'malformedInput' })
  }

  const rawFocus = input.shelfState.activeFocusMonth
  if (rawFocus === null || rawFocus === undefined) {
    return Object.freeze({ status: 'none', suggestion: null, reason: 'noActiveFocus' })
  }

  const activeFocus = parseValidPublicationYearMonth(rawFocus)
  if (!activeFocus) {
    return Object.freeze({ status: 'none', suggestion: null, reason: 'malformedInput' })
  }

  if (!isHistoricalPublicationYearMonth(activeFocus, referenceCurrent)) {
    return Object.freeze({ status: 'none', suggestion: null, reason: 'activeFocusNotHistorical' })
  }

  const participation = parseParticipation(input.participationData)
  const focusDetail = lookupMonthDetail(input.monthDetailsByYearMonth, activeFocus)
  const focusExtracted = extractNormalizedSlots(
    activeFocus,
    focusDetail,
    participation,
  )

  if (!focusExtracted) {
    return Object.freeze({ status: 'none', suggestion: null, reason: 'activeFocusUnavailable' })
  }

  const focus = {
    yearMonth: activeFocus,
    monthTitle: focusExtracted.monthTitle,
    monthHeading: formatYearMonthHeading(activeFocus),
    formalFocusMonth: activeFocus,
    preservesFormalFocus: true as const,
  }
  const catalogLookup = buildCatalogLookup(input.releasedCatalog)
  const slot = selectSavedChallenge(focusExtracted.slots, catalogLookup, activeFocus)
  if (slot) {
    const suggestion: HubContinueSuggestion = Object.freeze({
      ...focus,
      kind: 'resumeInProgress',
      challengeId: slot.challengeId,
      challengeDocumentId: slot.challengeDocumentId,
      challengeSlug: slot.slug,
      challengeTitle: slot.title,
      challengeType: slot.challengeType,
      dayOfMonth: slot.dayOfMonth,
      publicationDate: slot.publicationDate,
      isInProgress: true,
      resumeScreenId: slot.savedPosition.screenId,
      origin: DEFAULT_CHALLENGE_ORIGIN,
    })
    return Object.freeze({
      status: 'suggestion',
      suggestion,
      reason: 'inProgressInActiveFocus',
    })
  }

  // Missing or unreleased slots cannot count as completed.
  const { slots, totalChallenges } = focusExtracted
  const isComplete =
    slots.length > 0 &&
    slots.length === totalChallenges &&
    slots.every(candidate => candidate.isCompleted)
  return Object.freeze({
    status: 'suggestion',
    suggestion: Object.freeze({
      ...focus,
      kind: isComplete ? 'reviewFocusMonth' : 'openFocusMonth',
    }),
    reason: isComplete ? 'activeFocusComplete' : 'noSavedChallengeInActiveFocus',
  })
}
