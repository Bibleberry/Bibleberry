import { useSyncExternalStore } from 'react'
import type {
  ReaderParticipationSnapshot,
  ReaderParticipationStore,
} from './store.ts'

/**
 * Platform-neutral React hook subscribing to any `ReaderParticipationStore` (web `localStorage`,
 * future Capacitor/native mobile adapter, or future R13 Supabase-backed store).
 */
export function useReaderParticipation(
  store: ReaderParticipationStore,
): ReaderParticipationSnapshot {
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  )
}
