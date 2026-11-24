import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type {
  MonthDetailData,
  MonthDetailResult,
  MonthSlot,
} from '../../src/cms/reader/monthProvider.ts'
import type { HubContinueResult } from '../../src/hubContinue/types.ts'
import { emptyReaderParticipationData, reduceParticipationCommand } from '../../src/participation/model.ts'
import type {
  CanonicalChallengeId,
  LocalCalendarDate,
  PublicationYearMonth,
  ReaderParticipationData,
} from '../../src/participation/types.ts'
import {
  deriveTodayPrimaryAction,
  loadAuthorizedTodayMonth,
  type TodayPrimaryActionInput,
} from '../../src/readerShell/today/index.ts'

const cmsId = (base: string) => `cms:${base}` as CanonicalChallengeId
const day = (value: string) => value as LocalCalendarDate
const ym = (value: string) => value as PublicationYearMonth

function available(dayOfMonth: number, base: string, yearMonth = '2026-11'): MonthSlot {
  return {
    dayOfMonth,
    date: `${yearMonth}-${String(dayOfMonth).padStart(2, '0')}`,
    availability: 'available',
    title: `Teaching ${dayOfMonth}`,
    slug: `teaching-${base}`,
    challengeId: base,
    challengeType: 'teaching',
  }
}

function comingSoon(dayOfMonth: number, yearMonth = '2026-11'): MonthSlot {
  return {
    dayOfMonth,
    date: `${yearMonth}-${String(dayOfMonth).padStart(2, '0')}`,
    availability: 'comingSoon',
    title: `Embargoed preview ${dayOfMonth}`,
  }
}

function withdrawn(dayOfMonth: number, yearMonth = '2026-11'): MonthSlot {
  return {
    dayOfMonth,
    date: `${yearMonth}-${String(dayOfMonth).padStart(2, '0')}`,
    availability: 'unavailable',
    formerChallengeId: 'withdrawn-doc',
  }
}

function monthDetail(slots: readonly MonthSlot[], yearMonth = '2026-11', overrides: Partial<MonthDetailData> = {}): MonthDetailData {
  const [year, month] = yearMonth.split('-').map(Number)
  return {
    monthId: yearMonth,
    documentId: `month-${yearMonth}`,
    year,
    month,
    daysInMonth: new Date(Date.UTC(year, month, 0)).getUTCDate(),
    phase: 'active',
    rosterVersion: 1,
    totalChallenges: slots.length,
    title: 'Rejoice Always',
    introduction: { version: '1', previewScreens: [], welcomeScreen: { id: 'welcome', blocks: [] } },
    slots,
    discoveries: [],
    ...overrides,
  }
}

function ready(month: MonthDetailData, authorizedLocalDate: string): MonthDetailResult {
  return {
    status: 'ready',
    month,
    serverContext: { authorizedLocalDate, effectiveTimeZone: 'America/New_York' },
    source: 'gateway',
  }
}

const empty = emptyReaderParticipationData()

function inProgress(base: string): ReaderParticipationData {
  return reduceParticipationCommand(empty, {
    type: 'saveChallengeProgress',
    challengeId: cmsId(base),
    screenId: 'screen-2',
    updatedOn: day('2026-11-22'),
  })
}

function completed(base: string): ReaderParticipationData {
  return reduceParticipationCommand(inProgress(base), {
    type: 'completeChallenge',
    challengeId: cmsId(base),
    completedOn: day('2026-11-22'),
  })
}

const NOV = monthDetail([available(21, 'nov21'), available(22, 'nov22'), comingSoon(23), withdrawn(24)])

function derive(overrides: Partial<TodayPrimaryActionInput> = {}) {
  return deriveTodayPrimaryAction({
    currentMonth: ready(NOV, '2026-11-22'),
    participationData: empty,
    ...overrides,
  })
}

describe('Amber Causeway — Today primary action projection', () => {
  it('opens today\'s authorized unstarted Challenge directly with a Today origin', () => {
    const result = derive()
    assert.equal(result.source, 'gateway')
    assert.equal(result.primary.status, 'challenge')
    if (result.primary.status !== 'challenge') return
    assert.equal(result.primary.challenge.challengeId, cmsId('nov22'))
    assert.equal(result.primary.challenge.publicationDate, '2026-11-22')
    assert.equal(result.primary.challenge.participation, 'notStarted')
    assert.equal(result.primary.isCompleted, false)
    assert.deepEqual(result.primary.action, {
      type: 'openChallenge',
      challengeId: cmsId('nov22'),
      slug: 'teaching-nov22',
      expectedDocumentId: 'nov22',
      entry: 'start',
      origin: { kind: 'hub' },
      bypassesMonthIntro: true,
    })
    assert.deepEqual(result.context, {
      yearMonth: ym('2026-11'),
      authorizedLocalDate: day('2026-11-22'),
      effectiveTimeZone: 'America/New_York',
      monthTitle: 'Rejoice Always',
    })
    assert.deepEqual(result.currentMonthLink, { type: 'openMonth', yearMonth: '2026-11' })
    assert.equal(result.secondary, null)
  })

  it('valid unfinished Challenge yields a resume intent without exposing the saved screen', () => {
    const result = derive({ participationData: inProgress('nov22') })
    assert.equal(result.primary.status, 'challenge')
    if (result.primary.status !== 'challenge') return
    assert.equal(result.primary.challenge.participation, 'inProgress')
    assert.equal(result.primary.action.entry, 'resume')
    assert.equal(JSON.stringify(result).includes('screen-2'), false)
  })

  it('completed Challenge yields Completed + Read Again for the same authorized Challenge without mutation', () => {
    const data = completed('nov22')
    const before = JSON.stringify(data)
    const result = derive({ participationData: data })
    assert.equal(result.primary.status, 'challenge')
    if (result.primary.status !== 'challenge') return
    assert.equal(result.primary.isCompleted, true)
    assert.equal(result.primary.challenge.participation, 'completed')
    assert.equal(result.primary.action.entry, 'readAgain')
    assert.equal(result.primary.action.challengeId, cmsId('nov22'))
    assert.equal(result.primary.action.bypassesMonthIntro, true)
    assert.equal(JSON.stringify(data), before)
    assert.deepEqual(result.currentMonthLink, { type: 'openMonth', yearMonth: '2026-11' })
  })

  it('participation on other days never changes today\'s status', () => {
    const result = derive({ participationData: completed('nov21') })
    assert.equal(result.primary.status === 'challenge' && result.primary.challenge.participation, 'notStarted')
  })

  it('selects only from the gateway authorized local date, including month edges', () => {
    const first = monthDetail([available(1, 'dec1', '2026-12'), available(2, 'dec2', '2026-12')], '2026-12')
    const startResult = deriveTodayPrimaryAction({ currentMonth: ready(first, '2026-12-01'), participationData: empty })
    assert.equal(startResult.primary.status === 'challenge' && startResult.primary.challenge.challengeId, cmsId('dec1'))

    const last = monthDetail([available(29, 'nov29'), available(30, 'nov30')])
    const endResult = deriveTodayPrimaryAction({ currentMonth: ready(last, '2026-11-30'), participationData: empty })
    assert.equal(endResult.primary.status === 'challenge' && endResult.primary.challenge.challengeId, cmsId('nov30'))

    const leap = monthDetail([available(29, 'feb29', '2028-02')], '2028-02')
    const leapResult = deriveTodayPrimaryAction({ currentMonth: ready(leap, '2028-02-29'), participationData: empty })
    assert.equal(leapResult.primary.status === 'challenge' && leapResult.primary.challenge.challengeId, cmsId('feb29'))
  })

  it('rejects a Month detail that is not the authorized date\'s month (stale across rollover)', () => {
    const result = deriveTodayPrimaryAction({ currentMonth: ready(NOV, '2026-12-01'), participationData: empty })
    assert.equal(result.primary.status, 'unavailable')
    assert.equal(result.primary.status === 'unavailable' && result.primary.reason, 'unauthorizedContext')
    assert.equal(result.primary.action, null)
    assert.equal(result.context, null)
    assert.equal(result.currentMonthLink, null)
    assert.equal(JSON.stringify(result).includes('teaching-'), false)
  })

  it('sparse day with no scheduled Challenge → Explore This Month', () => {
    const sparse = monthDetail([available(21, 'nov21'), available(25, 'nov25')])
    const result = deriveTodayPrimaryAction({ currentMonth: ready(sparse, '2026-11-22'), participationData: empty })
    assert.deepEqual(result.primary, {
      status: 'exploreMonth',
      reason: 'noChallengeScheduled',
      action: { type: 'openMonth', yearMonth: '2026-11' },
    })
    assert.deepEqual(result.currentMonthLink, { type: 'openMonth', yearMonth: '2026-11' })
  })

  it('currently unreleased slot → Explore This Month; preview title never becomes a Challenge or CTA', () => {
    const result = derive({ currentMonth: ready(NOV, '2026-11-23') })
    assert.equal(result.primary.status, 'exploreMonth')
    assert.equal(result.primary.status === 'exploreMonth' && result.primary.reason, 'notYetReleased')
    assert.equal(JSON.stringify(result).includes('Embargoed preview'), false)
  })

  it('withdrawn slot → Explore This Month without exposing former Challenge identity', () => {
    const result = derive({ currentMonth: ready(NOV, '2026-11-24') })
    assert.equal(result.primary.status === 'exploreMonth' && result.primary.reason, 'withdrawn')
    assert.equal(JSON.stringify(result).includes('withdrawn-doc'), false)
  })

  it('only availability === "available" produces a Challenge-open intent', () => {
    for (const availability of ['comingSoon', 'unavailable', 'released', undefined, 'AVAILABLE']) {
      const slot = { ...available(22, 'nov22'), availability } as unknown as MonthSlot
      const result = deriveTodayPrimaryAction({ currentMonth: ready(monthDetail([slot]), '2026-11-22'), participationData: empty })
      assert.notEqual(result.primary.status, 'challenge', String(availability))
      assert.equal(JSON.stringify(result).includes('openChallenge'), false)
    }
  })

  it('malformed available slots fail closed to Explore This Month', () => {
    const base = available(22, 'nov22')
    const malformed: unknown[] = [
      { ...base, slug: '  ' },
      { ...base, title: '' },
      { ...base, challengeId: 'drafts.nov22' },
      { ...base, challengeId: 'fixture-challenge-document' },
      { ...base, challengeId: 42 },
      { ...base, challengeType: 'quiz' },
      { ...base, dayOfMonth: 21 },
      { ...base, date: '2026-11-21' },
    ]
    for (const slot of malformed) {
      const result = deriveTodayPrimaryAction({
        currentMonth: ready(monthDetail([slot as MonthSlot]), '2026-11-22'),
        participationData: empty,
      })
      assert.equal(result.primary.status, 'exploreMonth', JSON.stringify(slot))
      assert.equal(result.primary.status === 'exploreMonth' && result.primary.reason, 'invalidSlot')
    }

    const duplicate = monthDetail([available(22, 'nov22'), { ...available(22, 'other') }])
    const dup = deriveTodayPrimaryAction({ currentMonth: ready(duplicate, '2026-11-22'), participationData: empty })
    assert.equal(dup.primary.status === 'exploreMonth' && dup.primary.reason, 'ambiguousSlot')
  })

  it('malformed or unauthorized Month context exposes no month ID and no Challenge data', () => {
    const cases: MonthDetailResult[] = [
      ready(NOV, 'not-a-date'),
      ready(NOV, '2026-11-31'),
      { ...ready(NOV, '2026-11-22'), serverContext: undefined } as unknown as MonthDetailResult,
      { ...ready(NOV, '2026-11-22'), serverContext: { authorizedLocalDate: '2026-11-22', effectiveTimeZone: '' } },
      ready(monthDetail(NOV.slots, '2026-11', { phase: 'historical' }), '2026-11-22'),
      ready(monthDetail(NOV.slots, '2026-11', { title: '  ' }), '2026-11-22'),
      ready({ ...NOV, slots: undefined } as unknown as MonthDetailData, '2026-11-22'),
      ready({ ...NOV, monthId: '2026-11 ' }, '2026-11-22'),
      { ...ready(NOV, '2026-11-22'), source: 'sanity' } as unknown as MonthDetailResult,
      { ...ready(NOV, '2026-11-22'), month: null } as unknown as MonthDetailResult,
    ]
    for (const currentMonth of cases) {
      const result = deriveTodayPrimaryAction({ currentMonth, participationData: completed('nov22') })
      assert.equal(result.primary.status, 'unavailable', JSON.stringify(currentMonth).slice(0, 120))
      assert.equal(result.context, null)
      assert.equal(result.currentMonthLink, null)
      const text = JSON.stringify(result)
      assert.equal(text.includes('nov22'), false)
      assert.equal(text.includes('2026-11'), false)
    }
  })

  it('month not published (gateway notFound) is a neutral unavailable state', () => {
    const result = derive({ currentMonth: { status: 'notFound', source: 'gateway' } })
    assert.deepEqual(result.primary, { status: 'unavailable', reason: 'monthNotPublished', action: null })
    assert.equal(result.currentMonthLink, null)
  })

  it('gateway request and validation failures → distinct retryable error states', () => {
    const request = derive({ currentMonth: { status: 'requestError', message: 'offline', source: 'gateway' } })
    assert.deepEqual(request.primary, { status: 'error', reason: 'requestError', action: { type: 'retry' } })
    assert.equal(request.currentMonthLink, null)
    assert.equal(JSON.stringify(request).includes('offline'), false)

    const validation = derive({
      currentMonth: { status: 'validationError', message: 'bad', issues: ['x'], source: 'gateway' },
    })
    assert.deepEqual(validation.primary, { status: 'error', reason: 'validationError', action: { type: 'retry' } })

    const garbage = deriveTodayPrimaryAction({ currentMonth: { status: 'surprise' } as unknown as MonthDetailResult })
    assert.equal(garbage.primary.status, 'error')
    const missing = deriveTodayPrimaryAction(null as unknown as TodayPrimaryActionInput)
    assert.equal(missing.primary.status, 'error')
  })

  it('loading month is distinct; hydrating participation keeps the month link but no Challenge CTA', () => {
    const loading = derive({ currentMonth: { status: 'loading' } })
    assert.deepEqual(loading.primary, { status: 'loading', action: null })
    assert.equal(loading.currentMonthLink, null)

    const hydrating = derive({ participationData: null })
    assert.deepEqual(hydrating.primary, { status: 'loading', action: null })
    assert.deepEqual(hydrating.currentMonthLink, { type: 'openMonth', yearMonth: '2026-11' })
  })

  it('malformed participation maps never throw and never fabricate completion', () => {
    const broken = { ...empty, completedChallenges: null, inProgressChallenges: 'x' } as unknown as ReaderParticipationData
    const result = derive({ participationData: broken })
    assert.equal(result.primary.status === 'challenge' && result.primary.challenge.participation, 'notStarted')
  })

  it('is deterministic, frozen and never reads device time', () => {
    const realNow = Date.now
    Date.now = () => { throw new Error('device clock read') }
    try {
      const a = derive({ participationData: inProgress('nov22') })
      const b = derive({ participationData: inProgress('nov22') })
      assert.deepEqual(a, b)
      assert.equal(Object.isFrozen(a), true)
      assert.equal(Object.isFrozen(a.primary), true)
      assert.equal(Object.isFrozen(a.primary.action), true)
    } finally {
      Date.now = realNow
    }
  })

  describe('secondary Hub Continue composition', () => {
    const resume: HubContinueResult = {
      status: 'suggestion',
      reason: 'inProgressInActiveFocus',
      suggestion: {
        kind: 'resumeInProgress',
        yearMonth: ym('2026-09'),
        monthTitle: 'September Theme',
        monthHeading: 'September 2026',
        formalFocusMonth: ym('2026-09'),
        preservesFormalFocus: true,
        challengeId: cmsId('sep3'),
        challengeDocumentId: 'sep3',
        challengeSlug: 'sep-3',
        challengeTitle: 'Day 3 Teaching',
        challengeType: 'teaching',
        dayOfMonth: 3,
        publicationDate: '2026-09-03',
        isInProgress: true,
        resumeScreenId: 'screen-9',
        origin: { kind: 'hub' },
      },
    }

    it('passes through the single G01 resume suggestion as a resume intent', () => {
      const result = derive({ hubContinue: resume })
      assert.deepEqual(result.secondary, {
        kind: 'continueChallenge',
        yearMonth: '2026-09',
        monthHeading: 'September 2026',
        challengeTitle: 'Day 3 Teaching',
        action: {
          type: 'openChallenge',
          challengeId: cmsId('sep3'),
          slug: 'sep-3',
          expectedDocumentId: 'sep3',
          entry: 'resume',
          origin: { kind: 'hub' },
          bypassesMonthIntro: true,
        },
      })
      assert.equal(JSON.stringify(result.secondary).includes('screen-9'), false)
    })

    it('maps openFocusMonth / reviewFocusMonth to Month intents and keeps them independent of primary failures', () => {
      for (const kind of ['openFocusMonth', 'reviewFocusMonth'] as const) {
        const hubContinue: HubContinueResult = {
          status: 'suggestion',
          reason: kind === 'openFocusMonth' ? 'noSavedChallengeInActiveFocus' : 'activeFocusComplete',
          suggestion: {
            kind,
            yearMonth: ym('2026-08'),
            monthTitle: 'August',
            monthHeading: 'August 2026',
            formalFocusMonth: ym('2026-08'),
            preservesFormalFocus: true,
          },
        }
        const result = derive({ currentMonth: { status: 'requestError', message: 'x', source: 'gateway' }, hubContinue })
        assert.deepEqual(result.secondary, {
          kind,
          yearMonth: '2026-08',
          monthHeading: 'August 2026',
          action: { type: 'openMonth', yearMonth: '2026-08' },
        })
      }
    })

    it('no suggestion, malformed input or duplicates of current teaching produce no secondary entry', () => {
      assert.equal(derive({ hubContinue: { status: 'none', suggestion: null, reason: 'noActiveFocus' } }).secondary, null)
      assert.equal(derive({ hubContinue: { status: 'suggestion' } as unknown as HubContinueResult }).secondary, null)
      const sameMonth = { ...resume, suggestion: { ...resume.suggestion, yearMonth: ym('2026-11') } } as HubContinueResult
      assert.equal(derive({ hubContinue: sameMonth }).secondary, null)
      const sameChallenge = {
        ...resume,
        suggestion: { ...resume.suggestion, challengeId: cmsId('nov22') },
      } as HubContinueResult
      assert.equal(derive({ hubContinue: sameChallenge }).secondary, null)
      const badSlug = { ...resume, suggestion: { ...resume.suggestion, challengeSlug: '' } } as HubContinueResult
      assert.equal(derive({ hubContinue: badSlug }).secondary, null)
    })
  })
})

describe('Opal Lantern — Gateway month-boundary recovery (loadAuthorizedTodayMonth)', () => {
  const NOV_22 = monthDetail([available(21, 'nov21'), available(22, 'nov22'), comingSoon(23)], '2026-11', {
    title: 'November Theme',
    phase: 'active',
  })
  const DEC_01 = monthDetail([available(1, 'dec1', '2026-12'), comingSoon(2, '2026-12')], '2026-12', {
    title: 'December Theme',
    phase: 'active',
  })

  it('returns the initial Month directly when ready and its authorizedLocalDate matches the bootstrap month', async () => {
    const monthCalls: Array<{ ym: string; tz?: string }> = []
    let newsCalls = 0

    const monthResult = await loadAuthorizedTodayMonth({
      bootstrapYearMonth: '2026-11',
      timeZone: 'America/New_York',
      monthProvider: {
        async loadMonth(yearMonth, options) {
          monthCalls.push({ ym: yearMonth, tz: options?.timeZone })
          return ready(NOV_22, '2026-11-22')
        },
        async loadNews() {
          newsCalls += 1
          return { status: 'notFound', source: 'gateway' }
        },
      },
    })

    assert.equal(monthCalls.length, 1)
    assert.deepEqual(monthCalls[0], { ym: '2026-11', tz: 'America/New_York' })
    assert.equal(newsCalls, 0)
    const action = deriveTodayPrimaryAction({ currentMonth: monthResult, participationData: empty })
    assert.equal(action.primary.status, 'challenge')
    if (action.primary.status === 'challenge') {
      assert.equal(action.primary.challenge.challengeId, cmsId('nov22'))
    }
    assert.deepEqual(action.currentMonthLink, { type: 'openMonth', yearMonth: '2026-11' })
  })

  it('issues at most one corrected Month request when initial Month is ready but authorizedLocalDate is in an adjacent month', async () => {
    const monthCalls: Array<{ ym: string; tz?: string }> = []
    let newsCalls = 0
    const novHistorical = monthDetail([available(30, 'nov30', '2026-11')], '2026-11', {
      phase: 'historical',
      title: 'November Historical',
    })

    const monthResult = await loadAuthorizedTodayMonth({
      bootstrapYearMonth: '2026-11',
      timeZone: 'Pacific/Auckland',
      monthProvider: {
        async loadMonth(yearMonth, options) {
          monthCalls.push({ ym: yearMonth, tz: options?.timeZone })
          if (yearMonth === '2026-11') {
            return {
              status: 'ready',
              month: novHistorical,
              serverContext: { authorizedLocalDate: '2026-12-01', effectiveTimeZone: 'Pacific/Auckland' },
              source: 'gateway',
            }
          }
          return {
            status: 'ready',
            month: DEC_01,
            serverContext: { authorizedLocalDate: '2026-12-01', effectiveTimeZone: 'Pacific/Auckland' },
            source: 'gateway',
          }
        },
        async loadNews() {
          newsCalls += 1
          return { status: 'notFound', source: 'gateway' }
        },
      },
    })

    assert.deepEqual(monthCalls, [
      { ym: '2026-11', tz: 'Pacific/Auckland' },
      { ym: '2026-12', tz: 'Pacific/Auckland' },
    ])
    assert.equal(newsCalls, 0)

    const action = deriveTodayPrimaryAction({ currentMonth: monthResult, participationData: empty })
    assert.equal(action.primary.status, 'challenge')
    if (action.primary.status === 'challenge') {
      assert.equal(action.primary.challenge.challengeId, cmsId('dec1'))
      assert.equal(action.primary.challenge.publicationDate, '2026-12-01')
    }
    assert.deepEqual(action.currentMonthLink, { type: 'openMonth', yearMonth: '2026-12' })
    assert.equal(JSON.stringify(action).includes('nov30'), false)
  })

  it('recovers from an initial 404 without serverContext via validated loadNews() context that identifies a different month', async () => {
    const monthCalls: Array<{ ym: string; tz?: string }> = []
    const newsCalls: Array<{ tz?: string }> = []

    const monthResult = await loadAuthorizedTodayMonth({
      bootstrapYearMonth: '2026-12',
      timeZone: 'America/Los_Angeles',
      monthProvider: {
        async loadMonth(yearMonth, options) {
          monthCalls.push({ ym: yearMonth, tz: options?.timeZone })
          if (yearMonth === '2026-12') {
            return { status: 'notFound', source: 'gateway' }
          }
          return {
            status: 'ready',
            month: NOV_22,
            serverContext: { authorizedLocalDate: '2026-11-22', effectiveTimeZone: 'America/Los_Angeles' },
            source: 'gateway',
          }
        },
        async loadNews(options) {
          newsCalls.push({ tz: options?.timeZone })
          return {
            status: 'ready',
            articles: [],
            serverContext: { authorizedLocalDate: '2026-11-22', effectiveTimeZone: 'America/Los_Angeles' },
            source: 'gateway',
          }
        },
      },
    })

    assert.deepEqual(monthCalls, [
      { ym: '2026-12', tz: 'America/Los_Angeles' },
      { ym: '2026-11', tz: 'America/Los_Angeles' },
    ])
    assert.deepEqual(newsCalls, [{ tz: 'America/Los_Angeles' }])

    const action = deriveTodayPrimaryAction({ currentMonth: monthResult, participationData: empty })
    assert.equal(action.primary.status, 'challenge')
    if (action.primary.status === 'challenge') {
      assert.equal(action.primary.challenge.challengeId, cmsId('nov22'))
    }
    assert.deepEqual(action.currentMonthLink, { type: 'openMonth', yearMonth: '2026-11' })
  })

  it('leaves genuine unpublished Month unavailable without a retry loop when News reports the same unavailable YYYY-MM', async () => {
    const monthCalls: string[] = []
    let newsCalls = 0

    const monthResult = await loadAuthorizedTodayMonth({
      bootstrapYearMonth: '2026-11',
      timeZone: 'America/New_York',
      monthProvider: {
        async loadMonth(yearMonth) {
          monthCalls.push(yearMonth)
          return { status: 'notFound', source: 'gateway' }
        },
        async loadNews() {
          newsCalls += 1
          return {
            status: 'ready',
            articles: [
              {
                id: 'preview-dec',
                documentId: 'news-dec',
                category: 'monthlyPreview',
                publishedOn: '2026-11-28',
                title: 'December Preview',
                summary: 'Upcoming month preview',
                destination: { kind: 'month', monthId: '2026-12' },
              },
            ],
            serverContext: { authorizedLocalDate: '2026-11-28', effectiveTimeZone: 'America/New_York' },
            source: 'gateway',
          }
        },
      },
    })

    // Must not loop on 2026-11 and must ignore News article destinations as Today release authority
    assert.deepEqual(monthCalls, ['2026-11'])
    assert.equal(newsCalls, 1)
    assert.deepEqual(monthResult, { status: 'notFound', source: 'gateway' })
    const action = deriveTodayPrimaryAction({ currentMonth: monthResult, participationData: empty })
    assert.deepEqual(action.primary, { status: 'unavailable', reason: 'monthNotPublished', action: null })
    assert.equal(action.currentMonthLink, null)
  })

  it('fails closed on News failure/invalid context and on unsuccessful, mismatched, or shifting corrected Month responses', async () => {
    // 1. News fails or returns notFound after initial Month 404 -> neutral unavailable (monthNotPublished), no second Month request
    for (const newsOutcome of [
      { status: 'notFound', source: 'gateway' } as const,
      { status: 'requestError', message: 'news down', source: 'gateway' } as const,
      { status: 'validationError', message: 'bad news', source: 'gateway' } as const,
    ]) {
      const monthCalls: string[] = []
      const res = await loadAuthorizedTodayMonth({
        bootstrapYearMonth: '2026-11',
        monthProvider: {
          async loadMonth(ym) {
            monthCalls.push(ym)
            return { status: 'notFound', source: 'gateway' }
          },
          async loadNews() {
            return newsOutcome
          },
        },
      })
      assert.deepEqual(monthCalls, ['2026-11'])
      const action = deriveTodayPrimaryAction({ currentMonth: res, participationData: empty })
      assert.equal(action.primary.status, 'unavailable')
      assert.equal(action.currentMonthLink, null)
    }

    // 2. Authoritative month shifts again during retry (2026-11 -> 2026-12 -> serverContext says 2027-01) -> bounded to 1 retry, fails closed
    const shiftingCalls: string[] = []
    const shiftingRes = await loadAuthorizedTodayMonth({
      bootstrapYearMonth: '2026-11',
      monthProvider: {
        async loadMonth(ym) {
          shiftingCalls.push(ym)
          if (ym === '2026-11') {
            return ready(NOV_22, '2026-12-01')
          }
          return ready(DEC_01, '2027-01-01')
        },
        async loadNews() {
          throw new Error('News should not be called on ready initial month')
        },
      },
    })
    assert.deepEqual(shiftingCalls, ['2026-11', '2026-12'])
    const shiftingAction = deriveTodayPrimaryAction({ currentMonth: shiftingRes, participationData: empty })
    assert.equal(shiftingAction.primary.status, 'unavailable')
    assert.equal(shiftingAction.currentMonthLink, null)
    assert.equal(JSON.stringify(shiftingAction).includes('dec1'), false)
    assert.equal(JSON.stringify(shiftingAction).includes('nov22'), false)

    // 3. Retried Month returns historical phase or mismatched monthId -> fails closed
    const historicalRetryRes = await loadAuthorizedTodayMonth({
      bootstrapYearMonth: '2026-11',
      monthProvider: {
        async loadMonth(ym) {
          if (ym === '2026-11') return ready(NOV_22, '2026-12-01')
          return ready({ ...DEC_01, phase: 'historical' }, '2026-12-01')
        },
        async loadNews() {
          return { status: 'notFound', source: 'gateway' }
        },
      },
    })
    const historicalAction = deriveTodayPrimaryAction({ currentMonth: historicalRetryRes, participationData: empty })
    assert.equal(historicalAction.primary.status, 'unavailable')
    assert.equal(historicalAction.currentMonthLink, null)
  })
})

