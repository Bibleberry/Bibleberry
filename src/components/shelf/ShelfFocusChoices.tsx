import { useId } from 'react'
import type { PublicationYearMonth } from '../../participation/types.ts'
import type { ShelfEntryViewModel } from './shelfModel.ts'

interface ShelfFocusChoicesProps {
  readonly remainingEntries: readonly ShelfEntryViewModel[]
  readonly nextFocus: PublicationYearMonth | null | undefined
  readonly onChange: (choice: PublicationYearMonth | null) => void
}

export function ShelfFocusChoices({ remainingEntries, nextFocus, onChange }: ShelfFocusChoicesProps) {
  const name = useId()
  const choices = remainingEntries.map<{ value: PublicationYearMonth | null; label: string }>(entry => ({
    value: entry.yearMonth,
    label: entry.title ? `${entry.monthHeading} — ${entry.title}` : entry.monthHeading,
  }))
  choices.push({ value: null, label: 'No focus for now' })

  return (
    <fieldset className="shelf-dialog__choices">
      <legend className="shelf-dialog__legend">Choose your Active Focus</legend>
      {choices.map(({ value, label }) => (
        <label key={value ?? 'none'} className={`shelf-dialog__choice${nextFocus === value ? ' is-selected' : ''}`}>
          <input
            type="radio"
            name={name}
            value={value ?? 'none'}
            checked={nextFocus === value}
            onChange={() => onChange(value)}
          />
          <span className="shelf-dialog__choice-heading">{label}</span>
        </label>
      ))}
    </fieldset>
  )
}
