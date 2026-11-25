import assert from 'node:assert/strict'
import test from 'node:test'
import { emptyReaderParticipationData } from '../../src/participation/model.ts'
import { createEnvelopePersistenceAdapter, type KeyValueStorageDriver } from '../../src/participation/persistence.ts'
import { createReaderParticipationStore } from '../../src/participation/store.ts'
import type {
  CanonicalAwardId,
  CanonicalChallengeId,
  LocalCalendarDate,
  PublicationYearMonth,
  ReaderParticipationData,
} from '../../src/participation/types.ts'
import { createDefaultReaderProfile } from '../../src/readerProfile/model.ts'
import { createReaderProfileStore } from '../../src/readerProfile/store.ts'
import {
  GUEST_INVITE_FINISH_THRESHOLD,
  countDistinctCompletedChallenges,
  deriveGuestInviteEligibility,
  hasPendingEnabledCardAnnouncement,
} from '../../src/readerShell/today/guestInviteModel.ts'

function challengeId(id: string): CanonicalChallengeId {
  return `cms:${id}` as CanonicalChallengeId
}

function localDate(value: string): LocalCalendarDate {
  return value as LocalCalendarDate
}

function makeParticipation(completedIds: readonly string[]): ReaderParticipationData {
  const base = emptyReaderParticipationData()
  return {
    ...base,
    completedChallenges: Object.fromEntries(
      completedIds.map((id, index) => [
        challengeId(id),
        { completedOn: localDate(`2026-11-${String(index + 1).padStart(2, '0')}`) },
      ]),
    ),
  }
}

function createMemoryDriver(options: { failWrites?: boolean } = {}): KeyValueStorageDriver & { setFailWrites: (fail: boolean) => void } {
  const map = new Map<string, string>()
  let failWrites = options.failWrites ?? false
  return {
    setFailWrites: (fail: boolean) => {
      failWrites = fail
    },
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => {
      if (failWrites) throw new Error('disk full')
      map.set(key, value)
    },
    removeItem: key => {
      map.delete(key)
    },
  }
}

test('Arctic Sextant — guest invitation eligibility threshold & deduplication', () => {
  assert.equal(GUEST_INVITE_FINISH_THRESHOLD, 3)

  const profile = createDefaultReaderProfile()

  for (const ids of [[], ['c1'], ['c1', 'c2']]) {
    const result = deriveGuestInviteEligibility({
      participationStatus: 'ready',
      participationHealth: 'ok',
      committedParticipationData: makeParticipation(ids),
      profileStatus: 'ready',
      profileHealth: 'ok',
      profile,
      hasPendingCardAnnouncement: false,
    })
    assert.equal(result.eligible, false)
    assert.equal(result.distinctCompletedCount, ids.length)
    assert.equal(result.reason, 'belowThreshold')
  }

  const eligibleAtThree = deriveGuestInviteEligibility({
    participationStatus: 'ready',
    participationHealth: 'ok',
    committedParticipationData: makeParticipation(['c1', 'c2', 'c3']),
    profileStatus: 'ready',
    profileHealth: 'ok',
    profile,
    hasPendingCardAnnouncement: false,
  })
  assert.deepEqual(eligibleAtThree, {
    eligible: true,
    distinctCompletedCount: 3,
    reason: 'eligible',
  })
})

test('Arctic Sextant — unrelated awards, in-progress, and malformed records do not count toward 3 Finishes', () => {
  const base = makeParticipation(['c1', 'c2'])
  const withExtras: ReaderParticipationData = {
    ...base,
    inProgressChallenges: {
      [challengeId('c3')]: { updatedOn: localDate('2026-11-10') },
      [challengeId('c4')]: { updatedOn: localDate('2026-11-11') },
    },
    savedChallenges: {
      [challengeId('c5')]: { savedOn: localDate('2026-11-12') },
    },
    earnedAwards: {
      ['card:monthly:2026-11:hope' as CanonicalAwardId]: {
        awardId: 'card:monthly:2026-11:hope' as CanonicalAwardId,
        kind: 'thematic',
        publicationYearMonth: '2026-11' as PublicationYearMonth,
        discoveryId: 'discovery:2026-11:hope',
        earnedOn: localDate('2026-11-12'),
        hubAnnouncementAcked: true,
        cardViewed: false,
      },
    },
    completedChallenges: {
      ...base.completedChallenges,
      // Malformed non-canonical key and empty completedOn must be ignored.
      'not-canonical': { completedOn: localDate('2026-11-05') },
      [challengeId('bad')]: { completedOn: '' as LocalCalendarDate },
    },
  }

  assert.equal(countDistinctCompletedChallenges(withExtras), 2)
  const result = deriveGuestInviteEligibility({
    participationStatus: 'ready',
    participationHealth: 'ok',
    committedParticipationData: withExtras,
    profileStatus: 'ready',
    profileHealth: 'ok',
    profile: createDefaultReaderProfile(),
    hasPendingCardAnnouncement: false,
  })
  assert.equal(result.eligible, false)
  assert.equal(result.distinctCompletedCount, 2)
  assert.equal(result.reason, 'belowThreshold')
})

test('Arctic Sextant — Card announcement precedence, dismissal, and corrupt/loading states', () => {
  const threeFinishes = makeParticipation(['c1', 'c2', 'c3'])
  const defaultProfile = createDefaultReaderProfile()

  const blockedByAnnouncement = deriveGuestInviteEligibility({
    participationStatus: 'ready',
    participationHealth: 'ok',
    committedParticipationData: threeFinishes,
    profileStatus: 'ready',
    profileHealth: 'ok',
    profile: defaultProfile,
    hasPendingCardAnnouncement: true,
  })
  assert.equal(blockedByAnnouncement.eligible, false)
  assert.equal(blockedByAnnouncement.reason, 'pendingAnnouncement')

  const suppressedByDismissal = deriveGuestInviteEligibility({
    participationStatus: 'ready',
    participationHealth: 'ok',
    committedParticipationData: threeFinishes,
    profileStatus: 'ready',
    profileHealth: 'ok',
    profile: { ...defaultProfile, guestInviteDismissed: true },
    hasPendingCardAnnouncement: false,
  })
  assert.equal(suppressedByDismissal.eligible, false)
  assert.equal(suppressedByDismissal.reason, 'dismissed')

  const corruptParticipation = deriveGuestInviteEligibility({
    participationStatus: 'ready',
    participationHealth: 'corrupt',
    committedParticipationData: threeFinishes,
    profileStatus: 'ready',
    profileHealth: 'ok',
    profile: defaultProfile,
    hasPendingCardAnnouncement: false,
  })
  assert.equal(corruptParticipation.eligible, false)
  assert.equal(corruptParticipation.reason, 'participationUnavailable')

  const corruptProfile = deriveGuestInviteEligibility({
    participationStatus: 'ready',
    participationHealth: 'ok',
    committedParticipationData: threeFinishes,
    profileStatus: 'ready',
    profileHealth: 'corrupt',
    profile: defaultProfile,
    hasPendingCardAnnouncement: false,
  })
  assert.equal(corruptProfile.eligible, false)
  assert.equal(corruptProfile.reason, 'profileUnavailable')
})

test('Arctic Sextant — permanent dismissal persists across reloads and fails honestly on write error', async () => {
  const driver = createMemoryDriver()
  const store1 = createReaderProfileStore({ driver, legacyDriver: null })
  const loaded1 = await store1.load()
  assert.equal(loaded1.profile.guestInviteDismissed, false)

  const dismissed = await store1.dismissGuestInvite()
  assert.equal(dismissed.ok, true)
  if (dismissed.ok) assert.equal(dismissed.profile.guestInviteDismissed, true)

  // Reload from a new store instance backed by the same durable driver.
  const store2 = createReaderProfileStore({ driver, legacyDriver: null })
  const loaded2 = await store2.load()
  assert.equal(loaded2.health, 'ok')
  assert.equal(loaded2.profile.guestInviteDismissed, true)

  // Write failure must return ok: false and keep guestInviteDismissed: false.
  const failingStore = createReaderProfileStore({
    driver: createMemoryDriver({ failWrites: true }),
    legacyDriver: null,
  })
  const loadedFailing = await failingStore.load()
  assert.equal(loadedFailing.profile.guestInviteDismissed, false)
  const failedDismiss = await failingStore.dismissGuestInvite()
  assert.equal(failedDismiss.ok, false)
  assert.equal(failedDismiss.profile.guestInviteDismissed, false)
})

test('Arctic Sextant — synchronous pending announcement gate blocks pre-effect render and failed ack without suppressing opt-out', () => {
  const unackedData: ReaderParticipationData = {
    ...makeParticipation(['c1', 'c2', 'c3']),
    earnedAwards: {
      ['card:monthly:2026-11:hope' as CanonicalAwardId]: {
        awardId: 'card:monthly:2026-11:hope' as CanonicalAwardId,
        kind: 'thematic',
        publicationYearMonth: '2026-11' as PublicationYearMonth,
        discoveryId: 'discovery:2026-11:hope',
        earnedOn: localDate('2026-11-12'),
        hubAnnouncementAcked: false,
        cardViewed: false,
      },
    },
  }

  // Even when isOpen is still false (first render before passive effect, or after Close for Now on failed ack),
  // an enabled unacked committed award blocks the guest invitation.
  assert.equal(
    hasPendingEnabledCardAnnouncement({
      participationReady: true,
      preferencesReady: true,
      isOpen: false,
      announcementsEnabled: true,
      committedParticipationData: unackedData,
    }),
    true,
  )

  // When announcements are intentionally opted out and no batch is open, guest invite is NOT suppressed.
  assert.equal(
    hasPendingEnabledCardAnnouncement({
      participationReady: true,
      preferencesReady: true,
      isOpen: false,
      announcementsEnabled: false,
      committedParticipationData: unackedData,
    }),
    false,
  )

  // Once acknowledged, guest invite is unblocked.
  const ackedData: ReaderParticipationData = {
    ...unackedData,
    earnedAwards: {
      ['card:monthly:2026-11:hope' as CanonicalAwardId]: {
        ...unackedData.earnedAwards['card:monthly:2026-11:hope' as CanonicalAwardId]!,
        hubAnnouncementAcked: true,
      },
    },
  }
  assert.equal(
    hasPendingEnabledCardAnnouncement({
      participationReady: true,
      preferencesReady: true,
      isOpen: false,
      announcementsEnabled: true,
      committedParticipationData: ackedData,
    }),
    false,
  )
})

test('Arctic Sextant — pending/failed third Finish does not satisfy eligibility until durably committed', async () => {
  const driver = createMemoryDriver()
  let writeGate = Promise.resolve()
  const adapter = createEnvelopePersistenceAdapter({
    storageKey: 'test-participation-key',
    driver: {
      ...driver,
      async setItem(key, value) {
        await writeGate
        await driver.setItem(key, value)
      },
    },
    allowedNamespace: 'cms',
  })
  const store = createReaderParticipationStore(adapter, { allowedNamespace: 'cms' })
  await store.whenReady()
  await store.dispatch({
    type: 'completeChallenge',
    challengeId: challengeId('c1'),
    completedOn: localDate('2026-11-10'),
  })
  await store.dispatch({
    type: 'completeChallenge',
    challengeId: challengeId('c2'),
    completedOn: localDate('2026-11-11'),
  })

  // Fail writes for the 3rd Finish: optimistic `data` has 3, but `committedData` still has 2.
  let releaseWrite!: () => void
  writeGate = new Promise<void>(resolve => { releaseWrite = resolve })
  driver.setFailWrites(true)
  const thirdFinish = store.dispatch({
    type: 'completeChallenge',
    challengeId: challengeId('c3'),
    completedOn: localDate('2026-11-12'),
  })

  const saving = store.getSnapshot()
  assert.equal(saving.health, 'ok')
  assert.equal(saving.hasPendingWrites, true)
  assert.equal(countDistinctCompletedChallenges(saving.data), 3)
  assert.equal(countDistinctCompletedChallenges(saving.committedData), 2)
  releaseWrite()
  await thirdFinish

  const pendingSnap = store.getSnapshot()
  assert.equal(pendingSnap.hasPendingWrites, true)
  assert.equal(pendingSnap.health, 'writeFailed')
  assert.equal(countDistinctCompletedChallenges(pendingSnap.data), 3)
  assert.equal(countDistinctCompletedChallenges(pendingSnap.committedData), 2)

  const profile = createDefaultReaderProfile()
  const beforeCommit = deriveGuestInviteEligibility({
    participationStatus: pendingSnap.status,
    participationHealth: pendingSnap.health,
    committedParticipationData: pendingSnap.committedData,
    profileStatus: 'ready',
    profileHealth: 'ok',
    profile,
    hasPendingCardAnnouncement: false,
  })
  assert.equal(beforeCommit.eligible, false)
  assert.equal(beforeCommit.distinctCompletedCount, 2)
  assert.equal(beforeCommit.reason, 'belowThreshold')

  // Recover storage and flush pending write -> committedData reaches 3 -> eligible.
  driver.setFailWrites(false)
  await store.flushPending()
  const committedSnap = store.getSnapshot()
  assert.equal(committedSnap.hasPendingWrites, false)
  assert.equal(committedSnap.health, 'ok')
  assert.equal(countDistinctCompletedChallenges(committedSnap.committedData), 3)

  const afterCommit = deriveGuestInviteEligibility({
    participationStatus: committedSnap.status,
    participationHealth: committedSnap.health,
    committedParticipationData: committedSnap.committedData,
    profileStatus: 'ready',
    profileHealth: 'ok',
    profile,
    hasPendingCardAnnouncement: false,
  })
  assert.equal(afterCommit.eligible, true)
  assert.equal(afterCommit.distinctCompletedCount, 3)
})
