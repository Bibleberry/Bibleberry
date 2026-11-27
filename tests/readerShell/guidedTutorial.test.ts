import assert from 'node:assert/strict'
import test from 'node:test'
import {
  computeSpotlightGeometry,
  formatTutorialStepAnnouncement,
  formatTutorialStepProgress,
  GUIDED_TUTORIAL_STEPS,
  nextTutorialTab,
  previousTutorialTab,
  stepForTab,
  stepIndexForTab,
} from '../../src/readerShell/tutorial/guidedTutorialModel.ts'
import {
  createNavigationState,
  globalNavigation,
  navigationReducer,
  READER_TABS,
} from '../../src/readerShell/navigation/navigationModel.ts'

test('GUIDED_TUTORIAL_STEPS covers all four R06 destinations in exact order with factual non-promotional copy', () => {
  assert.deepEqual(
    GUIDED_TUTORIAL_STEPS.map(step => step.tab),
    [...READER_TABS],
  )

  for (const step of GUIDED_TUTORIAL_STEPS) {
    assert.ok(step.targetId.startsWith('tab-'))
    assert.ok(step.destinationLabel.length > 0)
    assert.ok(step.heading.length > 0)
    assert.ok(step.summary.length > 0)
    assert.ok(step.controlsSummary.length > 0)
    assert.ok(step.nonvisualGuidance.length > 0)

    const combined = `${step.heading} ${step.summary} ${step.controlsSummary} ${step.nonvisualGuidance}`
    assert.doesNotMatch(combined, /\bMy Journey\b/i)
    assert.doesNotMatch(combined, /\bArchive\b/i)
    assert.doesNotMatch(combined, /\bPodcasts\b/i)
    assert.doesNotMatch(combined, /\bsign up|create an account|earn a card|reward\b/i)
  }
})

test('step navigation helpers traverse all four destinations cleanly', () => {
  assert.equal(stepIndexForTab('today'), 0)
  assert.equal(stepIndexForTab('library'), 1)
  assert.equal(stepIndexForTab('collections'), 2)
  assert.equal(stepIndexForTab('more'), 3)

  assert.equal(previousTutorialTab('today'), null)
  assert.equal(nextTutorialTab('today'), 'library')
  assert.equal(previousTutorialTab('library'), 'today')
  assert.equal(nextTutorialTab('library'), 'collections')
  assert.equal(previousTutorialTab('collections'), 'library')
  assert.equal(nextTutorialTab('collections'), 'more')
  assert.equal(previousTutorialTab('more'), 'collections')
  assert.equal(nextTutorialTab('more'), null)

  assert.equal(formatTutorialStepProgress('today'), 'Step 1 of 4')
  assert.equal(formatTutorialStepProgress('more'), 'Step 4 of 4')
  assert.equal(stepForTab('collections').targetId, 'tab-collections')
})

test('formatTutorialStepAnnouncement distinguishes visual, missing-target, and text-guide modes', () => {
  const step = stepForTab('library')
  const normal = formatTutorialStepAnnouncement(step, 1, 4, {
    targetAvailable: true,
    textGuideMode: false,
  })
  assert.match(normal, /^App Tutorial step 2 of 4: Library\./)
  assert.doesNotMatch(normal, /Visual highlight unavailable/)

  const missing = formatTutorialStepAnnouncement(step, 1, 4, {
    targetAvailable: false,
    textGuideMode: false,
  })
  assert.match(missing, /Visual highlight unavailable in this view; text guidance shown\./)

  const textGuide = formatTutorialStepAnnouncement(step, 1, 4, {
    targetAvailable: false,
    textGuideMode: true,
  })
  assert.match(textGuide, /Text guide active\./)
})

test('computeSpotlightGeometry handles valid, clamped, missing, degenerate, and off-screen targets safely', () => {
  const viewport = { width: 320, height: 640 }

  assert.deepEqual(computeSpotlightGeometry(null, viewport), { available: false })
  assert.deepEqual(
    computeSpotlightGeometry({ top: 10, left: 10, right: 10, bottom: 50, width: 0, height: 40 }, viewport),
    { available: false },
  )
  assert.deepEqual(
    computeSpotlightGeometry({ top: 10, left: 10, right: 50, bottom: 10, width: 40, height: 0 }, viewport),
    { available: false },
  )
  assert.deepEqual(
    computeSpotlightGeometry({ top: Number.NaN, left: 0, right: 80, bottom: 44, width: 80, height: 44 }, viewport),
    { available: false },
  )
  assert.deepEqual(
    computeSpotlightGeometry({ top: 700, left: 10, right: 90, bottom: 744, width: 80, height: 44 }, viewport),
    { available: false },
  )
  assert.deepEqual(
    computeSpotlightGeometry({ top: 10, left: -100, right: -10, bottom: 54, width: 90, height: 44 }, viewport),
    { available: false },
  )

  // Normal rect with 4px padding
  assert.deepEqual(
    computeSpotlightGeometry({ top: 580, left: 80, right: 160, bottom: 624, width: 80, height: 44 }, viewport, 4),
    { available: true, top: 576, left: 76, width: 88, height: 52 },
  )

  // Edge rect clamped inside viewport bounds (never overflows 320px width)
  assert.deepEqual(
    computeSpotlightGeometry({ top: 596, left: 2, right: 318, bottom: 640, width: 316, height: 44 }, viewport, 4),
    { available: true, top: 592, left: 0, width: 320, height: 48 },
  )
})

test('opening Guided App Tutorial from More starts at Today and returns to More without altering activeTab', () => {
  const more = navigationReducer(createNavigationState(), { type: 'selectTab', tab: 'more' })
  const tutorial = navigationReducer(more, { type: 'openTutorial' })

  assert.equal(tutorial.activeTab, 'more')
  assert.equal(globalNavigation(tutorial), 'guided')
  assert.deepEqual(tutorial.focused, { kind: 'tutorial', shownTab: 'today' })

  const step2 = navigationReducer(tutorial, { type: 'showTutorialTab', tab: 'library' })
  assert.equal(step2.activeTab, 'more')
  assert.deepEqual(step2.focused, { kind: 'tutorial', shownTab: 'library' })

  const closed = navigationReducer(step2, { type: 'closeGuidance' })
  assert.deepEqual(closed, more)
})
