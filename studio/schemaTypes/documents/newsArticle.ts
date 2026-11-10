import {defineField, defineType} from 'sanity'
import {portableTextField} from '../fields'
import {
  ALLOWED_REVIEWER_ROLES,
  computeAdvancePreviewStartDate,
  isValidCivilDate,
  parseYearMonth,
  stripDraftPrefix,
} from '../monthlyHelpers'

type ValidationIssue = {message: string; path: (string | number)[]}

type NewsArticleValue = {
  _id?: unknown
  category?: unknown
  publishOnDate?: unknown
  relatedMonth?: {_ref?: unknown}
  coverImage?: {asset?: unknown; alt?: unknown}
  editorialReview?: {
    reviewedBy?: unknown
    reviewerRole?: unknown
    reviewedAt?: unknown
  }
}

export const newsArticle = defineType({
  name: 'newsArticle',
  title: 'Ministry news article',
  type: 'document',
  groups: [
    {name: 'content', title: 'Article content', default: true},
    {name: 'publishing', title: 'Schedule & related month'},
    {name: 'review', title: 'Editorial review'},
    {name: 'snapshot', title: 'Generated snapshot'},
  ],
  fields: [
    defineField({
      name: 'title',
      title: 'Headline',
      type: 'string',
      group: 'content',
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Stable immutable slug',
      type: 'slug',
      group: 'publishing',
      options: {source: 'title', maxLength: 96},
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'category',
      title: 'Category',
      type: 'string',
      group: 'publishing',
      options: {
        list: [
          {title: 'Monthly advance preview', value: 'monthlyPreview'},
          {title: 'Ministry update', value: 'ministryUpdate'},
          {title: 'Announcement', value: 'announcement'},
        ],
        layout: 'radio',
      },
      initialValue: 'monthlyPreview',
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'summary',
      title: 'Summary',
      type: 'text',
      rows: 3,
      group: 'content',
      validation: Rule => Rule.required(),
    }),
    defineField({
      ...portableTextField('body', 'Article body'),
      group: 'content',
    }),
    defineField({
      name: 'coverImage',
      title: 'Optional cover image',
      type: 'image',
      group: 'content',
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
      name: 'publishOnDate',
      title: 'Publish on civil date (YYYY-MM-DD)',
      type: 'date',
      group: 'publishing',
      description:
        'For monthlyPreview, defaults to Feb 27 (preceding March) or the 28th of the preceding month. Never earlier than the target month preview start date.',
      validation: Rule =>
        Rule.required().custom(value => {
          if (typeof value !== 'string' || !isValidCivilDate(value)) {
            return 'Provide a valid civil calendar date (YYYY-MM-DD).'
          }
          return true
        }),
    }),
    defineField({
      name: 'relatedMonth',
      title: 'Related monthly publication',
      type: 'reference',
      to: [{type: 'monthlyPublication'}],
      weak: true,
      group: 'publishing',
      description:
        'Required for monthlyPreview articles (weak reference prevents circular publish locks with monthlyPublication).',
    }),
    defineField({
      name: 'sourceSnapshot',
      title: 'Source month snapshot',
      type: 'newsSourceSnapshot',
      group: 'snapshot',
      readOnly: true,
    }),
    defineField({
      name: 'editorialReview',
      title: 'Editorial review',
      type: 'monthlyEditorialReview',
      group: 'review',
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'withdrawn',
      title: 'Withdraw article',
      type: 'boolean',
      group: 'publishing',
      initialValue: false,
      description: 'Suppresses reader delivery immediately without deleting historical references.',
    }),
  ],
  validation: Rule =>
    Rule.custom(value => {
      const article = value as NewsArticleValue | undefined
      if (!article) return true
      const issues: ValidationIssue[] = []

      if (article.coverImage?.asset && (typeof article.coverImage.alt !== 'string' || !article.coverImage.alt.trim())) {
        issues.push({
          message: 'Alternative text is required when a cover image is present.',
          path: ['coverImage', 'alt'],
        })
      }

      if (typeof article.editorialReview?.reviewedBy !== 'string' || !article.editorialReview.reviewedBy.trim()) {
        issues.push({
          message: 'Record reviewedBy before publishing a ministry news article.',
          path: ['editorialReview', 'reviewedBy'],
        })
      }
      if (
        typeof article.editorialReview?.reviewerRole !== 'string' ||
        !(ALLOWED_REVIEWER_ROLES as readonly string[]).includes(article.editorialReview.reviewerRole)
      ) {
        issues.push({
          message: 'Select a valid reviewerRole (theological_editorial or technical_synthetic).',
          path: ['editorialReview', 'reviewerRole'],
        })
      }
      if (
        typeof article.editorialReview?.reviewedAt !== 'string' ||
        !Number.isFinite(Date.parse(article.editorialReview.reviewedAt))
      ) {
        issues.push({
          message: 'Record a valid reviewedAt timestamp before publishing a ministry news article.',
          path: ['editorialReview', 'reviewedAt'],
        })
      }

      const rawId = typeof article._id === 'string' ? article._id : ''
      const baseId = stripDraftPrefix(rawId)

      if (article.category === 'monthlyPreview') {
        if (rawId && !/^news-preview-\d{4}-(?:0[1-9]|1[0-2])$/.test(baseId)) {
          issues.push({
            message: 'Monthly preview article _id must follow news-preview-YYYY-MM (or drafts.news-preview-YYYY-MM).',
            path: ['_id'],
          })
        }
        const rawMonthRef = typeof article.relatedMonth?._ref === 'string' ? article.relatedMonth._ref.trim() : ''
        if (!rawMonthRef) {
          issues.push({
            message: 'Monthly advance preview articles must link to a relatedMonth document (month-YYYY-MM).',
            path: ['relatedMonth'],
          })
        } else {
          const monthBaseId = stripDraftPrefix(rawMonthRef)
          const match = /^month-(\d{4}-(?:0[1-9]|1[0-2]))$/.exec(monthBaseId)
          if (!match) {
            issues.push({
              message: `relatedMonth reference "${rawMonthRef}" must point to a deterministic month-YYYY-MM document.`,
              path: ['relatedMonth'],
            })
          } else {
            const yearMonth = match[1]
            const expectedNewsId = `news-preview-${yearMonth}`
            if (rawId && baseId !== expectedNewsId) {
              issues.push({
                message: `Monthly preview article _id must be "${expectedNewsId}" or "drafts.${expectedNewsId}".`,
                path: ['_id'],
              })
            }

            const parsedYM = parseYearMonth(yearMonth)
            if (
              parsedYM &&
              typeof article.publishOnDate === 'string' &&
              isValidCivilDate(article.publishOnDate)
            ) {
              const minPreviewDate = computeAdvancePreviewStartDate(parsedYM.year, parsedYM.month)
              if (article.publishOnDate < minPreviewDate) {
                issues.push({
                  message: `publishOnDate "${article.publishOnDate}" precedes the allowed advance preview start date "${minPreviewDate}" for ${yearMonth}.`,
                  path: ['publishOnDate'],
                })
              }
            }
          }
        }
      } else if (baseId.startsWith('news-preview-')) {
        issues.push({
          message: 'Documents using news-preview-YYYY-MM identity must have category "monthlyPreview".',
          path: ['category'],
        })
      }

      return issues.length > 0 ? issues : true
    }),
  orderings: [
    {title: 'Publish date, newest first', name: 'publishDateDesc', by: [{field: 'publishOnDate', direction: 'desc'}]},
  ],
  preview: {
    select: {
      title: 'title',
      category: 'category',
      publishOnDate: 'publishOnDate',
      withdrawn: 'withdrawn',
      media: 'coverImage',
    },
    prepare({title, category, publishOnDate, withdrawn, media}) {
      return {
        title: title || 'Untitled news article',
        subtitle: `${category || 'news'}${publishOnDate ? ` · ${publishOnDate}` : ''}${withdrawn ? ' · WITHDRAWN' : ''}`,
        media,
      }
    },
  },
})
