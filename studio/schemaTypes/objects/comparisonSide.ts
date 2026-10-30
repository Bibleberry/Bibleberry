import {defineField, defineType} from 'sanity'
import {portableTextField} from '../fields'

export const comparisonSide = defineType({
  name: 'comparisonSide',
  title: 'Comparison side',
  type: 'object',
  fields: [
    defineField({name: 'title', title: 'Label', type: 'string', validation: Rule => Rule.required()}),
    portableTextField('body', 'Explanation'),
  ],
})
