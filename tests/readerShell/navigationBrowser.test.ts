import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { createUnavailableContentOutcome } from '../../src/deepLinkIngress/outcomes.ts'
import type { DeepLinkIngressOutcome } from '../../src/deepLinkIngress/types.ts'
import {
  applyNativeIngress,
  applyNavigationAction,
  createBrowserNavigation,
  restoreBrowserLocation,
  serializeBrowserNavigation,
  type BrowserAddress,
  type BrowserNavigation,
  type BrowserRestore,
  type ChallengeAuthorization,
  type NavigationUpdate,
  activeRestoration,
  activeRoute,
  parseNavigationHash,
  projectNavigationHash,
  type NavigationAction,
} from '../../src/readerShell/navigation/index.ts'

const options = {
  currentYearMonth: '2026-11',
  monthScreenEnabled: true,
  releasedChallengeRouteEnabled: true,
  historicalLibraryEnabled: true,
  fieldNotebookEnabled: true,
  savedScriptureEnabled: true,
  newsReaderEnabled: true,
}
const today = { kind: 'landing', tab: 'today' } as const
const month = { kind: 'month', yearMonth: '2026-10' } as const
const notebook = { kind: 'notebook' } as const
const gallery = { kind: 'detail', screen: 'notebookGallery', id: '2026-10' } as const
const released = { status: 'authorized', slug: 'historical-teaching' } as const
const verified = { ...released, documentId: 'cms:expected' } as const
const forged = '#/challenge/historical-teaching?origin=month&yearMonth=2026-10'

function ready(result: BrowserRestore) {
  assert.equal(result.status, 'ready')
  return result
}

// Simulate one browser history owner, including truncation on push and identical-hash entries.
function browser(hash = '', auth?: ChallengeAuthorization) {
  let navigation = createBrowserNavigation('session-1')
  let entries: BrowserAddress[] = [{ hash }]
  let index = 0
  const restore = (authorization?: ChallengeAuthorization) => {
    const result = restoreBrowserLocation(navigation, entries[index], options, authorization)
    if (result.status === 'ready') apply(result)
    return result
  }
  function apply(update: NavigationUpdate) {
    navigation = update.navigation
    const { history } = update
    if (history.type === 'back') {
      assert.ok(index > 0)
      index--
      ready(restore())
    }
    if (history.type === 'replace') entries[index] = { hash: history.hash, historyState: history.state }
    if (history.type === 'push') {
      entries = [...entries.slice(0, index + 1), { hash: history.hash, historyState: history.state }]
      index++
    }
    return history.type
  }
  ready(restore(auth))
  return {
    get navigation() { return navigation },
    get state() { return navigation.state },
    get address() { return entries[index] },
    apply,
    act(action: NavigationAction) { return apply(applyNavigationAction(navigation, action)) },
    go(delta: -1 | 1, authorization?: ChallengeAuthorization) {
      assert.ok(index + delta >= 0 && index + delta < entries.length)
      index += delta
      return restore(authorization)
    },
    reload(authorization?: ChallengeAuthorization) {
      navigation = createBrowserNavigation('new-session-id', serializeBrowserNavigation(navigation))
      return restore(authorization)
    },
    restore,
  }
}

test('recognizes existing Month, Challenge, collection and News hashes and legacy aliases', () => {
  const cases = [
    ['', { kind: 'tab', tab: 'today' }],
    ['#/teaching/abc-123', { kind: 'tab', tab: 'today' }],
    ['#/entry/abc-123', { kind: 'tab', tab: 'today' }],
    ['#/month/', { kind: 'month', yearMonth: '2026-11' }],
    ['#/month/2026-10', month],
    [forged, { kind: 'challenge', slug: released.slug }],
    ['#/shelf', { kind: 'tab', tab: 'library' }],
    ['#/library/', { kind: 'tab', tab: 'library', route: { kind: 'browseMonths' } }],
    ['#/field-notebook/', { kind: 'tab', tab: 'collections', route: notebook }],
    ['#/savedScripture', { kind: 'tab', tab: 'collections', route: { kind: 'savedScripture' } }],
    ['#/ministry-news/?category=monthlyPreview', { kind: 'tab', tab: 'more', route: { kind: 'news', category: 'monthlyPreview' } }],
    ['#/news?category=unknown', { kind: 'tab', tab: 'more', route: { kind: 'news', category: 'all' } }],
  ] as const
  for (const [hash, target] of cases) assert.deepEqual(parseNavigationHash(hash, options), target, hash)
  const disabled = { ...options, monthScreenEnabled: false, releasedChallengeRouteEnabled: false, newsReaderEnabled: false }
  assert.deepEqual(parseNavigationHash(forged, disabled), { kind: 'invalid', challenge: true })
  assert.deepEqual(parseNavigationHash('#/news', disabled), { kind: 'invalid', challenge: false })
})

test('Back, Forward and reload restore the visited frame, latest other tabs and route context', () => {
  const app = browser()
  app.act({ type: 'push', route: month })
  assert.equal(app.act({ type: 'saveRestoration', value: { scrollTop: 420 } }), 'none')
  app.act({ type: 'selectTab', tab: 'collections' })
  app.act({ type: 'push', route: notebook })
  app.act({ type: 'push', route: gallery })
  assert.equal(app.act({ type: 'push', route: gallery }), 'none')
  app.act({ type: 'saveRestoration', value: { scrollTop: 88, focusId: 'october' } })
  assert.equal(app.address.hash, '#/notebook')
  const galleryAddress = app.address
  app.go(-1)
  assert.deepEqual(activeRoute(app.state), notebook)
  assert.equal(app.address.hash, galleryAddress.hash)
  assert.notDeepEqual(app.address.historyState, galleryAddress.historyState)
  app.go(1)
  assert.deepEqual(activeRoute(app.state), gallery)
  assert.deepEqual(activeRestoration(app.state), { scrollTop: 88, focusId: 'october' })
  assert.equal(ready(app.reload()).history.type, 'none')
  assert.deepEqual(activeRoute(app.state), gallery)
  assert.deepEqual(app.state.stacks.today, [month])
  assert.equal(ready(app.restore()).history.type, 'none')

  app.act({ type: 'selectTab', tab: 'today' })
  assert.deepEqual(activeRoute(app.state), month)
  assert.equal(activeRestoration(app.state)?.scrollTop, 420)
  app.act({ type: 'selectTab', tab: 'today' })
  assert.deepEqual(activeRoute(app.state), today)
  assert.equal(activeRestoration(app.state)?.scrollTop, 0)
  app.go(-1)
  assert.deepEqual(activeRoute(app.state), month)
  app.go(1)
  assert.deepEqual(activeRoute(app.state), today)
  assert.deepEqual(activeRoute(browser().state), today)
})

test('a matching managed Challenge entry reauthorizes on Forward and reload, and closes through its true predecessor', () => {
  const app = browser()
  app.act({ type: 'push', route: month })
  app.act({ type: 'saveRestoration', value: { scrollTop: 317 } })
  const originAddress = app.address
  assert.equal(app.act({ type: 'openChallenge', slug: released.slug, expectedDocumentId: 'cms:expected' }), 'push')
  assert.equal(app.address.hash, '#/challenge/historical-teaching')
  assert.deepEqual(app.go(-1), ready(app.restore()))
  assert.deepEqual(activeRoute(app.state), month)
  assert.deepEqual(app.go(1), { status: 'challengeAuthorizationRequired', slug: released.slug, expectedDocumentId: 'cms:expected' })
  ready(app.restore(verified))
  assert.deepEqual(app.reload(), { status: 'challengeAuthorizationRequired', slug: released.slug, expectedDocumentId: 'cms:expected' })
  assert.equal(app.state.focused, null)
  ready(app.restore(verified))
  assert.deepEqual(app.state.focused, {
    kind: 'challenge', entry: 'inSession', origin: month, slug: released.slug, expectedDocumentId: 'cms:expected',
  })
  assert.equal(app.act({ type: 'finishChallenge' }), 'back')
  assert.deepEqual(app.address, originAddress)
  assert.equal(activeRestoration(app.state)?.scrollTop, 317)
  ready(app.go(1, verified))
  assert.equal(app.act({ type: 'exitChallenge' }), 'back')
  assert.deepEqual(app.address, originAddress)
})

test('rejects stale, denied or wrong-document browser authorization without revealing the reader', () => {
  const app = browser()
  app.act({ type: 'push', route: month })
  app.act({ type: 'openChallenge', slug: released.slug, expectedDocumentId: 'cms:expected' })
  assert.equal(app.reload({ ...verified, slug: 'different-teaching' }).status, 'challengeAuthorizationRequired')
  ready(app.restore({ ...verified, documentId: 'cms:different' }))
  assert.equal(app.state.focused, null)
  assert.equal(app.state.problem, 'challengeUnavailable')
  assert.deepEqual(activeRoute(app.state), month)
  assert.equal(app.act({ type: 'pop' }), 'back')
  assert.equal(app.state.problem, null)

  const denied = browser(forged, { status: 'unavailable', slug: released.slug })
  assert.deepEqual(activeRoute(denied.state), today)
  assert.equal(denied.state.problem, 'challengeUnavailable')
  assert.equal(denied.state.focused, null)
  assert.equal(denied.act({ type: 'returnToToday' }), 'replace')
  assert.equal(denied.state.problem, null)
})

test('missing, foreign or hash-mismatched history state cannot supply a Challenge return origin', () => {
  const app = browser()
  app.act({ type: 'push', route: month })
  app.act({ type: 'openChallenge', slug: released.slug })
  const state = app.address.historyState as { r06Navigation: { sessionId: string; navId: number; version: number } }
  const attempts: [BrowserNavigation, BrowserAddress][] = [
    [app.navigation, { hash: forged, historyState: state }],
    [app.navigation, { hash: app.address.hash, historyState: { challengeOrigin: month } }],
    [app.navigation, { hash: app.address.hash, historyState: { r06Navigation: { ...state.r06Navigation, sessionId: 'foreign' } } }],
    [createBrowserNavigation('fresh-session'), app.address],
    [createBrowserNavigation('session-1', '{ invalid JSON'), app.address],
  ]
  for (const [navigation, address] of attempts) {
    const restored = ready(restoreBrowserLocation(navigation, address, options, released))
    assert.deepEqual(restored.navigation.state.focused, {
      kind: 'challenge', slug: released.slug, entry: 'external', origin: { kind: 'hub' },
    })
    const exit = applyNavigationAction(restored.navigation, { type: 'exitChallenge' })
    assert.equal(exit.history.type, 'replace')
    assert.deepEqual(activeRoute(exit.navigation.state), today)
  }

  const external = browser(forged, released)
  ready(external.reload(released))
  assert.equal(external.state.focused?.kind === 'challenge' && external.state.focused.entry, 'external')
  assert.equal(external.act({ type: 'finishChallenge' }), 'replace')
  assert.deepEqual(activeRoute(external.state), today)
})

test('a hash alone never opens a Challenge and malformed or unsupported routes recover neutrally', () => {
  const fresh = createBrowserNavigation('fresh-session')
  assert.deepEqual(restoreBrowserLocation(fresh, { hash: forged }, options), {
    status: 'challengeAuthorizationRequired', slug: released.slug, expectedDocumentId: undefined,
  })
  const cases = [
    ['#/challenge', 'challengeUnavailable'],
    ['#/challenge/../other', 'challengeUnavailable'],
    ['#/challenge/%2F', 'challengeUnavailable'],
    ['#/challenge/historical-teaching?origin=month&origin=hub', 'challengeUnavailable'],
    ['#/challenge/historical-teaching?token=abc', 'challengeUnavailable'],
    ['#/month/2026-13', 'invalidRoute'],
    ['#/notebook\\', 'invalidRoute'],
    ['https://example.test/#/month/2026-10', 'invalidRoute'],
    ['#/unknown', 'invalidRoute'],
    ['#/month/2026-10', 'externalMonth'],
  ] as const
  for (const [hash, problem] of cases) {
    const app = browser(hash)
    assert.equal(app.state.problem, problem, hash)
    assert.deepEqual(activeRoute(app.state), today, hash)
    assert.equal(projectNavigationHash(app.state), '#/', hash)
    assert.equal(app.state.focused, null, hash)
  }
})

test('guided spotlight updates replace their entry, and Back and Close return to the same More view', () => {
  const app = browser('#/more')
  app.act({ type: 'saveRestoration', value: { scrollTop: 44 } })
  const original = app.address
  assert.equal(app.act({ type: 'openTutorial' }), 'push')
  assert.equal(app.act({ type: 'showTutorialTab', tab: 'collections' }), 'replace')
  assert.equal(app.address.hash, original.hash)
  ready(app.reload())
  assert.deepEqual(app.state.focused, { kind: 'tutorial', shownTab: 'collections' })
  assert.equal(app.act({ type: 'closeGuidance' }), 'back')
  assert.deepEqual(app.address, original)
  assert.equal(activeRestoration(app.state)?.scrollTop, 44)
  app.go(1)
  assert.deepEqual(app.state.focused, { kind: 'tutorial', shownTab: 'collections' })
  app.go(-1)
  assert.equal(app.state.focused, null)
})

const sourceEvent = { rawUrl: 'https://example.test/placeholder', trigger: 'resumedSession', receivedAtMs: 0 } as const
const nativeChallenge = {
  status: 'navigated',
  destination: { type: 'releasedChallenge', slug: released.slug, entry: 'external', origin: { kind: 'hub' } },
  internalHash: forged,
  info: { contentKind: 'releasedChallenge', slug: released.slug, entry: 'external', origin: { kind: 'hub' } },
  sourceEvent,
} as const satisfies DeepLinkIngressOutcome

test('authorized native ingress is external even when the same Challenge is currently open in-session', () => {
  const app = browser()
  app.act({ type: 'push', route: month })
  app.act({ type: 'openChallenge', slug: released.slug })
  assert.equal(app.apply(applyNativeIngress(app.navigation, nativeChallenge, options)), 'push')
  assert.deepEqual(app.state.focused, {
    kind: 'challenge', slug: released.slug, entry: 'external', origin: { kind: 'hub' },
  })
  assert.equal(app.act({ type: 'exitChallenge' }), 'replace')
  assert.deepEqual(activeRoute(app.state), today)
  // Browser Back is an actual history traversal, independent of the explicit external Exit.
  ready(app.go(-1, released))
  assert.equal(app.state.focused?.kind === 'challenge' && app.state.focused.entry, 'inSession')
})

test('cold native ingress takes the current entry without adding a Today visit below it', () => {
  const initial = createBrowserNavigation('native-cold-start')
  const opening = applyNativeIngress(initial, {
    ...nativeChallenge, sourceEvent: { ...sourceEvent, trigger: 'coldStart' },
  }, options)
  assert.equal(opening.history.type, 'replace')
  assert.equal(opening.navigation.state.focused?.kind, 'challenge')
  const exit = applyNavigationAction(opening.navigation, { type: 'exitChallenge' })
  assert.equal(exit.history.type, 'replace')
  assert.deepEqual(activeRoute(exit.navigation.state), today)
})

test('keeps native duplicate handling and rejects unavailable, mismatched, or external Month outcomes safely', () => {
  const app = browser('#/more')
  assert.equal(app.apply(applyNativeIngress(app.navigation, { status: 'ignoredDuplicate', sourceEvent }, options)), 'none')
  assert.equal(app.state.activeTab, 'more')
  const cases = [
    [{ status: 'unavailable', outcome: createUnavailableContentOutcome('contentNotReleased'), sourceEvent }, 'challengeUnavailable'],
    [{ ...nativeChallenge, internalHash: '#/challenge/different-teaching' }, 'challengeUnavailable'],
    [{
      status: 'navigated', destination: { type: 'month', yearMonth: month.yearMonth }, internalHash: '#/month/2026-10',
      info: { contentKind: 'month', yearMonth: month.yearMonth, monthPhase: 'historical' }, sourceEvent,
    }, 'externalMonth'],
  ] as const satisfies readonly (readonly [DeepLinkIngressOutcome, string])[]
  for (const [outcome, problem] of cases) {
    const result = applyNativeIngress(app.navigation, outcome, options)
    assert.equal(result.navigation.state.problem, problem)
    assert.equal(result.navigation.state.focused, null)
    assert.deepEqual(activeRoute(result.navigation.state), today)
  }
})
