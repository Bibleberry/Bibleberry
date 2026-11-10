import { test, expect } from './helpers/frameSafeTest';

test.describe('Scripture Memorization Phrase-Reveal Tool', () => {
  let uncaughtErrors: Error[] = [];

  test.beforeEach(async ({ page }) => {
    uncaughtErrors = [];
    page.on('pageerror', err => uncaughtErrors.push(err));
  });

  test.afterEach(async () => {
    expect(uncaughtErrors).toEqual([]);
  });

  test('Sunday pilot memorization reveals phrases incrementally and resets cleanly', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('bibleberry-prototype-v1', JSON.stringify({
        onboarded: true,
        appearance: 'system',
        textSize: 'default',
        reminderEnabled: false,
        reminderTime: '08:00',
        explored: [],
        journey: [],
        lastOpened: null,
        resumeDismissedDate: '',
      }));
    });

    // Directly open the Sunday Weekly Rhythm Pilot memorization entry
    await page.goto('/#/entry/weekly-pilot-2026-11-08');

    // Confirm memorization view is displayed
    const memorizationTool = page.locator('.memorization-tool');
    await expect(memorizationTool).toBeVisible();
    await expect(page.locator('.memorization-reference')).toContainText('John 1:3');

    // Initially phrases are hidden (.memorization-phrases li.is-hidden)
    const phraseItems = page.locator('.memorization-phrases li');
    const totalPhrases = await phraseItems.count();
    expect(totalPhrases).toBeGreaterThan(0);
    await expect(page.locator('.memorization-phrases li.is-hidden')).toHaveCount(totalPhrases);

    // Click "Reveal next phrase"
    const revealNextBtn = page.locator('button:has-text("Reveal next phrase")');
    await revealNextBtn.click();
    await expect(page.locator('.memorization-phrases li.is-hidden')).toHaveCount(totalPhrases - 1);

    // Click "Reveal all"
    const revealAllBtn = page.locator('button:has-text("Reveal all")');
    await revealAllBtn.click();
    await expect(page.locator('.memorization-phrases li.is-hidden')).toHaveCount(0);

    // Click "Start again"
    const resetBtn = page.locator('button:has-text("Start again")');
    await resetBtn.click();
    await expect(page.locator('.memorization-phrases li.is-hidden')).toHaveCount(totalPhrases);
  });
});
