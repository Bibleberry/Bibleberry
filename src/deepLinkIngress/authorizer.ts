import { createUnavailableContentOutcome } from './outcomes.ts'
import type {
  AuthorizeDeepLinkOptions,
  DeepLinkAuthorizationResult,
  ParsedExternalDeepLink,
} from './types.ts'

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true
  return error instanceof Error && error.name === 'AbortError'
}

function unavailableResult(
  reason: Parameters<typeof createUnavailableContentOutcome>[0],
): DeepLinkAuthorizationResult {
  return {
    status: 'unavailable',
    outcome: createUnavailableContentOutcome(reason),
  }
}

/**
 * Verifies that a syntactically valid external deep link points to released,
 * reader-authorized content using injected gateway providers.
 *
 * Fails closed on unreleased/embargoed content, gateway errors, validation
 * errors, or missing providers, and never falls back to direct Sanity reads.
 */
export async function authorizeExternalDeepLink(
  parsed: ParsedExternalDeepLink,
  options: AuthorizeDeepLinkOptions,
): Promise<DeepLinkAuthorizationResult> {
  if (options.signal?.aborted) {
    return unavailableResult('aborted')
  }

  const { destination, internalHash } = parsed

  if (destination.type === 'month') {
    if (!options.monthProvider) {
      return unavailableResult('authorizationUnavailable')
    }

    try {
      const detailResult = await options.monthProvider.loadMonth(destination.yearMonth, {
        signal: options.signal,
      })

      if (options.signal?.aborted) {
        return unavailableResult('aborted')
      }

      if (detailResult.status === 'ready') {
        return {
          status: 'authorized',
          destination,
          internalHash,
          info: {
            contentKind: 'month',
            yearMonth: destination.yearMonth,
            monthPhase: detailResult.month.phase,
          },
        }
      }

      if (detailResult.status === 'requestError' || detailResult.status === 'validationError') {
        return unavailableResult('gatewayError')
      }

      if (options.allowMonthAdvancePreview === false) {
        return unavailableResult('contentNotReleased')
      }

      const previewResult = await options.monthProvider.loadMonthPreview(destination.yearMonth, {
        signal: options.signal,
      })

      if (options.signal?.aborted) {
        return unavailableResult('aborted')
      }

      if (previewResult.status === 'ready') {
        return {
          status: 'authorized',
          destination,
          internalHash,
          info: {
            contentKind: 'month',
            yearMonth: destination.yearMonth,
            monthPhase: 'advancePreview',
          },
        }
      }

      if (previewResult.status === 'notFound') {
        return unavailableResult('contentNotReleased')
      }

      return unavailableResult('gatewayError')
    } catch (error: unknown) {
      if (isAbortError(error) || options.signal?.aborted) {
        return unavailableResult('aborted')
      }
      return unavailableResult('gatewayError')
    }
  }

  if (!options.challengeProvider) {
    return unavailableResult('authorizationUnavailable')
  }

  try {
    const challengeResult = await options.challengeProvider.loadChallenge(destination.slug, {
      signal: options.signal,
    })

    if (options.signal?.aborted) {
      return unavailableResult('aborted')
    }

    if (challengeResult.status === 'ready') {
      return {
        status: 'authorized',
        destination,
        internalHash,
        info: {
          contentKind: 'releasedChallenge',
          slug: destination.slug,
          origin: destination.origin,
          entry: 'external',
        },
      }
    }

    if (challengeResult.status === 'notFound') {
      return unavailableResult('contentNotReleased')
    }

    return unavailableResult('gatewayError')
  } catch (error: unknown) {
    if (isAbortError(error) || options.signal?.aborted) {
      return unavailableResult('aborted')
    }
    return unavailableResult('gatewayError')
  }
}
