import { spawnSync } from 'node:child_process'
import type {
  AwardAdmissionResult,
  AwardIssuancePort,
  AwardVerificationDeferralReason,
  ClaimVerificationContext,
  PendingAwardClaim,
  TrustedAwardAttestation,
} from '../../src/accountVerification/types.ts'

/**
 * TEST-ONLY AwardIssuancePort backed by a LOCAL disposable PostgreSQL through the `psql` CLI,
 * acting as the `account_award_verifier` role. It is NOT the production runtime bridge (that
 * adapter, its service login and secret custody belong to the follow-on adapter milestone).
 * Values are passed with psql `:'var'` quoting, never string-concatenated into SQL.
 */
export function runPsql(url: string, role: string, sql: string, vars: Record<string, string> = {}): string {
  const args = [url, '-XAtq', '-v', 'ON_ERROR_STOP=1']
  for (const [k, v] of Object.entries(vars)) args.push('-v', `${k}=${v}`)
  // Never let ambient libpq variables redirect this local-only harness.
  const env = { ...process.env }
  for (const key of ['PGHOST', 'PGHOSTADDR', 'PGSERVICE', 'PGSERVICEFILE']) delete env[key]
  const result = spawnSync('psql', args, {
    input: `SET ROLE ${role};\n${sql}\n`,
    encoding: 'utf8',
    env,
  })
  if (result.status !== 0) {
    throw new Error(`psql failed (${result.status}): ${result.stderr}`)
  }
  const lines = result.stdout.trim().split('\n').filter(l => l.length > 0)
  return lines[lines.length - 1] ?? ''
}

export function createPsqlIssuancePort(url: string): AwardIssuancePort {
  const role = 'account_award_verifier'
  return {
    async listPendingClaims(limit: number): Promise<readonly PendingAwardClaim[]> {
      const out = runPsql(
        url,
        role,
        `SELECT coalesce(json_agg(json_build_object('accountId', account_id, 'awardId', award_id,
                 'publicationYearMonth', publication_year_month)), '[]')
           FROM account_issuance.list_pending_award_claims(:'lim'::integer);`,
        { lim: String(limit) },
      )
      return JSON.parse(out) as PendingAwardClaim[]
    },
    async getClaimVerificationContext(accountId: string, awardId: string): Promise<ClaimVerificationContext> {
      const out = runPsql(
        url,
        role,
        `SELECT account_issuance.get_claim_verification_context(:'acct'::uuid, :'award');`,
        { acct: accountId, award: awardId },
      )
      return JSON.parse(out) as ClaimVerificationContext
    },
    async admitVerifiedAward(attestation: TrustedAwardAttestation): Promise<AwardAdmissionResult> {
      const out = runPsql(url, role, `SELECT account_issuance.admit_verified_award(:'att'::jsonb);`, {
        att: JSON.stringify(attestation),
      })
      return JSON.parse(out) as AwardAdmissionResult
    },
    async recordDeferral(
      accountId: string,
      awardId: string,
      reason: AwardVerificationDeferralReason,
      rosterVersion?: number,
    ): Promise<void> {
      runPsql(
        url,
        role,
        `SELECT account_issuance.record_verification_deferral(:'acct'::uuid, :'award', :'reason', nullif(:'roster', '')::integer);`,
        { acct: accountId, award: awardId, reason, roster: rosterVersion === undefined ? '' : String(rosterVersion) },
      )
    },
  }
}
