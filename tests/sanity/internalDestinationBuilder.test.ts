import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildInternalDestination,
  parseInternalDestination,
  type InternalDestination,
} from '../../src/native/internalDestination.ts'

const enabled = {
  monthScreenEnabled: true,
  releasedChallengeRouteEnabled: true,
}

function buildUntrusted(value: unknown): string | null {
  return buildInternalDestination(value as InternalDestination)
}

test('builds canonical Month hashes that round-trip without changing identity', () => {
  const destination = { type: 'month', yearMonth: '2027-03' } as const
  const hash = buildInternalDestination(destination)

  assert.equal(hash, '#/month/2027-03')
  assert.deepEqual(parseInternalDestination(hash, enabled), destination)
  assert.equal(parseInternalDestination(hash, {
    ...enabled,
    monthScreenEnabled: false,
  }), null)
})

test('round-trips released-Challenge identity and every supported origin context via session state', () => {
  const origins = [
    { kind: 'hub' },
    { kind: 'month', yearMonth: '2027-03' },
    { kind: 'shelf' },
    { kind: 'shelf', yearMonth: '2026-10' },
    { kind: 'library' },
    { kind: 'library', yearMonth: '2026-09' },
  ] as const

  for (const origin of origins) {
    const destination = {
      type: 'releasedChallenge',
      slug: '2026-11-02-rejoice-always',
      origin,
    } as const
    const hash = buildInternalDestination(destination)

    assert.ok(hash?.startsWith('#/challenge/'))
    // The origin round-trips only through app-recorded session state ...
    assert.deepEqual(
      parseInternalDestination(hash, { ...enabled, challengeOrigin: origin }),
      { ...destination, entry: 'inSession' },
    )
    // ... while the hash's own origin parameters are never trusted on their own (G04-A).
    assert.deepEqual(parseInternalDestination(hash, enabled), {
      type: 'releasedChallenge',
      slug: destination.slug,
      origin: { kind: 'hub' },
      entry: 'external',
    })
    assert.deepEqual(
      [...new URLSearchParams(hash.slice(hash.indexOf('?') + 1)).keys()],
      'yearMonth' in origin && origin.yearMonth ? ['origin', 'yearMonth'] : ['origin'],
    )
    assert.equal(hash.includes('https://'), false)
  }
})

test('does not bypass the parser route gates or create routes outside its contract', () => {
  const challenge = {
    type: 'releasedChallenge',
    slug: 'rejoice-always',
    origin: { kind: 'hub' },
  } as const
  const hash = buildInternalDestination(challenge)

  assert.equal(parseInternalDestination(hash, {
    monthScreenEnabled: false,
    releasedChallengeRouteEnabled: false,
  }), null)
  assert.equal(buildUntrusted({ type: 'library', yearMonth: '2026-10' }), null)
  assert.equal(buildUntrusted({ type: 'external', url: 'https://example.com' }), null)
  assert.equal(buildUntrusted({
    ...challenge,
    unpublishedTitle: 'Hidden title',
    unpublishedBody: 'Hidden teaching',
  }), null)
})

test('rejects unsafe slugs, malformed months, and injected or unknown fields', () => {
  for (const slug of [
    '',
    '../private',
    'a/b',
    'a%2fb',
    'a\\b',
    'a?next=https://example.com',
    'a#fragment',
    'Upper-case',
    'two words',
    'bad\u0000slug',
  ]) {
    assert.equal(buildUntrusted({
      type: 'releasedChallenge',
      slug,
      origin: { kind: 'hub' },
    }), null, slug)
  }

  for (const yearMonth of [
    '2026-00',
    '2026-13',
    '2026-3',
    ' 2026-03',
    '2026-03 ',
    '../2026-03',
    '2026-03?next=https://example.com',
    'https://example.com',
    '2026-03\u0000',
  ]) {
    assert.equal(buildUntrusted({ type: 'month', yearMonth }), null, yearMonth)
    assert.equal(buildUntrusted({
      type: 'releasedChallenge',
      slug: 'rejoice',
      origin: { kind: 'month', yearMonth },
    }), null, yearMonth)
  }

  assert.equal(buildUntrusted({
    type: 'releasedChallenge',
    slug: 'rejoice',
    origin: { kind: 'shelf', yearMonth: '2026-13' },
  }), null)
  assert.equal(buildUntrusted({
    type: 'releasedChallenge',
    slug: 'rejoice',
    origin: { kind: 'hub', yearMonth: '2026-03' },
  }), null)
  assert.equal(buildUntrusted({
    type: 'releasedChallenge',
    slug: 'rejoice',
    origin: { kind: 'library', externalUrl: 'https://example.com' },
  }), null)
  assert.equal(buildUntrusted({
    type: 'month',
    yearMonth: '2026-03',
    query: 'origin=hub&origin=month',
  }), null)
})
