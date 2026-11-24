import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: ['shell.spec.ts', 'month-shelf.spec.ts'],
  fullyParallel: false,
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['github']] : [['list']],
  use: {
    ...devices['Desktop Chrome'],
    timezoneId: 'America/New_York',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
})
