import { test, expect } from './helpers/frameSafeTest'

const PROTOTYPE_STORAGE_KEY = 'bibleberry-prototype-v1'
const PARTICIPATION_STORAGE_KEY = 'bibleberry-reader-participation-v1'

const makeMockGatewayChallenge = (overrides = {}) => ({
  _id: 'mock-gateway-challenge-doc-1',
  _type: 'challenge',
  title: 'Walking in the Light',
  slug: 'walking-in-the-light',
  challengeType: 'teaching',
  series: {
    _id: 'mock-gateway-series-doc-1',
    title: 'Epistle of 1 John',
    slug: '1-john',
  },
  sequence: 1,
  releaseAt: '2026-11-02T09:00:00-05:00',
  primaryScripture: {
    reference: '1 John 1:7',
    translation: 'ESV',
    textStatus: 'provided',
    passage: 'If we walk in the light, as he is in the light, we have fellowship with one another.',
    usageRightsConfirmed: true,
    practiceStatus: 'configured',
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
          text: 'This is the first step delivered through the secure gateway.',
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
          text: 'This is the final step delivered through the secure gateway.',
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

test.describe('Gateway-Backed Released Challenge Integration (R05 Stage 2A)', () => {
  let uncaughtErrors: Error[] = []
  let sanityRequestCount = 0

  test.beforeEach(async ({ page }) => {
    uncaughtErrors = []
    sanityRequestCount = 0

    page.on('pageerror', err => uncaughtErrors.push(err))
    await page.clock.setFixedTime(new Date('2026-11-06T12:00:00Z'))

    // CRITICAL: Intercept any direct Sanity network calls to prove that gateway mode
    // NEVER silently falls back to or contacts Sanity directly
    await page.route('https://*.api.sanity.io/**', route => {
      sanityRequestCount++
      return route.abort('failed')
    })
  })

  test.afterEach(async () => {
    expect(uncaughtErrors).toEqual([])
    expect(sanityRequestCount).toBe(0) // Zero direct Sanity calls permitted
  })

  test('loads eligible Challenge from gateway, navigates screens, saves, reloads to resume, and completes into guest participation store', async ({
    page,
  }) => {
    let gatewayRequestCount = 0
    let requestedUrl = ''

    // Intercept gateway request: GET /api/challenges/:slug
    await page.route('**/api/challenges/**', async route => {
      gatewayRequestCount++
      requestedUrl = route.request().url()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          challenge: makeMockGatewayChallenge(),
        }),
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

    // Deep-link to the gateway-backed Challenge
    await page.goto('/#/challenge/walking-in-the-light')

    // Screen 1 should render with title, heading, and statement
    await expect(page.locator('.lab-challenge-header h1')).toHaveText('Walking in the Light')
    await expect(page.locator('.lab-screen .eyebrow')).toHaveText('Step 1')
    await expect(page.locator('.lab-screen h2')).toHaveText('First Step Heading')
    await expect(page.locator('.lab-statement p')).toContainText(
      'This is the first step delivered through the secure gateway.',
    )

    // Verify gateway was called for this slug and Sanity was NOT called
    expect(requestedUrl).toContain('/api/challenges/walking-in-the-light')
    expect(gatewayRequestCount).toBeGreaterThanOrEqual(1)
    expect(sanityRequestCount).toBe(0)

    // Verify canonical participation identity stored under cms:<documentId>
    let stored = await page.evaluate(key => {
      const raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    }, PARTICIPATION_STORAGE_KEY)
    expect(stored).not.toBeNull()
    expect(stored.data.lastOpenedChallenge?.challengeId).toBe('cms:mock-gateway-challenge-doc-1')
    expect(stored.data.lastOpenedChallenge?.openedOn).toBe('2026-11-06')

    // Bookmark/Save the Challenge
    const bookmarkBtn = page.locator('.lab-save-challenge')
    await bookmarkBtn.click()

    stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), PARTICIPATION_STORAGE_KEY)
    expect(stored.data.savedChallenges['cms:mock-gateway-challenge-doc-1']).toBeDefined()

    // Advance to Screen 2
    await page.locator('.lab-screen-nav button:has-text("Continue")').click()
    await expect(page.locator('.lab-screen .eyebrow')).toHaveText('Step 2')
    await expect(page.locator('.lab-screen h2')).toHaveText('Second Step Heading')

    // Confirm durable progress recorded screen-step-2
    stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), PARTICIPATION_STORAGE_KEY)
    expect(stored.data.inProgressChallenges['cms:mock-gateway-challenge-doc-1']?.screenId).toBe(
      'screen-step-2',
    )

    // Reload page: resumes directly at Screen 2
    await page.reload()
    await expect(page.locator('.lab-screen .eyebrow')).toHaveText('Step 2')
    await expect(page.locator('.lab-screen h2')).toHaveText('Second Step Heading')

    // Reaching the final screen without tapping Finish must NOT complete the Challenge
    stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), PARTICIPATION_STORAGE_KEY)
    expect(stored.data.completedChallenges['cms:mock-gateway-challenge-doc-1']).toBeUndefined()

    // Explicitly Finish the Challenge on the final screen -> records once and returns immediately to origin without confirmation panel or toast
    const finishBtn = page.locator('.lab-screen-nav button:has-text("Finish")')
    await expect(finishBtn).toHaveText('Finish')
    await finishBtn.click()
    await expect(page.locator('#daily-teaching')).toBeVisible()
    await expect(page.locator('.lab-completion')).toHaveCount(0)
    await expect(page.locator('.toast.is-visible')).toHaveCount(0)
    expect(page.url()).not.toContain('#/challenge/')

    // Verify durable completion recorded under cms:mock-gateway-challenge-doc-1 and inProgress cleared
    stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), PARTICIPATION_STORAGE_KEY)
    expect(stored.data.completedChallenges['cms:mock-gateway-challenge-doc-1']).toBeDefined()
    expect(stored.data.completedChallenges['cms:mock-gateway-challenge-doc-1'].completedOn).toBe(
      '2026-11-06',
    )
    expect(stored.data.inProgressChallenges['cms:mock-gateway-challenge-doc-1']).toBeUndefined()
  })

  test('displays neutral unavailable empty state without leaking embargoed content on HTTP 404', async ({
    page,
  }) => {
    await page.route('**/api/challenges/**', async route => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: false,
          error: { kind: 'notFound', message: 'Challenge not found' },
        }),
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

    await page.goto('/#/challenge/embargoed-secret-manuscript')

    // Must show neutral "Challenge not found" empty state
    await expect(page.locator('.empty-state h2')).toHaveText('Challenge not found')
    await expect(page.locator('.empty-state p')).toContainText('embargoed-secret-manuscript')
    await expect(page.locator('.empty-state p')).toContainText('is not available in the catalog')

    // Ensure zero manuscript, screen, or block elements leak
    await expect(page.locator('.lab-challenge-header')).toHaveCount(0)
    await expect(page.locator('.lab-screen')).toHaveCount(0)
    await expect(page.locator('.lab-statement')).toHaveCount(0)

    // Return button works and navigates back to Today
    const returnBtn = page.locator('.challenge-player__exit')
    await expect(returnBtn).toHaveText(/Return to Today/)
    await returnBtn.click()

    await expect(page.locator('#daily-teaching')).toBeVisible()
    expect(page.url()).not.toContain('#/challenge/')
  })

  test('displays recoverable error panel on gateway 502/500 and recovers on Retry without Sanity fallback', async ({
    page,
  }) => {
    let callCount = 0

    await page.route('**/api/challenges/**', async route => {
      callCount++
      if (callCount === 1) {
        await route.fulfill({
          status: 502,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: false,
            error: { kind: 'upstreamError', message: 'Upstream content service unavailable' },
          }),
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            challenge: makeMockGatewayChallenge(),
          }),
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

    await page.goto('/#/challenge/walking-in-the-light')

    // First attempt fails with error panel
    await expect(page.locator('.error-panel h2')).toHaveText('Unable to load Challenge')
    const retryBtn = page.locator('.error-panel button:has-text("Retry")')
    await expect(retryBtn).toBeVisible()

    // Click Retry: re-requests gateway and recovers
    await retryBtn.click()

    await expect(page.locator('.lab-challenge-header h1')).toHaveText('Walking in the Light')
    await expect(page.locator('.lab-screen .eyebrow')).toHaveText('Step 1')
    expect(callCount).toBe(2)
    expect(sanityRequestCount).toBe(0)
  })

  test('fails closed with validation error when gateway returns malformed or invalid payload', async ({
    page,
  }) => {
    await page.route('**/api/challenges/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        // Incomplete document missing screens and primaryScripture
        body: JSON.stringify({
          ok: true,
          challenge: {
            _id: 'bad-doc',
            _type: 'challenge',
            title: 'Incomplete',
            slug: 'incomplete-challenge',
          },
        }),
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

    await page.goto('/#/challenge/incomplete-challenge')
    await expect(page.locator('.error-panel h2')).toHaveText('Challenge content unavailable')

    await page.locator('.challenge-player__exit').click()
    await expect(page.locator('#daily-teaching')).toBeVisible()
    expect(sanityRequestCount).toBe(0)
  })

  test('cancels in-flight request and prevents stale response rendering when slug changes', async ({
    page,
  }) => {
    // Intercept slug-a with artificial delay, and slug-b immediately
    await page.route('**/api/challenges/slug-a', async route => {
      // Delay response for slug-a
      await new Promise(resolve => setTimeout(resolve, 800))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          challenge: makeMockGatewayChallenge({
            _id: 'doc-a',
            title: 'Challenge A (Stale)',
            slug: 'slug-a',
          }),
        }),
      })
    })

    await page.route('**/api/challenges/slug-b', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          challenge: makeMockGatewayChallenge({
            _id: 'doc-b',
            title: 'Challenge B (Target)',
            slug: 'slug-b',
          }),
        }),
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

    // Start navigating to slug-a
    await page.goto('/#/challenge/slug-a')

    // Quickly navigate to slug-b before slug-a finishes
    await page.evaluate(() => {
      window.location.hash = '#/challenge/slug-b'
    })

    // Confirm that Challenge B renders, never Challenge A
    await expect(page.locator('.lab-challenge-header h1')).toHaveText('Challenge B (Target)')

    // Wait past slug-a's delayed resolution to guarantee it did not overwrite slug-b
    await page.waitForTimeout(1000)
    await expect(page.locator('.lab-challenge-header h1')).toHaveText('Challenge B (Target)')
    expect(sanityRequestCount).toBe(0)
  })

  test('renders, navigates, saves bookmark, and completes released Challenge when client device clock is set before release date', async ({
    page,
  }) => {
    // Challenge release is scheduled for Nov 2, 2026.
    // Client device clock is artificially set to Nov 1, 2026 (before release).
    // Because the secure gateway returned HTTP 200, the server authorization is authoritative
    // and desynchronized client time must not block the reader.
    await page.clock.setFixedTime(new Date('2026-11-01T00:00:00Z'))

    await page.route('**/api/challenges/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          challenge: makeMockGatewayChallenge({
            releaseAt: '2026-11-02T09:00:00-05:00',
          }),
        }),
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

    await page.goto('/#/challenge/walking-in-the-light')

    // Must render the Challenge even though client clock is set prior to releaseAt
    await expect(page.locator('.lab-challenge-header h1')).toHaveText('Walking in the Light')
    await expect(page.locator('.lab-screen .eyebrow')).toHaveText('Step 1')
    await expect(page.locator('.lab-screen h2')).toHaveText('First Step Heading')

    // Bookmark / Save the Challenge
    await page.locator('.lab-save-challenge').click()

    // Advance to Screen 2
    await page.locator('.lab-screen-nav button:has-text("Continue")').click()
    await expect(page.locator('.lab-screen .eyebrow')).toHaveText('Step 2')

    // Finish the Challenge and return immediately to Today without intermediate confirmation
    await page.locator('.lab-screen-nav button:has-text("Finish")').click()
    await expect(page.locator('#daily-teaching')).toBeVisible()
    await expect(page.locator('.lab-completion')).toHaveCount(0)
    expect(page.url()).not.toContain('#/challenge/')

    // Verify stored participation under canonical cms:<documentId>
    const stored = await page.evaluate(key => {
      const raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    }, PARTICIPATION_STORAGE_KEY)

    expect(stored.data.completedChallenges['cms:mock-gateway-challenge-doc-1']).toBeDefined()
    expect(stored.data.savedChallenges['cms:mock-gateway-challenge-doc-1']).toBeDefined()
    expect(sanityRequestCount).toBe(0)
  })

  test('displays neutral unavailable empty state on HTTP 404 even when client device clock is set far in the future', async ({
    page,
  }) => {
    // Client device clock is set far into the future (year 2099)
    await page.clock.setFixedTime(new Date('2099-01-01T00:00:00Z'))

    await page.route('**/api/challenges/**', async route => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: false,
          error: { kind: 'notFound', message: 'Challenge not found' },
        }),
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

    await page.goto('/#/challenge/unreleased-future-challenge')

    // Neutral not-found state displayed; must not reveal release dates or say "Not yet released"
    await expect(page.locator('.empty-state h2')).toHaveText('Challenge not found')
    await expect(page.locator('.empty-state p')).toContainText('unreleased-future-challenge')
    await expect(page.locator('.empty-state p')).toContainText('is not available in the catalog')

    // Zero manuscript leakage
    await expect(page.locator('.lab-challenge-header')).toHaveCount(0)
    await expect(page.locator('.lab-screen')).toHaveCount(0)
    expect(sanityRequestCount).toBe(0)
  })

  test('preserves injected Month, Shelf, and Library origin contexts on Finish and exit without bypassing release checks', async ({
    page,
  }) => {
    await page.route('**/api/challenges/**', async route => {
      if (route.request().url().includes('embargoed-secret')) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, error: { kind: 'notFound', message: 'Challenge not found' } }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          challenge: makeMockGatewayChallenge({
            releaseAt: undefined,
            series: undefined,
            sequence: undefined,
            calendarSlot: {
              monthId: '2027-03',
              documentId: 'month-2027-03',
              monthTitle: 'Abiding in the Vine',
              publicationDate: '2027-03-01',
              dayOfMonth: 1,
            },
          }),
        }),
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

    // 1. Month origin: Finish records completion and returns with Month origin metadata
    await page.goto('/#/challenge/walking-in-the-light?origin=month&yearMonth=2027-03')
    await expect(page.locator('.challenge-player__exit')).toHaveText('Return to March 2027')
    await page.locator('.lab-screen-nav button:has-text("Continue")').click()
    await page.locator('.lab-screen-nav button:has-text("Finish")').click()

    await expect(page.locator('#daily-teaching')).toBeVisible()
    await expect(page.locator('.lab-completion')).toHaveCount(0)
    await expect(page.locator('.toast.is-visible')).toHaveCount(0)
    const monthReturnedOrigin = await page.evaluate(() => window.history.state?.returnedChallengeOrigin)
    expect(monthReturnedOrigin).toEqual({ kind: 'month', yearMonth: '2027-03' })

    // 2. Shelf origin: already-completed Challenge hydrates cleanly without spurious navigation, supports reread & Finish exit
    await page.goto('/#/challenge/walking-in-the-light?origin=shelf&yearMonth=2026-10')
    await expect(page.locator('.lab-challenge-header h1')).toHaveText('Walking in the Light')
    await expect(page.locator('.challenge-player__exit')).toHaveText('Return to Shelf · October 2026')
    await expect(page.locator('.lab-screen h2')).toHaveText('First Step Heading')
    await page.locator('.lab-screen-nav button:has-text("Continue")').click()
    await expect(page.locator('.lab-screen h2')).toHaveText('Second Step Heading')
    await expect(page.locator('.lab-completion')).toHaveCount(0)
    await page.locator('.lab-screen-nav button:has-text("Finish")').click()

    await expect(page.locator('#daily-teaching')).toBeVisible()
    const shelfReturnedOrigin = await page.evaluate(() => window.history.state?.returnedChallengeOrigin)
    expect(shelfReturnedOrigin).toEqual({ kind: 'shelf', yearMonth: '2026-10' })

    // Verify completedOn date was NOT duplicated or altered during reread
    const storedAfterReread = await page.evaluate(
      key => JSON.parse(localStorage.getItem(key) || '{}'),
      PARTICIPATION_STORAGE_KEY,
    )
    expect(storedAfterReread.data.completedChallenges['cms:mock-gateway-challenge-doc-1']).toEqual({
      completedOn: '2026-11-06',
    })

    // 3. Library origin: exit control uses captured origin
    await page.goto('/#/challenge/walking-in-the-light?origin=library&yearMonth=2026-09')
    await expect(page.locator('.challenge-player__exit')).toHaveText('Return to Library · September 2026')
    await page.locator('.challenge-player__exit').click()
    await expect(page.locator('#daily-teaching')).toBeVisible()
    const libraryReturnedOrigin = await page.evaluate(() => window.history.state?.returnedChallengeOrigin)
    expect(libraryReturnedOrigin).toEqual({ kind: 'library', yearMonth: '2026-09' })

    // 4. Malformed origin degrades gracefully to Hub fallback
    await page.goto('/#/challenge/walking-in-the-light?origin=month&yearMonth=bad')
    await expect(page.locator('.challenge-player__exit')).toHaveText('Return to Today')

    // 5. User-supplied origin never bypasses content-release checks
    await page.goto('/#/challenge/embargoed-secret?origin=month&yearMonth=2027-03')
    await expect(page.locator('.empty-state h2')).toHaveText('Challenge not found')
    await expect(page.locator('.challenge-player__exit')).toHaveText('Return to March 2027')
    await expect(page.locator('.lab-screen')).toHaveCount(0)
  })
})
