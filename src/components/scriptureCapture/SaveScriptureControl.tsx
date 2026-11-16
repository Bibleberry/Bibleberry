import { useId } from 'react'
import type { ReaderParticipationStore } from '../../participation/store.ts'
import type {
  ScriptureCaptureInput,
  ScriptureCaptureOptions,
} from '../../scriptureCapture/types.ts'
import { SaveScriptureButton } from './SaveScriptureButton.tsx'
import { useSaveScripture } from './useSaveScripture.ts'
import './scriptureCapture.css'

export interface SaveScriptureControlProps extends ScriptureCaptureInput, ScriptureCaptureOptions {
  /** Durable V2 participation store. Defaults to `defaultGuestParticipationStore`. */
  readonly store?: ReaderParticipationStore
  readonly collectionLabel?: string
  readonly compact?: boolean
  readonly showStatus?: boolean
  readonly className?: string
  readonly onSavedChange?: (saved: boolean) => void
}

/**
 * Store-connected, embeddable Save Scripture control (R09-2).
 *
 * Handles validation, saved/unsaved state, duplicate prevention, optional Challenge
 * provenance, async hydration, pending writes, write-failure retry, and corrupt/unsupported
 * local record safety without storing copyrighted passage manuscript text.
 */
export function SaveScriptureControl({
  reference,
  translation,
  sourceChallenge,
  sourceChallengeId,
  store,
  allowedNamespace = 'cms',
  getToday,
  collectionLabel = 'Saved Scripture',
  compact = false,
  showStatus = true,
  className,
  onSavedChange,
}: SaveScriptureControlProps) {
  const statusId = useId()
  const { state, isRetryingWrite, toggle, retry } = useSaveScripture({
    reference,
    translation,
    sourceChallenge,
    sourceChallengeId,
    store,
    allowedNamespace,
    getToday,
  })

  const activeMessage = state.writeErrorMessage ?? (state.status !== 'ready' && state.status !== 'hydrating' ? state.statusMessage : null)
  const shouldShowStatus = showStatus && Boolean(activeMessage)
  const isAlert = Boolean(state.writeErrorMessage) || state.status === 'corruptStoredData' || state.status === 'unsupportedNewerSchema'

  const handleToggle = async () => {
    const result = await toggle()
    if (result.ok && result.action !== 'unchanged') {
      onSavedChange?.(result.action === 'saved')
    }
  }

  return (
    <div className={['scripture-capture', className ?? ''].filter(Boolean).join(' ')}>
      <SaveScriptureButton
        reference={state.validated?.reference ?? reference}
        translation={state.validated?.translation ?? translation}
        isSaved={state.isSaved}
        disabled={!state.canMutate}
        isHydrating={state.status === 'hydrating'}
        hasPendingWrites={state.hasPendingWrites}
        compact={compact}
        collectionLabel={collectionLabel}
        describedBy={shouldShowStatus ? statusId : undefined}
        onToggle={() => {
          void handleToggle()
        }}
      />

      {shouldShowStatus && activeMessage && (
        <div
          id={statusId}
          className={`scripture-capture__status${isAlert ? ' scripture-capture__status--error' : ''}`}
          role={isAlert ? 'alert' : 'status'}
          aria-live={isAlert ? 'assertive' : 'polite'}
        >
          <span>{activeMessage}</span>
          {state.canRetry && (
            <button
              type="button"
              className="button button--secondary scripture-capture__retry"
              disabled={isRetryingWrite}
              onClick={() => {
                void retry()
              }}
            >
              {isRetryingWrite ? 'Retrying…' : 'Retry save'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
