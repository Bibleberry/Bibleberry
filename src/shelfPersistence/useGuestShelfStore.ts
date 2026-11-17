import { useSyncExternalStore } from 'react'
import type {
  GuestShelfSnapshot,
  GuestShelfStore,
} from './store.ts'

/**
 * Platform-neutral React hook subscribing to any `GuestShelfStore`
 * (web `localStorage`, native Capacitor Preferences, or future account-backed store).
 */
export function useGuestShelfStore(store: GuestShelfStore): GuestShelfSnapshot {
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  )
}
