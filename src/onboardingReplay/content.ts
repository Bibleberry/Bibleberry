import type {
  OnboardingAsideContent,
  OnboardingStepDefinition,
  OnboardingStepId,
  OnboardingWordmarkContent,
} from './types.ts'

export const ONBOARDING_WORDMARK_CONTENT: OnboardingWordmarkContent = {
  name: 'Bibleberry',
  note: 'A quiet place for Scripture',
}

export const ONBOARDING_ASIDE_CONTENT: OnboardingAsideContent = {
  verse: '“Let the word of Christ dwell in you richly.”',
  reference: 'Colossians 3:16',
}

/**
 * Preserves the exact introductory teaching copy from `Onboarding` in `src/App.tsx`.
 */
export const ONBOARDING_STEPS: readonly OnboardingStepDefinition[] = [
  {
    id: 'welcome',
    stepNumber: 1,
    eyebrow: 'WELCOME',
    headingText: 'A quiet place to meet with Scripture.',
    headingLines: ['A quiet place to', 'meet with Scripture.'],
    lede: 'Reflect on practical biblical teaching, and return to what God is forming in you.',
    body: 'Come as you are. Read, listen, watch, or pray in the way that fits this season—and the time you have today.',
    primaryActionLabel: 'Continue',
  },
  {
    id: 'rhythm',
    stepNumber: 2,
    eyebrow: 'A GENTLE DAILY RHYTHM',
    headingText: 'Nothing to catch up on. No streak to protect.',
    headingLines: ['Nothing to catch up on.', 'No streak to protect.'],
    lede: 'A new Scripture Challenge offers a written teaching for each day. Some entries may also include a video, a Realigned podcast episode, or a prayer.',
    body: 'Foundations gives you a place to begin, Today brings you back to the current teaching, and the Archive is always available when you want to explore.',
    primaryActionLabel: 'Find your starting place',
    secondaryActionLabel: 'Continue to Today',
  },
  {
    id: 'reminder',
    stepNumber: 3,
    eyebrow: 'OPTIONAL DAILY REMINDER',
    headingText: 'Make room for a daily pause.',
    headingLines: ['Make room for', 'a daily pause.'],
    lede: 'If a gentle reminder would help, choose a time that fits your rhythm. You can change or turn it off later.',
    finePrint: 'This browser saves your preference only. It does not schedule a native device notification.',
    primaryActionLabel: 'Save reminder preference',
    secondaryActionLabel: 'Not now',
  },
] as const

export function getOnboardingStep(stepIndex: number): OnboardingStepDefinition {
  const clamped = Math.max(0, Math.min(ONBOARDING_STEPS.length - 1, stepIndex))
  return ONBOARDING_STEPS[clamped]
}

export function getOnboardingStepById(stepId: OnboardingStepId): OnboardingStepDefinition {
  return ONBOARDING_STEPS.find(step => step.id === stepId) ?? ONBOARDING_STEPS[0]
}
