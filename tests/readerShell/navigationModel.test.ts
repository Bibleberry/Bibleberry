import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import {
  activeRestoration,
  activeRoute,
  createNavigationState,
  globalNavigation,
  navigationReducer as reduce,
  READER_TABS,
  type NavigationAction,
} from '../../src/readerShell/navigation/navigationModel.ts'

function navigate(...actions: NavigationAction[]) {
  return actions.reduce(reduce, createNavigationState())
}

const october = { kind: 'month', yearMonth: '2026-10' } as const
const november = { kind: 'month', yearMonth: '2026-11' } as const
const browse = { kind: 'browseMonths' } as const
const notebook = { kind: 'notebook' } as const
const gallery = { kind: 'detail', screen: 'notebookGallery', id: '2026-11' } as const
const article = { kind: 'detail', screen: 'newsArticle', id: 'update' } as const
const save = (scrollTop: number, focusId?: string): NavigationAction => ({
  type: 'saveRestoration', value: { scrollTop, focusId },
})

test('starts on Today and restores each tab’s nested routes and restoration context', () => {
  const fresh = createNavigationState()
  assert.deepEqual(READER_TABS, ['today', 'library', 'collections', 'more'])
  assert.deepEqual(activeRoute(fresh), { kind: 'landing', tab: 'today' })
  assert.equal(activeRestoration(fresh), undefined)

  let state = navigate(
    { type: 'push', route: november }, save(420, 'current-week'),
    { type: 'selectTab', tab: 'library' }, { type: 'push', route: browse }, save(124),
    { type: 'push', route: october }, save(237),
    { type: 'selectTab', tab: 'collections' }, { type: 'push', route: notebook },
    { type: 'push', route: gallery }, save(81, 'january'),
    { type: 'selectTab', tab: 'more' }, { type: 'push', route: article }, save(52),
  )
  const expected = [[november, 420], [october, 237], [gallery, 81], [article, 52]] as const
  for (const [index, tab] of READER_TABS.entries()) {
    state = reduce(state, { type: 'selectTab', tab })
    assert.deepEqual(activeRoute(state), expected[index][0])
    assert.equal(activeRestoration(state)?.scrollTop, expected[index][1])
  }
  state = reduce(state, { type: 'selectTab', tab: 'collections' })
  assert.equal(activeRestoration(state)?.focusId, 'january')
  state = reduce(state, { type: 'pop' })
  assert.deepEqual(activeRoute(state), notebook)
  assert.equal(activeRestoration(state), undefined)
})

test('active-tab reselection returns to its landing at top and preserves other tabs', () => {
  const state = navigate(
    { type: 'push', route: november },
    { type: 'selectTab', tab: 'library' }, save(261, 'shelf'),
    { type: 'push', route: browse }, { type: 'push', route: october },
    { type: 'selectTab', tab: 'library' },
  )
  assert.deepEqual(activeRoute(state), { kind: 'landing', tab: 'library' })
  assert.deepEqual(activeRestoration(state), { scrollTop: 0 })
  assert.deepEqual(state.stacks.today, [november])
  assert.deepEqual(state.stacks.library, [])
})

test('Challenge Exit, Finish and in-app Back restore each actual internal origin', () => {
  const cases = [
    [[], { kind: 'hub' }],
    [[{ type: 'push', route: november }], { kind: 'month', yearMonth: '2026-11' }],
    [[{ type: 'selectTab', tab: 'library' }], { kind: 'shelf' }],
    [[{ type: 'selectTab', tab: 'library' }, { type: 'push', route: browse }], { kind: 'library' }],
  ] as const satisfies readonly (readonly [readonly NavigationAction[], object])[]

  for (const [actions, origin] of cases) {
    const before = navigate(...actions, save(210, 'challenge-link'))
    const reading = reduce(before, { type: 'openChallenge', slug: 'ordinary-teaching', expectedDocumentId: 'cms-id' })
    assert.deepEqual(reading.focused, {
      kind: 'challenge', entry: 'inSession', slug: 'ordinary-teaching', origin, expectedDocumentId: 'cms-id',
    })
    assert.equal(globalNavigation(reading), 'hidden')
    assert.equal(reduce(reading, { type: 'selectTab', tab: 'more' }), reading)
    assert.equal(reduce(reading, save(999)), reading)
    for (const type of ['exitChallenge', 'finishChallenge', 'pop'] as const) {
      assert.deepEqual(reduce(reading, { type }), before)
    }
  }
})

test('guided and introduction modes preserve origin and never replace an active Challenge', () => {
  const more = navigate({ type: 'selectTab', tab: 'more' }, save(51, 'app-tutorial'))
  const intro = reduce(more, { type: 'openIntro' })
  assert.equal(globalNavigation(intro), 'hidden')
  assert.deepEqual(reduce(intro, { type: 'closeGuidance' }), more)
  const tutorial = reduce(more, { type: 'openTutorial' })
  assert.equal(globalNavigation(tutorial), 'guided')
  const librarySpotlight = reduce(tutorial, { type: 'showTutorialTab', tab: 'library' })
  assert.deepEqual(librarySpotlight.focused, { kind: 'tutorial', shownTab: 'library' })
  assert.deepEqual(reduce(librarySpotlight, { type: 'closeGuidance' }), more)

  const month = navigate({ type: 'push', route: november }, save(88))
  const monthIntro = reduce(month, { type: 'openMonthIntro' })
  assert.equal(globalNavigation(monthIntro), 'hidden')
  assert.deepEqual(reduce(monthIntro, { type: 'closeGuidance' }), month)
  assert.deepEqual(reduce(monthIntro, { type: 'pop' }), month)
  const reading = reduce(month, { type: 'openChallenge', slug: 'ordinary-teaching' })
  for (const type of ['openMonthIntro', 'openIntro', 'openTutorial'] as const) {
    assert.equal(reduce(reading, { type }), reading)
  }
})

test('warm external entry bypasses guidance and explicit return goes to Today without clearing other tabs', () => {
  const tutorial = navigate(
    { type: 'selectTab', tab: 'library' }, { type: 'push', route: october },
    { type: 'selectTab', tab: 'more' }, { type: 'openTutorial' },
  )
  const reading = reduce(tutorial, { type: 'enterExternalChallenge', slug: 'external-teaching' })
  assert.deepEqual(reading.focused, {
    kind: 'challenge', slug: 'external-teaching', entry: 'external', origin: { kind: 'hub' },
  })
  assert.equal(reduce(reading, { type: 'pop' }), reading)
  for (const type of ['exitChallenge', 'finishChallenge'] as const) {
    const after = reduce(reading, { type })
    assert.deepEqual(activeRoute(after), { kind: 'landing', tab: 'today' })
    assert.equal(after.focused, null)
    assert.deepEqual(after.stacks.library, [october])
  }
})

test('rejects invalid model routes, restoration and Challenge slugs', () => {
  const initial = createNavigationState()
  assert.equal(reduce(initial, { type: 'push', route: { kind: 'month', yearMonth: '2026-13' } }), initial)
  assert.equal(reduce(initial, save(Number.POSITIVE_INFINITY)), initial)
  assert.equal(reduce(initial, save(-1)), initial)
  assert.equal(reduce(initial, { type: 'openChallenge', slug: 'not/a-slug' }), initial)
})
