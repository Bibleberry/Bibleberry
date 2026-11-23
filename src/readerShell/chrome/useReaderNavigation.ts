import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { defaultGatewayChallengeProvider, type ChallengeDetailProvider } from '../../cms/reader/challengeDetailProvider.ts'
import { deriveReleasedChallengeDetailState } from '../../cms/reader/releasedChallengeHostModel.ts'
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

function browserAddress() {
  return { hash: window.location.hash, historyState: window.history.state }
}

// Browsers can emit popstate and hashchange for the same traversal. Two entries
// with the same hash may still have different trusted return contexts.
function sameAddress(a: ReturnType<typeof browserAddress>, b: ReturnType<typeof browserAddress>) {
  return a.hash === b.hash &&
    a.historyState?.r06Navigation?.sessionId === b.historyState?.r06Navigation?.sessionId &&
    a.historyState?.r06Navigation?.navId === b.historyState?.r06Navigation?.navId
}

interface ReaderNavigationView {
  readonly navigation: BrowserNavigation
  readonly revision: number
  readonly pending: boolean
  readonly challengeProvider?: ChallengeDetailProvider
}

export function useReaderNavigation(
  options: NavigationRouteOptions,
  captureRestoration: () => RouteRestoration | undefined,
) {
  const [view, setView] = useState<ReaderNavigationView>(() => {
    const sessionId = crypto.randomUUID?.() ?? crypto.getRandomValues(new Uint32Array(4)).join('-')
    return { navigation: createBrowserNavigation(sessionId, readSession()), revision: 0, pending: true }
  })
  const current = useRef(view.navigation)
  const revision = useRef(0)
  const awaitingBack = useRef(false)
  const pending = useRef<AbortController | null>(null)

  const rememberScreen = useCallback(() => {
    const restoration = captureRestoration()
    if (restoration) {
      current.current = applyNavigationAction(current.current, {
        type: 'saveRestoration',
        value: restoration,
      }).navigation
    }
  }, [captureRestoration])

  const commit = useCallback((update: NavigationUpdate, challengeProvider?: ChallengeDetailProvider) => {
    current.current = update.navigation
    writeSession(update.navigation)
    if (update.history.type === 'back') {
      awaitingBack.current = true
    } else {
      revision.current += 1
      setView({ navigation: update.navigation, revision: revision.current, pending: false, challengeProvider })
    }
    applyHistoryUpdate(update)
  }, [])

  const dispatch = useCallback((action: NavigationAction, sourceRevision?: number) => {
    if (pending.current || awaitingBack.current || (sourceRevision !== undefined && sourceRevision !== revision.current)) return
    rememberScreen()
    const update = applyNavigationAction(current.current, action)
    if (update.history.type !== 'none' || action.type === 'selectTab') commit(update)
  }, [commit, rememberScreen])

  useLayoutEffect(() => {
    const previousScrollRestoration = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'

    function restoreLocation(captureOutgoing = false) {
      const address = browserAddress()
      if (captureOutgoing && !pending.current) rememberScreen()
      pending.current?.abort()
      pending.current = null
      awaitingBack.current = false
      const result = restoreBrowserLocation(current.current, address, options)
      if (result.status === 'ready') {
        commit(result)
        return
      }

      const controller = new AbortController()
      pending.current = controller
      revision.current += 1
      setView({ navigation: current.current, revision: revision.current, pending: true })
      const { slug } = result
      void defaultGatewayChallengeProvider.loadChallenge(slug, { signal: controller.signal })
        .then(detail => {
          if (controller.signal.aborted || !sameAddress(address, browserAddress())) return
          const state = deriveReleasedChallengeDetailState(detail, slug, new Date())
          const authorization = state.status === 'ready' && detail.source === 'gateway'
            ? { slug, status: 'authorized', documentId: state.challenge.documentId } as const
            : { slug, status: 'unavailable' } as const
          const update = restoreBrowserLocation(current.current, address, options, authorization)
          pending.current = null
          // Share only this traversal's result with its host. Never persist teaching in history.
          if (update.status === 'ready') commit(update, { loadChallenge: async () => detail })
        })
        .catch(() => {
          if (controller.signal.aborted || !sameAddress(address, browserAddress())) return
          pending.current = null
          const update = restoreBrowserLocation(current.current, address, options, { slug, status: 'unavailable' })
          if (update.status === 'ready') commit(update)
        })
    }

    let lastPop: ReturnType<typeof browserAddress> | undefined
    function onPop() {
      restoreLocation(true)
      lastPop = browserAddress()
    }
    function onHashChange() {
      if (!lastPop || !sameAddress(lastPop, browserAddress())) restoreLocation(true)
      lastPop = undefined
    }

    function onPageHide() {
      if (!pending.current) rememberScreen()
      writeSession(current.current)
    }

    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) restoreLocation()
    }

    restoreLocation()
    window.addEventListener('popstate', onPop)
    window.addEventListener('hashchange', onHashChange)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      pending.current?.abort()
      window.history.scrollRestoration = previousScrollRestoration
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('hashchange', onHashChange)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [commit, options, rememberScreen])

  return { ...view, dispatch }
}
