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
  comparePublicationYearMonths,
  isHistoricalPublicationYearMonth,
  parseValidPublicationYearMonth,
} from '../shelf/validation.ts'
import type {
  HubContinueInput,
  HubContinueResult,
  HubContinueSuggestion,
  InternalNormalizedSlot,
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

interface ParsedParticipation {
  readonly completedIds: ReadonlySet<CanonicalChallengeId>
  readonly inProgressById: ReadonlyMap<
    CanonicalChallengeId,
    { readonly updatedOn: string; readonly screenId?: string }
  >
}

function parseParticipation(raw: unknown): ParsedParticipation {
  const completedIds = new Set<CanonicalChallengeId>()
  const inProgressById = new Map<
    CanonicalChallengeId,
    { readonly updatedOn: string; readonly screenId?: string }
  >()

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
      if (!updatedOn) continue
      const screenId =
        typeof record.screenId === 'string' && record.screenId.trim().length > 0
          ? record.screenId
          : undefined
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
  catalogLookup: ReadonlyMap<string, ReleasedCatalogSummary> | null,
): { readonly monthTitle: string; readonly slots: readonly InternalNormalizedSlot[] } | null {
  if (!isPlainObject(monthDetail)) return null
  if (monthDetail.monthId !== yearMonth) return null
  if (monthDetail.phase !== 'historical') return null

  const monthTitle =
    typeof monthDetail.title === 'string' && monthDetail.title.trim().length > 0
      ? monthDetail.title.trim()
      : null
  if (!monthTitle || !Array.isArray(monthDetail.slots)) return null

  const seenDays = new Set<number>()
  const normalized: InternalNormalizedSlot[] = []

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
    if (!challengeId) continue
    const challengeDocumentId = extractDocumentIdFromCanonical(challengeId)

    const slug = typeof rawSlot.slug === 'string' ? rawSlot.slug.trim() : ''
    const title = typeof rawSlot.title === 'string' ? rawSlot.title.trim() : ''
    const challengeType = rawSlot.challengeType as MonthGatewayChallengeType
    if (!slug || !title || !VALID_CHALLENGE_TYPES.has(challengeType)) continue

    if (!isCatalogAuthorized(catalogLookup, challengeDocumentId, slug, yearMonth)) {
      continue
    }

    seenDays.add(dayOfMonth)
    const isCompleted = participation.completedIds.has(challengeId)
    const inProgress = !isCompleted ? participation.inProgressById.get(challengeId) : undefined

    normalized.push({
      dayOfMonth,
      publicationDate,
      challengeId,
      challengeDocumentId,
      slug,
      title,
      challengeType,
      isCompleted,
      isInProgress: Boolean(inProgress),
      resumeScreenId: inProgress?.screenId,
      inProgressUpdatedOn: inProgress?.updatedOn,
    })
  }

  normalized.sort((a, b) => a.dayOfMonth - b.dayOfMonth)
  return { monthTitle, slots: normalized }
}

function selectChallengeFromSlots(
  slots: readonly InternalNormalizedSlot[],
): { readonly slot: InternalNormalizedSlot; readonly isInProgress: boolean } | null {
  const unfinished = slots.filter(slot => !slot.isCompleted)
  if (unfinished.length === 0) return null

  const inProgress = unfinished.filter(slot => slot.isInProgress)
  if (inProgress.length > 0) {
    const sorted = [...inProgress].sort((a, b) => {
      const aDate = a.inProgressUpdatedOn ?? ''
      const bDate = b.inProgressUpdatedOn ?? ''
      if (aDate !== bDate) return bDate.localeCompare(aDate)
      return a.dayOfMonth - b.dayOfMonth
    })
    return { slot: sorted[0]!, isInProgress: true }
  }

  return { slot: unfinished[0]!, isInProgress: false }
}

function buildSuggestion(params: {
  readonly kind: HubContinueSuggestion['kind']
  readonly yearMonth: PublicationYearMonth
  readonly monthTitle: string
  readonly slot: InternalNormalizedSlot
  readonly isInProgress: boolean
  readonly formalFocusMonth: PublicationYearMonth | null
}): HubContinueSuggestion {
  const { kind, yearMonth, monthTitle, slot, isInProgress, formalFocusMonth } = params
  return Object.freeze({
    kind,
    yearMonth,
    monthTitle,
    monthHeading: formatYearMonthHeading(yearMonth),
    challengeId: slot.challengeId,
    challengeDocumentId: slot.challengeDocumentId,
    challengeSlug: slot.slug,
    challengeTitle: slot.title,
    challengeType: slot.challengeType,
    dayOfMonth: slot.dayOfMonth,
    publicationDate: slot.publicationDate,
    isInProgress,
    ...(slot.resumeScreenId !== undefined ? { resumeScreenId: slot.resumeScreenId } : {}),
    formalFocusMonth,
    preservesFormalFocus: true,
    origin: DEFAULT_CHALLENGE_ORIGIN,
  })
}

/**
 * Derives at most one unobtrusive Hub Continue suggestion from approved reader data.
 *
 * Priority:
 * 1. Unfinished (in-progress) Challenge in explicitly active historical focus.
 * 2. Appropriate next unfinished Challenge in that same active historical focus.
 * 3. If that focused month is complete, the next eligible unfinished historical Shelf month
 *    without silently changing formal `activeFocusMonth`.
 * 4. Otherwise returns no suggestion.
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
  const catalogLookup = buildCatalogLookup(input.releasedCatalog)

  const focusDetail = lookupMonthDetail(input.monthDetailsByYearMonth, activeFocus)
  const focusExtracted = extractNormalizedSlots(
    activeFocus,
    focusDetail,
    participation,
    catalogLookup,
  )

  if (!focusExtracted || focusExtracted.slots.length === 0) {
    return Object.freeze({ status: 'none', suggestion: null, reason: 'activeFocusUnavailable' })
  }

  const focusPick = selectChallengeFromSlots(focusExtracted.slots)
  if (focusPick) {
    const kind = focusPick.isInProgress ? 'resumeInProgress' : 'continueNextInFocus'
    const reason = focusPick.isInProgress ? 'inProgressInActiveFocus' : 'nextUnfinishedInActiveFocus'
    return Object.freeze({
      status: 'suggestion',
      suggestion: buildSuggestion({
        kind,
        yearMonth: activeFocus,
        monthTitle: focusExtracted.monthTitle,
        slot: focusPick.slot,
        isInProgress: focusPick.isInProgress,
        formalFocusMonth: activeFocus,
      }),
      reason,
    })
  }

  // Active focus month is complete; consider other eligible unfinished historical Shelf months
  // without silently changing formal `activeFocusMonth`.
  const shelfMonths = Array.isArray(input.shelfState.months) ? input.shelfState.months : []
  const seenCandidates = new Set<PublicationYearMonth>([activeFocus])

  interface CandidatePick {
    readonly yearMonth: PublicationYearMonth
    readonly monthTitle: string
    readonly slot: InternalNormalizedSlot
    readonly isInProgress: boolean
    readonly shelfIndex: number
  }

  const candidates: CandidatePick[] = []

  shelfMonths.forEach((rawEntry, shelfIndex) => {
    if (!isPlainObject(rawEntry)) return
    const ym = parseValidPublicationYearMonth(rawEntry.yearMonth)
    if (!ym || seenCandidates.has(ym)) return
    seenCandidates.add(ym)

    if (!isHistoricalPublicationYearMonth(ym, referenceCurrent)) return

    const detail = lookupMonthDetail(input.monthDetailsByYearMonth, ym)
    const extracted = extractNormalizedSlots(ym, detail, participation, catalogLookup)
    if (!extracted || extracted.slots.length === 0) return

    const pick = selectChallengeFromSlots(extracted.slots)
    if (!pick) return

    candidates.push({
      yearMonth: ym,
      monthTitle: extracted.monthTitle,
      slot: pick.slot,
      isInProgress: pick.isInProgress,
      shelfIndex,
    })
  })

  if (candidates.length === 0) {
    return Object.freeze({
      status: 'none',
      suggestion: null,
      reason: 'allEligibleMonthsComplete',
    })
  }

  candidates.sort((a, b) => {
    if (a.isInProgress !== b.isInProgress) return a.isInProgress ? -1 : 1
    if (a.isInProgress && b.isInProgress) {
      const aDate = a.slot.inProgressUpdatedOn ?? ''
      const bDate = b.slot.inProgressUpdatedOn ?? ''
      if (aDate !== bDate) return bDate.localeCompare(aDate)
    }
    const ymCmp = comparePublicationYearMonths(b.yearMonth, a.yearMonth)
    if (ymCmp !== 0) return ymCmp
    return a.shelfIndex - b.shelfIndex
  })

  const chosen = candidates[0]!
  return Object.freeze({
    status: 'suggestion',
    suggestion: buildSuggestion({
      kind: 'continueOtherHistoricalMonth',
      yearMonth: chosen.yearMonth,
      monthTitle: chosen.monthTitle,
      slot: chosen.slot,
      isInProgress: chosen.isInProgress,
      formalFocusMonth: activeFocus,
    }),
    reason: 'nextEligibleMonthAfterCompletedFocus',
  })
}
