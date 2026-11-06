import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

test.describe('Build Isolation and Public Production Verification', () => {
  test('public build excludes Developer Studio navigation, chunks, and fixtures', async ({ page }) => {
    // Track uncaught page errors
    const uncaughtErrors: Error[] = [];
    page.on('pageerror', err => uncaughtErrors.push(err));
    await page.clock.setFixedTime(new Date('2026-11-05T12:00:00Z'));

    // 1. Check DOM: In public build, Developer Studio must NOT appear in More view
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

    // Verify all 7 standard More links are present
    const standardLinks = [
      'Journey',
      'About the app',
      'Realigned podcast',
      'Appearance & reading',
      'Daily reminder',
      'Scripture & Translations',
      'Privacy & local data',
    ];

    for (const title of standardLinks) {
      await expect(page.locator(`.more-list button:has-text("${title}")`)).toBeVisible();
    }

    // Developer Studio entry button and ordinary Challenge pilot bar must be unconditionally absent in public build
    const devStudioButton = page.locator('button.developer-studio-entry');
    await expect(devStudioButton).not.toBeVisible();
    await expect(page.locator('.pilot-entry-bar')).toHaveCount(0);

    // Visiting the pilot hash route in the public bundle must be inert on both hash navigation and initial load
    await page.goto('/#/pilot/challenge');
    await expect(page.locator('.more-page')).toBeVisible();
    await expect(page.locator('.pilot-entry-bar')).toHaveCount(0);
    await expect(page.locator('.pilot-disclosure')).toHaveCount(0);
    await expect(page.locator('.challenge-reader-page')).toHaveCount(0);

    await page.reload();
    await expect(page.locator('#daily-teaching')).toBeVisible();
    await expect(page.locator('.pilot-entry-bar')).toHaveCount(0);
    await expect(page.locator('.pilot-disclosure')).toHaveCount(0);
    await expect(page.locator('.challenge-reader-page')).toHaveCount(0);

    // 2. Check filesystem: dist/ directory must NOT contain Lab, Preview, or Pilot chunks
    const distDir = path.resolve(process.cwd(), 'dist', 'assets');
    expect(fs.existsSync(distDir)).toBe(true);

    const files = fs.readdirSync(distDir);
    const nonPublicChunk = files.find(
      f =>
        f.startsWith('InteractiveChallengeLab') ||
        f.startsWith('SanityChallengeLab') ||
        f.startsWith('BerryMarkLocalPreview') ||
        f.startsWith('ordinaryChallengePilot'),
    );
    expect(nonPublicChunk).toBeUndefined();

    // 3. Scan all public JavaScript assets: must NOT contain distinguishing development or pilot code/fixture strings
    const jsFiles = files.filter(f => f.endsWith('.js'));
    expect(jsFiles.length).toBeGreaterThan(0);

    const distinguishingDevMarkers = [
      'Interactive Challenge Lab',
      'Four guided Biblical Teaching Challenges',
      'lab-source-selector',
      'Open Interactive Challenge Lab',
      'bibleberry-interactive-challenge-lab-v1',
      'bibleberry-sanity-challenge-lab-v1',
      'Structural Adapter Fixture',
      'Development Fixture Preview',
      'BerryMark Local Preview',
      'Synthetic Player Pilot',
      'pilot-synthetic-ordinary-shell-a2',
      '#/pilot/challenge',
      'Open Challenge pilot',
      'TECHNICAL PILOT · NOT PUBLISHED CONTENT',
    ];

    for (const jsFile of jsFiles) {
      const content = fs.readFileSync(path.join(distDir, jsFile), 'utf-8');
      for (const marker of distinguishingDevMarkers) {
        expect(content).not.toContain(marker);
      }
    }

    expect(uncaughtErrors).toEqual([]);
  });
});
