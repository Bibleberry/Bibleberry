import type { CmsChallenge, CmsScreen } from '../cms/sanity/types.ts'
import {
  evaluateChallengeReleaseEligibility,
  type ReleaseEligibilityChallengeInput,
} from '../cms/reader/releaseEligibility.ts'
import { formatCanonicalChallengeId, parseStoredChallengeId } from './identity.ts'
import type { CanonicalChallengeId, ChallengeIdentityNamespace } from './types.ts'

/**
 * Trusted reader-catalog admission boundary (Track A, A3 / Issue #46).
 *
 * Important architectural note:
 * `admitTrustedCatalogChallenge` is a contractual host boundary seam, NOT proof by itself that
 * a caller fetched from Sanity's published perspective or passed a server-enforced release embargo
 * (those runtime catalog & release gates belong to A4 / R03 / R05).
 *
 * What this module DOES enforce in A3:
 * 1. Production participation hosts cannot construct writes from raw URL hashes, unverified object
 *    literals, `drafts.*` document IDs, Lab/fixture IDs, or `pilot:*` synthetic identities.
 * 2. Every `AdmittedChallenge` carries an unexported symbol capability token and explicit namespace
 *    (`'cms'` vs `'pilot'`) verified before dispatching participation commands.
 */

const ADMITTED_CHALLENGE_BRAND: unique symbol = Symbol('BibleberryAdmittedChallenge')

export interface AdmittedChallenge {
  readonly [ADMITTED_CHALLENGE_BRAND]: true
  readonly namespace: ChallengeIdentityNamespace
  readonly challengeId: CanonicalChallengeId
  readonly screens: readonly Pick<CmsScreen, 'id'>[]
  /**
   * Optional explicit, editorially declared predecessor Challenge IDs superseded by this Challenge
   * (e.g., after an exceptional document recreation). Never inferred from title or slug similarity.
   */
  readonly previousChallengeIds: readonly CanonicalChallengeId[]
}

export function isAdmittedChallenge(
  value: unknown,
  expectedNamespace?: ChallengeIdentityNamespace,
): value is AdmittedChallenge {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<AdmittedChallenge>
  if (candidate[ADMITTED_CHALLENGE_BRAND] !== true) return false
  if (candidate.namespace !== 'cms' && candidate.namespace !== 'pilot') return false
  if (expectedNamespace && candidate.namespace !== expectedNamespace) return false
  return parseStoredChallengeId(candidate.challengeId, candidate.namespace) === candidate.challengeId
}

function sanitizeScreenRefs(screens: readonly Pick<CmsScreen, 'id'>[]): readonly Pick<CmsScreen, 'id'>[] | null {
  if (!Array.isArray(screens) || screens.length === 0) return null
  const seen = new Set<string>()
  const normalized: Pick<CmsScreen, 'id'>[] = []
  for (const screen of screens) {
    if (!screen || typeof screen.id !== 'string' || screen.id.trim().length === 0 || screen.id !== screen.id.trim()) {
      return null
    }
    if (seen.has(screen.id)) return null
    seen.add(screen.id)
    normalized.push(Object.freeze({ id: screen.id }))
  }
  return Object.freeze(normalized)
}

export type TrustedCatalogChallengeInput = Pick<CmsChallenge, 'documentId' | 'screens' | 'editorial'>

export function admitTrustedCatalogChallenge(
  challenge: TrustedCatalogChallengeInput,
  options: {
    readonly previousDocumentIds?: readonly string[]
  } = {},
): AdmittedChallenge | null {
  if (!challenge || typeof challenge !== 'object') return null
  if (challenge.editorial?.adaptationReviewed !== true) return null

  const challengeId = formatCanonicalChallengeId('cms', challenge.documentId)
  if (!challengeId) return null

  const screens = sanitizeScreenRefs(challenge.screens)
  if (!screens) return null

  const previousChallengeIds: CanonicalChallengeId[] = []
  if (options.previousDocumentIds) {
    for (const rawPrev of options.previousDocumentIds) {
      const prevId = formatCanonicalChallengeId('cms', rawPrev)
      if (prevId && prevId !== challengeId && !previousChallengeIds.includes(prevId)) {
        previousChallengeIds.push(prevId)
      }
    }
  }

  return Object.freeze({
    [ADMITTED_CHALLENGE_BRAND]: true as const,
    namespace: 'cms' as const,
    challengeId,
    screens,
    previousChallengeIds: Object.freeze(previousChallengeIds),
  })
}

export type ReleasedCmsChallengeInput = TrustedCatalogChallengeInput &
  ReleaseEligibilityChallengeInput

/**
 * Release-aware admission helper for ordinary CMS reader integration (Track A, A4.1).
 *
 * Mints an `AdmittedChallenge` capability token ONLY if the Challenge is reviewed,
 * syntactically valid, and released at or before `now`. Fails closed (`null`) for
 * embargoed, unreviewed, or malformed records.
 */
export function admitReleasedCmsChallenge(
  challenge: ReleasedCmsChallengeInput,
  now: Date = new Date(),
  options: {
    readonly previousDocumentIds?: readonly string[]
  } = {},
): AdmittedChallenge | null {
  const eligibility = evaluateChallengeReleaseEligibility(challenge, now)
  if (!eligibility.isEligible) {
    return null
  }
  return admitTrustedCatalogChallenge(challenge, options)
}

/**
 * Isolated admission helper exclusively for the opt-in `VITE_ENABLE_PARTICIPATION_PILOT` test
 * harness. Always mints a `'pilot'`-namespaced identity (`pilot:<sampleId>`) that production
 * `'cms'` stores and hosts reject.
 */
export function admitPilotSampleChallenge(input: {
  readonly sampleId: string
  readonly screens: readonly Pick<CmsScreen, 'id'>[]
}): AdmittedChallenge | null {
  const challengeId = formatCanonicalChallengeId('pilot', input.sampleId)
  if (!challengeId) return null

  const screens = sanitizeScreenRefs(input.screens)
  if (!screens) return null

  return Object.freeze({
    [ADMITTED_CHALLENGE_BRAND]: true as const,
    namespace: 'pilot' as const,
    challengeId,
    screens,
    previousChallengeIds: Object.freeze([]),
  })
}
