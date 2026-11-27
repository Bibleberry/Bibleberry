import { Activity, useState, type ReactNode } from 'react'
import { LibraryRouteVisible } from '../../components/library/libraryRouteVisibility.ts'
import { AppLibraryShelfHost } from '../../appIntegration/AppLibraryShelfHost.tsx'
import { ReleasedChallengeHost } from '../../cms/reader/ReleasedChallengeHost.tsx'
import type { ChallengeDetailProvider } from '../../cms/reader/challengeDetailProvider.ts'
import { MonthScreenHost } from '../../components/month/MonthScreenHost.tsx'
import { FieldNotebookHost } from '../../components/notebook/FieldNotebookHost.tsx'
import { SavedScriptureHost } from '../../components/savedScripture/SavedScriptureHost.tsx'
import { NewsReaderHost } from '../../components/news/NewsReaderHost.tsx'
import type { ReaderProfileStore } from '../../readerProfile/store.ts'
import type { OnboardingStepStatus, ReaderProfile } from '../../readerProfile/types.ts'
import { FirstUseIntroduction } from '../entry/FirstUseIntroduction.tsx'
import type { GuidedTutorialRenderer } from '../entry/index.ts'
import type { TutorialSaveFailure } from './useReaderNavigation.ts'
import { activeRoute, type NavigationAction, type NavigationState } from '../navigation/index.ts'
import { activeScreenKey } from '../navigation/routeTable.ts'
import { MoreLanding } from './MoreLanding.tsx'
import { MoreIntroductionReplay } from './MoreIntroductionReplay.tsx'
import { AccountProgressScreen } from './AccountProgressScreen.tsx'
import { CollectionsLanding } from '../collections/CollectionsLanding.tsx'
import { TodayHost } from '../today/TodayHost.tsx'
import { encodeDiscoveriesBatch, VIEW_DISCOVERIES_SCREEN } from '../today/discoveriesBatch.ts'
import { ViewDiscoveriesGallery } from '../today/ViewDiscoveriesGallery.tsx'

type Send = (action: NavigationAction) => void

const browseMonths = { type: 'push', route: { kind: 'browseMonths' } } as const
const foundations = { type: 'push', route: { kind: 'detail', screen: 'foundations' } } as const
const openNews = { type: 'push', route: { kind: 'news', category: 'all' } } as const
const back = { type: 'pop' } as const

function openMonth(send: Send, yearMonth: string) {
  send({ type: 'push', route: { kind: 'month', yearMonth } })
}

function openNewsArticle(send: Send, documentId: string) {
  send({ type: 'push', route: { kind: 'detail', screen: 'newsArticle', id: documentId } })
}

function Action({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return <button type="button" className="button button--secondary" onClick={onClick}>{children}</button>
}

function Landing({ title, children }: { title: string; children: ReactNode }) {
  return <div className="r06-landing"><h1>{title}</h1>{children}</div>
}

function TodayLanding({ send, profileStore }: { send: Send; profileStore: ReaderProfileStore }) {
  return (
    <TodayHost
      profileStore={profileStore}
      onOpenChallenge={intent => {
        send({
          type: 'openChallenge',
          slug: intent.slug,
          expectedDocumentId: intent.expectedDocumentId,
        })
      }}
      onOpenMonth={intent => openMonth(send, intent.yearMonth)}
      onOpenNews={() => send(openNews)}
      onOpenAccountProgress={() => send({ type: 'push', route: { kind: 'detail', screen: 'accountProgress' } })}
      onViewDiscoveries={awardIds => {
        const id = encodeDiscoveriesBatch(awardIds)
        if (!id) return false
        send({ type: 'push', route: { kind: 'detail', screen: VIEW_DISCOVERIES_SCREEN, id } })
        return true
      }}
    />
  )
}

function LibraryWorkspace({ browse, send }: { browse: boolean; send: Send }) {
  return (
    <AppLibraryShelfHost
      surface={browse ? 'library' : 'shelf'}
      onSurfaceChange={surface => send(surface === 'shelf' ? back : browseMonths)}
      onOpenMonth={(yearMonth, context) => {
        if (context.origin === (browse ? 'library' : 'shelf')) openMonth(send, yearMonth)
      }}
      onOpenFoundations={() => send(foundations)}
      onExit={browse ? () => send(back) : undefined}
      exitLabel="Back to Shelf"
    />
  )
}

function RouteProblem({ state, send }: { state: NavigationState; send: Send }) {
  const challenge = state.problem === 'challengeUnavailable' || state.focused?.kind === 'challenge'
  const returnToContext = challenge && (activeRoute(state).kind !== 'landing' || state.activeTab !== 'today')
  const month = state.problem === 'externalMonth'
  const title = challenge ? 'Challenge unavailable' : month ? 'Month unavailable' : 'Page unavailable'
  return (
    <Landing title={title}>
      <Action onClick={() => send(returnToContext ? back : { type: 'returnToToday' })}>
        {returnToContext ? 'Back' : 'Return to Today'}
      </Action>
    </Landing>
  )
}

function UnavailableDetail({ screen, send }: { screen: string; send: Send }) {
  const challenge = screen === 'challengeUnavailable'
  const title = challenge ? 'Challenge unavailable' : screen === 'foundations' ? 'Foundations' : 'Page unavailable'
  const backLabel = challenge ? 'Back to Month' : screen === 'foundations' ? 'Back to Library' : 'Back'
  return (
    <Landing title={title}>
      {screen === 'foundations' && <h2>Foundations unavailable</h2>}
      <Action onClick={() => send(back)}>{backLabel}</Action>
    </Landing>
  )
}

interface ScreenProps {
  state: NavigationState
  revision: number
  send: Send
  challengeProvider?: ChallengeDetailProvider
  captureReplayReturn: () => (() => void) | undefined
  profileStore: ReaderProfileStore
  initialReminderTime: string
  tutorialSaveFailure: TutorialSaveFailure | null
  onFirstUseIntroFinished: (profile: ReaderProfile, sourceRevision: number) => void
  onFirstUseIntroContinueSessionOnly: (sourceRevision: number) => void
  onFirstUseTutorialFinished: (
    status: Extract<OnboardingStepStatus, 'completed' | 'skipped'>,
    sourceRevision: number,
  ) => void
  onFirstUseTutorialContinueSessionOnly: (sourceRevision: number) => void
  renderGuidedTutorial?: GuidedTutorialRenderer
}

function CurrentScreen({
  state,
  revision,
  send,
  challengeProvider,
  captureReplayReturn,
  profileStore,
  initialReminderTime,
  tutorialSaveFailure,
  onFirstUseIntroFinished,
  onFirstUseIntroContinueSessionOnly,
  onFirstUseTutorialFinished,
  onFirstUseTutorialContinueSessionOnly,
  renderGuidedTutorial,
}: ScreenProps) {
  const focus = state.focused
  if (!state.problem && focus?.kind === 'challenge') {
    return (
      <ReleasedChallengeHost
        slug={focus.slug}
        origin={focus.origin}
        expectedDocumentId={focus.expectedDocumentId}
        requireGatewayAuthorization
        challengeProvider={challengeProvider}
        exitLabel="Exit"
        onExit={() => send({ type: 'exitChallenge' })}
        onFinish={() => send({ type: 'finishChallenge' })}
      />
    )
  }
  if (!state.problem && focus?.kind === 'intro' && state.activeTab === 'today') {
    return (
      <FirstUseIntroduction
        store={profileStore}
        initialReminderTime={initialReminderTime}
        revision={revision}
        onFinished={onFirstUseIntroFinished}
        onContinueSessionOnly={onFirstUseIntroContinueSessionOnly}
      />
    )
  }
  if (!state.problem && focus?.kind === 'intro' && state.activeTab === 'more') {
    return <MoreIntroductionReplay store={profileStore} onBack={() => send({ type: 'closeGuidance' })} />
  }
  if (
    !state.problem &&
    focus?.kind === 'tutorial' &&
    renderGuidedTutorial &&
    (state.activeTab === 'today' || state.activeTab === 'more')
  ) {
    const mode = state.activeTab === 'today' ? 'first-use' : 'replay'
    return (
      <>
        {mode === 'first-use' && tutorialSaveFailure && (
          <div role="alert" className="r06-landing" data-testid="first-use-tutorial-save-failure">
            <p>{tutorialSaveFailure.message}</p>
            <div className="r06-actions">
              <button
                type="button"
                className="button button--secondary"
                data-testid="first-use-tutorial-retry-save-button"
                onClick={() => onFirstUseTutorialFinished(tutorialSaveFailure.status, revision)}
              >
                Try Again
              </button>
              <button
                type="button"
                className="button button--secondary"
                data-testid="first-use-tutorial-continue-session-button"
                onClick={() => onFirstUseTutorialContinueSessionOnly(revision)}
              >
                Continue Without Saving
              </button>
            </div>
          </div>
        )}
        {renderGuidedTutorial({
          mode,
          shownTab: focus.shownTab,
          onShowTab: tab => send({ type: 'showTutorialTab', tab }),
          onComplete: () => {
            if (mode === 'first-use') {
              onFirstUseTutorialFinished('completed', revision)
            } else {
              send({ type: 'closeGuidance' })
            }
          },
          onSkip: () => {
            if (mode === 'first-use') {
              onFirstUseTutorialFinished('skipped', revision)
            } else {
              send({ type: 'closeGuidance' })
            }
          },
        })}
      </>
    )
  }
  if (state.problem || focus) return <RouteProblem state={state} send={send} />

  const route = activeRoute(state)
  if (route.kind === 'landing') {
    switch (route.tab) {
      case 'today':
        return <TodayLanding send={send} profileStore={profileStore} />
      case 'collections':
        return (
          <CollectionsLanding
            onOpenNotebook={() => send({ type: 'push', route: { kind: 'notebook' } })}
            onOpenSavedScripture={() => send({ type: 'push', route: { kind: 'savedScripture' } })}
          />
        )
      case 'more':
        return (
          <MoreLanding
            onOpenFeatured={documentId => openNewsArticle(send, documentId)}
            onOpenNews={() => send(openNews)}
            onOpenAbout={() => send({ type: 'push', route: { kind: 'detail', screen: 'aboutBibleberry' } })}
            onOpenAccountProgress={() => send({ type: 'push', route: { kind: 'detail', screen: 'accountProgress' } })}
            onReplayIntroduction={() => send({ type: 'openIntro' })}
          />
        )
    }
  }

  switch (route.kind) {
    case 'month':
      return (
        <MonthScreenHost
          yearMonth={route.yearMonth}
          inReaderShell
          captureReplayReturn={captureReplayReturn}
          onSelectYearMonth={yearMonth => openMonth(send, yearMonth)}
          onOpenChallenge={(slug, yearMonth, expectedDocumentId) => {
            if (yearMonth === route.yearMonth) send({ type: 'openChallenge', slug, expectedDocumentId })
          }}
          onExit={() => send(back)}
          exitLabel="Back"
        />
      )
    case 'news':
      return (
        <NewsReaderHost
          initialCategory={route.category}
          onCategoryChange={category => send({ type: 'setNewsCategory', category })}
          onOpenArticle={documentId => openNewsArticle(send, documentId)}
          onNavigate={({ monthId }) => openMonth(send, monthId)}
          onBack={() => send({ type: 'closeNews' })}
        />
      )
    case 'detail':
      if (route.screen === 'newsArticle' && route.id) {
        return (
          <NewsReaderHost
            articleDocumentId={route.id}
            onNavigate={({ monthId }) => openMonth(send, monthId)}
            onBack={() => send(back)}
          />
        )
      }
      if (route.screen === VIEW_DISCOVERIES_SCREEN && route.id && state.activeTab === 'today') {
        return (
          <ViewDiscoveriesGallery
            batch={route.id}
            onReturnToToday={() => send(back)}
            onBrowseFieldNotebook={() => send({ type: 'openFieldNotebook' })}
          />
        )
      }
      if (route.screen === 'aboutBibleberry') {
        return (
          <Landing title="About Bibleberry">
            <p>Bibleberry is offered by Spiritually Hungry.</p>
            <Action onClick={() => send(back)}>Back to More</Action>
          </Landing>
        )
      }
      if (route.screen === 'accountProgress') {
        return (
          <AccountProgressScreen
            profileStore={profileStore}
            onBack={() => send(back)}
            backLabel={state.activeTab === 'more' ? 'Back to More' : 'Back to Today'}
          />
        )
      }
      return <UnavailableDetail screen={route.screen} send={send} />
    default:
      return <UnavailableDetail screen={route.kind} send={send} />
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

export function ReaderScreens({
  state,
  revision,
  send,
  challengeProvider,
  captureReplayReturn,
  profileStore,
  initialReminderTime,
  tutorialSaveFailure,
  onFirstUseIntroFinished,
  onFirstUseIntroContinueSessionOnly,
  onFirstUseTutorialFinished,
  onFirstUseTutorialContinueSessionOnly,
  renderGuidedTutorial,
  pending,
}: ScreenProps & { pending: boolean }) {
  const activeKey = pending ? 'pending' : activeScreenKey(state)
  const activeRetained = retainedScreen(activeKey)
  const [visited, setVisited] = useState<readonly RetainedScreen[]>([])
  // Preserve host-owned filters and galleries across tabs, and discard nested
  // hosts when their route is popped or their own tab is reset.
  const kept = visited.filter(screen => keepScreen(screen, state))
  if (activeRetained && !kept.includes(activeRetained)) kept.push(activeRetained)
  if (kept.length !== visited.length || kept.some((key, index) => key !== visited[index])) setVisited(kept)

  const route = activeRoute(state)
  const monthScreen = !pending && !state.problem && !state.focused && route.kind === 'month'
  const newsReader = !state.problem && !state.focused && (
    route.kind === 'news' || (route.kind === 'detail' && route.screen === 'newsArticle' && Boolean(route.id))
  )
  const moreLanding = !state.problem && !state.focused && route.kind === 'landing' && route.tab === 'more'
  const introScreen =
    !state.problem &&
    state.focused?.kind === 'intro' &&
    (state.activeTab === 'today' || state.activeTab === 'more')
  return (
    <>
      {kept.map(screen => {
        const hidden = screen !== activeRetained
        const sendFromHost: Send = action => { if (!hidden) send(action) }
        if (screen === 'library') {
          const browse = state.stacks.library.some(route => route.kind === 'browseMonths')
          return (
            <div key={screen} className="r06-screen" hidden={hidden} tabIndex={-1}>
              <LibraryRouteVisible value={!hidden}>
                <LibraryWorkspace browse={browse} send={sendFromHost} />
              </LibraryRouteVisible>
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
        <div
          key={activeKey}
          className="r06-screen"
          tabIndex={-1}
          data-month-screen={monthScreen || undefined}
          data-news-screen={!pending && (newsReader || moreLanding) || undefined}
          role={!pending && (newsReader || introScreen) ? undefined : 'main'}
        >
          {pending
            ? <p role="status">Opening Bibleberry…</p>
            : (
                <CurrentScreen
                  state={state}
                  revision={revision}
                  send={send}
                  challengeProvider={challengeProvider}
                  captureReplayReturn={captureReplayReturn}
                  profileStore={profileStore}
                  initialReminderTime={initialReminderTime}
                  tutorialSaveFailure={tutorialSaveFailure}
                  onFirstUseIntroFinished={onFirstUseIntroFinished}
                  onFirstUseIntroContinueSessionOnly={onFirstUseIntroContinueSessionOnly}
                  onFirstUseTutorialFinished={onFirstUseTutorialFinished}
                  onFirstUseTutorialContinueSessionOnly={onFirstUseTutorialContinueSessionOnly}
                  renderGuidedTutorial={renderGuidedTutorial}
                />
              )}
        </div>
      )}
    </>
  )
}
