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

test('parses released Challenge slugs and takes the origin only from session state', () => {
  assert.deepEqual(parseInternalDestination('#/challenge/rejoice-always', {
    ...enabled,
    challengeOrigin: { kind: 'shelf', yearMonth: '2026-10' },
  }), {
    type: 'releasedChallenge',
    slug: 'rejoice-always',
    origin: { kind: 'shelf', yearMonth: '2026-10' },
    entry: 'inSession',
  })

  // Session state wins over the legacy hash parameters, which are display-only.
  assert.deepEqual(parseInternalDestination(
    '#/challenge/2026-11-02-rejoice-always?origin=shelf&yearMonth=2026-10',
    { ...enabled, challengeOrigin: { kind: 'month', yearMonth: '2026-11' } },
  ), {
    type: 'releasedChallenge',
    slug: '2026-11-02-rejoice-always',
    origin: { kind: 'month', yearMonth: '2026-11' },
    entry: 'inSession',
  })

  assert.deepEqual(parseInternalDestination('#/challenge/rejoice-always', {
    ...enabled,
    releasedChallengeRouteEnabled: false,
    monthScreenEnabled: true,
  }), {
    type: 'releasedChallenge',
    slug: 'rejoice-always',
    origin: { kind: 'hub' },
    entry: 'external',
  })
})

test('a cold Challenge hash never trusts URL-supplied origin metadata (G04-A, forged origin)', () => {
  const external = (slug: string) => ({
    type: 'releasedChallenge',
    slug,
    origin: { kind: 'hub' },
    entry: 'external',
  })

  for (const hash of [
    '#/challenge/october-14?origin=month&yearMonth=2026-10',
    '#/challenge/october-14?origin=shelf&yearMonth=2026-10',
    '#/challenge/october-14?origin=library',
    '#/challenge/october-14?origin=hub',
    '#/challenge/october-14',
  ]) {
    assert.deepEqual(parseInternalDestination(hash, enabled), external('october-14'), hash)
  }

  // The page query string is not an origin source either (it was before Harbor Signal).
  assert.deepEqual(parseInternalDestination('#/challenge/october-14', {
    ...enabled,
    ...({ search: '?origin=month&yearMonth=2026-10' } as object),
  }), external('october-14'))

  // Missing, malformed, or unknown session values are not in-session origins.
  for (const challengeOrigin of [
    undefined,
    null,
    'month',
    [],
    { kind: 'month' },
    { kind: 'month', yearMonth: '2026-13' },
    { kind: 'developer' },
  ]) {
    assert.deepEqual(
      parseInternalDestination('#/challenge/october-14?origin=month&yearMonth=2026-10', {
        ...enabled,
        challengeOrigin,
      }),
      external('october-14'),
      JSON.stringify(challengeOrigin),
    )
  }
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
    '#/challenge/rejoice\u0000',
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
    entry: 'external',
  })

  assert.equal(parseInternalDestination('#/challenge/rejoice', {
    ...enabled,
    releasedChallengeRouteEnabled: false,
    monthScreenEnabled: false,
  }), null)
})
