import {
  selectPendingHubAnnouncementAwards,
  validateEarnedCardSnapshot,
} from '../../participation/awards.ts'
import {
  parseLocalCalendarDate,
  parsePublicationYearMonth,
} from '../../participation/identity.ts'
import type {
  CanonicalAwardId,
  EarnedAwardRecord,
  LocalCalendarDate,
  MonthlyAwardKind,
  PublicationYearMonth,
  ReaderParticipationData,
} from '../../participation/types.ts'

/**
 * Pure domain/presentation model and deterministic Hub-visit batch controller for
 * Hub-only combined earned Scripture Card announcements (R14-6).
 *
 * Guarantees:
 * - Announcements can open ONLY when the reader arrives at or returns to the Hub.
 * - All unacknowledged pending awards are combined into one frozen batch per Hub visit.
 * - New awards arriving while a batch is open are never silently acknowledged or merged
 *   into the open batch; they remain pending for a later Hub arrival.
 * - `cardViewed` and `hubAnnouncementAcked` remain completely independent.
 * - Incomplete or unvalidated Card snapshots degrade gracefully without fetching or
 *   fabricating unearned Card art.
 */

export type HubSurface = 'hub' | 'month' | 'shelf' | 'library' | 'challenge' | 'other'

export interface PresentedEarnedAwardItem {
  readonly awardId: CanonicalAwardId
  readonly kind: MonthlyAwardKind
  readonly publicationYearMonth: PublicationYearMonth
  readonly monthHeading: string
  readonly discoveryId: string
  readonly earnedOn: LocalCalendarDate
  readonly earnedDateLabel: string | null
  readonly cardViewed: boolean
  readonly title: string
  readonly kindLabel: string
  readonly scriptureReference?: string
  readonly scriptureTranslation?: string
  readonly scriptureBook?: string
  readonly imageUrl?: string
  readonly illustrationAlt?: string
  readonly accessibleTranscription?: string
  readonly hasCompleteCardSnapshot: boolean
}

export interface CombinedAnnouncementCopy {
  readonly heading: string
  readonly summary: string
  readonly dismissLabel: string
  readonly itemCount: number
}

export type AnnouncementAckStatus = 'idle' | 'saving' | 'failed'

export interface HubAnnouncementState {
  readonly isHubActive: boolean
  readonly visitId: number
  readonly presentedVisitId: number | null
  readonly suppressedVisitId: number | null
  readonly openBatch: readonly PresentedEarnedAwardItem[] | null
  readonly openBatchVisitId: number | null
  readonly ackStatus: AnnouncementAckStatus
  readonly ackErrorMessage: string | null
}

export interface HubAnnouncementEvaluationInput {
  readonly participationReady: boolean
  readonly participationData: ReaderParticipationData
  readonly preferencesReady: boolean
  readonly announcementsEnabled: boolean
}

function formatUtcMonthHeading(yearMonth: string): string {
  const valid = parsePublicationYearMonth(yearMonth)
  if (!valid) return yearMonth
  const year = Number(valid.slice(0, 4))
  const month = Number(valid.slice(5, 7))
  return new Intl.DateTimeFormat('en', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 15)))
}

function formatUtcEarnedDate(earnedOn: LocalCalendarDate): string | null {
  const validDate = parseLocalCalendarDate(earnedOn)
  if (!validDate) return null
  const year = Number(validDate.slice(0, 4))
  const month = Number(validDate.slice(5, 7))
  const day = Number(validDate.slice(8, 10))
  return new Intl.DateTimeFormat('en', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

function getAwardKindLabel(kind: MonthlyAwardKind): string {
  return kind === 'fullMonth' ? 'Full-Month Scripture Card' : 'Thematic Scripture Card'
}

/**
 * Projects a durable `EarnedAwardRecord` into a safe, read-only announcement display item.
 * Never fabricates or fetches missing Card artwork or hidden discovery details.
 */
export function buildPresentedEarnedAwardItem(
  record: EarnedAwardRecord,
): PresentedEarnedAwardItem {
  const monthHeading = formatUtcMonthHeading(record.publicationYearMonth)
  const kindLabel = getAwardKindLabel(record.kind)
  const earnedDateLabel = formatUtcEarnedDate(record.earnedOn)

  const candidateSnapshot = record.earnedCard
    ? validateEarnedCardSnapshot(record.earnedCard, record.publicationYearMonth)
    : null
  const snapshotConsistent =
    candidateSnapshot !== null
    && (record.cardDocumentId === undefined
      || record.cardDocumentId === candidateSnapshot.cardDocumentId)

  const validatedCard = snapshotConsistent ? candidateSnapshot : null

  if (!validatedCard) {
    return Object.freeze({
      awardId: record.awardId,
      kind: record.kind,
      publicationYearMonth: record.publicationYearMonth,
      monthHeading,
      discoveryId: record.discoveryId,
      earnedOn: record.earnedOn,
      earnedDateLabel,
      cardViewed: record.cardViewed,
      title: kindLabel,
      kindLabel,
      hasCompleteCardSnapshot: false,
    })
  }

  return Object.freeze({
    awardId: record.awardId,
    kind: record.kind,
    publicationYearMonth: record.publicationYearMonth,
    monthHeading,
    discoveryId: record.discoveryId,
    earnedOn: record.earnedOn,
    earnedDateLabel,
    cardViewed: record.cardViewed,
    title: validatedCard.title,
    kindLabel,
    scriptureReference: validatedCard.scripture.reference,
    scriptureTranslation: validatedCard.scripture.translation,
    scriptureBook: validatedCard.scripture.book,
    imageUrl: validatedCard.imageUrl,
    illustrationAlt: validatedCard.illustrationAlt,
    accessibleTranscription: validatedCard.accessibleTranscription,
    hasCompleteCardSnapshot: true,
  })
}

export function buildCombinedAnnouncementCopy(
  items: readonly PresentedEarnedAwardItem[],
): CombinedAnnouncementCopy {
  const count = items.length
  if (count <= 1) {
    const first = items[0]
    const summary = first
      ? first.hasCompleteCardSnapshot
        ? `You earned "${first.title}" (${first.monthHeading}).`
        : `You earned a ${first.kindLabel} for ${first.monthHeading}.`
      : 'You earned a new Scripture Card.'
    return Object.freeze({
      heading: 'New Scripture Card Earned',
      summary,
      dismissLabel: 'Dismiss',
      itemCount: count,
    })
  }

  return Object.freeze({
    heading: `${count} New Scripture Cards Earned`,
    summary: `You earned ${count} Scripture Cards. Your cards are saved in your participation record.`,
    dismissLabel: 'Dismiss',
    itemCount: count,
  })
}

export function selectPresentedBatchAwardIds(
  batch: readonly PresentedEarnedAwardItem[] | null,
): readonly CanonicalAwardId[] {
  if (!batch || batch.length === 0) return Object.freeze([])
  return Object.freeze(batch.map(item => item.awardId))
}

export function createInitialHubAnnouncementState(
  isHubActive: boolean = false,
): HubAnnouncementState {
  return Object.freeze({
    isHubActive,
    visitId: isHubActive ? 1 : 0,
    presentedVisitId: null,
    suppressedVisitId: null,
    openBatch: null,
    openBatchVisitId: null,
    ackStatus: 'idle',
    ackErrorMessage: null,
  })
}

export function arriveAtHubState(state: HubAnnouncementState): HubAnnouncementState {
  if (state.isHubActive) {
    return state
  }
  return Object.freeze({
    ...state,
    isHubActive: true,
    visitId: state.visitId + 1,
    ackStatus: 'idle',
    ackErrorMessage: null,
  })
}

export function leaveHubState(state: HubAnnouncementState): HubAnnouncementState {
  if (!state.isHubActive && state.openBatch === null && state.ackStatus === 'idle') {
    return state
  }
  return Object.freeze({
    ...state,
    isHubActive: false,
    openBatch: null,
    openBatchVisitId: null,
    ackStatus: 'idle',
    ackErrorMessage: null,
  })
}

export function setActiveSurfaceState(
  state: HubAnnouncementState,
  surface: HubSurface,
): HubAnnouncementState {
  return surface === 'hub' ? arriveAtHubState(state) : leaveHubState(state)
}

export function evaluateHubAnnouncementState(
  state: HubAnnouncementState,
  input: HubAnnouncementEvaluationInput,
): HubAnnouncementState {
  if (!state.isHubActive) return state
  if (!input.participationReady || !input.preferencesReady) return state
  if (state.openBatch !== null) return state
  if (state.presentedVisitId === state.visitId) return state
  if (state.suppressedVisitId === state.visitId) return state

  const pendingAwards = selectPendingHubAnnouncementAwards(input.participationData)
  if (pendingAwards.length === 0) {
    return state
  }

  if (!input.announcementsEnabled) {
    return Object.freeze({
      ...state,
      suppressedVisitId: state.visitId,
    })
  }

  const frozenBatch = Object.freeze(pendingAwards.map(buildPresentedEarnedAwardItem))
  return Object.freeze({
    ...state,
    presentedVisitId: state.visitId,
    openBatch: frozenBatch,
    openBatchVisitId: state.visitId,
    ackStatus: 'idle',
    ackErrorMessage: null,
  })
}

export function beginAcknowledgeBatchState(
  state: HubAnnouncementState,
): HubAnnouncementState {
  if (state.openBatch === null || state.ackStatus === 'saving') {
    return state
  }
  return Object.freeze({
    ...state,
    ackStatus: 'saving',
    ackErrorMessage: null,
  })
}

export function completeAcknowledgeBatchState(
  state: HubAnnouncementState,
): HubAnnouncementState {
  if (state.openBatch === null && state.ackStatus === 'idle' && state.ackErrorMessage === null) {
    return state
  }
  return Object.freeze({
    ...state,
    openBatch: null,
    openBatchVisitId: null,
    ackStatus: 'idle',
    ackErrorMessage: null,
  })
}

export function failAcknowledgeBatchState(
  state: HubAnnouncementState,
  message: string = 'Could not save announcement acknowledgment right now. Retry or close for now.',
): HubAnnouncementState {
  if (state.openBatch === null) return state
  return Object.freeze({
    ...state,
    ackStatus: 'failed',
    ackErrorMessage: message,
  })
}

export function dismissFailedAcknowledgeBatchState(
  state: HubAnnouncementState,
): HubAnnouncementState {
  if (state.openBatch === null && state.ackStatus === 'idle' && state.ackErrorMessage === null) {
    return state
  }
  return Object.freeze({
    ...state,
    openBatch: null,
    openBatchVisitId: null,
    ackStatus: 'idle',
    ackErrorMessage: null,
  })
}
