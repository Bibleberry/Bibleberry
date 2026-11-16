import { isAdmittedChallenge } from '../participation/admission.ts'
import {
  createSavedScriptureKey,
  normalizeScriptureDisplayReference,
  normalizeScriptureTranslation,
  parseStoredChallengeId,
} from '../participation/identity.ts'
import type {
  CanonicalChallengeId,
  ChallengeIdentityNamespace,
} from '../participation/types.ts'
import type {
  ScriptureCaptureInput,
  ScriptureCaptureValidationResult,
  ValidatedScriptureCapture,
} from './types.ts'

const MAX_SCRIPTURE_REFERENCE_LENGTH = 160
const CONTROL_CHAR_PATTERN = /[\p{Cc}]/u
const FORBIDDEN_MARKUP_OR_PROSE_PATTERN = /[<>{}[\]"“”`]|https?:\/\//i
const LETTER_PATTERN = /\p{L}/u
const DIGIT_PATTERN = /\d/
const CITATION_SEGMENT_PATTERN =
  /^(?:[1-3]|I{1,3})?\s*[\p{L}][\p{L}\p{M}.'’-]*(?:\s+[\p{L}][\p{L}\p{M}.'’-]*)*\s+[1-9]\d*(?:\s*:\s*[1-9]\d*[a-z]?(?:\s*[-–—−]\s*[1-9]\d*(?:\s*:\s*[1-9]\d*)?[a-z]?)?(?:\s*,\s*[1-9]\d*[a-z]?(?:\s*[-–—−]\s*[1-9]\d*[a-z]?)?)*)?(?:\s*[-–—−]\s*[1-9]\d*(?:\s*:\s*[1-9]\d*)?)?$/u

/**
 * Validates that a raw Scripture reference is a clean citation (e.g. `'John 3:16'`,
 * `'1 Thessalonians 5:16–18'`, `'1 Chronicles 16:8–36; Psalm 105:1–15'`) and does not
 * contain malformed syntax, markup, or pasted Bible manuscript text.
 */
export function validateScriptureReference(
  rawReference: unknown,
): { readonly ok: true; readonly reference: string } | {
  readonly ok: false
  readonly reason: 'empty_reference' | 'reference_too_long' | 'malformed_reference'
} {
  if (typeof rawReference !== 'string') {
    return { ok: false, reason: 'malformed_reference' }
  }

  if (CONTROL_CHAR_PATTERN.test(rawReference)) {
    return { ok: false, reason: 'malformed_reference' }
  }

  const normalized = normalizeScriptureDisplayReference(rawReference)
  if (!normalized) {
    return { ok: false, reason: 'empty_reference' }
  }

  if (normalized.length > MAX_SCRIPTURE_REFERENCE_LENGTH) {
    return { ok: false, reason: 'reference_too_long' }
  }

  if (FORBIDDEN_MARKUP_OR_PROSE_PATTERN.test(normalized)) {
    return { ok: false, reason: 'malformed_reference' }
  }

  const segments = normalized.split(';')
  for (const rawSegment of segments) {
    const segment = rawSegment.trim()
    if (!segment) {
      return { ok: false, reason: 'malformed_reference' }
    }
    if (!LETTER_PATTERN.test(segment) || !DIGIT_PATTERN.test(segment)) {
      return { ok: false, reason: 'malformed_reference' }
    }
    if (!CITATION_SEGMENT_PATTERN.test(segment)) {
      return { ok: false, reason: 'malformed_reference' }
    }
  }

  return { ok: true, reference: normalized }
}

function resolveLegitimateChallengeProvenance(
  input: ScriptureCaptureInput,
  allowedNamespace: ChallengeIdentityNamespace,
): CanonicalChallengeId | undefined {
  if (input.sourceChallenge !== undefined) {
    if (isAdmittedChallenge(input.sourceChallenge, allowedNamespace)) {
      return input.sourceChallenge.challengeId
    }
    return undefined
  }

  if (input.sourceChallengeId !== undefined) {
    return parseStoredChallengeId(input.sourceChallengeId, allowedNamespace) ?? undefined
  }

  return undefined
}

/**
 * Validates and normalizes a `ScriptureCaptureInput` into a minimal citation-only payload.
 * Strips any extra properties (such as copyrighted `passage` text) so they can never reach
 * `ReaderParticipationStore`.
 */
export function validateScriptureCaptureInput(
  input: ScriptureCaptureInput,
  allowedNamespace: ChallengeIdentityNamespace = 'cms',
): ScriptureCaptureValidationResult {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, reason: 'invalid_input' }
  }

  const referenceResult = validateScriptureReference(input.reference)
  if (!referenceResult.ok) {
    return referenceResult
  }

  const translation = normalizeScriptureTranslation(input.translation)
  const key = createSavedScriptureKey({
    reference: referenceResult.reference,
    translation,
  })
  if (!key) {
    return { ok: false, reason: 'malformed_reference' }
  }

  const sourceChallengeId = resolveLegitimateChallengeProvenance(input, allowedNamespace)

  const validated: ValidatedScriptureCapture = Object.freeze({
    key,
    reference: referenceResult.reference,
    translation,
    ...(sourceChallengeId ? { sourceChallengeId } : {}),
  })

  return { ok: true, value: validated }
}
