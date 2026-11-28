import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { evaluateScope } from '../../scripts/ci/check-scope.mjs'
import { COLLECTIONS_BROWSER_SUITES } from '../../scripts/testing/run-collections-browser-tests.mjs'

/**
 * Claude Says (#367): guards that hosted CI keeps executing the browser suites, the
 * shipped R06 artifact build, one pinned Node toolchain, and the gateway import graph.
 */

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const readRepoFile = (path: string) => readFileSync(join(repositoryRoot, path), 'utf8')
const WEB_WORKFLOWS = ['.github/workflows/ci.yml', '.github/workflows/collections-browser.yml']

function jobBlock(workflow: string, jobId: string): string {
  const block = workflow.split(new RegExp(`^ {2}${jobId}:\\r?$`, 'm'))[1]?.split(/^ {2}[\w-]+:\r?$/m)[0]
  assert.ok(block, `Expected job ${jobId}`)
  return block
}

function jobIds(workflow: string): string[] {
  const jobs = workflow.split(/^jobs:\r?$/m)[1] ?? ''
  return [...jobs.matchAll(/^ {2}([\w-]+):\r?$/gm)].map(match => match[1])
}

function steps(block: string): string[] {
  return block.split(/^ {6}- /m).slice(1).map(step => step.trim())
}

function runCommands(workflow: string): string[] {
  return [...workflow.matchAll(/^\s+run: (.+)$/gm)].map(match => match[1].trim())
}

function walk(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) walk(path, found)
    else found.push(relative(repositoryRoot, path))
  }
  return found
}

function configsInCommand(command: string): string[] {
  return [...command.matchAll(/--config\s+(\S+playwright\.config\.ts)/g)].map(match => match[1])
}

test('every checked-in Playwright suite config is executed by a hosted workflow', () => {
  const packageScripts: Record<string, string> = JSON.parse(readRepoFile('package.json')).scripts
  const invoked = new Set<string>()

  // Jobs with a default working directory (Sanity Studio) run another package's scripts.
  const rootJobCommands = (workflow: string) => jobIds(workflow)
    .map(jobId => jobBlock(workflow, jobId))
    .filter(block => !/^ {6}run:\r?\n {8}working-directory:/m.test(block))
    .flatMap(runCommands)

  for (const file of WEB_WORKFLOWS) {
    for (const command of rootJobCommands(readRepoFile(file))) {
      configsInCommand(command).forEach(config => invoked.add(config))
      const npmScript = command.match(/^npm run ([\w:-]+)/)?.[1]
      if (npmScript) {
        assert.ok(packageScripts[npmScript], `${file} runs missing npm script ${npmScript}`)
        configsInCommand(packageScripts[npmScript]).forEach(config => invoked.add(config))
        if (npmScript === 'test:collections') {
          COLLECTIONS_BROWSER_SUITES.forEach(suite => invoked.add(suite.configPath))
        }
      }
    }
  }

  const checkedIn = walk(join(repositoryRoot, 'tests'))
    .filter(path => path.endsWith('/playwright.config.ts'))
    .sort()
  assert.ok(checkedIn.length >= 17, 'Expected the suite configs under tests/')
  assert.deepEqual(checkedIn.filter(config => !invoked.has(config)), [])
})

test('reader browser suites run every newly wired suite after Chromium provisioning', () => {
  const block = jobBlock(readRepoFile('.github/workflows/ci.yml'), 'reader-browser-suites')
  assert.match(block, /^ {4}name: Reader browser suites \(Chromium\)\r?$/m)
  const jobSteps = steps(block)
  const index = (pattern: RegExp) => jobSteps.findIndex(step => pattern.test(step))

  const scopeIndex = index(/check-scope\.mjs --target reader\r?$/m)
  const installIndex = index(/^ {8}run: npm ci\r?$/m)
  const chromiumIndex = index(/^ {8}run: npx playwright install chromium\r?$/m)
  assert.ok(scopeIndex >= 0 && scopeIndex < installIndex && installIndex < chromiumIndex)

  const expectedCommands = [
    'npm run test:performance',
    'npx playwright test --config tests/appIntegration/playwright.config.ts',
    'npx playwright test --config tests/cardSharing/playwright.config.ts',
    'npx playwright test --config tests/challenge/playwright.config.ts',
    'npx playwright test --config tests/hubContinue/playwright.config.ts',
    'npx playwright test --config tests/library/playwright.config.ts',
    'npm run test:month-accessibility',
    'npx playwright test --config tests/news/playwright.config.ts',
    'npx playwright test --config tests/onboardingReplay/playwright.config.ts',
    'npx playwright test --config tests/r06Library/playwright.config.ts',
    'npx playwright test --config tests/scriptureCapture/playwright.config.ts',
    'npx playwright test --config tests/shelfUI/playwright.config.ts',
  ]
  for (const command of expectedCommands) {
    const commandIndex = index(new RegExp(`^ {8}run: ${command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\r?$`, 'm'))
    assert.ok(commandIndex > chromiumIndex, `${command} must run after Chromium setup`)
    assert.match(jobSteps[commandIndex], /if: steps\.scope\.outputs\.should_run == 'true'/)
    assert.doesNotMatch(jobSteps[commandIndex], /continue-on-error|\|\|\s*true\b/)
  }
  assert.doesNotMatch(block, /continue-on-error/)
})

test('Month Screen accessibility suites start their own flagged preview outside dist/', () => {
  const config = readRepoFile('tests/monthAccessibility/playwright.config.ts')
  assert.match(config, /webServer:/)
  assert.match(config, /VITE_ENABLE_MONTH_SCREEN: 'true'/)
  assert.match(config, /vite build --outDir "\$\{FLAGGED_OUT_DIR\}"/)
  assert.match(config, /vite preview --outDir "\$\{FLAGGED_OUT_DIR\}"/)
  assert.doesNotMatch(config, /outDir\s+"?dist\b/)
  assert.equal(
    JSON.parse(readRepoFile('package.json')).scripts['test:month-accessibility'],
    'playwright test --config tests/monthAccessibility/playwright.config.ts',
  )
})

test('CI builds, verifies and smoke-tests the shipped R06 artifact without deploying it', () => {
  const block = jobBlock(readRepoFile('.github/workflows/ci.yml'), 'r06-release-artifact')
  assert.match(block, /^ {4}name: Build and verify R06 release artifact\r?$/m)
  assert.match(block, /^ {8}run: node --test tests\/release\/r06-preflight\.test\.mjs\r?$/m)
  assert.match(block, /node scripts\/release\/r06-preflight\.mjs build "\$commit" "\$output"/)
  assert.match(block, /node scripts\/release\/r06-preflight\.mjs verify "\$commit" "\$manifest_sha256" "\$output"/)
  assert.match(block, /node scripts\/release\/r06-verify-staging\.mjs smoke "\$commit" "\$manifest_sha256" "\$output"/)
  assert.match(block, /set -euo pipefail/)
  assert.doesNotMatch(block, /perimeter|wrangler deploy(?! --dry-run)|secrets\./)
  assert.doesNotMatch(block, /continue-on-error/)
})

test('web CI jobs and the R06 release build share one pinned Node version', () => {
  const pinned = readRepoFile('.nvmrc').trim()
  assert.match(pinned, /^\d+\.\d+\.\d+$/, '.nvmrc must pin an exact Node version')

  // Sanity Studio is a separate package with its own lockfile and stays on its own toolchain.
  const separateToolchainJobs = new Set(['sanity-studio'])
  for (const file of WEB_WORKFLOWS) {
    const workflow = readRepoFile(file)
    for (const jobId of jobIds(workflow)) {
      const block = jobBlock(workflow, jobId)
      if (separateToolchainJobs.has(jobId)) {
        assert.match(block, /node-version: '\d+'/, `${jobId} keeps its own Node version`)
        continue
      }
      assert.match(block, /^ {10}node-version-file: \.nvmrc\r?$/m, `${file} ${jobId} must use .nvmrc`)
      assert.doesNotMatch(block, /^ {10}node-version: /m, `${file} ${jobId} must not hard-code Node`)
    }
  }

  assert.ok(readRepoFile('docs/release/r06-staging-preflight.md').includes(`Node ${pinned}`))
  assert.equal(evaluateScope('reader', ['.nvmrc'], 'pull_request').shouldRun, true)
  assert.equal(evaluateScope('release-gateway', ['.nvmrc'], 'pull_request').shouldRun, true)
})

const RELATIVE_IMPORT = /(?:import|export)\s[^'"]*?from\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)|import\s+['"](\.[^'"]+)['"]/g

function gatewayImportGraph(): string[] {
  const queue = readdirSync(join(repositoryRoot, 'tests/gateway'))
    .filter(name => name.endsWith('.test.ts'))
    .map(name => join(repositoryRoot, 'tests/gateway', name))
  const seen = new Set<string>()
  while (queue.length > 0) {
    const file = queue.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    for (const match of readFileSync(file, 'utf8').matchAll(RELATIVE_IMPORT)) {
      const base = resolve(dirname(file), match[1] ?? match[2] ?? match[3])
      const target = [base, `${base}.ts`, `${base}.tsx`, `${base}.mjs`, `${base}.js`, join(base, 'index.ts')]
        .find(candidate => existsSync(candidate) && statSync(candidate).isFile())
      assert.ok(target, `Unresolved import ${match[0]} in ${relative(repositoryRoot, file)}`)
      if (/\.(?:ts|tsx|mjs|js)$/.test(target)) queue.push(target)
    }
  }
  return [...seen].map(file => relative(repositoryRoot, file)).sort()
}

test('Release Gateway scope covers every file in the gateway test import graph', () => {
  const graph = gatewayImportGraph()
  assert.ok(graph.includes('src/cms/sanity/mapChallenge.ts'))
  assert.ok(graph.includes('src/cms/reader/catalogProvider.ts'))
  assert.ok(graph.some(file => file.startsWith('scripts/')))
  const missing = graph.filter(file => !evaluateScope('release-gateway', [file], 'pull_request').shouldRun)
  assert.deepEqual(missing, [])
})
