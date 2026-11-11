import {defineArrayMember, defineField, defineType} from 'sanity'
import {
  ALLOWED_CARD_CATEGORIES,
  ALLOWED_CARD_EDITORIAL_STATUSES,
  ALLOWED_REVIEWER_ROLES,
  ASSET_REVISION_PATTERN,
  CARD_ID_PATTERN,
  deterministicCardIdFromSlug,
  parseYearMonth,
  SLUG_TOKEN_PATTERN,
  stripDraftPrefix,
  YEAR_MONTH_PATTERN,
} from '../monthlyHelpers'

type ValidationIssue = {message: string; path: (string | number)[]}

type ScriptureCardValue = {
  _id?: unknown
  title?: unknown
  slug?: {current?: unknown}
  artwork?: {asset?: {_ref?: unknown}}
  assetRevision?: unknown
  illustrationAlt?: unknown
  accessibleTranscription?: unknown
  scriptureCitation?: {
    book?: unknown
    reference?: unknown
    translation?: unknown
    usageRightsConfirmed?: unknown
  }
  rightsAndAttribution?: {
    attribution?: unknown
    rightsStatus?: unknown
    usageRightsConfirmed?: unknown
  }
  cardCategory?: unknown
  plannedYearMonth?: unknown
  editorialStatus?: unknown
  editorialReview?: {
    reviewedBy?: unknown
    reviewerRole?: unknown
    reviewedAt?: unknown
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function validateUniqueNonEmptyStringArray(value: unknown, label: string): true | string {
  if (value === undefined || value === null) return true
  if (!Array.isArray(value)) return `${label} must be a list of text entries.`
  const seen = new Set<string>()
  for (const item of value) {
    if (!isNonEmptyString(item)) {
      return `${label} cannot contain empty entries.`
    }
    const normalized = item.trim().toLowerCase()
    if (seen.has(normalized)) {
      return `${label} cannot contain duplicate entries ("${item.trim()}").`
    }
    seen.add(normalized)
  }
  return true
}

export const scriptureCard = defineType({
  name: 'scriptureCard',
  title: 'Scripture Card',
  type: 'document',
  description:
    'Standalone finished illustrated Scripture Card artifact with accessibility transcription, Scripture citation, rights metadata, and organizational placement. Earning rules always live on the parent month, Foundation, or Special Experience.',
  groups: [
    {name: 'card', title: 'Card & artwork', default: true},
    {name: 'accessibility', title: 'Accessibility & text'},
    {name: 'metadata', title: 'Scripture, themes & rights'},
    {name: 'placement', title: 'Collection placement'},
    {name: 'review', title: 'Editorial review & status'},
  ],
  fields: [
    defineField({
      name: 'title',
      title: 'Public Card title',
      type: 'string',
      group: 'card',
      description: 'Reader-facing Scripture Card title shown in the Field Notebook and earned-card viewer.',
      validation: Rule =>
        Rule.required().custom(value =>
          isNonEmptyString(value) ? true : 'Provide a non-empty public Card title.',
        ),
    }),
    defineField({
      name: 'internalTitle',
      title: 'Internal editorial title',
      type: 'string',
      group: 'card',
      description: 'Optional Studio-only working label when editors want a separate internal reference title.',
    }),
    defineField({
      name: 'slug',
      title: 'Immutable Card slug',
      type: 'slug',
      group: 'card',
      options: {source: 'title', maxLength: 96},
      description:
        'Lowercase hyphenated identifier (for example, 2027-03-vineyard-imagery). Document _id must match card-<slug>. Do not change after awards or monthly links exist.',
      validation: Rule =>
        Rule.required().custom(value => {
          const current = (value as {current?: unknown} | undefined)?.current
          if (typeof current !== 'string' || !SLUG_TOKEN_PATTERN.test(current)) {
            return 'Slug must be a lowercase hyphenated token (for example, 2027-03-vineyard-imagery).'
          }
          return true
        }),
    }),
    defineField({
      name: 'artwork',
      title: 'Finished illustrated Card graphic',
      type: 'image',
      group: 'card',
      options: {hotspot: false},
      description:
        'Primary editorial artifact containing the illustration and baked-in biblical text/explanation. Do not recreate a second visual layout in separate fields.',
      validation: Rule =>
        Rule.required().custom(value => {
          const ref = (value as {asset?: {_ref?: unknown}} | undefined)?.asset?._ref
          if (!isNonEmptyString(ref)) {
            return 'Upload or reference a finished illustrated Card image asset.'
          }
          return true
        }),
    }),
    defineField({
      name: 'assetRevision',
      title: 'Asset revision / version',
      type: 'string',
      group: 'card',
      initialValue: 'v1',
      description:
        'Editorial revision token for the finished graphic (for example, v1 or 2027-03-r1). Increment whenever replacing the artwork asset.',
      validation: Rule =>
        Rule.required().regex(ASSET_REVISION_PATTERN, {
          name: 'asset revision token',
        }),
    }),
    defineField({
      name: 'illustrationAlt',
      title: 'Illustration alt text',
      type: 'text',
      rows: 2,
      group: 'accessibility',
      description:
        'Concise visual description of the illustration/artwork only for screen readers. Keep separate from the embedded biblical text and explanation below.',
      validation: Rule =>
        Rule.required().custom(value =>
          isNonEmptyString(value)
            ? true
            : 'Illustration alt text is required; an image alone is insufficient for accessibility.',
        ),
    }),
    defineField({
      name: 'accessibleTranscription',
      title: 'Accessible transcription / equivalent',
      type: 'text',
      rows: 6,
      group: 'accessibility',
      description:
        'Complete accessible equivalent of all meaningful biblical text, references, and explanation embedded in the finished graphic. Required for screen readers and eligible earned-card search; does not render a second visual layout.',
      validation: Rule =>
        Rule.required().custom(value =>
          isNonEmptyString(value)
            ? true
            : 'Accessible transcription of the embedded biblical text/explanation is required.',
        ),
    }),
    defineField({
      name: 'scriptureCitation',
      title: 'Scripture citation & translation rights',
      type: 'object',
      group: 'metadata',
      description:
        'Bible book, passage reference, translation, and quotation rights confirmation. Do not fabricate Scripture passages or unverified rights.',
      fields: [
        defineField({
          name: 'book',
          title: 'Bible book',
          type: 'string',
          description: 'Primary Bible book for Field Notebook search (for example, John or Psalms).',
          validation: Rule =>
            Rule.required().custom(value =>
              isNonEmptyString(value) ? true : 'Provide the primary Bible book.',
            ),
        }),
        defineField({
          name: 'reference',
          title: 'Scripture passage reference',
          type: 'string',
          description: 'For example, John 15:1–8.',
          validation: Rule =>
            Rule.required().custom(value =>
              isNonEmptyString(value) ? true : 'Provide the Scripture passage reference.',
            ),
        }),
        defineField({
          name: 'translation',
          title: 'Translation or edition',
          type: 'string',
          description: 'For example, WEBP, or "Not configured" for reference-only synthetic test fixtures.',
          validation: Rule =>
            Rule.required().custom(value =>
              isNonEmptyString(value) ? true : 'Specify the Bible translation or "Not configured".',
            ),
        }),
        defineField({
          name: 'usageRightsConfirmed',
          title: 'Scripture translation usage rights confirmed',
          type: 'boolean',
          initialValue: false,
          description:
            'Must be true whenever a specific Bible translation/text (other than "Not configured") is quoted in the Card graphic or accessible transcription.',
        }),
      ],
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'theologicalThemes',
      title: 'Curated theological themes / motifs',
      type: 'array',
      group: 'metadata',
      description:
        'Optional editorially curated themes grounded in the teaching. Kept free-form rather than imposing a rigid global taxonomy.',
      of: [defineArrayMember({type: 'string'})],
      validation: Rule =>
        Rule.custom(value => validateUniqueNonEmptyStringArray(value, 'Theological themes')),
    }),
    defineField({
      name: 'keywords',
      title: 'Topical search keywords',
      type: 'array',
      group: 'metadata',
      description: 'Optional search keywords for eligible earned-card discovery in the Field Notebook.',
      of: [defineArrayMember({type: 'string'})],
      validation: Rule =>
        Rule.custom(value => validateUniqueNonEmptyStringArray(value, 'Search keywords')),
    }),
    defineField({
      name: 'rightsAndAttribution',
      title: 'Artwork rights & attribution',
      type: 'object',
      group: 'metadata',
      description:
        'Explicit artwork attribution and rights clearance. Never make fictitious intellectual-property claims.',
      fields: [
        defineField({
          name: 'attribution',
          title: 'Attribution / credit',
          type: 'string',
          description: 'Creator or source credit (or explicit synthetic QA attribution for test fixtures).',
          validation: Rule =>
            Rule.required().custom(value =>
              isNonEmptyString(value) ? true : 'Record artwork attribution / credit.',
            ),
        }),
        defineField({
          name: 'rightsStatus',
          title: 'Rights / license statement',
          type: 'string',
          description: 'Clear ownership or license basis (for example, Ministry-owned original illustration).',
          validation: Rule =>
            Rule.required().custom(value =>
              isNonEmptyString(value) ? true : 'Record the artwork rights or license statement.',
            ),
        }),
        defineField({
          name: 'usageRightsConfirmed',
          title: 'Artwork usage rights confirmed',
          type: 'boolean',
          initialValue: false,
          description: 'Required before publishing or linking: confirms display and earned-card export rights.',
          validation: Rule =>
            Rule.required().custom(value =>
              value === true
                ? true
                : 'Confirm artwork usage rights before publishing or linking this Card.',
            ),
        }),
      ],
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'cardCategory',
      title: 'Collection / card category',
      type: 'string',
      group: 'placement',
      description:
        'Organizational placement metadata only. Monthly thematic/full-month earning rules always live on monthlyPublication, never on the Card.',
      options: {
        list: [
          {title: 'Monthly thematic discovery', value: 'monthlyThematic'},
          {title: 'Monthly full-month completion', value: 'monthlyFull'},
          {title: 'Foundation teaching', value: 'foundation'},
          {title: 'Ministry tutorial', value: 'tutorial'},
          {title: 'Special Experience (time-limited)', value: 'specialExperience'},
        ],
        layout: 'radio',
      },
      validation: Rule =>
        Rule.required().custom(value =>
          typeof value === 'string' &&
          (ALLOWED_CARD_CATEGORIES as readonly string[]).includes(value)
            ? true
            : 'Select a valid card category.',
        ),
    }),
    defineField({
      name: 'plannedYearMonth',
      title: 'Planned publication month (YYYY-MM)',
      type: 'string',
      group: 'placement',
      description:
        'Optional publication-month filing metadata (for example, 2027-03). Must match the linking monthlyPublication when specified; does not independently define award rules.',
      validation: Rule =>
        Rule.custom(value => {
          if (value === undefined || value === null || value === '') return true
          if (typeof value !== 'string' || !YEAR_MONTH_PATTERN.test(value)) {
            return 'Planned publication month must use YYYY-MM format (for example, 2027-03).'
          }
          const parsed = parseYearMonth(value)
          if (!parsed || parsed.year < 2026 || parsed.year > 2100) {
            return 'Planned publication month must be between 2026-01 and 2100-12.'
          }
          return true
        }),
    }),
    defineField({
      name: 'plannedCollection',
      title: 'Planned collection or context note',
      type: 'string',
      group: 'placement',
      description:
        'Optional informational placement metadata for non-monthly collections (such as Foundations or an approved Special Experience).',
    }),
    defineField({
      name: 'sortOrder',
      title: 'Planned sort order',
      type: 'number',
      group: 'placement',
      description:
        'Optional positive integer controlling relative display order within a planned collection or month (full-month Cards always appear last on the Month Screen).',
      validation: Rule => Rule.integer().min(1),
    }),
    defineField({
      name: 'shareEligible',
      title: 'Eligible for earned-card sharing',
      type: 'boolean',
      group: 'placement',
      initialValue: true,
      description:
        'Optional policy flag indicating whether readers who have earned this Card may share/export the original graphic (with app-applied attribution).',
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
          {title: 'Approved (ready to link)', value: 'approved'},
        ],
        layout: 'radio',
      },
      initialValue: 'draft',
      validation: Rule =>
        Rule.required().custom(value =>
          typeof value === 'string' &&
          (ALLOWED_CARD_EDITORIAL_STATUSES as readonly string[]).includes(value)
            ? true
            : 'Editorial status must be draft, inReview, or approved.',
        ),
    }),
    defineField({
      name: 'withdrawn',
      title: 'Withdrawn',
      type: 'boolean',
      group: 'review',
      initialValue: false,
      description:
        'Emergency suppression flag. Prevents new monthly linking/delivery without deleting previously earned reader records.',
    }),
    defineField({
      name: 'editorialReview',
      title: 'Editorial review',
      type: 'monthlyEditorialReview',
      group: 'review',
      description:
        'Truthful review attribution. Technical synthetic fixtures must use technical_synthetic rather than claiming Alexis theological approval.',
    }),
  ],
  validation: Rule =>
    Rule.custom(value => {
      const doc = value as ScriptureCardValue | undefined
      if (!doc) return true

      const issues: ValidationIssue[] = []

      // 1. Deterministic _id === card-<slug>
      const rawId = typeof doc._id === 'string' ? doc._id : ''
      const baseId = stripDraftPrefix(rawId)
      const slugCurrent =
        typeof doc.slug?.current === 'string' ? doc.slug.current.trim() : ''

      if (!rawId || !CARD_ID_PATTERN.test(baseId)) {
        issues.push({
          message:
            'Scripture Card _id must follow deterministic card-<slug> (or drafts.card-<slug>) using lowercase hyphenated characters.',
          path: ['_id'],
        })
      } else if (SLUG_TOKEN_PATTERN.test(slugCurrent)) {
        const expectedBaseId = deterministicCardIdFromSlug(slugCurrent)
        if (baseId !== expectedBaseId) {
          issues.push({
            message: `Document _id must be "${expectedBaseId}" or "drafts.${expectedBaseId}" to match slug "${slugCurrent}".`,
            path: ['_id'],
          })
        }
      }

      // 2. Asset and accessibility pairing (image alone is insufficient; alt and transcription must be distinct)
      if (!isNonEmptyString(doc.artwork?.asset?._ref)) {
        issues.push({
          message: 'A finished illustrated Card image asset is required.',
          path: ['artwork'],
        })
      }
      if (
        isNonEmptyString(doc.illustrationAlt) &&
        isNonEmptyString(doc.accessibleTranscription) &&
        doc.illustrationAlt.trim().toLowerCase() === doc.accessibleTranscription.trim().toLowerCase()
      ) {
        issues.push({
          message:
            'Accessible transcription must capture the embedded biblical text/explanation separately from the illustration alt text.',
          path: ['accessibleTranscription'],
        })
      }

      // 3. Scripture translation & artwork rights confirmation
      const translation = doc.scriptureCitation?.translation
      if (
        isNonEmptyString(translation) &&
        translation.trim().toLowerCase() !== 'not configured' &&
        doc.scriptureCitation?.usageRightsConfirmed !== true
      ) {
        issues.push({
          message:
            'Confirm Scripture translation usage rights when a Bible translation is specified (or set translation to "Not configured" for reference-only synthetic fixtures).',
          path: ['scriptureCitation', 'usageRightsConfirmed'],
        })
      }

      if (doc.rightsAndAttribution?.usageRightsConfirmed !== true) {
        issues.push({
          message: 'Confirm artwork usage rights before publishing or linking this Card.',
          path: ['rightsAndAttribution', 'usageRightsConfirmed'],
        })
      }

      // 4. Truthful editorial review gate
      const role = doc.editorialReview?.reviewerRole
      if (
        role !== undefined &&
        role !== null &&
        (typeof role !== 'string' ||
          !(ALLOWED_REVIEWER_ROLES as readonly string[]).includes(role))
      ) {
        issues.push({
          message: 'Reviewer role must be theological_editorial or technical_synthetic.',
          path: ['editorialReview', 'reviewerRole'],
        })
      }

      if (doc.editorialStatus === 'approved') {
        if (!isNonEmptyString(doc.editorialReview?.reviewedBy)) {
          issues.push({
            message: 'Record reviewedBy on editorial review before marking this Card approved.',
            path: ['editorialReview', 'reviewedBy'],
          })
        }
        if (
          typeof role !== 'string' ||
          !(ALLOWED_REVIEWER_ROLES as readonly string[]).includes(role)
        ) {
          issues.push({
            message:
              'Select a valid reviewerRole (theological_editorial or technical_synthetic) before marking this Card approved.',
            path: ['editorialReview', 'reviewerRole'],
          })
        }
        if (
          typeof doc.editorialReview?.reviewedAt !== 'string' ||
          !Number.isFinite(Date.parse(doc.editorialReview.reviewedAt))
        ) {
          issues.push({
            message: 'Record a valid reviewedAt timestamp before marking this Card approved.',
            path: ['editorialReview', 'reviewedAt'],
          })
        }
      }

      return issues.length > 0 ? issues : true
    }),
  orderings: [
    {
      title: 'Planned month, newest first',
      name: 'plannedMonthDesc',
      by: [
        {field: 'plannedYearMonth', direction: 'desc'},
        {field: 'sortOrder', direction: 'asc'},
      ],
    },
    {
      title: 'Title A–Z',
      name: 'titleAsc',
      by: [{field: 'title', direction: 'asc'}],
    },
  ],
  preview: {
    select: {
      title: 'title',
      internalTitle: 'internalTitle',
      cardCategory: 'cardCategory',
      plannedYearMonth: 'plannedYearMonth',
      editorialStatus: 'editorialStatus',
      withdrawn: 'withdrawn',
      media: 'artwork',
    },
    prepare({title, internalTitle, cardCategory, plannedYearMonth, editorialStatus, withdrawn, media}) {
      const displayTitle =
        (typeof title === 'string' && title.trim()) ||
        (typeof internalTitle === 'string' && internalTitle.trim()) ||
        'Untitled Scripture Card'
      const subtitleParts = [
        typeof cardCategory === 'string' && cardCategory ? cardCategory : 'uncategorized',
        typeof plannedYearMonth === 'string' && plannedYearMonth ? plannedYearMonth : null,
        typeof editorialStatus === 'string' && editorialStatus ? editorialStatus : 'draft',
        withdrawn ? 'WITHDRAWN' : null,
      ].filter(Boolean)
      return {
        title: displayTitle,
        subtitle: subtitleParts.join(' · '),
        media,
      }
    },
  },
})
