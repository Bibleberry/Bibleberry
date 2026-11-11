import type { KeyValueStorageDriver } from '../persistence.ts'

export interface CapacitorPreferencesBridge {
  get(options: { readonly key: string }): Promise<{ readonly value: string | null }>
  set(options: { readonly key: string; readonly value: string }): Promise<void>
  remove(options: { readonly key: string }): Promise<void>
}

export interface CapacitorPreferencesModule {
  readonly Preferences: CapacitorPreferencesBridge
}

export interface CapacitorPreferencesDriverOptions {
  readonly preferences?: CapacitorPreferencesBridge
  readonly loadPreferences?: () => Promise<CapacitorPreferencesBridge>
  readonly loadPreferencesModule?: () => Promise<CapacitorPreferencesModule>
}

/**
 * Wraps a Capacitor plugin Proxy in a plain facade so Promise resolution never triggers
 * JS thenable assimilation (`Proxy.then` -> `"Preferences.then()" is not implemented`).
 */
function createPreferencesFacade(
  preferences: CapacitorPreferencesBridge,
): CapacitorPreferencesBridge {
  if (
    !preferences
    || typeof preferences.get !== 'function'
    || typeof preferences.set !== 'function'
    || typeof preferences.remove !== 'function'
  ) {
    throw new TypeError('Capacitor Preferences bridge is unavailable.')
  }
  return {
    get: opts => preferences.get(opts),
    set: opts => preferences.set(opts),
    remove: opts => preferences.remove(opts),
  }
}

export function createCapacitorPreferencesDriver(
  options: CapacitorPreferencesDriverOptions = {},
): KeyValueStorageDriver {
  let cachedBridge: CapacitorPreferencesBridge | undefined
  let loadingPromise: Promise<CapacitorPreferencesBridge> | undefined

  function resolvePreferences(): Promise<CapacitorPreferencesBridge> {
    if (cachedBridge) {
      return Promise.resolve(cachedBridge)
    }

    if (!loadingPromise) {
      const loadAttempt = (async (): Promise<CapacitorPreferencesBridge> => {
        if (options.preferences !== undefined) {
          return createPreferencesFacade(options.preferences)
        }
        if (options.loadPreferences) {
          const loaded = await options.loadPreferences()
          return createPreferencesFacade(loaded)
        }
        const loadModule =
          options.loadPreferencesModule ?? (() => import('@capacitor/preferences'))
        const module = await loadModule()
        return createPreferencesFacade(module.Preferences)
      })()

      loadingPromise = loadAttempt.then(
        bridge => {
          cachedBridge = bridge
          return bridge
        },
        error => {
          loadingPromise = undefined
          throw error
        },
      )
    }

    return loadingPromise
  }

  return {
    async getItem(key) {
      const bridge = await resolvePreferences()
      const result = await bridge.get({ key })
      return result.value
    },

    async setItem(key, value) {
      const bridge = await resolvePreferences()
      await bridge.set({ key, value })
    },

    async removeItem(key) {
      const bridge = await resolvePreferences()
      await bridge.remove({ key })
    },
  }
}
