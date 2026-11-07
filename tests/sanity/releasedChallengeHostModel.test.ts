import assert from 'node:assert/strict'
import test from 'node:test'
import type { CmsCatalogResult } from '../../src/cms/sanity/catalog.ts'
import type { CmsChallenge } from '../../src/cms/sanity/types.ts'
import {
  deriveReleasedChallengeState,
  deriveReleasedChallengeDetailState,
  formatReleaseDateTime,
} from '../../src/cms/reader/releasedChallengeHostModel.ts'

const sampleScreens = [
  {
    id: 'step-1',
    stepLabel: 'Step 1',
    title: 'Screen 1',
    blocks: [
      {
        id: 'block-1',
        type: 'statement' as const,
        text: 'A quiet place for Scripture',
        requiredForCompletion: true,
      },
    ],
  },
]

const sampleChallenge: CmsChallenge = {
  id: 'test-challenge-slug',
  documentId: 'challenge-doc-001',
  title: 'Test Released Challenge',
  challengeType: 'teaching',
  series: {
    documentId: 'series-doc-001',
    id: 'test-series',
    title: 'Test Series',
  },
  sequence: 1,
  releaseAt: '2026-11-06T12:00:00-05:00',
  releaseAtUtc: '2026-11-06T17:00:00.000Z',
  primaryScripture: {
    id: 'scripture-1',
    reference: 'Philippians 4:4',
    translation: 'ESV',
    textStatus: 'referenceOnly',
    practiceStatus: 'notConfigured',
    usageRightsConfirmed: false,
  },
  screens: sampleScreens,
  companionLinks: [],
  editorial: {
    adaptationReviewed: true,
    reviewedAt: '2026-11-05T12:00:00.000Z',
  },
}

test('derives loading state when catalog is null', () => {
  const state = deriveReleasedChallengeState(null, 'any-slug', new Date())
  assert.equal(state.status, 'loading')
})

test('derives requestError when catalog fails to load over transport', () => {
  const catalog: CmsCatalogResult = {
    status: 'requestError',
    message: 'Sanity gateway unavailable',
  }
  const state = deriveReleasedChallengeState(catalog, 'test-slug', new Date())
  assert.equal(state.status, 'requestError')
  if (state.status === 'requestError') {
    assert.equal(state.message, 'Sanity gateway unavailable')
  }
})

test('derives validationError when catalog fails schema mapping', () => {
  const catalog: CmsCatalogResult = {
    status: 'validationError',
    failures: [{ documentId: 'bad-doc', issues: ['Invalid screen block'] }],
  }
  const state = deriveReleasedChallengeState(catalog, 'test-slug', new Date())
  assert.equal(state.status, 'validationError')
  if (state.status === 'validationError') {
    assert.equal(state.failures.length, 1)
  }
})

test('derives notFound when catalog is empty or slug is missing', () => {
  const emptyCatalog: CmsCatalogResult = { status: 'empty' }
  const stateEmpty = deriveReleasedChallengeState(emptyCatalog, 'missing-slug', new Date())
  assert.equal(stateEmpty.status, 'notFound')
  if (stateEmpty.status === 'notFound') {
    assert.equal(stateEmpty.slug, 'missing-slug')
  }

  const catalogWithOther: CmsCatalogResult = {
    status: 'ready',
    challenges: [sampleChallenge],
  }
  const stateMissing = deriveReleasedChallengeState(catalogWithOther, 'other-slug', new Date())
  assert.equal(stateMissing.status, 'notFound')
  if (stateMissing.status === 'notFound') {
    assert.equal(stateMissing.slug, 'other-slug')
  }
})

test('derives embargoed state with releaseDate for future-scheduled Challenges', () => {
  const futureChallenge: CmsChallenge = {
    ...sampleChallenge,
    releaseAtUtc: '2099-01-01T00:00:00.000Z',
  }
  const catalog: CmsCatalogResult = {
    status: 'ready',
    challenges: [futureChallenge],
  }
  const state = deriveReleasedChallengeState(
    catalog,
    'test-challenge-slug',
    new Date('2026-11-06T12:00:00.000Z'),
  )
  assert.equal(state.status, 'embargoed')
  if (state.status === 'embargoed') {
    assert.equal(state.slug, 'test-challenge-slug')
    assert.equal(state.title, 'Test Released Challenge')
    assert.equal(state.releaseDate.toISOString(), '2099-01-01T00:00:00.000Z')
  }
})

test('derives ready state with AdmittedChallenge for eligible past-released Challenge', () => {
  const catalog: CmsCatalogResult = {
    status: 'ready',
    challenges: [sampleChallenge],
  }
  const pastNow = new Date('2026-11-06T18:00:00.000Z')
  const state = deriveReleasedChallengeState(catalog, 'test-challenge-slug', pastNow)

  assert.equal(state.status, 'ready')
  if (state.status === 'ready') {
    assert.equal(state.challenge.id, 'test-challenge-slug')
    assert.equal(state.admittedChallenge.namespace, 'cms')
    assert.equal(state.admittedChallenge.challengeId, 'cms:challenge-doc-001')
  }
})

test('formats release date-time using editorial timezone', () => {
  const date = new Date('2026-11-06T23:00:00.000Z')
  const formatted = formatReleaseDateTime(date)
  // 23:00 UTC on Nov 6 is 18:00 (6:00 PM) Nov 6 in America/New_York
  assert.ok(formatted.includes('November 6, 2026'))
})

// ---------------------------------------------------------------------------
// Stage 2A: deriveReleasedChallengeDetailState
// ---------------------------------------------------------------------------

test('deriveReleasedChallengeDetailState derives loading state when detail is null', () => {
  const state = deriveReleasedChallengeDetailState(null, 'any-slug', new Date())
  assert.equal(state.status, 'loading')
})

test('deriveReleasedChallengeDetailState derives requestError when gateway fails', () => {
  const state = deriveReleasedChallengeDetailState(
    { status: 'requestError', message: 'Gateway timeout' },
    'slug-1',
    new Date(),
  )
  assert.equal(state.status, 'requestError')
  if (state.status === 'requestError') {
    assert.equal(state.message, 'Gateway timeout')
  }
})

test('deriveReleasedChallengeDetailState derives validationError when payload is malformed', () => {
  const state = deriveReleasedChallengeDetailState(
    {
      status: 'validationError',
      failures: [{ issues: [{ path: 'document', message: 'Schema mismatch' }] }],
    },
    'slug-1',
    new Date(),
  )
  assert.equal(state.status, 'validationError')
})

test('deriveReleasedChallengeDetailState derives notFound for nonexistent slug', () => {
  const state = deriveReleasedChallengeDetailState(
    { status: 'notFound' },
    'missing-slug',
    new Date(),
  )
  assert.equal(state.status, 'notFound')
  if (state.status === 'notFound') {
    assert.equal(state.slug, 'missing-slug')
  }
})

test('deriveReleasedChallengeDetailState rejects mismatched slug to prevent stale rendering', () => {
  // Detail result has challenge.id = 'old-slug', but requested slug is 'new-slug'
  const state = deriveReleasedChallengeDetailState(
    { status: 'ready', challenge: sampleChallenge },
    'mismatched-requested-slug',
    new Date(),
  )
  assert.equal(state.status, 'notFound')
  if (state.status === 'notFound') {
    assert.equal(state.slug, 'mismatched-requested-slug')
  }
})

test('deriveReleasedChallengeDetailState derives ready state with AdmittedChallenge for eligible past-released Challenge', () => {
  const pastNow = new Date('2026-11-06T18:00:00.000Z')
  const state = deriveReleasedChallengeDetailState(
    { status: 'ready', challenge: sampleChallenge },
    'test-challenge-slug',
    pastNow,
  )
  assert.equal(state.status, 'ready')
  if (state.status === 'ready') {
    assert.equal(state.challenge.id, 'test-challenge-slug')
    assert.equal(state.admittedChallenge.namespace, 'cms')
    assert.equal(state.admittedChallenge.challengeId, 'cms:challenge-doc-001')
  }
})

test('deriveReleasedChallengeDetailState derives embargoed state when releaseAt is future', () => {
  const futureChallenge: CmsChallenge = {
    ...sampleChallenge,
    releaseAt: '2099-01-01T00:00:00Z',
    releaseAtUtc: '2099-01-01T00:00:00.000Z',
  }
  const state = deriveReleasedChallengeDetailState(
    { status: 'ready', challenge: futureChallenge },
    'test-challenge-slug',
    new Date('2026-11-06T12:00:00Z'),
  )
  assert.equal(state.status, 'embargoed')
  if (state.status === 'embargoed') {
    assert.equal(state.slug, 'test-challenge-slug')
    assert.equal(state.title, 'Test Released Challenge')
  }
})
