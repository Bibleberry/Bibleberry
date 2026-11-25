import { Capacitor } from '@capacitor/core'
import { useEffect, useState } from 'react'
import { defaultGatewayChallengeProvider } from '../../cms/reader/challengeDetailProvider.ts'
import type { MonthGatewayProvider } from '../../cms/reader/monthProvider.ts'
import { createCapacitorPreferencesDriver } from '../../participation/drivers/capacitorPreferencesDriver.ts'
import { createWebLocalStorageDriver } from '../../participation/drivers/webLocalStorageDriver.ts'
import type { ReaderParticipationData } from '../../participation/types.ts'
import type { ReaderParticipationSnapshot, ReaderParticipationStore } from '../../participation/store.ts'
import type { HubContinueSuggestion } from '../../hubContinue/types.ts'
import type { GuestShelfSnapshot, GuestShelfStore } from '../../shelfPersistence/store.ts'
import { getPreviousPublicationYearMonth } from '../../shelf/validation.ts'
import { confirmsPriorMonthPosition, selectPriorMonthCandidates } from './priorMonthContinue.ts'
import { createPriorMonthVisitStore, PRIOR_MONTH_VISIT_KEY } from './priorMonthVisitStore.ts'
import type { TodayRolloverContext } from './todayShelfRollover.ts'

const native = Capacitor.isNativePlatform()
const visits = createPriorMonthVisitStore(
  native ? createCapacitorPreferencesDriver() : createWebLocalStorageDriver(),
  async operation => !native && typeof navigator !== 'undefined' && navigator.locks
    ? navigator.locks.request(PRIOR_MONTH_VISIT_KEY, operation)
    : operation(),
)

export function usePriorMonthContinue(
  context: TodayRolloverContext | null,
  participation: ReaderParticipationSnapshot,
  shelf: GuestShelfSnapshot,
  participationStore: ReaderParticipationStore,
  shelfStore: GuestShelfStore,
  monthProvider: MonthGatewayProvider,
) {
  const [presented, setPresented] = useState<{ yearMonth: string; suggestion: HubContinueSuggestion } | null>(null)
  const data = participation.status === 'ready' && participation.health === 'ok' && !participation.hasPendingWrites
    ? participation.data : null
  const shelfReady = shelf.status === 'ready' && shelf.health === 'ok' && !shelf.hasPendingWrites
  const activeFocus = shelf.state.activeFocusMonth
  const { yearMonth, authorizedLocalDate, effectiveTimeZone } = context ?? {}

  useEffect(() => {
    if (!yearMonth || !authorizedLocalDate || !effectiveTimeZone || !data || !shelfReady) return
    const endingMonth = getPreviousPublicationYearMonth(yearMonth)
    if (!endingMonth) return
    const controller = new AbortController()
    const { signal } = controller

    function stillOnVisit() {
      const latest = participationStore.getSnapshot()
      const latestShelf = shelfStore.getSnapshot()
      return !signal.aborted && latest.status === 'ready' && latest.health === 'ok' &&
        !latest.hasPendingWrites && latest.data === data && latestShelf.status === 'ready' &&
        latestShelf.health === 'ok' && !latestShelf.hasPendingWrites && latestShelf.state.activeFocusMonth === activeFocus
    }

    async function evaluate(current: TodayRolloverContext, endingMonth: string, saved: ReaderParticipationData) {
      if (!await visits.isOpen(current.yearMonth) || !stillOnVisit()) return
      let suggestion: HubContinueSuggestion | undefined
      if (!activeFocus && Object.values(saved.inProgressChallenges).some(record => record.screenId)) {
        const roster = await monthProvider.loadMonth(endingMonth, { signal, timeZone: current.effectiveTimeZone })
        if (signal.aborted || roster.source !== 'gateway' ||
          (roster.status !== 'ready' && roster.status !== 'notFound')) return
        for (const candidate of selectPriorMonthCandidates(current, roster, saved)) {
          const detail = await defaultGatewayChallengeProvider.loadChallenge(candidate.challengeSlug, { signal })
          if (signal.aborted || detail.status === 'requestError') return
          if (confirmsPriorMonthPosition(candidate, detail)) {
            suggestion = candidate
            break
          }
        }
      }
      const recorded = await visits.settle(current.yearMonth, suggestion ? 'presented' : 'closed', stillOnVisit)
      if (recorded && suggestion && stillOnVisit()) {
        setPresented({ yearMonth: current.yearMonth, suggestion })
      }
    }

    void evaluate({ yearMonth, authorizedLocalDate, effectiveTimeZone }, endingMonth, data).catch(() => {
      // Today and the Library continue to work when the optional offer cannot be verified or recorded.
    })
    return () => controller.abort()
  }, [yearMonth, authorizedLocalDate, effectiveTimeZone, data, shelfReady, activeFocus, participationStore, shelfStore, monthProvider])

  const suggestion = presented?.suggestion
  return shelfReady && !activeFocus && presented?.yearMonth === yearMonth && suggestion && data
    && !Object.hasOwn(data.completedChallenges, suggestion.challengeId)
    && data.inProgressChallenges[suggestion.challengeId]?.screenId === suggestion.resumeScreenId
    ? suggestion : null
}
