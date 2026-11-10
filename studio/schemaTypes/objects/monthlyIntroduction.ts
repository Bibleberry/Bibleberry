import {defineArrayMember, defineField, defineType} from 'sanity'

export const monthlyIntroduction = defineType({
  name: 'monthlyIntroduction',
  title: 'Monthly introduction & welcome',
  type: 'object',
  fields: [
    defineField({
      name: 'previewScreens',
      title: 'Advance preview & introduction screens',
      type: 'array',
      description:
        'Shown during the advance preview window (28th / Feb 27) and when introducing the month. At least one screen is required before approval or scheduling; no maximum screen limit.',
      of: [defineArrayMember({type: 'introductionScreen'})],
    }),
    defineField({
      name: 'welcomeScreen',
      title: 'Month-start Welcome screen',
      type: 'introductionScreen',
      description:
        'Shown once the publication month starts on the 1st; withheld during advance preview. Required before approval or scheduling.',
    }),
  ],
})
