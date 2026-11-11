import { isAdmittedChallenge, type AdmittedChallenge } from './admission.ts'
import { selectChallengeParticipationView } from './model.ts'
import type { ReaderParticipationSnapshot } from './store.ts'
import {
  canCompleteChallenge,
  challengePlayerPosition,
  type ChallengePlayerChallenge,
} from '../components/challenge/challengePlayerModel.ts'
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
 *   immediately after completing in a non-returning pilot session).
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

export interface PersistedFinishAttemptResult {
  readonly completedDispatched: boolean
  readonly returnInvoked: boolean
}

export interface PersistedChallengeFinishController {
  reset(): void
  triggerExit(onExit?: () => void, guardSingleReturn?: boolean): boolean
  triggerFinish(input: {
    readonly screens: ChallengePlayerChallenge['screens']
    readonly activeScreenId: string | undefined
    readonly isCompleted: boolean
    readonly returnOnFinish: boolean
    readonly dispatchComplete: () => void
    readonly onStayOnFinalScreen?: (resolvedLastScreenId: string | undefined) => void
    readonly onExit?: () => void
  }): PersistedFinishAttemptResult
}

/**
 * Pure, single-flight Finish/Return controller for `PersistedChallengeHost`.
 * Prevents duplicate `completeChallenge` dispatches and duplicate origin-return navigation
 * across rapid double-clicks and pending async native storage writes.
 */
export function createPersistedChallengeFinishController(): PersistedChallengeFinishController {
  let finishTriggered = false
  let returnTriggered = false

  return {
    reset() {
      finishTriggered = false
      returnTriggered = false
    },

    triggerExit(onExit?: () => void, guardSingleReturn = true): boolean {
      if (!onExit) return false
      if (guardSingleReturn) {
        if (returnTriggered) return false
        returnTriggered = true
      }
      onExit()
      return true
    },

    triggerFinish({
      screens,
      activeScreenId,
      isCompleted,
      returnOnFinish,
      dispatchComplete,
      onStayOnFinalScreen,
      onExit,
    }) {
      if (finishTriggered) {
        return { completedDispatched: false, returnInvoked: false }
      }
      const position = challengePlayerPosition(screens, activeScreenId)
      if (!canCompleteChallenge(position, isCompleted)) {
        return { completedDispatched: false, returnInvoked: false }
      }

      finishTriggered = true
      const resolvedScreenId = screens[position.index]?.id
      if (!returnOnFinish) {
        onStayOnFinalScreen?.(resolvedScreenId)
      }

      dispatchComplete()

      let returnInvoked = false
      if (returnOnFinish && onExit && !returnTriggered) {
        returnTriggered = true
        onExit()
        returnInvoked = true
      }

      return { completedDispatched: true, returnInvoked }
    },
  }
}
