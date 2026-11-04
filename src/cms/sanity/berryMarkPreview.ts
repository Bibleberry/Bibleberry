import { z } from 'zod'
import type {
  CmsBlock,
  CmsChallengeType,
  CmsCompanionLink,
  CmsPortableText,
  CmsScreen,
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

const previewReviewStatus = z.enum(['approved', 'proposed'])

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
    reviewStatus: previewReviewStatus,
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
    reviewStatus: previewReviewStatus,
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
    reviewStatus: previewReviewStatus,
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
    reviewStatus: previewReviewStatus,
  }),
  z.object({
    _key: stableKey,
    _type: z.literal('optionalStudyBlock'),
    title: requiredText,
    body: portableTextSchema,
    scriptures: z.array(keyedScriptureSchema).nullish(),
    reviewStatus: previewReviewStatus,
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

const sanityCandidateSchema = z.object({
  _type: z.literal('challenge'),
  title: requiredText,
  slug: z.object({
    _type: z.literal('slug'),
    current: stableKey,
  }),
  challengeType: z.enum(['teaching', 'discipline', 'reflection', 'memorization']),
  sequence: z.number().int().positive().nullish(),
  releaseAt: explicitInstant.nullish(),
  summary: optionalText,
  primaryScripture: scriptureSchema,
  screens: z.array(screenSchema).min(1),
  companionLinks: z.array(companionLinkSchema).nullish(),
  editorialReview: z.object({
    _type: z.literal('editorialReview'),
    sourceTitle: requiredText,
    sourceRevision: optionalText,
    adaptationReviewed: z.literal(false),
  }),
}).superRefine((candidate, ctx) => {
  rejectDuplicateSiblingKeys(candidate.screens, ['screens'], ctx)
  rejectDuplicateSiblingKeys(candidate.companionLinks, ['companionLinks'], ctx)

  candidate.screens.forEach((screen, screenIndex) => {
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

const sourceLocationSchema = z.looseObject({
  path: z.string().optional(),
  message: z.string().optional(),
  line: z.number().int().nonnegative().optional(),
  column: z.number().int().nonnegative().optional(),
})

const reviewReportSchema = z.looseObject({
  schemaComplete: z.boolean().nullish(),
  // A local compiler preview is never approved for import or publication.
  // Reject contradictory claims rather than displaying them as trustworthy readiness states.
  importReady: z.literal(false).nullish(),
  publicationReady: z.literal(false).nullish(),
  source: z.looseObject({
    filename: z.string().nullish(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/).nullish(),
    revision: z.string().nullish(),
  }).nullish(),
  authoredMetadata: z.looseObject({
    editorial: z.looseObject({
      approvalStatus: z.string().nullish(),
    }).nullish(),
  }).nullish(),
  unresolved: z.array(sourceLocationSchema).nullish(),
  editorialItems: z.array(z.looseObject({
    kind: z.string().nullish(),
    status: z.string().nullish(),
    text: z.string().nullish(),
    line: z.number().int().nonnegative().nullish(),
  })).nullish(),
})

const compilerResultSchema = z.object({
  ok: z.literal(true),
  mode: z.literal('experimental-pure-sanity-compilation'),
  sanityCandidate: sanityCandidateSchema,
  reviewReport: reviewReportSchema,
  diagnostics: z.array(z.unknown()),
})

type RawBlock = z.infer<typeof blockSchema>
type RawScripture = z.infer<typeof scriptureSchema>
type RawCandidate = z.infer<typeof sanityCandidateSchema>
type RawReviewReport = z.infer<typeof reviewReportSchema>

export type BerryMarkPreviewIssue = {
  path: string
  message: string
}

export type BerryMarkPreviewChallenge = {
  /** Local reader identity derived from the authored slug; this is not a Sanity document ID. */
  id: string
  title: string
  challengeType: CmsChallengeType
  summary?: string
  publishing: {
    seriesTitle: null
    sequence: number | null
    releaseAt: string | null
  }
  primaryScripture: CmsScripture
  screens: CmsScreen[]
  companionLinks: CmsCompanionLink[]
}

export type BerryMarkReviewSummary = {
  source: {
    filename: string | null
    sha256: string | null
    revision: string | null
  }
  sourceTitle: string
  approvalStatus: string
  adaptationReviewed: false
  schemaComplete: boolean | null
  importReady: boolean | null
  publicationReady: boolean | null
  counts: {
    screens: number
    contentBlocks: number
    optionalStudies: number
    nestedScriptures: number
    editorialAnnotations: number
    diagnostics: number
  }
  unresolved: {
    path: string
    message: string
    line?: number
  }[]
  annotations: {
    kind: string
    status: string
    text: string
    line?: number
  }[]
}

export type BerryMarkLocalPreview = {
  challenge: BerryMarkPreviewChallenge
  review: BerryMarkReviewSummary
}

export type BerryMarkPreviewResult =
  | { ok: true; preview: BerryMarkLocalPreview }
  | { ok: false; failure: { issues: BerryMarkPreviewIssue[] } }

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

function mapCandidate(candidate: RawCandidate): BerryMarkPreviewChallenge {
  const slug = candidate.slug.current
  return {
    id: slug,
    title: candidate.title,
    challengeType: candidate.challengeType,
    summary: candidate.summary ?? undefined,
    publishing: {
      seriesTitle: null,
      sequence: candidate.sequence ?? null,
      releaseAt: candidate.releaseAt ?? null,
    },
    primaryScripture: mapScripture(candidate.primaryScripture, `${slug}:primary-scripture`),
    screens: candidate.screens.map((screen): CmsScreen => ({
      id: screen._key,
      stepLabel: screen.screenLabel ?? '',
      title: screen.heading ?? '',
      blocks: screen.blocks.map(mapBlock),
    })),
    companionLinks: (candidate.companionLinks ?? []).map(link => ({
      id: link._key,
      provider: link.provider,
      label: link.label,
      description: link.description ?? undefined,
      url: link.url ?? undefined,
      availability: link.availability ?? undefined,
      requiredForCompletion: false,
    })),
  }
}

function mapReview(
  report: RawReviewReport,
  candidate: RawCandidate,
  challenge: BerryMarkPreviewChallenge,
  diagnosticCount: number,
): BerryMarkReviewSummary {
  const blocks = challenge.screens.flatMap(screen => screen.blocks)
  return {
    source: {
      filename: report.source?.filename ?? null,
      sha256: report.source?.sha256 ?? null,
      revision: report.source?.revision ?? null,
    },
    sourceTitle: candidate.editorialReview.sourceTitle,
    approvalStatus: report.authoredMetadata?.editorial?.approvalStatus ?? 'Not reported',
    adaptationReviewed: candidate.editorialReview.adaptationReviewed,
    schemaComplete: report.schemaComplete ?? null,
    importReady: report.importReady ?? null,
    publicationReady: report.publicationReady ?? null,
    counts: {
      screens: challenge.screens.length,
      contentBlocks: blocks.length,
      optionalStudies: blocks.filter(block => block.type === 'optionalExploration').length,
      nestedScriptures: blocks.reduce((count, block) => count + (block.type === 'optionalExploration' ? block.scriptures.length : 0), 0),
      editorialAnnotations: report.editorialItems?.length ?? 0,
      diagnostics: diagnosticCount,
    },
    unresolved: (report.unresolved ?? []).map(item => ({
      path: item.path ?? 'Path not reported',
      message: item.message ?? 'No unresolved-item message supplied.',
      line: item.line,
    })),
    annotations: (report.editorialItems ?? []).map(item => ({
      kind: item.kind ?? 'Editorial annotation',
      status: item.status ?? 'Not reported',
      text: item.text ?? '',
      line: item.line ?? undefined,
    })),
  }
}

function issuesFromZod(error: z.ZodError): BerryMarkPreviewIssue[] {
  return error.issues.map(issue => ({
    path: issue.path.map(segment => String(segment)).join('.') || 'document',
    message: issue.message,
  }))
}

export function mapBerryMarkCompilerResult(input: unknown): BerryMarkPreviewResult {
  if (typeof input === 'object' && input !== null && 'ok' in input && input.ok !== true) {
    return {
      ok: false,
      failure: {
        issues: [{ path: 'ok', message: 'The compilation was not successful. Only a complete result with ok: true can be previewed.' }],
      },
    }
  }

  const parsed = compilerResultSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, failure: { issues: issuesFromZod(parsed.error) } }
  }

  const challenge = mapCandidate(parsed.data.sanityCandidate)
  return {
    ok: true,
    preview: {
      challenge,
      review: mapReview(
        parsed.data.reviewReport,
        parsed.data.sanityCandidate,
        challenge,
        parsed.data.diagnostics.length,
      ),
    },
  }
}

export function parseBerryMarkCompilerResult(source: string): BerryMarkPreviewResult {
  let input: unknown
  try {
    input = JSON.parse(source)
  } catch (error) {
    return {
      ok: false,
      failure: {
        issues: [{
          path: 'file',
          message: `The selected file is not valid JSON. ${error instanceof Error ? error.message : 'Parsing failed.'}`,
        }],
      },
    }
  }
  return mapBerryMarkCompilerResult(input)
}
