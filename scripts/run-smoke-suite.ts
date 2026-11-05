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

async function startPreviewServer(): Promise<ChildProcess> {
  const proc = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    stdio: 'ignore',
  });
  const ready = await waitForServer(`http://localhost:${PORT}`);
  if (!ready) {
    proc.kill();
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

  // ---------------------------------------------------------
  // PASS 1: Public Production Build (Standard public bundle)
  // ---------------------------------------------------------
  console.log('>>> [Pass 1] Building and testing Public Production Bundle...');
  cleanDist();
  await runCommand('npm run build');

  console.log('>>> Starting preview server for Public Bundle...');
  let server = await startPreviewServer();
  try {
    // Run tests targeting public build: navigation, today-resume, memorization, build-isolation
    console.log('>>> Running Playwright smoke tests against Public Bundle...');
    await runCommand('npx playwright test tests/smoke/navigation.spec.ts tests/smoke/today-resume.spec.ts tests/smoke/memorization.spec.ts tests/smoke/build-isolation.spec.ts', {
      PLAYWRIGHT_TEST_BASE_URL: `http://localhost:${PORT}`,
    });
  } finally {
    server.kill();
    await sleep(500);
  }

  // ---------------------------------------------------------
  // PASS 2: Testing-Enabled Build (Developer Studio included)
  // ---------------------------------------------------------
  console.log('\n>>> [Pass 2] Building and testing Developer-Enabled Bundle...');
  cleanDist();
  await runCommand('npm run build', { VITE_ENABLE_DEVELOPER_STUDIO: 'true' });

  console.log('>>> Starting preview server for Developer-Enabled Bundle...');
  server = await startPreviewServer();
  try {
    console.log('>>> Running Playwright smoke tests against Developer-Enabled Bundle...');
    await runCommand('npx playwright test tests/smoke/interactive-lab.spec.ts', {
      PLAYWRIGHT_TEST_BASE_URL: `http://localhost:${PORT}`,
    });
  } finally {
    server.kill();
    await sleep(500);
  }

  // Restore clean public build in dist
  console.log('\n>>> Restoring clean public build in dist/...');
  cleanDist();
  await runCommand('npm run build');

  console.log('\n======================================================');
  console.log('SUCCESS: All regression passes and build checks passed!');
  console.log('======================================================\n');
}

main().catch(err => {
  console.error('\nFAILED: Regression suite error:', err.message);
  process.exit(1);
});
