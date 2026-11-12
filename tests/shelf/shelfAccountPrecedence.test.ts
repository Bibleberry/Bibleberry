import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { reconcileShelfWithAccountPrecedence } from '../../src/shelf/policy.ts'
import type { ShelfState } from '../../src/shelf/types.ts'
import type { ProposedAccountShelfState } from '../../src/accountSync/types.ts'
import {
  parseLocalCalendarDate,
  parsePublicationYearMonth,
} from '../../src/participation/identity.ts'

describe('Shelf Account Precedence & Reconciliation Contract', () => {
  const ym07 = parsePublicationYearMonth('2026-07')!
  const ym08 = parsePublicationYearMonth('2026-08')!
  const ym09 = parsePublicationYearMonth('2026-09')!
  const ym10 = parsePublicationYearMonth('2026-10')!
  const dNov01 = parseLocalCalendarDate('2026-11-01')!

  it('preserves existing account Shelf selections over guest Shelf on conflict', () => {
    // Existing account has 3 readerSelected months
    const accountShelf: ProposedAccountShelfState = {
      months: [
        { yearMonth: ym08, admissionKind: 'readerSelected' },
        { yearMonth: ym09, admissionKind: 'readerSelected' },
        { yearMonth: ym10, admissionKind: 'readerSelected' },
      ],
      activeFocusMonth: ym09,
    }

    // Guest has a conflicting month (2026-07)
    const guestShelf: ShelfState = {
      months: [
        { yearMonth: ym07, admissionKind: 'readerSelected', isProtected: true },
      ],
      activeFocusMonth: ym07,
    }

    const resolution = reconcileShelfWithAccountPrecedence({
      accountShelf,
      guestShelf,
    })

    assert.equal(resolution.source, 'account')
    assert.deepEqual(
      resolution.shelf.months.map(m => m.yearMonth),
      [ym08, ym09, ym10],
    )
    assert.equal(resolution.shelf.activeFocusMonth, ym09)

    // Guest's displaced month is recorded as preservedInLibraryNotOnShelf
    assert.equal(resolution.displacedGuestMonths.length, 1)
    assert.equal(resolution.displacedGuestMonths[0]?.yearMonth, ym07)
    assert.equal(resolution.displacedGuestMonths[0]?.disposition, 'preservedInLibraryNotOnShelf')
  })

  it('honors explicit empty account Shelf over guest Shelf', () => {
    const emptyAccountShelf: ProposedAccountShelfState = {
      months: [],
      activeFocusMonth: null,
    }

    const guestShelf: ShelfState = {
      months: [
        { yearMonth: ym10, admissionKind: 'readerSelected', isProtected: true },
      ],
    }

    const resolution = reconcileShelfWithAccountPrecedence({
      accountShelf: emptyAccountShelf,
      guestShelf,
    })

    assert.equal(resolution.source, 'account')
    assert.equal(resolution.shelf.months.length, 0)
    assert.equal(resolution.displacedGuestMonths.length, 1)
    assert.equal(resolution.displacedGuestMonths[0]?.yearMonth, ym10)
    assert.equal(resolution.displacedGuestMonths[0]?.disposition, 'preservedInLibraryNotOnShelf')
  })

  it('transfers guest Shelf directly on newAccountTransfer (when accountShelf is undefined)', () => {
    const guestShelf: ShelfState = {
      months: [
        { yearMonth: ym09, admissionKind: 'readerSelected', isProtected: true, admittedOn: dNov01 },
        { yearMonth: ym10, admissionKind: 'autoAdmitted', isProtected: false },
      ],
      activeFocusMonth: ym09,
    }

    const resolution = reconcileShelfWithAccountPrecedence({
      accountShelf: undefined, // new account transfer
      guestShelf,
    })

    assert.equal(resolution.source, 'guest')
    assert.deepEqual(
      resolution.shelf.months.map(m => m.yearMonth),
      [ym09, ym10],
    )
    assert.equal(resolution.shelf.activeFocusMonth, ym09)
    assert.equal(resolution.displacedGuestMonths.length, 0)
  })

  it('caps transferred guest Shelf at MAX_SHELF_CAPACITY (3 slots)', () => {
    const oversizedGuestShelf: ProposedAccountShelfState = {
      months: [
        { yearMonth: ym07, admissionKind: 'readerSelected' },
        { yearMonth: ym08, admissionKind: 'readerSelected' },
        { yearMonth: ym09, admissionKind: 'readerSelected' },
        { yearMonth: ym10, admissionKind: 'autoAdmitted' },
      ],
    }

    const resolution = reconcileShelfWithAccountPrecedence({
      accountShelf: undefined,
      guestShelf: oversizedGuestShelf,
    })

    assert.equal(resolution.source, 'guest')
    assert.equal(resolution.shelf.months.length, 3)
    assert.deepEqual(
      resolution.shelf.months.map(m => m.yearMonth),
      [ym07, ym08, ym09],
    )
  })
})
