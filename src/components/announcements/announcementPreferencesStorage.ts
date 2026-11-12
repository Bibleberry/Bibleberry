import { useSyncExternalStore } from 'react'
import { Capacitor } from '@capacitor/core'
import { createCapacitorPreferencesDriver } from '../../participation/drivers/capacitorPreferencesDriver.ts'
import { createWebLocalStorageDriver } from '../../participation/drivers/webLocalStorageDriver.ts'
import {
  isPromiseLike,
  type KeyValueStorageDriver,
  type MaybePromise,
} from '../../participation/persistence.ts'

/**
 * Platform-neutral, UI-only presentation preference store for earned Scripture Card
 * announcements (R14-6).
 *
 * Stored separately under `bibleberry-card-announcement-prefs-v1` so the V2 participation
 * schema (`GuestParticipationEnvelopeV2`) remains untouched. Disabling announcements
 * suppresses Hub presentation only — never Card earning, earned dates, or pending flags.
 */

export const CARD_ANNOUNCEMENT_PREFS_STORAGE_KEY = 'bibleberry-card-announcement-prefs-v1'
export const CARD_ANNOUNCEMENT_PREFS_SCHEMA_VERSION = 1

export type AnnouncementPreferencesHealth =
  | 'ok'
  | 'corruptStoredData'
  | 'unsupportedNewerSchema'
  | 'storageUnavailable'
  | 'writeFailed'

export interface CardAnnouncementPreferencesData {
  readonly earnedCardAnnouncementsEnabled: boolean
}

export interface CardAnnouncementPreferencesEnvelopeV1 {
  readonly schemaVersion: 1
  readonly earnedCardAnnouncementsEnabled: boolean
}

export interface AnnouncementPreferencesParseResult {
  readonly data: CardAnnouncementPreferencesData
  readonly health: AnnouncementPreferencesHealth
}

export type AnnouncementPreferencesStoreStatus = 'hydrating' | 'ready'

export interface AnnouncementPreferencesSnapshot {
  readonly status: AnnouncementPreferencesStoreStatus
  readonly data: CardAnnouncementPreferencesData
  readonly hasPendingWrites: boolean
  readonly health: AnnouncementPreferencesHealth
}

export interface AnnouncementPreferencesStore {
  getSnapshot(): AnnouncementPreferencesSnapshot
  subscribe(listener: () => void): () => void
  whenReady(): Promise<void>
  setAnnouncementsEnabled(enabled: boolean): Promise<void>
  flushPending(): Promise<void>
  clearLocalData(): Promise<void>
  dispose(): void
}

const DEFAULT_PREFERENCES_DATA: CardAnnouncementPreferencesData = Object.freeze({
  earnedCardAnnouncementsEnabled: true,
})

export function defaultCardAnnouncementPreferencesData(): CardAnnouncementPreferencesData {
  return DEFAULT_PREFERENCES_DATA
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function serializeCardAnnouncementPreferencesEnvelope(
  data: CardAnnouncementPreferencesData,
): string {
  const envelope: CardAnnouncementPreferencesEnvelopeV1 = {
    schemaVersion: CARD_ANNOUNCEMENT_PREFS_SCHEMA_VERSION,
    earnedCardAnnouncementsEnabled: data.earnedCardAnnouncementsEnabled,
  }
  return JSON.stringify(envelope)
}

export function parseCardAnnouncementPreferencesEnvelope(
  raw: string | null,
): AnnouncementPreferencesParseResult {
  if (raw === null || raw === '') {
    return {
      data: DEFAULT_PREFERENCES_DATA,
      health: 'ok',
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {
      data: DEFAULT_PREFERENCES_DATA,
      health: 'corruptStoredData',
    }
  }

  if (!isPlainObject(parsed)) {
    return {
      data: DEFAULT_PREFERENCES_DATA,
      health: 'corruptStoredData',
    }
  }

  const schemaVersion = parsed.schemaVersion
  if (
    typeof schemaVersion === 'number'
    && Number.isInteger(schemaVersion)
    && schemaVersion > CARD_ANNOUNCEMENT_PREFS_SCHEMA_VERSION
  ) {
    return {
      data: DEFAULT_PREFERENCES_DATA,
      health: 'unsupportedNewerSchema',
    }
  }

  if (
    schemaVersion !== CARD_ANNOUNCEMENT_PREFS_SCHEMA_VERSION
    || typeof parsed.earnedCardAnnouncementsEnabled !== 'boolean'
  ) {
    return {
      data: DEFAULT_PREFERENCES_DATA,
      health: 'corruptStoredData',
    }
  }

  return {
    data: Object.freeze({
      earnedCardAnnouncementsEnabled: parsed.earnedCardAnnouncementsEnabled,
    }),
    health: 'ok',
  }
}

export function createAnnouncementPreferencesStore(
  driver: KeyValueStorageDriver,
  storageKey: string = CARD_ANNOUNCEMENT_PREFS_STORAGE_KEY,
): AnnouncementPreferencesStore {
  let status: AnnouncementPreferencesStoreStatus = 'hydrating'
  let committedData: CardAnnouncementPreferencesData = DEFAULT_PREFERENCES_DATA
  let pendingDesiredEnabled: boolean | null = null
  let health: AnnouncementPreferencesHealth = 'ok'
  let pendingClear = false
  let epoch = 0
  let disposed = false

  const listeners = new Set<() => void>()
  let inFlightCount = 0
  let ioTail: Promise<void> = Promise.resolve()

  function enqueueIo(task: () => MaybePromise<void>): Promise<void> {
    if (inFlightCount === 0) {
      inFlightCount = 1
      let result: MaybePromise<void>
      try {
        result = task()
      } catch {
        inFlightCount -= 1
        return Promise.resolve()
      }
      if (!isPromiseLike(result)) {
        inFlightCount -= 1
        return Promise.resolve()
      }
      const tracked = result
        .then(
          () => undefined,
          () => undefined,
        )
        .finally(() => {
          inFlightCount -= 1
        })
      ioTail = tracked
      return tracked
    }

    inFlightCount += 1
    const next = ioTail
      .then(() => task())
      .then(
        () => undefined,
        () => undefined,
      )
      .finally(() => {
        inFlightCount -= 1
      })
    ioTail = next
    return next
  }

  function computeEffectiveData(): CardAnnouncementPreferencesData {
    if (pendingDesiredEnabled === null) {
      return committedData
    }
    if (committedData.earnedCardAnnouncementsEnabled === pendingDesiredEnabled) {
      return committedData
    }
    return Object.freeze({
      earnedCardAnnouncementsEnabled: pendingDesiredEnabled,
    })
  }

  let cachedSnapshot: AnnouncementPreferencesSnapshot = Object.freeze({
    status,
    data: committedData,
    hasPendingWrites: false,
    health,
  })

  function updateSnapshot(notify: boolean): void {
    const candidateData = computeEffectiveData()
    const stableData =
      candidateData.earnedCardAnnouncementsEnabled === cachedSnapshot.data.earnedCardAnnouncementsEnabled
        ? cachedSnapshot.data
        : candidateData
    const nextHasPending = pendingDesiredEnabled !== null

    if (
      cachedSnapshot.status === status
      && cachedSnapshot.data === stableData
      && cachedSnapshot.hasPendingWrites === nextHasPending
      && cachedSnapshot.health === health
    ) {
      return
    }

    cachedSnapshot = Object.freeze({
      status,
      data: stableData,
      hasPendingWrites: nextHasPending,
      health,
    })

    if (notify && !disposed && listeners.size > 0) {
      for (const listener of [...listeners]) {
        listener()
      }
    }
  }

  function readFromDriver(): MaybePromise<AnnouncementPreferencesParseResult> {
    let rawOrPromise: MaybePromise<string | null>
    try {
      rawOrPromise = driver.getItem(storageKey)
    } catch {
      return {
        data: DEFAULT_PREFERENCES_DATA,
        health: 'storageUnavailable',
      }
    }

    if (isPromiseLike(rawOrPromise)) {
      return rawOrPromise.then(
        raw => parseCardAnnouncementPreferencesEnvelope(raw),
        () => ({
          data: DEFAULT_PREFERENCES_DATA,
          health: 'storageUnavailable' as const,
        }),
      )
    }

    return parseCardAnnouncementPreferencesEnvelope(rawOrPromise)
  }

  function removeFromDriver(): MaybePromise<boolean> {
    let removeOrPromise: MaybePromise<void>
    try {
      removeOrPromise = driver.removeItem(storageKey)
    } catch {
      return false
    }

    if (isPromiseLike(removeOrPromise)) {
      return removeOrPromise.then(
        () => true,
        () => false,
      )
    }

    return true
  }

  const initialEpoch = epoch
  const readyPromise = enqueueIo(() => {
    const loadedOrPromise = readFromDriver()
    const applyInitial = (result: AnnouncementPreferencesParseResult, notify: boolean) => {
      if (disposed || initialEpoch !== epoch) return
      committedData = result.data
      health = result.health
      status = 'ready'
      updateSnapshot(notify)
    }

    if (isPromiseLike(loadedOrPromise)) {
      return loadedOrPromise.then(
        result => applyInitial(result, true),
        () =>
          applyInitial(
            {
              data: DEFAULT_PREFERENCES_DATA,
              health: 'storageUnavailable',
            },
            true,
          ),
      )
    }

    applyInitial(loadedOrPromise, false)
  })

  function scheduleFlush(targetEpoch: number): Promise<void> {
    return enqueueIo(() => {
      if (disposed || targetEpoch !== epoch) return

      const ensureCleared = (): MaybePromise<boolean> => {
        if (!pendingClear) return true
        const removed = removeFromDriver()
        const finalizeClear = (ok: boolean) => {
          if (disposed || targetEpoch !== epoch) return false
          if (!ok) {
            health = 'storageUnavailable'
            updateSnapshot(true)
            return false
          }
          pendingClear = false
          committedData = DEFAULT_PREFERENCES_DATA
          health = 'ok'
          return true
        }
        return isPromiseLike(removed) ? removed.then(finalizeClear) : finalizeClear(removed)
      }

      const clearedOrPromise = ensureCleared()

      const performWrite = (clearOk: boolean): MaybePromise<void> => {
        if (!clearOk || disposed || targetEpoch !== epoch) return
        const targetEnabled = pendingDesiredEnabled
        if (targetEnabled === null) return

        const currentOrPromise = readFromDriver()
        const afterRead = (current: AnnouncementPreferencesParseResult): MaybePromise<void> => {
          if (disposed || targetEpoch !== epoch) return
          if (
            current.health === 'unsupportedNewerSchema'
            || current.health === 'storageUnavailable'
          ) {
            health = current.health
            updateSnapshot(true)
            return
          }

          const nextData: CardAnnouncementPreferencesData = Object.freeze({
            earnedCardAnnouncementsEnabled: targetEnabled,
          })
          const serialized = serializeCardAnnouncementPreferencesEnvelope(nextData)

          let writeOrPromise: MaybePromise<void>
          try {
            writeOrPromise = driver.setItem(storageKey, serialized)
          } catch {
            health = 'writeFailed'
            updateSnapshot(true)
            return
          }

          const applyWriteSuccess = () => {
            if (disposed || targetEpoch !== epoch) return
            committedData = nextData
            if (pendingDesiredEnabled === targetEnabled) {
              pendingDesiredEnabled = null
            }
            health = 'ok'
            updateSnapshot(true)
          }

          const applyWriteFailure = () => {
            if (disposed || targetEpoch !== epoch) return
            health = 'writeFailed'
            updateSnapshot(true)
          }

          if (isPromiseLike(writeOrPromise)) {
            return writeOrPromise.then(applyWriteSuccess, applyWriteFailure)
          }

          applyWriteSuccess()
        }

        return isPromiseLike(currentOrPromise)
          ? currentOrPromise.then(afterRead)
          : afterRead(currentOrPromise)
      }

      return isPromiseLike(clearedOrPromise)
        ? clearedOrPromise.then(performWrite)
        : performWrite(clearedOrPromise)
    })
  }

  const unsubscribeExternal = driver.onExternalChange
    ? driver.onExternalChange(storageKey, () => {
        if (disposed) return
        const refreshEpoch = epoch
        void enqueueIo(() => {
          if (disposed || refreshEpoch !== epoch) return
          if (pendingClear) return
          const loadedOrPromise = readFromDriver()
          const applyExternal = (result: AnnouncementPreferencesParseResult) => {
            if (disposed || refreshEpoch !== epoch) return
            if (result.health === 'ok') {
              committedData = result.data
              if (pendingDesiredEnabled === null) {
                health = 'ok'
              }
            } else {
              health = result.health
            }
            status = 'ready'
            updateSnapshot(true)
          }

          if (isPromiseLike(loadedOrPromise)) {
            return loadedOrPromise.then(applyExternal)
          }
          applyExternal(loadedOrPromise)
        })
      })
    : undefined

  return {
    getSnapshot() {
      return cachedSnapshot
    },

    subscribe(listener: () => void) {
      if (disposed) return () => {}
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    whenReady() {
      return readyPromise
    },

    setAnnouncementsEnabled(enabled: boolean): Promise<void> {
      if (disposed) return Promise.resolve()

      if (
        status === 'ready'
        && pendingDesiredEnabled === null
        && health === 'ok'
        && committedData.earnedCardAnnouncementsEnabled === enabled
      ) {
        return Promise.resolve()
      }

      pendingDesiredEnabled = enabled
      updateSnapshot(true)
      return scheduleFlush(epoch)
    },

    flushPending(): Promise<void> {
      if (disposed) return Promise.resolve()
      if (pendingDesiredEnabled === null && !pendingClear) {
        return inFlightCount > 0 ? ioTail : Promise.resolve()
      }
      return scheduleFlush(epoch)
    },

    clearLocalData(): Promise<void> {
      if (disposed) return Promise.resolve()

      epoch += 1
      const clearEpoch = epoch
      pendingClear = true
      pendingDesiredEnabled = null
      status = 'ready'
      committedData = DEFAULT_PREFERENCES_DATA
      health = 'ok'
      updateSnapshot(true)

      return enqueueIo(() => {
        if (disposed || clearEpoch !== epoch) return
        const removed = removeFromDriver()
        const applyClear = (ok: boolean) => {
          if (disposed || clearEpoch !== epoch) return
          committedData = DEFAULT_PREFERENCES_DATA
          if (ok) {
            pendingClear = false
            health = 'ok'
          } else {
            pendingClear = true
            health = 'storageUnavailable'
          }
          updateSnapshot(true)
        }
        return isPromiseLike(removed) ? removed.then(applyClear) : applyClear(removed)
      })
    },

    dispose() {
      if (disposed) return
      disposed = true
      listeners.clear()
      unsubscribeExternal?.()
    },
  }
}

export function createPlatformAnnouncementPreferencesStore(
  options: { readonly isNativePlatform?: () => boolean } = {},
): AnnouncementPreferencesStore {
  const isNative = options.isNativePlatform ?? (() => Capacitor.isNativePlatform())
  const driver = isNative()
    ? createCapacitorPreferencesDriver()
    : createWebLocalStorageDriver()
  return createAnnouncementPreferencesStore(driver)
}

export const defaultAnnouncementPreferencesStore: AnnouncementPreferencesStore =
  createPlatformAnnouncementPreferencesStore()

export function useAnnouncementPreferences(
  store: AnnouncementPreferencesStore,
): AnnouncementPreferencesSnapshot {
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  )
}
