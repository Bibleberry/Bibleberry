import {
  normalizeSavedScriptureInput,
  parseLocalCalendarDate,
  parseStoredChallengeId,
} from './identity.ts'
import {
  emptyReaderParticipationData,
  replayParticipationCommands,
} from './model.ts'
import type {
  ChallengeIdentityNamespace,
  ChallengeResumeRecord,
  CompletedChallengeRecord,
  GuestParticipationEnvelopeV1,
  LastOpenedChallengePointer,
  ParticipationCommand,
  ReaderParticipationData,
  SavedChallengeRecord,
  SavedScriptureRecord,
} from './types.ts'

/**
 * Platform-neutral persistence contracts and envelope adapter (Track A, A3 / Issue #46).
 *
 * Scope & platform invariants:
 * - Zero direct references to `window`, `document`, `localStorage`, `sessionStorage`, or `indexedDB`.
 * - Supports both synchronous drivers (web `localStorage` adapter) and asynchronous drivers
 *   (future iOS/Android native storage such as Capacitor Preferences or SQLite).
 * - Never overwrites unrecognized newer schemas (`schemaVersion > 1`) or corrupt JSON payloads
 *   automatically; only explicit user-initiated `clear()` removes them.
 */

export type MaybePromise<T> = T | Promise<T>

export type PersistenceHealth =
  | 'ok'
  | 'corruptStoredData'
  | 'unsupportedNewerSchema'
  | 'storageUnavailable'
  | 'writeFailed'

export interface KeyValueStorageDriver {
  getItem(key: string): MaybePromise<string | null>
  setItem(key: string, value: string): MaybePromise<void>
  removeItem(key: string): MaybePromise<void>
  /**
   * Optional external-change hook (e.g. web cross-tab `storage` + `visibilitychange`, or future
   * native app-resume hooks). Best-effort synchronization, not a cross-process mutex.
   */
  onExternalChange?: (key: string, listener: () => void) => () => void
}

export interface AdapterLoadResult {
  readonly data: ReaderParticipationData
  readonly health: PersistenceHealth
}

export type AdapterFlushResult =
  | {
      readonly ok: true
      readonly committedData: ReaderParticipationData
      readonly health: 'ok'
    }
  | {
      readonly ok: false
      /**
       * Freshly read disk state when readable (e.g. on `QuotaExceededError`), allowing the store
       * to keep `pendingCommands` layered over the latest durable base; `null` when storage itself
       * could not be read or held corrupt / newer-schema data.
       */
      readonly committedData: ReaderParticipationData | null
      readonly health: Exclude<PersistenceHealth, 'ok'>
    }

export interface AdapterClearResult {
  readonly ok: boolean
  readonly health: PersistenceHealth
}

export interface ParticipationPersistenceAdapter {
  load(): MaybePromise<AdapterLoadResult>
  flushCommands(
    commands: readonly ParticipationCommand[],
    fallbackBase: ReaderParticipationData,
    signal?: AbortSignal,
  ): MaybePromise<AdapterFlushResult>
  clear(): MaybePromise<AdapterClearResult>
  subscribeExternalChanges?(listener: () => void): () => void
}

export function isPromiseLike<T>(value: MaybePromise<T>): value is Promise<T> {
  return (
    typeof value === 'object'
    && value !== null
    && 'then' in value
    && typeof (value as { then?: unknown }).then === 'function'
  )
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function serializeParticipationEnvelope(data: ReaderParticipationData): string {
  const envelope: GuestParticipationEnvelopeV1 = {
    schemaVersion: 1,
    data: {
      completedChallenges: data.completedChallenges,
      inProgressChallenges: data.inProgressChallenges,
      savedChallenges: data.savedChallenges,
      savedScriptures: data.savedScriptures,
      lastOpenedChallenge: data.lastOpenedChallenge,
    },
  }
  return JSON.stringify(envelope)
}

export function parseParticipationEnvelope(
  raw: string | null,
  allowedNamespace: ChallengeIdentityNamespace = 'cms',
): AdapterLoadResult {
  if (raw === null || raw === '') {
    return {
      data: emptyReaderParticipationData(),
      health: 'ok',
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {
      data: emptyReaderParticipationData(),
      health: 'corruptStoredData',
    }
  }

  if (!isPlainObject(parsed)) {
    return {
      data: emptyReaderParticipationData(),
      health: 'corruptStoredData',
    }
  }

  const schemaVersion = parsed.schemaVersion
  if (typeof schemaVersion === 'number' && Number.isInteger(schemaVersion) && schemaVersion > 1) {
    return {
      data: emptyReaderParticipationData(),
      health: 'unsupportedNewerSchema',
    }
  }

  if (schemaVersion !== 1 || !isPlainObject(parsed.data)) {
    return {
      data: emptyReaderParticipationData(),
      health: 'corruptStoredData',
    }
  }

  const rawData = parsed.data
  if (
    (rawData.completedChallenges !== undefined && !isPlainObject(rawData.completedChallenges))
    || (rawData.inProgressChallenges !== undefined && !isPlainObject(rawData.inProgressChallenges))
    || (rawData.savedChallenges !== undefined && !isPlainObject(rawData.savedChallenges))
    || (rawData.savedScriptures !== undefined && !Array.isArray(rawData.savedScriptures))
    || (
      rawData.lastOpenedChallenge !== undefined
      && rawData.lastOpenedChallenge !== null
      && !isPlainObject(rawData.lastOpenedChallenge)
    )
  ) {
    return {
      data: emptyReaderParticipationData(),
      health: 'corruptStoredData',
    }
  }

  const completedChallenges: Record<string, CompletedChallengeRecord> = {}
  if (rawData.completedChallenges) {
    for (const [rawId, value] of Object.entries(rawData.completedChallenges)) {
      const challengeId = parseStoredChallengeId(rawId, allowedNamespace)
      if (!challengeId || !isPlainObject(value)) continue
      const completedOn = parseLocalCalendarDate(value.completedOn)
      if (!completedOn) continue
      completedChallenges[challengeId] = Object.freeze({ completedOn })
    }
  }

  const savedChallenges: Record<string, SavedChallengeRecord> = {}
  if (rawData.savedChallenges) {
    for (const [rawId, value] of Object.entries(rawData.savedChallenges)) {
      const challengeId = parseStoredChallengeId(rawId, allowedNamespace)
      if (!challengeId || !isPlainObject(value)) continue
      const savedOn = parseLocalCalendarDate(value.savedOn)
      if (!savedOn) continue
      savedChallenges[challengeId] = Object.freeze({ savedOn })
    }
  }

  const inProgressChallenges: Record<string, ChallengeResumeRecord> = {}
  if (rawData.inProgressChallenges) {
    for (const [rawId, value] of Object.entries(rawData.inProgressChallenges)) {
      const challengeId = parseStoredChallengeId(rawId, allowedNamespace)
      if (!challengeId || !isPlainObject(value)) continue
      if (Object.hasOwn(completedChallenges, challengeId)) continue
      const updatedOn = parseLocalCalendarDate(value.updatedOn)
      if (!updatedOn) continue
      const screenId = typeof value.screenId === 'string' && value.screenId.trim().length > 0
        ? value.screenId.trim()
        : undefined
      inProgressChallenges[challengeId] = Object.freeze({
        ...(screenId !== undefined ? { screenId } : {}),
        updatedOn,
      })
    }
  }

  const savedScriptures: SavedScriptureRecord[] = []
  const seenScriptureKeys = new Set<string>()
  if (rawData.savedScriptures) {
    for (const item of rawData.savedScriptures) {
      if (!isPlainObject(item) || typeof item.reference !== 'string') continue
      const savedOn = parseLocalCalendarDate(item.savedOn)
      if (!savedOn) continue
      const normalized = normalizeSavedScriptureInput(
        {
          reference: item.reference,
          translation: typeof item.translation === 'string' || item.translation === null
            ? item.translation
            : undefined,
          sourceChallengeId: typeof item.sourceChallengeId === 'string'
            ? (item.sourceChallengeId as never)
            : undefined,
        },
        allowedNamespace,
      )
      if (!normalized || seenScriptureKeys.has(normalized.key)) continue
      seenScriptureKeys.add(normalized.key)
      savedScriptures.push(
        Object.freeze({
          key: normalized.key,
          reference: normalized.reference,
          translation: normalized.translation,
          savedOn,
          ...(normalized.sourceChallengeId ? { sourceChallengeId: normalized.sourceChallengeId } : {}),
        }),
      )
    }
  }

  let lastOpenedChallenge: LastOpenedChallengePointer | null = null
  if (isPlainObject(rawData.lastOpenedChallenge)) {
    const challengeId = parseStoredChallengeId(rawData.lastOpenedChallenge.challengeId, allowedNamespace)
    const openedOn = parseLocalCalendarDate(rawData.lastOpenedChallenge.openedOn)
    if (challengeId && openedOn) {
      const resumeDismissedOn = parseLocalCalendarDate(rawData.lastOpenedChallenge.resumeDismissedOn)
      lastOpenedChallenge = Object.freeze({
        challengeId,
        openedOn,
        ...(resumeDismissedOn ? { resumeDismissedOn } : {}),
      })
    }
  }

  const isEmpty =
    Object.keys(completedChallenges).length === 0
    && Object.keys(inProgressChallenges).length === 0
    && Object.keys(savedChallenges).length === 0
    && savedScriptures.length === 0
    && lastOpenedChallenge === null

  return {
    data: isEmpty
      ? emptyReaderParticipationData()
      : Object.freeze({
          completedChallenges: Object.freeze(completedChallenges),
          inProgressChallenges: Object.freeze(inProgressChallenges),
          savedChallenges: Object.freeze(savedChallenges),
          savedScriptures: Object.freeze(savedScriptures),
          lastOpenedChallenge,
        }),
    health: 'ok',
  }
}

export interface EnvelopePersistenceAdapterOptions {
  readonly storageKey: string
  readonly driver: KeyValueStorageDriver
  readonly allowedNamespace?: ChallengeIdentityNamespace
}

export function createEnvelopePersistenceAdapter(
  options: EnvelopePersistenceAdapterOptions,
): ParticipationPersistenceAdapter {
  const { storageKey, driver, allowedNamespace = 'cms' } = options

  let cachedRaw: string | null | undefined
  let cachedLoadResult: AdapterLoadResult | undefined
  let pendingClear = false

  function parseCached(raw: string | null): AdapterLoadResult {
    if (cachedLoadResult !== undefined && raw === cachedRaw) {
      return cachedLoadResult
    }
    const parsed = parseParticipationEnvelope(raw, allowedNamespace)
    cachedRaw = raw
    cachedLoadResult = parsed
    return parsed
  }

  function load(): MaybePromise<AdapterLoadResult> {
    if (pendingClear) {
      // A prior clear failed: retry removing stored data before reading anything.
      let removeOrPromise: MaybePromise<void>
      try {
        removeOrPromise = driver.removeItem(storageKey)
      } catch {
        return {
          data: emptyReaderParticipationData(),
          health: 'storageUnavailable',
        }
      }

      const applyPendingClearOnLoad = (): AdapterLoadResult => {
        pendingClear = false
        cachedRaw = null
        cachedLoadResult = {
          data: emptyReaderParticipationData(),
          health: 'ok',
        }
        return cachedLoadResult
      }

      if (isPromiseLike(removeOrPromise)) {
        return removeOrPromise.then(
          applyPendingClearOnLoad,
          () => ({
            data: emptyReaderParticipationData(),
            health: 'storageUnavailable' as const,
          }),
        )
      }

      return applyPendingClearOnLoad()
    }

    let rawOrPromise: MaybePromise<string | null>
    try {
      rawOrPromise = driver.getItem(storageKey)
    } catch {
      return {
        data: emptyReaderParticipationData(),
        health: 'storageUnavailable',
      }
    }

    if (isPromiseLike(rawOrPromise)) {
      return rawOrPromise.then(
        raw => parseCached(raw),
        () => ({
          data: emptyReaderParticipationData(),
          health: 'storageUnavailable' as const,
        }),
      )
    }

    return parseCached(rawOrPromise)
  }

  function flushAfterRead(
    rawCurrent: string | null,
    commands: readonly ParticipationCommand[],
    signal?: AbortSignal,
  ): MaybePromise<AdapterFlushResult> {
    // Check abort signal after reading storage and before issuing any `setItem`.
    if (signal?.aborted) {
      return {
        ok: false,
        committedData: null,
        health: 'writeFailed',
      }
    }

    const currentParsed = parseCached(rawCurrent)
    if (
      currentParsed.health === 'corruptStoredData'
      || currentParsed.health === 'unsupportedNewerSchema'
    ) {
      // Never silently overwrite corrupt or newer-schema payloads in storage.
      return {
        ok: false,
        committedData: null,
        health: currentParsed.health,
      }
    }

    const diskBase = currentParsed.data
    const nextData = replayParticipationCommands(diskBase, commands, allowedNamespace)
    const serialized = serializeParticipationEnvelope(nextData)

    if (rawCurrent === serialized) {
      return {
        ok: true,
        committedData: nextData,
        health: 'ok',
      }
    }

    let writeOrPromise: MaybePromise<void>
    try {
      writeOrPromise = driver.setItem(storageKey, serialized)
    } catch {
      return {
        ok: false,
        committedData: diskBase,
        health: 'writeFailed',
      }
    }

    if (isPromiseLike(writeOrPromise)) {
      return writeOrPromise.then(
        () => {
          cachedRaw = serialized
          cachedLoadResult = { data: nextData, health: 'ok' }
          return {
            ok: true as const,
            committedData: nextData,
            health: 'ok' as const,
          }
        },
        () => ({
          ok: false as const,
          committedData: diskBase,
          health: 'writeFailed' as const,
        }),
      )
    }

    cachedRaw = serialized
    cachedLoadResult = { data: nextData, health: 'ok' }
    return {
      ok: true,
      committedData: nextData,
      health: 'ok',
    }
  }

  function flushCommands(
    commands: readonly ParticipationCommand[],
    _fallbackBase: ReaderParticipationData,
    signal?: AbortSignal,
  ): MaybePromise<AdapterFlushResult> {
    if (signal?.aborted) {
      return {
        ok: false,
        committedData: null,
        health: 'writeFailed',
      }
    }

    if (pendingClear) {
      // A prior clear failed: confirm storage is cleared before flushing new commands.
      let removeOrPromise: MaybePromise<void>
      try {
        removeOrPromise = driver.removeItem(storageKey)
      } catch {
        return {
          ok: false,
          committedData: null,
          health: 'storageUnavailable',
        }
      }

      const proceedAfterClear = (): MaybePromise<AdapterFlushResult> => {
        pendingClear = false
        cachedRaw = null
        cachedLoadResult = {
          data: emptyReaderParticipationData(),
          health: 'ok',
        }
        return flushAfterRead(null, commands, signal)
      }

      if (isPromiseLike(removeOrPromise)) {
        return removeOrPromise.then(
          proceedAfterClear,
          () => ({
            ok: false as const,
            committedData: null,
            health: 'storageUnavailable' as const,
          }),
        )
      }

      return proceedAfterClear()
    }

    let rawOrPromise: MaybePromise<string | null>
    try {
      rawOrPromise = driver.getItem(storageKey)
    } catch {
      return {
        ok: false,
        committedData: null,
        health: 'storageUnavailable',
      }
    }

    if (isPromiseLike(rawOrPromise)) {
      return rawOrPromise.then(
        raw => flushAfterRead(raw, commands, signal),
        () => ({
          ok: false as const,
          committedData: null,
          health: 'storageUnavailable' as const,
        }),
      )
    }

    return flushAfterRead(rawOrPromise, commands, signal)
  }

  function clear(): MaybePromise<AdapterClearResult> {
    pendingClear = true
    let removeOrPromise: MaybePromise<void>
    try {
      removeOrPromise = driver.removeItem(storageKey)
    } catch {
      return {
        ok: false,
        health: 'storageUnavailable',
      }
    }

    if (isPromiseLike(removeOrPromise)) {
      return removeOrPromise.then(
        () => {
          pendingClear = false
          cachedRaw = null
          cachedLoadResult = {
            data: emptyReaderParticipationData(),
            health: 'ok',
          }
          return {
            ok: true,
            health: 'ok' as const,
          }
        },
        () => ({
          ok: false,
          health: 'storageUnavailable' as const,
        }),
      )
    }

    pendingClear = false
    cachedRaw = null
    cachedLoadResult = {
      data: emptyReaderParticipationData(),
      health: 'ok',
    }
    return {
      ok: true,
      health: 'ok',
    }
  }

  const adapter: ParticipationPersistenceAdapter = {
    load,
    flushCommands,
    clear,
    ...(driver.onExternalChange
      ? {
          subscribeExternalChanges(listener: () => void) {
            return driver.onExternalChange!(storageKey, listener)
          },
        }
      : {}),
  }

  return adapter
}
