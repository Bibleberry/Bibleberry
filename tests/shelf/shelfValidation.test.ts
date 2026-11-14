import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  comparePublicationYearMonths,
  getNextPublicationYearMonth,
  getPreviousPublicationYearMonth,
  isHistoricalPublicationYearMonth,
  isShelfEntryProtected,
  parseValidPublicationYearMonth,
  validateShelfState,
} from '../../src/shelf/validation.ts'
import {
  MAX_SHELF_CAPACITY,
  MIN_SHELF_CAPACITY,
  type ShelfEntry,
} from '../../src/shelf/types.ts'
import { parsePublicationYearMonth } from '../../src/participation/identity.ts'
import type { PublicationYearMonth } from '../../src/participation/types.ts'

describe('Shelf Validation & Identifier Rules', () => {
  it('parses valid publication year-month identifiers', () => {
    assert.equal(parseValidPublicationYearMonth('2026-11'), '2026-11')
    assert.equal(parseValidPublicationYearMonth('2026-01'), '2026-01')
    assert.equal(parseValidPublicationYearMonth('2026-12'), '2026-12')
    assert.equal(parseValidPublicationYearMonth('2027-01'), '2027-01')
  })

  it('rejects malformed, empty, or malicious identifiers', () => {
    assert.equal(parseValidPublicationYearMonth(''), null)
    assert.equal(parseValidPublicationYearMonth('   '), null)
    assert.equal(parseValidPublicationYearMonth(null), null)
    assert.equal(parseValidPublicationYearMonth(undefined), null)
    assert.equal(parseValidPublicationYearMonth(12345), null)
    assert.equal(parseValidPublicationYearMonth({ year: 2026, month: 11 }), null)

    // Leading/trailing whitespace
    assert.equal(parseValidPublicationYearMonth(' 2026-11'), null)
    assert.equal(parseValidPublicationYearMonth('2026-11 '), null)

    // Out-of-bounds months
    assert.equal(parseValidPublicationYearMonth('2026-00'), null)
    assert.equal(parseValidPublicationYearMonth('2026-13'), null)
    assert.equal(parseValidPublicationYearMonth('2026-99'), null)

    // Partial or wrong formats
    assert.equal(parseValidPublicationYearMonth('2026-1'), null)
    assert.equal(parseValidPublicationYearMonth('26-11'), null)
    assert.equal(parseValidPublicationYearMonth('2026/11'), null)
    assert.equal(parseValidPublicationYearMonth('2026-11-01'), null)

    // Path traversal and namespace injection attempts
    assert.equal(parseValidPublicationYearMonth('../2026-11'), null)
    assert.equal(parseValidPublicationYearMonth('../../etc/passwd'), null)
    assert.equal(parseValidPublicationYearMonth('pilot:2026-11'), null)
    assert.equal(parseValidPublicationYearMonth('drafts.2026-11'), null)
    assert.equal(parseValidPublicationYearMonth("<script>alert('xss')</script>"), null)
    assert.equal(parseValidPublicationYearMonth("2026-11'; DROP TABLE shelf;--"), null)
  })

  it('correctly compares publication year-months chronologically', () => {
    const ym202607 = parsePublicationYearMonth('2026-07')!
    const ym202608 = parsePublicationYearMonth('2026-08')!
    const ym202612 = parsePublicationYearMonth('2026-12')!
    const ym202701 = parsePublicationYearMonth('2027-01')!

    assert.equal(comparePublicationYearMonths(ym202607, ym202608), -1)
    assert.equal(comparePublicationYearMonths(ym202608, ym202607), 1)
    assert.equal(comparePublicationYearMonths(ym202607, ym202607), 0)

    // Year boundary comparison: Dec 2026 is strictly earlier than Jan 2027
    assert.equal(comparePublicationYearMonths(ym202612, ym202701), -1)
    assert.equal(comparePublicationYearMonths(ym202701, ym202612), 1)
  })

  it('enforces historical-only invariant (strictly earlier than current month)', () => {
    const current = parsePublicationYearMonth('2026-11')!
    const past = parsePublicationYearMonth('2026-10')!
    const future = parsePublicationYearMonth('2026-12')!

    assert.equal(isHistoricalPublicationYearMonth(past, current), true)
    // Current month is NOT historical
    assert.equal(isHistoricalPublicationYearMonth(current, current), false)
    // Future month is NOT historical
    assert.equal(isHistoricalPublicationYearMonth(future, current), false)

    // Year boundary
    const jan2027 = parsePublicationYearMonth('2027-01')!
    const dec2026 = parsePublicationYearMonth('2026-12')!
    assert.equal(isHistoricalPublicationYearMonth(dec2026, jan2027), true)
    assert.equal(isHistoricalPublicationYearMonth(jan2027, dec2026), false)
  })

  it('calculates adjacent publication months across calendar boundaries', () => {
    const nov2026 = parsePublicationYearMonth('2026-11')!
    const dec2026 = parsePublicationYearMonth('2026-12')!
    const jan2027 = parsePublicationYearMonth('2027-01')!

    assert.equal(getPreviousPublicationYearMonth(nov2026), '2026-10')
    assert.equal(getNextPublicationYearMonth(nov2026), '2026-12')

    // Dec to Jan boundary
    assert.equal(getNextPublicationYearMonth(dec2026), '2027-01')
    assert.equal(getPreviousPublicationYearMonth(jan2027), '2026-12')

    // Invalid input handling
    assert.equal(getPreviousPublicationYearMonth('invalid' as unknown as PublicationYearMonth), null)
    assert.equal(getNextPublicationYearMonth('invalid' as unknown as PublicationYearMonth), null)
  })

  it('evaluates entry protection status accurately', () => {
    const ym = parsePublicationYearMonth('2026-08')!

    // Reader-selected defaults to protected
    const readerSelectedDefault: ShelfEntry = {
      yearMonth: ym,
      admissionKind: 'readerSelected',
      isProtected: true,
    }
    assert.equal(isShelfEntryProtected(readerSelectedDefault), true)

    // Auto-admitted defaults to unprotected
    const autoAdmittedDefault: ShelfEntry = {
      yearMonth: ym,
      admissionKind: 'autoAdmitted',
      isProtected: false,
    }
    assert.equal(isShelfEntryProtected(autoAdmittedDefault), false)

    // Explicit protection flag overrides admissionKind
    const explicitlyProtectedAuto: ShelfEntry = {
      yearMonth: ym,
      admissionKind: 'autoAdmitted',
      isProtected: true,
    }
    assert.equal(isShelfEntryProtected(explicitlyProtectedAuto), true)

    // ProposedAccountShelfEntry compatibility (where isProtected may be omitted)
    const proposedReaderSelected = {
      yearMonth: ym,
      admissionKind: 'readerSelected' as const,
    }
    assert.equal(isShelfEntryProtected(proposedReaderSelected), true)

    const proposedAuto = {
      yearMonth: ym,
      admissionKind: 'autoAdmitted' as const,
    }
    assert.equal(isShelfEntryProtected(proposedAuto), false)
  })

  it('validates valid shelf states with 0, 1, 2, and 3 slots', () => {
    const current = parsePublicationYearMonth('2026-11')!
    const ym08 = parsePublicationYearMonth('2026-08')!
    const ym09 = parsePublicationYearMonth('2026-09')!
    const ym10 = parsePublicationYearMonth('2026-10')!

    // Empty shelf (0 slots)
    const emptyRes = validateShelfState({ months: [] }, { referenceCurrentMonth: current })
    assert.equal(emptyRes.valid, true)
    assert.equal(emptyRes.normalizedState?.months.length, MIN_SHELF_CAPACITY)

    // 1 slot
    const oneRes = validateShelfState(
      {
        months: [{ yearMonth: ym10, admissionKind: 'readerSelected' }],
      },
      { referenceCurrentMonth: current },
    )
    assert.equal(oneRes.valid, true)
    assert.equal(oneRes.normalizedState?.months.length, 1)

    // 2 slots
    const twoRes = validateShelfState(
      {
        months: [
          { yearMonth: ym09, admissionKind: 'readerSelected' },
          { yearMonth: ym10, admissionKind: 'autoAdmitted' },
        ],
      },
      { referenceCurrentMonth: current },
    )
    assert.equal(twoRes.valid, true)
    assert.equal(twoRes.normalizedState?.months.length, 2)

    // 3 slots (maximum capacity)
    const threeRes = validateShelfState(
      {
        months: [
          { yearMonth: ym08, admissionKind: 'readerSelected' },
          { yearMonth: ym09, admissionKind: 'readerSelected' },
          { yearMonth: ym10, admissionKind: 'autoAdmitted' },
        ],
        activeFocusMonth: ym09,
        updatedOn: '2026-11-01',
      },
      { referenceCurrentMonth: current },
    )
    assert.equal(threeRes.valid, true)
    assert.equal(threeRes.normalizedState?.months.length, MAX_SHELF_CAPACITY)
    assert.equal(threeRes.normalizedState?.activeFocusMonth, ym09)
  })

  it('rejects states that exceed MAX_SHELF_CAPACITY (4 or more slots)', () => {
    const ym07 = parsePublicationYearMonth('2026-07')!
    const ym08 = parsePublicationYearMonth('2026-08')!
    const ym09 = parsePublicationYearMonth('2026-09')!
    const ym10 = parsePublicationYearMonth('2026-10')!

    const fourRes = validateShelfState({
      months: [
        { yearMonth: ym07, admissionKind: 'readerSelected' },
        { yearMonth: ym08, admissionKind: 'readerSelected' },
        { yearMonth: ym09, admissionKind: 'readerSelected' },
        { yearMonth: ym10, admissionKind: 'autoAdmitted' },
      ],
    })
    assert.equal(fourRes.valid, false)
    assert.ok(fourRes.diagnostics.some(d => d.reason.includes('capacity exceeded')))
  })

  it('rejects states containing duplicate months', () => {
    const ym10 = parsePublicationYearMonth('2026-10')!
    const dupRes = validateShelfState({
      months: [
        { yearMonth: ym10, admissionKind: 'readerSelected' },
        { yearMonth: ym10, admissionKind: 'autoAdmitted' },
      ],
    })
    assert.equal(dupRes.valid, false)
    assert.ok(dupRes.diagnostics.some(d => d.reason.includes('Duplicate month')))
  })

  it('rejects states with non-historical months when referenceCurrentMonth is provided', () => {
    const current = parsePublicationYearMonth('2026-11')!
    const future = parsePublicationYearMonth('2026-12')!

    // Attempting to include current month
    const currentMonthRes = validateShelfState(
      {
        months: [{ yearMonth: current, admissionKind: 'readerSelected' }],
      },
      { referenceCurrentMonth: current },
    )
    assert.equal(currentMonthRes.valid, false)
    assert.ok(currentMonthRes.diagnostics.some(d => d.reason.includes('not historical')))

    // Attempting to include future month
    const futureMonthRes = validateShelfState(
      {
        months: [{ yearMonth: future, admissionKind: 'readerSelected' }],
      },
      { referenceCurrentMonth: current },
    )
    assert.equal(futureMonthRes.valid, false)
    assert.ok(futureMonthRes.diagnostics.some(d => d.reason.includes('not historical')))
  })
})
