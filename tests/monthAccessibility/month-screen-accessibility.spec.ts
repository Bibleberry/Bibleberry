import { test, expect } from '../smoke/helpers/frameSafeTest'
import type { Locator, Page } from '@playwright/test'

const PROTOTYPE_STORAGE_KEY = 'bibleberry-prototype-v1'
const PARTICIPATION_STORAGE_KEY = 'bibleberry-reader-participation-v1'
const MONTH_INTRO_STORAGE_KEY = 'bibleberry-month-intro-v1'
const CARD_IMAGE_URL = 'https://cdn.sanity.io/images/80016lrq/staging/month-accessibility-card.png'
const LONG_CHALLENGE_TITLE =
  'A deliberately long Challenge title for keyboard and narrow screen accessibility verification'
const LONG_MONTH_TITLE =
  'A long monthly theme about patient attention, careful listening, and the steady practice of hope'

function daysInMonth(yearMonth: string): number {
  const [year, month] = yearMonth.split('-').map(Number)
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function buildMonth(yearMonth: string) {
  const [year, month] = yearMonth.split('-').map(Number)
  const totalDays = daysInMonth(yearMonth)

  return {
    ok: true,
    serverContext: {
      authorizedLocalDate: `${yearMonth}-${String(totalDays).padStart(2, '0')}`,
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
      totalChallenges: totalDays - 1,
      title: yearMonth === '2098-03' ? LONG_MONTH_TITLE : `Theme for ${yearMonth}`,
      subtitle:
        'A monthly introduction with enough words to exercise narrow layouts, clear wrapping, and reachable actions.',
      introduction: {
        version: `v1-${yearMonth}`,
        previewScreens: [
          {
            id: `intro-${yearMonth}-1`,
            stepLabel: 'Overview',
            title: `Beginning ${yearMonth}`,
            blocks: [{ _key: `intro-${yearMonth}-block`, _type: 'statementBlock', text: 'Monthly introduction.' }],
          },
        ],
        welcomeScreen: {
          id: `welcome-${yearMonth}`,
          stepLabel: 'Welcome',
          title: `Welcome to ${yearMonth}`,
          ctaLabel: 'Begin the Month',
          blocks: [{ _key: `welcome-${yearMonth}-block`, _type: 'statementBlock', text: 'Welcome.' }],
        },
      },
      slots: Array.from({ length: totalDays }, (_, index) => {
        const dayOfMonth = index + 1
        const date = `${yearMonth}-${String(dayOfMonth).padStart(2, '0')}`

        if (dayOfMonth === 2) {
          return {
            dayOfMonth,
            date,
            availability: 'comingSoon' as const,
            title: 'A future Challenge',
          }
        }

        if (dayOfMonth === totalDays) {
          return { dayOfMonth, date, availability: 'unavailable' as const }
        }

        return {
          dayOfMonth,
          date,
          availability: 'available' as const,
          title: dayOfMonth === 1 ? LONG_CHALLENGE_TITLE : `Challenge ${dayOfMonth}`,
          slug: dayOfMonth === 1 ? 'keyboard-day' : `${yearMonth}-day-${dayOfMonth}`,
          challengeId: `cms:${yearMonth}-day-${dayOfMonth}`,
          challengeType: 'teaching' as const,
        }
      }),
      discoveries: [
        {
          discoveryId: `discovery:${yearMonth}:light`,
          kind: 'thematic' as const,
          title: 'A visible thematic goal',
          targetCount: 1,
        },
        {
          discoveryId: `discovery:${yearMonth}:full`,
          kind: 'fullMonth' as const,
          title: 'Full month goal',
          targetCount: totalDays - 1,
        },
      ],
    },
  }
}

const earnedCard = {
  cardDocumentId: 'card-month-accessibility',
  title: 'A Light for the Path',
  publicationYearMonth: '2098-03',
  imageUrl: CARD_IMAGE_URL,
  assetRevision: 'v1',
  illustrationAlt: 'A hand-drawn lamp on a path',
  accessibleTranscription: 'A Scripture card transcription for keyboard access.',
  scripture: { book: 'Psalms', reference: 'Psalm 119:105', translation: 'WEBP' },
  attribution: 'Bibleberry',
  rightsStatus: 'approved-ministry-use',
  shareEligible: false,
}

async function seedMonthState(page: Page): Promise<void> {
  await page.addInitScript(
    ([prototypeKey, introKey, participationKey, imageUrl]) => {
      window.localStorage.setItem(
        prototypeKey,
        JSON.stringify({
          onboarded: true,
          appearance: 'light',
          textSize: 'large',
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
            ['2098-02', '2098-03', '2098-04'].map(monthId => [
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

      window.localStorage.setItem(
        participationKey,
        JSON.stringify({
          schemaVersion: 2,
          data: {
            completedChallenges: {},
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
                cardDocumentId: 'card-month-accessibility',
                earnedCard: {
                  ...earnedCard,
                  imageUrl,
                },
              },
            },
          },
        }),
      )
    },
    [PROTOTYPE_STORAGE_KEY, MONTH_INTRO_STORAGE_KEY, PARTICIPATION_STORAGE_KEY, CARD_IMAGE_URL],
  )

  await page.route('**/api/months/**', route => {
    const url = new URL(route.request().url())
    const [, , , yearMonth, endpoint] = url.pathname.split('/')
    const month = buildMonth(yearMonth)

    if (endpoint === 'progress') {
      const monthData = month.month
      return route.fulfill({
        status: 200,
        json: {
          ok: true,
          serverContext: month.serverContext,
          monthId: yearMonth,
          rosterVersion: 1,
          completedInMonthCount: yearMonth === '2098-03' ? 1 : 0,
          totalChallenges: monthData.totalChallenges,
          thematicEarnedCount: 1,
          thematicTotalCount: 1,
          discoveries: [
            {
              discoveryId: `discovery:${yearMonth}:light`,
              kind: 'thematic',
              title: 'A visible thematic goal',
              achievedCount: 1,
              targetCount: 1,
              isEarned: true,
              ...(yearMonth === '2098-03'
                ? { awardId: 'card:monthly:2098-03:light', earnedCard }
                : {}),
            },
            {
              discoveryId: `discovery:${yearMonth}:full`,
              kind: 'fullMonth',
              title: 'Full month goal',
              achievedCount: 1,
              targetCount: monthData.totalChallenges,
              isEarned: false,
            },
          ],
        },
      })
    }

    return route.fulfill({ status: 200, json: month })
  })

  await page.route('**/api/challenges/keyboard-day', route =>
    route.fulfill({ status: 404, json: { ok: false } }),
  )
}

async function tabTo(page: Page, target: Locator): Promise<void> {
  for (let count = 0; count < 100; count += 1) {
    if (await target.evaluate(element => element === document.activeElement)) return
    await page.keyboard.press('Tab')
  }

  throw new Error(`Could not reach ${await target.getAttribute('aria-label') ?? 'the requested control'} with Tab`)
}

async function finishIntroIfShown(page: Page): Promise<void> {
  await expect(page.locator('.month-intro, .month-header h1').first()).toBeVisible()
  const intro = page.locator('.month-intro')
  for (let count = 0; count < 4 && await intro.isVisible(); count += 1) {
    const skipToWelcome = intro.getByRole('button', { name: 'Skip to Welcome' })
    const primaryButton = intro.locator('.month-intro__nav .button--primary')
    await tabTo(page, await skipToWelcome.isVisible() ? skipToWelcome : primaryButton)
    await page.keyboard.press('Enter')
  }
}

test('Month Screen keyboard path keeps meaningful focus and locked-day semantics', async ({ page }) => {
  await seedMonthState(page)
  await page.goto('/#/month/2098-03')

  await expect(page.getByRole('heading', { level: 1, name: LONG_MONTH_TITLE })).toBeVisible()
  await expect(page.getByRole('progressbar', { name: 'A visible thematic goal progress' })).toHaveAttribute(
    'aria-valuetext',
    '1 of 1',
  )
  await expect(
    page.getByRole('group', { name: /March 2098.*Sun 2: A future Challenge, Coming Soon.*not available to open/i }),
  ).toHaveAttribute('aria-disabled', 'true')

  const comingSoonGroup = page.getByRole('group', {
    name: /March 2098.*Sun 2: A future Challenge, Coming Soon.*not available to open/i,
  })
  await expect(comingSoonGroup.getByRole('button')).toHaveCount(0)
  await expect(comingSoonGroup.getByRole('link')).toHaveCount(0)
  const unavailableGroup = page.getByRole('group', {
    name: /March 2098.*Mon 31: Challenge unavailable, Unavailable.*not available to open/i,
  })
  await expect(unavailableGroup).toHaveAttribute('aria-disabled', 'true')
  await expect(unavailableGroup.getByRole('button')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Week 1 · Mar 1–2' })).toContainText('A future Challenge')

  const unearnedGoal = page.locator('.month-discovery').last()
  await expect(unearnedGoal).toContainText('Full month goal')
  await expect(unearnedGoal.locator('img')).toHaveCount(0)
  await expect(unearnedGoal.getByRole('button')).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)

  const previousMonth = page.getByRole('button', { name: '2098-02' })
  await tabTo(page, previousMonth)
  await page.keyboard.press('Enter')
  await finishIntroIfShown(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Theme for 2098-02' })).toBeVisible()

  const nextMonth = page.getByRole('button', { name: '2098-03' })
  await tabTo(page, nextMonth)
  await page.keyboard.press('Enter')
  await finishIntroIfShown(page)
  await expect(page.getByRole('heading', { level: 1, name: LONG_MONTH_TITLE })).toBeVisible()

  const monthInput = page.getByRole('textbox', { name: 'Jump to month' })
  await tabTo(page, monthInput)
  await monthInput.fill('2098-04')
  const jumpButton = page.getByRole('button', { name: 'Go', exact: true })
  await tabTo(page, jumpButton)
  await expect(jumpButton).toBeFocused()
  await page.keyboard.press('Enter')
  await finishIntroIfShown(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Theme for 2098-04' })).toBeVisible()

  const returnToMarch = page.getByRole('button', { name: '2098-03' })
  await tabTo(page, returnToMarch)
  await page.keyboard.press('Enter')
  await finishIntroIfShown(page)
  await expect(page.getByRole('heading', { level: 1, name: LONG_MONTH_TITLE })).toBeVisible()

  const replayIntro = page.getByRole('button', { name: 'Read Monthly Introduction' })
  await tabTo(page, replayIntro)
  await page.keyboard.press('Enter')
  const introHeading = page.getByRole('heading', { level: 1, name: 'Beginning 2098-03' })
  await expect(introHeading).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome to 2098-03' })).toBeFocused()
  await tabTo(page, page.getByRole('button', { name: 'Begin the Month' }))
  await page.keyboard.press('Enter')
  const monthHeading = page.getByRole('heading', { level: 1, name: LONG_MONTH_TITLE })
  await expect(monthHeading).toBeFocused()

  await tabTo(page, replayIntro)
  await page.keyboard.press('Enter')
  await expect(introHeading).toBeFocused()
  await tabTo(page, page.getByRole('button', { name: 'Close introduction' }))
  await page.keyboard.press('Enter')
  await expect(monthHeading).toBeFocused()

  const challenge = page.getByRole('button', { name: new RegExp(LONG_CHALLENGE_TITLE) })
  await tabTo(page, challenge)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#\/challenge\/keyboard-day\?origin=month&yearMonth=2098-03/)

  await page.goto('/#/month/2098-03')
  const earnedCardButton = page.getByRole('button', { name: /Open earned Scripture card: A Light for the Path/ })
  await tabTo(page, earnedCardButton)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(earnedCardButton).toBeFocused()
})

test('Month Screen and introduction reflow at phone and 200% effective zoom widths', async ({ page }) => {
  await seedMonthState(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#/month/2098-03')

  const widths = [390, 320, 195]
  for (const width of widths) {
    await page.setViewportSize({ width, height: 844 })
    await expect(page.getByRole('heading', { level: 1, name: LONG_MONTH_TITLE })).toBeVisible()

    const layout = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      minimumPageWidth: 320,
      outOfBounds: [...document.querySelectorAll('.month-screen button, .month-screen input, .month-screen h1')]
        .some(element => {
          const rect = element.getBoundingClientRect()
          const page = document.querySelector('.month-screen')?.getBoundingClientRect()
          return rect.width > 0 && page !== undefined && (rect.left < page.left || rect.right > page.right + 1)
        }),
    }))
    expect(layout.documentWidth, `horizontal overflow at ${width}px effective viewport`).toBeLessThanOrEqual(
      Math.max(layout.viewportWidth, layout.minimumPageWidth) + 1,
    )
    expect(layout.outOfBounds, `Month Screen content clipped at ${width}px effective viewport`).toBe(false)
  }

  await page.setViewportSize({ width: 195, height: 844 })
  await page.getByRole('button', { name: 'Read Monthly Introduction' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Beginning 2098-03' })).toBeFocused()

  const introLayout = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    minimumPageWidth: 320,
    outOfBounds: [...document.querySelectorAll('.month-intro button, .month-intro h1')]
      .some(element => {
        const rect = element.getBoundingClientRect()
        const page = document.querySelector('.month-intro')?.getBoundingClientRect()
        return rect.width > 0 && page !== undefined && (rect.left < page.left || rect.right > page.right + 1)
      }),
  }))
  expect(introLayout.documentWidth).toBeLessThanOrEqual(
    Math.max(introLayout.viewportWidth, introLayout.minimumPageWidth) + 1,
  )
  expect(introLayout.outOfBounds).toBe(false)
})
