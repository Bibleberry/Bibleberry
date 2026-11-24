import { createServer, type ViteDevServer } from 'vite'
import type { Page } from '@playwright/test'
import { handleGatewayRequest } from '../../src/gateway/handler.ts'
import { toDereferencedMonthlyDetailDoc, toDereferencedMonthlyPreviewDoc } from '../../src/gateway/fixtures/r08aMonthlyFixtures.ts'
import { expect, test } from '../smoke/helpers/frameSafeTest.ts'
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
  buildHistoricalMonthProgressPayload,
  buildLibraryMonthsPayload,
  buildMonthPayload,
  buildNewsPayload,
  buildUnauthorizedChallengeFixture,
  challenge,
  currentFullMonthAwardId,
  currentMonthId,
  currentMonthMultiScreenChallenge,
  currentMonthMultiScreenDay,
  currentMonthMultiScreenDocumentId,
  currentMonthMultiScreenSlug,
  currentMonthTitle,
  currentThematicAwardId,
  currentThematicCardImageUrl,
  currentThematicDiscovery,
  currentThematicEarnedCard,
  documentId,
  monthId,
  monthIntroKey,
  monthTitle,
  navigationKey,
  participationKey,
  serverContext,
  shelfKey,
  teachingSlug,
  todayChallenge,
  todayDay,
  todayDocumentId,
  todayMultiScreenChallenge,
  todaySlug,
  unreleasedFutureSlug,
} from './fixtures/m1aGatewayFixtures.ts'

let enabledServer: ViteDevServer
let disabledServer: ViteDevServer

async function startReader(enabled: boolean) {
  const server = await createServer({
    cacheDir: enabled ? 'node_modules/.vite/reader-shell-enabled' : 'node_modules/.vite/reader-shell-disabled',
    define: {
      'import.meta.env.VITE_ENABLE_R06_SHELL': JSON.stringify(String(enabled)),
      'import.meta.env.VITE_RELEASE_GATEWAY_ORIGIN': JSON.stringify(''),
      'import.meta.env.VITE_GATEWAY_ORIGIN': JSON.stringify(''),
      'import.meta.env.VITE_ENABLE_FIELD_NOTEBOOK': JSON.stringify('false'),
      'import.meta.env.VITE_ENABLE_SAVED_SCRIPTURE': JSON.stringify('false'),
    },
    server: { host: '127.0.0.1', port: 0 },
    logLevel: 'silent',
  })
  await server.listen()
  return server
}

function readerUrl(server = enabledServer) {
  const address = server.httpServer?.address()
  if (!address || typeof address === 'string') throw new Error('Reader test server did not bind a port')
  return `http://127.0.0.1:${address.port}/`
}

function primaryNav(page: Page) {
  return page.getByRole('navigation', { name: 'Primary navigation' })
}

function selectTab(page: Page, name: string) {
  return primaryNav(page).getByRole('button', { name, exact: true }).click()
}

async function participation(page: Page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}').data, participationKey)
}

async function mockGateway(
  page: Page,
  options?: { readonly todayChallengeVariant?: typeof todayChallenge },
) {
  const activeTodayChallenge = options?.todayChallengeVariant ?? todayChallenge
  await page.route(currentThematicCardImageUrl, route =>
    route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: SYNTHETIC_CARD_SVG,
    }),
  )
  await page.route(`**/api/challenges/${teachingSlug}`, route => route.fulfill({ json: { ok: true, challenge } }))
  await page.route(`**/api/challenges/${todaySlug}`, route =>
    route.fulfill({ json: { ok: true, challenge: activeTodayChallenge } }),
  )
  await page.route(`**/api/challenges/${currentMonthMultiScreenSlug}`, route =>
    route.fulfill({ json: { ok: true, challenge: currentMonthMultiScreenChallenge } }),
  )
  await page.route('**/api/challenges', route => route.fulfill({
    json: {
      ok: true,
      challenges: [challenge, activeTodayChallenge, currentMonthMultiScreenChallenge],
    },
  }))
  await page.route('**/api/library/months**', route =>
    route.fulfill({ json: buildLibraryMonthsPayload() }),
  )
  await page.route('**/api/news**', route => {
    const category = new URL(route.request().url()).searchParams.get('category')
    return route.fulfill({ json: buildNewsPayload(category) })
  })
  await page.route(`**/api/months/${monthId}`, route =>
    route.fulfill({ json: buildDefaultHistoricalMonthPayload() }),
  )
  await page.route(`**/api/months/${currentMonthId}`, route =>
    route.fulfill({ json: buildDefaultCurrentMonthPayload() }),
  )
  await page.route(`**/api/months/${currentMonthId}/progress`, route => {
    const ids = route.request().postDataJSON().completedChallengeIds as string[]
    return route.fulfill({ json: buildCurrentMonthProgressPayload(ids) })
  })
  await page.route(`**/api/months/${monthId}/progress`, route => {
    const ids = route.request().postDataJSON().completedChallengeIds as string[]
    return route.fulfill({ json: buildHistoricalMonthProgressPayload(ids) })
  })
}

test.beforeAll(async () => {
  enabledServer = await startReader(true)
  disabledServer = await startReader(false)
})

test.afterAll(async () => {
  await Promise.all([enabledServer?.close(), disabledServer?.close()])
})

test.beforeEach(async ({ page }) => {
  // Keep Today’s bootstrap month deterministic while the gateway supplies the authorized date.
  await page.clock.setFixedTime(new Date('2026-11-10T12:00:00Z'))
  await page.route('https://**', route => route.abort())
})

test('opens the legacy reader with the flag off and never initializes the R06 navigation session', async ({ page }) => {
  const r06MonthRequests: string[] = []
  await page.route('**/api/months/**', async route => {
    r06MonthRequests.push(route.request().url())
    await route.abort()
  })
  await page.addInitScript(() => {
    localStorage.setItem('bibleberry-prototype-v1', JSON.stringify({ onboarded: true, appearance: 'system' }))
  })
  await page.goto(readerUrl(disabledServer))
  await expect(page.getByRole('button', { name: 'Foundations', exact: true }).filter({ visible: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Archive', exact: true }).filter({ visible: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Collections', exact: true })).toHaveCount(0)
  await expect(page.getByTestId('r06-today-landing')).toHaveCount(0)
  expect(await page.evaluate(key => sessionStorage.getItem(key), navigationKey)).toBeNull()
  expect(r06MonthRequests).toEqual([])
})

test('uses one responsive and keyboard-accessible set of four primary controls', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 560 })
  await mockGateway(page)
  await page.goto(readerUrl())
  const nav = primaryNav(page)
  await expect(nav.getByRole('button')).toHaveText(['Today', 'Library', 'Collections', 'More'])
  await expect(nav.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-current', 'page')
  const monthLink = page.getByTestId('today-current-month-link')
  await expect(monthLink).toBeVisible()
  await monthLink.focus()
  await page.keyboard.press('Tab')
  await expect(nav.getByRole('button', { name: 'Today' })).toBeFocused()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Collections' })).toBeVisible()
  await expect(nav.getByRole('button', { name: 'Collections' })).toHaveAttribute('aria-current', 'page')
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 560 })
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
    const mobile = await nav.boundingBox()
    expect(mobile?.width).toBe(width)
    expect((mobile?.y ?? 0) + (mobile?.height ?? 0)).toBe(560)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
  }

  await page.setViewportSize({ width: 1024, height: 768 })
  await page.evaluate(() => { document.documentElement.style.fontSize = '' })
  const wide = await nav.boundingBox()
  expect(wide?.x).toBe(0)
  expect(wide?.height).toBe(768)
  expect(wide?.width).toBeLessThan(260)
  await expect(page.getByRole('main')).toHaveCount(1)
  expect(await page.evaluate(() => localStorage.getItem('bibleberry-prototype-v1'))).toBeNull()
})

test('acknowledges Discoveries when returning to the retained Notebook after earning a Card on Today', async ({ page }) => {
  await mockGateway(page)
  await page.goto(readerUrl())
  await selectTab(page, 'Collections')
  await page.getByRole('button', { name: 'Field Notebook' }).click()
  await page.getByRole('button', { name: 'All Earned Cards' }).click()
  await expect(page.getByRole('heading', { name: 'No Earned Scripture Cards Yet' })).toBeVisible()

  await selectTab(page, 'Today')
  await page.getByTestId('today-primary-cta').click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('button', { name: 'Finish', exact: true }).click()
  await expect.poll(async () => (await participation(page))?.earnedAwards[currentThematicAwardId]).toMatchObject({
    hubAnnouncementAcked: false,
    cardViewed: false,
  })
  expect((await participation(page)).notebookAcknowledgedAwardIds).toBeUndefined()

  await selectTab(page, 'Collections')
  await expect(page.getByRole('button', { name: 'All Earned Cards' })).toHaveAttribute('aria-pressed', 'true')
  const card = page.getByRole('button', { name: new RegExp(currentThematicEarnedCard.title) })
  await expect(card.getByText('New', { exact: true })).toBeVisible()
  await expect.poll(async () => (await participation(page))?.notebookAcknowledgedAwardIds)
    .toEqual([currentThematicAwardId])
  expect((await participation(page)).earnedAwards[currentThematicAwardId]).toMatchObject({
    hubAnnouncementAcked: false,
    cardViewed: false,
  })
})

test('retains each tab’s screen, scroll, and focus and resets the selected tab on reselection', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 460 })
  await mockGateway(page)
  await page.goto(readerUrl())

  await selectTab(page, 'Collections')
  await page.getByRole('button', { name: 'Field Notebook' }).click()
  await expect(page.getByRole('heading', { name: 'Earned Scripture Cards', exact: true })).toBeVisible()
  const allCards = page.getByRole('button', { name: 'All Earned Cards' })
  await allCards.click()
  await expect(allCards).toHaveAttribute('aria-pressed', 'true')
  const viewport = page.locator('.r06-viewport')
  await viewport.evaluate(element => { element.scrollTop = 100 })
  await expect.poll(() => viewport.evaluate(element => element.scrollTop)).toBe(100)

  await selectTab(page, 'More')
  await page.getByRole('button', { name: 'View All News' }).click()
  await expect(page.getByRole('heading', { name: 'Ministry News' })).toBeVisible()
  await expect(page.getByText('Test ministry announcement')).toBeVisible()
  await page.getByRole('tab', { name: 'Announcements' }).click()
  await expect(page).toHaveURL(/#\/news\?category=announcement$/)

  await selectTab(page, 'Collections')
  await expect(page).toHaveURL(/#\/notebook$/)
  await expect(allCards).toHaveAttribute('aria-pressed', 'true')
  await expect(allCards).toBeFocused()
  await expect.poll(() => viewport.evaluate(element => element.scrollTop)).toBe(100)

  await selectTab(page, 'Collections')
  await expect(page.getByRole('heading', { name: 'Collections' })).toBeVisible()
  await expect.poll(() => viewport.evaluate(element => element.scrollTop)).toBe(0)
  await page.getByRole('button', { name: 'Saved Scripture', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Saved Scripture', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Back to Collections' }).click()
  await expect(page.getByRole('heading', { name: 'Collections' })).toBeVisible()

  await selectTab(page, 'More')
  await expect(page.getByRole('tab', { name: 'Announcements' })).toHaveAttribute('aria-selected', 'true')
})

test('opens a Month teaching, restores scroll and unfinished progress, and preserves earned credit on reread', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 600 })
  await mockGateway(page)
  await page.goto(readerUrl())
  await selectTab(page, 'Library')
  await expect(page.getByRole('main', { name: 'Shelf', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Foundations', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Foundations unavailable' })).toBeVisible()
  await page.getByRole('button', { name: 'Back to Library', exact: true }).click()
  await page.getByRole('button', { name: 'Browse All Months' }).click()

  await expect(page.getByRole('heading', { name: 'Historical Library' })).toBeVisible()
  await expect(page.getByRole('main')).toHaveCount(1)
  const openMonth = page.getByRole('button', { name: /Open October 2026/ })
  await openMonth.click()
  await expect(page.getByRole('heading', { name: 'Test month overview' })).toBeVisible()
  await expect(primaryNav(page)).toBeHidden()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Begin the Month' }).click()
  await expect(page.getByRole('heading', { name: monthTitle, exact: true })).toBeVisible()
  await expect(primaryNav(page)).toBeVisible()

  const viewport = page.locator('.r06-viewport')
  await expect.poll(() => viewport.evaluate(element => element.scrollTop)).toBe(0)
  const challenge = page.getByRole('button', { name: /Test Challenge 25/ })
  await challenge.scrollIntoViewIfNeeded()
  await challenge.focus()
  const scrollTop = await viewport.evaluate(element => element.scrollTop)
  expect(scrollTop).toBeGreaterThan(400)
  await challenge.press('Enter')
  const position = page.getByRole('progressbar', { name: 'Challenge screen position' })
  const button = (name: string) => page.getByRole('button', { name, exact: true })
  await expect(position).toHaveAttribute('aria-valuetext', 'Screen 1 of 2')
  await expect(primaryNav(page)).toBeHidden()
  await expect(button('Previous')).toBeDisabled()
  await button('Next').click()
  await expect(button('Start from Beginning')).toBeEnabled()
  await expect(position).toHaveAttribute('aria-valuetext', 'Screen 2 of 2')
  expect((await participation(page)).completedChallenges).toEqual({})
  await button('Exit').click()
  await expect(challenge).toBeFocused()
  await expect.poll(() => viewport.evaluate(element => element.scrollTop)).toBe(scrollTop)
  await page.goForward()
  await expect(position).toHaveAttribute('aria-valuetext', 'Screen 2 of 2')
  await page.reload()
  await expect(position).toHaveAttribute('aria-valuetext', 'Screen 2 of 2')
  await page.goBack()
  await expect(challenge).toBeFocused()
  await challenge.press('Enter')
  await expect(position).toHaveAttribute('aria-valuetext', 'Screen 2 of 2')
  const unfinished = await participation(page)
  expect(unfinished.completedChallenges).toEqual({})
  expect(unfinished.earnedAwards).toEqual({})
  expect(unfinished.inProgressChallenges[`cms:${documentId}`].screenId).toBe('step-2')
  await button('Finish').click()
  await expect(challenge).toBeFocused()
  await expect(challenge).toHaveAccessibleName(/Completed/)
  await expect.poll(async () => Object.keys((await participation(page)).earnedAwards)).toEqual([awardId])
  const finished = await participation(page)
  expect(Object.keys(finished.completedChallenges)).toEqual([`cms:${documentId}`])
  await expect.poll(() => viewport.evaluate(element => element.scrollTop)).toBe(scrollTop)
  await challenge.press('Enter')
  await expect(position).toHaveAttribute('aria-valuetext', 'Screen 1 of 2')
  await button('Next').click()
  await button('Finish').click()
  await expect(challenge).toBeFocused()
  const reread = await participation(page)
  expect(reread.completedChallenges).toEqual(finished.completedChallenges)
  expect(reread.earnedAwards).toEqual(finished.earnedAwards)

  await page.reload()
  await expect(challenge).toBeFocused()
  await expect.poll(() => viewport.evaluate(element => element.scrollTop)).toBe(scrollTop)
  await page.goBack()
  await expect(openMonth).toBeVisible()
  await page.goForward()
  await expect(challenge).toBeVisible()
})

test('restores browser entries and safely handles invalid routes and a failed gateway', async ({ page }) => {
  await mockGateway(page)
  await page.addInitScript(() => {
    window.history.replaceState({ ...window.history.state, unrelated: 'preserved' }, '')
  })
  await page.goto(readerUrl() + '#/field-notebook')
  await expect(page).toHaveURL(/#\/notebook$/)
  await expect(page.getByRole('heading', { name: 'Earned Scripture Cards', exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.history.state.unrelated)).toBe('preserved')
  await selectTab(page, 'More')
  await page.getByRole('button', { name: 'View All News' }).click()
  await expect(page).toHaveURL(/#\/news$/)
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'More', exact: true })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Earned Scripture Cards', exact: true })).toBeVisible()
  await page.goForward()
  await page.goForward()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Ministry News' })).toBeVisible()

  await page.evaluate(() => { window.location.hash = '#/studio' })
  await expect(page.getByRole('heading', { name: 'Page unavailable' })).toBeVisible()
  await expect(page).toHaveURL(/#\/$/)
  await page.getByRole('button', { name: 'Return to Today' }).click()
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
  await page.evaluate(() => { window.location.hash = '#/month/2026-99' })
  await expect(page.getByRole('heading', { name: 'Page unavailable' })).toBeVisible()

  const challengeRequests: string[] = []
  await page.route('**/api/challenges/**', async route => {
    challengeRequests.push(route.request().url())
    await route.abort()
  })
  await page.evaluate(() => {
    window.location.hash = '#/challenge/forged-entry?origin=month&yearMonth=2026-10'
  })
  await expect(page.getByRole('heading', { name: 'Challenge unavailable' })).toBeVisible()
  expect(challengeRequests.length).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Return to Today' }).click()
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
})

test('keeps same-document Back and Forward usable when sessionStorage is blocked', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'sessionStorage', {
      get() { throw new DOMException('Session storage blocked for this test', 'SecurityError') },
    })
  })
  await page.goto(readerUrl())
  await selectTab(page, 'Collections')
  await page.getByRole('button', { name: 'Saved Scripture' }).click()
  await expect(page.getByRole('heading', { name: 'Saved Scripture', exact: true })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Collections', exact: true })).toBeVisible()
  await page.goForward()
  await expect(page.getByRole('heading', { name: 'Saved Scripture', exact: true })).toBeVisible()
})

test('authorized external Exit and Finish return to Today despite a URL-supplied Month origin', async ({ page }) => {
  await mockGateway(page)
  for (const action of ['Exit', 'Finish']) {
    await page.goto(readerUrl() + `#/challenge/${teachingSlug}?origin=month&yearMonth=${monthId}`)
    await expect(page.getByRole('heading', { name: 'Reading screen 1' })).toBeVisible()
    await expect(primaryNav(page)).toBeHidden()
    if (action === 'Finish') await page.getByRole('button', { name: 'Next', exact: true }).click()
    await page.getByRole('button', { name: action, exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
    expect(Object.keys((await participation(page)).completedChallenges)).toHaveLength(action === 'Exit' ? 0 : 1)
  }
  expect(await page.evaluate(key => localStorage.getItem(key), monthIntroKey)).toBeNull()
})

test('an available Month selection rejects a different document at the same slug', async ({ page }) => {
  await mockGateway(page)
  await page.route('**/api/challenges/test-challenge-2', route => route.fulfill({
    json: { ok: true, challenge: { ...challenge, slug: 'test-challenge-2' } },
  }))
  await page.goto(readerUrl() + '#/library')
  await page.getByRole('button', { name: /Open October 2026/ }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Begin the Month' }).click()
  await page.getByRole('button', { name: /Test Challenge 2,/ }).click()
  await expect(page.getByRole('heading', { name: 'Challenge content unavailable' })).toBeVisible()
  await expect(page.getByText('Synthetic teaching body.')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Finish', exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Challenge unavailable' })).toBeVisible()
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.getByRole('heading', { name: monthTitle })).toBeVisible()
  const data = await participation(page)
  expect(data?.completedChallenges ?? {}).toEqual({})
  expect(data?.earnedAwards ?? {}).toEqual({})
})

test('gateway denials and invalid responses expose no teaching and grant no credit', async ({ page }) => {
  const responses = [
    { status: 403 }, { status: 404 }, { status: 410 }, { status: 503 },
    { json: { ok: false, challenge } },
    { json: { ok: true, challenge: { ...challenge, screens: [] } } },
    { json: { ok: true, challenge: { ...challenge, editorialEligibility: { adaptationReviewed: false } } } },
    { json: { ok: true, challenge: { ...challenge, slug: 'a-different-teaching' } } },
  ]
  for (const response of responses) {
    await page.route(`**/api/challenges/${teachingSlug}`, route => route.fulfill(response))
    await page.goto(readerUrl() + `#/challenge/${teachingSlug}`)
    await expect(page.getByRole('heading', { name: 'Challenge unavailable' })).toBeVisible()
    await expect(page.getByText('Synthetic teaching body.')).toHaveCount(0)
    expect(await participation(page)).toBeUndefined()
  }
})

test('failed completion stays in the reader and can be retried without duplicating credit', async ({ page }) => {
  await mockGateway(page)
  await page.goto(readerUrl() + `#/challenge/${teachingSlug}`)
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.evaluate(key => {
    const write = Storage.prototype.setItem
    Storage.prototype.setItem = function (name, value) {
      if (name === key && Object.keys(JSON.parse(value).data.completedChallenges).length) {
        throw new DOMException('Test storage full', 'QuotaExceededError')
      }
      write.call(this, name, value)
    }
    window.addEventListener('storage-recovered', () => { Storage.prototype.setItem = write }, { once: true })
  }, participationKey)
  await page.getByRole('button', { name: 'Finish', exact: true }).click()
  await expect(page.getByText('Unable to save completion.')).toBeVisible()
  expect((await participation(page)).completedChallenges).toEqual({})
  expect((await participation(page)).earnedAwards).toEqual({})
  await page.evaluate(() => window.dispatchEvent(new Event('storage-recovered')))
  await page.getByRole('button', { name: 'Retry Finish' }).click()
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
  await expect.poll(async () => Object.keys((await participation(page)).earnedAwards)).toEqual([awardId])
  expect(Object.keys((await participation(page)).completedChallenges)).toEqual([`cms:${documentId}`])
})

test('a withdrawn Challenge is withheld when revisiting a previously authorized history entry', async ({ page }) => {
  await mockGateway(page)
  await page.goto(readerUrl())
  await page.evaluate(slug => { location.hash = `#/challenge/${slug}` }, teachingSlug)
  await expect(page.getByText('Synthetic teaching body.')).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
  await page.route(`**/api/challenges/${teachingSlug}`, route => route.fulfill({ status: 404 }))
  await page.goForward()
  await expect(page.getByRole('heading', { name: 'Challenge unavailable' })).toBeVisible()
  await expect(page.getByText('Synthetic teaching body.')).toHaveCount(0)
  const data = await participation(page)
  expect(data.completedChallenges).toEqual({})
  expect(data.earnedAwards).toEqual({})
})

test('late authorization from an abandoned visit cannot reopen the same slug', async ({ page }) => {
  await page.goto(readerUrl() + '#/collections')
  await expect(page.getByRole('heading', { name: 'Collections' })).toBeVisible()
  const path = `**/api/challenges/${teachingSlug}`
  let release!: () => void
  const delayed = new Promise<void>(resolve => { release = resolve })
  await page.route(path, async route => {
    await delayed
    await route.fulfill({ json: { ok: true, challenge } })
  }, { times: 1 })
  const firstRequest = page.waitForRequest(path)
  await page.evaluate(slug => { location.hash = `#/challenge/${slug}` }, teachingSlug)
  await firstRequest
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Collections' })).toBeVisible()
  await page.route(path, route => route.fulfill({ status: 404 }))
  await page.goForward()
  await expect(page.getByRole('heading', { name: 'Challenge unavailable' })).toBeVisible()
  release()
  await page.unrouteAll({ behavior: 'wait' })
  await expect(page.getByRole('heading', { name: 'Challenge unavailable' })).toBeVisible()
  expect(await participation(page)).toBeUndefined()
})

test('shows a persistence error for an authorized Today challenge when stored participation is corrupt', async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, '{corrupt'), participationKey)
  await mockGateway(page)
  await page.goto(readerUrl())

  const primary = page.getByTestId('today-primary-teaching')
  await expect(primary).toHaveAttribute('data-primary-status', 'persistenceUnavailable')
  await expect(primary.getByRole('alert')).toContainText('Your reading progress is unavailable')
  await expect(primary).not.toContainText('Loading today’s teaching')
  await expect(page.getByTestId('today-primary-status')).toHaveCount(0)
  await expect(page.getByTestId('today-primary-cta')).toHaveCount(0)
  await expect(page.getByTestId('today-current-month-link')).toHaveAttribute('data-year-month', currentMonthId)
  expect(await page.evaluate(key => localStorage.getItem(key), participationKey)).toBe('{corrupt')
})

test('connects Today → Challenge → explicit Finish → Today, resumes unfinished progress, and preserves credit on Read Again without a Monthly Introduction detour', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 640 })
  await mockGateway(page)
  await page.goto(readerUrl())

  const primaryCta = page.getByTestId('today-primary-cta')
  const currentMonthLink = page.getByTestId('today-current-month-link')
  await expect(page.getByRole('heading', { name: todayChallenge.title })).toBeVisible()
  await expect(page.getByTestId('today-primary-status')).toHaveText('Available Today')
  await expect(primaryCta).toHaveText('Open Today’s Reading')
  await expect(currentMonthLink).toHaveAttribute('data-year-month', currentMonthId)
  await expect(page.getByTestId('today-continue-study')).toHaveCount(0)

  // Open today's Challenge directly (never detours through Month Introduction)
  await primaryCta.click()
  await expect(page.getByRole('heading', { name: 'Test month overview' })).toHaveCount(0)
  const position = page.getByRole('progressbar', { name: 'Challenge screen position' })
  const button = (name: string) => page.getByRole('button', { name, exact: true })
  await expect(position).toHaveAttribute('aria-valuetext', 'Screen 1 of 2')
  await expect(primaryNav(page)).toBeHidden()

  // Advance to Screen 2 and Exit -> returns to Today in an In Progress state without completing
  await button('Next').click()
  await expect(position).toHaveAttribute('aria-valuetext', 'Screen 2 of 2')
  await button('Exit').click()
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
  await expect(primaryNav(page)).toBeVisible()
  await expect(page.getByTestId('today-primary-status')).toHaveText('In Progress')
  await expect(primaryCta).toHaveText('Resume Today’s Reading')
  expect((await participation(page)).completedChallenges).toEqual({})

  // Resume -> opens directly at saved Screen 2; explicit Finish returns to Today and marks Completed
  await primaryCta.click()
  await expect(position).toHaveAttribute('aria-valuetext', 'Screen 2 of 2')
  await button('Finish').click()
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
  await expect(page.getByTestId('today-primary-status')).toHaveText('Completed')
  await expect(primaryCta).toHaveText('Read Again')

  const afterFirstFinish = await participation(page)
  expect(Object.keys(afterFirstFinish.completedChallenges)).toEqual([`cms:${todayDocumentId}`])

  // Read Again -> reopens at Screen 1 and preserves existing completion date/credit on Finish
  await primaryCta.click()
  await expect(position).toHaveAttribute('aria-valuetext', 'Screen 1 of 2')
  await button('Next').click()
  await button('Finish').click()
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
  await expect(page.getByTestId('today-primary-status')).toHaveText('Completed')
  const afterReread = await participation(page)
  expect(afterReread.completedChallenges).toEqual(afterFirstFinish.completedChallenges)

  // Compact Current Month link opens the dedicated current Month Screen (where first-visit Month Intro lives)
  await currentMonthLink.click()
  await expect(page).toHaveURL(new RegExp(`#/month/${currentMonthId}$`))
  await expect(page.getByRole('heading', { name: 'Test month overview' })).toBeVisible()
  expect(await page.evaluate(key => localStorage.getItem(key), monthIntroKey)).toBeNull()
})

test('recovers Today across gateway month boundaries (ready wrong-month and 404 → News context) and fails closed on unpublished, mismatched, or errored responses', async ({ page }) => {
  await mockGateway(page)

  const decMonthId = '2026-12'
  const decDate = '2026-12-01'
  const decSlug = 'december-challenge-1'
  const decDocId = 'december-reading-1'
  const decContext = {
    authorizedLocalDate: decDate,
    effectiveTimeZone: 'Pacific/Auckland',
  }

  // Case 1: Bootstrap requests 2026-11 (device month), gateway returns 2026-11 with authorizedLocalDate 2026-12-01 -> 1 retry to 2026-12
  const case1Requests: string[] = []
  await page.route(`**/api/months/${currentMonthId}`, route => {
    case1Requests.push(currentMonthId)
    return route.fulfill({
      json: buildMonthPayload({
        yearMonth: currentMonthId,
        year: 2026,
        month: 11,
        daysInMonth: 30,
        phase: 'historical',
        title: currentMonthTitle,
        context: decContext,
      }),
    })
  })
  await page.route(`**/api/months/${decMonthId}`, route => {
    case1Requests.push(decMonthId)
    return route.fulfill({
      json: buildMonthPayload({
        yearMonth: decMonthId,
        year: 2026,
        month: 12,
        daysInMonth: 31,
        phase: 'active',
        title: 'December test publication',
        context: decContext,
        slotOverride(dayOfMonth, date) {
          if (dayOfMonth === 1) {
            return {
              dayOfMonth,
              date,
              availability: 'available',
              title: 'Authorized December Day 1',
              slug: decSlug,
              challengeId: `cms:${decDocId}`,
              challengeType: 'teaching',
            }
          }
          return {
            dayOfMonth,
            date,
            availability: 'comingSoon',
            title: `Upcoming December ${dayOfMonth}`,
          }
        },
      }),
    })
  })

  await page.goto(readerUrl())
  await expect(page.getByRole('heading', { name: 'Authorized December Day 1' })).toBeVisible()
  await expect(page.getByTestId('today-current-month-link')).toHaveAttribute('data-year-month', decMonthId)
  // Allow for React StrictMode initial double-mount while verifying at most one corrected December request
  expect(case1Requests.filter(ym => ym === currentMonthId).length).toBeGreaterThanOrEqual(1)
  expect(case1Requests.filter(ym => ym === currentMonthId).length).toBeLessThanOrEqual(2)
  expect(case1Requests.filter(ym => ym === decMonthId)).toEqual([decMonthId])

  // Case 2: Bootstrap requests 2026-11 -> 404 without serverContext -> loadNews() returns 2026-10-25 -> 1 retry to 2026-10 active month
  const octContext = {
    authorizedLocalDate: '2026-10-25',
    effectiveTimeZone: 'Pacific/Honolulu',
  }
  const case2MonthRequests: string[] = []
  let case2NewsRequests = 0
  await page.route(`**/api/months/${currentMonthId}`, route => {
    case2MonthRequests.push(currentMonthId)
    return route.fulfill({ status: 404, json: { ok: false, error: 'Not found' } })
  })
  await page.route('**/api/news**', route => {
    case2NewsRequests += 1
    return route.fulfill({
      json: {
        ok: true,
        serverContext: octContext,
        articles: [],
      },
    })
  })
  await page.route(`**/api/months/${monthId}`, route => {
    case2MonthRequests.push(monthId)
    return route.fulfill({
      json: buildMonthPayload({
        yearMonth: monthId,
        year: 2026,
        month: 10,
        daysInMonth: 31,
        phase: 'active',
        title: monthTitle,
        context: octContext,
      }),
    })
  })

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Test Challenge 25' })).toBeVisible()
  await expect(page.getByTestId('today-current-month-link')).toHaveAttribute('data-year-month', monthId)
  expect(case2MonthRequests.filter(ym => ym === currentMonthId).length).toBeGreaterThanOrEqual(1)
  expect(case2MonthRequests.filter(ym => ym === currentMonthId).length).toBeLessThanOrEqual(2)
  expect(case2MonthRequests.filter(ym => ym === monthId)).toEqual([monthId])
  expect(case2NewsRequests).toBeGreaterThanOrEqual(1)
  expect(case2NewsRequests).toBeLessThanOrEqual(2)

  // Case 3: Genuine unpublished month (404 on 2026-11 and News reports 2026-11-15) -> neutral unavailable, no retry loop, no Current Month link
  const case3MonthRequests: string[] = []
  await page.route(`**/api/months/${currentMonthId}`, route => {
    case3MonthRequests.push(currentMonthId)
    return route.fulfill({ status: 404, json: { ok: false, error: 'Not found' } })
  })
  await page.route('**/api/news**', route => route.fulfill({
    json: {
      ok: true,
      serverContext,
      articles: [],
    },
  }))

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Today’s teaching is unavailable' })).toBeVisible()
  await expect(page.getByTestId('today-primary-cta')).toHaveCount(0)
  await expect(page.getByTestId('today-current-month-link')).toHaveCount(0)
  expect(case3MonthRequests.every(ym => ym === currentMonthId)).toBe(true)
  expect(case3MonthRequests.length).toBeGreaterThanOrEqual(1)
  expect(case3MonthRequests.length).toBeLessThanOrEqual(2)
})

test('renders Explore This Month when today’s slot is unreleased or withdrawn, and renders at most one eligible historical Continue', async ({ page }) => {
  await mockGateway(page)

  // Seed an eligible historical Active Focus (2026-10) with an in-progress Challenge (day 25)
  await page.addInitScript(
    ({ sKey, pKey, mId, docId }) => {
      localStorage.setItem(
        sKey,
        JSON.stringify({
          schemaVersion: 1,
          state: {
            activeFocusMonth: mId,
            months: [{ yearMonth: mId, admissionKind: 'readerSelected', isProtected: true }],
          },
        }),
      )
      localStorage.setItem(
        pKey,
        JSON.stringify({
          schemaVersion: 1,
          data: {
            completedChallenges: {},
            inProgressChallenges: {
              [`cms:${docId}`]: { updatedOn: '2026-11-14', screenId: 'step-2' },
            },
            savedChallenges: {},
            savedScriptures: [],
            lastOpenedChallenge: null,
            earnedAwards: {},
          },
        }),
      )
    },
    { sKey: shelfKey, pKey: participationKey, mId: monthId, docId: documentId },
  )

  // Today's slot (Nov 15) is comingSoon (not yet released) with an embargoed preview title
  await page.route(`**/api/months/${currentMonthId}`, route => route.fulfill({
    json: buildMonthPayload({
      yearMonth: currentMonthId,
      year: 2026,
      month: 11,
      daysInMonth: 30,
      phase: 'active',
      title: currentMonthTitle,
      slotOverride(dayOfMonth, date) {
        if (dayOfMonth === todayDay) {
          return {
            dayOfMonth,
            date,
            availability: 'comingSoon',
            title: 'Embargoed Future Title Nov 15',
          }
        }
        return {
          dayOfMonth,
          date,
          availability: 'available',
          title: `November Challenge ${dayOfMonth}`,
          slug: `november-challenge-${dayOfMonth}`,
          challengeId: `cms:november-reading-${dayOfMonth}`,
          challengeType: 'teaching',
        }
      },
    }),
  }))

  await page.goto(readerUrl())

  // Primary shows neutral Explore This Month without leaking the embargoed title
  await expect(page.getByRole('heading', { name: 'Today’s teaching is not currently available' })).toBeVisible()
  await expect(page.getByTestId('today-primary-cta')).toHaveText('Explore This Month')
  await expect(page.getByText('Embargoed Future Title Nov 15')).toHaveCount(0)

  // Single secondary historical Continue card is rendered below the primary teaching
  const continueSection = page.getByTestId('today-continue-study')
  await expect(continueSection).toHaveCount(1)
  await expect(continueSection.locator('.hub-continue')).toHaveCount(1)
  await expect(continueSection.getByRole('heading', { name: 'Test Challenge 25' })).toBeVisible()

  // Clicking Continue Your Study opens the historical Challenge directly at saved Screen 2 and returns to Today on Finish
  await continueSection.getByRole('button', { name: /Continue Your Study: Test Challenge 25/ }).click()
  const position = page.getByRole('progressbar', { name: 'Challenge screen position' })
  await expect(position).toHaveAttribute('aria-valuetext', 'Screen 2 of 2')
  await page.getByRole('button', { name: 'Finish', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()

  // Secondary Continue updates to openFocusMonth for October 2026 since no saved in-progress Challenge remains in focus
  await expect(continueSection.locator('.hub-continue')).toHaveAttribute('data-continue-kind', 'openFocusMonth')
})

test('prevents a stale in-flight Today gateway response from overriding a newer retry or re-entry state', async ({ page }) => {
  await mockGateway(page)

  let phase: 'fail' | 'stale' | 'fresh' = 'fail'
  let releaseStale!: () => void
  const staleGate = new Promise<void>(resolve => { releaseStale = resolve })

  await page.route(`**/api/months/${currentMonthId}`, async route => {
    if (phase === 'fail') {
      await route.fulfill({ status: 503, json: { ok: false, error: 'Temporary failure' } })
      return
    }
    if (phase === 'stale') {
      await staleGate
      // Stale response with an outdated date
      await route.fulfill({
        json: buildMonthPayload({
          yearMonth: currentMonthId,
          year: 2026,
          month: 11,
          daysInMonth: 30,
          phase: 'active',
          title: 'Stale November response',
          context: { authorizedLocalDate: '2026-11-10', effectiveTimeZone: 'America/New_York' },
        }),
      })
      return
    }
    await route.fulfill({
      json: buildMonthPayload({
        yearMonth: currentMonthId,
        year: 2026,
        month: 11,
        daysInMonth: 30,
        phase: 'active',
        title: currentMonthTitle,
        slotOverride(dayOfMonth, date) {
          if (dayOfMonth === todayDay) {
            return {
              dayOfMonth,
              date,
              availability: 'available',
              title: todayChallenge.title,
              slug: todaySlug,
              challengeId: `cms:${todayDocumentId}`,
              challengeType: 'teaching',
            }
          }
          return {
            dayOfMonth,
            date,
            availability: 'unavailable',
          }
        },
      }),
    })
  })

  await page.goto(readerUrl())
  await expect(page.getByRole('heading', { name: 'Unable to load today’s teaching' })).toBeVisible()

  // Trigger retry #1 (phase === 'stale', held on staleGate), then navigate away and back to Today (phase === 'fresh', resolves immediately)
  phase = 'stale'
  await page.getByTestId('today-retry-cta').click()
  await selectTab(page, 'Collections')
  await expect(page.getByRole('heading', { name: 'Collections' })).toBeVisible()
  phase = 'fresh'
  await selectTab(page, 'Today')
  await expect(page.getByRole('heading', { name: todayChallenge.title })).toBeVisible()

  // Releasing the earlier in-flight response must not overwrite the latest authorized Today state
  releaseStale()
  await page.waitForTimeout(100)
  await expect(page.getByRole('heading', { name: todayChallenge.title })).toBeVisible()
  await expect(page.getByText('Stale November response')).toHaveCount(0)
})

test('verifies 3-screen Today persistence across reload, non-completion on the final screen, Start from Beginning, and earned-card idempotence on Read Again', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 640 })
  await mockGateway(page, { todayChallengeVariant: todayMultiScreenChallenge })
  await page.goto(readerUrl())

  const primaryCta = page.getByTestId('today-primary-cta')
  const primaryStatus = page.getByTestId('today-primary-status')
  const position = page.getByRole('progressbar', { name: 'Challenge screen position' })
  const button = (name: string) => page.getByRole('button', { name, exact: true })

  await expect(primaryStatus).toHaveText('Available Today')
  await expect(primaryCta).toHaveAttribute('data-entry', 'start')

  // Open 3-screen Today Challenge and advance to intermediate Screen 2 of 3
  await primaryCta.click()
  await expect(position).toHaveAttribute('aria-valuetext', 'Screen 1 of 3')
  await expect(primaryNav(page)).toBeHidden()
  await button('Next').click()
  await expect(position).toHaveAttribute('aria-valuetext', 'Screen 2 of 3')
  await expect(page.getByRole('heading', { name: 'November screen 2' })).toBeVisible()

  // Reloading mid-Challenge reauthorizes via gateway and restores Screen 2 of 3 with zero credit
  await page.reload()
  await expect(position).toHaveAttribute('aria-valuetext', 'Screen 2 of 3')
  await expect(primaryNav(page)).toBeHidden()
  expect((await participation(page)).completedChallenges).toEqual({})
  expect((await participation(page)).earnedAwards).toEqual({})

  // Reaching the final screen (Screen 3 of 3) without tapping Finish never marks completion or awards
  await button('Next').click()
  await expect(position).toHaveAttribute('aria-valuetext', 'Screen 3 of 3')
  await expect(button('Finish')).toBeVisible()
  expect((await participation(page)).completedChallenges).toEqual({})
  expect((await participation(page)).earnedAwards).toEqual({})

  // Exiting from the final screen returns to Today In Progress, and reloading Today preserves resume at Screen 3 of 3
  await button('Exit').click()
  await expect(page.getByTestId('r06-today-landing')).toBeVisible()
  await expect(primaryStatus).toHaveText('In Progress')
  await expect(primaryCta).toHaveAttribute('data-entry', 'resume')
  await page.reload()
  await expect(primaryStatus).toHaveText('In Progress')
  await expect(primaryCta).toHaveText('Resume Today’s Reading')
  expect((await participation(page)).completedChallenges).toEqual({})
  expect((await participation(page)).earnedAwards).toEqual({})

  await primaryCta.click()
  await expect(position).toHaveAttribute('aria-valuetext', 'Screen 3 of 3')

  // Start from Beginning resets only reading position back to Screen 1 of 3
  await button('Start from Beginning').click()
  await expect(position).toHaveAttribute('aria-valuetext', 'Screen 1 of 3')
  await expect.poll(async () => (await participation(page)).inProgressChallenges[`cms:${todayDocumentId}`]?.screenId).toBe('nov-step-1')

  // Advance through all 3 screens and explicitly Finish -> returns to Today and reconciles the earned thematic Card
  await button('Next').click()
  await button('Next').click()
  await expect(position).toHaveAttribute('aria-valuetext', 'Screen 3 of 3')
  await button('Finish').click()

  await expect(page.getByTestId('r06-today-landing')).toBeVisible()
  await expect(primaryStatus).toHaveText('Completed')
  await expect(primaryCta).toHaveAttribute('data-entry', 'readAgain')
  await expect(primaryCta).toHaveText('Read Again')

  await expect.poll(async () => Object.keys((await participation(page)).earnedAwards)).toEqual([currentThematicAwardId])
  const afterFirstFinish = await participation(page)
  expect(Object.keys(afterFirstFinish.completedChallenges)).toEqual([`cms:${todayDocumentId}`])
  expect(afterFirstFinish.earnedAwards[currentThematicAwardId].earnedOn).toBe(serverContext.authorizedLocalDate)
  expect(afterFirstFinish.earnedAwards[currentThematicAwardId].earnedCard?.title).toBe(currentThematicEarnedCard.title)
  expect(afterFirstFinish.earnedAwards[currentFullMonthAwardId]).toBeUndefined()

  // Partial reread + Exit preserves Completed status on Today without regression or duplicate credit
  await primaryCta.click()
  await expect(position).toHaveAttribute('aria-valuetext', 'Screen 1 of 3')
  await button('Next').click()
  await expect(position).toHaveAttribute('aria-valuetext', 'Screen 2 of 3')
  await button('Exit').click()
  await expect(primaryStatus).toHaveText('Completed')
  await expect(primaryCta).toHaveAttribute('data-entry', 'readAgain')

  // Full Read Again + Finish preserves unique completion and earned Card records unchanged
  await primaryCta.click()
  await expect(position).toHaveAttribute('aria-valuetext', 'Screen 1 of 3')
  await button('Next').click()
  await button('Next').click()
  await button('Finish').click()
  await expect(primaryStatus).toHaveText('Completed')
  const afterReread = await participation(page)
  expect(afterReread.completedChallenges).toEqual(afterFirstFinish.completedChallenges)
  expect(afterReread.earnedAwards).toEqual(afterFirstFinish.earnedAwards)
})

test('completes the connected M1a current-Month walkthrough with context restoration, multi-tab switching, and browser Back/Forward without stranding on unavailable', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 640 })
  await mockGateway(page)
  await page.clock.setFixedTime(new Date('2026-11-03T12:00:00Z'))
  await page.goto(readerUrl())

  // Enter the dedicated current Month Screen from Today's compact month link
  const currentMonthLink = page.getByTestId('today-current-month-link')
  await expect(currentMonthLink).toHaveAttribute('data-year-month', currentMonthId)
  await currentMonthLink.click()
  await expect(page).toHaveURL(new RegExp(`#/month/${currentMonthId}$`))

  // Complete the one-time Monthly Introduction on first intentional Month Screen visit
  await expect(page.getByRole('heading', { name: 'Test month overview' })).toBeVisible()
  await expect(primaryNav(page)).toBeHidden()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Begin the Month' }).click()
  await expect(page.getByRole('heading', { name: currentMonthTitle, exact: true })).toBeVisible()
  await expect(primaryNav(page)).toBeVisible()

  const viewport = page.locator('.r06-viewport')
  // The gateway authorizes November 15 while the device clock says November 3.
  const currentWeek = page.getByRole('heading', { name: /^Week 3 ·/ })
  await expect(currentWeek).toBeFocused()
  await expect.poll(() => currentWeek.evaluate(heading => {
    const week = heading.closest('section')!
    const scroller = week.closest('.r06-viewport')!
    return Math.abs(week.getBoundingClientRect().top - scroller.getBoundingClientRect().top)
  })).toBeLessThanOrEqual(1)

  // Before finishing: ticker is 0 of 30, unearned discoveries show title + progress only with zero Card art, and Coming Soon is locked
  const ticker = page.getByLabel('Monthly completion progress')
  await expect(ticker).toContainText('0 of 30')
  await expect(page.getByRole('progressbar', { name: 'November reading progress' })).toHaveAttribute('aria-valuetext', '0 of 1')
  await expect(page.getByRole('progressbar', { name: 'Complete November Study progress' })).toHaveAttribute('aria-valuetext', '0 of 30')
  await expect(page.locator('.month-discovery__earned-card')).toHaveCount(0)
  await expect(page.locator('img[src*="m1a-november-card"]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Upcoming November Challenge 16/ })).toHaveCount(0)

  // Scroll to an available 3-screen current-month Challenge (Day 14), open it, and explicitly Finish
  const day14Challenge = page.getByRole('button', { name: /November Challenge 14/ })
  await day14Challenge.scrollIntoViewIfNeeded()
  await day14Challenge.focus()
  const scrollTop = await viewport.evaluate(element => element.scrollTop)
  expect(scrollTop).toBeGreaterThan(200)

  await day14Challenge.press('Enter')
  const position = page.getByRole('progressbar', { name: 'Challenge screen position' })
  await expect(position).toHaveAttribute('aria-valuetext', 'Screen 1 of 3')
  await expect(primaryNav(page)).toBeHidden()
  await page.goBack()
  await expect(day14Challenge).toBeFocused()
  await expect.poll(() => viewport.evaluate(element => element.scrollTop)).toBe(scrollTop)

  await day14Challenge.press('Enter')
  await expect(position).toHaveAttribute('aria-valuetext', 'Screen 1 of 3')
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(position).toHaveAttribute('aria-valuetext', 'Screen 2 of 3')
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(position).toHaveAttribute('aria-valuetext', 'Screen 3 of 3')
  await page.getByRole('button', { name: 'Finish', exact: true }).click()

  // Month-origin Finish returns to the same Month Screen (not Today), restores scroll & focus, and silently updates progress
  await expect(page).toHaveURL(new RegExp(`#/month/${currentMonthId}$`))
  await expect(page.getByRole('heading', { name: currentMonthTitle, exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Test month overview' })).toHaveCount(0)
  await expect(day14Challenge).toBeFocused()
  await expect(day14Challenge).toHaveAccessibleName(/Completed/)
  await expect.poll(() => viewport.evaluate(element => element.scrollTop)).toBe(scrollTop)
  await expect(ticker).toContainText('1 of 30')
  await expect(page.getByRole('progressbar', { name: 'November reading progress' })).toHaveAttribute('aria-valuetext', '1 of 1')
  await expect(page.getByRole('button', { name: /Open earned Scripture card: November Reading Card/ })).toBeVisible()
  await expect(page.locator('.month-discovery--full .month-discovery__earned-card')).toHaveCount(0)

  // Tab switching across Library, Collections (Field Notebook), More, and back to Today restores the nested Month Screen & scroll
  await selectTab(page, 'Library')
  await expect(page.getByRole('main', { name: 'Shelf', exact: true })).toBeVisible()
  await selectTab(page, 'Collections')
  await page.getByRole('button', { name: 'Field Notebook' }).click()
  await expect(page.getByRole('heading', { name: 'Earned Scripture Cards', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '1 Distinct Challenge Completed' })).toBeVisible()
  await page.getByRole('button', { name: 'All Earned Cards' }).click()
  await expect(page.getByText(currentThematicEarnedCard.title)).toBeVisible()
  await selectTab(page, 'More')
  await expect(page.getByRole('heading', { name: 'More', exact: true })).toBeVisible()

  await selectTab(page, 'Today')
  await expect(page).toHaveURL(new RegExp(`#/month/${currentMonthId}$`))
  await expect(page.getByRole('heading', { name: currentMonthTitle, exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: /unavailable/i })).toHaveCount(0)
  await expect.poll(() => viewport.evaluate(element => element.scrollTop)).toBe(scrollTop)

  // Re-tapping the active Today tab resets to Today landing; Back/Forward and reload never strand legitimate visits on unavailable
  await selectTab(page, 'Today')
  await expect(page.getByTestId('r06-today-landing')).toBeVisible()
  await expect.poll(() => viewport.evaluate(element => element.scrollTop)).toBe(0)

  await page.goBack()
  await expect(page).toHaveURL(new RegExp(`#/month/${currentMonthId}$`))
  await expect(page.getByRole('heading', { name: currentMonthTitle, exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: /unavailable/i })).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole('heading', { name: currentMonthTitle, exact: true })).toBeVisible()
  await expect(ticker).toContainText('1 of 30')
  await expect.poll(() => viewport.evaluate(element => element.scrollTop)).toBe(scrollTop)

  await page.goForward()
  await expect(page.getByTestId('r06-today-landing')).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('heading', { name: currentMonthTitle, exact: true })).toBeVisible()
})

for (const { target, before, opens } of [
  { target: '2098-01', before: '2097-12-27', opens: '2097-12-28' },
  { target: '2098-03', before: '2098-02-26', opens: '2098-02-27' },
  { target: '2096-03', before: '2096-02-26', opens: '2096-02-27' },
]) {
  test(`G09 J3 opens ${target} preview on ${opens} and withholds Welcome and discoveries until month start`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await mockGateway(page)
    let authorizedDate = before
    const syntheticMonth = (preview: boolean) => {
      // January and March have the same 31-day roster shape.
      const source = preview
        ? toDereferencedMonthlyPreviewDoc('2098-03')
        : toDereferencedMonthlyDetailDoc('2098-03')
      if (target === '2098-03') return source
      return {
        ...JSON.parse(JSON.stringify(source).replaceAll('2098-03', target)),
        year: Number(target.slice(0, 4)),
        month: Number(target.slice(5, 7)),
        title: `Synthetic theme for ${target}`,
      }
    }
    const projectedStatuses = new Map<string, number>()
    await page.route(`**/api/months/${target}**`, async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      const response = await handleGatewayRequest(
        new Request(request.url(), {
          method: request.method(),
          headers: request.headers(),
          body: request.postData(),
        }),
        {
          SANITY_PROJECT_ID: '80016lrq',
          SANITY_DATASET: 'staging',
          SANITY_READ_TOKEN: 'synthetic-test-token',
          ALLOWED_ORIGINS: new URL(readerUrl()).origin,
        },
        {
          getNow: () => new Date(`${authorizedDate}T12:00:00Z`),
          fetchImpl: async () => Response.json({
            result: syntheticMonth(path.endsWith('/preview')),
          }),
        },
      )
      projectedStatuses.set(path, response.status)
      await route.fulfill({ status: response.status, body: await response.text(), contentType: 'application/json' })
    })

    await page.goto(readerUrl())
    await page.getByTestId('today-current-month-link').click()
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByRole('button', { name: 'Begin the Month' }).click()
    await page.getByLabel('Jump to month').fill(target)
    await page.getByRole('button', { name: 'Go', exact: true }).click()

    const viewport = page.locator('.r06-viewport')
    const overview = page.getByRole('heading', { name: `Previewing ${target}` })
    const welcome = page.getByRole('heading', { name: `Welcome to ${target}` })
    await expect(page.getByRole('status').filter({ hasText: 'Month unavailable' })).toBeVisible()
    expect(projectedStatuses.get(`/api/months/${target}`)).toBe(404)
    expect(projectedStatuses.get(`/api/months/${target}/preview`)).toBe(404)

    authorizedDate = opens
    await page.getByRole('button', { name: 'Try Again' }).click()
    await expect(overview).toBeVisible()
    await expect(welcome).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Skip to Welcome' })).toHaveCount(0)
    await page.getByRole('button', { name: 'View Preview Calendar' }).click()

    const agenda = page.locator('[data-month-agenda]')
    await expect(agenda).toHaveAttribute('data-month-agenda', 'preview')
    await expect(agenda.getByText('Coming Soon', { exact: true })).toHaveCount(31)
    await expect(agenda.getByRole('button')).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Thematic & Full-Month Goals' })).toHaveCount(0)
    await expect(page.locator('.month-discovery__earned-card')).toHaveCount(0)
    await expect(page.getByText('Synthetic Welcome', { exact: true })).toHaveCount(0)
    const introProgress = () => page.evaluate(({ key, month }) => JSON.parse(localStorage.getItem(key)!).months[month],
      { key: monthIntroKey, month: target })
    expect(await introProgress()).toMatchObject({ previewSeen: true, welcomeSeen: false })

    // Visit again after month start. The prior preview offset must yield to the active week.
    await viewport.evaluate(element => { element.scrollTop = 500 })
    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`#/month/${currentMonthId}$`))
    authorizedDate = `${target}-08`
    await page.goForward()
    await expect(overview).toBeVisible()
    await page.getByRole('button', { name: 'Skip to Welcome' }).click()
    await expect(welcome).toBeVisible()
    await page.getByRole('button', { name: 'Open Calendar' }).click()
    await expect(agenda).toHaveAttribute('data-month-agenda', 'detail')
    await expect(agenda.getByRole('button')).toHaveCount(8)
    await expect(page.getByRole('region', { name: 'Thematic & Full-Month Goals' })).toBeVisible()
    await expect(agenda.locator('[data-current-week] h3')).toBeFocused()
    expect(await introProgress()).toMatchObject({ previewSeen: true, welcomeSeen: true })
  })
}

test('retries Month and Introduction failures and replays without erasing scroll or saved state', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 640 })
  await mockGateway(page)
  let detail: 'ready' | 'withdrawn' | 'invalid' = 'ready'
  await page.route(`**/api/months/${monthId}`, route => {
    if (detail === 'withdrawn') return route.fulfill({ status: 404, json: { ok: false } })
    return route.fulfill({ json: detail === 'ready' ? buildDefaultHistoricalMonthPayload() : { ok: true } })
  })
  await page.route(`**/api/months/${monthId}/preview`, route => route.fulfill({ status: 404, json: { ok: false } }))
  await page.addInitScript(({ key, data }) => localStorage.setItem(key, data), {
    key: participationKey,
    data: buildGuestParticipationStorageValue({
      completedChallenges: { 'cms:previous-study': { completedOn: '2026-09-20' } },
    }),
  })
  await page.goto(readerUrl())
  const currentMonth = page.getByTestId('today-current-month-link')
  await expect(currentMonth).toBeVisible({ timeout: 15_000 })
  const completedBeforeFailures = (await participation(page)).completedChallenges
  await page.evaluate(key => {
    document.documentElement.dataset.introReadBlocked = 'true'
    const originalSetItem = Storage.prototype.setItem
    const originalGetItem = Storage.prototype.getItem
    Storage.prototype.getItem = function (name) {
      if (name === key && document.documentElement.dataset.introReadBlocked) throw new Error('Read unavailable')
      return originalGetItem.call(this, name)
    }
    Storage.prototype.setItem = function (name, value) {
      if (name === key && document.documentElement.dataset.introWriteBlocked) throw new Error('Write unavailable')
      return originalSetItem.call(this, name, value)
    }
  }, monthIntroKey)
  await currentMonth.click()
  await expect(page.getByRole('alert')).toHaveText(/Unable to load Monthly Introduction status/)
  await expect(page.locator('[data-month-agenda]')).toHaveCount(0)
  await page.evaluate(() => { delete document.documentElement.dataset.introReadBlocked })
  await page.getByRole('button', { name: 'Retry' }).click()

  const introHeading = page.getByRole('heading', { name: 'Test month overview' })
  await expect(introHeading).toBeFocused()
  await page.getByRole('button', { name: 'Return to previous screen' }).click()
  await expect(currentMonth).toBeVisible()
  expect(await page.evaluate(key => localStorage.getItem(key), monthIntroKey)).toBeNull()

  await currentMonth.click()
  await expect(introHeading).toBeFocused()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.evaluate(() => { document.documentElement.dataset.introWriteBlocked = 'true' })
  await page.getByRole('button', { name: 'Begin the Month' }).click()
  await expect(page.getByRole('alert')).toHaveText(/Unable to save Monthly Introduction status/)
  await expect(page.locator('[data-month-agenda]')).toHaveCount(0)
  expect(await page.evaluate(key => localStorage.getItem(key), monthIntroKey)).toBeNull()
  await page.evaluate(() => { delete document.documentElement.dataset.introWriteBlocked })
  await page.getByRole('button', { name: 'Retry' }).click()

  const replay = page.getByRole('button', { name: 'Read Monthly Introduction' })
  const viewport = page.locator('.r06-viewport')
  await expect(replay).toBeVisible()
  await replay.focus()
  await viewport.evaluate(element => { element.scrollTop = 450 })
  const storedIntro = await page.evaluate(key => localStorage.getItem(key), monthIntroKey)
  await replay.press('Enter')
  await expect(introHeading).toBeFocused()
  await page.getByRole('button', { name: 'Close introduction' }).click()
  await expect(replay).toBeFocused()
  await expect.poll(() => viewport.evaluate(element => element.scrollTop)).toBe(450)
  expect(await page.evaluate(key => localStorage.getItem(key), monthIntroKey)).toBe(storedIntro)

  const previousMonth = page.getByRole('button', { name: monthId, exact: true })
  detail = 'withdrawn'
  await previousMonth.click()
  await expect(page.getByRole('status').filter({ hasText: 'Month unavailable' })).toBeVisible()
  detail = 'invalid'
  await page.getByRole('button', { name: 'Try Again' }).click()
  await expect(page.getByRole('alert')).toHaveText(/Month content unavailable/)
  detail = 'ready'
  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(introHeading).toBeVisible()
  await page.getByRole('button', { name: 'Return to previous screen' }).click()
  await expect(replay).toBeVisible()
  expect(await page.evaluate(key => localStorage.getItem(key), monthIntroKey)).toBe(storedIntro)
  expect((await participation(page)).completedChallenges).toEqual(completedBeforeFailures)
})

test('fails closed on withdrawn and unauthorized Today or Month Challenges without leaking manuscript bodies, unearned card art, completions, or awards', async ({ page }) => {
  await mockGateway(page)

  // Today's Challenge is withdrawn (404 neutral gateway response); Day 14 returns an unreviewed payload; Day 16 is unreleased (404);
  // progress attempts to leak unearned Card metadata and image URL on an unearned discovery
  await page.route(`**/api/challenges/${todaySlug}`, route =>
    route.fulfill({ status: 404, json: { ok: false, error: 'Not found' } }),
  )
  await page.route(`**/api/challenges/${currentMonthMultiScreenSlug}`, route =>
    route.fulfill({
      json: {
        ok: true,
        challenge: buildUnauthorizedChallengeFixture({
          slug: currentMonthMultiScreenSlug,
          documentId: currentMonthMultiScreenDocumentId,
          dayOfMonth: currentMonthMultiScreenDay,
        }),
      },
    }),
  )
  await page.route(`**/api/challenges/${unreleasedFutureSlug}`, route =>
    route.fulfill({ status: 404, json: { ok: false, error: 'Not found' } }),
  )
  await page.route(`**/api/months/${currentMonthId}/progress`, route =>
    route.fulfill({
      json: {
        ok: true,
        serverContext,
        monthId: currentMonthId,
        rosterVersion: 1,
        completedInMonthCount: 0,
        totalChallenges: 30,
        thematicEarnedCount: 0,
        thematicTotalCount: 1,
        discoveries: [
          {
            ...currentThematicDiscovery,
            achievedCount: 0,
            isEarned: false,
            awardId: currentThematicAwardId,
            earnedCard: {
              ...currentThematicEarnedCard,
              imageUrl: RESTRICTED_CARD_IMAGE_URL,
              accessibleTranscription: RESTRICTED_CARD_ART_SENTINEL,
            },
          },
        ],
      },
    }),
  )

  await page.goto(readerUrl())
  await page.getByTestId('today-primary-cta').click()

  // Withdrawn Today Challenge fails closed neutrally with zero restricted body, card art, or Finish control
  await expect(page.getByRole('heading', { name: 'Challenge not found' })).toBeVisible()
  await expect(page.getByText('Synthetic November teaching body.')).toHaveCount(0)
  await expect(page.getByText(RESTRICTED_MANUSCRIPT_SENTINEL)).toHaveCount(0)
  await expect(page.getByText(RESTRICTED_CARD_ART_SENTINEL)).toHaveCount(0)
  await expect(page.locator('img[src*="cdn.sanity.io"]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Finish', exact: true })).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Challenge unavailable' })).toBeVisible()
  await page.getByRole('button', { name: 'Return to Today' }).click()
  await expect(page.getByTestId('r06-today-landing')).toBeVisible()

  // Month Screen rejects leaked unearned Card art, and opening an unauthorized Challenge withholds restricted manuscript text
  await page.getByTestId('today-current-month-link').click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Begin the Month' }).click()
  await expect(page.getByText(RESTRICTED_CARD_ART_SENTINEL)).toHaveCount(0)
  await expect(page.locator(`img[src="${RESTRICTED_CARD_IMAGE_URL}"]`)).toHaveCount(0)
  await expect(page.locator('.month-discovery__earned-card')).toHaveCount(0)

  await page.getByRole('button', { name: /November Challenge 14/ }).click()

  await expect(page.getByRole('heading', { name: 'Challenge content unavailable' })).toBeVisible()
  await expect(page.getByText(RESTRICTED_MANUSCRIPT_SENTINEL)).toHaveCount(0)
  await expect(page.getByText(RESTRICTED_CARD_ART_SENTINEL)).toHaveCount(0)
  await expect(page.locator('img[src*="cdn.sanity.io"]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Finish', exact: true })).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Challenge unavailable' })).toBeVisible()
  await expect(page.getByText(RESTRICTED_MANUSCRIPT_SENTINEL)).toHaveCount(0)
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.getByRole('heading', { name: currentMonthTitle, exact: true })).toBeVisible()

  // Direct hash navigation to an unreleased comingSoon slug fails closed neutrally and returns to Today
  await page.evaluate(slug => {
    window.location.hash = `#/challenge/${slug}`
  }, unreleasedFutureSlug)
  await expect(page.getByRole('heading', { name: 'Challenge unavailable' })).toBeVisible()
  await expect(page.getByText(RESTRICTED_MANUSCRIPT_SENTINEL)).toHaveCount(0)
  await page.getByRole('button', { name: 'Return to Today' }).click()
  await expect(page.getByTestId('r06-today-landing')).toBeVisible()

  const stored = await participation(page)
  expect(stored?.completedChallenges ?? {}).toEqual({})
  expect(stored?.earnedAwards ?? {}).toEqual({})
})

async function seedRolloverProgress(page: Page, completed: boolean) {
  await page.addInitScript(({ key, id, completed }) => {
    if (localStorage.getItem(key)) return
    localStorage.setItem(key, JSON.stringify({
      schemaVersion: 2,
      data: {
        // Completion date belongs to a different month. Publication slot identity controls admission.
        completedChallenges: completed ? { [`cms:${id}`]: { completedOn: '2026-11-01' } } : {},
        inProgressChallenges: {
          'cms:unfinished-october': { updatedOn: '2026-10-31', screenId: 'step-2' },
        },
        savedChallenges: {},
        savedScriptures: [],
        lastOpenedChallenge: null,
        earnedAwards: {},
      },
    }))
  }, { key: participationKey, id: documentId, completed })
}

async function storedRolloverShelf(page: Page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), shelfKey)
}

test('J4 G03 admits the ended month on gateway time and preserves a subsequent Put Away across visits', async ({ page }) => {
  await mockGateway(page)
  await seedRolloverProgress(page, true)
  await page.clock.setFixedTime(new Date('2026-10-31T12:00:00Z'))
  await page.goto(readerUrl())
  await expect(page.getByTestId('r06-today-authorized-date')).toHaveText(serverContext.authorizedLocalDate)
  await expect(page.getByTestId('today-continue-study')).toHaveCount(0)
  await expect.poll(() => storedRolloverShelf(page)).toMatchObject({
    state: {
      activeFocusMonth: null,
      months: [{ yearMonth: monthId, admissionKind: 'autoAdmitted', isProtected: false }],
    },
    rolloverWatermark: {
      lastEndingYearMonth: monthId,
      lastNewCurrentYearMonth: currentMonthId,
      lastDisposition: 'admittedToOpenSlot',
    },
  })

  const progressBefore = await participation(page)
  await selectTab(page, 'Library')
  await expect(page.getByRole('heading', { name: 'Shelf', exact: true })).toBeVisible()
  await page.getByRole('button', { name: /put away October 2026 from Shelf/i }).click()
  await expect.poll(() => storedRolloverShelf(page)).toMatchObject({ state: { months: [] } })
  await page.reload()
  await selectTab(page, 'Today')
  await expect(page.getByTestId('r06-today-authorized-date')).toBeVisible()
  await selectTab(page, 'More')
  await selectTab(page, 'Today')
  await expect(page.getByTestId('r06-today-authorized-date')).toBeVisible()
  expect((await storedRolloverShelf(page)).state.months).toEqual([])
  expect(await participation(page)).toEqual(progressBefore)
})

for (const allProtected of [false, true]) {
  test(`J4 G03 ${allProtected ? 'retains an entirely protected Shelf' : 'replaces only the eligible auto-admitted month'}`, async ({ page }) => {
    await mockGateway(page)
    await seedRolloverProgress(page, true)
    await page.addInitScript(({ key, allProtected }) => {
      localStorage.setItem(key, JSON.stringify({
        schemaVersion: 1,
        state: {
          activeFocusMonth: '2026-07',
          months: [
            { yearMonth: '2026-07', admissionKind: 'autoAdmitted', isProtected: false },
            { yearMonth: '2026-08', admissionKind: 'readerSelected', isProtected: true },
            { yearMonth: '2026-09', admissionKind: 'autoAdmitted', isProtected: allProtected },
          ],
        },
      }))
    }, { key: shelfKey, allProtected })
    await page.goto(readerUrl())
    await expect.poll(() => storedRolloverShelf(page)).toMatchObject({
      state: {
        activeFocusMonth: '2026-07',
        months: [
          { yearMonth: '2026-07', admissionKind: 'autoAdmitted', isProtected: false },
          { yearMonth: '2026-08', admissionKind: 'readerSelected', isProtected: true },
          { yearMonth: allProtected ? '2026-09' : monthId, isProtected: allProtected },
        ],
      },
      rolloverWatermark: {
        lastDisposition: allProtected ? 'retainedInLibraryAllProtected' : 'replacedOldestAutoAdmitted',
      },
    })
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
}

test('J4 G03 retries a qualifying Shelf admission on the next Today visit without interrupting reading', async ({ page }) => {
  await mockGateway(page)
  await seedRolloverProgress(page, true)
  await page.addInitScript(key => {
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (name, value) {
      if (name === key && !sessionStorage.getItem('rollover-write-failed')) {
        sessionStorage.setItem('rollover-write-failed', 'yes')
        throw new DOMException('Test Shelf quota failure', 'QuotaExceededError')
      }
      return setItem.call(this, name, value)
    }
  }, shelfKey)
  await page.goto(readerUrl())
  await expect(page.getByTestId('today-primary-cta')).toBeVisible()
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('rollover-write-failed'))).toBe('yes')
  expect(await storedRolloverShelf(page)).toBeNull()
  const before = await participation(page)
  await selectTab(page, 'More')
  await selectTab(page, 'Today')
  await expect.poll(() => storedRolloverShelf(page)).toMatchObject({
    state: { months: [{ yearMonth: monthId }], activeFocusMonth: null },
    rolloverWatermark: { lastDisposition: 'admittedToOpenSlot' },
  })
  await page.reload()
  await expect(page.getByTestId('today-primary-cta')).toBeVisible()
  await expect(page.getByTestId('today-continue-study')).toHaveCount(0)
  expect((await storedRolloverShelf(page)).state.months).toHaveLength(1)
  expect(await participation(page)).toEqual(before)
})

test('J4 G03 preserves unfinished prior-month progress without auto-admission or a G02 suggestion', async ({ page }) => {
  await mockGateway(page)
  await seedRolloverProgress(page, false)
  await page.goto(readerUrl())
  await expect.poll(() => storedRolloverShelf(page)).toMatchObject({
    state: { months: [], activeFocusMonth: null },
    rolloverWatermark: { lastDisposition: 'retainedInLibraryNoCompletions' },
  })
  await expect(page.getByTestId('today-continue-study')).toHaveCount(0)
  expect((await participation(page)).inProgressChallenges['cms:unfinished-october']).toEqual({
    updatedOn: '2026-10-31',
    screenId: 'step-2',
  })
})

test('J4 G03 uses the confirmed gateway date when the current publication is absent', async ({ page }) => {
  await mockGateway(page)
  await seedRolloverProgress(page, true)
  await page.route(`**/api/months/${currentMonthId}`, route => route.fulfill({
    status: 404,
    json: { ok: false },
  }))
  await page.goto(readerUrl())
  await expect(page.getByRole('heading', { name: 'Today’s teaching is unavailable' })).toBeVisible()
  await expect(page.getByTestId('today-current-month-link')).toHaveCount(0)
  await expect.poll(() => storedRolloverShelf(page)).toMatchObject({
    state: { months: [{ yearMonth: monthId }], activeFocusMonth: null },
    rolloverWatermark: { lastNewCurrentYearMonth: currentMonthId },
  })
})

test('J4 G03 leaves corrupt Shelf data intact while Today remains readable', async ({ page }) => {
  await mockGateway(page)
  await seedRolloverProgress(page, true)
  await page.addInitScript(key => localStorage.setItem(key, '{unreadable-shelf'), shelfKey)
  await page.goto(readerUrl())
  await expect(page.getByTestId('today-primary-cta')).toBeVisible()
  expect(await page.evaluate(key => localStorage.getItem(key), shelfKey)).toBe('{unreadable-shelf')
})
