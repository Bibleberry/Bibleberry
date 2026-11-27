import type { ReactNode } from 'react'
import type { OnboardingCompletionResult } from '../../onboardingReplay/types.ts'
import { isReminderTime } from '../../readerProfile/model.ts'
import type { ReaderProfile, ReaderProfilePatch } from '../../readerProfile/types.ts'
import { activeRoute, type NavigationState, type ReaderTab } from '../navigation/navigationModel.ts'

export type FirstUseStep = 'intro' | 'tutorial' | 'none'

/**
 * Seam for the separate Guided App Tutorial (#324 Radiant Eclipse).
 * When no tutorial renderer is mounted, `tutorialStatus` remains untouched (`pending`)
 * and ordinary first use proceeds directly from App Introduction to Today.
 */
export interface GuidedTutorialStepProps {
  readonly mode: 'first-use' | 'replay'
  readonly shownTab: ReaderTab
  readonly onShowTab: (tab: ReaderTab) => void
  readonly onComplete: () => void | Promise<void>
  readonly onSkip: () => void | Promise<void>
}

export type GuidedTutorialRenderer = (props: GuidedTutorialStepProps) => ReactNode

export interface FirstUseGateOptions {
  readonly tutorialAvailable?: boolean
  readonly skipIntroInSession?: boolean
  readonly skipTutorialInSession?: boolean
}

export function resolveFirstUseStep(
  profile: Pick<ReaderProfile, 'introStatus' | 'tutorialStatus'>,
  options: FirstUseGateOptions = {},
): FirstUseStep {
  if (profile.introStatus === 'pending' && !options.skipIntroInSession) {
    return 'intro'
  }
  if (
    options.tutorialAvailable === true &&
    profile.tutorialStatus === 'pending' &&
    !options.skipTutorialInSession
  ) {
    return 'tutorial'
  }
  return 'none'
}

export function isFirstUseGuidanceActive(state: NavigationState): boolean {
  return (
    state.problem === null &&
    state.activeTab === 'today' &&
    (state.focused?.kind === 'intro' || state.focused?.kind === 'tutorial')
  )
}

export interface BootFirstUseEvaluationInput {
  readonly restoredSession: boolean
  readonly bypassedByExternalIngress: boolean
  readonly state: NavigationState
}

/**
 * Determines whether initial shell boot should evaluate durable first-use onboarding.
 *
 * Per approved G04-B / G06 and November 24 owner decision (#22):
 * - External Challenge ingress (cold or warm) authorizes and opens teaching first,
 *   keeps Intro/Tutorial pending, and returns Exit/Finish to Today without an onboarding wall.
 * - Restored in-session reloads on Today (e.g. after returning from an external Challenge)
 *   stay on Today; only an in-progress first-use guidance frame re-checks durable status.
 * - The next ordinary fresh launch at Today re-evaluates pending Intro and Tutorial statuses.
 */
export function shouldEvaluateFirstUseOnBoot(input: BootFirstUseEvaluationInput): boolean {
  if (input.bypassedByExternalIngress) {
    return false
  }
  if (isFirstUseGuidanceActive(input.state)) {
    return true
  }
  if (input.restoredSession) {
    return false
  }
  return (
    input.state.problem === null &&
    input.state.focused === null &&
    input.state.activeTab === 'today' &&
    activeRoute(input.state).kind === 'landing'
  )
}

/**
 * Maps a first-use `ReplayableOnboarding` completion/skip result onto an atomic
 * `ReaderProfilePatch`, keeping `tutorialStatus` and unrelated preferences independent.
 */
export function buildIntroCompletionPatch(
  current: ReaderProfile,
  result: OnboardingCompletionResult,
): ReaderProfilePatch {
  if (result.mode !== 'first-use') {
    return {}
  }
  if (result.reason === 'skip') {
    return { introStatus: 'skipped' }
  }
  if (result.reminderEnabled === true) {
    const time = isReminderTime(result.reminderTime) ? result.reminderTime : current.reminder.time
    return {
      introStatus: 'completed',
      reminder: { enabled: true, time },
    }
  }
  if (result.reminderEnabled === false) {
    return {
      introStatus: 'completed',
      reminder: { enabled: false, time: current.reminder.time },
    }
  }
  return { introStatus: 'completed' }
}
