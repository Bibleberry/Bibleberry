import { test, expect } from '@playwright/test';

test.describe('Interactive Challenge Lab and State Isolation', () => {
  let uncaughtErrors: Error[] = [];

  test.beforeEach(async ({ page }) => {
    uncaughtErrors = [];
    page.on('pageerror', err => uncaughtErrors.push(err));
  });

  test.afterEach(async () => {
    expect(uncaughtErrors).toEqual([]);
  });

  test('Developer Studio lazily opens a pilot formation experience', async ({ page }) => {
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
    await page.locator('button.developer-studio-entry').click();
    await page.getByRole('button', { name: 'Test guided spiritual discipline' }).click();
    await expect(page.locator('.formation-entry h1')).toHaveText('Making Room to Stop');
  });

  test('guided Challenge progress, saves, completion, backtracking, Scripture practice, and storage isolation', async ({ page }) => {
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

    // In developer-enabled build, Developer Studio MUST be present unconditionally
    const devStudioBtn = page.locator('button.developer-studio-entry');
    await expect(devStudioBtn).toBeVisible();

    // Open Developer Studio -> Interactive Challenge Lab
    await devStudioBtn.click();
    await page.locator('button:has-text("Open Interactive Challenge Lab")').click();
    await expect(page.locator('.lab-home-intro')).toBeVisible();

    // -------------------------------------------------------------
    // Part 1: Open Nov 1 Challenge, test Scripture Save & Practice
    // -------------------------------------------------------------
    await page.locator('.lab-challenge-row__open:has-text("Three Commands")').click();
    await expect(page.locator('.lab-screen')).toBeVisible();

    // Screen 1: Save Scripture to My Scripture
    const scriptureSaveBtn = page.locator('.lab-scripture .lab-scripture-save');
    await expect(scriptureSaveBtn).toBeVisible();
    await expect(scriptureSaveBtn).toContainText('Add to My Scripture');
    await scriptureSaveBtn.click();
    await expect(scriptureSaveBtn).toContainText('Remove from My Scripture');

    // Return to Lab Home -> Open My Scripture
    await page.locator('.lab-topbar button:has-text("Challenge Lab home")').click();
    await expect(page.locator('.lab-home-intro')).toBeVisible();

    await page.locator('.lab-library-link button:has-text("Open My Scripture")').click();
    await expect(page.locator('#my-scripture-title')).toBeVisible();

    // Verify saved scripture appears with practice configured
    const savedScripture = page.locator('.lab-saved-scripture');
    await expect(savedScripture).toBeVisible();
    await expect(savedScripture).toContainText('1 Thessalonians 5:16–18');

    const practiceBtn = savedScripture.locator('button:has-text("Practice this passage")');
    await expect(practiceBtn).toBeVisible();
    await practiceBtn.click();

    // Verify Practice View with Memorization tool
    await expect(page.locator('.lab-practice-view')).toBeVisible();
    await expect(page.locator('.memorization-tool')).toBeVisible();

    // Return to My Scripture and remove saved passage
    await page.locator('button:has-text("Back to My Scripture")').click();
    await expect(page.locator('#my-scripture-title')).toBeVisible();

    await page.locator('.lab-saved-scripture button:has-text("Remove from My Scripture")').click();
    await expect(page.locator('.empty-state')).toContainText('No Scripture saved yet');

    // Return to Challenge Lab home
    await page.locator('button:has-text("Back to Challenge Lab")').click();
    await expect(page.locator('.lab-home-intro')).toBeVisible();

    // -------------------------------------------------------------
    // Part 2: Saved Challenge vs Completed Challenge distinction
    // -------------------------------------------------------------
    // Re-open Nov 1 Challenge
    await page.locator('.lab-challenge-row__open:has-text("Three Commands")').click();
    await expect(page.locator('.lab-screen')).toBeVisible();

    // Save Challenge bookmark
    const saveChallengeBtn = page.locator('button.lab-save-challenge');
    await expect(saveChallengeBtn).toBeVisible();
    await expect(saveChallengeBtn).toContainText('Save Challenge');
    await saveChallengeBtn.click();
    await expect(saveChallengeBtn).toContainText('Remove Saved Challenge');

    // Verify localStorage: savedChallengeIds contains 'nov-1', but completedChallengeIds does NOT
    const stateAfterSave = JSON.parse(await page.evaluate(() => localStorage.getItem('bibleberry-interactive-challenge-lab-v1') || '{}'));
    expect(stateAfterSave.savedChallengeIds).toContain('nov-1');
    expect(stateAfterSave.completedChallengeIds).not.toContain('nov-1');

    // -------------------------------------------------------------
    // Part 3: Backtracking and Optional Study Non-requirement
    // -------------------------------------------------------------
    // Advance to Screen 2
    await page.locator('.lab-screen-nav button:has-text("Continue")').click();
    await expect(page.locator('.lab-screen h2')).toContainText('Three choices that belong to our identity');

    // Test Back button (backtracking)
    const backBtn = page.locator('.lab-screen-nav button:has-text("Back")');
    await expect(backBtn).toBeVisible();
    await backBtn.click();
    await expect(page.locator('.lab-screen h2')).toContainText('What is God’s will for us?');

    // Go back forward to Screen 2
    await page.locator('.lab-screen-nav button:has-text("Continue")').click();
    await expect(page.locator('.lab-screen h2')).toContainText('Three choices that belong to our identity');

    // Screen 2 has an optional deeper study; verify Continue works without expanding it
    const optionalToggle = page.locator('.lab-optional__toggle');
    await expect(optionalToggle).toBeVisible();
    await expect(optionalToggle).toHaveAttribute('aria-expanded', 'false');

    // Continue to Screen 3 without opening optional study
    await page.locator('.lab-screen-nav button:has-text("Continue")').click();
    await expect(page.locator('.lab-screen h2')).toContainText('Small verses, serious commands');

    // -------------------------------------------------------------
    // Part 4: Resume Position after Reload
    // -------------------------------------------------------------
    // Reload page while on Screen 3
    await page.reload();
    await page.locator('.app-shell nav button:has-text("More")').first().click();
    await page.locator('button.developer-studio-entry').click();
    await page.locator('button:has-text("Open Interactive Challenge Lab")').click();

    // Verify ChallengeHome shows resume position (Screen 3 of 5)
    await expect(page.locator('.lab-challenge-row:has-text("Three Commands")')).toContainText('Resume at 3 of 5');

    // Reopen Nov 1 -> resumes at Screen 3
    await page.locator('.lab-challenge-row__open:has-text("Three Commands")').click();
    await expect(page.locator('.lab-screen h2')).toContainText('Small verses, serious commands');

    // Advance to Screen 4 (Reflect)
    await page.locator('.lab-screen-nav button:has-text("Continue")').click();
    await expect(page.locator('.lab-screen h2')).toContainText('Which command gives you pause?');

    // Screen 4 has optional reflection; verify Continue works without selecting a choice
    await page.locator('.lab-screen-nav button:has-text("Continue")').click();
    await expect(page.locator('.lab-screen h2')).toContainText('A prayer for the journey');

    // -------------------------------------------------------------
    // Part 5: Complete Challenge & Revisit Immutability
    // -------------------------------------------------------------
    // On the final screen, "Complete Challenge" is present
    const completeBtn = page.locator('.lab-screen-nav button:has-text("Complete Challenge")');
    await expect(completeBtn).toBeVisible();
    await completeBtn.click();

    // Completion banner is displayed
    await expect(page.locator('.lab-completion')).toBeVisible();

    // Return to Lab Home
    await page.locator('.lab-topbar button:has-text("Challenge Lab home")').click();
    await expect(page.locator('.lab-challenge-row:has-text("Three Commands")')).toContainText('Completed · Revisit any screen');

    // Revisit the completed challenge
    await page.locator('.lab-challenge-row__open:has-text("Three Commands")').click();
    await expect(page.locator('.lab-screen')).toBeVisible();

    // -------------------------------------------------------------
    // Part 6: Strict Storage Isolation and No Duplicate Inflation
    // -------------------------------------------------------------
    const storageKeys = await page.evaluate(() => {
      return {
        hasLabStorage: localStorage.getItem('bibleberry-interactive-challenge-lab-v1') !== null,
        prototypeState: JSON.parse(localStorage.getItem('bibleberry-prototype-v1') || '{}'),
        labState: JSON.parse(localStorage.getItem('bibleberry-interactive-challenge-lab-v1') || '{}'),
      };
    });

    expect(storageKeys.hasLabStorage).toBe(true);

    // Completed challenges must contain 'nov-1' exactly once (no inflation upon revisit)
    const completions = storageKeys.labState.completedChallengeIds.filter((id: string) => id === 'nov-1');
    expect(completions).toHaveLength(1);

    // Saved challenges must contain 'nov-1'
    expect(storageKeys.labState.savedChallengeIds).toContain('nov-1');

    // Ordinary prototype state must remain clean with no lab data leakage
    expect(storageKeys.prototypeState.completedChallengeIds).toBeUndefined();
    expect(storageKeys.prototypeState.savedChallengeIds).toBeUndefined();
  });
});
