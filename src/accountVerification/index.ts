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
// R13-VERIFY2 — private runtime (driver-neutral; the Node `pg` executor and CLI live in
// scripts/accountVerification/** and are never part of any browser/native bundle).
export {
  ISSUANCE_SQL,
  createDatabaseAwardIssuancePort,
  parseAdmissionResult,
  parseClaimVerificationContext,
  parseDeferralResult,
  parsePendingClaimRows,
} from './databaseIssuancePort.ts'
export type { DatabaseIssuancePortOptions, SqlParameter, VerifierSqlExecutor } from './databaseIssuancePort.ts'
export {
  R13_VERIFY2_RUNTIME_VERSION,
  VERIFIER_EXIT_CODES,
  abortableSleep,
  backoffDelay,
  createBoundedSanityFetch,
  deriveRunId,
  runVerifierOnce,
} from './runOnce.ts'
export type { RunVerifierOnceOptions, VerifierRunReport, VerifierRunStatus } from './runOnce.ts'
export { FORBIDDEN_AMBIENT_ENV, RuntimeSecret, parseVerifierRuntimeConfig } from './runtimeConfig.ts'
export type { DatabaseTlsPolicy, VerifierRuntimeConfig } from './runtimeConfig.ts'
export { VerifierRuntimeError, classifyDatabaseError } from './runtimeErrors.ts'
export type { VerifierFailureCategory } from './runtimeErrors.ts'
