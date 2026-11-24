import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'
import {
  coordinateGuestSync,
  createMockAuthorizedAccountTransport,
  GuestToAccountSyncCoordinator,
  isAccountEmpty,
  maskAccountId,
  parseAccountId,
  sanitizeLogMessage,
} from '../../src/accountSync/index.ts'
import type {
  EarnedScriptureCardSnapshot,
  GuestClearanceDecision,
  GuestParticipationEnvelopeV2,
  GuestReconciliationInput,
  GuestStorageAccessor,
  ProposedAccountParticipationEnvelope,
  SyncLogger,
} from '../../src/accountSync/index.ts'
import {
  parseCanonicalMonthlyAwardId,
  parseLocalCalendarDate,
  parsePublicationYearMonth,
  parseStoredChallengeId,
} from '../../src/participation/identity.ts'

const ACCT_A = parseAccountId('550e8400-e29b-41d4-a716-446655440000')!

const c1 = parseStoredChallengeId('cms:berrymark-challenge-2026-11-01-true-vine')!
const c2 = parseStoredChallengeId('cms:berrymark-challenge-2026-11-02-rejoice-always')!
const c3 = parseStoredChallengeId('cms:berrymark-challenge-2026-11-03-pray-continually')!

const dNov01 = parseLocalCalendarDate('2026-11-01')!
const dNov02 = parseLocalCalendarDate('2026-11-02')!
const dNov05 = parseLocalCalendarDate('2026-11-05')!

const ym202611 = parsePublicationYearMonth('2026-11')!
const awardThematic = parseCanonicalMonthlyAwardId('card:monthly:2026-11:table-fellowship')!

function makeValidCardSnapshot(): EarnedScriptureCardSnapshot {
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
  }
}

function makeGuestWithRecords(): GuestParticipationEnvelopeV2 {
  return {
    schemaVersion: 2,
    namespace: 'cms',
    data: {
      completedChallenges: {
        [c1]: { completedOn: dNov01 },
      },
      inProgressChallenges: {
        [c2]: { screenId: 'screen-3', updatedOn: dNov02 },
      },
      savedChallenges: {
        [c3]: { savedOn: dNov01 },
      },
      savedScriptures: [
        {
          key: 'luke 24:30|webp' as never,
          reference: 'Luke 24:30',
          translation: 'WEBP',
          savedOn: dNov01,
          sourceChallengeId: c1,
        },
      ],
      lastOpenedChallenge: { challengeId: c1, openedOn: dNov05 },
      earnedAwards: {
        [awardThematic]: {
          kind: 'thematic',
          publicationYearMonth: ym202611,
          earnedOn: dNov01,
          discoveryId: 'discovery:2026-11:table-fellowship',
          hubAnnouncementAcked: false,
          cardViewed: true,
          cardDocumentId: 'card-2026-11-table-fellowship',
          earnedCardSnapshot: makeValidCardSnapshot(),
        },
      },
    },
  }
}

function makeEmptyGuestEnvelope(): GuestParticipationEnvelopeV2 {
  return {
    schemaVersion: 2,
    namespace: 'cms',
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

class TestGuestStorageAccessor implements GuestStorageAccessor {
  public data: GuestReconciliationInput
  public clearCount = 0
  public lastClearanceDecision: GuestClearanceDecision | null = null

  constructor(initialData: GuestReconciliationInput) {
    this.data = JSON.parse(JSON.stringify(initialData))
  }

  getSnapshot(): GuestReconciliationInput {
    return JSON.parse(JSON.stringify(this.data))
  }

  clearGuestStorage(decision: GuestClearanceDecision): boolean {
    this.clearCount++
    this.lastClearanceDecision = decision
    return true
  }
}

describe('R13-1 Guest-to-Account Sync Orchestration', () => {
  test('first-account creation (newAccountTransfer) moves accomplishments and safely clears guest storage', async () => {
    const transport = createMockAuthorizedAccountTransport()
    const guestEnvelope = makeGuestWithRecords()
    const accessor = new TestGuestStorageAccessor({ envelope: guestEnvelope })

    const outcome = await coordinateGuestSync(
      transport,
      {
        session: { accountId: ACCT_A },
        guest: accessor,
        mode: 'newAccountTransfer',
      },
    )

    assert.equal(outcome.ok, true)
    assert.equal(outcome.status, 'committed')
    assert.equal(outcome.mode, 'newAccountTransfer')
    assert.equal(outcome.attempts, 1)
    assert.equal(outcome.committedRevision, 1)
    assert.equal(outcome.guestCleared, true)
    assert.equal(accessor.clearCount, 1)
    assert.equal(outcome.guestClearanceDecision?.shouldClearGuestStorage, true)
    assert.equal(outcome.guestClearanceDecision?.reason, 'verifiedDurableCommit')

    // Verify stored account in transport
    const stored = transport.getStoredAccount(ACCT_A)
    assert.ok(stored)
    assert.equal(stored.revision, 1)
    assert.ok(stored.data.completedChallenges[c1])
    assert.ok(stored.data.inProgressChallenges[c2])
    assert.ok(stored.data.savedChallenges[c3])
    assert.equal(stored.data.savedScriptures.length, 1)
    assert.ok(stored.data.earnedAwards[awardThematic])
  })

  test('V3 transfers participation to account V1 and retains device-local Notebook acknowledgements', async () => {
    for (const notebookAcknowledgedAwardIds of [undefined, [awardThematic]]) {
      const transport = createMockAuthorizedAccountTransport()
      const v2 = makeGuestWithRecords()
      const accessor = new TestGuestStorageAccessor({
        envelope: { schemaVersion: 3, data: { ...v2.data, notebookAcknowledgedAwardIds } },
      })

      const outcome = await coordinateGuestSync(transport, {
        session: { accountId: ACCT_A },
        guest: accessor,
        mode: 'newAccountTransfer',
      })

      assert.equal(outcome.status, 'committed')
      assert.equal(accessor.clearCount, notebookAcknowledgedAwardIds ? 0 : 1)
      assert.equal(outcome.guestClearanceDecision?.reason, notebookAcknowledgedAwardIds
        ? 'reconciliationRequiresRetention'
        : 'verifiedDurableCommit')
      const stored = transport.getStoredAccount(ACCT_A)
      assert.ok(stored)
      assert.equal(stored.schemaVersion, 1)
      assert.ok(stored.data.completedChallenges[c1])
      assert.ok(stored.data.inProgressChallenges[c2])
      assert.equal(stored.data.savedScriptures.length, 1)
      assert.equal(stored.data.earnedAwards[awardThematic]?.cardViewed, true)
      assert.equal(stored.data.earnedAwards[awardThematic]?.hubAnnouncementAcked, false)
      assert.equal(Object.hasOwn(stored.data, 'notebookAcknowledgedAwardIds'), false)
    }
  })

  test('coordinator preserves both explicit protection values for each Shelf admission kind', async () => {
    const cases = [
      { yearMonth: '2026-10', admissionKind: 'readerSelected', isProtected: true },
      { yearMonth: '2026-09', admissionKind: 'readerSelected', isProtected: false },
      { yearMonth: '2026-08', admissionKind: 'autoAdmitted', isProtected: true },
      { yearMonth: '2026-07', admissionKind: 'autoAdmitted', isProtected: false },
    ] as const

    for (const entry of cases) {
      const transport = createMockAuthorizedAccountTransport()
      const outcome = await coordinateGuestSync(transport, {
        session: { accountId: ACCT_A },
        guest: {
          envelope: makeEmptyGuestEnvelope(),
          shelf: {
            months: [{
              yearMonth: parsePublicationYearMonth(entry.yearMonth)!,
              admissionKind: entry.admissionKind,
              isProtected: entry.isProtected,
              admittedOn: dNov05,
            }],
            activeFocusMonth: parsePublicationYearMonth(entry.yearMonth)!,
            updatedOn: dNov05,
          },
        },
        mode: 'newAccountTransfer',
      })

      assert.equal(outcome.ok, true)
      const storedEntry = transport.getStoredAccount(ACCT_A)?.data.shelf?.months[0]
      assert.equal(storedEntry?.admissionKind, entry.admissionKind)
      assert.equal(storedEntry?.isProtected, entry.isProtected)
      assert.equal(storedEntry?.admittedOn, dNov05)
      assert.equal(transport.getStoredAccount(ACCT_A)?.data.shelf?.activeFocusMonth, entry.yearMonth)
    }
  })

  test('coordinator leaves absent protection flags absent for both admission kinds', async () => {
    const transport = createMockAuthorizedAccountTransport()
    const outcome = await coordinateGuestSync(transport, {
      session: { accountId: ACCT_A },
      guest: {
        envelope: makeEmptyGuestEnvelope(),
        shelf: {
          months: [
            { yearMonth: parsePublicationYearMonth('2026-10')!, admissionKind: 'readerSelected' },
            { yearMonth: parsePublicationYearMonth('2026-09')!, admissionKind: 'autoAdmitted' },
            { yearMonth: parsePublicationYearMonth('2026-08')!, admissionKind: 'autoAdmitted' },
            { yearMonth: parsePublicationYearMonth('2026-07')!, admissionKind: 'readerSelected' },
          ],
        },
      },
      mode: 'newAccountTransfer',
    })

    assert.equal(outcome.ok, true)
    const months = transport.getStoredAccount(ACCT_A)?.data.shelf?.months
    assert.equal(months?.length, 3)
    assert.equal(Object.hasOwn(months?.[0] ?? {}, 'isProtected'), false)
    assert.equal(Object.hasOwn(months?.[1] ?? {}, 'isProtected'), false)
    assert.equal(Object.hasOwn(months?.[2] ?? {}, 'isProtected'), false)
    assert.ok(outcome.reconciliation?.ok && outcome.reconciliation.rejectedRecords.some(
      record => record.source === 'guest'
        && record.rawKey === '2026-07'
        && record.reason === 'shelfCapacityExceeded',
    ))
  })

  test('existing account protection wins a conflicting guest Shelf choice', async () => {
    const conflicts = [
      { yearMonth: '2026-10', admissionKind: 'readerSelected', accountProtected: true, guestProtected: false },
      { yearMonth: '2026-09', admissionKind: 'autoAdmitted', accountProtected: false, guestProtected: true },
    ] as const

    for (const conflict of conflicts) {
      const transport = createMockAuthorizedAccountTransport()
      const month = parsePublicationYearMonth(conflict.yearMonth)!
      transport.seedAccount({
        schemaVersion: 1,
        accountId: ACCT_A,
        namespace: 'cms',
        revision: 1,
        data: {
          completedChallenges: {},
          inProgressChallenges: {},
          savedChallenges: {},
          savedScriptures: [],
          lastOpenedChallenge: null,
          earnedAwards: {},
          shelf: {
            months: [{
              yearMonth: month,
              admissionKind: conflict.admissionKind,
              isProtected: conflict.accountProtected,
            }],
            activeFocusMonth: month,
          },
        },
      })

      const outcome = await coordinateGuestSync(transport, {
        session: { accountId: ACCT_A },
        guest: {
          envelope: makeEmptyGuestEnvelope(),
          shelf: {
            months: [{
              yearMonth: month,
              admissionKind: conflict.admissionKind,
              isProtected: conflict.guestProtected,
            }],
          },
        },
        mode: 'existingAccountMerge',
      })

      assert.equal(outcome.ok, true)
      assert.equal(
        transport.getStoredAccount(ACCT_A)?.data.shelf?.months[0]?.isProtected,
        conflict.accountProtected,
      )
      assert.equal(outcome.reconciliation?.ok && outcome.reconciliation.shelfConflicts.length, 0)
    }
  })

  test('invalid guest protection flag is rejected and prevents guest storage clearance', async () => {
    const transport = createMockAuthorizedAccountTransport()
    const accessor = new TestGuestStorageAccessor({
      envelope: makeEmptyGuestEnvelope(),
      shelf: {
        months: [{
          yearMonth: parsePublicationYearMonth('2026-10')!,
          admissionKind: 'readerSelected',
          isProtected: 'false',
        }],
      } as never,
    })

    const outcome = await coordinateGuestSync(
      transport,
      {
        session: { accountId: ACCT_A },
        guest: accessor,
        mode: 'newAccountTransfer',
      },
    )

    assert.equal(outcome.ok, true)
    assert.equal(outcome.reconciliation?.ok, true)
    if (outcome.reconciliation?.ok) {
      assert.ok(outcome.reconciliation.rejectedRecords.some(
        record => record.source === 'guest' && record.section === 'shelf' && record.reason === 'invalidShelfEntry',
      ))
    }
    assert.equal(outcome.guestClearanceDecision?.shouldClearGuestStorage, false)
    assert.equal(outcome.guestClearanceDecision?.reason, 'reconciliationRequiresRetention')
    assert.equal(outcome.guestCleared, false)
    assert.equal(accessor.clearCount, 0)
  })

  test('existing-account merge combines accomplishments, preserves existing account shelf, and advances revision', async () => {
    const transport = createMockAuthorizedAccountTransport()
    const existingAccount: ProposedAccountParticipationEnvelope = {
      schemaVersion: 1,
      accountId: ACCT_A,
      namespace: 'cms',
      revision: 3,
      data: {
        completedChallenges: {
          [c2]: { completedOn: dNov02, dateProvenance: 'serverVerified' },
        },
        inProgressChallenges: {},
        savedChallenges: {},
        savedScriptures: [],
        lastOpenedChallenge: null,
        earnedAwards: {},
        shelf: {
          months: [{ yearMonth: ym202611, admissionKind: 'readerSelected', admittedOn: dNov01 }],
          activeFocusMonth: ym202611,
        },
      },
    }
    transport.seedAccount(existingAccount)

    const guestEnvelope = makeGuestWithRecords()
    const accessor = new TestGuestStorageAccessor({
      envelope: guestEnvelope,
      shelf: {
        months: [{ yearMonth: parsePublicationYearMonth('2026-10')!, admissionKind: 'readerSelected' }],
      },
    })

    const coordinator = new GuestToAccountSyncCoordinator(transport)
    const outcome = await coordinator.sync({
      session: { accountId: ACCT_A },
      guest: accessor,
      mode: 'existingAccountMerge',
    })

    assert.equal(outcome.ok, true)
    assert.equal(outcome.status, 'committed')
    assert.equal(outcome.mode, 'existingAccountMerge')
    assert.equal(outcome.committedRevision, 4)
    assert.equal(outcome.guestCleared, true)

    const merged = transport.getStoredAccount(ACCT_A)!
    // Both c1 (from guest) and c2 (from account) exist
    assert.ok(merged.data.completedChallenges[c1])
    assert.ok(merged.data.completedChallenges[c2])
    // Existing shelf won over guest shelf
    assert.equal(merged.data.shelf?.months[0]?.yearMonth, ym202611)
  })

  test('auto mode selects existingAccountMerge when existing account has explicitly empty shelf ({ months: [] }), preserving account shelf precedence over guest shelf', async () => {
    const transport = createMockAuthorizedAccountTransport()
    const existingAccountWithEmptyShelf: ProposedAccountParticipationEnvelope = {
      schemaVersion: 1,
      accountId: ACCT_A,
      namespace: 'cms',
      revision: 2,
      data: {
        completedChallenges: {},
        inProgressChallenges: {},
        savedChallenges: {},
        savedScriptures: [],
        lastOpenedChallenge: null,
        earnedAwards: {},
        shelf: {
          months: [],
        },
      },
    }
    transport.seedAccount(existingAccountWithEmptyShelf)

    const guestEnvelope = makeGuestWithRecords()
    const accessor = new TestGuestStorageAccessor({
      envelope: guestEnvelope,
      shelf: {
        months: [{ yearMonth: parsePublicationYearMonth('2026-10')!, admissionKind: 'readerSelected' }],
      },
    })

    const outcome = await coordinateGuestSync(transport, {
      session: { accountId: ACCT_A },
      guest: accessor,
      mode: 'auto',
    })

    assert.equal(outcome.ok, true)
    assert.equal(outcome.status, 'committed')
    assert.equal(outcome.mode, 'existingAccountMerge')
    assert.equal(outcome.committedRevision, 3)
    assert.equal(outcome.guestCleared, true)
    assert.equal(accessor.clearCount, 1)

    // Stored account must retain the authoritative empty shelf
    const stored = transport.getStoredAccount(ACCT_A)!
    assert.ok(stored.data.shelf)
    assert.equal(stored.data.shelf.months.length, 0)
    // Underlying guest accomplishments must be preserved and merged
    assert.ok(stored.data.completedChallenges[c1])
    assert.ok(stored.data.inProgressChallenges[c2])
    assert.ok(stored.data.savedChallenges[c3])
    assert.equal(stored.data.savedScriptures.length, 1)
    assert.ok(stored.data.earnedAwards[awardThematic])

    // Shelf conflict was detected and guest month preserved in library not on shelf
    assert.ok(outcome.reconciliation)
    assert.equal(outcome.reconciliation.shelfConflicts.length, 1)
    assert.equal(outcome.reconciliation.shelfConflicts[0]?.yearMonth, parsePublicationYearMonth('2026-10')!)
    assert.equal(outcome.reconciliation.shelfConflicts[0]?.disposition, 'preservedInLibraryNotOnShelf')
  })

  test('auto mode selects newAccountTransfer when existing account has absent shelf and zero records, transferring guest shelf', async () => {
    const transport = createMockAuthorizedAccountTransport()
    const existingAccountWithAbsentShelf: ProposedAccountParticipationEnvelope = {
      schemaVersion: 1,
      accountId: ACCT_A,
      namespace: 'cms',
      revision: 1,
      data: {
        completedChallenges: {},
        inProgressChallenges: {},
        savedChallenges: {},
        savedScriptures: [],
        lastOpenedChallenge: null,
        earnedAwards: {},
        // shelf is undefined (absent)
      },
    }
    transport.seedAccount(existingAccountWithAbsentShelf)

    const guestEnvelope = makeGuestWithRecords()
    const accessor = new TestGuestStorageAccessor({
      envelope: guestEnvelope,
      shelf: {
        months: [{ yearMonth: parsePublicationYearMonth('2026-10')!, admissionKind: 'readerSelected' }],
      },
    })

    const outcome = await coordinateGuestSync(transport, {
      session: { accountId: ACCT_A },
      guest: accessor,
      mode: 'auto',
    })

    assert.equal(outcome.ok, true)
    assert.equal(outcome.status, 'committed')
    assert.equal(outcome.mode, 'newAccountTransfer')
    assert.equal(outcome.committedRevision, 2)
    assert.equal(outcome.guestCleared, true)

    // Stored account adopts the guest shelf because existing account had absent shelf
    const stored = transport.getStoredAccount(ACCT_A)!
    assert.ok(stored.data.shelf)
    assert.equal(stored.data.shelf.months.length, 1)
    assert.equal(stored.data.shelf.months[0]?.yearMonth, parsePublicationYearMonth('2026-10')!)
  })

  test('explicit newAccountTransfer rejects existing account with explicitly empty shelf ({ months: [] })', async () => {
    const transport = createMockAuthorizedAccountTransport()
    transport.seedAccount({
      schemaVersion: 1,
      accountId: ACCT_A,
      namespace: 'cms',
      revision: 1,
      data: {
        completedChallenges: {},
        inProgressChallenges: {},
        savedChallenges: {},
        savedScriptures: [],
        lastOpenedChallenge: null,
        earnedAwards: {},
        shelf: {
          months: [],
        },
      },
    })

    const accessor = new TestGuestStorageAccessor({ envelope: makeGuestWithRecords() })
    const outcome = await coordinateGuestSync(
      transport,
      { session: { accountId: ACCT_A }, guest: accessor, mode: 'newAccountTransfer' },
    )

    assert.equal(outcome.ok, false)
    assert.equal(outcome.status, 'reconciliationRejected')
    assert.equal(outcome.guestCleared, false)
    assert.equal(accessor.clearCount, 0)
  })

  test('isAccountEmpty correctly distinguishes explicit empty shelf from absent shelf and other preferences', () => {
    const baseEnvelope: ProposedAccountParticipationEnvelope = {
      schemaVersion: 1,
      accountId: ACCT_A,
      namespace: 'cms',
      revision: 1,
      data: {
        completedChallenges: {},
        inProgressChallenges: {},
        savedChallenges: {},
        savedScriptures: [],
        lastOpenedChallenge: null,
        earnedAwards: {},
      },
    }

    // Absent shelf + zero records -> truly empty
    assert.equal(isAccountEmpty(baseEnvelope), true)

    // Explicit empty shelf -> NOT empty
    const withEmptyShelf: ProposedAccountParticipationEnvelope = {
      ...baseEnvelope,
      data: {
        ...baseEnvelope.data,
        shelf: { months: [] },
      },
    }
    assert.equal(isAccountEmpty(withEmptyShelf), false)

    // Explicit empty shelf with active focus month -> NOT empty
    const withFocusMonth: ProposedAccountParticipationEnvelope = {
      ...baseEnvelope,
      data: {
        ...baseEnvelope.data,
        shelf: { months: [], activeFocusMonth: ym202611 },
      },
    }
    assert.equal(isAccountEmpty(withFocusMonth), false)

    // Absent shelf but has 1 completed challenge -> NOT empty
    const withCompletion: ProposedAccountParticipationEnvelope = {
      ...baseEnvelope,
      data: {
        ...baseEnvelope.data,
        completedChallenges: { [c1]: { completedOn: dNov01, dateProvenance: 'serverVerified' } },
      },
    }
    assert.equal(isAccountEmpty(withCompletion), false)
  })

  test('duplicate submission with same idempotency key returns cached receipt without bumping revision or corrupting data', async () => {
    const transport = createMockAuthorizedAccountTransport()
    const guestEnvelope = makeGuestWithRecords()
    const idempotencyKey = 'stable-idempotency-key-1'

    const accessor1 = new TestGuestStorageAccessor({ envelope: guestEnvelope })
    const outcome1 = await coordinateGuestSync(
      transport,
      {
        session: { accountId: ACCT_A },
        guest: accessor1,
      },
      { idempotencyKey },
    )
    assert.equal(outcome1.status, 'committed')
    assert.equal(outcome1.committedRevision, 1)
    assert.equal(accessor1.clearCount, 1)

    // Second sync with identical key and data
    const accessor2 = new TestGuestStorageAccessor({ envelope: guestEnvelope })
    const outcome2 = await coordinateGuestSync(
      transport,
      {
        session: { accountId: ACCT_A },
        guest: accessor2,
      },
      { idempotencyKey },
    )
    assert.equal(outcome2.ok, true)
    assert.equal(outcome2.status, 'alreadyCommittedDuplicate')
    assert.equal(outcome2.committedRevision, 1)
    assert.equal(outcome2.guestCleared, true)
    assert.equal(accessor2.clearCount, 1)

    // Remote account remains at revision 1
    const stored = transport.getStoredAccount(ACCT_A)!
    assert.equal(stored.revision, 1)
  })

  test('idempotency key reuse with differing payload rejects with conflict without mutating account', async () => {
    const transport = createMockAuthorizedAccountTransport()
    const idempotencyKey = 'shared-idempotency-key'

    const guest1 = makeGuestWithRecords()
    await coordinateGuestSync(
      transport,
      { session: { accountId: ACCT_A }, guest: { envelope: guest1 } },
      { idempotencyKey },
    )

    // Alter guest payload
    const guest2 = makeGuestWithRecords()
    guest2.data.completedChallenges[c3] = { completedOn: dNov05 }

    const outcome2 = await coordinateGuestSync(
      transport,
      { session: { accountId: ACCT_A }, guest: { envelope: guest2 } },
      { idempotencyKey },
    )

    assert.equal(outcome2.ok, false)
    assert.equal(outcome2.status, 'conflict')
    assert.equal(outcome2.guestCleared, false)
  })

  test('concurrent revision conflict automatically re-merges and succeeds on retry', async () => {
    const transport = createMockAuthorizedAccountTransport()
    let conflictInjected = false

    // Simulate an external writer modifying the account exactly when commit is first attempted
    transport.hooks.conflictOnCommit = () => {
      if (!conflictInjected) {
        conflictInjected = true
        return {
          schemaVersion: 1,
          accountId: ACCT_A,
          namespace: 'cms',
          revision: 1,
          data: {
            completedChallenges: {
              [c3]: { completedOn: dNov02, dateProvenance: 'serverVerified' },
            },
            inProgressChallenges: {},
            savedChallenges: {},
            savedScriptures: [],
            lastOpenedChallenge: null,
            earnedAwards: {},
          },
        }
      }
      return null
    }

    const guestEnvelope = makeGuestWithRecords()
    const accessor = new TestGuestStorageAccessor({ envelope: guestEnvelope })

    const outcome = await coordinateGuestSync(
      transport,
      {
        session: { accountId: ACCT_A },
        guest: accessor,
        mode: 'auto',
      },
      { maxRetries: 3 },
    )

    assert.equal(outcome.ok, true)
    assert.equal(outcome.status, 'committed')
    assert.equal(outcome.attempts, 2)
    assert.equal(outcome.committedRevision, 2)
    assert.equal(outcome.guestCleared, true)

    // Stored account holds accomplishments from both the external writer and the guest
    const stored = transport.getStoredAccount(ACCT_A)!
    assert.ok(stored.data.completedChallenges[c1]) // from guest
    assert.ok(stored.data.completedChallenges[c3]) // from external concurrent writer
  })

  test('persistent conflict exceeding maxRetries stops and preserves guest records intact', async () => {
    const transport = createMockAuthorizedAccountTransport()
    // Always simulate a conflict on every commit
    transport.hooks.conflictOnCommit = true

    const guestEnvelope = makeGuestWithRecords()
    const accessor = new TestGuestStorageAccessor({ envelope: guestEnvelope })

    const outcome = await coordinateGuestSync(
      transport,
      {
        session: { accountId: ACCT_A },
        guest: accessor,
      },
      { maxRetries: 2 },
    )

    assert.equal(outcome.ok, false)
    assert.equal(outcome.status, 'conflict')
    assert.equal(outcome.attempts, 2)
    assert.equal(outcome.guestCleared, false)
    assert.equal(accessor.clearCount, 0)
  })

  test('network failure during commit retries and recovers when retry succeeds', async () => {
    const transport = createMockAuthorizedAccountTransport()
    let commitFailedOnce = false

    transport.hooks.commitNetworkError = () => {
      if (!commitFailedOnce) {
        commitFailedOnce = true
        return true
      }
      return false
    }

    const guestEnvelope = makeGuestWithRecords()
    const accessor = new TestGuestStorageAccessor({ envelope: guestEnvelope })

    const outcome = await coordinateGuestSync(
      transport,
      { session: { accountId: ACCT_A }, guest: accessor },
      { maxRetries: 3 },
    )

    assert.equal(outcome.ok, true)
    assert.equal(outcome.status, 'committed')
    assert.equal(outcome.attempts, 2)
    assert.equal(outcome.guestCleared, true)
  })

  test('permanent network failure returns recoverable networkError and leaves guest data intact', async () => {
    const transport = createMockAuthorizedAccountTransport({
      hooks: { fetchNetworkError: true },
    })

    const guestEnvelope = makeGuestWithRecords()
    const accessor = new TestGuestStorageAccessor({ envelope: guestEnvelope })

    const outcome = await coordinateGuestSync(
      transport,
      { session: { accountId: ACCT_A }, guest: accessor },
      { maxRetries: 2 },
    )

    assert.equal(outcome.ok, false)
    assert.equal(outcome.status, 'networkError')
    assert.equal(outcome.guestCleared, false)
    assert.equal(accessor.clearCount, 0)
  })

  test('authorization failure halts immediately without retries and preserves guest records', async () => {
    const transport = createMockAuthorizedAccountTransport({
      hooks: { authError: 'expiredToken' },
    })

    const guestEnvelope = makeGuestWithRecords()
    const accessor = new TestGuestStorageAccessor({ envelope: guestEnvelope })

    const outcome = await coordinateGuestSync(
      transport,
      { session: { accountId: ACCT_A, expiresAt: Date.now() - 1000 }, guest: accessor },
      { maxRetries: 3 },
    )

    assert.equal(outcome.ok, false)
    assert.equal(outcome.status, 'authFailure')
    assert.equal(outcome.attempts, 1)
    assert.equal(outcome.guestCleared, false)
    assert.equal(accessor.clearCount, 0)
  })

  test('invalid session account ID fails closed with zero transport calls', async () => {
    const transport = createMockAuthorizedAccountTransport()
    const accessor = new TestGuestStorageAccessor({ envelope: makeGuestWithRecords() })

    const outcome = await coordinateGuestSync(
      transport,
      { session: { accountId: 'invalid account with spaces' as never }, guest: accessor },
    )

    assert.equal(outcome.ok, false)
    assert.equal(outcome.status, 'invalidSession')
    assert.equal(outcome.attempts, 0)
    assert.equal(transport.fetchCount, 0)
    assert.equal(transport.commitCount, 0)
    assert.equal(accessor.clearCount, 0)
  })

  test('target account with prior data rejects explicit newAccountTransfer and preserves guest data', async () => {
    const transport = createMockAuthorizedAccountTransport()
    transport.seedAccount({
      schemaVersion: 1,
      accountId: ACCT_A,
      namespace: 'cms',
      revision: 2,
      data: {
        completedChallenges: { [c1]: { completedOn: dNov01, dateProvenance: 'serverVerified' } },
        inProgressChallenges: {},
        savedChallenges: {},
        savedScriptures: [],
        lastOpenedChallenge: null,
        earnedAwards: {},
      },
    })

    const accessor = new TestGuestStorageAccessor({ envelope: makeGuestWithRecords() })
    const outcome = await coordinateGuestSync(
      transport,
      { session: { accountId: ACCT_A }, guest: accessor, mode: 'newAccountTransfer' },
    )

    assert.equal(outcome.ok, false)
    assert.equal(outcome.status, 'reconciliationRejected')
    assert.equal(outcome.guestCleared, false)
    assert.equal(accessor.clearCount, 0)
  })

  test('local in-flight mutation blocks guest clearance even after successful remote commit', async () => {
    const transport = createMockAuthorizedAccountTransport()
    const guestEnvelope = makeGuestWithRecords()

    // Accessor that mutates guest data while in-flight before clearance
    class MutatingGuestAccessor implements GuestStorageAccessor {
      private current: GuestReconciliationInput
      public clearCalled = false

      constructor(initial: GuestReconciliationInput) {
        this.current = JSON.parse(JSON.stringify(initial))
      }

      getSnapshot(): GuestReconciliationInput {
        // Mutate local state after initial snapshot is taken
        const copy = JSON.parse(JSON.stringify(this.current))
        const env = this.current.envelope as GuestParticipationEnvelopeV2
        env.data.completedChallenges[c3] = { completedOn: dNov05 }
        return copy
      }

      clearGuestStorage(): boolean {
        this.clearCalled = true
        return true
      }
    }

    const mutatingAccessor = new MutatingGuestAccessor({ envelope: guestEnvelope })

    const outcome = await coordinateGuestSync(
      transport,
      { session: { accountId: ACCT_A }, guest: mutatingAccessor },
    )

    assert.equal(outcome.ok, true)
    assert.equal(outcome.status, 'committed')
    assert.equal(outcome.guestClearanceDecision?.shouldClearGuestStorage, false)
    assert.equal(outcome.guestClearanceDecision?.reason, 'localGuestMutatedInFlight')
    assert.equal(outcome.guestCleared, false)
    assert.equal(mutatingAccessor.clearCalled, false)
  })

  test('unresolved reconciliation items unpersisted on server blocks guest clearance', async () => {
    const transport = createMockAuthorizedAccountTransport({
      hooks: { unresolvedPersistedOnServer: false },
    })

    // Account with inProgress on c2
    const accountEnvelope: ProposedAccountParticipationEnvelope = {
      schemaVersion: 1,
      accountId: ACCT_A,
      namespace: 'cms',
      revision: 1,
      data: {
        completedChallenges: {},
        inProgressChallenges: {
          [c2]: { screenId: 'screen-A', updatedOn: dNov01 },
        },
        savedChallenges: {},
        savedScriptures: [],
        lastOpenedChallenge: null,
        earnedAwards: {},
      },
    }
    transport.seedAccount(accountEnvelope)

    // Guest with disagreeing inProgress on c2 and no authoritative screen order
    const guestEnvelope = makeGuestWithRecords()
    guestEnvelope.data.inProgressChallenges[c2] = { screenId: 'screen-B', updatedOn: dNov02 }

    const accessor = new TestGuestStorageAccessor({ envelope: guestEnvelope })

    const outcome = await coordinateGuestSync(
      transport,
      {
        session: { accountId: ACCT_A },
        guest: accessor,
        mode: 'existingAccountMerge',
      },
    )

    assert.equal(outcome.ok, true)
    assert.equal(outcome.reconciliation?.status, 'reconciledWithUnresolved')
    assert.equal(outcome.guestClearanceDecision?.shouldClearGuestStorage, false)
    assert.equal(outcome.guestClearanceDecision?.reason, 'reconciliationRequiresRetention')
    assert.equal(outcome.guestCleared, false)
    assert.equal(accessor.clearCount, 0)
  })

  test('abort signal immediately cancels sync and preserves guest records', async () => {
    const transport = createMockAuthorizedAccountTransport()
    const controller = new AbortController()
    controller.abort()

    const accessor = new TestGuestStorageAccessor({ envelope: makeGuestWithRecords() })
    const outcome = await coordinateGuestSync(
      transport,
      { session: { accountId: ACCT_A }, guest: accessor },
      { signal: controller.signal },
    )

    assert.equal(outcome.ok, false)
    assert.equal(outcome.status, 'aborted')
    assert.equal(outcome.guestCleared, false)
    assert.equal(accessor.clearCount, 0)
  })

  test('privacy & security: no account IDs, UUIDs, or tokens leak into logged messages', async () => {
    const loggedMessages: string[] = []
    const logger: SyncLogger = {
      debug: (msg) => loggedMessages.push(msg),
      info: (msg) => loggedMessages.push(msg),
      warn: (msg) => loggedMessages.push(msg),
      error: (msg) => loggedMessages.push(msg),
    }

    const transport = createMockAuthorizedAccountTransport()
    const rawUuid = '550e8400-e29b-41d4-a716-446655440000'
    const bearer = 'Bearer super_secret_auth_token_value_123456'

    await coordinateGuestSync(
      transport,
      {
        session: { accountId: parseAccountId(rawUuid)!, token: bearer },
        guest: { envelope: makeGuestWithRecords() },
      },
      { logger },
    )

    assert.ok(loggedMessages.length > 0)
    for (const msg of loggedMessages) {
      assert.equal(msg.includes(rawUuid), false, `Account ID leaked in log: ${msg}`)
      assert.equal(msg.includes('super_secret_auth_token_value_123456'), false, `Secret token leaked in log: ${msg}`)
    }

    // Direct sanitizer checks
    assert.equal(
      sanitizeLogMessage(`User ${rawUuid} with Bearer secret-token-xyz failed`),
      'User [REDACTED_ACCOUNT_ID] with [REDACTED_TOKEN] failed',
    )
    assert.equal(maskAccountId(rawUuid), '[REDACTED_ACCOUNT_ID]')
  })

  test('strict dependency isolation: src/accountSync/** contains zero browser, react, capacitor, or node dependencies', () => {
    const files = ['reconcile.ts', 'types.ts', 'transport.ts', 'coordinator.ts', 'index.ts']
    for (const file of files) {
      const src = readFileSync(new URL(`../../src/accountSync/${file}`, import.meta.url), 'utf8')
      const codeOnly = src
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
          `Forbidden dependency or global "${forbidden}" found in src/accountSync/${file}`,
        )
      }
    }
  })
})
