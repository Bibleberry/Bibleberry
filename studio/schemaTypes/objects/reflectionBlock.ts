import {defineArrayMember, defineField, defineType} from 'sanity'
import {reviewStatusField} from '../fields'

export const reflectionBlock = defineType({
  name: 'reflectionBlock',
  title: 'Optional reflection or practice choice',
  type: 'object',
  description: 'Choices reveal local prompts only. No private response is stored in Sanity.',
  fields: [
    defineField({name: 'question', title: 'Question or practice invitation', type: 'text', rows: 3, validation: Rule => Rule.required()}),
    defineField({
      name: 'choices',
      title: 'Optional choices',
      type: 'array',
      of: [defineArrayMember({type: 'reflectionChoice'})],
      validation: Rule => Rule.min(2),
    }),
    defineField({name: 'closing', title: 'Closing explanation', type: 'text', rows: 3}),
    reviewStatusField(),
  ],
  preview: {
    select: {title: 'question', reviewStatus: 'reviewStatus'},
    prepare({title, reviewStatus}) {
      return {title: title || 'Reflection', subtitle: reviewStatus === 'approved' ? 'Approved' : 'Proposed · Review required'}
    },
  },
})
