import type { CmsScripture } from '../../cms/sanity/types.ts'
import {
  canCompleteChallenge,
  challengePlayerPosition,
  type ChallengePlayerChallenge,
} from './challengePlayerModel.ts'

/**
 * Pure, storage-free state & action controller model for the ordinary-shell ChallengePlayer host
 * (Issue #44 A2, extended in Issue #46 A3 with an explicit external-store `'actions'` mode).
 *
 * Scope boundary: `ordinaryChallengeHostModel` and `OrdinaryChallengeHost` remain completely
 * storage-free. In-memory callers use `'controlled'` or `'uncontrolled'` session state, while
 * durable store-backed hosts (`PersistedChallengeHost`) drive `'actions'` mode (`viewState` +
 * `actions`) without coupling the player host to any persistence adapter.
 */

export type OrdinarySavedScripture = {
  key: string
  scriptureId: string
  reference: string
  translation: string
}

export type OrdinaryChallengeSessionState = {
  /** Stable screen identity; missing or removed identities clamp safely in ChallengePlayer. */
  screenId: string | undefined
  isSaved: boolean
  isCompleted: boolean
  isInProgress: boolean
  /** Reference metadata only — passage text is never copied into host state. */
  savedScriptures: OrdinarySavedScripture[]
}

export type OrdinaryChallengeViewState = {
  screenId: string | undefined
  isSaved: boolean
  isCompleted: boolean
  isInProgress?: boolean
  isScriptureSaved: (scripture: CmsScripture) => boolean
}

export type OrdinaryChallengeActions = {
  onScreenChange: (screenId: string) => void
  onToggleSaveChallenge: () => void
  onToggleSaveScripture: (scripture: CmsScripture) => void
  onComplete: () => void
  onStartProgress?: () => void
}

export type OrdinaryChallengeStateController =
  | {
    mode: 'controlled'
    state: OrdinaryChallengeSessionState
    onStateChange: (next: OrdinaryChallengeSessionState) => void
  }
  | {
    mode: 'actions'
    viewState: OrdinaryChallengeViewState
    actions: OrdinaryChallengeActions
  }
  | {
    mode: 'uncontrolled'
    initialState: OrdinaryChallengeSessionState | undefined
  }

export function emptyOrdinaryChallengeSessionState(): OrdinaryChallengeSessionState {
  return {
    screenId: undefined,
    isSaved: false,
    isCompleted: false,
    isInProgress: false,
    savedScriptures: [],
  }
}

export function resolveOrdinaryChallengeStateController(input: {
  state?: OrdinaryChallengeSessionState
  onStateChange?: ((next: OrdinaryChallengeSessionState) => void) | undefined
  initialState?: OrdinaryChallengeSessionState
  viewState?: OrdinaryChallengeViewState
  actions?: OrdinaryChallengeActions
}): OrdinaryChallengeStateController {
  if (input.viewState !== undefined || input.actions !== undefined) {
    if (input.viewState === undefined || input.actions === undefined) {
      throw new TypeError('OrdinaryChallengeHost requires both viewState and actions together.')
    }
    if (
      input.state !== undefined
      || input.onStateChange !== undefined
      || input.initialState !== undefined
    ) {
      throw new TypeError(
        'OrdinaryChallengeHost does not accept state, onStateChange, or initialState when viewState and actions are provided.',
      )
    }
    return {
      mode: 'actions',
      viewState: input.viewState,
      actions: input.actions,
    }
  }

  if (input.state !== undefined) {
    if (typeof input.onStateChange !== 'function') {
      throw new TypeError('OrdinaryChallengeHost requires onStateChange when state is provided.')
    }
    if (input.initialState !== undefined) {
      throw new TypeError('OrdinaryChallengeHost does not accept initialState when state is controlled.')
    }
    return {
      mode: 'controlled',
      state: input.state,
      onStateChange: input.onStateChange,
    }
  }

  if (input.onStateChange !== undefined) {
    throw new TypeError('OrdinaryChallengeHost does not accept onStateChange without controlled state.')
  }

  return {
    mode: 'uncontrolled',
    initialState: input.initialState,
  }
}

export function applyControlledOrdinaryChallengeChange(
  current: OrdinaryChallengeSessionState,
  onStateChange: (next: OrdinaryChallengeSessionState) => void,
  updater: (state: OrdinaryChallengeSessionState) => OrdinaryChallengeSessionState,
): void {
  const next = updater(current)
  if (next !== current) {
    onStateChange(next)
  }
}

export function ordinaryScriptureKey(scripture: Pick<CmsScripture, 'reference' | 'translation'>): string {
  const reference = scripture.reference
    .trim()
    .replace(/[–—]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase()
  const translation = scripture.translation.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
  return `${reference}|${translation}`
}

export function isOrdinaryScriptureSaved(
  entries: readonly OrdinarySavedScripture[],
  scripture: Pick<CmsScripture, 'reference' | 'translation'>,
): boolean {
  const key = ordinaryScriptureKey(scripture)
  return entries.some(entry => entry.key === key)
}

export function startOrdinaryChallengeProgress(
  state: OrdinaryChallengeSessionState,
): OrdinaryChallengeSessionState {
  if (state.isCompleted || state.isInProgress) return state
  return { ...state, isInProgress: true }
}

export function setOrdinaryChallengeScreen(
  challenge: Pick<ChallengePlayerChallenge, 'screens'>,
  state: OrdinaryChallengeSessionState,
  screenId: string,
): OrdinaryChallengeSessionState {
  if (!challenge.screens.some(screen => screen.id === screenId)) return state
  if (state.screenId === screenId && state.isInProgress) return state
  return { ...state, screenId, isInProgress: true }
}

export function toggleOrdinaryChallengeSaved(
  state: OrdinaryChallengeSessionState,
): OrdinaryChallengeSessionState {
  return { ...state, isSaved: !state.isSaved }
}

export function toggleOrdinaryScriptureSaved(
  state: OrdinaryChallengeSessionState,
  scripture: CmsScripture,
): OrdinaryChallengeSessionState {
  const key = ordinaryScriptureKey(scripture)
  const exists = state.savedScriptures.some(entry => entry.key === key)
  const savedScriptures = exists
    ? state.savedScriptures.filter(entry => entry.key !== key)
    : [
      ...state.savedScriptures,
      {
        key,
        scriptureId: scripture.id,
        reference: scripture.reference,
        translation: scripture.translation,
      },
    ]
  return { ...state, savedScriptures }
}

export function completeOrdinaryChallenge(
  challenge: Pick<ChallengePlayerChallenge, 'screens'>,
  state: OrdinaryChallengeSessionState,
): OrdinaryChallengeSessionState {
  const position = challengePlayerPosition(challenge.screens, state.screenId)
  if (!canCompleteChallenge(position, state.isCompleted)) return state
  return { ...state, isCompleted: true, isInProgress: false }
}
