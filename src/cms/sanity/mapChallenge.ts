import { z } from 'zod'
import type {
  CmsBlock,
  CmsChallenge,
  CmsPortableText,
  CmsScripture,
} from './types.ts'

const requiredText = z.string().refine(value => value.trim().length > 0, 'A non-empty value is required.')
const optionalText = z.string().nullish()
const stableKey = requiredText

const explicitInstant = z.string().refine(value => {
  const hasExplicitOffset = /(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  return hasExplicitOffset && Number.isFinite(Date.parse(value))
}, 'A valid date-time with an explicit UTC offset is required.')

const optionalHttpUrl = z.string().nullish().refine(value => {
  if (!value) return true
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}, 'Only valid HTTP(S) URLs are allowed.')

const portableTextSpanSchema = z.looseObject({
  _key: stableKey,
  _type: z.literal('span'),
  text: z.string(),
  marks: z.array(z.string()),
})

const portableTextLinkSchema = z.looseObject({
  _key: stableKey,
  _type: z.literal('link'),
  href: z.string().refine(value => {
    try {
      const url = new URL(value)
      return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
      return false
    }
  }, 'Portable Text links must use HTTP(S).'),
})

const portableTextBlockSchema = z.looseObject({
  _key: stableKey,
  _type: z.literal('block'),
  style: z.enum(['normal', 'h2', 'h3', 'blockquote']),
  children: z.array(portableTextSpanSchema).min(1),
  markDefs: z.array(portableTextLinkSchema),
  listItem: z.enum(['bullet', 'number']).nullish(),
  level: z.number().int().positive().nullish(),
})

const portableTextSchema = z.array(portableTextBlockSchema).min(1)

const scriptureShape = {
  reference: requiredText,
  translation: requiredText,
  textStatus: z.enum(['provided', 'referenceOnly']),
  passage: optionalText,
  usageRightsConfirmed: z.boolean().nullish().transform(value => value ?? false),
  practiceStatus: z.enum(['configured', 'notConfigured']),
}

type ScriptureValidationValue = {
  textStatus: 'provided' | 'referenceOnly'
  passage?: string | null
  usageRightsConfirmed: boolean
  practiceStatus: 'configured' | 'notConfigured'
}

function validateScripture(value: ScriptureValidationValue, ctx: z.RefinementCtx) {
  const hasPassage = Boolean(value.passage?.trim())
  if (value.textStatus === 'provided' && !hasPassage) {
    ctx.addIssue({ code: 'custom', path: ['passage'], message: 'Provided Scripture status requires passage text.' })
  }
  if (value.textStatus === 'referenceOnly' && hasPassage) {
    ctx.addIssue({ code: 'custom', path: ['passage'], message: 'Reference-only Scripture must not contain passage text.' })
  }
  if (hasPassage && !value.usageRightsConfirmed) {
    ctx.addIssue({ code: 'custom', path: ['usageRightsConfirmed'], message: 'Passage text requires confirmed app usage rights.' })
  }
  if (value.practiceStatus === 'configured' && (value.textStatus !== 'provided' || !hasPassage)) {
    ctx.addIssue({ code: 'custom', path: ['practiceStatus'], message: 'Memorization requires provided passage text.' })
  }
}

const scriptureSchema = z.object(scriptureShape).superRefine(validateScripture)
const keyedScriptureSchema = z.object({
  ...scriptureShape,
  _key: stableKey,
  _type: z.literal('scriptureReference'),
}).superRefine(validateScripture)

const comparisonSideSchema = z.object({
  title: requiredText,
  body: portableTextSchema,
})

const blockSchema = z.discriminatedUnion('_type', [
  z.object({
    _key: stableKey,
    _type: z.literal('scriptureBlock'),
    scripture: scriptureSchema,
  }),
  z.object({
    _key: stableKey,
    _type: z.literal('richTextBlock'),
    body: portableTextSchema,
  }),
  z.object({
    _key: stableKey,
    _type: z.literal('statementBlock'),
    text: requiredText,
    label: optionalText,
  }),
  z.object({
    _key: stableKey,
    _type: z.literal('comparisonBlock'),
    left: comparisonSideSchema,
    right: comparisonSideSchema,
    footer: optionalText,
    reviewStatus: z.literal('approved'),
  }),
  z.object({
    _key: stableKey,
    _type: z.literal('visualCardsBlock'),
    cards: z.array(z.object({
      _key: stableKey,
      _type: z.literal('visualCard'),
      title: requiredText,
      body: optionalText,
    })).min(1),
    reviewStatus: z.literal('approved'),
  }),
  z.object({
    _key: stableKey,
    _type: z.literal('connectedSequenceBlock'),
    steps: z.array(z.object({
      _key: stableKey,
      _type: z.literal('sequenceStep'),
      title: requiredText,
      body: requiredText,
    })).min(2),
    cycle: z.boolean().nullish(),
    returnCaption: optionalText,
    conclusion: optionalText,
    reviewStatus: z.literal('approved'),
  }),
  z.object({
    _key: stableKey,
    _type: z.literal('reflectionBlock'),
    question: requiredText,
    choices: z.array(z.object({
      _key: stableKey,
      _type: z.literal('reflectionChoice'),
      label: requiredText,
      prompt: requiredText,
    })).min(2).nullish(),
    closing: optionalText,
    reviewStatus: z.literal('approved'),
  }),
  z.object({
    _key: stableKey,
    _type: z.literal('optionalStudyBlock'),
    title: requiredText,
    body: portableTextSchema,
    scriptures: z.array(keyedScriptureSchema).nullish(),
    reviewStatus: z.literal('approved'),
  }),
  z.object({
    _key: stableKey,
    _type: z.literal('prayerBlock'),
    paragraphs: z.array(requiredText).min(1),
  }),
])

const screenSchema = z.object({
  _key: stableKey,
  _type: z.literal('challengeScreen'),
  screenLabel: optionalText,
  heading: optionalText,
  blocks: z.array(blockSchema).min(1),
})

const companionLinkSchema = z.object({
  _key: stableKey,
  _type: z.literal('companionLink'),
  provider: z.enum(['social', 'patreon', 'podcast', 'walkingReel', 'youtube', 'other']),
  label: requiredText,
  description: optionalText,
  url: optionalHttpUrl,
  availability: optionalText,
})

function rejectDuplicateSiblingKeys(
  values: readonly { _key: string }[] | null | undefined,
  path: (string | number)[],
  ctx: z.RefinementCtx,
) {
  const seen = new Set<string>()
  values?.forEach((value, index) => {
    if (seen.has(value._key)) {
      ctx.addIssue({
        code: 'custom',
        path: [...path, index, '_key'],
        message: 'Duplicate sibling Sanity _key values are not allowed.',
      })
    }
    seen.add(value._key)
  })
}

const isoCalendarDate = z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/, 'A valid ISO calendar date YYYY-MM-DD is required.')
const yearMonthPattern = /^\d{4}-(?:0[1-9]|1[0-2])$/

const calendarSlotSchema = z.object({
  monthId: z.string().regex(yearMonthPattern, 'monthId must be in YYYY-MM format.'),
  documentId: optionalText,
  monthTitle: optionalText,
  publicationDate: isoCalendarDate,
  dayOfMonth: z.number().int().min(1).max(31),
}).superRefine((slot, ctx) => {
  const parts = slot.publicationDate.split('-')
  const expectedYearMonth = `${parts[0]}-${parts[1]}`
  if (slot.monthId !== expectedYearMonth) {
    ctx.addIssue({
      code: 'custom',
      path: ['monthId'],
      message: `monthId (${slot.monthId}) must match publicationDate year-month (${expectedYearMonth}).`,
    })
  }

  if (slot.documentId?.trim()) {
    const expectedDocumentId = `month-${expectedYearMonth}`
    if (slot.documentId.trim() !== expectedDocumentId) {
      ctx.addIssue({
        code: 'custom',
        path: ['documentId'],
        message: `documentId (${slot.documentId}) must match deterministic pattern (${expectedDocumentId}).`,
      })
    }
  }

  const year = parseInt(parts[0], 10)
  const month = parseInt(parts[1], 10)
  const day = parseInt(parts[2], 10)
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (day > daysInMonth) {
    ctx.addIssue({
      code: 'custom',
      path: ['publicationDate'],
      message: `Invalid calendar date ${slot.publicationDate}: month ${month} has only ${daysInMonth} days.`,
    })
  }
  if (slot.dayOfMonth !== day) {
    ctx.addIssue({
      code: 'custom',
      path: ['dayOfMonth'],
      message: `dayOfMonth (${slot.dayOfMonth}) must match publicationDate day (${day}).`,
    })
  }
})

const seriesRefSchema = z.object({
  _id: stableKey,
  title: requiredText,
  slug: stableKey,
})

const sequenceSchema = z.number().int().positive()

const challengeDocumentSchema = z.object({
  _id: stableKey,
  _type: z.literal('challenge'),
  title: requiredText,
  slug: stableKey,
  challengeType: z.enum(['teaching', 'discipline', 'reflection', 'memorization']),
  series: seriesRefSchema.nullish(),
  sequence: sequenceSchema.nullish(),
  releaseAt: explicitInstant.nullish(),
  calendarSlot: calendarSlotSchema.nullish(),
  summary: optionalText,
  primaryScripture: scriptureSchema,
  screens: z.array(screenSchema).min(1),
  companionLinks: z.array(companionLinkSchema).nullish(),
  editorialEligibility: z.object({
    adaptationReviewed: z.literal(true),
    reviewedAt: explicitInstant,
  }),
}).superRefine((document, ctx) => {
  if (!document.releaseAt && !document.calendarSlot) {
    ctx.addIssue({
      code: 'custom',
      path: ['releaseAt'],
      message: 'Challenge requires either a releaseAt timestamp or a calendarSlot.',
    })
  }

  rejectDuplicateSiblingKeys(document.screens, ['screens'], ctx)
  rejectDuplicateSiblingKeys(document.companionLinks, ['companionLinks'], ctx)

  document.screens.forEach((screen, screenIndex) => {
    rejectDuplicateSiblingKeys(screen.blocks, ['screens', screenIndex, 'blocks'], ctx)

    screen.blocks.forEach((block, blockIndex) => {
      const blockPath = ['screens', screenIndex, 'blocks', blockIndex]
      switch (block._type) {
        case 'visualCardsBlock':
          rejectDuplicateSiblingKeys(block.cards, [...blockPath, 'cards'], ctx)
          break
        case 'connectedSequenceBlock':
          rejectDuplicateSiblingKeys(block.steps, [...blockPath, 'steps'], ctx)
          if (block.cycle && !block.returnCaption?.trim()) {
            ctx.addIssue({
              code: 'custom',
              path: [...blockPath, 'returnCaption'],
              message: 'A cyclic sequence requires a return caption.',
            })
          }
          break
        case 'reflectionBlock':
          rejectDuplicateSiblingKeys(block.choices, [...blockPath, 'choices'], ctx)
          break
        case 'optionalStudyBlock':
          rejectDuplicateSiblingKeys(block.scriptures, [...blockPath, 'scriptures'], ctx)
          break
      }
    })
  })
})

type RawBlock = z.infer<typeof blockSchema>
type RawScripture = z.infer<typeof scriptureSchema>

export type ChallengeMappingIssue = {
  path: string
  message: string
}

export type ChallengeMappingFailure = {
  documentId?: string
  issues: ChallengeMappingIssue[]
}

export type ChallengeMappingResult =
  | { ok: true; challenge: CmsChallenge }
  | { ok: false; failure: ChallengeMappingFailure }

export type ChallengeBatchMappingResult =
  | { ok: true; challenges: CmsChallenge[] }
  | { ok: false; failures: ChallengeMappingFailure[] }

function mapScripture(value: RawScripture, id: string): CmsScripture {
  return {
    id,
    reference: value.reference,
    translation: value.translation,
    passage: value.passage ?? undefined,
    textStatus: value.textStatus,
    practiceStatus: value.practiceStatus,
    usageRightsConfirmed: value.usageRightsConfirmed,
  }
}

function mapBlock(block: RawBlock): CmsBlock {
  const id = block._key
  switch (block._type) {
    case 'scriptureBlock':
      return {
        id,
        type: 'scripture',
        requiredForCompletion: true,
        scripture: mapScripture(block.scripture, `${id}:scripture`),
      }
    case 'richTextBlock':
      return { id, type: 'teachingText', requiredForCompletion: true, body: block.body as CmsPortableText }
    case 'statementBlock':
      return {
        id,
        type: 'statement',
        requiredForCompletion: true,
        text: block.text,
        label: block.label ?? undefined,
      }
    case 'comparisonBlock':
      return {
        id,
        type: 'contrast',
        requiredForCompletion: true,
        reviewStatus: block.reviewStatus,
        left: { title: block.left.title, body: block.left.body as CmsPortableText },
        right: { title: block.right.title, body: block.right.body as CmsPortableText },
        footer: block.footer ?? undefined,
      }
    case 'visualCardsBlock':
      return {
        id,
        type: 'visualCards',
        requiredForCompletion: true,
        reviewStatus: block.reviewStatus,
        cards: block.cards.map(card => ({ id: card._key, title: card.title, body: card.body ?? undefined })),
      }
    case 'connectedSequenceBlock':
      return {
        id,
        type: 'connectedSequence',
        requiredForCompletion: true,
        reviewStatus: block.reviewStatus,
        steps: block.steps.map(step => ({ id: step._key, title: step.title, body: step.body })),
        cycle: block.cycle ?? false,
        returnCaption: block.returnCaption ?? undefined,
        conclusion: block.conclusion ?? undefined,
      }
    case 'reflectionBlock':
      return {
        id,
        type: 'reflectionChoice',
        requiredForCompletion: false,
        reviewStatus: block.reviewStatus,
        question: block.question,
        choices: (block.choices ?? []).map(choice => ({ id: choice._key, label: choice.label, prompt: choice.prompt })),
        closing: block.closing ?? undefined,
      }
    case 'optionalStudyBlock':
      return {
        id,
        type: 'optionalExploration',
        requiredForCompletion: false,
        reviewStatus: block.reviewStatus,
        title: block.title,
        body: block.body as CmsPortableText,
        scriptures: (block.scriptures ?? []).map(scripture => mapScripture(scripture, scripture._key)),
      }
    case 'prayerBlock':
      return { id, type: 'prayer', requiredForCompletion: true, paragraphs: block.paragraphs }
  }
}

export function mapPublishedChallenge(document: unknown): ChallengeMappingResult {
  const parsed = challengeDocumentSchema.safeParse(document)
  if (!parsed.success) {
    const source = typeof document === 'object' && document !== null && '_id' in document ? document._id : undefined
    return {
      ok: false,
      failure: {
        documentId: typeof source === 'string' ? source : undefined,
        issues: parsed.error.issues.map(issue => ({
          path: issue.path.map(segment => String(segment)).join('.') || 'document',
          message: issue.message,
        })),
      },
    }
  }

  const value = parsed.data
  const series = value.series
    ? {
        documentId: value.series._id,
        id: value.series.slug,
        title: value.series.title,
      }
    : undefined

  const calendarSlot = value.calendarSlot
    ? {
        monthId: value.calendarSlot.monthId,
        ...(value.calendarSlot.documentId ? { documentId: value.calendarSlot.documentId } : {}),
        ...(value.calendarSlot.monthTitle ? { monthTitle: value.calendarSlot.monthTitle } : {}),
        publicationDate: value.calendarSlot.publicationDate,
        dayOfMonth: value.calendarSlot.dayOfMonth,
      }
    : undefined

  return {
    ok: true,
    challenge: {
      id: value.slug,
      documentId: value._id,
      title: value.title,
      challengeType: value.challengeType,
      ...(series ? { series } : {}),
      ...(value.sequence !== null && value.sequence !== undefined ? { sequence: value.sequence } : {}),
      ...(value.releaseAt ? { releaseAt: value.releaseAt, releaseAtUtc: new Date(value.releaseAt).toISOString() } : {}),
      ...(calendarSlot ? { calendarSlot } : {}),
      summary: value.summary ?? undefined,
      primaryScripture: mapScripture(value.primaryScripture, `${value.slug}:primary-scripture`),
      screens: value.screens.map(screen => ({
        id: screen._key,
        stepLabel: screen.screenLabel ?? '',
        title: screen.heading ?? '',
        blocks: screen.blocks.map(mapBlock),
      })),
      companionLinks: (value.companionLinks ?? []).map(link => ({
        id: link._key,
        provider: link.provider,
        label: link.label,
        description: link.description ?? undefined,
        url: link.url ?? undefined,
        availability: link.availability ?? undefined,
        requiredForCompletion: false,
      })),
      editorial: {
        adaptationReviewed: true,
        reviewedAt: value.editorialEligibility.reviewedAt,
      },
    },
  }
}

/** Reject the batch if any document is malformed; do not silently return a partially valid catalog. */
export function mapPublishedChallengeBatch(documents: unknown[]): ChallengeBatchMappingResult {
  const challenges: CmsChallenge[] = []
  const failures: ChallengeMappingFailure[] = []

  documents.forEach(document => {
    const result = mapPublishedChallenge(document)
    if (result.ok) challenges.push(result.challenge)
    else failures.push(result.failure)
  })

  if (failures.length > 0) return { ok: false, failures }
  return { ok: true, challenges }
}
