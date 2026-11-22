import assert from 'node:assert/strict'
import test from 'node:test'
import {
  READER_PROFILE_SCHEMA_VERSION,
  applyReaderProfilePatch,
  createDefaultReaderProfile,
  mapLegacyPrototypeState,
  normalizeReaderProfile,
  parseReaderProfileEnvelope,
  serializeReaderProfileEnvelope,
  type ReaderProfilePatch,
} from '../../src/readerProfile/index.ts'
import { LEGACY_FULL } from './helpers.ts'

test('defaults: pending onboarding, follow seasons, system contrast, default text, reminder off', () => {
  assert.deepEqual(createDefaultReaderProfile(), {
    introStatus: 'pending',
    tutorialStatus: 'pending',
    guestInviteDismissed: false,
    appearance: { mode: 'followSeasons', chosenPaletteId: null },
    contrastMode: 'system',
    textScale: 'default',
    reminder: { enabled: false, time: '08:00' },
  })
  assert.ok(Object.isFrozen(createDefaultReaderProfile()))
})

test('envelope round-trips and records origin', () => {
  const profile = { ...createDefaultReaderProfile(), tutorialStatus: 'skipped' as const }
  const raw = serializeReaderProfileEnvelope(profile, 'legacyPrototypeMigration')
  assert.equal(JSON.parse(raw).schemaVersion, READER_PROFILE_SCHEMA_VERSION)
  const parsed = parseReaderProfileEnvelope(raw)
  assert.equal(parsed.kind, 'valid')
  if (parsed.kind !== 'valid') return
  assert.deepEqual(parsed.profile, profile)
  assert.equal(parsed.origin, 'legacyPrototypeMigration')
  assert.deepEqual(parsed.diagnostics, [])
})

test('envelope parsing: absent, malformed, unknown and newer versions', () => {
  assert.equal(parseReaderProfileEnvelope(null).kind, 'absent')
  assert.equal(parseReaderProfileEnvelope('').kind, 'absent')
  assert.equal(parseReaderProfileEnvelope('{oops').kind, 'corrupt')
  assert.equal(parseReaderProfileEnvelope('[]').kind, 'corrupt')
  assert.equal(parseReaderProfileEnvelope('{"schemaVersion":0,"profile":{}}').kind, 'corrupt')
  assert.equal(parseReaderProfileEnvelope('{"schemaVersion":"1","profile":{}}').kind, 'corrupt')
  assert.equal(parseReaderProfileEnvelope('{"schemaVersion":1}').kind, 'corrupt')
  const newer = parseReaderProfileEnvelope('{"schemaVersion":2,"profile":{}}')
  assert.deepEqual(newer, { kind: 'unsupportedNewerSchema', schemaVersion: 2 })
})

test('normalization defaults invalid fields individually and keeps valid ones', () => {
  const { profile, diagnostics } = normalizeReaderProfile({
    introStatus: 'completed',
    tutorialStatus: 'done',
    guestInviteDismissed: 'yes',
    appearance: { mode: 'chooseColors', chosenPaletteId: null },
    contrastMode: 'dark',
    textScale: 'huge',
    reminder: { enabled: true, time: '25:00' },
  })
  assert.equal(profile.introStatus, 'completed')
  assert.equal(profile.contrastMode, 'dark')
  assert.equal(profile.tutorialStatus, 'pending')
  assert.equal(profile.guestInviteDismissed, false)
  assert.deepEqual(profile.appearance, { mode: 'followSeasons', chosenPaletteId: null })
  assert.equal(profile.textScale, 'default')
  assert.deepEqual(profile.reminder, { enabled: false, time: '08:00' })
  assert.deepEqual(
    diagnostics.map(d => d.field).sort(),
    ['appearance', 'guestInviteDismissed', 'reminder', 'textScale', 'tutorialStatus'],
  )
})

test('normalization fills missing fields with defaults', () => {
  const { profile, diagnostics } = normalizeReaderProfile({ introStatus: 'skipped' })
  assert.equal(profile.introStatus, 'skipped')
  assert.equal(profile.tutorialStatus, 'pending')
  assert.equal(diagnostics.length, 6)
  assert.ok(diagnostics.every(d => d.reason.startsWith('missing')))
})

test('legacy mapping carries only representable values; onboarded never implies tutorial', () => {
  const mapped = mapLegacyPrototypeState(LEGACY_FULL)
  assert.equal(mapped.kind, 'mapped')
  if (mapped.kind !== 'mapped') return
  assert.deepEqual(mapped.profile, {
    introStatus: 'completed',
    tutorialStatus: 'pending',
    guestInviteDismissed: false,
    appearance: { mode: 'followSeasons', chosenPaletteId: null },
    contrastMode: 'dark',
    textScale: 'large',
    reminder: { enabled: true, time: '06:45' },
  })
  assert.deepEqual(mapped.diagnostics, [])
})

test('legacy mapping: onboarded false stays pending; invalid values default with diagnostics', () => {
  const mapped = mapLegacyPrototypeState(JSON.stringify({
    onboarded: 'true',
    appearance: 'sepia',
    textSize: 12,
    reminderEnabled: 'on',
    reminderTime: '7am',
  }))
  assert.equal(mapped.kind, 'mapped')
  if (mapped.kind !== 'mapped') return
  assert.deepEqual(mapped.profile, createDefaultReaderProfile())
  assert.deepEqual(
    mapped.diagnostics.map(d => d.field),
    ['onboarded', 'appearance', 'textSize', 'reminderEnabled', 'reminderTime'],
  )

  const notOnboarded = mapLegacyPrototypeState('{"onboarded":false}')
  assert.equal(notOnboarded.kind === 'mapped' && notOnboarded.profile.introStatus, 'pending')
})

test('legacy mapping: absent and unreadable', () => {
  assert.equal(mapLegacyPrototypeState(null).kind, 'absent')
  assert.equal(mapLegacyPrototypeState('not json').kind, 'unreadable')
  assert.equal(mapLegacyPrototypeState('"string"').kind, 'unreadable')
  assert.equal(mapLegacyPrototypeState('null').kind, 'unreadable')
})

test('patch validation is all-or-nothing', () => {
  const base = createDefaultReaderProfile()
  const bad = applyReaderProfilePatch(base, {
    introStatus: 'completed',
    textScale: 'huge',
  } as unknown as ReaderProfilePatch)
  assert.equal(bad.ok, false)

  const invalidPatches: unknown[] = [
    { tutorialStatus: 'done' },
    { guestInviteDismissed: false },
    { appearance: { mode: 'chooseColors', chosenPaletteId: null } },
    { appearance: { mode: 'chooseColors', chosenPaletteId: 'Bad Id!' } },
    { appearance: { mode: 'custom', chosenPaletteId: null } },
    { contrastMode: 'high' },
    { reminder: { enabled: true, time: '9:00' } },
    { reminder: { enabled: 'yes', time: '09:00' } },
    null,
  ]
  for (const patch of invalidPatches) {
    assert.equal(applyReaderProfilePatch(base, patch as ReaderProfilePatch).ok, false, JSON.stringify(patch))
  }
})

test('patch reports no change for identical values', () => {
  const base = createDefaultReaderProfile()
  const same = applyReaderProfilePatch(base, { introStatus: 'pending', contrastMode: 'system' })
  assert.deepEqual(same, { ok: true, profile: base, changed: false })
  const changed = applyReaderProfilePatch(base, { appearance: { mode: 'chooseColors', chosenPaletteId: 'ember' } })
  assert.equal(changed.ok && changed.changed, true)
})
