import { useCallback, useLayoutEffect, useRef } from 'react'
import { ReaderNavigation } from './chrome/ReaderNavigation.tsx'
import { ReaderScreens } from './chrome/ReaderScreens.tsx'
import { captureScreenRestoration, restoreScreen } from './chrome/screenRestoration.ts'
import { useReaderNavigation } from './chrome/useReaderNavigation.ts'
import { activeRestoration, globalNavigation } from './navigation/index.ts'
import { readerRouteOptions } from './navigation/routeTable.ts'
import '../App.css'
import './readerShell.css'

const routeOptions = readerRouteOptions()

export default function R06ReaderShell() {
  const viewport = useRef<HTMLDivElement>(null)
  const lastFocused = useRef<HTMLElement | null>(null)
  const captureRestoration = useCallback(() => (
    viewport.current ? captureScreenRestoration(viewport.current, lastFocused.current) : undefined
  ), [])
  const { navigation, revision, dispatch, pending, challengeProvider } = useReaderNavigation(routeOptions, captureRestoration)
  const { state } = navigation

  useLayoutEffect(() => {
    if (!viewport.current || pending) return
    lastFocused.current = null
    const restoration = state.problem || state.focused ? undefined : activeRestoration(state)
    return restoreScreen(viewport.current, restoration, revision > 0)
  }, [state, revision, pending])

  return (
    <div className="r06-shell">
      <div
        className="r06-viewport"
        ref={viewport}
        onFocusCapture={event => {
          if (event.target instanceof HTMLElement) lastFocused.current = event.target
        }}
      >
        <ReaderScreens
          state={state}
          send={action => dispatch(action, revision)}
          pending={pending}
          challengeProvider={challengeProvider}
        />
      </div>
      {!pending && globalNavigation(state) !== 'hidden' && (
        <ReaderNavigation activeTab={state.activeTab} onSelectTab={tab => dispatch({ type: 'selectTab', tab })} />
      )}
    </div>
  )
}
