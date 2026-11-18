import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateClaimEligibility, type EvaluateClaimInput } from '../../src/accountVerification/eligibility.ts'
import type { TrustedMonthFetchResult } from '../../src/accountVerification/types.ts'
import { evaluateTrustedMonthAwardEligibility } from '../../src/gateway/monthlyProjection.ts'
import {
  FIXTURE_DATASET,
  FIXTURE_PROJECT_ID,
  allActiveCanonical,
  canonical,
  challengeId,
  makeCard,
  makeTrustedMonth,
} from './fixtures.ts'

const YM = '2026-09'
const ACCOUNT = '11111111-1111-4111-8111-111111111111'
const AFTER_MONTH = '2026-10-15'

function found(doc: unknown, revision = 'rev0001'): TrustedMonthFetchResult {
  return { status: 'found', document: doc, revision, dataset: FIXTURE_DATASET }
}

function decide(overrides: Partial<EvaluateClaimInput> & Pick<EvaluateClaimInput, 'awardId'>) {
  return evaluateClaimEligibility({
    accountId: ACCOUNT,
    completedChallengeIds: [],
    month: found(makeTrustedMonth(YM)),
    sanityProjectId: FIXTURE_PROJECT_ID,
    releasedThroughDate: AFTER_MONTH,
    verificationKey: 'run-test-1',
    ...overrides,
  })
}

test('eligible thematic claim from released account completions is admitted with ONLY the trusted Card projection', () => {
  const d = decide({
    awardId: `card:monthly:${YM}:shepherd-theme`,
    completedChallengeIds: [canonical(YM, 1), canonical(YM, 3), canonical(YM, 9)],
  })
  assert.equal(d.decision, 'admit')
  if (d.decision !== 'admit') return
  const a = d.attestation
  assert.equal(a.kind, 'thematic')
  assert.equal(a.discoveryId, `discovery:${YM}:shepherd-theme`)
  assert.deepEqual(a.basisChallengeIds, [canonical(YM, 1), canonical(YM, 3)], 'basis = this account’s qualifying completions only')
  assert.equal(a.targetCount, 2)
  assert.equal(a.latestBasisReleaseDate, `${YM}-03`)
  assert.equal(a.verifiedThroughDate, AFTER_MONTH)
  assert.equal(a.card.cardDocumentId, `card-${YM}-shepherd-theme`)
  assert.equal(a.card.imageUrl, `https://cdn.sanity.io/images/${FIXTURE_PROJECT_ID}/${FIXTURE_DATASET}/trusted-${YM}-shepherd-theme-1200x1600.png`)
  assert.deepEqual(a.source, { documentId: `month-${YM}`, revision: 'rev0001', dataset: FIXTURE_DATASET, perspective: 'published' })
  const serialized = JSON.stringify(a)
  assert.equal(serialized.includes('PRIVATE_CARD_REVIEW_NOTE_DO_NOT_LEAK'), false)
  assert.equal(serialized.includes('INTERNAL_STUDIO_LABEL_'), false)
  assert.equal(serialized.includes('qualifyingChallengeIds'), false)
  assert.equal(serialized.includes(canonical(YM, 9)), false, 'unrelated completions are not disclosed in the attestation')
})

test('trusted shareEligible / attribution / licensed citation come from the approved Card, not the claim', () => {
  const d = decide({ awardId: `card:monthly:${YM}:wisdom-path`, completedChallengeIds: [canonical(YM, 2)] })
  assert.equal(d.decision, 'admit')
  if (d.decision !== 'admit') return
  assert.equal(d.attestation.card.shareEligible, false)
  assert.equal(d.attestation.card.scripture.translation, 'WEBP')
  assert.equal(d.attestation.card.attribution, 'Synthetic QA fixture')
})

test('full-month claim requires every active released slot; one missing defers as not eligible', () => {
  const all = allActiveCanonical(YM)
  const ok = decide({ awardId: `card:monthly:${YM}:full-month`, completedChallengeIds: all })
  assert.equal(ok.decision, 'admit')
  if (ok.decision === 'admit') {
    assert.equal(ok.attestation.kind, 'fullMonth')
    assert.equal(ok.attestation.targetCount, 30)
    assert.equal(ok.attestation.basisChallengeIds.length, 30)
    assert.equal(ok.attestation.latestBasisReleaseDate, `${YM}-30`)
  }
  const missingOne = decide({ awardId: `card:monthly:${YM}:full-month`, completedChallengeIds: all.slice(1) })
  assert.deepEqual(missingOne, { decision: 'defer', reason: 'notEligibleUnderCurrentRoster', rosterVersion: 1 })
})

test('no cross-month leakage: another month’s completions never satisfy this month', () => {
  const other = '2026-08'
  const d = decide({
    awardId: `card:monthly:${YM}:shepherd-theme`,
    completedChallengeIds: [canonical(other, 1), canonical(other, 3), `cms:${challengeId(YM, 1)}x`],
  })
  assert.deepEqual(d, { decision: 'defer', reason: 'notEligibleUnderCurrentRoster', rosterVersion: 1 })
})

test('forged inputs never become authority: award IDs, guessed Cards, account IDs, IDs with whitespace or pilot namespace', () => {
  assert.deepEqual(decide({ awardId: `card:monthly:${YM}:not-a-real-discovery`, completedChallengeIds: allActiveCanonical(YM) }),
    { decision: 'defer', reason: 'discoveryNotFound', rosterVersion: 1 })
  assert.deepEqual(decide({ awardId: 'card:monthly:2026-13:shepherd-theme' }), { decision: 'invalidClaim' })
  assert.deepEqual(decide({ awardId: `card-${YM}-shepherd-theme` }), { decision: 'invalidClaim' }, 'a guessed Card document ID is not an award')
  assert.deepEqual(decide({ awardId: `card:monthly:${YM}:shepherd-theme`, accountId: 'not-a-uuid' }), { decision: 'invalidClaim' })
  assert.deepEqual(
    decide({ awardId: `card:monthly:${YM}:shepherd-theme`, completedChallengeIds: [` ${canonical(YM, 1)}`, `pilot:${challengeId(YM, 3)}`, challengeId(YM, 3)] }),
    { decision: 'defer', reason: 'notEligibleUnderCurrentRoster', rosterVersion: 1 },
  )
})

test('client-supplied mappings inside the TRUSTED document are irrelevant unless they are the published month itself', () => {
  // A month whose discovery claims day 9 qualifies would only matter if it is the published doc;
  // the evaluator re-validates V-DISC-SUBSET so a non-roster qualifying ref fails the whole month.
  const tampered = makeTrustedMonth(YM)
  ;(tampered.discoveries as Record<string, unknown>[])[0].qualifyingChallengeIds = ['not-in-roster']
  assert.deepEqual(
    decide({ awardId: `card:monthly:${YM}:shepherd-theme`, month: found(tampered), completedChallengeIds: [canonical(YM, 1)] }),
    { decision: 'defer', reason: 'monthNotPublishable' },
  )
})

test('pre-release: slots not yet released at the UTC-12 universal floor never count; month before start is embargoed', () => {
  const partial = decide({
    awardId: `card:monthly:${YM}:shepherd-theme`,
    completedChallengeIds: [canonical(YM, 1), canonical(YM, 3)],
    releasedThroughDate: `${YM}-02`,
  })
  assert.deepEqual(partial, { decision: 'defer', reason: 'notEligibleUnderCurrentRoster', rosterVersion: 1 })
  const before = decide({
    awardId: `card:monthly:${YM}:shepherd-theme`,
    completedChallengeIds: [canonical(YM, 1), canonical(YM, 3)],
    releasedThroughDate: '2026-08-31',
  })
  assert.deepEqual(before, { decision: 'defer', reason: 'monthNotYetReleased' })
})

test('draft, unreviewed, withdrawn, unlicensed, mis-categorised, wrong-month, wrong-project Cards defer without admitting', () => {
  const basis = { awardId: `card:monthly:${YM}:shepherd-theme`, completedChallengeIds: [canonical(YM, 1), canonical(YM, 3)] }
  const variants: Record<string, Record<string, unknown> | null> = {
    draft: makeCard(`${YM}-shepherd-theme`, 'monthlyThematic', YM, { _id: `drafts.card-${YM}-shepherd-theme` }),
    unapproved: makeCard(`${YM}-shepherd-theme`, 'monthlyThematic', YM, { editorialStatus: 'inReview' }),
    unreviewed: makeCard(`${YM}-shepherd-theme`, 'monthlyThematic', YM, { editorialReview: null }),
    withdrawn: makeCard(`${YM}-shepherd-theme`, 'monthlyThematic', YM, { withdrawn: true }),
    unlicensedArt: makeCard(`${YM}-shepherd-theme`, 'monthlyThematic', YM, { rightsAndAttribution: { attribution: 'x', rightsStatus: 'x', usageRightsConfirmed: false } }),
    unlicensedCitation: makeCard(`${YM}-shepherd-theme`, 'monthlyThematic', YM, { scriptureCitation: { book: 'John', reference: 'John 1:1', translation: 'ESV', usageRightsConfirmed: false } }),
    wrongCategory: makeCard(`${YM}-shepherd-theme`, 'monthlyFull', YM),
    wrongMonth: makeCard(`${YM}-shepherd-theme`, 'monthlyThematic', '2026-08'),
    wrongProjectArt: makeCard(`${YM}-shepherd-theme`, 'monthlyThematic', YM, { artwork: { url: 'https://cdn.sanity.io/images/otherproj/staging/x-1x1.png' } }),
    sameAltAndTranscription: makeCard(`${YM}-shepherd-theme`, 'monthlyThematic', YM, { illustrationAlt: 'Same', accessibleTranscription: 'same' }),
  }
  for (const [name, card] of Object.entries(variants)) {
    const d = decide({ ...basis, month: found(makeTrustedMonth(YM, { shepherdCard: card })) })
    assert.equal(d.decision, 'defer', name)
    if (d.decision === 'defer') assert.equal(d.reason, 'cardNotApproved', name)
  }
  const dangling = makeTrustedMonth(YM)
  ;(dangling.discoveries as Record<string, unknown>[])[0].card = null
  assert.deepEqual(decide({ ...basis, month: found(dangling) }), { decision: 'defer', reason: 'cardNotApproved', rosterVersion: 1 },
    'broken (dangling) Card link defers')
  assert.deepEqual(decide({ ...basis, month: found(makeTrustedMonth(YM, { shepherdCard: null })) }),
    { decision: 'defer', reason: 'cardNotLinked', rosterVersion: 1 })
})

test('duplicate Card linked to two awards in one month fails closed for both', () => {
  const dup = makeCard(`${YM}-shepherd-theme`, 'monthlyThematic', YM)
  const month = found(makeTrustedMonth(YM, { wisdomCard: dup }))
  assert.equal(decide({ awardId: `card:monthly:${YM}:shepherd-theme`, completedChallengeIds: [canonical(YM, 1), canonical(YM, 3)], month }).decision, 'defer')
  assert.equal(decide({ awardId: `card:monthly:${YM}:wisdom-path`, completedChallengeIds: [canonical(YM, 2)], month }).decision, 'defer')
})

test('legacy reservedCardId does not become an eligible Card asset without an approved published Card', () => {
  assert.deepEqual(
    decide({ awardId: `card:monthly:${YM}:legacy-seal`, completedChallengeIds: [canonical(YM, 4)] }),
    { decision: 'defer', reason: 'cardLegacyReservedOnly', rosterVersion: 1 },
  )
})

test('invalid / missing / unpublishable month data defers safely', () => {
  const awardId = `card:monthly:${YM}:shepherd-theme`
  const completedChallengeIds = [canonical(YM, 1), canonical(YM, 3)]
  assert.deepEqual(decide({ awardId, completedChallengeIds, month: { status: 'unavailable' } }), { decision: 'defer', reason: 'trustedSourceUnavailable' })
  assert.deepEqual(decide({ awardId, completedChallengeIds, month: { status: 'notFound' } }), { decision: 'defer', reason: 'monthNotFound' })
  for (const overrides of [
    { editorialStatus: 'draft' },
    { withdrawn: true },
    { editorialReview: null },
    { _id: `drafts.month-${YM}` },
    { yearMonth: '2026-08' },
    { slots: [] },
    { rosterFinalization: { isFinalized: false, rosterVersion: 1, finalizedChallengeIds: [] } },
  ]) {
    assert.deepEqual(
      decide({ awardId, completedChallengeIds, month: found(makeTrustedMonth(YM, { overrides })) }),
      { decision: 'defer', reason: 'monthNotPublishable' },
      JSON.stringify(overrides),
    )
  }
  const malformedPrior = makeTrustedMonth(YM, { priorRosters: [{ rosterVersion: 'one' }] })
  assert.deepEqual(decide({ awardId, completedChallengeIds, month: found(malformedPrior) }), { decision: 'defer', reason: 'monthNotPublishable' })
})

test('roster revision: withdrawn qualifying slot shrinks the active requirement (Option 4A); priorRosters never rewards stale claims', () => {
  const v2 = makeTrustedMonth(YM, {
    rosterVersion: 2,
    withdrawnDays: [3],
    priorRosters: [{ rosterVersion: 1, finalizedChallengeIds: [challengeId(YM, 1)], supersededAt: '2026-09-05T00:00:00Z' }],
  })
  const shrunk = decide({ awardId: `card:monthly:${YM}:shepherd-theme`, completedChallengeIds: [canonical(YM, 1)], month: found(v2) })
  assert.equal(shrunk.decision, 'admit')
  if (shrunk.decision === 'admit') {
    assert.equal(shrunk.attestation.targetCount, 1)
    assert.equal(shrunk.attestation.rosterVersion, 2)
  }
  // Only the withdrawn day completed: the current roster cannot prove it; prior rosters exist,
  // so the missing fact is reported as historical, and the claim stays pending.
  const stale = decide({ awardId: `card:monthly:${YM}:wisdom-path`, completedChallengeIds: [canonical(YM, 3)], month: found(v2) })
  assert.deepEqual(stale, { decision: 'defer', reason: 'historicalRosterEligibilityUnprovable', rosterVersion: 2 })
  const fullV2 = decide({ awardId: `card:monthly:${YM}:full-month`, completedChallengeIds: allActiveCanonical(YM, [3]), month: found(v2) })
  assert.equal(fullV2.decision, 'admit', 'full-month adjusts to N-1 active Challenges')
  const dupRoster = makeTrustedMonth(YM)
  ;(dupRoster.rosterFinalization as { finalizedChallengeIds: string[] }).finalizedChallengeIds.push(challengeId(YM, 1))
  assert.deepEqual(decide({ awardId: `card:monthly:${YM}:shepherd-theme`, completedChallengeIds: [canonical(YM, 1), canonical(YM, 3)], month: found(dupRoster) }),
    { decision: 'defer', reason: 'monthNotPublishable' }, 'duplicate roster entry fails closed')
})

test('internal evaluator never exposes qualifying IDs for unearned awards', () => {
  const r = evaluateTrustedMonthAwardEligibility(makeTrustedMonth(YM), YM, AFTER_MONTH, [canonical(YM, 1)], {
    sanityProjectId: FIXTURE_PROJECT_ID,
    sanityDataset: FIXTURE_DATASET,
  })
  assert.equal(r.ok, true)
  if (!r.ok) return
  for (const e of r.document.entries) {
    if (!e.isEarned) assert.deepEqual(e.basisBaseIds, [], e.awardId)
  }
})
