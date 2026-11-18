import type { ReaderParticipationSnapshot } from '../participation/store.ts'
import type {
  ChallengeIdentityNamespace,
  LocalCalendarDate,
  ParticipationCommand,
  SavedScriptureRecord,
} from '../participation/types.ts'
import type {
  ScriptureCaptureInput,
  ScriptureCaptureState,
  ScriptureCaptureStatus,
  ValidatedScriptureCapture,
} from './types.ts'
import { validateScriptureCaptureInput } from './validation.ts'

function resolveWriteErrorMessage(snapshot: ReaderParticipationSnapshot): string | null {
  if (snapshot.health === 'storageUnavailable') {
    return 'Device storage is currently unavailable. Pending Saved Scripture changes are kept in memory for this session.'
  }
  if (snapshot.health === 'writeFailed') {
    return 'Could not write your latest Saved Scripture change to device storage. Check available storage space and retry.'
  }
  return null
}

/**
 * Pure selector deriving the complete Save Scripture control state from a `ReaderParticipationSnapshot`
 * and a `ScriptureCaptureInput`.
 */
export function selectScriptureCaptureState(
  snapshot: ReaderParticipationSnapshot,
  input: ScriptureCaptureInput,
  allowedNamespace: ChallengeIdentityNamespace = 'cms',
): ScriptureCaptureState {
  const validation = validateScriptureCaptureInput(input, allowedNamespace)
  const validated = validation.ok ? validation.value : null
  const validationReason = validation.ok ? null : validation.reason

  const savedRecord: SavedScriptureRecord | null = validated
    ? snapshot.data.savedScriptures.find(entry => entry.key === validated.key) ?? null
    : null
  const isSaved = savedRecord !== null
  const writeErrorMessage = resolveWriteErrorMessage(snapshot)
  const canRetry =
    snapshot.hasPendingWrites
    || snapshot.health === 'writeFailed'
    || snapshot.health === 'storageUnavailable'

  let status: ScriptureCaptureStatus = 'ready'
  let canMutate = true
  let statusMessage: string | null = null

  if (snapshot.status === 'hydrating') {
    status = 'hydrating'
    canMutate = false
    statusMessage = 'Loading Saved Scripture from device storage…'
  } else if (snapshot.health === 'corruptStoredData') {
    status = 'corruptStoredData'
    canMutate = false
    statusMessage =
      'Saved participation records on this device could not be read cleanly. Existing data was left untouched.'
  } else if (snapshot.health === 'unsupportedNewerSchema') {
    status = 'unsupportedNewerSchema'
    canMutate = false
    statusMessage =
      'Saved participation records on this device were written by a newer version of Bibleberry. Existing data was left untouched.'
  } else if (!validation.ok) {
    status = 'invalid'
    canMutate = false
    statusMessage = 'This Scripture reference is not in a valid citation format.'
  }

  return Object.freeze({
    status,
    isValid: validation.ok,
    validationReason,
    isSaved,
    canMutate,
    hasPendingWrites: snapshot.hasPendingWrites,
    health: snapshot.health,
    canRetry,
    validated,
    savedRecord,
    statusMessage,
    writeErrorMessage,
  })
}

/**
 * Builds the canonical `setScriptureSaved` command for `ReaderParticipationStore.dispatch()`.
 * Never includes passage manuscript text.
 */
export function buildSetScriptureSavedCommand(
  validated: ValidatedScriptureCapture,
  saved: boolean,
  savedOn: LocalCalendarDate,
): ParticipationCommand {
  return {
    type: 'setScriptureSaved',
    scripture: {
      reference: validated.reference,
      translation: validated.translation,
      ...(saved && validated.sourceChallengeId
        ? { sourceChallengeId: validated.sourceChallengeId }
        : {}),
    },
    saved,
    savedOn,
  }
}
