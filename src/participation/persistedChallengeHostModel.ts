import { isAdmittedChallenge, type AdmittedChallenge } from './admission.ts'
import { selectChallengeParticipationView } from './model.ts'
import type { ReaderParticipationSnapshot } from './store.ts'
import type { ChallengePlayerChallenge } from '../components/challenge/challengePlayerModel.ts'
import type {
  CanonicalChallengeId,
  ChallengeIdentityNamespace,
  ChallengeParticipationView,
} from './types.ts'

/**
 * Pure validation and screen-resolution helpers for `PersistedChallengeHost` (Track A, A3 / Issue #46).
 */

export function assertValidAdmittedChallengeForHost(
  admittedChallenge: AdmittedChallenge,
  challenge: Pick<ChallengePlayerChallenge, 'screens'>,
  expectedNamespace: ChallengeIdentityNamespace,
): void {
  if (!isAdmittedChallenge(admittedChallenge, expectedNamespace)) {
    throw new TypeError(
      `PersistedChallengeHost requires an AdmittedChallenge in namespace "${expectedNamespace}".`,
    )
  }

  if (
    admittedChallenge.screens.length !== challenge.screens.length
    || !admittedChallenge.screens.every((screen, idx) => screen.id === challenge.screens[idx]?.id)
  ) {
    throw new TypeError(
      'PersistedChallengeHost requires admittedChallenge.screens to match challenge.screens.',
    )
  }
}

export function buildChallengeAliasRecord(
  admittedChallenge: AdmittedChallenge,
): Readonly<Record<string, CanonicalChallengeId>> | null {
  if (admittedChallenge.previousChallengeIds.length === 0) {
    return null
  }
  const aliases: Record<string, CanonicalChallengeId> = {}
  for (const prevId of admittedChallenge.previousChallengeIds) {
    aliases[prevId] = admittedChallenge.challengeId
  }
  return Object.freeze(aliases)
}

/**
 * Resolves the active screen identity passed into `OrdinaryChallengeHost`:
 * - Uncompleted Challenges use durable `view.resumeScreenId` (clamped safely to Screen 1 by `ChallengePlayer`
 *   when `undefined` or if an editor removed a screen).
 * - Completed Challenges use transient in-session `rereadScreenId` (starting at `undefined` -> Screen 1 on
 *   reopen so rereading never strands the reader on the final screen, while preserving final-screen focus
 *   immediately after clicking `Complete Challenge` in the current visit).
 */
export function resolvePersistedHostScreenId(
  view: Pick<ChallengeParticipationView, 'isCompleted' | 'resumeScreenId'>,
  rereadScreenId: string | undefined,
): string | undefined {
  return view.isCompleted ? rereadScreenId : view.resumeScreenId
}

export type PersistedHostRenderState =
  | {
      readonly mode: 'hydrating'
      readonly statusMessage: string
    }
  | {
      readonly mode: 'ready'
      readonly view: ChallengeParticipationView
      readonly effectiveScreenId: string | undefined
    }

export function derivePersistedHostRenderState(
  snapshot: ReaderParticipationSnapshot,
  challengeId: CanonicalChallengeId,
  rereadScreenId: string | undefined,
): PersistedHostRenderState {
  if (snapshot.status === 'hydrating') {
    return {
      mode: 'hydrating',
      statusMessage: 'Loading reading progress…',
    }
  }
  const view = selectChallengeParticipationView(snapshot.data, challengeId)
  return {
    mode: 'ready',
    view,
    effectiveScreenId: resolvePersistedHostScreenId(view, rereadScreenId),
  }
}
