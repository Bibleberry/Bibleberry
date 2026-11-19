/**
 * R13-SB3 (Granite Sparrow, Issue #236) suite E — service_role can no longer mint earned Cards or
 * forge the evidence admission relies on, on a REAL disposable local Supabase stack.
 *
 * Real: GoTrue users, PostgREST with the real service-role JWT and the real `sb_secret_` key,
 * Supabase Postgres with all accepted migrations + R13-SB3, and a dedicated verifier LOGIN that
 * holds only `account_award_verifier` (direct loopback connection, exactly like suite B).
 * Synthetic: every user, Challenge, Card and attestation (no Sanity, no hosted project).
 *
 * Every negative test checks the DATABASE afterwards (row digests unchanged), not just the HTTP
 * status. Run only through scripts/accountSupabase/run-local-supabase-acceptance.sh.
 */
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { after, before, describe as suite, test } from 'node:test'
import {
  bearer,
  describe,
  http,
  loadStack,
  psql,
  psqlJson,
  psqlOk,
  reconcilePayload,
  rpc,
  signUpUser,
  skipReason,
  syntheticCard,
  uniqueSuffix,
} from './lib/localStack.ts'
import type { HttpResult, LocalStack, TestUser } from './lib/localStack.ts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>

const run = uniqueSuffix()
const LOGIN = `sb3_verifier_${run}`
const YM = '2026-09'
const HOPE = `card:monthly:${YM}:hope`
const FAITH = `card:monthly:${YM}:faith`
const FORGED = `card:monthly:${YM}:forged`
const BASIS = ['cms:sb3-e1', 'cms:sb3-e2']

/** Every public account table, as classified by R13-SB3. */
const AWARD_EVIDENCE = [
  'account_earned_awards',
  'account_completed_challenges',
  'account_provisional_award_claims',
  'account_reconciliation_receipts',
  'account_reconciliation_unresolved_items',
]
const PRIVATE_AUDIT = ['account_award_admission_attestations', 'account_award_verification_attempts']
const READER_STATE = [
  'account_participation_profiles',
  'account_in_progress_challenges',
  'account_saved_challenges',
  'account_saved_scriptures',
  'account_shelf_months',
]
const ALL_TABLES = [...AWARD_EVIDENCE, ...PRIVATE_AUDIT, ...READER_STATE].sort()

let stack: LocalStack
let verifierUrl: string
let userA: TestUser
let userB: TestUser

const body = (r: HttpResult): Json => r.body as Json

/** The two real service-role credentials PostgREST accepts. */
function serviceCallers(): Array<[string, Record<string, string>, string]> {
  return [
    ['legacy service_role JWT', bearer(stack.serviceRoleJwtKey), stack.serviceRoleJwtKey],
    ['sb_secret API key', {}, stack.secretKey],
  ]
}

/** md5 of every row of every account table, read as the owner: proves "nothing changed". */
function tableDigests(): Record<string, string> {
  return psqlJson<Record<string, string>>(stack.adminDbUrl, `
    SELECT jsonb_object_agg(t, d) FROM (
      ${ALL_TABLES.map(t => `SELECT '${t}' AS t, md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) AS d FROM public.${t} x`).join(' UNION ALL ')}
    ) s;`)
}

function asVerifier(sql: string, vars: Record<string, string> = {}): Json {
  return psqlJson<Json>(verifierUrl, sql, vars)
}

function admit(accountId: string, awardId: string, basis: string[]): Json {
  const slug = awardId.slice(21)
  return asVerifier(`SELECT account_issuance.admit_verified_award(:'att'::jsonb);`, {
    att: JSON.stringify({
      verificationKey: `sb3-${run}`,
      verifierVersion: 'r13-sb3-local',
      accountId,
      awardId,
      discoveryId: `discovery:${awardId.slice(13)}`,
      kind: 'thematic',
      publicationYearMonth: YM,
      rosterVersion: 1,
      targetCount: basis.length,
      basisChallengeIds: basis,
      latestBasisReleaseDate: `${YM}-02`,
      verifiedThroughDate: `${YM}-20`,
      card: syntheticCard(YM, slug),
      source: { documentId: `month-${YM}`, revision: 'rev1', dataset: 'staging', perspective: 'published' },
    }),
  })
}

function assertDenied(result: HttpResult, label: string): void {
  assert.ok([401, 403].includes(result.status), `${label} must be denied: ${describe(result)}`)
  if (result.status === 403) assert.equal(body(result).code, '42501', `${label}: ${describe(result)}`)
}

suite('R13-SB3 E: service_role cannot mint Cards or forge admission evidence (real local Supabase)', { skip: skipReason }, () => {
  before(async () => {
    stack = loadStack()
    const password = randomBytes(24).toString('hex')
    psqlOk(stack.adminDbUrl, `
      SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
                    :'login', :'pw') \\gexec
      SELECT format('GRANT account_award_verifier TO %I', :'login') \\gexec
    `, { login: LOGIN, pw: password })
    verifierUrl = `postgresql://${LOGIN}:${password}@127.0.0.1:${stack.dbPort}/postgres`
    userA = await signUpUser(stack, `sb3-a-${run}`)
    userB = await signUpUser(stack, `sb3-b-${run}`)
  })

  after(() => {
    if (!stack) return
    psql(stack.adminDbUrl, `SELECT format('DROP ROLE IF EXISTS %I', :'login') \\gexec`, { login: LOGIN })
  })

  test('E1 effective privilege matrix for every role on every public account table', () => {
    const matrix = psqlJson<Record<string, Record<string, string>>>(stack.adminDbUrl, `
      SELECT jsonb_object_agg(tbl, roles) FROM (
        SELECT c.relname AS tbl, jsonb_object_agg(r, privs) AS roles FROM (
          SELECT c.oid, c.relname, r,
                 coalesce(string_agg(
                   CASE WHEN has_table_privilege(r, c.oid, p) THEN p
                        WHEN p IN ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES') AND has_any_column_privilege(r, c.oid, p)
                          THEN p || '(cols)' END, ',' ORDER BY p), '') AS privs
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace,
                 unnest(ARRAY['public', 'anon', 'authenticated', 'service_role', 'account_reconciler',
                              'account_award_issuer', 'account_award_verifier']) r,
                 unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
           WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f') AND c.relname LIKE 'account\\_%'
           GROUP BY c.oid, c.relname, r) c
        GROUP BY c.relname) s;`)
    assert.deepEqual(Object.keys(matrix).sort(), ALL_TABLES, 'every account table is classified (a new one must be added here)')

    const DML = 'DELETE,INSERT,SELECT,UPDATE'
    const expected: Record<string, Record<string, string>> = {}
    for (const t of ALL_TABLES) {
      expected[t] = {
        public: '', anon: '', account_award_verifier: '',
        authenticated: PRIVATE_AUDIT.includes(t) ? '' : 'SELECT',
        service_role: AWARD_EVIDENCE.includes(t) ? 'SELECT' : PRIVATE_AUDIT.includes(t) ? '' : DML,
        account_reconciler: '', account_award_issuer: '',
      }
    }
    // Accepted TX1 / VERIFY1 dedicated-role authority, unchanged by R13-SB3 (column-scoped UPDATE).
    Object.assign(expected.account_participation_profiles, { account_reconciler: 'INSERT,SELECT,UPDATE(cols)', account_award_issuer: 'SELECT,UPDATE(cols)' })
    Object.assign(expected.account_completed_challenges, { account_reconciler: 'INSERT,SELECT', account_award_issuer: 'SELECT(cols)' })
    Object.assign(expected.account_in_progress_challenges, { account_reconciler: 'DELETE,INSERT,SELECT,UPDATE(cols)' })
    Object.assign(expected.account_saved_challenges, { account_reconciler: 'INSERT,SELECT,UPDATE(cols)' })
    Object.assign(expected.account_saved_scriptures, { account_reconciler: 'INSERT,SELECT,UPDATE(cols)' })
    Object.assign(expected.account_earned_awards, { account_reconciler: 'SELECT,UPDATE(cols)', account_award_issuer: 'INSERT,SELECT,UPDATE(cols)' })
    Object.assign(expected.account_shelf_months, { account_reconciler: 'INSERT,SELECT' })
    Object.assign(expected.account_reconciliation_receipts, { account_reconciler: 'INSERT,SELECT' })
    Object.assign(expected.account_reconciliation_unresolved_items, { account_reconciler: 'INSERT,SELECT' })
    Object.assign(expected.account_provisional_award_claims, { account_reconciler: 'INSERT,SELECT,UPDATE(cols)', account_award_issuer: 'DELETE,SELECT' })
    Object.assign(expected.account_award_admission_attestations, { account_award_issuer: 'INSERT,SELECT' })
    Object.assign(expected.account_award_verification_attempts, { account_award_issuer: 'INSERT,SELECT,UPDATE(cols)' })
    assert.deepEqual(matrix, expected)

    // Trusted award identity/date/art/rights columns are writable by NO role at all; only the two
    // reader-owned presentation flags (+ updated_at) are, and only by the dedicated roles.
    const writable = psqlJson<Json>(stack.adminDbUrl, `
      SELECT jsonb_object_agg(r, cols) FROM (
        SELECT r, coalesce(jsonb_agg(a.attname ORDER BY a.attname) FILTER (WHERE has_column_privilege(r, a.attrelid, a.attnum, 'UPDATE')), '[]') AS cols
          FROM pg_attribute a, unnest(ARRAY['anon', 'authenticated', 'service_role', 'account_reconciler', 'account_award_issuer', 'account_award_verifier']) r
         WHERE a.attrelid = 'public.account_earned_awards'::regclass AND a.attnum > 0 AND NOT a.attisdropped
         GROUP BY r) s;`)
    const flags = ['card_viewed', 'hub_announcement_acked', 'updated_at']
    assert.deepEqual(writable, {
      anon: [], authenticated: [], service_role: [], account_award_verifier: [],
      account_reconciler: flags, account_award_issuer: flags,
    })
  })

  test('E2 service_role role facts: BYPASSRLS (why RLS alone cannot fix F1), no inherited or private authority', () => {
    const facts = psqlJson<Json>(stack.adminDbUrl, `
      SELECT jsonb_build_object(
        'bypassrls', (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'service_role'),
        'login', (SELECT rolcanlogin FROM pg_roles WHERE rolname = 'service_role'),
        'memberOf', (SELECT coalesce(jsonb_agg(r.rolname ORDER BY r.rolname), '[]') FROM pg_roles r
                      WHERE r.rolname <> 'service_role' AND pg_has_role('service_role', r.oid, 'MEMBER')),
        'privateSchemas', (SELECT coalesce(jsonb_agg(s ORDER BY s), '[]') FROM unnest(ARRAY['account_private', 'account_issuance']) s
                            WHERE has_schema_privilege('service_role', s, 'USAGE') OR has_schema_privilege('service_role', s, 'CREATE')),
        'accountFunctions', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                              WHERE (n.nspname IN ('account_private', 'account_issuance') OR p.proname IN ('reconcile_guest_participation', 'get_account_participation'))
                                AND has_function_privilege('service_role', p.oid, 'EXECUTE')));`)
    // service_role is BYPASSRLS on Supabase: only SQL privileges stop it (hence this migration).
    assert.deepEqual(facts, { bypassrls: true, login: false, memberOf: [], privateSchemas: [], accountFunctions: 0 })
  })

  test('E3 positive controls: reader A reconciles (receipt + quarantined claim, guest retention), B is isolated', async () => {
    const result = await rpc(stack, 'reconcile_guest_participation', reconcilePayload({
      key: `sb3-a1-${run}`, expectedRevision: 0, mode: 'newAccountTransfer',
      data: {
        completedChallenges: { [BASIS[0]]: { completedOn: `${YM}-03` }, [BASIS[1]]: { completedOn: `${YM}-04` } },
        savedChallenges: { [BASIS[0]]: { savedOn: `${YM}-03` } },
        earnedAwards: {
          [HOPE]: { earnedOn: `${YM}-04` },
          [FAITH]: { earnedOn: `${YM}-05`, earnedCard: syntheticCard(YM, 'client-supplied') },
        },
      },
    }), bearer(userA.accessToken))
    assert.equal(body(result).status, 'committed', describe(result))
    assert.equal(body(result).receipt.unresolvedPersistedOnServer, false, 'unverified claims keep guest retention')
    const read = await rpc(stack, 'get_account_participation', {}, bearer(userA.accessToken))
    assert.equal(read.status, 200, describe(read))
    assert.deepEqual(body(read).envelope.data.earnedAwards ?? {}, {}, 'a claim is never read back as earned')
    assert.deepEqual(Object.keys(body(read).envelope.data.completedChallenges).sort(), BASIS)

    // B sees none of A's rows and cannot touch them.
    for (const t of ['account_provisional_award_claims', 'account_completed_challenges', 'account_reconciliation_receipts']) {
      const asB = await http(stack, 'GET', `/rest/v1/${t}?select=account_id&account_id=eq.${userA.id}`, { headers: bearer(userB.accessToken) })
      assert.equal(asB.status, 200, describe(asB))
      assert.deepEqual(asB.body, [], `B reads none of A's ${t}`)
      const asA = await http(stack, 'GET', `/rest/v1/${t}?select=account_id`, { headers: bearer(userA.accessToken) })
      assert.ok((asA.body as Json[]).length >= 1 && (asA.body as Json[]).every(r => r.account_id === userA.id), `A reads only own ${t}`)
    }
    // Replay is still exact.
    const replay = await rpc(stack, 'reconcile_guest_participation', reconcilePayload({
      key: `sb3-a1-${run}`, expectedRevision: 1, mode: 'newAccountTransfer', data: {},
    }), bearer(userA.accessToken))
    assert.equal(body(replay).status, 'alreadyCommittedDuplicate', describe(replay))
    assert.equal(body(replay).guestRetentionRequired, true)
  })

  test('E4 positive control: the dedicated verifier admits exactly once, replays safely; flags OR, trusted metadata immutable', async () => {
    const first = admit(userA.id, HOPE, BASIS)
    assert.equal(first.status, 'admitted', JSON.stringify(first))
    assert.equal(admit(userA.id, HOPE, BASIS).status, 'alreadyEarned', 'replay is idempotent')
    const attestations = psqlOk(stack.adminDbUrl,
      `SELECT count(*) FROM public.account_award_admission_attestations WHERE account_id = :'a'::uuid AND award_id = :'w';`, { a: userA.id, w: HOPE })
    assert.equal(attestations, '1', 'exactly one attestation')
    const before = psqlJson<Json>(stack.adminDbUrl, `SELECT to_jsonb(e) - 'updated_at' - 'card_viewed' FROM public.account_earned_awards e
      WHERE account_id = :'a'::uuid AND award_id = :'w';`, { a: userA.id, w: HOPE })

    // A later reconcile tries to rewrite date + Card art; only the presentation flag may change.
    const merge = await rpc(stack, 'reconcile_guest_participation', reconcilePayload({
      key: `sb3-a2-${run}`, expectedRevision: Number(first.revision), mode: 'existingAccountMerge', accountId: userA.id,
      data: { earnedAwards: { [HOPE]: { earnedOn: `${YM}-01`, cardViewed: true, earnedCard: syntheticCard(YM, 'tampered') } } },
    }), bearer(userA.accessToken))
    assert.ok(['committed', 'reconciledWithUnresolved'].includes(body(merge).status), describe(merge))
    const after = psqlJson<Json>(stack.adminDbUrl, `SELECT to_jsonb(e) - 'updated_at' - 'card_viewed' FROM public.account_earned_awards e
      WHERE account_id = :'a'::uuid AND award_id = :'w';`, { a: userA.id, w: HOPE })
    assert.deepEqual(after, before, 'identity, earned date, provenance and Card snapshot are immutable to the client')
    assert.equal(psqlOk(stack.adminDbUrl, `SELECT card_viewed FROM public.account_earned_awards WHERE account_id = :'a'::uuid AND award_id = :'w';`,
      { a: userA.id, w: HOPE }), 't', 'reader-owned flag updated through the approved RPC')

    // The verifier never nominates: an unclaimed pair cannot be admitted.
    assert.equal(admit(userB.id, HOPE, BASIS).status, 'noPendingClaim')
  })

  test('E5 service_role cannot POST/PATCH/DELETE/upsert earned awards; database unchanged', async () => {
    const row = {
      account_id: userB.id, award_id: FORGED, kind: 'thematic', publication_year_month: YM,
      discovery_id: `discovery:${YM}:forged`, earned_on: `${YM}-05`, date_provenance: 'serverVerified',
      card_document_id: 'card-forged', earned_card_snapshot: syntheticCard(YM, 'forged'),
    }
    const digests = tableDigests()
    for (const [who, headers, apikey] of serviceCallers()) {
      assertDenied(await http(stack, 'POST', '/rest/v1/account_earned_awards', {
        headers: { ...headers, Prefer: 'return=minimal' }, body: row, apikey }), `${who} POST earned award`)
      assertDenied(await http(stack, 'POST', '/rest/v1/account_earned_awards?on_conflict=account_id,award_id', {
        headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: { ...row, account_id: userA.id, award_id: HOPE }, apikey,
      }), `${who} upsert over A's earned award`)
      for (const patch of [{ earned_on: `${YM}-01` }, { date_provenance: 'serverVerified' }, { card_document_id: 'card-swapped' },
        { earned_card_snapshot: syntheticCard(YM, 'swapped') }, { hub_announcement_acked: true }, { award_id: FORGED }]) {
        assertDenied(await http(stack, 'PATCH', `/rest/v1/account_earned_awards?account_id=eq.${userA.id}`, {
          headers: { ...headers, Prefer: 'return=minimal' }, body: patch, apikey }), `${who} PATCH ${Object.keys(patch)[0]}`)
      }
      assertDenied(await http(stack, 'DELETE', `/rest/v1/account_earned_awards?account_id=eq.${userA.id}`, { headers, apikey }),
        `${who} DELETE earned history`)
    }
    assert.deepEqual(tableDigests(), digests, 'no account table changed')
    assert.equal(psqlOk(stack.adminDbUrl, `SELECT count(*) FROM public.account_earned_awards WHERE account_id = :'b'::uuid;`, { b: userB.id }), '0')
  })

  test('E6 service_role cannot forge completions, claims, receipts, unresolved evidence or audit rows; database unchanged', async () => {
    const forged: Array<[string, Json, Json]> = [
      ['account_completed_challenges', { account_id: userB.id, challenge_id: BASIS[0], completed_on: `${YM}-03`, date_provenance: 'serverVerified' },
        { completed_on: `${YM}-01` }],
      ['account_provisional_award_claims', { account_id: userB.id, award_id: HOPE, kind: 'thematic', publication_year_month: YM,
        discovery_id: `discovery:${YM}:hope`, claimed_earned_on: `${YM}-02`, last_idempotency_key: 'forged' }, { claimed_earned_on: `${YM}-01` }],
      ['account_reconciliation_receipts', { account_id: userB.id, idempotency_key: 'forged', mode: 'newAccountTransfer',
        guest_payload_digest: 'forged', committed_revision: 1, outcome_status: 'committed', unresolved_persisted_on_server: true },
        { unresolved_persisted_on_server: true }],
      ['account_reconciliation_unresolved_items', { account_id: userA.id, idempotency_key: `sb3-a1-${run}`, item_ordinal: 99,
        origin: 'serverDetected', kind: 'inadmissibleDateClaim', subject_id: HOPE, detail: {} }, { detail: {} }],
      ['account_award_admission_attestations', { account_id: userA.id, award_id: HOPE }, { verifier_version: 'forged' }],
      ['account_award_verification_attempts', { account_id: userA.id, award_id: FAITH, last_reason: 'cardNotApproved' }, { attempt_count: 1 }],
    ]
    const digests = tableDigests()
    for (const [who, headers, apikey] of serviceCallers()) {
      for (const [table, row, patch] of forged) {
        assertDenied(await http(stack, 'POST', `/rest/v1/${table}`, { headers: { ...headers, Prefer: 'return=minimal' }, body: row, apikey }),
          `${who} POST ${table}`)
        assertDenied(await http(stack, 'PATCH', `/rest/v1/${table}?account_id=eq.${userA.id}`, {
          headers: { ...headers, Prefer: 'return=minimal' }, body: patch, apikey }), `${who} PATCH ${table}`)
        assertDenied(await http(stack, 'DELETE', `/rest/v1/${table}?account_id=eq.${userA.id}`, { headers, apikey }), `${who} DELETE ${table}`)
      }
      // The private audit tables are not even readable.
      for (const table of PRIVATE_AUDIT) {
        assertDenied(await http(stack, 'GET', `/rest/v1/${table}?select=account_id`, { headers, apikey }), `${who} GET ${table}`)
      }
    }
    assert.deepEqual(tableDigests(), digests, 'no account table changed')
    // The pending FAITH claim is still pending and still admissible only through the verifier.
    assert.equal(psqlOk(stack.adminDbUrl, `SELECT count(*) FROM public.account_provisional_award_claims WHERE account_id = :'a'::uuid AND award_id = :'w';`,
      { a: userA.id, w: FAITH }), '1')
  })

  test('E7 anon and authenticated still cannot mint or forge; service_role keeps only the evidenced read + reader-state rights', async () => {
    const row = { account_id: userB.id, award_id: FORGED, kind: 'thematic', publication_year_month: YM,
      discovery_id: `discovery:${YM}:forged`, earned_on: `${YM}-05`, date_provenance: 'serverVerified' }
    const digests = tableDigests()
    for (const [who, headers] of [['anon', {}], ['authenticated B', bearer(userB.accessToken)]] as Array<[string, Record<string, string>]>) {
      assertDenied(await http(stack, 'POST', '/rest/v1/account_earned_awards', { headers, body: row }), `${who} POST earned award`)
      assertDenied(await http(stack, 'POST', '/rest/v1/account_completed_challenges', { headers,
        body: { account_id: userB.id, challenge_id: BASIS[0], completed_on: `${YM}-03`, date_provenance: 'serverVerified' } }), `${who} POST completion`)
      assertDenied(await http(stack, 'PATCH', `/rest/v1/account_earned_awards?account_id=eq.${userB.id}`, { headers, body: { card_viewed: true } }),
        `${who} PATCH flags directly`)
    }
    assert.deepEqual(tableDigests(), digests)

    // Not a blanket revoke: SELECT on award tables and DML on reader-owned state remain.
    const [, headers, apikey] = serviceCallers()[0]
    const read = await http(stack, 'GET', `/rest/v1/account_earned_awards?select=award_id&account_id=eq.${userA.id}`, { headers, apikey })
    assert.equal(read.status, 200, describe(read))
    assert.deepEqual(read.body, [{ award_id: HOPE }])
    const saved = await http(stack, 'PATCH', `/rest/v1/account_saved_challenges?account_id=eq.${userA.id}&challenge_id=eq.${BASIS[0]}`, {
      headers: { ...headers, Prefer: 'return=representation' }, body: { saved_on: `${YM}-03` }, apikey })
    assert.equal(saved.status, 200, describe(saved))
    assert.equal((saved.body as Json[]).length, 1, 'reader-state DML retained for service_role (no evidenced need to revoke)')
  })
})
