import type { CmsChallenge } from '../sanity/types.ts'
import { admitGatewayMonthProgressAwards, createRecordEarnedAwardsCommand } from '../../participation/awards.ts'
import {
  formatCanonicalChallengeId,
  parseLocalCalendarDate,
  parsePublicationYearMonth,
} from '../../participation/identity.ts'
import { extractCompletedCmsChallengeIdsForMonth } from '../../components/month/monthScreenModel.ts'
import type { AdmittedChallenge } from '../../participation/admission.ts'
import type { ReaderParticipationStore } from '../../participation/store.ts'
import type { MonthGatewayProvider, MonthProgressResult } from './monthProvider.ts'

export type MonthAwardReconciliationStatus =
  | 'recorded'
  | 'noAwards'
  | 'notMonthly'
  | 'unverifiedMonth'
  | 'progressUnavailable'

/**
 * Admits and persists only awards from a successful gateway progress response.
 * The gateway-authorized local date is preserved by `admitGatewayMonthProgressAwards`.
 */
export async function persistGatewayMonthProgressAwards(
  store: ReaderParticipationStore,
  result: MonthProgressResult,
  expectedMonthId?: string,
): Promise<number> {
  if (result.status !== 'ready' || result.source !== 'gateway') return 0

  const { progress, serverContext } = result
  if (expectedMonthId !== undefined && progress.monthId !== expectedMonthId) return 0
  const awards = admitGatewayMonthProgressAwards({
    ok: true,
    serverContext,
    monthId: progress.monthId,
    rosterVersion: progress.rosterVersion,
    completedInMonthCount: progress.completedInMonthCount,
    totalChallenges: progress.totalChallenges,
    thematicEarnedCount: progress.thematicEarnedCount,
    thematicTotalCount: progress.thematicTotalCount,
    discoveries: progress.discoveries,
  })
  if (awards.length === 0) return 0

  await store.dispatch(createRecordEarnedAwardsCommand(awards))
  return awards.length
}

/**
 * Runs after the explicit Finish completion command has been dispatched.
 * Month ownership comes only from the released Challenge's calendarSlot, and that
 * candidate is verified against the gateway's released month roster before progress
 * is requested. This bounded workflow intentionally outlives its initiating component.
 */
export async function reconcileFinishedChallengeMonthAwards(input: {
  readonly store: ReaderParticipationStore
  readonly monthProvider: MonthGatewayProvider
  readonly challenge: CmsChallenge
  readonly admittedChallenge: AdmittedChallenge
  readonly completionWrite: Promise<void>
}): Promise<MonthAwardReconciliationStatus> {
  const {
    store,
    monthProvider,
    challenge,
    admittedChallenge,
    completionWrite,
  } = input

  await completionWrite
  await store.whenReady()

  const challengeId = formatCanonicalChallengeId('cms', challenge.documentId)
  const monthId = parsePublicationYearMonth(challenge.calendarSlot?.monthId)
  const publicationDate = parseLocalCalendarDate(challenge.calendarSlot?.publicationDate)
  if (
    admittedChallenge.namespace !== 'cms'
    || !challengeId
    || challengeId !== admittedChallenge.challengeId
    || !monthId
    || !publicationDate
    || publicationDate.slice(0, 7) !== monthId
    || challenge.calendarSlot?.dayOfMonth !== Number(publicationDate.slice(8, 10))
    || (challenge.calendarSlot?.documentId !== undefined
      && challenge.calendarSlot.documentId !== `month-${monthId}`)
  ) {
    return 'notMonthly'
  }

  const completionSnapshot = store.getSnapshot()
  if (completionSnapshot.status !== 'ready') return 'unverifiedMonth'
  if (!Object.hasOwn(completionSnapshot.data.completedChallenges, challengeId)) {
    return 'unverifiedMonth'
  }

  const requestOptions = createBoundedRequestOptions()
  let monthResult
  try {
    monthResult = await monthProvider.loadMonth(monthId, { signal: requestOptions.signal })
  } catch {
    return 'unverifiedMonth'
  } finally {
    requestOptions.dispose()
  }

  if (
    monthResult.status !== 'ready'
    || monthResult.source !== 'gateway'
    || monthResult.month.monthId !== monthId
    || monthResult.month.documentId !== `month-${monthId}`
  ) {
    return 'unverifiedMonth'
  }

  const authorizedDate = parseLocalCalendarDate(monthResult.serverContext.authorizedLocalDate)
  if (!authorizedDate) return 'unverifiedMonth'

  const challengeSlots = monthResult.month.slots.filter(
    slot => slot.availability === 'available' && slot.challengeId === challengeId,
  )
  if (
    challengeSlots.length !== 1
    || challengeSlots[0]?.date !== publicationDate
    || challengeSlots[0].date > authorizedDate
  ) {
    return 'unverifiedMonth'
  }

  const releasedSlots = monthResult.month.slots.filter(
    slot => slot.availability === 'available' && slot.date <= authorizedDate,
  )
  const completedChallengeIds = extractCompletedCmsChallengeIdsForMonth(
    completionSnapshot.data,
    releasedSlots,
  )

  const progressOptions = createBoundedRequestOptions()
  let progressResult: MonthProgressResult
  try {
    progressResult = await monthProvider.loadMonthProgress(
      monthId,
      completedChallengeIds,
      { signal: progressOptions.signal },
    )
  } catch {
    return 'progressUnavailable'
  } finally {
    progressOptions.dispose()
  }

  if (
    progressResult.status !== 'ready'
    || progressResult.source !== 'gateway'
    || progressResult.progress.monthId !== monthId
  ) {
    return 'progressUnavailable'
  }

  return (await persistGatewayMonthProgressAwards(store, progressResult, monthId)) > 0
    ? 'recorded'
    : 'noAwards'
}

const RECONCILIATION_REQUEST_TIMEOUT_MS = 8_000

function createBoundedRequestOptions() {
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    RECONCILIATION_REQUEST_TIMEOUT_MS,
  )
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timeout)
    },
  }
}
