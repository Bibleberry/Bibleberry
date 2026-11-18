import type { GatewayEarnedScriptureCard } from '../gateway/types.ts'

/**
 * R13-VERIFY1 — SERVER-ONLY trusted Scripture Card award verification contracts.
 *
 * Nothing in `src/accountVerification/**` may be imported by reader / native / UI code
 * (enforced by tests/accountVerification/serverOnlyBoundary.test.ts). These types describe:
 * - the PRIVILEGED editorial data provider (published Sanity month + linked Cards), and
 * - the server-only database issuance PORT (`account_issuance.*`, executable only by the
 *   `account_award_verifier` role).
 * Neither is reachable from a public route in this milestone.
 */

export const TRUSTED_SANITY_DATASETS = ['production', 'staging'] as const
export type TrustedSanityDataset = (typeof TRUSTED_SANITY_DATASETS)[number]

/** Result of a privileged, `perspective=published` fetch of one monthlyPublication. */
export type TrustedMonthFetchResult =
  | {
      readonly status: 'found'
      readonly document: unknown
      /** Sanity `_rev` of the published month document (bounded version stamp). */
      readonly revision: string
      readonly dataset: TrustedSanityDataset
    }
  | { readonly status: 'notFound' }
  | { readonly status: 'unavailable' }

export interface TrustedMonthlyEditorialProvider {
  /** Must read ONLY published content from an allowlisted dataset with a server-held token. */
  fetchPublishedMonth(yearMonth: string): Promise<TrustedMonthFetchResult>
  readonly sanityProjectId: string
  readonly dataset: TrustedSanityDataset
}

export interface PendingAwardClaim {
  readonly accountId: string
  readonly awardId: string
  readonly publicationYearMonth: string
}

export type ClaimVerificationContext =
  | {
      readonly status: 'pending'
      readonly accountId: string
      readonly awardId: string
      readonly publicationYearMonth: string
      /** DATABASE-OWNED canonical completed Challenge IDs of the claiming account. */
      readonly completedChallengeIds: readonly string[]
    }
  | { readonly status: 'noPendingClaim' }

/**
 * Deferral reasons. Kept private (server/database only): a reason must never be shown to a
 * reader because it could hint at hidden qualifying rules or unpublished Card state.
 */
export type AwardVerificationDeferralReason =
  | 'trustedSourceUnavailable'
  | 'monthNotFound'
  | 'monthNotPublishable'
  | 'monthNotYetReleased'
  | 'discoveryNotFound'
  | 'notEligibleUnderCurrentRoster'
  | 'historicalRosterEligibilityUnprovable'
  | 'cardNotLinked'
  | 'cardLegacyReservedOnly'
  | 'cardNotApproved'
  | 'basisNotInAccountCompletions'
  | 'admissionRejected'

/**
 * Strict allowlisted internal attestation sent to `account_issuance.admit_verified_award`.
 * Contains the qualifying BASIS of this account (its own completions), never the hidden full
 * qualifying list of a discovery, and only the trusted projected Card snapshot.
 */
export interface TrustedAwardAttestation {
  readonly verificationKey: string
  readonly verifierVersion: string
  readonly accountId: string
  readonly awardId: string
  readonly discoveryId: string
  readonly kind: 'thematic' | 'fullMonth'
  readonly publicationYearMonth: string
  readonly rosterVersion: number
  readonly targetCount: number
  readonly basisChallengeIds: readonly string[]
  readonly latestBasisReleaseDate: string
  readonly verifiedThroughDate: string
  readonly card: GatewayEarnedScriptureCard
  readonly source: {
    readonly documentId: string
    readonly revision: string
    readonly dataset: TrustedSanityDataset
    readonly perspective: 'published'
  }
}

export type AwardAdmissionResult =
  | { readonly status: 'admitted'; readonly earnedOn: string; readonly revision: number }
  | { readonly status: 'alreadyEarned'; readonly revision: number | null }
  | { readonly status: 'noPendingClaim' }
  | { readonly status: 'retry'; readonly detail: string }
  | { readonly status: 'rejected'; readonly detail: string }

/** Server-only database port (implemented by a future service adapter; test adapter in tests/). */
export interface AwardIssuancePort {
  listPendingClaims(limit: number): Promise<readonly PendingAwardClaim[]>
  getClaimVerificationContext(accountId: string, awardId: string): Promise<ClaimVerificationContext>
  admitVerifiedAward(attestation: TrustedAwardAttestation): Promise<AwardAdmissionResult>
  recordDeferral(
    accountId: string,
    awardId: string,
    reason: AwardVerificationDeferralReason,
    rosterVersion?: number,
  ): Promise<void>
}

export type ClaimVerificationOutcome =
  | { readonly outcome: 'admitted' | 'alreadyEarned' }
  | { readonly outcome: 'deferred'; readonly reason: AwardVerificationDeferralReason }
  | { readonly outcome: 'skipped'; readonly reason: 'noPendingClaim' | 'retryLater' | 'invalidClaim' }

/** Aggregate pass summary. Contains COUNTS ONLY: no account IDs, award IDs or Card data. */
export interface AwardVerificationPassSummary {
  readonly examined: number
  readonly admitted: number
  readonly alreadyEarned: number
  readonly deferred: number
  readonly skipped: number
  readonly deferredByReason: Readonly<Partial<Record<AwardVerificationDeferralReason, number>>>
}
