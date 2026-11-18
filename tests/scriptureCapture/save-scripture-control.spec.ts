import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer, type ViteDevServer } from 'vite'
import { expect, test } from '../smoke/helpers/frameSafeTest'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

let viteServer: ViteDevServer | null = null
let baseUrl = ''

test.describe('R09-2 Reusable Save Scripture Control', () => {
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
      throw new Error('Failed to start Vite dev server for R09-2 harness')
    }
    baseUrl = `http://127.0.0.1:${address.port}/tests/scriptureCapture/harness/index.html`
  })

  test.afterAll(async () => {
    await viteServer?.close()
    viteServer = null
  })

  test.beforeEach(({ page }) => {
    uncaughtErrors = []
    page.on('pageerror', err => uncaughtErrors.push(err))
  })

  test.afterEach(() => {
    expect(uncaughtErrors).toEqual([])
  })

  test('saves, distinguishes translations, persists across reload, and removes via keyboard', async ({ page }) => {
    await page.goto(baseUrl)
    await expect(page.getByTestId('store-status')).toContainText('Status: ready')

    const webpBtn = page.getByRole('button', { name: 'Save John 3:16 (WEBP) to Saved Scripture' })
    const nivBtn = page.getByRole('button', { name: 'Save John 3:16 (NIV) to Saved Scripture' })
    const psalmBtn = page.getByRole('button', { name: 'Save Psalm 23:1 to Saved Scripture' })
    const malformedBtn = page.getByRole('button', { name: 'Save Not a verse to Saved Scripture' })

    await expect(webpBtn).toHaveAttribute('aria-pressed', 'false')
    await expect(nivBtn).toHaveAttribute('aria-pressed', 'false')
    await expect(malformedBtn).toBeDisabled()
    await expect(page.getByText('This Scripture reference is not in a valid citation format.')).toBeVisible()

    // Check accessible touch target size (>= 44px for standard button)
    const box = await webpBtn.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.height).toBeGreaterThanOrEqual(44)

    // Keyboard focus & Enter activation
    await webpBtn.focus()
    await expect(webpBtn).toBeFocused()
    await page.keyboard.press('Enter')

    const removeWebpBtn = page.getByRole('button', { name: 'Remove John 3:16 (WEBP) from Saved Scripture' })
    await expect(removeWebpBtn).toHaveAttribute('aria-pressed', 'true')
    await expect(nivBtn).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId('store-status')).toContainText('Saved count: 1')

    // Save compact reference-only Psalm 23:1
    await psalmBtn.click()
    await expect(page.getByTestId('store-status')).toContainText('Saved count: 2')

    // Reload and verify durability in web localStorage
    await page.reload()
    await expect(page.getByRole('button', { name: 'Remove John 3:16 (WEBP) from Saved Scripture' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Remove Psalm 23:1 from Saved Scripture' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Save John 3:16 (NIV) to Saved Scripture' })).toHaveAttribute('aria-pressed', 'false')

    // Remove John 3:16 (WEBP) via Spacebar
    const persistedWebpBtn = page.getByRole('button', { name: 'Remove John 3:16 (WEBP) from Saved Scripture' })
    await persistedWebpBtn.focus()
    await page.keyboard.press('Space')
    await expect(page.getByRole('button', { name: 'Save John 3:16 (WEBP) to Saved Scripture' })).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId('store-status')).toContainText('Saved count: 1')
  })

  test('disables mutations during async hydration and enables after hydration completes', async ({ page }) => {
    await page.goto(`${baseUrl}?mode=async-hydrating`)
    await expect(page.getByTestId('store-status')).toContainText('Status: hydrating')

    const hydratingBtn = page.getByRole('button', { name: 'Loading Saved Scripture status for John 3:16 (WEBP)' })
    await expect(hydratingBtn).toBeDisabled()
    await expect(hydratingBtn).toHaveAttribute('aria-busy', 'true')

    await page.getByRole('button', { name: 'Complete Hydration' }).click()
    await expect(page.getByTestId('store-status')).toContainText('Status: ready')

    const readyBtn = page.getByRole('button', { name: 'Save John 3:16 (WEBP) to Saved Scripture' })
    await expect(readyBtn).toBeEnabled()
    await readyBtn.click()
    await expect(page.getByRole('button', { name: 'Remove John 3:16 (WEBP) from Saved Scripture' })).toBeVisible()
  })

  test('surfaces write failure alert and recovers when user clicks Retry save', async ({ page }) => {
    await page.goto(`${baseUrl}?mode=write-failure`)
    await page.getByRole('button', { name: 'Save John 3:16 (WEBP) to Saved Scripture' }).click()

    await expect(page.getByRole('alert').first()).toContainText('Could not write your latest Saved Scripture change')
    const retryBtn = page.getByRole('button', { name: 'Retry save' }).first()
    await expect(retryBtn).toBeVisible()

    await page.getByRole('button', { name: 'Recover Storage' }).click()
    await retryBtn.click()

    await expect(page.getByTestId('store-status')).toContainText('Health: ok')
    await expect(page.getByRole('button', { name: 'Retry save' })).toHaveCount(0)
  })

  test('safely disables controls when stored participation data is corrupt', async ({ page }) => {
    await page.goto(`${baseUrl}?mode=corrupt`)
    await expect(page.getByTestId('store-status')).toContainText('Health: corruptStoredData')
    await expect(page.getByRole('button', { name: 'Save John 3:16 (WEBP) to Saved Scripture' })).toBeDisabled()
    await expect(page.getByRole('alert').first()).toContainText('could not be read cleanly')
  })
})
