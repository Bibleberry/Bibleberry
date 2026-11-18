import { getOnboardingStep, ONBOARDING_STEPS } from './content.ts'
import type {
  OnboardingCompletionResult,
  OnboardingDestination,
  OnboardingEntryMode,
  OnboardingFlowState,
  OnboardingOriginContext,
  OnboardingProtectedReaderState,
} from './types.ts'

export const DEFAULT_ONBOARDING_REMINDER_TIME = '08:00'

export interface CreateOnboardingFlowOptions {
  mode: OnboardingEntryMode
  origin?: OnboardingOriginContext | null
  initialReminderTime?: string
  initialStepIndex?: number
}

export function createInitialOnboardingFlowState(
  options: CreateOnboardingFlowOptions,
): OnboardingFlowState {
  const maxIndex = ONBOARDING_STEPS.length - 1
  const rawIndex = options.initialStepIndex ?? 0
  const currentStepIndex = Math.max(0, Math.min(maxIndex, rawIndex))

  return {
    mode: options.mode,
    currentStepIndex,
    totalSteps: ONBOARDING_STEPS.length,
    status: 'active',
    origin: options.origin ?? null,
    draftReminderTime: options.initialReminderTime || DEFAULT_ONBOARDING_REMINDER_TIME,
    exitReason: null,
    destination: null,
  }
}

export function canGoBackInOnboarding(state: OnboardingFlowState): boolean {
  return state.status === 'active' && state.currentStepIndex > 0
}

export function canAdvanceInOnboarding(state: OnboardingFlowState): boolean {
  return state.status === 'active' && state.currentStepIndex < state.totalSteps - 1
}

export function advanceOnboardingStep(state: OnboardingFlowState): OnboardingFlowState {
  if (!canAdvanceInOnboarding(state)) {
    return state
  }
  return {
    ...state,
    currentStepIndex: state.currentStepIndex + 1,
  }
}

export function retreatOnboardingStep(state: OnboardingFlowState): OnboardingFlowState {
  if (!canGoBackInOnboarding(state)) {
    return state
  }
  return {
    ...state,
    currentStepIndex: state.currentStepIndex - 1,
  }
}

export function goToOnboardingStep(
  state: OnboardingFlowState,
  stepIndex: number,
): OnboardingFlowState {
  if (state.status !== 'active') {
    return state
  }
  const clamped = Math.max(0, Math.min(state.totalSteps - 1, stepIndex))
  if (clamped === state.currentStepIndex) {
    return state
  }
  return {
    ...state,
    currentStepIndex: clamped,
  }
}

export function updateOnboardingDraftReminderTime(
  state: OnboardingFlowState,
  reminderTime: string,
): OnboardingFlowState {
  if (state.status !== 'active') {
    return state
  }
  return {
    ...state,
    draftReminderTime: reminderTime,
  }
}

export function skipOnboardingFlow(
  state: OnboardingFlowState,
  destination: OnboardingDestination = 'today',
): { state: OnboardingFlowState; result: OnboardingCompletionResult } {
  const nextState: OnboardingFlowState = {
    ...state,
    status: 'skipped',
    exitReason: 'skip',
    destination,
  }
  const result: OnboardingCompletionResult = {
    mode: state.mode,
    reason: 'skip',
    destination,
    origin: state.origin,
  }
  return { state: nextState, result }
}

export function finishOnboardingFlow(
  state: OnboardingFlowState,
  options: {
    destination?: OnboardingDestination
    reason?: 'finish' | 'continue-to-today'
    reminderEnabled?: boolean
    reminderTime?: string
  } = {},
): { state: OnboardingFlowState; result: OnboardingCompletionResult } {
  const destination = options.destination ?? 'foundations'
  const reason = options.reason ?? 'finish'
  const nextState: OnboardingFlowState = {
    ...state,
    status: 'completed',
    exitReason: reason,
    destination,
  }
  const result: OnboardingCompletionResult = {
    mode: state.mode,
    reason,
    destination,
    origin: state.origin,
    ...(typeof options.reminderEnabled === 'boolean'
      ? { reminderEnabled: options.reminderEnabled }
      : {}),
    ...(options.reminderTime !== undefined ? { reminderTime: options.reminderTime } : {}),
  }
  return { state: nextState, result }
}

export function interruptOnboardingFlow(state: OnboardingFlowState): OnboardingFlowState {
  if (state.status !== 'active') {
    return state
  }
  return {
    ...state,
    status: 'interrupted',
    exitReason: 'interrupted',
  }
}

export function getOnboardingStepAnnouncement(state: OnboardingFlowState): string {
  const step = getOnboardingStep(state.currentStepIndex)
  const modePrefix = state.mode === 'replay' ? 'Replaying introduction. ' : ''
  return `${modePrefix}Welcome step ${step.stepNumber} of ${state.totalSteps}: ${step.headingText}`
}

/**
 * Applies an onboarding completion/skip/interrupt outcome to durable reader state
 * while enforcing R12-3's no-data-loss invariants:
 * - Genuine first-use completion or skip marks `onboarded: true` and optionally
 *   applies explicit reminder choices without erasing any existing reader data.
 * - Replay NEVER resets `onboarded` to `false` and NEVER erases reading positions,
 *   Saved Scripture, earned awards, preferences, or Shelf membership.
 */
export function applyOnboardingResultToReaderState(
  readerState: OnboardingProtectedReaderState,
  outcome:
    | { type: 'complete'; result: OnboardingCompletionResult; allowReplayReminderUpdate?: boolean }
    | { type: 'interrupt'; mode: OnboardingEntryMode },
): OnboardingProtectedReaderState {
  if (outcome.type === 'interrupt') {
    return {
      ...readerState,
      readingPositions: { ...readerState.readingPositions },
      savedScripture: [...readerState.savedScripture],
      earnedAwards: [...readerState.earnedAwards],
      preferences: { ...readerState.preferences },
      shelfMembership: [...readerState.shelfMembership],
    }
  }

  const { result, allowReplayReminderUpdate = false } = outcome

  if (result.mode === 'replay') {
    const nextPreferences =
      allowReplayReminderUpdate &&
      (typeof result.reminderEnabled === 'boolean' || result.reminderTime !== undefined)
        ? {
            ...readerState.preferences,
            ...(typeof result.reminderEnabled === 'boolean'
              ? { reminderEnabled: result.reminderEnabled }
              : {}),
            ...(result.reminderTime !== undefined ? { reminderTime: result.reminderTime } : {}),
          }
        : { ...readerState.preferences }

    return {
      ...readerState,
      onboarded: true,
      readingPositions: { ...readerState.readingPositions },
      savedScripture: [...readerState.savedScripture],
      earnedAwards: [...readerState.earnedAwards],
      preferences: nextPreferences,
      shelfMembership: [...readerState.shelfMembership],
    }
  }

  // Genuine first-use mode
  return {
    ...readerState,
    onboarded: true,
    readingPositions: { ...readerState.readingPositions },
    savedScripture: [...readerState.savedScripture],
    earnedAwards: [...readerState.earnedAwards],
    preferences: {
      ...readerState.preferences,
      ...(typeof result.reminderEnabled === 'boolean'
        ? { reminderEnabled: result.reminderEnabled }
        : {}),
      ...(result.reminderTime !== undefined ? { reminderTime: result.reminderTime } : {}),
    },
    shelfMembership: [...readerState.shelfMembership],
  }
}
