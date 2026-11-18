import { test, expect } from '../smoke/helpers/frameSafeTest'
import { createServer, type ViteDevServer } from 'vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PROTOTYPE_STORAGE_KEY = 'bibleberry-prototype-v1'

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

function buildNewsGatewayPayload(category?: string | null) {
  const allArticles = [
    {
      id: 'news-dec-preview',
      documentId: 'news-dec-preview',
      category: 'monthlyPreview',
      publishedOn: '2026-11-28',
      title: 'December 2026 Preview: Waiting in Hope',
      summary: 'A look ahead at December themes and upcoming daily titles.',
      destination: {
        kind: 'month',
        monthId: '2026-12',
      },
    },
    {
      id: 'news-ministry-update',
      documentId: 'news-ministry-update',
      category: 'ministryUpdate',
      publishedOn: '2026-11-15',
      title: 'Autumn Reading Rhythm Update',
      summary: 'New reflections added for ongoing study.',
    },
    {
      id: 'news-announcement',
      documentId: 'news-announcement',
      category: 'announcement',
      publishedOn: '2026-11-10',
      title: 'Winter Ministry Schedule',
      summary: 'Notes on upcoming ministry teaching releases.',
    },
  ]

  const articles = category
    ? allArticles.filter(article => article.category === category)
    : allArticles

  return {
    ok: true,
    serverContext: {
      authorizedLocalDate: '2026-11-28',
      effectiveTimeZone: 'America/New_York',
    },
    articles,
  }
}

function buildMonthPreviewDetailPayload(yearMonth: string) {
  const [yearStr, monthStr] = yearMonth.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const daysInMonth = 31

  const slots = Array.from({ length: daysInMonth }, (_, idx) => {
    const day = idx + 1
    const date = `${yearMonth}-${String(day).padStart(2, '0')}`
    return {
      dayOfMonth: day,
      date,
      availability: 'comingSoon' as const,
      title: `Day ${day}: Watchful Patience`,
    }
  })

  return {
    ok: true,
    serverContext: {
      authorizedLocalDate: '2026-11-28',
      effectiveTimeZone: 'America/New_York',
    },
    month: {
      monthId: yearMonth,
      documentId: `month-${yearMonth}`,
      year,
      month,
      daysInMonth,
      phase: 'advancePreview' as const,
      monthStartsOn: `${yearMonth}-01`,
      title: 'Waiting in Hope',
      subtitle: 'December 2026 Preview',
      introduction: {
        version: `v1-${yearMonth}`,
        previewScreens: [
          {
            id: `preview-1-${yearMonth}`,
            stepLabel: 'Preview',
            title: 'Entering Waiting in Hope',
            blocks: [
              {
                _key: `blk-p1-${yearMonth}`,
                _type: 'statementBlock',
                text: 'Advance preview overview for December 2026.',
              },
            ],
          },
        ],
      },
      slots,
    },
  }
}

async function startViteServer(envOverrides: Record<string, string>): Promise<{
  server: ViteDevServer
  baseUrl: string
}> {
  const previousEnv: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(envOverrides)) {
    previousEnv[key] = process.env[key]
    process.env[key] = value
  }

  const server = await createServer({
    root: repositoryRoot,
    configFile: resolve(repositoryRoot, 'vite.config.ts'),
    server: {
      port: 0,
      strictPort: false,
      host: '127.0.0.1',
    },
    logLevel: 'silent',
  })

  await server.listen()
  const address = server.httpServer?.address()
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind Vite dev server port')
  }

  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  }
}

test.describe('Ministry News App-Shell Integration (R11-2)', () => {
  test('supports entry from Today and More, returning to previous context, category filters, and retry', async ({ page }) => {
    const { server, baseUrl } = await startViteServer({
      VITE_ENABLE_NEWS_READER: 'true',
      VITE_ENABLE_MONTH_SCREEN: 'true',
    })

    try {
      let shouldFailNews = true

      await page.route('**/api/news**', async route => {
        const url = new URL(route.request().url())
        const category = url.searchParams.get('category')
        if (shouldFailNews) {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Temporary gateway error' }),
          })
          return
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(buildNewsGatewayPayload(category)),
        })
      })

      await page.addInitScript(
        ({ storageKey, state }) => {
          window.localStorage.setItem(storageKey, JSON.stringify(state))
        },
        { storageKey: PROTOTYPE_STORAGE_KEY, state: makeOnboardedState() },
      )

      await page.goto(baseUrl)

      // Existing primary tabs remain intact
      await expect(page.getByRole('button', { name: 'Today' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Foundations' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Archive' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'More' })).toBeVisible()

      // Modest Ministry News entry on Today opens #/news
      const newsEntryLink = page.getByRole('link', { name: 'Ministry News' })
      await expect(newsEntryLink).toBeVisible()
      await newsEntryLink.click()
      await expect(page).toHaveURL(/#\/news$/)

      // Retry after transient gateway error
      await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible({ timeout: 15000 })
      shouldFailNews = false
      await page.getByRole('button', { name: 'Retry' }).click()

      await expect(page.getByRole('heading', { name: 'Ministry News', level: 1 })).toBeVisible()
      await expect(page.getByText('December 2026 Preview: Waiting in Hope')).toBeVisible()
      await expect(page.getByText('Autumn Reading Rhythm Update')).toBeVisible()

      // Category filtering works
      await page.getByRole('tab', { name: 'Ministry Updates' }).click()
      await expect(page.getByText('Autumn Reading Rhythm Update')).toBeVisible()
      await expect(page.getByText('December 2026 Preview: Waiting in Hope')).toBeHidden()

      // Back returns to Today
      await page.getByRole('button', { name: 'Return to previous screen' }).click()
      await expect(page).not.toHaveURL(/#\/news/)
      await expect(page.getByRole('link', { name: 'Ministry News' })).toBeVisible()

      // Navigating to More and opening News returns to More on Back
      await page.getByRole('button', { name: 'More' }).click()
      await expect(page.getByRole('heading', { name: 'Make the space your own.' })).toBeVisible()
      await page.getByRole('link', { name: 'Ministry News' }).click()
      await expect(page).toHaveURL(/#\/news$/)
      await expect(page.getByRole('heading', { name: 'Ministry News', level: 1 })).toBeVisible()

      await page.getByRole('button', { name: 'Return to previous screen' }).click()
      await expect(page.getByRole('heading', { name: 'Make the space your own.' })).toBeVisible()
    } finally {
      await server.close()
    }
  })

  test('supports direct navigation, hard refresh, browser Back/Forward, and safe Month-preview destination', async ({ page }) => {
    const { server, baseUrl } = await startViteServer({
      VITE_ENABLE_NEWS_READER: 'true',
      VITE_ENABLE_MONTH_SCREEN: 'true',
    })

    try {
      await page.route('**/api/news**', async route => {
        const url = new URL(route.request().url())
        const category = url.searchParams.get('category')
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(buildNewsGatewayPayload(category)),
        })
      })

      await page.route('**/api/months/2026-12**', async route => {
        const url = route.request().url()
        if (url.includes('/preview')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(buildMonthPreviewDetailPayload('2026-12')),
          })
          return
        }
        if (url.includes('/progress')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ ok: true }),
          })
          return
        }
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, error: 'Month not released yet' }),
        })
      })

      await page.addInitScript(
        ({ storageKey, state }) => {
          window.localStorage.setItem(storageKey, JSON.stringify(state))
        },
        { storageKey: PROTOTYPE_STORAGE_KEY, state: makeOnboardedState() },
      )

      // Direct navigation with category query
      await page.goto(`${baseUrl}/#/news?category=monthlyPreview`)
      await expect(page.getByRole('heading', { name: 'Ministry News', level: 1 })).toBeVisible()
      await expect(page.getByRole('tab', { name: 'Monthly Previews' })).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByText('December 2026 Preview: Waiting in Hope')).toBeVisible()
      await expect(page.getByText('Autumn Reading Rhythm Update')).toBeHidden()

      // Hard refresh preserves #/news and category
      await page.reload()
      await expect(page.getByRole('heading', { name: 'Ministry News', level: 1 })).toBeVisible()
      await expect(page.getByText('December 2026 Preview: Waiting in Hope')).toBeVisible()

      // Safe Month-preview destination opens MonthScreenHost and returns to Ministry News
      await page.getByRole('link', { name: /Preview December 2026/i }).click()
      await expect(page).toHaveURL(/#\/month\/2026-12$/)
      await expect(page.getByRole('heading', { name: 'Entering Waiting in Hope' })).toBeVisible()

      // Browser Back returns to News, Forward returns to Month
      await page.goBack()
      await expect(page).toHaveURL(/#\/news/)
      await expect(page.getByRole('heading', { name: 'Ministry News', level: 1 })).toBeVisible()

      await page.goForward()
      await expect(page).toHaveURL(/#\/month\/2026-12$/)
      await expect(page.getByRole('heading', { name: 'Entering Waiting in Hope' })).toBeVisible()

      // Return to Ministry News from Month Screen preserves originating category deep link
      await page.getByRole('button', { name: 'View Preview Calendar' }).click()
      await page.getByRole('button', { name: 'Return to Ministry News' }).click()
      await expect(page).toHaveURL(/#\/news\?category=monthlyPreview$/)
      await expect(page.getByRole('heading', { name: 'Ministry News', level: 1 })).toBeVisible()
      await expect(page.getByRole('tab', { name: 'Monthly Previews' })).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByText('December 2026 Preview: Waiting in Hope')).toBeVisible()
      await expect(page.getByText('Autumn Reading Rhythm Update')).toBeHidden()
    } finally {
      await server.close()
    }
  })

  test('updates selected category on live hashchange and Back/Forward while News is mounted', async ({ page }) => {
    const { server, baseUrl } = await startViteServer({
      VITE_ENABLE_NEWS_READER: 'true',
      VITE_ENABLE_MONTH_SCREEN: 'true',
    })

    try {
      await page.route('**/api/news**', async route => {
        const url = new URL(route.request().url())
        const category = url.searchParams.get('category')
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(buildNewsGatewayPayload(category)),
        })
      })

      await page.addInitScript(
        ({ storageKey, state }) => {
          window.localStorage.setItem(storageKey, JSON.stringify(state))
        },
        { storageKey: PROTOTYPE_STORAGE_KEY, state: makeOnboardedState() },
      )

      await page.goto(`${baseUrl}/#/news?category=monthlyPreview`)
      await expect(page.getByRole('heading', { name: 'Ministry News', level: 1 })).toBeVisible({ timeout: 15000 })
      await expect(page.getByRole('tab', { name: 'Monthly Previews' })).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByText('December 2026 Preview: Waiting in Hope')).toBeVisible()

      // Live hashchange while NewsReaderHost remains mounted
      await page.evaluate(() => {
        window.location.hash = '#/news?category=announcement'
      })
      await expect(page).toHaveURL(/#\/news\?category=announcement$/)
      await expect(page.getByRole('tab', { name: 'Announcements' })).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByText('Winter Ministry Schedule')).toBeVisible()
      await expect(page.getByText('December 2026 Preview: Waiting in Hope')).toBeHidden()

      // Browser Back/Forward updates the active category in place
      await page.goBack()
      await expect(page).toHaveURL(/#\/news\?category=monthlyPreview$/)
      await expect(page.getByRole('tab', { name: 'Monthly Previews' })).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByText('December 2026 Preview: Waiting in Hope')).toBeVisible()
      await expect(page.getByText('Winter Ministry Schedule')).toBeHidden()

      await page.goForward()
      await expect(page).toHaveURL(/#\/news\?category=announcement$/)
      await expect(page.getByRole('tab', { name: 'Announcements' })).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByText('Winter Ministry Schedule')).toBeVisible()
    } finally {
      await server.close()
    }
  })

  test('fails closed on Month-preview destination when VITE_ENABLE_MONTH_SCREEN is disabled', async ({ page }) => {
    const { server, baseUrl } = await startViteServer({
      VITE_ENABLE_NEWS_READER: 'true',
      VITE_ENABLE_MONTH_SCREEN: 'false',
    })

    try {
      await page.route('**/api/news**', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(buildNewsGatewayPayload()),
        })
      })

      await page.addInitScript(
        ({ storageKey, state }) => {
          window.localStorage.setItem(storageKey, JSON.stringify(state))
        },
        { storageKey: PROTOTYPE_STORAGE_KEY, state: makeOnboardedState() },
      )

      await page.goto(`${baseUrl}/#/news`)
      await expect(page.getByRole('heading', { name: 'Ministry News', level: 1 })).toBeVisible({ timeout: 15000 })

      await page.getByRole('link', { name: /Preview December 2026/i }).click()
      await expect(page).toHaveURL(/#\/news$/)
      await expect(page.getByRole('heading', { name: 'Ministry News', level: 1 })).toBeVisible()
    } finally {
      await server.close()
    }
  })

  test('fails closed when VITE_ENABLE_NEWS_READER is disabled', async ({ page }) => {
    const { server, baseUrl } = await startViteServer({
      VITE_ENABLE_NEWS_READER: 'false',
    })

    try {
      await page.addInitScript(
        ({ storageKey, state }) => {
          window.localStorage.setItem(storageKey, JSON.stringify(state))
        },
        { storageKey: PROTOTYPE_STORAGE_KEY, state: makeOnboardedState() },
      )

      await page.goto(`${baseUrl}/#/news`)
      await expect(page.getByRole('heading', { name: 'Ministry News', level: 1 })).toHaveCount(0)
      await expect(page.getByRole('link', { name: 'Ministry News' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Today' })).toBeVisible()
    } finally {
      await server.close()
    }
  })

  test('supports 375px mobile layout and keyboard navigation without horizontal overflow', async ({ page }) => {
    const { server, baseUrl } = await startViteServer({
      VITE_ENABLE_NEWS_READER: 'true',
      VITE_ENABLE_MONTH_SCREEN: 'true',
    })

    try {
      await page.route('**/api/news**', async route => {
        const url = new URL(route.request().url())
        const category = url.searchParams.get('category')
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(buildNewsGatewayPayload(category)),
        })
      })

      await page.setViewportSize({ width: 375, height: 812 })
      await page.addInitScript(
        ({ storageKey, state }) => {
          window.localStorage.setItem(storageKey, JSON.stringify(state))
        },
        { storageKey: PROTOTYPE_STORAGE_KEY, state: makeOnboardedState() },
      )

      await page.goto(`${baseUrl}/#/news`)
      await expect(page.getByRole('heading', { name: 'Ministry News', level: 1 })).toBeVisible({ timeout: 15000 })

      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth + 1
      })
      expect(hasOverflow).toBe(false)

      // Keyboard navigation across category tabs
      const allTab = page.getByRole('tab', { name: 'All News' })
      await allTab.focus()
      await page.keyboard.press('ArrowRight')
      await expect(page.getByRole('tab', { name: 'Ministry Updates' })).toBeFocused()
      await expect(page.getByRole('tab', { name: 'Ministry Updates' })).toHaveAttribute('aria-selected', 'true')
    } finally {
      await server.close()
    }
  })
})
