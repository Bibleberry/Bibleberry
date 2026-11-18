import type { MonthDetailData, MonthDetailResult } from '../cms/reader/monthProvider.ts'
import type { ReleasedCatalogResult } from '../cms/reader/releasedCatalogProvider.ts'
import { parseLocalCalendarDate } from '../participation/identity.ts'
import type { HubContinueInput } from '../hubContinue/types.ts'
import type { ReaderParticipationSnapshot } from '../participation/store.ts'
import { parseValidPublicationYearMonth } from '../shelf/validation.ts'
import type { GuestShelfSnapshot } from '../shelfPersistence/store.ts'

export interface HubContinueAppSources {
  readonly participation: ReaderParticipationSnapshot | null
  readonly shelf: GuestShelfSnapshot | null
  readonly monthDetailsByYearMonth:
    | ReadonlyMap<string, MonthDetailResult>
    | null
  readonly releasedCatalog: ReleasedCatalogResult | null
}

/**
 * Adapts only hydrated, healthy local state and successful gateway responses.
 * Returns null until every focused/Shelf month has an authorized detail response.
 */
export function createHubContinueAppInput(
  sources: HubContinueAppSources,
): HubContinueInput | null {
  const { participation, shelf, monthDetailsByYearMonth, releasedCatalog } = sources
  if (
    participation?.status !== 'ready' ||
    participation.health !== 'ok' ||
    shelf?.status !== 'ready' ||
    shelf.health !== 'ok' ||
    !monthDetailsByYearMonth ||
    !releasedCatalog ||
    releasedCatalog.source !== 'gateway' ||
    (releasedCatalog.status !== 'ready' && releasedCatalog.status !== 'empty')
  ) {
    return null
  }

  const requiredMonths = new Set<string>()
  const activeFocusMonth = shelf.state.activeFocusMonth
  if (activeFocusMonth) {
    if (!parseValidPublicationYearMonth(activeFocusMonth)) return null
    requiredMonths.add(activeFocusMonth)
  }

  for (const entry of shelf.state.months) {
    if (!parseValidPublicationYearMonth(entry.yearMonth)) return null
    requiredMonths.add(entry.yearMonth)
  }

  if (requiredMonths.size === 0) return null

  const authorizedMonthDetails = new Map<string, MonthDetailData>()
  let referenceCurrentYearMonth: string | null = null
  let referenceAuthorizedLocalDate: string | null = null
  let referenceTimeZone: string | null = null

  for (const yearMonth of requiredMonths) {
    const result = monthDetailsByYearMonth.get(yearMonth)
    if (
      result?.status !== 'ready' ||
      result.source !== 'gateway' ||
      result.month.monthId !== yearMonth
    ) {
      return null
    }

    const authorizedDate = parseLocalCalendarDate(result.serverContext.authorizedLocalDate)
    const effectiveTimeZone = result.serverContext.effectiveTimeZone
    if (!authorizedDate || !effectiveTimeZone) return null

    const resultReferenceMonth = authorizedDate.slice(0, 7)
    if (
      (referenceCurrentYearMonth !== null && referenceCurrentYearMonth !== resultReferenceMonth) ||
      (referenceAuthorizedLocalDate !== null && referenceAuthorizedLocalDate !== authorizedDate) ||
      (referenceTimeZone !== null && referenceTimeZone !== effectiveTimeZone)
    ) {
      return null
    }

    referenceCurrentYearMonth = resultReferenceMonth
    referenceAuthorizedLocalDate = authorizedDate
    referenceTimeZone = effectiveTimeZone
    authorizedMonthDetails.set(yearMonth, result.month)
  }

  if (!referenceCurrentYearMonth) return null

  return {
    shelfState: shelf.state,
    participationData: participation.data,
    monthDetailsByYearMonth: authorizedMonthDetails,
    releasedCatalog:
      releasedCatalog.status === 'ready' ? releasedCatalog.challenges : [],
    referenceCurrentYearMonth,
  }
}
