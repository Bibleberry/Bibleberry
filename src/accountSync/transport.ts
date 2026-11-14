import type {
  AccountId,
  CommitAckReceipt,
  ProposedAccountParticipationEnvelope,
  ReconciliationMode,
  UnresolvedReconciliationItem,
} from './types.ts'
import { parseAccountId } from './reconcile.ts'

// ---------------------------------------------------------------------------
// Privacy & Safe Logging Helpers (Strict No-PII / No Secrets Policy)
// ---------------------------------------------------------------------------

const UUID_REGEX = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi
const TOKEN_AUTH_REGEX = /\b(?:Bearer\s+|token\s*[:=]\s*)[a-zA-Z0-9_\-.]{6,}\b/gi

/**
 * Sanitizes log text so that no account IDs, bearer tokens, or secrets leak into
 * application or console logs.
 */
export function sanitizeLogMessage(message: string): string {
  if (typeof message !== 'string') return ''
  return message
    .replace(UUID_REGEX, '[REDACTED_ACCOUNT_ID]')
    .replace(TOKEN_AUTH_REGEX, '[REDACTED_TOKEN]')
}

/**
 * Masks an account ID for diagnostic purposes, returning a generic sanitized placeholder.
 */
export function maskAccountId(raw: unknown): string {
  if (typeof raw !== 'string' || !raw) return '[REDACTED_ACCOUNT_ID]'
  return '[REDACTED_ACCOUNT_ID]'
}

// ---------------------------------------------------------------------------
// Authorized Account Transport Contract
// ---------------------------------------------------------------------------

/**
 * Minimal authenticated session identity for authorized account sync.
 * Tokens and credentials remain opaque and are never exposed in log outputs.
 */
export interface AuthorizedAccountSession {
  readonly accountId: AccountId
  /** Optional opaque authorization bearer/ticket token. */
  readonly token?: string
  /** Optional expiry epoch ms. */
  readonly expiresAt?: number
}

export interface AccountFetchOptions {
  readonly signal?: AbortSignal
}

export type AccountTransportFetchResult =
  | {
      readonly status: 'found'
      readonly envelope: ProposedAccountParticipationEnvelope
      readonly revision: number
      readonly etag?: string
    }
  | {
      readonly status: 'notFound'
      readonly accountId: AccountId
    }
  | {
      readonly status: 'unauthorized'
      readonly reason: 'unauthenticated' | 'expiredToken' | 'accountMismatch' | 'forbidden'
      readonly message: string
    }
  | {
      readonly status: 'networkError'
      readonly retryable: boolean
      readonly message: string
    }
  | {
      readonly status: 'aborted'
      readonly message: string
    }

export interface AccountTransportCommitPayload {
  readonly accountId: AccountId
  /**
   * Expected revision for optimistic concurrency control.
   * `0` (or `null`/`undefined`) represents a brand-new account transfer.
   */
  readonly expectedRevision: number
  readonly envelope: ProposedAccountParticipationEnvelope
  readonly idempotencyKey: string
  readonly guestPayloadFingerprint: string
  readonly mode: ReconciliationMode
  readonly unresolvedItems?: readonly UnresolvedReconciliationItem[]
}

export interface AccountCommitOptions {
  readonly signal?: AbortSignal
}

export type AccountTransportCommitResult =
  | {
      readonly status: 'committed'
      readonly receipt: CommitAckReceipt
      readonly committedEnvelope: ProposedAccountParticipationEnvelope
    }
  | {
      readonly status: 'alreadyCommittedDuplicate'
      readonly receipt: CommitAckReceipt
      readonly committedEnvelope: ProposedAccountParticipationEnvelope
    }
  | {
      readonly status: 'conflict'
      readonly reason: 'revisionMismatch' | 'idempotencyPayloadMismatch'
      readonly currentRevision?: number
      readonly currentEnvelope?: ProposedAccountParticipationEnvelope
      readonly message: string
    }
  | {
      readonly status: 'unauthorized'
      readonly reason: 'unauthenticated' | 'expiredToken' | 'accountMismatch' | 'forbidden'
      readonly message: string
    }
  | {
      readonly status: 'rejected'
      readonly reason: 'invalidPayload' | 'schemaVersionMismatch' | 'unsupportedNamespace'
      readonly message: string
    }
  | {
      readonly status: 'networkError'
      readonly retryable: boolean
      readonly message: string
    }
  | {
      readonly status: 'aborted'
      readonly message: string
    }

/**
 * Narrow asynchronous boundary for account sync.
 * The account service is authoritative for authorized record ownership.
 */
export interface AuthorizedAccountTransport {
  getAccount(
    session: AuthorizedAccountSession,
    options?: AccountFetchOptions,
  ): Promise<AccountTransportFetchResult>

  commitAccount(
    session: AuthorizedAccountSession,
    payload: AccountTransportCommitPayload,
    options?: AccountCommitOptions,
  ): Promise<AccountTransportCommitResult>
}

// ---------------------------------------------------------------------------
// Mock Authorized Account Transport (Deterministic Test Implementation)
// ---------------------------------------------------------------------------

function cloneEnvelope(
  envelope: ProposedAccountParticipationEnvelope,
): ProposedAccountParticipationEnvelope {
  return JSON.parse(JSON.stringify(envelope)) as ProposedAccountParticipationEnvelope
}

export interface MockTransportFailureHooks {
  /** When true or returns true, `getAccount` fails with a network error. */
  fetchNetworkError?: boolean | ((session: AuthorizedAccountSession) => boolean)
  /** When true or returns true, `commitAccount` fails with a network error. */
  commitNetworkError?: boolean | ((payload: AccountTransportCommitPayload) => boolean)
  /** Simulate an authorization failure across requests. */
  authError?: 'unauthenticated' | 'expiredToken' | 'accountMismatch' | 'forbidden' | null
  /**
   * Inject a concurrent update on commit. When returning a non-null envelope,
   * the mock simulates another writer updating the account before this commit lands.
   */
  conflictOnCommit?:
    | boolean
    | ((
        payload: AccountTransportCommitPayload,
        current: ProposedAccountParticipationEnvelope | undefined,
      ) => ProposedAccountParticipationEnvelope | null)
  /** Control whether unresolved items are marked as persisted on the server receipt. Default true. */
  unresolvedPersistedOnServer?: boolean
}

export interface MockTransportOptions {
  readonly initialAccounts?: readonly ProposedAccountParticipationEnvelope[]
  readonly hooks?: MockTransportFailureHooks
}

export class MockAuthorizedAccountTransport implements AuthorizedAccountTransport {
  private readonly accounts = new Map<string, ProposedAccountParticipationEnvelope>()
  private readonly receipts = new Map<
    string,
    { receipt: CommitAckReceipt; envelope: ProposedAccountParticipationEnvelope }
  >()
  public hooks: MockTransportFailureHooks

  public commitCount = 0
  public fetchCount = 0

  constructor(options: MockTransportOptions = {}) {
    this.hooks = options.hooks ? { ...options.hooks } : {}
    if (options.initialAccounts) {
      for (const account of options.initialAccounts) {
        this.seedAccount(account)
      }
    }
  }

  public seedAccount(envelope: ProposedAccountParticipationEnvelope): void {
    const validId = parseAccountId(envelope.accountId)
    if (!validId) {
      throw new Error('Cannot seed account with invalid account ID')
    }
    this.accounts.set(validId, cloneEnvelope(envelope))
  }

  public getStoredAccount(accountId: AccountId): ProposedAccountParticipationEnvelope | undefined {
    const existing = this.accounts.get(accountId)
    return existing ? cloneEnvelope(existing) : undefined
  }

  public getStoredReceipt(
    accountId: AccountId,
    idempotencyKey: string,
  ): CommitAckReceipt | undefined {
    const record = this.receipts.get(`${accountId}::${idempotencyKey}`)
    return record ? { ...record.receipt } : undefined
  }

  public clearAll(): void {
    this.accounts.clear()
    this.receipts.clear()
    this.commitCount = 0
    this.fetchCount = 0
  }

  async getAccount(
    session: AuthorizedAccountSession,
    options?: AccountFetchOptions,
  ): Promise<AccountTransportFetchResult> {
    this.fetchCount++

    if (options?.signal?.aborted) {
      return { status: 'aborted', message: 'Account fetch aborted by client signal' }
    }

    if (!session || !parseAccountId(session.accountId)) {
      return {
        status: 'unauthorized',
        reason: 'accountMismatch',
        message: 'Invalid session account ID',
      }
    }

    if (this.hooks.authError) {
      return {
        status: 'unauthorized',
        reason: this.hooks.authError,
        message: sanitizeLogMessage(`Authorization rejected: ${this.hooks.authError}`),
      }
    }

    if (session.expiresAt !== undefined && session.expiresAt <= Date.now()) {
      return {
        status: 'unauthorized',
        reason: 'expiredToken',
        message: 'Session token has expired',
      }
    }

    const isNetworkFailure =
      typeof this.hooks.fetchNetworkError === 'function'
        ? this.hooks.fetchNetworkError(session)
        : Boolean(this.hooks.fetchNetworkError)
    if (isNetworkFailure) {
      return {
        status: 'networkError',
        retryable: true,
        message: 'Network transport failure during account fetch',
      }
    }

    const current = this.accounts.get(session.accountId)
    if (!current) {
      return { status: 'notFound', accountId: session.accountId }
    }

    return {
      status: 'found',
      envelope: cloneEnvelope(current),
      revision: current.revision,
      etag: `"${current.revision}"`,
    }
  }

  async commitAccount(
    session: AuthorizedAccountSession,
    payload: AccountTransportCommitPayload,
    options?: AccountCommitOptions,
  ): Promise<AccountTransportCommitResult> {
    this.commitCount++

    if (options?.signal?.aborted) {
      return { status: 'aborted', message: 'Account commit aborted by client signal' }
    }

    if (!session || !parseAccountId(session.accountId)) {
      return {
        status: 'unauthorized',
        reason: 'accountMismatch',
        message: 'Invalid session account ID',
      }
    }

    if (session.accountId !== payload.accountId) {
      return {
        status: 'unauthorized',
        reason: 'accountMismatch',
        message: 'Session account ID does not match commit account ID',
      }
    }

    if (this.hooks.authError) {
      return {
        status: 'unauthorized',
        reason: this.hooks.authError,
        message: sanitizeLogMessage(`Authorization rejected: ${this.hooks.authError}`),
      }
    }

    if (session.expiresAt !== undefined && session.expiresAt <= Date.now()) {
      return {
        status: 'unauthorized',
        reason: 'expiredToken',
        message: 'Session token has expired',
      }
    }

    const isNetworkFailure =
      typeof this.hooks.commitNetworkError === 'function'
        ? this.hooks.commitNetworkError(payload)
        : Boolean(this.hooks.commitNetworkError)
    if (isNetworkFailure) {
      return {
        status: 'networkError',
        retryable: true,
        message: 'Network transport failure during account commit',
      }
    }

    // Check for duplicate retry using idempotency key
    const receiptKey = `${payload.accountId}::${payload.idempotencyKey}`
    const existingReceipt = this.receipts.get(receiptKey)
    if (existingReceipt) {
      if (
        existingReceipt.receipt.committedGuestFingerprint === payload.guestPayloadFingerprint
      ) {
        return {
          status: 'alreadyCommittedDuplicate',
          receipt: { ...existingReceipt.receipt },
          committedEnvelope: cloneEnvelope(existingReceipt.envelope),
        }
      } else {
        return {
          status: 'conflict',
          reason: 'idempotencyPayloadMismatch',
          message:
            'Idempotency key was previously committed with a different guest payload fingerprint',
        }
      }
    }

    const current = this.accounts.get(payload.accountId)

    // Check conflict hook (simulating a race condition / concurrent writer)
    if (this.hooks.conflictOnCommit) {
      let concurrentEnvelope: ProposedAccountParticipationEnvelope | null = null
      if (typeof this.hooks.conflictOnCommit === 'function') {
        concurrentEnvelope = this.hooks.conflictOnCommit(payload, current)
      } else if (this.hooks.conflictOnCommit === true) {
        const base = current ?? cloneEnvelope(payload.envelope)
        concurrentEnvelope = {
          ...base,
          revision: (base.revision ?? 0) + 1,
        }
      }

      if (concurrentEnvelope) {
        this.accounts.set(payload.accountId, cloneEnvelope(concurrentEnvelope))
        return {
          status: 'conflict',
          reason: 'revisionMismatch',
          currentRevision: concurrentEnvelope.revision,
          currentEnvelope: cloneEnvelope(concurrentEnvelope),
          message: 'Optimistic concurrency conflict: account revision was modified by another writer',
        }
      }
    }

    // Revision check
    const currentRevision = current?.revision ?? 0
    const expectedRevision = payload.expectedRevision ?? 0

    if (currentRevision !== expectedRevision) {
      return {
        status: 'conflict',
        reason: 'revisionMismatch',
        currentRevision,
        currentEnvelope: current ? cloneEnvelope(current) : undefined,
        message: `Optimistic concurrency conflict: expected revision ${expectedRevision} but server has ${currentRevision}`,
      }
    }

    // Calculate durable next revision
    const nextRevision = currentRevision + 1
    const committedEnvelope: ProposedAccountParticipationEnvelope = {
      ...cloneEnvelope(payload.envelope),
      accountId: payload.accountId,
      revision: nextRevision,
    }

    const unresolvedPersisted = this.hooks.unresolvedPersistedOnServer !== false
    const receipt: CommitAckReceipt = {
      ok: true,
      status: 'committed',
      accountId: payload.accountId,
      idempotencyKey: payload.idempotencyKey,
      committedGuestFingerprint: payload.guestPayloadFingerprint,
      durableRevision: nextRevision,
      unresolvedCount: payload.unresolvedItems?.length ?? 0,
      unresolvedPersistedOnServer: unresolvedPersisted,
    }

    this.accounts.set(payload.accountId, committedEnvelope)
    this.receipts.set(receiptKey, {
      receipt,
      envelope: committedEnvelope,
    })

    return {
      status: 'committed',
      receipt,
      committedEnvelope,
    }
  }
}

export function createMockAuthorizedAccountTransport(
  options?: MockTransportOptions,
): MockAuthorizedAccountTransport {
  return new MockAuthorizedAccountTransport(options)
}
