import {
  distinctCompletedChallengeCount,
  emptyReaderParticipationData,
  reduceParticipationCommand,
  replayParticipationCommands,
} from './model.ts'
import {
  isPromiseLike,
  type AdapterClearResult,
  type AdapterFlushResult,
  type AdapterLoadResult,
  type MaybePromise,
  type ParticipationPersistenceAdapter,
  type PersistenceHealth,
} from './persistence.ts'
import type {
  ChallengeIdentityNamespace,
  ParticipationCommand,
  ReaderParticipationData,
} from './types.ts'

/**
 * Platform-neutral reactive store for durable reader participation state (Track A, A3 / Issue #46).
 *
 * Architectural guarantees:
 * - Zero direct browser (`window`, `localStorage`) or React dependencies.
 * - Supports both synchronous adapters (web `localStorage`) and asynchronous adapters (future
 *   native mobile storage such as Capacitor Preferences or SQLite).
 * - `getSnapshot()` returns an `Object.is`-cached immutable reference compatible with React 19
 *   `useSyncExternalStore`.
 * - Commands dispatched before async hydration finishes or during transient write failures remain
 *   in `pendingCommands`, rebasing cleanly onto committed storage without losing progress.
 * - All adapter I/O is serialized on a strict FIFO queue combined with a monotonic reset epoch and
 *   `AbortSignal`, guaranteeing that a user-initiated `clearLocalData()` can NEVER be undone in
 *   memory or in storage by an earlier delayed read or write completing afterward.
 */

export type ReaderParticipationStoreStatus = 'hydrating' | 'ready'

export interface ReaderParticipationSnapshot {
  readonly status: ReaderParticipationStoreStatus
  readonly data: ReaderParticipationData
  readonly distinctCompletedCount: number
  readonly hasPendingWrites: boolean
  readonly health: PersistenceHealth
}

export interface ReaderParticipationStore {
  getSnapshot(): ReaderParticipationSnapshot
  subscribe(listener: () => void): () => void
  whenReady(): Promise<void>
  dispatch(command: ParticipationCommand): Promise<void>
  flushPending(): Promise<void>
  clearLocalData(): Promise<void>
  dispose(): void
}

export interface CreateReaderParticipationStoreOptions {
  readonly allowedNamespace?: ChallengeIdentityNamespace
}

interface TaggedCommand {
  readonly id: number
  readonly epoch: number
  readonly command: ParticipationCommand
}

function areRecordMapsEqual<T>(
  left: Readonly<Record<string, T>>,
  right: Readonly<Record<string, T>>,
  itemEqual: (a: T, b: T) => boolean,
): boolean {
  if (left === right) return true
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  for (const key of leftKeys) {
    if (!Object.hasOwn(right, key)) return false
    if (!itemEqual(left[key], right[key])) return false
  }
  return true
}

export function areParticipationDataEqual(
  left: ReaderParticipationData,
  right: ReaderParticipationData,
): boolean {
  if (left === right) return true

  if (left.lastOpenedChallenge !== right.lastOpenedChallenge) {
    if (!left.lastOpenedChallenge || !right.lastOpenedChallenge) return false
    if (
      left.lastOpenedChallenge.challengeId !== right.lastOpenedChallenge.challengeId
      || left.lastOpenedChallenge.openedOn !== right.lastOpenedChallenge.openedOn
      || left.lastOpenedChallenge.resumeDismissedOn !== right.lastOpenedChallenge.resumeDismissedOn
    ) {
      return false
    }
  }

  if (
    !areRecordMapsEqual(
      left.completedChallenges,
      right.completedChallenges,
      (a, b) => a.completedOn === b.completedOn,
    )
  ) {
    return false
  }

  if (
    !areRecordMapsEqual(
      left.inProgressChallenges,
      right.inProgressChallenges,
      (a, b) => a.screenId === b.screenId && a.updatedOn === b.updatedOn,
    )
  ) {
    return false
  }

  if (
    !areRecordMapsEqual(
      left.savedChallenges,
      right.savedChallenges,
      (a, b) => a.savedOn === b.savedOn,
    )
  ) {
    return false
  }

  if (left.savedScriptures !== right.savedScriptures) {
    if (left.savedScriptures.length !== right.savedScriptures.length) return false
    for (let i = 0; i < left.savedScriptures.length; i += 1) {
      const a = left.savedScriptures[i]
      const b = right.savedScriptures[i]
      if (
        a.key !== b.key
        || a.reference !== b.reference
        || a.translation !== b.translation
        || a.savedOn !== b.savedOn
        || a.sourceChallengeId !== b.sourceChallengeId
      ) {
        return false
      }
    }
  }

  return true
}

export function createReaderParticipationStore(
  adapter: ParticipationPersistenceAdapter,
  options: CreateReaderParticipationStoreOptions = {},
): ReaderParticipationStore {
  const allowedNamespace: ChallengeIdentityNamespace = options.allowedNamespace ?? 'cms'

  let status: ReaderParticipationStoreStatus = 'hydrating'
  let committedData: ReaderParticipationData = emptyReaderParticipationData()
  let pendingCommands: TaggedCommand[] = []
  let health: PersistenceHealth = 'ok'
  let epoch = 0
  let nextCommandId = 1
  let activeAbortController = new AbortController()
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

  function computeEffectiveData(): ReaderParticipationData {
    if (pendingCommands.length === 0) {
      return committedData
    }
    return replayParticipationCommands(
      committedData,
      pendingCommands.map(entry => entry.command),
      allowedNamespace,
    )
  }

  let cachedSnapshot: ReaderParticipationSnapshot = Object.freeze({
    status,
    data: committedData,
    distinctCompletedCount: 0,
    hasPendingWrites: false,
    health,
  })

  function updateSnapshot(notify: boolean): void {
    const candidateData = computeEffectiveData()
    const stableData = areParticipationDataEqual(cachedSnapshot.data, candidateData)
      ? cachedSnapshot.data
      : candidateData
    const nextCount = distinctCompletedChallengeCount(stableData)
    const nextHasPending = pendingCommands.length > 0

    if (
      cachedSnapshot.status === status
      && cachedSnapshot.data === stableData
      && cachedSnapshot.distinctCompletedCount === nextCount
      && cachedSnapshot.hasPendingWrites === nextHasPending
      && cachedSnapshot.health === health
    ) {
      return
    }

    cachedSnapshot = Object.freeze({
      status,
      data: stableData,
      distinctCompletedCount: nextCount,
      hasPendingWrites: nextHasPending,
      health,
    })

    if (notify && !disposed && listeners.size > 0) {
      for (const listener of [...listeners]) {
        listener()
      }
    }
  }

  // Initial hydration (synchronous when driver is sync; queued at head of `enqueueIo` when async)
  const initialEpoch = epoch
  const readyPromise = enqueueIo(() => {
    let loadOrPromise: MaybePromise<AdapterLoadResult>
    try {
      loadOrPromise = adapter.load()
    } catch {
      loadOrPromise = {
        data: emptyReaderParticipationData(),
        health: 'storageUnavailable',
      }
    }

    const applyInitialLoad = (result: AdapterLoadResult, notify: boolean) => {
      if (disposed || initialEpoch !== epoch) {
        return
      }
      committedData = result.data
      health = result.health
      status = 'ready'
      updateSnapshot(notify)
    }

    if (isPromiseLike(loadOrPromise)) {
      return loadOrPromise.then(
        result => applyInitialLoad(result, true),
        () =>
          applyInitialLoad(
            {
              data: emptyReaderParticipationData(),
              health: 'storageUnavailable',
            },
            true,
          ),
      )
    }

    applyInitialLoad(loadOrPromise, false)
  })

  function scheduleFlush(targetEpoch: number): Promise<void> {
    const signal = activeAbortController.signal
    return enqueueIo(() => {
      if (disposed || targetEpoch !== epoch) {
        return
      }
      const batch = pendingCommands.filter(entry => entry.epoch === targetEpoch)
      if (batch.length === 0) {
        return
      }

      const commandsToFlush = batch.map(entry => entry.command)
      const flushedIds = new Set(batch.map(entry => entry.id))

      let flushOrPromise: MaybePromise<AdapterFlushResult>
      try {
        flushOrPromise = adapter.flushCommands(commandsToFlush, committedData, signal)
      } catch {
        flushOrPromise = {
          ok: false,
          committedData: null,
          health: 'writeFailed',
        }
      }

      const applyFlushResult = (result: AdapterFlushResult) => {
        if (disposed || targetEpoch !== epoch) {
          // Stale flush from before a `clearLocalData()` reset — never mutate post-reset state.
          return
        }
        if (result.ok) {
          committedData = result.committedData
          pendingCommands = pendingCommands.filter(entry => !flushedIds.has(entry.id))
          health = 'ok'
        } else {
          if (result.committedData !== null) {
            committedData = result.committedData
          }
          health = result.health
        }
        updateSnapshot(true)
      }

      if (isPromiseLike(flushOrPromise)) {
        return flushOrPromise.then(applyFlushResult, () =>
          applyFlushResult({
            ok: false,
            committedData: null,
            health: 'writeFailed',
          }),
        )
      }

      applyFlushResult(flushOrPromise)
    })
  }

  const unsubscribeExternal = adapter.subscribeExternalChanges
    ? adapter.subscribeExternalChanges(() => {
        if (disposed) return
        const refreshEpoch = epoch
        void enqueueIo(() => {
          if (disposed || refreshEpoch !== epoch) return
          let loadOrPromise: MaybePromise<AdapterLoadResult>
          try {
            loadOrPromise = adapter.load()
          } catch {
            loadOrPromise = {
              data: emptyReaderParticipationData(),
              health: 'storageUnavailable',
            }
          }

          const applyExternalLoad = (result: AdapterLoadResult) => {
            if (disposed || refreshEpoch !== epoch) return
            if (result.health === 'ok') {
              committedData = result.data
              if (pendingCommands.length === 0) {
                health = 'ok'
              }
            } else {
              health = result.health
            }
            status = 'ready'
            updateSnapshot(true)
          }

          if (isPromiseLike(loadOrPromise)) {
            return loadOrPromise.then(applyExternalLoad, () =>
              applyExternalLoad({
                data: emptyReaderParticipationData(),
                health: 'storageUnavailable',
              }),
            )
          }

          applyExternalLoad(loadOrPromise)
        })
      })
    : undefined

  return {
    getSnapshot() {
      return cachedSnapshot
    },

    subscribe(listener: () => void) {
      if (disposed) {
        return () => {}
      }
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    whenReady() {
      return readyPromise
    },

    dispatch(command: ParticipationCommand): Promise<void> {
      if (disposed) return Promise.resolve()

      if (status === 'ready' && pendingCommands.length === 0 && health === 'ok') {
        const preview = reduceParticipationCommand(committedData, command, allowedNamespace)
        if (preview === committedData) {
          return Promise.resolve()
        }
      }

      const commandEpoch = epoch
      const tagged: TaggedCommand = {
        id: nextCommandId,
        epoch: commandEpoch,
        command,
      }
      nextCommandId += 1
      pendingCommands = [...pendingCommands, tagged]
      updateSnapshot(true)

      return scheduleFlush(commandEpoch)
    },

    flushPending(): Promise<void> {
      if (disposed) return Promise.resolve()
      if (pendingCommands.length === 0) {
        return inFlightCount > 0 ? ioTail : Promise.resolve()
      }
      return scheduleFlush(epoch)
    },

    clearLocalData(): Promise<void> {
      if (disposed) return Promise.resolve()

      epoch += 1
      const clearEpoch = epoch
      activeAbortController.abort()
      activeAbortController = new AbortController()

      status = 'ready'
      committedData = emptyReaderParticipationData()
      pendingCommands = []
      health = 'ok'
      updateSnapshot(true)

      return enqueueIo(() => {
        if (disposed) return
        let clearOrPromise: MaybePromise<AdapterClearResult>
        try {
          clearOrPromise = adapter.clear()
        } catch {
          clearOrPromise = {
            ok: false,
            health: 'storageUnavailable',
          }
        }

        const applyClearResult = (result: AdapterClearResult) => {
          if (disposed || clearEpoch !== epoch) return
          committedData = emptyReaderParticipationData()
          health = result.ok ? 'ok' : result.health
          updateSnapshot(true)
        }

        if (isPromiseLike(clearOrPromise)) {
          return clearOrPromise.then(applyClearResult, () =>
            applyClearResult({
              ok: false,
              health: 'storageUnavailable',
            }),
          )
        }

        applyClearResult(clearOrPromise)
      })
    },

    dispose() {
      if (disposed) return
      disposed = true
      activeAbortController.abort()
      listeners.clear()
      unsubscribeExternal?.()
    },
  }
}
