/**
 * R13-VERIFY2 — Node-only PostgreSQL executor for the private award verifier.
 *
 * SERVER-ONLY. Lives under scripts/ (not src/) so the `pg` driver can never be pulled into the
 * browser/native bundle; tests/accountVerification/runtimeBoundary.test.ts enforces this.
 *
 * - Connects with DISCRETE settings (no connection URL, nothing from PG* variables) as a
 *   dedicated LOGIN, then `SET ROLE account_award_verifier`, so only the group's privileges
 *   (EXECUTE on the four account_issuance functions) are active for every statement.
 * - Hardens the session: empty search_path, statement/lock/idle timeouts, READ COMMITTED.
 * - Preflight refuses a superuser / BYPASSRLS login, a login with ANY role membership other than
 *   exactly one direct grant of `account_award_verifier` (allowlist; nested grants included), or a
 *   database where the accepted issuance port is missing or not executable.
 * - TLS: `verify-full` verifies chain + hostname (custom CA or platform trust store);
 *   `disable` is accepted only for loopback (validated earlier by runtimeConfig).
 * - Every statement is parameterized; errors are reduced to a category + SQLSTATE/network code.
 * - One connection, one statement at a time. A transport failure discards the connection; the
 *   next call reconnects (and re-runs the preflight).
 */
import { isIP } from 'node:net'
import pg from 'pg'
import type { SqlParameter, VerifierSqlExecutor } from '../../src/accountVerification/databaseIssuancePort.ts'
import { FORBIDDEN_LOGINS, type VerifierRuntimeConfig } from '../../src/accountVerification/runtimeConfig.ts'
import { VerifierRuntimeError, classifyDatabaseError } from '../../src/accountVerification/runtimeErrors.ts'

export const VERIFIER_GROUP_ROLE = 'account_award_verifier'
export const VERIFIER_APPLICATION_NAME = 'bibleberry-award-verifier'

const ISSUANCE_SIGNATURES = [
  'account_issuance.list_pending_award_claims(integer)',
  'account_issuance.get_claim_verification_context(uuid,text)',
  'account_issuance.record_verification_deferral(uuid,text,text,integer)',
  'account_issuance.admit_verified_award(jsonb)',
]

const PREFLIGHT_SQL = `
SELECT session_user::text AS login,
       current_user::text AS active_role,
       (SELECT r.rolsuper FROM pg_catalog.pg_roles r WHERE r.rolname = session_user) AS login_superuser,
       (SELECT r.rolbypassrls FROM pg_catalog.pg_roles r WHERE r.rolname = session_user) AS login_bypassrls,
       (SELECT r.rolsuper OR r.rolbypassrls FROM pg_catalog.pg_roles r WHERE r.rolname = current_user) AS active_privileged,
       pg_catalog.pg_has_role(session_user, $1::text, 'MEMBER') AS in_verifier_group,
       -- ALLOWLIST, not a denylist: the login may belong (directly or through any chain of
       -- nested grants) to exactly ONE role, the verifier group. Any other membership, whether a
       -- custom group, a built-in pg_* role, an API role or a wrapper role, fails closed.
       (SELECT count(*)::int FROM pg_catalog.pg_roles r
         WHERE r.rolname <> session_user AND r.rolname <> $1::text
           AND pg_catalog.pg_has_role(session_user, r.oid, 'MEMBER')) AS other_memberships,
       (SELECT count(*)::int FROM pg_catalog.pg_auth_members m
          JOIN pg_catalog.pg_roles g ON g.oid = m.roleid
          JOIN pg_catalog.pg_roles u ON u.oid = m.member
         WHERE u.rolname = session_user) AS direct_memberships,
       (SELECT count(*)::int FROM pg_catalog.pg_auth_members m
          JOIN pg_catalog.pg_roles g ON g.oid = m.roleid
          JOIN pg_catalog.pg_roles u ON u.oid = m.member
         WHERE u.rolname = session_user AND g.rolname = $1::text) AS direct_verifier_memberships,
       (SELECT count(*)::int FROM unnest($2::text[]) AS s(sig)
         WHERE pg_catalog.to_regprocedure(s.sig) IS NOT NULL
           AND pg_catalog.has_function_privilege(pg_catalog.to_regprocedure(s.sig), 'EXECUTE')) AS executable_port_functions,
       pg_catalog.current_setting('transaction_isolation') AS isolation,
       pg_catalog.current_setting('search_path') AS search_path`

export interface PgVerifierExecutor extends VerifierSqlExecutor {
  /** Opens (or re-opens) the connection and runs the least-privilege preflight. */
  connect(): Promise<void>
  /** Destroys the connection. Safe to call repeatedly and during an in-flight statement. */
  close(): Promise<void>
}

export type PgClientFactory = (config: pg.ClientConfig) => pg.Client

export function buildPgClientConfig(db: VerifierRuntimeConfig['database']): pg.ClientConfig {
  let ssl: pg.ClientConfig['ssl']
  if (db.tls.mode === 'disable') {
    ssl = false
  } else {
    ssl = {
      // Chain AND hostname verification. There is deliberately no switch to relax this.
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
      ...(db.tls.caPem ? { ca: db.tls.caPem } : {}),
      ...(isIP(db.host) === 0 ? { servername: db.host } : {}),
    }
  }
  return {
    host: db.host,
    port: db.port,
    database: db.database,
    user: db.user,
    password: db.password.reveal(),
    ssl,
    application_name: VERIFIER_APPLICATION_NAME,
    connectionTimeoutMillis: db.connectTimeoutMs,
    // Client-side guard in case the server never answers (statement_timeout covers the server).
    query_timeout: db.statementTimeoutMs + 2_000,
    keepAlive: true,
  }
}

export function createPgVerifierExecutor(
  db: VerifierRuntimeConfig['database'],
  factory: PgClientFactory = config => new pg.Client(config),
): PgVerifierExecutor {
  let client: pg.Client | null = null
  let connecting: Promise<pg.Client> | null = null
  let closed = false

  const discard = async (target: pg.Client | null) => {
    if (!target) return
    if (client === target) client = null
    await target.end().catch(() => undefined)
  }

  async function open(): Promise<pg.Client> {
    if (closed) throw new VerifierRuntimeError('aborted', 'database executor closed', 'ABORTED')
    const candidate = factory(buildPgClientConfig(db))
    // An unexpected disconnect must never crash the process; the next call reconnects.
    candidate.on('error', () => {
      if (client === candidate) client = null
    })
    try {
      await candidate.connect()
      await candidate.query(`SET ROLE ${VERIFIER_GROUP_ROLE}`)
      await candidate.query(
        `SELECT pg_catalog.set_config('search_path', '', false),
                pg_catalog.set_config('statement_timeout', $1::text, false),
                pg_catalog.set_config('lock_timeout', '5s', false),
                pg_catalog.set_config('idle_in_transaction_session_timeout', '10s', false),
                pg_catalog.set_config('default_transaction_isolation', 'read committed', false)`,
        [`${db.statementTimeoutMs}ms`],
      )
      const result = await candidate.query(PREFLIGHT_SQL, [VERIFIER_GROUP_ROLE, ISSUANCE_SIGNATURES])
      const row = result.rows[0] as Record<string, unknown> | undefined
      if (
        !row ||
        typeof row.login !== 'string' ||
        FORBIDDEN_LOGINS.has(row.login) ||
        row.active_role !== VERIFIER_GROUP_ROLE ||
        row.login_superuser !== false ||
        row.login_bypassrls !== false ||
        row.active_privileged !== false ||
        row.in_verifier_group !== true ||
        row.other_memberships !== 0 ||
        row.direct_memberships !== 1 ||
        row.direct_verifier_memberships !== 1
      ) {
        throw new VerifierRuntimeError('authorization', 'database login is not a least-privilege verifier login', 'LOGIN_PREFLIGHT')
      }
      if (row.executable_port_functions !== ISSUANCE_SIGNATURES.length) {
        throw new VerifierRuntimeError('contract', 'accepted issuance port is missing or not executable', 'PORT_PREFLIGHT')
      }
      if (row.isolation !== 'read committed' || row.search_path !== '') {
        throw new VerifierRuntimeError('contract', 'session hardening did not apply', 'SESSION_PREFLIGHT')
      }
      return candidate
    } catch (error) {
      await candidate.end().catch(() => undefined)
      throw classifyDatabaseError(error)
    }
  }

  async function ensure(): Promise<pg.Client> {
    if (client) return client
    if (!connecting) {
      connecting = open().finally(() => {
        connecting = null
      })
    }
    client = await connecting
    if (closed) {
      await discard(client)
      throw new VerifierRuntimeError('aborted', 'database executor closed', 'ABORTED')
    }
    return client
  }

  return {
    async connect() {
      await ensure()
    },
    async query(text: string, params: readonly SqlParameter[]) {
      const active = await ensure()
      try {
        const result = await active.query({ text, values: [...params] })
        return result.rows as Record<string, unknown>[]
      } catch (error) {
        const failure = classifyDatabaseError(error)
        // After a transport failure the session state is unknown: never reuse it.
        if (failure.category === 'transient' || failure.code === 'CONNECTION_LOST') await discard(active)
        throw closed ? new VerifierRuntimeError('aborted', 'database executor closed', 'ABORTED') : failure
      }
    },
    async close() {
      closed = true
      await discard(client)
    },
  }
}
