import type { ChallengeOrigin } from '../cms/reader/challengeOrigin.ts'
import type {
  GatewayServerContext,
  MonthDetailData,
  MonthGatewayChallengeType,
} from '../cms/reader/monthProvider.ts'
import type { ReleasedCatalogSummary } from '../cms/reader/releasedCatalogProvider.ts'
import type {
  CanonicalChallengeId,
  LocalCalendarDate,
  PublicationYearMonth,
  ReaderParticipationData,
} from '../participation/types.ts'
import type { ShelfState } from '../shelf/types.ts'

/**
 * Pure domain types for the standalone Hub Continue recommendation engine
 * (Phase 05 / R06 / Issue #177).
 *
 * Product authority:
 * - November 8, 2026 Approved Reader Experience (§2, §6, §10)
 * - Canonical Roadmap Phase 05
 *
 * Invariants:
 * - Derives AT MOST ONE unobtrusive Continue suggestion from approved reader data.
 * - Never infers access from guessed slugs, unverified device time, or untrusted local dates.
 * - Keeps incidental Library browsing separate from deliberate active focus.
 * - Never creates missed-day backlogs, streak pressure, attendance scoreboards, or award prompts.
 * - Leaves the deferred first-post-rollover resume heuristic untouched.
 */

export type HubContinueSuggestionKind =
  | 'resumeInProgress'
  | 'continueNextInFocus'
  | 'continueOtherHistoricalMonth'

export type HubContinueResolutionReason =
  | 'inProgressInActiveFocus'
  | 'nextUnfinishedInActiveFocus'
  | 'nextEligibleMonthAfterCompletedFocus'
  | 'noActiveFocus'
  | 'activeFocusNotHistorical'
  | 'activeFocusUnavailable'
  | 'allEligibleMonthsComplete'
  | 'invalidReferenceMonth'
  | 'malformedInput'

export interface HubContinueSuggestion {
  readonly kind: HubContinueSuggestionKind
  readonly yearMonth: PublicationYearMonth
  readonly monthTitle: string
  readonly monthHeading: string
  readonly challengeId: CanonicalChallengeId
  readonly challengeDocumentId: string
  readonly challengeSlug: string
  readonly challengeTitle: string
  readonly challengeType: MonthGatewayChallengeType
  readonly dayOfMonth: number
  readonly publicationDate: string
  readonly isInProgress: boolean
  readonly resumeScreenId?: string
  readonly formalFocusMonth: PublicationYearMonth | null
  readonly preservesFormalFocus: true
  readonly origin: ChallengeOrigin
}

export type HubContinueResult =
  | {
      readonly status: 'suggestion'
      readonly suggestion: HubContinueSuggestion
      readonly reason: Extract<
        HubContinueResolutionReason,
        | 'inProgressInActiveFocus'
        | 'nextUnfinishedInActiveFocus'
        | 'nextEligibleMonthAfterCompletedFocus'
      >
    }
  | {
      readonly status: 'none'
      readonly suggestion: null
      readonly reason: Exclude<
        HubContinueResolutionReason,
        | 'inProgressInActiveFocus'
        | 'nextUnfinishedInActiveFocus'
        | 'nextEligibleMonthAfterCompletedFocus'
      >
    }

export interface HubContinueInput {
  /** Reader's Shelf state containing deliberate `activeFocusMonth` and 0–3 Shelf months. */
  readonly shelfState: ShelfState
  /** Reader's durable participation records (`completedChallenges`, `inProgressChallenges`, etc.). */
  readonly participationData: ReaderParticipationData
  /**
   * Gateway-authorized `MonthDetailData` records keyed by `YYYY-MM`.
   * Only historical months (`phase === 'historical'`) with `availability === 'available'` slots
   * are eligible for recommendation.
   */
  readonly monthDetailsByYearMonth:
    | ReadonlyMap<string, MonthDetailData>
    | Readonly<Record<string, MonthDetailData>>
  /**
   * Optional gateway-authorized released Challenge catalog for additional release verification.
   * When provided, candidate Challenges must also appear in this released catalog.
   */
  readonly releasedCatalog?:
    | readonly ReleasedCatalogSummary[]
    | ReadonlyMap<string, ReleasedCatalogSummary>
  /**
   * Authoritative current publication month (`YYYY-MM`), typically derived from
   * `serverContext.authorizedLocalDate`. Never inferred from unverified device time.
   */
  readonly referenceCurrentYearMonth?: PublicationYearMonth | string
  /**
   * Optional authoritative gateway server context. If `referenceCurrentYearMonth` is omitted,
   * the engine derives it from `serverContext.authorizedLocalDate`.
   */
  readonly serverContext?: GatewayServerContext
}

export interface InternalNormalizedSlot {
  readonly dayOfMonth: number
  readonly publicationDate: LocalCalendarDate | string
  readonly challengeId: CanonicalChallengeId
  readonly challengeDocumentId: string
  readonly slug: string
  readonly title: string
  readonly challengeType: MonthGatewayChallengeType
  readonly isCompleted: boolean
  readonly isInProgress: boolean
  readonly resumeScreenId?: string
  readonly inProgressUpdatedOn?: string
}
