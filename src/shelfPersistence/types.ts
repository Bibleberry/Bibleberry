import type {
  LocalCalendarDate,
  PublicationYearMonth,
} from '../participation/types.ts'
import type {
  KeyValueStorageDriver,
  MaybePromise,
  PersistenceHealth,
} from '../participation/persistence.ts'
import type {
  MonthlyRolloverParams,
  PutAwayShelfMonthParams,
  RolloverDisposition,
  SelectShelfMonthParams,
  SetActiveFocusMonthParams,
  SetShelfMonthProtectionParams,
  ShelfState,
} from '../shelf/types.ts'
import type { ShelfValidationDiagnostic } from '../shelf/validation.ts'

/**
 * Persistence contracts for durable guest Shelf state (Phase 05 / R08-5 / Issue #162).
 *
 * Boundary rules:
 * - Isolated storage key (`GUEST_SHELF_STORAGE_KEY`), strictly separate from
 *   `GUEST_PARTICIPATION_STORAGE_KEY` (`bibleberry-reader-participation-v1`).
 * - Zero direct `window`, `localStorage`, or React dependencies.
 * - Composes `ShelfState` from `src/shelf/types.ts` without modifying it.
 */

export const SHELF_ENVELOPE_SCHEMA_VERSION = 1 as const

export const GUEST_SHELF_STORAGE_KEY = 'bibleberry-guest-shelf-v1' as const

/**
 * Persisted rollover watermark stored alongside `ShelfState` in the persistence
 * envelope so repeated `evaluateMonthlyRollover` calls for the same
 * `(newCurrentYearMonth, endingYearMonth)` remain idempotent even if the
 * reader later puts away an auto-admitted month or all slots were protected.
 */
export interface ShelfRolloverWatermark {
  readonly lastNewCurrentYearMonth: PublicationYearMonth
  readonly lastEndingYearMonth: PublicationYearMonth
  readonly lastDisposition: RolloverDisposition
}

export interface GuestShelfEnvelopeV1 {
  readonly schemaVersion: typeof SHELF_ENVELOPE_SCHEMA_VERSION
  readonly state: ShelfState
  readonly rolloverWatermark?: ShelfRolloverWatermark
}

export interface GuestShelfPersistedPayload {
  readonly state: ShelfState
  readonly rolloverWatermark: ShelfRolloverWatermark | null
}

export type ShelfCommand =
  | {
      readonly type: 'select'
      readonly params: SelectShelfMonthParams
    }
  | {
      readonly type: 'putAway'
      readonly params: PutAwayShelfMonthParams | PublicationYearMonth | string
    }
  | {
      readonly type: 'setProtection'
      readonly params: SetShelfMonthProtectionParams
    }
  | {
      readonly type: 'setFocus'
      readonly params: SetActiveFocusMonthParams | PublicationYearMonth | string | null
    }
  | {
      readonly type: 'clearFocus'
      readonly updatedOn?: LocalCalendarDate
    }
  | {
      readonly type: 'monthlyRollover'
      readonly params: MonthlyRolloverParams
    }
  | {
      readonly type: 'applyValidatedState'
      readonly state: ShelfState
      readonly referenceCurrentMonth?: PublicationYearMonth | string
    }

export interface ShelfAdapterLoadResult {
  readonly payload: GuestShelfPersistedPayload
  readonly health: PersistenceHealth
  readonly diagnostics?: readonly ShelfValidationDiagnostic[]
}

export type ShelfAdapterFlushResult =
  | {
      readonly ok: true
      readonly committedPayload: GuestShelfPersistedPayload
      readonly health: 'ok'
    }
  | {
      readonly ok: false
      readonly committedPayload: GuestShelfPersistedPayload | null
      readonly health: Exclude<PersistenceHealth, 'ok'>
    }

export interface ShelfAdapterClearResult {
  readonly ok: boolean
  readonly health: PersistenceHealth
}

export interface ShelfPersistenceAdapter {
  load(): MaybePromise<ShelfAdapterLoadResult>
  flushCommands(
    commands: readonly ShelfCommand[],
    fallbackBase: GuestShelfPersistedPayload,
    signal?: AbortSignal,
  ): MaybePromise<ShelfAdapterFlushResult>
  clear(): MaybePromise<ShelfAdapterClearResult>
  subscribeExternalChanges?(listener: () => void): () => void
}

export interface CreateShelfPersistenceAdapterOptions {
  readonly driver: KeyValueStorageDriver
  readonly storageKey?: string
  readonly referenceCurrentMonth?: PublicationYearMonth | string
}
