import {
  isPromiseLike,
  type MaybePromise,
  type PersistenceHealth,
} from '../participation/persistence.ts'
import type {
  LocalCalendarDate,
  PublicationYearMonth,
} from '../participation/types.ts'
import {
  createEmptyShelfState,
  createFirstPostRolloverResumeSeam,
} from '../shelf/policy.ts'
import type {
  MonthlyRolloverParams,
  PutAwayShelfMonthParams,
  RolloverResult,
  SelectShelfMonthParams,
  SetActiveFocusMonthParams,
  SetShelfMonthProtectionParams,
  ShelfActionResult,
  ShelfState,
} from '../shelf/types.ts'
import {
  areShelfEntriesEqual,
  emptyPersistedShelfPayload,
  reduceShelfCommand,
  replayShelfCommands,
  replayShelfCommandsWithOutcomes,
} from './persistence.ts'
import type {
  GuestShelfPersistedPayload,
  ReduceShelfCommandOutcome,
  ShelfAdapterClearResult,
  ShelfAdapterFlushResult,
  ShelfAdapterLoadResult,
  ShelfCommand,
  ShelfPersistenceAdapter,
  ShelfRolloverWatermark,
} from './types.ts'

/**
 * Platform-neutral reactive store for durable guest Shelf state (Phase 05 / R08-5 / Issue #162).
 *
 * Architectural guarantees:
 * - Zero direct browser (`window`, `localStorage`) or React dependencies.
 * - Supports both synchronous drivers (web `localStorage`) and asynchronous drivers
 *   (iOS/Android Capacitor Preferences).
 * - `getSnapshot()` returns an `Object.is`-cached immutable reference compatible with React 19
 *   `useSyncExternalStore`.
 * - Commands dispatched before async hydration finishes or during transient write failures remain
 *   in `pendingCommands`, rebasing cleanly onto committed storage without losing reader choices.
 * - Action result contract: `ok: true` means the command was accepted by Shelf policy against the
 *   hydrated/rebased state (and is reflected in `getSnapshot()`). On healthy storage, durability
 *   is committed before the Promise resolves. On transient write failure (`health: 'writeFailed'`
 *   or `'storageUnavailable'`), the command remains queued in `pendingCommands` (`hasPendingWrites: true`)
 *   for retry via `flushPending()` while the Promise resolves with the policy-replay outcome; callers
 *   should inspect `getSnapshot().health` / `hasPendingWrites` to distinguish durable commits from
 *   pending-retry writes. Commands canceled by `clearLocalData()` or `dispose()` resolve `ok: false`.
 * - All adapter I/O is serialized on a strict FIFO queue combined with a monotonic reset epoch and
 *   `AbortSignal`, guaranteeing that a user-initiated `clearLocalData()` can NEVER be undone in
 *   memory or in storage by an earlier delayed read or write completing afterward.
 */

export type GuestShelfStoreStatus = 'hydrating' | 'ready'

export interface GuestShelfSnapshot {
  readonly status: GuestShelfStoreStatus
  readonly state: ShelfState
  readonly rolloverWatermark: ShelfRolloverWatermark | null
  readonly hasPendingWrites: boolean
  readonly health: PersistenceHealth
}

export interface GuestShelfStore {
  getSnapshot(): GuestShelfSnapshot
  subscribe(listener: () => void): () => void
  whenReady(): Promise<void>
  select(
    params: SelectShelfMonthParams,
  ): Promise<ShelfActionResult<'added' | 'replaced' | 'promotedToProtected'>>
  protect(params: {
    readonly yearMonth: PublicationYearMonth | string
    readonly updatedOn?: LocalCalendarDate | string
  }): Promise<ShelfActionResult<'protectionUpdated'>>
  unprotect(params: {
    readonly yearMonth: PublicationYearMonth | string
    readonly updatedOn?: LocalCalendarDate | string
  }): Promise<ShelfActionResult<'protectionUpdated'>>
  setProtection(
    params: SetShelfMonthProtectionParams,
  ): Promise<ShelfActionResult<'protectionUpdated'>>
  putAway(
    params: PutAwayShelfMonthParams | PublicationYearMonth | string,
  ): Promise<ShelfActionResult<'removed' | 'noop'>>
  setFocus(
    params: SetActiveFocusMonthParams | PublicationYearMonth | string | null,
  ): Promise<ShelfActionResult<'focusUpdated'>>
  clearFocus(
    updatedOn?: LocalCalendarDate,
  ): Promise<ShelfActionResult<'focusUpdated'>>
  evaluateMonthlyRollover(params: MonthlyRolloverParams): Promise<RolloverResult>
  applyState(
    state: ShelfState,
    referenceCurrentMonth?: PublicationYearMonth | string,
    expectedState?: ShelfState,
  ): Promise<ShelfActionResult<'stateApplied'>>
  flushPending(): Promise<void>
  clearLocalData(): Promise<void>
  dispose(): void
}

interface TaggedShelfCommand {
  readonly id: number
  readonly epoch: number
  readonly command: ShelfCommand
}

function stabilizeShelfState(prev: ShelfState, next: ShelfState): ShelfState {
  if (prev === next) return prev

  const months = areShelfEntriesEqual(prev.months, next.months) ? prev.months : next.months
  const activeFocusMonth = (prev.activeFocusMonth ?? null) === (next.activeFocusMonth ?? null)
    ? prev.activeFocusMonth
    : next.activeFocusMonth
  const updatedOn = prev.updatedOn === next.updatedOn ? prev.updatedOn : next.updatedOn

  if (
    months === prev.months
    && activeFocusMonth === prev.activeFocusMonth
    && updatedOn === prev.updatedOn
  ) {
    return prev
  }

  return Object.freeze({
    months,
    activeFocusMonth: activeFocusMonth ?? null,
    ...(updatedOn ? { updatedOn } : {}),
  })
}

function areWatermarksEqual(
  left: ShelfRolloverWatermark | null,
  right: ShelfRolloverWatermark | null,
): boolean {
  if (left === right) return true
  if (!left || !right) return false
  return (
    left.lastNewCurrentYearMonth === right.lastNewCurrentYearMonth
    && left.lastEndingYearMonth === right.lastEndingYearMonth
    && left.lastDisposition === right.lastDisposition
  )
}

export function createGuestShelfStore(
  adapter: ShelfPersistenceAdapter,
): GuestShelfStore {
  let status: GuestShelfStoreStatus = 'hydrating'
  let committedPayload: GuestShelfPersistedPayload = emptyPersistedShelfPayload()
  let pendingCommands: TaggedShelfCommand[] = []
  let health: PersistenceHealth = 'ok'
  let pendingClear = false
  let epoch = 0
  let nextCommandId = 1
  let activeAbortController = new AbortController()
  let disposed = false
  const commandOutcomesById = new Map<number, ReduceShelfCommandOutcome>()

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

  function computeEffectivePayload(): GuestShelfPersistedPayload {
    if (pendingCommands.length === 0) {
      return committedPayload
    }
    return replayShelfCommands(
      committedPayload,
      pendingCommands.map(entry => entry.command),
    )
  }

  let cachedSnapshot: GuestShelfSnapshot = Object.freeze({
    status,
    state: committedPayload.state,
    rolloverWatermark: committedPayload.rolloverWatermark,
    hasPendingWrites: false,
    health,
  })

  function updateSnapshot(notify: boolean): void {
    const candidate = computeEffectivePayload()
    const stableState = stabilizeShelfState(cachedSnapshot.state, candidate.state)
    const stableWatermark = areWatermarksEqual(
      cachedSnapshot.rolloverWatermark,
      candidate.rolloverWatermark,
    )
      ? cachedSnapshot.rolloverWatermark
      : candidate.rolloverWatermark
    const nextHasPending = pendingCommands.length > 0

    if (
      cachedSnapshot.status === status
      && cachedSnapshot.state === stableState
      && cachedSnapshot.rolloverWatermark === stableWatermark
      && cachedSnapshot.hasPendingWrites === nextHasPending
      && cachedSnapshot.health === health
    ) {
      return
    }

    cachedSnapshot = Object.freeze({
      status,
      state: stableState,
      rolloverWatermark: stableWatermark,
      hasPendingWrites: nextHasPending,
      health,
    })

    if (notify && !disposed && listeners.size > 0) {
      for (const listener of [...listeners]) {
        listener()
      }
    }
  }

  const initialEpoch = epoch
  const readyPromise = enqueueIo(() => {
    let loadOrPromise: MaybePromise<ShelfAdapterLoadResult>
    try {
      loadOrPromise = adapter.load()
    } catch {
      loadOrPromise = {
        payload: emptyPersistedShelfPayload(),
        health: 'storageUnavailable',
      }
    }

    const applyInitialLoad = (result: ShelfAdapterLoadResult, notify: boolean) => {
      if (disposed || initialEpoch !== epoch) {
        return
      }
      committedPayload = result.payload
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
              payload: emptyPersistedShelfPayload(),
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

      if (pendingClear) {
        let clearOrPromise: MaybePromise<ShelfAdapterClearResult>
        try {
          clearOrPromise = adapter.clear()
        } catch {
          clearOrPromise = {
            ok: false,
            health: 'storageUnavailable',
          }
        }

        const proceedAfterPendingClear = (clearResult: ShelfAdapterClearResult) => {
          if (disposed || targetEpoch !== epoch) return
          if (!clearResult.ok) {
            health = clearResult.health
            updateSnapshot(true)
            return
          }
          pendingClear = false
          health = 'ok'
          return performFlush()
        }

        if (isPromiseLike(clearOrPromise)) {
          return clearOrPromise.then(proceedAfterPendingClear, () => {
            if (disposed || targetEpoch !== epoch) return
            health = 'storageUnavailable'
            updateSnapshot(true)
          })
        }

        return proceedAfterPendingClear(clearOrPromise)
      }

      return performFlush()

      function performFlush(): MaybePromise<void> {
        if (disposed || targetEpoch !== epoch) {
          return
        }
        const batch = pendingCommands.filter(entry => entry.epoch === targetEpoch)
        if (batch.length === 0) {
          return
        }

        const commandsToFlush = batch.map(entry => entry.command)
        const flushedIds = new Set(batch.map(entry => entry.id))
        const committedBeforeFlush = committedPayload

        let flushOrPromise: MaybePromise<ShelfAdapterFlushResult>
        try {
          flushOrPromise = adapter.flushCommands(commandsToFlush, committedBeforeFlush, signal)
        } catch {
          flushOrPromise = {
            ok: false,
            committedPayload: null,
            health: 'writeFailed',
          }
        }

        const applyFlushResult = (result: ShelfAdapterFlushResult) => {
          if (disposed || targetEpoch !== epoch) {
            return
          }
          const outcomeBase = result.ok
            ? committedBeforeFlush
            : (result.committedPayload ?? committedBeforeFlush)
          const outcomes =
            result.commandOutcomes && result.commandOutcomes.length === batch.length
              ? result.commandOutcomes
              : replayShelfCommandsWithOutcomes(outcomeBase, commandsToFlush).outcomes

          for (let i = 0; i < batch.length; i += 1) {
            const entry = batch[i]!
            const outcome = outcomes[i]!
            commandOutcomesById.set(entry.id, outcome)
          }

          if (result.ok) {
            committedPayload = result.committedPayload
            pendingCommands = pendingCommands.filter(entry => !flushedIds.has(entry.id))
            health = 'ok'
          } else {
            if (result.committedPayload !== null) {
              committedPayload = result.committedPayload
            }
            health = result.health
          }
          updateSnapshot(true)
        }

        if (isPromiseLike(flushOrPromise)) {
          return flushOrPromise.then(applyFlushResult, () =>
            applyFlushResult({
              ok: false,
              committedPayload: null,
              health: 'writeFailed',
            }),
          )
        }

        applyFlushResult(flushOrPromise)
      }
    })
  }

  const unsubscribeExternal = adapter.subscribeExternalChanges
    ? adapter.subscribeExternalChanges(() => {
        if (disposed) return
        const refreshEpoch = epoch
        void enqueueIo(() => {
          if (disposed || refreshEpoch !== epoch) return

          if (pendingClear) {
            let clearOrPromise: MaybePromise<ShelfAdapterClearResult>
            try {
              clearOrPromise = adapter.clear()
            } catch {
              clearOrPromise = {
                ok: false,
                health: 'storageUnavailable',
              }
            }

            const applyExternalClear = (result: ShelfAdapterClearResult) => {
              if (disposed || refreshEpoch !== epoch) return
              if (result.ok) {
                pendingClear = false
                health = 'ok'
              } else {
                health = result.health
              }
              status = 'ready'
              updateSnapshot(true)
            }

            if (isPromiseLike(clearOrPromise)) {
              return clearOrPromise.then(applyExternalClear, () => {
                if (disposed || refreshEpoch !== epoch) return
                health = 'storageUnavailable'
                status = 'ready'
                updateSnapshot(true)
              })
            }

            applyExternalClear(clearOrPromise)
            return
          }

          let loadOrPromise: MaybePromise<ShelfAdapterLoadResult>
          try {
            loadOrPromise = adapter.load()
          } catch {
            loadOrPromise = {
              payload: emptyPersistedShelfPayload(),
              health: 'storageUnavailable',
            }
          }

          const applyExternalLoad = (result: ShelfAdapterLoadResult) => {
            if (disposed || refreshEpoch !== epoch) return
            if (result.health === 'ok') {
              committedPayload = result.payload
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
                payload: emptyPersistedShelfPayload(),
                health: 'storageUnavailable',
              }),
            )
          }

          applyExternalLoad(loadOrPromise)
        })
      })
    : undefined

  function dispatchCommand<TResult>(
    command: ShelfCommand,
    extractResult: (outcome: ReturnType<typeof reduceShelfCommand>) => TResult,
    canceledResult: (reason: 'disposed' | 'cleared') => TResult,
  ): Promise<TResult> {
    if (disposed) {
      return Promise.resolve(canceledResult('disposed'))
    }

    const previewOutcome = reduceShelfCommand(computeEffectivePayload(), command)
    if (
      status === 'ready'
      && pendingCommands.length === 0
      && health === 'ok'
      && inFlightCount === 0
      && !previewOutcome.changed
    ) {
      return Promise.resolve(extractResult(previewOutcome))
    }

    const commandEpoch = epoch
    const tagged: TaggedShelfCommand = {
      id: nextCommandId,
      epoch: commandEpoch,
      command,
    }
    nextCommandId += 1
    pendingCommands = [...pendingCommands, tagged]
    updateSnapshot(true)

    return scheduleFlush(commandEpoch).then(() => {
      const committedOutcome = commandOutcomesById.get(tagged.id)
      commandOutcomesById.delete(tagged.id)
      if (disposed) {
        return canceledResult('disposed')
      }
      if (commandEpoch !== epoch) {
        return canceledResult('cleared')
      }
      if (committedOutcome) {
        return extractResult(committedOutcome)
      }
      return extractResult(reduceShelfCommand(committedPayload, command))
    })
  }

  function createCanceledActionResult<TAction extends string>(
    reason: 'disposed' | 'cleared',
  ): ShelfActionResult<TAction> {
    return {
      ok: false,
      state: reason === 'cleared' ? committedPayload.state : createEmptyShelfState(),
      error: 'invalidStateShape',
      message:
        reason === 'disposed'
          ? 'Store has been disposed.'
          : 'Shelf command was canceled because local data was cleared.',
    }
  }

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

    select(params: SelectShelfMonthParams) {
      return dispatchCommand(
        { type: 'select', params },
        outcome => outcome.actionResult as ShelfActionResult<'added' | 'replaced' | 'promotedToProtected'>,
        reason => createCanceledActionResult(reason),
      )
    },

    protect(params) {
      return dispatchCommand(
        {
          type: 'setProtection',
          params: { yearMonth: params.yearMonth, isProtected: true, updatedOn: params.updatedOn },
        },
        outcome => outcome.actionResult as ShelfActionResult<'protectionUpdated'>,
        reason => createCanceledActionResult(reason),
      )
    },

    unprotect(params) {
      return dispatchCommand(
        {
          type: 'setProtection',
          params: { yearMonth: params.yearMonth, isProtected: false, updatedOn: params.updatedOn },
        },
        outcome => outcome.actionResult as ShelfActionResult<'protectionUpdated'>,
        reason => createCanceledActionResult(reason),
      )
    },

    setProtection(params: SetShelfMonthProtectionParams) {
      return dispatchCommand(
        { type: 'setProtection', params },
        outcome => outcome.actionResult as ShelfActionResult<'protectionUpdated'>,
        reason => createCanceledActionResult(reason),
      )
    },

    putAway(params) {
      return dispatchCommand(
        { type: 'putAway', params },
        outcome => outcome.actionResult as ShelfActionResult<'removed' | 'noop'>,
        reason => createCanceledActionResult(reason),
      )
    },

    setFocus(params) {
      return dispatchCommand(
        { type: 'setFocus', params },
        outcome => outcome.actionResult as ShelfActionResult<'focusUpdated'>,
        reason => createCanceledActionResult(reason),
      )
    },

    clearFocus(updatedOn?: LocalCalendarDate) {
      return dispatchCommand(
        { type: 'clearFocus', updatedOn },
        outcome => outcome.actionResult as ShelfActionResult<'focusUpdated'>,
        reason => createCanceledActionResult(reason),
      )
    },

    evaluateMonthlyRollover(params: MonthlyRolloverParams) {
      return dispatchCommand(
        { type: 'monthlyRollover', params },
        outcome => outcome.rolloverResult!,
        reason => ({
          ok: false,
          state: reason === 'cleared' ? committedPayload.state : createEmptyShelfState(),
          disposition: 'rejectedInvalidMonth',
          endingYearMonth: null,
          admittedEntry: null,
          evictedEntry: null,
          resumeSuggestionSeam: createFirstPostRolloverResumeSeam({
            endingYearMonth: null,
            extension: params.resumeExtension,
          }),
          message:
            reason === 'disposed'
              ? 'Store has been disposed.'
              : 'Shelf command was canceled because local data was cleared.',
        }),
      )
    },

    applyState(state, referenceCurrentMonth, expectedState) {
      return dispatchCommand(
        { type: 'applyValidatedState', state, referenceCurrentMonth, expectedState },
        outcome => outcome.actionResult as ShelfActionResult<'stateApplied'>,
        reason => createCanceledActionResult(reason),
      )
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

      pendingClear = true
      status = 'ready'
      committedPayload = emptyPersistedShelfPayload()
      pendingCommands = []
      commandOutcomesById.clear()
      health = 'ok'
      updateSnapshot(true)

      return enqueueIo(() => {
        if (disposed) return
        let clearOrPromise: MaybePromise<ShelfAdapterClearResult>
        try {
          clearOrPromise = adapter.clear()
        } catch {
          clearOrPromise = {
            ok: false,
            health: 'storageUnavailable',
          }
        }

        const applyClearResult = (result: ShelfAdapterClearResult) => {
          if (disposed || clearEpoch !== epoch) return
          committedPayload = emptyPersistedShelfPayload()
          if (result.ok) {
            pendingClear = false
            health = 'ok'
          } else {
            pendingClear = true
            health = result.health
          }
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
      commandOutcomesById.clear()
      listeners.clear()
      unsubscribeExternal?.()
    },
  }
}
