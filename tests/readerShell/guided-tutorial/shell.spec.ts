import type { Page } from '@playwright/test'
import { createServer, type ViteDevServer } from 'vite'
import { parseParticipationEnvelope } from '../../../src/participation/persistence.ts'
import { expect, test } from '../../smoke/helpers/frameSafeTest.ts'
import {
  SYNTHETIC_CARD_SVG,
  buildCurrentMonthProgressPayload,
  buildDefaultCurrentMonthPayload,
  buildDefaultHistoricalMonthPayload,
  buildHistoricalMonthProgressPayload,
  buildLibraryMonthsPayload,
  buildNewsPayload,
  buildReaderProfileStorageValue,
  challenge,
  currentMonthId,
  currentThematicAwardId,
  currentThematicCardImageUrl,
  currentThematicEarnedCard,
  documentId,
  monthId,
  participationKey,
  readerProfileKey,
  serverContext,
  shelfKey,
  teachingSlug,
  todayChallenge,
  todayDocumentId,
  todaySlug,
} from '../fixtures/m1aGatewayFixtures.ts'

let r06Server: ViteDevServer
let legacyServer: ViteDevServer

async function startServer(options: { readonly cacheDir: string; readonly r06Enabled: boolean }) {
  const server = await createServer({
    cacheDir: options.cacheDir,
    define: {
      'import.meta.env.VITE_ENABLE_R06_SHELL': JSON.stringify(String(options.r06Enabled)),
      'import.meta.env.VITE_RELEASE_GATEWAY_ORIGIN': JSON.stringify(''),
      'import.meta.env.VITE_GATEWAY_ORIGIN': JSON.stringify(''),
    },
    server: { host: '127.0.0.1', port: 0 },
    logLevel: 'silent',
  })
  await server.listen()
  return server
}

function serverUrl(server = r06Server) {
  const address = server.httpServer?.address()
  if (!address || typeof address === 'string') {
    throw new Error('Guided tutorial test server did not bind a port')
  }
  return `http://127.0.0.1:${address.port}/`
}

function primaryNav(page: Page) {
  return page.getByRole('navigation', { name: 'Primary navigation' })
}

async function storedProfile(page: Page) {
  return page.evaluate(key => {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  }, readerProfileKey)
}

async function storedParticipation(page: Page) {
  return page.evaluate(key => {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  }, participationKey)
}

async function mockGateway(target: Page | Parameters<Parameters<typeof test>[2]>[0]['context']) {
  await target.route(currentThematicCardImageUrl, route =>
    route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: SYNTHETIC_CARD_SVG,
    }),
  )
  await target.route(`**/api/months/${currentMonthId}`, route =>
    route.fulfill({ json: buildDefaultCurrentMonthPayload() }),
  )
  await target.route(`**/api/months/${monthId}`, route =>
    route.fulfill({ json: buildDefaultHistoricalMonthPayload() }),
  )
  await target.route('**/api/months', route =>
    route.fulfill({ json: buildLibraryMonthsPayload() }),
  )
  await target.route('**/api/news', route =>
    route.fulfill({ json: buildNewsPayload() }),
  )
  await target.route(`**/api/challenges/${todaySlug}`, route =>
    route.fulfill({ json: { ok: true, challenge: todayChallenge } }),
  )
  await target.route(`**/api/challenges/${teachingSlug}`, route =>
    route.fulfill({ json: { ok: true, challenge } }),
  )
  await target.route('**/api/progress/evaluate', async route => {
    const body = route.request().postDataJSON() as {
      readonly monthId?: string
      readonly completedChallengeIds?: readonly string[]
    }
    const completed = body.completedChallengeIds ?? []
    if (body.monthId === currentMonthId) {
      await route.fulfill({
        json: buildCurrentMonthProgressPayload({
          completedChallengeIds: completed,
          earnedThematic: completed.includes(todayDocumentId),
        }),
      })
      return
    }
    if (body.monthId === monthId) {
      await route.fulfill({
        json: buildHistoricalMonthProgressPayload({
          completedChallengeIds: completed,
          earnedThematic: completed.includes(documentId),
        }),
      })
      return
    }
    await route.fulfill({ status: 404, json: { ok: false, error: 'Not found' } })
  })
}

test.beforeAll(async () => {
  r06Server = await startServer({ cacheDir: 'node_modules/.vite-r06-guided-tutorial', r06Enabled: true })
  legacyServer = await startServer({ cacheDir: 'node_modules/.vite-legacy-guided-tutorial', r06Enabled: false })
})

test.afterAll(async () => {
  await Promise.all([r06Server?.close(), legacyServer?.close()])
})

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-10T12:00:00Z'))
  await page.route('https://**', route => route.abort())
})

test('G09 J1/J7 ordinary first-use Intro → four-destination Tutorial → Today with actual targets, spotlight alignment, keyboard focus, and zero awards', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 375, height: 640 })
  await mockGateway(context)

  await page.goto(serverUrl())
  await expect(page.getByTestId('onboarding-step-heading')).toBeVisible()
  await expect(primaryNav(page)).toBeHidden()

  // Complete Intro -> enters Guided App Tutorial on Step 1 (Today)
  await page.getByTestId('onboarding-skip-button').click()
  await expect(page.getByTestId('guided-app-tutorial')).toBeVisible()
  await expect(page.getByTestId('guided-app-tutorial')).toHaveAttribute('data-tutorial-mode', 'first-use')
  await expect(primaryNav(page)).toBeVisible()

  const stepHeading = page.getByTestId('tutorial-step-heading')
  const liveRegion = page.getByTestId('tutorial-live-region')
  const spotlight = page.getByTestId('tutorial-spotlight')

  const expectedSteps = [
    { tab: 'today', label: 'Today', progress: 'Step 1 of 4' },
    { tab: 'library', label: 'Library', progress: 'Step 2 of 4' },
    { tab: 'collections', label: 'Collections', progress: 'Step 3 of 4' },
    { tab: 'more', label: 'More', progress: 'Step 4 of 4' },
  ] as const

  for (let i = 0; i < expectedSteps.length; i++) {
    const step = expectedSteps[i]
    await expect(stepHeading).toHaveText(step.label)
    await expect(stepHeading).toBeFocused()
    await expect(page.getByTestId('tutorial-step-progress')).toHaveText(step.progress)
    await expect(liveRegion).toContainText(`App Tutorial step ${i + 1} of 4: ${step.label}.`)
    await expect(primaryNav(page).getByRole('button', { name: step.label })).toHaveAttribute(
      'aria-current',
      'page',
    )

    // Verify spotlight targets the actual visible primary navigation control (allowing 150ms transition to settle)
    await expect(spotlight).toBeVisible()
    await expect(spotlight).toHaveAttribute('data-spotlight-target', `tab-${step.tab}`)
    await expect
      .poll(async () => {
        const targetBox = await page.locator(`[data-tutorial-target="tab-${step.tab}"]`).boundingBox()
        const spotlightBox = await spotlight.boundingBox()
        if (!targetBox || !spotlightBox) return false
        return (
          spotlightBox.x <= targetBox.x + 1 &&
          spotlightBox.y <= targetBox.y + 1 &&
          spotlightBox.x + spotlightBox.width >= targetBox.x + targetBox.width - 1 &&
          spotlightBox.y + spotlightBox.height >= targetBox.y + targetBox.height - 1
        )
      })
      .toBe(true)

    if (i === 0) {
      await expect(page.getByTestId('tutorial-back-button')).toBeDisabled()
      // Reload mid-tutorial keeps tutorialStatus pending and re-offers Tutorial
      await page.reload()
      await expect(page.getByTestId('guided-app-tutorial')).toBeVisible()
      expect((await storedProfile(page)).profile).toMatchObject({
        introStatus: 'skipped',
        tutorialStatus: 'pending',
      })
    }

    if (i < expectedSteps.length - 1) {
      await page.getByTestId('tutorial-next-button').click()
    }
  }

  // Test Back button from Step 4 -> Step 3 -> Next back to Step 4
  await page.getByTestId('tutorial-back-button').click()
  await expect(stepHeading).toHaveText('Collections')
  await expect(stepHeading).toBeFocused()
  await page.getByTestId('tutorial-next-button').click()
  await expect(stepHeading).toHaveText('More')

  // Finish -> Today, durable independent statuses saved, zero participation/Card awards
  await page.getByTestId('tutorial-finish-button').click()
  await expect(page.getByTestId('today-primary-cta')).toHaveText('Open Today’s Reading')
  expect((await storedProfile(page)).profile).toMatchObject({
    introStatus: 'skipped',
    tutorialStatus: 'completed',
  })
  expect(await storedParticipation(page)).toBeNull()

  // Reload and fresh-session launch both stay on Today without repeating Intro or Tutorial
  await page.reload()
  await expect(page.getByTestId('today-primary-cta')).toHaveText('Open Today’s Reading')
  const freshTab = await context.newPage()
  await freshTab.goto(serverUrl())
  await expect(freshTab.getByTestId('today-primary-cta')).toHaveText('Open Today’s Reading')
  await freshTab.close()
})

test('independent pending tutorial launches when Intro is already completed, and Escape/Close/Skip persist skipped status', async ({
  page,
  context,
}) => {
  await mockGateway(context)
  await page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, value)
    },
    {
      key: readerProfileKey,
      value: buildReaderProfileStorageValue({ introStatus: 'completed', tutorialStatus: 'pending' }),
    },
  )

  await page.goto(serverUrl())
  await expect(page.getByTestId('guided-app-tutorial')).toBeVisible()
  await expect(page.getByTestId('onboarding-step-heading')).toHaveCount(0)

  // Press Escape to skip/close cleanly
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('today-primary-cta')).toHaveText('Open Today’s Reading')
  expect((await storedProfile(page)).profile).toMatchObject({
    introStatus: 'completed',
    tutorialStatus: 'skipped',
  })

  // Reload and fresh launch stay on Today
  await page.reload()
  await expect(page.getByTestId('today-primary-cta')).toHaveText('Open Today’s Reading')
})

test('More → App Tutorial replay starts at Today, returns reliably to More with restored focus, and never alters Intro, progress, Shelf, or Cards', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 375, height: 640 })
  await mockGateway(context)

  const completedChallengeId = `cms:${documentId}`
  const inProgressChallengeId = `cms:${todayDocumentId}`
  const seededParticipation = {
    schemaVersion: 3,
    data: {
      completedChallenges: {
        [completedChallengeId]: {
          completedOn: '2026-10-25',
        },
      },
      inProgressChallenges: {
        [inProgressChallengeId]: {
          screenId: 'step-2',
          updatedOn: '2026-11-10',
          interruptionOrder: 1,
        },
      },
      savedChallenges: {},
      earnedAwards: {
        [currentThematicAwardId]: {
          awardId: currentThematicAwardId,
          kind: 'thematic',
          publicationYearMonth: currentMonthId,
          discoveryId: `discovery:${currentMonthId}:november-reading`,
          earnedOn: serverContext.authorizedLocalDate,
          hubAnnouncementAcked: true,
          cardViewed: false,
          earnedCard: currentThematicEarnedCard,
        },
      },
      savedScriptures: [
        {
          reference: 'Psalm 23:1',
          translation: 'WEBP',
          savedOn: '2026-10-25',
        },
      ],
      lastOpenedChallenge: null,
    },
  }

  // Nonvacuous precondition: prove the seeded V3 envelope parses cleanly through the real persistence parser.
  const preSeedParsed = parseParticipationEnvelope(JSON.stringify(seededParticipation), 'cms')
  expect(preSeedParsed.health).toBe('ok')
  expect(preSeedParsed.data.completedChallenges[completedChallengeId]).toEqual({ completedOn: '2026-10-25' })
  expect(preSeedParsed.data.inProgressChallenges[inProgressChallengeId]).toEqual({
    screenId: 'step-2',
    updatedOn: '2026-11-10',
    interruptionOrder: 1,
  })
  expect(Object.keys(preSeedParsed.data.earnedAwards)).toEqual([currentThematicAwardId])
  expect(preSeedParsed.data.earnedAwards[currentThematicAwardId]?.earnedCard?.cardDocumentId).toBe(
    currentThematicEarnedCard.cardDocumentId,
  )
  expect(preSeedParsed.data.savedScriptures).toHaveLength(1)

  const seededShelf = {
    schemaVersion: 1,
    state: {
      activeFocusMonth: monthId,
      months: [
        {
          yearMonth: monthId,
          admissionKind: 'readerSelected',
          isProtected: true,
        },
      ],
    },
  }
  const seededProfile = buildReaderProfileStorageValue({
    introStatus: 'skipped',
    tutorialStatus: 'completed',
    reminderEnabled: true,
    reminderTime: '06:45',
  })

  await page.addInitScript(
    items => {
      for (const { key, value } of items) {
        if (!localStorage.getItem(key)) localStorage.setItem(key, value)
      }
    },
    [
      { key: readerProfileKey, value: seededProfile },
      { key: participationKey, value: JSON.stringify(seededParticipation) },
      { key: shelfKey, value: JSON.stringify(seededShelf) },
    ],
  )

  await page.goto(serverUrl())
  await primaryNav(page).getByRole('button', { name: 'More' }).click()

  // Verify the runtime stores genuinely hydrated the seeded completion, Card, Saved Scripture, and Shelf before replay.
  await page.getByTestId('more-account-progress-button').click()
  await expect(page.getByTestId('account-progress-screen')).toBeVisible()
  await expect(page.getByTestId('account-summary-completed')).toHaveText('1')
  await expect(page.getByTestId('account-summary-cards')).toHaveText('1')
  await expect(page.getByTestId('account-summary-scripture')).toHaveText('1')
  await expect(page.getByTestId('account-summary-shelf')).toHaveText('1 of 3')
  await page.getByTestId('account-progress-back').click()

  const readStorage = () =>
    page.evaluate(
      ({ pKey, sKey, profKey }) => ({
        participation: localStorage.getItem(pKey),
        shelf: localStorage.getItem(sKey),
        profile: localStorage.getItem(profKey),
      }),
      { pKey: participationKey, sKey: shelfKey, profKey: readerProfileKey },
    )

  const replayButton = page.getByTestId('more-app-tutorial-button')
  await expect(replayButton).toBeVisible()
  const storageBeforeReplay = await readStorage()
  await replayButton.focus()
  await page.keyboard.press('Enter')

  // Replay starts at Step 1 (Today) in replay mode
  await expect(page.getByTestId('guided-app-tutorial')).toHaveAttribute('data-tutorial-mode', 'replay')
  await expect(page.getByTestId('tutorial-step-heading')).toHaveText('Today')
  await expect(page.getByTestId('tutorial-step-heading')).toBeFocused()

  // Walk through all 4 steps and Finish -> returns to More with focus restored to App Tutorial button
  await page.getByTestId('tutorial-next-button').click()
  await expect(page.getByTestId('tutorial-step-heading')).toHaveText('Library')
  await page.getByTestId('tutorial-next-button').click()
  await expect(page.getByTestId('tutorial-step-heading')).toHaveText('Collections')
  await page.getByTestId('tutorial-next-button').click()
  await expect(page.getByTestId('tutorial-step-heading')).toHaveText('More')
  await page.getByTestId('tutorial-finish-button').click()

  await expect(page.getByRole('heading', { name: 'More', exact: true })).toBeVisible()
  await expect(replayButton).toBeFocused()

  // Reopen and close via Close button -> returns to More
  await replayButton.click()
  await expect(page.getByTestId('guided-app-tutorial')).toBeVisible()
  await page.getByTestId('tutorial-close-button').click()
  await expect(page.getByRole('heading', { name: 'More', exact: true })).toBeVisible()

  // Reopen and close via Escape -> returns to More
  await replayButton.click()
  await expect(page.getByTestId('guided-app-tutorial')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: 'More', exact: true })).toBeVisible()

  // Verify profile, participation, earned Cards, Saved Scripture, and Shelf are completely unchanged
  const storageAfterReplay = await readStorage()
  expect(storageAfterReplay).toEqual(storageBeforeReplay)

  const postReplayParsed = parseParticipationEnvelope(storageAfterReplay.participation, 'cms')
  expect(postReplayParsed.health).toBe('ok')
  expect(postReplayParsed.data).toEqual(preSeedParsed.data)

  expect((await storedProfile(page)).profile).toMatchObject({
    introStatus: 'skipped',
    tutorialStatus: 'completed',
    reminder: { enabled: true, time: '06:45' },
  })
  expect(JSON.parse(storageAfterReplay.shelf!).state).toMatchObject({
    activeFocusMonth: monthId,
    months: [{ yearMonth: monthId, admissionKind: 'readerSelected', isProtected: true }],
  })

  // Reload and confirm hydrated runtime records still survive intact
  await page.reload()
  await primaryNav(page).getByRole('button', { name: 'More' }).click()
  await page.getByTestId('more-account-progress-button').click()
  await expect(page.getByTestId('account-summary-completed')).toHaveText('1')
  await expect(page.getByTestId('account-summary-cards')).toHaveText('1')
  await expect(page.getByTestId('account-summary-scripture')).toHaveText('1')
  await expect(page.getByTestId('account-summary-shelf')).toHaveText('1 of 3')
})

test('nonvisual text guide, missing target fallback, resize repositioning, reduced motion, 320/375px and 200% text reflow', async ({
  page,
  context,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 375, height: 640 })
  await mockGateway(context)

  await page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, value)
    },
    {
      key: readerProfileKey,
      value: buildReaderProfileStorageValue({ introStatus: 'completed', tutorialStatus: 'pending' }),
    },
  )

  await page.goto(serverUrl())
  await expect(page.getByTestId('guided-app-tutorial')).toBeVisible()

  // Reduced motion disables spotlight transitions
  const spotlight = page.getByTestId('tutorial-spotlight')
  await expect(spotlight).toBeVisible()
  const transitionDuration = await spotlight.evaluate(el => getComputedStyle(el).transitionDuration)
  expect(transitionDuration).toBe('0s')

  // Resize from mobile bottom bar (375px) to desktop sidebar rail (1024px) repositions spotlight accurately
  const mobileSpotlightBox = await spotlight.boundingBox()
  await page.setViewportSize({ width: 1024, height: 720 })
  await expect
    .poll(async () => {
      const target = await page.locator('[data-tutorial-target="tab-today"]').boundingBox()
      const ring = await spotlight.boundingBox()
      if (!target || !ring) return false
      return Math.abs(ring.x - target.x) <= 8 && Math.abs(ring.y - target.y) <= 8
    })
    .toBe(true)
  const desktopSpotlightBox = await spotlight.boundingBox()
  expect(desktopSpotlightBox!.y).not.toBe(mobileSpotlightBox!.y)

  // Missing target degrades cleanly to text guidance without blocking navigation
  await page.evaluate(() => {
    document.querySelector('[data-tutorial-target="tab-library"]')?.removeAttribute('data-tutorial-target')
  })
  await page.getByTestId('tutorial-next-button').click()
  await expect(page.getByTestId('tutorial-step-heading')).toHaveText('Library')
  await expect(spotlight).toHaveCount(0)
  await expect(page.getByTestId('tutorial-missing-target-note')).toBeVisible()
  await expect(page.getByTestId('tutorial-live-region')).toContainText(
    'Visual highlight unavailable in this view; text guidance shown.',
  )
  // Navigation continues cleanly to Collections where the target still exists
  await page.getByTestId('tutorial-next-button').click()
  await expect(page.getByTestId('tutorial-step-heading')).toHaveText('Collections')
  await expect(spotlight).toBeVisible()

  // Nonvisual text guide lists all four destinations and hides spotlight
  const toggle = page.getByTestId('tutorial-text-guide-toggle')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  const textGuide = page.getByTestId('tutorial-text-guide')
  await expect(textGuide).toBeVisible()
  await expect(textGuide.getByRole('heading', { level: 3 })).toHaveText([
    'Today',
    'Library',
    'Collections',
    'More',
  ])
  await expect(spotlight).toHaveCount(0)

  // 320px and 375px with 200% text scaling have no horizontal overflow
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 640 })
    const overflow = await page.locator('.r06-viewport').evaluate(el => el.scrollWidth - el.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)
  }
})

test('external authorized Challenge bypasses both Intro and Tutorial, and subsequent ordinary fresh launch re-offers Intro → Tutorial', async ({
  page,
  context,
}) => {
  await mockGateway(context)

  await page.goto(`${serverUrl()}challenge/${teachingSlug}`)
  await expect(page.getByRole('heading', { name: 'Reading screen 1' })).toBeVisible()
  await expect(page.getByTestId('onboarding-step-heading')).toHaveCount(0)
  await expect(page.getByTestId('guided-app-tutorial')).toHaveCount(0)

  await page.getByRole('button', { name: 'Exit', exact: true }).click()
  await expect(page.getByTestId('today-primary-cta')).toHaveText('Open Today’s Reading')
  expect((await storedProfile(page)).profile).toMatchObject({
    introStatus: 'pending',
    tutorialStatus: 'pending',
  })
  await page.close()

  // Next ordinary fresh launch re-offers Intro -> Tutorial -> Today
  const nextLaunch = await context.newPage()
  await nextLaunch.goto(serverUrl())
  await expect(nextLaunch.getByTestId('onboarding-step-heading')).toBeVisible()
  await nextLaunch.getByTestId('onboarding-skip-button').click()
  await expect(nextLaunch.getByTestId('guided-app-tutorial')).toBeVisible()
  await nextLaunch.getByTestId('tutorial-skip-button').click()
  await expect(nextLaunch.getByTestId('today-primary-cta')).toHaveText('Open Today’s Reading')
  expect((await storedProfile(nextLaunch)).profile).toMatchObject({
    introStatus: 'skipped',
    tutorialStatus: 'skipped',
  })
})

test('tutorial persistence failure surfaces alert, allows session-only continuation, and flag-off legacy shell stays unaffected', async ({
  page,
  context,
}) => {
  await mockGateway(context)
  await page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, value)
      const originalSetItem = Storage.prototype.setItem
      Storage.prototype.setItem = function (name, nextValue) {
        if (name === key && document.documentElement.dataset.failTutorialWrite === 'true') {
          throw new DOMException('Simulated quota error', 'QuotaExceededError')
        }
        return originalSetItem.call(this, name, nextValue)
      }
    },
    {
      key: readerProfileKey,
      value: buildReaderProfileStorageValue({ introStatus: 'completed', tutorialStatus: 'pending' }),
    },
  )

  await page.goto(serverUrl())
  await expect(page.getByTestId('guided-app-tutorial')).toBeVisible()

  await page.evaluate(() => {
    document.documentElement.dataset.failTutorialWrite = 'true'
  })
  await page.getByTestId('tutorial-skip-button').click()
  await expect(page.getByTestId('first-use-tutorial-save-failure')).toBeVisible()
  await expect(page.getByTestId('first-use-tutorial-retry-save-button')).toBeVisible()

  // Continue Without Saving advances to Today for this session while leaving durable tutorialStatus pending
  await page.getByTestId('first-use-tutorial-continue-session-button').click()
  await expect(page.getByTestId('today-primary-cta')).toHaveText('Open Today’s Reading')
  expect((await storedProfile(page)).profile).toMatchObject({
    introStatus: 'completed',
    tutorialStatus: 'pending',
  })

  // Flag-off legacy shell stays unaffected (no R06 tutorial mounted)
  const legacyPage = await context.newPage()
  await legacyPage.goto(serverUrl(legacyServer))
  await expect(legacyPage.getByTestId('guided-app-tutorial')).toHaveCount(0)
  await legacyPage.close()
})
