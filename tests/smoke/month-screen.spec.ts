import { test, expect } from './helpers/frameSafeTest'

const PROTOTYPE_STORAGE_KEY = 'bibleberry-prototype-v1'
const PARTICIPATION_STORAGE_KEY = 'bibleberry-reader-participation-v1'
const MONTH_INTRO_STORAGE_KEY = 'bibleberry-month-intro-v1'
const TINY_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aW0cAAAAASUVORK5CYII=',
  'base64',
)

type SlotOverride =
  | { availability: 'available'; title: string; slug: string; challengeId: string; challengeType?: 'teaching' | 'discipline' | 'reflection' | 'memorization' }
  | { availability: 'comingSoon'; title: string }
  | { availability: 'unavailable'; formerChallengeId?: string }

function daysInCivilMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function buildMonthDetailPayload(
  yearMonth: string,
  options?: {
    phase?: 'active' | 'historical'
    title?: string
    subtitle?: string
    previewVersion?: string
    welcomeTitle?: string
    slotOverrides?: Record<number, SlotOverride>
    discoveries?: { discoveryId: string; kind: 'thematic' | 'fullMonth'; title: string; targetCount: number }[]
  },
) {
  const [yearStr, monthStr] = yearMonth.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const totalDays = daysInCivilMonth(year, month)
  const overrides = options?.slotOverrides ?? {}

  const slots = Array.from({ length: totalDays }, (_, idx) => {
    const day = idx + 1
    const date = `${yearMonth}-${String(day).padStart(2, '0')}`
    const override = overrides[day]
    if (override) {
      if (override.availability === 'unavailable') {
        return {
          dayOfMonth: day,
          date,
          availability: 'unavailable' as const,
          ...(override.formerChallengeId ? { formerChallengeId: override.formerChallengeId } : {}),
        }
      }
      if (override.availability === 'comingSoon') {
        return {
          dayOfMonth: day,
          date,
          availability: 'comingSoon' as const,
          title: override.title,
        }
      }
      return {
        dayOfMonth: day,
        date,
        availability: 'available' as const,
        title: override.title,
        slug: override.slug,
        challengeId: override.challengeId,
        challengeType: override.challengeType ?? 'teaching',
      }
    }

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

  const totalChallenges = slots.filter(slot => slot.availability !== 'unavailable').length
  const versionSuffix = options?.previewVersion ?? `v1-${yearMonth}`

  return {
    ok: true,
    serverContext: {
      authorizedLocalDate: `${yearMonth}-02`,
      effectiveTimeZone: 'America/New_York',
    },
    month: {
      monthId: yearMonth,
      documentId: `month-${yearMonth}`,
      year,
      month,
      daysInMonth: totalDays,
      phase: options?.phase ?? 'active',
      rosterVersion: 1,
      totalChallenges,
      title: options?.title ?? `Theme for ${yearMonth}`,
      subtitle: options?.subtitle ?? `Walking steadily through ${yearMonth}.`,
      introduction: {
        version: versionSuffix,
        previewScreens: [
          {
            id: `preview-1-${yearMonth}`,
            stepLabel: 'Overview',
            title: `Entering ${yearMonth}`,
            blocks: [
              {
                _key: `blk-p1-${yearMonth}`,
                _type: 'statementBlock',
                text: `Preview screen 1 for ${yearMonth}.`,
              },
            ],
          },
          {
            id: `preview-2-${yearMonth}`,
            stepLabel: 'Rhythm',
            title: `Rhythm of ${yearMonth}`,
            blocks: [
              {
                _key: `blk-p2-${yearMonth}`,
                _type: 'statementBlock',
                text: `Preview screen 2 for ${yearMonth}.`,
              },
            ],
          },
        ],
        welcomeScreen: {
          id: `welcome-${yearMonth}`,
          stepLabel: 'Welcome',
          title: options?.welcomeTitle ?? `Welcome to ${yearMonth}`,
          ctaLabel: 'Begin the Month',
          blocks: [
            {
              _key: `blk-w-${yearMonth}`,
              _type: 'statementBlock',
              text: `The month has begun for ${yearMonth}.`,
            },
          ],
        },
      },
      slots,
      discoveries: options?.discoveries ?? [
        {
          discoveryId: `disc-full-${yearMonth}`,
          kind: 'fullMonth',
          title: 'Full-Month Completion',
          targetCount: totalChallenges,
        },
        {
          discoveryId: `disc-theme-a-${yearMonth}`,
          kind: 'thematic',
          title: 'Walking in Light Discovery',
          targetCount: 2,
        },
      ],
    },
  }
}

function buildMonthPreviewPayload(yearMonth: string, previewVersion = `v1-${yearMonth}`) {
  const [yearStr, monthStr] = yearMonth.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const totalDays = daysInCivilMonth(year, month)

  const slots = Array.from({ length: totalDays }, (_, idx) => {
    const day = idx + 1
    const date = `${yearMonth}-${String(day).padStart(2, '0')}`
    if (day === 31) {
      return {
        dayOfMonth: day,
        date,
        availability: 'unavailable' as const,
      }
    }
    return {
      dayOfMonth: day,
      date,
      title: `Day ${day} Preview Title`,
      availability: 'comingSoon' as const,
    }
  })

  return {
    ok: true,
    serverContext: {
      authorizedLocalDate: '2098-02-27',
      effectiveTimeZone: 'America/New_York',
    },
    month: {
      monthId: yearMonth,
      documentId: `month-${yearMonth}`,
      year,
      month,
      daysInMonth: totalDays,
      phase: 'advancePreview' as const,
      monthStartsOn: `${yearMonth}-01`,
      title: `Theme for ${yearMonth}`,
      subtitle: `Opening soon for ${yearMonth}.`,
      introduction: {
        version: previewVersion,
        previewScreens: [
          {
            id: `preview-1-${yearMonth}`,
            stepLabel: 'Overview',
            title: `Entering ${yearMonth}`,
            blocks: [
              {
                _key: `blk-p1-${yearMonth}`,
                _type: 'statementBlock',
                text: `Preview screen 1 for ${yearMonth}.`,
              },
            ],
          },
          {
            id: `preview-2-${yearMonth}`,
            stepLabel: 'Rhythm',
            title: `Rhythm of ${yearMonth}`,
            blocks: [
              {
                _key: `blk-p2-${yearMonth}`,
                _type: 'statementBlock',
                text: `Preview screen 2 for ${yearMonth}.`,
              },
            ],
          },
        ],
      },
      slots,
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
        heading: `${params.title} — Middle`,
        blocks: [
          {
            _key: `${params.docId}-b2`,
            _type: 'statementBlock',
            text: `Middle reflection for ${params.title}.`,
          },
        ],
      },
      {
        _key: `${params.docId}-s3`,
        _type: 'challengeScreen',
        screenLabel: 'Part 3',
        heading: `${params.title} — Closing`,
        blocks: [
          {
            _key: `${params.docId}-b3`,
            _type: 'statementBlock',
            text: `Closing reflection for ${params.title}.`,
          },
        ],
      },
    ],
    companionLinks: [],
    editorialEligibility: {
      adaptationReviewed: true,
      reviewedAt: '2098-01-01T12:00:00Z',
    },
  }
}

async function completeIntroIfPresent(page: import('@playwright/test').Page) {
  await expect(page.locator('.month-intro, .month-header h1').first()).toBeVisible()
  while (await page.locator('.month-intro').isVisible()) {
    await page
      .getByRole('navigation', { name: 'Monthly introduction navigation' })
      .locator('button.button--primary')
      .click()
  }
  await expect(page.locator('.month-header h1')).toBeVisible()
}

async function seedOnboardedState(page: import('@playwright/test').Page) {
  await page.addInitScript(storageKey => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        onboarded: true,
        appearance: 'light',
        textSize: 'default',
        reminderEnabled: false,
        reminderTime: '08:00',
        explored: [],
        journey: [],
        lastOpened: null,
        resumeDismissedDate: '',
      }),
    )
  }, PROTOTYPE_STORAGE_KEY)
}

test.describe('R08A-6 Calendar Month Screen Integration', () => {
  let uncaughtErrors: Error[] = []
  let sanityRequestCount = 0

  test.beforeEach(async ({ page }) => {
    uncaughtErrors = []
    sanityRequestCount = 0
    page.on('pageerror', err => uncaughtErrors.push(err))
    await page.route('https://*.api.sanity.io/**', route => {
      sanityRequestCount++
      return route.abort('failed')
    })
  })

  test.afterEach(async () => {
    expect(uncaughtErrors).toEqual([])
    expect(sanityRequestCount).toBe(0)
  })

  test('Direct hash routing across onboarding + 28/29/30/31-day Mon-Sun week grids + withdrawn Unavailable slot', async ({ page }) => {
    const now = new Date()
    const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    const months: Record<string, ReturnType<typeof buildMonthDetailPayload>> = {
      '2098-02': buildMonthDetailPayload('2098-02', { phase: 'historical', title: 'February 2098 (28d)' }),
      '2096-02': buildMonthDetailPayload('2096-02', {
        phase: 'historical',
        title: 'February 2096 Leap (29d)',
        slotOverrides: { 29: { availability: 'unavailable' } },
      }),
      '2098-04': buildMonthDetailPayload('2098-04', { phase: 'active', title: 'April 2098 (30d)' }),
      '2098-03': buildMonthDetailPayload('2098-03', {
        phase: 'active',
        title: 'March 2098 (31d)',
        slotOverrides: {
          15: { availability: 'unavailable' },
          31: { availability: 'unavailable' },
        },
      }),
      [currentYM]: buildMonthDetailPayload(currentYM, { phase: 'active', title: `Current ${currentYM}` }),
    }

    await page.route('**/api/months/*/progress', async route => {
      const url = new URL(route.request().url())
      const ym = url.pathname.split('/')[3]
      const m = months[ym]
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          serverContext: m.serverContext,
          monthId: ym,
          rosterVersion: 1,
          completedInMonthCount: 0,
          totalChallenges: m.month.totalChallenges,
          thematicEarnedCount: 0,
          thematicTotalCount: 1,
          discoveries: m.month.discoveries.map(d => ({
            ...d,
            achievedCount: 0,
            isEarned: false,
          })),
        }),
      })
    })

    await page.route('**/api/months/*', async route => {
      const url = new URL(route.request().url())
      const ym = url.pathname.split('/')[3]
      const payload = months[ym]
      if (!payload) return route.fulfill({ status: 404, json: { ok: false } })
      return route.fulfill({ status: 200, json: payload })
    })

    // 1. Cold un-onboarded direct load to #/month/2098-03 preserves destination through onboarding
    await page.goto('/#/month/2098-03')
    await page.locator('.onboarding button:has-text("Continue")').click()
    await page.locator('.onboarding button:has-text("Continue to Today")').click()

    await expect(page).toHaveURL(/#\/month\/2098-03$/)
    // First-visit historical/active intro shows previewScreens -> welcomeScreen
    await expect(page.getByRole('heading', { level: 1, name: 'Entering 2098-03' })).toBeVisible()
    await page.getByRole('button', { name: /Continue/i }).click()
    await page.getByRole('button', { name: /Continue/i }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome to 2098-03' })).toBeVisible()
    await page.getByRole('button', { name: /Begin the Month/i }).click()

    await expect(page.getByRole('heading', { level: 1, name: 'March 2098 (31d)' })).toBeVisible()
    await expect(page.getByText('Provisional calendar layout — pending final design review.')).toBeVisible()
    await expect(page.locator('.month-ticker')).toContainText('0 of 29')
    // Non-interactive unavailable slot count = 2
    await expect(page.locator('.month-day--unavailable')).toHaveCount(2)
    await expect(page.locator('button.month-day--unavailable')).toHaveCount(0)

    // Reload preserves #/month/2098-03 and skips already-completed intro
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'March 2098 (31d)' })).toBeVisible()

    // Check 28d (2098-02), 29d leap (2096-02), 30d (2098-04) via month navigation
    await page.getByRole('button', { name: /2098-02/ }).click()
    await completeIntroIfPresent(page)
    await expect(page.getByRole('heading', { level: 1, name: 'February 2098 (28d)' })).toBeVisible()
    const feb2098Weeks = await page.locator('.month-week').count()
    expect(feb2098Weeks).toBe(5)
    await expect(page.locator('.month-day')).toHaveCount(28)

    // Switch via input[type="month"] to leap year 2096-02
    await page.locator('#month-jump-input').fill('2096-02')
    await page.getByRole('button', { name: 'Go', exact: true }).click()
    await completeIntroIfPresent(page)
    await expect(page.getByRole('heading', { level: 1, name: 'February 2096 Leap (29d)' })).toBeVisible()
    await expect(page.locator('.month-day')).toHaveCount(29)
    await expect(page.locator('.month-day--unavailable')).toHaveCount(1)

    // Switch to 30-day April 2098
    await page.locator('#month-jump-input').fill('2098-04')
    await page.getByRole('button', { name: 'Go', exact: true }).click()
    await completeIntroIfPresent(page)
    await expect(page.getByRole('heading', { level: 1, name: 'April 2098 (30d)' })).toBeVisible()
    await expect(page.locator('.month-day')).toHaveCount(30)

    // Direct #/month opens current civil calendar month
    await page.goto('/#/month')
    await completeIntroIfPresent(page)
    await expect(page.getByRole('heading', { level: 1, name: `Current ${currentYM}` })).toBeVisible()
  })

  test('Pre-preview 404 -> Advance preview lifecycle -> Month rollover with Skip to Welcome -> Replay', async ({ page }) => {
    await seedOnboardedState(page)

    let phaseMode: 'prePreview' | 'advancePreview' | 'active' = 'prePreview'
    const sharedPreviewVersion = 'shared-preview-hash-2098-03'

    await page.route('**/api/months/2098-03/preview', async route => {
      if (phaseMode === 'prePreview') {
        return route.fulfill({ status: 404, json: { ok: false, error: 'Not available' } })
      }
      return route.fulfill({
        status: 200,
        json: buildMonthPreviewPayload('2098-03', sharedPreviewVersion),
      })
    })

    await page.route('**/api/months/2098-03/progress', async route => {
      return route.fulfill({
        status: 200,
        json: {
          ok: true,
          serverContext: { authorizedLocalDate: '2098-03-01', effectiveTimeZone: 'America/New_York' },
          monthId: '2098-03',
          rosterVersion: 1,
          completedInMonthCount: 0,
          totalChallenges: 29,
          thematicEarnedCount: 0,
          thematicTotalCount: 1,
          discoveries: [
            { discoveryId: 'd1', kind: 'thematic', title: 'Thematic', achievedCount: 0, targetCount: 5, isEarned: false },
            { discoveryId: 'd2', kind: 'fullMonth', title: 'Full Month', achievedCount: 0, targetCount: 29, isEarned: false },
          ],
        },
      })
    })

    await page.route('**/api/months/2098-03', async route => {
      if (phaseMode !== 'active') {
        return route.fulfill({ status: 404, json: { ok: false, error: 'Not active yet' } })
      }
      return route.fulfill({
        status: 200,
        json: buildMonthDetailPayload('2098-03', {
          phase: 'active',
          previewVersion: 'detail-version-different-from-preview',
        }),
      })
    })

    // 1. Pre-preview 404 before Feb 27
    await page.goto('/#/month/2098-03')
    await expect(page.getByRole('heading', { level: 2, name: 'Month unavailable' })).toBeVisible()

    // 2. Feb 27 Advance Preview open: auto-shows previewScreens (no Welcome, no Skip to Welcome, no Discoveries)
    phaseMode = 'advancePreview'
    await page.getByRole('button', { name: 'Try Again' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Entering 2098-03' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Skip to Welcome/i })).toHaveCount(0)

    await page.getByRole('button', { name: /Continue/i }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Rhythm of 2098-03' })).toBeVisible()
    // Advance preview stops after previewScreens with View Preview Calendar button
    await page.getByRole('button', { name: 'View Preview Calendar' }).click()

    await expect(page.getByText('Advance Preview')).toBeVisible()
    await expect(page.locator('.month-discoveries')).toHaveCount(0)
    await expect(page.locator('button.month-day')).toHaveCount(0)
    await expect(page.locator('.month-day--comingSoon').first()).toContainText('Coming Soon')

    // Intro record saved UI-only without polluting ReaderParticipationStore
    const stored = await page.evaluate(
      ([introKey, partKey]) => ({
        intro: window.localStorage.getItem(introKey),
        part: window.localStorage.getItem(partKey),
      }),
      [MONTH_INTRO_STORAGE_KEY, PARTICIPATION_STORAGE_KEY],
    )
    expect(stored.intro).toContain('"previewSeen":true')
    expect(stored.intro).toContain('"welcomeSeen":false')
    expect(stored.part).toBeNull()

    // Reload preview -> goes straight to preview calendar; replay works
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Theme for 2098-03' })).toBeVisible()
    await page.getByRole('button', { name: 'Read Monthly Preview' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Entering 2098-03' })).toBeVisible()
    await page.getByRole('button', { name: /Close introduction/i }).click()

    // 3. Rollover to active March 1: Skip to Welcome offered because previewSeen is true!
    phaseMode = 'active'
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Entering 2098-03' })).toBeVisible()
    const skipButton = page.getByRole('button', { name: /Skip to Welcome/i })
    await expect(skipButton).toBeVisible()
    await skipButton.click()

    await expect(page.getByRole('heading', { level: 1, name: 'Welcome to 2098-03' })).toBeVisible()
    await page.getByRole('button', { name: 'Begin the Month' }).click()

    // Active Month Screen visible now; reload skips auto-intro; Read Monthly Introduction replays full sequence
    await expect(page.locator('.month-discoveries')).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Theme for 2098-03' })).toBeVisible()
    await page.getByRole('button', { name: 'Read Monthly Introduction' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Entering 2098-03' })).toBeVisible()
  })

  test('Slot states (Continue priority, In progress), silent Finish return, discovery order & earned status, and duplicate Finish idempotency', async ({ page }) => {
    await seedOnboardedState(page)

    // Pre-mark intro seen so test focuses cleanly on slot states, Challenge execution, Finish, and discoveries
    await page.addInitScript(introKey => {
      window.localStorage.setItem(
        introKey,
        JSON.stringify({
          schemaVersion: 1,
          months: {
            '2098-03': {
              previewSeen: true,
              welcomeSeen: true,
              previewVersion: 'v1-2098-03',
              welcomeVersion: 'v1-2098-03',
              updatedAt: '2098-03-01T09:00:00.000Z',
            },
          },
        }),
      )
    }, MONTH_INTRO_STORAGE_KEY)

    const progressRequests: string[][] = []
    const marchPayload = buildMonthDetailPayload('2098-03', {
      phase: 'active',
      title: 'March 2098 Challenges',
      slotOverrides: {
        1: {
          availability: 'available',
          title: 'Light in Darkness',
          slug: 'march-day-01-light',
          challengeId: 'cms:march-day-01-doc',
          challengeType: 'teaching',
        },
        2: {
          availability: 'available',
          title: 'Daily Bread',
          slug: 'march-day-02-bread',
          challengeId: 'cms:march-day-02-doc',
          challengeType: 'discipline',
        },
        3: { availability: 'comingSoon', title: 'Day 3 Future' },
        30: { availability: 'unavailable' },
        31: { availability: 'unavailable' },
      },
      // Put fullMonth FIRST on wire to assert UI places fullMonth strictly LAST
      discoveries: [
        { discoveryId: 'discovery:2098-03:full-month', kind: 'fullMonth', title: 'Full Month Walk', targetCount: 29 },
        { discoveryId: 'discovery:2098-03:light-discovery', kind: 'thematic', title: 'Light Discovery', targetCount: 2 },
      ],
    })

    await page.route('**/api/months/2098-03', route => route.fulfill({ status: 200, json: marchPayload }))

    await page.route('**/api/months/2098-03/progress', async route => {
      const body = route.request().postDataJSON() as { completedChallengeIds?: string[] }
      const ids = Array.isArray(body?.completedChallengeIds) ? body.completedChallengeIds : []
      progressRequests.push(ids)

      const lightAchieved = ids.filter(id => id === 'cms:march-day-01-doc' || id === 'cms:march-day-02-doc').length
      return route.fulfill({
        status: 200,
        json: {
          ok: true,
          serverContext: marchPayload.serverContext,
          monthId: '2098-03',
          rosterVersion: 1,
          completedInMonthCount: ids.length,
          totalChallenges: 29,
          thematicEarnedCount: lightAchieved >= 2 ? 1 : 0,
          thematicTotalCount: 1,
          discoveries: [
            {
              discoveryId: 'discovery:2098-03:full-month',
              kind: 'fullMonth',
              title: 'Full Month Walk',
              achievedCount: ids.length,
              targetCount: 29,
              isEarned: false,
            },
            {
              discoveryId: 'discovery:2098-03:light-discovery',
              kind: 'thematic',
              title: 'Light Discovery',
              achievedCount: lightAchieved,
              targetCount: 2,
              isEarned: lightAchieved >= 2,
              ...(lightAchieved >= 2
                ? {
                    awardId: 'card:monthly:2098-03:light-discovery',
                    reservedCardId: 'card-2098-03-light-discovery',
                    earnedCard: {
                      cardDocumentId: 'card-2098-03-light-discovery',
                      title: 'A Light for the Path',
                      publicationYearMonth: '2098-03',
                      imageUrl: 'https://cdn.sanity.io/images/80016lrq/staging/card-light-discovery.png',
                      assetRevision: 'v1',
                      illustrationAlt: 'A hand-drawn lamp on a path',
                      accessibleTranscription: 'Psalm 119:105 — Your word is a lamp to my feet.',
                      scripture: {
                        book: 'Psalms',
                        reference: 'Psalm 119:105',
                        translation: 'WEBP',
                      },
                      attribution: 'Bibleberry',
                      rightsStatus: 'approved-ministry-use',
                      shareEligible: true,
                    },
                  }
                : {}),
            },
          ],
        },
      })
    })

    const day1Challenge = buildGatewayChallengePayload({
      docId: 'march-day-01-doc',
      slug: 'march-day-01-light',
      title: 'Light in Darkness',
      monthId: '2098-03',
      dayOfMonth: 1,
      publicationDate: '2098-03-01',
    })
    const day2Challenge = buildGatewayChallengePayload({
      docId: 'march-day-02-doc',
      slug: 'march-day-02-bread',
      title: 'Daily Bread',
      monthId: '2098-03',
      dayOfMonth: 2,
      publicationDate: '2098-03-02',
    })

    await page.route('https://cdn.sanity.io/images/**', route =>
      route.fulfill({ status: 200, contentType: 'image/png', body: TINY_PNG_BUFFER }),
    )
    await page.route('**/api/challenges/march-day-01-light', route =>
      route.fulfill({ status: 200, json: { ok: true, serverContext: marchPayload.serverContext, challenge: day1Challenge } }),
    )
    await page.route('**/api/challenges/march-day-02-bread', route =>
      route.fulfill({ status: 200, json: { ok: true, serverContext: marchPayload.serverContext, challenge: day2Challenge } }),
    )

    await page.goto('/#/month/2098-03')
    await expect(page.getByRole('heading', { level: 1, name: 'March 2098 Challenges' })).toBeVisible()
    await expect(page.locator('.month-ticker')).toContainText('0 of 29')

    // Assert Discoveries render strictly BELOW Calendar and fullMonth renders strictly LAST
    const calendarBox = await page.locator('.month-calendar').boundingBox()
    const discoveriesBox = await page.locator('.month-discoveries').boundingBox()
    expect(calendarBox).not.toBeNull()
    expect(discoveriesBox).not.toBeNull()
    expect(discoveriesBox!.y).toBeGreaterThan(calendarBox!.y + calendarBox!.height - 2)

    const discoveryTitles = await page.locator('.month-discovery h3').allTextContents()
    expect(discoveryTitles).toEqual(['Light Discovery', 'Full Month Walk'])
    // Unearned discovery shows only numeric count, zero earned card artwork
    await expect(page.locator('.month-discovery').first()).toContainText('0 of 2')
    await expect(page.locator('.month-discovery img')).toHaveCount(0)

    const nextScreenBtn = page
      .getByRole('navigation', { name: 'Challenge screen navigation' })
      .getByRole('button', { name: 'Continue' })

    // 1. Start Day 1 mid-way (Part 2 of 3) without Finish -> exit back to March 2098
    await page.getByRole('button', { name: /Light in Darkness/ }).click()
    await expect(page).toHaveURL(/#\/challenge\/march-day-01-light\?origin=month&yearMonth=2098-03/)
    await expect(page.getByRole('heading', { level: 1, name: 'Light in Darkness' })).toBeVisible()
    await nextScreenBtn.click()
    await expect(page.getByRole('heading', { level: 2, name: 'Light in Darkness — Middle' })).toBeVisible()
    await page.getByRole('button', { name: 'Return to March 2098' }).click()
    await expect(page).toHaveURL(/#\/month\/2098-03$/)
    await expect(page.getByRole('button', { name: /Light in Darkness/ })).toContainText('Continue')

    // 2. Start Day 2 mid-way (Part 2 of 3) without Finish -> exit back to March 2098
    await page.getByRole('button', { name: /Daily Bread/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Daily Bread' })).toBeVisible()
    await nextScreenBtn.click()
    await expect(page.getByRole('heading', { level: 2, name: 'Daily Bread — Middle' })).toBeVisible()
    await page.getByRole('button', { name: 'Return to March 2098' }).click()

    // Priority rule: Day 2 (most recently opened incomplete) shows Continue; Day 1 shows In progress; still 0/29
    await expect(page.getByRole('button', { name: /Daily Bread/ })).toContainText('Continue')
    await expect(page.getByRole('button', { name: /Light in Darkness/ })).toContainText('In progress')
    await expect(page.locator('.month-ticker')).toContainText('0 of 29')

    // 3. Re-open Day 2 (resumes at Part 2), advance to last screen (Part 3) WITHOUT tapping Finish -> exit -> still incomplete
    await page.getByRole('button', { name: /Daily Bread/ }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Daily Bread — Middle' })).toBeVisible()
    await nextScreenBtn.click()
    await expect(page.getByRole('button', { name: 'Finish' })).toBeVisible()
    await page.getByRole('button', { name: 'Return to March 2098' }).click()
    await expect(page.getByRole('button', { name: /Daily Bread/ })).toContainText('Continue')
    await expect(page.locator('.month-ticker')).toContainText('0 of 29')

    // 4. Open Day 2 (resumes at Part 3 / Finish), tap Finish -> silent direct return to March 2098
    await page.getByRole('button', { name: /Daily Bread/ }).click()
    await expect(page.getByRole('button', { name: 'Finish' })).toBeVisible()
    await page.getByRole('button', { name: 'Finish' }).click()

    await expect(page).toHaveURL(/#\/month\/2098-03$/)
    await expect(page.locator('.toast.is-visible')).toHaveCount(0)
    await expect(page.locator('.month-ticker')).toContainText('1 of 29')
    await expect(page.getByRole('button', { name: /Daily Bread/ })).toContainText('Completed')
    // Day 1 automatically promoted to Continue since Day 2 is completed
    await expect(page.getByRole('button', { name: /Light in Darkness/ })).toContainText('Continue')
    await expect(page.locator('.month-discovery').first()).toContainText('1 of 2')

    // 5. Re-open already-completed Day 2 and Finish again -> strictly idempotent (1 of 29, no double count)
    await page.getByRole('button', { name: /Daily Bread/ }).click()
    await nextScreenBtn.click()
    await nextScreenBtn.click()
    await page.getByRole('button', { name: 'Finish' }).click()
    await expect(page.locator('.month-ticker')).toContainText('1 of 29')

    // 6. Resume Day 1 (Part 2 -> Part 3 -> Finish) -> silent discovery update and durable award
    await page.getByRole('button', { name: /Light in Darkness/ }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Light in Darkness — Middle' })).toBeVisible()
    await nextScreenBtn.click()
    await page.getByRole('button', { name: 'Finish' }).click()

    await expect(page.locator('.month-ticker')).toContainText('2 of 29')
    await expect(page.locator('.month-discovery').first()).toContainText('2 of 2')
    await expect(page.locator('.month-discovery').first()).toContainText('Scripture card earned')
    await expect(page.locator('.month-discovery').first().locator('img')).toHaveCount(1)
    await expect(page.locator('.month-discovery').last().locator('img')).toHaveCount(0)
    expect(progressRequests.some(ids => ids.includes('cms:march-day-01-doc') && ids.includes('cms:march-day-02-doc'))).toBe(true)

    await page.waitForFunction(({ storageKey, awardId }) => {
      const envelope = JSON.parse(window.localStorage.getItem(storageKey) ?? 'null')
      return Boolean(envelope?.data?.earnedAwards?.[awardId])
    }, {
      storageKey: PARTICIPATION_STORAGE_KEY,
      awardId: 'card:monthly:2098-03:light-discovery',
    })
    const savedAward = await page.evaluate(storageKey => {
      const envelope = JSON.parse(window.localStorage.getItem(storageKey) ?? 'null')
      return {
        schemaVersion: envelope?.schemaVersion,
        completed: Object.keys(envelope?.data?.completedChallenges ?? {}),
        award: envelope?.data?.earnedAwards?.['card:monthly:2098-03:light-discovery'],
      }
    }, PARTICIPATION_STORAGE_KEY)
    expect(savedAward.schemaVersion).toBe(2)
    expect(savedAward.completed).toContain('cms:march-day-01-doc')
    expect(savedAward.completed).toContain('cms:march-day-02-doc')
    expect(savedAward.award.earnedOn).toBe('2098-03-02')
    expect(savedAward.award.cardDocumentId).toBe('card-2098-03-light-discovery')
    expect(savedAward.award.earnedCard.imageUrl).toContain('cdn.sanity.io')

    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'March 2098 Challenges' })).toBeVisible()
    await expect(page.locator('.month-discovery').first()).toContainText('Scripture card earned')
    await expect(page.locator('.month-discovery').first().locator('img')).toHaveCount(1)
    await expect(page.locator('.month-discovery').last().locator('img')).toHaveCount(0)
  })

  test('Preview News banner respects month authorization boundary + guest reset clears intro + responsive layout', async ({ page }) => {
    await seedOnboardedState(page)

    let allowAprilPreview = false

    await page.route('**/api/news**', route =>
      route.fulfill({
        status: 200,
        json: {
          ok: true,
          serverContext: { authorizedLocalDate: '2098-03-29', effectiveTimeZone: 'America/New_York' },
          articles: [
            {
              id: 'news-preview-2098-04',
              documentId: 'news-preview-2098-04',
              category: 'monthlyPreview',
              publishedOn: '2098-03-29',
              title: 'April Preview Is Open',
              summary: 'Preview the upcoming month theme.',
              destination: { kind: 'month', monthId: '2098-04' },
            },
          ],
        },
      }),
    )

    await page.route('**/api/months/2098-04/preview', route => {
      if (!allowAprilPreview) {
        return route.fulfill({ status: 404, json: { ok: false } })
      }
      return route.fulfill({ status: 200, json: buildMonthPreviewPayload('2098-04') })
    })
    await page.route('**/api/months/2098-04', route =>
      route.fulfill({ status: 404, json: { ok: false } }),
    )

    // 1. Minimal Preview News banner appears on Today Hub
    await page.goto('/')
    const banner = page.getByLabel('Monthly preview announcement')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('April Preview Is Open')

    // 2. If gateway refuses 2098-04 (404), Preview News never bypasses month authorization
    await banner.getByRole('link', { name: /View April 2098 preview/i }).click()
    await expect(page).toHaveURL(/#\/month\/2098-04$/)
    await expect(page.getByRole('heading', { level: 2, name: 'Month unavailable' })).toBeVisible()

    // 3. When 2098-04 preview is authorized, inspect responsive layout at mobile (375x812) and tablet (768x1024)
    allowAprilPreview = true
    await page.setViewportSize({ width: 375, height: 812 })
    await page.getByRole('button', { name: 'Try Again' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Entering 2098-04' })).toBeVisible()
    const introOverflowMobile = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    )
    expect(introOverflowMobile).toBe(false)

    await page.getByRole('button', { name: /Close introduction/i }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Theme for 2098-04' })).toBeVisible()
    const calOverflowMobile = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    )
    expect(calOverflowMobile).toBe(false)

    await page.setViewportSize({ width: 768, height: 1024 })
    const calOverflowTablet = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    )
    expect(calOverflowTablet).toBe(false)

    // 4. Privacy -> Reset local app data clears both bibleberry-reader-participation-v1 and bibleberry-month-intro-v1
    await page.getByRole('button', { name: 'More' }).first().click()
    await page.getByRole('button', { name: /Privacy & local data/i }).click()
    await page.getByRole('button', { name: /Reset local app data/i }).click()
    await page.getByRole('button', { name: /Erase & reset/i }).click()

    await expect(page.locator('.onboarding')).toBeVisible()
    const afterReset = await page.evaluate(
      ([introKey, partKey]) => ({
        intro: window.localStorage.getItem(introKey),
        part: window.localStorage.getItem(partKey),
      }),
      [MONTH_INTRO_STORAGE_KEY, PARTICIPATION_STORAGE_KEY],
    )
    await expect(afterReset.intro).toBeNull()
    expect(afterReset.part).toBeNull()
  })

  test('Closing Introduction or Advance Preview early does not record completion or unlock Skip to Welcome', async ({ page }) => {
    await seedOnboardedState(page)

    let aprilPhase: 'advancePreview' | 'active' = 'advancePreview'

    await page.route('**/api/months/*/preview', route => {
      const url = new URL(route.request().url())
      const ym = url.pathname.split('/')[3]
      if (ym === '2098-04' && aprilPhase === 'advancePreview') {
        return route.fulfill({ status: 200, json: buildMonthPreviewPayload('2098-04') })
      }
      return route.fulfill({ status: 404, json: { ok: false } })
    })

    await page.route('**/api/months/*/progress', route => {
      const url = new URL(route.request().url())
      const ym = url.pathname.split('/')[3]
      return route.fulfill({
        status: 200,
        json: {
          ok: true,
          serverContext: { authorizedLocalDate: `${ym}-15`, effectiveTimeZone: 'America/New_York' },
          monthId: ym,
          rosterVersion: 1,
          completedInMonthCount: 0,
          totalChallenges: 28,
          thematicEarnedCount: 0,
          thematicTotalCount: 1,
          discoveries: [],
        },
      })
    })

    await page.route('**/api/months/*', route => {
      const url = new URL(route.request().url())
      const ym = url.pathname.split('/')[3]
      if (ym === '2096-02') {
        return route.fulfill({
          status: 200,
          json: buildMonthDetailPayload('2096-02', { phase: 'historical', title: 'Historical Feb 2096' }),
        })
      }
      if (ym === '2096-01') {
        return route.fulfill({
          status: 200,
          json: buildMonthDetailPayload('2096-01', { phase: 'historical', title: 'Historical Jan 2096' }),
        })
      }
      if (ym === '2098-04' && aprilPhase === 'active') {
        return route.fulfill({
          status: 200,
          json: buildMonthDetailPayload('2098-04', { phase: 'active', title: 'Active April 2098' }),
        })
      }
      return route.fulfill({ status: 404, json: { ok: false } })
    })

    // 1. Historical month: Close on Screen 1 dismisses overlay without persisting completion
    await page.goto('/#/month/2096-02')
    await expect(page.getByRole('heading', { level: 1, name: 'Entering 2096-02' })).toBeVisible()
    await page.getByRole('button', { name: /Close introduction/i }).click()

    await expect(page.getByRole('heading', { level: 1, name: 'Historical Feb 2096' })).toBeVisible()
    const afterEarlyClose = await page.evaluate(k => window.localStorage.getItem(k), MONTH_INTRO_STORAGE_KEY)
    expect(afterEarlyClose).toBeNull()

    // Navigate away to another month and return -> incomplete intro reappears automatically
    await page.getByRole('button', { name: /2096-01/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Entering 2096-01' })).toBeVisible()
    await page.getByRole('button', { name: /Close introduction/i }).click()
    await page.getByRole('button', { name: /2096-02/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Entering 2096-02' })).toBeVisible()

    // Navigate away to Hub and return via reload -> incomplete intro still reappears
    await page.getByRole('button', { name: /Close introduction/i }).click()
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Entering 2096-02' })).toBeVisible()

    // Now explicitly complete through Welcome final CTA -> subsequent reload skips intro
    await page.getByRole('button', { name: /Continue/i }).click()
    await page.getByRole('button', { name: /Continue/i }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome to 2096-02' })).toBeVisible()
    await page.getByRole('button', { name: 'Begin the Month' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Historical Feb 2096' })).toBeVisible()

    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Historical Feb 2096' })).toBeVisible()
    await expect(page.locator('.month-intro')).toHaveCount(0)

    // 2. Advance Preview: Close early does NOT persist previewSeen or unlock Skip to Welcome on rollover
    await page.goto('/#/month/2098-04')
    await expect(page.getByRole('heading', { level: 1, name: 'Entering 2098-04' })).toBeVisible()
    await page.getByRole('button', { name: /Close introduction/i }).click()
    await expect(page.getByText('Advance Preview')).toBeVisible()

    const previewRecord = await page.evaluate(k => window.localStorage.getItem(k), MONTH_INTRO_STORAGE_KEY)
    expect(previewRecord ?? '').not.toContain('"2098-04"')

    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Entering 2098-04' })).toBeVisible()

    // Roll 2098-04 over to active while preview was only closed early -> NO Skip to Welcome
    aprilPhase = 'active'
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Entering 2098-04' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Skip to Welcome/i })).toHaveCount(0)
  })

  test('Privacy Reset reports partial failure accurately when monthly introduction storage clear fails', async ({ page }) => {
    await seedOnboardedState(page)

    await page.addInitScript(
      ([introKey, partKey]) => {
        window.localStorage.setItem(
          introKey,
          JSON.stringify({
            schemaVersion: 1,
            months: {
              '2098-03': {
                previewSeen: true,
                welcomeSeen: true,
                previewVersion: 'v1-2098-03',
                welcomeVersion: 'v1-2098-03',
              },
            },
          }),
        )
        window.localStorage.setItem(
          partKey,
          JSON.stringify({
            schemaVersion: 1,
            completedChallenges: {
              'cms:march-day-01-doc': { completedOn: '2098-03-01', updatedAt: '2098-03-01T10:00:00Z' },
            },
            inProgressChallenges: {},
            savedChallenges: {},
            savedScriptures: {},
          }),
        )
      },
      [MONTH_INTRO_STORAGE_KEY, PARTICIPATION_STORAGE_KEY],
    )

    await page.goto('/')

    // Inject storage remove failure strictly for bibleberry-month-intro-v1
    await page.evaluate(introKey => {
      const originalRemoveItem = window.Storage.prototype.removeItem
      window.Storage.prototype.removeItem = function patchedRemoveItem(key: string) {
        if (key === introKey) {
          throw new DOMException('Injected storage unavailable error', 'SecurityError')
        }
        return originalRemoveItem.call(this, key)
      }
    }, MONTH_INTRO_STORAGE_KEY)

    await page.getByRole('button', { name: 'More' }).first().click()
    await page.getByRole('button', { name: /Privacy & local data/i }).click()
    await page.getByRole('button', { name: /Reset local app data/i }).click()
    await page.getByRole('button', { name: /Erase & reset/i }).click()

    await expect(page.locator('.onboarding')).toBeVisible()
    const toast = page.locator('.toast.is-visible')
    await expect(toast).toBeVisible()
    await expect(toast).toContainText('monthly introduction storage could not be cleared')
    await expect(toast).not.toContainText('Local app data cleared. Welcome restored.')

    const storageAfter = await page.evaluate(
      ([introKey, partKey]) => ({
        intro: window.localStorage.getItem(introKey),
        part: window.localStorage.getItem(partKey),
      }),
      [MONTH_INTRO_STORAGE_KEY, PARTICIPATION_STORAGE_KEY],
    )
    expect(storageAfter.part).toBeNull()
    expect(storageAfter.intro).toContain('"welcomeSeen":true')
  })

  test('R14-5 Earned Scripture Card viewer: keyboard/click open, Escape/focus return, distinct cards, no-art noninteractive, markEarnedCardViewed persistence', async ({ page }) => {
    await seedOnboardedState(page)

    const lightCardUrl = 'https://cdn.sanity.io/images/80016lrq/staging/card-light-r14-5.png'
    const breadCardUrl = 'https://cdn.sanity.io/images/80016lrq/staging/card-bread-r14-5.png'
    const leakedUnearnedUrl = 'https://cdn.sanity.io/images/80016lrq/staging/card-should-never-leak.png'
    const assetRequests: string[] = []

    await page.route('https://cdn.sanity.io/images/**', route => {
      assetRequests.push(route.request().url())
      return route.fulfill({ status: 200, contentType: 'image/png', body: TINY_PNG_BUFFER })
    })

    await page.addInitScript(
      ([introKey, partKey, lightUrl, breadUrl]) => {
        if (!window.localStorage.getItem(introKey)) {
          window.localStorage.setItem(
            introKey,
            JSON.stringify({
              schemaVersion: 1,
              months: {
                '2098-03': {
                  previewSeen: true,
                  welcomeSeen: true,
                  previewVersion: 'v1-2098-03',
                  welcomeVersion: 'v1-2098-03',
                },
              },
            }),
          )
        }
        if (!window.localStorage.getItem(partKey)) {
          window.localStorage.setItem(
            partKey,
            JSON.stringify({
              schemaVersion: 2,
              data: {
                completedChallenges: {
                  'cms:2098-03-day-01-doc': { completedOn: '2098-03-01' },
                  'cms:2098-03-day-02-doc': { completedOn: '2098-03-02' },
                },
                inProgressChallenges: {},
                savedChallenges: {},
                savedScriptures: [],
                lastOpenedChallenge: null,
                earnedAwards: {
                  'card:monthly:2098-03:light-discovery': {
                    awardId: 'card:monthly:2098-03:light-discovery',
                    kind: 'thematic',
                    publicationYearMonth: '2098-03',
                    discoveryId: 'discovery:2098-03:light-discovery',
                    earnedOn: '2098-03-02',
                    hubAnnouncementAcked: false,
                    cardViewed: false,
                    cardDocumentId: 'card-2098-03-light-discovery',
                    earnedCard: {
                      cardDocumentId: 'card-2098-03-light-discovery',
                      title: 'A Light for the Path',
                      publicationYearMonth: '2098-03',
                      imageUrl: lightUrl,
                      assetRevision: 'v1',
                      illustrationAlt: 'Hand-drawn brass lamp beside open scroll',
                      accessibleTranscription: 'Psalm 119:105 (WEBP) — Your word is a lamp to my feet, and a light for my path.',
                      scripture: {
                        book: 'Psalms',
                        reference: 'Psalm 119:105',
                        translation: 'WEBP',
                      },
                      attribution: 'Alexis Waid / Bibleberry',
                      rightsStatus: 'approved-ministry-use',
                      shareEligible: true,
                      theologicalThemes: ['Guidance', 'Light'],
                    },
                  },
                  'card:monthly:2098-03:bread-discovery': {
                    awardId: 'card:monthly:2098-03:bread-discovery',
                    kind: 'thematic',
                    publicationYearMonth: '2098-03',
                    discoveryId: 'discovery:2098-03:bread-discovery',
                    earnedOn: '2098-03-01',
                    hubAnnouncementAcked: false,
                    cardViewed: false,
                    cardDocumentId: 'card-2098-03-bread-discovery',
                    earnedCard: {
                      cardDocumentId: 'card-2098-03-bread-discovery',
                      title: 'The Bread of Life',
                      publicationYearMonth: '2098-03',
                      imageUrl: breadUrl,
                      assetRevision: 'v1',
                      illustrationAlt: 'Hand-drawn basket of loaves on linen cloth',
                      accessibleTranscription: 'John 6:35 (WEBP) — Jesus said to them, I am the bread of life.',
                      scripture: {
                        book: 'John',
                        reference: 'John 6:35',
                        translation: 'WEBP',
                      },
                      attribution: 'Alexis Waid / Bibleberry',
                      rightsStatus: 'approved-ministry-use',
                      shareEligible: true,
                      theologicalThemes: ['Provision'],
                    },
                  },
                  'card:monthly:2098-03:no-art-discovery': {
                    awardId: 'card:monthly:2098-03:no-art-discovery',
                    kind: 'thematic',
                    publicationYearMonth: '2098-03',
                    discoveryId: 'discovery:2098-03:no-art-discovery',
                    earnedOn: '2098-03-02',
                    hubAnnouncementAcked: false,
                    cardViewed: false,
                  },
                },
              },
            }),
          )
        }
      },
      [MONTH_INTRO_STORAGE_KEY, PARTICIPATION_STORAGE_KEY, lightCardUrl, breadCardUrl],
    )

    const marchPayload = buildMonthDetailPayload('2098-03', {
      phase: 'historical',
      title: 'March 2098 Historical',
      discoveries: [
        { discoveryId: 'discovery:2098-03:full-month', kind: 'fullMonth', title: 'Full Month Walk', targetCount: 31 },
        { discoveryId: 'discovery:2098-03:light-discovery', kind: 'thematic', title: 'Light Discovery', targetCount: 2 },
        { discoveryId: 'discovery:2098-03:bread-discovery', kind: 'thematic', title: 'Bread Discovery', targetCount: 2 },
        { discoveryId: 'discovery:2098-03:no-art-discovery', kind: 'thematic', title: 'No-Art Discovery', targetCount: 1 },
      ],
    })

    await page.route('**/api/months/2098-03', route =>
      route.fulfill({ status: 200, json: marchPayload }),
    )
    await page.route('**/api/months/2098-03/progress', route =>
      route.fulfill({
        status: 200,
        json: {
          ok: true,
          serverContext: marchPayload.serverContext,
          monthId: '2098-03',
          rosterVersion: 1,
          completedInMonthCount: 2,
          totalChallenges: 31,
          thematicEarnedCount: 3,
          thematicTotalCount: 3,
          discoveries: [
            {
              discoveryId: 'discovery:2098-03:full-month',
              kind: 'fullMonth',
              title: 'Full Month Walk',
              achievedCount: 2,
              targetCount: 31,
              isEarned: false,
              earnedCard: {
                cardDocumentId: 'card-2098-03-full-month',
                title: 'Leaked Full Month Title',
                publicationYearMonth: '2098-03',
                imageUrl: leakedUnearnedUrl,
                assetRevision: 'v1',
                illustrationAlt: 'Should never leak',
                accessibleTranscription: 'Should never appear on unearned discovery.',
                scripture: { book: 'John', reference: 'John 1:1', translation: 'WEBP' },
                attribution: 'Bibleberry',
                rightsStatus: 'approved-ministry-use',
                shareEligible: false,
              },
            },
            {
              discoveryId: 'discovery:2098-03:light-discovery',
              kind: 'thematic',
              title: 'Light Discovery',
              achievedCount: 2,
              targetCount: 2,
              isEarned: true,
              awardId: 'card:monthly:2098-03:light-discovery',
            },
            {
              discoveryId: 'discovery:2098-03:bread-discovery',
              kind: 'thematic',
              title: 'Bread Discovery',
              achievedCount: 2,
              targetCount: 2,
              isEarned: true,
              awardId: 'card:monthly:2098-03:bread-discovery',
            },
            {
              discoveryId: 'discovery:2098-03:no-art-discovery',
              kind: 'thematic',
              title: 'No-Art Discovery',
              achievedCount: 1,
              targetCount: 1,
              isEarned: true,
              awardId: 'card:monthly:2098-03:no-art-discovery',
            },
          ],
        },
      }),
    )

    await page.goto('/#/month/2098-03')
    await expect(page.getByRole('heading', { level: 1, name: 'March 2098 Historical' })).toBeVisible()

    // Full-month discovery stays strictly last; unearned discovery has zero img or button
    const items = page.locator('.month-discovery')
    await expect(items).toHaveCount(4)
    await expect(items.nth(3)).toContainText('Full Month Walk')
    await expect(items.nth(3)).not.toContainText('Leaked Full Month Title')
    await expect(page.locator('body')).not.toContainText('Should never appear on unearned discovery.')
    await expect(items.nth(3).locator('img')).toHaveCount(0)
    await expect(items.nth(3).getByRole('button')).toHaveCount(0)
    expect(assetRequests.includes(leakedUnearnedUrl)).toBe(false)

    // No-art earned discovery is non-interactive with clear message
    await expect(items.nth(2)).toContainText('No-Art Discovery')
    await expect(items.nth(2)).toContainText('Card artwork is unavailable')
    await expect(items.nth(2).getByRole('button')).toHaveCount(0)
    await expect(items.nth(2).locator('img')).toHaveCount(0)

    // Keyboard open Card 1 via Enter
    const lightBtn = page.getByRole('button', { name: /A Light for the Path/ })
    const breadBtn = page.getByRole('button', { name: /The Bread of Life/ })
    await expect(items.nth(0)).toContainText('New')
    await expect(items.nth(1)).toContainText('New')

    await lightBtn.focus()
    await page.keyboard.press('Enter')

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('A Light for the Path')
    await expect(dialog).toContainText('Psalm 119:105')
    await expect(dialog).toContainText('Your word is a lamp to my feet, and a light for my path.')
    await expect(dialog).toContainText('Alexis Waid / Bibleberry')
    await expect(dialog).toContainText('approved-ministry-use')
    await expect(dialog.locator('img')).toHaveAttribute('src', lightCardUrl)
    await expect(dialog).not.toContainText('The Bread of Life')
    await expect(page.locator('.toast.is-visible')).toHaveCount(0)

    // Image actually loaded in browser
    const lightLoaded = await dialog.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth > 0)
    expect(lightLoaded).toBe(true)

    // Focus containment: Tab stays inside dialog
    const closeBtn = dialog.getByRole('button', { name: /Close Scripture card/i })
    await expect(closeBtn).toBeFocused()
    await page.keyboard.press('Tab')
    const focusInsideDialog = await dialog.evaluate(el => el.contains(document.activeElement))
    expect(focusInsideDialog).toBe(true)

    // Escape closes dialog and restores focus to lightBtn
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(lightBtn).toBeFocused()

    // Only light-discovery marked viewed; bread-discovery and no-art remain unviewed; hubAnnouncementAcked stays false
    await expect(items.nth(0)).not.toContainText('New')
    await expect(items.nth(1)).toContainText('New')

    const afterFirstView = await page.evaluate(storageKey => {
      return JSON.parse(window.localStorage.getItem(storageKey) ?? 'null')?.data?.earnedAwards
    }, PARTICIPATION_STORAGE_KEY)
    expect(afterFirstView['card:monthly:2098-03:light-discovery'].cardViewed).toBe(true)
    expect(afterFirstView['card:monthly:2098-03:light-discovery'].hubAnnouncementAcked).toBe(false)
    expect(afterFirstView['card:monthly:2098-03:light-discovery'].earnedOn).toBe('2098-03-02')
    expect(afterFirstView['card:monthly:2098-03:bread-discovery'].cardViewed).toBe(false)
    expect(afterFirstView['card:monthly:2098-03:bread-discovery'].hubAnnouncementAcked).toBe(false)
    expect(afterFirstView['card:monthly:2098-03:no-art-discovery'].cardViewed).toBe(false)

    // Click Card 2 and close via Close button -> distinct card content, focus returns to breadBtn
    await breadBtn.click()
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('The Bread of Life')
    await expect(dialog).toContainText('John 6:35')
    await expect(dialog.locator('img')).toHaveAttribute('src', breadCardUrl)
    await closeBtn.click()
    await expect(dialog).toHaveCount(0)
    await expect(breadBtn).toBeFocused()

    // Reload preserves cardViewed, earnedOn, and hubAnnouncementAcked: false
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'March 2098 Historical' })).toBeVisible()
    await expect(items.nth(0)).not.toContainText('New')
    await expect(items.nth(1)).not.toContainText('New')
    const afterReload = await page.evaluate(storageKey => {
      return JSON.parse(window.localStorage.getItem(storageKey) ?? 'null')?.data?.earnedAwards
    }, PARTICIPATION_STORAGE_KEY)
    expect(afterReload['card:monthly:2098-03:light-discovery'].cardViewed).toBe(true)
    expect(afterReload['card:monthly:2098-03:light-discovery'].hubAnnouncementAcked).toBe(false)
    expect(afterReload['card:monthly:2098-03:light-discovery'].earnedOn).toBe('2098-03-02')
    expect(afterReload['card:monthly:2098-03:bread-discovery'].cardViewed).toBe(true)
    expect(afterReload['card:monthly:2098-03:bread-discovery'].hubAnnouncementAcked).toBe(false)
  })

  test('R14-5 Earned Scripture Card privacy & resilience: blocks un-admitted provisional art, survives progress network failure, and scales on mobile large text', async ({ page }) => {
    await seedOnboardedState(page)

    const validUrl = 'https://cdn.sanity.io/images/80016lrq/staging/card-offline-safe.png'
    const provisionalRejectedUrl = 'https://cdn.sanity.io/images/80016lrq/staging/card-provisional-unadmitted.png'
    const requestedImages: string[] = []

    await page.route('https://cdn.sanity.io/images/**', route => {
      requestedImages.push(route.request().url())
      return route.fulfill({ status: 200, contentType: 'image/png', body: TINY_PNG_BUFFER })
    })

    await page.addInitScript(
      ([protoKey, introKey, partKey, storedUrl]) => {
        const proto = JSON.parse(window.localStorage.getItem(protoKey) ?? '{}')
        window.localStorage.setItem(
          protoKey,
          JSON.stringify({ ...proto, onboarded: true, textSize: 'large' }),
        )
        window.localStorage.setItem(
          introKey,
          JSON.stringify({
            schemaVersion: 1,
            months: {
              '2098-03': {
                previewSeen: true,
                welcomeSeen: true,
                previewVersion: 'v1-2098-03',
                welcomeVersion: 'v1-2098-03',
              },
            },
          }),
        )
        window.localStorage.setItem(
          partKey,
          JSON.stringify({
            schemaVersion: 2,
            data: {
              completedChallenges: {},
              inProgressChallenges: {},
              savedChallenges: {},
              savedScriptures: [],
              lastOpenedChallenge: null,
              earnedAwards: {
                'card:monthly:2098-03:light-discovery': {
                  awardId: 'card:monthly:2098-03:light-discovery',
                  kind: 'thematic',
                  publicationYearMonth: '2098-03',
                  discoveryId: 'discovery:2098-03:light-discovery',
                  earnedOn: '2098-03-02',
                  hubAnnouncementAcked: false,
                  cardViewed: false,
                  cardDocumentId: 'card-2098-03-light-discovery',
                  earnedCard: {
                    cardDocumentId: 'card-2098-03-light-discovery',
                    title: 'Stored Offline Card',
                    publicationYearMonth: '2098-03',
                    imageUrl: storedUrl,
                    assetRevision: 'v1',
                    illustrationAlt: 'Hand-drawn olive branch',
                    accessibleTranscription: 'Long transcription paragraph to verify large-text wrapping without truncation on compact mobile viewports.',
                    scripture: {
                      book: 'Psalms',
                      reference: 'Psalm 119:105',
                      translation: 'WEBP',
                    },
                    attribution: 'Alexis Waid / Bibleberry',
                    rightsStatus: 'approved-ministry-use',
                    shareEligible: false,
                  },
                },
              },
            },
          }),
        )
      },
      [PROTOTYPE_STORAGE_KEY, MONTH_INTRO_STORAGE_KEY, PARTICIPATION_STORAGE_KEY, validUrl],
    )

    const marchPayload = buildMonthDetailPayload('2098-03', {
      phase: 'historical',
      title: 'March 2098 Resilient',
      discoveries: [
        { discoveryId: 'discovery:2098-03:light-discovery', kind: 'thematic', title: 'Light Discovery', targetCount: 2 },
        { discoveryId: 'discovery:2098-03:unadmitted-discovery', kind: 'thematic', title: 'Unadmitted Discovery', targetCount: 1 },
      ],
    })

    let failProgress = false
    await page.route('**/api/months/2098-03', route =>
      route.fulfill({ status: 200, json: marchPayload }),
    )
    await page.route('**/api/months/2098-03/progress', route => {
      if (failProgress) {
        return route.fulfill({ status: 500, json: { ok: false, error: 'Gateway offline' } })
      }
      // Return invalid authorizedLocalDate so durable admission rejects provisional award
      return route.fulfill({
        status: 200,
        json: {
          ok: true,
          serverContext: { authorizedLocalDate: 'invalid-date', effectiveTimeZone: 'America/New_York' },
          monthId: '2098-03',
          rosterVersion: 1,
          completedInMonthCount: 1,
          totalChallenges: 31,
          thematicEarnedCount: 1,
          thematicTotalCount: 2,
          discoveries: [
            {
              discoveryId: 'discovery:2098-03:unadmitted-discovery',
              kind: 'thematic',
              title: 'Unadmitted Discovery',
              achievedCount: 1,
              targetCount: 1,
              isEarned: true,
              awardId: 'card:monthly:2098-03:unadmitted-discovery',
              earnedCard: {
                cardDocumentId: 'card-2098-03-unadmitted',
                title: 'Should Not Render',
                publicationYearMonth: '2098-03',
                imageUrl: provisionalRejectedUrl,
                assetRevision: 'v1',
                illustrationAlt: 'Provisional un-admitted image',
                accessibleTranscription: 'Should never appear when not durably admitted.',
                scripture: { book: 'John', reference: 'John 1:1', translation: 'WEBP' },
                attribution: 'Bibleberry',
                rightsStatus: 'approved-ministry-use',
                shareEligible: false,
              },
            },
          ],
        },
      })
    })

    // 1. Provisional un-admitted response must NOT render or fetch provisionalRejectedUrl
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/#/month/2098-03')
    await expect(page.getByRole('heading', { level: 1, name: 'March 2098 Resilient' })).toBeVisible()
    await expect(page.locator('.month-discovery').nth(1)).not.toContainText('Should Not Render')
    await expect(page.locator('.month-discovery').nth(1).locator('img')).toHaveCount(0)
    await expect(page.locator('.month-discovery').nth(1).getByRole('button')).toHaveCount(0)
    expect(requestedImages.includes(provisionalRejectedUrl)).toBe(false)

    // 2. Network failure on progress still lets stored earned Card open cleanly on 375px large-text viewport
    failProgress = true
    await page.reload()
    await expect(page.locator('.month-discoveries__error')).toBeVisible()
    const openBtn = page.getByRole('button', { name: /Stored Offline Card/ })
    await expect(openBtn).toBeVisible()
    await openBtn.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Long transcription paragraph to verify large-text wrapping without truncation on compact mobile viewports.')
    const mobileOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    )
    expect(mobileOverflow).toBe(false)
  })
})
