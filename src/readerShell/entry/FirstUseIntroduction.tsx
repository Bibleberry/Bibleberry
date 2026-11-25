import { useCallback, useEffect, useRef, useState } from 'react'
import { ReplayableOnboarding } from '../../components/onboardingReplay/ReplayableOnboarding.tsx'
import type { OnboardingCompletionResult } from '../../onboardingReplay/types.ts'
import type { ReaderProfile } from '../../readerProfile/types.ts'
import type { ReaderProfileStore } from '../../readerProfile/store.ts'
import { buildIntroCompletionPatch } from './firstUseGate.ts'

export interface FirstUseIntroductionProps {
  readonly store: ReaderProfileStore
  readonly initialReminderTime: string
  readonly revision: number
  readonly onFinished: (profile: ReaderProfile, sourceRevision: number) => void
  readonly onContinueSessionOnly: (sourceRevision: number) => void
}

interface PendingSaveFailure {
  readonly result: OnboardingCompletionResult
  readonly sourceRevision: number
  readonly message: string
}

function buildSaveFailureMessage(result: OnboardingCompletionResult): string {
  if (result.reminderEnabled === true) {
    return 'Your introduction status and reminder preference could not be saved on this device. You can try again or continue to Today for this session.'
  }
  return 'Your introduction status could not be saved on this device. You can try again or continue to Today for this session.'
}

export function FirstUseIntroduction({
  store,
  initialReminderTime,
  revision,
  onFinished,
  onContinueSessionOnly,
}: FirstUseIntroductionProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const alertRef = useRef<HTMLDivElement | null>(null)
  const mountedRef = useRef(true)
  const savingRef = useRef(false)
  const completedRef = useRef(false)
  const latestRevisionRef = useRef(revision)
  const [saving, setSaving] = useState(false)
  const [saveFailure, setSaveFailure] = useState<PendingSaveFailure | null>(null)

  useEffect(() => {
    latestRevisionRef.current = revision
  }, [revision])

  useEffect(() => {
    mountedRef.current = true
    const heading = containerRef.current?.querySelector<HTMLElement>(
      '[data-testid="onboarding-step-heading"]',
    )
    heading?.focus({ preventScroll: true })
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (saveFailure) {
      alertRef.current?.focus({ preventScroll: true })
    }
  }, [saveFailure])

  const persistAndFinish = useCallback(
    (result: OnboardingCompletionResult, sourceRevision: number) => {
      if (savingRef.current || completedRef.current) return
      savingRef.current = true
      setSaving(true)
      setSaveFailure(null)
      void store
        .update(current => buildIntroCompletionPatch(current, result))
        .then(updated => {
          if (!mountedRef.current || latestRevisionRef.current !== sourceRevision) return
          savingRef.current = false
          setSaving(false)
          if (updated.ok) {
            completedRef.current = true
            onFinished(updated.profile, sourceRevision)
            return
          }
          setSaveFailure({
            result,
            sourceRevision,
            message: buildSaveFailureMessage(result),
          })
        })
        .catch(() => {
          if (!mountedRef.current || latestRevisionRef.current !== sourceRevision) return
          savingRef.current = false
          setSaving(false)
          setSaveFailure({
            result,
            sourceRevision,
            message: buildSaveFailureMessage(result),
          })
        })
    },
    [onFinished, store],
  )

  const handleOnboardingResult = useCallback(
    (result: OnboardingCompletionResult) => {
      persistAndFinish(result, latestRevisionRef.current)
    },
    [persistAndFinish],
  )

  return (
    <div ref={containerRef}>
      {saveFailure && (
        <div
          ref={alertRef}
          role="alert"
          tabIndex={-1}
          className="r06-landing"
          data-testid="first-use-save-failure"
        >
          <p>{saveFailure.message}</p>
          <div className="r06-actions">
            <button
              type="button"
              className="button button--secondary"
              data-testid="first-use-retry-save-button"
              disabled={saving}
              onClick={() => persistAndFinish(saveFailure.result, saveFailure.sourceRevision)}
            >
              Try Again
            </button>
            <button
              type="button"
              className="button button--secondary"
              data-testid="first-use-continue-session-button"
              disabled={saving}
              onClick={() => {
                if (savingRef.current || completedRef.current) return
                completedRef.current = true
                onContinueSessionOnly(saveFailure.sourceRevision)
              }}
            >
              Continue Without Saving
            </button>
          </div>
        </div>
      )}
      <ReplayableOnboarding
        mode="first-use"
        initialReminderTime={initialReminderTime}
        onComplete={handleOnboardingResult}
        onSkip={handleOnboardingResult}
      />
    </div>
  )
}
