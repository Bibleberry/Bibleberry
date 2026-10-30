import {defineField, defineType} from 'sanity'

type SeriesValue = {startDate?: string; endDate?: string}

export const challengeSeries = defineType({
  name: 'challengeSeries',
  title: 'Challenge series',
  type: 'document',
  fields: [
    defineField({name: 'title', title: 'Title', type: 'string', validation: Rule => Rule.required()}),
    defineField({
      name: 'slug',
      title: 'Stable slug',
      type: 'slug',
      options: {source: 'title', maxLength: 96},
      validation: Rule => Rule.required(),
    }),
    defineField({name: 'description', title: 'Audience-facing introduction', type: 'text', rows: 4}),
    defineField({name: 'startDate', title: 'Catalog start date', type: 'date'}),
    defineField({name: 'endDate', title: 'Catalog end date', type: 'date'}),
    defineField({
      name: 'coverImage',
      title: 'Optional cover image',
      type: 'image',
      options: {hotspot: true},
      fields: [defineField({name: 'alt', title: 'Alternative text', type: 'string'})],
    }),
  ],
  validation: Rule => Rule.custom((value) => {
    const series = value as SeriesValue | undefined
    if (series?.startDate && series.endDate && series.endDate < series.startDate) {
      return 'The catalog end date cannot be before the start date.'
    }
    return true
  }),
  preview: {select: {title: 'title', subtitle: 'slug.current', media: 'coverImage'}},
})
