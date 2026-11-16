import { useState } from 'react'
import { ReplayableOnboarding } from '../../../src/components/onboardingReplay/index.ts'
import {
  applyOnboardingResultToReaderState,
  type OnboardingCompletionResult,
  type OnboardingOriginContext,
  type OnboardingProtectedReaderState,
} from '../../../src/onboardingReplay/index.ts'

const HARNESS_STORAGE_KEY = 'bibleberry-r12-3-harness-state-v1'

const DEFAULT_FIRST_USE_STATE: OnboardingProtectedReaderState = {
  onboarded: false,
  readingPositions: {},
  savedScripture: [],
  earnedAwards: [],
  preferences: {
    appearance: 'light',
    textSize: 'default',
    reminderEnabled: false,
    reminderTime: '08:00',
  },
  shelfMembership: [],
}

const DEFAULT_REPLAY_STATE: OnboardingProtectedReaderState = {
  onboarded: true,
  readingPositions: {
    '2026-11-08-day-1': 'section-3',
    '2026-10-12-day-12': 'completed',
  },
  savedScripture: ['col-3-16', 'ps-23-1', 'john-15-4'],
  earnedAwards: ['2026-10-full-month', 'foundation-quiet-place'],
  preferences: {
    appearance: 'light',
    textSize: 'large',
    reminderEnabled: true,
    reminderTime: '07:30',
  },
  shelfMembership: ['2026-11', '2026-10', '2026-09'],
}

function getScenarioParam(): 'first-use' | 'replay' {
  const params = new URLSearchParams(window.location.search)
  return params.get('scenario') === 'replay' ? 'replay' : 'first-use'
}

function loadHarnessState(scenario: 'first-use' | 'replay'): OnboardingProtectedReaderState {
  try {
    const raw = window.localStorage.getItem(HARNESS_STORAGE_KEY)
    if (raw) {
      return JSON.parse(raw) as OnboardingProtectedReaderState
    }
  } catch {
    // Fall back to scenario default
  }
  const initial =
    scenario === 'replay'
      ? structuredClone(DEFAULT_REPLAY_STATE)
      : structuredClone(DEFAULT_FIRST_USE_STATE)
  window.localStorage.setItem(HARNESS_STORAGE_KEY, JSON.stringify(initial))
  return initial
}

function saveHarnessState(state: OnboardingProtectedReaderState) {
  window.localStorage.setItem(HARNESS_STORAGE_KEY, JSON.stringify(state))
}

export function HarnessApp() {
  const scenario = getScenarioParam()
  const [readerState, setReaderState] = useState<OnboardingProtectedReaderState>(() =>
    loadHarnessState(scenario),
  )
  const [replayOrigin, setReplayOrigin] = useState<OnboardingOriginContext | null>(null)
  const [isReplaying, setIsReplaying] = useState(false)
  const [activeDestination, setActiveDestination] = useState<string>('Today')
  const [lastResult, setLastResult] = useState<OnboardingCompletionResult | null>(null)

  const persistReaderState = (next: OnboardingProtectedReaderState) => {
    setReaderState(next)
    saveHarnessState(next)
  }

  const handleCompleteOrSkip = (result: OnboardingCompletionResult) => {
    const nextReaderState = applyOnboardingResultToReaderState(readerState, {
      type: 'complete',
      result,
    })
    persistReaderState(nextReaderState)
    setLastResult(result)
    if (result.mode === 'first-use') {
      setActiveDestination(result.destination === 'foundations' ? 'Foundations' : 'Today')
    }
    setIsReplaying(false)
  }

  const handleReturnToOrigin = (origin: OnboardingOriginContext | null) => {
    if (origin?.label) {
      setActiveDestination(origin.label)
    }
    setIsReplaying(false)
  }

  const startReplayFrom = (origin: OnboardingOriginContext) => {
    setReplayOrigin(origin)
    setActiveDestination(origin.label)
    setIsReplaying(true)
  }

  if (!readerState.onboarded) {
    return (
      <ReplayableOnboarding
        mode="first-use"
        initialReminderTime={readerState.preferences.reminderTime}
        onComplete={handleCompleteOrSkip}
        onSkip={handleCompleteOrSkip}
      />
    )
  }

  if (isReplaying) {
    return (
      <ReplayableOnboarding
        mode="replay"
        origin={replayOrigin}
        initialReminderTime={readerState.preferences.reminderTime}
        onComplete={handleCompleteOrSkip}
        onSkip={handleCompleteOrSkip}
        onReturnToOrigin={handleReturnToOrigin}
      />
    )
  }

  return (
    <main style={{ padding: '24px', maxWidth: '720px', margin: '0 auto' }}>
      <h1 data-testid="harness-shell-heading">Reader App Shell</h1>
      <p data-testid="harness-active-destination">Active destination: {activeDestination}</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBlock: '16px' }}>
        <button
          type="button"
          className="r12-button r12-button--primary"
          data-testid="launch-replay-saved-scripture"
          onClick={() =>
            startReplayFrom({
              label: 'Saved Scripture',
              routeHash: '#saved-scripture',
              view: 'more',
            })
          }
        >
          Replay from Saved Scripture
        </button>
        <button
          type="button"
          className="r12-button r12-button--ghost"
          data-testid="launch-replay-library"
          onClick={() =>
            startReplayFrom({
              label: 'Library',
              routeHash: '#library',
              view: 'archive',
            })
          }
        >
          Replay from Library
        </button>
      </div>

      <pre data-testid="harness-reader-state">
        {JSON.stringify({ readerState, lastResult }, null, 2)}
      </pre>
    </main>
  )
}
