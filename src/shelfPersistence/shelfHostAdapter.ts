import type {
  LocalCalendarDate,
  PublicationYearMonth,
} from '../participation/types.ts'
import type { ShelfHostProps } from '../components/shelf/ShelfHost.tsx'
import type { ShelfMonthMetadata } from '../components/shelf/shelfModel.ts'
import type { ShelfState } from '../shelf/types.ts'
import type {
  GuestShelfSnapshot,
  GuestShelfStore,
} from './store.ts'

/**
 * Tested state-to-`ShelfHost` integration contract (Phase 05 / R08-5 / Issue #162).
 *
 * Bridges `GuestShelfStore` + `GuestShelfSnapshot` to the standalone `ShelfHostProps`
 * controlled boundary without modifying `src/components/shelf/ShelfHost.tsx` or
 * wiring global app navigation.
 */

export interface BuildShelfHostPropsParams {
  readonly store: GuestShelfStore
  readonly snapshot: GuestShelfSnapshot
  readonly referenceCurrentYearMonth: PublicationYearMonth | string
  readonly onOpenMonth: (yearMonth: PublicationYearMonth) => void
  readonly onRequestLibraryPicker?: () => void
  readonly availableHistoricalMonths?: readonly ShelfMonthMetadata[]
  readonly monthMetadata?:
    | ReadonlyMap<string, ShelfMonthMetadata>
    | Readonly<Record<string, ShelfMonthMetadata>>
  readonly currentLocalDate?: LocalCalendarDate
  readonly onExit?: () => void
  readonly exitLabel?: string
}

export function buildShelfHostPropsFromGuestStore(
  params: BuildShelfHostPropsParams,
): ShelfHostProps {
  const {
    store,
    snapshot,
    referenceCurrentYearMonth,
    onOpenMonth,
    onRequestLibraryPicker,
    availableHistoricalMonths,
    monthMetadata,
    currentLocalDate,
    onExit,
    exitLabel,
  } = params

  return {
    referenceCurrentYearMonth,
    state: snapshot.state,
    onStateChange: (nextState: ShelfState) => {
      void store.applyState(nextState, referenceCurrentYearMonth)
    },
    onOpenMonth,
    ...(onRequestLibraryPicker ? { onRequestLibraryPicker } : {}),
    ...(availableHistoricalMonths ? { availableHistoricalMonths } : {}),
    ...(monthMetadata ? { monthMetadata } : {}),
    ...(currentLocalDate ? { currentLocalDate } : {}),
    ...(onExit ? { onExit } : {}),
    ...(exitLabel !== undefined ? { exitLabel } : {}),
  }
}
