import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { SupabasePostgrestTransport, parseAccountId } from '../../src/accountSync/index.ts'
import type { ProposedAccountParticipationEnvelope } from '../../src/accountSync/index.ts'

const localUrl = process.env.BIBLEBERRY_LOCAL_SUPABASE_URL
const publishableKey = process.env.BIBLEBERRY_LOCAL_SUPABASE_PUBLISHABLE_KEY
const enabled = process.env.BIBLEBERRY_RUN_LOCAL_SUPABASE_TRANSPORT === '1'

test('LOCAL REAL Supabase GoTrue/PostgREST: A/B isolation, durable commit, and lost-ACK replay', {
  skip: !enabled ? 'set BIBLEBERRY_RUN_LOCAL_SUPABASE_TRANSPORT=1 for a disposable loopback stack' : false,
}, async () => {
  assert.ok(localUrl && publishableKey, 'local Supabase URL and publishable key are required')
  const base = new URL(localUrl)
  assert.ok(
    ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname),
    'refusing non-loopback Supabase endpoint',
  )
  assert.equal(base.protocol, 'http:', 'the disposable local stack must use loopback HTTP')
  assert.equal(process.env.SUPABASE_ACCESS_TOKEN, undefined, 'hosted Supabase credentials must not be present')
  assert.equal(process.env.SUPABASE_DB_URL, undefined, 'hosted Supabase database URL must not be present')
  assert.equal(process.env.DATABASE_URL, undefined, 'external database URL must not be present')

  const key = publishableKey
  const fetchLocal = async (path: string, body: unknown) => fetch(new URL(path, base), {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    redirect: 'error',
  })
  const signUp = async () => {
    const email = `transport-${randomUUID()}@example.test`
    const password = `Bb-${randomUUID()}-9!`
    let response = await fetchLocal('/auth/v1/signup', { email, password })
    let body = await response.json() as Record<string, unknown>
    if (typeof body.access_token !== 'string') {
      response = await fetchLocal('/auth/v1/token?grant_type=password', { email, password })
      body = await response.json() as Record<string, unknown>
    }
    assert.equal(response.ok, true, 'local GoTrue sign-up/sign-in must succeed')
    assert.equal(typeof body.access_token, 'string')
    assert.ok(body.access_token.length > 20)
    return { accountId: parseAccountId((body.user as { id?: string } | undefined)?.id)!, token: body.access_token as string }
  }

  const [a, b] = await Promise.all([signUp(), signUp()])
  assert.ok(a.accountId && b.accountId && a.accountId !== b.accountId, 'GoTrue must issue distinct user IDs')
  const transport = new SupabasePostgrestTransport({ url: base.toString(), apiKey: key })
  assert.equal((await transport.getAccount(a)).status, 'notFound')
  assert.equal((await transport.getAccount(b)).status, 'notFound')

  const envelope: ProposedAccountParticipationEnvelope = {
    schemaVersion: 1,
    accountId: a.accountId,
    namespace: 'cms',
    revision: 0,
    data: {
      completedChallenges: {}, inProgressChallenges: {}, savedChallenges: {}, savedScriptures: [],
      lastOpenedChallenge: null, earnedAwards: {},
      shelf: { months: [{ yearMonth: '2026-10' as never, admissionKind: 'readerSelected', isProtected: true }] },
    },
  }
  const payload = {
    accountId: a.accountId,
    expectedRevision: 0,
    envelope,
    idempotencyKey: `local-${randomUUID()}`,
    guestPayloadFingerprint: randomUUID().replaceAll('-', '').padEnd(64, '0').slice(0, 64),
    mode: 'newAccountTransfer' as const,
    unresolvedItems: [],
  }
  const firstCommit = await transport.commitAccount(a, payload)
  assert.equal(firstCommit.status, 'committed')
  if (firstCommit.status !== 'committed') return
  assert.equal(firstCommit.receipt.unresolvedPersistedOnServer, true)
  assert.equal(firstCommit.committedEnvelope.data.shelf?.months[0].isProtected, true)

  // Simulate losing the first HTTP acknowledgement: replay the exact operation and key.
  const replay = await transport.commitAccount(a, payload)
  assert.equal(replay.status, 'alreadyCommittedDuplicate')
  if (replay.status === 'alreadyCommittedDuplicate') {
    assert.deepEqual(replay.receipt, { ...firstCommit.receipt, status: 'alreadyCommittedDuplicate' })
    assert.equal(replay.committedEnvelope.revision, firstCommit.committedEnvelope.revision)
    assert.equal(replay.committedEnvelope.data.shelf?.months[0].isProtected, true)
  }
  assert.equal((await transport.getAccount(b)).status, 'notFound', 'B must not read A participation')
})
