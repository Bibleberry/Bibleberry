import { Capacitor } from '@capacitor/core'
import {
  createCapacitorLifecycleEventSource,
  type CapacitorAppLifecycleModule,
} from './capacitorLifecycleSource.ts'
import { createLifecycleEventAdapter } from './lifecycleAdapter.ts'

export interface NativeLifecycleServiceOptions {
  readonly isNativePlatform?: () => boolean
  readonly loadAppPluginModule?: () => Promise<CapacitorAppLifecycleModule>
}

export function createNativeLifecycleEvents(
  options: NativeLifecycleServiceOptions = {},
) {
  const source = createCapacitorLifecycleEventSource({
    isNativePlatform: options.isNativePlatform ?? (() => Capacitor.isNativePlatform()),
    loadAppPluginModule: options.loadAppPluginModule ?? (() => import('@capacitor/app')),
  })
  return createLifecycleEventAdapter(source)
}

export const nativeLifecycleEvents = createNativeLifecycleEvents()

if (
  typeof import.meta !== 'undefined'
  && import.meta.env
  && import.meta.env.VITE_ENABLE_NATIVE_LIFECYCLE_PROBE === 'true'
) {
  console.info('[native-lifecycle-probe] JavaScript probe enabled')
  nativeLifecycleEvents.subscribe(() => {})
}
