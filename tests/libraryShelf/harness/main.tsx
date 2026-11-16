import { useCallback, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../../../src/index.css'
import '../../../src/App.css'
import '../../../src/components/shelf/shelf.css'
import '../../../src/components/library/library.css'
import type {
  LibraryMonthIndexProvider,
  LibraryMonthSummary,
} from '../../../src/cms/reader/libraryMonthIndexProvider.ts'
import type { ShelfMonthMetadata } from '../../../src/components/shelf/shelfModel.ts'
import {
  LibraryShelfHost,
  type LibraryShelfSurface,
  type OpenMonthContext,
} from '../../../src/components/libraryShelf/index.ts'
import type { LocalCalendarDate, PublicationYearMonth } from '../../../src/participation/types.ts'
import { createEmptyShelfState } from '../../../src/shelf/policy.ts'
import type { ShelfState } from '../../../src/shelf/types.ts'

function readScenario(): string {
  const params = new URLSearchParams(window.location.search)
  return params.get('scenario') ?? 'empty'
}

const REFERENCE_CURRENT_MONTH = '2026-11' as PublicationYearMonth
const CURRENT_LOCAL_DATE = '2026-11-16' as LocalCalendarDate

const HISTORICAL_MONTHS_PAGE_1: readonly LibraryMonthSummary[] = [
  {
    yearMonth: '2026-10',
    year: 2026,
    month: 10,
    title: 'Walk in Gratitude',
    subtitle: 'Thirty-one studies on thankfulness.',
  },
  {
    yearMonth: '2026-09',
    year: 2026,
    month: 9,
    title: 'Steadfast Hope',
    subtitle: 'Daily reflections on enduring in Christ.',
  },
  {
    yearMonth: '2026-08',
    year: 2026,
    month: 8,
    title: 'Abiding Peace',
  },
]

const HISTORICAL_MONTHS_PAGE_2: readonly LibraryMonthSummary[] = [
  {
    yearMonth: '2026-07',
    year: 2026,
    month: 7,
    title: 'Living Word',
  },
  {
    yearMonth: '2026-06',
    year: 2026,
    month: 6,
    title: 'Faithful Witness',
  },
]

const TAINTED_CANDIDATES: readonly LibraryMonthSummary[] = [
  {
    yearMonth: '2026-12',
    year: 2026,
    month: 12,
    title: 'Future Month Should Be Blocked',
  },
  {
    yearMonth: '2026-11',
    year: 2026,
    month: 11,
    title: 'Current Month Should Be Blocked',
  },
  ...HISTORICAL_MONTHS_PAGE_1,
]

const MONTH_METADATA: Record<string, ShelfMonthMetadata> = {
  '2026-10': { yearMonth: '2026-10', title: 'Walk in Gratitude', subtitle: 'Thirty-one studies on thankfulness.' },
  '2026-09': { yearMonth: '2026-09', title: 'Steadfast Hope', subtitle: 'Daily reflections on enduring in Christ.' },
  '2026-08': { yearMonth: '2026-08', title: 'Abiding Peace' },
  '2026-07': { yearMonth: '2026-07', title: 'Living Word' },
  '2026-06': { yearMonth: '2026-06', title: 'Faithful Witness' },
}

function buildScenarioShelfState(scenario: string): ShelfState {
  switch (scenario) {
    case 'two-months-mixed':
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

    case 'three-months-full':
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

    default:
      return createEmptyShelfState()
  }
}

// eslint-disable-next-line react-refresh/only-export-components
function LibraryShelfHarnessApp() {
  const scenario = readScenario()
  const initialSurface: LibraryShelfSurface = scenario === 'start-library' ? 'library' : 'shelf'

  // Injected state/callback boundary simulating external persistence attachment
  const [persistedShelfState, setPersistedShelfState] = useState<ShelfState>(() =>
    buildScenarioShelfState(scenario),
  )
  const [stateChangeCount, setStateChangeCount] = useState(0)
  const [openedMonths, setOpenedMonths] = useState<
    readonly { readonly yearMonth: string; readonly origin: string }[]
  >([])
  const [exitCalls, setExitCalls] = useState(0)
  const [fetchCount, setFetchCount] = useState(0)

  // Simulated underlying reader accomplishments/progress independent of Shelf membership
  const [underlyingProgress] = useState<Record<string, string>>({
    '2026-10': '12/31 completed · 1 earned card',
    '2026-09': '30/30 completed · 3 earned cards',
    '2026-08': '5/31 completed',
  })

  const libraryProvider = useMemo<LibraryMonthIndexProvider>(
    () => ({
      async loadHistoricalMonths(options = {}) {
        setFetchCount(c => c + 1)
        const serverContext = {
          authorizedLocalDate: CURRENT_LOCAL_DATE,
          effectiveTimeZone: options.timeZone ?? 'America/New_York',
        }

        if (scenario === 'unauthorized-candidates') {
          return {
            status: 'ready',
            items: TAINTED_CANDIDATES,
            page: { limit: options.limit ?? 3, hasMore: false, nextCursor: null },
            serverContext,
            source: 'gateway',
          }
        }

        if (!options.cursor) {
          return {
            status: 'ready',
            items: HISTORICAL_MONTHS_PAGE_1,
            page: { limit: options.limit ?? 3, hasMore: true, nextCursor: 'page-2' },
            serverContext,
            source: 'gateway',
          }
        }

        return {
          status: 'ready',
          items: HISTORICAL_MONTHS_PAGE_2,
          page: { limit: options.limit ?? 3, hasMore: false, nextCursor: null },
          serverContext,
          source: 'gateway',
        }
      },
    }),
    [scenario],
  )

  const handleShelfStateChange = useCallback((nextState: ShelfState) => {
    setPersistedShelfState(nextState)
    setStateChangeCount(c => c + 1)
  }, [])

  const handleOpenMonth = useCallback(
    (yearMonth: PublicationYearMonth, context: OpenMonthContext) => {
      setOpenedMonths(prev => [...prev, { yearMonth, origin: context.origin }])
    },
    [],
  )

  const handleExit = useCallback(() => {
    setExitCalls(c => c + 1)
  }, [])

  return (
    <>
      <LibraryShelfHost
        referenceCurrentYearMonth={REFERENCE_CURRENT_MONTH}
        shelfState={persistedShelfState}
        onShelfStateChange={handleShelfStateChange}
        currentLocalDate={CURRENT_LOCAL_DATE}
        libraryProvider={libraryProvider}
        libraryPageSize={3}
        monthMetadata={MONTH_METADATA}
        initialSurface={initialSurface}
        onOpenMonth={handleOpenMonth}
        onExit={handleExit}
        exitLabel="Return to Hub"
      />

      <footer
        data-testid="harness-diagnostics"
        aria-label="Test harness diagnostics"
        style={{
          margin: '24px auto',
          width: 'min(calc(100% - 32px), 920px)',
          padding: '12px',
          borderTop: '1px dashed #ccc',
          fontSize: '12px',
          color: '#666',
          overflowWrap: 'anywhere',
        }}
      >
        <div>
          Opened months:{' '}
          <span data-testid="opened-months">{JSON.stringify(openedMonths)}</span>
        </div>
        <div>
          State changes: <span data-testid="state-change-count">{stateChangeCount}</span>
        </div>
        <div>
          Provider fetches: <span data-testid="provider-fetch-count">{fetchCount}</span>
        </div>
        <div>
          Exit calls: <span data-testid="exit-calls">{exitCalls}</span>
        </div>
        <div>
          Underlying progress:{' '}
          <span data-testid="underlying-progress">{JSON.stringify(underlyingProgress)}</span>
        </div>
        <div>
          Shelf state: <span data-testid="shelf-json">{JSON.stringify(persistedShelfState)}</span>
        </div>
      </footer>
    </>
  )
}

createRoot(document.getElementById('root')!).render(<LibraryShelfHarnessApp />)
