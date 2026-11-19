import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer, type ViteDevServer } from 'vite'
import { expect, test } from '../smoke/helpers/frameSafeTest'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

let viteServer: ViteDevServer | null = null
let baseUrl = ''

test.describe('Save Scripture in ordinary teaching', () => {
  let uncaughtErrors: Error[] = []

  test.beforeAll(async () => {
    viteServer = await createServer({
      configFile: resolve(repositoryRoot, 'vite.config.ts'),
      root: repositoryRoot,
      server: { host: '127.0.0.1', port: 0, strictPort: false },
      logLevel: 'silent',
    })
    await viteServer.listen()
    const address = viteServer.httpServer?.address()
    if (!address || typeof address === 'string') {
      throw new Error('Failed to start Vite dev server for teaching Scripture integration')
    }
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  test.afterAll(async () => {
    await viteServer?.close()
    viteServer = null
  })

  test.beforeEach(({ page }) => {
    uncaughtErrors = []
    page.on('pageerror', error => uncaughtErrors.push(error))
    return page.addInitScript(() => {
      localStorage.setItem('bibleberry-prototype-v1', JSON.stringify({
        onboarded: true,
        appearance: 'system',
        textSize: 'default',
        reminderEnabled: false,
        reminderTime: '08:00',
        explored: [],
        journey: [],
        lastOpened: null,
        resumeDismissedDate: '',
      }))
    })
  })

  test.afterEach(() => {
    expect(uncaughtErrors).toEqual([])
  })

  test('saves, persists across reopen, and removes only the teaching citation', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`${baseUrl}/#/teaching/november-5-gods-will`)

    const panel = page.locator('.scripture-panel')
    const saveButton = panel.getByRole('button', {
      name: 'Save 1 Thessalonians 5:16–18 (NIV) to Saved Scripture',
    })
    await expect(saveButton).toBeVisible()
    const buttonBounds = await saveButton.boundingBox()
    expect(buttonBounds).not.toBeNull()
    expect(buttonBounds!.height).toBeGreaterThanOrEqual(44)
    await saveButton.focus()
    await page.keyboard.press('Enter')

    const removeButton = panel.getByRole('button', {
      name: 'Remove 1 Thessalonians 5:16–18 (NIV) from Saved Scripture',
    })
    await expect(removeButton).toHaveAttribute('aria-pressed', 'true')

    const stored = await page.evaluate(() =>
      localStorage.getItem('bibleberry-reader-participation-v1'),
    )
    expect(stored).toBeTruthy()
    const savedScriptures = JSON.parse(stored!).data.savedScriptures
    expect(savedScriptures).toEqual([
      expect.objectContaining({
        reference: '1 Thessalonians 5:16–18',
        translation: 'NIV',
      }),
    ])
    expect(savedScriptures[0].sourceChallengeId).toBeUndefined()
    expect(stored).not.toContain('Rejoice always, pray continually')

    await page.reload()
    const persistedButton = page.locator('.scripture-panel').getByRole('button', {
      name: 'Remove 1 Thessalonians 5:16–18 (NIV) from Saved Scripture',
    })
    await expect(persistedButton).toHaveAttribute('aria-pressed', 'true')
    await persistedButton.focus()
    await page.keyboard.press('Space')

    await expect(page.locator('.scripture-panel').getByRole('button', {
      name: 'Save 1 Thessalonians 5:16–18 (NIV) to Saved Scripture',
    })).toHaveAttribute('aria-pressed', 'false')
    const afterRemoval = await page.evaluate(() =>
      localStorage.getItem('bibleberry-reader-participation-v1'),
    )
    expect(JSON.parse(afterRemoval!).data.savedScriptures).toEqual([])
  })

  test('does not expose the control on draft teaching fixtures', async ({ page }) => {
    await page.goto(`${baseUrl}/#/teaching/sabbath-2026-11-01`)
    await expect(page.locator('.scripture-panel')).toBeVisible()
    await expect(page.locator('.scripture-panel').getByRole('button')).toHaveCount(0)
  })
})
