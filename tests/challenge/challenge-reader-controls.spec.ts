import { test, expect } from '../smoke/helpers/frameSafeTest'
import { createServer, type ViteDevServer } from 'vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const STORAGE_KEY = 'bibleberry-river-lantern-harness-v1'

let viteServer: ViteDevServer | null = null
let baseUrl = ''

test.describe('Challenge Reader functional controls and safe Start from Beginning (River Lantern)', () => {
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
      throw new Error('Failed to start Vite dev server for Challenge reader controls harness')
    }
    baseUrl = `http://127.0.0.1:${address.port}/tests/challenge/harness/index.html`
  })

  test.afterAll(async () => {
    await viteServer?.close()
    viteServer = null
  })

  test.beforeEach(async ({ page }) => {
    pageErrors = []
    page.on('pageerror', error => pageErrors.push(error))
    await page.setViewportSize({ width: 375, height: 812 })
  })

  test.afterEach(() => {
    expect(pageErrors).toEqual([])
  })

  test('Previous/Next, textual Screen n of N, keyboard focus, >=44px touch targets, scrolling, text selection, and narrow 200% zoom reflow work cleanly', async ({
    page,
  }) => {
    await page.goto(baseUrl)

    const progressbar = page.getByRole('progressbar', { name: 'Challenge screen position' })
    const nav = page.getByRole('navigation', { name: 'Challenge screen navigation' })
    const startOverBtn = page.getByRole('button', { name: 'Start from Beginning' })
    const exitBtn = page.locator('button.challenge-player__exit')

    // Screen 1 of 3 initial state + heading focus
    await expect(page.locator('#rl-screen-1-title')).toBeFocused()
    await expect(page.locator('.lab-progress')).toContainText('Screen 1 of 3')
    await expect(progressbar).toHaveAttribute('aria-valuenow', '1')
    await expect(progressbar).toHaveAttribute('aria-valuemax', '3')
    await expect(progressbar).toHaveAttribute('aria-valuetext', 'Screen 1 of 3')
    await expect(nav.getByRole('button', { name: 'Previous' })).toBeDisabled()
    await expect(nav.getByRole('button', { name: 'Next' })).toBeEnabled()
    await expect(nav.getByRole('button', { name: 'Finish' })).toHaveCount(0)
    await expect(startOverBtn).toBeVisible()
    await expect(startOverBtn).toBeDisabled()

    // Touch target size >= 44px for accessible controls
    for (const control of [exitBtn, nav.getByRole('button', { name: 'Previous' }), nav.getByRole('button', { name: 'Next' }), startOverBtn]) {
      const box = await control.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.height).toBeGreaterThanOrEqual(44)
    }

    // Vertical scrolling and text selection remain undisturbed
    const scrollResult = await page.evaluate(() => {
      window.scrollTo(0, 260)
      const scrolledY = window.scrollY
      const paragraph = document.querySelector('.lab-teaching-text p')
      let selectedText = ''
      if (paragraph?.firstChild) {
        const range = document.createRange()
        range.selectNodeContents(paragraph.firstChild)
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
        selectedText = selection?.toString() ?? ''
      }
      return { scrolledY, selectedText }
    })
    expect(scrollResult.scrolledY).toBeGreaterThan(0)
    expect(scrollResult.selectedText).toContain('Selectable prose sentence')

    // Keyboard Next -> Screen 2 of 3 (scrolls to top & focuses Screen 2 heading)
    await nav.getByRole('button', { name: 'Next' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('#rl-screen-2-title')).toBeFocused()
    await expect(page.locator('.lab-progress')).toContainText('Screen 2 of 3')
    await expect(progressbar).toHaveAttribute('aria-valuetext', 'Screen 2 of 3')
    await expect(nav.getByRole('button', { name: 'Previous' })).toBeEnabled()
    await expect(startOverBtn).toBeEnabled()

    // Keyboard Next -> Screen 3 of 3 (Finish replaces Next)
    await nav.getByRole('button', { name: 'Next' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('#rl-screen-3-title')).toBeFocused()
    await expect(page.locator('.lab-progress')).toContainText('Screen 3 of 3')
    await expect(progressbar).toHaveAttribute('aria-valuetext', 'Screen 3 of 3')
    await expect(nav.getByRole('button', { name: 'Next' })).toHaveCount(0)
    await expect(nav.getByRole('button', { name: 'Finish' })).toBeVisible()
    await expect(nav.getByRole('button', { name: 'Finish' })).toBeEnabled()

    // Keyboard Previous -> Screen 2 of 3
    await nav.getByRole('button', { name: 'Previous' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('#rl-screen-2-title')).toBeFocused()
    await expect(page.locator('.lab-progress')).toContainText('Screen 2 of 3')

    // 320px narrow viewport + 200% text size has zero horizontal overflow
    await page.setViewportSize({ width: 320, height: 640 })
    await page.addStyleTag({ content: 'html { font-size: 200%; }' })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(overflow).toBe(false)
  })

  test('Start from Beginning resets only unfinished resume position across reload while preserving saved Scripture, completions, earned Cards, and other Challenges', async ({
    page,
  }) => {
    await page.addInitScript(storageKey => {
      if (sessionStorage.getItem('rl-seeded')) return
      sessionStorage.setItem('rl-seeded', '1')
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          schemaVersion: 2,
          data: {
            completedChallenges: {
              'cms:other-completed-doc': { completedOn: '2026-11-01' },
            },
            inProgressChallenges: {
              'cms:river-lantern-sample': { screenId: 'rl-screen-3', updatedOn: '2026-11-19' },
              'cms:other-in-progress-doc': { screenId: 'other-s2', updatedOn: '2026-11-18' },
            },
            savedChallenges: {
              'cms:river-lantern-sample': { savedOn: '2026-11-15' },
            },
            savedScriptures: [
              {
                key: 'romans 8:1|webp',
                reference: 'Romans 8:1',
                translation: 'WEBP',
                savedOn: '2026-11-12',
                sourceChallengeId: 'cms:river-lantern-sample',
              },
            ],
            lastOpenedChallenge: null,
            earnedAwards: {
              'card:monthly:2026-11:steadfast-faith': {
                awardId: 'card:monthly:2026-11:steadfast-faith',
                kind: 'thematic',
                publicationYearMonth: '2026-11',
                discoveryId: 'discovery:2026-11:steadfast-faith',
                earnedOn: '2026-11-01',
                hubAnnouncementAcked: false,
                cardViewed: false,
              },
            },
          },
        }),
      )
    }, STORAGE_KEY)

    await page.goto(baseUrl)

    // Auto-resumes at Screen 3 of 3
    await expect(page.locator('#rl-screen-3-title')).toBeVisible()
    await expect(page.locator('.lab-progress')).toContainText('Screen 3 of 3')

    // Click Start from Beginning -> moves to Screen 1, focuses Screen 1 heading, disables Start from Beginning
    const startOverBtn = page.getByRole('button', { name: 'Start from Beginning' })
    await expect(startOverBtn).toBeEnabled()
    await startOverBtn.click()

    await expect(page.locator('#rl-screen-1-title')).toBeFocused()
    await expect(page.locator('.lab-progress')).toContainText('Screen 1 of 3')
    await expect(startOverBtn).toBeDisabled()

    // Reload simulates interruption: Challenge reopens at Screen 1 and all other data is intact
    await page.reload()
    await expect(page.locator('#rl-screen-1-title')).toBeVisible()
    await expect(page.locator('.lab-progress')).toContainText('Screen 1 of 3')

    const envelope = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'), STORAGE_KEY)
    expect(envelope.data.inProgressChallenges['cms:river-lantern-sample']).toEqual({
      screenId: 'rl-screen-1',
      updatedOn: '2026-11-21',
    })
    expect(envelope.data.inProgressChallenges['cms:other-in-progress-doc']).toEqual({
      screenId: 'other-s2',
      updatedOn: '2026-11-18',
    })
    expect(envelope.data.completedChallenges['cms:other-completed-doc']).toEqual({
      completedOn: '2026-11-01',
    })
    expect(envelope.data.earnedAwards['card:monthly:2026-11:steadfast-faith'].earnedOn).toBe('2026-11-01')
    expect(envelope.data.savedChallenges['cms:river-lantern-sample']).toEqual({ savedOn: '2026-11-15' })
    expect(envelope.data.savedScriptures).toHaveLength(1)
    expect(envelope.data.savedScriptures[0].reference).toBe('Romans 8:1')
  })

  test('explicit Finish is required and idempotent under double-click; completed Read Again begins at Screen 1 without duplicate completion or awards', async ({
    page,
  }) => {
    await page.goto(baseUrl)

    const nav = page.getByRole('navigation', { name: 'Challenge screen navigation' })
    const telemetry = page.getByTestId('telemetry-counts')

    // Reaching Screen 3 without tapping Finish does NOT complete
    await nav.getByRole('button', { name: 'Next' }).click()
    await nav.getByRole('button', { name: 'Next' }).click()
    await expect(page.locator('#rl-screen-3-title')).toBeVisible()
    await expect(telemetry).toContainText('Completions dispatched: 0 · Distinct completed: 0 · Status: inProgress')

    // Reload stays unfinished at Screen 3
    await page.reload()
    await expect(page.locator('#rl-screen-3-title')).toBeVisible()
    await expect(telemetry).toContainText('Distinct completed: 0 · Status: inProgress')

    // Rapid double-click on Finish dispatches exactly once and exits once
    const finishBtn = nav.getByRole('button', { name: 'Finish' })
    await finishBtn.evaluate(button => {
      ;(button as HTMLButtonElement).click()
      ;(button as HTMLButtonElement).click()
    })

    await expect(page.getByTestId('host-returned-surface')).toBeVisible()
    await expect(telemetry).toContainText('Exits: 1 · Completions dispatched: 1 · Distinct completed: 1 · Status: completed')

    // Reopen completed Challenge via Read Again -> begins on Screen 1 without revoking completion
    await page.getByTestId('host-reopen-btn').click()
    await expect(page.locator('#rl-screen-1-title')).toBeFocused()
    await expect(page.locator('.lab-progress')).toContainText('Screen 1 of 3')
    await expect(telemetry).toContainText('Distinct completed: 1 · Status: completed')

    // Step to Screen 2 and click Start from Beginning -> resets ONLY local reread position; no inProgress write
    await nav.getByRole('button', { name: 'Next' }).click()
    await expect(page.locator('#rl-screen-2-title')).toBeVisible()
    await page.getByRole('button', { name: 'Start from Beginning' }).click()
    await expect(page.locator('#rl-screen-1-title')).toBeFocused()

    const midRereadEnvelope = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'), STORAGE_KEY)
    expect(midRereadEnvelope.data.inProgressChallenges).toEqual({})
    expect(midRereadEnvelope.data.completedChallenges['cms:river-lantern-sample']).toEqual({
      completedOn: '2026-11-21',
    })

    // Step to Screen 3 and click Finish on completed reread -> exits cleanly with ZERO duplicate completion dispatch
    await nav.getByRole('button', { name: 'Next' }).click()
    await nav.getByRole('button', { name: 'Next' }).click()
    await expect(page.locator('#rl-screen-3-title')).toBeVisible()
    await nav.getByRole('button', { name: 'Finish' }).click()

    await expect(page.getByTestId('host-returned-surface')).toBeVisible()
    await expect(telemetry).toContainText('Exits: 2 · Completions dispatched: 1 · Distinct completed: 1 · Status: completed')
  })

  test('non-returning completed Challenge offers Read Again to restart at Screen 1 without revoking completed status', async ({
    page,
  }) => {
    await page.goto(`${baseUrl}?mode=nonReturning`)

    const nav = page.getByRole('navigation', { name: 'Challenge screen navigation' })
    const telemetry = page.getByTestId('telemetry-counts')

    await nav.getByRole('button', { name: 'Next' }).click()
    await nav.getByRole('button', { name: 'Next' }).click()
    await nav.getByRole('button', { name: 'Finish' }).click()

    await expect(page.locator('.lab-completion')).toContainText('Challenge complete')
    await expect(nav.getByRole('button', { name: 'Challenge complete' })).toBeDisabled()
    await expect(telemetry).toContainText('Completions dispatched: 1 · Distinct completed: 1 · Status: completed')

    const readAgainBtn = page.getByRole('button', { name: 'Read Again' })
    await expect(readAgainBtn).toBeVisible()
    await readAgainBtn.click()

    await expect(page.locator('#rl-screen-1-title')).toBeFocused()
    await expect(page.locator('.lab-progress')).toContainText('Screen 1 of 3')
    await expect(telemetry).toContainText('Completions dispatched: 1 · Distinct completed: 1 · Status: completed')
  })

  test('Exit delegates solely to host when supplied, omits button when absent, and Developer Studio diagnostics mode stays compatible', async ({
    page,
  }) => {
    // 1. Omitted onExit renders no Exit button
    await page.goto(`${baseUrl}?mode=noExit`)
    await expect(page.locator('button.challenge-player__exit')).toHaveCount(0)

    // 2. Host-supplied onExit without exitLabel defaults to accessible "Exit" and never mutates location hash
    await page.goto(`${baseUrl}?mode=defaultExit`)
    const exitBtn = page.getByRole('button', { name: 'Exit' })
    await expect(exitBtn).toBeVisible()
    const urlBeforeExit = page.url()
    await exitBtn.click()
    await expect(page.getByTestId('host-returned-surface')).toBeVisible()
    await expect(page.getByTestId('telemetry-counts')).toContainText('Exits: 1')
    expect(page.url()).toBe(urlBeforeExit)

    // 3. Developer Studio diagnostics mode retains Back, Continue, 1 of 3, Required screens, Complete Challenge
    await page.goto(`${baseUrl}?mode=diagnostics`)
    await expect(page.locator('.lab-progress')).toContainText('Required screens')
    await expect(page.locator('.lab-progress')).toContainText('1 of 3')
    await expect(page.locator('.lab-progress')).not.toContainText('Screen 1 of 3')
    const diagNav = page.getByRole('navigation', { name: 'CMS Challenge screen navigation' })
    await expect(diagNav.getByRole('button', { name: 'Back' })).toBeDisabled()
    await expect(diagNav.getByRole('button', { name: 'Continue' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Start from Beginning' })).toHaveCount(0)

    await diagNav.getByRole('button', { name: 'Continue' }).click()
    await diagNav.getByRole('button', { name: 'Continue' }).click()
    await expect(diagNav.getByRole('button', { name: 'Complete Challenge' })).toBeVisible()
  })
})
