import type {
  KeyValueStorageDriver,
  PersistenceHealth,
} from '../participation/persistence.ts'

/**
 * Moss Ledger (Issue #278, Ivory Sextant WP-07b / R06-F2 / AD-8).
 *
 * Durable, versioned reader-profile state for the future R06 shell. This module owns ONLY
 * presentation/onboarding preferences. It never reads or writes participation, earned Cards,
 * Scripture saves, Shelf, month-introduction or account-sync records.
 */

/** Durable storage key for the reader profile envelope. */
export const READER_PROFILE_STORAGE_KEY = 'bibleberry-reader-profile-v1'

/** Read-only legacy prototype preferences key (owned by legacy `src/App.tsx`). */
export const LEGACY_PROTOTYPE_STORAGE_KEY = 'bibleberry-prototype-v1'

export const READER_PROFILE_SCHEMA_VERSION = 1

/** Independent status shared by the App Introduction and the Guided App Tutorial (G06). */
export type OnboardingStepStatus = 'pending' | 'completed' | 'skipped'

/** `followSeasons` is the default; `chooseColors` keeps a manual palette year-round. */
export type AppearanceModeKind = 'followSeasons' | 'chooseColors'

export interface ReaderAppearance {
  readonly mode: AppearanceModeKind
  /**
   * Last manually chosen palette id. Required while `mode === 'chooseColors'`; retained while
   * following seasons so a reader can switch back to their prior manual choice. Palette values
   * are a deferred visual decision, so ids are opaque slugs.
   */
  readonly chosenPaletteId: string | null
}

/** Light/dark/system contrast preference, kept separate from palette selection (§8.3). */
export type ContrastMode = 'system' | 'light' | 'dark'

export type TextScale = 'compact' | 'default' | 'large'

export interface ReminderPreference {
  readonly enabled: boolean
  /** Local wall-clock time, `HH:MM` 24-hour. */
  readonly time: string
}

export interface ReaderProfile {
  readonly introStatus: OnboardingStepStatus
  readonly tutorialStatus: OnboardingStepStatus
  /** Permanent once true; there is intentionally no un-dismiss operation. */
  readonly guestInviteDismissed: boolean
  readonly appearance: ReaderAppearance
  readonly contrastMode: ContrastMode
  readonly textScale: TextScale
  readonly reminder: ReminderPreference
}

export interface ReaderProfileEnvelopeV1 {
  readonly schemaVersion: 1
  readonly profile: ReaderProfile
  /** Provenance of the first durable write: fresh defaults or the one-time legacy migration. */
  readonly origin: ReaderProfileOrigin
}

export type ReaderProfileOrigin = 'defaults' | 'legacyPrototypeMigration'

export type ReaderProfileHealth = PersistenceHealth

/**
 * Where the returned profile came from:
 * - `stored`: a valid durable profile envelope.
 * - `migratedLegacy`: built from `bibleberry-prototype-v1` on this load.
 * - `defaults`: fresh defaults (no profile, no usable legacy), or a safe fallback after a failure.
 */
export type ReaderProfileSource = 'stored' | 'migratedLegacy' | 'defaults'

export interface ReaderProfileDiagnostic {
  readonly field: string
  readonly reason: string
}

export interface ReaderProfileLoadResult {
  readonly profile: ReaderProfile
  readonly health: ReaderProfileHealth
  readonly source: ReaderProfileSource
  /** True when the returned profile is known to be durably stored under the profile key. */
  readonly persisted: boolean
  readonly diagnostics: readonly ReaderProfileDiagnostic[]
}

export type ReaderProfileUpdateError =
  | 'invalidValue'
  | 'corruptStoredData'
  | 'unsupportedNewerSchema'
  | 'storageUnavailable'
  | 'writeFailed'

export type ReaderProfileUpdateResult =
  | {
      readonly ok: true
      readonly profile: ReaderProfile
      readonly changed: boolean
    }
  | {
      readonly ok: false
      readonly error: ReaderProfileUpdateError
      /** Best-known current profile (unchanged by the failed update). */
      readonly profile: ReaderProfile
      readonly message: string
    }

export type ReaderProfileRecoveryResult =
  | { readonly ok: true; readonly profile: ReaderProfile }
  | {
      readonly ok: false
      readonly error: 'notCorrupt' | 'unsupportedNewerSchema' | 'storageUnavailable' | 'writeFailed'
      readonly message: string
    }

/** A validated partial change; every provided field is checked at runtime before writing. */
export interface ReaderProfilePatch {
  readonly introStatus?: OnboardingStepStatus
  readonly tutorialStatus?: OnboardingStepStatus
  readonly guestInviteDismissed?: true
  readonly appearance?: ReaderAppearance
  readonly contrastMode?: ContrastMode
  readonly textScale?: TextScale
  readonly reminder?: ReminderPreference
}

export interface ReaderProfileStoreOptions {
  readonly driver: KeyValueStorageDriver
  /**
   * Source of legacy prototype settings. On native builds the legacy `App.tsx` wrote to the
   * WebView `localStorage`, not Capacitor Preferences, so this is injected separately.
   * Omit (or pass `null`) to disable legacy migration.
   */
  readonly legacyDriver?: KeyValueStorageDriver | null
  readonly storageKey?: string
  readonly legacyStorageKey?: string
}
