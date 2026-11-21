import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  parseExternalDeepLink,
  type ExternalDeepLinkParseOptions,
} from '../../src/deepLinkIngress/index.ts'

const baseOptions: ExternalDeepLinkParseOptions = {
  policy: {
    allowedHttpsHosts: ['reader.example.test'],
    allowedCustomSchemes: ['bibleberry'],
  },
  monthScreenEnabled: true,
  releasedChallengeRouteEnabled: true,
  currentYearMonth: '2026-11',
}

test('parses authorized HTTPS and custom-scheme Month links into internal destinations', () => {
  const httpsMonth = parseExternalDeepLink('https://reader.example.test/month/2026-10', baseOptions)
  assert.equal(httpsMonth.status, 'parsed')
  assert.deepEqual(httpsMonth.destination, { type: 'month', yearMonth: '2026-10' })
  assert.equal(httpsMonth.internalHash, '#/month/2026-10')

  const currentMonthAlias = parseExternalDeepLink('https://reader.example.test/month', baseOptions)
  assert.equal(currentMonthAlias.status, 'parsed')
  assert.deepEqual(currentMonthAlias.destination, { type: 'month', yearMonth: '2026-11' })
  assert.equal(currentMonthAlias.internalHash, '#/month/2026-11')

  const trailingSlashAlias = parseExternalDeepLink('https://reader.example.test/month/', baseOptions)
  assert.equal(trailingSlashAlias.status, 'parsed')
  assert.deepEqual(trailingSlashAlias.destination, { type: 'month', yearMonth: '2026-11' })

  const customSchemeMonth = parseExternalDeepLink('bibleberry://month/2026-11', baseOptions)
  assert.equal(customSchemeMonth.status, 'parsed')
  assert.deepEqual(customSchemeMonth.destination, { type: 'month', yearMonth: '2026-11' })
  assert.equal(customSchemeMonth.internalHash, '#/month/2026-11')

  const tripleSlashMonth = parseExternalDeepLink('bibleberry:///month/2026-09', baseOptions)
  assert.equal(tripleSlashMonth.status, 'parsed')
  assert.deepEqual(tripleSlashMonth.destination, { type: 'month', yearMonth: '2026-09' })
})

const EXTERNAL_CHALLENGE = (slug: string) => ({
  type: 'releasedChallenge',
  slug,
  origin: { kind: 'hub' },
  entry: 'external',
})

test('parses authorized Challenge links as external entries that never carry a return origin (G04-A)', () => {
  for (const [rawUrl, slug] of [
    [
      'https://reader.example.test/challenge/2026-11-02-rejoice-always?origin=month&yearMonth=2026-11',
      '2026-11-02-rejoice-always',
    ],
    ['bibleberry://challenge/rejoice-always?origin=shelf', 'rejoice-always'],
    ['https://reader.example.test/challenge/rejoice-always?origin=library&yearMonth=2026-08', 'rejoice-always'],
    ['https://reader.example.test/challenge/rejoice-always?origin=hub', 'rejoice-always'],
    ['https://reader.example.test/challenge/rejoice-always', 'rejoice-always'],
  ] as const) {
    const result = parseExternalDeepLink(rawUrl, baseOptions)
    assert.equal(result.status, 'parsed', rawUrl)
    if (result.status !== 'parsed') continue
    assert.deepEqual(result.destination, EXTERNAL_CHALLENGE(slug), rawUrl)
    assert.equal(result.origin, null, rawUrl)
    // The internal hash is canonical and drops the caller-supplied origin.
    assert.equal(result.internalHash, `#/challenge/${slug}?origin=hub`, rawUrl)
  }
})

test('forged external origins cannot be smuggled in through ambient destination options', () => {
  const result = parseExternalDeepLink(
    'https://reader.example.test/challenge/rejoice-always?origin=month&yearMonth=2026-11',
    {
      ...baseOptions,
      challengeOrigin: { kind: 'shelf' },
      ...({ search: '?origin=library&yearMonth=2026-10' } as object),
    },
  )

  assert.equal(result.status, 'parsed')
  if (result.status !== 'parsed') return
  assert.deepEqual(result.destination, EXTERNAL_CHALLENGE('rejoice-always'))
  assert.equal(result.origin, null)
  assert.equal(result.internalHash, '#/challenge/rejoice-always?origin=hub')
})

test('supports explicit custom-scheme host allowlist when configured', () => {
  const scopedOptions: ExternalDeepLinkParseOptions = {
    ...baseOptions,
    policy: {
      allowedCustomSchemes: ['bibleberry'],
      allowedCustomSchemeHosts: ['app'],
    },
  }

  const allowed = parseExternalDeepLink('bibleberry://app/month/2026-11', scopedOptions)
  assert.equal(allowed.status, 'parsed')
  assert.deepEqual(allowed.destination, { type: 'month', yearMonth: '2026-11' })

  const disallowed = parseExternalDeepLink('bibleberry://other/month/2026-11', scopedOptions)
  assert.equal(disallowed.status, 'rejected')
  assert.equal(disallowed.reason, 'unauthorizedHostOrScheme')
})

test('fails closed on malformed URLs, unauthorized hosts, and dangerous schemes', () => {
  const malformedInputs: unknown[] = [
    null,
    undefined,
    123,
    '',
    '   ',
    ' https://reader.example.test/month/2026-11',
    'not-a-url',
    'https://reader.example.test/month/2026-11\\extra',
    'https://reader.example.test/month/2026-11\u0000',
    'https://user:pass@reader.example.test/month/2026-11',
    'https://evil.test@reader.example.test/month/2026-11',
  ]
  for (const input of malformedInputs) {
    const result = parseExternalDeepLink(input, baseOptions)
    assert.equal(result.status, 'rejected', `Expected rejection for ${String(input)}`)
    assert.equal(result.reason, 'malformedUrl')
  }

  const unauthorizedInputs = [
    'http://reader.example.test/month/2026-11',
    'https://evil.example.test/month/2026-11',
    'https://sub.reader.example.test/month/2026-11',
    'https://reader.example.test:8443/month/2026-11',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'bibleberry://evil.example.test/month/2026-11',
    'otherapp://month/2026-11',
  ]
  for (const input of unauthorizedInputs) {
    const result = parseExternalDeepLink(input, baseOptions)
    assert.equal(result.status, 'rejected', `Expected rejection for ${input}`)
    assert.equal(result.reason, 'unauthorizedHostOrScheme')
  }

  const emptyPolicyResult = parseExternalDeepLink('https://reader.example.test/month/2026-11', {
    ...baseOptions,
    policy: {},
  })
  assert.equal(emptyPolicyResult.status, 'rejected')
  assert.equal(emptyPolicyResult.reason, 'unauthorizedHostOrScheme')
})

test('fails closed on encoded-path tricks, traversal, invalid months, invalid slugs, and arbitrary queries', () => {
  const encodedOrTraversal = [
    'https://reader.example.test/month/../challenge/rejoice-always',
    'https://reader.example.test/month/./2026-11',
    'https://reader.example.test/month/%2e%2e/2026-11',
    'https://reader.example.test/challenge/a%2Fb',
    'https://reader.example.test/challenge/a%5cb',
    'https://reader.example.test/challenge/a%252eb',
    'https://reader.example.test//month/2026-11',
  ]
  for (const input of encodedOrTraversal) {
    const result = parseExternalDeepLink(input, baseOptions)
    assert.equal(result.status, 'rejected', `Expected rejection for ${input}`)
    assert.equal(result.reason, 'encodedPathTrick')
  }

  for (const invalidMonth of [
    'https://reader.example.test/month/2026-00',
    'https://reader.example.test/month/2026-13',
    'https://reader.example.test/month/2026-3',
  ]) {
    const result = parseExternalDeepLink(invalidMonth, baseOptions)
    assert.equal(result.status, 'rejected')
    assert.equal(result.reason, 'invalidMonth')
  }

  for (const invalidQuery of [
    'https://reader.example.test/month/2026-11?next=https://evil.test',
    'https://reader.example.test/challenge/rejoice-always?next=https://evil.test',
    'https://reader.example.test/challenge/rejoice-always?origin=hub&origin=month',
    'https://reader.example.test/challenge/rejoice-always?origin=unknown',
    'https://reader.example.test/challenge/rejoice-always?yearMonth=2026-11',
    'https://reader.example.test/challenge/rejoice-always?origin=hub&yearMonth=2026-11',
    'https://reader.example.test/challenge/rejoice-always?origin=month',
  ]) {
    const result = parseExternalDeepLink(invalidQuery, baseOptions)
    assert.equal(result.status, 'rejected', `Expected rejection for ${invalidQuery}`)
    assert.equal(result.reason, 'invalidQuery')
  }

  const invalidOriginMonth = parseExternalDeepLink(
    'https://reader.example.test/challenge/rejoice-always?origin=month&yearMonth=2026-13',
    baseOptions,
  )
  assert.equal(invalidOriginMonth.status, 'rejected')
  assert.equal(invalidOriginMonth.reason, 'invalidMonth')

  const invalidSlug = parseExternalDeepLink(
    'https://reader.example.test/challenge/Upper-Case',
    baseOptions,
  )
  assert.equal(invalidSlug.status, 'rejected')
  assert.equal(invalidSlug.reason, 'invalidChallengeSlug')

  const unsupportedRoute = parseExternalDeepLink(
    'https://reader.example.test/studio/secret',
    baseOptions,
  )
  assert.equal(unsupportedRoute.status, 'rejected')
  assert.equal(unsupportedRoute.reason, 'unsupportedRoute')
})

test('fails closed when route feature gates are disabled', () => {
  const monthDisabled = parseExternalDeepLink('https://reader.example.test/month/2026-11', {
    ...baseOptions,
    monthScreenEnabled: false,
  })
  assert.equal(monthDisabled.status, 'rejected')
  assert.equal(monthDisabled.reason, 'featureDisabled')

  const challengeDisabled = parseExternalDeepLink(
    'https://reader.example.test/challenge/rejoice-always',
    {
      ...baseOptions,
      monthScreenEnabled: false,
      releasedChallengeRouteEnabled: false,
    },
  )
  assert.equal(challengeDisabled.status, 'rejected')
  assert.equal(challengeDisabled.reason, 'featureDisabled')
})
