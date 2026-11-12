import { test, expect } from '../smoke/helpers/frameSafeTest'
import { createServer, type ViteDevServer } from 'vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PARTICIPATION_STORAGE_KEY = 'bibleberry-reader-participation-v1'

let viteServer: ViteDevServer | null = null
let baseUrl = ''

test.describe('R09-1 Saved Scripture Collection with Search and Durable Removal', () => {
  let uncaughtErrors: Error[] = []
  let externalApiRequests: string[] = []

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
      throw new Error('Failed to start Vite dev server for Saved Scripture harness')
    }
    baseUrl = `http://127.0.0.1:${address.port}/tests/savedScripture/harness/index.html`
  })

  test.afterAll(async () => {
    await viteServer?.close()
    viteServer = null
  })

  test.beforeEach(async ({ page }) => {
    uncaughtErrors = []
    externalApiRequests = []
    page.on('pageerror', err => uncaughtErrors.push(err))
    page.on('request', req => {
      const url = req.url()
      if (
        url.includes('sanity.io')
        || url.includes('/api/')
        || url.includes('bible')
      ) {
        if (!url.startsWith('http://127.0.0.1:')) {
          externalApiRequests.push(url)
        }
      }
    })
  })

  test.afterEach(() => {
    expect(uncaughtErrors).toEqual([])
    expect(externalApiRequests).toEqual([])
  })

  test('browses, inspects citation-only details, searches by spelling/translation/Unicode, and durably removes items across guest-store reload', async ({ page }) => {
    await page.goto(baseUrl)
    await expect(page.getByRole('heading', { name: 'Saved Scripture', level: 1 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'No Saved Scripture yet' })).toBeVisible()

    // Seed real V2 guest store data via defaultGuestParticipationStore
    await page.getByRole('button', { name: 'Seed V2 Guest Data' }).click()
    await expect(page.getByText('4 saved references')).toBeVisible()

    // Verify deterministic ordering: savedOn desc (2026-11-10 -> 2026-11-08 -> 2026-11-05),
    // with canonical key tie-break on equal dates (1 Thessalonians before Psalm 23)
    const cardHeadings = page.locator('.saved-scripture-card__reference')
    await expect(cardHeadings).toHaveCount(4)
    await expect(cardHeadings.nth(0)).toHaveText('Éxodo 14:14')
    await expect(cardHeadings.nth(1)).toHaveText('1 Thessalonians 5:16–18')
    await expect(cardHeadings.nth(2)).toHaveText('Psalm 23:1')
    await expect(cardHeadings.nth(3)).toHaveText('Song of Solomon 2:1')

    // Verify neutral unspecified translation display and zero links / passage text in DOM
    await expect(page.locator('.saved-scripture-card').nth(2)).toContainText('Translation unspecified')
    await expect(page.locator('.saved-scripture-page a[href]')).toHaveCount(0)

    // Open details dialog for 1 Thessalonians 5:16–18 (has sourceChallengeId provenance)
    const thessDetailsBtn = page.getByRole('button', {
      name: 'View details for 1 Thessalonians 5:16–18 (WEBP)',
    })
    await thessDetailsBtn.click()

    const detailsDialog = page.getByRole('dialog')
    await expect(detailsDialog).toBeVisible()
    await expect(detailsDialog).toContainText('1 Thessalonians 5:16–18')
    await expect(detailsDialog).toContainText('WEBP')
    await expect(detailsDialog).toContainText('November 8, 2026')
    await expect(detailsDialog).toContainText('Saved while reading a Bibleberry Challenge')
    await expect(detailsDialog).toContainText('Bible passage manuscript text, personal notes, and memorization plans are not stored or fetched here.')
    await expect(detailsDialog.locator('a[href]')).toHaveCount(0)
    await expect(detailsDialog).not.toContainText('Rejoice always')

    // Keyboard focus starts on Close button; Tab cycles inside dialog
    const closeBtn = detailsDialog.getByRole('button', { name: 'Close details for 1 Thessalonians 5:16–18' })
    const removeFromDetailsBtn = detailsDialog.getByRole('button', { name: 'Remove from Saved Scripture' })
    const doneBtn = detailsDialog.getByRole('button', { name: 'Done' })
    await expect(closeBtn).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(removeFromDetailsBtn).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(doneBtn).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(closeBtn).toBeFocused()

    // Initiate removal from Details -> Cancel -> returns to Details -> Escape closes Details & restores focus
    await removeFromDetailsBtn.click()
    const confirmDialog = page.getByRole('alertdialog')
    await expect(confirmDialog).toBeVisible()
    await expect(confirmDialog).toContainText('Remove 1 Thessalonians 5:16–18?')
    const keepBtn = confirmDialog.getByRole('button', { name: 'Keep reference' })
    await expect(keepBtn).toBeFocused()
    await keepBtn.click()
    await expect(confirmDialog).toHaveCount(0)
    await expect(detailsDialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(detailsDialog).toHaveCount(0)
    await expect(thessDetailsBtn).toBeFocused()
    await expect(cardHeadings).toHaveCount(4)

    // Search tests: book spelling, ordinal/abbreviation, Unicode NFD, translation, zero-matches
    const searchInput = page.getByRole('searchbox', { name: 'Search Saved Scripture' })
    await searchInput.fill('Psalms 23')
    await expect(cardHeadings).toHaveCount(1)
    await expect(cardHeadings.first()).toHaveText('Psalm 23:1')

    await searchInput.fill('1st Thess 5:16-18')
    await expect(cardHeadings).toHaveCount(1)
    await expect(cardHeadings.first()).toHaveText('1 Thessalonians 5:16–18')

    await searchInput.fill('Song of Songs')
    await expect(cardHeadings).toHaveCount(1)
    await expect(cardHeadings.first()).toHaveText('Song of Solomon 2:1')

    await searchInput.fill('e\u0301xodo 14')
    await expect(cardHeadings).toHaveCount(1)
    await expect(cardHeadings.first()).toHaveText('Éxodo 14:14')

    await searchInput.fill('webp')
    await expect(cardHeadings).toHaveCount(1)
    await expect(cardHeadings.first()).toHaveText('1 Thessalonians 5:16–18')

    await searchInput.fill('Revelation 22:21')
    await expect(page.getByRole('heading', { name: 'No matching Saved Scripture' })).toBeVisible()
    await page.getByRole('button', { name: 'Clear search', exact: true }).click()
    await expect(searchInput).toBeFocused()
    await expect(cardHeadings).toHaveCount(4)

    // List Remove -> Cancel preserves item & restores focus to Remove button
    const removeThessBtn = page.getByRole('button', {
      name: 'Remove 1 Thessalonians 5:16–18 (WEBP) from Saved Scripture',
    })
    await removeThessBtn.click()
    await expect(confirmDialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(confirmDialog).toHaveCount(0)
    await expect(removeThessBtn).toBeFocused()
    await expect(cardHeadings).toHaveCount(4)

    // Confirm removal -> updates list, announces politely, recovers focus to next item (Psalm 23:1),
    // preserves unrelated completedChallenges / earnedAwards / other saves, and survives reload
    await removeThessBtn.click()
    await confirmDialog.getByRole('button', { name: 'Remove reference' }).click()
    await expect(confirmDialog).toHaveCount(0)
    await expect(cardHeadings).toHaveCount(3)
    await expect(page.locator('.sr-only[role="status"]')).toContainText('Removed 1 Thessalonians 5:16–18 from Saved Scripture.')

    const psalmDetailsBtn = page.getByRole('button', { name: 'View details for Psalm 23:1' })
    await expect(psalmDetailsBtn).toBeFocused()

    await expect(page.getByTestId('completed-count')).toContainText('Completed: 1')
    await expect(page.getByTestId('awards-count')).toContainText('Awards: 1')

    // Reload browser and confirm V2 guest store persisted exact remaining 3 citations & unrelated data
    await page.reload()
    await expect(page.locator('.saved-scripture-card__reference')).toHaveCount(3)
    await expect(page.locator('.saved-scripture-card__reference').nth(0)).toHaveText('Éxodo 14:14')
    await expect(page.locator('.saved-scripture-card__reference').nth(1)).toHaveText('Psalm 23:1')
    await expect(page.locator('.saved-scripture-card__reference').nth(2)).toHaveText('Song of Solomon 2:1')
    await expect(page.getByTestId('completed-count')).toContainText('Completed: 1')
    await expect(page.getByTestId('awards-count')).toContainText('Awards: 1')

    const stored = await page.evaluate(key => JSON.parse(window.localStorage.getItem(key) ?? 'null'), PARTICIPATION_STORAGE_KEY)
    expect(stored?.schemaVersion).toBe(2)
    expect(stored?.data?.savedScriptures).toHaveLength(3)
    expect(Object.keys(stored?.data?.earnedAwards ?? {})).toHaveLength(1)
    expect(Object.keys(stored?.data?.completedChallenges ?? {})).toHaveLength(1)
  })

  test('handles storage write failure during removal with accessible alert and retry recovery', async ({ page }) => {
    await page.goto(baseUrl)
    await page.getByRole('button', { name: 'Seed V2 Guest Data' }).click()
    await expect(page.locator('.saved-scripture-card')).toHaveCount(4)

    // Inject QuotaExceededError on setItem
    await page.evaluate(() => {
      const orig = Storage.prototype.setItem
      ;(window as unknown as { __origSetItem?: typeof Storage.prototype.setItem }).__origSetItem = orig
      Storage.prototype.setItem = () => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError')
      }
    })

    await page.getByRole('button', { name: 'Remove Éxodo 14:14 (RVR1960) from Saved Scripture' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remove reference' }).click()

    const alert = page.locator('.saved-scripture-alert[role="alert"]')
    await expect(alert).toBeVisible()
    await expect(alert).toContainText('Could not write your latest Saved Scripture change')

    // Restore storage and retry
    await page.evaluate(() => {
      const win = window as unknown as { __origSetItem?: typeof Storage.prototype.setItem }
      if (win.__origSetItem) {
        Storage.prototype.setItem = win.__origSetItem
      }
    })
    await alert.getByRole('button', { name: 'Retry saving' }).click()
    await expect(alert).toHaveCount(0)

    await page.reload()
    await expect(page.locator('.saved-scripture-card')).toHaveCount(3)
  })

  test('renders pure synthetic fixture view across loading, readError, long references/translations, reduced motion, and 320px/375px mobile viewports', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 320, height: 640 })

    // Loading state
    await page.goto(`${baseUrl}?mode=pure&status=loading`)
    await expect(page.getByRole('heading', { name: 'Loading Saved Scripture…' })).toBeVisible()

    // Read error state
    await page.goto(`${baseUrl}?mode=pure&status=readError`)
    await expect(page.getByRole('alert')).toContainText('Saved Scripture could not be loaded safely')

    // Ready state with long references/translations and large text on 320px viewport
    await page.goto(`${baseUrl}?mode=pure&large=1`)
    const cards = page.locator('.saved-scripture-card')
    await expect(cards).toHaveCount(3)
    await expect(cards.first()).toContainText('1 Chronicles 16:8–36; Psalm 105:1–15')
    await expect(cards.first()).toContainText('New Revised Standard Version Updated Edition (NRSVue)')

    const overflow320 = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    )
    expect(overflow320).toBe(false)

    // Open details at 375px and verify reduced-motion disables backdrop blur and zero overflow
    await page.setViewportSize({ width: 375, height: 812 })
    await page.getByRole('button', {
      name: 'View details for 1 Chronicles 16:8–36; Psalm 105:1–15 (New Revised Standard Version Updated Edition (NRSVue))',
    }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    const backdropFilter = await page
      .locator('.saved-scripture-dialog__backdrop')
      .evaluate(el => getComputedStyle(el).backdropFilter)
    expect(backdropFilter).toBe('none')

    const overflow375 = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    )
    expect(overflow375).toBe(false)

    // Removing the last remaining items transitions cleanly to empty state and focuses empty heading
    await page.keyboard.press('Escape')
    for (const label of [
      'Remove 1 Chronicles 16:8–36; Psalm 105:1–15 (New Revised Standard Version Updated Edition (NRSVue)) from Saved Scripture',
      'Remove 1 Thessalonians 5:16–18 (WEBP) from Saved Scripture',
      'Remove Psalm 23:1 from Saved Scripture',
    ]) {
      await page.getByRole('button', { name: label }).click()
      await page.getByRole('alertdialog').getByRole('button', { name: 'Remove reference' }).click()
    }
    const emptyHeading = page.getByRole('heading', { name: 'No Saved Scripture yet' })
    await expect(emptyHeading).toBeVisible()
    await expect(emptyHeading).toBeFocused()
  })
})
