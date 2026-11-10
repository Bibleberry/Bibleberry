/**
 * Deterministic far-future synthetic monthly fixtures for Milestone R08A-4A.
 *
 * SCOPE AND INTEGRITY INVARIANTS:
 * 1. SYNTHETIC ONLY: Contains strictly deterministic, reference-only Scripture citations
 *    (`textStatus: 'referenceOnly'`, no copyrighted or unlicensed passage text).
 *    Zero real manuscripts, zero reader user data, and zero real ministry announcements.
 * 2. ATTRIBUTION TRUTHFULNESS: Editorial review records are attributed strictly to
 *    `technical_synthetic` / Aaron Waid for synthetic pipeline verification only, never
 *    claiming Alexis Waid's theological or editorial approval.
 * 3. DETERMINISTIC IDENTITY & ISOLATION:
 *    - Publication IDs are exact `month-YYYY-MM` (`month-2096-02`, `month-2098-02`,
 *      `month-2098-03`, `month-2098-04`).
 *    - Preview News IDs are exact `news-preview-YYYY-MM`.
 *    - Challenge, discovery card placeholder, and general News IDs/slugs use the distinct
 *      `r08a-stg-` / `card-r08a-stg-` prefix so they never collide with R05 `r05-3b-*`
 *      fixtures or production manuscripts.
 * 4. NO SYNTHESIZED LEGACY RELEASE FIELDS: Monthly Challenges intentionally omit
 *    `series`, `sequence`, and `releaseAt` per R08A-0 Revision 2.
 */

export const R08A_MONTHLY_FIXTURE_NAMESPACE = 'r08a-stg-'
export const R08A_CARD_PLACEHOLDER_PREFIX = 'card-r08a-stg-'

export interface R08aMonthSpec {
  readonly yearMonth: string
  readonly year: number
  readonly month: number
  readonly expectedDays: number
  readonly previewStartDate: string
  readonly title: string
  readonly subtitle: string
  readonly previewNewsSummary: string
}

export const R08A_MONTH_SPECS: readonly R08aMonthSpec[] = [
  {
    yearMonth: '2096-02',
    year: 2096,
    month: 2,
    expectedDays: 29, // leap February
    previewStartDate: '2096-01-28',
    title: 'Synthetic February 2096 (Leap 29)',
    subtitle: 'Deterministic 29-day leap-February synthetic fixture month.',
    previewNewsSummary: 'Advance preview notice for synthetic 29-day February 2096.',
  },
  {
    yearMonth: '2098-02',
    year: 2098,
    month: 2,
    expectedDays: 28, // non-leap February
    previewStartDate: '2098-01-28',
    title: 'Synthetic February 2098 (28 Days)',
    subtitle: 'Deterministic 28-day non-leap February synthetic fixture month.',
    previewNewsSummary: 'Advance preview notice for synthetic 28-day February 2098.',
  },
  {
    yearMonth: '2098-03',
    year: 2098,
    month: 3,
    expectedDays: 31, // March; Feb 27 preview rule
    previewStartDate: '2098-02-27',
    title: 'Synthetic March 2098 (31 Days)',
    subtitle: 'Deterministic 31-day March synthetic fixture month with Feb 27 preview.',
    previewNewsSummary: 'Advance preview notice for synthetic 31-day March 2098.',
  },
  {
    yearMonth: '2098-04',
    year: 2098,
    month: 4,
    expectedDays: 30, // April
    previewStartDate: '2098-03-28',
    title: 'Synthetic April 2098 (30 Days)',
    subtitle: 'Deterministic 30-day April synthetic fixture month.',
    previewNewsSummary: 'Advance preview notice for synthetic 30-day April 2098.',
  },
] as const

export interface R08aSyntheticScriptureReference {
  readonly _type: 'scriptureReference'
  readonly reference: string
  readonly translation: 'Reference Only'
  readonly textStatus: 'referenceOnly'
  readonly usageRightsConfirmed: false
  readonly practiceStatus: 'notConfigured'
}

export interface R08aChallengeDocument {
  readonly _id: string
  readonly _type: 'challenge'
  readonly title: string
  readonly slug: { readonly _type: 'slug'; readonly current: string }
  readonly challengeType: 'teaching' | 'discipline' | 'reflection' | 'memorization'
  readonly withdrawn: boolean
  readonly summary: string
  readonly primaryScripture: R08aSyntheticScriptureReference
  readonly screens: readonly {
    readonly _key: string
    readonly _type: 'challengeScreen'
    readonly screenLabel: string
    readonly heading: string
    readonly blocks: readonly Record<string, unknown>[]
  }[]
  readonly editorialReview: {
    readonly _type: 'editorialReview'
    readonly sourceTitle: string
    readonly adaptationReviewed: boolean
    readonly reviewedBy: string
    readonly reviewedAt: string
    readonly reviewNotes: string
  }
}

export interface R08aIntroScreen {
  readonly _key: string
  readonly _type: 'introductionScreen'
  readonly screenLabel: string
  readonly heading: string
  readonly ctaLabel?: string
  readonly blocks: readonly Record<string, unknown>[]
}

export interface R08aMonthlyPublicationSlot {
  readonly _key: string
  readonly _type: 'monthlyCalendarSlot'
  readonly dayOfMonth: number
  readonly date: string
  readonly slotStatus: 'scheduled' | 'withdrawn'
  readonly challenge?: { readonly _type: 'reference'; readonly _ref: string; readonly _weak: true }
  readonly withdrawalReason?: string
}

export interface R08aMonthlyPublicationDocument {
  readonly _id: string
  readonly _type: 'monthlyPublication'
  readonly yearMonth: string
  readonly year: number
  readonly month: number
  readonly title: string
  readonly subtitle: string
  readonly previewNews: { readonly _type: 'reference'; readonly _ref: string; readonly _weak: true }
  readonly editorialStatus: 'draft' | 'inReview' | 'approved' | 'scheduled'
  readonly withdrawn: boolean
  readonly editorialReview: {
    readonly _type: 'monthlyEditorialReview'
    readonly reviewedBy: string
    readonly reviewerRole: 'technical_synthetic'
    readonly reviewedAt: string
    readonly reviewNotes: string
  }
  readonly introduction: {
    readonly _type: 'monthlyIntroduction'
    readonly previewScreens: readonly R08aIntroScreen[]
    readonly welcomeScreen: R08aIntroScreen
  }
  readonly slots: readonly R08aMonthlyPublicationSlot[]
  readonly rosterFinalization: {
    readonly _type: 'rosterFinalization'
    readonly isFinalized: boolean
    readonly rosterVersion: number
    readonly finalizedAt: string
    readonly finalizedBy: string
    readonly finalizedChallengeIds: readonly string[]
    readonly priorRosters: readonly {
      readonly _key: string
      readonly _type: 'rosterAmendmentRecord'
      readonly rosterVersion: number
      readonly finalizedChallengeIds: readonly string[]
      readonly supersededAt: string
      readonly reason: string
    }[]
  }
  readonly discoveries: readonly {
    readonly _key: string
    readonly _type: 'monthlyDiscovery'
    readonly discoverySlug: string
    readonly title: string
    readonly qualifyingChallenges: readonly {
      readonly _type: 'reference'
      readonly _ref: string
      readonly _weak: true
    }[]
    readonly reservedCardId: string
  }[]
  readonly fullMonthCard: {
    readonly title: string
    readonly reservedCardId: string
  }
}

export interface R08aNewsArticleDocument {
  readonly _id: string
  readonly _type: 'newsArticle'
  readonly title: string
  readonly slug: { readonly _type: 'slug'; readonly current: string }
  readonly category: 'monthlyPreview' | 'ministryUpdate' | 'announcement'
  readonly summary: string
  readonly body?: readonly Record<string, unknown>[]
  readonly publishOnDate: string
  readonly relatedMonth?: { readonly _type: 'reference'; readonly _ref: string; readonly _weak: true }
  readonly withdrawn: boolean
  readonly editorialReview: {
    readonly _type: 'monthlyEditorialReview'
    readonly reviewedBy: string
    readonly reviewerRole: 'technical_synthetic'
    readonly reviewedAt: string
    readonly reviewNotes: string
  }
}

export type R08aFixtureDocument =
  | R08aMonthlyPublicationDocument
  | R08aChallengeDocument
  | R08aNewsArticleDocument

const SYNTHETIC_REVIEWER_LABEL = 'Aaron Waid (technical synthetic approval)'
const SYNTHETIC_REVIEWED_AT = '2026-11-10T12:00:00.000Z'
const CHALLENGE_TYPES = ['teaching', 'discipline', 'reflection', 'memorization'] as const

const REFERENCE_CITATIONS = [
  'Psalm 1:1-3',
  'Psalm 19:7-11',
  'Psalm 23:1-6',
  'Psalm 27:1-4',
  'Psalm 46:1-7',
  'Psalm 63:1-5',
  'Psalm 84:1-4',
  'Psalm 90:1-4',
  'Psalm 103:1-5',
  'Psalm 119:9-16',
  'Psalm 121:1-8',
  'Psalm 139:1-6',
  'Proverbs 3:5-8',
  'Proverbs 4:20-27',
  'Isaiah 26:3-4',
  'Isaiah 40:28-31',
  'Lamentations 3:22-26',
  'Micah 6:6-8',
  'Matthew 5:3-10',
  'Matthew 6:25-34',
  'Matthew 11:28-30',
  'John 15:1-8',
  'Romans 8:1-6',
  'Romans 12:1-2',
  '2 Corinthians 4:16-18',
  'Galatians 5:22-25',
  'Ephesians 3:14-21',
  'Philippians 2:1-8',
  'Philippians 4:4-9',
  'Colossians 3:12-17',
  '1 Thessalonians 5:16-18',
] as const

function makeReferenceOnlyScripture(reference: string): R08aSyntheticScriptureReference {
  return {
    _type: 'scriptureReference',
    reference,
    translation: 'Reference Only',
    textStatus: 'referenceOnly',
    usageRightsConfirmed: false,
    practiceStatus: 'notConfigured',
  }
}

export function buildChallengeId(yearMonth: string, dayOfMonth: number): string {
  return `${R08A_MONTHLY_FIXTURE_NAMESPACE}${yearMonth}-day-${String(dayOfMonth).padStart(2, '0')}`
}

function buildChallengeDoc(spec: R08aMonthSpec, dayOfMonth: number): R08aChallengeDocument {
  const padded = String(dayOfMonth).padStart(2, '0')
  const id = buildChallengeId(spec.yearMonth, dayOfMonth)
  const citation = REFERENCE_CITATIONS[(dayOfMonth - 1) % REFERENCE_CITATIONS.length]
  const challengeType = CHALLENGE_TYPES[(dayOfMonth - 1) % CHALLENGE_TYPES.length]

  const blocks: Record<string, unknown>[] = [
    {
      _key: `block-r08a-${spec.yearMonth}-${padded}-stmt`,
      _type: 'statementBlock',
      label: 'Synthetic Fixture Note',
      text: `Synthetic reflection statement for ${spec.yearMonth} day ${padded} (${citation}).`,
    },
  ]

  // Exercise structured block approval checks on day 1 of each month
  if (dayOfMonth === 1) {
    blocks.push({
      _key: `block-r08a-${spec.yearMonth}-${padded}-refl`,
      _type: 'reflectionBlock',
      question: `Synthetic reflection prompt for ${spec.yearMonth} day ${padded}.`,
      choices: [
        {
          _key: `choice-r08a-${spec.yearMonth}-${padded}-a`,
          _type: 'reflectionChoice',
          label: 'Option A (synthetic)',
          prompt: 'Synthetic prompt response A.',
        },
        {
          _key: `choice-r08a-${spec.yearMonth}-${padded}-b`,
          _type: 'reflectionChoice',
          label: 'Option B (synthetic)',
          prompt: 'Synthetic prompt response B.',
        },
      ],
      closing: 'Synthetic closing reflection note.',
      reviewStatus: 'approved',
    })
  }

  return {
    _id: id,
    _type: 'challenge',
    title: `Synthetic ${spec.yearMonth} Day ${padded}`,
    slug: { _type: 'slug', current: id },
    challengeType,
    withdrawn: false,
    summary: `Synthetic fixture summary for ${spec.yearMonth} day ${padded}.`,
    primaryScripture: makeReferenceOnlyScripture(citation),
    screens: [
      {
        _key: `screen-r08a-${spec.yearMonth}-${padded}-1`,
        _type: 'challengeScreen',
        screenLabel: `Day ${padded}`,
        heading: `Synthetic Study ${spec.yearMonth}-${padded}`,
        blocks,
      },
    ],
    editorialReview: {
      _type: 'editorialReview',
      sourceTitle: 'R08A-4A Synthetic Monthly Fixture Specification',
      adaptationReviewed: true,
      reviewedBy: SYNTHETIC_REVIEWER_LABEL,
      reviewedAt: SYNTHETIC_REVIEWED_AT,
      reviewNotes:
        'SIMULATED SYNTHETIC ELIGIBILITY: Technical synthetic fixture for R08A-4A verification only. Never present as real theological editorial approval.',
    },
  }
}

function buildMonthDoc(spec: R08aMonthSpec): R08aMonthlyPublicationDocument {
  const slots: R08aMonthlyPublicationSlot[] = []
  const finalizedChallengeIds: string[] = []

  for (let day = 1; day <= spec.expectedDays; day++) {
    const padded = String(day).padStart(2, '0')
    const challengeId = buildChallengeId(spec.yearMonth, day)
    finalizedChallengeIds.push(challengeId)
    slots.push({
      _key: `day-${padded}`,
      _type: 'monthlyCalendarSlot',
      dayOfMonth: day,
      date: `${spec.yearMonth}-${padded}`,
      slotStatus: 'scheduled',
      challenge: {
        _type: 'reference',
        _ref: challengeId,
        _weak: true,
      },
    })
  }

  // Two deterministic thematic discoveries whose qualifying refs are strict subsets of finalizedChallengeIds
  const motifARefs = [finalizedChallengeIds[0], finalizedChallengeIds[4]]
  const motifBRefs = [finalizedChallengeIds[9], finalizedChallengeIds[14]]

  return {
    _id: `month-${spec.yearMonth}`,
    _type: 'monthlyPublication',
    yearMonth: spec.yearMonth,
    year: spec.year,
    month: spec.month,
    title: spec.title,
    subtitle: spec.subtitle,
    previewNews: {
      _type: 'reference',
      _ref: `news-preview-${spec.yearMonth}`,
      _weak: true,
    },
    editorialStatus: 'scheduled',
    withdrawn: false,
    editorialReview: {
      _type: 'monthlyEditorialReview',
      reviewedBy: SYNTHETIC_REVIEWER_LABEL,
      reviewerRole: 'technical_synthetic',
      reviewedAt: SYNTHETIC_REVIEWED_AT,
      reviewNotes:
        'SIMULATED SYNTHETIC ELIGIBILITY: Technical synthetic month fixture for R08A-4A verification only.',
    },
    introduction: {
      _type: 'monthlyIntroduction',
      previewScreens: [
        {
          _key: `intro-${spec.yearMonth}-1`,
          _type: 'introductionScreen',
          screenLabel: 'Advance Preview',
          heading: `Previewing ${spec.yearMonth}`,
          blocks: [
            {
              _key: `intro-${spec.yearMonth}-1-b1`,
              _type: 'statementBlock',
              label: 'Synthetic Preview',
              text: `Synthetic preview introduction for ${spec.title}.`,
            },
            {
              _key: `intro-${spec.yearMonth}-1-b2`,
              _type: 'scriptureBlock',
              scripture: makeReferenceOnlyScripture('Psalm 19:7-11'),
            },
          ],
        },
      ],
      welcomeScreen: {
        _key: `welcome-${spec.yearMonth}`,
        _type: 'introductionScreen',
        screenLabel: 'Welcome',
        heading: `Welcome to ${spec.yearMonth}`,
        ctaLabel: 'Open Calendar',
        blocks: [
          {
            _key: `welcome-${spec.yearMonth}-b1`,
            _type: 'statementBlock',
            label: 'Synthetic Welcome',
            text: `Synthetic month-start welcome content for ${spec.yearMonth}.`,
          },
        ],
      },
    },
    slots,
    rosterFinalization: {
      _type: 'rosterFinalization',
      isFinalized: true,
      rosterVersion: 1,
      finalizedAt: SYNTHETIC_REVIEWED_AT,
      finalizedBy: SYNTHETIC_REVIEWER_LABEL,
      finalizedChallengeIds,
      priorRosters: [],
    },
    discoveries: [
      {
        _key: `disc-${spec.yearMonth}-motif-alpha`,
        _type: 'monthlyDiscovery',
        discoverySlug: 'motif-alpha',
        title: `Synthetic Motif Alpha (${spec.yearMonth})`,
        qualifyingChallenges: motifARefs.map(ref => ({
          _type: 'reference' as const,
          _ref: ref,
          _weak: true as const,
        })),
        reservedCardId: `${R08A_CARD_PLACEHOLDER_PREFIX}${spec.yearMonth}-motif-alpha`,
      },
      {
        _key: `disc-${spec.yearMonth}-motif-beta`,
        _type: 'monthlyDiscovery',
        discoverySlug: 'motif-beta',
        title: `Synthetic Motif Beta (${spec.yearMonth})`,
        qualifyingChallenges: motifBRefs.map(ref => ({
          _type: 'reference' as const,
          _ref: ref,
          _weak: true as const,
        })),
        reservedCardId: `${R08A_CARD_PLACEHOLDER_PREFIX}${spec.yearMonth}-motif-beta`,
      },
    ],
    fullMonthCard: {
      title: `Complete ${spec.yearMonth} (Synthetic)`,
      reservedCardId: `${R08A_CARD_PLACEHOLDER_PREFIX}${spec.yearMonth}-full-month`,
    },
  }
}

function buildPreviewNewsDoc(spec: R08aMonthSpec): R08aNewsArticleDocument {
  return {
    _id: `news-preview-${spec.yearMonth}`,
    _type: 'newsArticle',
    title: `Coming in ${spec.yearMonth} (Synthetic Preview)`,
    slug: {
      _type: 'slug',
      current: `${R08A_MONTHLY_FIXTURE_NAMESPACE}preview-${spec.yearMonth}`,
    },
    category: 'monthlyPreview',
    summary: spec.previewNewsSummary,
    body: [
      {
        _key: `preview-body-${spec.yearMonth}-1`,
        _type: 'block',
        style: 'normal',
        markDefs: [],
        children: [
          {
            _key: `preview-span-${spec.yearMonth}-1`,
            _type: 'span',
            marks: [],
            text: `Synthetic preview body for ${spec.yearMonth} (stripped from minimal monthlyPreview gateway response).`,
          },
        ],
      },
    ],
    publishOnDate: spec.previewStartDate,
    relatedMonth: {
      _type: 'reference',
      _ref: `month-${spec.yearMonth}`,
      _weak: true,
    },
    withdrawn: false,
    editorialReview: {
      _type: 'monthlyEditorialReview',
      reviewedBy: SYNTHETIC_REVIEWER_LABEL,
      reviewerRole: 'technical_synthetic',
      reviewedAt: SYNTHETIC_REVIEWED_AT,
      reviewNotes:
        'SIMULATED SYNTHETIC ELIGIBILITY: Technical synthetic preview news fixture for R08A-4A only.',
    },
  }
}

export const R08A_GENERAL_NEWS_DOCUMENT: R08aNewsArticleDocument = {
  _id: `${R08A_MONTHLY_FIXTURE_NAMESPACE}news-ministry-update-1`,
  _type: 'newsArticle',
  title: 'Synthetic Ministry Update (R08A-4A)',
  slug: {
    _type: 'slug',
    current: `${R08A_MONTHLY_FIXTURE_NAMESPACE}news-ministry-update-1`,
  },
  category: 'ministryUpdate',
  summary: 'Synthetic general news update fixture for R08A-4A pipeline verification.',
  body: [
    {
      _key: 'r08a-news-body-1',
      _type: 'block',
      style: 'normal',
      markDefs: [],
      children: [
        {
          _key: 'r08a-news-span-1',
          _type: 'span',
          marks: [],
          text: 'Synthetic ministry update body paragraph for R08A-4A verification only.',
        },
      ],
    },
  ],
  publishOnDate: '2098-02-20',
  withdrawn: false,
  editorialReview: {
    _type: 'monthlyEditorialReview',
    reviewedBy: SYNTHETIC_REVIEWER_LABEL,
    reviewerRole: 'technical_synthetic',
    reviewedAt: SYNTHETIC_REVIEWED_AT,
    reviewNotes:
      'SIMULATED SYNTHETIC ELIGIBILITY: Technical synthetic general news fixture for R08A-4A only.',
  },
}

export const R08A_MONTHLY_PUBLICATION_DOCUMENTS: readonly R08aMonthlyPublicationDocument[] =
  R08A_MONTH_SPECS.map(buildMonthDoc)

export const R08A_MONTHLY_CHALLENGE_DOCUMENTS: readonly R08aChallengeDocument[] =
  R08A_MONTH_SPECS.flatMap(spec =>
    Array.from({ length: spec.expectedDays }, (_, idx) => buildChallengeDoc(spec, idx + 1)),
  )

export const R08A_MONTHLY_PREVIEW_NEWS_DOCUMENTS: readonly R08aNewsArticleDocument[] =
  R08A_MONTH_SPECS.map(buildPreviewNewsDoc)

export const R08A_MONTHLY_NEWS_DOCUMENTS: readonly R08aNewsArticleDocument[] = [
  ...R08A_MONTHLY_PREVIEW_NEWS_DOCUMENTS,
  R08A_GENERAL_NEWS_DOCUMENT,
]

export const ALL_R08A_MONTHLY_DOCUMENTS: readonly R08aFixtureDocument[] = [
  ...R08A_MONTHLY_PUBLICATION_DOCUMENTS,
  ...R08A_MONTHLY_CHALLENGE_DOCUMENTS,
  ...R08A_MONTHLY_NEWS_DOCUMENTS,
]

export const ALL_R08A_INTENDED_DOCUMENT_IDS: readonly string[] = ALL_R08A_MONTHLY_DOCUMENTS.map(
  doc => doc._id,
)

export const ALL_R08A_INTENDED_SLUGS: readonly string[] = [
  ...R08A_MONTHLY_CHALLENGE_DOCUMENTS.map(doc => doc.slug.current),
  ...R08A_MONTHLY_NEWS_DOCUMENTS.map(doc => doc.slug.current),
]

// ---------------------------------------------------------------------------
// Gateway GROQ Projection Helpers (mirrors src/gateway/query.ts shapes)
// ---------------------------------------------------------------------------

const REVIEWED_BLOCK_TYPES = new Set([
  'comparisonBlock',
  'visualCardsBlock',
  'connectedSequenceBlock',
  'reflectionBlock',
  'optionalStudyBlock',
])

function countUnapprovedBlocks(screens: R08aChallengeDocument['screens']): number {
  let count = 0
  for (const screen of screens) {
    for (const block of screen.blocks) {
      const blockType = typeof block._type === 'string' ? block._type : ''
      if (REVIEWED_BLOCK_TYPES.has(blockType) && block.reviewStatus !== 'approved') {
        count += 1
      }
    }
  }
  return count
}

function buildLookupMaps(docs: readonly R08aFixtureDocument[]) {
  const challengesById = new Map<string, R08aChallengeDocument>()
  const monthsById = new Map<string, R08aMonthlyPublicationDocument>()
  const monthsByYearMonth = new Map<string, R08aMonthlyPublicationDocument>()

  for (const doc of docs) {
    if (doc._type === 'challenge') {
      challengesById.set(doc._id, doc)
    } else if (doc._type === 'monthlyPublication') {
      monthsById.set(doc._id, doc)
      monthsByYearMonth.set(doc.yearMonth, doc)
    }
  }

  return { challengesById, monthsById, monthsByYearMonth }
}

function computeAssignedMonthIds(
  challengeId: string,
  months: Iterable<R08aMonthlyPublicationDocument>,
): string[] {
  const result: string[] = []
  for (const monthDoc of months) {
    if (monthDoc._id.startsWith('drafts.')) continue
    if (monthDoc.slots.some(slot => slot.challenge?._ref === challengeId)) {
      result.push(monthDoc._id)
    }
  }
  return result
}

export function toDereferencedMonthlyPreviewDoc(
  yearMonth: string,
  docs: readonly R08aFixtureDocument[] = ALL_R08A_MONTHLY_DOCUMENTS,
): Record<string, unknown> | null {
  const { challengesById, monthsByYearMonth } = buildLookupMaps(docs)
  const monthDoc = monthsByYearMonth.get(yearMonth)
  if (!monthDoc) return null

  return {
    _id: monthDoc._id,
    _type: monthDoc._type,
    yearMonth: monthDoc.yearMonth,
    year: monthDoc.year,
    month: monthDoc.month,
    title: monthDoc.title,
    subtitle: monthDoc.subtitle,
    coverImage: null,
    editorialStatus: monthDoc.editorialStatus,
    withdrawn: monthDoc.withdrawn,
    editorialReview: {
      reviewedBy: monthDoc.editorialReview.reviewedBy,
      reviewerRole: monthDoc.editorialReview.reviewerRole,
      reviewedAt: monthDoc.editorialReview.reviewedAt,
    },
    introduction: {
      previewScreens: monthDoc.introduction.previewScreens,
    },
    slots: monthDoc.slots.map(slot => {
      const ref = slot.challenge?._ref
      const ch = ref ? challengesById.get(ref) : undefined
      return {
        _key: slot._key,
        dayOfMonth: slot.dayOfMonth,
        date: slot.date,
        slotStatus: slot.slotStatus,
        rawChallengeRef: ref ?? null,
        challenge: ch
          ? {
              _id: ch._id,
              _type: ch._type,
              title: ch.title,
              withdrawn: ch.withdrawn,
              editorialEligibility: {
                adaptationReviewed: ch.editorialReview.adaptationReviewed,
                reviewedAt: ch.editorialReview.reviewedAt,
              },
              unapprovedBlockCount: countUnapprovedBlocks(ch.screens),
              primaryScripture: ch.primaryScripture,
              assignedMonthIds: computeAssignedMonthIds(ch._id, monthsByYearMonth.values()),
            }
          : null,
      }
    }),
    rosterFinalization: {
      isFinalized: monthDoc.rosterFinalization.isFinalized,
      rosterVersion: monthDoc.rosterFinalization.rosterVersion,
      finalizedChallengeIds: monthDoc.rosterFinalization.finalizedChallengeIds,
    },
  }
}

export function toDereferencedMonthlyDetailDoc(
  yearMonth: string,
  docs: readonly R08aFixtureDocument[] = ALL_R08A_MONTHLY_DOCUMENTS,
): Record<string, unknown> | null {
  const { challengesById, monthsByYearMonth } = buildLookupMaps(docs)
  const monthDoc = monthsByYearMonth.get(yearMonth)
  if (!monthDoc) return null

  return {
    _id: monthDoc._id,
    _type: monthDoc._type,
    yearMonth: monthDoc.yearMonth,
    year: monthDoc.year,
    month: monthDoc.month,
    title: monthDoc.title,
    subtitle: monthDoc.subtitle,
    coverImage: null,
    editorialStatus: monthDoc.editorialStatus,
    withdrawn: monthDoc.withdrawn,
    editorialReview: {
      reviewedBy: monthDoc.editorialReview.reviewedBy,
      reviewerRole: monthDoc.editorialReview.reviewerRole,
      reviewedAt: monthDoc.editorialReview.reviewedAt,
    },
    introduction: {
      previewScreens: monthDoc.introduction.previewScreens,
      welcomeScreen: monthDoc.introduction.welcomeScreen,
    },
    slots: monthDoc.slots.map(slot => {
      const ref = slot.challenge?._ref
      const ch = ref ? challengesById.get(ref) : undefined
      return {
        _key: slot._key,
        dayOfMonth: slot.dayOfMonth,
        date: slot.date,
        slotStatus: slot.slotStatus,
        rawChallengeRef: ref ?? null,
        challenge: ch
          ? {
              _id: ch._id,
              _type: ch._type,
              title: ch.title,
              slug: ch.slug.current,
              challengeType: ch.challengeType,
              withdrawn: ch.withdrawn,
              editorialEligibility: {
                adaptationReviewed: ch.editorialReview.adaptationReviewed,
                reviewedAt: ch.editorialReview.reviewedAt,
              },
              unapprovedBlockCount: countUnapprovedBlocks(ch.screens),
              primaryScripture: ch.primaryScripture,
              assignedMonthIds: computeAssignedMonthIds(ch._id, monthsByYearMonth.values()),
            }
          : null,
      }
    }),
    rosterFinalization: monthDoc.rosterFinalization,
    discoveries: monthDoc.discoveries.map(d => ({
      _key: d._key,
      discoverySlug: d.discoverySlug,
      title: d.title,
      qualifyingChallengeIds: d.qualifyingChallenges.map(q => q._ref),
      reservedCardId: d.reservedCardId,
    })),
    fullMonthCard: monthDoc.fullMonthCard,
  }
}

export function toDereferencedSlottedChallengeDoc(
  challengeId: string,
  docs: readonly R08aFixtureDocument[] = ALL_R08A_MONTHLY_DOCUMENTS,
): Record<string, unknown> | null {
  const { challengesById, monthsByYearMonth } = buildLookupMaps(docs)
  const ch = challengesById.get(challengeId)
  if (!ch) return null

  const monthlyAssignments: Record<string, unknown>[] = []
  for (const monthDoc of monthsByYearMonth.values()) {
    if (monthDoc._id.startsWith('drafts.')) continue
    const matchingSlots = monthDoc.slots.filter(slot => slot.challenge?._ref === challengeId)
    if (matchingSlots.length > 0) {
      monthlyAssignments.push({
        _id: monthDoc._id,
        yearMonth: monthDoc.yearMonth,
        year: monthDoc.year,
        month: monthDoc.month,
        title: monthDoc.title,
        editorialStatus: monthDoc.editorialStatus,
        withdrawn: monthDoc.withdrawn,
        slots: matchingSlots.map(slot => ({
          _key: slot._key,
          dayOfMonth: slot.dayOfMonth,
          date: slot.date,
          slotStatus: slot.slotStatus,
          challengeRef: slot.challenge?._ref ?? null,
        })),
      })
    }
  }

  return {
    _id: ch._id,
    _type: ch._type,
    title: ch.title,
    slug: ch.slug.current,
    challengeType: ch.challengeType,
    series: null,
    withdrawn: ch.withdrawn,
    summary: ch.summary,
    primaryScripture: ch.primaryScripture,
    screens: ch.screens,
    editorialEligibility: {
      adaptationReviewed: ch.editorialReview.adaptationReviewed,
      reviewedAt: ch.editorialReview.reviewedAt,
    },
    unapprovedBlockCount: countUnapprovedBlocks(ch.screens),
    monthlyAssignments,
  }
}

export function toDereferencedNewsArticleDoc(
  article: R08aNewsArticleDocument,
  docs: readonly R08aFixtureDocument[] = ALL_R08A_MONTHLY_DOCUMENTS,
): Record<string, unknown> {
  const { monthsById } = buildLookupMaps(docs)
  const relatedMonth = article.relatedMonth?._ref ? monthsById.get(article.relatedMonth._ref) : undefined

  return {
    _id: article._id,
    _type: article._type,
    title: article.title,
    slug: article.slug.current,
    category: article.category,
    summary: article.summary,
    ...(article.body ? { body: article.body } : {}),
    coverImage: null,
    publishOnDate: article.publishOnDate,
    withdrawn: article.withdrawn,
    relatedMonth: relatedMonth
      ? {
          _id: relatedMonth._id,
          yearMonth: relatedMonth.yearMonth,
          year: relatedMonth.year,
          month: relatedMonth.month,
          editorialStatus: relatedMonth.editorialStatus,
          withdrawn: relatedMonth.withdrawn,
        }
      : null,
    editorialReview: {
      reviewedBy: article.editorialReview.reviewedBy,
      reviewerRole: article.editorialReview.reviewerRole,
      reviewedAt: article.editorialReview.reviewedAt,
    },
  }
}

// ---------------------------------------------------------------------------
// Targeted In-Memory Negative & Emergency Withdrawal Variants
// (Never persisted as separate live documents)
// ---------------------------------------------------------------------------

export interface R08aNegativeVariants {
  /** Duplicate slot reference within month-2098-04 */
  readonly duplicateIntraMonthSlotGateway: Record<string, unknown>
  /** Foreign month slot reference (month-2098-03 challenge inside month-2098-04) */
  readonly foreignMonthSlotRefGateway: Record<string, unknown>
  /** Draft Challenge reference inside month-2098-04 */
  readonly draftChallengeRefGateway: Record<string, unknown>
  /** Unreviewed Challenge inside month-2098-04 */
  readonly unreviewedChallengeGateway: Record<string, unknown>
  /** Unlicensed Scripture passage Challenge inside month-2098-04 */
  readonly unlicensedScriptureChallengeGateway: Record<string, unknown>
  /** Invalid misaligned slot date inside month-2098-04 */
  readonly invalidSlotDateGateway: Record<string, unknown>
  /** Non-conforming month ID (month-2098-04-synthetic) */
  readonly nonConformingMonthIdStudio: R08aMonthlyPublicationDocument
  /** Immediate emergency withdrawal on Day 18 (challenge.withdrawn = true, rosterVersion = 1) */
  readonly immediateWithdrawalLiveGateway: Record<string, unknown>
  /** Immediate emergency withdrawal on Day 18 with retracted title/Scripture/review */
  readonly retractedWithdrawnChallengeGateway: Record<string, unknown>
  /** Formal rosterVersion 2 amendment withdrawing Day 18 (29/29 achievable) */
  readonly formalAmendedV2WithdrawalStudio: R08aMonthlyPublicationDocument
  readonly formalAmendedV2WithdrawalGateway: Record<string, unknown>
  /** Studio schema fixture: unapproved Challenge reference in month-2098-04 */
  readonly studioBaseApril: R08aMonthlyPublicationDocument
}

export function buildR08aNegativeVariants(): R08aNegativeVariants {
  const baseAprilDetail = toDereferencedMonthlyDetailDoc('2098-04')!
  const baseAprilStudio = structuredClone(
    R08A_MONTHLY_PUBLICATION_DOCUMENTS.find(d => d.yearMonth === '2098-04')!,
  )

  const duplicateIntraMonthSlotGateway = structuredClone(baseAprilDetail) as Record<string, unknown>
  {
    const slots = duplicateIntraMonthSlotGateway.slots as Record<string, unknown>[]
    slots[1] = structuredClone(slots[0])
    slots[1]._key = 'day-02'
    slots[1].dayOfMonth = 2
    slots[1].date = '2098-04-02'
  }

  const foreignMonthSlotRefGateway = structuredClone(baseAprilDetail) as Record<string, unknown>
  {
    const slots = foreignMonthSlotRefGateway.slots as Record<string, unknown>[]
    const ch = slots[3].challenge as Record<string, unknown>
    ch.assignedMonthIds = ['month-2098-03', 'month-2098-04']
  }

  const draftChallengeRefGateway = structuredClone(baseAprilDetail) as Record<string, unknown>
  {
    const slots = draftChallengeRefGateway.slots as Record<string, unknown>[]
    slots[4].rawChallengeRef = 'drafts.r08a-stg-2098-04-day-05'
    ;(slots[4].challenge as Record<string, unknown>)._id = 'drafts.r08a-stg-2098-04-day-05'
  }

  const unreviewedChallengeGateway = structuredClone(baseAprilDetail) as Record<string, unknown>
  {
    const slots = unreviewedChallengeGateway.slots as Record<string, unknown>[]
    const ch = slots[5].challenge as Record<string, unknown>
    ch.editorialEligibility = { adaptationReviewed: false }
  }

  const unlicensedScriptureChallengeGateway = structuredClone(baseAprilDetail) as Record<
    string,
    unknown
  >
  {
    const slots = unlicensedScriptureChallengeGateway.slots as Record<string, unknown>[]
    const ch = slots[6].challenge as Record<string, unknown>
    ch.primaryScripture = {
      reference: 'Psalm 23:1-6',
      translation: 'ESV',
      textStatus: 'provided',
      passage: 'SECRET_UNLICENSED_R08A_PASSAGE',
      usageRightsConfirmed: false,
      practiceStatus: 'notConfigured',
    }
  }

  const invalidSlotDateGateway = structuredClone(baseAprilDetail) as Record<string, unknown>
  {
    const slots = invalidSlotDateGateway.slots as Record<string, unknown>[]
    slots[7].date = '2098-04-99'
  }

  const nonConformingMonthIdStudio = {
    ...structuredClone(baseAprilStudio),
    _id: 'month-2098-04-synthetic',
  }

  const immediateWithdrawalLiveGateway = structuredClone(baseAprilDetail) as Record<string, unknown>
  {
    const slots = immediateWithdrawalLiveGateway.slots as Record<string, unknown>[]
    const ch = slots[17].challenge as Record<string, unknown>
    ch.withdrawn = true
    ch.title = 'SECRET_WITHDRAWN_DAY_18_TITLE'
  }

  const retractedWithdrawnChallengeGateway = structuredClone(baseAprilDetail) as Record<
    string,
    unknown
  >
  {
    const slots = retractedWithdrawnChallengeGateway.slots as Record<string, unknown>[]
    slots[17].challenge = {
      _id: 'r08a-stg-2098-04-day-18',
      _type: 'challenge',
      title: '',
      slug: '',
      challengeType: 'invalid',
      withdrawn: true,
      editorialEligibility: { adaptationReviewed: false },
      unapprovedBlockCount: 2,
      primaryScripture: {
        reference: 'Psalm 1:1',
        translation: 'ESV',
        textStatus: 'provided',
        passage: 'SECRET_RETRACTED_DAY_18_PASSAGE',
        usageRightsConfirmed: false,
        practiceStatus: 'notConfigured',
      },
      assignedMonthIds: ['month-2098-04'],
    }
  }

  const day18Id = buildChallengeId('2098-04', 18)
  const v1Ids = baseAprilStudio.rosterFinalization.finalizedChallengeIds
  const v2Ids = v1Ids.filter(id => id !== day18Id)

  const formalAmendedV2WithdrawalStudio: R08aMonthlyPublicationDocument = {
    ...structuredClone(baseAprilStudio),
    slots: baseAprilStudio.slots.map((slot, idx) =>
      idx === 17
        ? {
            _key: slot._key,
            _type: slot._type,
            dayOfMonth: slot.dayOfMonth,
            date: slot.date,
            slotStatus: 'withdrawn',
            withdrawalReason: 'Synthetic R08A-4A emergency slot withdrawal test (Option 4A).',
          }
        : slot,
    ),
    rosterFinalization: {
      _type: 'rosterFinalization',
      isFinalized: true,
      rosterVersion: 2,
      finalizedAt: '2098-04-18T12:00:00.000Z',
      finalizedBy: SYNTHETIC_REVIEWER_LABEL,
      finalizedChallengeIds: v2Ids,
      priorRosters: [
        {
          _key: 'prior-v1',
          _type: 'rosterAmendmentRecord',
          rosterVersion: 1,
          finalizedChallengeIds: v1Ids,
          supersededAt: '2098-04-18T12:00:00.000Z',
          reason: 'Emergency withdrawal of Day 18 slot in synthetic R08A-4A variant.',
        },
      ],
    },
  }

  const formalAmendedV2WithdrawalGateway = toDereferencedMonthlyDetailDoc('2098-04', [
    formalAmendedV2WithdrawalStudio,
    ...R08A_MONTHLY_CHALLENGE_DOCUMENTS,
  ])!

  return {
    duplicateIntraMonthSlotGateway,
    foreignMonthSlotRefGateway,
    draftChallengeRefGateway,
    unreviewedChallengeGateway,
    unlicensedScriptureChallengeGateway,
    invalidSlotDateGateway,
    nonConformingMonthIdStudio,
    immediateWithdrawalLiveGateway,
    retractedWithdrawnChallengeGateway,
    formalAmendedV2WithdrawalStudio,
    formalAmendedV2WithdrawalGateway,
    studioBaseApril: baseAprilStudio,
  }
}
