import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { evaluateScope } from '../../scripts/ci/check-scope.mjs'

const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)))

const REQUIRED_READER_SHELL_UNIT_TESTS = [
  'tests/readerShell/navigationBrowser.test.ts',
  'tests/readerShell/navigationModel.test.ts',
  'tests/readerShell/routeTable.test.ts',
  'tests/readerShell/todayPrimaryAction.test.ts',
] as const

const EXCLUDED_READER_SHELL_FILES = [
  'tests/readerShell/shell.spec.ts',
  'tests/readerShell/playwright.config.ts',
] as const

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(REPO_ROOT, relativePath), 'utf8')
}

function listReaderShellFiles(): string[] {
  const results: string[] = []
  const rootDir = resolve(REPO_ROOT, 'tests/readerShell')

  function walk(currentDir: string): void {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = join(currentDir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.isFile()) {
        results.push(relative(REPO_ROOT, fullPath).replace(/\\/g, '/'))
      }
    }
  }

  walk(rootDir)
  return results.sort()
}

function matchesReaderShellUnitGlob(filePath: string): boolean {
  return /^tests\/readerShell\/[^/]+\.test\.ts$/.test(filePath)
}

test('package.json defines test:reader-shell for all Node-compatible reader-shell unit tests and excludes Playwright specs', () => {
  const packageJson = JSON.parse(readRepoFile('package.json')) as {
    scripts?: Record<string, string>
  }

  assert.equal(
    packageJson.scripts?.['test:reader-shell'],
    'node --experimental-strip-types --test tests/readerShell/*.test.ts',
    'package.json must expose test:reader-shell targeting tests/readerShell/*.test.ts',
  )

  const diskFiles = listReaderShellFiles()
  const allUnitTestsOnDisk = diskFiles.filter(file => file.endsWith('.test.ts'))
  const matchedUnitTests = diskFiles.filter(matchesReaderShellUnitGlob)
  const playwrightSpecs = diskFiles.filter(file => file.endsWith('.spec.ts'))

  assert.deepEqual(
    matchedUnitTests,
    allUnitTestsOnDisk,
    'Every *.test.ts file under tests/readerShell must be matched by tests/readerShell/*.test.ts without silent omission',
  )

  for (const requiredFile of REQUIRED_READER_SHELL_UNIT_TESTS) {
    assert.ok(
      matchedUnitTests.includes(requiredFile),
      `Expected ${requiredFile} to exist and match tests/readerShell/*.test.ts`,
    )
  }

  for (const excludedFile of EXCLUDED_READER_SHELL_FILES) {
    assert.ok(diskFiles.includes(excludedFile), `Expected ${excludedFile} to remain in tests/readerShell`)
    assert.equal(
      matchesReaderShellUnitGlob(excludedFile),
      false,
      `${excludedFile} must not be matched by tests/readerShell/*.test.ts`,
    )
  }

  for (const specFile of playwrightSpecs) {
    assert.equal(
      matchesReaderShellUnitGlob(specFile),
      false,
      `Playwright spec ${specFile} must not be fed to the Node test:reader-shell runner`,
    )
  }

  for (const unitFile of matchedUnitTests) {
    const content = readRepoFile(unitFile)
    assert.doesNotMatch(
      content,
      /from ['"]@playwright\/test['"]/,
      `Matched Node unit test ${unitFile} must not import @playwright/test`,
    )
  }
})

test('Bibleberry CI Build reader application job runs npm run test:reader-shell under the existing scope guard', () => {
  const workflow = readRepoFile('.github/workflows/ci.yml')

  assert.match(workflow, /^name: Bibleberry CI\r?$/m)
  assert.match(
    workflow,
    /^ {2}pull_request:\s*\n(?: {4}#.*\n)* {4}types: \[opened, reopened, synchronize, ready_for_review\]\s*\n {4}branches: \[main\]\s*$/m,
    'ci.yml must preserve pull_request triggers targeting main',
  )
  assert.match(
    workflow,
    /^ {2}merge_group:\s*\n {4}types: \[checks_requested\]\s*\n {4}branches: \[main\]\s*$/m,
    'ci.yml must preserve merge_group triggers targeting main',
  )
  assert.match(
    workflow,
    /^ {2}push:\s*\n {4}branches: \[main\]\s*$/m,
    'ci.yml must preserve push triggers targeting main',
  )

  const readerJob = workflow.split(/^ {2}reader-app:\r?$/m)[1]?.split(/^ {2}[\w-]+:/m)[0]
  assert.ok(readerJob, 'Expected the reader-app job in .github/workflows/ci.yml')
  assert.match(readerJob, /^ {4}name: Build reader application\r?$/m)

  const steps = readerJob.split(/^ {6}- /m).slice(1).map(step => step.trim())
  const readerShellSteps = steps.filter(step =>
    /^ {8}run: npm run test:reader-shell\r?$/m.test(step),
  )

  assert.equal(
    readerShellSteps.length,
    1,
    'Expected exactly one step invoking npm run test:reader-shell in Build reader application',
  )

  const [readerShellStep] = readerShellSteps
  assert.deepEqual(readerShellStep.split(/\r?\n/), [
    'name: Run reader shell unit tests',
    "        if: steps.scope.outputs.should_run == 'true'",
    '        run: npm run test:reader-shell',
  ])
  assert.doesNotMatch(readerShellStep, /continue-on-error/i)
  assert.doesNotMatch(readerShellStep, /\|\|\s*true\b/)

  const scopeIndex = steps.findIndex(step =>
    /node scripts\/ci\/check-scope\.mjs --target reader\b/.test(step),
  )
  const installIndex = steps.findIndex(step => /^ {8}run: npm ci\r?$/m.test(step))
  const readerShellIndex = steps.indexOf(readerShellStep)
  const chromiumIndex = steps.findIndex(step =>
    /^ {8}run: npx playwright install chromium\r?$/m.test(step),
  )

  assert.ok(scopeIndex >= 0 && scopeIndex < installIndex, 'Scope check must precede npm ci')
  assert.ok(installIndex >= 0 && installIndex < readerShellIndex, 'Run after npm ci')
  assert.ok(readerShellIndex < chromiumIndex, 'Run before Playwright Chromium provisioning')
})

test('reader scope runs reader-shell unit tests on relevant edits, unknown diffs, merge_group, and push main', () => {
  const matchedUnitTests = listReaderShellFiles().filter(matchesReaderShellUnitGlob)
  assert.ok(matchedUnitTests.length >= REQUIRED_READER_SHELL_UNIT_TESTS.length)

  const relevantFiles = [
    ...matchedUnitTests,
    'src/readerShell/R06ReaderShell.tsx',
    'src/readerShell/navigation/navigationModel.ts',
    'src/readerShell/navigation/routeTable.ts',
    'src/readerShell/today/todayPrimaryAction.ts',
    'package.json',
    '.github/workflows/ci.yml',
    'tests/ci/reader-shell-ci.test.ts',
  ]

  for (const file of relevantFiles) {
    assert.equal(
      evaluateScope('reader', [file], 'pull_request').shouldRun,
      true,
      `Expected reader scope to run on relevant change: ${file}`,
    )
  }

  assert.equal(evaluateScope('reader', null, 'pull_request').shouldRun, true)
  assert.equal(evaluateScope('reader', undefined, 'pull_request').shouldRun, true)
  assert.equal(evaluateScope('reader', [], 'merge_group').shouldRun, true)
  assert.equal(evaluateScope('reader', ['docs/readme.md'], 'merge_group').shouldRun, true)
  assert.equal(evaluateScope('reader', ['docs/readme.md'], 'push').shouldRun, true)
})

test('Node test runner exits nonzero when a matched reader-shell unit test fails', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'silver-relay-failure-guard-'))
  try {
    writeFileSync(join(tempDir, 'package.json'), '{"type":"module"}\n', 'utf8')
    const failingTestFile = join(tempDir, 'intentionalFailure.test.ts')
    writeFileSync(
      failingTestFile,
      "import assert from 'node:assert/strict'\nimport test from 'node:test'\ntest('intentional failure', () => { assert.equal(1, 2) })\n",
      'utf8',
    )

    const env = { ...process.env }
    delete env.NODE_TEST_CONTEXT

    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', '--test', failingTestFile],
      { encoding: 'utf8', env },
    )

    assert.equal(result.error, undefined)
    assert.notEqual(
      result.status,
      0,
      'A failing Node unit test must exit nonzero so the hosted Build reader application job fails',
    )
    assert.match(
      `${result.stdout}\n${result.stderr}`,
      /intentional failure/,
      'Expected the failing test case to execute and report its failure',
    )
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
})
