export type AppLifecycleEvent = 'coldStart' | 'foreground' | 'background'
export type AppLifecycleListener = (event: AppLifecycleEvent) => void

export interface AppLifecycleEventSource {
  subscribe(listener: AppLifecycleListener): () => void
}

/**
 * Shares an injected lifecycle source without retaining app state or performing side effects.
 * Native event registration remains the responsibility of an explicitly approved platform bridge.
 */
export function createLifecycleEventAdapter(source: AppLifecycleEventSource): {
  subscribe(listener: AppLifecycleListener): () => void
} {
  const listeners = new Map<AppLifecycleListener, number>()
  let unsubscribeSource: (() => void) | null = null

  const publish: AppLifecycleListener = event => {
    for (const listener of [...listeners.keys()]) listener(event)
  }

  return {
    subscribe(listener) {
      listeners.set(listener, (listeners.get(listener) ?? 0) + 1)
      if (!unsubscribeSource) unsubscribeSource = source.subscribe(publish)

      let subscribed = true
      return () => {
        if (!subscribed) return
        subscribed = false

        const count = listeners.get(listener)
        if (count === undefined) return
        if (count > 1) {
          listeners.set(listener, count - 1)
          return
        }

        listeners.delete(listener)
        if (listeners.size === 0 && unsubscribeSource) {
          const unsubscribe = unsubscribeSource
          unsubscribeSource = null
          unsubscribe()
        }
      }
    },
  }
}
