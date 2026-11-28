import { useEffect, useId, useRef, useState } from 'react'
import type { GuidedTutorialStepProps } from '../entry/firstUseGate.ts'
import {
  formatTutorialStepAnnouncement,
  formatTutorialStepProgress,
  GUIDED_TUTORIAL_STEPS,
  nextTutorialTab,
  previousTutorialTab,
  stepForTab,
  stepIndexForTab,
  type SpotlightGeometry,
} from './guidedTutorialModel.ts'
import {
  findTutorialTarget,
  observeTutorialAnchor,
  type TutorialTargetResolver,
} from './tutorialAnchors.ts'
import './guidedTutorial.css'

export interface GuidedAppTutorialProps extends GuidedTutorialStepProps {
  readonly resolveTarget?: TutorialTargetResolver
}

export function GuidedAppTutorial({
  mode,
  shownTab,
  onShowTab,
  onComplete,
  onSkip,
  resolveTarget = findTutorialTarget,
}: GuidedAppTutorialProps) {
  const titleId = useId()
  const stepHeadingRef = useRef<HTMLHeadingElement | null>(null)
  const [textGuideOpen, setTextGuideOpen] = useState(false)
  const [geometry, setGeometry] = useState<SpotlightGeometry>({ available: false })

  const step = stepForTab(shownTab)
  const stepIndex = stepIndexForTab(shownTab)
  const prevTab = previousTutorialTab(shownTab)
  const nextTab = nextTutorialTab(shownTab)
  const progressLabel = formatTutorialStepProgress(shownTab)

  // Observe the active destination's actual visible navigation target and re-measure on resize/layout changes.
  useEffect(() => {
    return observeTutorialAnchor(
      step.targetId,
      nextGeometry => {
        setGeometry(nextGeometry)
      },
      resolveTarget,
    )
  }, [resolveTarget, step.targetId])

  // Move keyboard/screen-reader focus to the step heading on mount and step change,
  // unless an active save-failure alert owns focus.
  useEffect(() => {
    const active = document.activeElement
    if (active instanceof HTMLElement && active.closest('[data-testid="first-use-tutorial-save-failure"]')) {
      return
    }
    stepHeadingRef.current?.focus({ preventScroll: true })
  }, [shownTab])

  // Escape always closes/skips the tutorial safely without trapping navigation.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      void onSkip()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onSkip])

  const liveAnnouncement = formatTutorialStepAnnouncement(
    step,
    stepIndex,
    GUIDED_TUTORIAL_STEPS.length,
    {
      targetAvailable: geometry.available,
      textGuideMode: textGuideOpen,
    },
  )

  const showSpotlight = geometry.available && !textGuideOpen

  return (
    <div className="r06-landing">
      <section
        className="r06-tutorial"
        aria-labelledby={titleId}
        data-testid="guided-app-tutorial"
        data-tutorial-mode={mode}
        data-tutorial-step={step.tab}
      >
        <div
          className="r06-tutorial__sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          data-testid="tutorial-live-region"
        >
          {liveAnnouncement}
        </div>

        <header className="r06-tutorial__header">
          <div className="r06-tutorial__title-group">
            <p className="eyebrow">App Tutorial</p>
            <h1 id={titleId}>Finding your way around Bibleberry</h1>
            <p className="r06-tutorial__progress" data-testid="tutorial-step-progress">
              {progressLabel}
            </p>
          </div>
          <button
            type="button"
            className="button button--secondary"
            data-testid="tutorial-close-button"
            aria-label="Close App Tutorial"
            onClick={() => void onSkip()}
          >
            Close
          </button>
        </header>

        <ol className="r06-tutorial__steps" aria-label="Tutorial destinations">
          {GUIDED_TUTORIAL_STEPS.map(item => (
            <li key={item.tab}>
              <button
                type="button"
                className="r06-tutorial__step-button"
                data-testid={`tutorial-step-jump-${item.tab}`}
                aria-current={item.tab === step.tab ? 'step' : undefined}
                onClick={() => onShowTab(item.tab)}
              >
                {item.destinationLabel}
              </button>
            </li>
          ))}
        </ol>

        <article className="r06-tutorial__card" aria-label={`${step.heading} destination guide`}>
          <h2
            ref={stepHeadingRef}
            tabIndex={-1}
            className="r06-tutorial__step-heading"
            data-testid="tutorial-step-heading"
          >
            {step.heading}
          </h2>
          <p className="r06-tutorial__summary" data-testid="tutorial-step-summary">
            {step.summary}
          </p>
          <p className="r06-tutorial__guidance" data-testid="tutorial-step-nonvisual">
            {step.nonvisualGuidance}
          </p>
          {!geometry.available && (
            <p className="r06-tutorial__fallback-note" data-testid="tutorial-missing-target-note">
              The visual highlight is unavailable in this view, so text guidance is shown instead.
            </p>
          )}
        </article>

        <div className="r06-tutorial__actions">
          <button
            type="button"
            className="button button--secondary"
            data-testid="tutorial-back-button"
            disabled={prevTab === null}
            onClick={() => {
              if (prevTab) onShowTab(prevTab)
            }}
          >
            Back
          </button>
          {nextTab !== null ? (
            <button
              type="button"
              className="button button--primary"
              data-testid="tutorial-next-button"
              onClick={() => onShowTab(nextTab)}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              className="button button--primary"
              data-testid="tutorial-finish-button"
              onClick={() => void onComplete()}
            >
              Finish
            </button>
          )}
          <button
            type="button"
            className="button button--secondary"
            data-testid="tutorial-skip-button"
            onClick={() => void onSkip()}
          >
            Skip
          </button>
        </div>

        <div className="r06-tutorial__text-guide-bar">
          <button
            type="button"
            className="button button--secondary"
            data-testid="tutorial-text-guide-toggle"
            aria-expanded={textGuideOpen}
            onClick={() => setTextGuideOpen(open => !open)}
          >
            {textGuideOpen ? 'Hide all-steps text guide' : 'Read all four destinations as text'}
          </button>
        </div>

        {textGuideOpen && (
          <section
            className="r06-tutorial__text-guide"
            aria-label="All four destinations text guide"
            data-testid="tutorial-text-guide"
          >
            <h2>All four destinations</h2>
            <ol className="r06-tutorial__text-guide-list">
              {GUIDED_TUTORIAL_STEPS.map(item => (
                <li key={item.tab} className="r06-tutorial__text-guide-item">
                  <h3>{item.heading}</h3>
                  <p>{item.summary}</p>
                  <p>{item.nonvisualGuidance}</p>
                </li>
              ))}
            </ol>
          </section>
        )}
      </section>

      {showSpotlight && (
        <div
          className="r06-tutorial__spotlight"
          aria-hidden="true"
          data-testid="tutorial-spotlight"
          data-spotlight-target={step.targetId}
          style={{
            top: `${geometry.top}px`,
            left: `${geometry.left}px`,
            width: `${geometry.width}px`,
            height: `${geometry.height}px`,
          }}
        />
      )}
    </div>
  )
}
