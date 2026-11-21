import { useState } from 'react'
import { HubContinueBoundary } from '../../../src/components/hubContinue/index.ts'
import type { MonthDetailData, MonthSlot } from '../../../src/cms/reader/monthProvider.ts'
import type { HubContinueInput, HubContinueSuggestion } from '../../../src/hubContinue/types.ts'
import { emptyReaderParticipationData } from '../../../src/participation/model.ts'
import type {
  CanonicalChallengeId,
  LocalCalendarDate,
  PublicationYearMonth,
  ReaderParticipationData,
} from '../../../src/participation/types.ts'
import { createEmptyShelfState } from '../../../src/shelf/policy.ts'
import type { ShelfState } from '../../../src/shelf/types.ts'

const ym = (value: string) => value as PublicationYearMonth
const calDate = (value: string) => value as LocalCalendarDate
const cmsId = (baseId: string) => `cms:${baseId}` as CanonicalChallengeId

function makeAvailableSlot(day: number, yearMonth: string, baseId: string, title: string): MonthSlot {
  const padded = String(day).padStart(2, '0')
  return {
    dayOfMonth: day,
    date: `${yearMonth}-${padded}`,
    availability: 'available',
    title,
    slug: `${yearMonth}-day-${padded}`,
    challengeId: baseId,
    challengeType: 'teaching',
  }
}

function makeMonthDetail(yearMonth: string, title: string, slots: readonly MonthSlot[]): MonthDetailData {
  const [yearStr, monthStr] = yearMonth.split('-')
  return {
    monthId: yearMonth,
    documentId: `month-${yearMonth}`,
    year: Number(yearStr),
    month: Number(monthStr),
    daysInMonth: 30,
    phase: 'historical',
    rosterVersion: 1,
    totalChallenges: slots.length,
    title,
    introduction: {
      version: '1',
      previewScreens: [],
      welcomeScreen: { id: 'welcome', blocks: [] },
    },
    slots,
    discoveries: [],
  }
}

function buildScenarioInput(scenario: string): HubContinueInput {
  const oct = makeMonthDetail('2026-10', 'Walk in Gratitude', [
    makeAvailableSlot(1, '2026-10', 'oct-1', 'Thankful in All Things'),
    makeAvailableSlot(5, '2026-10', 'oct-5', 'Steadfast Hope in Every Season and Trial'),
  ])
  const sep = makeMonthDetail('2026-09', 'Abiding Peace', [
    makeAvailableSlot(1, '2026-09', 'sep-1', 'Rest in His Presence'),
    makeAvailableSlot(3, '2026-09', 'sep-3', 'Quiet Trust'),
  ])

  const monthDetailsByYearMonth: Record<string, MonthDetailData> = {
    '2026-10': oct,
    '2026-09': sep,
  }

  switch (scenario) {
    case 'incomplete': {
      const shelfState: ShelfState = {
        months: [{ yearMonth: ym('2026-10'), admissionKind: 'readerSelected', isProtected: true }],
        activeFocusMonth: ym('2026-10'),
      }
      const participationData: ReaderParticipationData = {
        ...emptyReaderParticipationData(),
        completedChallenges: {
          [cmsId('oct-1')]: { completedOn: calDate('2026-10-02') },
        },
        inProgressChallenges: {
          [cmsId('oct-5')]: { screenId: 'screen-3', updatedOn: calDate('2026-11-10') },
        },
      }
      return {
        shelfState,
        participationData,
        monthDetailsByYearMonth,
        referenceCurrentYearMonth: ym('2026-11'),
      }
    }

    case 'completed-focus': {
      const shelfState: ShelfState = {
        months: [
          { yearMonth: ym('2026-09'), admissionKind: 'readerSelected', isProtected: true },
          { yearMonth: ym('2026-10'), admissionKind: 'readerSelected', isProtected: true },
        ],
        activeFocusMonth: ym('2026-10'),
      }
      const participationData: ReaderParticipationData = {
        ...emptyReaderParticipationData(),
        completedChallenges: {
          [cmsId('oct-1')]: { completedOn: calDate('2026-10-01') },
          [cmsId('oct-5')]: { completedOn: calDate('2026-10-05') },
          [cmsId('sep-1')]: { completedOn: calDate('2026-09-02') },
        },
      }
      return {
        shelfState,
        participationData,
        monthDetailsByYearMonth,
        referenceCurrentYearMonth: ym('2026-11'),
      }
    }

    case 'unavailable': {
      const shelfState: ShelfState = {
        months: [],
        activeFocusMonth: ym('2026-07'),
      }
      return {
        shelfState,
        participationData: emptyReaderParticipationData(),
        monthDetailsByYearMonth,
        referenceCurrentYearMonth: ym('2026-11'),
      }
    }

    case 'empty':
    default: {
      return {
        shelfState: createEmptyShelfState(),
        participationData: emptyReaderParticipationData(),
        monthDetailsByYearMonth,
        referenceCurrentYearMonth: ym('2026-11'),
      }
    }
  }
}

export function HarnessApp() {
  const params = new URLSearchParams(window.location.search)
  const scenario = params.get('scenario') ?? 'empty'
  const input = buildScenarioInput(scenario)

  const [continuedTarget, setContinuedTarget] = useState<string>('')
  const [openedMonth, setOpenedMonth] = useState<string>('')

  const handleContinueChallenge = (suggestion: HubContinueSuggestion) => {
    setContinuedTarget(`${suggestion.yearMonth}:${suggestion.challengeId}:${suggestion.kind}`)
  }

  return (
    <main style={{ padding: '16px', maxWidth: '680px', margin: '0 auto' }}>
      <h1>Hub Continue Harness</h1>
      <HubContinueBoundary
        input={input}
        onContinueChallenge={handleContinueChallenge}
        onOpenMonth={yearMonth => setOpenedMonth(yearMonth)}
      />
      <output data-testid="continue-callback">{continuedTarget}</output>
      <output data-testid="open-month-callback">{openedMonth}</output>
    </main>
  )
}
