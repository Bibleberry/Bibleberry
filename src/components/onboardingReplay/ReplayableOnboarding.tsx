import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Bell, Check } from 'lucide-react'
import {
  advanceOnboardingStep,
  canGoBackInOnboarding,
  createInitialOnboardingFlowState,
  finishOnboardingFlow,
  getOnboardingStep,
  getOnboardingStepAnnouncement,
  ONBOARDING_ASIDE_CONTENT,
  ONBOARDING_STEPS,
  ONBOARDING_WORDMARK_CONTENT,
  retreatOnboardingStep,
  skipOnboardingFlow,
  updateOnboardingDraftReminderTime,
  type OnboardingCompletionResult,
  type OnboardingDestination,
  type OnboardingEntryMode,
  type OnboardingFlowCallbacks,
  type OnboardingFlowState,
  type OnboardingOriginContext,
} from '../../onboardingReplay'
import './ReplayableOnboarding.css'

export interface ReplayableOnboardingProps extends OnboardingFlowCallbacks {
  mode: OnboardingEntryMode
  origin?: OnboardingOriginContext | null
  initialReminderTime?: string
  initialStepIndex?: number
  /**
   * When true, pressing Escape skips/exits onboarding.
   * Defaults to true in `replay` mode and false in `first-use` mode.
   */
  allowEscapeToSkip?: boolean
  className?: string
}

function OnboardingBotanical({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 124" fill="none" aria-hidden="true">
      <path
        d="M49 116C50 82 48 48 56 10M51 78C36 69 25 55 21 38C39 41 50 55 51 78ZM52 58C65 51 75 39 80 24C64 26 54 39 52 58ZM49 96C35 92 23 82 16 68C32 67 46 78 49 96ZM54 38C44 31 38 21 37 9C49 13 56 24 54 38Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M29 115H70"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

function OnboardingWordmark() {
  return (
    <div className="r12-wordmark">
      <OnboardingBotanical className="r12-wordmark__botanical" />
      <div>
        <span className="r12-wordmark__name">{ONBOARDING_WORDMARK_CONTENT.name}</span>
        <span className="r12-wordmark__note">{ONBOARDING_WORDMARK_CONTENT.note}</span>
      </div>
    </div>
  )
}

export function ReplayableOnboarding({
  mode,
  origin = null,
  initialReminderTime,
  initialStepIndex,
  allowEscapeToSkip,
  className = '',
  onComplete,
  onSkip,
  onReturnToOrigin,
  onStepChange,
  onReminderPreferenceChange,
}: ReplayableOnboardingProps) {
  const [flow, setFlow] = useState<OnboardingFlowState>(() =>
    createInitialOnboardingFlowState({
      mode,
      origin,
      initialReminderTime,
      initialStepIndex,
    }),
  )

  const headingId = useId()
  const timeInputId = useId()
  const headingRef = useRef<HTMLHeadingElement | null>(null)
  const shouldFocusHeadingRef = useRef(false)

  const step = getOnboardingStep(flow.currentStepIndex)
  const announcement = getOnboardingStepAnnouncement(flow)
  const escapeEnabled = allowEscapeToSkip ?? mode === 'replay'

  useEffect(() => {
    if (shouldFocusHeadingRef.current) {
      headingRef.current?.focus()
      shouldFocusHeadingRef.current = false
    }
  }, [flow.currentStepIndex])

  const emitResult = useCallback(
    (result: OnboardingCompletionResult, kind: 'complete' | 'skip') => {
      if (kind === 'skip') {
        onSkip?.(result)
      } else {
        onComplete?.(result)
      }
      if (result.mode === 'replay') {
        onReturnToOrigin?.(result.origin)
      }
    },
    [onComplete, onReturnToOrigin, onSkip],
  )

  const handleSkip = useCallback(() => {
    const { state: nextState, result } = skipOnboardingFlow(flow, 'today')
    setFlow(nextState)
    emitResult(result, 'skip')
  }, [emitResult, flow])

  useEffect(() => {
    if (!escapeEnabled) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        handleSkip()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [escapeEnabled, handleSkip])

  const handleAdvance = () => {
    const nextState = advanceOnboardingStep(flow)
    if (nextState.currentStepIndex !== flow.currentStepIndex) {
      shouldFocusHeadingRef.current = true
      setFlow(nextState)
      onStepChange?.(
        nextState.currentStepIndex,
        getOnboardingStep(nextState.currentStepIndex).id,
        nextState.mode,
      )
    }
  }

  const handleBack = () => {
    if (!canGoBackInOnboarding(flow)) return
    const nextState = retreatOnboardingStep(flow)
    if (nextState.currentStepIndex !== flow.currentStepIndex) {
      shouldFocusHeadingRef.current = true
      setFlow(nextState)
      onStepChange?.(
        nextState.currentStepIndex,
        getOnboardingStep(nextState.currentStepIndex).id,
        nextState.mode,
      )
    }
  }

  const handleFinish = (options: {
    destination: OnboardingDestination
    reason: 'finish' | 'continue-to-today'
    reminderEnabled?: boolean
    includeReminderTime?: boolean
  }) => {
    const { state: nextState, result } = finishOnboardingFlow(flow, {
      destination: options.destination,
      reason: options.reason,
      ...(typeof options.reminderEnabled === 'boolean'
        ? { reminderEnabled: options.reminderEnabled }
        : {}),
      ...(options.includeReminderTime ? { reminderTime: flow.draftReminderTime } : {}),
    })
    setFlow(nextState)
    emitResult(result, 'complete')
  }

  const handleReminderTimeChange = (nextTime: string) => {
    setFlow(prev => updateOnboardingDraftReminderTime(prev, nextTime))
    if (mode === 'first-use') {
      onReminderPreferenceChange?.({ reminderTime: nextTime })
    }
  }

  const skipLabel =
    mode === 'replay' && origin?.label ? `Return to ${origin.label}` : 'Skip'

  return (
    <main
      className={`r12-onboarding ${className}`.trim()}
      data-onboarding-mode={mode}
      data-onboarding-step={step.id}
    >
      <header className="r12-onboarding__top">
        <OnboardingWordmark />
        <div className="r12-onboarding__top-actions">
          {mode === 'replay' && (
            <span
              className="r12-onboarding__replay-badge"
              data-testid="onboarding-replay-badge"
            >
              Replaying introduction
            </span>
          )}
          <button
            type="button"
            className="r12-button r12-button--ghost"
            data-testid="onboarding-skip-button"
            onClick={handleSkip}
            aria-label={
              mode === 'replay' && origin?.label
                ? `Skip replay and return to ${origin.label}`
                : 'Skip welcome introduction'
            }
          >
            {skipLabel}
          </button>
        </div>
      </header>

      <div className="r12-onboarding__layout">
        <aside className="r12-onboarding__aside" aria-hidden="true">
          <span className="r12-onboarding__verse">{ONBOARDING_ASIDE_CONTENT.verse}</span>
          <OnboardingBotanical className="r12-onboarding__plant" />
          <span className="r12-onboarding__reference">{ONBOARDING_ASIDE_CONTENT.reference}</span>
        </aside>

        <section
          className="r12-onboarding__content"
          aria-labelledby={headingId}
        >
          <div
            className="r12-sr-only"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            data-testid="onboarding-live-announcement"
          >
            {announcement}
          </div>

          <ol
            className="r12-step-indicator"
            aria-label={`Welcome step ${step.stepNumber} of ${flow.totalSteps}`}
          >
            {ONBOARDING_STEPS.map((item, index) => {
              const isCurrent = index === flow.currentStepIndex
              const isPast = index < flow.currentStepIndex
              return (
                <li
                  key={item.id}
                  className={isCurrent ? 'is-current' : isPast ? 'is-past' : ''}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  {isPast ? <Check size={12} aria-hidden="true" /> : item.stepNumber}
                </li>
              )
            })}
          </ol>

          <p className="r12-eyebrow">{step.eyebrow}</p>
          <h1
            id={headingId}
            ref={headingRef}
            tabIndex={-1}
            className="r12-onboarding__heading"
            data-testid="onboarding-step-heading"
          >
            {step.headingLines[0]}
            <br />
            {step.headingLines[1]}
          </h1>
          <p className="r12-lede">{step.lede}</p>
          {step.body && <p className="r12-body">{step.body}</p>}

          {step.id === 'welcome' && (
            <div className="r12-button-stack">
              <button
                type="button"
                className="r12-button r12-button--primary"
                data-testid="onboarding-continue-button"
                onClick={handleAdvance}
              >
                {step.primaryActionLabel} <ArrowRight size={18} aria-hidden="true" />
              </button>
            </div>
          )}

          {step.id === 'rhythm' && (
            <>
              <div className="r12-button-stack">
                <button
                  type="button"
                  className="r12-button r12-button--primary"
                  data-testid="onboarding-continue-button"
                  onClick={handleAdvance}
                >
                  {step.primaryActionLabel} <ArrowRight size={18} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="r12-button r12-button--text"
                  data-testid="onboarding-continue-today-button"
                  onClick={() =>
                    handleFinish({
                      destination: 'today',
                      reason: 'continue-to-today',
                    })
                  }
                >
                  {step.secondaryActionLabel}
                </button>
              </div>
              <button
                type="button"
                className="r12-back-link"
                data-testid="onboarding-back-button"
                onClick={handleBack}
              >
                <ArrowLeft size={16} aria-hidden="true" /> Back
              </button>
            </>
          )}

          {step.id === 'reminder' && (
            <>
              <label className="r12-time-field" htmlFor={timeInputId}>
                <span>Suggested reminder time</span>
                <input
                  id={timeInputId}
                  type="time"
                  value={flow.draftReminderTime}
                  onChange={event => handleReminderTimeChange(event.target.value)}
                />
              </label>
              {step.finePrint && <p className="r12-fine-print">{step.finePrint}</p>}

              {mode === 'first-use' ? (
                <div className="r12-button-stack">
                  <button
                    type="button"
                    className="r12-button r12-button--primary"
                    data-testid="onboarding-finish-button"
                    onClick={() => {
                      onReminderPreferenceChange?.({
                        reminderEnabled: true,
                        reminderTime: flow.draftReminderTime,
                      })
                      handleFinish({
                        destination: 'foundations',
                        reason: 'finish',
                        reminderEnabled: true,
                        includeReminderTime: true,
                      })
                    }}
                  >
                    {step.primaryActionLabel} <Bell size={17} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="r12-button r12-button--text"
                    data-testid="onboarding-not-now-button"
                    onClick={() => {
                      onReminderPreferenceChange?.({ reminderEnabled: false })
                      handleFinish({
                        destination: 'foundations',
                        reason: 'finish',
                        reminderEnabled: false,
                      })
                    }}
                  >
                    {step.secondaryActionLabel}
                  </button>
                </div>
              ) : (
                <div className="r12-button-stack">
                  <button
                    type="button"
                    className="r12-button r12-button--primary"
                    data-testid="onboarding-finish-button"
                    onClick={() =>
                      handleFinish({
                        destination: 'foundations',
                        reason: 'finish',
                      })
                    }
                  >
                    Finish
                  </button>
                  <button
                    type="button"
                    className="r12-button r12-button--text"
                    data-testid="onboarding-save-reminder-replay-button"
                    onClick={() => {
                      onReminderPreferenceChange?.({
                        reminderEnabled: true,
                        reminderTime: flow.draftReminderTime,
                      })
                      handleFinish({
                        destination: 'foundations',
                        reason: 'finish',
                        reminderEnabled: true,
                        includeReminderTime: true,
                      })
                    }}
                  >
                    {step.primaryActionLabel}
                  </button>
                </div>
              )}

              <button
                type="button"
                className="r12-back-link"
                data-testid="onboarding-back-button"
                onClick={handleBack}
              >
                <ArrowLeft size={16} aria-hidden="true" /> Back
              </button>
            </>
          )}
        </section>
      </div>
    </main>
  )
}
