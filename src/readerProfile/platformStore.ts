import { Capacitor } from '@capacitor/core'
import {
  createCapacitorPreferencesDriver,
  type CapacitorPreferencesBridge,
} from '../participation/drivers/capacitorPreferencesDriver.ts'
import { createWebLocalStorageDriver } from '../participation/drivers/webLocalStorageDriver.ts'
import type { KeyValueStorageDriver } from '../participation/persistence.ts'
import { createReaderProfileStore, type ReaderProfileStore } from './store.ts'

/**
 * Platform wiring for the reader profile, reusing the established participation drivers
 * (no new storage dependency):
 * - Web: profile in `localStorage`.
 * - Native: profile in Capacitor Preferences.
 * - Legacy source on both: WebView/browser `localStorage`, where legacy `src/App.tsx` stores
 *   `bibleberry-prototype-v1`.
 *
 * Nothing here runs at import time; the future R06 shell integrator calls the factory.
 */

type WebStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface PlatformReaderProfileStoreOptions {
  readonly isNativePlatform?: () => boolean
  readonly nativeDriver?: KeyValueStorageDriver
  readonly nativePreferences?: CapacitorPreferencesBridge
  readonly webStorage?: WebStorage
  /** Defaults to the web `localStorage` driver; pass `null` to disable legacy migration. */
  readonly legacyDriver?: KeyValueStorageDriver | null
  readonly storageKey?: string
}

export function createPlatformReaderProfileStore(
  options: PlatformReaderProfileStoreOptions = {},
): ReaderProfileStore {
  const isNativePlatform = options.isNativePlatform ?? (() => Capacitor.isNativePlatform())
  const webDriver = createWebLocalStorageDriver({ storage: options.webStorage })
  const driver = isNativePlatform()
    ? options.nativeDriver ?? createCapacitorPreferencesDriver({ preferences: options.nativePreferences })
    : webDriver
  return createReaderProfileStore({
    driver,
    legacyDriver: options.legacyDriver === undefined ? webDriver : options.legacyDriver,
    storageKey: options.storageKey,
  })
}
