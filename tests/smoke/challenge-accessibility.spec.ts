import { test, expect } from './helpers/frameSafeTest';

const PROTOTYPE_STORAGE_KEY = 'bibleberry-prototype-v1';

test.describe('Shared Challenge reader accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(storageKey => {
      localStorage.setItem(storageKey, JSON.stringify({
        onboarded: true,
        appearance: 'system',
        textSize: 'large',
        reminderEnabled: false,
        reminderTime: '08:00',
        explored: [],
        journey: [],
        lastOpened: null,
        resumeDismissedDate: '',
      }));
    }, PROTOTYPE_STORAGE_KEY);
    await page.goto('/#/pilot/challenge');
  });

  test('keeps visible keyboard focus, announces progress, and completes only with Finish', async ({ page }) => {
    const firstHeading = page.getByRole('heading', { level: 2, name: 'Pilot screen one: normal app shell' });
    await expect(firstHeading).toBeFocused();
    await expect(page.getByRole('progressbar', { name: 'Challenge screen position' }))
      .toHaveAttribute('aria-valuetext', '1 of 2');

    const headingOutline = await firstHeading.evaluate(element => getComputedStyle(element).outlineStyle);
    expect(headingOutline).not.toBe('none');

    const navigation = page.getByRole('navigation', { name: 'Challenge screen navigation' });
    const continueButton = navigation.getByRole('button', { name: 'Continue' });
    await continueButton.focus();
    await page.keyboard.press('Enter');

    const finalHeading = page.getByRole('heading', { level: 2, name: 'Pilot screen two: optional study and completion' });
    await expect(finalHeading).toBeFocused();
    await expect(page.getByRole('progressbar', { name: 'Challenge screen position' }))
      .toHaveAttribute('aria-valuetext', '2 of 2');
    await expect(page.locator('.lab-completion')).toHaveCount(0);
    await expect(page.locator('.pilot-disclosure__status')).toContainText('Not completed');

    const finishButton = navigation.getByRole('button', { name: 'Finish' });
    await expect(finishButton).toBeVisible();
    await expect(finishButton).toBeEnabled();
    await finishButton.focus();
    await page.keyboard.press('Enter');

    await expect(page.locator('.lab-completion')).toContainText('Challenge complete');
    await expect(page.locator('.pilot-disclosure__status')).toContainText('Challenge completed');
    await expect(page.locator('button.challenge-player__exit')).toHaveText('Return to Today');
  });

  test('reflows substantive reader text at large size on a narrow zoom-equivalent viewport', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 812 });
    await expect(page.locator('#root > .reading-large')).toBeVisible();
    await expect(page.locator('#pilot-screen-overview-title')).toBeFocused();

    const paragraph = page.locator('.lab-screen__blocks .lab-teaching-text p').first();
    const appendedText = ' ' + 'unbreakable'.repeat(40);
    await paragraph.evaluate((element, suffix) => {
      element.textContent += suffix;
    }, appendedText);

    const textFits = await paragraph.evaluate(element => element.scrollWidth <= element.clientWidth);
    expect(textFits).toBe(true);

    const screenBlocks = page.locator('.lab-screen__blocks > *');
    await expect(screenBlocks).toHaveCount(2);
    await expect(screenBlocks.nth(0)).toContainText('shared ChallengePlayer');
    await expect(screenBlocks.nth(1)).toContainText('Non-durable demonstration boundary');

    const continueButton = page.getByRole('navigation', { name: 'Challenge screen navigation' })
      .getByRole('button', { name: 'Continue' });
    await continueButton.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#pilot-screen-finish-title')).toBeFocused();

    const optionalStudy = page.locator('.lab-optional');
    await optionalStudy.locator('.lab-optional__toggle').click();
    await expect(optionalStudy.locator('.lab-optional__content')).toBeVisible();
    await expect(optionalStudy.locator('.lab-optional__content')).toContainText('Optional deeper study sections remain expandable');
    await expect(page.getByRole('navigation', { name: 'Challenge screen navigation' }).getByRole('button', { name: 'Finish' }))
      .toBeVisible();

    await page.setViewportSize({ width: 320, height: 640 });
    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(hasHorizontalOverflow).toBe(false);

    await page.locator('button.challenge-player__exit').click();
    await expect(page.locator('#daily-teaching')).toBeVisible();
  });
});
