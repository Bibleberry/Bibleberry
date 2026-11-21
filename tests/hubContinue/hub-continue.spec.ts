import { test, expect } from '../smoke/helpers/frameSafeTest'
import { createServer, type ViteDevServer } from 'vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

let viteServer: ViteDevServer | null = null
let harnessRootUrl = ''

test.describe('Phase 05 / R06: Standalone Hub Continue Presentation Boundary', () => {
  let uncaughtErrors: Error[] = []

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
      throw new Error('Failed to start Vite dev server for Hub Continue test harness')
    }
    harnessRootUrl = `http://127.0.0.1:${address.port}/tests/hubContinue/harness/index.html`
  })

  test.afterAll(async () => {
    await viteServer?.close()
    viteServer = null
  })

  test.beforeEach(async ({ page }) => {
    uncaughtErrors = []
    page.on('pageerror', err => uncaughtErrors.push(err))
  })

  test.afterEach(() => {
    expect(uncaughtErrors).toEqual([])
  })

  test('renders nothing when empty or unavailable', async ({ page }) => {
    await page.goto(`${harnessRootUrl}?scenario=empty`)
    await expect(page.getByRole('heading', { name: 'Hub Continue Harness' })).toBeVisible()
    await expect(page.locator('.hub-continue')).toHaveCount(0)

    await page.goto(`${harnessRootUrl}?scenario=unavailable`)
    await expect(page.locator('.hub-continue')).toHaveCount(0)
  })

  test('renders incomplete active-focus suggestion and supports keyboard activation', async ({ page }) => {
    await page.goto(`${harnessRootUrl}?scenario=incomplete`)

    const card = page.locator('.hub-continue')
    await expect(card).toBeVisible()
    await expect(card).toHaveAttribute('data-continue-kind', 'resumeInProgress')
    await expect(card).toHaveAttribute('data-year-month', '2026-10')
    await expect(card).toHaveAttribute('data-preserves-formal-focus', 'true')
    await expect(card.getByText('Active Focus')).toBeVisible()
    await expect(card.getByRole('heading', { name: 'Steadfast Hope in Every Season and Trial' })).toBeVisible()

    // Ensure no backlog, streak, or achievement pressure text
    const cardText = (await card.textContent()) ?? ''
    expect(cardText.toLowerCase()).not.toContain('streak')
    expect(cardText.toLowerCase()).not.toContain('missed')
    expect(cardText.toLowerCase()).not.toContain('backlog')

    // Touch target >= 44x44
    const resumeBtn = card.getByRole('button', { name: /Continue Your Study: Steadfast Hope/i })
    const viewMonthBtn = card.getByRole('button', { name: 'View October 2026' })
    const resumeBox = await resumeBtn.boundingBox()
    const viewMonthBox = await viewMonthBtn.boundingBox()
    expect(resumeBox?.height).toBeGreaterThanOrEqual(44)
    expect(resumeBox?.width).toBeGreaterThanOrEqual(44)
    expect(viewMonthBox?.height).toBeGreaterThanOrEqual(44)
    expect(viewMonthBox?.width).toBeGreaterThanOrEqual(44)

    // Keyboard navigation and Enter / Space activation
    await page.keyboard.press('Tab')
    await expect(resumeBtn).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('continue-callback')).toHaveText('2026-10:cms:oct-5:resumeInProgress')

    await page.keyboard.press('Tab')
    await expect(viewMonthBtn).toBeFocused()
    await page.keyboard.press('Space')
    await expect(page.getByTestId('open-month-callback')).toHaveText('2026-10')
  })

  test('renders Review This Month for the completed focus and reflows cleanly on narrow mobile viewports', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await page.goto(`${harnessRootUrl}?scenario=completed-focus`)

    const card = page.locator('.hub-continue')
    await expect(card).toBeVisible()
    await expect(card).toHaveAttribute('data-continue-kind', 'reviewFocusMonth')
    await expect(card).toHaveAttribute('data-year-month', '2026-10')
    await expect(card).toHaveAttribute('data-preserves-formal-focus', 'true')
    await expect(card.getByRole('heading', { name: 'Walk in Gratitude' })).toBeVisible()

    // Zero horizontal overflow at 320px width
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth
    })
    expect(overflow).toBe(false)

    const review = card.getByRole('button', { name: 'Review This Month: October 2026' })
    await expect(card.getByRole('button')).toHaveCount(1)
    await review.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('open-month-callback')).toHaveText('2026-10')
    await expect(page.getByTestId('continue-callback')).toBeEmpty()
  })
})
