import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const PORT = 4173;

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForServer(url: string, retries = 30): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      await sleep(200);
    }
  }
  return false;
}

async function waitForPortFree(url: string, retries = 30): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    try {
      await fetch(url);
      await sleep(150);
    } catch {
      return true;
    }
  }
  return false;
}

function runCommand(command: string, env: Record<string, string> = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, {
      shell: true,
      stdio: 'inherit',
      env: { ...process.env, ...env },
    });
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`Command "${command}" exited with code ${code}`));
    });
  });
}

async function stopPreviewServer(proc: ChildProcess): Promise<void> {
  if (proc.killed || proc.exitCode !== null) return;
  proc.kill('SIGTERM');
  await new Promise<void>(resolve => {
    proc.on('close', () => resolve());
    setTimeout(resolve, 2000);
  });
  const freed = await waitForPortFree(`http://localhost:${PORT}`);
  if (!freed) {
    proc.kill('SIGKILL');
    await sleep(200);
  }
}

async function startPreviewServer(): Promise<ChildProcess> {
  // Ensure port is not currently held by a stale process
  await waitForPortFree(`http://localhost:${PORT}`);

  const proc = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    stdio: 'ignore',
  });
  const ready = await waitForServer(`http://localhost:${PORT}`);
  if (!ready) {
    await stopPreviewServer(proc);
    throw new Error(`Preview server did not become ready on port ${PORT}`);
  }
  return proc;
}

function cleanDist() {
  const distPath = path.resolve(process.cwd(), 'dist');
  if (fs.existsSync(distPath)) {
    fs.rmSync(distPath, { recursive: true, force: true });
  }
}

async function main() {
  console.log('=== Bibleberry Automated Reader Regression Suite ===\n');

  let executionError: Error | null = null;

  try {
    // ---------------------------------------------------------
    // PASS 1: Public Production Build (Standard public bundle)
    // ---------------------------------------------------------
    console.log('>>> [Pass 1] Building and testing Public Production Bundle...');
    cleanDist();
    await runCommand('npm run build');

    console.log('>>> Starting preview server for Public Bundle...');
    const server1 = await startPreviewServer();
    try {
      // Run tests targeting public build: navigation, today-resume, memorization, build-isolation
      console.log('>>> Running Playwright smoke tests against Public Bundle...');
      await runCommand('npx playwright test tests/smoke/navigation.spec.ts tests/smoke/today-resume.spec.ts tests/smoke/memorization.spec.ts tests/smoke/build-isolation.spec.ts tests/smoke/frame-safe-storage.spec.ts', {
        PLAYWRIGHT_TEST_BASE_URL: `http://localhost:${PORT}`,
      });
    } finally {
      await stopPreviewServer(server1);
    }

    // ---------------------------------------------------------
    // PASS 2: Testing-Enabled Build (Developer Studio included)
    // ---------------------------------------------------------
    console.log('\n>>> [Pass 2] Building and testing Developer-Enabled Bundle...');
    cleanDist();
    await runCommand('npm run build', { VITE_ENABLE_DEVELOPER_STUDIO: 'true' });

    console.log('>>> Starting preview server for Developer-Enabled Bundle...');
    const server2 = await startPreviewServer();
    try {
      console.log('>>> Running Playwright smoke tests against Developer-Enabled Bundle...');
      await runCommand('npx playwright test tests/smoke/interactive-lab.spec.ts tests/smoke/cms-challenge-player.spec.ts', {
        PLAYWRIGHT_TEST_BASE_URL: `http://localhost:${PORT}`,
      });
    } finally {
      await stopPreviewServer(server2);
    }

    // ---------------------------------------------------------
    // PASS 3: Pilot-Enabled Ordinary Shell Build (Developer Studio excluded)
    // ---------------------------------------------------------
    console.log('\n>>> [Pass 3] Building and testing Challenge-Pilot-Enabled Ordinary Bundle...');
    cleanDist();
    await runCommand('npm run build', { VITE_ENABLE_CHALLENGE_PILOT: 'true' });

    console.log('>>> Starting preview server for Challenge-Pilot-Enabled Bundle...');
    const server3 = await startPreviewServer();
    try {
      console.log('>>> Running Playwright smoke tests against Challenge-Pilot-Enabled Bundle...');
      await runCommand('npx playwright test tests/smoke/ordinary-challenge-pilot.spec.ts', {
        PLAYWRIGHT_TEST_BASE_URL: `http://localhost:${PORT}`,
      });
    } finally {
      await stopPreviewServer(server3);
    }

    // ---------------------------------------------------------
    // PASS 4: Participation-Pilot-Enabled Bundle (Isolated A3 Persistence Pilot)
    // ---------------------------------------------------------
    console.log('\n>>> [Pass 4] Building and testing Participation-Pilot-Enabled Bundle...');
    cleanDist();
    await runCommand('npm run build', { VITE_ENABLE_PARTICIPATION_PILOT: 'true' });

    console.log('>>> Starting preview server for Participation-Pilot-Enabled Bundle...');
    const server4 = await startPreviewServer();
    try {
      console.log('>>> Running Playwright smoke tests against Participation-Pilot-Enabled Bundle...');
      await runCommand('npx playwright test tests/smoke/participation-pilot.spec.ts', {
        PLAYWRIGHT_TEST_BASE_URL: `http://localhost:${PORT}`,
      });
    } finally {
      await stopPreviewServer(server4);
    }

    // ---------------------------------------------------------
    // PASS 5: Released-Challenge-Enabled Bundle (A4.1 Controlled CMS-to-Reader Route)
    // ---------------------------------------------------------
    console.log('\n>>> [Pass 5] Building and testing Released-Challenge-Enabled Bundle...');
    cleanDist();
    await runCommand('npm run build', { VITE_ENABLE_RELEASED_CHALLENGE_ROUTE: 'true' });

    console.log('>>> Starting preview server for Released-Challenge-Enabled Bundle...');
    const server5 = await startPreviewServer();
    try {
      console.log('>>> Running Playwright smoke tests against Released-Challenge-Enabled Bundle...');
      await runCommand('npx playwright test tests/smoke/released-challenge.spec.ts', {
        PLAYWRIGHT_TEST_BASE_URL: `http://localhost:${PORT}`,
      });
    } finally {
      await stopPreviewServer(server5);
    }

    // ---------------------------------------------------------
    // PASS 6: Gateway-Backed Released-Challenge Bundle (R05 Stage 2A)
    // ---------------------------------------------------------
    console.log('\n>>> [Pass 6] Building and testing Gateway-Backed Released-Challenge Bundle...');
    cleanDist();
    await runCommand('npm run build', {
      VITE_ENABLE_RELEASED_CHALLENGE_ROUTE: 'true',
      VITE_ENABLE_RELEASE_GATEWAY_SOURCE: 'true',
    });

    console.log('>>> Starting preview server for Gateway-Backed Released-Challenge Bundle...');
    const server6 = await startPreviewServer();
    try {
      console.log('>>> Running Playwright smoke tests against Gateway-Backed Released-Challenge Bundle...');
      await runCommand('npx playwright test tests/smoke/gateway-released-challenge.spec.ts', {
        PLAYWRIGHT_TEST_BASE_URL: `http://localhost:${PORT}`,
      });
    } finally {
      await stopPreviewServer(server6);
    }
  } catch (err) {
    executionError = err as Error;
  } finally {
    // GUARANTEED CLEANUP: Always restore a clean public build in dist/ regardless of test success or failure
    console.log('\n>>> Restoring clean public build in dist/...');
    cleanDist();
    await runCommand('npm run build');
  }

  if (executionError) {
    throw executionError;
  }

  console.log('\n======================================================');
  console.log('SUCCESS: All regression passes and build checks passed!');
  console.log('======================================================\n');
}

main().catch(err => {
  console.error('\nFAILED: Regression suite error:', err.message);
  process.exit(1);
});
