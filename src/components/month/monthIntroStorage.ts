import { Capacitor } from '@capacitor/core'
import { createCapacitorPreferencesDriver } from '../../participation/drivers/capacitorPreferencesDriver.ts'
import { createWebLocalStorageDriver } from '../../participation/drivers/webLocalStorageDriver.ts'
import { isPromiseLike, type KeyValueStorageDriver, type MaybePromise } from '../../participation/persistence.ts'

/**
 * UI-only presentation state for monthly Advance Preview and Welcome introductions.
 *
 * Stored separately under `bibleberry-month-intro-v1` so `GuestParticipationEnvelopeV1`
 * remains untouched at `schemaVersion: 1`. This state is strictly local presentation memory
 * (non-synced across devices) and never authorizes content access.
 */

export const MONTH_INTRO_STORAGE_KEY = 'bibleberry-month-intro-v1'
export const MONTH_INTRO_SCHEMA_VERSION = 1

const YEAR_MONTH_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/

export interface MonthIntroMonthRecord {
  readonly previewVersion?: string
  readonly welcomeVersion?: string
  readonly previewSeen: boolean
  readonly welcomeSeen: boolean
}

export interface MonthIntroEnvelopeV1 {
  readonly schemaVersion: 1
  readonly months: Readonly<Record<string, MonthIntroMonthRecord>>
}

export type MonthIntroStorageHealth = 'ok' | 'corruptStoredData' | 'unsupportedNewerSchema' | 'storageUnavailable'

export interface MonthIntroLoadResult {
  readonly envelope: MonthIntroEnvelopeV1
  readonly health: MonthIntroStorageHealth
}

export type MonthIntroPhase = 'advancePreview' | 'active' | 'historical'

export interface MonthIntroDecision {
  readonly showAutomatically: boolean
  readonly mode: 'preview' | 'active'
  readonly canSkipToWelcome: boolean
}

export function emptyMonthIntroEnvelope(): MonthIntroEnvelopeV1 {
  return Object.freeze({
    schemaVersion: 1,
    months: Object.freeze({}),
  })
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseMonthIntroEnvelope(raw: string | null): MonthIntroLoadResult {
  if (raw === null || raw === '') {
    return { envelope: emptyMonthIntroEnvelope(), health: 'ok' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { envelope: emptyMonthIntroEnvelope(), health: 'corruptStoredData' }
  }

  if (!isPlainObject(parsed)) {
    return { envelope: emptyMonthIntroEnvelope(), health: 'corruptStoredData' }
  }

  if (typeof parsed.schemaVersion === 'number' && Number.isInteger(parsed.schemaVersion) && parsed.schemaVersion > 1) {
    return { envelope: emptyMonthIntroEnvelope(), health: 'unsupportedNewerSchema' }
  }

  if (parsed.schemaVersion !== 1 || !isPlainObject(parsed.months)) {
    return { envelope: emptyMonthIntroEnvelope(), health: 'corruptStoredData' }
  }

  const months: Record<string, MonthIntroMonthRecord> = {}
  for (const [key, value] of Object.entries(parsed.months)) {
    if (!YEAR_MONTH_PATTERN.test(key) || !isPlainObject(value)) continue
    const previewVersion =
      typeof value.previewVersion === 'string' && value.previewVersion.trim().length > 0
        ? value.previewVersion.trim()
        : undefined
    const welcomeVersion =
      typeof value.welcomeVersion === 'string' && value.welcomeVersion.trim().length > 0
        ? value.welcomeVersion.trim()
        : undefined
    const previewSeen = value.previewSeen === true
    const welcomeSeen = value.welcomeSeen === true
    if (!previewSeen && !welcomeSeen) continue

    months[key] = Object.freeze({
      ...(previewVersion ? { previewVersion } : {}),
      ...(welcomeVersion ? { welcomeVersion } : {}),
      previewSeen,
      welcomeSeen,
    })
  }

  return {
    envelope: Object.freeze({
      schemaVersion: 1,
      months: Object.freeze(months),
    }),
    health: 'ok',
  }
}

export function resolveMonthIntroDecision(
  phase: MonthIntroPhase,
  introVersion: string,
  record: MonthIntroMonthRecord | undefined,
): MonthIntroDecision {
  if (phase === 'advancePreview') {
    const seenCurrentPreview = Boolean(
      record?.previewSeen && record.previewVersion === introVersion,
    )
    return {
      showAutomatically: !seenCurrentPreview,
      mode: 'preview',
      canSkipToWelcome: false,
    }
  }

  const seenCurrentWelcome = Boolean(
    record?.welcomeSeen && record.welcomeVersion === introVersion,
  )
  return {
    showAutomatically: !seenCurrentWelcome,
    mode: 'active',
    canSkipToWelcome: Boolean(record?.previewSeen),
  }
}

export function markMonthPreviewSeenInEnvelope(
  envelope: MonthIntroEnvelopeV1,
  yearMonth: string,
  previewVersion: string,
): MonthIntroEnvelopeV1 {
  if (!YEAR_MONTH_PATTERN.test(yearMonth)) return envelope
  const existing = envelope.months[yearMonth]
  const nextRecord: MonthIntroMonthRecord = Object.freeze({
    previewVersion,
    ...(existing?.welcomeVersion ? { welcomeVersion: existing.welcomeVersion } : {}),
    previewSeen: true,
    // Viewing an advance preview must NEVER falsely mark Welcome as seen.
    welcomeSeen: existing?.welcomeSeen ?? false,
  })
  return Object.freeze({
    schemaVersion: 1,
    months: Object.freeze({
      ...envelope.months,
      [yearMonth]: nextRecord,
    }),
  })
}

export function markMonthWelcomeSeenInEnvelope(
  envelope: MonthIntroEnvelopeV1,
  yearMonth: string,
  welcomeVersion: string,
): MonthIntroEnvelopeV1 {
  if (!YEAR_MONTH_PATTERN.test(yearMonth)) return envelope
  const existing = envelope.months[yearMonth]
  const nextRecord: MonthIntroMonthRecord = Object.freeze({
    ...(existing?.previewVersion ? { previewVersion: existing.previewVersion } : {}),
    welcomeVersion,
    previewSeen: existing?.previewSeen ?? false,
    welcomeSeen: true,
  })
  return Object.freeze({
    schemaVersion: 1,
    months: Object.freeze({
      ...envelope.months,
      [yearMonth]: nextRecord,
    }),
  })
}

export interface MonthIntroStore {
  load(): Promise<MonthIntroLoadResult>
  markPreviewSeen(yearMonth: string, previewVersion: string): Promise<MonthIntroLoadResult>
  markWelcomeSeen(yearMonth: string, welcomeVersion: string): Promise<MonthIntroLoadResult>
  clear(): Promise<{ readonly ok: boolean; readonly health: MonthIntroStorageHealth }>
}

export function createMonthIntroStore(
  driver: KeyValueStorageDriver,
  storageKey: string = MONTH_INTRO_STORAGE_KEY,
): MonthIntroStore {
  async function readCurrent(): Promise<MonthIntroLoadResult> {
    let rawOrPromise: MaybePromise<string | null>
    try {
      rawOrPromise = driver.getItem(storageKey)
    } catch {
      return { envelope: emptyMonthIntroEnvelope(), health: 'storageUnavailable' }
    }

    try {
      const raw = isPromiseLike(rawOrPromise) ? await rawOrPromise : rawOrPromise
      return parseMonthIntroEnvelope(raw)
    } catch {
      return { envelope: emptyMonthIntroEnvelope(), health: 'storageUnavailable' }
    }
  }

  async function writeEnvelope(
    updater: (current: MonthIntroEnvelopeV1) => MonthIntroEnvelopeV1,
  ): Promise<MonthIntroLoadResult> {
    const loaded = await readCurrent()
    if (loaded.health === 'unsupportedNewerSchema' || loaded.health === 'storageUnavailable') {
      // Never clobber newer schema payloads or pretend unavailable storage succeeded.
      return loaded
    }

    const base = loaded.health === 'corruptStoredData' ? emptyMonthIntroEnvelope() : loaded.envelope
    const next = updater(base)
    const serialized = JSON.stringify(next)

    try {
      const writeOrPromise = driver.setItem(storageKey, serialized)
      if (isPromiseLike(writeOrPromise)) {
        await writeOrPromise
      }
      return { envelope: next, health: 'ok' }
    } catch {
      return { envelope: next, health: 'storageUnavailable' }
    }
  }

  return {
    load: readCurrent,
    markPreviewSeen: (yearMonth, previewVersion) =>
      writeEnvelope(env => markMonthPreviewSeenInEnvelope(env, yearMonth, previewVersion)),
    markWelcomeSeen: (yearMonth, welcomeVersion) =>
      writeEnvelope(env => markMonthWelcomeSeenInEnvelope(env, yearMonth, welcomeVersion)),
    async clear() {
      try {
        const removeOrPromise = driver.removeItem(storageKey)
        if (isPromiseLike(removeOrPromise)) {
          await removeOrPromise
        }
        return { ok: true, health: 'ok' }
      } catch {
        return { ok: false, health: 'storageUnavailable' }
      }
    },
  }
}

export function createPlatformMonthIntroStore(
  options: { readonly isNativePlatform?: () => boolean } = {},
): MonthIntroStore {
  const isNative = options.isNativePlatform ?? (() => Capacitor.isNativePlatform())
  const driver = isNative()
    ? createCapacitorPreferencesDriver()
    : createWebLocalStorageDriver()
  return createMonthIntroStore(driver)
}

export const defaultMonthIntroStore: MonthIntroStore = createPlatformMonthIntroStore()
