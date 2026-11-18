import { test, expect } from '../smoke/helpers/frameSafeTest'
import { createServer, type ViteDevServer } from 'vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

let viteServer: ViteDevServer | null = null
let harnessRootUrl = ''

test.describe('Phase 05 / R08: Standalone Library-to-Shelf Workspace', () => {
  let uncaughtErrors: Error[] = []
  let unexpectedRequests: string[] = []

  test.beforeAll(async () => {
    viteServer = await createServer({
      configFile: resolve(repositoryRoot, 'vite.config.ts'),
      root: repositoryRoot,
      server: {
        host: '127.0.0.1',
        port: 0,
        strictPort: false,
      },
      logLevel: 'silent',
    })
    await viteServer.listen()
    const address = viteServer.httpServer?.address()
    if (!address || typeof address === 'string') {
      throw new Error('Failed to start Vite dev server for Library-Shelf test harness')
    }
    harnessRootUrl = `http://127.0.0.1:${address.port}/tests/libraryShelf/harness/index.html`
  })

  test.afterAll(async () => {
    await viteServer?.close()
    viteServer = null
  })

  test.beforeEach(async ({ page }) => {
    uncaughtErrors = []
    unexpectedRequests = []
    page.on('pageerror', err => uncaughtErrors.push(err))
    page.on('request', req => {
      const url = req.url()
      if (url.includes('api.sanity.io')) {
        unexpectedRequests.push(url)
      }
    })
  })

  test.afterEach(() => {
    expect(uncaughtErrors).toEqual([])
    expect(unexpectedRequests).toEqual([])
  })

  test('0-3 months handoff: browse Library from empty Shelf, select months, and return without losing context', async ({
    page,
  }) => {
    await page.goto(`${harnessRootUrl}?scenario=empty`)

    await expect(page.getByRole('heading', { name: 'Shelf', level: 1 })).toBeVisible()
    await expect(page.getByText('0 of 3 months on Shelf')).toBeVisible()

    // Navigate from Shelf -> Library
    await page.getByRole('button', { name: 'Browse Library to Add a Month' }).click()
    await expect(page.getByRole('heading', { name: 'Historical Library', level: 1 })).toBeVisible()
    await expect(page.getByTestId('provider-fetch-count')).toHaveText('1')

    // Load second page of Library
    await page.getByRole('button', { name: 'Load more past months' }).click()
    await expect(page.locator('.library-card')).toHaveCount(5)
    await expect(page.getByTestId('provider-fetch-count')).toHaveText('2')

    // Select 3 months (0 -> 1 -> 2 -> 3)
    await page.getByRole('button', { name: 'Add October 2026 to Shelf' }).click()
    await expect(page.getByRole('button', { name: /View Shelf \(1 of 3 months\)/ })).toBeVisible()
    await expect(
      page.locator('.library-card[data-year-month="2026-10"]'),
    ).toHaveAttribute('data-selected', 'true')

    await page.getByRole('button', { name: 'Add September 2026 to Shelf' }).click()
    await page.getByRole('button', { name: 'Add July 2026 to Shelf' }).click()
    await expect(page.getByRole('button', { name: /View Shelf \(3 of 3 months\)/ })).toBeVisible()

    // Return to Shelf via Back to Shelf
    await page.getByRole('button', { name: 'Back to Shelf' }).click()
    await expect(page.getByRole('heading', { name: 'Shelf', level: 1 })).toBeVisible()
    await expect(page.getByText('Shelf full · 3 of 3 months')).toBeVisible()
    await expect(page.locator('.shelf-card')).toHaveCount(3)

    // Return to Library again — loaded pages (5 items) & selected context preserved without re-fetching
    await page.getByRole('button', { name: 'Browse Library' }).click()
    await expect(page.locator('.library-card')).toHaveCount(5)
    await expect(page.getByTestId('provider-fetch-count')).toHaveText('2')
    await expect(
      page.locator('.library-card[data-year-month="2026-07"]'),
    ).toHaveAttribute('data-selected', 'true')
  })

  test('explicit replacement policy when Shelf is full (3 months)', async ({ page }) => {
    await page.goto(`${harnessRootUrl}?scenario=three-months-full`)

    await expect(page.getByText('Shelf full · 3 of 3 months')).toBeVisible()
    await page.getByRole('button', { name: 'Browse Library' }).click()
    await page.getByRole('button', { name: 'Load more past months' }).click()

    // Selecting a 4th month opens the explicit replacement dialog (no silent eviction)
    await page.getByRole('button', { name: 'Add July 2026 to Shelf' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Choose a Month to Replace')).toBeVisible()

    // Cancel preserves all 3 existing months
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(dialog).toBeHidden()

    // Re-open and explicitly replace August 2026
    await page.getByRole('button', { name: 'Add July 2026 to Shelf' }).click()
    await expect(dialog).toBeVisible()
    await dialog.getByRole('radio', { name: /August 2026/ }).check()
    await dialog.getByRole('button', { name: 'Replace Selected Month' }).click()
    await expect(dialog).toBeHidden()

    // July 2026 is now protected on Shelf; August 2026 is available to add again
    await expect(
      page.locator('.library-card[data-year-month="2026-07"]'),
    ).toHaveAttribute('data-on-shelf', 'true')
    await expect(
      page.getByRole('button', { name: 'Add August 2026 to Shelf' }),
    ).toBeVisible()

    // Back to Shelf shows July 2026
    await page.getByRole('button', { name: 'Back to Shelf' }).click()
    await expect(page.locator('.shelf-card[data-year-month="2026-07"]')).toBeVisible()
    await expect(page.locator('.shelf-card[data-year-month="2026-08"]')).toHaveCount(0)
  })

  test('distinguishes protected vs automatically admitted months and promotes auto-admitted from Library', async ({
    page,
  }) => {
    await page.goto(`${harnessRootUrl}?scenario=two-months-mixed`)

    // Shelf distinguishes auto-admitted vs protected
    const octShelfCard = page.locator('.shelf-card[data-year-month="2026-10"]')
    const sepShelfCard = page.locator('.shelf-card[data-year-month="2026-09"]')
    await expect(octShelfCard).toHaveAttribute('data-protected', 'false')
    await expect(sepShelfCard).toHaveAttribute('data-protected', 'true')

    // Browse Library: October shows Rollover + Keep on Shelf; September shows Protected
    await page.getByRole('button', { name: 'Browse Library' }).click()
    const octLibCard = page.locator('.library-card[data-year-month="2026-10"]')
    const sepLibCard = page.locator('.library-card[data-year-month="2026-09"]')

    await expect(octLibCard.getByText('On Shelf · Rollover')).toBeVisible()
    await expect(sepLibCard.getByText('On Shelf · Protected')).toBeVisible()

    // Promote October 2026 from Library
    await page.getByRole('button', { name: /Keep October 2026 on Shelf/ }).click()
    await expect(octLibCard.getByText('On Shelf · Protected')).toBeVisible()

    // Verify on Shelf
    await page.getByRole('button', { name: 'Back to Shelf' }).click()
    await expect(octShelfCard).toHaveAttribute('data-protected', 'true')
  })

  test('putting away a Shelf month preserves underlying progress and accomplishments', async ({
    page,
  }) => {
    await page.goto(`${harnessRootUrl}?scenario=two-months-mixed`)

    const progressBefore = await page.getByTestId('underlying-progress').textContent()

    await page.getByRole('button', { name: 'Put away October 2026 from Shelf' }).click()
    await expect(page.getByText('1 of 3 month on Shelf')).toBeVisible()
    await expect(page.locator('.shelf-card[data-year-month="2026-10"]')).toHaveCount(0)

    // Underlying progress/accomplishments are untouched
    const progressAfter = await page.getByTestId('underlying-progress').textContent()
    expect(progressAfter).toEqual(progressBefore)

    // Library now shows October 2026 as available to add again
    await page.getByRole('button', { name: 'Browse Library' }).click()
    await expect(
      page.getByRole('button', { name: 'Add October 2026 to Shelf' }),
    ).toBeVisible()
  })

  test('opens months through typed callbacks with origin context and blocks unauthorized/current/future candidates', async ({
    page,
  }) => {
    await page.goto(`${harnessRootUrl}?scenario=unauthorized-candidates`)

    // Start on Shelf -> open Library
    await page.getByRole('button', { name: 'Browse Library to Add a Month' }).click()
    await expect(page.locator('.library-card')).toHaveCount(5)

    // Attempt to add current (2026-11) or future (2026-12) month to Shelf — must be rejected
    await page.getByRole('button', { name: 'Add November 2026 to Shelf' }).click()
    await page.getByRole('button', { name: 'Add December 2026 to Shelf' }).click()
    const shelfJson = await page.getByTestId('shelf-json').textContent()
    expect(JSON.parse(shelfJson ?? '{}').months).toEqual([])

    // Attempt to open current/future month from Library — must be blocked
    await page.getByRole('button', { name: /Open November 2026/ }).click()
    await page.getByRole('button', { name: /Open December 2026/ }).click()
    expect(JSON.parse((await page.getByTestId('opened-months').textContent()) ?? '[]')).toEqual([])

    // Open authorized historical month directly from Library
    await page.getByRole('button', { name: /Open October 2026/ }).click()
    expect(JSON.parse((await page.getByTestId('opened-months').textContent()) ?? '[]')).toEqual([
      { yearMonth: '2026-10', origin: 'library' },
    ])

    // Add October 2026 to Shelf, return to Shelf, and open from Shelf
    await page.getByRole('button', { name: 'Add October 2026 to Shelf' }).click()
    await page.getByRole('button', { name: 'Back to Shelf' }).click()
    await page.getByRole('button', { name: /Open October 2026/ }).click()
    expect(JSON.parse((await page.getByTestId('opened-months').textContent()) ?? '[]')).toEqual([
      { yearMonth: '2026-10', origin: 'library' },
      { yearMonth: '2026-10', origin: 'shelf' },
    ])
  })

  test('supports Back navigation when starting in Library and outer exit callback', async ({
    page,
  }) => {
    await page.goto(`${harnessRootUrl}?scenario=start-library`)

    await expect(page.getByRole('heading', { name: 'Historical Library', level: 1 })).toBeVisible()
    await page.getByRole('button', { name: /View Shelf/ }).click()
    await expect(page.getByRole('heading', { name: 'Shelf', level: 1 })).toBeVisible()

    // Back to Library from Shelf
    await page.getByRole('button', { name: 'Back to Library' }).click()
    await expect(page.getByRole('heading', { name: 'Historical Library', level: 1 })).toBeVisible()

    // Outer exit from root Library surface
    await page.getByRole('button', { name: 'Return to Hub' }).click()
    await expect(page.getByTestId('exit-calls')).toHaveText('1')
  })

  test('waits for gateway calendar context before showing an existing Shelf', async ({ page }) => {
    await page.goto(`${harnessRootUrl}?scenario=implicit-calendar`)

    await expect(page.getByRole('status').getByText('Preparing your Shelf…')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Shelf', level: 1 })).toBeVisible()
    await expect(page.locator('.shelf-card[data-year-month="2026-10"]')).toBeVisible()
    await expect(page.getByText('Shelf is Empty')).toHaveCount(0)
  })

  test('keeps an initial Library request alive while leaving and returning', async ({ page }) => {
    await page.goto(`${harnessRootUrl}?scenario=delayed-library`)
    await expect(page.getByRole('heading', { name: 'Shelf', level: 1 })).toBeVisible()
    await expect(page.getByTestId('provider-fetch-count')).toHaveText('1')
    await page.getByRole('button', { name: 'Browse Library to Add a Month' }).click()
    await expect(page.getByRole('heading', { name: 'Historical Library', level: 1 })).toBeVisible()
    await expect(page.getByText('Loading historical catalogue…')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Back to Shelf' })).toBeVisible()
    await page.getByRole('button', { name: 'Back to Shelf' }).click()
    await expect(page.getByRole('heading', { name: 'Shelf', level: 1 })).toBeVisible()
    await page.getByRole('button', { name: 'Browse Library to Add a Month' }).click()

    await expect(page.locator('.library-card')).toHaveCount(3)
    await expect(page.getByTestId('provider-fetch-count')).toHaveText('1')
  })

  test('keeps a load-more request alive while leaving and returning', async ({ page }) => {
    await page.goto(`${harnessRootUrl}?scenario=delayed-more`)
    await page.getByRole('button', { name: 'Browse Library to Add a Month' }).click()
    await expect(page.locator('.library-card')).toHaveCount(3)
    await page.getByRole('button', { name: 'Load more past months' }).click()
    await expect(page.getByTestId('provider-fetch-count')).toHaveText('2')
    await page.getByRole('button', { name: 'Back to Shelf' }).click()
    await expect(page.getByRole('heading', { name: 'Shelf', level: 1 })).toBeVisible()
    await page.getByRole('button', { name: 'Browse Library' }).click()

    await expect(page.locator('.library-card')).toHaveCount(5)
    await expect(page.getByTestId('provider-fetch-count')).toHaveText('2')
  })

  test('authorizes Shelf opens on older catalogue pages and rejects stale persisted entries', async ({
    page,
  }) => {
    await page.goto(`${harnessRootUrl}?scenario=old-shelf-month`)
    await expect(page.locator('.shelf-card[data-year-month="2026-06"]')).toBeVisible()
    await page.getByRole('button', { name: /Open June 2026/ }).click()
    await expect(page.getByTestId('opened-months')).toContainText('2026-06')

    await page.goto(`${harnessRootUrl}?scenario=stale-shelf-month`)
    await expect(page.locator('.shelf-card[data-year-month="2026-10"]')).toBeVisible()
    await page.getByRole('button', { name: /Open October 2026/ }).click()
    await expect(page.getByTestId('opened-months')).toHaveText('[]')
    await expect(page.getByRole('alert')).toContainText(
      'Month 2026-10 is no longer available in the authorized historical Library catalogue.',
    )
  })

  test('keyboard navigation and Escape dismissal in replacement dialog', async ({ page }) => {
    await page.goto(`${harnessRootUrl}?scenario=three-months-full`)

    await page.getByRole('button', { name: 'Browse Library' }).click()
    await page.getByRole('button', { name: 'Load more past months' }).click()

    const addJulyBtn = page.getByRole('button', { name: 'Add July 2026 to Shelf' })
    await addJulyBtn.focus()
    await page.keyboard.press('Enter')

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('mobile viewport layout has no horizontal overflow and maintains >= 44px touch targets', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`${harnessRootUrl}?scenario=two-months-mixed`)

    const shelfOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    )
    expect(shelfOverflow).toBe(false)

    await page.getByRole('button', { name: 'Browse Library' }).click()
    await expect(page.getByRole('heading', { name: 'Historical Library', level: 1 })).toBeVisible()

    const libraryOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    )
    expect(libraryOverflow).toBe(false)

    const touchTargetHeights = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('main button'))
      return buttons.map(btn => btn.getBoundingClientRect().height)
    })
    expect(touchTargetHeights.length).toBeGreaterThan(0)
    for (const h of touchTargetHeights) {
      expect(h).toBeGreaterThanOrEqual(44)
    }
  })
})
