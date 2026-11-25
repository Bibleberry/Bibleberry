import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import {
  activeRoute,
  applyNavigationAction,
  createBrowserNavigation,
  createNavigationState,
  navigationReducer as reduce,
  projectNavigationHash,
  restoreBrowserLocation,
  serializeBrowserNavigation,
  type BrowserNavigation,
  type NavigationAction,
} from '../../src/readerShell/navigation/index.ts'
import { activeScreenKey } from '../../src/readerShell/navigation/routeTable.ts'
import {
  encodeDiscoveriesBatch,
  handOffDiscoveriesBatch,
  parseDiscoveriesBatch,
  projectDiscoveriesBatch,
  VIEW_DISCOVERIES_SCREEN,
} from '../../src/readerShell/today/discoveriesBatch.ts'
import {
  createInitialHubAnnouncementState,
  evaluateHubAnnouncementState,
  completeAcknowledgeBatchState,
  beginAcknowledgeBatchState,
} from '../../src/components/announcements/hubCardAnnouncementModel.ts'
import { reduceParticipationCommand, emptyReaderParticipationData } from '../../src/participation/model.ts'
import { selectNewDiscoveryAwardIds } from '../../src/participation/model.ts'
import type {
  CanonicalAwardId,
  EarnedAwardRecord,
  EarnedScriptureCardSnapshot,
  ReaderParticipationData,
} from '../../src/participation/types.ts'

const thematic = 'card:monthly:2026-11:november-reading' as CanonicalAwardId
const fullMonth = 'card:monthly:2026-11:full-month' as CanonicalAwardId
const older = 'card:monthly:2026-10:october-reading' as CanonicalAwardId

const card: EarnedScriptureCardSnapshot = Object.freeze({
  cardDocumentId: 'card-november-reading',
  title: 'November Reading Card',
  publicationYearMonth: '2026-11',
  imageUrl: 'https://cdn.sanity.io/images/80016lrq/staging/m1a-november-card-800x1000.svg',
  assetRevision: 'rev-1',
  illustrationAlt: 'Synthetic art',
  accessibleTranscription: 'Synthetic transcription',
  scripture: { book: 'Psalms', reference: 'Psalm 23:1', translation: 'WEB' },
  attribution: 'World English Bible (Public Domain)',
  rightsStatus: 'publicDomain',
  shareEligible: true,
}) as EarnedScriptureCardSnapshot

function award(awardId: CanonicalAwardId, overrides: Partial<EarnedAwardRecord> = {}): EarnedAwardRecord {
  const [, , yearMonth, slug] = awardId.split(':')
  return {
    awardId,
    kind: slug === 'full-month' ? 'fullMonth' : 'thematic',
    publicationYearMonth: yearMonth as EarnedAwardRecord['publicationYearMonth'],
    discoveryId: `discovery:${yearMonth}:${slug}`,
    earnedOn: '2026-11-15' as EarnedAwardRecord['earnedOn'],
    hubAnnouncementAcked: false,
    cardViewed: false,
    ...overrides,
  }
}

function data(...records: EarnedAwardRecord[]): ReaderParticipationData {
  return {
    ...emptyReaderParticipationData(),
    earnedAwards: Object.fromEntries(records.map(record => [record.awardId, record])),
  }
}

test('encodes and parses only complete canonical batches, never truncating or deduplicating silently', () => {
  const encoded = encodeDiscoveriesBatch([thematic, fullMonth])
  assert.equal(encoded, `${thematic} ${fullMonth}`)
  assert.deepEqual(parseDiscoveriesBatch(encoded), [thematic, fullMonth])
  assert.equal(encodeDiscoveriesBatch([]), null)
  assert.equal(encodeDiscoveriesBatch([thematic, fullMonth, thematic]), null)
  assert.equal(encodeDiscoveriesBatch([thematic, 'not-an-award' as CanonicalAwardId]), null)
  for (const raw of ['', ' ', `${thematic} ${thematic}`, `${thematic}  ${fullMonth}`, 'card:monthly:2026-13:x', 42, undefined]) {
    assert.equal(parseDiscoveriesBatch(raw), null, String(raw))
  }
})

test('a large catch-up batch round-trips completely through the session route and browser reload', () => {
  const large = Array.from({ length: 600 }, (_, index) => {
    const year = 2000 + Math.floor(index / 12)
    const month = String((index % 12) + 1).padStart(2, '0')
    return `card:monthly:${year}-${month}:reading-${index}` as CanonicalAwardId
  })
  const id = encodeDiscoveriesBatch(large)
  assert.ok(id)
  assert.deepEqual(parseDiscoveriesBatch(id), large)
  const options = {
    currentYearMonth: '2026-11', monthScreenEnabled: true, releasedChallengeRouteEnabled: true,
    historicalLibraryEnabled: true, fieldNotebookEnabled: true, savedScriptureEnabled: true, newsReaderEnabled: true,
  }
  const first = restoreBrowserLocation(createBrowserNavigation('session-1'), { hash: '' }, options)
  assert.equal(first.status, 'ready')
  const route = { kind: 'detail', screen: VIEW_DISCOVERIES_SCREEN, id } as const
  const opened = applyNavigationAction(first.navigation, { type: 'push', route })
  if (opened.history.type !== 'push') throw new Error('expected push')
  const reloaded = restoreBrowserLocation(
    createBrowserNavigation('session-2', serializeBrowserNavigation(opened.navigation)),
    { hash: opened.history.hash, historyState: opened.history.state },
    options,
  )
  assert.equal(reloaded.status, 'ready')
  const restored = activeRoute(reloaded.navigation.state)
  assert.equal(restored.kind === 'detail' ? parseDiscoveriesBatch(restored.id)?.length : 0, large.length)
})

test('a batch is acknowledged only after its gallery handoff succeeds', () => {
  let acknowledged = 0
  const opened: (readonly CanonicalAwardId[])[] = []
  assert.equal(handOffDiscoveriesBatch([thematic], () => false, () => { acknowledged++ }), false)
  assert.equal(handOffDiscoveriesBatch([], ids => { opened.push(ids); return true }, () => { acknowledged++ }), false)
  assert.equal(acknowledged, 0)
  assert.deepEqual(opened, [])
  assert.equal(handOffDiscoveriesBatch([thematic, fullMonth], ids => { opened.push(ids); return true }, () => { acknowledged++ }), true)
  assert.equal(acknowledged, 1)
  assert.deepEqual(opened, [[thematic, fullMonth]])
})

test('projects only referenced earned awards in announcement order without fabricating art', () => {
  const participation = data(
    award(thematic, { earnedCard: card, cardDocumentId: card.cardDocumentId }),
    award(fullMonth),
    award(older, { earnedOn: '2026-10-31' as EarnedAwardRecord['earnedOn'], earnedCard: card }),
  )
  const items = projectDiscoveriesBatch(participation, [fullMonth, thematic, 'card:monthly:2026-11:missing' as CanonicalAwardId])
  assert.deepEqual(items.map(item => item.awardId), [fullMonth, thematic])
  assert.equal(items[0].hasCardSnapshot, false)
  assert.equal(items[0].earnedCard, undefined)
  assert.equal(items[1].earnedCard?.imageUrl, card.imageUrl)
  // The October card's snapshot belongs to another month and is never surfaced here.
  assert.ok(!items.some(item => item.awardId === older))
})

test('one combined batch per Today visit; dismissal acknowledges only that batch and keeps New Discoveries and Card New', () => {
  let participation = data(award(thematic, { earnedCard: card }), award(fullMonth))
  let state = evaluateHubAnnouncementState(createInitialHubAnnouncementState(true), {
    participationReady: true, participationData: participation, preferencesReady: true, announcementsEnabled: true,
  })
  assert.deepEqual(state.openBatch?.map(item => item.awardId), [fullMonth, thematic].sort((a, b) => a.localeCompare(b)))
  const batch = state.openBatch!.map(item => item.awardId)
  // A later award during the open visit stays pending for the next Today arrival.
  participation = reduceParticipationCommand(participation, {
    type: 'recordEarnedAwards',
    awards: [{ awardId: older, discoveryId: 'discovery:2026-10:october-reading', earnedOn: '2026-11-15' as EarnedAwardRecord['earnedOn'] }],
  })
  state = completeAcknowledgeBatchState(beginAcknowledgeBatchState(state))
  participation = reduceParticipationCommand(participation, { type: 'acknowledgeAwardAnnouncements', awardIds: batch })
  for (const id of batch) {
    assert.equal(participation.earnedAwards[id].hubAnnouncementAcked, true)
    assert.equal(participation.earnedAwards[id].cardViewed, false)
  }
  assert.equal(participation.earnedAwards[older].hubAnnouncementAcked, false)
  assert.deepEqual([...selectNewDiscoveryAwardIds(participation)].sort(), [older, fullMonth, thematic].sort())

  const sameVisit = evaluateHubAnnouncementState(state, {
    participationReady: true, participationData: participation, preferencesReady: true, announcementsEnabled: true,
  })
  assert.equal(sameVisit.openBatch, null)
  const nextVisit = evaluateHubAnnouncementState(createInitialHubAnnouncementState(true), {
    participationReady: true, participationData: participation, preferencesReady: true, announcementsEnabled: true,
  })
  assert.deepEqual(nextVisit.openBatch?.map(item => item.awardId), [older])
})

test('opt-out shows nothing and changes no records; re-enabling yields one catch-up on the next Today visit', () => {
  const participation = data(award(thematic, { earnedCard: card }), award(fullMonth))
  const input = { participationReady: true, participationData: participation, preferencesReady: true }
  const suppressed = evaluateHubAnnouncementState(createInitialHubAnnouncementState(true), { ...input, announcementsEnabled: false })
  assert.equal(suppressed.openBatch, null)
  // Re-enabling during the same suppressed visit does not pop up mid-visit.
  assert.equal(evaluateHubAnnouncementState(suppressed, { ...input, announcementsEnabled: true }).openBatch, null)
  const catchUp = evaluateHubAnnouncementState(createInitialHubAnnouncementState(true), { ...input, announcementsEnabled: true })
  assert.equal(catchUp.openBatch?.length, 2)
  assert.ok(Object.values(participation.earnedAwards).every(record => !record.hubAnnouncementAcked && !record.cardViewed))
})

test('View Discoveries is a session-only Today route; Browse Full Field Notebook opens Collections', () => {
  const id = encodeDiscoveriesBatch([thematic, fullMonth])!
  const route = { kind: 'detail', screen: VIEW_DISCOVERIES_SCREEN, id } as const
  const actions: NavigationAction[] = [{ type: 'push', route }]
  let state = actions.reduce(reduce, createNavigationState())
  assert.deepEqual(activeRoute(state), route)
  assert.equal(projectNavigationHash(state), '#/')
  assert.equal(activeScreenKey(state), 'today:detail:viewDiscoveries')

  state = reduce(state, { type: 'openFieldNotebook' })
  assert.equal(state.activeTab, 'collections')
  assert.deepEqual(state.stacks.collections, [{ kind: 'notebook' }])
  assert.deepEqual(state.stacks.today, [route])
  assert.equal(reduce(state, { type: 'openFieldNotebook' }), state)
  state = reduce(state, { type: 'pop' })
  assert.deepEqual(activeRoute(state), { kind: 'landing', tab: 'collections' })
  state = reduce(state, { type: 'selectTab', tab: 'today' })
  assert.deepEqual(activeRoute(state), route)
  state = reduce(state, { type: 'pop' })
  assert.deepEqual(activeRoute(state), { kind: 'landing', tab: 'today' })

  const focused = reduce(createNavigationState(), { type: 'openIntro' })
  assert.equal(reduce(focused, { type: 'openFieldNotebook' }), focused)
})

test('browser Back returns to Today and reload reopens the same gallery batch', () => {
  const options = {
    currentYearMonth: '2026-11',
    monthScreenEnabled: true,
    releasedChallengeRouteEnabled: true,
    historicalLibraryEnabled: true,
    fieldNotebookEnabled: true,
    savedScriptureEnabled: true,
    newsReaderEnabled: true,
  }
  const first = restoreBrowserLocation(createBrowserNavigation('session-1'), { hash: '' }, options)
  assert.equal(first.status, 'ready')
  let navigation: BrowserNavigation = first.navigation
  const route = { kind: 'detail', screen: VIEW_DISCOVERIES_SCREEN, id: encodeDiscoveriesBatch([thematic])! } as const
  const opened = applyNavigationAction(navigation, { type: 'push', route })
  assert.equal(opened.history.type, 'push')
  navigation = opened.navigation
  if (opened.history.type !== 'push') throw new Error('expected push')
  const address = { hash: opened.history.hash, historyState: opened.history.state }

  const reloaded = restoreBrowserLocation(
    createBrowserNavigation('session-2', serializeBrowserNavigation(navigation)),
    address,
    options,
  )
  assert.equal(reloaded.status, 'ready')
  assert.deepEqual(activeRoute(reloaded.navigation.state), route)

  assert.equal(applyNavigationAction(navigation, { type: 'pop' }).history.type, 'back')
})
