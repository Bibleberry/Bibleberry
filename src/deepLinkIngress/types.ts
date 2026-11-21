import type { ChallengeOrigin } from '../cms/reader/challengeOrigin.ts'
import type { ChallengeDetailProvider } from '../cms/reader/challengeDetailProvider.ts'
import type { MonthGatewayProvider } from '../cms/reader/monthProvider.ts'
import type { InternalDestination, InternalDestinationOptions } from '../native/internalDestination.ts'

/**
 * Explicitly injected allowlist of authorized external application hosts and schemes.
 * No production domain or scheme is hardcoded; empty/omitted lists fail closed.
 */
export interface ExternalLinkIngressPolicy {
  readonly allowedHttpsHosts?: readonly string[]
  readonly allowedCustomSchemes?: readonly string[]
  readonly allowedCustomSchemeHosts?: readonly string[]
}

export interface ExternalDeepLinkParseOptions extends InternalDestinationOptions {
  readonly policy: ExternalLinkIngressPolicy
}

export type ExternalDeepLinkRejectionReason =
  | 'malformedUrl'
  | 'unauthorizedHostOrScheme'
  | 'encodedPathTrick'
  | 'unsupportedRoute'
  | 'featureDisabled'
  | 'invalidMonth'
  | 'invalidChallengeSlug'
  | 'invalidQuery'

export type DeepLinkUnavailableReason =
  | ExternalDeepLinkRejectionReason
  | 'contentNotReleased'
  | 'gatewayError'
  | 'authorizationUnavailable'
  | 'aborted'

export interface ParsedExternalDeepLink {
  readonly status: 'parsed'
  readonly rawUrl: string
  readonly normalizedUrl: string
  readonly scheme: string
  readonly destination: InternalDestination
  readonly internalHash: string
  /**
   * Always `null`: external links never carry a trusted return origin (G04-A). Challenge
   * destinations are `entry: 'external'` with the default origin, so Exit/Finish go to Today.
   */
  readonly origin: null
}

export interface RejectedExternalDeepLink {
  readonly status: 'rejected'
  readonly rawUrl: unknown
  readonly reason: ExternalDeepLinkRejectionReason
}

export type ExternalDeepLinkParseResult = ParsedExternalDeepLink | RejectedExternalDeepLink

export interface UnavailableContentAction {
  readonly label: 'Return to Hub'
  readonly target: 'hub'
}

export interface UnavailableContentAccessibility {
  readonly role: 'status' | 'alert'
  readonly liveRegion: 'polite' | 'assertive'
  readonly heading: string
  readonly message: string
  readonly suggestedAction: UnavailableContentAction
}

export interface UnavailableContentOutcome {
  readonly kind: 'unavailable'
  readonly reason: DeepLinkUnavailableReason
  readonly accessibility: UnavailableContentAccessibility
}

export interface DeepLinkAuthorizationProviders {
  readonly monthProvider?: Pick<MonthGatewayProvider, 'loadMonth' | 'loadMonthPreview'>
  readonly challengeProvider?: Pick<ChallengeDetailProvider, 'loadChallenge'>
  readonly allowMonthAdvancePreview?: boolean
}

export interface AuthorizeDeepLinkOptions extends DeepLinkAuthorizationProviders {
  readonly signal?: AbortSignal
}

export type AuthorizedDestinationInfo =
  | {
      readonly contentKind: 'month'
      readonly yearMonth: string
      readonly monthPhase: 'active' | 'historical' | 'advancePreview'
    }
  | {
      readonly contentKind: 'releasedChallenge'
      readonly slug: string
      readonly origin: ChallengeOrigin
      readonly entry: 'external'
    }

export type DeepLinkAuthorizationResult =
  | {
      readonly status: 'authorized'
      readonly destination: InternalDestination
      readonly internalHash: string
      readonly info: AuthorizedDestinationInfo
    }
  | {
      readonly status: 'unavailable'
      readonly outcome: UnavailableContentOutcome
    }

export type IncomingDeepLinkTrigger = 'coldStart' | 'resumedSession'

export interface IncomingDeepLinkSource {
  readonly trigger: IncomingDeepLinkTrigger
  readonly rawUrl: string
  readonly receivedAtMs: number
}

export interface ExternalDeepLinkSourceAdapter {
  getInitialUrl?: () => Promise<string | null | undefined> | string | null | undefined
  subscribeUrlOpen?: (listener: (url: string) => void) => () => void
}

export interface DeepLinkNavigatedOutcome {
  readonly status: 'navigated'
  readonly destination: InternalDestination
  readonly internalHash: string
  readonly info: AuthorizedDestinationInfo
  readonly sourceEvent: IncomingDeepLinkSource
}

export interface DeepLinkUnavailableOutcome {
  readonly status: 'unavailable'
  readonly outcome: UnavailableContentOutcome
  readonly sourceEvent: IncomingDeepLinkSource
}

export interface DeepLinkDuplicateIgnoredOutcome {
  readonly status: 'ignoredDuplicate'
  readonly rawUrl: string
  readonly sourceEvent: IncomingDeepLinkSource
}

export type DeepLinkIngressOutcome =
  | DeepLinkNavigatedOutcome
  | DeepLinkUnavailableOutcome
  | DeepLinkDuplicateIgnoredOutcome

export type DeepLinkControllerPhase = 'idle' | 'processing' | 'navigated' | 'unavailable'

export interface DeepLinkControllerState {
  readonly started: boolean
  readonly phase: DeepLinkControllerPhase
  readonly activeDestination: InternalDestination | null
  readonly activeInternalHash: string | null
  readonly lastUnavailableOutcome: UnavailableContentOutcome | null
  readonly lastOutcome: DeepLinkIngressOutcome | null
}

export interface DeepLinkIngressControllerOptions extends DeepLinkAuthorizationProviders {
  readonly policy: ExternalLinkIngressPolicy
  readonly destinationOptions: InternalDestinationOptions
  readonly source?: ExternalDeepLinkSourceAdapter
  readonly dedupeWindowMs?: number
  readonly now?: () => number
  readonly onNavigate?: (outcome: DeepLinkNavigatedOutcome) => void
  readonly onUnavailable?: (outcome: DeepLinkUnavailableOutcome) => void
  readonly onDuplicateIgnored?: (outcome: DeepLinkDuplicateIgnoredOutcome) => void
}

export interface DeepLinkIngressController {
  start(): Promise<DeepLinkIngressOutcome | null>
  stop(): void
  handleIncomingUrl(rawUrl: unknown, trigger: IncomingDeepLinkTrigger): Promise<DeepLinkIngressOutcome>
  getState(): DeepLinkControllerState
}
