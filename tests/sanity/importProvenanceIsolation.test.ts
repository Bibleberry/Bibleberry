import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mapPublishedChallenge} from '../../src/cms/sanity/mapChallenge.ts'
import {PUBLISHED_CHALLENGE_QUERY} from '../../src/cms/sanity/readPublishedChallenges.ts'
import {validChallengeFixture} from './fixtures.ts'

test('published reader projection excludes all import provenance', () => {
  assert.doesNotMatch(PUBLISHED_CHALLENGE_QUERY, /importProvenance/)
  assert.doesNotMatch(PUBLISHED_CHALLENGE_QUERY, /candidateSha256|lastImportedContentSha256|sourceSha256|importedBy|sourceFilename/)
})

test('reader mapper defensively excludes injected import provenance', () => {
  const document = structuredClone(validChallengeFixture) as typeof validChallengeFixture & {importProvenance?: unknown}
  document.importProvenance = {
    sourceSystem: 'berrymark',
    canonicalId: 'berrymark-challenge-reader-isolation',
    sourceFilename: 'reader-provenance-marker.berrymark.md',
    sourceSha256: 'a'.repeat(64),
    candidateSha256: 'b'.repeat(64),
    lastImportedContentSha256: 'c'.repeat(64),
    importedBy: 'reader-provenance-marker',
  }

  const result = mapPublishedChallenge(document)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal('importProvenance' in result.challenge, false)
  assert.equal(JSON.stringify(result.challenge).includes('reader-provenance-marker'), false)
})
