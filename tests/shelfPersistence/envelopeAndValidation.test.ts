import assert from 'node:assert/strict'
import test from 'node:test'
import { GUEST_PARTICIPATION_STORAGE_KEY } from '../../src/participation/defaultGuestStore.ts'
import type { KeyValueStorageDriver } from '../../src/participation/persistence.ts'
import {
  GUEST_SHELF_STORAGE_KEY,
  SHELF_ENVELOPE_SCHEMA_VERSION,
  createShelfEnvelopePersistenceAdapter,
  emptyPersistedShelfPayload,
  parseShelfEnvelope,
  serializeShelfEnvelope,
} from '../../src/shelfPersistence/index.ts'

function createMemoryDriver(initial: Record<string, string> = {}): KeyValueStorageDriver & {
  readonly store: Map<string, string>
} {
  const store = new Map<string, string>(Object.entries(initial))
  return {
    store,
    getItem(key) {
      return store.get(key) ?? null
    },
    setItem(key, value) {
      store.set(key, value)
    },
    removeItem(key) {
      store.delete(key)
    },
  }
}

test('GUEST_SHELF_STORAGE_KEY is strictly isolated from GUEST_PARTICIPATION_STORAGE_KEY', () => {
  assert.notEqual(GUEST_SHELF_STORAGE_KEY, GUEST_PARTICIPATION_STORAGE_KEY)
  assert.equal(GUEST_SHELF_STORAGE_KEY, 'bibleberry-guest-shelf-v1')
})

test('new install starts with an empty, valid Shelf (not padded to 3)', () => {
  const result = parseShelfEnvelope(null, { referenceCurrentMonth: '2026-11' })
  assert.equal(result.health, 'ok')
  assert.deepEqual(result.payload.state.months, [])
  assert.equal(result.payload.state.activeFocusMonth, null)
  assert.equal(result.payload.rolloverWatermark, null)
})

test('encodes and decodes 0-3 months, admissionKind, protection, activeFocusMonth, dates, and watermark', () => {
  const payload = {
    state: {
      months: [
        {
          yearMonth: '2026-08' as const,
          admissionKind: 'readerSelected' as const,
          isProtected: true,
          admittedOn: '2026-09-05' as const,
        },
        {
          yearMonth: '2026-09' as const,
          admissionKind: 'autoAdmitted' as const,
          isProtected: false,
          admittedOn: '2026-10-01' as const,
        },
        {
          yearMonth: '2026-10' as const,
          admissionKind: 'autoAdmitted' as const,
          isProtected: true,
          admittedOn: '2026-11-01' as const,
        },
      ],
      activeFocusMonth: '2026-05' as const,
      updatedOn: '2026-11-02' as const,
    },
    rolloverWatermark: {
      lastNewCurrentYearMonth: '2026-11' as const,
      lastEndingYearMonth: '2026-10' as const,
      lastDisposition: 'admittedToOpenSlot' as const,
    },
  }

  const raw = serializeShelfEnvelope(payload)
  const parsed = parseShelfEnvelope(raw, { referenceCurrentMonth: '2026-11' })

  assert.equal(parsed.health, 'ok')
  assert.equal(parsed.payload.state.months.length, 3)
  assert.deepEqual(parsed.payload.state.months[0], payload.state.months[0])
  assert.deepEqual(parsed.payload.state.months[1], payload.state.months[1])
  assert.deepEqual(parsed.payload.state.months[2], payload.state.months[2])
  assert.equal(parsed.payload.state.activeFocusMonth, '2026-05')
  assert.equal(parsed.payload.state.updatedOn, '2026-11-02')
  assert.deepEqual(parsed.payload.rolloverWatermark, payload.rolloverWatermark)
})

test('rejects current or future month in storage against referenceCurrentMonth without overwriting', () => {
  const badEnvelope = JSON.stringify({
    schemaVersion: SHELF_ENVELOPE_SCHEMA_VERSION,
    state: {
      months: [
        { yearMonth: '2026-11', admissionKind: 'readerSelected', isProtected: true },
      ],
      activeFocusMonth: null,
    },
  })

  const driver = createMemoryDriver({ [GUEST_SHELF_STORAGE_KEY]: badEnvelope })
  const adapter = createShelfEnvelopePersistenceAdapter({
    driver,
    referenceCurrentMonth: '2026-11',
  })

  const loaded = adapter.load()
  assert.ok(!('then' in loaded))
  assert.equal(loaded.health, 'corruptStoredData')
  assert.deepEqual(loaded.payload.state.months, [])

  const flush = adapter.flushCommands(
    [{ type: 'select', params: { yearMonth: '2026-10', referenceCurrentYearMonth: '2026-11' } }],
    emptyPersistedShelfPayload(),
  )
  assert.ok(!('then' in flush))
  assert.equal(flush.ok, false)
  assert.equal(flush.health, 'corruptStoredData')
  assert.equal(driver.store.get(GUEST_SHELF_STORAGE_KEY), badEnvelope)
})

test('preserves unsupported newer schema (schemaVersion > 1) and corrupt JSON without overwriting', () => {
  const newerSchemaRaw = JSON.stringify({
    schemaVersion: 2,
    state: { months: [], activeFocusMonth: null },
    futureField: 'preserve-me',
  })

  const newerDriver = createMemoryDriver({ [GUEST_SHELF_STORAGE_KEY]: newerSchemaRaw })
  const newerAdapter = createShelfEnvelopePersistenceAdapter({ driver: newerDriver })
  const newerLoad = newerAdapter.load()
  assert.ok(!('then' in newerLoad))
  assert.equal(newerLoad.health, 'unsupportedNewerSchema')

  const newerFlush = newerAdapter.flushCommands(
    [{ type: 'select', params: { yearMonth: '2026-10', referenceCurrentYearMonth: '2026-11' } }],
    emptyPersistedShelfPayload(),
  )
  assert.ok(!('then' in newerFlush))
  assert.equal(newerFlush.ok, false)
  assert.equal(newerFlush.health, 'unsupportedNewerSchema')
  assert.equal(newerDriver.store.get(GUEST_SHELF_STORAGE_KEY), newerSchemaRaw)

  const corruptRaw = '{not-valid-json'
  const corruptDriver = createMemoryDriver({ [GUEST_SHELF_STORAGE_KEY]: corruptRaw })
  const corruptAdapter = createShelfEnvelopePersistenceAdapter({ driver: corruptDriver })
  const corruptLoad = corruptAdapter.load()
  assert.ok(!('then' in corruptLoad))
  assert.equal(corruptLoad.health, 'corruptStoredData')

  const corruptFlush = corruptAdapter.flushCommands(
    [{ type: 'select', params: { yearMonth: '2026-10', referenceCurrentYearMonth: '2026-11' } }],
    emptyPersistedShelfPayload(),
  )
  assert.ok(!('then' in corruptFlush))
  assert.equal(corruptFlush.ok, false)
  assert.equal(corruptFlush.health, 'corruptStoredData')
  assert.equal(corruptDriver.store.get(GUEST_SHELF_STORAGE_KEY), corruptRaw)
})

test('rejects bad shape (> 3 months, duplicate months, invalid month, malformed watermark)', () => {
  const overCapacity = JSON.stringify({
    schemaVersion: 1,
    state: {
      months: [
        { yearMonth: '2026-07', admissionKind: 'readerSelected', isProtected: true },
        { yearMonth: '2026-08', admissionKind: 'readerSelected', isProtected: true },
        { yearMonth: '2026-09', admissionKind: 'readerSelected', isProtected: true },
        { yearMonth: '2026-10', admissionKind: 'readerSelected', isProtected: true },
      ],
    },
  })
  assert.equal(parseShelfEnvelope(overCapacity).health, 'corruptStoredData')

  const duplicateMonths = JSON.stringify({
    schemaVersion: 1,
    state: {
      months: [
        { yearMonth: '2026-09', admissionKind: 'readerSelected', isProtected: true },
        { yearMonth: '2026-09', admissionKind: 'autoAdmitted', isProtected: false },
      ],
    },
  })
  assert.equal(parseShelfEnvelope(duplicateMonths).health, 'corruptStoredData')

  const invalidMonth = JSON.stringify({
    schemaVersion: 1,
    state: {
      months: [{ yearMonth: '2026-13', admissionKind: 'readerSelected', isProtected: true }],
    },
  })
  assert.equal(parseShelfEnvelope(invalidMonth).health, 'corruptStoredData')

  const badWatermark = JSON.stringify({
    schemaVersion: 1,
    state: { months: [], activeFocusMonth: null },
    rolloverWatermark: {
      lastNewCurrentYearMonth: '2026-10',
      lastEndingYearMonth: '2026-11',
      lastDisposition: 'admittedToOpenSlot',
    },
  })
  assert.equal(parseShelfEnvelope(badWatermark).health, 'corruptStoredData')
})

test('surfaces storageUnavailable when storage driver throws', () => {
  const failingDriver: KeyValueStorageDriver = {
    getItem() {
      throw new Error('Storage disabled')
    },
    setItem() {
      throw new Error('Storage disabled')
    },
    removeItem() {
      throw new Error('Storage disabled')
    },
  }
  const adapter = createShelfEnvelopePersistenceAdapter({ driver: failingDriver })
  const loaded = adapter.load()
  assert.ok(!('then' in loaded))
  assert.equal(loaded.health, 'storageUnavailable')
  assert.deepEqual(loaded.payload.state.months, [])
})
