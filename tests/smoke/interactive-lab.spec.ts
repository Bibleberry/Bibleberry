import { test, expect } from '@playwright/test';

test.describe('Interactive Challenge Lab and State Isolation', () => {
  test('guided Challenge progress, saves, completion, and strict storage isolation', async ({ page }) => {
    // Check if Developer Studio is available in this build (e.g. testing build)
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

    await page.goto('/');
    await page.locator('.app-shell nav button:has-text("More")').first().click();

    const devStudioBtn = page.locator('button.developer-studio-entry');
    const isDevStudioAvailable = await devStudioBtn.isVisible();

    if (!isDevStudioAvailable) {
      test.skip(!isDevStudioAvailable, 'Developer Studio not included in this build');
      return;
    }

    // Open Developer Studio -> Interactive Challenge Lab
    await devStudioBtn.click();
    await page.locator('button:has-text("Open Interactive Challenge Lab")').click();

    await expect(page.locator('.lab-home-intro')).toBeVisible();

    // Select Nov 1 Challenge ("God’s Will: Three Commands")
    await page.locator('.lab-challenge-row__open:has-text("Three Commands")').click();
    await expect(page.locator('.lab-screen')).toBeVisible();

    // Bookmark/Save Challenge
    const saveChallengeBtn = page.locator('button.lab-save-challenge');
    if (await saveChallengeBtn.isVisible()) {
      await saveChallengeBtn.click();
      await expect(page.locator('button.lab-save-challenge:has-text("Remove Saved Challenge")')).toBeVisible();
    }

    // Advance through the required screens to completion
    let continueBtn = page.locator('.lab-screen-nav button:has-text("Continue")');
    while (await continueBtn.isVisible()) {
      await continueBtn.click();
      await page.waitForTimeout(200);
      continueBtn = page.locator('.lab-screen-nav button:has-text("Continue")');
    }

    // Click "Complete Challenge"
    const completeBtn = page.locator('.lab-screen-nav button:has-text("Complete Challenge")');
    await expect(completeBtn).toBeVisible();
    await completeBtn.click();

    // Confirm completion state in lab
    await expect(page.locator('.lab-completion')).toBeVisible();

    // Strict state isolation check
    const storageKeys = await page.evaluate(() => {
      return {
        hasLabStorage: localStorage.getItem('bibleberry-interactive-challenge-lab-v1') !== null,
        prototypeState: JSON.parse(localStorage.getItem('bibleberry-prototype-v1') || '{}'),
        labState: JSON.parse(localStorage.getItem('bibleberry-interactive-challenge-lab-v1') || '{}'),
      };
    });

    // Lab state must exist and contain completion
    expect(storageKeys.hasLabStorage).toBe(true);
    expect(storageKeys.labState.completedChallengeIds).toContain('nov-1');

    // Ordinary prototype state must NOT have lab data mixed in
    expect(storageKeys.prototypeState.completedChallengeIds).toBeUndefined();
  });
});
