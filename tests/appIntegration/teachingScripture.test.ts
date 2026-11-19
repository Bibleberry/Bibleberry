import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getTeachingScriptureCapture } from '../../src/appIntegration/teachingScripture.ts'

const supportedTeaching = {
  id: 'november-5-gods-will',
  status: 'Authentic teaching sample' as const,
  scripture: '1 Thessalonians 5:16–18 (NIV)',
}

test('extracts and validates citation and translation separately for supported teaching', () => {
  assert.deepEqual(getTeachingScriptureCapture(supportedTeaching), {
    reference: '1 Thessalonians 5:16–18',
    translation: 'NIV',
  })

  assert.deepEqual(
    getTeachingScriptureCapture({ ...supportedTeaching, scripture: ' John 3:16 (webp) ' }),
    { reference: 'John 3:16', translation: 'WEBP' },
  )
})

test('fails closed for unsupported, draft, unparseable, or unrecognized citations', () => {
  assert.equal(
    getTeachingScriptureCapture({ ...supportedTeaching, id: 'another-teaching' }),
    null,
  )
  assert.equal(
    getTeachingScriptureCapture({ ...supportedTeaching, status: 'Draft archive fixture' }),
    null,
  )
  assert.equal(
    getTeachingScriptureCapture({ ...supportedTeaching, scripture: 'Not a verse (NIV)' }),
    null,
  )
  assert.equal(
    getTeachingScriptureCapture({ ...supportedTeaching, scripture: 'John 3:16' }),
    null,
  )
  assert.equal(
    getTeachingScriptureCapture({ ...supportedTeaching, scripture: 'John 3:16 (UNKNOWN)' }),
    null,
  )
})
