import type { KeyValueStorageDriver } from '../persistence.ts'

/**
 * Browser `localStorage` driver implementing `KeyValueStorageDriver` (Track A, A3 / Issue #46).
 *
 * Platform & concurrency notes:
 * - Bibleberry is primarily an installed iOS/Android application with hosted web secondary. This
 *   file is the ONLY module in `src/participation/` coupled to browser `window.localStorage` /
 *   `document` globals and is replaceable by a native mobile driver (e.g. Capacitor Preferences or
 *   SQLite) without changing domain models, stores, hooks, or React components.
 * - Cross-tab synchronization on web is best-effort, NOT atomic: `localStorage` has no native
 *   compare-and-swap mutex. `createEnvelopePersistenceAdapter` performs fresh-read command replay
 *   on writes and this driver subscribes to `storage` + `visibilitychange` to reconcile normal
 *   multi-tab browsing without introducing browser-only locking APIs.
 */

export interface WebLocalStorageDriverOptions {
  readonly storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
}

function resolveBrowserStorage(
  injected?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  if (injected) return injected
  if (typeof window === 'undefined' || !window.localStorage) {
    throw new Error('Browser localStorage is unavailable in this environment.')
  }
  return window.localStorage
}

export function createWebLocalStorageDriver(
  options: WebLocalStorageDriverOptions = {},
): KeyValueStorageDriver {
  return {
    getItem(key: string): string | null {
      return resolveBrowserStorage(options.storage).getItem(key)
    },

    setItem(key: string, value: string): void {
      resolveBrowserStorage(options.storage).setItem(key, value)
    },

    removeItem(key: string): void {
      resolveBrowserStorage(options.storage).removeItem(key)
    },

    onExternalChange(key: string, listener: () => void): () => void {
      if (options.storage || typeof window === 'undefined') {
        return () => {}
      }

      const handleStorage = (event: StorageEvent) => {
        if (event.key === null || event.key === key) {
          listener()
        }
      }

      const handleVisibilityChange = () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          listener()
        }
      }

      window.addEventListener('storage', handleStorage)
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', handleVisibilityChange)
      }

      return () => {
        window.removeEventListener('storage', handleStorage)
        if (typeof document !== 'undefined') {
          document.removeEventListener('visibilitychange', handleVisibilityChange)
        }
      }
    },
  }
}
