import { z } from 'zod'
import type { CmsChallengeType, CmsScripture } from '../sanity/types.ts'
import {
  type ChallengeDetailProvider,
  type ChallengeDetailResult,
  type ChallengeDetailProviderOptions,
  defaultGatewayChallengeProvider,
} from './challengeDetailProvider.ts'

export interface ReleasedCatalogSeries {
  readonly documentId: string
  readonly id: string
  readonly title: string
}

export type ReleasedCatalogScripture = Readonly<CmsScripture>

export interface ReleasedCatalogSummary {
  /** Canonical reader route/presentation slug (e.g. "walking-in-the-light") */
  readonly id: string
  /** Canonical reader route/presentation slug (alias of id) */
  readonly slug: string
  /** Canonical Sanity base document ID (e.g. "challenge-doc-uuid-1234", without "drafts.") */
  readonly documentId: string
  readonly title: string
  readonly summary?: string
  readonly challengeType: CmsChallengeType
  readonly sequence: number
  /** Authored release timestamp string */
  readonly releaseAt: string
  /** Normalized UTC release timestamp */
  readonly releaseAtUtc: string
  readonly series: ReleasedCatalogSeries
  readonly primaryScripture: ReleasedCatalogScripture
}

export type ReleasedCatalogResult =
  | {
      readonly status: 'ready'
      readonly challenges: readonly ReleasedCatalogSummary[]
      readonly source: 'gateway'
    }
  | {
      readonly status: 'empty'
      readonly source: 'gateway'
    }
  | {
      readonly status: 'requestError'
      readonly message: string
      readonly source: 'gateway'
    }
  | {
      readonly status: 'validationError'
      readonly message: string
      readonly issues?: readonly string[]
      readonly source: 'gateway'
    }

export interface ReleasedCatalogProviderOptions {
  readonly signal?: AbortSignal
  readonly fetchImpl?: typeof fetch
  readonly baseUrl?: string
}

export interface GatewayCatalogProviderConfig {
  readonly baseUrl?: string
  readonly fetchImpl?: typeof fetch
}

export interface ReleasedCatalogProvider {
  loadReleasedCatalog(options?: ReleasedCatalogProviderOptions): Promise<ReleasedCatalogResult>
  loadCatalog?(options?: ReleasedCatalogProviderOptions): Promise<ReleasedCatalogResult>
}

const requiredText = z
  .string()
  .refine(value => value.trim().length > 0, 'A non-empty string is required.')
const optionalText = z.string().nullish()

const explicitInstant = z.string().refine(value => {
  const hasExplicitOffset = /(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  return hasExplicitOffset && Number.isFinite(Date.parse(value))
}, 'A valid date-time with an explicit UTC offset is required.')

const scriptureShape = {
  reference: requiredText,
  translation: requiredText,
  textStatus: z.enum(['provided', 'referenceOnly']),
  passage: optionalText,
  usageRightsConfirmed: z
    .boolean()
    .nullish()
    .transform(value => value ?? false),
  practiceStatus: z.enum(['configured', 'notConfigured']),
}

const scriptureSchema = z
  .object(scriptureShape)
  .superRefine((val, ctx) => {
    const hasPassage = Boolean(val.passage?.trim())
    if (val.textStatus === 'provided' && !hasPassage) {
      ctx.addIssue({
        code: 'custom',
        path: ['passage'],
        message: 'Provided Scripture status requires passage text.',
      })
    }
    if (val.textStatus === 'referenceOnly' && hasPassage) {
      ctx.addIssue({
        code: 'custom',
        path: ['passage'],
        message: 'Reference-only Scripture must not contain passage text.',
      })
    }
    if (hasPassage && !val.usageRightsConfirmed) {
      ctx.addIssue({
        code: 'custom',
        path: ['usageRightsConfirmed'],
        message: 'Passage text requires confirmed app usage rights.',
      })
    }
    if (
      val.practiceStatus === 'configured' &&
      (val.textStatus !== 'provided' || !hasPassage)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['practiceStatus'],
        message: 'Memorization requires provided passage text.',
      })
    }
  })

const seriesSchema = z.object({
  _id: requiredText,
  title: requiredText,
  slug: requiredText,
})

const gatewayCatalogItemSchema = z.object({
  _id: requiredText.refine(
    id => !id.startsWith('drafts.'),
    'Published Challenge document ID must not be a draft.',
  ),
  slug: requiredText,
  title: requiredText,
  challengeType: z.enum(['teaching', 'discipline', 'reflection', 'memorization']),
  sequence: z.number().int().positive(),
  releaseAt: explicitInstant,
  summary: optionalText,
  series: seriesSchema,
  primaryScripture: scriptureSchema,
  editorialEligibility: z.object({
    adaptationReviewed: z.literal(true),
    reviewedAt: explicitInstant,
  }),
})

/**
 * Creates an injectable gateway-backed released Challenge catalog provider.
 * Requests `GET /api/challenges` from an explicitly configured gateway origin or same-origin relative path.
 *
 * When gateway mode is selected:
 * 1. Server release schedule evaluated by Cloudflare Worker is authoritative (no client-clock embargo check).
 * 2. Response is strictly validated against reader-ready requirements; malformed entries fail closed.
 * 3. Never silently falls back to direct Sanity queries.
 * 4. Only safe discovery metadata is exposed (strips all internal review notes, provenance, and draft artifacts).
 */
export function createGatewayCatalogProvider(
  config?: GatewayCatalogProviderConfig,
): ReleasedCatalogProvider {
  const configuredBaseUrl =
    config?.baseUrl ??
    (typeof import.meta !== 'undefined' &&
    (import.meta.env?.VITE_RELEASE_GATEWAY_ORIGIN ||
      import.meta.env?.VITE_GATEWAY_ORIGIN)
      ? String(
          import.meta.env.VITE_RELEASE_GATEWAY_ORIGIN ||
            import.meta.env.VITE_GATEWAY_ORIGIN,
        )
      : '')

  async function loadReleasedCatalog(
    options?: ReleasedCatalogProviderOptions,
  ): Promise<ReleasedCatalogResult> {
    const rawBase = options?.baseUrl ?? configuredBaseUrl
    const base = rawBase.replace(/\/+$/, '')
    const url = `${base}/api/challenges`
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
      if (err instanceof Error && err.name === 'AbortError') {
        throw err
      }
      return {
        status: 'requestError',
        message:
          err instanceof Error ? err.message : 'Network error loading catalog',
        source: 'gateway',
      }
    }

    if (response.status >= 500) {
      return {
        status: 'requestError',
        message: `Content gateway unavailable (HTTP ${response.status})`,
        source: 'gateway',
      }
    }

    if (!response.ok) {
      return {
        status: 'requestError',
        message: `Gateway returned HTTP ${response.status}`,
        source: 'gateway',
      }
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      return {
        status: 'validationError',
        message: 'Invalid JSON response from content gateway',
        source: 'gateway',
      }
    }

    if (
      !payload ||
      typeof payload !== 'object' ||
      !('ok' in payload) ||
      (payload as { ok?: unknown }).ok !== true ||
      !('challenges' in payload) ||
      !Array.isArray((payload as { challenges?: unknown }).challenges)
    ) {
      return {
        status: 'validationError',
        message: 'Malformed gateway catalog envelope',
        source: 'gateway',
      }
    }

    const rawChallenges = (payload as { challenges: unknown[] }).challenges
    if (rawChallenges.length === 0) {
      return {
        status: 'empty',
        source: 'gateway',
      }
    }

    const seenDocumentIds = new Set<string>()
    const seenSlugs = new Set<string>()
    const mappedSummaries: ReleasedCatalogSummary[] = []
    const validationIssues: string[] = []

    for (let i = 0; i < rawChallenges.length; i++) {
      const rawItem = rawChallenges[i]
      const parseResult = gatewayCatalogItemSchema.safeParse(rawItem)
      if (!parseResult.success) {
        const issues = parseResult.error.issues.map(
          issue => `challenges[${i}].${issue.path.join('.')}: ${issue.message}`,
        )
        validationIssues.push(...issues)
        continue
      }

      const item = parseResult.data
      const docId = item._id.trim()
      const slug = item.slug.trim()

      if (seenDocumentIds.has(docId)) {
        validationIssues.push(`challenges[${i}]: Duplicate document ID "${docId}"`)
      }
      seenDocumentIds.add(docId)

      if (seenSlugs.has(slug)) {
        validationIssues.push(`challenges[${i}]: Duplicate slug "${slug}"`)
      }
      seenSlugs.add(slug)

      const series: ReleasedCatalogSeries = {
        documentId: item.series._id.trim(),
        id: item.series.slug.trim(),
        title: item.series.title.trim(),
      }

      const primaryScripture: ReleasedCatalogScripture = {
        id: `${slug}:primary-scripture`,
        reference: item.primaryScripture.reference.trim(),
        translation: item.primaryScripture.translation.trim(),
        textStatus: item.primaryScripture.textStatus,
        practiceStatus: item.primaryScripture.practiceStatus,
        usageRightsConfirmed: item.primaryScripture.usageRightsConfirmed,
        ...(item.primaryScripture.passage?.trim()
          ? { passage: item.primaryScripture.passage.trim() }
          : {}),
      }

      // Deep allowlist projection: strictly expose only safe discovery fields.
      // Excludes internal review notes, editorialEligibility, screens, blocks, unapprovedBlockCount, etc.
      const summary: ReleasedCatalogSummary = {
        id: slug,
        slug,
        documentId: docId,
        title: item.title.trim(),
        challengeType: item.challengeType,
        sequence: item.sequence,
        releaseAt: item.releaseAt,
        releaseAtUtc: new Date(item.releaseAt).toISOString(),
        series,
        primaryScripture,
        ...(item.summary?.trim() ? { summary: item.summary.trim() } : {}),
      }

      mappedSummaries.push(summary)
    }

    if (validationIssues.length > 0) {
      return {
        status: 'validationError',
        message: `Gateway catalog failed validation with ${validationIssues.length} issue(s)`,
        issues: validationIssues,
        source: 'gateway',
      }
    }

    return {
      status: 'ready',
      challenges: mappedSummaries,
      source: 'gateway',
    }
  }

  return {
    loadReleasedCatalog,
    loadCatalog: loadReleasedCatalog,
  }
}

/** Default singleton gateway catalog provider instance */
export const defaultGatewayCatalogProvider = createGatewayCatalogProvider()

/**
 * Loads the complete reader-safe Challenge document for a selected catalog summary
 * using the provided or default ChallengeDetailProvider.
 *
 * Verifies that the resolved Challenge's document ID strictly matches the selected
 * summary's canonical document ID. If the gateway detail response resolves to a
 * different document ID (e.g. from upstream document recreation or a stale catalog),
 * it fails closed with a validationError to prevent admitting the wrong participation identity.
 */
export async function loadChallengeDetailForSummary(
  summary: Pick<ReleasedCatalogSummary, 'slug' | 'documentId'>,
  detailProvider: ChallengeDetailProvider = defaultGatewayChallengeProvider,
  options?: ChallengeDetailProviderOptions,
): Promise<ChallengeDetailResult> {
  const cleanDocumentId = typeof summary?.documentId === 'string' ? summary.documentId.trim() : ''
  if (!cleanDocumentId) {
    return {
      status: 'validationError',
      failures: [
        {
          issues: [
            {
              path: 'documentId',
              message: 'Selected catalog summary is missing a valid document ID',
            },
          ],
        },
      ],
      source: 'gateway',
    }
  }

  const result = await detailProvider.loadChallenge(summary.slug, options)

  if (result.status === 'ready') {
    if (result.challenge.documentId !== cleanDocumentId) {
      return {
        status: 'validationError',
        failures: [
          {
            documentId: result.challenge.documentId,
            issues: [
              {
                path: 'documentId',
                message: `Resolved Challenge document ID "${result.challenge.documentId}" does not match selected catalog document ID "${cleanDocumentId}"`,
              },
            ],
          },
        ],
        source: result.source,
      }
    }
  }

  return result
}
