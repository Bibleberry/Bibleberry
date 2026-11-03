import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  PUBLISHED_CHALLENGE_QUERY,
  SANITY_API_VERSION,
  readPublishedChallenges,
  type SanityFetch,
} from '../../src/cms/sanity/readPublishedChallenges.ts'

const jsonResponse = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'Content-Type': 'application/json' },
})

test('uses the pinned public published-perspective query without credentials', async () => {
  let requestedUrl = ''
  let requestInit: RequestInit | undefined
  const fetchImpl: SanityFetch = async (input, init) => {
    requestedUrl = String(input)
    requestInit = init
    return jsonResponse({ result: [] })
  }

  const result = await readPublishedChallenges({ fetchImpl })
  assert.deepEqual(result, { ok: true, documents: [] })

  const url = new URL(requestedUrl)
  assert.equal(url.hostname, '80016lrq.api.sanity.io')
  assert.equal(url.pathname, `/v${SANITY_API_VERSION}/data/query/production`)
  assert.equal(url.searchParams.get('perspective'), 'published')
  assert.equal(url.searchParams.get('query'), PUBLISHED_CHALLENGE_QUERY)
  assert.match(PUBLISHED_CHALLENGE_QUERY, /_type == "challenge"/)
  assert.doesNotMatch(PUBLISHED_CHALLENGE_QUERY, /reviewNotes|sourceTitle|sourceRevision|reviewedBy/)
  assert.equal(requestInit?.method, 'GET')
  assert.equal(requestInit?.cache, 'no-store')
  assert.equal(requestInit?.credentials, 'omit')
  assert.equal(new Headers(requestInit?.headers).has('authorization'), false)
})

test('returns published documents without mapping them in the transport layer', async () => {
  const document = { _id: 'fixture-document', title: 'Unmapped transport fixture' }
  const fetchImpl: SanityFetch = async () => jsonResponse({ result: [document] })
  const result = await readPublishedChallenges({ fetchImpl })
  assert.deepEqual(result, { ok: true, documents: [document] })
})

test('distinguishes an empty published dataset from a failure', async () => {
  const fetchImpl: SanityFetch = async () => jsonResponse({ result: [] })
  const result = await readPublishedChallenges({ fetchImpl })
  assert.deepEqual(result, { ok: true, documents: [] })
})

test('handles network failures safely', async () => {
  const fetchImpl: SanityFetch = async () => { throw new Error('Fixture network failure') }
  const result = await readPublishedChallenges({ fetchImpl })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error.kind, 'network')
})

test('handles unsuccessful API responses without exposing response internals', async () => {
  const fetchImpl: SanityFetch = async () => jsonResponse({ error: 'Sensitive upstream detail' }, 503)
  const result = await readPublishedChallenges({ fetchImpl })
  assert.deepEqual(result, {
    ok: false,
    error: {
      kind: 'http',
      message: 'Sanity returned an unsuccessful response.',
      status: 503,
    },
  })
})

test('handles invalid JSON responses', async () => {
  const fetchImpl: SanityFetch = async () => new Response('not-json', { status: 200 })
  const result = await readPublishedChallenges({ fetchImpl })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error.kind, 'invalidResponse')
})

test('handles successful responses with a missing or malformed result array', async () => {
  for (const payload of [{ result: {} }, { error: 'Fixture API error' }, null]) {
    const fetchImpl: SanityFetch = async () => jsonResponse(payload)
    const result = await readPublishedChallenges({ fetchImpl })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error.kind, 'invalidResponse')
  }
})
