import {defineField, defineType} from 'sanity'

type EditorialReviewValue = {
  adaptationReviewed?: boolean
  reviewedBy?: string
  reviewedAt?: string
}

export const editorialReview = defineType({
  name: 'editorialReview',
  title: 'Editorial review',
  type: 'object',
  description: 'Internal provenance only. These fields are not a replacement for Sanity draft/publish state and must be excluded from public projections.',
  fields: [
    defineField({name: 'sourceTitle', title: 'Source title', type: 'string', validation: Rule => Rule.required()}),
    defineField({name: 'sourceRevision', title: 'Source revision or location', type: 'string'}),
    defineField({
      name: 'adaptationReviewed',
      title: 'Editorial adaptation reviewed and approved',
      type: 'boolean',
      initialValue: false,
      validation: Rule => Rule.required(),
    }),
    defineField({name: 'reviewedBy', title: 'Reviewed by', type: 'string', description: 'Name and role.'}),
    defineField({name: 'reviewedAt', title: 'Reviewed at', type: 'datetime'}),
    defineField({name: 'reviewNotes', title: 'Internal review notes', type: 'text', rows: 5}),
  ],
  validation: Rule => Rule.custom((value) => {
    const review = value as EditorialReviewValue | undefined
    if (!review?.adaptationReviewed) return true
    if (!review.reviewedBy?.trim() || !review.reviewedAt) {
      return 'When adaptation review is complete, record who reviewed it and when.'
    }
    return true
  }),
})
