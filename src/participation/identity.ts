import type {
  CanonicalChallengeId,
  ChallengeIdentityNamespace,
  LocalCalendarDate,
  SavedScriptureInput,
  SavedScriptureKey,
} from './types.ts'

/**
 * Identity & key normalization helpers for reader participation records.
 *
 * Architectural boundary note:
 * `parseStoredChallengeId` validates *storage key syntax and namespace isolation* during
 * deserialization. Matching `cms:<token>` does NOT prove a Challenge was published, editorially
 * approved, or released to readers — write admission belongs to `admission.ts`.
 */

const CHALLENGE_TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

const FORBIDDEN_PRODUCTION_CMS_PREFIXES = [
  'drafts.',
  'fixture-',
  'pilot-',
  'weekly-pilot-',
  'sanity-live',
  'sanity-fixture',
] as const

const FORBIDDEN_PRODUCTION_CMS_TOKENS = new Set([
  'fixture-challenge-document',
  'weekly-rhythm-pilot-2026',
  'interactive-challenge-lab',
  'nov-1',
  'nov-2',
  'nov-3',
  'nov-5',
])

export function isForbiddenProductionCmsToken(token: string): boolean {
  const lower = token.toLowerCase()
  if (FORBIDDEN_PRODUCTION_CMS_TOKENS.has(lower)) return true
  return FORBIDDEN_PRODUCTION_CMS_PREFIXES.some(prefix => lower.startsWith(prefix))
}

export function formatCanonicalChallengeId(
  namespace: ChallengeIdentityNamespace,
  rawBaseId: string,
): CanonicalChallengeId | null {
  if (typeof rawBaseId !== 'string' || rawBaseId !== rawBaseId.trim()) return null
  if (rawBaseId.startsWith('drafts.')) return null
  if (!CHALLENGE_TOKEN_PATTERN.test(rawBaseId)) return null
  if (namespace === 'cms' && isForbiddenProductionCmsToken(rawBaseId)) return null
  return `${namespace}:${rawBaseId}` as CanonicalChallengeId
}

export function parseStoredChallengeId(
  raw: unknown,
  allowedNamespace: ChallengeIdentityNamespace = 'cms',
): CanonicalChallengeId | null {
  if (typeof raw !== 'string' || raw !== raw.trim()) return null
  const separatorIndex = raw.indexOf(':')
  if (separatorIndex <= 0) return null

  const namespace = raw.slice(0, separatorIndex)
  const token = raw.slice(separatorIndex + 1)
  if (namespace !== allowedNamespace) return null

  return formatCanonicalChallengeId(allowedNamespace, token)
}

export function challengeIdNamespace(id: CanonicalChallengeId): ChallengeIdentityNamespace {
  return id.startsWith('pilot:') ? 'pilot' : 'cms'
}

export function parseLocalCalendarDate(raw: unknown): LocalCalendarDate | null {
  if (typeof raw !== 'string') return null
  const match = CALENDAR_DATE_PATTERN.exec(raw)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  const candidate = new Date(Date.UTC(year, month - 1, day))
  if (
    candidate.getUTCFullYear() !== year
    || candidate.getUTCMonth() !== month - 1
    || candidate.getUTCDate() !== day
  ) {
    return null
  }

  return raw as LocalCalendarDate
}

export function formatLocalCalendarDate(date: Date = new Date()): LocalCalendarDate {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}` as LocalCalendarDate
}

export function normalizeScriptureDisplayReference(reference: string): string {
  return reference.normalize('NFC').trim().replace(/\s+/g, ' ')
}

export function normalizeScriptureReferenceForKey(reference: string): string {
  return normalizeScriptureDisplayReference(reference)
    .replace(/[–—−]/g, '-')
    .replace(/\s*:\s*/g, ':')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s*;\s*/g, '; ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

export function normalizeScriptureTranslation(translation: string | null | undefined): string | null {
  if (typeof translation !== 'string') return null
  const normalized = translation.normalize('NFC').trim().replace(/\s+/g, ' ')
  if (!normalized || normalized.toLowerCase() === 'not configured') {
    return null
  }
  return normalized
}

export function createSavedScriptureKey(input: {
  readonly reference: string
  readonly translation?: string | null
}): SavedScriptureKey | null {
  if (typeof input.reference !== 'string') return null
  const normalizedRef = normalizeScriptureReferenceForKey(input.reference)
  if (!normalizedRef) return null

  const normalizedTranslation = normalizeScriptureTranslation(input.translation)
  const translationSegment = normalizedTranslation ? normalizedTranslation.toLowerCase() : ''
  return `${normalizedRef}|${translationSegment}` as SavedScriptureKey
}

export interface NormalizedSavedScriptureInput {
  readonly key: SavedScriptureKey
  readonly reference: string
  readonly translation: string | null
  readonly sourceChallengeId?: CanonicalChallengeId
}

export function normalizeSavedScriptureInput(
  input: SavedScriptureInput,
  allowedNamespace: ChallengeIdentityNamespace = 'cms',
): NormalizedSavedScriptureInput | null {
  if (typeof input !== 'object' || input === null || typeof input.reference !== 'string') return null
  const reference = normalizeScriptureDisplayReference(input.reference)
  if (!reference) return null

  const translation = normalizeScriptureTranslation(input.translation)
  const key = createSavedScriptureKey({ reference, translation })
  if (!key) return null

  let sourceChallengeId: CanonicalChallengeId | undefined
  if (input.sourceChallengeId !== undefined) {
    const parsedSource = parseStoredChallengeId(input.sourceChallengeId, allowedNamespace)
    if (parsedSource) {
      sourceChallengeId = parsedSource
    }
  }

  return {
    key,
    reference,
    translation,
    ...(sourceChallengeId ? { sourceChallengeId } : {}),
  }
}
