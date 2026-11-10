import type { KeyValueStorageDriver } from '../persistence.ts'

export interface CapacitorPreferencesBridge {
  get(options: { readonly key: string }): Promise<{ readonly value: string | null }>
  set(options: { readonly key: string; readonly value: string }): Promise<void>
  remove(options: { readonly key: string }): Promise<void>
}

export interface CapacitorPreferencesDriverOptions {
  readonly preferences?: CapacitorPreferencesBridge
  readonly loadPreferences?: () => Promise<CapacitorPreferencesBridge>
}

export function createCapacitorPreferencesDriver(
  options: CapacitorPreferencesDriverOptions = {},
): KeyValueStorageDriver {
  let preferencesPromise = options.preferences
    ? Promise.resolve(options.preferences)
    : undefined

  function resolvePreferences(): Promise<CapacitorPreferencesBridge> {
    preferencesPromise ??= options.loadPreferences
      ? options.loadPreferences()
      : import('@capacitor/preferences').then(module => module.Preferences)
    return preferencesPromise
  }

  return {
    async getItem(key) {
      return (await resolvePreferences()).get({ key }).then(result => result.value)
    },

    async setItem(key, value) {
      await (await resolvePreferences()).set({ key, value })
    },

    async removeItem(key) {
      await (await resolvePreferences()).remove({ key })
    },
  }
}
