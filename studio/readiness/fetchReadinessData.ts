import {stripDraftPrefix} from '../schemaTypes/monthlyHelpers'
import {evaluateMonthlyReadiness, isAuthorizedDataset, isValidTargetYearMonth} from './evaluateReadiness'
import type {
  ChallengeMetadata,
  MonthlyReadinessReport,
  MonthPublicationMetadata,
  OtherMonthMetadata,
  PreviewNewsMetadata,
  ReadinessDatasetSnapshot,
  ReadOnlySanityClient,
  ScriptureCardMetadata,
} from './types'

export const MONTH_PUBLICATION_METADATA_QUERY = `*[_type == "monthlyPublication" && (_id in [$baseId, $draftId] || yearMonth == $yearMonth)]{
  _id,
  _rev,
  _updatedAt,
  yearMonth,
  year,
  month,
  title,
  "hasSubtitle": defined(subtitle) && length(subtitle) > 0,
  "hasCoverImage": defined(coverImage.asset._ref),
  "hasCoverImageAlt": defined(coverImage.alt) && length(coverImage.alt) > 0,
  "defaultSeriesRef": defaultSeries._ref,
  "previewNewsRef": previewNews._ref,
  editorialStatus,
  withdrawn,
  "editorialReview": {
    "reviewedBy": editorialReview.reviewedBy,
    "reviewerRole": editorialReview.reviewerRole,
    "reviewedAt": editorialReview.reviewedAt,
    "hasReviewNotes": defined(editorialReview.reviewNotes) && length(editorialReview.reviewNotes) > 0
  },
  "introduction": {
    "previewScreenCount": count(introduction.previewScreens),
    "previewScreensMissingBlocksCount": count(introduction.previewScreens[!defined(blocks) || count(blocks) == 0]),
    "hasWelcomeScreen": defined(introduction.welcomeScreen),
    "welcomeBlockCount": count(introduction.welcomeScreen.blocks)
  },
  "slots": slots[]{
    _key,
    dayOfMonth,
    date,
    slotStatus,
    "challengeRef": challenge._ref,
    "hasWithdrawalReason": defined(withdrawalReason) && length(withdrawalReason) > 0
  },
  "rosterFinalization": {
    "isFinalized": rosterFinalization.isFinalized,
    "rosterVersion": rosterFinalization.rosterVersion,
    "finalizedAt": rosterFinalization.finalizedAt,
    "finalizedBy": rosterFinalization.finalizedBy,
    "finalizedChallengeIds": rosterFinalization.finalizedChallengeIds,
    "priorRosters": rosterFinalization.priorRosters[]{
      rosterVersion,
      supersededAt,
      "hasReason": defined(reason) && length(reason) > 0,
      "challengeCount": count(finalizedChallengeIds)
    }
  },
  "discoveries": discoveries[]{
    _key,
    discoverySlug,
    title,
    "qualifyingChallengeRefs": qualifyingChallenges[]._ref,
    "cardRef": card._ref,
    reservedCardId
  },
  "fullMonthCard": {
    "title": fullMonthCard.title,
    "cardRef": fullMonthCard.card._ref,
    "reservedCardId": fullMonthCard.reservedCardId
  }
}`

export const OTHER_PUBLISHED_MONTHS_QUERY = `*[_type == "monthlyPublication" && !(_id in [$baseId, $draftId]) && !(_id in path("drafts.**")) && defined(slots)]{
  _id,
  yearMonth,
  "challengeRefs": slots[defined(challenge._ref)].challenge._ref
}`

export const OTHER_DRAFT_MONTHS_QUERY = `*[_type == "monthlyPublication" && _id != $draftId && _id in path("drafts.**") && defined(slots)]{
  _id,
  yearMonth,
  "challengeRefs": slots[defined(challenge._ref)].challenge._ref
}`

export const CHALLENGES_METADATA_QUERY = `*[_type == "challenge" && _id in $ids]{
  _id,
  _rev,
  _updatedAt,
  title,
  "slug": slug.current,
  challengeType,
  withdrawn,
  "hasPrimaryScripture": defined(primaryScripture),
  "scriptureReference": primaryScripture.reference,
  "scriptureTranslation": primaryScripture.translation,
  "scriptureTextStatus": primaryScripture.textStatus,
  "hasScripturePassage": defined(primaryScripture.passage) && length(primaryScripture.passage) > 0,
  "scriptureRightsConfirmed": primaryScripture.usageRightsConfirmed,
  "practiceStatus": primaryScripture.practiceStatus,
  "screenCount": count(screens),
  "adaptationReviewed": editorialReview.adaptationReviewed,
  "reviewedBy": editorialReview.reviewedBy,
  "reviewedAt": editorialReview.reviewedAt,
  "unapprovedBlockCount": count(screens[].blocks[_type in ["comparisonBlock", "visualCardsBlock", "connectedSequenceBlock", "reflectionBlock", "optionalStudyBlock"] && reviewStatus != "approved"])
}`

export const CARDS_METADATA_QUERY = `*[_type == "scriptureCard" && _id in $ids]{
  _id,
  _rev,
  _updatedAt,
  title,
  "slug": slug.current,
  cardCategory,
  plannedYearMonth,
  editorialStatus,
  withdrawn,
  "hasArtwork": defined(artwork.asset._ref),
  assetRevision,
  "hasIllustrationAlt": defined(illustrationAlt) && length(illustrationAlt) > 0,
  "hasAccessibleTranscription": defined(accessibleTranscription) && length(accessibleTranscription) > 0,
  "altMatchesTranscription": defined(illustrationAlt) && defined(accessibleTranscription) && lower(illustrationAlt) == lower(accessibleTranscription),
  "artworkRightsConfirmed": rightsAndAttribution.usageRightsConfirmed,
  "hasAttribution": defined(rightsAndAttribution.attribution) && length(rightsAndAttribution.attribution) > 0,
  "hasRightsStatus": defined(rightsAndAttribution.rightsStatus) && length(rightsAndAttribution.rightsStatus) > 0,
  "book": scriptureCitation.book,
  "scriptureReference": scriptureCitation.reference,
  "translation": scriptureCitation.translation,
  "scriptureRightsConfirmed": scriptureCitation.usageRightsConfirmed,
  "reviewedBy": editorialReview.reviewedBy,
  "reviewerRole": editorialReview.reviewerRole,
  "reviewedAt": editorialReview.reviewedAt
}`

export const PREVIEW_NEWS_METADATA_QUERY = `*[_type == "newsArticle" && _id in $ids]{
  _id,
  _rev,
  _updatedAt,
  title,
  "slug": slug.current,
  category,
  publishOnDate,
  "relatedMonthRef": relatedMonth._ref,
  withdrawn,
  "hasSummary": defined(summary) && length(summary) > 0,
  "hasBody": defined(body) && count(body) > 0,
  "hasCoverImage": defined(coverImage.asset._ref),
  "hasCoverImageAlt": defined(coverImage.alt) && length(coverImage.alt) > 0,
  "reviewedBy": editorialReview.reviewedBy,
  "reviewerRole": editorialReview.reviewerRole,
  "reviewedAt": editorialReview.reviewedAt
}`

function classifyQueryError(error: unknown, signal?: AbortSignal): NonNullable<ReadinessDatasetSnapshot['queryFailure']> {
  if (signal?.aborted) {
    return {
      kind: 'aborted',
      message: 'Readiness check was canceled before Sanity verification completed.',
    }
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return {
      kind: 'aborted',
      message: 'Readiness check was aborted before Sanity verification completed.',
    }
  }

  const statusCode =
    typeof error === 'object' && error !== null
      ? ((error as {statusCode?: unknown; response?: {statusCode?: unknown}}).statusCode ??
        (error as {response?: {statusCode?: unknown}}).response?.statusCode)
      : undefined
  const message = error instanceof Error ? error.message : String(error ?? '')

  if (
    statusCode === 401 ||
    statusCode === 403 ||
    /\b(401|403|unauthorized|forbidden|permission|insufficient permissions)\b/i.test(message)
  ) {
    return {
      kind: 'permissionDenied',
      message:
        'Sanity rejected the readiness query due to missing session authentication or insufficient dataset read permissions.',
    }
  }

  return {
    kind: 'networkError',
    message:
      'Unable to complete read-only Sanity verification (network or query failure). Retry when connected.',
  }
}

function makeBaseSnapshot(dataset: string, yearMonth: string): ReadinessDatasetSnapshot {
  return {
    dataset,
    yearMonth,
    monthPublished: null,
    monthDraft: null,
    publishedChallenges: {},
    draftChallenges: {},
    publishedCards: {},
    draftCards: {},
    publishedPreviewNews: null,
    draftPreviewNews: null,
    otherPublishedMonths: [],
    otherDraftMonths: [],
  }
}

class PerspectiveAmbiguityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PerspectiveAmbiguityError'
  }
}

class MalformedResponseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MalformedResponseError'
  }
}

function assertArrayResult<T extends {_id?: unknown}>(
  rows: unknown,
  label: string,
  requirePublishedIds: boolean,
): T[] {
  if (!Array.isArray(rows)) {
    throw new MalformedResponseError(`Expected array result from Sanity ${label} query.`)
  }
  if (requirePublishedIds) {
    for (const row of rows) {
      if (row && typeof (row as {_id?: unknown})._id === 'string' && ((row as {_id: string})._id).startsWith('drafts.')) {
        throw new PerspectiveAmbiguityError(
          `Sanity published-perspective query for ${label} unexpectedly returned a draft document ID.`,
        )
      }
    }
  }
  return rows as T[]
}

function expandDraftAndBaseIds(baseIds: string[]): string[] {
  const out: string[] = []
  for (const id of baseIds) {
    out.push(id, `drafts.${id}`)
  }
  return out
}

function collectReferencedIds(docs: (MonthPublicationMetadata | null)[]): {
  challengeBaseIds: string[]
  cardBaseIds: string[]
  extraNewsBaseIds: string[]
} {
  const challengeSet = new Set<string>()
  const cardSet = new Set<string>()
  const newsSet = new Set<string>()

  for (const doc of docs) {
    if (!doc) continue
    for (const slot of doc.slots ?? []) {
      if (typeof slot?.challengeRef === 'string' && slot.challengeRef.trim()) {
        challengeSet.add(stripDraftPrefix(slot.challengeRef.trim()))
      }
    }
    for (const disc of doc.discoveries ?? []) {
      for (const qRef of disc?.qualifyingChallengeRefs ?? []) {
        if (typeof qRef === 'string' && qRef.trim()) {
          challengeSet.add(stripDraftPrefix(qRef.trim()))
        }
      }
      if (typeof disc?.cardRef === 'string' && disc.cardRef.trim()) {
        cardSet.add(stripDraftPrefix(disc.cardRef.trim()))
      }
    }
    if (typeof doc.fullMonthCard?.cardRef === 'string' && doc.fullMonthCard.cardRef.trim()) {
      cardSet.add(stripDraftPrefix(doc.fullMonthCard.cardRef.trim()))
    }
    if (typeof doc.previewNewsRef === 'string' && doc.previewNewsRef.trim()) {
      newsSet.add(stripDraftPrefix(doc.previewNewsRef.trim()))
    }
  }

  return {
    challengeBaseIds: [...challengeSet],
    cardBaseIds: [...cardSet],
    extraNewsBaseIds: [...newsSet],
  }
}

export async function fetchReadinessSnapshot({
  client,
  dataset,
  yearMonth,
  signal,
}: {
  client: ReadOnlySanityClient | null | undefined
  dataset: string | undefined | null
  yearMonth: string
  signal?: AbortSignal
}): Promise<ReadinessDatasetSnapshot> {
  const normalizedDataset = typeof dataset === 'string' ? dataset.trim() : ''
  const snapshot = makeBaseSnapshot(normalizedDataset, yearMonth.trim())

  if (!isAuthorizedDataset(normalizedDataset)) {
    snapshot.queryFailure = {
      kind: 'invalidConfiguration',
      message: `Unauthorized or ambiguous Sanity dataset "${normalizedDataset || 'unset'}". Only "production" and "staging" are permitted.`,
    }
    return snapshot
  }

  if (!isValidTargetYearMonth(snapshot.yearMonth)) {
    return snapshot
  }

  if (!client || typeof client.fetch !== 'function' || typeof client.withConfig !== 'function') {
    snapshot.queryFailure = {
      kind: 'invalidConfiguration',
      message: 'A configured read-only Sanity client supporting withConfig({perspective}) is required.',
    }
    return snapshot
  }

  const publishedClient = client.withConfig({perspective: 'published'})
  const rawClient = client.withConfig({perspective: 'raw'})
  if (
    !publishedClient ||
    typeof publishedClient.fetch !== 'function' ||
    !rawClient ||
    typeof rawClient.fetch !== 'function'
  ) {
    snapshot.queryFailure = {
      kind: 'perspectiveAmbiguity',
      message: 'Unable to obtain distinct published and raw perspective Sanity clients.',
    }
    return snapshot
  }

  const baseId = `month-${snapshot.yearMonth}`
  const draftId = `drafts.${baseId}`
  const newsBaseId = `news-preview-${snapshot.yearMonth}`
  const newsDraftId = `drafts.${newsBaseId}`

  try {
    const [rawMonthRows, publishedMonthRows, otherPublishedRows, otherDraftRows] = await Promise.all([
      rawClient.fetch<unknown>(
        MONTH_PUBLICATION_METADATA_QUERY,
        {baseId, draftId, yearMonth: snapshot.yearMonth},
        {signal},
      ),
      publishedClient.fetch<unknown>(
        MONTH_PUBLICATION_METADATA_QUERY,
        {baseId, draftId, yearMonth: snapshot.yearMonth},
        {signal},
      ),
      publishedClient.fetch<unknown>(OTHER_PUBLISHED_MONTHS_QUERY, {baseId, draftId}, {signal}),
      rawClient.fetch<unknown>(OTHER_DRAFT_MONTHS_QUERY, {draftId}, {signal}),
    ])

    const rawMonths = assertArrayResult<MonthPublicationMetadata>(rawMonthRows, 'raw monthlyPublication', false)
    const publishedMonths = assertArrayResult<MonthPublicationMetadata>(
      publishedMonthRows,
      'published monthlyPublication',
      true,
    )
    const otherPublished = assertArrayResult<OtherMonthMetadata>(
      otherPublishedRows,
      'published other months',
      true,
    )
    const otherDrafts = assertArrayResult<OtherMonthMetadata>(rawDraftFilter(otherDraftRows), 'draft other months', false)

    snapshot.monthPublished = publishedMonths.find(d => d._id === baseId) ?? null
    snapshot.monthDraft = rawMonths.find(d => d._id === draftId) ?? null
    const nonConforming = rawMonths.filter(d => d._id !== baseId && d._id !== draftId)
    if (nonConforming.length > 0) {
      snapshot.nonConformingMonths = nonConforming
    }
    snapshot.otherPublishedMonths = otherPublished
    snapshot.otherDraftMonths = otherDrafts

    const {challengeBaseIds, cardBaseIds, extraNewsBaseIds} = collectReferencedIds([
      snapshot.monthDraft,
      snapshot.monthPublished,
      ...nonConforming,
    ])
    const newsBaseIds = [...new Set([newsBaseId, ...extraNewsBaseIds])]
    const newsQueryIds = expandDraftAndBaseIds(newsBaseIds)

    const [
      pubChallengesRaw,
      rawChallengesRaw,
      pubCardsRaw,
      rawCardsRaw,
      pubNewsRaw,
      rawNewsRaw,
    ] = await Promise.all([
      challengeBaseIds.length > 0
        ? publishedClient.fetch<unknown>(CHALLENGES_METADATA_QUERY, {ids: challengeBaseIds}, {signal})
        : Promise.resolve([]),
      challengeBaseIds.length > 0
        ? rawClient.fetch<unknown>(
            CHALLENGES_METADATA_QUERY,
            {ids: expandDraftAndBaseIds(challengeBaseIds)},
            {signal},
          )
        : Promise.resolve([]),
      cardBaseIds.length > 0
        ? publishedClient.fetch<unknown>(CARDS_METADATA_QUERY, {ids: cardBaseIds}, {signal})
        : Promise.resolve([]),
      cardBaseIds.length > 0
        ? rawClient.fetch<unknown>(
            CARDS_METADATA_QUERY,
            {ids: expandDraftAndBaseIds(cardBaseIds)},
            {signal},
          )
        : Promise.resolve([]),
      publishedClient.fetch<unknown>(PREVIEW_NEWS_METADATA_QUERY, {ids: newsBaseIds}, {signal}),
      rawClient.fetch<unknown>(PREVIEW_NEWS_METADATA_QUERY, {ids: newsQueryIds}, {signal}),
    ])

    const pubChallenges = assertArrayResult<ChallengeMetadata>(pubChallengesRaw, 'published challenges', true)
    const rawChallenges = assertArrayResult<ChallengeMetadata>(rawChallengesRaw, 'raw challenges', false)
    const pubCards = assertArrayResult<ScriptureCardMetadata>(pubCardsRaw, 'published cards', true)
    const rawCards = assertArrayResult<ScriptureCardMetadata>(rawCardsRaw, 'raw cards', false)
    const pubNews = assertArrayResult<PreviewNewsMetadata>(pubNewsRaw, 'published preview news', true)
    const rawNews = assertArrayResult<PreviewNewsMetadata>(rawNewsRaw, 'raw preview news', false)

    for (const ch of pubChallenges) {
      if (typeof ch?._id === 'string' && !ch._id.startsWith('drafts.')) {
        snapshot.publishedChallenges[ch._id] = ch
      }
    }
    for (const ch of rawChallenges) {
      if (typeof ch?._id === 'string' && ch._id.startsWith('drafts.')) {
        snapshot.draftChallenges[stripDraftPrefix(ch._id)] = ch
      }
    }

    for (const card of pubCards) {
      if (typeof card?._id === 'string' && !card._id.startsWith('drafts.')) {
        snapshot.publishedCards[card._id] = card
      }
    }
    for (const card of rawCards) {
      if (typeof card?._id === 'string' && card._id.startsWith('drafts.')) {
        snapshot.draftCards[stripDraftPrefix(card._id)] = card
      }
    }

    snapshot.publishedPreviewNews = pubNews.find(n => n._id === newsBaseId) ?? null
    snapshot.draftPreviewNews = rawNews.find(n => n._id === newsDraftId) ?? null

    return snapshot
  } catch (error) {
    if (error instanceof PerspectiveAmbiguityError) {
      snapshot.queryFailure = {
        kind: 'perspectiveAmbiguity',
        message: error.message,
      }
      return snapshot
    }
    if (error instanceof MalformedResponseError) {
      snapshot.queryFailure = {
        kind: 'networkError',
        message: error.message,
      }
      return snapshot
    }
    snapshot.queryFailure = classifyQueryError(error, signal)
    return snapshot
  }
}

function rawDraftFilter(rows: unknown): unknown {
  if (!Array.isArray(rows)) return rows
  return rows.filter(
    row => row && typeof (row as {_id?: unknown})._id === 'string' && (row as {_id: string})._id.startsWith('drafts.'),
  )
}

export async function inspectMonthlyReadiness(options: {
  client: ReadOnlySanityClient | null | undefined
  dataset: string | undefined | null
  yearMonth: string
  signal?: AbortSignal
  evaluatedAtIso?: string
}): Promise<MonthlyReadinessReport> {
  const snapshot = await fetchReadinessSnapshot(options)
  return evaluateMonthlyReadiness(snapshot, options.evaluatedAtIso)
}
