/**
 * Platform-neutral domain types for durable reader participation state (Track A, A3 / Issue #46;
 * extended for R14-3 durable guest Scripture Card award records & V1→V2 migration).
 *
 * Scope invariants:
 * - Zero browser (`window`, `localStorage`) or framework imports.
 * - Minimal accomplishment, resume, and earned-award records only — no behavioral event logs,
 *   reading timers, attendance streaks, or memorization-specific state.
 * - Saved Scripture and earned Card snapshots never store Bible passage manuscript text or raw
 *   private Sanity documents.
 */

export type ChallengeIdentityNamespace = 'cms' | 'pilot'

/**
 * Validated canonical Challenge identity:
 * - Production store (`'cms'`): `cms:<publishedSanityBaseId>`
 * - Isolated persistence pilot (`'pilot'`): `pilot:<syntheticSampleId>`
 */
export type CanonicalChallengeId = string & { readonly __brand: 'CanonicalChallengeId' }

/** Stable screen identity within a single Challenge (Sanity `screen._key`), never an array index. */
export type ChallengeScreenId = string

/** Reader's local calendar date formatted as `YYYY-MM-DD`. */
export type LocalCalendarDate = string & { readonly __brand: 'LocalCalendarDate' }

/** Publication calendar month formatted as `YYYY-MM`. */
export type PublicationYearMonth = string & { readonly __brand: 'PublicationYearMonth' }

/**
 * Validated canonical monthly Scripture Card award identity:
 * - `card:monthly:YYYY-MM:<discovery-slug>`
 * - `card:monthly:YYYY-MM:full-month`
 */
export type CanonicalAwardId = string & { readonly __brand: 'CanonicalAwardId' }

export type MonthlyAwardKind = 'thematic' | 'fullMonth'

/** Deterministic normalized Scripture deduplication key: `<normalizedReference>|<normalizedTranslationOrEmpty>`. */
export type SavedScriptureKey = string & { readonly __brand: 'SavedScriptureKey' }

export interface CompletedChallengeRecord {
  /** Immutable local calendar date of the reader's first explicit completion. */
  readonly completedOn: LocalCalendarDate
}

export interface ChallengeResumeRecord {
  /**
   * Current stable screen `_key` within an uncompleted Challenge (including Screen 1's `_key`),
   * or `undefined` for started single-surface / non-screened Challenge formats.
   */
  readonly screenId?: ChallengeScreenId
  readonly updatedOn: LocalCalendarDate
  /** Relative order of explicitly tracked reader progress within local unfinished Challenges. */
  readonly interruptionOrder?: number
}

export interface SavedChallengeRecord {
  readonly savedOn: LocalCalendarDate
}

export interface SavedScriptureInput {
  readonly reference: string
  /** Explicit translation code (e.g. `'WEBP'`, `'NIV'`); `'Not configured'` or blank normalizes to `null`. */
  readonly translation?: string | null
  readonly sourceChallengeId?: CanonicalChallengeId
}

export interface SavedScriptureRecord {
  readonly key: SavedScriptureKey
  /** Trimmed display citation as authored (e.g. `'1 Thessalonians 5:16–18'`). Passage text is never stored. */
  readonly reference: string
  /** Explicit translation label, or `null` when unspecified / reference-only `'Not configured'`. */
  readonly translation: string | null
  readonly savedOn: LocalCalendarDate
  /** Optional provenance when saved from inside an admitted Challenge; omitted otherwise. */
  readonly sourceChallengeId?: CanonicalChallengeId
}

export interface LastOpenedChallengePointer {
  readonly challengeId: CanonicalChallengeId
  readonly openedOn: LocalCalendarDate
  readonly resumeDismissedOn?: LocalCalendarDate
}

/**
 * Validated earned Scripture Card display snapshot captured from R14-2 `GatewayEarnedScriptureCard`.
 * Stores display, accessibility, citation, and rights metadata needed for collections — never
 * Bible passage manuscript text or raw Sanity documents.
 */
export interface EarnedScriptureCardSnapshot {
  readonly cardDocumentId: string
  readonly title: string
  readonly publicationYearMonth: PublicationYearMonth
  readonly imageUrl: string
  readonly assetRevision: string
  readonly illustrationAlt: string
  readonly accessibleTranscription: string
  readonly scripture: {
    readonly book: string
    readonly reference: string
    readonly translation: string
  }
  readonly attribution: string
  readonly rightsStatus: string
  readonly shareEligible: boolean
  readonly theologicalThemes?: readonly string[]
  readonly keywords?: readonly string[]
}

export interface EarnedAwardRecord {
  readonly awardId: CanonicalAwardId
  readonly kind: MonthlyAwardKind
  readonly publicationYearMonth: PublicationYearMonth
  readonly discoveryId: string
  /** Immutable local calendar date when earning was first validly observed (`YYYY-MM-DD`). */
  readonly earnedOn: LocalCalendarDate
  /** Monotonic Hub combined-announcement acknowledgment marker (independent of `cardViewed`). */
  readonly hubAnnouncementAcked: boolean
  /** Monotonic individual Card open/viewed marker (independent of `hubAnnouncementAcked`). */
  readonly cardViewed: boolean
  /** Editorial `card-<slug>` document ID stored separately from award identity, if known. */
  readonly cardDocumentId?: string
  /** Optional validated R14-2 Card display snapshot; omitted if image payload was absent/invalid. */
  readonly earnedCard?: EarnedScriptureCardSnapshot
}

export interface EarnedAwardInput {
  readonly awardId: CanonicalAwardId
  readonly discoveryId: string
  readonly earnedOn: LocalCalendarDate
  readonly cardDocumentId?: string
  readonly earnedCard?: EarnedScriptureCardSnapshot
}

export interface ReaderParticipationDataV1 {
  readonly completedChallenges: Readonly<Record<string, CompletedChallengeRecord>>
  readonly inProgressChallenges: Readonly<Record<string, ChallengeResumeRecord>>
  readonly savedChallenges: Readonly<Record<string, SavedChallengeRecord>>
  /** Ordered from earliest saved to most recently saved; every `key` is unique. */
  readonly savedScriptures: readonly SavedScriptureRecord[]
  readonly lastOpenedChallenge: LastOpenedChallengePointer | null
}

export interface ReaderParticipationDataV2 extends ReaderParticipationDataV1 {
  readonly earnedAwards: Readonly<Record<string, EarnedAwardRecord>>
}

export interface ReaderParticipationData extends ReaderParticipationDataV2 {
  /** Award IDs acknowledged by entering the Field Notebook. Absence means none. */
  readonly notebookAcknowledgedAwardIds?: readonly CanonicalAwardId[]
}

export interface GuestParticipationEnvelopeV1 {
  readonly schemaVersion: 1
  readonly data: ReaderParticipationDataV1
}

export interface GuestParticipationEnvelopeV2 {
  readonly schemaVersion: 2
  readonly data: ReaderParticipationDataV2
}

export interface GuestParticipationEnvelopeV3 {
  readonly schemaVersion: 3
  readonly data: ReaderParticipationData
}

export type ChallengeParticipationStatus = 'notStarted' | 'inProgress' | 'completed'

export interface ChallengeParticipationView {
  readonly challengeId: CanonicalChallengeId
  readonly status: ChallengeParticipationStatus
  readonly isCompleted: boolean
  readonly completedOn?: LocalCalendarDate
  readonly isInProgress: boolean
  /** Saved uncompleted resume screen ID, if any. Completed Challenges omit durable resume screen IDs. */
  readonly resumeScreenId?: ChallengeScreenId
  readonly isSaved: boolean
  readonly savedOn?: LocalCalendarDate
  readonly isLastOpened: boolean
}

export type ParticipationCommand =
  | {
      readonly type: 'recordChallengeOpened'
      readonly challengeId: CanonicalChallengeId
      readonly openedOn: LocalCalendarDate
    }
  | {
      readonly type: 'dismissResumePrompt'
      readonly dismissedOn: LocalCalendarDate
    }
  | {
      readonly type: 'saveChallengeProgress'
      readonly challengeId: CanonicalChallengeId
      readonly screenId?: ChallengeScreenId
      readonly updatedOn: LocalCalendarDate
      readonly trackInterruption?: boolean
    }
  | {
      readonly type: 'setChallengeSaved'
      readonly challengeId: CanonicalChallengeId
      readonly saved: boolean
      readonly savedOn: LocalCalendarDate
    }
  | {
      readonly type: 'setScriptureSaved'
      readonly scripture: SavedScriptureInput
      readonly saved: boolean
      readonly savedOn: LocalCalendarDate
    }
  | {
      readonly type: 'completeChallenge'
      readonly challengeId: CanonicalChallengeId
      readonly completedOn: LocalCalendarDate
    }
  | {
      readonly type: 'reconcileChallengeAliases'
      /** Explicit trusted editorial alias map: `previousChallengeId -> replacementChallengeId`. */
      readonly aliases: Readonly<Record<string, CanonicalChallengeId>>
    }
  | {
      readonly type: 'recordEarnedAwards'
      readonly awards: readonly EarnedAwardInput[]
    }
  | {
      readonly type: 'markEarnedCardViewed'
      readonly awardId: CanonicalAwardId
    }
  | {
      readonly type: 'acknowledgeAwardAnnouncements'
      readonly awardIds: readonly CanonicalAwardId[]
    }
  | {
      readonly type: 'acknowledgeNotebookEntry'
      /** Capture the award IDs at entry so persistence replay cannot acknowledge later awards. */
      readonly awardIds: readonly CanonicalAwardId[]
    }
