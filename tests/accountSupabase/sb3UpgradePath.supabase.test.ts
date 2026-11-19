/**
 * R13-SB3 (Granite Sparrow, Issue #236) — F1 reproduction and the local UPGRADE path.
 *
 * Two phases, run by scripts/accountSupabase/run-local-supabase-acceptance.sh:
 *   SB3_PHASE=pre   on the accepted R13-3 + TX1 + VERIFY1 schema (BEFORE R13-SB3):
 *                   reproduces F1 and the related direct-DML bypasses with the real service-role
 *                   credential (each must SUCCEED, or this is not the vulnerable baseline), removes
 *                   the forged rows, then seeds legitimately earned history through the real
 *                   reconcile RPC and the dedicated verifier login, and records row digests.
 *   SB3_PHASE=post  after R13-SB3 was applied ON TOP of that data: every vector is denied with the
 *                   database unchanged, the pre-existing history is byte-identical, and the
 *                   preserved pending claim is still admissible exactly once by the verifier.
 *
 * The state file (SB3_STATE_FILE, a runner-owned temp file) holds only synthetic user ids and
 * md5 digests: no key, token, password or Card content. Output is redacted by the runner.
 */
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
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
import type { HttpResult, LocalStack } from './lib/localStack.ts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>

const PHASE = process.env.SB3_PHASE
const STATE_FILE = process.env.SB3_STATE_FILE
const YM = '2026-08'
const HOPE = `card:monthly:${YM}:hope`
const FAITH = `card:monthly:${YM}:faith`
const FORGED = `card:monthly:${YM}:forged`
const BASIS = ['cms:sb3-u1', 'cms:sb3-u2', 'cms:sb3-u3']
const TABLES = [
  'account_award_admission_attestations', 'account_award_verification_attempts', 'account_completed_challenges',
  'account_earned_awards', 'account_in_progress_challenges', 'account_participation_profiles',
  'account_provisional_award_claims', 'account_reconciliation_receipts', 'account_reconciliation_unresolved_items',
  'account_saved_challenges', 'account_saved_scriptures', 'account_shelf_months',
]

const run = uniqueSuffix()
const LOGIN = `sb3_upgrade_verifier_${PHASE ?? 'x'}_${run}`
let stack: LocalStack
let verifierUrl: string

const skip = skipReason || (!PHASE || !STATE_FILE ? 'SB3_PHASE and SB3_STATE_FILE are set only by the runner' : false)

/** md5 of one account's rows in every account table (as the owner). */
function accountDigests(accountId: string): Record<string, string> {
  return psqlJson<Record<string, string>>(stack.adminDbUrl, `
    SELECT jsonb_object_agg(t, d) FROM (
      ${TABLES.map(t => `SELECT '${t}' AS t, md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) AS d FROM public.${t} x WHERE x.account_id = :'a'::uuid`).join(' UNION ALL ')}
    ) s;`, { a: accountId })
}

function countFor(accountId: string): number {
  return Number(psqlOk(stack.adminDbUrl, `SELECT ${TABLES.map(t => `(SELECT count(*) FROM public.${t} WHERE account_id = :'a'::uuid)`).join(' + ')};`, { a: accountId }))
}

function admit(accountId: string, awardId: string): Json {
  return psqlJson<Json>(verifierUrl, `SELECT account_issuance.admit_verified_award(:'att'::jsonb);`, {
    att: JSON.stringify({
      verificationKey: `sb3-upgrade-${run}`, verifierVersion: 'r13-sb3-local', accountId, awardId,
      discoveryId: `discovery:${awardId.slice(13)}`, kind: 'thematic', publicationYearMonth: YM,
      rosterVersion: 1, targetCount: 2, basisChallengeIds: BASIS.slice(0, 2),
      latestBasisReleaseDate: `${YM}-02`, verifiedThroughDate: `${YM}-25`,
      card: syntheticCard(YM, awardId.slice(21)),
      source: { documentId: `month-${YM}`, revision: 'rev1', dataset: 'staging', perspective: 'published' },
    }),
  })
}

/**
 * The F1 vector set, as the real service-role JWT over PostgREST, against synthetic user R, plus
 * two SQL-level ones as service_role (TRIGGER / TRUNCATE) inside a rolled-back transaction.
 * Returns one "label=status" line per attempt (redaction-safe: no bodies).
 */
async function attack(rId: string): Promise<{ lines: string[]; results: Record<string, number> }> {
  const svc = { headers: { ...bearer(stack.serviceRoleJwtKey), Prefer: 'return=minimal' }, apikey: stack.secretKey }
  const results: Record<string, number> = {}
  const record = (label: string, r: HttpResult) => { results[label] = r.status }
  record('P1 POST earned award (no claim/attestation)', await http(stack, 'POST', '/rest/v1/account_earned_awards', { ...svc, body: {
    account_id: rId, award_id: FORGED, kind: 'thematic', publication_year_month: YM, discovery_id: `discovery:${YM}:forged`,
    earned_on: `${YM}-05`, date_provenance: 'serverVerified', card_document_id: 'card-forged', earned_card_snapshot: syntheticCard(YM, 'forged') } }))
  record('P2 PATCH earned award earned_on', await http(stack, 'PATCH', `/rest/v1/account_earned_awards?account_id=eq.${rId}`, { ...svc, body: { earned_on: `${YM}-01` } }))
  record('P3 DELETE earned award history', await http(stack, 'DELETE', `/rest/v1/account_earned_awards?account_id=eq.${rId}`, svc))
  record('P4 POST forged completion (verifier basis)', await http(stack, 'POST', '/rest/v1/account_completed_challenges', { ...svc, body: {
    account_id: rId, challenge_id: BASIS[0], completed_on: `${YM}-03`, date_provenance: 'serverVerified' } }))
  record('P5 POST forged pending claim (nomination)', await http(stack, 'POST', '/rest/v1/account_provisional_award_claims', { ...svc, body: {
    account_id: rId, award_id: HOPE, kind: 'thematic', publication_year_month: YM, discovery_id: `discovery:${YM}:hope`,
    claimed_earned_on: `${YM}-02`, last_idempotency_key: 'forged' } }))
  record('P6 PATCH claim claimed_earned_on', await http(stack, 'PATCH', `/rest/v1/account_provisional_award_claims?account_id=eq.${rId}`, { ...svc, body: { claimed_earned_on: `${YM}-01` } }))
  record('P7 POST forged receipt (unresolvedPersistedOnServer=true)', await http(stack, 'POST', '/rest/v1/account_reconciliation_receipts', { ...svc, body: {
    account_id: rId, idempotency_key: 'forged', mode: 'newAccountTransfer', guest_payload_digest: 'forged',
    committed_revision: 1, outcome_status: 'committed', unresolved_persisted_on_server: true } }))
  for (const [label, sql] of [
    ['P8 SQL CREATE TRIGGER on an account table', 'CREATE TRIGGER sb3_probe BEFORE INSERT ON public.account_saved_challenges FOR EACH ROW EXECUTE FUNCTION suppress_redundant_updates_trigger()'],
    ['P9 SQL TRUNCATE account_completed_challenges', 'TRUNCATE public.account_completed_challenges'],
  ]) {
    const r = psql(stack.adminDbUrl, `BEGIN; SET LOCAL ROLE service_role; ${sql}; ROLLBACK;`)
    results[label] = r.ok ? 0 : /permission denied/.test(r.stderr) ? 42501 : -1
  }
  return { lines: Object.entries(results).map(([k, v]) => `${k} = ${v === 0 ? 'SQL ok' : v === 42501 ? 'SQL 42501 denied' : v}`), results }
}

suite(`R13-SB3 upgrade path (${PHASE ?? 'unset'}): F1 before, denial and preserved history after`, { skip }, () => {
  before(() => {
    stack = loadStack()
    const password = randomBytes(24).toString('hex')
    psqlOk(stack.adminDbUrl, `
      SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', :'login', :'pw') \\gexec
      SELECT format('GRANT account_award_verifier TO %I', :'login') \\gexec
    `, { login: LOGIN, pw: password })
    verifierUrl = `postgresql://${LOGIN}:${password}@127.0.0.1:${stack.dbPort}/postgres`
  })

  after(() => {
    if (stack) psql(stack.adminDbUrl, `SELECT format('DROP ROLE IF EXISTS %I', :'login') \\gexec`, { login: LOGIN })
  })

  if (PHASE === 'pre') {
    test('U0 baseline is the accepted pre-SB3 schema (R13-3, TX1, VERIFY1 only)', () => {
      assert.equal(psqlOk(stack.adminDbUrl, `SELECT string_agg(version, ' ' ORDER BY version) FROM supabase_migrations.schema_migrations;`),
        '20261116000001 20261118000001 20261118000002')
    })

    test('U1 F1 reproduced: the service-role credential mints, rewrites and destroys awards and forges evidence', async t => {
      const r = await signUpUser(stack, `sb3-r-${run}`)
      const { lines, results } = await attack(r.id)
      for (const line of lines) t.diagnostic(`F1-pre ${line}`)
      assert.deepEqual(results, {
        'P1 POST earned award (no claim/attestation)': 201,
        'P2 PATCH earned award earned_on': 204,
        'P3 DELETE earned award history': 204,
        'P4 POST forged completion (verifier basis)': 201,
        'P5 POST forged pending claim (nomination)': 201,
        'P6 PATCH claim claimed_earned_on': 204,
        'P7 POST forged receipt (unresolvedPersistedOnServer=true)': 201,
        'P8 SQL CREATE TRIGGER on an account table': 0,
        'P9 SQL TRUNCATE account_completed_challenges': 0,
      }, 'this must be the vulnerable baseline')
      // The forged rows really landed (state, not just status codes), then are removed.
      assert.equal(countFor(r.id), 3, 'forged completion + forged claim + forged receipt persisted')
      psqlOk(stack.adminDbUrl, `
        DELETE FROM public.account_reconciliation_receipts WHERE account_id = :'r'::uuid;
        DELETE FROM public.account_provisional_award_claims WHERE account_id = :'r'::uuid;
        DELETE FROM public.account_completed_challenges WHERE account_id = :'r'::uuid;`, { r: r.id })
      assert.equal(countFor(r.id), 0)
      fs.writeFileSync(STATE_FILE!, JSON.stringify({ r: r.id }), { mode: 0o600 })
    })

    test('U2 seed legitimately earned history: real reconcile + dedicated verifier admission', async () => {
      const u = await signUpUser(stack, `sb3-u-${run}`)
      const nominate = await rpc(stack, 'reconcile_guest_participation', reconcilePayload({
        key: `sb3-u1-${run}`, expectedRevision: 0, mode: 'newAccountTransfer',
        data: {
          completedChallenges: Object.fromEntries(BASIS.map((c, i) => [c, { completedOn: `${YM}-0${i + 3}` }])),
          savedChallenges: { [BASIS[2]]: { savedOn: `${YM}-05` } },
          earnedAwards: { [FAITH]: { earnedOn: `${YM}-04`, cardViewed: true }, [HOPE]: { earnedOn: `${YM}-06` } },
        },
      }), bearer(u.accessToken))
      assert.equal((nominate.body as Json).status, 'committed', describe(nominate))
      const admitted = admit(u.id, FAITH)
      assert.equal(admitted.status, 'admitted', JSON.stringify(admitted))
      const earned = psqlJson<Json>(stack.adminDbUrl, `SELECT jsonb_build_object('earnedOn', earned_on, 'provenance', date_provenance,
          'claimed', client_claimed_on, 'viewed', card_viewed, 'acked', hub_announcement_acked, 'card', card_document_id)
        FROM public.account_earned_awards WHERE account_id = :'u'::uuid AND award_id = :'w';`, { u: u.id, w: FAITH })
      assert.deepEqual(earned, { earnedOn: `${YM}-04`, provenance: 'clientReported', claimed: `${YM}-04`, viewed: true, acked: false, card: 'card-faith' })
      const state = JSON.parse(fs.readFileSync(STATE_FILE!, 'utf8'))
      fs.writeFileSync(STATE_FILE!, JSON.stringify({ ...state, u: u.id, earned, digests: accountDigests(u.id) }), { mode: 0o600 })
    })
  }

  if (PHASE === 'post') {
    test('U3 R13-SB3 was applied on top of the populated accepted schema', () => {
      assert.equal(psqlOk(stack.adminDbUrl, `SELECT string_agg(version, ' ' ORDER BY version) FROM supabase_migrations.schema_migrations;`),
        '20261116000001 20261118000001 20261118000002 20261119000001')
    })

    test('U4 pre-existing earned history, dates, flags, attestation, claims and receipts are byte-identical', () => {
      const state = JSON.parse(fs.readFileSync(STATE_FILE!, 'utf8'))
      assert.deepEqual(accountDigests(state.u), state.digests, 'no pre-existing row changed')
      assert.equal(psqlOk(stack.adminDbUrl, `SELECT count(*) FROM public.account_award_admission_attestations WHERE account_id = :'u'::uuid AND award_id = :'w';`,
        { u: state.u, w: FAITH }), '1')
      assert.equal(psqlOk(stack.adminDbUrl, `SELECT count(*) FROM public.account_provisional_award_claims WHERE account_id = :'u'::uuid AND award_id = :'w';`,
        { u: state.u, w: HOPE }), '1', 'the pending claim survived the upgrade')
    })

    test('U5 F1 fixed: every vector is denied and the database is unchanged', async t => {
      const state = JSON.parse(fs.readFileSync(STATE_FILE!, 'utf8'))
      const before = accountDigests(state.u)
      const { lines, results } = await attack(state.r)
      for (const line of lines) t.diagnostic(`F1-post ${line}`)
      for (const [label, status] of Object.entries(results)) {
        assert.ok(status === 403 || status === 42501, `${label} must be denied, got ${status}`)
      }
      assert.equal(countFor(state.r), 0, 'nothing was written for R')
      assert.deepEqual(accountDigests(state.u), before)
    })

    test('U6 the preserved pending claim is admitted exactly once; the pre-existing award replays as alreadyEarned', () => {
      const state = JSON.parse(fs.readFileSync(STATE_FILE!, 'utf8'))
      const first = admit(state.u, HOPE)
      assert.equal(first.status, 'admitted', JSON.stringify(first))
      assert.equal(admit(state.u, HOPE).status, 'alreadyEarned')
      assert.equal(admit(state.u, FAITH).status, 'alreadyEarned')
      const faith = psqlJson<Json>(stack.adminDbUrl, `SELECT jsonb_build_object('earnedOn', earned_on, 'provenance', date_provenance,
          'claimed', client_claimed_on, 'viewed', card_viewed, 'acked', hub_announcement_acked, 'card', card_document_id)
        FROM public.account_earned_awards WHERE account_id = :'u'::uuid AND award_id = :'w';`, { u: state.u, w: FAITH })
      assert.deepEqual(faith, state.earned, 'historical earned date and flags unchanged by the upgrade and replay')
    })
  }
})
