import { test, expect } from '@playwright/test'

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

test.describe('Controlled Released CMS Challenge Integration (A4.1)', () => {
  let uncaughtErrors: Error[] = []

  test.beforeEach(async ({ page }) => {
    uncaughtErrors = []
    page.on('pageerror', err => uncaughtErrors.push(err))
    await page.clock.setFixedTime(new Date('2026-11-06T12:00:00Z'))
  })

  test.afterEach(async () => {
    expect(uncaughtErrors).toEqual([])
  })

  test('loads eligible Challenge, navigates screens, bookmarks, reloads to resume, and completes into guest participation store', async ({
    page,
  }) => {
    await page.route('https://*.api.sanity.io/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ result: [makeMockChallenge()] }),
      })
    })

    await page.addInitScript(storageKey => {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          onboarded: true,
          appearance: 'system',
          textSize: 'default',
          reminderEnabled: false,
          reminderTime: '08:00',
          explored: [],
          journey: [],
          lastOpened: null,
          resumeDismissedDate: '',
        }),
      )
    }, PROTOTYPE_STORAGE_KEY)

    // Deep-link to the released Challenge
    await page.goto('/#/challenge/mock-released-challenge')

    // Screen 1 should render with title, heading, and statement
    await expect(page.locator('.lab-challenge-header h1')).toHaveText('Mock Released Challenge')
    await expect(page.locator('.lab-screen .eyebrow')).toHaveText('Step 1')
    await expect(page.locator('.lab-screen h2')).toHaveText('First Step Heading')
    await expect(page.locator('.lab-statement p')).toContainText(
      'This is the first step of the released challenge.',
    )

    // Progress record after open
    let stored = await page.evaluate(key => {
      const raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    }, PARTICIPATION_STORAGE_KEY)
    expect(stored).not.toBeNull()
    expect(stored.data.lastOpenedChallenge?.challengeId).toBe('cms:mock-released-challenge-doc-1')
    expect(stored.data.lastOpenedChallenge?.openedOn).toBe('2026-11-06')

    // Bookmark/Save the Challenge
    const bookmarkBtn = page.locator('.lab-save-challenge')
    await bookmarkBtn.click()

    stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), PARTICIPATION_STORAGE_KEY)
    expect(stored.data.savedChallenges['cms:mock-released-challenge-doc-1']).toBeDefined()

    // Advance to Screen 2
    await page.locator('.lab-screen-nav button:has-text("Continue")').click()
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

    // Explicitly complete the Challenge on the final screen
    await page.locator('.lab-screen-nav button:has-text("Complete Challenge")').click()
    await expect(page.locator('.lab-completion')).toBeVisible()

    // Verify durable completion recorded and inProgress cleared
    stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), PARTICIPATION_STORAGE_KEY)
    expect(stored.data.completedChallenges['cms:mock-released-challenge-doc-1']).toBeDefined()
    expect(stored.data.completedChallenges['cms:mock-released-challenge-doc-1'].completedOn).toBe(
      '2026-11-06',
    )
    expect(stored.data.inProgressChallenges['cms:mock-released-challenge-doc-1']).toBeUndefined()
  })

  test('single-screen Challenge supports Start Challenge button lifecycle and completion', async ({
    page,
  }) => {
    await page.route('https://*.api.sanity.io/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ result: [makeSingleScreenChallenge()] }),
      })
    })

    await page.addInitScript(storageKey => {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          onboarded: true,
          appearance: 'system',
          textSize: 'default',
          reminderEnabled: false,
          reminderTime: '08:00',
          explored: [],
          journey: [],
          lastOpened: null,
          resumeDismissedDate: '',
        }),
      )
    }, PROTOTYPE_STORAGE_KEY)

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

    // Complete the challenge
    const completeBtn = page.locator('.lab-screen-nav button:has-text("Complete Challenge")')
    await expect(completeBtn).toBeVisible()
    await completeBtn.click()

    // Verify completed and inProgress cleared
    stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), PARTICIPATION_STORAGE_KEY)
    expect(stored.data.completedChallenges['cms:mock-single-screen-doc-1']).toBeDefined()
    expect(stored.data.inProgressChallenges['cms:mock-single-screen-doc-1']).toBeUndefined()
  })

  test('displays not found empty state when slug is not in the catalog', async ({ page }) => {
    await page.route('https://*.api.sanity.io/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ result: [makeMockChallenge()] }),
      })
    })

    await page.addInitScript(storageKey => {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          onboarded: true,
          appearance: 'system',
          textSize: 'default',
          reminderEnabled: false,
          reminderTime: '08:00',
          explored: [],
          journey: [],
          lastOpened: null,
          resumeDismissedDate: '',
        }),
      )
    }, PROTOTYPE_STORAGE_KEY)

    await page.goto('/#/challenge/non-existent-challenge')
    await expect(page.locator('.empty-state h2')).toHaveText('Challenge not found')
    await expect(page.locator('.empty-state p')).toContainText('non-existent-challenge')

    // Return button returns to Today
    const returnBtn = page.locator('.challenge-player__exit')
    await expect(returnBtn).toHaveText(/Return to Today/)
    await returnBtn.click()

    await expect(page.locator('#daily-teaching')).toBeVisible()
    expect(page.url()).not.toContain('#/challenge/')
  })

  test('displays embargoed empty state with scheduled date for future-released Challenges without leaking content', async ({
    page,
  }) => {
    const futureChallenge = makeMockChallenge({
      title: 'Secret Future Challenge',
      slug: 'secret-future-challenge',
      releaseAt: '2099-01-01T09:00:00-05:00',
    })

    await page.route('https://*.api.sanity.io/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ result: [futureChallenge] }),
      })
    })

    await page.addInitScript(storageKey => {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          onboarded: true,
          appearance: 'system',
          textSize: 'default',
          reminderEnabled: false,
          reminderTime: '08:00',
          explored: [],
          journey: [],
          lastOpened: null,
          resumeDismissedDate: '',
        }),
      )
    }, PROTOTYPE_STORAGE_KEY)

    await page.goto('/#/challenge/secret-future-challenge')

    await expect(page.locator('.empty-state h2')).toHaveText('Not yet released')
    await expect(page.locator('.empty-state p')).toContainText('Secret Future Challenge')
    await expect(page.locator('.empty-state p')).toContainText('January 1, 2099')

    // Zero ChallengePlayer elements rendered
    await expect(page.locator('.challenge-player')).toHaveCount(0)
    await expect(page.locator('.challenge-block--statement')).toHaveCount(0)

    // Return button works
    await page.locator('.challenge-player__exit').click()
    await expect(page.locator('#daily-teaching')).toBeVisible()
  })

  test('displays validation error notice when catalog payload fails schema validation', async ({
    page,
  }) => {
    // Missing screens array violates schema
    const invalidChallenge = {
      _id: 'bad-doc-id',
      _type: 'challenge',
      title: 'Broken Challenge',
      slug: 'broken-challenge',
      screens: [],
    }

    await page.route('https://*.api.sanity.io/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ result: [invalidChallenge] }),
      })
    })

    await page.addInitScript(storageKey => {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          onboarded: true,
          appearance: 'system',
          textSize: 'default',
          reminderEnabled: false,
          reminderTime: '08:00',
          explored: [],
          journey: [],
          lastOpened: null,
          resumeDismissedDate: '',
        }),
      )
    }, PROTOTYPE_STORAGE_KEY)

    await page.goto('/#/challenge/broken-challenge')
    await expect(page.locator('.error-panel h2')).toHaveText('Challenge content unavailable')

    await page.locator('.challenge-player__exit').click()
    await expect(page.locator('#daily-teaching')).toBeVisible()
  })

  test('displays error panel on network failure and recovers upon clicking Retry', async ({ page }) => {
    let callCount = 0

    await page.route('https://*.api.sanity.io/**', async route => {
      callCount++
      if (callCount === 1) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Service temporarily unavailable' }),
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ result: [makeMockChallenge()] }),
        })
      }
    })

    await page.addInitScript(storageKey => {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          onboarded: true,
          appearance: 'system',
          textSize: 'default',
          reminderEnabled: false,
          reminderTime: '08:00',
          explored: [],
          journey: [],
          lastOpened: null,
          resumeDismissedDate: '',
        }),
      )
    }, PROTOTYPE_STORAGE_KEY)

    await page.goto('/#/challenge/mock-released-challenge')

    // First request failed: error panel appears with Retry button
    await expect(page.locator('.error-panel h2')).toHaveText('Unable to load Challenge')
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
    await page.route('https://*.api.sanity.io/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ result: [makeMockChallenge()] }),
      })
    })

    await page.addInitScript(storageKey => {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          onboarded: true,
          appearance: 'system',
          textSize: 'default',
          reminderEnabled: false,
          reminderTime: '08:00',
          explored: [],
          journey: [],
          lastOpened: null,
          resumeDismissedDate: '',
        }),
      )
    }, PROTOTYPE_STORAGE_KEY)

    await page.goto('/#/challenge/mock-released-challenge')
    await expect(page.locator('.lab-challenge-header h1')).toHaveText('Mock Released Challenge')

    // Click Foundations in bottom nav
    await page.locator('.app-shell nav button:has-text("Foundations")').first().click()
    await expect(page.locator('.foundations-page')).toBeVisible()
    expect(page.url()).not.toContain('#/challenge/')
  })
})
