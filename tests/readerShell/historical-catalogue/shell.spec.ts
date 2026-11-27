import { createServer, type ViteDevServer } from 'vite'
import { expect, test } from '../../smoke/helpers/frameSafeTest.ts'
import {
  buildDefaultHistoricalMonthPayload, buildHistoricalMonthProgressPayload,
  buildGuestParticipationStorageValue, buildLibraryMonthsPayload, buildReaderProfileStorageValue,
  documentId, monthId, monthTitle, participationKey, readerProfileKey, shelfKey,
} from '../fixtures/m1aGatewayFixtures.ts'

let server: ViteDevServer
let url: string

test.beforeAll(async () => {
  server = await createServer({
    cacheDir: 'node_modules/.vite/reader-shell-historical-catalogue',
    define: {
      'import.meta.env.VITE_ENABLE_R06_SHELL': JSON.stringify('true'),
      'import.meta.env.VITE_RELEASE_GATEWAY_ORIGIN': '""',
      'import.meta.env.VITE_GATEWAY_ORIGIN': '""',
    },
    server: { host: '127.0.0.1', port: 0 },
    logLevel: 'silent',
  })
  await server.listen()
  const address = server.httpServer?.address()
  if (!address || typeof address === 'string') throw new Error('Missing test server port')
  url = `http://127.0.0.1:${address.port}/`
})
test.afterAll(async () => { await server?.close() })
test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ key, value }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, value)
    },
    { key: readerProfileKey, value: buildReaderProfileStorageValue() },
  )
})

test('J5 searches across years, retries a cursor and restores a reauthorized catalogue after reading', async ({ page }) => {
  const completed = { [`cms:${documentId}`]: { completedOn: '2026-10-25' } }
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: participationKey, value: buildGuestParticipationStorageValue({ completedChallenges: completed }),
  })
  await page.clock.setFixedTime(new Date('2026-11-15T12:00:00Z'))
  await page.setViewportSize({ width: 390, height: 660 })
  await page.route('https://**', route => route.abort())
  await page.route('**/api/**', route => route.fulfill({ status: 404, json: { ok: false } }))
  await page.route(`**/api/months/${monthId}`, route => route.fulfill({ json: buildDefaultHistoricalMonthPayload() }))
  await page.route(`**/api/months/${monthId}/progress`, route => route.fulfill({
    json: buildHistoricalMonthProgressPayload(route.request().postDataJSON().completedChallengeIds),
  }))
  const older = { yearMonth: '2025-12', year: 2025, month: 12, title: 'December test publication' }
  let withdrawn = false
  let failNext = true
  await page.route('**/api/library/months**', route => {
    const params = new URL(route.request().url()).searchParams
    const cursor = params.get('cursor')
    const query = params.get('q')
    if (cursor && query && failNext) {
      failNext = false
      return route.fulfill({ status: 400, json: { ok: false } })
    }
    const payload = buildLibraryMonthsPayload()
    const items = cursor ? (withdrawn ? [] : [older]) : payload.items
    return route.fulfill({ json: {
      ...payload, items: items.filter(item => !query || item.title.includes(query)),
      page: { limit: 12, hasMore: !cursor, nextCursor: cursor ? null : monthId },
    } })
  })
  await page.goto(url)
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
  await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('button', { name: 'Library' }).click()
  await page.getByRole('button', { name: 'Browse All Months' }).click()
  const more = page.getByRole('button', { name: 'Load more past months' })
  await more.click()
  const year = page.getByRole('button', { name: '2025', exact: true })
  await expect(year).toHaveAttribute('aria-expanded', 'false')
  await year.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: /Open December 2025/ })).toBeVisible()
  const search = page.getByRole('searchbox')
  await search.fill('publication')
  await more.click()
  await expect(page.getByRole('alert').filter({ hasText: 'Unable to load older months' })).toBeVisible()
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.locator('.library-card__month-eyebrow')).toHaveText(['October 2026', 'December 2025'])
  await expect(year).toHaveCount(0)
  await search.fill('')
  await expect(year).toHaveAttribute('aria-expanded', 'true')
  await search.fill('publication')
  await more.click()
  await expect(page.locator('.library-card')).toHaveCount(2)
  const open = page.getByRole('button', { name: /Open October 2026/ })
  await open.focus()
  const viewport = page.locator('.r06-viewport')
  await viewport.evaluate(el => { el.scrollTop = 120 })
  const scrollTop = await viewport.evaluate(el => el.scrollTop)
  expect(scrollTop).toBeGreaterThan(0)
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Begin the Month' }).click()
  await expect(page.getByRole('heading', { name: monthTitle, exact: true })).toBeVisible()
  withdrawn = true
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(search).toHaveValue('publication')
  await expect(open).toBeFocused()
  await expect(page.getByText('You have reached the beginning of the Library catalogue.')).toBeVisible()
  await expect(page.locator('.library-card')).toHaveCount(1)
  await expect.poll(() => viewport.evaluate(el => el.scrollTop)).toBe(scrollTop)
  expect(await page.locator('.library-page').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).data.completedChallenges, participationKey)).toEqual(completed)
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null')?.state.months ?? [], shelfKey)).toEqual([])
})

for (const scenario of [
  { name: 'a preceding row is removed', search: false, change: 'remove' },
  { name: 'a preceding row is inserted', search: true, change: 'insert' },
  { name: 'the focused Month is withdrawn', search: true, change: 'withdraw' },
] as const) {
  test(`J5 restores catalogue focus when ${scenario.name}`, async ({ page }) => {
    await page.clock.setFixedTime(new Date('2027-01-15T12:00:00Z'))
    await page.route('https://**', route => route.abort())
    await page.route('**/api/**', route => route.fulfill({ status: 404, json: { ok: false } }))
    await page.route(`**/api/months/${monthId}`, route => route.fulfill({ json: buildDefaultHistoricalMonthPayload() }))
    await page.route(`**/api/months/${monthId}/progress`, route => route.fulfill({
      json: buildHistoricalMonthProgressPayload(route.request().postDataJSON().completedChallengeIds),
    }))
    const november = { yearMonth: '2026-11', year: 2026, month: 11, title: 'November test publication' }
    const december = { yearMonth: '2026-12', year: 2026, month: 12, title: 'December test publication' }
    const september = { yearMonth: '2026-09', year: 2026, month: 9, title: 'September test publication' }
    let returning = false
    let releaseContinuation: (() => void) | undefined
    const continuation = new Promise<void>(resolve => { releaseContinuation = resolve })
    let continuationRequested: (() => void) | undefined
    const requested = new Promise<void>(resolve => { continuationRequested = resolve })
    await page.route('**/api/library/months**', async route => {
      const cursor = new URL(route.request().url()).searchParams.get('cursor')
      if (returning && cursor) {
        continuationRequested?.()
        await continuation
      }
      const payload = buildLibraryMonthsPayload()
      const first = returning && scenario.change === 'remove' ? []
        : returning && scenario.change === 'insert' ? [december, november] : [november]
      const second = returning && scenario.change === 'withdraw' ? [september] : [...payload.items, september]
      return route.fulfill({ json: {
        ...payload, serverContext: { ...payload.serverContext, authorizedLocalDate: '2027-01-15' },
        items: cursor ? second : first,
        page: { limit: 12, hasMore: !cursor, nextCursor: cursor ? null : '2026-11' },
      } })
    })
    await page.goto(url)
    await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('button', { name: 'Library' }).click()
    await page.getByRole('button', { name: 'Browse All Months' }).click()
    const search = page.getByRole('searchbox')
    if (scenario.search) await search.fill('publication')
    await page.getByRole('button', { name: 'Load more past months' }).click()
    const october = page.getByRole('button', { name: /Open October 2026/ })
    await october.focus()
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByRole('button', { name: 'Begin the Month' }).click()
    returning = true
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await requested
    await expect(search).not.toBeFocused()
    releaseContinuation?.()
    await expect(page.getByText('You have reached the beginning of the Library catalogue.')).toBeVisible()
    if (scenario.change === 'withdraw') {
      await expect(october).toHaveCount(0)
      await expect(search).toBeFocused()
    } else {
      await expect(october).toBeFocused()
    }
    await expect(search).toHaveValue(scenario.search ? 'publication' : '')
    if (!scenario.search) await expect(page.getByRole('button', { name: '2026', exact: true })).toHaveAttribute('aria-expanded', 'true')
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null')?.state.months ?? [], shelfKey)).toEqual([])
  })
}
