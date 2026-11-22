import { useId, useState, type RefObject } from 'react'
import { Shield } from 'lucide-react'
import type { PublicationYearMonth } from '../../participation/types.ts'
import { ShelfConfirmationDialog } from './ShelfConfirmationDialog.tsx'
import { ShelfFocusChoices } from './ShelfFocusChoices.tsx'
import { formatPublicationMonthHeading, type ShelfEntryViewModel } from './shelfModel.ts'

export interface ShelfReplaceDialogProps {
  readonly isOpen: boolean
  readonly incomingYearMonth: PublicationYearMonth | null
  readonly incomingTitle?: string | null
  readonly currentEntries: readonly ShelfEntryViewModel[]
  readonly onConfirmReplace: (
    replaceYearMonth: PublicationYearMonth,
    nextFocus?: PublicationYearMonth | null,
  ) => void
  readonly onCancel: () => void
  readonly fallbackFocusRef: RefObject<HTMLElement | null>
}

export function ShelfReplaceDialog({ isOpen, incomingYearMonth, ...props }: ShelfReplaceDialogProps) {
  if (!isOpen || !incomingYearMonth) return null
  return <ShelfReplaceDialogContent key={incomingYearMonth} incomingYearMonth={incomingYearMonth} {...props} />
}

interface ShelfReplaceDialogContentProps extends Omit<ShelfReplaceDialogProps, 'isOpen' | 'incomingYearMonth'> {
  readonly incomingYearMonth: PublicationYearMonth
}

function ShelfReplaceDialogContent({
  incomingYearMonth,
  incomingTitle,
  currentEntries,
  onConfirmReplace,
  onCancel,
  fallbackFocusRef,
}: ShelfReplaceDialogContentProps) {
  const name = useId()
  const [selectedReplace, setSelectedReplace] = useState<PublicationYearMonth | null>(null)
  const [nextFocus, setNextFocus] = useState<PublicationYearMonth | null>()
  const selectedEntry = currentEntries.find(entry => entry.yearMonth === selectedReplace)
  const needsFocusChoice = selectedEntry?.isActiveFocus === true
  const canConfirm = Boolean(selectedEntry) && (!needsFocusChoice || nextFocus !== undefined)

  const incomingHeading = formatPublicationMonthHeading(incomingYearMonth)
  const incomingLabel = incomingTitle ? `${incomingHeading} (${incomingTitle})` : incomingHeading

  return (
    <ShelfConfirmationDialog
      title="Choose a Month to Replace"
      description={<>Select a Shelf month to put away and add <strong>{incomingLabel}</strong> in its place. Your study progress and saved Scripture stay available.</>}
      confirmLabel="Replace Selected Month"
      canConfirm={canConfirm}
      onConfirm={() => {
        if (selectedEntry) {
          onConfirmReplace(selectedEntry.yearMonth, needsFocusChoice ? nextFocus : undefined)
        }
      }}
      onCancel={onCancel}
      fallbackFocusRef={fallbackFocusRef}
    >
      <fieldset className="shelf-dialog__choices">
        <legend className="sr-only">Current Shelf months</legend>
        {currentEntries.map(entry => {
          const isSelected = selectedReplace === entry.yearMonth
          return (
            <label
              key={entry.yearMonth}
              className={`shelf-dialog__choice${isSelected ? ' is-selected' : ''}`}
            >
              <input
                type="radio"
                name={name}
                value={entry.yearMonth}
                checked={isSelected}
                onChange={() => {
                  setSelectedReplace(entry.yearMonth)
                  setNextFocus(undefined)
                }}
              />
              <span className="shelf-dialog__choice-body">
                <span className="shelf-dialog__choice-heading">
                  {entry.monthHeading}
                  {entry.title ? ` — ${entry.title}` : ''}
                </span>
                <span className="shelf-dialog__choice-meta">
                  {entry.isProtected && <Shield size={12} aria-hidden="true" />}
                  <span>{entry.statusLabel}</span>
                </span>
                {entry.isActiveFocus && (
                  <span className="shelf-dialog__choice-meta">Active Focus</span>
                )}
              </span>
            </label>
          )
        })}
      </fieldset>
      {needsFocusChoice && (
        <ShelfFocusChoices
          remainingEntries={currentEntries.filter(entry => entry.yearMonth !== selectedReplace)}
          nextFocus={nextFocus}
          onChange={setNextFocus}
        />
      )}
    </ShelfConfirmationDialog>
  )
}
