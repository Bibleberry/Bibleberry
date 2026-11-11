import { Capacitor } from '@capacitor/core'
import { createCapacitorLifecycleEventSource } from './capacitorLifecycleSource.ts'
import { createLifecycleEventAdapter } from './lifecycleAdapter.ts'

const source = createCapacitorLifecycleEventSource({
  isNativePlatform: () => Capacitor.isNativePlatform(),
  loadAppPlugin: async () => (await import('@capacitor/app')).App,
})

export const nativeLifecycleEvents = createLifecycleEventAdapter(source)
