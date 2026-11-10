import { chromium, type Browser, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createServer } from 'node:net';
import { gzipSync } from 'node:zlib';

const HOST = '127.0.0.1';
const PORT = 4174;
const BASE_URL = `http://${HOST}:${PORT}`;
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

type NavigationMetrics = {
  wallClockMs: number;
  domContentLoadedMs: number;
  loadEventMs: number;
  firstContentfulPaintMs: number | null;
  largestContentfulPaintMs: number | null;
  sameOriginTransferBytes: number;
  sameOriginJavaScriptCssBytes: number;
  externalFontResources: string[];
  longTaskCount: number;
  longTaskDurationMs: number;
  jsHeapUsedBytes: number | null;
};

type RunResult = {
  initialLoad: NavigationMetrics;
  repeatLoad: NavigationMetrics;
  navigationToArchiveMs: number;
  resumeOpenMs: number;
  archiveChallengeOpenMs: number;
  scrollMs: number;
  scrollDistancePx: number;
  scrollLongTaskCount: number;
  scrollLongTaskDurationMs: number;
  renderedParagraphs: number;
  consoleErrors: string[];
  pageErrors: string[];
  requestFailures: string[];
};

async function waitForServer(server: ChildProcess): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`Preview server exited before becoming ready (${server.exitCode})`);
    }
    try {
      const response = await fetch(BASE_URL);
      if (response.ok) return;
    } catch {
      // The preview server may need a moment to bind its port.
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Preview server did not become ready at ${BASE_URL}`);
}

async function startPreviewServer(): Promise<ChildProcess> {
  const portProbe = createServer();
  await new Promise<void>((resolve, reject) => {
    portProbe.once('error', reject);
    portProbe.listen(PORT, HOST, () => {
      portProbe.close(error => error ? reject(error) : resolve());
    });
  });
  const viteCli = path.resolve('node_modules/vite/bin/vite.js');
  const server = spawn(process.execPath, [
    viteCli,
    'preview',
    '--host',
    HOST,
    '--port',
    String(PORT),
    '--strictPort',
  ], { stdio: 'ignore' });
  try {
    await waitForServer(server);
  } catch (error) {
    server.kill('SIGTERM');
    throw error;
  }
  return server;
}

async function stopPreviewServer(server: ChildProcess): Promise<void> {
  if (server.exitCode !== null || server.signalCode !== null) return;
  server.kill('SIGTERM');
  await new Promise<void>(resolve => {
    server.once('exit', () => resolve());
    setTimeout(resolve, 2_000);
  });
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(entries.map(entry => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
  }));
  return paths.flat();
}

async function inspectBuild() {
  const outputDirectory = path.resolve('dist');
  const files = await listFiles(outputDirectory);
  const index = await fs.readFile(path.join(outputDirectory, 'index.html'), 'utf8');
  const entryPaths = [
    ...index.matchAll(/<script[^>]+src="([^"]+)"/g),
    ...index.matchAll(/<link[^>]+href="([^"]+\.css)"/g),
  ].map(match => path.join(outputDirectory, match[1].replace(/^\.\//, '')));
  const entryFiles = await Promise.all(entryPaths.map(async file => ({
    file: path.relative(outputDirectory, file),
    bytes: (await fs.stat(file)).size,
    gzipBytes: gzipSync(await fs.readFile(file)).byteLength,
  })));
  const fileSizes = await Promise.all(files.map(async file => ({
    file,
    bytes: (await fs.stat(file)).size,
  })));
  return {
    totalDistBytes: fileSizes.reduce((sum, file) => sum + file.bytes, 0),
    allFiles: fileSizes.map(file => ({
      file: path.relative(outputDirectory, file.file),
      bytes: file.bytes,
    })),
    initialEntryAssets: entryFiles,
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
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
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

async function runOnce(browser: Browser, environment: Environment): Promise<RunResult> {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
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

  await page.addInitScript(storageKey => {
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

  const initialLoad = await runNavigation(page, () => page.goto(BASE_URL, { waitUntil: 'load' }));
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

  const result = {
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
  await context.close();
  return result;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function summarize(results: RunResult[]) {
  const optionalMedian = (values: Array<number | null>) => {
    const available = values.filter((value): value is number => value !== null);
    return {
      median: available.length > 0 ? median(available) : null,
      availableSamples: available.length,
      samples: values,
    };
  };
  const metrics = [
    ['cold load wall-clock ms', result => result.initialLoad.wallClockMs],
    ['repeat load wall-clock ms', result => result.repeatLoad.wallClockMs],
    ['navigation to Archive ms', result => result.navigationToArchiveMs],
    ['resume open ms', result => result.resumeOpenMs],
    ['Archive Challenge open ms', result => result.archiveChallengeOpenMs],
    ['full-page scroll ms', result => result.scrollMs],
  ];
  const regularMetrics = Object.fromEntries(metrics.map(([name, select]) => [
    name,
    {
      median: median(results.map(result => select(result))),
      samples: results.map(result => select(result)),
    },
  ]));
  return {
    ...regularMetrics,
    'cold FCP ms': optionalMedian(results.map(result => result.initialLoad.firstContentfulPaintMs)),
    'repeat FCP ms': optionalMedian(results.map(result => result.repeatLoad.firstContentfulPaintMs)),
  };
}

async function main() {
  if (!Number.isInteger(RUNS) || RUNS < 1) {
    throw new Error(`PERF_RUNS must be a positive integer; received "${process.env.PERF_RUNS}"`);
  }
  const build = await inspectBuild().catch(() => {
    throw new Error('No usable dist/index.html found. Run "npm run build" first.');
  });
  const server = await startPreviewServer();
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const results = [];
    for (const environment of environments) {
      const runs: RunResult[] = [];
      for (let run = 0; run < RUNS; run += 1) {
        runs.push(await runOnce(browser, environment));
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
    console.log(JSON.stringify({
      note: 'Desktop Chromium mobile-viewport emulation only; not Android hardware testing.',
      browserVersion: browser.version(),
      runCountPerEnvironment: RUNS,
      productionBuild: build,
      results,
    }, null, 2));
  } finally {
    await browser?.close();
    await stopPreviewServer(server);
  }
}

main().catch(error => {
  console.error(`Performance baseline failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
