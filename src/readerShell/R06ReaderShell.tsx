import { useCallback, useLayoutEffect, useRef } from 'react'
import { ReaderNavigation } from './chrome/ReaderNavigation.tsx'
import { ReaderScreens } from './chrome/ReaderScreens.tsx'
import { captureScreenRestoration, restoreScreen } from './chrome/screenRestoration.ts'
import { useReaderNavigation } from './chrome/useReaderNavigation.ts'
import { activeRestoration, globalNavigation, type RouteRestoration } from './navigation/index.ts'
import { readerRouteOptions } from './navigation/routeTable.ts'
import '../App.css'
import './readerShell.css'

const routeOptions = readerRouteOptions()

export default function R06ReaderShell() {
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
  const { navigation, revision, dispatch, pending, challengeProvider } = useReaderNavigation(routeOptions, captureRestoration)
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
        />
      </div>
      {!pending && globalNavigation(state) !== 'hidden' && (
        <ReaderNavigation activeTab={state.activeTab} onSelectTab={tab => dispatch({ type: 'selectTab', tab })} />
      )}
    </div>
  )
}
