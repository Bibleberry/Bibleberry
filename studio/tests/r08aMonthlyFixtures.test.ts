// @ts-nocheck -- Sanity exec runs this Node test file; Studio's browser tsconfig has no Node test types.
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {validateDocument} from '@sanity/validation'
import {createSchema} from 'sanity'
import {schemaTypes} from '../schemaTypes/index'
import {
  ALL_R08A_MONTHLY_DOCUMENTS,
  R08A_MONTHLY_CHALLENGE_DOCUMENTS,
  R08A_MONTHLY_NEWS_DOCUMENTS,
  R08A_MONTHLY_PUBLICATION_DOCUMENTS,
  buildR08aNegativeVariants,
  type R08aChallengeDocument,
  type R08aMonthlyPublicationDocument,
} from '../../src/gateway/fixtures/r08aMonthlyFixtures'

type ValidationOptions = Parameters<typeof validateDocument>[0]
type ValidationDocument = ValidationOptions['document']
type ValidationClient = Extract<ValidationOptions, {client: unknown}>['client']

const schema = createSchema({name: 'r08a-fixture-validation', types: schemaTypes})

const REVIEWED_BLOCK_TYPES = new Set([
  'comparisonBlock',
  'visualCardsBlock',
  'connectedSequenceBlock',
  'reflectionBlock',
  'optionalStudyBlock',
])

function createFixtureValidationClient({
  challenges = R08A_MONTHLY_CHALLENGE_DOCUMENTS,
  months = R08A_MONTHLY_PUBLICATION_DOCUMENTS,
  initialPerspective = 'previewDrafts',
}: {
  challenges?: readonly R08aChallengeDocument[]
  months?: readonly R08aMonthlyPublicationDocument[]
  initialPerspective?: string
} = {}): ValidationClient {
  function makeClientWithPerspective(perspective: string): ValidationClient {
    return {
      fetch: async (query: string, params?: Record<string, unknown>) => {
        if (query.includes('_type == "monthlyPublication"')) {
          const baseId = typeof params?.baseId === 'string' ? params.baseId : ''
          const draftId = typeof params?.draftId === 'string' ? params.draftId : ''
          return months
            .filter(m => {
              if (perspective === 'published' && m._id.startsWith('drafts.')) return false
              return m._id !== baseId && m._id !== draftId
            })
            .map(m => ({
              _id: m._id,
              yearMonth: m.yearMonth,
              challengeRefs: m.slots
                .map(s => s.challenge?._ref)
                .filter((ref): ref is string => typeof ref === 'string'),
            }))
        }

        if (query.includes('_type == "challenge"')) {
          const ids = Array.isArray(params?.ids) ? (params.ids as string[]) : []
          return challenges
            .filter(c => {
              if (perspective === 'published' && c._id.startsWith('drafts.')) return false
              return ids.includes(c._id)
            })
            .map(c => ({
              _id: c._id,
              withdrawn: c.withdrawn,
              adaptationReviewed: c.editorialReview.adaptationReviewed,
              unapprovedBlockCount: c.screens.reduce(
                (count, s) =>
                  count +
                  s.blocks.filter(
                    b => REVIEWED_BLOCK_TYPES.has(String(b._type ?? '')) && b.reviewStatus !== 'approved',
                  ).length,
                0,
              ),
            }))
        }

        return []
      },
      getDataUrl: () => {
        throw new Error('Unexpected Sanity network request')
      },
      request: async () => {
        throw new Error('Unexpected Sanity network request')
      },
      observable: {
        fetch: () => {
          throw new Error('Unexpected Sanity network fetch')
        },
      },
      withConfig(nextConfig?: {perspective?: string}) {
        return makeClientWithPerspective(nextConfig?.perspective ?? perspective)
      },
    } as unknown as ValidationClient
  }

  return makeClientWithPerspective(initialPerspective)
}

const existingIds = new Set(ALL_R08A_MONTHLY_DOCUMENTS.map(d => d._id))
const getDocumentExists = async (id: string) => existingIds.has(id)

test('all 4 canonical R08A monthlyPublication documents pass real Studio schema validation', async () => {
  const client = createFixtureValidationClient()
  assert.equal(R08A_MONTHLY_PUBLICATION_DOCUMENTS.length, 4)

  const expectedCounts = new Map([
    ['month-2096-02', 29],
    ['month-2098-02', 28],
    ['month-2098-03', 31],
    ['month-2098-04', 30],
  ])

  for (const monthDoc of R08A_MONTHLY_PUBLICATION_DOCUMENTS) {
    assert.equal(monthDoc.slots.length, expectedCounts.get(monthDoc._id))
    const result = await validateDocument({
      document: monthDoc as unknown as ValidationDocument,
      schema,
      client,
      getDocumentExists,
    })
    assert.deepEqual(
      result.markers,
      [],
      `Expected zero schema validation markers for ${monthDoc._id}, got: ${JSON.stringify(result.markers)}`,
    )
  }
})

test('all 118 generated monthly Challenge documents pass real Studio schema validation without releaseAt or series', async () => {
  const client = createFixtureValidationClient()
  assert.equal(R08A_MONTHLY_CHALLENGE_DOCUMENTS.length, 118)

  for (const ch of R08A_MONTHLY_CHALLENGE_DOCUMENTS) {
    assert.equal('releaseAt' in ch, false, `${ch._id} must not synthesize releaseAt`)
    assert.equal('series' in ch, false, `${ch._id} must not synthesize series`)
    assert.equal('sequence' in ch, false, `${ch._id} must not synthesize sequence`)
    const result = await validateDocument({
      document: ch as unknown as ValidationDocument,
      schema,
      client,
      getDocumentExists,
    })
    assert.deepEqual(
      result.markers,
      [],
      `Expected zero schema validation markers for ${ch._id}, got: ${JSON.stringify(result.markers)}`,
    )
  }
})

test('all 5 generated R08A newsArticle documents pass real Studio schema validation', async () => {
  const client = createFixtureValidationClient()
  assert.equal(R08A_MONTHLY_NEWS_DOCUMENTS.length, 5)

  for (const article of R08A_MONTHLY_NEWS_DOCUMENTS) {
    const result = await validateDocument({
      document: article as unknown as ValidationDocument,
      schema,
      client,
      getDocumentExists,
    })
    assert.deepEqual(
      result.markers,
      [],
      `Expected zero schema validation markers for ${article._id}, got: ${JSON.stringify(result.markers)}`,
    )
  }
})

test('Studio schema validation accepts formal rosterVersion 2 withdrawal variant and rejects negative monthly variants', async () => {
  const variants = buildR08aNegativeVariants()
  const client = createFixtureValidationClient()

  // Formal v2 withdrawal passes Studio schema validation
  {
    const res = await validateDocument({
      document: variants.formalAmendedV2WithdrawalStudio as unknown as ValidationDocument,
      schema,
      client,
      getDocumentExists,
    })
    assert.deepEqual(res.markers, [])
  }

  // Non-conforming month _id is rejected
  {
    const res = await validateDocument({
      document: variants.nonConformingMonthIdStudio as unknown as ValidationDocument,
      schema,
      client,
      getDocumentExists,
    })
    assert.ok(res.markers.some(m => m.path.join('.') === '_id'))
  }

  // Cross-month duplicate reference is rejected by remote month client check
  {
    const foreignSlotMonth = structuredClone(variants.studioBaseApril)
    const marchDay1Id = R08A_MONTHLY_PUBLICATION_DOCUMENTS.find(m => m.yearMonth === '2098-03')!
      .slots[0].challenge!._ref
    foreignSlotMonth.slots[0].challenge = {_type: 'reference', _ref: marchDay1Id, _weak: true}
    foreignSlotMonth.rosterFinalization = {
      ...foreignSlotMonth.rosterFinalization,
      finalizedChallengeIds: foreignSlotMonth.slots.map(s => s.challenge!._ref),
    }
    const res = await validateDocument({
      document: foreignSlotMonth as unknown as ValidationDocument,
      schema,
      client,
      getDocumentExists,
    })
    assert.ok(
      res.markers.some(m => m.message.includes('already assigned to another published monthly publication')),
    )
  }

  // Unreviewed Challenge reference is rejected by remote Challenge check
  {
    const mutatedChallenges = R08A_MONTHLY_CHALLENGE_DOCUMENTS.map((ch, idx) =>
      idx === R08A_MONTHLY_CHALLENGE_DOCUMENTS.length - 1
        ? {
            ...ch,
            editorialReview: {...ch.editorialReview, adaptationReviewed: false},
          }
        : ch,
    )
    const unreviewedClient = createFixtureValidationClient({challenges: mutatedChallenges})
    const res = await validateDocument({
      document: variants.studioBaseApril as unknown as ValidationDocument,
      schema,
      client: unreviewedClient,
      getDocumentExists,
    })
    assert.ok(
      res.markers.some(m => m.message.includes('has not completed editorial adaptation review')),
    )
  }
})
