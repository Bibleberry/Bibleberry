import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

export type MetricUnit = 'ms' | 'bytes' | 'count';

export type NormalizedMetric = {
  key: string;
  unit: MetricUnit;
  median: number | null;
  availableSamples: number;
  totalSamples: number;
  malformed: boolean;
  reason?: string;
};

export type NormalizedEnvironment = {
  name: string;
  viewport: string | null;
  cpuThrottlingRate: number | null;
  network:
    | { latencyMs: number; downloadKbps: number; uploadKbps: number }
    | 'unthrottled'
    | 'unknown';
  metrics: Record<string, NormalizedMetric>;
  errorTotals: {
    consoleErrors: number;
    pageErrors: number;
    requestFailures: number;
  };
};

export type NormalizedBuildMetrics = {
  initialJsRawBytes: number | null;
  initialJsGzipBytes: number | null;
  initialCssRawBytes: number | null;
  initialCssGzipBytes: number | null;
  initialTotalRawBytes: number | null;
  initialTotalGzipBytes: number | null;
  totalDistBytes: number | null;
  fileCount: number | null;
};

export type ParsedBaseline = {
  label: string;
  schemaVersion: string | null;
  measuredAt: string | null;
  gitCommitSha: string | null;
  browserName: string | null;
  browserVersion: string | null;
  nodeVersion: string | null;
  host: {
    platform: string | null;
    arch: string | null;
    cpuModel: string | null;
    logicalCpuCount: number | null;
    totalMemoryMb: number | null;
  } | null;
  runCountPerEnvironment: number | null;
  build: NormalizedBuildMetrics;
  environments: Record<string, NormalizedEnvironment>;
  validationWarnings: string[];
};

export type ComparisonFlagSeverity = 'warning' | 'caution';

export type ComparisonFlag = {
  code:
    | 'browser-mismatch'
    | 'node-mismatch'
    | 'host-mismatch'
    | 'host-unverified'
    | 'run-count-mismatch'
    | 'zero-samples'
    | 'missing-samples'
    | 'missing-environment'
    | 'environment-condition-mismatch'
    | 'malformed-metric';
  severity: ComparisonFlagSeverity;
  environment?: string;
  message: string;
};

export type MetricComparisonStatus =
  | 'compared'
  | 'missing-base'
  | 'missing-candidate'
  | 'missing-both'
  | 'malformed';

export type MetricDelta = {
  key: string;
  unit: MetricUnit;
  status: MetricComparisonStatus;
  baseMedian: number | null;
  candidateMedian: number | null;
  baseAvailableSamples: number;
  baseTotalSamples: number;
  candidateAvailableSamples: number;
  candidateTotalSamples: number;
  delta: number | null;
  percentDelta: number | null;
  note?: string;
};

export type BuildMetricDelta = {
  key: keyof NormalizedBuildMetrics;
  label: string;
  unit: 'bytes' | 'count';
  status: MetricComparisonStatus;
  baseValue: number | null;
  candidateValue: number | null;
  delta: number | null;
  percentDelta: number | null;
};

export type LocalDraftThresholdRule = {
  maxMedian?: number;
  maxDelta?: number;
  maxDeltaPercent?: number;
};

export type LocalDraftThresholdsConfig = {
  label?: string;
  maxInitialJsGzipBytes?: number;
  maxInitialTotalGzipBytes?: number;
  environments?: Record<string, Record<string, LocalDraftThresholdRule>>;
};

export type ThresholdBreach = {
  scope: string;
  metric: string;
  unit: MetricUnit;
  actual: number;
  limit: number;
  rule: string;
};

export type ThresholdEvaluation = {
  notice: string;
  configLabel: string;
  passed: boolean;
  breaches: ThresholdBreach[];
};

export type ComparisonReport = {
  budgetApprovalStatus: 'UNAPPROVED_ADVISORY_ONLY';
  disclaimer: string;
  exitCode: 0 | 1;
  base: {
    label: string;
    measuredAt: string | null;
    gitCommitSha: string | null;
    browserVersion: string | null;
    runCountPerEnvironment: number | null;
  };
  candidate: {
    label: string;
    measuredAt: string | null;
    gitCommitSha: string | null;
    browserVersion: string | null;
    runCountPerEnvironment: number | null;
  };
  flags: ComparisonFlag[];
  buildComparison: BuildMetricDelta[];
  environmentComparisons: Array<{
    environment: string;
    comparableConditions: boolean;
    metrics: MetricDelta[];
  }>;
  thresholdEvaluation: ThresholdEvaluation | null;
};

export class BaselineValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BaselineValidationError';
  }
}

const KNOWN_METRIC_UNITS: Record<string, MetricUnit> = {
  'cold load wall-clock ms': 'ms',
  'repeat load wall-clock ms': 'ms',
  'navigation to Archive ms': 'ms',
  'resume open ms': 'ms',
  'Archive Challenge open ms': 'ms',
  'full-page scroll ms': 'ms',
  'cold FCP ms': 'ms',
  'repeat FCP ms': 'ms',
  'cold LCP ms': 'ms',
  'repeat LCP ms': 'ms',
  'cold domContentLoaded ms': 'ms',
  'cold loadEvent ms': 'ms',
  'cold same-origin transfer bytes': 'bytes',
  'cold JS+CSS transfer bytes': 'bytes',
  'repeat same-origin transfer bytes': 'bytes',
  'cold long-task count': 'count',
  'cold long-task duration ms': 'ms',
  'scroll long-task count': 'count',
  'scroll long-task duration ms': 'ms',
  'cold JS heap used bytes': 'bytes',
  'rendered paragraphs': 'count',
};

const METRIC_DISPLAY_ORDER = Object.keys(KNOWN_METRIC_UNITS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNonNegativeFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function inferMetricUnit(key: string): MetricUnit {
  if (KNOWN_METRIC_UNITS[key]) return KNOWN_METRIC_UNITS[key];
  const lower = key.toLowerCase();
  if (lower.endsWith('bytes') || lower.includes(' bytes')) return 'bytes';
  if (lower.endsWith('count') || lower.includes('paragraphs')) return 'count';
  return 'ms';
}

function computeMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function parseBuildSummary(rawBuild: unknown, warnings: string[], label: string): NormalizedBuildMetrics {
  if (!isRecord(rawBuild)) {
    warnings.push(`${label}: productionBuild section is missing or malformed.`);
    return {
      initialJsRawBytes: null,
      initialJsGzipBytes: null,
      initialCssRawBytes: null,
      initialCssGzipBytes: null,
      initialTotalRawBytes: null,
      initialTotalGzipBytes: null,
      totalDistBytes: null,
      fileCount: null,
    };
  }

  const totalDistBytes = asNonNegativeFiniteNumber(rawBuild.totalDistBytes);
  const allFiles = Array.isArray(rawBuild.allFiles) ? rawBuild.allFiles : null;
  const fileCount =
    asNonNegativeFiniteNumber(rawBuild.fileCount) ?? (allFiles ? allFiles.length : null);

  let initialJsRawBytes: number | null = null;
  let initialJsGzipBytes: number | null = null;
  let initialCssRawBytes: number | null = null;
  let initialCssGzipBytes: number | null = null;
  let initialTotalRawBytes: number | null = null;
  let initialTotalGzipBytes: number | null = null;

  if (isRecord(rawBuild.initialEntryTotals)) {
    const totals = rawBuild.initialEntryTotals;
    initialJsRawBytes = asNonNegativeFiniteNumber(totals.jsRawBytes);
    initialJsGzipBytes = asNonNegativeFiniteNumber(totals.jsGzipBytes);
    initialCssRawBytes = asNonNegativeFiniteNumber(totals.cssRawBytes);
    initialCssGzipBytes = asNonNegativeFiniteNumber(totals.cssGzipBytes);
    initialTotalRawBytes = asNonNegativeFiniteNumber(totals.rawBytes);
    initialTotalGzipBytes = asNonNegativeFiniteNumber(totals.gzipBytes);
  } else if (Array.isArray(rawBuild.initialEntryAssets)) {
    let jsRaw = 0;
    let jsGzip = 0;
    let cssRaw = 0;
    let cssGzip = 0;
    let hasJs = false;
    let hasCss = false;
    let validGzip = true;

    for (const item of rawBuild.initialEntryAssets) {
      if (!isRecord(item) || typeof item.file !== 'string') continue;
      const bytes = asNonNegativeFiniteNumber(item.bytes);
      const gzipBytes = asNonNegativeFiniteNumber(item.gzipBytes);
      if (bytes === null) continue;
      if (gzipBytes === null) validGzip = false;
      if (item.file.endsWith('.js')) {
        hasJs = true;
        jsRaw += bytes;
        if (gzipBytes !== null) jsGzip += gzipBytes;
      } else if (item.file.endsWith('.css')) {
        hasCss = true;
        cssRaw += bytes;
        if (gzipBytes !== null) cssGzip += gzipBytes;
      }
    }
    initialJsRawBytes = hasJs ? jsRaw : null;
    initialJsGzipBytes = hasJs && validGzip ? jsGzip : null;
    initialCssRawBytes = hasCss ? cssRaw : null;
    initialCssGzipBytes = hasCss && validGzip ? cssGzip : null;
    initialTotalRawBytes = hasJs || hasCss ? jsRaw + cssRaw : null;
    initialTotalGzipBytes = (hasJs || hasCss) && validGzip ? jsGzip + cssGzip : null;
  } else {
    warnings.push(`${label}: productionBuild.initialEntryAssets is missing or malformed.`);
  }

  return {
    initialJsRawBytes,
    initialJsGzipBytes,
    initialCssRawBytes,
    initialCssGzipBytes,
    initialTotalRawBytes,
    initialTotalGzipBytes,
    totalDistBytes,
    fileCount,
  };
}

function normalizeSummaryMetric(
  key: string,
  rawValue: unknown,
  defaultTotalSamples: number,
  warnings: string[],
  label: string,
  envName: string,
): NormalizedMetric {
  const unit = inferMetricUnit(key);
  if (!isRecord(rawValue)) {
    warnings.push(`${label} [${envName}] metric "${key}" is malformed (expected object).`);
    return {
      key,
      unit,
      median: null,
      availableSamples: 0,
      totalSamples: defaultTotalSamples,
      malformed: true,
      reason: 'metric entry is not an object',
    };
  }

  const rawSamples = rawValue.samples;
  let totalSamples = defaultTotalSamples;
  let malformed = false;
  let reason: string | undefined;
  const validSamples: number[] = [];

  if (Array.isArray(rawSamples)) {
    totalSamples = rawSamples.length;
    for (const sample of rawSamples) {
      if (sample === null) continue;
      const num = asNonNegativeFiniteNumber(sample);
      if (num === null) {
        malformed = true;
        reason = 'samples array contains non-numeric or negative value';
      } else {
        validSamples.push(num);
      }
    }
  } else if (rawSamples !== undefined) {
    malformed = true;
    reason = 'samples field is not an array';
  }

  const explicitAvailable = asNonNegativeFiniteNumber(rawValue.availableSamples);
  const availableSamples =
    explicitAvailable !== null && Number.isInteger(explicitAvailable)
      ? Math.min(explicitAvailable, totalSamples || explicitAvailable)
      : validSamples.length;

  let median: number | null = null;
  if (rawValue.median === null || rawValue.median === undefined) {
    median = validSamples.length > 0 && rawValue.median === undefined ? computeMedian(validSamples) : null;
  } else {
    const parsedMedian = asNonNegativeFiniteNumber(rawValue.median);
    if (parsedMedian === null) {
      malformed = true;
      reason = 'median is non-finite or non-numeric';
    } else {
      median = parsedMedian;
    }
  }

  if (availableSamples === 0 || totalSamples === 0) {
    median = null;
  }

  if (malformed) {
    warnings.push(`${label} [${envName}] metric "${key}" malformed: ${reason ?? 'invalid value'}.`);
  }

  return {
    key,
    unit,
    median,
    availableSamples,
    totalSamples,
    malformed,
    reason,
  };
}

export function parseBaselineDocument(raw: unknown, label = 'baseline'): ParsedBaseline {
  if (!isRecord(raw)) {
    throw new BaselineValidationError(`${label}: baseline JSON must be a non-null object.`);
  }
  if (!Array.isArray(raw.results)) {
    throw new BaselineValidationError(`${label}: missing required "results" array.`);
  }

  const warnings: string[] = [];
  const runtimeRecord = isRecord(raw.runtime) ? raw.runtime : null;
  const hostRecord = isRecord(raw.host) ? raw.host : null;
  const runCountPerEnvironment = asNonNegativeFiniteNumber(raw.runCountPerEnvironment);
  if (runCountPerEnvironment === null || !Number.isInteger(runCountPerEnvironment)) {
    warnings.push(`${label}: runCountPerEnvironment is missing or invalid.`);
  }

  const environments: Record<string, NormalizedEnvironment> = {};
  for (const entry of raw.results) {
    if (!isRecord(entry)) {
      warnings.push(`${label}: skipped malformed environment result entry.`);
      continue;
    }
    const envSpec = isRecord(entry.environment) ? entry.environment : null;
    const envName = asStringOrNull(envSpec?.name);
    if (!envName) {
      warnings.push(`${label}: skipped environment entry without a valid environment.name.`);
      continue;
    }

    const viewport = asStringOrNull(envSpec?.viewport);
    const cpuThrottlingRate = asNonNegativeFiniteNumber(envSpec?.cpuThrottlingRate);
    let network: NormalizedEnvironment['network'] = 'unknown';
    if (typeof envSpec?.network === 'string') {
      network = 'unthrottled';
    } else if (isRecord(envSpec?.network)) {
      const latencyMs = asNonNegativeFiniteNumber(envSpec.network.latencyMs);
      const downloadKbps = asNonNegativeFiniteNumber(envSpec.network.downloadKbps);
      const uploadKbps = asNonNegativeFiniteNumber(envSpec.network.uploadKbps);
      if (latencyMs !== null && downloadKbps !== null && uploadKbps !== null) {
        network = { latencyMs, downloadKbps, uploadKbps };
      }
    }

    const runs = Array.isArray(entry.runs) ? entry.runs : [];
    const defaultTotalSamples =
      runCountPerEnvironment !== null ? runCountPerEnvironment : runs.length;

    const metrics: Record<string, NormalizedMetric> = {};
    if (isRecord(entry.summary)) {
      for (const [metricKey, metricValue] of Object.entries(entry.summary)) {
        metrics[metricKey] = normalizeSummaryMetric(
          metricKey,
          metricValue,
          defaultTotalSamples,
          warnings,
          label,
          envName,
        );
      }
    } else {
      warnings.push(`${label} [${envName}]: summary object is missing or malformed.`);
    }

    let consoleErrors = 0;
    let pageErrors = 0;
    let requestFailures = 0;
    for (const run of runs) {
      if (!isRecord(run)) continue;
      if (Array.isArray(run.consoleErrors)) consoleErrors += run.consoleErrors.length;
      if (Array.isArray(run.pageErrors)) pageErrors += run.pageErrors.length;
      if (Array.isArray(run.requestFailures)) requestFailures += run.requestFailures.length;
    }

    environments[envName] = {
      name: envName,
      viewport,
      cpuThrottlingRate,
      network,
      metrics,
      errorTotals: { consoleErrors, pageErrors, requestFailures },
    };
  }

  return {
    label,
    schemaVersion: asStringOrNull(raw.schemaVersion),
    measuredAt: asStringOrNull(raw.measuredAt),
    gitCommitSha: asStringOrNull(raw.gitCommitSha),
    browserName: asStringOrNull(runtimeRecord?.browserName) ?? 'chromium',
    browserVersion:
      asStringOrNull(runtimeRecord?.browserVersion) ?? asStringOrNull(raw.browserVersion),
    nodeVersion: asStringOrNull(runtimeRecord?.nodeVersion),
    host: hostRecord
      ? {
          platform: asStringOrNull(hostRecord.platform),
          arch: asStringOrNull(hostRecord.arch),
          cpuModel: asStringOrNull(hostRecord.cpuModel),
          logicalCpuCount: asNonNegativeFiniteNumber(hostRecord.logicalCpuCount),
          totalMemoryMb: asNonNegativeFiniteNumber(hostRecord.totalMemoryMb),
        }
      : null,
    runCountPerEnvironment,
    build: parseBuildSummary(raw.productionBuild, warnings, label),
    environments,
    validationWarnings: warnings,
  };
}

function networksMatch(
  a: NormalizedEnvironment['network'],
  b: NormalizedEnvironment['network'],
): boolean {
  if (typeof a === 'string' || typeof b === 'string') {
    return a === b;
  }
  return (
    a.latencyMs === b.latencyMs &&
    a.downloadKbps === b.downloadKbps &&
    a.uploadKbps === b.uploadKbps
  );
}

export function detectConditionDifferences(
  base: ParsedBaseline,
  candidate: ParsedBaseline,
): ComparisonFlag[] {
  const flags: ComparisonFlag[] = [];

  if (base.browserVersion !== candidate.browserVersion) {
    flags.push({
      code: 'browser-mismatch',
      severity: 'warning',
      message: `Browser version differs (${base.label}: ${base.browserVersion ?? 'unknown'} vs ${candidate.label}: ${candidate.browserVersion ?? 'unknown'}). Timing differences may reflect Chromium engine changes.`,
    });
  }

  if (base.nodeVersion && candidate.nodeVersion && base.nodeVersion !== candidate.nodeVersion) {
    flags.push({
      code: 'node-mismatch',
      severity: 'caution',
      message: `Node version differs (${base.label}: ${base.nodeVersion} vs ${candidate.label}: ${candidate.nodeVersion}).`,
    });
  }

  if (!base.host || !candidate.host) {
    flags.push({
      code: 'host-unverified',
      severity: 'caution',
      message: `Host hardware metadata is missing on at least one baseline (${base.label}: ${base.host ? 'present' : 'missing'}, ${candidate.label}: ${candidate.host ? 'present' : 'missing'}). Do not assume identical machine performance.`,
    });
  } else {
    const diffs: string[] = [];
    if (base.host.platform !== candidate.host.platform) {
      diffs.push(`platform ${base.host.platform ?? '?'} vs ${candidate.host.platform ?? '?'}`);
    }
    if (base.host.arch !== candidate.host.arch) {
      diffs.push(`arch ${base.host.arch ?? '?'} vs ${candidate.host.arch ?? '?'}`);
    }
    if (base.host.cpuModel !== candidate.host.cpuModel) {
      diffs.push(`CPU "${base.host.cpuModel ?? '?'}" vs "${candidate.host.cpuModel ?? '?'}"`);
    }
    if (base.host.logicalCpuCount !== candidate.host.logicalCpuCount) {
      diffs.push(`logical CPUs ${base.host.logicalCpuCount ?? '?'} vs ${candidate.host.logicalCpuCount ?? '?'}`);
    }
    if (base.host.totalMemoryMb !== candidate.host.totalMemoryMb) {
      diffs.push(`RAM ${base.host.totalMemoryMb ?? '?'} MiB vs ${candidate.host.totalMemoryMb ?? '?'} MiB`);
    }
    if (diffs.length > 0) {
      flags.push({
        code: 'host-mismatch',
        severity: 'warning',
        message: `Host machines differ (${diffs.join('; ')}). Do not interpret timing deltas across different machines as code regressions.`,
      });
    }
  }

  if (base.runCountPerEnvironment === 0 || candidate.runCountPerEnvironment === 0) {
    flags.push({
      code: 'zero-samples',
      severity: 'warning',
      message: `Zero measured runs reported (${base.label}: ${base.runCountPerEnvironment ?? '?'}, ${candidate.label}: ${candidate.runCountPerEnvironment ?? '?'}).`,
    });
  } else if (base.runCountPerEnvironment !== candidate.runCountPerEnvironment) {
    flags.push({
      code: 'run-count-mismatch',
      severity: 'caution',
      message: `Run count per environment differs (${base.label}: ${base.runCountPerEnvironment ?? 'unknown'} vs ${candidate.label}: ${candidate.runCountPerEnvironment ?? 'unknown'}).`,
    });
  }

  const allEnvNames = Array.from(
    new Set([...Object.keys(base.environments), ...Object.keys(candidate.environments)]),
  ).sort();

  for (const envName of allEnvNames) {
    const envA = base.environments[envName];
    const envB = candidate.environments[envName];
    if (!envA || !envB) {
      flags.push({
        code: 'missing-environment',
        severity: 'warning',
        environment: envName,
        message: `Environment "${envName}" is present in ${envA ? base.label : candidate.label} only.`,
      });
      continue;
    }

    if (envA.viewport !== envB.viewport) {
      flags.push({
        code: 'environment-condition-mismatch',
        severity: 'warning',
        environment: envName,
        message: `[${envName}] Viewport differs (${envA.viewport ?? 'unknown'} vs ${envB.viewport ?? 'unknown'}).`,
      });
    }
    if (envA.cpuThrottlingRate !== envB.cpuThrottlingRate) {
      flags.push({
        code: 'environment-condition-mismatch',
        severity: 'warning',
        environment: envName,
        message: `[${envName}] CPU throttling differs (${envA.cpuThrottlingRate ?? 'unknown'}x vs ${envB.cpuThrottlingRate ?? 'unknown'}x).`,
      });
    }
    if (!networksMatch(envA.network, envB.network)) {
      flags.push({
        code: 'environment-condition-mismatch',
        severity: 'warning',
        environment: envName,
        message: `[${envName}] Network emulation profile differs (${JSON.stringify(envA.network)} vs ${JSON.stringify(envB.network)}).`,
      });
    }
  }

  return flags;
}

function computeDelta(baseVal: number | null, candidateVal: number | null): {
  delta: number | null;
  percentDelta: number | null;
} {
  if (baseVal === null || candidateVal === null) {
    return { delta: null, percentDelta: null };
  }
  const delta = candidateVal - baseVal;
  const percentDelta = baseVal === 0 ? null : (delta / baseVal) * 100;
  return { delta, percentDelta };
}

function sortMetricKeys(keys: Iterable<string>): string[] {
  const unique = Array.from(new Set(keys));
  return unique.sort((a, b) => {
    const indexA = METRIC_DISPLAY_ORDER.indexOf(a);
    const indexB = METRIC_DISPLAY_ORDER.indexOf(b);
    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    return a.localeCompare(b);
  });
}

function evaluateThresholds(
  config: LocalDraftThresholdsConfig,
  buildComparison: BuildMetricDelta[],
  environmentComparisons: ComparisonReport['environmentComparisons'],
): ThresholdEvaluation {
  const breaches: ThresholdBreach[] = [];
  const jsGzipRow = buildComparison.find(row => row.key === 'initialJsGzipBytes');
  const totalGzipRow = buildComparison.find(row => row.key === 'initialTotalGzipBytes');

  if (
    typeof config.maxInitialJsGzipBytes === 'number' &&
    jsGzipRow?.candidateValue !== null &&
    jsGzipRow?.candidateValue !== undefined &&
    jsGzipRow.candidateValue > config.maxInitialJsGzipBytes
  ) {
    breaches.push({
      scope: 'productionBuild',
      metric: 'initialJsGzipBytes',
      unit: 'bytes',
      actual: jsGzipRow.candidateValue,
      limit: config.maxInitialJsGzipBytes,
      rule: 'maxInitialJsGzipBytes',
    });
  }

  if (
    typeof config.maxInitialTotalGzipBytes === 'number' &&
    totalGzipRow?.candidateValue !== null &&
    totalGzipRow?.candidateValue !== undefined &&
    totalGzipRow.candidateValue > config.maxInitialTotalGzipBytes
  ) {
    breaches.push({
      scope: 'productionBuild',
      metric: 'initialTotalGzipBytes',
      unit: 'bytes',
      actual: totalGzipRow.candidateValue,
      limit: config.maxInitialTotalGzipBytes,
      rule: 'maxInitialTotalGzipBytes',
    });
  }

  if (config.environments) {
    for (const [envName, rules] of Object.entries(config.environments)) {
      const envComp = environmentComparisons.find(item => item.environment === envName);
      if (!envComp) continue;
      for (const [metricKey, rule] of Object.entries(rules)) {
        const metricRow = envComp.metrics.find(m => m.key === metricKey);
        if (!metricRow || metricRow.status !== 'compared' || metricRow.candidateMedian === null) {
          continue;
        }
        if (typeof rule.maxMedian === 'number' && metricRow.candidateMedian > rule.maxMedian) {
          breaches.push({
            scope: envName,
            metric: metricKey,
            unit: metricRow.unit,
            actual: metricRow.candidateMedian,
            limit: rule.maxMedian,
            rule: 'maxMedian',
          });
        }
        if (
          typeof rule.maxDelta === 'number' &&
          metricRow.delta !== null &&
          metricRow.delta > rule.maxDelta
        ) {
          breaches.push({
            scope: envName,
            metric: metricKey,
            unit: metricRow.unit,
            actual: metricRow.delta,
            limit: rule.maxDelta,
            rule: 'maxDelta',
          });
        }
        if (
          typeof rule.maxDeltaPercent === 'number' &&
          metricRow.percentDelta !== null &&
          metricRow.percentDelta > rule.maxDeltaPercent
        ) {
          breaches.push({
            scope: envName,
            metric: metricKey,
            unit: metricRow.unit,
            actual: metricRow.percentDelta,
            limit: rule.maxDeltaPercent,
            rule: 'maxDeltaPercent',
          });
        }
      }
    }
  }

  return {
    notice:
      'LOCALLY SUPPLIED DRAFT THRESHOLDS ONLY — NOT AN APPROVED PERFORMANCE BUDGET OR LAUNCH GATE.',
    configLabel: config.label?.trim() || 'Local draft threshold config',
    passed: breaches.length === 0,
    breaches,
  };
}

export function compareBaselines(
  baseInput: unknown,
  candidateInput: unknown,
  options?: {
    baseLabel?: string;
    candidateLabel?: string;
    thresholdsConfig?: LocalDraftThresholdsConfig;
  },
): ComparisonReport {
  const base = parseBaselineDocument(baseInput, options?.baseLabel ?? 'base');
  const candidate = parseBaselineDocument(candidateInput, options?.candidateLabel ?? 'candidate');

  const flags = detectConditionDifferences(base, candidate);
  for (const warning of [...base.validationWarnings, ...candidate.validationWarnings]) {
    flags.push({
      code: 'malformed-metric',
      severity: 'caution',
      message: warning,
    });
  }

  const buildFields: Array<{
    key: keyof NormalizedBuildMetrics;
    label: string;
    unit: 'bytes' | 'count';
  }> = [
    { key: 'initialJsRawBytes', label: 'Initial JS entry (raw)', unit: 'bytes' },
    { key: 'initialJsGzipBytes', label: 'Initial JS entry (gzip)', unit: 'bytes' },
    { key: 'initialCssRawBytes', label: 'Initial CSS entry (raw)', unit: 'bytes' },
    { key: 'initialCssGzipBytes', label: 'Initial CSS entry (gzip)', unit: 'bytes' },
    { key: 'initialTotalRawBytes', label: 'Initial JS + CSS (raw)', unit: 'bytes' },
    { key: 'initialTotalGzipBytes', label: 'Initial JS + CSS (gzip)', unit: 'bytes' },
    { key: 'totalDistBytes', label: 'All dist/ assets (raw)', unit: 'bytes' },
    { key: 'fileCount', label: 'Total dist/ files', unit: 'count' },
  ];

  const buildComparison: BuildMetricDelta[] = buildFields.map(field => {
    const baseValue = base.build[field.key];
    const candidateValue = candidate.build[field.key];
    const status: MetricComparisonStatus =
      baseValue !== null && candidateValue !== null
        ? 'compared'
        : baseValue === null && candidateValue === null
          ? 'missing-both'
          : baseValue === null
            ? 'missing-base'
            : 'missing-candidate';
    const { delta, percentDelta } = computeDelta(baseValue, candidateValue);
    return {
      key: field.key,
      label: field.label,
      unit: field.unit,
      status,
      baseValue,
      candidateValue,
      delta,
      percentDelta,
    };
  });

  const envOrder = ['unthrottled', 'constrained'];
  const allEnvNames = Array.from(
    new Set([...Object.keys(base.environments), ...Object.keys(candidate.environments)]),
  ).sort((a, b) => {
    const ia = envOrder.indexOf(a);
    const ib = envOrder.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });

  const hasEnvMismatch = (envName: string) =>
    flags.some(
      flag =>
        flag.severity === 'warning' &&
        (flag.environment === envName ||
          flag.code === 'browser-mismatch' ||
          flag.code === 'host-mismatch'),
    );

  const environmentComparisons = allEnvNames.map(envName => {
    const envA = base.environments[envName];
    const envB = candidate.environments[envName];
    const metricKeys = sortMetricKeys([
      ...(envA ? Object.keys(envA.metrics) : []),
      ...(envB ? Object.keys(envB.metrics) : []),
    ]);

    const metrics: MetricDelta[] = metricKeys.map(key => {
      const mA = envA?.metrics[key];
      const mB = envB?.metrics[key];
      const unit = mA?.unit ?? mB?.unit ?? inferMetricUnit(key);
      const baseMedian = mA?.median ?? null;
      const candidateMedian = mB?.median ?? null;
      const baseAvailableSamples = mA?.availableSamples ?? 0;
      const baseTotalSamples = mA?.totalSamples ?? 0;
      const candidateAvailableSamples = mB?.availableSamples ?? 0;
      const candidateTotalSamples = mB?.totalSamples ?? 0;

      let status: MetricComparisonStatus;
      let note: string | undefined;

      if (mA?.malformed || mB?.malformed) {
        status = 'malformed';
        note = [mA?.reason, mB?.reason].filter(Boolean).join('; ') || 'malformed metric value';
      } else if (baseMedian !== null && candidateMedian !== null && baseAvailableSamples > 0 && candidateAvailableSamples > 0) {
        status = 'compared';
      } else if (baseMedian === null && candidateMedian === null) {
        status = 'missing-both';
      } else if (baseMedian === null) {
        status = 'missing-base';
      } else {
        status = 'missing-candidate';
      }

      if (status !== 'compared' && (baseTotalSamples === 0 || candidateTotalSamples === 0)) {
        flags.push({
          code: 'missing-samples',
          severity: 'caution',
          environment: envName,
          message: `[${envName}] Metric "${key}" has zero available samples on ${baseAvailableSamples === 0 ? base.label : candidate.label}.`,
        });
      } else if (
        status === 'compared' &&
        (baseAvailableSamples < baseTotalSamples || candidateAvailableSamples < candidateTotalSamples)
      ) {
        note = `partial samples (${baseAvailableSamples}/${baseTotalSamples} vs ${candidateAvailableSamples}/${candidateTotalSamples})`;
        flags.push({
          code: 'missing-samples',
          severity: 'caution',
          environment: envName,
          message: `[${envName}] Metric "${key}" has incomplete samples (${baseAvailableSamples}/${baseTotalSamples} vs ${candidateAvailableSamples}/${candidateTotalSamples}).`,
        });
      }

      const { delta, percentDelta } =
        status === 'compared' ? computeDelta(baseMedian, candidateMedian) : { delta: null, percentDelta: null };

      return {
        key,
        unit,
        status,
        baseMedian,
        candidateMedian,
        baseAvailableSamples,
        baseTotalSamples,
        candidateAvailableSamples,
        candidateTotalSamples,
        delta,
        percentDelta,
        note,
      };
    });

    return {
      environment: envName,
      comparableConditions: !hasEnvMismatch(envName),
      metrics,
    };
  });

  const thresholdEvaluation = options?.thresholdsConfig
    ? evaluateThresholds(options.thresholdsConfig, buildComparison, environmentComparisons)
    : null;

  const exitCode: 0 | 1 =
    thresholdEvaluation && !thresholdEvaluation.passed ? 1 : 0;

  return {
    budgetApprovalStatus: 'UNAPPROVED_ADVISORY_ONLY',
    disclaimer:
      'Advisory comparison only. No performance budget or threshold is approved or passed by this tool.',
    exitCode,
    base: {
      label: base.label,
      measuredAt: base.measuredAt,
      gitCommitSha: base.gitCommitSha,
      browserVersion: base.browserVersion,
      runCountPerEnvironment: base.runCountPerEnvironment,
    },
    candidate: {
      label: candidate.label,
      measuredAt: candidate.measuredAt,
      gitCommitSha: candidate.gitCommitSha,
      browserVersion: candidate.browserVersion,
      runCountPerEnvironment: candidate.runCountPerEnvironment,
    },
    flags,
    buildComparison,
    environmentComparisons,
    thresholdEvaluation,
  };
}

function formatValueWithUnit(value: number | null, unit: MetricUnit): string {
  if (value === null) return 'missing';
  if (unit === 'bytes') return `${Math.round(value).toLocaleString('en-US')} B`;
  if (unit === 'count') return Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${Math.round(value).toLocaleString('en-US')} ms`;
}

function formatDeltaCell(delta: number | null, percentDelta: number | null, unit: MetricUnit): string {
  if (delta === null) return 'n/a';
  const sign = delta > 0 ? '+' : '';
  const formattedDelta =
    unit === 'bytes'
      ? `${sign}${Math.round(delta).toLocaleString('en-US')} B`
      : unit === 'count'
        ? `${sign}${Number.isInteger(delta) ? delta : delta.toFixed(1)}`
        : `${sign}${Math.round(delta).toLocaleString('en-US')} ms`;
  if (percentDelta === null) return formattedDelta;
  const pctSign = percentDelta > 0 ? '+' : '';
  return `${formattedDelta} (${pctSign}${percentDelta.toFixed(1)}%)`;
}

export function formatComparisonMarkdown(report: ComparisonReport): string {
  const lines: string[] = [];
  lines.push('# R21 Performance Baseline Comparison (Advisory)');
  lines.push('');
  lines.push(`> **${report.disclaimer}**`);
  lines.push('');
  lines.push(
    `- **Base (${report.base.label}):** commit \`${report.base.gitCommitSha ?? 'unknown'}\`, Chromium ${report.base.browserVersion ?? 'unknown'}, runs/env: ${report.base.runCountPerEnvironment ?? 'unknown'}, measured: ${report.base.measuredAt ?? 'unknown'}`,
  );
  lines.push(
    `- **Candidate (${report.candidate.label}):** commit \`${report.candidate.gitCommitSha ?? 'unknown'}\`, Chromium ${report.candidate.browserVersion ?? 'unknown'}, runs/env: ${report.candidate.runCountPerEnvironment ?? 'unknown'}, measured: ${report.candidate.measuredAt ?? 'unknown'}`,
  );

  if (report.flags.length > 0) {
    lines.push('');
    lines.push('## Condition & Sample Flags');
    lines.push('');
    for (const flag of report.flags) {
      lines.push(`- **[${flag.severity.toUpperCase()} · ${flag.code}]** ${flag.message}`);
    }
  }

  lines.push('');
  lines.push('## Production Build Size Comparison');
  lines.push('');
  lines.push(`| Asset / Metric | ${report.base.label} | ${report.candidate.label} | Delta | Status |`);
  lines.push('| --- | ---: | ---: | ---: | --- |');
  for (const row of report.buildComparison) {
    lines.push(
      `| ${row.label} | ${formatValueWithUnit(row.baseValue, row.unit)} | ${formatValueWithUnit(row.candidateValue, row.unit)} | ${formatDeltaCell(row.delta, row.percentDelta, row.unit)} | ${row.status} |`,
    );
  }

  for (const envComp of report.environmentComparisons) {
    lines.push('');
    lines.push(
      `## Environment: \`${envComp.environment}\` (${envComp.comparableConditions ? 'conditions matched' : 'CONDITIONS DIFFER — TREAT TIMING DELTAS WITH CAUTION'})`,
    );
    lines.push('');
    lines.push(`| Metric (unit) | ${report.base.label} | ${report.candidate.label} | Delta | Status |`);
    lines.push('| --- | ---: | ---: | ---: | --- |');
    for (const row of envComp.metrics) {
      const baseCell = `${formatValueWithUnit(row.baseMedian, row.unit)} (${row.baseAvailableSamples}/${row.baseTotalSamples})`;
      const candCell = `${formatValueWithUnit(row.candidateMedian, row.unit)} (${row.candidateAvailableSamples}/${row.candidateTotalSamples})`;
      const statusCell = row.note ? `${row.status} (${row.note})` : row.status;
      lines.push(
        `| ${row.key} (${row.unit}) | ${baseCell} | ${candCell} | ${formatDeltaCell(row.delta, row.percentDelta, row.unit)} | ${statusCell} |`,
      );
    }
  }

  if (report.thresholdEvaluation) {
    lines.push('');
    lines.push('## Local Draft Threshold Evaluation');
    lines.push('');
    lines.push(`> **${report.thresholdEvaluation.notice}**`);
    lines.push('');
    lines.push(
      `- **Config:** ${report.thresholdEvaluation.configLabel}`,
    );
    lines.push(
      `- **Draft check result:** ${report.thresholdEvaluation.passed ? 'WITHIN LOCAL DRAFT LIMITS' : `EXCEEDED (${report.thresholdEvaluation.breaches.length} breaches)`}`,
    );
    for (const breach of report.thresholdEvaluation.breaches) {
      lines.push(
        `  - \`[${breach.scope}] ${breach.metric}\` (${breach.rule}): actual ${breach.actual} vs draft limit ${breach.limit}`,
      );
    }
  }

  lines.push('');
  return lines.join('\n');
}

export function formatComparisonText(report: ComparisonReport): string {
  return formatComparisonMarkdown(report);
}

function parseCliArgs(argv: string[]): {
  basePath: string;
  candidatePath: string;
  format: 'md' | 'json' | 'text';
  outPath?: string;
  thresholdsPath?: string;
} {
  const positional: string[] = [];
  let format: 'md' | 'json' | 'text' = 'md';
  let outPath: string | undefined;
  let thresholdsPath: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--format' && i + 1 < argv.length) {
      const next = argv[i + 1];
      if (next !== 'md' && next !== 'json' && next !== 'text') {
        throw new Error(`Unsupported --format "${next}". Expected md, json, or text.`);
      }
      format = next;
      i += 1;
    } else if (arg === '--out' && i + 1 < argv.length) {
      outPath = argv[i + 1];
      i += 1;
    } else if (arg === '--thresholds' && i + 1 < argv.length) {
      thresholdsPath = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  if (positional.length !== 2) {
    throw new Error(
      'Usage: compare-r21-baselines.ts <base-baseline.json> <candidate-baseline.json> [--format md|json|text] [--out <path>] [--thresholds <local-draft-config.json>]',
    );
  }

  return {
    basePath: positional[0],
    candidatePath: positional[1],
    format,
    outPath,
    thresholdsPath,
  };
}

async function readJsonFile(filePath: string): Promise<unknown> {
  const raw = await fs.readFile(path.resolve(filePath), 'utf8');
  return JSON.parse(raw) as unknown;
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));
  const baseJson = await readJsonFile(args.basePath);
  const candidateJson = await readJsonFile(args.candidatePath);
  const thresholdsConfig = args.thresholdsPath
    ? (await readJsonFile(args.thresholdsPath)) as LocalDraftThresholdsConfig
    : undefined;

  const report = compareBaselines(baseJson, candidateJson, {
    baseLabel: path.basename(args.basePath),
    candidateLabel: path.basename(args.candidatePath),
    thresholdsConfig,
  });

  const output =
    args.format === 'json'
      ? `${JSON.stringify(report, null, 2)}\n`
      : args.format === 'text'
        ? formatComparisonText(report)
        : formatComparisonMarkdown(report);

  if (args.outPath) {
    const resolvedOut = path.resolve(args.outPath);
    await fs.mkdir(path.dirname(resolvedOut), { recursive: true });
    await fs.writeFile(resolvedOut, output, 'utf8');
  }
  process.stdout.write(output);
  process.exitCode = report.exitCode;
}

const isEntrypoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isEntrypoint) {
  main().catch(error => {
    console.error(`R21 comparison failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
