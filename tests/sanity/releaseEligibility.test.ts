import assert from 'node:assert/strict'
import test from 'node:test'
import {
  evaluateChallengeReleaseEligibility,
  type ReleaseEligibilityChallengeInput,
} from '../../src/cms/reader/releaseEligibility.ts'

test('evaluates exact release boundaries with millisecond precision', () => {
  const boundaryIso = '2026-11-06T18:00:00.000Z'
  const boundaryMs = Date.parse(boundaryIso)

  const challenge: ReleaseEligibilityChallengeInput = {
    releaseAtUtc: boundaryIso,
    editorial: {
      adaptationReviewed: true,
      reviewedAt: '2026-11-01T12:00:00.000Z',
    },
  }

  // Exact boundary: releaseTime === nowTime -> eligible
  const exactNow = new Date(boundaryMs)
  const exactResult = evaluateChallengeReleaseEligibility(challenge, exactNow)
  assert.equal(exactResult.isEligible, true)
  if (exactResult.isEligible) {
    assert.equal(exactResult.releaseTime, boundaryMs)
    assert.equal(exactResult.releaseDate.toISOString(), boundaryIso)
  }

  // 1 millisecond past boundary: releaseTime < nowTime -> eligible
  const pastNow = new Date(boundaryMs + 1)
  const pastResult = evaluateChallengeReleaseEligibility(challenge, pastNow)
  assert.equal(pastResult.isEligible, true)

  // 1 millisecond before boundary: releaseTime > nowTime -> embargoed
  const futureNow = new Date(boundaryMs - 1)
  const futureResult = evaluateChallengeReleaseEligibility(challenge, futureNow)
  assert.equal(futureResult.isEligible, false)
  if (!futureResult.isEligible) {
    assert.equal(futureResult.reason, 'embargoed')
    assert.equal(futureResult.releaseTime, boundaryMs)
  }
})

test('normalizes timestamps with different timezone offsets to identical instants', () => {
  // 18:00 UTC == 13:00 EST (-05:00) == 03:00 next day JST (+09:00)
  const instantUtc = '2026-11-06T18:00:00.000Z'
  const instantEst = '2026-11-06T13:00:00-05:00'
  const instantJst = '2026-11-07T03:00:00+09:00'

  const targetMs = Date.parse(instantUtc)
  assert.equal(Date.parse(instantEst), targetMs)
  assert.equal(Date.parse(instantJst), targetMs)

  const makeChallenge = (releaseAtUtc: string): ReleaseEligibilityChallengeInput => ({
    releaseAtUtc,
    editorial: {
      adaptationReviewed: true,
      reviewedAt: '2026-11-01T12:00:00.000Z',
    },
  })

  const testNow = new Date(targetMs)

  const resultUtc = evaluateChallengeReleaseEligibility(makeChallenge(instantUtc), testNow)
  const resultEst = evaluateChallengeReleaseEligibility(makeChallenge(instantEst), testNow)
  const resultJst = evaluateChallengeReleaseEligibility(makeChallenge(instantJst), testNow)

  assert.equal(resultUtc.isEligible, true)
  assert.equal(resultEst.isEligible, true)
  assert.equal(resultJst.isEligible, true)

  if (resultUtc.isEligible && resultEst.isEligible && resultJst.isEligible) {
    assert.equal(resultUtc.releaseTime, targetMs)
    assert.equal(resultEst.releaseTime, targetMs)
    assert.equal(resultJst.releaseTime, targetMs)
  }

  // All three evaluate identically when embargoed by 1 ms
  const embargoedNow = new Date(targetMs - 1)
  const embargoedUtc = evaluateChallengeReleaseEligibility(makeChallenge(instantUtc), embargoedNow)
  const embargoedEst = evaluateChallengeReleaseEligibility(makeChallenge(instantEst), embargoedNow)
  const embargoedJst = evaluateChallengeReleaseEligibility(makeChallenge(instantJst), embargoedNow)

  assert.equal(embargoedUtc.isEligible, false)
  assert.equal(embargoedEst.isEligible, false)
  assert.equal(embargoedJst.isEligible, false)

  if (!embargoedUtc.isEligible && !embargoedEst.isEligible && !embargoedJst.isEligible) {
    assert.equal(embargoedUtc.reason, 'embargoed')
    assert.equal(embargoedEst.reason, 'embargoed')
    assert.equal(embargoedJst.reason, 'embargoed')
  }
})

test('rejects unreviewed Challenges fail-closed regardless of release timestamp', () => {
  const pastTimestamp = '2020-01-01T00:00:00.000Z'
  const now = new Date('2026-11-06T12:00:00.000Z')

  // Missing editorial
  const unreviewed1 = evaluateChallengeReleaseEligibility(
    { releaseAtUtc: pastTimestamp, editorial: undefined as unknown as { adaptationReviewed: true; reviewedAt: string } },
    now,
  )
  assert.equal(unreviewed1.isEligible, false)
  if (!unreviewed1.isEligible) assert.equal(unreviewed1.reason, 'unreviewed')

  // adaptationReviewed is false
  const unreviewed2 = evaluateChallengeReleaseEligibility(
    {
      releaseAtUtc: pastTimestamp,
      editorial: { adaptationReviewed: false as unknown as true, reviewedAt: '2026-11-01T12:00:00Z' },
    },
    now,
  )
  assert.equal(unreviewed2.isEligible, false)
  if (!unreviewed2.isEligible) assert.equal(unreviewed2.reason, 'unreviewed')

  // Null input
  const unreviewedNull = evaluateChallengeReleaseEligibility(
    null as unknown as ReleaseEligibilityChallengeInput,
    now,
  )
  assert.equal(unreviewedNull.isEligible, false)
  if (!unreviewedNull.isEligible) assert.equal(unreviewedNull.reason, 'unreviewed')
})

test('rejects invalid or unparseable release timestamps fail-closed', () => {
  const now = new Date('2026-11-06T12:00:00.000Z')
  const baseReviewed = { adaptationReviewed: true as const, reviewedAt: '2026-11-01T12:00:00Z' }

  const invalidInputs = [
    '',
    '   ',
    'not-a-timestamp',
    '2026-99-99T99:99:99Z',
    null as unknown as string,
    undefined as unknown as string,
  ]

  for (const invalidTimestamp of invalidInputs) {
    const result = evaluateChallengeReleaseEligibility(
      { releaseAtUtc: invalidTimestamp, editorial: baseReviewed },
      now,
    )
    assert.equal(result.isEligible, false)
    if (!result.isEligible) {
      assert.equal(result.reason, 'invalidTimestamp')
    }
  }

  // Invalid now date
  const resultWithInvalidNow = evaluateChallengeReleaseEligibility(
    { releaseAtUtc: '2026-11-01T00:00:00Z', editorial: baseReviewed },
    new Date('invalid'),
  )
  assert.equal(resultWithInvalidNow.isEligible, false)
  if (!resultWithInvalidNow.isEligible) {
    assert.equal(resultWithInvalidNow.reason, 'invalidTimestamp')
  }
})
