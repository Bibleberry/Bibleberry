/**
 * R13-VERIFY2 suite D — the PRIVATE verifier runtime on a REAL disposable local Supabase stack.
 *
 * What is real here: GoTrue identities, PostgREST reconciliation (claims are nominated by real
 * user sessions), the Supabase Postgres image with the accepted migrations, a dedicated LOGIN
 * that holds only `account_award_verifier`, the production `pg` executor + database port +
 * run-once orchestration + CLI.
 * What is synthetic: the published Sanity month. The ACCEPTED `createSanityTrustedMonthProvider`
 * runs unchanged, but its fetch is answered in-process from tests/accountVerification/fixtures
 * (no real Sanity request is ever made; CLI child processes preload denyExternalFetch.mjs).
 *
 * Run only through scripts/accountSupabase/run-local-supabase-acceptance.sh.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe as suite, test } from 'node:test'
import pg from 'pg'
import { createPgVerifierExecutor } from '../../scripts/accountVerification/pgSqlExecutor.ts'
import { runVerifierCli } from '../../scripts/accountVerification/run-award-verifier-once.ts'
import type { VerifierRunReport } from '../../src/accountVerification/runOnce.ts'
import { parseVerifierRuntimeConfig } from '../../src/accountVerification/runtimeConfig.ts'
import { isVerifierRuntimeError } from '../../src/accountVerification/runtimeErrors.ts'
import { TRUSTED_AWARD_VERIFICATION_MONTH_GROQ_QUERY } from '../../src/gateway/query.ts'
import type { GatewayFetch } from '../../src/gateway/types.ts'
import { FIXTURE_DATASET, FIXTURE_PROJECT_ID, allActiveCanonical, canonical, makeCard, makeTrustedMonth } from '../accountVerification/fixtures.ts'
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
import type { LocalStack, TestUser } from './lib/localStack.ts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>

const run = uniqueSuffix()
const LOGIN = `r13v2_verifier_${run}`
const NO_GROUP_LOGIN = `r13v2_nogroup_${run}`
const WIDE_LOGIN = `r13v2_wide_${run}`
const BYPASS_LOGIN = `r13v2_bypass_${run}`
const SANITY_TOKEN = `sanity-fixture-token-${randomBytes(8).toString('hex')}`
const ROOT = process.cwd()
const CLI = path.join(ROOT, 'scripts', 'accountVerification', 'run-award-verifier-once.ts')
const DENY_FETCH = path.join(ROOT, 'tests', 'accountSupabase', 'lib', 'denyExternalFetch.mjs')

const award = (ym: string, slug: string) => `card:monthly:${ym}:${slug}`
const art = (ym: string, slug: string) => `trusted-${ym}-${slug}`

let stack: LocalStack
let password: string
const passwords: Record<string, string> = {}
const allOutput: string[] = []
const userIds: string[] = []

// ---------------------------------------------------------------------------
// Synthetic published-perspective Sanity (fixture), answered in-process
// ---------------------------------------------------------------------------

type MonthState = Record<string, unknown> | 'hang' | 'malformed' | 'http401' | 'throw'
interface SanityState {
  months: Record<string, MonthState>
  fallback?: MonthState | null
  requests: number
}

function fakeSanity(state: SanityState): GatewayFetch {
  return async (input, init) => {
    state.requests += 1
    const url = new URL(input instanceof Request ? input.url : String(input))
    // The accepted provider must ask for exactly this, with the server-held token in a header.
    assert.equal(url.hostname, `${FIXTURE_PROJECT_ID}.api.sanity.io`)
    assert.equal(url.searchParams.get('perspective'), 'published')
    assert.equal(url.searchParams.get('query'), TRUSTED_AWARD_VERIFICATION_MONTH_GROQ_QUERY)
    assert.equal(url.pathname.endsWith(`/data/query/${FIXTURE_DATASET}`), true)
    assert.equal(new Headers(init?.headers).get('Authorization'), `Bearer ${SANITY_TOKEN}`)
    assert.equal(url.toString().includes(SANITY_TOKEN), false)
    const ym = JSON.parse(url.searchParams.get('$yearMonth') ?? 'null') as string
    const month = ym in state.months ? state.months[ym] : (state.fallback ?? null)
    if (month === 'hang') {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
      })
    }
    if (month === 'throw') throw new Error(`socket hang up ${SANITY_TOKEN}`)
    if (month === 'http401') return new Response(`{"error":"unauthorized ${SANITY_TOKEN}"}`, { status: 401 })
    if (month === 'malformed') return new Response('<html>gateway timeout</html>', { status: 200 })
    return new Response(JSON.stringify({ result: month }), { status: 200 })
  }
}

function sanity(months: Record<string, MonthState>, fallback: MonthState | null = null): SanityState {
  return { months, fallback, requests: 0 }
}

// ---------------------------------------------------------------------------
// Runtime invocation (in-process CLI entry and real child process)
// ---------------------------------------------------------------------------

function verifierEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    AWARD_VERIFIER_DB_HOST: '127.0.0.1',
    AWARD_VERIFIER_DB_PORT: stack.dbPort,
    AWARD_VERIFIER_DB_USER: LOGIN,
    AWARD_VERIFIER_DB_PASSWORD: password,
    AWARD_VERIFIER_DB_TLS: 'disable',
    AWARD_VERIFIER_SANITY_PROJECT_ID: FIXTURE_PROJECT_ID,
    AWARD_VERIFIER_SANITY_DATASET: FIXTURE_DATASET,
    AWARD_VERIFIER_SANITY_READ_TOKEN: SANITY_TOKEN,
    AWARD_VERIFIER_DB_CONNECT_TIMEOUT_MS: '3000',
    AWARD_VERIFIER_RETRY_BASE_DELAY_MS: '50',
    ...overrides,
  }
}

async function runVerifier(state: SanityState, overrides: Record<string, string | undefined> = {}, now?: () => Date): Promise<VerifierRunReport> {
  const { line, report, exitCode } = await runVerifierCli({ env: verifierEnv(overrides), fetchImpl: fakeSanity(state), now })
  allOutput.push(line)
  assert.equal(exitCode, report.exitCode)
  assert.deepEqual(JSON.parse(line), report, 'the printed line is exactly the report')
  return report
}

interface ChildResult { code: number | null; stdout: string; stderr: string; ms: number }

function spawnCli(env: Record<string, string | undefined>, onStart?: (pid: number) => void): Promise<ChildResult> {
  return new Promise(resolve => {
    const t0 = Date.now()
    const child = spawn(process.execPath, ['--import', DENY_FETCH, '--experimental-strip-types', CLI], {
      cwd: ROOT,
      // A minimal environment: nothing from the test process (no SB1_* keys, no PG* variables).
      env: { PATH: process.env.PATH, NODE_NO_WARNINGS: '1', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', d => { stdout += d })
    child.stderr.on('data', d => { stderr += d })
    if (child.pid) onStart?.(child.pid)
    child.on('close', code => {
      allOutput.push(stdout, stderr)
      resolve({ code, stdout, stderr, ms: Date.now() - t0 })
    })
  })
}

// ---------------------------------------------------------------------------
// Real reader nominations (GoTrue + PostgREST) and admin inspection
// ---------------------------------------------------------------------------

async function newUser(label: string): Promise<TestUser> {
  const user = await signUpUser(stack, `v2-${label}-${run}`)
  userIds.push(user.id)
  return user
}

async function readBack(user: TestUser): Promise<Json> {
  const result = await rpc(stack, 'get_account_participation', {}, bearer(user.accessToken))
  assert.equal(result.status, 200, describe(result))
  return result.body as Json
}

async function nominate(user: TestUser, data: Json): Promise<Json> {
  const current = await readBack(user)
  const revision = current.status === 'notFound' ? 0 : (current.revision as number)
  const result = await rpc(stack, 'reconcile_guest_participation', reconcilePayload({
    key: `v2-${user.label}-${randomBytes(4).toString('hex')}`,
    expectedRevision: revision,
    mode: revision === 0 ? 'newAccountTransfer' : 'existingAccountMerge',
    data,
  }), bearer(user.accessToken))
  assert.equal((result.body as Json).status, 'committed', describe(result))
  return result.body as Json
}

const completions = (ids: string[], on: string) => Object.fromEntries(ids.map(id => [id, { completedOn: on }]))
const claims = (entries: [string, string][]) =>
  Object.fromEntries(entries.map(([id, on]) => [id, { earnedOn: on, cardViewed: false, hubAnnouncementAcked: false }]))

const admin = <T = Json>(sql: string, vars: Record<string, string> = {}) => psqlJson<T>(stack.adminDbUrl, sql, vars)

function earnedRows(user: TestUser): Json[] {
  return admin<Json[]>(`SELECT coalesce(jsonb_agg(jsonb_build_object('award', award_id, 'on', earned_on,
      'snap', earned_card_snapshot, 'prov', date_provenance) ORDER BY award_id), '[]') FROM public.account_earned_awards WHERE account_id = :'a'::uuid;`, { a: user.id })
}

function pendingFor(user: TestUser): string[] {
  return admin<string[]>(`SELECT coalesce(jsonb_agg(award_id ORDER BY award_id), '[]') FROM public.account_provisional_award_claims WHERE account_id = :'a'::uuid;`, { a: user.id })
}

function reasonsFor(user: TestUser): Record<string, string> {
  return admin(`SELECT coalesce(jsonb_object_agg(award_id, last_reason), '{}') FROM public.account_award_verification_attempts WHERE account_id = :'a'::uuid;`, { a: user.id })
}

const pendingTotal = () => Number(psqlOk(stack.adminDbUrl, 'SELECT count(*) FROM public.account_provisional_award_claims;'))
const attemptSnapshot = () => psqlOk(stack.adminDbUrl, `SELECT coalesce(string_agg(account_id || award_id || attempt_count || last_attempt_at, ',' ORDER BY account_id, award_id), '') FROM public.account_award_verification_attempts;`)

function createLogin(name: string, extra = ''): string {
  const pw = randomBytes(24).toString('hex')
  psqlOk(stack.adminDbUrl, `SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION ${extra} PASSWORD %L', :'login', :'pw') \\gexec`, { login: name, pw })
  passwords[name] = pw
  return pw
}

function assertCountsOnly(text: string, label: string) {
  for (const id of userIds) assert.equal(text.includes(id), false, `${label}: account ID in output`)
  for (const secret of [password, SANITY_TOKEN, ...Object.values(passwords)]) assert.equal(text.includes(secret), false, `${label}: credential in output`)
  for (const marker of ['card:monthly:', 'cdn.sanity.io', 'trusted-', 'INTERNAL_STUDIO', 'PRIVATE_CARD', 'postgresql://', '127.0.0.1', LOGIN, 'rev0001']) {
    assert.equal(text.includes(marker), false, `${label}: ${marker} in output`)
  }
}

// ---------------------------------------------------------------------------

suite('R13-VERIFY2 D: private verifier runtime on real local Supabase', { skip: skipReason }, () => {
  before(() => {
    stack = loadStack()
    password = createLogin(LOGIN)
    psqlOk(stack.adminDbUrl, `SELECT format('GRANT account_award_verifier TO %I', :'l') \\gexec`, { l: LOGIN })
  })

  after(() => {
    if (!stack) return
    for (const login of [LOGIN, NO_GROUP_LOGIN, WIDE_LOGIN, BYPASS_LOGIN]) {
      psql(stack.adminDbUrl, `SELECT format('DROP ROLE IF EXISTS %I', :'l') \\gexec`, { l: login })
    }
  })

  test('D1 the production executor connects as the dedicated LOGIN, drops to the verifier group and stays least-privileged', async () => {
    const config = parseVerifierRuntimeConfig(verifierEnv(), { readFile: () => '' })
    const executor = createPgVerifierExecutor(config.database)
    try {
      const [session] = await executor.query(
        `SELECT session_user::text AS login, current_user::text AS role, pg_catalog.current_setting('search_path') AS sp,
                pg_catalog.current_setting('statement_timeout') AS st, pg_catalog.current_setting('transaction_isolation') AS iso,
                pg_catalog.current_setting('application_name') AS app`, [])
      assert.deepEqual(session, { login: LOGIN, role: 'account_award_verifier', sp: '', st: '15s', iso: 'read committed', app: 'bibleberry-award-verifier' })
      const denied = async (sql: string, label: string) => {
        await assert.rejects(executor.query(sql, []), e => isVerifierRuntimeError(e) && e.category === 'authorization' && e.code === '42501', label)
      }
      await denied('SELECT count(*) FROM public.account_earned_awards', 'read earned awards')
      await denied(`INSERT INTO public.account_earned_awards (account_id) VALUES (gen_random_uuid())`, 'direct award grant')
      await denied('SELECT count(*) FROM public.account_award_admission_attestations', 'private audit table')
      await denied(`SELECT public.reconcile_guest_participation('{}'::jsonb)`, 'client RPC')
      await denied(`SELECT account_private.parse_award_id('x')`, 'private helpers')
      await denied('SELECT account_issuance.current_account()', 'issuer internal')
      await denied('SELECT count(*) FROM auth.users', 'auth.users')
      await denied('SET ROLE account_award_issuer', 'become issuer')
      await denied('SET ROLE service_role', 'become service_role')
      // Even back as the bare login there is no table privilege to fall back on.
      await executor.query('RESET ROLE', [])
      await denied('SELECT count(*) FROM public.account_provisional_award_claims', 'login itself')
    } finally {
      await executor.close()
    }
  })

  test('D2 preflight refuses logins that are not least-privileged; bad credentials are authorization failures (no retry)', async () => {
    createLogin(NO_GROUP_LOGIN)
    createLogin(WIDE_LOGIN)
    psqlOk(stack.adminDbUrl, `SELECT format('GRANT account_award_verifier, authenticated TO %I', :'l') \\gexec`, { l: WIDE_LOGIN })
    const bypass = psql(stack.adminDbUrl, `SELECT format('CREATE ROLE %I LOGIN BYPASSRLS PASSWORD %L IN ROLE account_award_verifier', :'l', :'pw') \\gexec`,
      { l: BYPASS_LOGIN, pw: (passwords[BYPASS_LOGIN] = randomBytes(24).toString('hex')) })
    const cases: [string, string, string][] = [
      [NO_GROUP_LOGIN, passwords[NO_GROUP_LOGIN], '42501'], // cannot SET ROLE account_award_verifier
      [WIDE_LOGIN, passwords[WIDE_LOGIN], 'LOGIN_PREFLIGHT'], // also a member of an API role
      [LOGIN, 'wrong-password-0123456789', '28P01'],
    ]
    if (bypass.ok) cases.push([BYPASS_LOGIN, passwords[BYPASS_LOGIN], 'LOGIN_PREFLIGHT'])
    for (const [user, pw, code] of cases) {
      const report = await runVerifier(sanity({}), { AWARD_VERIFIER_DB_USER: user, AWARD_VERIFIER_DB_PASSWORD: pw })
      assert.equal(report.status, 'authorizationFailure', `${user}: ${JSON.stringify(report)}`)
      assert.equal(report.exitCode, 6)
      assert.equal(report.failure?.code, code, user)
      assert.equal(report.retries.database, 0, 'authorization failures are not retried')
      assert.equal(report.examined, 0)
    }
    assert.ok(bypass.ok, `BYPASSRLS login case could not be provisioned by postgres: ${bypass.stderr}`)
    // Privileged / API identities are refused by configuration before any connection.
    for (const user of ['postgres', 'service_role', 'authenticator', 'supabase_admin', 'account_award_issuer']) {
      const report = await runVerifier(sanity({}), { AWARD_VERIFIER_DB_USER: user })
      assert.equal(report.status, 'configurationError', user)
      assert.equal(report.failure?.code, 'AWARD_VERIFIER_DB_USER')
    }
  })

  let userA: TestUser
  let userB: TestUser
  const YM = '2026-09'

  test('D3 complete synthetic claim → trusted month → private admission cycle through the real adapter', async () => {
    userA = await newUser('a')
    userB = await newUser('b')
    await nominate(userA, {
      completedChallenges: completions([canonical(YM, 1), canonical(YM, 3), canonical(YM, 4)], '2026-09-04'),
      earnedAwards: claims([[award(YM, 'shepherd-theme'), '2026-09-03'], [award(YM, 'wisdom-path'), '2026-09-05'],
        [award(YM, 'legacy-seal'), '2026-09-05'], [award(YM, 'full-month'), '2026-09-05']]),
    })
    await nominate(userB, {
      completedChallenges: completions(allActiveCanonical(YM), '2026-09-30'),
      earnedAwards: claims([[award(YM, 'full-month'), '2026-09-30']]),
    })
    const pendingBefore = pendingTotal()
    const state = sanity({ [YM]: makeTrustedMonth(YM) })
    const report = await runVerifier(state, { AWARD_VERIFIER_RUN_ID: `sched-d3-${run}` })
    assert.equal(report.status, 'completed', JSON.stringify(report))
    assert.equal(report.exitCode, 0)
    // Global counts include claims other suites left pending; exact outcomes are asserted per user below.
    assert.ok(report.admitted >= 2, JSON.stringify(report))
    assert.equal(report.examined, pendingBefore)
    assert.equal(report.admitted + report.alreadyEarned + report.deferred + report.skipped, pendingBefore)
    assert.ok((report.deferredByReason.notEligibleUnderCurrentRoster ?? 0) >= 2)
    assert.ok((report.deferredByReason.cardLegacyReservedOnly ?? 0) >= 1)
    assert.ok(state.requests >= 1 && state.requests <= report.batches * 8, 'months are fetched at most once per batch')

    const earnedA = earnedRows(userA)
    assert.deepEqual(earnedA.map(r => r.award), [award(YM, 'shepherd-theme')])
    assert.equal(earnedA[0].snap.imageUrl, `https://cdn.sanity.io/images/${FIXTURE_PROJECT_ID}/${FIXTURE_DATASET}/${art(YM, 'shepherd-theme')}-1200x1600.png`)
    assert.equal(earnedA[0].prov, 'clientReported')
    assert.deepEqual(pendingFor(userA), [award(YM, 'full-month'), award(YM, 'legacy-seal'), award(YM, 'wisdom-path')])
    assert.deepEqual(reasonsFor(userA), {
      [award(YM, 'full-month')]: 'notEligibleUnderCurrentRoster',
      [award(YM, 'legacy-seal')]: 'cardLegacyReservedOnly',
      [award(YM, 'wisdom-path')]: 'notEligibleUnderCurrentRoster',
    })
    assert.deepEqual(earnedRows(userB).map(r => r.award), [award(YM, 'full-month')])
    assert.equal(admin(`SELECT to_jsonb(verification_key) FROM public.account_award_admission_attestations WHERE account_id = :'a'::uuid;`, { a: userA.id }),
      `sched-d3-${run}.b1`, 'deterministic, scheduler-supplied verification key')

    // Readers see only their own trusted result; no unearned Card content, review note or reason.
    const readA = JSON.stringify(await readBack(userA))
    assert.ok(readA.includes(art(YM, 'shepherd-theme')))
    for (const hidden of [art(YM, 'wisdom-path'), art(YM, 'full-month'), 'card-legacy-seal', 'PRIVATE_CARD_REVIEW_NOTE', 'INTERNAL_STUDIO_LABEL',
      'notEligibleUnderCurrentRoster', 'cardLegacyReservedOnly', 'rev0001']) {
      assert.equal(readA.includes(hidden), false, `reader A readback leaked ${hidden}`)
    }
    const readB = JSON.stringify(await readBack(userB))
    assert.equal(readB.includes(userA.id), false, 'owner isolation')
    assert.equal(readB.includes(art(YM, 'shepherd-theme')), false)
  })

  test('D4 replay / retry is idempotent: no duplicate award, no date or snapshot change, no revision bump', async () => {
    const before = { a: earnedRows(userA), b: earnedRows(userB) }
    const revA = (await readBack(userA)).revision
    for (let i = 0; i < 2; i++) {
      const report = await runVerifier(sanity({ [YM]: makeTrustedMonth(YM) }), { AWARD_VERIFIER_RUN_ID: `sched-d3-${run}` })
      assert.equal(report.admitted, 0)
      assert.equal(report.status, 'completed')
    }
    assert.deepEqual(earnedRows(userA), before.a)
    assert.deepEqual(earnedRows(userB), before.b)
    assert.equal((await readBack(userA)).revision, revA, 'deferral replays never bump the reader revision')
    assert.equal(admin(`SELECT count(*) FROM public.account_award_admission_attestations WHERE account_id IN (:'a'::uuid, :'b'::uuid);`, { a: userA.id, b: userB.id }), 2)

    // The reader re-syncs an earned award with an EARLIER date and a forged card: nothing regresses.
    await nominate(userA, { earnedAwards: { [award(YM, 'shepherd-theme')]: { earnedOn: '2026-09-01', cardViewed: true,
      earnedCard: { ...before.a[0].snap, imageUrl: `https://cdn.sanity.io/images/${FIXTURE_PROJECT_ID}/${FIXTURE_DATASET}/forged-1x1.png` } } } })
    const report = await runVerifier(sanity({ [YM]: makeTrustedMonth(YM) }))
    assert.equal(report.admitted, 0)
    const afterRows = earnedRows(userA)
    assert.equal(afterRows[0].on, before.a[0].on, 'earned date never regresses')
    assert.deepEqual(afterRows[0].snap, before.a[0].snap, 'trusted snapshot never re-skinned')
    assert.equal(pendingFor(userA).includes(award(YM, 'shepherd-theme')), false, 'an earned award is never re-quarantined')
  })

  test('D5 unreleased, unapproved, withdrawn and missing Cards/months never become earned or disclose Card content', async () => {
    const userC = await newUser('c')
    const M = '2026-08'
    await nominate(userC, {
      completedChallenges: {
        ...completions(allActiveCanonical(M), '2026-08-31'),
        ...completions([canonical('2026-07', 1), canonical('2026-07', 3)], '2026-07-03'),
        ...completions([canonical('2026-06', 1), canonical('2026-06', 3)], '2026-06-03'),
      },
      earnedAwards: claims([[award(M, 'shepherd-theme'), '2026-08-03'], [award(M, 'wisdom-path'), '2026-08-02'],
        [award(M, 'full-month'), '2026-08-31'], [award(M, 'legacy-seal'), '2026-08-04'],
        [award('2026-07', 'shepherd-theme'), '2026-07-03'], [award('2026-06', 'shepherd-theme'), '2026-06-03']]),
    })
    const withdrawnMonth = makeTrustedMonth('2026-07', { overrides: { withdrawn: true } })
    const others = { '2026-07': withdrawnMonth, [YM]: makeTrustedMonth(YM) }

    // (1) Server clock before the qualifying slots were released everywhere (UTC-12 floor).
    const early = await runVerifier(sanity({ [M]: makeTrustedMonth(M), ...others }), {}, () => new Date('2026-08-01T12:00:00Z'))
    assert.equal(early.status, 'completed')
    assert.deepEqual(earnedRows(userC), [])
    assert.equal(reasonsFor(userC)[award(M, 'shepherd-theme')], 'notEligibleUnderCurrentRoster', 'unreleased slot does not count')
    assert.equal(reasonsFor(userC)[award(M, 'wisdom-path')], 'notEligibleUnderCurrentRoster', 'day 2 not yet released at the UTC-12 floor')
    assert.equal(reasonsFor(userC)[award(M, 'full-month')], 'notEligibleUnderCurrentRoster')

    // (2) Released, but Cards are unapproved (draft), withdrawn, or not linked; month 07 withdrawn; month 06 missing.
    const unapproved = makeTrustedMonth(M, {
      shepherdCard: makeCard(`${M}-shepherd-theme`, 'monthlyThematic', M, { editorialStatus: 'draft' }),
      wisdomCard: makeCard(`${M}-wisdom-path`, 'monthlyThematic', M, { withdrawn: true }),
      fullMonthCard: null,
    })
    const mid = await runVerifier(sanity({ [M]: unapproved, ...others }))
    assert.equal(mid.status, 'completed', JSON.stringify(mid))
    assert.deepEqual(reasonsFor(userC), {
      [award(M, 'shepherd-theme')]: 'cardNotApproved',
      [award(M, 'wisdom-path')]: 'cardNotApproved',
      [award(M, 'full-month')]: 'cardNotLinked',
      [award(M, 'legacy-seal')]: 'cardLegacyReservedOnly',
      [award('2026-07', 'shepherd-theme')]: 'monthNotPublishable',
      [award('2026-06', 'shepherd-theme')]: 'monthNotFound',
    })
    assert.deepEqual(earnedRows(userC), [])
    const read = JSON.stringify(await readBack(userC))
    for (const hidden of [art(M, 'shepherd-theme'), art(M, 'wisdom-path'), art(M, 'full-month'), art('2026-07', 'shepherd-theme'),
      'PRIVATE_CARD_REVIEW_NOTE', 'INTERNAL_STUDIO_LABEL', 'cardNotApproved', 'draft']) {
      assert.equal(read.includes(hidden), false, `unearned Card content leaked: ${hidden}`)
    }
    assert.equal((JSON.parse(read).pendingAwardVerification as string[]).length, 6, 'all claims retained as pending')

    // (3) Editorial approval arrives: exactly the approved Cards are admitted, with the APPROVED snapshot.
    const approved = await runVerifier(sanity({ [M]: makeTrustedMonth(M), ...others }))
    assert.ok(approved.admitted >= 3, JSON.stringify(approved))
    assert.deepEqual(earnedRows(userC).map(r => r.award), [award(M, 'full-month'), award(M, 'shepherd-theme'), award(M, 'wisdom-path')])
    assert.equal(earnedRows(userC).find(r => r.award === award(M, 'wisdom-path'))?.snap.shareEligible, false, 'trusted shareEligible, not the claim')
    assert.deepEqual(pendingFor(userC), [award('2026-06', 'shepherd-theme'), award('2026-07', 'shepherd-theme'), award(M, 'legacy-seal')])
    // A later withdrawal of an admitted Card never revokes or re-skins it.
    const before = earnedRows(userC)
    await runVerifier(sanity({ [M]: unapproved, ...others }))
    assert.deepEqual(earnedRows(userC), before)
  })

  test('D6 concurrent runs (two processes worth of connections) never double-admit', async () => {
    const userD = await newUser('d')
    const userE = await newUser('e')
    await nominate(userD, { completedChallenges: completions([canonical(YM, 1), canonical(YM, 3)], '2026-09-03'),
      earnedAwards: claims([[award(YM, 'shepherd-theme'), '2026-09-03']]) })
    await nominate(userE, { completedChallenges: completions(allActiveCanonical(YM), '2026-09-30'),
      earnedAwards: claims([[award(YM, 'full-month'), '2026-09-30'], [award(YM, 'shepherd-theme'), '2026-09-03']]) })
    const months = { [YM]: makeTrustedMonth(YM) }
    const reports = await Promise.all([1, 2, 3].map(() => runVerifier(sanity(months))))
    assert.ok(reports.reduce((n, r) => n + r.admitted, 0) >= 3, JSON.stringify(reports))
    for (const r of reports) assert.ok(r.status === 'completed' || r.status === 'degraded', r.status)
    assert.equal(admin(`SELECT count(*) FROM public.account_earned_awards WHERE account_id IN (:'d'::uuid, :'e'::uuid);`, { d: userD.id, e: userE.id }), 3)
    assert.equal(admin(`SELECT count(*) FROM public.account_award_admission_attestations WHERE account_id IN (:'d'::uuid, :'e'::uuid);`, { d: userD.id, e: userE.id }), 3)
    assert.deepEqual(pendingFor(userD), [])
  })

  test('D7 lock contention with a reader transaction: statement timeout → bounded retry → admitted once', async () => {
    const userF = await newUser('f')
    await nominate(userF, { completedChallenges: completions([canonical(YM, 1), canonical(YM, 3)], '2026-09-03'),
      earnedAwards: claims([[award(YM, 'shepherd-theme'), '2026-09-03']]) })
    // Hold the SAME per-account advisory lock that TX1 reconciliation and admission take.
    const holder = new pg.Client({ connectionString: stack.adminDbUrl })
    await holder.connect()
    try {
      await holder.query(`SELECT pg_advisory_lock(hashtextextended('bibleberry:account_reconcile:' || $1, 0))`, [userF.id])
      const release = setTimeout(() => {
        void holder.query(`SELECT pg_advisory_unlock(hashtextextended('bibleberry:account_reconcile:' || $1, 0))`, [userF.id])
      }, 2_500)
      const report = await runVerifier(sanity({ [YM]: makeTrustedMonth(YM) }), {
        AWARD_VERIFIER_DB_STATEMENT_TIMEOUT_MS: '1000', AWARD_VERIFIER_RETRY_BASE_DELAY_MS: '800', AWARD_VERIFIER_MAX_ATTEMPTS: '5',
      })
      clearTimeout(release)
      assert.equal(report.status, 'completed', JSON.stringify(report))
      assert.ok(report.retries.database >= 1, 'the timed-out statement was retried')
      assert.ok(report.admitted >= 1)
    } finally {
      await holder.end()
    }
    assert.equal(earnedRows(userF).length, 1)
  })

  test('D8 Sanity outage, hang, 401 and malformed responses: retried, privately deferred, never granted', async () => {
    const userG = await newUser('g')
    await nominate(userG, { completedChallenges: completions([canonical(YM, 1), canonical(YM, 3)], '2026-09-03'),
      earnedAwards: claims([[award(YM, 'shepherd-theme'), '2026-09-03']]) })
    for (const failure of ['hang', 'throw', 'http401', 'malformed'] as const) {
      const total = pendingTotal()
      const state = sanity({}, failure)
      const t0 = Date.now()
      const report = await runVerifier(state, { AWARD_VERIFIER_SANITY_TIMEOUT_MS: '300', AWARD_VERIFIER_MAX_ATTEMPTS: '2' })
      assert.equal(report.status, 'degraded', `${failure}: ${JSON.stringify(report)}`)
      assert.equal(report.exitCode, 3)
      assert.equal(report.admitted, 0)
      assert.equal(report.deferredByReason.trustedSourceUnavailable, total)
      assert.ok(report.retries.sanity >= 1)
      assert.ok(Date.now() - t0 < 15_000, `${failure} bounded`)
      assert.deepEqual(pendingFor(userG), [award(YM, 'shepherd-theme')], 'claim retained')
      assert.equal(reasonsFor(userG)[award(YM, 'shepherd-theme')], 'trustedSourceUnavailable')
    }
    // Outage over: the same claim is admitted on the next run.
    const recovered = await runVerifier(sanity({ [YM]: makeTrustedMonth(YM) }))
    assert.ok(recovered.admitted >= 1)
    assert.equal(earnedRows(userG).length, 1)
  })

  test('D9 database outages (refused, black-holed) are bounded transient failures; deadline aborts deterministically', async () => {
    const free = await new Promise<number>(resolve => {
      const s = net.createServer().listen(0, '127.0.0.1', () => {
        const port = (s.address() as net.AddressInfo).port
        s.close(() => resolve(port))
      })
    })
    const refused = await runVerifier(sanity({}), { AWARD_VERIFIER_DB_PORT: String(free), AWARD_VERIFIER_MAX_ATTEMPTS: '3' })
    assert.equal(refused.status, 'transientFailure')
    assert.equal(refused.exitCode, 5)
    assert.deepEqual(refused.failure, { category: 'transient', code: 'ECONNREFUSED' })
    assert.equal(refused.retries.database, 2)

    const sockets: net.Socket[] = []
    const blackhole = net.createServer(socket => { sockets.push(socket) })
    await new Promise<void>(resolve => blackhole.listen(0, '127.0.0.1', resolve))
    try {
      const t0 = Date.now()
      const hung = await runVerifier(sanity({}), {
        AWARD_VERIFIER_DB_PORT: String((blackhole.address() as net.AddressInfo).port),
        AWARD_VERIFIER_DB_CONNECT_TIMEOUT_MS: '500', AWARD_VERIFIER_MAX_ATTEMPTS: '2',
      })
      assert.equal(hung.status, 'transientFailure', JSON.stringify(hung))
      assert.ok(Date.now() - t0 < 5_000, 'connect timeout bounds a silent database')
    } finally {
      for (const s of sockets) s.destroy()
      blackhole.close()
    }

    // Deadline while the trusted source hangs: aborted, and NOTHING is written for unanswered claims.
    const before = attemptSnapshot()
    const t0 = Date.now()
    const aborted = await runVerifier(sanity({}, 'hang'), {
      AWARD_VERIFIER_DEADLINE_MS: '1500', AWARD_VERIFIER_SANITY_TIMEOUT_MS: '30000', AWARD_VERIFIER_RUN_ID: `slot-d9-${run}`,
    })
    assert.equal(aborted.status, 'aborted')
    assert.equal(aborted.exitCode, 4)
    assert.ok(Date.now() - t0 < 5_000)
    assert.equal(attemptSnapshot(), before, 'no deferral recorded after the deadline')
    // Deterministic restart: the same scheduler slot re-runs cleanly.
    const restarted = await runVerifier(sanity({ [YM]: makeTrustedMonth(YM) }), { AWARD_VERIFIER_RUN_ID: `slot-d9-${run}` })
    assert.equal(restarted.status, 'completed')
    assert.equal(restarted.runId, `slot-d9-${run}`)
  })

  test('D10 hard caps and pagination: bounded work per run, and every pending claim is reached across runs', async () => {
    const userP = await newUser('p')
    await nominate(userP, { earnedAwards: claims(Array.from({ length: 6 }, (_, i) => [award('2026-05', `page-${i + 1}`), '2026-05-10'] as [string, string])) })
    const total = pendingTotal()
    const started = psqlOk(stack.adminDbUrl, 'SELECT clock_timestamp()::text;')
    const runs = Math.ceil(total / 4)
    for (let i = 0; i < runs; i++) {
      const report = await runVerifier(sanity({}), { AWARD_VERIFIER_MAX_CLAIMS_PER_BATCH: '2', AWARD_VERIFIER_MAX_BATCHES: '2' })
      assert.ok(report.examined <= 4, 'hard cap: claims per batch × batches')
      assert.ok(report.batches <= 2)
      if (i < runs - 1) assert.equal(report.moreMayRemain, true)
    }
    assert.equal(admin(`SELECT count(*) FROM public.account_provisional_award_claims c
      LEFT JOIN public.account_award_verification_attempts a USING (account_id, award_id)
      WHERE a.last_attempt_at IS NULL OR a.last_attempt_at < :'t'::timestamptz;`, { t: started }), 0,
    'oldest-attempted-first paging reached every pending claim (no starvation)')
    assert.equal(pendingFor(userP).length, 6, 'deferred claims are never discarded')
  })

  test('D11 the real CLI process: single redacted JSON line, exit codes, SIGTERM graceful shutdown, no network', async () => {
    const secretDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r13v2-secrets-'))
    const pwFile = path.join(secretDir, 'db_password')
    const tokenFile = path.join(secretDir, 'sanity_token')
    fs.writeFileSync(pwFile, `${password}\n`, { mode: 0o600 })
    fs.writeFileSync(tokenFile, SANITY_TOKEN, { mode: 0o600 })
    const env = verifierEnv({ AWARD_VERIFIER_DB_PASSWORD: undefined, AWARD_VERIFIER_DB_PASSWORD_FILE: pwFile,
      AWARD_VERIFIER_SANITY_READ_TOKEN: undefined, AWARD_VERIFIER_SANITY_READ_TOKEN_FILE: tokenFile,
      AWARD_VERIFIER_MAX_ATTEMPTS: '1' })
    try {
      // Config refusal: nothing contacted, exit 2.
      const config = await spawnCli({ ...env, AWARD_VERIFIER_DB_USER: 'postgres' })
      assert.equal(config.code, 2)
      assert.equal(JSON.parse(config.stdout).failure.code, 'AWARD_VERIFIER_DB_USER')
      assert.equal(config.stderr, '')
      const ambient = await spawnCli({ ...env, PGHOST: 'db.example.invalid' })
      assert.equal(ambient.code, 2)
      assert.equal(JSON.parse(ambient.stdout).failure.code, 'PGHOST')

      // Real run with secrets from files; fetch is denied in the child, so the trusted source is
      // "unavailable": the real adapter defers privately and nothing is granted (exit 3).
      const userH = await newUser('h')
      await nominate(userH, { completedChallenges: completions([canonical(YM, 1), canonical(YM, 3)], '2026-09-03'),
        earnedAwards: claims([[award(YM, 'shepherd-theme'), '2026-09-03']]) })
      const degraded = await spawnCli(env)
      assert.equal(degraded.code, 3, degraded.stdout + degraded.stderr)
      assert.equal(degraded.stdout.trim().split('\n').length, 1, 'exactly one output line')
      assert.equal(degraded.stderr, '')
      const parsed = JSON.parse(degraded.stdout)
      assert.equal(parsed.status, 'degraded')
      assert.ok(parsed.deferredByReason.trustedSourceUnavailable >= 1)
      assert.deepEqual(earnedRows(userH), [])
      assert.equal(reasonsFor(userH)[award(YM, 'shepherd-theme')], 'trustedSourceUnavailable')

      // Bad password over a real connection: exit 6.
      fs.writeFileSync(pwFile, 'definitely-not-the-password\n')
      const denied = await spawnCli(env)
      assert.equal(denied.code, 6)
      assert.equal(JSON.parse(denied.stdout).failure.code, '28P01')
      fs.writeFileSync(pwFile, `${password}\n`)

      // SIGTERM while the run is blocked inside the database: graceful abort, exit 4, connection dropped.
      const locker = new pg.Client({ connectionString: stack.adminDbUrl })
      await locker.connect()
      try {
        await locker.query('BEGIN')
        await locker.query('LOCK TABLE public.account_provisional_award_claims IN ACCESS EXCLUSIVE MODE')
        let pid = 0
        const pending = spawnCli({ ...env, AWARD_VERIFIER_DB_STATEMENT_TIMEOUT_MS: '30000', AWARD_VERIFIER_DEADLINE_MS: '60000' }, p => { pid = p })
        const waiting = async () => Number(psqlOk(stack.adminDbUrl,
          `SELECT count(*) FROM pg_stat_activity WHERE application_name = 'bibleberry-award-verifier' AND wait_event_type = 'Lock';`))
        for (let i = 0; i < 100 && (await waiting()) === 0; i++) await new Promise(r => setTimeout(r, 100))
        assert.equal(await waiting(), 1, 'verifier is blocked in the database')
        const t0 = Date.now()
        process.kill(pid, 'SIGTERM')
        const stopped = await pending
        assert.equal(stopped.code, 4, stopped.stdout + stopped.stderr)
        assert.equal(JSON.parse(stopped.stdout).status, 'aborted')
        assert.ok(Date.now() - t0 < 5_000, 'graceful shutdown is prompt')
      } finally {
        await locker.query('ROLLBACK').catch(() => undefined)
        await locker.end()
      }
      let lingering = 1
      for (let i = 0; i < 50 && lingering > 0; i++) {
        lingering = Number(psqlOk(stack.adminDbUrl, `SELECT count(*) FROM pg_stat_activity WHERE application_name = 'bibleberry-award-verifier';`))
        if (lingering) await new Promise(r => setTimeout(r, 100))
      }
      assert.equal(lingering, 0, 'no verifier session survives the process')
    } finally {
      fs.rmSync(secretDir, { recursive: true, force: true })
    }
  })

  test('D12 client, session and Data API paths cannot reach the verifier or grant awards; service_role residual (finding F1)', async () => {
    const userQ = await newUser('q')
    // Client roles: no issuance RPC and no direct award write over the Data API.
    for (const fn of ['list_pending_award_claims', 'admit_verified_award', 'record_verification_deferral', 'get_claim_verification_context']) {
      const r = await rpc(stack, fn, {}, bearer(userQ.accessToken))
      assert.equal(r.status, 404, `${fn} must not be a Data API function`)
    }
    const profiled = await http(stack, 'POST', '/rest/v1/rpc/admit_verified_award', {
      headers: { ...bearer(stack.serviceRoleJwtKey), 'Content-Profile': 'account_issuance' }, body: { p_attestation: {} }, apikey: stack.secretKey,
    })
    assert.equal(profiled.status, 406, 'account_issuance is not an exposed schema, even for service_role')
    const row = { account_id: userQ.id, award_id: award('2026-03', 'self-grant'), kind: 'thematic', publication_year_month: '2026-03',
      discovery_id: 'discovery:2026-03:self-grant', earned_on: '2026-03-05', date_provenance: 'clientReported' }
    const asUser = await http(stack, 'POST', '/rest/v1/account_earned_awards', { headers: bearer(userQ.accessToken), body: row })
    assert.ok([401, 403].includes(asUser.status), `reader self-grant denied: ${describe(asUser)}`)
    const asAnon = await http(stack, 'POST', '/rest/v1/account_earned_awards', { body: row })
    assert.ok([401, 403].includes(asAnon.status), 'anon self-grant denied')
    assert.equal(admin(`SELECT count(*) FROM public.account_earned_awards WHERE account_id = :'a'::uuid;`, { a: userQ.id }), 0)

    // FINDING F1 (pre-existing R13-3 grant, NOT changed here; owner decision required): the
    // service_role secret key can write account_earned_awards directly, bypassing verification.
    // The verifier runtime never holds or accepts that key (config + preflight, D2).
    const asService = await http(stack, 'POST', '/rest/v1/account_earned_awards', {
      headers: { ...bearer(stack.serviceRoleJwtKey), Prefer: 'return=minimal' }, body: row, apikey: stack.secretKey,
    })
    assert.equal(asService.status, 201, `F1 observed behaviour changed (update the evidence doc): ${describe(asService)}`)
    psqlOk(stack.adminDbUrl, `DELETE FROM public.account_earned_awards WHERE account_id = :'a'::uuid;`, { a: userQ.id })
  })

  test('D13 every runtime output across this suite is counts-only and credential-free', () => {
    assert.ok(allOutput.length >= 30, `collected ${allOutput.length} outputs`)
    const joined = allOutput.join('\n')
    assertCountsOnly(joined, 'runtime output')
    for (const line of allOutput.filter(Boolean)) {
      for (const l of line.trim().split('\n').filter(Boolean)) {
        const parsed = JSON.parse(l)
        assert.equal(parsed.component, 'bibleberry-award-verifier')
      }
    }
  })
})
