import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyMonthlyRollover,
  clearActiveFocusMonth,
  createEmptyShelfState,
  putAwayShelfMonth,
  selectShelfMonth,
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

  it('puts away Active Focus only with a valid explicit choice', () => {
    const state: ShelfState = {
      months: [
        { yearMonth: ym09, admissionKind: 'readerSelected', isProtected: true },
        { yearMonth: ym10, admissionKind: 'readerSelected', isProtected: true },
      ],
      activeFocusMonth: ym09,
    }

    const missing = putAwayShelfMonth(state, ym09)
    assert.equal(missing.ok, false)
    if (!missing.ok) assert.equal(missing.error, 'requiresFocusDecision')
    assert.equal(missing.state, state)

    for (const nextFocus of [ym09, ym08, 'invalid']) {
      const invalid = putAwayShelfMonth(state, { yearMonth: ym09, nextFocus })
      assert.equal(invalid.ok, false)
      if (!invalid.ok) assert.equal(invalid.error, 'invalidFocusDecision')
      assert.equal(invalid.state, state)
    }

    for (const nextFocus of [ym10, null]) {
      const result = putAwayShelfMonth(state, { yearMonth: ym09, nextFocus, updatedOn: dNov01 })
      assert.equal(result.ok, true)
      assert.deepEqual(result.state, { months: [state.months[1]], activeFocusMonth: nextFocus, updatedOn: dNov01 })
      assert.equal(result.state.months[0], state.months[1])

      const repeated = putAwayShelfMonth(result.state, { yearMonth: ym09, nextFocus })
      assert.equal(repeated.ok, false)
      assert.equal(repeated.state, result.state)
    }
  })

  it('replaces Active Focus atomically with reassignment or clear', () => {
    const state: ShelfState = {
      months: [
        { yearMonth: ym08, admissionKind: 'autoAdmitted', isProtected: false },
        { yearMonth: ym09, admissionKind: 'readerSelected', isProtected: true },
        { yearMonth: ym10, admissionKind: 'readerSelected', isProtected: true },
      ],
      activeFocusMonth: ym09,
    }
    const params = {
      yearMonth: '2026-07',
      referenceCurrentYearMonth: ym11,
      replaceMonth: ym09,
      admittedOn: dNov01,
    }

    for (const [nextFocus, error] of [
      [undefined, 'requiresFocusDecision'],
      ['2026-07', 'invalidFocusDecision'],
      [ym09, 'invalidFocusDecision'],
      [ym11, 'invalidFocusDecision'],
    ] as const) {
      const result = selectShelfMonth(state, { ...params, nextFocus })
      assert.equal(result.ok, false)
      if (!result.ok) assert.equal(result.error, error)
      assert.equal(result.state, state)
    }

    for (const nextFocus of [ym08, null]) {
      const result = selectShelfMonth(state, { ...params, nextFocus })
      assert.equal(result.ok, true)
      assert.equal(result.state.activeFocusMonth, nextFocus)
      assert.equal(result.state.months[0], state.months[0])
      assert.equal(result.state.months[2], state.months[2])
      assert.deepEqual(result.state.months[1], {
        yearMonth: '2026-07', admissionKind: 'readerSelected', isProtected: true, admittedOn: dNov01,
      })

      const repeated = selectShelfMonth(result.state, { ...params, nextFocus })
      assert.equal(repeated.ok, false)
      assert.equal(repeated.state, result.state)
    }

    const staleStates = [
      { ...state, activeFocusMonth: ym10 },
      { ...state, months: state.months.slice(0, 2) },
    ]
    for (const stale of staleStates) {
      const result = selectShelfMonth(stale, { ...params, nextFocus: null })
      assert.equal(result.ok, false)
      assert.equal(result.state, stale)
    }
  })

  it('keeps existing off-Shelf focus through ordinary Put Away', () => {
    const state: ShelfState = {
      months: [{ yearMonth: ym09, admissionKind: 'readerSelected', isProtected: true }],
      activeFocusMonth: ym10,
    }
    const result = putAwayShelfMonth(state, ym09)
    assert.equal(result.ok, true)
    assert.deepEqual(result.state.months, [])
    assert.equal(result.state.activeFocusMonth, ym10)
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
