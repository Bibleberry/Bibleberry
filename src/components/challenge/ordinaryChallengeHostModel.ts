import type { CmsScripture } from '../../cms/sanity/types.ts'
import {
  canCompleteChallenge,
  challengePlayerPosition,
  type ChallengePlayerChallenge,
} from './challengePlayerModel.ts'

/**
 * Pure, storage-free session state model for the ordinary-shell ChallengePlayer host (Issue #44, A2).
 *
 * Scope boundary: A2 intentionally keeps position, Challenge save, Scripture save, and explicit
 * completion as separate, non-durable in-memory state. Durable canonical Challenge identity,
 * completion timestamps, persistent local storage, and future account sync belong to A3.
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
  /** Reference metadata only — passage text is never copied into host state. */
  savedScriptures: OrdinarySavedScripture[]
}

export function emptyOrdinaryChallengeSessionState(): OrdinaryChallengeSessionState {
  return {
    screenId: undefined,
    isSaved: false,
    isCompleted: false,
    savedScriptures: [],
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

export function setOrdinaryChallengeScreen(
  challenge: Pick<ChallengePlayerChallenge, 'screens'>,
  state: OrdinaryChallengeSessionState,
  screenId: string,
): OrdinaryChallengeSessionState {
  if (!challenge.screens.some(screen => screen.id === screenId)) return state
  if (state.screenId === screenId) return state
  return { ...state, screenId }
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
  return { ...state, isCompleted: true }
}
