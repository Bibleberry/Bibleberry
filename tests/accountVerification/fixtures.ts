import { daysInMonth, formatCivilDate } from '../../src/gateway/localRelease.ts'

/**
 * Synthetic, LOCAL-ONLY trusted month fixtures for R13-VERIFY1 tests. Shapes follow the accepted
 * R14-2 dereferenced `MONTHLY_DETAIL_FIELDS_GROQ` projection (see tests/gateway/earnedCardProjection
 * .test.ts) plus `_rev` and `priorRosters`. No real Sanity content, IDs or credentials.
 */
export const FIXTURE_PROJECT_ID = '80016lrq'
export const FIXTURE_DATASET = 'staging'
export const PRIVATE_MARKERS = [
  'PRIVATE_CARD_REVIEW_NOTE_DO_NOT_LEAK',
  'INTERNAL_STUDIO_LABEL_',
] as const

export function challengeId(yearMonth: string, day: number): string {
  return `vrf-${yearMonth}-day-${String(day).padStart(2, '0')}`
}

export function canonical(yearMonth: string, day: number): string {
  return `cms:${challengeId(yearMonth, day)}`
}

export function makeCard(
  slug: string,
  cardCategory: 'monthlyThematic' | 'monthlyFull',
  yearMonth: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    _id: `card-${slug}`,
    _type: 'scriptureCard',
    title: `Trusted Card (${slug})`,
    internalTitle: `INTERNAL_STUDIO_LABEL_${slug}`,
    slug,
    cardCategory,
    plannedYearMonth: yearMonth,
    assetRevision: 'v1',
    artwork: { url: `https://cdn.sanity.io/images/${FIXTURE_PROJECT_ID}/${FIXTURE_DATASET}/trusted-${slug}-1200x1600.png` },
    illustrationAlt: `Trusted illustration alt for ${slug}.`,
    accessibleTranscription: `Trusted accessible transcription for ${slug}.`,
    scriptureCitation: { book: 'John', reference: 'John 15:1-5', translation: 'Not configured', usageRightsConfirmed: false },
    rightsAndAttribution: { attribution: 'Synthetic QA fixture', rightsStatus: 'Synthetic test asset only', usageRightsConfirmed: true },
    shareEligible: true,
    editorialStatus: 'approved',
    withdrawn: false,
    editorialReview: {
      reviewedBy: 'Synthetic reviewer',
      reviewerRole: 'technical_synthetic',
      reviewedAt: '2026-08-01T12:00:00.000Z',
      reviewNotes: 'PRIVATE_CARD_REVIEW_NOTE_DO_NOT_LEAK',
    },
    ...overrides,
  }
}

export interface TrustedMonthOptions {
  readonly rosterVersion?: number
  /** Days whose slot is `withdrawn` (requires rosterVersion >= 2). */
  readonly withdrawnDays?: readonly number[]
  readonly priorRosters?: readonly Record<string, unknown>[]
  readonly shepherdCard?: Record<string, unknown> | null
  readonly wisdomCard?: Record<string, unknown> | null
  readonly fullMonthCard?: Record<string, unknown> | null
  readonly revision?: string
  readonly overrides?: Record<string, unknown>
}

/**
 * Discoveries:
 * - `shepherd-theme`: days 1 + 3 (linked approved Card unless overridden)
 * - `wisdom-path`: day 2 (linked approved Card, shareEligible false, licensed WEBP citation)
 * - `legacy-seal`: day 4 (legacy `reservedCardId` ONLY; no approved Card)
 * - full month: every active slot (linked approved Card unless overridden)
 */
export function makeTrustedMonth(yearMonth: string, options: TrustedMonthOptions = {}): Record<string, unknown> {
  const year = Number(yearMonth.slice(0, 4))
  const month = Number(yearMonth.slice(5, 7))
  const count = daysInMonth(year, month)
  const rosterVersion = options.rosterVersion ?? 1
  const withdrawn = new Set(options.withdrawnDays ?? [])

  const slots = Array.from({ length: count }, (_, i) => {
    const day = i + 1
    const id = challengeId(yearMonth, day)
    const challenge = {
      _id: id,
      _type: 'challenge',
      title: `Day ${day} (${yearMonth})`,
      slug: `vrf-day-${String(day).padStart(2, '0')}-${yearMonth}`,
      challengeType: 'teaching',
      withdrawn: false,
      editorialEligibility: { adaptationReviewed: true, reviewedAt: '2026-08-01T12:00:00.000Z' },
      unapprovedBlockCount: 0,
      primaryScripture: {
        reference: `Psalm 23:${(day % 6) + 1}`,
        translation: 'Not configured',
        textStatus: 'referenceOnly',
        usageRightsConfirmed: false,
        practiceStatus: 'notConfigured',
      },
      assignedMonthIds: [`month-${yearMonth}`],
    }
    return {
      _key: `day-${String(day).padStart(2, '0')}`,
      dayOfMonth: day,
      date: formatCivilDate(year, month, day),
      slotStatus: withdrawn.has(day) ? 'withdrawn' : 'scheduled',
      rawChallengeRef: id,
      challenge,
    }
  })
  const finalizedChallengeIds = slots.map(s => s.challenge._id)

  const shepherd =
    options.shepherdCard === undefined
      ? makeCard(`${yearMonth}-shepherd-theme`, 'monthlyThematic', yearMonth)
      : options.shepherdCard
  const wisdom =
    options.wisdomCard === undefined
      ? makeCard(`${yearMonth}-wisdom-path`, 'monthlyThematic', yearMonth, {
          scriptureCitation: { book: 'Proverbs', reference: 'Proverbs 3:5-6', translation: 'WEBP', usageRightsConfirmed: true },
          shareEligible: false,
        })
      : options.wisdomCard
  const full =
    options.fullMonthCard === undefined
      ? makeCard(`${yearMonth}-full-month`, 'monthlyFull', yearMonth)
      : options.fullMonthCard

  const linked = (card: Record<string, unknown> | null) =>
    card ? { rawCardRef: card._id, card } : {}

  return {
    _id: `month-${yearMonth}`,
    _rev: options.revision ?? 'rev0001',
    _type: 'monthlyPublication',
    yearMonth,
    year,
    month,
    title: `Trusted theme for ${yearMonth}`,
    subtitle: `Subtitle for ${yearMonth}`,
    editorialStatus: 'scheduled',
    withdrawn: false,
    editorialReview: { reviewedBy: 'Synthetic reviewer', reviewerRole: 'technical_synthetic', reviewedAt: '2026-08-01T12:00:00.000Z' },
    introduction: {
      previewScreens: [{ _key: 'intro-1', _type: 'introductionScreen', heading: 'Preview', blocks: [{ _key: 'b1', _type: 'statementBlock', text: 'Preview.' }] }],
      welcomeScreen: { _key: 'welcome', _type: 'introductionScreen', heading: 'Welcome', blocks: [{ _key: 'w1', _type: 'statementBlock', text: 'Welcome.' }] },
    },
    slots,
    rosterFinalization: {
      isFinalized: true,
      rosterVersion,
      finalizedAt: '2026-08-02T10:00:00.000Z',
      finalizedBy: 'Synthetic reviewer',
      finalizedChallengeIds,
      ...(options.priorRosters ? { priorRosters: options.priorRosters } : {}),
    },
    discoveries: [
      { _key: 'shepherd-theme', discoverySlug: 'shepherd-theme', title: 'Shepherd Theme', qualifyingChallengeIds: [finalizedChallengeIds[0], finalizedChallengeIds[2]], ...linked(shepherd) },
      { _key: 'wisdom-path', discoverySlug: 'wisdom-path', title: 'Wisdom Path', qualifyingChallengeIds: [finalizedChallengeIds[1]], ...linked(wisdom) },
      { _key: 'legacy-seal', discoverySlug: 'legacy-seal', title: 'Legacy Seal', qualifyingChallengeIds: [finalizedChallengeIds[3]], reservedCardId: 'card-legacy-seal' },
    ],
    fullMonthCard: { title: `Complete ${yearMonth}`, ...linked(full) },
    ...(options.overrides ?? {}),
  }
}

/** All active (non-withdrawn) canonical IDs of the month. */
export function allActiveCanonical(yearMonth: string, withdrawnDays: readonly number[] = []): string[] {
  const year = Number(yearMonth.slice(0, 4))
  const month = Number(yearMonth.slice(5, 7))
  const out: string[] = []
  for (let d = 1; d <= daysInMonth(year, month); d++) {
    if (!withdrawnDays.includes(d)) out.push(canonical(yearMonth, d))
  }
  return out
}
