import { test, expect } from '../smoke/helpers/frameSafeTest'
import { createServer, type ViteDevServer } from 'vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseParticipationEnvelope } from '../../src/participation/persistence.ts'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PROTOTYPE_STORAGE_KEY = 'bibleberry-prototype-v1'
const PARTICIPATION_STORAGE_KEY = 'bibleberry-reader-participation-v1'
const SHELF_STORAGE_KEY = 'bibleberry-guest-shelf-v1'

function makeOnboardedState(textSize: 'compact' | 'default' | 'large' = 'default') {
  return {
    onboarded: true,
    appearance: 'light',
    textSize,
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

const LIBRARY_ITEMS = [
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
    subtitle: 'Psalms of steady hope',
  },
  {
    yearMonth: '2026-08',
    year: 2026,
    month: 8,
    title: 'Rooted in Grace',
    subtitle: 'Letters of encouragement',
  },
  {
    yearMonth: '2026-07',
    year: 2026,
    month: 7,
    title: 'Steadfast Joy',
    subtitle: 'Philippians day by day',
  },
] as const

const MONTH_TITLES: Record<string, string> = Object.fromEntries(
  LIBRARY_ITEMS.map(item => [item.yearMonth, item.title]),
)

async function startViteServer(define: Record<string, string>): Promise<{
  server: ViteDevServer
  baseUrl: string
}> {
  const server = await createServer({
    root: repositoryRoot,
    configFile: resolve(repositoryRoot, 'vite.config.ts'),
    define,
    server: { port: 0, host: '127.0.0.1', strictPort: false },
    logLevel: 'silent',
  })
  await server.listen()
  const addr = server.httpServer?.address()
  if (!addr || typeof addr === 'string') {
    throw new Error('Unexpected Vite server address')
  }
  return { server, baseUrl: `http://127.0.0.1:${addr.port}/` }
}

async function mockGatewayRoutes(page: import('@playwright/test').Page) {
  await page.route('**/api/library/months**', async route => {
    await route.fulfill({
      status: 200,
      json: {
        ok: true,
        serverContext: {
          authorizedLocalDate: '2026-11-15',
          effectiveTimeZone: 'America/New_York',
        },
        items: LIBRARY_ITEMS,
        page: { limit: 12, hasMore: false, nextCursor: null },
      },
    })
  })

  await page.route('**/api/months/*/progress', async route => {
    const body = route.request().postDataJSON() as { completedChallengeIds?: string[] } | null
    const completedCount = Array.isArray(body?.completedChallengeIds)
      ? body.completedChallengeIds.length
      : 0
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

  await page.route('**/api/months/*', async route => {
    const url = new URL(route.request().url())
    const segments = url.pathname.split('/').filter(Boolean)
    const yearMonth = segments[segments.length - 1] ?? ''
    if (!MONTH_TITLES[yearMonth]) {
      await route.fulfill({
        status: 404,
        json: { ok: false, error: 'Month not found' },
      })
      return
    }
    await route.fulfill({
      status: 200,
      json: buildHistoricalMonthDetailPayload(yearMonth, MONTH_TITLES[yearMonth]),
    })
  })

  await page.route('**/api/challenges/*', async route => {
    const url = new URL(route.request().url())
    const slug = decodeURIComponent(url.pathname.split('/').pop() ?? '')
    const match = /^(\d{4}-\d{2})-day-(\d{2})$/.exec(slug)
    if (!match) {
      await route.fulfill({ status: 404, json: { error: 'Not found' } })
      return
    }
    const yearMonth = match[1]!
    const dayNum = Number(match[2]!)
    await route.fulfill({
      status: 200,
      json: {
        ok: true,
        serverContext: {
          authorizedLocalDate: '2026-11-15',
          effectiveTimeZone: 'America/New_York',
        },
        challenge: buildGatewayChallengePayload({
          docId: `${slug}-doc`,
          slug,
          title: `Day ${dayNum} Meditation`,
          monthId: yearMonth,
          dayOfMonth: dayNum,
          publicationDate: `${yearMonth}-${String(dayNum).padStart(2, '0')}`,
        }),
      },
    })
  })
}

test.describe('Issue #227 [Velvet Badger]: Ordinary Reader Library & Shelf Integration', () => {
  let enabledServer: ViteDevServer | null = null
  let enabledBaseUrl = ''
  let disabledServer: ViteDevServer | null = null
  let disabledBaseUrl = ''

  test.beforeAll(async () => {
    const enabled = await startViteServer({
      'import.meta.env.VITE_ENABLE_HISTORICAL_LIBRARY': JSON.stringify('true'),
      'import.meta.env.VITE_ENABLE_MONTH_SCREEN': JSON.stringify('true'),
      'import.meta.env.VITE_ENABLE_RELEASED_CHALLENGE_ROUTE': JSON.stringify('true'),
      'import.meta.env.VITE_ENABLE_RELEASE_GATEWAY_SOURCE': JSON.stringify('true'),
    })
    enabledServer = enabled.server
    enabledBaseUrl = enabled.baseUrl

    const disabled = await startViteServer({
      'import.meta.env.VITE_ENABLE_HISTORICAL_LIBRARY': JSON.stringify('false'),
      'import.meta.env.VITE_ENABLE_MONTH_SCREEN': JSON.stringify('false'),
    })
    disabledServer = disabled.server
    disabledBaseUrl = disabled.baseUrl
  })

  test.afterAll(async () => {
    await Promise.all([
      enabledServer?.close(),
      disabledServer?.close(),
    ])
  })

  test('ordinary reader journey: Archive -> Library -> add to Shelf -> Shelf -> Month Screen -> Challenge -> Finish -> Return to Shelf -> reload', async ({
    page,
  }) => {
    await mockGatewayRoutes(page)
    await page.addInitScript(
      ({ prototypeKey, prototypeState }) => {
        window.localStorage.setItem(prototypeKey, JSON.stringify(prototypeState))
      },
      { prototypeKey: PROTOTYPE_STORAGE_KEY, prototypeState: makeOnboardedState() },
    )

    await page.goto(enabledBaseUrl, { waitUntil: 'domcontentloaded' })
    await page
      .getByRole('navigation', { name: 'Primary navigation' })
      .first()
      .getByRole('button', { name: 'Archive' })
      .click()

    const entryAside = page.getByRole('complementary', { name: 'Historical Library entry' })
    await expect(entryAside.getByRole('link', { name: 'Open Shelf' })).toBeVisible()
    await expect(entryAside.getByRole('link', { name: 'Open Historical Library' })).toBeVisible()

    // Open Library from Archive
    await entryAside.getByRole('link', { name: 'Open Historical Library' }).click()
    await expect(page).toHaveURL(/#\/library$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Historical Library' })).toBeVisible()

    // Add October 2026 to Shelf, then switch to Shelf
    await page.getByRole('button', { name: 'Add October 2026 to Shelf' }).click()
    await page.getByRole('button', { name: /View Shelf/i }).click()
    await expect(page).toHaveURL(/#\/shelf$/)
    const shelfMain = page.getByRole('main', { name: 'Shelf' })
    await expect(shelfMain.getByRole('heading', { level: 1, name: 'Shelf', exact: true })).toBeVisible()
    await expect(shelfMain.getByText('Walking in Wisdom')).toBeVisible()

    // Open October 2026 Month Screen from Shelf
    await shelfMain.getByRole('button', { name: /Open October 2026/i }).click()
    await expect(page).toHaveURL(/#\/month\/2026-10$/)

    // First-time month intro
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: 'Begin the Month' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Walking in Wisdom' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Return to Shelf' })).toBeVisible()

    // Complete Day 1 Challenge and verify origin-aware return to Month Screen -> Shelf
    await page.getByRole('button', { name: /Day 1 Meditation/i }).click()
    await expect(page).toHaveURL(/#\/challenge\/2026-10-day-01\?origin=month&yearMonth=2026-10$/)
    await page
      .getByRole('navigation', { name: 'Challenge screen navigation' })
      .getByRole('button', { name: 'Continue' })
      .click()
    await page.getByRole('button', { name: 'Finish' }).click()

    await expect(page).toHaveURL(/#\/month\/2026-10$/)
    await expect(page.getByText('1 of 31')).toBeVisible()
    await page.getByRole('button', { name: 'Return to Shelf' }).click()
    await expect(page).toHaveURL(/#\/shelf$/)
    await expect(shelfMain.getByText('Walking in Wisdom')).toBeVisible()

    // Hard reload retains Shelf state and separate participation storage
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/#\/shelf$/)
    await expect(shelfMain.getByText('Walking in Wisdom')).toBeVisible()

    const storageSnapshot = await page.evaluate(
      ({ shelfKey, participationKey }) => ({
        shelfRaw: window.localStorage.getItem(shelfKey),
        participationRaw: window.localStorage.getItem(participationKey),
      }),
      { shelfKey: SHELF_STORAGE_KEY, participationKey: PARTICIPATION_STORAGE_KEY },
    )
    expect(storageSnapshot.shelfRaw).toContain('2026-10')
    expect(storageSnapshot.participationRaw).toContain('cms:2026-10-day-01-doc')
  })

  test('persists focused replacement and Put Away atomically without erasing participation', async ({
    page,
  }) => {
    await mockGatewayRoutes(page)
    const seededShelf = {
      schemaVersion: 1,
      state: {
        months: [
          { yearMonth: '2026-10', admissionKind: 'readerSelected', isProtected: true, admittedOn: '2026-11-01' },
          { yearMonth: '2026-09', admissionKind: 'autoAdmitted', isProtected: false, admittedOn: '2026-10-01' },
          { yearMonth: '2026-08', admissionKind: 'readerSelected', isProtected: true, admittedOn: '2026-09-01' },
        ],
        activeFocusMonth: '2026-09',
        updatedOn: '2026-11-01',
      },
      rolloverWatermark: null,
    }
    const seededParticipation = {
      schemaVersion: 2,
      data: {
        completedChallenges: {
          'cms:2026-09-day-01-doc': { completedOn: '2026-09-10' },
        },
        inProgressChallenges: {
          'cms:2026-09-day-02-doc': { screenId: 'reflection', updatedOn: '2026-09-11' },
        },
        savedChallenges: {},
        savedScriptures: [{ reference: 'John 3:16', translation: 'ESV', savedOn: '2026-09-12' }],
        lastOpenedChallenge: null,
        earnedAwards: {
          'card:monthly:2026-09:full-month': {
            awardId: 'card:monthly:2026-09:full-month',
            kind: 'fullMonth',
            publicationYearMonth: '2026-09',
            discoveryId: 'discovery:2026-09:full-month',
            earnedOn: '2026-09-30',
            hubAnnouncementAcked: true,
            cardViewed: true,
          },
        },
      },
    }
    const seededCheck = parseParticipationEnvelope(JSON.stringify(seededParticipation), 'cms')
    expect(seededCheck.health).toBe('ok')
    expect(seededCheck.data.completedChallenges['cms:2026-09-day-01-doc']?.completedOn).toBe(
      '2026-09-10',
    )
    expect(seededCheck.data.earnedAwards['card:monthly:2026-09:full-month']?.earnedOn).toBe(
      '2026-09-30',
    )
    expect(seededCheck.data.inProgressChallenges['cms:2026-09-day-02-doc']?.screenId).toBe('reflection')
    expect(seededCheck.data.savedScriptures).toHaveLength(1)

    await page.addInitScript(
      ({ prototypeKey, prototypeState, shelfKey, shelfPayload, participationKey, participationPayload }) => {
        if (!window.localStorage.getItem(prototypeKey)) {
          window.localStorage.setItem(prototypeKey, JSON.stringify(prototypeState))
        }
        if (!window.localStorage.getItem(shelfKey)) {
          window.localStorage.setItem(shelfKey, JSON.stringify(shelfPayload))
        }
        if (!window.localStorage.getItem(participationKey)) {
          window.localStorage.setItem(participationKey, JSON.stringify(participationPayload))
        }
      },
      {
        prototypeKey: PROTOTYPE_STORAGE_KEY,
        prototypeState: makeOnboardedState(),
        shelfKey: SHELF_STORAGE_KEY,
        shelfPayload: seededShelf,
        participationKey: PARTICIPATION_STORAGE_KEY,
        participationPayload: seededParticipation,
      },
    )

    await page.goto(`${enabledBaseUrl}#/library`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 1, name: 'Historical Library' })).toBeVisible()

    const addJuly = page.getByRole('button', { name: 'Add July 2026 to Shelf' })
    await addJuly.click()
    const replaceDialog = page.getByRole('dialog')
    await expect(replaceDialog).toBeVisible()
    const slots = replaceDialog.getByRole('group', { name: 'Current Shelf months' })
    const focusChoices = replaceDialog.getByRole('group', { name: 'Choose your Active Focus' })
    const confirmReplace = replaceDialog.getByRole('button', { name: 'Replace Selected Month' })
    await slots.getByRole('radio', { name: /September 2026.*Active Focus/ }).check()
    await expect(confirmReplace).toBeDisabled()
    await focusChoices.getByRole('radio', { name: /October 2026/ }).check()

    // A storage update while the confirmation is open invalidates the pending choice.
    const newerShelf = { ...seededShelf, state: { ...seededShelf.state, updatedOn: '2026-11-02' } }
    await page.evaluate(({ key, payload }) => {
      const newValue = JSON.stringify(payload)
      window.localStorage.setItem(key, newValue)
      window.dispatchEvent(new StorageEvent('storage', { key, newValue, storageArea: window.localStorage }))
    }, { key: SHELF_STORAGE_KEY, payload: newerShelf })
    await confirmReplace.click()
    await expect(replaceDialog).toBeHidden()
    await expect(addJuly).toBeFocused()
    await expect(page.getByRole('alert').getByText('Your Shelf changed. Review it and try again.')).toBeVisible()
    expect(await page.evaluate(key => window.localStorage.getItem(key), SHELF_STORAGE_KEY)).toBe(JSON.stringify(newerShelf))

    await addJuly.click()
    await slots.getByRole('radio', { name: /September 2026.*Active Focus/ }).check()
    await focusChoices.getByRole('radio', { name: /October 2026/ }).check()
    await confirmReplace.click()

    await page.getByRole('button', { name: /View Shelf/i }).click()
    await expect(page).toHaveURL(/#\/shelf$/)
    const shelfMain = page.getByRole('main', { name: 'Shelf' })
    await expect(shelfMain.getByText('Steadfast Joy')).toBeVisible()
    await expect(shelfMain.getByText('Quiet Trust')).toHaveCount(0)
    await expect(shelfMain.locator('[data-year-month="2026-10"]').getByText('Active Study Focus')).toBeVisible()

    // Verify 2026-09 participation and earned awards remain contract-valid and intact
    const participationAfterReplace = await page.evaluate(
      key => window.localStorage.getItem(key),
      PARTICIPATION_STORAGE_KEY,
    )
    const parsedAfterReplace = parseParticipationEnvelope(participationAfterReplace, 'cms')
    expect(parsedAfterReplace).toEqual(seededCheck)

    await shelfMain.getByRole('button', { name: /Put Away October 2026/i }).click()
    const putAway = page.getByRole('dialog', { name: 'Put Away Active Focus' })
    await putAway.getByRole('radio', { name: 'No focus for now' }).check()
    await putAway.getByRole('button', { name: 'Confirm Put Away' }).click()
    await expect(shelfMain.getByText('Walking in Wisdom')).toHaveCount(0)
    await expect(shelfMain.getByText('Steadfast Joy')).toBeVisible()

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(shelfMain.locator('.shelf-card')).toHaveCount(2)
    await expect(shelfMain.getByText('Active Study Focus', { exact: true })).toHaveCount(0)
    const persistedShelf = await page.evaluate(key => JSON.parse(window.localStorage.getItem(key)!).state, SHELF_STORAGE_KEY)
    expect(persistedShelf.activeFocusMonth).toBeNull()
    expect(persistedShelf.months).toEqual([
      { yearMonth: '2026-07', admissionKind: 'readerSelected', isProtected: true },
      seededShelf.state.months[2],
    ])

    const participationAfterPutAway = await page.evaluate(
      key => window.localStorage.getItem(key),
      PARTICIPATION_STORAGE_KEY,
    )
    const parsedAfterPutAway = parseParticipationEnvelope(participationAfterPutAway, 'cms')
    expect(parsedAfterPutAway).toEqual(seededCheck)
  })

  test('fails closed on unsupported Shelf schema without overwriting storage, and respects feature gate', async ({
    page,
  }) => {
    await mockGatewayRoutes(page)
    const futureSchemaPayload = {
      schemaVersion: 99,
      state: { months: [] },
      preservedMarker: 'do-not-overwrite',
    }

    await page.addInitScript(
      ({ prototypeKey, prototypeState, shelfKey, shelfPayload }) => {
        if (!window.localStorage.getItem(prototypeKey)) {
          window.localStorage.setItem(prototypeKey, JSON.stringify(prototypeState))
        }
        if (!window.localStorage.getItem(shelfKey)) {
          window.localStorage.setItem(shelfKey, JSON.stringify(shelfPayload))
        }
      },
      {
        prototypeKey: PROTOTYPE_STORAGE_KEY,
        prototypeState: makeOnboardedState(),
        shelfKey: SHELF_STORAGE_KEY,
        shelfPayload: futureSchemaPayload,
      },
    )

    await page.goto(`${enabledBaseUrl}#/shelf`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 2, name: 'Shelf Unavailable' })).toBeVisible()

    // Browsing Library from unavailable Shelf withholds all Shelf mutation controls & false success notices
    await page.getByRole('button', { name: 'Browse Historical Library' }).click()
    await expect(page).toHaveURL(/#\/library$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Historical Library' })).toBeVisible()
    await expect(page.getByText('Walking in Wisdom')).toBeVisible()
    await expect(
      page.getByText(/Shelf actions are paused to protect existing device storage/i),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: /Add .* to Shelf/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Keep .* on Shelf/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /View Shelf/i })).toHaveCount(0)
    await expect(page.getByText(/Added .* to your Shelf/i)).toHaveCount(0)

    const rawAfter = await page.evaluate(key => window.localStorage.getItem(key), SHELF_STORAGE_KEY)
    expect(rawAfter).toBe(JSON.stringify(futureSchemaPayload))

    // Direct #/library entry with malformed Shelf JSON also withholds Shelf mutations and leaves storage untouched
    const corruptRaw = '{malformed-shelf-json'
    await page.evaluate(
      ({ shelfKey, raw }) => {
        window.localStorage.setItem(shelfKey, raw)
      },
      { shelfKey: SHELF_STORAGE_KEY, raw: corruptRaw },
    )
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 1, name: 'Historical Library' })).toBeVisible()
    await expect(page.getByText('Walking in Wisdom')).toBeVisible()
    await expect(page.getByRole('button', { name: /Add .* to Shelf/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /View Shelf/i })).toHaveCount(0)
    const rawCorruptAfter = await page.evaluate(
      key => window.localStorage.getItem(key),
      SHELF_STORAGE_KEY,
    )
    expect(rawCorruptAfter).toBe(corruptRaw)

    // Feature-disabled bundle fails closed on #/shelf and #/library
    await page.goto(`${disabledBaseUrl}#/shelf`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 1, name: 'Shelf', exact: true })).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 2, name: 'Shelf Unavailable' })).toHaveCount(0)
    await page
      .getByRole('navigation', { name: 'Primary navigation' })
      .first()
      .getByRole('button', { name: 'Archive' })
      .click()
    await expect(page.getByRole('complementary', { name: 'Historical Library entry' })).toHaveCount(0)
  })

  test('supports 320px/375px viewports, large text, >=44px touch targets, keyboard navigation, and Back/Forward', async ({
    page,
  }) => {
    await mockGatewayRoutes(page)
    await page.addInitScript(
      ({ prototypeKey, prototypeState }) => {
        window.localStorage.setItem(prototypeKey, JSON.stringify(prototypeState))
      },
      { prototypeKey: PROTOTYPE_STORAGE_KEY, prototypeState: makeOnboardedState('large') },
    )

    for (const width of [320, 375]) {
      await page.setViewportSize({ width, height: 667 })
      await page.goto(enabledBaseUrl, { waitUntil: 'domcontentloaded' })
      await page
        .getByRole('navigation', { name: 'Primary navigation' })
        .first()
        .getByRole('button', { name: 'Archive' })
        .click()

      const openShelfLink = page.getByRole('link', { name: 'Open Shelf' })
      const openLibraryLink = page.getByRole('link', { name: 'Open Historical Library' })
      await expect(openShelfLink).toBeVisible()
      await expect(openLibraryLink).toBeVisible()

      const shelfBox = await openShelfLink.boundingBox()
      const libraryBox = await openLibraryLink.boundingBox()
      expect(shelfBox && shelfBox.height >= 44).toBe(true)
      expect(libraryBox && libraryBox.height >= 44).toBe(true)

      const archiveOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(archiveOverflow).toBe(false)
    }

    // Keyboard navigation from Archive -> Shelf -> Library -> Back/Forward
    await page.getByRole('link', { name: 'Open Shelf' }).focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/#\/shelf$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Shelf', exact: true })).toBeVisible()

    const shelfOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(shelfOverflow).toBe(false)

    await page.getByRole('button', { name: /Browse Library/i }).click()
    await expect(page).toHaveURL(/#\/library$/)
    await page.goBack()
    await expect(page).toHaveURL(/#\/shelf$/)
    await page.goForward()
    await expect(page).toHaveURL(/#\/library$/)
  })
})
