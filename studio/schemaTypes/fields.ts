import {defineArrayMember, defineField} from 'sanity'

export const reviewStatusField = () => defineField({
  name: 'reviewStatus',
  title: 'Editorial review status',
  type: 'string',
  description: 'Proposed adaptations remain unpublished until Alexis reviews and approves them.',
  options: {
    list: [
      {title: 'Proposed — needs Alexis’s review', value: 'proposed'},
      {title: 'Approved by Alexis', value: 'approved'},
    ],
    layout: 'radio',
  },
  initialValue: 'proposed',
  validation: Rule => Rule.required(),
})

export const portableTextField = (name = 'body', title = 'Body') => defineField({
  name,
  title,
  type: 'array',
  of: [defineArrayMember({
    type: 'block',
    styles: [
      {title: 'Normal', value: 'normal'},
      {title: 'Heading 2', value: 'h2'},
      {title: 'Heading 3', value: 'h3'},
      {title: 'Quotation', value: 'blockquote'},
    ],
    lists: [
      {title: 'Bulleted list', value: 'bullet'},
      {title: 'Numbered list', value: 'number'},
    ],
    marks: {
      decorators: [
        {title: 'Strong', value: 'strong'},
        {title: 'Emphasis', value: 'em'},
      ],
      annotations: [defineArrayMember({
        name: 'link',
        title: 'External link',
        type: 'object',
        fields: [defineField({
          name: 'href',
          title: 'URL',
          type: 'url',
          validation: Rule => Rule.required().uri({scheme: ['http', 'https']}),
        })],
      })],
    },
  })],
  validation: Rule => Rule.required().min(1),
})
