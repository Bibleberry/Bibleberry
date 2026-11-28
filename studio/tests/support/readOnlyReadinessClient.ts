// @ts-nocheck -- Shared by Sanity exec Node test files; Studio's browser tsconfig has no Node test types.
/**
 * In-memory, read-only Sanity client for readiness inspector tests.
 *
 * Answers the readiness metadata GROQ queries by projecting full Studio documents in JS, the
 * same way the real queries project them in Sanity. Any mutation method throws and is counted.
 * Shared by monthlyReadiness.test.ts and readinessGatewayParity.test.ts.
 */
import type {ReadOnlySanityClient} from '../../readiness/types'

export const REVIEWED_BLOCK_TYPES = new Set([
  'comparisonBlock',
  'visualCardsBlock',
  'connectedSequenceBlock',
  'reflectionBlock',
  'optionalStudyBlock',
])

export function projectMonthToMetadata(doc: Record<string, unknown>) {
  const intro = (doc.introduction ?? {}) as {
    previewScreens?: Array<{blocks?: unknown[]}>
    welcomeScreen?: {blocks?: unknown[]}
  }
  const previewScreens = Array.isArray(intro.previewScreens) ? intro.previewScreens : []
  const rf = (doc.rosterFinalization ?? {}) as {
    isFinalized?: boolean
    rosterVersion?: number
    finalizedAt?: string
    finalizedBy?: string
    finalizedChallengeIds?: string[]
    priorRosters?: Array<{
      rosterVersion?: number
      supersededAt?: string
      reason?: string
      finalizedChallengeIds?: string[]
    }>
  }

  return {
    _id: String(doc._id),
    _rev: typeof doc._rev === 'string' ? doc._rev : 'rev-1',
    _updatedAt: typeof doc._updatedAt === 'string' ? doc._updatedAt : '2026-11-10T10:00:00Z',
    yearMonth: doc.yearMonth as string | undefined,
    year: doc.year as number | undefined,
    month: doc.month as number | undefined,
    title: doc.title as string | undefined,
    hasSubtitle: typeof doc.subtitle === 'string' && doc.subtitle.length > 0,
    hasCoverImage: Boolean((doc.coverImage as {asset?: {_ref?: string}} | undefined)?.asset?._ref),
    hasCoverImageAlt:
      typeof (doc.coverImage as {alt?: unknown} | undefined)?.alt === 'string' &&
      ((doc.coverImage as {alt: string}).alt).length > 0,
    defaultSeriesRef: (doc.defaultSeries as {_ref?: string} | undefined)?._ref,
    previewNewsRef: (doc.previewNews as {_ref?: string} | undefined)?._ref,
    editorialStatus: doc.editorialStatus as string | undefined,
    withdrawn: doc.withdrawn as boolean | undefined,
    editorialReview: doc.editorialReview
      ? {
          reviewedBy: (doc.editorialReview as {reviewedBy?: string}).reviewedBy,
          reviewerRole: (doc.editorialReview as {reviewerRole?: string}).reviewerRole,
          reviewedAt: (doc.editorialReview as {reviewedAt?: string}).reviewedAt,
          hasReviewNotes: Boolean((doc.editorialReview as {reviewNotes?: string}).reviewNotes),
        }
      : undefined,
    introduction: {
      previewScreenCount: previewScreens.length,
      previewScreensMissingBlocksCount: previewScreens.filter(
        s => !Array.isArray(s?.blocks) || s.blocks.length === 0,
      ).length,
      hasWelcomeScreen: Boolean(intro.welcomeScreen),
      welcomeBlockCount: Array.isArray(intro.welcomeScreen?.blocks)
        ? intro.welcomeScreen!.blocks.length
        : 0,
    },
    slots: Array.isArray(doc.slots)
      ? doc.slots.map((s: Record<string, unknown>) => ({
          _key: s._key as string | undefined,
          dayOfMonth: s.dayOfMonth as number | undefined,
          date: s.date as string | undefined,
          slotStatus: s.slotStatus as string | undefined,
          challengeRef: (s.challenge as {_ref?: string} | undefined)?._ref,
          hasWithdrawalReason:
            typeof s.withdrawalReason === 'string' && s.withdrawalReason.trim().length > 0,
        }))
      : [],
    rosterFinalization: doc.rosterFinalization
      ? {
          isFinalized: rf.isFinalized,
          rosterVersion: rf.rosterVersion,
          finalizedAt: rf.finalizedAt,
          finalizedBy: rf.finalizedBy,
          finalizedChallengeIds: rf.finalizedChallengeIds,
          priorRosters: Array.isArray(rf.priorRosters)
            ? rf.priorRosters.map(p => ({
                rosterVersion: p.rosterVersion,
                supersededAt: p.supersededAt,
                hasReason: typeof p.reason === 'string' && p.reason.trim().length > 0,
                challengeCount: Array.isArray(p.finalizedChallengeIds)
                  ? p.finalizedChallengeIds.length
                  : 0,
              }))
            : [],
        }
      : undefined,
    discoveries: Array.isArray(doc.discoveries)
      ? doc.discoveries.map((d: Record<string, unknown>) => ({
          _key: d._key as string | undefined,
          discoverySlug: d.discoverySlug as string | undefined,
          title: d.title as string | undefined,
          qualifyingChallengeRefs: Array.isArray(d.qualifyingChallenges)
            ? (d.qualifyingChallenges as Array<{_ref?: string}>)
                .map(r => r?._ref)
                .filter((r): r is string => typeof r === 'string')
            : [],
          cardRef: (d.card as {_ref?: string} | undefined)?._ref,
          reservedCardId: d.reservedCardId as string | undefined,
        }))
      : [],
    fullMonthCard: doc.fullMonthCard
      ? {
          title: (doc.fullMonthCard as {title?: string}).title,
          cardRef: (doc.fullMonthCard as {card?: {_ref?: string}}).card?._ref,
          reservedCardId: (doc.fullMonthCard as {reservedCardId?: string}).reservedCardId,
        }
      : undefined,
  }
}

export function projectChallengeToMetadata(doc: Record<string, unknown>) {
  const ps = (doc.primaryScripture ?? {}) as Record<string, unknown>
  const review = (doc.editorialReview ?? {}) as Record<string, unknown>
  const screens = Array.isArray(doc.screens) ? doc.screens : []
  const unapprovedBlockCount = screens.reduce(
    (count: number, screen: {blocks?: Array<{_type?: string; reviewStatus?: string}>}) =>
      count +
      (screen?.blocks ?? []).filter(
        b => REVIEWED_BLOCK_TYPES.has(String(b._type ?? '')) && b.reviewStatus !== 'approved',
      ).length,
    0,
  )
  return {
    _id: String(doc._id),
    _rev: typeof doc._rev === 'string' ? doc._rev : 'rev-1',
    _updatedAt: typeof doc._updatedAt === 'string' ? doc._updatedAt : '2026-11-10T10:00:00Z',
    title: doc.title as string | undefined,
    slug: (doc.slug as {current?: string} | undefined)?.current,
    challengeType: doc.challengeType as string | undefined,
    withdrawn: doc.withdrawn as boolean | undefined,
    hasPrimaryScripture: Boolean(doc.primaryScripture),
    scriptureReference: ps.reference as string | undefined,
    scriptureTranslation: ps.translation as string | undefined,
    scriptureTextStatus: ps.textStatus as string | undefined,
    hasScripturePassage: typeof ps.passage === 'string' && ps.passage.length > 0,
    scriptureRightsConfirmed: ps.usageRightsConfirmed as boolean | undefined,
    practiceStatus: ps.practiceStatus as string | undefined,
    screenCount: screens.length,
    adaptationReviewed: review.adaptationReviewed as boolean | undefined,
    reviewedBy: review.reviewedBy as string | undefined,
    reviewedAt: review.reviewedAt as string | undefined,
    unapprovedBlockCount,
  }
}

export function projectCardToMetadata(doc: Record<string, unknown>) {
  const citation = (doc.scriptureCitation ?? {}) as Record<string, unknown>
  const rights = (doc.rightsAndAttribution ?? {}) as Record<string, unknown>
  const review = (doc.editorialReview ?? {}) as Record<string, unknown>
  const alt = typeof doc.illustrationAlt === 'string' ? doc.illustrationAlt : ''
  const trans = typeof doc.accessibleTranscription === 'string' ? doc.accessibleTranscription : ''

  return {
    _id: String(doc._id),
    _rev: typeof doc._rev === 'string' ? doc._rev : 'rev-1',
    _updatedAt: typeof doc._updatedAt === 'string' ? doc._updatedAt : '2027-02-01T12:00:00Z',
    title: doc.title as string | undefined,
    slug: (doc.slug as {current?: string} | undefined)?.current,
    cardCategory: doc.cardCategory as string | undefined,
    plannedYearMonth: doc.plannedYearMonth as string | undefined,
    editorialStatus: doc.editorialStatus as string | undefined,
    withdrawn: doc.withdrawn as boolean | undefined,
    hasArtwork: Boolean((doc.artwork as {asset?: {_ref?: string}} | undefined)?.asset?._ref),
    assetRevision: doc.assetRevision as string | undefined,
    hasIllustrationAlt: alt.length > 0,
    hasAccessibleTranscription: trans.length > 0,
    altMatchesTranscription:
      alt.length > 0 && trans.length > 0 && alt.toLowerCase() === trans.toLowerCase(),
    artworkRightsConfirmed: rights.usageRightsConfirmed as boolean | undefined,
    hasAttribution: typeof rights.attribution === 'string' && rights.attribution.length > 0,
    hasRightsStatus: typeof rights.rightsStatus === 'string' && rights.rightsStatus.length > 0,
    book: citation.book as string | undefined,
    scriptureReference: citation.reference as string | undefined,
    translation: citation.translation as string | undefined,
    scriptureRightsConfirmed: citation.usageRightsConfirmed as boolean | undefined,
    reviewedBy: review.reviewedBy as string | undefined,
    reviewerRole: review.reviewerRole as string | undefined,
    reviewedAt: review.reviewedAt as string | undefined,
  }
}

export function projectNewsToMetadata(doc: Record<string, unknown>) {
  const review = (doc.editorialReview ?? {}) as Record<string, unknown>
  const cover = (doc.coverImage ?? {}) as {asset?: {_ref?: string}; alt?: string}
  return {
    _id: String(doc._id),
    _rev: typeof doc._rev === 'string' ? doc._rev : 'rev-1',
    _updatedAt: typeof doc._updatedAt === 'string' ? doc._updatedAt : '2026-11-10T10:00:00Z',
    title: doc.title as string | undefined,
    slug: (doc.slug as {current?: string} | undefined)?.current,
    category: doc.category as string | undefined,
    publishOnDate: doc.publishOnDate as string | undefined,
    relatedMonthRef: (doc.relatedMonth as {_ref?: string} | undefined)?._ref,
    withdrawn: doc.withdrawn as boolean | undefined,
    hasSummary: typeof doc.summary === 'string' && doc.summary.length > 0,
    hasBody: Array.isArray(doc.body) && doc.body.length > 0,
    hasCoverImage: Boolean(cover.asset?._ref),
    hasCoverImageAlt: typeof cover.alt === 'string' && cover.alt.length > 0,
    reviewedBy: review.reviewedBy as string | undefined,
    reviewerRole: review.reviewerRole as string | undefined,
    reviewedAt: review.reviewedAt as string | undefined,
  }
}

/**
 * In-memory Sanity client supporting both @sanity/validation queries and readiness metadata queries.
 * Fails test immediately if any Sanity mutation method is ever touched.
 */
export function createReadOnlyTestClient({
  months = [],
  challenges = [],
  cards = [],
  news = [],
  initialPerspective = 'previewDrafts',
}: {
  months?: readonly Record<string, unknown>[]
  challenges?: readonly Record<string, unknown>[]
  cards?: readonly Record<string, unknown>[]
  news?: readonly Record<string, unknown>[]
  initialPerspective?: 'published' | 'raw' | 'previewDrafts' | 'drafts'
}) {
  let mutationCount = 0
  const recordForbiddenMutation = (name: string) => () => {
    mutationCount += 1
    throw new Error(`Forbidden Sanity mutation "${name}" invoked by read-only inspector!`)
  }

  function makePerspectiveClient(perspective: string) {
    const filterByPerspective = <T extends Record<string, unknown>>(docs: readonly T[]) => {
      if (perspective === 'published') {
        return docs.filter(d => !String(d._id).startsWith('drafts.'))
      }
      return docs
    }

    return {
      fetch: async (query: string, params?: Record<string, unknown>) => {
        if (
          query.includes('_type == "monthlyPublication"') &&
          query.includes('yearMonth == $yearMonth')
        ) {
          const baseId = String(params?.baseId ?? '')
          const draftId = String(params?.draftId ?? '')
          const ym = String(params?.yearMonth ?? '')
          return filterByPerspective(months)
            .filter(m => m._id === baseId || m._id === draftId || m.yearMonth === ym)
            .map(projectMonthToMetadata)
        }

        if (query.includes('_type == "monthlyPublication"') && query.includes('defined(slots)')) {
          const baseId = String(params?.baseId ?? '')
          const draftId = String(params?.draftId ?? '')
          const isPublishedOnlyQuery = query.includes('!(_id in path("drafts.**"))')
          const isDraftOnlyQuery = !isPublishedOnlyQuery && query.includes('_id in path("drafts.**")')
          return filterByPerspective(months)
            .filter(m => {
              const id = String(m._id)
              if (id === baseId || id === draftId) return false
              if (isDraftOnlyQuery && !id.startsWith('drafts.')) return false
              if (isPublishedOnlyQuery && id.startsWith('drafts.')) return false
              return Array.isArray(m.slots)
            })
            .map(m => ({
              _id: String(m._id),
              yearMonth: m.yearMonth as string | undefined,
              challengeRefs: (m.slots as Array<{challenge?: {_ref?: string}}>)
                .map(s => s.challenge?._ref)
                .filter((ref): ref is string => typeof ref === 'string'),
            }))
        }

        if (query.includes('_type == "challenge"')) {
          const ids = Array.isArray(params?.ids) ? (params.ids as string[]) : []
          const matched = filterByPerspective(challenges).filter(c => ids.includes(String(c._id)))
          if (query.includes('adaptationReviewed')) {
            return matched.map(projectChallengeToMetadata)
          }
          return matched
        }

        if (query.includes('_type == "scriptureCard"')) {
          const ids = Array.isArray(params?.ids ?? params?.cardIds)
            ? ((params?.ids ?? params?.cardIds) as string[])
            : []
          return filterByPerspective(cards)
            .filter(c => ids.includes(String(c._id)))
            .map(projectCardToMetadata)
        }

        if (query.includes('_type == "newsArticle"')) {
          const ids = Array.isArray(params?.ids) ? (params.ids as string[]) : []
          return filterByPerspective(news)
            .filter(n => ids.includes(String(n._id)))
            .map(projectNewsToMetadata)
        }

        return []
      },
      withConfig(next?: {perspective?: 'published' | 'raw' | 'drafts' | 'previewDrafts'}) {
        return makePerspectiveClient(next?.perspective ?? perspective)
      },
      getDataUrl: () => {
        throw new Error('Unexpected Sanity network request')
      },
      request: async () => {
        throw new Error('Unexpected Sanity network request')
      },
      observable: {
        fetch: () => {
          throw new Error('Unexpected Sanity network fetch')
        },
      },
      create: recordForbiddenMutation('create'),
      createOrReplace: recordForbiddenMutation('createOrReplace'),
      createIfNotExists: recordForbiddenMutation('createIfNotExists'),
      patch: recordForbiddenMutation('patch'),
      delete: recordForbiddenMutation('delete'),
      mutate: recordForbiddenMutation('mutate'),
      transaction: recordForbiddenMutation('transaction'),
    }
  }

  return {
    client: makePerspectiveClient(initialPerspective) as unknown as ReadOnlySanityClient,
    getMutationCount: () => mutationCount,
  }
}
