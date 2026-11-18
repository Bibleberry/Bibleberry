import { evaluateClaimEligibility } from './eligibility.ts'
import { universalReleasedThroughDate } from './serverCivilDates.ts'
import type {
  AwardIssuancePort,
  AwardVerificationDeferralReason,
  AwardVerificationPassSummary,
  ClaimVerificationOutcome,
  PendingAwardClaim,
  TrustedMonthFetchResult,
  TrustedMonthlyEditorialProvider,
} from './types.ts'

export interface AwardVerificationPassOptions {
  readonly provider: TrustedMonthlyEditorialProvider
  readonly port: AwardIssuancePort
  /** Injected server clock (never a client timestamp). */
  readonly now: () => Date
  /** Server-generated run identifier; combined into each attestation's verification key. */
  readonly runId: string
  readonly maxClaims?: number
}

const RUN_ID = /^[A-Za-z0-9._-]{1,64}$/

/**
 * Verify ONE pending claim end to end: database context → trusted month → eligibility →
 * private admission or private deferral. Never throws on a domain failure; every failure is a
 * retriable, non-destructive deferral that leaves the quarantined claim (and guest retention)
 * in place.
 */
export async function verifyPendingAwardClaim(
  claim: PendingAwardClaim,
  options: Omit<AwardVerificationPassOptions, 'maxClaims'>,
  monthCache: Map<string, Promise<TrustedMonthFetchResult>> = new Map(),
): Promise<ClaimVerificationOutcome> {
  const context = await options.port.getClaimVerificationContext(claim.accountId, claim.awardId)
  if (context.status !== 'pending') {
    return { outcome: 'skipped', reason: 'noPendingClaim' }
  }

  let monthPromise = monthCache.get(context.publicationYearMonth)
  if (!monthPromise) {
    monthPromise = options.provider
      .fetchPublishedMonth(context.publicationYearMonth)
      .catch((): TrustedMonthFetchResult => ({ status: 'unavailable' }))
    monthCache.set(context.publicationYearMonth, monthPromise)
  }
  const month = await monthPromise

  const decision = evaluateClaimEligibility({
    accountId: context.accountId,
    awardId: context.awardId,
    completedChallengeIds: context.completedChallengeIds,
    month,
    sanityProjectId: options.provider.sanityProjectId,
    releasedThroughDate: universalReleasedThroughDate(options.now()),
    verificationKey: options.runId,
  })

  if (decision.decision === 'invalidClaim') {
    return { outcome: 'skipped', reason: 'invalidClaim' }
  }
  if (decision.decision === 'defer') {
    await options.port.recordDeferral(
      context.accountId,
      context.awardId,
      decision.reason,
      decision.rosterVersion,
    )
    return { outcome: 'deferred', reason: decision.reason }
  }

  const admission = await options.port.admitVerifiedAward(decision.attestation)
  switch (admission.status) {
    case 'admitted':
      return { outcome: 'admitted' }
    case 'alreadyEarned':
      return { outcome: 'alreadyEarned' }
    case 'noPendingClaim':
      return { outcome: 'skipped', reason: 'noPendingClaim' }
    case 'retry':
      return { outcome: 'skipped', reason: 'retryLater' }
    case 'rejected': {
      const reason: AwardVerificationDeferralReason =
        admission.detail === 'basisNotInAccountCompletions'
          ? 'basisNotInAccountCompletions'
          : 'admissionRejected'
      await options.port.recordDeferral(context.accountId, context.awardId, reason, decision.attestation.rosterVersion)
      return { outcome: 'deferred', reason }
    }
  }
}

/**
 * One bounded verification pass over pending claims. Returns COUNTS ONLY (no identifiers or
 * Card data) so the summary is safe to log. Months are fetched at most once per pass.
 */
export async function runAwardVerificationPass(
  options: AwardVerificationPassOptions,
): Promise<AwardVerificationPassSummary> {
  if (!RUN_ID.test(options.runId)) {
    throw new Error('Invalid verification run identifier')
  }
  const limit = Math.min(Math.max(Math.trunc(options.maxClaims ?? 100), 1), 500)
  const claims = await options.port.listPendingClaims(limit)
  const monthCache = new Map<string, Promise<TrustedMonthFetchResult>>()

  let admitted = 0
  let alreadyEarned = 0
  let deferred = 0
  let skipped = 0
  const deferredByReason: Partial<Record<AwardVerificationDeferralReason, number>> = {}

  for (const claim of claims) {
    const result = await verifyPendingAwardClaim(claim, options, monthCache)
    switch (result.outcome) {
      case 'admitted':
        admitted += 1
        break
      case 'alreadyEarned':
        alreadyEarned += 1
        break
      case 'deferred':
        deferred += 1
        deferredByReason[result.reason] = (deferredByReason[result.reason] ?? 0) + 1
        break
      case 'skipped':
        skipped += 1
        break
    }
  }

  return { examined: claims.length, admitted, alreadyEarned, deferred, skipped, deferredByReason }
}
