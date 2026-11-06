import { useState } from 'react'
import { PortableText, type PortableTextComponents } from '@portabletext/react'
import {
  ArrowDown, ArrowRight, BookOpen, Bookmark, BookmarkCheck, ChevronDown, ExternalLink, RotateCcw,
} from 'lucide-react'
import { presentCmsScripture } from '../../cms/sanity/presentation.ts'
import type {
  CmsBlock,
  CmsCompanionLink,
  CmsPortableText,
  CmsScripture,
} from '../../cms/sanity/types.ts'

/**
 * Shared, production-safe renderers for validated CMS-shaped Challenge content.
 *
 * These views are presentation only: they do not fetch content, read or write browser storage,
 * or know which host (Developer Studio Lab, read-only local preview, or a future reader route)
 * is displaying them. Hosts supply saved-state lookups and callbacks explicitly.
 */

/**
 * Host-owned Scripture save controls. When omitted, Scripture renders without any save action,
 * which is how read-only previews avoid gaining reader writes.
 */
export type CmsScriptureSaveControls = {
  isSaved: (scripture: CmsScripture) => boolean
  onToggle: (scripture: CmsScripture) => void
  /** Collection name used in accessible labels, for example "CMS My Scripture". */
  collectionLabel: string
}

export type CmsContentRenderOptions = {
  scriptureSave?: CmsScriptureSaveControls
  /**
   * Read-only local preview presentation: shows editorial "proposed" badges and local-file
   * practice wording. It never enables saving, completion, or persistence.
   */
  preview?: boolean
}

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

export function CmsPortableTextView({ value }: { value: CmsPortableText }) {
  return <div className="longform cms-portable-text"><PortableText value={value} components={portableTextComponents} /></div>
}

function CmsScriptureSaveButton({ scripture, controls }: {
  scripture: CmsScripture
  controls: CmsScriptureSaveControls
}) {
  const saved = controls.isSaved(scripture)
  return (
    <button
      type="button"
      className={`button ${saved ? 'button--text' : 'button--secondary'} lab-scripture-save`}
      aria-pressed={saved}
      aria-label={`${saved ? 'Remove' : 'Add'} ${scripture.reference} ${saved ? 'from' : 'to'} ${controls.collectionLabel}`}
      onClick={() => controls.onToggle(scripture)}
    >
      {saved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
      {saved ? 'Remove from My Scripture' : 'Add to My Scripture'}
    </button>
  )
}

export function CmsScripturePanel({ scripture, primary = false, scriptureSave, preview = false }: {
  scripture: CmsScripture
  primary?: boolean
} & CmsContentRenderOptions) {
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
        {scriptureSave && <CmsScriptureSaveButton scripture={scripture} controls={scriptureSave} />}
        <small>{scripture.practiceStatus === 'configured'
          ? `${preview ? 'Practice configured in the local file' : 'Practice configured in Sanity'} · CMS memorization practice is not available in this view`
          : 'Memorization practice not configured'}</small>
      </div>
    </section>
  )
}

function CmsOptionalStudy({ block, scriptureSave, preview }: {
  block: Extract<CmsBlock, { type: 'optionalExploration' }>
} & CmsContentRenderOptions) {
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
          <CmsScripturePanel key={scripture.id} scripture={scripture} scriptureSave={scriptureSave} preview={preview} />
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

function CmsProposedBadge({ block }: { block: CmsBlock }) {
  if (block.reviewStatus !== 'proposed') return null
  return <span className="cms-proposed-badge">Proposed block · Not approved</span>
}

/** Render one of the nine CMS Content Block concepts in authored order and at full length. */
export function CmsBlockView({ block, scriptureSave, preview = false }: { block: CmsBlock } & CmsContentRenderOptions) {
  switch (block.type) {
    case 'scripture':
      return <CmsScripturePanel scripture={block.scripture} scriptureSave={scriptureSave} preview={preview} />
    case 'teachingText':
      return <section className="lab-teaching-text"><CmsPortableTextView value={block.body} /></section>
    case 'statement':
      return <section className="lab-statement">{block.label && <span className="section-label">{block.label}</span>}<p>{block.text}</p></section>
    case 'contrast':
      return <section className="lab-contrast">{preview && <CmsProposedBadge block={block} />}<div>{[block.left, block.right].map(side => <article key={side.title}><h3>{side.title}</h3><CmsPortableTextView value={side.body} /></article>)}</div>{block.footer && <p>{block.footer}</p>}</section>
    case 'visualCards':
      return <section className="lab-visual-cards">{preview && <CmsProposedBadge block={block} />}<div>{block.cards.map(card => <article key={card.id}><h3>{card.title}</h3>{card.body && <p>{card.body}</p>}</article>)}</div></section>
    case 'connectedSequence':
      return <>{preview && <CmsProposedBadge block={block} />}<CmsSequence block={block} /></>
    case 'reflectionChoice':
      return <>{preview && <CmsProposedBadge block={block} />}<CmsReflection block={block} /></>
    case 'optionalExploration':
      return <>{preview && <CmsProposedBadge block={block} />}<CmsOptionalStudy block={block} scriptureSave={scriptureSave} preview={preview} /></>
    case 'prayer':
      return <section className="prayer-section lab-prayer" aria-labelledby={`${block.id}-title`}><span className="section-label" id={`${block.id}-title`}>Prayer</span>{block.paragraphs.map((paragraph, index) => <p key={`${block.id}-${index}`}>{paragraph}</p>)}</section>
  }
}

export function CmsCompanionLinks({ links }: { links: CmsCompanionLink[] }) {
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
