import {defineField, defineType} from 'sanity'
import {SHA256_PATTERN} from '../monthlyHelpers'

export const newsSourceSnapshot = defineType({
  name: 'newsSourceSnapshot',
  title: 'Preview source snapshot',
  type: 'object',
  description: 'Read-only technical snapshot of the related month when preview copy was generated.',
  readOnly: true,
  fields: [
    defineField({
      name: 'monthTitle',
      title: 'Month title snapshot',
      type: 'string',
    }),
    defineField({
      name: 'monthSummary',
      title: 'Month summary snapshot',
      type: 'text',
      rows: 2,
    }),
    defineField({
      name: 'sourceDigestSha256',
      title: 'Source digest SHA-256',
      type: 'string',
      validation: Rule =>
        Rule.custom(value => {
          if (value === undefined || value === null || value === '') return true
          if (typeof value === 'string' && SHA256_PATTERN.test(value)) return true
          return 'Source digest must be a lowercase 64-character SHA-256 hex digest.'
        }),
    }),
    defineField({
      name: 'generatedAt',
      title: 'Generated at',
      type: 'datetime',
    }),
  ],
})
