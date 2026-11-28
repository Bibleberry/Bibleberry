import { defineConfig, devices } from '@playwright/test'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Month Screen accessibility and agenda suites.
 *
 * These specs need the Month Screen feature flag compiled into the bundle, so
 * Playwright builds a flagged bundle into its own temporary directory (never
 * the shared `dist/`) and serves it with `vite preview` on loopback.
 *
 * Run from a clean checkout with `npm run test:month-accessibility`.
 * Set PLAYWRIGHT_TEST_BASE_URL to test an already-running flagged preview instead.
 */
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const externalBaseUrl = process.env.PLAYWRIGHT_TEST_BASE_URL
const PREVIEW_HOST = '127.0.0.1'
const PREVIEW_PORT = 4183
const FLAGGED_OUT_DIR = join(tmpdir(), 'bibleberry-month-accessibility-dist')

const MONTH_ACCESSIBILITY_BUILD_ENV = Object.freeze({ VITE_ENABLE_MONTH_SCREEN: 'true' })

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: externalBaseUrl || `http://${PREVIEW_HOST}:${PREVIEW_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    headless: true,
  },
  webServer: externalBaseUrl
    ? undefined
    : {
        command:
          `npx vite build --outDir "${FLAGGED_OUT_DIR}" --emptyOutDir --logLevel error && ` +
          `npx vite preview --outDir "${FLAGGED_OUT_DIR}" --host ${PREVIEW_HOST} --port ${PREVIEW_PORT} --strictPort`,
        cwd: repositoryRoot,
        url: `http://${PREVIEW_HOST}:${PREVIEW_PORT}`,
        env: { ...MONTH_ACCESSIBILITY_BUILD_ENV },
        reuseExistingServer: false,
        timeout: 180_000,
        stdout: 'ignore',
        stderr: 'pipe',
      },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
