import assert from 'node:assert/strict';
import test from 'node:test';
import { CONNECTED_FLAGS } from '../../scripts/performance/connected-build.ts';
import { CHALLENGE_PATH, FIXTURE_TIME, FIXTURE_TIME_ZONE } from '../../scripts/performance/connected-fixtures.ts';
import { parseConnectedReport, renderConnectedMarkdown } from '../../scripts/performance/connected-report.ts';
import { parseBaselineDocument } from '../../scripts/performance/compare-r21-baselines.ts';

function makeReport() {
  const snapshot = {
    documentTransferBytes: 400,
    fcpMs: 25,
    lcpMs: null,
    longTaskCount: 0,
    longTaskDurationMs: 0,
    staticAssets: [
      { path: '/assets/index.js', transferBytes: 600, encodedBodyBytes: 300 },
      { path: '/assets/host.js', transferBytes: 550, encodedBodyBytes: 250 },
      { path: '/assets/index.css', transferBytes: 400, encodedBodyBytes: 100 },
    ],
  };
  const sample = {
    cold: snapshot, repeat: snapshot, throughShelf: snapshot, throughResume: snapshot,
    timings: {
      coldTodayMs: 50, repeatTodayMs: 40, openFocusMonthMs: 15, challengeFailureMs: 12,
      challengeRetryMs: 10, advanceChallengeMs: 5, returnToMonthMs: 5, returnToTodayMs: 10,
      openArchiveMs: 11, openLibraryMs: 12, openHistoricalMonthMs: 20, returnToLibraryMs: 15,
      addToShelfMs: 20, openShelfMs: 12, reloadShelfMs: 40, reopenTodayMs: 12, resumeChallengeMs: 10,
    },
    gatewayResponses: {
      'GET /api/challenges': 3,
      [`GET ${CHALLENGE_PATH}`]: 2,
      'GET /api/news?category=monthlyPreview': 3,
      'GET /api/library/months?limit=12': 2,
      'GET /api/months/2026-10': 4,
      'POST /api/months/2026-10/progress': 2,
      'GET /api/months/2026-09': 2,
      'POST /api/months/2026-09/progress': 1,
    },
    readingParagraphs: 32, readingHeightPx: 3800, calendarDays: [31, 30], blockedStylesheets: 3,
    challengeAttempts: ['interrupted', 'served', 'served'],
    interruptions: ['net::ERR_INTERNET_DISCONNECTED'],
    errors: [] as string[], requestFailures: [] as string[],
    persistedScreen: 'closing', persistedShelfMonth: '2026-09',
  };
  const viewport = '390x844 CSS px, touch enabled, device scale factor 1';
  const initialEntryAssets = [
    { file: 'assets/index.js', bytes: 350, gzipBytes: 300 },
    { file: 'assets/index.css', bytes: 180, gzipBytes: 100 },
  ];

  return structuredClone({
    schemaVersion: 'r21-connected-v1', scenario: 'connected', measuredAt: '2026-11-19T21:00:00Z',
    runtime: { browserName: 'chromium', browserVersion: '150.0.0.0', nodeVersion: 'v24.0.0' },
    host: { platform: 'linux', arch: 'x64', osRelease: 'test', cpuModel: 'test', logicalCpuCount: 2, totalMemoryMb: 2048 },
    gitCommitSha: 'a'.repeat(40), gitBranch: 'test', gitDirty: false,
    fixtureDate: FIXTURE_TIME, timeZone: FIXTURE_TIME_ZONE, cacheDisabledByRouting: true,
    runCountPerEnvironment: 1, buildFlags: CONNECTED_FLAGS,
    productionBuild: {
      mode: 'production-connected', totalDistBytes: 855, totalDistGzipBytes: 650, fileCount: 3,
      allFiles: [...initialEntryAssets, { file: 'assets/host.js', bytes: 325, gzipBytes: 250 }],
      initialEntryAssets,
      initialEntryTotals: { rawBytes: 530, gzipBytes: 400, jsRawBytes: 350, jsGzipBytes: 300, cssRawBytes: 180, cssGzipBytes: 100 },
    },
    environments: [
      { environment: { name: 'unthrottled', viewport, cpuThrottlingRate: 1, network: 'No explicit CPU/network throttling' }, runs: [sample] },
      { environment: { name: 'constrained', viewport, cpuThrottlingRate: 4,
        network: { latencyMs: 150, downloadKbps: 1638, uploadKbps: 786 } }, runs: [sample] },
    ],
  });
}

test('connected reports round-trip and count all eager JS, including the non-entry chunk', () => {
  const report = parseConnectedReport(JSON.parse(JSON.stringify(makeReport())));
  const markdown = renderConnectedMarkdown(report);
  assert.match(markdown, /cold js transfer bytes \| 1150\.0/);
  assert.match(markdown, /cold LCP.*unavailable \(0\/1\)/);
  assert.throws(() => parseBaselineDocument(report), /missing required "results"/);
  assert.throws(() => parseConnectedReport({ ...makeReport(), schemaVersion: 'r21-baseline-v1' }));
});

test('connected reports require both profiles and every requested successful observation', () => {
  const malformed = [
    (report: ReturnType<typeof makeReport>) => { report.runCountPerEnvironment = 0; },
    (report: ReturnType<typeof makeReport>) => { report.runCountPerEnvironment = 2; },
    (report: ReturnType<typeof makeReport>) => { report.environments.pop(); },
    (report: ReturnType<typeof makeReport>) => { report.environments[0].runs = []; },
    (report: ReturnType<typeof makeReport>) => { Reflect.deleteProperty(report.environments[0].runs[0].timings, 'openLibraryMs'); },
    (report: ReturnType<typeof makeReport>) => { Reflect.deleteProperty(report.environments[0].runs[0].cold, 'lcpMs'); },
    (report: ReturnType<typeof makeReport>) => { Reflect.deleteProperty(report.environments[0].runs[0].gatewayResponses, 'GET /api/library/months?limit=12'); },
    (report: ReturnType<typeof makeReport>) => { report.environments[0].runs[0].timings.challengeRetryMs = NaN; },
    (report: ReturnType<typeof makeReport>) => { report.environments[0].runs[0].challengeAttempts.pop(); },
    (report: ReturnType<typeof makeReport>) => { report.environments[0].runs[0].persistedScreen = 'opening'; },
    (report: ReturnType<typeof makeReport>) => { report.environments[0].runs[0].errors.push('Unauthorized Sanity request'); },
    (report: ReturnType<typeof makeReport>) => { report.environments[0].runs[0].requestFailures.push('GET /api/challenges/missing'); },
    (report: ReturnType<typeof makeReport>) => { report.environments[0].runs[0].repeat.staticAssets.pop(); },
  ];
  for (const corrupt of malformed) {
    const report = makeReport();
    corrupt(report);
    assert.throws(() => parseConnectedReport(report));
  }
});
