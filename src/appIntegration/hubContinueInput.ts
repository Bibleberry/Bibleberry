import type { MonthDetailResult } from '../cms/reader/monthProvider.ts'
import type { ReleasedCatalogResult } from '../cms/reader/releasedCatalogProvider.ts'
import { parseLocalCalendarDate } from '../participation/identity.ts'
import type { HubContinueInput } from '../hubContinue/types.ts'
import type { ReaderParticipationSnapshot } from '../participation/store.ts'
import type { PublicationYearMonth } from '../participation/types.ts'
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

export function resolveHubContinueFocusMonth(
  participation: HubContinueAppSources['participation'],
  shelf: HubContinueAppSources['shelf'],
): PublicationYearMonth | null {
  if (
    participation?.status !== 'ready' ||
    participation.health !== 'ok' ||
    shelf?.status !== 'ready' ||
    shelf.health !== 'ok'
  ) {
    return null
  }

  return parseValidPublicationYearMonth(shelf.state.activeFocusMonth)
}

/** Adapts hydrated local state and gateway authorization for the Active Focus month. */
export function createHubContinueAppInput(sources: HubContinueAppSources): HubContinueInput | null {
  const { participation, shelf, monthDetailsByYearMonth, releasedCatalog } = sources
  const focusMonth = resolveHubContinueFocusMonth(participation, shelf)
  if (
    !focusMonth ||
    participation?.status !== 'ready' ||
    shelf?.status !== 'ready' ||
    !releasedCatalog ||
    releasedCatalog.source !== 'gateway' ||
    (releasedCatalog.status !== 'ready' && releasedCatalog.status !== 'empty')
  ) {
    return null
  }

  const result = monthDetailsByYearMonth?.get(focusMonth)
  if (
    result?.status !== 'ready' ||
    result.source !== 'gateway' ||
    result.month.monthId !== focusMonth
  ) {
    return null
  }

  const { authorizedLocalDate, effectiveTimeZone } = result.serverContext
  if (!parseLocalCalendarDate(authorizedLocalDate) || !effectiveTimeZone) return null

  return {
    shelfState: shelf.state,
    participationData: participation.data,
    monthDetailsByYearMonth: new Map([[focusMonth, result.month]]),
    releasedCatalog:
      releasedCatalog.status === 'ready' ? releasedCatalog.challenges : [],
    referenceCurrentYearMonth: authorizedLocalDate.slice(0, 7),
  }
}
