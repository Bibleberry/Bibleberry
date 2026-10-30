import {defineField, defineType} from 'sanity'
import {reviewStatusField} from '../fields'

export const comparisonBlock = defineType({
  name: 'comparisonBlock',
  title: 'Conceptual comparison',
  type: 'object',
  fields: [
    defineField({name: 'left', title: 'First concept', type: 'comparisonSide', validation: Rule => Rule.required()}),
    defineField({name: 'right', title: 'Second concept', type: 'comparisonSide', validation: Rule => Rule.required()}),
    defineField({name: 'footer', title: 'Concluding explanation', type: 'text', rows: 4}),
    reviewStatusField(),
  ],
  preview: {
    select: {left: 'left.title', right: 'right.title', reviewStatus: 'reviewStatus'},
    prepare({left, right, reviewStatus}) {
      return {title: `Comparison — ${left || 'First'} vs. ${right || 'Second'}`, subtitle: reviewStatus === 'approved' ? 'Approved' : 'Proposed · Review required'}
    },
  },
})
