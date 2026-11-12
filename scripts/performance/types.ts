export type NetworkConfig = {
  latencyMs: number;
  downloadKbps: number;
  uploadKbps: number;
};

export type BuildFileEntry = {
  file: string;
  bytes: number;
  gzipBytes: number;
};

export type ProductionBuildSummary = {
  mode: string;
  totalDistBytes: number;
  totalDistGzipBytes: number;
  fileCount: number;
  allFiles: BuildFileEntry[];
  initialEntryAssets: BuildFileEntry[];
  initialEntryTotals: {
    rawBytes: number;
    gzipBytes: number;
    jsRawBytes: number;
    jsGzipBytes: number;
    cssRawBytes: number;
    cssGzipBytes: number;
  };
};

export type NavigationMetrics = {
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

export type RunResult = {
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

export type SummaryMetric = {
  median: number | null;
  min: number | null;
  max: number | null;
  availableSamples: number;
  samples: Array<number | null>;
};

export type R21EnvironmentSpec = {
  name: string;
  viewport: string;
  cpuThrottlingRate: number;
  network: NetworkConfig | 'No explicit CPU/network throttling';
};

export type R21EnvironmentResult = {
  environment: R21EnvironmentSpec;
  summary: Record<string, SummaryMetric>;
  runs: RunResult[];
};

export type NetworkInterruptionCheck = {
  scenario: string;
  contentSource: 'bundled-historical-prototype-in-js';
  serverBackedChallengeVerified: false;
  offlineNavigationSucceeded: boolean;
  openedTeachingTitle: string | null;
  renderedParagraphs: number;
  blockedExternalFontFallbackReadable: boolean;
  pageErrors: string[];
  note: string;
};

export type R21HostInfo = {
  platform: string;
  arch: string;
  osRelease: string;
  cpuModel: string;
  logicalCpuCount: number;
  totalMemoryMb: number;
};

export type R21RuntimeInfo = {
  nodeVersion: string;
  browserName: string;
  browserVersion: string;
};

export type R21BaselineReport = {
  schemaVersion: 'r21-baseline-v1';
  measuredAt: string;
  gitCommitSha: string;
  gitBranch: string;
  gitDirty: boolean;
  note: string;
  browserVersion: string;
  runtime: R21RuntimeInfo;
  host: R21HostInfo;
  runCountPerEnvironment: number;
  productionBuild: ProductionBuildSummary;
  results: R21EnvironmentResult[];
  networkInterruptionCheck?: NetworkInterruptionCheck;
};
