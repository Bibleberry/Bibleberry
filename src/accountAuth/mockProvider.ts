import type { AccountId } from '../accountSync/index.ts'
import type { AuthProvider } from './provider.ts'
import type {
  AuthMethod,
  AuthOperationOptions,
  AuthProviderRestoreResult,
  AuthProviderSignInResult,
  AuthProviderSignOutResult,
  AuthSignInRequest,
  EmailOtpChallenge,
  VerifiedAuthSession,
  VerifyEmailOtpRequest,
} from './types.ts'

export interface MockAuthProviderConfig {
  readonly accountId: AccountId
  readonly token?: string
  readonly expiresAt?: number
  readonly validOtpCode?: string
  readonly delayMs?: number
  readonly restoreQueue?: AuthProviderRestoreResult[]
  readonly signInQueue?: AuthProviderSignInResult[]
  readonly verifyOtpQueue?: AuthProviderSignInResult[]
  readonly recoverQueue?: AuthProviderRestoreResult[]
  readonly signOutQueue?: AuthProviderSignOutResult[]
}

function waitWithAbort(ms: number, signal?: AbortSignal): Promise<'ok' | 'aborted'> {
  if (signal?.aborted) return Promise.resolve('aborted')
  if (ms <= 0) return Promise.resolve('ok')
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cleanup()
      resolve('ok')
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      cleanup()
      resolve('aborted')
    }
    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function maskEmail(email: string): string {
  const parts = email.split('@')
  if (parts.length !== 2) return '***'
  const local = parts[0]
  const domain = parts[1]
  const head = local.length > 0 ? local[0] : '*'
  return `${head}***@${domain}`
}

/**
 * Deterministic in-memory mock `AuthProvider` for R13-2A unit and lifecycle tests.
 * Never touches network, DOM, or external auth services.
 */
export class MockAuthProvider implements AuthProvider {
  private readonly config: MockAuthProviderConfig
  private readonly restoreQueue: AuthProviderRestoreResult[]
  private readonly signInQueue: AuthProviderSignInResult[]
  private readonly verifyOtpQueue: AuthProviderSignInResult[]
  private readonly recoverQueue: AuthProviderRestoreResult[]
  private readonly signOutQueue: AuthProviderSignOutResult[]

  private activeSession: VerifiedAuthSession | null = null
  private pendingChallenge: EmailOtpChallenge | null = null
  private challengeCounter = 0

  public restoreCalls = 0
  public signInCalls = 0
  public verifyOtpCalls = 0
  public recoverCalls = 0
  public signOutCalls = 0

  constructor(config: MockAuthProviderConfig) {
    this.config = config
    this.restoreQueue = [...(config.restoreQueue ?? [])]
    this.signInQueue = [...(config.signInQueue ?? [])]
    this.verifyOtpQueue = [...(config.verifyOtpQueue ?? [])]
    this.recoverQueue = [...(config.recoverQueue ?? [])]
    this.signOutQueue = [...(config.signOutQueue ?? [])]
  }

  private buildSession(method: AuthMethod): VerifiedAuthSession {
    return {
      accountId: this.config.accountId,
      method,
      verificationSource: 'serverVerified',
      token: this.config.token ?? 'mock-verified-token',
      expiresAt: this.config.expiresAt,
      issuedAt: Date.now(),
    }
  }

  enqueueRestore(result: AuthProviderRestoreResult): void {
    this.restoreQueue.push(result)
  }

  enqueueSignIn(result: AuthProviderSignInResult): void {
    this.signInQueue.push(result)
  }

  enqueueVerifyOtp(result: AuthProviderSignInResult): void {
    this.verifyOtpQueue.push(result)
  }

  enqueueRecover(result: AuthProviderRestoreResult): void {
    this.recoverQueue.push(result)
  }

  enqueueSignOut(result: AuthProviderSignOutResult): void {
    this.signOutQueue.push(result)
  }

  async restoreSession(options?: AuthOperationOptions): Promise<AuthProviderRestoreResult> {
    this.restoreCalls += 1
    const waited = await waitWithAbort(this.config.delayMs ?? 0, options?.signal)
    if (waited === 'aborted') {
      return { status: 'aborted', message: 'Restore session aborted.' }
    }

    if (this.restoreQueue.length > 0) {
      const next = this.restoreQueue.shift()!
      if (next.status === 'authenticated') {
        this.activeSession = next.session
      }
      return next
    }

    if (this.activeSession) {
      return { status: 'authenticated', session: this.activeSession }
    }

    return { status: 'guest' }
  }

  async signIn(
    request: AuthSignInRequest,
    options?: AuthOperationOptions,
  ): Promise<AuthProviderSignInResult> {
    this.signInCalls += 1
    const waited = await waitWithAbort(this.config.delayMs ?? 0, options?.signal)
    if (waited === 'aborted') {
      return { status: 'aborted', message: 'Sign-in aborted.' }
    }

    if (this.signInQueue.length > 0) {
      const next = this.signInQueue.shift()!
      if (next.status === 'authenticated') {
        this.activeSession = next.session
      } else if (next.status === 'challengeRequired') {
        this.pendingChallenge = next.challenge
      }
      return next
    }

    if (request.method === 'emailOtp') {
      this.challengeCounter += 1
      const challenge: EmailOtpChallenge = {
        challengeId: `otp-challenge-${this.challengeCounter}`,
        method: 'emailOtp',
        maskedDestination: maskEmail(request.email),
        expiresAt: Date.now() + 10 * 60 * 1000,
      }
      this.pendingChallenge = challenge
      return { status: 'challengeRequired', challenge }
    }

    const session = this.buildSession(request.method)
    this.activeSession = session
    return { status: 'authenticated', session }
  }

  async verifyEmailOtp(
    request: VerifyEmailOtpRequest,
    options?: AuthOperationOptions,
  ): Promise<AuthProviderSignInResult> {
    this.verifyOtpCalls += 1
    const waited = await waitWithAbort(this.config.delayMs ?? 0, options?.signal)
    if (waited === 'aborted') {
      return { status: 'aborted', message: 'OTP verification aborted.' }
    }

    if (this.verifyOtpQueue.length > 0) {
      const next = this.verifyOtpQueue.shift()!
      if (next.status === 'authenticated') {
        this.activeSession = next.session
        this.pendingChallenge = null
      }
      return next
    }

    if (!this.pendingChallenge || request.challengeId !== this.pendingChallenge.challengeId) {
      return {
        status: 'unauthorized',
        reason: 'challengeExpired',
        message: 'Verification challenge is missing or expired.',
      }
    }

    const expectedCode = this.config.validOtpCode ?? '123456'
    if (request.code !== expectedCode) {
      return {
        status: 'unauthorized',
        reason: 'invalidOtpCode',
        message: 'The entered 6-digit verification code is incorrect.',
      }
    }

    const session = this.buildSession('emailOtp')
    this.activeSession = session
    this.pendingChallenge = null
    return { status: 'authenticated', session }
  }

  async recoverSession(options?: AuthOperationOptions): Promise<AuthProviderRestoreResult> {
    this.recoverCalls += 1
    const waited = await waitWithAbort(this.config.delayMs ?? 0, options?.signal)
    if (waited === 'aborted') {
      return { status: 'aborted', message: 'Session recovery aborted.' }
    }

    if (this.recoverQueue.length > 0) {
      const next = this.recoverQueue.shift()!
      if (next.status === 'authenticated') {
        this.activeSession = next.session
      }
      return next
    }

    const session = this.buildSession(this.activeSession?.method ?? 'google')
    this.activeSession = session
    return { status: 'authenticated', session }
  }

  async signOut(options?: AuthOperationOptions): Promise<AuthProviderSignOutResult> {
    this.signOutCalls += 1
    const waited = await waitWithAbort(this.config.delayMs ?? 0, options?.signal)
    if (waited === 'aborted') {
      return { status: 'aborted', message: 'Sign-out aborted.' }
    }

    this.activeSession = null
    this.pendingChallenge = null

    if (this.signOutQueue.length > 0) {
      return this.signOutQueue.shift()!
    }

    return { status: 'signedOut' }
  }
}

export function createMockAuthProvider(config: MockAuthProviderConfig): MockAuthProvider {
  return new MockAuthProvider(config)
}
