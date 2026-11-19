/**
 * R13-SB1 (Issue #210) — shared helpers for the REAL local Supabase acceptance suites.
 *
 * LOCAL-ONLY. Every endpoint must be a loopback URL handed in by
 * scripts/accountSupabase/run-local-supabase-acceptance.sh, which started the disposable stack.
 * Nothing here talks to a hosted Supabase project, Sanity, or any non-loopback host.
 *
 * Secrets: keys, passwords and JWTs are read from the environment and kept in memory only.
 * They are never printed, written to disk, or embedded in assertion messages (`redact`).
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHmac, randomBytes, randomUUID } from 'node:crypto'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

export function assertLoopbackHttpUrl(name: string, value: string): string {
  const url = new URL(value)
  assert.ok(url.protocol === 'http:', `${name} must be plain http on loopback (local stack only)`)
  assert.ok(LOOPBACK_HOSTS.has(url.hostname.toLowerCase()), `${name} must target a loopback host`)
  return value.replace(/\/$/, '')
}

export function assertLoopbackDbUrl(name: string, value: string): string {
  for (const v of ['PGHOST', 'PGHOSTADDR', 'PGSERVICE', 'PGSERVICEFILE']) {
    assert.equal(process.env[v], undefined, `${v} must be unset for the local-only suite`)
  }
  assert.match(value, /^postgres(?:ql)?:\/\//, `${name} must be a postgresql:// URL`)
  const url = new URL(value)
  assert.equal(url.searchParams.has('host'), false, `${name}: host= overrides are not allowed`)
  assert.equal(url.searchParams.has('hostaddr'), false, `${name}: hostaddr= is not allowed`)
  assert.equal(url.searchParams.has('service'), false, `${name}: service= is not allowed`)
  assert.ok(LOOPBACK_HOSTS.has(url.hostname.toLowerCase()), `${name} must target a loopback host`)
  return value
}

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set; run via scripts/accountSupabase/run-local-supabase-acceptance.sh`)
  return value
}

export const stackAvailable = Boolean(process.env.SB1_API_URL && process.env.SB1_ADMIN_DB_URL)
export const skipReason = stackAvailable
  ? false
  : 'R13-SB1 needs a running local Supabase stack; use scripts/accountSupabase/run-local-supabase-acceptance.sh'

export interface LocalStack {
  readonly apiUrl: string
  readonly publishableKey: string
  readonly anonJwtKey: string
  readonly serviceRoleJwtKey: string
  readonly secretKey: string
  readonly legacyJwtSecret: string
  readonly adminDbUrl: string
  readonly dbPort: string
}

export function loadStack(): LocalStack {
  const adminDbUrl = assertLoopbackDbUrl('SB1_ADMIN_DB_URL', requiredEnv('SB1_ADMIN_DB_URL'))
  return {
    apiUrl: assertLoopbackHttpUrl('SB1_API_URL', requiredEnv('SB1_API_URL')),
    publishableKey: requiredEnv('SB1_PUBLISHABLE_KEY'),
    anonJwtKey: requiredEnv('SB1_ANON_KEY'),
    serviceRoleJwtKey: requiredEnv('SB1_SERVICE_ROLE_KEY'),
    secretKey: requiredEnv('SB1_SECRET_KEY'),
    legacyJwtSecret: requiredEnv('SB1_JWT_SECRET'),
    adminDbUrl,
    dbPort: new URL(adminDbUrl).port,
  }
}

/** Masks JWTs, Supabase API keys and anything password-like before text reaches a log. */
export function redact(text: string): string {
  return text
    .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g, '<jwt:redacted>')
    .replace(/sb_(publishable|secret)_[A-Za-z0-9_-]+/g, 'sb_$1_<redacted>')
    .replace(/(password|access_token|refresh_token)("?\s*[:=]\s*"?)[^"\s,}]+/gi, '$1$2<redacted>')
    .replace(/postgres(?:ql)?:\/\/[^@\s]*@/g, 'postgresql://<redacted>@')
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

export interface HttpResult {
  readonly status: number
  readonly body: unknown
  readonly text: string
}

export async function http(
  stack: LocalStack,
  method: string,
  path: string,
  options: { headers?: Record<string, string>; body?: unknown; apikey?: string | null } = {},
): Promise<HttpResult> {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...options.headers }
  const apikey = options.apikey === undefined ? stack.publishableKey : options.apikey
  if (apikey !== null) headers.apikey = apikey
  const response = await fetch(`${stack.apiUrl}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    redirect: 'manual',
  })
  const text = await response.text()
  let body: unknown = null
  try {
    body = text.length > 0 ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return { status: response.status, body, text }
}

/** Short, redacted description of an HTTP result for assertion messages. */
export function describe(result: HttpResult): string {
  return `HTTP ${result.status} ${redact(result.text).slice(0, 400)}`
}

export function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

export async function rpc(
  stack: LocalStack,
  fn: string,
  args: unknown,
  headers: Record<string, string> = {},
  apikey?: string | null,
): Promise<HttpResult> {
  return http(stack, 'POST', `/rest/v1/rpc/${fn}`, { headers, body: args, apikey })
}

// ---------------------------------------------------------------------------
// Real GoTrue sessions
// ---------------------------------------------------------------------------

export interface TestUser {
  readonly label: string
  readonly email: string
  readonly id: string
  readonly accessToken: string
}

/** Signs a synthetic user up through the running local GoTrue (email confirmations disabled). */
export async function signUpUser(stack: LocalStack, label: string): Promise<TestUser> {
  const email = `sb1-${label}-${randomUUID()}@example.test`
  const password = randomBytes(24).toString('base64url')
  const signUp = await http(stack, 'POST', '/auth/v1/signup', { body: { email, password } })
  assert.equal(signUp.status, 200, `GoTrue signup for ${label}: ${describe(signUp)}`)

  // Prove a genuine password sign-in works too (a fresh session distinct from the signup one).
  const signIn = await http(stack, 'POST', '/auth/v1/token?grant_type=password', { body: { email, password } })
  assert.equal(signIn.status, 200, `GoTrue sign-in for ${label}: ${describe(signIn)}`)
  const session = signIn.body as { access_token: string; user: { id: string; email: string } }
  assert.equal(typeof session.access_token, 'string')
  return { label, email, id: session.user.id, accessToken: session.access_token }
}

export function decodeJwtPart(token: string, index: 0 | 1): Record<string, unknown> {
  const part = token.split('.')[index]
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>
}

/** HS256 token signed with a given secret — used only for NEGATIVE tests (expired / wrong key). */
export function signHs256(payload: Record<string, unknown>, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${signature}`
}

// ---------------------------------------------------------------------------
// SQL (admin inspection only — never used as the reader in a positive test)
// ---------------------------------------------------------------------------

export interface PsqlResult {
  readonly ok: boolean
  readonly stdout: string
  readonly stderr: string
}

/** Runs SQL through psql. Values go through psql :'var' quoting, never string concatenation. */
export function psql(url: string, sql: string, vars: Record<string, string> = {}): PsqlResult {
  const args = [url, '-XAtq', '-v', 'ON_ERROR_STOP=1']
  for (const [key, value] of Object.entries(vars)) args.push('-v', `${key}=${value}`)
  const env = { ...process.env }
  for (const key of ['PGHOST', 'PGHOSTADDR', 'PGSERVICE', 'PGSERVICEFILE', 'PGPASSWORD']) delete env[key]
  const result = spawnSync('psql', args, { input: sql, encoding: 'utf8', env, maxBuffer: 8 * 1024 * 1024 })
  return { ok: result.status === 0, stdout: result.stdout.trim(), stderr: redact(result.stderr ?? '') }
}

export function psqlOk(url: string, sql: string, vars: Record<string, string> = {}): string {
  const result = psql(url, sql, vars)
  assert.ok(result.ok, `psql failed: ${result.stderr}`)
  return result.stdout
}

export function psqlJson<T>(url: string, sql: string, vars: Record<string, string> = {}): T {
  const out = psqlOk(url, sql, vars).split('\n').filter(Boolean)
  return JSON.parse(out[out.length - 1] ?? 'null') as T
}

// ---------------------------------------------------------------------------
// Synthetic payload builders (mirror tests/accountDatabase/_r13_tx1_test_helpers.sql)
// ---------------------------------------------------------------------------

export function fingerprint(seed: string): string {
  return createHmac('sha256', 'r13-sb1-fingerprint').update(seed).digest('hex')
}

export function reconcilePayload(options: {
  key: string
  expectedRevision: number
  mode: 'newAccountTransfer' | 'existingAccountMerge'
  data: Record<string, unknown>
  accountId?: string
  fingerprintSeed?: string
}): { p_payload: Record<string, unknown> } {
  const payload: Record<string, unknown> = {
    expectedRevision: options.expectedRevision,
    idempotencyKey: options.key,
    guestPayloadFingerprint: fingerprint(options.fingerprintSeed ?? options.key),
    mode: options.mode,
    envelope: {
      schemaVersion: 1,
      namespace: 'cms',
      revision: options.expectedRevision,
      data: options.data,
      ...(options.accountId ? { accountId: options.accountId } : {}),
    },
  }
  if (options.accountId) payload.accountId = options.accountId
  return { p_payload: payload }
}

/** A structurally valid synthetic Scripture Card snapshot (fixture URL, not real artwork). */
export function syntheticCard(yearMonth: string, slug: string): Record<string, unknown> {
  return {
    cardDocumentId: `card-${slug}`,
    title: `SB1 Test Card ${slug}`,
    publicationYearMonth: yearMonth,
    imageUrl: 'https://cdn.sanity.io/images/sb1test/staging/abc123-1200x1600.png',
    assetRevision: 'rev1',
    illustrationAlt: 'A synthetic illustration',
    accessibleTranscription: 'A synthetic transcription of the card',
    scripture: { book: 'Romans', reference: 'Romans 8:1', translation: 'WEB' },
    attribution: 'Synthetic attribution',
    rightsStatus: 'licensed',
    shareEligible: true,
  }
}

export function uniqueSuffix(): string {
  return randomBytes(4).toString('hex')
}
