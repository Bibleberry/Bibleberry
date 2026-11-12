import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import {
  CARD_ANNOUNCEMENT_PREFS_STORAGE_KEY,
  createAnnouncementPreferencesStore,
  parseCardAnnouncementPreferencesEnvelope,
  serializeCardAnnouncementPreferencesEnvelope,
} from '../../src/components/announcements/announcementPreferencesStorage.ts'
import {
  arriveAtHubState,
  beginAcknowledgeBatchState,
  buildCombinedAnnouncementCopy,
  buildPresentedEarnedAwardItem,
  completeAcknowledgeBatchState,
  createInitialHubAnnouncementState,
  dismissFailedAcknowledgeBatchState,
  evaluateHubAnnouncementState,
  failAcknowledgeBatchState,
  leaveHubState,
  selectPresentedBatchAwardIds,
  setActiveSurfaceState,
  type HubSurface,
} from '../../src/components/announcements/hubCardAnnouncementModel.ts'
import {
  createRecordEarnedAwardsCommand,
  selectPendingHubAnnouncementAwards,
  validateEarnedCardSnapshot,
} from '../../src/participation/awards.ts'
import {
  parseCanonicalMonthlyAwardId,
  parseLocalCalendarDate,
  parsePublicationYearMonth,
} from '../../src/participation/identity.ts'
import {
  emptyReaderParticipationData,
  reduceParticipationCommand,
} from '../../src/participation/model.ts'
import {
  createEnvelopePersistenceAdapter,
  type KeyValueStorageDriver,
} from '../../src/participation/persistence.ts'
import { createReaderParticipationStore } from '../../src/participation/store.ts'
import type {
  EarnedAwardRecord,
  EarnedScriptureCardSnapshot,
  ReaderParticipationData,
} from '../../src/participation/types.ts'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function makeCardSnapshot(
  overrides: Partial<EarnedScriptureCardSnapshot> = {},
): EarnedScriptureCardSnapshot {
  return {
    cardDocumentId: 'card-2026-11-light-path',
    title: 'Lamp to My Feet',
    publicationYearMonth: parsePublicationYearMonth('2026-11')!,
    imageUrl: 'https://cdn.sanity.io/images/80016lrq/staging/card-light-path.png',
    assetRevision: 'v1',
    illustrationAlt: 'Hand-drawn oil lamp beside an open scroll',
    accessibleTranscription:
      'Psalm 119:105 (WEBP) — Your word is a lamp to my feet, and a light for my path.',
    scripture: {
      book: 'Psalms',
      reference: 'Psalm 119:105',
      translation: 'WEBP',
    },
    attribution: 'Alexis Waid / Bibleberry',
    rightsStatus: 'approved-ministry-use',
    shareEligible: true,
    theologicalThemes: ['Guidance', 'Light'],
    ...overrides,
  }
}

function makeAwardRecord(overrides: Partial<EarnedAwardRecord> = {}): EarnedAwardRecord {
  const awardId = parseCanonicalMonthlyAwardId('card:monthly:2026-11:light-path')!
  return {
    awardId,
    kind: 'thematic',
    publicationYearMonth: parsePublicationYearMonth('2026-11')!,
    discoveryId: 'discovery:2026-11:light-path',
    earnedOn: parseLocalCalendarDate('2026-11-09')!,
    hubAnnouncementAcked: false,
    cardViewed: false,
    cardDocumentId: 'card-2026-11-light-path',
    earnedCard: makeCardSnapshot(),
    ...overrides,
  }
}

function makeMemoryDriver(initial: Record<string, string> = {}): {
  driver: KeyValueStorageDriver
  backing: Map<string, string>
} {
  const backing = new Map<string, string>(Object.entries(initial))
  const driver: KeyValueStorageDriver = {
    getItem: key => backing.get(key) ?? null,
    setItem: (key, value) => {
      backing.set(key, value)
    },
    removeItem: key => {
      backing.delete(key)
    },
  }
  return { driver, backing }
}

test('hubCardAnnouncementModel restricts presentations strictly to Hub arrival and ignores non-Hub surfaces', () => {
  const award = makeAwardRecord()
  const data: ReaderParticipationData = {
    ...emptyReaderParticipationData(),
    earnedAwards: {
      [award.awardId]: award,
    },
  }

  let state = createInitialHubAnnouncementState(false)

  // Non-Hub surfaces never open announcements
  for (const nonHubSurface of ['month', 'shelf', 'library', 'challenge', 'other'] satisfies HubSurface[]) {
    state = setActiveSurfaceState(state, nonHubSurface)
    state = evaluateHubAnnouncementState(state, {
      participationReady: true,
      participationData: data,
      preferencesReady: true,
      announcementsEnabled: true,
    })
    assert.equal(state.isHubActive, false)
    assert.equal(state.openBatch, null)
  }

  // Waiting on hydration at Hub does not lose the arrival
  state = arriveAtHubState(state)
  assert.equal(state.isHubActive, true)
  state = evaluateHubAnnouncementState(state, {
    participationReady: false,
    participationData: emptyReaderParticipationData(),
    preferencesReady: true,
    announcementsEnabled: true,
  })
  assert.equal(state.openBatch, null)

  // Once both participation & preferences hydrate, single pending award opens
  state = evaluateHubAnnouncementState(state, {
    participationReady: true,
    participationData: data,
    preferencesReady: true,
    announcementsEnabled: true,
  })
  assert.equal(state.openBatch?.length, 1)
  assert.equal(state.openBatch?.[0].awardId, award.awardId)
  assert.equal(state.openBatch?.[0].title, 'Lamp to My Feet')

  // Repeated arriveAtHub or evaluate calls while on Hub are Object.is no-ops
  const arrivedAgain = arriveAtHubState(state)
  assert.equal(Object.is(arrivedAgain, state), true)
  const evaluatedAgain = evaluateHubAnnouncementState(state, {
    participationReady: true,
    participationData: data,
    preferencesReady: true,
    announcementsEnabled: true,
  })
  assert.equal(Object.is(evaluatedAgain, state), true)
})

test('combines multiple pending awards into one frozen batch and preserves later-arriving awards for next Hub arrival', () => {
  const award1 = makeAwardRecord({
    awardId: parseCanonicalMonthlyAwardId('card:monthly:2026-11:light-path')!,
    discoveryId: 'discovery:2026-11:light-path',
    earnedOn: parseLocalCalendarDate('2026-11-08')!,
  })
  const award2 = makeAwardRecord({
    awardId: parseCanonicalMonthlyAwardId('card:monthly:2026-11:bread-of-life')!,
    discoveryId: 'discovery:2026-11:bread-of-life',
    earnedOn: parseLocalCalendarDate('2026-11-09')!,
    cardDocumentId: 'card-2026-11-bread-of-life',
    earnedCard: makeCardSnapshot({
      cardDocumentId: 'card-2026-11-bread-of-life',
      title: 'The Bread of Life',
      imageUrl: 'https://cdn.sanity.io/images/80016lrq/staging/card-bread.png',
      scripture: { book: 'John', reference: 'John 6:35', translation: 'WEBP' },
    }),
  })
  const award3 = makeAwardRecord({
    awardId: parseCanonicalMonthlyAwardId('card:monthly:2026-11:full-month')!,
    kind: 'fullMonth',
    discoveryId: 'discovery:2026-11:full-month',
    earnedOn: parseLocalCalendarDate('2026-11-30')!,
    cardDocumentId: undefined,
    earnedCard: undefined,
  })

  let data: ReaderParticipationData = {
    ...emptyReaderParticipationData(),
    earnedAwards: {
      [award1.awardId]: award1,
      [award2.awardId]: award2,
    },
  }

  let state = arriveAtHubState(createInitialHubAnnouncementState(false))
  state = evaluateHubAnnouncementState(state, {
    participationReady: true,
    participationData: data,
    preferencesReady: true,
    announcementsEnabled: true,
  })

  // Single combined batch for award1 & award2
  assert.equal(state.openBatch?.length, 2)
  const copy = buildCombinedAnnouncementCopy(state.openBatch!)
  assert.equal(copy.heading, '2 New Scripture Cards Earned')
  assert.deepEqual(selectPresentedBatchAwardIds(state.openBatch), [award1.awardId, award2.awardId])

  // Award3 arrives while the announcement dialog is still open
  data = {
    ...data,
    earnedAwards: {
      ...data.earnedAwards,
      [award3.awardId]: award3,
    },
  }
  const stateWhileOpen = evaluateHubAnnouncementState(state, {
    participationReady: true,
    participationData: data,
    preferencesReady: true,
    announcementsEnabled: true,
  })
  // Frozen batch does NOT absorb award3
  assert.equal(Object.is(stateWhileOpen, state), true)
  assert.deepEqual(selectPresentedBatchAwardIds(stateWhileOpen.openBatch), [award1.awardId, award2.awardId])

  // Explicit dismissal acknowledges ONLY frozen batch IDs
  const batchIds = selectPresentedBatchAwardIds(stateWhileOpen.openBatch)
  data = reduceParticipationCommand(data, {
    type: 'acknowledgeAwardAnnouncements',
    awardIds: batchIds,
  })
  assert.equal(data.earnedAwards[award1.awardId].hubAnnouncementAcked, true)
  assert.equal(data.earnedAwards[award2.awardId].hubAnnouncementAcked, true)
  assert.equal(data.earnedAwards[award3.awardId].hubAnnouncementAcked, false)

  // Independence: dismissing does NOT mark cards viewed
  assert.equal(data.earnedAwards[award1.awardId].cardViewed, false)
  assert.equal(data.earnedAwards[award2.awardId].cardViewed, false)

  state = completeAcknowledgeBatchState(beginAcknowledgeBatchState(stateWhileOpen))
  assert.equal(state.openBatch, null)

  // Same Hub visit does NOT chain a second popup for award3 immediately
  state = evaluateHubAnnouncementState(state, {
    participationReady: true,
    participationData: data,
    preferencesReady: true,
    announcementsEnabled: true,
  })
  assert.equal(state.openBatch, null)

  // Leaving Hub and returning to Hub presents award3 (even with incomplete snapshot)
  state = leaveHubState(state)
  state = arriveAtHubState(state)
  state = evaluateHubAnnouncementState(state, {
    participationReady: true,
    participationData: data,
    preferencesReady: true,
    announcementsEnabled: true,
  })
  assert.equal(state.openBatch?.length, 1)
  assert.equal(state.openBatch?.[0].awardId, award3.awardId)
  assert.equal(state.openBatch?.[0].hasCompleteCardSnapshot, false)
  assert.equal(state.openBatch?.[0].title, 'Full-Month Scripture Card')
  assert.equal(state.openBatch?.[0].imageUrl, undefined)
})

test('leaving Hub before dismissing preserves pending status and all four cardViewed/hubAnnouncementAcked combinations stay independent', () => {
  const unviewedPending = makeAwardRecord({
    awardId: parseCanonicalMonthlyAwardId('card:monthly:2026-11:a-unviewed-pending')!,
    discoveryId: 'discovery:2026-11:a-unviewed-pending',
    cardViewed: false,
    hubAnnouncementAcked: false,
  })
  const viewedPending = makeAwardRecord({
    awardId: parseCanonicalMonthlyAwardId('card:monthly:2026-11:b-viewed-pending')!,
    discoveryId: 'discovery:2026-11:b-viewed-pending',
    cardViewed: true,
    hubAnnouncementAcked: false,
  })
  const unviewedAcked = makeAwardRecord({
    awardId: parseCanonicalMonthlyAwardId('card:monthly:2026-11:c-unviewed-acked')!,
    discoveryId: 'discovery:2026-11:c-unviewed-acked',
    cardViewed: false,
    hubAnnouncementAcked: true,
  })
  const viewedAcked = makeAwardRecord({
    awardId: parseCanonicalMonthlyAwardId('card:monthly:2026-11:d-viewed-acked')!,
    discoveryId: 'discovery:2026-11:d-viewed-acked',
    cardViewed: true,
    hubAnnouncementAcked: true,
  })

  const data: ReaderParticipationData = {
    ...emptyReaderParticipationData(),
    earnedAwards: {
      [unviewedPending.awardId]: unviewedPending,
      [viewedPending.awardId]: viewedPending,
      [unviewedAcked.awardId]: unviewedAcked,
      [viewedAcked.awardId]: viewedAcked,
    },
  }

  let state = arriveAtHubState(createInitialHubAnnouncementState(false))
  state = evaluateHubAnnouncementState(state, {
    participationReady: true,
    participationData: data,
    preferencesReady: true,
    announcementsEnabled: true,
  })

  // Both unacked awards (whether cardViewed is true or false) are presented
  assert.deepEqual(
    selectPresentedBatchAwardIds(state.openBatch),
    [unviewedPending.awardId, viewedPending.awardId],
  )

  // Leaving Hub without explicit dismissal closes dialog without acknowledging
  state = leaveHubState(state)
  assert.equal(state.openBatch, null)
  assert.equal(selectPendingHubAnnouncementAwards(data).length, 2)

  // Returning to Hub surfaces them again
  state = arriveAtHubState(state)
  state = evaluateHubAnnouncementState(state, {
    participationReady: true,
    participationData: data,
    preferencesReady: true,
    announcementsEnabled: true,
  })
  assert.deepEqual(
    selectPresentedBatchAwardIds(state.openBatch),
    [unviewedPending.awardId, viewedPending.awardId],
  )

  // Failed ack write can be retried or closed safely
  state = beginAcknowledgeBatchState(state)
  state = failAcknowledgeBatchState(state, 'Write failed')
  assert.equal(state.ackStatus, 'failed')
  assert.equal(state.openBatch?.length, 2)
  state = dismissFailedAcknowledgeBatchState(state)
  assert.equal(state.openBatch, null)
  assert.equal(state.ackStatus, 'idle')
})

test('degrades safely on invalid/cross-month/mismatched Card snapshots without fabricating art', () => {
  const mismatchedDocAward = makeAwardRecord({
    cardDocumentId: 'card-2026-11-other',
    earnedCard: makeCardSnapshot({ cardDocumentId: 'card-2026-11-light-path' }),
  })
  const mismatchedResult = buildPresentedEarnedAwardItem(mismatchedDocAward)
  assert.equal(mismatchedResult.hasCompleteCardSnapshot, false)
  assert.equal(mismatchedResult.imageUrl, undefined)
  assert.equal(mismatchedResult.title, 'Thematic Scripture Card')
  assert.equal(mismatchedResult.monthHeading, 'November 2026')
  assert.equal(mismatchedResult.earnedDateLabel, 'November 9, 2026')

  const badUrlAward = makeAwardRecord({
    earnedCard: makeCardSnapshot({ imageUrl: 'https://evil.example/card.png' }),
  })
  const badUrlResult = buildPresentedEarnedAwardItem(badUrlAward)
  assert.equal(badUrlResult.hasCompleteCardSnapshot, false)
  assert.equal(badUrlResult.imageUrl, undefined)
})

test('AnnouncementPreferencesStore persists across async drivers, resists corrupt/newer schemas, and supports opt-out catch-up', async () => {
  assert.deepEqual(parseCardAnnouncementPreferencesEnvelope(null), {
    data: { earnedCardAnnouncementsEnabled: true },
    health: 'ok',
  })
  assert.equal(
    parseCardAnnouncementPreferencesEnvelope('{"schemaVersion":2,"earnedCardAnnouncementsEnabled":false}').health,
    'unsupportedNewerSchema',
  )
  assert.equal(
    parseCardAnnouncementPreferencesEnvelope('{not json').health,
    'corruptStoredData',
  )

  const backing = new Map<string, string>()
  const asyncDriver: KeyValueStorageDriver = {
    getItem: async key => {
      await Promise.resolve()
      return backing.get(key) ?? null
    },
    setItem: async (key, value) => {
      await Promise.resolve()
      backing.set(key, value)
    },
    removeItem: async key => {
      await Promise.resolve()
      backing.delete(key)
    },
  }

  const prefsStore = createAnnouncementPreferencesStore(asyncDriver)
  assert.equal(prefsStore.getSnapshot().status, 'hydrating')
  await prefsStore.whenReady()
  assert.equal(prefsStore.getSnapshot().status, 'ready')
  assert.equal(prefsStore.getSnapshot().data.earnedCardAnnouncementsEnabled, true)

  await prefsStore.setAnnouncementsEnabled(false)
  assert.equal(prefsStore.getSnapshot().data.earnedCardAnnouncementsEnabled, false)
  assert.equal(
    backing.get(CARD_ANNOUNCEMENT_PREFS_STORAGE_KEY),
    serializeCardAnnouncementPreferencesEnvelope({ earnedCardAnnouncementsEnabled: false }),
  )

  // Reload in a fresh store instance
  const reloadedPrefsStore = createAnnouncementPreferencesStore(asyncDriver)
  await reloadedPrefsStore.whenReady()
  assert.equal(reloadedPrefsStore.getSnapshot().data.earnedCardAnnouncementsEnabled, false)

  // Participation store earns awards while opted out
  const { driver: partDriver } = makeMemoryDriver()
  const partStore = createReaderParticipationStore(
    createEnvelopePersistenceAdapter({
      storageKey: 'test-part-optout',
      driver: partDriver,
    }),
  )
  await partStore.whenReady()

  const award1 = parseCanonicalMonthlyAwardId('card:monthly:2026-11:light-path')!
  const award2 = parseCanonicalMonthlyAwardId('card:monthly:2026-11:full-month')!
  await partStore.dispatch(
    createRecordEarnedAwardsCommand([
      {
        awardId: award1,
        discoveryId: 'discovery:2026-11:light-path',
        earnedOn: parseLocalCalendarDate('2026-11-09')!,
        earnedCard: validateEarnedCardSnapshot(makeCardSnapshot(), '2026-11')!,
      },
      {
        awardId: award2,
        discoveryId: 'discovery:2026-11:full-month',
        earnedOn: parseLocalCalendarDate('2026-11-30')!,
      },
    ]),
  )

  // Hub arrival while opted out suppresses presentation and preserves pending status
  let state = arriveAtHubState(createInitialHubAnnouncementState(false))
  state = evaluateHubAnnouncementState(state, {
    participationReady: true,
    participationData: partStore.getSnapshot().data,
    preferencesReady: true,
    announcementsEnabled: reloadedPrefsStore.getSnapshot().data.earnedCardAnnouncementsEnabled,
  })
  assert.equal(state.openBatch, null)
  assert.equal(selectPendingHubAnnouncementAwards(partStore.getSnapshot().data).length, 2)

  // Re-enabling while still on the same visit/non-Hub waits for the next Hub arrival
  await reloadedPrefsStore.setAnnouncementsEnabled(true)
  state = evaluateHubAnnouncementState(state, {
    participationReady: true,
    participationData: partStore.getSnapshot().data,
    preferencesReady: true,
    announcementsEnabled: reloadedPrefsStore.getSnapshot().data.earnedCardAnnouncementsEnabled,
  })
  assert.equal(state.openBatch, null)

  // Next Hub arrival surfaces one combined catch-up announcement with all pending awards
  state = leaveHubState(state)
  state = arriveAtHubState(state)
  state = evaluateHubAnnouncementState(state, {
    participationReady: true,
    participationData: partStore.getSnapshot().data,
    preferencesReady: true,
    announcementsEnabled: reloadedPrefsStore.getSnapshot().data.earnedCardAnnouncementsEnabled,
  })
  assert.equal(state.openBatch?.length, 2)

  // Newer schema on disk is never clobbered
  backing.set(
    CARD_ANNOUNCEMENT_PREFS_STORAGE_KEY,
    JSON.stringify({ schemaVersion: 99, earnedCardAnnouncementsEnabled: false }),
  )
  const newerStore = createAnnouncementPreferencesStore(asyncDriver)
  await newerStore.whenReady()
  assert.equal(newerStore.getSnapshot().health, 'unsupportedNewerSchema')
  await newerStore.setAnnouncementsEnabled(false)
  assert.match(backing.get(CARD_ANNOUNCEMENT_PREFS_STORAGE_KEY)!, /"schemaVersion":99/)

  prefsStore.dispose()
  reloadedPrefsStore.dispose()
  newerStore.dispose()
  partStore.dispose()
})

test('HubCardAnnouncementDialog and HubCardAnnouncementBoundary enforce dead-Notebook suppression and accessibility contracts', () => {
  const dialogSource = readFileSync(
    resolve(repositoryRoot, 'src/components/announcements/HubCardAnnouncementDialog.tsx'),
    'utf8',
  )
  const boundarySource = readFileSync(
    resolve(repositoryRoot, 'src/components/announcements/HubCardAnnouncementBoundary.tsx'),
    'utf8',
  )

  // Verify accessible dialog & switch roles and conditional Field Notebook rendering
  assert.match(dialogSource, /role="dialog"/)
  assert.match(dialogSource, /aria-modal="true"/)
  assert.match(dialogSource, /aria-labelledby=\{titleId\}/)
  assert.match(dialogSource, /aria-describedby=\{descId\}/)
  assert.match(dialogSource, /\{onOpenFieldNotebook && !isFailed && \(/)
  assert.match(boundarySource, /role="switch"/)
  assert.match(boundarySource, /aria-checked=\{enabled\}/)

  const itemWithArt = buildPresentedEarnedAwardItem(makeAwardRecord())
  const itemWithoutArt = buildPresentedEarnedAwardItem(
    makeAwardRecord({
      awardId: parseCanonicalMonthlyAwardId('card:monthly:2026-11:full-month')!,
      kind: 'fullMonth',
      discoveryId: 'discovery:2026-11:full-month',
      cardDocumentId: undefined,
      earnedCard: undefined,
    }),
  )
  assert.equal(itemWithArt.hasCompleteCardSnapshot, true)
  assert.equal(itemWithoutArt.hasCompleteCardSnapshot, false)
  assert.equal(itemWithoutArt.imageUrl, undefined)
})

test('announcements module enforces storage, network, cardViewed, and ministry News isolation boundaries', () => {
  const announcementsDir = resolve(repositoryRoot, 'src/components/announcements')
  const files = readdirSync(announcementsDir).filter(
    name => name.endsWith('.ts') || name.endsWith('.tsx'),
  )
  assert.ok(files.length >= 4)

  const platformNeutralFiles = new Set([
    'hubCardAnnouncementModel.ts',
    'announcementPreferencesStorage.ts',
  ])
  const forbiddenPlatformGlobals = new Set([
    'window',
    'document',
    'localStorage',
    'sessionStorage',
    'indexedDB',
  ])

  for (const name of files) {
    const absPath = resolve(announcementsDir, name)
    const raw = readFileSync(absPath, 'utf8')
    const sf = ts.createSourceFile(
      absPath,
      raw,
      ts.ScriptTarget.Latest,
      true,
      name.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )
    const executable = ts.createPrinter({ removeComments: true }).printFile(sf)

    assert.doesNotMatch(executable, /\bfetch\s*\(/, `${name} must not call fetch`)
    assert.doesNotMatch(executable, /markEarnedCardViewed/, `${name} must never mark cards viewed`)
    assert.doesNotMatch(
      executable,
      /bibleberry-reader-participation-v1/,
      `${name} must not bypass ReaderParticipationStore`,
    )
    assert.doesNotMatch(
      executable,
      /MonthPreviewNewsBanner|data\/announcements/,
      `${name} must stay separate from ministry News announcements`,
    )

    if (platformNeutralFiles.has(name)) {
      function inspect(node: ts.Node) {
        if (ts.isIdentifier(node) && forbiddenPlatformGlobals.has(node.text)) {
          assert.fail(
            `${relative(repositoryRoot, absPath)} must remain platform-neutral (found "${node.text}")`,
          )
        }
        ts.forEachChild(node, inspect)
      }
      inspect(sf)
    }
  }
})
