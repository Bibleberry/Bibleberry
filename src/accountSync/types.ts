import type {
  CanonicalAwardId,
  CanonicalChallengeId,
  ChallengeIdentityNamespace,
  ChallengeResumeRecord,
  ChallengeScreenId,
  CompletedChallengeRecord,
  EarnedAwardRecord,
  EarnedScriptureCardSnapshot,
  GuestParticipationEnvelopeV1,
  GuestParticipationEnvelopeV2,
  GuestParticipationEnvelopeV3,
  LastOpenedChallengePointer,
  LocalCalendarDate,
  MonthlyAwardKind,
  PublicationYearMonth,
  ReaderParticipationData,
  SavedChallengeRecord,
  SavedScriptureKey,
  SavedScriptureRecord,
} from '../participation/types.ts'

/**
 * Isolated, platform-neutral types for R13-0 account reconciliation proof.
 *
 * Architectural boundary:
 * - Reuses accepted V2 participation domain types from `../participation/types.ts` without
 *   modifying any accepted V2 file or wiring account shapes into the live guest store.
 * - Proposed future R13 account / Shelf / provenance structures are explicitly prefixed or
 *   documented as `Proposed*` contracts pending live Supabase R13-1+ implementation.
 */

// ---------------------------------------------------------------------------
// Proposed R13 Account Identity & Provenance Types (Not yet in live storage)
// ---------------------------------------------------------------------------

/** Validated canonical account identifier (e.g., Supabase `auth.users.id` UUID). */
export type AccountId = string & { readonly __brand: 'AccountId' }

/** Whether a completion or award date was verified by server authority or reported by a client. */
export type DateProvenance = 'serverVerified' | 'clientReported'

/** Proposed Shelf month admission classification from the Nov 8 product model. */
export type ProposedAccountShelfAdmissionKind = 'readerSelected' | 'autoAdmitted'

/** Proposed historical Shelf entry (max 3 months per account; current month is separate). */
export interface ProposedAccountShelfEntry {
  readonly yearMonth: PublicationYearMonth
  readonly admissionKind: ProposedAccountShelfAdmissionKind
  readonly isProtected?: boolean
  readonly admittedOn?: LocalCalendarDate
}

/**
 * Proposed future Shelf state. Current V2 guest storage does not yet persist Shelf selections;
 * this isolated contract allows proving existing-account Shelf precedence without modifying V2.
 */
export interface ProposedAccountShelfState {
  readonly months: readonly ProposedAccountShelfEntry[]
  readonly activeFocusMonth?: PublicationYearMonth | null
  readonly updatedOn?: LocalCalendarDate
}

/** Proposed account-bound Challenge completion record with date provenance. */
export interface ProposedAccountCompletedChallengeRecord extends CompletedChallengeRecord {
  readonly dateProvenance: DateProvenance
  readonly clientClaimedOn?: LocalCalendarDate
}

/** Proposed account-bound earned Scripture Card record with date provenance. */
export interface ProposedAccountEarnedAwardRecord extends EarnedAwardRecord {
  readonly dateProvenance: DateProvenance
  readonly clientClaimedOn?: LocalCalendarDate
}

/** Proposed account-bound participation payload mirroring V2 plus provenance and Shelf state. */
export interface ProposedAccountParticipationData {
  readonly completedChallenges: Readonly<Record<string, ProposedAccountCompletedChallengeRecord>>
  readonly inProgressChallenges: Readonly<Record<string, ChallengeResumeRecord>>
  readonly savedChallenges: Readonly<Record<string, SavedChallengeRecord>>
  readonly savedScriptures: readonly SavedScriptureRecord[]
  readonly lastOpenedChallenge: LastOpenedChallengePointer | null
  readonly earnedAwards: Readonly<Record<string, ProposedAccountEarnedAwardRecord>>
  readonly shelf?: ProposedAccountShelfState
}

export const SUPPORTED_ACCOUNT_SCHEMA_VERSION = 1 as const

/** Proposed durable account envelope (schemaVersion: 1; future versions fail closed). */
export interface ProposedAccountParticipationEnvelope {
  readonly schemaVersion: typeof SUPPORTED_ACCOUNT_SCHEMA_VERSION | number
  readonly accountId: string
  readonly namespace: ChallengeIdentityNamespace
  readonly revision: number
  readonly data: ProposedAccountParticipationData
}

// ---------------------------------------------------------------------------
// Reconciliation Input & Context Contracts
// ---------------------------------------------------------------------------

export type SupportedGuestEnvelope =
  | GuestParticipationEnvelopeV1
  | GuestParticipationEnvelopeV2
  | GuestParticipationEnvelopeV3

/**
 * Guest reconciliation input wrapper. Accepts a V1–V3 guest envelope plus
 * optional isolated future Shelf state and explicit namespace claim for boundary verification.
 */
export interface GuestReconciliationInput {
  readonly envelope: SupportedGuestEnvelope | { readonly schemaVersion: number; readonly data: unknown }
  readonly namespace?: ChallengeIdentityNamespace
  readonly shelf?: ProposedAccountShelfState
}

export type ReconciliationMode = 'newAccountTransfer' | 'existingAccountMerge'

export interface ReconciliationContext {
  /** Authenticated account ID from server session (`auth.uid()` in live R13). */
  readonly expectedAccountId: string
  /** Target participation namespace; defaults to `'cms'`. */
  readonly expectedNamespace?: ChallengeIdentityNamespace
  /** Authoritative server-determined local calendar date (`Option 1C` / R08A-0). */
  readonly serverAuthorizedLocalDate?: LocalCalendarDate
  /** Global `UTC+14` (`Pacific/Kiritimati`) date ceiling; no credible date may exceed this. */
  readonly maxCredibleDateUtcPlus14?: LocalCalendarDate
  /** Provenance assigned to guest-supplied dates; defaults to `'clientReported'`. */
  readonly guestDateProvenance?: DateProvenance
  /** Explicit editorial alias map (`previousChallengeId -> replacementChallengeId`). */
  readonly challengeAliases?: Readonly<Record<string, string>>
  /**
   * Authoritative Challenge screen order (`screen._key[]`) used ONLY to decide furthest reading
   * position when both sides hold distinct in-progress `screenId`s. Never inferred from strings.
   */
  readonly screenOrderByChallenge?: Readonly<Record<string, readonly ChallengeScreenId[]>>
  /** Optional release-date floor per Challenge (`slot.date`); dates before floor are inadmissible. */
  readonly challengeMinReleaseDate?: Readonly<Record<string, LocalCalendarDate>>
  /** Optional minimum earn-date floor per Award (defaults to `${publicationYearMonth}-01`). */
  readonly awardMinEarnDate?: Readonly<Record<string, LocalCalendarDate>>
  /** Client-generated idempotency key for retry-safe transfer/merge tracking. */
  readonly idempotencyKey?: string
}

export interface ReconcileGuestIntoAccountInput {
  readonly mode: ReconciliationMode
  readonly guest: GuestReconciliationInput
  readonly account: ProposedAccountParticipationEnvelope
  readonly context: ReconciliationContext
}

// ---------------------------------------------------------------------------
// Typed Diagnostics, Shelf Conflicts & Explicit Unresolved Outcomes
// ---------------------------------------------------------------------------

export type UnresolvedReconciliationItem =
  | {
      readonly kind: 'undecidableReadingPosition'
      readonly challengeId: CanonicalChallengeId
      readonly accountPosition: ChallengeResumeRecord
      readonly guestPosition: ChallengeResumeRecord
      readonly retainedPosition: ChallengeResumeRecord
      readonly reason: 'missingAuthoritativeScreenOrder' | 'unknownScreenIdInOrder'
    }
  | {
      readonly kind: 'awardDateProvenanceConflict'
      readonly awardId: CanonicalAwardId
      readonly serverVerifiedDate: LocalCalendarDate
      readonly clientClaimedDate: LocalCalendarDate
      readonly retainedDate: LocalCalendarDate
      readonly reason: 'unverifiedClientDatePrecedesServerVerified'
    }
  | {
      readonly kind: 'undecidableAwardDateProvenance'
      readonly awardId: CanonicalAwardId
      readonly candidateDates: readonly LocalCalendarDate[]
      readonly retainedDate: LocalCalendarDate
      readonly reason: 'disagreeingUnverifiedClientDates'
    }
  | {
      readonly kind: 'completionDateProvenanceConflict'
      readonly challengeId: CanonicalChallengeId
      readonly serverVerifiedDate: LocalCalendarDate
      readonly clientClaimedDate: LocalCalendarDate
      readonly retainedDate: LocalCalendarDate
      readonly reason: 'unverifiedClientDatePrecedesServerVerified'
    }
  | {
      readonly kind: 'undecidableCompletionDateProvenance'
      readonly challengeId: CanonicalChallengeId
      readonly candidateDates: readonly LocalCalendarDate[]
      readonly retainedDate: LocalCalendarDate
      readonly reason: 'disagreeingUnverifiedClientDates'
    }
  | {
      readonly kind: 'inadmissibleDateClaim'
      readonly entityKind: 'challengeCompletion' | 'earnedAward'
      readonly entityId: string
      readonly source: 'account' | 'guest'
      readonly claimedDate: LocalCalendarDate
      readonly minAllowedDate?: LocalCalendarDate
      readonly maxAllowedDate?: LocalCalendarDate
      readonly reason: 'beforeAvailabilityFloor' | 'afterServerUtcPlus14Ceiling'
    }

export interface RejectedRecordDiagnostic {
  readonly source: 'account' | 'guest'
  readonly section:
    | 'completedChallenges'
    | 'inProgressChallenges'
    | 'savedChallenges'
    | 'savedScriptures'
    | 'lastOpenedChallenge'
    | 'earnedAwards'
    | 'shelf'
  readonly rawKey: string
  readonly reason:
    | 'crossNamespaceOrForbiddenId'
    | 'invalidChallengeId'
    | 'invalidCalendarDate'
    | 'invalidAwardIdOrMismatchedParts'
    | 'invalidScriptureInput'
    | 'invalidShelfEntry'
    | 'shelfCapacityExceeded'
    | 'invalidRecordShape'
}

export interface ShelfConflictResolutionNotice {
  readonly yearMonth: PublicationYearMonth
  readonly guestAdmissionKind: ProposedAccountShelfAdmissionKind
  readonly disposition: 'preservedInLibraryNotOnShelf'
}

export type ReconciliationRejectionReason =
  | 'unsupportedGuestSchemaVersion'
  | 'unsupportedAccountSchemaVersion'
  | 'invalidGuestEnvelope'
  | 'invalidAccountEnvelope'
  | 'invalidAccountId'
  | 'accountOwnershipMismatch'
  | 'crossNamespaceConflict'
  | 'nonEmptyAccountForNewTransfer'

export type ReconciliationResult =
  | {
      readonly ok: true
      readonly status: 'clean' | 'reconciledWithUnresolved'
      readonly mode: ReconciliationMode
      readonly idempotencyKey?: string
      readonly guestPayloadFingerprint: string
      readonly mergedAccount: ProposedAccountParticipationEnvelope
      readonly changedFromAccount: boolean
      readonly unresolvedItems: readonly UnresolvedReconciliationItem[]
      readonly shelfConflicts: readonly ShelfConflictResolutionNotice[]
      readonly rejectedRecords: readonly RejectedRecordDiagnostic[]
      readonly appliedAliases: Readonly<Record<string, CanonicalChallengeId>>
      readonly guestClearanceEligible: boolean
    }
  | {
      readonly ok: false
      readonly status: 'rejected'
      readonly reason: ReconciliationRejectionReason
      readonly message: string
      readonly guestClearanceEligible: false
    }

// ---------------------------------------------------------------------------
// Crash / Network Interruption & Guest Clearance Acknowledgment Types
// ---------------------------------------------------------------------------

export interface CommitAckReceipt {
  readonly ok: boolean
  readonly status: 'committed' | 'alreadyCommittedDuplicate' | 'failed'
  readonly accountId: string
  readonly idempotencyKey: string
  readonly committedGuestFingerprint: string
  readonly durableRevision: number
  readonly unresolvedCount: number
  readonly unresolvedPersistedOnServer: boolean
}

export type GuestClearanceBlockReason =
  | 'verifiedDurableCommit'
  | 'reconciliationRequiresRetention'
  | 'fingerprintMismatchWithReconciliation'
  | 'missingReceipt'
  | 'commitFailed'
  | 'invalidAccountId'
  | 'accountIdMismatch'
  | 'idempotencyKeyMismatch'
  | 'fingerprintMismatchWithReceipt'
  | 'localGuestMutatedInFlight'
  | 'invalidRevision'
  | 'unresolvedNotPersistedOnServer'

export interface GuestClearanceDecision {
  readonly shouldClearGuestStorage: boolean
  readonly reason: GuestClearanceBlockReason
}

// Re-exported participation types for consumer convenience
export type {
  CanonicalAwardId,
  CanonicalChallengeId,
  ChallengeIdentityNamespace,
  ChallengeResumeRecord,
  ChallengeScreenId,
  CompletedChallengeRecord,
  EarnedAwardRecord,
  EarnedScriptureCardSnapshot,
  GuestParticipationEnvelopeV1,
  GuestParticipationEnvelopeV2,
  GuestParticipationEnvelopeV3,
  LastOpenedChallengePointer,
  LocalCalendarDate,
  MonthlyAwardKind,
  PublicationYearMonth,
  ReaderParticipationData,
  SavedChallengeRecord,
  SavedScriptureKey,
  SavedScriptureRecord,
}
