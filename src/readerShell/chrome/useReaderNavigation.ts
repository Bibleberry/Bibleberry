import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { defaultGatewayChallengeProvider, type ChallengeDetailProvider } from '../../cms/reader/challengeDetailProvider.ts'
import { deriveReleasedChallengeDetailState } from '../../cms/reader/releasedChallengeHostModel.ts'
import type {
  ExternalDeepLinkSourceAdapter,
  ExternalLinkIngressPolicy,
} from '../../deepLinkIngress/types.ts'
import type { AppLifecycleEventSource } from '../../native/lifecycleAdapter.ts'
import { nativeLifecycleEvents } from '../../native/lifecycleService.ts'
import { createDefaultReaderProfile, DEFAULT_REMINDER_TIME } from '../../readerProfile/model.ts'
import type { ReaderProfileStore } from '../../readerProfile/store.ts'
import type { OnboardingStepStatus, ReaderProfile } from '../../readerProfile/types.ts'
import {
  createR06ExternalIngressBridge,
  extractRawLocationTarget,
  resolveFirstUseStep,
  shouldEvaluateFirstUseOnBoot,
} from '../entry/index.ts'
import {
  applyNativeIngress,
  applyNavigationAction,
  createBrowserNavigation,
  replaceFirstUseGuidance,
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

function historyTargetUrl(hash: string) {
  if (extractRawLocationTarget(window.location.href) !== null || window.location.search !== '') {
    return `/${hash}`
  }
  return hash
}

function applyHistoryUpdate({ history }: NavigationUpdate) {
  switch (history.type) {
    case 'push':
      window.history.pushState(history.state, '', historyTargetUrl(history.hash))
      break
    case 'replace':
      window.history.replaceState(
        { ...window.history.state, ...history.state },
        '',
        historyTargetUrl(history.hash),
      )
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

export interface ReaderEntryConfiguration {
  readonly profileStore: ReaderProfileStore
  readonly tutorialAvailable?: boolean
  readonly externalIngressSource?: ExternalDeepLinkSourceAdapter
  readonly externalIngressPolicy?: ExternalLinkIngressPolicy
  readonly lifecycleEvents?: AppLifecycleEventSource
}

export interface TutorialSaveFailure {
  readonly status: Extract<OnboardingStepStatus, 'completed' | 'skipped'>
  readonly sourceRevision: number
  readonly message: string
}

interface ReaderNavigationView {
  readonly navigation: BrowserNavigation
  readonly revision: number
  readonly pending: boolean
  readonly challengeProvider?: ChallengeDetailProvider
  readonly initialReminderTime: string
}

export function useReaderNavigation(
  options: NavigationRouteOptions,
  captureRestoration: () => RouteRestoration | undefined,
  entry: ReaderEntryConfiguration,
) {
  const {
    profileStore,
    tutorialAvailable = false,
    externalIngressSource,
    externalIngressPolicy,
    lifecycleEvents = nativeLifecycleEvents,
  } = entry

  const [initialSession] = useState(() => {
    const freshSessionId = crypto.randomUUID?.() ?? crypto.getRandomValues(new Uint32Array(4)).join('-')
    const stored = readSession()
    const navigation = createBrowserNavigation(freshSessionId, stored)
    return {
      navigation,
      restoredSession: Boolean(stored) && navigation.sessionId !== freshSessionId,
    }
  })

  const [view, setView] = useState<ReaderNavigationView>(() => ({
    navigation: initialSession.navigation,
    revision: 0,
    pending: true,
    initialReminderTime: DEFAULT_REMINDER_TIME,
  }))
  const [tutorialSaveFailure, setTutorialSaveFailure] = useState<TutorialSaveFailure | null>(null)
  const current = useRef(view.navigation)
  const profileRef = useRef<ReaderProfile>(createDefaultReaderProfile())
  const restoredSessionRef = useRef(initialSession.restoredSession)
  const initialBootSettledRef = useRef(false)
  const bypassedByExternalIngressRef = useRef(false)
  const revision = useRef(0)
  const awaitingBack = useRef(false)
  const pending = useRef<AbortController | null>(null)
  const warmIngressInFlightRef = useRef(false)
  const skipIntroInSessionRef = useRef(false)
  const skipTutorialInSessionRef = useRef(false)
  const tutorialSavingRef = useRef(false)

  const rememberScreen = useCallback(() => {
    const restoration = captureRestoration()
    if (restoration) {
      current.current = applyNavigationAction(current.current, {
        type: 'saveRestoration',
        value: restoration,
      }).navigation
    }
  }, [captureRestoration])

  const commit = useCallback((
    update: NavigationUpdate,
    challengeProvider?: ChallengeDetailProvider,
    reminderTime?: string,
  ) => {
    current.current = update.navigation
    writeSession(update.navigation)
    if (update.history.type === 'back') {
      awaitingBack.current = true
    } else {
      revision.current += 1
      setTutorialSaveFailure(null)
      setView({
        navigation: update.navigation,
        revision: revision.current,
        pending: false,
        challengeProvider,
        initialReminderTime: reminderTime ?? profileRef.current.reminder.time,
      })
    }
    applyHistoryUpdate(update)
  }, [])

  const isGuidanceFrameCurrent = useCallback(
    (sourceRevision: number, expectedKind: 'intro' | 'tutorial') => {
      if (
        pending.current ||
        warmIngressInFlightRef.current ||
        awaitingBack.current ||
        sourceRevision !== revision.current
      ) {
        return false
      }
      const { state } = current.current
      return (
        state.problem === null &&
        state.activeTab === 'today' &&
        state.stacks.today.length === 0 &&
        state.focused?.kind === expectedKind
      )
    },
    [],
  )

  const advanceFirstUse = useCallback(
    (nextProfile: ReaderProfile, sourceRevision: number, expectedKind: 'intro' | 'tutorial') => {
      profileRef.current = nextProfile
      if (!isGuidanceFrameCurrent(sourceRevision, expectedKind)) return
      const step = resolveFirstUseStep(nextProfile, {
        tutorialAvailable,
        skipIntroInSession: skipIntroInSessionRef.current,
        skipTutorialInSession: skipTutorialInSessionRef.current,
      })
      const update = replaceFirstUseGuidance(current.current, step)
      if (update.history.type === 'none') return
      commit(update, undefined, nextProfile.reminder.time)
    },
    [commit, isGuidanceFrameCurrent, tutorialAvailable],
  )

  const continueFirstUseSessionOnly = useCallback(
    (sourceRevision: number, expectedKind: 'intro' | 'tutorial') => {
      if (!isGuidanceFrameCurrent(sourceRevision, expectedKind)) return
      if (expectedKind === 'intro') {
        skipIntroInSessionRef.current = true
      } else {
        skipTutorialInSessionRef.current = true
      }
      const step = resolveFirstUseStep(profileRef.current, {
        tutorialAvailable,
        skipIntroInSession: skipIntroInSessionRef.current,
        skipTutorialInSession: skipTutorialInSessionRef.current,
      })
      const update = replaceFirstUseGuidance(current.current, step)
      if (update.history.type === 'none') return
      commit(update)
    },
    [commit, isGuidanceFrameCurrent, tutorialAvailable],
  )

  const completeFirstUseTutorial = useCallback(
    (status: Extract<OnboardingStepStatus, 'completed' | 'skipped'>, sourceRevision: number) => {
      if (tutorialSavingRef.current || !isGuidanceFrameCurrent(sourceRevision, 'tutorial')) return
      tutorialSavingRef.current = true
      setTutorialSaveFailure(null)
      void profileStore
        .setTutorialStatus(status)
        .then(updated => {
          tutorialSavingRef.current = false
          if (updated.ok) {
            advanceFirstUse(updated.profile, sourceRevision, 'tutorial')
            return
          }
          if (!isGuidanceFrameCurrent(sourceRevision, 'tutorial')) return
          setTutorialSaveFailure({
            status,
            sourceRevision,
            message:
              'Your tutorial status could not be saved on this device. You can try again or continue to Today for this session.',
          })
        })
        .catch(() => {
          tutorialSavingRef.current = false
          if (!isGuidanceFrameCurrent(sourceRevision, 'tutorial')) return
          setTutorialSaveFailure({
            status,
            sourceRevision,
            message:
              'Your tutorial status could not be saved on this device. You can try again or continue to Today for this session.',
          })
        })
    },
    [advanceFirstUse, isGuidanceFrameCurrent, profileStore],
  )

  const dispatch = useCallback((action: NavigationAction, sourceRevision?: number) => {
    if (
      pending.current ||
      warmIngressInFlightRef.current ||
      awaitingBack.current ||
      (sourceRevision !== undefined && sourceRevision !== revision.current)
    ) {
      return
    }
    rememberScreen()
    const update = applyNavigationAction(current.current, action)
    if (update.history.type !== 'none' || action.type === 'selectTab') commit(update)
  }, [commit, rememberScreen])

  useEffect(() => {
    let active = true
    const syncLoaded = () => {
      void profileStore.load().then(({ profile }) => {
        if (!active) return
        profileRef.current = profile
      })
    }
    const unsubscribeStore = profileStore.subscribe(profile => {
      if (!active) return
      profileRef.current = profile
    })
    const unsubscribeExternal = profileStore.subscribeExternalChanges?.(syncLoaded)
    const unsubscribeLifecycle = lifecycleEvents.subscribe(event => {
      if (event === 'foreground') syncLoaded()
    })
    return () => {
      active = false
      unsubscribeStore()
      unsubscribeExternal?.()
      unsubscribeLifecycle()
    }
  }, [lifecycleEvents, profileStore])

  useLayoutEffect(() => {
    const previousScrollRestoration = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'

    const ingressBridge = createR06ExternalIngressBridge({
      destinationOptions: options,
      challengeProvider: defaultGatewayChallengeProvider,
      policy: externalIngressPolicy,
      source: externalIngressSource,
      locationHref: () => window.location.href,
      locationPolicyOrigin: window.location,
      onWarmIngressStart() {
        warmIngressInFlightRef.current = true
        // Invalidate startup work before its cancelled authorization can settle.
        pending.current?.abort()
      },
      onOutcome(outcome, verifiedProvider) {
        if (outcome.status === 'ignoredDuplicate') return
        warmIngressInFlightRef.current = false
        if (!pending.current) rememberScreen()
        pending.current?.abort()
        pending.current = null
        awaitingBack.current = false
        bypassedByExternalIngressRef.current = true
        initialBootSettledRef.current = true
        void profileStore.load().then(({ profile }) => {
          profileRef.current = profile
        })
        const update = applyNativeIngress(current.current, outcome, options)
        commit(update, update.navigation.state.focused ? verifiedProvider : undefined)
      },
    })

    function restoreLocation(captureOutgoing = false) {
      const address = browserAddress()
      if (captureOutgoing && !pending.current) rememberScreen()
      pending.current?.abort()
      pending.current = null
      awaitingBack.current = false
      const result = restoreBrowserLocation(current.current, address, options)
      if (result.status === 'ready') {
        if (result.navigation.state.problem !== null) {
          bypassedByExternalIngressRef.current = true
          initialBootSettledRef.current = true
          void profileStore.load().then(({ profile }) => {
            profileRef.current = profile
          })
          commit(result)
          return
        }

        if (
          !initialBootSettledRef.current &&
          shouldEvaluateFirstUseOnBoot({
            restoredSession: restoredSessionRef.current,
            bypassedByExternalIngress: bypassedByExternalIngressRef.current,
            state: result.navigation.state,
          })
        ) {
          const controller = new AbortController()
          pending.current = controller
          revision.current += 1
          setView(previous => ({
            ...previous,
            navigation: current.current,
            revision: revision.current,
            pending: true,
          }))
          void profileStore.load().then(({ profile }) => {
            if (controller.signal.aborted || !sameAddress(address, browserAddress())) return
            pending.current = null
            profileRef.current = profile
            initialBootSettledRef.current = true
            const step = resolveFirstUseStep(profile, { tutorialAvailable })
            const gated = replaceFirstUseGuidance(result.navigation, step)
            const finalUpdate: NavigationUpdate =
              gated.history.type === 'none'
                ? { navigation: gated.navigation, history: result.history }
                : gated
            commit(finalUpdate, undefined, profile.reminder.time)
          })
          return
        }

        initialBootSettledRef.current = true
        void profileStore.load().then(({ profile }) => {
          profileRef.current = profile
        })
        commit(result)
        return
      }

      const controller = new AbortController()
      pending.current = controller
      revision.current += 1
      setView(previous => ({
        ...previous,
        navigation: current.current,
        revision: revision.current,
        pending: true,
      }))
      void profileStore.load().then(({ profile }) => {
        profileRef.current = profile
      })
      const { slug } = result
      void defaultGatewayChallengeProvider.loadChallenge(slug, { signal: controller.signal })
        .catch(() => ({ status: 'requestError', message: 'Content gateway unavailable' } as const))
        .then(detail => {
          if (controller.signal.aborted || !sameAddress(address, browserAddress())) return
          const admitted = deriveReleasedChallengeDetailState(detail, slug, new Date())
          const authorization = detail.status === 'ready' && detail.source === 'gateway' && admitted.status === 'ready'
            ? { slug, status: 'authorized', documentId: admitted.challenge.documentId } as const
            : { slug, status: 'unavailable' } as const
          const update = restoreBrowserLocation(current.current, address, options, authorization)
          pending.current = null
          if (update.status === 'ready') {
            bypassedByExternalIngressRef.current = true
            initialBootSettledRef.current = true
            // Reuse the verified response only for this visit. History stores no teaching.
            const provider = update.navigation.state.focused ? { loadChallenge: async () => detail } : undefined
            commit(update, provider)
          }
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

    const hasColdExternalIngress = Boolean(
      externalIngressSource?.getInitialUrl || extractRawLocationTarget(window.location.href),
    )

    if (hasColdExternalIngress) {
      const controller = new AbortController()
      pending.current = controller
      revision.current += 1
      setView(previous => ({
        ...previous,
        navigation: current.current,
        revision: revision.current,
        pending: true,
      }))
      void profileStore.load().then(({ profile }) => {
        profileRef.current = profile
      })
      void ingressBridge.start().then(started => {
        if (controller.signal.aborted) return
        pending.current = null
        if (!started || started.outcome.status === 'ignoredDuplicate') {
          if (warmIngressInFlightRef.current) return
          restoreLocation()
          return
        }
        bypassedByExternalIngressRef.current = true
        initialBootSettledRef.current = true
        const update = applyNativeIngress(current.current, started.outcome, options)
        commit(update, update.navigation.state.focused ? started.verifiedProvider : undefined)
      })
    } else {
      if (externalIngressSource?.subscribeUrlOpen) {
        void ingressBridge.start()
      }
      restoreLocation()
    }

    window.addEventListener('popstate', onPop)
    window.addEventListener('hashchange', onHashChange)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      warmIngressInFlightRef.current = false
      ingressBridge.stop()
      pending.current?.abort()
      window.history.scrollRestoration = previousScrollRestoration
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('hashchange', onHashChange)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [
    commit,
    externalIngressPolicy,
    externalIngressSource,
    options,
    profileStore,
    rememberScreen,
    tutorialAvailable,
  ])

  return {
    ...view,
    tutorialSaveFailure,
    dispatch,
    advanceFirstUse,
    continueFirstUseSessionOnly,
    completeFirstUseTutorial,
  }
}
