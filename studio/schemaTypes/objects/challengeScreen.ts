import {defineArrayMember, defineField, defineType} from 'sanity'

export const challengeScreen = defineType({
  name: 'challengeScreen',
  title: 'Challenge screen',
  type: 'object',
  fields: [
    defineField({name: 'screenLabel', title: 'Small editorial label', type: 'string', description: 'For example, Encounter, Clarify, Hope, or Pray.'}),
    defineField({name: 'heading', title: 'Screen heading', type: 'string'}),
    defineField({
      name: 'blocks',
      title: 'Ordered content blocks',
      type: 'array',
      description: 'Drag to reorder. Optional studies and reflections never become completion requirements.',
      of: [
        defineArrayMember({type: 'scriptureBlock'}),
        defineArrayMember({type: 'richTextBlock'}),
        defineArrayMember({type: 'statementBlock'}),
        defineArrayMember({type: 'comparisonBlock'}),
        defineArrayMember({type: 'visualCardsBlock'}),
        defineArrayMember({type: 'connectedSequenceBlock'}),
        defineArrayMember({type: 'reflectionBlock'}),
        defineArrayMember({type: 'optionalStudyBlock'}),
        defineArrayMember({type: 'prayerBlock'}),
      ],
      validation: Rule => Rule.required().min(1),
    }),
  ],
  preview: {
    select: {heading: 'heading', screenLabel: 'screenLabel', blocks: 'blocks'},
    prepare({heading, screenLabel, blocks}) {
      return {
        title: heading || 'Untitled screen',
        subtitle: `${screenLabel ? `${screenLabel} · ` : ''}${blocks?.length || 0} content blocks`,
      }
    },
  },
})
