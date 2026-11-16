import type { DeepLinkUnavailableReason, UnavailableContentOutcome } from './types.ts'

interface OutcomeCopy {
  readonly role: 'status' | 'alert'
  readonly liveRegion: 'polite' | 'assertive'
  readonly heading: string
  readonly message: string
}

const OUTCOME_COPY_BY_REASON: Record<DeepLinkUnavailableReason, OutcomeCopy> = {
  malformedUrl: {
    role: 'alert',
    liveRegion: 'polite',
    heading: 'This link can’t be opened',
    message: 'The link is incomplete or formatted in a way the reader does not recognize.',
  },
  unauthorizedHostOrScheme: {
    role: 'alert',
    liveRegion: 'polite',
    heading: 'This link can’t be opened',
    message: 'This link points to an unrecognized address and was not opened.',
  },
  encodedPathTrick: {
    role: 'alert',
    liveRegion: 'polite',
    heading: 'This link can’t be opened',
    message: 'The link path is not valid for this reader.',
  },
  unsupportedRoute: {
    role: 'status',
    liveRegion: 'polite',
    heading: 'This destination isn’t available',
    message: 'This link does not match a supported Month or Challenge destination.',
  },
  featureDisabled: {
    role: 'status',
    liveRegion: 'polite',
    heading: 'This destination isn’t available',
    message: 'This reading view is not enabled in the current configuration.',
  },
  invalidMonth: {
    role: 'status',
    liveRegion: 'polite',
    heading: 'Month not available',
    message: 'The requested month identifier is not valid.',
  },
  invalidChallengeSlug: {
    role: 'status',
    liveRegion: 'polite',
    heading: 'Challenge not available',
    message: 'The requested Challenge link is not valid.',
  },
  invalidQuery: {
    role: 'alert',
    liveRegion: 'polite',
    heading: 'This link can’t be opened',
    message: 'The link contains unsupported parameters and was not opened.',
  },
  contentNotReleased: {
    role: 'status',
    liveRegion: 'polite',
    heading: 'Content isn’t available yet',
    message:
      'This Month or Challenge is not currently available. It may not be released yet or may no longer be published.',
  },
  gatewayError: {
    role: 'status',
    liveRegion: 'polite',
    heading: 'Unable to open this content right now',
    message: 'We couldn’t verify this content right now. Please try again later or return to the Hub.',
  },
  authorizationUnavailable: {
    role: 'status',
    liveRegion: 'polite',
    heading: 'Unable to open this content right now',
    message: 'Content verification is unavailable in this environment. You can return to the Hub.',
  },
  aborted: {
    role: 'status',
    liveRegion: 'polite',
    heading: 'Link opening was cancelled',
    message: 'The link request was cancelled before it finished opening.',
  },
}

/**
 * Builds a clear, accessible unavailable-content outcome without leaking embargoed
 * release dates, hidden titles, or redirecting to guessed content.
 */
export function createUnavailableContentOutcome(
  reason: DeepLinkUnavailableReason,
): UnavailableContentOutcome {
  const copy = OUTCOME_COPY_BY_REASON[reason]
  return {
    kind: 'unavailable',
    reason,
    accessibility: {
      role: copy.role,
      liveRegion: copy.liveRegion,
      heading: copy.heading,
      message: copy.message,
      suggestedAction: {
        label: 'Return to Hub',
        target: 'hub',
      },
    },
  }
}
