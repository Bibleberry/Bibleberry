/**
 * Synthetic scheduled-release acceptance fixtures for Milestone R05 Stage 3B.3A.
 *
 * SCOPE AND INTEGRITY INVARIANTS:
 * 1. SYNTHETIC ONLY: Contains strictly deterministic, reference-only Scripture citations.
 *    No quoted Bible text, no live devotional teaching, no Alexis editorial notes,
 *    no reader user data, and no copyrighted content.
 * 2. ATTRIBUTION TRUTHFULNESS & SIMULATED ELIGIBILITY: Reviewed synthetic fixtures are attributed
 *    truthfully to Aaron Waid for technical synthetic approval. They represent simulated synthetic
 *    eligibility attributes for release-engine testing only, and must NOT be asserted or interpreted
 *    as actual theological or editorial approval by Aaron Waid or Alexis Waid.
 * 3. IDENTIFIER NAMESPACE: All document IDs and slugs use the distinct `r05-3b-` prefix
 *    to prevent collisions with production or future real editorial documents.
 * 4. ISOLATION: These fixtures target the private `staging` dataset in project `80016lrq`.
 *    They must never be applied to the public `production` dataset.
 * 5. DURABLE EMBARGO: Future-scheduled acceptance fixtures use a distant future instant (year 2099)
 *    so live acceptance tests remain durable over time and do not auto-release. Instant release
 *    boundaries are tested deterministically offline with an injected clock.
 */

export interface SyntheticScriptureReference {
  _type?: string
  reference: string
  translation: string
  textStatus: 'referenceOnly' | 'provided'
  passage?: string
  usageRightsConfirmed: boolean
  practiceStatus: 'notConfigured' | 'configured'
}

export interface SyntheticBlock {
  _key: string
  _type: string
  [key: string]: unknown
}

export interface SyntheticScreen {
  _key: string
  _type: 'challengeScreen'
  screenLabel?: string
  heading?: string
  blocks: SyntheticBlock[]
}

export interface SyntheticEditorialReview {
  _type?: string
  sourceTitle: string
  sourceRevision?: string
  adaptationReviewed: boolean
  reviewedBy?: string
  reviewedAt?: string
  reviewNotes?: string
}

export interface SyntheticChallengeSeriesDocument {
  _id: string
  _type: 'challengeSeries'
  title: string
  slug: { _type: 'slug'; current: string }
  description: string
  startDate: string
  endDate: string
}

export interface SyntheticChallengeDocument {
  _id: string
  _type: 'challenge'
  title: string
  slug: { _type: 'slug'; current: string }
  challengeType: 'teaching' | 'discipline' | 'reflection' | 'memorization'
  series: { _type: 'reference'; _ref: string }
  sequence: number
  releaseAt: string
  summary?: string
  primaryScripture: SyntheticScriptureReference
  screens: SyntheticScreen[]
  companionLinks?: Array<{
    _key: string
    _type: 'companionLink'
    provider: string
    label: string
    url: string
    description?: string
  }>
  editorialReview: SyntheticEditorialReview
}

// ---------------------------------------------------------------------------
// 1. Synthetic Challenge Series
// ---------------------------------------------------------------------------

export const SYNTHETIC_SERIES_ID = 'r05-3b-series-acceptance'
export const SYNTHETIC_SERIES_SLUG = 'r05-3b-synthetic-series'

export const SYNTHETIC_SERIES_DOCUMENT: SyntheticChallengeSeriesDocument = {
  _id: SYNTHETIC_SERIES_ID,
  _type: 'challengeSeries',
  title: 'Synthetic Acceptance Series (R05 Stage 3B)',
  slug: {
    _type: 'slug',
    current: SYNTHETIC_SERIES_SLUG,
  },
  description: 'Synthetic acceptance test series for verifying scheduled-release gating and embargo enforcement.',
  startDate: '2026-11-01',
  endDate: '2026-11-30',
}

// ---------------------------------------------------------------------------
// 2. Helper builders for synthetic screens and reference-only scriptures
// ---------------------------------------------------------------------------

function makeSyntheticScripture(reference: string): SyntheticScriptureReference {
  return {
    _type: 'scriptureReference',
    reference,
    translation: 'Reference Only',
    textStatus: 'referenceOnly',
    usageRightsConfirmed: false,
    practiceStatus: 'notConfigured',
  }
}

function makeParagraph(key: string, text: string) {
  return {
    _key: key,
    _type: 'block',
    style: 'normal',
    markDefs: [],
    children: [
      {
        _key: `${key}-span`,
        _type: 'span',
        marks: [],
        text,
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// 3. Fixture A: Published, Reviewed, Past releaseAt, Approved Blocks
// Expected in catalog and detail (200 OK).
// Includes an internal review note to verify projection strips internal markers.
// ---------------------------------------------------------------------------

export const FIXTURE_A_SLUG = 'r05-3b-challenge-a-released'
export const FIXTURE_A_ID = 'r05-3b-challenge-a-released'

export const FIXTURE_A_DOCUMENT: SyntheticChallengeDocument = {
  _id: FIXTURE_A_ID,
  _type: 'challenge',
  title: 'Synthetic Released Challenge A',
  slug: { _type: 'slug', current: FIXTURE_A_SLUG },
  challengeType: 'teaching',
  series: { _type: 'reference', _ref: SYNTHETIC_SERIES_ID },
  sequence: 1,
  releaseAt: '2026-11-01T05:00:00.000Z',
  summary: 'Synthetic test summary for past-released challenge A.',
  primaryScripture: makeSyntheticScripture('Romans 12:12'),
  screens: [
    {
      _key: 'screen-r05-3b-a1',
      _type: 'challengeScreen',
      screenLabel: 'Encounter',
      heading: 'Synthetic Screen A1',
      blocks: [
        {
          _key: 'block-r05-3b-a1-stmt',
          _type: 'statementBlock',
          text: 'Synthetic statement for acceptance testing.',
          label: 'Synthetic Note',
        },
        {
          _key: 'block-r05-3b-a1-comp',
          _type: 'comparisonBlock',
          left: {
            title: 'Synthetic Left Aspect',
            body: [makeParagraph('comp-a-left', 'Synthetic left body content.')],
          },
          right: {
            title: 'Synthetic Right Aspect',
            body: [makeParagraph('comp-a-right', 'Synthetic right body content.')],
          },
          footer: 'Synthetic comparison footer.',
          reviewStatus: 'approved',
        },
        {
          _key: 'block-r05-3b-a1-study',
          _type: 'optionalStudyBlock',
          title: 'Synthetic Optional Study',
          body: [makeParagraph('study-a-body', 'Synthetic study body.')],
          scriptures: [
            {
              _key: 'scripture-a-study-1',
              _type: 'scriptureReference',
              ...makeSyntheticScripture('Romans 12:13'),
            },
          ],
          reviewStatus: 'approved',
        },
      ],
    },
  ],
  companionLinks: [
    {
      _key: 'link-r05-3b-a1',
      _type: 'companionLink',
      provider: 'other',
      label: 'Synthetic Companion Link',
      url: 'https://example.com/synthetic-companion',
      description: 'Synthetic companion description.',
    },
  ],
  editorialReview: {
    _type: 'editorialReview',
    sourceTitle: 'Synthetic Acceptance Test Specification',
    adaptationReviewed: true,
    reviewedBy: 'Aaron Waid (technical synthetic approval)',
    reviewedAt: '2026-11-08T12:00:00.000Z',
    reviewNotes:
      'SIMULATED SYNTHETIC ELIGIBILITY: Internal review marker for R05 Stage 3B testing only. Must never leak to reader projection. Not real editorial approval.',
  },
}

// ---------------------------------------------------------------------------
// 4. Fixture B: Published, Reviewed, Future releaseAt, Otherwise Valid
// Expected absent from catalog and neutral 404 in detail (zero leakage).
// Uses distant future releaseAt (2099-01-01) for durable live embargo testing.
// ---------------------------------------------------------------------------

export const FIXTURE_B_SLUG = 'r05-3b-challenge-b-future'
export const FIXTURE_B_ID = 'r05-3b-challenge-b-future'

export const FIXTURE_B_DOCUMENT: SyntheticChallengeDocument = {
  _id: FIXTURE_B_ID,
  _type: 'challenge',
  title: 'Synthetic Future Challenge B',
  slug: { _type: 'slug', current: FIXTURE_B_SLUG },
  challengeType: 'teaching',
  series: { _type: 'reference', _ref: SYNTHETIC_SERIES_ID },
  sequence: 2,
  releaseAt: '2099-01-01T00:00:00.000Z',
  summary: 'Synthetic test summary for future-dated challenge B.',
  primaryScripture: makeSyntheticScripture('Romans 12:14'),
  screens: [
    {
      _key: 'screen-r05-3b-b1',
      _type: 'challengeScreen',
      screenLabel: 'Encounter',
      heading: 'Synthetic Screen B1',
      blocks: [
        {
          _key: 'block-r05-3b-b1-stmt',
          _type: 'statementBlock',
          text: 'Synthetic future statement that must remain embargoed.',
          label: 'Synthetic Note',
        },
      ],
    },
  ],
  editorialReview: {
    _type: 'editorialReview',
    sourceTitle: 'Synthetic Acceptance Test Specification',
    adaptationReviewed: true,
    reviewedBy: 'Aaron Waid (technical synthetic approval)',
    reviewedAt: '2026-11-08T12:00:00.000Z',
    reviewNotes:
      'SIMULATED SYNTHETIC ELIGIBILITY: Future challenge review marker for R05 Stage 3B testing only. Not real editorial approval.',
  },
}

// ---------------------------------------------------------------------------
// 5. Fixture C: Published, Unreviewed, Past releaseAt
// Expected absent from catalog and neutral 404 in detail.
// ---------------------------------------------------------------------------

export const FIXTURE_C_SLUG = 'r05-3b-challenge-c-unreviewed'
export const FIXTURE_C_ID = 'r05-3b-challenge-c-unreviewed'

export const FIXTURE_C_DOCUMENT: SyntheticChallengeDocument = {
  _id: FIXTURE_C_ID,
  _type: 'challenge',
  title: 'Synthetic Unreviewed Challenge C',
  slug: { _type: 'slug', current: FIXTURE_C_SLUG },
  challengeType: 'teaching',
  series: { _type: 'reference', _ref: SYNTHETIC_SERIES_ID },
  sequence: 3,
  releaseAt: '2026-11-01T05:00:00.000Z',
  summary: 'Synthetic test summary for unreviewed challenge C.',
  primaryScripture: makeSyntheticScripture('Romans 12:15'),
  screens: [
    {
      _key: 'screen-r05-3b-c1',
      _type: 'challengeScreen',
      screenLabel: 'Encounter',
      heading: 'Synthetic Screen C1',
      blocks: [
        {
          _key: 'block-r05-3b-c1-stmt',
          _type: 'statementBlock',
          text: 'Synthetic unreviewed statement that must not be admitted.',
          label: 'Synthetic Note',
        },
      ],
    },
  ],
  editorialReview: {
    _type: 'editorialReview',
    sourceTitle: 'Synthetic Acceptance Test Specification',
    adaptationReviewed: false,
  },
}

// ---------------------------------------------------------------------------
// 6. Fixture D: Draft-Only, Past releaseAt, Otherwise Structurally Valid
// Expected absent from catalog and neutral 404 in detail.
// ---------------------------------------------------------------------------

export const FIXTURE_D_SLUG = 'r05-3b-challenge-d-draft'
export const FIXTURE_D_ID = 'drafts.r05-3b-challenge-d-draft'

export const FIXTURE_D_DOCUMENT: SyntheticChallengeDocument = {
  _id: FIXTURE_D_ID,
  _type: 'challenge',
  title: 'Synthetic Draft-Only Challenge D',
  slug: { _type: 'slug', current: FIXTURE_D_SLUG },
  challengeType: 'teaching',
  series: { _type: 'reference', _ref: SYNTHETIC_SERIES_ID },
  sequence: 4,
  releaseAt: '2026-11-01T05:00:00.000Z',
  summary: 'Synthetic test summary for draft challenge D.',
  primaryScripture: makeSyntheticScripture('Romans 12:16'),
  screens: [
    {
      _key: 'screen-r05-3b-d1',
      _type: 'challengeScreen',
      screenLabel: 'Encounter',
      heading: 'Synthetic Screen D1',
      blocks: [
        {
          _key: 'block-r05-3b-d1-stmt',
          _type: 'statementBlock',
          text: 'Synthetic draft statement that must never reach reader clients.',
          label: 'Synthetic Note',
        },
      ],
    },
  ],
  editorialReview: {
    _type: 'editorialReview',
    sourceTitle: 'Synthetic Acceptance Test Specification',
    adaptationReviewed: true,
    reviewedBy: 'Aaron Waid (technical synthetic approval)',
    reviewedAt: '2026-11-08T12:00:00.000Z',
    reviewNotes:
      'SIMULATED SYNTHETIC ELIGIBILITY: Draft fixture marker for R05 Stage 3B testing only. Not real editorial approval.',
  },
}

// ---------------------------------------------------------------------------
// 7. Fixture F: Published, Reviewed, Past releaseAt, but Unapproved Structured Block
// Expected absent from catalog and neutral 404 in detail.
// ---------------------------------------------------------------------------

export const FIXTURE_F_SLUG = 'r05-3b-challenge-f-unapproved-block'
export const FIXTURE_F_ID = 'r05-3b-challenge-f-unapproved-block'

export const FIXTURE_F_DOCUMENT: SyntheticChallengeDocument = {
  _id: FIXTURE_F_ID,
  _type: 'challenge',
  title: 'Synthetic Unapproved Block Challenge F',
  slug: { _type: 'slug', current: FIXTURE_F_SLUG },
  challengeType: 'teaching',
  series: { _type: 'reference', _ref: SYNTHETIC_SERIES_ID },
  sequence: 5,
  releaseAt: '2026-11-01T05:00:00.000Z',
  summary: 'Synthetic test summary for challenge with unapproved structured block.',
  primaryScripture: makeSyntheticScripture('Romans 12:17'),
  screens: [
    {
      _key: 'screen-r05-3b-f1',
      _type: 'challengeScreen',
      screenLabel: 'Encounter',
      heading: 'Synthetic Screen F1',
      blocks: [
        {
          _key: 'block-r05-3b-f1-comp',
          _type: 'comparisonBlock',
          left: {
            title: 'Synthetic Left Aspect',
            body: [makeParagraph('comp-f-left', 'Synthetic left content.')],
          },
          right: {
            title: 'Synthetic Right Aspect',
            body: [makeParagraph('comp-f-right', 'Synthetic right content.')],
          },
          footer: 'Synthetic footer.',
          reviewStatus: 'proposed', // Must fail closed!
        },
      ],
    },
  ],
  editorialReview: {
    _type: 'editorialReview',
    sourceTitle: 'Synthetic Acceptance Test Specification',
    adaptationReviewed: true,
    reviewedBy: 'Aaron Waid (technical synthetic approval)',
    reviewedAt: '2026-11-08T12:00:00.000Z',
  },
}

// Case E: Nonexistent / Invalid Slug
export const NONEXISTENT_SLUG = 'r05-3b-nonexistent-slug'

// ---------------------------------------------------------------------------
// 8. Staging Document Manifest
// ---------------------------------------------------------------------------

export const ALL_SYNTHETIC_STAGING_DOCUMENTS: Array<
  SyntheticChallengeSeriesDocument | SyntheticChallengeDocument
> = [
  SYNTHETIC_SERIES_DOCUMENT,
  FIXTURE_A_DOCUMENT,
  FIXTURE_B_DOCUMENT,
  FIXTURE_C_DOCUMENT,
  FIXTURE_D_DOCUMENT,
  FIXTURE_F_DOCUMENT,
]

export const ALL_SYNTHETIC_DOCUMENT_IDS: readonly string[] = ALL_SYNTHETIC_STAGING_DOCUMENTS.map(
  doc => doc._id,
)

/**
 * Expected acceptance outcome for each fixture case.
 */
export interface FixtureAcceptanceExpectation {
  caseId: 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
  slug: string
  title: string
  expectedInCatalog: boolean
  expectedDetailStatus: number
  expectedErrorReason?: string
  description: string
}

export const ACCEPTANCE_EXPECTATIONS: readonly FixtureAcceptanceExpectation[] = [
  {
    caseId: 'A',
    slug: FIXTURE_A_SLUG,
    title: FIXTURE_A_DOCUMENT.title,
    expectedInCatalog: true,
    expectedDetailStatus: 200,
    description: 'Published, technically reviewed, past releaseAt, approved blocks -> 200 OK and listed in catalog.',
  },
  {
    caseId: 'B',
    slug: FIXTURE_B_SLUG,
    title: FIXTURE_B_DOCUMENT.title,
    expectedInCatalog: false,
    expectedDetailStatus: 404,
    expectedErrorReason: 'embargoed',
    description: 'Published, technically reviewed, future releaseAt -> 404 neutral and omitted from catalog.',
  },
  {
    caseId: 'C',
    slug: FIXTURE_C_SLUG,
    title: FIXTURE_C_DOCUMENT.title,
    expectedInCatalog: false,
    expectedDetailStatus: 404,
    expectedErrorReason: 'unreviewed',
    description: 'Published, unreviewed, past releaseAt -> 404 neutral and omitted from catalog.',
  },
  {
    caseId: 'D',
    slug: FIXTURE_D_SLUG,
    title: FIXTURE_D_DOCUMENT.title,
    expectedInCatalog: false,
    expectedDetailStatus: 404,
    expectedErrorReason: 'draftDocument',
    description: 'Draft-only document -> 404 neutral and omitted from catalog.',
  },
  {
    caseId: 'E',
    slug: NONEXISTENT_SLUG,
    title: 'Nonexistent Slug',
    expectedInCatalog: false,
    expectedDetailStatus: 404,
    expectedErrorReason: 'notFound',
    description: 'Nonexistent/invalid slug -> 404 neutral and omitted from catalog.',
  },
  {
    caseId: 'F',
    slug: FIXTURE_F_SLUG,
    title: FIXTURE_F_DOCUMENT.title,
    expectedInCatalog: false,
    expectedDetailStatus: 404,
    expectedErrorReason: 'unapprovedBlocks',
    description: 'Published, reviewed, past releaseAt, but has unapproved structured block -> 404 neutral and omitted from catalog.',
  },
]

// ---------------------------------------------------------------------------
// 9. Simulation helpers for offline GROQ projection verification
// ---------------------------------------------------------------------------

const REVIEWED_BLOCK_TYPES = new Set([
  'comparisonBlock',
  'visualCardsBlock',
  'connectedSequenceBlock',
  'reflectionBlock',
  'optionalStudyBlock',
])

export function calculateUnapprovedBlockCount(screens: SyntheticScreen[]): number {
  let count = 0
  for (const screen of screens) {
    for (const block of screen.blocks) {
      if (REVIEWED_BLOCK_TYPES.has(block._type) && block.reviewStatus !== 'approved') {
        count += 1
      }
    }
  }
  return count
}

/**
 * Converts a raw synthetic challenge document into the dereferenced structure
 * that Sanity's GROQ query returns for CHALLENGE_BY_SLUG_GROQ_QUERY.
 */
export function toDereferencedDetailDoc(
  doc: SyntheticChallengeDocument,
): Record<string, unknown> {
  return {
    _id: doc._id,
    _type: doc._type,
    title: doc.title,
    slug: doc.slug.current,
    challengeType: doc.challengeType,
    series: {
      _id: SYNTHETIC_SERIES_DOCUMENT._id,
      title: SYNTHETIC_SERIES_DOCUMENT.title,
      slug: SYNTHETIC_SERIES_DOCUMENT.slug.current,
    },
    sequence: doc.sequence,
    releaseAt: doc.releaseAt,
    ...(doc.summary ? { summary: doc.summary } : {}),
    primaryScripture: {
      reference: doc.primaryScripture.reference,
      translation: doc.primaryScripture.translation,
      textStatus: doc.primaryScripture.textStatus,
      usageRightsConfirmed: doc.primaryScripture.usageRightsConfirmed,
      practiceStatus: doc.primaryScripture.practiceStatus,
      ...(doc.primaryScripture.passage ? { passage: doc.primaryScripture.passage } : {}),
    },
    screens: doc.screens,
    ...(doc.companionLinks ? { companionLinks: doc.companionLinks } : {}),
    editorialEligibility: {
      adaptationReviewed: doc.editorialReview.adaptationReviewed,
      reviewedAt: doc.editorialReview.reviewedAt,
    },
    unapprovedBlockCount: calculateUnapprovedBlockCount(doc.screens),
  }
}

/**
 * Converts a raw synthetic challenge document into the dereferenced summary structure
 * that Sanity's GROQ query returns for CATALOG_GROQ_QUERY.
 */
export function toDereferencedCatalogItem(
  doc: SyntheticChallengeDocument,
): Record<string, unknown> {
  return {
    _id: doc._id,
    _type: doc._type,
    title: doc.title,
    slug: doc.slug.current,
    challengeType: doc.challengeType,
    series: {
      _id: SYNTHETIC_SERIES_DOCUMENT._id,
      title: SYNTHETIC_SERIES_DOCUMENT.title,
      slug: SYNTHETIC_SERIES_DOCUMENT.slug.current,
    },
    sequence: doc.sequence,
    releaseAt: doc.releaseAt,
    ...(doc.summary ? { summary: doc.summary } : {}),
    primaryScripture: {
      reference: doc.primaryScripture.reference,
      translation: doc.primaryScripture.translation,
      textStatus: doc.primaryScripture.textStatus,
      usageRightsConfirmed: doc.primaryScripture.usageRightsConfirmed,
      practiceStatus: doc.primaryScripture.practiceStatus,
      ...(doc.primaryScripture.passage ? { passage: doc.primaryScripture.passage } : {}),
    },
    editorialEligibility: {
      adaptationReviewed: doc.editorialReview.adaptationReviewed,
      reviewedAt: doc.editorialReview.reviewedAt,
    },
    unapprovedBlockCount: calculateUnapprovedBlockCount(doc.screens),
  }
}

