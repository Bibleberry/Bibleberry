import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import {
  defaultGatewayChallengeProvider,
  type ChallengeDetailProvider,
} from '../cms/reader/challengeDetailProvider.ts'
import type { ChallengeOrigin } from '../cms/reader/challengeOrigin.ts'
import {
  defaultGatewayMonthProvider,
  detectReaderTimeZone,
  type MonthDetailResult,
  type MonthGatewayProvider,
} from '../cms/reader/monthProvider.ts'
import {
  defaultGatewayCatalogProvider,
  loadChallengeDetailForSummary,
  type ReleasedCatalogProvider,
  type ReleasedCatalogResult,
} from '../cms/reader/releasedCatalogProvider.ts'
import { ReleasedChallengeHost } from '../cms/reader/ReleasedChallengeHost.tsx'
import { HubContinueCard } from '../components/hubContinue/HubContinueCard.tsx'
import { deriveHubContinueSuggestion } from '../hubContinue/engine.ts'
import type { HubContinueSuggestion } from '../hubContinue/types.ts'
import { formatCanonicalChallengeId } from '../participation/identity.ts'
import type { ReaderParticipationSnapshot } from '../participation/store.ts'
import type { PublicationYearMonth } from '../participation/types.ts'
import { defaultGuestShelfStore } from '../shelfPersistence/defaultGuestShelfStore.ts'
import type { GuestShelfStore } from '../shelfPersistence/store.ts'
import { useGuestShelfStore } from '../shelfPersistence/useGuestShelfStore.ts'
import { createHubContinueAppInput, resolveHubContinueFocusMonth } from './hubContinueInput.ts'

interface FetchedHubContinueGatewayData {
  readonly focusMonth: PublicationYearMonth
  readonly monthDetailsByYearMonth: ReadonlyMap<string, MonthDetailResult>
  readonly releasedCatalog: ReleasedCatalogResult
}

export interface AppHubContinueHostProps {
  readonly participationSnapshot: ReaderParticipationSnapshot
  readonly onContinueChallenge: (suggestion: HubContinueSuggestion) => void
  readonly onOpenMonth?: (yearMonth: PublicationYearMonth) => void
  readonly legacyFallback?: ReactNode
  readonly shelfStore?: GuestShelfStore
  readonly monthProvider?: MonthGatewayProvider
  readonly catalogProvider?: ReleasedCatalogProvider
}

/**
 * Ordinary-reader Today/Hub adapter connecting hydrated guest Shelf and
 * participation stores plus gateway-authorized month/catalog providers to the
 * accepted `createHubContinueAppInput` seam and `HubContinueCard`
 * (Phase 05 / R06 / Issue #233).
 *
 * Fails closed without network requests when stores are hydrating/unhealthy or
 * no deliberate active focus exists, cancels stale fetches on change/unmount,
 * and reconciles cleanly with the legacy `ResumeCard` fallback so Today never
 * renders two competing Continue/Resume prompts.
 */
export function AppHubContinueHost({
  participationSnapshot,
  onContinueChallenge,
  onOpenMonth,
  legacyFallback = null,
  shelfStore = defaultGuestShelfStore,
  monthProvider = defaultGatewayMonthProvider,
  catalogProvider = defaultGatewayCatalogProvider,
}: AppHubContinueHostProps) {
  const shelfSnapshot = useGuestShelfStore(shelfStore)
  const [gatewayData, setGatewayData] = useState<FetchedHubContinueGatewayData | null>(null)

  const focusMonth = resolveHubContinueFocusMonth(participationSnapshot, shelfSnapshot)
  const [trackedFocusMonth, setTrackedFocusMonth] = useState(focusMonth)
  if (trackedFocusMonth !== focusMonth) {
    setTrackedFocusMonth(focusMonth)
    setGatewayData(null)
  }

  useEffect(() => {
    if (!focusMonth) return

    const controller = new AbortController()
    const { signal } = controller
    const loadFocus = async () => {
      const [releasedCatalog, monthDetail] = await Promise.all([
        catalogProvider.loadReleasedCatalog({ signal }),
        monthProvider.loadMonth(focusMonth, { signal, timeZone: detectReaderTimeZone() }),
      ])

      if (signal.aborted) return

      setGatewayData({
        focusMonth,
        monthDetailsByYearMonth: new Map([[focusMonth, monthDetail]]),
        releasedCatalog,
      })
    }

    void loadFocus().catch(() => {
      if (!signal.aborted) setGatewayData(null)
    })

    return () => controller.abort()
  }, [focusMonth, monthProvider, catalogProvider])

  const suggestion = useMemo(() => {
    if (!gatewayData || gatewayData.focusMonth !== focusMonth) {
      return null
    }
    const input = createHubContinueAppInput({
      participation: participationSnapshot,
      shelf: shelfSnapshot,
      monthDetailsByYearMonth: gatewayData.monthDetailsByYearMonth,
      releasedCatalog: gatewayData.releasedCatalog,
    })
    return input ? deriveHubContinueSuggestion(input).suggestion : null
  }, [focusMonth, gatewayData, participationSnapshot, shelfSnapshot])

  if (suggestion) {
    if (suggestion.kind !== 'resumeInProgress' && !onOpenMonth) return null
    return (
      <div className="today-hub-continue">
        <HubContinueCard
          suggestion={suggestion}
          onContinueChallenge={onContinueChallenge}
          onOpenMonth={onOpenMonth}
        />
      </div>
    )
  }

  return <>{legacyFallback}</>
}

export interface HubContinueChallengeHostProps {
  readonly slug: string
  readonly expectedDocumentId?: string
  readonly origin: ChallengeOrigin
  readonly returnLabel?: string
  readonly onReturn: (origin: ChallengeOrigin) => void
}

/**
 * Gateway-verified Challenge host for Hub Continue recommendations.
 * Ensures Hub-origin released Challenges require a trusted canonical document ID,
 * always load from the release gateway (never falling back to direct Sanity/catalog reads),
 * and fail closed with a safe return path when identity context is missing or invalid.
 */
export function HubContinueChallengeHost({
  slug,
  expectedDocumentId,
  origin,
  returnLabel,
  onReturn,
}: HubContinueChallengeHostProps) {
  const verifiedDocumentId =
    typeof expectedDocumentId === 'string' && formatCanonicalChallengeId('cms', expectedDocumentId)
      ? expectedDocumentId
      : null

  const challengeProvider = useMemo<ChallengeDetailProvider | null>(
    () =>
      verifiedDocumentId
        ? {
            loadChallenge(requestedSlug, options) {
              return loadChallengeDetailForSummary(
                { slug: requestedSlug, documentId: verifiedDocumentId },
                defaultGatewayChallengeProvider,
                options,
              )
            },
          }
        : null,
    [verifiedDocumentId],
  )

  if (!challengeProvider) {
    return (
      <div className="standard-page challenge-reader-page">
        <button
          type="button"
          className="back-link challenge-player__exit"
          onClick={() => onReturn(origin)}
        >
          <ArrowLeft size={17} aria-hidden="true" /> {returnLabel ?? 'Return to Today'}
        </button>
        <div className="empty-state" role="status" aria-live="polite">
          <h2>Challenge unavailable</h2>
          <p>
            This Challenge could not be verified from Today. Return to Today to open an available
            study suggestion.
          </p>
        </div>
      </div>
    )
  }

  return (
    <ReleasedChallengeHost
      slug={slug}
      challengeProvider={challengeProvider}
      origin={origin}
      returnLabel={returnLabel}
      onReturn={onReturn}
    />
  )
}
