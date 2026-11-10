import { test, expect } from './helpers/frameSafeTest';

const PROTOTYPE_STORAGE_KEY = 'bibleberry-prototype-v1';
const LOCAL_LAB_STORAGE_KEY = 'bibleberry-interactive-challenge-lab-v1';
const CMS_LAB_STORAGE_KEY = 'bibleberry-sanity-challenge-lab-v1';
const FIXTURE_CHALLENGE_KEY = 'sanity-fixture:fixture-challenge-document';

test.describe('Shared CMS Challenge Player and Content Blocks (A1)', () => {
  let uncaughtErrors: Error[] = [];

  test.beforeEach(async ({ page }) => {
    uncaughtErrors = [];
    page.on('pageerror', err => uncaughtErrors.push(err));
  });

  test.afterEach(async () => {
    expect(uncaughtErrors).toEqual([]);
  });

  test('renders all nine CMS block types, enforces explicit completion, persists stable screen IDs, and isolates namespaces', async ({ page }) => {
    let sanityMode: 'empty' | 'error' = 'empty';
    await page.route('https://*.api.sanity.io/**', async route => {
      if (sanityMode === 'empty') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ result: [] }),
        });
      } else {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Service unavailable' }),
        });
      }
    });

    await page.evaluate(() => undefined).catch(() => undefined);
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
    // Enabling Developer Studio alone must not enable the distinct ordinary-shell pilot banner
    await expect(page.locator('.pilot-entry-bar')).toHaveCount(0);
    await page.locator('.desktop-nav button:has-text("More")').click();
    await page.locator('button.developer-studio-entry').click();
    await page.locator('button:has-text("Open Interactive Challenge Lab")').click();

    // Switch from Local Prototype to Sanity CMS Lab
    await page.locator('.lab-source-selector__buttons button:has-text("Sanity CMS")').click();

    // -------------------------------------------------------------
    // Part 1: Honest live catalog empty and error states (no silent fixture substitution)
    // -------------------------------------------------------------
    await expect(page.locator('.cms-catalog-state h2')).toHaveText('No published Challenges');
    await expect(page.locator('.cms-catalog-state')).toContainText('No development fixture has been inserted.');
    await expect(page.locator('.lab-challenge-row')).toHaveCount(0);

    sanityMode = 'error';
    await page.locator('.cms-catalog-state button:has-text("Retry live request")').click();
    await expect(page.getByRole('alert')).toContainText('Published Challenges could not be loaded');
    await expect(page.locator('.lab-challenge-row')).toHaveCount(0);

    // -------------------------------------------------------------
    // Part 2: Explicit synthetic fixture selection & Screen 1 (CB1-CB5)
    // -------------------------------------------------------------
    await page.locator('.cms-mode-selector__buttons button:has-text("Development Fixture Preview")').click();
    await expect(page.locator('.cms-fixture-banner')).toContainText('Development Fixture Preview');

    const challengeRow = page.locator('.lab-challenge-row', { hasText: 'Structural Adapter Fixture' });
    await expect(challengeRow).toContainText('Fixture Series · Sequence 2 · 2 screens');
    await expect(challengeRow).toContainText('Begin Challenge');

    await challengeRow.locator('.lab-challenge-row__open').click();

    // Header, focus, and ARIA progressbar on Screen 1
    await expect(page.locator('.lab-challenge-header h1')).toHaveText('Structural Adapter Fixture');
    await expect(page.locator('.cms-challenge-summary')).toHaveText('Development-only structural fixture for verifying the CMS renderer.');
    await expect(page.locator('#screen-encounter-title')).toHaveText('Fixture screen one');
    await expect(page.locator('#screen-encounter-title')).toBeFocused();

    const progressbar = page.getByRole('progressbar', { name: 'CMS required Challenge screen position' });
    await expect(progressbar).toHaveAttribute('aria-valuenow', '1');
    await expect(progressbar).toHaveAttribute('aria-valuemax', '2');
    await expect(progressbar).toHaveAttribute('aria-valuetext', '1 of 2');

    // Primary reference-only Scripture
    const primaryScripture = page.locator('section[aria-label="Primary Scripture"]');
    await expect(primaryScripture).toContainText('Fixture Reference 1:1');
    await expect(primaryScripture).toContainText('Reference only · No passage text supplied · Translation not configured');
    await expect(primaryScripture).toContainText('Memorization practice not configured');

    // Verify authored order of Screen 1 blocks (CB1-CB5)
    const screen1Blocks = page.locator('.lab-screen__blocks > *');
    await expect(screen1Blocks).toHaveCount(5);
    await expect(screen1Blocks.nth(0)).toHaveAttribute('aria-label', 'Scripture focus');
    await expect(screen1Blocks.nth(0)).toContainText('Fixture Reference 1:1');

    await expect(screen1Blocks.nth(1)).toHaveClass(/lab-teaching-text/);
    await expect(screen1Blocks.nth(1)).toContainText('Fixture paragraph.');
    await expect(screen1Blocks.nth(1).locator('h2 strong')).toHaveText('Fixture heading');
    await expect(screen1Blocks.nth(1).locator('ul a[href="https://example.com/fixture"]')).toHaveText('Fixture linked list item');
    await expect(screen1Blocks.nth(1)).toContainText('Fixture nested bullet item.');
    await expect(screen1Blocks.nth(1).locator('ol')).toContainText('Fixture numbered item.');
    await expect(screen1Blocks.nth(1).locator('h3')).toHaveText('Fixture subheading');
    await expect(screen1Blocks.nth(1).locator('blockquote.cms-portable-quote')).toContainText('Fixture blockquote.');

    await expect(screen1Blocks.nth(2)).toHaveClass(/lab-statement/);
    await expect(screen1Blocks.nth(2)).toContainText('Fixture label');
    await expect(screen1Blocks.nth(2)).toContainText('Fixture statement.');

    await expect(screen1Blocks.nth(3)).toHaveClass(/lab-contrast/);
    await expect(screen1Blocks.nth(3)).toContainText('Fixture left');
    await expect(screen1Blocks.nth(3)).toContainText('Left fixture body.');
    await expect(screen1Blocks.nth(3)).toContainText('Fixture right');
    await expect(screen1Blocks.nth(3)).toContainText('Right fixture body.');
    await expect(screen1Blocks.nth(3)).toContainText('Fixture comparison footer.');

    await expect(screen1Blocks.nth(4)).toHaveClass(/lab-visual-cards/);
    await expect(screen1Blocks.nth(4)).toContainText('Fixture card one');
    await expect(screen1Blocks.nth(4)).toContainText('Fixture card body.');
    await expect(screen1Blocks.nth(4)).toContainText('Fixture card two');

    // Completion is not offered before the final screen; Back is disabled on first screen
    const nav = page.getByRole('navigation', { name: 'CMS Challenge screen navigation' });
    await expect(nav.getByRole('button', { name: 'Back' })).toBeDisabled();
    await expect(nav.getByRole('button', { name: 'Continue' })).toBeEnabled();
    await expect(nav.getByRole('button', { name: /Complete Challenge/i })).toHaveCount(0);

    // -------------------------------------------------------------
    // Part 3: Save Challenge and Save Scripture remain separate from completion
    // -------------------------------------------------------------
    const saveChallengeBtn = page.locator('button.lab-save-challenge');
    await expect(saveChallengeBtn).toHaveAttribute('aria-pressed', 'false');
    await saveChallengeBtn.click();
    await expect(saveChallengeBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(saveChallengeBtn).toContainText('Remove Saved Challenge');

    const primarySaveBtn = primaryScripture.locator('button.lab-scripture-save');
    await expect(primarySaveBtn).toHaveAttribute('aria-pressed', 'false');
    await primarySaveBtn.click();
    await expect(primarySaveBtn).toHaveAttribute('aria-pressed', 'true');
    // Matching Scripture block on Screen 1 reflects controlled saved state immediately
    await expect(screen1Blocks.nth(0).locator('button.lab-scripture-save')).toHaveAttribute('aria-pressed', 'true');

    const stateAfterSaves = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), CMS_LAB_STORAGE_KEY);
    expect(stateAfterSaves.savedChallengeIds).toEqual([FIXTURE_CHALLENGE_KEY]);
    expect(stateAfterSaves.completedChallengeIds).toEqual([]);
    expect(stateAfterSaves.scripture).toHaveLength(1);
    expect(stateAfterSaves.scripture[0].reference).toBe('Fixture Reference 1:1');

    // -------------------------------------------------------------
    // Part 4: Forward/Back navigation, focus updates, and Screen 2 blocks (CB6-CB9)
    // -------------------------------------------------------------
    await nav.getByRole('button', { name: 'Continue' }).click();
    await expect(page.locator('#screen-response-title')).toHaveText('Fixture screen two');
    await expect(page.locator('#screen-response-title')).toBeFocused();
    await expect(progressbar).toHaveAttribute('aria-valuenow', '2');
    await expect(progressbar).toHaveAttribute('aria-valuetext', '2 of 2');

    // Backtracking restores Screen 1 and moves focus to Screen 1 heading
    await nav.getByRole('button', { name: 'Back' }).click();
    await expect(page.locator('#screen-encounter-title')).toHaveText('Fixture screen one');
    await expect(page.locator('#screen-encounter-title')).toBeFocused();

    // Advance again to Screen 2 and verify persisted stable screen ID (not numeric index)
    await nav.getByRole('button', { name: 'Continue' }).click();
    await expect(page.locator('#screen-response-title')).toBeFocused();
    const stateOnScreen2 = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), CMS_LAB_STORAGE_KEY);
    expect(stateOnScreen2.positions[FIXTURE_CHALLENGE_KEY]).toBe('screen-response');

    // Verify authored order of Screen 2 blocks (CB6-CB9)
    const screen2Blocks = page.locator('.lab-screen__blocks > *');
    await expect(screen2Blocks).toHaveCount(4);

    // CB6: connectedSequence (cyclical)
    await expect(screen2Blocks.nth(0)).toHaveClass(/lab-sequence--cycle/);
    await expect(screen2Blocks.nth(0)).toContainText('01');
    await expect(screen2Blocks.nth(0)).toContainText('Fixture step one');
    await expect(screen2Blocks.nth(0)).toContainText('02');
    await expect(screen2Blocks.nth(0)).toContainText('Fixture step two');
    await expect(screen2Blocks.nth(0).locator('.lab-sequence__return')).toContainText('Fixture return caption.');
    await expect(screen2Blocks.nth(0).locator('.lab-sequence__conclusion')).toContainText('Fixture sequence conclusion.');

    // CB7: reflectionChoice (interactive prompt reveal)
    const reflection = screen2Blocks.nth(1);
    await expect(reflection).toHaveClass(/lab-reflection/);
    await expect(reflection).toContainText('Fixture reflection question?');
    await expect(reflection.locator('.lab-reflection__prompt')).toHaveCount(0);
    const choiceOne = reflection.getByRole('button', { name: 'Fixture choice one' });
    await choiceOne.click();
    await expect(choiceOne).toHaveAttribute('aria-pressed', 'true');
    await expect(reflection.locator('.lab-reflection__prompt')).toContainText('Fixture prompt one.');
    await expect(reflection).toContainText('Fixture reflection closing.');

    // CB8: optionalExploration (expand/collapse + reference-only & provided nested Scriptures)
    const optionalStudy = screen2Blocks.nth(2);
    await expect(optionalStudy).toHaveClass(/lab-optional/);
    const optionalToggle = optionalStudy.locator('.lab-optional__toggle');
    await expect(optionalToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(optionalStudy.locator('#block-study-cms-content')).toBeHidden();

    await optionalToggle.click();
    await expect(optionalToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(optionalStudy.locator('#block-study-cms-content')).toBeVisible();
    await expect(optionalStudy).toContainText('Fixture optional-study body.');
    await expect(optionalStudy).toContainText('Fixture Reference 2:2');
    await expect(optionalStudy.locator('blockquote.scripture-block')).toContainText('Development-only placeholder passage.');

    // Saving rights-confirmed provided Scripture persists reference metadata only (never passage text)
    const providedScripturePanel = optionalStudy.locator('.cms-scripture', { hasText: 'Fixture Reference 3:3' });
    await providedScripturePanel.locator('button.lab-scripture-save').click();
    const rawCmsStorage = await page.evaluate(key => localStorage.getItem(key) || '', CMS_LAB_STORAGE_KEY);
    expect(rawCmsStorage).toContain('Fixture Reference 3:3');
    expect(rawCmsStorage).not.toContain('Development-only placeholder passage.');

    // CB9: prayer + Companion links
    await expect(screen2Blocks.nth(3)).toHaveClass(/lab-prayer/);
    await expect(screen2Blocks.nth(3)).toContainText('Fixture prayer paragraph one.');
    await expect(screen2Blocks.nth(3)).toContainText('Fixture prayer paragraph two.');

    const companionLinks = page.locator('.lab-related-list');
    await expect(companionLinks).toContainText('Companion links · Optional · Not required');
    await expect(companionLinks.locator('a[href="https://example.com/companion"]')).toBeVisible();

    // -------------------------------------------------------------
    // Part 5: Reload resume, optional non-requirement, explicit completion, and revisit idempotence
    // -------------------------------------------------------------
    await page.reload();
    await page.locator('.desktop-nav button:has-text("More")').click();
    await page.locator('button.developer-studio-entry').click();
    await page.locator('button:has-text("Open Interactive Challenge Lab")').click();
    await page.locator('.lab-source-selector__buttons button:has-text("Sanity CMS")').click();
    await page.locator('.cms-mode-selector__buttons button:has-text("Development Fixture Preview")').click();

    await expect(challengeRow).toContainText('Resume at 2 of 2');
    await challengeRow.locator('.lab-challenge-row__open').click();

    // Resumes at Screen 2 by stable screen ID with optional study unopened & no reflection choice picked
    await expect(page.locator('#screen-response-title')).toHaveText('Fixture screen two');
    await expect(page.locator('.lab-optional__toggle')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.lab-reflection__choices button[aria-pressed="true"]')).toHaveCount(0);

    // Complete Challenge without interacting with optional study or reflection choices
    const completeBtn = nav.getByRole('button', { name: 'Complete Challenge' });
    await expect(completeBtn).toBeEnabled();
    await completeBtn.click();

    await expect(page.locator('.lab-completion')).toContainText('Challenge complete');
    await expect(nav.getByRole('button', { name: 'Challenge complete' })).toBeDisabled();

    // Return to Sanity CMS home -> revisit completed Challenge -> verify idempotence
    await page.locator('.lab-topbar button:has-text("Sanity CMS home")').click();
    await expect(challengeRow).toContainText('Completed · Revisit any screen');
    await challengeRow.locator('.lab-challenge-row__open').click();

    await expect(page.locator('.lab-completion')).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Challenge complete' })).toBeDisabled();

    // Check CMS My Scripture library
    await page.locator('.lab-topbar button:has-text("Sanity CMS home")').click();
    await page.locator('button:has-text("Open CMS My Scripture")').click();
    await expect(page.locator('.lab-saved-scripture')).toHaveCount(2);
    await expect(page.locator('#cms-scripture-title')).toHaveText('My Scripture');

    // Verify 3-store namespace isolation and single completion entry
    const stores = await page.evaluate(
      ([protoKey, localLabKey, cmsKey]) => ({
        prototype: JSON.parse(localStorage.getItem(protoKey) || '{}'),
        localLabRaw: localStorage.getItem(localLabKey),
        cmsLab: JSON.parse(localStorage.getItem(cmsKey) || '{}'),
      }),
      [PROTOTYPE_STORAGE_KEY, LOCAL_LAB_STORAGE_KEY, CMS_LAB_STORAGE_KEY],
    );

    expect(stores.cmsLab.completedChallengeIds).toEqual([FIXTURE_CHALLENGE_KEY]);
    expect(stores.cmsLab.savedChallengeIds).toEqual([FIXTURE_CHALLENGE_KEY]);
    expect(JSON.parse(stores.localLabRaw || '{}')).toEqual({
      positions: {},
      completedChallengeIds: [],
      savedChallengeIds: [],
      scripture: [],
    });
    expect(stores.prototype.completedChallengeIds).toBeUndefined();
    expect(stores.prototype.savedChallengeIds).toBeUndefined();
    expect(JSON.stringify(stores.prototype)).not.toContain('Structural Adapter Fixture');
    expect(JSON.stringify(stores.prototype)).not.toContain('sanity-fixture');
  });

  test('clamps removed screen IDs safely and stays usable in narrow portrait with large reading text', async ({ page }) => {
    await page.route('https://*.api.sanity.io/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ result: [] }),
      });
    });

    await page.setViewportSize({ width: 375, height: 812 });
    await page.addInitScript(
      ([protoKey, cmsKey, challengeKey]) => {
        localStorage.setItem(protoKey, JSON.stringify({
          onboarded: true,
          appearance: 'dark',
          textSize: 'large',
          reminderEnabled: false,
          reminderTime: '08:00',
          explored: [],
          journey: [],
          lastOpened: null,
          resumeDismissedDate: '',
        }));
        localStorage.setItem(cmsKey, JSON.stringify({
          positions: { [challengeKey]: 'screen-removed-from-challenge' },
          completedChallengeIds: [],
          savedChallengeIds: [],
          scripture: [],
        }));
      },
      [PROTOTYPE_STORAGE_KEY, CMS_LAB_STORAGE_KEY, FIXTURE_CHALLENGE_KEY],
    );

    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('.reading-large')).toBeVisible();

    await page.locator('.bottom-nav button:has-text("More")').click();
    await page.locator('button.developer-studio-entry').click();
    await page.locator('button:has-text("Open Interactive Challenge Lab")').click();
    await page.locator('.lab-source-selector__buttons button:has-text("Sanity CMS")').click();
    await page.locator('.cms-mode-selector__buttons button:has-text("Development Fixture Preview")').click();

    // Removed screen ID safely clamps back to first screen ("Begin Challenge")
    const challengeRow = page.locator('.lab-challenge-row', { hasText: 'Structural Adapter Fixture' });
    await expect(challengeRow).toContainText('Begin Challenge');
    await challengeRow.locator('.lab-challenge-row__open').click();

    await expect(page.locator('#screen-encounter-title')).toHaveText('Fixture screen one');
    const screen1Overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(screen1Overflow).toBe(true);

    // Keyboard activation on Continue button and overflow check on Screen 2
    const continueBtn = page.getByRole('navigation', { name: 'CMS Challenge screen navigation' }).getByRole('button', { name: 'Continue' });
    await continueBtn.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#screen-response-title')).toHaveText('Fixture screen two');
    await expect(page.locator('#screen-response-title')).toBeFocused();

    const screen2Overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(screen2Overflow).toBe(true);
  });
});
