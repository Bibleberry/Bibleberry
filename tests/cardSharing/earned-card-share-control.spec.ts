import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer, type ViteDevServer } from 'vite'
import { expect, test } from '../smoke/helpers/frameSafeTest'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const TINY_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aW0cAAAAASUVORK5CYII=',
  'base64',
)

let viteServer: ViteDevServer | null = null
let baseUrl = ''

test.describe('Earned Scripture Card sharing control and canvas export', () => {
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
      throw new Error('Failed to start Vite dev server for card sharing harness')
    }
    baseUrl = `http://127.0.0.1:${address.port}/tests/cardSharing/harness/index.html`
  })

  test.afterAll(async () => {
    await viteServer?.close()
    viteServer = null
  })

  test.beforeEach(async ({ page }) => {
    pageErrors = []
    page.on('pageerror', error => pageErrors.push(error))
    await page.setViewportSize({ width: 390, height: 844 })
  })

  test.afterEach(() => {
    expect(pageErrors).toEqual([])
  })

  test('shares via Web Share with export-only attribution strip, preserves full text, and supports repeated sharing without award mutation', async ({
    page,
  }) => {
    await page.route('https://cdn.sanity.io/images/**', route =>
      route.fulfill({
        status: 200,
        contentType: 'image/png',
        headers: { 'access-control-allow-origin': '*' },
        body: TINY_PNG_BUFFER,
      }),
    )

    await page.addInitScript(() => {
      const capturedShares: Array<{
        title?: string
        text?: string
        fileName?: string
        fileSize?: number
      }> = []
      ;(window as unknown as { __capturedShares?: unknown[] }).__capturedShares = capturedShares

      Object.defineProperty(navigator, 'canShare', {
        configurable: true,
        value: (data?: ShareData) => Array.isArray(data?.files) && data.files.length > 0,
      })
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async (data?: ShareData) => {
          const file = data?.files?.[0]
          capturedShares.push({
            title: data?.title,
            text: data?.text,
            fileName: file?.name,
            fileSize: file?.size,
          })
        },
      })
    })

    await page.goto(baseUrl)
    await page.getByRole('button', { name: 'Seed shareable earned card' }).click()

    const shareButton = page.getByRole('button', { name: 'Share Lamp to My Feet' })
    await expect(shareButton).toBeEnabled()

    await shareButton.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('status')).toContainText('Shared "Lamp to My Feet"')

    // Repeat share to verify idempotency and unchanged award flags
    await shareButton.click()
    await expect(page.getByRole('status')).toContainText('Shared "Lamp to My Feet"')

    const capturedShares = await page.evaluate(
      () =>
        (
          window as unknown as {
            __capturedShares: Array<{
              title?: string
              text?: string
              fileName?: string
              fileSize?: number
            }>
          }
        ).__capturedShares,
    )

    expect(capturedShares).toHaveLength(2)
    expect(capturedShares[0].title).toBe('Lamp to My Feet')
    expect(capturedShares[0].fileName).toBe('card-2026-11-light-path-bibleberry.png')
    expect(capturedShares[0].fileSize).toBeGreaterThan(0)
    expect(capturedShares[0].text).toContain('Complete theological explanation preserved in full.')
    expect(capturedShares[0].text).toContain('Psalm 119:105 (WEBP · Psalms)')
    expect(capturedShares[0].text).toContain('Attribution: Alexis Waid / Bibleberry')
    expect(capturedShares[0].text).toContain('Shared from Bibleberry')

    const outcomeText = await page.getByTestId('share-outcome').textContent()
    const outcome = JSON.parse(outcomeText || '{}') as {
      status: string
      payload?: { exportedWidth: number; exportedHeight: number }
    }
    expect(outcome.status).toBe('shared')
    expect(outcome.payload?.exportedHeight).toBeGreaterThan(1)

    const flags = JSON.parse((await page.getByTestId('award-flags').textContent()) || '{}')
    expect(flags).toEqual({
      earnedCount: 1,
      cardViewed: false,
      hubAnnouncementAcked: false,
      earnedOn: '2026-11-09',
      imageUrl: 'https://cdn.sanity.io/images/80016lrq/staging/card-light-path.png',
    })
  })

  test('falls back to file download when Web Share is unavailable and surfaces copy control', async ({
    page,
  }) => {
    await page.route('https://cdn.sanity.io/images/**', route =>
      route.fulfill({
        status: 200,
        contentType: 'image/png',
        headers: { 'access-control-allow-origin': '*' },
        body: TINY_PNG_BUFFER,
      }),
    )

    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'canShare', {
        configurable: true,
        value: () => false,
      })
    })

    await page.goto(baseUrl)
    await page.getByRole('button', { name: 'Seed shareable earned card' }).click()

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Share Lamp to My Feet' }).click()
    const download = await downloadPromise

    expect(download.suggestedFilename()).toBe('card-2026-11-light-path-bibleberry.png')
    await expect(page.getByRole('status')).toContainText(
      'Downloaded card-2026-11-light-path-bibleberry.png with the original illustration, complete Scripture reference, explanation, and attribution.',
    )

    // Verify the actual delivered PNG file on disk is a valid composed PNG containing
    // the artwork plus the explanation/reference/attribution footer (not just a 1x1 stub).
    const downloadedPath = await download.path()
    expect(downloadedPath).toBeTruthy()
    const downloadedBytes = await readFile(downloadedPath!)
    expect(downloadedBytes.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
    // PNG IHDR chunk stores width (bytes 16..19) and height (bytes 20..23) big-endian.
    const pngWidth = downloadedBytes.readUInt32BE(16)
    const pngHeight = downloadedBytes.readUInt32BE(20)
    expect(pngWidth).toBeGreaterThanOrEqual(640)
    expect(pngHeight).toBeGreaterThan(150)
  })

  test('handles user cancellation, unavailable image asset, and rights-rejected cards cleanly', async ({
    page,
  }) => {
    await page.route('https://cdn.sanity.io/images/**', route =>
      route.fulfill({
        status: 200,
        contentType: 'image/png',
        headers: { 'access-control-allow-origin': '*' },
        body: TINY_PNG_BUFFER,
      }),
    )

    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'canShare', {
        configurable: true,
        value: () => true,
      })
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async () => {
          throw new DOMException('Share cancelled', 'AbortError')
        },
      })
    })

    await page.goto(baseUrl)
    await page.getByRole('button', { name: 'Seed shareable earned card' }).click()
    await page.getByRole('button', { name: 'Share Lamp to My Feet' }).click()
    await expect(page.getByRole('status')).toContainText('Sharing was cancelled')

    // Now simulate unavailable asset (404)
    await page.unroute('https://cdn.sanity.io/images/**')
    await page.route('https://cdn.sanity.io/images/**', route =>
      route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not Found' }),
    )
    await page.getByRole('button', { name: 'Share Lamp to My Feet' }).click()
    await expect(page.getByRole('alert')).toContainText('unavailable (status 404)')

    // Non-shareable and unverified-rights cards disable the Share button with clear reason
    await page.getByRole('button', { name: 'Seed non-shareable card' }).click()
    await expect(page.getByRole('button', { name: 'Share Lamp to My Feet' })).toBeDisabled()
    await expect(page.getByText('marked as not eligible for sharing')).toBeVisible()

    await page.getByRole('button', { name: 'Seed unverified-rights card' }).click()
    await expect(page.getByRole('button', { name: 'Share Lamp to My Feet' })).toBeDisabled()
    await expect(page.getByText('artwork rights are not cleared for export')).toBeVisible()

    await page.getByRole('button', { name: 'Seed pending-rights card' }).click()
    await expect(page.getByRole('button', { name: 'Share Lamp to My Feet' })).toBeDisabled()
    await expect(page.getByText('artwork rights are not cleared for export')).toBeVisible()
  })
})
