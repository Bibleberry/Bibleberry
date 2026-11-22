import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { CmsScripture } from '../../src/cms/sanity/types.ts'
import {
  canCompleteChallenge,
  canStartChallengeFromBeginning,
  challengePlayerPosition,
  formatChallengeScreenPosition,
  resolveChallengePlayerCopy,
  resolveFirstScreenId,
  type ChallengePlayerChallenge,
} from '../../src/components/challenge/challengePlayerModel.ts'
import {
  completeOrdinaryChallenge,
  emptyOrdinaryChallengeSessionState,
  restartOrdinaryChallengeFromBeginning,
  setOrdinaryChallengeScreen,
  toggleOrdinaryChallengeSaved,
  toggleOrdinaryScriptureSaved,
} from '../../src/components/challenge/ordinaryChallengeHostModel.ts'

const sampleScripture: CmsScripture = {
  id: 'rl-scripture-1',
  reference: 'Psalm 119:105',
  translation: 'WEBP',
  textStatus: 'referenceOnly',
  practiceStatus: 'notConfigured',
  usageRightsConfirmed: false,
}

const threeScreenChallenge: ChallengePlayerChallenge = {
  title: 'River Lantern Unit Sample',
  summary: 'Synthetic three-screen Challenge for reader-control model verification.',
  primaryScripture: sampleScripture,
  screens: [
    { id: 'rl-s1', stepLabel: 'Screen 1', title: 'Opening', blocks: [] },
    { id: 'rl-s2', stepLabel: 'Screen 2', title: 'Middle', blocks: [] },
    { id: 'rl-s3', stepLabel: 'Screen 3', title: 'Closing', blocks: [] },
  ],
  companionLinks: [],
}

test('ordinary reader copy uses Previous, Next, Finish, Start from Beginning, Read Again, and Screen n of N while diagnostics retains Lab copy', () => {
  const ordinary = resolveChallengePlayerCopy({ diagnostics: false, returnOnFinish: true })
  assert.equal(ordinary.previousButton, 'Previous')
  assert.equal(ordinary.nextButton, 'Next')
  assert.equal(ordinary.finishButton, 'Finish')
  assert.equal(ordinary.completedButton, 'Finish')
  assert.equal(ordinary.startFromBeginningButton, 'Start from Beginning')
  assert.equal(ordinary.readAgainButton, 'Read Again')
  assert.equal(ordinary.progressHeading, 'Challenge screens')

  const ordinaryPilot = resolveChallengePlayerCopy({ diagnostics: false, returnOnFinish: false })
  assert.equal(ordinaryPilot.previousButton, 'Previous')
  assert.equal(ordinaryPilot.nextButton, 'Next')
  assert.equal(ordinaryPilot.finishButton, 'Finish')
  assert.equal(ordinaryPilot.completedButton, 'Challenge complete')

  const lab = resolveChallengePlayerCopy({ diagnostics: true })
  assert.equal(lab.previousButton, 'Back')
  assert.equal(lab.nextButton, 'Continue')
  assert.equal(lab.finishButton, 'Complete Challenge')
  assert.equal(lab.completedButton, 'Challenge complete')
  assert.equal(lab.progressHeading, 'Required screens')

  const pos1 = challengePlayerPosition(threeScreenChallenge.screens, 'rl-s1')
  const pos2 = challengePlayerPosition(threeScreenChallenge.screens, 'rl-s2')
  const pos3 = challengePlayerPosition(threeScreenChallenge.screens, 'rl-s3')
  const empty = challengePlayerPosition([], undefined)

  assert.equal(formatChallengeScreenPosition(pos1), 'Screen 1 of 3')
  assert.equal(formatChallengeScreenPosition(pos2), 'Screen 2 of 3')
  assert.equal(formatChallengeScreenPosition(pos3), 'Screen 3 of 3')
  assert.equal(formatChallengeScreenPosition(pos2, { diagnostics: true }), '2 of 3')
  assert.equal(formatChallengeScreenPosition(empty), 'Screen 0 of 0')
  assert.equal(formatChallengeScreenPosition(empty, { diagnostics: true }), '0 of 0')
})

test('Start from Beginning eligibility and first-screen resolution respect stable screen identity', () => {
  assert.equal(resolveFirstScreenId(threeScreenChallenge.screens), 'rl-s1')
  assert.equal(resolveFirstScreenId([]), undefined)

  assert.equal(canStartChallengeFromBeginning(challengePlayerPosition(threeScreenChallenge.screens, undefined)), false)
  assert.equal(canStartChallengeFromBeginning(challengePlayerPosition(threeScreenChallenge.screens, 'rl-s1')), false)
  assert.equal(canStartChallengeFromBeginning(challengePlayerPosition(threeScreenChallenge.screens, 'rl-s2')), true)
  assert.equal(canStartChallengeFromBeginning(challengePlayerPosition(threeScreenChallenge.screens, 'rl-s3')), true)
  // Removed/unknown screen identity safely clamps to Screen 1, so restart is not needed
  assert.equal(canStartChallengeFromBeginning(challengePlayerPosition(threeScreenChallenge.screens, 'deleted-id')), false)
  // Single-screen and empty Challenges never enable Start from Beginning
  assert.equal(canStartChallengeFromBeginning(challengePlayerPosition([{ id: 'only' }], 'only')), false)
  assert.equal(canStartChallengeFromBeginning(challengePlayerPosition([], undefined)), false)
})

test('ordinary host Start from Beginning resets only reading position for both unfinished and completed Challenges', () => {
  let state = emptyOrdinaryChallengeSessionState()
  state = toggleOrdinaryChallengeSaved(state)
  state = toggleOrdinaryScriptureSaved(state, sampleScripture)
  state = setOrdinaryChallengeScreen(threeScreenChallenge, state, 'rl-s3')

  assert.equal(state.screenId, 'rl-s3')
  assert.equal(state.isInProgress, true)
  assert.equal(state.isCompleted, false)
  assert.equal(state.isSaved, true)
  assert.equal(state.savedScriptures.length, 1)

  // Unfinished restart moves to first screen and preserves saved Challenge, saved Scripture, and unfinished state
  const restartedUnfinished = restartOrdinaryChallengeFromBeginning(threeScreenChallenge, state)
  assert.equal(restartedUnfinished.screenId, 'rl-s1')
  assert.equal(restartedUnfinished.isInProgress, true)
  assert.equal(restartedUnfinished.isCompleted, false)
  assert.equal(restartedUnfinished.isSaved, true)
  assert.equal(restartedUnfinished.savedScriptures.length, 1)
  // Referential no-op when already at first screen
  assert.equal(restartOrdinaryChallengeFromBeginning(threeScreenChallenge, restartedUnfinished), restartedUnfinished)

  // Explicit completion requires reaching final screen
  assert.equal(canCompleteChallenge(challengePlayerPosition(threeScreenChallenge.screens, restartedUnfinished.screenId), false), false)
  const atFinal = setOrdinaryChallengeScreen(threeScreenChallenge, restartedUnfinished, 'rl-s3')
  const completed = completeOrdinaryChallenge(threeScreenChallenge, atFinal)
  assert.equal(completed.isCompleted, true)
  assert.equal(completed.isInProgress, false)

  // Completed Read Again / Start from Beginning returns to Screen 1 without revoking completion or re-entering inProgress
  const rereadAtStart = restartOrdinaryChallengeFromBeginning(threeScreenChallenge, completed)
  assert.equal(rereadAtStart.screenId, 'rl-s1')
  assert.equal(rereadAtStart.isCompleted, true)
  assert.equal(rereadAtStart.isInProgress, false)
  assert.equal(rereadAtStart.isSaved, true)
  assert.equal(rereadAtStart.savedScriptures.length, 1)

  // Stepping through screens while completed never revokes completion or flips isInProgress back to true
  const rereadMiddle = setOrdinaryChallengeScreen(threeScreenChallenge, rereadAtStart, 'rl-s2')
  assert.equal(rereadMiddle.screenId, 'rl-s2')
  assert.equal(rereadMiddle.isCompleted, true)
  assert.equal(rereadMiddle.isInProgress, false)

  // Restarting mid-reread returns to Screen 1 and preserves completion
  const rereadRestarted = restartOrdinaryChallengeFromBeginning(threeScreenChallenge, rereadMiddle)
  assert.equal(rereadRestarted.screenId, 'rl-s1')
  assert.equal(rereadRestarted.isCompleted, true)
  assert.equal(rereadRestarted.isInProgress, false)
})
