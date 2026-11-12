import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyMonthlyRollover,
  clearActiveFocusMonth,
  createEmptyShelfState,
  putAwayShelfMonth,
  setActiveFocusMonth,
} from '../../src/shelf/policy.ts'
import type {
  FirstPostRolloverResumeExtension,
  ShelfState,
} from '../../src/shelf/types.ts'
import {
  parseLocalCalendarDate,
  parsePublicationYearMonth,
} from '../../src/participation/identity.ts'

describe('Shelf Active Focus and Extension Seam Separation', () => {
  const ym08 = parsePublicationYearMonth('2026-08')!
  const ym09 = parsePublicationYearMonth('2026-09')!
  const ym10 = parsePublicationYearMonth('2026-10')!
  const ym11 = parsePublicationYearMonth('2026-11')!
  const dNov01 = parseLocalCalendarDate('2026-11-01')!

  it('allows setting deliberate active focus to a month on the Shelf', () => {
    const state: ShelfState = {
      months: [{ yearMonth: ym10, admissionKind: 'readerSelected', isProtected: true }],
      activeFocusMonth: null,
    }

    const res = setActiveFocusMonth(state, ym10)
    assert.equal(res.ok, true)
    if (!res.ok) return
    assert.equal(res.state.activeFocusMonth, ym10)
  })

  it('allows setting deliberate active focus to a historical month NOT on the Shelf (direct Library study)', () => {
    // Empty shelf
    const state = createEmptyShelfState()
    assert.equal(state.months.length, 0)

    // Reader deliberately studies 2026-08 in the Library without adding it to Shelf
    const res = setActiveFocusMonth(state, ym08)
    assert.equal(res.ok, true)
    if (!res.ok) return
    assert.equal(res.state.activeFocusMonth, ym08)
    assert.equal(res.state.months.length, 0) // Shelf remains 0 slots!
  })

  it('allows clearing active focus explicitly', () => {
    const state: ShelfState = {
      months: [{ yearMonth: ym10, admissionKind: 'readerSelected', isProtected: true }],
      activeFocusMonth: ym10,
    }

    // Using null
    const res = setActiveFocusMonth(state, null)
    assert.equal(res.ok, true)
    if (!res.ok) return
    assert.equal(res.state.activeFocusMonth, null)

    // Using clearActiveFocusMonth helper
    const cleared = clearActiveFocusMonth(state)
    assert.equal(cleared.activeFocusMonth, null)
  })

  it('preserves active focus when a month is put away from the Shelf', () => {
    const state: ShelfState = {
      months: [
        { yearMonth: ym09, admissionKind: 'readerSelected', isProtected: true },
        { yearMonth: ym10, admissionKind: 'readerSelected', isProtected: true },
      ],
      activeFocusMonth: ym09,
    }

    // Putting away ym09 from Shelf removes it from membership, but deliberate focus is separate
    const putAwayRes = putAwayShelfMonth(state, ym09)
    assert.equal(putAwayRes.ok, true)
    if (!putAwayRes.ok) return
    assert.equal(putAwayRes.state.months.length, 1)
    assert.equal(putAwayRes.state.months[0]?.yearMonth, ym10)
    assert.equal(putAwayRes.state.activeFocusMonth, ym09)
  })

  it('never silently rewrites active focus on monthly rollover', () => {
    const state: ShelfState = {
      months: [{ yearMonth: ym09, admissionKind: 'readerSelected', isProtected: true }],
      activeFocusMonth: ym09, // reader's deliberate focus
    }

    const rolloverRes = applyMonthlyRollover(state, {
      newCurrentYearMonth: ym11,
      endingYearMonth: ym10,
      completedChallengeIdsInEndingMonth: ['cms:challenge-2026-10-01'],
      rolloverDate: dNov01,
    })

    assert.equal(rolloverRes.ok, true)
    assert.equal(rolloverRes.state.months.length, 2)
    // Active focus remains 2026-09: rollover did not silently change reader's study focus
    assert.equal(rolloverRes.state.activeFocusMonth, ym09)
  })

  it('exposes the deferred first-after-rollover resume extension seam cleanly without guessing heuristics', () => {
    const state = createEmptyShelfState()

    const result = applyMonthlyRollover(state, {
      newCurrentYearMonth: ym11,
      endingYearMonth: ym10,
      completedChallengeIdsInEndingMonth: ['cms:challenge-2026-10-01'],
      rolloverDate: dNov01,
    })

    assert.equal(result.ok, true)
    const seam = result.resumeSuggestionSeam
    assert.equal(seam.status, 'deferredExtensionPoint')
    assert.equal(seam.endingYearMonth, ym10)
    assert.equal(seam.temporaryResumeAllowed, false)
    assert.ok(seam.policyNotes.includes('November 8 approved reader experience'))
    assert.ok(seam.policyNotes.includes('deferred'))
  })

  it('allows integrating a custom resume policy through the extension seam', () => {
    const customResumeExtension: FirstPostRolloverResumeExtension = {
      evaluateFirstVisitResume: context => {
        if (context.isFirstVisitAfterRollover && context.candidateInterruptedChallengeId) {
          return {
            shouldSurfaceResumeSuggestion: true,
            suggestedChallengeId: context.candidateInterruptedChallengeId,
          }
        }
        return { shouldSurfaceResumeSuggestion: false }
      },
    }

    const state = createEmptyShelfState()
    const result = applyMonthlyRollover(state, {
      newCurrentYearMonth: ym11,
      endingYearMonth: ym10,
      completedChallengeIdsInEndingMonth: ['cms:challenge-2026-10-01'],
      rolloverDate: dNov01,
      resumeExtension: customResumeExtension,
    })

    assert.equal(result.ok, true)
    assert.equal(result.resumeSuggestionSeam.status, 'deferredExtensionPoint')
    assert.equal(result.resumeSuggestionSeam.endingYearMonth, ym10)
  })
})
