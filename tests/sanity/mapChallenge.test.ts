import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  mapPublishedChallenge,
  mapPublishedChallengeBatch,
} from '../../src/cms/sanity/mapChallenge.ts'
import { validChallengeFixture } from './fixtures.ts'

const fixture = () => structuredClone(validChallengeFixture)

function assertDuplicateKeyRejected(document: unknown, expectedPath: string) {
  const result = mapPublishedChallenge(document)
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.ok(result.failure.issues.some(issue =>
      issue.path === expectedPath && issue.message.includes('Duplicate sibling Sanity _key'),
    ))
  }
}

test('maps a valid published Challenge with canonical identity and release metadata', () => {
  const result = mapPublishedChallenge(fixture())
  assert.equal(result.ok, true)
  if (!result.ok) return

  const { challenge } = result
  assert.equal(challenge.id, 'structural-adapter-fixture')
  assert.equal(challenge.documentId, 'fixture-challenge-document')
  assert.equal(challenge.series.id, 'fixture-series')
  assert.equal(challenge.sequence, 2)
  assert.equal(challenge.releaseAt, '2026-11-02T09:00:00-05:00')
  assert.equal(challenge.releaseAtUtc, '2026-11-02T14:00:00.000Z')
  assert.equal(challenge.editorial.adaptationReviewed, true)
  assert.equal('editorialReview' in challenge, false)
  assert.equal(JSON.stringify(challenge).includes('projection exclusion'), false)
})

test('preserves authored screen/block order and every supported structure', () => {
  const result = mapPublishedChallenge(fixture())
  assert.equal(result.ok, true)
  if (!result.ok) return

  assert.deepEqual(result.challenge.screens.map(screen => screen.id), ['screen-encounter', 'screen-response'])
  assert.deepEqual(result.challenge.screens[0].blocks.map(block => block.id), [
    'block-scripture',
    'block-rich-text',
    'block-statement',
    'block-comparison',
    'block-cards',
  ])
  assert.deepEqual(result.challenge.screens.flatMap(screen => screen.blocks).map(block => block.type), [
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
})

test('retains stable Sanity keys across repeated transformations, including nested content', () => {
  const first = mapPublishedChallenge(fixture())
  const second = mapPublishedChallenge(fixture())
  assert.deepEqual(first, second)
  if (!first.ok) return

  const cards = first.challenge.screens[0].blocks[4]
  const sequence = first.challenge.screens[1].blocks[0]
  const reflection = first.challenge.screens[1].blocks[1]
  assert.deepEqual(cards.type === 'visualCards' ? cards.cards.map(card => card.id) : [], ['card-one', 'card-two'])
  assert.deepEqual(sequence.type === 'connectedSequence' ? sequence.steps.map(step => step.id) : [], ['step-one', 'step-two'])
  assert.deepEqual(reflection.type === 'reflectionChoice' ? reflection.choices.map(choice => choice.id) : [], ['choice-one', 'choice-two'])
  assert.equal(sequence.type === 'connectedSequence' ? sequence.returnCaption : undefined, 'Fixture return caption.')
})

test('preserves Portable Text styles, marks, links, and list structure without flattening', () => {
  const result = mapPublishedChallenge(fixture())
  if (!result.ok) assert.fail('Expected fixture to map successfully.')

  const richText = result.challenge.screens[0].blocks[1]
  if (richText.type !== 'teachingText') assert.fail('Expected rich teaching text.')
  assert.equal(richText.body[1].style, 'h2')
  assert.deepEqual(richText.body[1].children[0].marks, ['strong'])
  assert.equal(richText.body[2].listItem, 'bullet')
  assert.equal(richText.body[2].level, 1)
  assert.deepEqual(richText.body[2].markDefs, [
    { _key: 'fixture-link', _type: 'link', href: 'https://example.com/fixture' },
  ])
})

test('keeps reference-only Scripture and optional content explicitly unavailable or optional', () => {
  const result = mapPublishedChallenge(fixture())
  if (!result.ok) assert.fail('Expected fixture to map successfully.')

  const scriptureBlock = result.challenge.screens[0].blocks[0]
  if (scriptureBlock.type !== 'scripture') assert.fail('Expected Scripture block.')
  assert.equal(scriptureBlock.scripture.textStatus, 'referenceOnly')
  assert.equal(scriptureBlock.scripture.passage, undefined)
  assert.equal(scriptureBlock.scripture.practiceStatus, 'notConfigured')

  const optionalBlocks = result.challenge.screens[1].blocks.slice(1, 3)
  assert.deepEqual(optionalBlocks.map(block => block.requiredForCompletion), [false, false])
  assert.equal(result.challenge.companionLinks[0].requiredForCompletion, false)
})

test('normalizes omitted usage rights to false for primary and nested reference-only Scripture', () => {
  const document = fixture()
  Reflect.deleteProperty(document.primaryScripture, 'usageRightsConfirmed')
  Reflect.deleteProperty(document.screens[0].blocks[0].scripture, 'usageRightsConfirmed')
  Reflect.deleteProperty(document.screens[1].blocks[2].scriptures[0], 'usageRightsConfirmed')

  const result = mapPublishedChallenge(document)
  if (!result.ok) assert.fail('Expected reference-only Scripture with omitted rights to map successfully.')
  assert.equal(result.challenge.primaryScripture.usageRightsConfirmed, false)

  const scriptureBlock = result.challenge.screens[0].blocks[0]
  if (scriptureBlock.type !== 'scripture') assert.fail('Expected Scripture block.')
  assert.equal(scriptureBlock.scripture.usageRightsConfirmed, false)

  const optionalStudy = result.challenge.screens[1].blocks[2]
  if (optionalStudy.type !== 'optionalExploration') assert.fail('Expected optional study block.')
  assert.equal(optionalStudy.scriptures[0].usageRightsConfirmed, false)
})

test('accepts provided passage text only with rights and preserves memorization eligibility', () => {
  const document = fixture()
  document.primaryScripture.textStatus = 'provided'
  document.primaryScripture.passage = 'Development-only placeholder text; not Scripture.'
  document.primaryScripture.usageRightsConfirmed = true
  document.primaryScripture.practiceStatus = 'configured'

  const result = mapPublishedChallenge(document)
  if (!result.ok) assert.fail('Expected rights-cleared fixture to map successfully.')
  assert.equal(result.challenge.primaryScripture.practiceStatus, 'configured')
  assert.equal(result.challenge.primaryScripture.passage, 'Development-only placeholder text; not Scripture.')
})

test('rejects missing required document fields', () => {
  const document = fixture()
  document.title = ''
  const result = mapPublishedChallenge(document)
  assert.equal(result.ok, false)
  if (!result.ok) assert.ok(result.failure.issues.some(issue => issue.path === 'title'))
})

test('rejects unknown block types rather than discarding them', () => {
  const document = fixture()
  document.screens[0].blocks[0] = { _key: 'unknown-block', _type: 'unsupportedFutureBlock' }
  const result = mapPublishedChallenge(document)
  assert.equal(result.ok, false)
})

test('rejects invalid screen structure and missing stable keys', () => {
  const emptyScreen = fixture()
  emptyScreen.screens[0].blocks = []
  assert.equal(mapPublishedChallenge(emptyScreen).ok, false)

  const missingKey = fixture()
  missingKey.screens[0]._key = ''
  const result = mapPublishedChallenge(missingKey)
  assert.equal(result.ok, false)
  if (!result.ok) assert.ok(result.failure.issues.some(issue => issue.path.includes('_key')))
})

test('rejects duplicate sibling keys in screens and blocks', () => {
  const duplicateScreens = fixture()
  duplicateScreens.screens[1]._key = duplicateScreens.screens[0]._key
  assertDuplicateKeyRejected(duplicateScreens, 'screens.1._key')

  const duplicateBlocks = fixture()
  duplicateBlocks.screens[0].blocks[1]._key = duplicateBlocks.screens[0].blocks[0]._key
  assertDuplicateKeyRejected(duplicateBlocks, 'screens.0.blocks.1._key')
})

test('rejects duplicate sibling keys in nested arrays and companion links', () => {
  const duplicateCards = fixture()
  duplicateCards.screens[0].blocks[4].cards[1]._key = duplicateCards.screens[0].blocks[4].cards[0]._key
  assertDuplicateKeyRejected(duplicateCards, 'screens.0.blocks.4.cards.1._key')

  const duplicateSteps = fixture()
  duplicateSteps.screens[1].blocks[0].steps[1]._key = duplicateSteps.screens[1].blocks[0].steps[0]._key
  assertDuplicateKeyRejected(duplicateSteps, 'screens.1.blocks.0.steps.1._key')

  const duplicateChoices = fixture()
  duplicateChoices.screens[1].blocks[1].choices[1]._key = duplicateChoices.screens[1].blocks[1].choices[0]._key
  assertDuplicateKeyRejected(duplicateChoices, 'screens.1.blocks.1.choices.1._key')

  const duplicateStudyScripture = fixture()
  const studyScriptures = duplicateStudyScripture.screens[1].blocks[2].scriptures
  studyScriptures.push({ ...studyScriptures[0], reference: 'Fixture Reference 3:3' })
  assertDuplicateKeyRejected(duplicateStudyScripture, 'screens.1.blocks.2.scriptures.1._key')

  const duplicateCompanions = fixture()
  duplicateCompanions.companionLinks.push({
    ...duplicateCompanions.companionLinks[0],
    label: 'Second fixture companion',
  })
  assertDuplicateKeyRejected(duplicateCompanions, 'companionLinks.1._key')
})

test('rejects provided Scripture with missing passage text', () => {
  const document = fixture()
  document.primaryScripture.textStatus = 'provided'
  const result = mapPublishedChallenge(document)
  assert.equal(result.ok, false)
  if (!result.ok) assert.ok(result.failure.issues.some(issue => issue.path.includes('passage')))
})

test('rejects passage text without confirmed usage rights', () => {
  const document = fixture()
  document.primaryScripture.textStatus = 'provided'
  document.primaryScripture.passage = 'Development-only placeholder text; not Scripture.'
  document.primaryScripture.usageRightsConfirmed = false
  const result = mapPublishedChallenge(document)
  assert.equal(result.ok, false)
  if (!result.ok) assert.ok(result.failure.issues.some(issue => issue.path.includes('usageRightsConfirmed')))
})

test('rejects provided passage text with omitted rights in primary and nested Scripture', () => {
  const primary = fixture()
  primary.primaryScripture.textStatus = 'provided'
  primary.primaryScripture.passage = 'Development-only placeholder text; not Scripture.'
  Reflect.deleteProperty(primary.primaryScripture, 'usageRightsConfirmed')
  const primaryResult = mapPublishedChallenge(primary)
  assert.equal(primaryResult.ok, false)
  if (!primaryResult.ok) {
    assert.ok(primaryResult.failure.issues.some(issue =>
      issue.path === 'primaryScripture.usageRightsConfirmed',
    ))
  }

  const nested = fixture()
  const nestedScripture = nested.screens[1].blocks[2].scriptures[0]
  nestedScripture.textStatus = 'provided'
  nestedScripture.passage = 'Development-only placeholder text; not Scripture.'
  Reflect.deleteProperty(nestedScripture, 'usageRightsConfirmed')
  const nestedResult = mapPublishedChallenge(nested)
  assert.equal(nestedResult.ok, false)
  if (!nestedResult.ok) {
    assert.ok(nestedResult.failure.issues.some(issue =>
      issue.path === 'screens.1.blocks.2.scriptures.0.usageRightsConfirmed',
    ))
  }
})

test('rejects memorization marked configured without eligible passage text', () => {
  const document = fixture()
  document.primaryScripture.practiceStatus = 'configured'
  const result = mapPublishedChallenge(document)
  assert.equal(result.ok, false)
  if (!result.ok) assert.ok(result.failure.issues.some(issue => issue.path.includes('practiceStatus')))
})

test('rejects missing, date-only, and invalid release metadata', () => {
  const missing = fixture()
  missing.releaseAt = ''
  assert.equal(mapPublishedChallenge(missing).ok, false)

  const dateOnly = fixture()
  dateOnly.releaseAt = '2026-11-02'
  assert.equal(mapPublishedChallenge(dateOnly).ok, false)

  const invalid = fixture()
  invalid.releaseAt = 'not-a-date'
  assert.equal(mapPublishedChallenge(invalid).ok, false)
})

test('rejects unreviewed documents and proposed structured blocks', () => {
  const unreviewed = fixture()
  unreviewed.editorialEligibility.adaptationReviewed = false
  assert.equal(mapPublishedChallenge(unreviewed).ok, false)

  const proposed = fixture()
  proposed.screens[0].blocks[3].reviewStatus = 'proposed'
  assert.equal(mapPublishedChallenge(proposed).ok, false)
})

test('rejects a cycle without its required return caption', () => {
  const document = fixture()
  document.screens[1].blocks[0].returnCaption = ''
  assert.equal(mapPublishedChallenge(document).ok, false)
})

test('rejects unsafe companion URLs', () => {
  const document = fixture()
  document.companionLinks[0].url = 'javascript:alert(1)'
  assert.equal(mapPublishedChallenge(document).ok, false)
})

test('does not return a partially valid batch when another document is malformed', () => {
  const malformed = fixture()
  malformed.sequence = 0
  const result = mapPublishedChallengeBatch([fixture(), malformed])
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.failures.length, 1)
    assert.equal('challenges' in result, false)
  }
})

test('maps an empty published result as a valid empty catalog', () => {
  const result = mapPublishedChallengeBatch([])
  assert.deepEqual(result, { ok: true, challenges: [] })
})
