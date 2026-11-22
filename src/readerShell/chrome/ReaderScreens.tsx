import { Activity, useState, type ReactNode } from 'react'
import { AppLibraryShelfHost } from '../../appIntegration/AppLibraryShelfHost.tsx'
import { MonthScreenHost } from '../../components/month/MonthScreenHost.tsx'
import { formatCivilYearMonthFromDate } from '../../components/month/monthScreenModel.ts'
import { FieldNotebookHost } from '../../components/notebook/FieldNotebookHost.tsx'
import { SavedScriptureHost } from '../../components/savedScripture/SavedScriptureHost.tsx'
import { NewsReaderHost } from '../../components/news/NewsReaderHost.tsx'
import { activeRoute, type NavigationAction, type NavigationState } from '../navigation/index.ts'
import { activeScreenKey } from '../navigation/routeTable.ts'

type Send = (action: NavigationAction) => void

const browseMonths = { type: 'push', route: { kind: 'browseMonths' } } as const
const foundations = { type: 'push', route: { kind: 'detail', screen: 'foundations' } } as const
const back = { type: 'pop' } as const

function openMonth(send: Send, yearMonth: string) {
  send({ type: 'push', route: { kind: 'month', yearMonth } })
}

function Action({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return <button type="button" className="button button--secondary" onClick={onClick}>{children}</button>
}

function Landing({ title, children }: { title: string; children: ReactNode }) {
  return <div className="r06-landing"><h1>{title}</h1>{children}</div>
}

function TodayLanding({ send }: { send: Send }) {
  // WP-04 will supply the authorized Today projection at this boundary.
  return (
    <Landing title="Today">
      <p>Today’s teaching is unavailable in this reader.</p>
      <Action onClick={() => openMonth(send, formatCivilYearMonthFromDate())}>Open this month</Action>
    </Landing>
  )
}

function LibraryWorkspace({ browse, send }: { browse: boolean; send: Send }) {
  // WP-05b can replace the Library landing here using the same navigation intents.
  return (
    <>
      {!browse && (
        <header className="r06-landing">
          <h1>Library</h1>
          <div className="r06-actions">
            <Action onClick={() => send(browseMonths)}>Browse All Months</Action>
            <Action onClick={() => send(foundations)}>Foundations</Action>
          </div>
        </header>
      )}
      <AppLibraryShelfHost
        surface={browse ? 'library' : 'shelf'}
        onSurfaceChange={surface => send(surface === 'shelf' ? back : browseMonths)}
        onOpenMonth={(yearMonth, context) => {
          if (context.origin === (browse ? 'library' : 'shelf')) openMonth(send, yearMonth)
        }}
        onExit={browse ? () => send(back) : undefined}
        exitLabel="Back to Library"
      />
    </>
  )
}

function RouteProblem({ state, send }: { state: NavigationState; send: Send }) {
  const challenge = state.problem === 'challengeUnavailable' || state.focused?.kind === 'challenge'
  const month = state.problem === 'externalMonth'
  const title = challenge ? 'Challenge unavailable' : month ? 'Month unavailable' : 'Page unavailable'
  return (
    <Landing title={title}>
      <Action onClick={() => send({ type: 'returnToToday' })}>Return to Today</Action>
    </Landing>
  )
}

function UnavailableDetail({ screen, send }: { screen: string; send: Send }) {
  const challenge = screen === 'challengeUnavailable'
  const title = challenge ? 'Challenge unavailable' : screen === 'foundations' ? 'Foundations unavailable' : 'Page unavailable'
  const backLabel = challenge ? 'Back to Month' : screen === 'foundations' ? 'Back to Library' : 'Back'
  return (
    <Landing title={title}>
      <Action onClick={() => send(back)}>{backLabel}</Action>
    </Landing>
  )
}

function CurrentScreen({ state, send }: { state: NavigationState; send: Send }) {
  if (state.problem || state.focused) return <RouteProblem state={state} send={send} />

  const route = activeRoute(state)
  if (route.kind === 'landing') {
    switch (route.tab) {
      case 'today':
        return <TodayLanding send={send} />
      case 'collections':
        return (
          <Landing title="Collections">
            <div className="r06-actions">
              <Action onClick={() => send({ type: 'push', route: { kind: 'notebook' } })}>Field Notebook</Action>
              <Action onClick={() => send({ type: 'push', route: { kind: 'savedScripture' } })}>Saved Scripture</Action>
            </div>
          </Landing>
        )
      case 'more':
        return (
          <Landing title="More">
            <Action onClick={() => send({ type: 'push', route: { kind: 'news', category: 'all' } })}>View All News</Action>
          </Landing>
        )
    }
  }

  switch (route.kind) {
    case 'month':
      return (
        <MonthScreenHost
          yearMonth={route.yearMonth}
          onSelectYearMonth={yearMonth => openMonth(send, yearMonth)}
          onOpenChallenge={() => send({ type: 'push', route: { kind: 'detail', screen: 'challengeUnavailable' } })}
          onExit={() => send(back)}
          exitLabel="Back"
        />
      )
    case 'news':
      return (
        <NewsReaderHost
          initialCategory={route.category}
          onCategoryChange={category => send({ type: 'push', route: { kind: 'news', category } })}
          onNavigate={({ monthId }) => openMonth(send, monthId)}
          onBack={() => send(state.stacks.more.length === 1 ? back : { type: 'selectTab', tab: 'more' })}
        />
      )
    case 'detail':
      return <UnavailableDetail screen={route.screen} send={send} />
    default:
      return null
  }
}

const retainedScreens = ['library', 'collections:notebook', 'collections:savedScripture'] as const
type RetainedScreen = (typeof retainedScreens)[number]

function retainedScreen(key: string): RetainedScreen | undefined {
  return key === 'library:browseMonths' ? 'library' : retainedScreens.find(screen => screen === key)
}

function keepScreen(key: RetainedScreen, state: NavigationState) {
  switch (key) {
    case 'library': return true
    case 'collections:notebook': return state.stacks.collections.some(route => route.kind === 'notebook')
    case 'collections:savedScripture': return state.stacks.collections.some(route => route.kind === 'savedScripture')
  }
}

export function ReaderScreens({ state, send }: { state: NavigationState; send: Send }) {
  const activeKey = activeScreenKey(state)
  const activeRetained = retainedScreen(activeKey)
  const [visited, setVisited] = useState<readonly RetainedScreen[]>([])
  // Preserve host-owned filters and galleries across tabs, and discard nested
  // hosts when their route is popped or their own tab is reset.
  const kept = visited.filter(screen => keepScreen(screen, state))
  if (activeRetained && !kept.includes(activeRetained)) kept.push(activeRetained)
  if (kept.length !== visited.length || kept.some((key, index) => key !== visited[index])) setVisited(kept)

  const route = activeRoute(state)
  const hostHasMain = !state.problem && !state.focused && route.kind === 'news'
  return (
    <>
      {kept.map(screen => {
        const hidden = screen !== activeRetained
        const sendFromHost: Send = action => { if (!hidden) send(action) }
        if (screen === 'library') {
          const browse = state.stacks.library.some(route => route.kind === 'browseMonths')
          return (
            <div key={screen} className="r06-screen" hidden={hidden} tabIndex={-1}>
              <LibraryWorkspace browse={browse} send={sendFromHost} />
            </div>
          )
        }
        return (
          <main key={screen} className="r06-screen" hidden={hidden} tabIndex={-1}>
            <Activity mode={hidden ? 'hidden' : 'visible'}>
              {screen === 'collections:notebook'
                ? <FieldNotebookHost onExit={() => sendFromHost(back)} exitLabel="Back to Collections" />
                : <SavedScriptureHost onExit={() => sendFromHost(back)} exitLabel="Back to Collections" />}
            </Activity>
          </main>
        )
      })}
      {!activeRetained && (
        <div key={activeKey} className="r06-screen" tabIndex={-1} role={hostHasMain ? undefined : 'main'}>
          <CurrentScreen state={state} send={send} />
        </div>
      )}
    </>
  )
}
