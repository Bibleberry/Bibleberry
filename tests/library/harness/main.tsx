import { useState, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import '../../../src/index.css'
import '../../../src/App.css'
import '../../../src/components/library/library.css'
import { HistoricalLibraryHost } from '../../../src/components/library/HistoricalLibraryHost.tsx'
import type {
  LibraryMonthIndexProvider,
  LibraryMonthIndexResult,
  LibraryMonthSummary,
} from '../../../src/cms/reader/libraryMonthIndexProvider.ts'

function readScenario(): string {
  const params = new URLSearchParams(window.location.search)
  return params.get('scenario') ?? 'multi-page'
}

const OCT_2026: LibraryMonthSummary = {
  yearMonth: '2026-10',
  year: 2026,
  month: 10,
  title: 'Walk in Gratitude',
  subtitle: 'Thirty-one studies on thankfulness.',
  coverImage: {
    url: 'https://cdn.sanity.io/images/80016lrq/production/cover-2026-10.png',
    alt: 'Autumn leaves and Bible',
  },
}

const SEP_2026: LibraryMonthSummary = {
  yearMonth: '2026-09',
  year: 2026,
  month: 9,
  title: 'Steadfast Hope',
  subtitle: 'Daily reflections on enduring in Christ.',
}

const AUG_2026: LibraryMonthSummary = {
  yearMonth: '2026-08',
  year: 2026,
  month: 8,
  title: 'Abiding Peace',
}

const JUL_2026: LibraryMonthSummary = {
  yearMonth: '2026-07',
  year: 2026,
  month: 7,
  title: 'Living Word',
}

function createScenarioProvider(scenario: string): LibraryMonthIndexProvider {
  let attemptCount = 0

  return {
    async loadHistoricalMonths(options = {}): Promise<LibraryMonthIndexResult> {
      const { cursor, signal } = options
      attemptCount += 1

      // Simulate a small network delay so loading states can be asserted if desired
      await new Promise(r => setTimeout(r, 40))

      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }

      const serverContext = {
        authorizedLocalDate: '2026-11-15',
        effectiveTimeZone: 'America/New_York',
      }

      switch (scenario) {
        case 'empty':
          return {
            status: 'empty',
            items: [],
            page: { limit: 12, hasMore: false, nextCursor: null },
            serverContext,
            source: 'gateway',
          }

        case 'sparse-initial':
          if (!cursor) {
            return {
              status: 'empty',
              items: [],
              page: { limit: 12, hasMore: true, nextCursor: '2026-07' },
              serverContext,
              source: 'gateway',
            }
          }
          return {
            status: 'ready',
            items: [JUL_2026],
            page: { limit: 12, hasMore: false, nextCursor: null },
            serverContext,
            source: 'gateway',
          }

        case 'sparse-middle':
          if (!cursor) {
            return {
              status: 'ready',
              items: [OCT_2026],
              page: { limit: 1, hasMore: true, nextCursor: '2026-10' },
              serverContext,
              source: 'gateway',
            }
          }
          if (cursor === '2026-10') {
            // Sparse intermediate page
            return {
              status: 'empty',
              items: [],
              page: { limit: 1, hasMore: true, nextCursor: '2026-08' },
              serverContext,
              source: 'gateway',
            }
          }
          return {
            status: 'ready',
            items: [AUG_2026],
            page: { limit: 1, hasMore: false, nextCursor: null },
            serverContext,
            source: 'gateway',
          }

        case 'duplicate-months':
          if (!cursor) {
            return {
              status: 'ready',
              items: [OCT_2026, SEP_2026],
              page: { limit: 2, hasMore: true, nextCursor: '2026-09' },
              serverContext,
              source: 'gateway',
            }
          }
          // Overlapping page returning duplicate SEP_2026
          return {
            status: 'ready',
            items: [SEP_2026, AUG_2026],
            page: { limit: 2, hasMore: false, nextCursor: null },
            serverContext,
            source: 'gateway',
          }

        case 'error-retry':
          if (attemptCount === 1) {
            return {
              status: 'requestError',
              message: 'Simulated connection timeout',
              httpStatus: 504,
              source: 'gateway',
            }
          }
          return {
            status: 'ready',
            items: [OCT_2026],
            page: { limit: 12, hasMore: false, nextCursor: null },
            serverContext,
            source: 'gateway',
          }

        case 'validation-error':
          return {
            status: 'validationError',
            message: 'Library month index included current or future month',
            issues: ['items[0].yearMonth: "2026-11" must be strictly earlier than "2026-11".'],
            source: 'gateway',
          }

        case 'multi-page':
        default:
          if (!cursor) {
            return {
              status: 'ready',
              items: [OCT_2026, SEP_2026],
              page: { limit: 2, hasMore: true, nextCursor: '2026-09' },
              serverContext,
              source: 'gateway',
            }
          }
          return {
            status: 'ready',
            items: [AUG_2026],
            page: { limit: 2, hasMore: false, nextCursor: null },
            serverContext,
            source: 'gateway',
          }
      }
    },
  }
}

export function HarnessApp() {
  const scenario = readScenario()
  const [openedMonth, setOpenedMonth] = useState<string | null>(null)
  const [exitCalled, setExitCalled] = useState(false)

  const provider = createScenarioProvider(scenario)

  const handleOpenMonth = useCallback((ym: string) => {
    setOpenedMonth(ym)
  }, [setOpenedMonth])

  const handleExit = useCallback(() => {
    setExitCalled(true)
  }, [setExitCalled])

  return (
    <div>
      <div
        style={{
          padding: '8px 16px',
          background: 'var(--rule)',
          fontSize: '12px',
          display: 'flex',
          gap: '16px',
        }}
        data-testid="harness-status"
      >
        <span>Scenario: {scenario}</span>
        <span data-testid="last-opened-month">Opened: {openedMonth ?? 'none'}</span>
        <span data-testid="exit-status">Exit: {exitCalled ? 'called' : 'none'}</span>
      </div>

      <HistoricalLibraryHost
        provider={provider}
        onOpenMonth={handleOpenMonth}
        onExit={handleExit}
        exitLabel="Return to Hub"
      />
    </div>
  )
}

const rootEl = document.getElementById('root')
if (rootEl) {
  createRoot(rootEl).render(<HarnessApp />)
}
