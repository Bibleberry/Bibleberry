import { createServer, type ViteDevServer } from 'vite'
import type { Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { expect, test } from '../smoke/helpers/frameSafeTest.ts'
import * as fixtures from './fixtures/m1aGatewayFixtures.ts'

let server: ViteDevServer
let url: string

async function startReader() {
  const vite = await createServer({
    cacheDir: 'node_modules/.vite/reader-shell-responsive-accessibility',
    define: {
      'import.meta.env.VITE_ENABLE_R06_SHELL': JSON.stringify('true'),
      'import.meta.env.VITE_RELEASE_GATEWAY_ORIGIN': JSON.stringify(''),
      'import.meta.env.VITE_GATEWAY_ORIGIN': JSON.stringify(''),
      'import.meta.env.VITE_ENABLE_FIELD_NOTEBOOK': JSON.stringify('false'),
      'import.meta.env.VITE_ENABLE_SAVED_SCRIPTURE': JSON.stringify('false'),
    },
    server: { host: '127.0.0.1', port: 0 },
    logLevel: 'silent',
  })
  await vite.listen()
  const address = vite.httpServer?.address()
  if (!address || typeof address === 'string') throw new Error('Reader test server did not bind a port')
  url = `http://127.0.0.1:${address.port}/`
  return vite
}

async function mockGateway(page: Page) {
  await page.route(fixtures.currentThematicCardImageUrl, route => route.fulfill({
    status: 200,
    contentType: 'image/svg+xml',
    body: fixtures.SYNTHETIC_CARD_SVG,
  }))
  await page.route(`**/api/challenges/${fixtures.teachingSlug}`, route =>
    route.fulfill({ json: { ok: true, challenge: fixtures.challenge } }),
  )
  await page.route(`**/api/challenges/${fixtures.todaySlug}`, route =>
    route.fulfill({ json: { ok: true, challenge: fixtures.todayChallenge } }),
  )
  await page.route(`**/api/challenges/${fixtures.currentMonthMultiScreenSlug}`, route =>
    route.fulfill({ json: { ok: true, challenge: fixtures.currentMonthMultiScreenChallenge } }),
  )
  await page.route('**/api/challenges', route => route.fulfill({
    json: {
      ok: true,
      challenges: [fixtures.challenge, fixtures.todayChallenge, fixtures.currentMonthMultiScreenChallenge],
    },
  }))
  await page.route('**/api/library/months**', route =>
    route.fulfill({ json: fixtures.buildLibraryMonthsPayload() }),
  )
  await page.route('**/api/news**', route => {
    const category = new URL(route.request().url()).searchParams.get('category')
    return route.fulfill({ json: fixtures.buildNewsPayload(category) })
  })
  await page.route(`**/api/months/${fixtures.monthId}`, route =>
    route.fulfill({ json: fixtures.buildDefaultHistoricalMonthPayload() }),
  )
  await page.route(`**/api/months/${fixtures.currentMonthId}`, route =>
    route.fulfill({ json: fixtures.buildDefaultCurrentMonthPayload() }),
  )
  await page.route(`**/api/months/${fixtures.currentMonthId}/progress`, route => {
    const ids = route.request().postDataJSON().completedChallengeIds as string[]
    return route.fulfill({ json: fixtures.buildCurrentMonthProgressPayload(ids) })
  })
  await page.route(`**/api/months/${fixtures.monthId}/progress`, route => {
    const ids = route.request().postDataJSON().completedChallengeIds as string[]
    return route.fulfill({ json: fixtures.buildHistoricalMonthProgressPayload(ids) })
  })
}

function primaryNav(page: Page) {
  return page.getByRole('navigation', { name: 'Primary navigation' })
}

async function seedDiscoveries(page: Page) {
  await page.addInitScript(({ key, data }: { key: string; data: object }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ schemaVersion: 3, data }))
  }, {
    key: fixtures.participationKey,
    data: {
      earnedAwards: {
        [fixtures.currentThematicAwardId]: {
          earnedOn: fixtures.serverContext.authorizedLocalDate,
          earnedCard: fixtures.currentThematicEarnedCard,
        },
        [fixtures.currentFullMonthAwardId]: { earnedOn: fixtures.serverContext.authorizedLocalDate },
      },
    },
  })
}

test.beforeAll(async () => {
  await mkdir('test-results/issue-355', { recursive: true })
  server = await startReader()
})
test.afterAll(async () => { await server?.close() })
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-10T12:00:00Z'))
  await page.route('https://**', route => route.abort())
})

for (const width of [320, 375]) {
  test(`R06 navigation and shared buttons reflow at ${width}px with normal and 200% text`, async ({ page }) => {
    await page.setViewportSize({ width, height: 640 })
    await mockGateway(page)
    await page.goto(url)

    const nav = primaryNav(page)
    const tabs = nav.getByRole('button')
    await expect(tabs).toHaveText(['Today', 'Library', 'Collections', 'More'])
    await expect(tabs.nth(0)).toHaveAttribute('aria-current', 'page')
    const primaryAction = page.getByTestId('today-primary-cta')
    await expect(primaryAction).toBeVisible()
    expect(await primaryAction.evaluate(element => getComputedStyle(element).fontSize)).toBe('13px')

    const linesAtDefault = await tabs.evaluateAll(buttons => buttons.map(button => {
      const range = document.createRange()
      range.selectNodeContents(button)
      return range.getClientRects().length
    }))
    expect(linesAtDefault).toEqual([1, 1, 1, 1])

    await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
    expect(await primaryAction.evaluate(element => getComputedStyle(element).fontSize)).toBe('26px')
    const largeTextLayout = await tabs.evaluateAll(buttons => buttons.map(button => {
      const range = document.createRange()
      range.selectNodeContents(button)
      return {
        label: button.textContent?.trim(),
        fontSize: getComputedStyle(button).fontSize,
        textLines: range.getClientRects().length,
        touchHeight: button.getBoundingClientRect().height,
        textFits: (() => {
          const text = range.getBoundingClientRect()
          const control = button.getBoundingClientRect()
          return text.left >= control.left && text.right <= control.right
        })(),
      }
    }))
    expect(largeTextLayout.map(button => button.label)).toEqual(['Today', 'Library', 'Collections', 'More'])
    expect(largeTextLayout.map(button => button.fontSize)).toEqual(['32px', '32px', '32px', '32px'])
    expect(largeTextLayout.map(button => button.textLines)).toEqual([1, 1, 1, 1])
    expect(largeTextLayout.every(button => button.touchHeight >= 44)).toBe(true)
    expect(largeTextLayout.every(button => button.textFits)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    await page.screenshot({ path: `test-results/issue-355/after-navigation-${width}px-200-percent.png`, fullPage: true })

    const labels = ['Today', 'Library', 'Collections', 'More']
    await tabs.nth(0).focus()
    for (let index = 0; index < labels.length; index += 1) {
      await expect(tabs.nth(index)).toBeFocused()
      if (index < labels.length - 1) await page.keyboard.press('Tab')
    }
    await tabs.nth(0).focus()
    await page.keyboard.press('Tab')
    await expect(tabs.nth(1)).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(tabs.nth(1)).toHaveAttribute('aria-current', 'page')
    for (const label of labels) {
      const destination = nav.getByRole('button', { name: label, exact: true })
      await destination.click()
      await expect(destination).toHaveAttribute('aria-current', 'page')
    }
    if (width === 320) {
      await nav.getByRole('button', { name: 'Collections', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Collections', exact: true })).toBeVisible()
      await page.screenshot({ path: 'test-results/issue-355/incidental-collections-heading-320px-200-percent.png', fullPage: true })
    }
  })

  test(`R06 Today discovery actions and gallery stay usable at ${width}px and 200% text`, async ({ page }) => {
    await page.setViewportSize({ width, height: 640 })
    await mockGateway(page)
    await seedDiscoveries(page)
    await page.goto(url)
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })

    const notice = page.getByTestId('today-card-announcement')
    await expect(notice).toBeVisible()
    await expect(notice.getByRole('heading', { name: '2 New Scripture Cards Earned' })).toBeVisible()
    const viewDiscoveries = notice.getByTestId('today-view-discoveries')
    const dismiss = notice.getByTestId('today-dismiss-announcement')
    expect(await viewDiscoveries.evaluate(element => getComputedStyle(element).fontSize)).toBe('26px')
    expect(await dismiss.evaluate(element => getComputedStyle(element).fontSize)).toBe('26px')
    expect(await viewDiscoveries.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44)
    expect(await dismiss.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    await page.screenshot({ path: `test-results/issue-355/after-announcement-${width}px-200-percent.png`, fullPage: true })
    await viewDiscoveries.focus()
    await expect(viewDiscoveries).toBeFocused()
    await page.keyboard.press('Enter')

    const gallery = page.getByTestId('view-discoveries-gallery')
    await expect(gallery.getByRole('heading', { name: 'Your New Discoveries', level: 1 })).toBeVisible()
    await expect(gallery.locator('.notebook-card')).toHaveCount(2)
    const returnToToday = gallery.getByRole('button', { name: 'Return to Today' })
    const browseNotebook = gallery.getByRole('button', { name: 'Browse Full Field Notebook' })
    expect(await returnToToday.evaluate(element => getComputedStyle(element).fontSize)).toBe('26px')
    expect(await browseNotebook.evaluate(element => getComputedStyle(element).fontSize)).toBe('26px')
    expect(await returnToToday.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44)
    expect(await browseNotebook.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    await page.screenshot({ path: `test-results/issue-355/after-gallery-${width}px-200-percent.png`, fullPage: true })

    const thumbnail = gallery.getByRole('button', { name: /Open Scripture Card: November Reading Card/ })
    await thumbnail.focus()
    await page.keyboard.press('Enter')
    const card = page.getByRole('dialog', { name: fixtures.currentThematicEarnedCard.title })
    await expect(card).toBeVisible()
    expect(await card.locator('.button--small').evaluate(element => getComputedStyle(element).fontSize)).toBe('24px')
    await page.keyboard.press('Escape')
    await expect(thumbnail).toBeFocused()

    await returnToToday.click()
    await expect(page.getByRole('heading', { name: 'Today', exact: true, level: 1 })).toBeFocused()
    await expect(notice).toHaveCount(0)
  })
}
