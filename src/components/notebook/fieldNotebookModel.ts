import {
  selectEarnedAwardsForMonth,
  validateEarnedCardSnapshot,
} from '../../participation/awards.ts'
import {
  parseCardDocumentId,
  parseLocalCalendarDate,
  parseMonthlyAwardIdParts,
  parsePublicationYearMonth,
} from '../../participation/identity.ts'
import { distinctCompletedChallengeCount } from '../../participation/model.ts'
import type {
  CanonicalAwardId,
  EarnedAwardRecord,
  EarnedScriptureCardSnapshot,
  LocalCalendarDate,
  MonthlyAwardKind,
  PublicationYearMonth,
  ReaderParticipationData,
} from '../../participation/types.ts'

/**
 * Pure, platform-neutral domain and projection model for the Field Notebook
 * earned-only collection (R14-7 / Issue #115).
 *
 * Architectural guarantees:
 * - Zero browser (`window`, `localStorage`), network (`fetch`), or React dependencies.
 * - Earned-only authority: reads `ReaderParticipationData.earnedAwards` and never
 *   fabricates unearned cards, gray placeholders, or unpublished month metadata.
 * - Preserves `publicationYearMonth` and `earnedOn` distinctly so late-earned
 *   historical awards remain filed under their original publication month.
 * - Never modifies `cardViewed`, `hubAnnouncementAcked`, or `earnedOn`.
 */

export type NotebookBrowseMode = 'yearMonth' | 'allCards'

export type NotebookMonthStatus = 'hasCards' | 'empty' | 'comingSoon'

export interface NotebookEarnedCardItem {
  readonly awardId: CanonicalAwardId
  readonly kind: MonthlyAwardKind
  readonly kindLabel: string
  readonly publicationYearMonth: PublicationYearMonth
  readonly publicationYear: number
  readonly publicationMonth: number
  readonly publicationMonthHeading: string
  readonly discoveryId: string
  readonly earnedOn: LocalCalendarDate
  readonly earnedDateLabel: string
  readonly cardViewed: boolean
  readonly hubAnnouncementAcked: boolean
  readonly cardDocumentId?: string
  readonly title: string
  readonly hasCardSnapshot: boolean
  readonly earnedCard?: EarnedScriptureCardSnapshot
  readonly theologicalThemes: readonly string[]
  readonly scriptureBook?: string
  readonly scriptureReference?: string
  readonly scriptureTranslation?: string
}

export interface NotebookMonthEntry {
  readonly yearMonth: PublicationYearMonth
  readonly year: number
  readonly month: number
  readonly monthName: string
  readonly monthShortName: string
  readonly monthHeading: string
  readonly daysInMonth: number
  readonly status: NotebookMonthStatus
  readonly isFutureOrUnpublished: boolean
  readonly earnedCount: number
  readonly unviewedCount: number
  readonly cards: readonly NotebookEarnedCardItem[]
}

export interface NotebookLifetimeDisplay {
  readonly distinctCompletedChallenges: number
  readonly earnedCardCount: number
  readonly unviewedCardCount: number
  readonly headline: string
  readonly supportingCopy: string
  readonly provisionalNote: string
}

export interface NotebookSearchFilter {
  readonly query?: string
  readonly theme?: string | null
}

export interface NotebookYearBuildOptions {
  readonly referenceYearMonth?: string
  readonly publishedYearMonths?: ReadonlySet<string>
}

export interface NotebookCollectionProjection {
  readonly allEarnedCards: readonly NotebookEarnedCardItem[]
  readonly itemsByAwardId: Readonly<Record<string, NotebookEarnedCardItem>>
  readonly availableThemes: readonly string[]
  readonly relevantYears: readonly number[]
  readonly referenceYearMonth: PublicationYearMonth
  readonly lifetime: NotebookLifetimeDisplay
}

/**
 * Minimal future participation state contract needed to clear the approved Hub
 * "New Discoveries" indicator upon opening the Field Notebook, independently of
 * `cardViewed` and `hubAnnouncementAcked` (deferred outside R14-7 V2 schema).
 */
export interface NotebookOpenAcknowledgmentContract {
  readonly schemaExtensionRequired: 'ReaderParticipationData.notebookOpenedMarker (deferred)'
  readonly clearedBy: 'FieldNotebookHost open event (not cardViewed, not hubAnnouncementAcked)'
  readonly preservedFlags: readonly ['cardViewed', 'hubAnnouncementAcked', 'earnedOn']
}

export const FIELD_NOTEBOOK_FUTURE_CONTRACT: NotebookOpenAcknowledgmentContract = Object.freeze({
  schemaExtensionRequired: 'ReaderParticipationData.notebookOpenedMarker (deferred)',
  clearedBy: 'FieldNotebookHost open event (not cardViewed, not hubAnnouncementAcked)',
  preservedFlags: Object.freeze(['cardViewed', 'hubAnnouncementAcked', 'earnedOn'] as const),
})

const MONTH_NAME_FORMATTER = new Intl.DateTimeFormat('en', {
  month: 'long',
  timeZone: 'UTC',
})

const MONTH_SHORT_FORMATTER = new Intl.DateTimeFormat('en', {
  month: 'short',
  timeZone: 'UTC',
})

const MONTH_HEADING_FORMATTER = new Intl.DateTimeFormat('en', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

const EARNED_DATE_FORMATTER = new Intl.DateTimeFormat('en', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

export function getNotebookKindLabel(kind: MonthlyAwardKind): string {
  return kind === 'fullMonth' ? 'Full-Month Scripture Card' : 'Thematic Scripture Card'
}

export function getCurrentCivilYearMonth(now: Date = new Date()): PublicationYearMonth {
  const year = String(now.getFullYear()).padStart(4, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}` as PublicationYearMonth
}

export function daysInCivilMonth(year: number, month: number): number {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return 0
  }
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function formatPublicationYearMonth(year: number, month: number): PublicationYearMonth | null {
  if (!Number.isInteger(year) || year < 1 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12) {
    return null
  }
  const candidate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`
  return parsePublicationYearMonth(candidate)
}

export function formatPublicationMonthHeading(yearMonth: string): string {
  const valid = parsePublicationYearMonth(yearMonth)
  if (!valid) return yearMonth
  const year = Number(valid.slice(0, 4))
  const month = Number(valid.slice(5, 7))
  return MONTH_HEADING_FORMATTER.format(new Date(Date.UTC(year, month - 1, 15)))
}

export function formatNotebookEarnedDate(earnedOn: LocalCalendarDate): string {
  const valid = parseLocalCalendarDate(earnedOn)
  if (!valid) return String(earnedOn)
  const year = Number(valid.slice(0, 4))
  const month = Number(valid.slice(5, 7))
  const day = Number(valid.slice(8, 10))
  return EARNED_DATE_FORMATTER.format(new Date(Date.UTC(year, month - 1, day)))
}

export function getAdjacentPublicationYearMonth(
  yearMonth: string,
): { readonly previous: PublicationYearMonth | null; readonly next: PublicationYearMonth | null } {
  const valid = parsePublicationYearMonth(yearMonth)
  if (!valid) {
    return { previous: null, next: null }
  }
  const year = Number(valid.slice(0, 4))
  const month = Number(valid.slice(5, 7))

  const previous =
    month === 1
      ? formatPublicationYearMonth(year - 1, 12)
      : formatPublicationYearMonth(year, month - 1)

  const next =
    month === 12
      ? formatPublicationYearMonth(year + 1, 1)
      : formatPublicationYearMonth(year, month + 1)

  return { previous, next }
}

function validateAndProjectAwardRecord(
  recordKey: string,
  record: unknown,
): NotebookEarnedCardItem | null {
  if (typeof record !== 'object' || record === null || Array.isArray(record)) {
    return null
  }

  const candidate = record as Partial<EarnedAwardRecord>
  const parsedKey = parseMonthlyAwardIdParts(recordKey)
  if (!parsedKey) return null

  if (
    candidate.awardId !== parsedKey.awardId
    || candidate.kind !== parsedKey.kind
    || candidate.publicationYearMonth !== parsedKey.publicationYearMonth
    || candidate.discoveryId !== parsedKey.discoveryId
  ) {
    return null
  }

  const earnedOn = parseLocalCalendarDate(candidate.earnedOn)
  if (!earnedOn) return null

  if (
    typeof candidate.cardViewed !== 'boolean'
    || typeof candidate.hubAnnouncementAcked !== 'boolean'
  ) {
    return null
  }

  const validatedDocId =
    candidate.cardDocumentId !== undefined
      ? parseCardDocumentId(candidate.cardDocumentId) ?? undefined
      : undefined

  // If a stored cardDocumentId is present but malformed, reject the snapshot while preserving
  // the earned award identity if needed; if present and mismatched against snapshot, reject snapshot.
  const candidateSnapshot =
    candidate.earnedCard !== undefined
      ? validateEarnedCardSnapshot(candidate.earnedCard, parsedKey.publicationYearMonth)
      : null

  const docIdMatchesSnapshot =
    candidateSnapshot !== null
    && (candidate.cardDocumentId === undefined
      || (validatedDocId !== undefined && validatedDocId === candidateSnapshot.cardDocumentId))

  const validatedCard = docIdMatchesSnapshot ? candidateSnapshot : undefined
  const kindLabel = getNotebookKindLabel(parsedKey.kind)
  const publicationYear = Number(parsedKey.publicationYearMonth.slice(0, 4))
  const publicationMonth = Number(parsedKey.publicationYearMonth.slice(5, 7))

  return Object.freeze({
    awardId: parsedKey.awardId,
    kind: parsedKey.kind,
    kindLabel,
    publicationYearMonth: parsedKey.publicationYearMonth,
    publicationYear,
    publicationMonth,
    publicationMonthHeading: formatPublicationMonthHeading(parsedKey.publicationYearMonth),
    discoveryId: parsedKey.discoveryId,
    earnedOn,
    earnedDateLabel: formatNotebookEarnedDate(earnedOn),
    cardViewed: candidate.cardViewed,
    hubAnnouncementAcked: candidate.hubAnnouncementAcked,
    ...(validatedCard
      ? { cardDocumentId: validatedCard.cardDocumentId }
      : validatedDocId
        ? { cardDocumentId: validatedDocId }
        : {}),
    title: validatedCard ? validatedCard.title : kindLabel,
    hasCardSnapshot: validatedCard !== undefined,
    ...(validatedCard ? { earnedCard: validatedCard } : {}),
    theologicalThemes: validatedCard?.theologicalThemes ?? Object.freeze([]),
    ...(validatedCard
      ? {
          scriptureBook: validatedCard.scripture.book,
          scriptureReference: validatedCard.scripture.reference,
          scriptureTranslation: validatedCard.scripture.translation,
        }
      : {}),
  })
}

export function projectValidatedEarnedAwards(
  data: ReaderParticipationData,
): readonly NotebookEarnedCardItem[] {
  if (!data || typeof data !== 'object' || !data.earnedAwards || typeof data.earnedAwards !== 'object') {
    return Object.freeze([])
  }

  const items: NotebookEarnedCardItem[] = []
  const seen = new Set<string>()

  for (const [key, record] of Object.entries(data.earnedAwards)) {
    const projected = validateAndProjectAwardRecord(key, record)
    if (!projected || seen.has(projected.awardId)) {
      continue
    }
    seen.add(projected.awardId)
    items.push(projected)
  }

  // All Earned Cards ordering: newest-earned-first, stable canonical awardId ascending tie-breaker
  items.sort((left, right) => {
    if (left.earnedOn !== right.earnedOn) {
      return right.earnedOn.localeCompare(left.earnedOn)
    }
    return left.awardId.localeCompare(right.awardId)
  })

  return Object.freeze(items)
}

/**
 * Projects earned-only cards belonging to a single publication month (`YYYY-MM`),
 * reusing `selectEarnedAwardsForMonth` and validating every record cleanly.
 */
export function selectNotebookCardsForMonth(
  data: ReaderParticipationData,
  yearMonth: string,
): readonly NotebookEarnedCardItem[] {
  const normalizedMonth = parsePublicationYearMonth(yearMonth)
  if (!normalizedMonth || !data || typeof data !== 'object' || !data.earnedAwards) {
    return Object.freeze([])
  }

  const rawForMonth = selectEarnedAwardsForMonth(data, normalizedMonth)
  const items: NotebookEarnedCardItem[] = []
  const seen = new Set<string>()

  for (const record of rawForMonth) {
    if (!record || typeof record.awardId !== 'string') continue
    if (!Object.hasOwn(data.earnedAwards, record.awardId)) continue
    const projected = validateAndProjectAwardRecord(record.awardId, record)
    if (!projected || projected.publicationYearMonth !== normalizedMonth || seen.has(projected.awardId)) {
      continue
    }
    seen.add(projected.awardId)
    items.push(projected)
  }

  return Object.freeze(items)
}

export function collectAvailableCuratedThemes(
  items: readonly NotebookEarnedCardItem[],
): readonly string[] {
  const byLower = new Map<string, string>()

  for (const item of items) {
    if (!item.hasCardSnapshot) continue
    for (const theme of item.theologicalThemes) {
      const normalized = theme.trim()
      if (!normalized) continue
      const key = normalized.toLowerCase()
      const existing = byLower.get(key)
      if (!existing || (existing === key && normalized !== key)) {
        byLower.set(key, normalized)
      }
    }
  }

  const themes = Array.from(byLower.values()).sort((left, right) =>
    left.toLowerCase().localeCompare(right.toLowerCase()),
  )
  return Object.freeze(themes)
}

export function filterNotebookCards(
  items: readonly NotebookEarnedCardItem[],
  filter: NotebookSearchFilter,
): readonly NotebookEarnedCardItem[] {
  const normalizedTheme =
    typeof filter.theme === 'string' && filter.theme.trim().length > 0
      ? filter.theme.trim().toLowerCase()
      : null

  const normalizedQuery =
    typeof filter.query === 'string'
      ? filter.query.trim().replace(/\s+/g, ' ').toLowerCase()
      : ''

  if (!normalizedTheme && !normalizedQuery) {
    return items
  }

  const filtered = items.filter(item => {
    if (!item.hasCardSnapshot || !item.earnedCard) {
      return false
    }

    if (normalizedTheme) {
      const hasTheme = item.theologicalThemes.some(
        theme => theme.trim().toLowerCase() === normalizedTheme,
      )
      if (!hasTheme) return false
    }

    if (normalizedQuery) {
      const searchableValues = [
        item.earnedCard.title,
        item.earnedCard.scripture.book,
        item.earnedCard.scripture.reference,
        ...item.theologicalThemes,
      ]
      const matches = searchableValues.some(value =>
        value.toLowerCase().includes(normalizedQuery),
      )
      if (!matches) return false
    }

    return true
  })

  return Object.freeze(filtered)
}

export function collectRelevantNotebookYears(
  items: readonly NotebookEarnedCardItem[],
  referenceYearMonth: PublicationYearMonth,
  publishedYearMonths?: ReadonlySet<string>,
): readonly number[] {
  const years = new Set<number>()
  years.add(Number(referenceYearMonth.slice(0, 4)))

  for (const item of items) {
    years.add(item.publicationYear)
  }

  if (publishedYearMonths) {
    for (const ym of publishedYearMonths) {
      const parsed = parsePublicationYearMonth(ym)
      if (parsed) {
        years.add(Number(parsed.slice(0, 4)))
      }
    }
  }

  const sorted = Array.from(years).sort((a, b) => b - a)
  return Object.freeze(sorted)
}

export function buildNotebookYearEntries(
  items: readonly NotebookEarnedCardItem[],
  year: number,
  options: NotebookYearBuildOptions = {},
): readonly NotebookMonthEntry[] {
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    return Object.freeze([])
  }

  const referenceYearMonth =
    parsePublicationYearMonth(options.referenceYearMonth) ?? getCurrentCivilYearMonth()

  const cardsByMonth = new Map<string, NotebookEarnedCardItem[]>()
  for (const item of items) {
    if (item.publicationYear !== year) continue
    const bucket = cardsByMonth.get(item.publicationYearMonth)
    if (bucket) {
      bucket.push(item)
    } else {
      cardsByMonth.set(item.publicationYearMonth, [item])
    }
  }

  // Within a month view, preserve thematic-before-fullMonth, earnedOn asc, awardId asc
  for (const bucket of cardsByMonth.values()) {
    bucket.sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === 'thematic' ? -1 : 1
      }
      if (left.earnedOn !== right.earnedOn) {
        return left.earnedOn.localeCompare(right.earnedOn)
      }
      return left.awardId.localeCompare(right.awardId)
    })
  }

  const entries: NotebookMonthEntry[] = []

  for (let month = 1; month <= 12; month += 1) {
    const yearMonth = formatPublicationYearMonth(year, month)!
    const monthCards = Object.freeze(cardsByMonth.get(yearMonth) ?? [])
    const earnedCount = monthCards.length
    const unviewedCount = monthCards.reduce((sum, card) => sum + (card.cardViewed ? 0 : 1), 0)

    const isFutureByDate = yearMonth > referenceYearMonth
    const isUnpublishedByRoster =
      options.publishedYearMonths !== undefined && !options.publishedYearMonths.has(yearMonth)

    // Genuinely earned cards in durable state always remain visible under their publication month.
    const isFutureOrUnpublished =
      earnedCount === 0 && (isFutureByDate || isUnpublishedByRoster)

    const status: NotebookMonthStatus =
      earnedCount > 0 ? 'hasCards' : isFutureOrUnpublished ? 'comingSoon' : 'empty'

    const anchorDate = new Date(Date.UTC(year, month - 1, 15))
    entries.push(
      Object.freeze({
        yearMonth,
        year,
        month,
        monthName: MONTH_NAME_FORMATTER.format(anchorDate),
        monthShortName: MONTH_SHORT_FORMATTER.format(anchorDate),
        monthHeading: MONTH_HEADING_FORMATTER.format(anchorDate),
        daysInMonth: daysInCivilMonth(year, month),
        status,
        isFutureOrUnpublished,
        earnedCount,
        unviewedCount,
        cards: monthCards,
      }),
    )
  }

  return Object.freeze(entries)
}

export function buildNotebookLifetimeDisplay(
  data: ReaderParticipationData,
  earnedCards: readonly NotebookEarnedCardItem[],
): NotebookLifetimeDisplay {
  const distinctCompletedChallenges = distinctCompletedChallengeCount(data)
  const earnedCardCount = earnedCards.length
  const unviewedCardCount = earnedCards.reduce(
    (sum, card) => sum + (card.cardViewed ? 0 : 1),
    0,
  )

  const challengeNoun = distinctCompletedChallenges === 1 ? 'Challenge' : 'Challenges'
  const headline = `${distinctCompletedChallenges} Distinct ${challengeNoun} Completed`

  const supportingCopy =
    distinctCompletedChallenges === 0
      ? 'Each distinct Challenge finished from current teaching, Shelf, or Library counts once toward your ongoing record.'
      : 'Counted across current teaching, Shelf, and Library. Rereading does not inflate your distinct total.'

  return Object.freeze({
    distinctCompletedChallenges,
    earnedCardCount,
    unviewedCardCount,
    headline,
    supportingCopy,
    provisionalNote:
      'Single evolving participation record — final lifetime status naming and artwork remain pending design review.',
  })
}

export function buildNotebookCollectionProjection(
  data: ReaderParticipationData,
  options: NotebookYearBuildOptions = {},
): NotebookCollectionProjection {
  const referenceYearMonth =
    parsePublicationYearMonth(options.referenceYearMonth) ?? getCurrentCivilYearMonth()

  const allEarnedCards = projectValidatedEarnedAwards(data)
  const itemsByAwardId: Record<string, NotebookEarnedCardItem> = {}
  for (const item of allEarnedCards) {
    itemsByAwardId[item.awardId] = item
  }

  const availableThemes = collectAvailableCuratedThemes(allEarnedCards)
  const relevantYears = collectRelevantNotebookYears(
    allEarnedCards,
    referenceYearMonth,
    options.publishedYearMonths,
  )
  const lifetime = buildNotebookLifetimeDisplay(data, allEarnedCards)

  return Object.freeze({
    allEarnedCards,
    itemsByAwardId: Object.freeze(itemsByAwardId),
    availableThemes,
    relevantYears,
    referenceYearMonth,
    lifetime,
  })
}
