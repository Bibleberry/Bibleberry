import { useState, type RefObject } from 'react'
import type { PublicationYearMonth } from '../../participation/types.ts'
import { ShelfConfirmationDialog } from './ShelfConfirmationDialog.tsx'
import { ShelfFocusChoices } from './ShelfFocusChoices.tsx'
import { formatPublicationMonthHeading, type ShelfEntryViewModel } from './shelfModel.ts'

interface ShelfPutAwayDialogProps {
  readonly yearMonth: PublicationYearMonth
  readonly remainingEntries: readonly ShelfEntryViewModel[]
  readonly onConfirm: (nextFocus: PublicationYearMonth | null) => void
  readonly onCancel: () => void
  readonly fallbackFocusRef: RefObject<HTMLElement | null>
}

export function ShelfPutAwayDialog({
  yearMonth,
  remainingEntries,
  onConfirm,
  onCancel,
  fallbackFocusRef,
}: ShelfPutAwayDialogProps) {
  const [nextFocus, setNextFocus] = useState<PublicationYearMonth | null>()

  return (
    <ShelfConfirmationDialog
      title="Put Away Active Focus"
      description={<>Putting away <strong>{formatPublicationMonthHeading(yearMonth)}</strong> removes it from Shelf. Your study progress and saved Scripture stay available.</>}
      confirmLabel="Confirm Put Away"
      canConfirm={nextFocus !== undefined}
      onConfirm={() => {
        if (nextFocus !== undefined) onConfirm(nextFocus)
      }}
      onCancel={onCancel}
      fallbackFocusRef={fallbackFocusRef}
    >
      <ShelfFocusChoices remainingEntries={remainingEntries} nextFocus={nextFocus} onChange={setNextFocus} />
    </ShelfConfirmationDialog>
  )
}
