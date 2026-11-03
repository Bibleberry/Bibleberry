import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadPublishedChallengeCatalog } from '../../src/cms/sanity/catalog.ts'
import type { SanityFetch } from '../../src/cms/sanity/readPublishedChallenges.ts'
import { validChallengeFixture } from './fixtures.ts'

const jsonResponse = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'Content-Type': 'application/json' },
})

test('returns a fully validated ready catalog', async () => {
  const fetchImpl: SanityFetch = async () => jsonResponse({ result: [validChallengeFixture] })
  const result = await loadPublishedChallengeCatalog({ fetchImpl })
  assert.equal(result.status, 'ready')
  if (result.status === 'ready') {
    assert.equal(result.challenges.length, 1)
    assert.equal(result.challenges[0].documentId, 'fixture-challenge-document')
  }
})

test('distinguishes an empty published catalog from transport and validation failures', async () => {
  const fetchImpl: SanityFetch = async () => jsonResponse({ result: [] })
  assert.deepEqual(await loadPublishedChallengeCatalog({ fetchImpl }), { status: 'empty' })
})

test('preserves request errors without substituting fixture content', async () => {
  const fetchImpl: SanityFetch = async () => jsonResponse({ error: 'Upstream detail' }, 503)
  const result = await loadPublishedChallengeCatalog({ fetchImpl })
  assert.deepEqual(result, {
    status: 'requestError',
    message: 'Sanity returned an unsuccessful response.',
  })
})

test('rejects the whole catalog when any Challenge is invalid', async () => {
  const invalid = { ...structuredClone(validChallengeFixture), _id: 'invalid-document', screens: [] }
  const fetchImpl: SanityFetch = async () => jsonResponse({ result: [validChallengeFixture, invalid] })
  const result = await loadPublishedChallengeCatalog({ fetchImpl })
  assert.equal(result.status, 'validationError')
  if (result.status === 'validationError') {
    assert.equal(result.failures.length, 1)
    assert.equal(result.failures[0].documentId, 'invalid-document')
    assert.ok(result.failures[0].issues.length > 0)
  }
})
