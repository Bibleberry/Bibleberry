import {useState, type CSSProperties} from 'react'
import {usePaneRouter} from 'sanity/structure'
import {
  MONTHLY_PREVIEW_NEWS_TEMPLATE_ID,
  MONTHLY_PUBLICATION_TEMPLATE_ID,
} from '../initialValues/templates'
import {parseDeterministicMonthTarget} from '../structureHelpers'

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
  width: '180px',
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

export function DeterministicMonthOpener() {
  const {ChildLink} = usePaneRouter()
  const [rawYearMonth, setRawYearMonth] = useState('2027-03')
  const parsed = parseDeterministicMonthTarget(rawYearMonth)

  return (
    <div style={containerStyle}>
      <h2 style={titleStyle}>Open or Create Month by YYYY-MM</h2>
      <p style={descriptionStyle}>
        Every monthly publication uses a deterministic document ID (<code>month-YYYY-MM</code>) and
        every advance-preview News draft uses <code>news-preview-YYYY-MM</code>. Re-entering an
        existing month reopens the same document without creating duplicates.
      </p>

      <label htmlFor="deterministic-year-month-input" style={labelStyle}>
        Publication month (YYYY-MM)
      </label>
      <input
        id="deterministic-year-month-input"
        type="text"
        value={rawYearMonth}
        placeholder="YYYY-MM"
        style={inputStyle}
        onChange={event => setRawYearMonth(event.target.value)}
      />

      {!parsed.ok ? (
        <div role="alert" style={metaBoxStyle}>
          {parsed.error}
        </div>
      ) : (
        <>
          <div style={metaBoxStyle}>
            <div>
              <strong>Month document ID:</strong> <code>{parsed.target.monthDocumentId}</code>
            </div>
            <div>
              <strong>Calendar slots initialized:</strong> {parsed.target.dayCount} days
            </div>
            <div>
              <strong>Preview News ID:</strong> <code>{parsed.target.previewNewsDocumentId}</code>
            </div>
            <div>
              <strong>Earliest preview publish date:</strong>{' '}
              <code>{parsed.target.previewStartDate}</code>
            </div>
          </div>

          <div style={actionRowStyle}>
            <ChildLink
              childId={parsed.target.monthDocumentId}
              childParameters={{
                type: 'monthlyPublication',
                template: MONTHLY_PUBLICATION_TEMPLATE_ID,
              }}
              childPayload={{yearMonth: parsed.target.yearMonth}}
            >
              <span style={linkBoxStyle}>
                Open or Create Monthly Publication ({parsed.target.monthDocumentId})
              </span>
            </ChildLink>

            <ChildLink
              childId={parsed.target.previewNewsDocumentId}
              childParameters={{
                type: 'newsArticle',
                template: MONTHLY_PREVIEW_NEWS_TEMPLATE_ID,
              }}
              childPayload={{yearMonth: parsed.target.yearMonth}}
            >
              <span style={linkBoxStyle}>
                Open or Create Advance Preview News ({parsed.target.previewNewsDocumentId})
              </span>
            </ChildLink>
          </div>
        </>
      )}
    </div>
  )
}
