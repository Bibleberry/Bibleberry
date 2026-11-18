import { evaluateTrustedMonthAwardEligibility } from '../gateway/monthlyProjection.ts'
import type {
  AwardVerificationDeferralReason,
  TrustedAwardAttestation,
  TrustedMonthFetchResult,
} from './types.ts'

export const R13_VERIFY1_VERIFIER_VERSION = 'r13-verify1.1'

const MONTHLY_AWARD_ID = /^card:monthly:(\d{4}-(?:0[1-9]|1[0-2])):([a-z0-9]+(?:-[a-z0-9]+)*)$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export type ClaimEligibilityDecision =
  | { readonly decision: 'admit'; readonly attestation: TrustedAwardAttestation }
  | {
      readonly decision: 'defer'
      readonly reason: AwardVerificationDeferralReason
      readonly rosterVersion?: number
    }
  | { readonly decision: 'invalidClaim' }

export interface EvaluateClaimInput {
  /** From the DATABASE (pending claim row), never from a client request. */
  readonly accountId: string
  readonly awardId: string
  /** DATABASE-OWNED canonical completed Challenge IDs of that account. */
  readonly completedChallengeIds: readonly string[]
  readonly month: TrustedMonthFetchResult
  readonly sanityProjectId: string
  /** Server-controlled civil date (UTC-12 universal floor). */
  readonly releasedThroughDate: string
  readonly verificationKey: string
}

/**
 * Pure decision: may this account's pending claim be admitted as an earned award?
 *
 * Authority comes ONLY from (a) the account's database-owned completions and (b) the
 * privately fetched published month, evaluated with the accepted Gateway rules. Nothing the
 * reader ever submitted about the award (isEarned, snapshot, card ID/URL, shareEligible,
 * flags, date, roster mappings) is an input to this function.
 */
export function evaluateClaimEligibility(input: EvaluateClaimInput): ClaimEligibilityDecision {
  const parsed = MONTHLY_AWARD_ID.exec(input.awardId)
  if (!parsed || !UUID.test(input.accountId)) {
    return { decision: 'invalidClaim' }
  }
  const yearMonth = parsed[1]

  if (input.month.status === 'unavailable') {
    return { decision: 'defer', reason: 'trustedSourceUnavailable' }
  }
  if (input.month.status === 'notFound') {
    return { decision: 'defer', reason: 'monthNotFound' }
  }

  const evaluation = evaluateTrustedMonthAwardEligibility(
    input.month.document,
    yearMonth,
    input.releasedThroughDate,
    input.completedChallengeIds,
    { sanityProjectId: input.sanityProjectId, sanityDataset: input.month.dataset },
  )
  if (!evaluation.ok) {
    return {
      decision: 'defer',
      reason: evaluation.reason === 'embargoed' ? 'monthNotYetReleased' : 'monthNotPublishable',
    }
  }

  const month = evaluation.document
  const entry = month.entries.find(e => e.awardId === input.awardId)
  if (!entry) {
    return { decision: 'defer', reason: 'discoveryNotFound', rosterVersion: month.rosterVersion }
  }
  if (!entry.isEarned || !entry.latestBasisReleaseDate) {
    // priorRosters[] is historical evidence only: it never rewards a claim the current roster
    // cannot prove, but it tells an operator WHICH fact is missing.
    return {
      decision: 'defer',
      reason:
        month.priorRosterCount > 0
          ? 'historicalRosterEligibilityUnprovable'
          : 'notEligibleUnderCurrentRoster',
      rosterVersion: month.rosterVersion,
    }
  }

  switch (entry.card.status) {
    case 'notLinked':
      return { decision: 'defer', reason: 'cardNotLinked', rosterVersion: month.rosterVersion }
    case 'legacyReservedOnly':
      return { decision: 'defer', reason: 'cardLegacyReservedOnly', rosterVersion: month.rosterVersion }
    case 'invalidOrUnapproved':
      return { decision: 'defer', reason: 'cardNotApproved', rosterVersion: month.rosterVersion }
    case 'approved':
      break
  }

  return {
    decision: 'admit',
    attestation: {
      verificationKey: input.verificationKey,
      verifierVersion: R13_VERIFY1_VERIFIER_VERSION,
      accountId: input.accountId,
      awardId: entry.awardId,
      discoveryId: entry.discoveryId,
      kind: entry.kind,
      publicationYearMonth: month.yearMonth,
      rosterVersion: month.rosterVersion,
      targetCount: entry.targetCount,
      basisChallengeIds: entry.basisBaseIds.map(id => `cms:${id}`),
      latestBasisReleaseDate: entry.latestBasisReleaseDate,
      verifiedThroughDate: input.releasedThroughDate,
      card: entry.card.card,
      source: {
        documentId: month.documentId,
        revision: input.month.revision,
        dataset: input.month.dataset,
        perspective: 'published',
      },
    },
  }
}
