import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SupabasePostgrestTransport, coordinateGuestSync, parseAccountId } from '../../src/accountSync/index.ts'
import type { AccountTransportCommitPayload, ProposedAccountParticipationEnvelope } from '../../src/accountSync/index.ts'

const accountId = parseAccountId('550e8400-e29b-41d4-a716-446655440000')!
const session = { accountId, token: 'a-realistic-session-access-token' }
const envelope: ProposedAccountParticipationEnvelope = {
  schemaVersion: 1, accountId, namespace: 'cms', revision: 1,
  data: {
    completedChallenges: {}, inProgressChallenges: {}, savedChallenges: {}, savedScriptures: [],
    lastOpenedChallenge: null, earnedAwards: {},
    shelf: { months: [{ yearMonth: '2026-11' as never, admissionKind: 'readerSelected', isProtected: true }] },
  },
}
const payload: AccountTransportCommitPayload = {
  accountId, expectedRevision: 0, envelope, idempotencyKey: 'sync_lost_ack_1',
  guestPayloadFingerprint: 'a'.repeat(64), mode: 'newAccountTransfer', unresolvedItems: [],
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function makeTransport(fetchImpl: typeof fetch, extras: Record<string, unknown> = {}) {
  return new SupabasePostgrestTransport({ url: 'http://127.0.0.1:55421', apiKey: 'sb_publishable_local_test_key', fetch: fetchImpl, ...extras } as never)
}

test('authenticated read uses only the session JWT and validates actual RPC envelope', async () => {
  let requestUrl = ''
  let requestInit: RequestInit | undefined
  const transport = makeTransport(async (input, init) => {
    requestUrl = String(input); requestInit = init
    return response({ status: 'found', revision: 1, envelope })
  })
  const result = await transport.getAccount(session)
  assert.equal(result.status, 'found')
  assert.equal(requestUrl, 'http://127.0.0.1:55421/rest/v1/rpc/get_account_participation')
  const headers = new Headers(requestInit?.headers)
  assert.equal(headers.get('Authorization'), `Bearer ${session.token}`)
  assert.equal(headers.get('apikey'), 'sb_publishable_local_test_key')
  assert.equal(requestInit?.redirect, 'error')
})

test('commit sends accepted camelCase payload and preserves durable receipt/readback on duplicate replay', async () => {
  let sent: Record<string, unknown> | undefined
  const committedEnvelope = { ...envelope, revision: 1 }
  const receipt = {
    ok: true, status: 'alreadyCommittedDuplicate', accountId, idempotencyKey: payload.idempotencyKey,
    committedGuestFingerprint: payload.guestPayloadFingerprint, durableRevision: 1,
    unresolvedCount: 0, unresolvedPersistedOnServer: true,
  }
  const transport = makeTransport(async (_input, init) => {
    sent = JSON.parse(String(init?.body)) as Record<string, unknown>
    return response({ status: 'alreadyCommittedDuplicate', receipt, committedEnvelope, committedEnvelopeRevision: 1 })
  })
  const result = await transport.commitAccount(session, payload)
  assert.equal(result.status, 'alreadyCommittedDuplicate')
  if (result.status === 'alreadyCommittedDuplicate') {
    assert.deepEqual(result.receipt, receipt)
    assert.equal(result.committedEnvelope.data.shelf?.months[0].isProtected, true)
  }
  assert.deepEqual(Object.keys(sent ?? {}), ['p_payload'])
  const p = sent?.p_payload as Record<string, unknown>
  assert.equal(p.expectedRevision, 0)
  assert.equal(p.mode, 'newAccountTransfer')
  assert.deepEqual(p.unresolvedItems, [])
})

test('read maps missing account, expired/missing session, forbidden, invalid snapshots, and timeout safely', async () => {
  assert.equal((await makeTransport(async () => response({ status: 'notFound' })).getAccount(session)).status, 'notFound')
  assert.equal((await makeTransport(async () => response({}, 403)).getAccount(session)).status, 'unauthorized')
  assert.equal((await makeTransport(async () => response({ status: 'found', revision: 1, envelope: { ...envelope, accountId: '550e8400-e29b-41d4-a716-446655440099' } })).getAccount(session)).status, 'networkError')
  assert.equal((await makeTransport(async () => response({ status: 'found', revision: 1, envelope })).getAccount({ accountId, token: 'short' })).status, 'unauthorized')
  assert.equal((await makeTransport(async () => response({ status: 'found', revision: 1, envelope }), { now: () => 100 }).getAccount({ ...session, expiresAt: 100 })).status, 'unauthorized')
  const timeout = makeTransport((_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
  }), { timeoutMs: 1 })
  const timeoutResult = await timeout.getAccount(session)
  assert.equal(timeoutResult.status, 'networkError')
  if (timeoutResult.status === 'networkError') assert.equal(timeoutResult.retryable, true)
})

test('commit maps SQL statuses exactly and never treats HTTP 200 without a valid receipt as committed', async () => {
  const conflict = await makeTransport(async () => response({ status: 'conflict', reason: 'revisionMismatch', currentRevision: 2, currentEnvelope: { ...envelope, revision: 2 }, message: 'stale' })).commitAccount(session, payload)
  assert.equal(conflict.status, 'conflict')
  const mismatch = await makeTransport(async () => response({ status: 'conflict', reason: 'idempotencyPayloadMismatch' })).commitAccount(session, payload)
  assert.equal(mismatch.status, 'conflict')
  const rejected = await makeTransport(async () => response({ status: 'rejected', reason: 'schemaVersionMismatch', message: 'bad schema' })).commitAccount(session, payload)
  assert.deepEqual(rejected, { status: 'rejected', reason: 'schemaVersionMismatch', message: 'bad schema' })
  const invalidAck = await makeTransport(async () => response({ status: 'committed' })).commitAccount(session, payload)
  assert.equal(invalidAck.status, 'networkError')
  const mismatchAccount = await makeTransport(async () => { throw new Error('must not call fetch') }).commitAccount(session, { ...payload, accountId: '550e8400-e29b-41d4-a716-446655440099' })
  assert.equal(mismatchAccount.status, 'unauthorized')
})

test('abort, lost acknowledgement, invalid URL and response JSON do not leak credentials', async () => {
  const logs: string[] = []
  const failing = makeTransport(async () => { throw new Error(`Bearer ${session.token} ${accountId}`) }, { logger: m => logs.push(m) })
  const lostAck = await failing.commitAccount(session, payload)
  assert.equal(lostAck.status, 'networkError')
  assert.equal(logs.join(' ').includes(session.token), false)
  assert.equal(logs.join(' ').includes(accountId), false)

  const controller = new AbortController(); controller.abort()
  assert.equal((await makeTransport(async () => response({})).getAccount(session, { signal: controller.signal })).status, 'aborted')
  const badJson = makeTransport(async () => new Response('{', { status: 200 }))
  assert.equal((await badJson.getAccount(session)).status, 'networkError')
  assert.throws(() => new SupabasePostgrestTransport({ url: 'http://example.com', apiKey: 'key' }), /HTTPS/)
  assert.throws(() => new SupabasePostgrestTransport({ url: 'https://example.com', apiKey: 'sb_secret_do_not_use' }), /publishable/)
  assert.doesNotThrow(() => new SupabasePostgrestTransport({ url: 'https://example.com', apiKey: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.signature' }))
  assert.throws(() => new SupabasePostgrestTransport({ url: 'https://example.com', apiKey: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature' }), /publishable/)
})

test('real coordinator over the PostgREST adapter transfers guest Shelf protection and validates its receipt', async () => {
  let commits = 0
  const transport = makeTransport(async (input, init) => {
    if (String(input).endsWith('/get_account_participation')) return response({ status: 'notFound' })
    commits += 1
    const outer = JSON.parse(String(init?.body)) as { p_payload: Record<string, unknown> }
    const sent = outer.p_payload
    const committedEnvelope = { ...(sent.envelope as ProposedAccountParticipationEnvelope), revision: 1 }
    return response({
      status: 'committed',
      receipt: {
        ok: true, status: 'committed', accountId, idempotencyKey: sent.idempotencyKey,
        committedGuestFingerprint: sent.guestPayloadFingerprint, durableRevision: 1,
        unresolvedCount: 0, unresolvedPersistedOnServer: true,
      },
      committedEnvelope,
      committedEnvelopeRevision: 1,
    })
  })
  const outcome = await coordinateGuestSync(transport, {
    session,
    mode: 'newAccountTransfer',
    guest: {
      envelope: {
        schemaVersion: 2,
        namespace: 'cms',
        data: {
          completedChallenges: {}, inProgressChallenges: {}, savedChallenges: {}, savedScriptures: [],
          lastOpenedChallenge: null, earnedAwards: {},
        },
      },
      shelf: {
        months: [{ yearMonth: '2026-11' as never, admissionKind: 'readerSelected', isProtected: true }],
      },
    },
  }, { idempotencyKey: 'coordinator-through-postgrest-1' })
  assert.equal(outcome.ok, true)
  assert.equal(commits, 1)
  assert.equal(outcome.receipt?.unresolvedPersistedOnServer, true)
  assert.equal(outcome.reconciliation?.ok && outcome.reconciliation.mergedAccount.data.shelf?.months[0].isProtected, true)
})
