import { StrictMode, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../../../src/index.css'
import '../../../src/App.css'
import '../../../src/components/news/news.css'
import { NewsReaderHost } from '../../../src/components/news/NewsReaderHost.tsx'
import type {
  NewsGatewayProvider,
  NewsRequestOptions,
  NewsResult,
} from '../../../src/cms/reader/newsProvider.ts'

const FIXTURE_ARTICLES = [
  {
    id: 'update-1',
    documentId: 'news-update-1',
    category: 'ministryUpdate' as const,
    publishedOn: '2026-11-10',
    title: 'Autumn Translation and Study Progress',
    summary: 'A comprehensive summary of recent translation work and study expansions.',
    coverImage: {
      url: 'https://cdn.sanity.io/images/80016lrq/production/autumn-cover.png',
      alt: 'Autumn leaves with an open Bible study notebook',
    },
    body: [
      {
        _key: 'b1',
        _type: 'block',
        style: 'normal',
        markDefs: [
          {
            _key: 'ext-link-1',
            _type: 'link',
            href: 'https://external-website.example.org/blocked-link',
          },
        ],
        children: [
          {
            _key: 's1',
            _type: 'span',
            text: 'Here is an important ministry update with a ',
            marks: [],
          },
          {
            _key: 's2',
            _type: 'span',
            text: 'disallowed external reference link',
            marks: ['ext-link-1'],
          },
          {
            _key: 's3',
            _type: 'span',
            text: ' that must remain inert in the reader.',
            marks: [],
          },
        ],
      },
    ],
  },
  {
    id: 'announcement-1',
    documentId: 'news-announcement-1',
    category: 'announcement' as const,
    publishedOn: '2026-11-11',
    title: 'Publishing Calendar Reminder',
    summary: 'New monthly collections release according to local reader day rules.',
  },
  {
    id: 'preview-2026-12',
    documentId: 'news-preview-2026-12',
    category: 'monthlyPreview' as const,
    publishedOn: '2026-11-12',
    title: 'Advance Preview: December 2026',
    summary: 'December 2026 publication preview is now eligible for early viewing.',
    destination: {
      kind: 'month' as const,
      monthId: '2026-12',
    },
  },
]

export function NewsHarnessApp() {
  const urlParams = new URLSearchParams(window.location.search)
  const scenarioRef = useRef<string>(urlParams.get('scenario') ?? 'standard')
  const [lastNavigation, setLastNavigation] = useState<string>('')
  const [backClicked, setBackClicked] = useState<boolean>(false)

  const mockProvider = useMemo<NewsGatewayProvider>(
    () => ({
      async loadNews(options?: NewsRequestOptions): Promise<NewsResult> {
        const scenario = scenarioRef.current

        if (scenario === 'offline') {
          return {
            status: 'requestError',
            message: 'Network transport failure: offline mode simulated',
            source: 'gateway',
          }
        }

        if (scenario === 'empty') {
          return {
            status: 'empty',
            articles: [],
            serverContext: {
              authorizedLocalDate: '2026-11-12',
              effectiveTimeZone: 'America/New_York',
            },
            source: 'gateway',
          }
        }

        if (scenario === 'malformed') {
          return {
            status: 'validationError',
            message: 'Malformed gateway news response: missing required title',
            source: 'gateway',
          }
        }

        let filtered = FIXTURE_ARTICLES
        if (options?.category) {
          filtered = FIXTURE_ARTICLES.filter(a => a.category === options.category)
        }

        return {
          status: filtered.length === 0 ? 'empty' : 'ready',
          articles: filtered,
          serverContext: {
            authorizedLocalDate: '2026-11-12',
            effectiveTimeZone: 'America/New_York',
          },
          source: 'gateway',
        }
      },
    }),
    [],
  )

  return (
    <div className="news-harness">
      <div className="news-harness-controls" style={{ padding: '0.25rem', borderBottom: '1px solid #ccc', fontSize: '0.75rem' }}>
        <button
          id="btn-set-scenario-offline"
          type="button"
          onClick={() => {
            scenarioRef.current = 'offline'
          }}
        >
          Set Offline
        </button>
        <button
          id="btn-set-scenario-empty"
          type="button"
          onClick={() => {
            scenarioRef.current = 'empty'
          }}
        >
          Set Empty
        </button>
        <button
          id="btn-set-scenario-standard"
          type="button"
          onClick={() => {
            scenarioRef.current = 'standard'
          }}
        >
          Set Standard
        </button>
        <div id="harness-nav-output" data-destination={lastNavigation}>
          {lastNavigation}
        </div>
        <div id="harness-back-output" data-back={String(backClicked)}>
          {String(backClicked)}
        </div>
      </div>

      <NewsReaderHost
        provider={mockProvider}
        onNavigate={dest => {
          setLastNavigation(`${dest.kind}:${dest.monthId}`)
        }}
        onBack={() => {
          setBackClicked(true)
        }}
      />
    </div>
  )
}

const rootElement = document.getElementById('root')
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <NewsHarnessApp />
    </StrictMode>,
  )
}
