import { useEffect, useState } from 'react'
import type { ReaderProfileStore } from './store.ts'
import type { ReaderProfile, ReaderProfileHealth } from './types.ts'

export type ReaderProfileHookState =
  | {
      readonly status: 'loading'
      readonly health: null
      readonly profile: null
    }
  | {
      readonly status: 'ready'
      readonly health: ReaderProfileHealth
      readonly profile: ReaderProfile
    }
  | {
      readonly status: 'error'
      readonly health: null
      readonly profile: null
    }

const LOADING_STATE: ReaderProfileHookState = {
  status: 'loading',
  health: null,
  profile: null,
}

/**
 * Loads and subscribes to a `ReaderProfileStore`, including cross-tab external changes when
 * supported by the underlying storage driver.
 */
export function useReaderProfile(store: ReaderProfileStore): ReaderProfileHookState {
  const [state, setState] = useState<ReaderProfileHookState>(LOADING_STATE)

  useEffect(() => {
    let active = true

    const loadProfile = () => {
      void store
        .load()
        .then(result => {
          if (!active) return
          setState({
            status: 'ready',
            health: result.health,
            profile: result.profile,
          })
        })
        .catch(() => {
          if (!active) return
          setState({
            status: 'error',
            health: null,
            profile: null,
          })
        })
    }

    loadProfile()

    const unsubscribe = store.subscribe(profile => {
      if (!active) return
      setState(prev => ({
        status: 'ready',
        health: prev.status === 'ready' ? prev.health : 'ok',
        profile,
      }))
    })

    const unsubscribeExternal = store.subscribeExternalChanges?.(() => {
      loadProfile()
    })

    return () => {
      active = false
      unsubscribe()
      unsubscribeExternal?.()
    }
  }, [store])

  return state
}
