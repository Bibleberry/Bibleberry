import { useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, FlaskConical, RotateCcw, UserRound } from 'lucide-react'
import { weeklyPilotEntries } from '../data/formationFixtures'
import { entryTypeLabel } from '../data/formation'

type DeveloperStudioProps = {
  actualDate: string
  previewDate: string
  simulatedDate: string
  developmentCollection: 'ordinary' | 'pilot'
  simulatedLastOpenedTitle?: string
  onPreview: (date: string) => void
  onSimulate: (date: string) => void
  onOpenPilot: () => void
  onSimulatePilot: (date: string) => void
  onOpenEntry: (id: string) => void
  onOpenChallengeLab: () => void
  onOnePhraseTest: () => void
  onPilotResumeDemo: (entryId: string) => void
  onReturningReaderDemo: () => void
  onReturnToReader: () => void
  onReturnToNormal: () => void
}

export function DeveloperStudio({
  actualDate,
  previewDate,
  simulatedDate,
  developmentCollection,
  simulatedLastOpenedTitle,
  onPreview,
  onSimulate,
  onOpenPilot,
  onSimulatePilot,
  onOpenEntry,
  onOpenChallengeLab,
  onOnePhraseTest,
  onPilotResumeDemo,
  onReturningReaderDemo,
  onReturnToReader,
  onReturnToNormal,
}: DeveloperStudioProps) {
  const activeDate = previewDate || simulatedDate
  const [draftDate, setDraftDate] = useState(activeDate || actualDate)
  const mode = simulatedDate ? 'Simulated Today' : previewDate ? 'Date preview' : 'Normal app view'

  return (
    <div className="standard-page detail-page developer-studio">
      <div className="detail-header">
        <button className="back-link" onClick={onReturnToReader}><ArrowLeft size={17} /> Return to reader view</button>
        <p className="eyebrow">DEVELOPER STUDIO</p>
      </div>
      <header className="page-intro">
        <p className="eyebrow">TESTING BUILD</p>
        <h1>Preserve the machinery.<br />Keep the reader experience clean.</h1>
        <p>Choose a scenario here, then return to the ordinary application interface to experience it. Testing controls remain in this studio.</p>
      </header>

      <section className="studio-status" aria-labelledby="studio-current-state">
        <div className="studio-section-heading"><CalendarDays size={19} /><h2 id="studio-current-state">Current simulation state</h2></div>
        <dl>
          <div><dt>Reader mode</dt><dd>{mode}</dd></div>
          <div><dt>Effective date</dt><dd>{activeDate || actualDate}</dd></div>
          <div><dt>Content selection</dt><dd>{developmentCollection === 'pilot' ? 'Weekly Rhythm Pilot' : 'Ordinary application content'}</dd></div>
          {simulatedLastOpenedTitle && <div><dt>Temporary last opened</dt><dd>{simulatedLastOpenedTitle}</dd></div>}
        </dl>
        <p>Simulated reading history is temporary and separate from genuine browser-saved history.</p>
      </section>

      <section className="developer-studio__section" aria-labelledby="studio-challenge-lab">
        <div className="studio-section-heading"><BookOpen size={19} /><h2 id="studio-challenge-lab">Interactive Challenge Lab</h2></div>
        <p>Review four guided Biblical Teaching Challenges built from Alexis Waid’s November 1, 2, 3, and 5 manuscripts. Lab state stays separate from ordinary reader history and preferences.</p>
        <div className="studio-subsection">
          <div><h3>Four playable Challenges</h3><p>5 / 7 / 8 / 8 required screens · Optional studies · Saved Challenges · My Scripture</p></div>
          <button className="button button--primary" type="button" onClick={onOpenChallengeLab}>Open Interactive Challenge Lab <ArrowRight size={17} /></button>
        </div>
      </section>

      <section className="developer-studio__section" aria-labelledby="studio-date-preview">
        <div className="studio-section-heading"><CalendarDays size={19} /><h2 id="studio-date-preview">Date &amp; Content Preview</h2></div>
        <p>Preview a supplied entry, simulate Today and its availability rules, or open the complete seven-day development pilot.</p>
        <form className="studio-date-form" onSubmit={event => { event.preventDefault(); if (draftDate) onPreview(draftDate) }}>
          <label><span>Test date</span><input type="date" value={draftDate} onChange={event => setDraftDate(event.target.value)} required /></label>
          <div className="studio-actions">
            <button className="button button--secondary" type="submit">Preview date</button>
            <button className="button button--secondary" type="button" disabled={!draftDate} onClick={() => onSimulate(draftDate)}>Simulate Today</button>
            <button className="button button--secondary" type="button" disabled={!draftDate} onClick={() => onSimulatePilot(draftDate)}>Simulate selected pilot date</button>
          </div>
        </form>
        <div className="studio-subsection">
          <div><h3>Weekly Rhythm Pilot</h3><p>November 2–8, 2026 · Four entry types in one ordered challenge.</p></div>
          <button className="button button--primary" type="button" onClick={onOpenPilot}>Open seven-day pilot</button>
        </div>
        <div className="studio-entry-list" aria-label="Individual seven-day pilot entries">
          {weeklyPilotEntries.map(entry => <button key={entry.id} type="button" onClick={() => onOpenEntry(entry.id)}>
            <span><small>{entry.displayDate} · {entryTypeLabel(entry.entryType)}</small><strong>{entry.title}</strong></span><ArrowRight size={17} />
          </button>)}
        </div>
      </section>

      <section className="developer-studio__section" aria-labelledby="studio-components">
        <div className="studio-section-heading"><FlaskConical size={19} /><h2 id="studio-components">Component Testing</h2></div>
        <p>Open the existing formation experiences directly, including the memorization edge case and teaching media components.</p>
        <div className="studio-test-list">
          <button className="button button--secondary" onClick={() => onOpenEntry('weekly-pilot-2026-11-04')}>Test guided spiritual discipline</button>
          <button className="button button--secondary" onClick={() => onOpenEntry('weekly-pilot-2026-11-07')}>Test journal companion &amp; PDF</button>
          <button className="button button--secondary" onClick={() => onOpenEntry('weekly-pilot-2026-11-08')}>Test Scripture memorization</button>
          <button className="button button--secondary" onClick={onOnePhraseTest}>Test one-phrase passage</button>
          <button className="button button--text" onClick={() => onOpenEntry('november-5-gods-will')}>Test teaching media components</button>
        </div>
      </section>

      <section className="developer-studio__section" aria-labelledby="studio-readers">
        <div className="studio-section-heading"><UserRound size={19} /><h2 id="studio-readers">Reader Simulations</h2></div>
        <p>Set up temporary reading history to test Welcome Back, challenge-ordered Continue, Previous/Next navigation, and resume dismissal.</p>
        <div className="studio-scenario">
          <div><h3>Ordinary returning reader</h3><p>Last opened November 3 · Simulated Today November 8</p></div>
          <button className="button button--secondary" onClick={onReturningReaderDemo}>Set up returning-reader demo</button>
        </div>
        <div className="studio-test-list">
          <button className="button button--text" onClick={() => onPilotResumeDemo('weekly-pilot-2026-11-04')}>Resume from Wednesday</button>
          <button className="button button--text" onClick={() => onPilotResumeDemo('weekly-pilot-2026-11-07')}>Resume from Saturday</button>
          <button className="button button--text" onClick={() => onPilotResumeDemo('weekly-pilot-2026-11-08')}>Resume from Sunday</button>
        </div>
      </section>

      <section className="developer-studio__section studio-restore" aria-labelledby="studio-restore">
        <div className="studio-section-heading"><RotateCcw size={18} /><h2 id="studio-restore">Reset &amp; Restore</h2></div>
        <p>End date, content, and reading-history simulations without clearing genuine reading history, appearance preferences, or reading-size settings.</p>
        <div className="studio-actions">
          <button className="button button--secondary" onClick={onReturnToReader}>Return to reader view</button>
          <button className="button button--primary" onClick={onReturnToNormal}>Return to Normal App View</button>
        </div>
      </section>
    </div>
  )
}
