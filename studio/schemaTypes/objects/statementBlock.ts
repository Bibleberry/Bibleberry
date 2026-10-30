import {defineField, defineType} from 'sanity'

export const statementBlock = defineType({
  name: 'statementBlock',
  title: 'Key statement',
  type: 'object',
  fields: [
    defineField({name: 'text', title: 'Statement', type: 'text', rows: 3, validation: Rule => Rule.required()}),
    defineField({name: 'label', title: 'Small label', type: 'string', initialValue: 'Alexis’s teaching'}),
  ],
  preview: {
    select: {title: 'text', subtitle: 'label'},
  },
})
