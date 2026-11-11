import { useEffect, useRef, useState, type ReactNode } from 'react'
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
  startOrdinaryChallengeProgress,
  toggleOrdinaryChallengeSaved,
  toggleOrdinaryScriptureSaved,
  type OrdinaryChallengeActions,
  type OrdinaryChallengeSessionState,
  type OrdinaryChallengeViewState,
} from './ordinaryChallengeHostModel.ts'

/**
 * Reusable ordinary-shell host adapter for `ChallengePlayer` (Issue #44 A2, extended in Issue #46 A3).
 *
 * Renders inside the normal `AppShell` reading column with reader-appropriate labels and no
 * dependency on Developer Studio, either Lab, CMS catalog fetching, or storage adapters.
 *
 * State contract:
 * - Controlled session mode requires `state` and `onStateChange` together.
 * - External actions mode requires `viewState` and `actions` together (used by `PersistedChallengeHost`).
 * - Uncontrolled mode omits both (optionally seeding `initialState`) and owns isolated in-memory
 *   session state with pure React state updaters.
 */
type OrdinaryChallengeHostBaseProps = {
  challengeKey: string
  challenge: ChallengePlayerChallenge
  onExit?: () => void
  exitLabel?: string
  returnOnFinish?: boolean
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
    viewState?: never
    actions?: never
  }
  | {
    viewState: OrdinaryChallengeViewState
    actions: OrdinaryChallengeActions
    state?: never
    onStateChange?: never
    initialState?: never
  }
  | {
    state?: undefined
    onStateChange?: never
    initialState?: OrdinaryChallengeSessionState
    viewState?: never
    actions?: never
  }

export type OrdinaryChallengeHostProps = OrdinaryChallengeHostBaseProps & OrdinaryChallengeHostStateProps

type OrdinaryChallengeHostFrameProps = OrdinaryChallengeHostBaseProps & {
  viewState: OrdinaryChallengeViewState
  actions: OrdinaryChallengeActions
}

function OrdinaryChallengeHostFrame({
  challengeKey,
  challenge,
  viewState,
  actions,
  onExit,
  exitLabel,
  returnOnFinish,
  eyebrow,
  banner,
  footer,
  labels,
}: OrdinaryChallengeHostFrameProps) {
  return (
    <div className="standard-page challenge-reader-page">
      {banner}
      <ChallengePlayer
        key={challengeKey}
        challenge={challenge}
        screenId={viewState.screenId}
        isSaved={viewState.isSaved}
        isCompleted={viewState.isCompleted}
        isInProgress={viewState.isInProgress}
        isScriptureSaved={viewState.isScriptureSaved}
        onScreenChange={actions.onScreenChange}
        onToggleSaveChallenge={actions.onToggleSaveChallenge}
        onToggleSaveScripture={actions.onToggleSaveScripture}
        onComplete={actions.onComplete}
        onStartProgress={actions.onStartProgress}
        onExit={onExit}
        exitLabel={exitLabel}
        returnOnFinish={returnOnFinish}
        eyebrow={eyebrow}
        labels={labels}
      />
      {footer}
    </div>
  )
}

type OrdinaryChallengeHostSessionViewProps = OrdinaryChallengeHostBaseProps & {
  session: OrdinaryChallengeSessionState
  applyChange: (updater: (current: OrdinaryChallengeSessionState) => OrdinaryChallengeSessionState) => void
}

function OrdinaryChallengeHostView({
  challenge,
  session,
  applyChange,
  returnOnFinish,
  onExit,
  ...restProps
}: OrdinaryChallengeHostSessionViewProps) {
  const finishHandledRef = useRef(false)

  useEffect(() => {
    if (!session.isCompleted) {
      finishHandledRef.current = false
    }
  }, [session.isCompleted, restProps.challengeKey])

  return (
    <OrdinaryChallengeHostFrame
      {...restProps}
      challenge={challenge}
      onExit={onExit}
      returnOnFinish={returnOnFinish}
      viewState={{
        screenId: session.screenId,
        isSaved: session.isSaved,
        isCompleted: session.isCompleted,
        isInProgress: session.isInProgress,
        isScriptureSaved: (scripture: CmsScripture) =>
          isOrdinaryScriptureSaved(session.savedScriptures, scripture),
      }}
      actions={{
        onScreenChange: screenId =>
          applyChange(current => setOrdinaryChallengeScreen(challenge, current, screenId)),
        onToggleSaveChallenge: () => applyChange(toggleOrdinaryChallengeSaved),
        onToggleSaveScripture: scripture =>
          applyChange(current => toggleOrdinaryScriptureSaved(current, scripture)),
        onComplete: () => {
          if (finishHandledRef.current || session.isCompleted) return
          finishHandledRef.current = true
          applyChange(current => completeOrdinaryChallenge(challenge, current))
          if (returnOnFinish) {
            onExit?.()
          }
        },
        onStartProgress: () => applyChange(startOrdinaryChallengeProgress),
      }}
    />
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
  const { state, onStateChange, initialState, viewState, actions, ...baseProps } = props
  const controller = resolveOrdinaryChallengeStateController({
    state,
    onStateChange,
    initialState,
    viewState,
    actions,
  })

  if (controller.mode === 'actions') {
    return (
      <OrdinaryChallengeHostFrame
        {...baseProps}
        viewState={controller.viewState}
        actions={controller.actions}
      />
    )
  }

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
