import type { KeyValueStorageDriver } from '../participation/persistence.ts'
import {
  applyReaderProfilePatch,
  chooseColorsAppearance,
  createDefaultReaderProfile,
  followSeasonsAppearance,
  mapLegacyPrototypeState,
  parseReaderProfileEnvelope,
  serializeReaderProfileEnvelope,
} from './model.ts'
import {
  LEGACY_PROTOTYPE_STORAGE_KEY,
  READER_PROFILE_STORAGE_KEY,
  type ContrastMode,
  type OnboardingStepStatus,
  type ReaderProfile,
  type ReaderProfileDiagnostic,
  type ReaderProfileLoadResult,
  type ReaderProfileOrigin,
  type ReaderProfilePatch,
  type ReaderProfileRecoveryResult,
  type ReaderProfileStoreOptions,
  type ReaderProfileUpdateResult,
  type ReminderPreference,
  type TextScale,
} from './types.ts'

/**
 * Durable reader-profile store (Moss Ledger, Issue #278).
 *
 * Safety contract:
 * - Writes ONLY the profile key. The legacy prototype key is read, never written or removed.
 *   No other storage key is touched.
 * - A valid stored profile always takes precedence over legacy settings; migration runs only
 *   while no profile record exists, and the first successful write makes it one-time.
 * - Corrupt or newer-schema profile records are never overwritten by ordinary updates. Corrupt
 *   records can be replaced only through the explicit `recoverCorruptProfile()`; newer-schema
 *   records are never replaced (downgrade protection).
 * - A failed write leaves the previous record (or absence) in place, so a failed migration is
 *   simply retried on the next load.
 * - Writes in one store instance are serialized and re-read storage first, so a later update
 *   never discards an earlier one. Cross-tab/web coordination is best-effort, as for the
 *   participation and Shelf stores.
 */

export type ProfileUpdater =
  | ReaderProfilePatch
  | ((current: ReaderProfile) => ReaderProfilePatch)

export interface ReaderProfileStore {
  load(): Promise<ReaderProfileLoadResult>
  update(updater: ProfileUpdater): Promise<ReaderProfileUpdateResult>
  setIntroStatus(status: OnboardingStepStatus): Promise<ReaderProfileUpdateResult>
  setTutorialStatus(status: OnboardingStepStatus): Promise<ReaderProfileUpdateResult>
  /** Permanent. There is intentionally no way to un-dismiss. */
  dismissGuestInvite(): Promise<ReaderProfileUpdateResult>
  /** Return to `Follow Bibleberry Seasons`, retaining the prior manual palette id. */
  followSeasons(): Promise<ReaderProfileUpdateResult>
  /** `Choose My Colors` with an opaque palette id; kept year-round until switched back. */
  chooseColors(paletteId: string): Promise<ReaderProfileUpdateResult>
  setContrastMode(mode: ContrastMode): Promise<ReaderProfileUpdateResult>
  setTextScale(scale: TextScale): Promise<ReaderProfileUpdateResult>
  setReminder(reminder: ReminderPreference): Promise<ReaderProfileUpdateResult>
  /**
   * Explicit recovery for a corrupt profile record: replaces it with a profile rebuilt from
   * legacy settings (when readable) or defaults. Refuses when the record is not corrupt.
   */
  recoverCorruptProfile(): Promise<ReaderProfileRecoveryResult>
  /** In-process notifications after successful durable writes. */
  subscribe(listener: (profile: ReaderProfile) => void): () => void
  /** Present when the driver can report external (e.g. other-tab) changes; caller should reload. */
  subscribeExternalChanges?(listener: () => void): () => void
}

type Resolved =
  | {
      readonly kind: 'stored'
      readonly raw: string
      readonly profile: ReaderProfile
      readonly origin: ReaderProfileOrigin
      readonly diagnostics: readonly ReaderProfileDiagnostic[]
    }
  | {
      readonly kind: 'fresh'
      readonly profile: ReaderProfile
      readonly origin: ReaderProfileOrigin
      readonly diagnostics: readonly ReaderProfileDiagnostic[]
    }
  | {
      readonly kind: 'corrupt'
      readonly fallback: Fallback
      readonly diagnostics: readonly ReaderProfileDiagnostic[]
    }
  | {
      readonly kind: 'unsupportedNewerSchema'
      readonly fallback: Fallback
      readonly diagnostics: readonly ReaderProfileDiagnostic[]
    }
  | { readonly kind: 'profileUnavailable' }
  | { readonly kind: 'legacyUnavailable' }

interface Fallback {
  readonly profile: ReaderProfile
  readonly origin: ReaderProfileOrigin
  readonly diagnostics: readonly ReaderProfileDiagnostic[]
}

export function createReaderProfileStore(options: ReaderProfileStoreOptions): ReaderProfileStore {
  const storageKey = options.storageKey ?? READER_PROFILE_STORAGE_KEY
  const legacyStorageKey = options.legacyStorageKey ?? LEGACY_PROTOTYPE_STORAGE_KEY
  const { driver } = options
  const legacyDriver: KeyValueStorageDriver | null = options.legacyDriver ?? null

  if (storageKey === legacyStorageKey) {
    throw new Error('Reader profile storage key must differ from the legacy prototype key.')
  }

  const listeners = new Set<(profile: ReaderProfile) => void>()
  let lastKnown: ReaderProfile = createDefaultReaderProfile()
  let tail: Promise<unknown> = Promise.resolve()

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(task, task)
    tail = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  /** Builds the legacy-or-defaults profile. `null` means the legacy source could not be read. */
  async function buildFromLegacy(): Promise<Fallback | null> {
    if (!legacyDriver) {
      return { profile: createDefaultReaderProfile(), origin: 'defaults', diagnostics: [] }
    }
    let legacyRaw: string | null
    try {
      legacyRaw = await legacyDriver.getItem(legacyStorageKey)
    } catch {
      return null
    }
    const mapped = mapLegacyPrototypeState(legacyRaw)
    if (mapped.kind === 'mapped') {
      return { profile: mapped.profile, origin: 'legacyPrototypeMigration', diagnostics: mapped.diagnostics }
    }
    return {
      profile: createDefaultReaderProfile(),
      origin: 'defaults',
      diagnostics:
        mapped.kind === 'unreadable' ? [{ field: legacyStorageKey, reason: mapped.reason }] : [],
    }
  }

  async function safeFallback(): Promise<Fallback> {
    return (
      (await buildFromLegacy())
      ?? { profile: createDefaultReaderProfile(), origin: 'defaults', diagnostics: [] }
    )
  }

  async function resolve(): Promise<Resolved> {
    let raw: string | null
    try {
      raw = await driver.getItem(storageKey)
    } catch {
      return { kind: 'profileUnavailable' }
    }

    const parsed = parseReaderProfileEnvelope(raw)
    switch (parsed.kind) {
      case 'valid':
        return {
          kind: 'stored',
          raw: raw as string,
          profile: parsed.profile,
          origin: parsed.origin,
          diagnostics: parsed.diagnostics,
        }
      case 'corrupt':
        return {
          kind: 'corrupt',
          fallback: await safeFallback(),
          diagnostics: [{ field: storageKey, reason: parsed.reason }],
        }
      case 'unsupportedNewerSchema':
        return {
          kind: 'unsupportedNewerSchema',
          fallback: await safeFallback(),
          diagnostics: [
            { field: storageKey, reason: `Stored schemaVersion ${parsed.schemaVersion} is newer than supported.` },
          ],
        }
      case 'absent': {
        const built = await buildFromLegacy()
        if (!built) return { kind: 'legacyUnavailable' }
        return { kind: 'fresh', ...built }
      }
    }
  }

  async function write(serialized: string): Promise<boolean> {
    try {
      await driver.setItem(storageKey, serialized)
      return true
    } catch {
      return false
    }
  }

  function remember(profile: ReaderProfile, notify: boolean): void {
    lastKnown = profile
    if (!notify) return
    for (const listener of listeners) {
      try {
        listener(profile)
      } catch {
        // Listener failures never affect persistence.
      }
    }
  }

  function load(): Promise<ReaderProfileLoadResult> {
    return enqueue(async () => {
      const resolved = await resolve()
      switch (resolved.kind) {
        case 'stored':
          remember(resolved.profile, false)
          return {
            profile: resolved.profile,
            health: 'ok',
            source: 'stored',
            persisted: true,
            diagnostics: resolved.diagnostics,
          }
        case 'fresh': {
          const source = resolved.origin === 'legacyPrototypeMigration' ? 'migratedLegacy' : 'defaults'
          const persisted = await write(serializeReaderProfileEnvelope(resolved.profile, resolved.origin))
          remember(resolved.profile, persisted)
          return {
            profile: resolved.profile,
            health: persisted ? 'ok' : 'writeFailed',
            source,
            persisted,
            diagnostics: resolved.diagnostics,
          }
        }
        case 'corrupt':
        case 'unsupportedNewerSchema': {
          const { fallback } = resolved
          remember(fallback.profile, false)
          return {
            profile: fallback.profile,
            health: resolved.kind === 'corrupt' ? 'corruptStoredData' : 'unsupportedNewerSchema',
            source: fallback.origin === 'legacyPrototypeMigration' ? 'migratedLegacy' : 'defaults',
            persisted: false,
            diagnostics: [...resolved.diagnostics, ...fallback.diagnostics],
          }
        }
        case 'profileUnavailable':
        case 'legacyUnavailable': {
          const profile = createDefaultReaderProfile()
          remember(profile, false)
          return {
            profile,
            health: 'storageUnavailable',
            source: 'defaults',
            persisted: false,
            diagnostics: [
              {
                field: resolved.kind === 'profileUnavailable' ? storageKey : legacyStorageKey,
                reason: 'Storage could not be read; nothing was written.',
              },
            ],
          }
        }
      }
    })
  }

  function update(updater: ProfileUpdater): Promise<ReaderProfileUpdateResult> {
    return enqueue(async (): Promise<ReaderProfileUpdateResult> => {
      const resolved = await resolve()
      if (resolved.kind === 'corrupt' || resolved.kind === 'unsupportedNewerSchema') {
        return {
          ok: false,
          error: resolved.kind === 'corrupt' ? 'corruptStoredData' : 'unsupportedNewerSchema',
          profile: resolved.fallback.profile,
          message:
            resolved.kind === 'corrupt'
              ? 'Stored reader profile is corrupt; it was left untouched. Use recoverCorruptProfile().'
              : 'Stored reader profile uses a newer schema; it was left untouched.',
        }
      }
      if (resolved.kind === 'profileUnavailable' || resolved.kind === 'legacyUnavailable') {
        return {
          ok: false,
          error: 'storageUnavailable',
          profile: lastKnown,
          message: 'Storage could not be read; nothing was written.',
        }
      }

      const base = resolved.profile
      let patch: ReaderProfilePatch
      try {
        patch = typeof updater === 'function' ? updater(base) : updater
      } catch {
        return { ok: false, error: 'invalidValue', profile: base, message: 'Profile updater threw.' }
      }
      const applied = applyReaderProfilePatch(base, patch)
      if (!applied.ok) {
        return { ok: false, error: 'invalidValue', profile: base, message: applied.message }
      }

      const serialized = serializeReaderProfileEnvelope(applied.profile, resolved.origin)
      if (resolved.kind === 'stored' && resolved.raw === serialized) {
        remember(applied.profile, false)
        return { ok: true, profile: applied.profile, changed: false }
      }

      if (!(await write(serialized))) {
        return {
          ok: false,
          error: 'writeFailed',
          profile: base,
          message: 'Reader profile could not be saved; the previous stored value is unchanged.',
        }
      }
      remember(applied.profile, true)
      return { ok: true, profile: applied.profile, changed: applied.changed }
    })
  }

  function recoverCorruptProfile(): Promise<ReaderProfileRecoveryResult> {
    return enqueue(async (): Promise<ReaderProfileRecoveryResult> => {
      const resolved = await resolve()
      if (resolved.kind === 'unsupportedNewerSchema') {
        return {
          ok: false,
          error: 'unsupportedNewerSchema',
          message: 'A newer-schema reader profile is never replaced by this version.',
        }
      }
      if (resolved.kind === 'profileUnavailable') {
        return { ok: false, error: 'storageUnavailable', message: 'Storage could not be read.' }
      }
      if (resolved.kind !== 'corrupt') {
        return { ok: false, error: 'notCorrupt', message: 'Stored reader profile is not corrupt.' }
      }
      const { fallback } = resolved
      if (!(await write(serializeReaderProfileEnvelope(fallback.profile, fallback.origin)))) {
        return { ok: false, error: 'writeFailed', message: 'Recovery write failed; record unchanged.' }
      }
      remember(fallback.profile, true)
      return { ok: true, profile: fallback.profile }
    })
  }

  return {
    load,
    update,
    setIntroStatus: status => update({ introStatus: status }),
    setTutorialStatus: status => update({ tutorialStatus: status }),
    dismissGuestInvite: () => update({ guestInviteDismissed: true }),
    followSeasons: () => update(current => ({ appearance: followSeasonsAppearance(current.appearance) })),
    chooseColors: paletteId => update({ appearance: chooseColorsAppearance(paletteId) }),
    setContrastMode: mode => update({ contrastMode: mode }),
    setTextScale: scale => update({ textScale: scale }),
    setReminder: reminder => update({ reminder }),
    recoverCorruptProfile,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    ...(driver.onExternalChange
      ? {
          subscribeExternalChanges(listener: () => void) {
            return driver.onExternalChange!(storageKey, listener)
          },
        }
      : {}),
  }
}
