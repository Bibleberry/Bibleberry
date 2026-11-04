import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  mapBerryMarkCompilerResult,
  parseBerryMarkCompilerResult,
} from '../../src/cms/sanity/berryMarkPreview.ts'
import {
  CMS_LAB_STORAGE_KEY,
  type CmsStorage,
} from '../../src/cms/sanity/labState.ts'
import { mapPublishedChallenge } from '../../src/cms/sanity/mapChallenge.ts'
import { validChallengeFixture } from './fixtures.ts'

const editorialSentinel = 'SYNTHETIC_DEVELOPER_ONLY_EDITORIAL_ANNOTATION'

function compilerResultFixture() {
  const publishedShape = structuredClone(validChallengeFixture)
  const slug = publishedShape.slug
  Reflect.deleteProperty(publishedShape, '_id')
  Reflect.deleteProperty(publishedShape, 'series')
  Reflect.deleteProperty(publishedShape, 'sequence')
  Reflect.deleteProperty(publishedShape, 'releaseAt')
  Reflect.deleteProperty(publishedShape, 'editorialEligibility')

  return {
    ok: true,
    mode: 'experimental-pure-sanity-compilation',
    sanityCandidate: {
      ...publishedShape,
      slug: { _type: 'slug', current: slug },
      sequence: null,
      releaseAt: null,
      screens: publishedShape.screens.map(screen => ({
        ...screen,
        blocks: screen.blocks.map(block => 'reviewStatus' in block
          ? { ...block, reviewStatus: 'proposed' }
          : block),
      })),
      editorialReview: {
        _type: 'editorialReview',
        sourceTitle: 'Synthetic BerryMark adapter fixture',
        sourceRevision: 'synthetic-revision-1',
        adaptationReviewed: false,
      },
    },
    reviewReport: {
      schemaComplete: false,
      importReady: false,
      publicationReady: false,
      source: {
        filename: 'synthetic-local-preview.berry.md',
        sha256: 'a'.repeat(64),
        revision: 'synthetic-revision-1',
      },
      authoredMetadata: {
        editorial: { approvalStatus: 'pending' },
      },
      unresolved: [
        { path: 'publishing.series', message: 'Synthetic unresolved series.', line: 3 },
        { path: 'publishing.sequence', message: 'Synthetic unresolved sequence.', line: 4 },
        { path: 'publishing.releaseAt', message: 'Synthetic unresolved release.', line: 5 },
      ],
      editorialItems: [
        { kind: 'EDITORIAL NOTE', status: 'unresolved', text: editorialSentinel, line: 12 },
      ],
    },
    diagnostics: [
      { severity: 'info', message: 'Synthetic compiler diagnostic.' },
    ],
  }
}

test('loads a successful complete compiler result and maps all nine Content Block types in order', () => {
  const result = mapBerryMarkCompilerResult(compilerResultFixture())
  assert.equal(result.ok, true)
  if (!result.ok) return

  const { challenge, review } = result.preview
  assert.equal(challenge.id, 'structural-adapter-fixture')
  assert.equal('documentId' in challenge, false)
  assert.equal('editorial' in challenge, false)
  assert.deepEqual(challenge.screens.map(screen => screen.id), ['screen-encounter', 'screen-response'])
  assert.deepEqual(challenge.screens.flatMap(screen => screen.blocks).map(block => block.type), [
    'scripture',
    'teachingText',
    'statement',
    'contrast',
    'visualCards',
    'connectedSequence',
    'reflectionChoice',
    'optionalExploration',
    'prayer',
  ])
  assert.deepEqual(challenge.screens[0].blocks.map(block => block.id), [
    'block-scripture',
    'block-rich-text',
    'block-statement',
    'block-comparison',
    'block-cards',
  ])
  assert.deepEqual(review.counts, {
    screens: 2,
    contentBlocks: 9,
    optionalStudies: 1,
    nestedScriptures: 2,
    editorialAnnotations: 1,
    diagnostics: 1,
  })
})

test('preserves missing publishing and approval state without manufacturing values', () => {
  const result = mapBerryMarkCompilerResult(compilerResultFixture())
  if (!result.ok) assert.fail('Expected a valid local preview.')

  assert.deepEqual(result.preview.challenge.publishing, {
    seriesTitle: null,
    sequence: null,
    releaseAt: null,
  })
  assert.equal(result.preview.review.approvalStatus, 'pending')
  assert.equal(result.preview.review.adaptationReviewed, false)
  assert.equal(result.preview.review.schemaComplete, false)
  assert.equal(result.preview.review.importReady, false)
  assert.equal(result.preview.review.publicationReady, false)
  assert.equal(result.preview.review.unresolved.length, 3)
  assert.equal('series' in result.preview.challenge, false)
  assert.equal('releaseAtUtc' in result.preview.challenge, false)
})

test('retains proposed structured-block states and optional completion semantics', () => {
  const result = mapBerryMarkCompilerResult(compilerResultFixture())
  if (!result.ok) assert.fail('Expected a valid local preview.')

  const blocks = result.preview.challenge.screens.flatMap(screen => screen.blocks)
  assert.deepEqual(blocks.filter(block => block.reviewStatus).map(block => block.reviewStatus), [
    'proposed', 'proposed', 'proposed', 'proposed', 'proposed',
  ])
  assert.equal(blocks.find(block => block.type === 'reflectionChoice')?.requiredForCompletion, false)
  assert.equal(blocks.find(block => block.type === 'optionalExploration')?.requiredForCompletion, false)
  assert.equal(result.preview.challenge.companionLinks[0].requiredForCompletion, false)
})

test('preserves exact text, paragraphs, Portable Text marks, links, lists, and quotations', () => {
  const result = mapBerryMarkCompilerResult(compilerResultFixture())
  if (!result.ok) assert.fail('Expected a valid local preview.')

  const richText = result.preview.challenge.screens[0].blocks[1]
  if (richText.type !== 'teachingText') assert.fail('Expected rich teaching text.')
  assert.equal(richText.body[0].children[0].text, 'Fixture paragraph.')
  assert.equal(richText.body[1].style, 'h2')
  assert.deepEqual(richText.body[1].children[0].marks, ['strong'])
  assert.deepEqual(richText.body[2].markDefs, [
    { _key: 'fixture-link', _type: 'link', href: 'https://example.com/fixture' },
  ])
  assert.deepEqual(richText.body[2].children[0].marks, ['em', 'fixture-link'])
  assert.equal(richText.body[2].listItem, 'bullet')
  assert.equal(richText.body[4].listItem, 'number')
  assert.equal(richText.body[6].style, 'blockquote')

  const prayer = result.preview.challenge.screens[1].blocks[3]
  if (prayer.type !== 'prayer') assert.fail('Expected prayer text.')
  assert.deepEqual(prayer.paragraphs, validChallengeFixture.screens[1].blocks[3].paragraphs)
})

test('preserves reference-only Scripture and rejects unconfirmed passage rights', () => {
  const valid = mapBerryMarkCompilerResult(compilerResultFixture())
  if (!valid.ok) assert.fail('Expected a valid local preview.')
  assert.equal(valid.preview.challenge.primaryScripture.textStatus, 'referenceOnly')
  assert.equal(valid.preview.challenge.primaryScripture.passage, undefined)
  assert.equal(valid.preview.challenge.primaryScripture.usageRightsConfirmed, false)

  const invalid = compilerResultFixture()
  invalid.sanityCandidate.primaryScripture.textStatus = 'provided'
  invalid.sanityCandidate.primaryScripture.passage = 'Synthetic passage without usage rights.'
  invalid.sanityCandidate.primaryScripture.usageRightsConfirmed = false
  const result = mapBerryMarkCompilerResult(invalid)
  assert.equal(result.ok, false)
  if (!result.ok) assert.ok(result.failure.issues.some(issue => issue.path.includes('usageRightsConfirmed')))
})

test('rejects malformed JSON with a useful file diagnostic', () => {
  const result = parseBerryMarkCompilerResult('{not-json')
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.failure.issues[0].path, 'file')
    assert.match(result.failure.issues[0].message, /not valid JSON/)
  }
})

test('rejects unsuccessful compilations before attempting to map a candidate', () => {
  const input = { ...compilerResultFixture(), ok: false, sanityCandidate: null }
  const result = mapBerryMarkCompilerResult(input)
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.failure.issues[0].path, 'ok')
    assert.match(result.failure.issues[0].message, /compilation was not successful/)
  }
})

test('rejects missing compiler sections, invalid candidates, and false approval claims', () => {
  const missingReport = compilerResultFixture()
  Reflect.deleteProperty(missingReport, 'reviewReport')
  assert.equal(mapBerryMarkCompilerResult(missingReport).ok, false)

  const missingCandidate = compilerResultFixture()
  Reflect.deleteProperty(missingCandidate, 'sanityCandidate')
  assert.equal(mapBerryMarkCompilerResult(missingCandidate).ok, false)

  const reviewed = compilerResultFixture()
  reviewed.sanityCandidate.editorialReview.adaptationReviewed = true
  const result = mapBerryMarkCompilerResult(reviewed)
  assert.equal(result.ok, false)
  if (!result.ok) assert.ok(result.failure.issues.some(issue => issue.path.includes('adaptationReviewed')))
})

for (const field of ['importReady', 'publicationReady'] as const) {
  test(`rejects compiler reports falsely claiming ${field}: true`, () => {
    const input = compilerResultFixture()
    input.reviewReport[field] = true

    const result = mapBerryMarkCompilerResult(input)
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.ok(
        result.failure.issues.some(issue => issue.path === `reviewReport.${field}`),
        `Expected a path-specific rejection for ${field}`,
      )
    }
  })
}

test('rejects unknown blocks rather than omitting them from the preview', () => {
  const input = compilerResultFixture()
  input.sanityCandidate.screens[0].blocks[0] = {
    _key: 'synthetic-unknown-block',
    _type: 'unsupportedFutureBlock',
  }
  const result = mapBerryMarkCompilerResult(input)
  assert.equal(result.ok, false)
  if (!result.ok) assert.ok(result.failure.issues.some(issue => issue.path.includes('screens.0.blocks.0')))
})

test('keeps editorial annotations and unresolved diagnostics outside reader content', () => {
  const result = mapBerryMarkCompilerResult(compilerResultFixture())
  if (!result.ok) assert.fail('Expected a valid local preview.')

  assert.equal(JSON.stringify(result.preview.challenge).includes(editorialSentinel), false)
  assert.equal(JSON.stringify(result.preview.challenge).includes('Synthetic unresolved series.'), false)
  assert.equal(result.preview.review.annotations[0].text, editorialSentinel)
  assert.equal(result.preview.review.unresolved[0].message, 'Synthetic unresolved series.')
})

test('leaves the strict published adapter and stored CMS state untouched', () => {
  const localInput = compilerResultFixture()
  assert.equal(mapPublishedChallenge(localInput.sanityCandidate).ok, false)
  assert.equal(mapPublishedChallenge(structuredClone(validChallengeFixture)).ok, true)

  const stored = '{"positions":{"sanity-live:existing":"screen-two"},"completedChallengeIds":["sanity-live:existing"],"savedChallengeIds":[],"scripture":[]}'
  let writes = 0
  const storage: CmsStorage = {
    getItem: key => key === CMS_LAB_STORAGE_KEY ? stored : null,
    setItem: () => { writes += 1 },
  }
  assert.equal(mapBerryMarkCompilerResult(localInput).ok, true)
  assert.equal(writes, 0)
  assert.equal(storage.getItem(CMS_LAB_STORAGE_KEY), stored)
})

test('produces deterministic output without modifying the compiler result', () => {
  const input = compilerResultFixture()
  const before = structuredClone(input)
  const first = mapBerryMarkCompilerResult(input)
  const second = parseBerryMarkCompilerResult(JSON.stringify(input))
  assert.deepEqual(input, before)
  assert.deepEqual(first, second)
})
