/**
 * Anthropic Addresses #369 — static-asset security header policy.
 * Decision record: docs/operations/static-asset-security-headers.md
 *
 * Guards the approved baseline in public/_headers and the deliberate deferrals: no resource-
 * restricting CSP and no HSTS until their own decisions are made, and no Permissions-Policy
 * entry that would break the features the media iframes delegate.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parseStaticHeaders, staticHeaders } from '../../scripts/release/r06-staging-profile.mjs'

const HEADERS_PATH = path.resolve(import.meta.dirname, '../../public/_headers')

function parseHeadersFile(text: string): Map<string, Map<string, string>> {
  const rules = new Map<string, Map<string, string>>()
  let current: Map<string, string> | null = null
  for (const rawLine of text.split('\n')) {
    if (rawLine.trim() === '' || rawLine.trimStart().startsWith('#')) continue
    if (!/^\s/.test(rawLine)) {
      current = new Map()
      rules.set(rawLine.trim(), current)
      continue
    }
    assert.ok(current, `header line before any path rule: ${rawLine}`)
    const separator = rawLine.indexOf(':')
    assert.ok(separator > 0, `malformed header line: ${rawLine}`)
    current.set(rawLine.slice(0, separator).trim().toLowerCase(), rawLine.slice(separator + 1).trim())
  }
  return rules
}

const rules = parseHeadersFile(fs.readFileSync(HEADERS_PATH, 'utf8'))
const all = rules.get('/*')

test('public/_headers applies the approved baseline to every static path', () => {
  assert.deepEqual([...rules.keys()], ['/*'], 'one catch-all rule keeps the policy auditable')
  assert.ok(all)
  assert.equal(all.get('x-content-type-options'), 'nosniff')
  assert.equal(all.get('referrer-policy'), 'strict-origin-when-cross-origin')
  assert.equal(all.get('x-frame-options'), 'DENY')
  assert.equal(all.get('content-security-policy'), "frame-ancestors 'none'")
})

test('public/_headers is the policy the R06 release artifact pins', () => {
  const text = fs.readFileSync(HEADERS_PATH, 'utf8')
  assert.deepEqual(parseStaticHeaders(text), structuredClone(staticHeaders))
})

test('the R06 release build copies only favicon.svg and _headers from public/', () => {
  const build = fs.readFileSync(path.resolve(import.meta.dirname, '../../scripts/release/r06-client-build.mjs'), 'utf8')
  assert.match(build, /publicDir: false/)
  const copies = [...build.matchAll(/copyFile\('([^']+)', '([^']+)'\)/g)].map(m => [m[1], m[2]])
  assert.deepEqual(copies, [
    ['public/favicon.svg', 'dist/favicon.svg'],
    ['public/_headers', 'dist/_headers'],
  ])
})

test('CSP stays limited to frame-ancestors until the resource CSP decision is made', () => {
  const csp = all?.get('content-security-policy') ?? ''
  const directives = csp.split(';').map(d => d.trim().split(/\s+/)[0]).filter(Boolean)
  assert.deepEqual(directives, ['frame-ancestors'])
  assert.equal(all?.has('content-security-policy-report-only'), false)
})

test('HSTS is not set from the asset layer', () => {
  assert.equal(all?.has('strict-transport-security'), false)
})

test('Permissions-Policy denies only features nothing in the reader uses or delegates', () => {
  const policy = all?.get('permissions-policy') ?? ''
  const denied = policy.split(',').map(entry => entry.trim().split('=')[0])
  assert.deepEqual(denied.sort(), ['camera', 'geolocation', 'microphone', 'payment', 'usb'])

  // The YouTube and Simplecast iframes in src/App.tsx delegate these; denying them at the top
  // level would silently break playback, sharing or fullscreen.
  const delegated = [
    'accelerometer',
    'autoplay',
    'clipboard-write',
    'encrypted-media',
    'fullscreen',
    'gyroscope',
    'picture-in-picture',
    'web-share',
  ]
  for (const feature of delegated) {
    assert.equal(denied.includes(feature), false, `${feature} is delegated to media iframes`)
  }
})
