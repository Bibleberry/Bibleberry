import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createGatewayChallengeProvider } from '../../src/cms/reader/challengeDetailProvider.ts'
import { createGatewayMonthProvider } from '../../src/cms/reader/monthProvider.ts'
import { createGatewayCatalogProvider } from '../../src/cms/reader/releasedCatalogProvider.ts'
import {
  admitGatewayMonthProgressAwards,
  validateEarnedCardSnapshot,
} from '../../src/participation/awards.ts'
import { emptyReaderParticipationData } from '../../src/participation/model.ts'
import { deriveTodayPrimaryAction } from '../../src/readerShell/today/index.ts'
import {
  RESTRICTED_MANUSCRIPT_SENTINEL,
  awardId,
  buildCurrentMonthProgressPayload,
  buildDefaultCurrentMonthPayload,
  buildDefaultHistoricalMonthPayload,
  buildEmbargoedChallengeFixture,
  buildHistoricalMonthProgressPayload,
  buildLibraryMonthsPayload,
  buildNewsPayload,
  challenge,
  currentFullMonthAwardId,
  currentMonthId,
  currentMonthMultiScreenChallenge,
  currentMonthMultiScreenDocumentId,
  currentMonthMultiScreenSlug,
  currentThematicAwardId,
  currentThematicEarnedCard,
  documentId,
  monthId,
  serverContext,
  teachingSlug,
  todayChallenge,
  todayDocumentId,
  todayMultiScreenChallenge,
  todaySlug,
} from './fixtures/m1aGatewayFixtures.ts'

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('Clover Compass — M1a synthetic gateway fixture schema & trust-boundary fidelity', () => {
  it('validates active and historical Month, News, and Progress payloads through createGatewayMonthProvider', async () => {
    const provider = createGatewayMonthProvider({
      baseUrl: 'https://m1a.synthetic.local',
      fetchImpl: async (input, init) => {
        const url = new URL(typeof input === 'string' ? input : input.toString())
        if (url.pathname === `/api/months/${currentMonthId}`) {
          return jsonResponse(buildDefaultCurrentMonthPayload())
        }
        if (url.pathname === `/api/months/${monthId}`) {
          return jsonResponse(buildDefaultHistoricalMonthPayload())
        }
        if (url.pathname === `/api/months/${currentMonthId}/progress`) {
          const body = JSON.parse(String(init?.body ?? '{}')) as { completedChallengeIds?: string[] }
          return jsonResponse(buildCurrentMonthProgressPayload(body.completedChallengeIds ?? []))
        }
        if (url.pathname === `/api/months/${monthId}/progress`) {
          const body = JSON.parse(String(init?.body ?? '{}')) as { completedChallengeIds?: string[] }
          return jsonResponse(buildHistoricalMonthProgressPayload(body.completedChallengeIds ?? []))
        }
        if (url.pathname === '/api/news') {
          return jsonResponse(buildNewsPayload(url.searchParams.get('category')))
        }
        return jsonResponse({ ok: false }, 404)
      },
    })

    const currentMonth = await provider.loadMonth(currentMonthId)
    assert.equal(currentMonth.status, 'ready')
    if (currentMonth.status === 'ready') {
      assert.equal(currentMonth.source, 'gateway')
      assert.deepEqual(currentMonth.serverContext, serverContext)
      assert.equal(currentMonth.month.phase, 'active')
      assert.equal(currentMonth.month.discoveries.length, 2)
      assert.equal(currentMonth.month.discoveries[1]?.kind, 'fullMonth')
    }

    const todayProjection = deriveTodayPrimaryAction({
      currentMonth,
      participationData: emptyReaderParticipationData(),
    })
    assert.equal(todayProjection.primary.status, 'challenge')
    if (todayProjection.primary.status === 'challenge') {
      assert.equal(todayProjection.primary.action.slug, todaySlug)
      assert.equal(todayProjection.primary.action.expectedDocumentId, todayDocumentId)
      assert.equal(todayProjection.primary.action.entry, 'start')
    }

    // Unearned progress exposes zero Card metadata and admits zero awards
    const unearnedProgress = await provider.loadMonthProgress(currentMonthId, [])
    assert.equal(unearnedProgress.status, 'ready')
    if (unearnedProgress.status === 'ready') {
      assert.equal(unearnedProgress.progress.thematicEarnedCount, 0)
      assert.equal(unearnedProgress.progress.discoveries[0]?.isEarned, false)
      assert.equal(unearnedProgress.progress.discoveries[0]?.earnedCard, undefined)
      assert.equal(unearnedProgress.progress.discoveries[1]?.isEarned, false)
      assert.equal(unearnedProgress.progress.discoveries[1]?.earnedCard, undefined)
    }

    // Finishing Today or Day 14 earns the thematic Card while keeping full-month strictly unearned
    const earnedProgress = await provider.loadMonthProgress(currentMonthId, [
      `cms:${todayDocumentId}`,
    ])
    assert.equal(earnedProgress.status, 'ready')
    if (earnedProgress.status === 'ready') {
      assert.equal(earnedProgress.progress.thematicEarnedCount, 1)
      assert.equal(earnedProgress.progress.discoveries[0]?.isEarned, true)
      assert.equal(earnedProgress.progress.discoveries[0]?.awardId, currentThematicAwardId)
      assert.equal(earnedProgress.progress.discoveries[1]?.isEarned, false)
      assert.equal(earnedProgress.progress.discoveries[1]?.awardId, undefined)
      assert.equal(earnedProgress.progress.discoveries[1]?.earnedCard, undefined)
    }

    const admittedCurrentAwards = admitGatewayMonthProgressAwards(
      buildCurrentMonthProgressPayload([`cms:${currentMonthMultiScreenDocumentId}`]),
    )
    assert.equal(admittedCurrentAwards.length, 1)
    assert.equal(admittedCurrentAwards[0]?.awardId, currentThematicAwardId)
    assert.equal(admittedCurrentAwards[0]?.earnedOn, serverContext.authorizedLocalDate)
    assert.notEqual(admittedCurrentAwards[0]?.awardId, currentFullMonthAwardId)
    assert.ok(validateEarnedCardSnapshot(currentThematicEarnedCard, currentMonthId))

    const historicalProgress = await provider.loadMonthProgress(monthId, [`cms:${documentId}`])
    assert.equal(historicalProgress.status, 'ready')
    if (historicalProgress.status === 'ready') {
      assert.equal(historicalProgress.progress.discoveries[0]?.awardId, awardId)
    }

    const news = await provider.loadNews()
    assert.equal(news.status, 'ready')
    assert.equal(buildLibraryMonthsPayload().items[0]?.yearMonth, monthId)
  })

  it('validates multi-screen Challenge details and keeps embargoed fixtures distinguishable', async () => {
    const bySlug = new Map<string, unknown>([
      [teachingSlug, challenge],
      [todaySlug, todayMultiScreenChallenge],
      [currentMonthMultiScreenSlug, currentMonthMultiScreenChallenge],
    ])

    const challengeProvider = createGatewayChallengeProvider({
      baseUrl: 'https://m1a.synthetic.local',
      fetchImpl: async input => {
        const url = new URL(typeof input === 'string' ? input : input.toString())
        const slug = url.pathname.split('/').at(-1) ?? ''
        const found = bySlug.get(slug)
        return found ? jsonResponse({ ok: true, challenge: found }) : jsonResponse({ ok: false }, 404)
      },
    })

    const catalogProvider = createGatewayCatalogProvider({
      baseUrl: 'https://m1a.synthetic.local',
      fetchImpl: async () =>
        jsonResponse({
          ok: true,
          challenges: [challenge, todayChallenge, currentMonthMultiScreenChallenge],
        }),
    })

    const todayLoaded = await challengeProvider.loadChallenge(todaySlug)
    assert.equal(todayLoaded.status, 'ready')
    if (todayLoaded.status === 'ready') {
      assert.equal(todayLoaded.source, 'gateway')
      assert.equal(todayLoaded.challenge.screens.length, 3)
      assert.equal(todayLoaded.challenge.documentId, todayDocumentId)
    }

    const day14Loaded = await challengeProvider.loadChallenge(currentMonthMultiScreenSlug)
    assert.equal(day14Loaded.status, 'ready')
    if (day14Loaded.status === 'ready') {
      assert.equal(day14Loaded.challenge.screens.length, 3)
      assert.equal(day14Loaded.challenge.documentId, currentMonthMultiScreenDocumentId)
    }

    const catalogLoaded = await catalogProvider.loadReleasedCatalog()
    assert.equal(catalogLoaded.status, 'ready')

    const embargoed = buildEmbargoedChallengeFixture()
    assert.equal(embargoed.releaseAt, '2099-01-01T00:00:00Z')
    assert.equal(embargoed.screens[0]?.blocks[0]?.text, RESTRICTED_MANUSCRIPT_SENTINEL)
  })
})
