import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createCapacitorLifecycleEventSource,
  createAppLifecyclePluginFacade,
  type CapacitorAppLifecycleListenerHandle,
  type CapacitorAppLifecycleModule,
  type CapacitorAppLifecyclePlugin,
  type CapacitorAppLifecycleState,
} from '../../src/native/capacitorLifecycleSource.ts'
import { createLifecycleEventAdapter, type AppLifecycleEvent } from '../../src/native/lifecycleAdapter.ts'
import { createNativeLifecycleEvents } from '../../src/native/lifecycleService.ts'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function flushMicrotasks() {
  return Promise.resolve().then(() => Promise.resolve()).then(() => Promise.resolve())
}

function createFakePlugin(initialState: CapacitorAppLifecycleState = { isActive: true }) {
  const listeners: Array<(state: CapacitorAppLifecycleState) => void> = []
  let registrations = 0
  let removals = 0
  let stateReads = 0
  let state: CapacitorAppLifecycleState = initialState

  const plugin: CapacitorAppLifecyclePlugin = {
    addListener(_eventName, listener) {
      registrations += 1
      listeners.push(listener)
      return Promise.resolve({
        remove() {
          removals += 1
        },
      })
    },
    getState() {
      stateReads += 1
      return Promise.resolve(state)
    },
  }

  return {
    plugin,
    emit(isActive: boolean) {
      state = { isActive }
      for (const listener of [...listeners]) listener(state)
    },
    get registrations() {
      return registrations
    },
    get removals() {
      return removals
    },
    get stateReads() {
      return stateReads
    },
  }
}

function createSource(plugin: CapacitorAppLifecyclePlugin, isNativePlatform = true) {
  let loads = 0
  const source = createCapacitorLifecycleEventSource({
    isNativePlatform: () => isNativePlatform,
    loadAppPlugin: async () => {
      loads += 1
      return plugin
    },
  })
  return {
    source,
    get loads() {
      return loads
    },
  }
}

test('maps native appStateChange transitions and suppresses the initial state and duplicate callbacks', async () => {
  const fake = createFakePlugin({ isActive: true })
  const { source } = createSource(fake.plugin)
  const received: AppLifecycleEvent[] = []

  const unsubscribe = source.subscribe(event => received.push(event))
  await flushMicrotasks()

  assert.equal(fake.stateReads, 1)
  assert.deepEqual(received, [])
  fake.emit(false)
  fake.emit(false)
  fake.emit(true)
  assert.deepEqual(received, ['background', 'foreground'])

  unsubscribe()
  assert.equal(fake.removals, 1)
})

test('does not load or register the native plugin on web', async () => {
  const fake = createFakePlugin()
  const { source, loads } = createSource(fake.plugin, false)
  const received: AppLifecycleEvent[] = []

  const unsubscribe = source.subscribe(event => received.push(event))
  await flushMicrotasks()
  unsubscribe()

  assert.equal(loads, 0)
  assert.equal(fake.registrations, 0)
  assert.deepEqual(received, [])
})

test('removes a listener whose asynchronous registration resolves after unsubscribe', async () => {
  const listenerHandle = deferred<CapacitorAppLifecycleListenerHandle>()
  let callback: ((state: CapacitorAppLifecycleState) => void) | undefined
  let removals = 0
  const plugin: CapacitorAppLifecyclePlugin = {
    addListener(_eventName, listener) {
      callback = listener
      return listenerHandle.promise
    },
    getState: async () => ({ isActive: true }),
  }
  const { source } = createSource(plugin)
  const received: AppLifecycleEvent[] = []

  const unsubscribe = source.subscribe(event => received.push(event))
  await flushMicrotasks()
  unsubscribe()
  listenerHandle.resolve({
    remove() {
      removals += 1
    },
  })
  await flushMicrotasks()
  callback?.({ isActive: false })

  assert.equal(removals, 1)
  assert.deepEqual(received, [])
})

test('StrictMode-style teardown does not leak callbacks or duplicate delivery during async registration', async () => {
  const registrations = [deferred<CapacitorAppLifecycleListenerHandle>(), deferred<CapacitorAppLifecycleListenerHandle>()]
  const callbacks: Array<(state: CapacitorAppLifecycleState) => void> = []
  let registrationIndex = 0
  let removals = 0
  const plugin: CapacitorAppLifecyclePlugin = {
    addListener(_eventName, listener) {
      callbacks.push(listener)
      return registrations[registrationIndex++].promise
    },
    getState: async () => ({ isActive: true }),
  }
  const source = createLifecycleEventAdapter(createSource(plugin).source)
  const received: AppLifecycleEvent[] = []
  const unsubscribeFirst = source.subscribe(event => received.push(event))
  await flushMicrotasks()
  unsubscribeFirst()
  const unsubscribeSecond = source.subscribe(event => received.push(event))

  await flushMicrotasks()
  registrations[0].resolve({ remove: () => { removals += 1 } })
  registrations[1].resolve({ remove: () => { removals += 1 } })
  await flushMicrotasks()
  callbacks[0]({ isActive: false })
  callbacks[1]({ isActive: false })
  unsubscribeSecond()

  assert.equal(removals, 2)
  assert.deepEqual(received, ['background'])
})

test('fans transitions out to multiple consumers through the existing adapter', async () => {
  const fake = createFakePlugin()
  const adapter = createLifecycleEventAdapter(createSource(fake.plugin).source)
  const first: AppLifecycleEvent[] = []
  const second: AppLifecycleEvent[] = []

  const unsubscribeFirst = adapter.subscribe(event => first.push(event))
  const unsubscribeSecond = adapter.subscribe(event => second.push(event))
  await flushMicrotasks()
  fake.emit(false)
  unsubscribeFirst()
  fake.emit(true)
  unsubscribeSecond()

  assert.deepEqual(first, ['background'])
  assert.deepEqual(second, ['background', 'foreground'])
  assert.equal(fake.registrations, 1)
  assert.equal(fake.removals, 1)
})

test('contains plugin registration and initial-state errors', async () => {
  let attempts = 0
  const plugin: CapacitorAppLifecyclePlugin = {
    addListener() {
      attempts += 1
      if (attempts === 1) return Promise.reject(new Error('registration failed'))
      return Promise.resolve({ remove() {} })
    },
    getState() {
      return Promise.reject(new Error('state unavailable'))
    },
  }
  const { source } = createSource(plugin)
  const received: AppLifecycleEvent[] = []
  const unsubscribeFailed = source.subscribe(event => received.push(event))
  await flushMicrotasks()
  unsubscribeFailed()

  const unsubscribeRetried = source.subscribe(event => received.push(event))
  await flushMicrotasks()
  assert.doesNotThrow(() => unsubscribeRetried())
  assert.equal(attempts, 2)
})

function createCapacitorAppRegisterPluginProxy(
  initialState: CapacitorAppLifecycleState = { isActive: true },
  options: { readonly suppressThenUnhandledForControl?: boolean } = {},
) {
  let thenAccessCount = 0
  const unimplementedErrors: string[] = []
  const methodCalls: string[] = []
  const listeners = new Set<(state: CapacitorAppLifecycleState) => void>()
  let removals = 0
  let state = initialState

  const proxy = new Proxy({} as CapacitorAppLifecyclePlugin, {
    get(_target, prop) {
      if (prop === '$$typeof') return undefined
      if (prop === 'toJSON') return () => ({})
      if (prop === 'addListener') {
        return (eventName: 'appStateChange', listener: (next: CapacitorAppLifecycleState) => void) => {
          methodCalls.push('addListener')
          assert.equal(eventName, 'appStateChange')
          listeners.add(listener)
          return Promise.resolve({
            remove() {
              removals += 1
              listeners.delete(listener)
            },
          })
        }
      }
      if (prop === 'getState') {
        return () => {
          methodCalls.push('getState')
          return Promise.resolve(state)
        }
      }
      if (prop === 'then') {
        thenAccessCount += 1
      }
      const methodName = String(prop)
      return () => {
        const message = `"App.${methodName}()" is not implemented on ios`
        unimplementedErrors.push(message)
        const rejected = Promise.reject(new Error(message))
        if (options.suppressThenUnhandledForControl) {
          rejected.catch(() => {})
        }
        return rejected
      }
    },
  })

  return {
    proxy,
    emit(isActive: boolean) {
      state = { isActive }
      for (const listener of [...listeners]) listener(state)
    },
    get thenAccessCount() {
      return thenAccessCount
    },
    get unimplementedErrors() {
      return unimplementedErrors
    },
    get methodCalls() {
      return methodCalls
    },
    get removals() {
      return removals
    },
    get activeListenerCount() {
      return listeners.size
    },
  }
}

test('Capacitor registerPlugin-style Proxy triggers thenable trap when returned directly, and module-container loader avoids Proxy.then across full lifecycle', async () => {
  const control = createCapacitorAppRegisterPluginProxy(
    { isActive: true },
    { suppressThenUnhandledForControl: true },
  )

  // Reproduce the defect: returning the Capacitor Proxy directly from `.then(...)` / `async`
  // reads `Proxy.then`, triggers `"App.then()" is not implemented on ios`, and leaves the
  // outer Promise permanently pending before `addListener` or `getState` can run.
  const settledOrTimedOut = await Promise.race([
    Promise.resolve({ App: control.proxy })
      .then(module => module.App)
      .then(() => 'settled', () => 'rejected'),
    new Promise<string>(resolve => setTimeout(() => resolve('hung-pending'), 20)),
  ])
  assert.equal(settledOrTimedOut, 'hung-pending')
  assert.equal(control.thenAccessCount, 1)
  assert.deepEqual(control.unimplementedErrors, ['"App.then()" is not implemented on ios'])
  assert.deepEqual(control.methodCalls, [])

  // Fixed boundary via module-container seam (`loadAppPluginModule`) + plain facade.
  const strict = createCapacitorAppRegisterPluginProxy({ isActive: true })
  const lifecycle = createNativeLifecycleEvents({
    isNativePlatform: () => true,
    loadAppPluginModule: async () => ({ App: strict.proxy }),
  })
  const received: AppLifecycleEvent[] = []

  const unsubscribe = lifecycle.subscribe(event => received.push(event))
  await flushMicrotasks()

  assert.equal(strict.thenAccessCount, 0)
  assert.deepEqual(strict.unimplementedErrors, [])
  assert.deepEqual(strict.methodCalls, ['addListener', 'getState'])
  assert.equal(strict.activeListenerCount, 1)
  assert.deepEqual(received, [])

  strict.emit(false)
  strict.emit(false)
  strict.emit(true)
  strict.emit(true)
  assert.deepEqual(received, ['background', 'foreground'])

  unsubscribe()
  assert.equal(strict.removals, 1)
  assert.equal(strict.activeListenerCount, 0)

  strict.emit(false)
  assert.deepEqual(received, ['background', 'foreground'])
  assert.equal(strict.thenAccessCount, 0)

  // Direct facade helper also wraps a Proxy without reading `.then`.
  const facade = createAppLifecyclePluginFacade(strict.proxy)
  assert.equal('then' in facade, false)
  assert.equal(strict.thenAccessCount, 0)
})

test('default @capacitor/app dynamic loader in createNativeLifecycleEvents works on native without Proxy.then assimilation and stays a no-op on web', async () => {
  const webEvents = createNativeLifecycleEvents()
  const webReceived: AppLifecycleEvent[] = []
  const unsubscribeWeb = webEvents.subscribe(event => webReceived.push(event))
  await flushMicrotasks()
  unsubscribeWeb()
  assert.deepEqual(webReceived, [])

  const listeners = new Map<string, Set<() => void>>()
  const docState = { hidden: false }
  const visibilityListenerRegistered = deferred<void>()
  const originalDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: {
      get hidden() {
        return docState.hidden
      },
      addEventListener(type: string, cb: () => void) {
        if (!listeners.has(type)) listeners.set(type, new Set())
        listeners.get(type)!.add(cb)
        if (type === 'visibilitychange') visibilityListenerRegistered.resolve()
      },
      removeEventListener(type: string, cb: () => void) {
        listeners.get(type)?.delete(cb)
      },
    },
  })
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    writable: true,
    value: { language: 'en-US' },
  })

  try {
    const nativeEvents = createNativeLifecycleEvents({ isNativePlatform: () => true })
    const received: AppLifecycleEvent[] = []
    const unsubscribe = nativeEvents.subscribe(event => received.push(event))
    await visibilityListenerRegistered.promise
    await new Promise(resolve => setTimeout(resolve, 10))
    await flushMicrotasks()

    const fireVisibilityChange = (hidden: boolean) => {
      docState.hidden = hidden
      for (const cb of [...(listeners.get('visibilitychange') ?? [])]) cb()
    }

    assert.deepEqual(received, [])
    fireVisibilityChange(true)
    fireVisibilityChange(true)
    fireVisibilityChange(false)
    assert.deepEqual(received, ['background', 'foreground'])

    unsubscribe()
    await flushMicrotasks()
    fireVisibilityChange(true)
    assert.deepEqual(received, ['background', 'foreground'])
  } finally {
    if (originalDocumentDescriptor) {
      Object.defineProperty(globalThis, 'document', originalDocumentDescriptor)
    } else {
      Reflect.deleteProperty(globalThis, 'document')
    }
    if (originalNavigatorDescriptor) {
      Object.defineProperty(globalThis, 'navigator', originalNavigatorDescriptor)
    } else {
      Reflect.deleteProperty(globalThis, 'navigator')
    }
  }
})

test('contains sync/async module load failures and invalid plugin shapes and recovers on retry', async () => {
  const strict = createCapacitorAppRegisterPluginProxy({ isActive: true })
  let attempt = 0
  const source = createCapacitorLifecycleEventSource({
    isNativePlatform: () => true,
    loadAppPluginModule: () => {
      attempt += 1
      if (attempt === 1) throw new Error('Sync import failure')
      if (attempt === 2) return Promise.reject(new Error('Async import failure'))
      if (attempt === 3) return Promise.resolve({} as CapacitorAppLifecycleModule)
      return Promise.resolve({ App: strict.proxy })
    },
  })

  const received: AppLifecycleEvent[] = []
  for (let i = 0; i < 3; i += 1) {
    const unsubscribe = source.subscribe(event => received.push(event))
    await flushMicrotasks()
    assert.doesNotThrow(() => unsubscribe())
  }
  assert.equal(attempt, 3)
  assert.deepEqual(strict.methodCalls, [])

  const unsubscribeRecovered = source.subscribe(event => received.push(event))
  await flushMicrotasks()
  strict.emit(false)
  strict.emit(true)
  unsubscribeRecovered()

  assert.equal(attempt, 4)
  assert.deepEqual(received, ['background', 'foreground'])
  assert.equal(strict.thenAccessCount, 0)
  assert.equal(strict.removals, 1)
})

test('handles asynchronous races across module load, getState, duplicate listeners, and late cleanup', async () => {
  // 1. Unsubscribe while loadAppPluginModule is pending prevents addListener/getState calls.
  const pendingModule = deferred<CapacitorAppLifecycleModule>()
  const lateStrict = createCapacitorAppRegisterPluginProxy({ isActive: true })
  const sourcePendingLoad = createCapacitorLifecycleEventSource({
    isNativePlatform: () => true,
    loadAppPluginModule: () => pendingModule.promise,
  })
  const lateReceived: AppLifecycleEvent[] = []
  const unsubEarly = sourcePendingLoad.subscribe(event => lateReceived.push(event))
  unsubEarly()
  pendingModule.resolve({ App: lateStrict.proxy })
  await flushMicrotasks()
  assert.deepEqual(lateStrict.methodCalls, [])
  assert.deepEqual(lateReceived, [])

  // 2. Unsubscribe while getState is pending removes handle immediately and discards late state.
  const pendingState = deferred<CapacitorAppLifecycleState>()
  let removedWhileGetStatePending = 0
  const sourcePendingGetState = createCapacitorLifecycleEventSource({
    isNativePlatform: () => true,
    loadAppPluginModule: async () => ({
      App: {
        addListener: async () => ({
          remove() {
            removedWhileGetStatePending += 1
            return Promise.reject(new Error('late cleanup rejection'))
          },
        }),
        getState: () => pendingState.promise,
      },
    }),
  })
  const getStateRaceReceived: AppLifecycleEvent[] = []
  const unsubDuringGetState = sourcePendingGetState.subscribe(event => getStateRaceReceived.push(event))
  await flushMicrotasks()
  unsubDuringGetState()
  assert.equal(removedWhileGetStatePending, 1)
  pendingState.resolve({ isActive: false })
  await flushMicrotasks()
  assert.deepEqual(getStateRaceReceived, [])

  // 3. appStateChange arriving before getState resolves flushes only if distinct from getState,
  // and flushes cleanly if initial getState rejects.
  const initialStateGate = deferred<CapacitorAppLifecycleState>()
  let raceCallback: ((state: CapacitorAppLifecycleState) => void) | undefined
  const raceSource = createCapacitorLifecycleEventSource({
    isNativePlatform: () => true,
    loadAppPluginModule: async () => ({
      App: {
        addListener: async (_eventName, cb) => {
          raceCallback = cb
          return { remove() {} }
        },
        getState: () => initialStateGate.promise,
      },
    }),
  })
  const earlyTransitionEvents: AppLifecycleEvent[] = []
  const unsubRace = raceSource.subscribe(event => earlyTransitionEvents.push(event))
  await flushMicrotasks()
  raceCallback?.({ isActive: false })
  assert.deepEqual(earlyTransitionEvents, [])
  initialStateGate.resolve({ isActive: true })
  await flushMicrotasks()
  assert.deepEqual(earlyTransitionEvents, ['background'])
  unsubRace()

  const sameStateGate = deferred<CapacitorAppLifecycleState>()
  let sameCallback: ((state: CapacitorAppLifecycleState) => void) | undefined
  const sameRaceSource = createCapacitorLifecycleEventSource({
    isNativePlatform: () => true,
    loadAppPluginModule: async () => ({
      App: {
        addListener: async (_eventName, cb) => {
          sameCallback = cb
          return { remove() {} }
        },
        getState: () => sameStateGate.promise,
      },
    }),
  })
  const sameStateEvents: AppLifecycleEvent[] = []
  const unsubSame = sameRaceSource.subscribe(event => sameStateEvents.push(event))
  await flushMicrotasks()
  sameCallback?.({ isActive: true })
  sameStateGate.resolve({ isActive: true })
  await flushMicrotasks()
  assert.deepEqual(sameStateEvents, [])
  unsubSame()

  const rejectedStateGate = deferred<CapacitorAppLifecycleState>()
  let rejectedCallback: ((state: CapacitorAppLifecycleState) => void) | undefined
  const rejectedRaceSource = createCapacitorLifecycleEventSource({
    isNativePlatform: () => true,
    loadAppPluginModule: async () => ({
      App: {
        addListener: async (_eventName, cb) => {
          rejectedCallback = cb
          return { remove() {} }
        },
        getState: () => rejectedStateGate.promise,
      },
    }),
  })
  const rejectedStateEvents: AppLifecycleEvent[] = []
  const unsubRejected = rejectedRaceSource.subscribe(event => rejectedStateEvents.push(event))
  await flushMicrotasks()
  rejectedCallback?.({ isActive: false })
  rejectedStateGate.reject(new Error('getState unavailable'))
  await flushMicrotasks()
  assert.deepEqual(rejectedStateEvents, ['background'])
  unsubRejected()

  // 4. Duplicate listener registrations share one Proxy registration and clean up on final unsubscribe.
  const sharedProxy = createCapacitorAppRegisterPluginProxy({ isActive: true })
  const sharedAdapter = createNativeLifecycleEvents({
    isNativePlatform: () => true,
    loadAppPluginModule: async () => ({ App: sharedProxy.proxy }),
  })
  const dupReceived: AppLifecycleEvent[] = []
  const dupListener = (event: AppLifecycleEvent) => dupReceived.push(event)
  const unsubDup1 = sharedAdapter.subscribe(dupListener)
  const unsubDup2 = sharedAdapter.subscribe(dupListener)
  await flushMicrotasks()
  assert.deepEqual(sharedProxy.methodCalls, ['addListener', 'getState'])

  sharedProxy.emit(false)
  unsubDup1()
  assert.equal(sharedProxy.removals, 0)
  sharedProxy.emit(true)
  unsubDup2()
  assert.equal(sharedProxy.removals, 1)
  assert.deepEqual(dupReceived, ['background', 'foreground'])
  assert.equal(sharedProxy.thenAccessCount, 0)
})
