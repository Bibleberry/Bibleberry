import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import {
  applyNavigationAction,
  createBrowserNavigation,
  restoreBrowserLocation,
  serializeBrowserNavigation,
  type BrowserNavigation,
  type NavigationAction,
  type NavigationRouteOptions,
  type NavigationUpdate,
  type RouteRestoration,
} from '../navigation/index.ts'

const sessionKey = 'bibleberry-r06-navigation-v1'

function readSession() {
  try {
    return window.sessionStorage.getItem(sessionKey)
  } catch {
    return null
  }
}

function writeSession(navigation: BrowserNavigation) {
  try {
    window.sessionStorage.setItem(sessionKey, serializeBrowserNavigation(navigation))
  } catch {
    // Continue using the live navigation session when storage is unavailable.
  }
}

function readLocation(navigation: BrowserNavigation, options: NavigationRouteOptions): NavigationUpdate {
  const address = { hash: window.location.hash, historyState: window.history.state }
  const result = restoreBrowserLocation(navigation, address, options)
  if (result.status === 'ready') return result

  // The focused reader and its gateway authorization are a later integration.
  // Resolve every Challenge arrival to the adapter's neutral unavailable screen.
  const unavailable = restoreBrowserLocation(navigation, address, options, {
    slug: result.slug,
    status: 'unavailable',
  })
  if (unavailable.status === 'ready') return unavailable
  return applyNavigationAction(navigation, { type: 'unavailable', problem: 'challengeUnavailable' })
}

function applyHistoryUpdate({ history }: NavigationUpdate) {
  switch (history.type) {
    case 'push':
      window.history.pushState(history.state, '', history.hash)
      break
    case 'replace':
      window.history.replaceState({ ...window.history.state, ...history.state }, '', history.hash)
      break
    case 'back':
      window.history.back()
      break
  }
}

interface ReaderNavigationView {
  readonly navigation: BrowserNavigation
  readonly revision: number
}

export function useReaderNavigation(
  options: NavigationRouteOptions,
  captureRestoration: () => RouteRestoration | undefined,
) {
  const [initial] = useState(() => {
    const sessionId = crypto.randomUUID?.() ?? crypto.getRandomValues(new Uint32Array(4)).join('-')
    return readLocation(createBrowserNavigation(sessionId, readSession()), options)
  })
  const [view, setView] = useState<ReaderNavigationView>({ navigation: initial.navigation, revision: 0 })
  const current = useRef(initial.navigation)
  const revision = useRef(0)
  const initialized = useRef(false)
  const awaitingBack = useRef(false)

  const rememberScreen = useCallback(() => {
    const restoration = captureRestoration()
    if (restoration) {
      current.current = applyNavigationAction(current.current, {
        type: 'saveRestoration',
        value: restoration,
      }).navigation
    }
  }, [captureRestoration])

  const commit = useCallback((update: NavigationUpdate) => {
    current.current = update.navigation
    writeSession(update.navigation)
    if (update.history.type === 'back') {
      awaitingBack.current = true
    } else {
      revision.current += 1
      setView({ navigation: update.navigation, revision: revision.current })
    }
    applyHistoryUpdate(update)
  }, [])

  const dispatch = useCallback((action: NavigationAction, sourceRevision?: number) => {
    if (awaitingBack.current || (sourceRevision !== undefined && sourceRevision !== revision.current)) return
    rememberScreen()
    const update = applyNavigationAction(current.current, action)
    if (update.history.type !== 'none' || action.type === 'selectTab') commit(update)
  }, [commit, rememberScreen])

  useLayoutEffect(() => {
    if (!initialized.current) {
      initialized.current = true
      writeSession(initial.navigation)
      applyHistoryUpdate(initial)
    }

    function onLocationChange() {
      const result = readLocation(current.current, options)
      awaitingBack.current = false
      // A single traversal can emit both popstate and hashchange.
      if (result.history.type === 'none' && result.navigation.currentId === current.current.currentId) return
      rememberScreen()
      commit(readLocation(current.current, options))
    }

    function onPageHide() {
      rememberScreen()
      writeSession(current.current)
    }

    window.addEventListener('popstate', onLocationChange)
    window.addEventListener('hashchange', onLocationChange)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('popstate', onLocationChange)
      window.removeEventListener('hashchange', onLocationChange)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [commit, initial, options, rememberScreen])

  return { ...view, dispatch }
}
