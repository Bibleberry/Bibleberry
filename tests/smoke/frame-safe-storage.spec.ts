import { test, expect } from './helpers/frameSafeTest';
import { test as rawTest, expect as rawExpect } from '@playwright/test';

const STORAGE_KEY = 'r17-1-frame-safe-seed';
// Port 1 refuses connections, so Chromium renders a chrome-error:// document with no internet needed.
const UNREACHABLE_EMBED = 'http://127.0.0.1:1/podcast-embed';

async function embedUnreachableFrame(page: import('@playwright/test').Page) {
  await page.evaluate(src => {
    const frame = document.createElement('iframe');
    frame.src = src;
    document.body.appendChild(frame);
  }, UNREACHABLE_EMBED);
  await expect.poll(
    () => page.frames().some(frame => frame.url().startsWith('chrome-error://')),
  ).toBe(true);
}

test.describe('Frame-safe storage seeding', () => {
  test('seeds first-party storage and skips an inaccessible iframe without pageerrors', async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', err => pageErrors.push(err));

    await page.addInitScript(key => {
      localStorage.setItem(key, JSON.stringify({ onboarded: true }));
    }, STORAGE_KEY);

    await page.goto('/');
    await embedUnreachableFrame(page);
    await page.reload();
    await embedUnreachableFrame(page);

    const stored = await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY);
    expect(JSON.parse(stored ?? '{}')).toEqual({ onboarded: true });
    expect(pageErrors).toEqual([]);
  });

  test('still reports genuine first-party uncaught errors', async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', err => pageErrors.push(err));

    await page.addInitScript(() => {
      localStorage.setItem('bibleberry-prototype-v1', '{}');
    });
    await page.goto('/');
    await embedUnreachableFrame(page);
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error('first-party-boom');
      }, 0);
    });

    await expect.poll(() => pageErrors.map(err => err.message)).toEqual(['first-party-boom']);
  });
});

rawTest.describe('Unguarded seeding control', () => {
  rawTest('raw page.addInitScript throws SecurityError in the failed frame', async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', err => pageErrors.push(err));

    await page.addInitScript(() => {
      localStorage.setItem('bibleberry-prototype-v1', '{}');
    });
    await page.goto('/');
    await page.evaluate(src => {
      const frame = document.createElement('iframe');
      frame.src = src;
      document.body.appendChild(frame);
    }, UNREACHABLE_EMBED);

    await rawExpect.poll(() => pageErrors.map(err => err.name)).toContain('SecurityError');
  });
});
