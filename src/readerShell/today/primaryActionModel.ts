import type { ChallengeOrigin } from '../../cms/reader/challengeOrigin.ts'
import type {
  MonthDetailResult,
  MonthGatewayChallengeType,
} from '../../cms/reader/monthProvider.ts'
import type { HubContinueResult } from '../../hubContinue/types.ts'
import {
  formatCanonicalChallengeId,
  parseLocalCalendarDate,
  parsePublicationYearMonth,
  parseStoredChallengeId,
} from '../../participation/identity.ts'
import { selectChallengeParticipationView } from '../../participation/model.ts'
import type {
  CanonicalChallengeId,
  ChallengeParticipationStatus,
  LocalCalendarDate,
  PublicationYearMonth,
  ReaderParticipationData,
} from '../../participation/types.ts'

/**
 * Amber Causeway (Issue #288): Today primary teaching action projection for R06 (Ivory Sextant
 * WP-04 data slice, audit AD-4).
 *
 * Pure, deterministic and read-only. Today's Challenge is selected only from the
 * gateway-authorized current Month detail and its `serverContext.authorizedLocalDate`, intersected
 * with durable reader participation. Device time, static fixtures, guessed slugs and title/date
 * previews never produce a Challenge action.
 *
 * The projection returns typed *intents*. Executing navigation/history, honoring the saved resume
 * position, the reread entry flag and every participation write belong to the shell/reader host.
 */

const VALID_CHALLENGE_TYPES: ReadonlySet<string> = new Set<MonthGatewayChallengeType>([
  'teaching',
  'discipline',
  'reflection',
  'memorization',
])

const TODAY_ORIGIN: ChallengeOrigin = Object.freeze({ kind: 'hub' })

/** Current Month gateway source as seen by the Today host; `loading` means no result yet. */
export type TodayMonthSource = { readonly status: 'loading' } | MonthDetailResult

export interface TodayPrimaryActionInput {
  /** Result of `monthProvider.loadMonth(currentYearMonth)` (or `loading` while in flight). */
  readonly currentMonth: TodayMonthSource
  /** Durable participation data; omit/`null` while the participation store is hydrating. */
  readonly participationData?: ReaderParticipationData | null
  /** The existing single Hub Continue result (G01), supplied separately as secondary input. */
  readonly hubContinue?: HubContinueResult | null
}

/** How the host should enter an authorized Challenge. Never routed through the Month Intro. */
export type TodayChallengeEntry =
  /** Not yet started: open at the beginning. */
  | 'start'
  /** Started and unfinished: the host restores its own saved resume position. */
  | 'resume'
  /** Completed: intentional reread from the beginning, without resetting completion or awards. */
  | 'readAgain'

export interface OpenChallengeIntent {
  readonly type: 'openChallenge'
  readonly challengeId: CanonicalChallengeId
  readonly slug: string
  /** Sanity base document ID the host should verify after loading the slug. */
  readonly expectedDocumentId: string
  readonly entry: TodayChallengeEntry
  readonly origin: ChallengeOrigin
  /** Today's Challenge opens directly; the Monthly Introduction is never inserted. */
  readonly bypassesMonthIntro: true
}

export interface OpenMonthIntent {
  readonly type: 'openMonth'
  readonly yearMonth: PublicationYearMonth
}

/** Re-request the current Month detail from the gateway. */
export interface RetryIntent {
  readonly type: 'retry'
}

export type TodayIntent = OpenChallengeIntent | OpenMonthIntent | RetryIntent

export interface TodayAuthorizedContext {
  readonly yearMonth: PublicationYearMonth
  readonly authorizedLocalDate: LocalCalendarDate
  readonly effectiveTimeZone: string
  readonly monthTitle: string
}

export interface TodayChallengeSummary {
  readonly challengeId: CanonicalChallengeId
  readonly slug: string
  readonly title: string
  readonly challengeType: MonthGatewayChallengeType
  readonly dayOfMonth: number
  readonly publicationDate: LocalCalendarDate
  readonly participation: ChallengeParticipationStatus
}

/** Why today's teaching is not offered while the current Month itself is known. */
export type TodayExploreReason =
  | 'noChallengeScheduled'
  | 'notYetReleased'
  | 'withdrawn'
  | 'invalidSlot'
  | 'ambiguousSlot'

/** Why no gateway-authorized current Month context exists. */
export type TodayUnavailableReason = 'monthNotPublished' | 'unauthorizedContext'

export type TodayErrorReason = 'requestError' | 'validationError'

export type TodayPrimaryProjection =
  | {
      readonly status: 'loading'
      readonly action: null
    }
  | {
      readonly status: 'challenge'
      readonly challenge: TodayChallengeSummary
      /** `true` when completed: show the Completed state with a prominent Read Again action. */
      readonly isCompleted: boolean
      readonly action: OpenChallengeIntent
    }
  | {
      readonly status: 'exploreMonth'
      readonly reason: TodayExploreReason
      readonly action: OpenMonthIntent
    }
  | {
      readonly status: 'unavailable'
      readonly reason: TodayUnavailableReason
      readonly action: null
    }
  | {
      readonly status: 'error'
      readonly reason: TodayErrorReason
      readonly action: RetryIntent
    }

export type TodaySecondaryContinue =
  | {
      readonly kind: 'continueChallenge'
      readonly yearMonth: PublicationYearMonth
      readonly monthHeading: string
      readonly challengeTitle: string
      readonly action: OpenChallengeIntent
    }
  | {
      readonly kind: 'openFocusMonth' | 'reviewFocusMonth'
      readonly yearMonth: PublicationYearMonth
      readonly monthHeading: string
      readonly action: OpenMonthIntent
    }

export interface TodayPrimaryActionModel {
  readonly source: 'gateway'
  /** Gateway-authorized current Month context, or `null` when none is known. */
  readonly context: TodayAuthorizedContext | null
  readonly primary: TodayPrimaryProjection
  /** Compact Current Month link; present exactly when `context` is known. */
  readonly currentMonthLink: OpenMonthIntent | null
  /** At most one secondary historical continuation, passed through from Hub Continue. */
  readonly secondary: TodaySecondaryContinue | null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function trimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toCanonicalCmsChallengeId(raw: unknown): CanonicalChallengeId | null {
  if (typeof raw !== 'string') return null
  return parseStoredChallengeId(raw, 'cms') ?? formatCanonicalChallengeId('cms', raw)
}

function documentIdOf(id: CanonicalChallengeId): string {
  return id.slice(id.indexOf(':') + 1)
}

function openMonth(yearMonth: PublicationYearMonth): OpenMonthIntent {
  return Object.freeze({ type: 'openMonth', yearMonth })
}

function openChallenge(
  challengeId: CanonicalChallengeId,
  slug: string,
  entry: TodayChallengeEntry,
  origin: ChallengeOrigin = TODAY_ORIGIN,
): OpenChallengeIntent {
  return Object.freeze({
    type: 'openChallenge',
    challengeId,
    slug,
    expectedDocumentId: documentIdOf(challengeId),
    entry,
    origin,
    bypassesMonthIntro: true,
  })
}

const RETRY: RetryIntent = Object.freeze({ type: 'retry' })

interface AuthorizedMonth {
  readonly context: TodayAuthorizedContext
  readonly slots: readonly unknown[]
}

/**
 * Accepts a `ready` result only when it is internally consistent: a valid authorized local date,
 * an `active` Month whose `monthId` equals that date's year-month, and a slot list.
 */
function authorizeMonth(result: Extract<MonthDetailResult, { status: 'ready' }>): AuthorizedMonth | null {
  if (!isPlainObject(result.serverContext) || !isPlainObject(result.month)) return null
  const authorizedLocalDate = parseLocalCalendarDate(result.serverContext.authorizedLocalDate)
  const effectiveTimeZone = trimmedString(result.serverContext.effectiveTimeZone)
  if (!authorizedLocalDate || !effectiveTimeZone) return null

  const month = result.month as unknown as Record<string, unknown>
  const yearMonth = parsePublicationYearMonth(month.monthId)
  if (!yearMonth || month.monthId !== authorizedLocalDate.slice(0, 7)) return null
  if (month.phase !== 'active') return null
  const monthTitle = trimmedString(month.title)
  if (!monthTitle || !Array.isArray(month.slots)) return null

  return {
    context: Object.freeze({ yearMonth, authorizedLocalDate, effectiveTimeZone, monthTitle }),
    slots: month.slots,
  }
}

type SlotSelection =
  | { readonly kind: 'available'; readonly slot: Omit<TodayChallengeSummary, 'participation'> }
  | { readonly kind: 'none'; readonly reason: TodayExploreReason }

function selectTodaySlot(month: AuthorizedMonth): SlotSelection {
  const { authorizedLocalDate } = month.context
  const day = Number(authorizedLocalDate.slice(8, 10))
  const matches = month.slots.filter(
    slot => isPlainObject(slot) && (slot.date === authorizedLocalDate || slot.dayOfMonth === day),
  ) as Record<string, unknown>[]

  if (matches.length === 0) return { kind: 'none', reason: 'noChallengeScheduled' }
  if (matches.length > 1) return { kind: 'none', reason: 'ambiguousSlot' }

  const slot = matches[0]
  if (slot.date !== authorizedLocalDate || slot.dayOfMonth !== day) {
    return { kind: 'none', reason: 'invalidSlot' }
  }
  if (slot.availability === 'comingSoon') return { kind: 'none', reason: 'notYetReleased' }
  if (slot.availability === 'unavailable') return { kind: 'none', reason: 'withdrawn' }
  if (slot.availability !== 'available') return { kind: 'none', reason: 'invalidSlot' }

  const challengeId = toCanonicalCmsChallengeId(slot.challengeId)
  const slug = trimmedString(slot.slug)
  const title = trimmedString(slot.title)
  const challengeType = slot.challengeType
  if (
    !challengeId ||
    !slug ||
    !title ||
    typeof challengeType !== 'string' ||
    !VALID_CHALLENGE_TYPES.has(challengeType)
  ) {
    return { kind: 'none', reason: 'invalidSlot' }
  }

  return {
    kind: 'available',
    slot: {
      challengeId,
      slug,
      title,
      challengeType: challengeType as MonthGatewayChallengeType,
      dayOfMonth: day,
      publicationDate: authorizedLocalDate,
    },
  }
}

const EMPTY_RECORDS: Readonly<Record<string, never>> = Object.freeze({})

/** Read-only guard so malformed record maps never throw inside the participation selector. */
function normalizeParticipation(data: ReaderParticipationData): ReaderParticipationData {
  const recordsOrEmpty = <T>(value: T): T => (isPlainObject(value) ? value : (EMPTY_RECORDS as T))
  return {
    ...data,
    completedChallenges: recordsOrEmpty(data.completedChallenges),
    inProgressChallenges: recordsOrEmpty(data.inProgressChallenges),
    savedChallenges: recordsOrEmpty(data.savedChallenges),
    lastOpenedChallenge: isPlainObject(data.lastOpenedChallenge) ? data.lastOpenedChallenge : null,
  }
}

function entryFor(status: ChallengeParticipationStatus): TodayChallengeEntry {
  if (status === 'completed') return 'readAgain'
  if (status === 'inProgress') return 'resume'
  return 'start'
}

function projectSecondary(
  hubContinue: HubContinueResult | null | undefined,
  context: TodayAuthorizedContext | null,
  todayChallengeId: CanonicalChallengeId | null,
): TodaySecondaryContinue | null {
  if (!isPlainObject(hubContinue) || hubContinue.status !== 'suggestion') return null
  const suggestion = hubContinue.suggestion
  if (!isPlainObject(suggestion)) return null

  const yearMonth = parsePublicationYearMonth(suggestion.yearMonth)
  const monthHeading = trimmedString(suggestion.monthHeading)
  if (!yearMonth || !monthHeading) return null
  // Continue Your Study is historical only: never duplicate the current Month or today's teaching.
  if (context && yearMonth === context.yearMonth) return null

  if (suggestion.kind === 'resumeInProgress') {
    const challengeId = toCanonicalCmsChallengeId(suggestion.challengeId)
    const slug = trimmedString(suggestion.challengeSlug)
    const challengeTitle = trimmedString(suggestion.challengeTitle)
    if (!challengeId || !slug || !challengeTitle) return null
    if (challengeId === todayChallengeId) return null
    return Object.freeze({
      kind: 'continueChallenge',
      yearMonth,
      monthHeading,
      challengeTitle,
      action: openChallenge(challengeId, slug, 'resume'),
    })
  }

  if (suggestion.kind === 'openFocusMonth' || suggestion.kind === 'reviewFocusMonth') {
    return Object.freeze({
      kind: suggestion.kind,
      yearMonth,
      monthHeading,
      action: openMonth(yearMonth),
    })
  }

  return null
}

function model(
  context: TodayAuthorizedContext | null,
  primary: TodayPrimaryProjection,
  input: TodayPrimaryActionInput,
  todayChallengeId: CanonicalChallengeId | null = null,
): TodayPrimaryActionModel {
  return Object.freeze({
    source: 'gateway',
    context,
    primary: Object.freeze(primary),
    currentMonthLink: context ? openMonth(context.yearMonth) : null,
    secondary: projectSecondary(input.hubContinue, context, todayChallengeId),
  })
}

/**
 * Derives the Today primary teaching action, compact Current Month link and single secondary
 * continuation. Only a slot with `availability === 'available'` dated exactly on the gateway's
 * authorized local date can yield a Challenge-open intent.
 */
export function deriveTodayPrimaryAction(input: TodayPrimaryActionInput): TodayPrimaryActionModel {
  const safeInput: TodayPrimaryActionInput = isPlainObject(input)
    ? input
    : { currentMonth: { status: 'loading' } }
  const source: unknown = isPlainObject(input) ? input.currentMonth : undefined
  if (!isPlainObject(source)) {
    return model(null, { status: 'error', reason: 'validationError', action: RETRY }, safeInput)
  }

  input = safeInput
  const result = source as TodayMonthSource
  switch (result.status) {
    case 'loading':
      return model(null, { status: 'loading', action: null }, input)
    case 'requestError':
      return model(null, { status: 'error', reason: 'requestError', action: RETRY }, input)
    case 'validationError':
      return model(null, { status: 'error', reason: 'validationError', action: RETRY }, input)
    case 'notFound':
      return model(null, { status: 'unavailable', reason: 'monthNotPublished', action: null }, input)
    case 'ready':
      break
    default:
      return model(null, { status: 'error', reason: 'validationError', action: RETRY }, input)
  }

  if (result.source !== 'gateway') {
    return model(null, { status: 'unavailable', reason: 'unauthorizedContext', action: null }, input)
  }

  const month = authorizeMonth(result)
  if (!month) {
    return model(null, { status: 'unavailable', reason: 'unauthorizedContext', action: null }, input)
  }

  const selection = selectTodaySlot(month)
  if (selection.kind === 'none') {
    return model(
      month.context,
      { status: 'exploreMonth', reason: selection.reason, action: openMonth(month.context.yearMonth) },
      input,
    )
  }

  const participationData = input.participationData
  if (!isPlainObject(participationData)) {
    return model(month.context, { status: 'loading', action: null }, input, selection.slot.challengeId)
  }

  const view = selectChallengeParticipationView(
    normalizeParticipation(participationData),
    selection.slot.challengeId,
  )
  const challenge: TodayChallengeSummary = Object.freeze({
    ...selection.slot,
    participation: view.status,
  })

  return model(
    month.context,
    {
      status: 'challenge',
      challenge,
      isCompleted: view.isCompleted,
      action: openChallenge(challenge.challengeId, challenge.slug, entryFor(view.status)),
    },
    input,
    challenge.challengeId,
  )
}
