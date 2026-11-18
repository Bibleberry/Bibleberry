import { useCallback, useMemo, useState } from 'react'
import { defaultGuestParticipationStore } from '../../participation/defaultGuestStore.ts'
import { formatLocalCalendarDate } from '../../participation/identity.ts'
import type { ReaderParticipationStore } from '../../participation/store.ts'
import { useReaderParticipation } from '../../participation/useReaderParticipation.ts'
import {
  buildSetScriptureSavedCommand,
  selectScriptureCaptureState,
} from '../../scriptureCapture/model.ts'
import type {
  ScriptureCaptureActionResult,
  ScriptureCaptureInput,
  ScriptureCaptureOptions,
  ScriptureCaptureState,
} from '../../scriptureCapture/types.ts'

export interface UseSaveScriptureOptions extends ScriptureCaptureInput, ScriptureCaptureOptions {
  /** Durable V2 participation store. Defaults to `defaultGuestParticipationStore`. */
  readonly store?: ReaderParticipationStore
}

export interface UseSaveScriptureResult {
  readonly state: ScriptureCaptureState
  readonly isRetryingWrite: boolean
  readonly save: () => Promise<ScriptureCaptureActionResult>
  readonly remove: () => Promise<ScriptureCaptureActionResult>
  readonly toggle: () => Promise<ScriptureCaptureActionResult>
  readonly retry: () => Promise<void>
}

function toBlockedResult(state: ScriptureCaptureState): ScriptureCaptureActionResult {
  if (state.status === 'hydrating') {
    return { ok: false, reason: 'hydrating' }
  }
  if (state.status === 'corruptStoredData') {
    return { ok: false, reason: 'corruptStoredData' }
  }
  if (state.status === 'unsupportedNewerSchema') {
    return { ok: false, reason: 'unsupportedNewerSchema' }
  }
  return {
    ok: false,
    reason: state.validationReason ?? 'malformed_reference',
  }
}

/**
 * React hook connecting any reader surface to `ReaderParticipationStore` for
 * saving and removing a validated Scripture reference (R09-2).
 */
export function useSaveScripture({
  reference,
  translation,
  sourceChallenge,
  sourceChallengeId,
  store = defaultGuestParticipationStore,
  allowedNamespace = 'cms',
  getToday = formatLocalCalendarDate,
}: UseSaveScriptureOptions): UseSaveScriptureResult {
  const snapshot = useReaderParticipation(store)
  const [isRetryingWrite, setIsRetryingWrite] = useState(false)

  const state = useMemo(
    () =>
      selectScriptureCaptureState(
        snapshot,
        { reference, translation, sourceChallenge, sourceChallengeId },
        allowedNamespace,
      ),
    [snapshot, reference, translation, sourceChallenge, sourceChallengeId, allowedNamespace],
  )

  const save = useCallback(async (): Promise<ScriptureCaptureActionResult> => {
    if (!state.canMutate || !state.validated) {
      return toBlockedResult(state)
    }
    if (state.isSaved) {
      return { ok: true, action: 'unchanged', key: state.validated.key }
    }
    await store.dispatch(buildSetScriptureSavedCommand(state.validated, true, getToday()))
    return { ok: true, action: 'saved', key: state.validated.key }
  }, [state, store, getToday])

  const remove = useCallback(async (): Promise<ScriptureCaptureActionResult> => {
    if (!state.canMutate || !state.validated) {
      return toBlockedResult(state)
    }
    if (!state.isSaved) {
      return { ok: true, action: 'unchanged', key: state.validated.key }
    }
    await store.dispatch(buildSetScriptureSavedCommand(state.validated, false, getToday()))
    return { ok: true, action: 'removed', key: state.validated.key }
  }, [state, store, getToday])

  const toggle = useCallback(async (): Promise<ScriptureCaptureActionResult> => {
    if (!state.canMutate || !state.validated) {
      return toBlockedResult(state)
    }
    const nextSaved = !state.isSaved
    await store.dispatch(buildSetScriptureSavedCommand(state.validated, nextSaved, getToday()))
    return { ok: true, action: nextSaved ? 'saved' : 'removed', key: state.validated.key }
  }, [state, store, getToday])

  const retry = useCallback(async () => {
    if (isRetryingWrite) return
    setIsRetryingWrite(true)
    try {
      await store.flushPending()
    } finally {
      setIsRetryingWrite(false)
    }
  }, [isRetryingWrite, store])

  return {
    state,
    isRetryingWrite,
    save,
    remove,
    toggle,
    retry,
  }
}
