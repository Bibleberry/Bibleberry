import { test, expect } from './helpers/frameSafeTest';

const PROTOTYPE_STORAGE_KEY = 'bibleberry-prototype-v1';
const PRODUCTION_PARTICIPATION_KEY = 'bibleberry-reader-participation-v1';
const PARTICIPATION_PILOT_KEY = 'bibleberry-participation-pilot-v1';
const LOCAL_LAB_STORAGE_KEY = 'bibleberry-interactive-challenge-lab-v1';
const CMS_LAB_STORAGE_KEY = 'bibleberry-sanity-challenge-lab-v1';

test.describe('Participation Persistence Reload Pilot (A3 / Issue #46)', () => {
  let uncaughtErrors: Error[] = [];

  test.beforeEach(async ({ page }) => {
    uncaughtErrors = [];
    page.on('pageerror', err => uncaughtErrors.push(err));
    await page.clock.setFixedTime(new Date('2026-11-05T12:00:00Z'));
  });

  test.afterEach(async () => {
    expect(uncaughtErrors).toEqual([]);
  });

  test('persists screen resume, Back-to-Screen-1 inProgress state, normalized Scripture saves, and distinct completion across full reloads with strict namespace isolation', async ({ page }) => {
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
    await expect(page.locator('.pilot-entry-bar a[href="#/pilot/participation"]')).toBeVisible();

    // Participation pilot bundle must NOT expose Developer Studio or A2's #/pilot/challenge bar
    await expect(page.locator('.pilot-entry-bar a[href="#/pilot/challenge"]')).toHaveCount(0);
    await page.locator('.desktop-nav button:has-text("More")').click();
    await expect(page.locator('.more-page')).toBeVisible();
    await expect(page.locator('button.developer-studio-entry')).toHaveCount(0);

    // Open persistence pilot from Archive
    await page.locator('.desktop-nav button:has-text("Archive")').click();
    await expect(page.locator('.archive-page')).toBeVisible();
    await page.locator('.pilot-entry-bar a[href="#/pilot/participation"]').click();
    expect(page.url()).toContain('#/pilot/participation');

    const statusLine = page.locator('.pilot-disclosure__status');
    const nav = page.getByRole('navigation', { name: 'Challenge screen navigation' });

    // 1. Opening records only lastOpenedChallenge; status stays `notStarted` and distinct completed is 0
    await expect(page.locator('#a3-pilot-screen-one-title')).toBeFocused();
    await expect(statusLine).toContainText('Store: ready (ok) · Distinct completed: 0 · Status: notStarted · Challenge not saved · 0 Scripture references saved');

    // 2. Advance to Screen 2 -> status becomes `inProgress (a3-pilot-screen-two)` -> reload resumes at Screen 2!
    await nav.getByRole('button', { name: 'Next' }).click();
    await expect(page.locator('#a3-pilot-screen-two-title')).toBeFocused();
    await expect(statusLine).toContainText('Status: inProgress (a3-pilot-screen-two)');

    await page.reload();
    await expect(page.locator('#a3-pilot-screen-two-title')).toBeVisible();
    await expect(page.locator('#a3-pilot-screen-two-title')).toBeFocused();
    await expect(statusLine).toContainText('Status: inProgress (a3-pilot-screen-two)');

    // 3. Navigate Previous to Screen 1 -> reload MUST retain `inProgress (a3-pilot-screen-one)` (never reset to notStarted!)
    await nav.getByRole('button', { name: 'Previous' }).click();
    await expect(page.locator('#a3-pilot-screen-one-title')).toBeFocused();
    await expect(statusLine).toContainText('Status: inProgress (a3-pilot-screen-one)');

    await page.reload();
    await expect(page.locator('#a3-pilot-screen-one-title')).toBeVisible();
    await expect(statusLine).toContainText('Status: inProgress (a3-pilot-screen-one)');

    // 4. Bookmark Challenge & save Primary Scripture (`WEBP`) + Optional Scripture (`'Not configured'` -> `null`)
    const saveChallengeBtn = page.locator('button.lab-save-challenge');
    await saveChallengeBtn.click();
    await expect(saveChallengeBtn).toHaveAttribute('aria-pressed', 'true');

    const primaryScripture = page.locator('section[aria-label="Primary Scripture"]');
    await primaryScripture.locator('button.lab-scripture-save').click();

    await nav.getByRole('button', { name: 'Next' }).click();
    const optionalStudy = page.locator('.lab-optional');
    await optionalStudy.locator('.lab-optional__toggle').click();
    const optionalScripture = optionalStudy.locator('.cms-scripture', { hasText: 'John 11:33–35' });
    await expect(optionalScripture).toContainText('Reference only · Passage text not included');
    await expect(optionalScripture).not.toContainText('Not configured');
    await optionalScripture.locator('button.lab-scripture-save').click();

    await expect(statusLine).toContainText(
      'Challenge saved · 2 Scripture references saved (1 Thessalonians 5:16–18 [WEBP], John 11:33–35)',
    );

    // Reload and verify saved Challenge + saved Scriptures + JSON schema invariants
    await page.reload();
    await expect(page.locator('#a3-pilot-screen-two-title')).toBeVisible();
    await expect(saveChallengeBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(statusLine).toContainText(
      'Challenge saved · 2 Scripture references saved (1 Thessalonians 5:16–18 [WEBP], John 11:33–35)',
    );

    const storedEnvelopeAfterSave = await page.evaluate(pilotKey => {
      const raw = localStorage.getItem(pilotKey);
      return raw ? JSON.parse(raw) : null;
    }, PARTICIPATION_PILOT_KEY);
    expect(storedEnvelopeAfterSave.schemaVersion).toBe(3);
    expect(storedEnvelopeAfterSave.data.earnedAwards).toEqual({});
    expect(storedEnvelopeAfterSave.data.savedScriptures).toEqual([
      {
        key: '1 thessalonians 5:16-18|webp',
        reference: '1 Thessalonians 5:16–18',
        translation: 'WEBP',
        savedOn: '2026-11-05',
        sourceChallengeId: 'pilot:a3-persistence-sample',
      },
      {
        key: 'john 11:33-35|',
        reference: 'John 11:33–35',
        translation: null,
        savedOn: '2026-11-05',
        sourceChallengeId: 'pilot:a3-persistence-sample',
      },
    ]);

    // 5. Explicit completion on final screen records once, keeps reader on Screen 2 with completion acknowledgment, and clears durable inProgress
    const completeBtn = nav.getByRole('button', { name: 'Finish' });
    await expect(completeBtn).toBeEnabled();
    await completeBtn.click();

    await expect(page.locator('#a3-pilot-screen-two-title')).toBeVisible();
    await expect(page.locator('.lab-completion')).toContainText(
      'You completed this Challenge. Optional content remains available to revisit.',
    );
    await expect(nav.getByRole('button', { name: 'Challenge complete' })).toBeDisabled();
    await expect(statusLine).toContainText('Distinct completed: 1 · Status: completed (2026-11-05)');

    const storedAfterComplete = await page.evaluate(pilotKey => {
      const raw = localStorage.getItem(pilotKey);
      return raw ? JSON.parse(raw) : null;
    }, PARTICIPATION_PILOT_KEY);
    expect(storedAfterComplete.data.completedChallenges).toEqual({
      'pilot:a3-persistence-sample': { completedOn: '2026-11-05' },
    });
    expect(storedAfterComplete.data.inProgressChallenges).toEqual({});

    // 6. Reload on a later date -> reread starts cleanly on Screen 1 (never stranded on Screen 2!) and never inflates distinct completed count
    await page.clock.setFixedTime(new Date('2026-11-06T12:00:00Z'));
    await page.reload();
    await expect(page.locator('#a3-pilot-screen-one-title')).toBeVisible();
    await expect(page.locator('#a3-pilot-screen-one-title')).toBeFocused();
    await expect(statusLine).toContainText('Distinct completed: 1 · Status: completed (2026-11-05)');

    await nav.getByRole('button', { name: 'Next' }).click();
    await expect(page.locator('#a3-pilot-screen-two-title')).toBeFocused();
    await expect(nav.getByRole('button', { name: 'Challenge complete' })).toBeDisabled();
    await expect(statusLine).toContainText('Distinct completed: 1 · Status: completed (2026-11-05)');

    // Verify strict namespace isolation: zero writes to production participation or Lab storage keys
    const isolatedKeys = await page.evaluate(
      ([prodKey, localLabKey, cmsLabKey]) => ({
        allKeys: Object.keys(localStorage).sort(),
        prodVal: localStorage.getItem(prodKey),
        localLabVal: localStorage.getItem(localLabKey),
        cmsLabVal: localStorage.getItem(cmsLabKey),
      }),
      [PRODUCTION_PARTICIPATION_KEY, LOCAL_LAB_STORAGE_KEY, CMS_LAB_STORAGE_KEY],
    );
    expect(isolatedKeys.allKeys).toEqual([PARTICIPATION_PILOT_KEY, PROTOTYPE_STORAGE_KEY]);
    expect(isolatedKeys.prodVal).toBeNull();
    expect(isolatedKeys.localLabVal).toBeNull();
    expect(isolatedKeys.cmsLabVal).toBeNull();

    // 7. Reset pilot data button clears pilot state cleanly
    await page.getByRole('button', { name: 'Reset pilot data' }).click();
    await expect(page.locator('#a3-pilot-screen-one-title')).toBeVisible();
    await expect(statusLine).toContainText('Distinct completed: 0 · Status: notStarted · Challenge not saved · 0 Scripture references saved');
    const clearedPilotRaw = await page.evaluate(pilotKey => localStorage.getItem(pilotKey), PARTICIPATION_PILOT_KEY);
    expect(clearedPilotRaw).toBeNull();
  });

  test('never overwrites unsupportedNewerSchema in browser storage until explicit local data reset', async ({ page }) => {
    const newerSchemaPayload = JSON.stringify({
      schemaVersion: 4,
      futureData: 'do-not-clobber',
      data: { completedChallenges: {} },
    });

    await page.addInitScript(
      ([protoKey, pilotKey, payload]) => {
        if (!localStorage.getItem(protoKey)) {
          localStorage.setItem(protoKey, JSON.stringify({
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
        if (!sessionStorage.getItem('seeded-future-schema')) {
          sessionStorage.setItem('seeded-future-schema', '1');
          localStorage.setItem(pilotKey, payload);
        }
      },
      [PROTOTYPE_STORAGE_KEY, PARTICIPATION_PILOT_KEY, newerSchemaPayload],
    );

    await page.goto('/#/pilot/participation');
    const statusLine = page.locator('.pilot-disclosure__status');
    await expect(statusLine).toContainText('Store: ready (unsupportedNewerSchema)');

    // Reader can still bookmark in-session without clobbering `schemaVersion: 4` in localStorage
    await page.locator('button.lab-save-challenge').click();
    await expect(statusLine).toContainText('Challenge saved');
    const rawStillIntact = await page.evaluate(pilotKey => localStorage.getItem(pilotKey), PARTICIPATION_PILOT_KEY);
    expect(rawStillIntact).toBe(newerSchemaPayload);

    // Explicit Reset via More -> Privacy & local data -> Reset local app data clears local stores
    await page.locator('.desktop-nav button:has-text("More")').click();
    await page.locator('.more-list button:has-text("Privacy & local data")').click();
    await page.locator('.reset-zone button:has-text("Reset local app data")').click();
    await page.locator('.confirm-panel button:has-text("Erase & reset")').click();
    await expect(page.locator('.onboarding')).toBeVisible();
    await expect.poll(async () =>
      page.evaluate(pilotKey => localStorage.getItem(pilotKey), PARTICIPATION_PILOT_KEY),
    ).toBeNull();
  });

  test('preserves #/pilot/participation across onboarding and supports keyboard, Back/Forward, and responsive layouts', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    await page.goto('/#/pilot/participation');
    await expect(page.locator('.onboarding')).toBeVisible();
    await page.locator('.onboarding button:has-text("Continue")').click();
    await page.locator('.onboarding button:has-text("Continue to Today")').click();

    await expect(page.locator('.challenge-reader-page')).toBeVisible();
    await expect(page.locator('button.challenge-player__exit')).toHaveText('Return to Today');

    // Enable Dark theme + Large reading text in More
    await page.locator('.bottom-nav button:has-text("More")').click();
    await page.locator('.more-list button:has-text("Appearance & reading")').click();
    await page.locator('.choice-grid button:has-text("Dark")').click();
    await page.locator('.text-size-control button:has-text("Large")').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('#root > .reading-large')).toBeVisible();

    // Open participation pilot via keyboard from More
    await page.locator('.detail-header .back-link').click();
    const pilotLink = page.locator('.pilot-entry-bar a[href="#/pilot/participation"]');
    await pilotLink.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#a3-pilot-screen-one-title')).toBeFocused();
    await expect(page.locator('button.challenge-player__exit')).toHaveText('Return to More');

    // Advance via keyboard
    const nextBtn = page
      .getByRole('navigation', { name: 'Challenge screen navigation' })
      .getByRole('button', { name: 'Next' });
    await nextBtn.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#a3-pilot-screen-two-title')).toBeFocused();

    // Responsive checks across 375px, 320px, and 1024px viewports
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.setViewportSize({ width: 320, height: 640 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.setViewportSize({ width: 1024, height: 768 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    // Browser Back/Forward and keyboard exit
    await page.goBack();
    await expect(page.locator('.more-page')).toBeVisible();
    await page.goForward();
    await expect(page.locator('#a3-pilot-screen-two-title')).toBeVisible();

    const exitBtn = page.locator('button.challenge-player__exit');
    await exitBtn.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.more-page')).toBeVisible();
  });

  test('handles delayed async storage hydration and prevents earlier delayed writes from undoing local reset in browser', async ({ page }) => {
    await page.addInitScript(
      ([protoKey, pilotKey]) => {
        if (!localStorage.getItem(protoKey)) {
          localStorage.setItem(protoKey, JSON.stringify({
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
        if (!sessionStorage.getItem('seeded-async-resume')) {
          sessionStorage.setItem('seeded-async-resume', '1');
          localStorage.setItem(pilotKey, JSON.stringify({
            schemaVersion: 1,
            data: {
              completedChallenges: {},
              inProgressChallenges: {
                'pilot:a3-persistence-sample': {
                  screenId: 'a3-pilot-screen-two',
                  updatedOn: '2026-11-05',
                },
              },
              savedChallenges: {},
              savedScriptures: [],
              lastOpenedChallenge: null,
            },
          }));
        }
      },
      [PROTOTYPE_STORAGE_KEY, PARTICIPATION_PILOT_KEY],
    );

    // 1. Async hydration (`pilotAsyncMs=800`): host displays hydrating status first, then mounts directly at Screen 2
    await page.goto('/?pilotAsyncMs=800#/pilot/participation', { waitUntil: 'commit' });
    await expect(page.locator('.pilot-disclosure__status')).toContainText('Store: hydrating (ok)');
    await expect(page.getByText('Loading reading progress…')).toBeVisible();
    await expect(page.locator('#a3-pilot-screen-two-title')).toBeVisible();
    await expect(page.locator('.pilot-disclosure__status')).toContainText(
      'Store: ready (ok) · Distinct completed: 0 · Status: inProgress (a3-pilot-screen-two)',
    );

    // 2. Trigger explicit completion (800ms getItem + 800ms setItem), wait 900ms so `setItem` is actively in flight, then reset
    const nav = page.getByRole('navigation', { name: 'Challenge screen navigation' });
    await nav.getByRole('button', { name: 'Finish' }).click();
    await expect(page.locator('.pilot-disclosure__status')).toContainText('Distinct completed: 1');
    await page.waitForTimeout(900);

    // Click Reset pilot data while the earlier delayed `setItem` completion write is actively in flight
    await page.getByRole('button', { name: 'Reset pilot data' }).click();
    await expect(page.locator('.pilot-disclosure__status')).toContainText('Distinct completed: 0 · Status: notStarted');

    // Wait past the full async `setItem` + serialized `removeItem` window and verify storage + reload remain empty
    await page.waitForTimeout(1000);
    await expect(page.locator('.pilot-disclosure__status')).toContainText('Distinct completed: 0 · Status: notStarted');
    const rawAfterDelayedWindow = await page.evaluate(
      pilotKey => localStorage.getItem(pilotKey),
      PARTICIPATION_PILOT_KEY,
    );
    expect(rawAfterDelayedWindow).toBeNull();

    await page.reload();
    await expect(page.locator('#a3-pilot-screen-one-title')).toBeVisible();
    await expect(page.locator('.pilot-disclosure__status')).toContainText('Distinct completed: 0 · Status: notStarted');
  });

  test('single-screen Challenge UI exercises Start Challenge button, durable resume, and explicit completion without timers or optional study', async ({ page }) => {
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

    // 1. Opening a single-screen Challenge does NOT automatically mark it inProgress
    await page.goto('/?pilotSingleScreen=true#/pilot/participation');
    const statusLine = page.locator('.pilot-disclosure__status');
    const nav = page.getByRole('navigation', { name: 'Challenge screen navigation' });
    const startBtn = nav.getByRole('button', { name: 'Start Challenge' });
    const completeBtn = nav.getByRole('button', { name: 'Finish' });

    await expect(page.locator('#a3-pilot-screen-one-title')).toBeVisible();
    await expect(statusLine).toContainText('Distinct completed: 0 · Status: notStarted');
    await expect(startBtn).toBeVisible();
    await expect(startBtn).toBeEnabled();
    await expect(completeBtn).toBeVisible();
    await expect(completeBtn).toBeEnabled();

    // Verify localStorage has no inProgress record for this single-screen Challenge
    const storedEnvelopeAtOpen = await page.evaluate(pilotKey => {
      const raw = localStorage.getItem(pilotKey);
      return raw ? JSON.parse(raw) : null;
    }, PARTICIPATION_PILOT_KEY);
    expect(storedEnvelopeAtOpen.data.inProgressChallenges['pilot:a3-single-screen-sample']).toBeUndefined();

    // 2. Clicking "Start Challenge" changes its persisted participation status to inProgress
    await startBtn.click();
    await expect(statusLine).toContainText('Distinct completed: 0 · Status: inProgress (a3-pilot-screen-one)');
    await expect(startBtn).toHaveCount(0);
    await expect(nav.getByRole('button', { name: 'Previous' })).toBeDisabled();

    const storedEnvelopeAfterStart = await page.evaluate(pilotKey => {
      const raw = localStorage.getItem(pilotKey);
      return raw ? JSON.parse(raw) : null;
    }, PARTICIPATION_PILOT_KEY);
    expect(storedEnvelopeAfterStart.data.inProgressChallenges['pilot:a3-single-screen-sample']).toEqual({
      screenId: 'a3-pilot-screen-one',
      updatedOn: '2026-11-05',
    });

    // 3. Leaving and reloading restores the inProgress state
    await page.reload();
    await expect(page.locator('#a3-pilot-screen-one-title')).toBeVisible();
    await expect(statusLine).toContainText('Distinct completed: 0 · Status: inProgress (a3-pilot-screen-one)');
    await expect(nav.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await expect(completeBtn).toBeEnabled();

    // 4. Explicitly completing the Challenge changes its status to completed and clears inProgress
    await completeBtn.click();
    await expect(statusLine).toContainText('Distinct completed: 1 · Status: completed (2026-11-05)');
    await expect(nav.getByRole('button', { name: 'Challenge complete' })).toBeDisabled();

    const storedEnvelopeAfterComplete = await page.evaluate(pilotKey => {
      const raw = localStorage.getItem(pilotKey);
      return raw ? JSON.parse(raw) : null;
    }, PARTICIPATION_PILOT_KEY);
    expect(storedEnvelopeAfterComplete.data.completedChallenges['pilot:a3-single-screen-sample']).toEqual({
      completedOn: '2026-11-05',
    });
    expect(storedEnvelopeAfterComplete.data.inProgressChallenges['pilot:a3-single-screen-sample']).toBeUndefined();

    // 5. Repeat completion on a later date does NOT increase distinct completed count or alter completion date
    await page.clock.setFixedTime(new Date('2026-11-06T12:00:00Z'));
    await page.reload();
    await expect(page.locator('#a3-pilot-screen-one-title')).toBeVisible();
    await expect(statusLine).toContainText('Distinct completed: 1 · Status: completed (2026-11-05)');
    await expect(nav.getByRole('button', { name: 'Challenge complete' })).toBeDisabled();

    const storedEnvelopeAfterReload = await page.evaluate(pilotKey => {
      const raw = localStorage.getItem(pilotKey);
      return raw ? JSON.parse(raw) : null;
    }, PARTICIPATION_PILOT_KEY);
    expect(storedEnvelopeAfterReload.data.completedChallenges['pilot:a3-single-screen-sample'].completedOn).toBe('2026-11-05');
  });
});
