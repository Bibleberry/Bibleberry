import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/**
 * Explicit registry of browser suites executed by `npm run test:collections`.
 * Must stay in 1:1 parity with the `tests/<suite>/` directories watched by
 * `TARGET_PATTERNS['collections-browser']` in `scripts/ci/check-scope.mjs`.
 */
export const COLLECTIONS_BROWSER_SUITES = Object.freeze([
  Object.freeze({
    id: 'saved-scripture',
    name: 'Saved Scripture Collection',
    watchedDirectory: 'tests/savedScripture',
    configPath: 'tests/savedScripture/playwright.config.ts',
    specPath: 'tests/savedScripture/saved-scripture-collection.spec.ts',
  }),
  Object.freeze({
    id: 'field-notebook',
    name: 'Field Notebook',
    watchedDirectory: 'tests/notebook',
    configPath: 'tests/notebook/playwright.config.ts',
    specPath: 'tests/notebook/field-notebook.spec.ts',
  }),
  Object.freeze({
    id: 'card-viewer',
    name: 'Earned Scripture Card Viewer',
    watchedDirectory: 'tests/cardViewer',
    configPath: 'tests/cardViewer/playwright.config.ts',
    specPath: 'tests/cardViewer/earned-scripture-card-viewer.spec.ts',
  }),
  Object.freeze({
    id: 'announcements',
    name: 'Hub Card Announcements',
    watchedDirectory: 'tests/announcements',
    configPath: 'tests/announcements/playwright.config.ts',
    specPath: 'tests/announcements/hub-card-announcements.spec.ts',
  }),
])

function normalizeRepoPath(filePath) {
  return String(filePath).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '').trim()
}

function zeroCounts() {
  return {
    passed: 0,
    failed: 0,
    skipped: 0,
    flaky: 0,
    total: 0,
  }
}

function defaultIsFile(filePath) {
  try {
    return existsSync(filePath) && statSync(filePath).isFile()
  } catch {
    return false
  }
}

export function resolvePlaywrightCli() {
  const require = createRequire(import.meta.url)
  const cliPath = resolve(dirname(require.resolve('@playwright/test')), 'cli.js')
  if (!defaultIsFile(cliPath)) {
    throw new Error(`Resolved Playwright CLI does not exist: ${cliPath}`)
  }
  return cliPath
}

/**
 * Validates suite configuration before spawning any Playwright subprocess.
 * Fails closed on empty lists, missing fields, duplicates, path mismatches, or missing files.
 */
export function validateSuiteDefinitions(suites, options = {}) {
  const cwd = options.cwd ?? DEFAULT_REPO_ROOT
  const isFile = options.isFile ?? defaultIsFile
  const globalErrors = []
  const suiteErrors = new Map()

  if (!Array.isArray(suites) || suites.length === 0) {
    globalErrors.push('Collections browser runner configuration must define at least one suite.')
    return { valid: false, globalErrors, suiteErrors }
  }

  const seenIds = new Set()
  const seenSpecs = new Set()

  suites.forEach((suite, index) => {
    const key = typeof suite?.id === 'string' && suite.id.trim() ? suite.id.trim() : `index-${index}`
    const errors = []

    if (!suite || typeof suite !== 'object') {
      errors.push(`Suite entry at index ${index} must be an object.`)
      suiteErrors.set(key, errors)
      return
    }

    for (const field of ['id', 'name', 'watchedDirectory', 'configPath', 'specPath']) {
      if (typeof suite[field] !== 'string' || suite[field].trim() === '') {
        errors.push(`Suite "${key}" is missing required string field "${field}".`)
      }
    }

    if (errors.length === 0) {
      const normalizedId = suite.id.trim()
      const normalizedDir = normalizeRepoPath(suite.watchedDirectory)
      const normalizedConfig = normalizeRepoPath(suite.configPath)
      const normalizedSpec = normalizeRepoPath(suite.specPath)

      if (seenIds.has(normalizedId)) {
        errors.push(`Duplicate suite id "${normalizedId}".`)
      }
      seenIds.add(normalizedId)

      if (seenSpecs.has(normalizedSpec)) {
        errors.push(`Duplicate suite specPath "${normalizedSpec}".`)
      }
      seenSpecs.add(normalizedSpec)

      if (!normalizedSpec.startsWith(`${normalizedDir}/`)) {
        errors.push(
          `Suite "${normalizedId}" specPath "${normalizedSpec}" must reside inside watchedDirectory "${normalizedDir}".`,
        )
      }

      if (!normalizedSpec.endsWith('.spec.ts')) {
        errors.push(`Suite "${normalizedId}" specPath "${normalizedSpec}" must target a Playwright .spec.ts file.`)
      }

      const absoluteConfigPath = resolve(cwd, normalizedConfig)
      if (!isFile(absoluteConfigPath)) {
        errors.push(`Suite "${normalizedId}" configPath does not exist: ${normalizedConfig}`)
      }

      const absoluteSpecPath = resolve(cwd, normalizedSpec)
      if (!isFile(absoluteSpecPath)) {
        errors.push(`Suite "${normalizedId}" specPath does not exist: ${normalizedSpec}`)
      }
    }

    if (errors.length > 0) {
      suiteErrors.set(key, errors)
    }
  })

  return {
    valid: globalErrors.length === 0 && suiteErrors.size === 0,
    globalErrors,
    suiteErrors,
  }
}

/**
 * Evaluates a parsed Playwright JSON report with fail-closed semantics:
 * - Rejects malformed reports or top-level Playwright errors.
 * - Rejects 0-test runs (missing/unmatched tests).
 * - Rejects any unexpected failures.
 * - Rejects skip-only results (0 passed/flaky, >= 1 skipped) and unexpected partial skips.
 */
export function evaluatePlaywrightReport(report, options = {}) {
  const allowSkipped = Boolean(options.allowSkipped)

  if (!report || typeof report !== 'object') {
    return {
      ok: false,
      status: 'invalid-report',
      reason: 'Playwright JSON report is missing or not an object.',
      counts: zeroCounts(),
      durationMs: null,
    }
  }

  const rawStats = report.stats
  const statsFields = ['expected', 'unexpected', 'flaky', 'skipped']
  const statsValid =
    Boolean(rawStats) &&
    typeof rawStats === 'object' &&
    statsFields.every(
      field =>
        typeof rawStats[field] === 'number' &&
        Number.isInteger(rawStats[field]) &&
        rawStats[field] >= 0,
    )

  const counts = statsValid
    ? {
        passed: rawStats.expected,
        failed: rawStats.unexpected,
        skipped: rawStats.skipped,
        flaky: rawStats.flaky,
        total: rawStats.expected + rawStats.unexpected + rawStats.flaky + rawStats.skipped,
      }
    : zeroCounts()

  const durationMs =
    statsValid && typeof rawStats.duration === 'number' && Number.isFinite(rawStats.duration)
      ? Math.round(rawStats.duration)
      : null

  if (Array.isArray(report.errors) && report.errors.length > 0) {
    const firstMessage =
      typeof report.errors[0]?.message === 'string'
        ? report.errors[0].message.split('\n')[0]
        : 'Unknown Playwright error'
    return {
      ok: false,
      status: 'playwright-errors',
      reason: `Playwright reported ${report.errors.length} top-level error(s): ${firstMessage}`,
      counts,
      durationMs,
    }
  }

  if (!statsValid) {
    return {
      ok: false,
      status: 'invalid-report',
      reason: 'Playwright JSON report is missing valid numeric stats fields.',
      counts: zeroCounts(),
      durationMs: null,
    }
  }

  if (counts.total === 0) {
    return {
      ok: false,
      status: 'no-tests',
      reason: 'Playwright discovered 0 tests; refusing false-green execution.',
      counts,
      durationMs,
    }
  }

  if (counts.failed > 0) {
    return {
      ok: false,
      status: 'failed',
      reason: `Playwright reported ${counts.failed} failing test(s).`,
      counts,
      durationMs,
    }
  }

  const executedPassing = counts.passed + counts.flaky
  if (executedPassing === 0 && counts.skipped > 0) {
    return {
      ok: false,
      status: 'skip-only',
      reason: `All ${counts.skipped} discovered test(s) were skipped (0 executed/passed); refusing false-green skip-only result.`,
      counts,
      durationMs,
    }
  }

  if (counts.skipped > 0 && !allowSkipped) {
    return {
      ok: false,
      status: 'unexpected-skips',
      reason: `Playwright reported ${counts.skipped} unexpected skipped test(s) alongside ${executedPassing} passing test(s).`,
      counts,
      durationMs,
    }
  }

  return {
    ok: true,
    status: 'passed',
    reason: `Executed ${executedPassing} passing test(s) (${counts.failed} failed, ${counts.skipped} skipped, ${counts.flaky} flaky).`,
    counts,
    durationMs,
  }
}

export function runCollectionsBrowserTests(options = {}) {
  const suites = options.suites ?? COLLECTIONS_BROWSER_SUITES
  const cwd = options.cwd ?? DEFAULT_REPO_ROOT
  const spawn = options.spawn ?? spawnSync
  const isFile = options.isFile ?? defaultIsFile
  const readFile = options.readFile ?? (filePath => readFileSync(filePath, 'utf8'))
  const logger = options.logger ?? console
  const stdio = options.stdio ?? 'inherit'
  const env = options.env ?? process.env

  const validation = validateSuiteDefinitions(suites, { cwd, isFile })
  if (validation.globalErrors.length > 0) {
    for (const message of validation.globalErrors) {
      logger.error(`[collections-browser] CONFIG ERROR: ${message}`)
    }
    return {
      ok: false,
      exitCode: 1,
      configErrors: validation.globalErrors,
      results: [],
      totals: {
        suitesTotal: 0,
        suitesPassed: 0,
        suitesFailed: 0,
        ...zeroCounts(),
        durationMs: 0,
      },
    }
  }

  let playwrightCli = options.playwrightCli
  if (!playwrightCli) {
    try {
      playwrightCli = resolvePlaywrightCli()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error(`[collections-browser] CONFIG ERROR: Unable to resolve Playwright CLI: ${message}`)
      return {
        ok: false,
        exitCode: 1,
        configErrors: [message],
        results: [],
        totals: {
          suitesTotal: suites.length,
          suitesPassed: 0,
          suitesFailed: suites.length,
          ...zeroCounts(),
          durationMs: 0,
        },
      }
    }
  }

  const reportDir = mkdtempSync(join(tmpdir(), 'bibleberry-collections-pw-'))
  const results = []
  const runStartMs = Date.now()

  try {
    for (let index = 0; index < suites.length; index++) {
      const suite = suites[index]
      const suiteKey =
        typeof suite?.id === 'string' && suite.id.trim() ? suite.id.trim() : `index-${index}`
      const errors = validation.suiteErrors.get(suiteKey)

      if (errors && errors.length > 0) {
        const reason = errors.join(' ')
        logger.error(`[collections-browser] INVALID CONFIG (${suiteKey}): ${reason}`)
        results.push({
          suite,
          ok: false,
          status: 'invalid-config',
          exitCode: null,
          reason,
          counts: zeroCounts(),
          durationMs: 0,
        })
        continue
      }

      const reportPath = join(reportDir, `${suite.id}-${index}.json`)
      const args = [
        playwrightCli,
        'test',
        '--config',
        suite.configPath,
        suite.specPath,
        '--reporter=list,json',
      ]

      logger.log(
        `\n[collections-browser] Running ${suite.name} (${suite.specPath}) using ${suite.configPath}`,
      )

      const suiteStartMs = Date.now()
      const spawnResult = spawn(process.execPath, args, {
        cwd,
        stdio,
        env: {
          ...env,
          PLAYWRIGHT_JSON_OUTPUT_FILE: reportPath,
        },
      })
      const wallDurationMs = Date.now() - suiteStartMs

      if (spawnResult.error) {
        const reason = `Failed to spawn Playwright subprocess: ${spawnResult.error.message}`
        logger.error(`[collections-browser] SPAWN ERROR (${suite.name}): ${reason}`)
        results.push({
          suite,
          ok: false,
          status: 'spawn-error',
          exitCode: null,
          reason,
          counts: zeroCounts(),
          durationMs: wallDurationMs,
        })
        continue
      }

      if (spawnResult.signal) {
        const reason = `Playwright subprocess terminated by signal ${spawnResult.signal}.`
        logger.error(`[collections-browser] SIGNAL ERROR (${suite.name}): ${reason}`)
        results.push({
          suite,
          ok: false,
          status: 'signal-error',
          exitCode: null,
          reason,
          counts: zeroCounts(),
          durationMs: wallDurationMs,
        })
        continue
      }

      let parsedReport = null
      let reportParseError = null
      if (isFile(reportPath)) {
        try {
          parsedReport = JSON.parse(readFile(reportPath))
        } catch (error) {
          reportParseError = error instanceof Error ? error.message : String(error)
        }
      }

      if (spawnResult.status !== 0) {
        const reportEval = parsedReport
          ? evaluatePlaywrightReport(parsedReport, { allowSkipped: suite.allowSkipped })
          : null
        const reason =
          reportEval && !reportEval.ok
            ? `Playwright exited with status ${spawnResult.status}. ${reportEval.reason}`
            : `Playwright exited with nonzero status ${spawnResult.status}.`
        logger.error(`[collections-browser] FAIL (${suite.name}): ${reason}`)
        results.push({
          suite,
          ok: false,
          status: 'failed',
          exitCode: spawnResult.status,
          reason,
          counts: reportEval?.counts ?? zeroCounts(),
          durationMs: reportEval?.durationMs ?? wallDurationMs,
        })
        continue
      }

      if (reportParseError) {
        const reason = `Playwright exited 0 but JSON report could not be parsed: ${reportParseError}`
        logger.error(`[collections-browser] INVALID REPORT (${suite.name}): ${reason}`)
        results.push({
          suite,
          ok: false,
          status: 'invalid-report',
          exitCode: 0,
          reason,
          counts: zeroCounts(),
          durationMs: wallDurationMs,
        })
        continue
      }

      if (!parsedReport) {
        const reason =
          'Playwright exited 0 without producing a JSON report; refusing false-green result.'
        logger.error(`[collections-browser] MISSING REPORT (${suite.name}): ${reason}`)
        results.push({
          suite,
          ok: false,
          status: 'missing-report',
          exitCode: 0,
          reason,
          counts: zeroCounts(),
          durationMs: wallDurationMs,
        })
        continue
      }

      const evaluation = evaluatePlaywrightReport(parsedReport, {
        allowSkipped: suite.allowSkipped,
      })

      if (!evaluation.ok) {
        logger.error(
          `[collections-browser] FAIL (${suite.name}) [${evaluation.status}]: ${evaluation.reason}`,
        )
      }

      results.push({
        suite,
        ok: evaluation.ok,
        status: evaluation.status,
        exitCode: 0,
        reason: evaluation.reason,
        counts: evaluation.counts,
        durationMs: evaluation.durationMs ?? wallDurationMs,
      })
    }
  } finally {
    rmSync(reportDir, { recursive: true, force: true })
  }

  const totalWallDurationMs = Date.now() - runStartMs
  const totals = results.reduce(
    (acc, entry) => {
      acc.suitesTotal += 1
      if (entry.ok) {
        acc.suitesPassed += 1
      } else {
        acc.suitesFailed += 1
      }
      acc.passed += entry.counts.passed
      acc.failed += entry.counts.failed
      acc.skipped += entry.counts.skipped
      acc.flaky += entry.counts.flaky
      acc.total += entry.counts.total
      return acc
    },
    {
      suitesTotal: 0,
      suitesPassed: 0,
      suitesFailed: 0,
      ...zeroCounts(),
      durationMs: totalWallDurationMs,
    },
  )

  logger.log(`\n[collections-browser] Execution summary (${totals.suitesTotal} suites):`)
  for (const entry of results) {
    const label = entry.ok ? 'PASS' : `FAIL (${entry.status})`
    const suiteName = entry.suite?.name ?? entry.suite?.id ?? 'unknown-suite'
    const specPath = entry.suite?.specPath ?? 'unknown-spec'
    logger.log(
      `  - ${label}: ${suiteName} (${specPath}) — passed=${entry.counts.passed} failed=${entry.counts.failed} skipped=${entry.counts.skipped} flaky=${entry.counts.flaky} duration=${entry.durationMs}ms`,
    )
    if (!entry.ok) {
      logger.error(`    Reason: ${entry.reason}`)
    }
  }
  logger.log(
    `[collections-browser] Totals: suites=${totals.suitesPassed}/${totals.suitesTotal} passed | tests: passed=${totals.passed} failed=${totals.failed} skipped=${totals.skipped} flaky=${totals.flaky} | wall=${totals.durationMs}ms`,
  )

  const ok = totals.suitesTotal > 0 && totals.suitesFailed === 0
  return {
    ok,
    exitCode: ok ? 0 : 1,
    configErrors: [],
    results,
    totals,
  }
}

const isMainModule =
  Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMainModule) {
  const summary = runCollectionsBrowserTests()
  process.exitCode = summary.exitCode
}
