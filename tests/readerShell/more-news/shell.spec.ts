import type { Page } from '@playwright/test'
import { createServer, type ViteDevServer } from 'vite'
import { handleGatewayRequest } from '../../../src/gateway/handler.ts'
import { createDefaultReaderProfile } from '../../../src/readerProfile/model.ts'
import { READER_PROFILE_STORAGE_KEY } from '../../../src/readerProfile/types.ts'
import { expect as baseExpect, test } from '../../smoke/helpers/frameSafeTest.ts'
import { buildGuestParticipationStorageValue, navigationKey, participationKey, todayDocumentId } from '../fixtures/m1aGatewayFixtures.ts'

const expect = baseExpect.configure({ timeout: 12_000 })

const latestTitle = 'Synthetic latest ministry update'
const olderTitle = 'Synthetic older announcement'
const latestBody = 'Synthetic latest article body'
const latestId = 'news-synthetic-latest'
const serverTime = new Date('2026-11-24T17:00:00Z')
const gatewayEnv = {
  SANITY_PROJECT_ID: 'testproject',
  SANITY_DATASET: 'staging',
  SANITY_READ_TOKEN: 'synthetic-test-token',
}

function makeArticle(id: string, title: string, publishOnDate: string, category = 'ministryUpdate') {
  return {
    _id: id,
    _type: 'newsArticle',
    slug: id,
    title,
    publishOnDate,
    category,
    summary: 'Synthetic news summary',
    body: [{
      _key: 'block',
      _type: 'block',
      style: 'normal',
      markDefs: [],
      children: [{ _key: 'span', _type: 'span', text: latestBody, marks: [] }],
    }],
    withdrawn: false,
    editorialReview: { reviewedBy: 'Test', reviewerRole: 'technical_synthetic', reviewedAt: '2026-11-10T17:00:00Z' },
  }
}

const latest = makeArticle(latestId, latestTitle, '2026-11-23')
const older = makeArticle('news-synthetic-older', olderTitle, '2026-11-21', 'announcement')
const embargoed = makeArticle('news-synthetic-embargoed', 'Embargoed title sentinel', '2026-11-25')

let server: ViteDevServer
let url: string

test.beforeAll(async () => {
  server = await createServer({
    define: {
      'import.meta.env.VITE_ENABLE_R06_SHELL': JSON.stringify('true'),
      'import.meta.env.VITE_RELEASE_GATEWAY_ORIGIN': JSON.stringify(''),
      'import.meta.env.VITE_GATEWAY_ORIGIN': JSON.stringify(''),
    },
    server: { host: '127.0.0.1', port: 0 },
    logLevel: 'silent',
  })
  await server.listen()
  const address = server.httpServer?.address()
  if (!address || typeof address === 'string') throw new Error('Reader test server did not bind a port')
  url = `http://127.0.0.1:${address.port}/`
})

test.afterAll(async () => { await server?.close() })

async function useNewsGateway(page: Page) {
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }))
  const feed = {
    documents: [older, embargoed, latest],
    fail: false,
    requests: [] as URL[],
  }
  await page.route('**/api/news*', async route => {
    const request = route.request()
    feed.requests.push(new URL(request.url()))
    if (feed.fail) {
      await route.fulfill({ status: 400, json: { message: 'Gateway internals sentinel' } })
      return
    }
    const response = await handleGatewayRequest(
      new Request(request.url(), { headers: request.headers() }),
      gatewayEnv,
      { getNow: () => serverTime, fetchImpl: async () => Response.json({ result: feed.documents }) },
    )
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: await response.text(),
    })
  })
  return feed
}

const back = (page: Page) => page.getByRole('button', { name: 'Return to previous screen' })
const nav = (page: Page) => page.getByRole('navigation', { name: 'Primary navigation' })

for (const [width, textSize] of [[320, 200], [375, 100]] as const) {
  test(`G09 J7 opens the authorized feature with keyboard and restores context at ${width}px and ${textSize}% text`, async ({ page }) => {
    await page.setViewportSize({ width, height: 640 })
    const feed = await useNewsGateway(page)
    await page.goto(url + '#/more')
    await page.addStyleTag({ content: `html { font-size: ${textSize}%; }` })

    const feature = page.getByRole('button', { name: latestTitle })
    await expect(feature).toBeVisible()
    await expect(page.getByText(embargoed.title)).toHaveCount(0)
    await expect(page.getByText(latestBody)).toHaveCount(0)
    const viewport = page.locator('.r06-viewport')
    await expect.poll(() => viewport.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
    await feature.focus()
    await feature.press('Enter')

    await expect(page.getByRole('heading', { name: latestTitle, level: 1 })).toBeVisible()
    await expect(page.getByText(latestBody)).toBeVisible()
    await expect(page.getByText(olderTitle)).toHaveCount(0)
    await expect(page.getByRole('tablist')).toHaveCount(0)
    await expect(page.getByRole('main')).toHaveCount(1)
    await expect.poll(() => viewport.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
    await back(page).press('Enter')
    await expect(page.getByRole('heading', { name: 'More', exact: true })).toBeVisible()
    await expect(feature).toBeFocused()
    expect(feed.requests.filter(request => request.search === '').length).toBeGreaterThanOrEqual(3)
    const session = await page.evaluate(key => sessionStorage.getItem(key), navigationKey)
    expect(session).not.toContain(latestBody)
    expect(session).not.toContain(latestTitle)
    expect(session).not.toContain(embargoed._id)
  })
}

test('filters the shared feed, retries failures, and returns from an article to its selected category', async ({ page }) => {
  const feed = await useNewsGateway(page)
  await page.goto(url + '#/more')
  await page.getByRole('button', { name: 'View All News' }).click()
  await expect(page.getByRole('article').getByRole('heading')).toHaveText([latestTitle, olderTitle])
  await page.getByRole('tab', { name: 'All News' }).click()
  await expect(page.getByRole('button', { name: latestTitle })).toBeVisible()
  await page.getByRole('tab', { name: 'All News' }).press('End')
  await expect(page.getByRole('tab', { name: 'Monthly Previews' })).toBeFocused()
  await expect(page.getByText('No articles available')).toBeVisible()
  expect(feed.requests.at(-1)?.searchParams.get('category')).toBe('monthlyPreview')

  feed.fail = true
  await page.getByRole('tab', { name: 'Monthly Previews' }).press('ArrowLeft')
  await expect(page.getByRole('alert')).toContainText('Unable to Load Ministry News')
  await expect(page.getByText('Gateway internals sentinel')).toHaveCount(0)
  feed.fail = false
  await page.getByRole('button', { name: 'Retry' }).click()
  const announcement = page.getByRole('button', { name: olderTitle })
  await expect(announcement).toBeVisible()
  await expect(page.getByRole('button', { name: latestTitle })).toHaveCount(0)
  await announcement.click()
  await expect(page.getByRole('heading', { name: olderTitle, level: 1 })).toBeVisible()
  await back(page).click()
  await expect(page.getByRole('tab', { name: 'Announcements' })).toHaveAttribute('aria-selected', 'true')
  await expect(announcement).toBeFocused()
  await back(page).click()
  await expect(page.getByRole('button', { name: 'View All News' })).toBeFocused()
})

test('keeps More entries available with empty or failed News and suppresses a withdrawn article on open and reload', async ({ page }) => {
  const feed = await useNewsGateway(page)
  await page.goto(url + '#/more')
  const feature = page.getByRole('button', { name: latestTitle })
  await expect(feature).toBeVisible()
  feed.documents = [{ ...latest, withdrawn: true }, embargoed]
  await feature.click()
  await expect(page.getByText('This article is unavailable.')).toBeVisible()
  await expect(page.getByText(latestTitle)).toHaveCount(0)
  await expect(page.getByText(latestBody)).toHaveCount(0)
  await page.reload()
  await expect(page.getByText('This article is unavailable.')).toBeVisible()
  await back(page).click()
  await expect(page.getByText('No ministry news has been published yet.')).toBeVisible()

  await expect(page.getByText('Podcasts & Resources')).toBeVisible()
  await expect(page.getByText('No resources are available here yet.')).toBeVisible()
  await expect(page.getByText('Appearance & Settings')).toBeVisible()
  await expect(page.getByText('Account & Progress')).toBeVisible()
  await expect(page.getByText('App Tutorial')).toBeVisible()
  await expect(page.getByRole('link')).toHaveCount(0)
  feed.fail = true
  await page.getByRole('button', { name: 'About Bibleberry' }).click()
  await expect(page.getByText('Bibleberry is offered by Spiritually Hungry.')).toBeVisible()
  await page.getByRole('button', { name: 'Back to More' }).click()
  await expect(page.getByRole('alert')).toHaveText('Unable to load ministry news.')
  await expect(page.getByRole('button', { name: 'View All News' })).toBeVisible()
  feed.fail = false
  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(page.getByText('No ministry news has been published yet.')).toBeVisible()
})

test('opens the same News index from Today and returns to Today after filtering', async ({ page }) => {
  const feed = await useNewsGateway(page)
  await page.goto(url)
  const shortcut = page.getByRole('button', { name: 'Ministry News' })
  await shortcut.click()
  await expect(page.getByRole('button', { name: latestTitle })).toBeVisible()
  await page.getByRole('tab', { name: 'Announcements' }).click()
  await expect(page.getByRole('button', { name: olderTitle })).toBeVisible()
  expect(feed.requests.at(-1)?.searchParams.get('category')).toBe('announcement')
  await back(page).click()
  await expect(shortcut).toBeFocused()
  await expect(nav(page).getByRole('button', { name: 'Today' })).toHaveAttribute('aria-current', 'page')
})

test('replays the Introduction and saves the reminder only after an explicit successful write', async ({ page }) => {
  await useNewsGateway(page)
  const profile = { ...createDefaultReaderProfile(), introStatus: 'completed', tutorialStatus: 'skipped' }
  const profileBefore = JSON.stringify({ schemaVersion: 1, origin: 'defaults', profile })
  const storedProgress = buildGuestParticipationStorageValue({
    completedChallenges: { [todayDocumentId]: { completedOn: '2026-11-20' } },
  })
  await page.addInitScript(entries => {
    for (const [key, value] of entries) {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, value)
    }
  }, [[READER_PROFILE_STORAGE_KEY, profileBefore], [participationKey, storedProgress]])
  await page.goto(url + '#/more')
  const replay = page.getByRole('button', { name: 'Review Introduction' })

  await replay.click()
  await expect(page.getByTestId('onboarding-step-heading')).toBeFocused()
  await expect(nav(page)).toBeHidden()
  await page.keyboard.press('Escape')
  await expect(replay).toBeFocused()

  await replay.press('Enter')
  await page.getByTestId('onboarding-continue-button').click()
  await page.getByTestId('onboarding-continue-button').click()
  const reminderTime = page.getByLabel('Suggested reminder time')
  await reminderTime.fill('08:45')
  await page.getByTestId('onboarding-finish-button').click()
  await expect(replay).toBeFocused()
  expect(await page.evaluate(key => localStorage.getItem(key), participationKey)).toBe(storedProgress)
  const readProfile = () => page.evaluate(key => localStorage.getItem(key), READER_PROFILE_STORAGE_KEY)
  expect(await readProfile()).toBe(profileBefore)

  await replay.press('Enter')
  await page.getByTestId('onboarding-continue-button').click()
  await page.getByTestId('onboarding-continue-button').click()
  await page.evaluate(profileKey => {
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key === profileKey) {
        Storage.prototype.setItem = setItem
        throw new DOMException('Simulated reader profile write failure', 'QuotaExceededError')
      }
      return setItem.call(this, key, value)
    }
  }, READER_PROFILE_STORAGE_KEY)

  const save = page.getByTestId('onboarding-save-reminder-replay-button')
  await reminderTime.fill('09:30')
  await save.click()
  await expect(page.getByRole('alert')).toHaveText('Unable to save the reminder preference.')
  await expect(reminderTime).toHaveValue('09:30')
  await expect(save).toBeEnabled()
  await expect(nav(page)).toBeHidden()
  expect(await readProfile()).toBe(profileBefore)

  await reminderTime.fill('10:15')
  await save.click()
  await expect(replay).toBeFocused()
  await page.reload()
  await expect(replay).toBeVisible()
  expect(JSON.parse((await readProfile())!).profile).toEqual({
    ...profile,
    reminder: { enabled: true, time: '10:15' },
  })
  expect(await page.evaluate(key => localStorage.getItem(key), participationKey)).toBe(storedProgress)
})
