import type { AccountId } from '../accountSync/index.ts'
import { parseAccountId } from '../accountSync/index.ts'
import type { AuthProvider } from './provider.ts'
import { isValidEmailInput, isValidSixDigitOtpCode } from './provider.ts'
import type {
  AuthOperationOptions,
  AuthProviderRestoreResult,
  AuthProviderSignInResult,
  AuthProviderSignOutResult,
  AuthSignInRequest,
  EmailOtpChallenge,
  VerifiedAuthSession,
  VerifyEmailOtpRequest,
} from './types.ts'

/**
 * R13-2B (Issue #251, Sable Harbor): concrete Supabase Auth (GoTrue) `AuthProvider`
 * for the passwordless six-digit email OTP flow.
 *
 * Boundary rules:
 * - Talks only to the public GoTrue REST endpoints (`/auth/v1/otp`, `/auth/v1/verify`,
 *   `/auth/v1/user`, `/auth/v1/token?grant_type=refresh_token`, `/auth/v1/logout`) through an
 *   injectable `fetch`. No SDK dependency is added.
 * - Only a publishable/anon project key is accepted; secret and service-role keys are refused.
 * - Account identity is never read from an unverified JWT. Every promoted session is confirmed by
 *   asking GoTrue `GET /auth/v1/user` with the freshly issued access token.
 * - Session tokens are persisted only through a caller-injected `AuthTokenStore`. There is no
 *   implicit browser-persistence default.
 * - Google and Apple are approved future methods but are not implemented here; they fail
 *   explicitly with `unsupportedMethod`.
 * - Tokens, refresh tokens, email addresses and codes never appear in results or log messages.
 */

// ---------------------------------------------------------------------------
// Token store contract
// ---------------------------------------------------------------------------

/** Versioned record persisted by an `AuthTokenStore`. Treat every field as a secret. */
export interface StoredAuthTokens {
  readonly version: 1
  readonly accountId: AccountId
  readonly method: 'emailOtp'
  readonly accessToken: string
  readonly refreshToken: string
  /** Access-token expiry in epoch milliseconds, derived from GoTrue's `expires_at`/`expires_in`. */
  readonly expiresAt: number
}

/**
 * Caller-injected secure session persistence (for example, a future native Keychain/Keystore
 * adapter). `load()` returns `unknown` because persisted data is untrusted and is validated by the
 * provider before use. Implementations must never log the record.
 */
export interface AuthTokenStore {
  load(): Promise<unknown>
  save(tokens: StoredAuthTokens): Promise<void>
  clear(): Promise<void>
}

/**
 * Non-persistent token store. The session lives only for this JS realm; it is suitable for tests
 * and for an explicitly ephemeral session. It is never used implicitly.
 */
export function createInMemoryAuthTokenStore(): AuthTokenStore {
  let record: StoredAuthTokens | null = null
  return {
    async load() {
      return record
    },
    async save(tokens) {
      record = { ...tokens }
    },
    async clear() {
      record = null
    },
  }
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export type GoTrueFetch = typeof fetch

export interface SupabaseGoTrueAuthProviderOptions {
  /** Supabase project URL. Non-loopback endpoints must use HTTPS. */
  readonly url: string
  /** Publishable/anon key. Secret (`sb_secret_…`) and service-role keys are refused. */
  readonly apiKey: string
  /** Required secure persistence boundary. */
  readonly tokenStore: AuthTokenStore
  readonly fetch?: GoTrueFetch
  /** Per-request timeout. Default 15 s. */
  readonly timeoutMs?: number
  readonly now?: () => number
  /** Receives fixed, secret-free diagnostic strings only. */
  readonly logger?: (message: string) => void
  /**
   * Client-side lifetime of a pending challenge. Must not exceed the server `otp_expiry`
   * (GoTrue default 3600 s). Default 10 minutes.
   */
  readonly challengeTtlMs?: number
  /** Wrong-code attempts allowed per challenge before it is discarded. Default 5. */
  readonly maxOtpAttempts?: number
  /** Refresh the access token when it expires within this margin. Default 60 s. */
  readonly refreshLeewayMs?: number
  /** Whether `/otp` may create a new GoTrue user (`create_user`). Default true. */
  readonly allowAccountCreation?: boolean
  /** Challenge ID generator override for deterministic tests. Must be unguessable in production. */
  readonly generateChallengeId?: () => string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type JsonObject = Record<string, unknown>

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

function validateBaseUrl(raw: string): string {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new TypeError('Supabase Auth endpoint must be a valid URL')
  }
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && LOOPBACK_HOSTS.has(parsed.hostname))) {
    throw new TypeError('Supabase Auth endpoint must use HTTPS')
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new TypeError('Supabase Auth endpoint must not contain credentials or query parameters')
  }
  return parsed.toString().replace(/\/$/, '')
}

function decodeBase64UrlJson(segment: string): unknown {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/')
  return JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')))
}

const PUBLISHABLE_KEY_PATTERN = /^sb_publishable_[A-Za-z0-9_-]{8,}$/
const JWT_SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/

/**
 * Allowlist for the configured *project key*: only a `sb_publishable_…` key or a legacy JWT
 * project key whose role is exactly `anon` is accepted. Unknown formats, malformed JWTs, missing
 * roles and every other role (`authenticated`, `service_role`, …) are refused.
 *
 * This is a format classification of the caller's configuration, never cryptographic verification
 * of a user token (the adapter never decodes user tokens for identity).
 */
export function isPublishableSupabaseKey(key: unknown): boolean {
  if (typeof key !== 'string') return false
  if (PUBLISHABLE_KEY_PATTERN.test(key)) return true
  const parts = key.split('.')
  if (parts.length !== 3 || !parts.every((part) => part.length > 0 && JWT_SEGMENT_PATTERN.test(part))) return false
  try {
    const header = decodeBase64UrlJson(parts[0])
    const claims = decodeBase64UrlJson(parts[1])
    return isObject(header) && typeof header.alg === 'string' && isObject(claims) && claims.role === 'anon'
  } catch {
    return false
  }
}

/** Detects keys that would grant privileged access (used for diagnostics and tests). */
export function isPrivilegedSupabaseKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true
  const parts = key.split('.')
  if (parts.length !== 3) return false
  try {
    const claims = decodeBase64UrlJson(parts[1])
    return isObject(claims) && claims.role === 'service_role'
  } catch {
    return false
  }
}

function defaultChallengeIdGenerator(): () => string {
  const cryptoApi = (globalThis as { crypto?: { getRandomValues?: (array: Uint8Array) => Uint8Array } }).crypto
  if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') {
    throw new TypeError('A cryptographically secure random source is required for OTP challenge IDs')
  }
  return () => {
    const bytes = cryptoApi.getRandomValues!(new Uint8Array(16))
    return `gotrue-otp-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function maskEmail(email: string): string {
  const at = email.lastIndexOf('@')
  if (at <= 0) return '***'
  return `${email[0]}***@${email.slice(at + 1)}`
}

function errorCodeOf(body: unknown): string | undefined {
  if (!isObject(body)) return undefined
  if (typeof body.error_code === 'string') return body.error_code
  if (typeof body.code === 'string') return body.code
  if (typeof body.error === 'string') return body.error
  return undefined
}

function isOpaqueToken(value: unknown, minLength: number): value is string {
  return typeof value === 'string' && value.length >= minLength && value.length <= 16_384 && !/\s/.test(value)
}

interface ParsedTokenResponse {
  readonly accessToken: string
  readonly refreshToken: string
  readonly expiresAt: number
  /** User ID echoed by the token endpoint; only cross-checked, never trusted alone. */
  readonly echoedUserId?: string
}

function parseTokenResponse(body: unknown, nowMs: number): ParsedTokenResponse | null {
  if (!isObject(body)) return null
  if (!isOpaqueToken(body.access_token, 16) || !isOpaqueToken(body.refresh_token, 1)) return null
  if (body.token_type !== undefined && (typeof body.token_type !== 'string' || body.token_type.toLowerCase() !== 'bearer')) {
    return null
  }
  const candidates: number[] = []
  if (body.expires_at !== undefined) {
    if (typeof body.expires_at !== 'number' || !Number.isFinite(body.expires_at)) return null
    candidates.push(body.expires_at * 1000)
  }
  if (body.expires_in !== undefined) {
    if (typeof body.expires_in !== 'number' || !Number.isFinite(body.expires_in) || body.expires_in <= 0) return null
    candidates.push(nowMs + body.expires_in * 1000)
  }
  if (candidates.length === 0) return null
  const expiresAt = Math.min(...candidates)
  if (expiresAt <= nowMs) return null
  let echoedUserId: string | undefined
  if (body.user !== undefined) {
    if (!isObject(body.user) || typeof body.user.id !== 'string') return null
    echoedUserId = body.user.id
  }
  return { accessToken: body.access_token, refreshToken: body.refresh_token, expiresAt, echoedUserId }
}

function parseStoredTokens(value: unknown): StoredAuthTokens | null {
  if (!isObject(value) || value.version !== 1 || value.method !== 'emailOtp') return null
  const accountId = parseAccountId(value.accountId)
  if (!accountId) return null
  if (!isOpaqueToken(value.accessToken, 16) || !isOpaqueToken(value.refreshToken, 1)) return null
  if (typeof value.expiresAt !== 'number' || !Number.isFinite(value.expiresAt)) return null
  return {
    version: 1,
    accountId,
    method: 'emailOtp',
    accessToken: value.accessToken,
    refreshToken: value.refreshToken,
    expiresAt: value.expiresAt,
  }
}

type HttpResult =
  | { readonly kind: 'ok'; readonly status: number; readonly body: unknown }
  | { readonly kind: 'http'; readonly status: number; readonly errorCode?: string }
  | { readonly kind: 'network'; readonly timedOut: boolean }
  | { readonly kind: 'malformed' }
  | { readonly kind: 'aborted' }

type VerifiedUserResult =
  | { readonly ok: true; readonly accountId: AccountId; readonly email?: string }
  | { readonly ok: false; readonly failure: 'unauthorized' | 'rateLimited' | 'network' | 'malformed' | 'aborted'; readonly retryable: boolean }

type RefreshOutcome =
  | { readonly kind: 'session'; readonly session: VerifiedAuthSession }
  | { readonly kind: 'result'; readonly result: AuthProviderRestoreResult }

interface PendingChallenge {
  readonly challengeId: string
  readonly email: string
  readonly expiresAt: number
  readonly generation: number
  attempts: number
  inFlight: boolean
}

const MSG = {
  unsupported: (method: string) => `${method === 'apple' ? 'Apple' : 'Google'} sign-in is not available yet.`,
  invalidEmail: 'Enter a valid email address.',
  emailUnavailable: 'Email sign-in is not available right now.',
  rateLimited: 'Too many attempts. Please wait and try again.',
  network: 'The sign-in service could not be reached.',
  timeout: 'The sign-in service did not respond in time.',
  malformed: 'The sign-in service returned an invalid response.',
  aborted: 'The sign-in request was aborted.',
  challengeExpired: 'This verification code has expired. Request a new code.',
  invalidCode: 'That verification code is not correct.',
  verifyInFlight: 'A verification for this code is already in progress.',
  identityMismatch: 'The verified account did not match this sign-in.',
  supersededBySignOut: 'Sign-in was cancelled because the session was signed out.',
  supersededByNewerRequest: 'A newer verification code was requested.',
  storeRead: 'The saved session could not be read.',
  storeWrite: 'The session could not be saved securely.',
  storeClear: 'The saved session could not be cleared on this device.',
  invalidStored: 'The saved session is invalid and was discarded.',
  refreshFailed: 'Your session has ended. Please sign in again.',
  accountDisabled: 'This account cannot sign in.',
} as const

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class SupabaseGoTrueAuthProvider implements AuthProvider {
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly tokenStore: AuthTokenStore
  private readonly requestFetch: GoTrueFetch
  private readonly timeoutMs: number
  private readonly now: () => number
  private readonly logger?: (message: string) => void
  private readonly challengeTtlMs: number
  private readonly maxOtpAttempts: number
  private readonly refreshLeewayMs: number
  private readonly allowAccountCreation: boolean
  private readonly generateChallengeId: () => string

  /** Incremented by `signOut()`; late async completions from an older generation are discarded. */
  private generation = 0
  /** Incremented by every OTP request; only the newest request may install a challenge. */
  private otpSequence = 0
  private pending: PendingChallenge | null = null
  private refreshInFlight: { refreshToken: string; generation: number; promise: Promise<RefreshOutcome> } | null = null

  constructor(options: SupabaseGoTrueAuthProviderOptions) {
    if (!options || !isPublishableSupabaseKey(options.apiKey)) {
      throw new TypeError('A Supabase publishable/anon project key is required')
    }
    if (!options.tokenStore || typeof options.tokenStore.load !== 'function' ||
        typeof options.tokenStore.save !== 'function' || typeof options.tokenStore.clear !== 'function') {
      throw new TypeError('An injected AuthTokenStore is required')
    }
    this.baseUrl = validateBaseUrl(options.url)
    this.apiKey = options.apiKey
    this.tokenStore = options.tokenStore
    const injectedFetch = options.fetch ?? (typeof fetch === 'function' ? fetch : undefined)
    if (!injectedFetch) throw new TypeError('A fetch implementation is required')
    this.requestFetch = injectedFetch
    this.timeoutMs = options.timeoutMs ?? 15_000
    this.now = options.now ?? (() => Date.now())
    this.logger = options.logger
    this.challengeTtlMs = options.challengeTtlMs ?? 10 * 60_000
    this.maxOtpAttempts = options.maxOtpAttempts ?? 5
    this.refreshLeewayMs = options.refreshLeewayMs ?? 60_000
    this.allowAccountCreation = options.allowAccountCreation ?? true
    this.generateChallengeId = options.generateChallengeId ?? defaultChallengeIdGenerator()
  }

  // -------------------------------------------------------------------------
  // AuthProvider
  // -------------------------------------------------------------------------

  async signIn(request: AuthSignInRequest, options?: AuthOperationOptions): Promise<AuthProviderSignInResult> {
    if (!request || typeof request !== 'object') {
      return { status: 'unauthorized', reason: 'invalidCredentials', message: 'Unsupported sign-in request.' }
    }
    if (request.method === 'google' || request.method === 'apple') {
      return { status: 'unauthorized', reason: 'unsupportedMethod', message: MSG.unsupported(request.method) }
    }
    if (request.method !== 'emailOtp') {
      return { status: 'unauthorized', reason: 'unsupportedMethod', message: 'Unsupported sign-in method.' }
    }
    if (!isValidEmailInput(request.email)) {
      return { status: 'unauthorized', reason: 'invalidEmail', message: MSG.invalidEmail }
    }
    if (options?.signal?.aborted) return { status: 'aborted', message: MSG.aborted }

    const email = normalizeEmail(request.email)
    const generation = this.generation
    const sequence = ++this.otpSequence
    // A new request always invalidates any earlier pending challenge.
    this.pending = null

    const result = await this.request('/auth/v1/otp', {
      method: 'POST',
      body: { email, create_user: this.allowAccountCreation },
    }, options?.signal)

    if (generation !== this.generation) {
      return { status: 'cancelled', message: MSG.supersededBySignOut }
    }
    if (sequence !== this.otpSequence) {
      // A newer OTP request began while this one was in flight; it alone owns the live challenge.
      return { status: 'cancelled', message: MSG.supersededByNewerRequest }
    }
    switch (result.kind) {
      case 'aborted':
        return { status: 'aborted', message: MSG.aborted }
      case 'network':
        return { status: 'networkError', retryable: true, message: result.timedOut ? MSG.timeout : MSG.network }
      case 'malformed':
        return { status: 'networkError', retryable: false, message: MSG.malformed }
      case 'http':
        return this.mapOtpRequestFailure(result)
      case 'ok':
        break
    }

    let challengeId: string
    try {
      challengeId = this.generateChallengeId()
    } catch {
      return { status: 'networkError', retryable: false, message: MSG.malformed }
    }
    if (typeof challengeId !== 'string' || challengeId.length < 16) {
      return { status: 'networkError', retryable: false, message: MSG.malformed }
    }
    const expiresAt = this.now() + this.challengeTtlMs
    this.pending = { challengeId, email, expiresAt, generation, attempts: 0, inFlight: false }
    const challenge: EmailOtpChallenge = {
      challengeId,
      method: 'emailOtp',
      maskedDestination: maskEmail(email),
      expiresAt,
    }
    this.log('GoTrue email OTP requested.')
    return { status: 'challengeRequired', challenge }
  }

  async verifyEmailOtp(request: VerifyEmailOtpRequest, options?: AuthOperationOptions): Promise<AuthProviderSignInResult> {
    const pending = this.pending
    if (!pending || !request || typeof request.challengeId !== 'string' || request.challengeId !== pending.challengeId ||
        pending.generation !== this.generation) {
      return { status: 'unauthorized', reason: 'challengeExpired', message: MSG.challengeExpired }
    }
    if (pending.expiresAt <= this.now()) {
      this.pending = null
      return { status: 'unauthorized', reason: 'challengeExpired', message: MSG.challengeExpired }
    }
    if (pending.inFlight) {
      return { status: 'networkError', retryable: true, message: MSG.verifyInFlight }
    }
    if (pending.attempts >= this.maxOtpAttempts) {
      this.pending = null
      return { status: 'unauthorized', reason: 'challengeExpired', message: MSG.challengeExpired }
    }
    if (!isValidSixDigitOtpCode(request.code)) {
      return this.countFailedAttempt(pending)
    }
    if (options?.signal?.aborted) return { status: 'aborted', message: MSG.aborted }

    pending.inFlight = true
    pending.attempts += 1
    let result: HttpResult
    try {
      result = await this.request('/auth/v1/verify', {
        method: 'POST',
        body: { type: 'email', email: pending.email, token: request.code.trim() },
      }, options?.signal)
    } finally {
      pending.inFlight = false
    }

    if (pending.generation !== this.generation || this.pending !== pending) {
      if (result.kind === 'ok') this.revokeQuietly(parseTokenResponse(result.body, this.now())?.accessToken)
      return { status: 'cancelled', message: MSG.supersededBySignOut }
    }

    switch (result.kind) {
      case 'aborted':
        return { status: 'aborted', message: MSG.aborted }
      case 'network':
        return { status: 'networkError', retryable: true, message: result.timedOut ? MSG.timeout : MSG.network }
      case 'malformed':
        // The server may have consumed the code; the challenge cannot be trusted any further.
        this.pending = null
        return { status: 'networkError', retryable: false, message: MSG.malformed }
      case 'http':
        if (result.status === 429) {
          return { status: 'unauthorized', reason: 'rateLimited', message: MSG.rateLimited }
        }
        if (result.status >= 500) {
          return { status: 'networkError', retryable: true, message: MSG.network }
        }
        if (result.errorCode === 'user_banned') {
          this.pending = null
          return { status: 'unauthorized', reason: 'accountDisabled', message: MSG.accountDisabled }
        }
        // GoTrue reports wrong, expired and already-used codes alike (`otp_expired`).
        return this.afterRejectedCode(pending)
      case 'ok':
        break
    }

    // Success from GoTrue consumes the server-side code: the challenge can never be replayed.
    this.pending = null
    const tokens = parseTokenResponse(result.body, this.now())
    if (!tokens) {
      return { status: 'networkError', retryable: false, message: MSG.malformed }
    }
    if (options?.signal?.aborted) {
      this.revokeQuietly(tokens.accessToken)
      return { status: 'aborted', message: MSG.aborted }
    }

    const promoted = await this.promote(tokens, {
      expectedEmail: pending.email,
      generation: pending.generation,
      signal: options?.signal,
    })
    if (promoted.kind === 'result') return this.restoreResultToSignIn(promoted.result)
    this.log('GoTrue email OTP verified.')
    return { status: 'authenticated', session: promoted.session }
  }

  async restoreSession(options?: AuthOperationOptions): Promise<AuthProviderRestoreResult> {
    if (options?.signal?.aborted) return { status: 'aborted', message: MSG.aborted }
    const generation = this.generation
    const loaded = await this.loadStored()
    if (loaded.kind === 'error') return loaded.result
    if (loaded.kind === 'empty') return { status: 'guest' }
    const stored = loaded.tokens

    if (stored.expiresAt - this.refreshLeewayMs <= this.now()) {
      return this.refreshAndPromote(stored, generation, options?.signal)
    }

    const verified = await this.fetchVerifiedUser(stored.accessToken, options?.signal)
    if (generation !== this.generation) return { status: 'guest' }
    if (!verified.ok) {
      switch (verified.failure) {
        case 'aborted':
          return { status: 'aborted', message: MSG.aborted }
        case 'rateLimited':
          return { status: 'unauthorized', reason: 'rateLimited', message: MSG.rateLimited }
        case 'network':
          return { status: 'networkError', retryable: true, message: MSG.network }
        case 'malformed':
          return { status: 'networkError', retryable: false, message: MSG.malformed }
        case 'unauthorized':
          // Access token rejected (revoked/expired early): one explicit refresh attempt.
          return this.refreshAndPromote(stored, generation, options?.signal)
      }
    }
    if (verified.accountId !== stored.accountId) {
      await this.clearStoreQuietly()
      this.log('GoTrue restored identity did not match stored account; session discarded.')
      return { status: 'unauthorized', reason: 'invalidToken', message: MSG.identityMismatch }
    }
    return { status: 'authenticated', session: this.toSession(stored) }
  }

  async recoverSession(options?: AuthOperationOptions): Promise<AuthProviderRestoreResult> {
    if (options?.signal?.aborted) return { status: 'aborted', message: MSG.aborted }
    const generation = this.generation
    const loaded = await this.loadStored()
    if (loaded.kind === 'error') return loaded.result
    if (loaded.kind === 'empty') return { status: 'guest' }
    return this.refreshAndPromote(loaded.tokens, generation, options?.signal)
  }

  async signOut(options?: AuthOperationOptions): Promise<AuthProviderSignOutResult> {
    // Local state is invalidated first and unconditionally, so any late completion is discarded.
    this.generation += 1
    this.pending = null
    this.refreshInFlight = null

    let stored: StoredAuthTokens | null = null
    try {
      stored = parseStoredTokens(await this.tokenStore.load())
    } catch {
      stored = null
    }
    let localClearFailed = false
    try {
      await this.tokenStore.clear()
    } catch {
      localClearFailed = true
    }

    let remote: AuthProviderSignOutResult = { status: 'signedOut' }
    if (stored) {
      const result = await this.request('/auth/v1/logout?scope=local', { method: 'POST', accessToken: stored.accessToken }, options?.signal)
      if (result.kind === 'aborted') {
        remote = { status: 'aborted', message: 'Remote sign-out was aborted; this device is signed out.' }
      } else if (result.kind === 'network') {
        remote = { status: 'networkError', retryable: true, message: 'Remote sign-out could not be confirmed; this device is signed out.' }
      } else if (result.kind === 'http' && result.status >= 500) {
        remote = { status: 'networkError', retryable: true, message: 'Remote sign-out could not be confirmed; this device is signed out.' }
      }
      // 2xx, and 401/403/404 (session already gone), are a completed sign-out.
    }
    if (localClearFailed) {
      return { status: 'networkError', retryable: false, message: MSG.storeClear }
    }
    this.log('GoTrue session signed out.')
    return remote
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private countFailedAttempt(pending: PendingChallenge): AuthProviderSignInResult {
    pending.attempts += 1
    return this.afterRejectedCode(pending)
  }

  private afterRejectedCode(pending: PendingChallenge): AuthProviderSignInResult {
    if (pending.attempts >= this.maxOtpAttempts) {
      if (this.pending === pending) this.pending = null
      return { status: 'unauthorized', reason: 'challengeExpired', message: MSG.challengeExpired }
    }
    return { status: 'unauthorized', reason: 'invalidOtpCode', message: MSG.invalidCode }
  }

  private mapOtpRequestFailure(result: { status: number; errorCode?: string }): AuthProviderSignInResult {
    if (result.status === 429 || result.errorCode === 'over_email_send_rate_limit' || result.errorCode === 'over_request_rate_limit') {
      return { status: 'unauthorized', reason: 'rateLimited', message: MSG.rateLimited }
    }
    if (result.status >= 500) {
      // Includes GoTrue's failure to deliver mail when no SMTP/mail capture is configured.
      return { status: 'networkError', retryable: true, message: MSG.emailUnavailable }
    }
    switch (result.errorCode) {
      case 'email_address_invalid':
      case 'email_address_not_authorized':
      case 'validation_failed':
        return { status: 'unauthorized', reason: 'invalidEmail', message: MSG.invalidEmail }
      case 'otp_disabled':
      case 'email_provider_disabled':
      case 'signup_disabled':
        return { status: 'unauthorized', reason: 'unsupportedMethod', message: MSG.emailUnavailable }
      case 'user_banned':
        return { status: 'unauthorized', reason: 'accountDisabled', message: MSG.accountDisabled }
      default:
        return { status: 'unauthorized', reason: 'invalidCredentials', message: MSG.emailUnavailable }
    }
  }

  private restoreResultToSignIn(result: AuthProviderRestoreResult): AuthProviderSignInResult {
    switch (result.status) {
      case 'authenticated':
      case 'unauthorized':
      case 'networkError':
      case 'aborted':
        return result
      case 'guest':
        return { status: 'cancelled', message: MSG.supersededBySignOut }
      case 'expired':
        return { status: 'unauthorized', reason: 'invalidToken', message: result.message }
    }
  }

  private toSession(stored: StoredAuthTokens): VerifiedAuthSession {
    return {
      accountId: stored.accountId,
      method: 'emailOtp',
      verificationSource: 'serverVerified',
      token: stored.accessToken,
      expiresAt: stored.expiresAt,
      issuedAt: this.now(),
    }
  }

  private async loadStored(): Promise<
    | { kind: 'empty' }
    | { kind: 'tokens'; tokens: StoredAuthTokens }
    | { kind: 'error'; result: AuthProviderRestoreResult }
  > {
    let raw: unknown
    try {
      raw = await this.tokenStore.load()
    } catch {
      return { kind: 'error', result: { status: 'networkError', retryable: false, message: MSG.storeRead } }
    }
    if (raw === null || raw === undefined) return { kind: 'empty' }
    const tokens = parseStoredTokens(raw)
    if (!tokens) {
      await this.clearStoreQuietly()
      return { kind: 'error', result: { status: 'unauthorized', reason: 'invalidToken', message: MSG.invalidStored } }
    }
    return { kind: 'tokens', tokens }
  }

  /**
   * Refresh is single-flight per refresh token and is deliberately *not* cancelled by the caller's
   * signal: GoTrue rotates refresh tokens, so abandoning a request mid-flight could strand the
   * device with a consumed token. The caller still gets a prompt `aborted` result.
   */
  private async refreshAndPromote(
    stored: StoredAuthTokens,
    generation: number,
    signal?: AbortSignal,
  ): Promise<AuthProviderRestoreResult> {
    let flight = this.refreshInFlight
    if (!flight || flight.refreshToken !== stored.refreshToken || flight.generation !== generation) {
      const promise = this.performRefresh(stored, generation)
      flight = { refreshToken: stored.refreshToken, generation, promise }
      this.refreshInFlight = flight
      const current = flight
      void promise.finally(() => {
        if (this.refreshInFlight === current) this.refreshInFlight = null
      })
    }
    const outcome = await raceAbort(flight.promise, signal)
    if (outcome === 'aborted') return { status: 'aborted', message: MSG.aborted }
    return outcome.kind === 'session' ? { status: 'authenticated', session: outcome.session } : outcome.result
  }

  private async performRefresh(stored: StoredAuthTokens, generation: number): Promise<RefreshOutcome> {
    const result = await this.request('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: stored.refreshToken },
    })
    if (generation !== this.generation) {
      if (result.kind === 'ok') this.revokeQuietly(parseTokenResponse(result.body, this.now())?.accessToken)
      return { kind: 'result', result: { status: 'guest' } }
    }
    switch (result.kind) {
      case 'aborted':
        return { kind: 'result', result: { status: 'aborted', message: MSG.aborted } }
      case 'network':
        return { kind: 'result', result: { status: 'networkError', retryable: true, message: result.timedOut ? MSG.timeout : MSG.network } }
      case 'malformed':
        return { kind: 'result', result: { status: 'networkError', retryable: false, message: MSG.malformed } }
      case 'http':
        if (result.status === 429) {
          return { kind: 'result', result: { status: 'unauthorized', reason: 'rateLimited', message: MSG.rateLimited } }
        }
        if (result.status >= 500) {
          return { kind: 'result', result: { status: 'networkError', retryable: true, message: MSG.network } }
        }
        // Missing, revoked, reused or expired refresh token: fail closed and forget the session.
        await this.clearStoreQuietly()
        this.log('GoTrue session refresh was rejected; session discarded.')
        return {
          kind: 'result',
          result: { status: 'expired', reason: 'refreshFailed', method: 'emailOtp', message: MSG.refreshFailed },
        }
      case 'ok':
        break
    }
    const tokens = parseTokenResponse(result.body, this.now())
    if (!tokens) {
      return { kind: 'result', result: { status: 'networkError', retryable: false, message: MSG.malformed } }
    }
    return this.promote(tokens, { expectedAccountId: stored.accountId, generation, rotated: true })
  }

  /**
   * Converts freshly issued GoTrue tokens into a server-verified session by asking GoTrue for the
   * authenticated user, cross-checking every expected identity binding, and persisting the
   * result. Any failure revokes the new tokens best-effort and fails closed.
   */
  private async promote(
    tokens: ParsedTokenResponse,
    expect: {
      expectedAccountId?: AccountId
      expectedEmail?: string
      generation: number
      signal?: AbortSignal
      /**
       * True when `tokens` came from a refresh-token rotation. GoTrue has then already consumed the
       * stored refresh token, so the rotated pair is the only way back into this session.
       */
      rotated?: boolean
    },
  ): Promise<RefreshOutcome> {
    const fail = (result: AuthProviderRestoreResult, revoke = true): RefreshOutcome => {
      if (revoke) this.revokeQuietly(tokens.accessToken)
      return { kind: 'result', result }
    }

    const verified = await this.fetchVerifiedUser(tokens.accessToken, expect.signal)
    if (expect.generation !== this.generation) return fail({ status: 'guest' })
    if (!verified.ok) {
      if (expect.rotated && expect.expectedAccountId !== undefined) {
        return this.holdRotatedTokens(tokens, expect.expectedAccountId, expect.generation, verified.failure)
      }
      switch (verified.failure) {
        case 'aborted':
          return fail({ status: 'aborted', message: MSG.aborted })
        case 'rateLimited':
          return fail({ status: 'unauthorized', reason: 'rateLimited', message: MSG.rateLimited })
        case 'network':
          return fail({ status: 'networkError', retryable: true, message: MSG.network })
        case 'malformed':
          return fail({ status: 'networkError', retryable: false, message: MSG.malformed })
        case 'unauthorized':
          return fail({ status: 'unauthorized', reason: 'invalidToken', message: MSG.identityMismatch })
      }
    }
    const mismatch =
      (tokens.echoedUserId !== undefined && tokens.echoedUserId !== verified.accountId) ||
      (expect.expectedAccountId !== undefined && expect.expectedAccountId !== verified.accountId) ||
      (expect.expectedEmail !== undefined && (verified.email === undefined || normalizeEmail(verified.email) !== expect.expectedEmail))
    if (mismatch) {
      if (expect.expectedAccountId !== undefined) await this.clearStoreQuietly()
      this.log('GoTrue verified identity did not match the expected binding; session refused.')
      return fail({ status: 'unauthorized', reason: 'invalidToken', message: MSG.identityMismatch })
    }

    const record: StoredAuthTokens = {
      version: 1,
      accountId: verified.accountId,
      method: 'emailOtp',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
    }
    try {
      await this.tokenStore.save(record)
    } catch {
      return fail({ status: 'networkError', retryable: false, message: MSG.storeWrite })
    }
    if (expect.generation !== this.generation) {
      await this.clearStoreQuietly()
      return fail({ status: 'guest' })
    }
    return { kind: 'session', session: this.toSession(record) }
  }

  /**
   * Post-rotation, pre-verification state: GoTrue rotated the refresh token but identity
   * confirmation via `/user` did not succeed. Nothing is promoted.
   *
   * - Transient failure (network, timeout, 429, 5xx): the rotated pair replaces the consumed pair in
   *   the store under the *previously verified* account binding, and a retryable error is returned.
   *   Every later promotion path (`restoreSession` → `/user`, `recoverSession` → refresh → `/user`)
   *   re-verifies identity against that binding before anything reaches the controller.
   * - Conclusive failure (rejected token, malformed user) or a store that cannot save: the session
   *   cannot be recovered, so the store is cleared, the rotated tokens are revoked best-effort and a
   *   terminal, non-retryable result is returned.
   */
  private async holdRotatedTokens(
    tokens: ParsedTokenResponse,
    accountId: AccountId,
    generation: number,
    failure: 'unauthorized' | 'rateLimited' | 'network' | 'malformed' | 'aborted',
  ): Promise<RefreshOutcome> {
    const terminal = async (result: AuthProviderRestoreResult): Promise<RefreshOutcome> => {
      await this.clearStoreQuietly()
      this.revokeQuietly(tokens.accessToken)
      this.log('GoTrue rotated session could not be verified; session discarded.')
      return { kind: 'result', result }
    }
    if (failure === 'unauthorized') {
      return terminal({ status: 'expired', reason: 'refreshFailed', method: 'emailOtp', message: MSG.refreshFailed })
    }
    if (failure === 'malformed') {
      return terminal({ status: 'networkError', retryable: false, message: MSG.malformed })
    }
    if (tokens.echoedUserId !== undefined && tokens.echoedUserId !== accountId) {
      return terminal({ status: 'unauthorized', reason: 'invalidToken', message: MSG.identityMismatch })
    }
    try {
      await this.tokenStore.save({
        version: 1,
        accountId,
        method: 'emailOtp',
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      })
    } catch {
      return terminal({ status: 'networkError', retryable: false, message: MSG.storeWrite })
    }
    if (generation !== this.generation) {
      await this.clearStoreQuietly()
      this.revokeQuietly(tokens.accessToken)
      return { kind: 'result', result: { status: 'guest' } }
    }
    this.log('GoTrue session rotated; identity confirmation deferred to the next restore.')
    if (failure === 'rateLimited') {
      return { kind: 'result', result: { status: 'unauthorized', reason: 'rateLimited', message: MSG.rateLimited } }
    }
    if (failure === 'aborted') {
      return { kind: 'result', result: { status: 'aborted', message: MSG.aborted } }
    }
    return { kind: 'result', result: { status: 'networkError', retryable: true, message: MSG.network } }
  }

  private async fetchVerifiedUser(accessToken: string, signal?: AbortSignal): Promise<VerifiedUserResult> {
    const result = await this.request('/auth/v1/user', { method: 'GET', accessToken }, signal)
    switch (result.kind) {
      case 'aborted':
        return { ok: false, failure: 'aborted', retryable: true }
      case 'network':
        return { ok: false, failure: 'network', retryable: true }
      case 'malformed':
        return { ok: false, failure: 'malformed', retryable: false }
      case 'http':
        if (result.status === 429) return { ok: false, failure: 'rateLimited', retryable: true }
        if (result.status >= 500) return { ok: false, failure: 'network', retryable: true }
        return { ok: false, failure: 'unauthorized', retryable: false }
      case 'ok':
        break
    }
    const user = result.body
    if (!isObject(user)) return { ok: false, failure: 'malformed', retryable: false }
    const accountId = parseAccountId(user.id)
    if (!accountId) return { ok: false, failure: 'malformed', retryable: false }
    if (user.aud !== undefined && user.aud !== 'authenticated') return { ok: false, failure: 'unauthorized', retryable: false }
    if (user.role !== undefined && user.role !== 'authenticated') return { ok: false, failure: 'unauthorized', retryable: false }
    if (user.is_anonymous === true) return { ok: false, failure: 'unauthorized', retryable: false }
    if (user.email !== undefined && user.email !== null && typeof user.email !== 'string') {
      return { ok: false, failure: 'malformed', retryable: false }
    }
    return { ok: true, accountId, ...(typeof user.email === 'string' ? { email: user.email } : {}) }
  }

  private revokeQuietly(accessToken: string | undefined): void {
    if (!accessToken) return
    void this.request('/auth/v1/logout?scope=local', { method: 'POST', accessToken }).catch(() => undefined)
  }

  private async clearStoreQuietly(): Promise<void> {
    try {
      await this.tokenStore.clear()
    } catch {
      this.log('GoTrue token store could not be cleared.')
    }
  }

  private log(message: string): void {
    try {
      this.logger?.(message)
    } catch {
      // Diagnostics must never affect authentication outcomes.
    }
  }

  private async request(
    path: string,
    init: { method: 'GET' | 'POST'; body?: JsonObject; accessToken?: string },
    signal?: AbortSignal,
  ): Promise<HttpResult> {
    if (signal?.aborted) return { kind: 'aborted' }
    const controller = new AbortController()
    const onAbort = () => controller.abort(signal?.reason)
    signal?.addEventListener('abort', onAbort, { once: true })
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, this.timeoutMs)
    const headers: Record<string, string> = { apikey: this.apiKey, Accept: 'application/json' }
    if (init.body) headers['Content-Type'] = 'application/json'
    if (init.accessToken) headers.Authorization = `Bearer ${init.accessToken}`
    try {
      const response = await this.requestFetch(`${this.baseUrl}${path}`, {
        method: init.method,
        headers,
        ...(init.body ? { body: JSON.stringify(init.body) } : {}),
        signal: controller.signal,
        redirect: 'error',
        credentials: 'omit',
        cache: 'no-store',
      })
      let body: unknown = null
      let parseFailed = false
      const text = await response.text()
      if (text.length > 0) {
        try {
          body = JSON.parse(text) as unknown
        } catch {
          parseFailed = true
        }
      }
      if (!response.ok) {
        return { kind: 'http', status: response.status, ...(parseFailed ? {} : { errorCode: errorCodeOf(body) }) }
      }
      if (parseFailed) return { kind: 'malformed' }
      return { kind: 'ok', status: response.status, body }
    } catch {
      if (signal?.aborted) return { kind: 'aborted' }
      this.log(timedOut ? 'GoTrue request timed out.' : 'GoTrue request failed.')
      return { kind: 'network', timedOut }
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
  }
}

function raceAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T | 'aborted'> {
  if (!signal) return promise
  if (signal.aborted) return Promise.resolve('aborted')
  return new Promise((resolve, reject) => {
    const onAbort = () => resolve('aborted')
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

export function createSupabaseGoTrueAuthProvider(options: SupabaseGoTrueAuthProviderOptions): SupabaseGoTrueAuthProvider {
  return new SupabaseGoTrueAuthProvider(options)
}
