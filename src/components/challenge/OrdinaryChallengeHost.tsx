import { useState, type ReactNode } from 'react'
import type { CmsScripture } from '../../cms/sanity/types.ts'
import {
  ChallengePlayer,
  type ChallengePlayerChallenge,
  type ChallengePlayerProps,
} from './ChallengePlayer.tsx'
import {
  applyControlledOrdinaryChallengeChange,
  completeOrdinaryChallenge,
  emptyOrdinaryChallengeSessionState,
  isOrdinaryScriptureSaved,
  resolveOrdinaryChallengeStateController,
  setOrdinaryChallengeScreen,
  toggleOrdinaryChallengeSaved,
  toggleOrdinaryScriptureSaved,
  type OrdinaryChallengeSessionState,
} from './ordinaryChallengeHostModel.ts'

/**
 * Reusable ordinary-shell host adapter for `ChallengePlayer` (Issue #44, A2).
 *
 * Renders inside the normal `AppShell` reading column with reader-appropriate labels and no
 * dependency on Developer Studio, either Lab, CMS catalog fetching, or browser storage.
 *
 * State contract:
 * - Controlled mode requires `state` and `onStateChange` together.
 * - Uncontrolled mode omits both `state` and `onStateChange` (optionally seeding `initialState`)
 *   and owns isolated in-memory session state with pure React state updaters.
 */
type OrdinaryChallengeHostBaseProps = {
  challengeKey: string
  challenge: ChallengePlayerChallenge
  onExit?: () => void
  exitLabel?: string
  eyebrow?: ReactNode
  banner?: ReactNode
  footer?: ReactNode
  labels?: ChallengePlayerProps['labels']
}

export type OrdinaryChallengeHostStateProps =
  | {
    state: OrdinaryChallengeSessionState
    onStateChange: (next: OrdinaryChallengeSessionState) => void
    initialState?: never
  }
  | {
    state?: undefined
    onStateChange?: never
    initialState?: OrdinaryChallengeSessionState
  }

export type OrdinaryChallengeHostProps = OrdinaryChallengeHostBaseProps & OrdinaryChallengeHostStateProps

type OrdinaryChallengeHostViewProps = OrdinaryChallengeHostBaseProps & {
  session: OrdinaryChallengeSessionState
  applyChange: (updater: (current: OrdinaryChallengeSessionState) => OrdinaryChallengeSessionState) => void
}

function OrdinaryChallengeHostView({
  challengeKey,
  challenge,
  session,
  applyChange,
  onExit,
  exitLabel,
  eyebrow,
  banner,
  footer,
  labels,
}: OrdinaryChallengeHostViewProps) {
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

function UncontrolledOrdinaryChallengeHost({
  initialState,
  ...baseProps
}: OrdinaryChallengeHostBaseProps & { initialState: OrdinaryChallengeSessionState | undefined }) {
  const [session, setSession] = useState<OrdinaryChallengeSessionState>(
    () => initialState ?? emptyOrdinaryChallengeSessionState(),
  )

  return (
    <OrdinaryChallengeHostView
      {...baseProps}
      session={session}
      applyChange={setSession}
    />
  )
}

export function OrdinaryChallengeHost(props: OrdinaryChallengeHostProps) {
  const { state, onStateChange, initialState, ...baseProps } = props
  const controller = resolveOrdinaryChallengeStateController({
    state,
    onStateChange,
    initialState,
  })

  if (controller.mode === 'controlled') {
    return (
      <OrdinaryChallengeHostView
        {...baseProps}
        session={controller.state}
        applyChange={updater =>
          applyControlledOrdinaryChallengeChange(controller.state, controller.onStateChange, updater)
        }
      />
    )
  }

  return (
    <UncontrolledOrdinaryChallengeHost
      key={baseProps.challengeKey}
      {...baseProps}
      initialState={controller.initialState}
    />
  )
}
