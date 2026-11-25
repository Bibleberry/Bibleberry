import { useCallback, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../../../src/index.css'
import '../../../src/App.css'
import '../../../src/components/shelf/shelf.css'
import { ShelfHost } from '../../../src/components/shelf/ShelfHost.tsx'
import type { ShelfMonthMetadata } from '../../../src/components/shelf/shelfModel.ts'
import type { LocalCalendarDate, PublicationYearMonth } from '../../../src/participation/types.ts'
import { createEmptyShelfState } from '../../../src/shelf/policy.ts'
import type { ShelfState } from '../../../src/shelf/types.ts'

function readScenario(): string {
  const params = new URLSearchParams(window.location.search)
  return params.get('scenario') ?? 'empty'
}

function readPresentation(): 'legacy' | 'r06' {
  const params = new URLSearchParams(window.location.search)
  return params.get('presentation') === 'legacy' ? 'legacy' : 'r06'
}

const REFERENCE_CURRENT_MONTH = '2026-11' as PublicationYearMonth
const CURRENT_LOCAL_DATE = '2026-11-15' as LocalCalendarDate

const MONTH_METADATA: Record<string, ShelfMonthMetadata> = {
  '2026-10': {
    yearMonth: '2026-10',
    title: 'Walk in Gratitude',
    subtitle: 'Thirty-one studies on thankfulness.',
    completionProgress: { completedChallengeCount: 14, totalChallengeCount: 31 },
  },
  '2026-09': {
    yearMonth: '2026-09',
    title: 'Steadfast Hope',
    subtitle: 'Daily reflections on enduring in Christ.',
  },
  '2026-08': {
    yearMonth: '2026-08',
    title: 'Abiding Peace',
  },
  '2026-07': {
    yearMonth: '2026-07',
    title: 'Living Word',
  },
}

const AVAILABLE_HISTORICAL_MONTHS: readonly ShelfMonthMetadata[] = [
  MONTH_METADATA['2026-10']!,
  MONTH_METADATA['2026-09']!,
  MONTH_METADATA['2026-08']!,
  MONTH_METADATA['2026-07']!,
  // Intentionally include current & future months in raw input to prove UI boundary filters them out
  { yearMonth: '2026-11', title: 'Current Month Should Not Appear' },
  { yearMonth: '2026-12', title: 'Future Month Should Not Appear' },
]

function buildScenarioState(scenario: string): ShelfState {
  switch (scenario) {
    case 'one-month':
      return {
        months: [
          {
            yearMonth: '2026-10' as PublicationYearMonth,
            admissionKind: 'readerSelected',
            isProtected: true,
            admittedOn: '2026-11-02' as LocalCalendarDate,
          },
        ],
        activeFocusMonth: null,
      }

    case 'two-months':
      return {
        months: [
          {
            yearMonth: '2026-10' as PublicationYearMonth,
            admissionKind: 'autoAdmitted',
            isProtected: false,
            admittedOn: '2026-11-01' as LocalCalendarDate,
          },
          {
            yearMonth: '2026-09' as PublicationYearMonth,
            admissionKind: 'readerSelected',
            isProtected: true,
            admittedOn: '2026-10-15' as LocalCalendarDate,
          },
        ],
        activeFocusMonth: '2026-09' as PublicationYearMonth,
      }

    case 'three-months-mixed':
      return {
        months: [
          {
            yearMonth: '2026-10' as PublicationYearMonth,
            admissionKind: 'autoAdmitted',
            isProtected: false,
            admittedOn: '2026-11-01' as LocalCalendarDate,
          },
          {
            yearMonth: '2026-09' as PublicationYearMonth,
            admissionKind: 'readerSelected',
            isProtected: true,
            admittedOn: '2026-10-12' as LocalCalendarDate,
          },
          {
            yearMonth: '2026-08' as PublicationYearMonth,
            admissionKind: 'readerSelected',
            isProtected: true,
            admittedOn: '2026-09-20' as LocalCalendarDate,
          },
        ],
        activeFocusMonth: '2026-10' as PublicationYearMonth,
      }

    case 'focus-outside-shelf':
      return {
        months: [
          {
            yearMonth: '2026-10' as PublicationYearMonth,
            admissionKind: 'readerSelected',
            isProtected: true,
          },
        ],
        activeFocusMonth: '2026-07' as PublicationYearMonth,
      }

    case 'empty':
    default:
      return createEmptyShelfState()
  }
}

// eslint-disable-next-line react-refresh/only-export-components
function ShelfHarnessApp() {
  const scenario = readScenario()
  const presentation = readPresentation()
  const [openedMonth, setOpenedMonth] = useState<string | null>(null)
  const [libraryPickerCalls, setLibraryPickerCalls] = useState(0)
  const [exitCalls, setExitCalls] = useState(0)
  const [initialState] = useState<ShelfState>(() => buildScenarioState(scenario))

  const handleOpenMonth = useCallback((yearMonth: PublicationYearMonth) => {
    setOpenedMonth(yearMonth)
  }, [])

  const handleRequestLibraryPicker = useCallback(() => {
    setLibraryPickerCalls(prev => prev + 1)
  }, [])

  const handleExit = useCallback(() => {
    setExitCalls(prev => prev + 1)
  }, [])

  return (
    <div>
      {/* Isolated test harness telemetry (ephemeral in-memory state only) */}
      <aside
        aria-label="Test Harness Telemetry"
        data-testid="shelf-harness-telemetry"
        style={{
          padding: '8px 16px',
          borderBottom: '1px solid var(--rule)',
          background: 'var(--surface)',
          fontSize: '12px',
          color: 'var(--muted)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <span>
          Scenario: <strong>{scenario}</strong>
        </span>
        <span>
          Last opened month:{' '}
          <strong data-testid="opened-month">{openedMonth ?? 'none'}</strong>
        </span>
        <span>
          Library picker calls:{' '}
          <strong data-testid="library-picker-calls">{libraryPickerCalls}</strong>
        </span>
        <span>
          Exit calls: <strong data-testid="exit-calls">{exitCalls}</strong>
        </span>
      </aside>

      <ShelfHost
        referenceCurrentYearMonth={REFERENCE_CURRENT_MONTH}
        initialState={initialState}
        onOpenMonth={handleOpenMonth}
        onRequestLibraryPicker={handleRequestLibraryPicker}
        availableHistoricalMonths={AVAILABLE_HISTORICAL_MONTHS}
        monthMetadata={MONTH_METADATA}
        currentLocalDate={CURRENT_LOCAL_DATE}
        presentation={presentation}
        onExit={handleExit}
        exitLabel="Back to Hub"
      />
    </div>
  )
}

const rootElement = document.getElementById('root')
if (rootElement) {
  createRoot(rootElement).render(<ShelfHarnessApp />)
}
