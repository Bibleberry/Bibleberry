import { test, expect } from '../smoke/helpers/frameSafeTest'
import { createServer, type ViteDevServer } from 'vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
let viteServer: ViteDevServer | null = null
let harnessRootUrl = ''

test.describe('R08-2 Reader-facing Historical Library Catalogue', () => {
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
      throw new Error('Failed to start Vite dev server for Historical Library test harness')
    }
    harnessRootUrl = `http://127.0.0.1:${address.port}/tests/library/harness/index.html`
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
      // Enforce zero direct Sanity queries from the browser
      if (url.includes('api.sanity.io')) {
        unexpectedRequests.push(url)
      }
    })


  })

  test.afterEach(() => {
    expect(uncaughtErrors).toEqual([])
    expect(unexpectedRequests).toEqual([])
  })

  test('multi-page catalogue loads newest-first, paginates via Load more, and fires accessible onOpenMonth', async ({ page }) => {
    await page.goto(`${harnessRootUrl}?scenario=multi-page`)

    // Verify main landmarks and title
    const mainHeading = page.getByRole('heading', { name: 'Historical Library', level: 1 })
    await expect(mainHeading).toBeVisible()

    // Page 1 cards: October 2026 and September 2026
    const octCard = page.locator('.library-card[data-year-month="2026-10"]')
    const sepCard = page.locator('.library-card[data-year-month="2026-09"]')

    await expect(octCard).toBeVisible()
    await expect(octCard.getByRole('heading', { name: 'Walk in Gratitude' })).toBeVisible()
    await expect(octCard.getByText('October 2026')).toBeVisible()
    await expect(octCard.locator('img')).toHaveCount(0)

    await expect(sepCard).toBeVisible()
    await expect(sepCard.getByRole('heading', { name: 'Steadfast Hope' })).toBeVisible()
    await expect(sepCard.getByText('September 2026')).toBeVisible()

    // Load more button should be present and active
    const loadMoreBtn = page.getByRole('button', { name: 'Load more past months' })
    await expect(loadMoreBtn).toBeVisible()
    await expect(loadMoreBtn).toBeEnabled()

    // Click Load more to fetch next page (August 2026)
    await loadMoreBtn.click()

    const augCard = page.locator('.library-card[data-year-month="2026-08"]')
    await expect(augCard).toBeVisible()
    await expect(augCard.getByRole('heading', { name: 'Abiding Peace' })).toBeVisible()

    // Verify catalogue is now exhausted
    await expect(page.getByText('You have reached the beginning of the Library catalogue.')).toBeVisible()
    await expect(loadMoreBtn).not.toBeVisible()

    // Test accessible onOpenMonth callback
    const openOctBtn = octCard.getByRole('button', { name: 'Open October 2026: Walk in Gratitude' })
    await openOctBtn.click()

    await expect(page.getByTestId('last-opened-month')).toHaveText('Opened: 2026-10')

    // Test back navigation
    await page.getByRole('button', { name: 'Return to Hub' }).click()
    await expect(page.getByTestId('exit-status')).toHaveText('Exit: called')
  })

  test('displays dignified empty state when no historical months exist in the catalogue', async ({ page }) => {
    await page.goto(`${harnessRootUrl}?scenario=empty`)

    await expect(page.getByRole('heading', { name: 'No Historical Months Yet' })).toBeVisible()
    await expect(
      page.getByText('As each monthly study concludes, it will be preserved here in the Library'),
    ).toBeVisible()

    // No catalogue cards or load more button
    await expect(page.locator('.library-card')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Load more past months' })).not.toBeVisible()
  })

  test('handles sparse-valid page (items=[] with hasMore=true) by retaining continuation action', async ({ page }) => {
    await page.goto(`${harnessRootUrl}?scenario=sparse-initial`)

    // Should NOT show the exhausted "No Historical Months Yet" view
    await expect(page.getByRole('heading', { name: 'No Historical Months Yet' })).not.toBeVisible()

    // Should display the continuation panel
    await expect(page.getByRole('heading', { name: 'Past Studies Available' })).toBeVisible()
    const continuationBtn = page.getByRole('button', { name: 'Load Historical Months' })
    await expect(continuationBtn).toBeVisible()

    // Clicking continuation successfully loads the historical month from the next window
    await continuationBtn.click()

    const julCard = page.locator('.library-card[data-year-month="2026-07"]')
    await expect(julCard).toBeVisible()
    await expect(julCard.getByRole('heading', { name: 'Living Word' })).toBeVisible()
    await expect(page.getByText('You have reached the beginning of the Library catalogue.')).toBeVisible()
  })

  test('handles intermediate sparse page during multi-page pagination', async ({ page }) => {
    await page.goto(`${harnessRootUrl}?scenario=sparse-middle`)

    // Initial item is October 2026
    await expect(page.locator('.library-card[data-year-month="2026-10"]')).toBeVisible()

    const loadMoreBtn = page.getByRole('button', { name: 'Load more past months' })
    await expect(loadMoreBtn).toBeVisible()

    // Click load more -> hits intermediate sparse page
    await loadMoreBtn.click()

    // Existing October card remains visible, and continuation note is displayed
    await expect(page.locator('.library-card[data-year-month="2026-10"]')).toBeVisible()
    await expect(
      page.getByText('No additional months found in this interval. Earlier historical months may still be available.'),
    ).toBeVisible()
    await expect(loadMoreBtn).toBeVisible()

    // Click load more again -> loads August 2026
    await loadMoreBtn.click()
    await expect(page.locator('.library-card[data-year-month="2026-08"]')).toBeVisible()
    await expect(page.getByText('You have reached the beginning of the Library catalogue.')).toBeVisible()
  })

  test('deduplicates overlapping months across page boundaries without duplicate key errors', async ({ page }) => {
    await page.goto(`${harnessRootUrl}?scenario=duplicate-months`)

    await expect(page.locator('.library-card')).toHaveCount(2)

    // Load next page which overlaps on September 2026
    await page.getByRole('button', { name: 'Load more past months' }).click()

    // Total cards should be 3 (Oct, Sep, Aug), not 4
    const cards = page.locator('.library-card')
    await expect(cards).toHaveCount(3)
    await expect(cards.nth(0)).toHaveAttribute('data-year-month', '2026-10')
    await expect(cards.nth(1)).toHaveAttribute('data-year-month', '2026-09')
    await expect(cards.nth(2)).toHaveAttribute('data-year-month', '2026-08')
  })

  test('displays request error with working retry', async ({ page }) => {
    await page.goto(`${harnessRootUrl}?scenario=error-retry`)

    // Initial attempt displays error view
    await expect(page.getByRole('heading', { name: 'Unable to Load Library' })).toBeVisible()
    await expect(page.locator('.library-error-message')).toHaveText('Simulated connection timeout')

    const retryBtn = page.getByRole('button', { name: 'Try Again' })
    await expect(retryBtn).toBeVisible()

    // Click retry -> recovers and displays October 2026
    await retryBtn.click()

    await expect(page.getByRole('heading', { name: 'Walk in Gratitude' })).toBeVisible()
    await expect(retryBtn).not.toBeVisible()
  })

  test('safely handles validation errors without exposing internal diagnostics', async ({ page }) => {
    await page.goto(`${harnessRootUrl}?scenario=validation-error`)

    await expect(page.getByRole('heading', { name: 'Library Catalogue Unavailable' })).toBeVisible()
    await expect(
      page.getByText('The Library catalogue could not be displayed due to an unexpected format issue.'),
    ).toBeVisible()

    // Does NOT leak raw Zod / boundary issue strings to the UI
    await expect(page.getByText('must be strictly earlier than')).not.toBeVisible()
  })

  test('keyboard accessibility: tabs through cards and triggers open month via keyboard Enter', async ({ page }) => {
    await page.goto(`${harnessRootUrl}?scenario=multi-page`)

    await expect(page.locator('.library-card[data-year-month="2026-10"]')).toBeVisible()

    // Tab to Return button
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Return to Hub' })).toBeFocused()

    await page.keyboard.press('Tab')
    await expect(page.getByRole('searchbox')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: '2026', exact: true })).toBeFocused()

    // Tab to first card's Open Month button
    await page.keyboard.press('Tab')
    const openOctBtn = page.getByRole('button', { name: 'Open October 2026: Walk in Gratitude' })
    await expect(openOctBtn).toBeFocused()

    // Press Enter to open
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('last-opened-month')).toHaveText('Opened: 2026-10')
  })
})
