import type { CmsPortableText } from '../cms/sanity/types.ts'
import type { ChallengePlayerChallenge } from '../components/challenge/ChallengePlayer.tsx'
import { admitPilotSampleChallenge } from '../participation/admission.ts'
import { createWebLocalStorageDriver } from '../participation/drivers/webLocalStorageDriver.ts'
import {
  createEnvelopePersistenceAdapter,
  type KeyValueStorageDriver,
} from '../participation/persistence.ts'
import { createReaderParticipationStore } from '../participation/store.ts'

/**
 * Isolated model & store wiring for the opt-in A3 participation persistence pilot (Issue #46).
 *
 * Loaded exclusively when `VITE_ENABLE_PARTICIPATION_PILOT === 'true'`. Uses dedicated storage key
 * `bibleberry-participation-pilot-v1` and `pilot:` namespace so synthetic test actions can never
 * enter `bibleberry-reader-participation-v1`, `bibleberry-prototype-v1`, or either Lab namespace.
 */

export const PARTICIPATION_PILOT_STORAGE_KEY = 'bibleberry-participation-pilot-v1'
export const PARTICIPATION_PILOT_SAMPLE_ID = 'a3-persistence-sample'
export const PARTICIPATION_PILOT_SINGLE_SCREEN_SAMPLE_ID = 'a3-single-screen-sample'

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

export const syntheticParticipationPilotChallenge: ChallengePlayerChallenge = {
  title: 'Synthetic Participation Pilot (Persistence Sample)',
  summary:
    'Standalone non-editorial demonstration verifying durable Challenge resume, Scripture saving, and distinct completion across full page reloads.',
  primaryScripture: {
    id: 'a3-pilot-primary-scripture',
    reference: '1 Thessalonians 5:16–18',
    translation: 'WEBP',
    textStatus: 'referenceOnly',
    practiceStatus: 'notConfigured',
    usageRightsConfirmed: false,
  },
  screens: [
    {
      id: 'a3-pilot-screen-one',
      stepLabel: 'Screen 1 · Durable progress',
      title: 'Persistence pilot screen one: open, save, and resume',
      blocks: [
        {
          id: 'a3-pilot-block-intro',
          type: 'teachingText',
          requiredForCompletion: true,
          body: [
            portableParagraph(
              'a3-pilot-p1',
              'This synthetic technical sample connects PersistedChallengeHost and the platform-neutral participation store inside the ordinary Bibleberry shell.',
            ),
            portableParagraph(
              'a3-pilot-p2',
              'Opening records only the last-opened pointer. Moving across screens records uncompleted resume state—including if you navigate Back to Screen 1—without counting as completion.',
            ),
          ],
        },
        {
          id: 'a3-pilot-block-boundary',
          type: 'statement',
          requiredForCompletion: true,
          label: 'Isolated pilot storage boundary',
          text: 'Actions in this pilot persist only under an isolated pilot namespace and never touch production reader participation records or Developer Studio Labs.',
        },
      ],
    },
    {
      id: 'a3-pilot-screen-two',
      stepLabel: 'Screen 2 · Optional study & completion',
      title: 'Persistence pilot screen two: explicit completion and reread',
      blocks: [
        {
          id: 'a3-pilot-block-second',
          type: 'teachingText',
          requiredForCompletion: true,
          body: [
            portableParagraph(
              'a3-pilot-p3',
              'Explicit completion on this final screen records the Challenge once, clears durable in-progress state, and starts future rereads cleanly on Screen 1 without inflating your distinct total.',
            ),
          ],
        },
        {
          id: 'a3-pilot-block-optional',
          type: 'optionalExploration',
          requiredForCompletion: false,
          title: 'Optional synthetic Scripture reference check',
          body: [
            portableParagraph(
              'a3-pilot-p4',
              'Saving the optional reference below stores normalized citation metadata only, with unconfigured translation labels normalized to null and zero Bible passage text persisted.',
            ),
          ],
          scriptures: [
            {
              id: 'a3-pilot-optional-scripture',
              reference: 'John 11:33–35',
              translation: 'Not configured',
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

const admitted = admitPilotSampleChallenge({
  sampleId: PARTICIPATION_PILOT_SAMPLE_ID,
  screens: syntheticParticipationPilotChallenge.screens,
})

if (!admitted) {
  throw new Error('Failed to initialize synthetic participation pilot challenge admission.')
}

export const admittedParticipationPilotChallenge = admitted

export const singleScreenParticipationPilotChallenge: ChallengePlayerChallenge = {
  title: 'Synthetic Single-Screen Participation Pilot',
  summary:
    'Standalone single-screen demonstration verifying host-level Start Challenge, durable resume, and explicit completion.',
  primaryScripture: syntheticParticipationPilotChallenge.primaryScripture,
  screens: [syntheticParticipationPilotChallenge.screens[0]!],
  companionLinks: [],
}

const admittedSingle = admitPilotSampleChallenge({
  sampleId: PARTICIPATION_PILOT_SINGLE_SCREEN_SAMPLE_ID,
  screens: singleScreenParticipationPilotChallenge.screens,
})

if (!admittedSingle) {
  throw new Error('Failed to initialize synthetic single-screen participation pilot admission.')
}

export const singleScreenAdmittedParticipationPilotChallenge = admittedSingle

function createPilotStorageDriver(): KeyValueStorageDriver {
  const baseDriver = createWebLocalStorageDriver()
  const asyncDelayParam =
    typeof window !== 'undefined'
      ? Number(new URLSearchParams(window.location.search).get('pilotAsyncMs') ?? '0')
      : 0

  if (!Number.isFinite(asyncDelayParam) || asyncDelayParam <= 0) {
    return baseDriver
  }

  const delayMs = Math.min(Math.trunc(asyncDelayParam), 2000)
  const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

  return {
    async getItem(key: string) {
      await sleep(delayMs)
      return baseDriver.getItem(key)
    },
    async setItem(key: string, value: string) {
      await sleep(delayMs)
      await baseDriver.setItem(key, value)
    },
    async removeItem(key: string) {
      // Intentionally faster than `setItem` to exercise delayed-write vs reset serialization in browser tests
      await sleep(Math.max(5, Math.floor(delayMs / 6)))
      await baseDriver.removeItem(key)
    },
    onExternalChange: baseDriver.onExternalChange,
  }
}

export const participationPilotStore = createReaderParticipationStore(
  createEnvelopePersistenceAdapter({
    storageKey: PARTICIPATION_PILOT_STORAGE_KEY,
    allowedNamespace: 'pilot',
    driver: createPilotStorageDriver(),
  }),
  { allowedNamespace: 'pilot' },
)

export function resetParticipationPilotData(): Promise<void> {
  return participationPilotStore.clearLocalData()
}
