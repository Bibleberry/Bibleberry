import {defineArrayMember, defineField, defineType} from 'sanity'

export const introductionScreen = defineType({
  name: 'introductionScreen',
  title: 'Introduction screen',
  type: 'object',
  description:
    'Flexible monthly introduction or welcome screen reusing approved teaching content blocks. No editorial length or screen count caps are imposed.',
  fields: [
    defineField({
      name: 'screenLabel',
      title: 'Small editorial label',
      type: 'string',
      description: 'For example, Coming in March, March Teaching, or Welcome.',
    }),
    defineField({
      name: 'heading',
      title: 'Screen heading',
      type: 'string',
    }),
    defineField({
      name: 'ctaLabel',
      title: 'Call-to-action button label',
      type: 'string',
      description: 'Optional action label used primarily on the Welcome screen (for example, Open March Calendar).',
    }),
    defineField({
      name: 'blocks',
      title: 'Content blocks',
      type: 'array',
      description: 'Substance governs length; add as many teaching, Scripture, and statement blocks as needed.',
      of: [
        defineArrayMember({type: 'statementBlock'}),
        defineArrayMember({type: 'richTextBlock'}),
        defineArrayMember({type: 'scriptureBlock'}),
      ],
      validation: Rule => Rule.required().min(1),
    }),
  ],
  preview: {
    select: {
      heading: 'heading',
      screenLabel: 'screenLabel',
      blocks: 'blocks',
    },
    prepare({heading, screenLabel, blocks}) {
      return {
        title: heading || screenLabel || 'Untitled intro screen',
        subtitle: `${screenLabel ? `${screenLabel} · ` : ''}${blocks?.length || 0} content block${blocks?.length === 1 ? '' : 's'}`,
      }
    },
  },
})
