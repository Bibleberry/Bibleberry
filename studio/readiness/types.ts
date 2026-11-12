import type {
  AllowedCardCategory,
  AllowedCardEditorialStatus,
  AllowedReviewerRole,
} from '../schemaTypes/monthlyHelpers'

export type AuthorizedDataset = 'production' | 'staging'

export type ReadinessSeverity = 'blocking' | 'needsReview' | 'informational' | 'unknown'

export type OverallReadinessStatus =
  | 'unknown'
  | 'blocked'
  | 'needsReview'
  | 'checksPass'

export type DocumentPresenceState =
  | 'missing'
  | 'draftOnly'
  | 'publishedSynced'
  | 'publishedWithDraftEdits'

export type EditorDocumentType =
  | 'monthlyPublication'
  | 'challenge'
  | 'scriptureCard'
  | 'newsArticle'

export interface EditorDocumentTarget {
  /** Base document ID (without drafts. prefix) */
  documentId: string
  documentType: EditorDocumentType
  /** Studio structure child ID used by ChildLink when inside the monthly workspace */
  structureChildId: string
  label: string
  yearMonth?: string
  slug?: string
}

export interface ReadinessFinding {
  id: string
  severity: ReadinessSeverity
  category:
    | 'environment'
    | 'identity'
    | 'calendar'
    | 'challenge'
    | 'introduction'
    | 'discoveries'
    | 'cards'
    | 'review'
    | 'finalization'
    | 'previewNews'
  perspective: 'published' | 'draft' | 'both' | 'unknown'
  message: string
  path?: string
  editorTarget?: EditorDocumentTarget
}

export interface MonthPublicationMetadata {
  _id: string
  _rev?: string
  _updatedAt?: string
  yearMonth?: string
  year?: number
  month?: number
  title?: string
  hasSubtitle?: boolean
  hasCoverImage?: boolean
  hasCoverImageAlt?: boolean
  defaultSeriesRef?: string
  previewNewsRef?: string
  editorialStatus?: string
  withdrawn?: boolean
  editorialReview?: {
    reviewedBy?: string
    reviewerRole?: string
    reviewedAt?: string
    hasReviewNotes?: boolean
  }
  introduction?: {
    previewScreenCount?: number
    previewScreensMissingBlocksCount?: number
    hasWelcomeScreen?: boolean
    welcomeBlockCount?: number
  }
  slots?: Array<{
    _key?: string
    dayOfMonth?: number
    date?: string
    slotStatus?: string
    challengeRef?: string
    hasWithdrawalReason?: boolean
  }>
  rosterFinalization?: {
    isFinalized?: boolean
    rosterVersion?: number
    finalizedAt?: string
    finalizedBy?: string
    finalizedChallengeIds?: string[]
    priorRosters?: Array<{
      rosterVersion?: number
      supersededAt?: string
      hasReason?: boolean
      challengeCount?: number
    }>
  }
  discoveries?: Array<{
    _key?: string
    discoverySlug?: string
    title?: string
    qualifyingChallengeRefs?: string[]
    cardRef?: string
    reservedCardId?: string
  }>
  fullMonthCard?: {
    title?: string
    cardRef?: string
    reservedCardId?: string
  }
}

export interface ChallengeMetadata {
  _id: string
  _rev?: string
  _updatedAt?: string
  title?: string
  slug?: string
  challengeType?: string
  withdrawn?: boolean
  hasPrimaryScripture?: boolean
  scriptureReference?: string
  scriptureTranslation?: string
  scriptureTextStatus?: string
  hasScripturePassage?: boolean
  scriptureRightsConfirmed?: boolean
  practiceStatus?: string
  screenCount?: number
  adaptationReviewed?: boolean
  reviewedBy?: string
  reviewedAt?: string
  unapprovedBlockCount?: number
}

export interface ScriptureCardMetadata {
  _id: string
  _rev?: string
  _updatedAt?: string
  title?: string
  slug?: string
  cardCategory?: AllowedCardCategory | string
  plannedYearMonth?: string
  editorialStatus?: AllowedCardEditorialStatus | string
  withdrawn?: boolean
  hasArtwork?: boolean
  assetRevision?: string
  hasIllustrationAlt?: boolean
  hasAccessibleTranscription?: boolean
  altMatchesTranscription?: boolean
  artworkRightsConfirmed?: boolean
  hasAttribution?: boolean
  hasRightsStatus?: boolean
  book?: string
  scriptureReference?: string
  translation?: string
  scriptureRightsConfirmed?: boolean
  reviewedBy?: string
  reviewerRole?: AllowedReviewerRole | string
  reviewedAt?: string
}

export interface PreviewNewsMetadata {
  _id: string
  _rev?: string
  _updatedAt?: string
  title?: string
  slug?: string
  category?: string
  publishOnDate?: string
  relatedMonthRef?: string
  withdrawn?: boolean
  hasSummary?: boolean
  hasBody?: boolean
  hasCoverImage?: boolean
  hasCoverImageAlt?: boolean
  reviewedBy?: string
  reviewerRole?: string
  reviewedAt?: string
}

export interface OtherMonthMetadata {
  _id: string
  yearMonth?: string
  challengeRefs?: string[]
}

export interface ReadinessDatasetSnapshot {
  dataset: string
  yearMonth: string
  monthPublished: MonthPublicationMetadata | null
  monthDraft: MonthPublicationMetadata | null
  nonConformingMonths?: MonthPublicationMetadata[]
  publishedChallenges: Record<string, ChallengeMetadata>
  draftChallenges: Record<string, ChallengeMetadata>
  publishedCards: Record<string, ScriptureCardMetadata>
  draftCards: Record<string, ScriptureCardMetadata>
  publishedPreviewNews: PreviewNewsMetadata | null
  draftPreviewNews: PreviewNewsMetadata | null
  otherPublishedMonths: OtherMonthMetadata[]
  otherDraftMonths: OtherMonthMetadata[]
  queryFailure?: {
    kind: 'invalidConfiguration' | 'permissionDenied' | 'networkError' | 'aborted' | 'perspectiveAmbiguity'
    message: string
  }
}

export interface SlotReadinessSummary {
  dayOfMonth: number
  expectedDate: string
  actualDate?: string
  slotKey?: string
  slotStatus: string
  challengeBaseId?: string
  challengeTitle?: string
  presence: DocumentPresenceState | 'unassigned'
  publishedReady: boolean
  issues: string[]
  editorTarget?: EditorDocumentTarget
}

export interface DiscoveryReadinessSummary {
  key: string
  discoverySlug?: string
  title?: string
  qualifyingCount: number
  subsetValid: boolean
  cardLinkKind: 'scriptureCard' | 'legacyReservedId' | 'unlinked'
  cardBaseId?: string
  cardPresence?: DocumentPresenceState
  cardReady: boolean
  issues: string[]
  editorTarget?: EditorDocumentTarget
}

export interface MonthlyReadinessReport {
  yearMonth: string
  expectedMonthDocumentId: string
  expectedPreviewNewsDocumentId: string
  dataset: string
  datasetAuthorized: boolean
  evaluatedAtIso: string
  overallStatus: OverallReadinessStatus
  authorityDisclaimer: string
  schemaValidationDisclaimer: string
  counts: {
    blocking: number
    needsReview: number
    informational: number
    unknown: number
  }
  monthSummary: {
    exists: boolean
    presence: DocumentPresenceState
    activeSourcePerspective: 'published' | 'draft' | 'none'
    title?: string
    editorialStatus?: string
    withdrawn: boolean
    reviewerRole?: string
    reviewedBy?: string
    reviewedAt?: string
    editorTarget?: EditorDocumentTarget
  }
  calendarSummary: {
    expectedDays: number
    presentSlots: number
    scheduledSlots: number
    withdrawnSlots: number
    unassignedSlots: number
    duplicateIntraMonthRefs: number
    crossMonthPublishedCollisions: number
    crossMonthDraftCollisions: number
  }
  challengeSummary: {
    distinctScheduledCount: number
    publishedAndReadyCount: number
    draftOnlyCount: number
    missingCount: number
    unreviewedOrUnapprovedCount: number
    withdrawnCount: number
    scriptureRightsIssuesCount: number
    draftPendingEditsCount: number
  }
  introductionSummary: {
    previewScreenCount: number
    previewScreensMissingBlocksCount: number
    hasWelcomeScreen: boolean
    welcomeBlockCount: number
    advancePreviewStartDate?: string
    monthStartDate?: string
  }
  discoveryAndCardSummary: {
    discoveryCount: number
    subsetViolationsCount: number
    linkedCardCount: number
    publishedApprovedCardCount: number
    legacyReservedCardCount: number
    unlinkedDiscoveryOrFullMonthCount: number
    fullMonthCardStatus: 'linkedAndReady' | 'linkedWithIssues' | 'legacyReservedId' | 'unlinked'
  }
  finalizationSummary: {
    isFinalized: boolean
    rosterVersion?: number
    finalizedAt?: string
    finalizedBy?: string
    finalizedChallengeIdsCount: number
    matchesActiveScheduledSlots: boolean
    priorRostersCount: number
  }
  previewNewsSummary: {
    presence: DocumentPresenceState
    linkedFromMonth: boolean
    publishOnDate?: string
    earliestAllowedDate?: string
    withdrawn: boolean
    editorTarget: EditorDocumentTarget
  }
  findings: ReadinessFinding[]
  slots: SlotReadinessSummary[]
  discoveries: DiscoveryReadinessSummary[]
}

/**
 * Strictly read-only Sanity client surface. Mutations (create, patch, delete, transaction)
 * are intentionally excluded at the type level.
 */
export interface ReadOnlySanityClient {
  fetch: <T = unknown>(
    query: string,
    params?: Record<string, unknown>,
    options?: {signal?: AbortSignal},
  ) => Promise<T>
  withConfig?: (config: {perspective?: 'published' | 'raw' | 'drafts' | 'previewDrafts'}) => ReadOnlySanityClient
}
