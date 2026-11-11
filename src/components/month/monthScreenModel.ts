import type {
  MonthDiscoverySummary,
  MonthGatewayChallengeType,
  MonthProgressData,
  MonthSlot,
  MonthSlotPreview,
} from '../../cms/reader/monthProvider.ts'
import {
  formatCanonicalChallengeId,
  parseCanonicalMonthlyDiscoveryId,
  parsePublicationYearMonth,
  parseStoredChallengeId,
} from '../../participation/identity.ts'
import {
  combineGatewayProgressWithStoredAwards,
  selectEarnedAward,
  validateEarnedCardSnapshot,
} from '../../participation/awards.ts'
import { emptyReaderParticipationData } from '../../participation/model.ts'
import { selectChallengeParticipationView } from '../../participation/model.ts'
import type {
  CanonicalAwardId,
  CanonicalChallengeId,
  EarnedAwardRecord,
  EarnedScriptureCardSnapshot,
  LocalCalendarDate,
  ReaderParticipationData,
} from '../../participation/types.ts'

function toCanonicalCmsChallengeId(raw: string): CanonicalChallengeId | null {
  return parseStoredChallengeId(raw, 'cms') ?? formatCanonicalChallengeId('cms', raw)
}

/**
 * Pure, storage-free calendar, slot-state, and discovery presentation helpers
 * for the provisional R08A-6 Month Screen.
 */

export const MAX_MONTH_PROGRESS_IDS = 500
export const WEEKDAY_SHORT_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

export type MonthSlotStatus =
  | 'completed'
  | 'continue'
  | 'inProgress'
  | 'available'
  | 'comingSoon'
  | 'unavailable'

export interface MonthSlotPresentation {
  readonly dayOfMonth: number
  readonly date: string
  readonly weekdayIndex: number // 0 = Mon .. 6 = Sun
  readonly weekdayLabel: string
  readonly status: MonthSlotStatus
  readonly statusLabel: string
  readonly interactive: boolean
  readonly title?: string
  readonly slug?: string
  readonly challengeId?: string
  readonly challengeType?: MonthGatewayChallengeType
  readonly completedOn?: LocalCalendarDate
  readonly previouslyCompleted?: boolean
}

export interface MonthCalendarCell {
  readonly weekdayIndex: number
  readonly dayOfMonth: number | null
  readonly slot: MonthSlotPresentation | null
}

export interface MonthCalendarWeek {
  readonly weekNumber: number
  readonly label: string
  readonly startDay: number
  readonly endDay: number
  readonly slots: readonly MonthSlotPresentation[]
  readonly cells: readonly MonthCalendarCell[]
}

export interface MonthDiscoveryPresentation {
  readonly discoveryId: string
  readonly kind: 'thematic' | 'fullMonth'
  readonly title: string
  readonly achievedCount: number
  readonly targetCount: number
  readonly isEarned: boolean
  readonly hasStoredAward: boolean
  readonly hasCardDisplay: boolean
  readonly awardId?: CanonicalAwardId
  readonly earnedOn?: LocalCalendarDate
  readonly cardViewed?: boolean
  readonly earnedCard?: EarnedScriptureCardSnapshot
}

export interface ResolvedDurableDiscoveryAward {
  readonly awardRecord: EarnedAwardRecord
  readonly validatedCard: EarnedScriptureCardSnapshot | null
}

export interface MonthCompletionSummary {
  readonly completedCount: number
  readonly totalChallenges: number
  readonly label: string
}

const YEAR_MONTH_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/

export function isValidYearMonth(value: string): boolean {
  return YEAR_MONTH_PATTERN.test(value.trim())
}

/** Returns 0 = Monday .. 6 = Sunday for a civil date without local timezone shifts. */
export function getMondayBasedWeekdayIndex(year: number, month: number, day: number): number {
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return (jsDay + 6) % 7
}

export function formatYearMonthHeading(yearMonth: string): string {
  if (!isValidYearMonth(yearMonth)) return yearMonth
  const year = Number(yearMonth.slice(0, 4))
  const month = Number(yearMonth.slice(5, 7))
  return new Intl.DateTimeFormat('en', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 15)))
}

export function formatShortMonthName(yearMonth: string): string {
  if (!isValidYearMonth(yearMonth)) return yearMonth
  const year = Number(yearMonth.slice(0, 4))
  const month = Number(yearMonth.slice(5, 7))
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 15)))
}

export function getAdjacentYearMonths(yearMonth: string): {
  readonly previous: string
  readonly next: string
} {
  const year = Number(yearMonth.slice(0, 4))
  const month = Number(yearMonth.slice(5, 7))
  const prevYear = month === 1 ? year - 1 : year
  const prevMonth = month === 1 ? 12 : month - 1
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  return {
    previous: `${String(prevYear).padStart(4, '0')}-${String(prevMonth).padStart(2, '0')}`,
    next: `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}`,
  }
}

export function formatCivilYearMonthFromDate(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`
}

/**
 * Extracts canonical `cms:` completed Challenge IDs from `ReaderParticipationData`
 * for `POST /api/months/:yearMonth/progress`.
 *
 * When `slots` is supplied, intersects with the month's active `available` Challenge IDs
 * so multi-year readers with >500 lifetime completions never exceed the 500-ID gateway limit.
 */
export function extractCompletedCmsChallengeIdsForMonth(
  data: ReaderParticipationData,
  slots?: readonly (MonthSlot | MonthSlotPreview)[],
): string[] {
  let allowedIds: Set<CanonicalChallengeId> | null = null
  if (slots) {
    allowedIds = new Set<CanonicalChallengeId>()
    for (const slot of slots) {
      if (slot.availability === 'available') {
        const canonicalId = toCanonicalCmsChallengeId(slot.challengeId)
        if (canonicalId) allowedIds.add(canonicalId)
      }
    }
  }

  const result: string[] = []
  for (const id of Object.keys(data.completedChallenges)) {
    const canonical = parseStoredChallengeId(id, 'cms')
    if (!canonical) continue
    if (allowedIds && !allowedIds.has(canonical)) continue
    result.push(canonical)
    if (result.length >= MAX_MONTH_PROGRESS_IDS) break
  }
  return result
}

function resolvePriorityContinueChallengeId(
  slots: readonly (MonthSlot | MonthSlotPreview)[],
  data: ReaderParticipationData,
): CanonicalChallengeId | undefined {
  const inProgressIds: { challengeId: CanonicalChallengeId; updatedOn: string; dayOfMonth: number }[] = []

  for (const slot of slots) {
    if (slot.availability !== 'available') continue
    const canonicalId = toCanonicalCmsChallengeId(slot.challengeId)
    if (!canonicalId) continue
    const view = selectChallengeParticipationView(data, canonicalId)
    if (view.isInProgress && !view.isCompleted) {
      const updatedOn = data.inProgressChallenges[canonicalId]?.updatedOn ?? ''
      inProgressIds.push({
        challengeId: canonicalId,
        updatedOn,
        dayOfMonth: slot.dayOfMonth,
      })
    }
  }

  if (inProgressIds.length === 0) return undefined

  const lastOpenedId = data.lastOpenedChallenge?.challengeId
  if (lastOpenedId && inProgressIds.some(entry => entry.challengeId === lastOpenedId)) {
    return lastOpenedId
  }

  inProgressIds.sort((a, b) => {
    if (a.updatedOn !== b.updatedOn) return b.updatedOn.localeCompare(a.updatedOn)
    return b.dayOfMonth - a.dayOfMonth
  })
  return inProgressIds[0]?.challengeId
}

export function deriveMonthSlotPresentations(
  year: number,
  month: number,
  slots: readonly (MonthSlot | MonthSlotPreview)[],
  participationData?: ReaderParticipationData,
): MonthSlotPresentation[] {
  const continueChallengeId = participationData
    ? resolvePriorityContinueChallengeId(slots, participationData)
    : undefined

  return slots.map(slot => {
    const weekdayIndex = getMondayBasedWeekdayIndex(year, month, slot.dayOfMonth)
    const weekdayLabel = WEEKDAY_SHORT_LABELS[weekdayIndex]

    if (slot.availability === 'comingSoon') {
      return {
        dayOfMonth: slot.dayOfMonth,
        date: slot.date,
        weekdayIndex,
        weekdayLabel,
        status: 'comingSoon',
        statusLabel: 'Coming Soon',
        interactive: false,
        title: slot.title,
      }
    }

    if (slot.availability === 'unavailable') {
      const formerId = 'formerChallengeId' in slot ? slot.formerChallengeId : undefined
      const previouslyCompleted = Boolean(
        formerId && participationData && Object.hasOwn(participationData.completedChallenges, formerId),
      )
      return {
        dayOfMonth: slot.dayOfMonth,
        date: slot.date,
        weekdayIndex,
        weekdayLabel,
        status: 'unavailable',
        statusLabel: 'Unavailable',
        interactive: false,
        ...(previouslyCompleted ? { previouslyCompleted: true } : {}),
      }
    }

    const canonicalId = toCanonicalCmsChallengeId(slot.challengeId)
    const view =
      participationData && canonicalId
        ? selectChallengeParticipationView(participationData, canonicalId)
        : null

    if (view?.isCompleted) {
      return {
        dayOfMonth: slot.dayOfMonth,
        date: slot.date,
        weekdayIndex,
        weekdayLabel,
        status: 'completed',
        statusLabel: 'Completed',
        interactive: true,
        title: slot.title,
        slug: slot.slug,
        challengeId: slot.challengeId,
        challengeType: slot.challengeType,
        ...(view.completedOn ? { completedOn: view.completedOn } : {}),
      }
    }

    if (view?.isInProgress) {
      const isContinue = canonicalId !== null && canonicalId === continueChallengeId
      return {
        dayOfMonth: slot.dayOfMonth,
        date: slot.date,
        weekdayIndex,
        weekdayLabel,
        status: isContinue ? 'continue' : 'inProgress',
        statusLabel: isContinue ? 'Continue' : 'In progress',
        interactive: true,
        title: slot.title,
        slug: slot.slug,
        challengeId: slot.challengeId,
        challengeType: slot.challengeType,
      }
    }

    return {
      dayOfMonth: slot.dayOfMonth,
      date: slot.date,
      weekdayIndex,
      weekdayLabel,
      status: 'available',
      statusLabel: 'Available',
      interactive: true,
      title: slot.title,
      slug: slot.slug,
      challengeId: slot.challengeId,
      challengeType: slot.challengeType,
    }
  })
}

/**
 * Groups civil-day slots into Monday–Sunday calendar weeks (preserving partial first
 * and last weeks with padded leading/trailing grid cells).
 */
export function groupMonthSlotsByWeek(
  yearMonth: string,
  presentations: readonly MonthSlotPresentation[],
): MonthCalendarWeek[] {
  if (presentations.length === 0) return []

  const shortMonth = formatShortMonthName(yearMonth)
  const weeks: MonthCalendarWeek[] = []
  let currentWeekSlots: MonthSlotPresentation[] = []

  const flushWeek = () => {
    if (currentWeekSlots.length === 0) return
    const first = currentWeekSlots[0]
    const last = currentWeekSlots[currentWeekSlots.length - 1]
    const cells: MonthCalendarCell[] = Array.from({ length: 7 }, (_, weekdayIndex) => {
      const match = currentWeekSlots.find(slot => slot.weekdayIndex === weekdayIndex) ?? null
      return {
        weekdayIndex,
        dayOfMonth: match ? match.dayOfMonth : null,
        slot: match,
      }
    })
    const label =
      first.dayOfMonth === last.dayOfMonth
        ? `${shortMonth} ${first.dayOfMonth}`
        : `${shortMonth} ${first.dayOfMonth}–${last.dayOfMonth}`

    weeks.push({
      weekNumber: weeks.length + 1,
      label,
      startDay: first.dayOfMonth,
      endDay: last.dayOfMonth,
      slots: currentWeekSlots,
      cells,
    })
    currentWeekSlots = []
  }

  for (const slot of presentations) {
    if (currentWeekSlots.length > 0 && slot.weekdayIndex === 0) {
      flushWeek()
    }
    currentWeekSlots.push(slot)
  }
  flushWeek()

  return weeks
}

/**
 * Resolves a durable `ReaderParticipationStore` award record and validates its stored
 * `EarnedScriptureCardSnapshot` against canonical discovery/month identity.
 * Returns `null` if no durable award exists or if month/discovery/card identity mismatches.
 */
export function resolveDurableDiscoveryAward(
  participationData: ReaderParticipationData | undefined,
  discoveryId: string,
  kind: 'thematic' | 'fullMonth',
  expectedMonthId: string,
): ResolvedDurableDiscoveryAward | null {
  const normalizedMonth = parsePublicationYearMonth(expectedMonthId)
  const parsedDiscovery = parseCanonicalMonthlyDiscoveryId(discoveryId)
  if (
    !participationData
    || !normalizedMonth
    || !parsedDiscovery
    || parsedDiscovery.publicationYearMonth !== normalizedMonth
    || parsedDiscovery.kind !== kind
  ) {
    return null
  }

  const candidate = selectEarnedAward(participationData, parsedDiscovery.awardId)
  if (
    !candidate
    || candidate.awardId !== parsedDiscovery.awardId
    || candidate.publicationYearMonth !== normalizedMonth
    || candidate.discoveryId !== parsedDiscovery.discoveryId
    || candidate.kind !== parsedDiscovery.kind
  ) {
    return null
  }

  let validatedCard: EarnedScriptureCardSnapshot | null = null
  if (candidate.earnedCard) {
    const snapshot = validateEarnedCardSnapshot(candidate.earnedCard, normalizedMonth)
    if (snapshot && (!candidate.cardDocumentId || candidate.cardDocumentId === snapshot.cardDocumentId)) {
      validatedCard = snapshot
    }
  }

  return {
    awardRecord: candidate,
    validatedCard,
  }
}

/**
 * Resolves Monthly Discoveries for an active or historical month, placing thematic
 * goals first and the full-month completion goal strictly LAST.
 * Never invents qualifying mappings, exposes unearned Card details, or treats
 * un-admitted provisional gateway progress as a viewable stored Card.
 */
export function resolveMonthDiscoveryPresentations(
  summaries: readonly MonthDiscoverySummary[],
  progress: MonthProgressData | null,
  expectedMonthId: string,
  participationData?: ReaderParticipationData,
): MonthDiscoveryPresentation[] {
  const normalizedExpectedMonth = parsePublicationYearMonth(expectedMonthId)
  const validProgress =
    progress && normalizedExpectedMonth && progress.monthId === normalizedExpectedMonth
      ? progress
      : null
  const progressById = new Map(
    (validProgress?.discoveries ?? []).map(item => [item.discoveryId, item] as const),
  )
  const combinedById = new Map(
    combineGatewayProgressWithStoredAwards(
      {
        monthId: normalizedExpectedMonth ?? expectedMonthId,
        discoveries: summaries.map(summary => {
          const current = progressById.get(summary.discoveryId)
          return current ?? {
            discoveryId: summary.discoveryId,
            kind: summary.kind,
            title: summary.title,
            achievedCount: 0,
            targetCount: summary.targetCount,
            isEarned: false,
          }
        }),
      },
      participationData ?? emptyReaderParticipationData(),
    ).map(discovery => [discovery.discoveryId, discovery] as const),
  )

  const combined: MonthDiscoveryPresentation[] = summaries.map(summary => {
    const prog = progressById.get(summary.discoveryId)
    const combinedEntry = combinedById.get(summary.discoveryId)
    const durable = resolveDurableDiscoveryAward(
      participationData,
      summary.discoveryId,
      summary.kind,
      expectedMonthId,
    )
    const hasStoredAward = durable !== null
    const hasCardDisplay = durable !== null && durable.validatedCard !== null

    return {
      discoveryId: summary.discoveryId,
      kind: summary.kind,
      title: summary.title,
      achievedCount: prog ? prog.achievedCount : 0,
      targetCount: prog ? prog.targetCount : summary.targetCount,
      isEarned: combinedEntry?.effectiveEarned ?? false,
      hasStoredAward,
      hasCardDisplay,
      ...(durable
        ? {
            awardId: durable.awardRecord.awardId,
            earnedOn: durable.awardRecord.earnedOn,
            cardViewed: durable.awardRecord.cardViewed,
          }
        : {}),
      ...(hasCardDisplay && durable?.validatedCard
        ? { earnedCard: durable.validatedCard }
        : {}),
    }
  })

  const thematic = combined.filter(d => d.kind === 'thematic')
  const fullMonth = combined.filter(d => d.kind === 'fullMonth')
  return [...thematic, ...fullMonth]
}

export function deriveMonthCompletionSummary(
  totalChallenges: number,
  slots: readonly MonthSlotPresentation[],
  progress: MonthProgressData | null,
  expectedMonthId: string,
): MonthCompletionSummary {
  const localCompletedCount = slots.filter(
    slot => slot.status === 'completed' || slot.previouslyCompleted === true,
  ).length
  const validProgress = progress && progress.monthId === expectedMonthId ? progress : null
  const completedCount = validProgress ? validProgress.completedInMonthCount : localCompletedCount
  const total = validProgress ? validProgress.totalChallenges : totalChallenges
  return {
    completedCount,
    totalChallenges: total,
    label: `${completedCount} of ${total} Challenges`,
  }
}
