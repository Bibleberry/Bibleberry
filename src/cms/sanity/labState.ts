import { resolveScreenIndex } from '../../components/challenge/challengePlayerModel.ts'
import type { CmsChallenge, CmsScripture } from './types.ts'

export const CMS_LAB_STORAGE_KEY = 'bibleberry-sanity-challenge-lab-v1'

export type CmsSourceKind = 'live' | 'fixture'

export type CmsSavedScripture = {
  key: string
  source: CmsSourceKind
  scriptureId: string
  reference: string
  translation: string
}

export type CmsLabState = {
  /** Challenge storage key -> stable Sanity screen key, not an array position. */
  positions: Record<string, string>
  completedChallengeIds: string[]
  savedChallengeIds: string[]
  scripture: CmsSavedScripture[]
}

export type CmsStorage = Pick<Storage, 'getItem' | 'setItem'>

export function emptyCmsLabState(): CmsLabState {
  return { positions: {}, completedChallengeIds: [], savedChallengeIds: [], scripture: [] }
}

export function cmsChallengeKey(source: CmsSourceKind, challenge: CmsChallenge) {
  return `sanity-${source}:${challenge.documentId}`
}

export function cmsScriptureKey(source: CmsSourceKind, scripture: CmsScripture) {
  const reference = scripture.reference
    .trim()
    .replace(/[–—]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase()
  const translation = scripture.translation.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
  return `sanity-${source}:${reference}|${translation}`
}

export function resolveCmsScreenIndex(challenge: CmsChallenge, savedScreenId: string | undefined) {
  return resolveScreenIndex(challenge.screens, savedScreenId)
}

export function toggleCmsScripture(
  entries: CmsSavedScripture[],
  source: CmsSourceKind,
  scripture: CmsScripture,
) {
  const key = cmsScriptureKey(source, scripture)
  const exists = entries.some(entry => entry.key === key)
  return exists
    ? entries.filter(entry => entry.key !== key)
    : [...entries, {
      key,
      source,
      scriptureId: scripture.id,
      reference: scripture.reference,
      translation: scripture.translation,
    }]
}

export function toggleCmsSavedChallenge(ids: string[], key: string) {
  return ids.includes(key) ? ids.filter(id => id !== key) : [...ids, key]
}

function isCmsScripture(value: unknown): value is CmsScripture {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Partial<CmsScripture>
  return typeof item.id === 'string'
    && typeof item.reference === 'string'
    && typeof item.translation === 'string'
    && (item.passage === undefined || typeof item.passage === 'string')
    && (item.textStatus === 'provided' || item.textStatus === 'referenceOnly')
    && (item.practiceStatus === 'configured' || item.practiceStatus === 'notConfigured')
    && typeof item.usageRightsConfirmed === 'boolean'
}

function normalizeCmsSavedScripture(value: unknown): CmsSavedScripture | null {
  if (typeof value !== 'object' || value === null) return null
  const item = value as Partial<CmsSavedScripture> & { scripture?: unknown }
  if (typeof item.key !== 'string' || (item.source !== 'live' && item.source !== 'fixture')) return null

  // B2 initially persisted the full Scripture object. Migrate those entries to
  // reference metadata so obsolete or rights-withdrawn passage text is discarded.
  const legacy = isCmsScripture(item.scripture) ? item.scripture : undefined
  const scriptureId = typeof item.scriptureId === 'string' ? item.scriptureId : legacy?.id
  const reference = typeof item.reference === 'string' ? item.reference : legacy?.reference
  const translation = typeof item.translation === 'string' ? item.translation : legacy?.translation
  if (!scriptureId || !reference || !translation) return null
  return { key: item.key, source: item.source, scriptureId, reference, translation }
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export function readCmsLabState(storage: CmsStorage): CmsLabState {
  try {
    const saved = storage.getItem(CMS_LAB_STORAGE_KEY)
    if (!saved) return emptyCmsLabState()
    const parsed = JSON.parse(saved) as Partial<CmsLabState>
    const positions: Record<string, string> = {}
    if (parsed.positions && typeof parsed.positions === 'object') {
      Object.entries(parsed.positions).forEach(([key, value]) => {
        if (typeof value === 'string') positions[key] = value
      })
    }
    return {
      positions,
      completedChallengeIds: stringArray(parsed.completedChallengeIds),
      savedChallengeIds: stringArray(parsed.savedChallengeIds),
      scripture: Array.isArray(parsed.scripture)
        ? parsed.scripture.map(normalizeCmsSavedScripture).filter((entry): entry is CmsSavedScripture => entry !== null)
        : [],
    }
  } catch {
    return emptyCmsLabState()
  }
}

export function writeCmsLabState(storage: CmsStorage, state: CmsLabState) {
  try {
    const serializable: CmsLabState = {
      ...state,
      scripture: state.scripture.map(entry => ({
        key: entry.key,
        source: entry.source,
        scriptureId: entry.scriptureId,
        reference: entry.reference,
        translation: entry.translation,
      })),
    }
    storage.setItem(CMS_LAB_STORAGE_KEY, JSON.stringify(serializable))
    return true
  } catch {
    return false
  }
}
