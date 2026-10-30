import {defineField, defineType} from 'sanity'

export const reflectionChoice = defineType({
  name: 'reflectionChoice',
  title: 'Reflection choice',
  type: 'object',
  fields: [
    defineField({name: 'label', title: 'Choice label', type: 'string', validation: Rule => Rule.required()}),
    defineField({name: 'prompt', title: 'Revealed prompt', type: 'text', rows: 3, validation: Rule => Rule.required()}),
  ],
  preview: {select: {title: 'label', subtitle: 'prompt'}},
})
