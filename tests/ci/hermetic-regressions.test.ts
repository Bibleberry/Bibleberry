import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { evaluateScope } from '../../scripts/ci/check-scope.mjs'

// Amber Compass review (#244), with the socket-based PostgreSQL TLS suite deferred in #241.
const reviewedTests = [
  'tests/accountAuth/accountAuthSession.test.ts',
  'tests/accountSync/accountSyncCoordinator.test.ts',
  'tests/accountSync/supabasePostgrestTransport.test.ts',
  'tests/savedScripture/savedScriptureCollectionModel.test.ts',
  'tests/accountVerification/databaseIssuancePort.test.ts',
  'tests/accountVerification/eligibility.test.ts',
  'tests/accountVerification/providerAndBoundary.test.ts',
  'tests/accountVerification/runOnce.test.ts',
  'tests/accountVerification/runtimeBoundary.test.ts',
  'tests/accountVerification/runtimeConfig.test.ts',
  'tests/accountVerification/verifierOrchestration.test.ts',
  'tests/deepLinkIngress/authorizer.test.ts',
  'tests/deepLinkIngress/controller.test.ts',
  'tests/deepLinkIngress/parser.test.ts',
  'tests/hubContinue/hubContinueAppInput.test.ts',
  'tests/hubContinue/hubContinueEngine.test.ts',
  'tests/onboardingReplay/onboardingReplayModel.test.ts',
  'tests/scriptureCapture/scriptureCapture.test.ts',
  'tests/cardSharing/cardSharingService.test.ts',
  'tests/shelf/shelfAccountPrecedence.test.ts',
  'tests/shelf/shelfActiveFocusAndSeparation.test.ts',
  'tests/shelf/shelfProtectionAndRollover.test.ts',
  'tests/shelf/shelfSelectionAndPutAway.test.ts',
  'tests/shelf/shelfValidation.test.ts',
  'tests/news/newsModel.test.ts',
  'tests/news/newsProvider.test.ts',
  'tests/library/historicalLibraryHost.test.ts',
  'tests/library/historicalLibraryModel.test.ts',
  // Claude Says (#367): previously uninvoked hermetic Node suites. Chromium-dependent
  // `tests/performance/**` runs in the reader-browser-suites job instead.
  'tests/accountAuth/supabaseGoTrueProvider.test.ts',
  'tests/accountDatabase/accountSb3Static.test.ts',
  'tests/accountDatabase/accountSchemaStatic.test.ts',
  'tests/accountDatabase/accountTransactionStatic.test.ts',
  'tests/accountDatabase/accountVerify1Static.test.ts',
  'tests/appIntegration/teachingScripture.test.ts',
  'tests/challenge/challengeReaderControls.test.ts',
  'tests/r06Library/r06LibraryModel.test.ts',
  'tests/releaseAudit/monthlyPublicationAudit.test.ts',
  'tests/shelfUI/shelfModel.test.ts',
]

test('reader CI runs exactly the reviewed hermetic tests before browser provisioning', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8')
  const readerJob = workflow.split(/^ {2}reader-app:\r?$/m)[1]?.split(/^ {2}[\w-]+:/m)[0]
  assert.ok(readerJob, 'Expected the reader-app job in ci.yml')

  const steps = readerJob.split(/^ {6}- /m).map(step => step.trim())
  const stepName = 'name: Run hermetic regression tests'
  const regressionSteps = steps.filter(step => step.split(/\r?\n/, 1)[0] === stepName)
  assert.equal(regressionSteps.length, 1, 'Expected one hermetic regression step in reader-app')
  const [regressionStep] = regressionSteps
  assert.deepEqual(regressionStep.split(/\r?\n/), [
    stepName,
    "        if: steps.scope.outputs.should_run == 'true'",
    '        run: >-',
    '          node --experimental-strip-types --test',
    ...reviewedTests.map(file => `          ${file}`),
  ])

  const regressionIndex = steps.indexOf(regressionStep)
  const installIndex = steps.findIndex(step => /^ {8}run: npm ci\r?$/m.test(step))
  const chromiumIndex = steps.findIndex(step => /^ {8}run: npx playwright install chromium\r?$/m.test(step))
  assert.ok(installIndex >= 0 && installIndex < regressionIndex, 'Run after npm ci')
  assert.ok(regressionIndex < chromiumIndex, 'Run before Chromium setup')
})

test('reader scope runs the reviewed regressions for test edits, unknown diffs, and merge groups', () => {
  for (const file of reviewedTests) {
    assert.equal(evaluateScope('reader', [file], 'pull_request').shouldRun, true, file)
  }
  assert.equal(evaluateScope('reader', null, 'pull_request').shouldRun, true)
  assert.equal(evaluateScope('reader', [], 'merge_group').shouldRun, true)
})
