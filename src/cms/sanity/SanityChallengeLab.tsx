import { useEffect, useState } from 'react'
import {
  ArrowLeft, ArrowRight, BookOpen, Bookmark, BookmarkCheck,
  Cloud, FlaskConical, Library, RotateCcw, Trash2,
} from 'lucide-react'
import { ChallengePlayer } from '../../components/challenge/ChallengePlayer.tsx'
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
import { formatCmsReleaseDate } from './presentation.ts'
import type { CmsChallenge, CmsScripture } from './types.ts'

const developmentChallenges = (() => {
  const result = mapPublishedChallenge(validChallengeFixture)
  if (!result.ok) throw new Error('The structural CMS development fixture is invalid.')
  return [result.challenge]
})()

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
  const completed = challenge ? state.completedChallengeIds.includes(selectedKey) : false
  const challengeSaved = challenge ? state.savedChallengeIds.includes(selectedKey) : false

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
  const isScriptureSaved = (scripture: CmsScripture) => state.scripture.some(entry => entry.key === cmsScriptureKey(source, scripture))
  const changeScreen = (screenId: string) => {
    if (!challenge || !challenge.screens.some(item => item.id === screenId)) return
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

      {view === 'challenge' && challenge && <>
        <div className={`cms-source-badge ${source === 'fixture' ? 'cms-source-badge--fixture' : ''}`}>{source === 'live' ? <Cloud size={14} aria-hidden="true" /> : <FlaskConical size={14} aria-hidden="true" />}{source === 'live' ? 'Live Published Sanity' : 'Development Fixture Preview · Simulated content'}</div>
        <ChallengePlayer
          key={selectedKey}
          challenge={challenge}
          screenId={state.positions[selectedKey]}
          isSaved={challengeSaved}
          isCompleted={completed}
          isScriptureSaved={isScriptureSaved}
          onScreenChange={changeScreen}
          onToggleSaveChallenge={() => toggleSavedChallenge(selectedKey)}
          onToggleSaveScripture={scripture => toggleScripture(source, scripture)}
          onComplete={completeChallenge}
          eyebrow={`${challenge.series.title} · SEQUENCE ${challenge.sequence} · RELEASE ${challenge.releaseAtUtc}`}
          diagnostics
          labels={{
            scriptureCollection: 'CMS My Scripture',
            progressHeading: 'Required screens',
            progress: 'CMS required Challenge screen position',
            navigation: 'CMS Challenge screen navigation',
          }}
        />
      </>}
    </div>
  )
}
