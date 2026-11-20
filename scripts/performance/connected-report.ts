import { z } from 'zod';
import { CONNECTED_FLAGS } from './connected-build.ts';
import {
  CHALLENGE_PATH, FIXTURE_TIME, FIXTURE_TIME_ZONE, FOCUS_MONTH, HISTORICAL_MONTH, READING_BLOCKS,
} from './connected-fixtures.ts';

const timingNames = [
  'coldTodayMs', 'repeatTodayMs', 'openFocusMonthMs', 'challengeFailureMs', 'challengeRetryMs',
  'advanceChallengeMs', 'returnToMonthMs', 'returnToTodayMs', 'openArchiveMs', 'openLibraryMs',
  'openHistoricalMonthMs', 'returnToLibraryMs', 'addToShelfMs', 'openShelfMs', 'reloadShelfMs',
  'reopenTodayMs', 'resumeChallengeMs',
] as const;

const requiredGatewayResponses = [
  'GET /api/challenges',
  `GET ${CHALLENGE_PATH}`,
  'GET /api/news?category=monthlyPreview',
  'GET /api/library/months?limit=12',
  `GET /api/months/${FOCUS_MONTH}`,
  `POST /api/months/${FOCUS_MONTH}/progress`,
  `GET /api/months/${HISTORICAL_MONTH}`,
  `POST /api/months/${HISTORICAL_MONTH}/progress`,
] as const;

const positive = z.number().positive();
const count = z.number().int().nonnegative();
const asset = z.object({ path: z.string().startsWith('/'), transferBytes: count, encodedBodyBytes: count });
const snapshot = z.object({
  documentTransferBytes: z.number().int().positive(),
  fcpMs: positive.nullable(),
  lcpMs: positive.nullable(),
  longTaskCount: count,
  longTaskDurationMs: z.number().nonnegative(),
  staticAssets: z.array(asset).min(1),
});
const sample = z.object({
  timings: z.record(z.enum(timingNames), positive),
  cold: snapshot,
  repeat: snapshot,
  throughShelf: snapshot,
  throughResume: snapshot,
  readingParagraphs: z.literal(READING_BLOCKS),
  readingHeightPx: z.number().int().gt(844),
  calendarDays: z.tuple([z.literal(31), z.literal(30)]),
  persistedScreen: z.literal('closing'),
  persistedShelfMonth: z.literal(HISTORICAL_MONTH),
  gatewayResponses: z.record(z.enum(requiredGatewayResponses), z.number().int().positive()),
  challengeAttempts: z.tuple([z.literal('interrupted'), z.literal('served'), z.literal('served')]),
  blockedStylesheets: z.number().int().positive(),
  interruptions: z.tuple([z.literal('net::ERR_INTERNET_DISCONNECTED')]),
  requestFailures: z.tuple([]),
  errors: z.tuple([]),
});

const viewport = z.literal('390x844 CSS px, touch enabled, device scale factor 1');
const buildAsset = z.object({ file: z.string().min(1), bytes: count, gzipBytes: count });
const reportSchema = z.object({
  schemaVersion: z.literal('r21-connected-v1'),
  scenario: z.literal('connected'),
  measuredAt: z.iso.datetime(),
  gitCommitSha: z.string().regex(/^[a-f0-9]{40}$/),
  gitBranch: z.string().min(1),
  gitDirty: z.boolean(),
  runtime: z.object({
    nodeVersion: z.string().min(1),
    browserName: z.literal('chromium'),
    browserVersion: z.string().min(1),
  }),
  host: z.object({
    platform: z.string().min(1),
    arch: z.string().min(1),
    osRelease: z.string().min(1),
    cpuModel: z.string().min(1),
    logicalCpuCount: z.number().int().positive(),
    totalMemoryMb: z.number().int().positive(),
  }),
  fixtureDate: z.literal(FIXTURE_TIME),
  timeZone: z.literal(FIXTURE_TIME_ZONE),
  cacheDisabledByRouting: z.literal(true),
  buildFlags: z.record(z.enum(Object.keys(CONNECTED_FLAGS)), z.literal('true')),
  runCountPerEnvironment: z.number().int().positive(),
  productionBuild: z.object({
    mode: z.literal('production-connected'),
    totalDistBytes: count,
    totalDistGzipBytes: count,
    fileCount: z.number().int().positive(),
    allFiles: z.array(buildAsset).min(1),
    initialEntryAssets: z.array(buildAsset).min(2),
    initialEntryTotals: z.object({
      rawBytes: count, gzipBytes: count,
      jsRawBytes: count, jsGzipBytes: count, cssRawBytes: count, cssGzipBytes: count,
    }),
  }),
  environments: z.tuple([
    z.object({
      environment: z.object({
        name: z.literal('unthrottled'), viewport, cpuThrottlingRate: z.literal(1),
        network: z.literal('No explicit CPU/network throttling'),
      }),
      runs: z.array(sample).min(1),
    }),
    z.object({
      environment: z.object({
        name: z.literal('constrained'), viewport, cpuThrottlingRate: z.literal(4),
        network: z.object({ latencyMs: z.literal(150), downloadKbps: z.literal(1638), uploadKbps: z.literal(786) }),
      }),
      runs: z.array(sample).min(1),
    }),
  ]),
});

export function parseConnectedReport(raw: unknown) {
  const report = reportSchema.parse(raw);
  const { allFiles, initialEntryAssets, fileCount, totalDistBytes, totalDistGzipBytes } = report.productionBuild;
  const buildPaths = new Set(allFiles.map(file => `/${encodeURI(file.file)}`));
  if (buildPaths.size !== fileCount || allFiles.length !== fileCount
      || totalDistBytes !== allFiles.reduce((sum, file) => sum + file.bytes, 0)
      || totalDistGzipBytes !== allFiles.reduce((sum, file) => sum + file.gzipBytes, 0)) {
    throw new Error('Connected production build totals do not match its asset list');
  }
  if (!initialEntryAssets.some(file => file.file.endsWith('.js'))
      || !initialEntryAssets.some(file => file.file.endsWith('.css'))) {
    throw new Error('Connected production build is missing its JS or CSS entry');
  }
  for (const { runs } of report.environments) {
    if (runs.length !== report.runCountPerEnvironment) throw new Error('Connected sample count mismatch');
    for (const run of runs) {
      for (const observation of [run.cold, run.repeat, run.throughShelf, run.throughResume]) {
        const captured = new Set(observation.staticAssets.map(asset => asset.path));
        if ([...captured].some(path => !buildPaths.has(path))
            || initialEntryAssets.some(file => !captured.has(`/${encodeURI(file.file)}`))) {
          throw new Error('Connected asset observations are missing entry assets or contain unknown build paths');
        }
      }
    }
  }
  return report;
}

type ConnectedReport = ReturnType<typeof parseConnectedReport>;

export function connectedTransfers(assets: z.infer<typeof asset>[]) {
  const totals = { js: 0, css: 0, other: 0 };
  for (const asset of assets) {
    const kind = asset.path.endsWith('.js') ? 'js' : asset.path.endsWith('.css') ? 'css' : 'other';
    totals[kind] += asset.transferBytes;
  }
  return totals;
}

function range(values: (number | null)[]) {
  const sorted = values.filter(value => value !== null).sort((a, b) => a - b);
  if (!sorted.length) return `unavailable (0/${values.length})`;
  const median = (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2;
  return `${median.toFixed(1)} (${sorted[0].toFixed(1)}–${sorted.at(-1)?.toFixed(1)}; ${sorted.length}/${values.length})`;
}

export function renderConnectedMarkdown(report: ConnectedReport) {
  const [unthrottled, constrained] = report.environments;
  const lines = [
    '# R21 connected reader measurement',
    '',
    `Measured ${report.measuredAt} from \`${report.gitCommitSha}\` (${report.gitDirty ? 'dirty' : 'clean'}).`,
    `Chromium ${report.runtime.browserVersion}, Node ${report.runtime.nodeVersion}, ${report.host.osRelease} ${report.host.arch} on ${report.host.cpuModel}.`,
    `Build flags ${Object.keys(report.buildFlags).map(flag => flag + '=true').join(', ')}.`,
    '',
    'Desktop Chromium with synthetic gateway fixtures. Routing disables the browser cache.',
    'The prototype comparison tool consumes a different schema.',
    '',
    'Values show median (min–max; available/requested).',
    '',
    '| Measurement | Unthrottled | Constrained (4× CPU, 150 ms, 200/96 KiB/s) |',
    '| --- | ---: | ---: |',
  ];
  const addRows = (name: string, select: (run: ConnectedReport['environments'][0]['runs'][number]) => number | null) => {
    lines.push(`| ${name} | ${range(unthrottled.runs.map(select))} | ${range(constrained.runs.map(select))} |`);
  };
  for (const name of timingNames) addRows(name, run => run.timings[name]);
  for (const stage of ['cold', 'repeat', 'throughShelf', 'throughResume'] as const) {
    addRows(`${stage} document bytes`, run => run[stage].documentTransferBytes);
    for (const kind of ['js', 'css', 'other'] as const) {
      addRows(`${stage} ${kind} transfer bytes`, run => connectedTransfers(run[stage].staticAssets)[kind]);
    }
    addRows(`${stage} long-task count`, run => run[stage].longTaskCount);
    addRows(`${stage} long-task duration (ms)`, run => run[stage].longTaskDurationMs);
    addRows(`${stage} FCP (ms)`, run => run[stage].fcpMs);
    addRows(`${stage} LCP (ms)`, run => run[stage].lcpMs);
  }
  return `${lines.join('\n')}\n`;
}
