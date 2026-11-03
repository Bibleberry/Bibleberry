import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CMS_LAB_STORAGE_KEY,
  cmsChallengeKey,
  cmsScriptureKey,
  emptyCmsLabState,
  readCmsLabState,
  resolveCmsScreenIndex,
  toggleCmsSavedChallenge,
  toggleCmsScripture,
  writeCmsLabState,
  type CmsLabState,
  type CmsStorage,
} from '../../src/cms/sanity/labState.ts'
import { mapPublishedChallenge } from '../../src/cms/sanity/mapChallenge.ts'
import { validChallengeFixture } from './fixtures.ts'

function mappedChallenge() {
  const result = mapPublishedChallenge(validChallengeFixture)
  if (!result.ok) assert.fail('Expected the structural fixture to validate.')
  return result.challenge
}

function memoryStorage(initial: string | null = null) {
  const values = new Map<string, string>()
  const reads: string[] = []
  const writes: string[] = []
  if (initial !== null) values.set(CMS_LAB_STORAGE_KEY, initial)
  return {
    reads,
    writes,
    storage: {
      getItem(key: string) {
        reads.push(key)
        return values.get(key) ?? null
      },
      setItem(key: string, value: string) {
        writes.push(key)
        values.set(key, value)
      },
    } satisfies CmsStorage,
  }
}

test('source-qualifies Challenge and Scripture identities', () => {
  const challenge = mappedChallenge()
  assert.equal(cmsChallengeKey('live', challenge), 'sanity-live:fixture-challenge-document')
  assert.equal(cmsChallengeKey('fixture', challenge), 'sanity-fixture:fixture-challenge-document')
  assert.notEqual(cmsChallengeKey('live', challenge), cmsChallengeKey('fixture', challenge))

  const scripture = challenge.primaryScripture
  assert.notEqual(cmsScriptureKey('live', scripture), cmsScriptureKey('fixture', scripture))
  assert.equal(
    cmsScriptureKey('live', { ...scripture, reference: ' Fixture   Reference 1:1 ', translation: ' Not   Configured ' }),
    cmsScriptureKey('live', scripture),
  )
})

test('resumes by stable screen key across reorder and resets safely after removal', () => {
  const challenge = mappedChallenge()
  assert.equal(resolveCmsScreenIndex(challenge, 'screen-response'), 1)
  assert.equal(resolveCmsScreenIndex({ ...challenge, screens: [...challenge.screens].reverse() }, 'screen-response'), 0)
  assert.equal(resolveCmsScreenIndex({ ...challenge, screens: [challenge.screens[0]] }, 'screen-response'), 0)
  assert.equal(resolveCmsScreenIndex(challenge, undefined), 0)
})

test('toggles saved Challenges and Scripture without merging live and fixture records', () => {
  const challenge = mappedChallenge()
  const scripture = challenge.primaryScripture
  const liveKey = cmsChallengeKey('live', challenge)
  const fixtureKey = cmsChallengeKey('fixture', challenge)
  const saved = toggleCmsSavedChallenge(toggleCmsSavedChallenge([], liveKey), fixtureKey)
  assert.deepEqual(saved, [liveKey, fixtureKey])
  assert.deepEqual(toggleCmsSavedChallenge(saved, liveKey), [fixtureKey])

  const withLive = toggleCmsScripture([], 'live', scripture)
  const withBoth = toggleCmsScripture(withLive, 'fixture', scripture)
  assert.equal(withBoth.length, 2)
  assert.deepEqual(withBoth.map(entry => entry.source), ['live', 'fixture'])
  assert.deepEqual(toggleCmsScripture(withBoth, 'live', scripture).map(entry => entry.source), ['fixture'])
})

test('round-trips only the isolated CMS storage namespace', () => {
  const challenge = mappedChallenge()
  const { storage, reads, writes } = memoryStorage()
  const state: CmsLabState = {
    positions: { [cmsChallengeKey('live', challenge)]: 'screen-response' },
    completedChallengeIds: [cmsChallengeKey('fixture', challenge)],
    savedChallengeIds: [cmsChallengeKey('live', challenge)],
    scripture: toggleCmsScripture([], 'live', challenge.primaryScripture),
  }
  assert.equal(writeCmsLabState(storage, state), true)
  assert.deepEqual(readCmsLabState(storage), JSON.parse(JSON.stringify(state)))
  assert.deepEqual(reads, [CMS_LAB_STORAGE_KEY])
  assert.deepEqual(writes, [CMS_LAB_STORAGE_KEY])
  assert.equal(CMS_LAB_STORAGE_KEY, 'bibleberry-sanity-challenge-lab-v1')
})

test('persists only Scripture reference metadata after source withdrawal or rights changes', () => {
  const challenge = mappedChallenge()
  const provided: typeof challenge.primaryScripture = {
    ...challenge.primaryScripture,
    reference: 'Fixture Reference 3:3',
    translation: 'Fixture translation',
    textStatus: 'provided',
    passage: 'Development-only placeholder passage.',
    usageRightsConfirmed: true,
  }
  const saved = toggleCmsScripture([], 'live', provided)
  assert.deepEqual(saved, [{
    key: cmsScriptureKey('live', provided),
    source: 'live',
    scriptureId: provided.id,
    reference: provided.reference,
    translation: provided.translation,
  }])

  // Simulate the source later withdrawing the passage and its usage rights.
  const withdrawn = { ...provided, textStatus: 'referenceOnly' as const, passage: undefined, usageRightsConfirmed: false }
  assert.equal(withdrawn.usageRightsConfirmed, false)
  const { storage } = memoryStorage()
  assert.equal(writeCmsLabState(storage, { ...emptyCmsLabState(), scripture: saved }), true)
  const restored = readCmsLabState(storage)
  assert.deepEqual(restored.scripture, saved)
  assert.equal(JSON.stringify(restored).includes(provided.passage!), false)
  assert.equal('passage' in restored.scripture[0], false)
  assert.equal('usageRightsConfirmed' in restored.scripture[0], false)
})

test('filters malformed persisted fields, migrates legacy Scripture, and recovers from storage failures', () => {
  const challenge = mappedChallenge()
  const validScripture = { key: cmsScriptureKey('live', challenge.primaryScripture), source: 'live', scripture: challenge.primaryScripture }
  const malformed = JSON.stringify({
    positions: { valid: 'screen-key', invalid: 4 },
    completedChallengeIds: ['complete', 7],
    savedChallengeIds: [null, 'saved'],
    scripture: [validScripture, { key: 'broken', source: 'live' }],
  })
  assert.deepEqual(readCmsLabState(memoryStorage(malformed).storage), {
    positions: { valid: 'screen-key' },
    completedChallengeIds: ['complete'],
    savedChallengeIds: ['saved'],
    scripture: [{
      key: validScripture.key,
      source: 'live',
      scriptureId: challenge.primaryScripture.id,
      reference: challenge.primaryScripture.reference,
      translation: challenge.primaryScripture.translation,
    }],
  })
  assert.deepEqual(readCmsLabState(memoryStorage('{not-json').storage), emptyCmsLabState())
  assert.deepEqual(readCmsLabState({ getItem() { throw new Error('denied') }, setItem() {} }), emptyCmsLabState())
  assert.equal(writeCmsLabState({ getItem() { return null }, setItem() { throw new Error('full') } }, emptyCmsLabState()), false)
})
