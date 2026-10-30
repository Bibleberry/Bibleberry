import { useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, Download, ExternalLink, Eye, Library, RotateCcw } from 'lucide-react'
import {
  entryTypeLabel,
  type ChallengeEntry,
  type DisciplineResource,
  type GuidedDisciplineEntry,
  type MemorizationEntry,
  type WorksheetEntry,
} from '../data/formation'

function shortEntryDate(entry: ChallengeEntry) {
  const date = new Date(`${entry.date}T12:00:00`)
  return new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric', year: 'numeric' }).format(date)
}

function FormationSequenceNav({ previous, next, onNavigate }: {
  previous?: ChallengeEntry
  next?: ChallengeEntry
  onNavigate: (entry: ChallengeEntry) => void
}) {
  if (!previous && !next) return null
  return (
    <nav className="teaching-sequence" aria-label="Adjacent entries in this Weekly Rhythm Pilot">
      {previous ? <button className="teaching-sequence__previous" onClick={() => onNavigate(previous)}><ArrowLeft size={17} /><span><small>Previous · {shortEntryDate(previous)}</small><strong>{previous.title}</strong></span></button> : <span />}
      {next && <button className="teaching-sequence__next" onClick={() => onNavigate(next)}><span><small>Next · {shortEntryDate(next)}</small><strong>{next.title}</strong></span><ArrowRight size={17} /></button>}
    </nav>
  )
}

function FormationHeader({ entry, children }: { entry: ChallengeEntry; children: React.ReactNode }) {
  return (
    <div className="teaching__grid">
      <aside className="teaching__meta">
        <p className="eyebrow">{entryTypeLabel(entry.entryType)}</p>
        <time dateTime={entry.date}>{entry.displayDate}</time>
        <div className="meta-rule" />
        <p className="series-name">{entry.series}</p>
      </aside>
      <div className="teaching__body">{children}</div>
    </div>
  )
}

function GuidedDisciplineView({ entry, onOpenDiscipline, onLeave }: {
  entry: GuidedDisciplineEntry
  onOpenDiscipline: (id: string) => void
  onLeave: () => void
}) {
  const { content } = entry
  return (
    <>
      <h1>{entry.title}</h1>
      <p className="formation-discipline-name">{content.disciplineName}</p>
      <section className="formation-purpose" aria-labelledby={`purpose-${entry.id}`}>
        <span className="section-label" id={`purpose-${entry.id}`}>Purpose</span>
        <p>{content.purpose}</p>
      </section>
      <section className="formation-context" aria-labelledby={`context-${entry.id}`}>
        <span className="section-label" id={`context-${entry.id}`}>Biblical grounding</span>
        <p>{content.biblicalContext}</p>
        {content.scriptureReference && <p className="formation-reference"><BookOpen size={16} /> Suggested reading: {content.scriptureReference}</p>}
      </section>
      <section className="guided-steps" aria-labelledby={`steps-${entry.id}`}>
        <span className="section-label" id={`steps-${entry.id}`}>Guided practice</span>
        <ol>
          {content.steps.map((step, index) => <li key={step.id}>
            <span className="guided-step__number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            <div><h2>{step.title}</h2><p>{step.instruction}</p></div>
          </li>)}
        </ol>
      </section>
      {content.journalPrompt && <aside className="teaching-reflection">
        <span className="section-label">Optional journal prompt</span>
        <p>{content.journalPrompt}</p>
      </aside>}
      {content.closingPrompt && <aside className="prayer-section">
        <span className="section-label">Optional closing reflection or prayer</span>
        <p>{content.closingPrompt}</p>
      </aside>}
      <div className="formation-actions">
        {content.disciplineId && <button className="button button--primary" onClick={() => onOpenDiscipline(content.disciplineId!)}><Library size={17} /> Learn more about this discipline</button>}
        <button className="button button--text" onClick={onLeave}>Leave practice & browse Archive</button>
      </div>
      <p className="formation-gentle-note">Pause, leave, or revisit at any point. Opening this practice does not mark it complete, and nothing about your participation is scored.</p>
    </>
  )
}

function WorksheetView({ entry }: { entry: WorksheetEntry }) {
  const { content } = entry
  return (
    <>
      <h1>{entry.title}</h1>
      <p className="teaching__intro">{content.summary}</p>
      <section className="worksheet-connection" aria-labelledby={`connection-${entry.id}`}>
        <span className="section-label" id={`connection-${entry.id}`}>This week’s teaching</span>
        <p>{content.teachingConnection}</p>
      </section>
      {content.thumbnailPath && <figure className="worksheet-preview">
        <img src={content.thumbnailPath} alt={content.thumbnailAlt ?? 'Worksheet page preview'} loading="lazy" decoding="async" />
        <figcaption>Full-page worksheet preview. The same prompts also appear below.</figcaption>
      </figure>}
      <section className="worksheet-download" aria-labelledby={`download-${entry.id}`}>
        <div><span className="section-label" id={`download-${entry.id}`}>{content.worksheetTitle}</span><p>Use the printable page, or open a physical journal and respond to the prompts below. The app does not ask for or store your reflections.</p></div>
        {content.pdfPath && <div className="worksheet-download__actions">
          <a className="button button--primary" href={content.pdfPath} download={content.pdfFileName ?? true}><Download size={17} /> Download PDF</a>
          <a className="button button--secondary" href={content.pdfPath} target="_blank" rel="noreferrer">View PDF <ExternalLink size={16} /></a>
        </div>}
      </section>
      {content.prompts.length > 0 && <section className="worksheet-prompts" aria-labelledby={`prompts-${entry.id}`}>
        <span className="section-label" id={`prompts-${entry.id}`}>Journal prompts · On screen</span>
        <ol>{content.prompts.map((prompt, index) => <li key={prompt}><span>{String(index + 1).padStart(2, '0')}</span><p>{prompt}</p></li>)}</ol>
      </section>}
      <p className="formation-gentle-note">A notebook and pen are enough. You can use one prompt, several, or none; downloading and printing are always optional.</p>
    </>
  )
}

export function MemorizationTool({ entry }: { entry: MemorizationEntry }) {
  const { content } = entry
  const [revealedCount, setRevealedCount] = useState(0)
  const [announcement, setAnnouncement] = useState('All phrases are concealed.')
  const total = content.segments.length

  const revealNext = () => {
    setRevealedCount(previous => {
      const next = Math.min(previous + 1, total)
      setAnnouncement(next === total ? 'The full passage is revealed.' : `Phrase ${next} of ${total} revealed.`)
      return next
    })
  }
  const revealAll = () => {
    setRevealedCount(total)
    setAnnouncement('The full passage is revealed.')
  }
  const reset = () => {
    setRevealedCount(0)
    setAnnouncement('All phrases are concealed. Start again whenever you are ready.')
  }

  return (
    <>
      <h1>{entry.title}</h1>
      <section className="memorization-source" aria-labelledby={`source-${entry.id}`}>
        <span className="section-label" id={`source-${entry.id}`}>Scripture to remember</span>
        <p className="memorization-reference">{content.reference}</p>
        <p>{content.translation}</p>
        {content.sourceUrl && <a className="text-link" href={content.sourceUrl} target="_blank" rel="noreferrer">Translation source <ExternalLink size={14} /></a>}
      </section>
      <section className="memorization-tool" aria-labelledby={`practice-${entry.id}`}>
        <span className="section-label" id={`practice-${entry.id}`}>Reveal mode</span>
        {content.instructions && <p className="memorization-instructions">{content.instructions}</p>}
        <ol className="memorization-phrases" aria-label={`${content.reference}, ordered phrases`}>
          {content.segments.map((segment, index) => {
            const revealed = index < revealedCount
            return <li key={`${index}-${segment}`} className={revealed ? 'is-revealed' : 'is-hidden'}>
              <span className="memorization-phrase__label">Phrase {index + 1} · {revealed ? 'Revealed' : 'Hidden'}</span>
              <p>{revealed ? segment : 'Concealed — reveal when you are ready.'}</p>
            </li>
          })}
        </ol>
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
        <div className="memorization-controls">
          <button className="button button--primary" onClick={revealNext} disabled={revealedCount >= total}><Eye size={17} /> Reveal next phrase</button>
          <button className="button button--secondary" onClick={revealAll} disabled={revealedCount >= total}>Reveal all</button>
          <button className="button button--text" onClick={reset} disabled={revealedCount === 0}><RotateCcw size={16} /> Start again</button>
        </div>
      </section>
      <p className="formation-gentle-note">There is no timer, quiz, score, or completion record. Repeat, conceal, or revisit the passage in whatever way serves your attention.</p>
    </>
  )
}

export function FormationExperienceView({ entry, previous, next, onNavigate, onOpenDiscipline, onLeave, onBack }: {
  entry: Exclude<ChallengeEntry, { entryType: 'teaching' }>
  previous?: ChallengeEntry
  next?: ChallengeEntry
  onNavigate: (entry: ChallengeEntry) => void
  onOpenDiscipline: (id: string) => void
  onLeave: () => void
  onBack?: () => void
}) {
  return (
    <article className="teaching formation-entry" id="daily-entry">
      {onBack && <button className="back-link teaching__back" onClick={onBack}><ArrowLeft size={17} /> Back to Archive</button>}
      <FormationHeader entry={entry}>
        {entry.entryType === 'guidedDiscipline' && <GuidedDisciplineView entry={entry} onOpenDiscipline={onOpenDiscipline} onLeave={onLeave} />}
        {entry.entryType === 'worksheet' && <WorksheetView entry={entry} />}
        {entry.entryType === 'memorization' && <MemorizationTool key={entry.id} entry={entry} />}
        <FormationSequenceNav previous={previous} next={next} onNavigate={onNavigate} />
      </FormationHeader>
    </article>
  )
}

export function DisciplineLibraryView({ resources, onOpen, onBack }: {
  resources: DisciplineResource[]
  onOpen: (id: string) => void
  onBack: () => void
}) {
  return (
    <div className="standard-page discipline-library">
      <button className="back-link" onClick={onBack}><ArrowLeft size={17} /> Back to Foundations</button>
      <header className="page-intro"><p className="eyebrow">SPIRITUAL DISCIPLINES LIBRARY</p><h1>Practices to explore, at your own pace.</h1><p>Evergreen resources for learning about a discipline and considering a practice. These are invitations, not assignments or measures of spiritual progress.</p></header>
      <div className="discipline-list">
        {resources.map(resource => <button key={resource.id} onClick={() => onOpen(resource.id)}>
          <span><small>Evergreen practice resource</small><strong>{resource.name}</strong><p>{resource.introduction}</p></span><ArrowRight size={20} />
        </button>)}
      </div>
    </div>
  )
}

export function DisciplineResourceView({ resource, relatedSessions, onBack, onOpenSession }: {
  resource: DisciplineResource
  relatedSessions: ChallengeEntry[]
  onBack: () => void
  onOpenSession: (id: string) => void
}) {
  return (
    <article className="reading-measure discipline-resource">
      <button className="back-link" onClick={onBack}><ArrowLeft size={17} /> Back to the Disciplines Library</button>
      <p className="eyebrow">SPIRITUAL DISCIPLINES LIBRARY</p>
      <h1>{resource.name}</h1>
      <p className="discipline-resource__intro">{resource.introduction}</p>
      <section className="discipline-foundations" aria-labelledby={`biblical-${resource.id}`}>
        <h2 id={`biblical-${resource.id}`}>Biblical foundations</h2>
        <dl>{resource.biblicalFoundations.map(item => <div key={item.reference}><dt>{item.reference}</dt><dd>{item.note}</dd></div>)}</dl>
      </section>
      <section className="discipline-teaching" aria-labelledby={`about-${resource.id}`}>
        <h2 id={`about-${resource.id}`}>About this practice</h2>
        <div className="longform">{resource.teaching.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</div>
      </section>
      <section className="discipline-guidance" aria-labelledby={`practice-${resource.id}`}>
        <h2 id={`practice-${resource.id}`}>General practice guidance</h2>
        <ol>{resource.practiceGuidance.map(item => <li key={item}>{item}</li>)}</ol>
      </section>
      {resource.prompts && resource.prompts.length > 0 && <aside className="teaching-reflection"><span className="section-label">Optional prompts</span>{resource.prompts.map(prompt => <p key={prompt}>{prompt}</p>)}</aside>}
      {relatedSessions.length > 0 && <section className="related-sessions" aria-labelledby={`related-${resource.id}`}>
        <h2 id={`related-${resource.id}`}>Related guided experiences</h2>
        {relatedSessions.map(session => <button key={session.id} onClick={() => onOpenSession(session.id)}><span><small>{session.displayDate}</small><strong>{session.title}</strong></span><ArrowRight size={18} /></button>)}
      </section>}
    </article>
  )
}
