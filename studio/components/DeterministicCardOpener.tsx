import {useState, type CSSProperties} from 'react'
import {usePaneRouter} from 'sanity/structure'
import {SCRIPTURE_CARD_TEMPLATE_ID} from '../initialValues/templates'
import {parseDeterministicCardTarget} from '../structureHelpers'

const containerStyle: CSSProperties = {
  padding: '20px',
  maxWidth: '560px',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
}

const titleStyle: CSSProperties = {
  margin: '0 0 8px',
  fontSize: '18px',
  fontWeight: 600,
}

const descriptionStyle: CSSProperties = {
  margin: '0 0 16px',
  fontSize: '14px',
  lineHeight: 1.5,
  opacity: 0.85,
}

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 600,
  marginBottom: '6px',
}

const inputStyle: CSSProperties = {
  width: '280px',
  padding: '8px 10px',
  fontSize: '14px',
  border: '1px solid currentColor',
  borderRadius: '4px',
  background: 'transparent',
  color: 'inherit',
}

const metaBoxStyle: CSSProperties = {
  margin: '16px 0',
  padding: '12px 14px',
  border: '1px solid rgba(128, 128, 128, 0.35)',
  borderRadius: '6px',
  fontSize: '13px',
  lineHeight: 1.6,
}

const actionRowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  marginTop: '16px',
}

const linkBoxStyle: CSSProperties = {
  display: 'inline-block',
  padding: '10px 14px',
  borderRadius: '6px',
  border: '1px solid currentColor',
  fontWeight: 600,
  fontSize: '14px',
}

export function DeterministicCardOpener() {
  const {ChildLink} = usePaneRouter()
  const [rawSlug, setRawSlug] = useState('2027-03-vineyard-imagery')
  const parsed = parseDeterministicCardTarget(rawSlug)

  return (
    <div style={containerStyle}>
      <h2 style={titleStyle}>Open or Create Scripture Card by Slug</h2>
      <p style={descriptionStyle}>
        Every Scripture Card uses a deterministic document ID (<code>card-&lt;slug&gt;</code>).
        Re-entering an existing slug reopens the same document without creating duplicates.
      </p>

      <label htmlFor="deterministic-card-slug-input" style={labelStyle}>
        Card slug (lowercase hyphenated, without card- prefix)
      </label>
      <input
        id="deterministic-card-slug-input"
        type="text"
        value={rawSlug}
        placeholder="2027-03-vineyard-imagery"
        style={inputStyle}
        onChange={event => setRawSlug(event.target.value)}
      />

      {!parsed.ok ? (
        <div role="alert" style={metaBoxStyle}>
          {parsed.error}
        </div>
      ) : (
        <>
          <div style={metaBoxStyle}>
            <div>
              <strong>Card slug:</strong> <code>{parsed.target.slug}</code>
            </div>
            <div>
              <strong>Card document ID:</strong> <code>{parsed.target.cardDocumentId}</code>
            </div>
          </div>

          <div style={actionRowStyle}>
            <ChildLink
              childId={parsed.target.cardDocumentId}
              childParameters={{
                type: 'scriptureCard',
                template: SCRIPTURE_CARD_TEMPLATE_ID,
              }}
              childPayload={{slug: parsed.target.slug}}
            >
              <span style={linkBoxStyle}>
                Open or Create Scripture Card ({parsed.target.cardDocumentId})
              </span>
            </ChildLink>
          </div>
        </>
      )}
    </div>
  )
}
