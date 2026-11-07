import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ArrowLeft, RotateCcw } from 'lucide-react'
import { defaultGuestParticipationStore } from '../../participation/defaultGuestStore.ts'
import { PersistedChallengeHost } from '../../participation/PersistedChallengeHost.tsx'
import type { ReaderParticipationStore } from '../../participation/store.ts'
import type { ChallengeCatalogProvider } from './catalogProvider.ts'
import {
  adaptCatalogProviderToDetailProvider,
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
  challengeProvider?: ChallengeDetailProvider
  catalogProvider?: ChallengeCatalogProvider
  store?: ReaderParticipationStore
  getNow?: () => Date
  onExit?: () => void
  exitLabel?: string
  returnLabel?: string
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
  challengeProvider,
  catalogProvider,
  store = defaultGuestParticipationStore,
  getNow = () => new Date(),
  onExit,
  exitLabel,
  returnLabel,
  banner,
  footer,
}: ReleasedChallengeHostProps) {
  const effectiveExitLabel = returnLabel ?? exitLabel ?? 'Return'
  const effectiveProvider =
    challengeProvider ??
    (catalogProvider ? adaptCatalogProviderToDetailProvider(catalogProvider) : resolveDefaultChallengeProvider())

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

    effectiveProvider
      .loadChallenge(slug, { signal: controller.signal })
      .then(result => {
        if (!ignore) {
          setDetailResult(result)
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
  }, [effectiveProvider, slug, loadAttempt])

  const state = deriveReleasedChallengeDetailState(detailResult, slug, getNow())

  if (state.status === 'loading') {
    return (
      <div className="standard-page challenge-reader-page" role="status" aria-live="polite">
        {banner}
        {onExit && (
          <button type="button" className="back-link challenge-player__exit" onClick={onExit}>
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
        {onExit && (
          <button type="button" className="back-link challenge-player__exit" onClick={onExit}>
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
        {onExit && (
          <button type="button" className="back-link challenge-player__exit" onClick={onExit}>
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
        {onExit && (
          <button type="button" className="back-link challenge-player__exit" onClick={onExit}>
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
        {onExit && (
          <button type="button" className="back-link challenge-player__exit" onClick={onExit}>
            <ArrowLeft size={17} /> {effectiveExitLabel}
          </button>
        )}
        <div className="empty-state">
          <h2>Not yet released</h2>
          <p>
            &ldquo;{state.title}&rdquo; is scheduled to release on{' '}
            {formatReleaseDateTime(state.releaseDate)}.
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
        {onExit && (
          <button type="button" className="back-link challenge-player__exit" onClick={onExit}>
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
      onExit={onExit}
      exitLabel={effectiveExitLabel}
      banner={banner}
      footer={footer}
    />
  )
}
