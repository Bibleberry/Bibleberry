import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TARGET_PATTERNS,
  UNIVERSAL_PATTERNS,
  evaluateScope,
} from '../../scripts/ci/check-scope.mjs';
import {
  COLLECTIONS_BROWSER_SUITES,
  evaluatePlaywrightReport,
  runCollectionsBrowserTests,
  validateSuiteDefinitions,
} from '../../scripts/testing/run-collections-browser-tests.mjs';

const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

type SuiteDefinition = (typeof COLLECTIONS_BROWSER_SUITES)[number];

interface ParityInput {
  watchedDirectories: readonly string[];
  suites: readonly SuiteDefinition[];
  specsByDirectory: ReadonlyMap<string, readonly string[]>;
}

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(REPO_ROOT, relativePath), 'utf8');
}

function collectSpecFiles(directoryRelativePath: string): string[] {
  const results: string[] = [];
  const rootDir = resolve(REPO_ROOT, directoryRelativePath);

  function walk(currentDir: string): void {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.spec.ts')) {
        results.push(relative(REPO_ROOT, fullPath).replace(/\\/g, '/'));
      }
    }
  }

  walk(rootDir);
  return results.sort();
}

function extractWatchedTestDirectories(): string[] {
  const universalSources = new Set(UNIVERSAL_PATTERNS.map((pattern: RegExp) => pattern.source));
  const watched: string[] = [];

  for (const pattern of TARGET_PATTERNS['collections-browser'] as RegExp[]) {
    if (universalSources.has(pattern.source)) {
      continue;
    }
    const match = pattern.source.match(/^\^tests\\\/([A-Za-z0-9_-]+)\\\/$/);
    if (match) {
      watched.push(`tests/${match[1]}`);
    }
  }

  return watched.sort();
}

function assertCollectionsBrowserParity({
  watchedDirectories,
  suites,
  specsByDirectory,
}: ParityInput): void {
  const watchedSet = new Set(watchedDirectories);
  const configuredDirs = new Set(suites.map(suite => suite.watchedDirectory));
  const configuredSpecs = new Set(suites.map(suite => suite.specPath));

  for (const dir of watchedDirectories) {
    assert.ok(
      configuredDirs.has(dir),
      `Watched collections-browser directory "${dir}" has no invoked suite in COLLECTIONS_BROWSER_SUITES`,
    );

    const diskSpecs = specsByDirectory.get(dir) ?? [];
    assert.ok(
      diskSpecs.length > 0,
      `Watched collections-browser directory "${dir}" must contain at least one Playwright .spec.ts file`,
    );

    for (const specPath of diskSpecs) {
      assert.ok(
        configuredSpecs.has(specPath),
        `Playwright spec "${specPath}" inside watched directory "${dir}" is not invoked by COLLECTIONS_BROWSER_SUITES`,
      );
    }
  }

  for (const suite of suites) {
    assert.ok(
      watchedSet.has(suite.watchedDirectory),
      `Invoked suite "${suite.id}" targets unwatched directory "${suite.watchedDirectory}"`,
    );
  }
}

function createSilentLogger() {
  const logs: string[] = [];
  const errors: string[] = [];
  return {
    logs,
    errors,
    logger: {
      log: (message: string) => logs.push(message),
      error: (message: string) => errors.push(message),
    },
  };
}

test('collections-browser watched directories and invoked Playwright suites are in exact bidirectional parity', () => {
  const watchedDirectories = extractWatchedTestDirectories();
  assert.deepEqual(watchedDirectories, [
    'tests/announcements',
    'tests/cardViewer',
    'tests/notebook',
    'tests/savedScripture',
  ]);

  const specsByDirectory = new Map<string, string[]>(
    watchedDirectories.map(dir => [dir, collectSpecFiles(dir)]),
  );

  assertCollectionsBrowserParity({
    watchedDirectories,
    suites: COLLECTIONS_BROWSER_SUITES,
    specsByDirectory,
  });

  const validation = validateSuiteDefinitions(COLLECTIONS_BROWSER_SUITES, { cwd: REPO_ROOT });
  assert.equal(validation.valid, true, JSON.stringify({
    globalErrors: validation.globalErrors,
    suiteErrors: [...validation.suiteErrors.entries()],
  }));

  for (const suite of COLLECTIONS_BROWSER_SUITES) {
    assert.equal(
      evaluateScope('collections-browser', [suite.specPath], 'pull_request').shouldRun,
      true,
      `Changing ${suite.specPath} must trigger collections-browser`,
    );
    assert.equal(
      evaluateScope('collections-browser', [suite.configPath], 'pull_request').shouldRun,
      true,
      `Changing ${suite.configPath} must trigger collections-browser`,
    );

    const configContent = readRepoFile(suite.configPath);
    assert.match(configContent, /headless:\s*true/, `${suite.configPath} must preserve headless Chromium`);
    assert.match(configContent, /forbidOnly:\s*!!process\.env\.CI/, `${suite.configPath} must forbid .only in CI`);
    assert.match(configContent, /workers:\s*1/, `${suite.configPath} must preserve single-worker determinism`);
    assert.match(configContent, /Desktop Chrome/, `${suite.configPath} must target Chromium Desktop Chrome`);
  }

  // Verify workflow and package.json remain wired to the runner
  const workflow = readRepoFile('.github/workflows/collections-browser.yml');
  assert.match(workflow, /node scripts\/ci\/check-scope\.mjs --target collections-browser/);
  assert.match(workflow, /run:\s*npm run test:collections/);

  const packageJson = JSON.parse(readRepoFile('package.json')) as {
    scripts?: Record<string, string>;
  };
  assert.equal(
    packageJson.scripts?.['test:collections'],
    'node scripts/testing/run-collections-browser-tests.mjs',
  );
  assert.equal(
    evaluateScope('collections-browser', ['scripts/testing/run-collections-browser-tests.mjs'], 'pull_request')
      .shouldRun,
    true,
    'Updating the collections runner itself must trigger collections-browser',
  );
});

test('parity contract detects removing any watched suite, omitting a spec file, or adding an unwatched suite', () => {
  const watchedDirectories = extractWatchedTestDirectories();
  const specsByDirectory = new Map<string, string[]>(
    watchedDirectories.map(dir => [dir, collectSpecFiles(dir)]),
  );

  // Removing any one of the four suites must fail parity detection
  for (const omittedSuite of COLLECTIONS_BROWSER_SUITES) {
    const reducedSuites = COLLECTIONS_BROWSER_SUITES.filter(suite => suite.id !== omittedSuite.id);
    assert.throws(
      () =>
        assertCollectionsBrowserParity({
          watchedDirectories,
          suites: reducedSuites,
          specsByDirectory,
        }),
      new RegExp(omittedSuite.watchedDirectory.replace('/', '\\/')),
      `Removing suite "${omittedSuite.id}" must be detected`,
    );
  }

  // Adding a second .spec.ts in a watched directory without wiring it must be detected
  const extraSpecMap = new Map(specsByDirectory);
  extraSpecMap.set('tests/cardViewer', [
    ...(specsByDirectory.get('tests/cardViewer') ?? []),
    'tests/cardViewer/unwired-regression.spec.ts',
  ]);
  assert.throws(
    () =>
      assertCollectionsBrowserParity({
        watchedDirectories,
        suites: COLLECTIONS_BROWSER_SUITES,
        specsByDirectory: extraSpecMap,
      }),
    /unwired-regression\.spec\.ts/,
  );

  // Adding a new watched directory without wiring a suite must be detected
  assert.throws(
    () =>
      assertCollectionsBrowserParity({
        watchedDirectories: [...watchedDirectories, 'tests/cardSharing'],
        suites: COLLECTIONS_BROWSER_SUITES,
        specsByDirectory: new Map([
          ...specsByDirectory,
          ['tests/cardSharing', ['tests/cardSharing/earned-card-share-control.spec.ts']],
        ]),
      }),
    /tests\/cardSharing/,
  );

  // Invoking a suite from an unwatched directory must be detected
  assert.throws(
    () =>
      assertCollectionsBrowserParity({
        watchedDirectories,
        suites: [
          ...COLLECTIONS_BROWSER_SUITES,
          {
            id: 'unwatched-news',
            name: 'Unwatched News',
            watchedDirectory: 'tests/news',
            configPath: 'tests/news/playwright.config.ts',
            specPath: 'tests/news/news-reader.spec.ts',
          },
        ],
        specsByDirectory,
      }),
    /unwatched directory "tests\/news"/,
  );
});

test('runner executes all four configured suites with local configs and aggregates counts on success', () => {
  const invokedCommands: Array<{ args: string[]; reportPath: string }> = [];
  const expectedCountsBySpec: Record<string, number> = {
    'tests/savedScripture/saved-scripture-collection.spec.ts': 3,
    'tests/notebook/field-notebook.spec.ts': 2,
    'tests/cardViewer/earned-scripture-card-viewer.spec.ts': 2,
    'tests/announcements/hub-card-announcements.spec.ts': 3,
  };
  const { logger, logs, errors } = createSilentLogger();

  const summary = runCollectionsBrowserTests({
    cwd: REPO_ROOT,
    playwrightCli: '/fake/playwright/cli.js',
    logger,
    spawn: (_cmd: string, args: string[], opts: { env: Record<string, string> }) => {
      const reportPath = opts.env.PLAYWRIGHT_JSON_OUTPUT_FILE;
      const specPath = args[4];
      invokedCommands.push({ args, reportPath });
      writeFileSync(
        reportPath,
        JSON.stringify({
          errors: [],
          stats: {
            expected: expectedCountsBySpec[specPath],
            unexpected: 0,
            flaky: 0,
            skipped: 0,
            duration: 1234,
          },
        }),
      );
      return { status: 0, signal: null, error: undefined };
    },
  });

  assert.equal(summary.ok, true);
  assert.equal(summary.exitCode, 0);
  assert.equal(invokedCommands.length, 4);
  assert.deepEqual(
    invokedCommands.map(entry => entry.args),
    COLLECTIONS_BROWSER_SUITES.map(suite => [
      '/fake/playwright/cli.js',
      'test',
      '--config',
      suite.configPath,
      suite.specPath,
      '--reporter=list,json',
    ]),
  );
  assert.equal(summary.totals.suitesTotal, 4);
  assert.equal(summary.totals.suitesPassed, 4);
  assert.equal(summary.totals.suitesFailed, 0);
  assert.equal(summary.totals.passed, 10);
  assert.equal(summary.totals.failed, 0);
  assert.equal(summary.totals.skipped, 0);
  assert.equal(errors.length, 0);
  assert.ok(logs.some(line => line.includes('suites=4/4 passed') && line.includes('passed=10')));
});

test('runner detects nonzero subprocess exits (mocked and real child process) and preserves nonzero exit code', () => {
  const { logger } = createSilentLogger();

  const mockedFailure = runCollectionsBrowserTests({
    cwd: REPO_ROOT,
    playwrightCli: '/fake/playwright/cli.js',
    logger,
    spawn: (_cmd: string, args: string[], opts: { env: Record<string, string> }) => {
      const specPath = args[4];
      const reportPath = opts.env.PLAYWRIGHT_JSON_OUTPUT_FILE;
      const isCardViewer = specPath === 'tests/cardViewer/earned-scripture-card-viewer.spec.ts';
      writeFileSync(
        reportPath,
        JSON.stringify({
          errors: [],
          stats: {
            expected: isCardViewer ? 1 : 2,
            unexpected: isCardViewer ? 1 : 0,
            flaky: 0,
            skipped: 0,
            duration: 500,
          },
        }),
      );
      return { status: isCardViewer ? 1 : 0, signal: null, error: undefined };
    },
  });

  assert.equal(mockedFailure.ok, false);
  assert.equal(mockedFailure.exitCode, 1);
  assert.equal(mockedFailure.totals.suitesTotal, 4);
  assert.equal(mockedFailure.totals.suitesPassed, 3);
  assert.equal(mockedFailure.totals.suitesFailed, 1);
  assert.equal(mockedFailure.totals.failed, 1);
  const cardViewerResult = mockedFailure.results.find(r => r.suite.id === 'card-viewer');
  assert.equal(cardViewerResult?.status, 'failed');
  assert.equal(cardViewerResult?.exitCode, 1);

  // Real subprocess nonzero exit test (no mocks on child_process.spawnSync)
  const tempDir = mkdtempSync(join(tmpdir(), 'collections-runner-exit-test-'));
  try {
    const failingFakeCli = join(tempDir, 'exit-nonzero.mjs');
    writeFileSync(failingFakeCli, 'process.exit(2);\n', 'utf8');

    const realSubprocessSummary = runCollectionsBrowserTests({
      cwd: REPO_ROOT,
      suites: [COLLECTIONS_BROWSER_SUITES[2]],
      playwrightCli: failingFakeCli,
      stdio: 'pipe',
      logger,
    });

    assert.equal(realSubprocessSummary.ok, false);
    assert.equal(realSubprocessSummary.exitCode, 1);
    assert.equal(realSubprocessSummary.results.length, 1);
    assert.equal(realSubprocessSummary.results[0].status, 'failed');
    assert.equal(realSubprocessSummary.results[0].exitCode, 2);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('runner fails closed on spawn errors, signal terminations, and invalid configurations', () => {
  const { logger } = createSilentLogger();

  const spawnErrorSummary = runCollectionsBrowserTests({
    cwd: REPO_ROOT,
    suites: [COLLECTIONS_BROWSER_SUITES[0]],
    playwrightCli: '/fake/playwright/cli.js',
    logger,
    spawn: () => ({
      status: null,
      signal: null,
      error: new Error('spawn ENOENT'),
    }),
  });
  assert.equal(spawnErrorSummary.ok, false);
  assert.equal(spawnErrorSummary.exitCode, 1);
  assert.equal(spawnErrorSummary.results[0].status, 'spawn-error');

  const signalSummary = runCollectionsBrowserTests({
    cwd: REPO_ROOT,
    suites: [COLLECTIONS_BROWSER_SUITES[0]],
    playwrightCli: '/fake/playwright/cli.js',
    logger,
    spawn: () => ({
      status: null,
      signal: 'SIGKILL',
      error: undefined,
    }),
  });
  assert.equal(signalSummary.ok, false);
  assert.equal(signalSummary.exitCode, 1);
  assert.equal(signalSummary.results[0].status, 'signal-error');

  // Empty suite list
  const emptyConfigSummary = runCollectionsBrowserTests({
    cwd: REPO_ROOT,
    suites: [],
    playwrightCli: '/fake/playwright/cli.js',
    logger,
  });
  assert.equal(emptyConfigSummary.ok, false);
  assert.equal(emptyConfigSummary.exitCode, 1);
  assert.ok(emptyConfigSummary.configErrors.length > 0);

  // Missing spec/config on disk must fail closed without spawning Playwright
  let spawnCount = 0;
  const missingFilesSummary = runCollectionsBrowserTests({
    cwd: REPO_ROOT,
    suites: [
      {
        id: 'missing-suite',
        name: 'Missing Suite',
        watchedDirectory: 'tests/cardViewer',
        configPath: 'tests/cardViewer/does-not-exist.config.ts',
        specPath: 'tests/cardViewer/does-not-exist.spec.ts',
      },
    ],
    playwrightCli: '/fake/playwright/cli.js',
    logger,
    spawn: () => {
      spawnCount += 1;
      return { status: 0, signal: null, error: undefined };
    },
  });
  assert.equal(missingFilesSummary.ok, false);
  assert.equal(missingFilesSummary.exitCode, 1);
  assert.equal(missingFilesSummary.results[0].status, 'invalid-config');
  assert.equal(spawnCount, 0);

  // Spec path outside watched directory and duplicate IDs must fail validation
  const badValidation = validateSuiteDefinitions(
    [
      {
        id: 'dup',
        name: 'First',
        watchedDirectory: 'tests/cardViewer',
        configPath: 'tests/cardViewer/playwright.config.ts',
        specPath: 'tests/announcements/hub-card-announcements.spec.ts',
      },
      {
        id: 'dup',
        name: 'Second',
        watchedDirectory: 'tests/announcements',
        configPath: 'tests/announcements/playwright.config.ts',
        specPath: 'tests/announcements/hub-card-announcements.spec.ts',
      },
    ],
    { cwd: REPO_ROOT },
  );
  assert.equal(badValidation.valid, false);
  assert.ok(badValidation.suiteErrors.size > 0);
});

test('runner fails closed on missing tests, unexpected skip-only results, partial skips, Playwright errors, and missing/malformed reports', () => {
  const { logger } = createSilentLogger();

  // Direct evaluator unit coverage
  assert.equal(
    evaluatePlaywrightReport({
      errors: [],
      stats: { expected: 0, unexpected: 0, flaky: 0, skipped: 0, duration: 10 },
    }).status,
    'no-tests',
  );
  assert.equal(
    evaluatePlaywrightReport({
      errors: [],
      stats: { expected: 0, unexpected: 0, flaky: 0, skipped: 3, duration: 10 },
    }).status,
    'skip-only',
  );
  assert.equal(
    evaluatePlaywrightReport({
      errors: [],
      stats: { expected: 2, unexpected: 0, flaky: 0, skipped: 1, duration: 10 },
    }).status,
    'unexpected-skips',
  );
  assert.equal(
    evaluatePlaywrightReport({
      errors: [{ message: 'SyntaxError in playwright.config.ts' }],
      stats: { expected: 2, unexpected: 0, flaky: 0, skipped: 0, duration: 10 },
    }).status,
    'playwright-errors',
  );

  // Runner integration for exit 0 with skip-only report -> must fail closed!
  const skipOnlyRun = runCollectionsBrowserTests({
    cwd: REPO_ROOT,
    suites: [COLLECTIONS_BROWSER_SUITES[3]],
    playwrightCli: '/fake/playwright/cli.js',
    logger,
    spawn: (_cmd: string, _args: string[], opts: { env: Record<string, string> }) => {
      writeFileSync(
        opts.env.PLAYWRIGHT_JSON_OUTPUT_FILE,
        JSON.stringify({
          errors: [],
          stats: { expected: 0, unexpected: 0, flaky: 0, skipped: 3, duration: 100 },
        }),
      );
      return { status: 0, signal: null, error: undefined };
    },
  });
  assert.equal(skipOnlyRun.ok, false);
  assert.equal(skipOnlyRun.exitCode, 1);
  assert.equal(skipOnlyRun.results[0].status, 'skip-only');
  assert.equal(skipOnlyRun.totals.skipped, 3);
  assert.equal(skipOnlyRun.totals.passed, 0);

  // Runner integration for exit 0 with 0 discovered tests -> must fail closed!
  const noTestsRun = runCollectionsBrowserTests({
    cwd: REPO_ROOT,
    suites: [COLLECTIONS_BROWSER_SUITES[2]],
    playwrightCli: '/fake/playwright/cli.js',
    logger,
    spawn: (_cmd: string, _args: string[], opts: { env: Record<string, string> }) => {
      writeFileSync(
        opts.env.PLAYWRIGHT_JSON_OUTPUT_FILE,
        JSON.stringify({
          errors: [],
          stats: { expected: 0, unexpected: 0, flaky: 0, skipped: 0, duration: 50 },
        }),
      );
      return { status: 0, signal: null, error: undefined };
    },
  });
  assert.equal(noTestsRun.ok, false);
  assert.equal(noTestsRun.exitCode, 1);
  assert.equal(noTestsRun.results[0].status, 'no-tests');

  // Runner integration for exit 0 without producing a JSON report -> must fail closed!
  const missingReportRun = runCollectionsBrowserTests({
    cwd: REPO_ROOT,
    suites: [COLLECTIONS_BROWSER_SUITES[0]],
    playwrightCli: '/fake/playwright/cli.js',
    logger,
    spawn: () => ({ status: 0, signal: null, error: undefined }),
  });
  assert.equal(missingReportRun.ok, false);
  assert.equal(missingReportRun.exitCode, 1);
  assert.equal(missingReportRun.results[0].status, 'missing-report');

  // Runner integration for exit 0 with corrupt JSON report -> must fail closed!
  const corruptReportRun = runCollectionsBrowserTests({
    cwd: REPO_ROOT,
    suites: [COLLECTIONS_BROWSER_SUITES[1]],
    playwrightCli: '/fake/playwright/cli.js',
    logger,
    spawn: (_cmd: string, _args: string[], opts: { env: Record<string, string> }) => {
      writeFileSync(opts.env.PLAYWRIGHT_JSON_OUTPUT_FILE, '{corrupt json', 'utf8');
      return { status: 0, signal: null, error: undefined };
    },
  });
  assert.equal(corruptReportRun.ok, false);
  assert.equal(corruptReportRun.exitCode, 1);
  assert.equal(corruptReportRun.results[0].status, 'invalid-report');
});
