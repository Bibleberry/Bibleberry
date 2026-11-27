import { createServer, type ViteDevServer } from 'vite'
import type { Page } from '@playwright/test'
import { expect, test } from '../smoke/helpers/frameSafeTest.ts'
import * as fixtures from './fixtures/m1aGatewayFixtures.ts'

let server: ViteDevServer
let url: string

async function startReader() {
  const vite = await createServer({
    cacheDir: 'node_modules/.vite/reader-shell-foundations-overview',
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
  await page.route('**/api/challenges', route => route.fulfill({
    json: { ok: true, challenges: [fixtures.challenge, fixtures.todayChallenge] },
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
}

function primaryNav(page: Page) {
  return page.getByRole('navigation', { name: 'Primary navigation' })
}

async function selectTab(page: Page, label: 'Today' | 'Library' | 'Collections' | 'More') {
  await primaryNav(page).getByRole('button', { name: label, exact: true }).click()
}

test.beforeAll(async () => {
  server = await startReader()
})

test.afterAll(async () => {
  await server?.close()
})

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-10T12:00:00Z'))
  await page.route('https://**', route => route.abort())
  await page.addInitScript(({ key, value }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, value)
  }, { key: fixtures.readerProfileKey, value: fixtures.buildReaderProfileStorageValue() })
})

test('Library opens bounded Foundations overview with truthful empty state and reliable return', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 640 })
  await mockGateway(page)
  await page.goto(url)

  await selectTab(page, 'Library')
  const shelfMain = page.getByRole('main', { name: 'Shelf', exact: true })
  await expect(shelfMain).toBeVisible()

  const foundationsEntrance = page.getByRole('button', { name: 'Foundations', exact: true })
  await expect(foundationsEntrance).toBeVisible()
  await foundationsEntrance.click()

  const overview = page.getByTestId('foundations-overview')
  await expect(overview).toBeVisible()
  await expect(overview).toHaveAttribute('data-availability', 'empty')
  await expect(page.getByRole('main')).toHaveCount(1)
  await expect(page.getByRole('heading', { level: 1, name: 'Foundations', exact: true })).toBeVisible()
  await expect(
    page.getByRole('heading', { level: 2, name: 'No Foundations readings are available yet', exact: true }),
  ).toBeVisible()
  await expect(overview.getByRole('status')).toContainText(/Approved Foundations readings have not been added here yet/i)
  await expect(overview.getByRole('status')).toContainText(/Nothing is required or missing/i)

  // No fabricated reading actions, lessons, or awards.
  await expect(overview.getByRole('button')).toHaveCount(1)
  await expect(overview.getByRole('button', { name: 'Back to Library', exact: true })).toBeVisible()
  await expect(overview.getByText(/Resume Reading|Begin with the First Reading|Foundations unavailable/i)).toHaveCount(0)

  // Primary navigation remains visible with Library active.
  await expect(primaryNav(page)).toBeVisible()
  await expect(primaryNav(page).getByRole('button', { name: 'Library', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )

  // Switching tabs preserves Foundations inside Library; re-tapping Library resets to Library landing.
  await selectTab(page, 'Today')
  await expect(page.getByTestId('today-primary-cta')).toBeVisible()
  await selectTab(page, 'Library')
  await expect(overview).toBeVisible()
  await selectTab(page, 'Library')
  await expect(shelfMain).toBeVisible()

  // Browser Back returns reliably from Foundations overview to Library.
  await foundationsEntrance.click()
  await expect(overview).toBeVisible()
  await page.goBack()
  await expect(shelfMain).toBeVisible()

  // Explicit Back to Library returns reliably to Library.
  await foundationsEntrance.click()
  await expect(overview).toBeVisible()
  await page.getByTestId('foundations-back').click()
  await expect(shelfMain).toBeVisible()
})

for (const width of [320, 375]) {
  test(`Foundations overview supports keyboard navigation, focus restoration, and 200% text reflow at ${width}px`, async ({ page }) => {
    await mockGateway(page)
    await page.setViewportSize({ width, height: 640 })
    await page.goto(url)
    await selectTab(page, 'Library')
    await expect(page.getByRole('main', { name: 'Shelf', exact: true })).toBeVisible()

    const foundationsEntrance = page.getByRole('button', { name: 'Foundations', exact: true })
    await foundationsEntrance.focus()
    await expect(foundationsEntrance).toBeFocused()
    await page.keyboard.press('Enter')

    const overview = page.getByTestId('foundations-overview')
    await expect(overview).toBeVisible()

    // Focus moves into the active Foundations screen; keyboard Tab reaches Back to Library.
    const activeScreen = page.locator('.r06-screen:not([hidden])')
    await expect(activeScreen).toBeFocused()
    await page.keyboard.press('Tab')
    const backButton = page.getByTestId('foundations-back')
    await expect(backButton).toBeFocused()

    // Check normal and 200% text scaling for zero horizontal overflow and touch target height.
    for (const fontSize of ['100%', '200%']) {
      await page.evaluate(size => {
        document.documentElement.style.fontSize = size
      }, fontSize)

      const backBox = (await backButton.boundingBox())!
      expect(backBox.height).toBeGreaterThanOrEqual(44)
      expect(backBox.width).toBeLessThanOrEqual(width)

      const scrollWidths = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth,
        viewport: document.querySelector('.r06-viewport')?.scrollWidth ?? 0,
      }))
      expect(scrollWidths.doc).toBeLessThanOrEqual(width)
      expect(scrollWidths.viewport).toBeLessThanOrEqual(width)
    }

    await page.evaluate(() => {
      document.documentElement.style.fontSize = '100%'
    })

    // Pressing Enter on Back to Library returns to Library and restores focus to Foundations entrance.
    await backButton.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('main', { name: 'Shelf', exact: true })).toBeVisible()
    await expect(foundationsEntrance).toBeFocused()
  })
}

test('visiting Foundations overview makes no unintended participation, progress, Shelf, profile, or Card changes', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 640 })
  await mockGateway(page)

  const seededParticipation = {
    schemaVersion: 3,
    data: {
      completedChallenges: {
        'cms:challenge-oct-25': {
          completedAt: '2026-10-25T14:00:00.000Z',
          source: 'guest',
        },
      },
      earnedAwards: {
        [fixtures.currentThematicAwardId]: {
          earnedOn: fixtures.serverContext.authorizedLocalDate,
          earnedCard: fixtures.currentThematicEarnedCard,
        },
      },
      savedScriptures: [
        {
          id: 'saved-1',
          reference: 'Psalm 23:1',
          text: 'Yahweh is my shepherd: I shall lack nothing.',
          savedAt: '2026-10-25T14:05:00.000Z',
        },
      ],
    },
  }
  const seededShelf = {
    schemaVersion: 1,
    state: {
      activeFocusMonth: fixtures.monthId,
      months: [
        {
          yearMonth: fixtures.monthId,
          admissionKind: 'readerSelected',
          isProtected: true,
        },
      ],
    },
  }

  await page.addInitScript(
    ({ pKey, pVal, sKey, sVal }) => {
      if (!localStorage.getItem(pKey)) localStorage.setItem(pKey, JSON.stringify(pVal))
      if (!localStorage.getItem(sKey)) localStorage.setItem(sKey, JSON.stringify(sVal))
    },
    {
      pKey: fixtures.participationKey,
      pVal: seededParticipation,
      sKey: fixtures.shelfKey,
      sVal: seededShelf,
    },
  )

  await page.goto(url)
  await selectTab(page, 'Library')
  await expect(page.getByRole('main', { name: 'Shelf', exact: true })).toBeVisible()

  const readStorage = () =>
    page.evaluate(
      ({ pKey, sKey, profileKey }) => ({
        participation: localStorage.getItem(pKey),
        shelf: localStorage.getItem(sKey),
        profile: localStorage.getItem(profileKey),
      }),
      {
        pKey: fixtures.participationKey,
        sKey: fixtures.shelfKey,
        profileKey: fixtures.readerProfileKey,
      },
    )

  const before = await readStorage()

  await page.getByRole('button', { name: 'Foundations', exact: true }).click()
  await expect(page.getByTestId('foundations-overview')).toBeVisible()
  await page.getByTestId('foundations-back').click()
  await expect(page.getByRole('main', { name: 'Shelf', exact: true })).toBeVisible()

  const after = await readStorage()
  expect(after).toEqual(before)
})
