import { formatLocalCalendarDate } from '../participation/identity.ts'
import type { ReaderParticipationStore } from '../participation/store.ts'
import { buildSetScriptureSavedCommand, selectScriptureCaptureState } from './model.ts'
import type {
  ScriptureCaptureActionResult,
  ScriptureCaptureController,
  ScriptureCaptureInput,
  ScriptureCaptureOptions,
  ScriptureCaptureState,
} from './types.ts'

function toBlockedActionResult(state: ScriptureCaptureState): ScriptureCaptureActionResult {
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
 * Creates a platform-neutral imperative Save Scripture controller bound to any
 * `ReaderParticipationStore` (web `localStorage`, Capacitor Preferences, or synthetic test store).
 */
export function createScriptureCaptureController(
  store: ReaderParticipationStore,
  options: ScriptureCaptureOptions = {},
): ScriptureCaptureController {
  const allowedNamespace = options.allowedNamespace ?? 'cms'
  const getToday = options.getToday ?? formatLocalCalendarDate

  const getState = (input: ScriptureCaptureInput): ScriptureCaptureState =>
    selectScriptureCaptureState(store.getSnapshot(), input, allowedNamespace)

  const save = async (input: ScriptureCaptureInput): Promise<ScriptureCaptureActionResult> => {
    const state = getState(input)
    if (!state.canMutate || !state.validated) {
      return toBlockedActionResult(state)
    }
    if (state.isSaved) {
      return { ok: true, action: 'unchanged', key: state.validated.key }
    }
    await store.dispatch(buildSetScriptureSavedCommand(state.validated, true, getToday()))
    return { ok: true, action: 'saved', key: state.validated.key }
  }

  const remove = async (input: ScriptureCaptureInput): Promise<ScriptureCaptureActionResult> => {
    const state = getState(input)
    if (!state.canMutate || !state.validated) {
      return toBlockedActionResult(state)
    }
    if (!state.isSaved) {
      return { ok: true, action: 'unchanged', key: state.validated.key }
    }
    await store.dispatch(buildSetScriptureSavedCommand(state.validated, false, getToday()))
    return { ok: true, action: 'removed', key: state.validated.key }
  }

  const toggle = async (input: ScriptureCaptureInput): Promise<ScriptureCaptureActionResult> => {
    const state = getState(input)
    if (!state.canMutate || !state.validated) {
      return toBlockedActionResult(state)
    }
    const nextSaved = !state.isSaved
    await store.dispatch(buildSetScriptureSavedCommand(state.validated, nextSaved, getToday()))
    return { ok: true, action: nextSaved ? 'saved' : 'removed', key: state.validated.key }
  }

  const retry = async (): Promise<void> => {
    await store.flushPending()
  }

  return {
    getState,
    save,
    remove,
    toggle,
    retry,
  }
}
