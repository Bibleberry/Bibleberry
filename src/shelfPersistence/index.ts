export {
  createGuestShelfStoreForDriver,
  createPlatformGuestShelfStore,
  createWebGuestShelfStore,
  defaultGuestShelfStore,
  type GuestShelfStoreOptions,
  type PlatformGuestShelfStoreOptions,
} from './defaultGuestShelfStore.ts'
export {
  createShelfEnvelopePersistenceAdapter,
  emptyPersistedShelfPayload,
  parseShelfEnvelope,
  reduceShelfCommand,
  replayShelfCommands,
  serializeShelfEnvelope,
  type ReduceShelfCommandOutcome,
} from './persistence.ts'
export {
  buildShelfHostPropsFromGuestStore,
  type BuildShelfHostPropsParams,
} from './shelfHostAdapter.ts'
export {
  createGuestShelfStore,
  type GuestShelfSnapshot,
  type GuestShelfStore,
  type GuestShelfStoreStatus,
} from './store.ts'
export {
  GUEST_SHELF_STORAGE_KEY,
  SHELF_ENVELOPE_SCHEMA_VERSION,
  type CreateShelfPersistenceAdapterOptions,
  type GuestShelfEnvelopeV1,
  type GuestShelfPersistedPayload,
  type ShelfAdapterClearResult,
  type ShelfAdapterFlushResult,
  type ShelfAdapterLoadResult,
  type ShelfCommand,
  type ShelfPersistenceAdapter,
  type ShelfRolloverWatermark,
} from './types.ts'
export { useGuestShelfStore } from './useGuestShelfStore.ts'
