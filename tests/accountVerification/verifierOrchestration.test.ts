import assert from 'node:assert/strict'
import test from 'node:test'
import { runAwardVerificationPass } from '../../src/accountVerification/verifier.ts'
import type {
  AwardAdmissionResult,
  AwardIssuancePort,
  AwardVerificationDeferralReason,
  PendingAwardClaim,
  TrustedAwardAttestation,
  TrustedMonthFetchResult,
  TrustedMonthlyEditorialProvider,
} from '../../src/accountVerification/types.ts'
import { FIXTURE_DATASET, FIXTURE_PROJECT_ID, canonical, makeTrustedMonth } from './fixtures.ts'

const YM = '2026-09'
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const NOW = () => new Date('2026-10-20T12:00:00Z')

class FakePort implements AwardIssuancePort {
  admitted: TrustedAwardAttestation[] = []
  deferrals: { accountId: string; awardId: string; reason: AwardVerificationDeferralReason }[] = []
  contextCalls: string[] = []
  claims: PendingAwardClaim[]
  completions: Map<string, string[]>
  admitResult: (a: TrustedAwardAttestation) => AwardAdmissionResult = () => ({ status: 'admitted', earnedOn: '2026-09-03', revision: 2 })
  constructor(claims: PendingAwardClaim[], completions: Map<string, string[]>) {
    this.claims = claims
    this.completions = completions
  }
  async listPendingClaims(limit: number) { return this.claims.slice(0, limit) }
  async getClaimVerificationContext(accountId: string, awardId: string) {
    this.contextCalls.push(`${accountId}|${awardId}`)
    const c = this.claims.find(x => x.accountId === accountId && x.awardId === awardId)
    if (!c) return { status: 'noPendingClaim' as const }
    return { status: 'pending' as const, accountId, awardId, publicationYearMonth: c.publicationYearMonth, completedChallengeIds: this.completions.get(accountId) ?? [] }
  }
  async admitVerifiedAward(a: TrustedAwardAttestation) { this.admitted.push(a); return this.admitResult(a) }
  async recordDeferral(accountId: string, awardId: string, reason: AwardVerificationDeferralReason) {
    this.deferrals.push({ accountId, awardId, reason })
  }
}

function provider(result: () => TrustedMonthFetchResult, calls: { n: number }): TrustedMonthlyEditorialProvider {
  return {
    sanityProjectId: FIXTURE_PROJECT_ID,
    dataset: FIXTURE_DATASET,
    async fetchPublishedMonth() { calls.n += 1; return result() },
  }
}

test('pass verifies each account against ITS OWN database completions; month fetched once; summary is counts only', async () => {
  const port = new FakePort(
    [
      { accountId: A, awardId: `card:monthly:${YM}:shepherd-theme`, publicationYearMonth: YM },
      { accountId: B, awardId: `card:monthly:${YM}:shepherd-theme`, publicationYearMonth: YM },
      { accountId: B, awardId: `card:monthly:${YM}:legacy-seal`, publicationYearMonth: YM },
    ],
    new Map([[A, [canonical(YM, 1), canonical(YM, 3)]], [B, [canonical(YM, 1), canonical(YM, 4)]]]),
  )
  const calls = { n: 0 }
  const summary = await runAwardVerificationPass({
    provider: provider(() => ({ status: 'found', document: makeTrustedMonth(YM), revision: 'rev1', dataset: FIXTURE_DATASET }), calls),
    port,
    now: NOW,
    runId: 'run-2026-10-20-a',
  })
  assert.equal(calls.n, 1)
  assert.deepEqual(summary, {
    examined: 3, admitted: 1, alreadyEarned: 0, deferred: 2, skipped: 0,
    deferredByReason: { notEligibleUnderCurrentRoster: 1, cardLegacyReservedOnly: 1 },
  })
  assert.equal(port.admitted.length, 1)
  assert.equal(port.admitted[0].accountId, A)
  assert.equal(port.admitted[0].verificationKey, 'run-2026-10-20-a')
  assert.equal(port.admitted[0].verifiedThroughDate, '2026-10-20', 'UTC-12 universal floor of the injected server clock')
  const s = JSON.stringify(summary)
  assert.equal(s.includes(A) || s.includes(B) || s.includes('card:') || s.includes('cdn.sanity.io'), false)
})

test('trusted source outage defers every claim non-destructively; nothing admitted', async () => {
  const port = new FakePort([{ accountId: A, awardId: `card:monthly:${YM}:shepherd-theme`, publicationYearMonth: YM }], new Map([[A, [canonical(YM, 1), canonical(YM, 3)]]]))
  const calls = { n: 0 }
  const summary = await runAwardVerificationPass({
    provider: { sanityProjectId: FIXTURE_PROJECT_ID, dataset: FIXTURE_DATASET, async fetchPublishedMonth() { calls.n += 1; throw new Error('boom') } },
    port, now: NOW, runId: 'run-outage',
  })
  assert.equal(summary.deferred, 1)
  assert.deepEqual(port.deferrals.map(d => d.reason), ['trustedSourceUnavailable'])
  assert.equal(port.admitted.length, 0)
})

test('database rejection of the attested basis is recorded privately; retry and noPendingClaim are skipped', async () => {
  const claim = { accountId: A, awardId: `card:monthly:${YM}:shepherd-theme`, publicationYearMonth: YM }
  const doc = () => ({ status: 'found' as const, document: makeTrustedMonth(YM), revision: 'rev1', dataset: FIXTURE_DATASET as 'staging' })
  for (const [result, expect] of [
    [{ status: 'rejected', detail: 'basisNotInAccountCompletions' }, 'basisNotInAccountCompletions'],
    [{ status: 'rejected', detail: 'invalidTrustedCard' }, 'admissionRejected'],
  ] as const) {
    const port = new FakePort([claim], new Map([[A, [canonical(YM, 1), canonical(YM, 3)]]]))
    port.admitResult = () => result
    await runAwardVerificationPass({ provider: provider(doc, { n: 0 }), port, now: NOW, runId: 'run-r' })
    assert.deepEqual(port.deferrals.map(d => d.reason), [expect])
  }
  const port = new FakePort([claim], new Map([[A, [canonical(YM, 1), canonical(YM, 3)]]]))
  port.admitResult = () => ({ status: 'retry', detail: 'concurrentAdmission' })
  const s = await runAwardVerificationPass({ provider: provider(doc, { n: 0 }), port, now: NOW, runId: 'run-r' })
  assert.equal(s.skipped, 1)
  assert.equal(port.deferrals.length, 0)
})

test('invalid run identifiers are refused before any database access', async () => {
  const port = new FakePort([], new Map())
  await assert.rejects(runAwardVerificationPass({ provider: provider(() => ({ status: 'notFound' }), { n: 0 }), port, now: NOW, runId: 'bad id with spaces' }), /run identifier/)
})
