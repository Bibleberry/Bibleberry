import { Capacitor } from '@capacitor/core'
import {
  createCapacitorPreferencesDriver,
  type CapacitorPreferencesBridge,
} from '../participation/drivers/capacitorPreferencesDriver.ts'
import { createWebLocalStorageDriver } from '../participation/drivers/webLocalStorageDriver.ts'
import type { KeyValueStorageDriver } from '../participation/persistence.ts'
import type { PublicationYearMonth } from '../participation/types.ts'
import { createShelfEnvelopePersistenceAdapter } from './persistence.ts'
import {
  createGuestShelfStore,
  type GuestShelfStore,
} from './store.ts'
import { GUEST_SHELF_STORAGE_KEY } from './types.ts'

/**
 * Platform-aware guest Shelf store wiring (Phase 05 / R08-5 / Issue #162).
 *
 * Isolates guest Shelf state under `GUEST_SHELF_STORAGE_KEY` (`bibleberry-guest-shelf-v1`),
 * strictly separate from `GUEST_PARTICIPATION_STORAGE_KEY` (`bibleberry-reader-participation-v1`).
 */

export interface GuestShelfStoreOptions {
  readonly storageKey?: string
  readonly referenceCurrentMonth?: PublicationYearMonth | string
}

export function createGuestShelfStoreForDriver(
  driver: KeyValueStorageDriver,
  options: GuestShelfStoreOptions = {},
): GuestShelfStore {
  const storageKey = options.storageKey ?? GUEST_SHELF_STORAGE_KEY
  const adapter = createShelfEnvelopePersistenceAdapter({
    storageKey,
    referenceCurrentMonth: options.referenceCurrentMonth,
    driver,
  })
  return createGuestShelfStore(adapter)
}

export function createWebGuestShelfStore(
  options: GuestShelfStoreOptions & {
    readonly storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
  } = {},
): GuestShelfStore {
  return createGuestShelfStoreForDriver(
    createWebLocalStorageDriver({ storage: options.storage }),
    options,
  )
}

export interface PlatformGuestShelfStoreOptions extends GuestShelfStoreOptions {
  readonly isNativePlatform?: () => boolean
  readonly nativeDriver?: KeyValueStorageDriver
  readonly nativePreferences?: CapacitorPreferencesBridge
  readonly webStorage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
}

export function createPlatformGuestShelfStore(
  options: PlatformGuestShelfStoreOptions = {},
): GuestShelfStore {
  const isNativePlatform = options.isNativePlatform ?? (() => Capacitor.isNativePlatform())
  if (isNativePlatform()) {
    return createGuestShelfStoreForDriver(
      options.nativeDriver
        ?? createCapacitorPreferencesDriver({ preferences: options.nativePreferences }),
      options,
    )
  }
  return createWebGuestShelfStore({
    ...options,
    storage: options.webStorage,
  })
}

export const defaultGuestShelfStore: GuestShelfStore = createPlatformGuestShelfStore()
