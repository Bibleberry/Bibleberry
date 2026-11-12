import type { R21BaselineReport, SummaryMetric } from './types.ts';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(2)} kB (${bytes.toLocaleString('en-US')} B)`;
}

function formatNumber(value: number, unit: 'ms' | 'bytes' | 'count'): string {
  if (unit === 'bytes') return `${Math.round(value).toLocaleString('en-US')} B`;
  if (unit === 'count') return Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${Math.round(value).toLocaleString('en-US')} ms`;
}

function formatMetricCell(
  metric: SummaryMetric | undefined,
  unit: 'ms' | 'bytes' | 'count',
  totalRuns: number,
): string {
  if (!metric || metric.median === null || metric.availableSamples === 0) {
    return `unavailable (0/${totalRuns} samples)`;
  }
  const base = formatNumber(metric.median, unit);
  const range =
    metric.min !== null && metric.max !== null && metric.availableSamples > 1
      ? ` (range ${formatNumber(metric.min, unit)}–${formatNumber(metric.max, unit)})`
      : '';
  const sampleNote =
    metric.availableSamples < totalRuns
      ? ` [${metric.availableSamples}/${totalRuns} samples]`
      : '';
  return `${base}${range}${sampleNote}`;
}

export function renderR21BaselineMarkdown(report: R21BaselineReport): string {
  const lines: string[] = [];
  lines.push('# R21 Reproducible Emulated Performance Baseline');
  lines.push('');
  lines.push(`- **Measured:** ${report.measuredAt}`);
  lines.push(`- **Git commit:** \`${report.gitCommitSha}\` (branch \`${report.gitBranch}\`, working tree ${report.gitDirty ? 'dirty' : 'clean'})`);
  lines.push(`- **Runtime:** Node ${report.runtime.nodeVersion}, Chromium ${report.runtime.browserVersion}`);
  lines.push(`- **Host (unprivileged):** ${report.host.platform} ${report.host.osRelease} (${report.host.arch}), ${report.host.cpuModel}, ${report.host.logicalCpuCount} logical CPUs, ${report.host.totalMemoryMb} MiB RAM`);
  lines.push(`- **Samples per environment:** ${report.runCountPerEnvironment}`);
  lines.push(`- **Scope notice:** ${report.note}`);
  lines.push('');
  lines.push('> **Not Android hardware evidence:** All timings below come from headless desktop Chromium mobile-viewport emulation on a local development machine. Physical older/budget Android devices, Android WebView, and installed Capacitor APKs remain unverified until measured on hardware.');
  lines.push('');
  lines.push('## Production Build Assets');
  lines.push('');
  lines.push(`Build mode: \`${report.productionBuild.mode}\` (\`dist/\`, ${report.productionBuild.fileCount} files).`);
  lines.push('');
  lines.push('| Asset / Group | Raw size | Gzip size | Initial entry |');
  lines.push('| --- | ---: | ---: | --- |');
  for (const asset of report.productionBuild.initialEntryAssets) {
    lines.push(`| \`${asset.file}\` | ${formatBytes(asset.bytes)} | ${formatBytes(asset.gzipBytes)} | Yes |`);
  }
  lines.push(
    `| **Initial JS + CSS total** | **${formatBytes(report.productionBuild.initialEntryTotals.rawBytes)}** | **${formatBytes(report.productionBuild.initialEntryTotals.gzipBytes)}** | Yes |`,
  );
  lines.push(
    `| **All \`dist/\` files (${report.productionBuild.fileCount})** | **${formatBytes(report.productionBuild.totalDistBytes)}** | **${formatBytes(report.productionBuild.totalDistGzipBytes)}** | Includes deferred & route-specific assets |`,
  );
  lines.push('');
  lines.push('## Emulation Environments');
  lines.push('');
  for (const envResult of report.results) {
    const net =
      typeof envResult.environment.network === 'string'
        ? envResult.environment.network
        : `latency ${envResult.environment.network.latencyMs} ms, download ${envResult.environment.network.downloadKbps} kbps, upload ${envResult.environment.network.uploadKbps} kbps`;
    lines.push(
      `- **${envResult.environment.name}**: ${envResult.environment.viewport}; CPU throttling ${envResult.environment.cpuThrottlingRate}×; network: ${net}`,
    );
  }
  lines.push('');
  lines.push('## Measured Metrics (Medians)');
  lines.push('');
  const envNames = report.results.map(r => r.environment.name);
  lines.push(`| Metric | ${envNames.join(' | ')} |`);
  lines.push(`| --- | ${envNames.map(() => '---:').join(' | ')} |`);

  const metricRows: Array<{ key: string; label: string; unit: 'ms' | 'bytes' | 'count' }> = [
    { key: 'cold load wall-clock ms', label: 'Cold visible-reader load (wall clock)', unit: 'ms' },
    { key: 'cold FCP ms', label: 'Cold First Contentful Paint (FCP)', unit: 'ms' },
    { key: 'cold LCP ms', label: 'Cold Largest Contentful Paint (LCP)', unit: 'ms' },
    { key: 'cold domContentLoaded ms', label: 'Cold DOMContentLoaded', unit: 'ms' },
    { key: 'cold loadEvent ms', label: 'Cold load event', unit: 'ms' },
    { key: 'cold same-origin transfer bytes', label: 'Cold same-origin transfer', unit: 'bytes' },
    { key: 'cold JS+CSS transfer bytes', label: 'Cold JS + CSS transfer', unit: 'bytes' },
    { key: 'cold long-task count', label: 'Cold long-task count', unit: 'count' },
    { key: 'cold long-task duration ms', label: 'Cold long-task total duration', unit: 'ms' },
    { key: 'repeat load wall-clock ms', label: 'Repeat visible-reader load (wall clock)', unit: 'ms' },
    { key: 'repeat FCP ms', label: 'Repeat FCP', unit: 'ms' },
    { key: 'repeat LCP ms', label: 'Repeat LCP', unit: 'ms' },
    { key: 'repeat same-origin transfer bytes', label: 'Repeat same-origin transfer', unit: 'bytes' },
    { key: 'resume open ms', label: 'Resume saved teaching (Return)', unit: 'ms' },
    { key: 'navigation to Archive ms', label: 'Navigate to Archive', unit: 'ms' },
    { key: 'Archive Challenge open ms', label: 'Open Archive teaching', unit: 'ms' },
    { key: 'full-page scroll ms', label: 'Scripted full-page scroll', unit: 'ms' },
    { key: 'scroll long-task count', label: 'Scroll long-task count', unit: 'count' },
    { key: 'rendered paragraphs', label: 'Rendered teaching paragraphs', unit: 'count' },
    { key: 'cold JS heap used bytes', label: 'Reported JS heap used (Chromium)', unit: 'bytes' },
  ];

  for (const row of metricRows) {
    const cells = report.results.map(envResult =>
      formatMetricCell(envResult.summary[row.key], row.unit, report.runCountPerEnvironment),
    );
    lines.push(`| ${row.label} | ${cells.join(' | ')} |`);
  }

  lines.push('');
  lines.push('### Runtime Errors and External Requests');
  lines.push('');
  for (const envResult of report.results) {
    const totalConsoleErrors = envResult.runs.reduce((sum, r) => sum + r.consoleErrors.length, 0);
    const totalPageErrors = envResult.runs.reduce((sum, r) => sum + r.pageErrors.length, 0);
    const totalReqFailures = envResult.runs.reduce((sum, r) => sum + r.requestFailures.length, 0);
    const fontUrls = Array.from(
      new Set(envResult.runs.flatMap(r => [...r.initialLoad.externalFontResources, ...r.repeatLoad.externalFontResources])),
    );
    lines.push(
      `- **${envResult.environment.name}**: console errors=${totalConsoleErrors}, page errors=${totalPageErrors}, failed requests=${totalReqFailures}, external font stylesheets=${fontUrls.length > 0 ? fontUrls.join(', ') : 'none observed'}`,
    );
  }

  if (report.networkInterruptionCheck) {
    const check = report.networkInterruptionCheck;
    lines.push('');
    lines.push('## Network Interruption Check (Public Production Bundle)');
    lines.push('');
    lines.push(`- **Scenario:** ${check.scenario}`);
    lines.push(`- **Content source:** \`${check.contentSource}\` (server-backed Challenge verified: ${check.serverBackedChallengeVerified ? 'yes' : 'no'})`);
    lines.push(`- **Offline Archive -> Teaching open succeeded:** ${check.offlineNavigationSucceeded ? 'PASS' : 'FAIL'} (${check.openedTeachingTitle ?? 'none'}, ${check.renderedParagraphs} paragraphs)`);
    lines.push(`- **Blocked Google Fonts fallback readable:** ${check.blockedExternalFontFallbackReadable ? 'PASS' : 'FAIL'}`);
    lines.push(`- **Uncaught page errors:** ${check.pageErrors.length}`);
    lines.push(`- **Interpretation:** ${check.note}`);
  }

  lines.push('');
  lines.push('> **Advisory report only:** No performance budget or threshold is approved or certified by this output.');
  lines.push('');
  return lines.join('\n');
}
