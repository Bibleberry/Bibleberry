import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react'
import {useClient, useWorkspace} from 'sanity'
import {usePaneRouter} from 'sanity/structure'
import {
  MONTHLY_PREVIEW_NEWS_TEMPLATE_ID,
  MONTHLY_PUBLICATION_TEMPLATE_ID,
  SCRIPTURE_CARD_TEMPLATE_ID,
} from '../initialValues/templates'
import {isValidTargetYearMonth} from '../readiness/evaluateReadiness'
import {inspectMonthlyReadiness} from '../readiness/fetchReadinessData'
import type {
  EditorDocumentTarget,
  MonthlyReadinessReport,
  OverallReadinessStatus,
  ReadinessFinding,
  ReadinessSeverity,
  ReadOnlySanityClient,
} from '../readiness/types'

export type EditorLinkRenderer = (target: EditorDocumentTarget) => ReactNode

export interface MonthlyReadinessInspectorProps {
  options?: {
    yearMonth?: string
  }
}

export interface MonthlyReadinessViewProps {
  yearMonthInput: string
  onYearMonthInputChange: (nextValue: string) => void
  onSubmitYearMonth: (event: FormEvent) => void
  onRefresh: () => void
  loading: boolean
  report: MonthlyReadinessReport | null
  renderEditorLink?: EditorLinkRenderer
}

const containerStyle: CSSProperties = {
  padding: '20px',
  maxWidth: '960px',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  lineHeight: 1.5,
}

const headerRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: '12px',
  marginBottom: '14px',
}

const titleStyle: CSSProperties = {
  margin: '0 0 4px',
  fontSize: '19px',
  fontWeight: 700,
}

const subtitleStyle: CSSProperties = {
  margin: 0,
  fontSize: '13px',
  opacity: 0.85,
}

const disclaimerBoxStyle: CSSProperties = {
  padding: '10px 14px',
  borderRadius: '6px',
  border: '1px solid #64748b',
  backgroundColor: '#f8fafc',
  color: '#0f172a',
  fontSize: '12.5px',
  marginBottom: '16px',
}

const controlsFormStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'flex-end',
  gap: '10px',
  marginBottom: '16px',
}

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: '12.5px',
  fontWeight: 600,
  marginBottom: '4px',
}

const inputStyle: CSSProperties = {
  width: '140px',
  padding: '7px 10px',
  fontSize: '14px',
  borderRadius: '4px',
  border: '1px solid #64748b',
  backgroundColor: '#ffffff',
  color: '#0f172a',
}

const buttonStyle: CSSProperties = {
  padding: '8px 14px',
  fontSize: '13px',
  fontWeight: 600,
  borderRadius: '5px',
  border: '1px solid #334155',
  backgroundColor: '#1e293b',
  color: '#ffffff',
  cursor: 'pointer',
}

const secondaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  backgroundColor: '#ffffff',
  color: '#0f172a',
}

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '12px',
  marginBottom: '18px',
}

const cardStyle: CSSProperties = {
  padding: '12px 14px',
  borderRadius: '6px',
  border: '1px solid #cbd5e1',
  backgroundColor: '#ffffff',
  color: '#0f172a',
  fontSize: '13px',
}

const cardHeadingStyle: CSSProperties = {
  margin: '0 0 6px',
  fontSize: '13px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  color: '#334155',
}

const sectionHeadingStyle: CSSProperties = {
  margin: '20px 0 10px',
  fontSize: '15px',
  fontWeight: 700,
}

const findingRowStyle: CSSProperties = {
  padding: '10px 12px',
  borderRadius: '6px',
  border: '1px solid #cbd5e1',
  backgroundColor: '#ffffff',
  color: '#0f172a',
  marginBottom: '8px',
  fontSize: '13px',
}

const tableWrapStyle: CSSProperties = {
  overflowX: 'auto',
  border: '1px solid #cbd5e1',
  borderRadius: '6px',
  backgroundColor: '#ffffff',
  color: '#0f172a',
}

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '12.5px',
  textAlign: 'left',
}

const thStyle: CSSProperties = {
  padding: '8px 10px',
  borderBottom: '1px solid #cbd5e1',
  backgroundColor: '#f1f5f9',
  color: '#0f172a',
  fontWeight: 700,
}

const tdStyle: CSSProperties = {
  padding: '7px 10px',
  borderBottom: '1px solid #e2e8f0',
  verticalAlign: 'top',
}

const STATUS_BADGE_MAP: Record<
  OverallReadinessStatus,
  {label: string; prefix: string; bg: string; fg: string; border: string}
> = {
  unknown: {
    label: 'Unknown / Unverified',
    prefix: '[?]',
    bg: '#f1f5f9',
    fg: '#0f172a',
    border: '#475569',
  },
  blocked: {
    label: 'Blocked — Remaining Requirements',
    prefix: '[!]',
    bg: '#fef2f2',
    fg: '#7f1d1d',
    border: '#b91c1c',
  },
  needsReview: {
    label: 'Needs Review / Incomplete',
    prefix: '[~]',
    bg: '#fffbeb',
    fg: '#78350f',
    border: '#b45309',
  },
  checksPass: {
    label: 'Operational Checks Clear (Not Publish/Release Authorization)',
    prefix: '[OK]',
    bg: '#f0fdf4',
    fg: '#14532d',
    border: '#15803d',
  },
}

const SEVERITY_BADGE_MAP: Record<
  ReadinessSeverity,
  {label: string; bg: string; fg: string; border: string}
> = {
  unknown: {label: 'UNKNOWN', bg: '#e2e8f0', fg: '#0f172a', border: '#475569'},
  blocking: {label: 'BLOCKING', bg: '#fee2e2', fg: '#7f1d1d', border: '#b91c1c'},
  needsReview: {label: 'NEEDS REVIEW', bg: '#fef3c7', fg: '#78350f', border: '#b45309'},
  informational: {label: 'INFO', bg: '#eff6ff', fg: '#1e3a8a', border: '#1d4ed8'},
}

const SEVERITY_ORDER: Record<ReadinessSeverity, number> = {
  unknown: 0,
  blocking: 1,
  needsReview: 2,
  informational: 3,
}

function getDefaultYearMonth(): string {
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const candidate = `${year}-${month}`
  return isValidTargetYearMonth(candidate) ? candidate : '2027-03'
}

function formatPresenceLabel(presence: string): string {
  switch (presence) {
    case 'missing':
      return 'Missing'
    case 'draftOnly':
      return 'Draft only (unpublished)'
    case 'publishedSynced':
      return 'Published (no draft overlay)'
    case 'publishedWithDraftEdits':
      return 'Published + unpublished draft edits'
    case 'unassigned':
      return 'Unassigned'
    default:
      return presence
  }
}

function makeBadgeStyle(colors: {bg: string; fg: string; border: string}): CSSProperties {
  return {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '4px',
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.bg,
    color: colors.fg,
    fontSize: '11.5px',
    fontWeight: 700,
    lineHeight: 1.4,
  }
}

function sortFindings(findings: ReadinessFinding[]): ReadinessFinding[] {
  return [...findings].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
}

export function MonthlyReadinessView({
  yearMonthInput,
  onYearMonthInputChange,
  onSubmitYearMonth,
  onRefresh,
  loading,
  report,
  renderEditorLink,
}: MonthlyReadinessViewProps) {
  const [severityFilter, setSeverityFilter] = useState<'all' | ReadinessSeverity>('all')
  const [showSlotDetails, setShowSlotDetails] = useState(true)

  const sortedFindings = useMemo(
    () => (report ? sortFindings(report.findings) : []),
    [report],
  )
  const visibleFindings = useMemo(
    () =>
      severityFilter === 'all'
        ? sortedFindings
        : sortedFindings.filter(item => item.severity === severityFilter),
    [severityFilter, sortedFindings],
  )

  const statusConfig = report ? STATUS_BADGE_MAP[report.overallStatus] : null

  return (
    <section
      aria-label="Monthly editorial readiness inspector"
      aria-busy={loading ? 'true' : 'false'}
      style={containerStyle}
    >
      <div style={headerRowStyle}>
        <div>
          <h2 style={titleStyle}>Monthly Editorial Readiness Inspector</h2>
          <p style={subtitleStyle}>
            Read-only preparation, review, finalization, and scheduling checklist for Sanity Studio.
          </p>
        </div>
        {report && (
          <div style={makeBadgeStyle({bg: '#f1f5f9', fg: '#0f172a', border: '#475569'})}>
            Dataset: <strong>{report.dataset || 'unset'}</strong>{' '}
            {report.datasetAuthorized ? '(authorized)' : '(UNVERIFIED / BLOCKED)'}
          </div>
        )}
      </div>

      <div style={disclaimerBoxStyle} role="note">
        <strong>Authority boundary:</strong>{' '}
        {report?.authorityDisclaimer ??
          'Read-only operational readiness inspector. Does not approve, finalize, publish, or authorize reader release; Sanity Studio publish validation and the Cloudflare Release Gateway embargo rules remain authoritative.'}
      </div>

      <form onSubmit={onSubmitYearMonth} style={controlsFormStyle}>
        <div>
          <label htmlFor="readiness-year-month-input" style={labelStyle}>
            Publication month (YYYY-MM)
          </label>
          <input
            id="readiness-year-month-input"
            type="text"
            value={yearMonthInput}
            placeholder="2027-03"
            style={inputStyle}
            onChange={event => onYearMonthInputChange(event.target.value)}
          />
        </div>
        <button type="submit" style={buttonStyle} disabled={loading}>
          Inspect month
        </button>
        <button
          type="button"
          style={secondaryButtonStyle}
          disabled={loading}
          onClick={onRefresh}
        >
          {loading ? 'Checking…' : report?.overallStatus === 'unknown' ? 'Retry check' : 'Refresh'}
        </button>
      </form>

      {loading && (
        <div role="status" aria-live="polite" style={disclaimerBoxStyle}>
          Loading read-only metadata from Sanity (published and draft perspectives)…
        </div>
      )}

      {report && (
        <>
          {statusConfig && (
            <div
              role={report.overallStatus === 'unknown' ? 'alert' : 'status'}
              style={{
                padding: '12px 14px',
                borderRadius: '6px',
                border: `2px solid ${statusConfig.border}`,
                backgroundColor: statusConfig.bg,
                color: statusConfig.fg,
                marginBottom: '16px',
              }}
            >
              <div style={{fontSize: '15px', fontWeight: 700}}>
                {statusConfig.prefix} {statusConfig.label} — <code>{report.expectedMonthDocumentId}</code>
              </div>
              <div style={{fontSize: '12.5px', marginTop: '4px'}}>
                Blocking: <strong>{report.counts.blocking}</strong> · Needs review:{' '}
                <strong>{report.counts.needsReview}</strong> · Unknown:{' '}
                <strong>{report.counts.unknown}</strong> · Informational:{' '}
                <strong>{report.counts.informational}</strong>
              </div>
              <div style={{fontSize: '12px', marginTop: '4px'}}>
                {report.schemaValidationDisclaimer}
              </div>
            </div>
          )}

          {!report.monthSummary.exists && report.overallStatus !== 'unknown' && (
            <div style={findingRowStyle}>
              <strong>Empty month state:</strong> No draft or published document exists yet at{' '}
              <code>{report.expectedMonthDocumentId}</code>.
              {report.monthSummary.editorTarget && renderEditorLink && (
                <div style={{marginTop: '8px'}}>
                  {renderEditorLink(report.monthSummary.editorTarget)}
                </div>
              )}
            </div>
          )}

          <div style={gridStyle}>
            <div style={cardStyle}>
              <h3 style={cardHeadingStyle}>Month Identity &amp; Review</h3>
              <div>
                <strong>Document:</strong> <code>{report.expectedMonthDocumentId}</code>
              </div>
              <div>
                <strong>Presence:</strong> {formatPresenceLabel(report.monthSummary.presence)}
              </div>
              <div>
                <strong>Active view:</strong> {report.monthSummary.activeSourcePerspective}
              </div>
              <div>
                <strong>Editorial status:</strong>{' '}
                <code>{report.monthSummary.editorialStatus ?? 'unset'}</code>
              </div>
              <div>
                <strong>Month withdrawn:</strong> {report.monthSummary.withdrawn ? 'YES' : 'No'}
              </div>
              <div>
                <strong>Reviewer role:</strong>{' '}
                <code>{report.monthSummary.reviewerRole ?? 'unset'}</code>
              </div>
              {report.monthSummary.editorTarget && renderEditorLink && (
                <div style={{marginTop: '8px'}}>
                  {renderEditorLink(report.monthSummary.editorTarget)}
                </div>
              )}
            </div>

            <div style={cardStyle}>
              <h3 style={cardHeadingStyle}>Calendar Slots ({report.calendarSummary.expectedDays}d)</h3>
              <div>
                <strong>Present slots:</strong> {report.calendarSummary.presentSlots} /{' '}
                {report.calendarSummary.expectedDays}
              </div>
              <div>
                <strong>Scheduled:</strong> {report.calendarSummary.scheduledSlots} ·{' '}
                <strong>Withdrawn:</strong> {report.calendarSummary.withdrawnSlots}
              </div>
              <div>
                <strong>Unassigned:</strong> {report.calendarSummary.unassignedSlots}
              </div>
              <div>
                <strong>Intra-month duplicates:</strong>{' '}
                {report.calendarSummary.duplicateIntraMonthRefs}
              </div>
              <div>
                <strong>Cross-month collisions:</strong>{' '}
                {report.calendarSummary.crossMonthPublishedCollisions} published /{' '}
                {report.calendarSummary.crossMonthDraftCollisions} draft
              </div>
            </div>

            <div style={cardStyle}>
              <h3 style={cardHeadingStyle}>Linked Challenges</h3>
              <div>
                <strong>Distinct active:</strong> {report.challengeSummary.distinctScheduledCount}
              </div>
              <div>
                <strong>Published &amp; ready:</strong> {report.challengeSummary.publishedAndReadyCount}
              </div>
              <div>
                <strong>Draft-only:</strong> {report.challengeSummary.draftOnlyCount} ·{' '}
                <strong>Missing:</strong> {report.challengeSummary.missingCount}
              </div>
              <div>
                <strong>Unreviewed / unapproved blocks:</strong>{' '}
                {report.challengeSummary.unreviewedOrUnapprovedCount}
              </div>
              <div>
                <strong>Withdrawn:</strong> {report.challengeSummary.withdrawnCount} ·{' '}
                <strong>Rights issues:</strong> {report.challengeSummary.scriptureRightsIssuesCount}
              </div>
              <div>
                <strong>Published w/ draft edits:</strong>{' '}
                {report.challengeSummary.draftPendingEditsCount}
              </div>
            </div>

            <div style={cardStyle}>
              <h3 style={cardHeadingStyle}>Intro, Preview &amp; News</h3>
              <div>
                <strong>Preview screens:</strong> {report.introductionSummary.previewScreenCount}{' '}
                ({report.introductionSummary.previewScreensMissingBlocksCount} empty)
              </div>
              <div>
                <strong>Welcome screen:</strong>{' '}
                {report.introductionSummary.hasWelcomeScreen
                  ? `${report.introductionSummary.welcomeBlockCount} block(s)`
                  : 'Missing'}
              </div>
              <div>
                <strong>Advance preview opens:</strong>{' '}
                <code>{report.introductionSummary.advancePreviewStartDate ?? 'N/A'}</code>
              </div>
              <div>
                <strong>Month starts:</strong>{' '}
                <code>{report.introductionSummary.monthStartDate ?? 'N/A'}</code>
              </div>
              <div>
                <strong>Preview News:</strong>{' '}
                {formatPresenceLabel(report.previewNewsSummary.presence)}
              </div>
              {renderEditorLink && (
                <div style={{marginTop: '8px'}}>
                  {renderEditorLink(report.previewNewsSummary.editorTarget)}
                </div>
              )}
            </div>

            <div style={cardStyle}>
              <h3 style={cardHeadingStyle}>Discoveries &amp; Cards</h3>
              <div>
                <strong>Thematic discoveries:</strong> {report.discoveryAndCardSummary.discoveryCount}
              </div>
              <div>
                <strong>V-DISC-SUBSET violations:</strong>{' '}
                {report.discoveryAndCardSummary.subsetViolationsCount}
              </div>
              <div>
                <strong>Linked Cards ready (published):</strong>{' '}
                {report.discoveryAndCardSummary.publishedApprovedCardCount} /{' '}
                {report.discoveryAndCardSummary.linkedCardCount}
              </div>
              <div>
                <strong>Full-month Card:</strong>{' '}
                <code>{report.discoveryAndCardSummary.fullMonthCardStatus}</code>
              </div>
              <div>
                <strong>Legacy reservedCardId:</strong>{' '}
                {report.discoveryAndCardSummary.legacyReservedCardCount} ·{' '}
                <strong>Unlinked:</strong>{' '}
                {report.discoveryAndCardSummary.unlinkedDiscoveryOrFullMonthCount}
              </div>
            </div>

            <div style={cardStyle}>
              <h3 style={cardHeadingStyle}>Roster Finalization</h3>
              <div>
                <strong>Finalized:</strong> {report.finalizationSummary.isFinalized ? 'Yes' : 'No'}
              </div>
              <div>
                <strong>Roster version:</strong>{' '}
                {report.finalizationSummary.rosterVersion ?? 'unset'}
              </div>
              <div>
                <strong>Finalized IDs:</strong>{' '}
                {report.finalizationSummary.finalizedChallengeIdsCount} (
                {report.finalizationSummary.matchesActiveScheduledSlots
                  ? 'matches active slots'
                  : 'MISMATCH'}
                )
              </div>
              <div>
                <strong>Prior rosters:</strong> {report.finalizationSummary.priorRostersCount}
              </div>
              <div>
                <strong>Finalized by:</strong>{' '}
                {report.finalizationSummary.finalizedBy ?? 'unset'}
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <h3 style={sectionHeadingStyle}>Findings ({visibleFindings.length})</h3>
            <div style={{display: 'flex', flexWrap: 'wrap', gap: '6px'}} role="group" aria-label="Filter findings by severity">
              {(['all', 'unknown', 'blocking', 'needsReview', 'informational'] as const).map(
                option => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={severityFilter === option}
                    style={{
                      ...secondaryButtonStyle,
                      padding: '4px 10px',
                      fontSize: '12px',
                      backgroundColor: severityFilter === option ? '#1e293b' : '#ffffff',
                      color: severityFilter === option ? '#ffffff' : '#0f172a',
                    }}
                    onClick={() => setSeverityFilter(option)}
                  >
                    {option === 'all'
                      ? `All (${sortedFindings.length})`
                      : `${SEVERITY_BADGE_MAP[option].label} (${report.counts[option]})`}
                  </button>
                ),
              )}
            </div>
          </div>

          {visibleFindings.length === 0 ? (
            <div style={findingRowStyle}>No findings in this filter.</div>
          ) : (
            <ul style={{listStyle: 'none', padding: 0, margin: 0}}>
              {visibleFindings.map(finding => {
                const badge = SEVERITY_BADGE_MAP[finding.severity]
                return (
                  <li key={finding.id} style={findingRowStyle}>
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '4px',
                      }}
                    >
                      <span style={makeBadgeStyle(badge)}>{badge.label}</span>
                      <span style={{fontSize: '12px', fontWeight: 600, color: '#334155'}}>
                        {finding.category} · perspective: {finding.perspective}
                        {finding.path ? ` · ${finding.path}` : ''}
                      </span>
                    </div>
                    <div>{finding.message}</div>
                    {finding.editorTarget && renderEditorLink && (
                      <div style={{marginTop: '6px'}}>{renderEditorLink(finding.editorTarget)}</div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {report.discoveries.length > 0 && (
            <>
              <h3 style={sectionHeadingStyle}>
                Monthly Discoveries ({report.discoveries.length})
              </h3>
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th scope="col" style={thStyle}>Discovery</th>
                      <th scope="col" style={thStyle}>Qualifying</th>
                      <th scope="col" style={thStyle}>V-DISC-SUBSET</th>
                      <th scope="col" style={thStyle}>Card Link</th>
                      <th scope="col" style={thStyle}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.discoveries.map(disc => (
                      <tr key={disc.key}>
                        <td style={tdStyle}>
                          <strong>{disc.title || disc.discoverySlug || disc.key}</strong>
                          {disc.discoverySlug && (
                            <div style={{fontSize: '11.5px', color: '#475569'}}>
                              <code>{disc.discoverySlug}</code>
                            </div>
                          )}
                        </td>
                        <td style={tdStyle}>{disc.qualifyingCount}</td>
                        <td style={tdStyle}>{disc.subsetValid ? 'Valid' : 'Violation'}</td>
                        <td style={tdStyle}>
                          {disc.cardLinkKind}
                          {disc.cardBaseId ? ` (${disc.cardBaseId})` : ''}
                          {disc.cardPresence ? ` · ${formatPresenceLabel(disc.cardPresence)}` : ''}
                        </td>
                        <td style={tdStyle}>
                          {disc.editorTarget && renderEditorLink
                            ? renderEditorLink(disc.editorTarget)
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {report.slots.length > 0 && (
            <>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '20px',
                  marginBottom: '10px',
                }}
              >
                <h3 style={{...sectionHeadingStyle, margin: 0}}>
                  Calendar Slots ({report.slots.length})
                </h3>
                <button
                  type="button"
                  style={{...secondaryButtonStyle, padding: '4px 10px', fontSize: '12px'}}
                  onClick={() => setShowSlotDetails(prev => !prev)}
                >
                  {showSlotDetails ? 'Hide slot table' : 'Show slot table'}
                </button>
              </div>
              {showSlotDetails && (
                <div style={tableWrapStyle}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th scope="col" style={thStyle}>Day</th>
                        <th scope="col" style={thStyle}>Date</th>
                        <th scope="col" style={thStyle}>Slot</th>
                        <th scope="col" style={thStyle}>Challenge</th>
                        <th scope="col" style={thStyle}>Published Readiness</th>
                        <th scope="col" style={thStyle}>Editor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.slots.map(slot => (
                        <tr key={`${slot.dayOfMonth}-${slot.expectedDate}`}>
                          <td style={tdStyle}>Day {String(slot.dayOfMonth).padStart(2, '0')}</td>
                          <td style={tdStyle}>
                            <code>{slot.actualDate ?? slot.expectedDate}</code>
                          </td>
                          <td style={tdStyle}>
                            <code>{slot.slotStatus}</code>
                          </td>
                          <td style={tdStyle}>
                            <div>{slot.challengeTitle || slot.challengeBaseId || 'Unassigned'}</div>
                            {slot.challengeBaseId && (
                              <div style={{fontSize: '11.5px', color: '#475569'}}>
                                <code>{slot.challengeBaseId}</code> · {formatPresenceLabel(slot.presence)}
                              </div>
                            )}
                          </td>
                          <td style={tdStyle}>
                            {slot.slotStatus === 'withdrawn'
                              ? slot.issues.length === 0
                                ? 'Withdrawn (amended)'
                                : slot.issues.join(' ')
                              : slot.publishedReady && slot.issues.length === 0
                                ? 'Published & verified'
                                : slot.issues.join(' ') || 'Pending'}
                          </td>
                          <td style={tdStyle}>
                            {slot.editorTarget && renderEditorLink
                              ? renderEditorLink(slot.editorTarget)
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  )
}

function wrapReadOnlyClient(
  sanityClient: ReturnType<typeof useClient>,
): ReadOnlySanityClient {
  const wrap = (clientInstance: ReturnType<typeof useClient>): ReadOnlySanityClient => ({
    fetch: <T = unknown>(
      query: string,
      params?: Record<string, unknown>,
      options?: {signal?: AbortSignal},
    ) => clientInstance.fetch<T>(query, params ?? {}, options),
    withConfig: cfg => wrap(clientInstance.withConfig(cfg)),
  })
  return wrap(sanityClient)
}

export function MonthlyReadinessInspector({options}: MonthlyReadinessInspectorProps) {
  const optionYearMonth =
    typeof options?.yearMonth === 'string' && options.yearMonth.trim()
      ? options.yearMonth.trim()
      : null
  const defaultYearMonth = optionYearMonth ?? getDefaultYearMonth()

  const [yearMonthInput, setYearMonthInput] = useState(defaultYearMonth)
  const [activeYearMonth, setActiveYearMonth] = useState(defaultYearMonth)
  const [refreshToken, setRefreshToken] = useState(0)
  const [settledState, setSettledState] = useState<{
    requestKey: string
    report: MonthlyReadinessReport
  } | null>(null)

  const workspace = useWorkspace()
  const rawClient = useClient({apiVersion: '2026-11-01'})
  const readOnlyClient = useMemo(() => wrapReadOnlyClient(rawClient), [rawClient])
  const {ChildLink} = usePaneRouter()

  const currentRequestKey = `${workspace?.dataset ?? ''}:${activeYearMonth}:${refreshToken}`
  const loading = settledState?.requestKey !== currentRequestKey
  const report = settledState?.report ?? null

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    void inspectMonthlyReadiness({
      client: readOnlyClient,
      dataset: workspace?.dataset,
      yearMonth: activeYearMonth,
      signal: controller.signal,
    }).then(nextReport => {
      if (!cancelled) {
        setSettledState({
          requestKey: currentRequestKey,
          report: nextReport,
        })
      }
    })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [activeYearMonth, currentRequestKey, readOnlyClient, workspace?.dataset])

  const handleSubmitYearMonth = useCallback(
    (event: FormEvent) => {
      event.preventDefault()
      const next = yearMonthInput.trim()
      if (next === activeYearMonth) {
        setRefreshToken(prev => prev + 1)
      } else {
        setActiveYearMonth(next)
      }
    },
    [activeYearMonth, yearMonthInput],
  )

  const handleRefresh = useCallback(() => {
    setRefreshToken(prev => prev + 1)
  }, [])

  const renderEditorLink: EditorLinkRenderer = useCallback(
    target => {
      const linkStyle: CSSProperties = {
        display: 'inline-block',
        padding: '4px 10px',
        borderRadius: '4px',
        border: '1px solid #334155',
        backgroundColor: '#f8fafc',
        color: '#0f172a',
        fontSize: '12px',
        fontWeight: 600,
        textDecoration: 'none',
      }

      if (target.documentType === 'monthlyPublication' && target.yearMonth) {
        return (
          <ChildLink
            childId={target.structureChildId}
            childParameters={{
              type: 'monthlyPublication',
              template: MONTHLY_PUBLICATION_TEMPLATE_ID,
            }}
            childPayload={{yearMonth: target.yearMonth}}
          >
            <span style={linkStyle}>{target.label}</span>
          </ChildLink>
        )
      }

      if (target.documentType === 'newsArticle' && target.yearMonth) {
        return (
          <ChildLink
            childId={target.structureChildId}
            childParameters={{
              type: 'newsArticle',
              template: MONTHLY_PREVIEW_NEWS_TEMPLATE_ID,
            }}
            childPayload={{yearMonth: target.yearMonth}}
          >
            <span style={linkStyle}>{target.label}</span>
          </ChildLink>
        )
      }

      if (target.documentType === 'scriptureCard' && target.slug) {
        return (
          <ChildLink
            childId={target.structureChildId}
            childParameters={{
              type: 'scriptureCard',
              template: SCRIPTURE_CARD_TEMPLATE_ID,
            }}
            childPayload={{slug: target.slug}}
          >
            <span style={linkStyle}>{target.label}</span>
          </ChildLink>
        )
      }

      return (
        <ChildLink
          childId={target.structureChildId}
          childParameters={{type: target.documentType}}
        >
          <span style={linkStyle}>{target.label}</span>
        </ChildLink>
      )
    },
    [ChildLink],
  )

  return (
    <MonthlyReadinessView
      yearMonthInput={yearMonthInput}
      onYearMonthInputChange={setYearMonthInput}
      onSubmitYearMonth={handleSubmitYearMonth}
      onRefresh={handleRefresh}
      loading={loading}
      report={report}
      renderEditorLink={renderEditorLink}
    />
  )
}
