import {defineArrayMember, defineField, defineType} from 'sanity'

type ChallengeValue = {
  editorialReview?: {adaptationReviewed?: boolean}
  screens?: {blocks?: {_type?: string; reviewStatus?: string}[]}[]
}

const reviewedBlockTypes = new Set([
  'comparisonBlock',
  'visualCardsBlock',
  'connectedSequenceBlock',
  'reflectionBlock',
  'optionalStudyBlock',
])

export const challenge = defineType({
  name: 'challenge',
  title: 'Challenge',
  type: 'document',
  groups: [
    {name: 'content', title: 'Challenge content', default: true},
    {name: 'publishing', title: 'Series & release'},
    {name: 'review', title: 'Editorial review'},
  ],
  fields: [
    defineField({name: 'title', title: 'Title', type: 'string', group: 'content', validation: Rule => Rule.required()}),
    defineField({
      name: 'slug',
      title: 'Stable immutable slug',
      type: 'slug',
      group: 'publishing',
      options: {source: 'title', maxLength: 96},
      description: 'Recommended pilot slug: 2026-11-02-rejoice-always. Do not change after reader progress exists.',
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'challengeType',
      title: 'Challenge type',
      type: 'string',
      group: 'content',
      options: {list: [
        {title: 'Biblical teaching', value: 'teaching'},
        {title: 'Spiritual discipline', value: 'discipline'},
        {title: 'Reflection', value: 'reflection'},
        {title: 'Memorization', value: 'memorization'},
      ]},
      initialValue: 'teaching',
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'series',
      title: 'Series',
      type: 'reference',
      to: [{type: 'challengeSeries'}],
      weak: true,
      group: 'publishing',
      description: 'Allows draft-only pilot editing. Publish the series before publishing the Challenge.',
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'sequence',
      title: 'Sequence within series',
      type: 'number',
      group: 'publishing',
      description: 'Deliberate editorial order; do not infer adjacency from consecutive dates.',
      validation: Rule => Rule.required().integer().min(1),
    }),
    defineField({
      name: 'releaseAt',
      title: 'Reader release time',
      type: 'datetime',
      group: 'publishing',
      description: 'Choose an explicit time and offset before publication. This controls catalog availability only; it is not an embargo or scheduler.',
      validation: Rule => Rule.required(),
    }),
    defineField({name: 'summary', title: 'Optional archive summary', type: 'text', rows: 3, group: 'publishing'}),
    defineField({
      name: 'primaryScripture',
      title: 'Primary Scripture',
      type: 'scriptureReference',
      group: 'content',
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'screens',
      title: 'Guided screens',
      type: 'array',
      group: 'content',
      description: 'Teaching governs the experience. Add or reorder screens as needed; no fixed screen count.',
      of: [defineArrayMember({type: 'challengeScreen'})],
      validation: Rule => Rule.required().min(1),
    }),
    defineField({
      name: 'companionLinks',
      title: 'Companion links and related metadata',
      type: 'array',
      group: 'publishing',
      description: 'Never part of required Challenge completion.',
      of: [defineArrayMember({type: 'companionLink'})],
    }),
    defineField({
      name: 'editorialReview',
      title: 'Editorial review',
      type: 'editorialReview',
      group: 'review',
      validation: Rule => Rule.required(),
    }),
  ],
  validation: Rule => Rule.custom((value) => {
    const document = value as ChallengeValue | undefined
    const issues: {message: string; path: (string)[]}[] = []
    if (!document?.editorialReview?.adaptationReviewed) {
      issues.push({
        message: 'Alexis must review the adapted Challenge before publication.',
        path: ['editorialReview', 'adaptationReviewed'],
      })
    }
    const proposedCount = document?.screens?.reduce((count, screen) => count + (screen.blocks?.filter(block => reviewedBlockTypes.has(block._type || '') && block.reviewStatus !== 'approved').length || 0), 0) || 0
    if (proposedCount > 0) {
      issues.push({
        message: `${proposedCount} structured editorial block${proposedCount === 1 ? ' is' : 's are'} still awaiting Alexis’s approval.`,
        path: ['screens'],
      })
    }
    return issues.length > 0 ? issues : true
  }),
  orderings: [
    {title: 'Series sequence', name: 'sequenceAsc', by: [{field: 'sequence', direction: 'asc'}]},
    {title: 'Release time, newest first', name: 'releaseDesc', by: [{field: 'releaseAt', direction: 'desc'}]},
  ],
  preview: {
    select: {title: 'title', challengeType: 'challengeType', sequence: 'sequence', reviewed: 'editorialReview.adaptationReviewed'},
    prepare({title, challengeType, sequence, reviewed}) {
      return {
        title: title || 'Untitled Challenge',
        subtitle: `${challengeType || 'challenge'}${sequence ? ` · Sequence ${sequence}` : ''} · ${reviewed ? 'Reviewed' : 'Review pending'}`,
      }
    },
  },
})
