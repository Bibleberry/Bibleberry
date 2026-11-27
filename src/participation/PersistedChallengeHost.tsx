import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import {
  formatChallengeOriginLabel,
  parseChallengeOrigin,
  type ChallengeOrigin,
} from '../cms/reader/challengeOrigin.ts'
import type { CmsScripture } from '../cms/sanity/types.ts'
import type {
  ChallengePlayerChallenge,
  ChallengePlayerProps,
} from '../components/challenge/ChallengePlayer.tsx'
import { resolveFirstScreenId } from '../components/challenge/challengePlayerModel.ts'
import { OrdinaryChallengeHost } from '../components/challenge/OrdinaryChallengeHost.tsx'
import type { AdmittedChallenge } from './admission.ts'
import { formatLocalCalendarDate } from './identity.ts'
import {
  isParticipationScriptureSaved,
  selectChallengeParticipationView,
} from './model.ts'
import {
  assertValidAdmittedChallengeForHost,
  buildChallengeAliasRecord,
  createPersistedChallengeFinishController,
  derivePersistedHostRenderState,
  resolvePersistedHostScreenId,
} from './persistedChallengeHostModel.ts'
import type { ReaderParticipationStore } from './store.ts'
import type {
  ChallengeIdentityNamespace,
  LocalCalendarDate,
} from './types.ts'
import { useReaderParticipation } from './useReaderParticipation.ts'

/**
 * Platform-neutral durable Challenge reader bridge (Track A, A3 / Issue #46).
 *
 * Connects any `ReaderParticipationStore` and a trusted `AdmittedChallenge` to the storage-free
 * `OrdinaryChallengeHost` without coupling React components to `localStorage` or native plugins.
 */

export type PersistedChallengeHostProps = {
  store: ReaderParticipationStore
  admittedChallenge: AdmittedChallenge
  challenge: ChallengePlayerChallenge
  /** Expected identity namespace; defaults to `'cms'`. Only the isolated A3 pilot passes `'pilot'`. */
  expectedNamespace?: ChallengeIdentityNamespace
  /** Optional clock override for deterministic tests; defaults to `formatLocalCalendarDate()`. */
  getToday?: () => LocalCalendarDate
  origin?: ChallengeOrigin
  onReturn?: (origin: ChallengeOrigin) => void
  /** When supplied, return only after the explicit completion is durable. */
  onFinish?: () => void
  onCompletionDispatched?: (completionWrite: Promise<void>) => void
  returnOnFinish?: boolean
  /**
   * Intentional `Read Again` entry for an already-completed Challenge.
   * Ensures reading begins cleanly at the first screen without revoking completed status.
   */
  readAgain?: boolean
  /** Optional host-supplied session key that resets local completed reread position to Screen 1. */
  rereadSessionKey?: string | number
  trackInterruption?: boolean
  onExit?: () => void
  exitLabel?: string
  eyebrow?: ReactNode
  banner?: ReactNode
  footer?: ReactNode
  labels?: ChallengePlayerProps['labels']
}

type ReadyPersistedChallengeHostProps = Omit<
  PersistedChallengeHostProps,
  'expectedNamespace' | 'getToday' | 'origin' | 'onReturn' | 'returnOnFinish' | 'readAgain' | 'rereadSessionKey'
> & {
  getToday: () => LocalCalendarDate
  effectiveReturnOnFinish: boolean
}

function ReadyPersistedChallengeHost({
  store,
  admittedChallenge,
  challenge,
  getToday,
  effectiveReturnOnFinish,
  onFinish,
  onCompletionDispatched,
  onExit,
  trackInterruption,
  exitLabel = 'Exit',
  eyebrow,
  banner,
  footer,
  labels,
}: ReadyPersistedChallengeHostProps) {
  const snapshot = useReaderParticipation(store)
  const [rereadScreenId, setRereadScreenId] = useState<string | undefined>(undefined)
  const [finishStatus, setFinishStatus] = useState<'saving' | 'failed' | null>(null)
  const recordedOpenKey = useRef<string>('')
  const finishControllerRef = useRef(createPersistedChallengeFinishController())

  const challengeId = admittedChallenge.challengeId
  const view = selectChallengeParticipationView(snapshot.data, challengeId)
  const effectiveScreenId = resolvePersistedHostScreenId(view, rereadScreenId)
  const wasCompletedRef = useRef<boolean>(view.isCompleted)

  useEffect(() => {
    if (wasCompletedRef.current && !view.isCompleted) {
      finishControllerRef.current.reset()
    }
    wasCompletedRef.current = view.isCompleted
  }, [view.isCompleted])

  useEffect(() => {
    finishControllerRef.current.reset()
  }, [challengeId])

  useEffect(() => {
    const today = getToday()
    const visitKey = `${challengeId}:${today}`
    if (recordedOpenKey.current === visitKey) return
    recordedOpenKey.current = visitKey

    const aliases = buildChallengeAliasRecord(admittedChallenge)
    if (aliases) {
      void store.dispatch({
        type: 'reconcileChallengeAliases',
        aliases,
      })
    }

    void store.dispatch({
      type: 'recordChallengeOpened',
      challengeId,
      openedOn: today,
    })
  }, [admittedChallenge, challengeId, getToday, store])

  const invokeReturnOnce = onExit
    ? () => {
        finishControllerRef.current.triggerExit(() => {
          const saved = store.getSnapshot().data.inProgressChallenges[challengeId]
          if (trackInterruption && saved?.screenId) {
            void store.dispatch({
              type: 'saveChallengeProgress',
              challengeId,
              screenId: saved.screenId,
              updatedOn: getToday(),
              trackInterruption,
            })
          }
          onExit()
        }, effectiveReturnOnFinish)
      }
    : undefined

  async function returnAfterWrite(write: Promise<void>) {
    setFinishStatus('saving')
    try {
      await write
      const saved = store.getSnapshot()
      if (saved.health === 'ok' && !saved.hasPendingWrites && saved.data.completedChallenges[challengeId]) {
        onCompletionDispatched?.(write)
        onFinish?.()
        return
      }
    } catch {
      // A failed write remains retryable through the store's pending command queue.
    }
    setFinishStatus('failed')
  }

  if (finishStatus) {
    return (
      <div className="standard-page challenge-reader-page">
        <p role="status">{finishStatus === 'saving' ? 'Saving completion…' : 'Unable to save completion.'}</p>
        {finishStatus === 'failed' && (
          <>
            <button type="button" onClick={() => void returnAfterWrite(store.flushPending())}>Retry Finish</button>
            <button type="button" onClick={invokeReturnOnce}>{exitLabel}</button>
          </>
        )}
      </div>
    )
  }

  return (
    <OrdinaryChallengeHost
      challengeKey={challengeId}
      challenge={challenge}
      onFinishReread={onFinish}
      onExit={invokeReturnOnce}
      exitLabel={exitLabel}
      returnOnFinish={effectiveReturnOnFinish}
      eyebrow={eyebrow}
      banner={banner}
      footer={footer}
      labels={labels}
      viewState={{
        screenId: effectiveScreenId,
        isSaved: view.isSaved,
        isCompleted: view.isCompleted,
        isInProgress: view.isInProgress,
        isScriptureSaved: (scripture: CmsScripture) =>
          isParticipationScriptureSaved(snapshot.data, scripture),
      }}
      actions={{
        onScreenChange: (nextScreenId: string) => {
          if (!challenge.screens.some(screen => screen.id === nextScreenId)) return
          if (view.isCompleted) {
            setRereadScreenId(nextScreenId)
            return
          }
          setRereadScreenId(undefined)
          void store.dispatch({
            type: 'saveChallengeProgress',
            challengeId,
            screenId: nextScreenId,
            updatedOn: getToday(),
            trackInterruption,
          })
        },
        onStartProgress: () => {
          if (view.isCompleted || view.isInProgress) return
          const initialScreenId = resolveFirstScreenId(challenge.screens)
          void store.dispatch({
            type: 'saveChallengeProgress',
            challengeId,
            ...(initialScreenId ? { screenId: initialScreenId } : {}),
            updatedOn: getToday(),
            trackInterruption,
          })
        },
        onStartFromBeginning: () => {
          const firstScreenId = resolveFirstScreenId(challenge.screens)
          if (!firstScreenId) return
          setRereadScreenId(undefined)
          if (view.isCompleted) {
            return
          }
          void store.dispatch({
            type: 'saveChallengeProgress',
            challengeId,
            screenId: firstScreenId,
            updatedOn: getToday(),
            trackInterruption,
          })
        },
        onToggleSaveChallenge: () => {
          void store.dispatch({
            type: 'setChallengeSaved',
            challengeId,
            saved: !view.isSaved,
            savedOn: getToday(),
          })
        },
        onToggleSaveScripture: (scripture: CmsScripture) => {
          const currentlySaved = isParticipationScriptureSaved(snapshot.data, scripture)
          void store.dispatch({
            type: 'setScriptureSaved',
            scripture: {
              reference: scripture.reference,
              translation: scripture.translation,
              sourceChallengeId: challengeId,
            },
            saved: !currentlySaved,
            savedOn: getToday(),
          })
        },
        onComplete: () => {
          finishControllerRef.current.triggerFinish({
            screens: challenge.screens,
            activeScreenId: effectiveScreenId,
            isCompleted: view.isCompleted,
            returnOnFinish: effectiveReturnOnFinish,
            onStayOnFinalScreen: activeScreenId => setRereadScreenId(activeScreenId),
            dispatchComplete: () => {
              const completionWrite = store.dispatch({
                type: 'completeChallenge',
                challengeId,
                completedOn: getToday(),
              })
              if (onFinish) void returnAfterWrite(completionWrite)
              else onCompletionDispatched?.(completionWrite)
            },
            onExit: onFinish ? undefined : onExit,
          })
        },
      }}
    />
  )
}

export function PersistedChallengeHost({
  store,
  admittedChallenge,
  challenge,
  expectedNamespace = 'cms',
  getToday = formatLocalCalendarDate,
  origin,
  onReturn,
  onFinish,
  onCompletionDispatched,
  returnOnFinish,
  readAgain = false,
  rereadSessionKey,
  onExit,
  trackInterruption,
  exitLabel,
  eyebrow,
  banner,
  footer,
  labels,
}: PersistedChallengeHostProps) {
  assertValidAdmittedChallengeForHost(admittedChallenge, challenge, expectedNamespace)
  const resolvedOrigin = parseChallengeOrigin(origin)
  const effectiveReturnOnFinish = returnOnFinish ?? Boolean(onReturn)
  const effectiveExitLabel =
    exitLabel ??
    (origin !== undefined || onReturn !== undefined
      ? formatChallengeOriginLabel(resolvedOrigin)
      : 'Exit')
  const handleExit = onReturn ? () => onReturn(resolvedOrigin) : onExit

  const snapshot = useReaderParticipation(store)
  const renderState = derivePersistedHostRenderState(
    snapshot,
    admittedChallenge.challengeId,
    undefined,
  )

  if (renderState.mode === 'hydrating') {
    return (
      <div className="standard-page challenge-reader-page">
        {banner}
        {handleExit && (
          <button type="button" className="back-link challenge-player__exit" onClick={handleExit}>
            <ArrowLeft size={17} aria-hidden="true" /> {effectiveExitLabel}
          </button>
        )}
        <p role="status" aria-live="polite">
          {renderState.statusMessage}
        </p>
        {footer}
      </div>
    )
  }

  const hostSessionKey = readAgain
    ? `${admittedChallenge.challengeId}:readAgain:${rereadSessionKey ?? ''}`
    : rereadSessionKey !== undefined
      ? `${admittedChallenge.challengeId}:${rereadSessionKey}`
      : admittedChallenge.challengeId

  return (
    <ReadyPersistedChallengeHost
      key={hostSessionKey}
      store={store}
      admittedChallenge={admittedChallenge}
      challenge={challenge}
      getToday={getToday}
      effectiveReturnOnFinish={effectiveReturnOnFinish}
      onFinish={onFinish}
      onCompletionDispatched={onCompletionDispatched}
      trackInterruption={trackInterruption}
      onExit={handleExit}
      exitLabel={effectiveExitLabel}
      eyebrow={eyebrow}
      banner={banner}
      footer={footer}
      labels={labels}
    />
  )
}
