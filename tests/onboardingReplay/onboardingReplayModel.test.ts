import assert from 'node:assert/strict'
import test from 'node:test'
import {
  advanceOnboardingStep,
  applyOnboardingResultToReaderState,
  canAdvanceInOnboarding,
  canGoBackInOnboarding,
  createInitialOnboardingFlowState,
  finishOnboardingFlow,
  getOnboardingStep,
  getOnboardingStepAnnouncement,
  interruptOnboardingFlow,
  ONBOARDING_ASIDE_CONTENT,
  ONBOARDING_STEPS,
  retreatOnboardingStep,
  skipOnboardingFlow,
  updateOnboardingDraftReminderTime,
  type OnboardingProtectedReaderState,
} from '../../src/onboardingReplay/index.ts'

function makePopulatedReaderState(onboarded = true): OnboardingProtectedReaderState {
  return {
    onboarded,
    readingPositions: {
      '2026-11-08-day-1': 'section-2',
      '2026-10-15-day-15': 'completed',
    },
    savedScripture: ['col-3-16', 'ps-23-1', 'john-15-4'],
    earnedAwards: ['2026-10-full-month', 'foundation-quiet-place'],
    preferences: {
      appearance: 'dark',
      textSize: 'large',
      reminderEnabled: true,
      reminderTime: '07:30',
    },
    shelfMembership: ['2026-11', '2026-10', '2026-09'],
  }
}

test('preserves the existing first-use theological introduction copy and structure', () => {
  assert.equal(ONBOARDING_STEPS.length, 3)
  assert.equal(ONBOARDING_ASIDE_CONTENT.verse, '“Let the word of Christ dwell in you richly.”')
  assert.equal(ONBOARDING_ASIDE_CONTENT.reference, 'Colossians 3:16')

  assert.equal(ONBOARDING_STEPS[0].eyebrow, 'WELCOME')
  assert.equal(ONBOARDING_STEPS[0].headingText, 'A quiet place to meet with Scripture.')
  assert.equal(ONBOARDING_STEPS[1].eyebrow, 'A GENTLE DAILY RHYTHM')
  assert.equal(ONBOARDING_STEPS[1].headingText, 'Nothing to catch up on. No streak to protect.')
  assert.equal(ONBOARDING_STEPS[2].eyebrow, 'OPTIONAL DAILY REMINDER')
  assert.equal(ONBOARDING_STEPS[2].headingText, 'Make room for a daily pause.')
})

test('supports Continue, Back, Skip, and Finish transitions in genuine first-use mode', () => {
  let state = createInitialOnboardingFlowState({
    mode: 'first-use',
    initialReminderTime: '08:00',
  })

  assert.equal(state.mode, 'first-use')
  assert.equal(state.currentStepIndex, 0)
  assert.equal(canGoBackInOnboarding(state), false)
  assert.equal(canAdvanceInOnboarding(state), true)

  state = advanceOnboardingStep(state)
  assert.equal(state.currentStepIndex, 1)
  assert.equal(getOnboardingStep(state.currentStepIndex).id, 'rhythm')
  assert.equal(canGoBackInOnboarding(state), true)

  state = retreatOnboardingStep(state)
  assert.equal(state.currentStepIndex, 0)

  state = advanceOnboardingStep(state)
  state = advanceOnboardingStep(state)
  assert.equal(state.currentStepIndex, 2)
  assert.equal(getOnboardingStep(state.currentStepIndex).id, 'reminder')
  assert.equal(canAdvanceInOnboarding(state), false)

  state = updateOnboardingDraftReminderTime(state, '06:45')
  const { state: finishedState, result } = finishOnboardingFlow(state, {
    destination: 'foundations',
    reason: 'finish',
    reminderEnabled: true,
    reminderTime: state.draftReminderTime,
  })

  assert.equal(finishedState.status, 'completed')
  assert.equal(finishedState.destination, 'foundations')
  assert.equal(result.mode, 'first-use')
  assert.equal(result.reminderEnabled, true)
  assert.equal(result.reminderTime, '06:45')

  const initialReader = makePopulatedReaderState(false)
  const updatedReader = applyOnboardingResultToReaderState(initialReader, {
    type: 'complete',
    result,
  })
  assert.equal(updatedReader.onboarded, true)
  assert.equal(updatedReader.preferences.reminderEnabled, true)
  assert.equal(updatedReader.preferences.reminderTime, '06:45')
  assert.deepEqual(updatedReader.savedScripture, initialReader.savedScripture)
  assert.deepEqual(updatedReader.earnedAwards, initialReader.earnedAwards)
  assert.deepEqual(updatedReader.shelfMembership, initialReader.shelfMembership)
})

test('supports Skip in first-use mode without erasing any existing state', () => {
  const state = createInitialOnboardingFlowState({ mode: 'first-use' })
  const { state: skippedState, result } = skipOnboardingFlow(state, 'today')

  assert.equal(skippedState.status, 'skipped')
  assert.equal(skippedState.exitReason, 'skip')
  assert.equal(result.destination, 'today')

  const readerBefore = makePopulatedReaderState(false)
  const readerAfter = applyOnboardingResultToReaderState(readerBefore, {
    type: 'complete',
    result,
  })
  assert.equal(readerAfter.onboarded, true)
  assert.deepEqual(readerAfter.preferences, readerBefore.preferences)
})

test('replay mode preserves prior destination origin and never resets onboarded or reader data', () => {
  const origin = {
    label: 'Saved Scripture',
    routeHash: '#saved-scripture',
    view: 'more',
    detail: { type: 'savedScripture' },
  }
  let state = createInitialOnboardingFlowState({
    mode: 'replay',
    origin,
    initialReminderTime: '07:30',
  })

  assert.equal(
    getOnboardingStepAnnouncement(state),
    'Replaying introduction. Welcome step 1 of 3: A quiet place to meet with Scripture.',
  )

  state = advanceOnboardingStep(state)
  assert.equal(
    getOnboardingStepAnnouncement(state),
    'Replaying introduction. Welcome step 2 of 3: Nothing to catch up on. No streak to protect.',
  )

  state = advanceOnboardingStep(state)
  const { state: finishedReplay, result } = finishOnboardingFlow(state, {
    destination: 'foundations',
    reason: 'finish',
  })

  assert.equal(finishedReplay.status, 'completed')
  assert.deepEqual(result.origin, origin)

  const readerBefore = makePopulatedReaderState(true)
  const readerAfter = applyOnboardingResultToReaderState(readerBefore, {
    type: 'complete',
    result,
  })

  assert.equal(readerAfter.onboarded, true)
  assert.deepEqual(readerAfter, readerBefore)
})

test('interrupted replay preserves onboarded=true and all reader data invariants', () => {
  let state = createInitialOnboardingFlowState({
    mode: 'replay',
    origin: { label: 'Library', routeHash: '#library' },
  })
  state = advanceOnboardingStep(state)
  const interrupted = interruptOnboardingFlow(state)

  assert.equal(interrupted.status, 'interrupted')
  assert.equal(interrupted.exitReason, 'interrupted')

  const readerBefore = makePopulatedReaderState(true)
  const readerAfter = applyOnboardingResultToReaderState(readerBefore, {
    type: 'interrupt',
    mode: 'replay',
  })

  assert.equal(readerAfter.onboarded, true)
  assert.deepEqual(readerAfter, readerBefore)
})
