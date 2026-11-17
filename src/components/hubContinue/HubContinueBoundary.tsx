import { useMemo } from 'react'
import { deriveHubContinueSuggestion } from '../../hubContinue/engine.ts'
import type { HubContinueInput, HubContinueSuggestion } from '../../hubContinue/types.ts'
import type { PublicationYearMonth } from '../../participation/types.ts'
import { HubContinueCard } from './HubContinueCard.tsx'

export interface HubContinueBoundaryProps {
  /** Approved reader data used to derive at most one Continue suggestion. */
  readonly input: HubContinueInput
  /** Called when the reader activates the Continue Challenge action. */
  readonly onContinueChallenge: (suggestion: HubContinueSuggestion) => void
  /** Optional callback to open the suggested month's Month Screen. */
  readonly onOpenMonth?: (yearMonth: PublicationYearMonth) => void
  /** Optional class name for layout composition in a host container. */
  readonly className?: string
}

/**
 * Standalone Hub Continue presentation boundary.
 *
 * Derives the suggestion purely from approved reader data via `deriveHubContinueSuggestion`
 * and renders `HubContinueCard` with typed callbacks. Not wired into `src/App.tsx` here.
 */
export function HubContinueBoundary({
  input,
  onContinueChallenge,
  onOpenMonth,
  className,
}: HubContinueBoundaryProps) {
  const result = useMemo(() => deriveHubContinueSuggestion(input), [input])

  return (
    <HubContinueCard
      suggestion={result.suggestion}
      onContinueChallenge={onContinueChallenge}
      onOpenMonth={onOpenMonth}
      className={className}
    />
  )
}
