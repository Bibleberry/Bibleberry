import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { deriveHubContinueSuggestion } from '../../src/hubContinue/index.ts'
import type { MonthDetailData, MonthSlot } from '../../src/cms/reader/monthProvider.ts'
import type { ReleasedCatalogSummary } from '../../src/cms/reader/releasedCatalogProvider.ts'
import { emptyReaderParticipationData } from '../../src/participation/model.ts'
import type {
  CanonicalChallengeId,
  LocalCalendarDate,
  PublicationYearMonth,
  ReaderParticipationData,
} from '../../src/participation/types.ts'
import { createEmptyShelfState } from '../../src/shelf/policy.ts'
import type { ShelfState } from '../../src/shelf/types.ts'

const ym = (value: string) => value as PublicationYearMonth
const calDate = (value: string) => value as LocalCalendarDate
const cmsId = (baseId: string) => `cms:${baseId}` as CanonicalChallengeId

function makeAvailableSlot(day: number, yearMonth: string, baseId: string, title?: string): MonthSlot {
  const padded = String(day).padStart(2, '0')
  return {
    dayOfMonth: day,
    date: `${yearMonth}-${padded}`,
    availability: 'available',
    title: title ?? `Day ${day} Teaching`,
    slug: `${yearMonth}-day-${padded}`,
    challengeId: baseId,
    challengeType: 'teaching',
  }
}

function makeMonthDetail(
  yearMonth: string,
  slots: readonly MonthSlot[],
  overrides: Partial<MonthDetailData> = {},
): MonthDetailData {
  const [yearStr, monthStr] = yearMonth.split('-')
  return {
    monthId: yearMonth,
    documentId: `month-${yearMonth}`,
    year: Number(yearStr),
    month: Number(monthStr),
    daysInMonth: 30,
    phase: 'historical',
    rosterVersion: 1,
    totalChallenges: slots.filter(slot => slot.availability !== 'unavailable').length,
    title: `Theme for ${yearMonth}`,
    introduction: {
      version: '1',
      previewScreens: [],
      welcomeScreen: { id: 'welcome', blocks: [] },
    },
    slots,
    discoveries: [],
    ...overrides,
  }
}

function makeCatalogItem(yearMonth: string, day: number, baseId: string): ReleasedCatalogSummary {
  const padded = String(day).padStart(2, '0')
  const slug = `${yearMonth}-day-${padded}`
  return {
    id: slug,
    slug,
    documentId: baseId,
    title: `Day ${day} Teaching`,
    challengeType: 'teaching',
    calendarSlot: {
      monthId: yearMonth,
      documentId: `month-${yearMonth}`,
      publicationDate: `${yearMonth}-${padded}`,
      dayOfMonth: day,
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

describe('deriveHubContinueSuggestion', () => {
  it('returns no suggestion when Shelf and active focus are empty', () => {
    const result = deriveHubContinueSuggestion({
      shelfState: createEmptyShelfState(),
      participationData: emptyReaderParticipationData(),
      monthDetailsByYearMonth: {},
      referenceCurrentYearMonth: ym('2026-11'),
    })

    assert.equal(result.status, 'none')
    assert.equal(result.suggestion, null)
    assert.equal(result.reason, 'noActiveFocus')
  })

  it('returns no suggestion when Shelf has months but activeFocusMonth is null', () => {
    const shelfState: ShelfState = {
      months: [
        { yearMonth: ym('2026-10'), admissionKind: 'readerSelected', isProtected: true },
      ],
      activeFocusMonth: null,
    }
    const oct = makeMonthDetail('2026-10', [makeAvailableSlot(1, '2026-10', 'oct-1')])

    const result = deriveHubContinueSuggestion({
      shelfState,
      participationData: emptyReaderParticipationData(),
      monthDetailsByYearMonth: { '2026-10': oct },
      referenceCurrentYearMonth: ym('2026-11'),
    })

    assert.equal(result.status, 'none')
    assert.equal(result.suggestion, null)
    assert.equal(result.reason, 'noActiveFocus')
  })

  it('prioritizes an in-progress Challenge in explicitly active historical focus', () => {
    const shelfState: ShelfState = {
      months: [
        { yearMonth: ym('2026-10'), admissionKind: 'readerSelected', isProtected: true },
      ],
      activeFocusMonth: ym('2026-10'),
    }
    const oct = makeMonthDetail('2026-10', [
      makeAvailableSlot(1, '2026-10', 'oct-1'),
      makeAvailableSlot(2, '2026-10', 'oct-2'),
      makeAvailableSlot(5, '2026-10', 'oct-5', 'Steadfast Hope'),
    ])
    const participationData: ReaderParticipationData = {
      ...emptyReaderParticipationData(),
      inProgressChallenges: {
        [cmsId('oct-5')]: { screenId: 'screen-3', updatedOn: calDate('2026-11-10') },
      },
    }

    const result = deriveHubContinueSuggestion({
      shelfState,
      participationData,
      monthDetailsByYearMonth: { '2026-10': oct },
      serverContext: { authorizedLocalDate: '2026-11-16', effectiveTimeZone: 'America/New_York' },
    })

    assert.equal(result.status, 'suggestion')
    assert.equal(result.reason, 'inProgressInActiveFocus')
    assert.equal(result.suggestion.kind, 'resumeInProgress')
    assert.equal(result.suggestion.challengeId, cmsId('oct-5'))
    assert.equal(result.suggestion.challengeTitle, 'Steadfast Hope')
    assert.equal(result.suggestion.dayOfMonth, 5)
    assert.equal(result.suggestion.isInProgress, true)
    assert.equal(result.suggestion.resumeScreenId, 'screen-3')
    assert.equal(result.suggestion.formalFocusMonth, ym('2026-10'))
    assert.equal(result.suggestion.preservesFormalFocus, true)
    assert.deepEqual(result.suggestion.origin, { kind: 'hub' })
  })

  it('opens the focused Month Screen when there is no unfinished saved Challenge', () => {
    const shelfState: ShelfState = {
      months: [],
      activeFocusMonth: ym('2026-10'), // Library focus without Shelf membership
    }
    const oct = makeMonthDetail('2026-10', [
      makeAvailableSlot(1, '2026-10', 'oct-1'),
      { dayOfMonth: 2, date: '2026-10-02', availability: 'unavailable' },
      { dayOfMonth: 3, date: '2026-10-03', availability: 'comingSoon', title: 'Hidden' },
      makeAvailableSlot(4, '2026-10', 'oct-4', 'Grace in Suffering'),
    ])
    const participationData: ReaderParticipationData = {
      ...emptyReaderParticipationData(),
      completedChallenges: {
        [cmsId('oct-1')]: { completedOn: calDate('2026-10-01') },
      },
    }

    const result = deriveHubContinueSuggestion({
      shelfState,
      participationData,
      monthDetailsByYearMonth: new Map([['2026-10', oct]]),
      referenceCurrentYearMonth: ym('2026-11'),
    })

    assert.equal(result.status, 'suggestion')
    assert.equal(result.suggestion.kind, 'openFocusMonth')
    assert.equal(result.suggestion.yearMonth, ym('2026-10'))
    assert.equal('challengeId' in result.suggestion, false)
  })

  it('offers Review for the completed focus even when another Shelf month has saved progress', () => {
    const shelfState: ShelfState = {
      months: [
        { yearMonth: ym('2026-08'), admissionKind: 'autoAdmitted', isProtected: false },
        { yearMonth: ym('2026-09'), admissionKind: 'readerSelected', isProtected: true },
        { yearMonth: ym('2026-10'), admissionKind: 'readerSelected', isProtected: true },
      ],
      activeFocusMonth: ym('2026-10'),
    }

    const aug = makeMonthDetail('2026-08', [makeAvailableSlot(1, '2026-08', 'aug-1')])
    const sep = makeMonthDetail('2026-09', [
      makeAvailableSlot(1, '2026-09', 'sep-1'),
      makeAvailableSlot(2, '2026-09', 'sep-2', 'Walking by Faith'),
    ])
    const oct = makeMonthDetail('2026-10', [makeAvailableSlot(1, '2026-10', 'oct-1')])

    const participationData: ReaderParticipationData = {
      ...emptyReaderParticipationData(),
      completedChallenges: {
        [cmsId('oct-1')]: { completedOn: calDate('2026-10-05') },
        [cmsId('sep-1')]: { completedOn: calDate('2026-09-02') },
      },
      inProgressChallenges: {
        [cmsId('sep-2')]: { screenId: 'screen-2', updatedOn: calDate('2026-11-12') },
      },
    }

    const result = deriveHubContinueSuggestion({
      shelfState,
      participationData,
      monthDetailsByYearMonth: {
        '2026-08': aug,
        '2026-09': sep,
        '2026-10': oct,
      },
      referenceCurrentYearMonth: ym('2026-11'),
    })

    assert.equal(result.status, 'suggestion')
    assert.equal(result.suggestion.kind, 'reviewFocusMonth')
    assert.equal(result.suggestion.yearMonth, ym('2026-10'))
    assert.equal('challengeId' in result.suggestion, false)
    assert.equal(result.suggestion.formalFocusMonth, ym('2026-10'))
    assert.equal(result.suggestion.preservesFormalFocus, true)
    // Original ShelfState object remains untouched
    assert.equal(shelfState.activeFocusMonth, ym('2026-10'))
  })

  it('still offers Review when all Shelf months are complete', () => {
    const shelfState: ShelfState = {
      months: [
        { yearMonth: ym('2026-09'), admissionKind: 'readerSelected', isProtected: true },
        { yearMonth: ym('2026-10'), admissionKind: 'readerSelected', isProtected: true },
      ],
      activeFocusMonth: ym('2026-10'),
    }

    const sep = makeMonthDetail('2026-09', [makeAvailableSlot(1, '2026-09', 'sep-1')])
    const oct = makeMonthDetail('2026-10', [makeAvailableSlot(1, '2026-10', 'oct-1')])
    const participationData: ReaderParticipationData = {
      ...emptyReaderParticipationData(),
      completedChallenges: {
        [cmsId('sep-1')]: { completedOn: calDate('2026-09-01') },
        [cmsId('oct-1')]: { completedOn: calDate('2026-10-01') },
      },
    }

    const result = deriveHubContinueSuggestion({
      shelfState,
      participationData,
      monthDetailsByYearMonth: { '2026-09': sep, '2026-10': oct },
      referenceCurrentYearMonth: ym('2026-11'),
    })

    assert.equal(result.status, 'suggestion')
    assert.equal(result.suggestion.kind, 'reviewFocusMonth')
    assert.equal(result.suggestion.yearMonth, ym('2026-10'))
    assert.equal(result.reason, 'activeFocusComplete')
  })

  it('keeps incidental Library browsing (lastOpenedChallenge) separate from active focus', () => {
    const shelfState: ShelfState = {
      months: [{ yearMonth: ym('2026-10'), admissionKind: 'readerSelected', isProtected: true }],
      activeFocusMonth: ym('2026-10'),
    }
    const aug = makeMonthDetail('2026-08', [makeAvailableSlot(1, '2026-08', 'aug-1')])
    const oct = makeMonthDetail('2026-10', [makeAvailableSlot(1, '2026-10', 'oct-1')])

    const participationData: ReaderParticipationData = {
      ...emptyReaderParticipationData(),
      lastOpenedChallenge: {
        challengeId: cmsId('aug-1'),
        openedOn: calDate('2026-11-15'),
      },
    }

    const result = deriveHubContinueSuggestion({
      shelfState,
      participationData,
      monthDetailsByYearMonth: { '2026-08': aug, '2026-10': oct },
      referenceCurrentYearMonth: ym('2026-11'),
    })

    assert.equal(result.status, 'suggestion')
    assert.equal(result.suggestion.yearMonth, ym('2026-10'))
    assert.equal(result.suggestion.kind, 'openFocusMonth')
  })

  it('rejects current/future activeFocusMonth and non-historical month phase', () => {
    const currentFocusShelf: ShelfState = {
      months: [],
      activeFocusMonth: ym('2026-11'),
    }
    const nov = makeMonthDetail(
      '2026-11',
      [makeAvailableSlot(1, '2026-11', 'nov-1')],
      { phase: 'active' },
    )

    const currentResult = deriveHubContinueSuggestion({
      shelfState: currentFocusShelf,
      participationData: emptyReaderParticipationData(),
      monthDetailsByYearMonth: { '2026-11': nov },
      referenceCurrentYearMonth: ym('2026-11'),
    })
    assert.equal(currentResult.status, 'none')
    assert.equal(currentResult.reason, 'activeFocusNotHistorical')

    // Even if activeFocusMonth is historical, a monthDetail with phase !== 'historical' is rejected
    const badPhaseShelf: ShelfState = {
      months: [],
      activeFocusMonth: ym('2026-10'),
    }
    const badPhaseResult = deriveHubContinueSuggestion({
      shelfState: badPhaseShelf,
      participationData: emptyReaderParticipationData(),
      monthDetailsByYearMonth: {
        '2026-10': makeMonthDetail('2026-10', [makeAvailableSlot(1, '2026-10', 'oct-1')], {
          phase: 'active',
        }),
      },
      referenceCurrentYearMonth: ym('2026-11'),
    })
    assert.equal(badPhaseResult.status, 'none')
    assert.equal(badPhaseResult.reason, 'activeFocusUnavailable')
  })

  it('enforces releasedCatalog verification when provided and rejects drafts/unreleased slots', () => {
    const shelfState: ShelfState = {
      months: [],
      activeFocusMonth: ym('2026-10'),
    }
    const oct = makeMonthDetail('2026-10', [
      makeAvailableSlot(1, '2026-10', 'drafts.secret-1'),
      makeAvailableSlot(2, '2026-10', 'oct-unlisted'),
      makeAvailableSlot(3, '2026-10', 'oct-3', 'Authorized Day 3'),
    ])

    const result = deriveHubContinueSuggestion({
      shelfState,
      participationData: {
        ...emptyReaderParticipationData(),
        inProgressChallenges: {
          [cmsId('oct-unlisted')]: { screenId: 'screen-3', updatedOn: calDate('2026-11-10') },
          [cmsId('oct-3')]: { screenId: 'screen-2', updatedOn: calDate('2026-11-09') },
        },
      },
      monthDetailsByYearMonth: { '2026-10': oct },
      releasedCatalog: [makeCatalogItem('2026-10', 3, 'oct-3')],
      referenceCurrentYearMonth: ym('2026-11'),
    })

    assert.equal(result.status, 'suggestion')
    assert.equal(result.suggestion.kind, 'resumeInProgress')
    assert.equal(result.suggestion.challengeId, cmsId('oct-3'))
    assert.equal(result.suggestion.dayOfMonth, 3)
  })

  it('opens the focus month for missing, malformed, withdrawn, or mismatched saved progress', () => {
    const oct = makeMonthDetail('2026-10', [
      makeAvailableSlot(1, '2026-10', 'oct-1'),
      makeAvailableSlot(2, '2026-10', 'oct-2'),
      makeAvailableSlot(3, '2026-10', 'oct-3'),
      makeAvailableSlot(4, '2026-10', 'oct-4'),
    ])

    const result = deriveHubContinueSuggestion({
      shelfState: { months: [], activeFocusMonth: ym('2026-10') },
      participationData: {
        ...emptyReaderParticipationData(),
        inProgressChallenges: {
          [cmsId('oct-1')]: { updatedOn: calDate('2026-11-01') },
          [cmsId('oct-2')]: { screenId: '   ', updatedOn: calDate('2026-11-01') },
          [cmsId('oct-3')]: { screenId: 'screen-2', updatedOn: calDate('2026-11-31') },
          [cmsId('oct-4')]: { screenId: 'screen-2', updatedOn: calDate('2026-11-01') },
          [cmsId('withdrawn')]: { screenId: 'screen-2', updatedOn: calDate('2026-11-01') },
        },
      },
      monthDetailsByYearMonth: { '2026-10': oct },
      releasedCatalog: [
        makeCatalogItem('2026-10', 1, 'oct-1'),
        makeCatalogItem('2026-10', 2, 'oct-2'),
        makeCatalogItem('2026-10', 3, 'oct-3'),
        { ...makeCatalogItem('2026-10', 4, 'oct-4'), slug: 'changed-slug' },
      ],
      referenceCurrentYearMonth: ym('2026-11'),
    })

    assert.equal(result.suggestion?.kind, 'openFocusMonth')
    assert.equal(result.suggestion?.yearMonth, ym('2026-10'))
  })

  it('does not treat a month with an unreleased Challenge as fully completed', () => {
    const oct = makeMonthDetail('2026-10', [
      makeAvailableSlot(1, '2026-10', 'oct-1'),
      { dayOfMonth: 2, date: '2026-10-02', availability: 'comingSoon', title: 'Pending' },
    ])
    const result = deriveHubContinueSuggestion({
      shelfState: { months: [], activeFocusMonth: ym('2026-10') },
      participationData: {
        ...emptyReaderParticipationData(),
        completedChallenges: { [cmsId('oct-1')]: { completedOn: calDate('2026-10-05') } },
        inProgressChallenges: { [cmsId('oct-1')]: { screenId: 'screen-2', updatedOn: calDate('2026-10-04') } },
      },
      monthDetailsByYearMonth: { '2026-10': oct },
      referenceCurrentYearMonth: ym('2026-11'),
    })

    assert.equal(result.suggestion?.kind, 'openFocusMonth')
  })

  it('fails closed on missing or invalid reference month without reading device clock', () => {
    const shelfState: ShelfState = {
      months: [],
      activeFocusMonth: ym('2026-10'),
    }
    const oct = makeMonthDetail('2026-10', [makeAvailableSlot(1, '2026-10', 'oct-1')])

    const missingRef = deriveHubContinueSuggestion({
      shelfState,
      participationData: emptyReaderParticipationData(),
      monthDetailsByYearMonth: { '2026-10': oct },
    })
    assert.equal(missingRef.status, 'none')
    assert.equal(missingRef.reason, 'invalidReferenceMonth')

    const badServerDate = deriveHubContinueSuggestion({
      shelfState,
      participationData: emptyReaderParticipationData(),
      monthDetailsByYearMonth: { '2026-10': oct },
      serverContext: { authorizedLocalDate: '2026-02-30', effectiveTimeZone: 'America/New_York' },
    })
    assert.equal(badServerDate.status, 'none')
    assert.equal(badServerDate.reason, 'invalidReferenceMonth')
  })

  it('tolerates malformed inputs safely without throwing', () => {
    const malformed = deriveHubContinueSuggestion({
      shelfState: { months: [null as never], activeFocusMonth: 'not-a-month' as never },
      participationData: null as never,
      monthDetailsByYearMonth: { '2026-10': null as never },
      referenceCurrentYearMonth: ym('2026-11'),
    })

    assert.equal(malformed.status, 'none')
    assert.equal(malformed.suggestion, null)
    assert.equal(malformed.reason, 'malformedInput')
  })
})
