import {defineArrayMember, defineField, defineType} from 'sanity'
import {
  ALLOWED_REVIEWER_ROLES,
  CARD_PLACEHOLDER_PATTERN,
  daysInMonth,
  formatCivilDate,
  parseYearMonth,
  stripDraftPrefix,
  YEAR_MONTH_PATTERN,
} from '../monthlyHelpers'

type ValidationIssue = {message: string; path: (string | number)[]}

type SlotRecord = {
  _key?: unknown
  dayOfMonth?: unknown
  date?: unknown
  slotStatus?: unknown
  challenge?: {_ref?: unknown}
  withdrawalReason?: unknown
}

type PriorRosterRecord = {
  rosterVersion?: unknown
  finalizedChallengeIds?: unknown
  supersededAt?: unknown
  reason?: unknown
}

type DiscoveryRecord = {
  discoverySlug?: unknown
  title?: unknown
  qualifyingChallenges?: {_ref?: unknown}[]
}

type IntroScreenRecord = {
  blocks?: unknown[]
}

type MonthlyPublicationValue = {
  _id?: unknown
  yearMonth?: unknown
  year?: unknown
  month?: unknown
  coverImage?: {asset?: unknown; alt?: unknown}
  editorialStatus?: unknown
  withdrawn?: unknown
  editorialReview?: {
    reviewedBy?: unknown
    reviewerRole?: unknown
    reviewedAt?: unknown
  }
  introduction?: {
    previewScreens?: IntroScreenRecord[]
    welcomeScreen?: IntroScreenRecord
  }
  slots?: SlotRecord[]
  rosterFinalization?: {
    isFinalized?: unknown
    rosterVersion?: unknown
    finalizedAt?: unknown
    finalizedBy?: unknown
    finalizedChallengeIds?: unknown
    priorRosters?: PriorRosterRecord[]
  }
  discoveries?: DiscoveryRecord[]
}

type RemoteChallengeProjection = {
  _id: string
  withdrawn?: boolean
  adaptationReviewed?: boolean
  unapprovedBlockCount?: number
}

type RemoteOtherMonthProjection = {
  _id: string
  yearMonth?: string
  challengeRefs?: string[]
}

export const monthlyPublication = defineType({
  name: 'monthlyPublication',
  title: 'Monthly publication',
  type: 'document',
  groups: [
    {name: 'overview', title: 'Month overview', default: true},
    {name: 'slots', title: 'Calendar slots'},
    {name: 'introduction', title: 'Introduction & Welcome'},
    {name: 'discoveries', title: 'Discoveries (Phase 04 prep)'},
    {name: 'finalization', title: 'Roster finalization'},
    {name: 'review', title: 'Editorial review & status'},
  ],
  fields: [
    defineField({
      name: 'yearMonth',
      title: 'Publication month (YYYY-MM)',
      type: 'string',
      group: 'overview',
      description: 'Deterministic month key (for example, 2027-03). Document ID must match month-YYYY-MM.',
      validation: Rule =>
        Rule.required().regex(YEAR_MONTH_PATTERN, {
          name: 'YYYY-MM publication month',
        }),
    }),
    defineField({
      name: 'year',
      title: 'Publication year',
      type: 'number',
      group: 'overview',
      validation: Rule => Rule.required().integer().min(2026).max(2100),
    }),
    defineField({
      name: 'month',
      title: 'Publication month number (1–12)',
      type: 'number',
      group: 'overview',
      validation: Rule => Rule.required().integer().min(1).max(12),
    }),
    defineField({
      name: 'title',
      title: 'Monthly theme title',
      type: 'string',
      group: 'overview',
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'subtitle',
      title: 'Short theme subtitle',
      type: 'text',
      rows: 3,
      group: 'overview',
    }),
    defineField({
      name: 'coverImage',
      title: 'Optional cover image',
      type: 'image',
      group: 'overview',
      options: {hotspot: true},
      fields: [
        defineField({
          name: 'alt',
          title: 'Alternative text',
          type: 'string',
          description: 'Blocking-required whenever a cover image is provided.',
          validation: Rule =>
            Rule.custom((value, context) => {
              const parent = context.parent as {asset?: unknown} | undefined
              if (parent?.asset && (typeof value !== 'string' || !value.trim())) {
                return 'Alternative text is required when a cover image is present.'
              }
              return true
            }),
        }),
      ],
    }),
    defineField({
      name: 'defaultSeries',
      title: 'Optional default Challenge series',
      type: 'reference',
      to: [{type: 'challengeSeries'}],
      weak: true,
      group: 'overview',
      description: 'Editorial convenience link only. challengeSeries remains an independent thematic grouping.',
    }),
    defineField({
      name: 'previewNews',
      title: 'Optional monthly preview News link',
      type: 'reference',
      to: [{type: 'newsArticle'}],
      weak: true,
      group: 'overview',
      description: 'Weak reference to news-preview-YYYY-MM so month scheduling and News authoring never deadlock.',
    }),
    defineField({
      name: 'editorialStatus',
      title: 'Editorial status',
      type: 'string',
      group: 'review',
      options: {
        list: [
          {title: 'Draft', value: 'draft'},
          {title: 'In review', value: 'inReview'},
          {title: 'Approved (ready to schedule)', value: 'approved'},
          {title: 'Scheduled for release', value: 'scheduled'},
        ],
        layout: 'radio',
      },
      initialValue: 'draft',
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'withdrawn',
      title: 'Withdraw entire month (emergency)',
      type: 'boolean',
      group: 'review',
      initialValue: false,
      description: 'Whole-month emergency suppression switch. Suppresses reader delivery immediately without deleting reader completion history.',
    }),
    defineField({
      name: 'editorialReview',
      title: 'Monthly editorial review',
      type: 'monthlyEditorialReview',
      group: 'review',
    }),
    defineField({
      name: 'introduction',
      title: 'Introduction & Welcome screens',
      type: 'monthlyIntroduction',
      group: 'introduction',
    }),
    defineField({
      name: 'slots',
      title: 'Daily calendar slots (authoritative month roster)',
      type: 'array',
      group: 'slots',
      description:
        'Must contain every civil day 1..N in exact order with deterministic day-01..day-31 keys. Never delete dates during withdrawal; set slotStatus to withdrawn instead.',
      of: [defineArrayMember({type: 'monthlyCalendarSlot'})],
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'rosterFinalization',
      title: 'Roster finalization & amendment history',
      type: 'rosterFinalization',
      group: 'finalization',
    }),
    defineField({
      name: 'discoveries',
      title: 'Monthly discoveries (Phase 04 prep)',
      type: 'array',
      group: 'discoveries',
      description:
        'Thematic discovery rules. Qualifying Challenge references must remain a strict subset of finalizedChallengeIds (V-DISC-SUBSET). Card artwork linking is deferred to Phase 04.',
      of: [defineArrayMember({type: 'monthlyDiscovery'})],
      initialValue: [],
    }),
    defineField({
      name: 'fullMonthCard',
      title: 'Full-month Scripture Card placeholder (Phase 04 prep)',
      type: 'object',
      group: 'discoveries',
      description:
        'Reserved structure for the Phase 04 full-month completion card. Full scriptureCard asset/artwork reference is deliberately deferred to Phase 04.',
      fields: [
        defineField({
          name: 'title',
          title: 'Goal title',
          type: 'string',
          description: 'For example, Complete March.',
        }),
        defineField({
          name: 'reservedCardId',
          title: 'Reserved Scripture Card ID (Phase 04 deferral)',
          type: 'string',
          description: 'Optional placeholder card-<slug> ID until Phase 04 adds scriptureCard references.',
          validation: Rule =>
            Rule.custom(value => {
              if (value === undefined || value === null || value === '') return true
              if (typeof value === 'string' && CARD_PLACEHOLDER_PATTERN.test(value)) return true
              return 'Reserved Card ID must follow the deterministic pattern card-<slug>.'
            }),
        }),
      ],
    }),
  ],
  validation: Rule =>
    Rule.custom(async (value, context) => {
      const doc = value as MonthlyPublicationValue | undefined
      if (!doc) return true

      const issues: ValidationIssue[] = []
      const parsedYM = typeof doc.yearMonth === 'string' ? parseYearMonth(doc.yearMonth) : null

      // 1. Deterministic _id and year/month consistency
      if (parsedYM && typeof doc.yearMonth === 'string') {
        const expectedBaseId = `month-${doc.yearMonth}`
        if (
          typeof doc._id !== 'string' ||
          (doc._id !== expectedBaseId && doc._id !== `drafts.${expectedBaseId}`)
        ) {
          issues.push({
            message: `Document _id must be "${expectedBaseId}" or "drafts.${expectedBaseId}" to match yearMonth "${doc.yearMonth}".`,
            path: ['_id'],
          })
        }
        if (doc.year !== parsedYM.year) {
          issues.push({
            message: `Year (${String(doc.year)}) must match yearMonth (${doc.yearMonth}).`,
            path: ['year'],
          })
        }
        if (doc.month !== parsedYM.month) {
          issues.push({
            message: `Month (${String(doc.month)}) must match yearMonth (${doc.yearMonth}).`,
            path: ['month'],
          })
        }
      }

      // 2. Cover image alt enforcement
      if (doc.coverImage?.asset && (typeof doc.coverImage.alt !== 'string' || !doc.coverImage.alt.trim())) {
        issues.push({
          message: 'Alternative text is required when a cover image is present.',
          path: ['coverImage', 'alt'],
        })
      }

      // 3. Slots completeness, ordering, deterministic keys, dates, and intra-month uniqueness
      const slots = Array.isArray(doc.slots) ? doc.slots : []
      const seenChallengeIndices = new Map<string, number>()
      const withdrawnSlotRefs = new Set<string>()
      const activeSlotChallengeRefs: {index: number; rawRef: string; baseRef: string}[] = []

      if (parsedYM && typeof doc.yearMonth === 'string') {
        const expectedLength = daysInMonth(parsedYM.year, parsedYM.month)
        if (slots.length !== expectedLength) {
          issues.push({
            message: `Month ${doc.yearMonth} requires exactly ${expectedLength} ordered calendar slots, found ${slots.length}.`,
            path: ['slots'],
          })
        }

        const slotCheckLimit = Math.min(slots.length, expectedLength)
        for (let i = 0; i < slotCheckLimit; i++) {
          const slot = slots[i]
          const expectedDay = i + 1
          const padded = String(expectedDay).padStart(2, '0')
          const expectedKey = `day-${padded}`
          const expectedDate = formatCivilDate(parsedYM.year, parsedYM.month, expectedDay)

          if (slot._key !== undefined && slot._key !== expectedKey) {
            issues.push({
              message: `Slot ${i + 1} must use deterministic key "${expectedKey}" (received "${String(slot._key)}").`,
              path: ['slots', i, '_key'],
            })
          }
          if (slot.dayOfMonth !== expectedDay) {
            issues.push({
              message: `Slot ${i + 1} must have dayOfMonth ${expectedDay} in sequential calendar order.`,
              path: ['slots', i, 'dayOfMonth'],
            })
          }
          if (slot.date !== expectedDate) {
            issues.push({
              message: `Slot ${expectedDay} must have civil date "${expectedDate}" (received "${String(slot.date)}").`,
              path: ['slots', i, 'date'],
            })
          }

          if (slot.slotStatus !== 'scheduled' && slot.slotStatus !== 'withdrawn') {
            issues.push({
              message: `Slot ${expectedDay} must set slotStatus to "scheduled" or "withdrawn".`,
              path: ['slots', i, 'slotStatus'],
            })
          }

          const rawRef = typeof slot.challenge?._ref === 'string' ? slot.challenge._ref.trim() : ''
          if (rawRef) {
            const baseRef = stripDraftPrefix(rawRef)
            const firstIndex = seenChallengeIndices.get(baseRef)
            if (firstIndex !== undefined) {
              issues.push({
                message: `Challenge "${baseRef}" is assigned more than once in this month (days ${firstIndex + 1} and ${expectedDay}).`,
                path: ['slots', i, 'challenge'],
              })
            } else {
              seenChallengeIndices.set(baseRef, i)
            }

            if (slot.slotStatus === 'withdrawn') {
              withdrawnSlotRefs.add(baseRef)
            } else if (slot.slotStatus === 'scheduled') {
              activeSlotChallengeRefs.push({index: i, rawRef, baseRef})
            }
          }
        }
      }

      // 4. Discovery local structural checks (unique slugs & unique refs per discovery)
      const discoveries = Array.isArray(doc.discoveries) ? doc.discoveries : []
      const seenDiscoverySlugs = new Set<string>()
      for (let d = 0; d < discoveries.length; d++) {
        const disc = discoveries[d]
        if (typeof disc.discoverySlug === 'string' && disc.discoverySlug.trim()) {
          if (seenDiscoverySlugs.has(disc.discoverySlug)) {
            issues.push({
              message: `Duplicate discoverySlug "${disc.discoverySlug}" within this month.`,
              path: ['discoveries', d, 'discoverySlug'],
            })
          }
          seenDiscoverySlugs.add(disc.discoverySlug)
        }
      }

      // 5. Reviewer role sanity even in draft
      if (
        doc.editorialReview?.reviewerRole !== undefined &&
        doc.editorialReview.reviewerRole !== null &&
        (typeof doc.editorialReview.reviewerRole !== 'string' ||
          !(ALLOWED_REVIEWER_ROLES as readonly string[]).includes(doc.editorialReview.reviewerRole))
      ) {
        issues.push({
          message: 'Reviewer role must be theological_editorial or technical_synthetic.',
          path: ['editorialReview', 'reviewerRole'],
        })
      }

      // 6. Approval, Scheduling, and Finalization Boundary Gates
      const isApprovalOrScheduled =
        doc.editorialStatus === 'approved' || doc.editorialStatus === 'scheduled'
      const isFinalizedFlag = doc.rosterFinalization?.isFinalized === true
      const isGatedBoundary = isApprovalOrScheduled || isFinalizedFlag

      if (isApprovalOrScheduled) {
        if (
          typeof doc.editorialReview?.reviewedBy !== 'string' ||
          !doc.editorialReview.reviewedBy.trim()
        ) {
          issues.push({
            message: 'Record reviewedBy on monthly editorial review before approving or scheduling.',
            path: ['editorialReview', 'reviewedBy'],
          })
        }
        if (
          typeof doc.editorialReview?.reviewerRole !== 'string' ||
          !(ALLOWED_REVIEWER_ROLES as readonly string[]).includes(doc.editorialReview.reviewerRole)
        ) {
          issues.push({
            message: 'Select a valid reviewerRole (theological_editorial or technical_synthetic) before approving or scheduling.',
            path: ['editorialReview', 'reviewerRole'],
          })
        }
        if (
          typeof doc.editorialReview?.reviewedAt !== 'string' ||
          !Number.isFinite(Date.parse(doc.editorialReview.reviewedAt))
        ) {
          issues.push({
            message: 'Record a valid reviewedAt timestamp before approving or scheduling.',
            path: ['editorialReview', 'reviewedAt'],
          })
        }
      }

      if (isGatedBoundary) {
        // 6a. Preview & Welcome Introduction Gates
        const previewScreens = doc.introduction?.previewScreens
        if (!Array.isArray(previewScreens) || previewScreens.length === 0) {
          issues.push({
            message: 'At least one introduction preview screen is required before approving, finalizing, or scheduling.',
            path: ['introduction', 'previewScreens'],
          })
        } else {
          const incompleteIdx = previewScreens.findIndex(
            screen => !Array.isArray(screen?.blocks) || screen.blocks.length === 0,
          )
          if (incompleteIdx !== -1) {
            issues.push({
              message: `Preview screen ${incompleteIdx + 1} must contain at least one content block.`,
              path: ['introduction', 'previewScreens'],
            })
          }
        }

        const welcomeScreen = doc.introduction?.welcomeScreen
        if (
          !welcomeScreen ||
          !Array.isArray(welcomeScreen.blocks) ||
          welcomeScreen.blocks.length === 0
        ) {
          issues.push({
            message: 'A complete month-start Welcome screen (with at least one block) is required before approving, finalizing, or scheduling.',
            path: ['introduction', 'welcomeScreen'],
          })
        }

        // 6b. Roster Finalization Invariants & Emergency Amendment Rules
        const rf = doc.rosterFinalization
        if (rf?.isFinalized !== true) {
          issues.push({
            message: 'Roster finalization (rosterFinalization.isFinalized = true) is required before approving or scheduling.',
            path: ['rosterFinalization', 'isFinalized'],
          })
        }

        const version = rf?.rosterVersion
        if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
          issues.push({
            message: 'rosterVersion must be a positive integer (>= 1).',
            path: ['rosterFinalization', 'rosterVersion'],
          })
        }

        if (typeof rf?.finalizedAt !== 'string' || !Number.isFinite(Date.parse(rf.finalizedAt))) {
          issues.push({
            message: 'Record a valid finalizedAt timestamp.',
            path: ['rosterFinalization', 'finalizedAt'],
          })
        }

        if (typeof rf?.finalizedBy !== 'string' || !rf.finalizedBy.trim()) {
          issues.push({
            message: 'Record finalizedBy when finalizing the monthly roster.',
            path: ['rosterFinalization', 'finalizedBy'],
          })
        }

        if (typeof version === 'number' && Number.isInteger(version) && version === 1) {
          for (let i = 0; i < slots.length; i++) {
            const slot = slots[i]
            if (slot.slotStatus === 'withdrawn') {
              issues.push({
                message: `Initial roster finalization (rosterVersion 1) cannot contain pre-withdrawn slot on day ${i + 1}.`,
                path: ['slots', i, 'slotStatus'],
              })
            }
            const ref = typeof slot.challenge?._ref === 'string' ? slot.challenge._ref.trim() : ''
            if (!ref) {
              issues.push({
                message: `Slot ${i + 1} must reference an assigned Challenge before finalizing rosterVersion 1.`,
                path: ['slots', i, 'challenge'],
              })
            } else if (ref.startsWith('drafts.')) {
              issues.push({
                message: `Slot ${i + 1} references draft ID "${ref}". Reference the published base Challenge ID instead.`,
                path: ['slots', i, 'challenge'],
              })
            }
          }
        } else if (typeof version === 'number' && Number.isInteger(version) && version >= 2) {
          const priorRosters = Array.isArray(rf?.priorRosters) ? rf.priorRosters : []
          if (priorRosters.length < version - 1) {
            issues.push({
              message: `Amended roster v${version} requires at least ${version - 1} prior roster snapshot(s) in priorRosters for audit history.`,
              path: ['rosterFinalization', 'priorRosters'],
            })
          } else {
            for (let p = 0; p < priorRosters.length; p++) {
              const prior = priorRosters[p]
              if (
                typeof prior?.rosterVersion !== 'number' ||
                !Number.isInteger(prior.rosterVersion) ||
                prior.rosterVersion < 1 ||
                prior.rosterVersion >= version
              ) {
                issues.push({
                  message: `Prior roster entry ${p + 1} must record an integer rosterVersion < ${version}.`,
                  path: ['rosterFinalization', 'priorRosters'],
                })
              }
              if (typeof prior?.supersededAt !== 'string' || !Number.isFinite(Date.parse(prior.supersededAt))) {
                issues.push({
                  message: `Prior roster entry ${p + 1} must include a valid supersededAt timestamp.`,
                  path: ['rosterFinalization', 'priorRosters'],
                })
              }
              if (typeof prior?.reason !== 'string' || !prior.reason.trim()) {
                issues.push({
                  message: `Prior roster entry ${p + 1} must include a non-empty amendment reason.`,
                  path: ['rosterFinalization', 'priorRosters'],
                })
              }
            }
          }

          if (activeSlotChallengeRefs.length === 0) {
            issues.push({
              message: 'At least one active scheduled slot must remain during a roster amendment. Use withdrawn = true to suppress the entire month.',
              path: ['slots'],
            })
          }

          for (let i = 0; i < slots.length; i++) {
            const slot = slots[i]
            if (slot.slotStatus === 'scheduled') {
              const ref = typeof slot.challenge?._ref === 'string' ? slot.challenge._ref.trim() : ''
              if (!ref) {
                issues.push({
                  message: `Active scheduled slot ${i + 1} must reference an assigned Challenge.`,
                  path: ['slots', i, 'challenge'],
                })
              } else if (ref.startsWith('drafts.')) {
                issues.push({
                  message: `Slot ${i + 1} references draft ID "${ref}". Reference the published base Challenge ID instead.`,
                  path: ['slots', i, 'challenge'],
                })
              }
            } else if (
              slot.slotStatus === 'withdrawn' &&
              (typeof slot.withdrawalReason !== 'string' || !slot.withdrawalReason.trim())
            ) {
              issues.push({
                message: `Withdrawn slot ${i + 1} requires an explicit withdrawalReason.`,
                path: ['slots', i, 'withdrawalReason'],
              })
            }
          }
        }

        // 6c. Active Roster Equality Check
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

        const expectedActiveIds = new Set(activeSlotChallengeRefs.map(entry => entry.baseRef))
        const setsMatch =
          !hasInvalidFinalizedId &&
          finalizedIdSet.size === expectedActiveIds.size &&
          [...expectedActiveIds].every(id => finalizedIdSet.has(id))

        if (!setsMatch) {
          issues.push({
            message: `finalizedChallengeIds must exactly match the ${expectedActiveIds.size} active scheduled slot Challenge ID(s) with no drafts or duplicates.`,
            path: ['rosterFinalization', 'finalizedChallengeIds'],
          })
        }

        // 6d. V-DISC-SUBSET Invariant
        for (let d = 0; d < discoveries.length; d++) {
          const disc = discoveries[d]
          const refs = Array.isArray(disc.qualifyingChallenges) ? disc.qualifyingChallenges : []
          for (const refObj of refs) {
            const ref = typeof refObj?._ref === 'string' ? refObj._ref.trim() : ''
            if (!ref) continue
            const baseRef = stripDraftPrefix(ref)
            if (ref.startsWith('drafts.')) {
              issues.push({
                message: `Discovery "${String(disc.discoverySlug || d)}" cannot reference draft ID "${ref}".`,
                path: ['discoveries', d, 'qualifyingChallenges'],
              })
            } else if (withdrawnSlotRefs.has(baseRef)) {
              issues.push({
                message: `V-DISC-SUBSET violation: Discovery "${String(disc.discoverySlug || d)}" references withdrawn slot Challenge "${baseRef}". Remove or replace it in the amendment.`,
                path: ['discoveries', d, 'qualifyingChallenges'],
              })
            } else if (!expectedActiveIds.has(baseRef) || !finalizedIdSet.has(baseRef)) {
              issues.push({
                message: `V-DISC-SUBSET violation: Discovery "${String(disc.discoverySlug || d)}" references Challenge "${baseRef}" which is not in the active finalized roster.`,
                path: ['discoveries', d, 'qualifyingChallenges'],
              })
            }
          }
        }
      }

      // 7. Network-dependent cross-document verification (never silently pass when gated!)
      const baseClient = typeof context.getClient === 'function'
        ? context.getClient({apiVersion: '2026-11-01'})
        : undefined

      const slotAssignedIds = [...seenChallengeIndices.keys()]

      if (isGatedBoundary) {
        if (!baseClient || typeof baseClient.withConfig !== 'function') {
          issues.push({
            message: 'Fail-closed: An authenticated Sanity client supporting perspective: "published" is required to verify referenced published Challenges and cross-month uniqueness before approving, finalizing, or scheduling.',
            path: ['rosterFinalization'],
          })
        } else {
          const publishedClient = baseClient.withConfig({perspective: 'published'})
          if (!publishedClient || typeof publishedClient.fetch !== 'function') {
            issues.push({
              message: 'Fail-closed: Configured published-perspective Sanity client is required before approving, finalizing, or scheduling.',
              path: ['rosterFinalization'],
            })
          } else {
            const activeIdsToVerify = [...new Set(activeSlotChallengeRefs.map(entry => entry.baseRef))]
            const selfBase = typeof doc._id === 'string'
              ? stripDraftPrefix(doc._id)
              : (doc.yearMonth ? `month-${String(doc.yearMonth)}` : '')

            try {
              const [otherMonths, publishedChallenges] = await Promise.all([
                slotAssignedIds.length > 0
                  ? publishedClient.fetch<RemoteOtherMonthProjection[]>(
                      `*[_type == "monthlyPublication" && !(_id in [$baseId, $draftId]) && !(_id in path("drafts.**")) && defined(slots)]{
                        _id,
                        yearMonth,
                        "challengeRefs": slots[defined(challenge._ref)].challenge._ref
                      }`,
                      {baseId: selfBase, draftId: `drafts.${selfBase}`},
                    )
                  : Promise.resolve([] as RemoteOtherMonthProjection[]),
                activeIdsToVerify.length > 0
                  ? publishedClient.fetch<RemoteChallengeProjection[]>(
                      `*[_type == "challenge" && _id in $ids && !(_id in path("drafts.**"))]{
                        _id,
                        withdrawn,
                        "adaptationReviewed": editorialReview.adaptationReviewed,
                        "unapprovedBlockCount": count(screens[].blocks[_type in ["comparisonBlock", "visualCardsBlock", "connectedSequenceBlock", "reflectionBlock", "optionalStudyBlock"] && reviewStatus != "approved"])
                      }`,
                      {ids: activeIdsToVerify},
                    )
                  : Promise.resolve([] as RemoteChallengeProjection[]),
              ])

              if (!Array.isArray(otherMonths) || !Array.isArray(publishedChallenges)) {
                issues.push({
                  message: 'Fail-closed: Remote Sanity verification returned an invalid response; cannot confirm published Challenge dependencies.',
                  path: ['rosterFinalization'],
                })
              } else {
                for (const other of otherMonths) {
                  if (!other || (typeof other._id === 'string' && other._id.startsWith('drafts.'))) continue
                  const refs = Array.isArray(other?.challengeRefs) ? other.challengeRefs : []
                  for (const otherRef of refs) {
                    if (typeof otherRef !== 'string') continue
                    const normalizedOtherRef = stripDraftPrefix(otherRef)
                    const conflictSlotIdx = seenChallengeIndices.get(normalizedOtherRef)
                    if (conflictSlotIdx !== undefined) {
                      issues.push({
                        message: `Challenge "${normalizedOtherRef}" is already assigned to another published monthly publication (${other.yearMonth || other._id}).`,
                        path: ['slots', conflictSlotIdx, 'challenge'],
                      })
                    }
                  }
                }

                const publishedById = new Map<string, RemoteChallengeProjection>()
                for (const item of publishedChallenges) {
                  if (item && typeof item._id === 'string' && !item._id.startsWith('drafts.')) {
                    publishedById.set(item._id, item)
                  }
                }

                for (const entry of activeSlotChallengeRefs) {
                  const remote = publishedById.get(entry.baseRef)
                  if (!remote) {
                    issues.push({
                      message: `Referenced Challenge "${entry.baseRef}" was not found in the published Sanity perspective. Publish and review it before approving, finalizing, or scheduling this month.`,
                      path: ['slots', entry.index, 'challenge'],
                    })
                  } else {
                    if (remote.adaptationReviewed !== true) {
                      issues.push({
                        message: `Referenced Challenge "${entry.baseRef}" has not completed editorial adaptation review in its published document.`,
                        path: ['slots', entry.index, 'challenge'],
                      })
                    }
                    if (typeof remote.unapprovedBlockCount !== 'number' || remote.unapprovedBlockCount > 0) {
                      issues.push({
                        message: `Referenced Challenge "${entry.baseRef}" contains unapproved structured editorial blocks in its published document.`,
                        path: ['slots', entry.index, 'challenge'],
                      })
                    }
                    if (remote.withdrawn === true) {
                      issues.push({
                        message: `Referenced Challenge "${entry.baseRef}" is marked withdrawn in its published document; replace it or withdraw its slot in an amendment.`,
                        path: ['slots', entry.index, 'challenge'],
                      })
                    }
                  }
                }
              }
            } catch {
              issues.push({
                message: 'Fail-closed: Unable to reach Sanity (published perspective) to verify referenced published Challenges and cross-month assignments.',
                path: ['rosterFinalization'],
              })
            }
          }
        }
      } else if (slotAssignedIds.length > 0 && baseClient && typeof baseClient.fetch === 'function') {
        // Non-blocking best-effort collision detection during draft editing
        const draftReadClient =
          typeof baseClient.withConfig === 'function'
            ? baseClient.withConfig({perspective: 'published'})
            : baseClient
        const selfBase = typeof doc._id === 'string'
          ? stripDraftPrefix(doc._id)
          : (doc.yearMonth ? `month-${String(doc.yearMonth)}` : '')
        try {
          const otherMonths = await draftReadClient.fetch<RemoteOtherMonthProjection[]>(
            `*[_type == "monthlyPublication" && !(_id in [$baseId, $draftId]) && !(_id in path("drafts.**")) && defined(slots)]{
              _id,
              yearMonth,
              "challengeRefs": slots[defined(challenge._ref)].challenge._ref
            }`,
            {baseId: selfBase, draftId: `drafts.${selfBase}`},
          )
          if (Array.isArray(otherMonths)) {
            for (const other of otherMonths) {
              const refs = Array.isArray(other?.challengeRefs) ? other.challengeRefs : []
              for (const otherRef of refs) {
                if (typeof otherRef !== 'string') continue
                const normalizedOtherRef = stripDraftPrefix(otherRef)
                const conflictSlotIdx = seenChallengeIndices.get(normalizedOtherRef)
                if (conflictSlotIdx !== undefined) {
                  issues.push({
                    message: `Challenge "${normalizedOtherRef}" is already assigned to another monthly publication (${other.yearMonth || other._id}).`,
                    path: ['slots', conflictSlotIdx, 'challenge'],
                  })
                }
              }
            }
          }
        } catch {
          // Offline draft editing does not deadlock on network unavailability; gated boundaries still fail closed.
        }
      }

      return issues.length > 0 ? issues : true
    }),
  orderings: [
    {title: 'Publication month, newest first', name: 'yearMonthDesc', by: [{field: 'yearMonth', direction: 'desc'}]},
    {title: 'Publication month, oldest first', name: 'yearMonthAsc', by: [{field: 'yearMonth', direction: 'asc'}]},
  ],
  preview: {
    select: {
      title: 'title',
      yearMonth: 'yearMonth',
      editorialStatus: 'editorialStatus',
      withdrawn: 'withdrawn',
      media: 'coverImage',
    },
    prepare({title, yearMonth, editorialStatus, withdrawn, media}) {
      return {
        title: `${yearMonth || 'YYYY-MM'} · ${title || 'Untitled month'}`,
        subtitle: `${editorialStatus || 'draft'}${withdrawn ? ' · WITHDRAWN' : ''}`,
        media,
      }
    },
  },
})
