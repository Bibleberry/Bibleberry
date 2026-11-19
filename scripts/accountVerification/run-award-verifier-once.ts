/**
 * R13-VERIFY2 — private, bounded, RUN-ONCE Scripture Card award verifier (Node CLI).
 *
 * SERVER-ONLY. Intended to be invoked by an approved external scheduler (none is configured or
 * activated by this repository). One invocation = at most AWARD_VERIFIER_MAX_BATCHES batches of
 * at most AWARD_VERIFIER_MAX_CLAIMS_PER_BATCH claims, inside AWARD_VERIFIER_DEADLINE_MS.
 *
 *   node --experimental-strip-types scripts/accountVerification/run-award-verifier-once.ts
 *
 * Configuration: AWARD_VERIFIER_* environment variables (see
 * docs/testing/r13-verify2-private-verifier-runtime.md). Secrets come from mounted files
 * (`*_FILE`) or injected variables, never from a URL, argument or log.
 *
 * Output: exactly ONE JSON line on stdout (counts + generic status only); nothing on stderr
 * unless the process is forced to exit. Exit codes: see VERIFIER_EXIT_CODES.
 */
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { createDatabaseAwardIssuancePort } from '../../src/accountVerification/databaseIssuancePort.ts'
import { R13_VERIFY1_VERIFIER_VERSION } from '../../src/accountVerification/eligibility.ts'
import {
  R13_VERIFY2_RUNTIME_VERSION,
  VERIFIER_EXIT_CODES,
  createBoundedSanityFetch,
  runVerifierOnce,
  type VerifierRunReport,
} from '../../src/accountVerification/runOnce.ts'
import {
  parseVerifierRuntimeConfig,
  type EnvRecord,
  type VerifierRuntimeConfig,
} from '../../src/accountVerification/runtimeConfig.ts'
import { isVerifierRuntimeError } from '../../src/accountVerification/runtimeErrors.ts'
import { createSanityTrustedMonthProvider } from '../../src/accountVerification/trustedMonthProvider.ts'
import type { GatewayFetch } from '../../src/gateway/types.ts'
import { createPgVerifierExecutor, type PgClientFactory } from './pgSqlExecutor.ts'

export interface VerifierCliOptions {
  readonly env: EnvRecord
  readonly readFile?: (path: string) => string
  readonly fetchImpl?: GatewayFetch
  /** Shutdown signal (the CLI wires SIGTERM / SIGINT to it). */
  readonly signal?: AbortSignal
  readonly pgClientFactory?: PgClientFactory
  readonly now?: () => Date
}

const UUID_ANYWHERE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

function staticReport(status: 'configurationError' | 'internalError', code: string | null): VerifierRunReport {
  return {
    component: 'bibleberry-award-verifier',
    runtimeVersion: R13_VERIFY2_RUNTIME_VERSION,
    verifierVersion: R13_VERIFY1_VERIFIER_VERSION,
    runId: 'not-started',
    status,
    exitCode: VERIFIER_EXIT_CODES[status],
    batches: 0,
    examined: 0,
    admitted: 0,
    alreadyEarned: 0,
    deferred: 0,
    skipped: 0,
    unprocessed: 0,
    deferredByReason: {},
    retryLater: 0,
    moreMayRemain: false,
    retries: { database: 0, sanity: 0 },
    failure: { category: status === 'configurationError' ? 'configuration' : 'internal', code },
    durationMs: 0,
  }
}

/**
 * Last line of defence before anything is printed: the report must not contain a UUID, an
 * award ID or a configured secret. The report builder never puts them there; if a
 * future change ever did, the run is reported as an internal error instead of leaking.
 */
export function serializeReportSafely(report: VerifierRunReport, config: VerifierRuntimeConfig | null): string {
  const text = JSON.stringify(report)
  const secrets = config ? [config.database.password.reveal(), config.sanity.readToken.reveal()] : []
  if (UUID_ANYWHERE.test(text) || text.includes('card:monthly:') || secrets.some(v => v.length >= 6 && text.includes(v))) {
    return JSON.stringify(staticReport('internalError', 'REPORT_REDACTION_GUARD'))
  }
  return text
}

/** Parses configuration, runs one bounded pass and returns the printable line + exit code. */
export async function runVerifierCli(options: VerifierCliOptions): Promise<{ line: string; exitCode: number; report: VerifierRunReport }> {
  let config: VerifierRuntimeConfig
  try {
    config = parseVerifierRuntimeConfig(options.env, { readFile: options.readFile ?? (p => readFileSync(p, 'utf8')) })
  } catch (error) {
    // The variable NAME is safe to show an operator; it is in the message, never the value.
    const report = staticReport(
      isVerifierRuntimeError(error) && error.category === 'configuration' ? 'configurationError' : 'internalError',
      isVerifierRuntimeError(error) ? (/^[A-Z_]{3,64}\b/.exec(error.message)?.[0] ?? null) : null,
    )
    return { line: JSON.stringify(report), exitCode: report.exitCode, report }
  }

  const executor = createPgVerifierExecutor(config.database, options.pgClientFactory)
  const onAbort = () => {
    // Graceful shutdown: drop the connection so an in-flight statement is rolled back by the
    // server (each issuance call is one atomic statement), and no new statement can start.
    void executor.close()
  }
  options.signal?.addEventListener('abort', onAbort, { once: true })
  try {
    const provider = createSanityTrustedMonthProvider({
      projectId: config.sanity.projectId,
      dataset: config.sanity.dataset,
      readToken: config.sanity.readToken.reveal(),
      fetchImpl: createBoundedSanityFetch(options.fetchImpl ?? globalThis.fetch, {
        projectId: config.sanity.projectId,
        timeoutMs: config.sanity.requestTimeoutMs,
        signal: options.signal,
      }),
    })
    const report = await runVerifierOnce({
      port: createDatabaseAwardIssuancePort(executor),
      provider,
      limits: config.limits,
      runId: config.runId,
      signal: options.signal,
      now: options.now,
    })
    return { line: serializeReportSafely(report, config), exitCode: report.exitCode, report }
  } finally {
    options.signal?.removeEventListener('abort', onAbort)
    await executor.close()
  }
}

async function main(): Promise<void> {
  const controller = new AbortController()
  let forced: ReturnType<typeof setTimeout> | undefined
  const shutdown = () => {
    if (controller.signal.aborted) return
    controller.abort()
    // Hard stop if graceful shutdown does not finish promptly.
    forced = setTimeout(() => {
      process.stderr.write('{"component":"bibleberry-award-verifier","status":"forcedExit"}\n')
      process.exit(VERIFIER_EXIT_CODES.aborted)
    }, 10_000)
    forced.unref()
  }
  process.once('SIGTERM', shutdown)
  process.once('SIGINT', shutdown)

  let result: { line: string; exitCode: number }
  try {
    result = await runVerifierCli({ env: process.env, signal: controller.signal })
  } catch {
    const report = staticReport('internalError', null)
    result = { line: JSON.stringify(report), exitCode: report.exitCode }
  }
  process.stdout.write(`${result.line}\n`)
  if (forced) clearTimeout(forced)
  process.exitCode = result.exitCode
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  void main()
}
