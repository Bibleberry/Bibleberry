import { chromium, type Browser, type Page } from '@playwright/test';
import { addTopFrameInitScript } from '../tests/smoke/helpers/frameSafeTest.ts';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { gzipSync } from 'node:zlib';
import { startPreviewServer, stopPreviewServer } from './performance/previewServer.ts';
import { renderR21BaselineMarkdown } from './performance/render-r21-markdown.ts';
import type {
  NavigationMetrics,
  NetworkInterruptionCheck,
  ProductionBuildSummary,
  R21BaselineReport,
  R21EnvironmentResult,
  R21HostInfo,
  RunResult,
  SummaryMetric,
} from './performance/types.ts';

const PREFERRED_PORT = 4174;
const RUNS = Number(process.env.PERF_RUNS ?? 3);
const STORAGE_KEY = 'bibleberry-prototype-v1';

type Environment = {
  name: string;
  cpuRate: number;
  network?: { latency: number; download: number; upload: number };
};

const environments: Environment[] = [
  { name: 'unthrottled', cpuRate: 1 },
  {
    name: 'constrained',
    cpuRate: 4,
    network: { latency: 150, download: 200 * 1024, upload: 96 * 1024 },
  },
];

type CliOptions = {
  jsonOut?: string;
  mdOut?: string;
  quiet: boolean;
};

function parseCliArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    jsonOut: process.env.PERF_JSON_OUT || undefined,
    mdOut: process.env.PERF_MD_OUT || undefined,
    quiet: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json-out' && i + 1 < argv.length) {
      options.jsonOut = argv[i + 1];
      i += 1;
    } else if (arg === '--md-out' && i + 1 < argv.length) {
      options.mdOut = argv[i + 1];
      i += 1;
    } else if (arg === '--quiet') {
      options.quiet = true;
    }
  }
  return options;
}

function readGitMetadata(): { sha: string; branch: string; dirty: boolean } {
  try {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim();
    const status = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
    return { sha, branch, dirty: status.length > 0 };
  } catch {
    return { sha: 'unknown', branch: 'unknown', dirty: false };
  }
}

function readUnprivilegedHostInfo(): R21HostInfo {
  const cpus = os.cpus();
  return {
    platform: os.platform(),
    arch: os.arch(),
    osRelease: os.release(),
    cpuModel: cpus[0]?.model?.trim() || 'unknown',
    logicalCpuCount: cpus.length,
    totalMemoryMb: Math.round(os.totalmem() / (1024 * 1024)),
  };
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(entries.map(entry => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
  }));
  return paths.flat();
}

function toPosixRelative(rootDir: string, filePath: string): string {
  return path.relative(rootDir, filePath).split(path.sep).join('/');
}

async function inspectBuild(): Promise<ProductionBuildSummary> {
  const outputDirectory = path.resolve('dist');
  const files = (await listFiles(outputDirectory)).sort();
  const index = await fs.readFile(path.join(outputDirectory, 'index.html'), 'utf8');
  const entryPaths = [
    ...index.matchAll(/<script[^>]+src="([^"]+)"/g),
    ...index.matchAll(/<link[^>]+href="([^"]+\.css)"/g),
  ].map(match => path.join(outputDirectory, match[1].replace(/^\.\//, '')));

  const entryFiles = await Promise.all(entryPaths.map(async file => {
    const content = await fs.readFile(file);
    return {
      file: toPosixRelative(outputDirectory, file),
      bytes: content.byteLength,
      gzipBytes: gzipSync(content).byteLength,
    };
  }));

  const allFiles = await Promise.all(files.map(async file => {
    const content = await fs.readFile(file);
    return {
      file: toPosixRelative(outputDirectory, file),
      bytes: content.byteLength,
      gzipBytes: gzipSync(content).byteLength,
    };
  }));

  const jsEntries = entryFiles.filter(f => f.file.endsWith('.js'));
  const cssEntries = entryFiles.filter(f => f.file.endsWith('.css'));

  return {
    mode: 'production-public',
    totalDistBytes: allFiles.reduce((sum, file) => sum + file.bytes, 0),
    totalDistGzipBytes: allFiles.reduce((sum, file) => sum + file.gzipBytes, 0),
    fileCount: allFiles.length,
    allFiles,
    initialEntryAssets: entryFiles,
    initialEntryTotals: {
      rawBytes: entryFiles.reduce((sum, file) => sum + file.bytes, 0),
      gzipBytes: entryFiles.reduce((sum, file) => sum + file.gzipBytes, 0),
      jsRawBytes: jsEntries.reduce((sum, file) => sum + file.bytes, 0),
      jsGzipBytes: jsEntries.reduce((sum, file) => sum + file.gzipBytes, 0),
      cssRawBytes: cssEntries.reduce((sum, file) => sum + file.bytes, 0),
      cssGzipBytes: cssEntries.reduce((sum, file) => sum + file.gzipBytes, 0),
    },
  };
}

async function installBrowserObservers(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const measurements = {
      longTasks: [] as number[],
      firstContentfulPaintMs: null as number | null,
      largestContentfulPaintMs: null as number | null,
    };
    Object.assign(window, { __r21Measurements: measurements });
    if ('PerformanceObserver' in window) {
      try {
        new PerformanceObserver(list => {
          const entry = list.getEntries().find(item => item.name === 'first-contentful-paint');
          if (entry) measurements.firstContentfulPaintMs = entry.startTime;
        }).observe({ type: 'paint', buffered: true });
      } catch {
        // Paint observation is not available in every Chromium build.
      }
      try {
        new PerformanceObserver(list => {
          for (const entry of list.getEntries()) measurements.longTasks.push(entry.duration);
        }).observe({ type: 'longtask', buffered: true });
      } catch {
        // Long-task observation is not available in every Chromium build.
      }
      try {
        new PerformanceObserver(list => {
          const entries = list.getEntries();
          const latest = entries.at(-1);
          if (latest) measurements.largestContentfulPaintMs = latest.startTime;
        }).observe({ type: 'largest-contentful-paint', buffered: true });
      } catch {
        // LCP observation is not available in every Chromium build.
      }
    }
  });
}

async function readNavigationMetrics(page: Page, wallClockMs: number): Promise<NavigationMetrics> {
  return page.evaluate(duration => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const origin = window.location.origin;
    const sameOriginResources = resources.filter(resource => resource.name.startsWith(origin));
    const sameOriginTransferBytes = sameOriginResources.reduce(
      (total, resource) => total + resource.transferSize,
      0,
    );
    const sameOriginJavaScriptCssBytes = sameOriginResources
      .filter(resource => /\.(js|css)(?:$|\?)/i.test(resource.name))
      .reduce((total, resource) => total + resource.transferSize, 0);
    const measurements = (window as Window & {
      __r21Measurements?: {
        longTasks: number[];
        firstContentfulPaintMs: number | null;
        largestContentfulPaintMs: number | null;
      };
    }).__r21Measurements;
    const heap = (performance as Performance & {
      memory?: { usedJSHeapSize: number };
    }).memory?.usedJSHeapSize;

    return {
      wallClockMs: duration,
      domContentLoadedMs: nav?.domContentLoadedEventEnd ?? 0,
      loadEventMs: nav?.loadEventEnd ?? 0,
      firstContentfulPaintMs: measurements?.firstContentfulPaintMs
        ?? performance.getEntriesByName('first-contentful-paint')[0]?.startTime
        ?? null,
      largestContentfulPaintMs: measurements?.largestContentfulPaintMs ?? null,
      sameOriginTransferBytes,
      sameOriginJavaScriptCssBytes,
      externalFontResources: resources
        .filter(resource => !resource.name.startsWith(origin) && /fonts\.(googleapis|gstatic)\.com/i.test(resource.name))
        .map(resource => resource.name),
      longTaskCount: measurements?.longTasks.length ?? 0,
      longTaskDurationMs: measurements?.longTasks.reduce((total, value) => total + value, 0) ?? 0,
      jsHeapUsedBytes: heap ?? null,
    };
  }, wallClockMs);
}

async function runNavigation(page: Page, action: () => Promise<unknown>): Promise<NavigationMetrics> {
  const start = Date.now();
  await action();
  await page.locator('#daily-teaching h1').waitFor({ state: 'visible' });
  await page.evaluate(() => new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  return readNavigationMetrics(page, Date.now() - start);
}

async function measureClick(page: Page, selector: string, expectedSelector: string): Promise<number> {
  const start = await page.evaluate(() => performance.now());
  await page.locator(selector).first().click();
  await page.locator(expectedSelector).waitFor({ state: 'visible' });
  return page.evaluate(startTime => performance.now() - startTime, start);
}

async function seedOnboardedState(page: Page): Promise<void> {
  await addTopFrameInitScript(page, (storageKey: string) => {
    localStorage.setItem(storageKey, JSON.stringify({
      onboarded: true,
      appearance: 'system',
      textSize: 'default',
      reminderEnabled: false,
      reminderTime: '08:00',
      explored: [],
      journey: [],
      lastOpened: {
        entryId: 'sabbath-2026-11-03',
        challengeId: 'seven-days-sabbath-2026',
        openedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      },
      resumeDismissedDate: '',
    }));
  }, STORAGE_KEY);
}

async function runOnce(browser: Browser, baseUrl: string, environment: Environment): Promise<RunResult> {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  try {
    const page = await context.newPage();
    const session = await context.newCDPSession(page);
    await session.send('Emulation.setCPUThrottlingRate', { rate: environment.cpuRate });
    if (environment.network) {
      await session.send('Network.enable');
      await session.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: environment.network.latency,
        downloadThroughput: environment.network.download,
        uploadThroughput: environment.network.upload,
        connectionType: 'cellular3g',
      });
    }
    await installBrowserObservers(page);

    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const requestFailures: string[] = [];
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('requestfailed', request => {
      requestFailures.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`);
    });

    await seedOnboardedState(page);

    const initialLoad = await runNavigation(page, () => page.goto(baseUrl, { waitUntil: 'load' }));
    const repeatLoad = await runNavigation(page, () => page.reload({ waitUntil: 'load' }));

    const resumeOpenMs = await measureClick(page, '.resume-card button:has-text("Return")', '#daily-teaching h1');
    await page.waitForFunction(({ storageKey, entryId }) => {
      const state = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
      return state.lastOpened?.entryId === entryId;
    }, { storageKey: STORAGE_KEY, entryId: 'sabbath-2026-11-03' });

    const navigationToArchiveMs = await measureClick(
      page,
      '.app-shell nav button:visible:has-text("Archive")',
      '.archive-page',
    );
    const articleOpenStart = await page.evaluate(() => performance.now());
    await page.locator('.archive-row').first().click();
    await page.locator('#daily-teaching h1').waitFor({ state: 'visible' });
    const archiveChallengeOpenMs = await page.evaluate(start => performance.now() - start, articleOpenStart);

    const scrollDistancePx = await page.evaluate(() => Math.max(
      0,
      document.documentElement.scrollHeight - window.innerHeight,
    ));
    const longTasksBeforeScroll = await page.evaluate(() => {
      const measurements = (window as Window & {
        __r21Measurements?: { longTasks: number[] };
      }).__r21Measurements;
      return measurements?.longTasks.length ?? 0;
    });
    const scrollStart = await page.evaluate(() => performance.now());
    let scrollSteps = 0;
    while (scrollSteps < 40) {
      const scrollY = await page.evaluate(() => window.scrollY);
      if (scrollY >= scrollDistancePx) break;
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(40);
      scrollSteps += 1;
    }
    const scrollMs = await page.evaluate(start => performance.now() - start, scrollStart);
    await page.evaluate(() => new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
    const scrollLongTaskCount = await page.evaluate(previousCount => {
      const measurements = (window as Window & {
        __r21Measurements?: { longTasks: number[] };
      }).__r21Measurements;
      return Math.max(0, (measurements?.longTasks.length ?? previousCount) - previousCount);
    }, longTasksBeforeScroll);
    const scrollLongTaskDurationMs = await page.evaluate(previousCount => {
      const measurements = (window as Window & {
        __r21Measurements?: { longTasks: number[] };
      }).__r21Measurements;
      return (measurements?.longTasks.slice(previousCount) ?? []).reduce((total, value) => total + value, 0);
    }, longTasksBeforeScroll);
    const renderedParagraphs = await page.locator('#daily-teaching p').count();

    return {
      initialLoad,
      repeatLoad,
      navigationToArchiveMs,
      resumeOpenMs,
      archiveChallengeOpenMs,
      scrollMs,
      scrollDistancePx,
      scrollLongTaskCount,
      scrollLongTaskDurationMs,
      renderedParagraphs,
      consoleErrors,
      pageErrors,
      requestFailures,
    };
  } finally {
    await context.close();
  }
}

async function runNetworkInterruptionCheck(browser: Browser, baseUrl: string): Promise<NetworkInterruptionCheck> {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  try {
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    await page.route('https://fonts.googleapis.com/**', route => route.abort('failed'));
    await page.route('https://fonts.gstatic.com/**', route => route.abort('failed'));

    const session = await context.newCDPSession(page);
    await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await session.send('Network.enable');
    await session.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: 200 * 1024,
      uploadThroughput: 96 * 1024,
      connectionType: 'cellular3g',
    });

    await seedOnboardedState(page);
    await page.goto(baseUrl, { waitUntil: 'load' });
    await page.locator('#daily-teaching h1').waitFor({ state: 'visible' });
    const blockedExternalFontFallbackReadable = await page.locator('#daily-teaching h1').isVisible();

    // Simulate abrupt loss of network after initial bundle load.
    await context.setOffline(true);
    await page.locator('.app-shell nav button:visible:has-text("Archive")').first().click();
    await page.locator('.archive-page').waitFor({ state: 'visible' });
    await page.locator('.archive-row').first().click();
    await page.locator('#daily-teaching h1').waitFor({ state: 'visible' });

    const openedTeachingTitle = (await page.locator('#daily-teaching h1').textContent())?.trim() ?? null;
    const renderedParagraphs = await page.locator('#daily-teaching p').count();

    return {
      scenario: '4x CPU + 3G constrained initial load with blocked external fonts, then offline Archive -> Teaching navigation',
      contentSource: 'bundled-historical-prototype-in-js',
      serverBackedChallengeVerified: false,
      offlineNavigationSucceeded: Boolean(openedTeachingTitle) && renderedParagraphs > 0 && pageErrors.length === 0,
      openedTeachingTitle,
      renderedParagraphs,
      blockedExternalFontFallbackReadable,
      pageErrors,
      note: 'Historical prototype teachings are statically bundled in the public JS entry, so Archive reading continues offline once loaded. This does NOT validate live server-backed Gateway Challenge fetches; see tests/performance/network-interruption.test.ts for isolated Gateway request failure and Retry verification.',
    };
  } finally {
    await context.close();
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function summarizeValues(values: Array<number | null>): SummaryMetric {
  const available = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return {
    median: available.length > 0 ? median(available) : null,
    min: available.length > 0 ? Math.min(...available) : null,
    max: available.length > 0 ? Math.max(...available) : null,
    availableSamples: available.length,
    samples: values,
  };
}

function summarize(results: RunResult[]): Record<string, SummaryMetric> {
  const selectors: Array<[string, (result: RunResult) => number | null]> = [
    ['cold load wall-clock ms', result => result.initialLoad.wallClockMs],
    ['repeat load wall-clock ms', result => result.repeatLoad.wallClockMs],
    ['navigation to Archive ms', result => result.navigationToArchiveMs],
    ['resume open ms', result => result.resumeOpenMs],
    ['Archive Challenge open ms', result => result.archiveChallengeOpenMs],
    ['full-page scroll ms', result => result.scrollMs],
    ['cold FCP ms', result => result.initialLoad.firstContentfulPaintMs],
    ['repeat FCP ms', result => result.repeatLoad.firstContentfulPaintMs],
    ['cold LCP ms', result => result.initialLoad.largestContentfulPaintMs],
    ['repeat LCP ms', result => result.repeatLoad.largestContentfulPaintMs],
    ['cold domContentLoaded ms', result => result.initialLoad.domContentLoadedMs],
    ['cold loadEvent ms', result => result.initialLoad.loadEventMs],
    ['cold same-origin transfer bytes', result => result.initialLoad.sameOriginTransferBytes],
    ['cold JS+CSS transfer bytes', result => result.initialLoad.sameOriginJavaScriptCssBytes],
    ['repeat same-origin transfer bytes', result => result.repeatLoad.sameOriginTransferBytes],
    ['cold long-task count', result => result.initialLoad.longTaskCount],
    ['cold long-task duration ms', result => result.initialLoad.longTaskDurationMs],
    ['scroll long-task count', result => result.scrollLongTaskCount],
    ['scroll long-task duration ms', result => result.scrollLongTaskDurationMs],
    ['cold JS heap used bytes', result => result.initialLoad.jsHeapUsedBytes],
    ['rendered paragraphs', result => result.renderedParagraphs],
  ];

  return Object.fromEntries(
    selectors.map(([name, select]) => [name, summarizeValues(results.map(select))]),
  );
}

async function writeFileEnsuringDir(targetPath: string, content: string): Promise<void> {
  const resolved = path.resolve(targetPath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, content, 'utf8');
}

async function main() {
  if (!Number.isInteger(RUNS) || RUNS < 1) {
    throw new Error(`PERF_RUNS must be a positive integer; received "${process.env.PERF_RUNS}"`);
  }
  const cli = parseCliArgs(process.argv.slice(2));
  const build = await inspectBuild().catch(() => {
    throw new Error('No usable dist/index.html found. Run "npm run build" first.');
  });

  const started = await startPreviewServer({ port: PREFERRED_PORT }).catch(() => startPreviewServer());
  let browser: Browser | undefined;

  const cleanupSignal = async () => {
    try {
      await browser?.close();
    } finally {
      await stopPreviewServer(started.server);
    }
    process.exit(130);
  };
  process.once('SIGINT', cleanupSignal);
  process.once('SIGTERM', cleanupSignal);

  try {
    browser = await chromium.launch({ headless: true });
    const results: R21EnvironmentResult[] = [];
    for (const environment of environments) {
      const runs: RunResult[] = [];
      for (let run = 0; run < RUNS; run += 1) {
        runs.push(await runOnce(browser, started.baseUrl, environment));
      }
      results.push({
        environment: {
          name: environment.name,
          viewport: '390x844 CSS px, touch enabled, device scale factor 1',
          cpuThrottlingRate: environment.cpuRate,
          network: environment.network
            ? {
                latencyMs: environment.network.latency,
                downloadKbps: Math.round(environment.network.download * 8 / 1000),
                uploadKbps: Math.round(environment.network.upload * 8 / 1000),
              }
            : 'No explicit CPU/network throttling',
        },
        summary: summarize(runs),
        runs,
      });
    }

    const networkInterruptionCheck = await runNetworkInterruptionCheck(browser, started.baseUrl);
    const git = readGitMetadata();
    const report: R21BaselineReport = {
      schemaVersion: 'r21-baseline-v1',
      measuredAt: new Date().toISOString(),
      gitCommitSha: git.sha,
      gitBranch: git.branch,
      gitDirty: git.dirty,
      note: 'Desktop Chromium mobile-viewport emulation only; not Android hardware or Capacitor WebView evidence.',
      browserVersion: browser.version(),
      runtime: {
        nodeVersion: process.version,
        browserName: 'chromium',
        browserVersion: browser.version(),
      },
      host: readUnprivilegedHostInfo(),
      runCountPerEnvironment: RUNS,
      productionBuild: build,
      results,
      networkInterruptionCheck,
    };

    const jsonOutput = `${JSON.stringify(report, null, 2)}\n`;
    if (cli.jsonOut) {
      await writeFileEnsuringDir(cli.jsonOut, jsonOutput);
    }
    if (cli.mdOut) {
      const markdown = renderR21BaselineMarkdown(report);
      await writeFileEnsuringDir(cli.mdOut, markdown);
    }
    if (!cli.quiet) {
      process.stdout.write(jsonOutput);
    }
  } finally {
    process.off('SIGINT', cleanupSignal);
    process.off('SIGTERM', cleanupSignal);
    try {
      await browser?.close();
    } finally {
      await stopPreviewServer(started.server);
    }
  }
}

main().catch(error => {
  console.error(`Performance baseline failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
