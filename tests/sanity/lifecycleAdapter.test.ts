import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createLifecycleEventAdapter,
  type AppLifecycleEvent,
  type AppLifecycleListener,
} from '../../src/native/lifecycleAdapter.ts'

function createFakeSource() {
  const listeners = new Set<AppLifecycleListener>()
  let subscriptions = 0
  let cleanups = 0

  return {
    source: {
      subscribe(listener: AppLifecycleListener) {
        subscriptions += 1
        listeners.add(listener)
        return () => {
          cleanups += 1
          listeners.delete(listener)
        }
      },
    },
    emit(event: AppLifecycleEvent) {
      for (const listener of [...listeners]) listener(event)
    },
    get activeSourceListeners() {
      return listeners.size
    },
    get subscriptions() {
      return subscriptions
    },
    get cleanups() {
      return cleanups
    },
  }
}

test('shares one source listener and cleans it up after the final subscriber', () => {
  const fake = createFakeSource()
  const adapter = createLifecycleEventAdapter(fake.source)
  const receivedA: AppLifecycleEvent[] = []
  const receivedB: AppLifecycleEvent[] = []
  const unsubscribeA = adapter.subscribe(event => receivedA.push(event))
  const unsubscribeB = adapter.subscribe(event => receivedB.push(event))

  assert.equal(fake.subscriptions, 1)
  assert.equal(fake.activeSourceListeners, 1)
  fake.emit('background')
  unsubscribeA()
  fake.emit('foreground')
  unsubscribeB()

  assert.deepEqual(receivedA, ['background'])
  assert.deepEqual(receivedB, ['background', 'foreground'])
  assert.equal(fake.cleanups, 1)
  assert.equal(fake.activeSourceListeners, 0)
})

test('StrictMode-style setup, cleanup, and setup has no duplicate or lost events', () => {
  const fake = createFakeSource()
  const adapter = createLifecycleEventAdapter(fake.source)
  const received: AppLifecycleEvent[] = []

  const cleanupFirstMount = adapter.subscribe(event => received.push(event))
  fake.emit('coldStart')
  cleanupFirstMount()
  cleanupFirstMount()
  const cleanupSecondMount = adapter.subscribe(event => received.push(event))
  fake.emit('foreground')
  cleanupSecondMount()

  assert.deepEqual(received, ['coldStart', 'foreground'])
  assert.equal(fake.subscriptions, 2)
  assert.equal(fake.cleanups, 2)
  assert.equal(fake.activeSourceListeners, 0)
})

test('reference-counts repeated subscriptions for the same listener', () => {
  const fake = createFakeSource()
  const adapter = createLifecycleEventAdapter(fake.source)
  const received: AppLifecycleEvent[] = []
  const listener = (event: AppLifecycleEvent) => received.push(event)
  const unsubscribeFirst = adapter.subscribe(listener)
  const unsubscribeSecond = adapter.subscribe(listener)

  assert.equal(fake.subscriptions, 1)
  fake.emit('background')
  unsubscribeFirst()
  fake.emit('foreground')
  unsubscribeSecond()

  assert.deepEqual(received, ['background', 'foreground'])
  assert.equal(fake.cleanups, 1)
})
