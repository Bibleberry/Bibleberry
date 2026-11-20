import type {
  AccountId,
  CoordinateGuestSyncOutcome,
  GuestReconciliationInput,
  GuestStorageAccessor,
  ReconciliationContext,
  ReconciliationMode,
  SyncLogger,
  AuthorizedAccountTransport,
} from '../accountSync/index.ts'

/**
 * Approved future authentication methods per Bibleberry R13-2A / user-accounts-and-sync.md.
 * - `google`: Continue with Google
 * - `apple`: Continue with Apple
 * - `emailOtp`: Continue with passwordless 6-digit email verification code
 */
export type AuthMethod = 'google' | 'apple' | 'emailOtp'

/**
 * Explicit server verification tag. The session controller refuses to promote any
 * session whose `verificationSource` is not `'serverVerified'`, ensuring client-supplied
 * account IDs or unverified tokens are never treated as server authority.
 */
export type SessionVerificationSource = 'serverVerified'

/**
 * Server-verified authenticated session returned by an `AuthProvider`.
 */
export interface VerifiedAuthSession {
  readonly accountId: AccountId
  readonly method: AuthMethod
  readonly verificationSource: SessionVerificationSource
  /** Opaque authorization token; never logged or exposed in diagnostics. */
  readonly token?: string
  /** Optional session expiry timestamp in epoch milliseconds. */
  readonly expiresAt?: number
  /** Optional session issuance timestamp in epoch milliseconds. */
  readonly issuedAt?: number
  /**
   * Advisory hint from the auth provider indicating whether the account was just created.
   * Sync mode selection in `'auto'` mode still relies on authoritative remote account state.
   */
  readonly isNewAccount?: boolean
}

/**
 * Pending 6-digit passwordless email verification challenge.
 */
export interface EmailOtpChallenge {
  readonly challengeId: string
  readonly method: 'emailOtp'
  /** Optional masked email destination for display (e.g. `a***@example.com`). */
  readonly maskedDestination?: string
  readonly expiresAt?: number
}

export type AuthSignInRequest =
  | {
      readonly method: 'google'
      readonly redirectUri?: string
    }
  | {
      readonly method: 'apple'
      readonly redirectUri?: string
    }
  | {
      readonly method: 'emailOtp'
      readonly email: string
    }

export interface VerifyEmailOtpRequest {
  readonly challengeId: string
  readonly code: string
}

export interface AuthOperationOptions {
  readonly signal?: AbortSignal
}

export type AuthUnauthorizedReason =
  | 'invalidCredentials'
  | 'invalidEmail'
  | 'invalidOtpCode'
  | 'challengeExpired'
  | 'accountDisabled'
  | 'unverifiedAccount'
  | 'invalidToken'
  | 'revoked'
  | 'rateLimited'
  /** The requested method is approved for the future but not implemented by this provider (R13-2B: Google/Apple). */
  | 'unsupportedMethod'

export type AuthProviderRestoreResult =
  | { readonly status: 'guest' }
  | { readonly status: 'authenticated'; readonly session: VerifiedAuthSession }
  | {
      readonly status: 'expired'
      readonly reason: 'sessionExpired' | 'refreshFailed'
      readonly method?: AuthMethod
      readonly message: string
    }
  | {
      readonly status: 'unauthorized'
      readonly reason: AuthUnauthorizedReason
      readonly message: string
    }
  | { readonly status: 'networkError'; readonly retryable: boolean; readonly message: string }
  | { readonly status: 'aborted'; readonly message: string }

export type AuthProviderSignInResult =
  | { readonly status: 'authenticated'; readonly session: VerifiedAuthSession }
  | { readonly status: 'challengeRequired'; readonly challenge: EmailOtpChallenge }
  | { readonly status: 'cancelled'; readonly message: string }
  | {
      readonly status: 'unauthorized'
      readonly reason: AuthUnauthorizedReason
      readonly message: string
    }
  | { readonly status: 'networkError'; readonly retryable: boolean; readonly message: string }
  | { readonly status: 'aborted'; readonly message: string }

export type AuthProviderSignOutResult =
  | { readonly status: 'signedOut' }
  | { readonly status: 'networkError'; readonly retryable: boolean; readonly message: string }
  | { readonly status: 'aborted'; readonly message: string }

// ---------------------------------------------------------------------------
// Session State Machine & Controller Contracts
// ---------------------------------------------------------------------------

export type AccountSyncLifecycleStatus = 'idle' | 'syncing' | 'synced' | 'syncFailed'

export type AuthControllerErrorCode =
  | 'unauthorized'
  | 'expired'
  | 'networkError'
  | 'cancelled'
  | 'aborted'
  | 'unverifiedSession'
  | 'invalidSession'
  | 'invalidRequest'
  | 'signInAlreadyInProgress'
  | 'alreadyAuthenticated'
  | 'operationInProgress'
  | 'syncFailed'

export interface AuthControllerError {
  readonly code: AuthControllerErrorCode
  readonly retryable: boolean
  readonly message: string
  readonly reason?: string
}

export type AccountSessionState =
  | {
      readonly status: 'guest'
      readonly lastSyncOutcome?: CoordinateGuestSyncOutcome
      readonly lastError?: AuthControllerError
    }
  | {
      readonly status: 'restoring'
    }
  | {
      readonly status: 'signingIn'
      readonly method: AuthMethod
    }
  | {
      readonly status: 'awaitingEmailOtp'
      readonly challenge: EmailOtpChallenge
      readonly lastError?: AuthControllerError
    }
  | {
      readonly status: 'authenticated'
      readonly session: VerifiedAuthSession
      readonly syncStatus: AccountSyncLifecycleStatus
      readonly lastSyncOutcome?: CoordinateGuestSyncOutcome
      readonly lastError?: AuthControllerError
    }
  | {
      readonly status: 'expired'
      readonly method?: AuthMethod
      readonly reason: string
      readonly lastError: AuthControllerError
    }
  | {
      readonly status: 'signingOut'
    }

export interface SyncInvocationOptions {
  readonly mode?: ReconciliationMode | 'auto'
  readonly context?: Partial<ReconciliationContext>
  readonly maxRetries?: number
  readonly idempotencyKey?: string
  readonly clearGuestStorageOnSuccess?: boolean
  readonly signal?: AbortSignal
}

export interface AccountSessionControllerOptions {
  /** Optional guest participation source for post-auth sync invocation. */
  readonly guest?: GuestReconciliationInput | GuestStorageAccessor
  /** Optional authorized transport for R13-1 guest-to-account sync orchestration. */
  readonly transport?: AuthorizedAccountTransport
  /** Whether to automatically invoke guest-to-account sync upon authentication. Default: true when guest+transport are provided. */
  readonly autoSyncOnSignIn?: boolean
  /** Default sync options applied when auto-syncing. */
  readonly defaultSyncOptions?: Omit<SyncInvocationOptions, 'signal'>
  /** Optional privacy-safe logger (UUIDs and tokens are always masked). */
  readonly logger?: SyncLogger
  /** Optional clock override for deterministic expiration tests. */
  readonly now?: () => number
}

export interface AuthActionOutcome {
  readonly ok: boolean
  readonly state: AccountSessionState
  readonly error?: AuthControllerError
  readonly syncOutcome?: CoordinateGuestSyncOutcome
}
