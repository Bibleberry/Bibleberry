import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatCmsReleaseDate, presentCmsScripture } from '../../src/cms/sanity/presentation.ts'
import type { CmsScripture } from '../../src/cms/sanity/types.ts'

const scripture: CmsScripture = {
  id: 'study-scripture-provided',
  reference: 'Fixture Reference 3:3',
  translation: 'Fixture translation',
  textStatus: 'provided',
  passage: 'Development-only placeholder passage.',
  usageRightsConfirmed: true,
  practiceStatus: 'notConfigured',
}

test('formats release dates in the editorial timezone across the UTC day boundary', () => {
  assert.equal(formatCmsReleaseDate('2026-11-03T02:00:00.000Z'), 'Nov 2')
  assert.equal(formatCmsReleaseDate('2026-11-03T05:00:00.000Z'), 'Nov 3')
})

test('presents a rights-cleared provided passage for optional-study Scripture', () => {
  assert.deepEqual(presentCmsScripture(scripture), {
    status: 'provided',
    passage: 'Development-only placeholder passage.',
  })
})

test('keeps optional-study Scripture reference-only when text or rights are absent', () => {
  assert.deepEqual(presentCmsScripture({
    ...scripture,
    textStatus: 'referenceOnly',
    passage: undefined,
    usageRightsConfirmed: false,
  }), { status: 'referenceOnly' })
  assert.deepEqual(presentCmsScripture({ ...scripture, usageRightsConfirmed: false }), { status: 'referenceOnly' })
})
