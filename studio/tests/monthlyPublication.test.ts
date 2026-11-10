// @ts-nocheck -- Sanity exec runs this Node test file; Studio's browser tsconfig has no Node test types.
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {validateDocument} from '@sanity/validation'
import {createSchema} from 'sanity'
import workspaces from '../sanity.config'
import {initialValueTemplates, MONTHLY_PREVIEW_NEWS_TEMPLATE_ID, MONTHLY_PUBLICATION_TEMPLATE_ID} from '../initialValues/templates'
import {schemaTypes} from '../schemaTypes/index'
import {buildMonthlySlots, computeAdvancePreviewStartDate, daysInMonth} from '../schemaTypes/monthlyHelpers'

type ValidationOptions = Parameters<typeof validateDocument>[0]
type ValidationDocument = ValidationOptions['document']
type ValidationClient = Extract<ValidationOptions, {client: unknown}>['client']

const schema = createSchema({name: 'monthly-test', types: schemaTypes})

const noNetworkClient = {
  fetch: async () => [],
  getDataUrl: () => { throw new Error('Unexpected Sanity network request') },
  request: async () => { throw new Error('Unexpected Sanity network request') },
  observable: {fetch: () => { throw new Error('Unexpected Sanity network fetch') }},
  withConfig() { return this },
} as unknown as ValidationClient

const throwingClient = {
  fetch: async () => { throw new Error('Simulated network failure') },
  getDataUrl: () => { throw new Error('Unexpected Sanity network request') },
  request: async () => { throw new Error('Unexpected Sanity network request') },
  observable: {fetch: () => { throw new Error('Unexpected Sanity network fetch') }},
  withConfig() { return this },
} as unknown as ValidationClient

type MockChallengeState = {
  _id: string
  withdrawn?: boolean
  adaptationReviewed?: boolean
  unapprovedBlockCount?: number
}

function createMockClient({
  publishedChallenges = [],
  otherMonths = [],
}: {
  publishedChallenges?: MockChallengeState[]
  otherMonths?: {_id: string; yearMonth?: string; challengeRefs?: string[]}[]
} = {}): ValidationClient {
  return {
    fetch: async (query: string, params?: Record<string, unknown>) => {
      if (query.includes('_type == "monthlyPublication"')) {
        const baseId = typeof params?.baseId === 'string' ? params.baseId : ''
        const draftId = typeof params?.draftId === 'string' ? params.draftId : ''
        return otherMonths.filter(m => m._id !== baseId && m._id !== draftId)
      }
      if (query.includes('_type == "challenge"')) {
        const ids = Array.isArray(params?.ids) ? (params.ids as string[]) : []
        return publishedChallenges.filter(c => ids.includes(c._id))
      }
      return []
    },
    getDataUrl: () => { throw new Error('Unexpected Sanity network request') },
    request: async () => { throw new Error('Unexpected Sanity network request') },
    observable: {fetch: () => { throw new Error('Unexpected Sanity network fetch') }},
    withConfig() { return this },
  } as unknown as ValidationClient
}

function makeIntroScreen(key: string, label: string, heading: string, ctaLabel?: string) {
  return {
    _key: key,
    _type: 'introductionScreen',
    screenLabel: label,
    heading,
    ...(ctaLabel ? {ctaLabel} : {}),
    blocks: [
      {
        _key: `${key}-b1`,
        _type: 'statementBlock',
        text: `Substantive teaching content for ${heading}.`,
      },
    ],
  }
}

function makeChallengeId(yearMonth: string, day: number): string {
  return `berrymark-challenge-${yearMonth}-day-${String(day).padStart(2, '0')}`
}

function makePopulatedScheduledMonth(year: number, month: number, overrides: Record<string, unknown> = {}) {
  const yearMonth = `${year}-${String(month).padStart(2, '0')}`
  const count = daysInMonth(year, month)
  const slots = buildMonthlySlots(year, month).map((slot, index) => ({
    ...slot,
    challenge: {
      _type: 'reference',
      _ref: makeChallengeId(yearMonth, index + 1),
      _weak: true,
    },
  }))
  const finalizedIds = slots.map(s => s.challenge._ref)
  const publishedChallenges: MockChallengeState[] = finalizedIds.map(_id => ({
    _id,
    withdrawn: false,
    adaptationReviewed: true,
    unapprovedBlockCount: 0,
  }))

  const doc = {
    _id: `month-${yearMonth}`,
    _type: 'monthlyPublication',
    _rev: 'rev-1',
    _createdAt: '2026-11-10T10:00:00Z',
    _updatedAt: '2026-11-10T10:00:00Z',
    yearMonth,
    year,
    month,
    title: `Monthly Theme ${yearMonth}`,
    subtitle: 'Substantive devotional teaching across the full calendar month.',
    editorialStatus: 'scheduled',
    withdrawn: false,
    editorialReview: {
      _type: 'monthlyEditorialReview',
      reviewedBy: 'Alexis Waid (editorial review)',
      reviewerRole: 'theological_editorial',
      reviewedAt: '2026-11-10T10:00:00Z',
    },
    introduction: {
      _type: 'monthlyIntroduction',
      previewScreens: [
        makeIntroScreen('intro-1', 'Preview', 'Encounter the Theme'),
      ],
      welcomeScreen: makeIntroScreen('welcome', 'Welcome', `Welcome to ${yearMonth}`, 'Open Month'),
    },
    slots,
    rosterFinalization: {
      _type: 'rosterFinalization',
      isFinalized: true,
      rosterVersion: 1,
      finalizedAt: '2026-11-10T10:05:00Z',
      finalizedBy: 'Aaron Waid',
      finalizedChallengeIds: finalizedIds,
      priorRosters: [],
    },
    discoveries: [
      {
        _key: 'theme-one',
        _type: 'monthlyDiscovery',
        discoverySlug: 'theme-one',
        title: 'First Biblical Motif',
        qualifyingChallenges: [
          {_type: 'reference', _ref: finalizedIds[0], _weak: true},
          {_type: 'reference', _ref: finalizedIds[Math.min(2, count - 1)], _weak: true},
        ],
        reservedCardId: `card-${yearMonth}-theme-one`,
      },
    ],
    fullMonthCard: {
      title: `Complete ${yearMonth}`,
      reservedCardId: `card-${yearMonth}-full-month`,
    },
    ...overrides,
  } as ValidationDocument

  return {doc, publishedChallenges, finalizedIds}
}

function markerPaths(result: Awaited<ReturnType<typeof validateDocument>>) {
  return result.markers.map(m => m.path.join('.'))
}

// =========================================================================
// 1. Month lengths (28, 29 leap, 30, 31) and deterministic _id / slots
// =========================================================================

test('accepts 28, 29 (leap Feb), 30, and 31 day finalized months when remote Challenges pass', async () => {
  const cases = [
    [2027, 2, 28], // Non-leap Feb
    [2098, 2, 28], // Century non-leap Feb
    [2028, 2, 29], // Leap Feb
    [2096, 2, 29], // Leap Feb
    [2027, 4, 30], // 30-day April
    [2027, 3, 31], // 31-day March
  ] as const

  for (const [year, month, expectedDays] of cases) {
    const {doc, publishedChallenges} = makePopulatedScheduledMonth(year, month)
    assert.equal(doc.slots.length, expectedDays)
    const result = await validateDocument({
      document: doc,
      schema,
      client: createMockClient({publishedChallenges}),
      getDocumentExists: async () => true,
    })
    assert.deepEqual(result.markers, [], `Expected valid ${year}-${month} (${expectedDays} days)`)
  }
})

test('rejects non-deterministic month _id, draft/mismatch _id, and year/month disagreement', async () => {
  const {doc, publishedChallenges} = makePopulatedScheduledMonth(2098, 3)
  const client = createMockClient({publishedChallenges})

  const nonConformingId = {...structuredClone(doc), _id: 'month-2098-03-synthetic'}
  const res1 = await validateDocument({document: nonConformingId, schema, client, getDocumentExists: async () => true})
  assert.ok(markerPaths(res1).includes('_id'))

  const mismatchedMonthId = {...structuredClone(doc), _id: 'month-2098-04'}
  const res2 = await validateDocument({document: mismatchedMonthId, schema, client, getDocumentExists: async () => true})
  assert.ok(markerPaths(res2).includes('_id'))

  // Draft prefix matching month-YYYY-MM is allowed
  const draftId = {...structuredClone(doc), _id: 'drafts.month-2098-03'}
  const res3 = await validateDocument({document: draftId, schema, client, getDocumentExists: async () => true})
  assert.deepEqual(res3.markers, [])

  const wrongYear = {...structuredClone(doc), year: 2099}
  const res4 = await validateDocument({document: wrongYear, schema, client, getDocumentExists: async () => true})
  assert.ok(markerPaths(res4).includes('year'))
})

test('rejects missing, extra, out-of-order, wrong-key, and misaligned civil date slots', async () => {
  const {doc, publishedChallenges} = makePopulatedScheduledMonth(2027, 2)
  const client = createMockClient({publishedChallenges})

  // Missing a day (27 instead of 28)
  const missingSlot = structuredClone(doc)
  missingSlot.slots.pop()
  const resMissing = await validateDocument({document: missingSlot, schema, client, getDocumentExists: async () => true})
  assert.ok(markerPaths(resMissing).includes('slots'))

  // Extra day (29 for non-leap Feb 2027)
  const extraSlot = structuredClone(doc)
  extraSlot.slots.push({
    _key: 'day-29',
    _type: 'monthlyCalendarSlot',
    dayOfMonth: 29,
    date: '2027-02-29',
    slotStatus: 'scheduled',
  })
  const resExtra = await validateDocument({document: extraSlot, schema, client, getDocumentExists: async () => true})
  assert.ok(markerPaths(resExtra).includes('slots'))

  // Out of order dayOfMonth / misaligned date / wrong _key
  const badOrder = structuredClone(doc)
  badOrder.slots[0]._key = 'day-99'
  badOrder.slots[1].dayOfMonth = 3
  badOrder.slots[2].date = '2027-02-15'
  const resBad = await validateDocument({document: badOrder, schema, client, getDocumentExists: async () => true})
  const paths = markerPaths(resBad)
  assert.ok(paths.includes('slots.0._key'))
  assert.ok(paths.includes('slots.1.dayOfMonth'))
  assert.ok(paths.includes('slots.2.date'))
})

// =========================================================================
// 2. Duplicate Challenge assignments (intra-month & cross-month)
// =========================================================================

test('rejects duplicate Challenge assignments within a month and across months', async () => {
  const {doc, publishedChallenges} = makePopulatedScheduledMonth(2027, 4)

  // Intra-month duplicate
  const dupDoc = structuredClone(doc)
  dupDoc.slots[5].challenge = {_type: 'reference', _ref: doc.slots[0].challenge._ref, _weak: true}
  const intraRes = await validateDocument({
    document: dupDoc,
    schema,
    client: createMockClient({publishedChallenges}),
    getDocumentExists: async () => true,
  })
  assert.ok(markerPaths(intraRes).includes('slots.5.challenge'))

  // Cross-month duplicate detected via async client query
  const crossRes = await validateDocument({
    document: doc,
    schema,
    client: createMockClient({
      publishedChallenges,
      otherMonths: [
        {
          _id: 'month-2027-03',
          yearMonth: '2027-03',
          challengeRefs: [doc.slots[0].challenge._ref],
        },
      ],
    }),
    getDocumentExists: async () => true,
  })
  assert.ok(markerPaths(crossRes).includes('slots.0.challenge'))
})

// =========================================================================
// 3. Roster Finalization v1 vs Emergency Amendment v2+ (Option 4A) & V-DISC-SUBSET
// =========================================================================

test('blocks initial roster v1 with withdrawn slots or mismatched finalizedChallengeIds', async () => {
  const {doc, publishedChallenges} = makePopulatedScheduledMonth(2027, 4)
  const client = createMockClient({publishedChallenges})

  // Pre-withdrawn slot in v1
  const withdrawnV1 = structuredClone(doc)
  withdrawnV1.slots[10].slotStatus = 'withdrawn'
  withdrawnV1.slots[10].withdrawalReason = 'Cannot withdraw in v1'
  const resWithdrawnV1 = await validateDocument({document: withdrawnV1, schema, client, getDocumentExists: async () => true})
  assert.ok(markerPaths(resWithdrawnV1).includes('slots.10.slotStatus'))

  // Mismatched finalizedChallengeIds (missing an ID)
  const missingFromRoster = structuredClone(doc)
  missingFromRoster.rosterFinalization.finalizedChallengeIds.pop()
  const resRosterMismatch = await validateDocument({document: missingFromRoster, schema, client, getDocumentExists: async () => true})
  assert.ok(markerPaths(resRosterMismatch).includes('rosterFinalization.finalizedChallengeIds'))

  // Draft prefix inside finalizedChallengeIds
  const draftInRoster = structuredClone(doc)
  draftInRoster.rosterFinalization.finalizedChallengeIds[0] = `drafts.${draftInRoster.rosterFinalization.finalizedChallengeIds[0]}`
  const resDraftRoster = await validateDocument({document: draftInRoster, schema, client, getDocumentExists: async () => true})
  assert.ok(markerPaths(resDraftRoster).includes('rosterFinalization.finalizedChallengeIds'))
})

test('allows emergency slot withdrawal in v2+ with priorRosters & withdrawalReason while enforcing active roster equality & V-DISC-SUBSET', async () => {
  const {doc, publishedChallenges, finalizedIds} = makePopulatedScheduledMonth(2027, 4)
  const withdrawnId = finalizedIds[17] // Day 18
  const remainingIds = finalizedIds.filter(id => id !== withdrawnId)
  const client = createMockClient({
    publishedChallenges: publishedChallenges.filter(c => c._id !== withdrawnId),
  })

  // Valid v2 amendment preserving Day 18 date cell as withdrawn
  const validV2 = structuredClone(doc)
  validV2.slots[17].slotStatus = 'withdrawn'
  validV2.slots[17].withdrawalReason = 'Emergency editorial withdrawal of day 18 pending correction.'
  validV2.rosterFinalization = {
    _type: 'rosterFinalization',
    isFinalized: true,
    rosterVersion: 2,
    finalizedAt: '2027-04-19T12:00:00Z',
    finalizedBy: 'Aaron Waid',
    finalizedChallengeIds: remainingIds,
    priorRosters: [
      {
        _key: 'v1',
        _type: 'rosterAmendmentRecord',
        rosterVersion: 1,
        finalizedChallengeIds: finalizedIds,
        supersededAt: '2027-04-19T12:00:00Z',
        reason: 'Emergency withdrawal of day 18 Challenge.',
      },
    ],
  }

  const resValidV2 = await validateDocument({document: validV2, schema, client, getDocumentExists: async () => true})
  assert.deepEqual(resValidV2.markers, [])

  // V2 missing priorRosters -> rejected
  const missingPrior = structuredClone(validV2)
  missingPrior.rosterFinalization.priorRosters = []
  const resNoPrior = await validateDocument({document: missingPrior, schema, client, getDocumentExists: async () => true})
  assert.ok(markerPaths(resNoPrior).includes('rosterFinalization.priorRosters'))

  // V2 missing withdrawalReason -> rejected
  const noReason = structuredClone(validV2)
  delete noReason.slots[17].withdrawalReason
  const resNoReason = await validateDocument({document: noReason, schema, client, getDocumentExists: async () => true})
  assert.ok(markerPaths(resNoReason).includes('slots.17.withdrawalReason'))

  // V-DISC-SUBSET violation: discovery references withdrawn Challenge -> rejected
  const discSubViolation = structuredClone(validV2)
  discSubViolation.discoveries[0].qualifyingChallenges.push({
    _type: 'reference',
    _ref: withdrawnId,
    _weak: true,
  })
  const resDiscSub = await validateDocument({document: discSubViolation, schema, client, getDocumentExists: async () => true})
  assert.ok(markerPaths(resDiscSub).includes('discoveries.0.qualifyingChallenges'))

  // V-DISC-SUBSET violation: discovery references external Challenge outside roster -> rejected
  const externalViolation = structuredClone(validV2)
  externalViolation.discoveries[0].qualifyingChallenges.push({
    _type: 'reference',
    _ref: 'berrymark-challenge-not-in-this-month',
    _weak: true,
  })
  const resExternal = await validateDocument({document: externalViolation, schema, client, getDocumentExists: async () => true})
  assert.ok(markerPaths(resExternal).includes('discoveries.0.qualifyingChallenges'))
})

// =========================================================================
// 4. Preview/Welcome gates, limitless intro screens, reviewer roles, coverImage alt
// =========================================================================

test('enforces previewScreens and welcomeScreen gates at scheduling while allowing unlimited screen counts', async () => {
  const {doc, publishedChallenges} = makePopulatedScheduledMonth(2027, 4)
  const client = createMockClient({publishedChallenges})

  // Missing previewScreens when scheduled -> rejected
  const noPreview = structuredClone(doc)
  noPreview.introduction.previewScreens = []
  const resNoPreview = await validateDocument({document: noPreview, schema, client, getDocumentExists: async () => true})
  assert.ok(markerPaths(resNoPreview).includes('introduction.previewScreens'))

  // Missing welcomeScreen when scheduled -> rejected
  const noWelcome = structuredClone(doc)
  delete noWelcome.introduction.welcomeScreen
  const resNoWelcome = await validateDocument({document: noWelcome, schema, client, getDocumentExists: async () => true})
  assert.ok(markerPaths(resNoWelcome).includes('introduction.welcomeScreen'))

  // Many preview screens (e.g., 6 screens with multiple blocks) -> allowed with zero artificial limits!
  const richIntro = structuredClone(doc)
  richIntro.introduction.previewScreens = Array.from({length: 6}, (_, idx) =>
    makeIntroScreen(`intro-${idx + 1}`, `Part ${idx + 1}`, `Substantive Theme Screen ${idx + 1}`),
  )
  const resRichIntro = await validateDocument({document: richIntro, schema, client, getDocumentExists: async () => true})
  assert.deepEqual(resRichIntro.markers, [])
})

test('enforces allowed reviewer roles and coverImage alt text on monthlyPublication', async () => {
  const {doc, publishedChallenges} = makePopulatedScheduledMonth(2027, 4)
  const client = createMockClient({publishedChallenges})

  // technical_synthetic is valid
  const techReviewDoc = structuredClone(doc)
  techReviewDoc.editorialReview = {
    _type: 'monthlyEditorialReview',
    reviewedBy: 'Aaron Waid (synthetic QA)',
    reviewerRole: 'technical_synthetic',
    reviewedAt: '2026-11-10T10:00:00Z',
  }
  const resTech = await validateDocument({document: techReviewDoc, schema, client, getDocumentExists: async () => true})
  assert.deepEqual(resTech.markers, [])

  // Unknown reviewerRole -> rejected
  const invalidRole = structuredClone(doc)
  invalidRole.editorialReview.reviewerRole = 'self_approved'
  const resBadRole = await validateDocument({document: invalidRole, schema, client, getDocumentExists: async () => true})
  assert.ok(markerPaths(resBadRole).includes('editorialReview.reviewerRole'))

  // Cover image without alt -> rejected; with alt -> accepted
  const noAlt = structuredClone(doc)
  noAlt.coverImage = {_type: 'image', asset: {_type: 'reference', _ref: 'image-abc-100x100-png'}}
  const resNoAlt = await validateDocument({document: noAlt, schema, client, getDocumentExists: async () => true})
  assert.ok(markerPaths(resNoAlt).includes('coverImage.alt'))

  const withAlt = structuredClone(doc)
  withAlt.coverImage = {
    _type: 'image',
    asset: {_type: 'reference', _ref: 'image-abc-100x100-png'},
    alt: 'Olive branch watercolor illustration',
  }
  const resWithAlt = await validateDocument({document: withAlt, schema, client, getDocumentExists: async () => true})
  assert.deepEqual(resWithAlt.markers, [])
})

// =========================================================================
// 5. Async fail-closed boundary vs non-blocking draft month creation
// =========================================================================

test('fails closed for scheduled month when remote references cannot be verified or fail review/block/withdrawal checks', async () => {
  const {doc, publishedChallenges} = makePopulatedScheduledMonth(2027, 4)

  // Offline / stub client returning [] cannot validate a scheduled month
  const resOfflineScheduled = await validateDocument({
    document: doc,
    schema,
    client: noNetworkClient,
    getDocumentExists: async () => true,
  })
  assert.ok(resOfflineScheduled.markers.length > 0)

  // Throwing client fails closed for scheduled month
  const resThrow = await validateDocument({
    document: doc,
    schema,
    client: throwingClient,
    getDocumentExists: async () => true,
  })
  assert.ok(markerPaths(resThrow).includes('rosterFinalization'))

  // Referenced Challenge missing adaptationReviewed -> fails closed
  const unreviewedChallenges = structuredClone(publishedChallenges)
  unreviewedChallenges[0].adaptationReviewed = false
  const resUnreviewed = await validateDocument({
    document: doc,
    schema,
    client: createMockClient({publishedChallenges: unreviewedChallenges}),
    getDocumentExists: async () => true,
  })
  assert.ok(markerPaths(resUnreviewed).includes('slots.0.challenge'))

  // Referenced Challenge has unapproved blocks -> fails closed
  const unapprovedBlockChallenges = structuredClone(publishedChallenges)
  unapprovedBlockChallenges[1].unapprovedBlockCount = 2
  const resBlocks = await validateDocument({
    document: doc,
    schema,
    client: createMockClient({publishedChallenges: unapprovedBlockChallenges}),
    getDocumentExists: async () => true,
  })
  assert.ok(markerPaths(resBlocks).includes('slots.1.challenge'))

  // Referenced Challenge is withdrawn -> fails closed
  const withdrawnChallenge = structuredClone(publishedChallenges)
  withdrawnChallenge[2].withdrawn = true
  const resWithdrawnChallenge = await validateDocument({
    document: doc,
    schema,
    client: createMockClient({publishedChallenges: withdrawnChallenge}),
    getDocumentExists: async () => true,
  })
  assert.ok(markerPaths(resWithdrawnChallenge).includes('slots.2.challenge'))
})

test('draft monthlyPublication succeeds offline without published Challenges or complete Welcome screen (no circular deadlock)', async () => {
  const draftMonth = {
    _id: 'drafts.month-2027-05',
    _type: 'monthlyPublication',
    yearMonth: '2027-05',
    year: 2027,
    month: 5,
    title: 'May Draft Theme',
    editorialStatus: 'draft',
    withdrawn: false,
    slots: buildMonthlySlots(2027, 5).map((slot, index) =>
      index === 0
        ? {...slot, challenge: {_type: 'reference', _ref: 'berrymark-challenge-draft-only', _weak: true}}
        : slot,
    ),
    rosterFinalization: {
      _type: 'rosterFinalization',
      isFinalized: false,
      rosterVersion: 1,
      finalizedChallengeIds: [],
      priorRosters: [],
    },
    discoveries: [],
  } as ValidationDocument

  const resDraft = await validateDocument({
    document: draftMonth,
    schema,
    client: noNetworkClient,
    getDocumentExists: async () => false,
  })
  assert.deepEqual(resDraft.markers, [])
})

// =========================================================================
// 6. newsArticle monthlyPreview & Feb 27 vs preceding 28 preview date rule
// =========================================================================

test('newsArticle enforces monthlyPreview identity, Feb 27 vs preceding 28 dates, coverImage alt, and editorialReview', async () => {
  const baseNews = {
    _type: 'newsArticle',
    slug: {_type: 'slug', current: 'march-2027-preview'},
    category: 'monthlyPreview',
    title: 'Coming in March 2027: Abiding in the Vine',
    summary: 'Preview next month daily Scripture studies.',
    body: [
      {
        _key: 'b1',
        _type: 'block',
        style: 'normal',
        markDefs: [],
        children: [{_key: 's1', _type: 'span', marks: [], text: 'March begins with John 15.'}],
      },
    ],
    editorialReview: {
      _type: 'monthlyEditorialReview',
      reviewedBy: 'Alexis Waid (editorial review)',
      reviewerRole: 'theological_editorial',
      reviewedAt: '2027-02-20T12:00:00Z',
    },
    withdrawn: false,
  }

  const validPreviewCases = [
    ['2027-03', '2027-02-27'], // March after 28-day Feb -> Feb 27
    ['2028-03', '2028-02-27'], // March after 29-day leap Feb -> Feb 27
    ['2027-04', '2027-03-28'], // April -> March 28
    ['2027-01', '2026-12-28'], // January -> Dec 28 preceding year
  ] as const

  for (const [ym, minDate] of validPreviewCases) {
    assert.equal(
      computeAdvancePreviewStartDate(Number(ym.slice(0, 4)), Number(ym.slice(5, 7))),
      minDate,
    )
    const doc = {
      ...structuredClone(baseNews),
      _id: `news-preview-${ym}`,
      publishOnDate: minDate,
      relatedMonth: {_type: 'reference', _ref: `month-${ym}`, _weak: true},
    } as ValidationDocument
    const res = await validateDocument({document: doc, schema, client: noNetworkClient, getDocumentExists: async () => true})
    assert.deepEqual(res.markers, [], `Expected valid preview news for ${ym} on ${minDate}`)
  }

  // Premature preview date (Feb 26 for March 2027) -> rejected
  const prematureMarch = {
    ...structuredClone(baseNews),
    _id: 'news-preview-2027-03',
    publishOnDate: '2027-02-26',
    relatedMonth: {_type: 'reference', _ref: 'month-2027-03', _weak: true},
  } as ValidationDocument
  const resPremature = await validateDocument({document: prematureMarch, schema, client: noNetworkClient, getDocumentExists: async () => true})
  assert.ok(markerPaths(resPremature).includes('publishOnDate'))

  // Premature preview date (March 27 for April 2027) -> rejected
  const prematureApril = {
    ...structuredClone(baseNews),
    _id: 'news-preview-2027-04',
    publishOnDate: '2027-03-27',
    relatedMonth: {_type: 'reference', _ref: 'month-2027-04', _weak: true},
  } as ValidationDocument
  const resPrematureApr = await validateDocument({document: prematureApril, schema, client: noNetworkClient, getDocumentExists: async () => true})
  assert.ok(markerPaths(resPrematureApr).includes('publishOnDate'))

  // Mismatched _id against relatedMonth -> rejected
  const wrongNewsId = {
    ...structuredClone(baseNews),
    _id: 'news-preview-2027-04',
    publishOnDate: '2027-02-27',
    relatedMonth: {_type: 'reference', _ref: 'month-2027-03', _weak: true},
  } as ValidationDocument
  const resWrongId = await validateDocument({document: wrongNewsId, schema, client: noNetworkClient, getDocumentExists: async () => true})
  assert.ok(markerPaths(resWrongId).includes('_id'))

  // Cover image missing alt -> rejected
  const noAltNews = {
    ...structuredClone(baseNews),
    _id: 'news-preview-2027-03',
    publishOnDate: '2027-02-27',
    relatedMonth: {_type: 'reference', _ref: 'month-2027-03', _weak: true},
    coverImage: {_type: 'image', asset: {_type: 'reference', _ref: 'image-news-1'}},
  } as ValidationDocument
  const resNoAlt = await validateDocument({document: noAltNews, schema, client: noNetworkClient, getDocumentExists: async () => true})
  assert.ok(markerPaths(resNoAlt).includes('coverImage.alt'))

  // Invalid non-leap civil date (2027-02-29) -> rejected
  const badCivilDateNews = {
    ...structuredClone(baseNews),
    _id: 'news-preview-2027-03',
    publishOnDate: '2027-02-29',
    relatedMonth: {_type: 'reference', _ref: 'month-2027-03', _weak: true},
  } as ValidationDocument
  const resBadDate = await validateDocument({document: badCivilDateNews, schema, client: noNetworkClient, getDocumentExists: async () => true})
  assert.ok(markerPaths(resBadDate).includes('publishOnDate'))

  // General ministryUpdate newsArticle (non-monthlyPreview) -> accepted without relatedMonth
  const generalNews = {
    ...structuredClone(baseNews),
    _id: 'news-autumn-welcome',
    category: 'ministryUpdate',
    publishOnDate: '2027-09-15',
  } as ValidationDocument
  const resGeneral = await validateDocument({document: generalNews, schema, client: noNetworkClient, getDocumentExists: async () => true})
  assert.deepEqual(resGeneral.markers, [])
})

// =========================================================================
// 7. Legacy standalone & monthly series-less Challenge compatibility + labels
// =========================================================================

test('accepts standalone legacy Challenge without calendarSlot and monthly Challenge without series, sequence, or releaseAt', async () => {
  const sharedFields = {
    _rev: 'rev-1',
    _createdAt: '2026-11-10T10:00:00Z',
    _updatedAt: '2026-11-10T10:00:00Z',
    challengeType: 'teaching',
    primaryScripture: {
      _type: 'scriptureReference',
      reference: 'John 15:1',
      translation: 'WEBP',
      textStatus: 'referenceOnly',
      usageRightsConfirmed: false,
      practiceStatus: 'notConfigured',
    },
    screens: [
      {
        _key: 's1',
        _type: 'challengeScreen',
        heading: 'Screen 1',
        blocks: [{_key: 'b1', _type: 'statementBlock', text: 'Teaching body.'}],
      },
    ],
    editorialReview: {
      _type: 'editorialReview',
      sourceTitle: 'Manuscript',
      adaptationReviewed: true,
      reviewedBy: 'Alexis Waid',
      reviewedAt: '2026-11-10T10:00:00Z',
    },
  }

  // Legacy Challenge (with series, sequence, releaseAt, and NO calendarSlot)
  const legacyChallenge = {
    ...sharedFields,
    _id: 'r05-3b-challenge-a-released',
    _type: 'challenge',
    title: 'Legacy Challenge',
    slug: {_type: 'slug', current: 'legacy-challenge'},
    series: {_type: 'reference', _ref: 'r05-series', _weak: true},
    sequence: 1,
    releaseAt: '2026-11-01T08:00:00Z',
  } as ValidationDocument
  const legacyRes = await validateDocument({
    document: legacyChallenge,
    schema,
    client: noNetworkClient,
    getDocumentExists: async () => true,
  })
  assert.deepEqual(legacyRes.markers, [])

  // Monthly Challenge (NO series, NO sequence, NO releaseAt, valid independent publish)
  const monthlyChallenge = {
    ...sharedFields,
    _id: 'berrymark-challenge-the-true-vine',
    _type: 'challenge',
    title: 'The True Vine',
    slug: {_type: 'slug', current: 'the-true-vine'},
    withdrawn: false,
    keywords: ['abiding', 'john-15'],
    supersedesChallengeIds: ['old-challenge-the-true-vine'],
  } as ValidationDocument
  const monthlyRes = await validateDocument({
    document: monthlyChallenge,
    schema,
    client: noNetworkClient,
    getDocumentExists: async () => true,
  })
  assert.deepEqual(monthlyRes.markers, [])

  // Invalid supersedesChallengeIds (with drafts. prefix) -> rejected
  const invalidSupersede = {
    ...monthlyChallenge,
    supersedesChallengeIds: ['drafts.old-challenge'],
  } as ValidationDocument
  const resInvalidSup = await validateDocument({
    document: invalidSupersede,
    schema,
    client: noNetworkClient,
    getDocumentExists: async () => true,
  })
  assert.ok(markerPaths(resInvalidSup).includes('supersedesChallengeIds'))
})

test('editorialReview keeps exact wire names while clarifying adaptationReviewed UI label', () => {
  const reviewType = schema.get('editorialReview')
  if (!reviewType || !('fields' in reviewType)) assert.fail('editorialReview type missing')
  const fieldNames = reviewType.fields.map(f => f.name)
  assert.deepEqual(fieldNames, [
    'sourceTitle',
    'sourceRevision',
    'adaptationReviewed',
    'reviewedBy',
    'reviewedAt',
    'reviewNotes',
  ])
  const adaptationField = reviewType.fields.find(f => f.name === 'adaptationReviewed')
  assert.equal(adaptationField?.type.title, 'Editorial adaptation reviewed and approved')
})

// =========================================================================
// 8. Studio workspaces (production and staging only) and initial templates
// =========================================================================

test('Studio configures separate production and staging workspaces and monthly templates', () => {
  assert.ok(Array.isArray(workspaces))
  const datasets = workspaces.map(w => w.dataset)
  assert.deepEqual(datasets, ['production', 'staging'])
  assert.deepEqual(workspaces.map(w => w.basePath), ['/production', '/staging'])
  assert.equal(datasets.includes('berrymark-development'), false)

  const monthTemplate = initialValueTemplates.find(t => t.id === MONTHLY_PUBLICATION_TEMPLATE_ID)
  assert.ok(monthTemplate && typeof monthTemplate.value === 'function')
  const feb2028 = monthTemplate.value({yearMonth: '2028-02'})
  assert.equal(feb2028.slots.length, 29)
  assert.equal(feb2028.slots[28].date, '2028-02-29')

  const newsTemplate = initialValueTemplates.find(t => t.id === MONTHLY_PREVIEW_NEWS_TEMPLATE_ID)
  assert.ok(newsTemplate && typeof newsTemplate.value === 'function')
  const marchNews = newsTemplate.value({yearMonth: '2027-03'})
  assert.equal(marchNews.publishOnDate, '2027-02-27')
})
