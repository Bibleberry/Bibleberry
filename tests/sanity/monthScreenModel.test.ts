import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { MonthProgressData, MonthSlot, MonthSlotPreview } from '../../src/cms/reader/monthProvider.ts'
import {
  deriveMonthCompletionSummary,
  deriveMonthSlotPresentations,
  extractCompletedCmsChallengeIdsForMonth,
  getAdjacentYearMonths,
  groupMonthSlotsByWeek,
  MAX_MONTH_PROGRESS_IDS,
  resolveMonthDiscoveryPresentations,
} from '../../src/components/month/monthScreenModel.ts'
import {
  createMonthIntroStore,
  emptyMonthIntroEnvelope,
  markMonthPreviewSeenInEnvelope,
  markMonthWelcomeSeenInEnvelope,
  MONTH_INTRO_STORAGE_KEY,
  parseMonthIntroEnvelope,
  resolveMonthIntroDecision,
} from '../../src/components/month/monthIntroStorage.ts'
import { emptyReaderParticipationData } from '../../src/participation/model.ts'
import { parseLocalCalendarDate, parsePublicationYearMonth } from '../../src/participation/identity.ts'
import type { KeyValueStorageDriver } from '../../src/participation/persistence.ts'
import type {
  CanonicalAwardId,
  CanonicalChallengeId,
  ReaderParticipationData,
} from '../../src/participation/types.ts'

function buildActiveMonthSlots(yearMonth: string, days: number): MonthSlot[] {
  return Array.from({ length: days }, (_, idx) => {
    const dayOfMonth = idx + 1
    const date = `${yearMonth}-${String(dayOfMonth).padStart(2, '0')}`
    return {
      dayOfMonth,
      date,
      availability: 'available',
      title: `Day ${dayOfMonth}`,
      slug: `slug-${yearMonth}-${dayOfMonth}`,
      challengeId: `cms:doc-${yearMonth}-${dayOfMonth}`,
      challengeType: 'teaching',
    }
  })
}

test('groups 28, 29, 30, and 31-day months into accurate Monday–Sunday calendar weeks', () => {
  // 2026-11 (30 days): Nov 1, 2026 is Sunday -> partial week 1 (Nov 1), week 6 (Nov 30)
  const nov2026 = deriveMonthSlotPresentations(2026, 11, buildActiveMonthSlots('2026-11', 30))
  const novWeeks = groupMonthSlotsByWeek('2026-11', nov2026)
  assert.equal(novWeeks.length, 6)
  assert.equal(novWeeks[0].label, 'Nov 1')
  assert.equal(novWeeks[0].slots.length, 1)
  assert.equal(novWeeks[0].cells[6].dayOfMonth, 1) // Sunday
  assert.equal(novWeeks[0].cells[0].dayOfMonth, null)
  assert.equal(novWeeks[5].label, 'Nov 30')
  assert.equal(novWeeks[5].slots.length, 1)
  assert.equal(novWeeks[5].cells[0].dayOfMonth, 30) // Monday

  // 2096-02 (29 days leap Feb): Feb 1, 2096 is Wednesday -> 5 weeks
  const feb2096 = deriveMonthSlotPresentations(2096, 2, buildActiveMonthSlots('2096-02', 29))
  const feb2096Weeks = groupMonthSlotsByWeek('2096-02', feb2096)
  assert.equal(feb2096Weeks.reduce((sum, w) => sum + w.slots.length, 0), 29)
  assert.equal(feb2096Weeks[0].cells[2].dayOfMonth, 1) // Wednesday (index 2)

  // 2098-02 (28 days non-leap Feb): Feb 1, 2098 is Saturday -> 5 weeks
  const feb2098 = deriveMonthSlotPresentations(2098, 2, buildActiveMonthSlots('2098-02', 28))
  const feb2098Weeks = groupMonthSlotsByWeek('2098-02', feb2098)
  assert.equal(feb2098Weeks.reduce((sum, w) => sum + w.slots.length, 0), 28)
  assert.equal(feb2098Weeks[0].cells[5].dayOfMonth, 1) // Saturday (index 5)

  // 2098-03 (31 days): total 31 slots
  const mar2098 = deriveMonthSlotPresentations(2098, 3, buildActiveMonthSlots('2098-03', 31))
  const mar2098Weeks = groupMonthSlotsByWeek('2098-03', mar2098)
  assert.equal(mar2098Weeks.reduce((sum, w) => sum + w.slots.length, 0), 31)
})

test('derives all permitted slot states with most-recent Continue priority and non-interactive Coming Soon / Unavailable', () => {
  const slots: MonthSlot[] = [
    {
      dayOfMonth: 1,
      date: '2026-11-01',
      availability: 'available',
      title: 'Day 1 Completed',
      slug: 'day-1',
      challengeId: 'cms:doc-1',
      challengeType: 'teaching',
    },
    {
      dayOfMonth: 2,
      date: '2026-11-02',
      availability: 'available',
      title: 'Day 2 Older In Progress',
      slug: 'day-2',
      challengeId: 'cms:doc-2',
      challengeType: 'teaching',
    },
    {
      dayOfMonth: 3,
      date: '2026-11-03',
      availability: 'available',
      title: 'Day 3 Most Recent Continue',
      slug: 'day-3',
      challengeId: 'cms:doc-3',
      challengeType: 'teaching',
    },
    {
      dayOfMonth: 4,
      date: '2026-11-04',
      availability: 'available',
      title: 'Day 4 Unopened',
      slug: 'day-4',
      challengeId: 'cms:doc-4',
      challengeType: 'teaching',
    },
    {
      dayOfMonth: 5,
      date: '2026-11-05',
      availability: 'unavailable',
      formerChallengeId: 'cms:doc-5-withdrawn',
    },
    {
      dayOfMonth: 6,
      date: '2026-11-06',
      availability: 'comingSoon',
      title: 'Day 6 Future Title',
    },
  ]

  const data: ReaderParticipationData = {
    completedChallenges: {
      ['cms:doc-1' as CanonicalChallengeId]: { completedOn: '2026-11-01' },
      ['cms:doc-5-withdrawn' as CanonicalChallengeId]: { completedOn: '2026-11-05' },
    },
    inProgressChallenges: {
      ['cms:doc-2' as CanonicalChallengeId]: { screenId: 's1', updatedOn: '2026-11-02' },
      ['cms:doc-3' as CanonicalChallengeId]: { screenId: 's2', updatedOn: '2026-11-03' },
    },
    savedChallenges: {},
    savedScriptures: [],
    lastOpenedChallenge: {
      challengeId: 'cms:doc-3' as CanonicalChallengeId,
      openedOn: '2026-11-06',
    },
    earnedAwards: {},
  }

  const presentations = deriveMonthSlotPresentations(2026, 11, slots, data)
  assert.equal(presentations[0].status, 'completed')
  assert.equal(presentations[0].interactive, true)
  assert.equal(presentations[1].status, 'inProgress')
  assert.equal(presentations[1].statusLabel, 'In progress')
  assert.equal(presentations[1].interactive, true)
  assert.equal(presentations[2].status, 'continue')
  assert.equal(presentations[2].statusLabel, 'Continue')
  assert.equal(presentations[2].interactive, true)
  assert.equal(presentations[3].status, 'available')
  assert.equal(presentations[3].interactive, true)
  assert.equal(presentations[4].status, 'unavailable')
  assert.equal(presentations[4].interactive, false)
  assert.equal(presentations[4].previouslyCompleted, true)
  assert.equal(presentations[5].status, 'comingSoon')
  assert.equal(presentations[5].interactive, false)
  assert.equal(presentations[5].slug, undefined)

  // Preview slots are strictly non-interactive
  const previewSlots: MonthSlotPreview[] = [
    { dayOfMonth: 1, date: '2027-03-01', title: 'Preview Day 1', availability: 'comingSoon' },
    { dayOfMonth: 2, date: '2027-03-02', availability: 'unavailable' },
  ]
  const previewPresentations = deriveMonthSlotPresentations(2027, 3, previewSlots, data)
  assert.equal(previewPresentations[0].status, 'comingSoon')
  assert.equal(previewPresentations[0].interactive, false)
  assert.equal(previewPresentations[1].status, 'unavailable')
  assert.equal(previewPresentations[1].interactive, false)
})

test('extracts canonical cms: completed IDs intersected with month slots and enforces 500-ID cap', () => {
  const completedChallenges: Record<CanonicalChallengeId, { readonly completedOn: '2026-11-01' }> = {}
  for (let i = 1; i <= 650; i++) {
    completedChallenges[`cms:other-month-${i}` as CanonicalChallengeId] = { completedOn: '2026-11-01' }
  }
  completedChallenges['cms:doc-2026-11-1' as CanonicalChallengeId] = { completedOn: '2026-11-01' }
  completedChallenges['cms:doc-2026-11-5' as CanonicalChallengeId] = { completedOn: '2026-11-01' }

  const data: ReaderParticipationData = {
    ...emptyReaderParticipationData(),
    completedChallenges,
  }

  const monthSlots = buildActiveMonthSlots('2026-11', 30)
  const filtered = extractCompletedCmsChallengeIdsForMonth(data, monthSlots)
  assert.deepEqual(filtered, ['cms:doc-2026-11-1', 'cms:doc-2026-11-5'])

  // Without slot filter, still strictly capped at 500
  const uncappedInput = extractCompletedCmsChallengeIdsForMonth(data)
  assert.equal(uncappedInput.length, MAX_MONTH_PROGRESS_IDS)
})

test('orders thematic discoveries first and fullMonth strictly last without leaking card art', () => {
  const summaries = [
    {
      discoveryId: 'discovery:2026-11:full-month',
      kind: 'fullMonth' as const,
      title: 'Complete November',
      targetCount: 30,
    },
    {
      discoveryId: 'discovery:2026-11:motif-a',
      kind: 'thematic' as const,
      title: 'Motif A',
      targetCount: 3,
    },
  ]

  const progress: MonthProgressData = {
    monthId: '2026-11',
    rosterVersion: 1,
    completedInMonthCount: 3,
    totalChallenges: 30,
    thematicEarnedCount: 1,
    thematicTotalCount: 1,
    discoveries: [
      {
        discoveryId: 'discovery:2026-11:motif-a',
        kind: 'thematic',
        title: 'Motif A',
        achievedCount: 3,
        targetCount: 3,
        isEarned: true,
        awardId: 'card:monthly:2026-11:motif-a',
      },
      {
        discoveryId: 'discovery:2026-11:full-month',
        kind: 'fullMonth',
        title: 'Complete November',
        achievedCount: 3,
        targetCount: 30,
        isEarned: false,
      },
    ],
  }

  const resolved = resolveMonthDiscoveryPresentations(summaries, progress, '2026-11')
  assert.equal(resolved.length, 2)
  assert.equal(resolved[0].kind, 'thematic')
  assert.equal(resolved[0].achievedCount, 3)
  assert.equal(resolved[0].isEarned, true)
  assert.equal(resolved[0].hasCardDisplay, false)
  assert.equal(resolved[1].kind, 'fullMonth')
  assert.equal(resolved[1].achievedCount, 3)
  assert.equal(resolved[1].targetCount, 30)
  assert.equal(resolved[1].isEarned, false)

  // Stale progress for another month is ignored
  const stale = resolveMonthDiscoveryPresentations(summaries, progress, '2026-10')
  assert.equal(stale[0].achievedCount, 0)
  assert.equal(stale[0].isEarned, false)

  const storedAward = {
    awardId: 'card:monthly:2026-11:motif-a' as CanonicalAwardId,
    discoveryId: 'discovery:2026-11:motif-a',
    earnedOn: parseLocalCalendarDate('2026-11-09')!,
  }
  const storedData = {
    ...emptyReaderParticipationData(),
    earnedAwards: {
      [storedAward.awardId]: {
        ...storedAward,
        kind: 'thematic' as const,
        publicationYearMonth: parsePublicationYearMonth('2026-11')!,
        hubAnnouncementAcked: true,
        cardViewed: false,
      },
    },
  }
  const recomputedUnearned = {
    ...progress,
    discoveries: progress.discoveries.map(discovery => {
      if (discovery.discoveryId !== 'discovery:2026-11:motif-a') return discovery
      return {
        discoveryId: discovery.discoveryId,
        kind: discovery.kind,
        title: discovery.title,
        achievedCount: discovery.achievedCount,
        targetCount: discovery.targetCount,
        isEarned: false,
      }
    }),
  }
  const retained = resolveMonthDiscoveryPresentations(
    summaries,
    recomputedUnearned,
    '2026-11',
    storedData,
  )
  assert.equal(retained[0].isEarned, true)
  assert.equal(retained[0].hasCardDisplay, false)

  const ticker = deriveMonthCompletionSummary(30, [], progress, '2026-11')
  assert.equal(ticker.label, '3 of 30 Challenges')
})

test('manages month intro preview vs Welcome eligibility, Skip to Welcome, newer-schema protection, and reset', async () => {
  // 1. Preview seen does NOT mark Welcome seen; Skip to Welcome enabled on month start
  let env = emptyMonthIntroEnvelope()
  env = markMonthPreviewSeenInEnvelope(env, '2027-03', 'v1-preview')
  const record = env.months['2027-03']
  assert.equal(record?.previewSeen, true)
  assert.equal(record?.welcomeSeen, false)

  assert.deepEqual(resolveMonthIntroDecision('advancePreview', 'v1-preview', record), {
    showAutomatically: false,
    mode: 'preview',
    canSkipToWelcome: false,
  })
  assert.deepEqual(resolveMonthIntroDecision('active', 'v1-detail', record), {
    showAutomatically: true,
    mode: 'active',
    canSkipToWelcome: true,
  })

  // 2. Completing Welcome marks Welcome seen while keeping previewSeen
  env = markMonthWelcomeSeenInEnvelope(env, '2027-03', 'v1-detail')
  assert.deepEqual(resolveMonthIntroDecision('active', 'v1-detail', env.months['2027-03']), {
    showAutomatically: false,
    mode: 'active',
    canSkipToWelcome: true,
  })

  // 3. Historical first visit shows intro+Welcome automatically without Skip to Welcome
  assert.deepEqual(resolveMonthIntroDecision('historical', 'v1-hist', undefined), {
    showAutomatically: true,
    mode: 'active',
    canSkipToWelcome: false,
  })

  // 4. Corrupt and newer-schema safety + store clear()
  assert.equal(parseMonthIntroEnvelope('{bad json').health, 'corruptStoredData')
  assert.equal(
    parseMonthIntroEnvelope(JSON.stringify({ schemaVersion: 2, months: {} })).health,
    'unsupportedNewerSchema',
  )

  const backing = new Map<string, string>()
  backing.set(MONTH_INTRO_STORAGE_KEY, JSON.stringify({ schemaVersion: 2, months: { '2027-03': { welcomeSeen: true } } }))
  const driver: KeyValueStorageDriver = {
    getItem: async key => backing.get(key) ?? null,
    setItem: async (key, val) => {
      backing.set(key, val)
    },
    removeItem: async key => {
      backing.delete(key)
    },
  }
  const store = createMonthIntroStore(driver)
  const blockedWrite = await store.markWelcomeSeen('2027-03', 'v1')
  assert.equal(blockedWrite.health, 'unsupportedNewerSchema')
  assert.match(backing.get(MONTH_INTRO_STORAGE_KEY) ?? '', /"schemaVersion":2/)

  await store.clear()
  assert.equal(backing.has(MONTH_INTRO_STORAGE_KEY), false)
  const afterClear = await store.markWelcomeSeen('2027-03', 'v1')
  assert.equal(afterClear.health, 'ok')
  assert.equal(afterClear.envelope.months['2027-03']?.welcomeSeen, true)

  // 5. Failed storage remove reports { ok: false, health: 'storageUnavailable' } without throwing
  const failingDriver: KeyValueStorageDriver = {
    getItem: async key => backing.get(key) ?? null,
    setItem: async (key, val) => {
      backing.set(key, val)
    },
    removeItem: async () => {
      throw new Error('Injected storage failure')
    },
  }
  const failingStore = createMonthIntroStore(failingDriver)
  const failedClear = await failingStore.clear()
  assert.deepEqual(failedClear, { ok: false, health: 'storageUnavailable' })
  assert.equal(backing.has(MONTH_INTRO_STORAGE_KEY), true)
})

test('computes adjacent yearMonths cleanly across year boundaries', () => {
  assert.deepEqual(getAdjacentYearMonths('2026-01'), { previous: '2025-12', next: '2026-02' })
  assert.deepEqual(getAdjacentYearMonths('2026-12'), { previous: '2026-11', next: '2027-01' })
})
