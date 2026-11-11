import type { AppLifecycleEventSource, AppLifecycleListener } from './lifecycleAdapter.ts'

export interface CapacitorAppLifecycleState {
  readonly isActive: boolean
}

export interface CapacitorAppLifecycleListenerHandle {
  remove(): Promise<void> | void
}

export interface CapacitorAppLifecyclePlugin {
  addListener(
    eventName: 'appStateChange',
    listener: (state: CapacitorAppLifecycleState) => void,
  ): Promise<CapacitorAppLifecycleListenerHandle>
  getState(): Promise<CapacitorAppLifecycleState>
}

export interface CapacitorLifecycleEventSourceOptions {
  readonly isNativePlatform: () => boolean
  readonly loadAppPlugin: () => Promise<CapacitorAppLifecyclePlugin>
}

export function createCapacitorLifecycleEventSource(
  options: CapacitorLifecycleEventSourceOptions,
): AppLifecycleEventSource {
  return {
    subscribe(listener: AppLifecycleListener) {
      try {
        if (!options.isNativePlatform()) return () => {}
      } catch {
        return () => {}
      }

      let subscribed = true
      let listenerHandle: CapacitorAppLifecycleListenerHandle | null = null
      let removalRequested = false
      let stateReady = false
      let lastIsActive: boolean | undefined
      let pendingState: boolean | null = null

      const removeListener = () => {
        if (!listenerHandle || removalRequested) return
        removalRequested = true
        const handle = listenerHandle
        listenerHandle = null
        try {
          void Promise.resolve(handle.remove()).catch(() => {})
        } catch {
          // A failed native cleanup must not escape subscription teardown.
        }
      }

      const publishState = (isActive: boolean) => {
        if (!subscribed || lastIsActive === isActive) return
        lastIsActive = isActive
        listener(isActive ? 'foreground' : 'background')
      }

      const onStateChange = (state: CapacitorAppLifecycleState) => {
        if (!subscribed || typeof state?.isActive !== 'boolean') return
        if (!stateReady) {
          pendingState = state.isActive
          return
        }
        publishState(state.isActive)
      }

      const register = async () => {
        let plugin: CapacitorAppLifecyclePlugin
        try {
          plugin = await options.loadAppPlugin()
        } catch {
          return
        }
        if (!subscribed) return

        let registration: Promise<CapacitorAppLifecycleListenerHandle>
        try {
          registration = plugin.addListener('appStateChange', onStateChange)
        } catch {
          return
        }

        let handle: CapacitorAppLifecycleListenerHandle
        try {
          handle = await registration
        } catch {
          return
        }

        listenerHandle = handle
        if (!subscribed) {
          removeListener()
          return
        }

        let currentState: CapacitorAppLifecycleState | null = null
        try {
          currentState = await plugin.getState()
        } catch {
          // Event delivery remains available if the initial state query fails.
        }
        if (!subscribed) return

        if (typeof currentState?.isActive === 'boolean') {
          lastIsActive = currentState.isActive
        }
        stateReady = true
        if (pendingState !== null) publishState(pendingState)
        pendingState = null
      }

      void register()

      return () => {
        if (!subscribed) return
        subscribed = false
        pendingState = null
        removeListener()
      }
    },
  }
}
