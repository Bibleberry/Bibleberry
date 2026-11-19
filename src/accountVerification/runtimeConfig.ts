import { VerifierRuntimeError } from './runtimeErrors.ts'
import { TRUSTED_SANITY_DATASETS, type TrustedSanityDataset } from './types.ts'

/**
 * R13-VERIFY2 — runtime configuration for the private, run-once Scripture Card verifier.
 *
 * Pure and runtime-neutral: the caller passes the environment and a secret-file reader. The
 * parser NEVER echoes a configured value in an error. Errors name the offending VARIABLE only.
 *
 * Credential custody
 * - The database password and Sanity read token are accepted from a mounted secret FILE
 *   (`*_FILE`, preferred) or from an injected environment variable, never both, never from a
 *   connection URL (there is deliberately no URL/DSN setting at all).
 * - Secrets are wrapped in `RuntimeSecret`, which serializes and stringifies as `<redacted>`.
 *
 * TLS trust policy (explicit, fail closed)
 * - `verify-full` (default): certificate chain AND hostname are verified, against the CA bundle
 *   in `AWARD_VERIFIER_DB_TLS_CA_FILE` when set, otherwise the platform trust store.
 * - `disable`: allowed ONLY when the database host is a loopback address (local acceptance).
 * There is no "encrypt but do not verify" mode.
 */

export const VERIFIER_ENV_PREFIX = 'AWARD_VERIFIER_'

/**
 * libpq / node-postgres read these implicitly. If any is set, a misconfigured host could
 * silently redirect the verifier (or supply a password), so the runtime refuses to start.
 */
export const FORBIDDEN_AMBIENT_ENV = [
  'DATABASE_URL',
  'PGHOST',
  'PGHOSTADDR',
  'PGPORT',
  'PGDATABASE',
  'PGUSER',
  'PGPASSWORD',
  'PGPASSFILE',
  'PGSERVICE',
  'PGSERVICEFILE',
  'PGSSLMODE',
  'PGSSLROOTCERT',
  'PGOPTIONS',
  'SUPABASE_DB_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost'])
const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/
const IPV4 = /^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/
const IPV6 = /^[0-9a-f:]{2,39}$/
const DB_NAME = /^[a-z_][a-z0-9_]{0,62}$/
/** A plain role name, optionally with a connection-pooler tenant suffix (`login.<ref>`). */
const LOGIN_NAME = /^([a-z_][a-z0-9_]{0,62})(?:\.[a-z0-9]{6,40})?$/
const PROJECT_ID = /^[a-z0-9]{4,32}$/
const RUN_ID = /^[A-Za-z0-9._-]{1,48}$/
const FILE_PATH = /^\/[^\0\n\r]{1,1023}$/

/** Roles a verifier must never connect as: owners, API roles, platform administrators. */
export const FORBIDDEN_LOGINS = new Set([
  'postgres',
  'supabase_admin',
  'supabase_auth_admin',
  'supabase_storage_admin',
  'supabase_replication_admin',
  'supabase_read_only_user',
  'service_role',
  'authenticator',
  'authenticated',
  'anon',
  'pgbouncer',
  'account_award_issuer',
  'account_award_verifier',
  'account_reconciler',
])

const REDACTED = '<redacted>'

/** Holds a credential. Never serializes, stringifies or inspects to its value. */
export class RuntimeSecret {
  readonly #value: string
  constructor(value: string) {
    this.#value = value
  }
  reveal(): string {
    return this.#value
  }
  toString(): string {
    return REDACTED
  }
  toJSON(): string {
    return REDACTED
  }
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return REDACTED
  }
}

export type DatabaseTlsPolicy =
  | { readonly mode: 'verify-full'; readonly caPem: string | null }
  | { readonly mode: 'disable' }

export interface VerifierRuntimeConfig {
  readonly database: {
    readonly host: string
    readonly port: number
    readonly database: string
    readonly user: string
    readonly password: RuntimeSecret
    readonly tls: DatabaseTlsPolicy
    readonly connectTimeoutMs: number
    readonly statementTimeoutMs: number
  }
  readonly sanity: {
    readonly projectId: string
    readonly dataset: TrustedSanityDataset
    readonly readToken: RuntimeSecret
    readonly requestTimeoutMs: number
  }
  readonly limits: {
    readonly maxClaimsPerBatch: number
    readonly maxBatches: number
    readonly deadlineMs: number
    readonly maxAttempts: number
    readonly retryBaseDelayMs: number
  }
  /** Scheduler-supplied run identifier (e.g. the scheduled slot), or null to derive one. */
  readonly runId: string | null
}

export type EnvRecord = Readonly<Record<string, string | undefined>>

export interface ParseRuntimeConfigOptions {
  /** Reads a mounted secret / CA file. Errors are reported by variable name only. */
  readonly readFile: (path: string) => string
}

function fail(variable: string, problem = 'is invalid'): never {
  throw new VerifierRuntimeError('configuration', `${variable} ${problem}`)
}

function read(env: EnvRecord, name: string): string | undefined {
  const value = env[VERIFIER_ENV_PREFIX + name]
  if (value === undefined) return undefined
  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
}

function required(env: EnvRecord, name: string): string {
  return read(env, name) ?? fail(VERIFIER_ENV_PREFIX + name, 'is required')
}

function boundedInt(env: EnvRecord, name: string, fallback: number, min: number, max: number): number {
  const raw = read(env, name)
  if (raw === undefined) return fallback
  if (!/^\d{1,7}$/.test(raw)) fail(VERIFIER_ENV_PREFIX + name)
  const value = Number(raw)
  if (value < min || value > max) fail(VERIFIER_ENV_PREFIX + name, `must be between ${min} and ${max}`)
  return value
}

function secret(env: EnvRecord, name: string, options: ParseRuntimeConfigOptions): RuntimeSecret {
  const direct = read(env, name)
  const file = read(env, `${name}_FILE`)
  const variable = VERIFIER_ENV_PREFIX + name
  if (direct !== undefined && file !== undefined) fail(variable, 'and its _FILE variant are both set')
  let value: string
  if (file !== undefined) {
    if (!FILE_PATH.test(file)) fail(`${variable}_FILE`, 'must be an absolute path')
    try {
      value = options.readFile(file)
    } catch {
      fail(`${variable}_FILE`, 'could not be read')
    }
  } else if (direct !== undefined) {
    value = direct
  } else {
    fail(variable, 'or its _FILE variant is required')
  }
  // A mounted secret file conventionally ends with one newline; nothing else is normalized.
  value = value.replace(/\r?\n$/, '')
  if (value.length < 1 || value.length > 4096 || /[\0\r\n]/.test(value) || value.trim() !== value) {
    fail(variable, 'has an invalid format')
  }
  return new RuntimeSecret(value)
}

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host)
}

export function parseVerifierRuntimeConfig(env: EnvRecord, options: ParseRuntimeConfigOptions): VerifierRuntimeConfig {
  for (const name of FORBIDDEN_AMBIENT_ENV) {
    if (env[name] !== undefined && env[name] !== '') {
      fail(name, 'is set; unset it so nothing can redirect or authenticate the verifier implicitly')
    }
  }

  const host = required(env, 'DB_HOST').toLowerCase()
  if (!(HOSTNAME.test(host) || IPV4.test(host) || (host.includes(':') && IPV6.test(host)))) {
    fail(`${VERIFIER_ENV_PREFIX}DB_HOST`)
  }
  const port = boundedInt(env, 'DB_PORT', 5432, 1, 65535)
  const database = read(env, 'DB_NAME') ?? 'postgres'
  if (!DB_NAME.test(database)) fail(`${VERIFIER_ENV_PREFIX}DB_NAME`)
  const user = required(env, 'DB_USER')
  const login = LOGIN_NAME.exec(user)
  if (!login) fail(`${VERIFIER_ENV_PREFIX}DB_USER`)
  const base = login[1]
  if (FORBIDDEN_LOGINS.has(base) || base.startsWith('supabase_') || base.startsWith('pg_')) {
    fail(`${VERIFIER_ENV_PREFIX}DB_USER`, 'names a privileged, owner or API role; use a dedicated verifier LOGIN')
  }
  const password = secret(env, 'DB_PASSWORD', options)

  const tlsMode = read(env, 'DB_TLS') ?? 'verify-full'
  let tls: DatabaseTlsPolicy
  if (tlsMode === 'verify-full') {
    const caFile = read(env, 'DB_TLS_CA_FILE')
    let caPem: string | null = null
    if (caFile !== undefined) {
      if (!FILE_PATH.test(caFile)) fail(`${VERIFIER_ENV_PREFIX}DB_TLS_CA_FILE`, 'must be an absolute path')
      try {
        caPem = options.readFile(caFile)
      } catch {
        fail(`${VERIFIER_ENV_PREFIX}DB_TLS_CA_FILE`, 'could not be read')
      }
      if (!/-----BEGIN CERTIFICATE-----/.test(caPem)) fail(`${VERIFIER_ENV_PREFIX}DB_TLS_CA_FILE`, 'holds no PEM certificate')
    }
    tls = { mode: 'verify-full', caPem }
  } else if (tlsMode === 'disable') {
    if (!isLoopbackHost(host)) {
      fail(`${VERIFIER_ENV_PREFIX}DB_TLS`, 'may be "disable" only for a loopback database host')
    }
    if (read(env, 'DB_TLS_CA_FILE') !== undefined) fail(`${VERIFIER_ENV_PREFIX}DB_TLS_CA_FILE`, 'is set while TLS is disabled')
    tls = { mode: 'disable' }
  } else {
    fail(`${VERIFIER_ENV_PREFIX}DB_TLS`, 'must be "verify-full" or "disable"')
  }

  const projectId = required(env, 'SANITY_PROJECT_ID')
  if (!PROJECT_ID.test(projectId)) fail(`${VERIFIER_ENV_PREFIX}SANITY_PROJECT_ID`)
  const dataset = required(env, 'SANITY_DATASET')
  if (!(TRUSTED_SANITY_DATASETS as readonly string[]).includes(dataset)) {
    fail(`${VERIFIER_ENV_PREFIX}SANITY_DATASET`, 'must be an approved dataset (production or staging)')
  }
  const readToken = secret(env, 'SANITY_READ_TOKEN', options)

  const runId = read(env, 'RUN_ID') ?? null
  if (runId !== null && !RUN_ID.test(runId)) fail(`${VERIFIER_ENV_PREFIX}RUN_ID`)

  return {
    database: {
      host,
      port,
      database,
      user,
      password,
      tls,
      connectTimeoutMs: boundedInt(env, 'DB_CONNECT_TIMEOUT_MS', 10_000, 500, 60_000),
      statementTimeoutMs: boundedInt(env, 'DB_STATEMENT_TIMEOUT_MS', 15_000, 500, 60_000),
    },
    sanity: {
      projectId,
      dataset: dataset as TrustedSanityDataset,
      readToken,
      requestTimeoutMs: boundedInt(env, 'SANITY_TIMEOUT_MS', 10_000, 200, 60_000),
    },
    limits: {
      maxClaimsPerBatch: boundedInt(env, 'MAX_CLAIMS_PER_BATCH', 100, 1, 500),
      maxBatches: boundedInt(env, 'MAX_BATCHES', 5, 1, 20),
      deadlineMs: boundedInt(env, 'DEADLINE_MS', 120_000, 1_000, 900_000),
      maxAttempts: boundedInt(env, 'MAX_ATTEMPTS', 3, 1, 5),
      retryBaseDelayMs: boundedInt(env, 'RETRY_BASE_DELAY_MS', 500, 10, 30_000),
    },
    runId,
  }
}
