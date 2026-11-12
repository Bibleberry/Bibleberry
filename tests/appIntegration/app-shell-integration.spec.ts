import { test, expect } from '../smoke/helpers/frameSafeTest'
import { createServer, type ViteDevServer } from 'vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PROTOTYPE_STORAGE_KEY = 'bibleberry-prototype-v1'
const PARTICIPATION_STORAGE_KEY = 'bibleberry-reader-participation-v1'
const PREFS_STORAGE_KEY = 'bibleberry-card-announcement-prefs-v1'

const TINY_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aW0cAAAAASUVORK5CYII=',
  'base64',
)

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

function makeSampleParticipationEnvelope(options?: {
  cardViewed?: boolean
  hubAnnouncementAcked?: boolean
}) {
  return {
    schemaVersion: 2,
    data: {
      completedChallenges: {
        'cms:challenge-nov-08': {
          completedOn: '2026-11-08',
        },
      },
      inProgressChallenges: {},
      savedChallenges: {},
      savedScriptures: [
        {
          key: 'psalm 119:105|webp',
          reference: 'Psalm 119:105',
          translation: 'WEBP',
          savedOn: '2026-11-08',
          sourceChallengeId: 'cms:challenge-nov-08',
        },
        {
          key: 'john 4:14|webp',
          reference: 'John 4:14',
          translation: 'WEBP',
          savedOn: '2026-11-09',
          sourceChallengeId: 'cms:challenge-nov-09',
        },
      ],
      lastOpenedChallenge: null,
      earnedAwards: {
        'card:monthly:2026-11:light-path': {
          awardId: 'card:monthly:2026-11:light-path',
          discoveryId: 'discovery:2026-11:light-path',
          earnedOn: '2026-11-08',
          cardViewed: options?.cardViewed ?? false,
          hubAnnouncementAcked: options?.hubAnnouncementAcked ?? false,
          cardDocumentId: 'card-2026-11-light-path',
          earnedCard: {
            cardDocumentId: 'card-2026-11-light-path',
            title: 'A Light for the Path',
            publicationYearMonth: '2026-11',
            imageUrl: 'https://cdn.sanity.io/images/80016lrq/staging/card-light-path.png',
            assetRevision: 'v1',
            illustrationAlt: 'Hand-drawn oil lamp beside an open scroll',
            accessibleTranscription:
              'Psalm 119:105 (WEBP) — Your word is a lamp to my feet, and a light for my path.',
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
      },
    },
  }
}

let enabledServer: ViteDevServer | null = null
let disabledServer: ViteDevServer | null = null
let enabledBaseUrl = ''
let disabledBaseUrl = ''

test.beforeAll(async () => {
  // Server with integration flags ENABLED
  enabledServer = await createServer({
    configFile: resolve(repositoryRoot, 'vite.config.ts'),
    root: repositoryRoot,
    define: {
      'import.meta.env.VITE_ENABLE_FIELD_NOTEBOOK': JSON.stringify('true'),
      'import.meta.env.VITE_ENABLE_SAVED_SCRIPTURE': JSON.stringify('true'),
      'import.meta.env.VITE_ENABLE_HUB_CARD_ANNOUNCEMENTS': JSON.stringify('true'),
    },
    server: {
      host: '127.0.0.1',
      port: 0,
      strictPort: false,
    },
    logLevel: 'silent',
  })
  await enabledServer.listen()
  const enabledAddr = enabledServer.httpServer?.address()
  if (!enabledAddr || typeof enabledAddr === 'string') {
    throw new Error('Failed to start enabled Vite dev server')
  }
  enabledBaseUrl = `http://127.0.0.1:${enabledAddr.port}/`

  // Server with integration flags DISABLED
  disabledServer = await createServer({
    configFile: resolve(repositoryRoot, 'vite.config.ts'),
    root: repositoryRoot,
    define: {
      'import.meta.env.VITE_ENABLE_FIELD_NOTEBOOK': JSON.stringify('false'),
      'import.meta.env.VITE_ENABLE_SAVED_SCRIPTURE': JSON.stringify('false'),
      'import.meta.env.VITE_ENABLE_HUB_CARD_ANNOUNCEMENTS': JSON.stringify('false'),
    },
    server: {
      host: '127.0.0.1',
      port: 0,
      strictPort: false,
    },
    logLevel: 'silent',
  })
  await disabledServer.listen()
  const disabledAddr = disabledServer.httpServer?.address()
  if (!disabledAddr || typeof disabledAddr === 'string') {
    throw new Error('Failed to start disabled Vite dev server')
  }
  disabledBaseUrl = `http://127.0.0.1:${disabledAddr.port}/`
})

test.afterAll(async () => {
  await enabledServer?.close()
  await disabledServer?.close()
  enabledServer = null
  disabledServer = null
})

test.describe('Issue #132: Controlled App-Shell Integration', () => {
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

  test('Field Notebook route, provisional entry bar, New indicator clearing, card viewer, and return navigation', async ({
    page,
  }) => {
    await page.addInitScript(
      ({ protoKey, partKey, protoState, partData }) => {
        window.localStorage.setItem(protoKey, JSON.stringify(protoState))
        window.localStorage.setItem(partKey, JSON.stringify(partData))
      },
      {
        protoKey: PROTOTYPE_STORAGE_KEY,
        partKey: PARTICIPATION_STORAGE_KEY,
        protoState: makeOnboardedState(),
        // Award earned, announcement acknowledged so modal does not block, but cardViewed is false
        partData: makeSampleParticipationEnvelope({ cardViewed: false, hubAnnouncementAcked: true }),
      },
    )

    await page.goto(enabledBaseUrl)

    // Verify Provisional entry bar is visible on Hub
    const entryBar = page.getByRole('complementary', { name: 'Provisional collections integration' })
    await expect(entryBar).toBeVisible()

    // Has "New" indicator on Field Notebook button
    const notebookBtn = entryBar.getByRole('link', { name: /Field Notebook/i })
    await expect(notebookBtn).toBeVisible()
    await expect(notebookBtn.getByText('New')).toBeVisible()

    // Tap Field Notebook
    await notebookBtn.click()

    // Verify route and Field Notebook view rendered
    await expect(page).toHaveURL(/#\/notebook/)
    await expect(page.getByRole('heading', { name: 'Earned Scripture Cards', exact: true })).toBeVisible()

    // Switch to All Earned Cards
    await page.getByRole('button', { name: 'All Earned Cards' }).click()
    await expect(page.getByText('A Light for the Path')).toBeVisible()

    // Card should still show its individual "New" badge inside the notebook
    const cardItem = page.getByRole('button', { name: /A Light for the Path/i })
    await expect(cardItem).toBeVisible()
    await expect(cardItem.getByText('New', { exact: true })).toBeVisible()

    // Open the card in the viewer
    await cardItem.click()
    await expect(page.getByRole('dialog', { name: /A Light for the Path/i })).toBeVisible()

    // Close the card viewer
    const closeViewerBtn = page.getByRole('button', { name: /Close Scripture card/i })
    await closeViewerBtn.click()

    // Click Return to Today
    const returnBtn = page.getByRole('button', { name: /Return to Today/i })
    await expect(returnBtn).toBeVisible()
    await returnBtn.click()

    // Returned to Hub
    await expect(page).not.toHaveURL(/#\/notebook/)
    await expect(entryBar).toBeVisible()

    // Hub "New" indicator should now be cleared
    await expect(notebookBtn.getByText('New')).not.toBeVisible()

    // Verify durable store has cardViewed set to true
    const updatedStore = await page.evaluate(key => {
      const raw = window.localStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    }, PARTICIPATION_STORAGE_KEY)
    expect(updatedStore.data.earnedAwards['card:monthly:2026-11:light-path'].cardViewed).toBe(true)
  })

  test('Saved Scripture route, provisional entry bar, removal, persistence, and return navigation', async ({
    page,
  }) => {
    await page.addInitScript(
      ({ protoKey, partKey, protoState, partData }) => {
        window.localStorage.setItem(protoKey, JSON.stringify(protoState))
        window.localStorage.setItem(partKey, JSON.stringify(partData))
      },
      {
        protoKey: PROTOTYPE_STORAGE_KEY,
        partKey: PARTICIPATION_STORAGE_KEY,
        protoState: makeOnboardedState(),
        partData: makeSampleParticipationEnvelope({ cardViewed: true, hubAnnouncementAcked: true }),
      },
    )

    await page.goto(enabledBaseUrl)

    const entryBar = page.getByRole('complementary', { name: 'Provisional collections integration' })
    const savedScriptureBtn = entryBar.getByRole('link', { name: /Saved Scripture/i })
    await expect(savedScriptureBtn).toBeVisible()

    // Tap Saved Scripture
    await savedScriptureBtn.click()

    // Verify route and view
    await expect(page).toHaveURL(/#\/saved-scripture/)
    await expect(page.getByRole('heading', { name: 'Saved Scripture', exact: true })).toBeVisible()
    await expect(page.getByText('Psalm 119:105')).toBeVisible()
    await expect(page.getByText('John 4:14')).toBeVisible()

    // Click remove on Psalm 119:105
    const removeBtn = page.getByRole('button', { name: /Remove Psalm 119:105/i })
    await removeBtn.click()

    // Confirm dialog
    const confirmDialog = page.getByRole('alertdialog', { name: /Remove Psalm 119:105/i })
    await expect(confirmDialog).toBeVisible()
    await confirmDialog.getByRole('button', { name: 'Remove reference' }).click()

    // Item is removed from view (card list no longer contains Psalm 119:105)
    await expect(page.locator('.saved-scripture-card', { hasText: 'Psalm 119:105' })).not.toBeVisible()
    await expect(page.locator('.saved-scripture-card', { hasText: 'John 4:14' })).toBeVisible()

    // Return to Today
    const returnBtn = page.getByRole('button', { name: /Return to Today/i })
    await returnBtn.click()
    await expect(page).not.toHaveURL(/#\/saved-scripture/)

    // Verify store has removed scripture without touching completed challenges or earned awards
    const updatedStore = await page.evaluate(key => {
      const raw = window.localStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    }, PARTICIPATION_STORAGE_KEY)
    const remainingKeys = updatedStore.data.savedScriptures.map((s: { key: string }) => s.key)
    expect(remainingKeys).not.toContain('psalm 119:105|webp')
    expect(remainingKeys).toContain('john 4:14|webp')
    expect(updatedStore.data.completedChallenges['cms:challenge-nov-08']).toBeDefined()
    expect(updatedStore.data.earnedAwards['card:monthly:2026-11:light-path']).toBeDefined()
  })

  test('Hub-only combined earned-card announcements: mounts only on Hub arrival, honors open in notebook, respects opt-out', async ({
    page,
  }) => {
    // Seed unannounced award
    await page.addInitScript(
      ({ protoKey, partKey, protoState, partData }) => {
        window.localStorage.setItem(protoKey, JSON.stringify(protoState))
        window.localStorage.setItem(partKey, JSON.stringify(partData))
      },
      {
        protoKey: PROTOTYPE_STORAGE_KEY,
        partKey: PARTICIPATION_STORAGE_KEY,
        protoState: makeOnboardedState(),
        partData: makeSampleParticipationEnvelope({ cardViewed: false, hubAnnouncementAcked: false }),
      },
    )

    // Arrive at Hub -> announcement modal should appear!
    await page.goto(enabledBaseUrl)

    const announcementDialog = page.getByRole('dialog', { name: /New Scripture Card Earned/i })
    await expect(announcementDialog).toBeVisible()
    await expect(announcementDialog.getByRole('heading', { name: 'A Light for the Path' })).toBeVisible()

    // Click "Open in Field Notebook"
    const openNotebookBtn = announcementDialog.getByRole('button', {
      name: /Open in Field Notebook/i,
    })
    await expect(openNotebookBtn).toBeVisible()
    await openNotebookBtn.click()

    // Dialog closes and navigates to Notebook
    await expect(announcementDialog).not.toBeVisible()
    await expect(page).toHaveURL(/#\/notebook/)
    await expect(page.getByRole('heading', { name: 'Earned Scripture Cards', exact: true })).toBeVisible()

    // Verify announcement is now acknowledged in store
    const updatedStore = await page.evaluate(key => {
      const raw = window.localStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    }, PARTICIPATION_STORAGE_KEY)
    expect(updatedStore.data.earnedAwards['card:monthly:2026-11:light-path'].hubAnnouncementAcked).toBe(
      true,
    )

    // Return to Today -> announcement dialog should NOT appear again
    await page.getByRole('button', { name: /Return to Today/i }).click()
    await expect(announcementDialog).not.toBeVisible()

    // Now test Opt-Out preference: navigate to More -> Appearance
    await page.getByRole('button', { name: 'More' }).click()
    await page.getByRole('button', { name: /Appearance & reading/i }).click()

    // Toggle off announcements
    const switchBtn = page.getByRole('switch', {
      name: /Earned Scripture Card announcements/i,
    })
    await expect(switchBtn).toBeVisible()
    await expect(switchBtn).toHaveAttribute('aria-checked', 'true')
    await switchBtn.click()
    await expect(switchBtn).toHaveAttribute('aria-checked', 'false')

    // Add another unannounced award to store
    await page.evaluate(key => {
      const raw = window.localStorage.getItem(key)
      const data = raw ? JSON.parse(raw) : {}
      data.data.earnedAwards['card:monthly:2026-11:another-card'] = {
        awardId: 'card:monthly:2026-11:another-card',
        discoveryId: 'discovery:2026-11:another',
        earnedOn: '2026-11-09',
        cardViewed: false,
        hubAnnouncementAcked: false,
        cardDocumentId: 'card-2026-11-another',
        earnedCard: {
          cardDocumentId: 'card-2026-11-another',
          title: 'Another Card',
          publicationYearMonth: '2026-11',
          imageUrl: 'https://cdn.sanity.io/images/80016lrq/staging/card-another.png',
          assetRevision: 'v1',
          illustrationAlt: 'Another card',
          accessibleTranscription: 'Another verse',
          scripture: { book: 'John', reference: 'John 1:1', translation: 'WEBP' },
          attribution: 'Alexis Waid',
          rightsStatus: 'approved-ministry-use',
          shareEligible: true,
          theologicalThemes: ['Light'],
        },
      }
      window.localStorage.setItem(key, JSON.stringify(data))
    }, PARTICIPATION_STORAGE_KEY)

    // Return to Today (Hub) -> With announcements toggled off, NO dialog opens!
    await page.getByRole('button', { name: 'Today' }).click()
    await expect(announcementDialog).not.toBeVisible()
  })

  test('Feature gates disabled: direct routes fail closed and no provisional bar renders', async ({
    page,
  }) => {
    await page.addInitScript(
      ({ protoKey, partKey, protoState, partData }) => {
        window.localStorage.setItem(protoKey, JSON.stringify(protoState))
        window.localStorage.setItem(partKey, JSON.stringify(partData))
      },
      {
        protoKey: PROTOTYPE_STORAGE_KEY,
        partKey: PARTICIPATION_STORAGE_KEY,
        protoState: makeOnboardedState(),
        partData: makeSampleParticipationEnvelope({ cardViewed: false, hubAnnouncementAcked: false }),
      },
    )

    // On disabled build, visit #/notebook directly
    await page.goto(`${disabledBaseUrl}#/notebook`)

    // Should NOT show Field Notebook heading; stays on standard Today page
    await expect(page.getByRole('heading', { name: 'Earned Scripture Cards' })).not.toBeVisible()
    await expect(
      page.getByRole('complementary', { name: 'Provisional collections integration' }),
    ).not.toBeVisible()

    // Visit #/saved-scripture directly
    await page.goto(`${disabledBaseUrl}#/saved-scripture`)
    await expect(page.getByRole('heading', { name: 'Saved Scripture' })).not.toBeVisible()
  })

  test('Direct URL reload persistence and browser back/forward history navigation', async ({
    page,
  }) => {
    await page.addInitScript(
      ({ protoKey, partKey, protoState, partData }) => {
        window.localStorage.setItem(protoKey, JSON.stringify(protoState))
        window.localStorage.setItem(partKey, JSON.stringify(partData))
      },
      {
        protoKey: PROTOTYPE_STORAGE_KEY,
        partKey: PARTICIPATION_STORAGE_KEY,
        protoState: makeOnboardedState(),
        partData: makeSampleParticipationEnvelope({ cardViewed: true, hubAnnouncementAcked: true }),
      },
    )

    // Direct reload on #/notebook
    await page.goto(`${enabledBaseUrl}#/notebook`)
    await expect(page.getByRole('heading', { name: 'Earned Scripture Cards', exact: true })).toBeVisible()

    // Reload page
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Earned Scripture Cards', exact: true })).toBeVisible()

    // Navigate to Saved Scripture via hash change
    await page.evaluate(() => {
      window.location.hash = '#/saved-scripture'
    })
    await expect(page.getByRole('heading', { name: 'Saved Scripture', exact: true })).toBeVisible()

    // Browser back button -> restores Field Notebook
    await page.goBack()
    await expect(page.getByRole('heading', { name: 'Earned Scripture Cards', exact: true })).toBeVisible()

    // Browser forward button -> restores Saved Scripture
    await page.goForward()
    await expect(page.getByRole('heading', { name: 'Saved Scripture', exact: true })).toBeVisible()
  })

  test('Narrow viewport (375px) layout and keyboard accessibility', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.addInitScript(
      ({ protoKey, partKey, protoState, partData }) => {
        window.localStorage.setItem(protoKey, JSON.stringify(protoState))
        window.localStorage.setItem(partKey, JSON.stringify(partData))
      },
      {
        protoKey: PROTOTYPE_STORAGE_KEY,
        partKey: PARTICIPATION_STORAGE_KEY,
        protoState: makeOnboardedState(),
        partData: makeSampleParticipationEnvelope({ cardViewed: true, hubAnnouncementAcked: true }),
      },
    )

    await page.goto(`${enabledBaseUrl}#/notebook`)
    await expect(page.getByRole('heading', { name: 'Earned Scripture Cards', exact: true })).toBeVisible()

    // Focus return button and press Enter
    const returnBtn = page.getByRole('button', { name: /Return to Today/i })
    await returnBtn.focus()
    await expect(returnBtn).toBeFocused()
    await page.keyboard.press('Enter')

    // Returned to Hub
    await expect(page).not.toHaveURL(/#\/notebook/)
  })
})
