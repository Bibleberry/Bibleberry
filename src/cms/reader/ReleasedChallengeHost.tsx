import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, RotateCcw } from 'lucide-react'
import { defaultGuestParticipationStore } from '../../participation/defaultGuestStore.ts'
import { PersistedChallengeHost } from '../../participation/PersistedChallengeHost.tsx'
import type { ReaderParticipationStore } from '../../participation/store.ts'
import { loadChallengeDetailForSummary } from './releasedCatalogProvider.ts'
import type { ChallengeCatalogProvider } from './catalogProvider.ts'
import {
  formatChallengeOriginLabel,
  parseChallengeOrigin,
  type ChallengeOrigin,
} from './challengeOrigin.ts'
import {
  defaultGatewayMonthProvider,
  type MonthGatewayProvider,
} from './monthProvider.ts'
import { reconcileFinishedChallengeMonthAwards } from './monthAwardReconciliation.ts'
import {
  adaptCatalogProviderToDetailProvider,
  defaultGatewayChallengeProvider,
  resolveDefaultChallengeProvider,
  type ChallengeDetailProvider,
  type ChallengeDetailResult,
} from './challengeDetailProvider.ts'
import {
  deriveReleasedChallengeDetailState,
  formatReleaseDateTime,
} from './releasedChallengeHostModel.ts'

export type ReleasedChallengeHostProps = {
  slug: string
  expectedDocumentId?: string
  onFinish?: () => void
  challengeProvider?: ChallengeDetailProvider
  catalogProvider?: ChallengeCatalogProvider
  monthProvider?: MonthGatewayProvider
  store?: ReaderParticipationStore
  getNow?: () => Date
  origin?: ChallengeOrigin
  /**
   * Require server-authorized delivery through the release gateway, regardless of origin or
   * `VITE_ENABLE_RELEASE_GATEWAY_SOURCE`. Used for every external entry. When set, an injected
   * `catalogProvider` and the build's default (possibly direct-Sanity catalog) provider are
   * never used; only an explicitly injected `challengeProvider` or the default gateway provider.
   */
  requireGatewayAuthorization?: boolean
  onReturn?: (origin: ChallengeOrigin) => void
  onExit?: () => void
  exitLabel?: string
  returnLabel?: string
  readAgain?: boolean
  rereadSessionKey?: string | number
  banner?: ReactNode
  footer?: ReactNode
}

/**
 * Controlled Released CMS Challenge Host (R05 Stage 2A).
 *
 * Connects the Challenge provider (either the secure Stage 1 release gateway or
 * the existing A4.1 published CMS catalog provider), pure release-eligibility
 * evaluation, and fail-closed trusted capability admission to `PersistedChallengeHost`
 * and `ChallengePlayer`.
 */
export function ReleasedChallengeHost({
  slug,
  expectedDocumentId,
  onFinish,
  challengeProvider,
  catalogProvider,
  monthProvider = defaultGatewayMonthProvider,
  store = defaultGuestParticipationStore,
  getNow = () => new Date(),
  origin,
  requireGatewayAuthorization = false,
  onReturn,
  onExit,
  exitLabel,
  returnLabel,
  readAgain,
  rereadSessionKey,
  banner,
  footer,
}: ReleasedChallengeHostProps) {
  const resolvedOrigin = useMemo(() => parseChallengeOrigin(origin), [origin])
  const effectiveExitLabel =
    returnLabel ?? exitLabel ?? formatChallengeOriginLabel(resolvedOrigin)
  const handleExit = useMemo(() => {
    if (onReturn) return () => onReturn(resolvedOrigin)
    return onExit
  }, [onExit, onReturn, resolvedOrigin])
  const effectiveProvider = useMemo(() => {
    // Checked first so no later branch can downgrade a required gateway load to a catalog read.
    if (requireGatewayAuthorization) return challengeProvider ?? defaultGatewayChallengeProvider
    if (challengeProvider) return challengeProvider
    if (catalogProvider) return adaptCatalogProviderToDetailProvider(catalogProvider)
    if (resolvedOrigin.kind === 'month') return defaultGatewayChallengeProvider
    return resolveDefaultChallengeProvider()
  }, [challengeProvider, catalogProvider, resolvedOrigin.kind, requireGatewayAuthorization])

  const [detailResult, setDetailResult] = useState<ChallengeDetailResult | null>(null)
  const [loadAttempt, setLoadAttempt] = useState<number>(0)

  const retry = useCallback(() => {
    setDetailResult(null)
    setLoadAttempt(prev => prev + 1)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let ignore = false

    // Immediately reset to null on slug or provider change to show loading state
    setDetailResult(null)

    const options = { signal: controller.signal }
    const detail = expectedDocumentId === undefined
      ? effectiveProvider.loadChallenge(slug, options)
      : loadChallengeDetailForSummary({ slug, documentId: expectedDocumentId }, effectiveProvider, options)
    detail
      .then(result => {
        if (!ignore) {
          setDetailResult(requireGatewayAuthorization && result.status === 'ready' && result.source !== 'gateway'
            ? { status: 'notFound' }
            : result)
        }
      })
      .catch(err => {
        if (!ignore) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            return
          }
          setDetailResult({
            status: 'requestError',
            message: err instanceof Error ? err.message : 'Network error loading Challenge',
          })
        }
      })

    return () => {
      ignore = true
      controller.abort()
    }
  }, [effectiveProvider, slug, expectedDocumentId, requireGatewayAuthorization, loadAttempt])

  const state = deriveReleasedChallengeDetailState(detailResult, slug, getNow())

  if (state.status === 'loading') {
    return (
      <div className="standard-page challenge-reader-page" role="status" aria-live="polite">
        {banner}
        {handleExit && (
          <button type="button" className="back-link challenge-player__exit" onClick={handleExit}>
            <ArrowLeft size={17} /> {effectiveExitLabel}
          </button>
        )}
        <p>Loading Challenge…</p>
        {footer}
      </div>
    )
  }

  if (state.status === 'requestError') {
    return (
      <div className="standard-page challenge-reader-page">
        {banner}
        {handleExit && (
          <button type="button" className="back-link challenge-player__exit" onClick={handleExit}>
            <ArrowLeft size={17} /> {effectiveExitLabel}
          </button>
        )}
        <div className="error-panel" role="alert">
          <h2>Unable to load Challenge</h2>
          <p>{state.message || 'A network error occurred while loading this Challenge.'}</p>
          <button
            type="button"
            className="button button--secondary"
            onClick={retry}
            aria-label="Retry loading Challenge"
          >
            <RotateCcw size={16} /> Retry
          </button>
        </div>
        {footer}
      </div>
    )
  }

  if (state.status === 'validationError') {
    return (
      <div className="standard-page challenge-reader-page">
        {banner}
        {handleExit && (
          <button type="button" className="back-link challenge-player__exit" onClick={handleExit}>
            <ArrowLeft size={17} /> {effectiveExitLabel}
          </button>
        )}
        <div className="error-panel" role="alert">
          <h2>Challenge content unavailable</h2>
          <p>This Challenge contains content that is not compatible with this version of the app.</p>
        </div>
        {footer}
      </div>
    )
  }

  if (state.status === 'notFound') {
    return (
      <div className="standard-page challenge-reader-page">
        {banner}
        {handleExit && (
          <button type="button" className="back-link challenge-player__exit" onClick={handleExit}>
            <ArrowLeft size={17} /> {effectiveExitLabel}
          </button>
        )}
        <div className="empty-state">
          <h2>Challenge not found</h2>
          <p>
            The requested Challenge &ldquo;{state.slug}&rdquo; is not available in the catalog.
          </p>
        </div>
        {footer}
      </div>
    )
  }

  if (state.status === 'embargoed') {
    return (
      <div className="standard-page challenge-reader-page">
        {banner}
        {handleExit && (
          <button type="button" className="back-link challenge-player__exit" onClick={handleExit}>
            <ArrowLeft size={17} /> {effectiveExitLabel}
          </button>
        )}
        <div className="empty-state">
          <h2>Not yet released</h2>
          <p>
            &ldquo;{state.title}&rdquo; is scheduled to release
            {state.releaseDate ? ` on ${formatReleaseDateTime(state.releaseDate)}.` : '.'}
          </p>
        </div>
        {footer}
      </div>
    )
  }

  if (state.status === 'ineligible' || state.status === 'admissionFailed') {
    return (
      <div className="standard-page challenge-reader-page">
        {banner}
        {handleExit && (
          <button type="button" className="back-link challenge-player__exit" onClick={handleExit}>
            <ArrowLeft size={17} /> {effectiveExitLabel}
          </button>
        )}
        <div className="empty-state">
          <h2>Challenge unavailable</h2>
          <p>This Challenge is currently not available for reader participation.</p>
        </div>
        {footer}
      </div>
    )
  }

  return (
    <PersistedChallengeHost
      store={store}
      admittedChallenge={state.admittedChallenge}
      challenge={state.challenge}
      expectedNamespace="cms"
      trackInterruption={requireGatewayAuthorization}
      origin={resolvedOrigin}
      onReturn={onReturn}
      onCompletionDispatched={completionWrite => {
        void reconcileFinishedChallengeMonthAwards({
          store,
          monthProvider,
          challenge: state.challenge,
          admittedChallenge: state.admittedChallenge,
          completionWrite,
        }).catch(() => undefined)
      }}
      onExit={onExit}
      onFinish={onFinish}
      returnOnFinish={Boolean(onReturn || onExit || onFinish)}
      readAgain={readAgain}
      rereadSessionKey={rereadSessionKey}
      exitLabel={effectiveExitLabel}
      banner={banner}
      footer={footer}
    />
  )
}
