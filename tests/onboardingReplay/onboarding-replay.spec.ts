import { test, expect } from '../smoke/helpers/frameSafeTest'
import { createServer, type ViteDevServer } from 'vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

let viteServer: ViteDevServer | null = null
let baseUrl = ''

test.describe('R12-3: Replayable First-Use Onboarding Foundation', () => {
  let pageErrors: Error[] = []

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
      throw new Error('Failed to start Vite dev server for onboardingReplay harness')
    }
    baseUrl = `http://127.0.0.1:${address.port}/tests/onboardingReplay/harness/index.html`
  })

  test.afterAll(async () => {
    await viteServer?.close()
    viteServer = null
  })

  test.beforeEach(async ({ page }) => {
    pageErrors = []
    page.on('pageerror', error => pageErrors.push(error))
  })

  test.afterEach(() => {
    expect(pageErrors).toEqual([])
  })

  test('genuine first-use flow completes, saves reminder preference, and persists across reload', async ({
    page,
  }) => {
    await page.goto(`${baseUrl}?scenario=first-use`)

    await expect(page.getByTestId('onboarding-replay-badge')).toHaveCount(0)
    await expect(page.getByTestId('onboarding-step-heading')).toContainText(
      'A quiet place tomeet with Scripture.',
    )
    await expect(page.getByTestId('onboarding-live-announcement')).toHaveText(
      'Welcome step 1 of 3: A quiet place to meet with Scripture.',
    )

    // Step 1 -> Step 2
    await page.getByTestId('onboarding-continue-button').click()
    await expect(page.getByTestId('onboarding-step-heading')).toContainText(
      'Nothing to catch up on.',
    )
    await expect(page.getByTestId('onboarding-live-announcement')).toHaveText(
      'Welcome step 2 of 3: Nothing to catch up on. No streak to protect.',
    )

    // Back -> Step 1, then forward to Step 3
    await page.getByTestId('onboarding-back-button').click()
    await expect(page.getByTestId('onboarding-live-announcement')).toHaveText(
      'Welcome step 1 of 3: A quiet place to meet with Scripture.',
    )
    await page.getByTestId('onboarding-continue-button').click()
    await page.getByTestId('onboarding-continue-button').click()

    await expect(page.getByTestId('onboarding-live-announcement')).toHaveText(
      'Welcome step 3 of 3: Make room for a daily pause.',
    )
    await page.getByLabel('Suggested reminder time').fill('06:45')
    await page.getByTestId('onboarding-finish-button').click()

    await expect(page.getByTestId('harness-shell-heading')).toBeVisible()
    await expect(page.getByTestId('harness-active-destination')).toHaveText(
      'Active destination: Foundations',
    )

    const stateText = await page.getByTestId('harness-reader-state').textContent()
    const parsed = JSON.parse(stateText || '{}')
    expect(parsed.readerState.onboarded).toBe(true)
    expect(parsed.readerState.preferences.reminderEnabled).toBe(true)
    expect(parsed.readerState.preferences.reminderTime).toBe('06:45')

    // Reload: must remain in reader app shell, not re-show first-use onboarding
    await page.reload()
    await expect(page.getByTestId('harness-shell-heading')).toBeVisible()
  })

  test('first-use Skip exits to app shell and persists onboarded=true across reload', async ({
    page,
  }) => {
    await page.goto(`${baseUrl}?scenario=first-use`)
    await page.getByTestId('onboarding-skip-button').click()

    await expect(page.getByTestId('harness-shell-heading')).toBeVisible()
    await expect(page.getByTestId('harness-active-destination')).toHaveText(
      'Active destination: Today',
    )

    await page.reload()
    await expect(page.getByTestId('harness-shell-heading')).toBeVisible()
  })

  test('replay returns to prior destination and preserves all reader state', async ({ page }) => {
    await page.goto(`${baseUrl}?scenario=replay`)
    await expect(page.getByTestId('harness-shell-heading')).toBeVisible()

    const beforeText = await page.getByTestId('harness-reader-state').textContent()
    const beforeReaderState = JSON.parse(beforeText || '{}').readerState

    await page.getByTestId('launch-replay-saved-scripture').click()

    await expect(page.getByTestId('onboarding-replay-badge')).toHaveText('Replaying introduction')
    await expect(page.getByTestId('onboarding-skip-button')).toHaveText(
      'Return to Saved Scripture',
    )
    await expect(page.getByTestId('onboarding-live-announcement')).toHaveText(
      'Replaying introduction. Welcome step 1 of 3: A quiet place to meet with Scripture.',
    )

    // Walk through all 3 steps and Finish
    await page.getByTestId('onboarding-continue-button').click()
    await page.getByTestId('onboarding-continue-button').click()
    await page.getByTestId('onboarding-finish-button').click()

    await expect(page.getByTestId('harness-shell-heading')).toBeVisible()
    await expect(page.getByTestId('harness-active-destination')).toHaveText(
      'Active destination: Saved Scripture',
    )

    const afterText = await page.getByTestId('harness-reader-state').textContent()
    const afterReaderState = JSON.parse(afterText || '{}').readerState
    expect(afterReaderState).toEqual(beforeReaderState)
  })

  test('interrupted replay and page reload never resets onboarded or erases reader data', async ({
    page,
  }) => {
    await page.goto(`${baseUrl}?scenario=replay`)
    const beforeText = await page.getByTestId('harness-reader-state').textContent()
    const beforeReaderState = JSON.parse(beforeText || '{}').readerState

    await page.getByTestId('launch-replay-library').click()
    await page.getByTestId('onboarding-continue-button').click()
    await expect(page.getByTestId('onboarding-step-heading')).toContainText(
      'Nothing to catch up on.',
    )

    // Interrupt replay by reloading mid-flow
    await page.reload()

    // App shell must load normally without resetting to first-use onboarding
    await expect(page.getByTestId('harness-shell-heading')).toBeVisible()
    const afterText = await page.getByTestId('harness-reader-state').textContent()
    const afterReaderState = JSON.parse(afterText || '{}').readerState
    expect(afterReaderState).toEqual(beforeReaderState)
  })

  test('keyboard navigation, Escape to exit replay, and focus management work cleanly', async ({
    page,
  }) => {
    await page.goto(`${baseUrl}?scenario=replay`)
    await page.getByTestId('launch-replay-saved-scripture').click()

    // Step advance via keyboard Enter moves focus to the new step heading
    await page.getByTestId('onboarding-continue-button').focus()
    await page.keyboard.press('Enter')

    const heading = page.getByTestId('onboarding-step-heading')
    await expect(heading).toContainText('Nothing to catch up on.')
    await expect(heading).toBeFocused()

    // Pressing Escape in replay mode returns to prior destination
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('harness-shell-heading')).toBeVisible()
    await expect(page.getByTestId('harness-active-destination')).toHaveText(
      'Active destination: Saved Scripture',
    )
  })

  test('mobile 320px layout and 200% large-text zoom reflow without horizontal overflow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    await page.goto(`${baseUrl}?scenario=first-use`)

    // Aside panel should be hidden on narrow mobile viewports
    await expect(page.locator('.r12-onboarding__aside')).toBeHidden()

    await page.addStyleTag({
      content: 'html { font-size: 200% !important; }',
    })

    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth
    })
    expect(hasHorizontalOverflow).toBe(false)

    // Controls remain reachable and clickable at 200% zoom
    await page.getByTestId('onboarding-continue-button').click()
    await expect(page.getByTestId('onboarding-step-heading')).toContainText(
      'Nothing to catch up on.',
    )

    const step2Overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth
    })
    expect(step2Overflow).toBe(false)
  })
})
