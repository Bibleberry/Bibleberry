import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseInternalDestination } from '../../src/native/internalDestination.ts'

const enabled = {
  monthScreenEnabled: true,
  releasedChallengeRouteEnabled: true,
  currentYearMonth: '2026-11',
}

test('parses valid Month hashes and the existing current-month alias', () => {
  assert.deepEqual(parseInternalDestination('#/month/2027-03', enabled), {
    type: 'month',
    yearMonth: '2027-03',
  })
  assert.deepEqual(parseInternalDestination('#/month', enabled), {
    type: 'month',
    yearMonth: '2026-11',
  })
  assert.deepEqual(parseInternalDestination('#/month/', enabled), {
    type: 'month',
    yearMonth: '2026-11',
  })
})

test('rejects malformed, unsupported, or disabled Month destinations', () => {
  for (const route of [
    '#/month/2026-00',
    '#/month/2026-13',
    '#/month/2026-3',
    '#/month/2026-11/extra',
    '#/month/../2026-11',
    '#/month/%2e%2e',
    '#/month/2026-11?next=https://example.com',
  ]) {
    assert.equal(parseInternalDestination(route, enabled), null, route)
  }

  assert.equal(parseInternalDestination('#/month/2026-11', {
    ...enabled,
    monthScreenEnabled: false,
  }), null)
  assert.equal(parseInternalDestination('#/month', {
    ...enabled,
    currentYearMonth: '2026-13',
  }), null)
})

test('parses released Challenge slugs with canonical origin and route state', () => {
  assert.deepEqual(parseInternalDestination(
    '#/challenge/2026-11-02-rejoice-always?origin=month&yearMonth=2026-11',
    enabled,
  ), {
    type: 'releasedChallenge',
    slug: '2026-11-02-rejoice-always',
    origin: { kind: 'month', yearMonth: '2026-11' },
  })

  assert.deepEqual(parseInternalDestination('#/challenge/rejoice-always', {
    ...enabled,
    challengeOrigin: { kind: 'shelf', yearMonth: '2026-10' },
  }), {
    type: 'releasedChallenge',
    slug: 'rejoice-always',
    origin: { kind: 'shelf', yearMonth: '2026-10' },
  })

  assert.deepEqual(parseInternalDestination('#/challenge/rejoice-always', {
    ...enabled,
    releasedChallengeRouteEnabled: false,
    monthScreenEnabled: true,
  }), {
    type: 'releasedChallenge',
    slug: 'rejoice-always',
    origin: { kind: 'hub' },
  })
})

test('rejects unsafe slugs, unknown routes, external URLs, and unsupported query parameters', () => {
  for (const route of [
    '#/challenge/',
    '#/challenge/../private',
    '#/challenge/a/b',
    '#/challenge/a%2Fb',
    '#/challenge/a%5cb',
    '#/challenge/a..b',
    '#/challenge/Upper-case',
    '#/unknown/destination',
    'https://example.com/#/challenge/rejoice',
    'javascript:alert(1)',
    '#/challenge/rejoice?next=https://example.com',
    '#/challenge/rejoice?origin=hub&origin=month',
  ]) {
    assert.equal(parseInternalDestination(route, enabled), null, route)
  }
})

test('uses canonical origin fallback and requires a route feature gate', () => {
  assert.deepEqual(parseInternalDestination(
    '#/challenge/rejoice?origin=month&yearMonth=2026-13',
    enabled,
  ), {
    type: 'releasedChallenge',
    slug: 'rejoice',
    origin: { kind: 'hub' },
  })

  assert.equal(parseInternalDestination('#/challenge/rejoice', {
    ...enabled,
    releasedChallengeRouteEnabled: false,
    monthScreenEnabled: false,
  }), null)
})
