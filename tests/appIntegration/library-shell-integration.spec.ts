import { test, expect } from '../smoke/helpers/frameSafeTest'
import { createServer, type ViteDevServer } from 'vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PROTOTYPE_STORAGE_KEY = 'bibleberry-prototype-v1'
const PARTICIPATION_STORAGE_KEY = 'bibleberry-reader-participation-v1'

function makeOnboardedState() {
  return {
    onboarded: true,
    appearance: 'light',
    textSize: 'default',
    reminderEnabled: false,
    reminderTime: '08:00',
    explored: [],
    journey: [],
    lastOpened: null,
    resumeDismissedDate: '',
  }
}

function daysInCivilMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function buildHistoricalMonthDetailPayload(yearMonth: string, title: string) {
  const [yearStr, monthStr] = yearMonth.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const totalDays = daysInCivilMonth(year, month)

  const slots = Array.from({ length: totalDays }, (_, idx) => {
    const day = idx + 1
    const date = `${yearMonth}-${String(day).padStart(2, '0')}`
    return {
      dayOfMonth: day,
      date,
      availability: 'available' as const,
      title: `Day ${day} Meditation`,
      slug: `${yearMonth}-day-${String(day).padStart(2, '0')}`,
      challengeId: `cms:${yearMonth}-day-${String(day).padStart(2, '0')}-doc`,
      challengeType: 'teaching' as const,
    }
  })

  return {
    ok: true,
    serverContext: {
      authorizedLocalDate: '2026-11-15',
      effectiveTimeZone: 'America/New_York',
    },
    month: {
      monthId: yearMonth,
      documentId: `month-${yearMonth}`,
      year,
      month,
      daysInMonth: totalDays,
      phase: 'historical' as const,
      rosterVersion: 1,
      totalChallenges: totalDays,
      title,
      subtitle: `Walking steadily through ${yearMonth}.`,
      introduction: {
        version: `v1-${yearMonth}`,
        previewScreens: [
          {
            id: `preview-1-${yearMonth}`,
            stepLabel: 'Overview',
            title: `Entering ${title}`,
            blocks: [
              {
                _key: `blk-p1-${yearMonth}`,
                _type: 'statementBlock',
                text: `Overview for ${title}.`,
              },
            ],
          },
        ],
        welcomeScreen: {
          id: `welcome-${yearMonth}`,
          stepLabel: 'Welcome',
          title: `Welcome to ${title}`,
          ctaLabel: 'Begin the Month',
          blocks: [
            {
              _key: `blk-w-${yearMonth}`,
              _type: 'statementBlock',
              text: `Welcome to ${title}.`,
            },
          ],
        },
      },
      slots,
      discoveries: [
        {
          discoveryId: `disc-full-${yearMonth}`,
          kind: 'fullMonth' as const,
          title: 'Full-Month Completion',
          targetCount: totalDays,
        },
      ],
    },
  }
}

function buildGatewayChallengePayload(params: {
  docId: string
  slug: string
  title: string
  monthId: string
  dayOfMonth: number
  publicationDate: string
}) {
  return {
    _id: params.docId,
    _type: 'challenge',
    title: params.title,
    slug: params.slug,
    challengeType: 'teaching',
    calendarSlot: {
      monthId: params.monthId,
      documentId: `month-${params.monthId}`,
      publicationDate: params.publicationDate,
      dayOfMonth: params.dayOfMonth,
    },
    primaryScripture: {
      reference: 'Psalm 119:105',
      translation: 'WEBP',
      textStatus: 'provided',
      passage: 'Your word is a lamp to my feet, and a light for my path.',
      usageRightsConfirmed: true,
      practiceStatus: 'configured',
    },
    screens: [
      {
        _key: `${params.docId}-s1`,
        _type: 'challengeScreen',
        screenLabel: 'Part 1',
        heading: `${params.title} — Opening`,
        blocks: [
          {
            _key: `${params.docId}-b1`,
            _type: 'statementBlock',
            text: `Opening reflection for ${params.title}.`,
          },
        ],
      },
      {
        _key: `${params.docId}-s2`,
        _type: 'challengeScreen',
        screenLabel: 'Part 2',
        heading: `${params.title} — Closing`,
        blocks: [
          {
            _key: `${params.docId}-b2`,
            _type: 'statementBlock',
            text: `Closing reflection for ${params.title}.`,
          },
        ],
      },
    ],
    companionLinks: [],
    editorialEligibility: {
      adaptationReviewed: true,
      reviewedAt: '2026-10-01T12:00:00Z',
    },
  }
}

const LIBRARY_MONTHS_PAYLOAD = {
  ok: true,
  serverContext: {
    authorizedLocalDate: '2026-11-15',
    effectiveTimeZone: 'America/New_York',
  },
  items: [
    {
      yearMonth: '2026-10',
      year: 2026,
      month: 10,
      title: 'Walking in Wisdom',
      subtitle: 'Proverbs and daily discernment',
    },
    {
      yearMonth: '2026-09',
      year: 2026,
      month: 9,
      title: 'Quiet Trust',
      subtitle: 'Psalms of confidence',
    },
  ],
  page: {
    limit: 12,
    hasMore: false,
    nextCursor: null,
  },
}

async function startViteServer(define: Record<string, string>): Promise<{ server: ViteDevServer; url: string }> {
  const server = await createServer({
    configFile: resolve(repositoryRoot, 'vite.config.ts'),
    root: repositoryRoot,
    define,
    server: {
      host: '127.0.0.1',
      port: 0,
      strictPort: false,
    },
    logLevel: 'silent',
  })
  await server.listen()
  const addr = server.httpServer?.address()
  if (!addr || typeof addr === 'string') {
    throw new Error('Failed to start Vite dev server')
  }
  return { server, url: `http://127.0.0.1:${addr.port}/` }
}

let enabledServer: ViteDevServer | null = null
let disabledServer: ViteDevServer | null = null
let libraryOnlyServer: ViteDevServer | null = null
let enabledBaseUrl = ''
let disabledBaseUrl = ''
let libraryOnlyBaseUrl = ''

test.beforeAll(async () => {
  const enabled = await startViteServer({
    'import.meta.env.VITE_ENABLE_HISTORICAL_LIBRARY': JSON.stringify('true'),
    'import.meta.env.VITE_ENABLE_MONTH_SCREEN': JSON.stringify('true'),
    'import.meta.env.VITE_ENABLE_RELEASED_CHALLENGE_ROUTE': JSON.stringify('true'),
    'import.meta.env.VITE_ENABLE_RELEASE_GATEWAY_SOURCE': JSON.stringify('true'),
    'import.meta.env.VITE_ENABLE_FIELD_NOTEBOOK': JSON.stringify('true'),
    'import.meta.env.VITE_ENABLE_HUB_CARD_ANNOUNCEMENTS': JSON.stringify('true'),
  })
  enabledServer = enabled.server
  enabledBaseUrl = enabled.url

  const disabled = await startViteServer({
    'import.meta.env.VITE_ENABLE_HISTORICAL_LIBRARY': JSON.stringify('false'),
    'import.meta.env.VITE_ENABLE_MONTH_SCREEN': JSON.stringify('false'),
  })
  disabledServer = disabled.server
  disabledBaseUrl = disabled.url

  const libraryOnly = await startViteServer({
    'import.meta.env.VITE_ENABLE_HISTORICAL_LIBRARY': JSON.stringify('true'),
    'import.meta.env.VITE_ENABLE_MONTH_SCREEN': JSON.stringify('false'),
  })
  libraryOnlyServer = libraryOnly.server
  libraryOnlyBaseUrl = libraryOnly.url
})

test.afterAll(async () => {
  await enabledServer?.close()
  await disabledServer?.close()
  await libraryOnlyServer?.close()
})

test.describe('Issue #158: Historical Library App-Shell Integration', () => {
  let uncaughtErrors: Error[] = []

  test.beforeEach(async ({ page }) => {
    uncaughtErrors = []
    page.on('pageerror', err => uncaughtErrors.push(err))

    await page.route('**/api/library/months**', route =>
      route.fulfill({ status: 200, json: LIBRARY_MONTHS_PAYLOAD }),
    )
    await page.route('**/api/news**', route =>
      route.fulfill({ status: 200, json: { ok: true, articles: [] } }),
    )
    await page.route('**/api/months/2026-10/progress', async route => {
      const body = route.request().postDataJSON() as { completedChallengeIds?: string[] } | null
      const completedCount = body?.completedChallengeIds?.length ?? 0
      await route.fulfill({
        status: 200,
        json: {
          ok: true,
          yearMonth: '2026-10',
          completedCount,
          totalChallenges: 31,
          discoveries: [
            {
              discoveryId: 'disc-full-2026-10',
              kind: 'fullMonth',
              title: 'Full-Month Completion',
              completedCount,
              targetCount: 31,
              earned: false,
            },
          ],
          newlyEligibleAwards: [],
        },
      })
    })
    await page.route('**/api/months/2026-10', route =>
      route.fulfill({
        status: 200,
        json: buildHistoricalMonthDetailPayload('2026-10', 'Walking in Wisdom'),
      }),
    )
    await page.route('**/api/months/2099-01', route =>
      route.fulfill({ status: 404, json: { ok: false, error: 'Not found' } }),
    )
    await page.route('**/api/months/2099-01/preview', route =>
      route.fulfill({ status: 404, json: { ok: false, error: 'Not found' } }),
    )
    await page.route('**/api/challenges/2026-10-day-01', route =>
      route.fulfill({
        status: 200,
        json: {
          ok: true,
          serverContext: {
            authorizedLocalDate: '2026-11-15',
            effectiveTimeZone: 'America/New_York',
          },
          challenge: buildGatewayChallengePayload({
            docId: '2026-10-day-01-doc',
            slug: '2026-10-day-01',
            title: 'Day 1 Meditation',
            monthId: '2026-10',
            dayOfMonth: 1,
            publicationDate: '2026-10-01',
          }),
        },
      }),
    )
  })

  test.afterEach(() => {
    expect(uncaughtErrors).toEqual([])
  })

  test('Archive -> Library -> historical Month Screen -> Challenge -> Finish -> Month -> Library -> Archive', async ({
    page,
  }) => {
    await page.addInitScript(
      ({ prototypeKey, prototypeState }) => {
        window.localStorage.setItem(prototypeKey, JSON.stringify(prototypeState))
      },
      { prototypeKey: PROTOTYPE_STORAGE_KEY, prototypeState: makeOnboardedState() },
    )

    await page.goto(enabledBaseUrl, { waitUntil: 'domcontentloaded' })
    await page.getByRole('navigation', { name: 'Primary navigation' }).first().getByRole('button', { name: 'Archive' }).click()

    const libraryAside = page.getByRole('complementary', { name: 'Historical Library entry' })
    await expect(libraryAside).toBeVisible()
    await libraryAside.getByRole('link', { name: 'Open Historical Library' }).click()

    await expect(page).toHaveURL(/#\/library$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Historical Library' })).toBeVisible()
    await expect(page.getByText('Walking in Wisdom')).toBeVisible()
    await expect(page.getByText('Quiet Trust')).toBeVisible()

    // Open historical month 2026-10
    await page.getByRole('button', { name: /Open October 2026/i }).click()
    await expect(page).toHaveURL(/#\/month\/2026-10$/)

    // First-time historical month introduction
    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible()
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: 'Begin the Month' }).click()

    await expect(page.getByRole('heading', { level: 1, name: 'Walking in Wisdom' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Return to Library' })).toBeVisible()

    // Open eligible Day 1 Challenge
    await page.getByRole('button', { name: /Day 1 Meditation/i }).click()
    await expect(page).toHaveURL(/#\/challenge\/2026-10-day-01\?origin=month&yearMonth=2026-10$/)

    // Complete Challenge via Finish
    await page
      .getByRole('navigation', { name: 'Challenge screen navigation' })
      .getByRole('button', { name: 'Continue' })
      .click()
    await page.getByRole('button', { name: 'Finish' }).click()

    // Returns to historical Month Screen with completion updated and Return to Library preserved
    await expect(page).toHaveURL(/#\/month\/2026-10$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Walking in Wisdom' })).toBeVisible()
    await expect(page.getByText('1 of 31')).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.getByRole('button', { name: 'Return to Library' }).click()

    // Returns to Library, then back to Archive
    await expect(page).toHaveURL(/#\/library$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Historical Library' })).toBeVisible()
    await page.getByRole('button', { name: 'Return to Archive' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Explore Past Scripture Challenges' })).toBeVisible()
  })

  test('supports direct #/library, hard refresh, and browser Back/Forward history', async ({ page }) => {
    await page.addInitScript(
      ({ prototypeKey, prototypeState }) => {
        window.localStorage.setItem(prototypeKey, JSON.stringify(prototypeState))
      },
      { prototypeKey: PROTOTYPE_STORAGE_KEY, prototypeState: makeOnboardedState() },
    )

    await page.goto(`${enabledBaseUrl}#/library`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 1, name: 'Historical Library' })).toBeVisible()

    // Hard reload preserves #/library
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/#\/library$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Historical Library' })).toBeVisible()

    // Navigate to Month Screen, then test browser Back and Forward
    await page.getByRole('button', { name: /Open October 2026/i }).click()
    await expect(page).toHaveURL(/#\/month\/2026-10$/)
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: 'Begin the Month' }).click()
    await expect(page.getByRole('button', { name: 'Return to Library' })).toBeVisible()

    await page.goBack()
    await expect(page).toHaveURL(/#\/library$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Historical Library' })).toBeVisible()

    await page.goForward()
    await expect(page).toHaveURL(/#\/month\/2026-10$/)
    await expect(page.getByRole('button', { name: 'Return to Library' })).toBeVisible()
  })

  test('renders Library error retry and empty states from gateway', async ({ page }) => {
    let shouldFail = true
    await page.unroute('**/api/library/months**')
    await page.route('**/api/library/months**', async route => {
      if (shouldFail) {
        await route.fulfill({ status: 500, json: { ok: false, error: 'Gateway unavailable' } })
        return
      }
      await route.fulfill({
        status: 200,
        json: {
          ok: true,
          serverContext: { authorizedLocalDate: '2026-11-15', effectiveTimeZone: 'America/New_York' },
          items: [],
          page: { limit: 12, hasMore: false, nextCursor: null },
        },
      })
    })

    await page.addInitScript(
      ({ prototypeKey, prototypeState }) => {
        window.localStorage.setItem(prototypeKey, JSON.stringify(prototypeState))
      },
      { prototypeKey: PROTOTYPE_STORAGE_KEY, prototypeState: makeOnboardedState() },
    )

    await page.goto(`${enabledBaseUrl}#/library`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 2, name: 'Unable to Load Library' })).toBeVisible()
    shouldFail = false
    await page.getByRole('button', { name: 'Try Again' }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'No Historical Months Yet' })).toBeVisible()
  })

  test('fails closed when Historical Library or Month Screen gates are disabled and rejects invalid months', async ({
    page,
  }) => {
    await page.addInitScript(
      ({ prototypeKey, prototypeState }) => {
        window.localStorage.setItem(prototypeKey, JSON.stringify(prototypeState))
      },
      { prototypeKey: PROTOTYPE_STORAGE_KEY, prototypeState: makeOnboardedState() },
    )

    // 1. Both flags disabled: #/library fails closed to Today and Archive omits entry bar
    await page.goto(`${disabledBaseUrl}#/library`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 1, name: 'Historical Library' })).toHaveCount(0)
    await page.getByRole('navigation', { name: 'Primary navigation' }).first().getByRole('button', { name: 'Archive' }).click()
    await expect(page.getByRole('complementary', { name: 'Historical Library entry' })).toHaveCount(0)

    // 2. Library enabled, Month Screen disabled: month click & #/month/2026-10 fail closed
    await page.goto(`${libraryOnlyBaseUrl}#/library`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 1, name: 'Historical Library' })).toBeVisible()
    await page.getByRole('button', { name: /Open October 2026/i }).click()
    await expect(page).toHaveURL(/#\/library$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Walking in Wisdom' })).toHaveCount(0)

    await page.goto(`${libraryOnlyBaseUrl}#/month/2026-10`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 1, name: 'Walking in Wisdom' })).toHaveCount(0)

    // 3. Enabled build: malformed/unapproved month URLs still respect authorization
    await page.goto(`${enabledBaseUrl}#/month/2026-13`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 1, name: 'Walking in Wisdom' })).toHaveCount(0)

    await page.goto(`${enabledBaseUrl}#/month/2099-01`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 2, name: 'Month unavailable' })).toBeVisible()
  })

  test('mobile-width keyboard navigation and zero horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.addInitScript(
      ({ prototypeKey, prototypeState, participationKey }) => {
        window.localStorage.setItem(prototypeKey, JSON.stringify(prototypeState))
        window.localStorage.removeItem(participationKey)
      },
      {
        prototypeKey: PROTOTYPE_STORAGE_KEY,
        prototypeState: makeOnboardedState(),
        participationKey: PARTICIPATION_STORAGE_KEY,
      },
    )

    await page.goto(enabledBaseUrl, { waitUntil: 'domcontentloaded' })
    await page.getByRole('navigation', { name: 'Primary navigation' }).last().getByRole('button', { name: 'Archive' }).click()

    const openLibraryLink = page.getByRole('link', { name: 'Open Historical Library' })
    await openLibraryLink.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/#\/library$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Historical Library' })).toBeVisible()

    const libraryOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    )
    expect(libraryOverflow).toBe(true)

    const octCard = page.getByRole('button', { name: /Open October 2026/i })
    await octCard.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/#\/month\/2026-10$/)
  })
})
