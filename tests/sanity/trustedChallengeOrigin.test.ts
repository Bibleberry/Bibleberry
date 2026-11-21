import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  EXTERNAL_CHALLENGE_RETURN,
  resolveTrustedChallengeReturn,
} from '../../src/native/trustedChallengeOrigin.ts'

test('resolves every recorded in-session origin as an in-session return', () => {
  for (const origin of [
    { kind: 'hub' },
    { kind: 'month', yearMonth: '2026-10' },
    { kind: 'shelf' },
    { kind: 'shelf', yearMonth: '2026-10' },
    { kind: 'library' },
    { kind: 'library', yearMonth: '2026-09' },
  ]) {
    assert.deepEqual(resolveTrustedChallengeReturn(origin), { origin, entry: 'inSession' })
  }
})

test('anything else is an external entry that returns to Today', () => {
  assert.deepEqual(EXTERNAL_CHALLENGE_RETURN, { origin: { kind: 'hub' }, entry: 'external' })
  for (const candidate of [
    undefined,
    null,
    '',
    'month',
    'origin=month&yearMonth=2026-10',
    new URLSearchParams('origin=month&yearMonth=2026-10'),
    [],
    {},
    { kind: 'today' },
    { kind: 'month' },
    { kind: 'month', yearMonth: 'bad' },
  ]) {
    assert.deepEqual(
      resolveTrustedChallengeReturn(candidate),
      EXTERNAL_CHALLENGE_RETURN,
      String(candidate),
    )
  }
})
