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
import { HubContinueBoundary } from '../components/hubContinue/HubContinueBoundary.tsx'
import { deriveHubContinueSuggestion } from '../hubContinue/engine.ts'
import type { HubContinueSuggestion } from '../hubContinue/types.ts'
import { formatCanonicalChallengeId } from '../participation/identity.ts'
import type { ReaderParticipationSnapshot } from '../participation/store.ts'
import type { PublicationYearMonth } from '../participation/types.ts'
import { MAX_SHELF_CAPACITY } from '../shelf/types.ts'
import { parseValidPublicationYearMonth } from '../shelf/validation.ts'
import { defaultGuestShelfStore } from '../shelfPersistence/defaultGuestShelfStore.ts'
import type { GuestShelfSnapshot, GuestShelfStore } from '../shelfPersistence/store.ts'
import { useGuestShelfStore } from '../shelfPersistence/useGuestShelfStore.ts'
import { createHubContinueAppInput } from './hubContinueInput.ts'

const MAX_REQUIRED_MONTHS = MAX_SHELF_CAPACITY + 1

interface FetchedHubContinueGatewayData {
  readonly fetchedKey: string
  readonly monthDetailsByYearMonth: ReadonlyMap<string, MonthDetailResult>
  readonly releasedCatalog: ReleasedCatalogResult
}

function isAbortError(error: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' &&
      error instanceof DOMException &&
      error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  )
}

function resolveRequiredMonths(
  shelf: GuestShelfSnapshot,
  participation: ReaderParticipationSnapshot,
): readonly PublicationYearMonth[] | null {
  if (
    participation.status !== 'ready' ||
    participation.health !== 'ok' ||
    shelf.status !== 'ready' ||
    shelf.health !== 'ok'
  ) {
    return null
  }

  const activeFocus = parseValidPublicationYearMonth(shelf.state.activeFocusMonth)
  if (!activeFocus) {
    return null
  }

  const required = new Set<PublicationYearMonth>([activeFocus])
  for (const entry of shelf.state.months) {
    const validMonth = parseValidPublicationYearMonth(entry.yearMonth)
    if (!validMonth) {
      return null
    }
    required.add(validMonth)
  }

  if (required.size === 0 || required.size > MAX_REQUIRED_MONTHS) {
    return null
  }

  return Array.from(required).sort()
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
 * accepted `createHubContinueAppInput` seam and `HubContinueBoundary`
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

  const requiredMonths = useMemo(
    () => resolveRequiredMonths(shelfSnapshot, participationSnapshot),
    [shelfSnapshot, participationSnapshot],
  )
  const requiredMonthsKey = requiredMonths ? requiredMonths.join(',') : ''
  const [trackedKey, setTrackedKey] = useState(requiredMonthsKey)
  if (trackedKey !== requiredMonthsKey) {
    setTrackedKey(requiredMonthsKey)
    setGatewayData(null)
  }

  useEffect(() => {
    if (!requiredMonthsKey) {
      return
    }

    const monthsToLoad = requiredMonthsKey.split(',') as PublicationYearMonth[]
    if (monthsToLoad.length === 0 || monthsToLoad.length > MAX_REQUIRED_MONTHS) {
      return
    }

    const controller = new AbortController()
    const timeZone = detectReaderTimeZone()
    let ignore = false

    const loadBatch = async () => {
      const catalogPromise = catalogProvider
        .loadReleasedCatalog({ signal: controller.signal })
        .catch((error: unknown): ReleasedCatalogResult => {
          if (isAbortError(error) || controller.signal.aborted) {
            throw error
          }
          return {
            status: 'requestError',
            message: error instanceof Error ? error.message : 'Unable to load released catalog',
            source: 'gateway',
          }
        })

      const monthPromises = monthsToLoad.map(yearMonth =>
        monthProvider
          .loadMonth(yearMonth, { signal: controller.signal, timeZone })
          .then(result => [yearMonth, result] as const)
          .catch((error: unknown): readonly [PublicationYearMonth, MonthDetailResult] => {
            if (isAbortError(error) || controller.signal.aborted) {
              throw error
            }
            return [
              yearMonth,
              {
                status: 'requestError',
                message: error instanceof Error ? error.message : 'Unable to load month details',
                source: 'gateway',
              },
            ] as const
          }),
      )

      const [releasedCatalog, monthEntries] = await Promise.all([
        catalogPromise,
        Promise.all(monthPromises),
      ])

      if (ignore || controller.signal.aborted) {
        return
      }

      setGatewayData({
        fetchedKey: requiredMonthsKey,
        monthDetailsByYearMonth: new Map(monthEntries),
        releasedCatalog,
      })
    }

    void loadBatch().catch((error: unknown) => {
      if (ignore || controller.signal.aborted || isAbortError(error)) {
        return
      }
      setGatewayData(null)
    })

    return () => {
      ignore = true
      controller.abort()
    }
  }, [requiredMonthsKey, monthProvider, catalogProvider])

  const effectiveGatewayData =
    gatewayData && requiredMonthsKey && gatewayData.fetchedKey === requiredMonthsKey
      ? gatewayData
      : null

  const appInput = useMemo(() => {
    if (!effectiveGatewayData) {
      return null
    }
    return createHubContinueAppInput({
      participation: participationSnapshot,
      shelf: shelfSnapshot,
      monthDetailsByYearMonth: effectiveGatewayData.monthDetailsByYearMonth,
      releasedCatalog: effectiveGatewayData.releasedCatalog,
    })
  }, [effectiveGatewayData, participationSnapshot, shelfSnapshot])

  const suggestionResult = useMemo(
    () => (appInput ? deriveHubContinueSuggestion(appInput) : null),
    [appInput],
  )

  if (appInput && suggestionResult?.status === 'suggestion') {
    return (
      <div className="today-hub-continue">
        <HubContinueBoundary
          input={appInput}
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
