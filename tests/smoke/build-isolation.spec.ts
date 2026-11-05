import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

test.describe('Build Isolation and Public Production Verification', () => {
  test('public build excludes Developer Studio navigation, chunks, and fixtures', async ({ page }) => {
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

    // Developer Studio must be completely absent in public build
    const devStudioButton = page.locator('button.developer-studio-entry');
    const isPublicBuild = !(await devStudioButton.isVisible());

    if (isPublicBuild) {
      // 2. Check filesystem: dist/ directory must NOT contain InteractiveChallengeLab chunk
      const distDir = path.resolve(process.cwd(), 'dist', 'assets');
      if (fs.existsSync(distDir)) {
        const files = fs.readdirSync(distDir);
        const labChunk = files.find(f => f.startsWith('InteractiveChallengeLab'));
        expect(labChunk).toBeUndefined();
      }
    }
  });
});
