import type { Page } from '@playwright/test'
import { createServer, type Plugin, type ViteDevServer } from 'vite'
import { expect, test } from '../../smoke/helpers/frameSafeTest.ts'
import {
  RESTRICTED_CARD_ART_SENTINEL,
  RESTRICTED_CARD_IMAGE_URL,
  RESTRICTED_MANUSCRIPT_SENTINEL,
  SYNTHETIC_CARD_SVG,
  awardId,
  buildCurrentMonthProgressPayload,
  buildDefaultCurrentMonthPayload,
  buildDefaultHistoricalMonthPayload,
  buildGuestParticipationStorageValue,
  buildGuestShelfStorageValue,
  buildHistoricalMonthProgressPayload,
  buildLibraryMonthsPayload,
  buildNewsPayload,
  buildReaderProfileStorageValue,
  buildUnauthorizedChallengeFixture,
  challenge,
  currentMonthId,
  currentThematicCardImageUrl,
  documentId,
  monthId,
  monthIntroKey,
  navigationKey,
  participationKey,
  readerProfileKey,
  shelfKey,
  teachingSlug,
  todayChallenge,
  todayDocumentId,
  todaySlug,
  unreleasedFutureSlug,
} from '../fixtures/m1aGatewayFixtures.ts'

let r06Server: ViteDevServer
let legacyServer: ViteDevServer
let seamServer: ViteDevServer

function seamEntryPlugin(): Plugin {
  return {
    name: 'r06-first-use-seam-entry',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url ?? '/').split('?')[0]
        if (
          req.method === 'GET' &&
          !path.startsWith('/@') &&
          !path.startsWith('/src/') &&
          !path.startsWith('/tests/') &&
          !path.startsWith('/node_modules/') &&
          !path.includes('.')
        ) {
          const html = await server.transformIndexHtml(
            req.url ?? '/',
            '<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Bibleberry Seam Test</title></head><body><div id="root"></div><script type="module" src="/tests/readerShell/first-use/seamHarness.tsx"></script></body></html>',
          )
          res.statusCode = 200
          res.setHeader('Content-Type', 'text/html')
          res.end(html)
          return
        }
        next()
      })
    },
  }
}

async function startServer(options: {
  readonly cacheDir: string
  readonly r06Enabled: boolean
  readonly seam?: boolean
}) {
  const server = await createServer({
    cacheDir: options.cacheDir,
    plugins: options.seam ? [seamEntryPlugin()] : undefined,
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
    throw new Error('First-use test server did not bind a port')
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
    return raw ? JSON.parse(raw).data : undefined
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
  await target.route(`**/api/challenges/${teachingSlug}`, route =>
    route.fulfill({ json: { ok: true, challenge } }),
  )
  await target.route(`**/api/challenges/${todaySlug}`, route =>
    route.fulfill({ json: { ok: true, challenge: todayChallenge } }),
  )
  await target.route('**/api/library/months**', route =>
    route.fulfill({ json: buildLibraryMonthsPayload() }),
  )
  await target.route('**/api/news**', route => {
    const category = new URL(route.request().url()).searchParams.get('category')
    return route.fulfill({ json: buildNewsPayload(category) })
  })
  await target.route(`**/api/months/${monthId}`, route =>
    route.fulfill({ json: buildDefaultHistoricalMonthPayload() }),
  )
  await target.route(`**/api/months/${currentMonthId}`, route =>
    route.fulfill({ json: buildDefaultCurrentMonthPayload() }),
  )
  await target.route(`**/api/months/${currentMonthId}/progress`, route => {
    const ids = route.request().postDataJSON().completedChallengeIds as string[]
    return route.fulfill({ json: buildCurrentMonthProgressPayload(ids) })
  })
  await target.route(`**/api/months/${monthId}/progress`, route => {
    const ids = route.request().postDataJSON().completedChallengeIds as string[]
    return route.fulfill({ json: buildHistoricalMonthProgressPayload(ids) })
  })
}

test.beforeAll(async () => {
  ;[r06Server, legacyServer, seamServer] = await Promise.all([
    startServer({ cacheDir: 'node_modules/.vite/r06-first-use-enabled', r06Enabled: true }),
    startServer({ cacheDir: 'node_modules/.vite/r06-first-use-disabled', r06Enabled: false }),
    startServer({ cacheDir: 'node_modules/.vite/r06-first-use-seam', r06Enabled: true, seam: true }),
  ])
})

test.afterAll(async () => {
  await Promise.all([r06Server?.close(), legacyServer?.close(), seamServer?.close()])
})

test.beforeEach(async ({ context }) => {
  await context.clock.setFixedTime(new Date('2026-11-10T12:00:00Z'))
  await context.route('https://**', route => route.abort())
})

test('G09 J1 ordinary fresh launch shows 3-screen Introduction with keyboard/a11y reflow, preserves pending Tutorial status, and reaches Today without altering participation', async ({
  page,
  context,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 320, height: 640 })
  await mockGateway(context)

  await page.goto(serverUrl())

  const stepHeading = page.getByTestId('onboarding-step-heading')
  const liveRegion = page.getByTestId('onboarding-live-announcement')
  await expect(stepHeading).toContainText('A quiet place tomeet with Scripture.')
  await expect(stepHeading).toBeFocused()
  await expect(liveRegion).toHaveText('Welcome step 1 of 3: A quiet place to meet with Scripture.')
  await expect(primaryNav(page)).toBeHidden()
  await expect(page.getByRole('main')).toHaveCount(1)

  // Verify 320px & 375px at 200% text reflow without horizontal overflow
  await page.addStyleTag({ content: 'html { font-size: 200%; }' })
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 640 })
    const overflow = await page.locator('.r06-viewport').evaluate(el => el.scrollWidth - el.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)
  }
  await page.evaluate(() => {
    document.querySelectorAll('style').forEach(node => {
      if (node.textContent?.includes('font-size: 200%')) node.remove()
    })
  })

  // Advance to Step 2 via keyboard, verify reload mid-Introduction keeps Intro pending and active
  await page.getByTestId('onboarding-continue-button').focus()
  await page.keyboard.press('Enter')
  await expect(stepHeading).toContainText('Nothing to catch up on.')
  await expect(stepHeading).toBeFocused()
  await expect(liveRegion).toHaveText(
    'Welcome step 2 of 3: Nothing to catch up on. No streak to protect.',
  )
  expect((await storedProfile(page)).profile).toMatchObject({
    introStatus: 'pending',
    tutorialStatus: 'pending',
  })

  await page.reload()
  await expect(stepHeading).toContainText('A quiet place tomeet with Scripture.')
  await expect(primaryNav(page)).toBeHidden()

  // Walk through Step 1 -> Step 2 -> Step 3, choose a reminder time, and Finish -> Today (never Foundations)
  await page.getByTestId('onboarding-continue-button').click()
  await page.getByTestId('onboarding-continue-button').click()
  await expect(liveRegion).toHaveText('Welcome step 3 of 3: Make room for a daily pause.')
  await page.getByLabel('Suggested reminder time').fill('07:15')
  await page.getByTestId('onboarding-finish-button').click()

  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
  await expect(primaryNav(page)).toBeVisible()
  await expect(primaryNav(page).getByRole('button', { name: 'Today' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await expect(page.getByTestId('today-primary-cta')).toHaveText('Open Today’s Reading')

  expect((await storedProfile(page)).profile).toMatchObject({
    introStatus: 'completed',
    tutorialStatus: 'pending',
    reminder: { enabled: true, time: '07:15' },
  })
  expect(await storedParticipation(page)).toBeUndefined()

  // Reload and fresh-session launch (new tab sharing localStorage) both stay on Today without repeating Introduction
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
  const nextLaunchTab = await context.newPage()
  await nextLaunchTab.goto(serverUrl())
  await expect(nextLaunchTab.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
  await nextLaunchTab.close()
})

test('G09 J1 honors Introduction Skip and Step 2 Continue to Today independently of Tutorial status', async ({
  page,
  context,
}) => {
  await mockGateway(page)
  await page.goto(serverUrl())
  await page.getByTestId('onboarding-skip-button').click()

  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
  expect((await storedProfile(page)).profile).toMatchObject({
    introStatus: 'skipped',
    tutorialStatus: 'pending',
    reminder: { enabled: false, time: '08:00' },
  })

  // Separate clean page verifies Step 2 "Continue to Today"
  const secondContext = await context.browser()!.newContext()
  try {
    const page2 = await secondContext.newPage()
    await page2.clock.setFixedTime(new Date('2026-11-10T12:00:00Z'))
    await page2.route('https://**', route => route.abort())
    await mockGateway(page2)
    await page2.goto(serverUrl())
    await page2.getByTestId('onboarding-continue-button').click()
    await page2.getByTestId('onboarding-continue-today-button').click()

    await expect(page2.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
    expect((await storedProfile(page2)).profile).toMatchObject({
      introStatus: 'completed',
      tutorialStatus: 'pending',
      reminder: { enabled: false, time: '08:00' },
    })
  } finally {
    await secondContext.close()
  }
})

test('G09 J1 sequences Introduction → pending Guided Tutorial seam (when present) → Today with independent durable flags and zero awards', async ({
  page,
}) => {
  await mockGateway(page)
  await page.addInitScript(() => {
    ;(window as unknown as { __r06EnableTutorialSeam?: boolean }).__r06EnableTutorialSeam = true
  })

  await page.goto(serverUrl(seamServer))
  await expect(page.getByTestId('onboarding-step-heading')).toBeVisible()
  await expect(primaryNav(page)).toBeHidden()

  // Skipping Intro advances to the Tutorial seam rather than auto-skipping Tutorial
  await page.getByTestId('onboarding-skip-button').click()
  const tutorial = page.getByTestId('synthetic-tutorial-seam')
  await expect(tutorial).toBeVisible()
  await expect(primaryNav(page)).toBeVisible()
  expect((await storedProfile(page)).profile).toMatchObject({
    introStatus: 'skipped',
    tutorialStatus: 'pending',
  })

  await tutorial.getByRole('button', { name: 'Preview Library Step' }).click()
  await expect(page.getByTestId('synthetic-tutorial-tab')).toHaveText('Shown tab: library')
  await expect(primaryNav(page).getByRole('button', { name: 'Library' })).toHaveAttribute(
    'aria-current',
    'page',
  )

  await tutorial.getByRole('button', { name: 'Complete Tutorial' }).click()
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
  expect((await storedProfile(page)).profile).toMatchObject({
    introStatus: 'skipped',
    tutorialStatus: 'completed',
  })
  expect(await storedParticipation(page)).toBeUndefined()
})

test('G09 J2 cold authorized external Challenge (hash & path) bypasses Intro/Tutorial/Month Intro, returns Exit/Finish to Today, and re-offers Intro on next ordinary fresh launch', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 375, height: 640 })
  await mockGateway(context)

  // 1. Cold path-based external link with forged ?origin=month&yearMonth=2026-10
  await page.goto(`${serverUrl()}challenge/${teachingSlug}?origin=month&yearMonth=${monthId}`)
  const position = page.getByRole('progressbar', { name: 'Challenge screen position' })
  await expect(position).toHaveAttribute('aria-valuetext', 'Screen 1 of 2')
  await expect(primaryNav(page)).toBeHidden()
  await expect(page.getByTestId('onboarding-step-heading')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Test month overview' })).toHaveCount(0)
  await expect(page).toHaveURL(new RegExp(`/#\\/challenge\\/${teachingSlug}$`))

  // Advance to Screen 2 and Exit -> returns to Today without an onboarding wall; Intro & Tutorial stay pending
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(position).toHaveAttribute('aria-valuetext', 'Screen 2 of 2')
  await page.getByRole('button', { name: 'Exit', exact: true }).click()

  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
  await expect(primaryNav(page)).toBeVisible()
  await expect(page.getByTestId('onboarding-step-heading')).toHaveCount(0)
  expect((await storedProfile(page)).profile).toMatchObject({
    introStatus: 'pending',
    tutorialStatus: 'pending',
  })
  expect(await page.evaluate(key => localStorage.getItem(key), monthIntroKey)).toBeNull()

  // Reloading Today within the same session stays on Today (no mid-session onboarding wall)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
  await expect(page.getByTestId('onboarding-step-heading')).toHaveCount(0)
  await page.close()

  // 2. Cold hash external link in a fresh session resumes at Screen 2, Finishes -> returns to Today, keeps onboarding pending
  const hashSessionPage = await context.newPage()
  await hashSessionPage.setViewportSize({ width: 375, height: 640 })
  await hashSessionPage.goto(
    `${serverUrl()}#/challenge/${teachingSlug}?origin=month&yearMonth=${monthId}`,
  )
  await expect(
    hashSessionPage.getByRole('progressbar', { name: 'Challenge screen position' }),
  ).toHaveAttribute('aria-valuetext', 'Screen 2 of 2')
  await hashSessionPage.getByRole('button', { name: 'Finish', exact: true }).click()

  await expect(hashSessionPage.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
  await expect
    .poll(async () => Object.keys((await storedParticipation(hashSessionPage))?.earnedAwards ?? {}))
    .toEqual([awardId])
  expect(Object.keys((await storedParticipation(hashSessionPage)).completedChallenges)).toEqual([
    `cms:${documentId}`,
  ])
  expect((await storedProfile(hashSessionPage)).profile).toMatchObject({
    introStatus: 'pending',
    tutorialStatus: 'pending',
  })
  expect(await hashSessionPage.evaluate(key => localStorage.getItem(key), monthIntroKey)).toBeNull()
  await hashSessionPage.close()

  // 3. Next ordinary fresh launch (new browser tab opening `/`) re-offers the pending App Introduction while preserving participation!
  const ordinaryLaunchPage = await context.newPage()
  await ordinaryLaunchPage.setViewportSize({ width: 375, height: 640 })
  await ordinaryLaunchPage.goto(serverUrl())
  await expect(ordinaryLaunchPage.getByTestId('onboarding-step-heading')).toContainText(
    'A quiet place tomeet with Scripture.',
  )
  await expect(primaryNav(ordinaryLaunchPage)).toBeHidden()
  await ordinaryLaunchPage.getByTestId('onboarding-skip-button').click()
  await expect(
    ordinaryLaunchPage.getByRole('heading', { name: 'Today', exact: true }),
  ).toBeVisible()
  expect((await storedProfile(ordinaryLaunchPage)).profile).toMatchObject({
    introStatus: 'skipped',
    tutorialStatus: 'pending',
  })
  expect(Object.keys((await storedParticipation(ordinaryLaunchPage)).completedChallenges)).toEqual([
    `cms:${documentId}`,
  ])
  expect(Object.keys((await storedParticipation(ordinaryLaunchPage)).earnedAwards)).toEqual([
    awardId,
  ])
  await ordinaryLaunchPage.close()
})

test('G09 J2 warm external ingress preempts active first-use Introduction without marking onboarding complete, and fails closed on unauthorized/forged/withdrawn links', async ({
  page,
}) => {
  await mockGateway(page)
  await page.route(`**/api/challenges/${unreleasedFutureSlug}`, route =>
    route.fulfill({ status: 404, json: { ok: false, error: 'Not found' } }),
  )
  await page.route('**/api/challenges/unreviewed-external', route =>
    route.fulfill({
      json: {
        ok: true,
        challenge: buildUnauthorizedChallengeFixture({
          slug: 'unreviewed-external',
          documentId: 'unreviewed-doc',
          dayOfMonth: 12,
        }),
      },
    }),
  )

  // Start on first-use Introduction in the seam server (supports warm subscribeUrlOpen + hash ingress)
  await page.goto(serverUrl(seamServer))
  await expect(page.getByTestId('onboarding-step-heading')).toBeVisible()

  // Warm authorized external deep link via controller preempts Intro -> opens Challenge directly -> Exit returns to Today
  await page.evaluate(
    slug => {
      ;(window as unknown as { __r06EmitWarmExternalUrl?: (url: string) => void }).__r06EmitWarmExternalUrl?.(
        `https://reader.example.test/challenge/${slug}?origin=month&yearMonth=2026-10`,
      )
    },
    teachingSlug,
  )
  await expect(page.getByRole('heading', { name: 'Reading screen 1' })).toBeVisible()
  await expect(primaryNav(page)).toBeHidden()
  expect((await storedProfile(page)).profile).toMatchObject({
    introStatus: 'pending',
    tutorialStatus: 'pending',
  })

  await page.getByRole('button', { name: 'Exit', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()

  // Warm denied/forged/unreviewed/embargoed links fail closed without leaking restricted sentinels
  for (const deniedUrl of [
    `https://reader.example.test/challenge/${unreleasedFutureSlug}`,
    'https://reader.example.test/challenge/unreviewed-external',
    `https://untrusted.example.test/challenge/${teachingSlug}`,
    `https://reader.example.test/challenge/${teachingSlug}?token=forged`,
    `https://reader.example.test/month/${monthId}`,
  ]) {
    await page.evaluate(url => {
      ;(window as unknown as { __r06EmitWarmExternalUrl?: (url: string) => void }).__r06EmitWarmExternalUrl?.(
        url,
      )
    }, deniedUrl)
    await expect(page.getByRole('button', { name: 'Return to Today' })).toBeVisible()
    await expect(page.getByText(RESTRICTED_MANUSCRIPT_SENTINEL)).toHaveCount(0)
    await expect(page.getByText(RESTRICTED_CARD_ART_SENTINEL)).toHaveCount(0)
    await expect(page.locator(`img[src="${RESTRICTED_CARD_IMAGE_URL}"]`)).toHaveCount(0)
    await page.getByRole('button', { name: 'Return to Today' }).click()
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
  }

  // Cold denied path link on fresh session also fails closed before Intro and keeps Intro pending
  const deniedFreshPage = await page.context().newPage()
  await deniedFreshPage.goto(`${serverUrl()}challenge/${unreleasedFutureSlug}`)
  await expect(
    deniedFreshPage.getByRole('heading', { name: 'Challenge unavailable' }),
  ).toBeVisible()
  await expect(deniedFreshPage.getByTestId('onboarding-step-heading')).toHaveCount(0)
  await deniedFreshPage.getByRole('button', { name: 'Return to Today' }).click()
  await expect(deniedFreshPage.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
  expect((await storedProfile(deniedFreshPage)).profile).toMatchObject({
    introStatus: 'pending',
    tutorialStatus: 'pending',
  })
  await deniedFreshPage.close()
})

test('G09 J7 More replay preserves skipped/pending statuses and all reading data, and flag-off legacy stays unaffected', async ({
  page,
  context,
}) => {
  await mockGateway(page)
  const profileSeed = buildReaderProfileStorageValue({
    introStatus: 'skipped',
    tutorialStatus: 'skipped',
    reminderEnabled: false,
    reminderTime: '08:00',
  })
  const participationSeed = buildGuestParticipationStorageValue({
    completedChallenges: { [`cms:${todayDocumentId}`]: { completedOn: '2026-11-15' } },
    inProgressChallenges: { [`cms:${documentId}`]: { updatedOn: '2026-11-15', screenId: 'step-2' } },
  })
  const shelfSeed = buildGuestShelfStorageValue({
    activeFocusMonth: monthId,
    months: [{ yearMonth: monthId, admissionKind: 'readerSelected', isProtected: true }],
  })

  await page.addInitScript(
    entries => {
      for (const [key, value] of entries) {
        if (localStorage.getItem(key) === null) localStorage.setItem(key, value)
      }
    },
    [
      [readerProfileKey, profileSeed],
      [participationKey, participationSeed],
      [shelfKey, shelfSeed],
    ],
  )

  await page.goto(serverUrl())
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
  await primaryNav(page).getByRole('button', { name: 'More', exact: true }).click()
  const reviewButton = page.getByRole('button', { name: 'Review Introduction' })
  await expect(reviewButton).toBeVisible()
  const shelfBeforeReplay = await page.evaluate(key => localStorage.getItem(key), shelfKey)

  await reviewButton.click()
  await expect(page.getByTestId('onboarding-replay-badge')).toHaveText('Replaying introduction')
  await expect(primaryNav(page)).toBeHidden()

  // Finishing replay without saving reminder preserves skipped flags, reminder, participation, and Shelf byte-for-byte
  await page.getByTestId('onboarding-continue-button').click()
  await page.getByTestId('onboarding-continue-button').click()
  await page.getByTestId('onboarding-finish-button').click()
  await expect(reviewButton).toBeFocused()
  expect(await page.evaluate(key => localStorage.getItem(key), readerProfileKey)).toBe(profileSeed)
  expect(await page.evaluate(key => localStorage.getItem(key), participationKey)).toBe(participationSeed)
  expect(await page.evaluate(key => localStorage.getItem(key), shelfKey)).toBe(shelfBeforeReplay)
  expect(JSON.parse(shelfBeforeReplay!).state).toEqual(JSON.parse(shelfSeed).state)

  // Flag-off legacy build renders legacy onboarding untouched and never writes R06 profile or session keys
  const legacyContext = await context.browser()!.newContext()
  try {
    const legacyPage = await legacyContext.newPage()
    await legacyPage.route('https://**', route => route.abort())
    await legacyPage.goto(serverUrl(legacyServer))
    await expect(legacyPage.getByRole('heading', { name: /quiet place/i })).toBeVisible()
    expect(await legacyPage.evaluate(key => localStorage.getItem(key), readerProfileKey)).toBeNull()
    expect(await legacyPage.evaluate(key => sessionStorage.getItem(key), navigationKey)).toBeNull()
  } finally {
    await legacyContext.close()
  }
})

test('G09 J1/J2 delayed onboarding write cannot clobber in-flight or active external Challenge ingress and preserves valid writes', async ({
  page,
  context,
}) => {
  await mockGateway(context)
  for (const writeOutcome of ['succeed', 'fail'] as const) {
    let challengeFetchCount = 0
    let releaseChallenge!: () => void
    const challengeGate = new Promise<void>(resolve => {
      releaseChallenge = resolve
    })
    let challengeRequested!: () => void
    const challengeRequestSeen = new Promise<void>(resolve => {
      challengeRequested = resolve
    })

    const racePage = await context.newPage()
    await racePage.route(`**/api/challenges/${teachingSlug}`, async route => {
      challengeFetchCount += 1
      challengeRequested()
      await challengeGate
      await route.fulfill({ json: { ok: true, challenge } })
    })

    await racePage.addInitScript(() => {
      ;(window as unknown as { __r06EnableTutorialSeam?: boolean }).__r06EnableTutorialSeam = true
    })
    await racePage.goto(serverUrl(seamServer))
    await expect(racePage.getByTestId('onboarding-step-heading')).toBeVisible()

    // Trigger a delayed Intro Skip write, then emit a warm external Challenge while both are in flight
    await racePage.evaluate(
      ({ shouldFail, key }) => {
        const w = window as unknown as {
          __r06DelayNextProfileUpdate?: boolean
          __r06ProfileWriteStarted?: boolean
          __r06OnProfileUpdateStarted?: () => void
        }
        w.__r06DelayNextProfileUpdate = true
        w.__r06OnProfileUpdateStarted = () => {
          w.__r06ProfileWriteStarted = true
        }
        if (shouldFail) {
          const originalSetItem = Storage.prototype.setItem
          Storage.prototype.setItem = function (name, value) {
            if (name === key) {
              throw new DOMException('Simulated quota failure', 'QuotaExceededError')
            }
            return originalSetItem.call(this, name, value)
          }
        }
      },
      { shouldFail: writeOutcome === 'fail', key: readerProfileKey },
    )

    await racePage.getByTestId('onboarding-skip-button').click()
    await expect
      .poll(() =>
        racePage.evaluate(
          () => Boolean((window as unknown as { __r06ProfileWriteStarted?: boolean }).__r06ProfileWriteStarted),
        ),
      )
      .toBe(true)

    await racePage.evaluate(
      slug => {
        ;(window as unknown as { __r06EmitWarmExternalUrl?: (url: string) => void }).__r06EmitWarmExternalUrl?.(
          `https://reader.example.test/challenge/${slug}?origin=month&yearMonth=2026-10`,
        )
      },
      teachingSlug,
    )
    await challengeRequestSeen

    // Resolve the delayed profile write while the warm external gateway request is still held:
    // neither the Tutorial seam nor Today may mount during the held request.
    await racePage.evaluate(() => {
      ;(window as unknown as { __r06ReleaseProfileUpdate?: () => void }).__r06ReleaseProfileUpdate?.()
    })
    await racePage.waitForTimeout(80)
    await expect(racePage.getByTestId('synthetic-tutorial-seam')).toHaveCount(0)
    await expect(racePage.getByRole('heading', { name: 'Today', exact: true })).toHaveCount(0)
    await expect(racePage.getByTestId('onboarding-step-heading')).toBeVisible()

    // External Challenge authorization completes and mounts using the single verified gateway fetch
    releaseChallenge()
    await expect(racePage.getByRole('heading', { name: 'Reading screen 1' })).toBeVisible()
    await expect(primaryNav(racePage)).toBeHidden()
    expect(challengeFetchCount).toBe(1)

    await racePage.getByRole('button', { name: 'Exit', exact: true }).click()
    await expect(racePage.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
    expect((await storedProfile(racePage)).profile.introStatus).toBe(
      writeOutcome === 'succeed' ? 'skipped' : 'pending',
    )
    await racePage.close()

    // Next ordinary fresh launch honors the actual persisted status
    const nextLaunch = await context.newPage()
    await nextLaunch.goto(serverUrl(seamServer))
    if (writeOutcome === 'succeed') {
      await expect(nextLaunch.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
    } else {
      await expect(nextLaunch.getByTestId('onboarding-step-heading')).toBeVisible()
    }
    await nextLaunch.close()
    await context.clearCookies()
    // Reset localStorage between sub-scenarios
    const resetPage = await context.newPage()
    await resetPage.goto(serverUrl(seamServer))
    await resetPage.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })
    await resetPage.close()
  }
  await page.close()
})

test('G09 J1 communicates onboarding save failure accurately, recovers on Try Again, and supports non-trapping session continuation without overwriting corrupt data', async ({
  page,
  context,
}) => {
  await mockGateway(context)

  // 1. Transient write failure on Step 3 Finish: communicates failure, recovers on Try Again, and persists durably
  await page.goto(serverUrl())
  await page.getByTestId('onboarding-continue-button').click()
  await page.getByTestId('onboarding-continue-button').click()
  await page.getByLabel('Suggested reminder time').fill('06:45')
  await page.evaluate(key => {
    document.documentElement.dataset.blockProfileWrite = 'true'
    const originalSetItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (name, value) {
      if (name === key && document.documentElement.dataset.blockProfileWrite === 'true') {
        throw new DOMException('Simulated profile write failure', 'QuotaExceededError')
      }
      return originalSetItem.call(this, name, value)
    }
  }, readerProfileKey)

  await page.getByTestId('onboarding-finish-button').click()
  const failureAlert = page.getByTestId('first-use-save-failure')
  await expect(failureAlert).toBeVisible()
  await expect(failureAlert).toHaveAttribute('role', 'alert')
  await expect(failureAlert).toContainText('introduction status and reminder preference could not be saved')
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toHaveCount(0)
  expect((await storedProfile(page)).profile.introStatus).toBe('pending')

  await page.evaluate(() => {
    delete document.documentElement.dataset.blockProfileWrite
  })
  await page.getByTestId('first-use-retry-save-button').click()
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
  expect((await storedProfile(page)).profile).toMatchObject({
    introStatus: 'completed',
    tutorialStatus: 'pending',
    reminder: { enabled: true, time: '06:45' },
  })

  // 2. Corrupt profile + Tutorial seam: Intro and Tutorial save failures never trap the reader or overwrite corrupt storage, and re-offer on next launch
  const corruptContext = await context.browser()!.newContext()
  try {
    await corruptContext.clock.setFixedTime(new Date('2026-11-10T12:00:00Z'))
    await corruptContext.route('https://**', route => route.abort())
    await mockGateway(corruptContext)
    const corruptPage = await corruptContext.newPage()
    await corruptPage.addInitScript(
      ({ key }) => {
        if (localStorage.getItem(key) === null) localStorage.setItem(key, '{corrupt')
        ;(window as unknown as { __r06EnableTutorialSeam?: boolean }).__r06EnableTutorialSeam = true
      },
      { key: readerProfileKey },
    )

    await corruptPage.goto(serverUrl(seamServer))
    await corruptPage.getByTestId('onboarding-skip-button').click()
    await expect(corruptPage.getByTestId('first-use-save-failure')).toContainText(
      'introduction status could not be saved',
    )
    expect(await corruptPage.evaluate(key => localStorage.getItem(key), readerProfileKey)).toBe('{corrupt')

    await corruptPage.getByTestId('first-use-continue-session-button').click()
    await expect(corruptPage.getByTestId('synthetic-tutorial-seam')).toBeVisible()
    await corruptPage.getByRole('button', { name: 'Skip Tutorial' }).click()
    await expect(corruptPage.getByTestId('first-use-tutorial-save-failure')).toContainText(
      'tutorial status could not be saved',
    )
    await corruptPage.getByTestId('first-use-tutorial-continue-session-button').click()
    await expect(corruptPage.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
    expect(await corruptPage.evaluate(key => localStorage.getItem(key), readerProfileKey)).toBe('{corrupt')

    // Next ordinary fresh launch still sees corrupt/pending state and re-offers Introduction
    const nextLaunch = await corruptContext.newPage()
    await nextLaunch.goto(serverUrl(seamServer))
    await expect(nextLaunch.getByTestId('onboarding-step-heading')).toBeVisible()
    expect(await nextLaunch.evaluate(key => localStorage.getItem(key), readerProfileKey)).toBe('{corrupt')
  } finally {
    await corruptContext.close()
  }

  // 3. Mixed failure/recovery: Intro fails -> Continue Without Saving -> Tutorial seam succeeds -> Today (not back to Intro),
  // while durable introStatus remains pending and re-offers on next ordinary fresh launch with Tutorial already completed.
  const mixedContext = await context.browser()!.newContext()
  try {
    await mixedContext.clock.setFixedTime(new Date('2026-11-10T12:00:00Z'))
    await mixedContext.route('https://**', route => route.abort())
    await mockGateway(mixedContext)
    const mixedPage = await mixedContext.newPage()
    await mixedPage.addInitScript(
      ({ key }) => {
        ;(window as unknown as { __r06EnableTutorialSeam?: boolean }).__r06EnableTutorialSeam = true
        const originalSetItem = Storage.prototype.setItem
        Storage.prototype.setItem = function (name, value) {
          if (name === key && document.documentElement.dataset.blockIntroOnce === 'true') {
            throw new DOMException('Transient Intro write failure', 'QuotaExceededError')
          }
          return originalSetItem.call(this, name, value)
        }
      },
      { key: readerProfileKey },
    )

    await mixedPage.goto(serverUrl(seamServer))
    await mixedPage.evaluate(() => {
      document.documentElement.dataset.blockIntroOnce = 'true'
    })
    await mixedPage.getByTestId('onboarding-skip-button').click()
    await expect(mixedPage.getByTestId('first-use-save-failure')).toBeVisible()

    // Continue Without Saving enters the Tutorial seam, then storage recovers before Tutorial completes
    await mixedPage.getByTestId('first-use-continue-session-button').click()
    await expect(mixedPage.getByTestId('synthetic-tutorial-seam')).toBeVisible()
    await mixedPage.evaluate(() => {
      delete document.documentElement.dataset.blockIntroOnce
    })
    await mixedPage.getByRole('button', { name: 'Complete Tutorial' }).click()

    // Must advance to Today (never bounce back to Intro in the same session), with introStatus still pending
    await expect(mixedPage.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
    expect((await storedProfile(mixedPage)).profile).toMatchObject({
      introStatus: 'pending',
      tutorialStatus: 'completed',
    })
    await mixedPage.close()

    // Next ordinary fresh launch re-offers pending Intro, and completing it goes directly to Today
    const nextLaunch = await mixedContext.newPage()
    await nextLaunch.goto(serverUrl(seamServer))
    await expect(nextLaunch.getByTestId('onboarding-step-heading')).toBeVisible()
    await nextLaunch.getByTestId('onboarding-skip-button').click()
    await expect(nextLaunch.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
    expect((await storedProfile(nextLaunch)).profile).toMatchObject({
      introStatus: 'skipped',
      tutorialStatus: 'completed',
    })
  } finally {
    await mixedContext.close()
  }
})

test('G09 J2 warm external ingress during deferred getInitialUrl holds pending without Intro/Tutorial/Today detour', async ({
  context,
}) => {
  for (const outcome of ['authorized', 'unavailable'] as const) {
    const scenarioContext = await context.browser()!.newContext()
    try {
      await scenarioContext.clock.setFixedTime(new Date('2026-11-10T12:00:00Z'))
      await scenarioContext.route('https://**', route => route.abort())
      await mockGateway(scenarioContext)

      let releaseChallenge!: () => void
      const challengeGate = new Promise<void>(resolve => {
        releaseChallenge = resolve
      })
      let challengeRequested!: () => void
      const challengeRequestSeen = new Promise<void>(resolve => {
        challengeRequested = resolve
      })

      const testPage = await scenarioContext.newPage()
      await testPage.route(`**/api/challenges/${teachingSlug}`, async route => {
        challengeRequested()
        await challengeGate
        if (outcome === 'authorized') {
          await route.fulfill({ json: { ok: true, challenge } })
        } else {
          await route.fulfill({ status: 404, json: { ok: false, error: 'Not found' } })
        }
      })

      await testPage.addInitScript(() => {
        const w = window as unknown as {
          __r06EnableTutorialSeam?: boolean
          __r06GetInitialExternalUrl?: () => Promise<string | null>
          __r06ResolveInitialUrl?: (url: string | null) => void
        }
        w.__r06EnableTutorialSeam = true
        w.__r06GetInitialExternalUrl = () =>
          new Promise<string | null>(resolve => {
            w.__r06ResolveInitialUrl = resolve
          })
      })

      await testPage.goto(serverUrl(seamServer))
      await expect(testPage.getByRole('status')).toHaveText('Opening Bibleberry…')

      // Emit a warm external Challenge while getInitialUrl is still unresolved
      await testPage.evaluate(
        slug => {
          ;(window as unknown as { __r06EmitWarmExternalUrl?: (url: string) => void }).__r06EmitWarmExternalUrl?.(
            `https://reader.example.test/challenge/${slug}?origin=month&yearMonth=2026-10`,
          )
        },
        teachingSlug,
      )
      await challengeRequestSeen

      // Resolve getInitialUrl(null) while the warm gateway response is still held:
      // must NOT fall through to Intro, Tutorial, or Today.
      await testPage.evaluate(() => {
        ;(window as unknown as { __r06ResolveInitialUrl?: (url: string | null) => void }).__r06ResolveInitialUrl?.(
          null,
        )
      })
      await testPage.waitForTimeout(80)
      await expect(testPage.getByTestId('onboarding-step-heading')).toHaveCount(0)
      await expect(testPage.getByTestId('synthetic-tutorial-seam')).toHaveCount(0)
      await expect(testPage.getByRole('heading', { name: 'Today', exact: true })).toHaveCount(0)
      await expect(testPage.getByRole('status')).toHaveText('Opening Bibleberry…')

      // Release held warm gateway response and verify final state + Exit/Return to Today + pending onboarding
      releaseChallenge()
      if (outcome === 'authorized') {
        await expect(testPage.getByRole('heading', { name: 'Reading screen 1' })).toBeVisible()
        await expect(primaryNav(testPage)).toBeHidden()
        await testPage.getByRole('button', { name: 'Exit', exact: true }).click()
      } else {
        await expect(testPage.getByRole('heading', { name: 'Challenge unavailable' })).toBeVisible()
        await testPage.getByRole('button', { name: 'Return to Today' }).click()
      }

      await expect(testPage.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
      expect((await storedProfile(testPage)).profile).toMatchObject({
        introStatus: 'pending',
        tutorialStatus: 'pending',
      })
    } finally {
      await scenarioContext.close()
    }
  }
})

test('G09 J2 cancelled cold authorization cannot commit while a warm Challenge is pending', async ({
  context,
  page,
}) => {
  await mockGateway(context)

  const coldRequested = page.waitForRequest(`**/api/challenges/${todaySlug}`)
  const coldCancelled = page.waitForEvent('requestfailed', {
    predicate: request => new URL(request.url()).pathname === `/api/challenges/${todaySlug}`,
  })
  const warmRequested = page.waitForRequest(`**/api/challenges/${teachingSlug}`)
  const { promise: coldGate, resolve: releaseCold } = Promise.withResolvers<void>()
  const { promise: warmGate, resolve: releaseWarm } = Promise.withResolvers<void>()

  await page.route(`**/api/challenges/${todaySlug}`, async route => {
    await coldGate
    await route.fulfill({ json: { ok: true, challenge: todayChallenge } })
  })
  await page.route(`**/api/challenges/${teachingSlug}`, async route => {
    await warmGate
    await route.fulfill({ json: { ok: true, challenge } })
  })

  await page.addInitScript(slug => {
    const w = window as Window & { __r06InitialExternalUrl?: string }
    w.__r06InitialExternalUrl = `https://reader.example.test/challenge/${slug}`
  }, todaySlug)

  try {
    await page.goto(serverUrl(seamServer))
    await coldRequested
    await expect(page.getByRole('status')).toHaveText('Opening Bibleberry…')

    await page.evaluate(slug => {
      const w = window as Window & { __r06EmitWarmExternalUrl?: (url: string) => void }
      w.__r06EmitWarmExternalUrl!(`https://reader.example.test/challenge/${slug}`)
    }, teachingSlug)
    await warmRequested
    await coldCancelled
    await page.evaluate(() => new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    }))

    await expect(page.getByRole('heading', { name: 'Challenge unavailable' })).toHaveCount(0)
    await expect(page.getByRole('status')).toHaveText('Opening Bibleberry…')

    releaseWarm()
    await expect(page.getByRole('heading', { name: 'Reading screen 1' })).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/#/challenge/${teachingSlug}$`))
  } finally {
    releaseCold()
    releaseWarm()
  }
})
