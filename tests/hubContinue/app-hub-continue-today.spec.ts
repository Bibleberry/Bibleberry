import { test, expect } from '../smoke/helpers/frameSafeTest'
import { createServer, type ViteDevServer } from 'vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseParticipationEnvelope } from '../../src/participation/persistence.ts'

/**
 * Ordinary-shell browser integration tests for Phase 05 / R06 Hub Continue on Today (Issue #233).
 *
 * NOTE: These tests use Playwright-intercepted, schema-shaped gateway responses
 * (`/api/months/:yearMonth`, `/api/challenges`, `/api/challenges/:slug`) to exercise
 * real `App.tsx`, `AppHubContinueHost`, `HubContinueBoundary`, `defaultGuestShelfStore`,
 * `defaultGuestParticipationStore`, and `ReleasedChallengeHost`. They verify browser-side
 * wiring and fail-closed contracts — they are NOT live cloud/staging gateway acceptance tests.
 */

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PROTOTYPE_STORAGE_KEY = 'bibleberry-prototype-v1'
const PARTICIPATION_STORAGE_KEY = 'bibleberry-reader-participation-v1'
const SHELF_STORAGE_KEY = 'bibleberry-guest-shelf-v1'

interface PrototypeSeedOptions {
  readonly textSize?: 'compact' | 'default' | 'large'
  readonly lastOpened?: {
    readonly entryId: string
    readonly challengeId: string
    readonly openedAt: string
  } | null
}

function makeOnboardedState(options: PrototypeSeedOptions = {}) {
  return {
    onboarded: true,
    appearance: 'light',
    textSize: options.textSize ?? 'default',
    reminderEnabled: false,
    reminderTime: '08:00',
    explored: [],
    journey: [],
    lastOpened: options.lastOpened ?? null,
    resumeDismissedDate: '',
  }
}

function makeShelfEnvelope(params: {
  activeFocusMonth: string | null
  months: ReadonlyArray<{
    yearMonth: string
    admissionKind?: 'readerSelected' | 'autoAdmitted'
    isProtected?: boolean
  }>
}) {
  return {
    schemaVersion: 1,
    state: {
      activeFocusMonth: params.activeFocusMonth,
      months: params.months.map(entry => ({
        yearMonth: entry.yearMonth,
        admissionKind: entry.admissionKind ?? 'readerSelected',
        isProtected: entry.isProtected ?? true,
      })),
    },
  }
}

function makeParticipationEnvelope(params: {
  completedIds?: readonly string[]
  inProgress?: Readonly<Record<string, { updatedOn: string; screenId?: string }>>
  lastOpenedChallenge?: { challengeId: string; openedOn: string } | null
} = {}) {
  const completedChallenges: Record<string, { completedOn: string }> = {}
  for (const id of params.completedIds ?? []) {
    completedChallenges[id] = { completedOn: '2026-11-10' }
  }
  return {
    schemaVersion: 1,
    data: {
      completedChallenges,
      inProgressChallenges: params.inProgress ?? {},
      savedChallenges: {},
      savedScriptures: [],
      lastOpenedChallenge: params.lastOpenedChallenge ?? null,
      earnedAwards: {},
    },
  }
}

function daysInCivilMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

interface MonthFixtureOptions {
  readonly yearMonth: string
  readonly title: string
  readonly phase?: 'historical' | 'active'
  readonly authorizedLocalDate?: string
  readonly effectiveTimeZone?: string
  readonly availableDays?: readonly number[]
  readonly comingSoonDays?: readonly number[]
  readonly customTitles?: Readonly<Record<number, string>>
}

function buildMonthDetailPayload(options: MonthFixtureOptions) {
  const [yearStr, monthStr] = options.yearMonth.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const totalDays = daysInCivilMonth(year, month)
  const availableSet = new Set(options.availableDays ?? [1, 2])
  const comingSoonSet = new Set(options.comingSoonDays ?? [])

  const slots = Array.from({ length: totalDays }, (_, idx) => {
    const day = idx + 1
    const date = `${options.yearMonth}-${String(day).padStart(2, '0')}`
    const title = options.customTitles?.[day] ?? `${options.title} Day ${day}`
    if (availableSet.has(day)) {
      return {
        dayOfMonth: day,
        date,
        availability: 'available' as const,
        title,
        slug: `${options.yearMonth}-day-${String(day).padStart(2, '0')}`,
        challengeId: `cms:${options.yearMonth}-day-${String(day).padStart(2, '0')}-doc`,
        challengeType: 'teaching' as const,
      }
    }
    if (comingSoonSet.has(day)) {
      return {
        dayOfMonth: day,
        date,
        availability: 'comingSoon' as const,
        title,
      }
    }
    return {
      dayOfMonth: day,
      date,
      availability: 'unavailable' as const,
    }
  })

  return {
    ok: true,
    serverContext: {
      authorizedLocalDate: options.authorizedLocalDate ?? '2026-11-15',
      effectiveTimeZone: options.effectiveTimeZone ?? 'America/New_York',
    },
    month: {
      monthId: options.yearMonth,
      documentId: `month-${options.yearMonth}`,
      year,
      month,
      daysInMonth: totalDays,
      phase: options.phase ?? 'historical',
      rosterVersion: 1,
      totalChallenges: slots.filter(slot => slot.availability !== 'unavailable').length,
      title: options.title,
      subtitle: `Walking steadily through ${options.yearMonth}.`,
      introduction: {
        version: `v1-${options.yearMonth}`,
        previewScreens: [
          {
            id: `preview-1-${options.yearMonth}`,
            stepLabel: 'Overview',
            title: `Entering ${options.title}`,
            blocks: [
              {
                _key: `blk-p1-${options.yearMonth}`,
                _type: 'statementBlock',
                text: `Overview for ${options.title}.`,
              },
            ],
          },
        ],
        welcomeScreen: {
          id: `welcome-${options.yearMonth}`,
          stepLabel: 'Welcome',
          title: `Welcome to ${options.title}`,
          ctaLabel: 'Begin the Month',
          blocks: [
            {
              _key: `blk-w-${options.yearMonth}`,
              _type: 'statementBlock',
              text: `Welcome to ${options.title}.`,
            },
          ],
        },
      },
      slots,
      discoveries: [],
    },
  }
}

function buildCatalogEntry(params: {
  yearMonth: string
  day: number
  title: string
  docId?: string
  slug?: string
  calendarMonthId?: string
}) {
  const dayStr = String(params.day).padStart(2, '0')
  const monthId = params.calendarMonthId ?? params.yearMonth
  const slug = params.slug ?? `${params.yearMonth}-day-${dayStr}`
  const docId = params.docId ?? `${params.yearMonth}-day-${dayStr}-doc`
  return {
    _id: docId,
    slug,
    title: params.title,
    challengeType: 'teaching',
    calendarSlot: {
      monthId,
      documentId: `month-${monthId}`,
      publicationDate: `${monthId}-${dayStr}`,
      dayOfMonth: params.day,
    },
    primaryScripture: {
      reference: 'Psalm 119:105',
      translation: 'WEBP',
      textStatus: 'provided',
      passage: 'Your word is a lamp to my feet, and a light for my path.',
      usageRightsConfirmed: true,
      practiceStatus: 'configured',
    },
    editorialEligibility: {
      adaptationReviewed: true,
      reviewedAt: '2026-10-01T12:00:00Z',
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

const DEFAULT_CATALOG_ENTRIES = [
  buildCatalogEntry({ yearMonth: '2026-10', day: 1, title: 'Walking in Wisdom Day 1' }),
  buildCatalogEntry({ yearMonth: '2026-10', day: 2, title: 'Steadfast Hope in Every Season' }),
  buildCatalogEntry({ yearMonth: '2026-09', day: 1, title: 'Quiet Trust Day 1' }),
]

async function mockDefaultGatewayRoutes(
  page: import('@playwright/test').Page,
  overrides: {
    onRequest?: (pathname: string) => void
    monthPayloads?: Readonly<Record<string, ReturnType<typeof buildMonthDetailPayload>>>
    catalogEntries?: readonly ReturnType<typeof buildCatalogEntry>[]
    challengeIdOverrides?: Readonly<Record<string, string>>
  } = {},
) {
  const monthPayloads: Record<string, ReturnType<typeof buildMonthDetailPayload>> = {
    '2026-10': buildMonthDetailPayload({
      yearMonth: '2026-10',
      title: 'Walking in Wisdom',
      availableDays: [1, 2],
      comingSoonDays: [3],
      customTitles: {
        1: 'Walking in Wisdom Day 1',
        2: 'Steadfast Hope in Every Season',
        3: 'Embargoed Future Day 3',
      },
    }),
    '2026-09': buildMonthDetailPayload({
      yearMonth: '2026-09',
      title: 'Quiet Trust',
      availableDays: [1],
      customTitles: { 1: 'Quiet Trust Day 1' },
    }),
    ...overrides.monthPayloads,
  }

  const catalogEntries = overrides.catalogEntries ?? DEFAULT_CATALOG_ENTRIES

  await page.route('**/api/news**', async route => {
    await route.fulfill({
      status: 200,
      json: {
        ok: true,
        serverContext: {
          authorizedLocalDate: '2026-11-15',
          effectiveTimeZone: 'America/New_York',
        },
        articles: [],
      },
    })
  })

  await page.route('**/api/months/*/progress', async route => {
    const url = new URL(route.request().url())
    const yearMonth = url.pathname.split('/')[3] ?? '2026-10'
    const body = route.request().postDataJSON() as { completedChallengeIds?: string[] } | null
    const completedInMonthCount = Array.isArray(body?.completedChallengeIds)
      ? body.completedChallengeIds.length
      : 0
    await route.fulfill({
      status: 200,
      json: {
        ok: true,
        serverContext: {
          authorizedLocalDate: '2026-11-15',
          effectiveTimeZone: 'America/New_York',
        },
        progress: {
          monthId: yearMonth,
          rosterVersion: 1,
          completedInMonthCount,
          totalChallenges: 2,
          thematicEarnedCount: 0,
          thematicTotalCount: 0,
          discoveries: [],
        },
      },
    })
  })

  await page.route('**/api/months/*', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/progress') || url.pathname.endsWith('/preview')) {
      await route.fallback()
      return
    }
    overrides.onRequest?.(url.pathname)
    const yearMonth = url.pathname.split('/').pop() ?? ''
    const payload = monthPayloads[yearMonth]
    if (!payload) {
      await route.fulfill({ status: 404, json: { ok: false, error: 'Not found' } })
      return
    }
    await route.fulfill({ status: 200, json: payload })
  })

  await page.route('**/api/challenges/*', async route => {
    const url = new URL(route.request().url())
    overrides.onRequest?.(url.pathname)
    const slug = decodeURIComponent(url.pathname.split('/').pop() ?? '')
    const match = catalogEntries.find(item => item.slug === slug)
    if (!match) {
      await route.fulfill({ status: 404, json: { ok: false, error: 'Not found' } })
      return
    }
    const docId = overrides.challengeIdOverrides?.[slug] ?? match._id
    await route.fulfill({
      status: 200,
      json: {
        ok: true,
        serverContext: {
          authorizedLocalDate: '2026-11-15',
          effectiveTimeZone: 'America/New_York',
        },
        challenge: buildGatewayChallengePayload({
          docId,
          slug: match.slug,
          title: match.title,
          monthId: match.calendarSlot.monthId,
          dayOfMonth: match.calendarSlot.dayOfMonth,
          publicationDate: match.calendarSlot.publicationDate,
        }),
      },
    })
  })

  await page.route('**/api/challenges', async route => {
    const url = new URL(route.request().url())
    overrides.onRequest?.(url.pathname)
    await route.fulfill({
      status: 200,
      json: {
        ok: true,
        challenges: catalogEntries,
      },
    })
  })
}

let enabledServer: ViteDevServer | null = null
let challengeOnlyServer: ViteDevServer | null = null
let disabledServer: ViteDevServer | null = null
let enabledBaseUrl = ''
let challengeOnlyBaseUrl = ''
let disabledBaseUrl = ''

test.beforeAll(async () => {
  // Notice VITE_ENABLE_RELEASE_GATEWAY_SOURCE is intentionally omitted here to prove
  // Hub Continue always routes opened Challenges through the gateway and never falls back to direct Sanity reads.
  const enabled = await startViteServer({
    'import.meta.env.VITE_ENABLE_HUB_CONTINUE': JSON.stringify('true'),
    'import.meta.env.VITE_ENABLE_RELEASED_CHALLENGE_ROUTE': JSON.stringify('true'),
    'import.meta.env.VITE_ENABLE_MONTH_SCREEN': JSON.stringify('true'),
    'import.meta.env.VITE_ENABLE_HISTORICAL_LIBRARY': JSON.stringify('true'),
  })
  enabledServer = enabled.server
  enabledBaseUrl = enabled.baseUrl

  const challengeOnly = await startViteServer({
    'import.meta.env.VITE_ENABLE_HUB_CONTINUE': JSON.stringify('true'),
    'import.meta.env.VITE_ENABLE_RELEASED_CHALLENGE_ROUTE': JSON.stringify('true'),
    'import.meta.env.VITE_ENABLE_MONTH_SCREEN': JSON.stringify('false'),
  })
  challengeOnlyServer = challengeOnly.server
  challengeOnlyBaseUrl = challengeOnly.baseUrl

  const disabled = await startViteServer({
    'import.meta.env.VITE_ENABLE_HUB_CONTINUE': JSON.stringify('false'),
    'import.meta.env.VITE_ENABLE_RELEASED_CHALLENGE_ROUTE': JSON.stringify('true'),
    'import.meta.env.VITE_ENABLE_MONTH_SCREEN': JSON.stringify('true'),
  })
  disabledServer = disabled.server
  disabledBaseUrl = disabled.baseUrl
})

test.afterAll(async () => {
  await enabledServer?.close()
  await challengeOnlyServer?.close()
  await disabledServer?.close()
})

test.describe('Phase 05 / R06: Hub Continue on ordinary Today (Issue #233)', () => {
  let uncaughtErrors: Error[] = []

  test.beforeEach(async ({ page }) => {
    uncaughtErrors = []
    page.on('pageerror', err => uncaughtErrors.push(err))
  })

  test.afterEach(() => {
    expect(uncaughtErrors).toEqual([])
  })

  test('resumes in-progress focus Challenge from Today, completes via Finish without double completion, preserves Shelf focus, and offers its Month Screen', async ({
    page,
  }) => {
    const requestedPaths: string[] = []
    await mockDefaultGatewayRoutes(page, {
      onRequest: pathname => requestedPaths.push(pathname),
    })

    await page.addInitScript(
      ({ prototypeKey, shelfKey, participationKey, prototypeState, shelfEnvelope, participationEnvelope }) => {
        if (!window.localStorage.getItem(prototypeKey)) {
          window.localStorage.setItem(prototypeKey, JSON.stringify(prototypeState))
        }
        if (!window.localStorage.getItem(shelfKey)) {
          window.localStorage.setItem(shelfKey, JSON.stringify(shelfEnvelope))
        }
        if (!window.localStorage.getItem(participationKey)) {
          window.localStorage.setItem(participationKey, JSON.stringify(participationEnvelope))
        }
      },
      {
        prototypeKey: PROTOTYPE_STORAGE_KEY,
        shelfKey: SHELF_STORAGE_KEY,
        participationKey: PARTICIPATION_STORAGE_KEY,
        prototypeState: makeOnboardedState(),
        shelfEnvelope: makeShelfEnvelope({
          activeFocusMonth: '2026-10',
          months: [{ yearMonth: '2026-10' }, { yearMonth: '2026-09' }],
        }),
        participationEnvelope: makeParticipationEnvelope({
          inProgress: {
            'cms:2026-10-day-02-doc': {
              updatedOn: '2026-11-14',
              screenId: '2026-10-day-02-doc-s2',
            },
          },
        }),
      },
    )

    await page.goto(enabledBaseUrl, { waitUntil: 'domcontentloaded' })

    // Single unobtrusive Continue card appears on Today
    const continueCard = page.locator('.hub-continue')
    await expect(continueCard).toHaveCount(1)
    await expect(continueCard).toBeVisible()
    await expect(continueCard).toHaveAttribute('data-continue-kind', 'resumeInProgress')
    await expect(continueCard).toHaveAttribute('data-year-month', '2026-10')
    await expect(continueCard).toHaveAttribute('data-challenge-id', 'cms:2026-10-day-02-doc')
    await expect(continueCard).toHaveAttribute('data-preserves-formal-focus', 'true')
    await expect(continueCard.getByText('Active Focus')).toBeVisible()
    await expect(continueCard.getByRole('heading', { name: 'Steadfast Hope in Every Season' })).toBeVisible()

    // No streaks, missed-day backlog, or guilt copy
    const cardText = ((await continueCard.textContent()) ?? '').toLowerCase()
    expect(cardText).not.toContain('streak')
    expect(cardText).not.toContain('missed')
    expect(cardText).not.toContain('backlog')
    expect(cardText).not.toContain('behind')

    // Verify bounded network requests (allow up to 2 per URL for React StrictMode dev double-mount,
    // and assert zero additional requests / polling after settling)
    const countAfterLoad = requestedPaths.length
    expect(requestedPaths.filter(p => p === '/api/challenges').length).toBeGreaterThanOrEqual(1)
    expect(requestedPaths.filter(p => p === '/api/challenges').length).toBeLessThanOrEqual(2)
    expect(requestedPaths.filter(p => p === '/api/months/2026-10').length).toBeGreaterThanOrEqual(1)
    expect(requestedPaths.filter(p => p === '/api/months/2026-10').length).toBeLessThanOrEqual(2)
    expect(requestedPaths).not.toContain('/api/months/2026-09')
    await page.waitForTimeout(350)
    expect(requestedPaths.length).toBe(countAfterLoad)

    // Activate Resume -> opens canonical released Challenge with explicit Hub origin
    await continueCard.getByRole('button', { name: /Continue Your Study: Steadfast Hope in Every Season/i }).click()
    await expect(page).toHaveURL(/#\/challenge\/2026-10-day-02\?origin=hub$/)
    await expect(page.getByRole('button', { name: 'Return to Today' })).toBeVisible()
    // Resumed directly on saved Part 2 screen
    await expect(page.getByRole('heading', { name: /Steadfast Hope in Every Season — Closing/i })).toBeVisible()

    // Finish returns to Today without double completion
    const finishBtn = page.getByRole('button', { name: 'Finish' })
    await expect(finishBtn).toBeVisible()
    await finishBtn.click()

    await expect(page).not.toHaveURL(/#\/challenge\//)
    await expect(page.locator('#daily-teaching')).toBeVisible()

    // Participation recorded Day 2 completed once; Shelf formal focus unchanged
    const rawParticipation = await page.evaluate(key => window.localStorage.getItem(key), PARTICIPATION_STORAGE_KEY)
    const parsedParticipation = parseParticipationEnvelope(rawParticipation, 'cms')
    expect(parsedParticipation.health).toBe('ok')
    expect(Object.keys(parsedParticipation.data.completedChallenges)).toEqual([
      'cms:2026-10-day-02-doc',
    ])
    expect(parsedParticipation.data.inProgressChallenges['cms:2026-10-day-02-doc']).toBeUndefined()

    const rawShelf = JSON.parse(
      (await page.evaluate(key => window.localStorage.getItem(key), SHELF_STORAGE_KEY)) || '{}',
    )
    expect(rawShelf.state.activeFocusMonth).toBe('2026-10')

    await expect(continueCard).toHaveAttribute('data-continue-kind', 'openFocusMonth')
    await expect(continueCard).toHaveAttribute('data-year-month', '2026-10')
    await expect(continueCard).not.toHaveAttribute('data-challenge-id')
    await continueCard.getByRole('button', { name: 'Continue Your Study: October 2026' }).click()
    await expect(page).toHaveURL(/#\/month\/2026-10$/)
    expect(requestedPaths).not.toContain('/api/challenges/2026-10-day-01')
  })

  test('reviews the completed Active Focus even when another Shelf month has saved progress', async ({
    page,
  }) => {
    const requestedPaths: string[] = []
    await mockDefaultGatewayRoutes(page, {
      onRequest: path => requestedPaths.push(path),
      monthPayloads: {
        '2026-10': buildMonthDetailPayload({
          yearMonth: '2026-10',
          title: 'Walking in Wisdom',
          availableDays: [1, 2],
        }),
      },
    })

    await page.addInitScript(
      ({ prototypeKey, shelfKey, participationKey, prototypeState, shelfEnvelope, participationEnvelope }) => {
        if (!window.localStorage.getItem(prototypeKey)) {
          window.localStorage.setItem(prototypeKey, JSON.stringify(prototypeState))
        }
        if (!window.localStorage.getItem(shelfKey)) {
          window.localStorage.setItem(shelfKey, JSON.stringify(shelfEnvelope))
        }
        if (!window.localStorage.getItem(participationKey)) {
          window.localStorage.setItem(participationKey, JSON.stringify(participationEnvelope))
        }
      },
      {
        prototypeKey: PROTOTYPE_STORAGE_KEY,
        shelfKey: SHELF_STORAGE_KEY,
        participationKey: PARTICIPATION_STORAGE_KEY,
        prototypeState: makeOnboardedState(),
        shelfEnvelope: makeShelfEnvelope({
          activeFocusMonth: '2026-10',
          months: [{ yearMonth: '2026-10' }, { yearMonth: '2026-09' }],
        }),
        participationEnvelope: makeParticipationEnvelope({
          completedIds: ['cms:2026-10-day-01-doc', 'cms:2026-10-day-02-doc'],
          inProgress: {
            'cms:2026-09-day-01-doc': { updatedOn: '2026-11-14', screenId: '2026-09-day-01-doc-s2' },
          },
        }),
      },
    )

    await page.goto(enabledBaseUrl, { waitUntil: 'domcontentloaded' })

    const continueCard = page.locator('.hub-continue')
    await expect(continueCard).toBeVisible()
    await expect(continueCard).toHaveCount(1)
    await expect(continueCard).toHaveAttribute('data-continue-kind', 'reviewFocusMonth')
    await expect(continueCard).toHaveAttribute('data-year-month', '2026-10')
    await expect(continueCard).toHaveAttribute('data-preserves-formal-focus', 'true')
    await expect(continueCard.getByRole('heading', { name: 'Walking in Wisdom' })).toBeVisible()
    await continueCard.getByRole('button', { name: 'Review This Month: October 2026' }).click()
    await expect(page).toHaveURL(/#\/month\/2026-10$/)
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: 'Begin the Month' }).click()
    await page.getByRole('button', { name: 'Return to Today' }).click()
    await expect(continueCard).toHaveAttribute('data-continue-kind', 'reviewFocusMonth')
    expect(requestedPaths).not.toContain('/api/months/2026-09')
    expect(requestedPaths).not.toContain('/api/challenges/2026-09-day-01')

    // Formal activeFocusMonth remains 2026-10
    const rawShelf = JSON.parse(
      (await page.evaluate(key => window.localStorage.getItem(key), SHELF_STORAGE_KEY)) || '{}',
    )
    expect(rawShelf.state.activeFocusMonth).toBe('2026-10')
  })

  test('reconciles legacy ResumeCard so Today never shows competing prompts and preserves legacy behavior when gate is off or gateway fails', async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date('2026-11-05T12:00:00Z'))
    const legacySeed = makeOnboardedState({
      lastOpened: {
        entryId: 'sabbath-2026-11-03',
        challengeId: 'seven-days-sabbath-2026',
        openedAt: '2026-11-03T16:00:00.000Z',
      },
    })
    const shelfSeed = makeShelfEnvelope({
      activeFocusMonth: '2026-10',
      months: [{ yearMonth: '2026-10' }],
    })

    // 1. Enabled build with valid gateway data: canonical Hub Continue wins; legacy ResumeCard suppressed
    await mockDefaultGatewayRoutes(page)
    await page.addInitScript(
      ({ prototypeKey, shelfKey, prototypeState, shelfEnvelope }) => {
        window.localStorage.setItem(prototypeKey, JSON.stringify(prototypeState))
        window.localStorage.setItem(shelfKey, JSON.stringify(shelfEnvelope))
      },
      {
        prototypeKey: PROTOTYPE_STORAGE_KEY,
        shelfKey: SHELF_STORAGE_KEY,
        prototypeState: legacySeed,
        shelfEnvelope: shelfSeed,
      },
    )

    await page.goto(enabledBaseUrl, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.hub-continue')).toHaveCount(1)
    await expect(page.locator('.resume-card')).toHaveCount(0)

    // 2. Enabled build when gateway fails (HTTP 500): canonical fails closed; legacy ResumeCard preserved
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await page.route('**/api/challenges', route =>
      route.fulfill({ status: 500, json: { ok: false, error: 'Gateway unavailable' } }),
    )
    await page.route('**/api/months/*', route =>
      route.fulfill({ status: 500, json: { ok: false, error: 'Gateway unavailable' } }),
    )
    await page.route('**/api/news**', route =>
      route.fulfill({ status: 200, json: { ok: true, serverContext: { authorizedLocalDate: '2026-11-15', effectiveTimeZone: 'America/New_York' }, articles: [] } }),
    )
    await page.goto(enabledBaseUrl, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.resume-card')).toBeVisible()
    await expect(page.locator('.hub-continue')).toHaveCount(0)

    // 3. Disabled build (VITE_ENABLE_HUB_CONTINUE=false): zero Hub Continue requests, legacy ResumeCard unchanged
    const disabledRequests: string[] = []
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await page.route('**/api/challenges**', route => {
      disabledRequests.push(route.request().url())
      return route.fulfill({ status: 200, json: { ok: true, challenges: [] } })
    })
    await page.route('**/api/months/*', route => {
      disabledRequests.push(route.request().url())
      return route.fulfill({ status: 404, json: { ok: false } })
    })
    await page.route('**/api/news**', route =>
      route.fulfill({ status: 200, json: { ok: true, serverContext: { authorizedLocalDate: '2026-11-15', effectiveTimeZone: 'America/New_York' }, articles: [] } }),
    )
    await page.goto(disabledBaseUrl, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.resume-card')).toBeVisible()
    await expect(page.locator('.hub-continue')).toHaveCount(0)
    await page.waitForTimeout(250)
    expect(disabledRequests).toEqual([])
  })

  test('fails closed on missing focus, corrupt Shelf storage, unavailable focus, current months, and document ID mismatch', async ({
    page,
  }) => {
    // 1. Missing activeFocusMonth with incidental Library activity -> 0 requests, 0 cards
    const noFocusRequests: string[] = []
    await mockDefaultGatewayRoutes(page, {
      onRequest: p => noFocusRequests.push(p),
    })
    await page.addInitScript(
      ({ prototypeKey, shelfKey, participationKey, prototypeState, shelfEnvelope, participationEnvelope }) => {
        if (!window.localStorage.getItem(prototypeKey)) {
          window.localStorage.setItem(prototypeKey, JSON.stringify(prototypeState))
        }
        if (!window.localStorage.getItem(shelfKey)) {
          window.localStorage.setItem(shelfKey, JSON.stringify(shelfEnvelope))
        }
        if (!window.localStorage.getItem(participationKey)) {
          window.localStorage.setItem(participationKey, JSON.stringify(participationEnvelope))
        }
      },
      {
        prototypeKey: PROTOTYPE_STORAGE_KEY,
        shelfKey: SHELF_STORAGE_KEY,
        participationKey: PARTICIPATION_STORAGE_KEY,
        prototypeState: makeOnboardedState(),
        shelfEnvelope: makeShelfEnvelope({ activeFocusMonth: null, months: [{ yearMonth: '2026-10' }] }),
        participationEnvelope: makeParticipationEnvelope({
          lastOpenedChallenge: { challengeId: 'cms:2026-10-day-01-doc', openedOn: '2026-11-15' },
        }),
      },
    )
    await page.goto(enabledBaseUrl, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('#daily-teaching')).toBeVisible()
    await page.waitForTimeout(250)
    await expect(page.locator('.hub-continue')).toHaveCount(0)
    expect(noFocusRequests).toEqual([])

    // 2. Unsupported future Shelf schema -> 0 cards, 0 requests, raw storage preserved untouched
    const corruptRaw = JSON.stringify({ schemaVersion: 99, state: { months: [], activeFocusMonth: '2026-10' } })
    await page.evaluate(
      ({ shelfKey, raw }) => window.localStorage.setItem(shelfKey, raw),
      { shelfKey: SHELF_STORAGE_KEY, raw: corruptRaw },
    )
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('#daily-teaching')).toBeVisible()
    await page.waitForTimeout(250)
    await expect(page.locator('.hub-continue')).toHaveCount(0)
    expect(noFocusRequests).toEqual([])
    const preservedRaw = await page.evaluate(key => window.localStorage.getItem(key), SHELF_STORAGE_KEY)
    expect(preservedRaw).toBe(corruptRaw)

    // 3. Unavailable focus with another valid Shelf month -> fails closed
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await mockDefaultGatewayRoutes(page)
    await page.route('**/api/months/2026-10', route =>
      route.fulfill({ status: 404, json: { ok: false, error: 'Not found' } }),
    )
    await page.evaluate(
      ({ shelfKey, shelfEnvelope }) => window.localStorage.setItem(shelfKey, JSON.stringify(shelfEnvelope)),
      {
        shelfKey: SHELF_STORAGE_KEY,
        shelfEnvelope: makeShelfEnvelope({
          activeFocusMonth: '2026-10',
          months: [{ yearMonth: '2026-10' }, { yearMonth: '2026-09' }],
        }),
      },
    )
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('#daily-teaching')).toBeVisible()
    await page.waitForTimeout(250)
    await expect(page.locator('.hub-continue')).toHaveCount(0)

    // 4. Active current month (2026-11) is ineligible for historical Continue
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await mockDefaultGatewayRoutes(page, {
      monthPayloads: {
        '2026-11': buildMonthDetailPayload({
          yearMonth: '2026-11',
          title: 'November Active',
          phase: 'active',
          availableDays: [1],
        }),
      },
    })
    await page.evaluate(
      ({ shelfKey, shelfEnvelope }) => window.localStorage.setItem(shelfKey, JSON.stringify(shelfEnvelope)),
      {
        shelfKey: SHELF_STORAGE_KEY,
        shelfEnvelope: makeShelfEnvelope({
          activeFocusMonth: '2026-11',
          months: [],
        }),
      },
    )
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('#daily-teaching')).toBeVisible()
    await page.waitForTimeout(250)
    await expect(page.locator('.hub-continue')).toHaveCount(0)

    // 5. Document ID mismatch when opening recommended Challenge fails closed
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await mockDefaultGatewayRoutes(page, {
      challengeIdOverrides: {
        '2026-10-day-01': 'unexpected-recreated-doc-id',
      },
    })
    await page.evaluate(
      ({ shelfKey, shelfEnvelope }) => window.localStorage.setItem(shelfKey, JSON.stringify(shelfEnvelope)),
      {
        shelfKey: SHELF_STORAGE_KEY,
        shelfEnvelope: makeShelfEnvelope({
          activeFocusMonth: '2026-10',
          months: [{ yearMonth: '2026-10' }],
        }),
      },
    )
    await page.addInitScript(
      ({ key, envelope }) => window.localStorage.setItem(key, JSON.stringify(envelope)),
      {
        key: PARTICIPATION_STORAGE_KEY,
        envelope: makeParticipationEnvelope({
          inProgress: {
            'cms:2026-10-day-01-doc': { updatedOn: '2026-11-14', screenId: '2026-10-day-01-doc-s1' },
          },
        }),
      },
    )
    await page.reload({ waitUntil: 'domcontentloaded' })
    const continueCard = page.locator('.hub-continue')
    await expect(continueCard).toBeVisible()
    await continueCard.getByRole('button', { name: /Continue Your Study: Walking in Wisdom Day 1/i }).click()
    await expect(page.getByRole('heading', { name: 'Challenge content unavailable' })).toBeVisible()
  })

  test('supports Back/Forward, hard reload, authorized View Month callback, and omits View Month when Month Screen is disabled', async ({
    page,
  }) => {
    await mockDefaultGatewayRoutes(page)
    await page.addInitScript(
      ({ prototypeKey, shelfKey, prototypeState, shelfEnvelope }) => {
        if (!window.localStorage.getItem(prototypeKey)) {
          window.localStorage.setItem(prototypeKey, JSON.stringify(prototypeState))
        }
        if (!window.localStorage.getItem(shelfKey)) {
          window.localStorage.setItem(shelfKey, JSON.stringify(shelfEnvelope))
        }
      },
      {
        prototypeKey: PROTOTYPE_STORAGE_KEY,
        shelfKey: SHELF_STORAGE_KEY,
        prototypeState: makeOnboardedState(),
        shelfEnvelope: makeShelfEnvelope({
          activeFocusMonth: '2026-10',
          months: [{ yearMonth: '2026-10' }],
        }),
      },
    )

    await page.addInitScript(
      ({ key, envelope }) => window.localStorage.setItem(key, JSON.stringify(envelope)),
      {
        key: PARTICIPATION_STORAGE_KEY,
        envelope: makeParticipationEnvelope({
          inProgress: {
            'cms:2026-10-day-01-doc': { updatedOn: '2026-11-14', screenId: '2026-10-day-01-doc-s1' },
          },
        }),
      },
    )

    // 1. Month Screen enabled: View Month works and returns to Today
    await page.goto(enabledBaseUrl, { waitUntil: 'domcontentloaded' })
    const continueCard = page.locator('.hub-continue')
    await expect(continueCard).toBeVisible()
    await continueCard.getByRole('button', { name: 'View October 2026' }).click()
    await expect(page).toHaveURL(/#\/month\/2026-10$/)
    // Advance through first-time historical month introduction
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: 'Begin the Month' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Walking in Wisdom' })).toBeVisible()
    await page.getByRole('button', { name: 'Return to Today' }).click()
    await expect(page.locator('#daily-teaching')).toBeVisible()
    await expect(continueCard).toBeVisible()

    // 2. Open Challenge -> hard reload -> Back -> Forward -> Return to Today
    await continueCard.getByRole('button', { name: /Continue Your Study: Walking in Wisdom Day 1/i }).click()
    await expect(page).toHaveURL(/#\/challenge\/2026-10-day-01\?origin=hub$/)
    await expect(page.getByRole('heading', { name: /Walking in Wisdom Day 1 — Opening/i })).toBeVisible()

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/#\/challenge\/2026-10-day-01\?origin=hub$/)
    await expect(page.getByRole('heading', { name: /Walking in Wisdom Day 1 — Opening/i })).toBeVisible()

    await page.goBack()
    await expect(page.locator('#daily-teaching')).toBeVisible()
    await expect(continueCard).toBeVisible()

    await page.goForward()
    await expect(page).toHaveURL(/#\/challenge\/2026-10-day-01\?origin=hub$/)
    await expect(page.getByRole('heading', { name: /Walking in Wisdom Day 1 — Opening/i })).toBeVisible()

    await page.getByRole('button', { name: 'Return to Today' }).click()
    await expect(page.locator('#daily-teaching')).toBeVisible()

    // 3. Challenge-only build (Month Screen disabled): Continue works, View Month button is omitted
    await page.goto(challengeOnlyBaseUrl, { waitUntil: 'domcontentloaded' })
    await expect(continueCard).toBeVisible()
    await expect(continueCard.getByRole('button', { name: /Continue Your Study: Walking in Wisdom Day 1/i })).toBeVisible()
    await expect(continueCard.getByRole('button', { name: 'View October 2026' })).toHaveCount(0)

    // The init script seeds the saved Challenge on reload, so replace the stored record
    // and notify the mounted store as another tab would.
    await page.evaluate(({ key, envelope }) => {
      const serialized = JSON.stringify(envelope)
      window.localStorage.setItem(key, serialized)
      window.dispatchEvent(
        new StorageEvent('storage', { key, newValue: serialized, storageArea: window.localStorage }),
      )
    }, { key: PARTICIPATION_STORAGE_KEY, envelope: makeParticipationEnvelope({}) })
    await expect(continueCard).toHaveCount(0)
  })

  test('supports keyboard navigation, 320px/375px mobile reflow, touch targets, and 200% text scaling', async ({
    page,
  }) => {
    await mockDefaultGatewayRoutes(page)
    await page.addInitScript(
      ({ prototypeKey, shelfKey, prototypeState, shelfEnvelope }) => {
        window.localStorage.setItem(prototypeKey, JSON.stringify(prototypeState))
        window.localStorage.setItem(shelfKey, JSON.stringify(shelfEnvelope))
      },
      {
        prototypeKey: PROTOTYPE_STORAGE_KEY,
        shelfKey: SHELF_STORAGE_KEY,
        prototypeState: makeOnboardedState({ textSize: 'large' }),
        shelfEnvelope: makeShelfEnvelope({
          activeFocusMonth: '2026-10',
          months: [{ yearMonth: '2026-10' }],
        }),
      },
    )

    await page.addInitScript(
      ({ key, envelope }) => window.localStorage.setItem(key, JSON.stringify(envelope)),
      {
        key: PARTICIPATION_STORAGE_KEY,
        envelope: makeParticipationEnvelope({
          inProgress: {
            'cms:2026-10-day-01-doc': { updatedOn: '2026-11-14', screenId: '2026-10-day-01-doc-s1' },
          },
        }),
      },
    )

    for (const width of [320, 375]) {
      await page.setViewportSize({ width, height: 720 })
      await page.goto(enabledBaseUrl, { waitUntil: 'domcontentloaded' })

      // Simulate 200% browser text scaling
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '200%'
      })

      const continueCard = page.locator('.hub-continue')
      await expect(continueCard).toBeVisible()

      const primaryBtn = continueCard.getByRole('button', { name: /Continue Your Study: Walking in Wisdom Day 1/i })
      const viewMonthBtn = continueCard.getByRole('button', { name: 'View October 2026' })
      const primaryBox = await primaryBtn.boundingBox()
      const monthBox = await viewMonthBtn.boundingBox()
      expect(primaryBox?.height).toBeGreaterThanOrEqual(44)
      expect(primaryBox?.width).toBeGreaterThanOrEqual(44)
      expect(monthBox?.height).toBeGreaterThanOrEqual(44)
      expect(monthBox?.width).toBeGreaterThanOrEqual(44)
      // Stacked cleanly without overlap
      expect(monthBox!.y).toBeGreaterThanOrEqual(primaryBox!.y + primaryBox!.height - 1)

      // Zero horizontal overflow
      const noOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      )
      expect(noOverflow).toBe(true)
    }

    // Keyboard focus & Enter activation -> Challenge -> Finish -> Return to Today
    const primaryBtn = page.locator('.hub-continue').getByRole('button', {
      name: /Continue Your Study: Walking in Wisdom Day 1/i,
    })
    await primaryBtn.focus()
    await expect(primaryBtn).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/#\/challenge\/2026-10-day-01\?origin=hub$/)

    const nextBtn = page
      .getByRole('navigation', { name: 'Challenge screen navigation' })
      .getByRole('button', { name: 'Continue' })
    await nextBtn.focus()
    await page.keyboard.press('Enter')
    const finishBtn = page.getByRole('button', { name: 'Finish' })
    await finishBtn.focus()
    await page.keyboard.press('Enter')

    await expect(page.locator('#daily-teaching')).toBeVisible()
  })

  test('cancels stale in-flight fetches when Shelf changes before an earlier response resolves', async ({
    page,
  }) => {
    let releaseStaleOctober!: () => void
    const octoberGate = new Promise<void>(resolve => {
      releaseStaleOctober = resolve
    })
    let octoberReached = false

    await page.route('**/api/news**', route =>
      route.fulfill({
        status: 200,
        json: {
          ok: true,
          serverContext: { authorizedLocalDate: '2026-11-15', effectiveTimeZone: 'America/New_York' },
          articles: [],
        },
      }),
    )
    await page.route('**/api/challenges', route =>
      route.fulfill({
        status: 200,
        json: { ok: true, challenges: DEFAULT_CATALOG_ENTRIES },
      }),
    )
    await page.route('**/api/months/2026-10', async route => {
      octoberReached = true
      await octoberGate
      await route.fulfill({
        status: 200,
        json: buildMonthDetailPayload({
          yearMonth: '2026-10',
          title: 'Walking in Wisdom',
          availableDays: [1, 2],
          customTitles: {
            1: 'Walking in Wisdom Day 1',
            2: 'Steadfast Hope in Every Season',
          },
        }),
      })
    })
    await page.route('**/api/months/2026-09', route =>
      route.fulfill({
        status: 200,
        json: buildMonthDetailPayload({
          yearMonth: '2026-09',
          title: 'Quiet Trust',
          availableDays: [1],
          customTitles: { 1: 'Quiet Trust Day 1' },
        }),
      }),
    )

    await page.addInitScript(
      ({ prototypeKey, shelfKey, prototypeState, shelfEnvelope }) => {
        if (!window.localStorage.getItem(prototypeKey)) {
          window.localStorage.setItem(prototypeKey, JSON.stringify(prototypeState))
        }
        if (!window.localStorage.getItem(shelfKey)) {
          window.localStorage.setItem(shelfKey, JSON.stringify(shelfEnvelope))
        }
      },
      {
        prototypeKey: PROTOTYPE_STORAGE_KEY,
        shelfKey: SHELF_STORAGE_KEY,
        prototypeState: makeOnboardedState(),
        shelfEnvelope: makeShelfEnvelope({
          activeFocusMonth: '2026-10',
          months: [{ yearMonth: '2026-10' }, { yearMonth: '2026-09' }],
        }),
      },
    )

    await page.goto(enabledBaseUrl, { waitUntil: 'domcontentloaded' })
    await expect.poll(() => octoberReached).toBe(true)
    await expect(page.locator('.hub-continue')).toHaveCount(0)

    // Externally update Shelf focus to 2026-09 (simulating cross-tab storage event) while 2026-10 is still in flight
    await page.evaluate(
      ({ shelfKey, nextEnvelope }) => {
        const serialized = JSON.stringify(nextEnvelope)
        window.localStorage.setItem(shelfKey, serialized)
        window.dispatchEvent(
          new StorageEvent('storage', {
            key: shelfKey,
            newValue: serialized,
            storageArea: window.localStorage,
          }),
        )
      },
      {
        shelfKey: SHELF_STORAGE_KEY,
        nextEnvelope: makeShelfEnvelope({
          activeFocusMonth: '2026-09',
          months: [{ yearMonth: '2026-10' }, { yearMonth: '2026-09' }],
        }),
      },
    )

    // 2026-09 resolves cleanly while stale 2026-10 is released afterward and must NOT overwrite 2026-09
    const continueCard = page.locator('.hub-continue')
    await expect(continueCard).toBeVisible()
    await expect(continueCard).toHaveAttribute('data-year-month', '2026-09')
    await expect(continueCard.getByRole('heading', { name: 'Quiet Trust' })).toBeVisible()

    releaseStaleOctober()
    await page.waitForTimeout(250)
    await expect(continueCard).toHaveAttribute('data-year-month', '2026-09')
    await expect(continueCard.getByRole('heading', { name: 'Quiet Trust' })).toBeVisible()
  })

  test('fails closed on direct Hub-origin Challenge navigation without trusted history identity and never falls back to direct Sanity catalog', async ({
    page,
  }) => {
    const unexpectedChallengeOrSanityRequests: string[] = []

    await mockDefaultGatewayRoutes(page, {
      onRequest: pathname => {
        if (pathname.startsWith('/api/challenges/')) {
          unexpectedChallengeOrSanityRequests.push(pathname)
        }
      },
    })
    // Guard against any direct Sanity/published-catalog fallback when VITE_ENABLE_RELEASE_GATEWAY_SOURCE is off
    await page.route('**/*sanity.io/**', async route => {
      unexpectedChallengeOrSanityRequests.push(route.request().url())
      await route.abort()
    })

    await page.addInitScript(
      ({ prototypeKey, prototypeState }) => {
        if (!window.localStorage.getItem(prototypeKey)) {
          window.localStorage.setItem(prototypeKey, JSON.stringify(prototypeState))
        }
      },
      {
        prototypeKey: PROTOTYPE_STORAGE_KEY,
        prototypeState: makeOnboardedState(),
      },
    )

    // 1. Fresh direct entry to #/challenge/<slug>?origin=hub with empty history.state
    await page.goto(`${enabledBaseUrl}#/challenge/2026-10-day-01?origin=hub`, {
      waitUntil: 'domcontentloaded',
    })
    await expect(page.getByRole('heading', { name: 'Challenge unavailable' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Finish' })).toHaveCount(0)
    await page.waitForTimeout(250)
    expect(unexpectedChallengeOrSanityRequests).toEqual([])
    const participationAfterDirect = await page.evaluate(
      key => window.localStorage.getItem(key),
      PARTICIPATION_STORAGE_KEY,
    )
    expect(participationAfterDirect).toBeNull()

    // Safe return navigation back to Today
    await page.getByRole('button', { name: 'Return to Today' }).click()
    await expect(page).not.toHaveURL(/#\/challenge\//)
    await expect(page.locator('#daily-teaching')).toBeVisible()

    // 2. Missing/cleared and malformed hubContinueDocumentId values in history.state on reload
    for (const invalidDocId of [null, '', '   ', 'drafts.2026-10-day-01-doc', 'pilot-fake']) {
      await page.evaluate(
        docId => {
          window.history.replaceState(
            {
              originView: 'today',
              challengeOrigin: { kind: 'hub' },
              hubContinueDocumentId: docId,
            },
            '',
            '#/challenge/2026-10-day-01?origin=hub',
          )
        },
        invalidDocId,
      )
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('heading', { name: 'Challenge unavailable' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Finish' })).toHaveCount(0)
      await page.waitForTimeout(150)
      expect(unexpectedChallengeOrSanityRequests).toEqual([])
      const storedParticipation = await page.evaluate(
        key => window.localStorage.getItem(key),
        PARTICIPATION_STORAGE_KEY,
      )
      expect(storedParticipation).toBeNull()

      await page.getByRole('button', { name: 'Return to Today' }).click()
      await expect(page).not.toHaveURL(/#\/challenge\//)
      await expect(page.locator('#daily-teaching')).toBeVisible()
    }
  })
})
