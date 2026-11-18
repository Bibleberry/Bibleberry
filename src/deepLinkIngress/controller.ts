import { authorizeExternalDeepLink } from './authorizer.ts'
import { createUnavailableContentOutcome } from './outcomes.ts'
import { parseExternalDeepLink } from './parser.ts'
import type {
  DeepLinkControllerState,
  DeepLinkDuplicateIgnoredOutcome,
  DeepLinkIngressController,
  DeepLinkIngressControllerOptions,
  DeepLinkIngressOutcome,
  DeepLinkNavigatedOutcome,
  DeepLinkUnavailableOutcome,
  IncomingDeepLinkSource,
  IncomingDeepLinkTrigger,
} from './types.ts'

const DEFAULT_DEDUPE_WINDOW_MS = 2000

/**
 * Creates a testable, platform-neutral controller that coordinates external
 * deep-link parsing, gateway content authorization, cold starts, resumed
 * sessions, latest-wins concurrency, and duplicate incoming-link suppression.
 */
export function createDeepLinkIngressController(
  options: DeepLinkIngressControllerOptions,
): DeepLinkIngressController {
  const dedupeWindowMs = options.dedupeWindowMs ?? DEFAULT_DEDUPE_WINDOW_MS
  const now = options.now ?? (() => Date.now())

  let started = false
  let lifecycleGeneration = 0
  let unsubscribeUrlOpen: (() => void) | null = null
  let inFlightAbortController: AbortController | null = null
  let inFlightKey: string | null = null
  let requestSequence = 0

  let lastHandledKey: string | null = null
  let lastHandledAtMs = -Infinity

  let state: DeepLinkControllerState = {
    started: false,
    phase: 'idle',
    activeDestination: null,
    activeInternalHash: null,
    lastUnavailableOutcome: null,
    lastOutcome: null,
  }

  function isDuplicate(dedupeKey: string, receivedAtMs: number): boolean {
    if (inFlightKey !== null && inFlightKey === dedupeKey) {
      return true
    }
    if (lastHandledKey !== null && lastHandledKey === dedupeKey) {
      return receivedAtMs - lastHandledAtMs < dedupeWindowMs
    }
    return false
  }

  function recordHandled(dedupeKey: string, timestampMs: number): void {
    lastHandledKey = dedupeKey
    lastHandledAtMs = timestampMs
  }

  async function handleIncomingUrl(
    rawUrl: unknown,
    trigger: IncomingDeepLinkTrigger,
  ): Promise<DeepLinkIngressOutcome> {
    const receivedAtMs = now()
    const rawString = typeof rawUrl === 'string' ? rawUrl : ''
    const sourceEvent: IncomingDeepLinkSource = {
      trigger,
      rawUrl: rawString,
      receivedAtMs,
    }

    const parsed = parseExternalDeepLink(rawUrl, {
      ...options.destinationOptions,
      policy: options.policy,
    })

    const dedupeKey =
      parsed.status === 'parsed'
        ? `dest:${parsed.internalHash}`
        : `raw:${rawString}`

    if (isDuplicate(dedupeKey, receivedAtMs)) {
      const duplicateOutcome: DeepLinkDuplicateIgnoredOutcome = {
        status: 'ignoredDuplicate',
        rawUrl: rawString,
        sourceEvent,
      }
      options.onDuplicateIgnored?.(duplicateOutcome)
      return duplicateOutcome
    }

    requestSequence += 1
    const currentSequence = requestSequence

    if (inFlightAbortController) {
      inFlightAbortController.abort()
      inFlightAbortController = null
      inFlightKey = null
    }

    if (parsed.status === 'rejected') {
      recordHandled(dedupeKey, receivedAtMs)
      const outcome = createUnavailableContentOutcome(parsed.reason)
      const unavailableResult: DeepLinkUnavailableOutcome = {
        status: 'unavailable',
        outcome,
        sourceEvent,
      }
      state = {
        ...state,
        phase: 'unavailable',
        activeDestination: null,
        activeInternalHash: null,
        lastUnavailableOutcome: outcome,
        lastOutcome: unavailableResult,
      }
      options.onUnavailable?.(unavailableResult)
      return unavailableResult
    }

    const abortController = new AbortController()
    inFlightAbortController = abortController
    inFlightKey = dedupeKey
    state = {
      ...state,
      phase: 'processing',
    }

    const authResult = await authorizeExternalDeepLink(parsed, {
      monthProvider: options.monthProvider,
      challengeProvider: options.challengeProvider,
      allowMonthAdvancePreview: options.allowMonthAdvancePreview,
      signal: abortController.signal,
    })

    if (currentSequence !== requestSequence) {
      return {
        status: 'unavailable',
        outcome: createUnavailableContentOutcome('aborted'),
        sourceEvent,
      }
    }

    inFlightAbortController = null
    inFlightKey = null
    recordHandled(dedupeKey, now())

    if (authResult.status === 'authorized') {
      const navigatedResult: DeepLinkNavigatedOutcome = {
        status: 'navigated',
        destination: authResult.destination,
        internalHash: authResult.internalHash,
        info: authResult.info,
        sourceEvent,
      }
      state = {
        ...state,
        phase: 'navigated',
        activeDestination: authResult.destination,
        activeInternalHash: authResult.internalHash,
        lastUnavailableOutcome: null,
        lastOutcome: navigatedResult,
      }
      options.onNavigate?.(navigatedResult)
      return navigatedResult
    }

    const unavailableResult: DeepLinkUnavailableOutcome = {
      status: 'unavailable',
      outcome: authResult.outcome,
      sourceEvent,
    }
    state = {
      ...state,
      phase: 'unavailable',
      activeDestination: null,
      activeInternalHash: null,
      lastUnavailableOutcome: authResult.outcome,
      lastOutcome: unavailableResult,
    }
    options.onUnavailable?.(unavailableResult)
    return unavailableResult
  }

  async function start(): Promise<DeepLinkIngressOutcome | null> {
    if (started) {
      return null
    }
    started = true
    const startGeneration = ++lifecycleGeneration
    const startRequestSequence = requestSequence
    state = {
      ...state,
      started: true,
    }

    if (options.source?.subscribeUrlOpen) {
      unsubscribeUrlOpen = options.source.subscribeUrlOpen(url => {
        void handleIncomingUrl(url, 'resumedSession')
      })
    }

    if (!options.source?.getInitialUrl) {
      return null
    }

    let initialUrl: string | null | undefined
    try {
      initialUrl = await options.source.getInitialUrl()
    } catch {
      return null
    }

    if (
      !started ||
      lifecycleGeneration !== startGeneration ||
      requestSequence !== startRequestSequence ||
      typeof initialUrl !== 'string' ||
      initialUrl.length === 0
    ) {
      return null
    }

    return handleIncomingUrl(initialUrl, 'coldStart')
  }

  function stop(): void {
    if (!started) return
    started = false
    lifecycleGeneration += 1
    requestSequence += 1

    if (unsubscribeUrlOpen) {
      unsubscribeUrlOpen()
      unsubscribeUrlOpen = null
    }

    if (inFlightAbortController) {
      inFlightAbortController.abort()
      inFlightAbortController = null
      inFlightKey = null
    }

    state = {
      ...state,
      started: false,
    }
  }

  return {
    start,
    stop,
    handleIncomingUrl,
    getState() {
      return state
    },
  }
}
