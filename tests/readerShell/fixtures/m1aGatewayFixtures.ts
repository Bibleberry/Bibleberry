import type { GatewayEarnedScriptureCardInput } from '../../../src/participation/awards.ts'

/**
 * Clover Compass (Issue #308 / WP-09a):
 * Reusable deterministic synthetic gateway-authorized fixtures and durable guest-storage
 * seed builders for the R06 M1a connected reader acceptance harness.
 *
 * Design invariants:
 * - Zero `@playwright/test` imports so deterministic Node unit tests (`npm run test:reader-shell`)
 *   can validate every synthetic payload directly against production gateway providers.
 * - Uses approved gateway response shapes (`serverContext.authorizedLocalDate`, canonical `cms:<id>`,
 *   privacy-safe unearned discoveries, schema-validated earned Card snapshots).
 * - Uses clearly labeled synthetic placeholder strings (`referenceOnly` Scripture references);
 *   never invents theological manuscripts, Bible passage text, editorial approvals, or live URLs.
 */

export const navigationKey = 'bibleberry-r06-navigation-v1'
export const participationKey = 'bibleberry-reader-participation-v1'
export const shelfKey = 'bibleberry-guest-shelf-v1'
export const monthIntroKey = 'bibleberry-month-intro-v1'
export const readerProfileKey = 'bibleberry-reader-profile-v1'

export const monthId = '2026-10'
export const monthTitle = 'October test publication'
export const teachingSlug = 'test-challenge-25'
export const documentId = 'october-reading-25'

export const currentMonthId = '2026-11'
export const currentMonthTitle = 'November test publication'
export const todayDate = '2026-11-15'
export const todayDay = 15
export const todaySlug = 'november-challenge-15'
export const todayDocumentId = 'november-reading-15'

export const currentMonthMultiScreenDay = 14
export const currentMonthMultiScreenSlug = 'november-challenge-14'
export const currentMonthMultiScreenDocumentId = 'november-reading-14'

export const unreleasedFutureDay = 16
export const unreleasedFutureSlug = 'november-challenge-16'
export const unreleasedFutureDocumentId = 'november-reading-16'

export interface SyntheticServerContext {
  readonly authorizedLocalDate: string
  readonly effectiveTimeZone: string
}

export const serverContext: SyntheticServerContext = Object.freeze({
  authorizedLocalDate: todayDate,
  effectiveTimeZone: 'America/New_York',
})

export const awardId = `card:monthly:${monthId}:october-reading` as const
export const discovery = Object.freeze({
  discoveryId: `discovery:${monthId}:october-reading`,
  title: 'October reading',
  kind: 'thematic' as const,
  targetCount: 1,
})

export const currentThematicAwardId = `card:monthly:${currentMonthId}:november-reading` as const
export const currentFullMonthAwardId = `card:monthly:${currentMonthId}:full-month` as const

export const currentThematicDiscovery = Object.freeze({
  discoveryId: `discovery:${currentMonthId}:november-reading`,
  title: 'November reading',
  kind: 'thematic' as const,
  targetCount: 1,
})

export const currentFullMonthDiscovery = Object.freeze({
  discoveryId: `discovery:${currentMonthId}:full-month`,
  title: 'Complete November Study',
  kind: 'fullMonth' as const,
  targetCount: 30,
})

export const currentThematicCardImageUrl =
  'https://cdn.sanity.io/images/80016lrq/staging/m1a-november-card-800x1000.svg'

export const SYNTHETIC_CARD_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="100" viewBox="0 0 80 100"><rect width="80" height="100" fill="#e5e7eb"/></svg>'

export const currentThematicEarnedCard: GatewayEarnedScriptureCardInput = Object.freeze({
  cardDocumentId: 'card-november-reading',
  title: 'November Reading Card',
  publicationYearMonth: currentMonthId,
  imageUrl: currentThematicCardImageUrl,
  assetRevision: 'rev-2026-11-v1',
  illustrationAlt: 'Synthetic illustrated card art for automated M1a verification.',
  accessibleTranscription: 'Synthetic accessible card transcription for automated M1a verification.',
  scripture: Object.freeze({
    book: 'Psalms',
    reference: 'Psalm 23:1',
    translation: 'WEB',
  }),
  attribution: 'World English Bible (Public Domain)',
  rightsStatus: 'publicDomain',
  shareEligible: true,
})

export const RESTRICTED_MANUSCRIPT_SENTINEL =
  'RESTRICTED_EMBARGOED_MANUSCRIPT_BODY_DO_NOT_RENDER'
export const RESTRICTED_CARD_ART_SENTINEL =
  'RESTRICTED_UNEARNED_CARD_TRANSCRIPTION_DO_NOT_RENDER'
export const RESTRICTED_CARD_IMAGE_URL =
  'https://cdn.sanity.io/images/80016lrq/staging/m1a-restricted-card-800x1000.svg'

export interface BuildChallengeFixtureOptions {
  readonly yearMonth: string
  readonly dayOfMonth: number
  readonly documentId: string
  readonly slug: string
  readonly title: string
  readonly seriesId: string
  readonly seriesTitle: string
  readonly scriptureReference: string
  readonly releaseAt: string
  readonly reviewedAt: string
  readonly screenKeyPrefix: string
  readonly screenHeadingPrefix: string
  readonly bodyText: string
  readonly screenCount?: number
  readonly adaptationReviewed?: boolean
}

export function buildChallengeFixture(options: BuildChallengeFixtureOptions) {
  const screenCount = options.screenCount ?? 2
  const date = `${options.yearMonth}-${String(options.dayOfMonth).padStart(2, '0')}`
  return {
    calendarSlot: {
      monthId: options.yearMonth,
      documentId: `month-${options.yearMonth}`,
      dayOfMonth: options.dayOfMonth,
      publicationDate: date,
    },
    _id: options.documentId,
    _type: 'challenge' as const,
    slug: options.slug,
    title: options.title,
    challengeType: 'teaching' as const,
    series: {
      _id: options.seriesId,
      title: options.seriesTitle,
      slug: options.seriesId,
    },
    sequence: options.dayOfMonth,
    releaseAt: options.releaseAt,
    primaryScripture: {
      reference: options.scriptureReference,
      translation: 'WEB',
      textStatus: 'referenceOnly' as const,
      practiceStatus: 'notConfigured' as const,
    },
    screens: Array.from({ length: screenCount }, (_, index) => {
      const step = index + 1
      return {
        _key: `${options.screenKeyPrefix}-${step}`,
        _type: 'challengeScreen' as const,
        screenLabel: `Step ${step}`,
        heading: `${options.screenHeadingPrefix} ${step}`,
        blocks: [
          {
            _key: 'text',
            _type: 'statementBlock' as const,
            text: options.bodyText,
          },
        ],
      }
    }),
    companionLinks: [],
    editorialEligibility: {
      adaptationReviewed: options.adaptationReviewed ?? true,
      reviewedAt: options.reviewedAt,
    },
  }
}

export const challenge = buildChallengeFixture({
  yearMonth: monthId,
  dayOfMonth: 25,
  documentId,
  slug: teachingSlug,
  title: 'Authorized October teaching',
  seriesId: 'october-series',
  seriesTitle: 'October series',
  scriptureReference: 'John 1:1',
  releaseAt: '2026-10-25T00:00:00Z',
  reviewedAt: '2026-10-01T12:00:00Z',
  screenKeyPrefix: 'step',
  screenHeadingPrefix: 'Reading screen',
  bodyText: 'Synthetic teaching body.',
  screenCount: 2,
})

export const todayChallenge = buildChallengeFixture({
  yearMonth: currentMonthId,
  dayOfMonth: todayDay,
  documentId: todayDocumentId,
  slug: todaySlug,
  title: 'Authorized November teaching',
  seriesId: 'november-series',
  seriesTitle: 'November series',
  scriptureReference: 'Psalm 23:1',
  releaseAt: '2026-11-15T00:00:00Z',
  reviewedAt: '2026-11-01T12:00:00Z',
  screenKeyPrefix: 'nov-step',
  screenHeadingPrefix: 'November screen',
  bodyText: 'Synthetic November teaching body.',
  screenCount: 2,
})

export const todayMultiScreenChallenge = buildChallengeFixture({
  yearMonth: currentMonthId,
  dayOfMonth: todayDay,
  documentId: todayDocumentId,
  slug: todaySlug,
  title: 'Authorized November teaching',
  seriesId: 'november-series',
  seriesTitle: 'November series',
  scriptureReference: 'Psalm 23:1',
  releaseAt: '2026-11-15T00:00:00Z',
  reviewedAt: '2026-11-01T12:00:00Z',
  screenKeyPrefix: 'nov-step',
  screenHeadingPrefix: 'November screen',
  bodyText: 'Synthetic November multi-screen teaching body.',
  screenCount: 3,
})

export const currentMonthMultiScreenChallenge = buildChallengeFixture({
  yearMonth: currentMonthId,
  dayOfMonth: currentMonthMultiScreenDay,
  documentId: currentMonthMultiScreenDocumentId,
  slug: currentMonthMultiScreenSlug,
  title: 'November Challenge 14',
  seriesId: 'november-series',
  seriesTitle: 'November series',
  scriptureReference: 'Psalm 23:1',
  releaseAt: '2026-11-14T00:00:00Z',
  reviewedAt: '2026-11-01T12:00:00Z',
  screenKeyPrefix: 'nov14-step',
  screenHeadingPrefix: 'November Day 14 screen',
  bodyText: 'Synthetic November Day 14 teaching body.',
  screenCount: 3,
})

export function buildUnauthorizedChallengeFixture(overrides?: {
  readonly slug?: string
  readonly documentId?: string
  readonly dayOfMonth?: number
}) {
  const dayOfMonth = overrides?.dayOfMonth ?? currentMonthMultiScreenDay
  return buildChallengeFixture({
    yearMonth: currentMonthId,
    dayOfMonth,
    documentId: overrides?.documentId ?? currentMonthMultiScreenDocumentId,
    slug: overrides?.slug ?? currentMonthMultiScreenSlug,
    title: `November Challenge ${dayOfMonth}`,
    seriesId: 'november-series',
    seriesTitle: 'November series',
    scriptureReference: 'Psalm 23:1',
    releaseAt: '2026-11-14T00:00:00Z',
    reviewedAt: '2026-11-01T12:00:00Z',
    screenKeyPrefix: 'unreviewed-step',
    screenHeadingPrefix: 'Unreviewed screen',
    bodyText: RESTRICTED_MANUSCRIPT_SENTINEL,
    screenCount: 2,
    adaptationReviewed: false,
  })
}

export interface BuildMonthPayloadOptions {
  readonly yearMonth: string
  readonly year: number
  readonly month: number
  readonly daysInMonth: number
  readonly phase: 'active' | 'historical'
  readonly title: string
  readonly context?: SyntheticServerContext
  readonly discoveries?: readonly {
    readonly discoveryId: string
    readonly title: string
    readonly kind: 'thematic' | 'fullMonth'
    readonly targetCount: number
  }[]
  readonly slotOverride?: (dayOfMonth: number, date: string) => Record<string, unknown>
}

export function buildMonthPayload(options: BuildMonthPayloadOptions) {
  const introductionScreen = (id: string, title: string) => ({
    id,
    title,
    blocks: [{ _key: id, _type: 'statementBlock', text: 'Synthetic test text.' }],
  })
  const slots = Array.from({ length: options.daysInMonth }, (_, index) => {
    const dayOfMonth = index + 1
    const date = `${options.yearMonth}-${String(dayOfMonth).padStart(2, '0')}`
    if (options.slotOverride) {
      return options.slotOverride(dayOfMonth, date)
    }
    return {
      dayOfMonth,
      date,
      availability: 'available',
      title: `Test Challenge ${dayOfMonth}`,
      slug: `test-challenge-${dayOfMonth}`,
      challengeId:
        dayOfMonth === 25 && options.yearMonth === monthId
          ? `cms:${documentId}`
          : `cms:${options.yearMonth}-challenge-${dayOfMonth}`,
      challengeType: 'teaching',
    }
  })
  const activeCount = slots.filter(slot => slot.availability !== 'unavailable').length
  const defaultDiscoveries =
    options.yearMonth === monthId
      ? [discovery]
      : options.yearMonth === currentMonthId
        ? [currentThematicDiscovery, currentFullMonthDiscovery]
        : []

  return {
    ok: true as const,
    serverContext: options.context ?? serverContext,
    month: {
      monthId: options.yearMonth,
      documentId: `month-${options.yearMonth}`,
      year: options.year,
      month: options.month,
      daysInMonth: options.daysInMonth,
      phase: options.phase,
      rosterVersion: 1,
      totalChallenges: activeCount,
      title: options.title,
      introduction: {
        version: `intro-${options.yearMonth}-v1`,
        previewScreens: [introductionScreen('overview', 'Test month overview')],
        welcomeScreen: {
          ...introductionScreen('welcome', 'Test month welcome'),
          ctaLabel: 'Begin the Month',
        },
      },
      slots,
      discoveries: options.discoveries ?? defaultDiscoveries,
    },
  }
}

export function buildDefaultHistoricalMonthPayload(context: SyntheticServerContext = serverContext) {
  return buildMonthPayload({
    yearMonth: monthId,
    year: 2026,
    month: 10,
    daysInMonth: 31,
    phase: 'historical',
    title: monthTitle,
    context,
  })
}

export function buildDefaultCurrentMonthPayload(context: SyntheticServerContext = serverContext) {
  return buildMonthPayload({
    yearMonth: currentMonthId,
    year: 2026,
    month: 11,
    daysInMonth: 30,
    phase: 'active',
    title: currentMonthTitle,
    context,
    discoveries: [currentThematicDiscovery, currentFullMonthDiscovery],
    slotOverride(dayOfMonth, date) {
      if (dayOfMonth === todayDay) {
        return {
          dayOfMonth,
          date,
          availability: 'available',
          title: todayChallenge.title,
          slug: todaySlug,
          challengeId: `cms:${todayDocumentId}`,
          challengeType: 'teaching',
        }
      }
      if (dayOfMonth === currentMonthMultiScreenDay) {
        return {
          dayOfMonth,
          date,
          availability: 'available',
          title: currentMonthMultiScreenChallenge.title,
          slug: currentMonthMultiScreenSlug,
          challengeId: `cms:${currentMonthMultiScreenDocumentId}`,
          challengeType: 'teaching',
        }
      }
      if (dayOfMonth > todayDay) {
        return {
          dayOfMonth,
          date,
          availability: 'comingSoon',
          title: `Upcoming November Challenge ${dayOfMonth}`,
        }
      }
      return {
        dayOfMonth,
        date,
        availability: 'available',
        title: `November Challenge ${dayOfMonth}`,
        slug: `november-challenge-${dayOfMonth}`,
        challengeId: `cms:november-reading-${dayOfMonth}`,
        challengeType: 'teaching',
      }
    },
  })
}

export function buildCurrentMonthProgressPayload(
  completedChallengeIds: readonly string[],
  context: SyntheticServerContext = serverContext,
) {
  const uniqueIds = Array.from(new Set(completedChallengeIds))
  const qualifyingCompleted = uniqueIds.filter(
    id =>
      id === `cms:${todayDocumentId}` ||
      id === `cms:${currentMonthMultiScreenDocumentId}`,
  )
  const thematicEarned = qualifyingCompleted.length >= 1
  const fullMonthEarned = uniqueIds.length >= 30

  return {
    ok: true as const,
    serverContext: context,
    monthId: currentMonthId,
    rosterVersion: 1,
    completedInMonthCount: uniqueIds.length,
    totalChallenges: 30,
    thematicEarnedCount: Number(thematicEarned),
    thematicTotalCount: 1,
    discoveries: [
      {
        ...currentThematicDiscovery,
        achievedCount: thematicEarned ? 1 : 0,
        isEarned: thematicEarned,
        ...(thematicEarned
          ? {
              awardId: currentThematicAwardId,
              reservedCardId: currentThematicEarnedCard.cardDocumentId,
              earnedCard: currentThematicEarnedCard,
            }
          : {}),
      },
      {
        ...currentFullMonthDiscovery,
        achievedCount: Math.min(30, uniqueIds.length),
        isEarned: fullMonthEarned,
        ...(fullMonthEarned
          ? {
              awardId: currentFullMonthAwardId,
              reservedCardId: 'card-november-full-month',
            }
          : {}),
      },
    ],
  }
}

export function buildHistoricalMonthProgressPayload(
  completedChallengeIds: readonly string[],
  context: SyntheticServerContext = serverContext,
) {
  const uniqueIds = Array.from(new Set(completedChallengeIds))
  const earned = uniqueIds.includes(`cms:${documentId}`)
  return {
    ok: true as const,
    serverContext: context,
    monthId,
    rosterVersion: 1,
    completedInMonthCount: uniqueIds.length,
    totalChallenges: 31,
    thematicEarnedCount: Number(earned),
    thematicTotalCount: 1,
    discoveries: [
      {
        ...discovery,
        achievedCount: Number(earned),
        isEarned: earned,
        ...(earned ? { awardId, reservedCardId: 'card-october-reading' } : {}),
      },
    ],
  }
}

export function buildLibraryMonthsPayload(context: SyntheticServerContext = serverContext) {
  return {
    ok: true as const,
    serverContext: context,
    items: [{ yearMonth: monthId, year: 2026, month: 10, title: monthTitle }],
    page: { limit: 12, hasMore: false, nextCursor: null },
  }
}

export function buildNewsPayload(
  category: string | null = null,
  context: SyntheticServerContext = serverContext,
) {
  const allArticles = [
    {
      id: 'news-test',
      documentId: 'news-test',
      category: 'announcement' as const,
      title: 'Test ministry announcement',
      summary: 'Synthetic news for the shell smoke.',
      publishedOn: '2026-11-10',
    },
  ]
  return {
    ok: true as const,
    serverContext: context,
    articles: allArticles.filter(article => !category || category === article.category),
  }
}

export function buildGuestParticipationStorageValue(seed?: {
  readonly completedChallenges?: Readonly<Record<string, { readonly completedOn: string }>>
  readonly inProgressChallenges?: Readonly<
    Record<string, { readonly updatedOn: string; readonly screenId?: string }>
  >
  readonly earnedAwards?: Readonly<Record<string, unknown>>
}): string {
  return JSON.stringify({
    schemaVersion: 1,
    data: {
      completedChallenges: seed?.completedChallenges ?? {},
      inProgressChallenges: seed?.inProgressChallenges ?? {},
      savedChallenges: {},
      savedScriptures: [],
      lastOpenedChallenge: null,
      earnedAwards: seed?.earnedAwards ?? {},
    },
  })
}

export function buildGuestShelfStorageValue(seed: {
  readonly activeFocusMonth: string | null
  readonly months: readonly {
    readonly yearMonth: string
    readonly admissionKind: 'readerSelected' | 'autoAdmitted'
    readonly isProtected: boolean
  }[]
}): string {
  return JSON.stringify({
    schemaVersion: 1,
    state: {
      activeFocusMonth: seed.activeFocusMonth,
      months: seed.months,
    },
  })
}

export function buildReaderProfileStorageValue(seed?: {
  readonly introStatus?: 'pending' | 'completed' | 'skipped'
  readonly tutorialStatus?: 'pending' | 'completed' | 'skipped'
  readonly reminderEnabled?: boolean
  readonly reminderTime?: string
}): string {
  return JSON.stringify({
    schemaVersion: 1,
    origin: 'defaults',
    profile: {
      introStatus: seed?.introStatus ?? 'completed',
      tutorialStatus: seed?.tutorialStatus ?? 'pending',
      guestInviteDismissed: false,
      appearance: { mode: 'followSeasons', chosenPaletteId: null },
      contrastMode: 'system',
      textScale: 'default',
      reminder: {
        enabled: seed?.reminderEnabled ?? false,
        time: seed?.reminderTime ?? '08:00',
      },
    },
  })
}
