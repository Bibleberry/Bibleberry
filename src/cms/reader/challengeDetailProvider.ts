import { mapPublishedChallenge, type ChallengeMappingFailure } from '../sanity/mapChallenge.ts'
import type { CmsChallenge } from '../sanity/types.ts'
import {
  defaultPublishedCatalogProvider,
  type ChallengeCatalogProvider,
} from './catalogProvider.ts'

export type ChallengeDetailResult =
  | { readonly status: 'ready'; readonly challenge: CmsChallenge }
  | { readonly status: 'notFound' }
  | { readonly status: 'requestError'; readonly message: string }
  | {
      readonly status: 'validationError'
      readonly failures: readonly ChallengeMappingFailure[]
    }

export interface ChallengeDetailProviderOptions {
  readonly signal?: AbortSignal
  readonly fetchImpl?: typeof fetch
  readonly baseUrl?: string
}

export interface ChallengeDetailProvider {
  loadChallenge(slug: string, options?: ChallengeDetailProviderOptions): Promise<ChallengeDetailResult>
}

export interface GatewayChallengeProviderConfig {
  readonly baseUrl?: string
  readonly fetchImpl?: typeof fetch
}

/**
 * Build-time feature flag determining whether the ordinary reader uses the
 * secure Cloudflare Worker gateway source instead of direct public Sanity reads.
 */
export const releaseGatewaySourceEnabled =
  typeof import.meta !== 'undefined' &&
  import.meta.env?.VITE_ENABLE_RELEASE_GATEWAY_SOURCE === 'true'

/**
 * Creates an injectable gateway-backed Challenge detail provider that requests
 * `GET /api/challenges/:slug` from an explicitly configured gateway origin or
 * a same-origin relative path.
 *
 * When gateway mode is selected, failures fail closed and never fall back to
 * direct Sanity reads.
 */
export function createGatewayChallengeProvider(
  config?: GatewayChallengeProviderConfig,
): ChallengeDetailProvider {
  const configuredBaseUrl =
    config?.baseUrl ??
    (typeof import.meta !== 'undefined' && (import.meta.env?.VITE_RELEASE_GATEWAY_ORIGIN || import.meta.env?.VITE_GATEWAY_ORIGIN)
      ? String(import.meta.env.VITE_RELEASE_GATEWAY_ORIGIN || import.meta.env.VITE_GATEWAY_ORIGIN)
      : '')

  return {
    async loadChallenge(slug: string, options?: ChallengeDetailProviderOptions): Promise<ChallengeDetailResult> {
      const cleanSlug = typeof slug === 'string' ? slug.trim() : ''
      if (!cleanSlug) {
        return { status: 'notFound' }
      }

      const rawBase = options?.baseUrl ?? configuredBaseUrl
      const base = rawBase.replace(/\/+$/, '')
      const url = `${base}/api/challenges/${encodeURIComponent(cleanSlug)}`
      const fetchFn = options?.fetchImpl ?? config?.fetchImpl ?? fetch

      let response: Response
      try {
        response = await fetchFn(url, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
          signal: options?.signal,
        })
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw err
        }
        return {
          status: 'requestError',
          message: err instanceof Error ? err.message : 'Network error loading Challenge',
        }
      }

      if (response.status === 404) {
        // Unreleased, embargoed, or nonexistent Challenge: return neutral unavailable state
        return { status: 'notFound' }
      }

      if (response.status >= 500) {
        return {
          status: 'requestError',
          message: 'Content gateway unavailable',
        }
      }

      if (!response.ok) {
        return {
          status: 'requestError',
          message: `Gateway returned HTTP ${response.status}`,
        }
      }

      let payload: unknown
      try {
        payload = await response.json()
      } catch {
        return {
          status: 'validationError',
          failures: [
            {
              issues: [
                {
                  path: 'document',
                  message: 'Invalid JSON response from content gateway',
                },
              ],
            },
          ],
        }
      }

      if (
        !payload ||
        typeof payload !== 'object' ||
        !('ok' in payload) ||
        (payload as { ok?: unknown }).ok !== true ||
        !('challenge' in payload) ||
        typeof (payload as { challenge?: unknown }).challenge !== 'object' ||
        (payload as { challenge: unknown }).challenge === null
      ) {
        return {
          status: 'validationError',
          failures: [
            {
              issues: [
                {
                  path: 'document',
                  message: 'Malformed gateway challenge envelope',
                },
              ],
            },
          ],
        }
      }

      const rawChallenge = (payload as { challenge: unknown }).challenge
      const mapping = mapPublishedChallenge(rawChallenge)

      if (!mapping.ok) {
        return {
          status: 'validationError',
          failures: [mapping.failure],
        }
      }

      return {
        status: 'ready',
        challenge: mapping.challenge,
      }
    },
  }
}

/**
 * Adapts an existing A4.1 `ChallengeCatalogProvider` into a `ChallengeDetailProvider`.
 * Preserves existing A4.1 catalog provider behavior for regression testing.
 */
export function adaptCatalogProviderToDetailProvider(
  catalogProvider: ChallengeCatalogProvider,
): ChallengeDetailProvider {
  return {
    async loadChallenge(slug: string, options?: ChallengeDetailProviderOptions): Promise<ChallengeDetailResult> {
      const cleanSlug = typeof slug === 'string' ? slug.trim() : ''
      if (!cleanSlug) {
        return { status: 'notFound' }
      }

      try {
        const catalogResult = await catalogProvider.loadCatalog({
          signal: options?.signal,
        })

        if (catalogResult.status === 'requestError') {
          return { status: 'requestError', message: catalogResult.message }
        }

        if (catalogResult.status === 'validationError') {
          return { status: 'validationError', failures: catalogResult.failures }
        }

        if (catalogResult.status === 'empty') {
          return { status: 'notFound' }
        }

        const challenge = catalogResult.challenges.find(c => c.id === cleanSlug)
        if (!challenge) {
          return { status: 'notFound' }
        }

        return {
          status: 'ready',
          challenge,
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw err
        }
        return {
          status: 'requestError',
          message: err instanceof Error ? err.message : 'Error loading Challenge catalog',
        }
      }
    },
  }
}

/** Default singleton gateway detail provider instance */
export const defaultGatewayChallengeProvider = createGatewayChallengeProvider()

/** Default singleton catalog-adapted detail provider instance */
export const defaultPublishedCatalogDetailProvider =
  adaptCatalogProviderToDetailProvider(defaultPublishedCatalogProvider)

/**
 * Resolves the default Challenge detail provider according to the build-time feature flag.
 * - When `VITE_ENABLE_RELEASE_GATEWAY_SOURCE === 'true'`: uses `defaultGatewayChallengeProvider`.
 * - Otherwise: adapts `defaultPublishedCatalogProvider` (A4.1 Sanity catalog read).
 */
export function resolveDefaultChallengeProvider(): ChallengeDetailProvider {
  if (releaseGatewaySourceEnabled) {
    return defaultGatewayChallengeProvider
  }
  return defaultPublishedCatalogDetailProvider
}
