/**
 * R13-SB2 (Issue #225) Deliverable C — the D1–D4 migration corrections under REAL local Supabase.
 *
 * Runs after scripts/accountSupabase/run-local-supabase-acceptance.sh applied the migrations with
 * the CLI runner as `postgres` (non-superuser) and ZERO pre-unblocks. Positive identity tests use
 * real GoTrue sessions over real PostgREST; the admin connection (`postgres`) only inspects the
 * catalog or acts as the migration identity would. A dedicated ephemeral verifier login exercises
 * D3 over a direct loopback connection and is dropped afterwards.
 *
 * Run only through scripts/accountSupabase/run-local-supabase-acceptance.sh.
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
  uniqueSuffix,
} from './lib/localStack.ts'
import type { HttpResult, LocalStack, TestUser } from './lib/localStack.ts'

// Responses are dynamic JSON from the real API under test; fields are asserted individually.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>

const run = uniqueSuffix()
const LOGIN = `sb2_verifier_login_${run}`
const HOPE = 'card:monthly:2026-10:hope'

let stack: LocalStack
let verifierUrl: string
let userE: TestUser
let userF: TestUser

function body(result: HttpResult): Json {
  return result.body as Json
}

/** account_id values present in every public.account_* table, restricted to accounts E and F. */
function accountsPerTable(): Record<string, string[]> {
  return psqlJson<Record<string, string[]>>(stack.adminDbUrl, `
    SELECT coalesce(jsonb_object_agg(t, to_jsonb(string_to_array(accts, ','))), '{}'::jsonb) FROM (
      SELECT c.relname AS t,
             (xpath('/row/a/text()', query_to_xml(format(
               'SELECT string_agg(DISTINCT account_id::text, '','') AS a
                  FROM public.%I WHERE account_id IN (%L::uuid, %L::uuid)', c.relname, :'e', :'f'), false, true, '')))[1]::text AS accts
        FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
       WHERE ns.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'account\\_%'
         AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'account_id')) s
     WHERE accts IS NOT NULL;`, { e: userE.id, f: userF.id })
}

suite('R13-SB2 C: D1-D4 migration remediation on real Supabase', { skip: skipReason }, () => {
  before(async () => {
    stack = loadStack()
    userE = await signUpUser(stack, `e-${run}`)
    userF = await signUpUser(stack, `f-${run}`)
  })

  after(() => {
    if (!stack) return
    psql(stack.adminDbUrl, `SELECT format('DROP ROLE IF EXISTS %I', :'login') \\gexec`, { login: LOGIN })
  })

  test('C1 D1: the non-superuser runner owns the transfer via SET+INHERIT; nobody else is a member', () => {
    const r = psqlJson<Json>(stack.adminDbUrl, `
      SELECT jsonb_build_object(
        'runner', jsonb_build_object('user', current_user, 'super', (SELECT rolsuper FROM pg_roles WHERE rolname = current_user)),
        'members', (SELECT jsonb_agg(DISTINCT r.rolname || '>' || m.rolname ORDER BY r.rolname || '>' || m.rolname)
                      FROM pg_auth_members a JOIN pg_roles r ON r.oid = a.roleid JOIN pg_roles m ON m.oid = a.member
                     WHERE r.rolname IN ('account_reconciler', 'account_award_issuer')),
        'setInherit', (SELECT bool_and(pg_has_role('postgres', x, 'SET') AND pg_has_role('postgres', x, 'USAGE'))
                         FROM unnest(ARRAY['account_reconciler', 'account_award_issuer']) x),
        'owners', jsonb_build_object(
          'reconcile', (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid = 'public.reconcile_guest_participation(jsonb)'::regprocedure),
          'issuance', (SELECT jsonb_agg(DISTINCT pg_get_userbyid(proowner)) FROM pg_proc WHERE pronamespace = 'account_issuance'::regnamespace)),
        'accountRoleMemberships', (SELECT count(*) FROM pg_auth_members a JOIN pg_roles m ON m.oid = a.member
                                    WHERE m.rolname LIKE 'account\\_%'));`)
    assert.deepEqual(r.runner, { user: 'postgres', super: false })
    assert.deepEqual(r.members, ['account_award_issuer>postgres', 'account_reconciler>postgres'])
    assert.equal(r.setInherit, true)
    assert.deepEqual(r.owners, { reconcile: 'account_reconciler', issuance: ['account_award_issuer'] })
    assert.equal(r.accountRoleMemberships, 0)
  })

  test('C2 D2/D3: no lingering owner CREATE, default privilege, parameter ACL or function GUC clause', () => {
    const r = psqlJson<Json>(stack.adminDbUrl, `
      SELECT jsonb_build_object(
        'create', (SELECT coalesce(jsonb_agg(r.rolname || '@' || n.nspname), '[]') FROM pg_namespace n CROSS JOIN pg_roles r
                    WHERE r.rolname LIKE 'account\\_%' AND has_schema_privilege(r.oid, n.oid, 'CREATE')
                      AND n.nspname !~ '^pg_(toast_)?temp_'),
        'defacl', (SELECT count(*) FROM pg_default_acl d, aclexplode(d.defaclacl) a
                    WHERE a.grantee IN (SELECT oid FROM pg_roles WHERE rolname LIKE 'account\\_%')),
        'paramAcl', (SELECT count(*) FROM pg_parameter_acl WHERE parname LIKE 'bibleberry.%'),
        'gucClauses', (SELECT count(*) FROM pg_proc p, unnest(p.proconfig) c WHERE c LIKE 'bibleberry.%'));`)
    assert.deepEqual(r, { create: [], defacl: 0, paramAcl: 0, gucClauses: 0 })
  })

  test('C3 D4: the bridge is postgres-owned, minimal and executable by account_reconciler only', () => {
    const r = psqlJson<Json>(stack.adminDbUrl, `
      SELECT jsonb_build_object(
        'owner', pg_get_userbyid(p.proowner), 'definer', p.prosecdef, 'config', p.proconfig,
        'body', btrim(p.prosrc, E' \\n\\t'), 'args', p.pronargs,
        'exec', (SELECT jsonb_agg(x ORDER BY x) FROM unnest(ARRAY['anon','authenticated','service_role','authenticator',
                  'account_reconciler','account_award_issuer','account_award_verifier']) x
                  WHERE has_function_privilege(x, p.oid, 'EXECUTE')),
        'reconcilerAuthUsage', has_schema_privilege('account_reconciler', 'auth', 'USAGE'),
        'ownerBypassesRls', (SELECT rolbypassrls FROM pg_roles WHERE oid = p.proowner))
        FROM pg_proc p WHERE p.oid = 'account_private.request_account_id()'::regprocedure;`)
    assert.deepEqual(r, {
      owner: 'postgres', definer: true, config: ['search_path=""'], body: 'SELECT auth.uid();', args: 0,
      exec: ['account_reconciler'], reconcilerAuthUsage: false,
      // Documented risk: the owner bypasses RLS, so the body must stay this single call.
      ownerBypassesRls: true,
    })
  })

  test('C4 D4: the bridge is not reachable over the Data API by any caller', async () => {
    const callers: Array<[string, Record<string, string>, string | undefined]> = [
      ['anon', {}, undefined],
      ['authenticated E', bearer(userE.accessToken), undefined],
      ['service_role', bearer(stack.serviceRoleJwtKey), stack.serviceRoleJwtKey],
    ]
    for (const [who, headers, apikey] of callers) {
      const plain = await rpc(stack, 'request_account_id', {}, headers, apikey)
      assert.equal(plain.status, 404, `${who}: ${describe(plain)}`)
      assert.equal(body(plain).code, 'PGRST202')
      const viaProfile = await rpc(stack, 'request_account_id', {}, { ...headers, 'Content-Profile': 'account_private' }, apikey)
      assert.equal(viaProfile.status, 406, `${who} via profile: ${describe(viaProfile)}`)
      assert.equal(body(viaProfile).code, 'PGRST106')
    }
  })

  test('C5 D4: real GoTrue identities E and F each commit only to themselves through the definer body', async () => {
    const e = await rpc(stack, 'reconcile_guest_participation', reconcilePayload({
      key: `sb2-e-${run}`, expectedRevision: 0, mode: 'newAccountTransfer',
      data: {
        completedChallenges: { 'cms:sb2-e1': { completedOn: '2026-10-03' } },
        earnedAwards: { [HOPE]: { earnedOn: '2026-10-04' } },
      },
    }), bearer(userE.accessToken))
    assert.equal(body(e).status, 'committed', describe(e))
    // The committed snapshot is built by get_account_participation() INSIDE the definer body
    // (reconciler branch), so it must contain E's data and nothing else.
    assert.deepEqual(Object.keys(body(e).committedEnvelope.data.completedChallenges), ['cms:sb2-e1'])
    const f = await rpc(stack, 'reconcile_guest_participation', reconcilePayload({
      key: `sb2-f-${run}`, expectedRevision: 0, mode: 'newAccountTransfer',
      data: { completedChallenges: { 'cms:sb2-f1': { completedOn: '2026-10-03' } } },
    }), bearer(userF.accessToken))
    assert.equal(body(f).status, 'committed', describe(f))
    assert.deepEqual(Object.keys(body(f).committedEnvelope.data.completedChallenges), ['cms:sb2-f1'])

    // The reader path (authenticated branch, direct auth.uid()) returns each caller's own data.
    for (const [user, challenge] of [[userE, 'cms:sb2-e1'], [userF, 'cms:sb2-f1']] as const) {
      const read = await rpc(stack, 'get_account_participation', {}, bearer(user.accessToken))
      assert.equal(read.status, 200, describe(read))
      assert.equal(body(read).status, 'found')
      assert.deepEqual(Object.keys(body(read).envelope.data.completedChallenges), [challenge])
    }

    // Database-side: every written row belongs to exactly the JWT subject that wrote it.
    const perTable = accountsPerTable()
    // Both accounts own a profile and a receipt; only E nominated an award claim.
    assert.deepEqual([...perTable.account_participation_profiles].sort(), [userE.id, userF.id].sort())
    assert.deepEqual([...perTable.account_reconciliation_receipts].sort(), [userE.id, userF.id].sort())
    assert.deepEqual(perTable.account_provisional_award_claims, [userE.id])
    const completions = psqlJson<Json>(stack.adminDbUrl, `
      SELECT jsonb_object_agg(challenge_id, account_id) FROM public.account_completed_challenges
       WHERE account_id IN (:'e'::uuid, :'f'::uuid);`, { e: userE.id, f: userF.id })
    assert.deepEqual(completions, { 'cms:sb2-e1': userE.id, 'cms:sb2-f1': userF.id })
  })

  test('C6 D4: a caller-supplied account ID never grants authority over another account', async () => {
    const before = psqlOk(stack.adminDbUrl, `SELECT revision FROM public.account_participation_profiles WHERE account_id = :'e'::uuid;`,
      { e: userE.id })
    const forged = await rpc(stack, 'reconcile_guest_participation', reconcilePayload({
      key: `sb2-forge-${run}`, expectedRevision: Number(before), mode: 'existingAccountMerge', accountId: userE.id,
      data: { completedChallenges: { 'cms:sb2-forged': { completedOn: '2026-10-03' } } },
    }), { ...bearer(userF.accessToken), 'X-Jwt-Claim-Sub': userE.id })
    assert.equal(forged.status, 200, describe(forged))
    assert.deepEqual([body(forged).status, body(forged).reason], ['unauthorized', 'accountMismatch'])
    const after = psqlJson<Json>(stack.adminDbUrl, `
      SELECT jsonb_build_object('rev', (SELECT revision FROM public.account_participation_profiles WHERE account_id = :'e'::uuid),
        'forged', (SELECT count(*) FROM public.account_completed_challenges WHERE challenge_id = 'cms:sb2-forged'));`,
    { e: userE.id })
    assert.deepEqual(after, { rev: Number(before), forged: 0 })
  })

  test('C7 D3: a real verifier login cannot steer issuer confinement with a preset (session or local)', () => {
    const password = randomBytes(24).toString('hex')
    psqlOk(stack.adminDbUrl, `
      SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
                    :'login', :'pw') \\gexec
      SELECT format('GRANT account_award_verifier TO %I', :'login') \\gexec
    `, { login: LOGIN, pw: password })
    verifierUrl = `postgresql://${LOGIN}:${password}@127.0.0.1:${stack.dbPort}/postgres`

    const out = psqlJson<Json>(verifierUrl, `
      SET bibleberry.award_issuance_account = :'f';                          -- session-level preset
      BEGIN;
      SELECT set_config('bibleberry.award_issuance_account', :'f', true) \\g /dev/null
      CREATE TEMP TABLE sb2_obs (k text, v jsonb) ON COMMIT DROP;
      INSERT INTO sb2_obs SELECT 'early', jsonb_build_object('r', account_issuance.get_claim_verification_context(:'e'::uuid, 'card:monthly:2026-10:none'),
                                                             'g', current_setting('bibleberry.award_issuance_account'));
      INSERT INTO sb2_obs SELECT 'confined', jsonb_build_object('r', account_issuance.get_claim_verification_context(:'e'::uuid, :'award'),
                                                                'g', current_setting('bibleberry.award_issuance_account'));
      INSERT INTO sb2_obs SELECT 'reject', jsonb_build_object('r', account_issuance.admit_verified_award('{"x":1}'::jsonb),
                                                              'g', current_setting('bibleberry.award_issuance_account'));
      SELECT jsonb_object_agg(k, v) FROM sb2_obs;
      COMMIT;`, { e: userE.id, f: userF.id, award: HOPE })
    assert.deepEqual(out.early, { r: { status: 'noPendingClaim' }, g: '' }, 'preset discarded on an early return')
    assert.equal(out.confined.r.status, 'pending')
    assert.equal(out.confined.r.accountId, userE.id)
    assert.deepEqual(out.confined.r.completedChallengeIds, ['cms:sb2-e1'], 'only E\'s completions (preset F ignored)')
    assert.equal(out.confined.g, userE.id, 'confined to the processed account, never the caller preset')
    assert.deepEqual(out.reject, { r: { status: 'rejected', detail: 'invalidAttestationShape' }, g: '' })
    // Without ever calling the issuance port, a preset gives the login nothing: no table access at all.
    const direct = psql(verifierUrl, `SET bibleberry.award_issuance_account = '${userE.id}';
      SELECT count(*) FROM public.account_earned_awards;`)
    assert.equal(direct.ok, false)
    assert.match(direct.stderr, /permission denied for table account_earned_awards/)
  })

  test('C8 runner never needed a parameter privilege or schema auth grant (warnings are a hard failure)', () => {
    // The runner already failed on any migration WARNING; this re-checks the two former no-op grants' targets.
    const r = psqlJson<Json>(stack.adminDbUrl, `
      SELECT jsonb_build_object(
        'authAclNamesAccountRole', EXISTS (SELECT 1 FROM pg_namespace n, aclexplode(n.nspacl) a
                                            WHERE n.nspname = 'auth' AND a.grantee::regrole::text LIKE 'account\\_%'),
        'uidAclNamesAccountRole', EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                                           WHERE p.oid = 'auth.uid()'::regprocedure AND a.grantee::regrole::text LIKE 'account\\_%'));`)
    assert.deepEqual(r, { authAclNamesAccountRole: false, uidAclNamesAccountRole: false })
    const anon = http(stack, 'GET', '/rest/v1/account_participation_profiles?select=account_id')
    return anon.then(res => assert.ok(res.status === 401 || res.status === 403, describe(res)))
  })
})
