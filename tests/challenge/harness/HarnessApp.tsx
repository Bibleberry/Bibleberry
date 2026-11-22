import { useState } from 'react'
import type { CmsPortableText } from '../../../src/cms/sanity/types.ts'
import { ChallengePlayer, type ChallengePlayerChallenge } from '../../../src/components/challenge/ChallengePlayer.tsx'
import { admitTrustedCatalogChallenge } from '../../../src/participation/admission.ts'
import { createWebLocalStorageDriver } from '../../../src/participation/drivers/webLocalStorageDriver.ts'
import { parseLocalCalendarDate } from '../../../src/participation/identity.ts'
import { selectChallengeParticipationView } from '../../../src/participation/model.ts'
import { createEnvelopePersistenceAdapter } from '../../../src/participation/persistence.ts'
import { PersistedChallengeHost } from '../../../src/participation/PersistedChallengeHost.tsx'
import { createReaderParticipationStore } from '../../../src/participation/store.ts'
import { useReaderParticipation } from '../../../src/participation/useReaderParticipation.ts'

const CHALLENGE_HARNESS_STORAGE_KEY = 'bibleberry-river-lantern-harness-v1'

function paragraph(key: string, text: string): CmsPortableText[number] {
  return {
    _key: key,
    _type: 'block',
    style: 'normal',
    markDefs: [],
    children: [{ _key: `${key}-span`, _type: 'span', text, marks: [] }],
  }
}

const sampleChallenge: ChallengePlayerChallenge = {
  title: 'River Lantern Synthetic Teaching',
  summary: 'Non-editorial test fixture for focused Challenge Reader controls.',
  primaryScripture: {
    id: 'rl-primary-scripture',
    reference: 'Psalm 119:105',
    translation: 'WEBP',
    textStatus: 'referenceOnly',
    practiceStatus: 'notConfigured',
    usageRightsConfirmed: false,
  },
  screens: [
    {
      id: 'rl-screen-1',
      stepLabel: 'Part 1',
      title: 'Opening Reflection Screen',
      blocks: [
        {
          id: 'rl-b1',
          type: 'teachingText',
          requiredForCompletion: true,
          body: [
            paragraph(
              'rl-p1',
              'Selectable prose sentence for verifying undisturbed text selection and vertical scrolling.',
            ),
            ...Array.from({ length: 12 }, (_, idx) =>
              paragraph(
                `rl-scroll-${idx}`,
                `Synthetic vertical scroll filler paragraph ${idx + 1}. This non-editorial fixture text verifies vertical scrolling remains completely native and unobstructed.`,
              ),
            ),
          ],
        },
      ],
    },
    {
      id: 'rl-screen-2',
      stepLabel: 'Part 2',
      title: 'Middle Reflection Screen',
      blocks: [
        {
          id: 'rl-b2',
          type: 'teachingText',
          requiredForCompletion: true,
          body: [
            paragraph('rl-p2', 'Middle screen synthetic text for verifying Previous, Next, and Start from Beginning.'),
          ],
        },
      ],
    },
    {
      id: 'rl-screen-3',
      stepLabel: 'Part 3',
      title: 'Final Reflection Screen',
      blocks: [
        {
          id: 'rl-b3',
          type: 'teachingText',
          requiredForCompletion: true,
          body: [
            paragraph('rl-p3', 'Final screen synthetic text for verifying explicit Finish and Read Again.'),
          ],
        },
      ],
    },
  ],
  companionLinks: [],
}

const admittedSample = admitTrustedCatalogChallenge({
  documentId: 'river-lantern-sample',
  screens: sampleChallenge.screens,
  editorial: { adaptationReviewed: true, reviewedAt: '2026-11-21T12:00:00Z' },
})!

const harnessStore = createReaderParticipationStore(
  createEnvelopePersistenceAdapter({
    storageKey: CHALLENGE_HARNESS_STORAGE_KEY,
    driver: createWebLocalStorageDriver(),
  }),
)

const FIXED_DATE = parseLocalCalendarDate('2026-11-21')!

function DiagnosticsHarness() {
  const [screenId, setScreenId] = useState<string>('rl-screen-1')
  const [completed, setCompleted] = useState(false)
  return (
    <main className="standard-page challenge-reader-page">
      <ChallengePlayer
        challenge={sampleChallenge}
        screenId={screenId}
        isSaved={false}
        isCompleted={completed}
        isScriptureSaved={() => false}
        onScreenChange={setScreenId}
        onToggleSaveChallenge={() => {}}
        onToggleSaveScripture={() => {}}
        onComplete={() => setCompleted(true)}
        diagnostics
        labels={{
          scriptureCollection: 'CMS My Scripture',
          progressHeading: 'Required screens',
          progress: 'CMS required Challenge screen position',
          navigation: 'CMS Challenge screen navigation',
        }}
      />
    </main>
  )
}

export function ChallengeReaderHarnessApp() {
  const params = new URLSearchParams(window.location.search)
  const mode = params.get('mode') ?? 'persisted'
  const [open, setOpen] = useState(true)
  const [readAgain, setReadAgain] = useState(params.get('readAgain') === 'true')
  const [rereadSessionKey, setRereadSessionKey] = useState(0)
  const [exitCount, setExitCount] = useState(0)
  const [completionDispatches, setCompletionDispatches] = useState(0)

  const snapshot = useReaderParticipation(harnessStore)
  const view = selectChallengeParticipationView(snapshot.data, admittedSample.challengeId)

  if (mode === 'diagnostics') {
    return <DiagnosticsHarness />
  }

  const returnOnFinish = mode === 'persisted' || mode === 'defaultExit'
  const supplyExit = mode !== 'noExit'
  const exitLabel = mode === 'defaultExit' ? undefined : 'Return to Host'

  return (
    <div>
      <aside className="pilot-disclosure" data-testid="harness-telemetry">
        <p data-testid="telemetry-counts">
          Exits: {exitCount} · Completions dispatched: {completionDispatches} · Distinct completed: {snapshot.distinctCompletedCount} · Status: {view.status}
        </p>
        {!open && (
          <div>
            <button
              type="button"
              className="button button--primary"
              data-testid="host-reopen-btn"
              onClick={() => {
                setReadAgain(view.isCompleted)
                setRereadSessionKey(prev => prev + 1)
                setOpen(true)
              }}
            >
              {view.isCompleted ? 'Read Again' : 'Resume Challenge'}
            </button>
          </div>
        )}
      </aside>
      {open ? (
        <PersistedChallengeHost
          store={harnessStore}
          admittedChallenge={admittedSample}
          challenge={sampleChallenge}
          expectedNamespace="cms"
          getToday={() => FIXED_DATE}
          returnOnFinish={returnOnFinish}
          readAgain={readAgain}
          rereadSessionKey={rereadSessionKey}
          onExit={
            supplyExit
              ? () => {
                  setExitCount(prev => prev + 1)
                  setOpen(false)
                }
              : undefined
          }
          exitLabel={exitLabel}
          onCompletionDispatched={() => {
            setCompletionDispatches(prev => prev + 1)
          }}
        />
      ) : (
        <section data-testid="host-returned-surface" className="standard-page">
          <h1>Host Surface</h1>
          <p>Returned to host safely.</p>
        </section>
      )}
    </div>
  )
}
