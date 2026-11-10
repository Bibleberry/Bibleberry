import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_RELEASE_TIME_ZONE,
  isValidIanaTimeZone,
  resolveAuthorizedReaderDate,
} from '../../src/gateway/localRelease.ts'

test('isValidIanaTimeZone accepts supported IANA zones including UTC and Etc/GMT+12', () => {
  const validZones = [
    'America/New_York',
    'Asia/Tokyo',
    'Pacific/Honolulu',
    'Pacific/Kiritimati',
    'UTC',
    'Etc/GMT+12',
    'Etc/GMT-14',
    '  America/New_York  ',
  ]

  for (const zone of validZones) {
    assert.equal(isValidIanaTimeZone(zone), true, `Expected "${zone}" to be accepted`)
  }
})

test('isValidIanaTimeZone rejects missing, blank, malformed, >64-char, and raw offset inputs', () => {
  const invalidZones: (string | null | undefined)[] = [
    undefined,
    null,
    '',
    '   ',
    '+14:00',
    '+99:00',
    '-05:00',
    '+0530',
    '+14',
    'GMT+5',
    'GMT+05:00',
    'GMT-05:00',
    'UTC+14',
    'UTC-5',
    'Mars/Olympus',
    'Not/A_Real_Zone',
    'America/New_York;drop',
    'A'.repeat(65),
    `America/${'x'.repeat(57)}`,
  ]

  for (const zone of invalidZones) {
    assert.equal(isValidIanaTimeZone(zone), false, `Expected "${String(zone)}" to be rejected`)
  }
})

test('resolveAuthorizedReaderDate resolves New York, Tokyo, and Honolulu accurately at 2026-11-10T02:00:00Z', () => {
  const serverNowUtc = new Date('2026-11-10T02:00:00.000Z')

  assert.deepEqual(resolveAuthorizedReaderDate(serverNowUtc, 'America/New_York'), {
    authorizedLocalDate: '2026-11-09',
    effectiveTimeZone: 'America/New_York',
    usedFallback: false,
  })

  assert.deepEqual(resolveAuthorizedReaderDate(serverNowUtc, 'Asia/Tokyo'), {
    authorizedLocalDate: '2026-11-10',
    effectiveTimeZone: 'Asia/Tokyo',
    usedFallback: false,
  })

  assert.deepEqual(resolveAuthorizedReaderDate(serverNowUtc, 'Pacific/Honolulu'), {
    authorizedLocalDate: '2026-11-09',
    effectiveTimeZone: 'Pacific/Honolulu',
    usedFallback: false,
  })

  assert.deepEqual(resolveAuthorizedReaderDate(serverNowUtc, 'UTC'), {
    authorizedLocalDate: '2026-11-10',
    effectiveTimeZone: 'UTC',
    usedFallback: false,
  })

  assert.deepEqual(resolveAuthorizedReaderDate(serverNowUtc, 'Etc/GMT+12'), {
    authorizedLocalDate: '2026-11-09',
    effectiveTimeZone: 'Etc/GMT+12',
    usedFallback: false,
  })
})

test('resolveAuthorizedReaderDate falls back deterministically to America/New_York for missing or invalid headers', () => {
  const serverNowUtc = new Date('2026-11-10T02:00:00.000Z')
  const fallbackCases: (string | null | undefined)[] = [
    undefined,
    null,
    '',
    '   ',
    'Mars/Olympus',
    '+14:00',
    '+99:00',
    'GMT+14',
    'UTC+09:00',
    'X'.repeat(65),
  ]

  for (const header of fallbackCases) {
    assert.deepEqual(resolveAuthorizedReaderDate(serverNowUtc, header), {
      authorizedLocalDate: '2026-11-09',
      effectiveTimeZone: DEFAULT_RELEASE_TIME_ZONE,
      usedFallback: true,
    })
  }
})

test('resolveAuthorizedReaderDate enforces Pacific/Kiritimati UTC+14 global ceiling from serverNowUtc', () => {
  // 2026-11-09T15:00:00Z -> 2026-11-10T05:00:00+14:00 in Pacific/Kiritimati
  const serverNowUtc = new Date('2026-11-09T15:00:00.000Z')
  assert.deepEqual(resolveAuthorizedReaderDate(serverNowUtc, 'Pacific/Kiritimati'), {
    authorizedLocalDate: '2026-11-10',
    effectiveTimeZone: 'Pacific/Kiritimati',
    usedFallback: false,
  })

  // Just before 10:00Z on 2026-11-09 is still 2026-11-09 in Pacific/Kiritimati
  assert.deepEqual(
    resolveAuthorizedReaderDate(new Date('2026-11-09T09:59:59.999Z'), 'Pacific/Kiritimati'),
    {
      authorizedLocalDate: '2026-11-09',
      effectiveTimeZone: 'Pacific/Kiritimati',
      usedFallback: false,
    },
  )
})

test('resolveAuthorizedReaderDate transitions cleanly at local midnight across both Spring and Fall DST boundaries', () => {
  // Spring forward in America/New_York: 2027-03-14 (EST UTC-5 -> EDT UTC-4 at 02:00 local)
  assert.equal(
    resolveAuthorizedReaderDate(new Date('2027-03-14T04:59:59.999Z'), 'America/New_York')
      .authorizedLocalDate,
    '2027-03-13',
  )
  assert.equal(
    resolveAuthorizedReaderDate(new Date('2027-03-14T05:00:00.000Z'), 'America/New_York')
      .authorizedLocalDate,
    '2027-03-14',
  )
  // 23-hour day ends at 04:00Z (now EDT UTC-4)
  assert.equal(
    resolveAuthorizedReaderDate(new Date('2027-03-15T03:59:59.999Z'), 'America/New_York')
      .authorizedLocalDate,
    '2027-03-14',
  )
  assert.equal(
    resolveAuthorizedReaderDate(new Date('2027-03-15T04:00:00.000Z'), 'America/New_York')
      .authorizedLocalDate,
    '2027-03-15',
  )

  // Fall back in America/New_York: 2026-11-01 (EDT UTC-4 -> EST UTC-5 at 02:00 local)
  assert.equal(
    resolveAuthorizedReaderDate(new Date('2026-11-01T03:59:59.999Z'), 'America/New_York')
      .authorizedLocalDate,
    '2026-10-31',
  )
  assert.equal(
    resolveAuthorizedReaderDate(new Date('2026-11-01T04:00:00.000Z'), 'America/New_York')
      .authorizedLocalDate,
    '2026-11-01',
  )
  // 25-hour day ends at 05:00Z (now EST UTC-5)
  assert.equal(
    resolveAuthorizedReaderDate(new Date('2026-11-02T04:59:59.999Z'), 'America/New_York')
      .authorizedLocalDate,
    '2026-11-01',
  )
  assert.equal(
    resolveAuthorizedReaderDate(new Date('2026-11-02T05:00:00.000Z'), 'America/New_York')
      .authorizedLocalDate,
    '2026-11-02',
  )
})
