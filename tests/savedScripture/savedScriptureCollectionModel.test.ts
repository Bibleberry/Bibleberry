import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  buildSavedScriptureCountLabel,
  filterSavedScriptures,
  projectSavedScriptureCollection,
  projectSavedScripturesFromCandidates,
} from '../../src/components/savedScripture/savedScriptureCollectionModel.ts'
import { createRecordEarnedAwardsCommand } from '../../src/participation/awards.ts'
import { createWebGuestParticipationStore } from '../../src/participation/defaultGuestStore.ts'
import {
  parseCanonicalMonthlyAwardId,
  parseLocalCalendarDate,
  parsePublicationYearMonth,
  parseStoredChallengeId,
} from '../../src/participation/identity.ts'
import { emptyReaderParticipationData, reduceParticipationCommand } from '../../src/participation/model.ts'

function createMemoryStorage(initial: Record<string, string> = {}): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  const map = new Map<string, string>(Object.entries(initial))
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null
    },
    setItem(key: string, value: string) {
      map.set(key, value)
    },
    removeItem(key: string) {
      map.delete(key)
    },
  }
}

test('projects 0, 1, and many saves sorted by savedOn descending with deterministic canonical-key tie-break', () => {
  assert.deepEqual(projectSavedScriptureCollection(emptyReaderParticipationData()), [])
  assert.equal(buildSavedScriptureCountLabel(0, 0, false), '0 saved references')

  const c1 = parseStoredChallengeId('cms:challenge-nov-02')!
  const nov05 = parseLocalCalendarDate('2026-11-05')!
  const nov08 = parseLocalCalendarDate('2026-11-08')!

  let data = emptyReaderParticipationData()
  data = reduceParticipationCommand(data, {
    type: 'setScriptureSaved',
    scripture: { reference: 'Psalm 23:1', translation: 'WEBP', sourceChallengeId: c1 },
    saved: true,
    savedOn: nov05,
  })
  data = reduceParticipationCommand(data, {
    type: 'setScriptureSaved',
    scripture: { reference: 'Romans 8:28', translation: 'Not configured' },
    saved: true,
    savedOn: nov08,
  })
  data = reduceParticipationCommand(data, {
    type: 'setScriptureSaved',
    scripture: { reference: '1 Thessalonians 5:16–18', translation: 'WEBP', sourceChallengeId: c1 },
    saved: true,
    savedOn: nov08,
  })

  const projected = projectSavedScriptureCollection(data)
  assert.equal(projected.length, 3)

  // Nov 08 entries appear before Nov 05; equal-date entries tie-break deterministically by canonical key ascending
  assert.equal(projected[0].reference, '1 Thessalonians 5:16–18')
  assert.equal(projected[0].key, '1 thessalonians 5:16-18|webp')
  assert.equal(projected[0].translation, 'WEBP')
  assert.equal(projected[0].translationLabel, 'WEBP')
  assert.equal(projected[0].hasExplicitTranslation, true)
  assert.equal(projected[0].savedOn, '2026-11-08')
  assert.equal(projected[0].savedDateLabel, 'November 8, 2026')
  assert.equal(projected[0].hasSourceChallenge, true)
  assert.equal(projected[0].sourceChallengeId, c1)

  assert.equal(projected[1].reference, 'Romans 8:28')
  assert.equal(projected[1].key, 'romans 8:28|')
  assert.equal(projected[1].translation, null)
  assert.equal(projected[1].translationLabel, 'Translation unspecified')
  assert.equal(projected[1].hasExplicitTranslation, false)
  assert.equal(projected[1].hasSourceChallenge, false)
  assert.equal(projected[1].sourceChallengeId, undefined)

  assert.equal(projected[2].reference, 'Psalm 23:1')
  assert.equal(projected[2].savedOn, '2026-11-05')
  assert.equal(buildSavedScriptureCountLabel(3, 3, false), '3 saved references')
  assert.equal(buildSavedScriptureCountLabel(3, 1, true), 'Showing 1 of 3 saved references')
})

test('sanitizes malformed legacy candidates, deduplicates repeated keys, and drops smuggled passage text', () => {
  const candidates: unknown[] = [
    null,
    'not-an-object',
    [],
    { reference: '   ', savedOn: '2026-11-01' },
    { reference: 'John 3:16', savedOn: '2026-02-30' },
    { reference: 'John 3:16', savedOn: 'invalid-date' },
    {
      reference: 'John 3:16',
      translation: 'WEBP',
      savedOn: '2026-11-09',
      passage: 'For God so loved the world...',
      text: 'Invented text',
      body: 'Should never survive',
      sourceChallengeId: 'drafts.secret-draft',
    },
    // Duplicate with typographic / case variation and earlier date + valid provenance
    {
      reference: '  john   3 : 16  ',
      translation: 'webp',
      savedOn: '2026-11-04',
      sourceChallengeId: 'cms:challenge-nov-04',
    },
    // Malformed non-string translation normalizes safely to unspecified null; pilot ID rejected under cms namespace
    {
      reference: 'Éxodo 14:14',
      translation: { invalid: true },
      savedOn: '2026-11-06',
      sourceChallengeId: 'pilot:sample-1',
    },
  ]

  const projected = projectSavedScripturesFromCandidates(candidates)
  assert.equal(projected.length, 2)

  assert.equal(projected[0].reference, 'Éxodo 14:14')
  assert.equal(projected[0].translation, null)
  assert.equal(projected[0].translationLabel, 'Translation unspecified')
  assert.equal(projected[0].hasSourceChallenge, false)
  assert.equal(projected[0].sourceChallengeId, undefined)

  assert.equal(projected[1].key, 'john 3:16|webp')
  assert.equal(projected[1].savedOn, '2026-11-04')
  assert.equal(projected[1].hasSourceChallenge, true)
  assert.equal(projected[1].sourceChallengeId, 'cms:challenge-nov-04')
  assert.equal('passage' in projected[1], false)
  assert.equal('text' in projected[1], false)
  assert.equal('body' in projected[1], false)
})

test('searches by Scripture reference, Bible book/citation spelling, Unicode NFC/NFD, and recorded translation', () => {
  const projected = projectSavedScripturesFromCandidates([
    { reference: '1 Thessalonians 5:16–18', translation: 'WEBP', savedOn: '2026-11-08' },
    { reference: 'Psalm 23:1', translation: 'NIV', savedOn: '2026-11-07' },
    { reference: 'John 3:16', translation: null, savedOn: '2026-11-06' },
    { reference: '1 John 4:8', translation: 'ESV', savedOn: '2026-11-05' },
    { reference: 'Song of Solomon 2:1', translation: 'Not configured', savedOn: '2026-11-04' },
    { reference: 'Éxodo 14:14', translation: 'RVR1960', savedOn: '2026-11-03' },
  ])

  // Empty and whitespace-only queries return all
  assert.equal(filterSavedScriptures(projected, '').length, 6)
  assert.equal(filterSavedScriptures(projected, '   \t  ').length, 6)

  // Dash / colon / whitespace / case normalization
  assert.deepEqual(
    filterSavedScriptures(projected, '  1 THESSALONIANS  5 : 16 - 18 ').map(i => i.reference),
    ['1 Thessalonians 5:16–18'],
  )

  // Bible book abbreviations, ordinals, Roman numerals, and Psalm/Psalms spelling
  assert.deepEqual(
    filterSavedScriptures(projected, '1st Thess 5:16').map(i => i.reference),
    ['1 Thessalonians 5:16–18'],
  )
  assert.deepEqual(
    filterSavedScriptures(projected, 'I Thessalonians').map(i => i.reference),
    ['1 Thessalonians 5:16–18'],
  )
  assert.deepEqual(
    filterSavedScriptures(projected, 'Psalms 23').map(i => i.reference),
    ['Psalm 23:1'],
  )
  assert.deepEqual(
    filterSavedScriptures(projected, 'ps 23 1').map(i => i.reference),
    ['Psalm 23:1'],
  )
  assert.deepEqual(
    filterSavedScriptures(projected, 'Song of Songs 2').map(i => i.reference),
    ['Song of Solomon 2:1'],
  )
  assert.deepEqual(
    filterSavedScriptures(projected, '1st John').map(i => i.reference),
    ['1 John 4:8'],
  )
  assert.deepEqual(
    filterSavedScriptures(projected, '1 Jn 4').map(i => i.reference),
    ['1 John 4:8'],
  )

  // Unicode NFD query matches NFC reference
  assert.deepEqual(
    filterSavedScriptures(projected, 'e\u0301xodo 14').map(i => i.reference),
    ['Éxodo 14:14'],
  )

  // Recorded translation matching (never matches unspecified entries)
  assert.deepEqual(
    filterSavedScriptures(projected, 'webp').map(i => i.reference),
    ['1 Thessalonians 5:16–18'],
  )
  assert.deepEqual(
    filterSavedScriptures(projected, 'Psalm 23 NIV').map(i => i.reference),
    ['Psalm 23:1'],
  )
  assert.deepEqual(
    filterSavedScriptures(projected, 'ESV 1 John').map(i => i.reference),
    ['1 John 4:8'],
  )

  // Zero matches
  assert.deepEqual(filterSavedScriptures(projected, 'Revelation 22:21'), [])
  assert.deepEqual(filterSavedScriptures(projected, 'KJV'), [])
})

test('durable guest store removal via setScriptureSaved preserves unrelated data and survives store refresh', async () => {
  const storage = createMemoryStorage()
  const c1 = parseStoredChallengeId('cms:challenge-nov-01')!
  const nov05 = parseLocalCalendarDate('2026-11-05')!
  const nov08 = parseLocalCalendarDate('2026-11-08')!

  const storeA = createWebGuestParticipationStore({ storage })
  await storeA.whenReady()
  await storeA.dispatch({ type: 'completeChallenge', challengeId: c1, completedOn: nov05 })
  await storeA.dispatch({ type: 'setChallengeSaved', challengeId: c1, saved: true, savedOn: nov05 })
  await storeA.dispatch(
    createRecordEarnedAwardsCommand([
      {
        awardId: parseCanonicalMonthlyAwardId('card:monthly:2026-11:light-path')!,
        discoveryId: 'discovery:2026-11:light-path',
        earnedOn: nov05,
        earnedCard: {
          cardDocumentId: 'card-light-path',
          title: 'A Light for the Path',
          publicationYearMonth: parsePublicationYearMonth('2026-11')!,
          imageUrl: 'https://cdn.sanity.io/images/80016lrq/staging/card.png',
          assetRevision: 'v1',
          illustrationAlt: 'Hand-drawn oil lamp',
          accessibleTranscription: 'Psalm 119:105',
          scripture: { book: 'Psalms', reference: 'Psalm 119:105', translation: 'WEBP' },
          attribution: 'Alexis Waid / Bibleberry',
          rightsStatus: 'approved-ministry-use',
          shareEligible: true,
        },
      },
    ]),
  )
  await storeA.dispatch({
    type: 'setScriptureSaved',
    scripture: { reference: '1 Thessalonians 5:16–18', translation: 'WEBP', sourceChallengeId: c1 },
    saved: true,
    savedOn: nov05,
  })
  await storeA.dispatch({
    type: 'setScriptureSaved',
    scripture: { reference: 'Psalm 23:1', translation: 'Not configured' },
    saved: true,
    savedOn: nov08,
  })

  // Remove only one item using the exact SavedScriptureHost command shape
  await storeA.dispatch({
    type: 'setScriptureSaved',
    scripture: { reference: '1 Thessalonians 5:16–18', translation: 'WEBP' },
    saved: false,
    savedOn: nov08,
  })
  await storeA.flushPending()

  // Simulate app refresh with a fresh store instance backed by the same storage
  const storeB = createWebGuestParticipationStore({ storage })
  await storeB.whenReady()
  const snapB = storeB.getSnapshot()

  const remaining = projectSavedScriptureCollection(snapB.data)
  assert.equal(remaining.length, 1)
  assert.equal(remaining[0].reference, 'Psalm 23:1')
  assert.equal(remaining[0].translation, null)

  // Unrelated participation state remains intact
  assert.equal(Object.keys(snapB.data.completedChallenges).length, 1)
  assert.equal(Object.keys(snapB.data.savedChallenges).length, 1)
  assert.equal(Object.keys(snapB.data.earnedAwards).length, 1)

  storeA.dispose()
  storeB.dispose()
})

test('Saved Scripture component boundary avoids Sanity/gateway/notebook/navigation coupling and deep-link synthesis', () => {
  const dir = resolve(process.cwd(), 'src/components/savedScripture')
  const files = readdirSync(dir)
  assert.ok(files.length > 0)

  for (const file of files) {
    const source = readFileSync(resolve(dir, file), 'utf8')
    assert.equal(source.includes('SANITY_READ_TOKEN'), false, `${file} must not reference SANITY_READ_TOKEN`)
    assert.equal(source.includes('@sanity/client'), false, `${file} must not import @sanity/client`)
    assert.equal(source.includes('../gateway/'), false, `${file} must not import gateway`)
    assert.equal(source.includes('../../gateway/'), false, `${file} must not import gateway`)
    assert.equal(source.includes('../notebook/'), false, `${file} must not import notebook`)
    assert.equal(source.includes('../announcements/'), false, `${file} must not import announcements`)
    assert.equal(source.includes('../month/'), false, `${file} must not import month`)
    assert.equal(source.includes('App.tsx'), false, `${file} must not import App.tsx`)
    assert.equal(source.includes('href='), false, `${file} must not emit unauthorized deep links`)
  }
})
