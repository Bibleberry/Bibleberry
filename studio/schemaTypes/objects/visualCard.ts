import {defineField, defineType} from 'sanity'

export const visualCard = defineType({
  name: 'visualCard',
  title: 'Visual card',
  type: 'object',
  fields: [
    defineField({name: 'title', title: 'Heading', type: 'string', validation: Rule => Rule.required()}),
    defineField({name: 'body', title: 'Explanation', type: 'text', rows: 3}),
  ],
  preview: {select: {title: 'title', subtitle: 'body'}},
})
