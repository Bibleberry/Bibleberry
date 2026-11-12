import type {
  CommitAckReceipt,
  GuestClearanceDecision,
  GuestReconciliationInput,
  ProposedAccountParticipationEnvelope,
  ReconciliationContext,
  ReconciliationMode,
  ReconciliationResult,
} from './types.ts'
import {
  canSafelyClearGuestStorage,
  computeGuestPayloadFingerprint,
  createEmptyAccountEnvelope,
  parseAccountId,
  reconcileGuestIntoAccount,
} from './reconcile.ts'
import type {
  AccountTransportCommitPayload,
  AuthorizedAccountSession,
  AuthorizedAccountTransport,
} from './transport.ts'
import { sanitizeLogMessage } from './transport.ts'

// ---------------------------------------------------------------------------
// Storage & Accessor Contracts
// ---------------------------------------------------------------------------

/**
 * Pluggable accessor for reading and safely acknowledging local guest participation storage.
 */
export interface GuestStorageAccessor {
  /** Retrieves the latest durable guest participation snapshot. */
  getSnapshot(): Promise<GuestReconciliationInput> | GuestReconciliationInput
  /**
   * Invoked ONLY when `canSafelyClearGuestStorage` has verified a durable remote commit.
   * Returns true if storage was safely cleared or transitioned.
   */
  clearGuestStorage?(decision: GuestClearanceDecision): Promise<boolean> | boolean
}

/** Optional privacy-safe logger. Account IDs and secrets are always masked. */
export interface SyncLogger {
  debug?(message: string): void
  info?(message: string): void
  warn?(message: string): void
  error?(message: string): void
}

function logSafe(logger: SyncLogger | undefined, level: keyof SyncLogger, message: string): void {
  if (!logger) return
  const fn = logger[level]
  if (typeof fn === 'function') {
    fn(sanitizeLogMessage(message))
  }
}

// ---------------------------------------------------------------------------
// Coordinator Input & Outcome Contracts
// ---------------------------------------------------------------------------

export interface CoordinateGuestSyncInput {
  readonly session: AuthorizedAccountSession
  readonly guest: GuestReconciliationInput | GuestStorageAccessor
  /**
   * Reconciliation mode.
   * - `'newAccountTransfer'`: Transfer guest into fresh account (fails if account has prior data).
   * - `'existingAccountMerge'`: Merge guest into existing account (fails if account not found).
   * - `'auto'`: Inspects remote state; uses newAccountTransfer if target is fresh/empty, else existingAccountMerge.
   */
  readonly mode?: ReconciliationMode | 'auto'
  readonly context?: Partial<ReconciliationContext>
}

export interface CoordinateGuestSyncOptions {
  /** Maximum retry attempts for transient concurrency conflicts or network drops. Default: 3. */
  readonly maxRetries?: number
  /** Client-provided idempotency key for network-drop recovery. Auto-generated if omitted. */
  readonly idempotencyKey?: string
  /** Cancellation signal. */
  readonly signal?: AbortSignal
  /** Optional privacy-safe logger. */
  readonly logger?: SyncLogger
  /**
   * Whether to clear guest storage when `canSafelyClearGuestStorage` verifies safety.
   * Default: true.
   */
  readonly clearGuestStorageOnSuccess?: boolean
}

export type CoordinateGuestSyncStatus =
  | 'committed'
  | 'alreadyCommittedDuplicate'
  | 'conflict'
  | 'authFailure'
  | 'networkError'
  | 'reconciliationRejected'
  | 'aborted'
  | 'invalidSession'

export interface CoordinateGuestSyncOutcome {
  readonly ok: boolean
  readonly status: CoordinateGuestSyncStatus
  readonly mode?: ReconciliationMode
  readonly attempts: number
  readonly committedRevision?: number
  readonly reconciliation?: ReconciliationResult
  readonly receipt?: CommitAckReceipt
  readonly guestClearanceDecision?: GuestClearanceDecision
  readonly guestCleared: boolean
  readonly message?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function isAccountEmpty(envelope: ProposedAccountParticipationEnvelope): boolean {
  const data = envelope.data
  if (!data) return true
  const hasCompleted = Object.keys(data.completedChallenges ?? {}).length > 0
  const hasInProgress = Object.keys(data.inProgressChallenges ?? {}).length > 0
  const hasSavedChallenges = Object.keys(data.savedChallenges ?? {}).length > 0
  const hasSavedScriptures = (data.savedScriptures ?? []).length > 0
  const hasAwards = Object.keys(data.earnedAwards ?? {}).length > 0
  const hasShelf = (data.shelf?.months ?? []).length > 0
  const hasLastOpened = Boolean(data.lastOpenedChallenge)
  return (
    !hasCompleted &&
    !hasInProgress &&
    !hasSavedChallenges &&
    !hasSavedScriptures &&
    !hasAwards &&
    !hasShelf &&
    !hasLastOpened
  )
}

let idempotencyCounter = 0

/**
 * Deterministically generates a unique, platform-neutral idempotency key for a sync attempt.
 */
export function generateSyncIdempotencyKey(guestFingerprint?: string): string {
  const prefix = guestFingerprint ? guestFingerprint.slice(0, 16) : 'guest'
  idempotencyCounter = (idempotencyCounter + 1) % 1_000_000
  return `sync_${prefix}_${Date.now()}_${idempotencyCounter}`
}

function isStorageAccessor(
  candidate: GuestReconciliationInput | GuestStorageAccessor,
): candidate is GuestStorageAccessor {
  return typeof (candidate as GuestStorageAccessor).getSnapshot === 'function'
}

// ---------------------------------------------------------------------------
// Main Orchestration Function & Coordinator Class
// ---------------------------------------------------------------------------

export async function coordinateGuestSync(
  transport: AuthorizedAccountTransport,
  input: CoordinateGuestSyncInput,
  options: CoordinateGuestSyncOptions = {},
): Promise<CoordinateGuestSyncOutcome> {
  const { session, guest, mode = 'auto', context } = input
  const { maxRetries = 3, signal, logger, clearGuestStorageOnSuccess = true } = options

  // 1. Session verification (Strict account ID parsing)
  const validAccountId = parseAccountId(session?.accountId)
  if (!validAccountId) {
    logSafe(logger, 'error', 'Session rejected: invalid or missing account ID')
    return {
      ok: false,
      status: 'invalidSession',
      attempts: 0,
      guestCleared: false,
      message: 'Invalid or missing session account ID',
    }
  }

  // 2. Obtain initial guest snapshot & calculate canonical fingerprint
  let storageAccessor: GuestStorageAccessor | undefined
  let initialGuestSnapshot: GuestReconciliationInput

  if (isStorageAccessor(guest)) {
    storageAccessor = guest
    initialGuestSnapshot = await guest.getSnapshot()
  } else {
    initialGuestSnapshot = guest
  }

  const initialGuestFingerprint = computeGuestPayloadFingerprint(initialGuestSnapshot)
  const idempotencyKey = options.idempotencyKey ?? generateSyncIdempotencyKey(initialGuestFingerprint)

  let attempt = 0

  while (attempt < maxRetries) {
    attempt++

    if (signal?.aborted) {
      logSafe(logger, 'warn', 'Sync cancelled by abort signal')
      return {
        ok: false,
        status: 'aborted',
        attempts: attempt,
        guestCleared: false,
        message: 'Sync aborted by client signal',
      }
    }

    // 3. Fetch remote account state
    logSafe(logger, 'debug', `Fetching remote account status for sync attempt ${attempt}`)
    const fetchRes = await transport.getAccount(session, { signal })

    if (fetchRes.status === 'aborted') {
      return {
        ok: false,
        status: 'aborted',
        attempts: attempt,
        guestCleared: false,
        message: fetchRes.message,
      }
    }

    if (fetchRes.status === 'unauthorized') {
      logSafe(logger, 'error', `Remote authorization failed: ${fetchRes.reason}`)
      return {
        ok: false,
        status: 'authFailure',
        attempts: attempt,
        guestCleared: false,
        message: fetchRes.message,
      }
    }

    if (fetchRes.status === 'networkError') {
      logSafe(logger, 'warn', `Network failure on account fetch: ${fetchRes.message}`)
      if (fetchRes.retryable && attempt < maxRetries) {
        continue
      }
      return {
        ok: false,
        status: 'networkError',
        attempts: attempt,
        guestCleared: false,
        message: fetchRes.message,
      }
    }

    // 4. Determine effective reconciliation mode & baseline envelope
    let effectiveMode: ReconciliationMode
    let targetAccountEnvelope: ProposedAccountParticipationEnvelope
    let expectedRevision: number

    if (mode === 'newAccountTransfer') {
      effectiveMode = 'newAccountTransfer'
      if (fetchRes.status === 'found') {
        if (!isAccountEmpty(fetchRes.envelope)) {
          logSafe(logger, 'error', 'Target account already contains data; rejecting newAccountTransfer')
          return {
            ok: false,
            status: 'reconciliationRejected',
            mode: effectiveMode,
            attempts: attempt,
            guestCleared: false,
            message: 'Target account already contains records; cannot perform newAccountTransfer',
          }
        }
        targetAccountEnvelope = fetchRes.envelope
        expectedRevision = fetchRes.revision
      } else {
        targetAccountEnvelope = createEmptyAccountEnvelope({
          accountId: validAccountId,
          namespace: context?.expectedNamespace ?? 'cms',
        })
        expectedRevision = 0
      }
    } else if (mode === 'existingAccountMerge') {
      effectiveMode = 'existingAccountMerge'
      if (fetchRes.status === 'notFound') {
        logSafe(logger, 'error', 'Account not found for existingAccountMerge')
        return {
          ok: false,
          status: 'reconciliationRejected',
          mode: effectiveMode,
          attempts: attempt,
          guestCleared: false,
          message: 'Account not found for existingAccountMerge',
        }
      }
      targetAccountEnvelope = fetchRes.envelope
      expectedRevision = fetchRes.revision
    } else {
      // mode === 'auto'
      if (fetchRes.status === 'notFound' || isAccountEmpty(fetchRes.envelope)) {
        effectiveMode = 'newAccountTransfer'
        targetAccountEnvelope =
          fetchRes.status === 'found'
            ? fetchRes.envelope
            : createEmptyAccountEnvelope({
                accountId: validAccountId,
                namespace: context?.expectedNamespace ?? 'cms',
              })
        expectedRevision = fetchRes.status === 'found' ? fetchRes.revision : 0
      } else {
        effectiveMode = 'existingAccountMerge'
        targetAccountEnvelope = fetchRes.envelope
        expectedRevision = fetchRes.revision
      }
    }

    // 5. Execute pure deterministic reconciliation
    const reconciliation = reconcileGuestIntoAccount({
      mode: effectiveMode,
      guest: initialGuestSnapshot,
      account: targetAccountEnvelope,
      context: {
        expectedAccountId: validAccountId,
        expectedNamespace: 'cms',
        idempotencyKey,
        ...context,
      },
    })

    if (!reconciliation.ok) {
      logSafe(logger, 'error', `Reconciliation rejected: ${reconciliation.reason}`)
      return {
        ok: false,
        status: 'reconciliationRejected',
        mode: effectiveMode,
        attempts: attempt,
        guestCleared: false,
        reconciliation,
        message: reconciliation.message,
      }
    }

    // 6. Compare-and-commit to authorized transport
    const commitPayload: AccountTransportCommitPayload = {
      accountId: validAccountId,
      expectedRevision,
      envelope: reconciliation.mergedAccount,
      idempotencyKey,
      guestPayloadFingerprint: reconciliation.guestPayloadFingerprint,
      mode: effectiveMode,
      unresolvedItems: reconciliation.unresolvedItems,
    }

    logSafe(logger, 'debug', `Submitting commit payload at revision ${expectedRevision}`)
    const commitRes = await transport.commitAccount(session, commitPayload, { signal })

    if (commitRes.status === 'aborted') {
      return {
        ok: false,
        status: 'aborted',
        attempts: attempt,
        guestCleared: false,
        message: commitRes.message,
      }
    }

    if (commitRes.status === 'unauthorized') {
      logSafe(logger, 'error', `Commit rejected: authorization failure (${commitRes.reason})`)
      return {
        ok: false,
        status: 'authFailure',
        mode: effectiveMode,
        attempts: attempt,
        guestCleared: false,
        message: commitRes.message,
      }
    }

    if (commitRes.status === 'conflict') {
      logSafe(logger, 'warn', `Commit conflict encountered: ${commitRes.reason}`)
      if (attempt < maxRetries) {
        // Concurrency conflict: retry loop to fetch latest state and re-merge
        continue
      }
      return {
        ok: false,
        status: 'conflict',
        mode: effectiveMode,
        attempts: attempt,
        guestCleared: false,
        message: commitRes.message,
      }
    }

    if (commitRes.status === 'networkError') {
      logSafe(logger, 'warn', `Network failure on commit: ${commitRes.message}`)
      if (commitRes.retryable && attempt < maxRetries) {
        // Retry commit with same idempotency key
        continue
      }
      return {
        ok: false,
        status: 'networkError',
        mode: effectiveMode,
        attempts: attempt,
        guestCleared: false,
        message: commitRes.message,
      }
    }

    if (commitRes.status === 'rejected') {
      logSafe(logger, 'error', `Commit rejected by server: ${commitRes.message}`)
      return {
        ok: false,
        status: 'reconciliationRejected',
        mode: effectiveMode,
        attempts: attempt,
        guestCleared: false,
        message: commitRes.message,
      }
    }

    // 7. Successful commit (committed or alreadyCommittedDuplicate) -> safe guest clearance verification
    let currentGuestFingerprint = initialGuestFingerprint
    if (storageAccessor && typeof storageAccessor.getSnapshot === 'function') {
      const currentGuestSnapshot = await storageAccessor.getSnapshot()
      currentGuestFingerprint = computeGuestPayloadFingerprint(currentGuestSnapshot)
    }

    const clearanceDecision = canSafelyClearGuestStorage({
      expectedAccountId: validAccountId,
      expectedIdempotencyKey: idempotencyKey,
      expectedGuestFingerprint: reconciliation.guestPayloadFingerprint,
      currentGuestFingerprint,
      reconciliation,
      receipt: commitRes.receipt,
    })

    let guestCleared = false
    if (clearanceDecision.shouldClearGuestStorage && clearGuestStorageOnSuccess) {
      if (storageAccessor && typeof storageAccessor.clearGuestStorage === 'function') {
        const cleared = await storageAccessor.clearGuestStorage(clearanceDecision)
        guestCleared = Boolean(cleared)
      }
    }

    logSafe(
      logger,
      'info',
      `Sync successful (status: ${commitRes.status}). Guest cleared: ${guestCleared}, clearance decision: ${clearanceDecision.reason}`,
    )

    return {
      ok: true,
      status: commitRes.status,
      mode: effectiveMode,
      attempts: attempt,
      committedRevision: commitRes.receipt.durableRevision,
      reconciliation,
      receipt: commitRes.receipt,
      guestClearanceDecision: clearanceDecision,
      guestCleared,
    }
  }

  // Max retries exceeded
  return {
    ok: false,
    status: 'conflict',
    attempts: attempt,
    guestCleared: false,
    message: 'Max retries exceeded while resolving concurrent updates',
  }
}

export class GuestToAccountSyncCoordinator {
  private readonly transport: AuthorizedAccountTransport

  constructor(transport: AuthorizedAccountTransport) {
    this.transport = transport
  }

  public sync(
    input: CoordinateGuestSyncInput,
    options?: CoordinateGuestSyncOptions,
  ): Promise<CoordinateGuestSyncOutcome> {
    return coordinateGuestSync(this.transport, input, options)
  }
}
