import { VerifierRuntimeError } from './runtimeErrors.ts'
import type {
  AwardAdmissionResult,
  AwardIssuancePort,
  AwardVerificationDeferralReason,
  ClaimVerificationContext,
  PendingAwardClaim,
  TrustedAwardAttestation,
} from './types.ts'

/**
 * R13-VERIFY2 — the REAL server-only `AwardIssuancePort`, backed by the four accepted
 * `account_issuance.*` functions (R13-VERIFY1 migration, R13-SB2 remediation).
 *
 * It is driver-neutral: the caller supplies a `VerifierSqlExecutor` (the Node `pg`-backed one
 * lives in scripts/accountVerification/pgSqlExecutor.ts and connects as a dedicated LOGIN that
 * holds ONLY the `account_award_verifier` group). This module therefore has no Node, network or
 * credential dependency and can never open a connection by itself.
 *
 * Invariants:
 * - Every SQL text below is a CONSTANT. Values travel only as bound protocol parameters
 *   (`$1`, `$2`, …), never by string interpolation.
 * - Every function is schema-qualified, so the session's empty `search_path` cannot be steered.
 * - Every result is validated against the accepted contract. Anything unexpected is a
 *   `contract` failure; nothing is guessed, defaulted or partially trusted.
 * - No caller-supplied account ID is issuance authority: IDs reach this port only from
 *   `list_pending_award_claims` rows, and the database re-checks the pending claim itself.
 */

export type SqlParameter = string | number | null

export interface VerifierSqlExecutor {
  /** Runs ONE parameterized statement (its own autocommit transaction) and returns the rows. */
  query(text: string, params: readonly SqlParameter[]): Promise<readonly Readonly<Record<string, unknown>>[]>
}

export const ISSUANCE_SQL = Object.freeze({
  listPendingClaims:
    'SELECT p.account_id::text AS account_id, p.award_id AS award_id, ' +
    'p.publication_year_month AS publication_year_month ' +
    'FROM account_issuance.list_pending_award_claims($1::integer) AS p',
  getClaimVerificationContext:
    'SELECT account_issuance.get_claim_verification_context($1::uuid, $2::text)::text AS result',
  admitVerifiedAward: 'SELECT account_issuance.admit_verified_award($1::jsonb)::text AS result',
  recordDeferral:
    'SELECT account_issuance.record_verification_deferral($1::uuid, $2::text, $3::text, $4::integer)::text AS result',
})

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const AWARD_ID = /^card:monthly:\d{4}-(?:0[1-9]|1[0-2]):[a-z0-9]+(?:-[a-z0-9]+)*$/
const YEAR_MONTH = /^\d{4}-(?:0[1-9]|1[0-2])$/
const CALENDAR_DATE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/
const DETAIL = /^[A-Za-z][A-Za-z0-9]{0,63}$/
/** Mirrors the R13-3 `chk_completed_challenge_id` constraint (5–160 chars, `cms:` namespace). */
const CHALLENGE_ID = /^cms:[A-Za-z0-9][A-Za-z0-9._:-]{0,155}$/
/** Upper bound on completions read for one claim (an account cannot plausibly exceed this). */
export const MAX_COMPLETIONS_PER_CONTEXT = 20000
const MAX_RESULT_TEXT = 4 * 1024 * 1024

const DEFERRAL_REASONS: ReadonlySet<AwardVerificationDeferralReason> = new Set([
  'trustedSourceUnavailable',
  'monthNotFound',
  'monthNotPublishable',
  'monthNotYetReleased',
  'discoveryNotFound',
  'notEligibleUnderCurrentRoster',
  'historicalRosterEligibilityUnprovable',
  'cardNotLinked',
  'cardLegacyReservedOnly',
  'cardNotApproved',
  'basisNotInAccountCompletions',
  'admissionRejected',
])

function contract(what: string): VerifierRuntimeError {
  // Never echo the offending value: it may be an identifier or Card data.
  return new VerifierRuntimeError('contract', `issuance port returned an invalid ${what}`)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[], what: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw contract(what)
  }
}

function singleJsonResult(rows: readonly Readonly<Record<string, unknown>>[], what: string): Record<string, unknown> {
  if (rows.length !== 1) throw contract(what)
  const text = rows[0].result
  if (typeof text !== 'string' || text.length === 0 || text.length > MAX_RESULT_TEXT) throw contract(what)
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw contract(what)
  }
  if (!isPlainObject(parsed) || typeof parsed.status !== 'string') throw contract(what)
  return parsed
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

export function parsePendingClaimRows(
  rows: readonly Readonly<Record<string, unknown>>[],
  limit: number,
): PendingAwardClaim[] {
  if (!Array.isArray(rows) || rows.length > limit) throw contract('pending-claim page')
  const seen = new Set<string>()
  return rows.map(row => {
    const accountId = row.account_id
    const awardId = row.award_id
    const ym = row.publication_year_month
    if (
      typeof accountId !== 'string' || !UUID.test(accountId) ||
      typeof awardId !== 'string' || !AWARD_ID.test(awardId) ||
      typeof ym !== 'string' || !YEAR_MONTH.test(ym) ||
      awardId.slice(13, 20) !== ym
    ) {
      throw contract('pending-claim row')
    }
    const key = `${accountId}|${awardId}`
    if (seen.has(key)) throw contract('pending-claim page')
    seen.add(key)
    return { accountId, awardId, publicationYearMonth: ym }
  })
}

export function parseClaimVerificationContext(
  value: Record<string, unknown>,
  accountId: string,
  awardId: string,
): ClaimVerificationContext {
  if (value.status === 'noPendingClaim') {
    onlyKeys(value, ['status'], 'verification context')
    return { status: 'noPendingClaim' }
  }
  if (value.status !== 'pending') throw contract('verification context')
  onlyKeys(
    value,
    ['status', 'accountId', 'awardId', 'publicationYearMonth', 'claimedEarnedOn', 'completedChallengeIds'],
    'verification context',
  )
  const ids = value.completedChallengeIds
  if (
    value.accountId !== accountId ||
    value.awardId !== awardId ||
    typeof value.publicationYearMonth !== 'string' ||
    !YEAR_MONTH.test(value.publicationYearMonth) ||
    value.publicationYearMonth !== awardId.slice(13, 20) ||
    !(value.claimedEarnedOn === undefined || value.claimedEarnedOn === null ||
      (typeof value.claimedEarnedOn === 'string' && CALENDAR_DATE.test(value.claimedEarnedOn))) ||
    !Array.isArray(ids) ||
    ids.length > MAX_COMPLETIONS_PER_CONTEXT ||
    !ids.every(id => typeof id === 'string' && CHALLENGE_ID.test(id))
  ) {
    throw contract('verification context')
  }
  return {
    status: 'pending',
    accountId,
    awardId,
    publicationYearMonth: value.publicationYearMonth,
    completedChallengeIds: [...(ids as string[])],
  }
}

export function parseAdmissionResult(value: Record<string, unknown>, awardId: string): AwardAdmissionResult {
  switch (value.status) {
    case 'admitted':
      onlyKeys(value, ['status', 'awardId', 'revision', 'earnedOn'], 'admission result')
      if (
        value.awardId !== awardId ||
        !isNonNegativeInteger(value.revision) ||
        typeof value.earnedOn !== 'string' ||
        !CALENDAR_DATE.test(value.earnedOn)
      ) {
        throw contract('admission result')
      }
      return { status: 'admitted', earnedOn: value.earnedOn, revision: value.revision }
    case 'alreadyEarned':
      onlyKeys(value, ['status', 'awardId', 'revision'], 'admission result')
      if (value.awardId !== awardId || !(value.revision === null || isNonNegativeInteger(value.revision))) {
        throw contract('admission result')
      }
      return { status: 'alreadyEarned', revision: value.revision }
    case 'noPendingClaim':
      onlyKeys(value, ['status'], 'admission result')
      return { status: 'noPendingClaim' }
    case 'retry':
    case 'rejected':
      onlyKeys(value, ['status', 'detail'], 'admission result')
      if (typeof value.detail !== 'string' || !DETAIL.test(value.detail)) throw contract('admission result')
      return { status: value.status, detail: value.detail }
    default:
      throw contract('admission result')
  }
}

export type DeferralRecordResult = 'deferred' | 'noPendingClaim'

export function parseDeferralResult(
  value: Record<string, unknown>,
  reason: AwardVerificationDeferralReason,
): DeferralRecordResult {
  if (value.status === 'deferred') {
    onlyKeys(value, ['status', 'reason'], 'deferral result')
    if (value.reason !== reason) throw contract('deferral result')
    return 'deferred'
  }
  if (value.status === 'noPendingClaim') {
    // The claim was admitted or withdrawn concurrently: nothing to record, nothing lost.
    onlyKeys(value, ['status'], 'deferral result')
    return 'noPendingClaim'
  }
  // `rejected/invalidDeferralReason` means the runtime and the schema disagree: never ignore it.
  throw contract('deferral result')
}

export interface DatabaseIssuancePortOptions {
  /** Observes each recorded deferral outcome (counts only; used for monitoring). */
  readonly onDeferralRecorded?: (result: DeferralRecordResult) => void
}

export function createDatabaseAwardIssuancePort(
  executor: VerifierSqlExecutor,
  options: DatabaseIssuancePortOptions = {},
): AwardIssuancePort {
  return {
    async listPendingClaims(limit: number): Promise<readonly PendingAwardClaim[]> {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
        throw new VerifierRuntimeError('internal', 'pending-claim limit out of range')
      }
      const rows = await executor.query(ISSUANCE_SQL.listPendingClaims, [limit])
      return parsePendingClaimRows(rows, limit)
    },

    async getClaimVerificationContext(accountId: string, awardId: string): Promise<ClaimVerificationContext> {
      if (!UUID.test(accountId) || !AWARD_ID.test(awardId)) {
        // Only database-sourced identifiers ever reach this port; anything else is a bug.
        return { status: 'noPendingClaim' }
      }
      const rows = await executor.query(ISSUANCE_SQL.getClaimVerificationContext, [accountId, awardId])
      return parseClaimVerificationContext(singleJsonResult(rows, 'verification context'), accountId, awardId)
    },

    async admitVerifiedAward(attestation: TrustedAwardAttestation): Promise<AwardAdmissionResult> {
      const rows = await executor.query(ISSUANCE_SQL.admitVerifiedAward, [JSON.stringify(attestation)])
      return parseAdmissionResult(singleJsonResult(rows, 'admission result'), attestation.awardId)
    },

    async recordDeferral(
      accountId: string,
      awardId: string,
      reason: AwardVerificationDeferralReason,
      rosterVersion?: number,
    ): Promise<void> {
      if (!DEFERRAL_REASONS.has(reason)) {
        throw new VerifierRuntimeError('internal', 'unknown deferral reason')
      }
      const roster =
        rosterVersion === undefined ? null : Number.isSafeInteger(rosterVersion) && rosterVersion >= 1 ? rosterVersion : null
      const rows = await executor.query(ISSUANCE_SQL.recordDeferral, [accountId, awardId, reason, roster])
      const result = parseDeferralResult(singleJsonResult(rows, 'deferral result'), reason)
      options.onDeferralRecorded?.(result)
    },
  }
}
