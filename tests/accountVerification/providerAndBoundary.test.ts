import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createSanityTrustedMonthProvider } from '../../src/accountVerification/trustedMonthProvider.ts'
import {
  MONTHLY_DETAIL_BY_ID_GROQ_QUERY,
  MONTHLY_PREVIEW_BY_ID_GROQ_QUERY,
  TRUSTED_AWARD_VERIFICATION_MONTH_GROQ_QUERY,
} from '../../src/gateway/query.ts'
import { FIXTURE_DATASET, FIXTURE_PROJECT_ID, makeTrustedMonth } from './fixtures.ts'

const TOKEN = 'server-held-test-token-DO-NOT-LEAK-9f8e7d'

function provider(fetchImpl: (url: URL, init?: RequestInit) => Promise<Response>, dataset = FIXTURE_DATASET) {
  return createSanityTrustedMonthProvider({
    projectId: FIXTURE_PROJECT_ID,
    dataset,
    readToken: TOKEN,
    fetchImpl: async (input, init) => fetchImpl(input instanceof URL ? input : new URL(String(input)), init),
  })
}

test('privileged provider reads ONLY perspective=published via the internal verification query with a server-held token', async () => {
  let seen: { url: URL; init?: RequestInit } | undefined
  const p = provider(async (url, init) => {
    seen = { url, init }
    return new Response(JSON.stringify({ result: makeTrustedMonth('2026-09', { revision: 'revAbc123' }) }), { status: 200 })
  })
  const r = await p.fetchPublishedMonth('2026-09')
  assert.equal(r.status, 'found')
  if (r.status === 'found') {
    assert.equal(r.revision, 'revAbc123')
    assert.equal(r.dataset, FIXTURE_DATASET)
  }
  assert.ok(seen)
  assert.equal(seen.url.hostname, `${FIXTURE_PROJECT_ID}.api.sanity.io`)
  assert.equal(seen.url.searchParams.get('perspective'), 'published')
  assert.equal(seen.url.searchParams.get('query'), TRUSTED_AWARD_VERIFICATION_MONTH_GROQ_QUERY)
  assert.equal(seen.url.searchParams.get('$monthDocId'), JSON.stringify('month-2026-09'))
  assert.equal(seen.url.pathname.endsWith(`/data/query/${FIXTURE_DATASET}`), true)
  assert.equal(new Headers(seen.init?.headers).get('Authorization'), `Bearer ${TOKEN}`)
  assert.equal(seen.url.toString().includes(TOKEN), false, 'token never placed in the URL')
})

test('provider maps failures to unavailable / notFound without echoing upstream bodies or credentials', async () => {
  const cases: [() => Promise<Response>, string][] = [
    [async () => { throw new Error(`network ${TOKEN}`) }, 'unavailable'],
    [async () => new Response(`denied ${TOKEN}`, { status: 401 }), 'unavailable'],
    [async () => new Response('not json', { status: 200 }), 'unavailable'],
    [async () => new Response(JSON.stringify({ result: null }), { status: 200 }), 'notFound'],
    [async () => new Response(JSON.stringify({ result: [] }), { status: 200 }), 'unavailable'],
    [async () => new Response(JSON.stringify({ result: { _id: 'month-2026-09' } }), { status: 200 }), 'unavailable'],
  ]
  for (const [impl, expected] of cases) {
    const r = await provider(impl).fetchPublishedMonth('2026-09')
    assert.equal(r.status, expected)
    assert.equal(JSON.stringify(r).includes(TOKEN), false)
  }
  let called = false
  const r = await provider(async () => { called = true; return new Response('{}') }).fetchPublishedMonth('2026-13')
  assert.deepEqual(r, { status: 'notFound' })
  assert.equal(called, false, 'invalid month never reaches the network')
})

test('provider refuses non-approved datasets, bad project IDs and missing credentials (no third dataset)', () => {
  const fetchImpl = async () => new Response('{}')
  assert.throws(() => createSanityTrustedMonthProvider({ projectId: FIXTURE_PROJECT_ID, dataset: 'berrymark-development', readToken: TOKEN, fetchImpl }), /approved dataset/)
  assert.throws(() => createSanityTrustedMonthProvider({ projectId: 'Bad!', dataset: 'staging', readToken: TOKEN, fetchImpl }), /configuration/)
  assert.throws(() => createSanityTrustedMonthProvider({ projectId: FIXTURE_PROJECT_ID, dataset: 'production', readToken: ' ', fetchImpl }), /credential/)
  try {
    createSanityTrustedMonthProvider({ projectId: FIXTURE_PROJECT_ID, dataset: 'nope', readToken: TOKEN, fetchImpl })
  } catch (e) {
    assert.equal(String(e).includes(TOKEN), false)
  }
})

test('public queries are unchanged: the verification-only fields never appear in public month queries', () => {
  for (const q of [MONTHLY_DETAIL_BY_ID_GROQ_QUERY, MONTHLY_PREVIEW_BY_ID_GROQ_QUERY]) {
    assert.equal(q.includes('priorRosters'), false)
    assert.equal(q.includes('_rev'), false)
  }
  assert.equal(TRUSTED_AWARD_VERIFICATION_MONTH_GROQ_QUERY.includes('perspective'), false, 'perspective is enforced by the URL builder')
  assert.match(TRUSTED_AWARD_VERIFICATION_MONTH_GROQ_QUERY, /!\(_id in path\("drafts\.\*\*"\)\)/)
})

test('server-only boundary: no reader/native/UI file imports accountVerification, and the Gateway exposes no verifier entrypoint', () => {
  const src = path.resolve(process.cwd(), 'src')
  const offenders: string[] = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (full === path.join(src, 'accountVerification')) continue
        walk(full)
      } else if (/\.(ts|tsx)$/.test(e.name)) {
        if (fs.readFileSync(full, 'utf8').includes('accountVerification')) offenders.push(path.relative(src, full))
      }
    }
  }
  walk(src)
  assert.deepEqual(offenders, [])

  const gatewayIndex = fs.readFileSync(path.join(src, 'gateway', 'index.ts'), 'utf8')
  const handler = fs.readFileSync(path.join(src, 'gateway', 'handler.ts'), 'utf8')
  assert.equal(gatewayIndex.includes('evaluateTrustedMonthAwardEligibility'), false)
  assert.equal(gatewayIndex.includes('TRUSTED_AWARD_VERIFICATION_MONTH_GROQ_QUERY'), false)
  assert.equal(handler.includes('evaluateTrustedMonthAwardEligibility'), false)
  assert.equal(handler.includes('TRUSTED_AWARD_VERIFICATION_MONTH_GROQ_QUERY'), false)
  assert.equal(handler.includes('account_issuance'), false)

  for (const file of fs.readdirSync(path.join(src, 'accountVerification'))) {
    const content = fs.readFileSync(path.join(src, 'accountVerification', file), 'utf8')
    assert.equal(/console\.(log|info|warn|error|debug)/.test(content), false, `${file} must not log`)
    assert.equal(/from ['"](react|@capacitor|@supabase)/.test(content), false, `${file} must stay runtime-neutral`)
  }
})
