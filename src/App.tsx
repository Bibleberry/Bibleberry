import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft, ArrowRight, BookOpen, Check, ChevronRight, Clock3, ExternalLink,
  Headphones, Leaf, Library, MoreHorizontal, Play, RotateCcw, Settings2,
  Share2, Sun, Moon, Monitor, Trash2, X, Youtube, Bell, ShieldCheck, Wrench,
} from 'lucide-react'
import { archiveFixtures, foundations, media, novemberTeaching, type Foundation, type Teaching, type TeachingBlock } from './data/content'
import { sabbathFixtures } from './data/sabbathFixtures'
import { challenges } from './data/challenges'
import { announcements } from './data/announcements'
import { allFormationEntries, disciplineResources, onePhraseMemorizationEntry, weeklyPilotEntries } from './data/formationFixtures'
import { entryTypeLabel, WEEKLY_PILOT_CHALLENGE_ID, type ChallengeEntry, type TeachingEntry } from './data/formation'
import { DeveloperStudio } from './components/DeveloperStudio'
import type { OrdinaryChallengeSessionState } from './components/challenge/ordinaryChallengeHostModel'
import {
  formatChallengeOriginLabel,
  parseChallengeOrigin,
  parseChallengeOriginFromSearchParams,
  type ChallengeOrigin,
} from './cms/reader/challengeOrigin'
import { defaultGuestParticipationStore } from './participation/defaultGuestStore'
import './App.css'

const DisciplineLibraryView = lazy(() => import('./components/FormationViews').then(module => ({ default: module.DisciplineLibraryView })))
const DisciplineResourceView = lazy(() => import('./components/FormationViews').then(module => ({ default: module.DisciplineResourceView })))
const FormationExperienceView = lazy(() => import('./components/FormationViews').then(module => ({ default: module.FormationExperienceView })))
const formationViewFallback = <div className="standard-page"><p role="status" aria-live="polite">Loading reading tools…</p></div>

type PrimaryView = 'today' | 'foundations' | 'archive' | 'more'
type MoreSection = 'journey' | 'about' | 'podcast' | 'appearance' | 'reminder' | 'scripture' | 'privacy'
type Detail =
  | { type: 'foundation'; id: string }
  | { type: 'teaching'; id: string }
  | { type: 'formation'; id: string }
  | { type: 'disciplineLibrary' }
  | { type: 'discipline'; id: string }
  | { type: 'more'; section: MoreSection }
  | { type: 'developerStudio' }
  | { type: 'challengeLab' }
  | { type: 'challengePilot' }
  | { type: 'participationPilot' }
  | { type: 'releasedChallenge'; slug: string; origin: ChallengeOrigin }
  | { type: 'month'; yearMonth: string }
  | null
type Appearance = 'light' | 'dark' | 'system'
type TextSize = 'compact' | 'default' | 'large'
type Activity = { id: string; label: string; at: string }
type LastOpened = { entryId: string; challengeId: string; openedAt: string }
type PrototypeState = {
  onboarded: boolean
  appearance: Appearance
  textSize: TextSize
  reminderEnabled: boolean
  reminderTime: string
  explored: string[]
  journey: Activity[]
  lastOpened: LastOpened | null
  resumeDismissedDate: string
}

const STORAGE_KEY = 'bibleberry-prototype-v1'
const developerStudioEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEVELOPER_STUDIO === 'true'
const challengePilotEnabled = import.meta.env.VITE_ENABLE_CHALLENGE_PILOT === 'true'
const participationPilotEnabled = import.meta.env.VITE_ENABLE_PARTICIPATION_PILOT === 'true'
const InteractiveChallengeLab = developerStudioEnabled
  ? lazy(() => import('./components/InteractiveChallengeLab').then(module => ({ default: module.InteractiveChallengeLab })))
  : null
const OrdinaryChallengePilot = challengePilotEnabled
  ? lazy(() => import('./pilot/ordinaryChallengePilot').then(module => ({ default: module.OrdinaryChallengePilot })))
  : null
const OrdinaryChallengePilotEntryBar = challengePilotEnabled
  ? lazy(() => import('./pilot/ordinaryChallengePilot').then(module => ({ default: module.OrdinaryChallengePilotEntryBar })))
  : null
const ParticipationPilot = participationPilotEnabled
  ? lazy(() => import('./pilot/participationPilot').then(module => ({ default: module.ParticipationPilot })))
  : null
const ParticipationPilotEntryBar = participationPilotEnabled
  ? lazy(() => import('./pilot/participationPilot').then(module => ({ default: module.ParticipationPilotEntryBar })))
  : null
const releasedChallengeRouteEnabled = import.meta.env.VITE_ENABLE_RELEASED_CHALLENGE_ROUTE === 'true'
const monthScreenEnabled = import.meta.env.VITE_ENABLE_MONTH_SCREEN === 'true'
const ReleasedChallengeHost = releasedChallengeRouteEnabled || monthScreenEnabled
  ? lazy(() => import('./cms/reader/ReleasedChallengeHost').then(module => ({ default: module.ReleasedChallengeHost })))
  : null
const MonthScreenHost = monthScreenEnabled
  ? lazy(() => import('./components/month/MonthScreenHost').then(module => ({ default: module.MonthScreenHost })))
  : null
const MonthPreviewNewsBanner = monthScreenEnabled
  ? lazy(() => import('./components/month/MonthPreviewNewsBanner').then(module => ({ default: module.MonthPreviewNewsBanner })))
  : null
const MonthScreenEntryBar = monthScreenEnabled
  ? lazy(() => import('./components/month/MonthPreviewNewsBanner').then(module => ({ default: module.MonthScreenEntryBar })))
  : null
const initialState: PrototypeState = {
  onboarded: false,
  appearance: 'system',
  textSize: 'default',
  reminderEnabled: false,
  reminderTime: '08:00',
  explored: [],
  journey: [],
  lastOpened: null,
  resumeDismissedDate: '',
}

function loadState(): PrototypeState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? { ...initialState, ...JSON.parse(saved) } : initialState
  } catch {
    return initialState
  }
}

function localDateKey(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

const allTeachings: TeachingEntry[] = [novemberTeaching, ...sabbathFixtures, ...archiveFixtures]
  .map(teaching => ({ ...teaching, entryType: 'teaching' as const }))
  .sort((a, b) => b.date.localeCompare(a.date))
const ordinaryEntries: ChallengeEntry[] = allTeachings
const allEntries: ChallengeEntry[] = [...allTeachings, ...allFormationEntries]

function latestEntryThrough(dateKey: string, entries: ChallengeEntry[] = ordinaryEntries) {
  return entries.filter(entry => entry.date <= dateKey).sort((a, b) => b.date.localeCompare(a.date))[0] ?? null
}

function shortTeachingDate(entry: ChallengeEntry) {
  const date = new Date(`${entry.date}T12:00:00`)
  const includeYear = date.getFullYear() !== new Date().getFullYear()
  return new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric', ...(includeYear ? { year: 'numeric' } : {}) }).format(date)
}

function challengeEntries(entry: ChallengeEntry, availableThrough: string) {
  if (!entry.challengeId) return []
  const challenge = challenges.find(item => item.id === entry.challengeId)
  if (!challenge) return []
  return challenge.orderedEntryIds
    .map(id => allEntries.find(item => item.id === id))
    .filter((item): item is ChallengeEntry => Boolean(item && item.date <= availableThrough))
}

function entryNeighbors(entry: ChallengeEntry, availableThrough: string) {
  const entries = challengeEntries(entry, availableThrough)
  const index = entries.findIndex(item => item.id === entry.id)
  if (index < 0) return { previous: undefined, next: undefined }
  return { previous: entries[index - 1], next: entries[index + 1] }
}

const navItems: { id: PrimaryView; label: string; icon: typeof BookOpen }[] = [
  { id: 'today', label: 'Today', icon: BookOpen },
  { id: 'foundations', label: 'Foundations', icon: Leaf },
  { id: 'archive', label: 'Archive', icon: Library },
  { id: 'more', label: 'More', icon: MoreHorizontal },
]

function Botanical({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 124" fill="none" aria-hidden="true">
      <path d="M49 116C50 82 48 48 56 10M51 78C36 69 25 55 21 38C39 41 50 55 51 78ZM52 58C65 51 75 39 80 24C64 26 54 39 52 58ZM49 96C35 92 23 82 16 68C32 67 46 78 49 96ZM54 38C44 31 38 21 37 9C49 13 56 24 54 38Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M29 115H70" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`wordmark ${compact ? 'wordmark--compact' : ''}`}>
      <Botanical className="wordmark__botanical" />
      <div>
        <span className="wordmark__name">Bibleberry</span>
        {!compact && <span className="wordmark__note">A quiet place for Scripture</span>}
      </div>
    </div>
  )
}

function Onboarding({ state, update, finish }: {
  state: PrototypeState
  update: (patch: Partial<PrototypeState>) => void
  finish: (destination: 'today' | 'foundations') => void
}) {
  const [step, setStep] = useState(1)
  return (
    <main className="onboarding">
      <div className="onboarding__top"><Wordmark /></div>
      <div className="onboarding__layout">
        <aside className="onboarding__aside" aria-hidden="true">
          <span className="onboarding__verse">“Let the word of Christ dwell in you richly.”</span>
          <Botanical className="onboarding__plant" />
          <span className="onboarding__reference">Colossians 3:16</span>
        </aside>
        <section className="onboarding__content" aria-live="polite">
          <div className="step-indicator" aria-label={`Welcome step ${step} of 3`}>
            {[1, 2, 3].map(n => <span key={n} className={n === step ? 'is-current' : n < step ? 'is-past' : ''}>{n < step ? <Check size={12} /> : n}</span>)}
          </div>
          {step === 1 && <>
            <p className="eyebrow">WELCOME</p>
            <h1>A quiet place to<br />meet with Scripture.</h1>
            <p className="lede">Reflect on practical biblical teaching, and return to what God is forming in you.</p>
            <p>Come as you are. Read, listen, watch, or pray in the way that fits this season—and the time you have today.</p>
            <button className="button button--primary" onClick={() => setStep(2)}>Continue <ArrowRight size={18} /></button>
          </>}
          {step === 2 && <>
            <p className="eyebrow">A GENTLE DAILY RHYTHM</p>
            <h1>Nothing to catch up on.<br />No streak to protect.</h1>
            <p className="lede">A new Scripture Challenge offers a written teaching for each day. Some entries may also include a video, a Realigned podcast episode, or a prayer.</p>
            <p>Foundations gives you a place to begin, Today brings you back to the current teaching, and the Archive is always available when you want to explore.</p>
            <div className="button-stack">
              <button className="button button--primary" onClick={() => setStep(3)}>Find your starting place <ArrowRight size={18} /></button>
              <button className="button button--text" onClick={() => finish('today')}>Continue to Today</button>
            </div>
            <button className="back-link" onClick={() => setStep(1)}><ArrowLeft size={16} /> Back</button>
          </>}
          {step === 3 && <>
            <p className="eyebrow">OPTIONAL DAILY REMINDER</p>
            <h1>Make room for<br />a daily pause.</h1>
            <p className="lede">If a gentle reminder would help, choose a time that fits your rhythm. You can change or turn it off later.</p>
            <label className="time-field">
              <span>Suggested reminder time</span>
              <input type="time" value={state.reminderTime} onChange={e => update({ reminderTime: e.target.value })} />
            </label>
            <p className="fine-print">This browser saves your preference only. It does not schedule a native device notification.</p>
            <div className="button-stack">
              <button className="button button--primary" onClick={() => { update({ reminderEnabled: true }); finish('foundations') }}>Save reminder preference <Bell size={17} /></button>
              <button className="button button--text" onClick={() => { update({ reminderEnabled: false }); finish('foundations') }}>Not now</button>
            </div>
            <button className="back-link" onClick={() => setStep(2)}><ArrowLeft size={16} /> Back</button>
          </>}
        </section>
      </div>
    </main>
  )
}

function AppShell({ view, detail, navigate, children }: {
  view: PrimaryView
  detail: Detail
  navigate: (view: PrimaryView) => void
  children: React.ReactNode
}) {
  return (
    <div className="app-shell">
      <aside className="desktop-rail">
        <Wordmark />
        <nav aria-label="Primary navigation" className="desktop-nav">
          {navItems.map(item => <button key={item.id} className={view === item.id && !detail ? 'is-active' : ''} onClick={() => navigate(item.id)} aria-current={view === item.id && !detail ? 'page' : undefined}><item.icon size={19} strokeWidth={1.7} /><span>{item.label}</span></button>)}
        </nav>
        <div className="rail-note"><p>No account. No streaks.<br />Just a place to begin.</p></div>
      </aside>
      <div className="mobile-header"><Wordmark compact /></div>
      <div className="app-content">{children}</div>
      <nav className="bottom-nav" aria-label="Primary navigation">
        {navItems.map(item => <button key={item.id} className={view === item.id && !detail ? 'is-active' : ''} onClick={() => navigate(item.id)} aria-current={view === item.id && !detail ? 'page' : undefined}><item.icon size={21} strokeWidth={1.7} /><span>{item.label}</span></button>)}
      </nav>
    </div>
  )
}

function PageIntro({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return <header className="page-intro"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{body}</p></header>
}

function AnnouncementBar({ onInternalRoute, onAction, nowOverride }: {
  onInternalRoute: (route: string) => void
  onAction: (label: string) => void
  nowOverride?: number
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (nowOverride !== undefined) return
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [nowOverride])
  const effectiveNow = nowOverride ?? now
  const announcement = announcements.find(item => item.enabled && effectiveNow >= Date.parse(item.startAt) && effectiveNow < Date.parse(item.endAt))
  if (!announcement) return null
  return (
    <aside className="announcement-bar" aria-label="Announcement">
      <div>{announcement.title && <strong>{announcement.title}</strong>}<p>{announcement.body}</p></div>
      <div className="announcement-bar__links">
        {announcement.links.map(link => link.route
          ? <a key={link.label} href={link.route} onClick={event => { event.preventDefault(); onAction(`Opened announcement: ${link.label}`); onInternalRoute(link.route) }}>{link.label}<ArrowRight size={14} /></a>
          : <a key={link.label} href={link.url} target="_blank" rel="noreferrer" onClick={() => onAction(`Opened announcement: ${link.label}`)}>{link.label}<ExternalLink size={14} /></a>)}
      </div>
    </aside>
  )
}

function ResumeCard({ entry, next, todayEntryType, onOpen, onJump }: {
  entry: ChallengeEntry
  next?: ChallengeEntry
  todayEntryType?: ChallengeEntry['entryType']
  onOpen: (id: string) => void
  onJump: () => void
}) {
  return (
    <section className="resume-card" aria-labelledby="resume-card-title">
      <p className="eyebrow">PICK UP WHERE YOU LEFT OFF</p>
      <p>{entry.entryType === 'teaching' ? 'Your last reading was' : 'You last opened'} {shortTeachingDate(entry)}.</p>
      <h2 id="resume-card-title">{entry.title}</h2>
      <div className="resume-card__actions">
        <button className="button button--primary" onClick={() => onOpen(entry.id)}>Return to {shortTeachingDate(entry)}</button>
        {next && <button className="button button--secondary" onClick={() => onOpen(next.id)}>Continue with {shortTeachingDate(next)}</button>}
        <button className="button button--text" onClick={onJump}>Or jump to {todayEntryType === 'teaching' ? 'today’s reading' : 'today'}</button>
      </div>
    </section>
  )
}

function TeachingBlockView({ block }: { block: TeachingBlock }) {
  if (block.type === 'pullQuote') return <aside className="teaching-pull-quote"><span>{block.label ?? 'Excerpt'}</span><p>{block.text}</p></aside>
  if (block.type === 'image') return <figure className={`teaching-image teaching-image--${block.fit ?? 'contain'}`}>
    <div className="teaching-image__asset" style={{ aspectRatio: block.aspectRatio }}><img src={block.src} alt={block.alt} loading="lazy" decoding="async" /></div>
    {block.caption && <figcaption>{block.caption}</figcaption>}
  </figure>
  return block.emphasis ? <h2>{block.text}</h2> : <p>{block.text}</p>
}

function TeachingSequenceNav({ previous, next, onNavigate }: {
  previous?: ChallengeEntry
  next?: ChallengeEntry
  onNavigate: (entry: ChallengeEntry) => void
}) {
  if (!previous && !next) return null
  return (
    <nav className="teaching-sequence" aria-label="Adjacent readings in this Scripture Challenge">
      {previous ? <button className="teaching-sequence__previous" onClick={() => onNavigate(previous)}><ArrowLeft size={17} /><span><small>Previous · {shortTeachingDate(previous)}</small><strong>{previous.title}</strong></span></button> : <span />}
      {next && <button className="teaching-sequence__next" onClick={() => onNavigate(next)}><span><small>Next · {shortTeachingDate(next)}</small><strong>{next.title}</strong></span><ArrowRight size={17} /></button>}
    </nav>
  )
}

function TeachingView({ teaching, onBack, onShare, onMedia, previous, next, onNavigateTeaching, showMedia = false }: {
  teaching: Teaching
  onBack?: () => void
  onShare: () => void
  onMedia: (label: string) => void
  previous?: ChallengeEntry
  next?: ChallengeEntry
  onNavigateTeaching?: (entry: ChallengeEntry) => void
  showMedia?: boolean
}) {
  return (
    <article className="teaching" id="daily-teaching">
      {onBack && <button className="back-link teaching__back" onClick={onBack}><ArrowLeft size={17} /> Back to Archive</button>}
      <div className="teaching__grid">
        <aside className="teaching__meta">
          <p className="eyebrow">SCRIPTURE CHALLENGE</p>
          <time dateTime={teaching.date}>{teaching.displayDate}</time>
          <div className="meta-rule" />
          <p>{teaching.scripture}</p>
          {teaching.series && <p className="series-name">{teaching.series}</p>}
          {teaching.author && <p className="byline">Teaching by<br /><strong>{teaching.author}</strong></p>}
          <Botanical className="meta-botanical" />
        </aside>
        <div className="teaching__body">
          <h1>{teaching.title}</h1>
          {teaching.introduction && <p className="teaching__intro">{teaching.introduction}</p>}
          <section className="scripture-panel" aria-labelledby={`scripture-${teaching.id}`}>
            <span className="section-label" id={`scripture-${teaching.id}`}>Today’s Passage</span>
            <blockquote className="scripture-block">
              <p>{teaching.scriptureText}</p>
              <cite>{teaching.scripture}</cite>
            </blockquote>
          </section>
          <section className="teaching-exposition" aria-labelledby={`teaching-${teaching.id}`}>
            <span className="section-label" id={`teaching-${teaching.id}`}>{teaching.author ? `${teaching.author.split(' ')[0]}’s Teaching` : 'Teaching'}</span>
            <div className="longform">
              {teaching.body.slice(0, teaching.responseStart ?? teaching.body.length).map((block, index) => <TeachingBlockView key={index} block={block} />)}
            </div>
          </section>
          {teaching.reflection && <section className="teaching-reflection" aria-labelledby={`reflection-${teaching.id}`}>
            <span className="section-label" id={`reflection-${teaching.id}`}>Reflection Question</span>
            <p>{teaching.reflection}</p>
          </section>}
          {(teaching.responseStart !== undefined || teaching.response) && <section className="response-section" aria-labelledby={`response-${teaching.id}`}>
            <span className="section-label" id={`response-${teaching.id}`}>Response / Practice</span>
            <div className="longform">
              {teaching.response
                ? teaching.response.map((paragraph, index) => <p key={index}>{paragraph}</p>)
                : teaching.body.slice(teaching.responseStart ?? teaching.body.length).map((block, index) => <TeachingBlockView key={index} block={block} />)}
            </div>
          </section>}
          {teaching.prayer && <section className="prayer-section" aria-labelledby={`prayer-${teaching.id}`}>
            <span className="section-label" id={`prayer-${teaching.id}`}>Optional Prayer</span>
            <h2>Prayer</h2>
            {teaching.prayer.map((p, i) => <p key={i}>{p}</p>)}
          </section>}
          {teaching.truth && <aside className="truth-line" aria-labelledby={`truth-${teaching.id}`}>
            <span className="section-label" id={`truth-${teaching.id}`}>Today’s Truth</span>
            <p>{teaching.truth}</p>
          </aside>}
          {teaching.shortFormConcept && <aside className="short-form-concept" aria-labelledby={`concept-${teaching.id}`}>
            <span className="section-label" id={`concept-${teaching.id}`}>Short-form Video</span>
            <p>{teaching.shortFormConcept}</p>
          </aside>}
          {teaching.walkingReel && <section className="walking-copy">
            <span className="walking-copy__label">WALKING REEL · TEACHING TEXT</span>
            <p>{teaching.walkingReel}</p>
          </section>}
          <div className="teaching__actions">
            <button className="button button--secondary" onClick={onShare}><Share2 size={17} /> Share this teaching</button>
            {onBack && <button className="button button--text" onClick={onBack}>Return to Archive</button>}
          </div>
          {onNavigateTeaching && <TeachingSequenceNav previous={previous} next={next} onNavigate={onNavigateTeaching} />}
        </div>
      </div>
      {showMedia && <section className="media-fixtures" aria-labelledby="media-fixtures-title">
        <div className="section-heading"><div><p className="eyebrow">WATCH & LISTEN</p><h2 id="media-fixtures-title">Watch & listen</h2></div><p>Watch or listen here, or open these selections on their existing platforms.</p></div>
        <div className="media-grid">
          <YouTubeFixture item={media.youtube} reel={false} onAction={onMedia} />
          <YouTubeFixture item={media.walkingReel} reel onAction={onMedia} />
          <PodcastFixture onAction={onMedia} />
        </div>
      </section>}
    </article>
  )
}

function YouTubeFixture({ item, reel, onAction }: {
  item: { title: string; url: string; embed: string }
  reel: boolean
  onAction: (label: string) => void
}) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  return (
    <section className={`media-item ${reel ? 'media-item--reel' : ''}`}>
      <div className="media-item__heading"><Youtube size={20} /><div><span>{reel ? 'Walking Reel' : 'YouTube Short'}</span><h3>{item.title}</h3></div></div>
      <div className={`video-frame ${reel ? 'video-frame--vertical' : ''}`}>
        {!loaded && <div className="video-poster"><Play size={28} strokeWidth={1.4} /><p>{reel ? 'Vertical video component' : 'Embedded video component'}</p><button className="button button--small" onClick={() => { setLoaded(true); onAction(`Loaded YouTube: ${item.title}`) }}>Load YouTube player</button></div>}
        {loaded && !failed && <iframe src={item.embed} title={item.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen onError={() => setFailed(true)} />}
        {failed && <div className="video-poster"><p><strong>This embedded media is unavailable.</strong><br />You can still open it on YouTube.</p></div>}
      </div>
      <div className="media-item__links">
        <a href={item.url} target="_blank" rel="noreferrer" onClick={() => onAction(`Opened YouTube: ${item.title}`)}>Open in YouTube <ExternalLink size={15} /></a>
        {loaded && !failed && <button onClick={() => setLoaded(false)}>Close player <X size={15} /></button>}
      </div>
    </section>
  )
}

function PodcastFixture({ onAction, standalone = false }: { onAction: (label: string) => void; standalone?: boolean }) {
  const [playerFailed, setPlayerFailed] = useState(false)
  return (
    <section className={`media-item podcast-fixture ${standalone ? 'podcast-fixture--standalone' : ''}`}>
      <div className="media-item__heading"><Headphones size={21} /><div><span>Realigned podcast</span><h3>{media.podcast.title}</h3></div></div>
      <p>Realigned is Alexis Waid’s podcast. Listen here, or use one of the external podcast platforms.</p>
      <div className="simplecast-container">
        {!playerFailed ? <iframe
          className="simplecast-player"
          title={`Realigned podcast: ${media.podcast.title}`}
          src={media.podcast.embed}
          loading="lazy"
          scrolling="no"
          allow="autoplay; encrypted-media; picture-in-picture"
          onError={() => setPlayerFailed(true)}
        /> : <p className="simplecast-unavailable" role="status">The embedded player is unavailable in this browser. You can still listen on the Simplecast episode page.</p>}
      </div>
      <div className="podcast-links">
        <a href={media.podcast.episodePage} target="_blank" rel="noreferrer" onClick={() => onAction(`Opened Simplecast: ${media.podcast.title}`)}>Open in Simplecast <ExternalLink size={15} /></a>
        <a href={media.podcast.spotify} target="_blank" rel="noreferrer" onClick={() => onAction(`Opened Spotify: ${media.podcast.title}`)}>Open in Spotify <ExternalLink size={15} /></a>
        <a href={media.podcast.apple} target="_blank" rel="noreferrer" onClick={() => onAction(`Opened Apple Podcasts: ${media.podcast.title}`)}>Open in Apple Podcasts <ExternalLink size={15} /></a>
      </div>
    </section>
  )
}

function FoundationsView({ explored, openFoundation, openDisciplineLibrary }: { explored: string[]; openFoundation: (id: string) => void; openDisciplineLibrary: () => void }) {
  return (
    <div className="standard-page foundations-page">
      <PageIntro eyebrow="FOUNDATIONS" title="A Place to Begin" body="These short readings introduce the heart and rhythm of the app. Follow the suggested order, or open whatever speaks to where you are today." />
      <div className="quiet-note"><Leaf size={18} /><p>Opening something simply marks it as <strong>Previously explored</strong>. There are no assignments to finish and no progress percentage to maintain.</p></div>
      <div className="foundation-list">
        {foundations.map(item => <button className="foundation-row" key={item.id} onClick={() => openFoundation(item.id)}>
          <span className="foundation-row__number">{String(item.order).padStart(2, '0')}</span>
          <span className="foundation-row__content"><span className="foundation-row__kind">{item.kind === 'prayer' ? 'Optional prayer' : item.readingTime}</span><strong>{item.title}</strong>{explored.includes(item.id) && <span className="explored"><Check size={13} /> Previously explored</span>}</span>
          <ChevronRight size={20} />
        </button>)}
      </div>
      <button className="button button--primary foundations-begin" onClick={() => openFoundation(foundations[0].id)}>Begin with the first reading <ArrowRight size={18} /></button>
      <section className="settings-group" aria-labelledby="discipline-library-link">
        <p className="eyebrow">PRACTICE RESOURCES</p>
        <h2 id="discipline-library-link">Spiritual Disciplines Library</h2>
        <p>Explore evergreen introductions, biblical foundations, and general guidance for prayer, solitude, and Sabbath & rest.</p>
        <button className="button button--secondary" onClick={openDisciplineLibrary}><Library size={17} /> Browse the library</button>
      </section>
    </div>
  )
}

function FoundationReading({ item, onBack, onToday }: { item: Foundation; onBack: () => void; onToday: () => void }) {
  return (
    <article className="foundation-reading reading-measure">
      <button className="back-link" onClick={onBack}><ArrowLeft size={17} /> Back to Foundations</button>
      <p className="eyebrow">FOUNDATIONS · {String(item.order).padStart(2, '0')}</p>
      <h1>{item.title}</h1>
      <div className="reading-meta"><Clock3 size={15} />{item.readingTime}</div>
      <div className="longform">{item.body.map((p, i) => <p key={i} className={item.kind === 'prayer' ? 'prayer-reading' : ''}>{p}</p>)}</div>
      <aside className="reflection"><p className="eyebrow">{item.kind === 'prayer' ? 'A QUIET NOTE' : 'REFLECTION'}</p><p>{item.reflection}</p></aside>
      <div className="button-stack reading-actions">
        <button className="button button--primary" onClick={item.order === 2 || item.order === 3 ? onToday : onBack}>{item.order === 2 ? 'Explore Today' : item.order === 3 ? 'Open Today’s Scripture Challenge' : 'Return to Foundations'} <ArrowRight size={17} /></button>
        {(item.order === 2 || item.order === 3) && <button className="button button--text" onClick={onBack}>Return to Foundations</button>}
      </div>
    </article>
  )
}

function ArchiveView({ entries, pilotActive, openEntry }: { entries: ChallengeEntry[]; pilotActive: boolean; openEntry: (id: string) => void }) {
  return (
    <div className="standard-page archive-page">
      <PageIntro eyebrow="CHRONOLOGICAL ARCHIVE" title={pilotActive ? 'Weekly Rhythm Pilot' : 'Explore Past Scripture Challenges'} body={pilotActive ? 'Seven entries in editorial order. Each content type opens in its own experience within the same challenge.' : 'Browse by date and return to whatever serves you now. Older entries are a library, not a list of missed assignments.'} />
      <div className="archive-list">
        {entries.map(item => <button key={item.id} className="archive-row" onClick={() => openEntry(item.id)}>
          <time dateTime={item.date}><strong>{item.displayDate.split(' ')[1].replace(',', '')}</strong><span>{item.displayDate.split(' ')[0]} {item.displayDate.split(' ')[2]}</span></time>
          <span className="archive-row__title"><span>{item.entryType === 'teaching' ? item.scripture : item.entryType === 'guidedDiscipline' ? item.content.disciplineName : item.entryType === 'worksheet' ? 'Printable + on-screen prompts' : item.content.reference}</span><strong>{item.title}</strong><small>{pilotActive ? entryTypeLabel(item.entryType) : item.series ?? 'Biblical teaching'}</small></span>
          <ChevronRight size={20} />
        </button>)}
      </div>
    </div>
  )
}

const moreLinks: { section: MoreSection; title: string; description: string; icon: typeof BookOpen }[] = [
  { section: 'journey', title: 'Journey', description: 'Private, on-device recent activity', icon: Clock3 },
  { section: 'about', title: 'About the app', description: 'Purpose, naming, and Spiritually Hungry', icon: BookOpen },
  { section: 'podcast', title: 'Realigned podcast', description: 'Listen on Spotify or Apple Podcasts', icon: Headphones },
  { section: 'appearance', title: 'Appearance & reading', description: 'Theme and teaching text size', icon: Settings2 },
  { section: 'reminder', title: 'Daily reminder', description: 'Browser-saved preference only', icon: Bell },
  { section: 'scripture', title: 'Scripture & Translations', description: 'Sources, editions, and excerpts', icon: Library },
  { section: 'privacy', title: 'Privacy & local data', description: 'Storage, reset, and local data', icon: ShieldCheck },
]

function MoreView({ openSection, reminderEnabled, showDeveloperStudio, openDeveloperStudio }: { openSection: (section: MoreSection) => void; reminderEnabled: boolean; showDeveloperStudio: boolean; openDeveloperStudio: () => void }) {
  return (
    <div className="standard-page more-page">
      <PageIntro eyebrow="MORE" title="Make the space your own." body="Adjust your reading experience, revisit your Journey, or learn more about the app and its related ministry resources." />
      <div className="more-list">
        {moreLinks.map(item => <button key={item.section} onClick={() => openSection(item.section)}><item.icon size={20} strokeWidth={1.6} /><span><strong>{item.title}</strong><small>{item.section === 'reminder' && reminderEnabled ? 'Preference saved on this browser' : item.description}</small></span><ChevronRight size={19} /></button>)}
        {showDeveloperStudio && <button className="developer-studio-entry" onClick={openDeveloperStudio}><Wrench size={20} strokeWidth={1.6} /><span><strong>Developer Studio</strong><small>Date, component, and reader simulations</small></span><ChevronRight size={19} /></button>}
      </div>
      <p className="more-credit">Offered by <strong>Spiritually Hungry</strong></p>
    </div>
  )
}

function DetailHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return <div className="detail-header"><button className="back-link" onClick={onBack}><ArrowLeft size={17} /> More</button><p className="eyebrow">{title}</p></div>
}

function JourneyView({ journey, clearJourney, onBack }: { journey: Activity[]; clearJourney: () => void; onBack: () => void }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <section className="standard-page detail-page">
      <DetailHeader title="YOUR JOURNEY" onBack={onBack} />
      <PageIntro eyebrow="PRIVATE TO THIS BROWSER" title="A gentle record of recent activity." body="This is not a score, streak, or measure of your spiritual life. It simply reflects what you have opened in this browser." />
      {journey.length === 0 ? <div className="empty-state"><Botanical /><h2>Your Recent Activity Will Appear Here</h2><p>As you open teachings or media, this space will gently reflect what you have explored.</p></div> : <>
        <div className="journey-list">{journey.map(item => <div key={item.id} className="journey-row"><span className="journey-dot" /><div><strong>{item.label}</strong><time dateTime={item.at}>{new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(item.at))}</time></div></div>)}</div>
        {!confirming ? <button className="button button--text danger-link" onClick={() => setConfirming(true)}><Trash2 size={16} /> Clear recent activity</button> : <div className="confirm-panel"><p><strong>Clear all Journey activity?</strong><br />This cannot be undone.</p><div><button className="button button--secondary" onClick={() => setConfirming(false)}>Keep history</button><button className="button button--danger" onClick={() => { clearJourney(); setConfirming(false) }}>Clear history</button></div></div>}
      </>}
      <p className="local-note"><ShieldCheck size={17} />Activity stays in this browser, does not sync across devices, and may disappear if browser data is cleared.</p>
    </section>
  )
}

function AppearanceView({ state, update, onBack }: { state: PrototypeState; update: (patch: Partial<PrototypeState>) => void; onBack: () => void }) {
  return (
    <section className="standard-page detail-page">
      <DetailHeader title="APPEARANCE & READING" onBack={onBack} />
      <PageIntro eyebrow="YOUR READING SPACE" title="Quiet, comfortable, and adjustable." body="These choices are saved in this browser and apply throughout the app." />
      <div className="settings-group"><h2>Appearance</h2><p>System follows your device’s current light or dark setting.</p><div className="choice-grid">{([{ id: 'light', label: 'Light', icon: Sun }, { id: 'dark', label: 'Dark', icon: Moon }, { id: 'system', label: 'System', icon: Monitor }] as const).map(option => <button key={option.id} className={state.appearance === option.id ? 'is-selected' : ''} onClick={() => update({ appearance: option.id })} aria-pressed={state.appearance === option.id}><option.icon size={20} /><span>{option.label}</span>{state.appearance === option.id && <Check size={15} />}</button>)}</div></div>
      <div className="settings-group"><h2>Teaching text size</h2><p>Adjust long-form Scripture and teaching without changing interface labels.</p><div className="text-size-control">{([{ id: 'compact', label: 'A', name: 'Compact' }, { id: 'default', label: 'A', name: 'Default' }, { id: 'large', label: 'A', name: 'Large' }] as const).map(option => <button key={option.id} className={`${state.textSize === option.id ? 'is-selected' : ''} text-size-${option.id}`} onClick={() => update({ textSize: option.id })} aria-pressed={state.textSize === option.id}><strong>{option.label}</strong><span>{option.name}</span></button>)}</div><div className={`reading-preview reading-${state.textSize}`}><span>READING PREVIEW</span><p>“Rejoice always, pray continually, give thanks in all circumstances.”</p></div></div>
    </section>
  )
}

function ReminderView({ state, update, notify, onBack }: { state: PrototypeState; update: (patch: Partial<PrototypeState>) => void; notify: (message: string) => void; onBack: () => void }) {
  return (
    <section className="standard-page detail-page">
      <DetailHeader title="DAILY REMINDER" onBack={onBack} />
      <PageIntro eyebrow="A GENTLE PAUSE" title="Choose a rhythm that serves you." body="The teaching remains available whether or not you use a reminder." />
      <div className="settings-group"><div className="toggle-row"><div><h2>Reminder preference</h2><p>Saved locally in this browser</p></div><button role="switch" aria-checked={state.reminderEnabled} aria-label="Daily reminder preference" className={`switch ${state.reminderEnabled ? 'is-on' : ''}`} onClick={() => { update({ reminderEnabled: !state.reminderEnabled }); notify(!state.reminderEnabled ? 'Reminder preference saved on this browser.' : 'Reminder preference turned off.') }}><span /></button></div>
        <label className={`time-field ${!state.reminderEnabled ? 'is-disabled' : ''}`}><span>Preferred time</span><input type="time" value={state.reminderTime} disabled={!state.reminderEnabled} onChange={e => { update({ reminderTime: e.target.value }); notify('Reminder time saved on this browser.') }} /></label>
      </div>
      <div className="prototype-disclosure"><Bell size={20} /><div><strong>Preference only</strong><p>This browser does not schedule native device notifications. Your preferred time is saved here only.</p></div></div>
    </section>
  )
}

function InformationView({ section, onBack }: { section: 'about' | 'scripture' | 'privacy'; onBack: () => void }) {
  const content = {
    about: { eyebrow: 'ABOUT THE APP', title: 'One quiet, flexible experience.', body: 'Daily Scripture Challenges, evergreen Foundations readings, and selected teaching media—without registration or a pressure to keep up.' },
    scripture: { eyebrow: 'SCRIPTURE & TRANSLATIONS', title: 'Careful with the text—and its labels.', body: 'Translation, edition, and excerpt information belongs with each teaching, so readers can understand exactly what they are reading.' },
    privacy: { eyebrow: 'PRIVACY & LOCAL DATA', title: 'No account. No behavioral analytics.', body: 'This app keeps its settings and activity in your current browser. Nothing here is presented as cloud synchronization.' },
  }[section]
  return (
    <section className="standard-page detail-page information-page">
      <DetailHeader title={content.eyebrow} onBack={onBack} />
      <PageIntro {...content} />
      {section === 'about' && <div className="prose-sections"><section><h2>Why this exists</h2><p>The central principle is a unified daily teaching experience that lets people engage in a way that fits their time and capacity, without feeling behind.</p></section><section><h2>Names & relationships</h2><p><strong>Realigned</strong> is Alexis Waid’s existing podcast, not the app’s name. Bibleberry is offered by <strong>Spiritually Hungry</strong>.</p></section></div>}
      {section === 'scripture' && <div className="prose-sections"><section><h2>Scripture sources</h2><p>The app default is the <strong>World English Bible, Protestant Edition (WEBP)</strong>. Individual readings retain the translation and edition labels supplied with their content.</p><a className="text-link" href="https://ebible.org/engwebp/JHN01.htm" target="_blank" rel="noreferrer">Official WEBP source for John 1 <ExternalLink size={15} /></a></section><section><h2>Translation practice</h2><p>Passages may be presented in full or as intentionally selected excerpts. Translation and edition information remains attached to each reading.</p></section></div>}
      {section === 'privacy' && <div className="prose-sections"><section><h2>Private to this browser</h2><p>Onboarding, appearance, reading size, reminder preferences, explored Foundations items, Journey activity, and last-opened reading history are stored only in this browser. They do not sync to another device and may be removed if you clear browser data.</p></section><section><h2>Local data boundaries</h2><p>No account, cloud database, behavioral analytics, or native notification scheduling is connected. Sharing uses capabilities available in this browser.</p></section><section><h2>Your controls</h2><p>Clear Journey activity from the Journey screen. To erase all locally saved settings and activity and see first-open onboarding again, use “Reset local app data” below.</p></section></div>}
    </section>
  )
}

function isPrimaryView(value: unknown): value is PrimaryView {
  return value === 'today' || value === 'foundations' || value === 'archive' || value === 'more'
}

function primaryViewLabel(view: PrimaryView): string {
  return navItems.find(item => item.id === view)?.label ?? 'Today'
}

function currentCivilYearMonth(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function parseMonthHash(hash: string): { yearMonth: string } | null {
  if (hash === '#/month' || hash === '#/month/') {
    return { yearMonth: currentCivilYearMonth() }
  }
  if (!hash.startsWith('#/month/')) return null
  const raw = hash.slice('#/month/'.length).split('?')[0].trim()
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return null
  return { yearMonth: raw }
}

function parseReleasedChallengeHash(hash: string): { slug: string; origin: ChallengeOrigin } | null {
  if (!hash.startsWith('#/challenge/')) return null
  const withoutPrefix = hash.slice('#/challenge/'.length)
  const queryIndex = withoutPrefix.indexOf('?')
  const rawSlug = queryIndex >= 0 ? withoutPrefix.slice(0, queryIndex) : withoutPrefix
  const rawQuery = queryIndex >= 0 ? withoutPrefix.slice(queryIndex + 1) : ''
  const slug = rawSlug.trim()
  if (slug.length === 0) return null

  const historyOrigin = typeof window !== 'undefined' ? window.history.state?.challengeOrigin : undefined
  let origin: ChallengeOrigin
  if (historyOrigin !== undefined) {
    origin = parseChallengeOrigin(historyOrigin)
  } else if (rawQuery.length > 0) {
    origin = parseChallengeOriginFromSearchParams(new URLSearchParams(rawQuery))
  } else if (typeof window !== 'undefined' && window.location.search.length > 0) {
    origin = parseChallengeOriginFromSearchParams(new URLSearchParams(window.location.search))
  } else {
    origin = { kind: 'hub' }
  }

  return { slug, origin }
}

function parseInitialRoute(): {
  view: PrimaryView
  detail: Detail
  developmentCollection: 'ordinary' | 'pilot'
  previewDate: string
} {
  const hash = typeof window !== 'undefined' ? window.location.hash : ''
  if (challengePilotEnabled && hash === '#/pilot/challenge') {
    const originView = typeof window !== 'undefined' && isPrimaryView(window.history.state?.originView)
      ? window.history.state.originView
      : 'today'
    return {
      view: originView,
      detail: { type: 'challengePilot' },
      developmentCollection: 'ordinary',
      previewDate: '',
    }
  }
  if (participationPilotEnabled && hash === '#/pilot/participation') {
    const originView = typeof window !== 'undefined' && isPrimaryView(window.history.state?.originView)
      ? window.history.state.originView
      : 'today'
    return {
      view: originView,
      detail: { type: 'participationPilot' },
      developmentCollection: 'ordinary',
      previewDate: '',
    }
  }
  if (monthScreenEnabled) {
    const parsedMonth = parseMonthHash(hash)
    if (parsedMonth) {
      const originView = typeof window !== 'undefined' && isPrimaryView(window.history.state?.originView)
        ? window.history.state.originView
        : 'today'
      return {
        view: originView,
        detail: { type: 'month', yearMonth: parsedMonth.yearMonth },
        developmentCollection: 'ordinary',
        previewDate: '',
      }
    }
  }
  if (releasedChallengeRouteEnabled || monthScreenEnabled) {
    const parsedChallenge = parseReleasedChallengeHash(hash)
    if (parsedChallenge) {
      const originView = typeof window !== 'undefined' && isPrimaryView(window.history.state?.originView)
        ? window.history.state.originView
        : 'today'
      return {
        view: originView,
        detail: { type: 'releasedChallenge', slug: parsedChallenge.slug, origin: parsedChallenge.origin },
        developmentCollection: 'ordinary',
        previewDate: '',
      }
    }
  }
  if (hash.startsWith('#/teaching/')) {
    const id = hash.replace('#/teaching/', '')
    const item = allEntries.find(entry => entry.id === id && entry.entryType === 'teaching')
    if (item) {
      const isPilot = item.challengeId === WEEKLY_PILOT_CHALLENGE_ID
      return {
        view: id === novemberTeaching.id || isPilot ? 'today' : 'archive',
        detail: { type: 'teaching', id },
        developmentCollection: isPilot ? 'pilot' : 'ordinary',
        previewDate: isPilot ? item.date : '',
      }
    }
  } else if (hash.startsWith('#/entry/')) {
    const id = hash.replace('#/entry/', '')
    const item = allFormationEntries.find(entry => entry.id === id && entry.entryType !== 'teaching')
    if (item) {
      return {
        view: 'today',
        detail: { type: 'formation', id },
        developmentCollection: 'pilot',
        previewDate: item.date,
      }
    }
  }
  return {
    view: 'today',
    detail: null,
    developmentCollection: 'ordinary',
    previewDate: '',
  }
}

export type AppProps = {
  /** Optional typed return adapter for R08A-6 / Phase 05 Month, Shelf, and Library surfaces. */
  onReleasedChallengeReturn?: (origin: ChallengeOrigin) => void
}

export default function App({ onReleasedChallengeReturn }: AppProps = {}) {
  const [state, setState] = useState<PrototypeState>(loadState)
  const [view, setView] = useState<PrimaryView>(() => (loadState().onboarded ? parseInitialRoute().view : 'today'))
  const [detail, setDetail] = useState<Detail>(() => (loadState().onboarded ? parseInitialRoute().detail : null))
  const [previewDate, setPreviewDate] = useState(() => (loadState().onboarded ? parseInitialRoute().previewDate : ''))
  const [developmentCollection, setDevelopmentCollection] = useState<'ordinary' | 'pilot'>(() => (loadState().onboarded ? parseInitialRoute().developmentCollection : 'ordinary'))
  const [simulatedDate, setSimulatedDate] = useState('')
  const [simulatedLastOpened, setSimulatedLastOpened] = useState<LastOpened | null>(null)
  const [simulatedDismissedDate, setSimulatedDismissedDate] = useState('')
  const [pilotSession, setPilotSession] = useState<OrdinaryChallengeSessionState | undefined>(undefined)
  const [toast, setToast] = useState('')
  const [resetConfirm, setResetConfirm] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recordedOpening = useRef('')

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) }, [state])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const applyTheme = () => {
      const dark = state.appearance === 'dark' || (state.appearance === 'system' && mediaQuery.matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
    }
    applyTheme()
    mediaQuery.addEventListener('change', applyTheme)
    return () => mediaQuery.removeEventListener('change', applyTheme)
  }, [state.appearance])

  const update = useCallback((patch: Partial<PrototypeState>) => setState(previous => ({ ...previous, ...patch })), [])
  const notify = useCallback((message: string) => {
    setToast(message)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 3600)
  }, [])
  const addActivity = useCallback((label: string) => {
    setState(previous => ({ ...previous, journey: [{ id: `${Date.now()}-${Math.random()}`, label, at: new Date().toISOString() }, ...previous.journey].slice(0, 50) }))
  }, [])
  const scrollTop = () => window.scrollTo({ top: 0, behavior: 'instant' })
  const navigate = useCallback((destination: PrimaryView) => {
    setView(destination)
    setDetail(null)
    if (destination !== 'more') setPreviewDate('')
    setResetConfirm(false)
    if (
      (challengePilotEnabled && window.location.hash === '#/pilot/challenge')
      || (participationPilotEnabled && window.location.hash === '#/pilot/participation')
      || ((releasedChallengeRouteEnabled || monthScreenEnabled) && window.location.hash.startsWith('#/challenge/'))
      || (monthScreenEnabled && (window.location.hash === '#/month' || window.location.hash.startsWith('#/month/')))
    ) {
      window.history.pushState({ bibleberryView: destination }, '', window.location.pathname)
    } else {
      window.history.replaceState(null, '', window.location.pathname)
    }
    scrollTop()
  }, [])

  useEffect(() => {
    if (
      (!challengePilotEnabled && !participationPilotEnabled && !releasedChallengeRouteEnabled && !monthScreenEnabled) ||
      !state.onboarded
    )
      return
    const syncPilotRoute = () => {
      const currentHash = window.location.hash
      if (challengePilotEnabled && currentHash === '#/pilot/challenge') {
        const originView = isPrimaryView(window.history.state?.originView)
          ? window.history.state.originView
          : undefined
        if (originView) setView(originView)
        setDetail({ type: 'challengePilot' })
        scrollTop()
        return
      }
      if (participationPilotEnabled && currentHash === '#/pilot/participation') {
        const originView = isPrimaryView(window.history.state?.originView)
          ? window.history.state.originView
          : undefined
        if (originView) setView(originView)
        setDetail({ type: 'participationPilot' })
        scrollTop()
        return
      }
      if (monthScreenEnabled) {
        const parsedMonth = parseMonthHash(currentHash)
        if (parsedMonth) {
          const originView = isPrimaryView(window.history.state?.originView)
            ? window.history.state.originView
            : undefined
          if (originView) setView(originView)
          setDetail({ type: 'month', yearMonth: parsedMonth.yearMonth })
          scrollTop()
          return
        }
      }
      if (releasedChallengeRouteEnabled || monthScreenEnabled) {
        const parsedChallenge = parseReleasedChallengeHash(currentHash)
        if (parsedChallenge) {
          const originView = isPrimaryView(window.history.state?.originView)
            ? window.history.state.originView
            : undefined
          if (originView) setView(originView)
          setDetail({
            type: 'releasedChallenge',
            slug: parsedChallenge.slug,
            origin: parsedChallenge.origin,
          })
          scrollTop()
          return
        }
      }
      const restored = parseInitialRoute()
      if (restored.detail) {
        setView(restored.view)
        setDetail(restored.detail)
        setDevelopmentCollection(restored.developmentCollection)
        setPreviewDate(restored.previewDate)
        scrollTop()
        return
      }
      const historyView = isPrimaryView(window.history.state?.bibleberryView)
        ? window.history.state.bibleberryView
        : undefined
      if (historyView) setView(historyView)
      setDetail(previous =>
        previous?.type === 'challengePilot' ||
        previous?.type === 'participationPilot' ||
        previous?.type === 'releasedChallenge' ||
        previous?.type === 'month'
          ? null
          : previous,
      )
      scrollTop()
    }
    window.addEventListener('popstate', syncPilotRoute)
    window.addEventListener('hashchange', syncPilotRoute)
    return () => {
      window.removeEventListener('popstate', syncPilotRoute)
      window.removeEventListener('hashchange', syncPilotRoute)
    }
  }, [state.onboarded])
  const openFoundation = (id: string) => {
    const item = foundations.find(f => f.id === id)
    if (!item) return
    setState(previous => ({ ...previous, explored: previous.explored.includes(id) ? previous.explored : [...previous.explored, id], journey: [{ id: `${Date.now()}-${Math.random()}`, label: `Opened Foundations: ${item.title}`, at: new Date().toISOString() }, ...previous.journey].slice(0, 50) }))
    setDetail({ type: 'foundation', id })
    scrollTop()
  }
  const openEntry = (id: string) => {
    const item = allEntries.find(entry => entry.id === id)
    if (!item) return
    const isPilot = item.challengeId === WEEKLY_PILOT_CHALLENGE_ID
    if (isPilot && !simulatedDate) {
      setDevelopmentCollection('pilot')
      setPreviewDate(item.date)
    }
    const openedAt = simulatedDate ? new Date(`${simulatedDate}T12:00:00`).toISOString() : new Date().toISOString()
    const lastOpened = { entryId: item.id, challengeId: item.challengeId ?? item.id, openedAt }
    if (simulatedDate) setSimulatedLastOpened(lastOpened)
    else if (!previewDate && !isPilot) setState(previous => ({
      ...previous,
      lastOpened,
      journey: [{ id: `${Date.now()}-${Math.random()}`, label: `Opened ${entryTypeLabel(item.entryType)}: ${item.title}`, at: openedAt }, ...previous.journey].slice(0, 50),
    }))
    setDetail(item.entryType === 'teaching' ? { type: 'teaching', id } : { type: 'formation', id })
    if (!isPilot) setPreviewDate('')
    window.history.replaceState(null, '', item.entryType === 'teaching' ? `#/teaching/${id}` : `#/entry/${id}`)
    scrollTop()
  }
  const shareTeaching = async (teaching: Teaching) => {
    const url = `${window.location.origin}${window.location.pathname}#/teaching/${teaching.id}`
    try {
      if (navigator.share) await navigator.share({ title: teaching.title, text: `${teaching.title} — ${teaching.scripture}`, url })
      else { await navigator.clipboard.writeText(url); notify('Link copied.') }
      addActivity(`Shared teaching: ${teaching.title}`)
    } catch (error) {
      if ((error as Error).name !== 'AbortError') notify('Sharing was unavailable. You can copy the address from your browser.')
    }
  }
  const finishOnboarding = (destination: 'today' | 'foundations') => {
    update({ onboarded: true })
    setView(destination)
    setDetail(null)
    scrollTop()
    const hash = window.location.hash
    if (challengePilotEnabled && hash === '#/pilot/challenge') {
      window.history.replaceState({ bibleberryPilot: true, originView: destination }, '', '#/pilot/challenge')
      setDetail({ type: 'challengePilot' })
    } else if (participationPilotEnabled && hash === '#/pilot/participation') {
      window.history.replaceState({ bibleberryPilot: true, originView: destination }, '', '#/pilot/participation')
      setDetail({ type: 'participationPilot' })
    } else if (monthScreenEnabled && (hash === '#/month' || hash === '#/month/' || hash.startsWith('#/month/'))) {
      const parsedMonth = parseMonthHash(hash)
      if (parsedMonth) {
        window.history.replaceState(
          { originView: destination },
          '',
          `#/month/${parsedMonth.yearMonth}`,
        )
        setDetail({ type: 'month', yearMonth: parsedMonth.yearMonth })
      }
    } else if ((releasedChallengeRouteEnabled || monthScreenEnabled) && hash.startsWith('#/challenge/')) {
      const parsedChallenge = parseReleasedChallengeHash(hash)
      if (parsedChallenge) {
        window.history.replaceState(
          { originView: destination, challengeOrigin: parsedChallenge.origin },
          '',
          hash,
        )
        setDetail({
          type: 'releasedChallenge',
          slug: parsedChallenge.slug,
          origin: parsedChallenge.origin,
        })
      }
    } else if (hash.startsWith('#/teaching/')) {
      const id = hash.replace('#/teaching/', '')
      const item = allEntries.find(entry => entry.id === id && entry.entryType === 'teaching')
      if (item) {
        if (item.challengeId === WEEKLY_PILOT_CHALLENGE_ID) {
          setDevelopmentCollection('pilot')
          setPreviewDate(item.date)
        }
        setDetail({ type: 'teaching', id })
      }
    } else if (hash.startsWith('#/entry/')) {
      const id = hash.replace('#/entry/', '')
      const item = allFormationEntries.find(entry => entry.id === id && entry.entryType !== 'teaching')
      if (item) {
        setDevelopmentCollection('pilot')
        setPreviewDate(item.date)
        setDetail({ type: 'formation', id })
      }
    }
  }
  const resetPrototype = async () => {
    let participationCleared = false
    try {
      await defaultGuestParticipationStore.clearLocalData()
      participationCleared = defaultGuestParticipationStore.getSnapshot().health === 'ok'
    } catch {
      participationCleared = false
    }

    if (!participationCleared) {
      setResetConfirm(false)
      notify('Unable to reset local app data: storage was unavailable.')
      return
    }

    if (participationPilotEnabled) {
      void import('./pilot/participationPilotModel').then(module => module.resetParticipationPilotData())
    }
    let monthIntroCleared = true
    if (monthScreenEnabled) {
      try {
        const monthIntroModule = await import('./components/month/monthIntroStorage')
        const clearResult = await monthIntroModule.defaultMonthIntroStore.clear()
        monthIntroCleared = clearResult.ok
      } catch {
        monthIntroCleared = false
      }
    }
    setState({ ...initialState })
    setDetail(null)
    setPreviewDate('')
    setDevelopmentCollection('ordinary')
    setSimulatedDate('')
    setSimulatedLastOpened(null)
    setSimulatedDismissedDate('')
    setPilotSession(undefined)
    setView('today')
    setResetConfirm(false)
    window.history.replaceState(null, '', window.location.pathname)
    scrollTop()
    notify(
      monthIntroCleared
        ? 'Local app data cleared. Welcome restored.'
        : 'App and participation data cleared, but monthly introduction storage could not be cleared (storage unavailable).',
    )
  }

  useEffect(() => {
    const latestTeaching = latestEntryThrough(simulatedDate || localDateKey())
    if (state.onboarded && !simulatedDate && view === 'today' && !detail && !previewDate && latestTeaching && recordedOpening.current !== latestTeaching.id) {
      recordedOpening.current = latestTeaching.id
      // Synchronize latest teaching view with local journey activity log
      addActivity(`Opened latest available teaching: ${latestTeaching.title}`)
    }
    if (view !== 'today' || detail || previewDate || simulatedDate) recordedOpening.current = ''
  }, [state.onboarded, view, detail, previewDate, simulatedDate, addActivity])

  const toastBanner = (
    <div className={`toast ${toast ? 'is-visible' : ''}`} role="status" aria-live="polite">
      {toast}
      <button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={16} /></button>
    </div>
  )

  if (!state.onboarded) {
    return (
      <>
        <Onboarding state={state} update={update} finish={finishOnboarding} />
        {toastBanner}
      </>
    )
  }

  const previewedEntry = previewDate
    ? (developmentCollection === 'pilot' ? weeklyPilotEntries : allTeachings.filter(item => item.id.startsWith('sabbath-'))).find(entry => entry.date === previewDate)
    : undefined
  const clearSimulation = () => {
    setSimulatedDate('')
    setSimulatedLastOpened(null)
    setSimulatedDismissedDate('')
  }
  const previewDevelopmentDate = (date: string) => {
    clearSimulation()
    setDetail(null)
    setView('today')
    setPreviewDate(date)
    const item = (developmentCollection === 'pilot' ? weeklyPilotEntries : sabbathFixtures).find(entry => entry.date === date)
    if (item) addActivity(`Previewed ${developmentCollection === 'pilot' ? 'Weekly Rhythm Pilot' : 'Sabbath reading'}: ${item.title}`)
    window.history.replaceState(null, '', window.location.pathname)
    scrollTop()
  }
  const simulateToday = (date: string, collection: 'ordinary' | 'pilot' = 'ordinary') => {
    if (!date) return
    setDevelopmentCollection(collection)
    setPreviewDate('')
    setDetail(null)
    setView('today')
    setSimulatedLastOpened(null)
    setSimulatedDismissedDate('')
    setSimulatedDate(date)
    window.history.replaceState(null, '', window.location.pathname)
    scrollTop()
  }
  const openWeeklyPilot = () => {
    clearSimulation()
    setDevelopmentCollection('pilot')
    setDetail(null)
    setView('today')
    setPreviewDate('2026-11-02')
    window.history.replaceState(null, '', window.location.pathname)
    scrollTop()
  }
  const openOnePhraseTest = () => {
    clearSimulation()
    setDevelopmentCollection('pilot')
    setView('today')
    setPreviewDate(onePhraseMemorizationEntry.date)
    setDetail({ type: 'formation', id: onePhraseMemorizationEntry.id })
    window.history.replaceState(null, '', `#/entry/${onePhraseMemorizationEntry.id}`)
    scrollTop()
  }
  const returnToNormalAppView = () => {
    clearSimulation()
    setDevelopmentCollection('ordinary')
    setDetail(null)
    setPreviewDate('')
    setView('today')
    setResetConfirm(false)
    window.history.replaceState(null, '', window.location.pathname)
    scrollTop()
  }
  const returnToReaderView = () => {
    setDetail(null)
    setView('today')
    window.history.replaceState(null, '', window.location.pathname)
    scrollTop()
  }
  const setUpReturningReaderDemo = () => {
    setDevelopmentCollection('ordinary')
    setPreviewDate('')
    setDetail(null)
    setView('today')
    setSimulatedDate('2026-11-08')
    setSimulatedLastOpened({ entryId: 'sabbath-2026-11-03', challengeId: 'seven-days-sabbath-2026', openedAt: '2026-11-03T16:00:00.000Z' })
    setSimulatedDismissedDate('')
    window.history.replaceState(null, '', window.location.pathname)
    scrollTop()
  }
  const setUpPilotResumeDemo = (entryId: string) => {
    const item = weeklyPilotEntries.find(entry => entry.id === entryId)
    if (!item) return
    setDevelopmentCollection('pilot')
    setPreviewDate('')
    setDetail(null)
    setView('today')
    setSimulatedDate('2026-11-10')
    setSimulatedLastOpened({ entryId: item.id, challengeId: item.challengeId ?? WEEKLY_PILOT_CHALLENGE_ID, openedAt: `${item.date}T12:00:00.000Z` })
    setSimulatedDismissedDate('')
    window.history.replaceState(null, '', window.location.pathname)
    scrollTop()
  }
  const openDeveloperEntry = (id: string) => {
    setView('today')
    openEntry(id)
  }
  const openDeveloperStudio = () => {
    if (!developerStudioEnabled) return
    setDetail({ type: 'developerStudio' })
    scrollTop()
  }
  const openInteractiveChallengeLab = () => {
    if (!developerStudioEnabled) return
    setDetail({ type: 'challengeLab' })
    window.history.replaceState(null, '', window.location.pathname)
    scrollTop()
  }
  const openChallengePilot = () => {
    if (!challengePilotEnabled) return
    window.history.replaceState({ ...(window.history.state ?? {}), bibleberryView: view }, '', window.location.href)
    window.history.pushState({ bibleberryPilot: true, originView: view }, '', '#/pilot/challenge')
    setDetail({ type: 'challengePilot' })
    scrollTop()
  }
  const exitChallengePilot = () => {
    if (!challengePilotEnabled) return
    setDetail(null)
    if (window.location.hash === '#/pilot/challenge') {
      window.history.pushState({ bibleberryView: view }, '', window.location.pathname)
    }
    scrollTop()
  }
  const openParticipationPilot = () => {
    if (!participationPilotEnabled) return
    window.history.replaceState({ ...(window.history.state ?? {}), bibleberryView: view }, '', window.location.href)
    window.history.pushState({ bibleberryPilot: true, originView: view }, '', '#/pilot/participation')
    setDetail({ type: 'participationPilot' })
    scrollTop()
  }
  const exitParticipationPilot = () => {
    if (!participationPilotEnabled) return
    setDetail(null)
    if (window.location.hash === '#/pilot/participation') {
      window.history.pushState({ bibleberryView: view }, '', window.location.pathname)
    }
    scrollTop()
  }
  const openMonthScreen = (yearMonth: string) => {
    if (!monthScreenEnabled) return
    window.history.replaceState({ ...(window.history.state ?? {}), bibleberryView: view }, '', window.location.href)
    window.history.pushState({ originView: view }, '', `#/month/${yearMonth}`)
    setDetail({ type: 'month', yearMonth })
    scrollTop()
  }
  const openMonthChallenge = (slug: string, yearMonth: string) => {
    if (!monthScreenEnabled) return
    const origin: ChallengeOrigin = { kind: 'month', yearMonth }
    const targetHash = `#/challenge/${encodeURIComponent(slug)}?origin=month&yearMonth=${encodeURIComponent(yearMonth)}`
    window.history.pushState(
      { originView: view, challengeOrigin: origin },
      '',
      targetHash,
    )
    setDetail({ type: 'releasedChallenge', slug, origin })
    scrollTop()
  }
  const exitMonthScreen = () => {
    if (!monthScreenEnabled) return
    setDetail(null)
    if (window.location.hash === '#/month' || window.location.hash.startsWith('#/month/')) {
      window.history.pushState({ bibleberryView: view }, '', window.location.pathname)
    }
    scrollTop()
  }
  const exitReleasedChallenge = (returnedOrigin: ChallengeOrigin) => {
    if (!releasedChallengeRouteEnabled && !monthScreenEnabled) return
    const normalizedOrigin = parseChallengeOrigin(returnedOrigin)
    if (monthScreenEnabled && normalizedOrigin.kind === 'month') {
      const targetYearMonth = normalizedOrigin.yearMonth
      setDetail({ type: 'month', yearMonth: targetYearMonth })
      window.history.pushState(
        { bibleberryView: view, originView: view, returnedChallengeOrigin: normalizedOrigin },
        '',
        `#/month/${targetYearMonth}`,
      )
      onReleasedChallengeReturn?.(normalizedOrigin)
      scrollTop()
      return
    }
    setDetail(null)
    if (window.location.hash.startsWith('#/challenge/')) {
      window.history.pushState(
        { bibleberryView: view, returnedChallengeOrigin: normalizedOrigin },
        '',
        window.location.pathname,
      )
    }
    onReleasedChallengeReturn?.(normalizedOrigin)
    scrollTop()
  }

  const todayKey = simulatedDate || localDateKey()
  const yesterday = simulatedDate ? new Date(`${simulatedDate}T12:00:00`) : new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayKey = localDateKey(yesterday)
  const activeLastOpened = simulatedDate ? simulatedLastOpened : state.lastOpened
  const activeDismissedDate = simulatedDate ? simulatedDismissedDate : state.resumeDismissedDate
  const lastOpenedEntry = activeLastOpened ? allEntries.find(item => item.id === activeLastOpened.entryId) : undefined
  const lastOpenedDate = activeLastOpened ? localDateKey(new Date(activeLastOpened.openedAt)) : ''
  const showResume = Boolean(
    lastOpenedEntry
    && lastOpenedDate !== todayKey
    && lastOpenedDate !== yesterdayKey
    && activeDismissedDate !== todayKey
    && !previewDate
  )
  const resumeNext = lastOpenedEntry && showResume ? entryNeighbors(lastOpenedEntry, todayKey).next : undefined
  const jumpToToday = () => {
    if (simulatedDate) setSimulatedDismissedDate(todayKey)
    else update({ resumeDismissedDate: todayKey })
    window.requestAnimationFrame(() => (document.getElementById('daily-teaching') ?? document.getElementById('daily-entry'))?.scrollIntoView({ block: 'start' }))
  }
  const openAnnouncementRoute = (route: string) => {
    if (route.startsWith('#/teaching/')) openEntry(route.replace('#/teaching/', ''))
    else notify('This announcement destination is not available yet.')
  }
  const openDisciplineLibrary = () => {
    setDetail({ type: 'disciplineLibrary' })
    scrollTop()
  }
  const openDiscipline = (id: string) => {
    if (!disciplineResources.some(resource => resource.id === id)) return
    setDetail({ type: 'discipline', id })
    scrollTop()
  }
  const formationExperience = (item: Exclude<ChallengeEntry, { entryType: 'teaching' }>, archiveBack = false) => {
    const { previous, next } = entryNeighbors(item, previewDate ? '9999-12-31' : todayKey)
    return <Suspense fallback={formationViewFallback}><FormationExperienceView entry={item} previous={previous} next={next} onNavigate={target => previewDate ? previewDevelopmentDate(target.date) : openEntry(target.id)} onOpenDiscipline={openDiscipline} onLeave={() => navigate('archive')} onBack={archiveBack ? () => navigate('archive') : undefined} /></Suspense>
  }

  let content: React.ReactNode
  if (detail?.type === 'foundation') {
    const item = foundations.find(f => f.id === detail.id)!
    content = <FoundationReading item={item} onBack={() => navigate('foundations')} onToday={() => navigate('today')} />
  } else if (detail?.type === 'teaching') {
    const item = allEntries.find((entry): entry is TeachingEntry => entry.id === detail.id && entry.entryType === 'teaching')!
    const { previous, next } = entryNeighbors(item, previewDate ? '9999-12-31' : todayKey)
    content = <TeachingView teaching={item} onBack={view === 'archive' ? () => navigate('archive') : undefined} onShare={() => shareTeaching(item)} onMedia={addActivity} showMedia={item.id === novemberTeaching.id} previous={previous} next={next} onNavigateTeaching={target => previewDate ? previewDevelopmentDate(target.date) : openEntry(target.id)} />
  } else if (detail?.type === 'formation') {
    const item = allFormationEntries.find(entry => entry.id === detail.id && entry.entryType !== 'teaching') as Exclude<ChallengeEntry, { entryType: 'teaching' }>
    content = formationExperience(item, view === 'archive')
  } else if (detail?.type === 'disciplineLibrary') {
    content = <Suspense fallback={formationViewFallback}><DisciplineLibraryView resources={disciplineResources} onOpen={openDiscipline} onBack={() => navigate('foundations')} /></Suspense>
  } else if (detail?.type === 'discipline') {
    const resource = disciplineResources.find(item => item.id === detail.id)!
    const relatedSessions = allFormationEntries.filter(entry => resource.relatedSessionIds?.includes(entry.id))
    content = <Suspense fallback={formationViewFallback}><DisciplineResourceView resource={resource} relatedSessions={relatedSessions} onBack={openDisciplineLibrary} onOpenSession={openEntry} /></Suspense>
  } else if (detail?.type === 'challengePilot' && challengePilotEnabled && OrdinaryChallengePilot) {
    content = <Suspense fallback={<div className="standard-page"><p>Opening Challenge…</p></div>}>
      <OrdinaryChallengePilot
        sessionState={pilotSession}
        onSessionStateChange={setPilotSession}
        returnLabel={`Return to ${primaryViewLabel(view)}`}
        onExit={exitChallengePilot}
      />
    </Suspense>
  } else if (detail?.type === 'participationPilot' && participationPilotEnabled && ParticipationPilot) {
    content = <Suspense fallback={<div className="standard-page"><p>Opening Challenge…</p></div>}>
      <ParticipationPilot
        returnLabel={`Return to ${primaryViewLabel(view)}`}
        onExit={exitParticipationPilot}
      />
    </Suspense>
  } else if (detail?.type === 'month' && monthScreenEnabled && MonthScreenHost) {
    content = <Suspense fallback={<div className="standard-page"><p role="status" aria-live="polite">Loading Month…</p></div>}>
      <MonthScreenHost
        yearMonth={detail.yearMonth}
        onOpenChallenge={openMonthChallenge}
        onSelectYearMonth={openMonthScreen}
        onExit={exitMonthScreen}
        exitLabel={`Return to ${primaryViewLabel(view)}`}
      />
    </Suspense>
  } else if (detail?.type === 'releasedChallenge' && (releasedChallengeRouteEnabled || monthScreenEnabled) && ReleasedChallengeHost) {
    const returnLabel = detail.origin.kind === 'hub'
      ? `Return to ${primaryViewLabel(view)}`
      : formatChallengeOriginLabel(detail.origin)
    content = <Suspense fallback={<div className="standard-page"><p role="status" aria-live="polite">Loading Challenge…</p></div>}>
      <ReleasedChallengeHost
        slug={detail.slug}
        origin={detail.origin}
        returnLabel={returnLabel}
        onReturn={exitReleasedChallenge}
      />
    </Suspense>
  } else if (detail?.type === 'challengeLab' && developerStudioEnabled && InteractiveChallengeLab) {
    content = <Suspense fallback={<div className="standard-page"><p>Opening Interactive Challenge Lab…</p></div>}>
      <InteractiveChallengeLab onReturnToStudio={openDeveloperStudio} />
    </Suspense>
  } else if (detail?.type === 'developerStudio' && developerStudioEnabled) {
    content = <DeveloperStudio
      actualDate={localDateKey()}
      previewDate={previewDate}
      simulatedDate={simulatedDate}
      developmentCollection={developmentCollection}
      simulatedLastOpenedTitle={simulatedLastOpened ? allEntries.find(entry => entry.id === simulatedLastOpened.entryId)?.title : undefined}
      onPreview={previewDevelopmentDate}
      onSimulate={date => simulateToday(date)}
      onOpenPilot={openWeeklyPilot}
      onSimulatePilot={date => simulateToday(date, 'pilot')}
      onOpenEntry={openDeveloperEntry}
      onOpenChallengeLab={openInteractiveChallengeLab}
      onOnePhraseTest={openOnePhraseTest}
      onPilotResumeDemo={setUpPilotResumeDemo}
      onReturningReaderDemo={setUpReturningReaderDemo}
      onReturnToReader={returnToReaderView}
      onReturnToNormal={returnToNormalAppView}
    />
  } else if (detail?.type === 'more') {
    const section = detail.section
    if (section === 'journey') content = <JourneyView journey={state.journey} clearJourney={() => { update({ journey: [] }); notify('Journey history cleared from this browser.') }} onBack={() => navigate('more')} />
    else if (section === 'appearance') content = <AppearanceView state={state} update={update} onBack={() => navigate('more')} />
    else if (section === 'reminder') content = <ReminderView state={state} update={update} notify={notify} onBack={() => navigate('more')} />
    else if (section === 'podcast') content = <section className="standard-page detail-page"><DetailHeader title="REALIGNED PODCAST" onBack={() => navigate('more')} /><PageIntro eyebrow="LISTEN WHERE YOU ALREADY DO" title="Realigned, with Alexis Waid." body="Realigned is the podcast—not the app’s final name. Episodes open on their existing platforms; no separate podcast account or catalog is required here." /><PodcastFixture standalone onAction={addActivity} /></section>
    else content = <>
      <InformationView section={section} onBack={() => navigate('more')} />
      {section === 'privacy' && <div className="standard-page reset-zone">{!resetConfirm ? <button className="button button--text danger-link" onClick={() => setResetConfirm(true)}><RotateCcw size={16} /> Reset local app data</button> : <div className="confirm-panel"><p><strong>Reset all local app data?</strong><br />This clears settings, explored items, and Journey history, then restores first-open onboarding.</p><div><button className="button button--secondary" onClick={() => setResetConfirm(false)}>Cancel</button><button className="button button--danger" onClick={resetPrototype}>Erase & reset</button></div></div>}</div>}
    </>
  } else if (view === 'today') {
    const todayEntry = previewDate ? previewedEntry : latestEntryThrough(todayKey, simulatedDate && developmentCollection === 'pilot' ? weeklyPilotEntries : ordinaryEntries)
    const { previous, next } = todayEntry ? entryNeighbors(todayEntry, previewDate ? '9999-12-31' : todayKey) : { previous: undefined, next: undefined }
    content = <>
      <AnnouncementBar onInternalRoute={openAnnouncementRoute} onAction={addActivity} nowOverride={simulatedDate ? new Date(`${simulatedDate}T12:00:00`).getTime() : undefined} />
      {showResume && lastOpenedEntry && <ResumeCard entry={lastOpenedEntry} next={resumeNext} todayEntryType={todayEntry?.entryType} onOpen={openEntry} onJump={jumpToToday} />}
      {todayEntry
        ? todayEntry.entryType === 'teaching'
          ? <TeachingView teaching={todayEntry} onShare={() => shareTeaching(todayEntry)} onMedia={addActivity} showMedia={todayEntry.id === novemberTeaching.id} previous={previous} next={next} onNavigateTeaching={target => previewDate ? previewDevelopmentDate(target.date) : openEntry(target.id)} />
          : formationExperience(todayEntry)
        : <div className="standard-page preview-empty"><div className="empty-state"><Botanical /><h2>No teaching is available for this date</h2><p>There isn’t an entry for this date. Choose another available entry from the Archive.</p></div></div>}
    </>
  } else if (view === 'foundations') content = <FoundationsView explored={state.explored} openFoundation={openFoundation} openDisciplineLibrary={openDisciplineLibrary} />
  else if (view === 'archive') content = <ArchiveView entries={developmentCollection === 'pilot' ? [...weeklyPilotEntries].reverse() : ordinaryEntries} pilotActive={developmentCollection === 'pilot'} openEntry={openEntry} />
  else content = <MoreView openSection={section => { setDetail({ type: 'more', section }); scrollTop() }} reminderEnabled={state.reminderEnabled} showDeveloperStudio={developerStudioEnabled} openDeveloperStudio={openDeveloperStudio} />

  return (
    <div className={`reading-${state.textSize}`}>
      <AppShell view={view} detail={detail} navigate={navigate}>
        {challengePilotEnabled && !detail && OrdinaryChallengePilotEntryBar && (
          <Suspense fallback={null}>
            <OrdinaryChallengePilotEntryBar onOpenPilot={openChallengePilot} />
          </Suspense>
        )}
        {participationPilotEnabled && !detail && ParticipationPilotEntryBar && (
          <Suspense fallback={null}>
            <ParticipationPilotEntryBar onOpenPilot={openParticipationPilot} />
          </Suspense>
        )}
        {monthScreenEnabled && !detail && view === 'today' && MonthPreviewNewsBanner && (
          <Suspense fallback={null}>
            <MonthPreviewNewsBanner onOpenMonth={openMonthScreen} />
          </Suspense>
        )}
        {monthScreenEnabled && !detail && (view === 'today' || view === 'archive') && MonthScreenEntryBar && (
          <Suspense fallback={null}>
            <MonthScreenEntryBar onOpenMonth={openMonthScreen} />
          </Suspense>
        )}
        {content}
      </AppShell>
      {toastBanner}
    </div>
  )
}
