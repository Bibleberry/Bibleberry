import {
  DEFAULT_SANITY_API_VERSION,
  TRUSTED_AWARD_VERIFICATION_MONTH_GROQ_QUERY,
  buildSanityQueryUrl,
} from '../gateway/query.ts'
import type { GatewayFetch } from '../gateway/types.ts'
import {
  TRUSTED_SANITY_DATASETS,
  type TrustedMonthFetchResult,
  type TrustedMonthlyEditorialProvider,
  type TrustedSanityDataset,
} from './types.ts'

const YEAR_MONTH = /^\d{4}-(?:0[1-9]|1[0-2])$/
const PROJECT_ID = /^[a-z0-9]{4,32}$/
const SANITY_REVISION = /^[A-Za-z0-9_-]{1,64}$/

export interface SanityTrustedMonthProviderConfig {
  readonly projectId: string
  readonly dataset: string
  /** Server-held Sanity read token. Never logged, never returned, never sent to a client. */
  readonly readToken: string
  readonly fetchImpl: GatewayFetch
  readonly apiVersion?: string
}

/**
 * PRIVILEGED editorial data provider for the R13-VERIFY1 verifier.
 *
 * - Reads ONLY `perspective=published` (via `buildSanityQueryUrl`) from an allowlisted dataset
 *   (`production` / `staging`; no third dataset).
 * - Uses the internal TRUSTED_AWARD_VERIFICATION_MONTH_GROQ_QUERY; there is no standalone
 *   public Card lookup and this provider is not wired to any public route.
 * - Every failure collapses to `unavailable` / `notFound` without echoing upstream bodies,
 *   URLs or credentials.
 */
export function createSanityTrustedMonthProvider(
  config: SanityTrustedMonthProviderConfig,
): TrustedMonthlyEditorialProvider {
  if (!PROJECT_ID.test(config.projectId)) {
    throw new Error('Invalid trusted Sanity project configuration')
  }
  if (!(TRUSTED_SANITY_DATASETS as readonly string[]).includes(config.dataset)) {
    throw new Error('Trusted Sanity dataset must be an approved dataset')
  }
  if (typeof config.readToken !== 'string' || config.readToken.trim().length === 0) {
    throw new Error('Trusted Sanity read credential is not configured')
  }
  const dataset = config.dataset as TrustedSanityDataset
  const token = config.readToken.trim()

  return {
    sanityProjectId: config.projectId,
    dataset,
    async fetchPublishedMonth(yearMonth: string): Promise<TrustedMonthFetchResult> {
      if (!YEAR_MONTH.test(yearMonth)) {
        return { status: 'notFound' }
      }
      const url = buildSanityQueryUrl(
        config.projectId,
        dataset,
        config.apiVersion ?? DEFAULT_SANITY_API_VERSION,
        TRUSTED_AWARD_VERIFICATION_MONTH_GROQ_QUERY,
        { monthDocId: `month-${yearMonth}`, yearMonth },
      )
      let response: Response
      try {
        response = await config.fetchImpl(url, {
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
          cache: 'no-store',
        })
      } catch {
        return { status: 'unavailable' }
      }
      if (!response.ok) {
        return { status: 'unavailable' }
      }
      let payload: unknown
      try {
        payload = await response.json()
      } catch {
        return { status: 'unavailable' }
      }
      if (typeof payload !== 'object' || payload === null || !('result' in payload)) {
        return { status: 'unavailable' }
      }
      const result = (payload as { result: unknown }).result
      if (result === null || result === undefined) {
        return { status: 'notFound' }
      }
      if (typeof result !== 'object' || Array.isArray(result)) {
        return { status: 'unavailable' }
      }
      const revision = (result as { _rev?: unknown })._rev
      if (typeof revision !== 'string' || !SANITY_REVISION.test(revision)) {
        return { status: 'unavailable' }
      }
      return { status: 'found', document: result, revision, dataset }
    },
  }
}
