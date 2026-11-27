import { createServer, type ViteDevServer } from 'vite'
import type { Page } from '@playwright/test'
import { expect, test } from '../../smoke/helpers/frameSafeTest.ts'
import {
  READER_PROFILE_STORAGE_KEY,
  createDefaultReaderProfile,
  serializeReaderProfileEnvelope,
} from '../../../src/readerProfile/index.ts'
import { parseParticipationEnvelope } from '../../../src/participation/persistence.ts'
import { parseShelfEnvelope } from '../../../src/shelfPersistence/persistence.ts'
import * as fixtures from '../fixtures/m1aGatewayFixtures.ts'

let server: ViteDevServer
let url: string

async function startReader() {
  const vite = await createServer({
    cacheDir: 'node_modules/.vite/reader-shell-appearance-settings',
    define: {
      'import.meta.env.VITE_ENABLE_R06_SHELL': JSON.stringify('true'),
      'import.meta.env.VITE_RELEASE_GATEWAY_ORIGIN': JSON.stringify(''),
      'import.meta.env.VITE_GATEWAY_ORIGIN': JSON.stringify(''),
      'import.meta.env.VITE_ENABLE_FIELD_NOTEBOOK': JSON.stringify('false'),
      'import.meta.env.VITE_ENABLE_SAVED_SCRIPTURE': JSON.stringify('false'),
    },
    server: { host: '127.0.0.1', port: 0 },
    logLevel: 'silent',
  })
  await vite.listen()
  const address = vite.httpServer?.address()
  if (!address || typeof address === 'string') throw new Error('Reader test server did not bind a port')
  url = `http://127.0.0.1:${address.port}/`
  return vite
}

async function mockGateway(page: Page) {
  await page.route(fixtures.currentThematicCardImageUrl, route =>
    route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: fixtures.SYNTHETIC_CARD_SVG,
    }),
  )
  await page.route('**/api/news**', route => {
    const category = new URL(route.request().url()).searchParams.get('category')
    return route.fulfill({ json: fixtures.buildNewsPayload(category) })
  })
  await page.route('**/api/library/months**', route =>
    route.fulfill({ json: fixtures.buildLibraryMonthsPayload() }),
  )
  await page.route(`**/api/months/${fixtures.monthId}`, route =>
    route.fulfill({ json: fixtures.buildDefaultHistoricalMonthPayload() }),
  )
  await page.route(`**/api/months/${fixtures.monthId}/progress`, route => {
    const ids = route.request().postDataJSON().completedChallengeIds as string[]
    return route.fulfill({ json: fixtures.buildHistoricalMonthProgressPayload(ids) })
  })
  await page.route(`**/api/months/${fixtures.currentMonthId}`, route =>
    route.fulfill({ json: fixtures.buildDefaultCurrentMonthPayload() }),
  )
  await page.route(`**/api/months/${fixtures.currentMonthId}/progress`, route => {
    const ids = route.request().postDataJSON().completedChallengeIds as string[]
    return route.fulfill({ json: fixtures.buildCurrentMonthProgressPayload(ids) })
  })
  await page.route('**/api/challenges', route =>
    route.fulfill({
      json: { ok: true, challenges: [fixtures.todayChallenge] },
    }),
  )
  await page.route(`**/api/challenges/${fixtures.todaySlug}`, route =>
    route.fulfill({ json: { ok: true, challenge: fixtures.todayChallenge } }),
  )
}

function seedOnce(page: Page, entries: Record<string, string>) {
  return page.addInitScript((records: Record<string, string>) => {
    for (const [key, value] of Object.entries(records)) {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, value)
    }
  }, entries)
}

test.beforeAll(async () => {
  server = await startReader()
})

test.afterAll(async () => {
  await server?.close()
})

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-15T12:00:00Z'))
  await page.route('https://**', route => {
    if (route.request().url() === fixtures.currentThematicCardImageUrl) return route.fallback()
    return route.abort()
  })
  await mockGateway(page)
})

test('More → Appearance & Settings → More defaults to Follow Bibleberry Seasons, distinguishes applied vs saved, and restores focus', async ({
  page,
}) => {
  // Fresh profile with intro/tutorial already completed so More is directly reachable without first-use gate.
  const freshProfile = {
    ...createDefaultReaderProfile(),
    introStatus: 'completed' as const,
    tutorialStatus: 'skipped' as const,
  }
  await seedOnce(page, {
    [READER_PROFILE_STORAGE_KEY]: serializeReaderProfileEnvelope(freshProfile, 'defaults'),
  })

  await page.goto(url + '#/more')
  const appearanceBtn = page.getByTestId('more-appearance-settings-button')
  await expect(appearanceBtn).toBeVisible()
  await expect(appearanceBtn).toHaveText('Appearance & Settings')

  await appearanceBtn.click()
  await expect(page.getByRole('heading', { name: 'Appearance & Settings', level: 1 })).toBeVisible()

  // Clearly distinguishes applied appearance from saved preference.
  await expect(page.getByTestId('appearance-applied-palette')).toHaveText('Standard Bibleberry palette')
  await expect(page.getByTestId('appearance-saved-preference')).toContainText('Follow Bibleberry Seasons')
  await expect(page.getByTestId('appearance-contrast-preference')).toHaveText('System')

  // Default mode checked; Choose My Colors truthfully unavailable with no invented palette.
  const followRadio = page.getByTestId('appearance-mode-follow-seasons')
  const chooseRadio = page.getByTestId('appearance-mode-choose-colors')
  await expect(followRadio).toBeChecked()
  await expect(chooseRadio).toBeDisabled()
  await expect(page.getByTestId('appearance-choose-colors-unavailable')).toBeVisible()

  // Relaunch (reload preserves session route; cold relaunch returns via More) preserves durable default.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Appearance & Settings', level: 1 })).toBeVisible()
  await expect(page.getByTestId('appearance-mode-follow-seasons')).toBeChecked()
  await expect(page.getByTestId('appearance-mode-choose-colors')).toBeDisabled()

  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), READER_PROFILE_STORAGE_KEY)
  expect(stored?.profile?.appearance).toEqual({ mode: 'followSeasons', chosenPaletteId: null })

  // Back to More restores focus to Appearance & Settings button.
  await page.getByTestId('appearance-settings-back').click()
  await expect(page.getByRole('heading', { name: 'More', level: 1 })).toBeVisible()
  await expect(page.getByTestId('more-appearance-settings-button')).toBeFocused()
})

test('preserves valid remembered manual preference across mode switches and relaunch without changing applied theme', async ({
  page,
}) => {
  const manualProfile = {
    ...createDefaultReaderProfile(),
    introStatus: 'completed' as const,
    tutorialStatus: 'skipped' as const,
    appearance: { mode: 'chooseColors' as const, chosenPaletteId: 'olive-linen' },
    contrastMode: 'dark' as const,
  }
  await seedOnce(page, {
    [READER_PROFILE_STORAGE_KEY]: serializeReaderProfileEnvelope(manualProfile, 'defaults'),
  })

  await page.goto(url + '#/more')
  const themeBefore = await page.evaluate(() => ({
    dataTheme: document.documentElement.dataset.theme ?? null,
    pageBg: getComputedStyle(document.documentElement).getPropertyValue('--page').trim(),
  }))

  await page.getByTestId('more-appearance-settings-button').click()
  await expect(page.getByTestId('appearance-mode-choose-colors')).toBeChecked()
  await expect(page.getByTestId('appearance-mode-choose-colors')).toBeEnabled()
  await expect(page.getByTestId('appearance-remembered-palette')).toContainText('olive-linen')
  await expect(page.getByTestId('appearance-applied-palette')).toHaveText('Standard Bibleberry palette')
  await expect(page.getByTestId('appearance-contrast-preference')).toHaveText('Dark')

  // Switch to Follow Bibleberry Seasons; remembered palette must stay intact.
  await page.getByTestId('appearance-mode-follow-seasons').click()
  await expect(page.getByTestId('appearance-mode-follow-seasons')).toBeChecked()
  await expect(page.getByTestId('appearance-remembered-palette')).toContainText('olive-linen')
  await expect(page.getByTestId('appearance-save-status')).toContainText('Follow Bibleberry Seasons')

  // Reload verifies durable persistence of Follow Bibleberry Seasons + remembered palette.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Appearance & Settings', level: 1 })).toBeVisible()
  await expect(page.getByTestId('appearance-mode-follow-seasons')).toBeChecked()
  await expect(page.getByTestId('appearance-mode-choose-colors')).toBeEnabled()
  await expect(page.getByTestId('appearance-remembered-palette')).toContainText('olive-linen')

  // Switch back to Choose My Colors; restores olive-linen durably.
  await page.getByTestId('appearance-mode-choose-colors').click()
  await expect(page.getByTestId('appearance-mode-choose-colors')).toBeChecked()
  await expect(page.getByTestId('appearance-save-status')).toContainText('Choose My Colors (olive-linen)')

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Appearance & Settings', level: 1 })).toBeVisible()
  await expect(page.getByTestId('appearance-mode-choose-colors')).toBeChecked()
  await expect(page.getByTestId('appearance-remembered-palette')).toContainText('olive-linen')

  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), READER_PROFILE_STORAGE_KEY)
  expect(stored?.profile?.appearance).toEqual({ mode: 'chooseColors', chosenPaletteId: 'olive-linen' })
  expect(stored?.profile?.contrastMode).toBe('dark')

  // Applied theme/contrast remained unchanged throughout.
  const themeAfter = await page.evaluate(() => ({
    dataTheme: document.documentElement.dataset.theme ?? null,
    pageBg: getComputedStyle(document.documentElement).getPropertyValue('--page').trim(),
  }))
  expect(themeAfter).toEqual(themeBefore)
})

test('handles invalid stored appearance preference safely and surfaces storage write failures truthfully', async ({
  page,
}) => {
  // Part 1: Invalid stored appearance (chooseColors with null paletteId).
  const invalidStored = JSON.stringify({
    schemaVersion: 1,
    origin: 'defaults',
    profile: {
      ...createDefaultReaderProfile(),
      introStatus: 'completed',
      tutorialStatus: 'skipped',
      appearance: { mode: 'chooseColors', chosenPaletteId: null },
    },
  })
  await seedOnce(page, { [READER_PROFILE_STORAGE_KEY]: invalidStored })

  await page.goto(url + '#/more')
  await page.getByTestId('more-appearance-settings-button').click()

  await expect(page.getByTestId('appearance-invalid-notice')).toBeVisible()
  await expect(page.getByTestId('appearance-preference-term')).toHaveText('Fallback preference')
  await expect(page.getByTestId('appearance-saved-preference')).toContainText('Display fallback — not saved')
  await expect(page.getByTestId('appearance-applied-card')).not.toContainText('Your saved preference is stored on this device')
  await expect(page.getByTestId('appearance-mode-follow-seasons')).toBeChecked()
  await expect(page.getByTestId('appearance-mode-choose-colors')).toBeDisabled()
  await expect(page.getByTestId('appearance-choose-colors-unavailable')).toBeVisible()

  // Part 2: Corrupt stored profile JSON must show alert, never claim storage succeeded,
  // disable saves, and leave the corrupt record untouched.
  await page.evaluate(key => {
    localStorage.setItem(key, '{corrupt-profile-json')
  }, READER_PROFILE_STORAGE_KEY)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Appearance & Settings', level: 1 })).toBeVisible()
  await expect(page.getByTestId('appearance-storage-alert')).toBeVisible()
  await expect(page.getByTestId('appearance-preference-term')).toHaveText('Fallback preference')
  await expect(page.getByTestId('appearance-saved-preference')).toContainText('Not saved on this device')
  await expect(page.getByTestId('appearance-applied-card')).not.toContainText('Your saved preference is stored on this device')
  await expect(page.getByTestId('appearance-mode-follow-seasons')).toBeDisabled()
  await expect(page.getByTestId('appearance-mode-choose-colors')).toBeDisabled()
  const rawAfterCorrupt = await page.evaluate(key => localStorage.getItem(key), READER_PROFILE_STORAGE_KEY)
  expect(rawAfterCorrupt).toBe('{corrupt-profile-json')

  // Part 3: Seed a valid manual profile, then fail Storage.prototype.setItem during mode switch.
  const validManual = serializeReaderProfileEnvelope(
    {
      ...createDefaultReaderProfile(),
      introStatus: 'completed',
      tutorialStatus: 'skipped',
      appearance: { mode: 'chooseColors', chosenPaletteId: 'olive-linen' },
    },
    'defaults',
  )
  await page.evaluate(
    ({ key, value }) => {
      localStorage.setItem(key, value)
    },
    { key: READER_PROFILE_STORAGE_KEY, value: validManual },
  )
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Appearance & Settings', level: 1 })).toBeVisible()
  await expect(page.getByTestId('appearance-mode-choose-colors')).toBeChecked()

  // Inject write failure for the reader profile key.
  await page.evaluate(key => {
    const win = window as unknown as { __origSetItem?: Storage['setItem'] }
    win.__origSetItem = Storage.prototype.setItem
    Storage.prototype.setItem = function patchedSetItem(k: string, v: string) {
      if (k === key) throw new DOMException('Quota exceeded', 'QuotaExceededError')
      return win.__origSetItem!.call(this, k, v)
    }
  }, READER_PROFILE_STORAGE_KEY)

  await page.getByTestId('appearance-mode-follow-seasons').click()

  // Must report error truthfully and NOT claim Follow Bibleberry Seasons was saved.
  await expect(page.getByTestId('appearance-save-error')).toBeVisible()
  await expect(page.getByTestId('appearance-save-status')).toHaveCount(0)
  await expect(page.getByTestId('appearance-mode-choose-colors')).toBeChecked()

  const stillStored = await page.evaluate(
    key => JSON.parse(localStorage.getItem(key) ?? 'null'),
    READER_PROFILE_STORAGE_KEY,
  )
  expect(stillStored?.profile?.appearance).toEqual({ mode: 'chooseColors', chosenPaletteId: 'olive-linen' })

  // Restore storage writes and verify retry succeeds cleanly.
  await page.evaluate(() => {
    const win = window as unknown as { __origSetItem?: Storage['setItem'] }
    if (win.__origSetItem) Storage.prototype.setItem = win.__origSetItem
  })

  await page.getByTestId('appearance-mode-follow-seasons').click()
  await expect(page.getByTestId('appearance-save-error')).toHaveCount(0)
  await expect(page.getByTestId('appearance-mode-follow-seasons')).toBeChecked()
  await expect(page.getByTestId('appearance-save-status')).toContainText('Follow Bibleberry Seasons')
})

test('supports keyboard navigation, focus restoration, and 200% text reflow at 320px without altering Cards or participation', async ({
  page,
}) => {
  const validParticipationRaw = JSON.stringify({
    schemaVersion: 3,
    data: {
      completedChallenges: {
        [`cms:${fixtures.todayDocumentId}`]: { completedOn: fixtures.todayDate },
      },
      savedChallenges: {
        [`cms:${fixtures.todayDocumentId}`]: { savedOn: fixtures.todayDate },
      },
      inProgressChallenges: {},
      earnedAwards: {
        [fixtures.currentThematicAwardId]: {
          earnedOn: fixtures.todayDate,
          earnedCard: fixtures.currentThematicEarnedCard,
        },
      },
      savedScriptures: [],
    },
  })
  // Validate our seeded participation fixture against production parser.
  const parsedSeed = parseParticipationEnvelope(validParticipationRaw)
  expect(parsedSeed.health).toBe('ok')
  expect(Object.keys(parsedSeed.data.completedChallenges)).toEqual([`cms:${fixtures.todayDocumentId}`])
  expect(Object.keys(parsedSeed.data.earnedAwards)).toEqual([fixtures.currentThematicAwardId])

  // Seed a valid historical Shelf record using the production fixture builder and validate via parseShelfEnvelope.
  const shelfRaw = fixtures.buildGuestShelfStorageValue({
    activeFocusMonth: fixtures.monthId,
    months: [
      {
        yearMonth: fixtures.monthId,
        admissionKind: 'readerSelected',
        isProtected: true,
      },
    ],
  })
  const parsedShelfSeed = parseShelfEnvelope(shelfRaw, {
    referenceCurrentMonth: fixtures.currentMonthId,
  })
  expect(parsedShelfSeed.health).toBe('ok')
  expect(parsedShelfSeed.payload.state.activeFocusMonth).toBe(fixtures.monthId)
  expect(parsedShelfSeed.payload.state.months).toHaveLength(1)
  expect(parsedShelfSeed.payload.state.months[0]?.yearMonth).toBe(fixtures.monthId)

  const manualProfile = {
    ...createDefaultReaderProfile(),
    introStatus: 'completed' as const,
    tutorialStatus: 'skipped' as const,
    appearance: { mode: 'chooseColors' as const, chosenPaletteId: 'olive-linen' },
  }

  await seedOnce(page, {
    [READER_PROFILE_STORAGE_KEY]: serializeReaderProfileEnvelope(manualProfile, 'defaults'),
    [fixtures.participationKey]: validParticipationRaw,
    [fixtures.shelfKey]: shelfRaw,
  })

  await page.setViewportSize({ width: 320, height: 640 })
  await page.goto(url + '#/more')

  // Verify hydrated historical Shelf is nonempty BEFORE switching appearance mode.
  await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('button', { name: 'Library' }).click()
  await expect(page.getByRole('main', { name: 'Shelf' }).getByText(fixtures.monthTitle)).toBeVisible()
  await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('button', { name: 'More' }).click()

  // Open via keyboard (focus + Enter).
  const appearanceBtn = page.getByTestId('more-appearance-settings-button')
  await appearanceBtn.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Appearance & Settings', level: 1 })).toBeVisible()

  // Apply 200% text scale and verify zero horizontal overflow at 320px.
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%'
  })
  const overflow = await page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>('.r06-viewport')
    return {
      docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      viewportOverflow: viewport ? viewport.scrollWidth - viewport.clientWidth : 0,
    }
  })
  expect(overflow.docOverflow).toBeLessThanOrEqual(1)
  expect(overflow.viewportOverflow).toBeLessThanOrEqual(1)

  // Switch mode via keyboard arrow key on radio group.
  const chooseRadio = page.getByTestId('appearance-mode-choose-colors')
  await chooseRadio.focus()
  await page.keyboard.press('ArrowUp')
  await expect(page.getByTestId('appearance-mode-follow-seasons')).toBeChecked()

  // Return to More via keyboard and verify focus restoration.
  const backBtn = page.getByTestId('appearance-settings-back')
  await backBtn.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'More', level: 1 })).toBeVisible()
  await expect(page.getByTestId('more-appearance-settings-button')).toBeFocused()

  // Verify participation & Shelf storage are completely untouched and still parse cleanly.
  const afterStorage = await page.evaluate(
    ({ pKey, sKey }) => ({
      participation: localStorage.getItem(pKey),
      shelf: localStorage.getItem(sKey),
    }),
    { pKey: fixtures.participationKey, sKey: fixtures.shelfKey },
  )
  expect(afterStorage.participation).toBe(validParticipationRaw)
  expect(afterStorage.shelf).toBe(shelfRaw)
  const parsedShelfAfter = parseShelfEnvelope(afterStorage.shelf, {
    referenceCurrentMonth: fixtures.currentMonthId,
  })
  expect(parsedShelfAfter.health).toBe('ok')
  expect(parsedShelfAfter.payload.state.months).toHaveLength(1)
  expect(parsedShelfAfter.payload.state.months[0]?.yearMonth).toBe(fixtures.monthId)

  // Reload and verify nonempty hydrated Shelf and earned Card artwork survive untouched.
  await page.evaluate(() => {
    document.documentElement.style.fontSize = ''
  })
  await page.reload()
  await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('button', { name: 'Library' }).click()
  await expect(page.getByRole('main', { name: 'Shelf' }).getByText(fixtures.monthTitle)).toBeVisible()

  await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('button', { name: 'Collections' }).click()
  await page.getByRole('button', { name: /Field Notebook/i }).click()
  await expect(page.getByRole('heading', { name: '1 Distinct Challenge Completed', level: 2 })).toBeVisible()
  await page.getByRole('button', { name: 'All Earned Cards' }).click()
  const cardImg = page.locator(`img[src="${fixtures.currentThematicCardImageUrl}"]`).first()
  await expect(cardImg).toBeVisible()
  const imgFilter = await cardImg.evaluate(el => getComputedStyle(el).filter)
  expect(imgFilter).toBe('none')
})
