import { createServer, type ViteDevServer } from 'vite'
import type { Page } from '@playwright/test'
import { expect, test } from '../smoke/helpers/frameSafeTest.ts'

const monthId = '2026-10'
const monthTitle = 'October test publication'
const serverContext = {
  authorizedLocalDate: '2026-11-15',
  effectiveTimeZone: 'America/New_York',
}
const navigationKey = 'bibleberry-r06-navigation-v1'
let enabledServer: ViteDevServer
let disabledServer: ViteDevServer

async function startReader(enabled: boolean) {
  const server = await createServer({
    define: {
      'import.meta.env.VITE_ENABLE_R06_SHELL': JSON.stringify(String(enabled)),
      'import.meta.env.VITE_RELEASE_GATEWAY_ORIGIN': JSON.stringify(''),
      'import.meta.env.VITE_GATEWAY_ORIGIN': JSON.stringify(''),
      'import.meta.env.VITE_ENABLE_FIELD_NOTEBOOK': JSON.stringify('false'),
      'import.meta.env.VITE_ENABLE_SAVED_SCRIPTURE': JSON.stringify('false'),
    },
    server: { host: '127.0.0.1', port: 0 },
    logLevel: 'silent',
  })
  await server.listen()
  return server
}

function readerUrl(server = enabledServer) {
  const address = server.httpServer?.address()
  if (!address || typeof address === 'string') throw new Error('Reader test server did not bind a port')
  return `http://127.0.0.1:${address.port}/`
}

function primaryNav(page: Page) {
  return page.getByRole('navigation', { name: 'Primary navigation' })
}

function selectTab(page: Page, name: string) {
  return primaryNav(page).getByRole('button', { name, exact: true }).click()
}

async function mockGateway(page: Page) {
  const introductionScreen = (id: string, title: string) => ({
    id,
    title,
    blocks: [{ _key: id, _type: 'statementBlock', text: 'Synthetic test text.' }],
  })
  await page.route('**/api/library/months**', route => route.fulfill({
    json: {
      ok: true,
      serverContext,
      items: [{ yearMonth: monthId, year: 2026, month: 10, title: monthTitle }],
      page: { limit: 12, hasMore: false, nextCursor: null },
    },
  }))
  await page.route('**/api/news**', route => route.fulfill({
    json: {
      ok: true,
      serverContext,
      articles: [{
        id: 'news-test',
        documentId: 'news-test',
        category: 'announcement',
        title: 'Test ministry announcement',
        summary: 'Synthetic news for the shell smoke.',
        publishedOn: '2026-11-10',
      }].filter(article => {
        const category = new URL(route.request().url()).searchParams.get('category')
        return !category || category === article.category
      }),
    },
  }))
  await page.route(`**/api/months/${monthId}`, route => route.fulfill({
    json: {
      ok: true,
      serverContext,
      month: {
        monthId,
        documentId: `month-${monthId}`,
        year: 2026,
        month: 10,
        daysInMonth: 31,
        phase: 'historical',
        rosterVersion: 1,
        totalChallenges: 31,
        title: monthTitle,
        introduction: {
          version: 'intro-test-v1',
          previewScreens: [introductionScreen('overview', 'Test month overview')],
          welcomeScreen: { ...introductionScreen('welcome', 'Test month welcome'), ctaLabel: 'Begin the Month' },
        },
        slots: Array.from({ length: 31 }, (_, index) => {
          const dayOfMonth = index + 1
          const date = `${monthId}-${String(dayOfMonth).padStart(2, '0')}`
          return {
            dayOfMonth,
            date,
            availability: 'available',
            title: `Test Challenge ${dayOfMonth}`,
            slug: `test-challenge-${dayOfMonth}`,
            challengeId: `cms:test-challenge-${dayOfMonth}`,
            challengeType: 'teaching',
          }
        }),
        discoveries: [],
      },
    },
  }))
  await page.route(`**/api/months/${monthId}/progress`, route => route.fulfill({
    json: {
      ok: true,
      serverContext,
      monthId,
      rosterVersion: 1,
      completedInMonthCount: 0,
      totalChallenges: 31,
      thematicEarnedCount: 0,
      thematicTotalCount: 0,
      discoveries: [],
    },
  }))
}

test.beforeAll(async () => {
  enabledServer = await startReader(true)
  disabledServer = await startReader(false)
})

test.afterAll(async () => {
  await Promise.all([enabledServer?.close(), disabledServer?.close()])
})

test.beforeEach(async ({ page }) => {
  await page.route('https://**', route => route.abort())
})

test('opens the legacy reader with the flag off and never initializes the R06 navigation session', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('bibleberry-prototype-v1', JSON.stringify({ onboarded: true, appearance: 'system' }))
  })
  await page.goto(readerUrl(disabledServer))
  await expect(page.getByRole('button', { name: 'Archive', exact: true }).filter({ visible: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Collections', exact: true })).toHaveCount(0)
  expect(await page.evaluate(key => sessionStorage.getItem(key), navigationKey)).toBeNull()
})

test('uses one responsive and keyboard-accessible set of four primary controls', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 560 })
  await page.goto(readerUrl())
  const nav = primaryNav(page)
  await expect(nav.getByRole('button')).toHaveText(['Today', 'Library', 'Collections', 'More'])
  await expect(nav.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-current', 'page')
  await page.getByRole('button', { name: 'Open this month' }).focus()
  await page.keyboard.press('Tab')
  await expect(nav.getByRole('button', { name: 'Today' })).toBeFocused()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Collections' })).toBeVisible()
  await expect(nav.getByRole('button', { name: 'Collections' })).toHaveAttribute('aria-current', 'page')
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 560 })
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
    const mobile = await nav.boundingBox()
    expect(mobile?.width).toBe(width)
    expect((mobile?.y ?? 0) + (mobile?.height ?? 0)).toBe(560)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
  }

  await page.setViewportSize({ width: 1024, height: 768 })
  await page.evaluate(() => { document.documentElement.style.fontSize = '' })
  const wide = await nav.boundingBox()
  expect(wide?.x).toBe(0)
  expect(wide?.height).toBe(768)
  expect(wide?.width).toBeLessThan(260)
  await expect(page.getByRole('main')).toHaveCount(1)
  expect(await page.evaluate(() => localStorage.getItem('bibleberry-prototype-v1'))).toBeNull()
})

test('retains each tab’s screen, scroll, and focus and resets the selected tab on reselection', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 460 })
  await mockGateway(page)
  await page.goto(readerUrl())

  await selectTab(page, 'Collections')
  await page.getByRole('button', { name: 'Field Notebook' }).click()
  await expect(page.getByRole('heading', { name: 'Earned Scripture Cards', exact: true })).toBeVisible()
  const allCards = page.getByRole('button', { name: 'All Earned Cards' })
  await allCards.click()
  await expect(allCards).toHaveAttribute('aria-pressed', 'true')
  const viewport = page.locator('.r06-viewport')
  await viewport.evaluate(element => { element.scrollTop = 100 })
  await expect.poll(() => viewport.evaluate(element => element.scrollTop)).toBe(100)

  await selectTab(page, 'More')
  await page.getByRole('button', { name: 'View All News' }).click()
  await expect(page.getByRole('heading', { name: 'Ministry News' })).toBeVisible()
  await expect(page.getByText('Test ministry announcement')).toBeVisible()
  await page.getByRole('tab', { name: 'Announcements' }).click()
  await expect(page).toHaveURL(/#\/news\?category=announcement$/)

  await selectTab(page, 'Collections')
  await expect(page).toHaveURL(/#\/notebook$/)
  await expect(allCards).toHaveAttribute('aria-pressed', 'true')
  await expect(allCards).toBeFocused()
  await expect.poll(() => viewport.evaluate(element => element.scrollTop)).toBe(100)

  await selectTab(page, 'Collections')
  await expect(page.getByRole('heading', { name: 'Collections' })).toBeVisible()
  await expect.poll(() => viewport.evaluate(element => element.scrollTop)).toBe(0)
  await page.getByRole('button', { name: 'Saved Scripture', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Saved Scripture', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Back to Collections' }).click()
  await expect(page.getByRole('heading', { name: 'Collections' })).toBeVisible()

  await selectTab(page, 'More')
  await expect(page.getByRole('tab', { name: 'Announcements' })).toHaveAttribute('aria-selected', 'true')
})

test('opens the real Shelf, catalogue, and Month hosts and hides chrome inside the Month Introduction', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 600 })
  await mockGateway(page)
  await page.goto(readerUrl())
  await selectTab(page, 'Library')
  await expect(page.getByRole('main', { name: 'Shelf', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Foundations', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Foundations unavailable' })).toBeVisible()
  await page.getByRole('button', { name: 'Back to Library', exact: true }).click()
  await page.getByRole('button', { name: 'Browse All Months' }).click()

  await expect(page.getByRole('heading', { name: 'Historical Library' })).toBeVisible()
  await expect(page.getByRole('main')).toHaveCount(1)
  const openMonth = page.getByRole('button', { name: /Open October 2026/ })
  await openMonth.click()
  await expect(page.getByRole('heading', { name: 'Test month overview' })).toBeVisible()
  await expect(primaryNav(page)).toBeHidden()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Begin the Month' }).click()
  await expect(page.getByRole('heading', { name: monthTitle, exact: true })).toBeVisible()
  await expect(primaryNav(page)).toBeVisible()

  const viewport = page.locator('.r06-viewport')
  const challenge = page.getByRole('button', { name: /Test Challenge 25/ })
  await challenge.scrollIntoViewIfNeeded()
  await challenge.focus()
  const scrollTop = await viewport.evaluate(element => element.scrollTop)
  expect(scrollTop).toBeGreaterThan(400)
  await challenge.press('Enter')
  await expect(page.getByRole('heading', { name: 'Challenge unavailable' })).toBeVisible()
  await page.getByRole('button', { name: 'Back to Month', exact: true }).click()
  await expect(challenge).toBeFocused()
  await expect.poll(() => viewport.evaluate(element => element.scrollTop)).toBe(scrollTop)

  await page.reload()
  await expect(challenge).toBeFocused()
  await expect.poll(() => viewport.evaluate(element => element.scrollTop)).toBe(scrollTop)
  await page.goBack()
  await expect(openMonth).toBeVisible()
  await page.goForward()
  await expect(challenge).toBeVisible()
})

test('restores browser entries, falls back for malformed/Studio hashes, and closes Challenge ingress', async ({ page }) => {
  await mockGateway(page)
  await page.addInitScript(() => {
    window.history.replaceState({ ...window.history.state, unrelated: 'preserved' }, '')
  })
  await page.goto(readerUrl() + '#/field-notebook')
  await expect(page).toHaveURL(/#\/notebook$/)
  await expect(page.getByRole('heading', { name: 'Earned Scripture Cards', exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.history.state.unrelated)).toBe('preserved')
  await selectTab(page, 'More')
  await page.getByRole('button', { name: 'View All News' }).click()
  await expect(page).toHaveURL(/#\/news$/)
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'More', exact: true })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Earned Scripture Cards', exact: true })).toBeVisible()
  await page.goForward()
  await page.goForward()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Ministry News' })).toBeVisible()

  await page.evaluate(() => { window.location.hash = '#/studio' })
  await expect(page.getByRole('heading', { name: 'Page unavailable' })).toBeVisible()
  await expect(page).toHaveURL(/#\/$/)
  await page.getByRole('button', { name: 'Return to Today' }).click()
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
  await page.evaluate(() => { window.location.hash = '#/month/2026-99' })
  await expect(page.getByRole('heading', { name: 'Page unavailable' })).toBeVisible()

  const challengeRequests: string[] = []
  await page.route('**/api/challenges/**', async route => {
    challengeRequests.push(route.request().url())
    await route.abort()
  })
  await page.evaluate(() => {
    window.location.hash = '#/challenge/forged-entry?origin=month&yearMonth=2026-10'
  })
  await expect(page.getByRole('heading', { name: 'Challenge unavailable' })).toBeVisible()
  expect(challengeRequests).toEqual([])
  await page.getByRole('button', { name: 'Return to Today' }).click()
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
})

test('keeps same-document Back and Forward usable when sessionStorage is blocked', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'sessionStorage', {
      get() { throw new DOMException('Session storage blocked for this test', 'SecurityError') },
    })
  })
  await page.goto(readerUrl())
  await selectTab(page, 'Collections')
  await page.getByRole('button', { name: 'Saved Scripture' }).click()
  await expect(page.getByRole('heading', { name: 'Saved Scripture', exact: true })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Collections', exact: true })).toBeVisible()
  await page.goForward()
  await expect(page.getByRole('heading', { name: 'Saved Scripture', exact: true })).toBeVisible()
})
