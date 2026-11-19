/**
 * R13-SB1 Deliverable A — real Supabase Auth (GoTrue) + PostgREST user-boundary acceptance.
 *
 * Every positive request is made with a REAL session issued by the running local GoTrue and
 * the local publishable API key, over real HTTP to /rest/v1. No Postgres session variable is
 * ever set by hand for a caller. The admin database connection is used only to INSPECT
 * ownership/catalog state after the fact, never as the reader in a positive test.
 *
 * Run only through scripts/accountSupabase/run-local-supabase-acceptance.sh.
 */
import assert from 'node:assert/strict'
import { before, describe as suite, test } from 'node:test'
import {
  bearer,
  decodeJwtPart,
  describe,
  http,
  loadStack,
  psqlJson,
  psqlOk,
  reconcilePayload,
  rpc,
  signHs256,
  signUpUser,
  skipReason,
  syntheticCard,
  uniqueSuffix,
} from './lib/localStack.ts'
import type { HttpResult, LocalStack, TestUser } from './lib/localStack.ts'

type Json = Record<string, any>

let stack: LocalStack
let userA: TestUser
let userB: TestUser
let accountTables: string[] = []
const run = uniqueSuffix()

const AWARD = 'card:monthly:2026-10:hope'

function body(result: HttpResult): Json {
  return result.body as Json
}

function accountRowCounts(accountId: string): Record<string, number> {
  return psqlJson<Record<string, number>>(
    stack.adminDbUrl,
    `SELECT coalesce(jsonb_object_agg(t, n), '{}'::jsonb) FROM (
       SELECT c.relname AS t,
              (xpath('/row/n/text()', query_to_xml(format(
                 'SELECT count(*) AS n FROM public.%I WHERE account_id = %L', c.relname, :'acct'), false, true, '')))[1]::text::int AS n
         FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
        WHERE ns.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'account\\_%'
          AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'account_id')) s;`,
    { acct: accountId },
  )
}

function totalRows(accountId: string): number {
  return Object.values(accountRowCounts(accountId)).reduce((sum, n) => sum + n, 0)
}

suite('R13-SB1 A: real GoTrue + PostgREST account boundary', { skip: skipReason }, () => {
  before(async () => {
    stack = loadStack()
    userA = await signUpUser(stack, `a-${run}`)
    userB = await signUpUser(stack, `b-${run}`)
    accountTables = psqlOk(
      stack.adminDbUrl,
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'account\\_%' ORDER BY 1;`,
    ).split('\n').filter(Boolean)
  })

  test('A1 GoTrue issues genuine asymmetric user JWTs whose sub is the auth.users id', async () => {
    for (const user of [userA, userB]) {
      const header = decodeJwtPart(user.accessToken, 0)
      const claims = decodeJwtPart(user.accessToken, 1)
      assert.notEqual(header.alg, 'HS256', 'session tokens are signed with the local asymmetric signing key')
      assert.equal(claims.role, 'authenticated')
      assert.equal(claims.sub, user.id)
      const me = await http(stack, 'GET', '/auth/v1/user', { headers: bearer(user.accessToken) })
      assert.equal(me.status, 200, describe(me))
      assert.equal(body(me).id, user.id)
    }
    assert.notEqual(userA.id, userB.id)
    const rows = psqlOk(stack.adminDbUrl, `SELECT count(*) FROM auth.users WHERE id IN (:'a'::uuid, :'b'::uuid);`, {
      a: userA.id,
      b: userB.id,
    })
    assert.equal(rows, '2', 'both users exist in the REAL auth.users (no synthetic bootstrap)')
    assert.equal(accountTables.length, 12, `expected the 12 account_* tables, got ${accountTables.join(',')}`)
  })

  test('A2 fresh account reads notFound over REST; anon is denied at the API layer', async () => {
    const own = await rpc(stack, 'get_account_participation', {}, bearer(userA.accessToken))
    assert.equal(own.status, 200, describe(own))
    assert.equal(body(own).status, 'notFound')

    const anon = await rpc(stack, 'get_account_participation', {}, {})
    assert.equal(anon.status, 401, `anon must get HTTP 401 from PostgREST: ${describe(anon)}`)
    assert.equal(body(anon).code, '42501', 'SQL-layer cause is a missing EXECUTE grant, not function JSON')

    const anonCommit = await rpc(stack, 'reconcile_guest_participation', reconcilePayload({
      key: `sb1-anon-${run}`, expectedRevision: 0, mode: 'newAccountTransfer', data: {},
    }), {})
    assert.equal(anonCommit.status, 401, describe(anonCommit))
    assert.equal(body(anonCommit).code, '42501')
  })

  test('A3 user A new-account transfer over real /rest/v1/rpc: auth.uid() = A inside SECURITY DEFINER', async () => {
    const result = await rpc(stack, 'reconcile_guest_participation', reconcilePayload({
      key: `sb1-a-transfer-${run}`,
      expectedRevision: 0,
      mode: 'newAccountTransfer',
      data: {
        completedChallenges: {
          'cms:sb1-c1': { completedOn: '2026-10-03' },
          'cms:sb1-c2': { completedOn: '2026-10-05' },
        },
        savedChallenges: { 'cms:sb1-s1': { savedOn: '2026-10-04' } },
        shelf: {
          months: [
            { yearMonth: '2026-10', admissionKind: 'readerSelected', isProtected: false },
            { yearMonth: '2026-09', admissionKind: 'autoAdmitted', isProtected: true },
          ],
          activeFocusMonth: '2026-10',
        },
        earnedAwards: {
          [AWARD]: { earnedOn: '2026-10-05', cardViewed: true, earnedCard: syntheticCard('2026-10', 'hope') },
        },
      },
    }), bearer(userA.accessToken))
    assert.equal(result.status, 200, describe(result))
    const r = body(result)
    assert.equal(r.status, 'committed', describe(result))
    assert.equal(r.receipt.accountId, userA.id, 'receipt account = the JWT subject')
    assert.equal(r.receipt.durableRevision, 1)

    // Ownership proof from the database side: every written row is A-owned, nothing for B.
    const counts = accountRowCounts(userA.id)
    assert.equal(counts.account_participation_profiles, 1)
    assert.equal(counts.account_completed_challenges, 2)
    assert.equal(counts.account_shelf_months, 2)
    assert.equal(counts.account_reconciliation_receipts, 1)
    assert.equal(counts.account_provisional_award_claims, 1, 'award claim quarantined, not earned')
    assert.equal(counts.account_earned_awards, 0)
    assert.equal(totalRows(userB.id), 0, 'nothing was written to B')
    const owners = psqlOk(stack.adminDbUrl,
      `SELECT string_agg(DISTINCT account_id::text, ',') FROM public.account_completed_challenges
        WHERE challenge_id IN ('cms:sb1-c1','cms:sb1-c2') AND account_id IN (:'a'::uuid, :'b'::uuid);`,
      { a: userA.id, b: userB.id })
    assert.equal(owners, userA.id)

    // Explicit Shelf protection survives the real stack exactly.
    const shelf = psqlOk(stack.adminDbUrl,
      `SELECT string_agg(year_month || ':' || is_protected, ',' ORDER BY slot_order)
         FROM public.account_shelf_months WHERE account_id = :'a'::uuid;`, { a: userA.id })
    assert.equal(shelf, '2026-10:false,2026-09:true')
  })

  test('A4 award claims force guest retention: no false unresolvedPersistedOnServer', async () => {
    const replay = await rpc(stack, 'reconcile_guest_participation', reconcilePayload({
      key: `sb1-a-transfer-${run}`, expectedRevision: 0, mode: 'newAccountTransfer', data: {},
      fingerprintSeed: `sb1-a-different-guest-${run}`,
    }), bearer(userA.accessToken))
    // Same key, different guest fingerprint → conflict, original commit untouched.
    assert.equal(body(replay).status, 'conflict', describe(replay))
    assert.equal(body(replay).reason, 'idempotencyPayloadMismatch')

    const read = await rpc(stack, 'get_account_participation', {}, bearer(userA.accessToken))
    const env = body(read)
    assert.equal(env.status, 'found')
    assert.equal(env.revision, 1)
    assert.deepEqual(env.envelope.data.earnedAwards ?? {}, {}, 'unverified claim is never an earned award')
    assert.deepEqual(env.pendingAwardVerification, [AWARD])
    const receipt = psqlJson<Json>(stack.adminDbUrl,
      `SELECT to_jsonb(r) FROM public.account_reconciliation_receipts r WHERE account_id = :'a'::uuid;`, { a: userA.id })
    assert.equal(receipt.unresolved_persisted_on_server, false, 'quarantined claim must not be reported as persisted')
  })

  test('A5 B reads only B; owner-scoped table SELECT never leaks A', async () => {
    const bRead = await rpc(stack, 'get_account_participation', {}, bearer(userB.accessToken))
    assert.equal(body(bRead).status, 'notFound')
    for (const table of accountTables) {
      const own = await http(stack, 'GET', `/rest/v1/${table}?select=account_id`, { headers: bearer(userA.accessToken) })
      const cross = await http(stack, 'GET', `/rest/v1/${table}?select=account_id&account_id=eq.${userA.id}`, {
        headers: bearer(userB.accessToken),
      })
      if (table === 'account_award_admission_attestations' || table === 'account_award_verification_attempts') {
        // Private VERIFY1 audit tables: no client grant at all.
        assert.ok([401, 403].includes(own.status), `${table} must be unreadable by readers: ${describe(own)}`)
        assert.equal(body(own).code, '42501')
        continue
      }
      assert.equal(own.status, 200, `${table}: ${describe(own)}`)
      for (const row of body(own) as unknown as Json[]) assert.equal(row.account_id, userA.id, `${table} leaked`)
      assert.equal(cross.status, 200, `${table}: ${describe(cross)}`)
      assert.deepEqual(cross.body, [], `${table}: B must not see A's rows even when filtering for them`)
    }
  })

  test('A6 no direct client DML on any account_* table (POST/PATCH/DELETE/UPSERT), any caller', async () => {
    const callers: Array<[string, Record<string, string>]> = [
      ['anon', {}],
      ['authenticated A', bearer(userA.accessToken)],
    ]
    const before = totalRows(userA.id)
    for (const table of accountTables) {
      for (const [who, headers] of callers) {
        const attempts: Array<[string, HttpResult]> = [
          ['POST', await http(stack, 'POST', `/rest/v1/${table}`, { headers, body: { account_id: userA.id } })],
          ['UPSERT', await http(stack, 'POST', `/rest/v1/${table}`, {
            headers: { ...headers, Prefer: 'resolution=merge-duplicates' }, body: { account_id: userA.id },
          })],
          ['PATCH', await http(stack, 'PATCH', `/rest/v1/${table}?account_id=eq.${userA.id}`, {
            headers, body: { account_id: userB.id },
          })],
          ['DELETE', await http(stack, 'DELETE', `/rest/v1/${table}?account_id=eq.${userA.id}`, { headers })],
        ]
        for (const [verb, result] of attempts) {
          assert.ok([401, 403].includes(result.status), `${who} ${verb} ${table} must be denied: ${describe(result)}`)
          assert.equal(body(result).code, '42501', `${who} ${verb} ${table}: privilege denial expected`)
        }
      }
    }
    assert.equal(totalRows(userA.id), before, 'no DML attempt changed A')
  })

  test('A7 B cannot act on A: forged accountId in header, body or envelope is refused', async () => {
    const before = totalRows(userA.id)
    const forged = await rpc(stack, 'reconcile_guest_participation', reconcilePayload({
      key: `sb1-b-forge-${run}`,
      expectedRevision: 1,
      mode: 'existingAccountMerge',
      accountId: userA.id,
      data: { completedChallenges: { 'cms:sb1-forged': { completedOn: '2026-10-07' } } },
    }), {
      ...bearer(userB.accessToken),
      // Header-level forgery attempts. PostgREST must ignore all of them for identity.
      Role: 'service_role',
      'X-Jwt-Claim-Sub': userA.id,
      'Request.Jwt.Claim.Sub': userA.id,
      'Accept-Profile': 'public',
    })
    assert.equal(forged.status, 200, describe(forged))
    assert.equal(body(forged).status, 'unauthorized')
    assert.equal(body(forged).reason, 'accountMismatch')
    assert.equal(totalRows(userA.id), before, 'A untouched')
    assert.equal(totalRows(userB.id), 0, 'forgery did not create anything for B either')

    // Without accountId B's payload targets B, never A, even with every forged header above.
    const ownOnly = await rpc(stack, 'reconcile_guest_participation', reconcilePayload({
      key: `sb1-b-first-${run}`,
      expectedRevision: 0,
      mode: 'newAccountTransfer',
      data: { completedChallenges: { 'cms:sb1-b1': { completedOn: '2026-10-08' } } },
    }), { ...bearer(userB.accessToken), Role: 'service_role', 'X-Jwt-Claim-Sub': userA.id })
    assert.equal(body(ownOnly).status, 'committed', describe(ownOnly))
    assert.equal(body(ownOnly).receipt.accountId, userB.id)
    assert.equal(totalRows(userA.id), before)
  })

  test('A8 invalid JWTs are rejected by PostgREST before SQL runs', async () => {
    const claimsForA = { ...decodeJwtPart(userA.accessToken, 1) }
    const [h, , s] = userA.accessToken.split('.')
    const tamperedPayload = Buffer.from(JSON.stringify({ ...claimsForA, sub: userB.id })).toString('base64url')
    const now = Math.floor(Date.now() / 1000)
    const cases: Array<[string, string]> = [
      ['malformed', 'not-a-jwt'],
      ['tampered payload (sub swapped)', `${h}.${tamperedPayload}.${s}`],
      ['alg none', `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${tamperedPayload}.`],
      ['wrong HS256 key', signHs256({ ...claimsForA, exp: now + 600 }, 'not-the-project-secret-0123456789abcdef')],
      // Correctly signed with the local legacy secret but expired: exercises expiry handling.
      ['expired', signHs256({ ...claimsForA, iat: now - 7200, exp: now - 3600 }, stack.legacyJwtSecret)],
    ]
    for (const [label, token] of cases) {
      for (const fn of ['get_account_participation', 'reconcile_guest_participation']) {
        const args = fn === 'get_account_participation' ? {} : reconcilePayload({
          key: `sb1-badjwt-${run}`, expectedRevision: 1, mode: 'existingAccountMerge', data: {},
        })
        const result = await rpc(stack, fn, args, bearer(token))
        assert.equal(result.status, 401, `${label} → ${fn}: ${describe(result)}`)
        assert.match(String(body(result).code), /^PGRST30\d$/, `${label}: JWT-layer error code expected`)
      }
    }
  })

  test('A9 service_role and secret API key cannot use the client transaction RPC', async () => {
    for (const [label, apikey, auth] of [
      ['legacy service_role JWT', stack.serviceRoleJwtKey, stack.serviceRoleJwtKey],
      ['sb_secret key', stack.secretKey, null],
    ] as const) {
      const headers = auth ? bearer(auth) : {}
      const commit = await rpc(stack, 'reconcile_guest_participation', reconcilePayload({
        key: `sb1-svc-${run}`, expectedRevision: 0, mode: 'newAccountTransfer', data: {},
      }), headers, apikey)
      assert.ok([401, 403].includes(commit.status), `${label} commit: ${describe(commit)}`)
      assert.equal(body(commit).code, '42501')
      const read = await rpc(stack, 'get_account_participation', {}, headers, apikey)
      assert.ok([401, 403].includes(read.status), `${label} read: ${describe(read)}`)
      assert.equal(body(read).code, '42501')
    }
  })

  test('A10 B existing-account merge, stale revision, and duplicate-key replay', async () => {
    const merge = await rpc(stack, 'reconcile_guest_participation', reconcilePayload({
      key: `sb1-b-merge-${run}`,
      expectedRevision: 1,
      mode: 'existingAccountMerge',
      data: {
        completedChallenges: { 'cms:sb1-b2': { completedOn: '2026-10-09' } },
        savedChallenges: { 'cms:sb1-b-s1': { savedOn: '2026-10-09' } },
      },
    }), bearer(userB.accessToken))
    assert.equal(body(merge).status, 'committed', describe(merge))
    assert.equal(body(merge).receipt.durableRevision, 2)
    assert.equal(body(merge).receipt.unresolvedPersistedOnServer, true, 'clean merge, nothing unresolved')

    const stale = await rpc(stack, 'reconcile_guest_participation', reconcilePayload({
      key: `sb1-b-stale-${run}`, expectedRevision: 1, mode: 'existingAccountMerge', data: {},
    }), bearer(userB.accessToken))
    assert.equal(body(stale).status, 'conflict', describe(stale))
    assert.equal(body(stale).reason, 'revisionMismatch')
    assert.equal(body(stale).currentRevision, 2)

    const replay = await rpc(stack, 'reconcile_guest_participation', reconcilePayload({
      key: `sb1-b-merge-${run}`,
      expectedRevision: 1,
      mode: 'existingAccountMerge',
      data: {
        completedChallenges: { 'cms:sb1-b2': { completedOn: '2026-10-09' } },
        savedChallenges: { 'cms:sb1-b-s1': { savedOn: '2026-10-09' } },
      },
    }), bearer(userB.accessToken))
    assert.equal(body(replay).status, 'alreadyCommittedDuplicate', describe(replay))
    assert.deepEqual(body(replay).receipt, { ...body(merge).receipt, status: 'alreadyCommittedDuplicate' })

    const readB = await rpc(stack, 'get_account_participation', {}, bearer(userB.accessToken))
    assert.equal(body(readB).revision, 2)
    assert.deepEqual(Object.keys(body(readB).envelope.data.completedChallenges).sort(), ['cms:sb1-b1', 'cms:sb1-b2'])
  })

  test('A11 competing writers over HTTP: exactly one commit per revision, receipts intact', async () => {
    const writers = 6
    const results = await Promise.all(Array.from({ length: writers }, (_, i) => rpc(
      stack,
      'reconcile_guest_participation',
      reconcilePayload({
        key: `sb1-b-race-${run}-${i}`,
        expectedRevision: 2,
        mode: 'existingAccountMerge',
        data: { savedChallenges: { [`cms:sb1-race-${i}`]: { savedOn: '2026-10-10' } } },
      }),
      bearer(userB.accessToken),
    )))
    const statuses = results.map(r => `${body(r).status}/${body(r).reason ?? ''}`)
    assert.equal(statuses.filter(s => s.startsWith('committed')).length, 1, statuses.join(' '))
    assert.equal(statuses.filter(s => s === 'conflict/revisionMismatch').length, writers - 1, statuses.join(' '))
    const receipts = psqlJson<Json>(stack.adminDbUrl,
      `SELECT jsonb_build_object('n', count(*), 'revs', jsonb_agg(committed_revision ORDER BY committed_revision))
         FROM public.account_reconciliation_receipts WHERE account_id = :'b'::uuid;`, { b: userB.id })
    assert.deepEqual(receipts, { n: 3, revs: [1, 2, 3] }, 'one receipt per durable revision, no duplicates')
  })

  test('A12 private schemas are not reachable through the Data API for any caller', async () => {
    const callers: Array<[string, Record<string, string>, string | undefined]> = [
      ['anon', {}, undefined],
      ['authenticated A', bearer(userA.accessToken), undefined],
      ['service_role', bearer(stack.serviceRoleJwtKey), stack.serviceRoleJwtKey],
    ]
    for (const schema of ['account_issuance', 'account_private', 'auth']) {
      for (const [who, headers, apikey] of callers) {
        const viaProfile = await rpc(stack, 'list_pending_award_claims', { p_limit: 1 },
          { ...headers, 'Content-Profile': schema }, apikey)
        assert.equal(viaProfile.status, 406, `${who} ${schema}: ${describe(viaProfile)}`)
        assert.equal(body(viaProfile).code, 'PGRST106')
        const readProfile = await http(stack, 'GET', '/rest/v1/users?select=id', {
          headers: { ...headers, 'Accept-Profile': schema }, apikey,
        })
        assert.equal(body(readProfile).code, 'PGRST106', `${who} ${schema} read: ${describe(readProfile)}`)
      }
    }
    // Issuance names are not resolvable in the exposed schema either.
    for (const fn of ['list_pending_award_claims', 'admit_verified_award', 'get_claim_verification_context',
      'record_verification_deferral', 'current_account', 'reject', 'parse_award_id']) {
      const result = await rpc(stack, fn, {}, bearer(userA.accessToken))
      assert.equal(result.status, 404, `${fn}: ${describe(result)}`)
      assert.equal(body(result).code, 'PGRST202')
    }
  })

  test('A13 GraphQL surface: no account data or private function exposure', async () => {
    const gql = await http(stack, 'POST', '/graphql/v1', {
      headers: bearer(userA.accessToken),
      body: { query: '{ __schema { queryType { fields { name } } mutationType { fields { name } } } }' },
    })
    const installed = psqlOk(stack.adminDbUrl, `SELECT count(*) FROM pg_extension WHERE extname = 'pg_graphql';`)
    if (installed === '0') {
      // pg_graphql is not installed on this stack: the endpoint must not answer with schema data.
      assert.ok(gql.status >= 400 || JSON.stringify(gql.body).includes('errors'), describe(gql))
      assert.equal(JSON.stringify(gql.body).includes('account'), false)
      return
    }
    assert.equal(gql.status, 200, describe(gql))
    const names = JSON.stringify(gql.body)
    for (const forbidden of ['admitVerifiedAward', 'listPendingAwardClaims', 'accountAwardAdmissionAttestations',
      'insertIntoAccount', 'updateAccount', 'deleteFromAccount']) {
      assert.equal(names.includes(forbidden), false, `GraphQL exposes ${forbidden}`)
    }
  })
})
