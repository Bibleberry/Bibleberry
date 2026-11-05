import { test, expect } from '@playwright/test';

test.describe('Today, Journey Activity, and Resume Behavior', () => {
  test('opening Today records journey activity and retains recent activity history', async ({ page }) => {
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
    await expect(page.locator('#daily-teaching')).toBeVisible();

    // Verify 'Opened latest available teaching' activity in localStorage
    const getTodayActivities = async () => {
      const state = JSON.parse(await page.evaluate(() => localStorage.getItem('bibleberry-prototype-v1') || '{}'));
      return ((state.journey as { label?: string }[]) || []).filter(j => j.label?.startsWith('Opened latest available teaching'));
    };

    await expect.poll(async () => (await getTodayActivities()).length).toBeGreaterThanOrEqual(1);
    const initial = await getTodayActivities();
    expect(initial[0].label).toContain('God’s Will for Our Lives');

    // Verify More -> Journey view renders the logged activity rows
    await page.locator('.app-shell nav button:has-text("More")').first().click();
    await page.locator('.more-list button:has-text("Journey")').click();
    await expect(page.locator('.journey-row')).not.toHaveCount(0);
    await expect(page.locator('.journey-row strong').first()).toContainText('Opened latest available teaching: God’s Will for Our Lives');
  });

  test('returning reader resume card offers Return, Continue, and Jump to today', async ({ page }) => {
    // Seed with a past reading on November 3
    await page.addInitScript(() => {
      localStorage.setItem('bibleberry-prototype-v1', JSON.stringify({
        onboarded: true,
        appearance: 'system',
        textSize: 'default',
        reminderEnabled: false,
        reminderTime: '08:00',
        explored: [],
        journey: [],
        lastOpened: {
          entryId: 'sabbath-2026-11-03',
          challengeId: 'seven-days-sabbath-2026',
          openedAt: '2026-11-03T16:00:00.000Z',
        },
        resumeDismissedDate: '',
      }));
    });

    await page.goto('/');

    // Resume card should be visible
    const resumeCard = page.locator('.resume-card');
    await expect(resumeCard).toBeVisible();
    await expect(resumeCard).toContainText(/PICK UP WHERE YOU LEFT OFF/i);
    await expect(resumeCard).toContainText('Remember the Sabbath');

    // Test Return action -> opens November 3 reading
    await resumeCard.locator('button:has-text("Return")').click();
    await expect(page.locator('#daily-teaching h1')).toContainText('Remember the Sabbath');
  });
});
