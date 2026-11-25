import type { PersistenceHealth } from '../../participation/persistence.ts'
import type { ReaderParticipationStoreStatus } from '../../participation/store.ts'
import type { ReaderParticipationData } from '../../participation/types.ts'
import type { ReaderProfile, ReaderProfileHealth } from '../../readerProfile/types.ts'

/**
 * Approved §3.4 threshold: a guest becomes eligible for the optional Today account
 * invitation only after finishing three distinct Challenges.
 */
export const GUEST_INVITE_FINISH_THRESHOLD = 3

const CANONICAL_CHALLENGE_ID_PATTERN = /^(?:cms|pilot):[^\s]+$/

export type GuestInviteEligibilityReason =
  | 'eligible'
  | 'participationUnavailable'
  | 'belowThreshold'
  | 'profileUnavailable'
  | 'dismissed'
  | 'pendingAnnouncement'

export interface GuestInviteEligibilityInput {
  readonly participationStatus: ReaderParticipationStoreStatus
  readonly participationHealth: PersistenceHealth
  readonly participationData: ReaderParticipationData | null
  readonly profileStatus: 'loading' | 'ready' | 'error'
  readonly profileHealth: ReaderProfileHealth | null
  readonly profile: ReaderProfile | null
  /**
   * True when a Hub earned-Card announcement is open or still hydrating.
   * Per §3.4 and Coastal Osprey (#322), the guest invitation never renders
   * simultaneously with or ahead of a pending Card announcement.
   */
  readonly hasPendingCardAnnouncement: boolean
}

export interface GuestInviteEligibilityResult {
  readonly eligible: boolean
  readonly distinctCompletedCount: number
  readonly reason: GuestInviteEligibilityReason
}

/**
 * Counts distinct completed canonical Challenge identities in durable participation data.
 * Repeat Finishes, `Read Again`, day counts, in-progress records, and earned awards do not
 * increase this count.
 */
export function countDistinctCompletedChallenges(
  participationData: ReaderParticipationData | null | undefined,
): number {
  const completed = participationData?.completedChallenges
  if (!completed || typeof completed !== 'object') return 0

  const distinctIds = new Set<string>()
  for (const [challengeId, record] of Object.entries(completed)) {
    if (!CANONICAL_CHALLENGE_ID_PATTERN.test(challengeId)) continue
    if (!record || typeof record !== 'object') continue
    if (typeof record.completedOn !== 'string' || record.completedOn.trim().length === 0) continue
    distinctIds.add(challengeId)
  }
  return distinctIds.size
}

/**
 * Derives whether the optional guest account invitation should be shown on Today.
 * Pure and deterministic: never reads browser storage, device clocks, or navigation state.
 */
export function deriveGuestInviteEligibility(
  input: GuestInviteEligibilityInput,
): GuestInviteEligibilityResult {
  if (
    input.participationStatus !== 'ready' ||
    input.participationHealth !== 'ok' ||
    !input.participationData
  ) {
    return {
      eligible: false,
      distinctCompletedCount: 0,
      reason: 'participationUnavailable',
    }
  }

  const distinctCompletedCount = countDistinctCompletedChallenges(input.participationData)
  if (distinctCompletedCount < GUEST_INVITE_FINISH_THRESHOLD) {
    return {
      eligible: false,
      distinctCompletedCount,
      reason: 'belowThreshold',
    }
  }

  if (
    input.profileStatus !== 'ready' ||
    input.profileHealth !== 'ok' ||
    !input.profile
  ) {
    return {
      eligible: false,
      distinctCompletedCount,
      reason: 'profileUnavailable',
    }
  }

  if (input.profile.guestInviteDismissed) {
    return {
      eligible: false,
      distinctCompletedCount,
      reason: 'dismissed',
    }
  }

  if (input.hasPendingCardAnnouncement) {
    return {
      eligible: false,
      distinctCompletedCount,
      reason: 'pendingAnnouncement',
    }
  }

  return {
    eligible: true,
    distinctCompletedCount,
    reason: 'eligible',
  }
}
