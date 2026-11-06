import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle, ArrowLeft, ArrowRight, FileJson, FlaskConical, ShieldCheck, Trash2,
} from 'lucide-react'
import {
  parseBerryMarkCompilerResult,
  type BerryMarkLocalPreview,
  type BerryMarkPreviewIssue,
  type BerryMarkReviewSummary,
} from './berryMarkPreview.ts'
import './berryMarkPreview.css'
import {
  CmsBlockView,
  CmsCompanionLinks,
  CmsScripturePanel,
} from '../../components/challenge/CmsContentBlocks.tsx'

function reviewStatus(value: boolean | null) {
  if (value === null) return 'Not reported'
  return value ? 'Yes' : 'No'
}

function BerryMarkReviewPanel({ review }: { review: BerryMarkReviewSummary }) {
  return (
    <section className="berrymark-review-panel" aria-labelledby="berrymark-review-heading">
      <div className="berrymark-review-panel__heading">
        <div><span className="section-label">Developer-facing review report</span><h2 id="berrymark-review-heading">Compilation and editorial status</h2></div>
        <ShieldCheck size={23} aria-hidden="true" />
      </div>
      <p className="berrymark-review-panel__intro">This report remains separate from the reader content below. Annotations and unresolved metadata are not teaching blocks.</p>
      <dl className="berrymark-review-grid">
        <div><dt>Compiler mode</dt><dd>Experimental pure Sanity compilation</dd></div>
        <div><dt>Source file</dt><dd>{review.source.filename ?? 'Not reported'}</dd></div>
        <div><dt>Source SHA-256</dt><dd><code>{review.source.sha256 ?? 'Not reported'}</code></dd></div>
        <div><dt>Source revision</dt><dd>{review.source.revision ?? 'Not reported'}</dd></div>
        <div><dt>Source title</dt><dd>{review.sourceTitle}</dd></div>
        <div><dt>Editorial approval</dt><dd>{review.approvalStatus}</dd></div>
        <div><dt>Adaptation reviewed</dt><dd>No</dd></div>
        <div><dt>Schema complete</dt><dd>{reviewStatus(review.schemaComplete)}</dd></div>
        <div><dt>Import ready</dt><dd>{reviewStatus(review.importReady)}</dd></div>
        <div><dt>Publication ready</dt><dd>{reviewStatus(review.publicationReady)}</dd></div>
      </dl>
      <div className="berrymark-counts" aria-label="Compiled content counts">
        <span><strong>{review.counts.screens}</strong> screens</span>
        <span><strong>{review.counts.contentBlocks}</strong> Content Blocks</span>
        <span><strong>{review.counts.optionalStudies}</strong> optional studies</span>
        <span><strong>{review.counts.nestedScriptures}</strong> nested Scriptures</span>
        <span><strong>{review.counts.editorialAnnotations}</strong> annotations</span>
        <span><strong>{review.counts.diagnostics}</strong> diagnostics</span>
      </div>
      <div className="berrymark-review-details">
        <details open={review.unresolved.length > 0}>
          <summary>Unresolved items ({review.unresolved.length})</summary>
          {review.unresolved.length === 0 ? <p>No unresolved items were reported.</p> : <ul>{review.unresolved.map((item, index) => <li key={`${item.path}-${index}`}><strong>{item.path}</strong>{item.line !== undefined && <span> · line {item.line}</span>}<p>{item.message}</p></li>)}</ul>}
        </details>
        <details>
          <summary>Editorial annotations ({review.annotations.length})</summary>
          {review.annotations.length === 0 ? <p>No editorial annotations were reported.</p> : <ul>{review.annotations.map((item, index) => <li key={`${item.kind}-${item.line ?? index}-${index}`}><strong>{item.kind}</strong> · {item.status}{item.line !== undefined && <span> · line {item.line}</span>}{item.text && <p>{item.text}</p>}</li>)}</ul>}
        </details>
      </div>
    </section>
  )
}

export function BerryMarkLocalPreview() {
  const [preview, setPreview] = useState<BerryMarkLocalPreview | null>(null)
  const [issues, setIssues] = useState<BerryMarkPreviewIssue[]>([])
  const [fileName, setFileName] = useState('')
  const [isReading, setIsReading] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const selectionToken = useRef(0)
  const screenHeading = useRef<HTMLHeadingElement>(null)

  const screen = preview?.challenge.screens[currentIndex]

  useEffect(() => {
    if (!preview || !screen) return
    window.scrollTo({ top: 0, behavior: 'instant' })
    screenHeading.current?.focus({ preventScroll: true })
  }, [preview, currentIndex, screen])

  const clearPreview = () => {
    selectionToken.current += 1
    setPreview(null)
    setIssues([])
    setFileName('')
    setCurrentIndex(0)
    setIsReading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  const loadFile = async (file: File | undefined) => {
    if (!file) return
    const token = ++selectionToken.current
    setIsReading(true)
    setIssues([])
    setPreview(null)
    setCurrentIndex(0)
    setFileName(file.name)
    try {
      const source = await file.text()
      if (token !== selectionToken.current) return
      const result = parseBerryMarkCompilerResult(source)
      if (result.ok) setPreview(result.preview)
      else setIssues(result.failure.issues)
    } catch (error) {
      if (token !== selectionToken.current) return
      setIssues([{ path: 'file', message: `The selected file could not be read. ${error instanceof Error ? error.message : 'Unknown file error.'}` }])
    } finally {
      if (token === selectionToken.current) setIsReading(false)
    }
  }

  return (
    <div className="standard-page interactive-challenge-lab sanity-challenge-lab berrymark-local-preview">
      <div className="berrymark-preview-banner" role="note">
        <FlaskConical size={21} aria-hidden="true" />
        <div><strong>LOCAL UNPUBLISHED PREVIEW — NOT APPROVED OR IMPORTED</strong><p>Browser-memory only. No Sanity write, catalog insertion, saved Challenge, My Scripture change, completion record, or persistent screen position.</p></div>
      </div>

      <section className="berrymark-file-picker" aria-labelledby="berrymark-file-heading">
        <div>
          <span className="section-label">BerryMark Local Preview</span>
          <h1 id="berrymark-file-heading">Preview a compiled Challenge locally.</h1>
          <p>Choose a complete BerryMark compiler result containing <code>sanityCandidate</code> and <code>reviewReport</code>. The file stays in this tab and is never uploaded or persisted.</p>
        </div>
        <div className="berrymark-file-picker__actions">
          <label className={`button button--secondary ${isReading ? 'is-disabled' : ''}`}>
            <FileJson size={17} aria-hidden="true" /> {isReading ? 'Reading local file…' : 'Choose compiled JSON'}
            <input
              ref={inputRef}
              className="berrymark-file-input"
              type="file"
              accept=".json,application/json"
              disabled={isReading}
              onChange={event => void loadFile(event.target.files?.[0])}
            />
          </label>
          {(preview || fileName || issues.length > 0) && <button type="button" className="button button--text danger-link" onClick={clearPreview}><Trash2 size={16} aria-hidden="true" /> Clear local preview</button>}
        </div>
        {fileName && <p className="berrymark-selected-file">Selected local file: <strong>{fileName}</strong></p>}
        {issues.length > 0 && <div className="berrymark-preview-errors" role="alert"><AlertTriangle size={21} aria-hidden="true" /><div><strong>This file cannot be previewed</strong><ul>{issues.map((issue, index) => <li key={`${issue.path}-${index}`}><code>{issue.path}</code>: {issue.message}</li>)}</ul></div></div>}
      </section>

      {preview && screen && <>
        <BerryMarkReviewPanel review={preview.review} />

        <header className="lab-challenge-header berrymark-challenge-header">
          <div>
            <p className="eyebrow">BERRYMARK LOCAL PREVIEW · {preview.challenge.challengeType.toUpperCase()}</p>
            <h2>{preview.challenge.title}</h2>
            {preview.challenge.summary && <p className="cms-challenge-summary">{preview.challenge.summary}</p>}
            <ul className="berrymark-publishing-state" aria-label="Unresolved or authored publishing metadata">
              <li>Series unresolved</li>
              <li>{preview.challenge.publishing.sequence === null ? 'Sequence unassigned' : `Sequence ${preview.challenge.publishing.sequence}`}</li>
              <li>{preview.challenge.publishing.releaseAt ?? 'Release not assigned.'}</li>
            </ul>
          </div>
        </header>

        <CmsScripturePanel scripture={preview.challenge.primaryScripture} primary preview />

        <div className="lab-progress">
          <div><span>Preview screen</span><strong>{currentIndex + 1} of {preview.challenge.screens.length}</strong></div>
          <div className="lab-progress__segments" role="progressbar" aria-label="Local preview screen position" aria-valuemin={1} aria-valuemax={preview.challenge.screens.length} aria-valuenow={currentIndex + 1} aria-valuetext={`${currentIndex + 1} of ${preview.challenge.screens.length}`}>{preview.challenge.screens.map((item, index) => <span key={item.id} className={index <= currentIndex ? 'is-filled' : ''} />)}</div>
        </div>

        <article className="lab-screen" key={screen.id} aria-labelledby={`${screen.id}-preview-title`}>
          <p className="eyebrow">{screen.stepLabel}</p>
          <h2 id={`${screen.id}-preview-title`} ref={screenHeading} tabIndex={-1}>{screen.title}</h2>
          <div className="lab-screen__blocks">{screen.blocks.map(block => <CmsBlockView key={block.id} block={block} preview />)}</div>
        </article>

        <nav className="lab-screen-nav" aria-label="Local preview screen navigation">
          <button type="button" className="button button--secondary" disabled={currentIndex === 0} onClick={() => setCurrentIndex(index => Math.max(0, index - 1))}><ArrowLeft size={17} /> Back</button>
          {currentIndex < preview.challenge.screens.length - 1
            ? <button type="button" className="button button--primary" onClick={() => setCurrentIndex(index => Math.min(preview.challenge.screens.length - 1, index + 1))}>Continue <ArrowRight size={17} /></button>
            : <button type="button" className="button button--primary" onClick={clearPreview}><Trash2 size={16} /> Finish and clear preview</button>}
        </nav>
        <p className="lab-navigation-note">Read-only local navigation. Position and completion are not saved. Optional studies and reflection choices remain local to this screen.</p>
        <CmsCompanionLinks links={preview.challenge.companionLinks} />
      </>}
    </div>
  )
}
