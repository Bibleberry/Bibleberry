import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ChallengeDetailProvider } from '../../src/cms/reader/challengeDetailProvider.ts'
import type { MonthGatewayProvider } from '../../src/cms/reader/monthProvider.ts'
import type { CmsChallenge } from '../../src/cms/sanity/types.ts'
import {
  createDeepLinkIngressController,
  type DeepLinkNavigatedOutcome,
  type DeepLinkUnavailableOutcome,
  type ExternalDeepLinkSourceAdapter,
} from '../../src/deepLinkIngress/index.ts'

function makeReadyChallenge(slug: string): CmsChallenge {
  return {
    id: `cms:${slug}`,
    documentId: `doc-${slug}`,
    slug,
    title: 'Rejoice Always',
    challengeType: 'teaching',
    releaseAt: '2026-11-01T08:00:00Z',
    primaryScripture: {
      reference: '1 Thessalonians 5:16',
      translation: 'ESV',
      textStatus: 'provided',
      passage: 'Rejoice always.',
      usageRightsConfirmed: true,
      practiceStatus: 'configured',
    },
    screens: [
      {
        id: 'screen-1',
        blocks: [{ type: 'statement', text: 'Welcome.' }],
      },
    ],
  }
}

function makeFakeProviders() {
  const challengeCalls: string[] = []
  const monthCalls: string[] = []

  const challengeProvider: Pick<ChallengeDetailProvider, 'loadChallenge'> = {
    async loadChallenge(slug) {
      challengeCalls.push(slug)
      if (slug === 'rejoice-always') {
        return {
          status: 'ready',
          challenge: makeReadyChallenge(slug),
          source: 'gateway',
        }
      }
      return { status: 'notFound', source: 'gateway' }
    },
  }

  const monthProvider: Pick<MonthGatewayProvider, 'loadMonth' | 'loadMonthPreview'> = {
    async loadMonth(yearMonth) {
      monthCalls.push(yearMonth)
      if (yearMonth === '2026-11') {
        return {
          status: 'ready',
          source: 'gateway',
          serverContext: {
            authorizedLocalDate: '2026-11-16',
            effectiveTimeZone: 'America/New_York',
          },
          month: {
            monthId: '2026-11',
            documentId: 'month-2026-11',
            year: 2026,
            month: 11,
            daysInMonth: 30,
            phase: 'active',
            rosterVersion: 1,
            totalChallenges: 1,
            title: 'November',
            introduction: { version: 'v1', screens: [] },
            slots: [],
            discoveries: [],
          },
        }
      }
      return { status: 'notFound', source: 'gateway' }
    },
    async loadMonthPreview() {
      return { status: 'notFound', source: 'gateway' }
    },
  }

  return { challengeProvider, monthProvider, challengeCalls, monthCalls }
}

test('handles cold start, resumed session, and duplicate incoming-link suppression', async () => {
  let currentTimeMs = 1000
  let urlOpenListener: ((url: string) => void) | null = null
  let unsubscribed = false

  const source: ExternalDeepLinkSourceAdapter = {
    async getInitialUrl() {
      return 'https://reader.example.test/month/2026-11'
    },
    subscribeUrlOpen(listener) {
      urlOpenListener = listener
      return () => {
        unsubscribed = true
        urlOpenListener = null
      }
    },
  }

  const { challengeProvider, monthProvider, monthCalls, challengeCalls } = makeFakeProviders()
  const navigated: DeepLinkNavigatedOutcome[] = []
  const unavailable: DeepLinkUnavailableOutcome[] = []
  let duplicateCount = 0

  const controller = createDeepLinkIngressController({
    policy: {
      allowedHttpsHosts: ['reader.example.test'],
      allowedCustomSchemes: ['bibleberry'],
    },
    destinationOptions: {
      monthScreenEnabled: true,
      releasedChallengeRouteEnabled: true,
      currentYearMonth: '2026-11',
    },
    source,
    monthProvider,
    challengeProvider,
    dedupeWindowMs: 2000,
    now: () => currentTimeMs,
    onNavigate: outcome => navigated.push(outcome),
    onUnavailable: outcome => unavailable.push(outcome),
    onDuplicateIgnored: () => {
      duplicateCount += 1
    },
  })

  const coldResult = await controller.start()
  assert.ok(coldResult)
  assert.equal(coldResult.status, 'navigated')
  assert.equal(coldResult.sourceEvent.trigger, 'coldStart')
  assert.deepEqual(coldResult.destination, { type: 'month', yearMonth: '2026-11' })
  assert.equal(monthCalls.length, 1)

  // Duplicate event via custom scheme within dedupeWindowMs is ignored
  currentTimeMs += 500
  const dupResult = await controller.handleIncomingUrl(
    'bibleberry://month/2026-11',
    'resumedSession',
  )
  assert.equal(dupResult.status, 'ignoredDuplicate')
  assert.equal(duplicateCount, 1)
  assert.equal(monthCalls.length, 1)

  // Same URL after dedupeWindowMs elapses is processed again
  currentTimeMs += 2500
  const afterWindowResult = await controller.handleIncomingUrl(
    'https://reader.example.test/month/2026-11',
    'resumedSession',
  )
  assert.equal(afterWindowResult.status, 'navigated')
  assert.equal(monthCalls.length, 2)

  // Resumed session via subscribed listener
  assert.ok(urlOpenListener)
  urlOpenListener('https://reader.example.test/challenge/rejoice-always?origin=library&yearMonth=2026-10')
  await new Promise(resolve => setTimeout(resolve, 10))

  assert.equal(challengeCalls.length, 1)
  assert.equal(navigated.length, 3)
  assert.deepEqual(controller.getState().activeDestination, {
    type: 'releasedChallenge',
    slug: 'rejoice-always',
    origin: { kind: 'hub' },
    entry: 'external',
  })
  assert.equal(unavailable.length, 0)

  controller.stop()
  assert.equal(unsubscribed, true)
  assert.equal(controller.getState().started, false)
})

test('cancels superseded in-flight authorization (latest-wins) and handles unavailable outcomes cleanly', async () => {
  let resolveFirst: ((value: Awaited<ReturnType<ChallengeDetailProvider['loadChallenge']>>) => void) | null = null
  let firstAborted = false

  const challengeProvider: Pick<ChallengeDetailProvider, 'loadChallenge'> = {
    loadChallenge(slug, options) {
      if (slug === 'slow-challenge') {
        options?.signal?.addEventListener('abort', () => {
          firstAborted = true
        })
        return new Promise(resolve => {
          resolveFirst = resolve
        })
      }
      if (slug === 'fast-challenge') {
        return Promise.resolve({
          status: 'ready',
          challenge: makeReadyChallenge(slug),
          source: 'gateway',
        })
      }
      return Promise.resolve({ status: 'notFound', source: 'gateway' })
    },
  }

  const controller = createDeepLinkIngressController({
    policy: { allowedHttpsHosts: ['reader.example.test'] },
    destinationOptions: {
      monthScreenEnabled: true,
      releasedChallengeRouteEnabled: true,
      currentYearMonth: '2026-11',
    },
    challengeProvider,
  })

  const firstPromise = controller.handleIncomingUrl(
    'https://reader.example.test/challenge/slow-challenge',
    'coldStart',
  )
  // In-flight duplicate of slow-challenge is ignored
  const inFlightDup = await controller.handleIncomingUrl(
    'https://reader.example.test/challenge/slow-challenge',
    'resumedSession',
  )
  assert.equal(inFlightDup.status, 'ignoredDuplicate')

  // Newer link supersedes slow-challenge
  const secondOutcome = await controller.handleIncomingUrl(
    'https://reader.example.test/challenge/fast-challenge?origin=hub',
    'resumedSession',
  )
  assert.equal(secondOutcome.status, 'navigated')
  assert.equal(firstAborted, true)

  resolveFirst?.({
    status: 'ready',
    challenge: makeReadyChallenge('slow-challenge'),
    source: 'gateway',
  })
  const firstOutcome = await firstPromise
  assert.equal(firstOutcome.status, 'unavailable')
  assert.deepEqual(controller.getState().activeDestination, {
    type: 'releasedChallenge',
    slug: 'fast-challenge',
    origin: { kind: 'hub' },
    entry: 'external',
  })

  // Unreleased link produces unavailable outcome and clears activeDestination without guessing
  const unreleasedOutcome = await controller.handleIncomingUrl(
    'https://reader.example.test/challenge/future-challenge',
    'resumedSession',
  )
  assert.equal(unreleasedOutcome.status, 'unavailable')
  if (unreleasedOutcome.status === 'unavailable') {
    assert.equal(unreleasedOutcome.outcome.reason, 'contentNotReleased')
    assert.equal(unreleasedOutcome.outcome.accessibility.suggestedAction.target, 'hub')
  }
  assert.equal(controller.getState().phase, 'unavailable')
  assert.equal(controller.getState().activeDestination, null)
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

function makeControllerOptions(source: ExternalDeepLinkSourceAdapter, onNavigate: (outcome: DeepLinkNavigatedOutcome) => void) {
  const { challengeProvider, monthProvider } = makeFakeProviders()
  return {
    policy: { allowedHttpsHosts: ['reader.example.test'] },
    destinationOptions: {
      monthScreenEnabled: true,
      releasedChallengeRouteEnabled: true,
      currentYearMonth: '2026-11',
    },
    source,
    monthProvider,
    challengeProvider,
    onNavigate,
  }
}

test('a delayed cold-start URL cannot replace a newer resumed-session URL', async () => {
  const initial = deferred<string | null>()
  let listener: ((url: string) => void) | null = null
  const source: ExternalDeepLinkSourceAdapter = {
    getInitialUrl: () => initial.promise,
    subscribeUrlOpen(callback) {
      listener = callback
      return () => { listener = null }
    },
  }
  const navigated: DeepLinkNavigatedOutcome[] = []
  const controller = createDeepLinkIngressController(makeControllerOptions(source, result => navigated.push(result)))

  const startup = controller.start()
  assert.ok(listener)
  listener('https://reader.example.test/challenge/rejoice-always?origin=hub')
  await new Promise(resolve => setTimeout(resolve, 10))
  assert.equal(navigated.length, 1)

  initial.resolve('https://reader.example.test/challenge/future-challenge?origin=hub')
  assert.equal(await startup, null)
  assert.equal(navigated.length, 1)
  assert.deepEqual(controller.getState().activeDestination, {
    type: 'releasedChallenge',
    slug: 'rejoice-always',
    origin: { kind: 'hub' },
    entry: 'external',
  })
})

test('a pending cold start from before stop/restart cannot enter the new lifecycle', async () => {
  const oldInitial = deferred<string | null>()
  const newInitial = deferred<string | null>()
  let calls = 0
  const source: ExternalDeepLinkSourceAdapter = {
    getInitialUrl() {
      calls += 1
      return calls === 1 ? oldInitial.promise : newInitial.promise
    },
  }
  const navigated: DeepLinkNavigatedOutcome[] = []
  const controller = createDeepLinkIngressController(makeControllerOptions(source, result => navigated.push(result)))

  const oldStartup = controller.start()
  controller.stop()
  const newStartup = controller.start()
  oldInitial.resolve('https://reader.example.test/challenge/future-challenge?origin=hub')
  assert.equal(await oldStartup, null)

  newInitial.resolve('https://reader.example.test/challenge/rejoice-always?origin=hub')
  const newResult = await newStartup
  assert.equal(newResult?.status, 'navigated')
  assert.equal(navigated.length, 1)
  assert.equal(navigated[0]?.destination.type, 'releasedChallenge')
  if (navigated[0]?.destination.type === 'releasedChallenge') {
    assert.equal(navigated[0].destination.slug, 'rejoice-always')
  }
})
