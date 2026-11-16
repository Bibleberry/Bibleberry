import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createLogger, preview, type Logger, type PreviewServer } from 'vite';

export const DEFAULT_PREVIEW_HOST = '127.0.0.1';
const DEFAULT_READINESS_TIMEOUT_MS = 10_000;
const DEFAULT_CLOSE_TIMEOUT_MS = 5_000;
const DEFAULT_PORT_RELEASE_TIMEOUT_MS = 2_000;

export type SmokePassDefinition = {
  id: number;
  label: string;
  buildEnv: Record<string, string>;
  testSpecs: string[];
};

export const SMOKE_PASSES: readonly SmokePassDefinition[] = [
  {
    id: 1,
    label: 'Public Production Bundle',
    buildEnv: {},
    testSpecs: [
      'tests/smoke/navigation.spec.ts',
      'tests/smoke/today-resume.spec.ts',
      'tests/smoke/memorization.spec.ts',
      'tests/smoke/build-isolation.spec.ts',
      'tests/smoke/frame-safe-storage.spec.ts',
    ],
  },
  {
    id: 2,
    label: 'Developer-Enabled Bundle',
    buildEnv: { VITE_ENABLE_DEVELOPER_STUDIO: 'true' },
    testSpecs: [
      'tests/smoke/interactive-lab.spec.ts',
      'tests/smoke/cms-challenge-player.spec.ts',
    ],
  },
  {
    id: 3,
    label: 'Challenge-Pilot-Enabled Ordinary Bundle',
    buildEnv: { VITE_ENABLE_CHALLENGE_PILOT: 'true' },
    testSpecs: ['tests/smoke/ordinary-challenge-pilot.spec.ts'],
  },
  {
    id: 4,
    label: 'Participation-Pilot-Enabled Bundle',
    buildEnv: { VITE_ENABLE_PARTICIPATION_PILOT: 'true' },
    testSpecs: ['tests/smoke/participation-pilot.spec.ts'],
  },
  {
    id: 5,
    label: 'Released-Challenge-Enabled Bundle',
    buildEnv: { VITE_ENABLE_RELEASED_CHALLENGE_ROUTE: 'true' },
    testSpecs: ['tests/smoke/released-challenge.spec.ts'],
  },
  {
    id: 6,
    label: 'Gateway-Backed Released-Challenge Bundle',
    buildEnv: {
      VITE_ENABLE_RELEASED_CHALLENGE_ROUTE: 'true',
      VITE_ENABLE_RELEASE_GATEWAY_SOURCE: 'true',
    },
    testSpecs: ['tests/smoke/gateway-released-challenge.spec.ts'],
  },
  {
    id: 7,
    label: 'Month-Screen-Enabled Bundle',
    buildEnv: { VITE_ENABLE_MONTH_SCREEN: 'true' },
    testSpecs: ['tests/smoke/month-screen.spec.ts'],
  },
];

export type StartPreviewOptions = {
  root?: string;
  outDir?: string;
  host?: string;
  port?: number;
  configFile?: string | false;
  readinessTimeoutMs?: number;
  previewFn?: typeof preview;
};

export type StartedPreviewServer = {
  server: PreviewServer;
  baseUrl: string;
  host: string;
  port: number;
  startupDurationMs: number;
  diagnostics: string[];
  close: () => Promise<PreviewStopResult>;
};

export type PreviewStopResult = {
  host: string;
  port: number;
  portReleased: boolean;
  elapsedMs: number;
};

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatError(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code;
    return code ? `${err.message} (${code})` : err.message;
  }
  return String(err);
}

/**
 * Creates a Vite logger that preserves warning/error output and captures
 * diagnostics so startup failures never fail silently.
 */
function createDiagnosticLogger(): { logger: Logger; diagnostics: string[] } {
  const diagnostics: string[] = [];
  const base = createLogger('warn', { prefix: '[vite-preview]' });
  const logger: Logger = {
    ...base,
    warn(msg, options) {
      diagnostics.push(`WARN: ${msg}`);
      base.warn(msg, options);
    },
    warnOnce(msg, options) {
      diagnostics.push(`WARN: ${msg}`);
      base.warnOnce(msg, options);
    },
    error(msg, options) {
      diagnostics.push(`ERROR: ${msg}`);
      base.error(msg, options);
    },
  };
  return { logger, diagnostics };
}

/**
 * Extracts and validates the OS-assigned numeric port from Vite's httpServer.
 */
export function resolveBoundPort(server: PreviewServer): number {
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string' || typeof address.port !== 'number' || address.port <= 0) {
    throw new Error(
      `Vite preview server did not expose a valid bound TCP port (received: ${JSON.stringify(address)})`
    );
  }
  return address.port;
}

/**
 * Probes whether a TCP port on the target loopback host is genuinely free to bind.
 */
export async function isPortAvailable(host: string, port: number): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    const probe = createNetServer();
    probe.unref();
    probe.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
        resolve(false);
        return;
      }
      reject(err);
    });
    probe.listen(port, host, () => {
      probe.close(closeErr => {
        if (closeErr) reject(closeErr);
        else resolve(true);
      });
    });
  });
}

/**
 * Waits up to `timeoutMs` for the OS to confirm the given port is unbound.
 */
export async function waitForPortReleased(
  host: string,
  port: number,
  timeoutMs = DEFAULT_PORT_RELEASE_TIMEOUT_MS
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (await isPortAvailable(host, port)) {
      return true;
    }
    await sleep(50);
  }
  return false;
}

/**
 * Verifies that our own PreviewServer instance is actively listening and
 * serving an HTTP 2xx response on its derived loopback URL.
 */
async function waitForPreviewReady(
  server: PreviewServer,
  baseUrl: string,
  timeoutMs: number,
  diagnostics: string[]
): Promise<void> {
  let asyncServerError: Error | null = null;
  const onError = (err: Error) => {
    asyncServerError = err;
  };
  server.httpServer?.once('error', onError);

  const deadline = Date.now() + timeoutMs;
  let lastObservation = 'no response yet';

  try {
    while (Date.now() <= deadline) {
      if (asyncServerError) {
        throw new Error(`Preview HTTP server emitted error on ${baseUrl}: ${formatError(asyncServerError)}`);
      }
      if (!server.httpServer?.listening) {
        throw new Error(`Preview HTTP server stopped listening before becoming ready at ${baseUrl}`);
      }

      try {
        const res = await fetch(baseUrl, { signal: AbortSignal.timeout(1_500) });
        if (res.ok) {
          if (!server.httpServer?.listening) {
            throw new Error(`Preview HTTP server closed during readiness check for ${baseUrl}`);
          }
          return;
        }
        lastObservation = `HTTP ${res.status} ${res.statusText}`;
      } catch (err) {
        lastObservation = formatError(err);
      }

      await sleep(100);
    }

    const diagSuffix = diagnostics.length > 0 ? ` | Vite logs: ${diagnostics.join(' ; ')}` : '';
    throw new Error(
      `Preview server did not become ready at ${baseUrl} within ${timeoutMs}ms (last check: ${lastObservation})${diagSuffix}`
    );
  } finally {
    server.httpServer?.off('error', onError);
  }
}

async function closeServerWithTimeout(
  server: PreviewServer,
  host: string,
  port: number,
  releaseTimeoutMs = DEFAULT_PORT_RELEASE_TIMEOUT_MS
): Promise<PreviewStopResult> {
  const startedAt = Date.now();
  let closeTimedOut = false;

  const closePromise = server.close();
  // Terminate idle keep-alive sockets so the OS releases the port promptly.
  server.httpServer?.closeAllConnections?.();

  await Promise.race([
    closePromise,
    sleep(DEFAULT_CLOSE_TIMEOUT_MS).then(() => {
      closeTimedOut = true;
    }),
  ]);

  if (closeTimedOut) {
    throw new Error(`Timed out after ${DEFAULT_CLOSE_TIMEOUT_MS}ms closing preview server on ${host}:${port}`);
  }

  const portReleased = await waitForPortReleased(host, port, releaseTimeoutMs);
  const elapsedMs = Date.now() - startedAt;
  if (!portReleased) {
    throw new Error(
      `Preview server on http://${host}:${port} closed, but port ${port} remained occupied after ${releaseTimeoutMs}ms`
    );
  }

  return { host, port, portReleased, elapsedMs };
}

/**
 * Starts a programmatic Vite preview server bound to loopback (`127.0.0.1`)
 * on an OS-assigned free port (`0`) by default, waits for readiness, and
 * returns a handle with the derived base URL and guaranteed cleanup.
 */
export async function startPreviewServer(
  options: StartPreviewOptions = {}
): Promise<StartedPreviewServer> {
  const host = options.host ?? DEFAULT_PREVIEW_HOST;
  const requestedPort = options.port ?? 0;
  const strictPort = requestedPort !== 0;
  const readinessTimeoutMs = options.readinessTimeoutMs ?? DEFAULT_READINESS_TIMEOUT_MS;
  const previewFn = options.previewFn ?? preview;
  const { logger, diagnostics } = createDiagnosticLogger();
  const startedAt = Date.now();

  let server: PreviewServer;
  try {
    server = await previewFn({
      root: options.root ?? process.cwd(),
      ...(options.configFile !== undefined ? { configFile: options.configFile } : {}),
      ...(options.outDir ? { build: { outDir: options.outDir } } : {}),
      preview: {
        host,
        port: requestedPort,
        strictPort,
        open: false,
      },
      customLogger: logger,
    });
  } catch (err) {
    const diagSuffix = diagnostics.length > 0 ? ` | Vite logs: ${diagnostics.join(' ; ')}` : '';
    throw new Error(
      `Failed to start Vite preview server on ${host}:${requestedPort}: ${formatError(err)}${diagSuffix}`
    );
  }

  let boundPort: number;
  try {
    boundPort = resolveBoundPort(server);
  } catch (err) {
    try {
      await server.close();
      server.httpServer?.closeAllConnections?.();
    } catch (closeErr) {
      console.error(`[preview] Cleanup error after invalid address: ${formatError(closeErr)}`);
    }
    throw err;
  }

  const baseUrl = `http://${host}:${boundPort}`;

  try {
    await waitForPreviewReady(server, baseUrl, readinessTimeoutMs, diagnostics);
  } catch (err) {
    try {
      await closeServerWithTimeout(server, host, boundPort);
    } catch (closeErr) {
      console.error(`[preview] Cleanup error after readiness failure on ${baseUrl}: ${formatError(closeErr)}`);
    }
    throw err;
  }

  const startupDurationMs = Date.now() - startedAt;
  console.log(`[preview] Ready at ${baseUrl} (bound port ${boundPort} in ${startupDurationMs}ms)`);

  let closed = false;
  const close = async (): Promise<PreviewStopResult> => {
    if (closed) {
      return { host, port: boundPort, portReleased: true, elapsedMs: 0 };
    }
    closed = true;
    const result = await closeServerWithTimeout(server, host, boundPort);
    console.log(
      `[preview] Stopped ${baseUrl} (port ${boundPort} released in ${result.elapsedMs}ms)`
    );
    return result;
  };

  return {
    server,
    baseUrl,
    host,
    port: boundPort,
    startupDurationMs,
    diagnostics,
    close,
  };
}

/**
 * Cleanly stops a started preview server and verifies its port is released.
 */
export async function stopPreviewServer(
  handle: StartedPreviewServer | null | undefined
): Promise<PreviewStopResult | null> {
  if (!handle) return null;
  return handle.close();
}

export function runCommand(command: string, env: Record<string, string> = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, {
      shell: true,
      stdio: 'inherit',
      env: { ...process.env, ...env },
    });
    proc.on('error', err => {
      reject(new Error(`Command "${command}" failed to spawn: ${formatError(err)}`));
    });
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`Command "${command}" exited with code ${code}`));
    });
  });
}

export function cleanDist(cwd = process.cwd()): void {
  const distPath = path.resolve(cwd, 'dist');
  if (fs.existsSync(distPath)) {
    fs.rmSync(distPath, { recursive: true, force: true });
  }
}

export type SmokeSuiteDeps = {
  passes?: readonly SmokePassDefinition[];
  cleanDistFn?: () => void;
  runCommandFn?: (command: string, env?: Record<string, string>) => Promise<void>;
  startPreviewFn?: (options?: StartPreviewOptions) => Promise<StartedPreviewServer>;
  stopPreviewFn?: (handle: StartedPreviewServer | null | undefined) => Promise<PreviewStopResult | null>;
};

/**
 * Executes all configured smoke passes, ensuring preview servers and the clean
 * public `dist/` build are always cleaned up without masking the primary error.
 */
export async function runSmokeSuite(deps: SmokeSuiteDeps = {}): Promise<void> {
  const passes = deps.passes ?? SMOKE_PASSES;
  const cleanDistFn = deps.cleanDistFn ?? (() => cleanDist());
  const runCommandFn = deps.runCommandFn ?? runCommand;
  const startPreviewFn = deps.startPreviewFn ?? startPreviewServer;
  const stopPreviewFn = deps.stopPreviewFn ?? stopPreviewServer;

  console.log('=== Bibleberry Automated Reader Regression Suite ===\n');

  let activeServer: StartedPreviewServer | null = null;
  let executionError: Error | null = null;
  let handlingSignal = false;

  const handleSignal = (signal: NodeJS.Signals) => {
    if (handlingSignal) return;
    handlingSignal = true;
    console.error(`\n[smoke] Received ${signal}; closing active preview server...`);
    void stopPreviewFn(activeServer)
      .catch(err => {
        console.error(`[smoke] Signal cleanup error: ${formatError(err)}`);
      })
      .finally(() => {
        process.exit(signal === 'SIGINT' ? 130 : 143);
      });
  };

  process.once('SIGINT', handleSignal);
  process.once('SIGTERM', handleSignal);

  try {
    for (const pass of passes) {
      const prefix = pass.id === 1 ? '' : '\n';
      console.log(`${prefix}>>> [Pass ${pass.id}] Building and testing ${pass.label}...`);
      cleanDistFn();
      await runCommandFn('npm run build', pass.buildEnv);

      console.log(`>>> Starting preview server for ${pass.label}...`);
      const server = await startPreviewFn();
      activeServer = server;
      let passError: unknown = null;
      let stopError: unknown = null;

      try {
        console.log(`>>> Running Playwright smoke tests against ${pass.label} (${server.baseUrl})...`);
        await runCommandFn(`npx playwright test ${pass.testSpecs.join(' ')}`, {
          PLAYWRIGHT_TEST_BASE_URL: server.baseUrl,
        });
      } catch (err) {
        passError = err;
        throw err;
      } finally {
        activeServer = null;
        try {
          await stopPreviewFn(server);
        } catch (err) {
          if (passError) {
            console.error(
              `[preview] Cleanup error after Pass ${pass.id} failure (original error preserved): ${formatError(err)}`
            );
          } else {
            stopError = err;
          }
        }
      }

      if (stopError) {
        throw stopError;
      }
    }
  } catch (err) {
    executionError = err instanceof Error ? err : new Error(String(err));
  } finally {
    process.off('SIGINT', handleSignal);
    process.off('SIGTERM', handleSignal);

    // GUARANTEED CLEANUP: Always restore a clean public build in dist/ regardless of test success or failure
    console.log('\n>>> Restoring clean public build in dist/...');
    try {
      cleanDistFn();
      await runCommandFn('npm run build');
    } catch (restoreErr) {
      if (executionError) {
        console.error(
          `[smoke] Failed to restore clean public dist/ after suite error (original error preserved): ${formatError(restoreErr)}`
        );
      } else {
        executionError = restoreErr instanceof Error ? restoreErr : new Error(String(restoreErr));
      }
    }
  }

  if (executionError) {
    throw executionError;
  }

  console.log('\n======================================================');
  console.log('SUCCESS: All regression passes and build checks passed!');
  console.log('======================================================\n');
}

const isEntrypoint =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isEntrypoint) {
  runSmokeSuite().catch(err => {
    console.error('\nFAILED: Regression suite error:', formatError(err));
    process.exit(1);
  });
}
