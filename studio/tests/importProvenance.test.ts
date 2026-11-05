import assert from 'node:assert/strict'
import {test} from 'node:test'
import {validateDocument} from '@sanity/validation'
import {createSchema} from 'sanity'
import {nov2InitialValue} from '../initialValues/nov2'
import {initialValueTemplates} from '../initialValues/templates'
import {schemaTypes} from '../schemaTypes/index'

type ValidationOptions = Parameters<typeof validateDocument>[0]
type ValidationDocument = ValidationOptions['document']
type ValidationClient = Extract<ValidationOptions, {client: unknown}>['client']
type Provenance = Record<string, unknown>

const schema = createSchema({name: 'test', types: schemaTypes})
const digest = (character: string) => character.repeat(64)

// Local stub only: slug uniqueness resolves as unique without making a Sanity request.
const noNetworkClient = {
  fetch: async () => [],
  getDataUrl: () => { throw new Error('Unexpected Sanity network request') },
  request: async () => { throw new Error('Unexpected Sanity network request') },
  observable: {fetch: () => { throw new Error('Unexpected Sanity network fetch') }},
  withConfig() { return this },
} as unknown as ValidationClient

const baseChallenge = {
  _id: 'berrymark-challenge-schema-test',
  _type: 'challenge',
  _rev: 'schema-test-revision',
  _createdAt: '2026-11-04T12:00:00Z',
  _updatedAt: '2026-11-04T12:00:00Z',
  title: 'Schema validation fixture',
  slug: {_type: 'slug', current: 'schema-test'},
  challengeType: 'teaching',
  series: {_type: 'reference', _ref: 'schema-test-series', _weak: true},
  sequence: 1,
  releaseAt: '2026-11-05T09:00:00-05:00',
  primaryScripture: {
    _type: 'scriptureReference',
    reference: '1 Thessalonians 5:16–18',
    translation: 'Not configured',
    textStatus: 'referenceOnly',
    usageRightsConfirmed: false,
    practiceStatus: 'notConfigured',
  },
  screens: [{
    _key: 'screen-one',
    _type: 'challengeScreen',
    heading: 'Schema fixture',
    blocks: [{_key: 'statement-one', _type: 'statementBlock', text: 'Schema fixture teaching.'}],
  }],
  editorialReview: {
    _type: 'editorialReview',
    sourceTitle: 'Schema fixture manuscript',
    adaptationReviewed: true,
    reviewedBy: 'Alexis, author',
    reviewedAt: '2026-11-04T12:00:00Z',
  },
}

const validProvenance: Provenance = {
  _type: 'importProvenance',
  sourceSystem: 'berrymark',
  compilerContract: 'berrymark-contract-04d',
  compilerMode: 'experimental-pure-sanity-compilation',
  canonicalId: 'berrymark-challenge-schema-test',
  sourceFilename: 'devotionals/schema-test.berrymark.md',
  sourceSha256: digest('a'),
  sourceRevision: 'authored-revision-3',
  candidateSha256: digest('b'),
  lastImportedContentSha256: digest('c'),
  lastImportAction: 'create',
  importedBy: 'berrymark-import-operator',
  importedAt: '2026-11-04T12:30:00Z',
}

function challengeWith(provenance?: Provenance, overrides: Record<string, unknown> = {}) {
  return {
    ...structuredClone(baseChallenge),
    ...overrides,
    ...(provenance === undefined ? {} : {importProvenance: structuredClone(provenance)}),
  } as ValidationDocument
}

async function validateChallenge(provenance?: Provenance) {
  return validateDocument({
    document: challengeWith(provenance),
    schema,
    client: noNetworkClient,
    getDocumentExists: async () => true,
  })
}

async function validateChallengeIdentity(provenance: Provenance | undefined, identity: Record<string, unknown>) {
  return validateDocument({
    document: challengeWith(provenance, identity),
    schema,
    client: noNetworkClient,
    getDocumentExists: async () => true,
  })
}

function markerPaths(result: Awaited<ReturnType<typeof validateChallenge>>) {
  return result.markers.map(marker => marker.path.join('.'))
}

test('Challenge exposes optional read-only provenance in the technical group', () => {
  const challengeType = schema.get('challenge')
  if (!challengeType || !('fields' in challengeType)) assert.fail('Challenge schema must have fields.')
  const field = challengeType.fields.find(candidate => candidate.name === 'importProvenance')
  assert.ok(field)
  assert.equal(field.type.name, 'importProvenance')
  assert.equal(field.type.readOnly, true)
  assert.equal(field.group, 'provenance')
})

test('manual Challenges remain valid without import provenance', async () => {
  const result = await validateChallenge()
  assert.equal(result.complete, true)
  assert.deepEqual(result.markers, [])
})

test('complete create and exceptional-update provenance records are accepted', async () => {
  const createResult = await validateChallenge(validProvenance)
  assert.equal(createResult.complete, true)
  assert.deepEqual(createResult.markers, [])

  const update = {
    ...validProvenance,
    lastImportAction: 'update',
    previousSourceSha256: digest('d'),
  }
  const updateResult = await validateChallenge(update)
  assert.equal(updateResult.complete, true)
  assert.deepEqual(updateResult.markers, [])
})

test('provenance accepts canonical published and draft Challenge identities', async () => {
  const published = await validateChallenge(validProvenance)
  assert.equal(published.complete, true)
  assert.deepEqual(published.markers, [])

  const draft = await validateChallengeIdentity(validProvenance, {_id: 'drafts.berrymark-challenge-schema-test'})
  assert.equal(draft.complete, true)
  assert.deepEqual(draft.markers, [])
})

test('provenance identity must match the Challenge slug and document ID', async () => {
  const canonicalIdMismatch = await validateChallenge({
    ...validProvenance,
    canonicalId: 'berrymark-challenge-another-challenge',
  })
  assert.ok(markerPaths(canonicalIdMismatch).includes('importProvenance.canonicalId'))

  const documentIdMismatch = await validateChallengeIdentity(validProvenance, {
    _id: 'berrymark-challenge-another-challenge',
  })
  assert.ok(markerPaths(documentIdMismatch).includes('_id'))

  const missingDocumentId = await validateChallengeIdentity(validProvenance, {_id: undefined})
  assert.ok(markerPaths(missingDocumentId).includes('_id'))

  const malformedSlug = await validateChallengeIdentity(validProvenance, {
    slug: {_type: 'slug'},
  })
  assert.ok(markerPaths(malformedSlug).includes('slug.current'))
})

test('every required provenance field is validated when the object is supplied', async () => {
  const requiredFields = [
    'sourceSystem',
    'compilerContract',
    'compilerMode',
    'canonicalId',
    'sourceFilename',
    'sourceSha256',
    'candidateSha256',
    'lastImportedContentSha256',
    'lastImportAction',
    'importedBy',
    'importedAt',
  ]

  for (const field of requiredFields) {
    const provenance = structuredClone(validProvenance)
    Reflect.deleteProperty(provenance, field)
    const result = await validateChallenge(provenance)
    assert.ok(
      markerPaths(result).includes(`importProvenance.${field}`),
      `${field} should produce a required-field marker; received ${markerPaths(result).join(', ')}`,
    )
  }
})

test('source, candidate, imported-content, and previous-source digests require lowercase SHA-256', async () => {
  const digestFields = [
    'sourceSha256',
    'candidateSha256',
    'lastImportedContentSha256',
  ]

  for (const field of digestFields) {
    for (const invalidValue of [digest('A'), digest('a').slice(1), 'not-a-digest']) {
      const result = await validateChallenge({...validProvenance, [field]: invalidValue})
      assert.ok(markerPaths(result).includes(`importProvenance.${field}`))
    }
  }

  const previousSource = await validateChallenge({
    ...validProvenance,
    lastImportAction: 'update',
    previousSourceSha256: digest('D'),
  })
  assert.ok(markerPaths(previousSource).includes('importProvenance.previousSourceSha256'))
})

test('controlled source, compiler, action, and canonical identity values fail closed', async () => {
  const invalidCases = [
    ['sourceSystem', 'other-system'],
    ['compilerMode', 'unreviewed-compiler-mode'],
    ['lastImportAction', 'none'],
    ['canonicalId', 'drafts.berrymark-challenge-schema-test'],
  ] as const

  for (const [field, value] of invalidCases) {
    const result = await validateChallenge({...validProvenance, [field]: value})
    assert.ok(markerPaths(result).includes(`importProvenance.${field}`))
  }
})

test('updates require previous-source evidence and creates cannot claim it', async () => {
  const missingPrevious = await validateChallenge({...validProvenance, lastImportAction: 'update'})
  assert.ok(markerPaths(missingPrevious).includes('importProvenance.previousSourceSha256'))

  const unexpectedPrevious = await validateChallenge({
    ...validProvenance,
    previousSourceSha256: digest('d'),
  })
  assert.ok(markerPaths(unexpectedPrevious).includes('importProvenance.previousSourceSha256'))
})

test('import time must be present and use a valid datetime', async () => {
  const result = await validateChallenge({...validProvenance, importedAt: 'November 4, 2026'})
  assert.ok(markerPaths(result).includes('importProvenance.importedAt'))
})

test('provenance rejects absolute local source paths and email-shaped operator details', async () => {
  for (const sourceFilename of ['/home/operator/devotional.md', 'C:\\content\\devotional.md', 'file:///private/devotional.md']) {
    const result = await validateChallenge({...validProvenance, sourceFilename})
    assert.ok(markerPaths(result).includes('importProvenance.sourceFilename'))
  }

  const importedBy = await validateChallenge({...validProvenance, importedBy: 'operator@example.com'})
  assert.ok(markerPaths(importedBy).includes('importProvenance.importedBy'))
})

test('provenance never satisfies editorial or structured-block review', async () => {
  const unreviewed = challengeWith(validProvenance) as ValidationDocument & {
    editorialReview?: Record<string, unknown>
    screens: Array<{ blocks: Array<Record<string, unknown>> }>
  }
  unreviewed.editorialReview = {
    _type: 'editorialReview',
    sourceTitle: 'Schema fixture manuscript',
    adaptationReviewed: false,
  }
  unreviewed.screens[0].blocks.push({
    _key: 'reflection-proposed',
    _type: 'reflectionBlock',
    question: 'Does provenance bypass this proposed reflection review?',
    reviewStatus: 'proposed',
  })
  const result = await validateDocument({
    document: unreviewed,
    schema,
    client: noNetworkClient,
    getDocumentExists: async () => true,
  })
  const paths = markerPaths(result)
  assert.ok(paths.includes('editorialReview.adaptationReviewed'))
  assert.ok(paths.includes('screens'))
})

test('November 2 initial values and Challenge Series remain compatible and provenance-free', async () => {
  assert.equal('importProvenance' in nov2InitialValue, false)
  const challengeTemplate = initialValueTemplates.find(template => template.schemaType === 'challenge')
  if (!challengeTemplate) assert.fail('Challenge initial-value template must exist.')
  assert.equal('importProvenance' in challengeTemplate.value, false)

  const seriesResult = await validateDocument({
    document: {
      _id: 'schema-test-series',
      _type: 'challengeSeries',
      _rev: 'schema-test-revision',
      _createdAt: '2026-11-04T12:00:00Z',
      _updatedAt: '2026-11-04T12:00:00Z',
      title: 'Schema test series',
      slug: {_type: 'slug', current: 'schema-test-series'},
    },
    schema,
    client: noNetworkClient,
    getDocumentExists: async () => true,
  })
  assert.deepEqual(seriesResult.markers, [])
})
