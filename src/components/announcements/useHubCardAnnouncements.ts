import { useCallback, useEffect, useReducer, useRef } from 'react'
import { defaultGuestParticipationStore } from '../../participation/defaultGuestStore.ts'
import type { ReaderParticipationStore } from '../../participation/store.ts'
import { useReaderParticipation } from '../../participation/useReaderParticipation.ts'
import {
  defaultAnnouncementPreferencesStore,
  useAnnouncementPreferences,
  type AnnouncementPreferencesStore,
} from './announcementPreferencesStorage.ts'
import {
  arriveAtHubState,
  beginAcknowledgeBatchState,
  completeAcknowledgeBatchState,
  createInitialHubAnnouncementState,
  dismissFailedAcknowledgeBatchState,
  evaluateHubAnnouncementState,
  failAcknowledgeBatchState,
  leaveHubState,
  selectPresentedBatchAwardIds,
  setActiveSurfaceState,
  type AnnouncementAckStatus,
  type HubAnnouncementEvaluationInput,
  type HubAnnouncementState,
  type HubSurface,
  type PresentedEarnedAwardItem,
} from './hubCardAnnouncementModel.ts'

export interface UseHubCardAnnouncementsOptions {
  readonly store?: ReaderParticipationStore
  readonly preferencesStore?: AnnouncementPreferencesStore
  /**
   * Optional declarative surface state. When provided, transitions into `'hub'` trigger
   * Hub arrival and transitions away from `'hub'` close any un-dismissed dialog without
   * acknowledging pending awards.
   */
  readonly surface?: HubSurface
  /** Alternative declarative boolean for callers that already track `isHubActive`. */
  readonly isHubActive?: boolean
}

export interface UseHubCardAnnouncementsResult {
  readonly isOpen: boolean
  readonly isHubActive: boolean
  readonly items: readonly PresentedEarnedAwardItem[]
  readonly ackStatus: AnnouncementAckStatus
  readonly ackErrorMessage: string | null
  readonly announcementsEnabled: boolean
  readonly preferencesReady: boolean
  readonly participationReady: boolean
  readonly onHubArrive: () => void
  readonly leaveHub: () => void
  readonly setSurface: (surface: HubSurface) => void
  readonly dismissAnnouncement: () => Promise<boolean>
  readonly retryAcknowledge: () => Promise<boolean>
  readonly closeAfterAckFailure: () => void
  readonly openFieldNotebook: (navigateToNotebook: () => void) => Promise<boolean>
  readonly setAnnouncementsEnabled: (enabled: boolean) => Promise<void>
}

type HubAnnouncementAction =
  | { readonly type: 'arriveAtHub' }
  | { readonly type: 'leaveHub' }
  | { readonly type: 'setSurface'; readonly surface: HubSurface }
  | { readonly type: 'evaluate'; readonly input: HubAnnouncementEvaluationInput }
  | { readonly type: 'beginAck' }
  | { readonly type: 'completeAck' }
  | { readonly type: 'failAck'; readonly message?: string }
  | { readonly type: 'dismissFailedAck' }

function hubAnnouncementReducer(
  state: HubAnnouncementState,
  action: HubAnnouncementAction,
): HubAnnouncementState {
  switch (action.type) {
    case 'arriveAtHub':
      return arriveAtHubState(state)
    case 'leaveHub':
      return leaveHubState(state)
    case 'setSurface':
      return setActiveSurfaceState(state, action.surface)
    case 'evaluate':
      return evaluateHubAnnouncementState(state, action.input)
    case 'beginAck':
      return beginAcknowledgeBatchState(state)
    case 'completeAck':
      return completeAcknowledgeBatchState(state)
    case 'failAck':
      return failAcknowledgeBatchState(state, action.message)
    case 'dismissFailedAck':
      return dismissFailedAcknowledgeBatchState(state)
  }
}

function isPersistedHealthOk(
  store: ReaderParticipationStore,
): boolean {
  const health = store.getSnapshot().health
  return health === 'ok'
}

/**
 * React hook orchestrating Hub-only combined earned Scripture Card announcements (R14-6).
 *
 * Connects `ReaderParticipationStore` and `AnnouncementPreferencesStore` to the pure
 * Hub-visit batch controller. Never triggers announcements on non-Hub surfaces, never
 * clears `cardViewed`, and freezes the presented batch IDs when opened.
 */
export function useHubCardAnnouncements(
  options: UseHubCardAnnouncementsOptions = {},
): UseHubCardAnnouncementsResult {
  const {
    store = defaultGuestParticipationStore,
    preferencesStore = defaultAnnouncementPreferencesStore,
    surface,
    isHubActive: isHubActiveProp,
  } = options

  const controlledActive =
    surface !== undefined
      ? surface === 'hub'
      : isHubActiveProp !== undefined
        ? isHubActiveProp
        : undefined

  const participationSnapshot = useReaderParticipation(store)
  const preferencesSnapshot = useAnnouncementPreferences(preferencesStore)

  const [state, dispatch] = useReducer(
    hubAnnouncementReducer,
    controlledActive ?? false,
    createInitialHubAnnouncementState,
  )

  const isMountedRef = useRef(true)
  const ackInFlightRef = useRef(false)
  const openBatchRef = useRef<readonly PresentedEarnedAwardItem[] | null>(state.openBatch)

  useEffect(() => {
    openBatchRef.current = state.openBatch
  }, [state.openBatch])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Sync declarative `surface` / `isHubActive` prop transitions
  useEffect(() => {
    if (controlledActive === undefined) return
    dispatch({ type: controlledActive ? 'arriveAtHub' : 'leaveHub' })
  }, [controlledActive])

  // Evaluate pending awards whenever Hub visit state or hydrated stores update
  useEffect(() => {
    dispatch({
      type: 'evaluate',
      input: {
        participationReady: participationSnapshot.status === 'ready',
        participationData: participationSnapshot.data,
        preferencesReady: preferencesSnapshot.status === 'ready',
        announcementsEnabled: preferencesSnapshot.data.earnedCardAnnouncementsEnabled,
      },
    })
  }, [
    state.isHubActive,
    state.visitId,
    state.openBatch,
    state.presentedVisitId,
    state.suppressedVisitId,
    participationSnapshot.status,
    participationSnapshot.data,
    preferencesSnapshot.status,
    preferencesSnapshot.data.earnedCardAnnouncementsEnabled,
  ])

  const onHubArrive = useCallback(() => {
    dispatch({ type: 'arriveAtHub' })
  }, [])

  const leaveHub = useCallback(() => {
    dispatch({ type: 'leaveHub' })
  }, [])

  const setSurface = useCallback((nextSurface: HubSurface) => {
    dispatch({ type: 'setSurface', surface: nextSurface })
  }, [])

  const dismissAnnouncement = useCallback(async (): Promise<boolean> => {
    const batch = openBatchRef.current
    if (!batch || batch.length === 0 || ackInFlightRef.current) {
      return false
    }

    const awardIds = selectPresentedBatchAwardIds(batch)
    ackInFlightRef.current = true
    dispatch({ type: 'beginAck' })

    try {
      await store.dispatch({
        type: 'acknowledgeAwardAnnouncements',
        awardIds,
      })
    } catch {
      ackInFlightRef.current = false
      if (isMountedRef.current) {
        dispatch({ type: 'failAck' })
      }
      return false
    }

    ackInFlightRef.current = false
    if (!isPersistedHealthOk(store)) {
      if (isMountedRef.current) {
        dispatch({ type: 'failAck' })
      }
      return false
    }

    if (isMountedRef.current) {
      dispatch({ type: 'completeAck' })
    }
    return true
  }, [store])

  const retryAcknowledge = useCallback(async (): Promise<boolean> => {
    if (!openBatchRef.current || ackInFlightRef.current) {
      return false
    }

    ackInFlightRef.current = true
    dispatch({ type: 'beginAck' })

    try {
      await store.flushPending()
    } catch {
      ackInFlightRef.current = false
      if (isMountedRef.current) {
        dispatch({ type: 'failAck' })
      }
      return false
    }

    ackInFlightRef.current = false
    if (!isPersistedHealthOk(store)) {
      if (isMountedRef.current) {
        dispatch({ type: 'failAck' })
      }
      return false
    }

    if (isMountedRef.current) {
      dispatch({ type: 'completeAck' })
    }
    return true
  }, [store])

  const closeAfterAckFailure = useCallback(() => {
    dispatch({ type: 'dismissFailedAck' })
  }, [])

  const openFieldNotebook = useCallback(
    async (navigateToNotebook: () => void): Promise<boolean> => {
      const ok = await dismissAnnouncement()
      if (ok) {
        navigateToNotebook()
      }
      return ok
    },
    [dismissAnnouncement],
  )

  const setAnnouncementsEnabled = useCallback(
    (enabled: boolean) => preferencesStore.setAnnouncementsEnabled(enabled),
    [preferencesStore],
  )

  return {
    isOpen: state.openBatch !== null && state.openBatch.length > 0,
    isHubActive: state.isHubActive,
    items: state.openBatch ?? [],
    ackStatus: state.ackStatus,
    ackErrorMessage: state.ackErrorMessage,
    announcementsEnabled: preferencesSnapshot.data.earnedCardAnnouncementsEnabled,
    preferencesReady: preferencesSnapshot.status === 'ready',
    participationReady: participationSnapshot.status === 'ready',
    onHubArrive,
    leaveHub,
    setSurface,
    dismissAnnouncement,
    retryAcknowledge,
    closeAfterAckFailure,
    openFieldNotebook,
    setAnnouncementsEnabled,
  }
}
