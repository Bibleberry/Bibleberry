import type {
  AccountTransportCommitPayload,
  AccountTransportCommitResult,
  AccountTransportFetchResult,
  AuthorizedAccountSession,
  AuthorizedAccountTransport,
} from './transport.ts'
import { parseAccountId } from './reconcile.ts'
import type { CommitAckReceipt, ProposedAccountParticipationEnvelope } from './types.ts'

export type SupabaseFetch = typeof fetch

export interface SupabasePostgrestTransportOptions {
  /** Supabase project URL. Non-loopback endpoints must use HTTPS. */
  readonly url: string
  /** Publishable/anon project key. Never use a service-role or secret key here. */
  readonly apiKey: string
  readonly fetch?: SupabaseFetch
  readonly timeoutMs?: number
  readonly now?: () => number
  readonly logger?: (message: string) => void
}

type JsonObject = Record<string, unknown>

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function safeLog(logger: SupabasePostgrestTransportOptions['logger'], message: string): void {
  logger?.(message.replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, '[REDACTED_ACCOUNT_ID]'))
}

function validateBaseUrl(raw: string): string {
  const parsed = new URL(raw)
  const loopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '[::1]'
  if (parsed.protocol !== 'https:' && !loopback) throw new TypeError('Supabase endpoint must use HTTPS')
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new TypeError('Supabase endpoint must not contain credentials or query parameters')
  }
  return parsed.toString().replace(/\/$/, '')
}

function validEnvelope(value: unknown, expectedAccountId: string): value is ProposedAccountParticipationEnvelope {
  if (!isObject(value)) return false
  const data = value.data
  if (
    value.schemaVersion !== 1 || value.accountId !== expectedAccountId || value.namespace !== 'cms' ||
    !Number.isSafeInteger(value.revision) || Number(value.revision) < 0 || !isObject(data)
  ) return false
  if (!isObject(data.completedChallenges) || !isObject(data.inProgressChallenges) ||
      !isObject(data.savedChallenges) || !Array.isArray(data.savedScriptures) ||
      !(data.lastOpenedChallenge === null || isObject(data.lastOpenedChallenge)) ||
      !isObject(data.earnedAwards)) return false
  if (data.shelf !== undefined) {
    if (!isObject(data.shelf) || !Array.isArray(data.shelf.months)) return false
    for (const month of data.shelf.months) {
      if (!isObject(month) || typeof month.yearMonth !== 'string' ||
          !['readerSelected', 'autoAdmitted'].includes(String(month.admissionKind)) ||
          (month.isProtected !== undefined && typeof month.isProtected !== 'boolean')) return false
    }
  }
  return true
}

function parseReceipt(value: unknown): CommitAckReceipt | null {
  if (!isObject(value) || value.ok !== true ||
      !['committed', 'alreadyCommittedDuplicate'].includes(String(value.status)) ||
      typeof value.accountId !== 'string' || typeof value.idempotencyKey !== 'string' ||
      typeof value.committedGuestFingerprint !== 'string' || !Number.isSafeInteger(value.durableRevision) ||
      !Number.isSafeInteger(value.unresolvedCount) || typeof value.unresolvedPersistedOnServer !== 'boolean') return null
  return value as unknown as CommitAckReceipt
}

function unauthorizedReason(value: unknown): 'unauthenticated' | 'expiredToken' | 'accountMismatch' | 'forbidden' {
  if (value === 'accountMismatch') return 'accountMismatch'
  if (value === 'forbidden') return 'forbidden'
  if (value === 'expiredToken') return 'expiredToken'
  return 'unauthenticated'
}

function isPrivilegedProjectKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true
  const parts = key.split('.')
  if (parts.length !== 3) return false
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const claims = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '='))) as { role?: unknown }
    return claims.role === 'service_role'
  } catch {
    return false
  }
}

export class SupabasePostgrestTransport implements AuthorizedAccountTransport {
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly requestFetch: SupabaseFetch
  private readonly timeoutMs: number
  private readonly now: () => number
  private readonly logger?: SupabasePostgrestTransportOptions['logger']

  constructor(options: SupabasePostgrestTransportOptions) {
    if (!options.apiKey || isPrivilegedProjectKey(options.apiKey)) {
      throw new TypeError('A Supabase publishable/anon project key is required')
    }
    this.baseUrl = validateBaseUrl(options.url)
    this.apiKey = options.apiKey
    this.requestFetch = options.fetch ?? fetch
    this.timeoutMs = options.timeoutMs ?? 15_000
    this.now = options.now ?? (() => Date.now())
    this.logger = options.logger
  }

  async getAccount(session: AuthorizedAccountSession, options: { signal?: AbortSignal } = {}): Promise<AccountTransportFetchResult> {
    const validation = this.validateSession(session)
    if (validation) return validation
    const result = await this.request('get_account_participation', {}, session, options.signal)
    if (result.kind === 'aborted') return { status: 'aborted', message: 'Account request was aborted.' }
    if (result.kind === 'network') return { status: 'networkError', retryable: result.retryable, message: result.message }
    if (result.kind === 'http') {
      if (result.status === 401 || result.status === 403) return { status: 'unauthorized', reason: result.status === 403 ? 'forbidden' : 'unauthenticated', message: 'Account authorization failed.' }
      return { status: 'networkError', retryable: result.status >= 500, message: 'Account service request failed.' }
    }
    const body = result.body
    if (!isObject(body)) return { status: 'networkError', retryable: false, message: 'Account service returned an invalid response.' }
    if (body.status === 'notFound') return { status: 'notFound', accountId: session.accountId }
    if (body.status === 'unauthorized') return { status: 'unauthorized', reason: unauthorizedReason(body.reason), message: 'Account authorization failed.' }
    if (body.status !== 'found' || !Number.isSafeInteger(body.revision) || Number(body.revision) < 0 ||
        !validEnvelope(body.envelope, session.accountId) || body.envelope.revision !== body.revision) {
      return { status: 'networkError', retryable: false, message: 'Account service returned an invalid account snapshot.' }
    }
    return { status: 'found', envelope: body.envelope, revision: Number(body.revision) }
  }

  async commitAccount(session: AuthorizedAccountSession, payload: AccountTransportCommitPayload, options: { signal?: AbortSignal } = {}): Promise<AccountTransportCommitResult> {
    const validation = this.validateSession(session)
    if (validation) return validation
    if (payload.accountId !== session.accountId || payload.envelope.accountId !== session.accountId) {
      return { status: 'unauthorized', reason: 'accountMismatch', message: 'Account identity does not match the authenticated session.' }
    }
    const rpcPayload = {
      accountId: payload.accountId,
      expectedRevision: payload.expectedRevision,
      envelope: payload.envelope,
      idempotencyKey: payload.idempotencyKey,
      guestPayloadFingerprint: payload.guestPayloadFingerprint,
      mode: payload.mode,
      unresolvedItems: payload.unresolvedItems ?? [],
    }
    const result = await this.request('reconcile_guest_participation', { p_payload: rpcPayload }, session, options.signal)
    if (result.kind === 'aborted') return { status: 'aborted', message: 'Account request was aborted.' }
    if (result.kind === 'network') return { status: 'networkError', retryable: result.retryable, message: result.message }
    if (result.kind === 'http') {
      if (result.status === 401 || result.status === 403) return { status: 'unauthorized', reason: result.status === 403 ? 'forbidden' : 'unauthenticated', message: 'Account authorization failed.' }
      return { status: 'networkError', retryable: result.status >= 500, message: 'Account service request failed.' }
    }
    const body = result.body
    if (!isObject(body)) return { status: 'networkError', retryable: false, message: 'Account service returned an invalid response.' }
    if (body.status === 'unauthorized') return { status: 'unauthorized', reason: unauthorizedReason(body.reason), message: 'Account authorization failed.' }
    if (body.status === 'conflict') {
      if (body.reason === 'revisionMismatch') {
        const currentEnvelope = body.currentEnvelope
        const currentRevision = body.currentRevision
        if (currentEnvelope !== undefined && !validEnvelope(currentEnvelope, session.accountId)) return { status: 'rejected', reason: 'invalidPayload', message: 'Account service returned an invalid conflict snapshot.' }
        return { status: 'conflict', reason: 'revisionMismatch', ...(Number.isSafeInteger(currentRevision) ? { currentRevision: Number(currentRevision) } : {}), ...(currentEnvelope ? { currentEnvelope: currentEnvelope as ProposedAccountParticipationEnvelope } : {}), message: typeof body.message === 'string' ? body.message : 'Account revision changed.' }
      }
      if (body.reason === 'idempotencyPayloadMismatch') return { status: 'conflict', reason: 'idempotencyPayloadMismatch', message: typeof body.message === 'string' ? body.message : 'Idempotency key was already used for another guest payload.' }
      return { status: 'rejected', reason: 'invalidPayload', message: 'Account service returned an unknown conflict.' }
    }
    if (body.status === 'rejected') {
      const reason = body.reason === 'schemaVersionMismatch' ? 'schemaVersionMismatch' : body.reason === 'unsupportedNamespace' ? 'unsupportedNamespace' : 'invalidPayload'
      return { status: 'rejected', reason, message: typeof body.message === 'string' ? body.message : 'Account commit was rejected.' }
    }
    if (body.status !== 'committed' && body.status !== 'alreadyCommittedDuplicate') {
      return { status: 'networkError', retryable: false, message: 'Account service returned an unknown commit status.' }
    }
    const receipt = parseReceipt(body.receipt)
    const envelope = body.committedEnvelope
    if (!receipt || receipt.status !== body.status || receipt.accountId !== session.accountId ||
        receipt.idempotencyKey !== payload.idempotencyKey || receipt.committedGuestFingerprint !== payload.guestPayloadFingerprint ||
        !validEnvelope(envelope, session.accountId) || envelope.revision !== receipt.durableRevision ||
        body.committedEnvelopeRevision !== receipt.durableRevision) {
      return { status: 'networkError', retryable: false, message: 'Account service returned an invalid durable receipt.' }
    }
    const success = { receipt, committedEnvelope: envelope }
    return body.status === 'committed'
      ? { status: 'committed', ...success }
      : { status: 'alreadyCommittedDuplicate', ...success }
  }

  private validateSession(session: AuthorizedAccountSession): {
    status: 'unauthorized'
    reason: 'unauthenticated' | 'expiredToken'
    message: string
  } | null {
    if (!session || !parseAccountId(session.accountId) || typeof session.token !== 'string' || session.token.length < 16) {
      return { status: 'unauthorized', reason: 'unauthenticated', message: 'A valid authenticated session is required.' }
    }
    if (session.expiresAt !== undefined && (!Number.isFinite(session.expiresAt) || session.expiresAt <= this.now())) {
      return { status: 'unauthorized', reason: 'expiredToken', message: 'Authenticated session has expired.' }
    }
    return null
  }

  private async request(endpoint: string, payload: JsonObject, session: AuthorizedAccountSession, signal?: AbortSignal): Promise<
    | { kind: 'json'; body: unknown }
    | { kind: 'http'; status: number }
    | { kind: 'network'; retryable: boolean; message: string }
    | { kind: 'aborted' }
  > {
    if (signal?.aborted) return { kind: 'aborted' }
    const controller = new AbortController()
    const abort = () => controller.abort(signal?.reason)
    signal?.addEventListener('abort', abort, { once: true })
    let timedOut = false
    const timeout = setTimeout(() => { timedOut = true; controller.abort() }, this.timeoutMs)
    try {
      const response = await this.requestFetch(`${this.baseUrl}/rest/v1/rpc/${endpoint}`, {
        method: 'POST',
        headers: {
          apikey: this.apiKey,
          Authorization: `Bearer ${session.token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
        redirect: 'error',
      })
      if (!response.ok) return { kind: 'http', status: response.status }
      try { return { kind: 'json', body: await response.json() as unknown } }
      catch { return { kind: 'network', retryable: false, message: 'Account service returned invalid JSON.' } }
    } catch {
      if (signal?.aborted) return { kind: 'aborted' }
      safeLog(this.logger, timedOut ? 'Supabase account request timed out.' : 'Supabase account request failed.')
      return { kind: 'network', retryable: true, message: timedOut ? 'Account request timed out.' : 'Account network request failed.' }
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
    }
  }
}
