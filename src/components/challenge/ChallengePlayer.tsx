import { useEffect, useRef, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Bookmark, BookmarkCheck, Check, RotateCcw } from 'lucide-react'
import type { CmsScripture } from '../../cms/sanity/types.ts'
import {
  CmsBlockView,
  CmsCompanionLinks,
  CmsScripturePanel,
  type CmsScriptureSaveControls,
} from './CmsContentBlocks.tsx'
import {
  canCompleteChallenge,
  canStartChallengeFromBeginning,
  challengePlayerPosition,
  formatChallengeScreenPosition,
  resolveChallengePlayerCopy,
  resolveFirstScreenId,
  type ChallengePlayerChallenge,
  type ChallengePlayerLabels,
} from './challengePlayerModel.ts'
import './challengePlayerAccessibility.css'

/**
 * The narrowly documented presentation subset the player needs. Identity, series, release
 * metadata, and editorial records stay with the host, which already validated the Challenge.
 *
 * Identity contract note (Issue #41, A1 -> A3): `CmsChallenge` currently carries both a
 * slug-derived `id` and a Sanity `documentId`. Those two values must not be silently equated as
 * canonical persistent reader identity: the Developer Studio CMS Lab keys isolated state by
 * source-qualified `documentId` (`sanity-${source}:${challenge.documentId}`), while durable
 * ordinary-reader identity and participation records belong to a later host contract (A3).
 * Keeping identity fields out of `ChallengePlayerChallenge` ensures the player never invents or
 * assumes storage keys.
 */
export type { ChallengePlayerChallenge, ChallengePlayerLabels }

export type ChallengePlayerProps = {
  challenge: ChallengePlayerChallenge
  /** Host-persisted stable screen identity. Missing or removed identities resolve to the first screen. */
  screenId: string | undefined
  isSaved: boolean
  isCompleted: boolean
  isInProgress?: boolean
  isScriptureSaved: (scripture: CmsScripture) => boolean
  onScreenChange: (screenId: string) => void
  onToggleSaveChallenge: () => void
  onToggleSaveScripture: (scripture: CmsScripture) => void
  /** Called only from the final screen and only while the Challenge is not yet completed. */
  onComplete: () => void
  onStartProgress?: () => void
  /**
   * Optional position-only restart handler (`Start from Beginning` / `Read Again`).
   * Moves to the first screen without deleting completions, earned Cards, or Saved Scripture.
   */
  onStartFromBeginning?: () => void
  /**
   * Optional exit signal. When supplied, the player renders a return control; route choice
   * remains entirely with the host.
   */
  onExit?: () => void
  onFinishReread?: () => void
  exitLabel?: string
  /** Host-supplied header context, such as series, sequence, and release metadata. */
  eyebrow?: ReactNode
  /**
   * Developer-facing CMS diagnostic mode (used by Developer Studio's Sanity CMS Lab).
   * Keeps CMS/Sanity configuration and practice-availability diagnostics out of the ordinary reader.
   */
  diagnostics?: boolean
  /**
   * Ordinary reader Finish behavior: suppresses any in-reader completion confirmation panel
   * and allows exiting via `Finish` when rereading an already-completed Challenge.
   * Ignored when `diagnostics` is true.
   */
  returnOnFinish?: boolean
  /** Accessible names and optional visible labels that let a host describe its context without the player knowing it. */
  labels?: ChallengePlayerLabels
}

/**
 * Controlled multi-screen Challenge player. It renders authored screens in order, offers
 * Back/Continue, and keeps save Challenge, save Scripture, and explicit completion as separate
 * events. It never fetches content, reads or writes browser storage, or chooses routes.
 *
 * Hosts should give the player a `key` derived from the Challenge identity so that heading focus
 * resets when a different Challenge opens.
 */
export function ChallengePlayer({
  challenge,
  screenId,
  isSaved,
  isCompleted,
  isInProgress = false,
  isScriptureSaved,
  onScreenChange,
  onToggleSaveChallenge,
  onToggleSaveScripture,
  onComplete,
  onStartProgress,
  onStartFromBeginning,
  onExit,
  onFinishReread = onExit,
  exitLabel = 'Exit',
  eyebrow,
  diagnostics = false,
  returnOnFinish = false,
  labels = {},
}: ChallengePlayerProps) {
  const screenHeading = useRef<HTMLHeadingElement>(null)
  const completionDispatchedRef = useRef(false)
  const wasCompletedRef = useRef(isCompleted)
  const position = challengePlayerPosition(challenge.screens, screenId)
  const screen = challenge.screens[position.index]
  const currentScreenId = screen?.id
  const effectiveReturnOnFinish = !diagnostics && returnOnFinish

  useEffect(() => {
    if (wasCompletedRef.current && !isCompleted) {
      completionDispatchedRef.current = false
    }
    wasCompletedRef.current = isCompleted
  }, [isCompleted])

  useEffect(() => {
    completionDispatchedRef.current = false
  }, [challenge])

  useEffect(() => {
    if (!currentScreenId) return
    window.scrollTo({ top: 0, behavior: 'instant' })
    screenHeading.current?.focus({ preventScroll: true })
  }, [currentScreenId])

  if (!screen) return null

  const copy = resolveChallengePlayerCopy({
    diagnostics,
    returnOnFinish: effectiveReturnOnFinish,
    labels,
  })
  const scriptureSave: CmsScriptureSaveControls = {
    isSaved: isScriptureSaved,
    onToggle: onToggleSaveScripture,
    collectionLabel: copy.scriptureCollection,
  }
  const complete = () => {
    if (completionDispatchedRef.current) return
    if (canCompleteChallenge(position, isCompleted)) {
      completionDispatchedRef.current = true
      onComplete()
    }
  }
  const canRestartFromBeginning = canStartChallengeFromBeginning(position)
  const firstScreenId = resolveFirstScreenId(challenge.screens)
  const screenPositionText = formatChallengeScreenPosition(position, { diagnostics })
  const restartFromBeginning = () => {
    if (!canRestartFromBeginning) return
    if (onStartFromBeginning) {
      onStartFromBeginning()
      return
    }
    if (firstScreenId) {
      onScreenChange(firstScreenId)
    }
  }

  return (
    <>
      {onExit && <button type="button" className="back-link challenge-player__exit" onClick={onExit}><ArrowLeft size={17} aria-hidden="true" /> {exitLabel}</button>}
      <header className="lab-challenge-header">
        <div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{challenge.title}</h1>{challenge.summary && <p className="cms-challenge-summary">{challenge.summary}</p>}</div>
        <button type="button" className="button button--secondary lab-save-challenge" aria-pressed={isSaved} onClick={onToggleSaveChallenge}>{isSaved ? <BookmarkCheck size={17} aria-hidden="true" /> : <Bookmark size={17} aria-hidden="true" />}{isSaved ? 'Remove Saved Challenge' : 'Save Challenge'}</button>
      </header>
      <CmsScripturePanel scripture={challenge.primaryScripture} scriptureSave={scriptureSave} diagnostics={diagnostics} primary />
      <div className="lab-progress">
        <div><span>{copy.progressHeading}</span><strong>{screenPositionText}</strong></div>
        <div className="lab-progress__segments" role="progressbar" aria-label={copy.progressAriaLabel} aria-valuemin={1} aria-valuemax={position.total} aria-valuenow={position.index + 1} aria-valuetext={screenPositionText}>{challenge.screens.map((item, index) => <span key={item.id} className={index <= position.index ? 'is-filled' : ''} />)}</div>
      </div>
      <article className="lab-screen" key={screen.id} aria-labelledby={`${screen.id}-title`}>
        <p className="eyebrow">{screen.stepLabel}</p><h2 id={`${screen.id}-title`} className="challenge-player__screen-heading" ref={screenHeading} tabIndex={-1}>{screen.title}</h2>
        <div className="lab-screen__blocks">{screen.blocks.map(block => <CmsBlockView key={block.id} block={block} scriptureSave={scriptureSave} diagnostics={diagnostics} />)}</div>
      </article>
      {isCompleted && position.isLast && !effectiveReturnOnFinish && (
        <section className="lab-completion" role="status" aria-live="polite">
          <Check size={22} aria-hidden="true" />
          <div>
            <h2>Challenge complete</h2>
            <p>{copy.completionMessage}</p>
            {!diagnostics && canRestartFromBeginning && (
              <div className="challenge-player__completion-actions">
                <button
                  type="button"
                  className="button button--secondary challenge-player__read-again"
                  onClick={restartFromBeginning}
                >
                  <RotateCcw size={15} aria-hidden="true" /> {copy.readAgainButton}
                </button>
              </div>
            )}
          </div>
        </section>
      )}
      <nav className="lab-screen-nav" aria-label={copy.navigationAriaLabel}>
        {position.previousScreenId ? (
          <button
            type="button"
            className="button button--secondary"
            onClick={() => onScreenChange(position.previousScreenId!)}
          >
            <ArrowLeft size={17} aria-hidden="true" /> {copy.previousButton}
          </button>
        ) : position.total === 1 && !isCompleted && !isInProgress && onStartProgress ? (
          <button
            type="button"
            className="button button--secondary"
            onClick={onStartProgress}
          >
            {copy.startChallengeButton}
          </button>
        ) : (
          <button type="button" className="button button--secondary" disabled>
            <ArrowLeft size={17} aria-hidden="true" /> {copy.previousButton}
          </button>
        )}
        {position.nextScreenId ? (
          <button
            type="button"
            className="button button--primary"
            onClick={() => onScreenChange(position.nextScreenId!)}
          >
            {copy.nextButton} <ArrowRight size={17} aria-hidden="true" />
          </button>
        ) : isCompleted && effectiveReturnOnFinish ? (
          <button
            type="button"
            className="button button--primary"
            disabled={!onFinishReread}
            onClick={onFinishReread}
          >
            {copy.completedButton}
          </button>
        ) : (
          <button
            type="button"
            className="button button--primary"
            disabled={isCompleted}
            onClick={complete}
          >
            {isCompleted && <Check size={17} aria-hidden="true" />}
            {isCompleted ? copy.completedButton : copy.finishButton}
          </button>
        )}
      </nav>
      {!diagnostics && position.total > 1 && (
        <div className="challenge-player__secondary-controls">
          <button
            type="button"
            className="button button--text challenge-player__restart"
            disabled={!canRestartFromBeginning}
            onClick={restartFromBeginning}
          >
            <RotateCcw size={15} aria-hidden="true" /> {copy.startFromBeginningButton}
          </button>
        </div>
      )}
      <p className="lab-navigation-note">{copy.navigationNote}</p>
      <CmsCompanionLinks links={challenge.companionLinks} />
    </>
  )
}
