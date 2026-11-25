import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { createServer, type ViteDevServer } from 'vite'
import { expect, test } from '../smoke/helpers/frameSafeTest.ts'
import {
  buildCurrentMonthProgressPayload,
  buildDefaultCurrentMonthPayload,
  buildDefaultHistoricalMonthPayload,
  buildChallengeFixture,
  buildGuestParticipationStorageValue,
  buildGuestShelfStorageValue,
  buildHistoricalMonthProgressPayload,
  buildLibraryMonthsPayload,
  buildMonthPayload,
  currentMonthId,
  currentMonthTitle,
  monthId,
  monthTitle,
  participationKey,
  shelfKey,
  serverContext,
} from './fixtures/m1aGatewayFixtures.ts'

let enabledServer: ViteDevServer
const cacheDirs: string[] = []

async function startReader(enabled: boolean) {
  const cacheDir = await mkdtemp(join(process.cwd(), 'node_modules', '.vite-month-shelf-'))
  cacheDirs.push(cacheDir)
  const server = await createServer({
    cacheDir,
    define: {
      'import.meta.env.VITE_ENABLE_R06_SHELL': JSON.stringify(String(enabled)),
      'import.meta.env.VITE_ENABLE_MONTH_SCREEN': JSON.stringify(String(!enabled)),
      'import.meta.env.VITE_RELEASE_GATEWAY_ORIGIN': JSON.stringify(''),
      'import.meta.env.VITE_GATEWAY_ORIGIN': JSON.stringify(''),
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

async function participation(page: Page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}').data, participationKey)
}

async function storedShelf(page: Page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), shelfKey)
}

test.beforeAll(async () => {
  enabledServer = await startReader(true)
})

test.afterAll(async () => {
  await enabledServer?.close()
  await Promise.all(cacheDirs.map(cacheDir => rm(cacheDir, { recursive: true, force: true })))
})

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-10T12:00:00Z'))
  await page.route('https://**', route => route.abort())
  await page.route('**/api/**', route => route.fulfill({ status: 404, json: { ok: false } }))
  await page.route('**/api/library/months**', route => route.fulfill({ json: buildLibraryMonthsPayload() }))
  await page.route(`**/api/months/${monthId}`, route => route.fulfill({ json: buildDefaultHistoricalMonthPayload() }))
  await page.route(`**/api/months/${currentMonthId}`, route => route.fulfill({ json: buildDefaultCurrentMonthPayload() }))
  await page.route(`**/api/months/${currentMonthId}/progress`, route =>
    route.fulfill({ json: buildCurrentMonthProgressPayload(route.request().postDataJSON().completedChallengeIds) }),
  )
  await page.route(`**/api/months/${monthId}/progress`, route =>
    route.fulfill({ json: buildHistoricalMonthProgressPayload(route.request().postDataJSON().completedChallengeIds) }),
  )
})

async function openOctoberFromCatalogue(page: Page) {
  await page.getByRole('button', { name: /Open October 2026/ }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Begin the Month', exact: true }).click()
  await expect(page.getByRole('heading', { name: monthTitle, exact: true })).toBeVisible()
}

async function enterCatalogue(page: Page) {
  await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('button', { name: 'Library' }).click()
  await page.getByRole('button', { name: 'Browse All Months' }).click()
}

test('R06 Shelf loads an older authorized Month theme and updates progress after Finish, then clears it when withdrawn', async ({ page }) => {
  const olderMonth = '2025-01'
  const olderTheme = 'Synthetic older authorized theme'
  let withdrawn = false

  await page.addInitScript(({ shelfKey, participationKey, shelf, participation }) => {
    localStorage.setItem(shelfKey, shelf)
    localStorage.setItem(participationKey, participation)
  }, {
    shelfKey,
    participationKey,
    shelf: buildGuestShelfStorageValue({
      activeFocusMonth: null,
      months: [{ yearMonth: olderMonth, admissionKind: 'autoAdmitted', isProtected: false }],
    }),
    participation: buildGuestParticipationStorageValue(),
  })

  await page.route('**/api/library/months**', route => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor')
    const pagePayload = buildLibraryMonthsPayload()
    return route.fulfill({
      json: {
        ...pagePayload,
        items: cursor
          ? [{ yearMonth: olderMonth, year: 2025, month: 1, title: olderTheme }]
          : pagePayload.items,
        page: {
          limit: 12,
          hasMore: !cursor,
          nextCursor: cursor ? null : '2025-03',
        },
      },
    })
  })
  await page.route(`**/api/months/${olderMonth}`, route =>
    withdrawn
      ? route.fulfill({ status: 404, json: { ok: false, error: 'Month not found' } })
      : route.fulfill({
          json: buildMonthPayload({
            yearMonth: olderMonth,
            year: 2025,
            month: 1,
            daysInMonth: 31,
            phase: 'historical',
            title: olderTheme,
            context: serverContext,
            slotOverride: (dayOfMonth, date) => ({
              dayOfMonth,
              date,
              availability: 'available',
              title: `Synthetic Challenge ${dayOfMonth}`,
              slug: dayOfMonth === 1 ? 'older-day-01' : `older-day-${dayOfMonth}`,
              challengeId: `cms:${dayOfMonth === 1 ? 'older-day-01' : `older-day-${dayOfMonth}`}`,
              challengeType: 'teaching',
            }),
          }),
        }),
  )
  await page.route(`**/api/months/${olderMonth}/progress`, route => {
    const request = route.request().postDataJSON() as { completedChallengeIds?: string[] } | null
    const completedInMonthCount = request?.completedChallengeIds?.length ?? 0
    return route.fulfill({
      json: {
        ok: true,
        serverContext,
        monthId: olderMonth,
        rosterVersion: 1,
        completedInMonthCount,
        totalChallenges: 31,
        thematicEarnedCount: 0,
        thematicTotalCount: 0,
        discoveries: [],
      },
    })
  })
  await page.route('**/api/challenges/older-day-01', route =>
    route.fulfill({
      json: {
        ok: true,
        serverContext,
        challenge: buildChallengeFixture({
          yearMonth: olderMonth,
          dayOfMonth: 1,
          documentId: 'older-day-01',
          slug: 'older-day-01',
          title: 'Synthetic older Challenge',
          seriesId: 'older-month-series',
          seriesTitle: 'Synthetic older series',
          scriptureReference: 'Psalm 119:105',
          releaseAt: '2025-01-01T00:00:00Z',
          reviewedAt: '2025-01-01T12:00:00Z',
          screenKeyPrefix: 'older-step',
          screenHeadingPrefix: 'Synthetic older step',
          bodyText: 'Synthetic test content.',
        }),
      },
    }),
  )

  await page.goto(readerUrl())
  await page.getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('button', { name: 'Library' }).click()
  const card = page.locator(`.shelf-card[data-year-month="${olderMonth}"]`)
  await expect(card.getByRole('heading', { name: 'January 2025' })).toBeVisible()
  await expect(card.getByText(olderTheme)).toBeVisible()
  await expect(card.getByText('0 of 31 Challenges', { exact: true })).toBeVisible()

  await card.getByRole('button', { name: 'Open January 2025' }).click()
  await expect(page.getByRole('heading', { name: olderTheme, exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Begin the Month', exact: true }).click()
  await page.getByRole('button', { name: 'Synthetic Challenge 1' }).click()
  await page.getByRole('navigation', { name: 'Challenge screen navigation' })
    .getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Finish', exact: true }).click()
  await expect(page.getByText('1 of 31')).toBeVisible()
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(card.getByText('1 of 31 Challenges', { exact: true })).toBeVisible()
  expect((await participation(page)).completedChallenges['cms:older-day-01']).toBeTruthy()

  withdrawn = true
  await page.getByRole('button', { name: 'Browse All Months' }).click()
  await page.getByRole('button', { name: 'Your Shelf' }).click()
  await expect(card.getByText('Completion progress unavailable')).toBeVisible()
  await expect(card.getByText(olderTheme)).toHaveCount(0)
  await expect(card).toHaveAttribute('data-protected', 'false')
})

test('J5 shares protected Shelf membership across the Month and Library entrances and reload', async ({ page }) => {
  const september = buildMonthPayload({
    yearMonth: '2026-09',
    year: 2026,
    month: 9,
    daysInMonth: 30,
    phase: 'historical',
    title: 'September synthetic theme',
    discoveries: [],
  })
  await page.route('**/api/months/2026-09', route => route.fulfill({ json: september }))
  await page.route('**/api/months/2026-09/progress', route => route.fulfill({ status: 404, json: { ok: false } }))
  await page.route('**/api/library/months**', route => {
    const payload = buildLibraryMonthsPayload()
    return route.fulfill({
      json: {
        ...payload,
        items: [...payload.items, { yearMonth: '2026-09', year: 2026, month: 9, title: september.month.title }],
      },
    })
  })
  await page.goto(readerUrl())
  await enterCatalogue(page)
  await openOctoberFromCatalogue(page)
  const shelfAction = page.getByRole('button', { name: 'Add to Shelf', exact: true })
  await expect(shelfAction).toBeEnabled()
  expect((await storedShelf(page))?.state.months ?? []).toEqual([])
  await shelfAction.click()
  await expect(page.getByRole('button', { name: 'Kept on Shelf' })).toBeFocused()

  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.getByRole('button', { name: 'October 2026 is already protected on Shelf' })).toBeVisible()
  await page.getByRole('button', { name: 'Add September 2026 to Shelf' }).click()
  await expect(page.getByRole('button', { name: 'September 2026 is already protected on Shelf' })).toBeVisible()
  await page.getByRole('button', { name: /Open September 2026/ }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Begin the Month', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Kept on Shelf' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: september.month.title })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Kept on Shelf' })).toBeVisible()

  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.getByRole('button', { name: 'October 2026 is already protected on Shelf' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'September 2026 is already protected on Shelf' })).toBeVisible()
  expect((await storedShelf(page)).state.activeFocusMonth).toBeNull()
})

const fullShelf = buildGuestShelfStorageValue({
  activeFocusMonth: '2026-07',
  months: [
    { yearMonth: '2026-07', admissionKind: 'autoAdmitted', isProtected: false },
    { yearMonth: '2026-08', admissionKind: 'readerSelected', isProtected: true },
    { yearMonth: '2026-09', admissionKind: 'readerSelected', isProtected: true },
  ],
})

async function seedShelf(page: Page, raw: string) {
  await page.addInitScript(({ key, raw }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, raw)
  }, { key: shelfKey, raw })
}

test('J5 confirms replacement and Active Focus in place while preserving study records and the Library origin', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 640 })
  await seedShelf(page, fullShelf)
  await page.addInitScript(({ key, raw }) => {
    const envelope = JSON.parse(raw)
    envelope.schemaVersion = 2
    envelope.data.savedScriptures = [{ reference: 'John 3:16', translation: 'ESV', savedOn: '2026-07-15' }]
    localStorage.setItem(key, JSON.stringify(envelope))
  }, {
    key: participationKey,
    raw: buildGuestParticipationStorageValue({
      completedChallenges: { 'cms:earlier-study': { completedOn: '2026-07-10' } },
      inProgressChallenges: { 'cms:unfinished-study': { updatedOn: '2026-07-11', screenId: 'reflection' } },
      earnedAwards: {
        'card:monthly:2026-07:full-month': {
          awardId: 'card:monthly:2026-07:full-month',
          kind: 'fullMonth',
          publicationYearMonth: '2026-07',
          discoveryId: 'discovery:2026-07:full-month',
          earnedOn: '2026-07-31',
          hubAnnouncementAcked: true,
          cardViewed: true,
        },
      },
    }),
  })
  await page.goto(readerUrl())
  await enterCatalogue(page)
  await openOctoberFromCatalogue(page)
  const progressBefore = await participation(page)
  const shelfBefore = await storedShelf(page)
  const add = page.getByRole('button', { name: 'Add to Shelf', exact: true })
  const viewport = page.locator('.r06-viewport')
  await add.focus()
  await viewport.evaluate(element => { element.scrollTop = 120 })
  const scrollTop = await viewport.evaluate(element => element.scrollTop)
  expect(scrollTop).toBeGreaterThan(0)
  const monthUrl = page.url()
  await add.press('Enter')

  const chooser = page.getByRole('dialog', { name: 'Choose a Month to Replace' })
  await expect(chooser).toContainText(monthTitle)
  await expect(chooser.getByRole('group', { name: 'Current Shelf months' }).getByRole('radio')).toHaveCount(3)
  await expect(chooser.getByRole('radio', { name: /July 2026.*Active Focus/ })).toBeVisible()
  await expect(chooser.getByRole('radio', { name: /August 2026.*Kept on Shelf/ })).toBeVisible()
  await chooser.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(add).toBeFocused()
  expect(await storedShelf(page)).toEqual(shelfBefore)
  await expect(page).toHaveURL(monthUrl)
  await expect.poll(() => viewport.evaluate(element => element.scrollTop)).toBe(scrollTop)

  await add.press('Enter')
  await chooser.getByRole('radio', { name: /July 2026.*Active Focus/ }).check()
  const confirm = chooser.getByRole('button', { name: 'Replace Selected Month' })
  await expect(confirm).toBeDisabled()
  const focus = chooser.getByRole('group', { name: 'Choose your Active Focus' })
  await focus.getByRole('radio', { name: 'August 2026' }).check()
  await confirm.click()
  await expect(page.getByRole('button', { name: 'Kept on Shelf' })).toBeFocused()
  await expect(page).toHaveURL(monthUrl)
  await expect.poll(() => viewport.evaluate(element => element.scrollTop)).toBe(scrollTop)
  const stored = await storedShelf(page)
  expect(stored.state.activeFocusMonth).toBe('2026-08')
  expect(stored.state.months.map((month: { yearMonth: string }) => month.yearMonth).sort()).toEqual(['2026-08', '2026-09', monthId])
  expect(stored.state.months.find((month: { yearMonth: string }) => month.yearMonth === monthId))
    .toMatchObject({ admissionKind: 'readerSelected', isProtected: true })
  expect(stored.state.months.find((month: { yearMonth: string }) => month.yearMonth === '2026-08'))
    .toMatchObject({ admissionKind: 'readerSelected', isProtected: true })
  expect(await participation(page)).toEqual(progressBefore)

  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.getByRole('button', { name: 'October 2026 is already protected on Shelf' })).toBeVisible()
  await page.getByRole('button', { name: 'Back to Shelf' }).click()
  await page.getByRole('button', { name: /Put Away August 2026 from Shelf/i }).click()
  const putAway = page.getByRole('dialog')
  await putAway.getByRole('radio', { name: 'No focus for now' }).check()
  await putAway.getByRole('button', { name: 'Confirm Put Away', exact: true }).click()
  await expect.poll(() => storedShelf(page)).toMatchObject({ state: { activeFocusMonth: null } })
  expect(await participation(page)).toEqual(progressBefore)
})

for (const failure of ['stale', 'unwritable', 'corrupt'] as const) {
  test(`J5 rejects a ${failure} Shelf at confirmation without claiming membership or leaving the Month`, async ({ page }) => {
    await seedShelf(page, fullShelf)
    await page.goto(readerUrl())
    await enterCatalogue(page)
    await openOctoberFromCatalogue(page)
    const add = page.getByRole('button', { name: 'Add to Shelf', exact: true })
    const viewport = page.locator('.r06-viewport')
    await add.focus()
    await viewport.evaluate(element => { element.scrollTop = 120 })
    const scrollTop = await viewport.evaluate(element => element.scrollTop)
    expect(scrollTop).toBeGreaterThan(0)
    await add.press('Enter')
    const chooser = page.getByRole('dialog', { name: 'Choose a Month to Replace' })
    await chooser.getByRole('radio', { name: /September 2026/ }).check()
    const rawBefore = await page.evaluate(({ key, failure }) => {
      if (failure === 'stale') {
        const newer = JSON.parse(localStorage.getItem(key)!)
        newer.state.activeFocusMonth = '2026-08'
        localStorage.setItem(key, JSON.stringify(newer))
      } else if (failure === 'corrupt') {
        localStorage.setItem(key, '{corrupt')
      } else {
        const setItem = Storage.prototype.setItem
        Storage.prototype.setItem = function (name, value) {
          if (name === key) throw new DOMException('Test Shelf quota failure', 'QuotaExceededError')
          return setItem.call(this, name, value)
        }
      }
      return localStorage.getItem(key)
    }, { key: shelfKey, failure })
    const monthUrl = page.url()

    await chooser.getByRole('button', { name: 'Replace Selected Month' }).click()
    await expect(page.getByRole('alert').filter({
      hasText: failure === 'stale' ? 'Your Shelf changed' : 'Unable to save your Shelf',
    })).toBeVisible()
    await expect(add).toBeFocused()
    await expect(page.getByRole('button', { name: 'Kept on Shelf' })).toHaveCount(0)
    await expect(page).toHaveURL(monthUrl)
    await expect.poll(() => viewport.evaluate(element => element.scrollTop)).toBe(scrollTop)
    expect(await page.evaluate(key => localStorage.getItem(key), shelfKey)).toBe(rawBefore)
  })
}

test('J5 can keep a rollover month directly and hides the action on the legacy Month Screen', async ({ page }) => {
  await seedShelf(page, buildGuestShelfStorageValue({
    activeFocusMonth: monthId,
    months: [{ yearMonth: monthId, admissionKind: 'autoAdmitted', isProtected: false }],
  }))
  await page.goto(readerUrl())
  await enterCatalogue(page)
  await openOctoberFromCatalogue(page)
  await page.getByRole('button', { name: 'Keep on Shelf', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Kept on Shelf' })).toBeVisible()
  expect((await storedShelf(page)).state).toMatchObject({
    activeFocusMonth: monthId,
    months: [{ yearMonth: monthId, admissionKind: 'readerSelected', isProtected: true }],
  })

  await page.addInitScript(() => {
    localStorage.setItem('bibleberry-prototype-v1', JSON.stringify({ onboarded: true, appearance: 'system' }))
  })
  const legacyMonthServer = await startReader(false)
  try {
    await page.goto(`${readerUrl(legacyMonthServer)}#/month/${monthId}`)
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByRole('button', { name: 'Begin the Month', exact: true }).click()
    await expect(page.getByRole('heading', { name: monthTitle, exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /(?:Add to|Keep on|Kept on) Shelf/ })).toHaveCount(0)
  } finally {
    await legacyMonthServer.close()
  }
})

test('J5 hides Shelf membership on current, unavailable, and advance-preview Month Screens', async ({ page }) => {
  const future = '2026-12'
  const preview = buildMonthPayload({
    yearMonth: future,
    year: 2026,
    month: 12,
    daysInMonth: 31,
    phase: 'active',
    title: 'December synthetic theme',
  })
  const { month } = preview
  await page.route(`**/api/months/${future}/preview`, route => route.fulfill({
    json: {
      ...preview,
      serverContext: { ...preview.serverContext, authorizedLocalDate: '2026-11-28' },
      month: {
        monthId: month.monthId,
        documentId: month.documentId,
        year: month.year,
        month: month.month,
        daysInMonth: month.daysInMonth,
        title: month.title,
        phase: 'advancePreview',
        monthStartsOn: '2026-12-01',
        introduction: { version: month.introduction.version, previewScreens: month.introduction.previewScreens },
        slots: month.slots.map(slot => ({
          dayOfMonth: slot.dayOfMonth,
          date: slot.date,
          title: slot.title,
          availability: 'comingSoon',
        })),
      },
    },
  }))
  await page.goto(readerUrl())
  await page.getByTestId('today-current-month-link').click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Begin the Month', exact: true }).click()
  await expect(page.getByRole('heading', { name: currentMonthTitle, exact: true })).toBeVisible()

  const shelfAction = page.getByRole('button', { name: /(?:Add to|Keep on|Kept on) Shelf/ })
  await expect(shelfAction).toHaveCount(0)
  await page.getByLabel('Jump to month').fill('2020-01')
  await page.getByRole('button', { name: 'Go', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Month unavailable' })).toBeVisible()
  await expect(shelfAction).toHaveCount(0)
  await page.getByLabel('Jump to month').fill(future)
  await page.getByRole('button', { name: 'Go', exact: true }).click()
  await page.getByRole('button', { name: 'View Preview Calendar' }).click()
  await expect(page.locator('[data-month-agenda]')).toHaveAttribute('data-month-agenda', 'preview')
  await expect(shelfAction).toHaveCount(0)
})
