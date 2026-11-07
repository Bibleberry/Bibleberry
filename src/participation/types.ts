/**
 * Platform-neutral domain types for durable reader participation state (Track A, A3 / Issue #46).
 *
 * Scope invariants:
 * - Zero browser (`window`, `localStorage`) or framework imports.
 * - Minimal accomplishment & resume records only — no behavioral event logs, reading timers,
 *   attendance streaks, achievement awards, or memorization-specific state.
 * - Saved Scripture stores normalized reference/translation/provenance metadata only — never
 *   Bible passage text.
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

export interface ReaderParticipationData {
  readonly completedChallenges: Readonly<Record<string, CompletedChallengeRecord>>
  readonly inProgressChallenges: Readonly<Record<string, ChallengeResumeRecord>>
  readonly savedChallenges: Readonly<Record<string, SavedChallengeRecord>>
  /** Ordered from earliest saved to most recently saved; every `key` is unique. */
  readonly savedScriptures: readonly SavedScriptureRecord[]
  readonly lastOpenedChallenge: LastOpenedChallengePointer | null
}

export interface GuestParticipationEnvelopeV1 {
  readonly schemaVersion: 1
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
