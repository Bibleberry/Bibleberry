import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import type { CmsScripture } from '../../src/cms/sanity/types.ts'
import {
  resolveChallengePlayerCopy,
  resolveScripturePanelCopy,
  type ChallengePlayerChallenge,
} from '../../src/components/challenge/challengePlayerModel.ts'
import {
  applyControlledOrdinaryChallengeChange,
  completeOrdinaryChallenge,
  emptyOrdinaryChallengeSessionState,
  isOrdinaryScriptureSaved,
  ordinaryScriptureKey,
  resolveOrdinaryChallengeStateController,
  setOrdinaryChallengeScreen,
  startOrdinaryChallengeProgress,
  toggleOrdinaryChallengeSaved,
  toggleOrdinaryScriptureSaved,
  type OrdinaryChallengeActions,
  type OrdinaryChallengeSessionState,
  type OrdinaryChallengeViewState,
} from '../../src/components/challenge/ordinaryChallengeHostModel.ts'
import {
  admitPilotSampleChallenge,
  admitTrustedCatalogChallenge,
} from '../../src/participation/admission.ts'
import {
  assertValidAdmittedChallengeForHost,
  buildChallengeAliasRecord,
  resolvePersistedHostScreenId,
} from '../../src/participation/persistedChallengeHostModel.ts'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

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
    isInProgress: false,
    savedScriptures: [],
  })

  // Starting progress transitions isInProgress without completing or saving
  assert.equal(state.isInProgress, false)
  state = startOrdinaryChallengeProgress(state)
  assert.equal(state.isInProgress, true)
  assert.equal(state.isCompleted, false)
  assert.equal(state.isSaved, false)
  assert.equal(startOrdinaryChallengeProgress(state), state)

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

test('enforces controlled vs. uncontrolled state contract at runtime and keeps updaters StrictMode-pure', () => {
  const initial = emptyOrdinaryChallengeSessionState()
  const changes: OrdinaryChallengeSessionState[] = []
  const onStateChange = (next: OrdinaryChallengeSessionState) => {
    changes.push(next)
  }

  // Valid controlled mode
  const controlled = resolveOrdinaryChallengeStateController({
    state: initial,
    onStateChange,
  })
  assert.equal(controlled.mode, 'controlled')

  // Controlled transitions notify once per real change and skip no-op transitions
  applyControlledOrdinaryChallengeChange(initial, onStateChange, current =>
    completeOrdinaryChallenge(sampleChallenge, current),
  )
  assert.equal(changes.length, 0)

  applyControlledOrdinaryChallengeChange(initial, onStateChange, toggleOrdinaryChallengeSaved)
  assert.equal(changes.length, 1)
  assert.equal(changes[0].isSaved, true)

  // Valid uncontrolled modes (empty and seeded)
  const uncontrolledDefault = resolveOrdinaryChallengeStateController({})
  assert.deepEqual(uncontrolledDefault, { mode: 'uncontrolled', initialState: undefined })

  const seeded = { ...initial, screenId: 'screen-two' }
  const uncontrolledSeeded = resolveOrdinaryChallengeStateController({ initialState: seeded })
  assert.deepEqual(uncontrolledSeeded, { mode: 'uncontrolled', initialState: seeded })

  // Reject half-configured or conflicting state props instead of rendering inert controls
  assert.throws(
    () => resolveOrdinaryChallengeStateController({ state: initial }),
    { name: 'TypeError', message: /requires onStateChange when state is provided/ },
  )
  assert.throws(
    () => resolveOrdinaryChallengeStateController({ onStateChange }),
    { name: 'TypeError', message: /does not accept onStateChange without controlled state/ },
  )
  assert.throws(
    () => resolveOrdinaryChallengeStateController({ state: initial, onStateChange, initialState: seeded }),
    { name: 'TypeError', message: /does not accept initialState when state is controlled/ },
  )

  // Valid external actions mode (`viewState` + `actions`) and mixed-mode rejection
  const viewState: OrdinaryChallengeViewState = {
    screenId: 'screen-one',
    isSaved: false,
    isCompleted: false,
    isScriptureSaved: () => false,
  }
  const actions: OrdinaryChallengeActions = {
    onScreenChange: () => {},
    onToggleSaveChallenge: () => {},
    onToggleSaveScripture: () => {},
    onComplete: () => {},
  }
  const actionsMode = resolveOrdinaryChallengeStateController({ viewState, actions })
  assert.equal(actionsMode.mode, 'actions')
  assert.throws(
    () => resolveOrdinaryChallengeStateController({ viewState }),
    { name: 'TypeError', message: /requires both viewState and actions together/ },
  )
  assert.throws(
    () => resolveOrdinaryChallengeStateController({ actions }),
    { name: 'TypeError', message: /requires both viewState and actions together/ },
  )
  assert.throws(
    () => resolveOrdinaryChallengeStateController({ viewState, actions, state: initial, onStateChange }),
    { name: 'TypeError', message: /does not accept state, onStateChange, or initialState/ },
  )

  // Simulate React <StrictMode> double-invocation on frozen snapshots for every uncontrolled updater
  const frozenStart = Object.freeze({
    ...emptyOrdinaryChallengeSessionState(),
    savedScriptures: Object.freeze([] as OrdinaryChallengeSessionState['savedScriptures']) as OrdinaryChallengeSessionState['savedScriptures'],
  })
  const savedPass1 = toggleOrdinaryChallengeSaved(frozenStart)
  const savedPass2 = toggleOrdinaryChallengeSaved(frozenStart)
  assert.deepEqual(savedPass1, savedPass2)
  assert.equal(frozenStart.isSaved, false)

  const scripturePass1 = toggleOrdinaryScriptureSaved(frozenStart, providedScripture)
  const scripturePass2 = toggleOrdinaryScriptureSaved(frozenStart, providedScripture)
  assert.deepEqual(scripturePass1, scripturePass2)
  assert.equal(frozenStart.savedScriptures.length, 0)

  const screenPass1 = setOrdinaryChallengeScreen(sampleChallenge, frozenStart, 'screen-two')
  const screenPass2 = setOrdinaryChallengeScreen(sampleChallenge, frozenStart, 'screen-two')
  assert.deepEqual(screenPass1, screenPass2)
  assert.equal(frozenStart.screenId, undefined)

  const frozenFinalScreen = Object.freeze({
    ...screenPass1,
    savedScriptures: Object.freeze([...screenPass1.savedScriptures]),
  })
  const completePass1 = completeOrdinaryChallenge(sampleChallenge, frozenFinalScreen)
  const completePass2 = completeOrdinaryChallenge(sampleChallenge, frozenFinalScreen)
  assert.deepEqual(completePass1, completePass2)
  assert.equal(frozenFinalScreen.isCompleted, false)

  // Verify OrdinaryChallengeHost.tsx never invokes onStateChange inside a React state updater
  const hostPath = resolve(repositoryRoot, 'src/components/challenge/OrdinaryChallengeHost.tsx')
  const hostAst = ts.createSourceFile(
    hostPath,
    readFileSync(hostPath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )

  let foundUncontrolledComponent = false
  function inspectNode(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'UncontrolledOrdinaryChallengeHost') {
      foundUncontrolledComponent = true
      assert.equal(
        /\bonStateChange\b/.test(node.getText(hostAst)),
        false,
        'UncontrolledOrdinaryChallengeHost must not reference or invoke onStateChange',
      )
    }
    if (
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'setSession'
    ) {
      for (const arg of node.arguments) {
        assert.equal(
          /\bonStateChange\b/.test(arg.getText(hostAst)),
          false,
          'setSession updater must remain pure and free of onStateChange side effects',
        )
      }
    }
    ts.forEachChild(node, inspectNode)
  }
  inspectNode(hostAst)
  assert.equal(foundUncontrolledComponent, true)
})

test('OrdinaryChallengeHostProps discriminated union rejects mismatched state/onStateChange at compile time', () => {
  const configPath = resolve(repositoryRoot, 'tsconfig.app.json')
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
  assert.equal(configFile.error, undefined)
  const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, repositoryRoot)

  const virtualFile = resolve(repositoryRoot, 'src/components/challenge/__hostContractCheck__.tsx')
  const cases = [
    {
      name: 'valid-controlled',
      valid: true,
      jsx: '<OrdinaryChallengeHost challengeKey="k" challenge={p.challenge} state={p.state} onStateChange={p.onStateChange} />',
    },
    {
      name: 'valid-uncontrolled',
      valid: true,
      jsx: '<OrdinaryChallengeHost challengeKey="k" challenge={p.challenge} />',
    },
    {
      name: 'valid-seeded',
      valid: true,
      jsx: '<OrdinaryChallengeHost challengeKey="k" challenge={p.challenge} initialState={p.state} />',
    },
    {
      name: 'valid-actions',
      valid: true,
      jsx: '<OrdinaryChallengeHost challengeKey="k" challenge={p.challenge} viewState={p.viewState} actions={p.actions} />',
    },
    {
      name: 'invalid-state-without-callback',
      valid: false,
      jsx: '<OrdinaryChallengeHost challengeKey="k" challenge={p.challenge} state={p.state} />',
    },
    {
      name: 'invalid-callback-without-state',
      valid: false,
      jsx: '<OrdinaryChallengeHost challengeKey="k" challenge={p.challenge} onStateChange={p.onStateChange} />',
    },
    {
      name: 'invalid-mixed-controlled-and-initialState',
      valid: false,
      jsx: '<OrdinaryChallengeHost challengeKey="k" challenge={p.challenge} state={p.state} onStateChange={p.onStateChange} initialState={p.state} />',
    },
    {
      name: 'invalid-viewState-without-actions',
      valid: false,
      jsx: '<OrdinaryChallengeHost challengeKey="k" challenge={p.challenge} viewState={p.viewState} />',
    },
    {
      name: 'invalid-mixed-actions-and-state',
      valid: false,
      jsx: '<OrdinaryChallengeHost challengeKey="k" challenge={p.challenge} viewState={p.viewState} actions={p.actions} state={p.state} onStateChange={p.onStateChange} />',
    },
  ] as const

  const headerLines = [
    "import type { ChallengePlayerChallenge } from './ChallengePlayer.tsx'",
    "import { OrdinaryChallengeHost } from './OrdinaryChallengeHost.tsx'",
    "import type { OrdinaryChallengeActions, OrdinaryChallengeSessionState, OrdinaryChallengeViewState } from './ordinaryChallengeHostModel.ts'",
    'type Inputs = { challenge: ChallengePlayerChallenge; state: OrdinaryChallengeSessionState; onStateChange: (next: OrdinaryChallengeSessionState) => void; viewState: OrdinaryChallengeViewState; actions: OrdinaryChallengeActions }',
  ]
  const caseStartLine = headerLines.length
  const virtualSource = [
    ...headerLines,
    ...cases.map((entry, idx) => `export const case${idx} = (p: Inputs) => (${entry.jsx})`),
  ].join('\n')

  const baseHost = ts.createCompilerHost(parsedConfig.options, true)
  const host: ts.CompilerHost = {
    ...baseHost,
    fileExists: fileName => fileName === virtualFile || baseHost.fileExists(fileName),
    readFile: fileName => (fileName === virtualFile ? virtualSource : baseHost.readFile(fileName)),
    getSourceFile: (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
      if (fileName === virtualFile) {
        return ts.createSourceFile(fileName, virtualSource, languageVersion, true, ts.ScriptKind.TSX)
      }
      return baseHost.getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile)
    },
  }

  const program = ts.createProgram([virtualFile], parsedConfig.options, host)
  const sourceFile = program.getSourceFile(virtualFile)
  assert.ok(sourceFile)

  const diagnostics = ts.getPreEmitDiagnostics(program, sourceFile)
  const errorLines = new Set(
    diagnostics
      .filter(diag => diag.start !== undefined)
      .map(diag => sourceFile.getLineAndCharacterOfPosition(diag.start!).line),
  )

  cases.forEach((entry, idx) => {
    const line = caseStartLine + idx
    if (entry.valid) {
      assert.equal(errorLines.has(line), false, `Expected ${entry.name} to typecheck without errors`)
    } else {
      assert.equal(errorLines.has(line), true, `Expected ${entry.name} to fail compile-time typecheck`)
    }
  })
})

test('PersistedChallengeHost model enforces namespace + screen matching and separates durable resume from completed reread', () => {
  const cmsAdmitted = admitTrustedCatalogChallenge(
    {
      documentId: 'berrymark-challenge-2026-11-02-rejoice-always',
      screens: sampleChallenge.screens,
      editorial: { adaptationReviewed: true, reviewedAt: '2026-11-02T12:00:00Z' },
    },
    { previousDocumentIds: ['2026-11-02-rejoice-always-v1'] },
  )!
  const pilotAdmitted = admitPilotSampleChallenge({
    sampleId: 'a3-persistence-sample',
    screens: sampleChallenge.screens,
  })!

  assert.doesNotThrow(() => assertValidAdmittedChallengeForHost(cmsAdmitted, sampleChallenge, 'cms'))
  assert.throws(
    () => assertValidAdmittedChallengeForHost(pilotAdmitted, sampleChallenge, 'cms'),
    { name: 'TypeError', message: /namespace "cms"/ },
  )
  assert.throws(
    () =>
      assertValidAdmittedChallengeForHost(
        cmsAdmitted,
        { screens: [{ id: 'wrong-screen', stepLabel: '1', title: 'Mismatch', blocks: [] }] },
        'cms',
      ),
    { name: 'TypeError', message: /admittedChallenge\.screens to match/ },
  )

  assert.deepEqual(buildChallengeAliasRecord(cmsAdmitted), {
    'cms:2026-11-02-rejoice-always-v1': 'cms:berrymark-challenge-2026-11-02-rejoice-always',
  })
  assert.equal(buildChallengeAliasRecord(pilotAdmitted), null)

  // Uncompleted Challenge resolves durable resume screenId; completed Challenge resolves transient reread screenId
  assert.equal(
    resolvePersistedHostScreenId({ isCompleted: false, resumeScreenId: 'screen-two' }, undefined),
    'screen-two',
  )
  assert.equal(
    resolvePersistedHostScreenId({ isCompleted: true, resumeScreenId: undefined }, undefined),
    undefined,
  )
  assert.equal(
    resolvePersistedHostScreenId({ isCompleted: true, resumeScreenId: undefined }, 'screen-two'),
    'screen-two',
  )
})
