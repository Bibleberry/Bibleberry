import { test, expect } from '@playwright/test';

test.describe('Navigation, Onboarding, and Date-Gated Teaching', () => {
  let uncaughtErrors: Error[] = [];

  test.beforeEach(async ({ page }) => {
    uncaughtErrors = [];
    page.on('pageerror', err => uncaughtErrors.push(err));
    // Pin deterministic test clock to November 5, 2026
    await page.clock.setFixedTime(new Date('2026-11-05T12:00:00Z'));
  });

  test.afterEach(async () => {
    expect(uncaughtErrors).toEqual([]);
  });

  test('fresh browser session displays Onboarding with Colossians 3:16 and completes to Today', async ({ page }) => {
    // Clean context: no localStorage
    await page.goto('/');

    const onboarding = page.locator('.onboarding');
    await expect(onboarding).toBeVisible();

    const verse = page.locator('.onboarding__verse');
    await expect(verse).toContainText('Let the word of Christ dwell in you richly');

    // Step 1: Click Continue
    await page.locator('.onboarding button:has-text("Continue")').click();

    // Step 2: Click Continue to Today
    await page.locator('.onboarding button:has-text("Continue to Today")').click();

    // Verify reader view is active
    const todayTeaching = page.locator('#daily-teaching');
    await expect(todayTeaching).toBeVisible();

    // Verify localStorage has onboarded: true
    const storedState = await page.evaluate(() => localStorage.getItem('bibleberry-prototype-v1'));
    expect(storedState).toBeTruthy();
    expect(JSON.parse(storedState!).onboarded).toBe(true);
  });

  test('normal startup with existing onboarded state opens Today tab directly', async ({ page }) => {
    // Pre-seed localStorage with onboarded state
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

    // Check Today heading is visible
    await expect(page.locator('#daily-teaching')).toBeVisible();

    // Check Today navigation item is active
    const todayTab = page.locator('.desktop-nav button[aria-current="page"]');
    await expect(todayTab).toContainText('Today');
  });

  test('date-gated teaching release displays available entry and gates future fixtures', async ({ page }) => {
    // Pin time to November 4, 2026
    await page.clock.setFixedTime(new Date('2026-11-04T12:00:00Z'));
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

    // On November 4, Today must show "Rest That Reaches Others" (sabbath-2026-11-04)
    await expect(page.locator('#daily-teaching')).toBeVisible();
    await expect(page.locator('#daily-teaching h1')).toContainText('Rest That Reaches Others');

    // Future fixtures (Nov 5, Nov 6, Nov 7) must NOT appear as Today's teaching
    await expect(page.locator('#daily-teaching h1')).not.toContainText('God’s Will for Our Lives');
    await expect(page.locator('#daily-teaching h1')).not.toContainText('A Sign Between Us');

    // Advance clock to November 5, 2026 and reload
    await page.clock.setFixedTime(new Date('2026-11-05T12:00:00Z'));
    await page.reload();

    // Now November 5 teaching is released
    await expect(page.locator('#daily-teaching h1')).toContainText('God’s Will for Our Lives');
  });

  test('bottom/desktop navigation cycles across Today, Foundations, Archive, and More', async ({ page }) => {
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

    // Go to Foundations
    await page.locator('.app-shell nav button:has-text("Foundations")').first().click();
    await expect(page.locator('.foundations-page')).toBeVisible();

    // Go to Archive
    await page.locator('.app-shell nav button:has-text("Archive")').first().click();
    await expect(page.locator('.archive-page')).toBeVisible();

    // Go to More
    await page.locator('.app-shell nav button:has-text("More")').first().click();
    await expect(page.locator('.more-page')).toBeVisible();

    // Return to Today
    await page.locator('.app-shell nav button:has-text("Today")').first().click();
    await expect(page.locator('#daily-teaching')).toBeVisible();
  });

  test('shared teaching URL opens target entry in fresh tab, preserving destination', async ({ page }) => {
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

    // Directly open November 3 Sabbath teaching via hash route
    await page.goto('/#/teaching/sabbath-2026-11-03');

    const teachingHeader = page.locator('#daily-teaching h1');
    await expect(teachingHeader).toBeVisible();
    await expect(teachingHeader).toContainText('Remember the Sabbath');

    // Navigate to Foundations and back to Today
    await page.locator('.app-shell nav button:has-text("Foundations")').first().click();
    await expect(page.locator('.foundations-page')).toBeVisible();

    await page.locator('.app-shell nav button:has-text("Today")').first().click();
    await expect(page.locator('#daily-teaching h1')).toContainText('God’s Will for Our Lives');
  });
});
