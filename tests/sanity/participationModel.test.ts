import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  admitPilotSampleChallenge,
  admitTrustedCatalogChallenge,
  isAdmittedChallenge,
} from '../../src/participation/admission.ts'
import {
  createSavedScriptureKey,
  formatLocalCalendarDate,
  normalizeSavedScriptureInput,
  normalizeScriptureTranslation,
  parseLocalCalendarDate,
  parseStoredChallengeId,
} from '../../src/participation/identity.ts'
import {
  distinctCompletedChallengeCount,
  emptyReaderParticipationData,
  isParticipationScriptureSaved,
  reconcileChallengeAliases,
  reduceParticipationCommand,
  selectChallengeParticipationView,
} from '../../src/participation/model.ts'

test('enforces canonical Challenge ID grammar, draft/fixture rejection, and cms vs pilot namespace isolation', () => {
  // Valid production CMS base document IDs (BerryMark deterministic and Studio-authored)
  assert.equal(
    parseStoredChallengeId('cms:berrymark-challenge-2026-11-03-pray-continually'),
    'cms:berrymark-challenge-2026-11-03-pray-continually',
  )
  assert.equal(
    parseStoredChallengeId('cms:2026-11-02-rejoice-always'),
    'cms:2026-11-02-rejoice-always',
  )
  assert.equal(
    parseStoredChallengeId('cms:f47ac10b-58cc-4372-a567-0e02b2c3d479'),
    'cms:f47ac10b-58cc-4372-a567-0e02b2c3d479',
  )

  // Reject drafts, Lab keys, fixtures, synthetic pilot keys, legacy prototype IDs, whitespace, and overlong keys
  const rejectedInProduction = [
    '',
    '2026-11-02-rejoice-always',
    'drafts.2026-11-02-rejoice-always',
    'cms:drafts.2026-11-02-rejoice-always',
    'cms:drafts.berrymark-challenge-2026-11-02-rejoice-always',
    'sanity-live:2026-11-02-rejoice-always',
    'sanity-fixture:fixture-challenge-document',
    'cms:fixture-challenge-document',
    'cms:fixture-sample',
    'cms:pilot-synthetic-ordinary-shell-a2',
    'cms:pilot-persistence-sample',
    'cms:weekly-pilot-2026-11-02',
    'cms:weekly-rhythm-pilot-2026',
    'cms:nov-1',
    'cms:nov-2',
    'pilot:a3-persistence-sample',
    ' cms:2026-11-02-rejoice-always',
    'cms:2026-11-02-rejoice-always ',
    'cms:invalid space',
    `cms:${'a'.repeat(129)}`,
  ]
  for (const invalid of rejectedInProduction) {
    assert.equal(
      parseStoredChallengeId(invalid, 'cms'),
      null,
      `Expected production cms parser to reject "${invalid}"`,
    )
  }

  // Isolated pilot store accepts only `pilot:` namespace and rejects `cms:` or `drafts.*`
  assert.equal(parseStoredChallengeId('pilot:a3-persistence-sample', 'pilot'), 'pilot:a3-persistence-sample')
  assert.equal(parseStoredChallengeId('cms:2026-11-02-rejoice-always', 'pilot'), null)
  assert.equal(parseStoredChallengeId('pilot:drafts.a3-persistence-sample', 'pilot'), null)
})

test('validates calendar dates strictly without UTC-shift distortion', () => {
  assert.equal(parseLocalCalendarDate('2026-11-06'), '2026-11-06')
  assert.equal(parseLocalCalendarDate('2024-02-29'), '2024-02-29')
  assert.equal(parseLocalCalendarDate('2026-02-29'), null)
  assert.equal(parseLocalCalendarDate('2026-13-01'), null)
  assert.equal(parseLocalCalendarDate('2026-11-06T20:00:00Z'), null)
  assert.equal(parseLocalCalendarDate('11/06/2026'), null)

  const localSample = new Date(2026, 10, 6, 23, 30, 0)
  assert.equal(formatLocalCalendarDate(localSample), '2026-11-06')
})

test('enforces unforgeable trusted catalog admission capability and namespace separation', () => {
  const admitted = admitTrustedCatalogChallenge({
    documentId: 'berrymark-challenge-2026-11-03-pray-continually',
    screens: [{ id: 's1' }, { id: 's2' }],
    editorial: { adaptationReviewed: true, reviewedAt: '2026-11-03T12:00:00Z' },
  })
  assert.ok(admitted)
  assert.equal(admitted.challengeId, 'cms:berrymark-challenge-2026-11-03-pray-continually')
  assert.equal(isAdmittedChallenge(admitted, 'cms'), true)
  assert.equal(isAdmittedChallenge(admitted, 'pilot'), false)

  // Caller-constructed plain object with matching properties cannot forge admission
  const forged = {
    namespace: 'cms',
    challengeId: 'cms:berrymark-challenge-2026-11-03-pray-continually',
    screens: [{ id: 's1' }],
    previousChallengeIds: [],
  }
  assert.equal(isAdmittedChallenge(forged), false)
  assert.equal(isAdmittedChallenge(forged, 'cms'), false)

  // Drafts, fixtures, pilot IDs, unreviewed documents, empty screens, and duplicate screen keys are rejected
  assert.equal(
    admitTrustedCatalogChallenge({
      documentId: 'drafts.berrymark-challenge-2026-11-03-pray-continually',
      screens: [{ id: 's1' }],
      editorial: { adaptationReviewed: true, reviewedAt: '2026-11-03T12:00:00Z' },
    }),
    null,
  )
  assert.equal(
    admitTrustedCatalogChallenge({
      documentId: 'fixture-challenge-document',
      screens: [{ id: 's1' }],
      editorial: { adaptationReviewed: true, reviewedAt: '2026-11-03T12:00:00Z' },
    }),
    null,
  )
  assert.equal(
    admitTrustedCatalogChallenge({
      documentId: 'pilot-persistence-sample',
      screens: [{ id: 's1' }],
      editorial: { adaptationReviewed: true, reviewedAt: '2026-11-03T12:00:00Z' },
    }),
    null,
  )
  assert.equal(
    admitTrustedCatalogChallenge({
      documentId: 'berrymark-challenge-2026-11-03-pray-continually',
      screens: [],
      editorial: { adaptationReviewed: true, reviewedAt: '2026-11-03T12:00:00Z' },
    }),
    null,
  )
  assert.equal(
    admitTrustedCatalogChallenge({
      documentId: 'berrymark-challenge-2026-11-03-pray-continually',
      screens: [{ id: 's1' }, { id: 's1' }],
      editorial: { adaptationReviewed: true, reviewedAt: '2026-11-03T12:00:00Z' },
    }),
    null,
  )

  // Pilot sample admission produces a `pilot:` token rejected by production `cms` checks
  const pilotAdmitted = admitPilotSampleChallenge({
    sampleId: 'a3-persistence-sample',
    screens: [{ id: 'p1' }, { id: 'p2' }],
  })
  assert.ok(pilotAdmitted)
  assert.equal(pilotAdmitted.challengeId, 'pilot:a3-persistence-sample')
  assert.equal(isAdmittedChallenge(pilotAdmitted, 'pilot'), true)
  assert.equal(isAdmittedChallenge(pilotAdmitted, 'cms'), false)
})

test('preserves separate open, in-progress (including Back to Screen 1 and 1-screen Challenges), save, complete, and reread semantics with referential no-ops', () => {
  const cMulti = parseStoredChallengeId('cms:berrymark-challenge-2026-11-02-rejoice-always')!
  const cSingle = parseStoredChallengeId('cms:berrymark-challenge-2026-11-04-single-screen')!
  const day1 = parseLocalCalendarDate('2026-11-06')!
  const day2 = parseLocalCalendarDate('2026-11-08')!

  let state = emptyReaderParticipationData()
  assert.equal(distinctCompletedChallengeCount(state), 0)

  // 1. Opening records only the single-slot pointer; does not mark in-progress or completed
  state = reduceParticipationCommand(state, {
    type: 'recordChallengeOpened',
    challengeId: cMulti,
    openedOn: day1,
  })
  assert.deepEqual(state.lastOpenedChallenge, { challengeId: cMulti, openedOn: day1 })
  assert.deepEqual(selectChallengeParticipationView(state, cMulti), {
    challengeId: cMulti,
    status: 'notStarted',
    isCompleted: false,
    isInProgress: false,
    isSaved: false,
    isLastOpened: true,
  })

  // Repeat identical open is a strict referential no-op
  const repeatOpen = reduceParticipationCommand(state, {
    type: 'recordChallengeOpened',
    challengeId: cMulti,
    openedOn: day1,
  })
  assert.equal(repeatOpen, state)

  // 2. Advancing to Screen 2 marks inProgress; navigating Back to Screen 1 RETAINS inProgress
  state = reduceParticipationCommand(state, {
    type: 'saveChallengeProgress',
    challengeId: cMulti,
    screenId: 'b2',
    updatedOn: day1,
  })
  assert.equal(selectChallengeParticipationView(state, cMulti).status, 'inProgress')
  assert.equal(selectChallengeParticipationView(state, cMulti).resumeScreenId, 'b2')

  state = reduceParticipationCommand(state, {
    type: 'saveChallengeProgress',
    challengeId: cMulti,
    screenId: 'b1',
    updatedOn: day1,
  })
  const backAtFirstScreen = selectChallengeParticipationView(state, cMulti)
  assert.equal(backAtFirstScreen.status, 'inProgress')
  assert.equal(backAtFirstScreen.isInProgress, true)
  assert.equal(backAtFirstScreen.resumeScreenId, 'b1')

  // 3. Single-screen or non-screened Challenge can also be started/inProgress before completion
  state = reduceParticipationCommand(state, {
    type: 'saveChallengeProgress',
    challengeId: cSingle,
    screenId: 'only-screen',
    updatedOn: day1,
  })
  assert.equal(selectChallengeParticipationView(state, cSingle).status, 'inProgress')
  assert.equal(selectChallengeParticipationView(state, cSingle).resumeScreenId, 'only-screen')

  // 4. Saving Challenge is orthogonal to completion and progress
  state = reduceParticipationCommand(state, {
    type: 'setChallengeSaved',
    challengeId: cMulti,
    saved: true,
    savedOn: day1,
  })
  assert.equal(selectChallengeParticipationView(state, cMulti).isSaved, true)
  assert.equal(selectChallengeParticipationView(state, cMulti).isCompleted, false)

  // Duplicate save preserves original savedOn and returns exact reference
  const duplicateSave = reduceParticipationCommand(state, {
    type: 'setChallengeSaved',
    challengeId: cMulti,
    saved: true,
    savedOn: day2,
  })
  assert.equal(duplicateSave, state)
  assert.equal(state.savedChallenges[cMulti].savedOn, day1)

  // 5. Explicit completion records immutable completedOn, clears inProgress, and increments distinct count once
  state = reduceParticipationCommand(state, {
    type: 'completeChallenge',
    challengeId: cMulti,
    completedOn: day1,
  })
  assert.equal(distinctCompletedChallengeCount(state), 1)
  assert.equal(state.completedChallenges[cMulti].completedOn, day1)
  assert.equal(cMulti in state.inProgressChallenges, false)
  assert.equal(selectChallengeParticipationView(state, cMulti).status, 'completed')

  // 6. Repeat completion on a later date is a strict referential no-op; count and completedOn never change
  const repeatComplete = reduceParticipationCommand(state, {
    type: 'completeChallenge',
    challengeId: cMulti,
    completedOn: day2,
  })
  assert.equal(repeatComplete, state)
  assert.equal(distinctCompletedChallengeCount(repeatComplete), 1)
  assert.equal(repeatComplete.completedChallenges[cMulti].completedOn, day1)

  // 7. Rereading a completed Challenge never re-adds durable inProgressChallenges
  const afterRereadStep = reduceParticipationCommand(state, {
    type: 'saveChallengeProgress',
    challengeId: cMulti,
    screenId: 'b4',
    updatedOn: day2,
  })
  assert.equal(afterRereadStep, state)
  assert.equal(cMulti in afterRereadStep.inProgressChallenges, false)

  // 8. Unsaving a completed Challenge leaves completion intact
  state = reduceParticipationCommand(state, {
    type: 'setChallengeSaved',
    challengeId: cMulti,
    saved: false,
    savedOn: day2,
  })
  assert.equal(selectChallengeParticipationView(state, cMulti).isSaved, false)
  assert.equal(selectChallengeParticipationView(state, cMulti).isCompleted, true)
  assert.equal(distinctCompletedChallengeCount(state), 1)
})

test('normalizes Saved Scripture references/translations, strips Not configured, never stores passage text, and deduplicates across Challenges', () => {
  const c1 = parseStoredChallengeId('cms:berrymark-challenge-2026-11-02-rejoice-always')!
  const c2 = parseStoredChallengeId('cms:berrymark-challenge-2026-11-03-pray-continually')!
  const day1 = parseLocalCalendarDate('2026-11-06')!
  const day2 = parseLocalCalendarDate('2026-11-07')!

  assert.equal(normalizeScriptureTranslation('Not configured'), null)
  assert.equal(normalizeScriptureTranslation('  not configured '), null)
  assert.equal(normalizeScriptureTranslation(''), null)
  assert.equal(normalizeScriptureTranslation(' WEBP '), 'WEBP')

  assert.equal(
    createSavedScriptureKey({ reference: '1 Thessalonians 5:16–18', translation: 'WEBP' }),
    createSavedScriptureKey({ reference: '  1 thessalonians 5 : 16 - 18 ', translation: 'webp' }),
  )
  assert.equal(
    createSavedScriptureKey({ reference: 'John 11:33–35', translation: 'Not configured' }),
    'john 11:33-35|',
  )

  // Even if caller passes an object carrying `passage`, normalized input and stored record never retain it
  const smuggledInput = {
    reference: '1 Thessalonians 5:16–18',
    translation: 'WEBP',
    sourceChallengeId: c1,
    passage: 'Rejoice always, pray continually, give thanks in all circumstances.',
  }
  const normalized = normalizeSavedScriptureInput(smuggledInput)
  assert.ok(normalized)
  assert.equal('passage' in normalized, false)

  let state = emptyReaderParticipationData()
  state = reduceParticipationCommand(state, {
    type: 'setScriptureSaved',
    scripture: smuggledInput,
    saved: true,
    savedOn: day1,
  })
  state = reduceParticipationCommand(state, {
    type: 'setScriptureSaved',
    scripture: { reference: 'John 11:33–35', translation: 'Not configured', sourceChallengeId: c1 },
    saved: true,
    savedOn: day1,
  })

  assert.equal(state.savedScriptures.length, 2)
  assert.deepEqual(state.savedScriptures[0], {
    key: '1 thessalonians 5:16-18|webp',
    reference: '1 Thessalonians 5:16–18',
    translation: 'WEBP',
    savedOn: day1,
    sourceChallengeId: c1,
  })
  assert.equal('passage' in state.savedScriptures[0], false)
  assert.deepEqual(state.savedScriptures[1], {
    key: 'john 11:33-35|',
    reference: 'John 11:33–35',
    translation: null,
    savedOn: day1,
    sourceChallengeId: c1,
  })

  // Saving the same passage with typographic variation from another Challenge is a referential no-op
  const duplicateScriptureSave = reduceParticipationCommand(state, {
    type: 'setScriptureSaved',
    scripture: { reference: '1 Thessalonians 5:16 - 18', translation: 'webp', sourceChallengeId: c2 },
    saved: true,
    savedOn: day2,
  })
  assert.equal(duplicateScriptureSave, state)
  assert.equal(state.savedScriptures.length, 2)

  assert.equal(
    isParticipationScriptureSaved(state, { reference: 'John 11:33-35', translation: 'Not configured' }),
    true,
  )

  // Removing one reference leaves the other untouched
  state = reduceParticipationCommand(state, {
    type: 'setScriptureSaved',
    scripture: { reference: '1 Thessalonians 5:16-18', translation: 'WEBP' },
    saved: false,
    savedOn: day2,
  })
  assert.equal(state.savedScriptures.length, 1)
  assert.equal(state.savedScriptures[0].reference, 'John 11:33–35')
})

test('reconciles trusted Challenge supersession aliases and collapses dual completions to earliest date', () => {
  const oldV1 = parseStoredChallengeId('cms:2026-11-02-rejoice-always-v1')!
  const midV2 = parseStoredChallengeId('cms:2026-11-02-rejoice-always-v2')!
  const currentV3 = parseStoredChallengeId('cms:berrymark-challenge-2026-11-02-rejoice-always')!
  const otherId = parseStoredChallengeId('cms:berrymark-challenge-2026-11-03-pray-continually')!

  const nov2 = parseLocalCalendarDate('2026-11-02')!
  const nov6 = parseLocalCalendarDate('2026-11-06')!

  let state = emptyReaderParticipationData()
  // Reader completed oldV1 on Nov 2 AND later completed currentV3 on Nov 6 before alias mapping arrived
  state = reduceParticipationCommand(state, { type: 'completeChallenge', challengeId: oldV1, completedOn: nov2 })
  state = reduceParticipationCommand(state, { type: 'completeChallenge', challengeId: currentV3, completedOn: nov6 })
  state = reduceParticipationCommand(state, { type: 'setChallengeSaved', challengeId: oldV1, saved: true, savedOn: nov2 })
  state = reduceParticipationCommand(state, {
    type: 'setScriptureSaved',
    scripture: { reference: 'Psalm 23:1', translation: 'WEBP', sourceChallengeId: oldV1 },
    saved: true,
    savedOn: nov2,
  })
  state = reduceParticipationCommand(state, { type: 'recordChallengeOpened', challengeId: oldV1, openedOn: nov2 })
  state = reduceParticipationCommand(state, { type: 'completeChallenge', challengeId: otherId, completedOn: nov6 })

  assert.equal(distinctCompletedChallengeCount(state), 3)

  // Reconcile chained aliases oldV1 -> midV2 -> currentV3 (plus defensive cycle guard)
  const reconciled = reconcileChallengeAliases(state, {
    [oldV1]: midV2,
    [midV2]: currentV3,
  })

  // Dual completions collapse to 1 distinct completion keeping earliest completedOn (2026-11-02)
  assert.equal(distinctCompletedChallengeCount(reconciled), 2)
  assert.equal(oldV1 in reconciled.completedChallenges, false)
  assert.equal(midV2 in reconciled.completedChallenges, false)
  assert.equal(reconciled.completedChallenges[currentV3].completedOn, nov2)
  assert.equal(reconciled.completedChallenges[otherId].completedOn, nov6)

  // Saved Challenge, lastOpened, and Scripture sourceChallengeId migrate to currentV3
  assert.equal(oldV1 in reconciled.savedChallenges, false)
  assert.equal(reconciled.savedChallenges[currentV3].savedOn, nov2)
  assert.equal(reconciled.lastOpenedChallenge?.challengeId, currentV3)
  assert.equal(reconciled.savedScriptures[0].sourceChallengeId, currentV3)

  // Re-running identical alias reconciliation is a strict referential no-op
  assert.equal(
    reconcileChallengeAliases(reconciled, { [oldV1]: midV2, [midV2]: currentV3 }),
    reconciled,
  )
})
