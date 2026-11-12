import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { chromium } from '@playwright/test';
import { startPreviewServer, stopPreviewServer } from '../../scripts/performance/previewServer.ts';
import { addTopFrameInitScript } from '../smoke/helpers/frameSafeTest.ts';

const execFileAsync = promisify(execFile);
const STORAGE_KEY = 'bibleberry-prototype-v1';

async function buildProductionOutDir(
  outDir: string,
  envOverrides: Record<string, string> = {},
): Promise<void> {
  const viteCli = path.resolve('node_modules/vite/bin/vite.js');
  await execFileAsync(
    process.execPath,
    [viteCli, 'build', '--outDir', outDir, '--emptyOutDir'],
    {
      env: { ...process.env, ...envOverrides },
    },
  );
}

async function seedOnboardedReader(page: import('@playwright/test').Page): Promise<void> {
  await addTopFrameInitScript(page, (storageKey: string) => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        onboarded: true,
        appearance: 'system',
        textSize: 'default',
        reminderEnabled: false,
        reminderTime: '08:00',
        explored: [],
        journey: [],
        lastOpened: null,
        resumeDismissedDate: '',
      }),
    );
  }, STORAGE_KEY);
}

test('public production build keeps bundled historical prototype data readable offline while blocking external fonts', async t => {
  let outDir = path.resolve('dist');
  let createdTempDir = false;
  try {
    await fs.access(path.join(outDir, 'index.html'));
  } catch {
    outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bibleberry-r21-public-dist-'));
    createdTempDir = true;
    await buildProductionOutDir(outDir);
  }

  const started = await startPreviewServer({ outDir });
  t.after(async () => {
    await stopPreviewServer(started.server);
    if (createdTempDir) {
      await fs.rm(outDir, { recursive: true, force: true });
    }
  });

  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });

  try {
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    // Simulate unreachable external font host + 4x CPU / 3G constrained delivery
    await page.route('https://fonts.googleapis.com/**', route => route.abort('failed'));
    await page.route('https://fonts.gstatic.com/**', route => route.abort('failed'));
    const session = await context.newCDPSession(page);
    await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await session.send('Network.enable');
    await session.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: 200 * 1024,
      uploadThroughput: 96 * 1024,
      connectionType: 'cellular3g',
    });

    await seedOnboardedReader(page);
    await page.goto(started.baseUrl, { waitUntil: 'load' });
    await page.locator('#daily-teaching h1').waitFor({ state: 'visible' });

    // Abruptly lose network after initial load: bundled historical prototype data in JS remains navigable
    await context.setOffline(true);
    await page.locator('.app-shell nav button:visible:has-text("Archive")').first().click();
    await page.locator('.archive-page').waitFor({ state: 'visible' });
    await page.locator('.archive-row').first().click();
    await page.locator('#daily-teaching h1').waitFor({ state: 'visible' });

    const paragraphCount = await page.locator('#daily-teaching p').count();
    assert.ok(paragraphCount > 0, 'Expected historical prototype teaching paragraphs to render offline');
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
});

test('server-backed Gateway Challenge surfaces reader-friendly error and Retry recovery on network interruption', async t => {
  const tempOutDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bibleberry-r21-gateway-dist-'));
  await buildProductionOutDir(tempOutDir, {
    VITE_ENABLE_RELEASED_CHALLENGE_ROUTE: 'true',
    VITE_ENABLE_RELEASE_GATEWAY_SOURCE: 'true',
  });

  const started = await startPreviewServer({ outDir: tempOutDir });
  t.after(async () => {
    await stopPreviewServer(started.server);
    await fs.rm(tempOutDir, { recursive: true, force: true });
  });

  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });

  try {
    const page = await context.newPage();
    const pageErrors: string[] = [];
    let sanityCalls = 0;
    let gatewayAttempts = 0;

    page.on('pageerror', err => pageErrors.push(err.message));
    await page.clock.setFixedTime(new Date('2026-11-06T12:00:00Z'));

    await page.route('https://*.api.sanity.io/**', route => {
      sanityCalls += 1;
      return route.abort('failed');
    });

    await page.route('**/api/challenges/**', async route => {
      gatewayAttempts += 1;
      if (gatewayAttempts === 1) {
        return route.abort('failed');
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          challenge: {
            _id: 'r21-mock-gateway-challenge-1',
            _type: 'challenge',
            title: 'Walking in the Light',
            slug: 'walking-in-the-light',
            challengeType: 'teaching',
            series: {
              _id: 'r21-mock-series-1',
              title: 'Epistle of 1 John',
              slug: '1-john',
            },
            sequence: 1,
            releaseAt: '2026-11-02T09:00:00-05:00',
            primaryScripture: {
              reference: '1 John 1:7',
              translation: 'ESV',
              textStatus: 'provided',
              passage: 'If we walk in the light, as he is in the light, we have fellowship with one another.',
              usageRightsConfirmed: true,
              practiceStatus: 'configured',
            },
            screens: [
              {
                _key: 'screen-step-1',
                _type: 'challengeScreen',
                screenLabel: 'Step 1',
                heading: 'First Step Heading',
                blocks: [
                  {
                    _key: 'block-step-1-text',
                    _type: 'statementBlock',
                    text: 'Recovered server-backed Challenge content after Retry.',
                  },
                ],
              },
            ],
            companionLinks: [],
            editorialEligibility: {
              adaptationReviewed: true,
              reviewedAt: '2026-11-01T12:00:00Z',
            },
          },
        }),
      });
    });

    const session = await context.newCDPSession(page);
    await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await session.send('Network.enable');
    await session.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: 200 * 1024,
      uploadThroughput: 96 * 1024,
      connectionType: 'cellular3g',
    });

    await seedOnboardedReader(page);
    await page.goto(`${started.baseUrl}/#/challenge/walking-in-the-light`, { waitUntil: 'load' });

    const errorPanel = page.locator('.error-panel[role="alert"]');
    await errorPanel.waitFor({ state: 'visible' });
    const heading = (await errorPanel.locator('h2').textContent())?.trim();
    assert.equal(heading, 'Unable to load Challenge');

    const retryButton = page.locator('button[aria-label="Retry loading Challenge"]');
    await retryButton.waitFor({ state: 'visible' });
    await retryButton.click();

    await page.locator('.lab-challenge-header h1').waitFor({ state: 'visible' });
    const title = (await page.locator('.lab-challenge-header h1').textContent())?.trim();
    const statement = (await page.locator('.lab-statement p').textContent())?.trim();
    assert.equal(title, 'Walking in the Light');
    assert.match(statement ?? '', /Recovered server-backed Challenge content after Retry\./);
    assert.equal(gatewayAttempts, 2);
    assert.equal(sanityCalls, 0);
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
});
