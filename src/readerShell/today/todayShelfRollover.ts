import type { MonthGatewayProvider } from '../../cms/reader/monthProvider.ts'
import {
  formatCanonicalChallengeId,
  parseLocalCalendarDate,
  parseStoredChallengeId,
} from '../../participation/identity.ts'
import type { ReaderParticipationData } from '../../participation/types.ts'
import type { MonthlyRolloverParams } from '../../shelf/types.ts'
import { getPreviousPublicationYearMonth } from '../../shelf/validation.ts'
import type { TodayAuthorizedContext } from './primaryActionModel.ts'

export type TodayRolloverContext = Pick<TodayAuthorizedContext, 'yearMonth' | 'authorizedLocalDate' | 'effectiveTimeZone'>

/** Qualify saved completions by publication slot identity. A completion's date can be much later. */
export async function loadTodayShelfRollover(
  context: TodayRolloverContext,
  participation: ReaderParticipationData,
  monthProvider: Pick<MonthGatewayProvider, 'loadMonth'>,
  signal: AbortSignal,
): Promise<MonthlyRolloverParams | null> {
  const { yearMonth, authorizedLocalDate, effectiveTimeZone } = context
  const endingYearMonth = getPreviousPublicationYearMonth(yearMonth)
  if (!endingYearMonth) return null

  const completed = participation.completedChallenges
  const completedChallengeIdsInEndingMonth = new Set<string>()
  if (Object.keys(completed).length > 0) {
    const result = await monthProvider.loadMonth(endingYearMonth, { signal, timeZone: effectiveTimeZone })
    if (signal.aborted || result.status !== 'ready' || result.source !== 'gateway') return null
    const rosterDate = parseLocalCalendarDate(result.serverContext.authorizedLocalDate)
    if (
      rosterDate?.slice(0, 7) !== yearMonth ||
      result.serverContext.effectiveTimeZone !== effectiveTimeZone ||
      result.month.monthId !== endingYearMonth ||
      result.month.phase !== 'historical'
    ) return null

    for (const slot of result.month.slots) {
      if (slot.date.slice(0, 7) !== endingYearMonth) continue
      // An authorized withdrawal can preserve a former identity and its saved progress.
      const rawId = slot.availability === 'available' ? slot.challengeId
        : slot.availability === 'unavailable' ? slot.formerChallengeId : undefined
      if (!rawId) continue
      const id = parseStoredChallengeId(rawId, 'cms') ?? formatCanonicalChallengeId('cms', rawId)
      if (id && Object.hasOwn(completed, id)) completedChallengeIdsInEndingMonth.add(id)
    }
  }

  return {
    newCurrentYearMonth: yearMonth,
    endingYearMonth,
    rolloverDate: authorizedLocalDate,
    completedChallengeIdsInEndingMonth,
  }
}
