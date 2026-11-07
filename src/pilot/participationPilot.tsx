import { ArrowRight, FlaskConical, RotateCcw } from 'lucide-react'
import { PersistedChallengeHost } from '../participation/PersistedChallengeHost.tsx'
import { selectChallengeParticipationView } from '../participation/model.ts'
import { useReaderParticipation } from '../participation/useReaderParticipation.ts'
import {
  admittedParticipationPilotChallenge,
  participationPilotStore,
  resetParticipationPilotData,
  singleScreenAdmittedParticipationPilotChallenge,
  singleScreenParticipationPilotChallenge,
  syntheticParticipationPilotChallenge,
} from './participationPilotModel.ts'

/**
 * Isolated, rights-safe technical pilot for durable reader participation state (Issue #46, A3).
 *
 * Loaded exclusively when `VITE_ENABLE_PARTICIPATION_PILOT === 'true'`.
 */

export type ParticipationPilotEntryBarProps = {
  onOpenPilot: () => void
}

export function ParticipationPilotEntryBar({ onOpenPilot }: ParticipationPilotEntryBarProps) {
  return (
    <aside className="pilot-entry-bar" aria-label="Participation persistence technical pilot">
      <div>
        <strong>TECHNICAL PILOT · ISOLATED PERSISTENCE · NOT PUBLISHED CONTENT</strong>
        <p>Exercise durable Challenge resume, Scripture saving, and distinct completion across reloads.</p>
      </div>
      <a
        href="#/pilot/participation"
        className="button button--secondary button--small"
        onClick={event => {
          event.preventDefault()
          onOpenPilot()
        }}
      >
        Open participation pilot <ArrowRight size={15} />
      </a>
    </aside>
  )
}

export type ParticipationPilotProps = {
  returnLabel: string
  onExit: () => void
}

export function ParticipationPilot({ returnLabel, onExit }: ParticipationPilotProps) {
  const isSingleScreen =
    typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('pilotSingleScreen') === 'true'

  const admitted = isSingleScreen
    ? singleScreenAdmittedParticipationPilotChallenge
    : admittedParticipationPilotChallenge

  const challenge = isSingleScreen
    ? singleScreenParticipationPilotChallenge
    : syntheticParticipationPilotChallenge

  const snapshot = useReaderParticipation(participationPilotStore)
  const view = selectChallengeParticipationView(
    snapshot.data,
    admitted.challengeId,
  )

  const savedScriptureSummary = snapshot.data.savedScriptures.length === 0
    ? '0 Scripture references saved'
    : `${snapshot.data.savedScriptures.length} Scripture ${snapshot.data.savedScriptures.length === 1 ? 'reference' : 'references'} saved (${snapshot.data.savedScriptures
        .map(entry => (entry.translation ? `${entry.reference} [${entry.translation}]` : entry.reference))
        .join(', ')})`

  const statusDetail = view.isCompleted
    ? `completed (${view.completedOn ?? ''})`
    : view.isInProgress
      ? `inProgress (${view.resumeScreenId ?? 'started'})`
      : 'notStarted'

  return (
    <PersistedChallengeHost
      key={admitted.challengeId}
      store={participationPilotStore}
      admittedChallenge={admitted}
      challenge={challenge}
      expectedNamespace="pilot"
      onExit={onExit}
      exitLabel={returnLabel}
      eyebrow={
        isSingleScreen
          ? 'TECHNICAL PILOT · SINGLE-SCREEN PERSISTENCE SAMPLE · NOT PUBLISHED CONTENT'
          : 'TECHNICAL PILOT · SYNTHETIC PERSISTENCE SAMPLE · NOT PUBLISHED CONTENT'
      }
      banner={
        <aside className="pilot-disclosure" aria-label="Persistence pilot disclosure">
          <FlaskConical size={18} aria-hidden="true" />
          <div>
            <strong>
              {isSingleScreen
                ? 'Synthetic single-screen pilot · Isolated local participation store'
                : 'Synthetic persistence pilot · Isolated local participation store'}
            </strong>
            <p>
              This non-editorial sample verifies durable participation state across reloads in an isolated pilot namespace (never written to production reader history or Lab storage).
            </p>
            <p className="pilot-disclosure__status" role="status" aria-live="polite">
              Store: {snapshot.status} ({snapshot.health}) · Distinct completed: {snapshot.distinctCompletedCount} · Status: {statusDetail} · {view.isSaved ? 'Challenge saved' : 'Challenge not saved'} · {savedScriptureSummary}
            </p>
            <button
              type="button"
              className="button button--secondary button--small"
              onClick={() => {
                void resetParticipationPilotData()
              }}
            >
              <RotateCcw size={14} /> Reset pilot data
            </button>
          </div>
        </aside>
      }
    />
  )
}
