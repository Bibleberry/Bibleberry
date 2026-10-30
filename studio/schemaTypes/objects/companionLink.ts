import {defineField, defineType} from 'sanity'

export const companionLink = defineType({
  name: 'companionLink',
  title: 'Companion link or related metadata',
  type: 'object',
  fields: [
    defineField({
      name: 'provider',
      title: 'Provider',
      type: 'string',
      options: {list: ['social', 'patreon', 'podcast', 'walkingReel', 'youtube', 'other']},
      initialValue: 'other',
      validation: Rule => Rule.required(),
    }),
    defineField({name: 'label', title: 'Label', type: 'string', validation: Rule => Rule.required()}),
    defineField({name: 'description', title: 'Source wording or description', type: 'text', rows: 4}),
    defineField({
      name: 'url',
      title: 'Verified URL',
      type: 'url',
      description: 'Optional. Never invent a media or social URL.',
      validation: Rule => Rule.uri({scheme: ['http', 'https']}),
    }),
    defineField({name: 'availability', title: 'Availability note', type: 'string', description: 'For example, “Editorial metadata only · No link supplied”.'}),
  ],
  preview: {
    select: {title: 'label', subtitle: 'provider'},
  },
})
