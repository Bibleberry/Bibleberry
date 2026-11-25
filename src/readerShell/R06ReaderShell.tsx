import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type {
  ExternalDeepLinkSourceAdapter,
  ExternalLinkIngressPolicy,
} from '../deepLinkIngress/types.ts'
import type { AppLifecycleEventSource } from '../native/lifecycleAdapter.ts'
import { createPlatformReaderProfileStore } from '../readerProfile/platformStore.ts'
import type { ReaderProfileStore } from '../readerProfile/store.ts'
import { ReaderNavigation } from './chrome/ReaderNavigation.tsx'
import { ReaderScreens } from './chrome/ReaderScreens.tsx'
import { captureScreenRestoration, restoreScreen } from './chrome/screenRestoration.ts'
import { useReaderNavigation } from './chrome/useReaderNavigation.ts'
import type { GuidedTutorialRenderer } from './entry/index.ts'
import { activeRestoration, globalNavigation, type RouteRestoration } from './navigation/index.ts'
import { readerRouteOptions } from './navigation/routeTable.ts'
import '../App.css'
import './readerShell.css'

const routeOptions = readerRouteOptions()

export interface R06ReaderShellProps {
  readonly profileStore?: ReaderProfileStore
  readonly renderGuidedTutorial?: GuidedTutorialRenderer
  readonly externalIngressSource?: ExternalDeepLinkSourceAdapter
  readonly externalIngressPolicy?: ExternalLinkIngressPolicy
  readonly lifecycleEvents?: AppLifecycleEventSource
}

export default function R06ReaderShell({
  profileStore: injectedProfileStore,
  renderGuidedTutorial,
  externalIngressSource,
  externalIngressPolicy,
  lifecycleEvents,
}: R06ReaderShellProps = {}) {
  const [defaultProfileStore] = useState(() => injectedProfileStore ?? createPlatformReaderProfileStore())
  const profileStore = injectedProfileStore ?? defaultProfileStore
  const viewport = useRef<HTMLDivElement>(null)
  const replayRestoration = useRef<RouteRestoration | undefined>(undefined)
  const stopReplayRestoration = useRef<(() => void) | undefined>(undefined)
  const lastFocused = useRef<HTMLElement | null>(null)
  const captureRestoration = useCallback(() => (
    viewport.current ? captureScreenRestoration(viewport.current, lastFocused.current) ?? replayRestoration.current : undefined
  ), [])
  const captureReplayReturn = useCallback(() => {
    const element = viewport.current
    const saved = captureRestoration()
    if (!element || !saved) return
    replayRestoration.current = saved
    element.scrollTop = 0
    return () => {
      replayRestoration.current = undefined
      stopReplayRestoration.current?.()
      stopReplayRestoration.current = restoreScreen(element, saved, false)
    }
  }, [captureRestoration])
  const {
    navigation,
    revision,
    dispatch,
    pending,
    challengeProvider,
    initialReminderTime,
    advanceFirstUse,
    completeFirstUseTutorial,
  } = useReaderNavigation(routeOptions, captureRestoration, {
    profileStore,
    tutorialAvailable: Boolean(renderGuidedTutorial),
    externalIngressSource,
    externalIngressPolicy,
    lifecycleEvents,
  })
  const { state } = navigation

  useLayoutEffect(() => {
    if (!viewport.current || pending) return
    lastFocused.current = null
    const restoration = state.problem || state.focused ? undefined : activeRestoration(state)
    const stop = restoreScreen(viewport.current, restoration, revision > 0)
    return () => {
      stop?.()
      replayRestoration.current = undefined
      stopReplayRestoration.current?.()
      stopReplayRestoration.current = undefined
    }
  }, [state, revision, pending])

  const navState = globalNavigation(state)
  const displayedTab = state.focused?.kind === 'tutorial' ? state.focused.shownTab : state.activeTab

  return (
    <div className="r06-shell">
      <div
        className="r06-viewport"
        ref={viewport}
        onFocusCapture={event => {
          if (!(event.target instanceof HTMLElement)) return
          lastFocused.current = event.target
          if (state.focused?.kind === 'challenge' && event.target.matches('.challenge-player__screen-heading')) {
            event.currentTarget.scrollTop = 0
          }
        }}
      >
        <ReaderScreens
          state={state}
          send={action => dispatch(action, revision)}
          pending={pending}
          challengeProvider={challengeProvider}
          captureReplayReturn={captureReplayReturn}
          profileStore={profileStore}
          initialReminderTime={initialReminderTime}
          onFirstUseIntroFinished={advanceFirstUse}
          onFirstUseTutorialFinished={completeFirstUseTutorial}
          renderGuidedTutorial={renderGuidedTutorial}
        />
      </div>
      {!pending && navState !== 'hidden' && (
        <ReaderNavigation
          activeTab={displayedTab}
          onSelectTab={tab =>
            dispatch(
              navState === 'guided'
                ? { type: 'showTutorialTab', tab }
                : { type: 'selectTab', tab },
            )
          }
        />
      )}
    </div>
  )
}
