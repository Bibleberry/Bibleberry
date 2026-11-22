import { test, expect } from '../smoke/helpers/frameSafeTest'
import { createServer, type ViteDevServer } from 'vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

let viteServer: ViteDevServer | null = null
let harnessRootUrl = ''

const GUILT_PATTERN = /\b(behind|missed|catch\s*up|streak|overdue)\b/i

test.describe('Juniper Signal (#289): R06 Functional Shelf-Centered Library Landing', () => {
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
      throw new Error('Failed to start Vite dev server for R06 Library test harness')
    }
    harnessRootUrl = `http://127.0.0.1:${address.port}/tests/r06Library/harness/index.html`
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

  for (const capacity of [0, 1, 2, 3] as const) {
    test(`capacity ${capacity}: shows exact Shelf cards, persistent Browse All Months & Foundations entrances`, async ({
      page,
    }) => {
      await page.goto(`${harnessRootUrl}?scenario=capacity-${capacity}`)

      await expect(page.getByRole('heading', { name: 'Shelf', level: 1 })).toBeVisible()
      await expect(page.locator('.shelf-card')).toHaveCount(capacity)

      if (capacity === 0) {
        await expect(page.getByText('Your Shelf is Empty')).toBeVisible()
        const bodyText = (await page.locator('.r06-library-landing').textContent()) ?? ''
        expect(GUILT_PATTERN.test(bodyText)).toBe(false)
      } else {
        await expect(page.locator('.shelf-card[data-year-month="2026-10"]')).toContainText(
          'Walk in Gratitude',
        )
      }

      // Persistent Browse All Months and Foundations actions are visible & enabled at every capacity
      const browseAllBtn = page.getByTestId('r06-library-entrance-browse-all-months')
      const foundationsBtn = page.getByTestId('r06-library-entrance-foundations')
      await expect(browseAllBtn).toBeVisible()
      await expect(browseAllBtn).toBeEnabled()
      await expect(browseAllBtn).toContainText('Browse All Months')
      await expect(foundationsBtn).toBeVisible()
      await expect(foundationsBtn).toBeEnabled()
      await expect(foundationsBtn).toContainText('Foundations')

      // Foundations directly invokes callback from Shelf landing
      await foundationsBtn.click()
      await expect(page.getByTestId('foundations-calls')).toHaveText('1')

      // Switch to Browse All Months via persistent entrance
      await browseAllBtn.click()
      await expect(page.getByRole('heading', { name: 'Historical Library', level: 1 })).toBeVisible()
      await expect(page.locator('.library-card')).toHaveCount(3)

      // Foundations remains directly available on Browse All Months; Your Shelf returns cleanly
      const yourShelfBtn = page.getByTestId('r06-library-entrance-shelf-overview')
      await expect(yourShelfBtn).toBeVisible()
      await expect(yourShelfBtn).toContainText(`${capacity} of 3`)
      await page.getByTestId('r06-library-entrance-foundations').click()
      await expect(page.getByTestId('foundations-calls')).toHaveText('2')

      await yourShelfBtn.click()
      await expect(page.getByRole('heading', { name: 'Shelf', level: 1 })).toBeVisible()
      await expect(page.locator('.shelf-card')).toHaveCount(capacity)
    })
  }

  test('passes accurate shelf/library origin callbacks and blocks current, future, and unauthorized months', async ({
    page,
  }) => {
    await page.goto(`${harnessRootUrl}?scenario=current-month-tainted`)

    // Current (2026-11) and future (2026-12) never occupy a Shelf slot
    await expect(page.locator('.shelf-card')).toHaveCount(1)
    await expect(page.locator('.shelf-card[data-year-month="2026-10"]')).toBeVisible()
    await expect(page.locator('.shelf-card[data-year-month="2026-11"]')).toHaveCount(0)
    await expect(page.locator('.shelf-card[data-year-month="2026-12"]')).toHaveCount(0)

    // Open authorized month from Shelf -> origin: 'shelf'
    await page.getByRole('button', { name: /Open October 2026/ }).click()
    await expect(page.getByTestId('opened-months')).toHaveText(
      JSON.stringify([{ yearMonth: '2026-10', origin: 'shelf' }]),
    )

    // In Browse All Months with tainted catalogue, current/future months cannot be added or opened
    await page.goto(`${harnessRootUrl}?scenario=unauthorized-catalogue`)
    await page.getByTestId('r06-library-entrance-browse-all-months').click()
    await expect(page.getByRole('heading', { name: 'Historical Library', level: 1 })).toBeVisible()

    await page.getByRole('button', { name: 'Add November 2026 to Shelf' }).click()
    await page.getByRole('button', { name: 'Add December 2026 to Shelf' }).click()
    await page.getByRole('button', { name: /Open November 2026/ }).click()
    await page.getByRole('button', { name: /Open December 2026/ }).click()

    await expect(page.getByTestId('opened-months')).toHaveText('[]')
    const shelfJson = await page.getByTestId('shelf-json').textContent()
    expect(JSON.parse(shelfJson ?? '{}').months).toEqual([])

    // Open authorized historical month from Library -> origin: 'library'
    await page.getByRole('button', { name: /Open September 2026/ }).click()
    await expect(page.getByTestId('opened-months')).toHaveText(
      JSON.stringify([{ yearMonth: '2026-09', origin: 'library' }]),
    )
  })

  test('retains Cedar Bridge Active Focus Put Away, Keep protection, full-Shelf replacement, and conditional writes', async ({
    page,
  }) => {
    await page.goto(`${harnessRootUrl}?scenario=capacity-3`)

    const progressBefore = await page.getByTestId('underlying-progress').textContent()

    // Keep on Shelf promotes auto-admitted October 2026 without altering focus
    const octCard = page.locator('.shelf-card[data-year-month="2026-10"]')
    await expect(octCard).toHaveAttribute('data-protected', 'false')
    await page.getByRole('button', { name: /Keep October 2026 on Shelf/ }).click()
    await expect(octCard).toHaveAttribute('data-protected', 'true')

    // Full-Shelf replacement of Active Focus month (2026-09) requires explicit focus choice
    await page.getByTestId('r06-library-entrance-browse-all-months').click()
    await page.getByRole('button', { name: 'Load more past months' }).click()
    await page.getByRole('button', { name: 'Add July 2026 to Shelf' }).click()

    const replaceDialog = page.getByRole('dialog')
    await expect(replaceDialog).toBeVisible()
    await replaceDialog
      .getByRole('group', { name: 'Current Shelf months' })
      .getByRole('radio', { name: /September 2026/ })
      .check()
    await replaceDialog
      .getByRole('group', { name: 'Choose your Active Focus' })
      .getByRole('radio', { name: /October 2026/ })
      .check()
    await replaceDialog.getByRole('button', { name: 'Replace Selected Month' }).click()
    await expect(replaceDialog).toBeHidden()
    await expect(page.getByTestId('last-expected-state')).toHaveText('present')

    // Back to Shelf: July 2026 added, October 2026 is now Active Focus
    await page.getByRole('button', { name: 'Back to Shelf' }).click()
    await expect(page.locator('.shelf-card[data-year-month="2026-07"]')).toBeVisible()
    await expect(page.locator('.shelf-card[data-year-month="2026-09"]')).toHaveCount(0)

    // Putting away the new Active Focus (2026-10) opens Cedar Bridge Put Away dialog
    await page.getByRole('button', { name: 'Put away October 2026 from Shelf' }).click()
    const putAwayDialog = page.getByRole('dialog')
    await expect(putAwayDialog).toBeVisible()

    // Cancel preserves Shelf state unchanged
    await putAwayDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(putAwayDialog).toBeHidden()
    await expect(page.locator('.shelf-card[data-year-month="2026-10"]')).toBeVisible()

    // Confirm Put Away with explicit "No focus for now"
    await page.getByRole('button', { name: 'Put away October 2026 from Shelf' }).click()
    await expect(putAwayDialog).toBeVisible()
    await putAwayDialog.getByRole('radio', { name: 'No focus for now' }).check()
    await putAwayDialog.getByRole('button', { name: 'Confirm Put Away' }).click()
    await expect(putAwayDialog).toBeHidden()
    await expect(page.locator('.shelf-card[data-year-month="2026-10"]')).toHaveCount(0)
    await expect(page.getByTestId('last-expected-state')).toHaveText('present')

    // Underlying participation progress untouched; no second Shelf store created in localStorage
    expect(await page.getByTestId('underlying-progress').textContent()).toEqual(progressBefore)
    await expect(page.getByTestId('local-storage-keys')).toHaveText('[]')
  })

  test('conditional write rejection surfaces stale confirmation notice without mutating Shelf', async ({
    page,
  }) => {
    await page.goto(`${harnessRootUrl}?scenario=conditional-write-rejection`)

    await page.getByRole('button', { name: 'Put away September 2026 from Shelf' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('radio', { name: 'No focus for now' }).check()
    await dialog.getByRole('button', { name: 'Confirm Put Away' }).click()

    await expect(page.getByRole('alert')).toContainText('Your Shelf changed. Review it and try again.')
    await expect(page.locator('.shelf-card[data-year-month="2026-09"]')).toBeVisible()
    await expect(page.getByTestId('state-change-count')).toHaveText('0')
  })

  test('controlled and uncontrolled surface boundaries preserve consistent Back behavior', async ({
    page,
  }) => {
    // Controlled mode
    await page.goto(`${harnessRootUrl}?scenario=controlled-surface`)
    await expect(page.getByRole('heading', { name: 'Shelf', level: 1 })).toBeVisible()

    await page.getByTestId('r06-library-entrance-browse-all-months').click()
    await expect(page.getByRole('heading', { name: 'Historical Library', level: 1 })).toBeVisible()
    await expect(page.getByTestId('surface-changes')).toHaveText(JSON.stringify(['library']))

    // Back to Shelf routes through single controlled callback
    await page.getByRole('button', { name: 'Back to Shelf' }).click()
    await expect(page.getByRole('heading', { name: 'Shelf', level: 1 })).toBeVisible()
    await expect(page.getByTestId('surface-changes')).toHaveText(
      JSON.stringify(['library', 'shelf']),
    )

    // External shell tab control switches to library and resets cleanly to shelf
    await page.getByTestId('shell-switch-to-library').click()
    await expect(page.getByRole('heading', { name: 'Historical Library', level: 1 })).toBeVisible()
    await page.getByTestId('shell-reset-to-shelf').click()
    await expect(page.getByRole('heading', { name: 'Shelf', level: 1 })).toBeVisible()

    // Uncontrolled starting on library with outer onExit
    await page.goto(`${harnessRootUrl}?scenario=uncontrolled-start-library`)
    await expect(page.getByRole('heading', { name: 'Historical Library', level: 1 })).toBeVisible()
    await page.getByRole('button', { name: 'Return to Today' }).click()
    await expect(page.getByTestId('exit-calls')).toHaveText('1')
  })

  test('reuses host loading, empty, request-error retry, validation-error, and stale Shelf states faithfully', async ({
    page,
  }) => {
    // Loading state when gateway calendar context is pending (deterministic gate)
    await page.goto(`${harnessRootUrl}?scenario=implicit-calendar-loading`)
    await expect(page.getByRole('status').getByText('Preparing your Shelf…')).toBeVisible()
    await page.getByTestId('resolve-calendar-load').click()
    await expect(page.getByRole('heading', { name: 'Shelf', level: 1 })).toBeVisible()
    await expect(page.locator('.shelf-card[data-year-month="2026-10"]')).toBeVisible()

    // Empty catalogue
    await page.goto(`${harnessRootUrl}?scenario=empty-catalogue`)
    await page.getByTestId('r06-library-entrance-browse-all-months').click()
    await expect(page.getByRole('heading', { name: 'No Historical Months Yet' })).toBeVisible()
    await page.getByTestId('r06-library-entrance-foundations').click()
    await expect(page.getByTestId('foundations-calls')).toHaveText('1')

    // Request error + Try Again recovery
    await page.goto(`${harnessRootUrl}?scenario=request-error`)
    await expect(page.getByRole('heading', { name: 'Unable to Load Library' })).toBeVisible()
    await page.getByRole('button', { name: 'Try Again' }).click()
    await expect(page.getByRole('heading', { name: 'Shelf', level: 1 })).toBeVisible()

    // Validation error (fail closed, no retry button, Foundations still reachable)
    await page.goto(`${harnessRootUrl}?scenario=validation-error`)
    await expect(page.getByRole('heading', { name: 'Library Catalogue Unavailable' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Try Again' })).toHaveCount(0)
    await page.getByTestId('r06-library-entrance-foundations').click()
    await expect(page.getByTestId('foundations-calls')).toHaveText('1')

    // Stale Shelf month omitted from live authorized catalogue cannot be opened
    await page.goto(`${harnessRootUrl}?scenario=stale-shelf-month`)
    await expect(page.locator('.shelf-card[data-year-month="2026-10"]')).toBeVisible()
    await page.getByRole('button', { name: /Open October 2026/ }).click()
    await expect(page.getByRole('alert')).toContainText(/no longer available/i)
    await expect(page.getByTestId('opened-months')).toHaveText('[]')
  })

  test('maintains single main landmark, keyboard focus on surface switch, no mount scroll hijack, and mobile reflow', async ({
    page,
  }) => {
    await page.goto(`${harnessRootUrl}?scenario=capacity-2`)

    // Exactly one visible <main>, zero nested <main>, zero duplicate primary <nav>
    await expect(page.locator('main:visible')).toHaveCount(1)
    await expect(page.locator('main main')).toHaveCount(0)
    await expect(page.locator('nav')).toHaveCount(0)

    // Initial mount does not force focus onto heading (does not intercept return scroll/focus)
    const initialFocusedTag = await page.evaluate(() => document.activeElement?.tagName ?? '')
    expect(initialFocusedTag).toBe('BODY')

    // Keyboard switch Shelf -> Browse All Months moves focus into visible Library heading (never lost to BODY)
    const browseBtn = page.getByTestId('r06-library-entrance-browse-all-months')
    await browseBtn.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Historical Library', level: 1 })).toBeVisible()
    await expect(page.locator('main:visible')).toHaveCount(1)
    await expect(page.locator('main main')).toHaveCount(0)

    const libraryFocusedInfo = await page.evaluate(() => ({
      tag: document.activeElement?.tagName ?? '',
      text: document.activeElement?.textContent?.trim() ?? '',
    }))
    expect(libraryFocusedInfo.tag).toBe('H1')
    expect(libraryFocusedInfo.text).toBe('Historical Library')

    // Keyboard switch Browse All Months -> Shelf moves focus into Shelf heading (never lost to BODY)
    const shelfBtn = page.getByTestId('r06-library-entrance-shelf-overview')
    await shelfBtn.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Shelf', level: 1 })).toBeVisible()
    await expect(page.locator('main:visible')).toHaveCount(1)

    const shelfFocusedInfo = await page.evaluate(() => ({
      tag: document.activeElement?.tagName ?? '',
      text: document.activeElement?.textContent?.trim() ?? '',
    }))
    expect(shelfFocusedInfo.tag).toBe('H1')
    expect(shelfFocusedInfo.text).toBe('Shelf')

    // Mobile narrow viewport (320px) + enlarged text reflow: no horizontal overflow & >=44px touch targets
    await page.setViewportSize({ width: 320, height: 640 })
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '20px'
    })

    const layoutMetrics = await page.evaluate(() => {
      const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth
      const entranceButtons = Array.from(
        document.querySelectorAll<HTMLButtonElement>('.r06-library-entrance-btn'),
      )
      const minHeight = Math.min(
        ...entranceButtons.map(btn => btn.getBoundingClientRect().height),
      )
      return { overflow, buttonCount: entranceButtons.length, minHeight }
    })

    expect(layoutMetrics.overflow).toBe(false)
    expect(layoutMetrics.buttonCount).toBe(2)
    expect(layoutMetrics.minHeight).toBeGreaterThanOrEqual(44)
  })
})
