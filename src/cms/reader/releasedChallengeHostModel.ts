import type { CmsCatalogResult } from '../sanity/catalog.ts'
import type { ChallengeMappingFailure } from '../sanity/mapChallenge.ts'
import { CMS_EDITORIAL_TIME_ZONE } from '../sanity/presentation.ts'
import type { CmsChallenge } from '../sanity/types.ts'
import {
  admitReleasedCmsChallenge,
  admitTrustedCatalogChallenge,
  type AdmittedChallenge,
} from '../../participation/admission.ts'
import type { ChallengeDetailResult } from './challengeDetailProvider.ts'
import { evaluateChallengeReleaseEligibility } from './releaseEligibility.ts'

export type ReleasedChallengeHostState =
  | { readonly status: 'loading' }
  | { readonly status: 'requestError'; readonly message: string }
  | {
      readonly status: 'validationError'
      readonly failures: readonly ChallengeMappingFailure[]
    }
  | { readonly status: 'notFound'; readonly slug: string }
  | {
      readonly status: 'embargoed'
      readonly slug: string
      readonly title: string
      readonly releaseDate?: Date
    }
  | {
      readonly status: 'ineligible'
      readonly slug: string
      readonly reason: 'unreviewed' | 'invalidTimestamp'
    }
  | {
      readonly status: 'admissionFailed'
      readonly slug: string
    }
  | {
      readonly status: 'ready'
      readonly challenge: CmsChallenge
      readonly admittedChallenge: AdmittedChallenge
    }

export function formatReleaseDateTime(date: Date): string {
  return new Intl.DateTimeFormat('en', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: CMS_EDITORIAL_TIME_ZONE,
  }).format(date)
}

/**
 * Pure state resolution helper for ReleasedChallengeHost (Track A, A4.1).
 *
 * Evaluates catalog state, slug presence, editorial review, release embargo, and
 * trusted capability admission before permitting PersistedChallengeHost to mount.
 */
export function deriveReleasedChallengeState(
  catalogResult: CmsCatalogResult | null,
  slug: string,
  now: Date,
): ReleasedChallengeHostState {
  if (!catalogResult) {
    return { status: 'loading' }
  }

  if (catalogResult.status === 'requestError') {
    return { status: 'requestError', message: catalogResult.message }
  }

  if (catalogResult.status === 'validationError') {
    return { status: 'validationError', failures: catalogResult.failures }
  }

  if (catalogResult.status === 'empty') {
    return { status: 'notFound', slug }
  }

  const challenge = catalogResult.challenges.find(c => c.id === slug)
  if (!challenge) {
    return { status: 'notFound', slug }
  }

  const eligibility = evaluateChallengeReleaseEligibility(challenge, now)
  if (!eligibility.isEligible) {
    if (eligibility.reason === 'embargoed') {
      const releaseDate =
        eligibility.releaseDate ??
        (challenge.releaseAtUtc ? new Date(challenge.releaseAtUtc) : undefined)

      return {
        status: 'embargoed',
        slug,
        title: challenge.title,
        ...(releaseDate ? { releaseDate } : {}),
      }
    }
    return {
      status: 'ineligible',
      slug,
      reason: eligibility.reason,
    }
  }

  const admittedChallenge = admitReleasedCmsChallenge(challenge, now)
  if (!admittedChallenge) {
    return { status: 'admissionFailed', slug }
  }

  return {
    status: 'ready',
    challenge,
    admittedChallenge,
  }
}

/**
 * Pure state resolution helper for ReleasedChallengeHost when consuming a single
 * `ChallengeDetailResult` (e.g. from the Stage 2 release gateway or an adapted catalog provider).
 *
 * Verifies slug matching, editorial eligibility, and trusted capability admission.
 */
export function deriveReleasedChallengeDetailState(
  detailResult: ChallengeDetailResult | null,
  slug: string,
  now: Date,
): ReleasedChallengeHostState {
  if (!detailResult) {
    return { status: 'loading' }
  }

  if (detailResult.status === 'requestError') {
    return { status: 'requestError', message: detailResult.message }
  }

  if (detailResult.status === 'validationError') {
    return { status: 'validationError', failures: detailResult.failures }
  }

  if (detailResult.status === 'notFound') {
    return { status: 'notFound', slug }
  }

  const challenge = detailResult.challenge
  if (challenge.id !== slug) {
    return { status: 'notFound', slug }
  }

  // Gateway-authorized content: The Cloudflare Worker gateway has already evaluated release
  // eligibility at query time using the authoritative server clock and GROQ release constraints.
  // A desynchronized or incorrectly set client device clock must NOT veto a server-authorized release.
  //
  // We still enforce:
  // 1. Editorial review confirmation (adaptationReviewed === true)
  // 2. Syntactically valid release schedule: either a valid ISO calendarSlot.publicationDate
  //    or a parseable releaseAtUtc timestamp. Fails closed if neither is present.
  // 3. Document identity, screen uniqueness, and capability token minting via admitTrustedCatalogChallenge
  if (detailResult.source === 'gateway') {
    if (challenge.editorial?.adaptationReviewed !== true) {
      return {
        status: 'ineligible',
        slug,
        reason: 'unreviewed',
      }
    }

    const hasValidCalendarSlot =
      typeof challenge.calendarSlot?.publicationDate === 'string' &&
      /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(challenge.calendarSlot.publicationDate)

    const hasValidReleaseAtUtc =
      typeof challenge.releaseAtUtc === 'string' &&
      !Number.isNaN(Date.parse(challenge.releaseAtUtc))

    if (!hasValidCalendarSlot && !hasValidReleaseAtUtc) {
      return {
        status: 'ineligible',
        slug,
        reason: 'invalidTimestamp',
      }
    }

    const admittedChallenge = admitTrustedCatalogChallenge(challenge)
    if (!admittedChallenge) {
      return { status: 'admissionFailed', slug }
    }

    return {
      status: 'ready',
      challenge,
      admittedChallenge,
    }
  }

  // Legacy direct-Sanity catalog path (A4.1 fallback):
  // Direct client queries to Sanity do not pass through a server release gateway,
  // so client-side release eligibility (evaluating embargo against `now`) is strictly enforced.
  // Client-supplied calendarSlot does NOT bypass this check; unslotted/direct content must
  // have a valid releaseAtUtc instant that has passed.
  const eligibility = evaluateChallengeReleaseEligibility(challenge, now)
  if (!eligibility.isEligible) {
    if (eligibility.reason === 'embargoed') {
      const releaseDate =
        eligibility.releaseDate ??
        (challenge.releaseAtUtc ? new Date(challenge.releaseAtUtc) : undefined)

      return {
        status: 'embargoed',
        slug,
        title: challenge.title,
        ...(releaseDate ? { releaseDate } : {}),
      }
    }
    return {
      status: 'ineligible',
      slug,
      reason: eligibility.reason,
    }
  }

  const admittedChallenge = admitReleasedCmsChallenge(challenge, now)
  if (!admittedChallenge) {
    return { status: 'admissionFailed', slug }
  }

  return {
    status: 'ready',
    challenge,
    admittedChallenge,
  }
}

