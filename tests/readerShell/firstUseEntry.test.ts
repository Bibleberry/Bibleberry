import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ChallengeDetailProvider } from '../../src/cms/reader/challengeDetailProvider.ts'
import type { CmsChallenge } from '../../src/cms/sanity/types.ts'
import type { DeepLinkIngressOutcome, ExternalDeepLinkSourceAdapter } from '../../src/deepLinkIngress/types.ts'
import { createDefaultReaderProfile } from '../../src/readerProfile/model.ts'
import { createReaderProfileStore } from '../../src/readerProfile/store.ts'
import {
  buildDefaultBrowserIngressPolicy,
  buildIntroCompletionPatch,
  createR06ExternalIngressBridge,
  createVerifiedChallengeIngressProvider,
  extractRawLocationTarget,
  isFirstUseGuidanceActive,
  resolveFirstUseStep,
  shouldEvaluateFirstUseOnBoot,
} from '../../src/readerShell/entry/index.ts'
import {
  activeRoute,
  applyNativeIngress,
  applyNavigationAction,
  createBrowserNavigation,
  createNavigationState,
  navigationReducer,
  replaceFirstUseGuidance,
  restoreBrowserLocation,
} from '../../src/readerShell/navigation/index.ts'
import { activeScreenKey, readerRouteOptions } from '../../src/readerShell/navigation/routeTable.ts'
import { createMemoryDriver } from '../readerProfile/helpers.ts'

const routeOptions = readerRouteOptions()

function makeGatewayChallenge(
  slug: string,
  overrides: Partial<CmsChallenge> = {},
): CmsChallenge {
  return {
    id: slug,
    documentId: `doc-${slug}`,
    slug,
    title: 'Authorized Teaching',
    challengeType: 'teaching',
    releaseAt: '2026-11-01T08:00:00Z',
    releaseAtUtc: '2026-11-01T08:00:00Z',
    calendarSlot: {
      yearMonth: '2026-11',
      dayOfMonth: 10,
      publicationDate: '2026-11-10',
    },
    editorial: {
      adaptationReviewed: true,
      reviewedAt: '2026-11-01T07:00:00Z',
    },
    primaryScripture: {
      reference: 'Psalm 23:1',
      translation: 'WEB',
      textStatus: 'provided',
      passage: 'Yahweh is my shepherd.',
      usageRightsConfirmed: true,
      practiceStatus: 'configured',
    },
    screens: [
      {
        id: 'screen-1',
        blocks: [{ type: 'statement', text: 'Synthetic teaching screen.' }],
      },
    ],
    ...overrides,
  }
}

test('resolveFirstUseStep sequences Intro then optional Tutorial seam with independent statuses', () => {
  const fresh = createDefaultReaderProfile()
  assert.equal(resolveFirstUseStep(fresh, { tutorialAvailable: false }), 'intro')
  assert.equal(resolveFirstUseStep(fresh, { tutorialAvailable: true }), 'intro')
  assert.equal(
    resolveFirstUseStep(fresh, { tutorialAvailable: true, skipIntroInSession: true }),
    'tutorial',
  )
  assert.equal(
    resolveFirstUseStep(fresh, {
      tutorialAvailable: true,
      skipIntroInSession: true,
      skipTutorialInSession: true,
    }),
    'none',
  )
  assert.equal(
    resolveFirstUseStep(fresh, { tutorialAvailable: false, skipIntroInSession: true }),
    'none',
  )

  for (const introStatus of ['completed', 'skipped'] as const) {
    const afterIntro = { ...fresh, introStatus, tutorialStatus: 'pending' as const }
    assert.equal(resolveFirstUseStep(afterIntro, { tutorialAvailable: false }), 'none')
    assert.equal(resolveFirstUseStep(afterIntro, { tutorialAvailable: true }), 'tutorial')

    for (const tutorialStatus of ['completed', 'skipped'] as const) {
      const done = { ...afterIntro, tutorialStatus }
      assert.equal(resolveFirstUseStep(done, { tutorialAvailable: true }), 'none')
      assert.equal(resolveFirstUseStep(done, { tutorialAvailable: false }), 'none')
    }
  }
})

test('shouldEvaluateFirstUseOnBoot enforces G04-B deferral on external ingress and re-offers on next ordinary fresh launch', () => {
  const todayLanding = createNavigationState()

  // Ordinary fresh launch at Today evaluates first-use onboarding
  assert.equal(
    shouldEvaluateFirstUseOnBoot({
      restoredSession: false,
      bypassedByExternalIngress: false,
      state: todayLanding,
    }),
    true,
  )

  // External Challenge ingress (cold or warm) bypasses onboarding
  assert.equal(
    shouldEvaluateFirstUseOnBoot({
      restoredSession: false,
      bypassedByExternalIngress: true,
      state: todayLanding,
    }),
    false,
  )

  // Reloading Today within the same session (e.g. after external Challenge Exit/Finish) never pops up an onboarding wall
  assert.equal(
    shouldEvaluateFirstUseOnBoot({
      restoredSession: true,
      bypassedByExternalIngress: false,
      state: todayLanding,
    }),
    false,
  )

  // Reloading mid-first-use guidance re-verifies against durable profile
  const midIntro = navigationReducer(todayLanding, { type: 'openIntro' })
  const midTutorial = navigationReducer(todayLanding, { type: 'openTutorial' })
  assert.equal(isFirstUseGuidanceActive(midIntro), true)
  assert.equal(isFirstUseGuidanceActive(midTutorial), true)
  assert.equal(
    shouldEvaluateFirstUseOnBoot({
      restoredSession: true,
      bypassedByExternalIngress: false,
      state: midIntro,
    }),
    true,
  )

  // Non-Today tabs, nested routes, active Challenges, and problem states never trigger first-use boot gating
  const moreTab = navigationReducer(todayLanding, { type: 'selectTab', tab: 'more' })
  const moreIntroReplay = navigationReducer(moreTab, { type: 'openIntro' })
  assert.equal(isFirstUseGuidanceActive(moreIntroReplay), false)
  for (const state of [
    moreTab,
    moreIntroReplay,
    navigationReducer(todayLanding, { type: 'push', route: { kind: 'month', yearMonth: '2026-11' } }),
    navigationReducer(todayLanding, { type: 'enterExternalChallenge', slug: 'teaching-1' }),
    navigationReducer(todayLanding, { type: 'unavailable', problem: 'challengeUnavailable' }),
  ]) {
    assert.equal(
      shouldEvaluateFirstUseOnBoot({
        restoredSession: false,
        bypassedByExternalIngress: false,
        state,
      }),
      false,
    )
  }
})

test('buildIntroCompletionPatch and ReaderProfileStore persist Intro choices without mutating tutorialStatus or replay flags', async () => {
  const driver = createMemoryDriver()
  const store = createReaderProfileStore({ driver })
  const initial = (await store.load()).profile
  assert.equal(initial.introStatus, 'pending')
  assert.equal(initial.tutorialStatus, 'pending')

  // Replay result never produces a first-use patch
  assert.deepEqual(
    buildIntroCompletionPatch(initial, {
      mode: 'replay',
      reason: 'finish',
      destination: 'foundations',
      origin: { label: 'More' },
      reminderEnabled: true,
      reminderTime: '09:30',
    }),
    {},
  )

  // Skip marks introStatus skipped while keeping tutorialStatus pending and reminder unchanged
  const skipResult = await store.update(current =>
    buildIntroCompletionPatch(current, {
      mode: 'first-use',
      reason: 'skip',
      destination: 'today',
      origin: null,
    }),
  )
  assert.equal(skipResult.ok, true)
  assert.equal(skipResult.profile.introStatus, 'skipped')
  assert.equal(skipResult.profile.tutorialStatus, 'pending')
  assert.deepEqual(skipResult.profile.reminder, { enabled: false, time: '08:00' })

  // Reset to fresh store for full reminder save and fallback validation
  const store2 = createReaderProfileStore({ driver: createMemoryDriver() })
  const saved = await store2.update(current =>
    buildIntroCompletionPatch(current, {
      mode: 'first-use',
      reason: 'finish',
      destination: 'foundations',
      origin: null,
      reminderEnabled: true,
      reminderTime: '06:45',
    }),
  )
  assert.equal(saved.ok, true)
  assert.equal(saved.profile.introStatus, 'completed')
  assert.equal(saved.profile.tutorialStatus, 'pending')
  assert.deepEqual(saved.profile.reminder, { enabled: true, time: '06:45' })

  // Invalid time falls back safely to current reminder time; Not now disables reminder while preserving time
  const fallbackSaved = await store2.update(current =>
    buildIntroCompletionPatch(current, {
      mode: 'first-use',
      reason: 'finish',
      destination: 'foundations',
      origin: null,
      reminderEnabled: true,
      reminderTime: 'not-a-time',
    }),
  )
  assert.equal(fallbackSaved.ok, true)
  assert.deepEqual(fallbackSaved.profile.reminder, { enabled: true, time: '06:45' })

  const declined = await store2.update(current =>
    buildIntroCompletionPatch(current, {
      mode: 'first-use',
      reason: 'finish',
      destination: 'foundations',
      origin: null,
      reminderEnabled: false,
    }),
  )
  assert.equal(declined.ok, true)
  assert.equal(declined.profile.introStatus, 'completed')
  assert.equal(declined.profile.tutorialStatus, 'pending')
  assert.deepEqual(declined.profile.reminder, { enabled: false, time: '06:45' })
})

test('replaceFirstUseGuidance replaces Today guidance frames in place without polluting history or clobbering reading', () => {
  const booted = restoreBrowserLocation(createBrowserNavigation('session-first-use'), { hash: '#/' }, routeOptions)
  assert.equal(booted.status, 'ready')

  const intro = replaceFirstUseGuidance(booted.navigation, 'intro')
  assert.equal(intro.history.type, 'replace')
  assert.equal(intro.navigation.currentId, 1)
  assert.equal(intro.navigation.entries[1]?.previousId, null)
  assert.deepEqual(intro.navigation.state.focused, { kind: 'intro' })
  assert.equal(activeScreenKey(intro.navigation.state), 'today:intro')

  // Idempotent when the same first-use step is already active
  assert.equal(replaceFirstUseGuidance(intro.navigation, 'intro').history.type, 'none')

  const tutorial = replaceFirstUseGuidance(intro.navigation, 'tutorial')
  assert.equal(tutorial.history.type, 'replace')
  assert.equal(tutorial.navigation.currentId, 1)
  assert.equal(tutorial.navigation.entries[1]?.previousId, null)
  assert.deepEqual(tutorial.navigation.state.focused, { kind: 'tutorial', shownTab: 'today' })
  assert.equal(activeScreenKey(tutorial.navigation.state), 'today:tutorial')

  const shownMore = applyNavigationAction(tutorial.navigation, { type: 'showTutorialTab', tab: 'more' })
  assert.equal(shownMore.history.type, 'replace')
  assert.equal(replaceFirstUseGuidance(shownMore.navigation, 'tutorial').history.type, 'none')

  const today = replaceFirstUseGuidance(shownMore.navigation, 'none')
  assert.equal(today.history.type, 'replace')
  assert.equal(today.navigation.currentId, 1)
  assert.equal(today.navigation.entries[1]?.previousId, null)
  assert.equal(today.navigation.state.focused, null)
  assert.deepEqual(activeRoute(today.navigation.state), { kind: 'landing', tab: 'today' })
  assert.equal(Object.keys(today.navigation.entries).length, 1)

  // Never overwrites an active Challenge or another tab
  const externalChallenge = applyNavigationAction(today.navigation, {
    type: 'enterExternalChallenge',
    slug: 'october-25',
  })
  assert.equal(replaceFirstUseGuidance(externalChallenge.navigation, 'intro').history.type, 'none')
  assert.deepEqual(externalChallenge.navigation.state.focused, {
    kind: 'challenge',
    slug: 'october-25',
    entry: 'external',
    origin: { kind: 'hub' },
  })
})

test('extractRawLocationTarget and buildDefaultBrowserIngressPolicy preserve raw encoded tricks and scope HTTPS hosts', () => {
  assert.equal(extractRawLocationTarget('http://127.0.0.1:5173/'), null)
  assert.equal(extractRawLocationTarget('http://127.0.0.1:5173/#/challenge/october-25'), null)
  assert.equal(extractRawLocationTarget('http://127.0.0.1:5173/index.html#/more'), null)
  assert.equal(
    extractRawLocationTarget('http://127.0.0.1:5173/challenge/october-25?origin=month&yearMonth=2026-10'),
    '/challenge/october-25?origin=month&yearMonth=2026-10',
  )
  assert.equal(
    extractRawLocationTarget('http://127.0.0.1:5173/challenge/%2Fforged'),
    '/challenge/%2Fforged',
  )

  assert.deepEqual(
    buildDefaultBrowserIngressPolicy(
      { protocol: 'http:', hostname: '127.0.0.1', port: '5173' },
      { allowedCustomSchemes: ['bibleberry'] },
    ),
    {
      allowedHttpsHosts: [],
      allowedCustomSchemes: ['bibleberry'],
      allowedCustomSchemeHosts: undefined,
    },
  )
  assert.deepEqual(
    buildDefaultBrowserIngressPolicy({ protocol: 'https:', hostname: 'staging.example.test', port: '' }),
    {
      allowedHttpsHosts: ['staging.example.test'],
      allowedCustomSchemes: undefined,
      allowedCustomSchemeHosts: undefined,
    },
  )
})

test('createR06ExternalIngressBridge enforces gateway capability checks, strips forged origins, and handles cold/warm links', async () => {
  const calls: string[] = []
  const provider: ChallengeDetailProvider = {
    async loadChallenge(slug) {
      calls.push(slug)
      if (slug === 'released-teaching') {
        return {
          status: 'ready',
          source: 'gateway',
          challenge: makeGatewayChallenge(slug),
        }
      }
      if (slug === 'unreviewed-teaching') {
        return {
          status: 'ready',
          source: 'gateway',
          challenge: makeGatewayChallenge(slug, {
            editorial: { adaptationReviewed: false },
          }),
        }
      }
      if (slug === 'catalog-only-teaching') {
        return {
          status: 'ready',
          source: 'catalog',
          challenge: makeGatewayChallenge(slug),
        }
      }
      return { status: 'notFound', source: 'gateway' }
    },
  }

  let warmListener: ((url: string) => void) | null = null
  const source: ExternalDeepLinkSourceAdapter = {
    async getInitialUrl() {
      return 'https://reader.example.test/challenge/released-teaching?origin=month&yearMonth=2026-10'
    },
    subscribeUrlOpen(listener) {
      warmListener = listener
      return () => {
        warmListener = null
      }
    },
  }

  const warmOutcomes: DeepLinkIngressOutcome[] = []
  let nowMs = 1_000
  const bridge = createR06ExternalIngressBridge({
    destinationOptions: routeOptions,
    challengeProvider: provider,
    policy: {
      allowedHttpsHosts: ['reader.example.test'],
      allowedCustomSchemes: ['bibleberry'],
    },
    source,
    now: () => nowMs,
    onOutcome(outcome) {
      warmOutcomes.push(outcome)
    },
  })

  // Cold external Challenge authorizes, strips untrusted Month origin, and returns a single-use verified provider
  const cold = await bridge.start()
  assert.ok(cold)
  assert.equal(cold.outcome.status, 'navigated')
  assert.ok(cold.verifiedProvider)
  const coldNav = applyNativeIngress(createBrowserNavigation('cold'), cold.outcome, routeOptions)
  assert.deepEqual(coldNav.navigation.state.focused, {
    kind: 'challenge',
    slug: 'released-teaching',
    entry: 'external',
    origin: { kind: 'hub' },
  })
  const verifiedPayload = await cold.verifiedProvider.loadChallenge('released-teaching')
  assert.equal(verifiedPayload.status, 'ready')
  assert.equal(calls.length, 1)

  // Unreviewed and non-gateway responses fail closed
  nowMs += 5_000
  for (const deniedUrl of [
    'https://reader.example.test/challenge/unreviewed-teaching',
    'https://reader.example.test/challenge/catalog-only-teaching',
    'https://reader.example.test/challenge/embargoed-teaching',
    'https://evil.example.test/challenge/released-teaching',
    'https://reader.example.test/challenge/%2Freleased-teaching',
  ]) {
    nowMs += 3_000
    const denied = await bridge.handleExternalUrl(deniedUrl)
    assert.equal(denied.outcome.status, 'unavailable', deniedUrl)
    assert.equal(denied.verifiedProvider, undefined, deniedUrl)
  }

  // Warm resumed-session event notifies onOutcome and bypasses any active guidance frame
  nowMs += 5_000
  assert.ok(warmListener)
  warmListener('bibleberry://challenge/released-teaching?origin=shelf')
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(warmOutcomes.length, 1)
  assert.equal(warmOutcomes[0]?.status, 'navigated')

  const verifiedCheck = createVerifiedChallengeIngressProvider(provider)
  const unreviewed = await verifiedCheck.challengeProvider.loadChallenge('unreviewed-teaching')
  assert.equal(unreviewed.status, 'validationError')
  assert.equal(verifiedCheck.takeVerifiedProvider('unreviewed-teaching'), undefined)

  bridge.stop()
})

test('same-origin cold browser path links validate through parser + gateway and never expose internal host to external sources', async () => {
  const provider: ChallengeDetailProvider = {
    async loadChallenge(slug) {
      if (slug === 'october-25') {
        return {
          status: 'ready',
          source: 'gateway',
          challenge: makeGatewayChallenge(slug),
        }
      }
      return { status: 'notFound', source: 'gateway' }
    },
  }

  const bridge = createR06ExternalIngressBridge({
    destinationOptions: routeOptions,
    challengeProvider: provider,
    locationHref: () => 'http://127.0.0.1:4173/challenge/october-25?origin=month&yearMonth=2026-10',
    locationPolicyOrigin: { protocol: 'http:', hostname: '127.0.0.1', port: '4173' },
  })

  const started = await bridge.start()
  assert.ok(started)
  assert.equal(started.outcome.status, 'navigated')
  if (started.outcome.status === 'navigated') {
    assert.deepEqual(started.outcome.destination, {
      type: 'releasedChallenge',
      slug: 'october-25',
      origin: { kind: 'hub' },
      entry: 'external',
    })
  }

  // External handleExternalUrl still rejects http://127.0.0.1 and unauthorized hosts
  const externalAttempt = await bridge.handleExternalUrl('http://127.0.0.1:4173/challenge/october-25')
  assert.equal(externalAttempt.outcome.status, 'unavailable')
  bridge.stop()
})

test('takeVerifiedProvider retains single-visit provider until consumed and does not drop it on unrelated state', async () => {
  const provider: ChallengeDetailProvider = {
    async loadChallenge(slug) {
      return {
        status: 'ready',
        source: 'gateway',
        challenge: makeGatewayChallenge(slug),
      }
    },
  }
  const verified = createVerifiedChallengeIngressProvider(provider)
  const loaded = await verified.challengeProvider.loadChallenge('released-teaching')
  assert.equal(loaded.status, 'ready')

  // Mismatched slug does not consume the verified provider
  assert.equal(verified.takeVerifiedProvider('other-slug'), undefined)
  // Matching slug returns single-use provider once
  const singleUse = verified.takeVerifiedProvider('released-teaching')
  assert.ok(singleUse)
  assert.equal((await singleUse.loadChallenge('released-teaching')).status, 'ready')
  assert.equal(verified.takeVerifiedProvider('released-teaching'), undefined)
})
