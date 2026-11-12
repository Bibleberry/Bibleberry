import {
  ALLOWED_REVIEWER_ROLES,
  CARD_PLACEHOLDER_PATTERN,
  computeAdvancePreviewStartDate,
  daysInMonth,
  formatCivilDate,
  isValidCivilDate,
  parseYearMonth,
  stripDraftPrefix,
} from '../schemaTypes/monthlyHelpers'
import type {
  AuthorizedDataset,
  ChallengeMetadata,
  DiscoveryReadinessSummary,
  DocumentPresenceState,
  EditorDocumentTarget,
  MonthlyReadinessReport,
  MonthPublicationMetadata,
  OverallReadinessStatus,
  PreviewNewsMetadata,
  ReadinessDatasetSnapshot,
  ReadinessFinding,
  ScriptureCardMetadata,
  SlotReadinessSummary,
} from './types'

export const AUTHORITY_DISCLAIMER =
  'Read-only operational readiness inspector. Does not approve, finalize, publish, or authorize reader release; Sanity Studio publish validation and the Cloudflare Release Gateway embargo rules remain authoritative.'

export const SCHEMA_VALIDATION_DISCLAIMER =
  'Evaluates metadata-only projections against Bibleberry’s monthly schema contracts. Full teaching bodies, artwork URLs, and raw Sanity payloads are not queried; run Studio’s full document validation on the editor form before publishing.'

const VALID_EDITORIAL_STATUSES = new Set(['draft', 'inReview', 'approved', 'scheduled'])

export function isAuthorizedDataset(dataset: string | undefined | null): dataset is AuthorizedDataset {
  return dataset === 'production' || dataset === 'staging'
}

export function isValidTargetYearMonth(yearMonth: string): boolean {
  const parsed = parseYearMonth(yearMonth)
  return Boolean(parsed && parsed.year >= 2026 && parsed.year <= 2100)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isValidIsoTimestamp(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0 && Number.isFinite(Date.parse(value))
}

function makeMonthEditorTarget(yearMonth: string): EditorDocumentTarget {
  const docId = `month-${yearMonth}`
  return {
    documentId: docId,
    documentType: 'monthlyPublication',
    structureChildId: docId,
    label: `Open ${docId}`,
    yearMonth,
  }
}

function makePreviewNewsEditorTarget(yearMonth: string): EditorDocumentTarget {
  const docId = `news-preview-${yearMonth}`
  return {
    documentId: docId,
    documentType: 'newsArticle',
    structureChildId: docId,
    label: `Open ${docId}`,
    yearMonth,
  }
}

function makeChallengeEditorTarget(challengeBaseId: string): EditorDocumentTarget {
  return {
    documentId: challengeBaseId,
    documentType: 'challenge',
    structureChildId: `challenge:${challengeBaseId}`,
    label: `Open ${challengeBaseId}`,
  }
}

function makeCardEditorTarget(cardBaseId: string): EditorDocumentTarget {
  const slug = cardBaseId.startsWith('card-') ? cardBaseId.slice(5) : cardBaseId
  return {
    documentId: cardBaseId,
    documentType: 'scriptureCard',
    structureChildId: cardBaseId,
    label: `Open ${cardBaseId}`,
    slug,
  }
}

function computePresence(published: {_rev?: string; _updatedAt?: string} | null | undefined, draft: {_rev?: string; _updatedAt?: string} | null | undefined): DocumentPresenceState {
  if (!published && !draft) return 'missing'
  if (!published && draft) return 'draftOnly'
  if (published && !draft) return 'publishedSynced'
  if (
    published?._rev &&
    draft?._rev &&
    published._rev === draft._rev &&
    published?._updatedAt === draft?._updatedAt
  ) {
    return 'publishedSynced'
  }
  return 'publishedWithDraftEdits'
}

function evaluateChallengeMetadata(
  baseId: string,
  published: ChallengeMetadata | undefined,
  draft: ChallengeMetadata | undefined,
): {
  presence: DocumentPresenceState
  publishedReady: boolean
  blockingIssues: string[]
  reviewIssues: string[]
  title?: string
  isUnreviewedOrUnapproved: boolean
  isWithdrawn: boolean
  hasScriptureRightsIssue: boolean
} {
  const presence = computePresence(published, draft)
  const blockingIssues: string[] = []
  const reviewIssues: string[] = []
  const title = draft?.title ?? published?.title

  if (!published && !draft) {
    blockingIssues.push(`Referenced Challenge "${baseId}" was not found in Sanity (missing in both published and draft).`)
    return {
      presence,
      publishedReady: false,
      blockingIssues,
      reviewIssues,
      title,
      isUnreviewedOrUnapproved: false,
      isWithdrawn: false,
      hasScriptureRightsIssue: false,
    }
  }

  if (!published && draft) {
    blockingIssues.push(`Referenced Challenge "${baseId}" exists only as a draft and is absent from Sanity's published perspective.`)
  }

  const target = published ?? draft!
  let isUnreviewedOrUnapproved = false
  let isWithdrawn = false
  let hasScriptureRightsIssue = false

  if (target.withdrawn === true) {
    isWithdrawn = true
    blockingIssues.push(`Challenge "${baseId}" is marked withdrawn in its ${published ? 'published' : 'draft'} document.`)
  }

  if (target.adaptationReviewed !== true) {
    isUnreviewedOrUnapproved = true
    blockingIssues.push(`Challenge "${baseId}" has not completed editorial adaptation review (adaptationReviewed = true).`)
  }

  if (!isNonEmptyString(target.reviewedBy) || !isValidIsoTimestamp(target.reviewedAt)) {
    isUnreviewedOrUnapproved = true
    blockingIssues.push(`Challenge "${baseId}" is missing reviewedBy or a valid reviewedAt timestamp.`)
  }

  if (typeof target.unapprovedBlockCount !== 'number' || target.unapprovedBlockCount > 0) {
    isUnreviewedOrUnapproved = true
    const countLabel = typeof target.unapprovedBlockCount === 'number'
      ? `${target.unapprovedBlockCount} unapproved structured editorial block${target.unapprovedBlockCount === 1 ? '' : 's'}`
      : 'unverified structured editorial blocks'
    blockingIssues.push(`Challenge "${baseId}" has ${countLabel} awaiting approval.`)
  }

  if (typeof target.screenCount !== 'number' || target.screenCount < 1) {
    blockingIssues.push(`Challenge "${baseId}" must have at least one guided screen.`)
  }

  if (!target.hasPrimaryScripture || !isNonEmptyString(target.scriptureReference) || !isNonEmptyString(target.scriptureTranslation)) {
    hasScriptureRightsIssue = true
    blockingIssues.push(`Challenge "${baseId}" is missing required primaryScripture reference or translation metadata.`)
  } else {
    if (target.scriptureTextStatus === 'provided' && !target.hasScripturePassage) {
      hasScriptureRightsIssue = true
      blockingIssues.push(`Challenge "${baseId}" sets textStatus to "provided" without passage text.`)
    }
    if (target.scriptureTextStatus === 'referenceOnly' && target.hasScripturePassage) {
      hasScriptureRightsIssue = true
      blockingIssues.push(`Challenge "${baseId}" contains passage text while textStatus is "referenceOnly".`)
    }
    if (target.hasScripturePassage && target.scriptureRightsConfirmed !== true) {
      hasScriptureRightsIssue = true
      blockingIssues.push(`Challenge "${baseId}" includes passage text without confirmed app usage rights.`)
    }
    if (
      target.practiceStatus === 'configured' &&
      (target.scriptureTextStatus !== 'provided' || !target.hasScripturePassage || target.scriptureRightsConfirmed !== true)
    ) {
      hasScriptureRightsIssue = true
      blockingIssues.push(`Challenge "${baseId}" configures memorization practice without provided, rights-cleared passage text.`)
    }
  }

  if (presence === 'publishedWithDraftEdits' && draft) {
    const draftNotes: string[] = []
    if (draft.withdrawn === true && published?.withdrawn !== true) {
      draftNotes.push('draft marks Challenge withdrawn')
    }
    if (draft.adaptationReviewed !== true) {
      draftNotes.push('draft adaptationReviewed is false')
    }
    if (typeof draft.unapprovedBlockCount === 'number' && draft.unapprovedBlockCount > 0) {
      draftNotes.push(`draft has ${draft.unapprovedBlockCount} unapproved block(s)`)
    }
    const detail = draftNotes.length > 0 ? ` (${draftNotes.join('; ')})` : ''
    reviewIssues.push(`Challenge "${baseId}" has unpublished draft edits${detail}.`)
  }

  const publishedReady = Boolean(published) && blockingIssues.length === 0
  return {
    presence,
    publishedReady,
    blockingIssues,
    reviewIssues,
    title,
    isUnreviewedOrUnapproved,
    isWithdrawn,
    hasScriptureRightsIssue,
  }
}

function evaluateLinkedCardMetadata(
  cardBaseId: string,
  expectedCategory: 'monthlyThematic' | 'monthlyFull',
  monthYearMonth: string,
  published: ScriptureCardMetadata | undefined,
  draft: ScriptureCardMetadata | undefined,
): {
  presence: DocumentPresenceState
  ready: boolean
  blockingIssues: string[]
  reviewIssues: string[]
} {
  const presence = computePresence(published, draft)
  const blockingIssues: string[] = []
  const reviewIssues: string[] = []

  if (!published && !draft) {
    blockingIssues.push(`Referenced Scripture Card "${cardBaseId}" was not found in Sanity (missing in both published and draft).`)
    return {presence, ready: false, blockingIssues, reviewIssues}
  }

  if (!published && draft) {
    blockingIssues.push(`Referenced Scripture Card "${cardBaseId}" exists only as a draft and is not published in Sanity's published perspective.`)
  }

  const target = published ?? draft!

  if (target.withdrawn === true) {
    blockingIssues.push(`Scripture Card "${cardBaseId}" is marked withdrawn.`)
  }
  if (target.editorialStatus !== 'approved') {
    blockingIssues.push(`Scripture Card "${cardBaseId}" has editorialStatus "${String(target.editorialStatus ?? 'unset')}" (must be "approved").`)
  }
  if (target.cardCategory !== expectedCategory) {
    blockingIssues.push(`Scripture Card "${cardBaseId}" has cardCategory "${String(target.cardCategory ?? 'unset')}" (expected "${expectedCategory}").`)
  }
  if (isNonEmptyString(target.plannedYearMonth) && target.plannedYearMonth.trim() !== monthYearMonth) {
    blockingIssues.push(`Scripture Card "${cardBaseId}" plannedYearMonth "${target.plannedYearMonth.trim()}" does not match "${monthYearMonth}".`)
  }
  if (target.hasArtwork !== true) {
    blockingIssues.push(`Scripture Card "${cardBaseId}" is missing a finished illustrated artwork asset.`)
  }
  if (target.hasIllustrationAlt !== true || target.hasAccessibleTranscription !== true) {
    blockingIssues.push(`Scripture Card "${cardBaseId}" is missing required illustrationAlt or accessibleTranscription.`)
  } else if (target.altMatchesTranscription === true) {
    blockingIssues.push(`Scripture Card "${cardBaseId}" duplicates illustrationAlt as accessibleTranscription.`)
  }
  if (target.artworkRightsConfirmed !== true) {
    blockingIssues.push(`Scripture Card "${cardBaseId}" is missing confirmed artwork usage rights.`)
  }

  const requiresScriptureRights =
    isNonEmptyString(target.translation) &&
    target.translation.trim().toLowerCase() !== 'not configured'
  if (requiresScriptureRights && target.scriptureRightsConfirmed !== true) {
    blockingIssues.push(`Scripture Card "${cardBaseId}" is missing confirmed Scripture translation usage rights (${target.translation}).`)
  }

  if (!isNonEmptyString(target.reviewedBy)) {
    blockingIssues.push(`Scripture Card "${cardBaseId}" is missing editorialReview.reviewedBy.`)
  }
  if (
    typeof target.reviewerRole !== 'string' ||
    !(ALLOWED_REVIEWER_ROLES as readonly string[]).includes(target.reviewerRole)
  ) {
    blockingIssues.push(`Scripture Card "${cardBaseId}" has missing or invalid editorialReview.reviewerRole.`)
  }
  if (!isValidIsoTimestamp(target.reviewedAt)) {
    blockingIssues.push(`Scripture Card "${cardBaseId}" is missing a valid editorialReview.reviewedAt timestamp.`)
  }

  if (presence === 'publishedWithDraftEdits') {
    reviewIssues.push(`Scripture Card "${cardBaseId}" has unpublished draft edits relative to its published version.`)
  }

  return {
    presence,
    ready: Boolean(published) && blockingIssues.length === 0,
    blockingIssues,
    reviewIssues,
  }
}

function buildEmptyFailClosedReport(
  snapshot: ReadinessDatasetSnapshot,
  evaluatedAtIso: string,
  finding: ReadinessFinding,
): MonthlyReadinessReport {
  const yearMonth = snapshot.yearMonth
  const parsed = parseYearMonth(yearMonth)
  const expectedDays = parsed ? daysInMonth(parsed.year, parsed.month) : 0
  const advancePreviewStartDate = parsed
    ? computeAdvancePreviewStartDate(parsed.year, parsed.month)
    : undefined

  return {
    yearMonth,
    expectedMonthDocumentId: isValidTargetYearMonth(yearMonth) ? `month-${yearMonth}` : 'month-INVALID',
    expectedPreviewNewsDocumentId: isValidTargetYearMonth(yearMonth)
      ? `news-preview-${yearMonth}`
      : 'news-preview-INVALID',
    dataset: snapshot.dataset,
    datasetAuthorized: isAuthorizedDataset(snapshot.dataset),
    evaluatedAtIso,
    overallStatus: 'unknown',
    authorityDisclaimer: AUTHORITY_DISCLAIMER,
    schemaValidationDisclaimer: SCHEMA_VALIDATION_DISCLAIMER,
    counts: {
      blocking: 0,
      needsReview: 0,
      informational: 0,
      unknown: 1,
    },
    monthSummary: {
      exists: false,
      presence: 'missing',
      activeSourcePerspective: 'none',
      withdrawn: false,
      editorTarget: isValidTargetYearMonth(yearMonth) ? makeMonthEditorTarget(yearMonth) : undefined,
    },
    calendarSummary: {
      expectedDays,
      presentSlots: 0,
      scheduledSlots: 0,
      withdrawnSlots: 0,
      unassignedSlots: 0,
      duplicateIntraMonthRefs: 0,
      crossMonthPublishedCollisions: 0,
      crossMonthDraftCollisions: 0,
    },
    challengeSummary: {
      distinctScheduledCount: 0,
      publishedAndReadyCount: 0,
      draftOnlyCount: 0,
      missingCount: 0,
      unreviewedOrUnapprovedCount: 0,
      withdrawnCount: 0,
      scriptureRightsIssuesCount: 0,
      draftPendingEditsCount: 0,
    },
    introductionSummary: {
      previewScreenCount: 0,
      previewScreensMissingBlocksCount: 0,
      hasWelcomeScreen: false,
      welcomeBlockCount: 0,
      advancePreviewStartDate,
      monthStartDate: isValidTargetYearMonth(yearMonth) ? `${yearMonth}-01` : undefined,
    },
    discoveryAndCardSummary: {
      discoveryCount: 0,
      subsetViolationsCount: 0,
      linkedCardCount: 0,
      publishedApprovedCardCount: 0,
      legacyReservedCardCount: 0,
      unlinkedDiscoveryOrFullMonthCount: 0,
      fullMonthCardStatus: 'unlinked',
    },
    finalizationSummary: {
      isFinalized: false,
      finalizedChallengeIdsCount: 0,
      matchesActiveScheduledSlots: false,
      priorRostersCount: 0,
    },
    previewNewsSummary: {
      presence: 'missing',
      linkedFromMonth: false,
      earliestAllowedDate: advancePreviewStartDate,
      withdrawn: false,
      editorTarget: makePreviewNewsEditorTarget(
        isValidTargetYearMonth(yearMonth) ? yearMonth : '2026-01',
      ),
    },
    findings: [finding],
    slots: [],
    discoveries: [],
  }
}

export function evaluateMonthlyReadiness(
  snapshot: ReadinessDatasetSnapshot,
  evaluatedAtIso = new Date().toISOString(),
): MonthlyReadinessReport {
  if (!isAuthorizedDataset(snapshot.dataset)) {
    return buildEmptyFailClosedReport(snapshot, evaluatedAtIso, {
      id: 'env-unauthorized-dataset',
      severity: 'unknown',
      category: 'environment',
      perspective: 'unknown',
      message: `Unauthorized or ambiguous Sanity dataset "${String(snapshot.dataset || 'unset')}". Only "production" and "staging" are permitted.`,
    })
  }

  if (!isValidTargetYearMonth(snapshot.yearMonth)) {
    return buildEmptyFailClosedReport(snapshot, evaluatedAtIso, {
      id: 'identity-invalid-year-month',
      severity: 'unknown',
      category: 'identity',
      perspective: 'unknown',
      message: `Invalid publication month "${snapshot.yearMonth}". Enter a YYYY-MM month between 2026-01 and 2100-12.`,
    })
  }

  if (snapshot.queryFailure) {
    return buildEmptyFailClosedReport(snapshot, evaluatedAtIso, {
      id: `env-query-failure-${snapshot.queryFailure.kind}`,
      severity: 'unknown',
      category: 'environment',
      perspective: 'unknown',
      message: snapshot.queryFailure.message,
    })
  }

  const parsedYM = parseYearMonth(snapshot.yearMonth)!
  const expectedDays = daysInMonth(parsedYM.year, parsedYM.month)
  const expectedMonthId = `month-${snapshot.yearMonth}`
  const expectedPreviewNewsId = `news-preview-${snapshot.yearMonth}`
  const advancePreviewStartDate = computeAdvancePreviewStartDate(parsedYM.year, parsedYM.month)
  const monthStartDate = `${snapshot.yearMonth}-01`
  const monthEditorTarget = makeMonthEditorTarget(snapshot.yearMonth)
  const previewNewsEditorTarget = makePreviewNewsEditorTarget(snapshot.yearMonth)

  const findings: ReadinessFinding[] = []
  let findingCounter = 0
  const pushFinding = (finding: Omit<ReadinessFinding, 'id'>) => {
    findingCounter += 1
    findings.push({id: `f-${findingCounter}-${finding.category}`, ...finding})
  }

  const nonConformingMonths = snapshot.nonConformingMonths ?? []
  const fallbackNonConforming =
    !snapshot.monthDraft && !snapshot.monthPublished && nonConformingMonths.length > 0
      ? nonConformingMonths[0]
      : null
  const monthPresence = fallbackNonConforming
    ? fallbackNonConforming._id.startsWith('drafts.')
      ? 'draftOnly'
      : 'publishedSynced'
    : computePresence(snapshot.monthPublished, snapshot.monthDraft)
  const activeMonthDoc: MonthPublicationMetadata | null =
    snapshot.monthDraft ?? snapshot.monthPublished ?? fallbackNonConforming

  if (!activeMonthDoc) {
    pushFinding({
      severity: 'blocking',
      category: 'identity',
      perspective: 'both',
      message: `Monthly publication document "${expectedMonthId}" does not exist in "${snapshot.dataset}" (neither draft nor published).`,
      editorTarget: monthEditorTarget,
    })

    const counts = {
      blocking: 1,
      needsReview: 0,
      informational: 1,
      unknown: 0,
    }
    pushFinding({
      severity: 'informational',
      category: 'introduction',
      perspective: 'unknown',
      message: `Advance preview window for ${snapshot.yearMonth} opens ${advancePreviewStartDate}; month starts ${monthStartDate}. No public preview is generated by this inspector.`,
    })

    return {
      yearMonth: snapshot.yearMonth,
      expectedMonthDocumentId: expectedMonthId,
      expectedPreviewNewsDocumentId: expectedPreviewNewsId,
      dataset: snapshot.dataset,
      datasetAuthorized: true,
      evaluatedAtIso,
      overallStatus: 'blocked',
      authorityDisclaimer: AUTHORITY_DISCLAIMER,
      schemaValidationDisclaimer: SCHEMA_VALIDATION_DISCLAIMER,
      counts,
      monthSummary: {
        exists: false,
        presence: 'missing',
        activeSourcePerspective: 'none',
        withdrawn: false,
        editorTarget: monthEditorTarget,
      },
      calendarSummary: {
        expectedDays,
        presentSlots: 0,
        scheduledSlots: 0,
        withdrawnSlots: 0,
        unassignedSlots: 0,
        duplicateIntraMonthRefs: 0,
        crossMonthPublishedCollisions: 0,
        crossMonthDraftCollisions: 0,
      },
      challengeSummary: {
        distinctScheduledCount: 0,
        publishedAndReadyCount: 0,
        draftOnlyCount: 0,
        missingCount: 0,
        unreviewedOrUnapprovedCount: 0,
        withdrawnCount: 0,
        scriptureRightsIssuesCount: 0,
        draftPendingEditsCount: 0,
      },
      introductionSummary: {
        previewScreenCount: 0,
        previewScreensMissingBlocksCount: 0,
        hasWelcomeScreen: false,
        welcomeBlockCount: 0,
        advancePreviewStartDate,
        monthStartDate,
      },
      discoveryAndCardSummary: {
        discoveryCount: 0,
        subsetViolationsCount: 0,
        linkedCardCount: 0,
        publishedApprovedCardCount: 0,
        legacyReservedCardCount: 0,
        unlinkedDiscoveryOrFullMonthCount: 0,
        fullMonthCardStatus: 'unlinked',
      },
      finalizationSummary: {
        isFinalized: false,
        finalizedChallengeIdsCount: 0,
        matchesActiveScheduledSlots: false,
        priorRostersCount: 0,
      },
      previewNewsSummary: {
        presence: computePresence(snapshot.publishedPreviewNews, snapshot.draftPreviewNews),
        linkedFromMonth: false,
        publishOnDate: (snapshot.draftPreviewNews ?? snapshot.publishedPreviewNews)?.publishOnDate,
        earliestAllowedDate: advancePreviewStartDate,
        withdrawn: (snapshot.draftPreviewNews ?? snapshot.publishedPreviewNews)?.withdrawn === true,
        editorTarget: previewNewsEditorTarget,
      },
      findings,
      slots: [],
      discoveries: [],
    }
  }

  const activePerspective: 'published' | 'draft' = activeMonthDoc._id.startsWith('drafts.')
    ? 'draft'
    : 'published'

  for (const extraDoc of nonConformingMonths) {
    if (extraDoc === activeMonthDoc) continue
    pushFinding({
      severity: 'blocking',
      category: 'identity',
      perspective: extraDoc._id.startsWith('drafts.') ? 'draft' : 'published',
      path: '_id',
      message: `Duplicate/non-conforming monthlyPublication "${extraDoc._id}" also claims yearMonth "${snapshot.yearMonth}" instead of deterministic "${expectedMonthId}".`,
      editorTarget: monthEditorTarget,
    })
  }

  // 1. Month identity, draft/published sync, title, cover alt, and withdrawal
  const baseDocId = stripDraftPrefix(activeMonthDoc._id)
  if (baseDocId !== expectedMonthId) {
    pushFinding({
      severity: 'blocking',
      category: 'identity',
      perspective: activePerspective,
      path: '_id',
      message: `Document _id "${activeMonthDoc._id}" does not match deterministic ID "${expectedMonthId}".`,
      editorTarget: monthEditorTarget,
    })
  }
  if (activeMonthDoc.yearMonth !== snapshot.yearMonth) {
    pushFinding({
      severity: 'blocking',
      category: 'identity',
      perspective: activePerspective,
      path: 'yearMonth',
      message: `Document yearMonth "${String(activeMonthDoc.yearMonth ?? '')}" does not match "${snapshot.yearMonth}".`,
      editorTarget: monthEditorTarget,
    })
  }
  if (activeMonthDoc.year !== parsedYM.year) {
    pushFinding({
      severity: 'blocking',
      category: 'identity',
      perspective: activePerspective,
      path: 'year',
      message: `Document year (${String(activeMonthDoc.year)}) does not match ${parsedYM.year}.`,
      editorTarget: monthEditorTarget,
    })
  }
  if (activeMonthDoc.month !== parsedYM.month) {
    pushFinding({
      severity: 'blocking',
      category: 'identity',
      perspective: activePerspective,
      path: 'month',
      message: `Document month (${String(activeMonthDoc.month)}) does not match ${parsedYM.month}.`,
      editorTarget: monthEditorTarget,
    })
  }
  if (!isNonEmptyString(activeMonthDoc.title)) {
    pushFinding({
      severity: 'blocking',
      category: 'identity',
      perspective: activePerspective,
      path: 'title',
      message: 'Monthly theme title is required.',
      editorTarget: monthEditorTarget,
    })
  }
  if (activeMonthDoc.hasCoverImage && !activeMonthDoc.hasCoverImageAlt) {
    pushFinding({
      severity: 'blocking',
      category: 'identity',
      perspective: activePerspective,
      path: 'coverImage.alt',
      message: 'Cover image is present without required alternative text.',
      editorTarget: monthEditorTarget,
    })
  }
  if (activeMonthDoc.withdrawn === true) {
    pushFinding({
      severity: 'blocking',
      category: 'identity',
      perspective: activePerspective,
      path: 'withdrawn',
      message: 'Whole-month emergency withdrawal is active (withdrawn = true). Reader delivery is suppressed.',
      editorTarget: monthEditorTarget,
    })
  }

  if (monthPresence === 'draftOnly') {
    pushFinding({
      severity: activeMonthDoc.editorialStatus === 'scheduled' ? 'blocking' : 'needsReview',
      category: 'identity',
      perspective: 'draft',
      message:
        activeMonthDoc.editorialStatus === 'scheduled'
          ? `Month status is "scheduled" in draft, but "${expectedMonthId}" has not been published to Sanity's published perspective for the Release Gateway.`
          : `Monthly publication "${expectedMonthId}" exists only as a Sanity draft (not yet published).`,
      editorTarget: monthEditorTarget,
    })
  } else if (monthPresence === 'publishedWithDraftEdits') {
    pushFinding({
      severity: 'needsReview',
      category: 'identity',
      perspective: 'both',
      message: `Unpublished draft edits exist on "${expectedMonthId}". Inspect and publish the updated draft so Sanity's published perspective matches.`,
      editorTarget: monthEditorTarget,
    })
  }

  // 2. Editorial status & review attribution
  const editorialStatus = activeMonthDoc.editorialStatus
  if (typeof editorialStatus !== 'string' || !VALID_EDITORIAL_STATUSES.has(editorialStatus)) {
    pushFinding({
      severity: 'blocking',
      category: 'review',
      perspective: activePerspective,
      path: 'editorialStatus',
      message: `Invalid or unset editorialStatus "${String(editorialStatus ?? 'unset')}".`,
      editorTarget: monthEditorTarget,
    })
  } else if (editorialStatus === 'draft' || editorialStatus === 'inReview') {
    pushFinding({
      severity: 'needsReview',
      category: 'review',
      perspective: activePerspective,
      path: 'editorialStatus',
      message: `Month editorialStatus is "${editorialStatus}". Move to "approved" and "scheduled" after editorial review and finalization.`,
      editorTarget: monthEditorTarget,
    })
  } else {
    pushFinding({
      severity: 'informational',
      category: 'review',
      perspective: activePerspective,
      path: 'editorialStatus',
      message:
        editorialStatus === 'scheduled'
          ? 'Month editorialStatus is "scheduled". Cloudflare Gateway still enforces advance preview and month-start dates.'
          : 'Month editorialStatus is "approved" (ready to set "scheduled" when publishing).',
    })
  }

  const review = activeMonthDoc.editorialReview
  if (!isNonEmptyString(review?.reviewedBy)) {
    pushFinding({
      severity: 'blocking',
      category: 'review',
      perspective: activePerspective,
      path: 'editorialReview.reviewedBy',
      message: 'Monthly editorialReview.reviewedBy must be recorded before approving or scheduling.',
      editorTarget: monthEditorTarget,
    })
  }
  if (
    typeof review?.reviewerRole !== 'string' ||
    !(ALLOWED_REVIEWER_ROLES as readonly string[]).includes(review.reviewerRole)
  ) {
    pushFinding({
      severity: 'blocking',
      category: 'review',
      perspective: activePerspective,
      path: 'editorialReview.reviewerRole',
      message: 'Select a valid editorialReview.reviewerRole ("theological_editorial" or "technical_synthetic").',
      editorTarget: monthEditorTarget,
    })
  } else if (review.reviewerRole === 'technical_synthetic') {
    pushFinding({
      severity: 'informational',
      category: 'review',
      perspective: activePerspective,
      path: 'editorialReview.reviewerRole',
      message: 'Review attribution is "technical_synthetic" (technical/synthetic QA only — not Alexis’s theological approval).',
    })
  } else {
    pushFinding({
      severity: 'informational',
      category: 'review',
      perspective: activePerspective,
      path: 'editorialReview.reviewerRole',
      message: 'Review attribution is "theological_editorial".',
    })
  }
  if (!isValidIsoTimestamp(review?.reviewedAt)) {
    pushFinding({
      severity: 'blocking',
      category: 'review',
      perspective: activePerspective,
      path: 'editorialReview.reviewedAt',
      message: 'Record a valid editorialReview.reviewedAt timestamp before approving or scheduling.',
      editorTarget: monthEditorTarget,
    })
  }

  // 3. Introduction & Welcome screens
  const previewScreenCount = activeMonthDoc.introduction?.previewScreenCount ?? 0
  const previewScreensMissingBlocksCount =
    activeMonthDoc.introduction?.previewScreensMissingBlocksCount ?? 0
  const hasWelcomeScreen = activeMonthDoc.introduction?.hasWelcomeScreen === true
  const welcomeBlockCount = activeMonthDoc.introduction?.welcomeBlockCount ?? 0

  if (previewScreenCount === 0) {
    pushFinding({
      severity: 'blocking',
      category: 'introduction',
      perspective: activePerspective,
      path: 'introduction.previewScreens',
      message: 'At least one introduction preview screen is required before approving, finalizing, or scheduling.',
      editorTarget: monthEditorTarget,
    })
  } else if (previewScreensMissingBlocksCount > 0) {
    pushFinding({
      severity: 'blocking',
      category: 'introduction',
      perspective: activePerspective,
      path: 'introduction.previewScreens',
      message: `${previewScreensMissingBlocksCount} introduction preview screen(s) have zero content blocks.`,
      editorTarget: monthEditorTarget,
    })
  }

  if (!hasWelcomeScreen || welcomeBlockCount === 0) {
    pushFinding({
      severity: 'blocking',
      category: 'introduction',
      perspective: activePerspective,
      path: 'introduction.welcomeScreen',
      message: 'A complete month-start Welcome screen (with at least one block) is required before approving, finalizing, or scheduling.',
      editorTarget: monthEditorTarget,
    })
  }

  pushFinding({
    severity: 'informational',
    category: 'introduction',
    perspective: activePerspective,
    message: `Advance preview opens ${advancePreviewStartDate}; month Welcome & calendar start ${monthStartDate}. No public preview is generated by this inspector.`,
  })

  // 4. Calendar slots & cross-month collision index
  const publishedCollisionMap = new Map<string, string[]>()
  for (const other of snapshot.otherPublishedMonths) {
    if (!other || (typeof other._id === 'string' && other._id.startsWith('drafts.'))) continue
    const label = other.yearMonth || other._id
    for (const rawRef of other.challengeRefs ?? []) {
      if (typeof rawRef !== 'string' || !rawRef.trim()) continue
      const baseRef = stripDraftPrefix(rawRef.trim())
      const existing = publishedCollisionMap.get(baseRef) ?? []
      if (!existing.includes(label)) existing.push(label)
      publishedCollisionMap.set(baseRef, existing)
    }
  }

  const draftCollisionMap = new Map<string, string[]>()
  for (const other of snapshot.otherDraftMonths) {
    if (!other) continue
    const label = other.yearMonth || stripDraftPrefix(other._id)
    for (const rawRef of other.challengeRefs ?? []) {
      if (typeof rawRef !== 'string' || !rawRef.trim()) continue
      const baseRef = stripDraftPrefix(rawRef.trim())
      const existing = draftCollisionMap.get(baseRef) ?? []
      if (!existing.includes(label)) existing.push(label)
      draftCollisionMap.set(baseRef, existing)
    }
  }

  const slots = Array.isArray(activeMonthDoc.slots) ? activeMonthDoc.slots : []
  const rosterVersion = activeMonthDoc.rosterFinalization?.rosterVersion
  const isAmendedRoster = typeof rosterVersion === 'number' && Number.isInteger(rosterVersion) && rosterVersion >= 2

  if (slots.length !== expectedDays) {
    pushFinding({
      severity: 'blocking',
      category: 'calendar',
      perspective: activePerspective,
      path: 'slots',
      message: `Month ${snapshot.yearMonth} requires exactly ${expectedDays} ordered calendar slots; found ${slots.length}.`,
      editorTarget: monthEditorTarget,
    })
  }

  const seenChallengeIndices = new Map<string, number>()
  const activeScheduledBaseIds = new Set<string>()
  const withdrawnSlotBaseIds = new Set<string>()
  let scheduledSlotsCount = 0
  let withdrawnSlotsCount = 0
  let unassignedSlotsCount = 0
  let duplicateIntraMonthRefs = 0
  let crossMonthPublishedCollisions = 0
  let crossMonthDraftCollisions = 0

  const slotSummaries: SlotReadinessSummary[] = []
  const challengeEvalCache = new Map<string, ReturnType<typeof evaluateChallengeMetadata>>()

  const getChallengeEval = (baseId: string) => {
    let cached = challengeEvalCache.get(baseId)
    if (!cached) {
      cached = evaluateChallengeMetadata(
        baseId,
        snapshot.publishedChallenges[baseId],
        snapshot.draftChallenges[baseId],
      )
      challengeEvalCache.set(baseId, cached)
    }
    return cached
  }

  const slotCheckLimit = Math.min(slots.length, expectedDays)
  for (let i = 0; i < slotCheckLimit; i++) {
    const slot = slots[i]
    const expectedDay = i + 1
    const expectedKey = `day-${String(expectedDay).padStart(2, '0')}`
    const expectedDate = formatCivilDate(parsedYM.year, parsedYM.month, expectedDay)
    const slotIssues: string[] = []

    if (slot._key !== expectedKey) {
      const msg = `Slot ${expectedDay} must use deterministic _key "${expectedKey}" (found "${String(slot._key ?? 'unset')}").`
      slotIssues.push(msg)
      pushFinding({
        severity: 'blocking',
        category: 'calendar',
        perspective: activePerspective,
        path: `slots.${i}._key`,
        message: msg,
        editorTarget: monthEditorTarget,
      })
    }
    if (slot.dayOfMonth !== expectedDay) {
      const msg = `Slot ${expectedDay} must have dayOfMonth ${expectedDay} (found ${String(slot.dayOfMonth)}).`
      slotIssues.push(msg)
      pushFinding({
        severity: 'blocking',
        category: 'calendar',
        perspective: activePerspective,
        path: `slots.${i}.dayOfMonth`,
        message: msg,
        editorTarget: monthEditorTarget,
      })
    }
    if (slot.date !== expectedDate) {
      const msg = `Slot ${expectedDay} must have civil date "${expectedDate}" (found "${String(slot.date ?? 'unset')}").`
      slotIssues.push(msg)
      pushFinding({
        severity: 'blocking',
        category: 'calendar',
        perspective: activePerspective,
        path: `slots.${i}.date`,
        message: msg,
        editorTarget: monthEditorTarget,
      })
    }

    const slotStatus = typeof slot.slotStatus === 'string' ? slot.slotStatus : 'unset'
    if (slotStatus !== 'scheduled' && slotStatus !== 'withdrawn') {
      const msg = `Slot ${expectedDay} (${expectedDate}) must set slotStatus to "scheduled" or "withdrawn".`
      slotIssues.push(msg)
      pushFinding({
        severity: 'blocking',
        category: 'calendar',
        perspective: activePerspective,
        path: `slots.${i}.slotStatus`,
        message: msg,
        editorTarget: monthEditorTarget,
      })
    }

    const rawRef = typeof slot.challengeRef === 'string' ? slot.challengeRef.trim() : ''
    const baseRef = rawRef ? stripDraftPrefix(rawRef) : undefined

    if (baseRef) {
      const firstIndex = seenChallengeIndices.get(baseRef)
      if (firstIndex !== undefined) {
        duplicateIntraMonthRefs += 1
        const msg = `Challenge "${baseRef}" is assigned more than once in ${snapshot.yearMonth} (days ${firstIndex + 1} and ${expectedDay}).`
        slotIssues.push(msg)
        pushFinding({
          severity: 'blocking',
          category: 'calendar',
          perspective: activePerspective,
          path: `slots.${i}.challenge`,
          message: msg,
          editorTarget: monthEditorTarget,
        })
      } else {
        seenChallengeIndices.set(baseRef, i)
      }

      const pubCollisions = publishedCollisionMap.get(baseRef)
      if (pubCollisions && pubCollisions.length > 0) {
        crossMonthPublishedCollisions += 1
        const msg = `Challenge "${baseRef}" on Day ${expectedDay} is already assigned to published monthly publication(s): ${pubCollisions.join(', ')}.`
        slotIssues.push(msg)
        pushFinding({
          severity: 'blocking',
          category: 'calendar',
          perspective: 'published',
          path: `slots.${i}.challenge`,
          message: msg,
          editorTarget: monthEditorTarget,
        })
      }

      const draftCollisions = draftCollisionMap.get(baseRef)
      if (draftCollisions && draftCollisions.length > 0) {
        crossMonthDraftCollisions += 1
        const msg = `Challenge "${baseRef}" on Day ${expectedDay} is also referenced in draft monthly publication(s): ${draftCollisions.join(', ')}.`
        slotIssues.push(msg)
        pushFinding({
          severity: 'needsReview',
          category: 'calendar',
          perspective: 'draft',
          path: `slots.${i}.challenge`,
          message: msg,
          editorTarget: monthEditorTarget,
        })
      }
    }

    if (slotStatus === 'withdrawn') {
      withdrawnSlotsCount += 1
      if (baseRef) withdrawnSlotBaseIds.add(baseRef)
      if (!isAmendedRoster) {
        const msg = `Slot ${expectedDay} (${expectedDate}) is withdrawn, which is prohibited on initial rosterVersion 1 (only permitted on amended rosterVersion >= 2).`
        slotIssues.push(msg)
        pushFinding({
          severity: 'blocking',
          category: 'calendar',
          perspective: activePerspective,
          path: `slots.${i}.slotStatus`,
          message: msg,
          editorTarget: monthEditorTarget,
        })
      }
      if (!slot.hasWithdrawalReason) {
        const msg = `Withdrawn slot ${expectedDay} (${expectedDate}) requires an explicit withdrawalReason.`
        slotIssues.push(msg)
        pushFinding({
          severity: 'blocking',
          category: 'calendar',
          perspective: activePerspective,
          path: `slots.${i}.withdrawalReason`,
          message: msg,
          editorTarget: monthEditorTarget,
        })
      }

      slotSummaries.push({
        dayOfMonth: expectedDay,
        expectedDate,
        actualDate: slot.date,
        slotKey: slot._key,
        slotStatus,
        challengeBaseId: baseRef,
        challengeTitle: baseRef ? getChallengeEval(baseRef).title : undefined,
        presence: baseRef ? getChallengeEval(baseRef).presence : 'unassigned',
        publishedReady: false,
        issues: slotIssues,
        editorTarget: baseRef ? makeChallengeEditorTarget(baseRef) : monthEditorTarget,
      })
    } else {
      if (slotStatus === 'scheduled') scheduledSlotsCount += 1
      if (!rawRef || !baseRef) {
        unassignedSlotsCount += 1
        const msg = `Slot ${expectedDay} (${expectedDate}) has no assigned Challenge.`
        slotIssues.push(msg)
        pushFinding({
          severity: 'blocking',
          category: 'calendar',
          perspective: activePerspective,
          path: `slots.${i}.challenge`,
          message: msg,
          editorTarget: monthEditorTarget,
        })
        slotSummaries.push({
          dayOfMonth: expectedDay,
          expectedDate,
          actualDate: slot.date,
          slotKey: slot._key,
          slotStatus,
          presence: 'unassigned',
          publishedReady: false,
          issues: slotIssues,
          editorTarget: monthEditorTarget,
        })
      } else {
        activeScheduledBaseIds.add(baseRef)
        if (rawRef.startsWith('drafts.')) {
          const msg = `Slot ${expectedDay} (${expectedDate}) references draft ID "${rawRef}". Reference the published base ID "${baseRef}" instead.`
          slotIssues.push(msg)
          pushFinding({
            severity: 'blocking',
            category: 'calendar',
            perspective: activePerspective,
            path: `slots.${i}.challenge`,
            message: msg,
            editorTarget: monthEditorTarget,
          })
        }

        const evalResult = getChallengeEval(baseRef)
        slotIssues.push(...evalResult.blockingIssues, ...evalResult.reviewIssues)
        slotSummaries.push({
          dayOfMonth: expectedDay,
          expectedDate,
          actualDate: slot.date,
          slotKey: slot._key,
          slotStatus,
          challengeBaseId: baseRef,
          challengeTitle: evalResult.title,
          presence: evalResult.presence,
          publishedReady: evalResult.publishedReady,
          issues: slotIssues,
          editorTarget: makeChallengeEditorTarget(baseRef),
        })
      }
    }
  }

  // Emit per-distinct-Challenge findings once per Challenge
  let publishedAndReadyCount = 0
  let draftOnlyCount = 0
  let missingCount = 0
  let unreviewedOrUnapprovedCount = 0
  let withdrawnCount = 0
  let scriptureRightsIssuesCount = 0
  let draftPendingEditsCount = 0

  for (const baseId of activeScheduledBaseIds) {
    const evalResult = getChallengeEval(baseId)
    const target = makeChallengeEditorTarget(baseId)
    if (evalResult.publishedReady) publishedAndReadyCount += 1
    if (evalResult.presence === 'draftOnly') draftOnlyCount += 1
    if (evalResult.presence === 'missing') missingCount += 1
    if (evalResult.presence === 'publishedWithDraftEdits') draftPendingEditsCount += 1
    if (evalResult.isUnreviewedOrUnapproved) unreviewedOrUnapprovedCount += 1
    if (evalResult.isWithdrawn) withdrawnCount += 1
    if (evalResult.hasScriptureRightsIssue) scriptureRightsIssuesCount += 1

    for (const msg of evalResult.blockingIssues) {
      pushFinding({
        severity: 'blocking',
        category: 'challenge',
        perspective: evalResult.presence === 'draftOnly' || evalResult.presence === 'missing' ? 'published' : 'published',
        message: msg,
        editorTarget: target,
      })
    }
    for (const msg of evalResult.reviewIssues) {
      pushFinding({
        severity: 'needsReview',
        category: 'challenge',
        perspective: 'draft',
        message: msg,
        editorTarget: target,
      })
    }
  }

  if (withdrawnSlotsCount > 0 && isAmendedRoster) {
    pushFinding({
      severity: 'informational',
      category: 'calendar',
      perspective: activePerspective,
      message: `${withdrawnSlotsCount} calendar slot(s) marked withdrawn under rosterVersion ${rosterVersion}; ${scheduledSlotsCount} active scheduled slot(s) remain.`,
    })
  }

  // 5. Roster finalization & amendment history
  const rf = activeMonthDoc.rosterFinalization
  const isFinalized = rf?.isFinalized === true
  const rawFinalizedIds = Array.isArray(rf?.finalizedChallengeIds) ? rf.finalizedChallengeIds : []
  const finalizedIdSet = new Set<string>()
  let hasInvalidFinalizedId = false

  for (const item of rawFinalizedIds) {
    if (typeof item !== 'string' || !item.trim() || item.startsWith('drafts.')) {
      hasInvalidFinalizedId = true
      break
    }
    if (finalizedIdSet.has(item)) {
      hasInvalidFinalizedId = true
      break
    }
    finalizedIdSet.add(item)
  }

  const matchesActiveScheduledSlots =
    !hasInvalidFinalizedId &&
    finalizedIdSet.size === activeScheduledBaseIds.size &&
    [...activeScheduledBaseIds].every(id => finalizedIdSet.has(id))

  const priorRosters = Array.isArray(rf?.priorRosters) ? rf.priorRosters : []

  if (!isFinalized) {
    pushFinding({
      severity: 'blocking',
      category: 'finalization',
      perspective: activePerspective,
      path: 'rosterFinalization.isFinalized',
      message: 'Monthly Challenge roster is not finalized (rosterFinalization.isFinalized = false).',
      editorTarget: monthEditorTarget,
    })
  }

  if (typeof rosterVersion !== 'number' || !Number.isInteger(rosterVersion) || rosterVersion < 1) {
    pushFinding({
      severity: 'blocking',
      category: 'finalization',
      perspective: activePerspective,
      path: 'rosterFinalization.rosterVersion',
      message: 'rosterFinalization.rosterVersion must be an integer >= 1.',
      editorTarget: monthEditorTarget,
    })
  } else if (rosterVersion >= 2) {
    if (activeScheduledBaseIds.size === 0) {
      pushFinding({
        severity: 'blocking',
        category: 'finalization',
        perspective: activePerspective,
        path: 'slots',
        message: 'At least one active scheduled slot must remain during a roster amendment.',
        editorTarget: monthEditorTarget,
      })
    }
    if (priorRosters.length < rosterVersion - 1) {
      pushFinding({
        severity: 'blocking',
        category: 'finalization',
        perspective: activePerspective,
        path: 'rosterFinalization.priorRosters',
        message: `Amended roster v${rosterVersion} requires at least ${rosterVersion - 1} prior roster snapshot(s) in priorRosters.`,
        editorTarget: monthEditorTarget,
      })
    } else {
      for (let p = 0; p < priorRosters.length; p++) {
        const prior = priorRosters[p]
        if (
          typeof prior?.rosterVersion !== 'number' ||
          !Number.isInteger(prior.rosterVersion) ||
          prior.rosterVersion < 1 ||
          prior.rosterVersion >= rosterVersion
        ) {
          pushFinding({
            severity: 'blocking',
            category: 'finalization',
            perspective: activePerspective,
            path: `rosterFinalization.priorRosters.${p}.rosterVersion`,
            message: `Prior roster entry ${p + 1} must record an integer rosterVersion < ${rosterVersion}.`,
            editorTarget: monthEditorTarget,
          })
        }
        if (!isValidIsoTimestamp(prior?.supersededAt)) {
          pushFinding({
            severity: 'blocking',
            category: 'finalization',
            perspective: activePerspective,
            path: `rosterFinalization.priorRosters.${p}.supersededAt`,
            message: `Prior roster entry ${p + 1} must include a valid supersededAt timestamp.`,
            editorTarget: monthEditorTarget,
          })
        }
        if (!prior?.hasReason) {
          pushFinding({
            severity: 'blocking',
            category: 'finalization',
            perspective: activePerspective,
            path: `rosterFinalization.priorRosters.${p}.reason`,
            message: `Prior roster entry ${p + 1} must include a non-empty amendment reason.`,
            editorTarget: monthEditorTarget,
          })
        }
      }
      pushFinding({
        severity: 'informational',
        category: 'finalization',
        perspective: activePerspective,
        message: `Roster amended to v${rosterVersion} with ${priorRosters.length} recorded prior roster snapshot(s).`,
      })
    }
  }

  if (!isValidIsoTimestamp(rf?.finalizedAt)) {
    pushFinding({
      severity: 'blocking',
      category: 'finalization',
      perspective: activePerspective,
      path: 'rosterFinalization.finalizedAt',
      message: 'Record a valid rosterFinalization.finalizedAt timestamp.',
      editorTarget: monthEditorTarget,
    })
  }
  if (!isNonEmptyString(rf?.finalizedBy)) {
    pushFinding({
      severity: 'blocking',
      category: 'finalization',
      perspective: activePerspective,
      path: 'rosterFinalization.finalizedBy',
      message: 'Record rosterFinalization.finalizedBy when finalizing the monthly roster.',
      editorTarget: monthEditorTarget,
    })
  }
  if (!matchesActiveScheduledSlots) {
    pushFinding({
      severity: 'blocking',
      category: 'finalization',
      perspective: activePerspective,
      path: 'rosterFinalization.finalizedChallengeIds',
      message: `finalizedChallengeIds (${rawFinalizedIds.length}) must exactly match the ${activeScheduledBaseIds.size} active scheduled slot Challenge ID(s) with no drafts or duplicates.`,
      editorTarget: monthEditorTarget,
    })
  }

  // 6. Discoveries & Scripture Cards
  const discoveries = Array.isArray(activeMonthDoc.discoveries) ? activeMonthDoc.discoveries : []
  const seenDiscoverySlugs = new Set<string>()
  const seenCardRefs = new Map<string, string>()
  const discoverySummaries: DiscoveryReadinessSummary[] = []
  const checkedCardBaseIds = new Set<string>()
  let subsetViolationsCount = 0
  let publishedApprovedCardCount = 0
  let legacyReservedCardCount = 0
  let unlinkedDiscoveryOrFullMonthCount = 0

  const inspectCardLink = (
    rawCardRef: unknown,
    legacyReservedId: unknown,
    expectedCategory: 'monthlyThematic' | 'monthlyFull',
    path: string,
    label: string,
    issuesOut: string[],
  ): {
    kind: 'scriptureCard' | 'legacyReservedId' | 'unlinked'
    baseId?: string
    presence?: DocumentPresenceState
    ready: boolean
  } => {
    const rawRef = typeof rawCardRef === 'string' ? rawCardRef.trim() : ''
    const legacyId = typeof legacyReservedId === 'string' ? legacyReservedId.trim() : ''

    if (!rawRef) {
      if (legacyId) {
        legacyReservedCardCount += 1
        if (!CARD_PLACEHOLDER_PATTERN.test(legacyId)) {
          const msg = `${label} has invalid legacy reservedCardId "${legacyId}" (expected card-<slug>).`
          issuesOut.push(msg)
          pushFinding({
            severity: 'blocking',
            category: 'cards',
            perspective: activePerspective,
            path,
            message: msg,
            editorTarget: monthEditorTarget,
          })
          return {kind: 'legacyReservedId', baseId: legacyId, ready: false}
        }
        pushFinding({
          severity: 'informational',
          category: 'cards',
          perspective: activePerspective,
          path,
          message: `${label} uses legacy reservedCardId placeholder "${legacyId}" without a linked scriptureCard document.`,
        })
        return {kind: 'legacyReservedId', baseId: legacyId, ready: true}
      }

      unlinkedDiscoveryOrFullMonthCount += 1
      pushFinding({
        severity: 'needsReview',
        category: 'cards',
        perspective: activePerspective,
        path,
        message: `${label} has no linked scriptureCard document yet (required when Phase 04 card awards are enabled).`,
        editorTarget: monthEditorTarget,
      })
      return {kind: 'unlinked', ready: false}
    }

    const baseId = stripDraftPrefix(rawRef)
    const cardTarget = makeCardEditorTarget(baseId)
    let hasRefError = false

    if (rawRef.startsWith('drafts.')) {
      hasRefError = true
      const msg = `${label} references draft Scripture Card ID "${rawRef}". Reference the published base ID "${baseId}".`
      issuesOut.push(msg)
      pushFinding({
        severity: 'blocking',
        category: 'cards',
        perspective: activePerspective,
        path,
        message: msg,
        editorTarget: monthEditorTarget,
      })
    }

    if (!CARD_PLACEHOLDER_PATTERN.test(baseId)) {
      hasRefError = true
      const msg = `${label} Scripture Card reference "${rawRef}" must follow deterministic pattern card-<slug>.`
      issuesOut.push(msg)
      pushFinding({
        severity: 'blocking',
        category: 'cards',
        perspective: activePerspective,
        path,
        message: msg,
        editorTarget: monthEditorTarget,
      })
      return {kind: 'scriptureCard', baseId, ready: false}
    }

    const priorLabel = seenCardRefs.get(baseId)
    if (priorLabel !== undefined) {
      hasRefError = true
      const msg = `Duplicate Scripture Card "${baseId}" in ${label} (already linked in ${priorLabel}).`
      issuesOut.push(msg)
      pushFinding({
        severity: 'blocking',
        category: 'cards',
        perspective: activePerspective,
        path,
        message: msg,
        editorTarget: monthEditorTarget,
      })
    } else {
      seenCardRefs.set(baseId, label)
    }

    if (legacyId && legacyId !== baseId) {
      hasRefError = true
      const msg = `${label} linked Card "${baseId}" conflicts with legacy reservedCardId "${legacyId}".`
      issuesOut.push(msg)
      pushFinding({
        severity: 'blocking',
        category: 'cards',
        perspective: activePerspective,
        path,
        message: msg,
        editorTarget: monthEditorTarget,
      })
    }

    const cardEval = evaluateLinkedCardMetadata(
      baseId,
      expectedCategory,
      snapshot.yearMonth,
      snapshot.publishedCards[baseId],
      snapshot.draftCards[baseId],
    )
    if (!checkedCardBaseIds.has(baseId)) {
      checkedCardBaseIds.add(baseId)
      if (cardEval.ready) publishedApprovedCardCount += 1
      for (const msg of cardEval.blockingIssues) {
        pushFinding({
          severity: 'blocking',
          category: 'cards',
          perspective: cardEval.presence === 'draftOnly' || cardEval.presence === 'missing' ? 'published' : 'published',
          path,
          message: msg,
          editorTarget: cardTarget,
        })
      }
      for (const msg of cardEval.reviewIssues) {
        pushFinding({
          severity: 'needsReview',
          category: 'cards',
          perspective: 'draft',
          path,
          message: msg,
          editorTarget: cardTarget,
        })
      }
    }
    issuesOut.push(...cardEval.blockingIssues, ...cardEval.reviewIssues)

    return {
      kind: 'scriptureCard',
      baseId,
      presence: cardEval.presence,
      ready: !hasRefError && cardEval.ready,
    }
  }

  if (discoveries.length === 0) {
    pushFinding({
      severity: 'informational',
      category: 'discoveries',
      perspective: activePerspective,
      path: 'discoveries',
      message: 'No thematic discoveries configured yet (optional in Phase 02/03; add before Phase 04 card release).',
    })
  }

  for (let d = 0; d < discoveries.length; d++) {
    const disc = discoveries[d]
    const discIssues: string[] = []
    const slug = typeof disc.discoverySlug === 'string' ? disc.discoverySlug.trim() : ''
    const discLabel = slug ? `discovery "${slug}"` : `discovery #${d + 1}`

    if (!slug) {
      const msg = `Discovery #${d + 1} is missing a discoverySlug.`
      discIssues.push(msg)
      pushFinding({
        severity: 'blocking',
        category: 'discoveries',
        perspective: activePerspective,
        path: `discoveries.${d}.discoverySlug`,
        message: msg,
        editorTarget: monthEditorTarget,
      })
    } else if (seenDiscoverySlugs.has(slug)) {
      const msg = `Duplicate discoverySlug "${slug}" within this month.`
      discIssues.push(msg)
      pushFinding({
        severity: 'blocking',
        category: 'discoveries',
        perspective: activePerspective,
        path: `discoveries.${d}.discoverySlug`,
        message: msg,
        editorTarget: monthEditorTarget,
      })
    } else {
      seenDiscoverySlugs.add(slug)
    }

    if (!isNonEmptyString(disc.title)) {
      const msg = `${discLabel} is missing a reader-visible goal title.`
      discIssues.push(msg)
      pushFinding({
        severity: 'blocking',
        category: 'discoveries',
        perspective: activePerspective,
        path: `discoveries.${d}.title`,
        message: msg,
        editorTarget: monthEditorTarget,
      })
    }

    const qRefs = Array.isArray(disc.qualifyingChallengeRefs)
      ? disc.qualifyingChallengeRefs.filter((r): r is string => typeof r === 'string' && r.trim().length > 0)
      : []

    let subsetValid = true
    if (qRefs.length === 0) {
      subsetValid = false
      subsetViolationsCount += 1
      const msg = `${discLabel} must reference at least one qualifying Challenge.`
      discIssues.push(msg)
      pushFinding({
        severity: 'blocking',
        category: 'discoveries',
        perspective: activePerspective,
        path: `discoveries.${d}.qualifyingChallenges`,
        message: msg,
        editorTarget: monthEditorTarget,
      })
    } else {
      for (const rawQRef of qRefs) {
        const trimmed = rawQRef.trim()
        const baseQRef = stripDraftPrefix(trimmed)
        if (trimmed.startsWith('drafts.')) {
          subsetValid = false
          subsetViolationsCount += 1
          const msg = `${discLabel} cannot reference draft Challenge ID "${trimmed}".`
          discIssues.push(msg)
          pushFinding({
            severity: 'blocking',
            category: 'discoveries',
            perspective: activePerspective,
            path: `discoveries.${d}.qualifyingChallenges`,
            message: msg,
            editorTarget: monthEditorTarget,
          })
        } else if (withdrawnSlotBaseIds.has(baseQRef)) {
          subsetValid = false
          subsetViolationsCount += 1
          const msg = `V-DISC-SUBSET violation: ${discLabel} references withdrawn slot Challenge "${baseQRef}".`
          discIssues.push(msg)
          pushFinding({
            severity: 'blocking',
            category: 'discoveries',
            perspective: activePerspective,
            path: `discoveries.${d}.qualifyingChallenges`,
            message: msg,
            editorTarget: monthEditorTarget,
          })
        } else if (!activeScheduledBaseIds.has(baseQRef) || (isFinalized && !finalizedIdSet.has(baseQRef))) {
          subsetValid = false
          subsetViolationsCount += 1
          const msg = `V-DISC-SUBSET violation: ${discLabel} references Challenge "${baseQRef}" outside the active finalized month roster.`
          discIssues.push(msg)
          pushFinding({
            severity: 'blocking',
            category: 'discoveries',
            perspective: activePerspective,
            path: `discoveries.${d}.qualifyingChallenges`,
            message: msg,
            editorTarget: monthEditorTarget,
          })
        }
      }
    }

    const cardOutcome = inspectCardLink(
      disc.cardRef,
      disc.reservedCardId,
      'monthlyThematic',
      `discoveries.${d}.card`,
      discLabel,
      discIssues,
    )

    discoverySummaries.push({
      key: disc._key || slug || `discovery-${d + 1}`,
      discoverySlug: slug || undefined,
      title: disc.title,
      qualifyingCount: qRefs.length,
      subsetValid,
      cardLinkKind: cardOutcome.kind,
      cardBaseId: cardOutcome.baseId,
      cardPresence: cardOutcome.presence,
      cardReady: cardOutcome.ready,
      issues: discIssues,
      editorTarget:
        cardOutcome.kind === 'scriptureCard' && cardOutcome.baseId
          ? makeCardEditorTarget(cardOutcome.baseId)
          : monthEditorTarget,
    })
  }

  const fullMonthIssues: string[] = []
  const fullMonthOutcome = inspectCardLink(
    activeMonthDoc.fullMonthCard?.cardRef,
    activeMonthDoc.fullMonthCard?.reservedCardId,
    'monthlyFull',
    'fullMonthCard.card',
    'fullMonthCard',
    fullMonthIssues,
  )
  const fullMonthCardStatus: MonthlyReadinessReport['discoveryAndCardSummary']['fullMonthCardStatus'] =
    fullMonthOutcome.kind === 'unlinked'
      ? 'unlinked'
      : fullMonthOutcome.kind === 'legacyReservedId'
        ? 'legacyReservedId'
        : fullMonthOutcome.ready
          ? 'linkedAndReady'
          : 'linkedWithIssues'

  // 7. Optional Advance Preview News readiness
  const previewNewsPresence = computePresence(
    snapshot.publishedPreviewNews,
    snapshot.draftPreviewNews,
  )
  const activeNewsDoc: PreviewNewsMetadata | null =
    snapshot.draftPreviewNews ?? snapshot.publishedPreviewNews
  const rawPreviewNewsRef =
    typeof activeMonthDoc.previewNewsRef === 'string' ? activeMonthDoc.previewNewsRef.trim() : ''
  const linkedFromMonth = Boolean(rawPreviewNewsRef)

  if (rawPreviewNewsRef) {
    const baseNewsRef = stripDraftPrefix(rawPreviewNewsRef)
    if (rawPreviewNewsRef.startsWith('drafts.')) {
      pushFinding({
        severity: 'blocking',
        category: 'previewNews',
        perspective: activePerspective,
        path: 'previewNews',
        message: `monthlyPublication.previewNews references draft ID "${rawPreviewNewsRef}". Use published base ID "${baseNewsRef}".`,
        editorTarget: monthEditorTarget,
      })
    }
    if (baseNewsRef !== expectedPreviewNewsId) {
      pushFinding({
        severity: 'blocking',
        category: 'previewNews',
        perspective: activePerspective,
        path: 'previewNews',
        message: `monthlyPublication.previewNews references "${baseNewsRef}" instead of deterministic "${expectedPreviewNewsId}".`,
        editorTarget: monthEditorTarget,
      })
    }
  }

  if (!activeNewsDoc) {
    pushFinding({
      severity: rawPreviewNewsRef ? 'blocking' : 'needsReview',
      category: 'previewNews',
      perspective: 'both',
      message: rawPreviewNewsRef
        ? `Linked preview News "${expectedPreviewNewsId}" was not found in Sanity.`
        : `Optional advance-preview News "${expectedPreviewNewsId}" has not been created yet (earliest publishOnDate: ${advancePreviewStartDate}).`,
      editorTarget: previewNewsEditorTarget,
    })
  } else {
    const newsPerspective: 'published' | 'draft' = snapshot.draftPreviewNews ? 'draft' : 'published'
    if (previewNewsPresence === 'draftOnly') {
      pushFinding({
        severity: 'needsReview',
        category: 'previewNews',
        perspective: 'draft',
        message: `Advance-preview News "${expectedPreviewNewsId}" exists as a draft only (not yet published in Sanity).`,
        editorTarget: previewNewsEditorTarget,
      })
    } else if (previewNewsPresence === 'publishedWithDraftEdits') {
      pushFinding({
        severity: 'needsReview',
        category: 'previewNews',
        perspective: 'both',
        message: `Advance-preview News "${expectedPreviewNewsId}" has unpublished draft edits.`,
        editorTarget: previewNewsEditorTarget,
      })
    }

    if (!rawPreviewNewsRef) {
      pushFinding({
        severity: 'needsReview',
        category: 'previewNews',
        perspective: activePerspective,
        path: 'previewNews',
        message: `"${expectedPreviewNewsId}" exists in Sanity, but monthlyPublication.previewNews does not link to it yet.`,
        editorTarget: monthEditorTarget,
      })
    }

    if (activeNewsDoc.withdrawn === true) {
      pushFinding({
        severity: 'needsReview',
        category: 'previewNews',
        perspective: newsPerspective,
        message: `Advance-preview News "${expectedPreviewNewsId}" is marked withdrawn.`,
        editorTarget: previewNewsEditorTarget,
      })
    }
    if (activeNewsDoc.category !== 'monthlyPreview') {
      pushFinding({
        severity: 'blocking',
        category: 'previewNews',
        perspective: newsPerspective,
        message: `Preview News "${expectedPreviewNewsId}" must have category "monthlyPreview" (found "${String(activeNewsDoc.category ?? 'unset')}").`,
        editorTarget: previewNewsEditorTarget,
      })
    }
    const relatedMonthBase = activeNewsDoc.relatedMonthRef
      ? stripDraftPrefix(activeNewsDoc.relatedMonthRef)
      : ''
    if (relatedMonthBase !== expectedMonthId) {
      pushFinding({
        severity: 'blocking',
        category: 'previewNews',
        perspective: newsPerspective,
        message: `Preview News "${expectedPreviewNewsId}" relatedMonth must reference "${expectedMonthId}".`,
        editorTarget: previewNewsEditorTarget,
      })
    }
    if (!isNonEmptyString(activeNewsDoc.publishOnDate) || !isValidCivilDate(activeNewsDoc.publishOnDate)) {
      pushFinding({
        severity: 'blocking',
        category: 'previewNews',
        perspective: newsPerspective,
        message: `Preview News "${expectedPreviewNewsId}" is missing a valid civil publishOnDate (YYYY-MM-DD).`,
        editorTarget: previewNewsEditorTarget,
      })
    } else if (activeNewsDoc.publishOnDate < advancePreviewStartDate) {
      pushFinding({
        severity: 'blocking',
        category: 'previewNews',
        perspective: newsPerspective,
        message: `Preview News "${expectedPreviewNewsId}" publishOnDate "${activeNewsDoc.publishOnDate}" precedes allowed advance preview start "${advancePreviewStartDate}".`,
        editorTarget: previewNewsEditorTarget,
      })
    }
    if (activeNewsDoc.hasCoverImage && !activeNewsDoc.hasCoverImageAlt) {
      pushFinding({
        severity: 'blocking',
        category: 'previewNews',
        perspective: newsPerspective,
        message: `Preview News "${expectedPreviewNewsId}" coverImage is missing required alt text.`,
        editorTarget: previewNewsEditorTarget,
      })
    }
    if (!isNonEmptyString(activeNewsDoc.title) || !activeNewsDoc.hasSummary) {
      pushFinding({
        severity: 'blocking',
        category: 'previewNews',
        perspective: newsPerspective,
        message: `Preview News "${expectedPreviewNewsId}" is missing required title or summary.`,
        editorTarget: previewNewsEditorTarget,
      })
    }
    if (
      !isNonEmptyString(activeNewsDoc.reviewedBy) ||
      typeof activeNewsDoc.reviewerRole !== 'string' ||
      !(ALLOWED_REVIEWER_ROLES as readonly string[]).includes(activeNewsDoc.reviewerRole) ||
      !isValidIsoTimestamp(activeNewsDoc.reviewedAt)
    ) {
      pushFinding({
        severity: 'blocking',
        category: 'previewNews',
        perspective: newsPerspective,
        message: `Preview News "${expectedPreviewNewsId}" is missing complete editorialReview (reviewedBy, reviewerRole, reviewedAt).`,
        editorTarget: previewNewsEditorTarget,
      })
    }
  }

  const counts = {
    blocking: findings.filter(f => f.severity === 'blocking').length,
    needsReview: findings.filter(f => f.severity === 'needsReview').length,
    informational: findings.filter(f => f.severity === 'informational').length,
    unknown: findings.filter(f => f.severity === 'unknown').length,
  }

  const overallStatus: OverallReadinessStatus =
    counts.unknown > 0
      ? 'unknown'
      : counts.blocking > 0
        ? 'blocked'
        : counts.needsReview > 0
          ? 'needsReview'
          : 'checksPass'

  return {
    yearMonth: snapshot.yearMonth,
    expectedMonthDocumentId: expectedMonthId,
    expectedPreviewNewsDocumentId: expectedPreviewNewsId,
    dataset: snapshot.dataset,
    datasetAuthorized: true,
    evaluatedAtIso,
    overallStatus,
    authorityDisclaimer: AUTHORITY_DISCLAIMER,
    schemaValidationDisclaimer: SCHEMA_VALIDATION_DISCLAIMER,
    counts,
    monthSummary: {
      exists: true,
      presence: monthPresence,
      activeSourcePerspective: activePerspective,
      title: activeMonthDoc.title,
      editorialStatus: activeMonthDoc.editorialStatus,
      withdrawn: activeMonthDoc.withdrawn === true,
      reviewerRole: activeMonthDoc.editorialReview?.reviewerRole,
      reviewedBy: activeMonthDoc.editorialReview?.reviewedBy,
      reviewedAt: activeMonthDoc.editorialReview?.reviewedAt,
      editorTarget: monthEditorTarget,
    },
    calendarSummary: {
      expectedDays,
      presentSlots: slots.length,
      scheduledSlots: scheduledSlotsCount,
      withdrawnSlots: withdrawnSlotsCount,
      unassignedSlots: unassignedSlotsCount,
      duplicateIntraMonthRefs,
      crossMonthPublishedCollisions,
      crossMonthDraftCollisions,
    },
    challengeSummary: {
      distinctScheduledCount: activeScheduledBaseIds.size,
      publishedAndReadyCount,
      draftOnlyCount,
      missingCount,
      unreviewedOrUnapprovedCount,
      withdrawnCount,
      scriptureRightsIssuesCount,
      draftPendingEditsCount,
    },
    introductionSummary: {
      previewScreenCount,
      previewScreensMissingBlocksCount,
      hasWelcomeScreen,
      welcomeBlockCount,
      advancePreviewStartDate,
      monthStartDate,
    },
    discoveryAndCardSummary: {
      discoveryCount: discoveries.length,
      subsetViolationsCount,
      linkedCardCount: checkedCardBaseIds.size,
      publishedApprovedCardCount,
      legacyReservedCardCount,
      unlinkedDiscoveryOrFullMonthCount,
      fullMonthCardStatus,
    },
    finalizationSummary: {
      isFinalized,
      rosterVersion: typeof rosterVersion === 'number' ? rosterVersion : undefined,
      finalizedAt: rf?.finalizedAt,
      finalizedBy: rf?.finalizedBy,
      finalizedChallengeIdsCount: rawFinalizedIds.length,
      matchesActiveScheduledSlots,
      priorRostersCount: priorRosters.length,
    },
    previewNewsSummary: {
      presence: previewNewsPresence,
      linkedFromMonth,
      publishOnDate: activeNewsDoc?.publishOnDate,
      earliestAllowedDate: advancePreviewStartDate,
      withdrawn: activeNewsDoc?.withdrawn === true,
      editorTarget: previewNewsEditorTarget,
    },
    findings,
    slots: slotSummaries,
    discoveries: discoverySummaries,
  }
}
