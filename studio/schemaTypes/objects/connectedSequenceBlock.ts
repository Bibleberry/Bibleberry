import {defineArrayMember, defineField, defineType} from 'sanity'
import {reviewStatusField} from '../fields'

type SequenceValue = {cycle?: boolean; returnCaption?: string}

export const connectedSequenceBlock = defineType({
  name: 'connectedSequenceBlock',
  title: 'Connected teaching sequence',
  type: 'object',
  fields: [
    defineField({
      name: 'steps',
      title: 'Ordered steps',
      type: 'array',
      of: [defineArrayMember({type: 'sequenceStep'})],
      validation: Rule => Rule.required().min(2),
    }),
    defineField({name: 'cycle', title: 'Return to the first step', type: 'boolean', initialValue: false}),
    defineField({name: 'returnCaption', title: 'Return caption', type: 'string', description: 'Required when the sequence forms a cycle.'}),
    defineField({name: 'conclusion', title: 'Concluding question or statement', type: 'text', rows: 2}),
    reviewStatusField(),
  ],
  validation: Rule => Rule.custom((value) => {
    const sequence = value as SequenceValue | undefined
    if (sequence?.cycle && !sequence.returnCaption?.trim()) return 'Add a return caption for this cycle.'
    return true
  }),
  preview: {
    select: {steps: 'steps', reviewStatus: 'reviewStatus'},
    prepare({steps, reviewStatus}) {
      return {
        title: steps?.map((step: {title?: string}) => step.title).filter(Boolean).join(' → ') || 'Connected sequence',
        subtitle: reviewStatus === 'approved' ? 'Approved' : 'Proposed · Review required',
      }
    },
  },
})
