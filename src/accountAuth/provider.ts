import type { AuthorizedAccountSession } from '../accountSync/index.ts'
import { parseAccountId } from '../accountSync/index.ts'
import type {
  AuthMethod,
  AuthOperationOptions,
  AuthProviderRestoreResult,
  AuthProviderSignInResult,
  AuthProviderSignOutResult,
  AuthSignInRequest,
  VerifiedAuthSession,
  VerifyEmailOtpRequest,
} from './types.ts'

const VALID_AUTH_METHODS: ReadonlySet<AuthMethod> = new Set(['google', 'apple', 'emailOtp'])
const SIX_DIGIT_OTP_REGEX = /^\d{6}$/
const BASIC_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Provider-neutral asynchronous authentication boundary.
 * Implementations (future Supabase Auth adapter, or injected mocks in tests)
 * must return server-verified sessions and never expose raw credentials in errors.
 */
export interface AuthProvider {
  restoreSession(options?: AuthOperationOptions): Promise<AuthProviderRestoreResult>
  signIn(request: AuthSignInRequest, options?: AuthOperationOptions): Promise<AuthProviderSignInResult>
  verifyEmailOtp(
    request: VerifyEmailOtpRequest,
    options?: AuthOperationOptions,
  ): Promise<AuthProviderSignInResult>
  recoverSession(options?: AuthOperationOptions): Promise<AuthProviderRestoreResult>
  signOut(options?: AuthOperationOptions): Promise<AuthProviderSignOutResult>
}

export function isValidAuthMethod(method: unknown): method is AuthMethod {
  return typeof method === 'string' && VALID_AUTH_METHODS.has(method as AuthMethod)
}

export function isValidSixDigitOtpCode(code: unknown): boolean {
  return typeof code === 'string' && SIX_DIGIT_OTP_REGEX.test(code.trim())
}

export function isValidEmailInput(email: unknown): boolean {
  if (typeof email !== 'string') return false
  const trimmed = email.trim()
  return trimmed.length > 0 && trimmed.length <= 320 && BASIC_EMAIL_REGEX.test(trimmed)
}

export function isSessionExpired(
  session: Pick<VerifiedAuthSession, 'expiresAt'>,
  nowMs: number = Date.now(),
): boolean {
  if (session.expiresAt === undefined) return false
  if (typeof session.expiresAt !== 'number' || !Number.isFinite(session.expiresAt)) {
    return true
  }
  return session.expiresAt <= nowMs
}

export type SessionValidationResult =
  | { readonly valid: true; readonly session: VerifiedAuthSession }
  | { readonly valid: false; readonly reason: 'unverifiedSession' | 'invalidAccountId' | 'invalidMethod' | 'expired'; readonly message: string }

/**
 * Validates that a session returned by an AuthProvider is server-verified,
 * carries a canonical accountId, uses an approved auth method, and is not expired.
 */
export function validateVerifiedAuthSession(
  candidate: unknown,
  nowMs: number = Date.now(),
): SessionValidationResult {
  if (!candidate || typeof candidate !== 'object') {
    return {
      valid: false,
      reason: 'unverifiedSession',
      message: 'Authentication provider returned an empty or malformed session.',
    }
  }

  const raw = candidate as Partial<VerifiedAuthSession>
  if (raw.verificationSource !== 'serverVerified') {
    return {
      valid: false,
      reason: 'unverifiedSession',
      message: 'Session lacks server verification authority and cannot be trusted.',
    }
  }

  if (!isValidAuthMethod(raw.method)) {
    return {
      valid: false,
      reason: 'invalidMethod',
      message: 'Session specifies an unsupported authentication method.',
    }
  }

  const parsedAccountId = parseAccountId(raw.accountId)
  if (!parsedAccountId) {
    return {
      valid: false,
      reason: 'invalidAccountId',
      message: 'Session does not contain a valid canonical account identifier.',
    }
  }

  if (raw.expiresAt !== undefined && (typeof raw.expiresAt !== 'number' || !Number.isFinite(raw.expiresAt))) {
    return {
      valid: false,
      reason: 'expired',
      message: 'Session expiration timestamp is invalid.',
    }
  }

  if (isSessionExpired({ expiresAt: raw.expiresAt }, nowMs)) {
    return {
      valid: false,
      reason: 'expired',
      message: 'Authenticated session has expired.',
    }
  }

  return {
    valid: true,
    session: {
      accountId: parsedAccountId,
      method: raw.method,
      verificationSource: 'serverVerified',
      token: raw.token,
      expiresAt: raw.expiresAt,
      issuedAt: raw.issuedAt,
      isNewAccount: raw.isNewAccount,
    },
  }
}

/**
 * Projects a validated `VerifiedAuthSession` into the minimal `AuthorizedAccountSession`
 * required by the R13-1 `GuestToAccountSyncCoordinator`.
 */
export function toAuthorizedAccountSession(session: VerifiedAuthSession): AuthorizedAccountSession {
  return {
    accountId: session.accountId,
    token: session.token,
    expiresAt: session.expiresAt,
  }
}
