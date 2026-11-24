import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { evaluateScope } from '../../scripts/ci/check-scope.mjs'

const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)))

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(REPO_ROOT, relativePath), 'utf8')
}

test('Bibleberry CI Build reader application job runs R06 reader-shell Playwright suite after Chromium setup', () => {
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
  const playwrightSteps = steps.filter(step =>
    /^ {8}run: npx playwright test --config tests\/readerShell\/playwright\.config\.ts\r?$/m.test(step),
  )

  assert.equal(
    playwrightSteps.length,
    1,
    'Expected exactly one step invoking npx playwright test --config tests/readerShell/playwright.config.ts in Build reader application',
  )

  const [playwrightStep] = playwrightSteps
  assert.deepEqual(playwrightStep.split(/\r?\n/), [
    'name: Run R06 reader shell Playwright acceptance suite',
    "        if: steps.scope.outputs.should_run == 'true'",
    '        run: npx playwright test --config tests/readerShell/playwright.config.ts',
  ])
  assert.doesNotMatch(playwrightStep, /continue-on-error/i)
  assert.doesNotMatch(playwrightStep, /\|\|\s*true\b/)

  const scopeIndex = steps.findIndex(step =>
    /node scripts\/ci\/check-scope\.mjs --target reader\b/.test(step),
  )
  const installIndex = steps.findIndex(step => /^ {8}run: npm ci\r?$/m.test(step))
  const chromiumIndex = steps.findIndex(step =>
    /^ {8}run: npx playwright install chromium\r?$/m.test(step),
  )
  const playwrightIndex = steps.indexOf(playwrightStep)
  const uploadIndex = steps.findIndex(step =>
    /^ {8}name: playwright-smoke-results\r?$/m.test(step) ||
    /^name: Upload smoke test failure artifacts\r?$/m.test(step),
  )

  assert.ok(scopeIndex >= 0 && scopeIndex < installIndex, 'Scope check must precede npm ci')
  assert.ok(installIndex >= 0 && installIndex < chromiumIndex, 'Chromium setup must follow npm ci')
  assert.ok(
    chromiumIndex >= 0 && chromiumIndex < playwrightIndex,
    'R06 reader-shell Playwright suite must run after Chromium provisioning',
  )
  assert.ok(
    uploadIndex > playwrightIndex,
    'Failure artifact upload must follow R06 reader-shell Playwright suite',
  )
})

test('reader scope runs R06 reader-shell Playwright suite on relevant edits, unknown diffs, merge_group, and push main', () => {
  const relevantFiles = [
    'tests/readerShell/shell.spec.ts',
    'tests/readerShell/playwright.config.ts',
    'src/readerShell/R06ReaderShell.tsx',
    '.github/workflows/ci.yml',
    'tests/ci/reader-shell-playwright-ci.test.ts',
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

test('Playwright test runner exits nonzero when a spec fails', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'parchment-circuit-pw-failure-'))
  try {
    const configPath = join(tempDir, 'playwright.config.mjs')
    const specPath = join(tempDir, 'intentionalFailure.spec.mjs')
    const playwrightEntryUrl = pathToFileURL(
      createRequire(import.meta.url).resolve('@playwright/test'),
    ).href

    writeFileSync(
      configPath,
      [
        `import pkg from '${playwrightEntryUrl}'`,
        'const { defineConfig } = pkg',
        'export default defineConfig({',
        "  testDir: '.',",
        "  testMatch: 'intentionalFailure.spec.mjs',",
        '  workers: 1,',
        "  reporter: [['list']],",
        '})',
        '',
      ].join('\n'),
      'utf8',
    )
    writeFileSync(
      specPath,
      [
        `import pkg from '${playwrightEntryUrl}'`,
        'const { expect, test } = pkg',
        "test('intentional playwright failure', () => {",
        '  expect(1).toBe(2)',
        '})',
        '',
      ].join('\n'),
      'utf8',
    )

    const playwrightBin = resolve(REPO_ROOT, 'node_modules/.bin/playwright')
    const result = spawnSync(
      playwrightBin,
      ['test', '--config', configPath],
      { encoding: 'utf8', cwd: REPO_ROOT },
    )

    assert.equal(result.error, undefined)
    assert.notEqual(
      result.status,
      0,
      'A failing Playwright test must exit nonzero so the hosted Build reader application job fails',
    )
    assert.match(
      `${result.stdout}\n${result.stderr}`,
      /intentional playwright failure/,
      'Expected the failing Playwright test case to execute and report its failure',
    )
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
})
