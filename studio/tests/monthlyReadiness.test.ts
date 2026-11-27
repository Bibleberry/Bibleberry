// @ts-nocheck -- Sanity exec runs this Node test file; Studio's browser tsconfig has no Node test types.
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {validateDocument} from '@sanity/validation'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createSchema} from 'sanity'
import {createStructureBuilder} from 'sanity/structure'
import {
  ALL_R08A_MONTHLY_DOCUMENTS,
  buildR08aNegativeVariants,
  R08A_MONTHLY_CHALLENGE_DOCUMENTS,
  R08A_MONTHLY_NEWS_DOCUMENTS,
  R08A_MONTHLY_PUBLICATION_DOCUMENTS,
} from '../../src/gateway/fixtures/r08aMonthlyFixtures'
import {MonthlyReadinessView} from '../components/MonthlyReadinessInspector'
import {
  initialValueTemplates,
  MONTHLY_PREVIEW_NEWS_TEMPLATE_ID,
  MONTHLY_PUBLICATION_TEMPLATE_ID,
  SCRIPTURE_CARD_TEMPLATE_ID,
} from '../initialValues/templates'
import {
  evaluateMonthlyReadiness,
} from '../readiness/evaluateReadiness'
import {
  CARDS_METADATA_QUERY,
  CHALLENGES_METADATA_QUERY,
  inspectMonthlyReadiness,
  MONTH_PUBLICATION_METADATA_QUERY,
  PREVIEW_NEWS_METADATA_QUERY,
} from '../readiness/fetchReadinessData'
import type {ReadOnlySanityClient} from '../readiness/types'
import {filterDeterministicNewDocumentOptions} from '../sanity.config'
import {schemaTypes} from '../schemaTypes/index'
import {buildMonthlySlots, daysInMonth} from '../schemaTypes/monthlyHelpers'
import {structure} from '../structure'
import {resolveMonthlyReadinessChild} from '../structureHelpers'
import {createReadOnlyTestClient} from './support/readOnlyReadinessClient'

const schema = createSchema({name: 'monthly-readiness-test', types: schemaTypes})

function makeSyntheticCardDoc(
  slug: string,
  category: 'monthlyThematic' | 'monthlyFull',
  plannedYearMonth: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    _id: `card-${slug}`,
    _type: 'scriptureCard',
    _rev: 'rev-card-1',
    _updatedAt: '2027-02-01T12:00:00Z',
    title: `Card ${slug}`,
    slug: {_type: 'slug', current: slug},
    artwork: {
      _type: 'image',
      asset: {_type: 'reference', _ref: 'image-synthetic123-1200x1600-png'},
    },
    assetRevision: 'v1',
    illustrationAlt: `Illustration alt for ${slug}`,
    accessibleTranscription: `Accessible transcription for ${slug} (John 15:1-5).`,
    scriptureCitation: {
      book: 'John',
      reference: 'John 15:1-5',
      translation: 'WEBP',
      usageRightsConfirmed: true,
    },
    rightsAndAttribution: {
      attribution: 'Synthetic QA Fixture (Aaron Waid)',
      rightsStatus: 'Synthetic test fixture only',
      usageRightsConfirmed: true,
    },
    cardCategory: category,
    plannedYearMonth,
    editorialStatus: 'approved',
    withdrawn: false,
    editorialReview: {
      _type: 'monthlyEditorialReview',
      reviewedBy: 'Aaron Waid (technical synthetic QA)',
      reviewerRole: 'technical_synthetic',
      reviewedAt: '2027-02-01T12:00:00Z',
    },
    ...overrides,
  }
}

function makeFullMonthWithCards(year = 2027, month = 3) {
  const yearMonth = `${year}-${String(month).padStart(2, '0')}`
  const count = daysInMonth(year, month)
  const slots = buildMonthlySlots(year, month).map((slot, index) => ({
    ...slot,
    challenge: {
      _type: 'reference',
      _ref: `r116-challenge-${yearMonth}-day-${String(index + 1).padStart(2, '0')}`,
      _weak: true,
    },
  }))
  const challengeIds = slots.map(s => s.challenge._ref)
  const challenges = challengeIds.map((id, idx) => ({
    _id: id,
    _type: 'challenge',
    _rev: 'rev-ch-1',
    _updatedAt: '2027-02-01T10:00:00Z',
    title: `Synthetic Challenge ${idx + 1}`,
    slug: {_type: 'slug', current: `r116-${yearMonth}-day-${String(idx + 1).padStart(2, '0')}`},
    challengeType: 'teaching',
    withdrawn: false,
    primaryScripture: {
      _type: 'scriptureReference',
      reference: 'John 15:1-5',
      translation: 'Not configured',
      textStatus: 'referenceOnly',
      usageRightsConfirmed: false,
      practiceStatus: 'notConfigured',
    },
    screens: [
      {
        _key: 's1',
        _type: 'challengeScreen',
        heading: 'SECRET_TEACHING_HEADING',
        blocks: [
          {
            _key: 'b1',
            _type: 'statementBlock',
            text: 'SECRET_UNRELEASED_TEACHING_BODY_TEXT',
          },
        ],
      },
    ],
    editorialReview: {
      _type: 'editorialReview',
      sourceTitle: 'Synthetic QA Source',
      adaptationReviewed: true,
      reviewedBy: 'Aaron Waid (technical synthetic QA)',
      reviewedAt: '2027-02-01T10:00:00Z',
    },
  }))

  const thematicCardSlug = `${yearMonth}-vineyard`
  const fullCardSlug = `${yearMonth}-full-month`
  const cards = [
    makeSyntheticCardDoc(thematicCardSlug, 'monthlyThematic', yearMonth),
    makeSyntheticCardDoc(fullCardSlug, 'monthlyFull', yearMonth),
  ]

  const previewNews = {
    _id: `news-preview-${yearMonth}`,
    _type: 'newsArticle',
    _rev: 'rev-news-1',
    _updatedAt: '2027-02-01T10:00:00Z',
    title: `Previewing ${yearMonth}`,
    slug: {_type: 'slug', current: `preview-${yearMonth}`},
    category: 'monthlyPreview',
    summary: 'Synthetic preview summary.',
    body: [{_type: 'block', _key: 'nb1', children: [{_type: 'span', _key: 'ns1', text: 'Preview body.'}]}],
    publishOnDate: month === 3 ? `${year}-02-27` : `${year}-${String(month - 1).padStart(2, '0')}-28`,
    relatedMonth: {_type: 'reference', _ref: `month-${yearMonth}`, _weak: true},
    withdrawn: false,
    editorialReview: {
      _type: 'monthlyEditorialReview',
      reviewedBy: 'Aaron Waid (technical synthetic QA)',
      reviewerRole: 'technical_synthetic',
      reviewedAt: '2027-02-01T10:00:00Z',
    },
  }

  const monthDoc = {
    _id: `month-${yearMonth}`,
    _type: 'monthlyPublication',
    _rev: 'rev-month-1',
    _updatedAt: '2027-02-01T10:00:00Z',
    yearMonth,
    year,
    month,
    title: `Synthetic Month ${yearMonth}`,
    subtitle: 'Synthetic theme subtitle.',
    previewNews: {_type: 'reference', _ref: `news-preview-${yearMonth}`, _weak: true},
    editorialStatus: 'scheduled',
    withdrawn: false,
    editorialReview: {
      _type: 'monthlyEditorialReview',
      reviewedBy: 'Aaron Waid (technical synthetic QA)',
      reviewerRole: 'technical_synthetic',
      reviewedAt: '2027-02-01T10:00:00Z',
    },
    introduction: {
      _type: 'monthlyIntroduction',
      previewScreens: [
        {
          _key: 'intro-1',
          _type: 'introductionScreen',
          heading: 'Intro 1',
          blocks: [{_key: 'ib1', _type: 'statementBlock', text: 'SECRET_INTRO_BODY'}],
        },
      ],
      welcomeScreen: {
        _key: 'welcome',
        _type: 'introductionScreen',
        heading: 'Welcome',
        blocks: [{_key: 'wb1', _type: 'statementBlock', text: 'SECRET_WELCOME_BODY'}],
      },
    },
    slots,
    rosterFinalization: {
      _type: 'rosterFinalization',
      isFinalized: true,
      rosterVersion: 1,
      finalizedAt: '2027-02-01T10:05:00Z',
      finalizedBy: 'Aaron Waid',
      finalizedChallengeIds: challengeIds,
      priorRosters: [],
    },
    discoveries: [
      {
        _key: 'vineyard',
        _type: 'monthlyDiscovery',
        discoverySlug: 'vineyard',
        title: 'Vineyard Imagery',
        qualifyingChallenges: [
          {_type: 'reference', _ref: challengeIds[0], _weak: true},
          {_type: 'reference', _ref: challengeIds[count - 1], _weak: true},
        ],
        card: {_type: 'reference', _ref: `card-${thematicCardSlug}`, _weak: true},
      },
    ],
    fullMonthCard: {
      title: `Complete ${yearMonth}`,
      card: {_type: 'reference', _ref: `card-${fullCardSlug}`, _weak: true},
    },
  }

  return {monthDoc, challenges, cards, previewNews, challengeIds}
}

// =========================================================================
// 1. 28-, 29-, 30-, and 31-day R08A fixture months + v2 withdrawn slot
// =========================================================================

test('read-only inspector produces accurate reports for 28-, 29- (leap Feb), 30-, and 31-day R08A fixture months without mutations', async () => {
  const {client, getMutationCount} = createReadOnlyTestClient({
    months: R08A_MONTHLY_PUBLICATION_DOCUMENTS,
    challenges: R08A_MONTHLY_CHALLENGE_DOCUMENTS,
    news: R08A_MONTHLY_NEWS_DOCUMENTS,
  })

  const expected = [
    {yearMonth: '2098-02', days: 28, previewDate: '2098-01-28'},
    {yearMonth: '2096-02', days: 29, previewDate: '2096-01-28'},
    {yearMonth: '2098-03', days: 31, previewDate: '2098-02-27'},
    {yearMonth: '2098-04', days: 30, previewDate: '2098-03-28'},
  ] as const

  for (const spec of expected) {
    const report = await inspectMonthlyReadiness({
      client,
      dataset: 'staging',
      yearMonth: spec.yearMonth,
      evaluatedAtIso: '2026-11-12T00:00:00.000Z',
    })

    assert.equal(report.expectedMonthDocumentId, `month-${spec.yearMonth}`)
    assert.equal(report.dataset, 'staging')
    assert.equal(report.datasetAuthorized, true)
    assert.equal(report.overallStatus, 'checksPass')
    assert.equal(report.counts.blocking, 0)
    assert.equal(report.counts.needsReview, 0)
    assert.equal(report.counts.unknown, 0)
    assert.equal(report.calendarSummary.expectedDays, spec.days)
    assert.equal(report.calendarSummary.presentSlots, spec.days)
    assert.equal(report.calendarSummary.scheduledSlots, spec.days)
    assert.equal(report.calendarSummary.withdrawnSlots, 0)
    assert.equal(report.challengeSummary.distinctScheduledCount, spec.days)
    assert.equal(report.challengeSummary.publishedAndReadyCount, spec.days)
    assert.equal(report.introductionSummary.advancePreviewStartDate, spec.previewDate)
    assert.equal(report.introductionSummary.monthStartDate, `${spec.yearMonth}-01`)
    assert.equal(report.finalizationSummary.isFinalized, true)
    assert.equal(report.finalizationSummary.matchesActiveScheduledSlots, true)
    assert.equal(report.previewNewsSummary.presence, 'publishedSynced')
    assert.match(report.authorityDisclaimer, /Does not approve, finalize, publish, or authorize reader release/i)
  }

  assert.equal(getMutationCount(), 0)
})

test('handles formal rosterVersion 2 emergency slot withdrawal consistently with Sanity schema validation', async () => {
  const variants = buildR08aNegativeVariants()
  const v2Month = variants.formalAmendedV2WithdrawalStudio
  const otherMonths = R08A_MONTHLY_PUBLICATION_DOCUMENTS.filter(m => m.yearMonth !== '2098-04')
  const {client, getMutationCount} = createReadOnlyTestClient({
    months: [...otherMonths, v2Month],
    challenges: R08A_MONTHLY_CHALLENGE_DOCUMENTS,
    news: R08A_MONTHLY_NEWS_DOCUMENTS,
  })

  // Confirm schema validation passes with 0 markers
  const existingIds = new Set(ALL_R08A_MONTHLY_DOCUMENTS.map(d => d._id))
  const validationResult = await validateDocument({
    document: v2Month as unknown as Parameters<typeof validateDocument>[0]['document'],
    schema,
    client: client as unknown as Parameters<typeof validateDocument>[0]['client'],
    getDocumentExists: async ({id}) => existingIds.has(id),
  })
  assert.deepEqual(validationResult.markers, [])

  const report = await inspectMonthlyReadiness({
    client,
    dataset: 'staging',
    yearMonth: '2098-04',
  })
  assert.equal(report.counts.blocking, 0)
  assert.equal(report.overallStatus, 'checksPass')
  assert.equal(report.calendarSummary.expectedDays, 30)
  assert.equal(report.calendarSummary.scheduledSlots, 29)
  assert.equal(report.calendarSummary.withdrawnSlots, 1)
  assert.equal(report.finalizationSummary.rosterVersion, 2)
  assert.equal(report.finalizationSummary.priorRostersCount, 1)
  assert.equal(report.slots[17].slotStatus, 'withdrawn')
  assert.equal(getMutationCount(), 0)
})

// =========================================================================
// 2. Partially prepared month & draft vs published distinction
// =========================================================================

test('partially prepared draft month surfaces blocking & needs-review items and never reports ready', async () => {
  const draftMonth = {
    _id: 'drafts.month-2027-05',
    _type: 'monthlyPublication',
    yearMonth: '2027-05',
    year: 2027,
    month: 5,
    title: 'Partial May Draft',
    editorialStatus: 'draft',
    withdrawn: false,
    slots: buildMonthlySlots(2027, 5), // all 31 slots unassigned
    rosterFinalization: {
      isFinalized: false,
      rosterVersion: 1,
      finalizedChallengeIds: [],
      priorRosters: [],
    },
    discoveries: [],
  }

  const {client, getMutationCount} = createReadOnlyTestClient({
    months: [draftMonth],
  })

  const report = await inspectMonthlyReadiness({
    client,
    dataset: 'production',
    yearMonth: '2027-05',
  })

  assert.equal(report.overallStatus, 'blocked')
  assert.equal(report.monthSummary.presence, 'draftOnly')
  assert.equal(report.monthSummary.activeSourcePerspective, 'draft')
  assert.equal(report.calendarSummary.unassignedSlots, 31)
  assert.ok(report.counts.blocking >= 31)
  assert.ok(report.counts.needsReview >= 2)
  assert.ok(report.findings.some(f => f.path === 'introduction.previewScreens' && f.severity === 'blocking'))
  assert.ok(report.findings.some(f => f.path === 'introduction.welcomeScreen' && f.severity === 'blocking'))
  assert.ok(report.findings.some(f => f.path === 'rosterFinalization.isFinalized' && f.severity === 'blocking'))
  assert.ok(report.findings.some(f => f.editorTarget?.documentId === 'month-2027-05'))
  assert.equal(getMutationCount(), 0)
})

test('distinguishes published perspective vs draft edits on month, Challenge, and Scripture Card', async () => {
  const {monthDoc, challenges, cards, previewNews} = makeFullMonthWithCards(2027, 3)

  // Clean published month with linked Cards
  {
    const {client} = createReadOnlyTestClient({
      months: [monthDoc],
      challenges,
      cards,
      news: [previewNews],
    })
    const cleanReport = await inspectMonthlyReadiness({
      client,
      dataset: 'staging',
      yearMonth: '2027-03',
    })
    assert.equal(cleanReport.overallStatus, 'checksPass')
    assert.equal(cleanReport.monthSummary.presence, 'publishedSynced')
    assert.equal(cleanReport.discoveryAndCardSummary.publishedApprovedCardCount, 2)
    assert.equal(cleanReport.discoveryAndCardSummary.fullMonthCardStatus, 'linkedAndReady')
  }

  // Same published month + unpublished draft overlays on month, challenge[0], and card[0]
  {
    const draftMonthOverlay = {
      ...structuredClone(monthDoc),
      _id: `drafts.${monthDoc._id}`,
      _rev: 'rev-month-draft-2',
      _updatedAt: '2027-02-02T12:00:00Z',
    }
    const draftChallengeOverlay = {
      ...structuredClone(challenges[0]),
      _id: `drafts.${challenges[0]._id}`,
      _rev: 'rev-ch-draft-2',
      _updatedAt: '2027-02-02T12:00:00Z',
    }
    const draftCardOverlay = {
      ...structuredClone(cards[0]),
      _id: `drafts.${cards[0]._id}`,
      _rev: 'rev-card-draft-2',
      _updatedAt: '2027-02-02T12:00:00Z',
    }

    const {client} = createReadOnlyTestClient({
      months: [monthDoc, draftMonthOverlay],
      challenges: [...challenges, draftChallengeOverlay],
      cards: [...cards, draftCardOverlay],
      news: [previewNews],
    })

    const overlayReport = await inspectMonthlyReadiness({
      client,
      dataset: 'staging',
      yearMonth: '2027-03',
    })
    assert.equal(overlayReport.overallStatus, 'needsReview')
    assert.equal(overlayReport.counts.blocking, 0)
    assert.equal(overlayReport.monthSummary.presence, 'publishedWithDraftEdits')
    assert.equal(overlayReport.challengeSummary.draftPendingEditsCount, 1)
    assert.ok(overlayReport.findings.some(f => f.severity === 'needsReview' && f.perspective === 'both'))
    assert.ok(overlayReport.findings.some(f => f.severity === 'needsReview' && f.category === 'challenge'))
    assert.ok(overlayReport.findings.some(f => f.severity === 'needsReview' && f.category === 'cards'))
  }
})

// =========================================================================
// 3. Negative diagnostics & alignment with @sanity/validation
// =========================================================================

test('surfaces diagnostics aligned with @sanity/validation across Challenge, Card, slot, role, and News defects', async () => {
  const checkAlignmentWithSchema = async ({
    label,
    monthDoc,
    otherMonths = [],
    challenges,
    cards,
    news,
    expectedFindingMatch,
  }: {
    label: string
    monthDoc: Record<string, unknown>
    otherMonths?: Record<string, unknown>[]
    challenges: Record<string, unknown>[]
    cards: Record<string, unknown>[]
    news: Record<string, unknown>[]
    expectedFindingMatch: (report: ReturnType<typeof evaluateMonthlyReadiness>) => boolean
  }) => {
    const {client, getMutationCount} = createReadOnlyTestClient({
      months: [monthDoc, ...otherMonths],
      challenges,
      cards,
      news,
    })

    const existingIds = new Set(
      [monthDoc, ...otherMonths, ...challenges, ...cards, ...news]
        .map(d => String(d._id))
        .filter(id => !id.startsWith('drafts.')),
    )

    const schemaRes = await validateDocument({
      document: monthDoc as unknown as Parameters<typeof validateDocument>[0]['document'],
      schema,
      client: client as unknown as Parameters<typeof validateDocument>[0]['client'],
      getDocumentExists: async ({id}) => existingIds.has(id),
    })

    const report = await inspectMonthlyReadiness({
      client,
      dataset: 'staging',
      yearMonth: String(monthDoc.yearMonth ?? '2027-03'),
    })

    assert.ok(
      schemaRes.markers.length > 0,
      `[${label}] expected schema validation markers > 0`,
    )
    assert.equal(
      report.overallStatus,
      'blocked',
      `[${label}] expected readiness overallStatus "blocked", got "${report.overallStatus}"`,
    )
    assert.ok(
      expectedFindingMatch(report),
      `[${label}] expected matching diagnostic finding in ${JSON.stringify(report.findings)}`,
    )
    assert.equal(getMutationCount(), 0)
  }

  // Case A: Draft-only Challenge
  {
    const {monthDoc, challenges, cards, previewNews} = makeFullMonthWithCards(2027, 3)
    const mutatedChallenges = challenges.map((c, idx) =>
      idx === 0 ? {...c, _id: `drafts.${c._id}`} : c,
    )
    await checkAlignmentWithSchema({
      label: 'draft-only Challenge',
      monthDoc,
      challenges: mutatedChallenges,
      cards,
      news: [previewNews],
      expectedFindingMatch: r =>
        r.challengeSummary.draftOnlyCount === 1 &&
        r.findings.some(f => f.category === 'challenge' && /exists only as a draft/i.test(f.message)),
    })
  }

  // Case B: Unreviewed Challenge + unapproved blocks
  {
    const {monthDoc, challenges, cards, previewNews} = makeFullMonthWithCards(2027, 3)
    const mutatedChallenges = challenges.map((c, idx) =>
      idx === 1
        ? {
            ...c,
            editorialReview: {...c.editorialReview, adaptationReviewed: false},
            screens: [
              {
                _key: 's1',
                _type: 'challengeScreen',
                blocks: [
                  {
                    _key: 'cmp1',
                    _type: 'comparisonBlock',
                    reviewStatus: 'proposed',
                  },
                ],
              },
            ],
          }
        : c,
    )
    await checkAlignmentWithSchema({
      label: 'unreviewed Challenge & unapproved block',
      monthDoc,
      challenges: mutatedChallenges,
      cards,
      news: [previewNews],
      expectedFindingMatch: r =>
        r.challengeSummary.unreviewedOrUnapprovedCount === 1 &&
        r.findings.some(f => /adaptation review/i.test(f.message)) &&
        r.findings.some(f => /unapproved structured editorial block/i.test(f.message)),
    })
  }

  // Case C: Duplicate intra-month slot & cross-month collision
  {
    const {monthDoc, challenges, cards, previewNews} = makeFullMonthWithCards(2027, 3)
    const dupSlotMonth = structuredClone(monthDoc)
    dupSlotMonth.slots[4].challenge = {_type: 'reference', _ref: dupSlotMonth.slots[0].challenge._ref, _weak: true}
    await checkAlignmentWithSchema({
      label: 'intra-month duplicate slot',
      monthDoc: dupSlotMonth,
      challenges,
      cards,
      news: [previewNews],
      expectedFindingMatch: r =>
        r.calendarSummary.duplicateIntraMonthRefs === 1 &&
        r.findings.some(f => /assigned more than once/i.test(f.message)),
    })

    const otherMonth = {
      _id: 'month-2027-04',
      _type: 'monthlyPublication',
      yearMonth: '2027-04',
      slots: [
        {
          _key: 'day-01',
          dayOfMonth: 1,
          date: '2027-04-01',
          slotStatus: 'scheduled',
          challenge: {_type: 'reference', _ref: monthDoc.slots[0].challenge._ref, _weak: true},
        },
      ],
    }
    await checkAlignmentWithSchema({
      label: 'cross-month published collision',
      monthDoc,
      otherMonths: [otherMonth],
      challenges,
      cards,
      news: [previewNews],
      expectedFindingMatch: r =>
        r.calendarSummary.crossMonthPublishedCollisions === 1 &&
        r.findings.some(f => /already assigned to published monthly publication/i.test(f.message)),
    })
  }

  // Case D: Invalid reviewer role
  {
    const {monthDoc, challenges, cards, previewNews} = makeFullMonthWithCards(2027, 3)
    const badRoleMonth = structuredClone(monthDoc)
    badRoleMonth.editorialReview.reviewerRole = 'self_approved'
    await checkAlignmentWithSchema({
      label: 'invalid reviewerRole',
      monthDoc: badRoleMonth,
      challenges,
      cards,
      news: [previewNews],
      expectedFindingMatch: r =>
        r.findings.some(f => f.path === 'editorialReview.reviewerRole' && f.severity === 'blocking'),
    })
  }

  // Case E: Card missing rights & accessibility metadata
  {
    const {monthDoc, challenges, cards, previewNews} = makeFullMonthWithCards(2027, 3)
    const brokenCards = cards.map((card, idx) =>
      idx === 0
        ? {
            ...card,
            illustrationAlt: '',
            accessibleTranscription: '',
            rightsAndAttribution: {
              ...card.rightsAndAttribution,
              usageRightsConfirmed: false,
            },
            scriptureCitation: {
              ...card.scriptureCitation,
              usageRightsConfirmed: false,
            },
          }
        : card,
    )
    await checkAlignmentWithSchema({
      label: 'card missing rights and alt/transcription',
      monthDoc,
      challenges,
      cards: brokenCards,
      news: [previewNews],
      expectedFindingMatch: r =>
        r.findings.some(f => f.category === 'cards' && /illustrationAlt or accessibleTranscription/i.test(f.message)) &&
        r.findings.some(f => f.category === 'cards' && /artwork usage rights/i.test(f.message)) &&
        r.findings.some(f => f.category === 'cards' && /Scripture translation usage rights/i.test(f.message)),
    })
  }

  // Case F: Non-conforming _id
  {
    const {monthDoc, challenges, cards, previewNews} = makeFullMonthWithCards(2027, 3)
    const badIdMonth = {...structuredClone(monthDoc), _id: 'month-2027-03-synthetic'}
    await checkAlignmentWithSchema({
      label: 'non-conforming month _id',
      monthDoc: badIdMonth,
      challenges,
      cards,
      news: [previewNews],
      expectedFindingMatch: r =>
        r.findings.some(f => f.path === '_id' && /deterministic ID "month-2027-03"/i.test(f.message)),
    })
  }

  // Case G: V-DISC-SUBSET violation (external Challenge outside roster)
  {
    const {monthDoc, challenges, cards, previewNews} = makeFullMonthWithCards(2027, 3)
    const badSubsetMonth = structuredClone(monthDoc)
    badSubsetMonth.discoveries[0].qualifyingChallenges.push({
      _type: 'reference',
      _ref: 'external-challenge-outside-month',
      _weak: true,
    })
    await checkAlignmentWithSchema({
      label: 'V-DISC-SUBSET violation',
      monthDoc: badSubsetMonth,
      challenges,
      cards,
      news: [previewNews],
      expectedFindingMatch: r =>
        r.discoveryAndCardSummary.subsetViolationsCount === 1 &&
        r.findings.some(f => f.category === 'discoveries' && /V-DISC-SUBSET violation/i.test(f.message)),
    })
  }

  // Case H: Draft-only Card, wrong cardCategory, and wrong plannedYearMonth
  {
    const {monthDoc, challenges, cards, previewNews} = makeFullMonthWithCards(2027, 3)
    const mutatedCards = [
      {...cards[0], _id: `drafts.${cards[0]._id}`},
      {...cards[1], cardCategory: 'monthlyThematic', plannedYearMonth: '2027-04'},
    ]
    await checkAlignmentWithSchema({
      label: 'draft-only & mislinked Cards',
      monthDoc,
      challenges,
      cards: mutatedCards,
      news: [previewNews],
      expectedFindingMatch: r =>
        r.findings.some(f => f.category === 'cards' && /exists only as a draft/i.test(f.message)) &&
        r.findings.some(f => f.category === 'cards' && /expected "monthlyFull"/i.test(f.message)) &&
        r.findings.some(f => f.category === 'cards' && /plannedYearMonth "2027-04" does not match "2027-03"/i.test(f.message)),
    })
  }

  // Case I: Preview News publishOnDate preceding Feb 27 (validated against newsArticle schema too)
  {
    const {monthDoc, challenges, cards, previewNews} = makeFullMonthWithCards(2027, 3)
    const earlyNews = {...structuredClone(previewNews), publishOnDate: '2027-02-26'}
    const {client} = createReadOnlyTestClient({
      months: [monthDoc],
      challenges,
      cards,
      news: [earlyNews],
    })
    const newsValidation = await validateDocument({
      document: earlyNews as unknown as Parameters<typeof validateDocument>[0]['document'],
      schema,
      client: client as unknown as Parameters<typeof validateDocument>[0]['client'],
      getDocumentExists: async () => true,
    })
    assert.ok(newsValidation.markers.some(m => m.path.join('.') === 'publishOnDate'))

    const report = await inspectMonthlyReadiness({
      client,
      dataset: 'staging',
      yearMonth: '2027-03',
    })
    assert.equal(report.overallStatus, 'blocked')
    assert.ok(
      report.findings.some(
        f => f.category === 'previewNews' && /precedes allowed advance preview start "2027-02-27"/i.test(f.message),
      ),
    )
  }
})

// =========================================================================
// 4. Fail-closed error, missing doc, permission, abort & ambiguity cases
// =========================================================================

test('fails visibly closed on invalid YYYY-MM, dataset ambiguity, missing doc, permission, network, abort, and perspective ambiguity', async () => {
  const {client: okClient, getMutationCount} = createReadOnlyTestClient({})

  // Invalid YYYY-MM
  {
    const res = await inspectMonthlyReadiness({
      client: okClient,
      dataset: 'staging',
      yearMonth: '2027-13',
    })
    assert.equal(res.overallStatus, 'unknown')
    assert.equal(res.counts.unknown, 1)
    assert.ok(res.findings.some(f => f.severity === 'unknown' && /Invalid publication month/i.test(f.message)))
  }

  // Unauthorized dataset (never silently accept non-authorized datasets)
  {
    const res = await inspectMonthlyReadiness({
      client: okClient,
      dataset: 'berrymark-development',
      yearMonth: '2027-03',
    })
    assert.equal(res.overallStatus, 'unknown')
    assert.equal(res.datasetAuthorized, false)
    assert.ok(res.findings.some(f => f.severity === 'unknown' && /Only "production" and "staging"/i.test(f.message)))
  }

  // Missing document in authorized dataset -> blocked with create/open link
  {
    const res = await inspectMonthlyReadiness({
      client: okClient,
      dataset: 'production',
      yearMonth: '2027-08',
    })
    assert.equal(res.overallStatus, 'blocked')
    assert.equal(res.monthSummary.exists, false)
    assert.equal(res.monthSummary.presence, 'missing')
    assert.ok(res.findings.some(f => f.editorTarget?.documentId === 'month-2027-08'))
  }

  // Permission denied (403)
  {
    const forbiddenClient = {
      fetch: async () => {
        const err = new Error('Insufficient permissions (403 Forbidden)') as Error & {statusCode?: number}
        err.statusCode = 403
        throw err
      },
      withConfig() {
        return this
      },
    } as unknown as ReadOnlySanityClient

    const res = await inspectMonthlyReadiness({
      client: forbiddenClient,
      dataset: 'production',
      yearMonth: '2027-03',
    })
    assert.equal(res.overallStatus, 'unknown')
    assert.ok(res.findings.some(f => f.severity === 'unknown' && /permissions/i.test(f.message)))
  }

  // Network failure
  {
    const throwingClient = {
      fetch: async () => {
        throw new Error('ECONNRESET')
      },
      withConfig() {
        return this
      },
    } as unknown as ReadOnlySanityClient

    const res = await inspectMonthlyReadiness({
      client: throwingClient,
      dataset: 'staging',
      yearMonth: '2027-03',
    })
    assert.equal(res.overallStatus, 'unknown')
    assert.ok(res.findings.some(f => f.severity === 'unknown' && /network or query failure/i.test(f.message)))
  }

  // Aborted request
  {
    const controller = new AbortController()
    controller.abort()
    const abortingClient = {
      fetch: async () => {
        const err = new Error('The operation was aborted')
        err.name = 'AbortError'
        throw err
      },
      withConfig() {
        return this
      },
    } as unknown as ReadOnlySanityClient

    const res = await inspectMonthlyReadiness({
      client: abortingClient,
      dataset: 'staging',
      yearMonth: '2027-03',
      signal: controller.signal,
    })
    assert.equal(res.overallStatus, 'unknown')
    assert.ok(res.findings.some(f => f.severity === 'unknown' && /canceled|aborted/i.test(f.message)))
  }

  // Perspective ambiguity: published query leaks a drafts. ID
  {
    const leakyPublishedClient = {
      fetch: async () => [{_id: 'drafts.month-2027-03', yearMonth: '2027-03'}],
      withConfig() {
        return this
      },
    } as unknown as ReadOnlySanityClient

    const res = await inspectMonthlyReadiness({
      client: leakyPublishedClient,
      dataset: 'staging',
      yearMonth: '2027-03',
    })
    assert.equal(res.overallStatus, 'unknown')
    assert.ok(res.findings.some(f => f.severity === 'unknown' && /unexpectedly returned a draft document ID/i.test(f.message)))
  }

  // Misconfigured client lacking withConfig
  {
    const noConfigClient = {
      fetch: async () => [],
    } as unknown as ReadOnlySanityClient

    const res = await inspectMonthlyReadiness({
      client: noConfigClient,
      dataset: 'staging',
      yearMonth: '2027-03',
    })
    assert.equal(res.overallStatus, 'unknown')
    assert.ok(res.findings.some(f => f.severity === 'unknown' && /withConfig/i.test(f.message)))
  }

  assert.equal(getMutationCount(), 0)
})

// =========================================================================
// 5. Privacy/metadata-only query & rendered UI output safety
// =========================================================================

test('GROQ queries omit teaching bodies and artwork URLs, and rendered UI surfaces accessible state without secret leakage', async () => {
  for (const query of [
    MONTH_PUBLICATION_METADATA_QUERY,
    CHALLENGES_METADATA_QUERY,
    CARDS_METADATA_QUERY,
    PREVIEW_NEWS_METADATA_QUERY,
  ]) {
    assert.equal(query.includes('asset->url'), false, 'Queries must never fetch Sanity asset CDN URLs')
    assert.equal(query.includes('passage,'), false, 'Queries must never fetch primaryScripture.passage text')
    assert.equal(query.includes('accessibleTranscription,'), false, 'Queries must never fetch full card transcription text')
  }
  assert.equal(CHALLENGES_METADATA_QUERY.includes('count(screens[].blocks['), true)

  const {monthDoc, challenges, cards, previewNews} = makeFullMonthWithCards(2027, 3)
  const {client} = createReadOnlyTestClient({
    months: [monthDoc],
    challenges,
    cards,
    news: [previewNews],
  })

  const report = await inspectMonthlyReadiness({
    client,
    dataset: 'staging',
    yearMonth: '2027-03',
  })

  const html = renderToStaticMarkup(
    createElement(MonthlyReadinessView, {
      yearMonthInput: '2027-03',
      onYearMonthInputChange: () => {},
      onSubmitYearMonth: () => {},
      onRefresh: () => {},
      loading: false,
      report,
      renderEditorLink: target =>
        createElement('a', {href: `#${target.structureChildId}`}, target.label),
    }),
  )

  assert.match(html, /Monthly Editorial Readiness Inspector/)
  assert.match(html, /Dataset: <strong>staging<\/strong>/)
  assert.match(html, /month-2027-03/)
  assert.match(html, /news-preview-2027-03/)
  assert.match(html, /Operational Checks Clear/)
  assert.match(html, /Does not approve, finalize, publish, or authorize reader release/)
  assert.equal(html.includes('SECRET_UNRELEASED_TEACHING_BODY_TEXT'), false)
  assert.equal(html.includes('SECRET_INTRO_BODY'), false)
  assert.equal(html.includes('SECRET_WELCOME_BODY'), false)
  assert.equal(html.includes('cdn.sanity.io'), false)

  // Verify unknown/error state UI rendering has alert role + Retry button
  const unknownReport = evaluateMonthlyReadiness({
    dataset: 'staging',
    yearMonth: '2027-03',
    monthPublished: null,
    monthDraft: null,
    publishedChallenges: {},
    draftChallenges: {},
    publishedCards: {},
    draftCards: {},
    publishedPreviewNews: null,
    draftPreviewNews: null,
    otherPublishedMonths: [],
    otherDraftMonths: [],
    queryFailure: {
      kind: 'networkError',
      message: 'Simulated network timeout',
    },
  })
  const errorHtml = renderToStaticMarkup(
    createElement(MonthlyReadinessView, {
      yearMonthInput: '2027-03',
      onYearMonthInputChange: () => {},
      onSubmitYearMonth: () => {},
      onRefresh: () => {},
      loading: false,
      report: unknownReport,
    }),
  )
  assert.match(errorHtml, /role="alert"/)
  assert.match(errorHtml, /Unknown \/ Unverified/)
  assert.match(errorHtml, /Retry check/)
  assert.match(errorHtml, /Simulated network timeout/)
})

// =========================================================================
// 6. Studio Structure wiring for MonthlyReadinessInspector
// =========================================================================

test('Studio Structure exposes MonthlyReadinessInspector in Monthly publications workspace and resolves child editor panes', async () => {
  const {client: noNetClient} = createReadOnlyTestClient({})
  const testTemplates = initialValueTemplates
  const mockSource = {
    name: 'staging',
    projectId: '80016lrq',
    dataset: 'staging',
    schema,
    templates: testTemplates,
    getClient: () => noNetClient,
    currentUser: null,
    authenticated: true,
    document: {
      unstable_fieldActions: [],
      actions: () => [],
      badges: () => [],
      resolveNewDocumentOptions: (creationContext: {type: string; schemaType?: string}) =>
        filterDeterministicNewDocumentOptions([], creationContext),
    },
    i18n: {t: (key: string) => key},
    __internal: {
      staticInitialValueTemplateItems: testTemplates.map(t => ({
        id: t.id,
        templateId: t.id,
        title: t.title,
        schemaType: t.schemaType,
        parameters: t.parameters,
      })),
    },
  } as unknown as Parameters<typeof createStructureBuilder>[0]['source']

  const S = createStructureBuilder({
    source: mockSource,
    perspectiveStack: ['drafts'],
  })

  type SerializedNode = {
    id?: string
    type?: string
    items?: SerializedNode[]
    options?: Record<string, unknown>
    child?: SerializedNode | ((id: string, ctx: {parent: unknown; index: number; splitIndex: number}) => unknown)
    serialize?: () => SerializedNode
  }

  const resolveChild = async (
    node: SerializedNode | undefined,
    id: string,
    parent: unknown,
    index = 0,
  ): Promise<SerializedNode | undefined> => {
    if (!node?.child) return undefined
    const resolved = (
      typeof node.child === 'function'
        ? await node.child(id, {parent, index, splitIndex: 0})
        : node.child
    ) as SerializedNode | undefined
    return resolved && typeof resolved.serialize === 'function'
      ? resolved.serialize()
      : resolved
  }

  const rootList = structure(S, {} as Parameters<typeof structure>[1]).serialize() as SerializedNode
  const monthlyRootItem = (rootList.items ?? []).find(i => i.id === 'monthly-publications-workspace')
  const monthlyMenu = await resolveChild(monthlyRootItem, 'monthly-publications-workspace', rootList, 0)
  const monthlyMenuItems = monthlyMenu?.items ?? []

  // Top-level readiness inspector entry
  const readinessRootItem = monthlyMenuItems.find(i => i.id === 'inspect-monthly-readiness')
  assert.ok(readinessRootItem)
  const readinessPane = await resolveChild(readinessRootItem, 'inspect-monthly-readiness', monthlyMenu, 2)
  assert.equal(readinessPane?.type, 'component')
  assert.equal(readinessPane?.id, 'monthly-readiness-inspector')

  // Year -> Month -> Editorial readiness report entry
  const year2027Item = monthlyMenuItems.find(i => i.id === 'months-year-2027')
  const year2027List = await resolveChild(year2027Item, 'months-year-2027', monthlyMenu, 4)
  const marchItem = (year2027List?.items ?? []).find(i => i.id === 'month-entry-2027-03')
  const marchActions = await resolveChild(marchItem, 'month-entry-2027-03', year2027List, 2)
  const inspectMarchItem = (marchActions?.items ?? []).find(i => i.id === 'inspect-readiness-2027-03')
  assert.ok(inspectMarchItem)
  const marchReadinessPane = await resolveChild(inspectMarchItem, 'inspect-readiness-2027-03', marchActions, 2)
  assert.equal(marchReadinessPane?.type, 'component')
  assert.deepEqual(marchReadinessPane?.options, {yearMonth: '2027-03'})

  // Child editor resolvers from readiness links
  const monthNode = resolveMonthlyReadinessChild(S, 'month-2027-03').serialize()
  assert.equal(monthNode.options?.id, 'month-2027-03')
  assert.equal(monthNode.options?.template, MONTHLY_PUBLICATION_TEMPLATE_ID)

  const newsNode = resolveMonthlyReadinessChild(S, 'news-preview-2027-03').serialize()
  assert.equal(newsNode.options?.id, 'news-preview-2027-03')
  assert.equal(newsNode.options?.template, MONTHLY_PREVIEW_NEWS_TEMPLATE_ID)

  const cardNode = resolveMonthlyReadinessChild(S, 'card-2027-03-vineyard').serialize()
  assert.equal(cardNode.options?.id, 'card-2027-03-vineyard')
  assert.equal(cardNode.options?.template, SCRIPTURE_CARD_TEMPLATE_ID)

  const challengeNode = resolveMonthlyReadinessChild(S, 'challenge:berrymark-challenge-the-true-vine').serialize()
  assert.equal(challengeNode.options?.id, 'berrymark-challenge-the-true-vine')
  assert.equal(challengeNode.options?.type, 'challenge')

  assert.throws(() => resolveMonthlyReadinessChild(S, 'unknown-child-id'))
})
