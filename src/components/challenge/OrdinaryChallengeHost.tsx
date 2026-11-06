import { useState, type ReactNode } from 'react'
import type { CmsScripture } from '../../cms/sanity/types.ts'
import {
  ChallengePlayer,
  type ChallengePlayerChallenge,
  type ChallengePlayerProps,
} from './ChallengePlayer.tsx'
import {
  completeOrdinaryChallenge,
  emptyOrdinaryChallengeSessionState,
  isOrdinaryScriptureSaved,
  setOrdinaryChallengeScreen,
  toggleOrdinaryChallengeSaved,
  toggleOrdinaryScriptureSaved,
  type OrdinaryChallengeSessionState,
} from './ordinaryChallengeHostModel.ts'

/**
 * Reusable ordinary-shell host adapter for `ChallengePlayer` (Issue #44, A2).
 *
 * Renders inside the normal `AppShell` reading column with reader-appropriate labels and no
 * dependency on Developer Studio, either Lab, CMS catalog fetching, or browser storage. Hosts
 * may pass controlled session state or let the adapter manage isolated in-memory state.
 */
export type OrdinaryChallengeHostProps = {
  challengeKey: string
  challenge: ChallengePlayerChallenge
  state?: OrdinaryChallengeSessionState
  onStateChange?: (next: OrdinaryChallengeSessionState) => void
  onExit?: () => void
  exitLabel?: string
  eyebrow?: ReactNode
  banner?: ReactNode
  footer?: ReactNode
  labels?: ChallengePlayerProps['labels']
}

export function OrdinaryChallengeHost({
  challengeKey,
  challenge,
  state: controlledState,
  onStateChange,
  onExit,
  exitLabel,
  eyebrow,
  banner,
  footer,
  labels,
}: OrdinaryChallengeHostProps) {
  const [internalState, setInternalState] = useState<OrdinaryChallengeSessionState>(
    emptyOrdinaryChallengeSessionState,
  )
  const session = controlledState ?? internalState
  const applyChange = (updater: (current: OrdinaryChallengeSessionState) => OrdinaryChallengeSessionState) => {
    if (controlledState && onStateChange) {
      onStateChange(updater(controlledState))
    } else {
      setInternalState(previous => {
        const next = updater(previous)
        onStateChange?.(next)
        return next
      })
    }
  }

  return (
    <div className="standard-page challenge-reader-page">
      {banner}
      <ChallengePlayer
        key={challengeKey}
        challenge={challenge}
        screenId={session.screenId}
        isSaved={session.isSaved}
        isCompleted={session.isCompleted}
        isScriptureSaved={(scripture: CmsScripture) => isOrdinaryScriptureSaved(session.savedScriptures, scripture)}
        onScreenChange={screenId => applyChange(current => setOrdinaryChallengeScreen(challenge, current, screenId))}
        onToggleSaveChallenge={() => applyChange(toggleOrdinaryChallengeSaved)}
        onToggleSaveScripture={scripture => applyChange(current => toggleOrdinaryScriptureSaved(current, scripture))}
        onComplete={() => applyChange(current => completeOrdinaryChallenge(challenge, current))}
        onExit={onExit}
        exitLabel={exitLabel}
        eyebrow={eyebrow}
        labels={labels}
      />
      {footer}
    </div>
  )
}
