/**
 * R13 Quartz Meadow (Issue #246) suite F — cross-client account continuity on a REAL disposable
 * local Supabase stack, through the PRODUCTION client layer.
 *
 * What is real here:
 * - GoTrue users and their asymmetric access JWTs (password grant on the local stack; each
 *   simulated device obtains its OWN session for the same user, with a distinct `session_id`);
 * - the production `SupabasePostgrestTransport` (publishable key + user JWT only) and the production
 *   `coordinateGuestSync` (pure R13-0 reconciliation + compare-and-commit + guest-clearance guard);
 * - the accepted `AccountSessionController` boundary in F5e (with the in-repo `MockAuthProvider`
 *   carrying the REAL GoTrue token, because no Supabase Auth provider adapter exists yet);
 * - PostgREST, the accepted post-SB3 SQL (`reconcile_guest_participation`,
 *   `get_account_participation`) and the private verifier runtime (production pg executor,
 *   database port, run-once orchestration, in-process CLI entry) on a dedicated least-privileged
 *   LOGIN that holds only `account_award_verifier`.
 *
 * What is simulated / synthetic:
 * - the two "devices" are two independent in-memory guest stores + two transports + two sessions
 *   in ONE Node process (no native persistence, no Capacitor, no second physical device);
 * - the published Sanity month (tests/accountVerification/fixtures.ts, answered in-process; no real
 *   Sanity request) and all user data (synthetic `@example.test` users, `vrf-` Challenge IDs);
 * - response loss / network failure / clock expiry, which are injected around the real fetch. Each
 *   F5 case states whether the server really committed before the injected loss.
 *
 * Admin SQL (`postgres`, non-superuser) is used ONLY to inspect rows and to provision/drop the
 * verifier LOGIN; it never writes participation, claims or awards.
 *
 * Run only through scripts/accountSupabase/run-local-supabase-acceptance.sh.
 */
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { after, before, describe as suite, test } from 'node:test'
import { MockAuthProvider, createAccountSessionController } from '../../src/accountAuth/index.ts'
import {
  SupabasePostgrestTransport,
  coordinateGuestSync,
  parseAccountId,
} from '../../src/accountSync/index.ts'
import type {
  AccountId,
  AuthorizedAccountSession,
  CoordinateGuestSyncOutcome,
  GuestClearanceDecision,
  GuestReconciliationInput,
  GuestStorageAccessor,
  ProposedAccountParticipationEnvelope,
  ProposedAccountShelfState,
} from '../../src/accountSync/index.ts'
import { runVerifierCli } from '../../scripts/accountVerification/run-award-verifier-once.ts'
import type { VerifierRunReport } from '../../src/accountVerification/runOnce.ts'
import { TRUSTED_AWARD_VERIFICATION_MONTH_GROQ_QUERY } from '../../src/gateway/query.ts'
import type { GatewayFetch } from '../../src/gateway/types.ts'
import { createSavedScriptureKey } from '../../src/participation/identity.ts'
import { FIXTURE_DATASET, FIXTURE_PROJECT_ID, canonical, makeTrustedMonth } from '../accountVerification/fixtures.ts'
import {
  bearer,
  decodeJwtPart,
  describe,
  http,
  loadStack,
  psql,
  psqlJson,
  psqlOk,
  redact,
  rpc,
  skipReason,
  uniqueSuffix,
} from './lib/localStack.ts'
import type { LocalStack } from './lib/localStack.ts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>

const run = uniqueSuffix()
const VERIFIER_LOGIN = `r13qm_verifier_${run}`
const SANITY_TOKEN = `sanity-fixture-token-${randomBytes(8).toString('hex')}`
/** Synthetic published month served by the fixture (historical relative to the run date). */
const YM = '2026-09'
const day = (n: number) => canonical(YM, n)
const award = (slug: string) => `card:monthly:${YM}:${slug}`
const TRUSTED_ART = `trusted-${YM}-shepherd-theme`
const FORGED_ART = 'forged-client-art'

let stack: LocalStack
let verifierPassword = ''
const allDevices: SimulatedDevice[] = []
const allTokens: string[] = []

// ---------------------------------------------------------------------------
// Real GoTrue accounts; one independent session per simulated device
// ---------------------------------------------------------------------------

interface Account {
  readonly label: string
  readonly id: AccountId
  readonly email: string
  readonly password: string
}

interface DeviceSession extends AuthorizedAccountSession {
  readonly token: string
  readonly sessionId: string
  readonly expiresAt: number
}

async function createAccount(label: string): Promise<Account> {
  const email = `qm-${label}-${randomUUID()}@example.test`
  const password = randomBytes(24).toString('base64url')
  const signUp = await http(stack, 'POST', '/auth/v1/signup', { body: { email, password } })
  assert.equal(signUp.status, 200, `GoTrue signup for ${label}: ${describe(signUp)}`)
  const id = parseAccountId((signUp.body as Json).user?.id)
  assert.ok(id, `GoTrue returned a canonical user id for ${label}`)
  return { label, id, email, password }
}

/** A fresh password-grant session: what a second device signing into the same account gets. */
async function signInDevice(account: Account): Promise<DeviceSession> {
  const signIn = await http(stack, 'POST', '/auth/v1/token?grant_type=password', {
    body: { email: account.email, password: account.password },
  })
  assert.equal(signIn.status, 200, `GoTrue sign-in for ${account.label}: ${describe(signIn)}`)
  const body = signIn.body as { access_token: string; user: { id: string } }
  assert.equal(body.user.id, account.id)
  const claims = decodeJwtPart(body.access_token, 1)
  assert.equal(claims.sub, account.id, 'JWT subject is the auth.users id')
  assert.equal(claims.role, 'authenticated')
  assert.equal(typeof claims.session_id, 'string')
  allTokens.push(body.access_token)
  return {
    accountId: account.id,
    token: body.access_token,
    expiresAt: Number(claims.exp) * 1000,
    sessionId: String(claims.session_id),
  }
}

// ---------------------------------------------------------------------------
// Simulated device: independent guest store + production transport over a tap-able fetch
// ---------------------------------------------------------------------------

type Forward = () => Promise<Response>
/** Wraps one PostgREST call. `n` counts calls to that endpoint on this device (1-based). */
type Interceptor = (endpoint: string, n: number, forward: Forward, body: Json) => Promise<Response>

function emptyGuest(): GuestReconciliationInput {
  return {
    envelope: {
      schemaVersion: 2,
      data: {
        completedChallenges: {}, inProgressChallenges: {}, savedChallenges: {}, savedScriptures: [],
        lastOpenedChallenge: null, earnedAwards: {},
      },
    },
    namespace: 'cms',
  } as GuestReconciliationInput
}

function guestHasData(guest: GuestReconciliationInput): boolean {
  const data = guest.envelope.data as Json
  return Object.keys(data.completedChallenges).length + Object.keys(data.inProgressChallenges).length +
    Object.keys(data.savedChallenges).length + data.savedScriptures.length + Object.keys(data.earnedAwards).length > 0 ||
    data.lastOpenedChallenge !== null || guest.shelf !== undefined
}

class SimulatedDevice {
  readonly events: string[] = []
  readonly requestBodies: { endpoint: string; body: Json }[] = []
  clearCalls = 0
  interceptor: Interceptor | null = null
  clock: number | null = null
  private guest: GuestReconciliationInput
  private readonly counts = new Map<string, number>()
  readonly transport: SupabasePostgrestTransport
  readonly name: string

  constructor(name: string, guest: GuestReconciliationInput = emptyGuest()) {
    this.name = name
    this.guest = structuredClone(guest)
    allDevices.push(this)
    const tap: typeof fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      const endpoint = url.pathname.replace('/rest/v1/rpc/', '')
      const n = (this.counts.get(endpoint) ?? 0) + 1
      this.counts.set(endpoint, n)
      const body = JSON.parse(String(init?.body ?? '{}')) as Json
      this.requestBodies.push({ endpoint, body })
      this.events.push(`request:${endpoint}`)
      const forward: Forward = async () => {
        const response = await fetch(input, init)
        this.events.push(`response:${endpoint}`)
        return response
      }
      return this.interceptor ? this.interceptor(endpoint, n, forward, body) : forward()
    }
    this.transport = new SupabasePostgrestTransport({
      url: stack.apiUrl,
      apiKey: stack.publishableKey,
      fetch: tap,
      timeoutMs: 15_000,
      now: () => this.clock ?? Date.now(),
    })
  }

  /** The device's own durable guest storage, as the coordinator's accessor sees it. */
  accessor(): GuestStorageAccessor {
    return {
      getSnapshot: () => {
        this.events.push('guest:read')
        return structuredClone(this.guest)
      },
      clearGuestStorage: (decision: GuestClearanceDecision) => {
        this.events.push(`guest:clear:${decision.reason}`)
        this.clearCalls += 1
        assert.equal(decision.shouldClearGuestStorage, true, 'the coordinator only clears on a positive decision')
        this.guest = emptyGuest()
        return true
      },
    }
  }

  get guestSnapshot(): GuestReconciliationInput {
    return structuredClone(this.guest)
  }

  get hasGuestData(): boolean {
    return guestHasData(this.guest)
  }

  /** A local write that lands while a sync is in flight (does not start a new scenario). */
  mutateInFlight(next: GuestReconciliationInput): void {
    this.guest = structuredClone(next)
  }

  /** Offline guest activity on this device (e.g. after the guest store was cleared). */
  record(next: GuestReconciliationInput): void {
    this.guest = structuredClone(next)
    // A new scenario on the same device: count clears / requests from here on.
    this.clearCalls = 0
    this.events.length = 0
    this.requestBodies.length = 0
    this.counts.clear()
  }

  sent(endpoint: string): number {
    return this.requestBodies.filter(r => r.endpoint === endpoint).length
  }

  async sync(session: AuthorizedAccountSession, options: Parameters<typeof coordinateGuestSync>[2] = {}): Promise<CoordinateGuestSyncOutcome> {
    return coordinateGuestSync(this.transport, { session, guest: this.accessor(), mode: 'auto' }, options)
  }

  async read(session: AuthorizedAccountSession): Promise<{ revision: number; envelope: ProposedAccountParticipationEnvelope }> {
    const result = await this.transport.getAccount(session)
    assert.equal(result.status, 'found', `${this.name} readback: ${JSON.stringify(result)}`)
    if (result.status !== 'found') throw new Error('unreachable')
    return { revision: result.revision, envelope: result.envelope }
  }
}

const COMMIT = 'reconcile_guest_participation'
const READ = 'get_account_participation'

// ---------------------------------------------------------------------------
// Synthetic guest snapshots (V2 envelope + isolated Shelf state)
// ---------------------------------------------------------------------------

interface GuestSpec {
  completed?: Record<number, string>
  inProgress?: Record<number, [string, string]>
  savedChallenges?: Record<number, string>
  saves?: [reference: string, translation: string | null, savedOn: string, sourceDay?: number][]
  lastOpened?: [number, string] | null
  awards?: Record<string, Json>
  shelf?: ProposedAccountShelfState
}

function guestOf(spec: GuestSpec): GuestReconciliationInput {
  const map = <T>(src: Record<number, T> | undefined, f: (v: T) => Json) =>
    Object.fromEntries(Object.entries(src ?? {}).map(([d, v]) => [day(Number(d)), f(v)]))
  return {
    envelope: {
      schemaVersion: 2,
      data: {
        completedChallenges: map(spec.completed, completedOn => ({ completedOn })),
        inProgressChallenges: map(spec.inProgress, ([screenId, updatedOn]) => ({ screenId, updatedOn })),
        savedChallenges: map(spec.savedChallenges, savedOn => ({ savedOn })),
        savedScriptures: (spec.saves ?? []).map(([reference, translation, savedOn, sourceDay]) => ({
          key: createSavedScriptureKey({ reference, translation }),
          reference,
          translation,
          savedOn,
          ...(sourceDay ? { sourceChallengeId: day(sourceDay) } : {}),
        })),
        lastOpenedChallenge: spec.lastOpened ? { challengeId: day(spec.lastOpened[0]), openedOn: spec.lastOpened[1] } : null,
        earnedAwards: spec.awards ?? {},
      },
    },
    namespace: 'cms',
    ...(spec.shelf ? { shelf: spec.shelf } : {}),
  } as GuestReconciliationInput
}

/** A client-side earned-award record carrying a FORGED card snapshot (must never be adopted). */
function claimedAward(slug: string, kind: 'thematic' | 'fullMonth', earnedOn: string, cardViewed = false): Json {
  return {
    awardId: award(slug),
    kind,
    publicationYearMonth: YM,
    discoveryId: `discovery:${YM}:${slug}`,
    earnedOn,
    hubAnnouncementAcked: false,
    cardViewed,
    cardDocumentId: `card-forged-${slug}`,
    earnedCard: {
      cardDocumentId: `card-forged-${slug}`,
      title: `Forged ${slug}`,
      publicationYearMonth: YM,
      imageUrl: `https://cdn.sanity.io/images/${FIXTURE_PROJECT_ID}/${FIXTURE_DATASET}/${FORGED_ART}-1200x1600.png`,
      assetRevision: 'forged',
      illustrationAlt: 'Forged alt',
      accessibleTranscription: 'Forged transcription',
      scripture: { book: 'John', reference: 'John 15:5', translation: 'WEB' },
      attribution: 'Forged',
      rightsStatus: 'forged',
      shareEligible: true,
    },
  }
}

// ---------------------------------------------------------------------------
// Admin inspection (read-only)
// ---------------------------------------------------------------------------

const ACCOUNT_TABLES = [
  'account_participation_profiles', 'account_completed_challenges', 'account_in_progress_challenges',
  'account_saved_challenges', 'account_saved_scriptures', 'account_earned_awards', 'account_shelf_months',
  'account_reconciliation_receipts', 'account_reconciliation_unresolved_items', 'account_provisional_award_claims',
  'account_award_admission_attestations', 'account_award_verification_attempts',
] as const

/** Digest of every account table: all accounts, or one account's rows only. */
function dbDigest(accountId?: AccountId): string {
  const where = accountId ? `WHERE x.account_id = :'a'::uuid` : ''
  const parts = ACCOUNT_TABLES.map(t =>
    `SELECT '${t}' AS t, count(*) AS n, md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) AS h FROM public.${t} x ${where}`)
  return psqlOk(stack.adminDbUrl, `SELECT string_agg(t || '=' || n || ':' || h, ';' ORDER BY t) FROM (${parts.join(' UNION ALL ')}) s;`,
    accountId ? { a: accountId } : {})
}

function rowCount(table: (typeof ACCOUNT_TABLES)[number], accountId: AccountId, extra = '', vars: Record<string, string> = {}): number {
  return Number(psqlOk(stack.adminDbUrl, `SELECT count(*) FROM public.${table} WHERE account_id = :'a'::uuid ${extra};`, { a: accountId, ...vars }))
}

function profileRevision(accountId: AccountId): number | null {
  const out = psqlOk(stack.adminDbUrl, `SELECT revision FROM public.account_participation_profiles WHERE account_id = :'a'::uuid;`, { a: accountId })
  return out === '' ? null : Number(out)
}

const admin = <T = Json>(sql: string, vars: Record<string, string> = {}) => psqlJson<T>(stack.adminDbUrl, sql, vars)

function pendingClaims(accountId: AccountId): string[] {
  return admin<string[]>(`SELECT coalesce(jsonb_agg(award_id ORDER BY award_id), '[]') FROM public.account_provisional_award_claims WHERE account_id = :'a'::uuid;`, { a: accountId })
}

function earnedAwardRows(accountId: AccountId): string {
  return psqlOk(stack.adminDbUrl, `SELECT coalesce(string_agg(x::text, '|' ORDER BY x::text), '') FROM public.account_earned_awards x WHERE account_id = :'a'::uuid;`, { a: accountId })
}

// ---------------------------------------------------------------------------
// Private verifier (synthetic published-perspective Sanity answered in-process)
// ---------------------------------------------------------------------------

function fixtureSanity(): GatewayFetch {
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    assert.equal(url.hostname, `${FIXTURE_PROJECT_ID}.api.sanity.io`, 'only the fixture project is ever asked')
    assert.equal(url.searchParams.get('perspective'), 'published')
    assert.equal(url.searchParams.get('query'), TRUSTED_AWARD_VERIFICATION_MONTH_GROQ_QUERY)
    assert.equal(new Headers(init?.headers).get('Authorization'), `Bearer ${SANITY_TOKEN}`)
    const ym = JSON.parse(url.searchParams.get('$yearMonth') ?? 'null') as string
    return new Response(JSON.stringify({ result: ym === YM ? makeTrustedMonth(YM) : null }), { status: 200 })
  }
}

async function runVerifier(runId: string): Promise<VerifierRunReport> {
  const { line, report, exitCode } = await runVerifierCli({
    env: {
      AWARD_VERIFIER_DB_HOST: '127.0.0.1',
      AWARD_VERIFIER_DB_PORT: stack.dbPort,
      AWARD_VERIFIER_DB_USER: VERIFIER_LOGIN,
      AWARD_VERIFIER_DB_PASSWORD: verifierPassword,
      AWARD_VERIFIER_DB_TLS: 'disable',
      AWARD_VERIFIER_SANITY_PROJECT_ID: FIXTURE_PROJECT_ID,
      AWARD_VERIFIER_SANITY_DATASET: FIXTURE_DATASET,
      AWARD_VERIFIER_SANITY_READ_TOKEN: SANITY_TOKEN,
      AWARD_VERIFIER_DB_CONNECT_TIMEOUT_MS: '3000',
      AWARD_VERIFIER_RETRY_BASE_DELAY_MS: '50',
      AWARD_VERIFIER_RUN_ID: runId,
    },
    fetchImpl: fixtureSanity(),
  })
  assert.equal(exitCode, report.exitCode)
  for (const secret of [verifierPassword, SANITY_TOKEN]) assert.equal(line.includes(secret), false, 'no credential in the verifier report')
  return report
}

// ---------------------------------------------------------------------------
// Shared expectations
// ---------------------------------------------------------------------------

const pick = (envelope: ProposedAccountParticipationEnvelope) => {
  const d = envelope.data as Json
  const by = (rec: Json, f: (v: Json) => unknown) => Object.fromEntries(Object.entries(rec).sort().map(([k, v]) => [k, f(v as Json)]))
  return {
    completed: by(d.completedChallenges, v => [v.completedOn, v.dateProvenance]),
    inProgress: by(d.inProgressChallenges, v => [v.screenId, v.updatedOn, v.unresolvedConflict === true]),
    savedChallenges: by(d.savedChallenges, v => v.savedOn),
    saves: (d.savedScriptures as Json[]).map(s => [s.key, s.reference, s.translation, s.savedOn, s.sourceChallengeId ?? null]).sort(),
    lastOpened: d.lastOpenedChallenge ? [d.lastOpenedChallenge.challengeId, d.lastOpenedChallenge.openedOn] : null,
    awards: Object.keys(d.earnedAwards).sort(),
    shelf: d.shelf ? (d.shelf.months as Json[]).map(m => [m.yearMonth, m.admissionKind, m.isProtected]) : null,
  }
}

function assertNotCleared(device: SimulatedDevice, label: string) {
  assert.equal(device.clearCalls, 0, `${label}: guest storage must not be cleared`)
  assert.equal(device.events.some(e => e.startsWith('guest:clear')), false, `${label}: no clear event`)
  assert.equal(device.hasGuestData, true, `${label}: guest records are still on the device`)
}

// ---------------------------------------------------------------------------

suite('R13 Quartz Meadow F: cross-client account continuity on real local Supabase', { skip: skipReason }, () => {
  let alice: Account
  let deviceA: SimulatedDevice
  let deviceB: SimulatedDevice
  let sessionA: DeviceSession
  let sessionB: DeviceSession
  let carol: Account
  let deviceC: SimulatedDevice
  let sessionC: DeviceSession

  before(() => {
    stack = loadStack()
    verifierPassword = randomBytes(24).toString('hex')
    psqlOk(stack.adminDbUrl, `SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L', :'l', :'pw') \\gexec`,
      { l: VERIFIER_LOGIN, pw: verifierPassword })
    psqlOk(stack.adminDbUrl, `SELECT format('GRANT account_award_verifier TO %I', :'l') \\gexec`, { l: VERIFIER_LOGIN })
  })

  after(() => {
    if (stack) psql(stack.adminDbUrl, `SELECT format('DROP ROLE IF EXISTS %I', :'l') \\gexec`, { l: VERIFIER_LOGIN })
  })

  test('F1 device A: durable guest snapshot → new account through the production coordinator + transport', async () => {
    alice = await createAccount('alice')
    sessionA = await signInDevice(alice)
    deviceA = new SimulatedDevice('device A', guestOf({
      completed: { 1: '2026-09-01', 3: '2026-09-04' },
      inProgress: { 5: ['screen-2', '2026-09-05'], 7: ['screen-1', '2026-09-05'] },
      savedChallenges: { 10: '2026-09-02' },
      saves: [['John 15:5', 'WEB', '2026-09-01', 1]],
      lastOpened: [5, '2026-09-05'],
      // Non-default protection on purpose: autoAdmitted + isProtected:true must survive transfer.
      shelf: { months: [
        { yearMonth: '2026-08' as never, admissionKind: 'readerSelected', isProtected: true },
        { yearMonth: '2026-09' as never, admissionKind: 'autoAdmitted', isProtected: true },
      ] },
    }))
    assert.equal((await deviceA.transport.getAccount(sessionA)).status, 'notFound', 'fresh GoTrue user has no account row')
    deviceA.events.length = 0

    const outcome = await deviceA.sync(sessionA)
    assert.equal(outcome.ok, true, JSON.stringify(outcome))
    assert.equal(outcome.status, 'committed')
    assert.equal(outcome.mode, 'newAccountTransfer')
    assert.equal(outcome.attempts, 1)
    assert.equal(outcome.receipt?.accountId, alice.id)
    assert.equal(outcome.receipt?.durableRevision, 1)
    assert.equal(outcome.receipt?.unresolvedCount, 0)
    assert.equal(outcome.guestClearanceDecision?.reason, 'verifiedDurableCommit')
    assert.equal(outcome.guestCleared, true)

    // No premature removal: guest storage is cleared only after the durable receipt arrived and
    // the guest store was re-read unchanged.
    const ev = deviceA.events
    assert.deepEqual(ev, ['guest:read', `request:${READ}`, `response:${READ}`, `request:${COMMIT}`, `response:${COMMIT}`,
      'guest:read', 'guest:clear:verifiedDurableCommit'])
    assert.equal(deviceA.sent(COMMIT), 1)
    const sentPayload = deviceA.requestBodies.find(r => r.endpoint === COMMIT)!.body.p_payload as Json
    assert.equal(sentPayload.accountId, alice.id)
    assert.equal(JSON.stringify(sentPayload).includes(sessionA.token), false, 'the JWT travels only in the Authorization header')

    const { revision, envelope } = await deviceA.read(sessionA)
    assert.equal(revision, 1)
    assert.equal(profileRevision(alice.id), 1)
    assert.deepEqual(pick(envelope), {
      completed: { [day(1)]: ['2026-09-01', 'clientReported'], [day(3)]: ['2026-09-04', 'clientReported'] },
      inProgress: { [day(5)]: ['screen-2', '2026-09-05', false], [day(7)]: ['screen-1', '2026-09-05', false] },
      savedChallenges: { [day(10)]: '2026-09-02' },
      saves: [['john 15:5|web', 'John 15:5', 'WEB', '2026-09-01', day(1)]],
      lastOpened: [day(5), '2026-09-05'],
      awards: [],
      shelf: [['2026-08', 'readerSelected', true], ['2026-09', 'autoAdmitted', true]],
    })
  })

  test('F2 device B (independent store, own session, same account) recovers A, merges its own guest records; A reads the union', async () => {
    sessionB = await signInDevice(alice)
    assert.notEqual(sessionB.sessionId, sessionA.sessionId, 'device B holds a distinct GoTrue session')
    assert.notEqual(sessionB.token, sessionA.token)
    deviceB = new SimulatedDevice('device B', guestOf({
      completed: { 1: '2026-09-01', 7: '2026-09-08', 12: '2026-09-12' }, // day 1 duplicate; day 7 was in progress on A
      inProgress: { 5: ['screen-2', '2026-09-06'] }, // same screen, later touch → max(updatedOn)
      savedChallenges: { 10: '2026-09-11', 11: '2026-09-11' }, // day 10 duplicate (A saved earlier)
      saves: [['John 15:5', 'WEB', '2026-09-09'], ['Psalm 23:1', null, '2026-09-10']],
      lastOpened: [12, '2026-09-12'],
      shelf: { months: [{ yearMonth: '2026-10' as never, admissionKind: 'readerSelected', isProtected: true }] },
    }))

    // Recovery: before merging anything, device B sees exactly what device A committed.
    const recovered = await deviceB.read(sessionB)
    const fromA = await deviceA.read(sessionA)
    assert.equal(recovered.revision, 1)
    assert.deepEqual(recovered.envelope, fromA.envelope, 'device B recovers A\'s durable progress verbatim')

    const outcome = await deviceB.sync(sessionB)
    assert.equal(outcome.ok, true, JSON.stringify(outcome))
    assert.equal(outcome.status, 'committed')
    assert.equal(outcome.mode, 'existingAccountMerge')
    assert.equal(outcome.receipt?.durableRevision, 2)
    assert.equal(outcome.guestCleared, true, 'a clean merge with a durable receipt clears device B guest storage')
    assert.equal(deviceB.hasGuestData, false)
    assert.deepEqual(outcome.reconciliation?.ok && outcome.reconciliation.shelfConflicts.map(c => [c.yearMonth, c.disposition]),
      [['2026-10', 'preservedInLibraryNotOnShelf']], 'account Shelf precedence: B\'s month is reported, not placed')

    const expected = {
      completed: {
        [day(1)]: ['2026-09-01', 'clientReported'], [day(12)]: ['2026-09-12', 'clientReported'],
        [day(3)]: ['2026-09-04', 'clientReported'], [day(7)]: ['2026-09-08', 'clientReported'],
      },
      inProgress: { [day(5)]: ['screen-2', '2026-09-06', false] }, // day 7 left in-progress on completion
      savedChallenges: { [day(10)]: '2026-09-02', [day(11)]: '2026-09-11' },
      saves: [['john 15:5|web', 'John 15:5', 'WEB', '2026-09-01', day(1)], ['psalm 23:1|', 'Psalm 23:1', null, '2026-09-10', null]],
      lastOpened: [day(12), '2026-09-12'],
      awards: [],
      shelf: [['2026-08', 'readerSelected', true], ['2026-09', 'autoAdmitted', true]],
    }
    const onA = await deviceA.read(sessionA)
    const onB = await deviceB.read(sessionB)
    assert.equal(onA.revision, 2)
    assert.deepEqual(pick(onA.envelope), expected)
    assert.deepEqual(onB.envelope, onA.envelope, 'both devices read the same durable union')
    assert.equal(rowCount('account_completed_challenges', alice.id), 4, 'completions deduplicated')
    assert.equal(rowCount('account_saved_scriptures', alice.id), 2, 'saved Scripture deduplicated')
    assert.equal(rowCount('account_reconciliation_receipts', alice.id), 2)
  })

  test('F2b conflicting credible date + undecidable reading position: server keeps the original, records evidence, B retains its guest', async () => {
    // Device B later records guest activity offline that disagrees with the account.
    deviceB.record(guestOf({
      completed: { 3: '2026-09-03' }, // A recorded 2026-09-04
      inProgress: { 5: ['screen-4', '2026-09-07'] }, // A is on screen-2; no trusted screen order exists
    }))
    const outcome = await deviceB.sync(sessionB)
    assert.equal(outcome.ok, true, JSON.stringify(outcome))
    assert.equal(outcome.status, 'committed')
    assert.equal(outcome.reconciliation?.ok && outcome.reconciliation.status, 'reconciledWithUnresolved')
    assert.deepEqual(outcome.reconciliation?.ok && outcome.reconciliation.unresolvedItems.map(i => i.kind).sort(),
      ['undecidableCompletionDateProvenance', 'undecidableReadingPosition'])
    assert.ok((outcome.receipt?.unresolvedCount ?? 0) >= 2, JSON.stringify(outcome.receipt))
    assert.equal(outcome.receipt?.unresolvedPersistedOnServer, true)
    assert.equal(outcome.guestClearanceDecision?.reason, 'reconciliationRequiresRetention')
    assertNotCleared(deviceB, 'F2b')

    const { envelope } = await deviceA.read(sessionA)
    const view = pick(envelope)
    assert.deepEqual(view.completed[day(3)], ['2026-09-04', 'clientReported'], 'the existing completion date is immutable')
    assert.deepEqual(view.inProgress[day(5)], ['screen-2', '2026-09-06', true], 'account position kept and flagged unresolved')
    assert.ok(rowCount('account_reconciliation_unresolved_items', alice.id, `AND idempotency_key = :'k'`, { k: outcome.receipt!.idempotencyKey }) >= 2,
      'both unresolved items are persisted as server evidence')
  })

  test('F3 a different user C can neither read nor mutate A/B\'s account (mismatched IDs, forged fields, exchanged tokens)', async () => {
    carol = await createAccount('carol')
    sessionC = await signInDevice(carol)
    deviceC = new SimulatedDevice('device C', guestOf({ completed: { 2: '2026-09-02' } }))
    assert.equal((await deviceC.transport.getAccount(sessionC)).status, 'notFound', 'C sees nothing of A')
    const own = await deviceC.sync(sessionC)
    assert.equal(own.status, 'committed', 'C has its own legitimate account')

    const aliceBefore = dbDigest(alice.id)
    const allBefore = dbDigest()
    const aliceView = await deviceA.read(sessionA)
    const evil = new SimulatedDevice('device C (hostile)', guestOf({ completed: { 20: '2026-09-20' }, savedChallenges: { 21: '2026-09-21' } }))

    // (1) Production transport refuses a payload that names another account before sending it.
    const forgedPayload = {
      accountId: alice.id, expectedRevision: aliceView.revision, idempotencyKey: `qm-forge-${run}`,
      guestPayloadFingerprint: 'f'.repeat(64), mode: 'existingAccountMerge' as const, unresolvedItems: [],
      envelope: { ...aliceView.envelope, data: { ...aliceView.envelope.data, completedChallenges: {} } },
    }
    const local = await evil.transport.commitAccount(sessionC, forgedPayload)
    assert.deepEqual([local.status, local.status === 'unauthorized' && local.reason], ['unauthorized', 'accountMismatch'])
    assert.equal(evil.sent(COMMIT), 0, 'refused client-side; nothing sent')

    // (2) Exchanged token: C's JWT presented as an "A" session. The server's auth.uid() is C.
    const swapped: AuthorizedAccountSession = { accountId: alice.id, token: sessionC.token, expiresAt: sessionC.expiresAt }
    const read = await evil.transport.getAccount(swapped)
    assert.equal(read.status, 'networkError', 'C\'s own envelope fails the account check; A\'s data is never returned')
    const commit = await evil.transport.commitAccount(swapped, forgedPayload)
    assert.deepEqual([commit.status, commit.status === 'unauthorized' && commit.reason], ['unauthorized', 'accountMismatch'], 'server: auth.uid() ≠ payload account')
    const coordinated = await evil.sync(swapped)
    assert.equal(coordinated.ok, false)
    assert.equal(coordinated.status, 'networkError', JSON.stringify(coordinated))
    assertNotCleared(evil, 'F3 swapped coordinator')

    // (3) A's JWT presented as a "C" session: the commit names C, but auth.uid() is A.
    const reversed: AuthorizedAccountSession = { accountId: carol.id, token: sessionA.token, expiresAt: sessionA.expiresAt }
    const rev = await evil.transport.commitAccount(reversed, { ...forgedPayload, accountId: carol.id, envelope: { ...forgedPayload.envelope, accountId: carol.id } })
    assert.deepEqual([rev.status, rev.status === 'unauthorized' && rev.reason], ['unauthorized', 'accountMismatch'])

    // (4) Raw forged fields with C's real session: accountId in body only, then in envelope only.
    for (const [label, mutate] of [
      ['body accountId', (p: Json) => { p.accountId = alice.id }],
      ['envelope accountId', (p: Json) => { p.envelope.accountId = alice.id }],
    ] as const) {
      const payload: Json = {
        expectedRevision: 1, idempotencyKey: `qm-raw-${label.replace(' ', '-')}-${run}`, guestPayloadFingerprint: 'e'.repeat(64),
        mode: 'existingAccountMerge', envelope: { schemaVersion: 1, namespace: 'cms', revision: 1, data: forgedPayload.envelope.data },
      }
      mutate(payload)
      const result = await rpc(stack, COMMIT, { p_payload: payload }, bearer(sessionC.token))
      assert.equal(result.status, 200, describe(result))
      assert.deepEqual([(result.body as Json).status, (result.body as Json).reason], ['unauthorized', 'accountMismatch'], label)
    }

    assert.equal(dbDigest(alice.id), aliceBefore, 'A\'s rows are byte-identical after every negative case')
    assert.equal(dbDigest(), allBefore, 'no row anywhere changed during the negative cases')
    assert.equal(JSON.stringify(await deviceC.read(sessionC)).includes(day(12)), false, 'C still reads only C')
  })

  test('F4 Card claim: quarantined (not earned), guest retained; private verifier admits with attestation; readback on both devices; idempotent replay', async () => {
    // Device A earns a thematic Card locally (days 1 + 3 are complete on the account).
    deviceA.record(guestOf({ awards: { [award('shepherd-theme')]: claimedAward('shepherd-theme', 'thematic', '2026-09-04', true) } }))
    // Device C forges a full-month claim with a single completion: must never become earned.
    deviceC.record(guestOf({ awards: { [award('full-month')]: claimedAward('full-month', 'fullMonth', '2026-09-30') } }))

    const nominatedA = await deviceA.sync(sessionA)
    const nominatedC = await deviceC.sync(sessionC)
    for (const [label, outcome, device] of [['A', nominatedA, deviceA], ['C', nominatedC, deviceC]] as const) {
      assert.equal(outcome.status, 'committed', `${label}: ${JSON.stringify(outcome)}`)
      assert.deepEqual(outcome.reconciliation?.ok && outcome.reconciliation.rejectedRecords, [], `${label}: the claim is a valid record`)
      assert.deepEqual(outcome.reconciliation?.ok && Object.keys(outcome.reconciliation.mergedAccount.data.earnedAwards).length, 1, `${label}: the claim is nominated`)
      assert.equal(outcome.receipt?.unresolvedPersistedOnServer, false, `${label}: a quarantined claim is not account state`)
      assert.ok((outcome.receipt?.unresolvedCount ?? 0) >= 1)
      assert.equal(outcome.guestClearanceDecision?.reason, 'unresolvedNotPersistedOnServer')
      assertNotCleared(device, `F4 nomination ${label}`)
    }
    assert.deepEqual(pendingClaims(alice.id), [award('shepherd-theme')])
    assert.equal(earnedAwardRows(alice.id), '', 'nomination is not an earned award')
    for (const [device, session] of [[deviceA, sessionA], [deviceB, sessionB]] as const) {
      const { envelope } = await device.read(session)
      assert.deepEqual(Object.keys(envelope.data.earnedAwards), [], `${device.name}: no earned award before verification`)
    }
    const rawPending = await rpc(stack, READ, {}, bearer(sessionB.token))
    assert.deepEqual((rawPending.body as Json).pendingAwardVerification, [award('shepherd-theme')], 'pending is listed by id only, outside the envelope')
    assert.equal(rawPending.text.includes(FORGED_ART), false, 'the client snapshot is never exposed')

    // Private verifier, least-privileged LOGIN, synthetic published month.
    const report = await runVerifier(`qm-f4-${run}`)
    assert.equal(report.status, 'completed', JSON.stringify(report))
    assert.ok(report.admitted >= 1, JSON.stringify(report))
    assert.deepEqual(pendingClaims(alice.id), [], 'the eligible claim left quarantine')
    assert.deepEqual(pendingClaims(carol.id), [award('full-month')], 'the forged claim stays quarantined')
    assert.equal(admin(`SELECT to_jsonb(last_reason) FROM public.account_award_verification_attempts WHERE account_id = :'a'::uuid;`, { a: carol.id }),
      'notEligibleUnderCurrentRoster')
    assert.equal(rowCount('account_earned_awards', carol.id), 0)
    assert.equal(admin(`SELECT to_jsonb(verification_key) FROM public.account_award_admission_attestations WHERE account_id = :'a'::uuid;`, { a: alice.id }),
      `qm-f4-${run}.b1`, 'admission carries the scheduler attestation key')

    const afterAdmission = await deviceA.read(sessionA)
    const viaB = await deviceB.read(sessionB)
    assert.deepEqual(viaB.envelope, afterAdmission.envelope, 'both devices read the admitted Card')
    const card = afterAdmission.envelope.data.earnedAwards[award('shepherd-theme')] as Json
    assert.ok(card, 'earned award readable on both devices')
    assert.equal(card.earnedOn, '2026-09-04')
    assert.ok(String(card.earnedCard?.imageUrl).includes(TRUSTED_ART), 'trusted CMS snapshot, not the client one')
    assert.equal(JSON.stringify(afterAdmission.envelope).includes(FORGED_ART), false)

    // Idempotent replay of the verifier.
    const earnedBefore = earnedAwardRows(alice.id)
    const attestationsBefore = rowCount('account_award_admission_attestations', alice.id)
    const revisionBefore = profileRevision(alice.id)
    const replay = await runVerifier(`qm-f4-replay-${run}`)
    assert.equal(replay.status, 'completed', JSON.stringify(replay))
    assert.equal(earnedAwardRows(alice.id), earnedBefore, 'earned rows byte-identical after replay')
    assert.equal(rowCount('account_award_admission_attestations', alice.id), attestationsBefore)
    assert.equal(profileRevision(alice.id), revisionBefore)
    assert.equal(rowCount('account_earned_awards', carol.id), 0)

    // Device A re-syncs its retained guest: now that the award is durable account state, the
    // receipt qualifies and the guest store may be cleared. Device C's forged claim still blocks.
    const resyncA = await deviceA.sync(sessionA)
    assert.equal(resyncA.ok, true, JSON.stringify(resyncA))
    assert.equal(resyncA.receipt?.unresolvedPersistedOnServer, true, JSON.stringify(resyncA.receipt))
    assert.equal(resyncA.guestClearanceDecision?.reason, 'verifiedDurableCommit')
    assert.equal(resyncA.guestCleared, true)
    assert.equal(deviceA.hasGuestData, false)
    const resyncC = await deviceC.sync(sessionC)
    assert.equal(resyncC.guestClearanceDecision?.reason, 'unresolvedNotPersistedOnServer')
    assertNotCleared(deviceC, 'F4 re-sync C')
    const final = await deviceB.read(sessionB)
    const finalCard = final.envelope.data.earnedAwards[award('shepherd-theme')] as Json
    assert.equal(finalCard.cardViewed, true, 'monotonic presentation flag merged from A')
    assert.ok(String(finalCard.earnedCard?.imageUrl).includes(TRUSTED_ART), 'never re-skinned by the client snapshot')
    assert.equal(finalCard.earnedOn, '2026-09-04')
  })

  test('F5a lost ACK after a REAL committed PostgREST call: retry replays the same key, one receipt, then clearance', async () => {
    const acct = await createAccount('lost-ack')
    const session = await signInDevice(acct)
    const device = new SimulatedDevice('device L', guestOf({ completed: { 2: '2026-09-02' }, savedChallenges: { 4: '2026-09-03' } }))
    device.interceptor = async (endpoint, n, forward) => {
      const response = await forward()
      if (endpoint === COMMIT && n === 1) {
        await response.text() // the server committed and answered; the client never sees it
        device.events.push('injected:response-lost')
        throw new TypeError('simulated: connection reset after the server committed')
      }
      return response
    }
    const outcome = await device.sync(session, { maxRetries: 3 })
    assert.equal(outcome.ok, true, JSON.stringify(outcome))
    assert.equal(outcome.status, 'alreadyCommittedDuplicate')
    assert.equal(outcome.attempts, 2)
    assert.equal(outcome.receipt?.durableRevision, 1, 'the ORIGINAL receipt is replayed')
    assert.equal(outcome.guestCleared, true)
    const keys = device.requestBodies.filter(r => r.endpoint === COMMIT).map(r => (r.body.p_payload as Json).idempotencyKey)
    assert.equal(keys.length, 2)
    assert.equal(keys[0], keys[1], 'the retry reuses the idempotency key')
    assert.equal(rowCount('account_reconciliation_receipts', acct.id), 1, 'exactly one durable receipt')
    assert.equal(profileRevision(acct.id), 1, 'no double application')
    assert.ok(device.events.indexOf('injected:response-lost') < device.events.indexOf('guest:clear:verifiedDurableCommit'))
  })

  test('F5b purely INJECTED network failure (no request reaches the server): no write, guest retained', async () => {
    const acct = await createAccount('net-down')
    const session = await signInDevice(acct)
    const device = new SimulatedDevice('device N', guestOf({ completed: { 2: '2026-09-02' } }))
    device.interceptor = async (endpoint, _n, forward) => {
      if (endpoint === COMMIT) throw new TypeError('simulated: network unreachable (request never sent)')
      return forward()
    }
    const outcome = await device.sync(session, { maxRetries: 2 })
    assert.equal(outcome.ok, false)
    assert.equal(outcome.status, 'networkError')
    assert.equal(outcome.attempts, 2)
    assertNotCleared(device, 'F5b')
    assert.equal(device.events.includes(`response:${COMMIT}`), false)
    assert.equal(profileRevision(acct.id), null, 'no account row was created')
    assert.equal(rowCount('account_reconciliation_receipts', acct.id), 0)
  })

  test('F5c concurrent commits from two devices: REAL revision conflict, automatic re-merge; no-retry and key-reuse cases retain the guest', async () => {
    const acct = await createAccount('race')
    const s1 = await signInDevice(acct)
    const s2 = await signInDevice(acct)
    const d1 = new SimulatedDevice('device K1', guestOf({ completed: { 1: '2026-09-01' } }))
    assert.equal((await d1.sync(s1)).status, 'committed')
    const d2 = new SimulatedDevice('device K2', guestOf({ completed: { 2: '2026-09-02' } }))
    // Just before K2's first commit leaves, K1 commits new work (real), so K2's revision is stale.
    d2.interceptor = async (endpoint, n, forward) => {
      if (endpoint === COMMIT && n === 1) {
        d1.record(guestOf({ completed: { 3: '2026-09-03' } }))
        const interleaved = await d1.sync(s1)
        assert.equal(interleaved.status, 'committed')
        d2.events.push('interleaved:K1-committed')
      }
      return forward()
    }
    const raced = await d2.sync(s2, { maxRetries: 3 })
    assert.equal(raced.ok, true, JSON.stringify(raced))
    assert.equal(raced.status, 'committed')
    assert.equal(raced.attempts, 2, 'one real revisionMismatch, then a re-fetch + re-merge')
    assert.equal(raced.receipt?.durableRevision, 3)
    assert.equal(raced.guestCleared, true)
    const union = await d1.read(s1)
    assert.deepEqual(Object.keys(union.envelope.data.completedChallenges).sort(), [day(1), day(2), day(3)])

    // Same race with maxRetries 1: conflict surfaces; K2' guest kept; K2' wrote nothing.
    const d2b = new SimulatedDevice('device K2\'', guestOf({ completed: { 4: '2026-09-04' } }))
    d2b.interceptor = async (endpoint, n, forward) => {
      if (endpoint === COMMIT && n === 1) {
        d1.record(guestOf({ completed: { 5: '2026-09-05' } }))
        assert.equal((await d1.sync(s1)).status, 'committed')
      }
      return forward()
    }
    const conflicted = await d2b.sync(s2, { maxRetries: 1 })
    const settled = dbDigest(acct.id)
    assert.equal(conflicted.ok, false)
    assert.equal(conflicted.status, 'conflict')
    assertNotCleared(d2b, 'F5c no-retry')
    assert.equal(profileRevision(acct.id), 4, 'only K1\'s interleaved commit advanced the revision')
    assert.equal(rowCount('account_completed_challenges', acct.id, `AND challenge_id = :'c'`, { c: day(4) }), 0)

    // Reusing an idempotency key for a different guest payload is a terminal conflict.
    const reusedKey = raced.receipt!.idempotencyKey
    const d3 = new SimulatedDevice('device K3', guestOf({ completed: { 6: '2026-09-06' } }))
    const reuse = await d3.sync(s2, { idempotencyKey: reusedKey, maxRetries: 2 })
    assert.equal(reuse.ok, false)
    assert.equal(reuse.status, 'conflict')
    assertNotCleared(d3, 'F5c key reuse')
    assert.equal(dbDigest(acct.id), settled, 'key reuse wrote nothing')
  })

  test('F5d session expiry between read and commit (INJECTED clock): commit never sent, guest retained', async () => {
    const acct = await createAccount('expiry')
    const session = await signInDevice(acct)
    const device = new SimulatedDevice('device X', guestOf({ completed: { 2: '2026-09-02' } }))
    device.interceptor = async (endpoint, _n, forward) => {
      const response = await forward()
      if (endpoint === READ) device.clock = session.expiresAt + 1 // the real token's exp passes mid-sync
      return response
    }
    const outcome = await device.sync(session)
    assert.equal(outcome.ok, false)
    assert.equal(outcome.status, 'authFailure', JSON.stringify(outcome))
    assert.equal(device.sent(COMMIT), 0, 'an expired session never reaches the commit RPC')
    assertNotCleared(device, 'F5d')
    assert.equal(profileRevision(acct.id), null)
  })

  test('F5e sign-out during sync through the accepted AccountSessionController: commit blocked, guest retained', async t => {
    const acct = await createAccount('signout')
    const session = await signInDevice(acct)
    const device = new SimulatedDevice('device Y', guestOf({ completed: { 2: '2026-09-02' } }))
    // Test-only provider shim: the controller's accepted MockAuthProvider carrying the REAL GoTrue
    // access token (no Supabase Auth provider adapter exists in src/ yet).
    const provider = new MockAuthProvider({ accountId: acct.id, token: session.token, expiresAt: session.expiresAt })
    const controller = createAccountSessionController(provider, {
      guest: device.accessor(), transport: device.transport, autoSyncOnSignIn: false,
    })
    const signedIn = await controller.signIn({ method: 'google' })
    assert.equal(signedIn.state.status, 'authenticated')
    let signOut: Promise<unknown> | null = null
    device.interceptor = async (endpoint, _n, forward) => {
      const response = await forward()
      if (endpoint === READ) {
        signOut = controller.signOut()
        device.events.push('signed-out-mid-sync')
      }
      return response
    }
    const outcome = await controller.syncGuestToAccount()
    await signOut
    assert.equal(outcome.ok, false, JSON.stringify(outcome.syncOutcome ?? outcome.error))
    assert.equal(controller.getState().status, 'guest')
    assert.equal(device.sent(COMMIT), 0, 'no commit after sign-out')
    assertNotCleared(device, 'F5e')
    assert.equal(profileRevision(acct.id), null)

    // The same sign-out against REAL GoTrue: the session is revoked at the auth server...
    const logout = await http(stack, 'POST', '/auth/v1/logout?scope=local', { headers: bearer(session.token) })
    assert.equal(logout.status, 204, describe(logout))
    const user = await http(stack, 'GET', '/auth/v1/user', { headers: bearer(session.token) })
    assert.ok(user.status === 401 || user.status === 403, `GoTrue refuses the revoked session: ${describe(user)}`)
    // ...but PostgREST validates the JWT statelessly; this is REPORTED, not asserted (see the
    // handoff: client-side session state is what stops sync until the access token expires).
    const stateless = await rpc(stack, READ, {}, bearer(session.token))
    t.diagnostic(`F5e observation: revoked-session access JWT at PostgREST before exp → HTTP ${stateless.status}`)
  })

  test('F5f guest store mutated while the REAL commit is in flight: committed, but the new local record is protected', async () => {
    const acct = await createAccount('mutate')
    const session = await signInDevice(acct)
    const device = new SimulatedDevice('device M', guestOf({ completed: { 2: '2026-09-02' } }))
    device.interceptor = async (endpoint, _n, forward) => {
      const response = await forward()
      if (endpoint === COMMIT) device.mutateInFlight(guestOf({ completed: { 2: '2026-09-02', 8: '2026-09-08' } }))
      return response
    }
    const outcome = await device.sync(session)
    assert.equal(outcome.status, 'committed')
    assert.equal(outcome.guestClearanceDecision?.reason, 'localGuestMutatedInFlight')
    assertNotCleared(device, 'F5f')
    assert.ok(day(8) in (device.guestSnapshot.envelope.data as Json).completedChallenges, 'the in-flight record is still local')
    assert.equal(rowCount('account_completed_challenges', acct.id), 1, 'only the snapshot that was sent is on the server')
  })

  test('F0 no JWT or credential ever travelled in a request body, from any device', () => {
    assert.ok(allDevices.length >= 10 && allTokens.length >= 9)
    const bodies = JSON.stringify(allDevices.map(d => d.requestBodies))
    for (const token of allTokens) assert.equal(bodies.includes(token), false, 'a JWT appeared in a request body')
    assert.equal(bodies.includes(verifierPassword), false)
    assert.equal(redact(bodies), bodies, 'nothing JWT- or key-shaped in any request body')
  })
})
