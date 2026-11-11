import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createCapacitorLifecycleEventSource,
  type CapacitorAppLifecycleListenerHandle,
  type CapacitorAppLifecyclePlugin,
  type CapacitorAppLifecycleState,
} from '../../src/native/capacitorLifecycleSource.ts'
import { createLifecycleEventAdapter, type AppLifecycleEvent } from '../../src/native/lifecycleAdapter.ts'

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
