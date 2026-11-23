import { createServer, type ViteDevServer } from 'vite'
import type { Page } from '@playwright/test'
import { expect, test } from '../smoke/helpers/frameSafeTest.ts'

const monthId = '2026-10'
const monthTitle = 'October test publication'
const serverContext = {
  authorizedLocalDate: '2026-11-15',
  effectiveTimeZone: 'America/New_York',
}
const navigationKey = 'bibleberry-r06-navigation-v1'
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

async function participation(page: Page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}').data, participationKey)
}

async function mockGateway(page: Page) {
  await page.route(`**/api/challenges/${teachingSlug}`, route => route.fulfill({ json: { ok: true, challenge } }))
  const introductionScreen = (id: string, title: string) => ({
    id,
    title,
    blocks: [{ _key: id, _type: 'statementBlock', text: 'Synthetic test text.' }],
  })
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
    json: {
      ok: true,
      serverContext,
      month: {
        monthId,
        documentId: `month-${monthId}`,
        year: 2026,
        month: 10,
        daysInMonth: 31,
        phase: 'historical',
        rosterVersion: 1,
        totalChallenges: 31,
        title: monthTitle,
        introduction: {
          version: 'intro-test-v1',
          previewScreens: [introductionScreen('overview', 'Test month overview')],
          welcomeScreen: { ...introductionScreen('welcome', 'Test month welcome'), ctaLabel: 'Begin the Month' },
        },
        slots: Array.from({ length: 31 }, (_, index) => {
          const dayOfMonth = index + 1
          const date = `${monthId}-${String(dayOfMonth).padStart(2, '0')}`
          return {
            dayOfMonth,
            date,
            availability: 'available',
            title: `Test Challenge ${dayOfMonth}`,
            slug: `test-challenge-${dayOfMonth}`,
            challengeId: dayOfMonth === 25 ? `cms:${documentId}` : `cms:test-challenge-${dayOfMonth}`,
            challengeType: 'teaching',
          }
        }),
        discoveries: [discovery],
      },
    },
  }))
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
  await page.goto(readerUrl())
  const nav = primaryNav(page)
  await expect(nav.getByRole('button')).toHaveText(['Today', 'Library', 'Collections', 'More'])
  await expect(nav.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-current', 'page')
  await page.getByRole('button', { name: 'Open this month' }).focus()
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
