import assert from 'node:assert/strict'
import test from 'node:test'
import {
  VERIFIER_EXIT_CODES,
  backoffDelay,
  createBoundedSanityFetch,
  deriveRunId,
  runVerifierOnce,
  type VerifierRunReport,
} from '../../src/accountVerification/runOnce.ts'
import { VerifierRuntimeError } from '../../src/accountVerification/runtimeErrors.ts'
import { createSanityTrustedMonthProvider } from '../../src/accountVerification/trustedMonthProvider.ts'
import type {
  AwardAdmissionResult,
  AwardIssuancePort,
  PendingAwardClaim,
  TrustedAwardAttestation,
  TrustedMonthFetchResult,
  TrustedMonthlyEditorialProvider,
} from '../../src/accountVerification/types.ts'
import { FIXTURE_DATASET, FIXTURE_PROJECT_ID, canonical, makeTrustedMonth } from './fixtures.ts'

/**
 * R13-VERIFY2 run-once orchestration over an IN-MEMORY port that models the accepted SQL
 * semantics (claim queue ordering, idempotent admission, private deferrals). Real-database
 * evidence for the same runtime: tests/accountSupabase/verifierRuntime.supabase.test.ts.
 */

const YM = '2026-09'
const NOW = () => new Date('2026-11-19T12:00:00Z')
const SHEPHERD = `card:monthly:${YM}:shepherd-theme`
const WISDOM = `card:monthly:${YM}:wisdom-path`
const LIMITS = { maxClaimsPerBatch: 100, maxBatches: 5, deadlineMs: 5_000, maxAttempts: 3, retryBaseDelayMs: 10 }

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
}

interface Claim extends PendingAwardClaim {
  lastAttempt: number | null
  order: number
}

/** In-memory model of the four account_issuance functions. */
class MemoryIssuance implements AwardIssuancePort {
  claims = new Map<string, Claim>()
  completions = new Map<string, string[]>()
  earned = new Map<string, TrustedAwardAttestation>()
  deferrals: string[] = []
  calls: string[] = []
  clock = 0
  failNext: { method: string; error: unknown; times: number }[] = []
  admitResults: AwardAdmissionResult[] = []
  hang: { method: string; ms: number } | null = null
  /** Mimic a claim that cannot be resolved (always skipped). */
  removeOnDecision = true

  addClaim(account: string, award: string, completions: string[]) {
    this.claims.set(`${account}|${award}`, { accountId: account, awardId: award, publicationYearMonth: award.slice(13, 20), lastAttempt: null, order: this.claims.size })
    this.completions.set(account, completions)
  }

  private async gate(method: string) {
    this.calls.push(method)
    if (this.hang?.method === method) await new Promise(r => setTimeout(r, this.hang!.ms))
    const f = this.failNext.find(x => x.method === method && x.times > 0)
    if (f) {
      f.times -= 1
      throw f.error
    }
  }

  async listPendingClaims(limit: number) {
    await this.gate('list')
    return [...this.claims.values()]
      .sort((a, b) => (a.lastAttempt ?? -1) - (b.lastAttempt ?? -1) || a.order - b.order)
      .slice(0, limit)
      .map(({ accountId, awardId, publicationYearMonth }) => ({ accountId, awardId, publicationYearMonth }))
  }

  async getClaimVerificationContext(accountId: string, awardId: string) {
    await this.gate('context')
    const claim = this.claims.get(`${accountId}|${awardId}`)
    if (!claim) return { status: 'noPendingClaim' as const }
    return { status: 'pending' as const, accountId, awardId, publicationYearMonth: claim.publicationYearMonth, completedChallengeIds: this.completions.get(accountId) ?? [] }
  }

  async admitVerifiedAward(attestation: TrustedAwardAttestation): Promise<AwardAdmissionResult> {
    await this.gate('admit')
    const forced = this.admitResults.shift()
    if (forced) return forced
    const key = `${attestation.accountId}|${attestation.awardId}`
    if (this.earned.has(key)) {
      this.claims.delete(key)
      return { status: 'alreadyEarned', revision: null }
    }
    if (!this.claims.has(key)) return { status: 'noPendingClaim' }
    this.earned.set(key, attestation)
    this.claims.delete(key)
    return { status: 'admitted', earnedOn: '2026-09-05', revision: 1 }
  }

  async recordDeferral(accountId: string, awardId: string, reason: string) {
    await this.gate('defer')
    const claim = this.claims.get(`${accountId}|${awardId}`)
    if (claim) claim.lastAttempt = ++this.clock
    this.deferrals.push(reason)
  }
}

function fixtureProvider(result: () => TrustedMonthFetchResult | Promise<TrustedMonthFetchResult>): TrustedMonthlyEditorialProvider & { fetches: number } {
  const p = {
    fetches: 0,
    sanityProjectId: FIXTURE_PROJECT_ID,
    dataset: FIXTURE_DATASET,
    async fetchPublishedMonth() {
      p.fetches += 1
      return result()
    },
  }
  return p
}

const found = (): TrustedMonthFetchResult => ({ status: 'found', document: makeTrustedMonth(YM), revision: 'rev0001', dataset: FIXTURE_DATASET })

const noSleep = { sleep: async () => undefined, random: () => 0.5 }

function assertCountsOnly(report: VerifierRunReport) {
  const text = JSON.stringify(report)
  assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}-/.test(text), false, 'no account IDs in the report')
  assert.equal(text.includes('card:monthly:'), false, 'no award IDs in the report')
  assert.equal(/cdn\.sanity|imageUrl|PRIVATE_CARD|INTERNAL_STUDIO|rev0001/.test(text), false, 'no Card / Sanity data')
}

test('full cycle: admits eligible claims, privately defers the rest, reports counts only', async () => {
  const port = new MemoryIssuance()
  port.addClaim(uuid(1), SHEPHERD, [canonical(YM, 1), canonical(YM, 3)])
  port.addClaim(uuid(2), WISDOM, [canonical(YM, 1)]) // forged: day 2 never completed
  const provider = fixtureProvider(found)
  const report = await runVerifierOnce({ port, provider, limits: LIMITS, runId: 'sched-001', now: NOW, ...noSleep })
  assert.equal(report.status, 'completed')
  assert.equal(report.exitCode, 0)
  assert.equal(report.admitted, 1)
  assert.equal(report.deferred, 1)
  assert.deepEqual(report.deferredByReason, { notEligibleUnderCurrentRoster: 1 })
  assert.equal(report.runId, 'sched-001')
  assert.equal(port.earned.get(`${uuid(1)}|${SHEPHERD}`)?.verificationKey, 'sched-001.b1', 'deterministic per-batch verification key')
  assert.equal(provider.fetches, 1, 'one published-month fetch per batch')
  assert.equal(port.claims.size, 1, 'deferred claim stays pending (never discarded)')
  assertCountsOnly(report)

  // Replay: same run, nothing new admitted, no duplicate award.
  const replay = await runVerifierOnce({ port, provider, limits: LIMITS, runId: 'sched-001', now: NOW, ...noSleep })
  assert.equal(replay.admitted, 0)
  assert.equal(port.earned.size, 1)
})

test('transient database failures are retried with bounded exponential backoff, then succeed', async () => {
  const port = new MemoryIssuance()
  port.addClaim(uuid(1), SHEPHERD, [canonical(YM, 1), canonical(YM, 3)])
  port.failNext.push({ method: 'admit', error: Object.assign(new Error('boom'), { code: '57014' }), times: 2 })
  const delays: number[] = []
  const report = await runVerifierOnce({
    port, provider: fixtureProvider(found), limits: LIMITS, runId: 'r1', now: NOW,
    sleep: async ms => { delays.push(ms) }, random: () => 1,
  })
  assert.equal(report.status, 'completed', JSON.stringify(report))
  assert.equal(report.admitted, 1)
  assert.equal(report.retries.database, 2)
  assert.deepEqual(delays, [10, 20], 'exponential backoff')
  assert.equal(port.calls.filter(c => c === 'admit').length, 3)
})

test('persistent transport failure stops after maxAttempts with transientFailure (exit 5), nothing decided', async () => {
  const port = new MemoryIssuance()
  port.addClaim(uuid(1), SHEPHERD, [canonical(YM, 1), canonical(YM, 3)])
  port.failNext.push({ method: 'list', error: Object.assign(new Error('ECONNREFUSED 10.0.0.1:5432'), { code: 'ECONNREFUSED' }), times: 99 })
  const report = await runVerifierOnce({ port, provider: fixtureProvider(found), limits: LIMITS, runId: 'r1', now: NOW, ...noSleep })
  assert.equal(report.status, 'transientFailure')
  assert.equal(report.exitCode, VERIFIER_EXIT_CODES.transientFailure)
  assert.deepEqual(report.failure, { category: 'transient', code: 'ECONNREFUSED' })
  assert.equal(port.calls.length, 3)
  assert.equal(port.claims.size, 1)
  assert.equal(JSON.stringify(report).includes('10.0.0.1'), false, 'no upstream message / host in the report')
})

test('authorization and contract failures are never hot-retried', async () => {
  for (const [error, status, code] of [
    [Object.assign(new Error('permission denied for function admit_verified_award'), { code: '42501' }), 'authorizationFailure', '42501'],
    [Object.assign(new Error('password authentication failed for user "x"'), { code: '28P01' }), 'authorizationFailure', '28P01'],
    [new VerifierRuntimeError('contract', 'bad shape'), 'contractFailure', null],
    [Object.assign(new Error('function account_issuance.x does not exist'), { code: '42883' }), 'contractFailure', '42883'],
  ] as const) {
    const port = new MemoryIssuance()
    port.addClaim(uuid(1), SHEPHERD, [canonical(YM, 1), canonical(YM, 3)])
    port.failNext.push({ method: 'admit', error, times: 99 })
    const report = await runVerifierOnce({ port, provider: fixtureProvider(found), limits: LIMITS, runId: 'r1', now: NOW, ...noSleep })
    assert.equal(report.status, status)
    assert.equal(report.failure?.code, code)
    assert.equal(port.calls.filter(c => c === 'admit').length, 1, `${status} must not be retried`)
    assert.equal(report.retries.database, 0)
    assert.equal(report.unprocessed, 1, 'the failing claim has no acknowledged outcome')
    assertCountsOnly(report)
  }
})

test('trusted-source outage: retried, then private trustedSourceUnavailable deferral; nothing granted (degraded, exit 3)', async () => {
  const port = new MemoryIssuance()
  port.addClaim(uuid(1), SHEPHERD, [canonical(YM, 1), canonical(YM, 3)])
  port.addClaim(uuid(2), WISDOM, [canonical(YM, 2)])
  const provider = fixtureProvider(() => ({ status: 'unavailable' }))
  const report = await runVerifierOnce({ port, provider, limits: LIMITS, runId: 'r1', now: NOW, ...noSleep })
  assert.equal(report.status, 'degraded')
  assert.equal(report.exitCode, 3)
  assert.deepEqual(report.deferredByReason, { trustedSourceUnavailable: 2 })
  assert.equal(report.admitted, 0)
  assert.equal(port.earned.size, 0)
  assert.equal(port.claims.size, 2, 'claims stay pending')
  assert.equal(provider.fetches, 3, 'one month, fetched maxAttempts times, cached for the batch')
  assert.equal(report.retries.sanity, 2)

  // Flaky source that recovers is not degraded.
  let n = 0
  const flaky = fixtureProvider(() => (++n < 2 ? { status: 'unavailable' } : found()))
  const recovered = await runVerifierOnce({ port, provider: flaky, limits: LIMITS, runId: 'r2', now: NOW, ...noSleep })
  assert.equal(recovered.status, 'completed')
  assert.equal(recovered.admitted, 2)
})

test('notFound / unpublishable months are answers (no retry) and defer without granting', async () => {
  const port = new MemoryIssuance()
  port.addClaim(uuid(1), SHEPHERD, [canonical(YM, 1), canonical(YM, 3)])
  const notFound = fixtureProvider(() => ({ status: 'notFound' }))
  const r = await runVerifierOnce({ port, provider: notFound, limits: LIMITS, runId: 'r1', now: NOW, ...noSleep })
  assert.deepEqual(r.deferredByReason, { monthNotFound: 1 })
  assert.equal(notFound.fetches, 1)
  assert.equal(r.status, 'completed')
  const withdrawn = fixtureProvider(() => ({ status: 'found', document: makeTrustedMonth(YM, { overrides: { withdrawn: true } }), revision: 'r', dataset: FIXTURE_DATASET }))
  const w = await runVerifierOnce({ port, provider: withdrawn, limits: LIMITS, runId: 'r2', now: NOW, ...noSleep })
  assert.deepEqual(w.deferredByReason, { monthNotPublishable: 1 })
  assert.equal(port.earned.size, 0)
})

test('deadline: a hung database call stops the run (aborted, exit 4) and no new call starts', async () => {
  const port = new MemoryIssuance()
  port.addClaim(uuid(1), SHEPHERD, [canonical(YM, 1), canonical(YM, 3)])
  port.addClaim(uuid(2), WISDOM, [canonical(YM, 2)])
  port.hang = { method: 'context', ms: 400 }
  const started = Date.now()
  const report = await runVerifierOnce({ port, provider: fixtureProvider(found), limits: { ...LIMITS, deadlineMs: 150 }, runId: 'r1', now: NOW })
  assert.equal(report.status, 'aborted')
  assert.equal(report.exitCode, 4)
  assert.ok(Date.now() - started < 1_500)
  assert.deepEqual(port.calls, ['list', 'context'], 'no call after the deadline')
  assert.equal(report.unprocessed, 2)
  assert.equal(report.moreMayRemain, true)
})

test('external shutdown signal before or during the run: no write starts afterwards', async () => {
  const port = new MemoryIssuance()
  port.addClaim(uuid(1), SHEPHERD, [canonical(YM, 1), canonical(YM, 3)])
  const pre = new AbortController()
  pre.abort()
  const r = await runVerifierOnce({ port, provider: fixtureProvider(found), limits: LIMITS, runId: 'r1', now: NOW, signal: pre.signal })
  assert.equal(r.status, 'aborted')
  assert.equal(port.calls.length, 0)

  const during = new AbortController()
  const slow = fixtureProvider(async () => {
    during.abort()
    return found()
  })
  const d = await runVerifierOnce({ port, provider: slow, limits: LIMITS, runId: 'r2', now: NOW, signal: during.signal })
  assert.equal(d.status, 'aborted')
  assert.equal(port.calls.includes('admit'), false, 'admission never started after shutdown')
  assert.equal(port.earned.size, 0)
})

test('batch caps: claims are drained in bounded batches; a run never re-processes a claim', async () => {
  const port = new MemoryIssuance()
  for (let i = 1; i <= 250; i++) port.addClaim(uuid(i), WISDOM, []) // all ineligible → deferred, rotate to back
  const provider = fixtureProvider(found)
  const report = await runVerifierOnce({ port, provider, limits: LIMITS, runId: 'r1', now: NOW, ...noSleep })
  assert.equal(report.batches, 3)
  assert.equal(report.examined, 250)
  assert.equal(report.deferred, 250)
  assert.equal(new Set(port.deferrals).size, 1)
  assert.equal(port.deferrals.length, 250, 'each claim exactly once in one run')
  assert.equal(report.moreMayRemain, false)

  const capped = await runVerifierOnce({ port, provider, limits: { ...LIMITS, maxBatches: 2 }, runId: 'r2', now: NOW, ...noSleep })
  assert.equal(capped.examined, 200)
  assert.equal(capped.moreMayRemain, true)

  // A full page of claims the run already saw (e.g. skipped) ends the run instead of looping.
  const stuck = new MemoryIssuance()
  for (let i = 1; i <= 3; i++) stuck.addClaim(uuid(i), SHEPHERD, [canonical(YM, 1), canonical(YM, 3)])
  stuck.admitResults = Array.from({ length: 50 }, () => ({ status: 'retry', detail: 'concurrentAdmission' }) as const)
  const s = await runVerifierOnce({ port: stuck, provider, limits: { ...LIMITS, maxClaimsPerBatch: 3 }, runId: 'r3', now: NOW, ...noSleep })
  assert.equal(s.examined, 3)
  assert.ok(s.batches <= 2)
  assert.equal(s.retryLater, 3)
  assert.equal(s.status, 'degraded', 'unresolved concurrency is surfaced, not hidden')
})

test('a concurrent-admission `retry` is retried locally and resolves to alreadyEarned without duplicates', async () => {
  const port = new MemoryIssuance()
  port.addClaim(uuid(1), SHEPHERD, [canonical(YM, 1), canonical(YM, 3)])
  port.admitResults = [{ status: 'retry', detail: 'concurrentAdmission' }]
  const report = await runVerifierOnce({ port, provider: fixtureProvider(found), limits: LIMITS, runId: 'r1', now: NOW, ...noSleep })
  assert.equal(report.admitted, 1)
  assert.equal(report.retryLater, 0)
  assert.equal(port.earned.size, 1)
})

test('run IDs: derived deterministically from the server clock; invalid IDs refused before any call', async () => {
  assert.equal(deriveRunId(new Date('2026-11-19T04:36:18.999Z')), 'r13v2-20261119T043618Z')
  const port = new MemoryIssuance()
  const r = await runVerifierOnce({ port, provider: fixtureProvider(found), limits: LIMITS, runId: null, now: NOW, ...noSleep })
  assert.equal(r.runId, 'r13v2-20261119T120000Z')
  const bad = await runVerifierOnce({ port, provider: fixtureProvider(found), limits: LIMITS, runId: 'bad id!', now: NOW, ...noSleep })
  assert.equal(bad.status, 'configurationError')
  assert.equal(port.calls.length, 1, 'only the first (valid) run touched the port')
  for (let attempt = 1; attempt <= 20; attempt++) {
    assert.ok(backoffDelay(attempt, 30_000, () => 1) <= 30_000, 'backoff is capped')
  }
})

test('bounded Sanity fetch: pinned origin, no redirects, per-request timeout, response size cap', async () => {
  const seen: { url: string; init?: RequestInit }[] = []
  const ok = createBoundedSanityFetch(async (url, init) => {
    seen.push({ url: String(url), init })
    return new Response(JSON.stringify({ result: null }), { status: 200 })
  }, { projectId: FIXTURE_PROJECT_ID, timeoutMs: 1_000 })
  await ok(`https://${FIXTURE_PROJECT_ID}.api.sanity.io/v1/data/query/staging?query=x`)
  assert.equal(seen[0].init?.redirect, 'error')
  assert.ok(seen[0].init?.signal)

  for (const url of [
    'https://evil.example/v1/data/query/staging',
    `http://${FIXTURE_PROJECT_ID}.api.sanity.io/v1`,
    `https://${FIXTURE_PROJECT_ID}.api.sanity.io.evil.example/v1`,
    `https://user:pw@${FIXTURE_PROJECT_ID}.api.sanity.io/v1`,
    `https://${FIXTURE_PROJECT_ID}.api.sanity.io:8443/v1`,
  ]) {
    await assert.rejects(ok(url), /refused/, url)
  }
  assert.equal(seen.length, 1, 'a refused URL never reaches the network')

  const huge = createBoundedSanityFetch(async () => new Response('x'.repeat(2048)), { projectId: FIXTURE_PROJECT_ID, timeoutMs: 1_000, maxResponseBytes: 1024 })
  await assert.rejects(huge(`https://${FIXTURE_PROJECT_ID}.api.sanity.io/v1`), /too large/)

  const hanging = createBoundedSanityFetch((_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
  }), { projectId: FIXTURE_PROJECT_ID, timeoutMs: 50 })
  const t0 = Date.now()
  await assert.rejects(hanging(`https://${FIXTURE_PROJECT_ID}.api.sanity.io/v1`))
  assert.ok(Date.now() - t0 < 1_000)

  // Through the accepted provider, every one of these collapses to `unavailable` without echoing the token.
  const provider = createSanityTrustedMonthProvider({ projectId: FIXTURE_PROJECT_ID, dataset: 'staging', readToken: 'tok-DO-NOT-LEAK', fetchImpl: hanging })
  const result = await provider.fetchPublishedMonth(YM)
  assert.deepEqual(result, { status: 'unavailable' })
})

test('deadline also interrupts an in-flight hung Sanity fetch (no write afterwards)', async () => {
  const port = new MemoryIssuance()
  port.addClaim(uuid(1), SHEPHERD, [canonical(YM, 1), canonical(YM, 3)])
  const hanging = fixtureProvider(() => new Promise<TrustedMonthFetchResult>(() => undefined))
  const t0 = Date.now()
  const report = await runVerifierOnce({ port, provider: hanging, limits: { ...LIMITS, deadlineMs: 100 }, runId: 'r1', now: NOW })
  assert.equal(report.status, 'aborted')
  assert.ok(Date.now() - t0 < 1_000, 'returns promptly at the deadline')
  assert.deepEqual(port.calls, ['list', 'context'], 'no deferral recorded for an unanswered fetch')
  assert.equal(port.deferrals.length, 0)
})
