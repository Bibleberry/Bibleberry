// @ts-nocheck -- Sanity exec runs this Node test file; Studio's browser tsconfig has no Node test types.
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {validateDocument} from '@sanity/validation'
import {createSchema} from 'sanity'
import {createStructureBuilder} from 'sanity/structure'
import {filterDeterministicNewDocumentOptions} from '../sanity.config'
import {
  GENERAL_NEWS_TEMPLATE_ID,
  initialValueTemplates,
  SCRIPTURE_CARD_TEMPLATE_ID,
} from '../initialValues/templates'
import {schemaTypes} from '../schemaTypes/index'
import {buildMonthlySlots, daysInMonth} from '../schemaTypes/monthlyHelpers'
import {structure} from '../structure'
import {parseDeterministicCardTarget, resolveDeterministicCardChild} from '../structureHelpers'

type ValidationOptions = Parameters<typeof validateDocument>[0]
type ValidationDocument = ValidationOptions['document']
type ValidationClient = Extract<ValidationOptions, {client: unknown}>['client']

const schema = createSchema({name: 'scripture-card-test', types: schemaTypes})

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

type MockCardState = {
  _id: string
  cardCategory?: string
  plannedYearMonth?: string
  editorialStatus?: string
  withdrawn?: boolean
  hasArtwork?: boolean
  illustrationAlt?: string
  accessibleTranscription?: string
  artworkRightsConfirmed?: boolean
  translation?: string
  scriptureRightsConfirmed?: boolean
}

function makeValidCard(
  slug = '2027-03-vineyard-imagery',
  overrides: Record<string, unknown> = {},
): ValidationDocument {
  return {
    _id: `card-${slug}`,
    _type: 'scriptureCard',
    _rev: 'rev-1',
    _createdAt: '2027-02-01T12:00:00Z',
    _updatedAt: '2027-02-01T12:00:00Z',
    title: 'Synthetic Vineyard Card',
    internalTitle: 'March 2027 Thematic Card 1 (Synthetic)',
    slug: {_type: 'slug', current: slug},
    artwork: {
      _type: 'image',
      asset: {_type: 'reference', _ref: 'image-synthetic123-1200x1600-png'},
    },
    assetRevision: 'v1',
    illustrationAlt: 'Synthetic placeholder illustration showing simple botanical line work.',
    accessibleTranscription:
      'Reference-only synthetic placeholder transcription for John 15:1-5 study summary.',
    scriptureCitation: {
      book: 'John',
      reference: 'John 15:1-5',
      translation: 'Not configured',
      usageRightsConfirmed: false,
    },
    theologicalThemes: ['Abiding', 'Fruitfulness'],
    keywords: ['john-15', 'vineyard'],
    rightsAndAttribution: {
      attribution: 'Synthetic QA Fixture (Aaron Waid)',
      rightsStatus: 'Synthetic test placeholder only — no external asset',
      usageRightsConfirmed: true,
    },
    cardCategory: 'monthlyThematic',
    plannedYearMonth: '2027-03',
    sortOrder: 1,
    shareEligible: true,
    editorialStatus: 'approved',
    withdrawn: false,
    editorialReview: {
      _type: 'monthlyEditorialReview',
      reviewedBy: 'Aaron Waid (synthetic QA)',
      reviewerRole: 'technical_synthetic',
      reviewedAt: '2027-02-01T12:00:00Z',
    },
    ...overrides,
  } as ValidationDocument
}

function markerPaths(result: Awaited<ReturnType<typeof validateDocument>>) {
  return result.markers.map(m => m.path.join('.'))
}

function createMonthValidationClient({
  challengeIds,
  publishedCards = [],
  draftCards = [],
  initialPerspective = 'previewDrafts',
  onFetch,
}: {
  challengeIds: string[]
  publishedCards?: MockCardState[]
  draftCards?: MockCardState[]
  initialPerspective?: string
  onFetch?: (info: {perspective: string; query: string}) => void
}): ValidationClient {
  function makeClientWithPerspective(perspective: string): ValidationClient {
    return {
      fetch: async (query: string, params?: Record<string, unknown>) => {
        onFetch?.({perspective, query})
        if (query.includes('_type == "monthlyPublication"')) {
          return []
        }
        if (query.includes('_type == "challenge"')) {
          const ids = Array.isArray(params?.ids) ? (params.ids as string[]) : []
          return challengeIds
            .filter(id => ids.includes(id))
            .map(_id => ({
              _id,
              withdrawn: false,
              adaptationReviewed: true,
              unapprovedBlockCount: 0,
            }))
        }
        if (query.includes('_type == "scriptureCard"')) {
          const cardIds = Array.isArray(params?.cardIds) ? (params.cardIds as string[]) : []
          if (perspective === 'published') {
            return publishedCards.filter(c => cardIds.includes(c._id))
          }
          const byId = new Map<string, MockCardState>()
          for (const pub of publishedCards) byId.set(pub._id, pub)
          for (const draft of draftCards) {
            const baseId = draft._id.replace(/^drafts\./, '')
            byId.set(baseId, {...draft, _id: baseId})
          }
          return [...byId.values()].filter(c => cardIds.includes(c._id))
        }
        return []
      },
      getDataUrl: () => { throw new Error('Unexpected Sanity network request') },
      request: async () => { throw new Error('Unexpected Sanity network request') },
      observable: {fetch: () => { throw new Error('Unexpected Sanity network fetch') }},
      withConfig(nextConfig?: {perspective?: string}) {
        return makeClientWithPerspective(nextConfig?.perspective ?? perspective)
      },
    } as unknown as ValidationClient
  }

  return makeClientWithPerspective(initialPerspective)
}

function makeScheduledMonthWithCards(
  year = 2027,
  month = 3,
  overrides: Record<string, unknown> = {},
) {
  const yearMonth = `${year}-${String(month).padStart(2, '0')}`
  const count = daysInMonth(year, month)
  const slots = buildMonthlySlots(year, month).map((slot, index) => ({
    ...slot,
    challenge: {
      _type: 'reference',
      _ref: `r14-1-challenge-${yearMonth}-day-${String(index + 1).padStart(2, '0')}`,
      _weak: true,
    },
  }))
  const finalizedIds = slots.map(s => s.challenge._ref)
  const thematicId1 = `card-${yearMonth}-motif-one`
  const thematicId2 = `card-${yearMonth}-motif-two`
  const fullMonthId = `card-${yearMonth}-full-month`

  const doc = {
    _id: `month-${yearMonth}`,
    _type: 'monthlyPublication',
    _rev: 'rev-1',
    _createdAt: '2027-02-01T10:00:00Z',
    _updatedAt: '2027-02-01T10:00:00Z',
    yearMonth,
    year,
    month,
    title: `Synthetic Month ${yearMonth}`,
    editorialStatus: 'scheduled',
    withdrawn: false,
    editorialReview: {
      _type: 'monthlyEditorialReview',
      reviewedBy: 'Aaron Waid (synthetic QA)',
      reviewerRole: 'technical_synthetic',
      reviewedAt: '2027-02-01T10:00:00Z',
    },
    introduction: {
      _type: 'monthlyIntroduction',
      previewScreens: [
        {
          _key: 'intro-1',
          _type: 'introductionScreen',
          heading: 'Synthetic Preview',
          blocks: [{_key: 'b1', _type: 'statementBlock', text: 'Synthetic preview text.'}],
        },
      ],
      welcomeScreen: {
        _key: 'welcome',
        _type: 'introductionScreen',
        heading: 'Synthetic Welcome',
        blocks: [{_key: 'w1', _type: 'statementBlock', text: 'Synthetic welcome text.'}],
      },
    },
    slots,
    rosterFinalization: {
      _type: 'rosterFinalization',
      isFinalized: true,
      rosterVersion: 1,
      finalizedAt: '2027-02-01T10:05:00Z',
      finalizedBy: 'Aaron Waid',
      finalizedChallengeIds: finalizedIds,
      priorRosters: [],
    },
    discoveries: [
      {
        _key: 'motif-one',
        _type: 'monthlyDiscovery',
        discoverySlug: 'motif-one',
        title: 'First Synthetic Motif',
        qualifyingChallenges: [
          {_type: 'reference', _ref: finalizedIds[0], _weak: true},
          {_type: 'reference', _ref: finalizedIds[1], _weak: true},
        ],
        card: {_type: 'reference', _ref: thematicId1, _weak: true},
      },
      {
        _key: 'motif-two',
        _type: 'monthlyDiscovery',
        discoverySlug: 'motif-two',
        title: 'Second Synthetic Motif',
        qualifyingChallenges: [
          {_type: 'reference', _ref: finalizedIds[Math.min(4, count - 1)], _weak: true},
        ],
        card: {_type: 'reference', _ref: thematicId2, _weak: true},
      },
    ],
    fullMonthCard: {
      title: `Complete ${yearMonth}`,
      card: {_type: 'reference', _ref: fullMonthId, _weak: true},
    },
    ...overrides,
  } as ValidationDocument

  const publishedCards: MockCardState[] = [
    {
      _id: thematicId1,
      cardCategory: 'monthlyThematic',
      plannedYearMonth: yearMonth,
      editorialStatus: 'approved',
      withdrawn: false,
      hasArtwork: true,
      illustrationAlt: 'Synthetic motif one alt',
      accessibleTranscription: 'Synthetic motif one transcription',
      artworkRightsConfirmed: true,
      translation: 'Not configured',
      scriptureRightsConfirmed: false,
    },
    {
      _id: thematicId2,
      cardCategory: 'monthlyThematic',
      plannedYearMonth: yearMonth,
      editorialStatus: 'approved',
      withdrawn: false,
      hasArtwork: true,
      illustrationAlt: 'Synthetic motif two alt',
      accessibleTranscription: 'Synthetic motif two transcription',
      artworkRightsConfirmed: true,
      translation: 'WEBP',
      scriptureRightsConfirmed: true,
    },
    {
      _id: fullMonthId,
      cardCategory: 'monthlyFull',
      plannedYearMonth: yearMonth,
      editorialStatus: 'approved',
      withdrawn: false,
      hasArtwork: true,
      illustrationAlt: 'Synthetic full month alt',
      accessibleTranscription: 'Synthetic full month transcription',
      artworkRightsConfirmed: true,
      translation: 'Not configured',
      scriptureRightsConfirmed: false,
    },
  ]

  return {doc, finalizedIds, publishedCards, thematicId1, thematicId2, fullMonthId}
}

// =========================================================================
// 1. scriptureCard required metadata, identity, accessibility, rights & review
// =========================================================================

test('scriptureCard accepts valid published and draft documents across supported categories', async () => {
  const published = makeValidCard('2027-03-vineyard-imagery')
  const resPublished = await validateDocument({
    document: published,
    schema,
    client: noNetworkClient,
    getDocumentExists: async () => true,
  })
  assert.deepEqual(resPublished.markers, [])

  const draft = makeValidCard('2027-03-vineyard-imagery', {
    _id: 'drafts.card-2027-03-vineyard-imagery',
    editorialStatus: 'draft',
    editorialReview: undefined,
  })
  const resDraft = await validateDocument({
    document: draft,
    schema,
    client: noNetworkClient,
    getDocumentExists: async ({id}) => id === 'image-synthetic123-1200x1600-png',
  })
  assert.deepEqual(resDraft.markers, [])

  // Non-monthly categories (foundation, tutorial, specialExperience) with free-form collection metadata
  for (const category of ['foundation', 'tutorial', 'specialExperience'] as const) {
    const slug = `synthetic-${category.toLowerCase()}-card`
    const card = makeValidCard(slug, {
      _id: `card-${slug}`,
      cardCategory: category,
      plannedYearMonth: undefined,
      plannedCollection: `Synthetic ${category} collection`,
      scriptureCitation: {
        book: 'Psalms',
        reference: 'Psalm 23:1',
        translation: 'WEBP',
        usageRightsConfirmed: true,
      },
      editorialReview: {
        _type: 'monthlyEditorialReview',
        reviewedBy: 'Alexis Waid (editorial authority)',
        reviewerRole: 'theological_editorial',
        reviewedAt: '2027-02-01T12:00:00Z',
      },
    })
    const res = await validateDocument({
      document: card,
      schema,
      client: noNetworkClient,
      getDocumentExists: async () => true,
    })
    assert.deepEqual(res.markers, [], `Expected valid ${category} card`)
  }
})

test('scriptureCard rejects malformed _id, slug mismatch, and invalid placement/sort/revision fields', async () => {
  const randomUuidCard = makeValidCard('2027-03-vineyard-imagery', {
    _id: 'a1b2c3d4-e5f6-4789-9012-abcdef123456',
  })
  const resUuid = await validateDocument({
    document: randomUuidCard,
    schema,
    client: noNetworkClient,
    getDocumentExists: async () => true,
  })
  assert.ok(markerPaths(resUuid).includes('_id'))

  const mismatchedIdCard = makeValidCard('2027-03-vineyard-imagery', {
    _id: 'card-2027-03-other-card',
  })
  const resMismatch = await validateDocument({
    document: mismatchedIdCard,
    schema,
    client: noNetworkClient,
    getDocumentExists: async () => true,
  })
  assert.ok(markerPaths(resMismatch).includes('_id'))

  const malformedSlugCard = makeValidCard('2027-03-vineyard-imagery', {
    slug: {_type: 'slug', current: 'Bad_Slug With Spaces'},
  })
  const resBadSlug = await validateDocument({
    document: malformedSlugCard,
    schema,
    client: noNetworkClient,
    getDocumentExists: async () => true,
  })
  assert.ok(markerPaths(resBadSlug).includes('slug'))

  const invalidMetaCard = makeValidCard('2027-03-vineyard-imagery', {
    plannedYearMonth: '2027-13',
    sortOrder: 0,
    assetRevision: 'bad revision!',
    theologicalThemes: ['Abiding', 'abiding'],
    keywords: ['vine', ''],
  })
  const resInvalidMeta = await validateDocument({
    document: invalidMetaCard,
    schema,
    client: noNetworkClient,
    getDocumentExists: async () => true,
  })
  const paths = markerPaths(resInvalidMeta)
  assert.ok(paths.includes('plannedYearMonth'))
  assert.ok(paths.includes('sortOrder'))
  assert.ok(paths.includes('assetRevision'))
  assert.ok(paths.includes('theologicalThemes'))
  assert.ok(paths.includes('keywords'))
})

test('scriptureCard enforces artwork and distinct accessibility pairing (image alone is insufficient)', async () => {
  const missingArtwork = makeValidCard('2027-03-vineyard-imagery', {
    artwork: undefined,
  })
  const resNoArt = await validateDocument({
    document: missingArtwork,
    schema,
    client: noNetworkClient,
    getDocumentExists: async () => true,
  })
  assert.ok(markerPaths(resNoArt).includes('artwork'))

  const emptyAssetRef = makeValidCard('2027-03-vineyard-imagery', {
    artwork: {_type: 'image'},
  })
  const resEmptyAsset = await validateDocument({
    document: emptyAssetRef,
    schema,
    client: noNetworkClient,
    getDocumentExists: async () => true,
  })
  assert.ok(markerPaths(resEmptyAsset).includes('artwork'))

  const missingAlt = makeValidCard('2027-03-vineyard-imagery', {
    illustrationAlt: '   ',
  })
  const resNoAlt = await validateDocument({
    document: missingAlt,
    schema,
    client: noNetworkClient,
    getDocumentExists: async () => true,
  })
  assert.ok(markerPaths(resNoAlt).includes('illustrationAlt'))

  const missingTranscription = makeValidCard('2027-03-vineyard-imagery', {
    accessibleTranscription: '',
  })
  const resNoTrans = await validateDocument({
    document: missingTranscription,
    schema,
    client: noNetworkClient,
    getDocumentExists: async () => true,
  })
  assert.ok(markerPaths(resNoTrans).includes('accessibleTranscription'))

  const duplicateAltAndTrans = makeValidCard('2027-03-vineyard-imagery', {
    illustrationAlt: 'Exact same text used for both.',
    accessibleTranscription: 'exact same text used for both.',
  })
  const resDupText = await validateDocument({
    document: duplicateAltAndTrans,
    schema,
    client: noNetworkClient,
    getDocumentExists: async () => true,
  })
  assert.ok(markerPaths(resDupText).includes('accessibleTranscription'))
})

test('scriptureCard enforces Scripture/artwork rights confirmation and truthful review gate', async () => {
  const unconfirmedArtworkRights = makeValidCard('2027-03-vineyard-imagery', {
    rightsAndAttribution: {
      attribution: 'Synthetic QA Fixture',
      rightsStatus: 'Unverified',
      usageRightsConfirmed: false,
    },
  })
  const resArtRights = await validateDocument({
    document: unconfirmedArtworkRights,
    schema,
    client: noNetworkClient,
    getDocumentExists: async () => true,
  })
  assert.ok(markerPaths(resArtRights).includes('rightsAndAttribution.usageRightsConfirmed'))

  const unconfirmedTranslationRights = makeValidCard('2027-03-vineyard-imagery', {
    scriptureCitation: {
      book: 'John',
      reference: 'John 15:1',
      translation: 'WEBP',
      usageRightsConfirmed: false,
    },
  })
  const resScriptureRights = await validateDocument({
    document: unconfirmedTranslationRights,
    schema,
    client: noNetworkClient,
    getDocumentExists: async () => true,
  })
  assert.ok(markerPaths(resScriptureRights).includes('scriptureCitation.usageRightsConfirmed'))

  const approvedWithoutReview = makeValidCard('2027-03-vineyard-imagery', {
    editorialStatus: 'approved',
    editorialReview: undefined,
  })
  const resNoReview = await validateDocument({
    document: approvedWithoutReview,
    schema,
    client: noNetworkClient,
    getDocumentExists: async () => true,
  })
  const reviewPaths = markerPaths(resNoReview)
  assert.ok(reviewPaths.includes('editorialReview.reviewedBy'))
  assert.ok(reviewPaths.includes('editorialReview.reviewerRole'))
  assert.ok(reviewPaths.includes('editorialReview.reviewedAt'))

  const badReviewerRole = makeValidCard('2027-03-vineyard-imagery', {
    editorialStatus: 'inReview',
    editorialReview: {
      _type: 'monthlyEditorialReview',
      reviewerRole: 'auto_approved',
    },
  })
  const resBadRole = await validateDocument({
    document: badReviewerRole,
    schema,
    client: noNetworkClient,
    getDocumentExists: async () => true,
  })
  assert.ok(markerPaths(resBadRole).includes('editorialReview.reviewerRole'))
})

// =========================================================================
// 2. monthlyPublication <-> scriptureCard linking, duplicates & mislinks
// =========================================================================

test('monthlyPublication accepts valid published approved scriptureCard links on discoveries and fullMonthCard', async () => {
  const {doc, finalizedIds, publishedCards} = makeScheduledMonthWithCards(2027, 3)
  const observedPerspectives: string[] = []
  const client = createMonthValidationClient({
    challengeIds: finalizedIds,
    publishedCards,
    initialPerspective: 'previewDrafts',
    onFetch: info => observedPerspectives.push(info.perspective),
  })

  const res = await validateDocument({
    document: doc,
    schema,
    client,
    getDocumentExists: async () => true,
  })
  assert.deepEqual(res.markers, [])
  assert.equal(observedPerspectives.length, 3)
  assert.ok(observedPerspectives.every(p => p === 'published'))
})

test('monthlyPublication rejects intra-month duplicate card references, legacy reservedCardId conflicts, and malformed card refs', async () => {
  const {doc, finalizedIds, publishedCards, thematicId1} = makeScheduledMonthWithCards(2027, 3)
  const client = createMonthValidationClient({
    challengeIds: finalizedIds,
    publishedCards,
  })

  // Duplicate across two discoveries
  const dupDiscoveries = structuredClone(doc)
  dupDiscoveries.discoveries[1].card = {_type: 'reference', _ref: thematicId1, _weak: true}
  const resDupDisc = await validateDocument({
    document: dupDiscoveries,
    schema,
    client,
    getDocumentExists: async () => true,
  })
  assert.ok(markerPaths(resDupDisc).includes('discoveries.1.card'))

  // Duplicate between discovery and fullMonthCard
  const dupFullMonth = structuredClone(doc)
  dupFullMonth.fullMonthCard.card = {_type: 'reference', _ref: thematicId1, _weak: true}
  const resDupFull = await validateDocument({
    document: dupFullMonth,
    schema,
    client,
    getDocumentExists: async () => true,
  })
  assert.ok(markerPaths(resDupFull).includes('fullMonthCard.card'))

  // Conflict between linked card._ref and legacy reservedCardId
  const conflictingLegacy = structuredClone(doc)
  conflictingLegacy.discoveries[0].reservedCardId = 'card-2027-03-different-id'
  const resConflict = await validateDocument({
    document: conflictingLegacy,
    schema,
    client,
    getDocumentExists: async () => true,
  })
  assert.ok(markerPaths(resConflict).includes('discoveries.0.card'))

  // Matching reservedCardId + card._ref is backwards-compatible
  const matchingLegacy = structuredClone(doc)
  matchingLegacy.discoveries[0].reservedCardId = thematicId1
  const resMatching = await validateDocument({
    document: matchingLegacy,
    schema,
    client,
    getDocumentExists: async () => true,
  })
  assert.deepEqual(resMatching.markers, [])

  // Malformed card ref ID
  const malformedRef = structuredClone(doc)
  malformedRef.discoveries[0].card = {_type: 'reference', _ref: 'not-a-card-id', _weak: true}
  const resMalformed = await validateDocument({
    document: malformedRef,
    schema,
    client,
    getDocumentExists: async () => true,
  })
  assert.ok(markerPaths(resMalformed).includes('discoveries.0.card'))
})

test('monthlyPublication fails closed for draft-only, unapproved, withdrawn, or mislinked remote scriptureCard references', async () => {
  const {doc, finalizedIds, publishedCards, thematicId1, fullMonthId} =
    makeScheduledMonthWithCards(2027, 3)

  // 1. Draft-only Card (present in drafts, absent from published) -> fails closed
  const draftOnlyClient = createMonthValidationClient({
    challengeIds: finalizedIds,
    publishedCards: publishedCards.filter(c => c._id !== thematicId1),
    draftCards: [
      {...publishedCards[0], _id: `drafts.${thematicId1}`},
    ],
    initialPerspective: 'previewDrafts',
  })
  const resDraftOnly = await validateDocument({
    document: doc,
    schema,
    client: draftOnlyClient,
    getDocumentExists: async () => true,
  })
  assert.ok(markerPaths(resDraftOnly).includes('discoveries.0.card'))

  // 2. Card with editorialStatus !== 'approved' -> rejected
  const unapprovedCards = publishedCards.map(c =>
    c._id === thematicId1 ? {...c, editorialStatus: 'inReview'} : c,
  )
  const resUnapproved = await validateDocument({
    document: doc,
    schema,
    client: createMonthValidationClient({challengeIds: finalizedIds, publishedCards: unapprovedCards}),
    getDocumentExists: async () => true,
  })
  assert.ok(markerPaths(resUnapproved).includes('discoveries.0.card'))

  // 3. Withdrawn Card -> rejected
  const withdrawnCards = publishedCards.map(c =>
    c._id === fullMonthId ? {...c, withdrawn: true} : c,
  )
  const resWithdrawn = await validateDocument({
    document: doc,
    schema,
    client: createMonthValidationClient({challengeIds: finalizedIds, publishedCards: withdrawnCards}),
    getDocumentExists: async () => true,
  })
  assert.ok(markerPaths(resWithdrawn).includes('fullMonthCard.card'))

  // 4. Mislinked cardCategory (monthlyFull linked in discovery; monthlyThematic linked in fullMonthCard)
  const wrongCategoryCards = publishedCards.map(c => {
    if (c._id === thematicId1) return {...c, cardCategory: 'foundation'}
    if (c._id === fullMonthId) return {...c, cardCategory: 'monthlyThematic'}
    return c
  })
  const resWrongCat = await validateDocument({
    document: doc,
    schema,
    client: createMonthValidationClient({challengeIds: finalizedIds, publishedCards: wrongCategoryCards}),
    getDocumentExists: async () => true,
  })
  const wrongCatPaths = markerPaths(resWrongCat)
  assert.ok(wrongCatPaths.includes('discoveries.0.card'))
  assert.ok(wrongCatPaths.includes('fullMonthCard.card'))

  // 5. Mislinked plannedYearMonth (card planned for 2027-04 linked into month-2027-03)
  const wrongMonthCards = publishedCards.map(c =>
    c._id === thematicId1 ? {...c, plannedYearMonth: '2027-04'} : c,
  )
  const resWrongMonth = await validateDocument({
    document: doc,
    schema,
    client: createMonthValidationClient({challengeIds: finalizedIds, publishedCards: wrongMonthCards}),
    getDocumentExists: async () => true,
  })
  assert.ok(markerPaths(resWrongMonth).includes('discoveries.0.card'))

  // 6. Explicit drafts.card-... _ref in gated month -> rejected
  const draftRefDoc = structuredClone(doc)
  draftRefDoc.discoveries[0].card = {_type: 'reference', _ref: `drafts.${thematicId1}`, _weak: true}
  const resDraftRef = await validateDocument({
    document: draftRefDoc,
    schema,
    client: createMonthValidationClient({challengeIds: finalizedIds, publishedCards}),
    getDocumentExists: async () => true,
  })
  assert.ok(markerPaths(resDraftRef).includes('discoveries.0.card'))

  // 7. Network failure fails closed when scheduled month links cards
  const resNetworkFail = await validateDocument({
    document: doc,
    schema,
    client: throwingClient,
    getDocumentExists: async () => true,
  })
  assert.ok(markerPaths(resNetworkFail).includes('rosterFinalization'))
})

test('monthlyPublication preserves legacy reservedCardId months without requiring scriptureCard refs and preserves V-DISC-SUBSET', async () => {
  const {doc, finalizedIds} = makeScheduledMonthWithCards(2027, 4)
  doc.discoveries = [
    {
      _key: 'legacy-motif',
      _type: 'monthlyDiscovery',
      discoverySlug: 'legacy-motif',
      title: 'Legacy Reserved Card Motif',
      qualifyingChallenges: [{_type: 'reference', _ref: finalizedIds[0], _weak: true}],
      reservedCardId: 'card-2027-04-legacy-motif',
    },
  ]
  doc.fullMonthCard = {
    title: 'Complete 2027-04',
    reservedCardId: 'card-2027-04-full-month',
  }

  // Notice: zero scriptureCard queries should be triggered when no card refs exist
  const observedQueries: string[] = []
  const client = createMonthValidationClient({
    challengeIds: finalizedIds,
    publishedCards: [],
    onFetch: info => observedQueries.push(info.query),
  })
  const resLegacy = await validateDocument({
    document: doc,
    schema,
    client,
    getDocumentExists: async () => true,
  })
  assert.deepEqual(resLegacy.markers, [])
  assert.equal(observedQueries.some(q => q.includes('_type == "scriptureCard"')), false)

  // V-DISC-SUBSET still fails when a discovery with a linked card references an out-of-roster challenge
  const {doc: cardMonth, finalizedIds: cardMonthIds, publishedCards: cardMonthCards} =
    makeScheduledMonthWithCards(2027, 3)
  cardMonth.discoveries[0].qualifyingChallenges.push({
    _type: 'reference',
    _ref: 'r14-1-external-challenge',
    _weak: true,
  })
  const resSubsetViolation = await validateDocument({
    document: cardMonth,
    schema,
    client: createMonthValidationClient({
      challengeIds: cardMonthIds,
      publishedCards: cardMonthCards,
    }),
    getDocumentExists: async () => true,
  })
  assert.ok(markerPaths(resSubsetViolation).includes('discoveries.0.qualifyingChallenges'))
})

// =========================================================================
// 3. Studio navigation, deterministic card opener, and templates
// =========================================================================

test('Studio Structure provides deterministic card-<slug> creation/inspection and filters generic creation', async () => {
  assert.equal(parseDeterministicCardTarget('2027-03-vineyard-imagery').ok, true)
  assert.equal(parseDeterministicCardTarget('card-2027-03-vineyard-imagery').ok, false)
  assert.equal(parseDeterministicCardTarget('Bad_Slug').ok, false)
  assert.equal(parseDeterministicCardTarget('').ok, false)

  const cardTemplate = initialValueTemplates.find(t => t.id === SCRIPTURE_CARD_TEMPLATE_ID)
  assert.ok(cardTemplate && typeof cardTemplate.value === 'function')
  const templateValue = cardTemplate.value({slug: '2027-03-vineyard-imagery'})
  assert.equal(templateValue._type, 'scriptureCard')
  assert.equal(templateValue.slug.current, '2027-03-vineyard-imagery')
  assert.equal(templateValue.editorialStatus, 'draft')

  const testTemplates = initialValueTemplates
  const mockSource = {
    name: 'staging',
    projectId: '80016lrq',
    dataset: 'staging',
    schema,
    templates: testTemplates,
    getClient: () => noNetworkClient,
    currentUser: null,
    authenticated: true,
    document: {
      unstable_fieldActions: [],
      actions: () => [],
      badges: () => [],
      resolveNewDocumentOptions: (creationContext: {type: string; schemaType?: string}) =>
        filterDeterministicNewDocumentOptions(
          testTemplates
            .filter(t => !creationContext.schemaType || t.schemaType === creationContext.schemaType)
            .map(t => ({
              id: t.id,
              templateId: t.id,
              title: t.title,
              schemaType: t.schemaType,
              parameters: t.parameters,
            })),
          creationContext,
        ),
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
    initialValueTemplates?: {templateId: string}[]
    options?: {id?: string; type?: string; template?: string; templateParameters?: Record<string, unknown>}
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
  const rootItems = rootList.items ?? []
  const cardsWorkspace = rootItems.find(item => item.id === 'scripture-cards-workspace')
  assert.ok(cardsWorkspace)

  const cardsMenu = await resolveChild(cardsWorkspace, 'scripture-cards-workspace', rootList, 3)
  const menuIds = (cardsMenu?.items ?? []).map(i => i.id)
  assert.ok(menuIds.includes('all-scripture-cards'))
  assert.ok(menuIds.includes('open-create-scripture-card'))
  assert.ok(menuIds.includes('monthly-thematic-cards'))
  assert.ok(menuIds.includes('monthly-full-cards'))
  assert.ok(menuIds.includes('other-collection-cards'))

  const openerItem = cardsMenu?.items?.find(i => i.id === 'open-create-scripture-card')
  const openerPane = await resolveChild(openerItem, 'open-create-scripture-card', cardsMenu, 1)
  assert.equal(openerPane?.type, 'component')

  const cardDocNode = await resolveChild(openerPane, 'card-2027-03-vineyard-imagery', openerPane, 0)
  assert.equal(cardDocNode?.type, 'document')
  assert.equal(cardDocNode?.options?.id, 'card-2027-03-vineyard-imagery')
  assert.equal(cardDocNode?.options?.type, 'scriptureCard')
  assert.equal(cardDocNode?.options?.template, SCRIPTURE_CARD_TEMPLATE_ID)
  assert.deepEqual(cardDocNode?.options?.templateParameters, {slug: '2027-03-vineyard-imagery'})

  const cardDocAgain = resolveDeterministicCardChild(S, 'card-2027-03-vineyard-imagery').serialize()
  assert.equal(cardDocAgain.options.id, 'card-2027-03-vineyard-imagery')
  assert.throws(() => resolveDeterministicCardChild(S, 'random-uuid-card'))

  const filtered = filterDeterministicNewDocumentOptions(
    [
      {id: 'challenge', templateId: 'challenge', title: 'Challenge'},
      {id: 'challengeSeries', templateId: 'challengeSeries', title: 'Series'},
      {id: 'scriptureCard', templateId: 'scriptureCard', title: 'Scripture Card'},
      {id: SCRIPTURE_CARD_TEMPLATE_ID, templateId: SCRIPTURE_CARD_TEMPLATE_ID, title: 'Card by slug'},
      {id: GENERAL_NEWS_TEMPLATE_ID, templateId: GENERAL_NEWS_TEMPLATE_ID, title: 'General News'},
    ] as Parameters<typeof filterDeterministicNewDocumentOptions>[0],
    {} as Parameters<typeof filterDeterministicNewDocumentOptions>[1],
  )
  assert.deepEqual(
    filtered.map(o => o.templateId),
    ['challenge', 'challengeSeries', GENERAL_NEWS_TEMPLATE_ID],
  )
})
