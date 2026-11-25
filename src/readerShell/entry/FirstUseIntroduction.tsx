import { useCallback, useEffect, useRef } from 'react'
import { ReplayableOnboarding } from '../../components/onboardingReplay/ReplayableOnboarding.tsx'
import type { OnboardingCompletionResult } from '../../onboardingReplay/types.ts'
import type { ReaderProfile } from '../../readerProfile/types.ts'
import type { ReaderProfileStore } from '../../readerProfile/store.ts'
import { buildIntroCompletionPatch } from './firstUseGate.ts'

export interface FirstUseIntroductionProps {
  readonly store: ReaderProfileStore
  readonly initialReminderTime: string
  readonly onFinished: (profile: ReaderProfile) => void
}

export function FirstUseIntroduction({
  store,
  initialReminderTime,
  onFinished,
}: FirstUseIntroductionProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const finishingRef = useRef(false)

  useEffect(() => {
    const heading = containerRef.current?.querySelector<HTMLElement>(
      '[data-testid="onboarding-step-heading"]',
    )
    heading?.focus({ preventScroll: true })
  }, [])

  const finishWithResult = useCallback(
    (result: OnboardingCompletionResult) => {
      if (finishingRef.current) return
      finishingRef.current = true
      void store
        .update(current => buildIntroCompletionPatch(current, result))
        .then(updated => {
          if (updated.ok) {
            onFinished(updated.profile)
            return
          }
          // Never trap the reader in first-use Introduction if storage is unavailable or corrupt;
          // preserve the untouched underlying record while advancing in-session with the patch.
          const fallbackPatch = buildIntroCompletionPatch(updated.profile, result)
          onFinished({
            ...updated.profile,
            ...(fallbackPatch.introStatus ? { introStatus: fallbackPatch.introStatus } : {}),
            ...(fallbackPatch.reminder ? { reminder: fallbackPatch.reminder } : {}),
          })
        })
    },
    [onFinished, store],
  )

  return (
    <div ref={containerRef}>
      <ReplayableOnboarding
        mode="first-use"
        initialReminderTime={initialReminderTime}
        onComplete={finishWithResult}
        onSkip={finishWithResult}
      />
    </div>
  )
}
