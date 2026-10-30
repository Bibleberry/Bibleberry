import {defineArrayMember, defineField, defineType} from 'sanity'
import {portableTextField, reviewStatusField} from '../fields'

export const optionalStudyBlock = defineType({
  name: 'optionalStudyBlock',
  title: 'Optional deeper study',
  type: 'object',
  description: 'Collapsed and optional in the reader. Proposed research must be approved before publication.',
  fields: [
    defineField({name: 'title', title: 'Study title', type: 'string', validation: Rule => Rule.required()}),
    portableTextField('body', 'Study copy'),
    defineField({
      name: 'scriptures',
      title: 'Related Scripture references',
      type: 'array',
      of: [defineArrayMember({type: 'scriptureReference'})],
    }),
    reviewStatusField(),
  ],
  preview: {
    select: {title: 'title', reviewStatus: 'reviewStatus'},
    prepare({title, reviewStatus}) {
      return {title: title || 'Optional study', subtitle: reviewStatus === 'approved' ? 'Approved optional study' : 'Proposed · Do not publish before review'}
    },
  },
})
