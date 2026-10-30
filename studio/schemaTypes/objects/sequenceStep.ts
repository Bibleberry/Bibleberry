import {defineField, defineType} from 'sanity'

export const sequenceStep = defineType({
  name: 'sequenceStep',
  title: 'Sequence step',
  type: 'object',
  fields: [
    defineField({name: 'title', title: 'Heading', type: 'string', validation: Rule => Rule.required()}),
    defineField({name: 'body', title: 'Explanation', type: 'text', rows: 4, validation: Rule => Rule.required()}),
  ],
  preview: {select: {title: 'title', subtitle: 'body'}},
})
