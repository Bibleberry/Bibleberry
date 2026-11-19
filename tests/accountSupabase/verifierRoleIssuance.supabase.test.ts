/**
 * R13-SB1 Deliverable B — real custom-role and private issuance acceptance on local Supabase.
 *
 * A dedicated, EPHEMERAL database LOGIN role is created for this run only and granted the
 * accepted `account_award_verifier` group. It connects directly over loopback TCP (exactly how a
 * future verifier service would), never as postgres/service_role. Its random password lives in
 * memory only and the role is dropped at the end. It is NOT an app user and NOT a deployment.
 *
 * Claims are nominated by real GoTrue users through real PostgREST; issuance uses synthetic
 * trusted-fixture attestations (no Sanity access, all editorial data synthetic).
 *
 * Run only through scripts/accountSupabase/run-local-supabase-acceptance.sh.
 */
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { after, before, describe as suite, test } from 'node:test'
import {
  bearer,
  describe,
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

// Responses are dynamic JSON from the real API under test; fields are asserted individually.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>

const run = uniqueSuffix()
const LOGIN = `sb1_verifier_login_${run}`
const HOPE = 'card:monthly:2026-10:hope'
const FAITH = 'card:monthly:2026-10:faith'

let stack: LocalStack
let verifierUrl: string
let userC: TestUser
let userD: TestUser
let firstReceiptKey: string

function body(result: HttpResult): Json {
  return result.body as Json
}

/** One SQL call as the dedicated verifier login (direct DB connection, not SET ROLE from an admin). */
function asVerifier(sql: string, vars: Record<string, string> = {}) {
  return psql(verifierUrl, sql, vars)
}

function asVerifierJson<T = Json>(sql: string, vars: Record<string, string> = {}): T {
  return psqlJson<T>(verifierUrl, sql, vars)
}

function admit(attestation: Json): Json {
  return asVerifierJson(`SELECT account_issuance.admit_verified_award(:'att'::jsonb);`, {
    att: JSON.stringify(attestation),
  })
}

function attestation(accountId: string, awardId: string, basis: string[], extra: Json = {}): Json {
  const slug = awardId.slice(21)
  return {
    verificationKey: `sb1-run-${run}`,
    verifierVersion: 'r13-sb1-local',
    accountId,
    awardId,
    discoveryId: `discovery:${awardId.slice(13)}`,
    kind: slug === 'full-month' ? 'fullMonth' : 'thematic',
    publicationYearMonth: awardId.slice(13, 20),
    rosterVersion: 1,
    targetCount: basis.length,
    basisChallengeIds: basis,
    latestBasisReleaseDate: '2026-10-02',
    verifiedThroughDate: '2026-11-01',
    card: syntheticCard(awardId.slice(13, 20), slug),
    source: { documentId: `month-${awardId.slice(13, 20)}`, revision: 'rev1', dataset: 'staging', perspective: 'published' },
    ...extra,
  }
}

function expectDenied(result: { ok: boolean; stderr: string }, pattern: RegExp, label: string): void {
  assert.equal(result.ok, false, `${label} must be denied`)
  assert.match(result.stderr, pattern, `${label}: ${result.stderr}`)
}

suite('R13-SB1 B: dedicated verifier login + private issuance on real Supabase', { skip: skipReason }, () => {
  before(async () => {
    stack = loadStack()
    const password = randomBytes(24).toString('hex')
    // Created by the Supabase migration-runner identity (postgres, CREATEROLE, not superuser),
    // exactly as a future provisioning step would have to.
    psqlOk(stack.adminDbUrl, `
      SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
                    :'login', :'pw') \\gexec
      SELECT format('GRANT account_award_verifier TO %I', :'login') \\gexec
    `, { login: LOGIN, pw: password })
    verifierUrl = `postgresql://${LOGIN}:${password}@127.0.0.1:${stack.dbPort}/postgres`

    userC = await signUpUser(stack, `c-${run}`)
    userD = await signUpUser(stack, `d-${run}`)
    firstReceiptKey = `sb1-c-transfer-${run}`
    const nominate = await rpc(stack, 'reconcile_guest_participation', reconcilePayload({
      key: firstReceiptKey,
      expectedRevision: 0,
      mode: 'newAccountTransfer',
      data: {
        completedChallenges: {
          'cms:sb1-v1': { completedOn: '2026-10-03' },
          'cms:sb1-v2': { completedOn: '2026-10-04' },
          'cms:sb1-v3': { completedOn: '2026-10-05' },
        },
        earnedAwards: {
          [HOPE]: { earnedOn: '2026-10-04', cardViewed: true, earnedCard: syntheticCard('2026-10', 'hope') },
          [FAITH]: { earnedOn: '2026-10-05' },
        },
      },
    }), bearer(userC.accessToken))
    assert.equal(body(nominate).status, 'committed', describe(nominate))
  })

  after(() => {
    if (!stack) return
    // Remove the ephemeral login; its only privilege was the group membership.
    psql(stack.adminDbUrl, `SELECT format('DROP ROLE IF EXISTS %I', :'login') \\gexec`, { login: LOGIN })
  })

  test('B1 group/owner roles are NOLOGIN, non-bypass; the dedicated login connects directly', () => {
    const roles = psqlJson<Json[]>(stack.adminDbUrl, `
      SELECT jsonb_agg(jsonb_build_object('r', rolname, 'login', rolcanlogin, 'super', rolsuper,
                                          'bypass', rolbypassrls, 'inherit', rolinherit) ORDER BY rolname)
        FROM pg_roles WHERE rolname IN ('account_reconciler','account_award_issuer','account_award_verifier');`)
    assert.deepEqual(roles, ['account_award_issuer', 'account_award_verifier', 'account_reconciler'].map(r => ({
      r, login: false, super: false, bypass: false, inherit: false,
    })))
    for (const role of ['account_award_verifier', 'account_award_issuer', 'account_reconciler']) {
      const attempt = psql(`postgresql://${role}:anything@127.0.0.1:${stack.dbPort}/postgres`, 'SELECT 1;')
      assert.equal(attempt.ok, false, `${role} must not be able to log in`)
    }
    const who = asVerifierJson<Json>(`SELECT jsonb_build_object('session', session_user, 'current', current_user,
      'super', (SELECT rolsuper FROM pg_roles WHERE rolname = current_user),
      'bypass', (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user));`)
    assert.deepEqual(who, { session: LOGIN, current: LOGIN, super: false, bypass: false })
  })

  test('B2 role switching: login may only become the verifier group, never an owner or API role', () => {
    const ok = asVerifierJson<Json>(`SET ROLE account_award_verifier;
      SELECT jsonb_build_object('session', session_user, 'current', current_user);`)
    assert.deepEqual(ok, { session: LOGIN, current: 'account_award_verifier' })
    for (const role of ['account_award_issuer', 'account_reconciler', 'postgres', 'service_role',
      'authenticated', 'anon', 'supabase_admin', 'authenticator']) {
      expectDenied(asVerifier(`SET ROLE ${role};`), /permission denied to set role/, `SET ROLE ${role}`)
    }
  })

  test('B3 the login has no direct data, client-RPC, helper or auth access', () => {
    const tables = psqlOk(stack.adminDbUrl, `SELECT string_agg(relname, ' ') FROM pg_class c JOIN pg_namespace n
      ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND relkind = 'r' AND relname LIKE 'account\\_%';`).split(' ')
    for (const table of tables) {
      expectDenied(asVerifier(`SELECT count(*) FROM public.${table};`), /permission denied for table/, `SELECT ${table}`)
      expectDenied(asVerifier(`DELETE FROM public.${table};`), /permission denied for table/, `DELETE ${table}`)
    }
    expectDenied(asVerifier('SELECT count(*) FROM auth.users;'), /permission denied/, 'auth.users')
    // A hand-set JWT claim in a direct SQL session does not open the client RPCs: no EXECUTE.
    expectDenied(asVerifier(`SELECT set_config('request.jwt.claims', :'c', false);
      SELECT public.get_account_participation();`, { c: JSON.stringify({ sub: userC.id, role: 'authenticated' }) }),
    /permission denied for function get_account_participation/, 'get_account_participation')
    expectDenied(asVerifier(`SELECT public.reconcile_guest_participation('{}'::jsonb);`),
      /permission denied for function reconcile_guest_participation/, 'reconcile_guest_participation')
    expectDenied(asVerifier(`SELECT account_private.parse_award_id('x');`), /permission denied for schema account_private/,
      'account_private helpers')
    expectDenied(asVerifier('SELECT account_issuance.current_account();'), /permission denied for function current_account/,
      'issuer-internal current_account()')
  })

  test('B4 pending-claim listing and per-claim context are confined to real claims', () => {
    const pending = asVerifierJson<Json[]>(`SELECT coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
      FROM account_issuance.list_pending_award_claims(500) p;`)
    const mine = pending.filter(p => p.account_id === userC.id).map(p => p.award_id).sort()
    assert.deepEqual(mine, [FAITH, HOPE])
    for (const row of pending) {
      assert.deepEqual(Object.keys(row).sort().filter(k => /snapshot|card|image|url/i.test(k)), [],
        'listing exposes identifiers/dates only, never client card data')
    }
    const ctx = asVerifierJson(`SELECT account_issuance.get_claim_verification_context(:'a'::uuid, :'w');`,
      { a: userC.id, w: HOPE })
    assert.equal(ctx.status, 'pending')
    assert.deepEqual(ctx.completedChallengeIds, ['cms:sb1-v1', 'cms:sb1-v2', 'cms:sb1-v3'])
    for (const [acct, award] of [[userD.id, HOPE], [userC.id, 'card:monthly:2026-09:hope']]) {
      const none = asVerifierJson(`SELECT account_issuance.get_claim_verification_context(:'a'::uuid, :'w');`,
        { a: acct, w: award })
      assert.deepEqual(none, { status: 'noPendingClaim' }, 'no completions disclosed without a claim')
    }
  })

  test('B5 deferral is private and leaves the claim and reader state unchanged', async () => {
    const before = await rpc(stack, 'get_account_participation', {}, bearer(userC.accessToken))
    const deferred = asVerifierJson(`SELECT account_issuance.record_verification_deferral(:'a'::uuid, :'w', 'cardNotApproved', 1);`,
      { a: userC.id, w: FAITH })
    assert.deepEqual(deferred, { status: 'deferred', reason: 'cardNotApproved' })
    const after = await rpc(stack, 'get_account_participation', {}, bearer(userC.accessToken))
    assert.deepEqual(body(after), body(before), 'reader readback unchanged; deferral reason is private')
    const leaks = await rpc(stack, 'get_account_participation', {}, bearer(userC.accessToken))
    assert.equal(JSON.stringify(body(leaks)).includes('cardNotApproved'), false)
  })

  test('B6 admission: success, duplicate, cross-account, unclaimed, foreign basis and self-assertion', async () => {
    const forged = admit(attestation(userC.id, HOPE, ['cms:sb1-v1', 'cms:sb1-v2'], { verified: true }))
    assert.equal(forged.status, 'rejected', 'extra self-asserted field rejected')
    assert.equal(admit(attestation(userD.id, HOPE, ['cms:sb1-v1', 'cms:sb1-v2'])).status, 'noPendingClaim',
      'cannot admit for an account that never claimed (C basis replayed onto D)')
    assert.equal(admit(attestation(userC.id, 'card:monthly:2026-10:love', ['cms:sb1-v1'])).status, 'noPendingClaim',
      'issuer can never mint an unclaimed award')
    const foreign = admit(attestation(userC.id, HOPE, ['cms:sb1-v1', 'cms:sb1-not-mine']))
    assert.equal(foreign.status, 'rejected')
    assert.equal(foreign.detail, 'basisNotInAccountCompletions')

    const admitted = admit(attestation(userC.id, HOPE, ['cms:sb1-v1', 'cms:sb1-v2']))
    assert.equal(admitted.status, 'admitted', JSON.stringify(admitted))
    const replay = admit(attestation(userC.id, HOPE, ['cms:sb1-v1', 'cms:sb1-v2']))
    assert.equal(replay.status, 'alreadyEarned', 'duplicate/retry is idempotent')

    const read = body(await rpc(stack, 'get_account_participation', {}, bearer(userC.accessToken)))
    assert.ok(read.envelope.data.earnedAwards[HOPE], 'admitted award visible to its owner through PostgREST')
    assert.equal(read.envelope.data.earnedAwards[HOPE].earnedCard.imageUrl, syntheticCard('2026-10', 'hope').imageUrl)
    assert.deepEqual(read.pendingAwardVerification, [FAITH])
    const counts = psqlJson<Json>(stack.adminDbUrl, `SELECT jsonb_build_object(
        'c_awards', (SELECT count(*) FROM public.account_earned_awards WHERE account_id = :'c'::uuid),
        'd_awards', (SELECT count(*) FROM public.account_earned_awards WHERE account_id = :'d'::uuid),
        'attest', (SELECT count(*) FROM public.account_award_admission_attestations WHERE account_id = :'c'::uuid),
        'claims', (SELECT count(*) FROM public.account_provisional_award_claims WHERE account_id = :'c'::uuid));`,
    { c: userC.id, d: userD.id })
    assert.deepEqual(counts, { c_awards: 1, d_awards: 0, attest: 1, claims: 1 })
  })

  test('B7 earned artwork/rights are immutable; receipts are never retroactively upgraded', async () => {
    const before = psqlOk(stack.adminDbUrl, `SELECT earned_card_snapshot::text || '|' || earned_on
      FROM public.account_earned_awards WHERE account_id = :'c'::uuid AND award_id = :'w';`, { c: userC.id, w: HOPE })
    const rev = body(await rpc(stack, 'get_account_participation', {}, bearer(userC.accessToken))).revision as number
    const tamper = await rpc(stack, 'reconcile_guest_participation', reconcilePayload({
      key: `sb1-c-tamper-${run}`,
      expectedRevision: rev,
      mode: 'existingAccountMerge',
      data: { earnedAwards: { [HOPE]: {
        earnedOn: '2026-10-04', hubAnnouncementAcked: true,
        earnedCard: { ...syntheticCard('2026-10', 'hope'), imageUrl: 'https://cdn.sanity.io/images/sb1test/staging/zzz999-1x1.png', shareEligible: false },
      }, [FAITH]: { earnedOn: '2026-10-05' } } },
    }), bearer(userC.accessToken))
    assert.equal(body(tamper).status, 'committed', describe(tamper))
    // The guest still holds the unverified FAITH claim, so this fresh receipt must still
    // require guest retention (per-commit semantics, matching accepted V3b).
    assert.equal(body(tamper).receipt.unresolvedPersistedOnServer, false)
    assert.deepEqual(body(tamper).provisionalAwardClaims, [FAITH])
    const afterTamper = psqlOk(stack.adminDbUrl, `SELECT earned_card_snapshot::text || '|' || earned_on
      FROM public.account_earned_awards WHERE account_id = :'c'::uuid AND award_id = :'w';`, { c: userC.id, w: HOPE })
    assert.equal(afterTamper, before, 'client cannot re-skin/re-date an earned card')
    assert.equal(psqlOk(stack.adminDbUrl, `SELECT hub_announcement_acked FROM public.account_earned_awards
      WHERE account_id = :'c'::uuid AND award_id = :'w';`, { c: userC.id, w: HOPE }), 't', 'flags still OR')

    assert.equal(admit(attestation(userC.id, FAITH, ['cms:sb1-v3'])).status, 'admitted')
    const original = await rpc(stack, 'reconcile_guest_participation', reconcilePayload({
      key: firstReceiptKey, expectedRevision: 0, mode: 'newAccountTransfer', data: {},
    }), bearer(userC.accessToken))
    assert.equal(body(original).status, 'alreadyCommittedDuplicate')
    assert.equal(body(original).receipt.unresolvedPersistedOnServer, false, 'old receipt is immutable')

    const fresh = await rpc(stack, 'reconcile_guest_participation', reconcilePayload({
      key: `sb1-c-fresh-${run}`,
      expectedRevision: body(await rpc(stack, 'get_account_participation', {}, bearer(userC.accessToken))).revision,
      mode: 'existingAccountMerge',
      data: { earnedAwards: { [HOPE]: { earnedOn: '2026-10-04' }, [FAITH]: { earnedOn: '2026-10-05' } } },
    }), bearer(userC.accessToken))
    assert.equal(body(fresh).status, 'committed', describe(fresh))
    assert.equal(body(fresh).receipt.unresolvedPersistedOnServer, true, 'only a fresh reconcile, after all claims are verified')
  })

  test('B8 privilege catalog under Supabase default privileges matches the accepted design', () => {
    const report = psqlJson<Json>(stack.adminDbUrl, `
      WITH fn AS (
        SELECT p.oid, n.nspname || '.' || p.proname AS name FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname IN ('account_private', 'account_issuance')
            OR (n.nspname = 'public' AND p.proname IN ('reconcile_guest_participation', 'get_account_participation'))
      ), tbl AS (
        SELECT c.oid, c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'account\\_%'
      )
      SELECT jsonb_build_object(
        'fnExec', (SELECT jsonb_object_agg(r, (SELECT coalesce(jsonb_agg(name ORDER BY name), '[]') FROM fn
                    WHERE has_function_privilege(r, fn.oid, 'EXECUTE')))
                     FROM unnest(ARRAY['anon','authenticated','service_role','account_award_verifier']) r),
        'anonTable', (SELECT coalesce(jsonb_agg(name), '[]') FROM tbl
                       WHERE has_table_privilege('anon', tbl.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')),
        'authWrite', (SELECT coalesce(jsonb_agg(name), '[]') FROM tbl
                       WHERE has_table_privilege('authenticated', tbl.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')),
        'authRead', (SELECT jsonb_agg(name ORDER BY name) FROM tbl WHERE has_table_privilege('authenticated', tbl.oid, 'SELECT')),
        'rlsOff', (SELECT coalesce(jsonb_agg(c.relname), '[]') FROM pg_class c JOIN tbl ON tbl.oid = c.oid
                    WHERE NOT c.relrowsecurity),
        'serviceRolePrivate', (SELECT coalesce(jsonb_agg(name), '[]') FROM tbl
                    WHERE name IN ('account_award_admission_attestations', 'account_award_verification_attempts')
                      AND has_table_privilege('service_role', tbl.oid, 'SELECT,INSERT,UPDATE,DELETE')),
        'ownerAuthUsers', (SELECT jsonb_agg(r) FROM unnest(ARRAY['account_reconciler','account_award_issuer','account_award_verifier']) r
                    WHERE has_table_privilege(r, 'auth.users', 'SELECT,INSERT,UPDATE,DELETE')),
        'schemaUsage', (SELECT jsonb_object_agg(s, (SELECT coalesce(jsonb_agg(r ORDER BY r), '[]')
                    FROM unnest(ARRAY['anon','authenticated','service_role']) r WHERE has_schema_privilege(r, s, 'USAGE')))
                    FROM unnest(ARRAY['account_private','account_issuance']) s)
      );`)
    assert.deepEqual(report.fnExec.anon, [])
    assert.deepEqual(report.fnExec.service_role, [], 'service_role cannot execute any account function')
    assert.deepEqual(report.fnExec.authenticated, ['public.get_account_participation', 'public.reconcile_guest_participation'])
    assert.deepEqual(report.fnExec.account_award_verifier, [
      'account_issuance.admit_verified_award', 'account_issuance.get_claim_verification_context',
      'account_issuance.list_pending_award_claims', 'account_issuance.record_verification_deferral',
    ])
    assert.deepEqual(report.anonTable, [], 'Supabase default grants to anon were fully revoked')
    assert.deepEqual(report.authWrite, [], 'authenticated has no write privilege on any account table')
    assert.equal(report.authRead.includes('account_award_admission_attestations'), false)
    assert.equal(report.authRead.includes('account_award_verification_attempts'), false)
    assert.deepEqual(report.rlsOff, [], 'RLS enabled on every account table')
    assert.deepEqual(report.serviceRolePrivate, [], 'service_role has no access to private issuance audit tables')
    assert.equal(report.ownerAuthUsers, null, 'no owner role touches auth.users')
    assert.deepEqual(report.schemaUsage, { account_private: [], account_issuance: [] })
  })
})
