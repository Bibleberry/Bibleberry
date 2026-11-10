import { Capacitor } from '@capacitor/core'
import { createWebLocalStorageDriver } from './drivers/webLocalStorageDriver.ts'
import {
  createCapacitorPreferencesDriver,
  type CapacitorPreferencesBridge,
} from './drivers/capacitorPreferencesDriver.ts'
import { createEnvelopePersistenceAdapter } from './persistence.ts'
import {
  createReaderParticipationStore,
  type ReaderParticipationStore,
} from './store.ts'
import type { KeyValueStorageDriver } from './persistence.ts'
import type { ChallengeIdentityNamespace } from './types.ts'

/**
 * Default web guest participation store wiring (Track A, A3 / Issue #46).
 *
 * Isolates production reader participation under `bibleberry-reader-participation-v1`, strictly
 * separate from:
 * - `bibleberry-prototype-v1` (prototype preferences & onboarding)
 * - `bibleberry-interactive-challenge-lab-v1` (Developer Studio local Lab)
 * - `bibleberry-sanity-challenge-lab-v1` (Developer Studio CMS Lab)
 * - `bibleberry-participation-pilot-v1` (opt-in A3 persistence pilot)
 */

export const GUEST_PARTICIPATION_STORAGE_KEY = 'bibleberry-reader-participation-v1'

interface GuestParticipationStoreOptions {
  readonly storageKey?: string
  readonly allowedNamespace?: ChallengeIdentityNamespace
}

function createGuestParticipationStore(
  driver: KeyValueStorageDriver,
  options: GuestParticipationStoreOptions = {},
): ReaderParticipationStore {
  const storageKey = options.storageKey ?? GUEST_PARTICIPATION_STORAGE_KEY
  const allowedNamespace = options.allowedNamespace ?? 'cms'
  const adapter = createEnvelopePersistenceAdapter({
    storageKey,
    allowedNamespace,
    driver,
  })
  return createReaderParticipationStore(adapter, { allowedNamespace })
}

export function createWebGuestParticipationStore(options: GuestParticipationStoreOptions & {
  readonly storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
} = {}): ReaderParticipationStore {
  return createGuestParticipationStore(
    createWebLocalStorageDriver({ storage: options.storage }),
    options,
  )
}

export interface PlatformGuestParticipationStoreOptions extends GuestParticipationStoreOptions {
  readonly isNativePlatform?: () => boolean
  readonly nativeDriver?: KeyValueStorageDriver
  readonly nativePreferences?: CapacitorPreferencesBridge
  readonly webStorage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
}

export function createPlatformGuestParticipationStore(
  options: PlatformGuestParticipationStoreOptions = {},
): ReaderParticipationStore {
  const isNativePlatform = options.isNativePlatform ?? (() => Capacitor.isNativePlatform())
  if (isNativePlatform()) {
    return createGuestParticipationStore(
      options.nativeDriver
        ?? createCapacitorPreferencesDriver({ preferences: options.nativePreferences }),
      options,
    )
  }
  return createWebGuestParticipationStore({
    ...options,
    storage: options.webStorage,
  })
}

export const defaultGuestParticipationStore: ReaderParticipationStore =
  createPlatformGuestParticipationStore()
