import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  areChallengeOriginsEqual,
  DEFAULT_CHALLENGE_ORIGIN,
  formatChallengeOriginLabel,
  isValidChallengeYearMonth,
  parseChallengeOrigin,
  parseChallengeOriginFromSearchParams,
  serializeChallengeOriginToSearchParams,
} from '../../src/cms/reader/challengeOrigin.ts'

test('validates civil YYYY-MM strings strictly', () => {
  assert.equal(isValidChallengeYearMonth('2026-11'), true)
  assert.equal(isValidChallengeYearMonth('2027-03'), true)
  assert.equal(isValidChallengeYearMonth('2096-02'), true)
  assert.equal(isValidChallengeYearMonth('2026-00'), false)
  assert.equal(isValidChallengeYearMonth('2026-13'), false)
  assert.equal(isValidChallengeYearMonth('2026-3'), false)
  assert.equal(isValidChallengeYearMonth('2026-11-01'), false)
  assert.equal(isValidChallengeYearMonth(''), false)
  assert.equal(isValidChallengeYearMonth(null), false)
})

test('parseChallengeOrigin preserves valid hub, month, shelf, and library origins with minimal identifiers', () => {
  assert.deepEqual(parseChallengeOrigin({ kind: 'hub', extraIgnored: 'secret' }), { kind: 'hub' })
  assert.deepEqual(parseChallengeOrigin({ kind: 'month', yearMonth: '2027-03', extra: 123 }), {
    kind: 'month',
    yearMonth: '2027-03',
  })
  assert.deepEqual(parseChallengeOrigin({ kind: 'shelf' }), { kind: 'shelf' })
  assert.deepEqual(parseChallengeOrigin({ kind: 'shelf', yearMonth: '2026-10' }), {
    kind: 'shelf',
    yearMonth: '2026-10',
  })
  assert.deepEqual(parseChallengeOrigin({ kind: 'library' }), { kind: 'library' })
  assert.deepEqual(parseChallengeOrigin({ kind: 'library', yearMonth: '2026-09' }), {
    kind: 'library',
    yearMonth: '2026-09',
  })
})

test('parseChallengeOrigin handles unknown, missing, and malformed origins gracefully', () => {
  for (const invalid of [
    undefined,
    null,
    '',
    'month',
    42,
    [],
    {},
    { kind: 'unknown' },
    { kind: 'today' },
    { kind: 'javascript:alert(1)' },
    { kind: 'month' },
    { kind: 'month', yearMonth: '2027-13' },
    { kind: 'month', yearMonth: '../2027-03' },
  ]) {
    assert.deepEqual(parseChallengeOrigin(invalid), DEFAULT_CHALLENGE_ORIGIN)
  }

  // Shelf and library drop malformed yearMonth while preserving kind
  assert.deepEqual(parseChallengeOrigin({ kind: 'shelf', yearMonth: 'bad' }), { kind: 'shelf' })
  assert.deepEqual(parseChallengeOrigin({ kind: 'library', yearMonth: '2026-00' }), {
    kind: 'library',
  })
})

test('URL search parameter parsing and serialization round-trip safely', () => {
  for (const origin of [
    { kind: 'hub' } as const,
    { kind: 'month', yearMonth: '2027-03' } as const,
    { kind: 'shelf' } as const,
    { kind: 'shelf', yearMonth: '2026-10' } as const,
    { kind: 'library' } as const,
    { kind: 'library', yearMonth: '2026-09' } as const,
  ]) {
    const query = serializeChallengeOriginToSearchParams(origin)
    const roundTripped = parseChallengeOriginFromSearchParams(new URLSearchParams(query))
    assert.deepEqual(roundTripped, origin)
    assert.equal(areChallengeOriginsEqual(roundTripped, origin), true)
  }

  assert.deepEqual(
    parseChallengeOriginFromSearchParams(new URLSearchParams('origin=month&yearMonth=invalid')),
    DEFAULT_CHALLENGE_ORIGIN,
  )
  assert.deepEqual(
    parseChallengeOriginFromSearchParams(new URLSearchParams('foo=bar')),
    DEFAULT_CHALLENGE_ORIGIN,
  )
})

test('formatChallengeOriginLabel renders understandable, timezone-safe exit labels', () => {
  assert.equal(formatChallengeOriginLabel({ kind: 'hub' }), 'Return to Hub')
  assert.equal(
    formatChallengeOriginLabel({ kind: 'hub' }, { hubLabel: 'Return to Today' }),
    'Return to Today',
  )
  assert.equal(formatChallengeOriginLabel({ kind: 'month', yearMonth: '2027-01' }), 'Return to January 2027')
  assert.equal(formatChallengeOriginLabel({ kind: 'month', yearMonth: '2027-03' }), 'Return to March 2027')
  assert.equal(formatChallengeOriginLabel({ kind: 'shelf' }), 'Return to Shelf')
  assert.equal(
    formatChallengeOriginLabel({ kind: 'shelf', yearMonth: '2026-11' }),
    'Return to Shelf · November 2026',
  )
  assert.equal(formatChallengeOriginLabel({ kind: 'library' }), 'Return to Library')
  assert.equal(
    formatChallengeOriginLabel({ kind: 'library', yearMonth: '2026-10' }),
    'Return to Library · October 2026',
  )
})
