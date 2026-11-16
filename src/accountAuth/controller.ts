import type {
  AuthorizedAccountTransport,
  CoordinateGuestSyncOutcome,
  GuestReconciliationInput,
  GuestStorageAccessor,
  SyncLogger,
} from '../accountSync/index.ts'
import { coordinateGuestSync, sanitizeLogMessage } from '../accountSync/index.ts'
import type { AuthProvider } from './provider.ts'
import {
  isSessionExpired,
  isValidAuthMethod,
  isValidEmailInput,
  isValidSixDigitOtpCode,
  toAuthorizedAccountSession,
  validateVerifiedAuthSession,
} from './provider.ts'
import type {
  AccountSessionControllerOptions,
  AccountSessionState,
  AuthActionOutcome,
  AuthControllerError,
  AuthMethod,
  AuthOperationOptions,
  AuthProviderRestoreResult,
  AuthProviderSignInResult,
  AuthSignInRequest,
  SyncInvocationOptions,
  VerifiedAuthSession,
  VerifyEmailOtpRequest,
} from './types.ts'

export type SessionStateListener = (state: AccountSessionState) => void

function logSafe(logger: SyncLogger | undefined, level: keyof SyncLogger, message: string): void {
  if (!logger) return
  const fn = logger[level]
  if (typeof fn === 'function') {
    fn(sanitizeLogMessage(message))
  }
}

function linkAbortSignal(external?: AbortSignal): {
  controller: AbortController
  cleanup: () => void
} {
  const controller = new AbortController()
  if (!external) {
    return { controller, cleanup: () => {} }
  }
  if (external.aborted) {
    controller.abort(external.reason)
    return { controller, cleanup: () => {} }
  }
  const onAbort = () => controller.abort(external.reason)
  external.addEventListener('abort', onAbort, { once: true })
  return {
    controller,
    cleanup: () => external.removeEventListener('abort', onAbort),
  }
}

function makeError(
  code: AuthControllerError['code'],
  message: string,
  retryable: boolean,
  reason?: string,
): AuthControllerError {
  return {
    code,
    retryable,
    message: sanitizeLogMessage(message),
    ...(reason ? { reason } : {}),
  }
}

/**
 * Provider-neutral, testable session state controller for Bibleberry R13-2A.
 * Manages optional guest mode, session restoration, Google/Apple/email-OTP sign-in,
 * cancellation, expired-session recovery, sign-out, and safe R13-1 sync invocation.
 */
export class AccountSessionController {
  private readonly provider: AuthProvider
  private readonly guest?: GuestReconciliationInput | GuestStorageAccessor
  private readonly transport?: AuthorizedAccountTransport
  private readonly autoSyncOnSignIn: boolean
  private readonly defaultSyncOptions?: Omit<SyncInvocationOptions, 'signal'>
  private readonly logger?: SyncLogger
  private readonly now: () => number

  private state: AccountSessionState = { status: 'guest' }
  private readonly listeners = new Set<SessionStateListener>()
  private operationEpoch = 0
  private activeAbortController: AbortController | null = null
  private returnStateOnCancel: AccountSessionState = { status: 'guest' }

  constructor(provider: AuthProvider, options: AccountSessionControllerOptions = {}) {
    this.provider = provider
    this.guest = options.guest
    this.transport = options.transport
    this.autoSyncOnSignIn =
      options.autoSyncOnSignIn ?? Boolean(options.guest && options.transport)
    this.defaultSyncOptions = options.defaultSyncOptions
    this.logger = options.logger
    this.now = options.now ?? (() => Date.now())
  }

  getState(): AccountSessionState {
    return this.state
  }

  subscribe(listener: SessionStateListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private setState(next: AccountSessionState): void {
    this.state = next
    for (const listener of this.listeners) {
      listener(next)
    }
  }

  private beginOperation(externalSignal?: AbortSignal): {
    epoch: number
    signal: AbortSignal
    cleanup: () => void
  } {
    this.operationEpoch += 1
    const epoch = this.operationEpoch
    const { controller, cleanup } = linkAbortSignal(externalSignal)
    this.activeAbortController = controller
    return { epoch, signal: controller.signal, cleanup }
  }

  private isStale(epoch: number): boolean {
    return epoch !== this.operationEpoch
  }

  private clearActiveAbort(epoch: number): void {
    if (epoch === this.operationEpoch) {
      this.activeAbortController = null
    }
  }

  private validateAndPromoteSession(
    rawSession: VerifiedAuthSession,
    fallbackMethod?: AuthMethod,
  ):
    | { ok: true; session: VerifiedAuthSession }
    | { ok: false; nextState: AccountSessionState; error: AuthControllerError } {
    const validation = validateVerifiedAuthSession(rawSession, this.now())
    if (validation.valid) {
      return { ok: true, session: validation.session }
    }

    if (validation.reason === 'expired') {
      const error = makeError('expired', validation.message, true, 'sessionExpired')
      return {
        ok: false,
        nextState: {
          status: 'expired',
          method: rawSession?.method ?? fallbackMethod,
          reason: 'sessionExpired',
          lastError: error,
        },
        error,
      }
    }

    const code = validation.reason === 'unverifiedSession' ? 'unverifiedSession' : 'invalidSession'
    const error = makeError(code, validation.message, false, validation.reason)
    return {
      ok: false,
      nextState: { status: 'guest', lastError: error },
      error,
    }
  }

  private async finalizeAuthenticatedSession(
    session: VerifiedAuthSession,
    externalSignal?: AbortSignal,
  ): Promise<AuthActionOutcome> {
    this.setState({
      status: 'authenticated',
      session,
      syncStatus: 'idle',
    })

    if (!this.autoSyncOnSignIn || !this.guest || !this.transport) {
      return { ok: true, state: this.state }
    }

    return this.syncGuestToAccount({
      ...this.defaultSyncOptions,
      signal: externalSignal,
    })
  }

  private handleRestoreOutcome(
    result: AuthProviderRestoreResult,
    fallbackState: AccountSessionState,
  ): { promoted?: VerifiedAuthSession; outcome?: AuthActionOutcome } {
    switch (result.status) {
      case 'guest': {
        this.setState({ status: 'guest' })
        return { outcome: { ok: true, state: this.state } }
      }
      case 'authenticated': {
        const checked = this.validateAndPromoteSession(result.session)
        if (!checked.ok) {
          logSafe(this.logger, 'warn', `Rejected unverified or invalid session: ${checked.error.message}`)
          this.setState(checked.nextState)
          return { outcome: { ok: false, state: this.state, error: checked.error } }
        }
        return { promoted: checked.session }
      }
      case 'expired': {
        const error = makeError('expired', result.message, true, result.reason)
        this.setState({
          status: 'expired',
          method: result.method,
          reason: result.reason,
          lastError: error,
        })
        return { outcome: { ok: false, state: this.state, error } }
      }
      case 'unauthorized': {
        const error = makeError('unauthorized', result.message, false, result.reason)
        if (fallbackState.status === 'expired') {
          this.setState({
            ...fallbackState,
            lastError: error,
          })
        } else {
          this.setState({ status: 'guest', lastError: error })
        }
        return { outcome: { ok: false, state: this.state, error } }
      }
      case 'networkError': {
        const error = makeError('networkError', result.message, result.retryable)
        if (fallbackState.status === 'expired') {
          this.setState({
            ...fallbackState,
            lastError: error,
          })
        } else {
          this.setState({ status: 'guest', lastError: error })
        }
        return { outcome: { ok: false, state: this.state, error } }
      }
      case 'aborted': {
        const error = makeError('aborted', result.message, true)
        this.setState(fallbackState)
        return { outcome: { ok: false, state: this.state, error } }
      }
    }
  }

  async restoreSession(options?: AuthOperationOptions): Promise<AuthActionOutcome> {
    if (
      this.state.status === 'restoring' ||
      this.state.status === 'signingIn' ||
      this.state.status === 'signingOut'
    ) {
      const error = makeError(
        'operationInProgress',
        `Cannot restore session while state is '${this.state.status}'.`,
        true,
      )
      return { ok: false, state: this.state, error }
    }

    if (this.state.status === 'authenticated') {
      if (!isSessionExpired(this.state.session, this.now())) {
        return { ok: true, state: this.state }
      }
      const expiredError = makeError('expired', 'Authenticated session has expired.', true, 'sessionExpired')
      this.setState({
        status: 'expired',
        method: this.state.session.method,
        reason: 'sessionExpired',
        lastError: expiredError,
      })
    }

    const previousState = this.state
    this.returnStateOnCancel = previousState
    const { epoch, signal, cleanup } = this.beginOperation(options?.signal)
    this.setState({ status: 'restoring' })

    try {
      const result = await this.provider.restoreSession({ signal })
      if (this.isStale(epoch)) {
        return {
          ok: false,
          state: this.state,
          error: makeError('cancelled', 'Session restore was superseded or cancelled.', true),
        }
      }

      const handled = this.handleRestoreOutcome(result, previousState)
      if (handled.promoted) {
        return await this.finalizeAuthenticatedSession(handled.promoted, options?.signal)
      }
      return handled.outcome!
    } catch (err) {
      if (this.isStale(epoch)) {
        return {
          ok: false,
          state: this.state,
          error: makeError('cancelled', 'Session restore was cancelled.', true),
        }
      }
      const message = err instanceof Error ? err.message : 'Unexpected error restoring session.'
      const error = makeError('networkError', message, true)
      this.setState({ status: 'guest', lastError: error })
      return { ok: false, state: this.state, error }
    } finally {
      cleanup()
      this.clearActiveAbort(epoch)
    }
  }

  async signIn(request: AuthSignInRequest, options?: AuthOperationOptions): Promise<AuthActionOutcome> {
    if (this.state.status === 'signingIn') {
      const error = makeError('signInAlreadyInProgress', 'A sign-in attempt is already in progress.', false)
      return { ok: false, state: this.state, error }
    }

    if (this.state.status === 'authenticated') {
      const error = makeError(
        'alreadyAuthenticated',
        'An authenticated session is already active. Sign out before switching accounts.',
        false,
      )
      return { ok: false, state: this.state, error }
    }

    if (this.state.status === 'restoring' || this.state.status === 'signingOut') {
      const error = makeError(
        'operationInProgress',
        `Cannot sign in while state is '${this.state.status}'.`,
        true,
      )
      return { ok: false, state: this.state, error }
    }

    if (!request || !isValidAuthMethod(request.method)) {
      const error = makeError('invalidRequest', 'Unsupported authentication method.', false)
      return { ok: false, state: this.state, error }
    }

    if (request.method === 'emailOtp' && !isValidEmailInput(request.email)) {
      const error = makeError('invalidRequest', 'Please provide a valid email address.', false, 'invalidEmail')
      return { ok: false, state: this.state, error }
    }

    const previousState =
      this.state.status === 'expired' ? this.state : ({ status: 'guest' } as AccountSessionState)
    this.returnStateOnCancel = previousState
    const { epoch, signal, cleanup } = this.beginOperation(options?.signal)
    this.setState({ status: 'signingIn', method: request.method })

    try {
      const result = await this.provider.signIn(request, { signal })
      if (this.isStale(epoch)) {
        return {
          ok: false,
          state: this.state,
          error: makeError('cancelled', 'Sign-in was cancelled.', true),
        }
      }

      return await this.processSignInResult(result, request.method, previousState, options?.signal)
    } catch (err) {
      if (this.isStale(epoch)) {
        return {
          ok: false,
          state: this.state,
          error: makeError('cancelled', 'Sign-in was cancelled.', true),
        }
      }
      const message = err instanceof Error ? err.message : 'Unexpected sign-in failure.'
      const error = makeError('networkError', message, true)
      this.setState(
        previousState.status === 'expired'
          ? { ...previousState, lastError: error }
          : { status: 'guest', lastError: error },
      )
      return { ok: false, state: this.state, error }
    } finally {
      cleanup()
      this.clearActiveAbort(epoch)
    }
  }

  async verifyEmailOtp(
    request: VerifyEmailOtpRequest,
    options?: AuthOperationOptions,
  ): Promise<AuthActionOutcome> {
    if (this.state.status !== 'awaitingEmailOtp') {
      const error = makeError(
        'invalidRequest',
        'No email verification challenge is currently awaiting a code.',
        false,
      )
      return { ok: false, state: this.state, error }
    }

    const activeChallenge = this.state.challenge
    if (!request || request.challengeId !== activeChallenge.challengeId) {
      const error = makeError('invalidRequest', 'Verification challenge ID does not match active challenge.', false)
      return { ok: false, state: this.state, error }
    }

    if (!isValidSixDigitOtpCode(request.code)) {
      const error = makeError(
        'invalidRequest',
        'Verification code must be a 6-digit numeric code.',
        true,
        'invalidOtpCode',
      )
      this.setState({
        status: 'awaitingEmailOtp',
        challenge: activeChallenge,
        lastError: error,
      })
      return { ok: false, state: this.state, error }
    }

    const challengeResumeState: AccountSessionState = {
      status: 'awaitingEmailOtp',
      challenge: activeChallenge,
    }
    this.returnStateOnCancel = { status: 'guest' }
    const { epoch, signal, cleanup } = this.beginOperation(options?.signal)
    this.setState({ status: 'signingIn', method: 'emailOtp' })

    try {
      const result = await this.provider.verifyEmailOtp(
        { challengeId: request.challengeId, code: request.code.trim() },
        { signal },
      )
      if (this.isStale(epoch)) {
        return {
          ok: false,
          state: this.state,
          error: makeError('cancelled', 'Email verification was cancelled.', true),
        }
      }

      if (result.status === 'unauthorized' && result.reason !== 'challengeExpired') {
        const error = makeError('unauthorized', result.message, true, result.reason)
        this.setState({
          status: 'awaitingEmailOtp',
          challenge: activeChallenge,
          lastError: error,
        })
        return { ok: false, state: this.state, error }
      }

      if (result.status === 'networkError') {
        const error = makeError('networkError', result.message, result.retryable)
        this.setState({
          status: 'awaitingEmailOtp',
          challenge: activeChallenge,
          lastError: error,
        })
        return { ok: false, state: this.state, error }
      }

      return await this.processSignInResult(result, 'emailOtp', challengeResumeState, options?.signal)
    } catch (err) {
      if (this.isStale(epoch)) {
        return {
          ok: false,
          state: this.state,
          error: makeError('cancelled', 'Email verification was cancelled.', true),
        }
      }
      const message = err instanceof Error ? err.message : 'Unexpected OTP verification failure.'
      const error = makeError('networkError', message, true)
      this.setState({
        status: 'awaitingEmailOtp',
        challenge: activeChallenge,
        lastError: error,
      })
      return { ok: false, state: this.state, error }
    } finally {
      cleanup()
      this.clearActiveAbort(epoch)
    }
  }

  private async processSignInResult(
    result: AuthProviderSignInResult,
    method: AuthMethod,
    fallbackState: AccountSessionState,
    externalSignal?: AbortSignal,
  ): Promise<AuthActionOutcome> {
    switch (result.status) {
      case 'authenticated': {
        const checked = this.validateAndPromoteSession(result.session, method)
        if (!checked.ok) {
          logSafe(this.logger, 'warn', `Rejected sign-in session: ${checked.error.message}`)
          this.setState(checked.nextState)
          return { ok: false, state: this.state, error: checked.error }
        }
        return await this.finalizeAuthenticatedSession(checked.session, externalSignal)
      }
      case 'challengeRequired': {
        this.setState({
          status: 'awaitingEmailOtp',
          challenge: result.challenge,
        })
        return { ok: true, state: this.state }
      }
      case 'cancelled': {
        const error = makeError('cancelled', result.message, true)
        this.setState(
          fallbackState.status === 'expired'
            ? { ...fallbackState, lastError: error }
            : { status: 'guest', lastError: error },
        )
        return { ok: false, state: this.state, error }
      }
      case 'aborted': {
        const error = makeError('aborted', result.message, true)
        this.setState(
          fallbackState.status === 'expired'
            ? { ...fallbackState, lastError: error }
            : { status: 'guest', lastError: error },
        )
        return { ok: false, state: this.state, error }
      }
      case 'unauthorized': {
        const error = makeError('unauthorized', result.message, false, result.reason)
        this.setState(
          fallbackState.status === 'expired'
            ? { ...fallbackState, lastError: error }
            : { status: 'guest', lastError: error },
        )
        return { ok: false, state: this.state, error }
      }
      case 'networkError': {
        const error = makeError('networkError', result.message, result.retryable)
        this.setState(
          fallbackState.status === 'expired'
            ? { ...fallbackState, lastError: error }
            : { status: 'guest', lastError: error },
        )
        return { ok: false, state: this.state, error }
      }
    }
  }

  cancelSignIn(): AuthActionOutcome {
    if (
      this.state.status !== 'signingIn' &&
      this.state.status !== 'awaitingEmailOtp' &&
      this.state.status !== 'restoring'
    ) {
      return { ok: true, state: this.state }
    }

    this.operationEpoch += 1
    if (this.activeAbortController) {
      this.activeAbortController.abort('cancelled')
      this.activeAbortController = null
    }

    const error = makeError('cancelled', 'Sign-in flow cancelled by reader.', true)
    const target =
      this.returnStateOnCancel.status === 'expired'
        ? { ...this.returnStateOnCancel, lastError: error }
        : ({ status: 'guest', lastError: error } as AccountSessionState)

    this.setState(target)
    return { ok: false, state: this.state, error }
  }

  async recoverSession(options?: AuthOperationOptions): Promise<AuthActionOutcome> {
    if (this.state.status === 'authenticated' && !isSessionExpired(this.state.session, this.now())) {
      return { ok: true, state: this.state }
    }

    if (
      this.state.status === 'signingIn' ||
      this.state.status === 'restoring' ||
      this.state.status === 'signingOut'
    ) {
      const error = makeError(
        'operationInProgress',
        `Cannot recover session while state is '${this.state.status}'.`,
        true,
      )
      return { ok: false, state: this.state, error }
    }

    const previousState = this.state
    this.returnStateOnCancel = previousState
    const { epoch, signal, cleanup } = this.beginOperation(options?.signal)
    this.setState({ status: 'restoring' })

    try {
      const result = await this.provider.recoverSession({ signal })
      if (this.isStale(epoch)) {
        return {
          ok: false,
          state: this.state,
          error: makeError('cancelled', 'Session recovery was cancelled.', true),
        }
      }

      const handled = this.handleRestoreOutcome(result, previousState)
      if (handled.promoted) {
        return await this.finalizeAuthenticatedSession(handled.promoted, options?.signal)
      }
      return handled.outcome!
    } catch (err) {
      if (this.isStale(epoch)) {
        return {
          ok: false,
          state: this.state,
          error: makeError('cancelled', 'Session recovery was cancelled.', true),
        }
      }
      const message = err instanceof Error ? err.message : 'Unexpected session recovery failure.'
      const error = makeError('networkError', message, true)
      this.setState(
        previousState.status === 'expired'
          ? { ...previousState, lastError: error }
          : { status: 'guest', lastError: error },
      )
      return { ok: false, state: this.state, error }
    } finally {
      cleanup()
      this.clearActiveAbort(epoch)
    }
  }

  async signOut(options?: AuthOperationOptions): Promise<AuthActionOutcome> {
    const { epoch, signal, cleanup } = this.beginOperation(options?.signal)
    this.setState({ status: 'signingOut' })

    try {
      const result = await this.provider.signOut({ signal })
      if (this.isStale(epoch)) {
        return { ok: false, state: this.state }
      }

      if (result.status === 'networkError') {
        const error = makeError('networkError', result.message, result.retryable)
        logSafe(this.logger, 'warn', `Remote sign-out failed; local session cleared: ${result.message}`)
        this.setState({ status: 'guest', lastError: error })
        return { ok: true, state: this.state, error }
      }

      this.setState({ status: 'guest' })
      return { ok: true, state: this.state }
    } catch (err) {
      if (this.isStale(epoch)) {
        return { ok: false, state: this.state }
      }
      const message = err instanceof Error ? err.message : 'Sign-out encountered an error.'
      const error = makeError('networkError', message, true)
      this.setState({ status: 'guest', lastError: error })
      return { ok: true, state: this.state, error }
    } finally {
      cleanup()
      this.clearActiveAbort(epoch)
    }
  }

  async syncGuestToAccount(options?: SyncInvocationOptions): Promise<AuthActionOutcome> {
    if (this.state.status !== 'authenticated') {
      const error = makeError('invalidSession', 'Cannot sync guest data without an authenticated session.', false)
      return { ok: false, state: this.state, error }
    }

    const activeSession = this.state.session
    const check = validateVerifiedAuthSession(activeSession, this.now())
    if (!check.valid) {
      if (check.reason === 'expired') {
        const error = makeError('expired', check.message, true, 'sessionExpired')
        this.setState({
          status: 'expired',
          method: activeSession.method,
          reason: 'sessionExpired',
          lastError: error,
        })
        return { ok: false, state: this.state, error }
      }
      const error = makeError('unverifiedSession', check.message, false, check.reason)
      this.setState({ status: 'guest', lastError: error })
      return { ok: false, state: this.state, error }
    }

    if (!this.guest || !this.transport) {
      const error = makeError(
        'invalidRequest',
        'Guest storage accessor and authorized transport must be configured to invoke sync.',
        false,
      )
      return { ok: false, state: this.state, error }
    }

    const epoch = this.operationEpoch
    const { controller, cleanup } = linkAbortSignal(options?.signal)
    this.activeAbortController = controller

    this.setState({
      status: 'authenticated',
      session: check.session,
      syncStatus: 'syncing',
      lastSyncOutcome: this.state.lastSyncOutcome,
    })

    try {
      const syncOutcome: CoordinateGuestSyncOutcome = await coordinateGuestSync(
        this.transport,
        {
          session: toAuthorizedAccountSession(check.session),
          guest: this.guest,
          mode: options?.mode ?? this.defaultSyncOptions?.mode ?? 'auto',
          context: options?.context ?? this.defaultSyncOptions?.context,
        },
        {
          maxRetries: options?.maxRetries ?? this.defaultSyncOptions?.maxRetries,
          idempotencyKey: options?.idempotencyKey ?? this.defaultSyncOptions?.idempotencyKey,
          clearGuestStorageOnSuccess:
            options?.clearGuestStorageOnSuccess ?? this.defaultSyncOptions?.clearGuestStorageOnSuccess,
          logger: this.logger,
          signal: controller.signal,
        },
      )

      if (this.isStale(epoch) || this.state.status !== 'authenticated') {
        return {
          ok: false,
          state: this.state,
          error: makeError('aborted', 'Session changed while sync was in progress.', true),
          syncOutcome,
        }
      }

      if (syncOutcome.status === 'authFailure') {
        const error = makeError(
          'unauthorized',
          syncOutcome.message ?? 'Session authorization failed during account sync.',
          false,
          'authFailure',
        )
        this.setState({
          status: 'expired',
          method: check.session.method,
          reason: 'authFailure',
          lastError: error,
        })
        return { ok: false, state: this.state, error, syncOutcome }
      }

      if (syncOutcome.ok) {
        this.setState({
          status: 'authenticated',
          session: check.session,
          syncStatus: 'synced',
          lastSyncOutcome: syncOutcome,
        })
        return { ok: true, state: this.state, syncOutcome }
      }

      const retryable = syncOutcome.status === 'networkError' || syncOutcome.status === 'conflict'
      const error = makeError(
        syncOutcome.status === 'aborted' ? 'aborted' : 'syncFailed',
        syncOutcome.message ?? `Account sync did not complete (${syncOutcome.status}).`,
        retryable,
        syncOutcome.status,
      )
      this.setState({
        status: 'authenticated',
        session: check.session,
        syncStatus: 'syncFailed',
        lastSyncOutcome: syncOutcome,
        lastError: error,
      })
      return { ok: false, state: this.state, error, syncOutcome }
    } catch (err) {
      if (this.isStale(epoch) || this.state.status !== 'authenticated') {
        return {
          ok: false,
          state: this.state,
          error: makeError('aborted', 'Session changed while sync was in progress.', true),
        }
      }
      const message = err instanceof Error ? err.message : 'Unexpected error invoking guest sync.'
      const error = makeError('syncFailed', message, true)
      this.setState({
        status: 'authenticated',
        session: check.session,
        syncStatus: 'syncFailed',
        lastSyncOutcome: this.state.lastSyncOutcome,
        lastError: error,
      })
      return { ok: false, state: this.state, error }
    } finally {
      cleanup()
      this.clearActiveAbort(epoch)
    }
  }

  async retrySync(options?: SyncInvocationOptions): Promise<AuthActionOutcome> {
    return this.syncGuestToAccount(options)
  }
}

export function createAccountSessionController(
  provider: AuthProvider,
  options?: AccountSessionControllerOptions,
): AccountSessionController {
  return new AccountSessionController(provider, options)
}
