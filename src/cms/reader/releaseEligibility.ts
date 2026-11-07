import type { CmsChallenge } from '../sanity/types.ts'

export type ReleaseEligibilityFailureReason =
  | 'unreviewed'
  | 'invalidTimestamp'
  | 'embargoed'

export type ReleaseEligibilityResult =
  | {
      readonly isEligible: true
      readonly releaseTime: number
      readonly releaseDate: Date
    }
  | {
      readonly isEligible: false
      readonly reason: ReleaseEligibilityFailureReason
      readonly releaseTime?: number
      readonly releaseDate?: Date
    }

export type ReleaseEligibilityChallengeInput = Pick<
  CmsChallenge,
  'releaseAtUtc' | 'editorial'
>

/**
 * Pure release-eligibility evaluator (Track A, A4.1).
 *
 * Verifies that a published Challenge satisfies editorial review and has crossed
 * its authored release boundary. Rejects unreviewed content, missing or unparseable
 * timestamps, and future-released (embargoed) records.
 */
export function evaluateChallengeReleaseEligibility(
  challenge: ReleaseEligibilityChallengeInput,
  now: Date = new Date(),
): ReleaseEligibilityResult {
  if (!challenge || typeof challenge !== 'object') {
    return { isEligible: false, reason: 'unreviewed' }
  }

  if (challenge.editorial?.adaptationReviewed !== true) {
    return { isEligible: false, reason: 'unreviewed' }
  }

  if (
    typeof challenge.releaseAtUtc !== 'string' ||
    challenge.releaseAtUtc.trim().length === 0
  ) {
    return { isEligible: false, reason: 'invalidTimestamp' }
  }

  const releaseTime = Date.parse(challenge.releaseAtUtc)
  if (!Number.isFinite(releaseTime)) {
    return { isEligible: false, reason: 'invalidTimestamp' }
  }

  const nowTime = now.getTime()
  if (!Number.isFinite(nowTime)) {
    return { isEligible: false, reason: 'invalidTimestamp' }
  }

  const releaseDate = new Date(releaseTime)

  if (releaseTime > nowTime) {
    return {
      isEligible: false,
      reason: 'embargoed',
      releaseTime,
      releaseDate,
    }
  }

  return {
    isEligible: true,
    releaseTime,
    releaseDate,
  }
}
