import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createGatewayChallengeProvider } from '../../src/cms/reader/challengeDetailProvider.ts'
import { createGatewayMonthProvider } from '../../src/cms/reader/monthProvider.ts'
import {
  authorizeExternalDeepLink,
  parseExternalDeepLink,
  type ExternalDeepLinkParseOptions,
  type ParsedExternalDeepLink,
} from '../../src/deepLinkIngress/index.ts'

const parseOptions: ExternalDeepLinkParseOptions = {
  policy: {
    allowedHttpsHosts: ['reader.example.test'],
    allowedCustomSchemes: ['bibleberry'],
  },
  monthScreenEnabled: true,
  releasedChallengeRouteEnabled: true,
  currentYearMonth: '2026-11',
}

function mustParse(url: string): ParsedExternalDeepLink {
  const parsed = parseExternalDeepLink(url, parseOptions)
  assert.equal(parsed.status, 'parsed')
  return parsed
}

function makeGatewayChallengePayload(slug = 'walking-in-the-light') {
  return {
    ok: true,
    challenge: {
      _id: 'challenge-doc-uuid-1234',
      _type: 'challenge',
      title: 'Walking in the Light',
      slug,
      challengeType: 'teaching',
      sequence: 1,
      releaseAt: '2026-11-01T08:00:00Z',
      primaryScripture: {
        reference: '1 John 1:7',
        translation: 'ESV',
        textStatus: 'provided',
        passage: 'If we walk in the light, as he is in the light, we have fellowship with one another.',
        usageRightsConfirmed: true,
        practiceStatus: 'configured',
      },
      screens: [
        {
          _key: 'screen-key-1',
          _type: 'challengeScreen',
          screenLabel: 'Step 1',
          heading: 'Introduction',
          blocks: [
            {
              _key: 'block-key-1',
              _type: 'statementBlock',
              text: 'Welcome to this teaching challenge.',
            },
          ],
        },
      ],
      editorialEligibility: {
        adaptationReviewed: true,
        reviewedAt: '2026-11-01T07:00:00Z',
      },
    },
  }
}

function makeMonthDetailPayload(yearMonth = '2026-11', phase: 'active' | 'historical' = 'active') {
  const year = Number(yearMonth.slice(0, 4))
  const month = Number(yearMonth.slice(5, 7))
  const days = 30
  return {
    ok: true,
    serverContext: {
      authorizedLocalDate: `${yearMonth}-15`,
      effectiveTimeZone: 'America/New_York',
    },
    month: {
      monthId: yearMonth,
      documentId: `month-${yearMonth}`,
      year,
      month,
      daysInMonth: days,
      phase,
      rosterVersion: 1,
      totalChallenges: days,
      title: 'Walk in the Light',
      introduction: {
        version: 'v1',
        previewScreens: [
          {
            id: 'intro-1',
            blocks: [{ _key: 'b1', _type: 'statementBlock', text: 'Welcome.' }],
          },
        ],
        welcomeScreen: {
          id: 'welcome',
          blocks: [{ _key: 'w1', _type: 'statementBlock', text: 'Welcome.' }],
        },
      },
      slots: Array.from({ length: days }, (_, idx) => {
        const dayOfMonth = idx + 1
        return {
          dayOfMonth,
          date: `${yearMonth}-${String(dayOfMonth).padStart(2, '0')}`,
          availability: 'available' as const,
          title: `Day ${dayOfMonth}`,
          slug: `day-${dayOfMonth}`,
          challengeId: `cms:doc-${dayOfMonth}`,
          challengeType: 'teaching' as const,
        }
      }),
      discoveries: [],
    },
  }
}

function makeMonthPreviewPayload(yearMonth = '2026-12') {
  const year = Number(yearMonth.slice(0, 4))
  const month = Number(yearMonth.slice(5, 7))
  const days = 31
  return {
    ok: true,
    serverContext: {
      authorizedLocalDate: '2026-11-28',
      effectiveTimeZone: 'America/New_York',
    },
    month: {
      monthId: yearMonth,
      documentId: `month-${yearMonth}`,
      year,
      month,
      daysInMonth: days,
      phase: 'advancePreview',
      monthStartsOn: `${yearMonth}-01`,
      title: 'December Preview',
      introduction: {
        version: 'v1',
        previewScreens: [
          {
            id: 'preview-1',
            blocks: [{ _key: 'b1', _type: 'statementBlock', text: 'Preview.' }],
          },
        ],
      },
      slots: Array.from({ length: days }, (_, idx) => {
        const dayOfMonth = idx + 1
        return {
          dayOfMonth,
          date: `${yearMonth}-${String(dayOfMonth).padStart(2, '0')}`,
          title: `Day ${dayOfMonth}`,
          availability: 'comingSoon' as const,
        }
      }),
    },
  }
}

test('authorizes released Challenge links through injected gateway ChallengeDetailProvider', async () => {
  const parsed = mustParse(
    'https://reader.example.test/challenge/walking-in-the-light?origin=month&yearMonth=2026-11',
  )
  const challengeProvider = createGatewayChallengeProvider({
    baseUrl: 'https://gateway.example.test',
    fetchImpl: async () =>
      new Response(JSON.stringify(makeGatewayChallengePayload('walking-in-the-light')), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  })

  const result = await authorizeExternalDeepLink(parsed, { challengeProvider })
  assert.equal(result.status, 'authorized')
  assert.deepEqual(result.destination, parsed.destination)
  assert.equal(result.info.contentKind, 'releasedChallenge')
  if (result.info.contentKind === 'releasedChallenge') {
    // A URL-supplied origin never survives authorization: the link is an external entry.
    assert.deepEqual(result.info.origin, { kind: 'hub' })
    assert.equal(result.info.entry, 'external')
  }
})

test('fails closed on future or unreleased Challenges (gateway 404) with accessible unavailable outcome', async () => {
  const parsed = mustParse('https://reader.example.test/challenge/future-embargoed-challenge')
  const challengeProvider = createGatewayChallengeProvider({
    baseUrl: 'https://gateway.example.test',
    fetchImpl: async () => new Response(JSON.stringify({ ok: false }), { status: 404 }),
  })

  const result = await authorizeExternalDeepLink(parsed, { challengeProvider })
  assert.equal(result.status, 'unavailable')
  assert.equal(result.outcome.kind, 'unavailable')
  assert.equal(result.outcome.reason, 'contentNotReleased')
  assert.equal(result.outcome.accessibility.role, 'status')
  assert.equal(result.outcome.accessibility.liveRegion, 'polite')
  assert.deepEqual(result.outcome.accessibility.suggestedAction, {
    label: 'Return to Hub',
    target: 'hub',
  })
  assert.doesNotMatch(result.outcome.accessibility.message, /embargo|future-embargoed-challenge/i)
})

test('authorizes active/historical Month and advance-preview Month via injected MonthGatewayProvider', async () => {
  const parsedActive = mustParse('https://reader.example.test/month/2026-11')
  const activeMonthProvider = createGatewayMonthProvider({
    baseUrl: 'https://gateway.example.test',
    resolveTimeZone: () => 'America/New_York',
    fetchImpl: async () =>
      new Response(JSON.stringify(makeMonthDetailPayload('2026-11', 'active')), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  })

  const activeResult = await authorizeExternalDeepLink(parsedActive, {
    monthProvider: activeMonthProvider,
  })
  assert.equal(activeResult.status, 'authorized')
  assert.deepEqual(activeResult.info, {
    contentKind: 'month',
    yearMonth: '2026-11',
    monthPhase: 'active',
  })

  const parsedPreview = mustParse('https://reader.example.test/month/2026-12')
  const previewMonthProvider = createGatewayMonthProvider({
    baseUrl: 'https://gateway.example.test',
    resolveTimeZone: () => 'America/New_York',
    fetchImpl: async input => {
      const url = String(input)
      if (url.endsWith('/preview')) {
        return new Response(JSON.stringify(makeMonthPreviewPayload('2026-12')), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404 })
    },
  })

  const previewResult = await authorizeExternalDeepLink(parsedPreview, {
    monthProvider: previewMonthProvider,
  })
  assert.equal(previewResult.status, 'authorized')
  assert.deepEqual(previewResult.info, {
    contentKind: 'month',
    yearMonth: '2026-12',
    monthPhase: 'advancePreview',
  })

  const previewDisallowed = await authorizeExternalDeepLink(parsedPreview, {
    monthProvider: previewMonthProvider,
    allowMonthAdvancePreview: false,
  })
  assert.equal(previewDisallowed.status, 'unavailable')
  assert.equal(previewDisallowed.outcome.reason, 'contentNotReleased')
})

test('fails closed on gateway errors, missing providers, and aborted requests', async () => {
  const parsedChallenge = mustParse('https://reader.example.test/challenge/rejoice-always')
  const errorChallengeProvider = createGatewayChallengeProvider({
    baseUrl: 'https://gateway.example.test',
    fetchImpl: async () => new Response('Server error', { status: 500 }),
  })

  const gatewayErr = await authorizeExternalDeepLink(parsedChallenge, {
    challengeProvider: errorChallengeProvider,
  })
  assert.equal(gatewayErr.status, 'unavailable')
  assert.equal(gatewayErr.outcome.reason, 'gatewayError')

  const missingProvider = await authorizeExternalDeepLink(parsedChallenge, {})
  assert.equal(missingProvider.status, 'unavailable')
  assert.equal(missingProvider.outcome.reason, 'authorizationUnavailable')

  const abortController = new AbortController()
  abortController.abort()
  const aborted = await authorizeExternalDeepLink(parsedChallenge, {
    challengeProvider: errorChallengeProvider,
    signal: abortController.signal,
  })
  assert.equal(aborted.status, 'unavailable')
  assert.equal(aborted.outcome.reason, 'aborted')
})
