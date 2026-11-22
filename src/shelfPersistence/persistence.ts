import {
  isPromiseLike,
  type MaybePromise,
} from '../participation/persistence.ts'
import type { PublicationYearMonth } from '../participation/types.ts'
import {
  applyMonthlyRollover,
  clearActiveFocusMonth,
  createEmptyShelfState,
  createFirstPostRolloverResumeSeam,
  putAwayShelfMonth,
  selectShelfMonth,
  SHELF_CONFIRMATION_STALE_MESSAGE,
  setActiveFocusMonth,
  setShelfMonthProtection,
} from '../shelf/policy.ts'
import type {
  RolloverDisposition,
  RolloverResult,
  ShelfActionResult,
  ShelfState,
} from '../shelf/types.ts'
import {
  areShelfStatesEqual,
  getPreviousPublicationYearMonth,
  isHistoricalPublicationYearMonth,
  parseValidPublicationYearMonth,
  validateShelfState,
} from '../shelf/validation.ts'
import {
  GUEST_SHELF_STORAGE_KEY,
  SHELF_ENVELOPE_SCHEMA_VERSION,
  type CreateShelfPersistenceAdapterOptions,
  type GuestShelfEnvelopeV1,
  type GuestShelfPersistedPayload,
  type ReduceShelfCommandOutcome,
  type ShelfAdapterClearResult,
  type ShelfAdapterFlushResult,
  type ShelfAdapterLoadResult,
  type ShelfCommand,
  type ShelfPersistenceAdapter,
  type ShelfRolloverWatermark,
} from './types.ts'

const VALID_ROLLOVER_DISPOSITIONS: ReadonlySet<string> = new Set<RolloverDisposition>([
  'admittedToOpenSlot',
  'replacedOldestAutoAdmitted',
  'retainedInLibraryAllProtected',
  'retainedInLibraryNoCompletions',
  'alreadyOnShelf',
  'rejectedNotHistorical',
  'rejectedInvalidMonth',
])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function emptyPersistedShelfPayload(): GuestShelfPersistedPayload {
  return Object.freeze({
    state: createEmptyShelfState(),
    rolloverWatermark: null,
  })
}

export function serializeShelfEnvelope(payload: GuestShelfPersistedPayload): string {
  const envelope: GuestShelfEnvelopeV1 = {
    schemaVersion: SHELF_ENVELOPE_SCHEMA_VERSION,
    state: payload.state,
    ...(payload.rolloverWatermark ? { rolloverWatermark: payload.rolloverWatermark } : {}),
  }
  return JSON.stringify(envelope)
}

function parseRolloverWatermark(raw: unknown): {
  readonly valid: boolean
  readonly watermark: ShelfRolloverWatermark | null
} {
  if (raw === undefined || raw === null) {
    return { valid: true, watermark: null }
  }
  if (!isPlainObject(raw)) {
    return { valid: false, watermark: null }
  }

  const lastNewCurrentYearMonth = parseValidPublicationYearMonth(raw.lastNewCurrentYearMonth)
  const lastEndingYearMonth = parseValidPublicationYearMonth(raw.lastEndingYearMonth)
  if (!lastNewCurrentYearMonth || !lastEndingYearMonth) {
    return { valid: false, watermark: null }
  }
  if (!isHistoricalPublicationYearMonth(lastEndingYearMonth, lastNewCurrentYearMonth)) {
    return { valid: false, watermark: null }
  }
  if (typeof raw.lastDisposition !== 'string' || !VALID_ROLLOVER_DISPOSITIONS.has(raw.lastDisposition)) {
    return { valid: false, watermark: null }
  }

  return {
    valid: true,
    watermark: Object.freeze({
      lastNewCurrentYearMonth,
      lastEndingYearMonth,
      lastDisposition: raw.lastDisposition as RolloverDisposition,
    }),
  }
}

export function parseShelfEnvelope(
  raw: string | null,
  options: { readonly referenceCurrentMonth?: PublicationYearMonth | string } = {},
): ShelfAdapterLoadResult {
  if (raw === null || raw === '') {
    return {
      payload: emptyPersistedShelfPayload(),
      health: 'ok',
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {
      payload: emptyPersistedShelfPayload(),
      health: 'corruptStoredData',
    }
  }

  if (!isPlainObject(parsed)) {
    return {
      payload: emptyPersistedShelfPayload(),
      health: 'corruptStoredData',
    }
  }

  const schemaVersion = parsed.schemaVersion
  if (
    typeof schemaVersion === 'number'
    && Number.isInteger(schemaVersion)
    && schemaVersion > SHELF_ENVELOPE_SCHEMA_VERSION
  ) {
    return {
      payload: emptyPersistedShelfPayload(),
      health: 'unsupportedNewerSchema',
    }
  }

  if (schemaVersion !== SHELF_ENVELOPE_SCHEMA_VERSION || !isPlainObject(parsed.state)) {
    return {
      payload: emptyPersistedShelfPayload(),
      health: 'corruptStoredData',
    }
  }

  const validation = validateShelfState(parsed.state, {
    referenceCurrentMonth: options.referenceCurrentMonth,
  })
  if (!validation.valid || !validation.normalizedState) {
    return {
      payload: emptyPersistedShelfPayload(),
      health: 'corruptStoredData',
      diagnostics: validation.diagnostics,
    }
  }

  const watermarkCheck = parseRolloverWatermark(parsed.rolloverWatermark)
  if (!watermarkCheck.valid) {
    return {
      payload: emptyPersistedShelfPayload(),
      health: 'corruptStoredData',
    }
  }

  return {
    payload: Object.freeze({
      state: validation.normalizedState,
      rolloverWatermark: watermarkCheck.watermark,
    }),
    health: 'ok',
  }
}

export type { ReduceShelfCommandOutcome }

export function reduceShelfCommand(
  payload: GuestShelfPersistedPayload,
  command: ShelfCommand,
): ReduceShelfCommandOutcome {
  switch (command.type) {
    case 'select': {
      const result = selectShelfMonth(payload.state, command.params)
      if (!result.ok || result.state === payload.state) {
        return { payload, changed: false, actionResult: result }
      }
      return {
        payload: Object.freeze({
          state: result.state,
          rolloverWatermark: payload.rolloverWatermark,
        }),
        changed: true,
        actionResult: result,
      }
    }

    case 'putAway': {
      const result = putAwayShelfMonth(payload.state, command.params)
      if (!result.ok || result.state === payload.state) {
        return { payload, changed: false, actionResult: result }
      }
      return {
        payload: Object.freeze({
          state: result.state,
          rolloverWatermark: payload.rolloverWatermark,
        }),
        changed: true,
        actionResult: result,
      }
    }

    case 'setProtection': {
      const result = setShelfMonthProtection(payload.state, command.params)
      if (!result.ok || result.state === payload.state) {
        return { payload, changed: false, actionResult: result }
      }
      return {
        payload: Object.freeze({
          state: result.state,
          rolloverWatermark: payload.rolloverWatermark,
        }),
        changed: true,
        actionResult: result,
      }
    }

    case 'setFocus': {
      const result = setActiveFocusMonth(payload.state, command.params)
      if (!result.ok || result.state === payload.state) {
        return { payload, changed: false, actionResult: result }
      }
      return {
        payload: Object.freeze({
          state: result.state,
          rolloverWatermark: payload.rolloverWatermark,
        }),
        changed: true,
        actionResult: result,
      }
    }

    case 'clearFocus': {
      const nextState = clearActiveFocusMonth(payload.state, command.updatedOn)
      const result: ShelfActionResult<'focusUpdated'> = {
        ok: true,
        state: nextState,
        action: 'focusUpdated',
      }
      if (
        payload.state.activeFocusMonth === null
        && (command.updatedOn === undefined || payload.state.updatedOn === command.updatedOn)
      ) {
        return { payload, changed: false, actionResult: result }
      }
      return {
        payload: Object.freeze({
          state: nextState,
          rolloverWatermark: payload.rolloverWatermark,
        }),
        changed: true,
        actionResult: result,
      }
    }

    case 'monthlyRollover': {
      const newCurrentYm = parseValidPublicationYearMonth(command.params.newCurrentYearMonth)
      const endingYm = command.params.endingYearMonth
        ? parseValidPublicationYearMonth(command.params.endingYearMonth)
        : newCurrentYm
          ? getPreviousPublicationYearMonth(newCurrentYm)
          : null

      if (
        newCurrentYm
        && endingYm
        && isHistoricalPublicationYearMonth(endingYm, newCurrentYm)
        && payload.rolloverWatermark
        && payload.rolloverWatermark.lastNewCurrentYearMonth === newCurrentYm
        && payload.rolloverWatermark.lastEndingYearMonth === endingYm
      ) {
        const isStillOnShelf = payload.state.months.some(m => m.yearMonth === endingYm)
        const disposition: RolloverDisposition = isStillOnShelf
          ? 'alreadyOnShelf'
          : payload.rolloverWatermark.lastDisposition
        const idempotentResult: RolloverResult = {
          ok: true,
          state: payload.state,
          disposition,
          endingYearMonth: endingYm,
          admittedEntry: null,
          evictedEntry: null,
          resumeSuggestionSeam: createFirstPostRolloverResumeSeam({
            endingYearMonth: endingYm,
            extension: command.params.resumeExtension,
          }),
          message: `Rollover for ${endingYm} -> ${newCurrentYm} was already evaluated (idempotent watermark).`,
        }
        return { payload, changed: false, rolloverResult: idempotentResult }
      }

      const result = applyMonthlyRollover(payload.state, command.params)
      if (!result.ok || !newCurrentYm || !result.endingYearMonth) {
        return { payload, changed: false, rolloverResult: result }
      }

      const nextWatermark: ShelfRolloverWatermark = Object.freeze({
        lastNewCurrentYearMonth: newCurrentYm,
        lastEndingYearMonth: result.endingYearMonth,
        lastDisposition: result.disposition,
      })

      const watermarkChanged =
        !payload.rolloverWatermark
        || payload.rolloverWatermark.lastNewCurrentYearMonth !== nextWatermark.lastNewCurrentYearMonth
        || payload.rolloverWatermark.lastEndingYearMonth !== nextWatermark.lastEndingYearMonth
        || payload.rolloverWatermark.lastDisposition !== nextWatermark.lastDisposition

      if (result.state === payload.state && !watermarkChanged) {
        return { payload, changed: false, rolloverResult: result }
      }

      return {
        payload: Object.freeze({
          state: result.state,
          rolloverWatermark: nextWatermark,
        }),
        changed: true,
        rolloverResult: result,
      }
    }

    case 'applyValidatedState': {
      const { expectedState } = command
      if (expectedState && !areShelfStatesEqual(expectedState, payload.state)) {
        return {
          payload,
          changed: false,
          actionResult: {
            ok: false,
            state: payload.state,
            error: 'staleShelfConfirmation',
            message: SHELF_CONFIRMATION_STALE_MESSAGE,
          },
        }
      }

      const validation = validateShelfState(command.state, {
        referenceCurrentMonth: command.referenceCurrentMonth,
      })
      if (!validation.valid || !validation.normalizedState) {
        return {
          payload,
          changed: false,
          actionResult: {
            ok: false,
            state: payload.state,
            error: 'invalidStateShape',
            message: validation.diagnostics[0]?.reason ?? 'Invalid Shelf state shape.',
          },
        }
      }

      const nextState: ShelfState = validation.normalizedState
      return {
        payload: Object.freeze({
          state: nextState,
          rolloverWatermark: payload.rolloverWatermark,
        }),
        changed: true,
        actionResult: {
          ok: true,
          state: nextState,
          action: 'stateApplied',
        },
      }
    }
  }
}

export interface ReplayShelfCommandsResult {
  readonly payload: GuestShelfPersistedPayload
  readonly outcomes: readonly ReduceShelfCommandOutcome[]
}

export function replayShelfCommandsWithOutcomes(
  base: GuestShelfPersistedPayload,
  commands: readonly ShelfCommand[],
): ReplayShelfCommandsResult {
  let current = base
  const outcomes: ReduceShelfCommandOutcome[] = []
  for (const command of commands) {
    const outcome = reduceShelfCommand(current, command)
    outcomes.push(outcome)
    current = outcome.payload
  }
  return { payload: current, outcomes }
}

export function replayShelfCommands(
  base: GuestShelfPersistedPayload,
  commands: readonly ShelfCommand[],
): GuestShelfPersistedPayload {
  return replayShelfCommandsWithOutcomes(base, commands).payload
}

export function createShelfEnvelopePersistenceAdapter(
  options: CreateShelfPersistenceAdapterOptions,
): ShelfPersistenceAdapter {
  const storageKey = options.storageKey ?? GUEST_SHELF_STORAGE_KEY
  const { driver, referenceCurrentMonth } = options

  let cachedRaw: string | null | undefined
  let cachedLoadResult: ShelfAdapterLoadResult | undefined
  let pendingClear = false

  function parseCached(raw: string | null): ShelfAdapterLoadResult {
    if (cachedRaw !== undefined && raw === cachedRaw && cachedLoadResult !== undefined) {
      return cachedLoadResult
    }
    const parsed = parseShelfEnvelope(raw, { referenceCurrentMonth })
    cachedRaw = raw
    cachedLoadResult = parsed
    return parsed
  }

  function load(): MaybePromise<ShelfAdapterLoadResult> {
    if (pendingClear) {
      let removeOrPromise: MaybePromise<void>
      try {
        removeOrPromise = driver.removeItem(storageKey)
      } catch {
        return {
          payload: emptyPersistedShelfPayload(),
          health: 'storageUnavailable',
        }
      }

      const afterClear = (): ShelfAdapterLoadResult => {
        pendingClear = false
        cachedRaw = null
        cachedLoadResult = {
          payload: emptyPersistedShelfPayload(),
          health: 'ok',
        }
        return cachedLoadResult
      }

      if (isPromiseLike(removeOrPromise)) {
        return removeOrPromise.then(afterClear, () => ({
          payload: emptyPersistedShelfPayload(),
          health: 'storageUnavailable' as const,
        }))
      }
      return afterClear()
    }

    let rawOrPromise: MaybePromise<string | null>
    try {
      rawOrPromise = driver.getItem(storageKey)
    } catch {
      return {
        payload: emptyPersistedShelfPayload(),
        health: 'storageUnavailable',
      }
    }

    if (isPromiseLike(rawOrPromise)) {
      return rawOrPromise.then(
        raw => parseCached(raw),
        () => ({
          payload: emptyPersistedShelfPayload(),
          health: 'storageUnavailable' as const,
        }),
      )
    }

    return parseCached(rawOrPromise)
  }

  function flushAfterRead(
    rawCurrent: string | null,
    commands: readonly ShelfCommand[],
    signal?: AbortSignal,
  ): MaybePromise<ShelfAdapterFlushResult> {
    if (signal?.aborted) {
      return {
        ok: false,
        committedPayload: null,
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
        committedPayload: null,
        health: currentParsed.health,
      }
    }

    const diskBase = currentParsed.payload
    const { payload: nextPayload, outcomes } = replayShelfCommandsWithOutcomes(diskBase, commands)
    const serialized = serializeShelfEnvelope(nextPayload)

    if (rawCurrent === serialized) {
      return {
        ok: true,
        committedPayload: nextPayload,
        health: 'ok',
        commandOutcomes: outcomes,
      }
    }

    let writeOrPromise: MaybePromise<void>
    try {
      writeOrPromise = driver.setItem(storageKey, serialized)
    } catch {
      return {
        ok: false,
        committedPayload: diskBase,
        health: 'writeFailed',
        commandOutcomes: outcomes,
      }
    }

    if (isPromiseLike(writeOrPromise)) {
      return writeOrPromise.then(
        () => {
          cachedRaw = serialized
          cachedLoadResult = { payload: nextPayload, health: 'ok' }
          return {
            ok: true as const,
            committedPayload: nextPayload,
            health: 'ok' as const,
            commandOutcomes: outcomes,
          }
        },
        () => ({
          ok: false as const,
          committedPayload: diskBase,
          health: 'writeFailed' as const,
          commandOutcomes: outcomes,
        }),
      )
    }

    cachedRaw = serialized
    cachedLoadResult = { payload: nextPayload, health: 'ok' }
    return {
      ok: true,
      committedPayload: nextPayload,
      health: 'ok',
      commandOutcomes: outcomes,
    }
  }

  function flushCommands(
    commands: readonly ShelfCommand[],
    _fallbackBase: GuestShelfPersistedPayload,
    signal?: AbortSignal,
  ): MaybePromise<ShelfAdapterFlushResult> {
    if (signal?.aborted) {
      return {
        ok: false,
        committedPayload: null,
        health: 'writeFailed',
      }
    }

    if (pendingClear) {
      let removeOrPromise: MaybePromise<void>
      try {
        removeOrPromise = driver.removeItem(storageKey)
      } catch {
        return {
          ok: false,
          committedPayload: null,
          health: 'storageUnavailable',
        }
      }

      const proceedAfterClear = (): MaybePromise<ShelfAdapterFlushResult> => {
        pendingClear = false
        cachedRaw = null
        cachedLoadResult = {
          payload: emptyPersistedShelfPayload(),
          health: 'ok',
        }
        return flushAfterRead(null, commands, signal)
      }

      if (isPromiseLike(removeOrPromise)) {
        return removeOrPromise.then(proceedAfterClear, () => ({
          ok: false as const,
          committedPayload: null,
          health: 'storageUnavailable' as const,
        }))
      }

      return proceedAfterClear()
    }

    let rawOrPromise: MaybePromise<string | null>
    try {
      rawOrPromise = driver.getItem(storageKey)
    } catch {
      return {
        ok: false,
        committedPayload: null,
        health: 'storageUnavailable',
      }
    }

    if (isPromiseLike(rawOrPromise)) {
      return rawOrPromise.then(
        raw => flushAfterRead(raw, commands, signal),
        () => ({
          ok: false as const,
          committedPayload: null,
          health: 'storageUnavailable' as const,
        }),
      )
    }

    return flushAfterRead(rawOrPromise, commands, signal)
  }

  function clear(): MaybePromise<ShelfAdapterClearResult> {
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
            payload: emptyPersistedShelfPayload(),
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
      payload: emptyPersistedShelfPayload(),
      health: 'ok',
    }
    return {
      ok: true,
      health: 'ok',
    }
  }

  return {
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
}
