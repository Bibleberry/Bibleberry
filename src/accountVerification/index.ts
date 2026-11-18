/**
 * R13-VERIFY1 — SERVER-ONLY trusted Scripture Card award verification.
 * Must never be imported by reader, native or UI code (see serverOnlyBoundary test).
 */
export { evaluateClaimEligibility, R13_VERIFY1_VERIFIER_VERSION } from './eligibility.ts'
export type { ClaimEligibilityDecision, EvaluateClaimInput } from './eligibility.ts'
export { createSanityTrustedMonthProvider } from './trustedMonthProvider.ts'
export type { SanityTrustedMonthProviderConfig } from './trustedMonthProvider.ts'
export { credibleDateCeiling, universalReleasedThroughDate } from './serverCivilDates.ts'
export { runAwardVerificationPass, verifyPendingAwardClaim } from './verifier.ts'
export type { AwardVerificationPassOptions } from './verifier.ts'
export type * from './types.ts'
