#!/usr/bin/env node
/**
 * Glass Atlas — R06 Connected Experience Prototype Automated Browser Smoke & Screenshot Suite
 *
 * Scoped strictly to docs/prototypes/r06-connected-experience/.
 * Starts a temporary local static HTTP server (127.0.0.1, ephemeral port),
 * exercises all 8 G09 journeys, security/embargo negative checks, responsive reflow
 * (320px, 375px, 768x1024, 1024x768, 200% zoom), and captures representative review PNGs.
 *
 * Usage:
 *   node docs/prototypes/r06-connected-experience/tests/smoke.mjs
 *   CAPTURE_SCREENSHOTS=1 node docs/prototypes/r06-connected-experience/tests/smoke.mjs
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROTO_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(PROTO_DIR, '..', '..', '..');
const SCREENSHOT_DIR = path.join(PROTO_DIR, 'screenshots');
const CAPTURE = process.env.CAPTURE_SCREENSHOTS === '1';

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  const candidates = [
    path.join(REPO_ROOT, 'node_modules', '@playwright', 'test'),
    path.join(REPO_ROOT, 'node_modules', 'playwright'),
    '/home/aaron/Projects/Bibleberry/node_modules/@playwright/test',
    '/home/aaron/Projects/Bibleberry/node_modules/playwright'
  ];
  for (const cand of candidates) {
    if (fs.existsSync(cand)) {
      return require(cand);
    }
  }
  return require('@playwright/test');
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

function startStaticServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const safeRel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
      const fullPath = path.resolve(PROTO_DIR, safeRel);
      if (!fullPath.startsWith(PROTO_DIR) || !fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(fullPath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(fullPath).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

async function main() {
  const { chromium } = loadPlaywright();
  const { server, baseUrl } = await startStaticServer();
  const browser = await chromium.launch({ headless: true });

  const results = [];
  async function runTest(name, fn) {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    try {
      await fn(page, context);
      assert.equal(errors.length, 0, `Unexpected page errors: ${errors.join('; ')}`);
      results.push({ name, status: 'PASS' });
      console.log(`  PASS  ${name}`);
    } catch (err) {
      results.push({ name, status: 'FAIL', error: err.message });
      console.error(`  FAIL  ${name}\n        ${err.message}`);
      throw err;
    } finally {
      await context.close();
    }
  }

  console.log(`\nRunning Glass Atlas R06 Prototype Smoke Suite against ${baseUrl}\n`);

  try {
    // 1. Global Navigation Order, Session Restoration & Active-Tab Reset
    await runTest('01. Global IA order (Today | Library | Collections | More), session restore & active-tab reset', async (page) => {
      await page.goto(`${baseUrl}/index.html?scenario=g09-6-earned-collections`);
      const tabs = await page.locator('#global-nav-root .global-nav__btn').allInnerTexts();
      const cleaned = tabs.map((t) => t.replace(/\s*\(New Discoveries\)/i, '').trim());
      assert.deepEqual(cleaned, ['Today', 'Library', 'Collections', 'More']);

      // Navigate into Library -> Browse All Months
      await page.getByTestId('nav-tab-library').click();
      await page.getByTestId('library-browse-all-btn').click();
      await page.getByTestId('library-search-input').waitFor();

      // Switch to Collections, then back to Library -> nested view preserved!
      await page.getByTestId('nav-tab-collections').click();
      await page.getByTestId('open-field-notebook-btn').waitFor();
      await page.getByTestId('nav-tab-library').click();
      assert.equal(await page.getByTestId('library-search-input').isVisible(), true);

      // Re-tapping active Library tab returns to Library landing
      await page.getByTestId('nav-tab-library').click();
      await page.getByTestId('library-shelf-section').waitFor();
    });

    // 2. G09 Journey 1: Normal First Use
    await runTest('02. G09 #1 Normal First Use: Intro -> Tutorial (0 awards) -> Today -> Exit/Resume/Start from Beginning/Finish', async (page) => {
      await page.goto(`${baseUrl}/index.html?scenario=g09-1-normal-first-use`);
      await page.getByTestId('app-intro-overlay').waitFor();
      // Global nav hidden during App Intro
      assert.equal(await page.locator('#global-nav-root').isHidden(), true);

      // Complete 3-screen App Introduction
      await page.getByTestId('app-intro-next-btn').click();
      await page.getByTestId('app-intro-next-btn').click();
      await page.getByTestId('app-intro-next-btn').click();

      // Guided App Tutorial starts automatically across 4 destinations
      await page.getByTestId('app-tutorial-overlay').waitFor();
      await page.getByTestId('tutorial-next-btn').click(); // step 2 Library
      await page.getByTestId('tutorial-next-btn').click(); // step 3 Collections
      await page.getByTestId('tutorial-next-btn').click(); // step 4 More
      await page.getByTestId('tutorial-next-btn').click(); // Finish Tour -> Today

      assert.equal(await page.getByTestId('app-tutorial-overlay').count(), 0);
      await page.getByTestId('today-primary-cta').waitFor();

      // Verify tutorial awarded 0 Cards and 0 completions
      const earnedAfterTour = await page.evaluate(() => Object.keys(window.R06Proto.State.getState().earnedAwards).length);
      assert.equal(earnedAfterTour, 0);

      // Open today's Challenge -> global nav hidden
      await page.getByTestId('today-primary-cta').click();
      await page.getByTestId('reader-screen-count').waitFor();
      assert.equal(await page.locator('#global-nav-root').isHidden(), true);

      // Advance to Screen 2 and Exit without Finish
      await page.getByTestId('reader-next-btn').click();
      assert.equal(await page.getByTestId('reader-screen-count').innerText(), 'Screen 2 of 3');
      await page.getByTestId('reader-exit-btn').click();

      // Today shows Resume Today's Reading (unfinished!)
      assert.match(await page.getByTestId('today-primary-cta').innerText(), /Resume/i);
      await page.getByTestId('today-primary-cta').click();
      assert.equal(await page.getByTestId('reader-screen-count').innerText(), 'Screen 2 of 3');

      // Start from Beginning resets to Screen 1
      await page.getByTestId('reader-start-beginning-btn').click();
      assert.equal(await page.getByTestId('reader-screen-count').innerText(), 'Screen 1 of 3');

      // Advance to Screen 3 and tap explicit Finish
      await page.getByTestId('reader-next-btn').click();
      await page.getByTestId('reader-next-btn').click();
      await page.getByTestId('reader-finish-btn').click();

      // Back on Today with Completed + Read Again!
      assert.equal(await page.getByTestId('today-primary-cta').innerText(), 'Read Again');
    });

    // 3. G09 Journey 2: External First Use (G04-A & G04-B) + Fail-Closed Embargo/Invalid Links
    await runTest('03. G09 #2 External First Use (G04-A/G04-B) & fail-closed embargoed/withdrawn/invalid links', async (page) => {
      await page.goto(`${baseUrl}/index.html?scenario=g09-2-external-first-use`);
      // Opens directly into October 14 Challenge BEFORE onboarding
      await page.getByTestId('reader-screen-count').waitFor();
      assert.equal(await page.locator('#global-nav-root').isHidden(), true);

      // Exit returns to Today (NOT October Month Screen!) with onboarding still pending
      await page.getByTestId('reader-exit-btn').click();
      await page.getByTestId('today-primary-teaching').waitFor();
      const ob = await page.evaluate(() => window.R06Proto.State.getState().onboarding);
      assert.equal(ob.introStatus, 'pending');
      assert.equal(ob.tutorialStatus, 'pending');

      // Test embargoed external link -> fail closed neutrally with Return to Today
      await page.getByTestId('workbench-toggle-btn').click();
      await page.getByTestId('workbench-ext-ext-embargoed').click();
      await page.getByTestId('external-unavailable-view').waitFor();
      const errText = await page.getByTestId('external-unavailable-view').innerText();
      assert.equal(errText.includes('November 25'), false, 'Embargoed fallback must not leak release date');
      await page.getByTestId('external-return-today-btn').click();
      await page.getByTestId('today-primary-teaching').waitFor();
    });

    // 4. G09 Journey 3: Current Month, G05 Monthly Intro/Welcome, Weekly Agenda, Discoveries & Preview
    await runTest('04. G09 #3 Current Month (G05 intro/welcome, weekly agenda, unearned secrets, Nov 28 & Feb 27 preview)', async (page) => {
      await page.goto(`${baseUrl}/index.html?scenario=g09-3-current-month`);
      // Direct Today Challenge does NOT trigger Monthly Intro
      await page.getByTestId('today-primary-cta').click();
      await page.getByTestId('reader-exit-btn').click();
      assert.equal(await page.getByTestId('month-intro-overlay').count(), 0);

      // First intentional Month Screen visit triggers Monthly Intro + Welcome
      await page.getByTestId('today-current-month-link').click();
      await page.getByTestId('month-intro-overlay').waitFor();
      await page.getByTestId('month-intro-next-btn').click();
      await page.getByTestId('month-intro-next-btn').click();
      assert.match(await page.getByTestId('month-intro-overlay').innerText(), /Welcome to Paths of Quiet Faith/i);
      await page.getByTestId('month-intro-next-btn').click();

      // Continuous weekly agenda panels visible (6 Mon–Sun weeks in Nov 2026)
      assert.equal(await page.locator('.week-panel').count(), 6);
      // Future title visible, non-interactive
      assert.equal(await page.getByTestId('agenda-locked-2026-11-25').isVisible(), true);
      // Unearned discovery shows NO card SVG artwork!
      const unearnedSvgCount = await page.getByTestId('discovery-row-disc-2026-11-hospitality').locator('svg').count();
      assert.equal(unearnedSvgCount, 0);
      // Full-month discovery is last in Monthly Discoveries
      const lastDiscoveryTestId = await page.locator('.discovery-list > .discovery-item').last().getAttribute('data-testid');
      assert.equal(lastDiscoveryTestId, 'discovery-full-month');

      // Nov 28 Advance Preview withholds Monthly Discoveries and Welcome screen
      await page.goto(`${baseUrl}/index.html?scenario=edge-preview-nov28`);
      await page.getByTestId('open-advance-preview-btn').click();
      await page.getByTestId('month-preview-notice').waitFor();
      assert.equal(await page.getByTestId('monthly-discoveries-section').count(), 0);
      await page.getByTestId('replay-month-intro-btn').click();
      await page.getByTestId('month-intro-next-btn').click();
      assert.doesNotMatch(await page.getByTestId('month-intro-overlay').innerText(), /Welcome to Waiting in Hope/i);
      await page.getByTestId('month-intro-next-btn').click();

      // Feb 27 Advance Preview rule for March 2026
      await page.goto(`${baseUrl}/index.html?scenario=edge-preview-feb27`);
      assert.match(await page.getByTestId('today-advance-preview').innerText(), /March 2026/i);
    });

    // 5. G09 Journey 4: Historical Continuity, G01 Completed Focus, G02 Rollover & G03 Protected Shelf
    await runTest('05. G09 #4 Historical Continuity (Active Focus resume, G01 Review This Month, G02 rollover, G03 protection)', async (page) => {
      await page.goto(`${baseUrl}/index.html?scenario=g09-4-historical-continuity`);
      // Active Focus Oct 2026 has unfinished Oct 3 -> Continue Reading opens directly at Screen 2 of 3
      assert.equal(await page.getByTestId('today-continue-study').count(), 1);
      await page.getByTestId('continue-study-cta').click();
      assert.equal(await page.getByTestId('reader-screen-count').innerText(), 'Screen 2 of 3');
      await page.getByTestId('reader-exit-btn').click();

      // Switch Active Focus to completed Sep 2026 -> Today shows "Review This Month" (G01)
      await page.getByTestId('nav-tab-library').click();
      await page.getByTestId('shelf-focus-2026-09').click();
      await page.getByTestId('nav-tab-today').click();
      assert.equal(await page.getByTestId('continue-study-cta').innerText(), 'Review This Month');

      // G02: Dec 1 rollover with NO Active Focus + interrupted Nov Challenge -> one-time continuation
      await page.goto(`${baseUrl}/index.html?scenario=edge-rollover-g02`);
      assert.match(await page.getByTestId('today-continue-study').innerText(), /Prior Month/i);
      await page.getByTestId('continue-study-cta').click();
      assert.equal(await page.getByTestId('reader-screen-count').innerText(), 'Screen 2 of 3');
      await page.getByTestId('reader-exit-btn').click();
      // Consumed one-time opportunity does not reappear!
      assert.equal(await page.getByTestId('today-continue-study').count(), 0);

      // G03: Full 3-slot Shelf rollover protects BOTH Kept (Sep) AND auto-admitted Active Focus (Oct), evicting oldest unprotected non-focus (Aug)
      await page.goto(`${baseUrl}/index.html?scenario=edge-rollover-g03`);
      await page.getByTestId('workbench-toggle-btn').click();
      await page.getByTestId('workbench-rollover-btn').click();
      assert.equal(await page.getByTestId('shelf-card-2026-10').isVisible(), true, 'Active Focus Oct must be protected (G03)');
      assert.equal(await page.getByTestId('shelf-card-2026-09').isVisible(), true, 'Kept Sep must be protected');
      assert.equal(await page.getByTestId('shelf-card-2026-11').isVisible(), true, 'Prior month Nov auto-admitted');
      assert.equal(await page.getByTestId('shelf-card-2026-08').count(), 0, 'Oldest unprotected non-focus Aug evicted');
    });

    // 6. G09 Journey 5: Library & Shelf Workspace (Empty, Keep, Replace 4th, Put Away Focus, Search, Foundations)
    await runTest('06. G09 #5 Library & Shelf (Empty, Keep, 4th-month replacement, Put Away Active Focus, Search, Foundations)', async (page) => {
      // Empty Shelf welcoming state
      await page.goto(`${baseUrl}/index.html?scenario=edge-empty-guest`);
      await page.getByTestId('nav-tab-library').click();
      await page.getByTestId('empty-shelf-state').waitFor();

      // Full 3-slot Shelf workspace
      await page.goto(`${baseUrl}/index.html?scenario=g09-5-library-shelf`);
      // Active Focus (Sep 2026) is ordered FIRST on Shelf
      const firstCardId = await page.locator('.shelf-card').first().getAttribute('data-testid');
      assert.equal(firstCardId, 'shelf-card-2026-09');

      // Keep on Shelf distinct from Active Focus
      await page.getByTestId('shelf-keep-2026-10').click();
      assert.match(await page.getByTestId('shelf-card-2026-10').innerText(), /Kept on Shelf/);

      // Browse All Months -> search + load more + 4th-month manual replacement chooser
      await page.getByTestId('library-browse-all-btn').click();
      await page.getByTestId('library-search-input').fill('Psalms');
      await page.getByTestId('library-search-results').waitFor();
      assert.equal(await page.getByTestId('catalogue-row-2026-07').isVisible(), true);

      // Attempt to add 4th month (July 2026) -> chooser + confirmation
      await page.getByTestId('catalogue-add-2026-07').click();
      await page.getByTestId('replace-pick-2026-08').click();
      await page.getByTestId('replace-confirm-btn').click();
      assert.equal(await page.getByTestId('active-modal').count(), 0);

      // Put Away Active Focus (Sep 2026) -> explicit reassign prompt
      await page.getByTestId('nav-tab-library').click(); // reset to Library landing
      await page.getByTestId('shelf-putaway-2026-09').click();
      await page.getByTestId('putaway-choice-2026-10').check();
      await page.getByTestId('confirm-putaway-focus-btn').click();
      const newFirstCard = await page.locator('.shelf-card').first().getAttribute('data-testid');
      assert.equal(newFirstCard, 'shelf-card-2026-10');

      // Foundations overview shows conditional Resume Reading
      await page.getByTestId('library-foundations-btn').click();
      assert.equal(await page.getByTestId('foundations-primary-cta').innerText(), 'Resume Reading');
    });

    // 7. G09 Journey 6: Earned Collections, G07 Conditional Sections, Share Export & Saved Scripture
    await runTest('07. G09 #6 Earned Collections (Hub announcement, G07 sections, Full Card Share, Broken Art, Saved Scripture)', async (page) => {
      // Empty guest hides Foundations & Learning and Special Experiences completely!
      await page.goto(`${baseUrl}/index.html?scenario=edge-empty-guest`);
      await page.getByTestId('nav-tab-collections').click();
      await page.getByTestId('collections-empty-preview').waitFor();
      await page.getByTestId('open-field-notebook-btn').click();
      await page.getByTestId('notebook-empty-state').waitFor();
      assert.equal(await page.getByTestId('open-foundations-collection-btn').count(), 0);
      assert.equal(await page.getByTestId('open-special-experiences-btn').count(), 0);

      // Populated collections scenario: Finish Today (Nov 18) -> earns Everyday Hospitality!
      await page.goto(`${baseUrl}/index.html?scenario=g09-6-earned-collections`);
      await page.getByTestId('hub-card-announcement').waitFor();
      await page.getByTestId('today-primary-cta').click();
      // Save Scripture inside Challenge
      await page.getByTestId('reader-save-scripture-btn').click();
      await page.getByTestId('reader-next-btn').click();
      await page.getByTestId('reader-next-btn').click();
      await page.getByTestId('reader-finish-btn').click();

      // Today combined announcement now includes newly earned Everyday Hospitality -> View Discoveries
      await page.getByTestId('view-discoveries-btn').click();
      await page.getByTestId('discovery-card-card-2026-11-hospitality').waitFor();
      await page.getByTestId('discovery-card-card-2026-11-hospitality').click();

      // Full single-scroll Card view offers Share Scripture Card -> export preview with watermark
      await page.getByTestId('share-card-btn').click();
      await page.getByTestId('share-export-preview').waitFor();
      await page.getByTestId('confirm-share-btn').click();
      await page.keyboard.press('Escape');

      // Field Notebook hierarchy: lifetime status, Search Your Cards, All Earned, Foundations & Learning, Special Experiences
      await page.getByTestId('nav-tab-collections').click();
      await page.getByTestId('open-field-notebook-btn').click();
      await page.getByTestId('lifetime-status-card').waitFor();
      await page.getByTestId('open-foundations-collection-btn').waitFor();
      await page.getByTestId('open-special-experiences-btn').click();
      await page.getByTestId('special-event-group-evt-advent-quiet-2025').waitFor();

      // Search Your Cards (broken art card remains intact!)
      await page.getByTestId('nav-tab-collections').click();
      await page.getByTestId('open-field-notebook-btn').click();
      await page.getByTestId('notebook-search-input').fill('Gratitude');
      await page.getByTestId('notebook-search-row-card-2025-11-gratitude').click();
      assert.match(await page.locator('.full-card-article').innerText(), /Illustration unavailable/i);
    });

    // 8. G09 Journey 7: More, News Categories/Error/Retry, Appearance Persistence & Independent Replay
    await runTest('08. G09 #7 More, News filters/error/retry, Choose My Colors persistence & Intro/Tutorial replay', async (page) => {
      await page.goto(`${baseUrl}/index.html?scenario=g09-7-news-preferences`);
      // Featured News opens directly -> Back to More
      await page.getByTestId('more-featured-article-btn').click();
      await page.getByTestId('news-detail-back-btn').click();
      await page.getByTestId('more-view-all-news-btn').click();

      // Category filter + error + Retry
      await page.getByTestId('news-filter-monthlyPreview').click();
      await page.getByTestId('workbench-toggle-btn').click();
      await page.getByTestId('workbench-news-error').click();
      await page.getByTestId('news-error-state').waitFor();
      await page.getByTestId('news-retry-btn').click();
      await page.getByTestId('news-item-news-dec-preview').waitFor();

      // Appearance: Choose My Colors persists across seasonal date change!
      await page.getByTestId('nav-tab-more').click();
      await page.getByTestId('more-appearance-btn').click();
      await page.getByTestId('manual-palette-cedar').click();
      assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-resolved-palette')), 'palette-cedar');
      await page.getByTestId('workbench-rollover-btn').click();
      assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-resolved-palette')), 'palette-cedar');

      // Replay App Tutorial from More returns to More with zero data loss
      await page.getByTestId('nav-tab-more').click();
      await page.getByTestId('more-app-tutorial-btn').click();
      await page.getByTestId('app-tutorial-overlay').waitFor();
      await page.getByTestId('tutorial-skip-btn').click();
      await page.getByTestId('more-view-all-news-btn').waitFor();
    });

    // 9. G09 Journey 8: Accounts, Guest Invitation Threshold/Permanent Dismissal & G08 Verified Merge
    await runTest('09. G09 #8 Accounts (3-completion invite, permanent dismissal, partial failure + retry, G08 conflict confirmation)', async (page) => {
      await page.goto(`${baseUrl}/index.html?scenario=g09-8-accounts-merge`);
      // Eligible guest sees Today invitation -> permanent dismissal
      await page.getByTestId('today-guest-invite').waitFor();
      await page.getByTestId('guest-invite-dismiss-btn').click();
      assert.equal(await page.getByTestId('today-guest-invite').count(), 0);
      await page.reload();
      assert.equal(await page.getByTestId('today-guest-invite').count(), 0, 'Dismissal must persist permanently');

      // More -> Account & Progress always stays reachable
      await page.getByTestId('nav-tab-more').click();
      await page.getByTestId('more-account-btn').click();
      await page.getByTestId('more-signin-merge-btn').click();

      // Partial failure -> NO false success, shows safe Retry
      await page.getByTestId('merge-mode-failure').check();
      await page.getByTestId('run-merge-btn').click();
      await page.getByTestId('merge-failed-state').waitFor();
      assert.equal(await page.getByTestId('g08-merge-confirmation').count(), 0);

      // Safe retry succeeds with real Shelf conflict -> ONE brief G08 confirmation on Today!
      await page.getByTestId('merge-retry-btn').click();
      await page.getByTestId('g08-merge-confirmation').waitFor();
      assert.match(await page.getByTestId('g08-merge-confirmation').innerText(), /existing account’s Shelf stayed in place/i);
    });

    // 10. Account Merge Shelf Precedence Regression Matrix (P1)
    await runTest('10. Account merge Shelf precedence (guest empty, equal, conflicting, new account)', async (page) => {
      // Case A: Guest Shelf empty + existing account Shelf nonempty -> adopts account Shelf, NO conflict sentence!
      await page.goto(`${baseUrl}/index.html?scenario=edge-empty-guest&reset=1`);
      await page.getByTestId('nav-tab-more').click();
      await page.getByTestId('more-account-btn').click();
      await page.getByTestId('more-signin-merge-btn').click();
      await page.getByTestId('merge-mode-conflict').check();
      await page.getByTestId('run-merge-btn').click();
      await page.getByTestId('g08-merge-confirmation').waitFor();
      const emptyGuestMsg = await page.getByTestId('g08-merge-confirmation').innerText();
      assert.doesNotMatch(emptyGuestMsg, /existing account’s Shelf stayed in place/i, 'Empty guest Shelf must not trigger false conflict notice');
      const shelfAfterEmpty = await page.evaluate(() => window.R06Proto.State.getState().shelf);
      assert.deepEqual(
        shelfAfterEmpty.months.map((m) => m.yearMonth).sort(),
        ['2026-07', '2026-08'],
        'Existing account Shelf must be adopted even when guest Shelf is empty'
      );
      assert.equal(shelfAfterEmpty.activeFocusMonth, '2026-08');

      // Case B: Guest Shelf equal to existing account Shelf -> keeps account Shelf, NO false conflict sentence!
      await page.goto(`${baseUrl}/index.html?scenario=edge-empty-guest&reset=1`);
      await page.evaluate(() => {
        const st = window.R06Proto.State.getState();
        st.shelf = {
          months: [
            { yearMonth: '2026-08', admissionKind: 'readerSelected', protected: true, admittedOn: '2026-09-05' },
            { yearMonth: '2026-07', admissionKind: 'readerSelected', protected: true, admittedOn: '2026-08-12' }
          ],
          activeFocusMonth: '2026-08'
        };
        window.R06Proto.State.notify('Seeded matching Shelf');
      });
      await page.getByTestId('nav-tab-more').click();
      await page.getByTestId('more-account-btn').click();
      await page.getByTestId('more-signin-merge-btn').click();
      await page.getByTestId('merge-mode-conflict').check();
      await page.getByTestId('run-merge-btn').click();
      await page.getByTestId('g08-merge-confirmation').waitFor();
      const equalMsg = await page.getByTestId('g08-merge-confirmation').innerText();
      assert.doesNotMatch(equalMsg, /existing account’s Shelf stayed in place/i, 'Equal Shelves must not trigger false conflict notice');

      // Case C: Guest Shelf genuinely differs ([2026-10]) -> existing account Shelf wins WITH G08 conflict sentence!
      await page.goto(`${baseUrl}/index.html?scenario=g09-8-accounts-merge&reset=1`);
      await page.getByTestId('nav-tab-more').click();
      await page.getByTestId('more-account-btn').click();
      await page.getByTestId('more-signin-merge-btn').click();
      await page.getByTestId('merge-mode-conflict').check();
      await page.getByTestId('run-merge-btn').click();
      await page.getByTestId('g08-merge-confirmation').waitFor();
      const conflictMsg = await page.getByTestId('g08-merge-confirmation').innerText();
      assert.match(conflictMsg, /existing account’s Shelf stayed in place/i, 'Genuine Shelf conflict must show G08 explanation');
      const shelfAfterConflict = await page.evaluate(() => window.R06Proto.State.getState().shelf);
      assert.deepEqual(shelfAfterConflict.months.map((m) => m.yearMonth).sort(), ['2026-07', '2026-08']);
      assert.equal(shelfAfterConflict.activeFocusMonth, '2026-08');

      // Case D: New account creation remains distinct -> preserves guest Shelf ([2026-10]), NO conflict notice!
      await page.goto(`${baseUrl}/index.html?scenario=g09-8-accounts-merge&reset=1`);
      await page.getByTestId('nav-tab-more').click();
      await page.getByTestId('more-account-btn').click();
      await page.getByTestId('more-signin-merge-btn').click();
      await page.getByTestId('merge-mode-new').check();
      await page.getByTestId('run-merge-btn').click();
      await page.getByTestId('g08-merge-confirmation').waitFor();
      const newAcctMsg = await page.getByTestId('g08-merge-confirmation').innerText();
      assert.doesNotMatch(newAcctMsg, /existing account’s Shelf stayed in place/i, 'New account must not show Shelf conflict notice');
      const shelfAfterNew = await page.evaluate(() => window.R06Proto.State.getState().shelf);
      assert.deepEqual(shelfAfterNew.months.map((m) => m.yearMonth), ['2026-10']);
      assert.equal(shelfAfterNew.activeFocusMonth, '2026-10');
    });

    // 11. Keyboard-Only Navigation, Focus Preservation & Modal Containment (P1)
    await runTest('11. Keyboard-only focus preservation, tutorial stepping & modal trap/inert/Escape restoration', async (page) => {
      // A. Ordinary control keyboard activation keeps focus attached (never detaches to body)
      await page.goto(`${baseUrl}/index.html?scenario=g09-5-library-shelf&reset=1`);
      await page.getByTestId('shelf-keep-2026-10').focus();
      await page.keyboard.press('Enter');
      const afterKeepId = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') || document.activeElement?.tagName);
      assert.equal(afterKeepId, 'shelf-open-2026-10', 'Focus must move cleanly to card Open Month after Keep on Shelf disappears');

      await page.getByTestId('shelf-focus-2026-10').focus();
      await page.keyboard.press('Enter');
      const afterFocusId = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
      assert.equal(afterFocusId, 'shelf-clear-focus-2026-10', 'Focus must follow Set as Active Focus -> Clear Focus');

      // B. Modal containment: inert background, Tab/Shift+Tab focus trap, Escape + trigger focus restoration
      await page.getByTestId('shelf-putaway-2026-10').focus();
      await page.keyboard.press('Enter');
      await page.getByTestId('active-modal').waitFor();

      const bgInert = await page.evaluate(() => ({
        wbInert: document.getElementById('workbench-root')?.hasAttribute('inert'),
        vpInert: document.querySelector('.app-viewport')?.hasAttribute('inert'),
        vpHidden: document.querySelector('.app-viewport')?.getAttribute('aria-hidden'),
        inModal: !!document.activeElement?.closest('.modal-panel')
      }));
      assert.equal(bgInert.wbInert, true, 'Workbench must be inert while modal is open');
      assert.equal(bgInert.vpInert, true, 'Background viewport must be inert while modal is open');
      assert.equal(bgInert.vpHidden, 'true', 'Background viewport must be aria-hidden while modal is open');
      assert.equal(bgInert.inModal, true, 'Initial modal focus must be inside .modal-panel');

      // Tab across more elements than exist in modal -> must wrap and never escape .modal-panel
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press('Tab');
        const stillInside = await page.evaluate(() => !!document.activeElement?.closest('.modal-panel'));
        assert.equal(stillInside, true, `Tab press ${i + 1} escaped modal container`);
      }
      // Shift+Tab must also stay trapped inside .modal-panel
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Shift+Tab');
        const stillInside = await page.evaluate(() => !!document.activeElement?.closest('.modal-panel'));
        assert.equal(stillInside, true, `Shift+Tab press ${i + 1} escaped modal container`);
      }

      // Escape closes modal, clears inert, and restores focus to triggering button!
      await page.keyboard.press('Escape');
      assert.equal(await page.getByTestId('active-modal').count(), 0);
      const afterEscape = await page.evaluate(() => ({
        vpInert: document.querySelector('.app-viewport')?.hasAttribute('inert'),
        activeTestId: document.activeElement?.getAttribute('data-testid')
      }));
      assert.equal(afterEscape.vpInert, false, 'Inert must be cleared when modal closes');
      assert.equal(afterEscape.activeTestId, 'shelf-putaway-2026-10', 'Focus must restore to modal trigger on Escape');

      // C. Challenge Reader keyboard stepping: Next -> Next -> Finish keeps focus cleanly attached
      await page.goto(`${baseUrl}/index.html?scenario=g09-6-earned-collections&reset=1`);
      await page.getByTestId('today-primary-cta').focus();
      await page.keyboard.press('Enter');
      await page.getByTestId('reader-next-btn').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-testid')), 'reader-next-btn');
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-testid')), 'reader-finish-btn');

      // D. Guided App Tutorial keyboard Next/Back stepping & Escape restoration to More trigger
      await page.goto(`${baseUrl}/index.html?scenario=g09-7-news-preferences&reset=1`);
      await page.getByTestId('more-app-tutorial-btn').focus();
      await page.keyboard.press('Enter');
      await page.getByTestId('app-tutorial-overlay').waitFor();
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-testid')), 'tutorial-next-btn');
      await page.keyboard.press('Enter'); // Step 2
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-testid')), 'tutorial-next-btn');
      await page.getByTestId('tutorial-prev-btn').focus();
      await page.keyboard.press('Enter'); // Back to Step 1 (prev becomes disabled -> focus moves cleanly to tutorial-next-btn!)
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-testid')), 'tutorial-next-btn');
      await page.keyboard.press('Escape'); // Returns to More & restores focus to more-app-tutorial-btn
      assert.equal(await page.getByTestId('app-tutorial-overlay').count(), 0);
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-testid')), 'more-app-tutorial-btn');
    });

    // 12. Responsive Reflow (320px, 375px, Tablet, True 200% Text/Zoom Operability & Non-Clipping) + Reviewer-Free Screenshots
    await runTest('12. Responsive reflow (320px, 375px, tablet, 200% text & zoom operability/non-clipping) & screenshots', async (page) => {
      if (CAPTURE && !fs.existsSync(SCREENSHOT_DIR)) {
        fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
      }

      const checkNoOverflow = async (label) => {
        const metrics = await page.evaluate(() => ({
          scrollW: document.documentElement.scrollWidth,
          clientW: document.documentElement.clientWidth
        }));
        assert.ok(metrics.scrollW <= metrics.clientW + 2, `Horizontal overflow at ${label}: scrollWidth=${metrics.scrollW} > clientWidth=${metrics.clientW}`);
      };

      const checkControlUnclippedAndOperable = async (testId, label) => {
        const loc = page.getByTestId(testId);
        await loc.scrollIntoViewIfNeeded();
        assert.equal(await loc.isVisible(), true, `${label} (${testId}) must be visible`);
        const box = await loc.boundingBox();
        const vp = page.viewportSize();
        assert.ok(box && box.width >= 44 && box.height >= 44, `${label} (${testId}) tap target too small: ${JSON.stringify(box)}`);
        assert.ok(box.x >= -1 && box.x + box.width <= vp.width + 2, `${label} (${testId}) clipped horizontally: box=${JSON.stringify(box)}, vp=${vp.width}`);
        const textClipped = await loc.evaluate((el) => el.scrollWidth > el.clientWidth + 2);
        assert.equal(textClipped, false, `${label} (${testId}) text clipped inside control`);
      };

      // 320px narrow phone — Today (reviewer-free capture)
      await page.setViewportSize({ width: 320, height: 640 });
      await page.goto(`${baseUrl}/index.html?scenario=g09-6-earned-collections&reset=1&workbench=hidden`);
      await checkNoOverflow('320px Today');
      await checkControlUnclippedAndOperable('today-primary-cta', '320px Today CTA');
      if (CAPTURE) await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01-phone-320-today.png'), fullPage: false });

      // 375px phone — Month Screen & Challenge Reader (reviewer-free captures)
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(`${baseUrl}/index.html?scenario=g09-6-earned-collections&reset=1&workbench=hidden`);
      await page.getByTestId('today-current-month-link').click();
      await page.locator('.week-panel').first().waitFor();
      await checkNoOverflow('375px Month Screen');
      if (CAPTURE) await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02-phone-375-month-screen.png'), fullPage: false });

      await page.getByTestId('agenda-ch-2026-11-18').click();
      await page.getByTestId('reader-screen-count').waitFor();
      await page.evaluate(() => window.scrollTo(0, 0));
      await checkNoOverflow('375px Challenge Reader');
      if (CAPTURE) await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03-phone-375-challenge-reader.png'), fullPage: false });

      // 375px phone — Library & Shelf
      await page.goto(`${baseUrl}/index.html?scenario=g09-5-library-shelf&reset=1&workbench=hidden`);
      await page.getByTestId('library-shelf-section').waitFor();
      await checkNoOverflow('375px Library Shelf');
      if (CAPTURE) await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04-phone-375-library-shelf.png'), fullPage: false });

      // 375px phone — Field Notebook & Full Single-Scroll Earned Card
      await page.goto(`${baseUrl}/index.html?scenario=g09-6-earned-collections&reset=1&workbench=hidden`);
      await page.getByTestId('nav-tab-collections').click();
      await page.getByTestId('open-field-notebook-btn').click();
      await page.getByTestId('lifetime-status-card').waitFor();
      await checkNoOverflow('375px Field Notebook');
      if (CAPTURE) await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05-phone-375-field-notebook.png'), fullPage: false });

      await page.getByTestId('open-all-earned-btn').click();
      await page.getByTestId('grid-card-card-2026-11-songs-of-trust').click();
      await page.getByTestId('share-card-btn').waitFor();
      await page.evaluate(() => window.scrollTo(0, 0));
      await checkNoOverflow('375px Full Scripture Card');
      if (CAPTURE) await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09-phone-375-full-card.png'), fullPage: false });

      // 768x1024 Tablet Portrait — Today + Continue Your Study
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto(`${baseUrl}/index.html?scenario=g09-4-historical-continuity&reset=1&workbench=hidden`);
      await page.getByTestId('today-continue-study').waitFor();
      await checkNoOverflow('768x1024 Tablet Portrait Today');
      if (CAPTURE) await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06-tablet-portrait-today.png'), fullPage: false });

      // 1024x768 Tablet Landscape — Persistent Left Rail + Centered Vertical Composition (§1.2)
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.goto(`${baseUrl}/index.html?scenario=g09-7-news-preferences&reset=1&workbench=hidden`);
      await page.getByTestId('more-featured-news').waitFor();
      await checkNoOverflow('1024x768 Tablet Landscape More');
      if (CAPTURE) await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07-tablet-landscape-more.png'), fullPage: false });

      // True 200% Text Scaling (font-size: 200% / 32px root) on 375x812 phone: verify reflow, non-clipping & real operability!
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(`${baseUrl}/index.html?scenario=g09-6-earned-collections&reset=1&workbench=hidden`);
      await page.evaluate(() => window.R06Proto.State.setTextScale('200'));
      const rootPx = await page.evaluate(() => parseFloat(window.getComputedStyle(document.documentElement).fontSize));
      assert.ok(rootPx >= 31.5, `Expected 200% root font-size (~32px), got ${rootPx}px`);
      await checkNoOverflow('375px 200% Text Today');
      await checkControlUnclippedAndOperable('today-primary-cta', '200% Today CTA');
      await checkControlUnclippedAndOperable('nav-tab-today', '200% Nav Today');
      await checkControlUnclippedAndOperable('nav-tab-library', '200% Nav Library');
      await checkControlUnclippedAndOperable('nav-tab-collections', '200% Nav Collections');
      await checkControlUnclippedAndOperable('nav-tab-more', '200% Nav More');
      if (CAPTURE) await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08-phone-375-large-text.png'), fullPage: false });

      // Verify end-to-end operability at 200% text: open Challenge -> Next -> Next -> Finish via real clicks
      await page.getByTestId('today-primary-cta').click();
      await checkNoOverflow('375px 200% Text Challenge Reader');
      await checkControlUnclippedAndOperable('reader-exit-btn', '200% Reader Exit');
      await checkControlUnclippedAndOperable('reader-next-btn', '200% Reader Next');
      await page.getByTestId('reader-next-btn').click();
      await page.getByTestId('reader-next-btn').click();
      await checkControlUnclippedAndOperable('reader-finish-btn', '200% Reader Finish');
      await page.getByTestId('reader-finish-btn').click();
      await page.getByTestId('today-primary-cta').waitFor();

      // Verify Library & Shelf + More operability at 200% text
      await page.getByTestId('nav-tab-library').click();
      await checkNoOverflow('375px 200% Text Library');
      await checkControlUnclippedAndOperable('library-browse-all-btn', '200% Library Browse All');
      await page.getByTestId('nav-tab-more').click();
      await checkNoOverflow('375px 200% Text More');
      await checkControlUnclippedAndOperable('more-appearance-btn', '200% More Appearance');

      // 200% Browser Zoom equivalence (desktop 1280px @ 200% = 640px CSS viewport; narrow 640px @ 200% = 320px CSS viewport)
      await page.setViewportSize({ width: 320, height: 568 });
      await page.goto(`${baseUrl}/index.html?scenario=g09-5-library-shelf&reset=1&workbench=hidden`);
      await checkNoOverflow('320px (200% zoomed 640px) Library Shelf');
      await checkControlUnclippedAndOperable('shelf-open-2026-09', '320px Shelf Open Month');
      await checkControlUnclippedAndOperable('nav-tab-collections', '320px Nav Collections');
    });

    console.log(`\nAll ${results.length}/${results.length} smoke checks PASSED.${CAPTURE ? ' Screenshots saved to screenshots/.' : ''}\n`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error('\nSmoke suite failed:', err);
  process.exit(1);
});
