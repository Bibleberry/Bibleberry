import assert from 'node:assert/strict';
import test from 'node:test';
import { parseBaselineOptions } from '../../scripts/performance/baseline-options.ts';
import {
  BLOCKED_STYLESHEET,
  CHALLENGE_PATH,
  connectedRequest,
} from '../../scripts/performance/connected-fixtures.ts';

const origin = 'http://127.0.0.1:4174';
const assets = new Set(['/assets/index-A.js']);
const request = (url: string, method = 'GET', resourceType = 'fetch', body: string | null = null) =>
  connectedRequest(origin, assets, { url: new URL(url, origin).href, method, resourceType, body });

test('the prototype is default and the connected scenario requires explicit selection and samples', () => {
  assert.equal(parseBaselineOptions([], {}).scenario, 'prototype');
  assert.equal(parseBaselineOptions(['--scenario', 'connected'], {}).scenario, 'connected');
  assert.throws(() => parseBaselineOptions(['--scenario'], {}), /Missing value/);
  assert.throws(() => parseBaselineOptions(['--scenario', 'unknown'], {}), /Unknown performance scenario/);
  for (const runs of ['0', '-1', '1.5', 'Infinity', 'NaN', '']) {
    assert.throws(() => parseBaselineOptions([], { PERF_RUNS: runs }), /positive integer/);
  }
});

test('connected traffic can only reach known build artifacts and exact synthetic gateway fixtures', () => {
  assert.equal(request('/').kind, 'static');
  assert.equal(request('/assets/index-A.js').kind, 'static');
  assert.equal(request(CHALLENGE_PATH).kind, 'fixture');
  assert.throws(() => request('/assets/missing.js'), /Missing connected fixture/);
  assert.throws(() => request('/unavailable-route'), /Missing connected fixture/);
  assert.throws(() => request('/api/months/2026-12'), /Missing connected fixture/);
  assert.throws(() => request('/api/months/2026-12/preview'), /Missing connected fixture/);
  assert.throws(() => request('/api/challenges/embargoed'), /Missing connected fixture/);
  assert.throws(() => request(`${CHALLENGE_PATH}?perspective=drafts`), /Missing connected fixture/);
  assert.throws(() => request(CHALLENGE_PATH, 'POST'), /Missing connected fixture/);
  assert.throws(() => request('https://project.api.sanity.io/v2026-01-01/data/query/staging'), /Unauthorized Sanity/);
  assert.throws(() => request('https://other.test/asset'), /Unexpected external request/);
  assert.equal(request(BLOCKED_STYLESHEET, 'GET', 'stylesheet').kind, 'blockedStylesheet');
  assert.throws(() => request(BLOCKED_STYLESHEET), /Unexpected external request/);
  assert.throws(() => request('/api/months/2026-10/progress', 'POST', 'fetch', '{}'), /empty completed/);
});

test('fixture payloads pass the real gateway readers and malformed content is rejected', async () => {
  const { createGatewayMonthProvider } = await import('../../src/cms/reader/monthProvider.ts');
  const { createGatewayLibraryMonthIndexProvider } = await import('../../src/cms/reader/libraryMonthIndexProvider.ts');
  const { createGatewayChallengeProvider } = await import('../../src/cms/reader/challengeDetailProvider.ts');
  const { createGatewayCatalogProvider } = await import('../../src/cms/reader/releasedCatalogProvider.ts');
  const { CHALLENGE_SLUG, FOCUS_MONTH, HISTORICAL_MONTH } = await import('../../scripts/performance/connected-fixtures.ts');
  const fetchImpl: typeof fetch = async (input, init) => {
    const fixture = request(String(input), init?.method, 'fetch', (init?.body as string | undefined) ?? null);
    assert.equal(fixture.kind, 'fixture');
    return Response.json(fixture.payload);
  };
  const config = { fetchImpl };
  const months = createGatewayMonthProvider(config);
  const library = createGatewayLibraryMonthIndexProvider(config);
  const catalog = createGatewayCatalogProvider(config);
  const details = createGatewayChallengeProvider(config);
  for (const month of [FOCUS_MONTH, HISTORICAL_MONTH]) {
    assert.equal((await months.loadMonth(month)).status, 'ready');
    assert.equal((await months.loadMonthProgress(month, [])).status, 'ready');
  }
  assert.equal((await months.loadNews({ category: 'monthlyPreview' })).status, 'ready');
  assert.equal((await library.loadHistoricalMonths({ limit: 12 })).status, 'ready');
  assert.equal((await catalog.loadReleasedCatalog()).status, 'ready');
  assert.equal((await details.loadChallenge(CHALLENGE_SLUG)).status, 'ready');
  assert.equal((await details.loadChallenge(CHALLENGE_SLUG, {
    fetchImpl: async () => Response.json({ ok: true, challenge: { _id: 'invalid' } }),
  })).status, 'validationError');
});
