import { useCallback, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../../../src/index.css'
import '../../../src/App.css'
import type {
  LibraryMonthIndexProvider,
  LibraryMonthSummary,
} from '../../../src/cms/reader/libraryMonthIndexProvider.ts'
import type {
  MonthDetailData,
  MonthGatewayProvider,
} from '../../../src/cms/reader/monthProvider.ts'
import type { ShelfMonthMetadata } from '../../../src/components/shelf/shelfModel.ts'
import {
  R06LibraryLanding,
  type OpenMonthContext,
  type R06LibrarySurface,
} from '../../../src/components/r06Library/index.ts'
import type { LocalCalendarDate, PublicationYearMonth } from '../../../src/participation/types.ts'
import { createEmptyShelfState, SHELF_CONFIRMATION_STALE_MESSAGE } from '../../../src/shelf/policy.ts'
import type { ShelfState } from '../../../src/shelf/types.ts'

function readScenario(): string {
  const params = new URLSearchParams(window.location.search)
  return params.get('scenario') ?? 'capacity-0'
}

const REFERENCE_CURRENT_MONTH = '2026-11' as PublicationYearMonth
const CURRENT_LOCAL_DATE = '2026-11-21' as LocalCalendarDate

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

const TAINTED_CATALOGUE: readonly LibraryMonthSummary[] = [
  {
    yearMonth: '2026-12',
    year: 2026,
    month: 12,
    title: 'Future Month Must Be Blocked',
  },
  {
    yearMonth: '2026-11',
    year: 2026,
    month: 11,
    title: 'Current Month Must Be Blocked',
  },
  ...HISTORICAL_MONTHS_PAGE_1,
]

const MONTH_METADATA: Record<string, ShelfMonthMetadata> = {
  '2026-10': {
    yearMonth: '2026-10',
    title: 'Walk in Gratitude',
    subtitle: 'Thirty-one studies on thankfulness.',
  },
  '2026-09': {
    yearMonth: '2026-09',
    title: 'Steadfast Hope',
    subtitle: 'Daily reflections on enduring in Christ.',
  },
  '2026-08': { yearMonth: '2026-08', title: 'Abiding Peace' },
  '2026-07': { yearMonth: '2026-07', title: 'Living Word' },
  '2026-06': { yearMonth: '2026-06', title: 'Faithful Witness' },
}

const HARNESS_SERVER_CONTEXT = {
  authorizedLocalDate: CURRENT_LOCAL_DATE,
  effectiveTimeZone: 'America/New_York',
}

/**
 * Synthetic gateway Month provider. Since Saffron Ledger (#351) the R06 Shelf
 * card resolves its title and completion progress through the gateway Month
 * lookup and withholds the title when that lookup is unavailable. The harness
 * therefore answers that lookup for the synthetic historical months, and
 * reports `notFound` for anything else.
 */
const HARNESS_MONTH_PROVIDER: MonthGatewayProvider = {
  async loadMonthPreview() {
    return { status: 'notFound', source: 'gateway' }
  },
  async loadMonth(yearMonth) {
    const metadata = MONTH_METADATA[yearMonth]
    if (!metadata) return { status: 'notFound', source: 'gateway' }
    const [year, month] = yearMonth.split('-').map(Number)
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
    const detail: MonthDetailData = {
      monthId: yearMonth,
      documentId: `harness-month-${yearMonth}`,
      year,
      month,
      daysInMonth,
      phase: 'historical',
      rosterVersion: 1,
      totalChallenges: daysInMonth,
      title: metadata.title ?? '',
      ...(metadata.subtitle ? { subtitle: metadata.subtitle } : {}),
      introduction: {
        version: 'harness',
        previewScreens: [],
        welcomeScreen: { id: 'harness-welcome', title: 'Welcome', blocks: [] },
      },
      slots: [],
      discoveries: [],
    }
    return { status: 'ready', month: detail, serverContext: HARNESS_SERVER_CONTEXT, source: 'gateway' }
  },
  async loadMonthProgress(yearMonth) {
    const metadata = MONTH_METADATA[yearMonth]
    if (!metadata) return { status: 'notFound', source: 'gateway' }
    const [year, month] = yearMonth.split('-').map(Number)
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
    return {
      status: 'ready',
      progress: {
        monthId: yearMonth,
        rosterVersion: 1,
        completedInMonthCount: 0,
        totalChallenges: daysInMonth,
        thematicEarnedCount: 0,
        thematicTotalCount: 0,
        discoveries: [],
      },
      serverContext: HARNESS_SERVER_CONTEXT,
      source: 'gateway',
    }
  },
  async loadNews() {
    return { status: 'notFound', source: 'gateway' }
  },
}

function buildScenarioShelfState(scenario: string): ShelfState {
  switch (scenario) {
    case 'capacity-1':
    case 'implicit-calendar-loading':
    case 'stale-shelf-month':
      return {
        months: [
          {
            yearMonth: '2026-10' as PublicationYearMonth,
            admissionKind: 'readerSelected',
            isProtected: true,
            admittedOn: '2026-11-01' as LocalCalendarDate,
          },
        ],
      }

    case 'capacity-2':
    case 'controlled-surface':
    case 'controlled-start-library':
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

    case 'capacity-3':
    case 'conditional-write-rejection':
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
          {
            yearMonth: '2026-08' as PublicationYearMonth,
            admissionKind: 'readerSelected',
            isProtected: true,
            admittedOn: '2026-09-10' as LocalCalendarDate,
          },
        ],
        activeFocusMonth: '2026-09' as PublicationYearMonth,
      }

    case 'current-month-tainted':
      return {
        months: [
          {
            yearMonth: '2026-11' as PublicationYearMonth,
            admissionKind: 'readerSelected',
            isProtected: true,
            admittedOn: '2026-11-01' as LocalCalendarDate,
          },
          {
            yearMonth: '2026-12' as PublicationYearMonth,
            admissionKind: 'readerSelected',
            isProtected: true,
            admittedOn: '2026-11-01' as LocalCalendarDate,
          },
          {
            yearMonth: '2026-10' as PublicationYearMonth,
            admissionKind: 'readerSelected',
            isProtected: true,
            admittedOn: '2026-11-01' as LocalCalendarDate,
          },
        ],
      }

    case 'capacity-0':
    case 'unauthorized-catalogue':
    case 'empty-catalogue':
    case 'request-error':
    case 'validation-error':
    case 'uncontrolled-start-library':
    default:
      return createEmptyShelfState()
  }
}

// eslint-disable-next-line react-refresh/only-export-components
function R06LibraryHarnessApp() {
  const scenario = readScenario()
  const isControlledSurface =
    scenario === 'controlled-surface' || scenario === 'controlled-start-library'
  const initialSurface: R06LibrarySurface =
    scenario === 'uncontrolled-start-library' ? 'library' : 'shelf'

  const [persistedShelfState, setPersistedShelfState] = useState<ShelfState>(() =>
    buildScenarioShelfState(scenario),
  )
  const [controlledSurface, setControlledSurface] = useState<R06LibrarySurface>(
    scenario === 'controlled-start-library' ? 'library' : 'shelf',
  )
  const [surfaceChanges, setSurfaceChanges] = useState<readonly R06LibrarySurface[]>([])
  const [openedMonths, setOpenedMonths] = useState<
    readonly { readonly yearMonth: string; readonly origin: string }[]
  >([])
  const [foundationsCalls, setFoundationsCalls] = useState(0)
  const [exitCalls, setExitCalls] = useState(0)
  const [stateChangeCount, setStateChangeCount] = useState(0)
  const [lastExpectedStatePresent, setLastExpectedStatePresent] = useState<string>('none')
  const [fetchCount, setFetchCount] = useState(0)
  const requestAttemptsRef = useRef(0)
  const pendingCalendarResolveRef = useRef<(() => void) | null>(null)
  const [hasPendingCalendarLoad, setHasPendingCalendarLoad] = useState(false)

  const [underlyingProgress] = useState<Record<string, string>>({
    '2026-10': '14/31 completed · 1 earned card',
    '2026-09': '30/30 completed · 3 earned cards',
    '2026-08': '7/31 completed',
  })

  const libraryProvider = useMemo<LibraryMonthIndexProvider>(
    () => ({
      async loadHistoricalMonths(options = {}) {
        requestAttemptsRef.current += 1
        const attempt = requestAttemptsRef.current
        setFetchCount(c => c + 1)

        if (scenario === 'implicit-calendar-loading' && attempt === 1) {
          await new Promise<void>(resolve => {
            pendingCalendarResolveRef.current = resolve
            setHasPendingCalendarLoad(true)
          })
          setHasPendingCalendarLoad(false)
        }

        const serverContext = {
          authorizedLocalDate: CURRENT_LOCAL_DATE,
          effectiveTimeZone: options.timeZone ?? 'America/New_York',
        }

        if (scenario === 'empty-catalogue') {
          return {
            status: 'empty',
            items: [],
            page: { limit: options.limit ?? 3, hasMore: false, nextCursor: null },
            serverContext,
            source: 'gateway',
          }
        }

        if (scenario === 'request-error' && attempt === 1) {
          return {
            status: 'requestError',
            message: 'Gateway temporarily unavailable.',
            httpStatus: 503,
            source: 'gateway',
          }
        }

        if (scenario === 'validation-error') {
          return {
            status: 'validationError',
            message: 'Malformed gateway payload.',
            issues: ['items.0.yearMonth: Invalid format'],
            source: 'gateway',
          }
        }

        if (scenario === 'current-month-tainted' || scenario === 'unauthorized-catalogue') {
          return {
            status: 'ready',
            items: TAINTED_CATALOGUE,
            page: { limit: options.limit ?? 3, hasMore: false, nextCursor: null },
            serverContext,
            source: 'gateway',
          }
        }

        if (scenario === 'stale-shelf-month') {
          return {
            status: 'ready',
            items: HISTORICAL_MONTHS_PAGE_1.filter(item => item.yearMonth !== '2026-10'),
            page: { limit: options.limit ?? 3, hasMore: false, nextCursor: null },
            serverContext,
            source: 'gateway',
          }
        }

        if (!options.cursor) {
          return {
            status: 'ready',
            items: HISTORICAL_MONTHS_PAGE_1,
            page: { limit: options.limit ?? 3, hasMore: true, nextCursor: '2026-08' },
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

  const handleShelfStateChange = useCallback(
    (nextState: ShelfState, expectedState?: ShelfState) => {
      setLastExpectedStatePresent(expectedState ? 'present' : 'absent')
      if (scenario === 'conditional-write-rejection' && expectedState) {
        return SHELF_CONFIRMATION_STALE_MESSAGE
      }
      setPersistedShelfState(nextState)
      setStateChangeCount(c => c + 1)
    },
    [scenario],
  )

  const handleSurfaceChange = useCallback(
    (nextSurface: R06LibrarySurface) => {
      setSurfaceChanges(prev => [...prev, nextSurface])
      if (isControlledSurface) {
        setControlledSurface(nextSurface)
      }
    },
    [isControlledSurface],
  )

  const handleOpenMonth = useCallback(
    (yearMonth: PublicationYearMonth, context: OpenMonthContext) => {
      setOpenedMonths(prev => [...prev, { yearMonth, origin: context.origin }])
    },
    [],
  )

  const handleOpenFoundations = useCallback(() => {
    setFoundationsCalls(c => c + 1)
  }, [])

  const handleExit = useCallback(() => {
    setExitCalls(c => c + 1)
  }, [])

  const localStorageKeys = Object.keys(window.localStorage)

  return (
    <>
      {hasPendingCalendarLoad && (
        <div
          style={{
            width: 'min(calc(100% - 32px), 920px)',
            margin: '12px auto 0',
          }}
        >
          <button
            type="button"
            data-testid="resolve-calendar-load"
            onClick={() => {
              pendingCalendarResolveRef.current?.()
              pendingCalendarResolveRef.current = null
            }}
          >
            Resolve Gateway Calendar Context
          </button>
        </div>
      )}

      {isControlledSurface && (
        <div
          data-testid="shell-controls"
          style={{
            width: 'min(calc(100% - 32px), 920px)',
            margin: '12px auto 0',
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            data-testid="shell-reset-to-shelf"
            onClick={() => setControlledSurface('shelf')}
          >
            Shell Reset Tab to Shelf
          </button>
          <button
            type="button"
            data-testid="shell-switch-to-library"
            onClick={() => setControlledSurface('library')}
          >
            Shell Open Browse All Months
          </button>
        </div>
      )}

      <R06LibraryLanding
        referenceCurrentYearMonth={
          scenario === 'implicit-calendar-loading' ||
          scenario === 'request-error' ||
          scenario === 'validation-error'
            ? undefined
            : REFERENCE_CURRENT_MONTH
        }
        shelfState={persistedShelfState}
        onShelfStateChange={handleShelfStateChange}
        currentLocalDate={CURRENT_LOCAL_DATE}
        libraryProvider={libraryProvider}
        monthProgressProvider={HARNESS_MONTH_PROVIDER}
        libraryPageSize={3}
        monthMetadata={MONTH_METADATA}
        surface={isControlledSurface ? controlledSurface : undefined}
        initialSurface={initialSurface}
        onSurfaceChange={handleSurfaceChange}
        onOpenMonth={handleOpenMonth}
        onOpenFoundations={handleOpenFoundations}
        onExit={
          scenario === 'uncontrolled-start-library' || scenario === 'controlled-start-library'
            ? handleExit
            : undefined
        }
        exitLabel="Return to Today"
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
          Opened months: <span data-testid="opened-months">{JSON.stringify(openedMonths)}</span>
        </div>
        <div>
          Foundations calls: <span data-testid="foundations-calls">{foundationsCalls}</span>
        </div>
        <div>
          Surface changes: <span data-testid="surface-changes">{JSON.stringify(surfaceChanges)}</span>
        </div>
        <div>
          State changes: <span data-testid="state-change-count">{stateChangeCount}</span>
        </div>
        <div>
          Last expectedState:{' '}
          <span data-testid="last-expected-state">{lastExpectedStatePresent}</span>
        </div>
        <div>
          Provider fetches: <span data-testid="provider-fetch-count">{fetchCount}</span>
        </div>
        <div>
          Exit calls: <span data-testid="exit-calls">{exitCalls}</span>
        </div>
        <div>
          localStorage keys:{' '}
          <span data-testid="local-storage-keys">{JSON.stringify(localStorageKeys)}</span>
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

createRoot(document.getElementById('root')!).render(<R06LibraryHarnessApp />)
