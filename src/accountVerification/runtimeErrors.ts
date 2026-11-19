/**
 * R13-VERIFY2 — failure taxonomy for the private verifier runtime (server-only).
 *
 * Every failure the runtime can surface is reduced to a small, GENERIC category. Error
 * messages from drivers, servers or upstream services are NEVER carried forward: they can embed
 * hostnames, role names, account IDs or credentials. Only the category (and, for database
 * errors, the 5-character SQLSTATE class code) is ever reported.
 */

export type VerifierFailureCategory =
  /** Invalid or missing runtime configuration. Nothing was contacted. */
  | 'configuration'
  /** Credentials rejected, wrong role, missing privilege or a privileged login. Do not hot-retry. */
  | 'authorization'
  /** A dependency answered with something outside the accepted contract. Do not hot-retry. */
  | 'contract'
  /** Network / availability / timeout / lock contention. Safe to retry later. */
  | 'transient'
  /** The run was stopped by its deadline or a shutdown signal. Safe to re-run. */
  | 'aborted'
  /** Anything else. */
  | 'internal'

export class VerifierRuntimeError extends Error {
  readonly category: VerifierFailureCategory
  /** Generic, non-identifying code (e.g. a SQLSTATE or `ECONNREFUSED`). Never a message. */
  readonly code: string | undefined

  constructor(category: VerifierFailureCategory, summary: string, code?: string) {
    super(summary)
    this.name = 'VerifierRuntimeError'
    this.category = category
    this.code = code
  }
}

export function isVerifierRuntimeError(value: unknown): value is VerifierRuntimeError {
  return value instanceof VerifierRuntimeError
}

const SQLSTATE = /^[0-9A-Z]{5}$/
const SAFE_CODE = /^[A-Z0-9_]{2,40}$/

/** SQLSTATEs that are safe to retry: the statement was rolled back and nothing was decided. */
const TRANSIENT_SQLSTATES = new Set([
  '40001', // serialization_failure
  '40P01', // deadlock_detected
  '55P03', // lock_not_available (lock_timeout)
  '57014', // query_canceled (statement_timeout)
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now
  '53300', // too_many_connections
  '53400', // configuration_limit_exceeded
  '58000', // system_error
  '58030', // io_error
])

/** Node / driver network error codes that indicate a transport problem, not a decision. */
const TRANSIENT_NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNABORTED',
])

/**
 * Classifies a database driver error by SQLSTATE / network code only.
 * - Class 08 (connection exception), the codes above and network errors → transient.
 * - 28xxx (invalid authorization), 42501 (insufficient privilege), 3D000 (no such database),
 *   0P000 (invalid role specification) → authorization.
 * - 42883 / 42P01 / 3F000 (missing function / relation / schema) → contract (schema drift).
 * - Anything else → internal.
 */
export function classifyDatabaseError(error: unknown): VerifierRuntimeError {
  if (isVerifierRuntimeError(error)) return error
  const raw = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined
  const code = typeof raw === 'string' ? raw : undefined
  const timeoutLike =
    error instanceof Error && /timeout|terminated|Connection ended|closed/i.test(error.message) && !code

  if (code && SQLSTATE.test(code)) {
    if (code.startsWith('08') || TRANSIENT_SQLSTATES.has(code)) {
      return new VerifierRuntimeError('transient', 'database temporarily unavailable', code)
    }
    if (code.startsWith('28') || code === '42501' || code === '3D000' || code === '0P000') {
      return new VerifierRuntimeError('authorization', 'database authorization failed', code)
    }
    if (code === '42883' || code === '42P01' || code === '3F000') {
      return new VerifierRuntimeError('contract', 'database issuance contract not found', code)
    }
    return new VerifierRuntimeError('internal', 'database error', code)
  }
  // TLS trust failures are SECURITY failures (wrong CA, self-signed, hostname mismatch, server
  // refusing TLS). They are never retried as if the network were merely flaky.
  if (code && /CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER/.test(code)) {
    return new VerifierRuntimeError('authorization', 'database TLS verification failed', 'TLS_VERIFICATION_FAILED')
  }
  if (error instanceof Error && /does not support SSL/i.test(error.message)) {
    return new VerifierRuntimeError('authorization', 'database refused TLS', 'TLS_UNAVAILABLE')
  }
  if (code && TRANSIENT_NETWORK_CODES.has(code)) {
    return new VerifierRuntimeError('transient', 'database unreachable', code)
  }
  if (timeoutLike) {
    return new VerifierRuntimeError('transient', 'database connection timed out or closed', 'CONNECTION_LOST')
  }
  return new VerifierRuntimeError(
    'internal',
    'unexpected database failure',
    code && SAFE_CODE.test(code) ? code : undefined,
  )
}
