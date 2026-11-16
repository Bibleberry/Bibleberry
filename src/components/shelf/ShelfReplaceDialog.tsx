import { useRef, useState } from 'react'
import { Shield, X } from 'lucide-react'
import type { PublicationYearMonth } from '../../participation/types.ts'
import { useModalDialogFocus } from '../savedScripture/useModalDialogFocus.ts'
import { formatPublicationMonthHeading, type ShelfEntryViewModel } from './shelfModel.ts'

export interface ShelfReplaceDialogProps {
  readonly isOpen: boolean
  readonly incomingYearMonth: PublicationYearMonth | null
  readonly incomingTitle?: string | null
  readonly currentEntries: readonly ShelfEntryViewModel[]
  readonly onConfirmReplace: (replaceYearMonth: PublicationYearMonth) => void
  readonly onCancel: () => void
}

/**
 * Accessible modal dialog requiring the reader to explicitly choose which
 * existing Shelf month to replace when all 3 slots are occupied.
 *
 * Policy invariant:
 * - Silent auto-eviction on reader selection is forbidden.
 * - Protected months remain clearly labeled so the reader makes an informed choice.
 */
export function ShelfReplaceDialog({
  isOpen,
  incomingYearMonth,
  incomingTitle,
  currentEntries,
  onConfirmReplace,
  onCancel,
}: ShelfReplaceDialogProps) {
  if (!isOpen || !incomingYearMonth) {
    return null
  }

  return (
    <ShelfReplaceDialogContent
      key={incomingYearMonth}
      incomingYearMonth={incomingYearMonth}
      incomingTitle={incomingTitle}
      currentEntries={currentEntries}
      onConfirmReplace={onConfirmReplace}
      onCancel={onCancel}
    />
  )
}

interface ShelfReplaceDialogContentProps {
  readonly incomingYearMonth: PublicationYearMonth
  readonly incomingTitle?: string | null
  readonly currentEntries: readonly ShelfEntryViewModel[]
  readonly onConfirmReplace: (replaceYearMonth: PublicationYearMonth) => void
  readonly onCancel: () => void
}

function ShelfReplaceDialogContent({
  incomingYearMonth,
  incomingTitle,
  currentEntries,
  onConfirmReplace,
  onCancel,
}: ShelfReplaceDialogContentProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const initialFocusRef = useRef<HTMLButtonElement | null>(null)
  const [selectedReplace, setSelectedReplace] = useState<PublicationYearMonth | null>(null)

  useModalDialogFocus({
    isOpen: true,
    dialogRef,
    initialFocusRef,
    onClose: onCancel,
  })

  const incomingHeading = formatPublicationMonthHeading(incomingYearMonth)
  const incomingLabel = incomingTitle ? `${incomingHeading} (${incomingTitle})` : incomingHeading

  return (
    <div className="shelf-dialog-backdrop" role="presentation" onClick={onCancel}>
      <div
        ref={dialogRef}
        className="shelf-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shelf-replace-dialog-title"
        aria-describedby="shelf-replace-dialog-desc"
        tabIndex={-1}
        onClick={event => event.stopPropagation()}
      >
        <div className="shelf-dialog__header">
          <h2 id="shelf-replace-dialog-title" className="shelf-dialog__title">
            Choose a Month to Replace
          </h2>
          <button
            ref={initialFocusRef}
            type="button"
            className="shelf-dialog__close"
            onClick={onCancel}
            aria-label="Cancel replacement"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <p id="shelf-replace-dialog-desc" className="shelf-dialog__desc">
          Your Shelf holds up to 3 historical months. Select which month to put away so you can
          place <strong>{incomingLabel}</strong> on your Shelf. Putting a month away never deletes
          completed Challenges or saved Scripture.
        </p>

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
                  name="shelf-replace-month"
                  value={entry.yearMonth}
                  checked={isSelected}
                  onChange={() => setSelectedReplace(entry.yearMonth)}
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
                </span>
              </label>
            )
          })}
        </fieldset>

        <div className="shelf-dialog__actions">
          <button type="button" className="shelf-btn shelf-btn--secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="shelf-btn shelf-btn--primary"
            disabled={!selectedReplace}
            onClick={() => {
              if (selectedReplace) {
                onConfirmReplace(selectedReplace)
              }
            }}
          >
            Replace Selected Month
          </button>
        </div>
      </div>
    </div>
  )
}
