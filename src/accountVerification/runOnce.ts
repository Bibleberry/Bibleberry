import type { GatewayFetch } from '../gateway/types.ts'
import { R13_VERIFY1_VERIFIER_VERSION } from './eligibility.ts'
import {
  VerifierRuntimeError,
  classifyDatabaseError,
  isVerifierRuntimeError,
  type VerifierFailureCategory,
} from './runtimeErrors.ts'
import type { VerifierRuntimeConfig } from './runtimeConfig.ts'
import type {
  AwardAdmissionResult,
  AwardIssuancePort,
  AwardVerificationDeferralReason,
  AwardVerificationPassSummary,
  ClaimVerificationContext,
  PendingAwardClaim,
  TrustedAwardAttestation,
  TrustedMonthFetchResult,
  TrustedMonthlyEditorialProvider,
} from './types.ts'
import { runAwardVerificationPass } from './verifier.ts'

/**
 * R13-VERIFY2 — ONE bounded, private verification run (server-only).
 *
 * Composes the ACCEPTED engine (`runAwardVerificationPass`, which itself uses the accepted
 * eligibility rules) with a database port and the privileged published-perspective Sanity
 * provider. It adds only operational behaviour; no eligibility rule lives here:
 *
 * - hard caps: claims per batch (≤ 500), batches per run (≤ 20), one wall-clock deadline;
 * - strictly sequential work on one connection: no parallel claim writes;
 * - bounded retries with exponential backoff + jitter for TRANSIENT failures only;
 * - authorization / contract failures stop the run immediately (no hot retry);
 * - deadline or shutdown signal: no NEW database call starts; the run reports `aborted`;
 * - claims seen once in a run are not re-processed by a later batch of the same run;
 * - the report holds COUNTS and generic codes only (no account IDs, award IDs, Card data,
 *   Sanity data, credentials or upstream messages).
 *
 * Every database write is idempotent at the commit boundary (R13-VERIFY1 §8): a retried
 * admission returns `alreadyEarned`, a retried deferral only bumps a private attempt counter.
 */

export const R13_VERIFY2_RUNTIME_VERSION = 'r13-verify2.1'

export type VerifierRunStatus =
  | 'completed'
  | 'degraded'
  | 'aborted'
  | 'transientFailure'
  | 'authorizationFailure'
  | 'contractFailure'
  | 'configurationError'
  | 'internalError'

/** Process exit codes for an external scheduler. */
export const VERIFIER_EXIT_CODES: Readonly<Record<VerifierRunStatus, number>> = Object.freeze({
  completed: 0,
  internalError: 1,
  configurationError: 2,
  degraded: 3,
  aborted: 4,
  transientFailure: 5,
  authorizationFailure: 6,
  contractFailure: 7,
})

export interface VerifierRunReport {
  readonly component: 'bibleberry-award-verifier'
  readonly runtimeVersion: string
  readonly verifierVersion: string
  readonly runId: string
  readonly status: VerifierRunStatus
  readonly exitCode: number
  readonly batches: number
  readonly examined: number
  readonly admitted: number
  readonly alreadyEarned: number
  readonly deferred: number
  readonly skipped: number
  /** Claims listed in an aborted batch that were not reached. */
  readonly unprocessed: number
  readonly deferredByReason: Readonly<Partial<Record<AwardVerificationDeferralReason, number>>>
  /** Admissions the database asked to retry (`concurrentAdmission`) even after local retries. */
  readonly retryLater: number
  /** True when the last page was full: more claims may wait for the next scheduled run. */
  readonly moreMayRemain: boolean
  readonly retries: { readonly database: number; readonly sanity: number }
  readonly failure: { readonly category: VerifierFailureCategory; readonly code: string | null } | null
  readonly durationMs: number
}

export type VerifierLimits = VerifierRuntimeConfig['limits']

export interface RunVerifierOnceOptions {
  readonly port: AwardIssuancePort
  readonly provider: TrustedMonthlyEditorialProvider
  readonly limits: VerifierLimits
  /** Scheduler-supplied run ID, or null to derive `r13v2-<UTC start second>`. */
  readonly runId: string | null
  /** Server clock (never a client timestamp). */
  readonly now?: () => Date
  /** External shutdown signal (SIGTERM / SIGINT). */
  readonly signal?: AbortSignal
  readonly sleep?: (ms: number, signal: AbortSignal) => Promise<void>
  readonly random?: () => number
}

const RUN_ID = /^[A-Za-z0-9._-]{1,48}$/

export function deriveRunId(start: Date): string {
  const iso = start.toISOString() // 2026-11-19T04:36:18.123Z
  return `r13v2-${iso.slice(0, 19).replace(/[-:]/g, '')}Z`
}

export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal.aborted) {
      resolve()
      return
    }
    const done = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done, { once: true })
  })
}

export function backoffDelay(attempt: number, baseMs: number, random: () => number): number {
  const exp = Math.min(baseMs * 2 ** Math.max(attempt - 1, 0), 30_000)
  return Math.round(exp / 2 + (exp / 2) * Math.min(Math.max(random(), 0), 1))
}

function abortedError(): VerifierRuntimeError {
  return new VerifierRuntimeError('aborted', 'verification run stopped by deadline or shutdown', 'ABORTED')
}

/**
 * Resolves with `promise`, or rejects as `aborted` as soon as `signal` fires. The abandoned
 * operation is still bounded by its own timeout (statement_timeout / per-request timeout); its
 * outcome is simply not counted, and every write it might still complete is idempotent.
 */
export function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    promise.catch(() => undefined)
    return Promise.reject(abortedError())
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortedError())
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      value => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      error => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

function claimKey(claim: PendingAwardClaim): string {
  return `${claim.accountId}|${claim.awardId}`
}

interface BatchObservation {
  listed: number
  admitted: number
  alreadyEarned: number
  retryLater: number
  deferred: number
  deferredByReason: Partial<Record<AwardVerificationDeferralReason, number>>
}

function emptyObservation(): BatchObservation {
  return { listed: 0, admitted: 0, alreadyEarned: 0, retryLater: 0, deferred: 0, deferredByReason: {} }
}

/**
 * Runs one bounded verification run. Never throws: every outcome is a report whose status and
 * exit code an external scheduler can act on.
 */
export async function runVerifierOnce(options: RunVerifierOnceOptions): Promise<VerifierRunReport> {
  const now = options.now ?? (() => new Date())
  const sleep = options.sleep ?? abortableSleep
  const random = options.random ?? Math.random
  const started = now()
  const startedMs = Date.now()
  const limits = options.limits
  const runId = options.runId ?? deriveRunId(started)

  const controller = new AbortController()
  const onExternalAbort = () => controller.abort()
  if (options.signal?.aborted) controller.abort()
  options.signal?.addEventListener('abort', onExternalAbort, { once: true })
  const deadline = setTimeout(() => controller.abort(), limits.deadlineMs)
  const signal = controller.signal

  const retries = { database: 0, sanity: 0 }
  const seen = new Set<string>()
  let observation = emptyObservation()

  const totals = {
    batches: 0,
    examined: 0,
    admitted: 0,
    alreadyEarned: 0,
    deferred: 0,
    skipped: 0,
    unprocessed: 0,
    retryLater: 0,
    deferredByReason: {} as Partial<Record<AwardVerificationDeferralReason, number>>,
  }
  let moreMayRemain = false

  const addReasons = (into: Partial<Record<AwardVerificationDeferralReason, number>>, from: AwardVerificationPassSummary['deferredByReason']) => {
    for (const [reason, count] of Object.entries(from) as [AwardVerificationDeferralReason, number][]) {
      into[reason] = (into[reason] ?? 0) + count
    }
  }

  /** One database call with bounded retries for transient failures only. */
  async function withDatabaseRetry<T>(call: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      if (signal.aborted) throw abortedError()
      try {
        return await raceAbort(call(), signal)
      } catch (error) {
        const failure = isVerifierRuntimeError(error) ? error : classifyDatabaseError(error)
        if (failure.category !== 'transient' || attempt >= limits.maxAttempts || signal.aborted) {
          throw signal.aborted && failure.category === 'transient' ? abortedError() : failure
        }
        retries.database += 1
        await sleep(backoffDelay(attempt, limits.retryBaseDelayMs, random), signal)
      }
    }
  }

  const port: AwardIssuancePort = {
    async listPendingClaims(limit: number): Promise<readonly PendingAwardClaim[]> {
      const page = await withDatabaseRetry(() => options.port.listPendingClaims(limit))
      const fresh = page.filter(claim => !seen.has(claimKey(claim)))
      for (const claim of fresh) seen.add(claimKey(claim))
      observation.listed = fresh.length
      return fresh
    },
    async getClaimVerificationContext(accountId: string, awardId: string): Promise<ClaimVerificationContext> {
      return withDatabaseRetry(() => options.port.getClaimVerificationContext(accountId, awardId))
    },
    async admitVerifiedAward(attestation: TrustedAwardAttestation): Promise<AwardAdmissionResult> {
      let result: AwardAdmissionResult
      for (let attempt = 1; ; attempt++) {
        result = await withDatabaseRetry(() => options.port.admitVerifiedAward(attestation))
        // `retry` = a concurrent admission of the same award (unique_violation, rolled back).
        if (result.status !== 'retry' || attempt >= limits.maxAttempts || signal.aborted) break
        retries.database += 1
        await sleep(backoffDelay(attempt, limits.retryBaseDelayMs, random), signal)
      }
      if (result.status === 'admitted') observation.admitted += 1
      else if (result.status === 'alreadyEarned') observation.alreadyEarned += 1
      else if (result.status === 'retry') observation.retryLater += 1
      return result
    },
    async recordDeferral(accountId, awardId, reason, rosterVersion): Promise<void> {
      await withDatabaseRetry(() => options.port.recordDeferral(accountId, awardId, reason, rosterVersion))
      observation.deferred += 1
      observation.deferredByReason[reason] = (observation.deferredByReason[reason] ?? 0) + 1
    },
  }

  const provider: TrustedMonthlyEditorialProvider = {
    sanityProjectId: options.provider.sanityProjectId,
    dataset: options.provider.dataset,
    async fetchPublishedMonth(yearMonth: string): Promise<TrustedMonthFetchResult> {
      for (let attempt = 1; ; attempt++) {
        if (signal.aborted) throw abortedError()
        let result: TrustedMonthFetchResult
        try {
          result = await raceAbort(options.provider.fetchPublishedMonth(yearMonth), signal)
        } catch (error) {
          if (signal.aborted) throw error
          result = { status: 'unavailable' }
        }
        // Only an outage is retried; `found` / `notFound` are answers, not failures.
        if (result.status !== 'unavailable' || attempt >= limits.maxAttempts || signal.aborted) return result
        retries.sanity += 1
        await sleep(backoffDelay(attempt, limits.retryBaseDelayMs, random), signal)
      }
    },
  }

  let failure: VerifierRuntimeError | null = null
  try {
    if (!RUN_ID.test(runId)) {
      throw new VerifierRuntimeError('configuration', 'invalid run identifier')
    }
    for (let batch = 1; batch <= limits.maxBatches; batch++) {
      if (signal.aborted) throw abortedError()
      observation = emptyObservation()
      totals.batches = batch
      let summary: AwardVerificationPassSummary
      try {
        summary = await runAwardVerificationPass({
          provider,
          port,
          now,
          runId: `${runId}.b${batch}`,
          maxClaims: limits.maxClaimsPerBatch,
        })
      } catch (error) {
        // Partial batch: everything the database ACKNOWLEDGED is counted; nothing is guessed.
        totals.examined += observation.listed
        totals.admitted += observation.admitted
        totals.alreadyEarned += observation.alreadyEarned
        totals.deferred += observation.deferred
        totals.retryLater += observation.retryLater
        addReasons(totals.deferredByReason, observation.deferredByReason)
        totals.skipped += observation.retryLater
        // `unprocessed` = listed claims without an outcome the database acknowledged.
        const acknowledged =
          observation.admitted + observation.alreadyEarned + observation.deferred + observation.retryLater
        totals.unprocessed += Math.max(observation.listed - acknowledged, 0)
        moreMayRemain = true
        throw error
      }
      totals.examined += summary.examined
      totals.admitted += summary.admitted
      totals.alreadyEarned += summary.alreadyEarned
      totals.deferred += summary.deferred
      totals.skipped += summary.skipped
      totals.retryLater += observation.retryLater
      addReasons(totals.deferredByReason, summary.deferredByReason)
      // Claims deferred by this run rotate to the back of the queue (oldest-attempted first), so
      // fewer FRESH claims than a full page means the queue is drained for this run (or only
      // already-handled claims remain; the next scheduled run picks those up).
      moreMayRemain = summary.examined >= limits.maxClaimsPerBatch
      if (!moreMayRemain) break
    }
  } catch (error) {
    failure = isVerifierRuntimeError(error)
      ? error
      : new VerifierRuntimeError('internal', 'unexpected verifier failure')
    if (signal.aborted && failure.category !== 'authorization' && failure.category !== 'contract') {
      failure = failure.category === 'aborted' ? failure : abortedError()
    }
  } finally {
    clearTimeout(deadline)
    options.signal?.removeEventListener('abort', onExternalAbort)
  }

  let status: VerifierRunStatus
  if (failure) {
    status = (
      {
        configuration: 'configurationError',
        authorization: 'authorizationFailure',
        contract: 'contractFailure',
        transient: 'transientFailure',
        aborted: 'aborted',
        internal: 'internalError',
      } as const
    )[failure.category]
  } else if ((totals.deferredByReason.trustedSourceUnavailable ?? 0) > 0 || totals.retryLater > 0) {
    status = 'degraded'
  } else {
    status = 'completed'
  }

  return {
    component: 'bibleberry-award-verifier',
    runtimeVersion: R13_VERIFY2_RUNTIME_VERSION,
    verifierVersion: R13_VERIFY1_VERIFIER_VERSION,
    runId,
    status,
    exitCode: VERIFIER_EXIT_CODES[status],
    batches: totals.batches,
    examined: totals.examined,
    admitted: totals.admitted,
    alreadyEarned: totals.alreadyEarned,
    deferred: totals.deferred,
    skipped: totals.skipped,
    unprocessed: totals.unprocessed,
    deferredByReason: totals.deferredByReason,
    retryLater: totals.retryLater,
    moreMayRemain,
    retries,
    failure: failure ? { category: failure.category, code: failure.code ?? null } : null,
    durationMs: Math.max(Date.now() - startedMs, 0),
  }
}

// ---------------------------------------------------------------------------
// Bounded, pinned fetch for the privileged Sanity provider
// ---------------------------------------------------------------------------

export interface BoundedFetchOptions {
  readonly projectId: string
  readonly timeoutMs: number
  /** Run-wide abort (deadline / shutdown). */
  readonly signal?: AbortSignal
  readonly maxResponseBytes?: number
}

/**
 * Wraps a fetch implementation for the trusted provider:
 * - only `GET https://<projectId>.api.sanity.io/...` is allowed (the bearer token can never be
 *   sent to another origin), and redirects are refused;
 * - each request has its own timeout and also stops on the run-wide abort;
 * - the response body is read with a hard size cap before the provider parses it.
 * Any violation rejects, which the accepted provider maps to `unavailable` (never `found`).
 */
export function createBoundedSanityFetch(fetchImpl: GatewayFetch, options: BoundedFetchOptions): GatewayFetch {
  const maxBytes = options.maxResponseBytes ?? 4 * 1024 * 1024
  const expectedHost = `${options.projectId}.api.sanity.io`
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.protocol !== 'https:' || url.hostname !== expectedHost || url.port !== '' || url.username || url.password) {
      throw new Error('refused: unexpected trusted-source origin')
    }
    if ((init?.method ?? 'GET').toUpperCase() !== 'GET') throw new Error('refused: method')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), options.timeoutMs)
    const relay = () => controller.abort()
    if (options.signal?.aborted) controller.abort()
    options.signal?.addEventListener('abort', relay, { once: true })
    try {
      const response = await fetchImpl(url, { ...init, redirect: 'error', signal: controller.signal })
      const declared = Number(response.headers.get('content-length') ?? '0')
      if (Number.isFinite(declared) && declared > maxBytes) throw new Error('refused: response too large')
      const reader = response.body?.getReader()
      const chunks: Uint8Array[] = []
      let total = 0
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          total += value.byteLength
          if (total > maxBytes) {
            await reader.cancel().catch(() => undefined)
            throw new Error('refused: response too large')
          }
          chunks.push(value)
        }
      }
      const body = new Uint8Array(total)
      let offset = 0
      for (const chunk of chunks) {
        body.set(chunk, offset)
        offset += chunk.byteLength
      }
      return new Response(body, { status: response.status, headers: { 'content-type': 'application/json' } })
    } finally {
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', relay)
    }
  }
}
