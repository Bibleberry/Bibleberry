import {defineField, defineType} from 'sanity'

type ScriptureValue = {
  textStatus?: 'provided' | 'referenceOnly'
  practiceStatus?: 'configured' | 'notConfigured'
  passage?: string
  usageRightsConfirmed?: boolean
}

export const scriptureReference = defineType({
  name: 'scriptureReference',
  title: 'Scripture reference',
  type: 'object',
  fields: [
    defineField({
      name: 'reference',
      title: 'Reference',
      type: 'string',
      description: 'For example, 1 Thessalonians 5:16–18.',
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'translation',
      title: 'Translation or edition',
      type: 'string',
      description: 'Use “Not configured” when only a citation is available.',
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'textStatus',
      title: 'Text availability',
      type: 'string',
      options: {list: [
        {title: 'Reference only', value: 'referenceOnly'},
        {title: 'Text provided', value: 'provided'},
      ], layout: 'radio'},
      initialValue: 'referenceOnly',
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'passage',
      title: 'Licensed passage text',
      type: 'text',
      rows: 4,
      description: 'Leave empty until app quotation rights are confirmed. Do not infer permission from a source manuscript.',
    }),
    defineField({
      name: 'usageRightsConfirmed',
      title: 'App usage rights confirmed',
      type: 'boolean',
      description: 'Required before passage text can be published.',
      initialValue: false,
    }),
    defineField({
      name: 'practiceStatus',
      title: 'Memorization practice',
      type: 'string',
      options: {list: [
        {title: 'Not configured', value: 'notConfigured'},
        {title: 'Configured', value: 'configured'},
      ], layout: 'radio'},
      initialValue: 'notConfigured',
      validation: Rule => Rule.required(),
    }),
  ],
  validation: Rule => Rule.custom((value) => {
    const scripture = value as ScriptureValue | undefined
    if (!scripture) return true
    if (scripture.textStatus === 'provided' && !scripture.passage?.trim()) {
      return 'Provide the passage text or change text availability to reference only.'
    }
    if (scripture.textStatus === 'referenceOnly' && scripture.passage?.trim()) {
      return 'Passage text is present while text availability is reference only.'
    }
    if (scripture.passage?.trim() && !scripture.usageRightsConfirmed) {
      return 'Confirm app quotation rights before publishing passage text.'
    }
    if (scripture.practiceStatus === 'configured' && (scripture.textStatus !== 'provided' || !scripture.passage?.trim())) {
      return 'Memorization practice requires provided, rights-cleared passage text.'
    }
    return true
  }),
  preview: {
    select: {title: 'reference', subtitle: 'translation'},
  },
})
