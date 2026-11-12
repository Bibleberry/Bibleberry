import { test, expect } from '../smoke/helpers/frameSafeTest'
import { createServer, type ViteDevServer } from 'vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const TINY_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aW0cAAAAASUVORK5CYII=',
  'base64',
)

let viteServer: ViteDevServer | null = null
let baseUrl = ''

test.describe('Issue #130: Standalone News Reader View and Security Invariants', () => {
  let pageErrors: Error[] = []
  let directSanityRequests: string[] = []

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
      throw new Error('Failed to start Vite dev server for news harness')
    }
    baseUrl = `http://127.0.0.1:${address.port}/tests/news/harness/index.html`
  })

  test.afterAll(async () => {
    await viteServer?.close()
    viteServer = null
  })

  test.beforeEach(async ({ page }) => {
    pageErrors = []
    directSanityRequests = []

    page.on('pageerror', error => pageErrors.push(error))
    page.on('request', request => {
      const url = request.url()
      if (url.includes('sanity.io') && !url.includes('cdn.sanity.io/images')) {
        directSanityRequests.push(url)
      }
    })

    // Mock cdn.sanity.io image assets to return a clean 1x1 png
    await page.route('https://cdn.sanity.io/images/**', route =>
      route.fulfill({ status: 200, contentType: 'image/png', body: TINY_PNG_BUFFER }),
    )
  })

  test.afterEach(() => {
    expect(pageErrors).toEqual([])
    expect(directSanityRequests).toEqual([])
  })

  test('renders properly at narrow screen (320px) and 200% zoom without horizontal overflow or clipping', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    await page.goto(`${baseUrl}?scenario=standard`)

    // Verify main header and initial articles
    const mainHeading = page.locator('#news-main-title')
    await expect(mainHeading).toHaveText('Ministry News')

    // Apply 200% font zoom
    await page.addStyleTag({
      content: 'html { font-size: 200% !important; }',
    })

    // Allow reflow
    await page.waitForTimeout(300)

    // Ensure no horizontal overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
    })
    expect(hasHorizontalOverflow).toBe(false)

    // Ensure articles are visible and readable
    const articles = page.locator('.news-card')
    await expect(articles).toHaveCount(3)

    const firstTitle = articles.first().locator('.news-card__title')
    await expect(firstTitle).toBeVisible()
    await expect(firstTitle).toContainText('Autumn Translation and Study Progress')
  })

  test('enforces blocked external link/href behavior inside article body', async ({ page }) => {
    await page.goto(`${baseUrl}?scenario=standard`)

    const blockedLink = page.locator('[data-blocked-external-link="true"]').first()
    await expect(blockedLink).toBeVisible()
    await expect(blockedLink).toHaveAttribute('role', 'link')
    await expect(blockedLink).toHaveAttribute('aria-disabled', 'true')
    await expect(blockedLink).toContainText('disallowed external reference link')

    const currentUrl = page.url()

    // Clicking blocked link (with force: true to bypass Playwright's aria-disabled actionability check) must not navigate away
    await blockedLink.click({ force: true })
    expect(page.url()).toBe(currentUrl)

    // Pressing Enter on blocked link must not navigate
    await blockedLink.focus()
    await page.keyboard.press('Enter')
    expect(page.url()).toBe(currentUrl)
  })

  test('supports safe internal navigation for monthly preview without leaking discoveries or unreleased manuscripts', async ({
    page,
  }) => {
    await page.goto(`${baseUrl}?scenario=standard`)

    // Find monthly preview card
    const previewCard = page.locator('.news-card', { hasText: 'Advance Preview: December 2026' })
    await expect(previewCard).toBeVisible()

    // Monthly preview must NOT contain full body or cover image
    await expect(previewCard.locator('.news-card__body-container')).toHaveCount(0)
    await expect(previewCard.locator('.news-card__cover')).toHaveCount(0)

    // Click safe navigation button
    const previewButton = previewCard.locator('.news-card__destination-button')
    await expect(previewButton).toBeVisible()
    await expect(previewButton).toContainText('Preview December 2026')

    await previewButton.click()

    // Verify internal navigation event was triggered with correct month destination
    const navOutput = page.locator('#harness-nav-output')
    await expect(navOutput).toHaveAttribute('data-destination', 'month:2026-12')
  })

  test('supports keyboard navigation across category tabs with Arrow keys and updates active category', async ({
    page,
  }) => {
    await page.goto(`${baseUrl}?scenario=standard`)

    const allTab = page.locator('#news-tab-all')
    const updateTab = page.locator('#news-tab-ministryUpdate')
    const announcementTab = page.locator('#news-tab-announcement')
    const previewTab = page.locator('#news-tab-monthlyPreview')

    // Initial state: All News selected
    await expect(allTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('.news-card')).toHaveCount(3)

    // Focus All Tab and press ArrowRight -> moves to Ministry Updates
    await allTab.focus()
    await page.keyboard.press('ArrowRight')

    await expect(updateTab).toHaveAttribute('aria-selected', 'true')
    await expect(updateTab).toBeFocused()
    await expect(page.locator('.news-card')).toHaveCount(1)
    await expect(page.locator('.news-card__title')).toContainText('Autumn Translation and Study Progress')

    // Press ArrowRight again -> Announcements
    await page.keyboard.press('ArrowRight')
    await expect(announcementTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('.news-card')).toHaveCount(1)
    await expect(page.locator('.news-card__title')).toContainText('Publishing Calendar Reminder')

    // Press ArrowRight again -> Monthly Previews
    await page.keyboard.press('ArrowRight')
    await expect(previewTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('.news-card')).toHaveCount(1)
    await expect(page.locator('.news-card__title')).toContainText('Advance Preview: December 2026')
  })

  test('displays accessible empty state when category has no published articles', async ({ page }) => {
    await page.goto(`${baseUrl}?scenario=empty`)

    const emptyRegion = page.locator('.news-state--empty')
    await expect(emptyRegion).toBeVisible()
    await expect(emptyRegion).toHaveAttribute('role', 'status')
    await expect(emptyRegion).toHaveAttribute('aria-live', 'polite')
    await expect(emptyRegion.locator('.news-state__title')).toHaveText('No articles available')
  })

  test('displays accessible offline/error state with functional retry action', async ({ page }) => {
    // Start with simulated offline mode
    await page.goto(`${baseUrl}?scenario=offline`)

    // Initially in offline/error state
    const errorRegion = page.locator('.news-state--error')
    await expect(errorRegion).toBeVisible()
    await expect(errorRegion).toHaveAttribute('role', 'alert')
    await expect(errorRegion.locator('.news-state__title')).toContainText('Network')

    const retryBtn = errorRegion.locator('.news-state__retry-btn')
    await expect(retryBtn).toBeVisible()

    // Switch scenario to standard and click retry
    await page.locator('#btn-set-scenario-standard').click()
    await retryBtn.click()

    await expect(page.locator('.news-card')).toHaveCount(3)
  })

  test('omits gamification announcements, achievement badges, unread trackers, and push permission prompts', async ({
    page,
  }) => {
    await page.goto(`${baseUrl}?scenario=standard`)

    // No gamification badges
    await expect(page.locator('[data-badge]')).toHaveCount(0)
    await expect(page.locator('.badge')).toHaveCount(0)
    await expect(page.locator('.achievement')).toHaveCount(0)

    // No unread tracking dot or count
    await expect(page.locator('.unread-dot')).toHaveCount(0)
    await expect(page.locator('[aria-label*="unread"]')).toHaveCount(0)

    // No push permission request
    await expect(page.locator('button:has-text("Enable Notifications")')).toHaveCount(0)
    await expect(page.locator('button:has-text("Allow Push")')).toHaveCount(0)

    // No fabricated "Newly Released" banner
    await expect(page.locator('text="Newly Released"')).toHaveCount(0)
  })
})
