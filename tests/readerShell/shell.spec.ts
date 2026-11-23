import { createServer, type ViteDevServer } from 'vite'
import type { Page } from '@playwright/test'
import { expect, test } from '../smoke/helpers/frameSafeTest.ts'

const monthId = '2026-10'
const monthTitle = 'October test publication'
const currentMonthId = '2026-11'
const currentMonthTitle = 'November test publication'
const todayDate = '2026-11-15'
const todayDay = 15
const todaySlug = 'november-challenge-15'
const todayDocumentId = 'november-reading-15'
const serverContext = {
  authorizedLocalDate: todayDate,
  effectiveTimeZone: 'America/New_York',
}
const navigationKey = 'bibleberry-r06-navigation-v1'
const shelfKey = 'bibleberry-guest-shelf-v1'
let enabledServer: ViteDevServer
let disabledServer: ViteDevServer

async function startReader(enabled: boolean) {
  const server = await createServer({
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

const teachingSlug = 'test-challenge-25'
const documentId = 'october-reading-25'
const participationKey = 'bibleberry-reader-participation-v1'
const awardId = `card:monthly:${monthId}:october-reading`
const discovery = {
  discoveryId: `discovery:${monthId}:october-reading`, title: 'October reading', kind: 'thematic', targetCount: 1,
}
const challenge = {
  calendarSlot: { monthId, documentId: `month-${monthId}`, dayOfMonth: 25, publicationDate: `${monthId}-25` },  _id: documentId,
  _type: 'challenge',
  slug: teachingSlug,
  title: 'Authorized October teaching',
  challengeType: 'teaching',
  series: { _id: 'october-series', title: 'October series', slug: 'october-series' },
  sequence: 25,
  releaseAt: '2026-10-25T00:00:00Z',
  primaryScripture: { reference: 'John 1:1', translation: 'WEB', textStatus: 'referenceOnly', practiceStatus: 'notConfigured' },
  screens: [1, 2].map(step => ({
    _key: `step-${step}`,
    _type: 'challengeScreen',
    screenLabel: `Step ${step}`,
    heading: `Reading screen ${step}`,
    blocks: [{ _key: 'text', _type: 'statementBlock', text: 'Synthetic teaching body.' }],
  })),
  companionLinks: [],
  editorialEligibility: { adaptationReviewed: true, reviewedAt: '2026-10-01T12:00:00Z' },
}

const todayChallenge = {
  calendarSlot: { monthId: currentMonthId, documentId: `month-${currentMonthId}`, dayOfMonth: todayDay, publicationDate: todayDate },
  _id: todayDocumentId,
  _type: 'challenge',
  slug: todaySlug,
  title: 'Authorized November teaching',
  challengeType: 'teaching',
  series: { _id: 'november-series', title: 'November series', slug: 'november-series' },
  sequence: todayDay,
  releaseAt: '2026-11-15T00:00:00Z',
  primaryScripture: { reference: 'Psalm 23:1', translation: 'WEB', textStatus: 'referenceOnly', practiceStatus: 'notConfigured' },
  screens: [1, 2].map(step => ({
    _key: `nov-step-${step}`,
    _type: 'challengeScreen',
    screenLabel: `Step ${step}`,
    heading: `November screen ${step}`,
    blocks: [{ _key: 'text', _type: 'statementBlock', text: 'Synthetic November teaching body.' }],
  })),
  companionLinks: [],
  editorialEligibility: { adaptationReviewed: true, reviewedAt: '2026-11-01T12:00:00Z' },
}

function buildMonthPayload(options: {
  yearMonth: string
  year: number
  month: number
  daysInMonth: number
  phase: 'active' | 'historical'
  title: string
  context?: typeof serverContext
  slotOverride?: (dayOfMonth: number, date: string) => Record<string, unknown>
}) {
  const introductionScreen = (id: string, title: string) => ({
    id,
    title,
    blocks: [{ _key: id, _type: 'statementBlock', text: 'Synthetic test text.' }],
  })
  const slots = Array.from({ length: options.daysInMonth }, (_, index) => {
    const dayOfMonth = index + 1
    const date = `${options.yearMonth}-${String(dayOfMonth).padStart(2, '0')}`
    if (options.slotOverride) {
      return options.slotOverride(dayOfMonth, date)
    }
    return {
      dayOfMonth,
      date,
      availability: 'available',
      title: `Test Challenge ${dayOfMonth}`,
      slug: `test-challenge-${dayOfMonth}`,
      challengeId: dayOfMonth === 25 && options.yearMonth === monthId ? `cms:${documentId}` : `cms:${options.yearMonth}-challenge-${dayOfMonth}`,
      challengeType: 'teaching',
    }
  })
  const activeCount = slots.filter(slot => slot.availability !== 'unavailable').length
  return {
    ok: true,
    serverContext: options.context ?? serverContext,
    month: {
      monthId: options.yearMonth,
      documentId: `month-${options.yearMonth}`,
      year: options.year,
      month: options.month,
      daysInMonth: options.daysInMonth,
      phase: options.phase,
      rosterVersion: 1,
      totalChallenges: activeCount,
      title: options.title,
      introduction: {
        version: `intro-${options.yearMonth}-v1`,
        previewScreens: [introductionScreen('overview', 'Test month overview')],
        welcomeScreen: { ...introductionScreen('welcome', 'Test month welcome'), ctaLabel: 'Begin the Month' },
      },
      slots,
      discoveries: options.yearMonth === monthId ? [discovery] : [],
    },
  }
}

async function participation(page: Page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}').data, participationKey)
}

async function mockGateway(page: Page) {
  await page.route(`**/api/challenges/${teachingSlug}`, route => route.fulfill({ json: { ok: true, challenge } }))
  await page.route(`**/api/challenges/${todaySlug}`, route => route.fulfill({ json: { ok: true, challenge: todayChallenge } }))
  await page.route('**/api/challenges', route => route.fulfill({
    json: {
      ok: true,
      challenges: [challenge, todayChallenge],
    },
  }))
  await page.route('**/api/library/months**', route => route.fulfill({
    json: {
      ok: true,
      serverContext,
      items: [{ yearMonth: monthId, year: 2026, month: 10, title: monthTitle }],
      page: { limit: 12, hasMore: false, nextCursor: null },
    },
  }))
  await page.route('**/api/news**', route => route.fulfill({
    json: {
      ok: true,
      serverContext,
      articles: [{
        id: 'news-test',
        documentId: 'news-test',
        category: 'announcement',
        title: 'Test ministry announcement',
        summary: 'Synthetic news for the shell smoke.',
        publishedOn: '2026-11-10',
      }].filter(article => {
        const category = new URL(route.request().url()).searchParams.get('category')
        return !category || category === article.category
      }),
    },
  }))
  await page.route(`**/api/months/${monthId}`, route => route.fulfill({
    json: buildMonthPayload({
      yearMonth: monthId,
      year: 2026,
      month: 10,
      daysInMonth: 31,
      phase: 'historical',
      title: monthTitle,
    }),
  }))
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
            availability: 'available',
            title: todayChallenge.title,
            slug: todaySlug,
            challengeId: `cms:${todayDocumentId}`,
            challengeType: 'teaching',
          }
        }
        if (dayOfMonth > todayDay) {
          return {
            dayOfMonth,
            date,
            availability: 'comingSoon',
            title: `Upcoming November Challenge ${dayOfMonth}`,
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
  await page.route(`**/api/months/${currentMonthId}/progress`, route => {
    const ids = route.request().postDataJSON().completedChallengeIds as string[]
    return route.fulfill({
      json: {
        ok: true,
        serverContext,
        monthId: currentMonthId,
        rosterVersion: 1,
        completedInMonthCount: ids.length,
        totalChallenges: 30,
        thematicEarnedCount: 0,
        thematicTotalCount: 0,
        discoveries: [],
      },
    })
  })
  await page.route(`**/api/months/${monthId}/progress`, route => {
    const ids = route.request().postDataJSON().completedChallengeIds as string[]
    const earned = ids.includes(`cms:${documentId}`)
    return route.fulfill({
      json: {
        ok: true,
        serverContext,
        monthId,
        rosterVersion: 1,
        completedInMonthCount: ids.length,
        totalChallenges: 31,
        thematicEarnedCount: Number(earned),
        thematicTotalCount: 1,
        discoveries: [{
          ...discovery, achievedCount: Number(earned), isEarned: earned,
          ...(earned ? { awardId, reservedCardId: 'card-october-reading' } : {}),
        }],
      },
    })
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
  await page.route('https://**', route => route.abort())
})

test('opens the legacy reader with the flag off and never initializes the R06 navigation session', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('bibleberry-prototype-v1', JSON.stringify({ onboarded: true, appearance: 'system' }))
  })
  await page.goto(readerUrl(disabledServer))
  await expect(page.getByRole('button', { name: 'Archive', exact: true }).filter({ visible: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Collections', exact: true })).toHaveCount(0)
  expect(await page.evaluate(key => sessionStorage.getItem(key), navigationKey)).toBeNull()
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

