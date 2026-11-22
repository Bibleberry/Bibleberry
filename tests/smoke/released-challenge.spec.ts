import { test, expect } from './helpers/frameSafeTest'

const PROTOTYPE_STORAGE_KEY = 'bibleberry-prototype-v1'
const PARTICIPATION_STORAGE_KEY = 'bibleberry-reader-participation-v1'

const makeMockChallenge = (overrides = {}) => ({
  _id: 'mock-released-challenge-doc-1',
  _type: 'challenge',
  title: 'Mock Released Challenge',
  slug: 'mock-released-challenge',
  challengeType: 'teaching',
  series: {
    _id: 'mock-series-doc-1',
    title: 'Mock Series',
    slug: 'mock-series',
  },
  sequence: 1,
  releaseAt: '2026-11-02T09:00:00-05:00',
  primaryScripture: {
    reference: 'Philippians 4:4',
    translation: 'ESV',
    textStatus: 'referenceOnly',
    usageRightsConfirmed: false,
    practiceStatus: 'notConfigured',
  },
  screens: [
    {
      _key: 'screen-step-1',
      _type: 'challengeScreen',
      screenLabel: 'Step 1',
      heading: 'First Step Heading',
      blocks: [
        {
          _key: 'block-step-1-text',
          _type: 'statementBlock',
          text: 'This is the first step of the released challenge.',
        },
      ],
    },
    {
      _key: 'screen-step-2',
      _type: 'challengeScreen',
      screenLabel: 'Step 2',
      heading: 'Second Step Heading',
      blocks: [
        {
          _key: 'block-step-2-text',
          _type: 'statementBlock',
          text: 'This is the final step of the released challenge.',
        },
      ],
    },
  ],
  companionLinks: [],
  editorialEligibility: {
    adaptationReviewed: true,
    reviewedAt: '2026-11-01T12:00:00Z',
  },
  ...overrides,
})

const makeSingleScreenChallenge = (overrides = {}) => ({
  _id: 'mock-single-screen-doc-1',
  _type: 'challenge',
  title: 'Mock Single Screen Challenge',
  slug: 'mock-single-screen',
  challengeType: 'reflection',
  series: {
    _id: 'mock-series-doc-1',
    title: 'Mock Series',
    slug: 'mock-series',
  },
  sequence: 2,
  releaseAt: '2026-11-02T09:00:00-05:00',
  primaryScripture: {
    reference: 'Psalm 23:1',
    translation: 'ESV',
    textStatus: 'referenceOnly',
    usageRightsConfirmed: false,
    practiceStatus: 'notConfigured',
  },
  screens: [
    {
      _key: 'screen-single',
      _type: 'challengeScreen',
      screenLabel: 'Only Step',
      heading: 'Single Step Heading',
      blocks: [
        {
          _key: 'block-single-text',
          _type: 'statementBlock',
          text: 'Single screen challenge content.',
        },
      ],
    },
  ],
  companionLinks: [],
  editorialEligibility: {
    adaptationReviewed: true,
    reviewedAt: '2026-11-01T12:00:00Z',
  },
  ...overrides,
})

type GatewayReply = { status: number; body: unknown }

const ready = (challenge: unknown): GatewayReply => ({ status: 200, body: { ok: true, challenge } })
const NOT_FOUND: GatewayReply = {
  status: 404,
  body: { ok: false, error: { kind: 'notFound', message: 'Challenge not found' } },
}

const ONBOARDED_STATE = {
  onboarded: true,
  appearance: 'system',
  textSize: 'default',
  reminderEnabled: false,
  reminderTime: '08:00',
  explored: [],
  journey: [],
  lastOpened: null,
  resumeDismissedDate: '',
}

/**
 * Released-route-only bundle (VITE_ENABLE_RELEASED_CHALLENGE_ROUTE=true; Month Screen, Hub Continue
 * and VITE_ENABLE_RELEASE_GATEWAY_SOURCE all off). Every Challenge in this build is opened by a
 * direct link, i.e. an external entry (Harbor Signal, #270), so it must be authorized by the
 * release gateway only and never fall back to direct published-Sanity catalog reads.
 */
test.describe('Controlled Released CMS Challenge Integration (A4.1, external entries via gateway)', () => {
  let uncaughtErrors: Error[] = []
  let sanityRequests: string[] = []
  let gatewayRequests: string[] = []

  async function serveGateway(
    page: import('@playwright/test').Page,
    reply: (slug: string, call: number) => GatewayReply,
  ) {
    await page.route('**/api/challenges/**', async route => {
      const slug = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop() ?? '')
      gatewayRequests.push(slug)
      const { status, body } = reply(slug, gatewayRequests.length)
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    })
  }

  test.beforeEach(async ({ page }) => {
    uncaughtErrors = []
    sanityRequests = []
    gatewayRequests = []
    page.on('pageerror', err => uncaughtErrors.push(err))
    await page.clock.setFixedTime(new Date('2026-11-06T12:00:00Z'))
    // Any direct Sanity read would bypass server-clock release authorization.
    await page.route('https://*.api.sanity.io/**', async route => {
      sanityRequests.push(route.request().url())
      await route.abort('failed')
    })
    await page.route('https://*.apicdn.sanity.io/**', async route => {
      sanityRequests.push(route.request().url())
      await route.abort('failed')
    })
    await page.addInitScript(
      ({ key, state }) => localStorage.setItem(key, JSON.stringify(state)),
      { key: PROTOTYPE_STORAGE_KEY, state: ONBOARDED_STATE },
    )
  })

  test.afterEach(async () => {
    expect(uncaughtErrors).toEqual([])
    expect(sanityRequests).toEqual([])
  })

  test('loads eligible Challenge from the gateway, navigates screens, bookmarks, reloads to resume, and completes into guest participation store', async ({
    page,
  }) => {
    await serveGateway(page, () => ready(makeMockChallenge()))

    // Deep-link to the released Challenge
    await page.goto('/#/challenge/mock-released-challenge')

    // Screen 1 should render with title, heading, and statement
    await expect(page.locator('.lab-challenge-header h1')).toHaveText('Mock Released Challenge')
    await expect(page.locator('.lab-screen .eyebrow')).toHaveText('Step 1')
    await expect(page.locator('.lab-screen h2')).toHaveText('First Step Heading')
    await expect(page.locator('.lab-statement p')).toContainText(
      'This is the first step of the released challenge.',
    )
    expect(gatewayRequests).toContain('mock-released-challenge')

    // Progress record after open
    let stored = await page.evaluate(key => {
      const raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    }, PARTICIPATION_STORAGE_KEY)
    expect(stored).not.toBeNull()
    expect(stored.data.lastOpenedChallenge?.challengeId).toBe('cms:mock-released-challenge-doc-1')
    expect(stored.data.lastOpenedChallenge?.openedOn).toBe('2026-11-06')

    // Bookmark/Save the Challenge
    await page.locator('.lab-save-challenge').click()
    stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), PARTICIPATION_STORAGE_KEY)
    expect(stored.data.savedChallenges['cms:mock-released-challenge-doc-1']).toBeDefined()

    // Advance to Screen 2
    await page.locator('.lab-screen-nav button:has-text("Next")').click()
    await expect(page.locator('.lab-screen .eyebrow')).toHaveText('Step 2')
    await expect(page.locator('.lab-screen h2')).toHaveText('Second Step Heading')

    // Confirm durable progress recorded screen-step-2
    stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), PARTICIPATION_STORAGE_KEY)
    expect(stored.data.inProgressChallenges['cms:mock-released-challenge-doc-1']?.screenId).toBe(
      'screen-step-2',
    )

    // Reload page: must resume directly at Screen 2
    await page.reload()
    await expect(page.locator('.lab-screen .eyebrow')).toHaveText('Step 2')
    await expect(page.locator('.lab-screen h2')).toHaveText('Second Step Heading')

    // Explicitly finish the Challenge on the final screen and return immediately to Today without completion panel
    await page.locator('.lab-screen-nav button:has-text("Finish")').click()
    await expect(page.locator('#daily-teaching')).toBeVisible()
    await expect(page.locator('.lab-completion')).toHaveCount(0)
    expect(page.url()).not.toContain('#/challenge/')

    // Verify durable completion recorded and inProgress cleared
    stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), PARTICIPATION_STORAGE_KEY)
    expect(stored.data.completedChallenges['cms:mock-released-challenge-doc-1']).toBeDefined()
    expect(stored.data.completedChallenges['cms:mock-released-challenge-doc-1'].completedOn).toBe(
      '2026-11-06',
    )
    expect(stored.data.inProgressChallenges['cms:mock-released-challenge-doc-1']).toBeUndefined()
  })

  test('forged ?origin=month link is an external entry: gateway-only, Return to Today, Finish to Today', async ({
    page,
  }) => {
    await serveGateway(page, () => ready(makeMockChallenge()))

    await page.goto('/#/challenge/mock-released-challenge?origin=month&yearMonth=2026-10')
    await expect(page.locator('.lab-challenge-header h1')).toHaveText('Mock Released Challenge')
    await expect(page.locator('.challenge-player__exit')).toHaveText('Return to Today')
    expect(new Set(gatewayRequests)).toEqual(new Set(['mock-released-challenge']))

    await page.locator('.lab-screen-nav button:has-text("Next")').click()
    await page.locator('.lab-screen-nav button:has-text("Finish")').click()
    await expect(page.locator('#daily-teaching')).toBeVisible()
    expect(page.url()).not.toContain('#/challenge/')
    expect(await page.evaluate(() => window.history.state?.returnedChallengeOrigin)).toEqual({ kind: 'hub' })

    // Exit (without Finish) from a forged Shelf origin also returns to Today
    await page.goto('/#/challenge/mock-released-challenge?origin=shelf&yearMonth=2026-10')
    await expect(page.locator('.challenge-player__exit')).toHaveText('Return to Today')
    await page.locator('.challenge-player__exit').click()
    await expect(page.locator('#daily-teaching')).toBeVisible()
  })

  test('single-screen Challenge supports Start Challenge button lifecycle and completion', async ({
    page,
  }) => {
    await serveGateway(page, () => ready(makeSingleScreenChallenge()))

    await page.goto('/#/challenge/mock-single-screen')
    await expect(page.locator('.lab-challenge-header h1')).toHaveText('Mock Single Screen Challenge')

    // Initial state: notStarted, inProgress is not persisted
    let stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), PARTICIPATION_STORAGE_KEY)
    expect(stored.data.inProgressChallenges['cms:mock-single-screen-doc-1']).toBeUndefined()

    // Click Start Challenge
    const startBtn = page.locator('.lab-screen-nav button:has-text("Start Challenge")')
    await expect(startBtn).toBeVisible()
    await startBtn.click()

    // Verify inProgress is now persisted
    stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), PARTICIPATION_STORAGE_KEY)
    expect(stored.data.inProgressChallenges['cms:mock-single-screen-doc-1']?.screenId).toBe(
      'screen-single',
    )

    // Finish the challenge and return to Today
    const completeBtn = page.locator('.lab-screen-nav button:has-text("Finish")')
    await expect(completeBtn).toBeVisible()
    await completeBtn.click()
    await expect(page.locator('#daily-teaching')).toBeVisible()

    // Verify completed and inProgress cleared
    stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), PARTICIPATION_STORAGE_KEY)
    expect(stored.data.completedChallenges['cms:mock-single-screen-doc-1']).toBeDefined()
    expect(stored.data.inProgressChallenges['cms:mock-single-screen-doc-1']).toBeUndefined()
  })

  test('nonexistent, embargoed, or withdrawn Challenges (gateway 404) fail closed with no manuscript, title, or date leakage', async ({
    page,
  }) => {
    await serveGateway(page, () => NOT_FOUND)

    for (const link of [
      '/#/challenge/non-existent-challenge',
      '/#/challenge/scheduled-future-challenge?origin=month&yearMonth=2099-01',
      '/#/challenge/withdrawn-challenge?origin=library',
    ]) {
      await page.goto(link)
      await expect(page.locator('.empty-state h2')).toHaveText('Challenge not found')
      await expect(page.locator('.challenge-player__exit')).toHaveText('Return to Today')
      await expect(page.getByText('Not yet released')).toHaveCount(0)
      await expect(page.getByText('Scheduled Future Challenge')).toHaveCount(0)
      await expect(page.getByText(/2099/)).toHaveCount(0)
      await expect(page.locator('.lab-challenge-header')).toHaveCount(0)
      await expect(page.locator('.lab-screen')).toHaveCount(0)
      await expect(page.locator('.lab-statement')).toHaveCount(0)
      await expect(page.locator('.lab-screen-nav button:has-text("Finish")')).toHaveCount(0)

      await page.locator('.challenge-player__exit').click()
      await expect(page.locator('#daily-teaching')).toBeVisible()
      expect(page.url()).not.toContain('#/challenge/')
    }
  })

  test('displays validation error notice when gateway payload fails schema validation', async ({
    page,
  }) => {
    // Missing screens and primaryScripture violates schema
    await serveGateway(page, () => ready({
      _id: 'bad-doc-id',
      _type: 'challenge',
      title: 'Broken Challenge',
      slug: 'broken-challenge',
      screens: [],
    }))

    await page.goto('/#/challenge/broken-challenge')
    await expect(page.locator('.error-panel h2')).toHaveText('Challenge content unavailable')
    await expect(page.locator('.lab-screen')).toHaveCount(0)

    await page.locator('.challenge-player__exit').click()
    await expect(page.locator('#daily-teaching')).toBeVisible()
  })

  test('gateway errors show a recoverable error panel without Sanity fallback and recover on Retry', async ({ page }) => {
    await serveGateway(page, (_slug, call) => call === 1
      ? { status: 503, body: { ok: false, error: { kind: 'upstreamError', message: 'Service temporarily unavailable' } } }
      : ready(makeMockChallenge()))

    await page.goto('/#/challenge/mock-released-challenge')

    // First request failed: error panel appears with Retry button, no content
    await expect(page.locator('.error-panel h2')).toHaveText('Unable to load Challenge')
    await expect(page.locator('.lab-screen')).toHaveCount(0)
    const retryBtn = page.locator('.error-panel button:has-text("Retry")')
    await expect(retryBtn).toBeVisible()

    // Click Retry
    await retryBtn.click()

    // Second request succeeds: ChallengePlayer renders
    await expect(page.locator('.lab-challenge-header h1')).toHaveText('Mock Released Challenge')
    await expect(page.locator('.lab-screen .eyebrow')).toHaveText('Step 1')
  })

  test('bottom navigation bar clicks navigate cleanly away from released Challenge', async ({
    page,
  }) => {
    await serveGateway(page, () => ready(makeMockChallenge()))

    await page.goto('/#/challenge/mock-released-challenge')
    await expect(page.locator('.lab-challenge-header h1')).toHaveText('Mock Released Challenge')

    // Click Foundations in bottom nav
    await page.locator('.app-shell nav button:has-text("Foundations")').first().click()
    await expect(page.locator('.foundations-page')).toBeVisible()
    expect(page.url()).not.toContain('#/challenge/')
  })
})
