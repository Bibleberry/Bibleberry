import { useEffect } from 'react'
import type { MonthGatewayProvider } from '../../cms/reader/monthProvider.ts'
import type { ReaderParticipationSnapshot } from '../../participation/store.ts'
import type { GuestShelfSnapshot, GuestShelfStore } from '../../shelfPersistence/store.ts'
import type { TodayAuthorizedContext } from './primaryActionModel.ts'
import { loadTodayShelfRollover } from './todayShelfRollover.ts'

export function useTodayShelfRollover(
  context: TodayAuthorizedContext | null,
  participation: ReaderParticipationSnapshot,
  shelf: GuestShelfSnapshot,
  shelfStore: GuestShelfStore,
  monthProvider: Pick<MonthGatewayProvider, 'loadMonth'>,
) {
  const { authorizedLocalDate, yearMonth, effectiveTimeZone } = context ?? {}
  const shelfReady = shelf.status === 'ready'

  // Retry a queued write on a later authorized visit. Health changes alone must not loop a failed write.
  useEffect(() => {
    if (!authorizedLocalDate || !shelfReady) return
    const { health, hasPendingWrites } = shelfStore.getSnapshot()
    if (hasPendingWrites && (health === 'writeFailed' || health === 'storageUnavailable')) {
      void shelfStore.flushPending()
    }
  }, [authorizedLocalDate, shelfReady, shelfStore])

  const participationData = participation.status === 'ready' && participation.health === 'ok'
    && !participation.hasPendingWrites ? participation.data : null
  const canEvaluate = shelfReady && shelf.health === 'ok' && !shelf.hasPendingWrites
    && (!shelf.rolloverWatermark || (yearMonth && shelf.rolloverWatermark.lastNewCurrentYearMonth < yearMonth))

  useEffect(() => {
    if (!authorizedLocalDate || !yearMonth || !effectiveTimeZone || !participationData || !canEvaluate) return
    const controller = new AbortController()
    void loadTodayShelfRollover(
      { authorizedLocalDate, yearMonth, effectiveTimeZone },
      participationData,
      monthProvider,
      controller.signal,
    ).then(params => {
      if (controller.signal.aborted || !params) return
      const latest = shelfStore.getSnapshot()
      if (latest.health !== 'ok' || latest.hasPendingWrites ||
        (latest.rolloverWatermark && latest.rolloverWatermark.lastNewCurrentYearMonth >= yearMonth)) return
      return shelfStore.evaluateMonthlyRollover(params)
    }).catch(() => {
      // The optional Shelf update must not interrupt Today or consume an unverified transition.
    })
    return () => controller.abort()
  }, [authorizedLocalDate, yearMonth, effectiveTimeZone, participationData, canEvaluate, shelfStore, monthProvider])
}
