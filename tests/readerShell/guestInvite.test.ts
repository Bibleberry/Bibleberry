import assert from 'node:assert/strict'
import test from 'node:test'
import { emptyReaderParticipationData } from '../../src/participation/model.ts'
import type { KeyValueStorageDriver } from '../../src/participation/persistence.ts'
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

function createMemoryDriver(options: { failWrites?: boolean } = {}): KeyValueStorageDriver {
  const map = new Map<string, string>()
  return {
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => {
      if (options.failWrites) throw new Error('disk full')
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
      participationData: makeParticipation(ids),
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
    participationData: makeParticipation(['c1', 'c2', 'c3']),
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
    participationData: withExtras,
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
    participationData: threeFinishes,
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
    participationData: threeFinishes,
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
    participationData: threeFinishes,
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
    participationData: threeFinishes,
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
