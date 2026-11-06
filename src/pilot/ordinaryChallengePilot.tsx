import { ArrowRight, FlaskConical } from 'lucide-react'
import type { CmsPortableText } from '../cms/sanity/types.ts'
import type { ChallengePlayerChallenge } from '../components/challenge/ChallengePlayer.tsx'
import { OrdinaryChallengeHost } from '../components/challenge/OrdinaryChallengeHost.tsx'
import {
  emptyOrdinaryChallengeSessionState,
  type OrdinaryChallengeSessionState,
} from '../components/challenge/ordinaryChallengeHostModel.ts'

/**
 * Isolated, rights-safe technical pilot for the ordinary-shell ChallengePlayer (Issue #44, A2).
 *
 * Loaded exclusively when `VITE_ENABLE_CHALLENGE_PILOT === 'true'`. Uses standalone synthetic
 * demonstration copy and reference-only Scripture metadata — never Developer Studio fixtures,
 * Sanity dataset documents, or fabricated Alexis teaching.
 */

const PILOT_CHALLENGE_ID = 'pilot-synthetic-ordinary-shell-a2'

function portableParagraph(key: string, text: string): CmsPortableText[number] {
  return {
    _key: key,
    _type: 'block',
    style: 'normal',
    markDefs: [],
    children: [
      {
        _key: `${key}-span`,
        _type: 'span',
        text,
        marks: [],
      },
    ],
  }
}

const syntheticPilotChallenge: ChallengePlayerChallenge = {
  title: 'Synthetic Player Pilot (Technical Sample)',
  summary:
    'Standalone non-editorial demonstration verifying that the normal Bibleberry app shell can open, navigate, and exit the shared ChallengePlayer.',
  primaryScripture: {
    id: 'pilot-primary-scripture',
    reference: 'Psalm 23:1',
    translation: 'WEBP',
    textStatus: 'referenceOnly',
    practiceStatus: 'notConfigured',
    usageRightsConfirmed: false,
  },
  screens: [
    {
      id: 'pilot-screen-overview',
      stepLabel: 'Screen 1 · Ordinary shell',
      title: 'Pilot screen one: normal app shell',
      blocks: [
        {
          id: 'pilot-block-intro',
          type: 'teachingText',
          requiredForCompletion: true,
          body: [
            portableParagraph(
              'pilot-p1',
              'This synthetic technical sample renders the shared ChallengePlayer directly inside the ordinary Bibleberry application shell.',
            ),
            portableParagraph(
              'pilot-p2',
              'Theme and reading text-size preferences from More apply here while keeping all demonstration controls strictly in memory for this browser tab.',
            ),
          ],
        },
        {
          id: 'pilot-block-boundary',
          type: 'statement',
          requiredForCompletion: true,
          label: 'Non-durable demonstration boundary',
          text: 'Saving this Challenge, saving a Scripture reference, or completing the final screen updates temporary in-memory state only and never writes to browser storage.',
        },
      ],
    },
    {
      id: 'pilot-screen-finish',
      stepLabel: 'Screen 2 · Optional study & finish',
      title: 'Pilot screen two: optional study and completion',
      blocks: [
        {
          id: 'pilot-block-second',
          type: 'teachingText',
          requiredForCompletion: true,
          body: [
            portableParagraph(
              'pilot-p3',
              'Continue and Back resolve stable screen identities and move focus to each screen heading. Expanding the optional section below is never required before completing this Challenge.',
            ),
          ],
        },
        {
          id: 'pilot-block-optional-study',
          type: 'optionalExploration',
          requiredForCompletion: false,
          title: 'Optional synthetic reference note',
          body: [
            portableParagraph(
              'pilot-p4',
              'Optional deeper study sections remain expandable and revisit-friendly without gating explicit final-screen completion.',
            ),
          ],
          scriptures: [
            {
              id: 'pilot-optional-scripture',
              reference: 'Colossians 3:16',
              translation: 'WEBP',
              textStatus: 'referenceOnly',
              practiceStatus: 'notConfigured',
              usageRightsConfirmed: false,
            },
          ],
        },
      ],
    },
  ],
  companionLinks: [],
}

export type OrdinaryChallengePilotEntryBarProps = {
  onOpenPilot: () => void
}

export function OrdinaryChallengePilotEntryBar({ onOpenPilot }: OrdinaryChallengePilotEntryBarProps) {
  return (
    <aside className="pilot-entry-bar" aria-label="Challenge player technical pilot">
      <div>
        <strong>TECHNICAL PILOT · NOT PUBLISHED CONTENT</strong>
        <p>Exercise the shared Challenge player in the normal app shell with a synthetic, in-memory sample.</p>
      </div>
      <a
        href="#/pilot/challenge"
        className="button button--secondary button--small"
        onClick={event => {
          event.preventDefault()
          onOpenPilot()
        }}
      >
        Open Challenge pilot <ArrowRight size={15} />
      </a>
    </aside>
  )
}

export type OrdinaryChallengePilotProps = {
  sessionState: OrdinaryChallengeSessionState | undefined
  onSessionStateChange: (next: OrdinaryChallengeSessionState) => void
  returnLabel: string
  onExit: () => void
}

export function OrdinaryChallengePilot({
  sessionState,
  onSessionStateChange,
  returnLabel,
  onExit,
}: OrdinaryChallengePilotProps) {
  const effectiveState = sessionState ?? emptyOrdinaryChallengeSessionState()
  const savedScriptureSummary = effectiveState.savedScriptures.length === 0
    ? '0 Scripture references saved'
    : `${effectiveState.savedScriptures.length} Scripture ${effectiveState.savedScriptures.length === 1 ? 'reference' : 'references'} saved (${effectiveState.savedScriptures.map(item => item.reference).join(', ')})`

  return (
    <OrdinaryChallengeHost
      challengeKey={PILOT_CHALLENGE_ID}
      challenge={syntheticPilotChallenge}
      state={effectiveState}
      onStateChange={onSessionStateChange}
      onExit={onExit}
      exitLabel={returnLabel}
      eyebrow="TECHNICAL PILOT · SYNTHETIC SAMPLE · NOT PUBLISHED CONTENT"
      banner={
        <aside className="pilot-disclosure" aria-label="Technical pilot disclosure">
          <FlaskConical size={18} aria-hidden="true" />
          <div>
            <strong>Synthetic technical pilot · Temporary in-memory demonstration</strong>
            <p>
              This non-editorial sample verifies the ordinary-shell player seam. Actions below stay in memory for this tab only (reset on reload; never written to reader history or Lab storage).
            </p>
            <p className="pilot-disclosure__status" role="status" aria-live="polite">
              Demo state: {effectiveState.isSaved ? 'Challenge saved' : 'Challenge not saved'} · {savedScriptureSummary} · {effectiveState.isCompleted ? 'Challenge completed' : 'Not completed'}
            </p>
          </div>
        </aside>
      }
    />
  )
}
