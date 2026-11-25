import { useState } from 'react'
import type { ExternalDeepLinkSourceAdapter } from '../../../src/deepLinkIngress/types.ts'
import R06ReaderShell from '../../../src/readerShell/R06ReaderShell.tsx'
import type { GuidedTutorialStepProps } from '../../../src/readerShell/entry/index.ts'

interface SeamBridgeWindow {
  __r06EnableTutorialSeam?: boolean
  __r06InitialExternalUrl?: string | null
  __r06EmitWarmExternalUrl?: (url: string) => void
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
  const [externalSource] = useState<ExternalDeepLinkSourceAdapter>(() => ({
    getInitialUrl: () => bridgeWindow.__r06InitialExternalUrl ?? null,
    subscribeUrlOpen(listener) {
      bridgeWindow.__r06EmitWarmExternalUrl = listener
      return () => {
        delete bridgeWindow.__r06EmitWarmExternalUrl
      }
    },
  }))

  return (
    <R06ReaderShell
      externalIngressSource={externalSource}
      externalIngressPolicy={{
        allowedHttpsHosts: ['reader.example.test'],
        allowedCustomSchemes: ['bibleberry'],
      }}
      renderGuidedTutorial={
        tutorialEnabled ? props => <SyntheticTutorialSeam {...props} /> : undefined
      }
    />
  )
}
