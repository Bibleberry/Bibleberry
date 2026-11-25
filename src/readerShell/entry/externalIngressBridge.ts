import type {
  ChallengeDetailProvider,
  ChallengeDetailResult,
} from '../../cms/reader/challengeDetailProvider.ts'
import { deriveReleasedChallengeDetailState } from '../../cms/reader/releasedChallengeHostModel.ts'
import { createDeepLinkIngressController } from '../../deepLinkIngress/controller.ts'
import type {
  DeepLinkIngressController,
  DeepLinkIngressOutcome,
  ExternalDeepLinkSourceAdapter,
  ExternalLinkIngressPolicy,
} from '../../deepLinkIngress/types.ts'
import type { InternalDestinationOptions } from '../../native/internalDestination.ts'

export interface VerifiedChallengeIngressProvider {
  readonly challengeProvider: Pick<ChallengeDetailProvider, 'loadChallenge'>
  takeVerifiedProvider(slug: string): ChallengeDetailProvider | undefined
}

/**
 * Wraps a `ChallengeDetailProvider` so external deep-link authorization requires both
 * a gateway-sourced payload and full `deriveReleasedChallengeDetailState` capability
 * admission (`adaptationReviewed`, valid release schedule, unique screens, slug match).
 *
 * Retains the single verified payload for consumption by `ReleasedChallengeHost` on
 * navigation commit so authorization and rendering observe the exact same gateway verdict.
 */
export function createVerifiedChallengeIngressProvider(
  baseProvider: Pick<ChallengeDetailProvider, 'loadChallenge'>,
  now: () => Date = () => new Date(),
): VerifiedChallengeIngressProvider {
  let lastVerified: { readonly slug: string; readonly detail: ChallengeDetailResult } | null = null

  return {
    challengeProvider: {
      async loadChallenge(slug, options) {
        const detail = await baseProvider.loadChallenge(slug, options)
        if (detail.status !== 'ready') {
          return detail
        }
        const admitted = deriveReleasedChallengeDetailState(detail, slug, now())
        if (detail.source !== 'gateway' || admitted.status !== 'ready') {
          return {
            status: 'validationError',
            source: detail.source,
            failures: [
              {
                issues: [
                  {
                    path: 'challenge',
                    message: 'External Challenge failed gateway capability admission',
                  },
                ],
              },
            ],
          }
        }
        lastVerified = { slug, detail }
        return detail
      },
    },
    takeVerifiedProvider(slug: string): ChallengeDetailProvider | undefined {
      if (!lastVerified || lastVerified.slug !== slug) {
        return undefined
      }
      const verified = lastVerified.detail
      lastVerified = null
      return {
        loadChallenge: async () => verified,
      }
    },
  }
}

/**
 * Extracts a raw non-root browser path/query/hash target from `location.href` without
 * pre-normalizing percent-encoded path tricks (`%2F`, `%2E`, `//`, `..`).
 * Returns `null` for ordinary root launches (`/`, `/index.html`, `/#/...`).
 */
export function extractRawLocationTarget(href: string): string | null {
  if (typeof href !== 'string' || href.length === 0) return null
  const schemeEnd = href.indexOf('://')
  if (schemeEnd < 0) return null
  const pathStart = href.indexOf('/', schemeEnd + 3)
  if (pathStart < 0) return null
  const tail = href.slice(pathStart)
  const rawPath = tail.split(/[?#]/, 1)[0] ?? ''
  if (rawPath === '' || rawPath === '/' || rawPath === '/index.html') {
    return null
  }
  return tail
}

export function buildDefaultBrowserIngressPolicy(
  location: Pick<Location, 'protocol' | 'hostname' | 'port'>,
  extraPolicy?: ExternalLinkIngressPolicy,
): ExternalLinkIngressPolicy {
  const sameOriginHttps =
    location.protocol === 'https:' && location.port === '' && location.hostname.length > 0
      ? [location.hostname]
      : []

  return {
    allowedHttpsHosts: [...sameOriginHttps, ...(extraPolicy?.allowedHttpsHosts ?? [])],
    allowedCustomSchemes: extraPolicy?.allowedCustomSchemes,
    allowedCustomSchemeHosts: extraPolicy?.allowedCustomSchemeHosts,
  }
}

export interface R06ExternalIngressOptions {
  readonly destinationOptions: InternalDestinationOptions
  readonly challengeProvider: Pick<ChallengeDetailProvider, 'loadChallenge'>
  readonly policy?: ExternalLinkIngressPolicy
  readonly source?: ExternalDeepLinkSourceAdapter
  readonly locationHref?: () => string
  readonly locationPolicyOrigin?: Pick<Location, 'protocol' | 'hostname' | 'port'>
  readonly now?: () => number
  readonly getVerificationDate?: () => Date
  readonly dedupeWindowMs?: number
  readonly onWarmIngressStart?: (slug: string) => void
  readonly onOutcome?: (
    outcome: DeepLinkIngressOutcome,
    verifiedProvider?: ChallengeDetailProvider,
  ) => void
}

export interface R06ExternalIngressBridge {
  start(): Promise<{
    readonly outcome: DeepLinkIngressOutcome
    readonly verifiedProvider?: ChallengeDetailProvider
  } | null>
  stop(): void
  handleExternalUrl(rawUrl: unknown): Promise<{
    readonly outcome: DeepLinkIngressOutcome
    readonly verifiedProvider?: ChallengeDetailProvider
  }>
}

/**
 * Coordinates authorization-first external deep-link ingress for the R06 shell:
 * 1. Validates external URLs from `ExternalDeepLinkSourceAdapter` strictly against `policy`.
 * 2. Validates same-origin cold browser path links (`/challenge/:slug?...`) through the same
 *    `parseExternalDeepLink` + gateway capability checks using an unguessable per-instance host.
 */
export function createR06ExternalIngressBridge(
  options: R06ExternalIngressOptions,
): R06ExternalIngressBridge {
  const verified = createVerifiedChallengeIngressProvider(
    options.challengeProvider,
    options.getVerificationDate,
  )
  const externalPolicy = options.locationPolicyOrigin
    ? buildDefaultBrowserIngressPolicy(options.locationPolicyOrigin, options.policy)
    : (options.policy ?? {})

  const sameOriginToken =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  const internalSameOriginHost = `same-origin-${sameOriginToken}.bibleberry.internal`

  const resolveVerified = (outcome: DeepLinkIngressOutcome): ChallengeDetailProvider | undefined =>
    outcome.status === 'navigated' && outcome.info.contentKind === 'releasedChallenge'
      ? verified.takeVerifiedProvider(outcome.info.slug)
      : undefined

  let started = false
  let stopped = false
  let inResumedOpen = false
  let directCallDepth = 0

  const wrappedSource: ExternalDeepLinkSourceAdapter | undefined = options.source
    ? {
        getInitialUrl: options.source.getInitialUrl,
        subscribeUrlOpen: options.source.subscribeUrlOpen
          ? listener =>
              options.source!.subscribeUrlOpen!(url => {
                inResumedOpen = true
                try {
                  listener(url)
                } finally {
                  inResumedOpen = false
                }
              })
          : undefined,
      }
    : undefined

  const externalController: DeepLinkIngressController = createDeepLinkIngressController({
    policy: externalPolicy,
    destinationOptions: options.destinationOptions,
    challengeProvider: {
      async loadChallenge(slug, loadOptions) {
        if (started && !stopped && inResumedOpen && directCallDepth === 0) {
          options.onWarmIngressStart?.(slug)
        }
        return verified.challengeProvider.loadChallenge(slug, loadOptions)
      },
    },
    dedupeWindowMs: options.dedupeWindowMs,
    now: options.now,
    source: wrappedSource,
    onNavigate(outcome) {
      if (outcome.sourceEvent.trigger === 'resumedSession' && directCallDepth === 0) {
        options.onOutcome?.(outcome, resolveVerified(outcome))
      }
    },
    onUnavailable(outcome) {
      if (outcome.sourceEvent.trigger === 'resumedSession' && directCallDepth === 0) {
        options.onOutcome?.(outcome, undefined)
      }
    },
    onDuplicateIgnored(outcome) {
      if (outcome.sourceEvent.trigger === 'resumedSession' && directCallDepth === 0) {
        options.onOutcome?.(outcome, undefined)
      }
    },
  })

  const sameOriginController: DeepLinkIngressController = createDeepLinkIngressController({
    policy: { allowedHttpsHosts: [internalSameOriginHost] },
    destinationOptions: options.destinationOptions,
    challengeProvider: verified.challengeProvider,
    dedupeWindowMs: options.dedupeWindowMs,
    now: options.now,
  })

  return {
    async start() {
      if (started || stopped) return null
      started = true

      const externalOutcome = await externalController.start()
      if (stopped) return null
      if (externalOutcome) {
        return {
          outcome: externalOutcome,
          verifiedProvider: resolveVerified(externalOutcome),
        }
      }

      const rawTarget = options.locationHref ? extractRawLocationTarget(options.locationHref()) : null
      if (!rawTarget) {
        return null
      }

      const pathOutcome = await sameOriginController.handleIncomingUrl(
        `https://${internalSameOriginHost}${rawTarget}`,
        'coldStart',
      )
      if (stopped) return null
      return {
        outcome: pathOutcome,
        verifiedProvider: resolveVerified(pathOutcome),
      }
    },
    stop() {
      stopped = true
      externalController.stop()
      sameOriginController.stop()
    },
    async handleExternalUrl(rawUrl: unknown) {
      directCallDepth += 1
      try {
        const outcome = await externalController.handleIncomingUrl(rawUrl, 'resumedSession')
        return {
          outcome,
          verifiedProvider: resolveVerified(outcome),
        }
      } finally {
        directCallDepth -= 1
      }
    },
  }
}
