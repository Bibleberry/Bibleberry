import { Bookmark, BookmarkCheck } from 'lucide-react'
import { normalizeScriptureTranslation } from '../../participation/identity.ts'

export interface SaveScriptureButtonProps {
  readonly reference: string
  readonly translation?: string | null
  readonly isSaved: boolean
  readonly disabled?: boolean
  readonly isHydrating?: boolean
  readonly hasPendingWrites?: boolean
  readonly compact?: boolean
  readonly collectionLabel?: string
  readonly describedBy?: string
  readonly className?: string
  readonly onToggle: () => void
}

function formatCitationForAria(reference: string, translation?: string | null): string {
  const trimmedRef = reference.trim() || 'Scripture reference'
  const normalizedTranslation = normalizeScriptureTranslation(translation)
  return normalizedTranslation ? `${trimmedRef} (${normalizedTranslation})` : trimmedRef
}

/**
 * Small, accessible Save Scripture toggle button suitable for embedding across
 * reader surfaces (Challenge panels, Month/Library views, News, or cards).
 */
export function SaveScriptureButton({
  reference,
  translation,
  isSaved,
  disabled = false,
  isHydrating = false,
  hasPendingWrites = false,
  compact = false,
  collectionLabel = 'Saved Scripture',
  describedBy,
  className,
  onToggle,
}: SaveScriptureButtonProps) {
  const citationLabel = formatCitationForAria(reference, translation)
  const ariaLabel = isHydrating
    ? `Loading ${collectionLabel} status for ${citationLabel}`
    : isSaved
      ? `Remove ${citationLabel} from ${collectionLabel}`
      : `Save ${citationLabel} to ${collectionLabel}`

  const visibleLabel = isHydrating
    ? 'Loading…'
    : compact
      ? isSaved
        ? 'Saved'
        : 'Save'
      : isSaved
        ? 'Remove from Saved Scripture'
        : 'Save Scripture'

  const classes = [
    'button',
    isSaved ? 'button--text' : 'button--secondary',
    'scripture-capture__button',
    isSaved ? 'scripture-capture__button--saved' : 'scripture-capture__button--unsaved',
    compact ? 'scripture-capture__button--compact' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      type="button"
      className={classes}
      aria-pressed={isSaved}
      aria-label={ariaLabel}
      aria-busy={isHydrating || hasPendingWrites ? true : undefined}
      aria-describedby={describedBy}
      disabled={disabled || isHydrating}
      onClick={onToggle}
    >
      {isSaved ? <BookmarkCheck size={16} aria-hidden="true" /> : <Bookmark size={16} aria-hidden="true" />}
      <span>{visibleLabel}</span>
    </button>
  )
}
