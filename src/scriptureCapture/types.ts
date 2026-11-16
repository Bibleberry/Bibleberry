import type { AdmittedChallenge } from '../participation/admission.ts'
import type { PersistenceHealth } from '../participation/persistence.ts'
import type {
  CanonicalChallengeId,
  ChallengeIdentityNamespace,
  LocalCalendarDate,
  SavedScriptureKey,
  SavedScriptureRecord,
} from '../participation/types.ts'

/**
 * Typed Scripture capture contracts for reusable app-wide Save Scripture controls (R09-2).
 *
 * Scope & safety invariants:
 * - Zero browser (`window`, `document`, `localStorage`) or React dependencies.
 * - Stores only validated citation and translation metadata (`reference`, `translation`,
 *   optional legitimate `sourceChallengeId`) — never copyrighted passage manuscript text.
 */

export interface ScriptureCaptureInput {
  readonly reference: string
  /** Explicit translation code (e.g. `'WEBP'`, `'NIV'`); `'Not configured'` or blank normalizes to `null`. */
  readonly translation?: string | null
  /** Optional legitimate Challenge provenance from an admitted Challenge surface. */
  readonly sourceChallenge?: AdmittedChallenge
  /** Optional validated canonical Challenge ID provenance (ignored if invalid for the namespace). */
  readonly sourceChallengeId?: CanonicalChallengeId
}

export interface ValidatedScriptureCapture {
  readonly key: SavedScriptureKey
  readonly reference: string
  readonly translation: string | null
  readonly sourceChallengeId?: CanonicalChallengeId
}

export type ScriptureCaptureRejectionReason =
  | 'invalid_input'
  | 'empty_reference'
  | 'reference_too_long'
  | 'malformed_reference'

export type ScriptureCaptureValidationResult =
  | {
      readonly ok: true
      readonly value: ValidatedScriptureCapture
    }
  | {
      readonly ok: false
      readonly reason: ScriptureCaptureRejectionReason
    }

export type ScriptureCaptureStatus =
  | 'hydrating'
  | 'ready'
  | 'invalid'
  | 'corruptStoredData'
  | 'unsupportedNewerSchema'

export interface ScriptureCaptureState {
  readonly status: ScriptureCaptureStatus
  readonly isValid: boolean
  readonly validationReason: ScriptureCaptureRejectionReason | null
  readonly isSaved: boolean
  readonly canMutate: boolean
  readonly hasPendingWrites: boolean
  readonly health: PersistenceHealth
  readonly canRetry: boolean
  readonly validated: ValidatedScriptureCapture | null
  readonly savedRecord: SavedScriptureRecord | null
  readonly statusMessage: string | null
  readonly writeErrorMessage: string | null
}

export type ScriptureCaptureActionResult =
  | {
      readonly ok: true
      readonly action: 'saved' | 'removed' | 'unchanged'
      readonly key: SavedScriptureKey
    }
  | {
      readonly ok: false
      readonly reason:
        | ScriptureCaptureRejectionReason
        | 'hydrating'
        | 'corruptStoredData'
        | 'unsupportedNewerSchema'
    }

export interface ScriptureCaptureOptions {
  readonly allowedNamespace?: ChallengeIdentityNamespace
  readonly getToday?: () => LocalCalendarDate
}

export interface ScriptureCaptureController {
  getState(input: ScriptureCaptureInput): ScriptureCaptureState
  save(input: ScriptureCaptureInput): Promise<ScriptureCaptureActionResult>
  remove(input: ScriptureCaptureInput): Promise<ScriptureCaptureActionResult>
  toggle(input: ScriptureCaptureInput): Promise<ScriptureCaptureActionResult>
  retry(): Promise<void>
}
