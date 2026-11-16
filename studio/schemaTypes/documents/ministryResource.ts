import {defineArrayMember, defineField, defineType} from 'sanity'
import {SLUG_TOKEN_PATTERN} from '../monthlyHelpers'
import {
  ALLOWED_PRESENTATION_MODES,
  ALLOWED_RESOURCE_EDITORIAL_STATUSES,
  ALLOWED_RESOURCE_KINDS,
  type EditorialReviewShape,
  isNonEmptyString,
  type ResourceValidationIssue,
  validateEditorialReviewGate,
  validateSafeResourceUrl,
  validateUniqueNonEmptyStringArray,
} from '../resourceHelpers'

type MinistryResourceValue = {
  title?: unknown
  slug?: {current?: unknown}
  description?: unknown
  resourceKind?: unknown
  externalUrl?: unknown
  downloadFile?: {asset?: {_ref?: unknown}}
  presentationMode?: unknown
  destinationApproved?: unknown
  lastCheckedAt?: unknown
  accessibility?: {
    summary?: unknown
    coverImage?: {
      asset?: {_ref?: unknown}
      alt?: unknown
    }
  }
  rightsAndAttribution?: {
    attribution?: unknown
    rightsStatus?: unknown
    usageRightsConfirmed?: unknown
  }
  editorialStatus?: unknown
  withdrawn?: unknown
  editorialReview?: EditorialReviewShape
}

export const ministryResource = defineType({
  name: 'ministryResource',
  title: 'Ministry resource',
  type: 'document',
  description:
    'Editorially curated downloadable or external ministry resource with safe destination verification, accessibility metadata, source rights, and truthful review attribution.',
  groups: [
    {name: 'content', title: 'Resource details', default: true},
    {name: 'destination', title: 'Destination & presentation'},
    {name: 'accessibility', title: 'Accessibility & media'},
    {name: 'rights', title: 'Source rights & attribution'},
    {name: 'review', title: 'Editorial review & status'},
  ],
  fields: [
    defineField({
      name: 'title',
      title: 'Resource title',
      type: 'string',
      group: 'content',
      description: 'Meaningful reader-facing title for this ministry resource.',
      validation: Rule =>
        Rule.required().custom(value =>
          isNonEmptyString(value) ? true : 'Provide a non-empty resource title.',
        ),
    }),
    defineField({
      name: 'slug',
      title: 'Stable slug',
      type: 'slug',
      group: 'content',
      options: {source: 'title', maxLength: 96},
      description: 'Lowercase hyphenated identifier (for example, study-guide-psalms).',
      validation: Rule =>
        Rule.required().custom(value => {
          const current = (value as {current?: unknown} | undefined)?.current
          if (typeof current !== 'string' || !SLUG_TOKEN_PATTERN.test(current)) {
            return 'Slug must be a lowercase hyphenated token (for example, study-guide-psalms).'
          }
          return true
        }),
    }),
    defineField({
      name: 'description',
      title: 'Resource description',
      type: 'text',
      rows: 3,
      group: 'content',
      description: 'Concise, meaningful explanation of what this resource offers.',
      validation: Rule =>
        Rule.required().custom(value =>
          isNonEmptyString(value) ? true : 'Provide a non-empty resource description.',
        ),
    }),
    defineField({
      name: 'resourceKind',
      title: 'Destination kind',
      type: 'string',
      group: 'destination',
      options: {
        list: [
          {title: 'External link (https/http)', value: 'externalLink'},
          {title: 'Downloadable file', value: 'downloadableFile'},
        ],
        layout: 'radio',
      },
      initialValue: 'externalLink',
      validation: Rule =>
        Rule.required().custom(value =>
          typeof value === 'string' &&
          (ALLOWED_RESOURCE_KINDS as readonly string[]).includes(value)
            ? true
            : 'Destination kind must be externalLink or downloadableFile.',
        ),
    }),
    defineField({
      name: 'externalUrl',
      title: 'External destination URL',
      type: 'url',
      group: 'destination',
      description: 'Required when Destination kind is External link. Must use https:// or http://.',
      hidden: ({document}) => document?.resourceKind === 'downloadableFile',
      validation: Rule =>
        Rule.custom(value => {
          if (value === undefined || value === null || value === '') return true
          return validateSafeResourceUrl(value)
        }),
    }),
    defineField({
      name: 'downloadFile',
      title: 'Downloadable file asset',
      type: 'file',
      group: 'destination',
      description: 'Required when Destination kind is Downloadable file.',
      hidden: ({document}) => document?.resourceKind === 'externalLink',
    }),
    defineField({
      name: 'presentationMode',
      title: 'In-app presentation mode',
      type: 'string',
      group: 'destination',
      description: 'Controls how the reader app opens an approved destination.',
      options: {
        list: [
          {title: 'In-app viewer / browser', value: 'inApp'},
          {title: 'External browser', value: 'external'},
          {title: 'Direct file download', value: 'download'},
        ],
        layout: 'radio',
      },
      initialValue: 'inApp',
      validation: Rule =>
        Rule.required().custom(value =>
          typeof value === 'string' &&
          (ALLOWED_PRESENTATION_MODES as readonly string[]).includes(value)
            ? true
            : 'Presentation mode must be inApp, external, or download.',
        ),
    }),
    defineField({
      name: 'destinationApproved',
      title: 'Destination safety & suitability approved',
      type: 'boolean',
      group: 'destination',
      initialValue: false,
      description:
        'Confirms that the external URL or downloadable file has been verified safe and appropriate for readers. Required before approval.',
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'lastCheckedAt',
      title: 'Last destination / broken-link check',
      type: 'datetime',
      group: 'destination',
      description: 'Optional timestamp of the most recent editorial link or file verification.',
      validation: Rule =>
        Rule.custom(value => {
          if (value === undefined || value === null || value === '') return true
          if (typeof value === 'string' && Number.isFinite(Date.parse(value))) return true
          return 'Last checked timestamp must be a valid ISO date-time.'
        }),
    }),
    defineField({
      name: 'accessibility',
      title: 'Accessibility metadata',
      type: 'object',
      group: 'accessibility',
      fields: [
        defineField({
          name: 'summary',
          title: 'Accessibility & format note',
          type: 'string',
          description:
            'Describes format and accessibility support (for example, "Tagged PDF with screen-reader text" or "External web article with captions"). Required before approval.',
        }),
        defineField({
          name: 'coverImage',
          title: 'Optional thumbnail image',
          type: 'image',
          options: {hotspot: true},
          fields: [
            defineField({
              name: 'alt',
              title: 'Alternative text',
              type: 'string',
              description: 'Required whenever a thumbnail image is provided.',
            }),
          ],
        }),
      ],
    }),
    defineField({
      name: 'rightsAndAttribution',
      title: 'Source rights & attribution',
      type: 'object',
      group: 'rights',
      description:
        'Explicit creator/publisher attribution and usage rights clearance. Never invent rights or attribution.',
      fields: [
        defineField({
          name: 'attribution',
          title: 'Attribution / source credit',
          type: 'string',
          validation: Rule =>
            Rule.required().custom(value =>
              isNonEmptyString(value) ? true : 'Record resource source attribution or credit.',
            ),
        }),
        defineField({
          name: 'rightsStatus',
          title: 'Rights / permission statement',
          type: 'string',
          validation: Rule =>
            Rule.required().custom(value =>
              isNonEmptyString(value) ? true : 'Record the resource rights or permission statement.',
            ),
        }),
        defineField({
          name: 'usageRightsConfirmed',
          title: 'Source & distribution rights confirmed',
          type: 'boolean',
          initialValue: false,
          description: 'Required before marking this resource approved.',
          validation: Rule => Rule.required(),
        }),
      ],
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'keywords',
      title: 'Optional search keywords',
      type: 'array',
      group: 'content',
      description: 'Optional editorially curated search terms for eligible resource discovery.',
      of: [defineArrayMember({type: 'string'})],
      validation: Rule =>
        Rule.custom(value => validateUniqueNonEmptyStringArray(value, 'Resource keywords')),
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
          {title: 'Approved (eligible for section placement)', value: 'approved'},
        ],
        layout: 'radio',
      },
      initialValue: 'draft',
      validation: Rule =>
        Rule.required().custom(value =>
          typeof value === 'string' &&
          (ALLOWED_RESOURCE_EDITORIAL_STATUSES as readonly string[]).includes(value)
            ? true
            : 'Editorial status must be draft, inReview, or approved.',
        ),
    }),
    defineField({
      name: 'withdrawn',
      title: 'Withdraw resource',
      type: 'boolean',
      group: 'review',
      initialValue: false,
      description:
        'Immediately suppresses reader delivery without deleting historical editorial records.',
      validation: Rule => Rule.required(),
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
      const doc = value as MinistryResourceValue | undefined
      if (!doc) return true

      const issues: ResourceValidationIssue[] = []

      // 1. Destination kind vs destination payload & presentation mode
      if (doc.resourceKind === 'externalLink') {
        const urlCheck = validateSafeResourceUrl(doc.externalUrl)
        if (urlCheck !== true) {
          issues.push({message: urlCheck, path: ['externalUrl']})
        }
        if (doc.downloadFile?.asset?._ref) {
          issues.push({
            message: 'Remove downloadFile when destination kind is externalLink.',
            path: ['downloadFile'],
          })
        }
        if (doc.presentationMode === 'download') {
          issues.push({
            message: 'External links cannot use presentationMode "download"; choose inApp or external.',
            path: ['presentationMode'],
          })
        }
      } else if (doc.resourceKind === 'downloadableFile') {
        if (!isNonEmptyString(doc.downloadFile?.asset?._ref)) {
          issues.push({
            message: 'Upload or reference a downloadable file asset when destination kind is downloadableFile.',
            path: ['downloadFile'],
          })
        }
        if (isNonEmptyString(doc.externalUrl)) {
          issues.push({
            message: 'Remove externalUrl when destination kind is downloadableFile.',
            path: ['externalUrl'],
          })
        }
        if (doc.presentationMode === 'external') {
          issues.push({
            message: 'Downloadable files cannot use presentationMode "external"; choose download or inApp.',
            path: ['presentationMode'],
          })
        }
      }

      // 2. Accessibility image alt text
      if (
        doc.accessibility?.coverImage?.asset?._ref &&
        !isNonEmptyString(doc.accessibility.coverImage.alt)
      ) {
        issues.push({
          message: 'Alternative text is required when a resource thumbnail image is present.',
          path: ['accessibility', 'coverImage', 'alt'],
        })
      }

      // 3. Approval gates (destination, accessibility, rights, truthful review)
      if (doc.editorialStatus === 'approved') {
        if (doc.destinationApproved !== true) {
          issues.push({
            message: 'Confirm destination safety & suitability before marking this resource approved.',
            path: ['destinationApproved'],
          })
        }
        if (!isNonEmptyString(doc.accessibility?.summary)) {
          issues.push({
            message: 'Provide an accessibility & format note before marking this resource approved.',
            path: ['accessibility', 'summary'],
          })
        }
        if (doc.rightsAndAttribution?.usageRightsConfirmed !== true) {
          issues.push({
            message: 'Confirm source & distribution rights before marking this resource approved.',
            path: ['rightsAndAttribution', 'usageRightsConfirmed'],
          })
        }
      }

      issues.push(
        ...validateEditorialReviewGate(doc.editorialStatus, doc.editorialReview, 'resource'),
      )

      return issues.length > 0 ? issues : true
    }),
  orderings: [
    {
      title: 'Title A–Z',
      name: 'titleAsc',
      by: [{field: 'title', direction: 'asc'}],
    },
  ],
  preview: {
    select: {
      title: 'title',
      resourceKind: 'resourceKind',
      editorialStatus: 'editorialStatus',
      withdrawn: 'withdrawn',
      media: 'accessibility.coverImage',
    },
    prepare({title, resourceKind, editorialStatus, withdrawn, media}) {
      const subtitleParts = [
        resourceKind === 'downloadableFile' ? 'Downloadable file' : 'External link',
        typeof editorialStatus === 'string' && editorialStatus ? editorialStatus : 'draft',
        withdrawn ? 'WITHDRAWN' : null,
      ].filter(Boolean)
      return {
        title: (typeof title === 'string' && title.trim()) || 'Untitled ministry resource',
        subtitle: subtitleParts.join(' · '),
        media,
      }
    },
  },
})
