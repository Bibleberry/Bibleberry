import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  canSafelyClearGuestStorage,
  computeGuestPayloadFingerprint,
  createEmptyAccountEnvelope,
  emptyProposedAccountData,
  parseAccountId,
  reconcileGuestIntoAccount,
} from '../../src/accountSync/reconcile.ts'
import type {
  CommitAckReceipt,
  EarnedScriptureCardSnapshot,
  GuestParticipationEnvelopeV1,
  GuestParticipationEnvelopeV2,
  LocalCalendarDate,
  ProposedAccountParticipationEnvelope,
} from '../../src/accountSync/types.ts'
import {
  parseCanonicalMonthlyAwardId,
  parseLocalCalendarDate,
  parsePublicationYearMonth,
  parseStoredChallengeId,
} from '../../src/participation/identity.ts'

const ACCT_A = '550e8400-e29b-41d4-a716-446655440000'
const ACCT_B = '660e8400-e29b-41d4-a716-446655440111'

const c1 = parseStoredChallengeId('cms:berrymark-challenge-2026-11-01-true-vine')!
const c2 = parseStoredChallengeId('cms:berrymark-challenge-2026-11-02-rejoice-always')!
const c3 = parseStoredChallengeId('cms:berrymark-challenge-2026-11-03-pray-continually')!
const cOld = parseStoredChallengeId('cms:berrymark-challenge-legacy-day-1')!

const dOct15 = parseLocalCalendarDate('2026-10-15')!
const dNov01 = parseLocalCalendarDate('2026-11-01')!
const dNov05 = parseLocalCalendarDate('2026-11-05')!
const dNov08 = parseLocalCalendarDate('2026-11-08')!
const dNov10 = parseLocalCalendarDate('2026-11-10')!
const dNov11 = parseLocalCalendarDate('2026-11-11')!

const ym202607 = parsePublicationYearMonth('2026-07')!
const ym202608 = parsePublicationYearMonth('2026-08')!
const ym202609 = parsePublicationYearMonth('2026-09')!
const ym202610 = parsePublicationYearMonth('2026-10')!
const ym202611 = parsePublicationYearMonth('2026-11')!

const awardThematic = parseCanonicalMonthlyAwardId('card:monthly:2026-11:table-fellowship')!
const awardFullMonth = parseCanonicalMonthlyAwardId('card:monthly:2026-11:full-month')!
const awardJuly = parseCanonicalMonthlyAwardId('card:monthly:2026-07:shepherd-psalm')!

function makeValidCardSnapshot(
  overrides: Partial<EarnedScriptureCardSnapshot> = {},
): EarnedScriptureCardSnapshot {
  return {
    cardDocumentId: 'card-2026-11-table-fellowship',
    title: 'At Table with the Lord',
    publicationYearMonth: ym202611,
    imageUrl: 'https://cdn.sanity.io/images/80016lrq/staging/table-fellowship.png',
    assetRevision: 'v1',
    illustrationAlt: 'Watercolor loaves and olive cup from field notebook',
    accessibleTranscription:
      'Luke 24:30-31 (WEBP) — When he had sat down at the table with them, he took the bread and gave thanks.',
    scripture: {
      book: 'Luke',
      reference: 'Luke 24:30-31',
      translation: 'WEBP',
    },
    attribution: 'Alexis Waid / Bibleberry',
    rightsStatus: 'approved-ministry-use',
    shareEligible: true,
    theologicalThemes: ['Hospitality'],
    keywords: ['luke', 'table'],
    ...overrides,
  }
}

function makeEmptyGuestV2(): GuestParticipationEnvelopeV2 {
  return {
    schemaVersion: 2,
    data: {
      completedChallenges: {},
      inProgressChallenges: {},
      savedChallenges: {},
      savedScriptures: [],
      lastOpenedChallenge: null,
      earnedAwards: {},
    },
  }
}

test('new-account transfer moves V2 guest accomplishments, awards, flags, and Shelf into a fresh account without resetting state', () => {
  const card = makeValidCardSnapshot()
  const guestEnvelope: GuestParticipationEnvelopeV2 = {
    schemaVersion: 2,
    data: {
      completedChallenges: {
        [c1]: { completedOn: dNov05 },
      },
      inProgressChallenges: {
        [c2]: { screenId: 'screen-4', updatedOn: dNov10 },
      },
      savedChallenges: {
        [c1]: { savedOn: dNov05 },
      },
      savedScriptures: [
        {
          key: 'luke 24:30-31|webp' as never,
          reference: 'Luke 24:30–31',
          translation: 'WEBP',
          savedOn: dNov08,
          sourceChallengeId: c1,
        },
      ],
      lastOpenedChallenge: {
        challengeId: c2,
        openedOn: dNov10,
      },
      earnedAwards: {
        [awardThematic]: {
          awardId: awardThematic,
          kind: 'thematic',
          publicationYearMonth: ym202611,
          discoveryId: 'discovery:2026-11:table-fellowship',
          earnedOn: dNov08,
          hubAnnouncementAcked: false,
          cardViewed: true,
          cardDocumentId: card.cardDocumentId,
          earnedCard: card,
        },
      },
    },
  }

  const result = reconcileGuestIntoAccount({
    mode: 'newAccountTransfer',
    guest: {
      envelope: guestEnvelope,
      shelf: {
        months: [{ yearMonth: ym202610, admissionKind: 'readerSelected', admittedOn: dNov01 }],
        activeFocusMonth: ym202610,
      },
    },
    account: createEmptyAccountEnvelope({ accountId: ACCT_A }),
    context: {
      expectedAccountId: ACCT_A,
      expectedNamespace: 'cms',
      maxCredibleDateUtcPlus14: dNov11,
      idempotencyKey: 'tx-new-1',
    },
  })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.status, 'clean')
  assert.equal(result.changedFromAccount, true)
  assert.equal(result.guestClearanceEligible, true)
  assert.equal(result.mergedAccount.revision, 1)
  assert.equal(result.mergedAccount.data.completedChallenges[c1]?.completedOn, dNov05)
  assert.equal(result.mergedAccount.data.inProgressChallenges[c2]?.screenId, 'screen-4')
  assert.equal(result.mergedAccount.data.savedChallenges[c1]?.savedOn, dNov05)
  assert.equal(result.mergedAccount.data.savedScriptures.length, 1)
  assert.equal(result.mergedAccount.data.lastOpenedChallenge?.challengeId, c2)

  const mergedAward = result.mergedAccount.data.earnedAwards[awardThematic]
  assert.ok(mergedAward)
  assert.equal(mergedAward.earnedOn, dNov08)
  assert.equal(mergedAward.cardViewed, true)
  assert.equal(mergedAward.hubAnnouncementAcked, false)
  assert.equal(mergedAward.earnedCard?.cardDocumentId, card.cardDocumentId)
  assert.equal(result.mergedAccount.data.shelf?.months[0]?.yearMonth, ym202610)
})

test('new-account transfer also supports legacy V1 guest envelopes and rejects non-empty target accounts', () => {
  const legacyV1: GuestParticipationEnvelopeV1 = {
    schemaVersion: 1,
    data: {
      completedChallenges: { [c1]: { completedOn: dNov05 } },
      inProgressChallenges: {},
      savedChallenges: {},
      savedScriptures: [],
      lastOpenedChallenge: null,
    },
  }

  const okResult = reconcileGuestIntoAccount({
    mode: 'newAccountTransfer',
    guest: { envelope: legacyV1 },
    account: createEmptyAccountEnvelope({ accountId: ACCT_A }),
    context: { expectedAccountId: ACCT_A, maxCredibleDateUtcPlus14: dNov11 },
  })
  assert.equal(okResult.ok, true)
  if (!okResult.ok) return
  assert.equal(okResult.mergedAccount.data.completedChallenges[c1]?.completedOn, dNov05)
  assert.deepEqual(okResult.mergedAccount.data.earnedAwards, {})

  const nonEmptyAccount: ProposedAccountParticipationEnvelope = {
    schemaVersion: 1,
    accountId: ACCT_A,
    namespace: 'cms',
    revision: 2,
    data: {
      ...emptyProposedAccountData(),
      completedChallenges: {
        [c2]: { completedOn: dNov05, dateProvenance: 'serverVerified' },
      },
    },
  }
  const rejected = reconcileGuestIntoAccount({
    mode: 'newAccountTransfer',
    guest: { envelope: legacyV1 },
    account: nonEmptyAccount,
    context: { expectedAccountId: ACCT_A },
  })
  assert.equal(rejected.ok, false)
  if (rejected.ok) return
  assert.equal(rejected.reason, 'nonEmptyAccountForNewTransfer')
  assert.equal(rejected.guestClearanceEligible, false)
})

test('existing-account merge unions accomplishments, deduplicates aliases, and clears in-progress when completed on either side', () => {
  const account: ProposedAccountParticipationEnvelope = {
    schemaVersion: 1,
    accountId: ACCT_A,
    namespace: 'cms',
    revision: 4,
    data: {
      completedChallenges: {
        [c1]: { completedOn: dNov05, dateProvenance: 'serverVerified' },
      },
      inProgressChallenges: {
        [c2]: { screenId: 'screen-2', updatedOn: dNov08 },
      },
      savedChallenges: {
        [c1]: { savedOn: dNov08 },
      },
      savedScriptures: [],
      lastOpenedChallenge: { challengeId: c2, openedOn: dNov08 },
      earnedAwards: {},
    },
  }

  const guest: GuestParticipationEnvelopeV2 = {
    schemaVersion: 2,
    data: {
      completedChallenges: {
        [cOld]: { completedOn: dNov08 }, // aliases to c1; serverVerified dNov05 is earlier & preserved
        [c2]: { completedOn: dNov10 }, // completes c2 which was inProgress on account
        [c3]: { completedOn: dNov10 },
      },
      inProgressChallenges: {
        [c3]: { screenId: 'screen-1', updatedOn: dNov08 }, // superseded by guest's own completion of c3
      },
      savedChallenges: {
        [cOld]: { savedOn: dNov01 }, // earlier savedOn for aliased c1
      },
      savedScriptures: [],
      lastOpenedChallenge: { challengeId: c3, openedOn: dNov10 },
      earnedAwards: {},
    },
  }

  const result = reconcileGuestIntoAccount({
    mode: 'existingAccountMerge',
    guest: { envelope: guest },
    account,
    context: {
      expectedAccountId: ACCT_A,
      maxCredibleDateUtcPlus14: dNov11,
      challengeAliases: { [cOld]: c1 },
    },
  })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.status, 'clean')
  assert.equal(Object.keys(result.mergedAccount.data.completedChallenges).length, 3)
  assert.equal(result.mergedAccount.data.completedChallenges[c1]?.completedOn, dNov05)
  assert.equal(result.mergedAccount.data.completedChallenges[c2]?.completedOn, dNov10)
  assert.equal(result.mergedAccount.data.completedChallenges[c3]?.completedOn, dNov10)
  assert.deepEqual(result.mergedAccount.data.inProgressChallenges, {})
  assert.equal(result.mergedAccount.data.savedChallenges[c1]?.savedOn, dNov01)
  assert.equal(result.mergedAccount.data.lastOpenedChallenge?.challengeId, c3)
  assert.equal(result.appliedAliases[cOld], c1)
})

test('overlapping Saved Scripture deduplicates by normalized key, keeps earliest savedOn, preserves sourceChallengeId, and orders deterministically', () => {
  const account: ProposedAccountParticipationEnvelope = {
    schemaVersion: 1,
    accountId: ACCT_A,
    namespace: 'cms',
    revision: 1,
    data: {
      ...emptyProposedAccountData(),
      savedScriptures: [
        {
          key: 'romans 8:1|webp' as never,
          reference: 'Romans 8:1',
          translation: 'WEBP',
          savedOn: dNov08,
        },
        {
          key: '1 thessalonians 5:16-18|webp' as never,
          reference: '1 Thessalonians 5:16–18',
          translation: 'WEBP',
          savedOn: dNov10,
        },
      ],
    },
  }

  const guest: GuestParticipationEnvelopeV2 = {
    schemaVersion: 2,
    data: {
      ...makeEmptyGuestV2().data,
      savedScriptures: [
        {
          key: '1 thessalonians 5:16-18|webp' as never,
          reference: '1   Thessalonians  5 : 16 - 18',
          translation: 'webp',
          savedOn: dNov05,
          sourceChallengeId: c2,
        },
        {
          key: 'psalm 23:1|' as never,
          reference: 'Psalm 23:1',
          translation: null,
          savedOn: dNov01,
        },
      ],
    },
  }

  const result = reconcileGuestIntoAccount({
    mode: 'existingAccountMerge',
    guest: { envelope: guest },
    account,
    context: { expectedAccountId: ACCT_A },
  })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.status, 'clean')
  const scriptures = result.mergedAccount.data.savedScriptures
  assert.equal(scriptures.length, 3)
  assert.deepEqual(
    scriptures.map(s => [s.key, s.savedOn]),
    [
      ['psalm 23:1|', dNov01],
      ['1 thessalonians 5:16-18|webp', dNov05],
      ['romans 8:1|webp', dNov08],
    ],
  )
  assert.equal(scriptures[1]?.sourceChallengeId, c2)
})

test('duplicate earned awards handle credible vs unverified client dates and reject inadmissible date claims', () => {
  // Case A: Account has serverVerified dNov08; guest has unverified earlier client date dNov05 -> keep dNov08 & flag conflict
  const accountServerNov08: ProposedAccountParticipationEnvelope = {
    schemaVersion: 1,
    accountId: ACCT_A,
    namespace: 'cms',
    revision: 2,
    data: {
      ...emptyProposedAccountData(),
      earnedAwards: {
        [awardThematic]: {
          awardId: awardThematic,
          kind: 'thematic',
          publicationYearMonth: ym202611,
          discoveryId: 'discovery:2026-11:table-fellowship',
          earnedOn: dNov08,
          dateProvenance: 'serverVerified',
          hubAnnouncementAcked: false,
          cardViewed: false,
        },
      },
    },
  }

  const guestEarlierClient: GuestParticipationEnvelopeV2 = {
    schemaVersion: 2,
    data: {
      ...makeEmptyGuestV2().data,
      earnedAwards: {
        [awardThematic]: {
          awardId: awardThematic,
          kind: 'thematic',
          publicationYearMonth: ym202611,
          discoveryId: 'discovery:2026-11:table-fellowship',
          earnedOn: dNov05,
          hubAnnouncementAcked: false,
          cardViewed: false,
        },
      },
    },
  }

  const conflictRes = reconcileGuestIntoAccount({
    mode: 'existingAccountMerge',
    guest: { envelope: guestEarlierClient },
    account: accountServerNov08,
    context: { expectedAccountId: ACCT_A, maxCredibleDateUtcPlus14: dNov11 },
  })
  assert.equal(conflictRes.ok, true)
  if (!conflictRes.ok) return
  assert.equal(conflictRes.status, 'reconciledWithUnresolved')
  assert.equal(conflictRes.mergedAccount.data.earnedAwards[awardThematic]?.earnedOn, dNov08)
  assert.equal(conflictRes.mergedAccount.data.earnedAwards[awardThematic]?.clientClaimedOn, dNov05)
  assert.equal(conflictRes.unresolvedItems[0]?.kind, 'awardDateProvenanceConflict')
  assert.equal(conflictRes.guestClearanceEligible, false)

  // Case B: Both sides are unverified clientReported and disagree -> undecidableAwardDateProvenance
  const accountClientNov08: ProposedAccountParticipationEnvelope = {
    schemaVersion: 1,
    accountId: ACCT_A,
    namespace: 'cms',
    revision: 2,
    data: {
      ...emptyProposedAccountData(),
      earnedAwards: {
        [awardThematic]: {
          awardId: awardThematic,
          kind: 'thematic',
          publicationYearMonth: ym202611,
          discoveryId: 'discovery:2026-11:table-fellowship',
          earnedOn: dNov08,
          dateProvenance: 'clientReported',
          hubAnnouncementAcked: false,
          cardViewed: false,
        },
      },
    },
  }
  const undecidableRes = reconcileGuestIntoAccount({
    mode: 'existingAccountMerge',
    guest: { envelope: guestEarlierClient },
    account: accountClientNov08,
    context: { expectedAccountId: ACCT_A, maxCredibleDateUtcPlus14: dNov11 },
  })
  assert.equal(undecidableRes.ok, true)
  if (!undecidableRes.ok) return
  assert.equal(undecidableRes.status, 'reconciledWithUnresolved')
  assert.equal(undecidableRes.unresolvedItems[0]?.kind, 'undecidableAwardDateProvenance')
  assert.equal(undecidableRes.mergedAccount.data.earnedAwards[awardThematic]?.earnedOn, dNov08)

  // Case C: Guest claims impossible pre-month-start date (2026-10-15 for 2026-11 card) -> inadmissibleDateClaim
  const guestBadDate: GuestParticipationEnvelopeV2 = {
    schemaVersion: 2,
    data: {
      ...makeEmptyGuestV2().data,
      earnedAwards: {
        [awardThematic]: {
          awardId: awardThematic,
          kind: 'thematic',
          publicationYearMonth: ym202611,
          discoveryId: 'discovery:2026-11:table-fellowship',
          earnedOn: dOct15,
          hubAnnouncementAcked: false,
          cardViewed: false,
        },
      },
    },
  }
  const badDateRes = reconcileGuestIntoAccount({
    mode: 'existingAccountMerge',
    guest: { envelope: guestBadDate },
    account: accountServerNov08,
    context: { expectedAccountId: ACCT_A, maxCredibleDateUtcPlus14: dNov11 },
  })
  assert.equal(badDateRes.ok, true)
  if (!badDateRes.ok) return
  assert.equal(badDateRes.status, 'reconciledWithUnresolved')
  assert.equal(badDateRes.mergedAccount.data.earnedAwards[awardThematic]?.earnedOn, dNov08)
  assert.equal(badDateRes.unresolvedItems[0]?.kind, 'inadmissibleDateClaim')

  // Case D: Future device clock claim beyond UTC+14 ceiling -> inadmissibleDateClaim
  const futureDate = parseLocalCalendarDate('2099-01-01')!
  const guestFutureDate: GuestParticipationEnvelopeV2 = {
    schemaVersion: 2,
    data: {
      ...makeEmptyGuestV2().data,
      earnedAwards: {
        [awardThematic]: {
          awardId: awardThematic,
          kind: 'thematic',
          publicationYearMonth: ym202611,
          discoveryId: 'discovery:2026-11:table-fellowship',
          earnedOn: futureDate,
          hubAnnouncementAcked: false,
          cardViewed: false,
        },
      },
    },
  }
  const futureCeilingRes = reconcileGuestIntoAccount({
    mode: 'newAccountTransfer',
    guest: { envelope: guestFutureDate },
    account: createEmptyAccountEnvelope({ accountId: ACCT_A }),
    context: {
      expectedAccountId: ACCT_A,
      serverAuthorizedLocalDate: dNov11,
      maxCredibleDateUtcPlus14: dNov11,
    },
  })
  assert.equal(futureCeilingRes.ok, true)
  if (!futureCeilingRes.ok) return
  assert.equal(futureCeilingRes.status, 'reconciledWithUnresolved')
  assert.equal(futureCeilingRes.mergedAccount.data.earnedAwards[awardThematic]?.earnedOn, dNov11)
  if (futureCeilingRes.unresolvedItems[0]?.kind === 'inadmissibleDateClaim') {
    assert.equal(futureCeilingRes.unresolvedItems[0].reason, 'afterServerUtcPlus14Ceiling')
  }
})

test('preserves cardViewed and hubAnnouncementAcked independently across all flag combinations and backfills Card snapshots', () => {
  const card = makeValidCardSnapshot()
  const combinations: readonly (readonly [boolean, boolean, boolean, boolean])[] = [
    [false, false, false, false],
    [false, true, false, false], // cardViewed=true must NOT set hubAnnouncementAcked=true
    [true, false, false, false], // hubAnnouncementAcked=true must NOT set cardViewed=true
    [false, true, true, false],  // cross-device independent flags merge monotonically to (true, true)
    [true, false, false, true],
    [true, true, false, false],
  ]

  for (const [accAck, accView, gstAck, gstView] of combinations) {
    const account: ProposedAccountParticipationEnvelope = {
      schemaVersion: 1,
      accountId: ACCT_A,
      namespace: 'cms',
      revision: 1,
      data: {
        ...emptyProposedAccountData(),
        earnedAwards: {
          [awardThematic]: {
            awardId: awardThematic,
            kind: 'thematic',
            publicationYearMonth: ym202611,
            discoveryId: 'discovery:2026-11:table-fellowship',
            earnedOn: dNov08,
            dateProvenance: 'serverVerified',
            hubAnnouncementAcked: accAck,
            cardViewed: accView,
          },
        },
      },
    }
    const guest: GuestParticipationEnvelopeV2 = {
      schemaVersion: 2,
      data: {
        ...makeEmptyGuestV2().data,
        earnedAwards: {
          [awardThematic]: {
            awardId: awardThematic,
            kind: 'thematic',
            publicationYearMonth: ym202611,
            discoveryId: 'discovery:2026-11:table-fellowship',
            earnedOn: dNov08,
            hubAnnouncementAcked: gstAck,
            cardViewed: gstView,
            cardDocumentId: card.cardDocumentId,
            earnedCard: card,
          },
        },
      },
    }

    const res = reconcileGuestIntoAccount({
      mode: 'existingAccountMerge',
      guest: { envelope: guest },
      account,
      context: { expectedAccountId: ACCT_A },
    })
    assert.equal(res.ok, true)
    if (!res.ok) return
    assert.equal(res.status, 'clean')
    const merged = res.mergedAccount.data.earnedAwards[awardThematic]!
    assert.equal(merged.hubAnnouncementAcked, accAck || gstAck)
    assert.equal(merged.cardViewed, accView || gstView)
    assert.equal(merged.earnedCard?.cardDocumentId, card.cardDocumentId)
  }
})

test('partial reading positions pick furthest screen ONLY with authoritative screen order and emit typed unresolved items otherwise', () => {
  const account: ProposedAccountParticipationEnvelope = {
    schemaVersion: 1,
    accountId: ACCT_A,
    namespace: 'cms',
    revision: 1,
    data: {
      ...emptyProposedAccountData(),
      inProgressChallenges: {
        [c1]: { screenId: 'screen-2', updatedOn: dNov10 },
      },
    },
  }
  const guest: GuestParticipationEnvelopeV2 = {
    schemaVersion: 2,
    data: {
      ...makeEmptyGuestV2().data,
      inProgressChallenges: {
        [c1]: { screenId: 'screen-10', updatedOn: dNov05 }, // further screen despite older updatedOn
      },
    },
  }

  // 1. With authoritative order: screen-10 beats screen-2 (NOT lexicographical 'screen-2' > 'screen-10')
  const orderedRes = reconcileGuestIntoAccount({
    mode: 'existingAccountMerge',
    guest: { envelope: guest },
    account,
    context: {
      expectedAccountId: ACCT_A,
      screenOrderByChallenge: {
        [c1]: ['screen-1', 'screen-2', 'screen-10'],
      },
    },
  })
  assert.equal(orderedRes.ok, true)
  if (!orderedRes.ok) return
  assert.equal(orderedRes.status, 'clean')
  assert.equal(orderedRes.mergedAccount.data.inProgressChallenges[c1]?.screenId, 'screen-10')

  // 2. Without authoritative order: must NOT compare strings lexicographically or pick blindly by timestamp
  const missingOrderRes = reconcileGuestIntoAccount({
    mode: 'existingAccountMerge',
    guest: { envelope: guest },
    account,
    context: { expectedAccountId: ACCT_A },
  })
  assert.equal(missingOrderRes.ok, true)
  if (!missingOrderRes.ok) return
  assert.equal(missingOrderRes.status, 'reconciledWithUnresolved')
  assert.equal(missingOrderRes.unresolvedItems.length, 1)
  assert.equal(missingOrderRes.unresolvedItems[0]?.kind, 'undecidableReadingPosition')
  if (missingOrderRes.unresolvedItems[0]?.kind === 'undecidableReadingPosition') {
    assert.equal(missingOrderRes.unresolvedItems[0].reason, 'missingAuthoritativeScreenOrder')
    assert.equal(missingOrderRes.unresolvedItems[0].accountPosition.screenId, 'screen-2')
    assert.equal(missingOrderRes.unresolvedItems[0].guestPosition.screenId, 'screen-10')
  }

  // 3. Order provided, but one screenId is unknown to that order -> unknownScreenIdInOrder
  const unknownScreenRes = reconcileGuestIntoAccount({
    mode: 'existingAccountMerge',
    guest: { envelope: guest },
    account,
    context: {
      expectedAccountId: ACCT_A,
      screenOrderByChallenge: {
        [c1]: ['screen-1', 'screen-2'],
      },
    },
  })
  assert.equal(unknownScreenRes.ok, true)
  if (!unknownScreenRes.ok) return
  assert.equal(unknownScreenRes.status, 'reconciledWithUnresolved')
  if (unknownScreenRes.unresolvedItems[0]?.kind === 'undecidableReadingPosition') {
    assert.equal(unknownScreenRes.unresolvedItems[0].reason, 'unknownScreenIdInOrder')
  }
})

test('existing account Shelf takes precedence over conflicting guest Shelf while preserving underlying guest completions, Scripture, and Cards', () => {
  const julyChallenge = parseStoredChallengeId('cms:berrymark-challenge-2026-07-01-shepherd')!
  const account: ProposedAccountParticipationEnvelope = {
    schemaVersion: 1,
    accountId: ACCT_A,
    namespace: 'cms',
    revision: 3,
    data: {
      ...emptyProposedAccountData({
        months: [
          { yearMonth: ym202608, admissionKind: 'readerSelected' },
          { yearMonth: ym202609, admissionKind: 'readerSelected' },
          { yearMonth: ym202610, admissionKind: 'autoAdmitted' },
        ],
        activeFocusMonth: ym202609,
      }),
    },
  }

  const guest: GuestParticipationEnvelopeV2 = {
    schemaVersion: 2,
    data: {
      completedChallenges: {
        [julyChallenge]: { completedOn: dNov05 },
      },
      inProgressChallenges: {},
      savedChallenges: {
        [julyChallenge]: { savedOn: dNov05 },
      },
      savedScriptures: [
        {
          key: 'psalm 23:1|webp' as never,
          reference: 'Psalm 23:1',
          translation: 'WEBP',
          savedOn: dNov05,
          sourceChallengeId: julyChallenge,
        },
      ],
      lastOpenedChallenge: null,
      earnedAwards: {
        [awardJuly]: {
          awardId: awardJuly,
          kind: 'thematic',
          publicationYearMonth: ym202607,
          discoveryId: 'discovery:2026-07:shepherd-psalm',
          earnedOn: dNov05,
          hubAnnouncementAcked: false,
          cardViewed: false,
        },
      },
    },
  }

  const res = reconcileGuestIntoAccount({
    mode: 'existingAccountMerge',
    guest: {
      envelope: guest,
      shelf: {
        months: [{ yearMonth: ym202607, admissionKind: 'readerSelected' }],
        activeFocusMonth: ym202607,
      },
    },
    account,
    context: { expectedAccountId: ACCT_A },
  })

  assert.equal(res.ok, true)
  if (!res.ok) return
  assert.equal(res.status, 'clean')
  assert.deepEqual(
    res.mergedAccount.data.shelf?.months.map(m => m.yearMonth),
    [ym202608, ym202609, ym202610],
  )
  assert.equal(res.mergedAccount.data.shelf?.activeFocusMonth, ym202609)
  assert.equal(res.shelfConflicts.length, 1)
  assert.equal(res.shelfConflicts[0]?.yearMonth, ym202607)
  assert.equal(res.shelfConflicts[0]?.disposition, 'preservedInLibraryNotOnShelf')

  // Underlying guest accomplishments for 2026-07 remain fully preserved
  assert.equal(res.mergedAccount.data.completedChallenges[julyChallenge]?.completedOn, dNov05)
  assert.equal(res.mergedAccount.data.savedChallenges[julyChallenge]?.savedOn, dNov05)
  assert.equal(res.mergedAccount.data.savedScriptures.length, 1)
  assert.equal(res.mergedAccount.data.earnedAwards[awardJuly]?.earnedOn, dNov05)

  // Explicit empty account Shelf also takes precedence over guest Shelf, and >3 guest slots are capped
  const emptyShelfAccount: ProposedAccountParticipationEnvelope = {
    schemaVersion: 1,
    accountId: ACCT_A,
    namespace: 'cms',
    revision: 5,
    data: {
      ...emptyProposedAccountData({ months: [] }),
    },
  }
  const emptyShelfRes = reconcileGuestIntoAccount({
    mode: 'existingAccountMerge',
    guest: {
      envelope: guest,
      shelf: {
        months: [
          { yearMonth: ym202607, admissionKind: 'readerSelected' },
          { yearMonth: ym202608, admissionKind: 'autoAdmitted' },
          { yearMonth: ym202609, admissionKind: 'autoAdmitted' },
          { yearMonth: ym202610, admissionKind: 'autoAdmitted' },
        ],
      },
    },
    account: emptyShelfAccount,
    context: { expectedAccountId: ACCT_A },
  })
  assert.equal(emptyShelfRes.ok, true)
  if (!emptyShelfRes.ok) return
  assert.deepEqual(emptyShelfRes.mergedAccount.data.shelf?.months, [])
  assert.equal(emptyShelfRes.shelfConflicts.length, 3)
  assert.equal(
    emptyShelfRes.rejectedRecords.some(r => r.reason === 'shelfCapacityExceeded'),
    true,
  )
})

test('identical retries are idempotent and set-like fields are commutative', () => {
  const guest: GuestParticipationEnvelopeV2 = {
    schemaVersion: 2,
    data: {
      completedChallenges: { [c1]: { completedOn: dNov05 } },
      inProgressChallenges: { [c2]: { screenId: 'screen-3', updatedOn: dNov08 } },
      savedChallenges: { [c1]: { savedOn: dNov05 } },
      savedScriptures: [
        {
          key: 'john 15:1|webp' as never,
          reference: 'John 15:1',
          translation: 'WEBP',
          savedOn: dNov05,
        },
      ],
      lastOpenedChallenge: { challengeId: c2, openedOn: dNov08 },
      earnedAwards: {
        [awardThematic]: {
          awardId: awardThematic,
          kind: 'thematic',
          publicationYearMonth: ym202611,
          discoveryId: 'discovery:2026-11:table-fellowship',
          earnedOn: dNov05,
          hubAnnouncementAcked: false,
          cardViewed: true,
        },
      },
    },
  }

  const first = reconcileGuestIntoAccount({
    mode: 'newAccountTransfer',
    guest: { envelope: guest },
    account: createEmptyAccountEnvelope({ accountId: ACCT_A }),
    context: {
      expectedAccountId: ACCT_A,
      guestDateProvenance: 'serverVerified',
      idempotencyKey: 'retry-1',
    },
  })
  assert.equal(first.ok, true)
  if (!first.ok) return

  // Retry exact same guest payload against resulting account
  const retry = reconcileGuestIntoAccount({
    mode: 'existingAccountMerge',
    guest: { envelope: guest },
    account: first.mergedAccount,
    context: {
      expectedAccountId: ACCT_A,
      guestDateProvenance: 'serverVerified',
      idempotencyKey: 'retry-1',
    },
  })
  assert.equal(retry.ok, true)
  if (!retry.ok) return
  assert.equal(retry.changedFromAccount, false)
  assert.equal(retry.mergedAccount.revision, first.mergedAccount.revision)
  assert.deepEqual(retry.mergedAccount.data, first.mergedAccount.data)

  // Set-like commutativity: merge(A, B) vs merge(B, A)
  const dataA: ProposedAccountParticipationEnvelope = {
    schemaVersion: 1,
    accountId: ACCT_A,
    namespace: 'cms',
    revision: 1,
    data: {
      completedChallenges: { [c1]: { completedOn: dNov05, dateProvenance: 'serverVerified' } },
      inProgressChallenges: { [c2]: { screenId: 'screen-2', updatedOn: dNov08 } },
      savedChallenges: { [c1]: { savedOn: dNov08 } },
      savedScriptures: [
        { key: 'romans 8:1|webp' as never, reference: 'Romans 8:1', translation: 'WEBP', savedOn: dNov08 },
      ],
      lastOpenedChallenge: { challengeId: c2, openedOn: dNov08 },
      earnedAwards: {
        [awardThematic]: {
          awardId: awardThematic,
          kind: 'thematic',
          publicationYearMonth: ym202611,
          discoveryId: 'discovery:2026-11:table-fellowship',
          earnedOn: dNov08,
          dateProvenance: 'serverVerified',
          hubAnnouncementAcked: true,
          cardViewed: false,
        },
      },
    },
  }
  const guestB: GuestParticipationEnvelopeV2 = {
    schemaVersion: 2,
    data: {
      completedChallenges: { [c3]: { completedOn: dNov10 } },
      inProgressChallenges: { [c2]: { screenId: 'screen-5', updatedOn: dNov05 } },
      savedChallenges: { [c1]: { savedOn: dNov01 } },
      savedScriptures: [
        { key: 'john 15:1|webp' as never, reference: 'John 15:1', translation: 'WEBP', savedOn: dNov05 },
      ],
      lastOpenedChallenge: { challengeId: c3, openedOn: dNov10 },
      earnedAwards: {
        [awardThematic]: {
          awardId: awardThematic,
          kind: 'thematic',
          publicationYearMonth: ym202611,
          discoveryId: 'discovery:2026-11:table-fellowship',
          earnedOn: dNov05,
          hubAnnouncementAcked: false,
          cardViewed: true,
        },
      },
    },
  }
  const dataB: ProposedAccountParticipationEnvelope = {
    schemaVersion: 1,
    accountId: ACCT_A,
    namespace: 'cms',
    revision: 1,
    data: {
      completedChallenges: { [c3]: { completedOn: dNov10, dateProvenance: 'serverVerified' } },
      inProgressChallenges: { [c2]: { screenId: 'screen-5', updatedOn: dNov05 } },
      savedChallenges: { [c1]: { savedOn: dNov01 } },
      savedScriptures: guestB.data.savedScriptures,
      lastOpenedChallenge: guestB.data.lastOpenedChallenge,
      earnedAwards: {
        [awardThematic]: {
          awardId: awardThematic,
          kind: 'thematic',
          publicationYearMonth: ym202611,
          discoveryId: 'discovery:2026-11:table-fellowship',
          earnedOn: dNov05,
          dateProvenance: 'serverVerified',
          hubAnnouncementAcked: false,
          cardViewed: true,
        },
      },
    },
  }
  const guestA: GuestParticipationEnvelopeV2 = {
    schemaVersion: 2,
    data: {
      completedChallenges: { [c1]: { completedOn: dNov05 } },
      inProgressChallenges: dataA.data.inProgressChallenges,
      savedChallenges: dataA.data.savedChallenges,
      savedScriptures: dataA.data.savedScriptures,
      lastOpenedChallenge: dataA.data.lastOpenedChallenge,
      earnedAwards: {
        [awardThematic]: {
          awardId: awardThematic,
          kind: 'thematic',
          publicationYearMonth: ym202611,
          discoveryId: 'discovery:2026-11:table-fellowship',
          earnedOn: dNov08,
          hubAnnouncementAcked: true,
          cardViewed: false,
        },
      },
    },
  }

  const ab = reconcileGuestIntoAccount({
    mode: 'existingAccountMerge',
    guest: { envelope: guestB },
    account: dataA,
    context: {
      expectedAccountId: ACCT_A,
      guestDateProvenance: 'serverVerified',
      screenOrderByChallenge: { [c2]: ['screen-1', 'screen-2', 'screen-5'] },
    },
  })
  const ba = reconcileGuestIntoAccount({
    mode: 'existingAccountMerge',
    guest: { envelope: guestA },
    account: dataB,
    context: {
      expectedAccountId: ACCT_A,
      guestDateProvenance: 'serverVerified',
      screenOrderByChallenge: { [c2]: ['screen-1', 'screen-2', 'screen-5'] },
    },
  })
  assert.equal(ab.ok, true)
  assert.equal(ba.ok, true)
  if (!ab.ok || !ba.ok) return
  assert.deepEqual(ab.mergedAccount.data, ba.mergedAccount.data)
})

test('crash and acknowledgment guard allows clearing guest storage ONLY after matching durable commit and zero in-flight local mutations', () => {
  const guest1 = { envelope: makeEmptyGuestV2() }
  const guest2: GuestParticipationEnvelopeV2 = {
    schemaVersion: 2,
    data: {
      ...makeEmptyGuestV2().data,
      completedChallenges: { [c1]: { completedOn: dNov10 } },
    },
  }
  const fp1 = computeGuestPayloadFingerprint(guest1)
  const fp2 = computeGuestPayloadFingerprint({ envelope: guest2 })
  assert.notEqual(fp1, fp2)

  const eligibleRecon = reconcileGuestIntoAccount({
    mode: 'newAccountTransfer',
    guest: guest1,
    account: createEmptyAccountEnvelope({ accountId: ACCT_A }),
    context: { expectedAccountId: ACCT_A, idempotencyKey: 'idem-123' },
  })
  assert.equal(eligibleRecon.ok, true)
  if (!eligibleRecon.ok) return
  assert.equal(eligibleRecon.guestClearanceEligible, true)

  const validReceipt: CommitAckReceipt = {
    ok: true,
    status: 'committed',
    accountId: ACCT_A,
    idempotencyKey: 'idem-123',
    committedGuestFingerprint: fp1,
    durableRevision: 1,
    unresolvedCount: 0,
    unresolvedPersistedOnServer: false,
  }

  // Happy path
  assert.deepEqual(
    canSafelyClearGuestStorage({
      expectedAccountId: ACCT_A,
      expectedIdempotencyKey: 'idem-123',
      expectedGuestFingerprint: fp1,
      currentGuestFingerprint: fp1,
      reconciliation: eligibleRecon,
      receipt: validReceipt,
    }),
    { shouldClearGuestStorage: true, reason: 'verifiedDurableCommit' },
  )

  // Retry duplicate receipt is also safe to clear
  assert.equal(
    canSafelyClearGuestStorage({
      expectedAccountId: ACCT_A,
      expectedIdempotencyKey: 'idem-123',
      expectedGuestFingerprint: fp1,
      currentGuestFingerprint: fp1,
      reconciliation: eligibleRecon,
      receipt: { ...validReceipt, status: 'alreadyCommittedDuplicate' },
    }).shouldClearGuestStorage,
    true,
  )

  // Crash before ACK (missing receipt)
  assert.equal(
    canSafelyClearGuestStorage({
      expectedAccountId: ACCT_A,
      expectedIdempotencyKey: 'idem-123',
      expectedGuestFingerprint: fp1,
      currentGuestFingerprint: fp1,
      reconciliation: eligibleRecon,
      receipt: null,
    }).reason,
    'missingReceipt',
  )

  // Local guest mutated in flight (completed Challenge C after snapshot was sent)
  assert.equal(
    canSafelyClearGuestStorage({
      expectedAccountId: ACCT_A,
      expectedIdempotencyKey: 'idem-123',
      expectedGuestFingerprint: fp1,
      currentGuestFingerprint: fp2,
      reconciliation: eligibleRecon,
      receipt: validReceipt,
    }).reason,
    'localGuestMutatedInFlight',
  )

  // Unresolved conflicts not persisted on server -> refuse wiping local candidate evidence
  assert.equal(
    canSafelyClearGuestStorage({
      expectedAccountId: ACCT_A,
      expectedIdempotencyKey: 'idem-123',
      expectedGuestFingerprint: fp1,
      currentGuestFingerprint: fp1,
      reconciliation: eligibleRecon,
      receipt: { ...validReceipt, unresolvedCount: 1, unresolvedPersistedOnServer: false },
    }).reason,
    'unresolvedNotPersistedOnServer',
  )

  // Account mismatch
  assert.equal(
    canSafelyClearGuestStorage({
      expectedAccountId: ACCT_B,
      expectedIdempotencyKey: 'idem-123',
      expectedGuestFingerprint: fp1,
      currentGuestFingerprint: fp1,
      reconciliation: eligibleRecon,
      receipt: validReceipt,
    }).reason,
    'accountIdMismatch',
  )

  // Rejected reconciliation cannot be overridden by a successful receipt
  assert.deepEqual(
    canSafelyClearGuestStorage({
      expectedAccountId: ACCT_A,
      expectedIdempotencyKey: 'idem-123',
      expectedGuestFingerprint: fp1,
      currentGuestFingerprint: fp1,
      reconciliation: { ok: false, guestClearanceEligible: false },
      receipt: validReceipt,
    }),
    { shouldClearGuestStorage: false, reason: 'reconciliationRequiresRetention' },
  )
})

test('rejects invalid/cross-namespace or mismatched account IDs and quarantines invalid inner records', () => {
  assert.equal(parseAccountId(''), null)
  assert.equal(parseAccountId(' __proto__ '), null)
  assert.equal(parseAccountId('__proto__'), null)
  assert.equal(parseAccountId('bad id with spaces'), null)
  assert.equal(parseAccountId(ACCT_A), ACCT_A)

  // Account ownership mismatch
  const ownershipMismatch = reconcileGuestIntoAccount({
    mode: 'existingAccountMerge',
    guest: { envelope: makeEmptyGuestV2() },
    account: createEmptyAccountEnvelope({ accountId: ACCT_B }),
    context: { expectedAccountId: ACCT_A },
  })
  assert.equal(ownershipMismatch.ok, false)
  if (!ownershipMismatch.ok) {
    assert.equal(ownershipMismatch.reason, 'accountOwnershipMismatch')
  }

  // Envelope-level cross-namespace conflict (pilot guest into cms account)
  const crossNs = reconcileGuestIntoAccount({
    mode: 'existingAccountMerge',
    guest: { envelope: makeEmptyGuestV2(), namespace: 'pilot' },
    account: createEmptyAccountEnvelope({ accountId: ACCT_A, namespace: 'cms' }),
    context: { expectedAccountId: ACCT_A, expectedNamespace: 'cms' },
  })
  assert.equal(crossNs.ok, false)
  if (!crossNs.ok) {
    assert.equal(crossNs.reason, 'crossNamespaceConflict')
  }

  // Record-level pilot: / drafts. / invalid award entries are quarantined, never merged
  const dirtyGuest: GuestParticipationEnvelopeV2 = {
    schemaVersion: 2,
    data: {
      completedChallenges: {
        [c1]: { completedOn: dNov05 },
        'pilot:sample-1': { completedOn: dNov05 },
        'cms:drafts.unpublished-doc': { completedOn: dNov05 },
      },
      inProgressChallenges: {
        'cms:fixture-challenge-document': { screenId: 's1', updatedOn: dNov05 },
      },
      savedChallenges: {},
      savedScriptures: [],
      lastOpenedChallenge: null,
      earnedAwards: {
        [awardFullMonth]: {
          awardId: awardFullMonth,
          kind: 'thematic', // mismatched kind for full-month!
          publicationYearMonth: ym202611,
          discoveryId: 'discovery:2026-11:full-month',
          earnedOn: dNov10,
          hubAnnouncementAcked: false,
          cardViewed: false,
        },
      },
    },
  }

  const sanitized = reconcileGuestIntoAccount({
    mode: 'newAccountTransfer',
    guest: { envelope: dirtyGuest },
    account: createEmptyAccountEnvelope({ accountId: ACCT_A }),
    context: { expectedAccountId: ACCT_A, idempotencyKey: 'idem-dirty-guest' },
  })
  assert.equal(sanitized.ok, true)
  if (!sanitized.ok) return
  assert.deepEqual(Object.keys(sanitized.mergedAccount.data.completedChallenges), [c1])
  assert.deepEqual(sanitized.mergedAccount.data.inProgressChallenges, {})
  assert.deepEqual(sanitized.mergedAccount.data.earnedAwards, {})
  assert.equal(sanitized.rejectedRecords.length, 4)
  assert.equal(sanitized.rejectedRecords.every(r => r.source === 'guest'), true)
  // Rejected guest records omitted from mergedAccount must block automatic guest clearance
  assert.equal(sanitized.guestClearanceEligible, false)

  // Even a successful commit receipt must NOT override guest data retention when guest records were rejected
  const dirtyClearance = canSafelyClearGuestStorage({
    expectedAccountId: ACCT_A,
    expectedIdempotencyKey: 'idem-dirty-guest',
    expectedGuestFingerprint: sanitized.guestPayloadFingerprint,
    currentGuestFingerprint: sanitized.guestPayloadFingerprint,
    reconciliation: sanitized,
    receipt: {
      ok: true,
      status: 'committed',
      accountId: ACCT_A,
      idempotencyKey: 'idem-dirty-guest',
      committedGuestFingerprint: sanitized.guestPayloadFingerprint,
      durableRevision: sanitized.mergedAccount.revision,
      unresolvedCount: 0,
      unresolvedPersistedOnServer: false,
    },
  })
  assert.deepEqual(dirtyClearance, {
    shouldClearGuestStorage: false,
    reason: 'reconciliationRequiresRetention',
  })
})

test('alias collisions preserve actual date provenance without promoting earlier unverified dates to serverVerified', () => {
  // Both key orders: cOld before c1, and c1 before cOld
  for (const firstKey of [cOld, c1]) {
    const completedMap: Record<string, { completedOn: LocalCalendarDate; dateProvenance: 'clientReported' | 'serverVerified' }> = {}
    if (firstKey === cOld) {
      completedMap[cOld] = { completedOn: dNov05, dateProvenance: 'clientReported' }
      completedMap[c1] = { completedOn: dNov08, dateProvenance: 'serverVerified' }
    } else {
      completedMap[c1] = { completedOn: dNov08, dateProvenance: 'serverVerified' }
      completedMap[cOld] = { completedOn: dNov05, dateProvenance: 'clientReported' }
    }

    const account: ProposedAccountParticipationEnvelope = {
      schemaVersion: 1,
      accountId: ACCT_A,
      namespace: 'cms',
      revision: 2,
      data: {
        ...emptyProposedAccountData(),
        completedChallenges: completedMap,
      },
    }

    const res = reconcileGuestIntoAccount({
      mode: 'existingAccountMerge',
      guest: { envelope: makeEmptyGuestV2() },
      account,
      context: {
        expectedAccountId: ACCT_A,
        maxCredibleDateUtcPlus14: dNov11,
        challengeAliases: { [cOld]: c1 },
      },
    })

    assert.equal(res.ok, true)
    if (!res.ok) return
    assert.equal(res.status, 'reconciledWithUnresolved')
    assert.equal(res.guestClearanceEligible, false)
    assert.deepEqual(Object.keys(res.mergedAccount.data.completedChallenges), [c1])
    assert.equal(res.mergedAccount.data.completedChallenges[c1]?.completedOn, dNov08)
    assert.equal(res.mergedAccount.data.completedChallenges[c1]?.dateProvenance, 'serverVerified')
    assert.equal(res.mergedAccount.data.completedChallenges[c1]?.clientClaimedOn, dNov05)
    assert.equal(res.unresolvedItems.length, 1)
    assert.equal(res.unresolvedItems[0]?.kind, 'completionDateProvenanceConflict')
  }

  // Two disagreeing clientReported guest aliases never manufacture serverVerified provenance
  const guestConflict: GuestParticipationEnvelopeV2 = {
    schemaVersion: 2,
    data: {
      ...makeEmptyGuestV2().data,
      completedChallenges: {
        [cOld]: { completedOn: dNov05 },
        [c1]: { completedOn: dNov08 },
      },
    },
  }
  const guestRes = reconcileGuestIntoAccount({
    mode: 'newAccountTransfer',
    guest: { envelope: guestConflict },
    account: createEmptyAccountEnvelope({ accountId: ACCT_A }),
    context: {
      expectedAccountId: ACCT_A,
      challengeAliases: { [cOld]: c1 },
    },
  })
  assert.equal(guestRes.ok, true)
  if (!guestRes.ok) return
  assert.equal(guestRes.status, 'reconciledWithUnresolved')
  assert.equal(guestRes.mergedAccount.data.completedChallenges[c1]?.dateProvenance, 'clientReported')
  assert.equal(guestRes.unresolvedItems[0]?.kind, 'undecidableCompletionDateProvenance')
})

test('cyclic Challenge aliases never swap or produce inconsistent identities across merges and retries', () => {
  const account: ProposedAccountParticipationEnvelope = {
    schemaVersion: 1,
    accountId: ACCT_A,
    namespace: 'cms',
    revision: 1,
    data: {
      ...emptyProposedAccountData(),
      completedChallenges: {
        [c1]: { completedOn: dNov05, dateProvenance: 'serverVerified' },
      },
    },
  }

  const guest: GuestParticipationEnvelopeV2 = {
    schemaVersion: 2,
    data: {
      ...makeEmptyGuestV2().data,
      completedChallenges: {
        [c2]: { completedOn: dNov08 },
        [cOld]: { completedOn: dNov10 },
      },
      inProgressChallenges: {
        [c3]: { screenId: 'screen-2', updatedOn: dNov10 },
      },
    },
  }

  // c1 <-> c2 cycle, plus c3 -> c1 tail leading into the cycle; cOld -> c3 is ALSO trapped if c3 enters cycle.
  // Use a disjoint acyclic alias (cOld -> c3? no, keep c3 disjoint from cycle: cOld -> c3 acyclic, c1 <-> c2 cyclic).
  const cyclicAliases = {
    [c1]: c2,
    [c2]: c1,
    [cOld]: c3,
  }

  const first = reconcileGuestIntoAccount({
    mode: 'existingAccountMerge',
    guest: { envelope: guest },
    account,
    context: {
      expectedAccountId: ACCT_A,
      challengeAliases: cyclicAliases,
    },
  })

  assert.equal(first.ok, true)
  if (!first.ok) return
  // c1 and c2 must NOT swap identities; cOld -> c3 (acyclic) still resolves cleanly and clears in-progress c3
  assert.equal(first.mergedAccount.data.completedChallenges[c1]?.completedOn, dNov05)
  assert.equal(first.mergedAccount.data.completedChallenges[c2]?.completedOn, dNov08)
  assert.equal(first.mergedAccount.data.completedChallenges[c3]?.completedOn, dNov10)
  assert.deepEqual(first.mergedAccount.data.inProgressChallenges, {})
  assert.equal(first.appliedAliases[c1], undefined)
  assert.equal(first.appliedAliases[c2], undefined)
  assert.equal(first.appliedAliases[cOld], c3)

  // Retrying with the same cyclic aliases must remain 100% idempotent with identical Challenge IDs
  const retry = reconcileGuestIntoAccount({
    mode: 'existingAccountMerge',
    guest: { envelope: guest },
    account: first.mergedAccount,
    context: {
      expectedAccountId: ACCT_A,
      challengeAliases: cyclicAliases,
    },
  })
  assert.equal(retry.ok, true)
  if (!retry.ok) return
  assert.equal(retry.changedFromAccount, false)
  assert.deepEqual(retry.mergedAccount.data, first.mergedAccount.data)

  // Tail leading into a cycle (cOld -> c1 -> c2 -> c1) must also leave all IDs unmapped rather than picking an arbitrary cycle member
  const tailIntoCycle = reconcileGuestIntoAccount({
    mode: 'newAccountTransfer',
    guest: {
      envelope: {
        ...makeEmptyGuestV2(),
        data: {
          ...makeEmptyGuestV2().data,
          completedChallenges: {
            [cOld]: { completedOn: dNov05 },
          },
        },
      },
    },
    account: createEmptyAccountEnvelope({ accountId: ACCT_A }),
    context: {
      expectedAccountId: ACCT_A,
      challengeAliases: { [cOld]: c1, [c1]: c2, [c2]: c1 },
    },
  })
  assert.equal(tailIntoCycle.ok, true)
  if (!tailIntoCycle.ok) return
  assert.deepEqual(Object.keys(tailIntoCycle.mergedAccount.data.completedChallenges), [cOld])
  assert.deepEqual(tailIntoCycle.appliedAliases, {})
})

test('fails closed on future unsupported guest and account schema versions', () => {
  const futureGuest = reconcileGuestIntoAccount({
    mode: 'newAccountTransfer',
    guest: {
      envelope: {
        schemaVersion: 4,
        data: makeEmptyGuestV2().data,
      },
    },
    account: createEmptyAccountEnvelope({ accountId: ACCT_A }),
    context: { expectedAccountId: ACCT_A },
  })
  assert.equal(futureGuest.ok, false)
  if (!futureGuest.ok) {
    assert.equal(futureGuest.reason, 'unsupportedGuestSchemaVersion')
    assert.equal(futureGuest.guestClearanceEligible, false)
  }

  const futureAccount = reconcileGuestIntoAccount({
    mode: 'existingAccountMerge',
    guest: { envelope: makeEmptyGuestV2() },
    account: {
      ...createEmptyAccountEnvelope({ accountId: ACCT_A }),
      schemaVersion: 2,
    },
    context: { expectedAccountId: ACCT_A },
  })
  assert.equal(futureAccount.ok, false)
  if (!futureAccount.ok) {
    assert.equal(futureAccount.reason, 'unsupportedAccountSchemaVersion')
    assert.equal(futureAccount.guestClearanceEligible, false)
  }
})

test('never mutates input payloads and keeps src/accountSync free of browser, React, Capacitor, or Supabase dependencies', () => {
  const guestData = makeEmptyGuestV2()
  guestData.data.completedChallenges[c1] = { completedOn: dNov05 as LocalCalendarDate }
  const guestSnapshot = JSON.stringify(guestData)

  const accountData = createEmptyAccountEnvelope({ accountId: ACCT_A })
  const accountSnapshot = JSON.stringify(accountData)

  const res = reconcileGuestIntoAccount({
    mode: 'newAccountTransfer',
    guest: { envelope: guestData },
    account: accountData,
    context: { expectedAccountId: ACCT_A },
  })
  assert.equal(res.ok, true)
  assert.equal(JSON.stringify(guestData), guestSnapshot)
  assert.equal(JSON.stringify(accountData), accountSnapshot)

  const typesSource = readFileSync(new URL('../../src/accountSync/types.ts', import.meta.url), 'utf8')
  const reconcileSource = readFileSync(new URL('../../src/accountSync/reconcile.ts', import.meta.url), 'utf8')
  const codeOnly = `${typesSource}\n${reconcileSource}`
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')

  for (const forbidden of [
    'localStorage',
    'sessionStorage',
    'indexedDB',
    'window.',
    'document.',
    '@capacitor/',
    '@supabase/',
    "from 'react'",
    'from "react"',
    'node:',
  ]) {
    assert.equal(
      codeOnly.includes(forbidden),
      false,
      `Forbidden dependency or global "${forbidden}" found in src/accountSync`,
    )
  }
})
