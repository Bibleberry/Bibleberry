import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import {
  activeRoute,
  applyNavigationAction,
  createBrowserNavigation,
  restoreBrowserLocation,
} from '../../src/readerShell/navigation/index.ts'
import { readerRouteOptions } from '../../src/readerShell/navigation/routeTable.ts'

const options = readerRouteOptions()

test('opens mounted collection hashes and safely resolves malformed or unsupported destinations', () => {
  const navigation = createBrowserNavigation('shell')
  const cases = [
    ['#/field-notebook', { kind: 'notebook' }, null],
    ['#/library', { kind: 'browseMonths' }, null],
    ['#/month/2026-10', { kind: 'landing', tab: 'today' }, 'externalMonth'],
    ['#/studio', { kind: 'landing', tab: 'today' }, 'invalidRoute'],
    ['#/challenge/%2F', { kind: 'landing', tab: 'today' }, 'challengeUnavailable'],
  ] as const

  for (const [hash, expectedRoute, problem] of cases) {
    const result = restoreBrowserLocation(navigation, { hash }, options)
    assert.equal(result.status, 'ready')
    const { state } = result.navigation
    assert.deepEqual(activeRoute(state), expectedRoute)
    assert.equal(state.problem, problem)
    assert.equal(state.focused, null)
  }
})

test('shell route options require a gateway verdict and preserve the Month selection identity', () => {
  const start = restoreBrowserLocation(createBrowserNavigation('shell'), { hash: '#/' }, options)
  assert.equal(start.status, 'ready')
  const month = applyNavigationAction(start.navigation, { type: 'push', route: { kind: 'month', yearMonth: '2026-10' } })
  const selection = { slug: 'daily-reading', expectedDocumentId: 'reading-25' }
  const challenge = applyNavigationAction(month.navigation, { type: 'openChallenge', ...selection })
  assert.equal(challenge.history.type, 'push')
  const address = { hash: challenge.history.hash, historyState: challenge.history.state }
  assert.deepEqual(restoreBrowserLocation(challenge.navigation, address, options), {
    status: 'challengeAuthorizationRequired', ...selection,
  })
  const restored = restoreBrowserLocation(challenge.navigation, address, options, {
    slug: selection.slug, documentId: selection.expectedDocumentId, status: 'authorized',
  })
  assert.equal(restored.status, 'ready')
  assert.deepEqual(restored.navigation.state.focused, challenge.navigation.state.focused)
})
