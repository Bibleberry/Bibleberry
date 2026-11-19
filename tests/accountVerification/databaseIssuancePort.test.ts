import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ISSUANCE_SQL,
  createDatabaseAwardIssuancePort,
  type SqlParameter,
  type VerifierSqlExecutor,
} from '../../src/accountVerification/databaseIssuancePort.ts'
import { isVerifierRuntimeError } from '../../src/accountVerification/runtimeErrors.ts'
import type { TrustedAwardAttestation } from '../../src/accountVerification/types.ts'

/**
 * R13-VERIFY2 unit tests for the REAL AwardIssuancePort adapter against a FAKE executor.
 * (The same adapter runs against real local Supabase in tests/accountSupabase/verifierRuntime.)
 */

const A = 'a1a00000-0000-4000-8000-00000000a1a0'
const AWARD = 'card:monthly:2026-10:hope'

type Call = { text: string; params: readonly SqlParameter[] }

function fakeExecutor(respond: (call: Call) => readonly Record<string, unknown>[] | Error): {
  executor: VerifierSqlExecutor
  calls: Call[]
} {
  const calls: Call[] = []
  return {
    calls,
    executor: {
      async query(text, params) {
        const call = { text, params }
        calls.push(call)
        const out = respond(call)
        if (out instanceof Error) throw out
        return out
      },
    },
  }
}

const json = (value: unknown) => [{ result: JSON.stringify(value) }]

async function expectContract(promise: Promise<unknown>, label: string) {
  await assert.rejects(promise, e => isVerifierRuntimeError(e) && e.category === 'contract', label)
}

test('every SQL text is a schema-qualified constant using only bound parameters', () => {
  for (const [name, sql] of Object.entries(ISSUANCE_SQL)) {
    assert.match(sql, /account_issuance\.[a-z_]+\(/, name)
    assert.equal(/'\s*\|\||\$\{|%s|format\(/.test(sql), false, `${name} must not build SQL from values`)
    assert.equal(/\bpublic\.|\bauth\.|service_role|SET ROLE/i.test(sql), false, `${name} touches only the issuance port`)
  }
  assert.ok(Object.isFrozen(ISSUANCE_SQL))
})

test('listPendingClaims binds the limit, validates rows and rejects malformed / oversized pages', async () => {
  const good = [{ account_id: A, award_id: AWARD, publication_year_month: '2026-10' }]
  const { executor, calls } = fakeExecutor(() => good)
  const port = createDatabaseAwardIssuancePort(executor)
  assert.deepEqual(await port.listPendingClaims(7), [{ accountId: A, awardId: AWARD, publicationYearMonth: '2026-10' }])
  assert.deepEqual(calls[0], { text: ISSUANCE_SQL.listPendingClaims, params: [7] })

  await assert.rejects(port.listPendingClaims(0))
  await assert.rejects(port.listPendingClaims(501))

  const bad: Record<string, unknown>[][] = [
    [{ ...good[0], account_id: 'not-a-uuid' }],
    [{ ...good[0], award_id: "card:monthly:2026-10:x'; drop" }],
    [{ ...good[0], publication_year_month: '2026-11' }], // month does not match the award
    [good[0], good[0]], // duplicate pair
    [{ account_id: A }],
  ]
  for (const rows of bad) {
    await expectContract(createDatabaseAwardIssuancePort(fakeExecutor(() => rows).executor).listPendingClaims(10), JSON.stringify(rows))
  }
  await expectContract(
    createDatabaseAwardIssuancePort(fakeExecutor(() => [good[0], { ...good[0], award_id: 'card:monthly:2026-10:faith' }]).executor).listPendingClaims(1),
    'more rows than the limit',
  )
})

test('getClaimVerificationContext: exact pair echo, cms: completions only, unknown fields rejected', async () => {
  const ctx = { status: 'pending', accountId: A, awardId: AWARD, publicationYearMonth: '2026-10', claimedEarnedOn: '2026-10-04', completedChallengeIds: ['cms:a', 'cms:b.c:d'] }
  const { executor, calls } = fakeExecutor(() => json(ctx))
  const port = createDatabaseAwardIssuancePort(executor)
  assert.deepEqual(await port.getClaimVerificationContext(A, AWARD), {
    status: 'pending', accountId: A, awardId: AWARD, publicationYearMonth: '2026-10', completedChallengeIds: ['cms:a', 'cms:b.c:d'],
  })
  assert.deepEqual(calls[0].params, [A, AWARD])

  assert.deepEqual(
    await createDatabaseAwardIssuancePort(fakeExecutor(() => json({ status: 'noPendingClaim' })).executor).getClaimVerificationContext(A, AWARD),
    { status: 'noPendingClaim' },
  )
  // An invalid identifier never reaches the database.
  const guarded = fakeExecutor(() => json(ctx))
  assert.deepEqual(await createDatabaseAwardIssuancePort(guarded.executor).getClaimVerificationContext('x', AWARD), { status: 'noPendingClaim' })
  assert.equal(guarded.calls.length, 0)

  for (const bad of [
    { ...ctx, accountId: 'b1b00000-0000-4000-8000-00000000b1b0' }, // another account's context
    { ...ctx, awardId: 'card:monthly:2026-10:faith' },
    { ...ctx, completedChallengeIds: ['pilot:x'] },
    { ...ctx, completedChallengeIds: 'cms:a' },
    { ...ctx, earnedCard: { imageUrl: 'x' } },
    { ...ctx, status: 'admitted' },
    { status: 'noPendingClaim', completedChallengeIds: ['cms:a'] },
  ]) {
    await expectContract(createDatabaseAwardIssuancePort(fakeExecutor(() => json(bad)).executor).getClaimVerificationContext(A, AWARD), JSON.stringify(bad))
  }
  for (const rows of [[], [{ result: null }], [{ result: 'not json' }], [{ result: '[]' }], [{ result: '{}' }], json(ctx).concat(json(ctx))]) {
    await expectContract(createDatabaseAwardIssuancePort(fakeExecutor(() => rows).executor).getClaimVerificationContext(A, AWARD), JSON.stringify(rows))
  }
})

test('admitVerifiedAward sends the attestation as ONE jsonb parameter and validates every result shape', async () => {
  const attestation = { awardId: AWARD, accountId: A } as unknown as TrustedAwardAttestation
  const cases: [unknown, unknown][] = [
    [{ status: 'admitted', awardId: AWARD, revision: 4, earnedOn: '2026-10-04' }, { status: 'admitted', earnedOn: '2026-10-04', revision: 4 }],
    [{ status: 'alreadyEarned', awardId: AWARD, revision: null }, { status: 'alreadyEarned', revision: null }],
    [{ status: 'noPendingClaim' }, { status: 'noPendingClaim' }],
    [{ status: 'retry', detail: 'concurrentAdmission' }, { status: 'retry', detail: 'concurrentAdmission' }],
    [{ status: 'rejected', detail: 'basisNotInAccountCompletions' }, { status: 'rejected', detail: 'basisNotInAccountCompletions' }],
  ]
  for (const [raw, expected] of cases) {
    const { executor, calls } = fakeExecutor(() => json(raw))
    assert.deepEqual(await createDatabaseAwardIssuancePort(executor).admitVerifiedAward(attestation), expected)
    assert.equal(calls[0].text, ISSUANCE_SQL.admitVerifiedAward)
    assert.deepEqual(calls[0].params, [JSON.stringify(attestation)])
  }
  for (const bad of [
    { status: 'admitted', awardId: 'card:monthly:2026-10:other', revision: 4, earnedOn: '2026-10-04' },
    { status: 'admitted', awardId: AWARD, revision: -1, earnedOn: '2026-10-04' },
    { status: 'admitted', awardId: AWARD, revision: 1, earnedOn: 'yesterday' },
    { status: 'admitted', awardId: AWARD, revision: 1, earnedOn: '2026-10-04', earnedCard: {} },
    { status: 'rejected', detail: 'free text with spaces and an id a1a00000' },
    { status: 'granted' },
  ]) {
    await expectContract(createDatabaseAwardIssuancePort(fakeExecutor(() => json(bad)).executor).admitVerifiedAward(attestation), JSON.stringify(bad))
  }
})

test('recordDeferral binds 4 parameters, tolerates a concurrently resolved claim, and never ignores a rejection', async () => {
  const seen: string[] = []
  const { executor, calls } = fakeExecutor(() => json({ status: 'deferred', reason: 'cardNotApproved' }))
  await createDatabaseAwardIssuancePort(executor, { onDeferralRecorded: r => seen.push(r) }).recordDeferral(A, AWARD, 'cardNotApproved', 2)
  assert.deepEqual(calls[0], { text: ISSUANCE_SQL.recordDeferral, params: [A, AWARD, 'cardNotApproved', 2] })
  const nullRoster = fakeExecutor(() => json({ status: 'deferred', reason: 'monthNotFound' }))
  await createDatabaseAwardIssuancePort(nullRoster.executor).recordDeferral(A, AWARD, 'monthNotFound')
  assert.deepEqual(nullRoster.calls[0].params, [A, AWARD, 'monthNotFound', null])

  await createDatabaseAwardIssuancePort(fakeExecutor(() => json({ status: 'noPendingClaim' })).executor, { onDeferralRecorded: r => seen.push(r) })
    .recordDeferral(A, AWARD, 'cardNotApproved', 1)
  assert.deepEqual(seen, ['deferred', 'noPendingClaim'])

  await expectContract(createDatabaseAwardIssuancePort(fakeExecutor(() => json({ status: 'rejected', detail: 'invalidDeferralReason' })).executor)
    .recordDeferral(A, AWARD, 'cardNotApproved', 1), 'rejection surfaces')
  await expectContract(createDatabaseAwardIssuancePort(fakeExecutor(() => json({ status: 'deferred', reason: 'monthNotFound' })).executor)
    .recordDeferral(A, AWARD, 'cardNotApproved', 1), 'reason echo mismatch')
  await assert.rejects(createDatabaseAwardIssuancePort(fakeExecutor(() => json({})).executor)
    // @ts-expect-error unknown reason is refused before reaching SQL
    .recordDeferral(A, AWARD, 'becauseISaidSo', 1))
})

test('contract errors never echo database values', async () => {
  const marker = 'a1a00000-0000-4000-8000-00000000a1a0 card:monthly:2026-10:secret-art'
  try {
    await createDatabaseAwardIssuancePort(fakeExecutor(() => json({ status: 'admitted', awardId: marker })).executor)
      .admitVerifiedAward({ awardId: AWARD } as unknown as TrustedAwardAttestation)
    assert.fail('expected rejection')
  } catch (error) {
    assert.equal(String((error as Error).message).includes('a1a00000'), false)
    assert.equal(String((error as Error).message).includes('secret-art'), false)
  }
})
