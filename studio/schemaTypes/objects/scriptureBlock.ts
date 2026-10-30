import {defineField, defineType} from 'sanity'

export const scriptureBlock = defineType({
  name: 'scriptureBlock',
  title: 'Scripture',
  type: 'object',
  fields: [defineField({
    name: 'scripture',
    title: 'Scripture',
    type: 'scriptureReference',
    validation: Rule => Rule.required(),
  })],
  preview: {
    select: {title: 'scripture.reference', subtitle: 'scripture.translation'},
  },
})
