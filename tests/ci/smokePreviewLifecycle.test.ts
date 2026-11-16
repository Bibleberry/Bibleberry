import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  DEFAULT_PREVIEW_HOST,
  SMOKE_PASSES,
  isPortAvailable,
  runSmokeSuite,
  startPreviewServer,
  stopPreviewServer,
  type StartedPreviewServer,
} from '../../scripts/run-smoke-suite.ts';

function createTempPreviewFixture(marker: string): { root: string; cleanup: () => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bibleberry-smoke-preview-'));
  const distDir = path.join(root, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(
    path.join(distDir, 'index.html'),
    `<!doctype html><html><body><main>${marker}</main></body></html>`,
    'utf8'
  );
  return {
    root,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

async function occupyPort(host: string, port: number, body: string): Promise<HttpServer | null> {
  return new Promise((resolve, reject) => {
    const server = createHttpServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(body);
    });
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve(null);
        return;
      }
      reject(err);
    });
    server.listen(port, host, () => resolve(server));
  });
}

async function closeHttpServer(server: HttpServer | null): Promise<void> {
  if (!server) return;
  server.closeAllConnections?.();
  await new Promise<void>((resolve, reject) => {
    server.close(err => (err ? reject(err) : resolve()));
  });
}

test('smoke preview binds to an OS-assigned loopback port even when port 4173 is occupied', async t => {
  const fixture = createTempPreviewFixture('fixture-with-4173-occupied');
  const blocker = await occupyPort(DEFAULT_PREVIEW_HOST, 4173, 'unrelated-4173-server');
  t.after(async () => {
    await closeHttpServer(blocker);
    fixture.cleanup();
  });

  const handle = await startPreviewServer({
    root: fixture.root,
    configFile: false,
  });

  try {
    assert.equal(handle.host, DEFAULT_PREVIEW_HOST);
    assert.ok(handle.port > 0, `Expected positive bound port, got ${handle.port}`);
    assert.notEqual(handle.port, 4173, 'Preview must not rely on fixed port 4173');
    assert.equal(handle.baseUrl, `http://${DEFAULT_PREVIEW_HOST}:${handle.port}`);

    const res = await fetch(handle.baseUrl);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /fixture-with-4173-occupied/);
    assert.doesNotMatch(html, /unrelated-4173-server/);
  } finally {
    const stopResult = await stopPreviewServer(handle);
    assert.ok(stopResult?.portReleased, `Expected port ${handle.port} to be released`);
    assert.equal(await isPortAvailable(handle.host, handle.port), true);
  }
});

test('smoke preview responds to readiness checks and genuinely releases its port on close', async t => {
  const fixture = createTempPreviewFixture('clean-readiness-and-release');
  t.after(() => fixture.cleanup());

  const handle = await startPreviewServer({
    root: fixture.root,
    configFile: false,
  });

  const res = await fetch(handle.baseUrl);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /clean-readiness-and-release/);

  const stopResult = await stopPreviewServer(handle);
  assert.ok(stopResult);
  assert.equal(stopResult.portReleased, true);
  assert.equal(await isPortAvailable(handle.host, handle.port), true);

  await assert.rejects(
    () => fetch(handle.baseUrl),
    /fetch failed|ECONNREFUSED/i
  );
});

test('deliberate startup failure reports specific cause and leaves no server behind', async t => {
  const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bibleberry-smoke-empty-'));
  t.after(() => fs.rmSync(emptyRoot, { recursive: true, force: true }));

  // Missing dist/index.html causes Vite preview to return HTTP 404 on readiness check.
  await assert.rejects(
    () =>
      startPreviewServer({
        root: emptyRoot,
        configFile: false,
        readinessTimeoutMs: 400,
      }),
    /did not become ready.*HTTP 404/i
  );

  // Requesting an already-occupied explicit port reports bind failure immediately.
  const blocker = await occupyPort(DEFAULT_PREVIEW_HOST, 0, 'explicit-port-blocker');
  assert.ok(blocker);
  const address = blocker.address();
  assert.ok(address && typeof address !== 'string');
  t.after(() => closeHttpServer(blocker));

  await assert.rejects(
    () =>
      startPreviewServer({
        root: emptyRoot,
        configFile: false,
        host: DEFAULT_PREVIEW_HOST,
        port: address.port,
      }),
    /Failed to start Vite preview server.*EADDRINUSE|Port .* is already in use/i
  );
});

test('smoke-test failure reports original cause, closes preview server, and restores clean dist/', async t => {
  const fixture = createTempPreviewFixture('smoke-failure-cleanup');
  t.after(() => fixture.cleanup());

  let startedHandle: StartedPreviewServer | null = null;
  let cleanDistCalls = 0;
  const commands: Array<{ command: string; env: Record<string, string> }> = [];

  await assert.rejects(
    () =>
      runSmokeSuite({
        passes: [SMOKE_PASSES[0]],
        cleanDistFn: () => {
          cleanDistCalls += 1;
        },
        startPreviewFn: async () => {
          startedHandle = await startPreviewServer({
            root: fixture.root,
            configFile: false,
          });
          return startedHandle;
        },
        runCommandFn: async (command, env = {}) => {
          commands.push({ command, env });
          if (command.startsWith('npx playwright test')) {
            assert.match(env.PLAYWRIGHT_TEST_BASE_URL ?? '', /^http:\/\/127\.0\.0\.1:\d+$/);
            throw new Error('deliberate smoke test failure');
          }
        },
      }),
    /deliberate smoke test failure/
  );

  assert.ok(startedHandle, 'Preview server should have been started');
  assert.equal(await isPortAvailable(startedHandle.host, startedHandle.port), true);
  assert.equal(cleanDistCalls, 2, 'Expected cleanDist before Pass 1 and during final restoration');
  assert.equal(commands[0]?.command, 'npm run build');
  assert.equal(commands[2]?.command, 'npm run build');
});

test('sequential start/stop of seven preview servers does not collide', async t => {
  const fixture = createTempPreviewFixture('sequential-seven-pass');
  t.after(() => fixture.cleanup());

  const observedPorts: number[] = [];
  for (let pass = 1; pass <= 7; pass += 1) {
    const handle = await startPreviewServer({
      root: fixture.root,
      configFile: false,
    });
    observedPorts.push(handle.port);
    const res = await fetch(handle.baseUrl);
    assert.equal(res.status, 200);
    const stopResult = await stopPreviewServer(handle);
    assert.equal(stopResult?.portReleased, true);
    assert.equal(await isPortAvailable(handle.host, handle.port), true);
  }

  assert.equal(observedPorts.length, 7);
  for (const port of observedPorts) {
    assert.ok(port > 0);
  }
});

test('smoke suite configuration preserves all 7 passes and stays strictly local', () => {
  assert.equal(SMOKE_PASSES.length, 7);
  assert.equal(DEFAULT_PREVIEW_HOST, '127.0.0.1');
  assert.deepEqual(
    SMOKE_PASSES.map(p => p.id),
    [1, 2, 3, 4, 5, 6, 7]
  );

  for (const pass of SMOKE_PASSES) {
    assert.ok(pass.testSpecs.length > 0, `Pass ${pass.id} must define Playwright specs`);
    for (const [key, value] of Object.entries(pass.buildEnv)) {
      assert.match(key, /^VITE_ENABLE_/);
      assert.equal(value, 'true');
    }
  }
});
