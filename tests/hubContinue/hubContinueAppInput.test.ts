import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { MonthDetailData, MonthDetailResult, MonthSlot } from '../../src/cms/reader/monthProvider.ts'
import type { ReleasedCatalogResult, ReleasedCatalogSummary } from '../../src/cms/reader/releasedCatalogProvider.ts'
import { createHubContinueAppInput } from '../../src/appIntegration/hubContinueInput.ts'
import { deriveHubContinueSuggestion } from '../../src/hubContinue/engine.ts'
import { emptyReaderParticipationData } from '../../src/participation/model.ts'
import type { CanonicalChallengeId, LocalCalendarDate, PublicationYearMonth } from '../../src/participation/types.ts'
import type { ReaderParticipationSnapshot } from '../../src/participation/store.ts'
import type { ShelfState } from '../../src/shelf/types.ts'
import type { GuestShelfSnapshot } from '../../src/shelfPersistence/store.ts'
import type { HubContinueAppSources } from '../../src/appIntegration/hubContinueInput.ts'

const yearMonth = (value: string) => value as PublicationYearMonth
const localDate = (value: string) => value as LocalCalendarDate
const cmsId = (baseId: string) => `cms:${baseId}` as CanonicalChallengeId

function makeSlot(day: number, baseId: string, month = '10'): MonthSlot {
  const date = `2026-${month}-${String(day).padStart(2, '0')}`
  const monthSlug = month === '10' ? 'october' : month
  return {
    dayOfMonth: day,
    date,
    availability: 'available',
    title: `Day ${day} Teaching`,
    slug: `${monthSlug}-${day}`,
    challengeId: baseId,
    challengeType: 'teaching',
  }
}

function makeMonthDetail(
  slots: readonly MonthSlot[],
  yearMonth = '2026-10',
): MonthDetailData {
  const [year, month] = yearMonth.split('-').map(Number)
  return {
    monthId: yearMonth,
    documentId: `month-${yearMonth}`,
    year,
    month,
    daysInMonth: 30,
    phase: 'historical',
    rosterVersion: 1,
    totalChallenges: slots.length,
    title: 'October Theme',
    introduction: {
      version: '1',
      previewScreens: [],
      welcomeScreen: { id: 'welcome', blocks: [] },
    },
    slots,
    discoveries: [],
  }
}

function makeCatalogItem(baseId: string, slug: string): ReleasedCatalogSummary {
  return {
    id: slug,
    slug,
    documentId: baseId,
    title: 'Day 1 Teaching',
    challengeType: 'teaching',
    calendarSlot: {
      monthId: '2026-10',
      documentId: 'month-2026-10',
      publicationDate: '2026-10-01',
      dayOfMonth: 1,
    },
    primaryScripture: {
      reference: 'Psalm 23:1',
      translation: 'WEBP',
      textStatus: 'referenceOnly',
      usageRightsConfirmed: false,
      practiceStatus: 'notConfigured',
    },
  }
}

function makeSources(overrides: Partial<HubContinueAppSources> = {}): HubContinueAppSources {
  const monthDetail = makeMonthDetail([makeSlot(1, 'oct-1')])
  const monthResult: MonthDetailResult = {
    status: 'ready',
    month: monthDetail,
    serverContext: {
      authorizedLocalDate: '2026-11-18',
      effectiveTimeZone: 'America/New_York',
    },
    source: 'gateway',
  }
  const shelfState: ShelfState = {
    months: [{ yearMonth: yearMonth('2026-10'), admissionKind: 'readerSelected', isProtected: true }],
    activeFocusMonth: yearMonth('2026-10'),
  }
  const participation: ReaderParticipationSnapshot = {
    status: 'ready',
    data: emptyReaderParticipationData(),
    distinctCompletedCount: 0,
    hasPendingWrites: false,
    health: 'ok',
  }
  const shelf: GuestShelfSnapshot = {
    status: 'ready',
    state: shelfState,
    rolloverWatermark: null,
    hasPendingWrites: false,
    health: 'ok',
  }
  const releasedCatalog: ReleasedCatalogResult = {
    status: 'ready',
    challenges: [makeCatalogItem('oct-1', 'october-1')],
    source: 'gateway',
  }

  return {
    participation,
    shelf,
    monthDetailsByYearMonth: new Map([['2026-10', monthResult]]),
    releasedCatalog,
    ...overrides,
  }
}

describe('createHubContinueAppInput', () => {
  it('adapts current focus and gateway-authorized data into one permitted suggestion', () => {
    const input = createHubContinueAppInput(makeSources())

    assert.ok(input)
    assert.equal(input.referenceCurrentYearMonth, '2026-11')
    const result = deriveHubContinueSuggestion(input)
    assert.equal(result.status, 'suggestion')
    assert.equal(result.suggestion.challengeId, cmsId('oct-1'))
    assert.equal(result.suggestion.origin.kind, 'hub')
  })

  it('fails closed until local stores and all authorized providers are ready', () => {
    const sources = makeSources()
    const cases: HubContinueAppSources[] = [
      { ...sources, participation: null },
      { ...sources, participation: { ...sources.participation!, status: 'hydrating' } },
      { ...sources, shelf: null },
      { ...sources, shelf: { ...sources.shelf!, status: 'hydrating' } },
      { ...sources, shelf: { ...sources.shelf!, health: 'storageUnavailable' } },
      { ...sources, monthDetailsByYearMonth: null },
      { ...sources, releasedCatalog: null },
      { ...sources, releasedCatalog: { status: 'requestError', message: 'offline', source: 'gateway' } },
      {
        ...sources,
        monthDetailsByYearMonth: new Map([
          ['2026-10', { status: 'requestError', message: 'offline', source: 'gateway' }],
        ]),
      },
    ]

    for (const unavailableSources of cases) {
      assert.equal(createHubContinueAppInput(unavailableSources), null)
    }
  })

  it('requires matching month responses and consistent authoritative gateway context', () => {
    const sources = makeSources()
    const wrongMonth = {
      ...sources.monthDetailsByYearMonth!.get('2026-10')!,
      month: { ...makeMonthDetail([makeSlot(1, 'oct-1')]), monthId: '2026-09' },
    } as MonthDetailResult

    assert.equal(
      createHubContinueAppInput({
        ...sources,
        monthDetailsByYearMonth: new Map([['2026-10', wrongMonth]]),
      }),
      null,
    )
  })

  it('requires exact authorized local date and timezone across all focused and Shelf month details', () => {
    const sources = makeSources()
    const shelfState: ShelfState = {
      ...sources.shelf!.state,
      months: [
        ...sources.shelf!.state.months,
        { yearMonth: yearMonth('2026-09'), admissionKind: 'readerSelected', isProtected: true },
      ],
    }
    const octoberResult = sources.monthDetailsByYearMonth!.get('2026-10')!
    const septemberResult: MonthDetailResult = {
      status: 'ready',
      month: makeMonthDetail([makeSlot(1, 'sep-1', '09')], '2026-09'),
      serverContext: {
        authorizedLocalDate: '2026-11-18',
        effectiveTimeZone: 'America/New_York',
      },
      source: 'gateway',
    }

    const matchingContext = createHubContinueAppInput({
      ...sources,
      shelf: { ...sources.shelf!, state: shelfState },
      monthDetailsByYearMonth: new Map([
        ['2026-10', octoberResult],
        ['2026-09', septemberResult],
      ]),
    })
    assert.ok(matchingContext)
    assert.equal(matchingContext.referenceCurrentYearMonth, '2026-11')

    const staleSameMonthContext = createHubContinueAppInput({
      ...sources,
      shelf: { ...sources.shelf!, state: shelfState },
      monthDetailsByYearMonth: new Map([
        ['2026-10', octoberResult],
        [
          '2026-09',
          {
            ...septemberResult,
            serverContext: {
              authorizedLocalDate: '2026-11-01',
              effectiveTimeZone: 'America/New_York',
            },
          },
        ],
      ]),
    })
    assert.equal(staleSameMonthContext, null)
  })

  it('does not turn a stale or unauthorized catalog slot into a suggestion', () => {
    const sources = makeSources({
      releasedCatalog: {
        status: 'ready',
        challenges: [makeCatalogItem('oct-1', 'different-slug')],
        source: 'gateway',
      },
    })
    const input = createHubContinueAppInput(sources)

    assert.ok(input)
    const result = deriveHubContinueSuggestion(input)
    assert.equal(result.status, 'none')
    assert.equal(result.suggestion, null)
  })

  it('preserves deliberate focus instead of using incidental Library activity', () => {
    const sources = makeSources({
      participation: {
        ...makeSources().participation!,
        data: {
          ...emptyReaderParticipationData(),
          lastOpenedChallenge: {
            challengeId: cmsId('library-challenge'),
            openedOn: localDate('2026-11-18'),
          },
        },
      },
    })
    const input = createHubContinueAppInput(sources)

    assert.ok(input)
    const result = deriveHubContinueSuggestion(input)
    assert.equal(result.status, 'suggestion')
    assert.equal(result.suggestion.yearMonth, yearMonth('2026-10'))
    assert.equal(result.suggestion.formalFocusMonth, yearMonth('2026-10'))
  })

  it('rejects mismatched timezones across required months and requires non-shelf activeFocusMonth detail', () => {
    const sources = makeSources()
    const octoberResult = sources.monthDetailsByYearMonth!.get('2026-10')!
    const septemberResult: MonthDetailResult = {
      status: 'ready',
      month: makeMonthDetail([makeSlot(1, 'sep-1', '09')], '2026-09'),
      serverContext: {
        authorizedLocalDate: '2026-11-18',
        effectiveTimeZone: 'America/Los_Angeles',
      },
      source: 'gateway',
    }

    const shelfWithTwoMonths: ShelfState = {
      months: [
        { yearMonth: yearMonth('2026-10'), admissionKind: 'readerSelected', isProtected: true },
        { yearMonth: yearMonth('2026-09'), admissionKind: 'readerSelected', isProtected: true },
      ],
      activeFocusMonth: yearMonth('2026-10'),
    }

    // Mismatched timezone across required months fails closed
    assert.equal(
      createHubContinueAppInput({
        ...sources,
        shelf: { ...sources.shelf!, state: shelfWithTwoMonths },
        monthDetailsByYearMonth: new Map([
          ['2026-10', octoberResult],
          ['2026-09', septemberResult],
        ]),
      }),
      null,
    )

    // Missing detail for an activeFocusMonth outside shelf.months fails closed
    assert.equal(
      createHubContinueAppInput({
        ...sources,
        shelf: {
          ...sources.shelf!,
          state: {
            months: [
              { yearMonth: yearMonth('2026-10'), admissionKind: 'readerSelected', isProtected: true },
            ],
            activeFocusMonth: yearMonth('2026-09'),
          },
        },
        monthDetailsByYearMonth: new Map([['2026-10', octoberResult]]),
      }),
      null,
    )

    // Empty gateway catalog passes adapter cleanly but yields zero suggestions
    const emptyCatalogInput = createHubContinueAppInput({
      ...sources,
      releasedCatalog: { status: 'empty', source: 'gateway' },
    })
    assert.ok(emptyCatalogInput)
    assert.equal(deriveHubContinueSuggestion(emptyCatalogInput).status, 'none')

    // Validation error catalog fails closed
    assert.equal(
      createHubContinueAppInput({
        ...sources,
        releasedCatalog: {
          status: 'validationError',
          message: 'malformed catalog',
          source: 'gateway',
        },
      }),
      null,
    )
  })
})
