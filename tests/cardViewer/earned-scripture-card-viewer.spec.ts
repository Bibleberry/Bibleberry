import { test, expect } from '../smoke/helpers/frameSafeTest'
import { createServer, type ViteDevServer } from 'vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const TINY_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aW0cAAAAASUVORK5CYII=',
  'base64',
)
const LONG_TITLE = `Long Earning Card Title ${'T'.repeat(90)}`

let viteServer: ViteDevServer | null = null
let baseUrl = ''

test.describe('Earned Scripture Card viewer accessibility', () => {
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
      throw new Error('Failed to start Vite dev server for earned card viewer harness')
    }
    baseUrl = `http://127.0.0.1:${address.port}/tests/cardViewer/harness/index.html`
  })

  test.afterAll(async () => {
    await viteServer?.close()
    viteServer = null
  })

  test.beforeEach(async ({ page }) => {
    pageErrors = []
    page.on('pageerror', error => pageErrors.push(error))
    await page.setViewportSize({ width: 320, height: 700 })
  })

  test.afterEach(() => {
    expect(pageErrors).toEqual([])
  })

  test('shows durable multiline transcription and long metadata at narrow width and 200% text size when the image fails', async ({
    page,
  }) => {
    await page.route('https://cdn.sanity.io/images/**', route =>
      route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not Found' }),
    )
    await page.goto(baseUrl)
    await page.addStyleTag({
      content: ':root { --reading-size: 38px; font-size: 200%; }',
    })
    await page.getByRole('button', { name: 'Seed durable earned test card' }).click()

    const trigger = page.getByRole('button', { name: `Open Scripture Card: ${LONG_TITLE}` })
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: LONG_TITLE })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading', { name: 'Accessible Transcription' })).toBeVisible()
    await expect(dialog.locator('.earned-card-viewer__transcription p')).toHaveCount(14)
    await expect(dialog).toContainText('Test-only explanatory paragraph 1.')
    await expect(dialog).toContainText('Test-only explanatory paragraph 14.')
    await expect(dialog).toContainText(`Extended test reference ${'R'.repeat(90)}`)
    await expect(dialog).toContainText(`Long test theme ${'M'.repeat(90)}`)
    await expect(dialog.getByRole('status')).toContainText('Illustration description:')

    const dimensions = await page.evaluate(() => {
      const dialogElement = document.querySelector<HTMLElement>('[role="dialog"]')!
      return {
        documentClientWidth: document.documentElement.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        dialogClientWidth: dialogElement.clientWidth,
        dialogScrollWidth: dialogElement.scrollWidth,
        dialogClientHeight: dialogElement.clientHeight,
        dialogScrollHeight: dialogElement.scrollHeight,
      }
    })
    expect(dimensions.dialogScrollWidth).toBeLessThanOrEqual(dimensions.dialogClientWidth)
    expect(dimensions.dialogScrollHeight).toBeGreaterThan(dimensions.dialogClientHeight)
    expect(dimensions.documentScrollWidth).toBeLessThanOrEqual(dimensions.documentClientWidth)

    await dialog.evaluate(element => {
      element.scrollTop = element.scrollHeight
    })
    await expect(dialog.locator('.earned-card-viewer__footer')).toBeInViewport()
    await expect(dialog.locator('.earned-card-viewer__footer')).toContainText('Rights: test-only')

    await expect(page.getByTestId('stored-award-flags')).toHaveAttribute('data-card-viewed', 'false')
    await expect(page.getByTestId('stored-award-flags')).toHaveAttribute(
      'data-hub-announcement-acked',
      'false',
    )
  })

  test('provides image alt text, contains keyboard focus, and restores focus on Escape and Close', async ({
    page,
  }) => {
    await page.route('https://cdn.sanity.io/images/**', route =>
      route.fulfill({ status: 200, contentType: 'image/png', body: TINY_PNG_BUFFER }),
    )
    await page.goto(baseUrl)
    await page.getByRole('button', { name: 'Seed durable earned test card' }).click()

    const trigger = page.getByRole('button', { name: `Open Scripture Card: ${LONG_TITLE}` })
    await trigger.focus()
    await trigger.click()

    const dialog = page.getByRole('dialog', { name: LONG_TITLE })
    const closeButton = dialog.getByRole('button', { name: 'Close Scripture card' })
    await expect(dialog).toBeVisible()
    await expect(closeButton).toBeFocused()
    await expect(dialog.getByRole('img')).toHaveAttribute(
      'alt',
      'Test fixture illustration of a book beside a lamp',
    )

    await page.keyboard.press('Tab')
    await expect(closeButton).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(closeButton).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()

    await trigger.click()
    const reopenedDialog = page.getByRole('dialog', { name: LONG_TITLE })
    await reopenedDialog.getByRole('button', { name: 'Close Scripture card' }).click()
    await expect(reopenedDialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await expect(page.getByTestId('stored-award-flags')).toHaveAttribute('data-card-viewed', 'false')
    await expect(page.getByTestId('stored-award-flags')).toHaveAttribute(
      'data-hub-announcement-acked',
      'false',
    )
  })
})
