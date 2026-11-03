import type { CmsChallenge, CmsScripture } from './types.ts'

export const CMS_LAB_STORAGE_KEY = 'bibleberry-sanity-challenge-lab-v1'

export type CmsSourceKind = 'live' | 'fixture'

export type CmsSavedScripture = {
  key: string
  source: CmsSourceKind
  scripture: CmsScripture
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
  if (!savedScreenId) return 0
  const index = challenge.screens.findIndex(screen => screen.id === savedScreenId)
  return index >= 0 ? index : 0
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
    : [...entries, { key, source, scripture }]
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

function isCmsSavedScripture(value: unknown): value is CmsSavedScripture {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Partial<CmsSavedScripture>
  return typeof item.key === 'string'
    && (item.source === 'live' || item.source === 'fixture')
    && isCmsScripture(item.scripture)
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
      scripture: Array.isArray(parsed.scripture) ? parsed.scripture.filter(isCmsSavedScripture) : [],
    }
  } catch {
    return emptyCmsLabState()
  }
}

export function writeCmsLabState(storage: CmsStorage, state: CmsLabState) {
  try {
    storage.setItem(CMS_LAB_STORAGE_KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}
