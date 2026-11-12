import { test, expect } from '../smoke/helpers/frameSafeTest'
import { createServer, type ViteDevServer } from 'vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PARTICIPATION_STORAGE_KEY = 'bibleberry-reader-participation-v1'
const PREFS_STORAGE_KEY = 'bibleberry-card-announcement-prefs-v1'
const TINY_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aW0cAAAAASUVORK5CYII=',
  'base64',
)

let viteServer: ViteDevServer | null = null
let baseUrl = ''

test.describe('R14-6 Hub-Only Combined Earned Scripture Card Announcements', () => {
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
      throw new Error('Failed to start Vite dev server for announcement harness')
    }
    baseUrl = `http://127.0.0.1:${address.port}/tests/announcements/harness/index.html`
  })

  test.afterAll(async () => {
    await viteServer?.close()
    viteServer = null
  })

  test.beforeEach(async ({ page }) => {
    uncaughtErrors = []
    page.on('pageerror', err => uncaughtErrors.push(err))
    await page.route('https://cdn.sanity.io/images/**', route =>
      route.fulfill({ status: 200, contentType: 'image/png', body: TINY_PNG_BUFFER }),
    )
  })

  test.afterEach(() => {
    expect(uncaughtErrors).toEqual([])
  })

  test('defers non-Hub awards across reload, presents one combined batch on Hub arrival, freezes batch on concurrent award, and preserves cardViewed independence', async ({ page }) => {
    await page.goto(`${baseUrl}?surface=month`)
    await expect(page.getByRole('heading', { name: 'Hub Card Announcement Harness' })).toBeVisible()

    // Earn Award 1 and Award 2 while on Month Screen -> NO dialog opens
    await page.getByRole('button', { name: 'Earn Award 1' }).click()
    await page.getByRole('button', { name: 'Earn Award 2' }).click()
    await expect(page.getByTestId('pending-count')).toContainText('2')
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // Opening Award 1 on Month Screen marks cardViewed=true without acknowledging Hub announcement
    await page.getByRole('button', { name: 'Mark Award 1 Viewed' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // Navigating across Shelf, Library, and Challenge must NOT open the announcement
    await page.getByRole('button', { name: 'Go to Shelf' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.getByRole('button', { name: 'Go to Library' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.getByRole('button', { name: 'Go to Challenge' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // Reloading onto a non-Hub surface preserves pending awards across sessions
    await page.reload()
    await expect(page.getByTestId('pending-count')).toContainText('2')
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // Arrive at Hub -> ONE combined announcement renders both cards & keeps ministry News distinct
    const arriveBtn = page.getByRole('button', { name: 'Arrive at Hub' })
    await arriveBtn.focus()
    await arriveBtn.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('2 New Scripture Cards Earned')
    await expect(dialog).toContainText('A Light for the Path')
    await expect(dialog).toContainText('The Bread of Life')
    await expect(page.getByLabel('Ministry announcement')).toBeVisible()

    // Verify images loaded cleanly and no dead Field Notebook control is rendered
    const imageLoaded = await dialog
      .locator('img')
      .first()
      .evaluate((img: HTMLImageElement) => img.naturalWidth > 0)
    expect(imageLoaded).toBe(true)
    await expect(dialog.getByRole('button', { name: /Field Notebook/i })).toHaveCount(0)

    // Award 3 (no art) arrives WHILE the dialog is open -> frozen batch stays at 2 items!
    await page
      .getByRole('button', { name: 'Earn Award 3 (No Art)' })
      .evaluate(el => (el as HTMLButtonElement).click())
    await expect(dialog.locator('.hub-card-announcement__item')).toHaveCount(2)
    await expect(dialog).not.toContainText('Full-Month Scripture Card')

    // Keyboard focus trap: Dismiss button focused initially; Tab and Shift+Tab stay inside dialog
    const dismissBtn = dialog.getByRole('button', { name: 'Dismiss' })
    const closeBtn = dialog.getByRole('button', { name: /Close earned Scripture Card announcement/i })
    await expect(dismissBtn).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(closeBtn).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(dismissBtn).toBeFocused()
    const focusInside = await dialog.evaluate(el => el.contains(document.activeElement))
    expect(focusInside).toBe(true)

    // Explicit dismissal via Escape acknowledges ONLY the 2 shown IDs, restores focus, and leaves Award 3 pending
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(arriveBtn).toBeFocused()
    await expect(page.getByTestId('pending-count')).toContainText('1')
    await expect(page.getByLabel('Ministry announcement')).toBeVisible()

    const storedAfterDismiss = await page.evaluate(storageKey => {
      return JSON.parse(window.localStorage.getItem(storageKey) ?? 'null')?.data?.earnedAwards
    }, PARTICIPATION_STORAGE_KEY)
    expect(storedAfterDismiss['card:monthly:2026-11:light-path'].hubAnnouncementAcked).toBe(true)
    expect(storedAfterDismiss['card:monthly:2026-11:light-path'].cardViewed).toBe(true)
    expect(storedAfterDismiss['card:monthly:2026-11:bread-of-life'].hubAnnouncementAcked).toBe(true)
    expect(storedAfterDismiss['card:monthly:2026-11:bread-of-life'].cardViewed).toBe(false)
    expect(storedAfterDismiss['card:monthly:2026-11:full-month'].hubAnnouncementAcked).toBe(false)
    expect(storedAfterDismiss['card:monthly:2026-11:full-month'].cardViewed).toBe(false)

    // Returning to Month Screen then coming back to Hub surfaces Award 3 gracefully with no art
    await page.getByRole('button', { name: 'Go to Month Screen' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.getByRole('button', { name: 'Arrive at Hub' }).click()

    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('New Scripture Card Earned')
    await expect(dialog).toContainText('Full-Month Scripture Card')
    await expect(dialog).toContainText('November 2026')
    await expect(dialog.locator('img')).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Dismiss' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId('pending-count')).toContainText('0')
  })

  test('supports opt-out persistence across reload, catch-up on re-enable at next Hub entry, reduced motion, and 375px large-text mobile layout', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`${baseUrl}?surface=month&large=1`)

    const toggle = page.getByRole('switch', { name: 'Earned Scripture Card announcements' })
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'false')

    // Earn Award 1 and Award 2 while opted out, then reload directly onto Hub
    await page.getByRole('button', { name: 'Earn Award 1' }).click()
    await page.getByRole('button', { name: 'Earn Award 2' }).click()

    await page.goto(`${baseUrl}?surface=hub&large=1`)
    await expect(page.getByRole('switch', { name: 'Earned Scripture Card announcements' })).toHaveAttribute('aria-checked', 'false')
    await expect(page.getByTestId('pending-count')).toContainText('2')
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // Re-enable on Hub -> does not pop up mid-toggle; waits for next Hub entry
    await page.getByRole('switch', { name: 'Earned Scripture Card announcements' }).click()
    await expect(page.getByRole('switch', { name: 'Earned Scripture Card announcements' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByRole('dialog')).toHaveCount(0)

    const savedPref = await page.evaluate(key => JSON.parse(window.localStorage.getItem(key) ?? 'null'), PREFS_STORAGE_KEY)
    expect(savedPref).toEqual({
      schemaVersion: 1,
      earnedCardAnnouncementsEnabled: true,
    })

    // Leave Hub to Month Screen and return -> one combined catch-up announcement opens
    await page.getByRole('button', { name: 'Go to Month Screen' }).click()
    await page.getByRole('button', { name: 'Arrive at Hub' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('2 New Scripture Cards Earned')

    // Verify reduced motion disables backdrop blur and 375px large-text has no horizontal overflow
    const backdropFilter = await page
      .locator('.hub-card-announcement__backdrop')
      .evaluate(el => getComputedStyle(el).backdropFilter)
    expect(backdropFilter).toBe('none')

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    )
    expect(overflow).toBe(false)
  })

  test('handles broken Card image URLs, failed acknowledgment retry, and real Field Notebook destination routing', async ({ page }) => {
    await page.route('https://cdn.sanity.io/images/**', route =>
      route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not Found' }),
    )

    await page.goto(`${baseUrl}?surface=month&notebook=1`)
    await page.getByRole('button', { name: 'Earn Award 1' }).click()
    await page.getByRole('button', { name: 'Arrive at Hub' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    // Broken image falls back cleanly without breaking card text
    await expect(dialog.locator('img')).toHaveCount(0)
    await expect(dialog).toContainText('A Light for the Path')
    await expect(dialog).toContainText('Psalm 119:105 (WEBP)')

    // Simulate storage write failure during acknowledgment
    await page.evaluate(() => {
      const originalSetItem = Storage.prototype.setItem
      ;(window as unknown as { __restoreSetItem?: typeof Storage.prototype.setItem }).__restoreSetItem = originalSetItem
      Storage.prototype.setItem = () => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError')
      }
    })

    await dialog.getByRole('button', { name: 'Dismiss' }).click()
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('alert')).toContainText('Could not save announcement acknowledgment')

    // Restore storage and click Retry saving -> succeeds and closes dialog
    await page.evaluate(() => {
      const win = window as unknown as { __restoreSetItem?: typeof Storage.prototype.setItem }
      if (win.__restoreSetItem) {
        Storage.prototype.setItem = win.__restoreSetItem
      }
    })
    await dialog.getByRole('button', { name: 'Retry saving' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId('pending-count')).toContainText('0')

    // Earn Award 2 on Month Screen, return to Hub, and navigate via real Field Notebook action
    await page.getByRole('button', { name: 'Go to Month Screen' }).click()
    await page.getByRole('button', { name: 'Earn Award 2' }).click()
    await page.getByRole('button', { name: 'Arrive at Hub' }).click()

    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Open Field Notebook' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId('notebook-destination')).toBeVisible()
    await expect(page.getByTestId('pending-count')).toContainText('0')
  })
})
