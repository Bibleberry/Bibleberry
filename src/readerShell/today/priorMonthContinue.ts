import type { ChallengeDetailProvider, ChallengeDetailResult } from '../../cms/reader/challengeDetailProvider.ts'
import type { MonthDetailResult, MonthGatewayProvider } from '../../cms/reader/monthProvider.ts'
import { deriveReleasedChallengeDetailState } from '../../cms/reader/releasedChallengeHostModel.ts'
import { formatYearMonthHeading } from '../../components/month/monthScreenModel.ts'
import type { HubContinueSuggestion } from '../../hubContinue/types.ts'
import { formatCanonicalChallengeId, parseLocalCalendarDate, parseStoredChallengeId } from '../../participation/identity.ts'
import type { PublicationYearMonth, ReaderParticipationData } from '../../participation/types.ts'
import { getPreviousPublicationYearMonth } from '../../shelf/validation.ts'
import type { TodayRolloverContext } from './todayShelfRollover.ts'

export function isConsistentPriorMonthRoster(
  context: TodayRolloverContext,
  result: MonthDetailResult,
): result is Extract<MonthDetailResult, { status: 'ready' }> {
  const yearMonth = getPreviousPublicationYearMonth(context.yearMonth)
  return Boolean(
    yearMonth
      && result.status === 'ready'
      && result.source === 'gateway'
      && result.month.monthId === yearMonth
      && result.month.phase === 'historical'
      && parseLocalCalendarDate(result.serverContext.authorizedLocalDate)?.slice(0, 7) === context.yearMonth
      && result.serverContext.effectiveTimeZone === context.effectiveTimeZone,
  )
}

/** Candidates are in interruption order. Challenge detail must still confirm the saved screen. */
export function selectPriorMonthCandidates(
  context: TodayRolloverContext,
  result: MonthDetailResult,
  data: ReaderParticipationData,
): HubContinueSuggestion[] {
  const yearMonth = getPreviousPublicationYearMonth(context.yearMonth)
  if (!yearMonth || !isConsistentPriorMonthRoster(context, result)) return []

  const candidates: HubContinueSuggestion[] = []
  for (const slot of result.month.slots) {
    if (slot.availability !== 'available' || parseLocalCalendarDate(slot.date)?.slice(0, 7) !== yearMonth ||
      Number(slot.date.slice(8, 10)) !== slot.dayOfMonth || !slot.slug.trim() || !slot.title.trim()) continue
    const challengeId = parseStoredChallengeId(slot.challengeId, 'cms')
      ?? formatCanonicalChallengeId('cms', slot.challengeId)
    if (!challengeId || Object.hasOwn(data.completedChallenges, challengeId)) continue
    const saved = data.inProgressChallenges[challengeId]
    if (!saved?.screenId?.trim() || !parseLocalCalendarDate(saved.updatedOn)) continue

    candidates.push({
      kind: 'resumeInProgress',
      yearMonth,
      monthTitle: result.month.title,
      monthHeading: formatYearMonthHeading(yearMonth),
      formalFocusMonth: null,
      preservesFormalFocus: true,
      challengeId,
      challengeDocumentId: challengeId.slice('cms:'.length),
      challengeSlug: slot.slug,
      challengeTitle: slot.title,
      challengeType: slot.challengeType,
      dayOfMonth: slot.dayOfMonth,
      publicationDate: slot.date,
      isInProgress: true,
      resumeScreenId: saved.screenId,
      origin: { kind: 'hub' },
    })
  }

  return candidates.sort((a, b) => {
    const first = data.inProgressChallenges[a.challengeId]
    const second = data.inProgressChallenges[b.challengeId]
    const lastOpened = data.lastOpenedChallenge?.challengeId
    // Old envelopes only record a civil date. Use the last-open pointer for same-day ties
    // when possible, then publication day as the stable order for indistinguishable records.
    return (second.interruptionOrder ?? 0) - (first.interruptionOrder ?? 0)
      || second.updatedOn.localeCompare(first.updatedOn)
      || Number(b.challengeId === lastOpened) - Number(a.challengeId === lastOpened)
      || a.dayOfMonth - b.dayOfMonth
  })
}

export function isConsistentPriorMonthChallengeDetail(
  candidate: HubContinueSuggestion,
  result: ChallengeDetailResult,
): boolean {
  if (result.status !== 'ready' || result.source !== 'gateway') return false
  const { challenge } = result
  return challenge.documentId === candidate.challengeDocumentId
    && challenge.id === candidate.challengeSlug
    && challenge.calendarSlot?.monthId === candidate.yearMonth
    && challenge.calendarSlot.publicationDate === candidate.publicationDate
}

export function confirmsPriorMonthPosition(candidate: HubContinueSuggestion, result: ChallengeDetailResult): boolean {
  if (!isConsistentPriorMonthChallengeDetail(candidate, result)) return false
  const admitted = deriveReleasedChallengeDetailState(result, candidate.challengeSlug, new Date())
  return admitted.status === 'ready'
    && admitted.challenge.screens.some(screen => screen.id === candidate.resumeScreenId)
}

export type PriorMonthContinueOutcome =
  | { readonly settle: false }
  | { readonly settle: true; readonly suggestion?: HubContinueSuggestion }

export async function evaluatePriorMonthContinue(options: {
  readonly context: TodayRolloverContext
  readonly endingMonth: PublicationYearMonth
  readonly saved: ReaderParticipationData
  readonly activeFocusMonth: PublicationYearMonth | null
  readonly signal: AbortSignal
  readonly monthProvider: Pick<MonthGatewayProvider, 'loadMonth'>
  readonly challengeProvider: ChallengeDetailProvider
}): Promise<PriorMonthContinueOutcome> {
  const { context, endingMonth, saved, activeFocusMonth, signal, monthProvider, challengeProvider } = options
  if (activeFocusMonth || !Object.values(saved.inProgressChallenges).some(record => record.screenId)) {
    return { settle: true }
  }

  const roster = await monthProvider.loadMonth(endingMonth, { signal, timeZone: context.effectiveTimeZone })
  if (signal.aborted || roster.source !== 'gateway' ||
    (roster.status !== 'ready' && roster.status !== 'notFound')) {
    return { settle: false }
  }
  if (roster.status === 'notFound') {
    return { settle: true }
  }
  if (!isConsistentPriorMonthRoster(context, roster)) {
    return { settle: false }
  }

  for (const candidate of selectPriorMonthCandidates(context, roster, saved)) {
    const detail = await challengeProvider.loadChallenge(candidate.challengeSlug, { signal })
    if (signal.aborted || detail.source !== 'gateway' ||
      (detail.status !== 'ready' && detail.status !== 'notFound')) {
      return { settle: false }
    }
    if (detail.status === 'ready' && !isConsistentPriorMonthChallengeDetail(candidate, detail)) {
      return { settle: false }
    }
    if (confirmsPriorMonthPosition(candidate, detail)) {
      return { settle: true, suggestion: candidate }
    }
  }

  return { settle: true }
}
