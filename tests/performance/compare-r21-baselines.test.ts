import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import {
  BaselineValidationError,
  compareBaselines,
  formatComparisonMarkdown,
  parseBaselineDocument,
} from '../../scripts/performance/compare-r21-baselines.ts';

const execFileAsync = promisify(execFile);

function makeSampleBaseline(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 'r21-baseline-v1',
    measuredAt: '2026-11-12T05:00:00.000Z',
    gitCommitSha: '8e3abfc145df742f86cb916cb729799d15f58aad',
    browserVersion: '156.0.8078.4',
    runtime: {
      nodeVersion: 'v24.22.1',
      browserName: 'chromium',
      browserVersion: '156.0.8078.4',
    },
    host: {
      platform: 'linux',
      arch: 'x64',
      cpuModel: 'Intel(R) Core(TM) i5-6500 CPU @ 3.20GHz',
      logicalCpuCount: 4,
      totalMemoryMb: 32000,
    },
    runCountPerEnvironment: 3,
    productionBuild: {
      totalDistBytes: 630000,
      fileCount: 12,
      initialEntryAssets: [
        { file: 'assets/index-main.js', bytes: 378000, gzipBytes: 119000 },
        { file: 'assets/index-main.css', bytes: 142000, gzipBytes: 23600 },
      ],
    },
    results: [
      {
        environment: {
          name: 'unthrottled',
          viewport: '390x844 CSS px, touch enabled, device scale factor 1',
          cpuThrottlingRate: 1,
          network: 'No explicit CPU/network throttling',
        },
        summary: {
          'cold load wall-clock ms': { median: 200, samples: [190, 200, 220], availableSamples: 3 },
          'cold FCP ms': { median: 160, samples: [150, 160, 180], availableSamples: 3 },
          'repeat load wall-clock ms': { median: 90, samples: [85, 90, 95], availableSamples: 3 },
        },
        runs: [],
      },
      {
        environment: {
          name: 'constrained',
          viewport: '390x844 CSS px, touch enabled, device scale factor 1',
          cpuThrottlingRate: 4,
          network: { latencyMs: 150, downloadKbps: 1638, uploadKbps: 786 },
        },
        summary: {
          'cold load wall-clock ms': { median: 1500, samples: [1450, 1500, 1600], availableSamples: 3 },
          'cold FCP ms': { median: 1400, samples: [1350, 1400, 1500], availableSamples: 3 },
          'repeat load wall-clock ms': { median: 550, samples: [540, 550, 570], availableSamples: 3 },
        },
        runs: [],
      },
    ],
    ...overrides,
  };
}

test('compares two valid baselines deterministically and remains nonfatal advisory by default', () => {
  const base = makeSampleBaseline();
  const candidate = makeSampleBaseline({
    productionBuild: {
      totalDistBytes: 640000,
      fileCount: 12,
      initialEntryAssets: [
        { file: 'assets/index-main.js', bytes: 388000, gzipBytes: 122000 },
        { file: 'assets/index-main.css', bytes: 142000, gzipBytes: 23600 },
      ],
    },
    results: [
      {
        environment: {
          name: 'unthrottled',
          viewport: '390x844 CSS px, touch enabled, device scale factor 1',
          cpuThrottlingRate: 1,
          network: 'No explicit CPU/network throttling',
        },
        summary: {
          'cold load wall-clock ms': { median: 220, samples: [210, 220, 240], availableSamples: 3 },
          'cold FCP ms': { median: 180, samples: [170, 180, 190], availableSamples: 3 },
          'repeat load wall-clock ms': { median: 90, samples: [85, 90, 95], availableSamples: 3 },
        },
        runs: [],
      },
      {
        environment: {
          name: 'constrained',
          viewport: '390x844 CSS px, touch enabled, device scale factor 1',
          cpuThrottlingRate: 4,
          network: { latencyMs: 150, downloadKbps: 1638, uploadKbps: 786 },
        },
        summary: {
          'cold load wall-clock ms': { median: 1800, samples: [1700, 1800, 1900], availableSamples: 3 },
          'cold FCP ms': { median: 1650, samples: [1600, 1650, 1750], availableSamples: 3 },
          'repeat load wall-clock ms': { median: 550, samples: [540, 550, 570], availableSamples: 3 },
        },
        runs: [],
      },
    ],
  });

  const report = compareBaselines(base, candidate, {
    baseLabel: 'before.json',
    candidateLabel: 'after.json',
  });

  assert.equal(report.budgetApprovalStatus, 'UNAPPROVED_ADVISORY_ONLY');
  assert.equal(report.exitCode, 0);
  assert.equal(report.thresholdEvaluation, null);
  assert.equal(report.flags.length, 0);

  const jsGzip = report.buildComparison.find(row => row.key === 'initialJsGzipBytes');
  assert.equal(jsGzip?.delta, 3000);
  assert.equal(jsGzip?.status, 'compared');

  const constrained = report.environmentComparisons.find(e => e.environment === 'constrained');
  assert.equal(constrained?.comparableConditions, true);
  const coldLoad = constrained?.metrics.find(m => m.key === 'cold load wall-clock ms');
  assert.equal(coldLoad?.unit, 'ms');
  assert.equal(coldLoad?.delta, 300);
  assert.equal(coldLoad?.percentDelta, 20);

  const markdown = formatComparisonMarkdown(report);
  assert.match(markdown, /Advisory comparison only/i);
  assert.match(markdown, /\+300 ms \(\+20\.0%\)/);
  assert.equal(formatComparisonMarkdown(report), markdown);
});

test('handles null metrics, partial samples, and zero samples without coercing to zero', () => {
  const base = makeSampleBaseline();
  const candidate = makeSampleBaseline({
    runCountPerEnvironment: 0,
    results: [
      {
        environment: {
          name: 'unthrottled',
          viewport: '390x844 CSS px, touch enabled, device scale factor 1',
          cpuThrottlingRate: 1,
          network: 'No explicit CPU/network throttling',
        },
        summary: {
          'cold load wall-clock ms': { median: null, samples: [], availableSamples: 0 },
          'cold FCP ms': { median: null, samples: [null, null], availableSamples: 0 },
          'repeat load wall-clock ms': { median: 90, samples: [90, null, 95], availableSamples: 2 },
        },
        runs: [],
      },
      {
        environment: {
          name: 'constrained',
          viewport: '390x844 CSS px, touch enabled, device scale factor 1',
          cpuThrottlingRate: 4,
          network: { latencyMs: 150, downloadKbps: 1638, uploadKbps: 786 },
        },
        summary: {
          'cold load wall-clock ms': { median: null, samples: [], availableSamples: 0 },
          'cold FCP ms': { median: null, samples: [], availableSamples: 0 },
          'repeat load wall-clock ms': { median: 550, samples: [540, 550, 570], availableSamples: 3 },
        },
        runs: [],
      },
    ],
  });

  const report = compareBaselines(base, candidate);
  assert.equal(report.exitCode, 0);
  assert.ok(report.flags.some(flag => flag.code === 'zero-samples'));
  assert.ok(report.flags.some(flag => flag.code === 'missing-samples'));

  const unthrottled = report.environmentComparisons.find(e => e.environment === 'unthrottled');
  const coldLoad = unthrottled?.metrics.find(m => m.key === 'cold load wall-clock ms');
  assert.equal(coldLoad?.status, 'missing-candidate');
  assert.equal(coldLoad?.candidateMedian, null);
  assert.equal(coldLoad?.delta, null);

  const fcp = unthrottled?.metrics.find(m => m.key === 'cold FCP ms');
  assert.equal(fcp?.status, 'missing-candidate');
  assert.equal(fcp?.delta, null);

  const repeatLoad = unthrottled?.metrics.find(m => m.key === 'repeat load wall-clock ms');
  assert.equal(repeatLoad?.status, 'compared');
  assert.match(repeatLoad?.note ?? '', /partial samples/);
});

test('handles missing and malformed inputs safely', () => {
  assert.throws(() => parseBaselineDocument(null, 'bad'), BaselineValidationError);
  assert.throws(() => parseBaselineDocument({ productionBuild: {} }, 'bad'), BaselineValidationError);

  const base = makeSampleBaseline();
  const malformedCandidate = {
    browserVersion: '156.0.8078.4',
    runCountPerEnvironment: 3,
    results: [
      {
        environment: {
          name: 'unthrottled',
          viewport: '390x844 CSS px, touch enabled, device scale factor 1',
          cpuThrottlingRate: 1,
          network: 'No explicit CPU/network throttling',
        },
        summary: {
          'cold load wall-clock ms': { median: 'fast', samples: ['fast', 200] },
          'cold FCP ms': 'not-an-object',
        },
        runs: [],
      },
    ],
  };

  const report = compareBaselines(base, malformedCandidate);
  assert.equal(report.exitCode, 0);
  assert.ok(report.flags.some(flag => flag.code === 'malformed-metric'));
  assert.ok(report.flags.some(flag => flag.code === 'missing-environment' && flag.environment === 'constrained'));

  const unthrottled = report.environmentComparisons.find(e => e.environment === 'unthrottled');
  const coldLoad = unthrottled?.metrics.find(m => m.key === 'cold load wall-clock ms');
  assert.equal(coldLoad?.status, 'malformed');
  assert.equal(coldLoad?.delta, null);
});

test('flags differing browsers, host machines, run counts, and throttling conditions', () => {
  const base = makeSampleBaseline();
  const different = makeSampleBaseline({
    browserVersion: '157.0.9999.1',
    runtime: {
      nodeVersion: 'v22.14.0',
      browserName: 'chromium',
      browserVersion: '157.0.9999.1',
    },
    host: {
      platform: 'linux',
      arch: 'arm64',
      cpuModel: 'ARM Cortex-A53',
      logicalCpuCount: 8,
      totalMemoryMb: 2048,
    },
    runCountPerEnvironment: 5,
    results: [
      {
        environment: {
          name: 'unthrottled',
          viewport: '390x844 CSS px, touch enabled, device scale factor 1',
          cpuThrottlingRate: 1,
          network: 'No explicit CPU/network throttling',
        },
        summary: {
          'cold load wall-clock ms': { median: 400, samples: [380, 390, 400, 410, 420], availableSamples: 5 },
        },
        runs: [],
      },
      {
        environment: {
          name: 'constrained',
          viewport: '390x844 CSS px, touch enabled, device scale factor 1',
          cpuThrottlingRate: 6,
          network: { latencyMs: 300, downloadKbps: 750, uploadKbps: 250 },
        },
        summary: {
          'cold load wall-clock ms': { median: 2900, samples: [2800, 2850, 2900, 2950, 3000], availableSamples: 5 },
        },
        runs: [],
      },
    ],
  });

  const report = compareBaselines(base, different);
  assert.equal(report.exitCode, 0);

  const codes = new Set(report.flags.map(flag => flag.code));
  assert.ok(codes.has('browser-mismatch'));
  assert.ok(codes.has('node-mismatch'));
  assert.ok(codes.has('host-mismatch'));
  assert.ok(codes.has('run-count-mismatch'));
  assert.ok(codes.has('environment-condition-mismatch'));

  for (const envComp of report.environmentComparisons) {
    assert.equal(envComp.comparableConditions, false);
  }
});

test('evaluates optional locally supplied unapproved draft thresholds only when provided', () => {
  const base = makeSampleBaseline();
  const candidate = makeSampleBaseline({
    productionBuild: {
      totalDistBytes: 640000,
      fileCount: 12,
      initialEntryAssets: [
        { file: 'assets/index-main.js', bytes: 390000, gzipBytes: 135000 },
        { file: 'assets/index-main.css', bytes: 142000, gzipBytes: 23600 },
      ],
    },
    results: [
      {
        environment: {
          name: 'unthrottled',
          viewport: '390x844 CSS px, touch enabled, device scale factor 1',
          cpuThrottlingRate: 1,
          network: 'No explicit CPU/network throttling',
        },
        summary: {
          'cold load wall-clock ms': { median: 200, samples: [190, 200, 220], availableSamples: 3 },
        },
        runs: [],
      },
      {
        environment: {
          name: 'constrained',
          viewport: '390x844 CSS px, touch enabled, device scale factor 1',
          cpuThrottlingRate: 4,
          network: { latencyMs: 150, downloadKbps: 1638, uploadKbps: 786 },
        },
        summary: {
          'cold load wall-clock ms': { median: 2300, samples: [2200, 2300, 2400], availableSamples: 3 },
        },
        runs: [],
      },
    ],
  });

  // Without thresholds config, comparison stays nonfatal advisory
  const advisory = compareBaselines(base, candidate);
  assert.equal(advisory.exitCode, 0);
  assert.equal(advisory.thresholdEvaluation, null);

  // With locally supplied draft config, breaches are reported as unapproved draft limits
  const gated = compareBaselines(base, candidate, {
    thresholdsConfig: {
      label: 'Local scratch budget experiment',
      maxInitialJsGzipBytes: 130000,
      environments: {
        constrained: {
          'cold load wall-clock ms': { maxMedian: 2000, maxDelta: 500 },
        },
      },
    },
  });

  assert.equal(gated.exitCode, 1);
  assert.ok(gated.thresholdEvaluation);
  assert.equal(gated.thresholdEvaluation.passed, false);
  assert.match(gated.thresholdEvaluation.notice, /NOT AN APPROVED PERFORMANCE BUDGET/i);
  assert.equal(gated.thresholdEvaluation.breaches.length, 3);
});

test('CLI compares two baseline JSON files and writes deterministic markdown', async t => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bibleberry-r21-cmp-'));
  t.after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const basePath = path.join(tempDir, 'base.json');
  const candPath = path.join(tempDir, 'candidate.json');
  const outPath = path.join(tempDir, 'report.md');

  await fs.writeFile(basePath, JSON.stringify(makeSampleBaseline()), 'utf8');
  await fs.writeFile(candPath, JSON.stringify(makeSampleBaseline()), 'utf8');

  const scriptPath = path.resolve('scripts/performance/compare-r21-baselines.ts');
  const { stdout } = await execFileAsync(process.execPath, [
    '--experimental-strip-types',
    scriptPath,
    basePath,
    candPath,
    '--format',
    'md',
    '--out',
    outPath,
  ]);

  const written = await fs.readFile(outPath, 'utf8');
  assert.equal(stdout, written);
  assert.match(written, /# R21 Performance Baseline Comparison \(Advisory\)/);
  assert.match(written, /conditions matched/);
});
