import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import {
  ArrowDown, ArrowLeft, ArrowRight, BookOpen, Bookmark, BookmarkCheck,
  Check, ChevronDown, Cloud, FileJson, Headphones, Library, RotateCcw, Trash2,
} from 'lucide-react'
import {
  interactiveChallenges,
  labMemorizationEntry,
  normalizeScriptureIdentity,
  type InteractiveChallenge,
  type LabBlock,
  type LabScripture,
} from '../data/interactiveChallenges'
import { MemorizationTool } from './FormationViews'
import { SanityChallengeLab } from '../cms/sanity/SanityChallengeLab'

const BerryMarkLocalPreview = import.meta.env.DEV
  ? lazy(() => import('../cms/sanity/BerryMarkLocalPreview').then(module => ({ default: module.BerryMarkLocalPreview })))
  : null

const LAB_STORAGE_KEY = 'bibleberry-interactive-challenge-lab-v1'

type LabState = {
  positions: Record<string, number>
  completedChallengeIds: string[]
  savedChallengeIds: string[]
  scripture: LabScripture[]
}

type LabView = 'home' | 'challenge' | 'scripture' | 'practice'

const initialLabState: LabState = {
  positions: {},
  completedChallengeIds: [],
  savedChallengeIds: [],
  scripture: [],
}

function loadLabState(): LabState {
  try {
    const saved = localStorage.getItem(LAB_STORAGE_KEY)
    if (!saved) return initialLabState
    const parsed = JSON.parse(saved) as Partial<LabState>
    return {
      positions: parsed.positions && typeof parsed.positions === 'object' ? parsed.positions : {},
      completedChallengeIds: Array.isArray(parsed.completedChallengeIds) ? parsed.completedChallengeIds : [],
      savedChallengeIds: Array.isArray(parsed.savedChallengeIds) ? parsed.savedChallengeIds : [],
      scripture: Array.isArray(parsed.scripture) ? parsed.scripture : [],
    }
  } catch {
    return initialLabState
  }
}

function DraftBadge() {
  return <span className="lab-draft-badge">Draft editorial · For Alexis’s review</span>
}

function ScriptureSaveButton({ scripture, saved, onToggle, compact = false }: {
  scripture: LabScripture
  saved: boolean
  onToggle: (scripture: LabScripture) => void
  compact?: boolean
}) {
  return (
    <button
      type="button"
      className={`button ${saved ? 'button--text' : 'button--secondary'} lab-scripture-save ${compact ? 'lab-scripture-save--compact' : ''}`}
      aria-pressed={saved}
      aria-label={`${saved ? 'Remove' : 'Add'} ${scripture.reference} ${saved ? 'from' : 'to'} My Scripture`}
      onClick={() => onToggle(scripture)}
    >
      {saved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
      {saved ? 'Remove from My Scripture' : 'Add to My Scripture'}
    </button>
  )
}

function OptionalExploration({ block, isScriptureSaved, onToggleScripture }: {
  block: Extract<LabBlock, { type: 'optionalExploration' }>
  isScriptureSaved: (scripture: LabScripture) => boolean
  onToggleScripture: (scripture: LabScripture) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const contentId = `${block.id}-content`
  return (
    <section className="lab-optional">
      <button
        type="button"
        className="lab-optional__toggle"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded(value => !value)}
      >
        <span><small>Optional deeper study</small><strong>{block.title}</strong></span>
        <ChevronDown size={18} aria-hidden="true" />
      </button>
      <div id={contentId} className="lab-optional__content" hidden={!expanded}>
        <DraftBadge />
        {block.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
        {block.scriptures.map(scripture => (
          <div className="lab-reference-save" key={scripture.id}>
            <div>
              <strong>{scripture.reference}</strong>
              <p>Reference only · Translation text not configured · Memorization practice not configured</p>
            </div>
            <ScriptureSaveButton scripture={scripture} saved={isScriptureSaved(scripture)} onToggle={onToggleScripture} compact />
          </div>
        ))}
      </div>
    </section>
  )
}

function ReflectionChoice({ block }: { block: Extract<LabBlock, { type: 'reflectionChoice' }> }) {
  const [selected, setSelected] = useState('')
  const choice = block.choices.find(item => item.id === selected)
  return (
    <section className="lab-reflection" aria-labelledby={`${block.id}-question`}>
      <span className="section-label">Optional reflection · No answer required</span>
      <h3 id={`${block.id}-question`}>{block.question}</h3>
      {block.draftEditorial && <DraftBadge />}
      <div className="lab-reflection__choices">
        {block.choices.map(item => (
          <button key={item.id} type="button" aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      {choice && <div className="lab-reflection__prompt" role="status" aria-live="polite">
        <DraftBadge />
        <p>{choice.prompt}</p>
      </div>}
      {block.closing && <p className="lab-reflection__closing">{block.closing}</p>}
    </section>
  )
}

function ConnectedSequence({ block }: { block: Extract<LabBlock, { type: 'connectedSequence' }> }) {
  return (
    <section className={`lab-sequence ${block.cycle ? 'lab-sequence--cycle' : ''}`} aria-label="Connected teaching sequence">
      {block.draftEditorial && <DraftBadge />}
      <ol>
        {block.steps.map((step, index) => (
          <li key={step.title}>
            <article>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
            {index < block.steps.length - 1 && <ArrowRight className="lab-sequence__arrow-desktop" size={20} aria-hidden="true" />}
            {index < block.steps.length - 1 && <ArrowDown className="lab-sequence__arrow-mobile" size={20} aria-hidden="true" />}
          </li>
        ))}
      </ol>
      {block.cycle && <div className="lab-sequence__return"><RotateCcw size={18} aria-hidden="true" /><span>Thanksgiving returns us to rejoicing.</span></div>}
      {block.conclusion && <p className="lab-sequence__conclusion">{block.conclusion}</p>}
    </section>
  )
}

function RelatedResource({ block }: { block: Extract<LabBlock, { type: 'relatedResource' }> }) {
  return (
    <aside className="lab-related-resource">
      <Headphones size={19} aria-hidden="true" />
      <div><h3>{block.title}</h3><p>{block.description}</p>{block.availability && <small>{block.availability}</small>}</div>
    </aside>
  )
}

function LabBlockView({ block, isScriptureSaved, onToggleScripture }: {
  block: LabBlock
  isScriptureSaved: (scripture: LabScripture) => boolean
  onToggleScripture: (scripture: LabScripture) => void
}) {
  if (block.type === 'scripture') {
    const { scripture } = block
    return (
      <section className="scripture-panel lab-scripture" aria-labelledby={`${block.id}-label`}>
        <span className="section-label" id={`${block.id}-label`}>Scripture focus · {scripture.translation}</span>
        <blockquote className="scripture-block"><p>{scripture.passage}</p><cite>{scripture.reference} · {scripture.translation}</cite></blockquote>
        <div className="lab-scripture__actions">
          <ScriptureSaveButton scripture={scripture} saved={isScriptureSaved(scripture)} onToggle={onToggleScripture} />
          <small>Supplied text · Memorization practice configured</small>
        </div>
      </section>
    )
  }
  if (block.type === 'teachingText') {
    return <section className="lab-teaching-text">
      {block.draftEditorial && <DraftBadge />}
      <div className="longform">{block.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</div>
      {block.pullQuote && <aside className="teaching-pull-quote"><span>Alexis’s teaching</span><p>{block.pullQuote}</p></aside>}
    </section>
  }
  if (block.type === 'visualCards') {
    return <section className="lab-visual-cards">
      {block.draftEditorial && <DraftBadge />}
      <div>{block.cards.map(card => <article key={card.title}><h3>{card.title}</h3>{card.body && <p>{card.body}</p>}</article>)}</div>
    </section>
  }
  if (block.type === 'contrast') {
    return <section className="lab-contrast">
      {block.draftEditorial && <DraftBadge />}
      <div>{[block.left, block.right].map(side => <article key={side.title}><h3>{side.title}</h3>{side.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</article>)}</div>
      {block.footer && <p>{block.footer}</p>}
    </section>
  }
  if (block.type === 'connectedSequence') return <ConnectedSequence block={block} />
  if (block.type === 'reflectionChoice') return <ReflectionChoice block={block} />
  if (block.type === 'prayer') {
    return <section className="prayer-section lab-prayer" aria-labelledby={`${block.id}-title`}>
      <span className="section-label" id={`${block.id}-title`}>Prayer</span>
      {block.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
    </section>
  }
  if (block.type === 'optionalExploration') return <OptionalExploration block={block} isScriptureSaved={isScriptureSaved} onToggleScripture={onToggleScripture} />
  return <RelatedResource block={block} />
}

function ChallengeHome({ state, onOpen, onOpenScripture, onToggleSaved }: {
  state: LabState
  onOpen: (challenge: InteractiveChallenge) => void
  onOpenScripture: () => void
  onToggleSaved: (id: string) => void
}) {
  return (
    <>
      <header className="page-intro lab-home-intro">
        <p className="eyebrow">INTERACTIVE CHALLENGE LAB</p>
        <h1>Four guided Biblical Teaching Challenges.</h1>
        <p>Review Alexis Waid’s November manuscripts as short, guided experiences. Progress measures only your place in the required screens; deeper studies and reflections remain optional.</p>
      </header>
      <section className="lab-challenge-list" aria-label="Interactive lab Challenges">
        {interactiveChallenges.map(challenge => {
          const position = Math.min(state.positions[challenge.id] ?? 0, challenge.screens.length - 1)
          const completed = state.completedChallengeIds.includes(challenge.id)
          const saved = state.savedChallengeIds.includes(challenge.id)
          return <article key={challenge.id} className="lab-challenge-row">
            <button type="button" className="lab-challenge-row__open" onClick={() => onOpen(challenge)}>
              <span className="lab-challenge-row__date">{challenge.shortDate}</span>
              <span><small>Biblical Teaching Challenge · {challenge.screens.length} screens</small><strong>{challenge.title}</strong><em>{completed ? 'Completed · Revisit any screen' : position > 0 ? `Resume at ${position + 1} of ${challenge.screens.length}` : 'Begin Challenge'}</em></span>
              <ArrowRight size={19} aria-hidden="true" />
            </button>
            <button type="button" className="lab-challenge-row__save" aria-pressed={saved} aria-label={`${saved ? 'Remove' : 'Save'} ${challenge.title} ${saved ? 'from' : 'to'} Saved Challenges`} onClick={() => onToggleSaved(challenge.id)}>
              {saved ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}<span>{saved ? 'Saved' : 'Save'}</span>
            </button>
          </article>
        })}
      </section>
      <section className="lab-library-link" aria-labelledby="lab-library-heading">
        <div><Library size={21} aria-hidden="true" /><span><h2 id="lab-library-heading">My Scripture</h2><p>{state.scripture.length} saved {state.scripture.length === 1 ? 'passage or reference' : 'passages and references'} · Separate from Saved Challenges</p></span></div>
        <button type="button" className="button button--secondary" onClick={onOpenScripture}>Open My Scripture <ArrowRight size={16} /></button>
      </section>
      <p className="local-note"><BookOpen size={17} />Lab progress, completion, bookmarks, and Scripture saves stay in this browser under a separate test namespace. They never enter your ordinary Journey, reading history, appearance, or reading-size settings.</p>
    </>
  )
}

function ScriptureLibrary({ state, onBack, onToggle, onPractice }: {
  state: LabState
  onBack: () => void
  onToggle: (scripture: LabScripture) => void
  onPractice: () => void
}) {
  return (
    <section className="lab-scripture-library" aria-labelledby="my-scripture-title">
      <button type="button" className="back-link" onClick={onBack}><ArrowLeft size={17} /> Back to Challenge Lab</button>
      <header className="page-intro">
        <p className="eyebrow">PERSONAL TEST COLLECTION</p>
        <h1 id="my-scripture-title">My Scripture</h1>
        <p>Passages and references saved from the lab, deduplicated by reference and translation. This list is independent of Saved Challenges.</p>
      </header>
      {state.scripture.length === 0 ? <div className="empty-state"><BookOpen /><h2>No Scripture saved yet</h2><p>Use “Add to My Scripture” beside the primary passage or within an optional deeper study.</p></div> : (
        <div className="lab-saved-scripture-list">
          {state.scripture.map(scripture => {
            const configured = scripture.practiceStatus === 'configured' && scripture.textStatus === 'provided'
            return <article key={normalizeScriptureIdentity(scripture.reference, scripture.translation)} className="lab-saved-scripture">
              <div className="lab-saved-scripture__heading"><div><h2>{scripture.reference}</h2><p>{scripture.translation === 'Not configured' ? 'Translation not configured' : scripture.translation}</p></div><BookOpen size={20} aria-hidden="true" /></div>
              {scripture.passage && <blockquote>{scripture.passage}</blockquote>}
              <p className="lab-availability">{configured ? 'Supplied text available · Memorization practice configured' : 'Reference only · Text availability not configured · Practice not configured'}</p>
              <div className="lab-saved-scripture__actions">
                {configured && <button type="button" className="button button--primary" onClick={onPractice}>Practice this passage <ArrowRight size={16} /></button>}
                <button type="button" className="button button--text danger-link" onClick={() => onToggle(scripture)}><Trash2 size={16} /> Remove from My Scripture</button>
              </div>
            </article>
          })}
        </div>
      )}
    </section>
  )
}

function LocalPrototypeLab({ onReturnToStudio }: { onReturnToStudio: () => void }) {
  const [state, setState] = useState<LabState>(loadLabState)
  const [view, setView] = useState<LabView>('home')
  const [selectedId, setSelectedId] = useState<InteractiveChallenge['id']>('nov-1')
  const screenHeading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    localStorage.setItem(LAB_STORAGE_KEY, JSON.stringify(state))
  }, [state])

  const challenge = interactiveChallenges.find(item => item.id === selectedId)!
  const currentIndex = Math.min(state.positions[selectedId] ?? 0, challenge.screens.length - 1)
  const screen = challenge.screens[currentIndex]
  const completed = state.completedChallengeIds.includes(selectedId)
  const challengeSaved = state.savedChallengeIds.includes(selectedId)

  useEffect(() => {
    if (view !== 'challenge') return
    window.scrollTo({ top: 0, behavior: 'instant' })
    screenHeading.current?.focus({ preventScroll: true })
  }, [view, selectedId, currentIndex])

  const isScriptureSaved = (scripture: LabScripture) => state.scripture.some(item => normalizeScriptureIdentity(item.reference, item.translation) === normalizeScriptureIdentity(scripture.reference, scripture.translation))
  const toggleScripture = (scripture: LabScripture) => {
    const identity = normalizeScriptureIdentity(scripture.reference, scripture.translation)
    setState(previous => {
      const exists = previous.scripture.some(item => normalizeScriptureIdentity(item.reference, item.translation) === identity)
      return { ...previous, scripture: exists ? previous.scripture.filter(item => normalizeScriptureIdentity(item.reference, item.translation) !== identity) : [...previous.scripture, scripture] }
    })
  }
  const toggleSavedChallenge = (id: string) => setState(previous => ({
    ...previous,
    savedChallengeIds: previous.savedChallengeIds.includes(id) ? previous.savedChallengeIds.filter(item => item !== id) : [...previous.savedChallengeIds, id],
  }))
  const openChallenge = (target: InteractiveChallenge) => {
    setSelectedId(target.id)
    setView('challenge')
  }
  const goToScreen = (index: number) => {
    const bounded = Math.max(0, Math.min(index, challenge.screens.length - 1))
    setState(previous => ({ ...previous, positions: { ...previous.positions, [selectedId]: bounded } }))
  }
  const completeChallenge = () => {
    setState(previous => ({ ...previous, completedChallengeIds: previous.completedChallengeIds.includes(selectedId) ? previous.completedChallengeIds : [...previous.completedChallengeIds, selectedId] }))
  }

  return (
    <div className="standard-page interactive-challenge-lab">
      <div className="lab-topbar">
        <button type="button" className="back-link" onClick={onReturnToStudio}><ArrowLeft size={17} /> Return to Developer Studio</button>
        {view !== 'home' && <button type="button" className="back-link" onClick={() => setView('home')}><Library size={16} /> Challenge Lab home</button>}
      </div>

      {view === 'home' && <ChallengeHome state={state} onOpen={openChallenge} onOpenScripture={() => setView('scripture')} onToggleSaved={toggleSavedChallenge} />}

      {view === 'scripture' && <ScriptureLibrary state={state} onBack={() => setView('home')} onToggle={toggleScripture} onPractice={() => setView('practice')} />}

      {view === 'practice' && <section className="lab-practice-view">
        <button type="button" className="back-link" onClick={() => setView('scripture')}><ArrowLeft size={17} /> Back to My Scripture</button>
        <p className="eyebrow">MY SCRIPTURE · EXISTING REVEAL PRACTICE</p>
        <article className="formation-entry"><MemorizationTool entry={labMemorizationEntry} /></article>
      </section>}

      {view === 'challenge' && <>
        <nav className="lab-switcher" aria-label="Switch Interactive Challenge">
          {interactiveChallenges.map(item => <button key={item.id} type="button" className={item.id === selectedId ? 'is-current' : ''} aria-current={item.id === selectedId ? 'page' : undefined} onClick={() => openChallenge(item)}>{item.shortDate}</button>)}
        </nav>
        <header className="lab-challenge-header">
          <div><p className="eyebrow">BIBLICAL TEACHING CHALLENGE · {challenge.displayDate}</p><h1>{challenge.title}</h1></div>
          <button type="button" className="button button--secondary lab-save-challenge" aria-pressed={challengeSaved} onClick={() => toggleSavedChallenge(selectedId)}>
            {challengeSaved ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}{challengeSaved ? 'Remove Saved Challenge' : 'Save Challenge'}
          </button>
        </header>
        <div className="lab-progress">
          <div><span>Required screens</span><strong>{currentIndex + 1} of {challenge.screens.length}</strong></div>
          <div className="lab-progress__segments" role="progressbar" aria-label="Required Challenge screen position" aria-valuemin={1} aria-valuemax={challenge.screens.length} aria-valuenow={currentIndex + 1} aria-valuetext={`${currentIndex + 1} of ${challenge.screens.length}`}>
            {challenge.screens.map((item, index) => <span key={item.id} className={index <= currentIndex ? 'is-filled' : ''} />)}
          </div>
        </div>
        <article className="lab-screen" key={screen.id} aria-labelledby={`${screen.id}-title`}>
          <p className="eyebrow">{screen.stepLabel}</p>
          <h2 id={`${screen.id}-title`} ref={screenHeading} tabIndex={-1}>{screen.title}</h2>
          <div className="lab-screen__blocks">
            {screen.blocks.map(block => <LabBlockView key={block.id} block={block} isScriptureSaved={isScriptureSaved} onToggleScripture={toggleScripture} />)}
          </div>
        </article>
        {completed && currentIndex === challenge.screens.length - 1 && <section className="lab-completion" role="status" aria-live="polite">
          <Check size={22} aria-hidden="true" /><div><h2>Challenge complete</h2><p>You’ve reached the end of the required screens. You can revisit any part whenever you like.</p></div>
        </section>}
        {completed && currentIndex === challenge.screens.length - 1 && challenge.relatedResources.length > 0 && <section className="lab-related-list" aria-labelledby={`${challenge.id}-related`}>
          <span className="section-label" id={`${challenge.id}-related`}>Related materials · Not required</span>
          {challenge.relatedResources.map(block => <RelatedResource key={block.id} block={block} />)}
        </section>}
        <nav className="lab-screen-nav" aria-label="Challenge screen navigation">
          <button type="button" className="button button--secondary" disabled={currentIndex === 0} onClick={() => goToScreen(currentIndex - 1)}><ArrowLeft size={17} /> Back</button>
          {currentIndex < challenge.screens.length - 1
            ? <button type="button" className="button button--primary" onClick={() => goToScreen(currentIndex + 1)}>Continue <ArrowRight size={17} /></button>
            : <button type="button" className="button button--primary" disabled={completed} onClick={completeChallenge}>{completed ? <Check size={17} /> : null}{completed ? 'Challenge complete' : 'Complete Challenge'}</button>}
        </nav>
        <p className="lab-navigation-note">Optional studies and reflection choices never change required progress. Switching Challenges does not mark them complete.</p>
      </>}
    </div>
  )
}

export function InteractiveChallengeLab({ onReturnToStudio }: { onReturnToStudio: () => void }) {
  const [source, setSource] = useState<'local' | 'sanity' | 'berrymark'>('local')

  return (
    <>
      <section className="standard-page interactive-challenge-lab lab-source-selector-page" aria-labelledby="lab-source-heading">
        <div className="lab-source-selector">
          <div>
            <span className="section-label" id="lab-source-heading">Interactive Challenge Lab source</span>
            <p>Choose the unchanged hardcoded prototype or the Developer Studio-only Sanity renderer.</p>
          </div>
          <div className="lab-source-selector__buttons" role="group" aria-label="Challenge content source">
            <button type="button" aria-pressed={source === 'local'} className={source === 'local' ? 'is-current' : ''} onClick={() => setSource('local')}>
              <BookOpen size={16} aria-hidden="true" /> Local Prototype
            </button>
            <button type="button" aria-pressed={source === 'sanity'} className={source === 'sanity' ? 'is-current' : ''} onClick={() => setSource('sanity')}>
              <Cloud size={16} aria-hidden="true" /> Sanity CMS
            </button>
            {import.meta.env.DEV && <button type="button" aria-pressed={source === 'berrymark'} className={source === 'berrymark' ? 'is-current' : ''} onClick={() => setSource('berrymark')}>
              <FileJson size={16} aria-hidden="true" /> BerryMark Local Preview
            </button>}
          </div>
        </div>
      </section>
      {source === 'local' && <LocalPrototypeLab onReturnToStudio={onReturnToStudio} />}
      {source === 'sanity' && <SanityChallengeLab onReturnToStudio={onReturnToStudio} />}
      {source === 'berrymark' && import.meta.env.DEV && BerryMarkLocalPreview && <Suspense fallback={<div className="standard-page cms-catalog-state" role="status">Loading local preview tooling…</div>}>
        <BerryMarkLocalPreview />
      </Suspense>}
    </>
  )
}
