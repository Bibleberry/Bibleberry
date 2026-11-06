import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { CmsScripture } from '../../src/cms/sanity/types.ts'
import {
  resolveChallengePlayerCopy,
  resolveScripturePanelCopy,
  type ChallengePlayerChallenge,
} from '../../src/components/challenge/challengePlayerModel.ts'
import {
  completeOrdinaryChallenge,
  emptyOrdinaryChallengeSessionState,
  isOrdinaryScriptureSaved,
  ordinaryScriptureKey,
  setOrdinaryChallengeScreen,
  toggleOrdinaryChallengeSaved,
  toggleOrdinaryScriptureSaved,
} from '../../src/components/challenge/ordinaryChallengeHostModel.ts'

const primaryScripture: CmsScripture = {
  id: 'scripture-primary',
  reference: 'Psalm 23:1',
  translation: 'WEBP',
  textStatus: 'referenceOnly',
  practiceStatus: 'notConfigured',
  usageRightsConfirmed: false,
}

const providedScripture: CmsScripture = {
  id: 'scripture-provided',
  reference: 'Colossians 3:16–17',
  translation: 'WEBP',
  passage: 'Synthetic rights-confirmed passage that must not enter saved metadata.',
  textStatus: 'provided',
  practiceStatus: 'configured',
  usageRightsConfirmed: true,
}

const sampleChallenge: ChallengePlayerChallenge = {
  title: 'Synthetic Host Model Challenge',
  summary: 'Unit-test fixture for ordinary-shell host state.',
  primaryScripture,
  screens: [
    {
      id: 'screen-one',
      stepLabel: 'Screen 1',
      title: 'First screen',
      blocks: [
        {
          id: 'block-statement',
          type: 'statement',
          requiredForCompletion: true,
          label: 'Note',
          text: 'Screen one statement.',
        },
      ],
    },
    {
      id: 'screen-two',
      stepLabel: 'Screen 2',
      title: 'Final screen',
      blocks: [
        {
          id: 'block-scripture',
          type: 'scripture',
          requiredForCompletion: true,
          scripture: providedScripture,
        },
      ],
    },
  ],
  companionLinks: [],
}

test('keeps Challenge save, Scripture save, position, and explicit completion independent', () => {
  let state = emptyOrdinaryChallengeSessionState()
  assert.deepEqual(state, {
    screenId: undefined,
    isSaved: false,
    isCompleted: false,
    savedScriptures: [],
  })

  // Completion is rejected on non-final screens
  assert.equal(completeOrdinaryChallenge(sampleChallenge, state), state)

  // Saving Challenge does not mark completion or alter Scripture saves
  state = toggleOrdinaryChallengeSaved(state)
  assert.equal(state.isSaved, true)
  assert.equal(state.isCompleted, false)
  assert.equal(state.savedScriptures.length, 0)

  // Saving provided Scripture retains reference metadata only and normalizes dashes/case
  state = toggleOrdinaryScriptureSaved(state, providedScripture)
  assert.equal(state.savedScriptures.length, 1)
  assert.deepEqual(state.savedScriptures[0], {
    key: 'colossians 3:16-17|webp',
    scriptureId: 'scripture-provided',
    reference: 'Colossians 3:16–17',
    translation: 'WEBP',
  })
  assert.equal('passage' in state.savedScriptures[0], false)
  assert.equal(
    isOrdinaryScriptureSaved(state.savedScriptures, {
      reference: '  colossians 3:16 - 17 ',
      translation: 'webp',
    }),
    true,
  )
  assert.equal(ordinaryScriptureKey({ reference: 'Psalm 23:1', translation: 'WEBP' }), 'psalm 23:1|webp')

  // Invalid screen IDs are ignored; valid stable screen IDs are recorded
  assert.equal(setOrdinaryChallengeScreen(sampleChallenge, state, 'missing-screen'), state)
  state = setOrdinaryChallengeScreen(sampleChallenge, state, 'screen-two')
  assert.equal(state.screenId, 'screen-two')
  assert.equal(state.isCompleted, false)

  // Explicit completion succeeds on the final screen and is idempotent
  const completed = completeOrdinaryChallenge(sampleChallenge, state)
  assert.equal(completed.isCompleted, true)
  assert.equal(completeOrdinaryChallenge(sampleChallenge, completed), completed)

  // Removing saved Scripture and saved Challenge leaves completion intact
  const unsaved = toggleOrdinaryChallengeSaved(toggleOrdinaryScriptureSaved(completed, providedScripture))
  assert.equal(unsaved.isSaved, false)
  assert.equal(unsaved.savedScriptures.length, 0)
  assert.equal(unsaved.isCompleted, true)
})

test('suppresses CMS/Sanity diagnostics and unavailable-practice notices in ordinary reader while preserving Lab and preview copy', () => {
  const unconfiguredRef: CmsScripture = {
    id: 'unconfigured-ref',
    reference: 'Psalm 23:1',
    translation: 'Not configured',
    textStatus: 'referenceOnly',
    practiceStatus: 'notConfigured',
    usageRightsConfirmed: false,
  }

  // Ordinary reader copy (default: diagnostics = false, preview = false)
  const readerPlayerCopy = resolveChallengePlayerCopy()
  assert.equal(readerPlayerCopy.progressHeading, 'Challenge screens')
  assert.equal(readerPlayerCopy.progressAriaLabel, 'Challenge screen position')
  assert.equal(readerPlayerCopy.scriptureCollection, 'My Scripture')
  assert.match(readerPlayerCopy.completionMessage, /You completed this Challenge\./)
  assert.doesNotMatch(readerPlayerCopy.completionMessage, /required screens/i)
  assert.doesNotMatch(readerPlayerCopy.navigationNote, /required progress/i)

  const readerUnconfiguredCopy = resolveScripturePanelCopy(unconfiguredRef, { primary: true })
  assert.equal(readerUnconfiguredCopy.sectionLabel, 'Primary Scripture')
  assert.equal(readerUnconfiguredCopy.referenceOnlyNote, 'Reference only · Passage text not included')
  assert.equal(readerUnconfiguredCopy.practiceNote, null)

  const readerConfiguredPracticeCopy = resolveScripturePanelCopy(providedScripture)
  assert.equal(readerConfiguredPracticeCopy.sectionLabel, 'Scripture focus · WEBP')
  assert.equal(readerConfiguredPracticeCopy.citationLabel, 'Colossians 3:16–17 · WEBP')
  assert.equal(readerConfiguredPracticeCopy.practiceNote, null)

  // Developer Studio CMS Lab copy (diagnostics = true)
  const labPlayerCopy = resolveChallengePlayerCopy({
    diagnostics: true,
    labels: {
      scriptureCollection: 'CMS My Scripture',
      progressHeading: 'Required screens',
      progress: 'CMS required Challenge screen position',
      navigation: 'CMS Challenge screen navigation',
    },
  })
  assert.equal(labPlayerCopy.progressHeading, 'Required screens')
  assert.equal(labPlayerCopy.progressAriaLabel, 'CMS required Challenge screen position')
  assert.match(labPlayerCopy.completionMessage, /You explicitly completed the required screens\./)

  const labUnconfiguredCopy = resolveScripturePanelCopy(unconfiguredRef, { primary: true, diagnostics: true })
  assert.equal(labUnconfiguredCopy.sectionLabel, 'Primary Scripture · Not configured')
  assert.equal(labUnconfiguredCopy.referenceOnlyNote, 'Reference only · No passage text supplied · Translation not configured')
  assert.equal(labUnconfiguredCopy.practiceNote, 'Memorization practice not configured')

  const labConfiguredCopy = resolveScripturePanelCopy(providedScripture, { diagnostics: true })
  assert.equal(
    labConfiguredCopy.practiceNote,
    'Practice configured in Sanity · CMS memorization practice is not available in this view',
  )

  // BerryMark Local Preview copy (preview = true)
  const previewConfiguredCopy = resolveScripturePanelCopy(providedScripture, { preview: true })
  assert.equal(
    previewConfiguredCopy.practiceNote,
    'Practice configured in the local file · CMS memorization practice is not available in this view',
  )
})
