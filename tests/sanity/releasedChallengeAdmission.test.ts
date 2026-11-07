import assert from 'node:assert/strict'
import test from 'node:test'
import {
  admitReleasedCmsChallenge,
  isAdmittedChallenge,
  type ReleasedCmsChallengeInput,
} from '../../src/participation/admission.ts'

const validScreens = [
  { id: 'screen-1' },
  { id: 'screen-2' },
]

const baseEligibleChallenge: ReleasedCmsChallengeInput = {
  documentId: 'challenge-2026-11-06-rejoice-always',
  screens: validScreens,
  releaseAtUtc: '2026-11-06T12:00:00.000Z',
  editorial: {
    adaptationReviewed: true,
    reviewedAt: '2026-11-05T12:00:00.000Z',
  },
}

test('admits eligible published Challenge with unforgeable capability token and cms namespace', () => {
  const now = new Date('2026-11-06T15:00:00.000Z')
  const admitted = admitReleasedCmsChallenge(baseEligibleChallenge, now, {
    previousDocumentIds: ['legacy-challenge-id-prev'],
  })

  assert.ok(admitted !== null)
  assert.equal(isAdmittedChallenge(admitted, 'cms'), true)
  assert.equal(isAdmittedChallenge(admitted, 'pilot'), false)
  assert.equal(admitted.namespace, 'cms')
  assert.equal(admitted.challengeId, 'cms:challenge-2026-11-06-rejoice-always')
  assert.deepEqual(admitted.screens, [{ id: 'screen-1' }, { id: 'screen-2' }])
  assert.deepEqual(admitted.previousChallengeIds, ['cms:legacy-challenge-id-prev'])
})

test('fails closed (returns null) for embargoed future-released Challenges', () => {
  const beforeRelease = new Date('2026-11-06T11:59:59.999Z')
  const admitted = admitReleasedCmsChallenge(baseEligibleChallenge, beforeRelease)

  assert.equal(admitted, null)
})

test('fails closed (returns null) for unreviewed Challenges regardless of date', () => {
  const past = new Date('2030-01-01T00:00:00.000Z')
  const unreviewed: ReleasedCmsChallengeInput = {
    ...baseEligibleChallenge,
    editorial: {
      adaptationReviewed: false as unknown as true,
      reviewedAt: '2026-11-05T12:00:00.000Z',
    },
  }

  assert.equal(admitReleasedCmsChallenge(unreviewed, past), null)
})

test('fails closed for invalid document IDs, drafts, and malformed screens', () => {
  const now = new Date('2026-11-06T15:00:00.000Z')

  // Draft ID rejection
  assert.equal(
    admitReleasedCmsChallenge(
      { ...baseEligibleChallenge, documentId: 'drafts.challenge-1' },
      now,
    ),
    null,
  )

  // Empty screens rejection
  assert.equal(
    admitReleasedCmsChallenge(
      { ...baseEligibleChallenge, screens: [] },
      now,
    ),
    null,
  )

  // Duplicate screen keys rejection
  assert.equal(
    admitReleasedCmsChallenge(
      {
        ...baseEligibleChallenge,
        screens: [{ id: 'screen-1' }, { id: 'screen-1' }],
      },
      now,
    ),
    null,
  )
})
