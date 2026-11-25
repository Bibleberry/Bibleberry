import { useRef, useState } from 'react'
import type { PublicationYearMonth } from '../../participation/types.ts'
import { selectShelfMonth, SHELF_CONFIRMATION_STALE_MESSAGE } from '../../shelf/policy.ts'
import type { ShelfState } from '../../shelf/types.ts'
import { areShelfStatesEqual, isShelfEntryProtected } from '../../shelf/validation.ts'
import { defaultGuestShelfStore } from '../../shelfPersistence/defaultGuestShelfStore.ts'
import { useGuestShelfStore } from '../../shelfPersistence/useGuestShelfStore.ts'
import { ShelfReplaceDialog } from '../shelf/ShelfReplaceDialog.tsx'
import { projectShelfViewModel, type ShelfPresentation } from '../shelf/shelfModel.ts'

interface MonthShelfActionProps {
  readonly yearMonth: PublicationYearMonth
  readonly title: string
  readonly referenceMonth: PublicationYearMonth
  readonly authorizedLocalDate: string
  readonly presentation?: ShelfPresentation
}

/** Shelf membership for a historical detail already authorized by the Month gateway. */
export function MonthShelfAction({
  yearMonth,
  title,
  referenceMonth,
  authorizedLocalDate,
  presentation = 'legacy',
}: MonthShelfActionProps) {
  const store = defaultGuestShelfStore
  const snapshot = useGuestShelfStore(store)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const saving = useRef(false)
  const [pendingReplace, setPendingReplace] = useState<ShelfState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const hasUnreadableShelf = snapshot.health === 'corruptStoredData'
    || snapshot.health === 'unsupportedNewerSchema'
    || snapshot.health === 'storageUnavailable'
  const entry = snapshot.state.months.find(month => month.yearMonth === yearMonth)
  const verified = snapshot.status === 'ready' && !snapshot.hasPendingWrites && !hasUnreadableShelf
  const kept = verified && entry && isShelfEntryProtected(entry)
  const blocked = !verified || Boolean(kept)

  async function select(replaceMonth?: PublicationYearMonth, nextFocus?: PublicationYearMonth | null) {
    if (saving.current) return
    setError(null)
    setAnnouncement('')
    const before = store.getSnapshot()
    if (replaceMonth && (
      !pendingReplace || before.hasPendingWrites || !areShelfStatesEqual(pendingReplace, before.state)
    )) {
      setError(SHELF_CONFIRMATION_STALE_MESSAGE)
      return
    }

    const result = selectShelfMonth(before.state, {
      yearMonth,
      referenceCurrentYearMonth: referenceMonth,
      admittedOn: authorizedLocalDate,
      updatedOn: authorizedLocalDate,
      replaceMonth,
      nextFocus,
    })
    if (!result.ok) {
      if (result.error === 'shelfCapacityExceeded' && !replaceMonth) {
        setPendingReplace(before.state)
      } else {
        setError(result.message)
      }
      return
    }

    saving.current = true
    try {
      const saved = await store.applyState(result.state, referenceMonth, before.state, { requireDurable: true })
      if (saved.ok) {
        setAnnouncement(`${title} is kept on your Shelf.`)
      } else {
        setError(saved.message)
      }
    } finally {
      saving.current = false
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="button button--secondary month-shelf-action"
        aria-disabled={blocked}
        onClick={() => { if (!blocked) void select() }}
      >
        {kept ? 'Kept on Shelf' : verified && entry ? 'Keep on Shelf' : 'Add to Shelf'}
      </button>
      <span className="sr-only" role="status">{announcement}</span>
      {(error || hasUnreadableShelf) && (
        <p className="month-shelf-error" role="alert">
          {error ?? 'Saved Shelf data could not be read safely from this device.'}
        </p>
      )}
      <ShelfReplaceDialog
        isOpen={pendingReplace !== null}
        incomingYearMonth={yearMonth}
        incomingTitle={title}
        currentEntries={
          pendingReplace
            ? projectShelfViewModel(pendingReplace, referenceMonth, undefined, presentation).entries
            : []
        }
        onConfirmReplace={(replaceMonth, nextFocus) => {
          setPendingReplace(null)
          void select(replaceMonth, nextFocus)
        }}
        onCancel={() => setPendingReplace(null)}
        fallbackFocusRef={triggerRef}
      />
    </>
  )
}
