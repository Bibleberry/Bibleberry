import type { ChallengeDetailResult } from '../../cms/reader/challengeDetailProvider.ts'
import type { MonthDetailResult } from '../../cms/reader/monthProvider.ts'
import { formatYearMonthHeading } from '../../components/month/monthScreenModel.ts'
import type { HubContinueSuggestion } from '../../hubContinue/types.ts'
import { formatCanonicalChallengeId, parseLocalCalendarDate, parseStoredChallengeId } from '../../participation/identity.ts'
import type { ReaderParticipationData } from '../../participation/types.ts'
import { getPreviousPublicationYearMonth } from '../../shelf/validation.ts'
import type { TodayRolloverContext } from './todayShelfRollover.ts'

/** Candidates are in interruption order. Challenge detail must still confirm the saved screen. */
export function selectPriorMonthCandidates(
  context: TodayRolloverContext,
  result: MonthDetailResult,
  data: ReaderParticipationData,
): HubContinueSuggestion[] {
  const yearMonth = getPreviousPublicationYearMonth(context.yearMonth)
  if (!yearMonth || result.status !== 'ready' || result.source !== 'gateway' ||
    result.month.monthId !== yearMonth || result.month.phase !== 'historical' ||
    parseLocalCalendarDate(result.serverContext.authorizedLocalDate)?.slice(0, 7) !== context.yearMonth ||
    result.serverContext.effectiveTimeZone !== context.effectiveTimeZone) return []

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

export function confirmsPriorMonthPosition(candidate: HubContinueSuggestion, result: ChallengeDetailResult): boolean {
  if (result.status !== 'ready' || result.source !== 'gateway') return false
  const { challenge } = result
  return challenge.documentId === candidate.challengeDocumentId
    && challenge.id === candidate.challengeSlug
    && challenge.calendarSlot?.monthId === candidate.yearMonth
    && challenge.calendarSlot.publicationDate === candidate.publicationDate
    && challenge.screens.some(screen => screen.id === candidate.resumeScreenId)
}
