import {defineArrayMember, defineField, defineType} from 'sanity'

export const prayerBlock = defineType({
  name: 'prayerBlock',
  title: 'Authored prayer',
  type: 'object',
  fields: [defineField({
    name: 'paragraphs',
    title: 'Prayer paragraphs',
    type: 'array',
    description: 'Preserve Alexis’s authored prayer without AI replacement.',
    of: [defineArrayMember({type: 'text', rows: 4})],
    validation: Rule => Rule.required().min(1),
  })],
  preview: {
    select: {paragraphs: 'paragraphs'},
    prepare({paragraphs}) {
      return {title: paragraphs?.[0] || 'Empty prayer', subtitle: 'Authored prayer'}
    },
  },
})
