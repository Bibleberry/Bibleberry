import assert from 'node:assert/strict';
import type { Browser, BrowserContext, Locator, Page } from '@playwright/test';
import { parseParticipationEnvelope } from '../../src/participation/persistence.ts';
import { parseShelfEnvelope } from '../../src/shelfPersistence/persistence.ts';
import {
  BLOCKED_STYLESHEET, CHALLENGE_ID, CHALLENGE_PATH, CHALLENGE_TITLE, connectedRequest, connectedSeed,
  FIXTURE_TIME, FIXTURE_TIME_ZONE, FOCUS_MONTH, FOCUS_TITLE, HISTORICAL_MONTH, HISTORICAL_TITLE,
  PARTICIPATION_KEY, READING_BLOCKS, SHELF_KEY,
} from './connected-fixtures.ts';

const ACTION_TIMEOUT_MS = 15_000;
const challengeError = 'net::ERR_INTERNET_DISCONNECTED';

async function isolateBrowser(context: BrowserContext, page: Page, origin: string, assets: ReadonlySet<string>) {
  const violations: string[] = [];
  const errors: string[] = [];
  const requestFailures: string[] = [];
  const gatewayResponses: Record<string, number> = {};
  const challengeAttempts: string[] = [];
  const interruptions: string[] = [];
  let blockedStylesheets = 0;
  let interruptNextChallenge = false;

  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const url = message.location().url;
    if (url === BLOCKED_STYLESHEET || (url === origin + CHALLENGE_PATH && message.text().includes(challengeError))) {
      return;
    }
    errors.push(message.text());
  });
  page.on('response', response => {
    if (response.status() >= 400) errors.push(`HTTP ${response.status()} for ${new URL(response.url()).pathname}`);
  });
  page.on('requestfailed', request => {
    const failure = request.failure()?.errorText ?? 'unknown network failure';
    if (request.url() === BLOCKED_STYLESHEET) return;
    const path = new URL(request.url()).pathname;
    if (request.url() === origin + CHALLENGE_PATH && failure === challengeError) {
      interruptions.push(failure);
      return;
    }
    requestFailures.push(`${request.method()} ${path}: ${failure}`);
  });

  await context.routeWebSocket('**/*', socket => {
    violations.push(`Unexpected WebSocket request to ${new URL(socket.url()).origin}`);
    void socket.close();
  });
  await context.route('**/*', async route => {
    const request = route.request();
    try {
      const decision = connectedRequest(origin, assets, {
        url: request.url(), method: request.method(), resourceType: request.resourceType(), body: request.postData(),
      });
      if (decision.kind === 'static') {
        await route.continue();
      } else if (decision.kind === 'blockedStylesheet') {
        blockedStylesheets += 1;
        await route.abort('failed');
      } else if (decision.key === `GET ${CHALLENGE_PATH}` && interruptNextChallenge) {
        interruptNextChallenge = false;
        challengeAttempts.push('interrupted');
        await route.abort('internetdisconnected');
      } else {
        await route.fulfill({ json: decision.payload });
        gatewayResponses[decision.key] = (gatewayResponses[decision.key] ?? 0) + 1;
        if (decision.key === `GET ${CHALLENGE_PATH}`) challengeAttempts.push('served');
      }
    } catch (error) {
      violations.push(error instanceof Error ? error.message : String(error));
      await route.abort('blockedbyclient');
    }
  });

  return {
    interruptChallenge() { interruptNextChallenge = true; },
    assertClean() {
      assert.deepEqual(violations, [], 'Connected request policy violations');
      assert.deepEqual(errors, [], 'Unexpected browser errors');
      assert.deepEqual(requestFailures, [], 'Unexpected browser request failures');
    },
    evidence() {
      return { gatewayResponses, challengeAttempts, blockedStylesheets, interruptions, requestFailures, errors };
    },
  };
}

async function readBrowserSnapshot(page: Page, assets: ReadonlySet<string>) {
  // Let eager imports, the known font request and gateway reads finish after the timed UI endpoint.
  await page.waitForLoadState('networkidle');
  return page.evaluate(paths => {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const measurements = (window as Window & {
      __r21Measurements?: {
        longTasks: number[];
        firstContentfulPaintMs: number | null;
        largestContentfulPaintMs: number | null;
      };
    }).__r21Measurements;
    if (!navigation || !measurements || !PerformanceObserver.supportedEntryTypes.includes('longtask')) {
      throw new Error('Browser navigation/long-task observations are unavailable');
    }

    const allowed = new Set(paths);
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const staticAssets = resources
      .filter(entry => new URL(entry.name).origin === location.origin && allowed.has(new URL(entry.name).pathname))
      .map(entry => ({
        path: new URL(entry.name).pathname,
        transferBytes: entry.transferSize,
        encodedBodyBytes: entry.encodedBodySize,
      }));
    return {
      documentTransferBytes: navigation.transferSize,
      fcpMs: measurements.firstContentfulPaintMs
        ?? performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
      lcpMs: measurements.largestContentfulPaintMs,
      longTaskCount: measurements.longTasks.length,
      longTaskDurationMs: measurements.longTasks.reduce((total, duration) => total + duration, 0),
      staticAssets,
    };
  }, [...assets]);
}

async function time(action: () => Promise<unknown>, ready: Locator): Promise<number> {
  const started = performance.now();
  await action();
  await ready.waitFor({ state: 'visible' });
  return performance.now() - started;
}

async function openCalendar(page: Page, entry: Locator, title: string, days: number) {
  await entry.click();
  await page.getByRole('heading', { name: `Entering ${title}`, exact: true }).waitFor();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Begin the Month', exact: true }).click();
  const heading = page.getByRole('heading', { name: title, exact: true });
  await heading.waitFor();
  assert.equal(await page.locator('.month-day').count(), days, `Rendered calendar days for ${title}`);
}

export async function measureConnectedReader(
  browser: Browser,
  baseUrl: string,
  assets: ReadonlySet<string>,
  preparePage: (context: BrowserContext, page: Page) => Promise<void>,
) {
  const origin = new URL(baseUrl).origin;
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    timezoneId: FIXTURE_TIME_ZONE,
    serviceWorkers: 'block',
    storageState: {
      cookies: [],
      origins: [{ origin, localStorage: Object.entries(connectedSeed).map(([name, value]) => ({
        name, value: JSON.stringify(value),
      })) }],
    },
  });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(ACTION_TIMEOUT_MS);
    // Freeze the publication date while retaining Chromium's native Performance API and timers.
    await page.addInitScript(fixedTime => {
      const NativeDate = Date;
      const timestamp = NativeDate.parse(fixedTime);
      Date = new Proxy(NativeDate, {
        construct(target, args, newTarget) {
          return Reflect.construct(target, args.length ? args : [timestamp], newTarget);
        },
        apply() { return new NativeDate(timestamp).toString(); },
        get(target, property, receiver) {
          return property === 'now' ? () => timestamp : Reflect.get(target, property, receiver);
        },
      });
    }, FIXTURE_TIME);
    await preparePage(context, page);
    const isolation = await isolateBrowser(context, page, origin, assets);

    try {
      const continueCard = page.locator('.hub-continue');
      const focusLabel = `${CHALLENGE_TITLE} (October 2026, Day 1)`;
      const continueButton = continueCard.getByRole('button', { name: `Continue ${focusLabel}`, exact: true });
      const resumeButton = continueCard.getByRole('button', { name: `Resume ${focusLabel}`, exact: true });
      const openFocusMonth = page.locator('.hub-continue').getByRole('button', { name: 'View October 2026' });
      const archiveEntry = page.getByRole('link', { name: 'Open Historical Library', exact: true });
      const libraryItem = page.getByRole('heading', { name: HISTORICAL_TITLE, exact: true });
      const focusHeading = page.getByRole('heading', { name: FOCUS_TITLE, exact: true });
      const historicalHeading = page.getByRole('heading', { name: HISTORICAL_TITLE, exact: true, level: 1 });
      const opening = page.getByRole('heading', { name: `${CHALLENGE_TITLE} — Opening`, exact: true });
      const closing = page.getByRole('heading', { name: `${CHALLENGE_TITLE} — Closing`, exact: true });
      const archiveNav = page.getByRole('navigation', { name: 'Primary navigation' }).first();
      const shelfEntry = page.getByRole('main', { name: 'Shelf' }).getByText(HISTORICAL_TITLE, { exact: true });
      const button = (name: string) => page.getByRole('button', { name, exact: true });
      const timings: Record<string, number> = {};
      timings.coldTodayMs = await time(() => page.goto(baseUrl, { waitUntil: 'load' }), continueButton);
      const cold = await readBrowserSnapshot(page, assets);
      timings.repeatTodayMs = await time(() => page.reload({ waitUntil: 'load' }), continueButton);
      const repeat = await readBrowserSnapshot(page, assets);

      timings.openFocusMonthMs = await time(() => openCalendar(page, openFocusMonth, FOCUS_TITLE, 31), focusHeading);
      await page.waitForLoadState('networkidle');
      await page.locator('.reading-large .month-day').first().waitFor();
      isolation.interruptChallenge();
      timings.challengeFailureMs = await time(
        () => page.locator('button.month-day').filter({ hasText: CHALLENGE_TITLE }).click(),
        page.getByRole('heading', { name: 'Unable to load Challenge', exact: true }),
      );
      timings.challengeRetryMs = await time(() => button('Retry loading Challenge').click(), opening);
      const readingParagraphs = await page.locator('.reading-large .lab-screen__blocks p').count();
      assert.equal(readingParagraphs, READING_BLOCKS, 'Long reading rendered at the large-text preference');
      const readingHeightPx = await page.locator('.lab-screen__blocks').evaluate(el => el.scrollHeight);
      assert.ok(readingHeightPx > 844, 'Long reading extends beyond one mobile viewport');
      timings.advanceChallengeMs = await time(
        () => page.getByRole('navigation', { name: 'Challenge screen navigation' })
          .getByRole('button', { name: 'Continue', exact: true }).click(),
        closing,
      );
      timings.returnToMonthMs = await time(() => button('Return to October 2026').click(), focusHeading);
      timings.returnToTodayMs = await time(() => button('Return to Today').click(), resumeButton);
      timings.openArchiveMs = await time(() => archiveNav.getByRole('button', { name: 'Archive' }).click(), archiveEntry);
      timings.openLibraryMs = await time(() => archiveEntry.click(), libraryItem);
      timings.openHistoricalMonthMs = await time(
        () => openCalendar(page, button(`Open September 2026: ${HISTORICAL_TITLE}`), HISTORICAL_TITLE, 30),
        historicalHeading,
      );
      await page.waitForLoadState('networkidle');
      timings.returnToLibraryMs = await time(() => button('Return to Library').click(), libraryItem);
      timings.addToShelfMs = await time(
        () => button('Add September 2026 to Shelf').click(),
        page.locator('.library-card[data-year-month="2026-09"]').getByText('On Shelf · Protected', { exact: true }),
      );
      timings.openShelfMs = await time(() => page.getByRole('button', { name: /^View Shelf/ }).click(), shelfEntry);
      const throughShelf = await readBrowserSnapshot(page, assets);
      timings.reloadShelfMs = await time(() => page.reload({ waitUntil: 'load' }), shelfEntry);
      timings.reopenTodayMs = await time(() => archiveNav.getByRole('button', { name: 'Today' }).click(), resumeButton);
      assert.equal(await page.locator('.hub-continue').getAttribute('data-continue-kind'), 'resumeInProgress');
      timings.resumeChallengeMs = await time(() => resumeButton.click(), closing);
      const throughResume = await readBrowserSnapshot(page, assets);

      const [participation, shelf] = await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), [
        PARTICIPATION_KEY, SHELF_KEY,
      ]);
      const participationState = parseParticipationEnvelope(participation);
      assert.equal(participationState.health, 'ok');
      assert.equal(participationState.data.inProgressChallenges[CHALLENGE_ID]?.screenId, 'closing');
      assert.deepEqual(participationState.data.completedChallenges, {});
      assert.deepEqual(participationState.data.earnedAwards, {});
      const shelfState = parseShelfEnvelope(shelf, { referenceCurrentMonth: FIXTURE_TIME.slice(0, 7) });
      assert.equal(shelfState.health, 'ok');
      assert.equal(shelfState.payload.state.activeFocusMonth, FOCUS_MONTH);
      assert.ok(shelfState.payload.state.months.some(month =>
        month.yearMonth === HISTORICAL_MONTH && month.admissionKind === 'readerSelected' && month.isProtected,
      ), 'Historical month persisted as protected Shelf membership');

      isolation.assertClean();
      return {
        timings, cold, repeat, throughShelf, throughResume, readingParagraphs, readingHeightPx,
        calendarDays: [31, 30],
        persistedScreen: 'closing',
        persistedShelfMonth: HISTORICAL_MONTH,
        ...isolation.evidence(),
      };
    } catch (error) {
      isolation.assertClean();
      throw error;
    }
  } finally {
    await context.close();
  }
}
