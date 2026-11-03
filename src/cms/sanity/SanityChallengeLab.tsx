import { useEffect, useRef, useState } from 'react'
import { PortableText, type PortableTextComponents } from '@portabletext/react'
import {
  ArrowDown, ArrowLeft, ArrowRight, BookOpen, Bookmark, BookmarkCheck,
  Check, ChevronDown, Cloud, ExternalLink, FlaskConical, Library, RotateCcw, Trash2,
} from 'lucide-react'
import { loadPublishedChallengeCatalog, type CmsCatalogResult } from './catalog.ts'
import { validChallengeFixture } from './developmentFixture.ts'
import {
  cmsChallengeKey,
  cmsScriptureKey,
  emptyCmsLabState,
  readCmsLabState,
  resolveCmsScreenIndex,
  toggleCmsSavedChallenge,
  toggleCmsScripture,
  writeCmsLabState,
  type CmsLabState,
  type CmsSourceKind,
} from './labState.ts'
import { mapPublishedChallenge } from './mapChallenge.ts'
import { formatCmsReleaseDate, presentCmsScripture } from './presentation.ts'
import type {
  CmsBlock,
  CmsChallenge,
  CmsCompanionLink,
  CmsPortableText,
  CmsScripture,
} from './types.ts'

const developmentChallenges = (() => {
  const result = mapPublishedChallenge(validChallengeFixture)
  if (!result.ok) throw new Error('The structural CMS development fixture is invalid.')
  return [result.challenge]
})()

const portableTextComponents: PortableTextComponents = {
  block: {
    normal: ({ children }) => <p>{children}</p>,
    h2: ({ children }) => <h2>{children}</h2>,
    h3: ({ children }) => <h3>{children}</h3>,
    blockquote: ({ children }) => <blockquote className="cms-portable-quote"><p>{children}</p></blockquote>,
  },
  marks: {
    strong: ({ children }) => <strong>{children}</strong>,
    em: ({ children }) => <em>{children}</em>,
    link: ({ children, value }) => {
      const href = typeof value?.href === 'string' ? value.href : ''
      if (!href) return <>{children}</>
      return <a href={href} target="_blank" rel="noreferrer noopener">{children}<ExternalLink size={13} aria-hidden="true" /></a>
    },
  },
  list: {
    bullet: ({ children }) => <ul>{children}</ul>,
    number: ({ children }) => <ol>{children}</ol>,
  },
  listItem: {
    bullet: ({ children }) => <li>{children}</li>,
    number: ({ children }) => <li>{children}</li>,
  },
}

function CmsPortableTextView({ value }: { value: CmsPortableText }) {
  return <div className="longform cms-portable-text"><PortableText value={value} components={portableTextComponents} /></div>
}

function CmsScriptureSaveButton({ scripture, source, state, onToggle }: {
  scripture: CmsScripture
  source: CmsSourceKind
  state: CmsLabState
  onToggle: (source: CmsSourceKind, scripture: CmsScripture) => void
}) {
  const saved = state.scripture.some(entry => entry.key === cmsScriptureKey(source, scripture))
  return (
    <button
      type="button"
      className={`button ${saved ? 'button--text' : 'button--secondary'} lab-scripture-save`}
      aria-pressed={saved}
      aria-label={`${saved ? 'Remove' : 'Add'} ${scripture.reference} ${saved ? 'from' : 'to'} CMS My Scripture`}
      onClick={() => onToggle(source, scripture)}
    >
      {saved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
      {saved ? 'Remove from My Scripture' : 'Add to My Scripture'}
    </button>
  )
}

function CmsScripturePanel({ scripture, source, state, onToggle, primary = false }: {
  scripture: CmsScripture
  source: CmsSourceKind
  state: CmsLabState
  onToggle: (source: CmsSourceKind, scripture: CmsScripture) => void
  primary?: boolean
}) {
  const presentation = presentCmsScripture(scripture)
  return (
    <section className="scripture-panel lab-scripture cms-scripture" aria-label={primary ? 'Primary Scripture' : 'Scripture focus'}>
      <span className="section-label">{primary ? 'Primary Scripture' : 'Scripture focus'} · {scripture.translation}</span>
      {presentation.status === 'provided' ? (
        <blockquote className="scripture-block"><p>{presentation.passage}</p><cite>{scripture.reference} · {scripture.translation}</cite></blockquote>
      ) : (
        <div className="cms-reference-only"><BookOpen size={20} aria-hidden="true" /><div><strong>{scripture.reference}</strong><p>Reference only · No passage text supplied{scripture.translation === 'Not configured' ? ' · Translation not configured' : ''}</p></div></div>
      )}
      <div className="lab-scripture__actions">
        <CmsScriptureSaveButton scripture={scripture} source={source} state={state} onToggle={onToggle} />
        <small>{scripture.practiceStatus === 'configured'
          ? 'Practice configured in Sanity · CMS memorization practice is not available in this view'
          : 'Memorization practice not configured'}</small>
      </div>
    </section>
  )
}

function CmsOptionalStudy({ block, source, state, onToggle }: {
  block: Extract<CmsBlock, { type: 'optionalExploration' }>
  source: CmsSourceKind
  state: CmsLabState
  onToggle: (source: CmsSourceKind, scripture: CmsScripture) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const contentId = `${block.id}-cms-content`
  return (
    <section className="lab-optional">
      <button type="button" className="lab-optional__toggle" aria-expanded={expanded} aria-controls={contentId} onClick={() => setExpanded(value => !value)}>
        <span><small>Optional deeper study · Not required</small><strong>{block.title}</strong></span>
        <ChevronDown size={18} aria-hidden="true" />
      </button>
      <div id={contentId} className="lab-optional__content" hidden={!expanded}>
        <CmsPortableTextView value={block.body} />
        {block.scriptures.map(scripture => (
          <CmsScripturePanel key={scripture.id} scripture={scripture} source={source} state={state} onToggle={onToggle} />
        ))}
      </div>
    </section>
  )
}

function CmsReflection({ block }: { block: Extract<CmsBlock, { type: 'reflectionChoice' }> }) {
  const [selected, setSelected] = useState('')
  const choice = block.choices.find(item => item.id === selected)
  return (
    <section className="lab-reflection" aria-labelledby={`${block.id}-question`}>
      <span className="section-label">Optional reflection · No answer required</span>
      <h3 id={`${block.id}-question`}>{block.question}</h3>
      <div className="lab-reflection__choices">
        {block.choices.map(item => <button key={item.id} type="button" aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}>{item.label}</button>)}
      </div>
      {choice && <div className="lab-reflection__prompt" role="status" aria-live="polite"><p>{choice.prompt}</p></div>}
      {block.closing && <p className="lab-reflection__closing">{block.closing}</p>}
    </section>
  )
}

function CmsSequence({ block }: { block: Extract<CmsBlock, { type: 'connectedSequence' }> }) {
  return (
    <section className={`lab-sequence ${block.cycle ? 'lab-sequence--cycle' : ''}`} aria-label="Connected teaching sequence">
      <ol>
        {block.steps.map((step, index) => (
          <li key={step.id}>
            <article><span>{String(index + 1).padStart(2, '0')}</span><h3>{step.title}</h3><p>{step.body}</p></article>
            {index < block.steps.length - 1 && <ArrowRight className="lab-sequence__arrow-desktop" size={20} aria-hidden="true" />}
            {index < block.steps.length - 1 && <ArrowDown className="lab-sequence__arrow-mobile" size={20} aria-hidden="true" />}
          </li>
        ))}
      </ol>
      {block.cycle && block.returnCaption && <div className="lab-sequence__return"><RotateCcw size={18} aria-hidden="true" /><span>{block.returnCaption}</span></div>}
      {block.conclusion && <p className="lab-sequence__conclusion">{block.conclusion}</p>}
    </section>
  )
}

function CmsBlockView({ block, source, state, onToggle }: {
  block: CmsBlock
  source: CmsSourceKind
  state: CmsLabState
  onToggle: (source: CmsSourceKind, scripture: CmsScripture) => void
}) {
  switch (block.type) {
    case 'scripture':
      return <CmsScripturePanel scripture={block.scripture} source={source} state={state} onToggle={onToggle} />
    case 'teachingText':
      return <section className="lab-teaching-text"><CmsPortableTextView value={block.body} /></section>
    case 'statement':
      return <section className="lab-statement">{block.label && <span className="section-label">{block.label}</span>}<p>{block.text}</p></section>
    case 'contrast':
      return <section className="lab-contrast"><div>{[block.left, block.right].map(side => <article key={side.title}><h3>{side.title}</h3><CmsPortableTextView value={side.body} /></article>)}</div>{block.footer && <p>{block.footer}</p>}</section>
    case 'visualCards':
      return <section className="lab-visual-cards"><div>{block.cards.map(card => <article key={card.id}><h3>{card.title}</h3>{card.body && <p>{card.body}</p>}</article>)}</div></section>
    case 'connectedSequence':
      return <CmsSequence block={block} />
    case 'reflectionChoice':
      return <CmsReflection block={block} />
    case 'optionalExploration':
      return <CmsOptionalStudy block={block} source={source} state={state} onToggle={onToggle} />
    case 'prayer':
      return <section className="prayer-section lab-prayer" aria-labelledby={`${block.id}-title`}><span className="section-label" id={`${block.id}-title`}>Prayer</span>{block.paragraphs.map((paragraph, index) => <p key={`${block.id}-${index}`}>{paragraph}</p>)}</section>
  }
}

function CmsCompanionLinks({ links }: { links: CmsCompanionLink[] }) {
  if (links.length === 0) return null
  return (
    <section className="lab-related-list" aria-labelledby="cms-companion-links">
      <span className="section-label" id="cms-companion-links">Companion links · Optional · Not required</span>
      {links.map(link => <article className="lab-related-resource" key={link.id}>
        <ExternalLink size={19} aria-hidden="true" />
        <div><h3>{link.label}</h3>{link.description && <p>{link.description}</p>}{link.url && <a href={link.url} target="_blank" rel="noreferrer noopener">Open {link.provider} resource <ExternalLink size={13} aria-hidden="true" /></a>}{link.availability && <small>{link.availability}</small>}</div>
      </article>)}
    </section>
  )
}

function CmsChallengeHome({ challenges, source, state, onOpen, onOpenScripture, onToggleSaved }: {
  challenges: CmsChallenge[]
  source: CmsSourceKind
  state: CmsLabState
  onOpen: (challenge: CmsChallenge) => void
  onOpenScripture: () => void
  onToggleSaved: (key: string) => void
}) {
  return (
    <>
      <section className="lab-challenge-list" aria-label="Sanity CMS Challenges">
        {challenges.map(challenge => {
          const key = cmsChallengeKey(source, challenge)
          const position = resolveCmsScreenIndex(challenge, state.positions[key])
          const completed = state.completedChallengeIds.includes(key)
          const saved = state.savedChallengeIds.includes(key)
          return <article key={key} className="lab-challenge-row">
            <button type="button" className="lab-challenge-row__open" onClick={() => onOpen(challenge)}>
              <span className="lab-challenge-row__date">{formatCmsReleaseDate(challenge.releaseAtUtc)}</span>
              <span><small>{challenge.series.title} · Sequence {challenge.sequence} · {challenge.screens.length} screens</small><strong>{challenge.title}</strong><em>{completed ? 'Completed · Revisit any screen' : position > 0 ? `Resume at ${position + 1} of ${challenge.screens.length}` : 'Begin Challenge'}</em></span>
              <ArrowRight size={19} aria-hidden="true" />
            </button>
            <button type="button" className="lab-challenge-row__save" aria-pressed={saved} aria-label={`${saved ? 'Remove' : 'Save'} ${challenge.title} ${saved ? 'from' : 'to'} CMS Saved Challenges`} onClick={() => onToggleSaved(key)}>
              {saved ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}<span>{saved ? 'Saved' : 'Save'}</span>
            </button>
          </article>
        })}
      </section>
      <section className="lab-library-link" aria-labelledby="cms-library-heading">
        <div><Library size={21} aria-hidden="true" /><span><h2 id="cms-library-heading">CMS My Scripture</h2><p>{state.scripture.length} saved {state.scripture.length === 1 ? 'reference' : 'references'} · Passage text not retained · Separate from Local Prototype</p></span></div>
        <button type="button" className="button button--secondary" onClick={onOpenScripture}>Open CMS My Scripture <ArrowRight size={16} /></button>
      </section>
      <p className="local-note"><BookOpen size={17} />CMS positions, completion, saved Challenges, and Scripture use only <code>bibleberry-sanity-challenge-lab-v1</code>. Live and fixture identities remain source-qualified.</p>
    </>
  )
}

function CmsScriptureLibrary({ state, onBack, onRemove }: {
  state: CmsLabState
  onBack: () => void
  onRemove: (key: string) => void
}) {
  return (
    <section className="lab-scripture-library" aria-labelledby="cms-scripture-title">
      <button type="button" className="back-link" onClick={onBack}><ArrowLeft size={17} /> Back to Sanity CMS</button>
      <header className="page-intro"><p className="eyebrow">CMS TEST COLLECTION</p><h1 id="cms-scripture-title">My Scripture</h1><p>Saved CMS references, isolated from the Local Prototype and ordinary reader. Passage text is not retained in this library. CMS memorization practice is not available in this view.</p></header>
      {state.scripture.length === 0 ? <div className="empty-state"><BookOpen /><h2>No CMS Scripture saved yet</h2><p>Use “Add to My Scripture” beside a CMS primary passage, Scripture block, or optional deeper study.</p></div> : (
        <div className="lab-saved-scripture-list">
          {state.scripture.map(entry => (
            <article key={entry.key} className="lab-saved-scripture">
              <div className="lab-saved-scripture__heading"><div><h2>{entry.reference}</h2><p>{entry.translation === 'Not configured' ? 'Translation not configured' : entry.translation}</p></div><BookOpen size={20} aria-hidden="true" /></div>
              <span className="cms-source-badge">{entry.source === 'live' ? 'Live Published Sanity' : 'Development Fixture Preview'}</span>
              <p className="lab-availability">Reference only · Passage text is not stored or shown in this library · CMS memorization practice unavailable in this view</p>
              <div className="lab-saved-scripture__actions"><button type="button" className="button button--text danger-link" onClick={() => onRemove(entry.key)}><Trash2 size={16} /> Remove from CMS My Scripture</button></div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function CmsModeSelector({ source, onChange }: { source: CmsSourceKind; onChange: (source: CmsSourceKind) => void }) {
  return (
    <section className="cms-mode-selector" aria-labelledby="cms-mode-heading">
      <div><span className="section-label" id="cms-mode-heading">Sanity CMS content mode</span><p>Live results and simulated fixture content are never substituted for one another.</p></div>
      <div className="cms-mode-selector__buttons" role="group" aria-label="Sanity CMS content mode">
        <button type="button" aria-pressed={source === 'live'} className={source === 'live' ? 'is-current' : ''} onClick={() => onChange('live')}><Cloud size={16} aria-hidden="true" /> Live Published Sanity</button>
        <button type="button" aria-pressed={source === 'fixture'} className={source === 'fixture' ? 'is-current' : ''} onClick={() => onChange('fixture')}><FlaskConical size={16} aria-hidden="true" /> Development Fixture Preview</button>
      </div>
    </section>
  )
}

function CmsCatalogStatus({ catalog, onRetry }: { catalog: CmsCatalogResult | { status: 'loading' }; onRetry: () => void }) {
  if (catalog.status === 'loading') return <div className="cms-catalog-state" role="status" aria-live="polite"><Cloud size={24} aria-hidden="true" /><h2>Loading published Challenges…</h2><p>Reading Sanity’s published perspective and validating the response.</p></div>
  if (catalog.status === 'empty') return <div className="cms-catalog-state" role="status"><BookOpen size={24} aria-hidden="true" /><h2>No published Challenges</h2><p>The live Sanity request succeeded and returned no published Challenge documents. No development fixture has been inserted.</p><button type="button" className="button button--secondary" onClick={onRetry}><RotateCcw size={16} /> Retry live request</button></div>
  if (catalog.status === 'requestError') return <div className="cms-catalog-state cms-catalog-state--error" role="alert"><Cloud size={24} aria-hidden="true" /><h2>Published Challenges could not be loaded</h2><p>{catalog.message} Check the network or Sanity availability, then retry.</p><button type="button" className="button button--secondary" onClick={onRetry}><RotateCcw size={16} /> Retry live request</button></div>
  if (catalog.status === 'validationError') return <div className="cms-catalog-state cms-catalog-state--error" role="alert"><BookOpen size={24} aria-hidden="true" /><h2>Sanity returned invalid Challenge content</h2><p>No partial catalog was displayed. Correct the source document through the separately authorized editorial workflow, then retry.</p><ul>{catalog.failures.map((failure, index) => <li key={`${failure.documentId ?? 'unknown'}-${index}`}><strong>{failure.documentId ?? 'Unknown document'}</strong>{failure.issues.map((issue, issueIndex) => <span key={`${issue.path}-${issueIndex}`}>{issue.path}: {issue.message}</span>)}</li>)}</ul><button type="button" className="button button--secondary" onClick={onRetry}><RotateCcw size={16} /> Retry validation</button></div>
  return null
}

export function SanityChallengeLab({ onReturnToStudio }: { onReturnToStudio: () => void }) {
  const [source, setSource] = useState<CmsSourceKind>('live')
  const [catalog, setCatalog] = useState<CmsCatalogResult | { status: 'loading' }>({ status: 'loading' })
  const [retryToken, setRetryToken] = useState(0)
  const [state, setState] = useState<CmsLabState>(() => typeof window === 'undefined' ? emptyCmsLabState() : readCmsLabState(window.localStorage))
  const [view, setView] = useState<'home' | 'challenge' | 'scripture'>('home')
  const [selectedKey, setSelectedKey] = useState('')
  const screenHeading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') writeCmsLabState(window.localStorage, state)
  }, [state])

  useEffect(() => {
    if (source !== 'live') return
    const controller = new AbortController()
    let active = true
    loadPublishedChallengeCatalog({ signal: controller.signal }).then(result => {
      if (active) setCatalog(result)
    })
    return () => {
      active = false
      controller.abort()
    }
  }, [source, retryToken])

  const challenges = source === 'fixture'
    ? developmentChallenges
    : catalog.status === 'ready' ? catalog.challenges : []
  const challenge = challenges.find(item => cmsChallengeKey(source, item) === selectedKey)
  const currentIndex = challenge ? resolveCmsScreenIndex(challenge, state.positions[selectedKey]) : 0
  const screen = challenge?.screens[currentIndex]
  const completed = challenge ? state.completedChallengeIds.includes(selectedKey) : false
  const challengeSaved = challenge ? state.savedChallengeIds.includes(selectedKey) : false

  useEffect(() => {
    if (view !== 'challenge' || !screen) return
    window.scrollTo({ top: 0, behavior: 'instant' })
    screenHeading.current?.focus({ preventScroll: true })
  }, [view, selectedKey, currentIndex, screen])

  const changeSource = (nextSource: CmsSourceKind) => {
    if (nextSource === source) return
    if (nextSource === 'live') setCatalog({ status: 'loading' })
    setSource(nextSource)
    setSelectedKey('')
    setView('home')
  }
  const retryLiveCatalog = () => {
    setCatalog({ status: 'loading' })
    setRetryToken(value => value + 1)
  }
  const openChallenge = (target: CmsChallenge) => {
    setSelectedKey(cmsChallengeKey(source, target))
    setView('challenge')
  }
  const toggleScripture = (scriptureSource: CmsSourceKind, scripture: CmsScripture) => {
    setState(previous => ({ ...previous, scripture: toggleCmsScripture(previous.scripture, scriptureSource, scripture) }))
  }
  const toggleSavedChallenge = (key: string) => {
    setState(previous => ({ ...previous, savedChallengeIds: toggleCmsSavedChallenge(previous.savedChallengeIds, key) }))
  }
  const removeScripture = (key: string) => {
    setState(previous => ({ ...previous, scripture: previous.scripture.filter(entry => entry.key !== key) }))
  }
  const goToScreen = (index: number) => {
    if (!challenge) return
    const bounded = Math.max(0, Math.min(index, challenge.screens.length - 1))
    const screenId = challenge.screens[bounded].id
    setState(previous => ({ ...previous, positions: { ...previous.positions, [selectedKey]: screenId } }))
  }
  const completeChallenge = () => {
    if (!challenge || currentIndex !== challenge.screens.length - 1) return
    setState(previous => ({
      ...previous,
      completedChallengeIds: previous.completedChallengeIds.includes(selectedKey)
        ? previous.completedChallengeIds
        : [...previous.completedChallengeIds, selectedKey],
    }))
  }

  return (
    <div className="standard-page interactive-challenge-lab sanity-challenge-lab">
      <div className="lab-topbar">
        <button type="button" className="back-link" onClick={onReturnToStudio}><ArrowLeft size={17} /> Return to Developer Studio</button>
        {view !== 'home' && <button type="button" className="back-link" onClick={() => setView('home')}><Library size={16} /> Sanity CMS home</button>}
      </div>

      {view === 'scripture' && <CmsScriptureLibrary state={state} onBack={() => setView('home')} onRemove={removeScripture} />}

      {view === 'home' && <>
        <header className="page-intro lab-home-intro"><p className="eyebrow">SANITY CMS · DEVELOPER STUDIO</p><h1>CMS Challenge preview.</h1><p>Inspect actual published Sanity results or a clearly labeled local structural fixture. CMS state is isolated from the working Local Prototype.</p></header>
        <CmsModeSelector source={source} onChange={changeSource} />
        {source === 'fixture' ? <>
          <div className="cms-fixture-banner" role="note"><FlaskConical size={20} aria-hidden="true" /><div><strong>Development Fixture Preview</strong><p>Simulated local structural content — not live Sanity data and not Alexis-approved teaching.</p></div></div>
          <CmsChallengeHome challenges={developmentChallenges} source="fixture" state={state} onOpen={openChallenge} onOpenScripture={() => setView('scripture')} onToggleSaved={toggleSavedChallenge} />
        </> : <>
          <div className="cms-live-label"><Cloud size={16} aria-hidden="true" /><span>Live Published Sanity · Read-only · Published perspective</span>{catalog.status === 'ready' && <button type="button" className="button button--text" onClick={retryLiveCatalog}><RotateCcw size={14} /> Refresh</button>}</div>
          {catalog.status === 'ready'
            ? <CmsChallengeHome challenges={catalog.challenges} source="live" state={state} onOpen={openChallenge} onOpenScripture={() => setView('scripture')} onToggleSaved={toggleSavedChallenge} />
            : <CmsCatalogStatus catalog={catalog} onRetry={retryLiveCatalog} />}
        </>}
      </>}

      {view === 'challenge' && challenge && screen && <>
        <div className={`cms-source-badge ${source === 'fixture' ? 'cms-source-badge--fixture' : ''}`}>{source === 'live' ? <Cloud size={14} aria-hidden="true" /> : <FlaskConical size={14} aria-hidden="true" />}{source === 'live' ? 'Live Published Sanity' : 'Development Fixture Preview · Simulated content'}</div>
        <header className="lab-challenge-header">
          <div><p className="eyebrow">{challenge.series.title} · SEQUENCE {challenge.sequence} · RELEASE {challenge.releaseAtUtc}</p><h1>{challenge.title}</h1>{challenge.summary && <p className="cms-challenge-summary">{challenge.summary}</p>}</div>
          <button type="button" className="button button--secondary lab-save-challenge" aria-pressed={challengeSaved} onClick={() => toggleSavedChallenge(selectedKey)}>{challengeSaved ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}{challengeSaved ? 'Remove Saved Challenge' : 'Save Challenge'}</button>
        </header>
        <CmsScripturePanel scripture={challenge.primaryScripture} source={source} state={state} onToggle={toggleScripture} primary />
        <div className="lab-progress">
          <div><span>Required screens</span><strong>{currentIndex + 1} of {challenge.screens.length}</strong></div>
          <div className="lab-progress__segments" role="progressbar" aria-label="CMS required Challenge screen position" aria-valuemin={1} aria-valuemax={challenge.screens.length} aria-valuenow={currentIndex + 1} aria-valuetext={`${currentIndex + 1} of ${challenge.screens.length}`}>{challenge.screens.map(item => <span key={item.id} className={item.id === screen.id || challenge.screens.findIndex(candidate => candidate.id === item.id) < currentIndex ? 'is-filled' : ''} />)}</div>
        </div>
        <article className="lab-screen" key={screen.id} aria-labelledby={`${screen.id}-title`}>
          <p className="eyebrow">{screen.stepLabel}</p><h2 id={`${screen.id}-title`} ref={screenHeading} tabIndex={-1}>{screen.title}</h2>
          <div className="lab-screen__blocks">{screen.blocks.map(block => <CmsBlockView key={block.id} block={block} source={source} state={state} onToggle={toggleScripture} />)}</div>
        </article>
        {completed && currentIndex === challenge.screens.length - 1 && <section className="lab-completion" role="status" aria-live="polite"><Check size={22} aria-hidden="true" /><div><h2>Challenge complete</h2><p>You explicitly completed the required screens. Optional content remains available to revisit.</p></div></section>}
        <nav className="lab-screen-nav" aria-label="CMS Challenge screen navigation">
          <button type="button" className="button button--secondary" disabled={currentIndex === 0} onClick={() => goToScreen(currentIndex - 1)}><ArrowLeft size={17} /> Back</button>
          {currentIndex < challenge.screens.length - 1
            ? <button type="button" className="button button--primary" onClick={() => goToScreen(currentIndex + 1)}>Continue <ArrowRight size={17} /></button>
            : <button type="button" className="button button--primary" disabled={completed} onClick={completeChallenge}>{completed && <Check size={17} />}{completed ? 'Challenge complete' : 'Complete Challenge'}</button>}
        </nav>
        <p className="lab-navigation-note">Optional studies, reflection choices, and companion links never change required progress. Revisiting does not automatically complete a Challenge.</p>
        <CmsCompanionLinks links={challenge.companionLinks} />
      </>}
    </div>
  )
}
