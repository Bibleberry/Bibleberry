import { test, expect } from '../smoke/helpers/frameSafeTest'
import { createServer, type ViteDevServer } from 'vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

let viteServer: ViteDevServer | null = null
let harnessRootUrl = ''

test.describe('Phase 05 / R08-4: Standalone Shelf Reader Surface', () => {
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
      throw new Error('Failed to start Vite dev server for Shelf test harness')
    }
    harnessRootUrl = `http://127.0.0.1:${address.port}/tests/shelfUI/harness/index.html`
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

  test('empty state renders 0 slots (no three mandatory placeholders) and excludes current/future months', async ({ page }) => {
    await page.goto(`${harnessRootUrl}?scenario=empty`)

    await expect(page.getByRole('heading', { name: 'Shelf', level: 1 })).toBeVisible()
    await expect(page.getByText('0 of 3 months on Shelf')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Your Shelf is Empty' })).toBeVisible()
    await expect(page.locator('.shelf-card')).toHaveCount(0)

    // Current (2026-11) and future (2026-12) months must never appear
    await expect(page.getByText('Current Month Should Not Appear')).toHaveCount(0)
    await expect(page.getByText('Future Month Should Not Appear')).toHaveCount(0)

    // Library picker boundary callback
    await page.getByRole('button', { name: 'Browse Library to Add a Month' }).click()
    await expect(page.getByTestId('library-picker-calls')).toHaveText('1')

    // Adding a historical month transitions cleanly from 0 -> 1
    await page.getByRole('button', { name: 'Add October 2026 to Shelf' }).click()
    await expect(page.locator('.shelf-card')).toHaveCount(1)
    await expect(page.getByText('1 of 3 month on Shelf')).toBeVisible()
    await expect(page.getByText('Saved to Shelf · Protected')).toBeVisible()
  })

  test('1- and 2-month states show protected vs auto-admitted status and allow protecting auto-admitted month', async ({ page }) => {
    await page.goto(`${harnessRootUrl}?scenario=two-months`)

    await expect(page.locator('.shelf-card')).toHaveCount(2)
    await expect(page.getByText('2 of 3 months on Shelf')).toBeVisible()

    const octCard = page.locator('.shelf-card[data-year-month="2026-10"]')
    const sepCard = page.locator('.shelf-card[data-year-month="2026-09"]')

    await expect(octCard).toHaveAttribute('data-admission-kind', 'autoAdmitted')
    await expect(octCard).toHaveAttribute('data-protected', 'false')
    await expect(octCard.getByText('Added at rollover')).toBeVisible()

    await expect(sepCard).toHaveAttribute('data-admission-kind', 'readerSelected')
    await expect(sepCard).toHaveAttribute('data-protected', 'true')
    await expect(sepCard.getByText('Saved to Shelf · Protected')).toBeVisible()
    await expect(sepCard.getByText('Active Study Focus')).toBeVisible()

    // Protect the auto-admitted October 2026 month
    await octCard.getByRole('button', { name: 'Keep October 2026 on Shelf (protect from rollover)' }).click()
    await expect(octCard).toHaveAttribute('data-protected', 'true')
    await expect(octCard.getByText('Added at rollover · Protected')).toBeVisible()
  })

  test('capacity overflow requires explicit replacement choice and never silently evicts protected months', async ({ page }) => {
    await page.goto(`${harnessRootUrl}?scenario=three-months-mixed`)

    await expect(page.locator('.shelf-card')).toHaveCount(3)
    await expect(page.getByText('Shelf full · 3 of 3 months')).toBeVisible()

    // Attempt to add July 2026 when Shelf is full
    await page.getByRole('button', { name: 'Add July 2026 to Shelf' }).click()

    const dialog = page.getByRole('dialog', { name: 'Choose a Month to Replace' })
    await expect(dialog).toBeVisible()

    // Confirm button disabled until an explicit choice is made
    const confirmBtn = dialog.getByRole('button', { name: 'Replace Selected Month' })
    await expect(confirmBtn).toBeDisabled()

    // Escape cancels without modifying Shelf
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    await expect(page.locator('.shelf-card[data-year-month="2026-07"]')).toHaveCount(0)

    // Re-open and explicitly choose August 2026 to replace
    await page.getByRole('button', { name: 'Add July 2026 to Shelf' }).click()
    await expect(dialog).toBeVisible()
    await dialog.getByLabel(/August 2026/).check()
    await expect(confirmBtn).toBeEnabled()
    await confirmBtn.click()

    await expect(dialog).not.toBeVisible()
    await expect(page.locator('.shelf-card')).toHaveCount(3)
    await expect(page.locator('.shelf-card[data-year-month="2026-08"]')).toHaveCount(0)
    await expect(page.locator('.shelf-card[data-year-month="2026-07"]')).toHaveCount(1)
  })

  test('Put Away of Active Focus requires a keyboard-operable choice and restores focus', async ({ page }) => {
    await page.goto(`${harnessRootUrl}?scenario=three-months-mixed`)

    // Open October 2026
    await page.getByRole('button', { name: 'Open October 2026: Walk in Gratitude' }).click()
    await expect(page.getByTestId('opened-month')).toHaveText('2026-10')

    const trigger = page.getByRole('button', { name: 'Put away October 2026 from Shelf' })
    await trigger.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Put Away Active Focus' })
    const close = dialog.getByRole('button', { name: 'Close dialog' })
    const cancel = dialog.getByRole('button', { name: 'Cancel', exact: true })
    const confirm = dialog.getByRole('button', { name: 'Confirm Put Away' })
    await expect(close).toBeFocused()
    await expect(confirm).toBeDisabled()
    await expect(dialog.getByRole('radio', { checked: true })).toHaveCount(0)
    await page.keyboard.press('Shift+Tab')
    await expect(cancel).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(close).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()
    await expect(page.locator('.shelf-card')).toHaveCount(3)
    await expect(page.locator('.shelf-card[data-year-month="2026-10"]').getByText('Active Study Focus')).toBeVisible()

    await page.keyboard.press('Enter')
    await expect(close).toBeFocused()
    await page.keyboard.press('Tab')
    const september = dialog.getByRole('radio', { name: /September 2026/ })
    await expect(september).toBeFocused()
    await page.keyboard.press('Space')
    await expect(september).toBeChecked()
    await expect(confirm).toBeEnabled()
    await confirm.focus()
    await page.keyboard.press('Enter')
    await expect(dialog).toBeHidden()
    await expect(page.locator('.shelf-card')).toHaveCount(2)
    await expect(page.locator('.shelf-card[data-year-month="2026-10"]')).toHaveCount(0)
    await expect(page.locator('.shelf-card[data-year-month="2026-09"]').getByText('Active Study Focus')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Shelf', level: 1 })).toBeFocused()

    // Exit callback works
    await page.getByRole('button', { name: 'Back to Hub' }).click()
    await expect(page.getByTestId('exit-calls')).toHaveText('1')
  })

  test('replacing Active Focus offers only remaining months and resets the choice when the slot changes', async ({ page }) => {
    await page.goto(`${harnessRootUrl}?scenario=three-months-mixed`)
    const trigger = page.getByRole('button', { name: 'Add July 2026 to Shelf' })
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: 'Choose a Month to Replace' })
    const slots = dialog.getByRole('group', { name: 'Current Shelf months' })
    const focus = dialog.getByRole('group', { name: 'Choose your Active Focus' })
    const confirm = dialog.getByRole('button', { name: 'Replace Selected Month' })
    const focusedSlot = slots.getByRole('radio', { name: /October 2026.*Active Focus/ })
    await focusedSlot.check()
    await expect(focus.getByRole('radio')).toHaveCount(3)
    await expect(focus.getByRole('radio', { name: /October|July/ })).toHaveCount(0)
    await expect(confirm).toBeDisabled()
    await focus.getByRole('radio', { name: /September 2026/ }).check()
    await expect(confirm).toBeEnabled()

    await slots.getByRole('radio', { name: /August 2026/ }).check()
    await expect(focus).toBeHidden()
    await expect(confirm).toBeEnabled()
    await focusedSlot.check()
    await expect(focus.getByRole('radio', { checked: true })).toHaveCount(0)
    await expect(confirm).toBeDisabled()
    await focus.getByRole('radio', { name: 'No focus for now' }).check()
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(trigger).toBeFocused()
    await expect(page.locator('.shelf-card[data-year-month="2026-10"]').getByText('Active Study Focus')).toBeVisible()
    await expect(page.locator('.shelf-card[data-year-month="2026-07"]')).toHaveCount(0)

    await trigger.click()
    await focusedSlot.check()
    await focus.getByRole('radio', { name: 'No focus for now' }).check()
    await confirm.click()
    await expect(dialog).toBeHidden()
    await expect(page.locator('.shelf-card')).toHaveCount(3)
    await expect(page.locator('.shelf-card[data-year-month="2026-10"]')).toHaveCount(0)
    await expect(page.locator('.shelf-card[data-year-month="2026-07"]')).toHaveAttribute('data-protected', 'true')
    await expect(page.getByText('Active Study Focus', { exact: true })).toHaveCount(0)
  })

  test('focus outside Shelf can be cleared and mobile reflow has no horizontal overflow or undersized targets', async ({ page }) => {
    await page.goto(`${harnessRootUrl}?scenario=focus-outside-shelf`)

    const focusBanner = page.getByRole('region', { name: 'Active study focus outside Shelf' })
    await expect(focusBanner).toBeVisible()
    await focusBanner.getByRole('button', { name: 'Clear Focus' }).click()
    await expect(focusBanner).not.toBeVisible()

    // Check no horizontal overflow on current viewport (covers Pixel 5 mobile project too)
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth
    })
    expect(overflow).toBe(false)

    // Verify all visible Shelf buttons meet minimum 44px touch target height
    const buttonHeights = await page.evaluate(() => {
      return Array.from(document.querySelectorAll<HTMLButtonElement>('.shelf-page button'))
        .filter(btn => btn.offsetParent !== null)
        .map(btn => btn.getBoundingClientRect().height)
    })
    for (const h of buttonHeights) {
      expect(h).toBeGreaterThanOrEqual(44)
    }
  })
})
