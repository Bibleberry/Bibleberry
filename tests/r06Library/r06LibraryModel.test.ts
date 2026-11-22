import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildR06LibraryEntrances,
  buildR06LibraryLandingViewModel,
  canTransitionR06LibrarySurface,
  countValidHistoricalShelfMonths,
  formatR06LibrarySurfaceAnnouncement,
  isValidR06LibrarySurface,
  resolveActiveR06LibrarySurface,
  resolveInitialR06LibrarySurface,
  resolveNextR06LibraryReturnSurface,
  resolveR06LibraryHostBackAction,
} from '../../src/components/r06Library/r06LibraryModel.ts'
import type { LocalCalendarDate, PublicationYearMonth } from '../../src/participation/types.ts'
import type { ShelfState } from '../../src/shelf/types.ts'

const CURRENT_MONTH = '2026-11' as PublicationYearMonth
const TODAY = '2026-11-21' as LocalCalendarDate

const GUILT_PATTERN = /\b(behind|missed|catch\s*up|streak|overdue|fallen\s*behind)\b/i

function makeShelfState(yearMonths: readonly string[], activeFocusMonth?: string | null): ShelfState {
  return {
    months: yearMonths.map((ym, index) => ({
      yearMonth: ym as PublicationYearMonth,
      admissionKind: index === 0 ? 'autoAdmitted' : 'readerSelected',
      isProtected: index !== 0,
      admittedOn: TODAY,
    })),
    ...(activeFocusMonth !== undefined
      ? { activeFocusMonth: activeFocusMonth as PublicationYearMonth | null }
      : {}),
  }
}

test('surface validators and resolvers enforce controlled/uncontrolled boundary safely', () => {
  assert.equal(isValidR06LibrarySurface('shelf'), true)
  assert.equal(isValidR06LibrarySurface('library'), true)
  assert.equal(isValidR06LibrarySurface('foundations'), false)
  assert.equal(isValidR06LibrarySurface(undefined), false)

  assert.equal(resolveInitialR06LibrarySurface(undefined), 'shelf')
  assert.equal(resolveInitialR06LibrarySurface('library'), 'library')
  assert.equal(resolveInitialR06LibrarySurface('invalid' as never), 'shelf')

  assert.equal(
    resolveActiveR06LibrarySurface({ controlledSurface: 'library', uncontrolledSurface: 'shelf' }),
    'library',
  )
  assert.equal(
    resolveActiveR06LibrarySurface({ controlledSurface: undefined, uncontrolledSurface: 'library' }),
    'library',
  )
  assert.equal(
    resolveActiveR06LibrarySurface({ controlledSurface: 'bad' as never, uncontrolledSurface: 'shelf' }),
    'shelf',
  )

  assert.equal(canTransitionR06LibrarySurface('shelf', 'library'), true)
  assert.equal(canTransitionR06LibrarySurface('library', 'shelf'), true)
  assert.equal(canTransitionR06LibrarySurface('shelf', 'shelf'), false)
  assert.equal(canTransitionR06LibrarySurface('library', 'library'), false)
  assert.equal(canTransitionR06LibrarySurface('shelf', 'other'), false)
})

test('countValidHistoricalShelfMonths counts 0–3 strictly historical deduplicated months only', () => {
  assert.equal(countValidHistoricalShelfMonths(undefined, CURRENT_MONTH), 0)
  assert.equal(countValidHistoricalShelfMonths(makeShelfState([]), CURRENT_MONTH), 0)
  assert.equal(countValidHistoricalShelfMonths(makeShelfState(['2026-10']), CURRENT_MONTH), 1)
  assert.equal(
    countValidHistoricalShelfMonths(makeShelfState(['2026-10', '2026-09']), CURRENT_MONTH),
    2,
  )
  assert.equal(
    countValidHistoricalShelfMonths(makeShelfState(['2026-10', '2026-09', '2026-08']), CURRENT_MONTH),
    3,
  )

  // Current month, future month, malformed entries, duplicates, and >3 overflow are excluded
  const tainted = makeShelfState([
    '2026-11',
    '2026-12',
    'invalid',
    '2026-10',
    '2026-10',
    '2026-09',
    '2026-08',
    '2026-07',
  ])
  assert.equal(countValidHistoricalShelfMonths(tainted, CURRENT_MONTH), 3)

  // Without referenceCurrentYearMonth (waiting for gateway), still deduplicates and caps at 3
  assert.equal(
    countValidHistoricalShelfMonths(
      makeShelfState(['2026-10', '2026-10', '2026-09', 'bad-ym']),
      null,
    ),
    2,
  )
})

test('buildR06LibraryEntrances provides persistent Browse All Months and Foundations at capacities 0–3', () => {
  for (const shelfCount of [0, 1, 2, 3]) {
    const shelfEntrances = buildR06LibraryEntrances({
      activeSurface: 'shelf',
      shelfCount,
    })
    assert.deepEqual(
      shelfEntrances.map(e => ({ id: e.id, label: e.label, action: e.action })),
      [
        { id: 'browse-all-months', label: 'Browse All Months', action: 'openLibrary' },
        { id: 'foundations', label: 'Foundations', action: 'openFoundations' },
      ],
    )
    for (const entrance of shelfEntrances) {
      assert.equal(GUILT_PATTERN.test(entrance.label), false)
      assert.equal(GUILT_PATTERN.test(entrance.description), false)
    }

    const libraryEntrances = buildR06LibraryEntrances({
      activeSurface: 'library',
      shelfCount,
    })
    assert.deepEqual(
      libraryEntrances.map(e => ({ id: e.id, label: e.label, action: e.action })),
      [
        { id: 'shelf-overview', label: 'Your Shelf', action: 'openShelf' },
        { id: 'foundations', label: 'Foundations', action: 'openFoundations' },
      ],
    )
    assert.match(libraryEntrances[0]!.description, new RegExp(`${shelfCount} of 3`))
    for (const entrance of libraryEntrances) {
      assert.equal(GUILT_PATTERN.test(entrance.label), false)
      assert.equal(GUILT_PATTERN.test(entrance.description), false)
    }
  }
})

test('buildR06LibraryLandingViewModel and transition announcements reflect Shelf capacity accurately', () => {
  const emptyVm = buildR06LibraryLandingViewModel({
    activeSurface: 'shelf',
    shelfState: makeShelfState([]),
    referenceCurrentYearMonth: CURRENT_MONTH,
  })
  assert.equal(emptyVm.shelfCount, 0)
  assert.equal(emptyVm.maxCapacity, 3)
  assert.equal(emptyVm.isShelfEmpty, true)
  assert.equal(emptyVm.isShelfFull, false)
  assert.equal(emptyVm.entrances.length, 2)

  const fullVm = buildR06LibraryLandingViewModel({
    activeSurface: 'library',
    shelfState: makeShelfState(['2026-10', '2026-09', '2026-08'], '2026-09'),
    referenceCurrentYearMonth: CURRENT_MONTH,
  })
  assert.equal(fullVm.shelfCount, 3)
  assert.equal(fullVm.isShelfEmpty, false)
  assert.equal(fullVm.isShelfFull, true)
  assert.equal(fullVm.entrances[0]?.action, 'openShelf')
  assert.equal(fullVm.entrances[1]?.action, 'openFoundations')

  assert.match(formatR06LibrarySurfaceAnnouncement('library'), /Browse All Months/)
  assert.match(formatR06LibrarySurfaceAnnouncement('shelf'), /Shelf/)
})

test('return-surface helpers preserve reverse Back navigation in both directions', () => {
  // Shelf -> Browse All Months -> Shelf
  const afterForwardToLibrary = resolveNextR06LibraryReturnSurface({
    currentSurface: 'shelf',
    nextSurface: 'library',
    currentReturnSurface: null,
  })
  assert.equal(afterForwardToLibrary, 'shelf')
  assert.deepEqual(
    resolveR06LibraryHostBackAction({
      activeSurface: 'library',
      returnSurface: afterForwardToLibrary,
      hasOuterExit: true,
      exitLabel: 'Return to Today',
    }),
    { mode: 'returnToSurface', targetSurface: 'shelf', label: 'Back to Shelf' },
  )

  const afterBackToShelf = resolveNextR06LibraryReturnSurface({
    currentSurface: 'library',
    nextSurface: 'shelf',
    currentReturnSurface: afterForwardToLibrary,
  })
  assert.equal(afterBackToShelf, null)
  assert.deepEqual(
    resolveR06LibraryHostBackAction({
      activeSurface: 'shelf',
      returnSurface: afterBackToShelf,
      hasOuterExit: false,
    }),
    { mode: 'none', targetSurface: null, label: 'Return' },
  )

  // Direct Browse All Months -> Your Shelf -> Back to Library -> outer Exit
  const afterForwardToShelf = resolveNextR06LibraryReturnSurface({
    currentSurface: 'library',
    nextSurface: 'shelf',
    currentReturnSurface: null,
  })
  assert.equal(afterForwardToShelf, 'library')
  assert.deepEqual(
    resolveR06LibraryHostBackAction({
      activeSurface: 'shelf',
      returnSurface: afterForwardToShelf,
      hasOuterExit: true,
      exitLabel: 'Return to Today',
    }),
    { mode: 'returnToSurface', targetSurface: 'library', label: 'Back to Library' },
  )

  const afterBackToLibrary = resolveNextR06LibraryReturnSurface({
    currentSurface: 'shelf',
    nextSurface: 'library',
    currentReturnSurface: afterForwardToShelf,
  })
  assert.equal(afterBackToLibrary, null)
  assert.deepEqual(
    resolveR06LibraryHostBackAction({
      activeSurface: 'library',
      returnSurface: afterBackToLibrary,
      hasOuterExit: true,
      exitLabel: 'Return to Today',
    }),
    { mode: 'outerExit', targetSurface: null, label: 'Return to Today' },
  )

  // No-op transition leaves returnSurface untouched
  assert.equal(
    resolveNextR06LibraryReturnSurface({
      currentSurface: 'shelf',
      nextSurface: 'shelf',
      currentReturnSurface: 'library',
    }),
    'library',
  )
})
