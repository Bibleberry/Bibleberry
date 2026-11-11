import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  canCompleteChallenge,
  challengePlayerPosition,
  resolveChallengePlayerCopy,
  resolveScreenIndex,
} from '../../src/components/challenge/challengePlayerModel.ts'
import { resolveCmsScreenIndex } from '../../src/cms/sanity/labState.ts'
import { mapPublishedChallenge } from '../../src/cms/sanity/mapChallenge.ts'
import { validChallengeFixture } from './fixtures.ts'

const syntheticScreens = [{ id: 'screen-a' }, { id: 'screen-b' }, { id: 'screen-c' }]

function fixtureChallenge() {
  const result = mapPublishedChallenge(validChallengeFixture)
  assert.equal(result.ok, true)
  if (!result.ok) throw new Error('fixture invalid')
  return result.challenge
}

test('resolves a stable screen identity to its authored position', () => {
  assert.equal(resolveScreenIndex(syntheticScreens, 'screen-a'), 0)
  assert.equal(resolveScreenIndex(syntheticScreens, 'screen-c'), 2)
})

test('missing, unknown, or removed screen identity falls back to the first screen', () => {
  assert.equal(resolveScreenIndex(syntheticScreens, undefined), 0)
  assert.equal(resolveScreenIndex(syntheticScreens, ''), 0)
  assert.equal(resolveScreenIndex(syntheticScreens, 'screen-removed'), 0)
  // A positional value is not treated as an identity.
  assert.equal(resolveScreenIndex(syntheticScreens, '2'), 0)
})

test('position exposes Back/Continue targets by stable identity', () => {
  const first = challengePlayerPosition(syntheticScreens, undefined)
  assert.deepEqual(first, {
    index: 0, total: 3, screenId: 'screen-a',
    previousScreenId: undefined, nextScreenId: 'screen-b', isFirst: true, isLast: false,
  })

  const middle = challengePlayerPosition(syntheticScreens, 'screen-b')
  assert.equal(middle.previousScreenId, 'screen-a')
  assert.equal(middle.nextScreenId, 'screen-c')
  assert.equal(middle.isFirst, false)
  assert.equal(middle.isLast, false)

  const last = challengePlayerPosition(syntheticScreens, 'screen-c')
  assert.equal(last.previousScreenId, 'screen-b')
  assert.equal(last.nextScreenId, undefined)
  assert.equal(last.isLast, true)
})

test('single-screen and empty Challenges are handled safely', () => {
  const single = challengePlayerPosition([{ id: 'only' }], 'only')
  assert.equal(single.isFirst, true)
  assert.equal(single.isLast, true)
  assert.equal(single.previousScreenId, undefined)
  assert.equal(single.nextScreenId, undefined)

  const empty = challengePlayerPosition([], 'anything')
  assert.equal(empty.total, 0)
  assert.equal(empty.screenId, undefined)
  assert.equal(empty.isLast, false)
  assert.equal(canCompleteChallenge(empty, false), false)
})

test('explicit completion is available only on the final screen and only once', () => {
  assert.equal(canCompleteChallenge(challengePlayerPosition(syntheticScreens, 'screen-a'), false), false)
  assert.equal(canCompleteChallenge(challengePlayerPosition(syntheticScreens, 'screen-b'), false), false)
  assert.equal(canCompleteChallenge(challengePlayerPosition(syntheticScreens, 'screen-c'), false), true)
  // Revisiting a completed Challenge never re-awards completion.
  assert.equal(canCompleteChallenge(challengePlayerPosition(syntheticScreens, 'screen-c'), true), false)
})

test('optional study and reflection blocks are not completion prerequisites', () => {
  const challenge = fixtureChallenge()
  const optionalBlocks = challenge.screens.flatMap(screen => screen.blocks)
    .filter(block => block.type === 'optionalExploration' || block.type === 'reflectionChoice')
  assert.ok(optionalBlocks.length >= 2, 'fixture should include optional study and reflection blocks')
  assert.ok(optionalBlocks.every(block => block.requiredForCompletion === false))

  // Completion depends only on reaching the final screen, never on optional interaction.
  const lastScreenId = challenge.screens[challenge.screens.length - 1].id
  assert.equal(canCompleteChallenge(challengePlayerPosition(challenge.screens, lastScreenId), false), true)
})

test('CMS Lab resolveCmsScreenIndex keeps its existing behavior through the shared rule', () => {
  const challenge = fixtureChallenge()
  for (const candidate of [undefined, '', 'missing-screen', ...challenge.screens.map(screen => screen.id)]) {
    assert.equal(resolveCmsScreenIndex(challenge, candidate), resolveScreenIndex(challenge.screens, candidate))
  }
  assert.equal(resolveCmsScreenIndex(challenge, challenge.screens[1].id), 1)
  assert.equal(resolveCmsScreenIndex(challenge, 'missing-screen'), 0)
})

test('resolveChallengePlayerCopy uses Finish for ordinary reader and preserves Complete Challenge for Lab diagnostics', () => {
  const ordinary = resolveChallengePlayerCopy({ diagnostics: false, returnOnFinish: true })
  assert.equal(ordinary.finishButton, 'Finish')
  assert.equal(ordinary.completedButton, 'Finish')

  const ordinaryPilot = resolveChallengePlayerCopy({ diagnostics: false, returnOnFinish: false })
  assert.equal(ordinaryPilot.finishButton, 'Finish')
  assert.equal(ordinaryPilot.completedButton, 'Challenge complete')

  const lab = resolveChallengePlayerCopy({ diagnostics: true })
  assert.equal(lab.finishButton, 'Complete Challenge')
  assert.equal(lab.completedButton, 'Challenge complete')
})
