import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import {
  activeRoute,
  applyNavigationAction,
  createBrowserNavigation,
} from '../../src/readerShell/navigation/index.ts'
import { readerRouteOptions, resolveReaderLocation } from '../../src/readerShell/navigation/routeTable.ts'

const options = readerRouteOptions()

test('opens mounted collection hashes and safely resolves malformed or unsupported destinations', () => {
  const navigation = createBrowserNavigation('shell')
  const cases = [
    ['#/field-notebook', { kind: 'notebook' }, null],
    ['#/library', { kind: 'browseMonths' }, null],
    ['#/month/2026-10', { kind: 'landing', tab: 'today' }, 'externalMonth'],
    ['#/studio', { kind: 'landing', tab: 'today' }, 'invalidRoute'],
    ['#/challenge/unmounted?origin=month&yearMonth=2026-10', { kind: 'landing', tab: 'today' }, 'challengeUnavailable'],
  ] as const

  for (const [hash, expectedRoute, problem] of cases) {
    const { navigation: { state } } = resolveReaderLocation(navigation, { hash }, options)
    assert.deepEqual(activeRoute(state), expectedRoute)
    assert.equal(state.problem, problem)
    assert.equal(state.focused, null)
  }
})

test('a matching in-session Challenge receipt cannot restore a focused reader in this increment', () => {
  const start = resolveReaderLocation(createBrowserNavigation('shell'), { hash: '#/' }, options)
  const month = applyNavigationAction(start.navigation, { type: 'push', route: { kind: 'month', yearMonth: '2026-10' } })
  const challenge = applyNavigationAction(month.navigation, { type: 'openChallenge', slug: 'unmounted' })
  assert.equal(challenge.history.type, 'push')
  const restored = resolveReaderLocation(challenge.navigation, {
    hash: challenge.history.hash,
    historyState: challenge.history.state,
  }, options)
  assert.equal(restored.navigation.state.focused, null)
  assert.equal(restored.navigation.state.problem, 'challengeUnavailable')
})
