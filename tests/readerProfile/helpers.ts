import type { KeyValueStorageDriver } from '../../src/participation/persistence.ts'

export interface MemoryDriver extends KeyValueStorageDriver {
  readonly store: Map<string, string>
  readonly writes: Array<{ readonly op: 'set' | 'remove'; readonly key: string }>
  failGet: boolean
  failSet: boolean
  async: boolean
}

export function createMemoryDriver(initial: Record<string, string> = {}): MemoryDriver {
  const store = new Map<string, string>(Object.entries(initial))
  const writes: MemoryDriver['writes'] = []
  const driver: MemoryDriver = {
    store,
    writes,
    failGet: false,
    failSet: false,
    async: false,
    getItem(key) {
      if (driver.failGet) throw new Error('get failed')
      const value = store.get(key) ?? null
      return driver.async ? Promise.resolve(value) : value
    },
    setItem(key, value) {
      if (driver.failSet) {
        return driver.async ? Promise.reject(new Error('set failed')) : (() => { throw new Error('set failed') })()
      }
      writes.push({ op: 'set', key })
      store.set(key, value)
      return driver.async ? Promise.resolve() : undefined
    },
    removeItem(key) {
      writes.push({ op: 'remove', key })
      store.delete(key)
    },
  }
  return driver
}

export const LEGACY_FULL = JSON.stringify({
  onboarded: true,
  appearance: 'dark',
  textSize: 'large',
  reminderEnabled: true,
  reminderTime: '06:45',
  explored: ['entry-1'],
  journey: [{ id: 'a', label: 'Read', at: '2026-11-01' }],
  lastOpened: { entryId: 'e', challengeId: 'c', openedAt: '2026-11-01' },
  resumeDismissedDate: '2026-11-02',
})

/** Representative records owned by other modules; the profile store must never touch them. */
export const UNRELATED_RECORDS: Record<string, string> = {
  'bibleberry-reader-participation-v1': '{"schemaVersion":1,"completedChallenges":["x"]}',
  'bibleberry-guest-shelf-v1': '{"schemaVersion":1,"state":{}}',
  'bibleberry-month-intro-v1': '{"schemaVersion":1,"months":{}}',
  'bibleberry-card-announcement-prefs-v1': '{"schemaVersion":1}',
  'bibleberry-account-sync-v1': '{"pending":true}',
}
