import {defineArrayMember, defineField, defineType} from 'sanity'
import {SLUG_TOKEN_PATTERN} from '../monthlyHelpers'
import {
  ALLOWED_RESOURCE_EDITORIAL_STATUSES,
  type EditorialReviewShape,
  inspectResourceReferences,
  isNonEmptyString,
  type ResourceValidationIssue,
  validateEditorialReviewGate,
} from '../resourceHelpers'

type ResourceSectionValue = {
  title?: unknown
  slug?: {current?: unknown}
  description?: unknown
  sortOrder?: unknown
  resources?: Array<{_ref?: unknown}>
  editorialStatus?: unknown
  withdrawn?: unknown
  editorialReview?: EditorialReviewShape
}

type PublishedResourceRow = {
  _id: string
  editorialStatus?: string
  withdrawn?: boolean
}

export const resourceSection = defineType({
  name: 'resourceSection',
  title: 'Resource section',
  type: 'document',
  description:
    'Editorially managed section/collection for organizing ministry resources with editable names, descriptions, and manual ordering.',
  groups: [
    {name: 'section', title: 'Section details & order', default: true},
    {name: 'resources', title: 'Curated resources'},
    {name: 'review', title: 'Editorial review & status'},
  ],
  fields: [
    defineField({
      name: 'title',
      title: 'Section name',
      type: 'string',
      group: 'section',
      description: 'Editable reader-facing section heading (for example, "Study Guides").',
      validation: Rule =>
        Rule.required().custom(value =>
          isNonEmptyString(value) ? true : 'Provide a non-empty section name.',
        ),
    }),
    defineField({
      name: 'slug',
      title: 'Stable slug',
      type: 'slug',
      group: 'section',
      options: {source: 'title', maxLength: 96},
      description: 'Lowercase hyphenated identifier (for example, study-guides).',
      validation: Rule =>
        Rule.required().custom(value => {
          const current = (value as {current?: unknown} | undefined)?.current
          if (typeof current !== 'string' || !SLUG_TOKEN_PATTERN.test(current)) {
            return 'Slug must be a lowercase hyphenated token (for example, study-guides).'
          }
          return true
        }),
    }),
    defineField({
      name: 'description',
      title: 'Section description',
      type: 'text',
      rows: 3,
      group: 'section',
      description: 'Editable summary explaining the resources gathered in this section.',
      validation: Rule =>
        Rule.required().custom(value =>
          isNonEmptyString(value) ? true : 'Provide a non-empty section description.',
        ),
    }),
    defineField({
      name: 'sortOrder',
      title: 'Manual section order',
      type: 'number',
      group: 'section',
      description: 'Positive integer controlling the manual display order of sections (1, 2, 3...).',
      initialValue: 1,
      validation: Rule => Rule.required().integer().min(1),
    }),
    defineField({
      name: 'resources',
      title: 'Ordered resources',
      type: 'array',
      group: 'resources',
      description:
        'Manually ordered list of ministry resources in this section. Weak references prevent circular publish locks.',
      of: [
        defineArrayMember({
          type: 'reference',
          to: [{type: 'ministryResource'}],
          weak: true,
        }),
      ],
      initialValue: [],
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
          {title: 'Approved (ready for reader catalog)', value: 'approved'},
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
      title: 'Withdraw section',
      type: 'boolean',
      group: 'review',
      initialValue: false,
      description:
        'Immediately suppresses reader delivery of this section without deleting historical records.',
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
    Rule.custom(async (value, context) => {
      const doc = value as ResourceSectionValue | undefined
      if (!doc) return true

      const issues: ResourceValidationIssue[] = []

      // 1. Inspect ordered resource references for blanks, duplicates, and draft refs
      const {uniqueBaseRefs, duplicateIndices, draftIndices, invalidIndices} =
        inspectResourceReferences(doc.resources)

      for (const index of invalidIndices) {
        issues.push({
          message: 'Select a valid ministryResource reference or remove the empty entry.',
          path: ['resources', index],
        })
      }

      for (const dup of duplicateIndices) {
        issues.push({
          message: `Duplicate resource reference "${dup.baseRef}" in this section.`,
          path: ['resources', dup.index],
        })
      }

      if (doc.editorialStatus === 'approved') {
        for (const draft of draftIndices) {
          issues.push({
            message: `Draft reference "${draft.ref}" cannot be linked in an approved resource section.`,
            path: ['resources', draft.index],
          })
        }

        if (doc.withdrawn !== true && uniqueBaseRefs.length === 0) {
          issues.push({
            message: 'Include at least one approved ministry resource before approving a non-withdrawn section.',
            path: ['resources'],
          })
        }
      }

      // 2. Truthful editorial review gate
      issues.push(
        ...validateEditorialReviewGate(doc.editorialStatus, doc.editorialReview, 'resource section'),
      )

      // 3. Fail-closed published-perspective check for approved, non-withdrawn sections
      if (doc.editorialStatus === 'approved' && doc.withdrawn !== true && uniqueBaseRefs.length > 0) {
        const baseClient =
          typeof context.getClient === 'function'
            ? context.getClient({apiVersion: '2026-11-01'})
            : null

        if (!baseClient || typeof baseClient.withConfig !== 'function') {
          issues.push({
            message:
              'Fail-closed: An authenticated Sanity client supporting perspective: "published" is required to verify referenced published resources.',
            path: ['resources'],
          })
        } else {
          const publishedClient = baseClient.withConfig({perspective: 'published'})
          if (typeof publishedClient?.fetch !== 'function') {
            issues.push({
              message:
                'Fail-closed: Configured published-perspective Sanity client is required before approving this resource section.',
              path: ['resources'],
            })
          } else {
            try {
              const rows = await publishedClient.fetch<PublishedResourceRow[]>(
                `*[_type == "ministryResource" && _id in $ids]{_id, editorialStatus, withdrawn}`,
                {ids: uniqueBaseRefs},
              )
              const byId = new Map((Array.isArray(rows) ? rows : []).map(r => [r._id, r]))
              const refs = Array.isArray(doc.resources) ? doc.resources : []

              for (let index = 0; index < refs.length; index += 1) {
                const refVal = refs[index]?._ref
                const rawRef = typeof refVal === 'string' ? refVal.trim() : ''
                if (!rawRef || rawRef.startsWith('drafts.')) continue
                const row = byId.get(rawRef)
                if (!row) {
                  issues.push({
                    message: `Referenced resource "${rawRef}" was not found in the published Sanity perspective. Publish it before approving this section.`,
                    path: ['resources', index],
                  })
                  continue
                }
                if (row.editorialStatus !== 'approved') {
                  issues.push({
                    message: `Referenced resource "${rawRef}" must have editorialStatus "approved" before inclusion in an approved section.`,
                    path: ['resources', index],
                  })
                }
                if (row.withdrawn === true) {
                  issues.push({
                    message: `Referenced resource "${rawRef}" is withdrawn and cannot be included in an approved section.`,
                    path: ['resources', index],
                  })
                }
              }
            } catch {
              issues.push({
                message:
                  'Fail-closed: Unable to reach Sanity (published perspective) to verify referenced ministry resources.',
                path: ['resources'],
              })
            }
          }
        }
      }

      return issues.length > 0 ? issues : true
    }),
  orderings: [
    {
      title: 'Manual section order',
      name: 'sortOrderAsc',
      by: [
        {field: 'sortOrder', direction: 'asc'},
        {field: 'title', direction: 'asc'},
      ],
    },
    {
      title: 'Section name A–Z',
      name: 'titleAsc',
      by: [{field: 'title', direction: 'asc'}],
    },
  ],
  preview: {
    select: {
      title: 'title',
      sortOrder: 'sortOrder',
      resources: 'resources',
      editorialStatus: 'editorialStatus',
      withdrawn: 'withdrawn',
    },
    prepare({title, sortOrder, resources, editorialStatus, withdrawn}) {
      const count = Array.isArray(resources) ? resources.length : 0
      const orderLabel = typeof sortOrder === 'number' ? `Order ${sortOrder}` : 'Unordered'
      const subtitleParts = [
        orderLabel,
        `${count} ${count === 1 ? 'resource' : 'resources'}`,
        typeof editorialStatus === 'string' && editorialStatus ? editorialStatus : 'draft',
        withdrawn ? 'WITHDRAWN' : null,
      ].filter(Boolean)
      return {
        title: (typeof title === 'string' && title.trim()) || 'Untitled resource section',
        subtitle: subtitleParts.join(' · '),
      }
    },
  },
})
