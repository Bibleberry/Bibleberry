import { test, expect } from './helpers/frameSafeTest';

const PROTOTYPE_STORAGE_KEY = 'bibleberry-prototype-v1';
const LOCAL_LAB_STORAGE_KEY = 'bibleberry-interactive-challenge-lab-v1';
const CMS_LAB_STORAGE_KEY = 'bibleberry-sanity-challenge-lab-v1';

test.describe('Ordinary-Shell ChallengePlayer Controlled Pilot (A2)', () => {
  let uncaughtErrors: Error[] = [];

  test.beforeEach(async ({ page }) => {
    uncaughtErrors = [];
    page.on('pageerror', err => uncaughtErrors.push(err));
    await page.clock.setFixedTime(new Date('2026-11-05T12:00:00Z'));
  });

  test.afterEach(async () => {
    expect(uncaughtErrors).toEqual([]);
  });

  test('opens shared player in ordinary shell without Developer Studio, isolates in-memory state, hides CMS diagnostics, and supports return + browser Back/Forward', async ({ page }) => {
    await page.addInitScript(storageKey => {
      if (!localStorage.getItem(storageKey)) {
        localStorage.setItem(storageKey, JSON.stringify({
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
      }
    }, PROTOTYPE_STORAGE_KEY);

    await page.goto('/');
    await expect(page.locator('#daily-teaching')).toBeVisible();
    await expect(page.locator('.pilot-entry-bar')).toBeVisible();

    // Pilot-only build must NOT expose Developer Studio in More
    await page.locator('.desktop-nav button:has-text("More")').click();
    await expect(page.locator('.more-page')).toBeVisible();
    await expect(page.locator('button.developer-studio-entry')).toHaveCount(0);

    // Move to Archive so we can verify returning to a non-default ordinary surface
    await page.locator('.desktop-nav button:has-text("Archive")').click();
    await expect(page.locator('.archive-page')).toBeVisible();

    const baselineStorage = await page.evaluate(protoKey => ({
      localKeys: Object.keys(localStorage),
      sessionKeys: Object.keys(sessionStorage),
      prototypeRaw: localStorage.getItem(protoKey),
    }), PROTOTYPE_STORAGE_KEY);
    expect(baselineStorage.localKeys).toEqual([PROTOTYPE_STORAGE_KEY]);

    // Open pilot from the ordinary shell
    await page.locator('.pilot-entry-bar a[href="#/pilot/challenge"]').click();
    expect(page.url()).toContain('#/pilot/challenge');

    // Renders inside normal AppShell, without any Lab topbar or mode/source selectors
    await expect(page.locator('.app-shell .desktop-nav')).toBeVisible();
    await expect(page.locator('.challenge-reader-page')).toBeVisible();
    await expect(page.locator('.lab-topbar')).toHaveCount(0);
    await expect(page.locator('.lab-source-selector')).toHaveCount(0);
    await expect(page.locator('.cms-mode-selector')).toHaveCount(0);

    // Return control names the previous ordinary surface
    const exitBtn = page.locator('button.challenge-player__exit');
    await expect(exitBtn).toHaveText('Return to Archive');

    // Reader-appropriate labels & focus on Screen 1; no CMS/Sanity diagnostics or practice notices
    await expect(page.locator('.lab-challenge-header h1')).toHaveText('Synthetic Player Pilot (Technical Sample)');
    await expect(page.locator('#pilot-screen-overview-title')).toHaveText('Pilot screen one: normal app shell');
    await expect(page.locator('#pilot-screen-overview-title')).toBeFocused();
    await expect(page.locator('.lab-progress')).toContainText('Challenge screens');

    const progressbar = page.getByRole('progressbar', { name: 'Challenge screen position' });
    await expect(progressbar).toHaveAttribute('aria-valuenow', '1');
    await expect(progressbar).toHaveAttribute('aria-valuemax', '2');
    await expect(progressbar).toHaveAttribute('aria-valuetext', '1 of 2');

    const primaryScripture = page.locator('section[aria-label="Primary Scripture"]');
    await expect(primaryScripture).toContainText('Primary Scripture · WEBP');
    await expect(primaryScripture).toContainText('Psalm 23:1');
    await expect(primaryScripture).toContainText('Reference only · Passage text not included');

    const readerText = await page.locator('.challenge-reader-page').innerText();
    expect(readerText).not.toContain('Required screens');
    expect(readerText).not.toContain('Not configured');
    expect(readerText).not.toContain('Practice configured in Sanity');
    expect(readerText).not.toContain('CMS memorization practice');
    expect(readerText).not.toContain('Memorization practice not configured');

    // Non-final screen guards completion; Back is disabled
    const nav = page.getByRole('navigation', { name: 'Challenge screen navigation' });
    await expect(nav.getByRole('button', { name: 'Back' })).toBeDisabled();
    await expect(nav.getByRole('button', { name: 'Continue' })).toBeEnabled();
    await expect(nav.getByRole('button', { name: /Complete Challenge|Finish/i })).toHaveCount(0);

    // Save Challenge and Save Scripture remain separate from completion
    const demoStatus = page.locator('.pilot-disclosure__status');
    await expect(demoStatus).toContainText('Challenge not saved · 0 Scripture references saved · Not completed');

    const saveChallengeBtn = page.locator('button.lab-save-challenge');
    await saveChallengeBtn.click();
    await expect(saveChallengeBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(demoStatus).toContainText('Challenge saved · 0 Scripture references saved · Not completed');

    const primarySaveBtn = primaryScripture.locator('button.lab-scripture-save');
    await primarySaveBtn.click();
    await expect(primarySaveBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(demoStatus).toContainText('Challenge saved · 1 Scripture reference saved (Psalm 23:1) · Not completed');

    // Forward / Back screen navigation and heading focus
    await nav.getByRole('button', { name: 'Continue' }).click();
    await expect(page.locator('#pilot-screen-finish-title')).toHaveText('Pilot screen two: optional study and completion');
    await expect(page.locator('#pilot-screen-finish-title')).toBeFocused();
    await expect(progressbar).toHaveAttribute('aria-valuenow', '2');

    await nav.getByRole('button', { name: 'Back' }).click();
    await expect(page.locator('#pilot-screen-overview-title')).toBeFocused();
    await nav.getByRole('button', { name: 'Continue' }).click();
    await expect(page.locator('#pilot-screen-finish-title')).toBeFocused();

    // Optional deeper study can be expanded/saved, collapsed, and never gates completion
    const optionalStudy = page.locator('.lab-optional');
    const optionalToggle = optionalStudy.locator('.lab-optional__toggle');
    await expect(optionalToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(optionalStudy.locator('#pilot-block-optional-study-cms-content')).toBeHidden();

    await optionalToggle.click();
    await expect(optionalToggle).toHaveAttribute('aria-expanded', 'true');
    const optionalScripturePanel = optionalStudy.locator('.cms-scripture', { hasText: 'Colossians 3:16' });
    await expect(optionalScripturePanel).toContainText('Reference only · Passage text not included');
    await optionalScripturePanel.locator('button.lab-scripture-save').click();
    await expect(demoStatus).toContainText('2 Scripture references saved (Psalm 23:1, Colossians 3:16) · Not completed');

    // Collapse optional study and explicitly complete on final screen
    await optionalToggle.click();
    await expect(optionalToggle).toHaveAttribute('aria-expanded', 'false');

    const completeBtn = nav.getByRole('button', { name: 'Finish' });
    await expect(completeBtn).toBeEnabled();
    await completeBtn.click();

    await expect(page.locator('.lab-completion')).toContainText('You completed this Challenge. Optional content remains available to revisit.');
    await expect(page.locator('.lab-completion')).not.toContainText('required screens');
    await expect(nav.getByRole('button', { name: 'Challenge complete' })).toBeDisabled();

    // Removing Challenge bookmark leaves completion and saved Scripture intact
    await saveChallengeBtn.click();
    await expect(saveChallengeBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(demoStatus).toContainText('Challenge not saved · 2 Scripture references saved (Psalm 23:1, Colossians 3:16) · Challenge completed');

    // Verify strict zero-write storage isolation across prototype, both Labs, and sessionStorage
    const afterPilotActions = await page.evaluate(
      ([protoKey, localLabKey, cmsKey]) => ({
        localKeys: Object.keys(localStorage),
        sessionKeys: Object.keys(sessionStorage),
        prototypeRaw: localStorage.getItem(protoKey),
        localLabRaw: localStorage.getItem(localLabKey),
        cmsLabRaw: localStorage.getItem(cmsKey),
      }),
      [PROTOTYPE_STORAGE_KEY, LOCAL_LAB_STORAGE_KEY, CMS_LAB_STORAGE_KEY],
    );
    expect(afterPilotActions.localKeys).toEqual([PROTOTYPE_STORAGE_KEY]);
    expect(afterPilotActions.sessionKeys).toEqual([]);
    expect(afterPilotActions.prototypeRaw).toBe(baselineStorage.prototypeRaw);
    expect(afterPilotActions.localLabRaw).toBeNull();
    expect(afterPilotActions.cmsLabRaw).toBeNull();

    // Browser Back returns to Archive; Browser Forward re-enters pilot at Screen 2 with in-memory state preserved
    await page.goBack();
    expect(page.url()).not.toContain('#/pilot/challenge');
    await expect(page.locator('.archive-page')).toBeVisible();
    await expect(page.locator('.challenge-reader-page')).toHaveCount(0);

    await page.goForward();
    expect(page.url()).toContain('#/pilot/challenge');
    await expect(page.locator('#pilot-screen-finish-title')).toBeVisible();
    await expect(page.locator('.lab-completion')).toBeVisible();

    // In-app Return button exits cleanly to Archive, and Browser Back/Forward remain coherent
    await exitBtn.click();
    expect(page.url()).not.toContain('#/pilot/challenge');
    await expect(page.locator('.archive-page')).toBeVisible();

    await page.goBack();
    expect(page.url()).toContain('#/pilot/challenge');
    await expect(page.locator('#pilot-screen-finish-title')).toBeVisible();

    await page.goForward();
    expect(page.url()).not.toContain('#/pilot/challenge');
    await expect(page.locator('.archive-page')).toBeVisible();

    // Standard primary tabs still work normally, and opening from Today returns to Today
    await page.locator('.desktop-nav button:has-text("Foundations")').click();
    await expect(page.locator('.foundations-page')).toBeVisible();

    await page.locator('.desktop-nav button:has-text("Today")').click();
    await expect(page.locator('#daily-teaching')).toBeVisible();

    await page.locator('.pilot-entry-bar a[href="#/pilot/challenge"]').click();
    await expect(page.locator('button.challenge-player__exit')).toHaveText('Return to Today');
    await page.locator('button.challenge-player__exit').click();
    await expect(page.locator('#daily-teaching')).toBeVisible();

    // Full reload resets non-durable in-memory demonstration state cleanly
    await page.goto('/#/pilot/challenge');
    await page.reload();
    await expect(page.locator('#pilot-screen-overview-title')).toBeVisible();
    await expect(page.locator('.pilot-disclosure__status')).toContainText('Challenge not saved · 0 Scripture references saved · Not completed');
  });

  test('preserves #/pilot/challenge across first-run onboarding and supports keyboard + narrow portrait / tablet layouts', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    // Fresh session deep-linking to #/pilot/challenge completes onboarding first, then opens the pilot
    await page.goto('/#/pilot/challenge');
    await expect(page.locator('.onboarding')).toBeVisible();
    await page.locator('.onboarding button:has-text("Continue")').click();
    await page.locator('.onboarding button:has-text("Continue to Today")').click();

    await expect(page.locator('.challenge-reader-page')).toBeVisible();
    await expect(page.locator('button.challenge-player__exit')).toHaveText('Return to Today');

    // Switch to More -> Appearance & reading -> enable Dark theme and Large reading text
    await page.locator('.bottom-nav button:has-text("More")').click();
    await page.locator('.more-list button:has-text("Appearance & reading")').click();
    await page.locator('.choice-grid button:has-text("Dark")').click();
    await page.locator('.text-size-control button:has-text("Large")').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('#root > .reading-large')).toBeVisible();

    // Return to More top-level and activate pilot link via keyboard
    await page.locator('.detail-header .back-link').click();
    const pilotLink = page.locator('.pilot-entry-bar a[href="#/pilot/challenge"]');
    await pilotLink.focus();
    await page.keyboard.press('Enter');

    await expect(page.locator('#pilot-screen-overview-title')).toBeFocused();
    await expect(page.locator('button.challenge-player__exit')).toHaveText('Return to More');

    const portraitScreen1Fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(portraitScreen1Fits).toBe(true);

    // Keyboard navigation to Screen 2 and optional study toggle
    const continueBtn = page.getByRole('navigation', { name: 'Challenge screen navigation' }).getByRole('button', { name: 'Continue' });
    await continueBtn.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#pilot-screen-finish-title')).toBeFocused();

    const optionalToggle = page.locator('.lab-optional__toggle');
    await optionalToggle.focus();
    await page.keyboard.press('Enter');
    await expect(optionalToggle).toHaveAttribute('aria-expanded', 'true');

    const portraitScreen2Fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(portraitScreen2Fits).toBe(true);

    // Check narrow 320px portrait and centered 1024x768 tablet landscape without horizontal overflow
    await page.setViewportSize({ width: 320, height: 640 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.setViewportSize({ width: 1024, height: 768 });
    const tabletMetrics = await page.evaluate(() => {
      const container = document.querySelector('.challenge-reader-page');
      return {
        fitsViewport: document.documentElement.scrollWidth <= window.innerWidth,
        width: container ? container.getBoundingClientRect().width : 0,
      };
    });
    expect(tabletMetrics.fitsViewport).toBe(true);
    expect(tabletMetrics.width).toBeGreaterThan(0);
    expect(tabletMetrics.width).toBeLessThanOrEqual(900);

    // Keyboard exit back to More
    const exitBtn = page.locator('button.challenge-player__exit');
    await exitBtn.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.more-page')).toBeVisible();
  });
});
