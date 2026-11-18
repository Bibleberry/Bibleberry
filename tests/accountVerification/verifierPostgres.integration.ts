import assert from 'node:assert/strict'
import test from 'node:test'
import { runAwardVerificationPass } from '../../src/accountVerification/verifier.ts'
import type { TrustedMonthFetchResult, TrustedMonthlyEditorialProvider } from '../../src/accountVerification/types.ts'
import { FIXTURE_DATASET, FIXTURE_PROJECT_ID, allActiveCanonical, canonical, makeCard, makeTrustedMonth } from './fixtures.ts'
import { createPsqlIssuancePort, runPsql } from './psqlIssuancePort.ts'

/**
 * R13-VERIFY1 end-to-end proof against a REAL LOCAL disposable PostgreSQL:
 *   reader TX1 reconcile (authenticated) → quarantined claims
 *   → trusted month (fixture provider) → eligibility (accepted Gateway rules)
 *   → private issuance port (account_award_verifier) → permanent earned awards.
 * Run ONLY via scripts/accountDatabase/run-local-verify1-tests.sh (validates the local target).
 */
const URL = process.env.LOCAL_TEST_DATABASE_URL
const YM = '2026-09'
const A = 'e7a00000-0000-4000-8000-00000000e7a0'
const B = 'e7b00000-0000-4000-8000-00000000e7b0'
const CLIENT_ART = 'https://cdn.sanity.io/images/80016lrq/staging/CLIENT-FORGED-ART-1x1.png'

function reconcileAs(sub: string, key: string, expected: number, data: Record<string, unknown>) {
  const payload = {
    expectedRevision: expected,
    idempotencyKey: key,
    guestPayloadFingerprint: key.padEnd(64, '0').replace(/[^0-9a-f]/g, 'a').slice(0, 64),
    mode: expected === 0 ? 'newAccountTransfer' : 'existingAccountMerge',
    envelope: { schemaVersion: 1, namespace: 'cms', data },
  }
  return JSON.parse(
    runPsql(
      URL!,
      'authenticated',
      `SELECT set_config('request.jwt.claim.sub', :'sub', false);
       SELECT public.reconcile_guest_participation(:'p'::jsonb);`,
      { sub, p: JSON.stringify(payload) },
    ),
  ) as Record<string, unknown>
}

function readAs(sub: string) {
  return JSON.parse(
    runPsql(URL!, 'authenticated', `SELECT set_config('request.jwt.claim.sub', :'sub', false); SELECT public.get_account_participation();`, { sub }),
  ) as { pendingAwardVerification: string[]; envelope: { data: { earnedAwards: Record<string, { earnedCard?: { imageUrl: string; shareEligible: boolean } }> } } }
}

const admin = (sql: string) => runPsql(URL!, 'postgres', sql)

function provider(doc: () => Record<string, unknown> | null, fail = false): TrustedMonthlyEditorialProvider {
  return {
    sanityProjectId: FIXTURE_PROJECT_ID,
    dataset: FIXTURE_DATASET,
    async fetchPublishedMonth(yearMonth: string): Promise<TrustedMonthFetchResult> {
      if (fail) return { status: 'unavailable' }
      const d = yearMonth === YM ? doc() : null
      return d ? { status: 'found', document: d, revision: 'rev0001', dataset: FIXTURE_DATASET } : { status: 'notFound' }
    },
  }
}

const award = (slug: string, earnedOn = '2026-09-05', extra: Record<string, unknown> = {}) =>
  ({ [`card:monthly:${YM}:${slug}`]: { earnedOn, cardViewed: false, hubAnnouncementAcked: false, ...extra } })

test('trusted source → eligibility → private admission, end to end on real local PostgreSQL', { skip: !URL && 'LOCAL_TEST_DATABASE_URL not set (run via run-local-verify1-tests.sh)' }, async () => {
  admin(`INSERT INTO auth.users (id) VALUES ('${A}'), ('${B}') ON CONFLICT DO NOTHING;`)
  const completedA = Object.fromEntries([1, 3, 4].map(d => [canonical(YM, d), { completedOn: `${YM}-0${d}` }]))
  const ra = reconcileAs(A, 'e2e-a-1', 0, {
    completedChallenges: completedA,
    earnedAwards: {
      ...award('shepherd-theme', '2026-09-03', {
        cardViewed: true,
        // Well-formed but FORGED client snapshot (art + rights the reader chose).
        earnedCard: {
          cardDocumentId: 'card-forged',
          title: 'Forged',
          publicationYearMonth: YM,
          imageUrl: CLIENT_ART,
          assetRevision: 'v9',
          illustrationAlt: 'forged alt',
          accessibleTranscription: 'forged transcription',
          scripture: { book: 'John', reference: 'John 1:1', translation: 'WEB' },
          attribution: 'self',
          rightsStatus: 'cleared-by-client',
          shareEligible: true,
        },
      }),
      ...award('wisdom-path'), // forged: A never completed day 2
      ...award('legacy-seal'), // eligible, but only a legacy reservedCardId exists
      ...award('full-month'), // not eligible
    },
  })
  assert.equal(ra.status, 'committed', JSON.stringify(ra))
  const completedB = Object.fromEntries(allActiveCanonical(YM).map(id => [id, { completedOn: `${YM}-30` }]))
  const rb = reconcileAs(B, 'e2e-b-1', 0, {
    completedChallenges: completedB,
    earnedAwards: { ...award('full-month', '2026-09-30', { hubAnnouncementAcked: true }), ...award('shepherd-theme') },
  })
  assert.equal(rb.status, 'committed')
  assert.equal(admin(`SELECT count(*) FROM public.account_earned_awards WHERE account_id IN ('${A}','${B}');`), '0')

  const port = createPsqlIssuancePort(URL!)
  const pass1 = await runAwardVerificationPass({ provider: provider(() => makeTrustedMonth(YM)), port, now: () => new Date(), runId: 'e2e-pass-1' })
  assert.equal(pass1.admitted, 3, JSON.stringify(pass1))
  assert.deepEqual(pass1.deferredByReason, { notEligibleUnderCurrentRoster: 2, cardLegacyReservedOnly: 1 })

  // Reader A: shepherd earned with TRUSTED art; forged / legacy / ineligible claims still pending.
  const a = readAs(A)
  const shepherd = a.envelope.data.earnedAwards[`card:monthly:${YM}:shepherd-theme`]
  assert.ok(shepherd)
  assert.equal(shepherd.earnedCard?.imageUrl, `https://cdn.sanity.io/images/${FIXTURE_PROJECT_ID}/${FIXTURE_DATASET}/trusted-${YM}-shepherd-theme-1200x1600.png`)
  assert.deepEqual([...a.pendingAwardVerification].sort(), [
    `card:monthly:${YM}:full-month`, `card:monthly:${YM}:legacy-seal`, `card:monthly:${YM}:wisdom-path`,
  ])
  const serializedA = JSON.stringify(a)
  for (const forbidden of ['card-forged', CLIENT_ART, 'PRIVATE_CARD_REVIEW_NOTE', 'INTERNAL_STUDIO_LABEL', 'trusted-2026-09-wisdom-path', 'trusted-2026-09-full-month']) {
    assert.equal(serializedA.includes(forbidden), false, `reader A readback leaked ${forbidden}`)
  }
  // Reader B: full-month earned with trusted shareEligible, hub flag carried from the claim.
  const b = readAs(B)
  assert.equal(b.envelope.data.earnedAwards[`card:monthly:${YM}:full-month`]?.earnedCard?.shareEligible, true)
  assert.equal(admin(`SELECT hub_announcement_acked FROM public.account_earned_awards WHERE account_id='${B}' AND award_id='card:monthly:${YM}:full-month';`), 't')
  assert.equal(admin(`SELECT string_agg(last_reason, ',' ORDER BY award_id) FROM public.account_award_verification_attempts WHERE account_id='${A}';`),
    'notEligibleUnderCurrentRoster,cardLegacyReservedOnly,notEligibleUnderCurrentRoster')

  // Re-run: idempotent (nothing re-admitted, deferrals counted again, no duplicate rows).
  const pass2 = await runAwardVerificationPass({ provider: provider(() => makeTrustedMonth(YM)), port, now: () => new Date(), runId: 'e2e-pass-2' })
  assert.equal(pass2.admitted, 0)
  assert.equal(pass2.deferred, 3)
  assert.equal(admin(`SELECT count(*) FROM public.account_earned_awards WHERE account_id IN ('${A}','${B}');`), '3')

  // Trusted source outage: everything stays pending, nothing admitted or lost.
  const outage = await runAwardVerificationPass({ provider: provider(() => null, true), port, now: () => new Date(), runId: 'e2e-outage' })
  assert.deepEqual(outage.deferredByReason, { trustedSourceUnavailable: 3 })

  // Approved Card metadata appears for the legacy discovery: the claim now resolves.
  const withLegacyCard = () => {
    const doc = makeTrustedMonth(YM)
    const card = makeCard(`${YM}-legacy-seal`, 'monthlyThematic', YM)
    const disc = (doc.discoveries as Record<string, unknown>[])[2]
    delete disc.reservedCardId
    disc.rawCardRef = card._id
    disc.card = card
    return doc
  }
  const pass3 = await runAwardVerificationPass({ provider: provider(withLegacyCard), port, now: () => new Date(), runId: 'e2e-pass-3' })
  assert.equal(pass3.admitted, 1)
  assert.deepEqual(readAs(A).pendingAwardVerification.sort(), [`card:monthly:${YM}:full-month`, `card:monthly:${YM}:wisdom-path`])

  // Reader cannot reach the issuance port with the same tooling.
  assert.throws(() => runPsql(URL!, 'authenticated', `SELECT account_issuance.list_pending_award_claims(10);`), /permission denied/)

  admin(`DELETE FROM auth.users WHERE id IN ('${A}','${B}');`)
})
