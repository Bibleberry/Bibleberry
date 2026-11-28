import { useState } from 'react'
import type { ExternalDeepLinkSourceAdapter } from '../../../src/deepLinkIngress/types.ts'
import { createPlatformReaderProfileStore } from '../../../src/readerProfile/platformStore.ts'
import type { ReaderProfileStore } from '../../../src/readerProfile/store.ts'
import R06ReaderShell from '../../../src/readerShell/R06ReaderShell.tsx'
import type { GuidedTutorialStepProps } from '../../../src/readerShell/entry/index.ts'

interface SeamBridgeWindow {
  __r06EnableTutorialSeam?: boolean
  __r06InitialExternalUrl?: string | null
  __r06GetInitialExternalUrl?: () => Promise<string | null>
  __r06EmitWarmExternalUrl?: (url: string) => void
  __r06DelayNextProfileUpdate?: boolean
  __r06OnProfileUpdateStarted?: () => void
  __r06ReleaseProfileUpdate?: () => void
}

function SyntheticTutorialSeam(props: GuidedTutorialStepProps) {
  return (
    <section aria-label="Synthetic Guided Tutorial Seam" data-testid="synthetic-tutorial-seam">
      <h1 tabIndex={-1}>Guided App Tutorial Seam ({props.mode})</h1>
      <p data-testid="synthetic-tutorial-tab">Shown tab: {props.shownTab}</p>
      <div className="r06-actions">
        <button type="button" onClick={() => props.onShowTab('library')}>
          Preview Library Step
        </button>
        <button type="button" onClick={() => void props.onSkip()}>
          Skip Tutorial
        </button>
        <button type="button" onClick={() => void props.onComplete()}>
          Complete Tutorial
        </button>
      </div>
    </section>
  )
}

export function SeamHarnessRoot() {
  const bridgeWindow = window as unknown as SeamBridgeWindow
  const [tutorialEnabled] = useState(() => Boolean(bridgeWindow.__r06EnableTutorialSeam))
  const [profileStore] = useState<ReaderProfileStore>(() => {
    const base = createPlatformReaderProfileStore()
    const wrappedUpdate: ReaderProfileStore['update'] = async updater => {
      if (bridgeWindow.__r06DelayNextProfileUpdate) {
        bridgeWindow.__r06DelayNextProfileUpdate = false
        const gate = new Promise<void>(resolve => {
          bridgeWindow.__r06ReleaseProfileUpdate = resolve
        })
        bridgeWindow.__r06OnProfileUpdateStarted?.()
        await gate
      }
      return base.update(updater)
    }
    return {
      ...base,
      update: wrappedUpdate,
      setTutorialStatus: status => wrappedUpdate({ tutorialStatus: status }),
    }
  })
  const [externalSource] = useState<ExternalDeepLinkSourceAdapter>(() => ({
    getInitialUrl: () =>
      bridgeWindow.__r06GetInitialExternalUrl
        ? bridgeWindow.__r06GetInitialExternalUrl()
        : (bridgeWindow.__r06InitialExternalUrl ?? null),
    subscribeUrlOpen(listener) {
      bridgeWindow.__r06EmitWarmExternalUrl = listener
      return () => {
        delete bridgeWindow.__r06EmitWarmExternalUrl
      }
    },
  }))

  return (
    <R06ReaderShell
      profileStore={profileStore}
      externalIngressSource={externalSource}
      externalIngressPolicy={{
        allowedHttpsHosts: ['reader.example.test'],
        allowedCustomSchemes: ['bibleberry'],
      }}
      renderGuidedTutorial={
        tutorialEnabled ? props => <SyntheticTutorialSeam {...props} /> : null
      }
    />
  )
}
