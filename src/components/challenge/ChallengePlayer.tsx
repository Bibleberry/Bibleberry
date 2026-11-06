import { useEffect, useRef, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Bookmark, BookmarkCheck, Check } from 'lucide-react'
import type { CmsChallenge, CmsScripture } from '../../cms/sanity/types.ts'
import {
  CmsBlockView,
  CmsCompanionLinks,
  CmsScripturePanel,
  type CmsScriptureSaveControls,
} from './CmsContentBlocks.tsx'
import { canCompleteChallenge, challengePlayerPosition } from './challengePlayerModel.ts'

/**
 * The narrowly documented presentation subset the player needs. Identity, series, release
 * metadata, and editorial records stay with the host, which already validated the Challenge.
 */
export type ChallengePlayerChallenge = Pick<CmsChallenge, 'title' | 'summary' | 'primaryScripture' | 'screens' | 'companionLinks'>

export type ChallengePlayerProps = {
  challenge: ChallengePlayerChallenge
  /** Host-persisted stable screen identity. Missing or removed identities resolve to the first screen. */
  screenId: string | undefined
  isSaved: boolean
  isCompleted: boolean
  isScriptureSaved: (scripture: CmsScripture) => boolean
  onScreenChange: (screenId: string) => void
  onToggleSaveChallenge: () => void
  onToggleSaveScripture: (scripture: CmsScripture) => void
  /** Called only from the final screen and only while the Challenge is not yet completed. */
  onComplete: () => void
  /**
   * Optional exit signal. When supplied, the player renders a return control; route choice
   * remains entirely with the host.
   */
  onExit?: () => void
  exitLabel?: string
  /** Host-supplied header context, such as series, sequence, and release metadata. */
  eyebrow?: ReactNode
  /** Accessible names that let a host describe its context without the player knowing it. */
  labels?: {
    scriptureCollection?: string
    progress?: string
    navigation?: string
  }
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
  isScriptureSaved,
  onScreenChange,
  onToggleSaveChallenge,
  onToggleSaveScripture,
  onComplete,
  onExit,
  exitLabel = 'Return',
  eyebrow,
  labels = {},
}: ChallengePlayerProps) {
  const screenHeading = useRef<HTMLHeadingElement>(null)
  const position = challengePlayerPosition(challenge.screens, screenId)
  const screen = challenge.screens[position.index]
  const currentScreenId = screen?.id

  useEffect(() => {
    if (!currentScreenId) return
    window.scrollTo({ top: 0, behavior: 'instant' })
    screenHeading.current?.focus({ preventScroll: true })
  }, [currentScreenId])

  if (!screen) return null

  const scriptureSave: CmsScriptureSaveControls = {
    isSaved: isScriptureSaved,
    onToggle: onToggleSaveScripture,
    collectionLabel: labels.scriptureCollection ?? 'My Scripture',
  }
  const complete = () => {
    if (canCompleteChallenge(position, isCompleted)) onComplete()
  }

  return (
    <>
      {onExit && <button type="button" className="back-link challenge-player__exit" onClick={onExit}><ArrowLeft size={17} /> {exitLabel}</button>}
      <header className="lab-challenge-header">
        <div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{challenge.title}</h1>{challenge.summary && <p className="cms-challenge-summary">{challenge.summary}</p>}</div>
        <button type="button" className="button button--secondary lab-save-challenge" aria-pressed={isSaved} onClick={onToggleSaveChallenge}>{isSaved ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}{isSaved ? 'Remove Saved Challenge' : 'Save Challenge'}</button>
      </header>
      <CmsScripturePanel scripture={challenge.primaryScripture} scriptureSave={scriptureSave} primary />
      <div className="lab-progress">
        <div><span>Required screens</span><strong>{position.index + 1} of {position.total}</strong></div>
        <div className="lab-progress__segments" role="progressbar" aria-label={labels.progress ?? 'Required Challenge screen position'} aria-valuemin={1} aria-valuemax={position.total} aria-valuenow={position.index + 1} aria-valuetext={`${position.index + 1} of ${position.total}`}>{challenge.screens.map((item, index) => <span key={item.id} className={index <= position.index ? 'is-filled' : ''} />)}</div>
      </div>
      <article className="lab-screen" key={screen.id} aria-labelledby={`${screen.id}-title`}>
        <p className="eyebrow">{screen.stepLabel}</p><h2 id={`${screen.id}-title`} ref={screenHeading} tabIndex={-1}>{screen.title}</h2>
        <div className="lab-screen__blocks">{screen.blocks.map(block => <CmsBlockView key={block.id} block={block} scriptureSave={scriptureSave} />)}</div>
      </article>
      {isCompleted && position.isLast && <section className="lab-completion" role="status" aria-live="polite"><Check size={22} aria-hidden="true" /><div><h2>Challenge complete</h2><p>You explicitly completed the required screens. Optional content remains available to revisit.</p></div></section>}
      <nav className="lab-screen-nav" aria-label={labels.navigation ?? 'Challenge screen navigation'}>
        <button type="button" className="button button--secondary" disabled={!position.previousScreenId} onClick={() => position.previousScreenId && onScreenChange(position.previousScreenId)}><ArrowLeft size={17} /> Back</button>
        {position.nextScreenId
          ? <button type="button" className="button button--primary" onClick={() => position.nextScreenId && onScreenChange(position.nextScreenId)}>Continue <ArrowRight size={17} /></button>
          : <button type="button" className="button button--primary" disabled={isCompleted} onClick={complete}>{isCompleted && <Check size={17} />}{isCompleted ? 'Challenge complete' : 'Complete Challenge'}</button>}
      </nav>
      <p className="lab-navigation-note">Optional studies, reflection choices, and companion links never change required progress. Revisiting does not automatically complete a Challenge.</p>
      <CmsCompanionLinks links={challenge.companionLinks} />
    </>
  )
}
