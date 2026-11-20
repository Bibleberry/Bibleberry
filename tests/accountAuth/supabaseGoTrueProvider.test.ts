import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  createAccountSessionController,
  createInMemoryAuthTokenStore,
  createSupabaseGoTrueAuthProvider,
  isPrivilegedSupabaseKey,
  isPublishableSupabaseKey,
  toAuthorizedAccountSession,
} from '../../src/accountAuth/index.ts'
import type {
  AuthTokenStore,
  StoredAuthTokens,
  SupabaseGoTrueAuthProviderOptions,
} from '../../src/accountAuth/index.ts'
import {
  SupabasePostgrestTransport,
  createMockAuthorizedAccountTransport,
  parseAccountId,
} from '../../src/accountSync/index.ts'
import type {
  GuestClearanceDecision,
  GuestParticipationEnvelopeV2,
  GuestReconciliationInput,
  GuestStorageAccessor,
} from '../../src/accountSync/index.ts'
import { parseLocalCalendarDate, parseStoredChallengeId } from '../../src/participation/identity.ts'

// R13-2B (Issue #251, Sable Harbor). Deterministic fake GoTrue; synthetic identities only.

const URL_BASE = 'https://synthetic-project.example.test'
const PUBLISHABLE_KEY = 'sb_publishable_synthetic_test_key_000000'
const ACCT_A = parseAccountId('6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b')!
const ACCT_B = parseAccountId('7a2b3c4d-5e6f-4a1b-9c2d-3e4f5a6b7c8d')!
const EMAIL_A = 'reader.a@example.test'
const EMAIL_B = 'reader.b@example.test'
const GOOD_CODE = '246810'

function b64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function fakeJwt(claims: Record<string, unknown>): string {
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(claims)}.c2lnbmF0dXJl`
}

function json(status: number, body?: unknown): Response {
  if (body === undefined) return new Response(null, { status })
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

interface RecordedRequest {
  readonly method: string
  readonly path: string
  readonly search: string
  readonly headers: Record<string, string>
  readonly body: Record<string, unknown> | null
}

type Override = (req: RecordedRequest, signal: AbortSignal | undefined) => Response | Promise<Response>

class FakeGoTrue {
  nowMs = Date.parse('2026-11-20T12:00:00.000Z')
  readonly requests: RecordedRequest[] = []
  readonly users = new Map<string, string>([[EMAIL_A, ACCT_A], [EMAIL_B, ACCT_B]])
  readonly codes = new Map<string, { code: string; used: boolean }>()
  readonly sessions = new Map<string, { userId: string; email: string; revoked: boolean; refresh: string }>()
  readonly refreshTokens = new Map<string, { access: string; used: boolean }>()
  readonly overrides = new Map<string, Override[]>()
  private counter = 0

  override(path: string, handler: Override): void {
    const list = this.overrides.get(path) ?? []
    list.push(handler)
    this.overrides.set(path, list)
  }

  count(path: string): number {
    return this.requests.filter((r) => r.path === path).length
  }

  issue(email: string): Record<string, unknown> {
    this.counter += 1
    const userId = this.users.get(email)!
    // Access tokens look like JWTs whose (unverified) `sub` intentionally points at a *different*
    // account, proving the provider never trusts self-declared JWT claims.
    const access = fakeJwt({ sub: userId === ACCT_A ? ACCT_B : ACCT_A, n: this.counter, role: 'authenticated' })
    const refresh = `rt-${this.counter}-synthetic`
    this.sessions.set(access, { userId, email, revoked: false, refresh })
    this.refreshTokens.set(refresh, { access, used: false })
    return {
      access_token: access,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(this.nowMs / 1000) + 3600,
      refresh_token: refresh,
      user: { id: userId, email, aud: 'authenticated', role: 'authenticated' },
    }
  }

  readonly fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input))
    const headers: Record<string, string> = {}
    new Headers(init?.headers).forEach((value, key) => { headers[key] = value })
    const req: RecordedRequest = {
      method: init?.method ?? 'GET',
      path: url.pathname,
      search: url.search,
      headers,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : null,
    }
    this.requests.push(req)
    assert.equal(init?.redirect, 'error')
    assert.equal(init?.credentials, 'omit')
    assert.equal(headers.apikey, PUBLISHABLE_KEY)
    const queued = this.overrides.get(req.path)
    if (queued && queued.length > 0) return queued.shift()!(req, init?.signal ?? undefined)
    return this.handle(req)
  }

  private bearer(req: RecordedRequest): string | undefined {
    const auth = req.headers.authorization
    return auth?.startsWith('Bearer ') ? auth.slice(7) : undefined
  }

  private handle(req: RecordedRequest): Response {
    const body = req.body ?? {}
    switch (req.path) {
      case '/auth/v1/otp': {
        const email = String(body.email)
        if (!this.users.has(email)) {
          if (body.create_user !== true) return json(400, { code: 400, error_code: 'otp_disabled', msg: 'Signups not allowed for otp' })
          this.users.set(email, crypto.randomUUID())
        }
        this.codes.set(email, { code: GOOD_CODE, used: false })
        return json(200, {})
      }
      case '/auth/v1/verify': {
        const email = String(body.email)
        const entry = this.codes.get(email)
        if (body.type !== 'email' || !entry || entry.used || body.token !== entry.code) {
          return json(403, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' })
        }
        entry.used = true
        return json(200, this.issue(email))
      }
      case '/auth/v1/user': {
        const token = this.bearer(req)
        const session = token ? this.sessions.get(token) : undefined
        if (!session) return json(401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' })
        if (session.revoked) return json(403, { code: 403, error_code: 'session_not_found', msg: 'Session not found' })
        return json(200, { id: session.userId, email: session.email, aud: 'authenticated', role: 'authenticated' })
      }
      case '/auth/v1/token': {
        assert.equal(req.search, '?grant_type=refresh_token')
        const entry = this.refreshTokens.get(String(body.refresh_token))
        if (!entry) return json(400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' })
        if (entry.used) return json(400, { code: 400, error_code: 'refresh_token_already_used', msg: 'Already Used' })
        const old = this.sessions.get(entry.access)!
        if (old.revoked) return json(400, { code: 400, error_code: 'session_not_found', msg: 'Session not found' })
        entry.used = true
        old.revoked = true
        return json(200, this.issue(old.email))
      }
      case '/auth/v1/logout': {
        assert.equal(req.search, '?scope=local')
        const token = this.bearer(req)
        const session = token ? this.sessions.get(token) : undefined
        if (!session || session.revoked) return json(401, { code: 401, error_code: 'session_not_found' })
        session.revoked = true
        this.refreshTokens.get(session.refresh)!.used = true
        return json(204)
      }
      default:
        return json(404, { error_code: 'not_found' })
    }
  }
}

class RecordingStore implements AuthTokenStore {
  record: unknown = null
  saves = 0
  clears = 0
  failLoad = false
  failSave = false
  failClear = false
  async load(): Promise<unknown> {
    if (this.failLoad) throw new Error('store load failed')
    return this.record
  }
  async save(tokens: StoredAuthTokens): Promise<void> {
    if (this.failSave) throw new Error('store save failed')
    this.saves += 1
    this.record = { ...tokens }
  }
  async clear(): Promise<void> {
    if (this.failClear) throw new Error('store clear failed')
    this.clears += 1
    this.record = null
  }
}

function setup(overrides: Partial<SupabaseGoTrueAuthProviderOptions> = {}) {
  const gotrue = new FakeGoTrue()
  const store = new RecordingStore()
  const logs: string[] = []
  let ids = 0
  const provider = createSupabaseGoTrueAuthProvider({
    url: URL_BASE,
    apiKey: PUBLISHABLE_KEY,
    tokenStore: store,
    fetch: gotrue.fetch,
    now: () => gotrue.nowMs,
    logger: (m) => logs.push(m),
    generateChallengeId: () => `test-challenge-${String(++ids).padStart(8, '0')}`,
    ...overrides,
  })
  return { gotrue, store, logs, provider }
}

async function challengeFor(provider: ReturnType<typeof setup>['provider'], email = EMAIL_A): Promise<string> {
  const started = await provider.signIn({ method: 'emailOtp', email })
  assert.equal(started.status, 'challengeRequired')
  if (started.status !== 'challengeRequired') throw new Error('unreachable')
  return started.challenge.challengeId
}

async function signedIn(ctx: ReturnType<typeof setup>, email = EMAIL_A) {
  const challengeId = await challengeFor(ctx.provider, email)
  const verified = await ctx.provider.verifyEmailOtp({ challengeId, code: GOOD_CODE })
  assert.equal(verified.status, 'authenticated')
  if (verified.status !== 'authenticated') throw new Error('unreachable')
  return verified.session
}

describe('R13-2B Supabase GoTrue email-OTP AuthProvider', () => {
  describe('construction and client-secret refusal', () => {
    test('refuses secret, service-role and missing keys', () => {
      const base = { url: URL_BASE, tokenStore: createInMemoryAuthTokenStore(), fetch: new FakeGoTrue().fetch }
      const serviceRole = fakeJwt({ role: 'service_role', iss: 'supabase' })
      assert.equal(isPrivilegedSupabaseKey(serviceRole), true)
      assert.equal(isPrivilegedSupabaseKey('sb_secret_abc123'), true)
      assert.equal(isPrivilegedSupabaseKey(fakeJwt({ role: 'anon' })), false)
      for (const apiKey of [serviceRole, 'sb_secret_abc123', '']) {
        assert.throws(() => createSupabaseGoTrueAuthProvider({ ...base, apiKey }), /publishable\/anon/)
      }
      assert.doesNotThrow(() => createSupabaseGoTrueAuthProvider({ ...base, apiKey: fakeJwt({ role: 'anon' }) }))
    })

    test('accepts only publishable keys and anon-role JWT project keys (allowlist)', () => {
      const base = { url: URL_BASE, tokenStore: createInMemoryAuthTokenStore(), fetch: new FakeGoTrue().fetch }
      const refused = [
        'not-a-key',
        'anon',
        'sb_publishable_',
        'sb_publishable_short',
        'sb_publishable_has spaces_in_it',
        'sb_secret_abcdefghijklmnop',
        fakeJwt({ role: 'authenticated' }),
        fakeJwt({ role: 'service_role' }),
        fakeJwt({ role: 'supabase_admin' }),
        fakeJwt({ iss: 'supabase' }),
        `${b64url({ alg: 'HS256' })}.${Buffer.from('not json').toString('base64url')}.sig`,
        `${b64url({ typ: 'JWT' })}.${b64url({ role: 'anon' })}.sig`,
        `${b64url({ alg: 'HS256' })}.${b64url({ role: 'anon' })}`,
        `${b64url({ alg: 'HS256' })}.${b64url({ role: 'anon' })}.`,
        `${b64url({ alg: 'HS256' })}.${b64url({ role: 'anon' })}.sig.extra`,
        `${b64url({ alg: 'HS256' })}.${b64url({ role: 'anon' })}.si+g`,
        `${b64url({ alg: 'HS256' })}.${b64url(['role', 'anon'])}.sig`,
        42 as unknown as string,
      ]
      for (const apiKey of refused) {
        assert.equal(isPublishableSupabaseKey(apiKey), false, String(apiKey))
        assert.throws(() => createSupabaseGoTrueAuthProvider({ ...base, apiKey }), /publishable\/anon/, String(apiKey))
      }
      for (const apiKey of [PUBLISHABLE_KEY, fakeJwt({ role: 'anon', iss: 'supabase' })]) {
        assert.equal(isPublishableSupabaseKey(apiKey), true)
        assert.doesNotThrow(() => createSupabaseGoTrueAuthProvider({ ...base, apiKey }))
      }
    })

    test('refuses insecure or credential-bearing endpoints and a missing token store', () => {
      const base = { apiKey: PUBLISHABLE_KEY, tokenStore: createInMemoryAuthTokenStore(), fetch: new FakeGoTrue().fetch }
      assert.throws(() => createSupabaseGoTrueAuthProvider({ ...base, url: 'http://project.example.test' }), /HTTPS/)
      assert.throws(() => createSupabaseGoTrueAuthProvider({ ...base, url: 'https://u:p@project.example.test' }), /credentials/)
      assert.throws(() => createSupabaseGoTrueAuthProvider({ ...base, url: 'https://project.example.test/?key=1' }), /query/)
      assert.throws(() => createSupabaseGoTrueAuthProvider({ ...base, url: 'not a url' }), /valid URL/)
      assert.throws(
        () => createSupabaseGoTrueAuthProvider({ ...base, url: URL_BASE, tokenStore: undefined as unknown as AuthTokenStore }),
        /AuthTokenStore/,
      )
      assert.doesNotThrow(() => createSupabaseGoTrueAuthProvider({ ...base, url: 'http://127.0.0.1:55421' }))
    })
  })

  describe('email OTP sign-in', () => {
    test('requests a six-digit email OTP and verifies it against trusted GoTrue identity', async () => {
      const ctx = setup()
      const started = await ctx.provider.signIn({ method: 'emailOtp', email: '  Reader.A@Example.TEST ' })
      assert.equal(started.status, 'challengeRequired')
      if (started.status !== 'challengeRequired') return
      assert.equal(started.challenge.method, 'emailOtp')
      assert.equal(started.challenge.maskedDestination, 'r***@example.test')
      assert.equal(started.challenge.expiresAt, ctx.gotrue.nowMs + 10 * 60_000)

      const otpReq = ctx.gotrue.requests[0]
      assert.equal(otpReq.method, 'POST')
      assert.equal(otpReq.path, '/auth/v1/otp')
      assert.deepEqual(otpReq.body, { email: EMAIL_A, create_user: true })
      assert.equal(otpReq.headers.authorization, undefined, 'the project key is never sent as a bearer credential')

      const verified = await ctx.provider.verifyEmailOtp({ challengeId: started.challenge.challengeId, code: GOOD_CODE })
      assert.equal(verified.status, 'authenticated')
      if (verified.status !== 'authenticated') return
      const verifyReq = ctx.gotrue.requests[1]
      assert.equal(verifyReq.path, '/auth/v1/verify')
      assert.deepEqual(verifyReq.body, { type: 'email', email: EMAIL_A, token: GOOD_CODE })
      assert.equal(verifyReq.headers.authorization, undefined)

      const userReq = ctx.gotrue.requests[2]
      assert.equal(userReq.method, 'GET')
      assert.equal(userReq.path, '/auth/v1/user')
      assert.equal(userReq.headers.authorization, `Bearer ${verified.session.token}`)

      // The access token's unverified `sub` claims ACCT_B; the trusted /user answer (ACCT_A) wins.
      assert.equal(verified.session.accountId, ACCT_A)
      assert.equal(verified.session.method, 'emailOtp')
      assert.equal(verified.session.verificationSource, 'serverVerified')
      assert.equal(verified.session.expiresAt, ctx.gotrue.nowMs + 3600_000)
      const stored = ctx.store.record as StoredAuthTokens
      assert.equal(stored.accountId, ACCT_A)
      assert.equal(stored.accessToken, verified.session.token)
      assert.equal(stored.refreshToken.startsWith('rt-'), true)
    })

    test('allowAccountCreation=false forwards create_user=false and maps refusal to unsupportedMethod', async () => {
      const ctx = setup({ allowAccountCreation: false })
      const result = await ctx.provider.signIn({ method: 'emailOtp', email: 'new.reader@example.test' })
      assert.deepEqual(ctx.gotrue.requests[0].body, { email: 'new.reader@example.test', create_user: false })
      assert.equal(result.status, 'unauthorized')
      if (result.status === 'unauthorized') assert.equal(result.reason, 'unsupportedMethod')
    })

    test('Google and Apple fail explicitly without network access or a session', async () => {
      const ctx = setup()
      for (const method of ['google', 'apple'] as const) {
        const result = await ctx.provider.signIn({ method, redirectUri: 'https://attacker.example.test/cb' })
        assert.equal(result.status, 'unauthorized')
        if (result.status === 'unauthorized') assert.equal(result.reason, 'unsupportedMethod')
      }
      const bogus = await ctx.provider.signIn({ method: 'password' } as never)
      assert.equal(bogus.status, 'unauthorized')
      assert.equal(ctx.gotrue.requests.length, 0)
      assert.equal(ctx.store.saves, 0)
    })

    test('invalid email is refused locally', async () => {
      const ctx = setup()
      const result = await ctx.provider.signIn({ method: 'emailOtp', email: 'not-an-email' })
      assert.equal(result.status, 'unauthorized')
      if (result.status === 'unauthorized') assert.equal(result.reason, 'invalidEmail')
      assert.equal(ctx.gotrue.requests.length, 0)
    })

    test('maps OTP request rate limiting, provider-disabled and delivery failures', async () => {
      const ctx = setup()
      ctx.gotrue.override('/auth/v1/otp', () => json(429, { error_code: 'over_email_send_rate_limit' }))
      ctx.gotrue.override('/auth/v1/otp', () => json(400, { error_code: 'email_provider_disabled' }))
      ctx.gotrue.override('/auth/v1/otp', () => json(500, { msg: 'Error sending magic link email' }))
      ctx.gotrue.override('/auth/v1/otp', () => json(400, { error_code: 'validation_failed' }))
      const r1 = await ctx.provider.signIn({ method: 'emailOtp', email: EMAIL_A })
      const r2 = await ctx.provider.signIn({ method: 'emailOtp', email: EMAIL_A })
      const r3 = await ctx.provider.signIn({ method: 'emailOtp', email: EMAIL_A })
      const r4 = await ctx.provider.signIn({ method: 'emailOtp', email: EMAIL_A })
      assert.deepEqual([r1.status, r2.status, r3.status, r4.status], ['unauthorized', 'unauthorized', 'networkError', 'unauthorized'])
      if (r1.status === 'unauthorized') assert.equal(r1.reason, 'rateLimited')
      if (r2.status === 'unauthorized') assert.equal(r2.reason, 'unsupportedMethod')
      if (r3.status === 'networkError') assert.equal(r3.retryable, true)
      if (r4.status === 'unauthorized') assert.equal(r4.reason, 'invalidEmail')
    })

    test('wrong code keeps the challenge; the correct code then succeeds', async () => {
      const ctx = setup()
      const challengeId = await challengeFor(ctx.provider)
      const wrong = await ctx.provider.verifyEmailOtp({ challengeId, code: '000000' })
      assert.equal(wrong.status, 'unauthorized')
      if (wrong.status === 'unauthorized') assert.equal(wrong.reason, 'invalidOtpCode')
      assert.equal(ctx.store.saves, 0)
      const right = await ctx.provider.verifyEmailOtp({ challengeId, code: GOOD_CODE })
      assert.equal(right.status, 'authenticated')
    })

    test('exhausting attempts discards the challenge (no further network use)', async () => {
      const ctx = setup({ maxOtpAttempts: 2 })
      const challengeId = await challengeFor(ctx.provider)
      const first = await ctx.provider.verifyEmailOtp({ challengeId, code: '111111' })
      const second = await ctx.provider.verifyEmailOtp({ challengeId, code: '222222' })
      assert.equal(first.status === 'unauthorized' && first.reason, 'invalidOtpCode')
      assert.equal(second.status === 'unauthorized' && second.reason, 'challengeExpired')
      const before = ctx.gotrue.requests.length
      const third = await ctx.provider.verifyEmailOtp({ challengeId, code: GOOD_CODE })
      assert.equal(third.status === 'unauthorized' && third.reason, 'challengeExpired')
      assert.equal(ctx.gotrue.requests.length, before)
    })

    test('malformed codes count as attempts and never reach GoTrue', async () => {
      const ctx = setup()
      const challengeId = await challengeFor(ctx.provider)
      for (const code of ['12345', '1234567', 'abcdef', '']) {
        const result = await ctx.provider.verifyEmailOtp({ challengeId, code })
        assert.equal(result.status, 'unauthorized')
      }
      assert.equal(ctx.gotrue.count('/auth/v1/verify'), 0)
    })

    test('expired challenge fails locally', async () => {
      const ctx = setup({ challengeTtlMs: 60_000 })
      const challengeId = await challengeFor(ctx.provider)
      ctx.gotrue.nowMs += 60_000
      const result = await ctx.provider.verifyEmailOtp({ challengeId, code: GOOD_CODE })
      assert.equal(result.status === 'unauthorized' && result.reason, 'challengeExpired')
      assert.equal(ctx.gotrue.count('/auth/v1/verify'), 0)
    })

    test('replayed challenge and replayed code are refused', async () => {
      const ctx = setup()
      const challengeId = await challengeFor(ctx.provider)
      assert.equal((await ctx.provider.verifyEmailOtp({ challengeId, code: GOOD_CODE })).status, 'authenticated')
      const replay = await ctx.provider.verifyEmailOtp({ challengeId, code: GOOD_CODE })
      assert.equal(replay.status === 'unauthorized' && replay.reason, 'challengeExpired')
      assert.equal(ctx.gotrue.count('/auth/v1/verify'), 1)

      // A new challenge cannot reuse the already-consumed server-side code either.
      ctx.gotrue.override('/auth/v1/otp', () => json(200, {}))
      const next = await challengeFor(ctx.provider)
      const reused = await ctx.provider.verifyEmailOtp({ challengeId: next, code: GOOD_CODE })
      assert.equal(reused.status === 'unauthorized' && reused.reason, 'invalidOtpCode')
    })

    test('unknown challenge IDs and superseded challenges are refused', async () => {
      const ctx = setup()
      const first = await challengeFor(ctx.provider, EMAIL_A)
      const second = await challengeFor(ctx.provider, EMAIL_B)
      const unknown = await ctx.provider.verifyEmailOtp({ challengeId: 'test-challenge-99999999', code: GOOD_CODE })
      assert.equal(unknown.status === 'unauthorized' && unknown.reason, 'challengeExpired')
      const stale = await ctx.provider.verifyEmailOtp({ challengeId: first, code: GOOD_CODE })
      assert.equal(stale.status === 'unauthorized' && stale.reason, 'challengeExpired')
      assert.equal(ctx.gotrue.count('/auth/v1/verify'), 0)
      const ok = await ctx.provider.verifyEmailOtp({ challengeId: second, code: GOOD_CODE })
      assert.equal(ok.status === 'authenticated' && ok.session.accountId, ACCT_B)
    })

    test('out-of-order parallel OTP requests: the older response never replaces the newest challenge', async () => {
      const ctx = setup()
      const gateA = deferred<void>()
      const gateB = deferred<void>()
      const handle = (req: RecordedRequest) => (ctx.gotrue as unknown as { handle(r: RecordedRequest): Response }).handle(req)
      ctx.gotrue.override('/auth/v1/otp', async (req) => { await gateA.promise; return handle(req) })
      ctx.gotrue.override('/auth/v1/otp', async (req) => { await gateB.promise; return handle(req) })
      const pendingA = ctx.provider.signIn({ method: 'emailOtp', email: EMAIL_A })
      const pendingB = ctx.provider.signIn({ method: 'emailOtp', email: EMAIL_B })
      gateB.resolve()
      const b = await pendingB
      gateA.resolve()
      const a = await pendingA
      assert.equal(b.status, 'challengeRequired')
      assert.equal(a.status, 'cancelled', 'the older request is discarded once a newer one began')
      if (b.status !== 'challengeRequired') return
      assert.equal(b.challenge.maskedDestination, 'r***@example.test')
      const verified = await ctx.provider.verifyEmailOtp({ challengeId: b.challenge.challengeId, code: GOOD_CODE })
      assert.equal(verified.status === 'authenticated' && verified.session.accountId, ACCT_B)
      assert.deepEqual(ctx.gotrue.requests.find((r) => r.path === '/auth/v1/verify')?.body, { type: 'email', email: EMAIL_B, token: GOOD_CODE })
    })

    test('out-of-order parallel OTP requests: in-order completion also leaves only the newest live', async () => {
      const ctx = setup()
      const gateA = deferred<void>()
      const handle = (req: RecordedRequest) => (ctx.gotrue as unknown as { handle(r: RecordedRequest): Response }).handle(req)
      ctx.gotrue.override('/auth/v1/otp', async (req) => { await gateA.promise; return handle(req) })
      const pendingA = ctx.provider.signIn({ method: 'emailOtp', email: EMAIL_A })
      const b = await ctx.provider.signIn({ method: 'emailOtp', email: EMAIL_B })
      gateA.resolve()
      assert.equal((await pendingA).status, 'cancelled')
      assert.equal(b.status, 'challengeRequired')
      if (b.status !== 'challengeRequired') return
      assert.equal((await ctx.provider.verifyEmailOtp({ challengeId: b.challenge.challengeId, code: GOOD_CODE })).status, 'authenticated')
    })

    test('a concurrent verify for the same challenge does not issue a second request', async () => {
      const ctx = setup()
      const challengeId = await challengeFor(ctx.provider)
      const gate = deferred<void>()
      ctx.gotrue.override('/auth/v1/verify', async (req) => {
        await gate.promise
        return (ctx.gotrue as unknown as { handle(r: RecordedRequest): Response }).handle(req)
      })
      const firstP = ctx.provider.verifyEmailOtp({ challengeId, code: GOOD_CODE })
      const second = await ctx.provider.verifyEmailOtp({ challengeId, code: GOOD_CODE })
      assert.equal(second.status, 'networkError')
      gate.resolve()
      assert.equal((await firstP).status, 'authenticated')
      assert.equal(ctx.gotrue.count('/auth/v1/verify'), 1)
    })
  })

  describe('session promotion fails closed', () => {
    test('verified email that does not match the challenge email is refused and revoked', async () => {
      const ctx = setup()
      const challengeId = await challengeFor(ctx.provider, EMAIL_A)
      ctx.gotrue.override('/auth/v1/user', () => json(200, { id: ACCT_B, email: EMAIL_B, aud: 'authenticated', role: 'authenticated' }))
      const result = await ctx.provider.verifyEmailOtp({ challengeId, code: GOOD_CODE })
      assert.equal(result.status === 'unauthorized' && result.reason, 'invalidToken')
      assert.equal(ctx.store.saves, 0)
      await new Promise((r) => setImmediate(r))
      assert.equal(ctx.gotrue.count('/auth/v1/logout'), 1, 'the minted session is revoked best-effort')
    })

    test('token-response user ID that disagrees with trusted /user is refused', async () => {
      const ctx = setup()
      const challengeId = await challengeFor(ctx.provider, EMAIL_A)
      ctx.gotrue.override('/auth/v1/verify', (req) => {
        const real = (ctx.gotrue as unknown as { handle(r: RecordedRequest): Response }).handle(req)
        return real.json().then((body: Record<string, unknown>) => json(200, { ...body, user: { id: ACCT_B } }))
      })
      const result = await ctx.provider.verifyEmailOtp({ challengeId, code: GOOD_CODE })
      assert.equal(result.status === 'unauthorized' && result.reason, 'invalidToken')
      assert.equal(ctx.store.saves, 0)
    })

    test('a token GoTrue will not vouch for is never promoted from its JWT claims', async () => {
      const ctx = setup()
      const challengeId = await challengeFor(ctx.provider)
      ctx.gotrue.override('/auth/v1/user', () => json(401, { error_code: 'bad_jwt' }))
      const result = await ctx.provider.verifyEmailOtp({ challengeId, code: GOOD_CODE })
      assert.equal(result.status, 'unauthorized')
      assert.equal(ctx.store.saves, 0)
    })

    test('anonymous, non-authenticated-role and malformed users are refused', async () => {
      const users = [
        { id: ACCT_A, email: EMAIL_A, aud: 'authenticated', role: 'authenticated', is_anonymous: true },
        { id: ACCT_A, email: EMAIL_A, aud: 'authenticated', role: 'service_role' },
        { id: 'not-a-uuid', email: EMAIL_A },
        { id: ACCT_A },
        ['array'],
      ]
      for (const user of users) {
        const ctx = setup()
        const challengeId = await challengeFor(ctx.provider)
        ctx.gotrue.override('/auth/v1/user', () => json(200, user))
        const result = await ctx.provider.verifyEmailOtp({ challengeId, code: GOOD_CODE })
        assert.notEqual(result.status, 'authenticated', JSON.stringify(user))
        assert.equal(ctx.store.saves, 0)
      }
    })

    test('malformed token responses are refused and the challenge discarded', async () => {
      const bodies: unknown[] = [
        { access_token: 'short', refresh_token: 'r', expires_in: 3600 },
        { access_token: 'a'.repeat(32), expires_in: 3600 },
        { access_token: 'a'.repeat(32), refresh_token: 'r' },
        { access_token: 'a'.repeat(32), refresh_token: 'r', expires_in: -1 },
        { access_token: 'a'.repeat(32), refresh_token: 'r', expires_in: 3600, token_type: 'mac' },
        { access_token: 'a'.repeat(32), refresh_token: 'r', expires_at: 1 },
        'not-json-object',
      ]
      for (const body of bodies) {
        const ctx = setup()
        const challengeId = await challengeFor(ctx.provider)
        ctx.gotrue.override('/auth/v1/verify', () => json(200, body))
        const result = await ctx.provider.verifyEmailOtp({ challengeId, code: GOOD_CODE })
        assert.equal(result.status, 'networkError', JSON.stringify(body))
        if (result.status === 'networkError') assert.equal(result.retryable, false)
        assert.equal(ctx.store.saves, 0)
        const again = await ctx.provider.verifyEmailOtp({ challengeId, code: GOOD_CODE })
        assert.equal(again.status === 'unauthorized' && again.reason, 'challengeExpired')
      }
    })

    test('non-JSON success body is treated as malformed', async () => {
      const ctx = setup()
      const challengeId = await challengeFor(ctx.provider)
      ctx.gotrue.override('/auth/v1/verify', () => new Response('<html>proxy</html>', { status: 200 }))
      const result = await ctx.provider.verifyEmailOtp({ challengeId, code: GOOD_CODE })
      assert.equal(result.status === 'networkError' && result.retryable, false)
    })

    test('a token store that cannot save fails closed and revokes the new session', async () => {
      const ctx = setup()
      ctx.store.failSave = true
      const challengeId = await challengeFor(ctx.provider)
      const result = await ctx.provider.verifyEmailOtp({ challengeId, code: GOOD_CODE })
      assert.equal(result.status, 'networkError')
      await new Promise((r) => setImmediate(r))
      assert.equal(ctx.gotrue.count('/auth/v1/logout'), 1)
    })

    test('verify network failure, 5xx and rate limit keep the challenge for retry', async () => {
      const ctx = setup()
      const challengeId = await challengeFor(ctx.provider)
      ctx.gotrue.override('/auth/v1/verify', () => { throw new TypeError('socket hang up') })
      ctx.gotrue.override('/auth/v1/verify', () => json(503, {}))
      ctx.gotrue.override('/auth/v1/verify', () => json(429, { error_code: 'over_request_rate_limit' }))
      const r1 = await ctx.provider.verifyEmailOtp({ challengeId, code: GOOD_CODE })
      const r2 = await ctx.provider.verifyEmailOtp({ challengeId, code: GOOD_CODE })
      const r3 = await ctx.provider.verifyEmailOtp({ challengeId, code: GOOD_CODE })
      assert.equal(r1.status === 'networkError' && r1.retryable, true)
      assert.equal(r2.status === 'networkError' && r2.retryable, true)
      assert.equal(r3.status === 'unauthorized' && r3.reason, 'rateLimited')
      assert.equal((await ctx.provider.verifyEmailOtp({ challengeId, code: GOOD_CODE })).status, 'authenticated')
    })

    test('request timeout yields a retryable networkError', async () => {
      const ctx = setup({ timeoutMs: 20 })
      const challengeId = await challengeFor(ctx.provider)
      ctx.gotrue.override('/auth/v1/verify', (_req, signal) => new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
      }))
      const result = await ctx.provider.verifyEmailOtp({ challengeId, code: GOOD_CODE })
      assert.equal(result.status, 'networkError')
      if (result.status === 'networkError') {
        assert.equal(result.retryable, true)
        assert.match(result.message, /in time/)
      }
    })

    test('caller abort before the response leaves the challenge usable', async () => {
      const ctx = setup()
      const challengeId = await challengeFor(ctx.provider)
      const controller = new AbortController()
      ctx.gotrue.override('/auth/v1/verify', (_req, signal) => new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
        controller.abort()
      }))
      const result = await ctx.provider.verifyEmailOtp({ challengeId, code: GOOD_CODE }, { signal: controller.signal })
      assert.equal(result.status, 'aborted')
      assert.equal((await ctx.provider.verifyEmailOtp({ challengeId, code: GOOD_CODE })).status, 'authenticated')
    })

    test('caller abort after GoTrue minted a session discards and revokes it', async () => {
      const ctx = setup()
      const challengeId = await challengeFor(ctx.provider)
      const controller = new AbortController()
      ctx.gotrue.override('/auth/v1/verify', (req) => {
        const response = (ctx.gotrue as unknown as { handle(r: RecordedRequest): Response }).handle(req)
        controller.abort()
        return response
      })
      const result = await ctx.provider.verifyEmailOtp({ challengeId, code: GOOD_CODE }, { signal: controller.signal })
      assert.equal(result.status, 'aborted')
      assert.equal(ctx.store.saves, 0)
      await new Promise((r) => setImmediate(r))
      assert.equal(ctx.gotrue.count('/auth/v1/logout'), 1)
      const revoked = [...ctx.gotrue.sessions.values()].every((s) => s.revoked)
      assert.equal(revoked, true)
    })
  })

  describe('restore, refresh and recovery', () => {
    test('empty store restores guest without network', async () => {
      const ctx = setup()
      assert.deepEqual(await ctx.provider.restoreSession(), { status: 'guest' })
      assert.deepEqual(await ctx.provider.recoverSession(), { status: 'guest' })
      assert.equal(ctx.gotrue.requests.length, 0)
    })

    test('stored session is re-verified with GoTrue before promotion', async () => {
      const ctx = setup()
      const session = await signedIn(ctx)
      const fresh = createSupabaseGoTrueAuthProvider({
        url: URL_BASE, apiKey: PUBLISHABLE_KEY, tokenStore: ctx.store, fetch: ctx.gotrue.fetch, now: () => ctx.gotrue.nowMs,
      })
      const before = ctx.gotrue.count('/auth/v1/user')
      const restored = await fresh.restoreSession()
      assert.equal(restored.status, 'authenticated')
      if (restored.status === 'authenticated') {
        assert.equal(restored.session.accountId, ACCT_A)
        assert.equal(restored.session.token, session.token)
      }
      assert.equal(ctx.gotrue.count('/auth/v1/user'), before + 1)
    })

    test('stored identity that GoTrue attributes to a different user is discarded (no silent switch)', async () => {
      const ctx = setup()
      await signedIn(ctx)
      ctx.gotrue.override('/auth/v1/user', () => json(200, { id: ACCT_B, email: EMAIL_B, aud: 'authenticated', role: 'authenticated' }))
      const restored = await ctx.provider.restoreSession()
      assert.equal(restored.status === 'unauthorized' && restored.reason, 'invalidToken')
      assert.equal(ctx.store.record, null)
    })

    test('malformed or tampered stored records are discarded', async () => {
      const records: unknown[] = [
        { version: 2 },
        { version: 1, method: 'emailOtp', accountId: 'nope', accessToken: 'a'.repeat(20), refreshToken: 'r', expiresAt: 1 },
        { version: 1, method: 'google', accountId: ACCT_A, accessToken: 'a'.repeat(20), refreshToken: 'r', expiresAt: 1 },
        { version: 1, method: 'emailOtp', accountId: ACCT_A, accessToken: 'a b', refreshToken: 'r', expiresAt: 1 },
        'string',
      ]
      for (const record of records) {
        const ctx = setup()
        ctx.store.record = record
        const restored = await ctx.provider.restoreSession()
        assert.equal(restored.status === 'unauthorized' && restored.reason, 'invalidToken', JSON.stringify(record))
        assert.equal(ctx.store.record, null)
        assert.equal(ctx.gotrue.requests.length, 0)
      }
    })

    test('unreadable store fails closed without promoting', async () => {
      const ctx = setup()
      ctx.store.failLoad = true
      const restored = await ctx.provider.restoreSession()
      assert.equal(restored.status, 'networkError')
    })

    test('near-expiry access token is refreshed and the rotated tokens persisted', async () => {
      const ctx = setup()
      const first = await signedIn(ctx)
      ctx.gotrue.nowMs += 3600_000 - 30_000
      const restored = await ctx.provider.restoreSession()
      assert.equal(restored.status, 'authenticated')
      if (restored.status !== 'authenticated') return
      assert.notEqual(restored.session.token, first.token)
      assert.equal(restored.session.accountId, ACCT_A)
      const refreshReq = ctx.gotrue.requests.find((r) => r.path === '/auth/v1/token')!
      assert.equal(refreshReq.headers.authorization, undefined)
      assert.equal(typeof refreshReq.body?.refresh_token, 'string')
      assert.equal((ctx.store.record as StoredAuthTokens).accessToken, restored.session.token)
    })

    test('revoked session: rejected access token and refresh token end in expired and cleared', async () => {
      const ctx = setup()
      const session = await signedIn(ctx)
      const entry = ctx.gotrue.sessions.get(session.token!)!
      entry.revoked = true
      const restored = await ctx.provider.restoreSession()
      assert.equal(restored.status, 'expired')
      if (restored.status === 'expired') assert.equal(restored.reason, 'refreshFailed')
      assert.equal(ctx.store.record, null)
    })

    test('restore network failure keeps the stored session for a later retry', async () => {
      const ctx = setup()
      await signedIn(ctx)
      ctx.gotrue.override('/auth/v1/user', () => { throw new TypeError('offline') })
      const restored = await ctx.provider.restoreSession()
      assert.equal(restored.status === 'networkError' && restored.retryable, true)
      assert.notEqual(ctx.store.record, null)
      assert.equal((await ctx.provider.restoreSession()).status, 'authenticated')
    })

    test('recover refreshes explicitly and refuses a refreshed identity for another account', async () => {
      const ctx = setup()
      await signedIn(ctx)
      const recovered = await ctx.provider.recoverSession()
      assert.equal(recovered.status === 'authenticated' && recovered.session.accountId, ACCT_A)

      ctx.gotrue.override('/auth/v1/token', () => json(200, ctx.gotrue.issue(EMAIL_B)))
      const switched = await ctx.provider.recoverSession()
      assert.equal(switched.status === 'unauthorized' && switched.reason, 'invalidToken')
      assert.equal(ctx.store.record, null)
    })

    test('transient /user failure after a successful rotation keeps the session recoverable', async () => {
      for (const transient of [
        () => { throw new TypeError('offline') },
        () => json(503, {}),
        () => json(429, { error_code: 'over_request_rate_limit' }),
      ] as Override[]) {
        const ctx = setup()
        await signedIn(ctx)
        const before = ctx.store.record as StoredAuthTokens
        ctx.gotrue.override('/auth/v1/user', transient)
        const failed = await ctx.provider.recoverSession()
        assert.notEqual(failed.status, 'authenticated', 'nothing unverified reaches the controller')
        assert.ok(failed.status === 'networkError' || (failed.status === 'unauthorized' && failed.reason === 'rateLimited'))
        if (failed.status === 'networkError') assert.equal(failed.retryable, true)
        const held = ctx.store.record as StoredAuthTokens
        assert.equal(held.accountId, ACCT_A, 'the previously verified binding is preserved')
        assert.notEqual(held.refreshToken, before.refreshToken, 'the rotated refresh token replaced the consumed one')
        assert.equal(ctx.gotrue.refreshTokens.get(before.refreshToken)!.used, true)

        const retried = await ctx.provider.recoverSession()
        assert.equal(retried.status === 'authenticated' && retried.session.accountId, ACCT_A)
      }
    })

    test('held rotated tokens are re-verified by restore and never silently switch accounts', async () => {
      const ctx = setup()
      await signedIn(ctx)
      ctx.gotrue.override('/auth/v1/user', () => json(502, {}))
      assert.equal((await ctx.provider.recoverSession()).status, 'networkError')
      const userCalls = ctx.gotrue.count('/auth/v1/user')
      ctx.gotrue.override('/auth/v1/user', () => json(200, { id: ACCT_B, email: EMAIL_B, aud: 'authenticated', role: 'authenticated' }))
      const restored = await ctx.provider.restoreSession()
      assert.equal(ctx.gotrue.count('/auth/v1/user'), userCalls + 1)
      assert.equal(restored.status === 'unauthorized' && restored.reason, 'invalidToken')
      assert.equal(ctx.store.record, null)
    })

    test('held rotated tokens restore normally once /user recovers', async () => {
      const ctx = setup()
      await signedIn(ctx)
      ctx.gotrue.override('/auth/v1/user', () => { throw new TypeError('offline') })
      assert.equal((await ctx.provider.recoverSession()).status, 'networkError')
      const restored = await ctx.provider.restoreSession()
      assert.equal(restored.status === 'authenticated' && restored.session.accountId, ACCT_A)
      assert.equal(ctx.gotrue.count('/auth/v1/token'), 1, 'restore did not need another rotation')
    })

    test('conclusive post-rotation failures are terminal and clear the session', async () => {
      const cases: { name: string; arrange: (ctx: ReturnType<typeof setup>) => void; status: string; retryable?: boolean }[] = [
        { name: 'rejected', arrange: (ctx) => ctx.gotrue.override('/auth/v1/user', () => json(401, { error_code: 'bad_jwt' })), status: 'expired' },
        { name: 'malformed', arrange: (ctx) => ctx.gotrue.override('/auth/v1/user', () => json(200, { id: 'nope' })), status: 'networkError', retryable: false },
        {
          name: 'store cannot save',
          arrange: (ctx) => { ctx.gotrue.override('/auth/v1/user', () => json(503, {})); ctx.store.failSave = true },
          status: 'networkError',
          retryable: false,
        },
      ]
      for (const c of cases) {
        const ctx = setup()
        await signedIn(ctx)
        c.arrange(ctx)
        const result = await ctx.provider.recoverSession()
        assert.equal(result.status, c.status, c.name)
        if (result.status === 'networkError') assert.equal(result.retryable, c.retryable, c.name)
        assert.equal(ctx.store.record, null, c.name)
        await new Promise((r) => setImmediate(r))
        assert.equal([...ctx.gotrue.sessions.values()].every((s) => s.revoked), true, `${c.name}: rotated session revoked`)
      }
    })

    test('sign-out during a post-rotation /user failure does not resurrect the session', async () => {
      const ctx = setup()
      await signedIn(ctx)
      const gate = deferred<void>()
      ctx.gotrue.override('/auth/v1/user', async () => { await gate.promise; return json(503, {}) })
      const pending = ctx.provider.recoverSession()
      await new Promise((r) => setTimeout(r, 5))
      await ctx.provider.signOut()
      gate.resolve()
      assert.notEqual((await pending).status, 'authenticated')
      await new Promise((r) => setTimeout(r, 5))
      assert.equal(ctx.store.record, null)
      assert.deepEqual(await ctx.provider.restoreSession(), { status: 'guest' })
    })

    test('concurrent recoveries share a single refresh-token use', async () => {
      const ctx = setup()
      await signedIn(ctx)
      const [a, b] = await Promise.all([ctx.provider.recoverSession(), ctx.provider.recoverSession()])
      assert.equal(a.status, 'authenticated')
      assert.equal(b.status, 'authenticated')
      assert.equal(ctx.gotrue.count('/auth/v1/token'), 1)
    })

    test('refresh rate limiting and 5xx keep the stored session', async () => {
      const ctx = setup()
      await signedIn(ctx)
      ctx.gotrue.override('/auth/v1/token', () => json(429, {}))
      ctx.gotrue.override('/auth/v1/token', () => json(502, {}))
      const r1 = await ctx.provider.recoverSession()
      const r2 = await ctx.provider.recoverSession()
      assert.equal(r1.status === 'unauthorized' && r1.reason, 'rateLimited')
      assert.equal(r2.status, 'networkError')
      assert.notEqual(ctx.store.record, null)
    })

    test('aborting a recovery returns promptly while rotated tokens are still saved', async () => {
      const ctx = setup()
      await signedIn(ctx)
      const gate = deferred<void>()
      ctx.gotrue.override('/auth/v1/token', async (req) => {
        await gate.promise
        return (ctx.gotrue as unknown as { handle(r: RecordedRequest): Response }).handle(req)
      })
      const controller = new AbortController()
      const pending = ctx.provider.recoverSession({ signal: controller.signal })
      controller.abort()
      assert.equal((await pending).status, 'aborted')
      gate.resolve()
      await new Promise((r) => setTimeout(r, 5))
      const restored = await ctx.provider.restoreSession()
      assert.equal(restored.status, 'authenticated', 'the rotated refresh token was not stranded')
    })
  })

  describe('sign-out', () => {
    test('revokes remotely with the user bearer and clears local tokens', async () => {
      const ctx = setup()
      const session = await signedIn(ctx)
      const out = await ctx.provider.signOut()
      assert.deepEqual(out, { status: 'signedOut' })
      const logout = ctx.gotrue.requests.find((r) => r.path === '/auth/v1/logout')!
      assert.equal(logout.headers.authorization, `Bearer ${session.token}`)
      assert.equal(ctx.store.record, null)
      assert.equal(ctx.gotrue.sessions.get(session.token!)!.revoked, true)
      assert.deepEqual(await ctx.provider.restoreSession(), { status: 'guest' })
    })

    test('remote failure still clears this device and reports a retryable error', async () => {
      const ctx = setup()
      await signedIn(ctx)
      ctx.gotrue.override('/auth/v1/logout', () => { throw new TypeError('offline') })
      const out = await ctx.provider.signOut()
      assert.equal(out.status, 'networkError')
      assert.equal(ctx.store.record, null)
    })

    test('an already-revoked remote session is a completed sign-out', async () => {
      const ctx = setup()
      const session = await signedIn(ctx)
      ctx.gotrue.sessions.get(session.token!)!.revoked = true
      assert.deepEqual(await ctx.provider.signOut(), { status: 'signedOut' })
    })

    test('local clear failure is reported, never silently ignored', async () => {
      const ctx = setup()
      await signedIn(ctx)
      ctx.store.failClear = true
      const out = await ctx.provider.signOut()
      assert.equal(out.status === 'networkError' && out.retryable, false)
    })

    test('sign-out discards a pending challenge', async () => {
      const ctx = setup()
      const challengeId = await challengeFor(ctx.provider)
      await ctx.provider.signOut()
      const result = await ctx.provider.verifyEmailOtp({ challengeId, code: GOOD_CODE })
      assert.equal(result.status === 'unauthorized' && result.reason, 'challengeExpired')
    })

    test('late OTP verification after sign-out is discarded and revoked', async () => {
      const ctx = setup()
      const challengeId = await challengeFor(ctx.provider)
      const gate = deferred<void>()
      ctx.gotrue.override('/auth/v1/verify', async (req) => {
        await gate.promise
        return (ctx.gotrue as unknown as { handle(r: RecordedRequest): Response }).handle(req)
      })
      const pending = ctx.provider.verifyEmailOtp({ challengeId, code: GOOD_CODE })
      await ctx.provider.signOut()
      gate.resolve()
      const result = await pending
      assert.equal(result.status, 'cancelled')
      assert.equal(ctx.store.record, null)
      await new Promise((r) => setImmediate(r))
      assert.equal([...ctx.gotrue.sessions.values()].every((s) => s.revoked), true)
    })

    test('late /user confirmation after sign-out is discarded', async () => {
      const ctx = setup()
      const challengeId = await challengeFor(ctx.provider)
      const gate = deferred<void>()
      ctx.gotrue.override('/auth/v1/user', async (req) => {
        await gate.promise
        return (ctx.gotrue as unknown as { handle(r: RecordedRequest): Response }).handle(req)
      })
      const pending = ctx.provider.verifyEmailOtp({ challengeId, code: GOOD_CODE })
      await new Promise((r) => setImmediate(r))
      await ctx.provider.signOut()
      gate.resolve()
      const result = await pending
      assert.notEqual(result.status, 'authenticated')
      assert.equal(ctx.store.record, null)
    })

    test('late refresh after sign-out does not resurrect the session', async () => {
      const ctx = setup()
      await signedIn(ctx)
      const gate = deferred<void>()
      ctx.gotrue.override('/auth/v1/token', async (req) => {
        await gate.promise
        return (ctx.gotrue as unknown as { handle(r: RecordedRequest): Response }).handle(req)
      })
      const pending = ctx.provider.recoverSession()
      await new Promise((r) => setImmediate(r))
      await ctx.provider.signOut()
      gate.resolve()
      const result = await pending
      assert.notEqual(result.status, 'authenticated')
      await new Promise((r) => setTimeout(r, 5))
      assert.equal(ctx.store.record, null)
      assert.deepEqual(await ctx.provider.restoreSession(), { status: 'guest' })
    })
  })

  test('tokens, refresh tokens, codes and emails never appear in results or logs', async () => {
    const ctx = setup()
    const results: unknown[] = []
    const challengeId = await challengeFor(ctx.provider)
    results.push(await ctx.provider.verifyEmailOtp({ challengeId, code: '999999' }))
    const verified = await ctx.provider.verifyEmailOtp({ challengeId, code: GOOD_CODE })
    ctx.gotrue.override('/auth/v1/user', () => { throw new TypeError('offline') })
    results.push(await ctx.provider.restoreSession())
    ctx.gotrue.nowMs += 3600_000
    results.push(await ctx.provider.restoreSession())
    ctx.gotrue.override('/auth/v1/token', () => json(400, { error_code: 'refresh_token_not_found' }))
    results.push(await ctx.provider.recoverSession())
    results.push(await ctx.provider.signOut())
    assert.equal(verified.status, 'authenticated')
    const secrets = [
      ...[...ctx.gotrue.sessions.keys()],
      ...[...ctx.gotrue.refreshTokens.keys()],
      GOOD_CODE, '999999', EMAIL_A, PUBLISHABLE_KEY, ACCT_A,
    ]
    // Authenticated results legitimately carry the session token for the transport; every other
    // result, and every log line, must be secret-free.
    const nonSession = results.filter((r) => (r as { status: string }).status !== 'authenticated')
    assert.ok(nonSession.length >= 4)
    const haystack = JSON.stringify(nonSession) + '\n' + ctx.logs.join('\n')
    for (const secret of secrets) {
      assert.equal(haystack.includes(secret), false, `leaked ${secret.slice(0, 6)}…`)
    }
    assert.ok(ctx.logs.length > 0)
  })
})

// ---------------------------------------------------------------------------
// Integration with the accepted controller and transport
// ---------------------------------------------------------------------------

const c1 = parseStoredChallengeId('cms:berrymark-challenge-2026-11-01-true-vine')!
const dNov01 = parseLocalCalendarDate('2026-11-01')!

function makeGuestEnvelope(): GuestParticipationEnvelopeV2 {
  return {
    schemaVersion: 2,
    data: {
      completedChallenges: { [c1]: { completedOn: dNov01 } },
      inProgressChallenges: {},
      savedChallenges: {},
      savedScriptures: [],
      lastOpenedChallenge: null,
      earnedAwards: {},
    },
  }
}

class InMemoryGuest implements GuestStorageAccessor {
  private readonly snapshot: GuestReconciliationInput
  cleared = false
  constructor(initial: GuestReconciliationInput) {
    this.snapshot = JSON.parse(JSON.stringify(initial)) as GuestReconciliationInput
  }
  getSnapshot(): GuestReconciliationInput {
    return JSON.parse(JSON.stringify(this.snapshot)) as GuestReconciliationInput
  }
  clearGuestStorage(decision: GuestClearanceDecision): boolean {
    assert.ok(decision)
    this.cleared = true
    return true
  }
}

describe('R13-2B provider integration', () => {
  test('controller: email OTP sign-in promotes a GoTrue-verified session and syncs guest progress', async () => {
    const ctx = setup({ now: () => Date.now() })
    ctx.gotrue.nowMs = Date.now()
    const guest = new InMemoryGuest({ envelope: makeGuestEnvelope() })
    const transport = createMockAuthorizedAccountTransport()
    const controller = createAccountSessionController(ctx.provider, { guest, transport })

    const started = await controller.signIn({ method: 'emailOtp', email: EMAIL_A })
    assert.equal(started.state.status, 'awaitingEmailOtp')
    if (started.state.status !== 'awaitingEmailOtp') return

    const wrong = await controller.verifyEmailOtp({ challengeId: started.state.challenge.challengeId, code: '000000' })
    assert.equal(wrong.ok, false)
    assert.equal(controller.getState().status, 'awaitingEmailOtp')
    assert.equal(guest.cleared, false, 'guest progress stays intact without a durable receipt')

    const done = await controller.verifyEmailOtp({ challengeId: started.state.challenge.challengeId, code: GOOD_CODE })
    assert.equal(done.ok, true)
    assert.equal(done.state.status, 'authenticated')
    if (done.state.status === 'authenticated') {
      assert.equal(done.state.session.accountId, ACCT_A)
      assert.equal(done.state.session.method, 'emailOtp')
      assert.equal(done.state.syncStatus, 'synced')
    }
    assert.equal(transport.commitCount, 1)
    assert.equal(guest.cleared, true)

    const out = await controller.signOut()
    assert.equal(out.state.status, 'guest')
    assert.equal(ctx.store.record, null)
  })

  test('controller: unsupported Google sign-in stays guest and leaves guest data intact', async () => {
    const ctx = setup()
    const guest = new InMemoryGuest({ envelope: makeGuestEnvelope() })
    const controller = createAccountSessionController(ctx.provider, { guest, transport: createMockAuthorizedAccountTransport() })
    const outcome = await controller.signIn({ method: 'google' })
    assert.equal(outcome.ok, false)
    assert.equal(outcome.state.status, 'guest')
    assert.equal(outcome.error?.reason, 'unsupportedMethod')
    assert.equal(guest.cleared, false)
  })

  test('controller: revoked restored session lands in expired without clearing guest data', async () => {
    const ctx = setup({ now: () => Date.now() })
    ctx.gotrue.nowMs = Date.now()
    const session = await signedIn(ctx)
    ctx.gotrue.sessions.get(session.token!)!.revoked = true
    const guest = new InMemoryGuest({ envelope: makeGuestEnvelope() })
    const controller = createAccountSessionController(ctx.provider, { guest, transport: createMockAuthorizedAccountTransport() })
    const outcome = await controller.restoreSession()
    assert.equal(outcome.state.status, 'expired')
    assert.equal(guest.cleared, false)
  })

  test('transport: SupabasePostgrestTransport accepts the provider session as its Bearer identity', async () => {
    const ctx = setup({ now: () => Date.now() })
    ctx.gotrue.nowMs = Date.now()
    const session = await signedIn(ctx)
    const seen: { auth?: string; apikey?: string }[] = []
    const transport = new SupabasePostgrestTransport({
      url: URL_BASE,
      apiKey: PUBLISHABLE_KEY,
      fetch: async (_input, init) => {
        const headers = new Headers(init?.headers)
        seen.push({ auth: headers.get('authorization') ?? undefined, apikey: headers.get('apikey') ?? undefined })
        return json(200, { status: 'notFound' })
      },
    })
    const result = await transport.getAccount(toAuthorizedAccountSession(session))
    assert.equal(result.status, 'notFound')
    assert.deepEqual(seen, [{ auth: `Bearer ${session.token}`, apikey: PUBLISHABLE_KEY }])
  })
})
