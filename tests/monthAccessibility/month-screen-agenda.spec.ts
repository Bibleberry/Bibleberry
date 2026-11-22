import { test, expect } from '../smoke/helpers/frameSafeTest'
import type { Locator, Page } from '@playwright/test'

const PROTOTYPE_STORAGE_KEY = 'bibleberry-prototype-v1'
const PARTICIPATION_STORAGE_KEY = 'bibleberry-reader-participation-v1'
const MONTH_INTRO_STORAGE_KEY = 'bibleberry-month-intro-v1'
const CARD_IMAGE_URL = 'https://cdn.sanity.io/images/80016lrq/staging/copper-meadow-card.png'
const TINY_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aW0cAAAAASUVORK5CYII=',
  'base64',
)

const LONG_AVAILABLE_TITLE =
  'A deliberately long ministry-authored Challenge title examining steadfast patience, Scripture meditation, and faithful endurance across narrow viewports and enlarged text'
const LONG_COMING_SOON_TITLE =
  'An upcoming Challenge title with enough length to confirm natural wrapping without leaking manuscripts or becoming interactive before release'

type SlotOverride =
  | {
      availability: 'available'
      title: string
      slug: string
      challengeId: string
      challengeType?: 'teaching' | 'discipline' | 'reflection' | 'memorization'
    }
  | { availability: 'comingSoon'; title: string }
  | { availability: 'unavailable'; formerChallengeId?: string }

function daysInCivilMonth(yearMonth: string): number {
  const [year, month] = yearMonth.split('-').map(Number)
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function buildMonthDetail(
  yearMonth: string,
  options?: {
    phase?: 'active' | 'historical'
    title?: string
    slotOverrides?: Record<number, SlotOverride>
    discoveries?: {
      discoveryId: string
      kind: 'thematic' | 'fullMonth'
      title: string
      targetCount: number
    }[]
  },
) {
  const [year, month] = yearMonth.split('-').map(Number)
  const totalDays = daysInCivilMonth(yearMonth)
  const overrides = options?.slotOverrides ?? {}

  const slots = Array.from({ length: totalDays }, (_, idx) => {
    const dayOfMonth = idx + 1
    const date = `${yearMonth}-${String(dayOfMonth).padStart(2, '0')}`
    const override = overrides[dayOfMonth]

    if (override) {
      if (override.availability === 'unavailable') {
        return {
          dayOfMonth,
          date,
          availability: 'unavailable' as const,
          ...(override.formerChallengeId ? { formerChallengeId: override.formerChallengeId } : {}),
        }
      }
      if (override.availability === 'comingSoon') {
        return {
          dayOfMonth,
          date,
          availability: 'comingSoon' as const,
          title: override.title,
        }
      }
      return {
        dayOfMonth,
        date,
        availability: 'available' as const,
        title: override.title,
        slug: override.slug,
        challengeId: override.challengeId,
        challengeType: override.challengeType ?? 'teaching',
      }
    }

    return {
      dayOfMonth,
      date,
      availability: 'available' as const,
      title: `Day ${dayOfMonth} Reading`,
      slug: `${yearMonth}-day-${String(dayOfMonth).padStart(2, '0')}`,
      challengeId: `cms:${yearMonth}-day-${String(dayOfMonth).padStart(2, '0')}`,
      challengeType: 'teaching' as const,
    }
  })

  const totalChallenges = slots.filter(slot => slot.availability !== 'unavailable').length

  return {
    ok: true,
    serverContext: {
      authorizedLocalDate: `${yearMonth}-10`,
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
      subtitle: `Walking through ${yearMonth} one day at a time.`,
      introduction: {
        version: `v1-${yearMonth}`,
        previewScreens: [
          {
            id: `preview-${yearMonth}-1`,
            stepLabel: 'Overview',
            title: `Entering ${yearMonth}`,
            blocks: [
              {
                _key: `blk-${yearMonth}-p1`,
                _type: 'statementBlock',
                text: `Overview for ${yearMonth}.`,
              },
            ],
          },
        ],
        welcomeScreen: {
          id: `welcome-${yearMonth}`,
          stepLabel: 'Welcome',
          title: `Welcome to ${yearMonth}`,
          ctaLabel: 'Begin the Month',
          blocks: [
            {
              _key: `blk-${yearMonth}-w1`,
              _type: 'statementBlock',
              text: `Welcome to ${yearMonth}.`,
            },
          ],
        },
      },
      slots,
      discoveries: options?.discoveries ?? [
        {
          discoveryId: `discovery:${yearMonth}:full-month`,
          kind: 'fullMonth' as const,
          title: 'Full-Month Walk',
          targetCount: totalChallenges,
        },
        {
          discoveryId: `discovery:${yearMonth}:light`,
          kind: 'thematic' as const,
          title: 'Walking in Light',
          targetCount: 2,
        },
      ],
    },
  }
}

function buildMonthPreview(yearMonth: string, authorizedLocalDate = '2098-02-27') {
  const [year, month] = yearMonth.split('-').map(Number)
  const totalDays = daysInCivilMonth(yearMonth)

  const slots = Array.from({ length: totalDays }, (_, idx) => {
    const dayOfMonth = idx + 1
    const date = `${yearMonth}-${String(dayOfMonth).padStart(2, '0')}`
    if (dayOfMonth === totalDays) {
      return { dayOfMonth, date, availability: 'unavailable' as const }
    }
    return {
      dayOfMonth,
      date,
      availability: 'comingSoon' as const,
      title: dayOfMonth === 1 ? LONG_COMING_SOON_TITLE : `Preview Day ${dayOfMonth} Title`,
    }
  })

  return {
    ok: true,
    serverContext: {
      authorizedLocalDate,
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
      title: `Upcoming ${yearMonth}`,
      subtitle: `Advance preview for ${yearMonth}.`,
      introduction: {
        version: `v1-${yearMonth}`,
        previewScreens: [
          {
            id: `preview-${yearMonth}-1`,
            stepLabel: 'Overview',
            title: `Previewing ${yearMonth}`,
            blocks: [
              {
                _key: `blk-${yearMonth}-p1`,
                _type: 'statementBlock',
                text: `Preview screen for ${yearMonth}.`,
              },
            ],
          },
        ],
      },
      slots,
    },
  }
}

async function seedBaseState(
  page: Page,
  options?: {
    seenIntroMonths?: string[]
    participationData?: Record<string, unknown>
  },
) {
  const seenMonths = options?.seenIntroMonths ?? [
    '2026-11',
    '2096-02',
    '2098-02',
    '2098-03',
    '2098-04',
    '2098-05',
  ]
  const participationData = options?.participationData ?? null

  await page.addInitScript(
    ([protoKey, introKey, partKey, months, partData]) => {
      window.localStorage.setItem(
        protoKey,
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

      window.localStorage.setItem(
        introKey,
        JSON.stringify({
          schemaVersion: 1,
          months: Object.fromEntries(
            months.map(monthId => [
              monthId,
              {
                previewSeen: true,
                welcomeSeen: true,
                previewVersion: `v1-${monthId}`,
                welcomeVersion: `v1-${monthId}`,
              },
            ]),
          ),
        }),
      )

      if (partData) {
        window.localStorage.setItem(
          partKey,
          JSON.stringify({
            schemaVersion: 2,
            data: partData,
          }),
        )
      }
    },
    [
      PROTOTYPE_STORAGE_KEY,
      MONTH_INTRO_STORAGE_KEY,
      PARTICIPATION_STORAGE_KEY,
      seenMonths,
      participationData,
    ] as const,
  )
}

async function tabTo(page: Page, target: Locator, maxSteps = 100): Promise<void> {
  for (let count = 0; count < maxSteps; count += 1) {
    if (await target.evaluate(element => element === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  throw new Error(
    `Could not reach ${await target.getAttribute('aria-label') ?? 'target control'} with Tab`,
  )
}

async function dismissIntroIfShown(page: Page, expectedHeading: string): Promise<void> {
  const introOrHeading = page
    .locator('.month-intro')
    .or(page.getByRole('heading', { level: 1, name: expectedHeading }))
  await expect(introOrHeading.first()).toBeVisible()
  if (await page.locator('.month-intro').isVisible()) {
    await page.getByRole('button', { name: /Close introduction/i }).click()
  }
  await expect(page.getByRole('heading', { level: 1, name: expectedHeading })).toBeVisible()
}

test.describe('Copper Meadow — Functional R06 Month Screen weekly agenda', () => {
  let uncaughtErrors: Error[] = []

  test.beforeEach(async ({ page }) => {
    uncaughtErrors = []
    page.on('pageerror', err => uncaughtErrors.push(err))
    await page.route('https://cdn.sanity.io/images/**', route =>
      route.fulfill({ status: 200, contentType: 'image/png', body: TINY_PNG_BUFFER }),
    )
  })

  test.afterEach(() => {
    expect(uncaughtErrors).toEqual([])
  })

  test('renders 28, 29, 30 (partial boundary weeks), and 31-day months as continuous Mon–Sun weekly agenda sections with no 7-column grid or padding', async ({
    page,
  }) => {
    await seedBaseState(page)

    const months: Record<string, ReturnType<typeof buildMonthDetail>> = {
      // Nov 2026 (30d): Nov 1 = Sun (1-day partial Week 1), Nov 30 = Mon (1-day partial Week 6)
      '2026-11': buildMonthDetail('2026-11', { phase: 'historical', title: 'November 2026 Boundary Weeks' }),
      // Feb 2098 (28d): Feb 1 = Sat (2-day partial Week 1), Feb 28 = Fri (5-day partial Week 5)
      '2098-02': buildMonthDetail('2098-02', { phase: 'historical', title: 'February 2098 Non-Leap' }),
      // Feb 2096 (29d): Feb 1 = Wed (5-day partial Week 1), Feb 29 = Wed (3-day partial Week 5)
      '2096-02': buildMonthDetail('2096-02', { phase: 'historical', title: 'February 2096 Leap Year' }),
      // Mar 2098 (31d): Mar 1 = Sat (2-day partial Week 1), Mar 31 = Mon (1-day partial Week 6)
      '2098-03': buildMonthDetail('2098-03', { phase: 'active', title: 'March 2098 Full Month' }),
    }

    await page.route('**/api/months/*/progress', route => {
      const ym = new URL(route.request().url()).pathname.split('/')[3]
      const m = months[ym]
      return route.fulfill({
        status: 200,
        json: {
          ok: true,
          serverContext: m.serverContext,
          monthId: ym,
          rosterVersion: 1,
          completedInMonthCount: 0,
          totalChallenges: m.month.totalChallenges,
          thematicEarnedCount: 0,
          thematicTotalCount: 1,
          discoveries: m.month.discoveries.map(d => ({ ...d, achievedCount: 0, isEarned: false })),
        },
      })
    })
    await page.route('**/api/months/*', route => {
      const ym = new URL(route.request().url()).pathname.split('/')[3]
      const m = months[ym]
      return m
        ? route.fulfill({ status: 200, json: m })
        : route.fulfill({ status: 404, json: { ok: false } })
    })

    const cases = [
      {
        ym: '2026-11',
        heading: 'November 2026 Boundary Weeks',
        days: 30,
        weekHeadings: [
          'Week 1 · Nov 1',
          'Week 2 · Nov 2–8',
          'Week 3 · Nov 9–15',
          'Week 4 · Nov 16–22',
          'Week 5 · Nov 23–29',
          'Week 6 · Nov 30',
        ],
        firstDateText: 'Sun, Nov 1, 2026',
        lastDateText: 'Mon, Nov 30, 2026',
      },
      {
        ym: '2098-02',
        heading: 'February 2098 Non-Leap',
        days: 28,
        weekHeadings: [
          'Week 1 · Feb 1–2',
          'Week 2 · Feb 3–9',
          'Week 3 · Feb 10–16',
          'Week 4 · Feb 17–23',
          'Week 5 · Feb 24–28',
        ],
        firstDateText: 'Sat, Feb 1, 2098',
        lastDateText: 'Fri, Feb 28, 2098',
      },
      {
        ym: '2096-02',
        heading: 'February 2096 Leap Year',
        days: 29,
        weekHeadings: [
          'Week 1 · Feb 1–5',
          'Week 2 · Feb 6–12',
          'Week 3 · Feb 13–19',
          'Week 4 · Feb 20–26',
          'Week 5 · Feb 27–29',
        ],
        firstDateText: 'Wed, Feb 1, 2096',
        lastDateText: 'Wed, Feb 29, 2096',
      },
      {
        ym: '2098-03',
        heading: 'March 2098 Full Month',
        days: 31,
        weekHeadings: [
          'Week 1 · Mar 1–2',
          'Week 2 · Mar 3–9',
          'Week 3 · Mar 10–16',
          'Week 4 · Mar 17–23',
          'Week 5 · Mar 24–30',
          'Week 6 · Mar 31',
        ],
        firstDateText: 'Sat, Mar 1, 2098',
        lastDateText: 'Mon, Mar 31, 2098',
      },
    ]

    // Verify at tablet-landscape / desktop width (1024px) that the layout is a vertical agenda, NEVER a 7-column grid
    await page.setViewportSize({ width: 1024, height: 768 })

    for (const c of cases) {
      await page.goto(`/#/month/${c.ym}`)
      await dismissIntroIfShown(page, c.heading)

      // No 7-column grid header, grid wrapper, or empty padding cells
      await expect(page.locator('.month-calendar__weekdays')).toHaveCount(0)
      await expect(page.locator('.month-week__grid')).toHaveCount(0)
      await expect(page.locator('.month-day-pad')).toHaveCount(0)

      // Every week rendered sequentially as its own labeled region with an ordered list
      const actualWeekHeadings = await page.locator('.month-week__title').allTextContents()
      expect(actualWeekHeadings).toEqual(c.weekHeadings)
      for (const weekHeading of c.weekHeadings) {
        const region = page.getByRole('region', { name: weekHeading })
        await expect(region).toBeVisible()
        await expect(region.locator('ol.month-week__agenda')).toHaveCount(1)
      }

      // All days of the month rendered simultaneously (no one-week pager)
      await expect(page.locator('.month-day')).toHaveCount(c.days)
      await expect(page.locator('.month-day__date').first()).toHaveText(c.firstDateText)
      await expect(page.locator('.month-day__date').last()).toHaveText(c.lastDateText)
      await expect(page.locator('.month-day__date').first()).toHaveAttribute('datetime', `${c.ym}-01`)

      // Vertical agenda geometry check on Week 2 (7 full days): every row sits strictly below the previous row
      const week2Rows = page.locator('.month-week').nth(1).locator('.month-day')
      await expect(week2Rows).toHaveCount(7)
      const boxes = await week2Rows.evaluateAll(nodes =>
        nodes.map(node => {
          const r = node.getBoundingClientRect()
          return { x: r.x, y: r.y, width: r.width, height: r.height }
        }),
      )
      for (let i = 1; i < boxes.length; i += 1) {
        expect(boxes[i].y, `${c.ym} Week 2 day ${i + 1} stacks below day ${i}`).toBeGreaterThanOrEqual(
          boxes[i - 1].y + boxes[i - 1].height - 1,
        )
        expect(Math.abs(boxes[i].x - boxes[i - 1].x)).toBeLessThanOrEqual(2)
      }
    }
  })

  test('shows complete titles and textual statuses for all 6 states, preserves direct entry, and keeps Coming Soon / Unavailable non-interactive and leak-free', async ({
    page,
  }) => {
    await seedBaseState(page, {
      participationData: {
        completedChallenges: {
          'cms:2098-03-day-01': { completedOn: '2098-03-01' },
          'cms:2098-03-day-06-withdrawn': { completedOn: '2098-03-06' },
        },
        inProgressChallenges: {
          'cms:2098-03-day-02': { screenId: 's1', updatedOn: '2098-03-02' },
          'cms:2098-03-day-03': { screenId: 's2', updatedOn: '2098-03-03' },
        },
        savedChallenges: {},
        savedScriptures: [],
        lastOpenedChallenge: {
          challengeId: 'cms:2098-03-day-03',
          openedOn: '2098-03-04',
        },
        earnedAwards: {},
      },
    })

    const challengeRequests: string[] = []
    await page.route('**/api/challenges/**', route => {
      challengeRequests.push(route.request().url())
      return route.fulfill({ status: 404, json: { ok: false } })
    })

    const marchPayload = buildMonthDetail('2098-03', {
      phase: 'active',
      title: 'March 2098 All States',
      slotOverrides: {
        1: {
          availability: 'available',
          title: 'Day 1 Finished Walk',
          slug: 'march-day-01-finished',
          challengeId: 'cms:2098-03-day-01',
        },
        2: {
          availability: 'available',
          title: 'Day 2 Earlier Pause',
          slug: 'march-day-02-paused',
          challengeId: 'cms:2098-03-day-02',
        },
        3: {
          availability: 'available',
          title: 'Day 3 Active Resume',
          slug: 'march-day-03-resume',
          challengeId: 'cms:2098-03-day-03',
        },
        4: {
          availability: 'available',
          title: LONG_AVAILABLE_TITLE,
          slug: 'march-day-04-long',
          challengeId: 'cms:2098-03-day-04',
        },
        5: {
          availability: 'comingSoon',
          title: LONG_COMING_SOON_TITLE,
        },
        6: {
          availability: 'unavailable',
          formerChallengeId: 'cms:2098-03-day-06-withdrawn',
        },
        7: {
          availability: 'unavailable',
        },
      },
    })

    await page.route('**/api/months/2098-03/progress', route =>
      route.fulfill({
        status: 200,
        json: {
          ok: true,
          serverContext: marchPayload.serverContext,
          monthId: '2098-03',
          rosterVersion: 1,
          completedInMonthCount: 2,
          totalChallenges: marchPayload.month.totalChallenges,
          thematicEarnedCount: 0,
          thematicTotalCount: 1,
          discoveries: marchPayload.month.discoveries.map(d => ({
            ...d,
            achievedCount: 0,
            isEarned: false,
          })),
        },
      }),
    )
    await page.route('**/api/months/2098-03', route =>
      route.fulfill({ status: 200, json: marchPayload }),
    )

    await page.goto('/#/month/2098-03')
    await expect(page.getByRole('heading', { level: 1, name: 'March 2098 All States' })).toBeVisible()

    // Verify all 6 status texts & accessible names
    const day1 = page.getByRole('button', {
      name: 'Sat, Mar 1, 2098: Day 1 Finished Walk, Completed',
    })
    const day2 = page.getByRole('button', {
      name: 'Sun, Mar 2, 2098: Day 2 Earlier Pause, In progress',
    })
    const day3 = page.getByRole('button', {
      name: 'Mon, Mar 3, 2098: Day 3 Active Resume, Continue',
    })
    const day4 = page.getByRole('button', {
      name: `Tue, Mar 4, 2098: ${LONG_AVAILABLE_TITLE}, Available`,
    })
    const day5 = page.getByRole('group', {
      name: `March 2098, Wed 5: ${LONG_COMING_SOON_TITLE}, Coming Soon. Not available to open.`,
    })
    const day6 = page.getByRole('group', {
      name: 'March 2098, Thu 6: Challenge unavailable, Unavailable. Previously completed. Not available to open.',
    })
    const day7 = page.getByRole('group', {
      name: 'March 2098, Fri 7: Challenge unavailable, Unavailable. Not available to open.',
    })

    await expect(day1.locator('.month-day__badge')).toHaveText('Completed')
    await expect(day2.locator('.month-day__badge')).toHaveText('In progress')
    await expect(day3.locator('.month-day__badge')).toHaveText('Continue')
    await expect(day4.locator('.month-day__badge')).toHaveText('Available')
    await expect(day4.locator('.month-day__title')).toHaveText(LONG_AVAILABLE_TITLE)

    await expect(day5).toHaveAttribute('aria-disabled', 'true')
    await expect(day5.locator('.month-day__badge')).toHaveText('Coming Soon')
    await expect(day5.locator('.month-day__title')).toHaveText(LONG_COMING_SOON_TITLE)
    await expect(day5.getByRole('button')).toHaveCount(0)
    await expect(day5.getByRole('link')).toHaveCount(0)

    await expect(day6).toHaveAttribute('aria-disabled', 'true')
    await expect(day6.locator('.month-day__badge')).toHaveText('Unavailable')
    await expect(day6.locator('.month-day__title')).toHaveText('Challenge unavailable')
    await expect(day6.locator('.month-day__note')).toHaveText('Previously completed')
    await expect(day6.getByRole('button')).toHaveCount(0)

    await expect(day7).toHaveAttribute('aria-disabled', 'true')
    await expect(day7.locator('.month-day__badge')).toHaveText('Unavailable')
    await expect(day7.locator('.month-day__title')).toHaveText('Challenge unavailable')
    await expect(day7.locator('.month-day__note')).toHaveCount(0)

    // Ensure non-interactive slots disclose no slugs, challenge IDs, or body text in DOM attributes
    const day5Html = await day5.evaluate(el => el.outerHTML)
    const day6Html = await day6.evaluate(el => el.outerHTML)
    expect(day5Html).not.toContain('march-day-05')
    expect(day6Html).not.toContain('withdrawn')

    // Clicking Coming Soon and Unavailable triggers zero navigation and zero challenge fetches
    await day5.click({ force: true })
    await day6.click({ force: true })
    await expect(page).toHaveURL(/#\/month\/2098-03$/)
    expect(challengeRequests).toEqual([])

    // Keyboard traversal skips locked days (5, 6, 7) and moves cleanly from Day 4 -> Day 8
    await tabTo(page, day1)
    await expect(day1).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(day2).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(day3).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(day4).toBeFocused()
    await page.keyboard.press('Tab')
    const day8 = page.getByRole('button', { name: 'Sat, Mar 8, 2098: Day 8 Reading, Available' })
    await expect(day8).toBeFocused()

    // Direct entry via keyboard Enter from Continue slot preserves existing route/origin behavior
    await day3.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/#\/challenge\/march-day-03-resume\?origin=month&yearMonth=2098-03/)
  })

  test('reflows without horizontal clipping at 320px, 375px, tablet portrait/landscape, 195px zoom width, and 200% root text size', async ({
    page,
  }) => {
    await seedBaseState(page)

    const marchPayload = buildMonthDetail('2098-03', {
      phase: 'active',
      title: 'A Long Monthly Theme Title for Responsive Agenda Verification Across Every Viewport',
      slotOverrides: {
        1: {
          availability: 'available',
          title: LONG_AVAILABLE_TITLE,
          slug: 'march-day-01-long',
          challengeId: 'cms:2098-03-day-01',
        },
        2: {
          availability: 'comingSoon',
          title: LONG_COMING_SOON_TITLE,
        },
      },
    })

    await page.route('**/api/months/2098-03/progress', route =>
      route.fulfill({
        status: 200,
        json: {
          ok: true,
          serverContext: marchPayload.serverContext,
          monthId: '2098-03',
          rosterVersion: 1,
          completedInMonthCount: 0,
          totalChallenges: marchPayload.month.totalChallenges,
          thematicEarnedCount: 0,
          thematicTotalCount: 1,
          discoveries: marchPayload.month.discoveries.map(d => ({
            ...d,
            achievedCount: 0,
            isEarned: false,
          })),
        },
      }),
    )
    await page.route('**/api/months/2098-03', route =>
      route.fulfill({ status: 200, json: marchPayload }),
    )

    await page.goto('/#/month/2098-03')
    await expect(page.locator('.month-day').first()).toBeVisible()

    const viewports = [
      { label: 'phone 320px', width: 320, height: 568 },
      { label: 'phone 375px', width: 375, height: 812 },
      { label: 'tablet portrait 768x1024', width: 768, height: 1024 },
      { label: 'tablet landscape 1024x768', width: 1024, height: 768 },
      { label: '200% zoom effective width 195px', width: 195, height: 844 },
    ]

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      const check = await page.evaluate(() => {
        const container = document.querySelector('.month-screen')?.getBoundingClientRect()
        const clippedNodes = [
          ...document.querySelectorAll('.month-screen .month-day, .month-screen .month-day__title, .month-screen .month-day__date, .month-screen h1'),
        ].filter(el => {
          const r = el.getBoundingClientRect()
          return r.width > 0 && container !== undefined && (r.left < container.left - 1 || r.right > container.right + 1)
        })
        return {
          viewportWidth: window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          clippedCount: clippedNodes.length,
        }
      })
      expect(check.scrollWidth, `no horizontal overflow at ${vp.label}`).toBeLessThanOrEqual(
        Math.max(check.viewportWidth, 320) + 1,
      )
      expect(check.clippedCount, `no clipped agenda nodes at ${vp.label}`).toBe(0)
    }

    // 200% root text scaling at phone (375px) and tablet portrait (768px)
    for (const width of [375, 768]) {
      await page.setViewportSize({ width, height: 844 })
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '200%'
      })
      const textScaleCheck = await page.evaluate(() => {
        const titleEl = document.querySelector('.month-day__title') as HTMLElement | null
        const dayEl = document.querySelector('.month-day') as HTMLElement | null
        const titleStyle = titleEl ? window.getComputedStyle(titleEl) : null
        const titleRect = titleEl?.getBoundingClientRect()
        const dayRect = dayEl?.getBoundingClientRect()
        return {
          scrollWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          computedFontPx: titleStyle ? parseFloat(titleStyle.fontSize) : 0,
          titleFitsRow:
            titleRect !== undefined
            && dayRect !== undefined
            && titleRect.right <= dayRect.right + 1
            && titleRect.height > (titleStyle ? parseFloat(titleStyle.fontSize) * 1.5 : 0),
        }
      })
      expect(textScaleCheck.computedFontPx, `title scales at 200% text (${width}px)`).toBeGreaterThanOrEqual(28)
      expect(textScaleCheck.scrollWidth, `no horizontal overflow at 200% text (${width}px)`).toBeLessThanOrEqual(
        textScaleCheck.viewportWidth + 1,
      )
      expect(textScaleCheck.titleFitsRow, `long title wraps inside row at 200% text (${width}px)`).toBe(true)
    }
  })

  test('preserves Feb 27 advance-preview restrictions, current/historical distinction, earned card opening, and loading/error/empty contexts', async ({
    page,
  }) => {
    const earnedCard = {
      cardDocumentId: 'card-copper-meadow',
      title: 'Steady Lamp',
      publicationYearMonth: '2098-03',
      imageUrl: CARD_IMAGE_URL,
      assetRevision: 'v1',
      illustrationAlt: 'Hand-drawn lamp illustration',
      accessibleTranscription: 'Psalm 119:105 transcription.',
      scripture: { book: 'Psalms', reference: 'Psalm 119:105', translation: 'WEBP' },
      attribution: 'Bibleberry',
      rightsStatus: 'approved-ministry-use',
      shareEligible: false,
    }

    await seedBaseState(page, {
      participationData: {
        completedChallenges: { 'cms:2098-03-day-01': { completedOn: '2098-03-01' } },
        inProgressChallenges: {},
        savedChallenges: {},
        savedScriptures: [],
        lastOpenedChallenge: null,
        earnedAwards: {
          'card:monthly:2098-03:light': {
            awardId: 'card:monthly:2098-03:light',
            kind: 'thematic',
            publicationYearMonth: '2098-03',
            discoveryId: 'discovery:2098-03:light',
            earnedOn: '2098-03-01',
            hubAnnouncementAcked: false,
            cardViewed: false,
            cardDocumentId: 'card-copper-meadow',
            earnedCard,
          },
        },
      },
    })

    let failDetailOnce = true
    let failProgressOnce = true
    let delayLoadingMonth = true
    const challengeRequests: string[] = []

    await page.route('**/api/challenges/**', route => {
      challengeRequests.push(route.request().url())
      return route.fulfill({ status: 404, json: { ok: false } })
    })

    await page.route('**/api/months/*/preview', route => {
      const ym = new URL(route.request().url()).pathname.split('/')[3]
      if (ym === '2098-04') {
        return route.fulfill({ status: 200, json: buildMonthPreview('2098-04', '2098-02-27') })
      }
      return route.fulfill({ status: 404, json: { ok: false } })
    })

    await page.route('**/api/months/*/progress', route => {
      const ym = new URL(route.request().url()).pathname.split('/')[3]
      if (ym === '2098-03' && failProgressOnce) {
        failProgressOnce = false
        return route.fulfill({ status: 500, json: { ok: false, error: 'Progress temporarily unavailable' } })
      }
      if (ym === '2098-05') {
        return route.fulfill({
          status: 200,
          json: {
            ok: true,
            serverContext: { authorizedLocalDate: '2098-05-05', effectiveTimeZone: 'America/New_York' },
            monthId: '2098-05',
            rosterVersion: 1,
            completedInMonthCount: 0,
            totalChallenges: 31,
            thematicEarnedCount: 0,
            thematicTotalCount: 0,
            discoveries: [],
          },
        })
      }
      return route.fulfill({
        status: 200,
        json: {
          ok: true,
          serverContext: { authorizedLocalDate: `${ym}-10`, effectiveTimeZone: 'America/New_York' },
          monthId: ym,
          rosterVersion: 1,
          completedInMonthCount: ym === '2098-03' ? 1 : 0,
          totalChallenges: daysInCivilMonth(ym),
          thematicEarnedCount: ym === '2098-03' ? 1 : 0,
          thematicTotalCount: 1,
          discoveries: [
            {
              discoveryId: `discovery:${ym}:light`,
              kind: 'thematic',
              title: 'Walking in Light',
              achievedCount: ym === '2098-03' ? 2 : 0,
              targetCount: 2,
              isEarned: ym === '2098-03',
              ...(ym === '2098-03' ? { awardId: 'card:monthly:2098-03:light', earnedCard } : {}),
            },
            {
              discoveryId: `discovery:${ym}:full-month`,
              kind: 'fullMonth',
              title: 'Full-Month Walk',
              achievedCount: ym === '2098-03' ? 1 : 0,
              targetCount: daysInCivilMonth(ym),
              isEarned: false,
            },
          ],
        },
      })
    })

    await page.route('**/api/months/*', async route => {
      const ym = new URL(route.request().url()).pathname.split('/')[3]
      if (ym === '2098-04') {
        return route.fulfill({ status: 404, json: { ok: false } })
      }
      if (ym === '2098-06') {
        return route.fulfill({ status: 200, json: { ok: true, invalid: true } })
      }
      if (ym === '2098-07') {
        return route.fulfill({ status: 404, json: { ok: false } })
      }
      if (ym === '2098-03' && failDetailOnce) {
        failDetailOnce = false
        return route.fulfill({ status: 500, json: { ok: false, error: 'Transient gateway error' } })
      }
      if (ym === '2098-05') {
        if (delayLoadingMonth) {
          delayLoadingMonth = false
          await new Promise(resolve => setTimeout(resolve, 250))
        }
        return route.fulfill({
          status: 200,
          json: buildMonthDetail('2098-05', {
            phase: 'historical',
            title: 'May 2098 No Discoveries',
            discoveries: [],
          }),
        })
      }
      return route.fulfill({
        status: 200,
        json: buildMonthDetail(ym, {
          phase: ym === '2098-03' ? 'active' : 'historical',
          title: ym === '2098-03' ? 'March 2098 Current' : `Historical ${ym}`,
        }),
      })
    })

    // 1. Advance Preview (Feb 27): weekly agenda visible, zero interactive day buttons, zero discoveries, zero ticker
    await page.goto('/#/month/2098-04')
    await expect(page.getByRole('heading', { level: 1, name: 'Upcoming 2098-04' })).toBeVisible()
    await expect(page.locator('.month-header .eyebrow')).toContainText('April 2098 · Advance Preview')
    await expect(page.getByRole('button', { name: 'Read Monthly Preview' })).toBeVisible()
    await expect(page.locator('.month-ticker')).toHaveCount(0)
    await expect(page.locator('.month-discoveries')).toHaveCount(0)
    await expect(page.locator('.month-day')).toHaveCount(30)
    await expect(page.locator('button.month-day')).toHaveCount(0)
    await page.locator('.month-day').first().click({ force: true })
    expect(challengeRequests).toEqual([])

    // 2. Network error -> Retry recovers Current Month; Progress error -> Retry recovers; Earned Card opens
    await page.goto('/#/month/2098-03')
    await expect(page.getByRole('alert')).toContainText('Unable to load Month')
    await page.getByRole('button', { name: 'Retry' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'March 2098 Current' })).toBeVisible()
    await expect(page.locator('.month-header .eyebrow')).toContainText('March 2098 · Current Month')
    await expect(page.locator('.month-discoveries__error')).toBeVisible()
    await page.locator('.month-discoveries__error').getByRole('button', { name: 'Retry' }).click()
    await expect(page.locator('.month-discoveries__error')).toHaveCount(0)
    await expect(page.locator('.month-ticker')).toContainText('1 of 31')

    // Earned thematic card opens and closes cleanly; unearned full-month stays last with zero artwork
    const discoveryHeadings = await page.locator('.month-discovery h3').allTextContents()
    expect(discoveryHeadings).toEqual(['Walking in Light', 'Full-Month Walk'])
    await expect(page.locator('.month-discovery').last().locator('img')).toHaveCount(0)
    const earnedCardBtn = page.getByRole('button', { name: /Open earned Scripture card: Steady Lamp/ })
    await earnedCardBtn.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(earnedCardBtn).toBeFocused()

    // 3. Loading state + Historical Month + Empty discoveries context
    await page.goto('/#/month/2098-05')
    await expect(page.getByText('Loading May 2098…')).toBeVisible()
    await dismissIntroIfShown(page, 'May 2098 No Discoveries')
    await expect(page.locator('.month-header .eyebrow')).toContainText('May 2098 · Historical Month')
    await expect(page.getByText('No monthly discoveries configured for this month.')).toBeVisible()
    await expect(page.locator('.month-day')).toHaveCount(31)

    // 4. Validation error context
    await page.goto('/#/month/2098-06')
    await expect(page.getByRole('alert')).toContainText('Month content unavailable')

    // 5. Not-found context
    await page.goto('/#/month/2098-07')
    await expect(page.getByRole('heading', { level: 2, name: 'Month unavailable' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Try Again' })).toBeVisible()
  })
})
