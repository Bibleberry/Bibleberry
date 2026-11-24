import { test, expect } from '../smoke/helpers/frameSafeTest'
import { createServer, type ViteDevServer } from 'vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PARTICIPATION_STORAGE_KEY = 'bibleberry-reader-participation-v1'
const TINY_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aW0cAAAAASUVORK5CYII=',
  'base64',
)

let viteServer: ViteDevServer | null = null
let baseUrl = ''

test.describe('R14-7 Field Notebook Earned-Only Collection', () => {
  let uncaughtErrors: Error[] = []
  let apiRequestUrls: string[] = []

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
      throw new Error('Failed to start Vite dev server for Field Notebook harness')
    }
    baseUrl = `http://127.0.0.1:${address.port}/tests/notebook/harness/index.html`
  })

  test.afterAll(async () => {
    await viteServer?.close()
    viteServer = null
  })

  test.beforeEach(async ({ page }) => {
    uncaughtErrors = []
    apiRequestUrls = []
    page.on('pageerror', err => uncaughtErrors.push(err))
    await page.route('**/api/**', route => {
      apiRequestUrls.push(route.request().url())
      return route.abort()
    })
    await page.route('https://cdn.sanity.io/images/**', route =>
      route.fulfill({ status: 200, contentType: 'image/png', body: TINY_PNG_BUFFER }),
    )
  })

  test.afterEach(() => {
    expect(uncaughtErrors).toEqual([])
    expect(apiRequestUrls).toEqual([])
  })

  test('renders empty collection state, neutral Coming Soon months, Year/Month & Jan/Dec & leap-year browsing, search, and viewer focus/flag isolation', async ({ page }) => {
    await page.goto(`${baseUrl}?refMonth=2026-11`)
    await expect(page.getByRole('heading', { name: 'Field Notebook', exact: true })).toBeVisible()

    // 1. Empty collection state
    await expect(page.getByRole('heading', { name: '0 Distinct Challenges Completed' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'No Earned Scripture Cards Yet' })).toBeVisible()
    await expect(page.getByText('Special Experiences')).toHaveCount(0)

    // Future month December 2026 is neutral non-interactive Coming Soon
    const decCard = page.locator('.notebook-month-card--coming-soon', { hasText: 'December' })
    await expect(decCard).toBeVisible()
    await expect(decCard).toHaveAttribute('aria-disabled', 'true')
    await expect(decCard).toContainText('Coming soon')

    // All Earned Cards empty state
    await page.getByRole('button', { name: 'All Earned Cards' }).click()
    await expect(page.getByRole('heading', { name: 'No Earned Scripture Cards Yet' })).toBeVisible()

    // 2. Earn awards while the Notebook is already open.
    await page.getByRole('button', { name: 'Seed Earned Awards & Completions' }).click()
    await expect(page.getByRole('heading', { name: '2 Distinct Challenges Completed' })).toBeVisible()

    // 3. By Year & Month: check Jan/Dec transition and late-earned Feb 2024 leap-year month
    await page.getByRole('button', { name: /By Year & Month/i }).click()
    await page.getByRole('button', { name: /January 2026: 1 earned card/i }).click()
    await expect(page.getByRole('heading', { name: 'January 2026', exact: true })).toBeVisible()
    await expect(page.getByText('New Every Morning')).toBeVisible()

    // Step across Jan 2026 -> Dec 2025
    await page.getByRole('button', { name: /December 2025/i }).click()
    await expect(page.getByRole('heading', { name: 'December 2025', exact: true })).toBeVisible()
    await expect(page.getByText('Prince of Peace')).toBeVisible()
    await expect(page.getByText('Published December 2025')).toBeVisible()

    // Return to 12 months and navigate to 2024 -> February 2024 (leap year, 29 days, late-earned in 2026)
    await page.getByRole('button', { name: /All 12 months in 2025/i }).click()
    await page.getByRole('group', { name: 'Relevant years' }).getByRole('button', { name: '2024' }).click()
    await page.getByRole('button', { name: /February 2024: 1 earned card/i }).click()
    await expect(page.getByRole('heading', { name: 'February 2024', exact: true })).toBeVisible()
    await expect(page.getByText('1 earned card · 29 days in month')).toBeVisible()
    await expect(page.getByText('Spring of Living Water')).toBeVisible()
    await expect(page.getByText('Published February 2024')).toBeVisible()
    await expect(page.getByText('Earned November 12, 2026')).toBeVisible()

    // 4. All Earned Cards gallery ordering (newest earned first) + missing snapshot handling
    await page.getByRole('button', { name: 'All Earned Cards' }).click()
    const cardTitles = await page.locator('.notebook-card__title').allTextContents()
    expect(cardTitles).toEqual([
      'Spring of Living Water',
      'Full-Month Scripture Card',
      'A Light for the Path',
      'New Every Morning',
      'Prince of Peace',
    ])
    await expect(page.getByText('Card snapshot unavailable — your earned award record is preserved.')).toBeVisible()

    // 5. Search & curated theme filter + zero-results behavior
    const searchInput = page.getByRole('searchbox', { name: 'Search Your Cards' })
    await searchInput.fill('Psalm 119:105')
    await expect(page.locator('.notebook-card__title')).toHaveText(['A Light for the Path'])

    await searchInput.fill('nonexistent-theme-query')
    await expect(page.getByRole('heading', { name: 'No Matching Earned Scripture Cards' })).toBeVisible()
    await page.getByRole('button', { name: 'Clear search and filters' }).click()
    await expect(page.locator('.notebook-card__title')).toHaveCount(5)

    // Theme chip filter ("Guidance" matches both Spring of Living Water & A Light for the Path, newest-first)
    await page.getByRole('group', { name: 'Filter by curated theme' }).getByRole('button', { name: 'Guidance' }).click()
    await expect(page.locator('.notebook-card__title')).toHaveText([
      'Spring of Living Water',
      'A Light for the Path',
    ])

    // 6. Open A Light for the Path in EarnedScriptureCardViewer, verify focus restoration & flags
    const lightTrigger = page.getByRole('button', { name: /Open Scripture Card: A Light for the Path/i })
    await lightTrigger.focus()
    await lightTrigger.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('A Light for the Path')
    await expect(dialog).toContainText('Psalm 119:105')
    await expect(dialog).toContainText('Your word is a lamp to my feet')

    // Escape closes viewer and returns focus to the originating card button while keeping filter active
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(lightTrigger).toBeFocused()
    await expect(page.locator('.notebook-card__title')).toHaveText([
      'Spring of Living Water',
      'A Light for the Path',
    ])

    // Verify ONLY light-path has cardViewed: true and hubAnnouncementAcked remains false across all awards
    const storedAwards = await page.evaluate(storageKey => {
      return JSON.parse(window.localStorage.getItem(storageKey) ?? 'null')?.data?.earnedAwards
    }, PARTICIPATION_STORAGE_KEY)
    expect(storedAwards['card:monthly:2026-11:light-path'].cardViewed).toBe(true)
    expect(storedAwards['card:monthly:2026-11:light-path'].hubAnnouncementAcked).toBe(false)
    expect(storedAwards['card:monthly:2026-11:light-path'].earnedOn).toBe('2026-11-08')
    expect(storedAwards['card:monthly:2024-02:living-water'].cardViewed).toBe(false)
    expect(storedAwards['card:monthly:2024-02:living-water'].hubAnnouncementAcked).toBe(false)
    const readNotebookAcknowledgements = () => page.evaluate(storageKey =>
      JSON.parse(localStorage.getItem(storageKey) ?? 'null')?.data?.notebookAcknowledgedAwardIds ?? [],
    PARTICIPATION_STORAGE_KEY)
    expect(await readNotebookAcknowledgements()).toEqual([])

    // 7. Reentering acknowledges the awards globally and preserves each Card's marker.
    await page.reload()
    await expect(page.getByRole('heading', { name: '2 Distinct Challenges Completed' })).toBeVisible()
    await expect.poll(readNotebookAcknowledgements).toEqual(Object.keys(storedAwards).sort())
    await page.getByRole('button', { name: 'All Earned Cards' }).click()
    await expect(page.locator('.notebook-card__title')).toHaveCount(5)
    await expect(page.getByRole('button', { name: /Open Scripture Card: A Light for the Path/i })).not.toContainText('New')
    await expect(page.getByRole('button', { name: /Open Scripture Card: Spring of Living Water/i })).toContainText('New')
  })

  test('handles inaccessible Card images cleanly and avoids overflow at 375px large-text reduced-motion', async ({ page }) => {
    await page.route('https://cdn.sanity.io/images/**', route =>
      route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not Found' }),
    )
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 375, height: 812 })

    await page.goto(`${baseUrl}?refMonth=2026-11&large=1`)
    await page.getByRole('button', { name: 'Seed Earned Awards & Completions' }).click()
    await page.getByRole('button', { name: 'All Earned Cards' }).click()

    await expect(page.locator('.notebook-card__media-fallback').first()).toContainText(
      'Illustration unavailable right now.',
    )

    // Opening the card still opens EarnedScriptureCardViewer with accessible transcription fallback
    await page.getByRole('button', { name: /Open Scripture Card: Spring of Living Water/i }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Whoever drinks of the water that I will give him')
    await dialog.getByRole('button', { name: /Close Scripture card/i }).click()
    await expect(dialog).toHaveCount(0)

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    )
    expect(overflow).toBe(false)
  })
})
