import {defineField, defineType} from 'sanity'
import {ALLOWED_REVIEWER_ROLES} from '../monthlyHelpers'

type MonthlyEditorialReviewValue = {
  reviewedBy?: unknown
  reviewerRole?: unknown
  reviewedAt?: unknown
}

export const monthlyEditorialReview = defineType({
  name: 'monthlyEditorialReview',
  title: 'Editorial review',
  type: 'object',
  description:
    'Truthful editorial review attribution for monthly publications and ministry news. Technical fixtures must use technical_synthetic rather than claiming Alexis theological review.',
  fields: [
    defineField({
      name: 'reviewedBy',
      title: 'Reviewed by',
      type: 'string',
      description: 'Name and role of the approving reviewer.',
    }),
    defineField({
      name: 'reviewerRole',
      title: 'Reviewer role',
      type: 'string',
      options: {
        list: [
          {
            title: 'Theological & editorial review (Alexis / editorial authority)',
            value: 'theological_editorial',
          },
          {
            title: 'Technical / synthetic fixture review (Aaron / engineering)',
            value: 'technical_synthetic',
          },
        ],
        layout: 'radio',
      },
      validation: Rule =>
        Rule.custom(value => {
          if (value === undefined || value === null || value === '') return true
          if (
            typeof value === 'string' &&
            (ALLOWED_REVIEWER_ROLES as readonly string[]).includes(value)
          ) {
            return true
          }
          return 'Reviewer role must be theological_editorial or technical_synthetic.'
        }),
    }),
    defineField({
      name: 'reviewedAt',
      title: 'Reviewed at',
      type: 'datetime',
      validation: Rule =>
        Rule.custom(value => {
          if (value === undefined || value === null || value === '') return true
          if (typeof value === 'string' && Number.isFinite(Date.parse(value))) return true
          return 'Reviewed at must be a valid ISO date-time.'
        }),
    }),
    defineField({
      name: 'reviewNotes',
      title: 'Internal review notes',
      type: 'text',
      rows: 4,
    }),
  ],
  validation: Rule =>
    Rule.custom(value => {
      const review = value as MonthlyEditorialReviewValue | undefined
      if (!review) return true
      if (
        review.reviewerRole !== undefined &&
        review.reviewerRole !== null &&
        (typeof review.reviewerRole !== 'string' ||
          !(ALLOWED_REVIEWER_ROLES as readonly string[]).includes(review.reviewerRole))
      ) {
        return {
          message: 'Reviewer role must be theological_editorial or technical_synthetic.',
          path: ['reviewerRole'],
        }
      }
      return true
    }),
})
