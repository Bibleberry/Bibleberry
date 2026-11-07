import { createWebLocalStorageDriver } from './drivers/webLocalStorageDriver.ts'
import { createEnvelopePersistenceAdapter } from './persistence.ts'
import {
  createReaderParticipationStore,
  type ReaderParticipationStore,
} from './store.ts'
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

export function createWebGuestParticipationStore(options: {
  readonly storageKey?: string
  readonly allowedNamespace?: ChallengeIdentityNamespace
} = {}): ReaderParticipationStore {
  const storageKey = options.storageKey ?? GUEST_PARTICIPATION_STORAGE_KEY
  const allowedNamespace = options.allowedNamespace ?? 'cms'
  const adapter = createEnvelopePersistenceAdapter({
    storageKey,
    allowedNamespace,
    driver: createWebLocalStorageDriver(),
  })
  return createReaderParticipationStore(adapter, { allowedNamespace })
}

export const defaultGuestParticipationStore: ReaderParticipationStore =
  createWebGuestParticipationStore()
